import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse, PageContent } from '../../types/browser.js';

export function contentRoutes(browserController: BrowserController): Router {
  const router = Router();
  
  // Get page content as extended markdown
  router.get('/content', async (_req: Request, res: Response<ApiResponse<PageContent>>) => {
    try {
      const content = await browserController.getPageContent();
      res.json({ success: true, data: content });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Get interactive elements
  router.get('/elements', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const elements = await browserController.getInteractiveElements();
      res.json({ success: true, data: elements });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Get DOM tree (simplified)
  router.get('/dom', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const content = await browserController.getPageContent();
      res.json({ 
        success: true, 
        data: {
          url: content.url,
          title: content.title,
          elementsCount: content.elements.length,
          elements: content.elements
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  return router;
}