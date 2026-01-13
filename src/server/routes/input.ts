import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

interface KeyRequest {
  key: string;
}

interface MouseMoveRequest {
  x: number;
  y: number;
}

interface MouseButtonRequest {
  button?: 'left' | 'right' | 'middle';
}

interface MouseWheelRequest {
  deltaY: number;
  deltaX?: number;
}

export function inputRoutes(browserController: BrowserController): Router {
  const router = Router();

  // Press key (down + up)
  router.post('/keyboard/press', async (req: Request<{}, {}, KeyRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { key } = req.body;
      if (!key) {
        return res.status(400).json({ success: false, error: 'Key is required' });
      }

      await browserController.press(key);
      return res.json({ success: true, data: { key } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Key down
  router.post('/keyboard/down', async (req: Request<{}, {}, KeyRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { key } = req.body;
      if (!key) {
        return res.status(400).json({ success: false, error: 'Key is required' });
      }

      await browserController.keyDown(key);
      return res.json({ success: true, data: { key } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Key up
  router.post('/keyboard/up', async (req: Request<{}, {}, KeyRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { key } = req.body;
      if (!key) {
        return res.status(400).json({ success: false, error: 'Key is required' });
      }

      await browserController.keyUp(key);
      return res.json({ success: true, data: { key } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Mouse move
  router.post('/mouse/move', async (req: Request<{}, {}, MouseMoveRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { x, y } = req.body;
      if (x === undefined || y === undefined) {
        return res.status(400).json({ success: false, error: 'x and y coordinates are required' });
      }

      await browserController.mouseMove(x, y);
      return res.json({ success: true, data: { x, y } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Mouse down
  router.post('/mouse/down', async (req: Request<{}, {}, MouseButtonRequest>, res: Response<ApiResponse>) => {
    try {
      const { button = 'left' } = req.body;
      await browserController.mouseDown(button);
      res.json({ success: true, data: { button } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Mouse up
  router.post('/mouse/up', async (req: Request<{}, {}, MouseButtonRequest>, res: Response<ApiResponse>) => {
    try {
      const { button = 'left' } = req.body;
      await browserController.mouseUp(button);
      res.json({ success: true, data: { button } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Mouse wheel
  router.post('/mouse/wheel', async (req: Request<{}, {}, MouseWheelRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { deltaY, deltaX = 0 } = req.body;
      if (deltaY === undefined) {
        return res.status(400).json({ success: false, error: 'deltaY is required' });
      }

      await browserController.mouseWheel(deltaY, deltaX);
      return res.json({ success: true, data: { deltaX, deltaY } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
