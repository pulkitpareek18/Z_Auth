import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const meta: Record<string, unknown> = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      trace_id: req.traceId,
    };

    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.path} ${res.statusCode}`, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.path} ${res.statusCode}`, meta);
    } else {
      logger.info(`${req.method} ${req.path} ${res.statusCode}`, meta);
    }
  });

  next();
}
