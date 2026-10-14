# ShopSphere API Specification

## 1. Global Standards

### Response Envelope & Status Codes
All responses utilize standard HTTP status codes:
- `200 OK`: Successful retrieval or update
- `201 Created`: Resource successfully created
- `400 Bad Request`: Payload validation failed (`VALIDATION_ERROR`)
- `401 Unauthorized`: Missing, expired, or invalid JWT or secret
- `403 Forbidden`: Authenticated user does not own the requested resource
- `404 Not Found`: Resource does not exist
- `409 Conflict`: Business rule violated (e.g., duplicate user email or insufficient inventory)
- `502 Bad Gateway`: Downstream microservice responded with an error
- `503 Service Unavailable`: Downstream microservice or database connection unreachable
- `500 Internal Server Error`: Unhandled application exception (stack traces omitted in production)

### Error Contract
Every error conforms to this standard JSON shape:
```json
{
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "Insufficient stock for product 'prod-8'. Requested: 10, Available: 2.",
    "details": {
      "productId": "prod-8",
      "requestedQuantity": 10,
      "availableStock": 2
    },
    "correlationId": "2221895d-c6ad-42a4-990b-9438e6761bae"
  }
}
```

### Common Headers
- `x-correlation-id`: Request correlation identifier.
- `Authorization`: `Bearer <jwt_token>` for protected endpoints.
- `Idempotency-Key`: Optional client-generated UUID for preventing duplicate orders on network retries.

---

## 2. Product Service (`http://localhost:4001`)

### `GET /api/products`
Retrieves product catalog with optional query filtering.
- **Query Params**:
  - `search` (optional): string query matching name or description
  - `category` (optional): category name (`Audio`, `Electronics`, `Home & Office`, `Apparel`)
- **Response** (`200 OK`):
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "prod-1",
      "name": "AeroPulse ANC Wireless Headphones",
      "description": "Active noise cancelling with 40-hour battery life",
      "price_cents": 24999,
      "category": "Audio",
      "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e"
    }
  ]
}
```

### `GET /api/products/:id`
Retrieves single product by ID.
- **Response** (`200 OK` or `404 Not Found`).

---

## 3. Inventory Service (`http://localhost:4002`)

### `GET /api/inventory/:productId`
Retrieves live stock status.
- **Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "productId": "prod-1",
    "availableStock": 25,
    "reservedStock": 0,
    "inStock": true
  }
}
```

### `POST /api/inventory/reservations`
Atomically reserves stock for an order.
- **Request Body**:
```json
{
  "orderId": "order-uuid-123",
  "items": [
    { "productId": "prod-1", "quantity": 2 },
    { "productId": "prod-4", "quantity": 1 }
  ]
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "message": "Inventory successfully reserved.",
  "data": {
    "reservationId": "res-uuid-456",
    "orderId": "order-uuid-123",
    "items": [
      { "productId": "prod-1", "quantity": 2, "remainingStock": 23 },
      { "productId": "prod-4", "quantity": 1, "remainingStock": 49 }
    ]
  }
}
```

### `POST /api/inventory/reservations/release`
Releases reserved stock back if downstream order persistence fails.
- **Request Body**:
```json
{
  "orderId": "order-uuid-123",
  "items": [{ "productId": "prod-1", "quantity": 2 }]
}
```
- **Response** (`200 OK`).

### `POST /api/inventory/adjustments`
Administrative stock adjustment.
- **Header**: `Authorization: Bearer <ADMIN_API_SECRET>`
- **Request Body**:
```json
{
  "productId": "prod-1",
  "stock": 50
}
```
- **Response** (`200 OK`).

---

## 4. Order Service (`http://localhost:4003`)

### `POST /api/auth/register`
- **Request Body**:
```json
{
  "email": "user@example.com",
  "password": "minimum8characters",
  "name": "Jane Doe"
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid-999",
      "email": "user@example.com",
      "name": "Jane Doe",
      "role": "customer"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### `POST /api/auth/login`
- **Request Body**:
```json
{
  "email": "alice@example.com",
  "password": "password123"
}
```
- **Response** (`200 OK`).

### `GET /api/auth/me`
- **Header**: `Authorization: Bearer <token>`
- **Response** (`200 OK`).

### `POST /api/orders`
Creates order, calculates authoritative price, reserves inventory, and saves record.
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Idempotency-Key: <unique-uuid>` (optional)
- **Request Body**:
```json
{
  "idempotencyKey": "order-attempt-001",
  "items": [
    { "productId": "prod-1", "quantity": 1 },
    { "productId": "prod-4", "quantity": 2 }
  ]
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "message": "Order created and confirmed.",
  "data": {
    "id": "order-uuid-888",
    "userId": "user-alice",
    "idempotencyKey": "order-attempt-001",
    "status": "CONFIRMED",
    "totalCents": 31999,
    "createdAt": "2026-10-13T18:21:15.617Z",
    "items": [
      {
        "id": "item-1",
        "productId": "prod-1",
        "productName": "AeroPulse ANC Wireless Headphones",
        "quantity": 1,
        "unitPriceCents": 24999,
        "subtotalCents": 24999
      },
      {
        "id": "item-2",
        "productId": "prod-4",
        "productName": "Artisan Vegan Leather Desk Mat",
        "quantity": 2,
        "unitPriceCents": 3500,
        "subtotalCents": 7000
      }
    ]
  }
}
```

### `GET /api/orders`
Lists authenticated user's orders.
- **Header**: `Authorization: Bearer <token>`
- **Response** (`200 OK`).

### `GET /api/orders/:id`
Retrieves single order belonging to authenticated user.
- **Header**: `Authorization: Bearer <token>`
- **Response** (`200 OK` if owned, `403 Forbidden` if owned by someone else, `404 Not Found`).

---

## 5. Health Endpoints (All Services)

| Endpoint | Method | Purpose | Typical Response |
| :--- | :--- | :--- | :--- |
| `/health/live` | GET | Liveness probe (Kubernetes process restart trigger) | `200 OK` `{ "status": "UP" }` |
| `/health/ready` | GET | Readiness probe (Traffic routing gating, DB ping) | `200 OK` `{ "status": "READY", "checks": { "database": "UP" } }` |
| `/health` | GET | Concise summary for developers | `200 OK` `{ "status": "HEALTHY" }` |
| `/metrics` | GET | Prometheus formatted text metrics | `200 OK` `# HELP ...` |
