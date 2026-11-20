// SPDX-License-Identifier: MIT
import type { JSHandle, Page } from 'playwright';
import { CallToolResultSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import type { JsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/types.js';

interface PageTool {
  name: string;
  description: string;
  title?: string;
  inputSchema?: Record<string, unknown> | string;
  outputSchema?: Record<string, unknown> | string;
  annotations?: Tool['annotations'];
  origin?: string;
  window?: Window;
}

interface ModelContext {
  getTools?: () => Promise<PageTool[]>;
  listTools?: () => PageTool[] | Promise<PageTool[]>;
  executeTool: (tool: PageTool | string, input: unknown, options?: { signal: AbortSignal }) => Promise<unknown>;
}

interface PageSnapshot {
  metadata: Omit<PageTool, 'window'>[];
  changed: () => Promise<boolean>;
  execute: (index: number, input: Record<string, unknown>, id: string, timeout: number) => Promise<unknown>;
  cancel: (id: string) => void;
}

/** Capture native tool objects in their owning document, outside page-visible globals. */
async function captureTools(): Promise<PageSnapshot> {
  const doc = document as unknown as { modelContext?: ModelContext };
  const nav = navigator as unknown as { modelContext?: ModelContext; modelContextTesting?: ModelContext };
  const api = doc.modelContext?.getTools ? doc.modelContext
    : nav.modelContext?.getTools ? nav.modelContext : nav.modelContextTesting;
  const legacy = api === nav.modelContextTesting;
  const read = async () => api?.getTools ? api.getTools() : api?.listTools ? api.listTools() : [];
  const describe = (tool: PageTool): Omit<PageTool, 'window'> => ({
    name: tool.name,
    description: tool.description,
    title: tool.title,
    inputSchema: typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema,
    outputSchema: typeof tool.outputSchema === 'string' ? JSON.parse(tool.outputSchema) : tool.outputSchema,
    annotations: tool.annotations,
    origin: tool.origin || tool.window?.location.origin || location.origin,
  });
  const tools = await read();
  const metadata = tools.map(describe);
  const ownerDocuments = tools.map(tool => tool.window?.document ?? document);
  const fingerprint = JSON.stringify(metadata);
  const controllers = new Map<string, AbortController>();
  const changed = async () => {
    if ((doc.modelContext?.getTools ? doc.modelContext : nav.modelContext?.getTools ? nav.modelContext : nav.modelContextTesting) !== api) return true;
    const current = await read();
    return JSON.stringify(current.map(describe)) !== fingerprint
      || current.some((tool, index) => tool.window !== tools[index]?.window
        || (tool.window?.document ?? document) !== ownerDocuments[index]);
  };
  return {
    metadata,
    changed,
    cancel: id => controllers.get(id)?.abort(),
    execute: async (index, input, id, timeout) => {
      if (!api || await changed()) throw new Error('WebMCP tools changed. Refresh tools/list before calling again.');
      const controller = new AbortController();
      controllers.set(id, controller);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          api.executeTool(legacy ? tools[index].name : tools[index], legacy ? JSON.stringify(input) : input, { signal: controller.signal }),
          new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('WebMCP tool execution cancelled')), { once: true });
            timer = setTimeout(() => {
              reject(new Error('WebMCP tool execution timed out'));
              controller.abort();
            }, timeout);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        controllers.delete(id);
      }
    },
  };
}

function toolResult(value: unknown): CallToolResult {
  let decoded = value;
  if (typeof value === 'string') {
    try { decoded = JSON.parse(value); } catch { /* Plain text is a valid WebMCP result. */ }
  }
  const result = CallToolResultSchema.safeParse(decoded);
  if (result.success && decoded !== null && typeof decoded === 'object'
    && ('content' in decoded || 'structuredContent' in decoded || 'isError' in decoded)) return result.data;
  return {
    content: [{ type: 'text', text: typeof decoded === 'string' ? decoded : JSON.stringify(decoded) ?? 'null' }],
    ...(decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
      ? { structuredContent: decoded as Record<string, unknown> } : {}),
  };
}

