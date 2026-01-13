import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { PdfExportOptions, ApiResponse, PdfExportResult } from '../../types/browser.js';

export function exportRoutes(browserController: BrowserController): Router {
  const router = Router();

  // Export page as PDF
  // POST /api/pdf
  // Body: PdfExportOptions (all optional)
  router.post('/pdf', async (req: Request<{}, {}, PdfExportOptions>, res: Response) => {
    try {
      const options: PdfExportOptions = req.body || {};
      const { data, result } = await browserController.exportPDF(options);

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="export-${Date.now()}.pdf"`);
      res.set('X-PDF-Size', result.size.toString());
      res.set('X-PDF-URL', encodeURIComponent(result.url));
      res.set('X-PDF-Title', encodeURIComponent(result.title));
      if (result.timestamp) {
        res.set('X-PDF-Timestamp', result.timestamp);
      }

      res.send(data);
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Export page as PDF with metadata response (JSON)
  // POST /api/pdf/info
  // Body: PdfExportOptions (all optional)
  // Returns: base64 encoded PDF with metadata
  router.post('/pdf/info', async (req: Request<{}, {}, PdfExportOptions>, res: Response<ApiResponse<PdfExportResult & { base64: string }>>) => {
    try {
      const options: PdfExportOptions = req.body || {};
      const { data, result } = await browserController.exportPDF(options);

      res.json({
        success: true,
        data: {
          ...result,
          base64: data.toString('base64'),
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
