// server.ts
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

// services/product-service/src/routes/product.routes.ts
import { Router } from "express";
import { z as z2 } from "zod";

// services/product-service/src/db/client.ts
import pg from "pg";
import { newDb } from "pg-mem";

// services/product-service/src/config.ts
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();
var envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4001),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().optional()
});
var parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("\u274C Invalid environment configuration for Product Service:", JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}
var config = parsed.data;

// services/product-service/src/logger.ts
var levelOrder = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var logger = {
  log(payload) {
    const level = payload.level || "info";
    if (levelOrder[level] < levelOrder[config.LOG_LEVEL]) {
      return;
    }
    const logEntry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      service: "product-service",
      environment: config.NODE_ENV,
      level,
      ...payload
    };
    const out = JSON.stringify(logEntry);
    if (level === "error") {
      console.error(out);
    } else if (level === "warn") {
      console.warn(out);
    } else {
      console.log(out);
    }
  },
  info(message, extra) {
    this.log({ level: "info", message, ...extra });
  },
  warn(message, extra) {
    this.log({ level: "warn", message, ...extra });
  },
  error(message, extra) {
    this.log({ level: "error", message, ...extra });
  },
  debug(message, extra) {
    this.log({ level: "debug", message, ...extra });
  }
};

// services/product-service/src/db/client.ts
var dbInstance = null;
var schemaSql = `
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
var sampleProducts = [
  {
    id: "prod-1",
    name: "AeroPulse ANC Wireless Headphones",
    description: "Active noise cancelling with 40-hour battery life and custom spatial sound drivers.",
    price_cents: 24999,
    category: "Audio",
    image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80"
  },
  {
    id: "prod-2",
    name: "KeyForge Custom Mechanical Keyboard",
    description: "Hot-swappable tactile switches with aircraft-grade aluminum frame and RGB backlighting.",
    price_cents: 12950,
    category: "Electronics",
    image_url: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80"
  },
  {
    id: "prod-3",
    name: "ApexGlide Precision Gaming Mouse",
    description: "26,000 DPI optical sensor, optical switches, ultra-lightweight 58g honeycomb chassis.",
    price_cents: 7900,
    category: "Electronics",
    image_url: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&q=80"
  },
  {
    id: "prod-4",
    name: "Artisan Vegan Leather Desk Mat",
    description: "Spill-resistant double-sided executive desk pad with magnetic cable organizer.",
    price_cents: 3500,
    category: "Home & Office",
    image_url: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80"
  },
  {
    id: "prod-5",
    name: "UltraView 27-inch 4K Studio Monitor",
    description: "Factory color-calibrated IPS panel with 90W USB-C power delivery and daisy-chaining.",
    price_cents: 42e3,
    category: "Electronics",
    image_url: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80"
  },
  {
    id: "prod-6",
    name: "ThermalFlex Merino Everyday Hoodie",
    description: "100% sustainably sourced extra-fine merino wool for climate-controlled comfort.",
    price_cents: 8800,
    category: "Apparel",
    image_url: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80"
  },
  {
    id: "prod-7",
    name: "MagnaLift Ergonomic Laptop Stand",
    description: "Foldable multi-angle anodized aluminum riser with silicone anti-slip grips.",
    price_cents: 4500,
    category: "Home & Office",
    image_url: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80"
  },
  {
    id: "prod-8",
    name: "LuminaBar Monitor Lightbar",
    description: "Asymmetric optical glare-free desk lamp with wireless rotary brightness puck.",
    price_cents: 6400,
    category: "Home & Office",
    image_url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80"
  }
];
async function getProductDb() {
  if (dbInstance) return dbInstance;
  if (config.DATABASE_URL && !config.DATABASE_URL.includes("memory")) {
    const pool2 = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3
    });
    const maxRetries = config.NODE_ENV === "production" ? 10 : 3;
    let connected = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await pool2.query("SELECT 1");
        connected = true;
        logger.info(`Connected to PostgreSQL for Product Service (attempt ${attempt}/${maxRetries})`);
        break;
      } catch (err) {
        logger.warn(`PostgreSQL connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2e3));
        }
      }
    }
    if (connected) {
      try {
        await pool2.query(schemaSql);
        for (const p of sampleProducts) {
          await pool2.query(
            `INSERT INTO products (id, name, description, price_cents, category, image_url)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [p.id, p.name, p.description, p.price_cents, p.category, p.image_url]
          );
        }
      } catch (schemaErr) {
        logger.warn(`Schema assurance notice: ${schemaErr.message}`);
      }
      dbInstance = {
        query: (text, params) => pool2.query(text, params),
        getClient: () => pool2.connect(),
        checkHealth: async () => {
          try {
            await pool2.query("SELECT 1");
            return true;
          } catch {
            return false;
          }
        },
        close: async () => {
          await pool2.end();
          dbInstance = null;
        },
        isMemory: false
      };
      return dbInstance;
    } else {
      if (config.NODE_ENV === "production") {
        throw new Error("Fatal: Unable to connect to PostgreSQL in production environment after maximum retries.");
      }
      logger.warn("PostgreSQL connection failed in development; falling back to in-memory PostgreSQL engine.");
    }
  }
  const memDb = newDb();
  memDb.public.none(schemaSql);
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
    isMemory: true
  };
  logger.info("Initialized Product Service with in-memory PostgreSQL");
  return dbInstance;
}

// services/product-service/src/middleware/errorHandler.ts
import { ZodError } from "zod";
var AppError = class extends Error {
  statusCode;
  code;
  details;
  constructor({ message, statusCode, code, details }) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
};

// services/product-service/src/services/product.service.ts
var ProductService = class {
  static async listProducts(search, category) {
    const db = await getProductDb();
    let query = "SELECT * FROM products WHERE 1=1";
    const params = [];
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(description) LIKE $${params.length})`;
    }
    query += " ORDER BY name ASC";
    const result = await db.query(query, params);
    return result.rows;
  }
  static async getProductById(id) {
    const db = await getProductDb();
    const result = await db.query("SELECT * FROM products WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      throw new AppError({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND",
        message: `Product with ID '${id}' was not found.`
      });
    }
    return result.rows[0];
  }
  static async seedProducts() {
    const db = await getProductDb();
    const countRes = await db.query("SELECT COUNT(*) as count FROM products");
    return parseInt(countRes.rows[0].count, 10);
  }
};

