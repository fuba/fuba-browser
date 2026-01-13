import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { SnapshotGenerator } from '../../browser/snapshot.js';
import { SnapshotRequest, ActionRequest, Snapshot } from '../../types/snapshot.js';
import { ApiResponse } from '../../types/browser.js';

// Store the latest snapshot for ref-based actions
let latestSnapshot: Snapshot | null = null;

export function snapshotRoutes(browserController: BrowserController, snapshotGenerator: SnapshotGenerator): Router {
  const router = Router();

  // Get page snapshot (accessibility tree with refs)
  router.get('/snapshot', async (req: Request, res: Response<ApiResponse<Snapshot>>) => {
    try {
      const options: SnapshotRequest = {
        interactive: req.query.interactive === 'true' || req.query.i === 'true',
        compact: req.query.compact === 'true' || req.query.c === 'true',
        depth: req.query.depth ? parseInt(req.query.depth as string) : undefined,
        selector: req.query.selector as string || req.query.s as string,
      };

      const snapshot = await snapshotGenerator.generate(options);
      latestSnapshot = snapshot;

      res.json({ success: true, data: snapshot });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Perform action using ref
  router.post('/action', async (req: Request<{}, {}, ActionRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { ref, action, value } = req.body;

      if (!ref) {
        return res.status(400).json({ success: false, error: 'Ref is required' });
      }

      if (!action) {
        return res.status(400).json({ success: false, error: 'Action is required' });
      }

      if (!latestSnapshot) {
        return res.status(400).json({
          success: false,
          error: 'No snapshot available. Call GET /api/snapshot first.'
        });
      }

      // Normalize ref (remove @ prefix if present)
      const normalizedRef = ref.startsWith('@') ? ref.slice(1) : ref;
      const node = latestSnapshot.refs[normalizedRef];

      if (!node) {
        return res.status(404).json({
          success: false,
          error: `Ref "${ref}" not found in snapshot`
        });
      }

      const selector = node.selector;

      switch (action) {
        case 'click':
          await browserController.click(selector);
          break;
        case 'dblclick':
          await browserController.dblclick(selector);
          break;
        case 'hover':
          await browserController.hover(selector);
          break;
        case 'focus':
          await browserController.focus(selector);
          break;
        case 'fill':
          if (value === undefined) {
            return res.status(400).json({ success: false, error: 'Value is required for fill action' });
          }
          await browserController.fill(selector, value);
          break;
        case 'type':
          if (value === undefined) {
            return res.status(400).json({ success: false, error: 'Value is required for type action' });
          }
          await browserController.type(selector, value);
          break;
        case 'check':
          await browserController.check(selector);
          break;
        case 'uncheck':
          await browserController.uncheck(selector);
          break;
        case 'select':
          if (value === undefined) {
            return res.status(400).json({ success: false, error: 'Value is required for select action' });
          }
          await browserController.select(selector, value);
          break;
        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }

      return res.json({
        success: true,
        data: {
          ref,
          action,
          selector,
          value: value || undefined
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Clear stored snapshot
  router.delete('/snapshot', async (_req: Request, res: Response<ApiResponse>) => {
    latestSnapshot = null;
    res.json({ success: true, data: { message: 'Snapshot cleared' } });
  });

  return router;
}
