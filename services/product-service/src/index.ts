import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { getProductDb } from './db/client.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(`Product Service listening on port ${config.PORT} in ${config.NODE_ENV} mode.`);
});

// Graceful shutdown handling for SIGTERM and SIGINT
async function shutdown(signal: string) {
  logger.info(`Received ${signal}. Gracefully stopping Product Service...`);

  server.close(async () => {
    logger.info('HTTP server closed, draining active connections.');
    try {
      const db = await getProductDb();
      await db.close();
      logger.info('Database pool closed successfully.');
      process.exit(0);
    } catch (err: any) {
      logger.error('Error closing database pool during shutdown', { error: err.message });
      process.exit(1);
    }
  });

  // Force close after 10 seconds timeout
  setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection', { reason: reason?.message || String(reason) });
});
