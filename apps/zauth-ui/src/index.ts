import cookieParser from "cookie-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const uiPort = Number(process.env.UI_PORT ?? 3001);
const authIssuer = process.env.AUTH_ISSUER ?? "http://localhost:3000";
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
const demoClientId = process.env.DEMO_CLIENT_ID ?? "demo-web-client";
const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE === "true";

function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function getHost(req: express.Request): string {
  const hostHeader = req.headers.host ?? "localhost";
  return hostHeader.toLowerCase();
}

function isDemoHost(host: string): boolean {
  return host.startsWith("demo.") || host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function isConsoleHost(host: string): boolean {
  return host.startsWith("console.");
}

function isStatusHost(host: string): boolean {
  return host.startsWith("status.");
}

function resolveDemoRedirectUri(req: express.Request): string {
  const host = getHost(req);
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return "http://localhost:3001/callback";
  }
  return "https://demo.geturstyle.shop/callback";
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
:root {
  --bg: linear-gradient(160deg, #e8f3ff 0%, #fff9ef 42%, #ecfff5 100%);
  --panel: #ffffff;
  --ink: #12222b;
  --muted: #50616a;
  --brand: #015f8b;
  --brand-2: #006f52;
  --border: #d6e4eb;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: "Satoshi", "Avenir Next", "Segoe UI", sans-serif;
}
main {
  max-width: 980px;
  margin: 2rem auto;
  padding: 1.25rem;
}
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1rem 1.1rem;
  box-shadow: 0 8px 26px rgba(17, 36, 49, 0.08);
}
h1 { margin: 0 0 0.75rem; font-size: 1.6rem; }
h2 { margin: 0 0 0.7rem; font-size: 1.1rem; }
p { color: var(--muted); }
a.button, button {
  display: inline-block;
  border: 0;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  text-decoration: none;
  padding: 0.7rem 1rem;
  font-weight: 700;
  cursor: pointer;
}
button.secondary { background: var(--brand-2); }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
input, textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #c4d5df;
  padding: 0.65rem;
  margin-bottom: 0.6rem;
  font-size: 0.95rem;
}
pre {
  background: #0c1520;
  color: #cfe8d9;
  border-radius: 12px;
  padding: 0.8rem;
  overflow: auto;
}
small { color: var(--muted); }
</style>
</head>
<body>
<main>${body}</main>
</body>
</html>`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.json();
}

app.get("/health/live", (_req, res) => {
  res.json({ status: "ok", service: "zauth-ui" });
});

app.get("/favicon.ico", (_req, res) => res.status(204).send());

app.get("/start-login", (req, res) => {
  const verifier = randomToken(32);
  const challenge = sha256Base64Url(verifier);
  const state = randomToken(18);
  const redirectUri = resolveDemoRedirectUri(req);

  res.cookie("demo_pkce_verifier", verifier, {
    httpOnly: true,
    secure: sessionCookieSecure,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/"
  });

  res.cookie("demo_oauth_state", state, {
    httpOnly: true,
    secure: sessionCookieSecure,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/"
  });

  const authorizeUrl = new URL(`${authIssuer}/oauth2/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", demoClientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "openid profile zauth.identity");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "login");

  res.redirect(authorizeUrl.toString());
});

