import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../database/prisma';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    user: { select: { id: true; email: true; firstName: true; lastName: true } };
    items: true;
    payment: true;
    shippingAddress: true;
  };
}>;

export class OrderRepository {
  async findMany(params?: {
    search?: string;
    status?: OrderStatus;
    userId?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: OrderWithRelations[]; total: number }> {
    const where: Prisma.OrderWhereInput = {};

    if (params?.status) where.status = params.status;
    if (params?.userId) where.userId = params.userId;

    if (params?.search) {
      where.OR = [
        { orderNumber: { contains: params.search, mode: 'insensitive' } },
        { user: { email: { contains: params.search, mode: 'insensitive' } } },
        { user: { firstName: { contains: params.search, mode: 'insensitive' } } },
        { user: { lastName: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          items: true,
          payment: true,
          shippingAddress: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take,
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string): Promise<OrderWithRelations | null> {
    return prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: true,
        payment: true,
        shippingAddress: true,
      },
    });
  }

  async updateStatus(id: string, status: OrderStatus): Promise<OrderWithRelations> {
    const timestamps: Prisma.OrderUpdateInput = { status };

    if (status === OrderStatus.SHIPPED) timestamps.shippedAt = new Date();
    if (status === OrderStatus.DELIVERED) timestamps.deliveredAt = new Date();
    if (status === OrderStatus.CANCELLED) timestamps.cancelledAt = new Date();
    if (status === OrderStatus.CONFIRMED || status === OrderStatus.PROCESSING) {
      timestamps.placedAt = new Date();
    }

    return prisma.order.update({
      where: { id },
      data: timestamps,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: true,
        payment: true,
        shippingAddress: true,
      },
    });
  }

  async getRevenueStats(): Promise<{ totalRevenue: number; orderCount: number }> {
    const result = await prisma.order.aggregate({
      where: {
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    return {
      totalRevenue: Number(result._sum.totalAmount ?? 0),
      orderCount: result._count,
    };
  }

  async getMonthlyRevenue(months = 6): Promise<Array<{ label: string; value: number }>> {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
      },
      select: { totalAmount: true, createdAt: true },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < months; i += 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - (months - 1 - i));
      const key = d.toLocaleString('en-US', { month: 'short' });
      buckets.set(key, 0);
    }

    for (const order of orders) {
      const key = order.createdAt.toLocaleString('en-US', { month: 'short' });
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + Number(order.totalAmount));
      }
    }

    return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
  }
}

export class UserRepository {
  async findCustomers(params?: {
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Prisma.UserGetPayload<{ include: { _count: { select: { orders: true } } } }>[]; total: number }> {
    const where: Prisma.UserWhereInput = { role: UserRole.CUSTOMER };

    if (params?.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        include: { _count: { select: { orders: true } } },
        orderBy: { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take,
      }),
      prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async countCustomers(): Promise<number> {
    return prisma.user.count({ where: { role: UserRole.CUSTOMER, isActive: true } });
  }

  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; phone?: string | null },
  ) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async setActive(userId: string, isActive: boolean) {
    return prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });
  }
}

export const orderRepository = new OrderRepository();
export const userRepository = new UserRepository();
