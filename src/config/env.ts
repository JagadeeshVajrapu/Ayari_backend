import { z } from 'zod';

/** Treat blank env values as unset so optional URL/string fields do not fail validation. */
const optionalString = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().url().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('14d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('90d'),
  PASSWORD_RESET_EXPIRES_IN: z.string().default('1h'),
  OTP_EXPIRES_IN: z.string().default('10m'),
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),
  COOKIE_SECURE: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  /** When "true", skip live Razorpay API and use local mock checkout (useful on localhost). */
  RAZORPAY_MOCK: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  SMTP_USER: optionalString,
  SMTP_PASS: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().optional(),
    )
    .transform((val) => val?.replace(/\s/g, '')),
  SMTP_FROM: optionalString,
  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  SHIPROCKET_EMAIL: optionalString,
  SHIPROCKET_PASSWORD: optionalString,
  SHIPROCKET_TOKEN: optionalString,
  SHIPROCKET_API: optionalUrl,
  SHIPROCKET_WEBHOOK_SECRET: optionalString,
  SHIPROCKET_PICKUP_PINCODE: optionalString,
  SHIPROCKET_PICKUP_LOCATION: optionalString,
});

export function isCloudinaryEnvConfigured(): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return false;
  }
  // Cloud name is a short id (e.g. zf3w0zec) — NOT the API key display name
  if (/\s/.test(cloudName)) return false;
  return true;
}

export function getCloudinaryCloudName(): string | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName || /\s/.test(cloudName)) return null;
  return cloudName;
}

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Live Razorpay only when both keys exist and mock mode is off. */
export function isRazorpayConfigured(): boolean {
  if (env.RAZORPAY_MOCK) return false;
  const keyId = trimOptional(env.RAZORPAY_KEY_ID);
  const keySecret = trimOptional(env.RAZORPAY_KEY_SECRET);
  return Boolean(keyId && keySecret);
}

export function getRazorpayKeyId(): string | undefined {
  return trimOptional(env.RAZORPAY_KEY_ID);
}

export function getRazorpayKeySecret(): string | undefined {
  return trimOptional(env.RAZORPAY_KEY_SECRET);
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export function isShiprocketConfigured(): boolean {
  return Boolean(trimOptional(env.SHIPROCKET_EMAIL) && trimOptional(env.SHIPROCKET_PASSWORD));
}

export function getShiprocketApiBase(): string {
  return trimOptional(env.SHIPROCKET_API) ?? 'https://apiv2.shiprocket.in/v1/external';
}
