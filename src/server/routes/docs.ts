import { Request, Response, Router } from 'express';

const DEFAULT_DOCS_BASE_URL = 'https://raw.githubusercontent.com/fuba/fuba-browser/main';

interface DocumentDefinition {
  id: string;
  title: string;
  path: string;
}

interface DocumentInfo extends DocumentDefinition {
  sourceUrl: string;
}

interface DocumentPayload extends DocumentInfo {
  markdown: string;
  fetchedAt: string;
}

export interface DocsFetcherResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}

export type DocsFetcher = (url: string) => Promise<DocsFetcherResponse>;

export interface DocsRouteOptions {
  baseUrl?: string;
  fetcher?: DocsFetcher;
}

const DOCUMENTS: ReadonlyArray<DocumentDefinition> = [
  { id: 'readme', title: 'Project Overview', path: 'README.md' },
  { id: 'api', title: 'REST API Reference', path: 'doc/API.md' },
  { id: 'usage', title: 'Usage Guide', path: 'doc/USAGE.md' },
  { id: 'cli', title: 'CLI Reference', path: 'cli/README.md' },
  { id: 'proxy', title: 'Egress Proxy Guide', path: 'doc/PROXY.md' },
  { id: 'development', title: 'Development Guide', path: 'doc/DEVELOPMENT.md' },
];

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function getDocsBaseUrl(baseUrl?: string): string {
  const resolved = baseUrl || process.env.DOCS_BASE_URL || DEFAULT_DOCS_BASE_URL;
  return normalizeBaseUrl(resolved);
}

function getQueryStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

function parseRequestedIds(value: unknown): string[] | null {
  const raw = getQueryStringValue(value);
  if (!raw) {
    return null;
  }
  const ids = raw.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
  return ids.length > 0 ? ids : null;
}

function selectDocuments(ids: string[] | null): DocumentDefinition[] | null {
  if (!ids) {
    return [...DOCUMENTS];
  }
  const selected = ids.map((id) => DOCUMENTS.find((document) => document.id === id)).filter((document) => document !== undefined);
  if (selected.length !== ids.length) {
    return null;
  }
  return selected;
}

function toDocumentInfo(document: DocumentDefinition, docsBaseUrl: string): DocumentInfo {
  return {
    ...document,
    sourceUrl: `${docsBaseUrl}/${document.path}`,
  };
}

function isMarkdownResponse(req: Request): boolean {
  return getQueryStringValue(req.query.format) === 'markdown';
}

async function loadDocument(document: DocumentInfo, fetcher: DocsFetcher): Promise<DocumentPayload | null> {
  try {
    const response = await fetcher(document.sourceUrl);
    if (!response.ok) {
      return null;
    }
    const markdown = await response.text();
    return {
      ...document,
      markdown,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function isDocumentPayload(value: DocumentPayload | null): value is DocumentPayload {
  return value !== null;
}

function buildBundleMarkdown(documents: DocumentPayload[]): string {
  const header = '# Fuba Browser Documentation Bundle';
  const sections = documents.map((document) => (
    `<!-- BEGIN DOCUMENT: ${document.id} (${document.sourceUrl}) -->\n${document.markdown.trim()}\n<!-- END DOCUMENT: ${document.id} -->`
  ));
  return `${header}\n\n${sections.join('\n\n')}\n`;
}

function defaultFetcher(url: string): Promise<DocsFetcherResponse> {
  return fetch(url) as Promise<DocsFetcherResponse>;
}

function listAvailableDocumentIds(): string {
  return DOCUMENTS.map((document) => document.id).join(', ');
}

export function docsRoutes(options: DocsRouteOptions = {}): Router {
  const router = Router();
  const docsBaseUrl = getDocsBaseUrl(options.baseUrl);
  const fetcher = options.fetcher || defaultFetcher;

  router.get('/docs', (req: Request, res: Response): void => {
    const requestedIds = parseRequestedIds(req.query.docs);
    const selected = selectDocuments(requestedIds);
    if (!selected) {
      res.status(400).json({
        success: false,
        error: `Unknown document id in docs query. Available ids: ${listAvailableDocumentIds()}`
      });
      return;
    }

    res.json({
      success: true,
      data: {
        documents: selected.map((document) => toDocumentInfo(document, docsBaseUrl)),
        bundleEndpoint: '/api/docs/llm',
      }
    });
    return;
  });

  router.get('/docs/llm', async (req: Request, res: Response): Promise<void> => {
    const requestedIds = parseRequestedIds(req.query.docs);
    const selected = selectDocuments(requestedIds);
    if (!selected) {
      res.status(400).json({
        success: false,
        error: `Unknown document id in docs query. Available ids: ${listAvailableDocumentIds()}`
      });
      return;
    }

    const infos = selected.map((document) => toDocumentInfo(document, docsBaseUrl));
    const loadedDocuments = await Promise.all(infos.map((document) => loadDocument(document, fetcher)));
    if (!loadedDocuments.every(isDocumentPayload)) {
      res.status(502).json({
        success: false,
        error: 'Failed to fetch document bundle from upstream source'
      });
      return;
    }

    const bundle = buildBundleMarkdown(loadedDocuments);
    if (isMarkdownResponse(req)) {
      res.type('text/markdown').send(bundle);
      return;
    }

    res.json({
      success: true,
      data: {
        documents: loadedDocuments.map((document) => ({
          id: document.id,
          title: document.title,
          path: document.path,
          sourceUrl: document.sourceUrl,
        })),
        markdown: bundle,
        format: 'markdown',
        fetchedAt: new Date().toISOString(),
      }
    });
    return;
  });

  router.get('/docs/:docId', async (req: Request, res: Response): Promise<void> => {
    const docId = req.params.docId;
    const document = DOCUMENTS.find((item) => item.id === docId);
    if (!document) {
      res.status(404).json({
        success: false,
        error: `Unknown document id "${docId}". Available ids: ${listAvailableDocumentIds()}`
      });
      return;
    }

    const info = toDocumentInfo(document, docsBaseUrl);
    const payload = await loadDocument(info, fetcher);
    if (!payload) {
      res.status(502).json({
        success: false,
        error: `Failed to fetch document "${docId}" from upstream source`
      });
      return;
    }

    if (isMarkdownResponse(req)) {
      res.type('text/markdown').send(payload.markdown);
      return;
    }

    res.json({
      success: true,
      data: payload,
    });
    return;
  });

  return router;
}
