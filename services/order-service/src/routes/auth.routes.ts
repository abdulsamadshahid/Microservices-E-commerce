import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const validated = registerSchema.parse(req.body);
    const result = await AuthService.register(validated.email, validated.password, validated.name);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const validated = loginSchema.parse(req.body);
    const result = await AuthService.login(validated.email, validated.password);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await AuthService.getUserById(req.user!.id);
    res.status(200).json({
      success: true,
      data: user,
      correlationId: req.correlationId,
    });
  } catch (err) {
    next(err);
  }
});
