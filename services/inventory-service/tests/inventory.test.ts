import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getInventoryDb } from '../src/db/client.js';

describe('Inventory Service Tests', () => {
  const app = createApp();

  before(async () => {
    await getInventoryDb();
  });

  after(async () => {
    const db = await getInventoryDb();
    await db.close();
  });

  test('GET /health/live returns 200 with UP status', async () => {
    const res = await request(app).get('/health/live');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'UP');
  });

  test('GET /health/ready returns 200 with database check', async () => {
    const res = await request(app).get('/health/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'READY');
    assert.equal(res.body.checks.database, 'UP');
  });

  test('GET /api/inventory/:productId retrieves stock level', async () => {
    const res = await request(app).get('/api/inventory/prod-1');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.productId, 'prod-1');
    assert.ok(typeof res.body.data.availableStock === 'number');
  });

  test('POST /api/inventory/reservations atomically reserves stock', async () => {
    const initialRes = await request(app).get('/api/inventory/prod-2');
    const initialStock = initialRes.body.data.availableStock;

    const res = await request(app)
      .post('/api/inventory/reservations')
      .send({
        orderId: 'test-order-1',
        items: [{ productId: 'prod-2', quantity: 3 }],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const postRes = await request(app).get('/api/inventory/prod-2');
    assert.equal(postRes.body.data.availableStock, initialStock - 3);
  });

  test('POST /api/inventory/reservations rejects request with insufficient stock', async () => {
    const res = await request(app)
      .post('/api/inventory/reservations')
      .send({
        orderId: 'test-order-oversell',
        items: [{ productId: 'prod-8', quantity: 9999 }],
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INSUFFICIENT_INVENTORY');
  });

  test('Compensation: POST /api/inventory/reservations/release restores stock', async () => {
    // 1. Reserve 2 items of prod-3
    const initialRes = await request(app).get('/api/inventory/prod-3');
    const initialStock = initialRes.body.data.availableStock;

    await request(app)
      .post('/api/inventory/reservations')
      .send({
        orderId: 'test-order-compensation',
        items: [{ productId: 'prod-3', quantity: 2 }],
      });

    const reservedRes = await request(app).get('/api/inventory/prod-3');
    assert.equal(reservedRes.body.data.availableStock, initialStock - 2);

    // 2. Compensate / Release
    const releaseRes = await request(app)
      .post('/api/inventory/reservations/release')
      .send({
        orderId: 'test-order-compensation',
        items: [{ productId: 'prod-3', quantity: 2 }],
      });

    assert.equal(releaseRes.status, 200);

    // 3. Stock restored
    const finalRes = await request(app).get('/api/inventory/prod-3');
    assert.equal(finalRes.body.data.availableStock, initialStock);
  });

  test('Concurrent reservation requests do not oversell inventory', async () => {
    // Set stock of prod-8 to 5
    await request(app)
      .post('/api/inventory/adjustments')
      .set('Authorization', 'Bearer dev_inventory_admin_secret_key_change_in_prod')
      .send({ productId: 'prod-8', stock: 5 });

    // Send 10 concurrent requests each asking for 1 item
    const promises = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post('/api/inventory/reservations')
        .send({
          orderId: `concurrent-order-${i}`,
          items: [{ productId: 'prod-8', quantity: 1 }],
        })
    );

    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 201);
    const conflicts = results.filter(r => r.status === 409);

    assert.equal(successes.length, 5, 'Exactly 5 orders should succeed');
    assert.equal(conflicts.length, 5, 'Exactly 5 orders should be rejected due to insufficient stock');

    const finalRes = await request(app).get('/api/inventory/prod-8');
    assert.equal(finalRes.body.data.availableStock, 0, 'Stock must not drop below 0');
  });

  test('POST /api/inventory/adjustments requires valid admin authorization', async () => {
    const unauthorizedRes = await request(app)
      .post('/api/inventory/adjustments')
      .send({ productId: 'prod-1', stock: 100 });

    assert.equal(unauthorizedRes.status, 401);

    const authorizedRes = await request(app)
      .post('/api/inventory/adjustments')
      .set('Authorization', 'Bearer dev_inventory_admin_secret_key_change_in_prod')
      .send({ productId: 'prod-1', stock: 100 });

    assert.equal(authorizedRes.status, 200);
    assert.equal(authorizedRes.body.data.stock, 100);
  });
});
