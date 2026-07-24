import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { sendSuccess } from '../utils/apiResponse.util';
import {
  CreatePaymentOrderInput,
  VerifyRazorpayPaymentInput,
} from '../validators/payment.validator';

export class PaymentController {
  createRazorpayOrder = asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreatePaymentOrderInput;
    const order = await paymentService.createRazorpayOrder(req.user!.id, input);
    sendSuccess(res, 'Razorpay order created', order, 201);
  });

  verifyRazorpayPayment = asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as VerifyRazorpayPaymentInput;
    const result = await paymentService.verifyRazorpayPayment(req.user!.id, input);
    sendSuccess(res, 'Payment verified successfully', result);
  });

  placeCodOrder = asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreatePaymentOrderInput;
    const order = await paymentService.placeCodOrder(req.user!.id, input);
    sendSuccess(res, 'Order placed successfully', order, 201);
  });

  getOrder = asyncHandler(async (req: Request, res: Response) => {
    const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
    const order = await paymentService.getOrder(req.user!.id, orderId);
    sendSuccess(res, 'Order retrieved', order);
  });

  abandonOrder = asyncHandler(async (req: Request, res: Response) => {
    const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
    const order = await paymentService.abandonOrder(req.user!.id, orderId);
    sendSuccess(res, 'Pending payment cancelled', order);
  });

  razorpayWebhook = asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    const result = await paymentService.handleRazorpayWebhook(rawBody, signature);
    sendSuccess(res, 'Webhook processed', result);
  });
}

export const paymentController = new PaymentController();
