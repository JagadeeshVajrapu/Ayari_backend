import { z } from 'zod';

export const trackingHistoryPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type TrackingHistoryPaginationInput = z.infer<typeof trackingHistoryPaginationSchema>;
