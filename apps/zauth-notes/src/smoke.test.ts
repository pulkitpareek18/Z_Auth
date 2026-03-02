import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("zauth-notes smoke", () => {
  const app = createApp();

  it("serves live health endpoint", async () => {
    const response = await request(app).get("/health/live");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "zauth-notes" });
  });

  it("returns unauthenticated session payload", async () => {
    const response = await request(app).get("/api/session");
    expect(response.status).toBe(401);
    expect(response.body.authenticated).toBe(false);
    expect(response.body.login_url).toBe("/login");
  });

  it("renders callback transition shell", async () => {
    const response = await request(app).get("/callback");
    expect(response.status).toBe(200);
    expect(response.type).toContain("text/html");
    expect(response.text).toContain("Finishing secure sign-in...");
    expect(response.text).toContain("/api/auth/callback/complete");
  });

  it("forces fresh login at IdP on every app login", async () => {
    const response = await request(app).get("/login");
    expect(response.status).toBe(302);
    const location = String(response.headers.location ?? "");
    expect(location).toContain("/oauth2/authorize");
    expect(location).toContain("prompt=login");
  });
});
