import { Request, Response, Router } from 'express';

interface ServiceDiscoveryPayload {
  name: string;
  version: string;
  endpoints: {
    health: string;
    api: string;
    docs: {
      index: string;
      bundle: string;
      single: string;
    };
  };
  hints: string[];
}

interface ApiDiscoveryPayload {
  message: string;
  docs: {
    list: string;
    single: string;
    llm: string;
  };
  examples: {
    listDocs: string;
    singleDoc: string;
    llmBundle: string;
  };
}

function buildServiceDiscoveryPayload(version: string): ServiceDiscoveryPayload {
  return {
    name: 'fuba-browser',
    version,
    endpoints: {
      health: '/health',
      api: '/api',
      docs: {
        index: '/api/docs',
        bundle: '/api/docs/llm',
        single: '/api/docs/{docId}',
      },
    },
    hints: [
      'Use GET /api/docs to list available documentation IDs.',
      'Use GET /api/docs/{docId}?format=markdown for one document.',
      'Use GET /api/docs/llm?format=markdown for an LLM-ready bundle.',
    ],
  };
}

function buildApiDiscoveryPayload(): ApiDiscoveryPayload {
  return {
    message: 'API discovery entrypoint',
    docs: {
      list: '/api/docs',
      single: '/api/docs/{docId}',
      llm: '/api/docs/llm?format=markdown',
    },
    examples: {
      listDocs: 'curl -s http://localhost:39000/api/docs',
      singleDoc: 'curl -s http://localhost:39000/api/docs/api?format=markdown',
      llmBundle: 'curl -s http://localhost:39000/api/docs/llm?format=markdown',
    },
  };
}

export function discoveryRoutes(version: string): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: buildServiceDiscoveryPayload(version),
    });
  });

  router.get('/api', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: buildApiDiscoveryPayload(),
    });
  });

  return router;
}
