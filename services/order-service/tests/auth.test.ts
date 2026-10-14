import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getOrderDb } from '../src/db/client.js';

describe('Auth & User Tests', () => {
  const app = createApp();

  before(async () => {
    await getOrderDb();
  });

  after(async () => {
    const db = await getOrderDb();
    await db.close();
  });

  test('POST /api/auth/register creates a new account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'charlie@example.com',
        password: 'securepassword123',
        name: 'Charlie Brown',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, 'charlie@example.com');
    assert.ok(res.body.data.token);
  });

  test('POST /api/auth/register rejects duplicate email with 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'charlie@example.com',
        password: 'anotherpassword123',
        name: 'Charlie Twin',
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'USER_ALREADY_EXISTS');
  });

  test('POST /api/auth/register rejects short password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'short@example.com',
        password: 'short',
        name: 'Shorty',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  test('POST /api/auth/login succeeds with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'password123',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.email, 'alice@example.com');
  });

  test('POST /api/auth/login rejects invalid password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'wrongpassword',
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  });

  test('GET /api/auth/me rejects unauthorized request with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  test('GET /api/auth/me succeeds with valid JWT Bearer header', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'password123',
      });

    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.data.email, 'alice@example.com');
  });
});
