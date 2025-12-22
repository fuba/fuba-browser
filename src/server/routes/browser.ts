import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { 
  NavigateRequest, 
  ScrollRequest, 
  ClickRequest, 
  TypeRequest,
  ApiResponse 
} from '../../types/browser.js';

export function browserRoutes(browserController: BrowserController): Router {
  const router = Router();
  
  // Navigate to URL
  router.post('/navigate', async (req: Request<{}, {}, NavigateRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
      }
      
      await browserController.navigate(url);
      return res.json({ success: true, data: { url } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Scroll page
  router.post('/scroll', async (req: Request<{}, {}, ScrollRequest>, res: Response<ApiResponse>) => {
    try {
      const { x = 0, y = 0 } = req.body;
      await browserController.scroll(x, y);
      res.json({ success: true, data: { x, y } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Click element
  router.post('/click', async (req: Request<{}, {}, ClickRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { selector } = req.body;
      if (!selector) {
        return res.status(400).json({ success: false, error: 'Selector is required' });
      }
      
      await browserController.click(selector);
      return res.json({ success: true, data: { selector } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Type text
  router.post('/type', async (req: Request<{}, {}, TypeRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { selector, text } = req.body;
      if (!selector || text === undefined) {
        return res.status(400).json({ 
          success: false, 
          error: 'Selector and text are required' 
        });
      }
      
      await browserController.type(selector, text);
      return res.json({ success: true, data: { selector, text } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Take screenshot
  router.get('/screenshot', async (_req: Request, res: Response) => {
    try {
      const screenshot = await browserController.screenshot();
      res.set('Content-Type', 'image/png');
      res.send(screenshot);
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  return router;
}