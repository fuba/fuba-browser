// SPDX-License-Identifier: MIT
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { WebMcpBridge } from '../browser/webmcp.js';
import { webMcpRoutes } from '../server/routes/webmcp.js';

const headers = { Accept: 'application/json, text/event-stream' };
const initialize = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'route-test', version: '1' } },
};

describe('WebMCP HTTP boundary', () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => { await Promise.all(cleanup.splice(0).map(close => close())); });

  function setup(options: Parameters<typeof webMcpRoutes>[1] = {}) {
    const bridge = new WebMcpBridge(() => { throw new Error('No browser page'); });
    const routes = webMcpRoutes(bridge, options);
    cleanup.push(routes.close);
    const app = express();
    app.use(express.json());
    app.use('/mcp', routes.router);
    return request(app);
  }

  it('initializes without a page and enforces session capacity and deletion', async () => {
    const agent = setup({ maxSessions: 1 });
    const initialized = await agent.post('/mcp').set(headers).send(initialize);
    expect(initialized.status).toBe(200);
    expect(initialized.body.result.capabilities.tools.listChanged).toBe(true);
    const id = initialized.headers['mcp-session-id'];
    expect(typeof id).toBe('string');
    expect((await agent.post('/mcp').set(headers).send(initialize)).status).toBe(503);
    expect((await agent.delete('/mcp').set({ ...headers, 'mcp-session-id': id })).status).toBe(200);
    expect((await agent.post('/mcp').set(headers).send(initialize)).status).toBe(200);
  });

  it('requires explicit origins on every HTTP method', async () => {
    const agent = setup({ allowedOrigins: ['https://trusted.example'] });
    for (const method of ['get', 'post', 'delete'] as const) {
      expect((await agent[method]('/mcp').set({ ...headers, Origin: 'https://evil.example' }).send(initialize)).status).toBe(403);
    }
    expect((await agent.post('/mcp').set({ ...headers, Origin: 'https://trusted.example' }).send(initialize)).status).toBe(200);
  });

  it('rejects malformed initialization and never allocates a session for it', async () => {
    const agent = setup({ maxSessions: 1 });
    const malformed = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
    expect((await agent.post('/mcp').set(headers).send(malformed)).status).toBe(400);
    expect((await agent.post('/mcp').set(headers).send(initialize)).status).toBe(200);
    expect((await agent.put('/mcp').set(headers).send(initialize)).status).toBe(405);
  });
});
