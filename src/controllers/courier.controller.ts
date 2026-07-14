import { Request, Response } from 'express';
import { shipmentService } from '../services/shipment.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { sendSuccess } from '../utils/apiResponse.util';
import type { CreateCourierPartnerInput, UpdateCourierPartnerInput } from '../validators/shipment.validator';

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

export class CourierController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const activeOnly = req.query.activeOnly === 'true';
    const couriers = await shipmentService.listCourierPartners(activeOnly);
    sendSuccess(res, 'Couriers retrieved', { couriers });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const courier = await shipmentService.createCourierPartner(req.body as CreateCourierPartnerInput);
    sendSuccess(res, 'Courier created', { courier }, 201);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const courier = await shipmentService.updateCourierPartner(
      paramId(req),
      req.body as UpdateCourierPartnerInput,
    );
    sendSuccess(res, 'Courier updated', { courier });
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const courier = await shipmentService.deleteCourierPartner(paramId(req));
    sendSuccess(res, 'Courier deactivated', { courier });
  });
}

export const courierController = new CourierController();
