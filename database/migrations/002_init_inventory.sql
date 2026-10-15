-- Inventory Service Migration
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
