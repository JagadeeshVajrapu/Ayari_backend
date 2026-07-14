import { Router, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { UserRole } from '@prisma/client';
import { env } from '../config/env';
import { authController } from '../controllers/auth.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
} from '../validators/auth.validator';

const authRouter = Router();

const skipRateLimitInDev = env.NODE_ENV === 'development';

function createRateLimiter(options: {
  max: number;
  message: string;
}): RequestHandler {
  if (skipRateLimitInDev) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: options.message,
    },
  });
}

const authRateLimiter = createRateLimiter({
  max: 20,
  message: 'Too many requests, please try again later',
});

const strictAuthRateLimiter = createRateLimiter({
  max: 5,
  message: 'Too many attempts, please try again later',
});

authRouter.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  authController.register,
);

authRouter.post('/login', strictAuthRateLimiter, validate(loginSchema), authController.login);

authRouter.post('/logout', authController.logout);

authRouter.post('/refresh-token', authRateLimiter, authController.refreshToken);

authRouter.post(
  '/forgot-password',
  strictAuthRateLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

authRouter.post(
  '/reset-password',
  strictAuthRateLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);

authRouter.post(
  '/resend-otp',
  strictAuthRateLimiter,
  validate(resendOtpSchema),
  authController.resendOtp,
);

authRouter.get('/me', authenticate, authController.getProfile);

authRouter.get(
  '/admin',
  authenticate,
  authorize(UserRole.ADMIN),
  authController.adminOnly,
);

export default authRouter;
