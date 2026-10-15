import { Router } from 'express';
import { z } from 'zod';
import { ProductService } from '../services/product.service.js';

export const productRouter = Router();

const querySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
});

productRouter.get('/', async (req, res, next) => {
  try {
    const validated = querySchema.parse(req.query);
    const products = await ProductService.listProducts(validated.search, validated.category);

    res.status(200).json({
      success: true,
      data: products,
      count: products.length,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

productRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'product-service',
    timestamp: new Date().toISOString(),
  });
});

productRouter.get('/:id', async (req, res, next) => {
  try {
    const product = await ProductService.getProductById(req.params.id);

    res.status(200).json({
      success: true,
      data: product,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

productRouter.post('/seed', async (req, res, next) => {
  try {
    const count = await ProductService.seedProducts();
    res.status(200).json({
      success: true,
      message: 'Product catalog seed verified.',
      productCount: count,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});
