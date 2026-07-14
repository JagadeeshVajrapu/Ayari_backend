import { Request, Response } from 'express';
import { shipmentService } from '../services/shipment.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { sendSuccess } from '../utils/apiResponse.util';
import type {
  AddShipmentNoteInput,
  AddShipmentTrackingEventInput,
  AdminActionInput,
  AssignCourierInput,
  CreateCourierPartnerInput,
  ShipmentPaginationInput,
  UpdateCourierPartnerInput,
  UpdateShipmentInput,
  UpdateShipmentStatusInput,
} from '../validators/shipment.validator';

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

function paramOrderId(req: Request): string {
  const id = req.params.orderId;
  return Array.isArray(id) ? id[0] : id;
}

export class ShipmentController {
  getDashboard = asyncHandler(async (_req: Request, res: Response) => {
    const stats = await shipmentService.getDashboardStats();
    sendSuccess(res, 'Shipment dashboard retrieved', { stats });
  });

  listShipments = asyncHandler(async (req: Request, res: Response) => {
    const data = await shipmentService.listShipments(req.query as unknown as ShipmentPaginationInput);
    sendSuccess(res, 'Shipments retrieved', data);
  });

  getShipment = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.getShipmentById(paramId(req));
    sendSuccess(res, 'Shipment retrieved', { shipment });
  });

  getAdminShipmentDetail = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.getAdminShipmentDetail(paramId(req));
    sendSuccess(res, 'Shipment detail retrieved', { shipment });
  });

  getShipmentByOrder = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.getShipmentByOrderId(paramOrderId(req));
    sendSuccess(res, 'Shipment retrieved', { shipment });
  });

  updateShipment = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.updateShipment(paramId(req), req.body as UpdateShipmentInput);
    sendSuccess(res, 'Shipment updated', { shipment });
  });

  updateShipmentStatus = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.updateShipmentStatus(
      paramId(req),
      req.body as UpdateShipmentStatusInput,
      req.user?.id,
    );
    sendSuccess(res, 'Shipment status updated', { shipment });
  });

  performAdminAction = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.performAdminAction(
      paramId(req),
      req.body as AdminActionInput,
      req.user?.id,
    );
    sendSuccess(res, 'Action completed', { shipment });
  });

  assignCourier = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.assignCourier(
      paramId(req),
      req.body as AssignCourierInput,
      req.user?.id,
    );
    sendSuccess(res, 'Courier assigned', { shipment });
  });

  generateTrackingNumber = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.generateTrackingNumber(paramId(req), req.user?.id);
    sendSuccess(res, 'Tracking number generated', { shipment });
  });

  addShipmentNote = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.addShipmentNote(
      paramId(req),
      req.body as AddShipmentNoteInput,
      req.user?.id,
    );
    sendSuccess(res, 'Note added', { shipment });
  });

  addTrackingEvent = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.addTrackingEvent(
      paramId(req),
      req.body as AddShipmentTrackingEventInput,
    );
    sendSuccess(res, 'Tracking event added', { shipment });
  });

  listCourierPartners = asyncHandler(async (req: Request, res: Response) => {
    const activeOnly = req.query.activeOnly === 'true';
    const partners = await shipmentService.listCourierPartners(activeOnly);
    sendSuccess(res, 'Courier partners retrieved', { partners });
  });

  createCourierPartner = asyncHandler(async (req: Request, res: Response) => {
    const partner = await shipmentService.createCourierPartner(req.body as CreateCourierPartnerInput);
    sendSuccess(res, 'Courier partner created', { partner }, 201);
  });

  updateCourierPartner = asyncHandler(async (req: Request, res: Response) => {
    const partner = await shipmentService.updateCourierPartner(
      paramId(req),
      req.body as UpdateCourierPartnerInput,
    );
    sendSuccess(res, 'Courier partner updated', { partner });
  });

  getMyOrderShipment = asyncHandler(async (req: Request, res: Response) => {
    const shipment = await shipmentService.getShipmentForCustomer(paramOrderId(req), req.user!.id);
    sendSuccess(res, 'Shipment retrieved', { shipment });
  });

  trackByShipmentNumber = asyncHandler(async (req: Request, res: Response) => {
    const shipmentNumber = Array.isArray(req.params.shipmentNumber)
      ? req.params.shipmentNumber[0]
      : req.params.shipmentNumber;
    const shipment = await shipmentService.trackByNumber(shipmentNumber);
    sendSuccess(res, 'Shipment tracking retrieved', { shipment });
  });

  trackByTrackingNumber = asyncHandler(async (req: Request, res: Response) => {
    const trackingNumber = Array.isArray(req.params.trackingNumber)
      ? req.params.trackingNumber[0]
      : req.params.trackingNumber;
    const shipment = await shipmentService.trackByTrackingNumber(trackingNumber);
    sendSuccess(res, 'Shipment tracking retrieved', { shipment });
  });
}

export const shipmentController = new ShipmentController();