export class WebMcpSnapshot {
  readonly tools: Tool[];
  private readonly validators = new Map<number, JsonSchemaValidator<unknown>>();
  private sequence = 0;

  constructor(
    private readonly page: Page,
    private readonly getPage: () => Page,
    private readonly handle: JSHandle<PageSnapshot>,
    metadata: PageSnapshot['metadata'],
  ) {
    const counts = new Map<string, number>();
    for (const tool of metadata) counts.set(tool.name, (counts.get(tool.name) || 0) + 1);
    const used = new Set(metadata.filter(tool => counts.get(tool.name) === 1).map(tool => tool.name));
    this.tools = metadata.map((tool, index) => {
      let name = tool.name;
      if ((counts.get(name) || 0) > 1) {
        let attempt = 0;
        do { name = `${tool.name.slice(0, 90)}__frame_${index}_${attempt++}`; } while (used.has(name));
      }
      used.add(name);
      return {
        name,
        description: tool.description,
        ...(tool.title ? { title: tool.title } : {}),
        inputSchema: (tool.inputSchema || { type: 'object', properties: {} }) as Tool['inputSchema'],
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema as Tool['outputSchema'] } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
        _meta: { 'webmcp/origin': tool.origin, 'webmcp/name': tool.name },
      };
    });
  }

  async changed(): Promise<boolean> {
    if (this.page !== this.getPage() || this.page.isClosed()) return true;
    try { return await this.handle.evaluate(state => state.changed()); } catch { return true; }
  }

  async call(name: string, input: Record<string, unknown>, signal: AbortSignal, timeoutMs: number): Promise<CallToolResult> {
    if (signal.aborted) throw new Error('WebMCP tool execution cancelled');
    const index = this.tools.findIndex(tool => tool.name === name);
    if (index < 0) throw new Error(`Unknown WebMCP tool: ${name}. Refresh tools/list.`);
    if (this.page !== this.getPage() || this.page.isClosed()) throw new Error('WebMCP page changed. Refresh tools/list.');
    let validate = this.validators.get(index);
    if (!validate) {
      // Each tool owns its schema namespace, including any $id definitions.
      validate = new AjvJsonSchemaValidator().getValidator(this.tools[index].inputSchema);
      this.validators.set(index, validate);
    }
    const validation = validate(input);
    if (!validation.valid) throw new Error(`Invalid tool arguments: ${validation.errorMessage}`);
    const id = String(++this.sequence);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      const value = await Promise.race([
        this.handle.evaluate((state, args) => state.execute(args.index, args.input, args.id, args.timeoutMs), { index, input, id, timeoutMs }),
        new Promise<never>((_resolve, reject) => {
          abort = () => {
            void this.handle.evaluate((state, callId) => state.cancel(callId), id).catch(() => {});
            reject(new Error('WebMCP tool execution cancelled'));
          };
          signal.addEventListener('abort', abort, { once: true });
          timer = setTimeout(() => {
            void this.handle.evaluate((state, callId) => state.cancel(callId), id).catch(() => {});
            reject(new Error('WebMCP tool execution timed out'));
          }, timeoutMs);
          if (signal.aborted) abort();
        }),
      ]);
      return toolResult(value);
    } finally {
      clearTimeout(timer);
      if (abort) signal.removeEventListener('abort', abort);
    }
  }

  async close(): Promise<void> { await this.handle.dispose().catch(() => {}); }
}

export class WebMcpBridge {
  constructor(private readonly getPage: () => Page) {}

  async snapshot(): Promise<WebMcpSnapshot> {
    const page = this.getPage();
    const handle = await page.evaluateHandle(captureTools);
    try {
      const metadata = await handle.evaluate(state => state.metadata);
      return new WebMcpSnapshot(page, this.getPage, handle, metadata);
    } catch (error) {
      await handle.dispose().catch(() => {});
      throw error;
    }
  }
}
