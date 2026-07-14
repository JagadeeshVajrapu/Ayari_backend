import type { Server } from 'socket.io';

let io: Server | null = null;

export class SocketService {
  init(server: Server) {
    io = server;
  }

  getIO(): Server {
    if (!io) throw new Error('Socket.IO not initialized');
    return io;
  }

  isReady(): boolean {
    return io !== null;
  }

  emitToOrder(orderNumber: string, event: string, payload: unknown) {
    if (!io) return;
    io.to(`order_${orderNumber}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    if (!io) return;
    io.to(`user_${userId}`).emit(event, payload);
  }
}

export const socketService = new SocketService();
