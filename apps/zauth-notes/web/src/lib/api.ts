import type { ApiError } from "../types";

export class ApiRequestError extends Error {
  status: number;
  error: string;
  details?: unknown;

  constructor(status: number, payload: ApiError | null, fallbackMessage: string) {
    super(payload?.message || fallbackMessage);
    this.name = "ApiRequestError";
    this.status = status;
    this.error = payload?.error || "request_failed";
    this.details = payload?.details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  csrfToken?: string;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.csrfToken ? { "x-csrf-token": options.csrfToken } : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const hasJson = contentType.includes("application/json");
  const payload = hasJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      (payload as ApiError | null) ?? null,
      `Request failed with status ${response.status}`
    );
  }

  return payload as T;
}
