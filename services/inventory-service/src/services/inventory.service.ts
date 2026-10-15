import { v4 as uuidv4 } from 'uuid';
import { getInventoryDb } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';
import { metrics } from '../metrics.js';
import { logger } from '../logger.js';

export interface ReservationItemRequest {
  productId: string;
  quantity: number;
}

export interface ReservationResult {
  reservationId: string;
  orderId: string;
  items: {
    productId: string;
    quantity: number;
    remainingStock: number;
  }[];
}

export class InventoryService {
  /**
   * Retrieves current stock status for a given product
   */
  static async getStock(productId: string) {
    const db = await getInventoryDb();
    const result = await db.query(
      'SELECT product_id, stock, reserved FROM inventory_items WHERE product_id = $1',
      [productId]
    );

    if (result.rows.length === 0) {
      throw new AppError({
        statusCode: 404,
        code: 'PRODUCT_INVENTORY_NOT_FOUND',
        message: `Inventory record for product '${productId}' was not found.`,
      });
    }

    const row = result.rows[0];
    return {
      productId: row.product_id,
      availableStock: row.stock,
      reservedStock: row.reserved,
      inStock: row.stock > 0,
    };
  }

  /**
   * Atomically reserves stock for an order.
   * If any item has insufficient stock, the entire reservation is aborted.
   */
  static async reserveStock(orderId: string, items: ReservationItemRequest[]): Promise<ReservationResult> {
    const db = await getInventoryDb();
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const reservationId = uuidv4();
      const reservedDetails: { productId: string; quantity: number; remainingStock: number }[] = [];

      for (const item of items) {
        const qty = Number(item.quantity);
        let updateRes;
        try {
          // Atomic conditional update: only deducts if stock >= quantity
          updateRes = await client.query(
            `UPDATE inventory_items
             SET stock = stock - ${qty}, reserved = reserved + ${qty}, updated_at = CURRENT_TIMESTAMP
             WHERE product_id = $1 AND stock >= ${qty}
             RETURNING stock, reserved;`,
            [item.productId]
          );
        } catch (err: any) {
          if (err.message?.includes('check constraint') || err.code === '23514') {
            await client.query('ROLLBACK');
            metrics.recordReservation(false);
            throw new AppError({
              statusCode: 409,
              code: 'INSUFFICIENT_INVENTORY',
              message: `Insufficient stock for product '${item.productId}'. Stock cannot drop below 0.`,
              details: {
                productId: item.productId,
                requestedQuantity: item.quantity,
              },
            });
          }
          throw err;
        }

        if (!updateRes || updateRes.rows.length === 0) {
          // Check current stock to provide informative error
          const currentRes = await client.query(
            'SELECT stock FROM inventory_items WHERE product_id = $1',
            [item.productId]
          );

          await client.query('ROLLBACK');
          metrics.recordReservation(false);

          const available = currentRes.rows.length > 0 ? currentRes.rows[0].stock : 0;
          throw new AppError({
            statusCode: 409,
            code: 'INSUFFICIENT_INVENTORY',
            message: `Insufficient stock for product '${item.productId}'. Requested: ${item.quantity}, Available: ${available}.`,
            details: {
              productId: item.productId,
              requestedQuantity: item.quantity,
              availableStock: available,
            },
          });
        }

        const remainingStock = updateRes.rows[0].stock;
        reservedDetails.push({
          productId: item.productId,
          quantity: item.quantity,
          remainingStock,
        });

        // Insert reservation record
        const itemResId = uuidv4();
        await client.query(
          `INSERT INTO inventory_reservations (id, order_id, product_id, quantity, status, created_at, updated_at)
           VALUES ($1, $2, $3, ${qty}, 'RESERVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [itemResId, orderId, item.productId]
        );
      }

      await client.query('COMMIT');
      metrics.recordReservation(true);

      logger.info('Successfully reserved inventory for order', {
        orderId,
        reservationId,
        itemsCount: items.length,
      });

      return {
        reservationId,
        orderId,
        items: reservedDetails,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors if already aborted
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Compensation mechanism: Releases stock back if the Order Service fails during order creation.
   */
  static async releaseReservation(orderId: string, items?: ReservationItemRequest[]): Promise<void> {
    const db = await getInventoryDb();
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Find active reservations for this order
      const reservations = await client.query(
        `SELECT id, product_id, quantity FROM inventory_reservations
         WHERE order_id = $1 AND status = 'RESERVED'`,
        [orderId]
      );

      const itemsToRelease = reservations.rows.length > 0
        ? reservations.rows.map(r => ({ productId: r.product_id, quantity: r.quantity }))
        : (items || []);

      for (const item of itemsToRelease) {
        const qty = Number(item.quantity);
        await client.query(
          `UPDATE inventory_items
           SET stock = stock + ${qty}, reserved = GREATEST(0, reserved - ${qty}), updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1`,
          [item.productId]
        );
      }

      await client.query(
        `UPDATE inventory_reservations
         SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status = 'RESERVED'`,
        [orderId]
      );

      await client.query('COMMIT');
      logger.info('Compensation: Successfully released inventory reservation', { orderId });
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.error('Failed to release reservation compensation', { orderId, error: err.message });
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Commits the reservation once the order is successfully saved.
   */
  static async commitReservation(orderId: string): Promise<void> {
    const db = await getInventoryDb();
    await db.query(
      `UPDATE inventory_reservations
       SET status = 'COMMITTED', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND status = 'RESERVED'`,
      [orderId]
    );
  }

  /**
   * Administrative stock adjustment
   */
  static async adjustStock(productId: string, newStock: number) {
    if (newStock < 0) {
      throw new AppError({
        statusCode: 400,
        code: 'INVALID_STOCK_VALUE',
        message: 'Stock cannot be negative.',
      });
    }

    const db = await getInventoryDb();
    const result = await db.query(
      `INSERT INTO inventory_items (product_id, stock, reserved, updated_at)
       VALUES ($1, $2, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (product_id)
       DO UPDATE SET stock = $2, updated_at = CURRENT_TIMESTAMP
       RETURNING product_id, stock, reserved;`,
      [productId, newStock]
    );

    return result.rows[0];
  }
}
