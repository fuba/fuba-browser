import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../types/browser.js';

export function errorHandler(
  err: Error, 
  _req: Request, 
  res: Response<ApiResponse>, 
  next: NextFunction
) {
  console.error('Error:', err);
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
}