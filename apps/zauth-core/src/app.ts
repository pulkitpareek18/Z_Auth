import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { config } from "./config.js";
import { requestContext } from "./middleware/requestContext.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { logger } from "./utils/logger.js";
import { adminRouter } from "./routes/admin.js";
import { healthRouter } from "./routes/health.js";
import { oidcRouter } from "./routes/oidc.js";
import { passkeyRouter } from "./routes/passkey.js";
import { pramaanRouter } from "./routes/pramaan.js";
import { uiRouter } from "./routes/ui.js";

export function createApp(): express.Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "https://cdn.jsdelivr.net"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
          mediaSrc: ["'self'", "blob:"],
          workerSrc: ["'self'", "blob:"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"]
        }
      }
    })
  );

  app.use(
    cors({
      origin: [config.uiBaseUrl, config.issuer, config.apiBaseUrl],
      credentials: true
    })
  );

  app.use(requestContext);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  const assetsDir = path.join(process.cwd(), "assets");
  app.use("/ui/assets", express.static(assetsDir, { maxAge: "7d", immutable: true }));

  const zkDir = path.join(process.cwd(), "zk");
  app.use("/zk", express.static(zkDir, {
    maxAge: "7d",
    immutable: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".wasm")) {
        res.setHeader("content-type", "application/wasm");
      }
      if (filePath.endsWith(".zkey")) {
        res.setHeader("content-type", "application/octet-stream");
      }
    }
  }));

  app.use(healthRouter);
  app.use(oidcRouter);
  app.use(passkeyRouter);
  app.use(pramaanRouter);
  app.use(adminRouter);
  app.use(uiRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Unhandled error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal_server_error" });
  });

  return app;
}
