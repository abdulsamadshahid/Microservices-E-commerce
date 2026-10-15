import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getOrderDb } from '../db/client.js';
import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
}

export class AuthService {
  static async register(email: string, password: string, name: string): Promise<{ user: UserResponse; token: string }> {
    const db = await getOrderDb();

    // Check duplicate
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      throw new AppError({
        statusCode: 409,
        code: 'USER_ALREADY_EXISTS',
        message: `An account with email '${email}' is already registered.`,
      });
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role, created_at)
       VALUES ($1, $2, $3, $4, 'customer', CURRENT_TIMESTAMP)`,
      [userId, email.toLowerCase().trim(), passwordHash, name.trim()]
    );

    const user: UserResponse = {
      id: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      role: 'customer',
    };

    const token = jwt.sign(user, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as any });

    return { user, token };
  }

  static async login(email: string, password: string): Promise<{ user: UserResponse; token: string }> {
    const db = await getOrderDb();

    const result = await db.query(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      throw new AppError({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const row = result.rows[0];
    const passwordValid = await bcrypt.compare(password, row.password_hash);

    if (!passwordValid) {
      throw new AppError({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const user: UserResponse = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    };

    const token = jwt.sign(user, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as any });

    return { user, token };
  }

  static async getUserById(userId: string): Promise<UserResponse> {
    const db = await getOrderDb();
    const result = await db.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new AppError({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'User account not found.',
      });
    }

    return result.rows[0];
  }
}
