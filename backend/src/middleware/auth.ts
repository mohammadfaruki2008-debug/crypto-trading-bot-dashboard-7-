/**
 * Admin auth middleware — checks X-Admin-Token header.
 * Public endpoints (price, health, candles) skip this; mutating endpoints require it.
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('X-Admin-Token') || (req.query.token as string);
  if (!token || token !== config.security.adminToken) {
    res.status(401).json({ error: 'Unauthorized — invalid or missing X-Admin-Token' });
    return;
  }
  next();
}
