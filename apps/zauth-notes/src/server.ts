import { config } from "./config.js";
import { initializeDatabase } from "./db/init.js";
import { createApp } from "./app.js";

export async function bootstrap(): Promise<void> {
  await initializeDatabase();
  const app = createApp();

  app.listen(config.notesPort, config.notesHost, () => {
    console.log(`zauth-notes listening on ${config.notesHost}:${config.notesPort}`);
  });
}
