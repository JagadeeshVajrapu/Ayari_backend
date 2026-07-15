import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import paymentRoutes from './routes/payment.routes';
import { paymentController } from './controllers/payment.controller';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { UPLOAD_ROOT } from './middlewares/upload.middleware';
import { isOriginAllowed } from './utils/cors.util';

const app = express();

// Required behind Hostinger / nginx reverse proxies
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);

app.post(
  '/api/v1/payments/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.razorpayWebhook,
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api/v1/payments', paymentRoutes);

app.use('/uploads', express.static(UPLOAD_ROOT));

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
