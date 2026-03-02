import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { requestContext } from "./middleware/requestContext.js";
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
      contentSecurityPolicy: false
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

  app.use(healthRouter);
  app.use(oidcRouter);
  app.use(passkeyRouter);
  app.use(pramaanRouter);
  app.use(adminRouter);
  app.use(uiRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error", err);
    res.status(500).json({ error: "internal_server_error" });
  });

  return app;
}
