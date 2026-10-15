# Developer-to-DevOps Operations Handover Guide

This guide enables the DevOps engineer to containerize, automate, deploy, and monitor ShopSphere in production environments (Kubernetes, AWS EKS, Argo CD, Terraform, Prometheus, and Grafana) without altering application source code.

---

## 1. Container Images & Build Strategy

Each microservice includes an optimized multi-stage `Dockerfile`:
- **Base image**: `node:22-alpine` (lightweight, minimal vulnerability surface)
- **Security**: Runs under non-privileged user `USER node` (UID 1000)
- **Signals**: Native Node.js `SIGTERM` / `SIGINT` signal trap with in-flight request draining and 10-second timeout safeguard.
- **Port mapping**:
  - `Product Service`: `4001`
  - `Inventory Service`: `4002`
  - `Order Service`: `4003`
  - `Frontend / Gateway`: `3000`

### Build Commands:
```bash
# Product Service
docker build -t shopsphere/product-service:v1.0.0 ./services/product-service

# Inventory Service
docker build -t shopsphere/inventory-service:v1.0.0 ./services/inventory-service

# Order Service
docker build -t shopsphere/order-service:v1.0.0 ./services/order-service

# Frontend
docker build -t shopsphere/frontend:v1.0.0 -f Dockerfile.frontend .
```

---

## 2. Kubernetes Readiness & Probe Configuration

Each service exposes distinct `/health/live` and `/health/ready` endpoints:

| Probe | Path | Recommended K8s Configuration | Behavior |
| :--- | :--- | :--- | :--- |
| **Liveness** | `/health/live` | `initialDelaySeconds: 10`<br>`periodSeconds: 15`<br>`timeoutSeconds: 3`<br>`failureThreshold: 3` | Verifies event loop is unblocked. **Does not test DB** to prevent restart storm cascades during database maintenance. |
| **Readiness** | `/health/ready` | `initialDelaySeconds: 5`<br>`periodSeconds: 10`<br>`timeoutSeconds: 3`<br>`failureThreshold: 2` | Executes `SELECT 1` on PostgreSQL. Drops pod from Kubernetes Service endpoints if database is unreachable. |

### Sample Kubernetes Spec:
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 4001
  initialDelaySeconds: 10
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /health/ready
    port: 4001
  initialDelaySeconds: 5
  periodSeconds: 10
```

---

## 3. Environment Variables & Secret Configuration

Services validate environment variables upon startup with Zod schemas. If any required variable is missing or malformed, the process exits immediately with a descriptive fatal log.

| Service | Variable | Sensitivity | Required | Description |
| :--- | :--- | :--- | :--- | :--- |
| **All** | `NODE_ENV` | Low | Yes | `production`, `development`, or `test` |
| **All** | `PORT` | Low | Yes | Internal listener port |
| **All** | `DATABASE_URL` | High | Yes | PostgreSQL connection string |
| **All** | `LOG_LEVEL` | Low | No | `debug`, `info`, `warn`, `error` (default: `info`) |
| **All** | `CORS_ORIGIN` | Low | No | Allowed CORS origin (default: `*`) |
| **Inventory** | `ADMIN_API_SECRET` | High | Yes | Shared secret for `/api/inventory/adjustments` |
| **Order** | `JWT_SECRET` | High | Yes | Min 32-character secret for signing JWT tokens |
| **Order** | `JWT_EXPIRES_IN` | Low | No | Token expiration duration (default: `24h`) |
| **Order** | `PRODUCT_SERVICE_URL` | Low | Yes | DNS URL for Product Service (e.g. `http://product-service:4001`) |
| **Order** | `INVENTORY_SERVICE_URL`| Low | Yes | DNS URL for Inventory Service (e.g. `http://inventory-service:4002`)|

---

## 4. Database Migrations & Seeding

Migrations are versioned in `database/migrations/`:
- `001_init_products.sql`
- `002_init_inventory.sql`
- `003_init_orders_and_users.sql`

A combined initialization file is placed at `database/init.sql` for PostgreSQL container entrypoints (`/docker-entrypoint-initdb.d/init.sql`).

### Running Migrations in CI/CD:
```bash
psql "$DATABASE_URL" -f database/migrations/001_init_products.sql
psql "$DATABASE_URL" -f database/migrations/002_init_inventory.sql
psql "$DATABASE_URL" -f database/migrations/003_init_orders_and_users.sql
```

### Seeding Initial Catalog & Demo Accounts:
```bash
psql "$DATABASE_URL" -f database/seeds/seed.sql
```

---

## 5. Metrics & Alerting Guidelines

Every service exports Prometheus metrics at `/health/metrics` or `/metrics`:

### Recommended Prometheus Alerting Rules:
1. **High HTTP Error Rate**:
   `rate(order_service_http_errors_total[5m]) > 0.05`
   Alert: Alert if 5xx errors exceed 5% of traffic.
2. **Elevated Inventory Reservation Failures**:
   `rate(inventory_service_reservation_failures_total[10m]) > 10`
   Alert: Indicates hot product stock-out or burst checkout spikes.
3. **Database Readiness Failure**:
   `probe_success{job="shopsphere-readiness"} == 0`
   Alert: Pod unable to connect to PostgreSQL.
4. **Order Compensation Spikes**:
   `increase(order_service_order_compensations_total[15m]) > 3`
   Alert: Indicates database latency or transaction persistence issues on Order Service.

---

## 6. Troubleshooting Runbook

### Issue: Pod in CrashLoopBackOff
- **Check startup logs**: Structured JSON will output validation failure if an environment variable is missing (e.g., `Invalid environment configuration: JWT_SECRET required`).

### Issue: Order Service returning 503
- **Check DNS resolution**: Verify `PRODUCT_SERVICE_URL` and `INVENTORY_SERVICE_URL` match your Kubernetes Service names.
- **Trace via Correlation ID**: Look up the `x-correlation-id` from the client response header in your centralized logging tool to see the exact downstream failure.

### Issue: 409 Conflict during checkout
- **Behavior**: Expected when requested quantity exceeds available inventory. Stock is safe and cannot drop below 0.
