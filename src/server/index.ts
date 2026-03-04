import express, { Express, Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import { BrowserController } from '../browser/controller.js';
import { SnapshotGenerator } from '../browser/snapshot.js';
import { setupRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error.js';
import { ResetBrowserFn } from './routes/system.js';
import { SetDeviceProfileFn, GetDeviceProfileFn } from './routes/device.js';
import { TokenStore } from './token-store.js';
import { VncPasswordManager } from './vnc-password-manager.js';
import { discoveryRoutes } from './routes/discovery.js';

const DEFAULT_VNC_WEB_PORT = 39001;
const DEFAULT_BODY_PARSER_LIMIT = '20mb';

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

export function parseCorsOrigins(value: string | undefined): string[] | '*' | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized === '*') {
    return '*';
  }

  const origins = normalized
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : null;
}

export function resolveCorsOptions(value: string | undefined): CorsOptions | null {
  const origins = parseCorsOrigins(value);
  if (!origins) {
    return null;
  }

  if (origins === '*') {
    return {};
  }

  return { origin: origins };
}

export function buildWebVncRedirectUrl(req: Request, vncWebPort: number, vncPassword: string, vncHost?: string): string {
  let baseUrl: URL;
  if (vncHost) {
    // When vncHost is specified, use it directly without port override
    const forwardedProto = normalizeHeader(req.headers['x-forwarded-proto']);
    const protocol = forwardedProto || req.protocol || 'http';
    baseUrl = new URL(`${protocol}://${vncHost}`);
  } else {
    const forwardedHost = normalizeHeader(req.headers['x-forwarded-host']);
    const forwardedProto = normalizeHeader(req.headers['x-forwarded-proto']);
    const hostHeader = forwardedHost || normalizeHeader(req.headers.host) || `localhost:${vncWebPort}`;
    const protocol = forwardedProto || req.protocol || 'http';
    baseUrl = new URL(`${protocol}://${hostHeader}`);
    baseUrl.port = String(vncWebPort);
  }

  const targetUrl = new URL('/vnc.html', baseUrl);
  const params = new URLSearchParams({ password: vncPassword, autoconnect: '1' });
  targetUrl.hash = params.toString();
  return targetUrl.toString();
}

export interface ServerOptions {
  resetBrowser?: ResetBrowserFn;
  setDeviceProfile?: SetDeviceProfileFn;
  getDeviceProfile?: GetDeviceProfileFn;
  tokenStore?: TokenStore;
  vncPasswordManager?: VncPasswordManager;
}

export async function startApiServer(
  port: number,
  browserController: BrowserController,
  snapshotGenerator: SnapshotGenerator,
  options: ServerOptions = {}
): Promise<Express> {
  const app = express();
  const vncWebPort = resolveVncWebPort(process.env.VNC_WEB_PORT);
  const bodyParserLimit = process.env.API_BODY_LIMIT || DEFAULT_BODY_PARSER_LIMIT;

  // Middleware
  const corsOptions = resolveCorsOptions(process.env.API_CORS_ORIGINS);
  if (corsOptions) {
    app.use(cors(corsOptions));
  }
  app.use(express.json({ limit: bodyParserLimit }));
  app.use(express.urlencoded({ extended: true, limit: bodyParserLimit }));

  app.use(discoveryRoutes('0.1.0'));

  // Health check
  app.get('/health', async (_req: Request, res: Response) => {
    const health = await browserController.checkHealth();
    if (!health.ok) {
      return res.status(503).json({
        status: 'unhealthy',
        version: '0.1.0',
        application: 'unavailable',
        error: health.error || 'Application health check failed',
      });
    }

    return res.json({
      status: 'ok',
      version: '0.1.0',
      application: 'ok',
    });
  });

  const tokenStore = options.tokenStore ?? new TokenStore(
    process.env.VNC_TOKEN_TTL_SECONDS
      ? Number.parseInt(process.env.VNC_TOKEN_TTL_SECONDS, 10)
      : undefined
  );

  app.get('/web-vnc', (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token is required' });
    }

    const metadata = tokenStore.consumeToken(token);
    if (!metadata) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (!metadata.vncPassword) {
      return res.status(503).json({ success: false, error: 'No VNC password associated with this token' });
    }

    const redirectUrl = buildWebVncRedirectUrl(req, vncWebPort, metadata.vncPassword, metadata.vncHost);
    return res.redirect(302, redirectUrl);
  });

  // Setup routes
  setupRoutes(app, browserController, snapshotGenerator, { ...options, tokenStore });

  // Error handler
  app.use(errorHandler);

  return new Promise((resolve, reject) => {
    app.listen(port, () => {
      console.log(`REST API server listening on port ${port}`);
      resolve(app);
    }).on('error', reject);
  });
}
