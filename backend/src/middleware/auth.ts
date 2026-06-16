import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Middleware to protect API routes.
 * Frontend must send: Authorization: Bearer <ADMIN_TOKEN>
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token || token !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing ADMIN_TOKEN' });
  }
  next();
}
