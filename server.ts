import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

import { productRouter } from './services/product-service/src/routes/product.routes.js';
import { healthRouter as productHealthRouter } from './services/product-service/src/routes/health.routes.js';
import { getProductDb } from './services/product-service/src/db/client.js';

import { inventoryRouter } from './services/inventory-service/src/routes/inventory.routes.js';
import { healthRouter as inventoryHealthRouter } from './services/inventory-service/src/routes/health.routes.js';
import { getInventoryDb } from './services/inventory-service/src/db/client.js';

import { authRouter } from './services/order-service/src/routes/auth.routes.js';
import { orderRouter } from './services/order-service/src/routes/order.routes.js';
import { healthRouter as orderHealthRouter } from './services/order-service/src/routes/health.routes.js';
import { getOrderDb } from './services/order-service/src/db/client.js';
import { config as orderConfig } from './services/order-service/src/config.js';

import { correlationIdMiddleware } from './services/order-service/src/middleware/correlationId.js';
import { errorHandler } from './services/order-service/src/middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use(correlationIdMiddleware);

  const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL;
  const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL;
  const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL;

  const isExternalMicroservices = Boolean(
    PRODUCT_SERVICE_URL && !PRODUCT_SERVICE_URL.includes(`localhost:${PORT}`)
  );

  function createServiceProxy(targetBaseUrl: string) {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const targetUrl = new URL(req.originalUrl, targetBaseUrl).toString();
        const headers = new Headers();
        for (const [key, val] of Object.entries(req.headers)) {
          if (key.toLowerCase() === 'host') continue;
          if (val) {
            if (Array.isArray(val)) {
              val.forEach(v => headers.append(key, v));
            } else {
              headers.set(key, val);
            }
          }
        }

        const method = req.method.toUpperCase();
        const options: RequestInit = {
          method,
          headers,
        };

        if (!['GET', 'HEAD'].includes(method) && req.body) {
          options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, options);
        res.status(response.status);
        response.headers.forEach((value, name) => {
          if (name.toLowerCase() !== 'transfer-encoding' && name.toLowerCase() !== 'content-encoding') {
            res.setHeader(name, value);
          }
        });

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      } catch (err: any) {
        next(err);
      }
    };
  }

  if (isExternalMicroservices) {
    // Distributed Microservices Gateway Mode
    console.log('Routing API traffic as Gateway to microservices:', {
      productService: PRODUCT_SERVICE_URL,
      inventoryService: INVENTORY_SERVICE_URL,
      orderService: ORDER_SERVICE_URL,
    });

    if (PRODUCT_SERVICE_URL) {
      app.use('/api/products', createServiceProxy(PRODUCT_SERVICE_URL));
      app.use('/health/product', createServiceProxy(PRODUCT_SERVICE_URL));
    }
    if (INVENTORY_SERVICE_URL) {
      app.use('/api/inventory', createServiceProxy(INVENTORY_SERVICE_URL));
      app.use('/health/inventory', createServiceProxy(INVENTORY_SERVICE_URL));
    }
    if (ORDER_SERVICE_URL) {
      app.use('/api/auth', createServiceProxy(ORDER_SERVICE_URL));
      app.use('/api/orders', createServiceProxy(ORDER_SERVICE_URL));
      app.use('/health/order', createServiceProxy(ORDER_SERVICE_URL));
    }
  } else {
    // Unified In-Process Development Mode
    await getProductDb();
    await getInventoryDb();
    await getOrderDb();

    orderConfig.PRODUCT_SERVICE_URL = `http://localhost:${PORT}`;
    orderConfig.INVENTORY_SERVICE_URL = `http://localhost:${PORT}`;

    // API Routes
    app.use('/api/products', productRouter);
    app.use('/api/inventory', inventoryRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/orders', orderRouter);

    // Microservices Health Endpoints
    app.use('/health/product', productHealthRouter);
    app.use('/health/inventory', inventoryHealthRouter);
    app.use('/health/order', orderHealthRouter);
  }

  // Global Unified Health Check
  app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'shopsphere-gateway', timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', async (req, res) => {
    if (isExternalMicroservices) {
      try {
        const [pRes, iRes, oRes] = await Promise.all([
          PRODUCT_SERVICE_URL ? fetch(`${PRODUCT_SERVICE_URL}/health/live`).then(r => r.ok).catch(() => false) : true,
          INVENTORY_SERVICE_URL ? fetch(`${INVENTORY_SERVICE_URL}/health/live`).then(r => r.ok).catch(() => false) : true,
          ORDER_SERVICE_URL ? fetch(`${ORDER_SERVICE_URL}/health/live`).then(r => r.ok).catch(() => false) : true,
        ]);

        const allReady = pRes && iRes && oRes;
        res.status(allReady ? 200 : 503).json({
          status: allReady ? 'READY' : 'DEGRADED',
          checks: {
            productService: pRes ? 'UP' : 'DOWN',
            inventoryService: iRes ? 'UP' : 'DOWN',
            orderService: oRes ? 'UP' : 'DOWN',
          },
          timestamp: new Date().toISOString(),
        });
      } catch {
        res.status(503).json({ status: 'DOWN', timestamp: new Date().toISOString() });
      }
      return;
    }

    try {
      const pDb = await getProductDb();
      const iDb = await getInventoryDb();
      const oDb = await getOrderDb();

      const [pHealthy, iHealthy, oHealthy] = await Promise.all([
        pDb.checkHealth(),
        iDb.checkHealth(),
        oDb.checkHealth(),
      ]);

      const allReady = pHealthy && iHealthy && oHealthy;

      res.status(allReady ? 200 : 503).json({
        status: allReady ? 'READY' : 'DEGRADED',
        checks: {
          productDatabase: pHealthy ? 'UP' : 'DOWN',
          inventoryDatabase: iHealthy ? 'UP' : 'DOWN',
          orderDatabase: oHealthy ? 'UP' : 'DOWN',
        },
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({ status: 'DOWN', timestamp: new Date().toISOString() });
    }
  });

  app.get('/health', async (req, res) => {
    res.status(200).json({
      status: 'HEALTHY',
      app: 'ShopSphere E-Commerce System',
      services: ['product-service', 'inventory-service', 'order-service'],
      mode: isExternalMicroservices ? 'distributed-gateway' : 'unified-dev',
      timestamp: new Date().toISOString(),
    });
  });

  // OpenAPI Specification endpoint
  app.get('/api/docs/openapi.json', (req, res) => {
    const specPath = fs.existsSync(path.join(__dirname, 'docs', 'openapi.json'))
      ? path.join(__dirname, 'docs', 'openapi.json')
      : path.join(__dirname, '..', 'docs', 'openapi.json');

    if (fs.existsSync(specPath)) {
      res.setHeader('Content-Type', 'application/json');
      fs.createReadStream(specPath).pipe(res);
    } else {
      res.status(404).json({ error: 'OpenAPI specification not found' });
    }
  });

  // Centralized Error Handler for API
  app.use('/api', errorHandler);

  // Frontend Serving
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(__dirname, 'dist'))
      ? path.join(__dirname, 'dist')
      : path.join(__dirname, '..', 'dist');

    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ShopSphere running on http://0.0.0.0:${PORT} [${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}]`);
  });

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    console.log(`Received ${sig}. Shutting down unified server...`);
    server.close(async () => {
      if (!isExternalMicroservices) {
        try {
          const pDb = await getProductDb();
          const iDb = await getInventoryDb();
          const oDb = await getOrderDb();
          await Promise.all([pDb.close(), iDb.close(), oDb.close()]);
          console.log('All database pools closed.');
        } catch (e) {
          console.error('Error during shutdown', e);
        }
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
