import { Prisma, VariantType } from '@prisma/client';
import { prisma } from '../database/prisma';
import { deleteImages } from '../services/cloudinary.service';
import type { ProductImageInput, ProductVariantInput } from '../validators/admin.validator';

function resolvePrimaryIndex(incoming: ProductImageInput[]): number {
  const marked = incoming.findIndex((img) => img.isPrimary === true);
  return marked >= 0 ? marked : 0;
}

async function syncVariantImages(
  variantId: string,
  existing: Array<{ id: string; cloudinaryPublicId: string | null; imageType: string }>,
  productImages: ProductImageInput[],
  galleryImages: ProductImageInput[],
  altTextFallback: string,
) {
  const incoming = [
    ...productImages.map((img) => ({ ...img, imageType: 'product' as const })),
    ...galleryImages.map((img) => ({ ...img, imageType: 'gallery' as const })),
  ];

  const incomingIds = new Set(incoming.filter((img) => img.id).map((img) => img.id!));
  const removed = existing.filter((img) => !incomingIds.has(img.id));

  if (removed.length) {
    const publicIds = removed.map((img) => img.cloudinaryPublicId).filter(Boolean) as string[];
    await deleteImages(publicIds);
    await prisma.variantImage.deleteMany({ where: { id: { in: removed.map((img) => img.id) } } });
  }

  const productPrimaryIndex = resolvePrimaryIndex(productImages);

  for (let i = 0; i < productImages.length; i++) {
    const img = productImages[i];
    const sortOrder = img.sortOrder ?? i;
    const altText = img.altText ?? altTextFallback;
    const isPrimary = i === productPrimaryIndex;

    if (img.id) {
      await prisma.variantImage.update({
        where: { id: img.id },
        data: {
          sortOrder,
          altText,
          isPrimary,
          imageType: 'product',
          ...(img.folder !== undefined ? { folder: img.folder } : {}),
        },
      });
    } else {
      await prisma.variantImage.create({
        data: {
          variantId,
          url: img.url,
          cloudinaryPublicId: img.cloudinaryPublicId ?? null,
          folder: img.folder ?? null,
          altText,
          sortOrder,
          isPrimary,
          imageType: 'product',
        },
      });
    }
  }

  for (let i = 0; i < galleryImages.length; i++) {
    const img = galleryImages[i];
    const sortOrder = img.sortOrder ?? i;
    const altText = img.altText ?? altTextFallback;

    if (img.id) {
      await prisma.variantImage.update({
        where: { id: img.id },
        data: {
          sortOrder,
          altText,
          isPrimary: false,
          imageType: 'gallery',
          ...(img.folder !== undefined ? { folder: img.folder } : {}),
        },
      });
    } else {
      await prisma.variantImage.create({
        data: {
          variantId,
          url: img.url,
          cloudinaryPublicId: img.cloudinaryPublicId ?? null,
          folder: img.folder ?? null,
          altText,
          sortOrder,
          isPrimary: false,
          imageType: 'gallery',
        },
      });
    }
  }
}

export async function syncProductVariants(
  productId: string,
  existing: Array<{
    id: string;
    sku: string;
    images: Array<{ id: string; cloudinaryPublicId: string | null; imageType: string }>;
  }>,
  incoming: ProductVariantInput[],
  altTextFallback: string,
): Promise<void> {
  const incomingIds = new Set(incoming.filter((v) => v.id).map((v) => v.id!));
  const removed = existing.filter((v) => !incomingIds.has(v.id));

  for (const variant of removed) {
    const publicIds = variant.images
      .map((img) => img.cloudinaryPublicId)
      .filter(Boolean) as string[];
    await deleteImages(publicIds);
    await prisma.productVariant.delete({ where: { id: variant.id } });
  }

  const defaultIndex = incoming.findIndex((v) => v.isDefault) >= 0
    ? incoming.findIndex((v) => v.isDefault)
    : 0;

  for (let i = 0; i < incoming.length; i++) {
    const variant = incoming[i];
    const sortOrder = variant.sortOrder ?? i;
    const isDefault = i === defaultIndex;

    const baseData = {
      sku: variant.sku,
      name: variant.name,
      colorHex: variant.colorHex ?? null,
      variantType: (variant.variantType ?? 'COLOR') as VariantType,
      price: variant.price ?? null,
      compareAtPrice: variant.compareAtPrice ?? null,
      stockQuantity: variant.stockQuantity ?? 0,
      sortOrder,
      isDefault,
      isActive: variant.isActive ?? true,
    };

    const existingVariant = variant.id
      ? existing.find((v) => v.id === variant.id)
      : undefined;

    // Only update when the id exists in DB — client-generated ids must create
    if (existingVariant) {
      await prisma.productVariant.update({
        where: { id: existingVariant.id },
        data: baseData,
      });
      await syncVariantImages(
        existingVariant.id,
        existingVariant.images,
        variant.productImages,
        variant.galleryImages ?? [],
        altTextFallback,
      );
    } else {
      const created = await prisma.productVariant.create({
        data: {
          productId,
          ...baseData,
        },
      });
      await syncVariantImages(
        created.id,
        [],
        variant.productImages,
        variant.galleryImages ?? [],
        altTextFallback,
      );
    }
  }

  // Sum variant stock onto product for listing filters
  const variants = await prisma.productVariant.findMany({
    where: { productId, isActive: true },
    select: { stockQuantity: true },
  });
  const totalStock = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
  await prisma.product.update({
    where: { id: productId },
    data: { stockQuantity: totalStock },
  });
}

export async function createProductVariantsOnCreate(
  productId: string,
  incoming: ProductVariantInput[],
  altTextFallback: string,
): Promise<void> {
  if (!incoming.length) return;
  await syncProductVariants(productId, [], incoming, altTextFallback);
}

export const productVariantInclude = {
  orderBy: { sortOrder: 'asc' as const },
  include: {
    images: { orderBy: { sortOrder: 'asc' as const } },
  },
} satisfies Prisma.ProductVariantFindManyArgs;
