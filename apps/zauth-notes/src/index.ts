import { bootstrap } from "./server.js";

bootstrap().catch((error) => {
  console.error("Failed to start zauth-notes", error);
  process.exit(1);
});