// services/product-service/src/routes/product.routes.ts
var productRouter = Router();
var querySchema = z2.object({
  search: z2.string().optional(),
  category: z2.string().optional()
});
productRouter.get("/", async (req, res, next) => {
  try {
    const validated = querySchema.parse(req.query);
    const products = await ProductService.listProducts(validated.search, validated.category);
    res.status(200).json({
      success: true,
      data: products,
      count: products.length,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
productRouter.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "product-service",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
productRouter.get("/:id", async (req, res, next) => {
  try {
    const product = await ProductService.getProductById(req.params.id);
    res.status(200).json({
      success: true,
      data: product,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
productRouter.post("/seed", async (req, res, next) => {
  try {
    const count = await ProductService.seedProducts();
    res.status(200).json({
      success: true,
      message: "Product catalog seed verified.",
      productCount: count,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});

// services/product-service/src/routes/health.routes.ts
import { Router as Router2 } from "express";

// services/product-service/src/metrics.ts
var MetricsRegistry = class {
  requestCount = {};
  requestDurationSum = {};
  errorCount = {};
  recordRequest(method, route, status, durationMs) {
    const key = `method="${method}",route="${route}",status="${status}"`;
    this.requestCount[key] = (this.requestCount[key] || 0) + 1;
    this.requestDurationSum[key] = (this.requestDurationSum[key] || 0) + durationMs / 1e3;
    if (status >= 400) {
      const errKey = `route="${route}",status="${status}"`;
      this.errorCount[errKey] = (this.errorCount[errKey] || 0) + 1;
    }
  }
  toPrometheusFormat(serviceName = "product_service") {
    const lines = [
      `# HELP ${serviceName}_http_requests_total Total number of HTTP requests processed`,
      `# TYPE ${serviceName}_http_requests_total counter`
    ];
    for (const [labels, count] of Object.entries(this.requestCount)) {
      lines.push(`${serviceName}_http_requests_total{${labels}} ${count}`);
    }
    lines.push(
      `# HELP ${serviceName}_http_request_duration_seconds_total Total duration of HTTP requests in seconds`,
      `# TYPE ${serviceName}_http_request_duration_seconds_total counter`
    );
    for (const [labels, duration] of Object.entries(this.requestDurationSum)) {
      lines.push(`${serviceName}_http_request_duration_seconds_total{${labels}} ${duration.toFixed(4)}`);
    }
    lines.push(
      `# HELP ${serviceName}_http_errors_total Total number of HTTP errors`,
      `# TYPE ${serviceName}_http_errors_total counter`
    );
    for (const [labels, count] of Object.entries(this.errorCount)) {
      lines.push(`${serviceName}_http_errors_total{${labels}} ${count}`);
    }
    return lines.join("\n") + "\n";
  }
};
var metrics = new MetricsRegistry();

// services/product-service/src/routes/health.routes.ts
var healthRouter = Router2();
healthRouter.get("/live", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "product-service",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});
healthRouter.get("/ready", async (req, res) => {
  try {
    const db = await getProductDb();
    const dbHealthy = await db.checkHealth();
    if (!dbHealthy) {
      return res.status(503).json({
        status: "DOWN",
        service: "product-service",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        checks: {
          database: "DOWN"
        }
      });
    }
    return res.status(200).json({
      status: "READY",
      service: "product-service",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      checks: {
        database: "UP",
        engine: db.isMemory ? "in-memory-postgresql" : "postgresql"
      }
    });
  } catch {
    return res.status(503).json({
      status: "DOWN",
      service: "product-service",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      checks: {
        database: "DOWN"
      }
    });
  }
});
healthRouter.get("/", async (req, res) => {
  const db = await getProductDb();
  const dbHealthy = await db.checkHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "HEALTHY" : "DEGRADED",
    service: "product-service",
    version: "1.0.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
healthRouter.get("/metrics", (req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(metrics.toPrometheusFormat("product_service"));
});

// services/inventory-service/src/routes/inventory.routes.ts
import { Router as Router3 } from "express";
import { z as z4 } from "zod";

// services/inventory-service/src/services/inventory.service.ts
import { v4 as uuidv4 } from "uuid";

// services/inventory-service/src/db/client.ts
import pg2 from "pg";
import { newDb as newDb2 } from "pg-mem";

// services/inventory-service/src/config.ts
import { z as z3 } from "zod";
import dotenv2 from "dotenv";
dotenv2.config();
var envSchema2 = z3.object({
  NODE_ENV: z3.enum(["development", "test", "production"]).default("development"),
  PORT: z3.coerce.number().default(4002),
  LOG_LEVEL: z3.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGIN: z3.string().default("*"),
  DATABASE_URL: z3.string().optional(),
  ADMIN_API_SECRET: z3.string().default("dev_inventory_admin_secret_key_change_in_prod")
});
var parsed2 = envSchema2.safeParse(process.env);
if (!parsed2.success) {
  console.error("\u274C Invalid environment configuration for Inventory Service:", JSON.stringify(parsed2.error.format(), null, 2));
  process.exit(1);
}
var config2 = parsed2.data;

// services/inventory-service/src/logger.ts
var levelOrder2 = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var logger2 = {
  log(payload) {
    const level = payload.level || "info";
    if (levelOrder2[level] < levelOrder2[config2.LOG_LEVEL]) {
      return;
    }
    const logEntry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      service: "inventory-service",
      environment: config2.NODE_ENV,
      level,
      ...payload
    };
    const out = JSON.stringify(logEntry);
    if (level === "error") {
      console.error(out);
    } else if (level === "warn") {
      console.warn(out);
    } else {
      console.log(out);
    }
  },
  info(message, extra) {
    this.log({ level: "info", message, ...extra });
  },
  warn(message, extra) {
    this.log({ level: "warn", message, ...extra });
  },
  error(message, extra) {
    this.log({ level: "error", message, ...extra });
  },
  debug(message, extra) {
    this.log({ level: "debug", message, ...extra });
  }
};

// services/inventory-service/src/db/client.ts
var dbInstance2 = null;
var schemaSql2 = `
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
var sampleInventory = [
  { product_id: "prod-1", stock: 25 },
  { product_id: "prod-2", stock: 40 },
  { product_id: "prod-3", stock: 30 },
  { product_id: "prod-4", stock: 50 },
  { product_id: "prod-5", stock: 15 },
  { product_id: "prod-6", stock: 20 },
  { product_id: "prod-7", stock: 35 },
  { product_id: "prod-8", stock: 3 }
];
async function getInventoryDb() {
  if (dbInstance2) return dbInstance2;
  if (config2.DATABASE_URL && !config2.DATABASE_URL.includes("memory")) {
    const pool2 = new pg2.Pool({
      connectionString: config2.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3
    });
    const maxRetries = config2.NODE_ENV === "production" ? 10 : 3;
    let connected = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await pool2.query("SELECT 1");
        connected = true;
        logger2.info(`Connected to PostgreSQL for Inventory Service (attempt ${attempt}/${maxRetries})`);
        break;
      } catch (err) {
        logger2.warn(`PostgreSQL connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2e3));
        }
      }
    }
    if (connected) {
      try {
        await pool2.query(schemaSql2);
        for (const item of sampleInventory) {
          await pool2.query(
            `INSERT INTO inventory_items (product_id, stock, reserved)
             VALUES ($1, $2, 0)
             ON CONFLICT (product_id) DO NOTHING`,
            [item.product_id, item.stock]
          );
        }
      } catch (schemaErr) {
        logger2.warn(`Schema assurance notice: ${schemaErr.message}`);
      }
      dbInstance2 = {
        query: (text, params) => pool2.query(text, params),
        getClient: () => pool2.connect(),
        checkHealth: async () => {
          try {
            await pool2.query("SELECT 1");
            return true;
          } catch {
            return false;
          }
        },
        close: async () => {
          await pool2.end();
          dbInstance2 = null;
        },
        isMemory: false
      };
      return dbInstance2;
    } else {
      if (config2.NODE_ENV === "production") {
        throw new Error("Fatal: Unable to connect to PostgreSQL in production environment after maximum retries.");
      }
      logger2.warn("PostgreSQL connection failed in development; falling back to in-memory PostgreSQL engine.");
    }
  }
  const memDb = newDb2();
  memDb.public.none(schemaSql2);
  for (const item of sampleInventory) {
    memDb.public.none(
      `INSERT INTO inventory_items (product_id, stock, reserved)
       VALUES ('${item.product_id}', ${item.stock}, 0)
       ON CONFLICT (product_id) DO NOTHING;`
    );
  }
  const adapter = memDb.adapters.createPg();
  const pool = new adapter.Pool();
  dbInstance2 = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    checkHealth: async () => true,
    close: async () => {
      await pool.end();
      dbInstance2 = null;
    },
    isMemory: true
  };
  logger2.info("Initialized Inventory Service with in-memory PostgreSQL");
  return dbInstance2;
}

// services/inventory-service/src/middleware/errorHandler.ts
import { ZodError as ZodError2 } from "zod";
var AppError2 = class extends Error {
  statusCode;
  code;
  details;
  constructor({ message, statusCode, code, details }) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
};

// services/inventory-service/src/metrics.ts
var InventoryMetricsRegistry = class {
  requestCount = {};
  requestDurationSum = {};
  errorCount = {};
  reservationsTotal = 0;
  reservationFailuresTotal = 0;
  recordRequest(method, route, status, durationMs) {
    const key = `method="${method}",route="${route}",status="${status}"`;
    this.requestCount[key] = (this.requestCount[key] || 0) + 1;
    this.requestDurationSum[key] = (this.requestDurationSum[key] || 0) + durationMs / 1e3;
    if (status >= 400) {
      const errKey = `route="${route}",status="${status}"`;
      this.errorCount[errKey] = (this.errorCount[errKey] || 0) + 1;
    }
  }
  recordReservation(success) {
    if (success) {
      this.reservationsTotal += 1;
    } else {
      this.reservationFailuresTotal += 1;
    }
  }
  toPrometheusFormat(serviceName = "inventory_service") {
    const lines = [
      `# HELP ${serviceName}_http_requests_total Total number of HTTP requests processed`,
      `# TYPE ${serviceName}_http_requests_total counter`
    ];
    for (const [labels, count] of Object.entries(this.requestCount)) {
      lines.push(`${serviceName}_http_requests_total{${labels}} ${count}`);
    }
    lines.push(
      `# HELP ${serviceName}_http_request_duration_seconds_total Total duration of HTTP requests in seconds`,
      `# TYPE ${serviceName}_http_request_duration_seconds_total counter`
    );
    for (const [labels, duration] of Object.entries(this.requestDurationSum)) {
      lines.push(`${serviceName}_http_request_duration_seconds_total{${labels}} ${duration.toFixed(4)}`);
    }
    lines.push(
      `# HELP ${serviceName}_http_errors_total Total number of HTTP errors`,
      `# TYPE ${serviceName}_http_errors_total counter`
    );
    for (const [labels, count] of Object.entries(this.errorCount)) {
      lines.push(`${serviceName}_http_errors_total{${labels}} ${count}`);
    }
    lines.push(
      `# HELP ${serviceName}_reservations_total Total successful inventory reservations`,
      `# TYPE ${serviceName}_reservations_total counter`,
      `${serviceName}_reservations_total ${this.reservationsTotal}`,
      `# HELP ${serviceName}_reservation_failures_total Total failed inventory reservation attempts due to insufficient stock`,
      `# TYPE ${serviceName}_reservation_failures_total counter`,
      `${serviceName}_reservation_failures_total ${this.reservationFailuresTotal}`
    );
    return lines.join("\n") + "\n";
  }
};
var metrics2 = new InventoryMetricsRegistry();

// services/inventory-service/src/services/inventory.service.ts
var InventoryService = class {
  /**
   * Retrieves current stock status for a given product
   */
  static async getStock(productId) {
    const db = await getInventoryDb();
    const result = await db.query(
      "SELECT product_id, stock, reserved FROM inventory_items WHERE product_id = $1",
      [productId]
    );
    if (result.rows.length === 0) {
      throw new AppError2({
        statusCode: 404,
        code: "PRODUCT_INVENTORY_NOT_FOUND",
        message: `Inventory record for product '${productId}' was not found.`
      });
    }
    const row = result.rows[0];
    return {
      productId: row.product_id,
      availableStock: row.stock,
      reservedStock: row.reserved,
      inStock: row.stock > 0
    };
  }
  /**
   * Atomically reserves stock for an order.
   * If any item has insufficient stock, the entire reservation is aborted.
   */
  static async reserveStock(orderId, items) {
    const db = await getInventoryDb();
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      const reservationId = uuidv4();
      const reservedDetails = [];
      for (const item of items) {
        const qty = Number(item.quantity);
        let updateRes;
        try {
          updateRes = await client.query(
            `UPDATE inventory_items
             SET stock = stock - ${qty}, reserved = reserved + ${qty}, updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $1 AND stock >= ${qty}
             RETURNING stock, reserved;`,
            [item.productId]
          );
        } catch (err) {
          if (err.message?.includes("check constraint") || err.code === "23514") {
            await client.query("ROLLBACK");
            metrics2.recordReservation(false);
            throw new AppError2({
              statusCode: 409,
              code: "INSUFFICIENT_INVENTORY",
              message: `Insufficient stock for product '${item.productId}'. Stock cannot drop below 0.`,
              details: {
                productId: item.productId,
                requestedQuantity: item.quantity
              }
            });
          }
          throw err;
        }
        if (!updateRes || updateRes.rows.length === 0) {
          const currentRes = await client.query(
            "SELECT stock FROM inventory_items WHERE product_id = $1",
            [item.productId]
          );
          await client.query("ROLLBACK");
          metrics2.recordReservation(false);
          const available = currentRes.rows.length > 0 ? currentRes.rows[0].stock : 0;
          throw new AppError2({
            statusCode: 409,
            code: "INSUFFICIENT_INVENTORY",
            message: `Insufficient stock for product '${item.productId}'. Requested: ${item.quantity}, Available: ${available}.`,
            details: {
              productId: item.productId,
              requestedQuantity: item.quantity,
              availableStock: available
            }
          });
        }
        const remainingStock = updateRes.rows[0].stock;
        reservedDetails.push({
          productId: item.productId,
          quantity: item.quantity,
          remainingStock
        });
        const itemResId = uuidv4();
        await client.query(
          `INSERT INTO inventory_reservations (id, order_id, product_id, quantity, status, created_at, updated_at)
           VALUES ($1, $2, $3, ${qty}, 'RESERVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [itemResId, orderId, item.productId]
        );
      }
      await client.query("COMMIT");
      metrics2.recordReservation(true);
      logger2.info("Successfully reserved inventory for order", {
        orderId,
        reservationId,
        itemsCount: items.length
      });
      return {
        reservationId,
        orderId,
        items: reservedDetails
      };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
      throw err;
    } finally {
      client.release();
    }
  }
  /**
   * Compensation mechanism: Releases stock back if the Order Service fails during order creation.
   */
  static async releaseReservation(orderId, items) {
    const db = await getInventoryDb();
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      const reservations = await client.query(
        `SELECT id, product_id, quantity FROM inventory_reservations
         WHERE order_id = $1 AND status = 'RESERVED'`,
        [orderId]
      );
      const itemsToRelease = reservations.rows.length > 0 ? reservations.rows.map((r) => ({ productId: r.product_id, quantity: r.quantity })) : items || [];
      for (const item of itemsToRelease) {
        const qty = Number(item.quantity);
        await client.query(
          `UPDATE inventory_items
           SET stock = stock + ${qty}, reserved = GREATEST(0, reserved - ${qty}), updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1`,
          [item.productId]
        );
      }
      await client.query(
        `UPDATE inventory_reservations
         SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status = 'RESERVED'`,
        [orderId]
      );
      await client.query("COMMIT");
      logger2.info("Compensation: Successfully released inventory reservation", { orderId });
    } catch (err) {
      await client.query("ROLLBACK");
      logger2.error("Failed to release reservation compensation", { orderId, error: err.message });
      throw err;
    } finally {
      client.release();
    }
  }
  /**
   * Commits the reservation once the order is successfully saved.
   */
  static async commitReservation(orderId) {
    const db = await getInventoryDb();
    await db.query(
      `UPDATE inventory_reservations
       SET status = 'COMMITTED', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND status = 'RESERVED'`,
      [orderId]
    );
  }
  /**
   * Administrative stock adjustment
   */
  static async adjustStock(productId, newStock) {
    if (newStock < 0) {
      throw new AppError2({
        statusCode: 400,
        code: "INVALID_STOCK_VALUE",
        message: "Stock cannot be negative."
      });
    }
    const db = await getInventoryDb();
    const result = await db.query(
      `INSERT INTO inventory_items (product_id, stock, reserved, updated_at)
       VALUES ($1, $2, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (product_id)
       DO UPDATE SET stock = $2, updated_at = CURRENT_TIMESTAMP
       RETURNING product_id, stock, reserved;`,
      [productId, newStock]
    );
    return result.rows[0];
  }
};

// services/inventory-service/src/routes/inventory.routes.ts
var inventoryRouter = Router3();
var reservationSchema = z4.object({
  orderId: z4.string().min(1, "orderId is required"),
  items: z4.array(
    z4.object({
      productId: z4.string().min(1, "productId is required"),
      quantity: z4.number().int().positive("quantity must be a positive integer")
    })
  ).min(1, "items array must contain at least one item")
});
var releaseSchema = z4.object({
  orderId: z4.string().min(1, "orderId is required"),
  items: z4.array(
    z4.object({
      productId: z4.string().min(1),
      quantity: z4.number().int().positive()
    })
  ).optional()
});
var commitSchema = z4.object({
  orderId: z4.string().min(1, "orderId is required")
});
var adjustmentSchema = z4.object({
  productId: z4.string().min(1, "productId is required"),
  stock: z4.number().int().min(0, "stock cannot be negative")
});
inventoryRouter.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "inventory-service",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
inventoryRouter.get("/:productId", async (req, res, next) => {
  try {
    const stockInfo = await InventoryService.getStock(req.params.productId);
    res.status(200).json({
      success: true,
      data: stockInfo,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
inventoryRouter.post("/reservations", async (req, res, next) => {
  try {
    const validated = reservationSchema.parse(req.body);
    const result = await InventoryService.reserveStock(validated.orderId, validated.items);
    res.status(201).json({
      success: true,
      message: "Inventory successfully reserved.",
      data: result,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
inventoryRouter.post("/reservations/release", async (req, res, next) => {
  try {
    const validated = releaseSchema.parse(req.body);
    await InventoryService.releaseReservation(validated.orderId, validated.items);
    res.status(200).json({
      success: true,
      message: `Reservation for order '${validated.orderId}' was successfully released.`,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
inventoryRouter.post("/reservations/commit", async (req, res, next) => {
  try {
    const validated = commitSchema.parse(req.body);
    await InventoryService.commitReservation(validated.orderId);
    res.status(200).json({
      success: true,
      message: `Reservation for order '${validated.orderId}' committed.`,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
inventoryRouter.post("/adjustments", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const providedSecret = authHeader?.replace(/^Bearer\s+/i, "");
    if (providedSecret !== config2.ADMIN_API_SECRET) {
      throw new AppError2({
        statusCode: 401,
        code: "UNAUTHORIZED_ADMIN_ACTION",
        message: "Invalid administrative credentials for stock adjustment."
      });
    }
    const validated = adjustmentSchema.parse(req.body);
    const updated = await InventoryService.adjustStock(validated.productId, validated.stock);
    res.status(200).json({
      success: true,
      message: "Inventory adjusted successfully.",
      data: updated,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});

// services/inventory-service/src/routes/health.routes.ts
import { Router as Router4 } from "express";
var healthRouter2 = Router4();
healthRouter2.get("/live", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "inventory-service",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});
healthRouter2.get("/ready", async (req, res) => {
  try {
    const db = await getInventoryDb();
    const dbHealthy = await db.checkHealth();
    if (!dbHealthy) {
      return res.status(503).json({
        status: "DOWN",
        service: "inventory-service",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        checks: {
          database: "DOWN"
        }
      });
    }
    return res.status(200).json({
      status: "READY",
      service: "inventory-service",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      checks: {
        database: "UP",
        engine: db.isMemory ? "in-memory-postgresql" : "postgresql"
      }
    });
  } catch {
    return res.status(503).json({
      status: "DOWN",
      service: "inventory-service",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      checks: {
        database: "DOWN"
      }
    });
  }
});
healthRouter2.get("/", async (req, res) => {
  const db = await getInventoryDb();
  const dbHealthy = await db.checkHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "HEALTHY" : "DEGRADED",
    service: "inventory-service",
    version: "1.0.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
healthRouter2.get("/metrics", (req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(metrics2.toPrometheusFormat("inventory_service"));
});

// services/order-service/src/routes/auth.routes.ts
import { Router as Router5 } from "express";
import { z as z6 } from "zod";

// services/order-service/src/services/auth.service.ts
import { v4 as uuidv42 } from "uuid";
import bcrypt2 from "bcryptjs";
import jwt from "jsonwebtoken";

// services/order-service/src/db/client.ts
import pg3 from "pg";
import { newDb as newDb3 } from "pg-mem";
import bcrypt from "bcryptjs";

// services/order-service/src/config.ts
import { z as z5 } from "zod";
import dotenv3 from "dotenv";
dotenv3.config();
var envSchema3 = z5.object({
  NODE_ENV: z5.enum(["development", "test", "production"]).default("development"),
  PORT: z5.coerce.number().default(4003),
  LOG_LEVEL: z5.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGIN: z5.string().default("*"),
  DATABASE_URL: z5.string().optional(),
  JWT_SECRET: z5.string().min(16, "JWT_SECRET must be at least 16 characters long").default("shopsphere_dev_jwt_secret_key_change_in_production_min_32_chars"),
  JWT_EXPIRES_IN: z5.string().default("24h"),
  PRODUCT_SERVICE_URL: z5.string().url().default("http://localhost:4001"),
  INVENTORY_SERVICE_URL: z5.string().url().default("http://localhost:4002")
});
var parsed3 = envSchema3.safeParse(process.env);
if (!parsed3.success) {
  console.error("\u274C Invalid environment configuration for Order Service:", JSON.stringify(parsed3.error.format(), null, 2));
  process.exit(1);
}
var config3 = parsed3.data;

// services/order-service/src/logger.ts
var levelOrder3 = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var logger3 = {
  log(payload) {
    const level = payload.level || "info";
    if (levelOrder3[level] < levelOrder3[config3.LOG_LEVEL]) {
      return;
    }
    const logEntry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      service: "order-service",
      environment: config3.NODE_ENV,
      level,
      ...payload
    };
    const out = JSON.stringify(logEntry);
    if (level === "error") {
      console.error(out);
    } else if (level === "warn") {
      console.warn(out);
    } else {
      console.log(out);
    }
  },
  info(message, extra) {
    this.log({ level: "info", message, ...extra });
  },
  warn(message, extra) {
    this.log({ level: "warn", message, ...extra });
  },
  error(message, extra) {
    this.log({ level: "error", message, ...extra });
  },
  debug(message, extra) {
    this.log({ level: "debug", message, ...extra });
  }
};

// services/order-service/src/db/client.ts
var dbInstance3 = null;
var schemaSql3 = `
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
async function getOrderDb() {
  if (dbInstance3) return dbInstance3;
  if (config3.DATABASE_URL && !config3.DATABASE_URL.includes("memory")) {
    const pool2 = new pg3.Pool({
      connectionString: config3.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3
    });
    const maxRetries = config3.NODE_ENV === "production" ? 10 : 3;
    let connected = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await pool2.query("SELECT 1");
        connected = true;
        logger3.info(`Connected to PostgreSQL for Order Service (attempt ${attempt}/${maxRetries})`);
        break;
      } catch (err) {
        logger3.warn(`PostgreSQL connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 2e3));
        }
      }
    }
    if (connected) {
      try {
        await pool2.query(schemaSql3);
        const hash1232 = bcrypt.hashSync("password123", 10);
        const hashAdmin2 = bcrypt.hashSync("admin12345", 10);
        await pool2.query(
          `INSERT INTO users (id, email, password_hash, name, role)
           VALUES ($1, $2, $3, $4, $5),
                  ($6, $7, $8, $9, $10),
                  ($11, $12, $13, $14, $15)
           ON CONFLICT (id) DO NOTHING`,
          [
            "user-alice",
            "alice@example.com",
            hash1232,
            "Alice Smith",
            "customer",
            "user-bob",
            "bob@example.com",
            hash1232,
            "Bob Jones",
            "customer",
            "user-admin",
            "admin@shopsphere.dev",
            hashAdmin2,
            "Platform Admin",
            "admin"
          ]
        );
      } catch (schemaErr) {
        logger3.warn(`Schema assurance notice: ${schemaErr.message}`);
      }
      dbInstance3 = {
        query: (text, params) => pool2.query(text, params),
        getClient: () => pool2.connect(),
        checkHealth: async () => {
          try {
            await pool2.query("SELECT 1");
            return true;
          } catch {
            return false;
          }
        },
        close: async () => {
          await pool2.end();
          dbInstance3 = null;
        },
        isMemory: false
      };
      return dbInstance3;
    } else {
      if (config3.NODE_ENV === "production") {
        throw new Error("Fatal: Unable to connect to PostgreSQL in production environment after maximum retries.");
      }
      logger3.warn("PostgreSQL connection failed in development; falling back to in-memory PostgreSQL engine.");
    }
  }
  const memDb = newDb3();
  memDb.public.none(schemaSql3);
  const hash123 = bcrypt.hashSync("password123", 10);
  const hashAdmin = bcrypt.hashSync("admin12345", 10);
  memDb.public.none(
    `INSERT INTO users (id, email, password_hash, name, role)
     VALUES ('user-alice', 'alice@example.com', '${hash123}', 'Alice Smith', 'customer'),
            ('user-bob', 'bob@example.com', '${hash123}', 'Bob Jones', 'customer'),
            ('user-admin', 'admin@shopsphere.dev', '${hashAdmin}', 'Platform Admin', 'admin')
     ON CONFLICT (id) DO NOTHING;`
  );
  const adapter = memDb.adapters.createPg();
  const pool = new adapter.Pool();
  dbInstance3 = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    checkHealth: async () => true,
    close: async () => {
      await pool.end();
      dbInstance3 = null;
    },
    isMemory: true
  };
  logger3.info("Initialized Order Service with in-memory PostgreSQL");
  return dbInstance3;
}

// services/order-service/src/middleware/errorHandler.ts
import { ZodError as ZodError3 } from "zod";
var AppError3 = class extends Error {
  statusCode;
  code;
  details;
  constructor({ message, statusCode, code, details }) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
};
function errorHandler(err, req, res, next) {
  const correlationId = req.correlationId || "unknown";
  if (err instanceof ZodError3) {
    const rawIssues = err.issues || [];
    const issues = rawIssues.map((e) => ({
      field: Array.isArray(e.path) ? e.path.join(".") : String(e.path),
      message: e.message
    }));
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request payload validation failed",
        details: issues,
        correlationId
      }
    });
  }
  if (err instanceof AppError3) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        correlationId
      }
    });
  }
  logger3.error("Unhandled internal server error", {
    correlationId,
    error: err.message,
    stack: config3.NODE_ENV === "development" ? err.stack : void 0
  });
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected internal error occurred in Order Service.",
      correlationId
    }
  });
}

// services/order-service/src/services/auth.service.ts
var AuthService = class {
  static async register(email, password, name) {
    const db = await getOrderDb();
    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      throw new AppError3({
        statusCode: 409,
        code: "USER_ALREADY_EXISTS",
        message: `An account with email '${email}' is already registered.`
      });
    }
    const userId = uuidv42();
    const passwordHash = await bcrypt2.hash(password, 10);
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, created_at)
       VALUES ($1, $2, $3, $4, 'customer', CURRENT_TIMESTAMP)`,
      [userId, email.toLowerCase().trim(), passwordHash, name.trim()]
    );
    const user = {
      id: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      role: "customer"
    };
    const token = jwt.sign(user, config3.JWT_SECRET, { expiresIn: config3.JWT_EXPIRES_IN });
    return { user, token };
  }
  static async login(email, password) {
    const db = await getOrderDb();
    const result = await db.query(
      "SELECT id, email, password_hash, name, role FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      throw new AppError3({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password."
      });
    }
    const row = result.rows[0];
    const passwordValid = await bcrypt2.compare(password, row.password_hash);
    if (!passwordValid) {
      throw new AppError3({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password."
      });
    }
    const user = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role
    };
    const token = jwt.sign(user, config3.JWT_SECRET, { expiresIn: config3.JWT_EXPIRES_IN });
    return { user, token };
  }
  static async getUserById(userId) {
    const db = await getOrderDb();
    const result = await db.query(
      "SELECT id, email, name, role FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      throw new AppError3({
        statusCode: 404,
        code: "USER_NOT_FOUND",
        message: "User account not found."
      });
    }
    return result.rows[0];
  }
};

// services/order-service/src/middleware/auth.middleware.ts
import jwt2 from "jsonwebtoken";
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new AppError3({
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "Authentication required. Missing or malformed Authorization header."
      })
    );
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt2.verify(token, config3.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return next(
      new AppError3({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: err.name === "TokenExpiredError" ? "Authentication token has expired." : "Invalid authentication token."
      })
    );
  }
}

// services/order-service/src/routes/auth.routes.ts
var authRouter = Router5();
var registerSchema = z6.object({
  email: z6.string().email("Invalid email address format"),
  password: z6.string().min(8, "Password must be at least 8 characters long"),
  name: z6.string().min(2, "Name must be at least 2 characters long")
});
var loginSchema = z6.object({
  email: z6.string().email("Invalid email address format"),
  password: z6.string().min(1, "Password is required")
});
authRouter.post("/register", async (req, res, next) => {
  try {
    const validated = registerSchema.parse(req.body);
    const result = await AuthService.register(validated.email, validated.password, validated.name);
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
authRouter.post("/login", async (req, res, next) => {
  try {
    const validated = loginSchema.parse(req.body);
    const result = await AuthService.login(validated.email, validated.password);
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await AuthService.getUserById(req.user.id);
    res.status(200).json({
      success: true,
      data: user,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});

// services/order-service/src/routes/order.routes.ts
import { Router as Router6 } from "express";
import { z as z7 } from "zod";

// services/order-service/src/services/order.service.ts
import { v4 as uuidv43 } from "uuid";

// services/order-service/src/clients/product.client.ts
var ProductClient = class {
  static async getProduct(productId, correlationId) {
    const url = `${config3.PRODUCT_SERVICE_URL}/api/products/${productId}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "x-correlation-id": correlationId
        }
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 404) {
          throw new AppError3({
            statusCode: 404,
            code: "PRODUCT_NOT_FOUND",
            message: `Product '${productId}' was not found in catalog.`,
            details: body.error
          });
        }
        throw new AppError3({
          statusCode: 502,
          code: "DEPENDENCY_ERROR",
          message: `Product Service responded with status ${response.status}`,
          details: body.error
        });
      }
      return body.data;
    } catch (err) {
      if (err instanceof AppError3) throw err;
      throw new AppError3({
        statusCode: 503,
        code: "PRODUCT_SERVICE_UNAVAILABLE",
        message: `Failed to communicate with Product Service at ${url}: ${err.message}`
      });
    }
  }
};

// services/order-service/src/clients/inventory.client.ts
var InventoryClient = class {
  static async reserveStock(orderId, items, correlationId) {
    const url = `${config3.INVENTORY_SERVICE_URL}/api/inventory/reservations`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-correlation-id": correlationId
        },
        body: JSON.stringify({ orderId, items })
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          throw new AppError3({
            statusCode: 409,
            code: "INSUFFICIENT_INVENTORY",
            message: body.error?.message || "Inventory reservation failed due to insufficient stock.",
            details: body.error?.details
          });
        }
        throw new AppError3({
          statusCode: 502,
          code: "INVENTORY_SERVICE_ERROR",
          message: body.error?.message || `Inventory Service error status ${response.status}`,
          details: body.error
        });
      }
      return body.data;
    } catch (err) {
      if (err instanceof AppError3) throw err;
      throw new AppError3({
        statusCode: 503,
        code: "INVENTORY_SERVICE_UNAVAILABLE",
        message: `Failed to connect to Inventory Service at ${url}: ${err.message}`
      });
    }
  }
  static async releaseStock(orderId, items, correlationId) {
    const url = `${config3.INVENTORY_SERVICE_URL}/api/inventory/reservations/release`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-correlation-id": correlationId
        },
        body: JSON.stringify({ orderId, items })
      });
      if (!response.ok) {
        logger3.error("Failed compensation release call to Inventory Service", {
          orderId,
          status: response.status,
          correlationId
        });
      }
    } catch (err) {
      logger3.error("Network exception in Inventory Service compensation release", {
        orderId,
        error: err.message,
        correlationId
      });
    }
  }
  static async commitReservation(orderId, correlationId) {
    const url = `${config3.INVENTORY_SERVICE_URL}/api/inventory/reservations/commit`;
    try {
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-correlation-id": correlationId
        },
        body: JSON.stringify({ orderId })
      });
    } catch (err) {
      logger3.warn("Failed to asynchronously commit reservation (non-fatal)", {
        orderId,
        error: err.message
      });
    }
  }
};

// services/order-service/src/metrics.ts
var OrderMetricsRegistry = class {
  requestCount = {};
  requestDurationSum = {};
  errorCount = {};
  ordersCreatedTotal = 0;
  orderCompensationCount = 0;
  recordRequest(method, route, status, durationMs) {
    const key = `method="${method}",route="${route}",status="${status}"`;
    this.requestCount[key] = (this.requestCount[key] || 0) + 1;
    this.requestDurationSum[key] = (this.requestDurationSum[key] || 0) + durationMs / 1e3;
    if (status >= 400) {
      const errKey = `route="${route}",status="${status}"`;
      this.errorCount[errKey] = (this.errorCount[errKey] || 0) + 1;
    }
  }
  recordOrderCreated() {
    this.ordersCreatedTotal += 1;
  }
  recordOrderCompensation() {
    this.orderCompensationCount += 1;
  }
  toPrometheusFormat(serviceName = "order_service") {
    const lines = [
      `# HELP ${serviceName}_http_requests_total Total number of HTTP requests processed`,
      `# TYPE ${serviceName}_http_requests_total counter`
    ];
    for (const [labels, count] of Object.entries(this.requestCount)) {
      lines.push(`${serviceName}_http_requests_total{${labels}} ${count}`);
    }
    lines.push(
      `# HELP ${serviceName}_http_request_duration_seconds_total Total duration of HTTP requests in seconds`,
      `# TYPE ${serviceName}_http_request_duration_seconds_total counter`
    );
    for (const [labels, duration] of Object.entries(this.requestDurationSum)) {
      lines.push(`${serviceName}_http_request_duration_seconds_total{${labels}} ${duration.toFixed(4)}`);
    }
    lines.push(
      `# HELP ${serviceName}_http_errors_total Total number of HTTP errors`,
      `# TYPE ${serviceName}_http_errors_total counter`
    );
    for (const [labels, count] of Object.entries(this.errorCount)) {
      lines.push(`${serviceName}_http_errors_total{${labels}} ${count}`);
    }
    lines.push(
      `# HELP ${serviceName}_orders_created_total Total successfully created orders`,
      `# TYPE ${serviceName}_orders_created_total counter`,
      `${serviceName}_orders_created_total ${this.ordersCreatedTotal}`,
      `# HELP ${serviceName}_order_compensations_total Total stock compensation events triggered`,
      `# TYPE ${serviceName}_order_compensations_total counter`,
      `${serviceName}_order_compensations_total ${this.orderCompensationCount}`
    );
    return lines.join("\n") + "\n";
  }
};
var metrics3 = new OrderMetricsRegistry();

// services/order-service/src/services/order.service.ts
var OrderService = class {
  /**
   * Creates an order with authoritative price calculation, atomic inventory reservation,
   * idempotency protection, and automatic compensation on failure.
   */
  static async createOrder(userId, items, idempotencyKey, correlationId = "internal") {
    const db = await getOrderDb();
    if (idempotencyKey) {
      const existing = await db.query(
        "SELECT * FROM orders WHERE idempotency_key = $1 AND user_id = $2",
        [idempotencyKey, userId]
      );
      if (existing.rows.length > 0) {
        logger3.info("Idempotent order request matched existing order", {
          userId,
          idempotencyKey,
          orderId: existing.rows[0].id,
          correlationId
        });
        return this.getOrderById(existing.rows[0].id, userId);
      }
    }
    const authoritativeItems = [];
    let totalCents = 0;
    for (const item of items) {
      const product = await ProductClient.getProduct(item.productId, correlationId);
      const subtotalCents = product.price_cents * item.quantity;
      totalCents += subtotalCents;
      authoritativeItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPriceCents: product.price_cents,
        subtotalCents
      });
    }
    const orderId = uuidv43();
    await InventoryClient.reserveStock(
      orderId,
      items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      correlationId
    );
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO orders (id, user_id, idempotency_key, status, total_cents, created_at, updated_at)
         VALUES ($1, $2, $3, 'CONFIRMED', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [orderId, userId, idempotencyKey || null, totalCents]
      );
      for (const item of authoritativeItems) {
        const itemId = uuidv43();
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [itemId, orderId, item.productId, item.productName, item.quantity, item.unitPriceCents, item.subtotalCents]
        );
      }
      await client.query("COMMIT");
      metrics3.recordOrderCreated();
      InventoryClient.commitReservation(orderId, correlationId).catch(() => {
      });
      logger3.info("Order persisted successfully", { orderId, userId, totalCents, correlationId });
    } catch (err) {
      await client.query("ROLLBACK");
      metrics3.recordOrderCompensation();
      logger3.error("Order database persistence failed, initiating compensation rollback on inventory", {
        orderId,
        userId,
        error: err.message,
        correlationId
      });
      await InventoryClient.releaseStock(
        orderId,
        items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        correlationId
      );
      throw new AppError3({
        statusCode: 500,
        code: "ORDER_PERSISTENCE_FAILED",
        message: "Order could not be saved to database. Any reserved stock was safely released.",
        details: err.message
      });
    } finally {
      client.release();
    }
    return this.getOrderById(orderId, userId);
  }
  /**
   * Retrieves orders belonging strictly to the authenticated user
   */
  static async listUserOrders(userId) {
    const db = await getOrderDb();
    const result = await db.query(
      `SELECT id, user_id, idempotency_key, status, total_cents, created_at, updated_at
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    const orders = [];
    for (const row of result.rows) {
      const itemsRes = await db.query(
        `SELECT id, order_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents
         FROM order_items
         WHERE order_id = $1`,
        [row.id]
      );
      orders.push({
        id: row.id,
        userId: row.user_id,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        totalCents: row.total_cents,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        items: itemsRes.rows.map((i) => ({
          id: i.id,
          orderId: i.order_id,
          productId: i.product_id,
          productName: i.product_name,
          quantity: i.quantity,
          unitPriceCents: i.unit_price_cents,
          subtotalCents: i.subtotal_cents
        }))
      });
    }
    return orders;
  }
  /**
   * Retrieves an individual order, strictly verifying that it belongs to the authenticated user.
   */
  static async getOrderById(orderId, userId) {
    const db = await getOrderDb();
    const orderRes = await db.query(
      "SELECT id, user_id, idempotency_key, status, total_cents, created_at, updated_at FROM orders WHERE id = $1",
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      throw new AppError3({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: `Order with ID '${orderId}' not found.`
      });
    }
    const row = orderRes.rows[0];
    if (row.user_id !== userId) {
      throw new AppError3({
        statusCode: 403,
        code: "FORBIDDEN_ORDER_ACCESS",
        message: "You do not have permission to access this order."
      });
    }
    const itemsRes = await db.query(
      `SELECT id, order_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents
       FROM order_items
       WHERE order_id = $1`,
      [orderId]
    );
    return {
      id: row.id,
      userId: row.user_id,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      totalCents: row.total_cents,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items: itemsRes.rows.map((i) => ({
        id: i.id,
        orderId: i.order_id,
        productId: i.product_id,
        productName: i.product_name,
        quantity: i.quantity,
        unitPriceCents: i.unit_price_cents,
        subtotalCents: i.subtotal_cents
      }))
    };
  }
};

// services/order-service/src/routes/order.routes.ts
var orderRouter = Router6();
var createOrderSchema = z7.object({
  idempotencyKey: z7.string().optional(),
  items: z7.array(
    z7.object({
      productId: z7.string().min(1, "productId is required"),
      quantity: z7.number().int().positive("quantity must be a positive integer")
    })
  ).min(1, "Order must contain at least one item")
});
orderRouter.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "order-service",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
orderRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const validated = createOrderSchema.parse(req.body);
    const idempotencyKey = req.header("idempotency-key") || validated.idempotencyKey;
    const order = await OrderService.createOrder(
      req.user.id,
      validated.items,
      idempotencyKey,
      req.correlationId
    );
    res.status(201).json({
      success: true,
      message: "Order created and confirmed.",
      data: order,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
orderRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const orders = await OrderService.listUserOrders(req.user.id);
    res.status(200).json({
      success: true,
      data: orders,
      count: orders.length,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});
orderRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const order = await OrderService.getOrderById(req.params.id, req.user.id);
    res.status(200).json({
      success: true,
      data: order,
      correlationId: req.correlationId
    });
  } catch (err) {
    next(err);
  }
});

// services/order-service/src/routes/health.routes.ts
import { Router as Router7 } from "express";
var healthRouter3 = Router7();
healthRouter3.get("/live", (req, res) => {
  res.status(200).json({
    status: "UP",
    service: "order-service",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});
healthRouter3.get("/ready", async (req, res) => {
  try {
    const db = await getOrderDb();
    const dbHealthy = await db.checkHealth();
    if (!dbHealthy) {
      return res.status(503).json({
        status: "DOWN",
        service: "order-service",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        checks: {
          database: "DOWN"
        }
      });
    }
    return res.status(200).json({
      status: "READY",
      service: "order-service",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      checks: {
        database: "UP",
        engine: db.isMemory ? "in-memory-postgresql" : "postgresql"
      }
    });
  } catch {
    return res.status(503).json({
      status: "DOWN",
      service: "order-service",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      checks: {
        database: "DOWN"
      }
    });
  }
});
healthRouter3.get("/", async (req, res) => {
  const db = await getOrderDb();
  const dbHealthy = await db.checkHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "HEALTHY" : "DEGRADED",
    service: "order-service",
    version: "1.0.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
healthRouter3.get("/metrics", (req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(metrics3.toPrometheusFormat("order_service"));
});

// services/order-service/src/middleware/correlationId.ts
import { v4 as uuidv44 } from "uuid";
function correlationIdMiddleware(req, res, next) {
  const correlationId = req.header("x-correlation-id") || uuidv44();
  req.correlationId = correlationId;
  req.startTime = Date.now();
  res.setHeader("x-correlation-id", correlationId);
  res.on("finish", () => {
    const durationMs = Date.now() - req.startTime;
    const route = req.route?.path || req.path;
    metrics3.recordRequest(req.method, route, res.statusCode, durationMs);
    logger3.log({
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      message: `${req.method} ${req.originalUrl} responded with ${res.statusCode} (${durationMs}ms)`,
      correlationId,
      method: req.method,
      route: req.originalUrl,
      status: res.statusCode,
      durationMs
    });
  });
  next();
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PORT = Number(process.env.PORT) || 3e3;
var isProduction = process.env.NODE_ENV === "production";
async function bootstrap() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "2mb" }));
  app.use(correlationIdMiddleware);
  const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL;
  const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL;
  const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL;
  const isExternalMicroservices = Boolean(
    PRODUCT_SERVICE_URL && !PRODUCT_SERVICE_URL.includes(`localhost:${PORT}`)
  );
  function createServiceProxy(targetBaseUrl) {
    return async (req, res, next) => {
      try {
        const targetUrl = new URL(req.originalUrl, targetBaseUrl).toString();
        const headers = new Headers();
        for (const [key, val] of Object.entries(req.headers)) {
          if (key.toLowerCase() === "host") continue;
          if (val) {
            if (Array.isArray(val)) {
              val.forEach((v) => headers.append(key, v));
            } else {
              headers.set(key, val);
            }
          }
        }
        const method = req.method.toUpperCase();
        const options = {
          method,
          headers
        };
        if (!["GET", "HEAD"].includes(method) && req.body) {
          options.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        }
        const response = await fetch(targetUrl, options);
        res.status(response.status);
        response.headers.forEach((value, name) => {
          if (name.toLowerCase() !== "transfer-encoding" && name.toLowerCase() !== "content-encoding") {
            res.setHeader(name, value);
          }
        });
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      } catch (err) {
        next(err);
      }
    };
  }
  if (isExternalMicroservices) {
    console.log("Routing API traffic as Gateway to microservices:", {
      productService: PRODUCT_SERVICE_URL,
      inventoryService: INVENTORY_SERVICE_URL,
      orderService: ORDER_SERVICE_URL
    });
    if (PRODUCT_SERVICE_URL) {
      app.use("/api/products", createServiceProxy(PRODUCT_SERVICE_URL));
      app.use("/health/product", createServiceProxy(PRODUCT_SERVICE_URL));
    }
    if (INVENTORY_SERVICE_URL) {
      app.use("/api/inventory", createServiceProxy(INVENTORY_SERVICE_URL));
      app.use("/health/inventory", createServiceProxy(INVENTORY_SERVICE_URL));
    }
    if (ORDER_SERVICE_URL) {
      app.use("/api/auth", createServiceProxy(ORDER_SERVICE_URL));
      app.use("/api/orders", createServiceProxy(ORDER_SERVICE_URL));
      app.use("/health/order", createServiceProxy(ORDER_SERVICE_URL));
    }
  } else {
    await getProductDb();
    await getInventoryDb();
    await getOrderDb();
    config3.PRODUCT_SERVICE_URL = `http://localhost:${PORT}`;
    config3.INVENTORY_SERVICE_URL = `http://localhost:${PORT}`;
    app.use("/api/products", productRouter);
    app.use("/api/inventory", inventoryRouter);
    app.use("/api/auth", authRouter);
    app.use("/api/orders", orderRouter);
    app.use("/health/product", healthRouter);
    app.use("/health/inventory", healthRouter2);
    app.use("/health/order", healthRouter3);
  }
  app.get("/health/live", (req, res) => {
    res.status(200).json({ status: "UP", service: "shopsphere-gateway", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.get("/health/ready", async (req, res) => {
    if (isExternalMicroservices) {
      try {
        const [pRes, iRes, oRes] = await Promise.all([
          PRODUCT_SERVICE_URL ? fetch(`${PRODUCT_SERVICE_URL}/health/live`).then((r) => r.ok).catch(() => false) : true,
          INVENTORY_SERVICE_URL ? fetch(`${INVENTORY_SERVICE_URL}/health/live`).then((r) => r.ok).catch(() => false) : true,
          ORDER_SERVICE_URL ? fetch(`${ORDER_SERVICE_URL}/health/live`).then((r) => r.ok).catch(() => false) : true
        ]);
        const allReady = pRes && iRes && oRes;
        res.status(allReady ? 200 : 503).json({
          status: allReady ? "READY" : "DEGRADED",
          checks: {
            productService: pRes ? "UP" : "DOWN",
            inventoryService: iRes ? "UP" : "DOWN",
            orderService: oRes ? "UP" : "DOWN"
          },
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch {
        res.status(503).json({ status: "DOWN", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
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
        oDb.checkHealth()
      ]);
      const allReady = pHealthy && iHealthy && oHealthy;
      res.status(allReady ? 200 : 503).json({
        status: allReady ? "READY" : "DEGRADED",
        checks: {
          productDatabase: pHealthy ? "UP" : "DOWN",
          inventoryDatabase: iHealthy ? "UP" : "DOWN",
          orderDatabase: oHealthy ? "UP" : "DOWN"
        },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch {
      res.status(503).json({ status: "DOWN", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  app.get("/health", async (req, res) => {
    res.status(200).json({
      status: "HEALTHY",
      app: "ShopSphere E-Commerce System",
      services: ["product-service", "inventory-service", "order-service"],
      mode: isExternalMicroservices ? "distributed-gateway" : "unified-dev",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/docs/openapi.json", (req, res) => {
    const specPath = fs.existsSync(path.join(__dirname, "docs", "openapi.json")) ? path.join(__dirname, "docs", "openapi.json") : path.join(__dirname, "..", "docs", "openapi.json");
    if (fs.existsSync(specPath)) {
      res.setHeader("Content-Type", "application/json");
      fs.createReadStream(specPath).pipe(res);
    } else {
      res.status(404).json({ error: "OpenAPI specification not found" });
    }
  });
  app.use("/api", errorHandler);
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(__dirname, "dist")) ? path.join(__dirname, "dist") : path.join(__dirname, "..", "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} ShopSphere running on http://0.0.0.0:${PORT} [${isProduction ? "PRODUCTION" : "DEVELOPMENT"}]`);
  });
  const shutdown = async (sig) => {
    console.log(`Received ${sig}. Shutting down unified server...`);
    server.close(async () => {
      if (!isExternalMicroservices) {
        try {
          const pDb = await getProductDb();
          const iDb = await getInventoryDb();
          const oDb = await getOrderDb();
          await Promise.all([pDb.close(), iDb.close(), oDb.close()]);
          console.log("All database pools closed.");
        } catch (e) {
          console.error("Error during shutdown", e);
        }
      }
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
bootstrap().catch((err) => {
  console.error("Fatal initialization error:", err);
  process.exit(1);
});
