import { Prisma, Product } from '@prisma/client';
import { prisma } from '../database/prisma';
import { deleteImages } from '../services/cloudinary.service';
import type { ProductImageInput } from '../validators/admin.validator';

const productInclude = {
  category: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  featuredImages: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function resolvePrimaryIndex(incoming: ProductImageInput[]): number {
  const marked = incoming.findIndex((img) => img.isPrimary === true);
  return marked >= 0 ? marked : 0;
}

async function syncProductImages(
  productId: string,
  existing: Array<{ id: string; cloudinaryPublicId: string | null }>,
  incoming: ProductImageInput[],
  altTextFallback: string,
) {
  const incomingIds = new Set(incoming.filter((img) => img.id).map((img) => img.id!));
  const removed = existing.filter((img) => !incomingIds.has(img.id));

  if (removed.length) {
    const publicIds = removed.map((img) => img.cloudinaryPublicId).filter(Boolean) as string[];
    await deleteImages(publicIds);
    await prisma.productImage.deleteMany({ where: { id: { in: removed.map((img) => img.id) } } });
  }

  const primaryIndex = resolvePrimaryIndex(incoming);
  const toCreate: Prisma.ProductImageCreateManyInput[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const img = incoming[i];
    const sortOrder = img.sortOrder ?? i;
    const altText = img.altText ?? altTextFallback;
    const isPrimary = i === primaryIndex;

    if (img.id) {
      await prisma.productImage.update({
        where: { id: img.id },
        data: {
          sortOrder,
          altText,
          isPrimary,
          ...(img.folder !== undefined ? { folder: img.folder } : {}),
        },
      });
    } else {
      toCreate.push({
        productId,
        url: img.url,
        cloudinaryPublicId: img.cloudinaryPublicId ?? null,
        folder: img.folder ?? null,
        altText,
        sortOrder,
        isPrimary,
      });
    }
  }

  if (toCreate.length) {
    await prisma.productImage.createMany({ data: toCreate });
  }
}

export class ProductRepository {
  async findMany(params?: {
    search?: string;
    categoryId?: string;
    isActive?: boolean;
    isFeatured?: boolean;
    inStockOnly?: boolean;
    priceMin?: number;
    priceMax?: number;
    skip?: number;
    take?: number;
    orderBy?: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[];
  }): Promise<{ items: ProductWithRelations[]; total: number }> {
    const where: Prisma.ProductWhereInput = {};

    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { sku: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params?.categoryId) where.categoryId = params.categoryId;
    if (params?.isActive !== undefined) where.isActive = params.isActive;
    if (params?.isFeatured !== undefined) where.isFeatured = params.isFeatured;
    if (params?.inStockOnly) where.stockQuantity = { gt: 0 };
    if (params?.priceMin !== undefined || params?.priceMax !== undefined) {
      where.price = {
        ...(params.priceMin !== undefined ? { gte: params.priceMin } : {}),
        ...(params.priceMax !== undefined ? { lte: params.priceMax } : {}),
      };
    }

    const orderBy = params?.orderBy ?? { createdAt: 'desc' };

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy,
        skip: params?.skip,
        take: params?.take,
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async findBySlug(slug: string): Promise<ProductWithRelations | null> {
    return prisma.product.findUnique({
      where: { slug },
      include: productInclude,
    });
  }

  async findById(id: string): Promise<ProductWithRelations | null> {
    return prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
  }

  async create(data: {
    name: string;
    slug: string;
    description?: string;
    sku: string;
    price: number;
    compareAtPrice?: number;
    stockQuantity: number;
    lowStockThreshold?: number;
    categoryId: string;
    isActive?: boolean;
    isFeatured?: boolean;
    sizes?: string[];
    colorVariants?: unknown;
    setVariants?: unknown;
    productImages: ProductImageInput[];
    featuredImages: ProductImageInput[];
  }): Promise<ProductWithRelations> {
    return prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        sku: data.sku,
        price: data.price,
        compareAtPrice: data.compareAtPrice,
        stockQuantity: data.stockQuantity,
        lowStockThreshold: data.lowStockThreshold ?? 5,
        categoryId: data.categoryId,
        isActive: data.isActive ?? true,
        isFeatured: data.isFeatured ?? false,
        sizes: data.sizes ?? [],
        colorVariants: (data.colorVariants ?? []) as Prisma.InputJsonValue,
        setVariants: (data.setVariants ?? []) as Prisma.InputJsonValue,
        images: {
          create: (() => {
            const primaryIndex = resolvePrimaryIndex(data.productImages);
            return data.productImages.map((img, i) => ({
              url: img.url,
              cloudinaryPublicId: img.cloudinaryPublicId ?? null,
              folder: img.folder ?? null,
              altText: img.altText ?? data.name,
              isPrimary: i === primaryIndex,
              sortOrder: img.sortOrder ?? i,
            }));
          })(),
        },
        featuredImages: {
          create: (data.featuredImages ?? []).map((img, i) => ({
            url: img.url,
            cloudinaryPublicId: img.cloudinaryPublicId ?? null,
            folder: img.folder ?? null,
            altText: img.altText ?? data.name,
            sortOrder: img.sortOrder ?? i,
          })),
        },
      },
      include: productInclude,
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      slug: string;
      description: string | null;
      sku: string;
      price: number;
      compareAtPrice: number | null;
      stockQuantity: number;
      lowStockThreshold: number;
      categoryId: string;
      isActive: boolean;
      isFeatured: boolean;
      sizes: string[];
      colorVariants: unknown;
      setVariants: unknown;
      productImages: ProductImageInput[];
      featuredImages: ProductImageInput[];
    }>,
  ): Promise<ProductWithRelations> {
    const { productImages, featuredImages, colorVariants, setVariants, ...productData } = data;

    const existing = await prisma.product.findUniqueOrThrow({
      where: { id },
      include: productInclude,
    });

    await prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(colorVariants !== undefined
          ? { colorVariants: colorVariants as Prisma.InputJsonValue }
          : {}),
        ...(setVariants !== undefined
          ? { setVariants: setVariants as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (productImages) {
      await syncProductImages(id, existing.images, productImages, productData.name ?? existing.name);
    }

    if (featuredImages) {
      await syncFeaturedImages(id, existing.featuredImages, featuredImages, productData.name ?? existing.name);
    }

    return prisma.product.findUniqueOrThrow({
      where: { id },
      include: productInclude,
    });
  }

  async delete(id: string): Promise<Product> {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id },
      include: { images: true, featuredImages: true },
    });

    const publicIds = [
      ...product.images.map((img) => img.cloudinaryPublicId),
      ...product.featuredImages.map((img) => img.cloudinaryPublicId),
    ].filter(Boolean) as string[];

    await deleteImages(publicIds);
    return prisma.product.delete({ where: { id } });
  }

  async countLowStock(): Promise<number> {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: { stockQuantity: true, lowStockThreshold: true },
    });
    return products.filter((p) => p.stockQuantity <= p.lowStockThreshold).length;
  }
}

