// SPDX-License-Identifier: MIT
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WebMcpBridge } from '../browser/webmcp.js';
import { webMcpRoutes } from '../server/routes/webmcp.js';

const enabled = !!process.env.FUBA_BROWSER_EXECUTABLE_PATH;

describe.skipIf(!enabled)('native WebMCP to MCP bridge', () => {
  let browser: Browser;
  let page: Page;
  let server: http.Server;
  let baseUrl: string;
  let client: Client;
  let transport: StreamableHTTPClientTransport;
  let bridgeRoutes: ReturnType<typeof webMcpRoutes>;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.FUBA_BROWSER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--enable-features=WebMCP,WebMCPTesting'],
    });
    page = await browser.newPage();
    const app = express();
    app.use(express.json());
    bridgeRoutes = webMcpRoutes(new WebMcpBridge(() => page), { pollIntervalMs: 20, toolTimeoutMs: 500 });
    app.use('/mcp', bridgeRoutes.router);
    app.get('/fixture', (_req, res) => res.type('html').send('<!doctype html><title>WebMCP fixture</title>'));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    if (client) await client.close();
    await page.goto(`${baseUrl}/fixture`);
    // Register through Chromium's native API rather than a JavaScript shim.
    await page.evaluate(async () => {
      const context = (document as unknown as { modelContext: {
        registerTool: (tool: unknown) => Promise<unknown>;
      } }).modelContext;
      if (!context) throw new Error('Native WebMCP is unavailable');
      await context.registerTool({
        name: 'echo', description: 'Echo input',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
        execute: ({ text }: { text: string }) => {
          document.title = text;
          return { content: [{ type: 'text', text }], structuredContent: { text } };
        },
      });
      await context.registerTool({ name: 'fail', description: 'Throw an error', execute: () => { throw new Error('native failure'); } });
      await context.registerTool({ name: 'slow', description: 'Wait for cancellation', execute: () => new Promise(() => {}) });
    });
    client = new Client({ name: 'webmcp-test', version: '1.0.0' });
    transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    await bridgeRoutes?.close();
    await browser?.close();
    await new Promise<void>(resolve => server?.close(() => resolve()));
  });

  it('lists native tools and forwards arguments and MCP content unchanged', async () => {
    const { tools } = await client.listTools();
    expect(tools.find(tool => tool.name === 'echo')).toMatchObject({
      description: 'Echo input',
      inputSchema: { type: 'object', required: ['text'] },
      _meta: { 'webmcp/origin': baseUrl },
    });
    const result = await client.callTool({ name: 'echo', arguments: { text: 'round trip' } });
    expect(result).toMatchObject({ content: [{ type: 'text', text: 'round trip' }], structuredContent: { text: 'round trip' } });
    expect(await page.title()).toBe('round trip');
  });

  it('validates input before executing page code', async () => {
    await client.listTools();
    const result = await client.callTool({ name: 'echo', arguments: { text: 42 } });
    expect(result.isError).toBe(true);
    expect(await page.title()).toBe('WebMCP fixture');
  });

  it('returns execution failures and timeouts as tool errors', async () => {
    await client.listTools();
    expect((await client.callTool({ name: 'fail' })).isError).toBe(true);
    const timedOut = await client.callTool({ name: 'slow' });
    expect(timedOut.isError).toBe(true);
    expect(JSON.stringify(timedOut)).toMatch(/timed out/i);
  });

  it('notifies clients of navigation and rejects stale tools until rediscovery', async () => {
    await client.listTools();
    const changed = new Promise<void>(resolve => {
      client.setNotificationHandler(ToolListChangedNotificationSchema, () => resolve());
    });
    await page.goto(`${baseUrl}/fixture?next`);
    await changed;
    const result = await client.callTool({ name: 'echo', arguments: { text: 'stale' } });
    expect(result.isError).toBe(true);
    expect(await page.title()).toBe('WebMCP fixture');
    expect((await client.listTools()).tools).toEqual([]);
  });

  it('refreshes dynamically registered tools without reconnecting', async () => {
    await client.listTools();
    await page.evaluate(async () => {
      const context = (document as unknown as { modelContext: { registerTool: (tool: unknown) => Promise<unknown> } }).modelContext;
      await context.registerTool({ name: 'new_tool', description: 'A dynamic tool', execute: () => 'added' });
    });
    expect((await client.listTools()).tools.map(tool => tool.name)).toContain('new_tool');
    expect(await client.callTool({ name: 'new_tool' })).toMatchObject({ content: [{ type: 'text', text: 'added' }] });
  });

  it('converts ordinary object results to MCP structured content', async () => {
    await page.evaluate(async () => {
      const context = (document as unknown as { modelContext: { registerTool: (tool: unknown) => Promise<unknown> } }).modelContext;
      await context.registerTool({
        name: 'structured', description: 'Return structured data',
        outputSchema: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] },
        execute: () => ({ count: 3 }),
      });
    });
    await client.listTools();
    expect(await client.callTool({ name: 'structured' })).toMatchObject({ structuredContent: { count: 3 } });
  });

  it('routes duplicate tool names to their same-origin frames', async () => {
    const frame = await page.evaluateHandle(() => {
      const iframe = document.createElement('iframe');
      iframe.src = '/fixture?frame';
      document.body.append(iframe);
      return iframe;
    });
    const element = frame.asElement();
    if (!element) throw new Error('Missing iframe');
    const target = await element.contentFrame();
    if (!target) throw new Error('Missing frame context');
    await target.waitForLoadState();
    await target.evaluate(async () => {
      const context = (document as unknown as { modelContext: { registerTool: (tool: unknown) => Promise<unknown> } }).modelContext;
      await context.registerTool({ name: 'echo', description: 'Frame echo', execute: () => 'frame result' });
    });
    const { tools } = await client.listTools();
    expect(new Set(tools.map(tool => tool.name)).size).toBe(tools.length);
    const tool = tools.find(tool => tool.description === 'Frame echo');
    expect(tool).toBeDefined();
    expect(await client.callTool({ name: tool!.name })).toMatchObject({ content: [{ type: 'text', text: 'frame result' }] });
    // WindowProxy survives navigation; a stale alias must not reach its new document.
    await target.goto(`${baseUrl}/fixture?replacement-frame`);
    await target.evaluate(async () => {
      const context = (document as unknown as { modelContext: { registerTool: (tool: unknown) => Promise<unknown> } }).modelContext;
      await context.registerTool({ name: 'echo', description: 'Frame echo', execute: () => 'replacement result' });
    });
    expect((await client.callTool({ name: tool!.name })).isError).toBe(true);
    await frame.dispose();
  });

  it('cancels the page callback when the MCP request is cancelled', async () => {
    await page.evaluate(async () => {
      const context = (document as unknown as { modelContext: { registerTool: (tool: unknown) => Promise<unknown> } }).modelContext;
      await context.registerTool({
        name: 'cancel', description: 'Wait for abort',
        execute: (_input: unknown, { signal }: { signal: AbortSignal }) => new Promise(resolve => {
          document.title = 'running';
          signal.addEventListener('abort', () => { document.title = 'cancelled'; resolve('cancelled'); });
        }),
      });
    });
    await client.listTools();
    const controller = new AbortController();
    const running = client.callTool({ name: 'cancel' }, undefined, { signal: controller.signal });
    const rejection = expect(running).rejects.toThrow();
    await page.waitForFunction(() => document.title === 'running');
    controller.abort();
    await rejection;
    await page.waitForFunction(() => document.title === 'cancelled');
  });

  it('isolates client discovery state and supports session termination', async () => {
    await client.listTools();
    const second = new Client({ name: 'second-client', version: '1.0.0' });
    const secondTransport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    try {
      await second.connect(secondTransport);
      await second.listTools();
      await transport.terminateSession();
      expect((await second.callTool({ name: 'echo', arguments: { text: 'second' } })).isError).not.toBe(true);
    } finally { await second.close(); }
  });

  it('supports the legacy testing API without installing a page polyfill', async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, 'modelContext', { value: undefined });
      Object.defineProperty(navigator, 'modelContextTesting', { value: {
        listTools: () => [{
          name: 'legacy', description: 'Legacy tool',
          inputSchema: JSON.stringify({ type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }),
          annotations: { readOnlyHint: true },
        }],
        executeTool: (name: string, input: string) => {
          if (name !== 'legacy') throw new Error('Wrong legacy tool');
          return JSON.stringify({ content: [{ type: 'text', text: JSON.parse(input).text }] });
        },
      } });
    });
    const { tools } = await client.listTools();
    expect(tools).toMatchObject([{ name: 'legacy', annotations: { readOnlyHint: true } }]);
    expect(await client.callTool({ name: 'legacy', arguments: { text: 'legacy round trip' } })).toMatchObject({ content: [{ type: 'text', text: 'legacy round trip' }] });
  });

  it('rejects browser origins, invalid sessions, and malformed requests', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    const forbidden = await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body });
    expect(forbidden.status).toBe(403);
    const missing = await fetch(`${baseUrl}/mcp`, { method: 'POST', headers: { ...headers, 'mcp-session-id': 'missing' }, body });
    expect(missing.status).toBe(404);
    const uninitialized = await fetch(`${baseUrl}/mcp`, { method: 'POST', headers, body });
    expect(uninitialized.status).toBe(400);
  });
});
