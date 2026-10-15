export interface Product {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  image_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryStatus {
  productId: string;
  availableStock: number;
  reservedStock: number;
  inStock: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface Order {
  id: string;
  userId: string;
  idempotencyKey?: string | null;
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface ServiceHealth {
  service: string;
  port: number;
  status: 'UP' | 'DOWN' | 'LOADING';
  readyStatus: 'READY' | 'DOWN' | 'LOADING';
  latencyMs?: number;
  checks?: Record<string, string>;
  uptimeSeconds?: number;
}
