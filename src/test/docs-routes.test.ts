import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DocsFetcher, docsRoutes } from '../server/routes/docs.js';

interface MockFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}

function createFetchResponse(body: string, status = 200, statusText = 'OK'): MockFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => body,
  };
}

describe('Docs Routes', () => {
  let app: express.Express;
  let fetcher: ReturnType<typeof vi.fn<DocsFetcher>>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    fetcher = vi.fn<DocsFetcher>();
    app.use('/api', docsRoutes({
      baseUrl: 'https://docs.example.com/repo',
      fetcher,
    }));
  });

  it('returns docs index with source URLs', async () => {
    const response = await request(app).get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'api',
          sourceUrl: 'https://docs.example.com/repo/doc/API.md',
        }),
        expect.objectContaining({
          id: 'cli',
          sourceUrl: 'https://docs.example.com/repo/cli/README.md',
        }),
      ])
    );
  });

  it('returns a single document', async () => {
    fetcher.mockResolvedValue(createFetchResponse('# API Doc'));

    const response = await request(app).get('/api/docs/api');

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith('https://docs.example.com/repo/doc/API.md');
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe('api');
    expect(response.body.data.markdown).toBe('# API Doc');
  });

  it('returns 404 for unknown document id', async () => {
    const response = await request(app).get('/api/docs/unknown');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Unknown document id');
  });

  it('returns bundled markdown for llm consumption', async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith('/doc/API.md')) {
        return createFetchResponse('# API');
      }
      if (url.endsWith('/doc/USAGE.md')) {
        return createFetchResponse('# Usage');
      }
      return createFetchResponse('not found', 404, 'Not Found');
    });

    const response = await request(app).get('/api/docs/llm?docs=api,usage');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.documents).toHaveLength(2);
    expect(response.body.data.markdown).toContain('BEGIN DOCUMENT: api');
    expect(response.body.data.markdown).toContain('BEGIN DOCUMENT: usage');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns markdown body directly when format=markdown is specified', async () => {
    fetcher.mockResolvedValue(createFetchResponse('# API Doc'));

    const response = await request(app).get('/api/docs/api?format=markdown');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/markdown');
    expect(response.text).toBe('# API Doc');
  });

  it('returns 502 when upstream document fetch fails', async () => {
    fetcher.mockResolvedValue(createFetchResponse('missing', 404, 'Not Found'));

    const response = await request(app).get('/api/docs/api');

    expect(response.status).toBe(502);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Failed to fetch document');
  });
});
