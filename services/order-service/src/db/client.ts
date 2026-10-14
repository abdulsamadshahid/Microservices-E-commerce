import pg from 'pg';
import { newDb } from 'pg-mem';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface OrderDb {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  getClient: () => Promise<pg.PoolClient>;
  checkHealth: () => Promise<boolean>;
  close: () => Promise<void>;
  isMemory: boolean;
}

let dbInstance: OrderDb | null = null;

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) DEFAULT 'customer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  idempotency_key VARCHAR(128) UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);
`;

export async function getOrderDb(): Promise<OrderDb> {
  if (dbInstance) return dbInstance;

  if (config.DATABASE_URL && !config.DATABASE_URL.includes('memory')) {
    try {
      const pool = new pg.Pool({
        connectionString: config.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
      });

      await pool.query('SELECT 1');
      logger.info('Connected to PostgreSQL for Order Service');

      dbInstance = {
        query: (text, params) => pool.query(text, params),
        getClient: () => pool.connect(),
        checkHealth: async () => {
          try {
            await pool.query('SELECT 1');
            return true;
          } catch {
            return false;
          }
        },
        close: async () => {
          await pool.end();
          dbInstance = null;
        },
        isMemory: false,
      };
      return dbInstance!;
    } catch (err: any) {
      logger.warn(`PostgreSQL connection failed (${err.message}), initializing in-memory database engine for local environment.`);
    }
  }

  // In-Memory PostgreSQL Engine
  const memDb = newDb();
  memDb.public.none(schemaSql);

  // Seed default demo accounts
  const hash123 = bcrypt.hashSync('password123', 10);
  const hashAdmin = bcrypt.hashSync('admin12345', 10);

  memDb.public.none(
    `INSERT INTO users (id, email, password_hash, name, role)
     VALUES ('user-alice', 'alice@example.com', '${hash123}', 'Alice Smith', 'customer'),
            ('user-bob', 'bob@example.com', '${hash123}', 'Bob Jones', 'customer'),
            ('user-admin', 'admin@shopsphere.dev', '${hashAdmin}', 'Platform Admin', 'admin')
     ON CONFLICT (id) DO NOTHING;`
  );

  const adapter = memDb.adapters.createPg();
  const pool = new adapter.Pool();

  dbInstance = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    checkHealth: async () => true,
    close: async () => {
      await pool.end();
      dbInstance = null;
    },
    isMemory: true,
  };

  logger.info('Initialized Order Service with in-memory PostgreSQL');
  return dbInstance;
}
