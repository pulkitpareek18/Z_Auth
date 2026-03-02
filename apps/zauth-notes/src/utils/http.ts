import type { Response } from "express";

type ApiErrorShape = {
  error: string;
  message?: string;
  details?: unknown;
};

export function sendApiError(
  res: Response,
  status: number,
  error: string,
  message?: string,
  details?: unknown
): Response<ApiErrorShape> {
  return res.status(status).json({
    error,
    ...(message ? { message } : {}),
    ...(details !== undefined ? { details } : {})
  });
}
