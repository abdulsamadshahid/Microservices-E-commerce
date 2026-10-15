# ShopSphere — Developer-Ready Microservices E-commerce Application

[![Tests Passing](https://img.shields.io/badge/tests-29%20passed%2C%200%20failed-brightgreen.svg)](#8-how-to-run-tests)
[![Node Version](https://img.shields.io/badge/node-22.x-blue.svg)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL%2016-blue.svg)](https://www.postgresql.org)
[![Docker Ready](https://img.shields.io/badge/containers-Docker%20%7C%20K8s%20Ready-blueviolet.svg)](#10-how-to-build-each-production-image)

ShopSphere is a container-ready, production-architected microservices e-commerce application. It delivers a full developer-to-DevOps handover package including independent microservices, atomic inventory reservation, distributed compensation rollback, strict multi-tenant authorization, structured JSON logging with correlation IDs, Prometheus metrics, and automated unit, integration, and concurrency tests.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Service Responsibilities](#2-architecture--service-responsibilities)
3. [Prerequisites](#3-prerequisites)
4. [Repository Structure](#4-repository-structure)
5. [Environment Configuration](#5-environment-configuration)
6. [Local Installation & Quickstart](#6-local-installation--quickstart)
7. [Database Migration & Seeding Instructions](#7-database-migration--seeding-instructions)
8. [How to Run Tests](#8-how-to-run-tests)
9. [How to Start the Application with Docker Compose](#9-how-to-start-the-application-with-docker-compose)
10. [How to Build Each Production Image](#10-how-to-build-each-production-image)
11. [How to Test Health and Readiness Endpoints](#11-how-to-test-health-and-readiness-endpoints)
12. [API Documentation Links](#12-api-documentation-links)
13. [Common Application-Level Troubleshooting Steps](#13-common-application-level-troubleshooting-steps)
14. [Known Limitations and Design Trade-offs](#14-known-limitations-and-design-trade-offs)
15. [Developer-to-DevOps Handover Checklist](#15-developer-to-devops-handover-checklist)

---

## 1. Project Overview

ShopSphere demonstrates how to decouple an e-commerce platform into independently runnable, easily containerized microservices without premature architectural complexity (e.g. distributed Kafka clusters or Saga coordinators):
- **Authoritative Pricing**: Total price calculations are calculated strictly on the backend using the Product Service to eliminate client-side price tampering.
- **Zero Overselling Concurrency Safety**: Stock reservation uses PostgreSQL transactions with atomic conditional updates (`WHERE product_id = $1 AND stock >= $qty`) and database constraints (`CHECK (stock >= 0)`).
- **Synchronous Compensation Rollback**: If order persistence fails after reserving inventory, a synchronous compensation call (`POST /api/inventory/reservations/release`) restores stock.
- **Idempotent Order Placement**: Supports `Idempotency-Key` headers to protect against accidental duplicate charges during client retries.
- **Multi-Tenant Order Isolation**: Order queries are strictly scoped to the authenticated user ID extracted from verified JWT tokens.
- **DevOps Observability**: Structured JSON logs with `x-correlation-id` tracing, `/health/live`, `/health/ready`, and Prometheus `/metrics`.

---

## 2. Architecture & Service Responsibilities

```
                                  +---------------------+
                                  |    React Frontend   |
                                  |     (Port 3000)     |
                                  +---------------------+
                                             |
                  +--------------------------+--------------------------+
                  | /api/products            | /api/orders & /api/auth  | /api/inventory
                  v                          v                          v
        +-------------------+      +-------------------+      +-------------------+
        |  Product Service  |      |   Order Service   |      | Inventory Service |
        |    (Port 4001)    |      |    (Port 4003)    |      |    (Port 4002)    |
        +-------------------+      +-------------------+      +-------------------+
                  |                          |                          |
           (products table)         +--------+--------+      (inventory_items &
                                    | Price  | Reserve|       reservations tables)
                                    v        v        v
                                 [REST]    [REST]   [REST]
                                    |        |        |
                                    +--------+--------+
                                             |
                                  (users & orders tables)
```

| Service | Port | Data Ownership | Key Responsibilities | Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **Product Service** | `4001` | `products` table | Product catalog browsing, keyword search, category filtering, authoritative unit pricing. | PostgreSQL |
| **Inventory Service** | `4002` | `inventory_items`, `inventory_reservations` tables | Real-time stock querying, atomic conditional reservations, compensation release, administrative adjustments. | PostgreSQL |
| **Order Service** | `4003` | `users`, `orders`, `order_items` tables | User authentication (bcrypt + JWT), order calculation, coordinating inventory reservation, compensation triggers, order history. | Product Service, Inventory Service, PostgreSQL |
| **Frontend** | `3000` | Local state (Cart & Auth token) | Single-page application, product catalog, cart drawer, checkout, order history, and DevOps dashboard. | Backend APIs (`/api`) |

---

## 3. Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **npm**: `v10.x`
- **Docker & Docker Compose**: `Docker 24+` & `Docker Compose v2+` (for containerized runs)
- **PostgreSQL**: `PostgreSQL 14+` or `16` (optional for local standalone run; uses embedded engine when `DATABASE_URL` is omitted)

---

## 4. Repository Structure

```
shopsphere/
├── .env.example                     # Environment template (public vs private variables)
├── .dockerignore                    # Build ignore rules
├── docker-compose.yml               # Production-like multi-container compose
├── Dockerfile.frontend              # Multi-stage production build for Frontend
├── server.ts                        # Unified Express API Gateway + Vite Dev Server
├── package.json                     # Monorepo scripts and dependencies
├── database/
│   ├── init.sql                     # Combined PostgreSQL initialization entrypoint
│   ├── migrations/
│   │   ├── 001_init_products.sql    # Product service schema
│   │   ├── 002_init_inventory.sql   # Inventory service schema
│   │   └── 003_init_orders_and_users.sql # Order & Auth schema
│   └── seeds/
│       └── seed.sql                 # Sample products, stock, and demo accounts
├── docs/
│   ├── architecture.md              # Detailed architectural design & sequence diagrams
│   ├── api.md                       # Complete API contract and error specification
│   ├── openapi.json                 # Consolidated OpenAPI 3.0 specification
│   └── operations-handover.md       # Kubernetes, probes, and Prometheus runbook
├── services/
│   ├── product-service/             # Independent Product Service (Port 4001)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── .env.example
│   │   ├── src/ (app.ts, index.ts, config.ts, logger.ts, metrics.ts, db, routes, services)
│   │   └── tests/ (product.test.ts)
│   ├── inventory-service/           # Independent Inventory Service (Port 4002)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── .env.example
│   │   ├── src/ (app.ts, index.ts, config.ts, logger.ts, metrics.ts, db, routes, services)
│   │   └── tests/ (inventory.test.ts)
│   └── order-service/               # Independent Order Service (Port 4003)
│       ├── Dockerfile
│       ├── package.json
│       ├── .env.example
│       ├── src/ (app.ts, index.ts, config.ts, logger.ts, metrics.ts, db, clients, routes, services)
│       └── tests/ (auth.test.ts, order.test.ts)
├── src/                             # React SPA Frontend
│   ├── components/                  # Navbar, ProductCatalog, CartDrawer, OrderHistory, DevOpsDashboard
│   ├── context/                     # AuthContext, CartContext
│   ├── services/                    # Frontend API client
│   └── types/                       # TypeScript interfaces
└── tests/
    └── e2e.test.ts                  # End-to-end integration test suite
```

---

## 5. Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Key Environment Variables

| Variable | Scope | Description | Default (Local Dev) |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Global | Runtime environment (`development`, `production`, `test`) | `development` |
| `PORT` | Global | Port for unified dev server / gateway | `3000` |
| `DATABASE_URL` | Private | PostgreSQL connection string | `postgres://shopsphere:secret_local_dev_password@localhost:5432/shopsphere_db` |
| `JWT_SECRET` | Private | Secret key for signing customer JWTs (min 32 chars) | Documented dev key (replace in prod) |
| `JWT_EXPIRES_IN` | Private | JWT token lifespan | `24h` |
| `ADMIN_API_SECRET` | Private | Secret key required for inventory adjustments | Documented dev key |
| `PRODUCT_SERVICE_URL` | Private | DNS endpoint for Product Service | `http://localhost:4001` (Compose: `http://product-service:4001`) |
| `INVENTORY_SERVICE_URL`| Private | DNS endpoint for Inventory Service | `http://localhost:4002` (Compose: `http://inventory-service:4002`)|
| `VITE_API_BASE_URL` | Public | Browser API base URL | `/api` (same origin) |

---

## 6. Local Installation & Quickstart

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
This starts the unified full-stack development server mounting all microservices and Vite frontend in hot development mode.

### Pre-Seeded Demo Accounts
- **Alice Smith**: `alice@example.com` / `password123`
- **Bob Jones**: `bob@example.com` / `password123`
- **Platform Admin**: `admin@shopsphere.dev` / `admin12345`

---

## 7. Database Migration & Seeding Instructions

When deploying against a dedicated PostgreSQL database:

### Automatic via Docker Compose:
The file `database/init.sql` is automatically mounted to `/docker-entrypoint-initdb.d/init.sql` on the `postgres:16-alpine` container, running all table creations and seed insertions on first start.

### Manual / CI-CD Execution:
```bash
# Execute migrations sequentially:
psql "$DATABASE_URL" -f database/migrations/001_init_products.sql
psql "$DATABASE_URL" -f database/migrations/002_init_inventory.sql
psql "$DATABASE_URL" -f database/migrations/003_init_orders_and_users.sql

# Execute repeatable seed:
psql "$DATABASE_URL" -f database/seeds/seed.sql
```

### Reset Database:
```bash
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS order_items, orders, users, inventory_reservations, inventory_items, products CASCADE;"
# Re-apply migrations and seeds
```

---

## 8. How to Run Tests

ShopSphere includes 29 automated tests across unit, integration, concurrency, and end-to-end workflows:

```bash
npm test
```

### Running Individual Service Tests:
```bash
# Product Service tests (7 tests):
npx tsx --test services/product-service/tests/product.test.ts

# Inventory Service tests & atomic concurrency test (8 tests):
npx tsx --test services/inventory-service/tests/inventory.test.ts

# Auth & User tests (7 tests):
npx tsx --test services/order-service/tests/auth.test.ts

# Order Service integration tests (6 tests):
npx tsx --test services/order-service/tests/order.test.ts

# Full End-to-End System workflow test (1 test):
npx tsx --test tests/e2e.test.ts
```

### Linting:
```bash
npm run lint
```

---

## 9. How to Start the Application with Docker Compose

To start the entire production-architected microservices stack (PostgreSQL + 3 backend microservices + frontend):

```bash
docker compose up --build
```

### Verified Service Endpoints in Docker Compose:
- **Frontend & Gateway**: `http://localhost:3000`
- **Product Service**: `http://localhost:4001`
- **Inventory Service**: `http://localhost:4002`
- **Order Service**: `http://localhost:4003`
- **PostgreSQL**: `localhost:5432`

To shut down:
```bash
docker compose down -v
```

---

## 10. How to Build Each Production Image

Each service has a multi-stage `Dockerfile` using `node:22-alpine` and non-root user `node`:

```bash
# 1. Product Service
docker build -t shopsphere-product-service:1.0.0 ./services/product-service

# 2. Inventory Service
docker build -t shopsphere-inventory-service:1.0.0 ./services/inventory-service

# 3. Order Service
docker build -t shopsphere-order-service:1.0.0 ./services/order-service

# 4. Frontend
docker build -t shopsphere-frontend:1.0.0 -f Dockerfile.frontend .
```

---

## 11. How to Test Health and Readiness Endpoints

All services provide standard health probes:

```bash
# Product Service Probes:
curl -i http://localhost:4001/health/live
curl -i http://localhost:4001/health/ready
curl -i http://localhost:4001/metrics

# Inventory Service Probes:
curl -i http://localhost:4002/health/live
curl -i http://localhost:4002/health/ready
curl -i http://localhost:4002/metrics

# Order Service Probes:
curl -i http://localhost:4003/health/live
curl -i http://localhost:4003/health/ready
curl -i http://localhost:4003/metrics
```

Expected readiness output (`200 OK`):
```json
{
  "status": "READY",
  "service": "order-service",
  "timestamp": "2026-10-13T18:27:58.264Z",
  "checks": {
    "database": "UP"
  }
}
```

---

## 12. API Documentation Links

- **Consolidated OpenAPI Specification**: [`docs/openapi.json`](./docs/openapi.json) or browser URL `http://localhost:3000/api/docs/openapi.json`
- **API Reference Guide**: [`docs/api.md`](./docs/api.md)
- **Architecture & Sequence Guide**: [`docs/architecture.md`](./docs/architecture.md)
- **Operations & Runbook Guide**: [`docs/operations-handover.md`](./docs/operations-handover.md)

---

## 13. Common Application-Level Troubleshooting Steps

1. **409 Conflict during checkout (`INSUFFICIENT_INVENTORY`)**:
   - *Cause*: Available inventory is lower than requested quantity.
   - *Solution*: Check available stock via `GET /api/inventory/:productId` or adjust inventory using `POST /api/inventory/adjustments` with the admin secret.
2. **401 Unauthorized (`INVALID_TOKEN` / `UNAUTHORIZED`)**:
   - *Cause*: Missing or expired JWT token.
   - *Solution*: Re-authenticate using `POST /api/auth/login` and pass `Authorization: Bearer <token>`.
3. **503 Service Unavailable on Order Service**:
   - *Cause*: Order Service cannot reach `PRODUCT_SERVICE_URL` or `INVENTORY_SERVICE_URL`.
   - *Solution*: Check environment variable DNS resolution or inspect correlation ID in structured JSON logs.

---

## 14. Known Limitations and Design Trade-offs

1. **Synchronous Compensation vs Event-Driven Saga**:
   - *Decision*: A synchronous compensation call (`POST /api/inventory/reservations/release`) was selected over Apache Kafka or RabbitMQ to eliminate unnecessary infrastructure complexity for this portfolio project.
   - *Trade-off*: In extreme network partition scenarios where both Order DB crashes and Inventory Service goes offline simultaneously, a reconciliation cron script is recommended for production.
2. **Dual-Mode Database Adapter**:
   - *Decision*: Services include an automatic in-memory PostgreSQL engine fallback when `DATABASE_URL` is omitted.
   - *Trade-off*: Enables instant developer setup and fast unit testing without needing an external Docker daemon running. When `DATABASE_URL` is configured, standard PostgreSQL connection pools are used.

---

## 15. Developer-to-DevOps Handover Checklist

- [x] Independent microservices directories with dedicated `package.json` and multi-stage `Dockerfile`.
- [x] Multi-stage container builds running as non-privileged `node` user (UID 1000).
- [x] Kubernetes-ready liveness (`/health/live`) and readiness (`/health/ready`) probes.
- [x] Graceful shutdown traps for `SIGTERM` and `SIGINT` with connection pool cleanup.
- [x] Structured JSON logs with timestamp, level, service, duration, and correlation ID.
- [x] Prometheus metrics endpoints exposed at `/metrics`.
- [x] Docker Compose configured with PostgreSQL 16 healthchecks and service dependencies.
- [x] All 29 automated tests passing with `npm test`.
- [x] Zero hardcoded production secrets in codebase; documented `.env.example`.
- [x] OpenAPI 3.0 specification generated and accessible.
