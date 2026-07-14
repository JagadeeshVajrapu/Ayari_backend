import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/appError.util';
import { sendError } from '../utils/apiResponse.util';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode, err.errors);
  }

  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.') || 'root',
      message: e.message,
    }));
    return sendError(res, 'Validation failed', 400, errors);
  }

  if (err instanceof JsonWebTokenError || err instanceof TokenExpiredError) {
    return sendError(res, 'Invalid or expired token', 401);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 'Image must be 5MB or smaller', 400);
    }
    return sendError(res, err.message, 400);
  }

  if (err.message?.includes('Only JPEG, PNG, WebP, GIF, and AVIF')) {
    return sendError(res, err.message, 400);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return sendError(res, 'A record with this value already exists', 409);
    }
    if (err.code === 'P2025') {
      return sendError(res, 'Record not found', 404);
    }
  }

  if (env.NODE_ENV === 'development') {
    console.error(err);
  }

  return sendError(res, 'Internal server error', 500);
}

export function notFoundHandler(_req: Request, res: Response): Response {
  return sendError(res, 'Route not found', 404);
}
