import http from 'http';
import 'dotenv/config';
import app from './app';
import { env, getCloudinaryCloudName, isCloudinaryEnvConfigured } from './config/env';
import { connectDatabase, disconnectDatabase } from './database/prisma';
import { initSocketGateway } from './socket';
import { notificationService } from './services/notification.service';

function bootstrap(): void {
  // Hostinger Node.js hosting requires listen() within ~3 seconds.
  // Do not await database connection before opening the HTTP server.
  const httpServer = http.createServer(app);
  initSocketGateway(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(`Socket.IO ready for real-time shipment tracking`);
    if (isCloudinaryEnvConfigured()) {
      console.log(`Cloudinary ready (cloud: ${getCloudinaryCloudName()})`);
    } else {
      const raw = env.CLOUDINARY_CLOUD_NAME?.trim();
      if (raw && /\s/.test(raw)) {
        console.warn(
          `Cloudinary disabled: CLOUDINARY_CLOUD_NAME="${raw}" is invalid. Use dashboard cloud name (e.g. zf3w0zec), not API key name.`,
        );
      } else {
        console.warn('Cloudinary not configured — uploads will use local /uploads folder');
      }
    }
  });

  connectDatabase()
    .then(() => {
      console.log('Database connected');
    })
    .catch((error) => {
      console.error('Database connection failed:', error);
      process.exit(1);
    });

  const emailQueueTimer = setInterval(() => {
    notificationService.processEmailQueue().catch((err) => {
      console.error('Email queue processing error:', err);
    });
  }, 30_000);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    clearInterval(emailQueueTimer);
    httpServer.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

try {
  bootstrap();
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
