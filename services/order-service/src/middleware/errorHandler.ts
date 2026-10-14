import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';
import { config } from '../config.js';

export interface AppErrorOptions {
  message: string;
  statusCode: number;
  code: string;
  details?: unknown;
}

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor({ message, statusCode, code, details }: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const correlationId = req.correlationId || 'unknown';

  if (err instanceof ZodError) {
    const rawIssues = err.issues || [];
    const issues = rawIssues.map(e => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path),
      message: e.message,
    }));

    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: issues,
        correlationId,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        correlationId,
      },
    });
  }

  logger.error('Unhandled internal server error', {
    correlationId,
    error: err.message,
    stack: config.NODE_ENV === 'development' ? err.stack : undefined,
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred in Order Service.',
      correlationId,
    },
  });
}
