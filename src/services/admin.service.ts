import { OrderStatus } from '@prisma/client';
import { categoryRepository } from '../repositories/category.repository';
import { orderRepository, userRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { prisma } from '../database/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/appError.util';
import {
  serializeCategory,
  serializeCustomer,
  serializeOrder,
  serializeProduct,
} from '../utils/serialize.util';
import { slugify, uniqueSlug } from '../utils/slug.util';
import {
  CreateCategoryInput,
  CreateProductInput,
  UpdateCategoryInput,
  UpdateOrderStatusInput,
  UpdateProductInput,
  UpdateProfileInput,
} from '../validators/admin.validator';

export class AdminService {
  async getDashboard() {
    const [revenueStats, customerCount, productCount, lowStock, monthlyRevenue, recentOrders, statusBreakdown] =
      await Promise.all([
        orderRepository.getRevenueStats(),
        userRepository.countCustomers(),
        prisma.product.count({ where: { isActive: true } }),
        productRepository.countLowStock(),
        orderRepository.getMonthlyRevenue(6),
        orderRepository.findMany({ take: 5 }),
        prisma.order.groupBy({
          by: ['status'],
          _count: true,
        }),
      ]);

    return {
      stats: {
        revenue: revenueStats.totalRevenue,
        orders: revenueStats.orderCount,
        customers: customerCount,
        products: productCount,
        lowStock,
      },
      monthlyRevenue,
      recentOrders: recentOrders.items.map(serializeOrder),
      ordersByStatus: statusBreakdown.map((row) => ({
        status: row.status,
        count: row._count,
      })),
    };
  }

  async listProducts(params: { page: number; limit: number; search?: string; categoryId?: string; isActive?: boolean }) {
    const skip = (params.page - 1) * params.limit;
    const { items, total } = await productRepository.findMany({
      search: params.search,
      categoryId: params.categoryId,
      isActive: params.isActive,
      skip,
      take: params.limit,
    });

    return {
      items: items.map(serializeProduct),
      pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    };
  }

  async createProduct(input: CreateProductInput) {
    const existingSku = await prisma.product.findUnique({ where: { sku: input.sku } });
    if (existingSku) throw new ConflictError('SKU already exists');

    const slugs = (await prisma.product.findMany({ select: { slug: true } })).map((p) => p.slug);
    const slug = uniqueSlug(input.name, slugs);

    const product = await productRepository.create({ ...input, slug });
    return serializeProduct(product);
  }

  async updateProduct(id: string, input: UpdateProductInput) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');

    if (input.sku && input.sku !== existing.sku) {
      const skuTaken = await prisma.product.findUnique({ where: { sku: input.sku } });
      if (skuTaken) throw new ConflictError('SKU already exists');
    }

    let slug = existing.slug;
    if (input.name && input.name !== existing.name) {
      const slugs = (await prisma.product.findMany({ where: { id: { not: id } }, select: { slug: true } })).map(
        (p) => p.slug,
      );
      slug = uniqueSlug(input.name, slugs);
    }

    const product = await productRepository.update(id, { ...input, slug });
    return serializeProduct(product);
  }

  async deleteProduct(id: string) {
    const existing = await productRepository.findById(id);
    if (!existing) throw new NotFoundError('Product not found');
    await productRepository.delete(id);
  }

  async listOrders(params: { page: number; limit: number; search?: string; status?: OrderStatus }) {
    const skip = (params.page - 1) * params.limit;
    const { items, total } = await orderRepository.findMany({
      search: params.search,
      status: params.status,
      skip,
      take: params.limit,
    });

    return {
      items: items.map(serializeOrder),
      pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    };
  }

  async updateOrderStatus(id: string, input: UpdateOrderStatusInput) {
    const order = await orderRepository.findById(id);
    if (!order) throw new NotFoundError('Order not found');
    const updated = await orderRepository.updateStatus(id, input.status);
    return serializeOrder(updated);
  }

  async listCustomers(params: { page: number; limit: number; search?: string }) {
    const skip = (params.page - 1) * params.limit;
    const { items, total } = await userRepository.findCustomers({
      search: params.search,
      skip,
      take: params.limit,
    });

    return {
      items: items.map(serializeCustomer),
      pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    };
  }

  async setUserActive(userId: string, isActive: boolean) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'CUSTOMER') throw new NotFoundError('Customer not found');
    await userRepository.setActive(userId, isActive);
  }

  async listCategories() {
    const categories = await categoryRepository.findMany();
    return categories.map(serializeCategory);
  }

  async createCategory(input: CreateCategoryInput) {
    const slug = slugify(input.name);
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictError('Category already exists');
    const category = await categoryRepository.create({ ...input, slug });
    return serializeCategory({ ...category, _count: { products: 0 } });
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    const existing = await categoryRepository.findById(id);
    if (!existing) throw new NotFoundError('Category not found');

    let slug = existing.slug;
    if (input.name && input.name !== existing.name) {
      slug = slugify(input.name);
      const slugTaken = await prisma.category.findFirst({ where: { slug, id: { not: id } } });
      if (slugTaken) throw new ConflictError('Category name already in use');
    }

    const category = await categoryRepository.update(id, { ...input, slug });
    const count = await prisma.product.count({ where: { categoryId: id } });
    return serializeCategory({ ...category, _count: { products: count } });
  }

  async deleteCategory(id: string) {
    try {
      await categoryRepository.delete(id);
    } catch {
      throw new BadRequestError('Cannot delete category that has products');
    }
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    return userRepository.updateProfile(userId, input);
  }

  async getUserOrders(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { items, total } = await orderRepository.findMany({ userId, skip, take: limit });
    return {
      items: items.map(serializeOrder),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export class ProductService {
  async listPublic(params: {
    page: number;
    limit: number;
    search?: string;
    category?: string;
    featured?: boolean;
    inStockOnly?: boolean;
    priceMin?: number;
    priceMax?: number;
    sort?: 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'name-asc';
  }) {
    let categoryId: string | undefined;
    if (params.category) {
      const cat = await prisma.category.findFirst({
        where: {
          isActive: true,
          OR: [{ slug: params.category }, { name: { equals: params.category, mode: 'insensitive' } }],
        },
      });
      categoryId = cat?.id;
      if (params.category && !categoryId) {
        return {
          items: [],
          pagination: { page: params.page, limit: params.limit, total: 0, totalPages: 0 },
        };
      }
    }

    const orderBy = (() => {
      switch (params.sort) {
        case 'price-asc':
          return { price: 'asc' as const };
        case 'price-desc':
          return { price: 'desc' as const };
        case 'name-asc':
          return { name: 'asc' as const };
        case 'featured':
          return [{ isFeatured: 'desc' as const }, { createdAt: 'desc' as const }];
        case 'newest':
        default:
          return { createdAt: 'desc' as const };
      }
    })();

    const skip = (params.page - 1) * params.limit;
    const { items, total } = await productRepository.findMany({
      search: params.search,
      categoryId,
      isActive: true,
      isFeatured: params.featured ? true : undefined,
      inStockOnly: params.inStockOnly,
      priceMin: params.priceMin,
      priceMax: params.priceMax,
      skip,
      take: params.limit,
      orderBy,
    });

    return {
      items: items.map(serializeProduct),
      pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
    };
  }

  async getBySlug(slug: string) {
    const product = await productRepository.findBySlug(slug);
    if (!product || !product.isActive) throw new NotFoundError('Product not found');
    return serializeProduct(product);
  }
}

export const adminService = new AdminService();
export const productService = new ProductService();
