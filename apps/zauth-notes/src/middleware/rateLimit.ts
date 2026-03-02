import type { NextFunction, Request, Response } from "express";
import { sendApiError } from "../utils/http.js";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const key = `${options.keyPrefix}:${ip}`;

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("retry-after", String(retryAfterSeconds));
      sendApiError(res, 429, "rate_limited", "Too many requests. Try again shortly.");
      return;
    }

    existing.count += 1;
    next();
  };
}
