import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from './errorHandler.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Missing or malformed Authorization header.',
      })
    );
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err: any) {
    return next(
      new AppError({
        statusCode: 401,
        code: 'INVALID_TOKEN',
        message: err.name === 'TokenExpiredError' ? 'Authentication token has expired.' : 'Invalid authentication token.',
      })
    );
  }
}
