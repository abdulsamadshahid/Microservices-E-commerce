import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getProductDb } from '../src/db/client.js';

describe('Product Service Tests', () => {
  const app = createApp();

  before(async () => {
    await getProductDb();
  });

  after(async () => {
    const db = await getProductDb();
    await db.close();
  });

  test('GET /health/live returns 200 with UP status', async () => {
    const res = await request(app).get('/health/live');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'UP');
    assert.equal(res.body.service, 'product-service');
  });

  test('GET /health/ready returns 200 with database check', async () => {
    const res = await request(app).get('/health/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'READY');
    assert.equal(res.body.checks.database, 'UP');
  });

  test('GET /api/products returns product listing', async () => {
    const res = await request(app).get('/api/products');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 8);
  });

  test('GET /api/products/:id retrieves a single product', async () => {
    const res = await request(app).get('/api/products/prod-1');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, 'prod-1');
    assert.equal(res.body.data.name, 'AeroPulse ANC Wireless Headphones');
    assert.equal(res.body.data.price_cents, 24999);
  });

  test('GET /api/products/:id returns 404 for unknown product', async () => {
    const res = await request(app).get('/api/products/prod-non-existent-999');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND');
    assert.ok(res.body.error.correlationId);
  });

  test('GET /api/products?category=Audio filters by category', async () => {
    const res = await request(app).get('/api/products?category=Audio');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    for (const p of res.body.data) {
      assert.equal(p.category, 'Audio');
    }
  });

  test('GET /api/products?search=Mechanical searches by keyword', async () => {
    const res = await request(app).get('/api/products?search=Mechanical');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data[0].name.includes('Mechanical'));
  });
});
