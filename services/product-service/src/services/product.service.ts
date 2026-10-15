import { getProductDb } from '../db/client.js';
import { AppError } from '../middleware/errorHandler.js';

export interface Product {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  image_url: string;
  created_at: string;
  updated_at: string;
}

export class ProductService {
  static async listProducts(search?: string, category?: string): Promise<Product[]> {
    const db = await getProductDb();
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: unknown[] = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(description) LIKE $${params.length})`;
    }

    query += ' ORDER BY name ASC';
    const result = await db.query(query, params);
    return result.rows;
  }

  static async getProductById(id: string): Promise<Product> {
    const db = await getProductDb();
    const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      throw new AppError({
        statusCode: 404,
        code: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${id}' was not found.`,
      });
    }

    return result.rows[0];
  }

  static async seedProducts(): Promise<number> {
    const db = await getProductDb();
    const countRes = await db.query('SELECT COUNT(*) as count FROM products');
    return parseInt(countRes.rows[0].count, 10);
  }
}
