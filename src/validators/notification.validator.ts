import { z } from 'zod';
import { NotificationCategory } from '@prisma/client';

export const notificationPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().optional(),
  category: z.nativeEnum(NotificationCategory).optional(),
  unreadOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

export const broadcastNotificationSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  message: z.string().min(1).max(2000).trim(),
  actionUrl: z.string().url().optional(),
  userIds: z.array(z.string()).optional(),
});

export type NotificationPaginationInput = z.infer<typeof notificationPaginationSchema>;
export type BroadcastNotificationInput = z.infer<typeof broadcastNotificationSchema>;
