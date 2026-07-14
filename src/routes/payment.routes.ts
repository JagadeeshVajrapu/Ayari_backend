import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createPaymentOrderSchema,
  verifyRazorpayPaymentSchema,
} from '../validators/payment.validator';

const router = Router();

router.use(authenticate);

router.get('/orders/:orderId', paymentController.getOrder);

router.post(
  '/razorpay/create-order',
  validate(createPaymentOrderSchema),
  paymentController.createRazorpayOrder,
);

router.post(
  '/razorpay/verify',
  validate(verifyRazorpayPaymentSchema),
  paymentController.verifyRazorpayPayment,
);

router.post(
  '/cod/place-order',
  validate(createPaymentOrderSchema),
  paymentController.placeCodOrder,
);

export default router;
