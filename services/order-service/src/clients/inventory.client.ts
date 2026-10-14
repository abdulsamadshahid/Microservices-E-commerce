import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

export interface ReservationItem {
  productId: string;
  quantity: number;
}

export class InventoryClient {
  static async reserveStock(orderId: string, items: ReservationItem[], correlationId: string) {
    const url = `${config.INVENTORY_SERVICE_URL}/api/inventory/reservations`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify({ orderId, items }),
      });

      const body = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new AppError({
            statusCode: 409,
            code: 'INSUFFICIENT_INVENTORY',
            message: body.error?.message || 'Inventory reservation failed due to insufficient stock.',
            details: body.error?.details,
          });
        }

        throw new AppError({
          statusCode: 502,
          code: 'INVENTORY_SERVICE_ERROR',
          message: body.error?.message || `Inventory Service error status ${response.status}`,
          details: body.error,
        });
      }

      return body.data;
    } catch (err: any) {
      if (err instanceof AppError) throw err;

      throw new AppError({
        statusCode: 503,
        code: 'INVENTORY_SERVICE_UNAVAILABLE',
        message: `Failed to connect to Inventory Service at ${url}: ${err.message}`,
      });
    }
  }

  static async releaseStock(orderId: string, items: ReservationItem[], correlationId: string) {
    const url = `${config.INVENTORY_SERVICE_URL}/api/inventory/reservations/release`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify({ orderId, items }),
      });

      if (!response.ok) {
        logger.error('Failed compensation release call to Inventory Service', {
          orderId,
          status: response.status,
          correlationId,
        });
      }
    } catch (err: any) {
      logger.error('Network exception in Inventory Service compensation release', {
        orderId,
        error: err.message,
        correlationId,
      });
    }
  }

  static async commitReservation(orderId: string, correlationId: string) {
    const url = `${config.INVENTORY_SERVICE_URL}/api/inventory/reservations/commit`;

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify({ orderId }),
      });
    } catch (err: any) {
      logger.warn('Failed to asynchronously commit reservation (non-fatal)', {
        orderId,
        error: err.message,
      });
    }
  }
}
