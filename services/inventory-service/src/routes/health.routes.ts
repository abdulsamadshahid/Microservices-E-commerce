import { Router } from 'express';
import { getInventoryDb } from '../db/client.js';
import { metrics } from '../metrics.js';

export const healthRouter = Router();

// Liveness probe: process is alive
healthRouter.get('/live', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'inventory-service',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Readiness probe: verifies DB connectivity
healthRouter.get('/ready', async (req, res) => {
  try {
    const db = await getInventoryDb();
    const dbHealthy = await db.checkHealth();

    if (!dbHealthy) {
      return res.status(503).json({
        status: 'DOWN',
        service: 'inventory-service',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'DOWN',
        },
      });
    }

    return res.status(200).json({
      status: 'READY',
      service: 'inventory-service',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'UP',
        engine: db.isMemory ? 'in-memory-postgresql' : 'postgresql',
      },
    });
  } catch {
    return res.status(503).json({
      status: 'DOWN',
      service: 'inventory-service',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'DOWN',
      },
    });
  }
});

// Concise general health
healthRouter.get('/', async (req, res) => {
  const db = await getInventoryDb();
  const dbHealthy = await db.checkHealth();

  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'HEALTHY' : 'DEGRADED',
    service: 'inventory-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Prometheus metrics endpoint
healthRouter.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics.toPrometheusFormat('inventory_service'));
});
