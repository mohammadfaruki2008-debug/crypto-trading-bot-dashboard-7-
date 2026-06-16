/**
 * Simple admin token middleware — frontend sends X-Admin-Token header
 * for write operations. Public read endpoints are open.
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('X-Admin-Token') || req.query.token;
  if (token !== config.security.adminToken) {
    res.status(401).json({ error: 'Unauthorized — missing or invalid X-Admin-Token' });
    return;
  }
  next();
}
