import { Request, Response } from 'express';
import { trackingService } from '../services/tracking.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { sendSuccess } from '../utils/apiResponse.util';
import type { TrackingHistoryPaginationInput } from '../validators/tracking.validator';

function paramId(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

export class TrackingController {
  getOrderTracking = asyncHandler(async (req: Request, res: Response) => {
    const tracking = await trackingService.getOrderTracking(
      paramId(req, 'orderId'),
      req.user!.id,
      req.user!.role,
    );
    sendSuccess(res, 'Order tracking retrieved', { tracking });
  });

  getShipmentHistory = asyncHandler(async (req: Request, res: Response) => {
    const data = await trackingService.getShipmentHistory(
      paramId(req, 'shipmentId'),
      req.user!.id,
      req.user!.role,
      req.query as unknown as TrackingHistoryPaginationInput,
    );
    sendSuccess(res, 'Shipment history retrieved', data);
  });

  getOrderStatusHistory = asyncHandler(async (req: Request, res: Response) => {
    const data = await trackingService.getOrderStatusHistory(
      paramId(req, 'orderId'),
      req.user!.id,
      req.user!.role,
      req.query as unknown as TrackingHistoryPaginationInput,
    );
    sendSuccess(res, 'Order status history retrieved', data);
  });
}

export const trackingController = new TrackingController();
