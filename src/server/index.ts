import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { BrowserController } from '../browser/controller.js';
import { SnapshotGenerator } from '../browser/snapshot.js';
import { setupRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error.js';
import { ResetBrowserFn } from './routes/system.js';

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

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.1.0' });
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