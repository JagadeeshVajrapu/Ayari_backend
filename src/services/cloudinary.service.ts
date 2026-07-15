import fs from 'fs/promises';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { env, getCloudinaryCloudName, isCloudinaryEnvConfigured } from '../config/env';
import { UPLOAD_ROOT } from '../middlewares/upload.middleware';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!isCloudinaryEnvConfigured()) {
    const rawName = env.CLOUDINARY_CLOUD_NAME?.trim();
    if (rawName && /\s/.test(rawName)) {
      throw new Error(
        `Invalid CLOUDINARY_CLOUD_NAME "${rawName}". Use the Cloud name from Cloudinary dashboard (e.g. zf3w0zec), not the API key name "Ayari Creations".`,
      );
    }
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    );
  }
  const cloudName = getCloudinaryCloudName();
  if (!cloudName) {
    throw new Error('Invalid CLOUDINARY_CLOUD_NAME. Use your Cloudinary cloud name (e.g. zf3w0zec).');
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: env.CLOUDINARY_API_KEY!,
    api_secret: env.CLOUDINARY_API_SECRET!,
    secure: true,
  });
  configured = true;
}

function formatCloudinaryError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Invalid cloud_name') || message.includes('cloud_name')) {
    return new Error(
      `Cloudinary rejected the cloud name. Set CLOUDINARY_CLOUD_NAME to your dashboard cloud name (e.g. zf3w0zec), not the API key label "Ayari Creations".`,
    );
  }
  if (message.includes('Invalid API Key') || message.includes('401')) {
    return new Error('Cloudinary API key or secret is invalid. Check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  }
  return error instanceof Error ? error : new Error(message);
}

function sanitizePublicId(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return (
    base
      .trim()
      .replace(/[^\w.-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100) || `img-${Date.now()}`
  );
}

function extensionFromFilename(filename?: string): string {
  const ext = filename?.includes('.') ? filename.split('.').pop()?.toLowerCase() : undefined;
  if (ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
}

/**
 * Local disk fallback for development when Cloudinary credentials are missing.
 * Files are served via express.static at /uploads/*
 */
async function uploadLocalImage(
  buffer: Buffer,
  folder: string,
  filename?: string,
): Promise<{ url: string; publicId: string; folder: string }> {
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
  const safeName = `${sanitizePublicId(filename ?? `img-${Date.now()}`)}-${Date.now()}.${extensionFromFilename(filename)}`;
  const absoluteDir = path.join(UPLOAD_ROOT, ...normalizedFolder.split('/'));
  const absolutePath = path.join(absoluteDir, safeName);

  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  const relativePath = path.posix.join(normalizedFolder, safeName);
  return {
    url: `/uploads/${relativePath}`,
    publicId: `local:${relativePath}`,
    folder: normalizedFolder,
  };
}

async function deleteLocalImage(publicId: string): Promise<void> {
  const relative = publicId.replace(/^local:/, '');
  const absolutePath = path.join(UPLOAD_ROOT, ...relative.split('/'));
  try {
    await fs.unlink(absolutePath);
  } catch {
    // Ignore missing files
  }
}

async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  filename?: string,
): Promise<{ url: string; publicId: string; folder: string }> {
  ensureConfigured();
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: normalizedFolder,
        resource_type: 'image',
        public_id: filename ? sanitizePublicId(filename) : undefined,
        overwrite: false,
        unique_filename: true,
        quality: 'auto:good',
      },
      (error, result) => {
        if (error || !result) {
          reject(formatCloudinaryError(error ?? new Error('Cloudinary upload failed')));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          folder: normalizedFolder,
        });
      },
    );
    uploadStream.end(buffer);
  });
}

export async function uploadImage(
  buffer: Buffer,
  folder: string,
  filename?: string,
): Promise<{ url: string; publicId: string; folder: string }> {
  if (isCloudinaryConfigured()) {
    return uploadToCloudinary(buffer, folder, filename);
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Cloudinary is required in production. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    );
  }

  // Local development fallback when Cloudinary credentials are missing
  return uploadLocalImage(buffer, folder, filename);
}

export async function deleteImage(publicId: string): Promise<void> {
  if (!publicId) return;

  if (publicId.startsWith('local:')) {
    await deleteLocalImage(publicId);
    return;
  }

  if (!isCloudinaryConfigured()) return;

  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

export async function deleteImages(publicIds: string[]): Promise<void> {
  const ids = publicIds.filter(Boolean);
  if (!ids.length) return;
  await Promise.allSettled(ids.map((id) => deleteImage(id)));
}

export function isCloudinaryConfigured(): boolean {
  return isCloudinaryEnvConfigured();
}
