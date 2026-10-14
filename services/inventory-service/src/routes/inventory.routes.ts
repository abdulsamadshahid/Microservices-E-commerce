import { Router } from 'express';
import { z } from 'zod';
import { InventoryService } from '../services/inventory.service.js';
import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';

export const inventoryRouter = Router();

const reservationSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  items: z.array(
    z.object({
      productId: z.string().min(1, 'productId is required'),
      quantity: z.number().int().positive('quantity must be a positive integer'),
    })
  ).min(1, 'items array must contain at least one item'),
});

const releaseSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().positive(),
    })
  ).optional(),
});

const commitSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
});

const adjustmentSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  stock: z.number().int().min(0, 'stock cannot be negative'),
});

inventoryRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'inventory-service',
    timestamp: new Date().toISOString(),
  });
});

inventoryRouter.get('/:productId', async (req, res, next) => {
  try {
    const stockInfo = await InventoryService.getStock(req.params.productId);
    res.status(200).json({
      success: true,
      data: stockInfo,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/reservations', async (req, res, next) => {
  try {
    const validated = reservationSchema.parse(req.body);
    const result = await InventoryService.reserveStock(validated.orderId, validated.items);

    res.status(201).json({
      success: true,
      message: 'Inventory successfully reserved.',
      data: result,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/reservations/release', async (req, res, next) => {
  try {
    const validated = releaseSchema.parse(req.body);
    await InventoryService.releaseReservation(validated.orderId, validated.items);

    res.status(200).json({
      success: true,
      message: `Reservation for order '${validated.orderId}' was successfully released.`,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/reservations/commit', async (req, res, next) => {
  try {
    const validated = commitSchema.parse(req.body);
    await InventoryService.commitReservation(validated.orderId);

    res.status(200).json({
      success: true,
      message: `Reservation for order '${validated.orderId}' committed.`,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/adjustments', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const providedSecret = authHeader?.replace(/^Bearer\s+/i, '');

    if (providedSecret !== config.ADMIN_API_SECRET) {
      throw new AppError({
        statusCode: 401,
        code: 'UNAUTHORIZED_ADMIN_ACTION',
        message: 'Invalid administrative credentials for stock adjustment.',
      });
    }

    const validated = adjustmentSchema.parse(req.body);
    const updated = await InventoryService.adjustStock(validated.productId, validated.stock);

    res.status(200).json({
      success: true,
      message: 'Inventory adjusted successfully.',
      data: updated,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});
