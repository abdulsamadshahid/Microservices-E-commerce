import { v4 as uuidv4 } from 'uuid';
import { getOrderDb } from '../db/client.js';
import { ProductClient } from '../clients/product.client.js';
import { InventoryClient } from '../clients/inventory.client.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { metrics } from '../metrics.js';

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface OrderRecord {
  id: string;
  userId: string;
  idempotencyKey?: string | null;
  status: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items?: OrderItemRecord[];
}

export class OrderService {
  /**
   * Creates an order with authoritative price calculation, atomic inventory reservation,
   * idempotency protection, and automatic compensation on failure.
   */
  static async createOrder(
    userId: string,
    items: OrderItemInput[],
    idempotencyKey?: string,
    correlationId: string = 'internal'
  ): Promise<OrderRecord> {
    const db = await getOrderDb();

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = await db.query(
        'SELECT * FROM orders WHERE idempotency_key = $1 AND user_id = $2',
        [idempotencyKey, userId]
      );

      if (existing.rows.length > 0) {
        logger.info('Idempotent order request matched existing order', {
          userId,
          idempotencyKey,
          orderId: existing.rows[0].id,
          correlationId,
        });
        return this.getOrderById(existing.rows[0].id, userId);
      }
    }

    // 2. Fetch authoritative prices from Product Service & calculate order items
    const authoritativeItems: {
      productId: string;
      productName: string;
      quantity: number;
      unitPriceCents: number;
      subtotalCents: number;
    }[] = [];

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
        subtotalCents,
      });
    }

    const orderId = uuidv4();

    // 3. Request atomic inventory reservation
    await InventoryClient.reserveStock(
      orderId,
      items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      correlationId
    );

    // 4. Persist order & items in database
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO orders (id, user_id, idempotency_key, status, total_cents, created_at, updated_at)
         VALUES ($1, $2, $3, 'CONFIRMED', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [orderId, userId, idempotencyKey || null, totalCents]
      );

      for (const item of authoritativeItems) {
        const itemId = uuidv4();
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [itemId, orderId, item.productId, item.productName, item.quantity, item.unitPriceCents, item.subtotalCents]
        );
      }

      await client.query('COMMIT');
      metrics.recordOrderCreated();

      // Commit reservation asynchronously
      InventoryClient.commitReservation(orderId, correlationId).catch(() => {});

      logger.info('Order persisted successfully', { orderId, userId, totalCents, correlationId });
    } catch (err: any) {
      // 5. Compensation: Order persistence failed -> Release reserved stock
      await client.query('ROLLBACK');
      metrics.recordOrderCompensation();

      logger.error('Order database persistence failed, initiating compensation rollback on inventory', {
        orderId,
        userId,
        error: err.message,
        correlationId,
      });

      await InventoryClient.releaseStock(
        orderId,
        items.map(i => ({ productId: i.productId, quantity: i.quantity })),
        correlationId
      );

      throw new AppError({
        statusCode: 500,
        code: 'ORDER_PERSISTENCE_FAILED',
        message: 'Order could not be saved to database. Any reserved stock was safely released.',
        details: err.message,
      });
    } finally {
      client.release();
    }

    return this.getOrderById(orderId, userId);
  }

  /**
   * Retrieves orders belonging strictly to the authenticated user
   */
  static async listUserOrders(userId: string): Promise<OrderRecord[]> {
    const db = await getOrderDb();
    const result = await db.query(
      `SELECT id, user_id, idempotency_key, status, total_cents, created_at, updated_at
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const orders: OrderRecord[] = [];
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
        items: itemsRes.rows.map(i => ({
          id: i.id,
          orderId: i.order_id,
          productId: i.product_id,
          productName: i.product_name,
          quantity: i.quantity,
          unitPriceCents: i.unit_price_cents,
          subtotalCents: i.subtotal_cents,
        })),
      });
    }

    return orders;
  }

  /**
   * Retrieves an individual order, strictly verifying that it belongs to the authenticated user.
   */
  static async getOrderById(orderId: string, userId: string): Promise<OrderRecord> {
    const db = await getOrderDb();

    // Query order
    const orderRes = await db.query(
      'SELECT id, user_id, idempotency_key, status, total_cents, created_at, updated_at FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new AppError({
        statusCode: 404,
        code: 'ORDER_NOT_FOUND',
        message: `Order with ID '${orderId}' not found.`,
      });
    }

    const row = orderRes.rows[0];

    // Enforce ownership: Users cannot view another user's order
    if (row.user_id !== userId) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN_ORDER_ACCESS',
        message: 'You do not have permission to access this order.',
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
      items: itemsRes.rows.map(i => ({
        id: i.id,
        orderId: i.order_id,
        productId: i.product_id,
        productName: i.product_name,
        quantity: i.quantity,
        unitPriceCents: i.unit_price_cents,
        subtotalCents: i.subtotal_cents,
      })),
    };
  }
}
