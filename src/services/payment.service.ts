import crypto from 'crypto';
import { PaymentMethod } from '@prisma/client';
import { env, isRazorpayConfigured } from '../config/env';
import { checkoutService } from './checkout.service';
import { paymentRepository } from '../repositories/payment.repository';
import { BadRequestError, NotFoundError } from '../utils/appError.util';
import type {
  CreatePaymentOrderInput,
  VerifyRazorpayPaymentInput,
} from '../validators/payment.validator';

interface RazorpayApiOrder {
  id: string;
  amount: number;
  currency: string;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        status: string;
        error_description?: string;
      };
    };
    order?: {
      entity: {
        id: string;
      };
    };
  };
}

function buildOrderResponse(order: {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: { toString(): string } | number;
  payment: { paymentMethod: string } | null;
}) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.payment?.paymentMethod ?? 'RAZORPAY',
    total: Number(order.totalAmount),
  };
}

async function createRazorpayApiOrder(
  amountInPaise: number,
  receipt: string,
): Promise<RazorpayApiOrder> {
  const credentials = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
  ).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: { source: 'ayari-checkout' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new BadRequestError(`Razorpay order creation failed: ${errorBody}`);
  }

  return response.json() as Promise<RazorpayApiOrder>;
}

function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return expected === signature;
}

function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  return expected === signature;
}

export class PaymentService {
  async createRazorpayOrder(userId: string, input: CreatePaymentOrderInput) {
    const { order, totals } = await checkoutService.createPendingOrder(
      userId,
      input,
      PaymentMethod.RAZORPAY,
    );

    const amountInPaise = Math.round(totals.total * 100);

    if (!isRazorpayConfigured()) {
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        razorpayOrderId: `order_mock_${order.id}`,
        amount: amountInPaise,
        currency: 'INR',
        keyId: '',
        mock: true,
        total: totals.total,
      };
    }

    const razorpayOrder = await createRazorpayApiOrder(amountInPaise, order.orderNumber);
    await checkoutService.attachRazorpayGatewayRef(order.id, razorpayOrder.id);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: env.RAZORPAY_KEY_ID!,
      mock: false,
      total: totals.total,
    };
  }

  async verifyRazorpayPayment(userId: string, input: VerifyRazorpayPaymentInput) {
    const order = await checkoutService.getOrderForUser(input.orderId, userId);

    if (order.payment?.status === 'CAPTURED') {
      return buildOrderResponse(order);
    }

    if (!isRazorpayConfigured()) {
      const fulfilled = await checkoutService.fulfillPaidOrder({
        orderId: order.id,
        userId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpayOrderId: input.razorpayOrderId,
      });
      return buildOrderResponse(fulfilled);
    }

    if (order.payment?.gatewayRef && order.payment.gatewayRef !== input.razorpayOrderId) {
      throw new BadRequestError('Razorpay order mismatch');
    }

    const isValid = verifyRazorpayPaymentSignature(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
    );

    if (!isValid) {
      await checkoutService.markPaymentFailed(order.id, 'Invalid payment signature');
      throw new BadRequestError('Payment verification failed. Invalid signature.');
    }

    const fulfilled = await checkoutService.fulfillPaidOrder({
      orderId: order.id,
      userId,
      razorpayPaymentId: input.razorpayPaymentId,
      razorpayOrderId: input.razorpayOrderId,
    });

    return buildOrderResponse(fulfilled);
  }

  async placeCodOrder(userId: string, input: CreatePaymentOrderInput) {
    const order = await checkoutService.fulfillCodOrder(userId, input);
    return buildOrderResponse(order);
  }

  async getOrder(userId: string, orderId: string) {
    const order = await checkoutService.getOrderForUser(orderId, userId);
    return buildOrderResponse(order);
  }

  async handleRazorpayWebhook(rawBody: string, signature: string | undefined) {
    if (!isRazorpayConfigured()) {
      throw new BadRequestError('Razorpay is not configured');
    }

    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestError('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    const paymentEntity = payload.payload.payment?.entity;

    if (!paymentEntity) {
      return { handled: false, event: payload.event };
    }

    const dbPayment = await paymentRepository.findByGatewayRef(paymentEntity.order_id);
    if (!dbPayment) {
      throw new NotFoundError('Payment not found for webhook order');
    }

    if (payload.event === 'payment.captured' || paymentEntity.status === 'captured') {
      await checkoutService.fulfillPaidOrder({
        orderId: dbPayment.orderId,
        razorpayPaymentId: paymentEntity.id,
        razorpayOrderId: paymentEntity.order_id,
      });
      return { handled: true, event: payload.event, orderId: dbPayment.orderId };
    }

    if (payload.event === 'payment.failed' || paymentEntity.status === 'failed') {
      await checkoutService.markPaymentFailed(
        dbPayment.orderId,
        paymentEntity.error_description ?? 'Payment failed',
      );
      return { handled: true, event: payload.event, orderId: dbPayment.orderId };
    }

    return { handled: false, event: payload.event };
  }
}

export const paymentService = new PaymentService();
