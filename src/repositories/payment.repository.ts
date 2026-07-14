import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

export class PaymentRepository {
  async findByOrderId(orderId: string) {
    return prisma.payment.findUnique({ where: { orderId } });
  }

  async findByGatewayRef(gatewayRef: string) {
    return prisma.payment.findFirst({ where: { gatewayRef } });
  }

  async findByTransactionId(transactionId: string) {
    return prisma.payment.findUnique({ where: { transactionId } });
  }

  async create(data: {
    orderId: string;
    amount: Prisma.Decimal | number;
    paymentMethod: PaymentMethod;
    status?: PaymentStatus;
    gatewayRef?: string;
    transactionId?: string;
  }) {
    return prisma.payment.create({
      data: {
        orderId: data.orderId,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        status: data.status ?? PaymentStatus.PENDING,
        gatewayRef: data.gatewayRef,
        transactionId: data.transactionId,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      status: PaymentStatus;
      gatewayRef: string | null;
      transactionId: string | null;
      failureReason: string | null;
      paidAt: Date | null;
    }>,
  ) {
    return prisma.payment.update({ where: { id }, data });
  }
}

export const paymentRepository = new PaymentRepository();
