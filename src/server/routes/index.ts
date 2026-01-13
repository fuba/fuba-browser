import { Express } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { SnapshotGenerator } from '../../browser/snapshot.js';
import { browserRoutes } from './browser.js';
import { contentRoutes } from './content.js';
import { sessionRoutes } from './session.js';
import { exportRoutes } from './export.js';
import { snapshotRoutes } from './snapshot.js';
import { waitRoutes } from './wait.js';
import { getterRoutes } from './getter.js';
import { inputRoutes } from './input.js';
import { storageRoutes } from './storage.js';
import { debugRoutes } from './debug.js';
import { stateRoutes } from './state.js';

export function setupRoutes(app: Express, browserController: BrowserController, snapshotGenerator: SnapshotGenerator) {
  // Browser control routes
  app.use('/api', browserRoutes(browserController));

  // Content extraction routes
  app.use('/api', contentRoutes(browserController));

  // Session management routes
  app.use('/api', sessionRoutes(browserController));

  // Export routes (PDF, etc.)
  app.use('/api', exportRoutes(browserController));

  // Snapshot routes (accessibility tree with refs)
  app.use('/api', snapshotRoutes(browserController, snapshotGenerator));

  // Wait routes
  app.use('/api', waitRoutes(browserController));

  // Getter routes (get text, html, value, etc.)
  app.use('/api', getterRoutes(browserController));

  // Input routes (keyboard, mouse)
  app.use('/api', inputRoutes(browserController));

  // Storage routes (localStorage, sessionStorage)
  app.use('/api', storageRoutes(browserController));

  // Debug routes (console, errors, eval)
  app.use('/api', debugRoutes(browserController));

  // State routes (save/load authentication state)
  app.use('/api', stateRoutes(browserController));
}