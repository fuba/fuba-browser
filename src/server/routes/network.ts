import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

function decodeDataUrl(dataUrl: string): DecodedDataUrl {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('dataUrl must start with "data:"');
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Invalid data URL: missing comma separator');
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const parts = metadata.split(';').filter(Boolean);
  const isBase64 = parts.includes('base64');
  const mediaType = parts.find((part) => part !== 'base64') || undefined;

  if (isBase64) {
    return { contentType: mediaType, body: Buffer.from(payload, 'base64') };
  }

  return { contentType: mediaType, body: Buffer.from(decodeURIComponent(payload), 'utf-8') };
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveSafeOutputPath(outputPath: string): string {
  const resolved = path.resolve(outputPath);
  const allowedRoots = [path.resolve(process.cwd()), path.resolve(os.tmpdir())];

  if (allowedRoots.some((root) => isPathInsideRoot(resolved, root))) {
    return resolved;
  }

  throw new Error(`Output path must be inside ${allowedRoots.join(' or ')}`);
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
      res.set('X-Network-URL', encodeURIComponent(bodyResult.url));
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

      const resolvedPath = resolveSafeOutputPath(outputPath);
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

      if (!overwrite) {
        try {
          await fs.access(resolvedPath);
          return res.status(409).json({ success: false, error: `File already exists: ${resolvedPath}` });
        } catch {
          // File does not exist, continue.
        }
      }

      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, body);

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
      const status = message.includes('Output path must be inside') || message.includes('dataUrl') ? 400 : 500;
      return res.status(status).json({ success: false, error: message });
    }
  });

  return router;
}
