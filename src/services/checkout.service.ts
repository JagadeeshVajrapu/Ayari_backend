import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../database/prisma';
import { paymentRepository } from '../repositories/payment.repository';
import { shipmentService } from './shipment.service';
import { realtimeService } from './realtime.service';
import { notificationService } from './notification.service';
import { NotificationType } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../utils/appError.util';
import type { CreatePaymentOrderInput } from '../validators/payment.validator';

const FREE_SHIPPING_THRESHOLD = 5000;
const TAX_RATE = 0.18;
const STANDARD_SHIPPING = 199;
const EXPRESS_SHIPPING = 499;

export interface ResolvedLineItem {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  variantName?: string;
  variantImageUrl?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface CheckoutTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  itemCount: number;
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AY-${timestamp}-${random}`;
}

function calculateShipping(subtotal: number, shippingMethod: 'standard' | 'express'): number {
  if (shippingMethod === 'express') return EXPRESS_SHIPPING;
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
}

async function decrementOrderItemStock(
  tx: Prisma.TransactionClient,
  item: {
    productId: string | null;
    variantId: string | null;
    quantity: number;
    productName: string;
  },
): Promise<void> {
  if (!item.productId) {
    throw new BadRequestError(
      `${item.productName} is no longer available. Cancel this pending order and place a new one.`,
    );
  }

  if (item.variantId) {
    const updated = await tx.productVariant.updateMany({
      where: {
        id: item.variantId,
        productId: item.productId,
        isActive: true,
        stockQuantity: { gte: item.quantity },
      },
      data: { stockQuantity: { decrement: item.quantity } },
    });

    if (updated.count === 0) {
      throw new BadRequestError(`Insufficient stock for ${item.productName}`);
    }

    const variants = await tx.productVariant.findMany({
      where: { productId: item.productId, isActive: true },
      select: { stockQuantity: true },
    });
    const totalStock = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
    await tx.product.update({
      where: { id: item.productId },
      data: { stockQuantity: totalStock },
    });
    return;
  }

  const updated = await tx.product.updateMany({
    where: {
      id: item.productId,
      stockQuantity: { gte: item.quantity },
    },
    data: { stockQuantity: { decrement: item.quantity } },
  });

  if (updated.count === 0) {
    throw new BadRequestError(`Insufficient stock for ${item.productName}`);
  }
}

export class CheckoutService {
  async resolveLineItems(items: CreatePaymentOrderInput['items']): Promise<ResolvedLineItem[]> {
    const resolved: ResolvedLineItem[] = [];

    for (const item of items) {
      const product = await prisma.product.findFirst({
        where: {
          isActive: true,
          OR: [{ id: item.productId }, { slug: item.productId }],
        },
        include: {
          variants: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });

      if (!product) {
        throw new BadRequestError(`Product not found: ${item.productId}`);
      }

      const activeVariants = product.variants;

      if (activeVariants.length > 0) {
        const variant =
          (item.variantId
            ? activeVariants.find((v) => v.id === item.variantId)
            : activeVariants.find((v) => v.isDefault)) ?? activeVariants[0];

        if (!variant) {
          throw new BadRequestError(`Variant not found for ${product.name}`);
        }

        if (variant.stockQuantity < item.quantity) {
          throw new BadRequestError(`Insufficient stock for ${product.name} (${variant.name})`);
        }

        const unitPrice = variant.price != null ? Number(variant.price) : Number(product.price);
        const primaryImage =
          variant.images.find((img) => img.isPrimary && img.imageType === 'product') ??
          variant.images.find((img) => img.imageType === 'product');

        resolved.push({
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          sku: variant.sku,
          variantName: variant.name,
          variantImageUrl: primaryImage?.url ?? undefined,
          unitPrice,
          quantity: item.quantity,
          lineTotal: unitPrice * item.quantity,
        });
        continue;
      }

      if (product.stockQuantity < item.quantity) {
        throw new BadRequestError(`Insufficient stock for ${product.name}`);
      }

      const unitPrice = Number(product.price);
      resolved.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      });
    }

    return resolved;
  }

  async calculateTotals(
    lineItems: ResolvedLineItem[],
    shippingMethod: 'standard' | 'express',
    couponCode?: string,
  ): Promise<CheckoutTotals> {
    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);
    let discount = 0;

    if (couponCode) {
      const coupon = await prisma.coupon.findFirst({
        where: {
          code: couponCode.toUpperCase(),
          isActive: true,
        },
      });

      if (!coupon) {
        throw new BadRequestError('Invalid or expired coupon code');
      }

      const now = new Date();
      if (coupon.startsAt && coupon.startsAt > now) {
        throw new BadRequestError('Coupon is not active yet');
      }
      if (coupon.expiresAt && coupon.expiresAt < now) {
        throw new BadRequestError('Invalid or expired coupon code');
      }

      const minOrder = coupon.minOrderAmount ? Number(coupon.minOrderAmount) : 0;
      if (subtotal < minOrder) {
        throw new BadRequestError(`Minimum order of ₹${minOrder} required for this coupon`);
      }

      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        throw new BadRequestError('Coupon usage limit reached');
      }

      if (coupon.discountType === DiscountType.PERCENTAGE) {
        discount = Math.round(subtotal * (Number(coupon.discountValue) / 100));
        if (coupon.maxDiscount) {
          discount = Math.min(discount, Number(coupon.maxDiscount));
        }
      } else {
        discount = Math.min(Number(coupon.discountValue), subtotal);
      }
    }

    const shipping = lineItems.length > 0 ? calculateShipping(subtotal, shippingMethod) : 0;
    const taxableAmount = Math.max(0, subtotal - discount);
    const tax = Math.round(taxableAmount * TAX_RATE);
    const total = taxableAmount + shipping + tax;

    return { subtotal, discount, shipping, tax, total, itemCount };
  }

  async createPendingOrder(
    userId: string,
    input: CreatePaymentOrderInput,
    paymentMethod: PaymentMethod,
  ) {
    const lineItems = await this.resolveLineItems(input.items);
    const totals = await this.calculateTotals(lineItems, input.shippingMethod, input.couponCode);
    const orderNumber = generateOrderNumber();

    const coupon = input.couponCode
      ? await prisma.coupon.findFirst({ where: { code: input.couponCode.toUpperCase() } })
      : null;

    const order = await prisma.$transaction(async (tx) => {
      const address = await tx.address.create({
        data: {
          userId,
          firstName: input.shipping.firstName,
          lastName: input.shipping.lastName,
          street: input.shipping.street,
          city: input.shipping.city,
          state: input.shipping.state,
          zipCode: input.shipping.zipCode,
          country: input.shipping.country ?? 'IN',
          phone: input.shipping.phone,
          isDefault: false,
        },
      });

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          shippingAddressId: address.id,
          couponId: coupon?.id,
          status: OrderStatus.PENDING,
          subtotal: totals.subtotal,
          discountAmount: totals.discount,
          shippingAmount: totals.shipping,
          taxAmount: totals.tax,
          totalAmount: totals.total,
          notes: input.orderNotes,
          items: {
            create: lineItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              variantName: item.variantName ?? null,
              variantImageUrl: item.variantImageUrl ?? null,
              productName: item.name,
              productSku: item.sku,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              totalPrice: item.lineTotal,
            })),
          },
          payment: {
            create: {
              amount: totals.total,
              status: PaymentStatus.PENDING,
              paymentMethod,
              currency: 'INR',
            },
          },
        },
        include: { payment: true, items: true },
      });

      return createdOrder;
    });

    // Do NOT notify "order placed" here — payment may still fail / be cancelled.
    // Notifications are sent only after fulfillPaidOrder / fulfillCodOrder.

    return { order, totals, lineItems };
  }

  async getOrderForUser(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: true,
        payment: true,
        shippingAddress: true,
      },
    });

    if (!order) throw new NotFoundError('Order not found');
    return order;
  }

  async fulfillPaidOrder(params: {
    orderId: string;
    userId?: string;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
  }) {
    const order = await prisma.order.findUnique({
      where: { id: params.orderId },
      include: { payment: true, items: true },
    });

    if (!order) throw new NotFoundError('Order not found');
    if (params.userId && order.userId !== params.userId) {
      throw new NotFoundError('Order not found');
    }
    if (!order.payment) throw new BadRequestError('Payment record missing');

    if (order.payment.status === PaymentStatus.CAPTURED) {
      if (order.status === OrderStatus.CANCELLED) {
        return prisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CONFIRMED,
            placedAt: order.placedAt ?? new Date(),
            cancelledAt: null,
          },
          include: { payment: true, items: true, shippingAddress: true },
        });
      }

      // Ensure shipment exists even if a previous attempt timed out after capture
      void this.ensureShipmentForOrder(order.id, order.orderNumber, order.userId);
      return order;
    }

    // Keep the interactive transaction short: stock + payment + order only.
    // Shipment / emails run AFTER commit so Neon latency cannot fail a paid order.
    const updatedOrder = await prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: order.payment!.id } });
        if (payment?.status === PaymentStatus.CAPTURED) {
          return tx.order.findUniqueOrThrow({
            where: { id: order.id },
            include: { payment: true, items: true, shippingAddress: true },
          });
        }

        for (const item of order.items) {
          await decrementOrderItemStock(tx, {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            productName: item.productName,
          });
        }

        if (order.couponId) {
          await tx.coupon.update({
            where: { id: order.couponId },
            data: { usedCount: { increment: 1 } },
          });
        }

        await tx.cartItem.deleteMany({
          where: { cart: { userId: order.userId } },
        });

        await tx.payment.update({
          where: { id: order.payment!.id },
          data: {
            status: PaymentStatus.CAPTURED,
            transactionId: params.razorpayPaymentId ?? order.payment!.transactionId,
            gatewayRef: params.razorpayOrderId ?? order.payment!.gatewayRef,
            paidAt: new Date(),
            failureReason: null,
          },
        });

        return tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CONFIRMED,
            placedAt: new Date(),
            cancelledAt: null,
          },
          include: { payment: true, items: true, shippingAddress: true },
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    // Shipment must not delay payment verification response
    void this.ensureShipmentForOrder(order.id, order.orderNumber, order.userId);

    void notificationService.create({
      userId: order.userId,
      type: NotificationType.ORDER_CREATED,
      message: `Your order ${order.orderNumber} has been placed.`,
      orderId: order.id,
      metadata: { orderNumber: order.orderNumber, total: order.totalAmount },
      sendEmail: true,
    });

    void notificationService.create({
      userId: order.userId,
      type: NotificationType.PAYMENT_SUCCESSFUL,
      message: `Payment received for order ${order.orderNumber}.`,
      orderId: order.id,
      metadata: { orderNumber: order.orderNumber, amount: order.totalAmount },
      sendEmail: true,
    });

    void notificationService.create({
      userId: order.userId,
      type: NotificationType.ORDER_CONFIRMED,
      message: `Order ${order.orderNumber} has been confirmed.`,
      orderId: order.id,
      metadata: { orderNumber: order.orderNumber },
    });

    return updatedOrder;
  }

  /** Create shipment after payment is committed — never block verify on this. */
  private async ensureShipmentForOrder(
    orderId: string,
    orderNumber: string,
    userId: string,
  ): Promise<void> {
    try {
      const shipment = await shipmentService.createForPaidOrder(orderId);
      if (shipment) {
        void realtimeService.emitShipmentCreated({
          orderId,
          orderNumber,
          shipmentId: shipment.id,
          userId,
          status: shipment.status,
        });
      }
    } catch (error) {
      console.error(`[checkout] shipment create failed for order ${orderId}:`, error);
    }
  }

  async fulfillCodOrder(userId: string, input: CreatePaymentOrderInput) {
    const { order } = await this.createPendingOrder(userId, input, PaymentMethod.COD);

    const fulfilled = await prisma.$transaction(
      async (tx) => {
        for (const item of order.items) {
          await decrementOrderItemStock(tx, {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            productName: item.productName,
          });
        }

        if (order.couponId) {
          await tx.coupon.update({
            where: { id: order.couponId },
            data: { usedCount: { increment: 1 } },
          });
        }

        await tx.cartItem.deleteMany({
          where: { cart: { userId } },
        });

        return tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CONFIRMED,
            placedAt: new Date(),
          },
          include: { payment: true, items: true, shippingAddress: true },
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    void this.ensureShipmentForOrder(fulfilled.id, fulfilled.orderNumber, userId);

    void notificationService.create({
      userId,
      type: NotificationType.ORDER_CREATED,
      message: `Your order ${fulfilled.orderNumber} has been placed.`,
      orderId: fulfilled.id,
      metadata: { orderNumber: fulfilled.orderNumber, total: fulfilled.totalAmount },
      sendEmail: true,
    });

    void notificationService.create({
      userId,
      type: NotificationType.ORDER_CONFIRMED,
      message: `Order ${fulfilled.orderNumber} has been confirmed (Cash on Delivery).`,
      orderId: fulfilled.id,
      metadata: { orderNumber: fulfilled.orderNumber },
    });

    return fulfilled;
  }

  /**
   * Cancel a checkout that never completed payment (Razorpay dismiss / abandon).
   * No-op if payment was already captured or order already confirmed.
   */
  async abandonPendingOrder(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { payment: true },
    });

    if (!order) throw new NotFoundError('Order not found');

    if (
      order.payment?.status === PaymentStatus.CAPTURED ||
      order.status === OrderStatus.CONFIRMED ||
      order.status === OrderStatus.PROCESSING ||
      order.status === OrderStatus.SHIPPED ||
      order.status === OrderStatus.DELIVERED
    ) {
      return order;
    }

    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }

    // Only abandon true pending checkouts — never touch paid payments.
    if (order.payment && order.payment.status !== PaymentStatus.PENDING) {
      return order;
    }

    if (order.payment) {
      await paymentRepository.update(order.payment.id, {
        status: PaymentStatus.FAILED,
        failureReason: 'Payment cancelled by customer',
      });
    }

    return prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      include: { payment: true, items: true },
    });
  }

  async markPaymentFailed(orderId: string, reason: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!order?.payment) throw new NotFoundError('Order not found');

    if (order.payment.status === PaymentStatus.CAPTURED) {
      return order;
    }

    await paymentRepository.update(order.payment.id, {
      status: PaymentStatus.FAILED,
      failureReason: reason,
    });

    void notificationService.create({
      userId: order.userId,
      type: NotificationType.PAYMENT_FAILED,
      message: `Payment failed for order ${order.orderNumber}.`,
      orderId: orderId,
      metadata: { orderNumber: order.orderNumber, reason },
      sendEmail: true,
    });

    return prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      include: { payment: true, items: true },
    });
  }

  async attachRazorpayGatewayRef(orderId: string, razorpayOrderId: string) {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new NotFoundError('Payment not found');

    return paymentRepository.update(payment.id, {
      gatewayRef: razorpayOrderId,
    });
  }
}

export const checkoutService = new CheckoutService();
