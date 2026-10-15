import pg from 'pg';
import { newDb } from 'pg-mem';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ProductDb {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  getClient: () => Promise<pg.PoolClient>;
  checkHealth: () => Promise<boolean>;
  close: () => Promise<void>;
  isMemory: boolean;
}

let dbInstance: ProductDb | null = null;

const schemaSql = `
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  category VARCHAR(100) NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
`;

const sampleProducts = [
  {
    id: 'prod-1',
    name: 'AeroPulse ANC Wireless Headphones',
    description: 'Active noise cancelling with 40-hour battery life and custom spatial sound drivers.',
    price_cents: 24999,
    category: 'Audio',
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
  },
  {
    id: 'prod-2',
    name: 'KeyForge Custom Mechanical Keyboard',
    description: 'Hot-swappable tactile switches with aircraft-grade aluminum frame and RGB backlighting.',
    price_cents: 12950,
    category: 'Electronics',
    image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80',
  },
  {
    id: 'prod-3',
    name: 'ApexGlide Precision Gaming Mouse',
    description: '26,000 DPI optical sensor, optical switches, ultra-lightweight 58g honeycomb chassis.',
    price_cents: 7900,
    category: 'Electronics',
    image_url: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&q=80',
  },
  {
    id: 'prod-4',
    name: 'Artisan Vegan Leather Desk Mat',
    description: 'Spill-resistant double-sided executive desk pad with magnetic cable organizer.',
    price_cents: 3500,
    category: 'Home & Office',
    image_url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80',
  },
  {
    id: 'prod-5',
    name: 'UltraView 27-inch 4K Studio Monitor',
    description: 'Factory color-calibrated IPS panel with 90W USB-C power delivery and daisy-chaining.',
    price_cents: 42000,
    category: 'Electronics',
    image_url: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80',
  },
  {
    id: 'prod-6',
    name: 'ThermalFlex Merino Everyday Hoodie',
    description: '100% sustainably sourced extra-fine merino wool for climate-controlled comfort.',
    price_cents: 8800,
    category: 'Apparel',
    image_url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80',
  },
  {
    id: 'prod-7',
    name: 'MagnaLift Ergonomic Laptop Stand',
    description: 'Foldable multi-angle anodized aluminum riser with silicone anti-slip grips.',
    price_cents: 4500,
    category: 'Home & Office',
    image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80',
  },
  {
    id: 'prod-8',
    name: 'LuminaBar Monitor Lightbar',
    description: 'Asymmetric optical glare-free desk lamp with wireless rotary brightness puck.',
    price_cents: 6400,
    category: 'Home & Office',
    image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80',
  },
];

export async function getProductDb(): Promise<ProductDb> {
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
        logger.info(`Connected to PostgreSQL for Product Service (attempt ${attempt}/${maxRetries})`);
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
        for (const p of sampleProducts) {
          await pool.query(
            `INSERT INTO products (id, name, description, price_cents, category, image_url)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [p.id, p.name, p.description, p.price_cents, p.category, p.image_url]
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

  // In-Memory PostgreSQL Engine for isolated local development & tests
  const memDb = newDb();
  memDb.public.none(schemaSql);

  // Seed sample products
  for (const p of sampleProducts) {
    memDb.public.none(
      `INSERT INTO products (id, name, description, price_cents, category, image_url)
       VALUES ('${p.id}', '${p.name.replace(/'/g, "''")}', '${p.description.replace(/'/g, "''")}', ${p.price_cents}, '${p.category}', '${p.image_url}')
       ON CONFLICT (id) DO NOTHING;`
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

  logger.info('Initialized Product Service with in-memory PostgreSQL');
  return dbInstance;
}
