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
  folder?: string | null;
  isPrimary?: boolean;
  createdAt?: Date;
}) {
  return {
    id: img.id,
    url: img.url,
    altText: img.altText,
    sortOrder: img.sortOrder,
    cloudinaryPublicId: img.cloudinaryPublicId ?? null,
    folder: img.folder ?? null,
    ...(img.isPrimary !== undefined ? { isPrimary: img.isPrimary } : {}),
    ...(img.createdAt ? { createdAt: img.createdAt.toISOString() } : {}),
  };
}

function parseJsonVariants<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function serializeVariant(
  variant: {
    id: string;
    sku: string;
    name: string;
    colorHex: string | null;
    variantType: string;
    price: Decimal | null;
    compareAtPrice: Decimal | null;
    stockQuantity: number;
    sortOrder: number;
    isDefault: boolean;
    isActive: boolean;
    images: Array<{
      id: string;
      url: string;
      altText: string | null;
      sortOrder: number;
      cloudinaryPublicId: string | null;
      folder: string | null;
      isPrimary: boolean;
      imageType: string;
      createdAt?: Date;
    }>;
  },
) {
  const productImages = variant.images.filter((img) => img.imageType === 'product');
  const galleryImages = variant.images.filter((img) => img.imageType === 'gallery');
  const primary = productImages.find((img) => img.isPrimary) ?? productImages[0];

  return {
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    colorHex: variant.colorHex,
    variantType: variant.variantType,
    price: decimalToNumber(variant.price),
    compareAtPrice: decimalToNumber(variant.compareAtPrice),
    stockQuantity: variant.stockQuantity,
    sortOrder: variant.sortOrder,
    isDefault: variant.isDefault,
    isActive: variant.isActive,
    image: primary?.url ?? null,
    images: productImages.map(serializeImage),
    galleryImages: galleryImages.map(serializeImage),
  };
}

function firstVariantWithImages(
  variants: Array<{
    image: string | null;
    images: Array<{ url: string }>;
    galleryImages: Array<{ url: string }>;
    variantType: string;
  }>,
) {
  const preferColor = variants.filter((v) => v.variantType === 'COLOR');
  const pool = preferColor.length ? preferColor : variants;
  return (
    pool.find((v) => v.image || v.images.length > 0 || v.galleryImages.length > 0) ?? null
  );
}

export function serializeProduct(
  product: Prisma.ProductGetPayload<{
    include: {
      category: true;
      images: { orderBy: { sortOrder: 'asc' } };
      featuredImages: { orderBy: { sortOrder: 'asc' } };
      variants: {
        orderBy: { sortOrder: 'asc' };
        include: { images: { orderBy: { sortOrder: 'asc' } } };
      };
    };
  }>,
) {
  const serializedVariants = (product.variants ?? []).map(serializeVariant);
  const defaultVariant =
    serializedVariants.find((v) => v.isDefault) ?? serializedVariants[0] ?? null;
  const imageSourceVariant =
    defaultVariant?.image ||
    defaultVariant?.images.length ||
    defaultVariant?.galleryImages.length
      ? defaultVariant
      : firstVariantWithImages(serializedVariants);

  const productPrimary =
    product.images.find((img) => img.isPrimary) ?? product.images[0] ?? null;
  const primaryImageUrl =
    imageSourceVariant?.image ?? productPrimary?.url ?? null;

  const legacyColorVariants = serializedVariants.length
    ? serializedVariants
        .filter((v) => v.variantType === 'COLOR')
        .map((v) => ({
          id: v.id,
          name: v.name,
          hex: v.colorHex ?? undefined,
          imageUrl: v.image ?? undefined,
          price: v.price ?? undefined,
          compareAtPrice: v.compareAtPrice ?? undefined,
        }))
    : parseJsonVariants(product.colorVariants);

  const legacySetVariants = serializedVariants.length
    ? serializedVariants
        .filter((v) => v.variantType === 'SET')
        .map((v) => ({
          id: v.id,
          name: v.name,
          label: v.name,
          price: v.price ?? undefined,
          compareAtPrice: v.compareAtPrice ?? undefined,
        }))
    : parseJsonVariants(product.setVariants);

  const listingGallery = imageSourceVariant
    ? [
        ...(imageSourceVariant.images.length
          ? imageSourceVariant.images.map((img) => img.url)
          : imageSourceVariant.galleryImages.map((img) => img.url)),
      ]
    : [];

  const resolvedGallery =
    listingGallery.length > 0
      ? listingGallery
      : product.images.length
        ? product.images.map((img) => img.url)
        : product.featuredImages.map((img) => img.url);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    sku: product.sku,
    price: defaultVariant?.price ?? Number(product.price),
    compareAtPrice: defaultVariant?.compareAtPrice ?? decimalToNumber(product.compareAtPrice),
    stockQuantity: defaultVariant?.stockQuantity ?? product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    categoryId: product.categoryId,
    category: product.category.name,
    categorySlug: product.category.slug,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    sizes: product.sizes ?? [],
    variants: serializedVariants,
    colorVariants: legacyColorVariants,
    setVariants: legacySetVariants,
    image: primaryImageUrl,
    images: product.images.map(serializeImage),
    featuredImages: product.featuredImages.map(serializeImage),
    galleryImages: resolvedGallery,
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
      variantId: item.variantId,
      variantName: item.variantName,
      variantImageUrl: item.variantImageUrl,
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

export function resolveCategoryCoverImage(category: {
  imageUrl?: string | null;
  products?: Array<{
    images?: Array<{ url: string }>;
    featuredImages?: Array<{ url: string }>;
  }>;
}): string | null {
  if (category.imageUrl) return category.imageUrl;
  const product = category.products?.[0];
  if (!product) return null;
  return product.images?.[0]?.url ?? product.featuredImages?.[0]?.url ?? null;
}

export function serializeCategory(
  category: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    _count: { products: number };
    products?: Array<{
      images?: Array<{ url: string }>;
      featuredImages?: Array<{ url: string }>;
    }>;
  },
) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: resolveCategoryCoverImage(category),
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
