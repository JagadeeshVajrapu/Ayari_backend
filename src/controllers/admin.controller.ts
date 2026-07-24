import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { adminService, productService } from '../services/admin.service';
import { addressService } from '../services/address.service';
import { BadRequestError } from '../utils/appError.util';
import { asyncHandler } from '../utils/asyncHandler.util';
import { sendSuccess } from '../utils/apiResponse.util';
import { toSafeUser } from '../utils/user.util';
import {
  CreateCategoryInput,
  CreateProductInput,
  UpdateCategoryInput,
  UpdateOrderStatusInput,
  UpdateProductInput,
  UpdateProfileInput,
  UpdateUserStatusInput,
} from '../validators/admin.validator';
import type { AddressInput, UpdateAddressInput } from '../validators/address.validator';

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

export class AdminController {
  dashboard = asyncHandler(async (_req: Request, res: Response) => {
    const data = await adminService.getDashboard();
    sendSuccess(res, 'Dashboard data retrieved', data);
  });

  listProducts = asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const isActive =
      req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;

    const data = await adminService.listProducts({ page, limit, search, categoryId, isActive });
    sendSuccess(res, 'Products retrieved', data);
  });

  createProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await adminService.createProduct(req.body as CreateProductInput);
    sendSuccess(res, 'Product created', { product }, 201);
  });

  updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await adminService.updateProduct(paramId(req), req.body as UpdateProductInput);
    sendSuccess(res, 'Product updated', { product });
  });

  deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminService.deleteProduct(paramId(req));
    sendSuccess(res, 'Product permanently deleted', result);
  });

  uploadProductImage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new BadRequestError('No image file provided');
    }

    const typeParam = String(req.query.type ?? 'product');
    const isGallery = typeParam === 'featured' || typeParam === 'gallery' || typeParam === 'gallery-images';
    const folderType = isGallery ? 'gallery-images' : 'product-images';

    const categoryName = String(req.query.categoryName ?? req.body?.categoryName ?? 'uncategorized');
    const productName = String(req.query.productName ?? req.body?.productName ?? 'product');
    const variantName = String(req.query.variantName ?? req.body?.variantName ?? '').trim();

    const { buildProductMediaFolder, buildVariantMediaFolder } = await import(
      '../utils/cloudinary-folder.util'
    );
    const folder = variantName
      ? buildVariantMediaFolder(categoryName, productName, variantName, folderType)
      : buildProductMediaFolder(categoryName, productName, folderType);

    const { uploadImage } = await import('../services/cloudinary.service');
    const result = await uploadImage(req.file.buffer, folder, req.file.originalname);

    sendSuccess(
      res,
      'Image uploaded',
      { url: result.url, publicId: result.publicId, folder: result.folder },
      201,
    );
  });

  listOrders = asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const search = req.query.search as string | undefined;
    const status = req.query.status as OrderStatus | undefined;

    const data = await adminService.listOrders({ page, limit, search, status });
    sendSuccess(res, 'Orders retrieved', data);
  });

  updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
    const order = await adminService.updateOrderStatus(
      paramId(req),
      req.body as UpdateOrderStatusInput,
    );
    sendSuccess(res, 'Order status updated', { order });
  });

  listCustomers = asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const search = req.query.search as string | undefined;

    const data = await adminService.listCustomers({ page, limit, search });
    sendSuccess(res, 'Customers retrieved', data);
  });

  setCustomerStatus = asyncHandler(async (req: Request, res: Response) => {
    const { isActive } = req.body as UpdateUserStatusInput;
    await adminService.setUserActive(paramId(req), isActive);
    sendSuccess(res, 'Customer status updated', null);
  });

  listCategories = asyncHandler(async (_req: Request, res: Response) => {
    const categories = await adminService.listCategories();
    sendSuccess(res, 'Categories retrieved', { categories });
  });

  createCategory = asyncHandler(async (req: Request, res: Response) => {
    const category = await adminService.createCategory(req.body as CreateCategoryInput);
    sendSuccess(res, 'Category created', { category }, 201);
  });

  updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const category = await adminService.updateCategory(paramId(req), req.body as UpdateCategoryInput);
    sendSuccess(res, 'Category updated', { category });
  });

  deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    await adminService.deleteCategory(paramId(req));
    sendSuccess(res, 'Category deleted', null);
  });
}

export class UserController {
  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const user = await adminService.updateProfile(req.user!.id, req.body as UpdateProfileInput);
    sendSuccess(res, 'Profile updated', { user: toSafeUser(user) });
  });

  getMyOrders = asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const data = await adminService.getUserOrders(req.user!.id, page, limit);
    sendSuccess(res, 'Orders retrieved', data);
  });

  listAddresses = asyncHandler(async (req: Request, res: Response) => {
    const addresses = await addressService.list(req.user!.id);
    sendSuccess(res, 'Addresses retrieved', { addresses });
  });

  createAddress = asyncHandler(async (req: Request, res: Response) => {
    const address = await addressService.create(req.user!.id, req.body as AddressInput);
    sendSuccess(res, 'Address created', { address }, 201);
  });

  updateAddress = asyncHandler(async (req: Request, res: Response) => {
    const address = await addressService.update(
      req.user!.id,
      paramId(req),
      req.body as UpdateAddressInput,
    );
    sendSuccess(res, 'Address updated', { address });
  });

  setDefaultAddress = asyncHandler(async (req: Request, res: Response) => {
    const address = await addressService.setDefault(req.user!.id, paramId(req));
    sendSuccess(res, 'Default address updated', { address });
  });

  deleteAddress = asyncHandler(async (req: Request, res: Response) => {
    const result = await addressService.remove(req.user!.id, paramId(req));
    sendSuccess(res, 'Address deleted', result);
  });
}

export class ProductController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 24);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const categoriesRaw = req.query.categories as string | undefined;
    const categories = categoriesRaw
      ? categoriesRaw.split(',').map((value) => value.trim()).filter(Boolean)
      : undefined;
    const featured = req.query.featured === 'true';
    const inStockOnly = req.query.inStock === 'true';
    const priceMin = req.query.priceMin ? Number(req.query.priceMin) : undefined;
    const priceMax = req.query.priceMax ? Number(req.query.priceMax) : undefined;
    const sort = req.query.sort as
      | 'featured'
      | 'newest'
      | 'price-asc'
      | 'price-desc'
      | 'name-asc'
      | undefined;

    const data = await productService.listPublic({
      page,
      limit,
      search,
      category,
      categories,
      featured,
      inStockOnly,
      priceMin,
      priceMax,
      sort,
    });
    sendSuccess(res, 'Products retrieved', data);
  });

  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getBySlug(
      Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug,
    );
    sendSuccess(res, 'Product retrieved', { product });
  });
}

export const adminController = new AdminController();
export const userController = new UserController();
export const productController = new ProductController();
