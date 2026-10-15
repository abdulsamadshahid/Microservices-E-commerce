-- Seed Products
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

-- Seed Inventory
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

-- Seed Demo Users (bcrypt hashes for 'password123' and 'admin12345')
-- 'password123' hash: $2a$10$wN2Jj4P7ZkF4zX7kZ9sKxO8t9w5m8zW4p0vN9u1o3x5y7z9a1b2c
-- We pre-hash with bcryptjs: salt rounds 10
INSERT INTO users (id, email, password_hash, name, role) VALUES
  ('user-alice', 'alice@example.com', '$2b$10$SFKWda7yosimVQ/QHIkXreLINgNPkVxn2oxmQyZsYZzjwGqkuEBp.', 'Alice Smith', 'customer'),
  ('user-bob', 'bob@example.com', '$2b$10$SFKWda7yosimVQ/QHIkXreLINgNPkVxn2oxmQyZsYZzjwGqkuEBp.', 'Bob Jones', 'customer'),
  ('user-admin', 'admin@shopsphere.dev', '$2b$10$wSR3/KK.xmYJQUzXUCXLUOPbWEI0oxKD8pzk/p4104shPqhGd6Ueq', 'Platform Admin', 'admin')
ON CONFLICT (id) DO NOTHING;
