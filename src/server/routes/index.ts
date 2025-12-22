import { Express } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { browserRoutes } from './browser.js';
import { contentRoutes } from './content.js';
import { sessionRoutes } from './session.js';

export function setupRoutes(app: Express, browserController: BrowserController) {
  // Browser control routes
  app.use('/api', browserRoutes(browserController));
  
  // Content extraction routes  
  app.use('/api', contentRoutes(browserController));
  
  // Session management routes
  app.use('/api', sessionRoutes(browserController));
}