import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { BrowserController } from '../browser/controller.js';
import { SnapshotGenerator } from '../browser/snapshot.js';
import { setupRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error.js';
import { ResetBrowserFn } from './routes/system.js';

const DEFAULT_VNC_WEB_PORT = 39001;

function normalizeHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveVncWebPort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_VNC_WEB_PORT;
  }
  const port = Number.parseInt(value, 10);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_VNC_WEB_PORT;
}

export function buildWebVncRedirectUrl(req: Request, vncWebPort: number, vncPassword: string): string {
  const forwardedHost = normalizeHeader(req.headers['x-forwarded-host']);
  const forwardedProto = normalizeHeader(req.headers['x-forwarded-proto']);
  const hostHeader = forwardedHost || normalizeHeader(req.headers.host) || `localhost:${vncWebPort}`;
  const protocol = forwardedProto || req.protocol || 'http';
  const baseUrl = new URL(`${protocol}://${hostHeader}`);
  baseUrl.port = String(vncWebPort);

  const targetUrl = new URL('/vnc.html', baseUrl);
  const params = new URLSearchParams({ password: vncPassword, autoconnect: '1' });
  targetUrl.hash = params.toString();
  return targetUrl.toString();
}

export interface ServerOptions {
  resetBrowser?: ResetBrowserFn;
}

export async function startApiServer(
  port: number,
  browserController: BrowserController,
  snapshotGenerator: SnapshotGenerator,
  options: ServerOptions = {}
): Promise<Express> {
  const app = express();
  const vncWebPort = resolveVncWebPort(process.env.VNC_WEB_PORT);

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  app.get('/web-vnc', (req: Request, res: Response) => {
    const vncPassword = process.env.VNC_PASSWORD;
    if (!vncPassword) {
      return res.status(503).json({ success: false, error: 'VNC password is not configured' });
    }
    const redirectUrl = buildWebVncRedirectUrl(req, vncWebPort, vncPassword);
    return res.redirect(302, redirectUrl);
  });

  // Setup routes
  setupRoutes(app, browserController, snapshotGenerator, options);

  // Error handler
  app.use(errorHandler);

  return new Promise((resolve, reject) => {
    app.listen(port, () => {
      console.log(`REST API server listening on port ${port}`);
      resolve(app);
    }).on('error', reject);
  });
}
