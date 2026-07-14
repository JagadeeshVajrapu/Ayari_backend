import { Response } from 'express';
import { ApiErrorResponse, ApiSuccessResponse } from '../types/auth.types';

export function sendSuccess<T>(
  res: Response,
  message: string,
  data: T,
  statusCode = 200,
): Response<ApiSuccessResponse<T>> {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  errors?: Array<{ field: string; message: string }>,
): Response<ApiErrorResponse> {
  const body: ApiErrorResponse = {
    success: false,
    message,
  };

  if (errors && errors.length > 0) {
    body.errors = errors;
  }

  return res.status(statusCode).json(body);
}
