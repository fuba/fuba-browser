import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { discoveryRoutes } from '../server/routes/discovery.js';

describe('Discovery Routes', () => {
  it('returns service discovery at GET /', async () => {
    const app = express();
    app.use(discoveryRoutes('2.0.1'));

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('fuba-browser');
    expect(response.body.data.version).toBe('2.0.1');
    expect(response.body.data.endpoints.docs.index).toBe('/api/docs');
    expect(response.body.data.endpoints.docs.bundle).toBe('/api/docs/llm');
  });

  it('returns API discovery at GET /api', async () => {
    const app = express();
    app.use(discoveryRoutes('2.0.1'));

    const response = await request(app).get('/api');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.docs.list).toBe('/api/docs');
    expect(response.body.data.docs.single).toBe('/api/docs/{docId}');
    expect(response.body.data.docs.llm).toBe('/api/docs/llm?format=markdown');
  });
});
