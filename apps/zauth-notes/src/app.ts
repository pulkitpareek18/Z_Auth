import cookieParser from "cookie-parser";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { notesRouter } from "./routes/notes.js";
import { sessionRouter } from "./routes/session.js";
import { createSpaRouter } from "./routes/spa.js";
import { sendApiError } from "./utils/http.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(healthRouter);
  app.use(authRouter);
  app.use(sessionRouter);
  app.use(notesRouter);
  app.use(createSpaRouter());

  app.use((req, res) => {
    if (req.path.startsWith("/api")) {
      sendApiError(res, 404, "not_found", "API route not found.");
      return;
    }
    res.status(404).type("text/plain").send("Not found");
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("zauth-notes error", err);
    sendApiError(res, 500, "internal_server_error", "Unexpected server error.");
  });

  return app;
}
