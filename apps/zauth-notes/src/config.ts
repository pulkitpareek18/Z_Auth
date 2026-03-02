import dotenv from "dotenv";

dotenv.config();

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

type NotesConfig = {
  notesPort: number;
  notesHost: string;
  authIssuer: string;
  authIssuerInternal: string;
  notesClientId: string;
  notesBaseUrl: string;
  notesRedirectUri: string;
  notesAppOrigin: string;
  notesRequiredAcr: string;
  sessionCookieSecure: boolean;
  sessionTtlSeconds: number;
  csrfSecret: string;
  loginRateWindowMs: number;
  loginRateMax: number;
  callbackRateWindowMs: number;
  callbackRateMax: number;
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    max: number;
  };
};

export const config: NotesConfig = {
  notesPort: Number(process.env.NOTES_PORT ?? 3002),
  notesHost: process.env.NOTES_HOST ?? "0.0.0.0",
  authIssuer: stripTrailingSlash(process.env.AUTH_ISSUER ?? "http://localhost:3000"),
  authIssuerInternal: stripTrailingSlash(process.env.AUTH_ISSUER_INTERNAL ?? process.env.AUTH_ISSUER ?? "http://localhost:3000"),
  notesClientId: process.env.NOTES_CLIENT_ID ?? "notes-web-client",
  notesBaseUrl: stripTrailingSlash(process.env.NOTES_BASE_URL ?? "http://localhost:3002"),
  notesRedirectUri: process.env.NOTES_REDIRECT_URI ?? "http://localhost:3002/callback",
  notesAppOrigin: stripTrailingSlash(process.env.NOTES_APP_ORIGIN ?? process.env.NOTES_BASE_URL ?? "http://localhost:3002"),
  notesRequiredAcr: process.env.NOTES_REQUIRED_ACR ?? "urn:zauth:aal1",
  sessionCookieSecure: process.env.SESSION_COOKIE_SECURE === "true",
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 12),
  csrfSecret: process.env.NOTES_CSRF_SECRET ?? process.env.TENANT_SALT ?? "notes-dev-csrf-secret",
  loginRateWindowMs: Number(process.env.NOTES_LOGIN_RATE_WINDOW_MS ?? 60_000),
  loginRateMax: Number(process.env.NOTES_LOGIN_RATE_MAX ?? 20),
  callbackRateWindowMs: Number(process.env.NOTES_CALLBACK_RATE_WINDOW_MS ?? 60_000),
  callbackRateMax: Number(process.env.NOTES_CALLBACK_RATE_MAX ?? 40),
  postgres: {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "zauth",
    password: process.env.POSTGRES_PASSWORD ?? "zauth",
    database: process.env.POSTGRES_DB ?? "zauth",
    max: Number(process.env.NOTES_DB_POOL_MAX ?? 10)
  }
};
