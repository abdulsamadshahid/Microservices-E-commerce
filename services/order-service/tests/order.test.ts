import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import { createApp as createOrderApp } from '../src/app.js';
import { createApp as createProductApp } from '../../product-service/src/app.js';
import { createApp as createInventoryApp } from '../../inventory-service/src/app.js';
import { config } from '../src/config.js';
import { getOrderDb } from '../src/db/client.js';
import { getProductDb } from '../../product-service/src/db/client.js';
import { getInventoryDb } from '../../inventory-service/src/db/client.js';

describe('Order Service Integration Tests', () => {
  let productServer: http.Server;
  let inventoryServer: http.Server;
  const orderApp = createOrderApp();

  let aliceToken: string;
  let bobToken: string;

  before(async () => {
    // Start live Product Service on test port
    const productApp = createProductApp();
    await getProductDb();
    productServer = http.createServer(productApp);
    await new Promise<void>(resolve => productServer.listen(0, resolve));
    const prodPort = (productServer.address() as any).port;
    config.PRODUCT_SERVICE_URL = `http://127.0.0.1:${prodPort}`;

    // Start live Inventory Service on test port
    const inventoryApp = createInventoryApp();
    await getInventoryDb();
    inventoryServer = http.createServer(inventoryApp);
    await new Promise<void>(resolve => inventoryServer.listen(0, resolve));
    const invPort = (inventoryServer.address() as any).port;
    config.INVENTORY_SERVICE_URL = `http://127.0.0.1:${invPort}`;

    await getOrderDb();

    // Authenticate Alice
    const aliceRes = await request(orderApp).post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'password123',
    });
    aliceToken = aliceRes.body.data.token;

    // Authenticate Bob
    const bobRes = await request(orderApp).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'password123',
    });
    bobToken = bobRes.body.data.token;
  });

  after(async () => {
    productServer?.close();
    inventoryServer?.close();
    const orderDb = await getOrderDb();
    await orderDb.close();
    const prodDb = await getProductDb();
    await prodDb.close();
    const invDb = await getInventoryDb();
    await invDb.close();
  });

  test('GET /health/live and GET /health/ready return 200', async () => {
    const liveRes = await request(orderApp).get('/health/live');
    assert.equal(liveRes.status, 200);
    assert.equal(liveRes.body.status, 'UP');

    const readyRes = await request(orderApp).get('/health/ready');
    assert.equal(readyRes.status, 200);
    assert.equal(readyRes.body.status, 'READY');
  });

  test('POST /api/orders rejects unauthenticated requests with 401', async () => {
    const res = await request(orderApp)
      .post('/api/orders')
      .send({
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

    assert.equal(res.status, 401);
  });

  test('POST /api/orders creates order with authoritative price calculation', async () => {
    const res = await request(orderApp)
      .post('/api/orders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        items: [
          { productId: 'prod-1', quantity: 1 }, // 24999
          { productId: 'prod-4', quantity: 2 }, // 3500 * 2 = 7000
        ],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.totalCents, 24999 + 7000);
    assert.equal(res.body.data.status, 'CONFIRMED');
    assert.equal(res.body.data.items.length, 2);
  });

  test('Idempotency: repeating order request with same Idempotency-Key returns existing order', async () => {
    const idempotencyKey = 'idem-unique-key-12345';

    const firstRes = await request(orderApp)
      .post('/api/orders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [{ productId: 'prod-3', quantity: 1 }],
      });

    assert.equal(firstRes.status, 201);
    const orderId = firstRes.body.data.id;

    // Second request with same idempotency key
    const retryRes = await request(orderApp)
      .post('/api/orders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        items: [{ productId: 'prod-3', quantity: 1 }],
      });

    // Should return the same existing order
    assert.ok(retryRes.status === 200 || retryRes.status === 201);
    assert.equal(retryRes.body.data.id, orderId);
  });

  test('Order placement fails if inventory is insufficient (409)', async () => {
    const res = await request(orderApp)
      .post('/api/orders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        items: [{ productId: 'prod-8', quantity: 9999 }],
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INSUFFICIENT_INVENTORY');
  });

  test('Order ownership enforcement: Bob cannot access Alice\'s order', async () => {
    // Alice creates an order
    const aliceOrderRes = await request(orderApp)
      .post('/api/orders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        items: [{ productId: 'prod-2', quantity: 1 }],
      });

    const aliceOrderId = aliceOrderRes.body.data.id;

    // Alice can view her order
    const aliceGetRes = await request(orderApp)
      .get(`/api/orders/${aliceOrderId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    assert.equal(aliceGetRes.status, 200);

    // Bob attempts to view Alice's order -> 403 Forbidden
    const bobGetRes = await request(orderApp)
      .get(`/api/orders/${aliceOrderId}`)
      .set('Authorization', `Bearer ${bobToken}`);

    assert.equal(bobGetRes.status, 403);
    assert.equal(bobGetRes.body.error.code, 'FORBIDDEN_ORDER_ACCESS');

    // Bob lists orders -> Alice's order must NOT appear in Bob's listing
    const bobListRes = await request(orderApp)
      .get('/api/orders')
      .set('Authorization', `Bearer ${bobToken}`);

    assert.equal(bobListRes.status, 200);
    const foundAliceOrder = bobListRes.body.data.some((o: any) => o.id === aliceOrderId);
    assert.equal(foundAliceOrder, false, 'Alice\'s order must not appear in Bob\'s list');
  });
});
