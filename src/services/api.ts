import type { Product, InventoryStatus, Order, User } from '../types/index.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;
  correlationId?: string;

  constructor(message: string, code: string, statusCode: number, details?: unknown, correlationId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.correlationId = correlationId;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE}${path}`;
  const response = await fetch(url, { ...options, headers });
  const correlationId = response.headers.get('x-correlation-id') || undefined;

  let body: any;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorInfo = body?.error;
    throw new ApiError(
      errorInfo?.message || `Request failed with status ${response.status}`,
      errorInfo?.code || 'HTTP_ERROR',
      response.status,
      errorInfo?.details,
      correlationId || errorInfo?.correlationId
    );
  }

  return body;
}

export const api = {
  // Product API
  async getProducts(search?: string, category?: string): Promise<Product[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category && category !== 'All') params.append('category', category);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await request<{ data: Product[] }>(`/products${queryString}`);
    return res.data;
  },

  async getProduct(id: string): Promise<Product> {
    const res = await request<{ data: Product }>(`/products/${id}`);
    return res.data;
  },

  // Inventory API
  async getInventory(productId: string): Promise<InventoryStatus> {
    const res = await request<{ data: InventoryStatus }>(`/inventory/${productId}`);
    return res.data;
  },

  async adjustInventory(productId: string, stock: number, adminSecret: string): Promise<void> {
    await request(
      '/inventory/adjustments',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminSecret}` },
        body: JSON.stringify({ productId, stock }),
      }
    );
  },

  // Auth API
  async register(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
    const res = await request<{ data: { user: User; token: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    return res.data;
  },

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await request<{ data: { user: User; token: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return res.data;
  },

  async getMe(token: string): Promise<User> {
    const res = await request<{ data: User }>('/auth/me', { method: 'GET' }, token);
    return res.data;
  },

  // Orders API
  async createOrder(
    items: { productId: string; quantity: number }[],
    idempotencyKey: string,
    token: string
  ): Promise<Order> {
    const res = await request<{ data: Order }>(
      '/orders',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ items, idempotencyKey }),
      },
      token
    );
    return res.data;
  },

  async getOrders(token: string): Promise<Order[]> {
    const res = await request<{ data: Order[] }>('/orders', { method: 'GET' }, token);
    return res.data;
  },

  async getOrder(id: string, token: string): Promise<Order> {
    const res = await request<{ data: Order }>(`/orders/${id}`, { method: 'GET' }, token);
    return res.data;
  },

  // Health & Metrics Checks
  async checkServiceHealth(service: 'product' | 'inventory' | 'order'): Promise<any> {
    const startTime = performance.now();
    try {
      const res = await fetch(`/health/${service}/ready`);
      const data = await res.json();
      const latencyMs = Math.round(performance.now() - startTime);
      return { ...data, latencyMs };
    } catch (err: any) {
      return { status: 'DOWN', error: err.message, latencyMs: Math.round(performance.now() - startTime) };
    }
  },

  async getMetrics(service: 'product' | 'inventory' | 'order'): Promise<string> {
    try {
      const res = await fetch(`/health/${service}/metrics`);
      return await res.text();
    } catch {
      return 'Failed to fetch metrics';
    }
  },
};
