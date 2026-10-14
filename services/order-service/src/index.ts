import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { getOrderDb } from './db/client.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(`Order Service listening on port ${config.PORT} in ${config.NODE_ENV} mode.`);
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}. Gracefully stopping Order Service...`);

  server.close(async () => {
    logger.info('HTTP server closed, draining active connections.');
    try {
      const db = await getOrderDb();
      await db.close();
      logger.info('Order database pool closed successfully.');
      process.exit(0);
    } catch (err: any) {
      logger.error('Error closing database pool during shutdown', { error: err.message });
      process.exit(1);
    }
  });

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
