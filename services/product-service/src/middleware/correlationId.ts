import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { metrics } from '../metrics.js';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      startTime: number;
    }
  }
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId = (req.header('x-correlation-id') || uuidv4()) as string;
  req.correlationId = correlationId;
  req.startTime = Date.now();

  res.setHeader('x-correlation-id', correlationId);

  res.on('finish', () => {
    const durationMs = Date.now() - req.startTime;
    const route = req.route?.path || req.path;

    metrics.recordRequest(req.method, route, res.statusCode, durationMs);

    logger.log({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      message: `${req.method} ${req.originalUrl} responded with ${res.statusCode} (${durationMs}ms)`,
      correlationId,
      method: req.method,
      route: req.originalUrl,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
