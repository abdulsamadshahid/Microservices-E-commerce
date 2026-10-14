import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';

export interface AuthoritativeProduct {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
}

export class ProductClient {
  static async getProduct(productId: string, correlationId: string): Promise<AuthoritativeProduct> {
    const url = `${config.PRODUCT_SERVICE_URL}/api/products/${productId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-correlation-id': correlationId,
        },
      });

      const body = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          throw new AppError({
            statusCode: 404,
            code: 'PRODUCT_NOT_FOUND',
            message: `Product '${productId}' was not found in catalog.`,
            details: body.error,
          });
        }

        throw new AppError({
          statusCode: 502,
          code: 'DEPENDENCY_ERROR',
          message: `Product Service responded with status ${response.status}`,
          details: body.error,
        });
      }

      return body.data;
    } catch (err: any) {
      if (err instanceof AppError) throw err;

      throw new AppError({
        statusCode: 503,
        code: 'PRODUCT_SERVICE_UNAVAILABLE',
        message: `Failed to communicate with Product Service at ${url}: ${err.message}`,
      });
    }
  }
}
