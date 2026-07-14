import { Router } from 'express';
import { categoryRepository } from '../repositories/category.repository';
import { asyncHandler } from '../utils/asyncHandler.util';
import { sendSuccess } from '../utils/apiResponse.util';
import { serializeCategory } from '../utils/serialize.util';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await categoryRepository.findMany();
    sendSuccess(res, 'Categories retrieved', {
      categories: categories.filter((category) => category.isActive).map(serializeCategory),
    });
  }),
);

export default router;
