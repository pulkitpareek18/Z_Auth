import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializeDatabase } from "./db/init.js";
import { closePool } from "./db/pool.js";
import { startAnchorScheduler } from "./services/anchorService.js";
import { initializeCache, closeCache } from "./services/cacheService.js";
import { initializeKeyService } from "./services/keyService.js";

async function bootstrap(): Promise<void> {
  await initializeCache();
  await initializeDatabase();
  await initializeKeyService();
  startAnchorScheduler();

  const app = createApp();

  const server = app.listen(config.corePort, config.coreHost, () => {
    console.log(`zauth-core listening on ${config.coreHost}:${config.corePort}`);
  });

  const shutdown = async () => {
    console.log("Shutting down...");
    server.close(async () => {
      await closeCache();
      await closePool();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((error) => {
  console.error("Failed to start zauth-core", error);
  process.exit(1);
});
