-- ShopSphere Master Database Initialization
-- Runs automatically on docker container startup via /docker-entrypoint-initdb.d/init.sql

-- 1. Product Service Schema
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

-- 2. Inventory Service Schema
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
CREATE INDEX IF NOT EXISTS idx_reservations_product_id ON inventory_reservations(product_id);

-- 3. Order & Auth Service Schema
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

-- 4. Initial Seed Data
INSERT INTO products (id, name, description, price_cents, category, image_url) VALUES
  ('prod-1', 'AeroPulse ANC Wireless Headphones', 'Active noise cancelling with 40-hour battery life and custom spatial sound drivers.', 24999, 'Audio', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80'),
  ('prod-2', 'KeyForge Custom Mechanical Keyboard', 'Hot-swappable tactile switches with aircraft-grade aluminum frame and RGB backlighting.', 12950, 'Electronics', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80'),
  ('prod-3', 'ApexGlide Precision Gaming Mouse', '26,000 DPI optical sensor, optical switches, ultra-lightweight 58g honeycomb chassis.', 7900, 'Electronics', 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&q=80'),
  ('prod-4', 'Artisan Vegan Leather Desk Mat', 'Spill-resistant double-sided executive desk pad with magnetic cable organizer.', 3500, 'Home & Office', 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80'),
  ('prod-5', 'UltraView 27-inch 4K Studio Monitor', 'Factory color-calibrated IPS panel with 90W USB-C power delivery and daisy-chaining.', 42000, 'Electronics', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80'),
  ('prod-6', 'ThermalFlex Merino Everyday Hoodie', '100% sustainably sourced extra-fine merino wool for climate-controlled comfort.', 8800, 'Apparel', 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80'),
  ('prod-7', 'MagnaLift Ergonomic Laptop Stand', 'Foldable multi-angle anodized aluminum riser with silicone anti-slip grips.', 4500, 'Home & Office', 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80'),
  ('prod-8', 'LuminaBar Monitor Lightbar', 'Asymmetric optical glare-free desk lamp with wireless rotary brightness puck.', 6400, 'Home & Office', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80')
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory_items (product_id, stock, reserved) VALUES
  ('prod-1', 25, 0),
  ('prod-2', 40, 0),
  ('prod-3', 30, 0),
  ('prod-4', 50, 0),
  ('prod-5', 15, 0),
  ('prod-6', 20, 0),
  ('prod-7', 35, 0),
  ('prod-8', 3, 0)
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO users (id, email, password_hash, name, role) VALUES
  ('user-alice', 'alice@example.com', '$2b$10$SFKWda7yosimVQ/QHIkXreLINgNPkVxn2oxmQyZsYZzjwGqkuEBp.', 'Alice Smith', 'customer'),
  ('user-bob', 'bob@example.com', '$2b$10$SFKWda7yosimVQ/QHIkXreLINgNPkVxn2oxmQyZsYZzjwGqkuEBp.', 'Bob Jones', 'customer'),
  ('user-admin', 'admin@shopsphere.dev', '$2b$10$wSR3/KK.xmYJQUzXUCXLUOPbWEI0oxKD8pzk/p4104shPqhGd6Ueq', 'Platform Admin', 'admin')
ON CONFLICT (id) DO NOTHING;
