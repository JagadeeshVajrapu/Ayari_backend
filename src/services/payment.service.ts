import crypto from 'crypto';
import { PaymentMethod } from '@prisma/client';
import {
  env,
  getRazorpayKeyId,
  getRazorpayKeySecret,
  isRazorpayConfigured,
} from '../config/env';
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
  payment: { paymentMethod: string; status?: string } | null;
}) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.payment?.paymentMethod ?? 'RAZORPAY',
    paymentStatus: order.payment?.status ?? null,
    total: Number(order.totalAmount),
  };
}

async function createRazorpayApiOrder(
  amountInPaise: number,
  receipt: string,
): Promise<RazorpayApiOrder> {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) {
    throw new BadRequestError('Razorpay is not configured');
  }

  // Razorpay receipt max length is 40 characters
  const safeReceipt = receipt.slice(0, 40);
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt: safeReceipt,
      notes: { source: 'ayari-checkout' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let description = errorBody;
    try {
      const parsed = JSON.parse(errorBody) as { error?: { description?: string; code?: string } };
      description = parsed.error?.description ?? errorBody;
    } catch {
      // keep raw body
    }

    if (response.status === 401 || /authentication failed/i.test(description)) {
      throw new BadRequestError(
        'Razorpay authentication failed. Your KEY_ID and KEY_SECRET do not match. ' +
          'Open https://dashboard.razorpay.com/app/keys (Test Mode ON), copy both keys into backend/.env, ' +
          'set the same KEY_ID in frontend/.env.local as NEXT_PUBLIC_RAZORPAY_KEY_ID, then restart the backend.',
      );
    }

    throw new BadRequestError(`Razorpay order creation failed: ${description}`);
  }

  return response.json() as Promise<RazorpayApiOrder>;
}

function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const keySecret = getRazorpayKeySecret();
  if (!keySecret) return false;

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature.trim(), 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/** Fallback when HMAC fails: confirm payment with Razorpay Payments API. */
async function fetchRazorpayPayment(paymentId: string): Promise<{
  id: string;
  order_id: string;
  status: string;
} | null> {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret || !paymentId || paymentId.startsWith('pay_mock_')) {
    return null;
  }

  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) return null;
  return response.json() as Promise<{ id: string; order_id: string; status: string }>;
}

function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET.trim())
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
      keyId: getRazorpayKeyId()!,
      mock: false,
      total: totals.total,
    };
  }

  async verifyRazorpayPayment(userId: string, input: VerifyRazorpayPaymentInput) {
    const order = await checkoutService.getOrderForUser(input.orderId, userId);

    if (order.payment?.status === 'CAPTURED') {
      return buildOrderResponse(order);
    }

    const isMockPayload =
      input.razorpayOrderId.startsWith('order_mock_') ||
      input.razorpayPaymentId.startsWith('pay_mock_') ||
      input.razorpaySignature === 'mock_signature';

    // Local mock checkout — only when Razorpay live mode is off
    if (!isRazorpayConfigured()) {
      const fulfilled = await checkoutService.fulfillPaidOrder({
        orderId: order.id,
        userId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpayOrderId: input.razorpayOrderId,
      });
      return buildOrderResponse(fulfilled);
    }

    // Frontend sent mock verify while backend is in live Test Mode
    if (isMockPayload) {
      throw new BadRequestError(
        'Payment mode mismatch: backend expects a real Razorpay payment. Refresh the page and complete checkout in the Razorpay window.',
      );
    }

    if (order.payment?.gatewayRef && order.payment.gatewayRef !== input.razorpayOrderId) {
      throw new BadRequestError('Razorpay order mismatch');
    }

    let isValid = verifyRazorpayPaymentSignature(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
    );

    // Secondary check via Payments API (covers rare HMAC edge cases)
    if (!isValid) {
      const payment = await fetchRazorpayPayment(input.razorpayPaymentId);
      const paidStatuses = new Set(['authorized', 'captured']);
      if (
        payment &&
        payment.order_id === input.razorpayOrderId &&
        paidStatuses.has(payment.status)
      ) {
        isValid = true;
      }
    }

    if (!isValid) {
      // Do NOT cancel the order here — Razorpay may have charged the customer.
      // Keep PENDING so a retry / Payments API recovery can still fulfill it.
      throw new BadRequestError(
        'Payment verification failed. Please try again. If money was deducted, open Orders or contact support with your payment ID.',
      );
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

  async abandonOrder(userId: string, orderId: string) {
    const order = await checkoutService.abandonPendingOrder(orderId, userId);
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
