import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { config as orderConfig } from '../services/order-service/src/config.js';
import { productRouter } from '../services/product-service/src/routes/product.routes.js';
import { inventoryRouter } from '../services/inventory-service/src/routes/inventory.routes.js';
import { authRouter } from '../services/order-service/src/routes/auth.routes.js';
import { orderRouter } from '../services/order-service/src/routes/order.routes.js';
import { correlationIdMiddleware } from '../services/order-service/src/middleware/correlationId.js';
import { errorHandler } from '../services/order-service/src/middleware/errorHandler.js';
import { getProductDb } from '../services/product-service/src/db/client.js';
import { getInventoryDb } from '../services/inventory-service/src/db/client.js';
import { getOrderDb } from '../services/order-service/src/db/client.js';

describe('ShopSphere End-to-End System Tests', () => {
  let gatewayApp: express.Application;
  let server: http.Server;

  before(async () => {
    // Initialize underlying databases
    await getProductDb();
    await getInventoryDb();
    await getOrderDb();

    // Create Unified Gateway App simulating same-origin reverse-proxy
    gatewayApp = express();
    gatewayApp.use(cors());
    gatewayApp.use(express.json());
    gatewayApp.use(correlationIdMiddleware);

    gatewayApp.use('/api/products', productRouter);
    gatewayApp.use('/api/inventory', inventoryRouter);
    gatewayApp.use('/api/auth', authRouter);
    gatewayApp.use('/api/orders', orderRouter);
    gatewayApp.use(errorHandler);

    server = http.createServer(gatewayApp);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;
    orderConfig.PRODUCT_SERVICE_URL = `http://127.0.0.1:${port}`;
    orderConfig.INVENTORY_SERVICE_URL = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    server?.close();
    const pDb = await getProductDb();
    await pDb.close();
    const iDb = await getInventoryDb();
    await iDb.close();
    const oDb = await getOrderDb();
    await oDb.close();
  });

  test('Complete Customer Flow: Register -> Browse -> Verify Stock -> Order -> History', async () => {
    // 1. Register new user
    const userEmail = `e2e_user_${Date.now()}@example.com`;
    const regRes = await request(gatewayApp)
      .post('/api/auth/register')
      .send({
        email: userEmail,
        password: 'securepassword123',
        name: 'E2E Shopper',
      });

    assert.equal(regRes.status, 201);
    const token = regRes.body.data.token;
    assert.ok(token);

    // 2. Browse product catalog
    const productsRes = await request(gatewayApp).get('/api/products');
    assert.equal(productsRes.status, 200);
    assert.ok(productsRes.body.data.length > 0);
    const targetProduct = productsRes.body.data[0];

    // 3. Check inventory for target product
    const initialInvRes = await request(gatewayApp).get(`/api/inventory/${targetProduct.id}`);
    assert.equal(initialInvRes.status, 200);
    const initialStock = initialInvRes.body.data.availableStock;

    // 4. Place order
    const idempotencyKey = `e2e-order-${Date.now()}`;
    const orderRes = await request(gatewayApp)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [{ productId: targetProduct.id, quantity: 2 }],
      });

    assert.equal(orderRes.status, 201);
    assert.equal(orderRes.body.data.status, 'CONFIRMED');
    assert.equal(orderRes.body.data.totalCents, targetProduct.price_cents * 2);
    const createdOrderId = orderRes.body.data.id;

    // 5. Verify inventory decremented by 2
    const postInvRes = await request(gatewayApp).get(`/api/inventory/${targetProduct.id}`);
    assert.equal(postInvRes.status, 200);
    assert.equal(postInvRes.body.data.availableStock, initialStock - 2);

    // 6. Verify order history
    const historyRes = await request(gatewayApp)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.body.data.length, 1);
    assert.equal(historyRes.body.data[0].id, createdOrderId);
  });
});
