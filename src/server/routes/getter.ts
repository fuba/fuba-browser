import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

export function getterRoutes(browserController: BrowserController): Router {
  const router = Router();

  // Get text content
  router.get('/get/text/:selector', async (req: Request, res: Response<ApiResponse>) => {
    try {
      const selector = decodeURIComponent(req.params.selector);
      const text = await browserController.getText(selector);
      res.json({ success: true, data: { text } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get innerHTML
  router.get('/get/html/:selector', async (req: Request, res: Response<ApiResponse>) => {
    try {
      const selector = decodeURIComponent(req.params.selector);
      const html = await browserController.getHtml(selector);
      res.json({ success: true, data: { html } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get input value
  router.get('/get/value/:selector', async (req: Request, res: Response<ApiResponse>) => {
    try {
      const selector = decodeURIComponent(req.params.selector);
      const value = await browserController.getValue(selector);
      res.json({ success: true, data: { value } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get attribute
  router.get('/get/attr/:selector/:attribute', async (req: Request, res: Response<ApiResponse>) => {
    try {
      const selector = decodeURIComponent(req.params.selector);
      const attribute = decodeURIComponent(req.params.attribute);
      const value = await browserController.getAttribute(selector, attribute);
      res.json({ success: true, data: { attribute, value } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get page title
  router.get('/get/title', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const title = await browserController.evaluate('document.title');
      res.json({ success: true, data: { title } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get current URL
  router.get('/get/url', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const url = await browserController.evaluate('window.location.href');
      res.json({ success: true, data: { url } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get element count
  router.get('/get/count/:selector', async (req: Request, res: Response<ApiResponse>) => {
    try {
      const selector = decodeURIComponent(req.params.selector);
      const count = await browserController.getCount(selector);
      res.json({ success: true, data: { count } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get bounding box
  router.get('/get/box/:selector', async (req: Request, res: Response<ApiResponse>) => {
    try {
      const selector = decodeURIComponent(req.params.selector);
      const box = await browserController.getBoundingBox(selector);
      res.json({ success: true, data: { box } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Check visibility
  router.post('/is/visible', async (req: Request, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { selector } = req.body;
      if (!selector) {
        return res.status(400).json({ success: false, error: 'Selector is required' });
      }
      const visible = await browserController.isVisible(selector);
      return res.json({ success: true, data: { visible } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Check enabled
  router.post('/is/enabled', async (req: Request, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { selector } = req.body;
      if (!selector) {
        return res.status(400).json({ success: false, error: 'Selector is required' });
      }
      const enabled = await browserController.isEnabled(selector);
      return res.json({ success: true, data: { enabled } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Check checked state
  router.post('/is/checked', async (req: Request, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { selector } = req.body;
      if (!selector) {
        return res.status(400).json({ success: false, error: 'Selector is required' });
      }
      const checked = await browserController.isChecked(selector);
      return res.json({ success: true, data: { checked } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
