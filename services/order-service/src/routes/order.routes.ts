import { Router } from 'express';
import { z } from 'zod';
import { OrderService } from '../services/order.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const orderRouter = Router();

const createOrderSchema = z.object({
  idempotencyKey: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1, 'productId is required'),
      quantity: z.number().int().positive('quantity must be a positive integer'),
    })
  ).min(1, 'Order must contain at least one item'),
});

orderRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'order-service',
    timestamp: new Date().toISOString(),
  });
});

orderRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const validated = createOrderSchema.parse(req.body);
    const idempotencyKey = (req.header('idempotency-key') || validated.idempotencyKey) as string | undefined;

    const order = await OrderService.createOrder(
      req.user!.id,
      validated.items,
      idempotencyKey,
      req.correlationId
    );

    res.status(201).json({
      success: true,
      message: 'Order created and confirmed.',
      data: order,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

orderRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const orders = await OrderService.listUserOrders(req.user!.id);

    res.status(200).json({
      success: true,
      data: orders,
      count: orders.length,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

orderRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const order = await OrderService.getOrderById(req.params.id, req.user!.id);

    res.status(200).json({
      success: true,
      data: order,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});
