import { Decimal } from '@prisma/client/runtime/library';
import { OrderStatus, Prisma } from '@prisma/client';

function decimalToNumber(value: Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function serializeImage(img: {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  cloudinaryPublicId?: string | null;
  isPrimary?: boolean;
}) {
  return {
    id: img.id,
    url: img.url,
    altText: img.altText,
    sortOrder: img.sortOrder,
    cloudinaryPublicId: img.cloudinaryPublicId ?? null,
    ...(img.isPrimary !== undefined ? { isPrimary: img.isPrimary } : {}),
  };
}

export function serializeProduct(
  product: Prisma.ProductGetPayload<{
    include: {
      category: true;
      images: { orderBy: { sortOrder: 'asc' } };
      featuredImages: { orderBy: { sortOrder: 'asc' } };
    };
  }>,
) {
  const primaryImage = product.images.find((img) => img.isPrimary) ?? product.images[0];

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    sku: product.sku,
    price: Number(product.price),
    compareAtPrice: decimalToNumber(product.compareAtPrice),
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    categoryId: product.categoryId,
    category: product.category.name,
    categorySlug: product.category.slug,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    image: primaryImage?.url ?? null,
    images: product.images.map(serializeImage),
    featuredImages: product.featuredImages.map(serializeImage),
    galleryImages: product.featuredImages.length
      ? product.featuredImages.map((img) => img.url)
      : product.images.map((img) => img.url),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function serializeOrder(
  order: Prisma.OrderGetPayload<{
    include: {
      user: { select: { id: true; email: true; firstName: true; lastName: true } };
      items: true;
      payment: true;
      shippingAddress: true;
    };
  }>,
) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discountAmount),
    shippingAmount: Number(order.shippingAmount),
    taxAmount: Number(order.taxAmount),
    totalAmount: Number(order.totalAmount),
    notes: order.notes,
    placedAt: order.placedAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    customer: {
      id: order.user.id,
      email: order.user.email,
      name: `${order.user.firstName} ${order.user.lastName}`.trim(),
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      totalPrice: Number(item.totalPrice),
    })),
    payment: order.payment
      ? {
          id: order.payment.id,
          status: order.payment.status,
          method: order.payment.paymentMethod,
          amount: Number(order.payment.amount),
          paidAt: order.payment.paidAt?.toISOString() ?? null,
        }
      : null,
    shippingAddress: {
      firstName: order.shippingAddress.firstName,
      lastName: order.shippingAddress.lastName,
      street: order.shippingAddress.street,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      zipCode: order.shippingAddress.zipCode,
      country: order.shippingAddress.country,
      phone: order.shippingAddress.phone,
    },
  };
}

export function serializeCustomer(
  user: Prisma.UserGetPayload<{ include: { _count: { select: { orders: true } } } }>,
) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isActive: user.isActive,
    orderCount: user._count.orders,
    createdAt: user.createdAt.toISOString(),
  };
}

export function serializeCategory(
  category: Prisma.CategoryGetPayload<{ include: { _count: { select: { products: true } } } }>,
) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    productCount: category._count.products,
    createdAt: category.createdAt.toISOString(),
  };
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};
