import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

interface NetworkSaveRequest {
  id?: string;
  dataUrl?: string;
  path?: string;
  overwrite?: boolean;
}

interface DecodedDataUrl {
  contentType?: string;
  body: Buffer;
}

class NetworkSaveBadRequestError extends Error {}
class NetworkResourceNotFoundError extends Error {}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
let allowedRootsPromise: Promise<string[]> | null = null;

function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  if (!dataUrl.startsWith('data:')) {
    throw new NetworkSaveBadRequestError('dataUrl must start with "data:"');
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    throw new NetworkSaveBadRequestError('Invalid data URL: missing comma separator');
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const parts = metadata.split(';').filter(Boolean);
  const isBase64 = parts.includes('base64');
  const mediaType = parts.find((part) => part !== 'base64') || undefined;

  if (isBase64) {
    let decodedPayload: string;
    try {
      decodedPayload = decodeURIComponent(payload);
    } catch {
      throw new NetworkSaveBadRequestError('Invalid data URL: malformed percent-encoding');
    }

    if (!BASE64_PATTERN.test(decodedPayload)) {
      throw new NetworkSaveBadRequestError('Invalid data URL: malformed base64 payload');
    }
    return { contentType: mediaType, body: Buffer.from(decodedPayload, 'base64') };
  }

  try {
    return { contentType: mediaType, body: Buffer.from(decodeURIComponent(payload), 'utf-8') };
  } catch {
    throw new NetworkSaveBadRequestError('Invalid data URL: malformed percent-encoding');
  }
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveSafeOutputPath(outputPath: string): Promise<string> {
  const resolved = path.resolve(outputPath);
  const allowedRoots = await getAllowedRoots();
  const parentDir = path.dirname(resolved);

  let existingDir = parentDir;
  let resolvedParentDir: string | null = null;
  while (!resolvedParentDir) {
    try {
      resolvedParentDir = await fs.realpath(existingDir);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
      const nextDir = path.dirname(existingDir);
      if (nextDir === existingDir) {
        throw new NetworkSaveBadRequestError(`Parent directory does not exist: ${parentDir}`);
      }
      existingDir = nextDir;
    }
  }

  if (!allowedRoots.some((root) => isPathInsideRoot(resolvedParentDir, root))) {
    throw new NetworkSaveBadRequestError(`Output path must be inside ${allowedRoots.join(' or ')}`);
  }

  try {
    const stat = await fs.lstat(resolved);
    if (stat.isSymbolicLink()) {
      throw new NetworkSaveBadRequestError(`Refusing to write through symlink: ${resolved}`);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  return resolved;
}

async function getAllowedRoots(): Promise<string[]> {
  if (allowedRootsPromise) {
    return allowedRootsPromise;
  }

  const roots = [PROJECT_ROOT, path.resolve(os.tmpdir())];
  allowedRootsPromise = Promise.all(roots.map(async (root) => {
    try {
      return await fs.realpath(root);
    } catch {
      return root;
    }
  }));

  return allowedRootsPromise;
}

function normalizeNetworkLookupError(error: unknown): NetworkResourceNotFoundError | null {
  const message = (error as Error | undefined)?.message;
  if (!message) {
    return null;
  }

  if (
    message.startsWith('Network request not found:') ||
    message.startsWith('Response body not available for request:')
  ) {
    return new NetworkResourceNotFoundError(message);
  }

  return null;
}

function requireStringField(value: unknown, fieldName: string, options: { allowEmpty?: boolean } = {}): string {
  if (value === undefined || value === null) {
    throw new NetworkSaveBadRequestError(`${fieldName} is required`);
  }

  if (typeof value !== 'string') {
    throw new NetworkSaveBadRequestError(`${fieldName} must be a string`);
  }

  if (!options.allowEmpty && value.length === 0) {
    throw new NetworkSaveBadRequestError(`${fieldName} is required`);
  }

  return value;
}

export function networkRoutes(browserController: BrowserController): Router {
  const router = Router();

  router.get('/network', (_req: Request, res: Response<ApiResponse>) => {
    try {
      const entries = browserController.getNetworkRequests();
      res.json({ success: true, data: { entries, count: entries.length } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.delete('/network', (_req: Request, res: Response<ApiResponse>) => {
    try {
      const cleared = browserController.clearNetworkRequests();
      res.json({ success: true, data: { cleared } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/network/body/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const bodyResult = await browserController.getNetworkResponseBody(req.params.id);
      const responseType = req.query.type === 'base64' ? 'base64' : 'binary';
      const contentType = bodyResult.contentType || 'application/octet-stream';

      if (responseType === 'base64') {
        const base64 = bodyResult.body.toString('base64');
        res.json({
          success: true,
          data: {
            id: bodyResult.id,
            url: bodyResult.url,
            contentType,
            size: bodyResult.body.length,
            base64,
            dataUrl: `data:${contentType};base64,${base64}`,
          },
        });
        return;
      }

      res.set('Content-Type', contentType);
      res.set('X-Network-Request-Id', bodyResult.id);
      res.send(bodyResult.body);
    } catch (error) {
      const notFoundError = normalizeNetworkLookupError(error);
      if (notFoundError) {
        res.status(404).json({ success: false, error: notFoundError.message });
        return;
      }
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.post('/network/save', async (req: Request<{}, {}, NetworkSaveRequest>, res: Response<ApiResponse>) => {
    try {
      const { id, dataUrl } = req.body || {};
      const overwrite = req.body?.overwrite;

      if (overwrite !== undefined && typeof overwrite !== 'boolean') {
        throw new NetworkSaveBadRequestError('overwrite must be a boolean');
      }

      const outputPath = requireStringField(req.body?.path, 'path');

      if (id !== undefined && typeof id !== 'string') {
        throw new NetworkSaveBadRequestError('id must be a string');
      }
      if (id !== undefined && id.length === 0) {
        throw new NetworkSaveBadRequestError('id is required');
      }

      if (dataUrl !== undefined && typeof dataUrl !== 'string') {
        throw new NetworkSaveBadRequestError('dataUrl must be a string');
      }
      if (dataUrl !== undefined && dataUrl.length === 0) {
        throw new NetworkSaveBadRequestError('dataUrl is required');
      }

      if (id === undefined && dataUrl === undefined) {
        throw new NetworkSaveBadRequestError('Either id or dataUrl is required');
      }

      const resolvedPath = await resolveSafeOutputPath(outputPath);
      let body: Buffer;
      let contentType: string | undefined;
      let sourceUrl: string | undefined;
      let sourceId: string | undefined;

      if (dataUrl !== undefined) {
        const decoded = decodeDataUrl(dataUrl);
        body = decoded.body;
        contentType = decoded.contentType || 'application/octet-stream';
        sourceUrl = dataUrl;
      } else {
        const responseBody = await browserController.getNetworkResponseBody(id!);
        body = responseBody.body;
        contentType = responseBody.contentType || 'application/octet-stream';
        sourceUrl = responseBody.url;
        sourceId = responseBody.id;
      }

      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      try {
        await fs.writeFile(resolvedPath, body, { flag: overwrite === true ? 'w' : 'wx' });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EEXIST') {
          return res.status(409).json({ success: false, error: `File already exists: ${resolvedPath}` });
        }
        throw error;
      }

      return res.json({
        success: true,
        data: {
          path: resolvedPath,
          bytes: body.length,
          contentType,
          id: sourceId,
          url: sourceUrl,
        },
      });
    } catch (error) {
      const message = (error as Error).message;
      const notFoundError = normalizeNetworkLookupError(error);
      const status = notFoundError ? 404 : error instanceof NetworkSaveBadRequestError ? 400 : 500;
      return res.status(status).json({ success: false, error: message });
    }
  });

  return router;
}
