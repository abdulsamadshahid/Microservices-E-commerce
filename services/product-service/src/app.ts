import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { productRouter } from './routes/product.routes.js';
import { healthRouter } from './routes/health.routes.js';

export function createApp() {
  const app = express();

  // Basic security and parsing
  app.disable('x-powered-by');
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Correlation ID and structured request logger
  app.use(correlationIdMiddleware);

  // Health and Metrics routes
  app.use('/health', healthRouter);
  app.use('/metrics', (req, res) => {
    res.redirect('/health/metrics');
  });

  // Business API routes
  app.use('/api/products', productRouter);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route '${req.method} ${req.path}' not found on product-service.`,
        correlationId: req.correlationId,
      },
    });
  });

  // Centralized Error handler
  app.use(errorHandler);

  return app;
}
