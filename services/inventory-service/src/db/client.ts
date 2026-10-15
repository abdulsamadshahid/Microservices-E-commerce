import pg from 'pg';
import { newDb } from 'pg-mem';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface InventoryDb {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  getClient: () => Promise<pg.PoolClient>;
  checkHealth: () => Promise<boolean>;
  close: () => Promise<void>;
  isMemory: boolean;
}

let dbInstance: InventoryDb | null = null;

const schemaSql = `
CREATE TABLE IF NOT EXISTS inventory_items (
  product_id VARCHAR(64) PRIMARY KEY,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status VARCHAR(32) NOT NULL DEFAULT 'RESERVED',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reservations_order_id ON inventory_reservations(order_id);
`;

const sampleInventory = [
  { product_id: 'prod-1', stock: 25 },
  { product_id: 'prod-2', stock: 40 },
  { product_id: 'prod-3', stock: 30 },
  { product_id: 'prod-4', stock: 50 },
  { product_id: 'prod-5', stock: 15 },
  { product_id: 'prod-6', stock: 20 },
  { product_id: 'prod-7', stock: 35 },
  { product_id: 'prod-8', stock: 3 },
];

export async function getInventoryDb(): Promise<InventoryDb> {
  if (dbInstance) return dbInstance;

  if (config.DATABASE_URL && !config.DATABASE_URL.includes('memory')) {
    const pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    const maxRetries = config.NODE_ENV === 'production' ? 10 : 3;
    let connected = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await pool.query('SELECT 1');
        connected = true;
        logger.info(`Connected to PostgreSQL for Inventory Service (attempt ${attempt}/${maxRetries})`);
        break;
      } catch (err: any) {
        logger.warn(`PostgreSQL connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    if (connected) {
      try {
        await pool.query(schemaSql);
        for (const item of sampleInventory) {
          await pool.query(
            `INSERT INTO inventory_items (product_id, stock, reserved)
             VALUES ($1, $2, 0)
             ON CONFLICT (product_id) DO NOTHING`,
            [item.product_id, item.stock]
          );
        }
      } catch (schemaErr: any) {
        logger.warn(`Schema assurance notice: ${schemaErr.message}`);
      }

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
      return dbInstance;
    } else {
      if (config.NODE_ENV === 'production') {
        throw new Error('Fatal: Unable to connect to PostgreSQL in production environment after maximum retries.');
      }
      logger.warn('PostgreSQL connection failed in development; falling back to in-memory PostgreSQL engine.');
    }
  }

  // In-Memory PostgreSQL Engine
  const memDb = newDb();
  memDb.public.none(schemaSql);

  for (const item of sampleInventory) {
    memDb.public.none(
      `INSERT INTO inventory_items (product_id, stock, reserved)
       VALUES ('${item.product_id}', ${item.stock}, 0)
       ON CONFLICT (product_id) DO NOTHING;`
    );
  }

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

  logger.info('Initialized Inventory Service with in-memory PostgreSQL');
  return dbInstance;
}
