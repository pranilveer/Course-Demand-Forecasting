import 'dotenv/config';
import { createApp, resolveStaticDir } from './api/app.js';
import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';

async function main(): Promise<void> {
  await connectDb(config.mongoUri, config.mongoDb);
  const app = createApp({
    reportsDir: process.env.REPORTS_DIR ?? undefined,
    staticDir: resolveStaticDir(),
    clientOrigin: config.clientOrigin,
  });

  const server = app.listen(config.port, () => {
    console.log(
      `[server] listening on http://localhost:${config.port} db=${config.mongoDb}`,
    );
  });

  const shutdown = (signal: string): void => {
    console.log(`[server] received ${signal}; shutting down`);
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error('[server] failed to start:', error);
  process.exitCode = 1;
});
