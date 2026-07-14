import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

export class CategoryRepository {
  async findMany(): Promise<
    Prisma.CategoryGetPayload<{ include: { _count: { select: { products: true } } } }>[]
  > {
    return prisma.category.findMany({
      include: { _count: { select: { products: true } } },
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
