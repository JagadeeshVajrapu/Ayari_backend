import http from 'http';
import 'dotenv/config';
import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './database/prisma';
import { initSocketGateway } from './socket';
import { notificationService } from './services/notification.service';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const httpServer = http.createServer(app);
  initSocketGateway(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(`Socket.IO ready for real-time shipment tracking`);
  });

  setInterval(() => {
    notificationService.processEmailQueue().catch((err) => {
      console.error('Email queue processing error:', err);
    });
  }, 30_000);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    httpServer.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
