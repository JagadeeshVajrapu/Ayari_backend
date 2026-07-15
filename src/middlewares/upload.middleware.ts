import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import multer from 'multer';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

function ensureUploadDirs() {
  fs.mkdirSync(path.join(UPLOAD_ROOT, 'products'), { recursive: true });
}

ensureUploadDirs();

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error('Only JPG, JPEG, PNG, and WebP images are allowed'));
    return;
  }
  cb(null, true);
}

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export { UPLOAD_ROOT };