app.get("/callback", async (req, res) => {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  const error = req.query.error ? String(req.query.error) : null;

  if (error) {
    res.status(400).send(
      page(
        "OAuth Error",
        `<div class="card"><h1>Authorization Failed</h1><p>Error: <code>${error}</code></p><a class="button" href="/">Back</a></div>`
      )
    );
    return;
  }

  const expectedState = req.cookies.demo_oauth_state as string | undefined;
  const verifier = req.cookies.demo_pkce_verifier as string | undefined;

  if (!code || !expectedState || !verifier || state !== expectedState) {
    res.status(400).send(
      page(
        "Invalid Callback",
        `<div class="card"><h1>Callback Validation Failed</h1><p>Missing code/state or PKCE verifier.</p><a class="button" href="/">Retry</a></div>`
      )
    );
    return;
  }

  try {
    const redirectUri = resolveDemoRedirectUri(req);
    const tokenResponse = await fetch(`${authIssuer}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: demoClientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier
      })
    });

    const tokenJson = (await tokenResponse.json()) as {
      access_token?: string;
      id_token?: string;
      error?: string;
      [key: string]: unknown;
    };

    if (!tokenResponse.ok || !tokenJson.access_token) {
      res.status(400).send(
        page(
          "Token Exchange Failed",
          `<div class="card"><h1>Token Exchange Failed</h1><pre>${JSON.stringify(tokenJson, null, 2)}</pre><a class="button" href="/">Retry</a></div>`
        )
      );
      return;
    }

    const userInfoResponse = await fetch(`${authIssuer}/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${tokenJson.access_token}` }
    });
    const userInfoJson = (await userInfoResponse.json()) as Record<string, unknown>;

    res.clearCookie("demo_oauth_state", { path: "/" });
    res.clearCookie("demo_pkce_verifier", { path: "/" });

    res.status(200).send(
      page(
        "Z_Auth Demo Success",
        `<div class="card">
          <h1>Login Complete</h1>
          <p>OAuth Code + PKCE completed successfully.</p>
          <h2>Token Response</h2>
          <pre>${JSON.stringify(tokenJson, null, 2)}</pre>
          <h2>User Info</h2>
          <pre>${JSON.stringify(userInfoJson, null, 2)}</pre>
          <a class="button" href="/">Run Again</a>
        </div>`
      )
    );
  } catch (error) {
    res.status(500).send(
      page(
        "Callback Error",
        `<div class="card"><h1>Unexpected Error</h1><pre>${(error as Error).message}</pre><a class="button" href="/">Retry</a></div>`
      )
    );
  }
});

app.get("/status-json", async (_req, res) => {
  const [coreLive, coreReady] = await Promise.allSettled([
    fetchJson(`${apiBaseUrl}/health/live`),
    fetchJson(`${apiBaseUrl}/health/ready`)
  ]);

  res.json({
    ui: { status: "ok" },
    core_live: coreLive.status === "fulfilled" ? coreLive.value : { status: "error" },
    core_ready: coreReady.status === "fulfilled" ? coreReady.value : { status: "error" }
  });
});

app.get("/", (req, res) => {
  const host = getHost(req);

  if (isStatusHost(host)) {
    res.type("html").send(
      page(
        "Z_Auth Status",
        `<div class="card"><h1>Status</h1><p>Live status view for demo operations.</p><pre id="out">Loading...</pre></div>
        <script>
          fetch('/status-json').then((r) => r.json()).then((d) => {
            document.getElementById('out').textContent = JSON.stringify(d, null, 2);
          }).catch((e) => {
            document.getElementById('out').textContent = e.message;
          });
        </script>`
      )
    );
    return;
  }

  if (isConsoleHost(host)) {
    res.type("html").send(
      page(
        "Z_Auth Console",
        `<div class="grid">
          <div class="card">
            <h1>Admin Console</h1>
            <p>Create OAuth clients and policies, then inspect audit logs.</p>
            <h2>Create OAuth Client</h2>
            <input id="client_id" placeholder="my-app-client" />
            <textarea id="redirect_uris" rows="3" placeholder="https://myapp.com/callback\nhttp://localhost:3000/callback"></textarea>
            <button id="create_client">Create Client</button>
            <h2>Create Policy</h2>
            <input id="policy_name" placeholder="default-risk-policy" />
            <textarea id="policy_config" rows="5" placeholder='{"mfa_required":false,"max_failed_attempts":5}'></textarea>
            <button class="secondary" id="create_policy">Create Policy</button>
          </div>
          <div class="card">
            <h2>Audit Events</h2>
            <button id="load_audit">Refresh Audit Events</button>
            <pre id="audit_out">{}</pre>
          </div>
        </div>
        <script>
          const apiBase = ${JSON.stringify(apiBaseUrl)};

          const parseLines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean);

          document.getElementById('create_client').onclick = async () => {
            const payload = {
              client_id: document.getElementById('client_id').value.trim(),
              redirect_uris: parseLines(document.getElementById('redirect_uris').value),
              scopes: ['openid', 'profile', 'zauth.identity'],
              grant_types: ['authorization_code']
            };
            const resp = await fetch(apiBase + '/admin/v1/clients', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await resp.json();
            alert(resp.ok ? 'Client created' : 'Error: ' + JSON.stringify(data));
          };

          document.getElementById('create_policy').onclick = async () => {
            const payload = {
              tenant_id: 'default',
              name: document.getElementById('policy_name').value.trim(),
              config: JSON.parse(document.getElementById('policy_config').value || '{}')
            };
            const resp = await fetch(apiBase + '/admin/v1/policies', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await resp.json();
            alert(resp.ok ? 'Policy created' : 'Error: ' + JSON.stringify(data));
          };

          document.getElementById('load_audit').onclick = async () => {
            const resp = await fetch(apiBase + '/admin/v1/audit-events?limit=50');
            const data = await resp.json();
            document.getElementById('audit_out').textContent = JSON.stringify(data, null, 2);
          };
        </script>`
      )
    );
    return;
  }

  if (isDemoHost(host)) {
    res.type("html").send(
      page(
        "Z_Auth Demo App",
        `<div class="card">
          <h1>Hackathon Demo App</h1>
          <p>This relying party demonstrates OAuth 2.0 Authorization Code + PKCE with Z_Auth.</p>
          <a class="button" href="/start-login">Sign In With Z_Auth</a>
          <p><small>Expected auth domain: <code>${authIssuer}</code></small></p>
        </div>`
      )
    );
    return;
  }

  res.type("html").send(
    page(
      "Z_Auth UI",
      `<div class="card">
         <h1>Z_Auth UI Service</h1>
         <p>Use <code>demo.geturstyle.shop</code>, <code>console.geturstyle.shop</code>, or <code>status.geturstyle.shop</code>.</p>
       </div>`
    )
  );
});

app.listen(uiPort, "0.0.0.0", () => {
  console.log(`zauth-ui listening on 0.0.0.0:${uiPort}`);
});
