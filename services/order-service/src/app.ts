import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.routes.js';
import { orderRouter } from './routes/order.routes.js';
import { healthRouter } from './routes/health.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(correlationIdMiddleware);

  app.use('/health', healthRouter);
  app.use('/metrics', (req, res) => {
    res.redirect('/health/metrics');
  });

  app.use('/api/auth', authRouter);
  app.use('/api/orders', orderRouter);

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route '${req.method} ${req.path}' not found on order-service.`,
        correlationId: req.correlationId,
      },
    });
  });

  app.use(errorHandler);

  return app;
}
