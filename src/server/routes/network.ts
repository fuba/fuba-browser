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
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.post('/network/save', async (req: Request<{}, {}, NetworkSaveRequest>, res: Response<ApiResponse>) => {
    try {
      const { id, dataUrl, overwrite = false } = req.body || {};
      const outputPath = req.body?.path;

      if (!outputPath) {
        return res.status(400).json({ success: false, error: 'path is required' });
      }

      if (!id && !dataUrl) {
        return res.status(400).json({ success: false, error: 'Either id or dataUrl is required' });
      }

      const resolvedPath = await resolveSafeOutputPath(outputPath);
      let body: Buffer;
      let contentType: string | undefined;
      let sourceUrl: string | undefined;
      let sourceId: string | undefined;

      if (dataUrl) {
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
        await fs.writeFile(resolvedPath, body, { flag: overwrite ? 'w' : 'wx' });
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
      const status = error instanceof NetworkSaveBadRequestError ? 400 : 500;
      return res.status(status).json({ success: false, error: message });
    }
  });

  return router;
}
