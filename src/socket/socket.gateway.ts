import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { UserRole } from '@prisma/client';
import { trackingRepository } from '../repositories/tracking.repository';
import { authenticateSocket, type AuthenticatedSocket } from './socket.auth';
import { connectionManager } from './connection.manager';
import { socketService } from './socket.service';
import { SOCKET_EVENTS } from './socket.types';
import { isOriginAllowed } from '../utils/cors.util';

export function initSocketGateway(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    transports: ['websocket', 'polling'],
    perMessageDeflate: true,
  });

  io.use(authenticateSocket);

  io.on('connection', (socket: AuthenticatedSocket) => {
    connectionManager.register(socket);

    const { user } = socket.data;
    socket.join(`user_${user.id}`);

    socket.emit(SOCKET_EVENTS.CONNECTION_ACK, {
      userId: user.id,
      connectedAt: new Date().toISOString(),
    });

    socket.on(SOCKET_EVENTS.SUBSCRIBE_ORDER, async (payload: { orderId?: string }) => {
      try {
        if (!payload?.orderId) {
          socket.emit(SOCKET_EVENTS.SUBSCRIBE_ERROR, { message: 'orderId is required' });
          return;
        }

        await trackingRepository.assertOrderAccess(
          payload.orderId,
          user.id,
          user.role as UserRole,
        );

        const order = await trackingRepository.findOrderForTracking(payload.orderId);
        if (!order) {
          socket.emit(SOCKET_EVENTS.SUBSCRIBE_ERROR, { message: 'Order not found' });
          return;
        }

        const room = `order_${order.orderNumber}`;
        await socket.join(room);
        connectionManager.trackOrderRoom(socket.id, room);

        socket.emit(SOCKET_EVENTS.SUBSCRIBE_ACK, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          room,
        });
      } catch {
        socket.emit(SOCKET_EVENTS.SUBSCRIBE_ERROR, { message: 'Unauthorized order access' });
      }
    });

    socket.on(SOCKET_EVENTS.UNSUBSCRIBE_ORDER, async (payload: { orderId?: string }) => {
      if (!payload?.orderId) return;

      const order = await trackingRepository.findOrderForTracking(payload.orderId);
      if (!order) return;

      const room = `order_${order.orderNumber}`;
      await socket.leave(room);
      connectionManager.untrackOrderRoom(socket.id, room);
    });

    socket.on('disconnect', () => {
      connectionManager.remove(socket);
    });
  });

  socketService.init(io);
  return io;
}
