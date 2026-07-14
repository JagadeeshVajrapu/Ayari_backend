export { initSocketGateway } from './socket.gateway';
export { socketService } from './socket.service';
export { SOCKET_EVENTS, getOrderRoom, resolveShipmentEvent } from './socket.types';
export type {
  ShipmentRealtimePayload,
  TrackingHistoryPayload,
  NotificationRealtimePayload,
} from './socket.types';