async function syncFeaturedImages(
  productId: string,
  existing: Array<{ id: string; cloudinaryPublicId: string | null }>,
  incoming: ProductImageInput[],
  altTextFallback: string,
) {
  const incomingIds = new Set(incoming.filter((img) => img.id).map((img) => img.id!));
  const removed = existing.filter((img) => !incomingIds.has(img.id));

  if (removed.length) {
    const publicIds = removed.map((img) => img.cloudinaryPublicId).filter(Boolean) as string[];
    await deleteImages(publicIds);
    await prisma.featuredImage.deleteMany({ where: { id: { in: removed.map((img) => img.id) } } });
  }

  const toCreate: Prisma.FeaturedImageCreateManyInput[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const img = incoming[i];
    const sortOrder = img.sortOrder ?? i;
    const altText = img.altText ?? altTextFallback;

    if (img.id) {
      await prisma.featuredImage.update({
        where: { id: img.id },
        data: {
          sortOrder,
          altText,
          ...(img.folder !== undefined ? { folder: img.folder } : {}),
        },
      });
    } else {
      toCreate.push({
        productId,
        url: img.url,
        cloudinaryPublicId: img.cloudinaryPublicId ?? null,
        folder: img.folder ?? null,
        altText,
        sortOrder,
      });
    }
  }

  if (toCreate.length) {
    await prisma.featuredImage.createMany({ data: toCreate });
  }
}

export const productRepository = new ProductRepository();
