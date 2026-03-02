import type { NextFunction, Request, Response } from "express";
import { randomId } from "../utils/crypto.js";

declare global {
  namespace Express {
    interface Request {
      traceId: string;
    }
  }
}

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  req.traceId = req.header("x-trace-id") || randomId(12);
  next();
}
