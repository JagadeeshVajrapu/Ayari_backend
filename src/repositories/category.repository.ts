import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

const categoryListInclude = {
  _count: {
    select: {
      // Admin deletion must account for inactive products too.
      products: true,
    },
  },
  products: {
    where: { isActive: true },
    take: 1,
    orderBy: [{ isFeatured: 'desc' as const }, { updatedAt: 'desc' as const }],
    include: {
      images: {
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        take: 1,
      },
      featuredImages: {
        orderBy: { sortOrder: 'asc' as const },
        take: 1,
      },
    },
  },
} satisfies Prisma.CategoryInclude;

export type CategoryWithCover = Prisma.CategoryGetPayload<{
  include: typeof categoryListInclude;
}>;

export class CategoryRepository {
  async findMany(): Promise<CategoryWithCover[]> {
    return prisma.category.findMany({
      include: categoryListInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  }

  async create(data: {
    name: string;
    slug: string;
    description?: string;
    imageUrl?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return prisma.category.create({ data });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    return prisma.category.update({ where: { id }, data });
  }

  async delete(id: string) {
    const productCount = await prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      throw new Error('Cannot delete category with products');
    }
    return prisma.category.delete({ where: { id } });
  }
}

export const categoryRepository = new CategoryRepository();
