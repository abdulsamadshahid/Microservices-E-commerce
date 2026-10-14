# ShopSphere System Architecture

## 1. Executive Summary

**ShopSphere** is a container-ready microservices e-commerce application engineered for high reliability, concurrency safety, and clear operational boundaries. It is designed to be easily containerized and orchestrated by DevOps teams using Docker, Kubernetes, AWS EKS, Argo CD, Prometheus, and Grafana.

---

## 2. Microservice Boundaries & Responsibilities

ShopSphere decomposes e-commerce capabilities into three bounded contexts, accompanied by a React frontend.

```
+-----------------------------------------------------------------------+
|                           React SPA Frontend                          |
|                       (Port 3000 / Same-Origin)                       |
+-----------------------------------------------------------------------+
         |                                |                        |
         | GET /api/products              | POST /api/orders       | GET /api/inventory/:id
         v                                v                        v
+------------------+             +------------------+     +--------------------+
|  Product Service |             |  Order Service   |     | Inventory Service  |
|   (Port 4001)    |             |   (Port 4003)    |     |    (Port 4002)     |
+------------------+             +------------------+     +--------------------+
         |                                |                        |
         | Authoritative Prices           | Atomic Reservations    | Stock Management
         |                                v                        |
         +----------------------------> [REST] <-------------------+
```

### A. Product Service (`services/product-service`)
- **Port**: `4001`
- **Ownership**: Product catalog, descriptions, authoritative pricing, and categories.
- **Data Persistence**: `products` table.
- **Key Guarantee**: Returns authoritative pricing used by Order Service during order creation.

### B. Inventory Service (`services/inventory-service`)
- **Port**: `4002`
- **Ownership**: Real-time stock counts, atomic stock reservations, and administrative adjustments.
- **Data Persistence**: `inventory_items`, `inventory_reservations` tables.
- **Key Guarantee**: Atomic conditional stock decrements (`WHERE product_id = $1 AND stock >= $2`) prevent overselling under concurrent load. Exposes a synchronous compensation endpoint (`POST /api/inventory/reservations/release`) if downstream order persistence fails.

### C. Order Service (`services/order-service`)
- **Port**: `4003`
- **Ownership**: User authentication (registration/login via bcrypt + JWT), order lifecycle management, and order history.
- **Data Persistence**: `users`, `orders`, `order_items` tables.
- **Key Guarantee**: Strict tenant/user data isolation (users cannot access another user's order). Server-authoritative price calculation (never trusts client-submitted prices). Supports `Idempotency-Key` headers to protect against network retry duplicates.

---

## 3. Database Architecture & Data Isolation

Each microservice strictly owns its database tables. Cross-service database joins are strictly prohibited; all inter-service information exchange is executed via REST over HTTP.

### Product Service Schema
```sql
CREATE TABLE products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  category VARCHAR(100) NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_name ON products(name);
```

### Inventory Service Schema
```sql
CREATE TABLE inventory_items (
  product_id VARCHAR(64) PRIMARY KEY,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_reservations (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status VARCHAR(32) NOT NULL DEFAULT 'RESERVED',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_reservations_order_id ON inventory_reservations(order_id);
```

### Order Service Schema
```sql
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) DEFAULT 'customer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  idempotency_key VARCHAR(128) UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents > 0)
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_idempotency_key ON orders(idempotency_key);
```

---

## 4. Order and Inventory Workflow & Compensation

The order lifecycle follows a strict synchronous two-phase workflow with automated compensation:

```
Customer                Order Service             Product Service          Inventory Service
   |                          |                          |                         |
   |-- 1. POST /api/orders -->|                          |                         |
   |   (with JWT & IdemKey)   |                          |                         |
   |                          |-- 2. Idempotency Check --|                         |
   |                          |                          |                         |
   |                          |-- 3. GET /products/:id ->|                         |
   |                          |<- 4. Authoritative Price-|                         |
   |                          |                          |                         |
   |                          |-- 5. Calculate Total ----|                         |
   |                          |                          |                         |
   |                          |-- 6. POST /api/inventory/reservations ------------>|
   |                          |   (Atomic UPDATE ... WHERE stock >= qty)           |
   |                          |<- 7. Reservation Success (or 409 Conflict) --------|
   |                          |                          |                         |
   |                          |-- 8. Save Order & Items -|                         |
   |                          |   (BEGIN ... COMMIT)     |                         |
   |                          |                          |                         |
   |                          |-- [IF SAVE FAILS] ------ | ----------------------->|
   |                          |   POST /inventory/reservations/release (COMPENSATE)|
   |                          |                                                    |
   |                          |-- 9. POST /inventory/reservations/commit --------->|
   |<- 10. 201 Created -------|                          |                         |
```

### Concurrency Guarantees
- The `inventory_items` table contains a database-level `CHECK (stock >= 0)` constraint.
- The reservation query executes an atomic conditional mutation:
  ```sql
  UPDATE inventory_items
  SET stock = stock - $qty, reserved = reserved + $qty, updated_at = CURRENT_TIMESTAMP
  WHERE product_id = $id AND stock >= $qty
  RETURNING stock, reserved;
  ```
- If the stock is insufficient, 0 rows are returned or a constraint violation is trapped, triggering immediate transaction rollback and a `409 Conflict` response with an `INSUFFICIENT_INVENTORY` error code.

### Compensation Strategy
- If inventory is reserved successfully but saving the order to PostgreSQL fails (e.g., database constraint or connection drop), the Order Service triggers synchronous compensation:
  `POST ${INVENTORY_SERVICE_URL}/api/inventory/reservations/release`
  This atomically restores the stock and updates the reservation record status to `RELEASED`.

---

## 5. Observability & Telemetry

### Structured JSON Logs
All logs follow a machine-readable JSON schema printed directly to stdout/stderr:
```json
{
  "timestamp": "2026-10-13T18:21:15.637Z",
  "service": "order-service",
  "environment": "production",
  "level": "info",
  "message": "POST /api/orders responded with 201 (91ms)",
  "correlationId": "2221895d-c6ad-42a4-990b-9438e6761bae",
  "method": "POST",
  "route": "/api/orders",
  "status": 201,
  "durationMs": 91
}
```

### Correlation ID Propagation
Every inbound HTTP request receives an `x-correlation-id` header (or a new UUIDv4 is assigned). This header is propagated forward on all downstream HTTP calls to Product Service and Inventory Service, enabling end-to-end distributed request tracing in log aggregation tools (Loki, Elasticsearch, CloudWatch).

### Prometheus Metrics
Each service exposes a `/health/metrics` or `/metrics` endpoint compatible with Prometheus scraping:
- `<service>_http_requests_total`
- `<service>_http_request_duration_seconds_total`
- `<service>_http_errors_total`
- `inventory_service_reservations_total`
- `inventory_service_reservation_failures_total`
- `order_service_orders_created_total`
- `order_service_order_compensations_total`
