import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

export function sessionRoutes(browserController: BrowserController): Router {
  const router = Router();
  
  // Get all cookies
  router.get('/cookies', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const cookies = await browserController.getCookies();
      res.json({ success: true, data: cookies });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Set cookie
  router.post('/cookies', async (req: Request, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const cookie = req.body;
      if (!cookie.url || !cookie.name) {
        return res.status(400).json({ 
          success: false, 
          error: 'URL and name are required for cookie' 
        });
      }
      
      await browserController.setCookie(cookie);
      return res.json({ success: true, data: cookie });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Clear cookies
  router.delete('/cookies', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      await browserController.clearCookies();
      res.json({ success: true, data: { message: 'Cookies cleared' } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Get session info
  router.get('/session', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const pageContent = await browserController.getPageContent();
      const cookies = await browserController.getCookies();
      
      res.json({ 
        success: true, 
        data: {
          url: pageContent.url,
          title: pageContent.title,
          cookiesCount: cookies.length
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  return router;
}