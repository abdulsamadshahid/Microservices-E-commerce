import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4003),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long').default('shopsphere_dev_jwt_secret_key_change_in_production_min_32_chars'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  PRODUCT_SERVICE_URL: z.string().url().default('http://localhost:4001'),
  INVENTORY_SERVICE_URL: z.string().url().default('http://localhost:4002'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration for Order Service:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;
