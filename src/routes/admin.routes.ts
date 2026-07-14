import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { adminController, productController, userController } from '../controllers/admin.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { productImageUpload } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCategorySchema,
  createProductSchema,
  updateCategorySchema,
  updateOrderStatusSchema,
  updateProductSchema,
  updateProfileSchema,
  updateUserStatusSchema,
} from '../validators/admin.validator';

const adminRouter = Router();
const adminOnly = [authenticate, authorize(UserRole.ADMIN)] as const;

adminRouter.get('/dashboard', ...adminOnly, adminController.dashboard);

adminRouter.get('/products', ...adminOnly, adminController.listProducts);
adminRouter.post('/products', ...adminOnly, validate(createProductSchema), adminController.createProduct);
adminRouter.patch(
  '/products/:id',
  ...adminOnly,
  validate(updateProductSchema),
  adminController.updateProduct,
);
adminRouter.delete('/products/:id', ...adminOnly, adminController.deleteProduct);

adminRouter.post(
  '/upload/product-image',
  ...adminOnly,
  productImageUpload.single('image'),
  adminController.uploadProductImage,
);

adminRouter.get('/orders', ...adminOnly, adminController.listOrders);
adminRouter.patch(
  '/orders/:id/status',
  ...adminOnly,
  validate(updateOrderStatusSchema),
  adminController.updateOrderStatus,
);

adminRouter.get('/customers', ...adminOnly, adminController.listCustomers);
adminRouter.patch(
  '/customers/:id/status',
  ...adminOnly,
  validate(updateUserStatusSchema),
  adminController.setCustomerStatus,
);

adminRouter.get('/categories', ...adminOnly, adminController.listCategories);
adminRouter.post('/categories', ...adminOnly, validate(createCategorySchema), adminController.createCategory);
adminRouter.patch(
  '/categories/:id',
  ...adminOnly,
  validate(updateCategorySchema),
  adminController.updateCategory,
);
adminRouter.delete('/categories/:id', ...adminOnly, adminController.deleteCategory);

export default adminRouter;

export const productRouter = Router();
productRouter.get('/', productController.list);
productRouter.get('/:slug', productController.getBySlug);

export const userRouter = Router();
userRouter.use(authenticate);
userRouter.patch('/me', validate(updateProfileSchema), userController.updateProfile);
userRouter.get('/me/orders', userController.getMyOrders);
