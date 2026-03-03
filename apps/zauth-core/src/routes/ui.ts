import { Router } from "express";
import QRCode from "qrcode";
import { config } from "../config.js";
import { writeAuditEvent } from "../services/auditService.js";
import { getAuthRequest } from "../services/authRequestService.js";
import { getHandoffByCode } from "../services/handoffService.js";
import { getClient } from "../services/oauthService.js";
import { clearSessionCookie, deleteSession, getSession } from "../services/sessionService.js";

export const uiRouter = Router();

uiRouter.use((_req, res, next) => {
  res.setHeader("cache-control", "no-store");
  next();
});

uiRouter.get("/ui/qr", async (req, res) => {
  const text = String(req.query.text || "");
  if (!text || text.length > 2048) {
    res.status(400).type("text/plain").send("invalid_qr_payload");
    return;
  }

  try {
    const svg = await QRCode.toString(text, {
      type: "svg",
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M"
    });
    res.setHeader("cache-control", "no-store");
    res.type("image/svg+xml").send(svg);
  } catch {
    res.status(500).type("text/plain").send("qr_generation_failed");
  }
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ZAUTH_LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Z Auth logo">
  <defs>
    <linearGradient id="zauthLogoGradient" x1="3" y1="2.5" x2="21" y2="22" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4285F4" />
      <stop offset="1" stop-color="#0B57D0" />
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#zauthLogoGradient)" />
  <path d="M7.25 7.75H16.75L7.25 16.25H16.75" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

function brandLockup(): string {
  return `<div class="brand" aria-label="Z Auth">
    <span class="brand-logo" aria-hidden="true">${ZAUTH_LOGO_SVG}</span>
    <span class="brand-text">Z Auth</span>
  </div>`;
}

uiRouter.get("/ui/logo.svg", (_req, res) => {
  res.setHeader("cache-control", "public, max-age=86400, immutable");
  res.type("image/svg+xml").send(ZAUTH_LOGO_SVG);
});

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap');
:root {
  color-scheme: light dark;
  --color-bg: #f1f3f4;
  --color-bg-accent: #e8f0fe;
  --color-card: #ffffff;
  --color-text: #1f1f1f;
  --color-subtext: #444746;
  --color-muted: #5f6368;
  --color-line: #dadce0;
  --color-line-strong: #c4c7c5;
  --color-brand: #1a73e8;
  --color-brand-hover: #0b57d0;
  --color-brand-soft: #d3e3fd;
  --color-brand-line: #b6cdfb;
  --color-link: #1a73e8;
  --color-primary-bg: #1a73e8;
  --color-primary-hover: #0b57d0;
  --color-primary-text: #ffffff;
  --color-danger: #c5221f;
  --color-danger-soft: #fce8e6;
  --color-success: #137333;
  --color-success-soft: #e6f4ea;
  --color-input-bg: #ffffff;
  --color-secondary-bg: #ffffff;
  --color-placeholder: #6f7377;
  --color-code-bg: #f1f3f4;
  --color-status-bg: #f8f9fa;
  --color-status-text: #3c4043;
  --shadow-card: 0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15);
  --font-display: "Google Sans", "Roboto", "Segoe UI", Arial, sans-serif;
  --font-body: "Roboto", "Google Sans", "Segoe UI", Arial, sans-serif;
  --radius-card: 28px;
  --radius-md: 12px;
  --radius-pill: 999px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 28px;
  --space-8: 32px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f1115;
    --color-bg-accent: #1a263b;
    --color-card: #1a1c1f;
    --color-text: #e8eaed;
    --color-subtext: #c4c7c5;
    --color-muted: #9aa0a6;
    --color-line: #3c4043;
    --color-line-strong: #5f6368;
    --color-brand: #8ab4f8;
    --color-brand-hover: #a8c7fa;
    --color-brand-soft: #1d2a40;
    --color-brand-line: #425f8c;
    --color-link: #a8c7fa;
    --color-primary-bg: #356fd6;
    --color-primary-hover: #2c5eb5;
    --color-primary-text: #f8fbff;
    --color-danger: #f28b82;
    --color-danger-soft: #5c2d2b;
    --color-success: #81c995;
    --color-success-soft: #173a28;
    --color-input-bg: #202124;
    --color-secondary-bg: #202124;
    --color-placeholder: #9aa0a6;
    --color-code-bg: #2d3136;
    --color-status-bg: #202124;
    --color-status-text: #e8eaed;
    --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.35);
  }
}
* { box-sizing: border-box; }
html, body { width: 100%; }
body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(circle at 8% -20%, var(--color-bg-accent) 0%, var(--color-bg) 42%, var(--color-bg) 100%);
  color: var(--color-text);
  font-family: var(--font-body);
}
main {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
}
.card {
  width: 100%;
  max-width: 456px;
  background: var(--color-card);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  padding: 44px 40px 30px;
  box-shadow: var(--shadow-card);
}
.card.wide {
  max-width: 1080px;
  min-height: 418px;
  padding: 52px 56px 36px;
}
.card.wide.compact {
  min-height: 0;
  padding: 44px 48px 30px;
}
.card-shell {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(340px, 1fr);
  gap: 56px;
  align-items: start;
}
.card-shell > section:last-child {
  min-width: 0;
}
.intro {
  padding-top: var(--space-1);
  min-width: 0;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--space-6);
}
.brand-logo {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--color-brand-soft);
  border: 1px solid var(--color-brand-line);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.brand-logo svg {
  width: 22px;
  height: 22px;
  display: block;
}
.brand-text {
  color: var(--color-text);
  font-size: 24px;
  line-height: 1;
  font-weight: 500;
  letter-spacing: -0.01em;
  font-family: var(--font-display);
}
.account-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  padding: 6px 12px;
  margin-top: var(--space-4);
  color: var(--color-subtext);
  font-size: 14px;
  font-family: var(--font-body);
}
.account-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-brand);
}
h1 {
  margin: 0;
  font-size: 36px;
  line-height: 1.22;
  font-weight: 500;
  letter-spacing: -0.01em;
  font-family: var(--font-display);
}
h2 {
  margin: var(--space-2) 0 0;
  font-size: 16px;
  line-height: 1.45;
  color: var(--color-subtext);
  font-weight: 400;
  font-family: var(--font-body);
}
p, li, small, footer {
  color: var(--color-muted);
  font-family: var(--font-body);
}
.card.wide .intro h1 {
  font-size: clamp(36px, 3.8vw, 56px);
  line-height: 1.08;
  letter-spacing: -0.02em;
}
.card.wide .intro h2 {
  margin-top: 14px;
  font-size: clamp(22px, 2.4vw, 34px);
  line-height: 1.15;
  letter-spacing: -0.015em;
  color: var(--color-text);
  font-family: var(--font-display);
}
.card.wide .intro .helper-line {
  margin-top: 20px;
  max-width: 560px;
}
.card.wide.compact .card-shell {
  align-items: center;
  gap: 40px;
}
.card.wide.compact .intro h1 {
  font-size: clamp(34px, 3.3vw, 52px);
  line-height: 1.08;
}
.card.wide.compact .intro h2 {
  font-size: clamp(20px, 2.1vw, 30px);
  line-height: 1.18;
}
.card.wide.compact .intro .helper-line {
  max-width: 420px;
}
label {
  display: block;
  margin: var(--space-6) 0 var(--space-2);
  color: var(--color-text);
  font-size: 14px;
  font-family: var(--font-body);
}
input, textarea {
  width: 100%;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  padding: 14px 14px;
  font-size: 16px;
  color: var(--color-text);
  font-family: var(--font-body);
  background: var(--color-input-bg);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
input::placeholder { color: var(--color-placeholder); opacity: 1; }
input:focus, textarea:focus {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 1px var(--color-brand);
}
input:disabled, textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--color-status-bg);
}
.actions {
  margin-top: var(--space-7);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}
.actions.tight {
  margin-top: var(--space-3);
}
.link {
  background: none;
  border: none;
  color: var(--color-link);
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-display);
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  line-height: 1.4;
  transition: opacity 0.15s;
}
.link:hover { text-decoration: underline; }
.link:active { opacity: 0.7; }
.link:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; border-radius: 4px; }
button.primary, a.primary {
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-primary-bg);
  color: var(--color-primary-text);
  min-height: 40px;
  padding: 0 24px;
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-display);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}
button.primary:hover, a.primary:hover { background: var(--color-primary-hover); }
button.primary:active, a.primary:active { transform: scale(0.97); }
button.primary:focus-visible, a.primary:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
button.primary:disabled, a.primary[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
button.secondary, a.secondary {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-secondary-bg);
  color: var(--color-link);
  min-height: 40px;
  padding: 0 22px;
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-display);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
button.secondary:hover, a.secondary:hover {
  background: var(--color-brand-soft);
  border-color: var(--color-brand-line);
}
button.secondary:active, a.secondary:active { transform: scale(0.97); }
button.secondary:focus-visible, a.secondary:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
button.secondary:disabled, a.secondary[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
button.danger {
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-danger);
  color: var(--color-primary-text);
  min-height: 40px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-display);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}
button.danger:hover { filter: brightness(1.1); }
button.danger:active { transform: scale(0.97); }
button.danger:focus-visible { outline: 2px solid var(--color-danger); outline-offset: 2px; }
button.danger:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.code {
  display: inline-block;
  background: var(--color-code-bg);
  border: 1px solid var(--color-line);
  color: var(--color-text);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin-top: var(--space-2);
  flex-wrap: wrap;
}
.stack { display: grid; gap: var(--space-2); }
.stack > a.primary, .stack > a.secondary, .stack > button.primary, .stack > button.secondary, .stack > button.danger {
  width: 100%;
}
.passkey-column {
  width: 100%;
  max-width: 620px;
  justify-self: end;
  gap: 12px;
}
.passkey-header {
  margin: 0;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.35;
}
.passkey-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 5px;
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-pill);
  background: var(--color-input-bg);
}
button.passkey-tab {
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-subtext);
  border-radius: var(--radius-pill);
  min-height: 46px;
  padding: 0 16px;
  font-size: 15px;
  font-weight: 500;
  font-family: var(--font-display);
  cursor: pointer;
}
button.passkey-tab:focus-visible {
  outline: 2px solid var(--color-link);
  outline-offset: 1px;
}
button.passkey-tab.active {
  background: var(--color-primary-bg);
  color: var(--color-primary-text);
  border-color: var(--color-primary-bg);
}
.passkey-panel {
  display: none;
}
.passkey-panel.active {
  display: block;
}
.status.stage.passkey-panel {
  margin-top: 0;
  border-radius: 18px;
  padding: 16px 18px 20px;
}
.status.stage.passkey-panel.active {
  border-color: var(--color-line-strong);
  background: var(--color-status-bg);
}
.passkey-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.passkey-step-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--color-line-strong);
  background: var(--color-input-bg);
  color: var(--color-subtext);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-display);
}
.passkey-panel.active .passkey-step-index {
  border-color: var(--color-primary-bg);
  background: var(--color-primary-bg);
  color: var(--color-primary-text);
}
.passkey-panel-title {
  font-size: 17px;
  line-height: 1.2;
  font-weight: 500;
  color: var(--color-text);
  font-family: var(--font-display);
}
.passkey-panel-note {
  margin-top: 0;
}
.passkey-panel input {
  margin-top: var(--space-2);
}
.passkey-panel button {
  margin-top: 14px;
}
.passkey-column .actions.tight {
  margin-top: 4px;
}
.passkey-back-link {
  font-size: 15px;
}
.muted { color: var(--color-muted); }
.status {
  margin-top: var(--space-4);
  border: 1px solid var(--color-line);
  background: var(--color-status-bg);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  font-size: 14px;
  color: var(--color-status-text);
  font-family: var(--font-body);
}
.status strong {
  display: inline-block;
  margin-bottom: var(--space-1);
  color: var(--color-text);
}
.status.stage {
  margin-top: var(--space-3);
}
.status.stage.active {
  border-color: var(--color-brand-line);
  background: var(--color-brand-soft);
}
.mobile-steps {
  gap: 12px;
}
.mobile-step {
  margin-top: 0;
  border-radius: 16px;
  padding: 14px 16px;
}
.wizard-track {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.wizard-chip {
  min-height: 34px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-line);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-muted);
  background: var(--color-input-bg);
}
.wizard-chip.active {
  border-color: var(--color-brand-line);
  background: var(--color-brand-soft);
  color: var(--color-text);
}
.wizard-chip.complete {
  border-color: var(--color-success);
  background: var(--color-success-soft);
  color: var(--color-text);
}
.mobile-step.active {
  border-color: var(--color-line-strong);
  background: var(--color-status-bg);
}
.mobile-step strong {
  margin-bottom: 8px;
  font-size: 16px;
}
.mobile-step label {
  margin: 10px 0 8px;
  color: var(--color-subtext);
}
.mobile-inline-label {
  margin-top: 6px;
}
.mobile-cta {
  width: 100%;
  margin-top: 12px;
  min-height: 44px;
  font-size: 15px;
}
.inline-link {
  margin-top: 8px;
  display: inline-flex;
}
.status.error {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
  color: var(--color-text);
}
.status.success {
  border-color: var(--color-success);
  background: var(--color-success-soft);
  color: var(--color-text);
}
.qr {
  width: 220px;
  height: 220px;
  margin: 0 auto;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--color-card);
}
.qr canvas, .qr img { width: 100%; height: 100%; }
pre {
  white-space: pre-wrap;
  background: var(--color-code-bg);
  color: var(--color-text);
  border-radius: var(--radius-md);
  padding: 10px;
  min-height: 70px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
pre.log-panel {
  margin-top: var(--space-4);
  min-height: 0;
  display: none;
}
pre.log-panel.visible {
  display: block;
}
video {
  width: 100%;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  margin-top: var(--space-2);
  background: var(--color-code-bg);
}

/* ── Face Verification Overlay ── */
.face-viewport {
  position: relative;
  width: 100%;
  max-width: 320px;
  margin: 12px auto 0;
  border-radius: 16px;
  overflow: hidden;
  background: var(--color-code-bg);
  aspect-ratio: 4 / 3;
}
.face-viewport video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border: none;
  border-radius: 0;
  margin: 0;
  transform: scaleX(-1);
}
.face-frame {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}
.face-frame-ring {
  width: 68%;
  height: auto;
  opacity: 0.6;
  animation: face-ring-pulse 3s ease-in-out infinite;
}
@keyframes face-ring-pulse {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.02); }
}
.face-cue {
  position: absolute;
  top: 8%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cue-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: cue-enter 0.4s ease-out;
}
.cue-icon svg {
  width: 56px;
  height: auto;
  filter: drop-shadow(0 1px 4px rgba(0,0,0,0.5));
}
.cue-label {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.65);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
@keyframes cue-enter {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cue-blink svg { width: 64px; }
.cue-blink .eye-shape {
  animation: blink-close 1.6s ease-in-out infinite;
  transform-origin: center;
}
.cue-blink .pupil {
  animation: blink-pupil 1.6s ease-in-out infinite;
}
@keyframes blink-close {
  0%, 30%, 100% { transform: scaleY(1); }
  44%, 56%       { transform: scaleY(0.12); }
  70%            { transform: scaleY(1); }
}
@keyframes blink-pupil {
  0%, 30%, 100% { opacity: 1; }
  44%, 56%       { opacity: 0; }
  70%            { opacity: 1; }
}
.cue-turn-right .arrow-path {
  animation: arrow-right 1.2s ease-in-out infinite;
}
@keyframes arrow-right {
  0%, 100% { transform: translateX(0); }
  50%      { transform: translateX(5px); }
}
.cue-turn-left .arrow-path {
  animation: arrow-left 1.2s ease-in-out infinite;
}
@keyframes arrow-left {
  0%, 100% { transform: translateX(0); }
  50%      { transform: translateX(-5px); }
}
.face-success {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(19, 115, 51, 0.5);
  z-index: 5;
  pointer-events: none;
  animation: success-flash 0.7s ease-out forwards;
}
.face-success svg {
  width: 52px;
  height: 52px;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
}
.face-success .check-path {
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
  animation: check-draw 0.35s ease-out 0.15s forwards;
}
@keyframes success-flash {
  0%   { opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes check-draw {
  to { stroke-dashoffset: 0; }
}
.face-progress {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 4;
  pointer-events: none;
}
.progress-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255,255,255,0.3);
  border: 1.5px solid rgba(255,255,255,0.55);
  transition: background 0.3s, border-color 0.3s, transform 0.3s;
}
.progress-dot.active {
  background: var(--color-brand);
  border-color: #fff;
  transform: scale(1.25);
  box-shadow: 0 0 6px rgba(26,115,232,0.6);
}
.progress-dot.done {
  background: var(--color-success);
  border-color: #fff;
}
.face-instruction {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  text-shadow: 0 1px 6px rgba(0,0,0,0.7);
  text-align: center;
  white-space: nowrap;
  z-index: 4;
  pointer-events: none;
}
.face-viewport.completing .face-frame-ring circle {
  stroke: rgba(129,201,149,0.7);
  transition: stroke 0.4s;
}
.face-viewport.scanning .face-frame-ring circle {
  stroke: rgba(66,133,244,0.75);
  animation: face-ring-scan 1.5s ease-in-out infinite;
}
@keyframes face-ring-scan {
  0%, 100% { stroke-opacity: 0.5; stroke-width: 2.5; }
  50% { stroke-opacity: 1; stroke-width: 3.5; }
}
.face-viewport.failed .face-frame-ring circle {
  stroke: rgba(220,53,69,0.75);
  transition: stroke 0.4s;
}
.face-failure {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(220,53,69,0.25);
  z-index: 5;
  animation: failure-flash 0.7s ease-out forwards;
  pointer-events: none;
}
.face-failure svg {
  width: 52px;
  height: 52px;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
}
.face-failure .x-path {
  stroke-dasharray: 30;
  stroke-dashoffset: 30;
  animation: x-draw 0.3s ease-out 0.1s forwards;
}
@keyframes failure-flash {
  0%   { opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes x-draw {
  to { stroke-dashoffset: 0; }
}
.scan-status {
  text-align: center;
  font-size: 13px;
  color: var(--color-muted);
  margin-top: 8px;
  min-height: 20px;
  transition: color 0.3s;
}
.scan-status.error { color: var(--color-danger); }
.scan-status.success { color: var(--color-success); }
.recovery-step-enter {
  animation: step-slide-in 0.3s ease-out forwards;
}
.recovery-step-exit {
  animation: step-slide-out 0.3s ease-in forwards;
}
@keyframes step-slide-in {
  from { opacity: 0; transform: translateX(30px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes step-slide-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(-30px); }
}

footer {
  margin-top: var(--space-5);
  font-size: 13px;
}
.scope-list {
  margin: var(--space-2) 0 0 18px;
  padding: 0;
}
.scope-list li {
  margin-bottom: var(--space-1);
}
.helper-line {
  margin-top: var(--space-2);
  font-size: 13px;
  color: var(--color-muted);
}
.passkey-shell {
  grid-template-columns: minmax(340px, 1.02fr) minmax(380px, 0.98fr);
  gap: 34px;
}
.card.wide.compact .passkey-intro h1 {
  font-size: clamp(48px, 4.9vw, 72px);
  line-height: 1.03;
  letter-spacing: -0.03em;
}
.card.wide.compact .passkey-intro h2 {
  margin-top: 16px;
  font-size: clamp(24px, 2.4vw, 38px);
  line-height: 1.12;
  letter-spacing: -0.02em;
  color: var(--color-text);
  font-family: var(--font-display);
}
.passkey-intro .helper-line {
  margin-top: 20px;
  max-width: 440px;
}
.wait-shell {
  grid-template-columns: minmax(340px, 1.05fr) minmax(380px, 0.95fr);
  gap: 34px;
}
.card.wide .wait-intro h1 {
  font-size: clamp(48px, 5.2vw, 78px);
  line-height: 1.02;
  letter-spacing: -0.03em;
}
.card.wide .wait-intro h2 {
  margin-top: 14px;
  font-size: clamp(24px, 2.55vw, 40px);
  line-height: 1.12;
  letter-spacing: -0.02em;
  color: var(--color-text);
  font-family: var(--font-display);
}
.wait-account {
  display: block;
  margin-top: 6px;
  word-break: break-word;
}
.wait-status {
  margin-top: 24px;
  min-height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
}
.wait-status::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-brand);
  flex: 0 0 auto;
}
.wait-status.error::before {
  background: var(--color-danger);
}
.wait-status.success::before {
  background: var(--color-success);
}
.wait-actions {
  margin-top: 18px;
}
.wait-steps {
  display: grid;
  gap: 12px;
}
.wait-step {
  margin-top: 0;
  border-radius: 16px;
  padding: 14px 16px;
}
.wait-step.active {
  border-color: var(--color-brand-line);
  background: var(--color-status-bg);
}
.wait-step-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.wait-step-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--color-line-strong);
  background: var(--color-input-bg);
  color: var(--color-subtext);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-display);
}
.wait-step.active .wait-step-index {
  border-color: var(--color-primary-bg);
  background: var(--color-primary-bg);
  color: var(--color-primary-text);
}
.wait-step-title {
  font-size: 17px;
  line-height: 1.2;
  font-weight: 500;
  color: var(--color-text);
  font-family: var(--font-display);
}
.wait-code-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}
.wait-link-row {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.wait-link-row .secondary {
  min-width: 192px;
}
.wait-link-state {
  display: block;
  margin-top: 8px;
  min-height: 18px;
  font-size: 12px;
}
.wait-url {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-muted);
  word-break: break-all;
}
@media (max-width: 1040px) {
  .card.wide {
    max-width: 920px;
    min-height: 0;
    padding: 44px 40px 30px;
  }
  .card.wide.compact {
    padding: 38px 36px 26px;
  }
  .card-shell {
    gap: var(--space-7);
  }
  .card.wide .intro h1 {
    font-size: clamp(34px, 3.4vw, 46px);
  }
  .card.wide .intro h2 {
    font-size: clamp(20px, 2.2vw, 28px);
  }
  .passkey-shell {
    gap: var(--space-6);
  }
  .card.wide.compact .passkey-intro h1 {
    font-size: clamp(40px, 4vw, 58px);
  }
  .card.wide.compact .passkey-intro h2 {
    font-size: clamp(20px, 2vw, 30px);
  }
  .wait-shell {
    gap: var(--space-6);
  }
  .card.wide .wait-intro h1 {
    font-size: clamp(40px, 4.2vw, 56px);
  }
  .card.wide .wait-intro h2 {
    font-size: clamp(20px, 2.2vw, 30px);
  }
}
@media (max-width: 900px) {
  .card.wide {
    max-width: 560px;
  }
  .card-shell {
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }
  .card.wide .intro h1 {
    font-size: 36px;
  }
  .card.wide .intro h2 {
    font-size: 23px;
    line-height: 1.15;
  }
  .passkey-column {
    justify-self: stretch;
    max-width: 100%;
  }
  .card.wide.compact .card-shell {
    align-items: start;
    gap: var(--space-6);
  }
  .passkey-shell {
    grid-template-columns: 1fr;
    gap: var(--space-5);
  }
  .card.wide.compact .passkey-intro h1 {
    font-size: 42px;
  }
  .card.wide.compact .passkey-intro h2 {
    font-size: 26px;
    line-height: 1.16;
  }
  .wait-shell {
    grid-template-columns: 1fr;
    gap: var(--space-5);
  }
  .card.wide .wait-intro h1 {
    font-size: 42px;
  }
  .card.wide .wait-intro h2 {
    font-size: 26px;
    line-height: 1.16;
  }
}
@media (max-width: 560px) {
  main { padding: 12px; }
  .card {
    padding: 28px 20px 22px;
    border-radius: 24px;
    max-width: 100%;
  }
  .brand-logo {
    width: 30px;
    height: 30px;
  }
  .brand-text {
    font-size: 22px;
  }
  h1 {
    font-size: 30px;
  }
  .card.wide .intro h1 {
    font-size: 36px;
  }
  .card.wide .intro h2 {
    font-size: 22px;
  }
  .actions {
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  button.primary, a.primary, button.secondary, a.secondary, button.danger {
    min-height: 38px;
  }
  .actions > button, .actions > a {
    flex: 1 1 auto;
  }
  .wait-step-title {
    font-size: 16px;
  }
  .passkey-panel-title {
    font-size: 16px;
  }
  .wait-code-line {
    font-size: 15px;
  }
  .wait-link-row .secondary {
    min-width: 0;
    width: 100%;
  }
}
</style>
</head>
<body>
<main>${body}</main>
</body>
</html>`;
}

function passkeyClientLogic(requestId: string): string {
  return `
const requestId = ${JSON.stringify(requestId)};
const log = (msg) => {
  const el = document.getElementById('log');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('visible', Boolean(msg));
};

const modeInput = document.getElementById('passkey-mode');
const signInPanel = document.getElementById('signin-panel');
const signUpPanel = document.getElementById('signup-panel');
const signInTab = document.getElementById('tab-signin');
const signUpTab = document.getElementById('tab-signup');
const passkeySubtitle = document.getElementById('passkey-intro-subtitle');
const passkeyHelper = document.getElementById('passkey-intro-helper');

const setTabState = (tab, active) => {
  if (!tab) return;
  tab.classList.toggle('active', active);
  tab.setAttribute('aria-selected', String(active));
  tab.setAttribute('tabindex', active ? '0' : '-1');
};

const setMode = (mode) => {
  const isSignUp = mode === 'signup';
  if (modeInput) modeInput.value = isSignUp ? 'signup' : 'signin';
  if (signInPanel) signInPanel.classList.toggle('active', !isSignUp);
  if (signUpPanel) signUpPanel.classList.toggle('active', isSignUp);
  setTabState(signInTab, !isSignUp);
  setTabState(signUpTab, isSignUp);
  if (passkeySubtitle) {
    passkeySubtitle.textContent = isSignUp ? 'Create your account with a passkey on this device.' : 'Use passkey directly on this device.';
  }
  if (passkeyHelper) {
    passkeyHelper.textContent = isSignUp
      ? 'Create your account once, then sign in quickly using your device passkey.'
      : 'This fallback keeps access available if phone handoff is not possible.';
  }
};

if (signInTab) signInTab.onclick = () => setMode('signin');
if (signUpTab) signUpTab.onclick = () => setMode('signup');
setMode(modeInput && modeInput.value === 'signup' ? 'signup' : 'signin');

const b64urlToBuffer = (value) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const bufferToB64url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).split('+').join('-').split('/').join('_').replace(/=+$/, '');
};

const toRegistrationCredentialJSON = (credential) => {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToB64url(response.clientDataJSON),
      attestationObject: bufferToB64url(response.attestationObject),
      transports: response.getTransports ? response.getTransports() : []
    }
  };
};

const toAuthenticationCredentialJSON = (credential) => {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToB64url(response.clientDataJSON),
      authenticatorData: bufferToB64url(response.authenticatorData),
      signature: bufferToB64url(response.signature),
      userHandle: response.userHandle ? bufferToB64url(response.userHandle) : null
    }
  };
};

function prepareRegisterOptions(options) {
  options.challenge = b64urlToBuffer(options.challenge);
  options.user.id = b64urlToBuffer(options.user.id);
  if (Array.isArray(options.excludeCredentials)) {
    options.excludeCredentials = options.excludeCredentials.map((cred) => ({ ...cred, id: b64urlToBuffer(cred.id) }));
  }
  return options;
}

function prepareLoginOptions(options) {
  options.challenge = b64urlToBuffer(options.challenge);
  if (Array.isArray(options.allowCredentials)) {
    options.allowCredentials = options.allowCredentials.map((cred) => ({ ...cred, id: b64urlToBuffer(cred.id) }));
  }
  return options;
}

const regButton = document.getElementById('register-btn');
if (regButton) {
  regButton.onclick = async () => {
    try {
      const username = document.getElementById('register-username').value.trim().toLowerCase();
      const displayName = document.getElementById('register-display').value.trim() || username;
      if (!username) throw new Error('Username is required');

      const optionsResp = await fetch('/auth/webauthn/register/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, displayName })
      });
      if (!optionsResp.ok) throw new Error('Failed to start registration');
      const options = prepareRegisterOptions(await optionsResp.json());
      const credential = await navigator.credentials.create({ publicKey: options });

      const verifyResp = await fetch('/auth/webauthn/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, response: toRegistrationCredentialJSON(credential), requestId })
      });
      const verifyData = await verifyResp.json();
      if (!verifyResp.ok || !verifyData.verified) throw new Error('Passkey registration failed');
      log('Passkey registered. You can now sign in.');
      const loginUsername = document.getElementById('login-username');
      if (loginUsername && !loginUsername.value) {
        loginUsername.value = username;
      }
      setMode('signin');
    } catch (error) {
      log('Register error: ' + error.message);
    }
  };
}

const loginButton = document.getElementById('login-btn');
if (loginButton) {
  loginButton.onclick = async () => {
    try {
      const username = document.getElementById('login-username').value.trim().toLowerCase();
      if (!username) throw new Error('Username is required');

      const optionsResp = await fetch('/auth/webauthn/login/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (!optionsResp.ok) throw new Error('No passkey found for this account');
      const options = prepareLoginOptions(await optionsResp.json());
      const credential = await navigator.credentials.get({ publicKey: options });

      const verifyResp = await fetch('/auth/webauthn/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, response: toAuthenticationCredentialJSON(credential), requestId })
      });
      const verifyData = await verifyResp.json();
      if (!verifyResp.ok || !verifyData.verified) throw new Error('Passkey authentication failed');

      window.location.href = verifyData.redirectTo || '/';
    } catch (error) {
      log('Login error: ' + error.message);
    }
  };
}
`;
}

uiRouter.get("/", (_req, res) => {
  const body = `
  <div class="card wide">
    <div class="card-shell">
      <section class="intro">
        ${brandLockup()}
        <h1>Sign in</h1>
        <h2>to continue to Z Auth</h2>
        <div class="helper-line">Identity-first authentication with phone verification and passkey security.</div>
      </section>
      <section>
        <label>Continue with your account</label>
        <div class="stack">
          <a class="primary" href="/ui/login?mode=signin">Sign in</a>
          <a class="secondary" href="/ui/login?mode=signup">Create account</a>
        </div>
        <div class="actions tight">
          <a class="link" href="/ui/passkey">Use passkey directly</a>
          <span></span>
        </div>
      </section>
    </div>
  </div>`;

  res.type("html").send(layout("Z Auth", body));
});

uiRouter.get("/ui/login", async (req, res) => {
  const requestId = String(req.query.request_id || "");
  const mode = String(req.query.mode || "signin").toLowerCase() === "signup" ? "signup" : "signin";
  if (requestId) {
    const authRequest = await getAuthRequest(requestId);
    if (!authRequest) {
      await writeAuditEvent({
        tenantId: "default",
        actor: "anonymous",
        action: "auth.request.expired_preflight",
        outcome: "failure",
        traceId: req.traceId,
        payload: {
          request_id: requestId,
          surface: "ui.login"
        }
      });
      const expiredBody = `
      <div class="card">
        ${brandLockup()}
        <h1>Request expired</h1>
        <h2>This sign-in request is no longer valid.</h2>
        <div class="helper-line">Restart sign-in from your app to continue securely.</div>
        <div class="actions">
          <a class="primary" href="/ui/login">Restart sign-in</a>
          <span></span>
        </div>
      </div>`;
      res.type("html").send(layout("Expired Request", expiredBody));
      return;
    }
  }

  const title = mode === "signup" ? "Create your account" : "Sign in";
  const subtitle = "to continue to Z Auth";
  const statusTitle = mode === "signup" ? "Set up with your phone" : "Verify with your phone";
  const body = `
  <div class="card wide">
    <div class="card-shell">
      <section class="intro">
        ${brandLockup()}
        <h1>${escapeHtml(title)}</h1>
        <h2>${escapeHtml(subtitle)}</h2>
        <div class="account-pill">
          <span class="account-dot"></span>
          <span>${escapeHtml(statusTitle)}</span>
        </div>
      </section>
      <section>
        <label for="email">Email or phone</label>
        <input id="email" autocomplete="username" placeholder="founder@geturstyle.shop" />
        <div class="helper-line">Not your computer? Use Guest mode to sign in privately.</div>
        <div id="status" class="status" style="display:none"></div>

        <div class="actions">
          <button class="secondary" id="signup-btn" type="button">Create account</button>
          <button class="primary" id="signin-btn" type="button">Next</button>
        </div>

        <div class="actions tight">
          <a class="link" href="/ui/passkey${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}">Try another way</a>
          <a class="link" href="/ui/recovery${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}">Lost your device?</a>
        </div>
      </section>
    </div>
    <footer>Phone approval is primary. Passkey fallback stays available for recovery.</footer>
  </div>

  <script>
    const requestId = ${JSON.stringify(requestId)};
    const initialMode = ${JSON.stringify(mode)};
    const statusEl = document.getElementById('status');
    const setStatus = (message, isError = false) => {
      statusEl.style.display = 'block';
      statusEl.className = 'status' + (isError ? ' error' : '');
      statusEl.textContent = message;
    };

    const startFlow = async (flowMode) => {
      try {
        const loginHint = document.getElementById('email').value.trim().toLowerCase();
        if (!loginHint) {
          setStatus('Enter your email or username to continue.', true);
          return;
        }

        setStatus(flowMode === 'signup' ? 'Preparing secure sign-up on your phone...' : 'Preparing secure sign-in on your phone...');
        const resp = await fetch('/auth/handoff/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ requestId: requestId || undefined, loginHint, mode: flowMode })
        });
        const data = await resp.json();
        if (!resp.ok) {
          if (resp.status === 410 || data.error === 'request_expired') {
            setStatus('This sign-in request expired. Restart sign-in from the app.', true);
            return;
          }
          throw new Error(data.error || 'Unable to start phone verification');
        }

        const verifyUrl = new URL(data.verify_url, window.location.origin);
        if (flowMode === 'signup') {
          verifyUrl.searchParams.set('mode', 'signup');
        } else {
          verifyUrl.searchParams.delete('mode');
        }

        const waitUrl = new URL('/ui/handoff/wait', window.location.origin);
        waitUrl.searchParams.set('handoff_id', data.handoff_id);
        waitUrl.searchParams.set('code', data.code);
        waitUrl.searchParams.set('verify_url', verifyUrl.toString());
        waitUrl.searchParams.set('email', data.login_hint || loginHint);
        waitUrl.searchParams.set('mode', data.mode || flowMode);
        if (requestId) waitUrl.searchParams.set('request_id', requestId);
        window.location.href = waitUrl.toString();
      } catch (error) {
        setStatus(error.message, true);
      }
    };

    document.getElementById('signin-btn').onclick = () => startFlow('signin');
    document.getElementById('signup-btn').onclick = () => startFlow('signup');
    if (initialMode === 'signup') {
      setStatus('Create your account by clicking Sign up.');
    }
  </script>
  `;

  res.type("html").send(layout("Z Auth Sign In", body));
});

uiRouter.get("/ui/handoff/wait", (req, res) => {
  const handoffId = String(req.query.handoff_id || "");
  const requestId = String(req.query.request_id || "");
  const mode = String(req.query.mode || "signin").toLowerCase() === "signup" ? "signup" : "signin";
  const code = String(req.query.code || "");
  const verifyUrl = String(req.query.verify_url || "");
  const email = String(req.query.email || "");

  if (!handoffId || !code || !verifyUrl) {
    res.redirect(`/ui/login${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}`);
    return;
  }

  const body = `
  <div class="card wide">
    <div class="card-shell wait-shell">
      <section class="intro wait-intro">
        ${brandLockup()}
        <h1>Check your phone</h1>
        <h2>${mode === "signup" ? "Complete setup as" : "Continue as"}<span class="wait-account">${escapeHtml(email || "your account")}</span></h2>
        <div id="status" class="status wait-status">Waiting for phone approval...</div>
        <div class="actions wait-actions">
          <a class="link" href="/ui/passkey${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}">Try another way</a>
          <button class="secondary" id="retry-btn">Restart</button>
        </div>
      </section>
      <section class="wait-steps">
        <div class="status stage wait-step active">
          <div class="wait-step-head">
            <span class="wait-step-index">1</span>
            <span class="wait-step-title">Scan QR with your phone</span>
          </div>
          <div class="qr" id="qr-box">
            <img id="qr-img" alt="Z Auth verification QR" src="/ui/qr?text=${encodeURIComponent(verifyUrl)}" />
          </div>
        </div>
        <div class="status stage wait-step">
          <div class="wait-step-head">
            <span class="wait-step-index">2</span>
            <span class="wait-step-title">Confirm security code</span>
          </div>
          <div class="wait-code-line">Code: <span class="code">${escapeHtml(code)}</span></div>
        </div>
        <div class="status stage wait-step">
          <div class="wait-step-head">
            <span class="wait-step-index">3</span>
            <span class="wait-step-title">Approve sign-in on your phone</span>
          </div>
          <div class="helper-line">Or open this link directly on your phone:</div>
          <div class="wait-link-row">
            <a class="secondary" href="${escapeHtml(verifyUrl)}">Open verification link</a>
            <button class="secondary" id="copy-link-btn" type="button">Copy link</button>
          </div>
          <small id="copy-state" class="wait-link-state"></small>
          <small class="wait-url">${escapeHtml(verifyUrl)}</small>
        </div>
      </section>
    </div>
    <footer>This page updates automatically after approval.</footer>
  </div>

  <script>
    const handoffId = ${JSON.stringify(handoffId)};
    const requestId = ${JSON.stringify(requestId)};
    const code = ${JSON.stringify(code)};
    const mode = ${JSON.stringify(mode)};
    const verifyUrl = ${JSON.stringify(verifyUrl)};

    const statusEl = document.getElementById('status');
    const setStatus = (message, type) => {
      statusEl.className = 'status' + (type ? ' ' + type : '');
      statusEl.textContent = message;
    };

    const qrBox = document.getElementById('qr-box');
    const qrImg = document.getElementById('qr-img');
    if (qrImg) {
      qrImg.onerror = () => {
        qrBox.innerHTML = '<small>QR unavailable. Use link below.</small>';
      };
    }

    const copyBtn = document.getElementById('copy-link-btn');
    const copyState = document.getElementById('copy-state');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) {
            throw new Error('clipboard_unsupported');
          }
          await navigator.clipboard.writeText(verifyUrl);
          if (copyState) copyState.textContent = 'Verification link copied.';
        } catch {
          if (copyState) copyState.textContent = 'Copy unavailable. Open the link directly.';
        }
      };
    }

    const poll = async () => {
      try {
        const resp = await fetch('/auth/handoff/status?handoff_id=' + encodeURIComponent(handoffId));
        const data = await resp.json();

        if (!resp.ok) {
          if (resp.status === 410) {
            setStatus('This request expired. Restart verification.', 'error');
            return;
          }
          setStatus('Unable to read approval status. Retrying...', 'error');
          return;
        }

        if (data.status === 'pending') {
          setStatus(mode === 'signup' ? 'Waiting for phone sign-up approval...' : 'Waiting for phone sign-in approval...');
          return;
        }

        if (data.status === 'denied') {
          setStatus('Phone request denied. Restart or choose passkey fallback.', 'error');
          return;
        }

        if (data.status === 'approved') {
          setStatus('Approved. Redirecting...', 'success');
          window.location.href = data.redirectTo || '/';
          return;
        }

        if (data.status === 'consumed') {
          setStatus('Already consumed. Restart if needed.', 'error');
          return;
        }
      } catch (_error) {
        setStatus('Connection issue while polling. Retrying...', 'error');
      }
    };

    document.getElementById('retry-btn').onclick = () => {
      const next = requestId ? '/ui/login?request_id=' + encodeURIComponent(requestId) : '/ui/login';
      window.location.href = next;
    };

    setInterval(poll, 2000);
    poll();
  </script>
  `;

  res.type("html").send(layout("Z Auth Verify", body));
});

uiRouter.get("/ui/mobile-approve", async (req, res) => {
  const handoffId = String(req.query.handoff || "");
  const code = String(req.query.code || "").toUpperCase();
  const debug = String(req.query.debug || "") === "1";
  const sid = req.cookies.zauth_sid as string | undefined;
  const session = await getSession(sid);

  if (!handoffId || !code) {
    res.status(400).type("html").send(layout("Invalid Link", `<div class="card"><h1>Invalid link</h1><h2>Missing handoff details.</h2></div>`));
    return;
  }

  const handoff = await getHandoffByCode(code);
  if (!handoff || handoff.handoffId !== handoffId) {
    res
      .status(400)
      .type("html")
      .send(layout("Invalid Link", `<div class="card"><h1>Invalid link</h1><h2>This verification request is invalid.</h2></div>`));
    return;
  }

  if (handoff.expiresAt < Date.now()) {
    res
      .status(410)
      .type("html")
      .send(layout("Request Expired", `<div class="card"><h1>Request expired</h1><h2>Scan a new QR code to continue.</h2></div>`));
    return;
  }

  if (handoff.loginHint) {
    await writeAuditEvent({
      tenantId: "default",
      actor: handoff.loginHint,
      action: "auth.mobile.account.prefilled",
      outcome: "success",
      traceId: req.traceId,
      payload: {
        handoff_id: handoff.handoffId,
        account_locked: true
      }
    });
  }

  const initialMode = handoff.mode === "signup" ? "signup" : "signin";
  const initialAccount = handoff.loginHint ?? session?.username ?? "";
  const accountLocked = Boolean(handoff.loginHint);

  const body = `
  <div class="card">
    ${brandLockup()}
    <h1>Verify it's you</h1>
    <h2>Approve sign-in request from your other device.</h2>

    <div class="account-pill">
      <span class="account-dot"></span>
      <span>Security code <span class="code">${escapeHtml(code)}</span></span>
    </div>

    <div id="wizard-status" class="status wait-status">Follow the steps on this phone.</div>
    <div class="wizard-track">
      <span id="chip-account" class="wizard-chip active">1. Account</span>
      <span id="chip-face" class="wizard-chip">2. Face</span>
      <span id="chip-approve" class="wizard-chip">3. Approve</span>
    </div>

    <div class="stack mobile-steps" style="margin-top:14px;">
      <section id="panel-account" class="status stage mobile-step active">
        <strong>Step 1: Confirm account</strong>
        <label for="locked-account">Account</label>
        <input id="locked-account" readonly />
        <button class="primary mobile-cta" id="account-continue-btn">Continue</button>
        <small id="account-state" class="muted">Use your phone passkey to continue.</small>
        <button class="link inline-link" id="switch-account-link" type="button">Not you? Use another account</button>
      </section>

      <section id="panel-switch" class="status stage mobile-step" style="display:none;">
        <strong>Use another account</strong>
        <label for="switch-account-input">Email or username</label>
        <input id="switch-account-input" autocomplete="username" placeholder="founder@geturstyle.shop" />
        <div class="row">
          <button class="primary" id="switch-account-continue-btn" type="button">Use this account</button>
          <button class="secondary" id="switch-account-cancel-btn" type="button">Cancel</button>
        </div>
        <small class="muted">This account will be used for verification on this phone.</small>
      </section>

      <section id="panel-signup" class="status stage mobile-step" style="display:none;">
        <strong>Create account</strong>
        <label for="signup-username">Account</label>
        <input id="signup-username" readonly />
        <label for="signup-display-name">Display name</label>
        <input id="signup-display-name" placeholder="Your name" />
        <div class="row">
          <button class="primary" id="signup-create-btn" type="button">Create account</button>
          <button class="secondary" id="signup-back-btn" type="button">Back</button>
        </div>
        <small id="signup-state" class="muted">No account found for this email. Create one to continue.</small>
      </section>

      <section id="panel-face" class="status stage mobile-step" style="display:none;">
        <strong>Step 2: Face verification</strong>
        <label>Complete the challenge on this phone</label>
        <button class="primary mobile-cta" id="start-liveness-btn">Start face check</button>
        <small id="challenge-seq" class="muted">Challenge not started.</small>

        <div id="face-viewport" class="face-viewport" style="display:none;">
          <video id="preview" autoplay playsinline muted></video>

          <div class="face-frame">
            <svg class="face-frame-ring" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="90" stroke="rgba(255,255,255,0.35)" stroke-width="2.5" stroke-dasharray="8 4" fill="none"/>
            </svg>
          </div>

          <div id="face-cue" class="face-cue">
            <div id="cue-blink" class="cue-icon cue-blink" style="display:none;">
              <svg viewBox="0 0 80 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g class="eye-shape" transform-origin="22 20"><ellipse cx="22" cy="20" rx="12" ry="10" stroke="#fff" stroke-width="2.5" fill="none"/><circle class="pupil" cx="22" cy="20" r="4" fill="#fff"/></g>
                <g class="eye-shape" transform-origin="58 20"><ellipse cx="58" cy="20" rx="12" ry="10" stroke="#fff" stroke-width="2.5" fill="none"/><circle class="pupil" cx="58" cy="20" r="4" fill="#fff"/></g>
              </svg>
              <span class="cue-label">Blink</span>
            </div>

            <div id="cue-turn-right" class="cue-icon cue-turn-right" style="display:none;">
              <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="40" cy="36" r="18" stroke="#fff" stroke-width="2.5" fill="none"/>
                <line x1="40" y1="54" x2="40" y2="70" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
                <g class="arrow-path"><polyline points="56,36 70,36 64,28" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>
              </svg>
              <span class="cue-label">Turn right</span>
            </div>

            <div id="cue-turn-left" class="cue-icon cue-turn-left" style="display:none;">
              <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="40" cy="36" r="18" stroke="#fff" stroke-width="2.5" fill="none"/>
                <line x1="40" y1="54" x2="40" y2="70" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
                <g class="arrow-path"><polyline points="24,36 10,36 16,28" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>
              </svg>
              <span class="cue-label">Turn left</span>
            </div>
          </div>

          <div id="face-success" class="face-success" style="display:none;">
            <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="26" cy="26" r="24" stroke="#fff" stroke-width="2.5" fill="none"/>
              <polyline class="check-path" points="15,27 23,35 37,19" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
          </div>

          <div class="face-progress">
            <span class="progress-dot" id="dot-0"></span>
            <span class="progress-dot" id="dot-1"></span>
            <span class="progress-dot" id="dot-2"></span>
          </div>

          <div id="face-instruction" class="face-instruction">Position your face in the frame</div>
        </div>

        <small id="auto-state" class="muted">Auto-detection idle.</small>
        <button class="link inline-link" id="manual-toggle-btn" type="button">Having trouble?</button>
        <button class="secondary mobile-cta" id="step-done-btn" style="display:none;" disabled>Manual confirm step</button>
        <small id="liveness-state" class="muted">Complete all prompted actions.</small>
      </section>

      <section id="panel-recovery-codes" class="status stage mobile-step" style="display:none;">
        <strong>Save your recovery codes</strong>
        <p style="margin:8px 0;color:var(--color-muted);font-size:13px;">If you ever lose your device, these codes are the <strong>only way</strong> to recover your account. Download and store them somewhere secure.</p>
        <div id="signup-recovery-codes" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0;"></div>
        <button class="secondary" id="codes-download-btn" style="width:100%;margin:8px 0;">Download Recovery Codes</button>
        <small id="codes-download-state" class="muted" style="display:none;margin-bottom:8px;">Recovery codes downloaded.</small>
        <button class="primary" id="codes-continue-btn" disabled>Continue</button>
      </section>

      <section id="panel-approve" class="status stage mobile-step" style="display:none;">
        <strong>Step 3: Final approval</strong>
        <label>Approve this request</label>
        <div class="row">
          <button class="primary" id="approve-btn" disabled>Approve</button>
          <button class="danger" id="deny-btn">Deny</button>
        </div>
        <small class="muted">Only approve if this sign-in request is yours.</small>
      </section>

      <section id="panel-done" class="status stage mobile-step" style="display:none;">
        <strong id="done-title">Verification complete</strong>
        <small id="done-message" class="muted">You can return to your other device now.</small>
      </section>
    </div>

    <pre id="log" class="log-panel${debug ? " visible" : ""}" aria-live="polite"></pre>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/snarkjs@0.7.4/build/snarkjs.min.js"></script>
  <script src="/ui/assets/face-utils.js"></script>
  <script>
    const handoffId = ${JSON.stringify(handoffId)};
    const code = ${JSON.stringify(code)};
    const initialMode = ${JSON.stringify(initialMode)};
    const initialAccount = ${JSON.stringify(initialAccount)};
    const accountLocked = ${accountLocked ? "true" : "false"};
    const debug = ${debug ? "true" : "false"};
    const sessionUsername = ${JSON.stringify(session?.username ?? "")};

    const log = (msg) => {
      if (!debug) return;
      const el = document.getElementById('log');
      if (!el) return;
      el.textContent = msg || '';
      el.classList.toggle('visible', Boolean(msg));
    };

    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = txt;
    };
    const statusEl = document.getElementById('wizard-status');
    const chips = {
      account: document.getElementById('chip-account'),
      face: document.getElementById('chip-face'),
      approve: document.getElementById('chip-approve')
    };
    const panels = {
      account: document.getElementById('panel-account'),
      switch_account: document.getElementById('panel-switch'),
      signup: document.getElementById('panel-signup'),
      face: document.getElementById('panel-face'),
      recovery_codes: document.getElementById('panel-recovery-codes'),
      approve: document.getElementById('panel-approve'),
      done: document.getElementById('panel-done')
    };

    const lockedAccountInput = document.getElementById('locked-account');
    const accountState = document.getElementById('account-state');
    const switchAccountInput = document.getElementById('switch-account-input');
    const signupUsernameInput = document.getElementById('signup-username');
    const signupDisplayNameInput = document.getElementById('signup-display-name');
    const doneTitle = document.getElementById('done-title');
    const doneMessage = document.getElementById('done-message');
    const preview = document.getElementById('preview');
    const manualToggleBtn = document.getElementById('manual-toggle-btn');
    const manualStepBtn = document.getElementById('step-done-btn');
    const faceViewport = document.getElementById('face-viewport');
    const cueBlink = document.getElementById('cue-blink');
    const cueTurnRight = document.getElementById('cue-turn-right');
    const cueTurnLeft = document.getElementById('cue-turn-left');
    const faceSuccessEl = document.getElementById('face-success');
    const faceInstruction = document.getElementById('face-instruction');
    const progressDots = [
      document.getElementById('dot-0'),
      document.getElementById('dot-1'),
      document.getElementById('dot-2')
    ];

    let activeUsername = (initialAccount || '').trim().toLowerCase();
    let currentSessionUsername = (sessionUsername || '').trim().toLowerCase();
    let signedIn = Boolean(currentSessionUsername);
    let activePanel = '';
    let accountComplete = false;
    let faceComplete = false;
    let signupMode = initialMode === 'signup';
    let lastTrackedKey = '';

    let livenessSessionId = null;
    let challengeSequence = [];
    let pointer = 0;
    let events = [];
    let livenessResult = null;
    let identityContext = null;
    let enrollmentDraft = null;
    let signupRecoveryCodes = [];
    let proofVerificationId = null;
    let stream = null;
    let camera = null;
    let faceMesh = null;
    let detectorActive = false;
    let baselineOffset = null;
    let rightTurnSign = null;
    let blinkClosed = false;
    let lastEventAt = 0;
    let submitting = false;
    let manualVisible = false;
    let lastFaceEmbedding = null;

    const setStatus = (message, type = '') => {
      if (!statusEl) return;
      statusEl.className = 'status wait-status' + (type ? ' ' + type : '');
      statusEl.textContent = message;
    };

    const hasSessionForActiveAccount = () => {
      return Boolean(signedIn && currentSessionUsername && activeUsername && currentSessionUsername === activeUsername);
    };

    const setActiveUsername = (username) => {
      activeUsername = String(username || '').trim().toLowerCase();
      if (lockedAccountInput) lockedAccountInput.value = activeUsername;
      if (switchAccountInput) switchAccountInput.value = activeUsername;
      if (signupUsernameInput) signupUsernameInput.value = activeUsername;
    };

    const setManualVisible = (visible) => {
      manualVisible = visible;
      if (manualStepBtn) {
        manualStepBtn.style.display = manualVisible ? 'inline-flex' : 'none';
      }
      if (manualToggleBtn) {
        manualToggleBtn.textContent = manualVisible ? 'Hide manual controls' : 'Having trouble?';
      }
    };

    async function trackStep(step, status = 'viewed', detail) {
      const key = step + ':' + status;
      if (status === 'viewed' && lastTrackedKey === key) {
        return;
      }
      if (status === 'viewed') {
        lastTrackedKey = key;
      }
      try {
        await fetch('/auth/mobile/step', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            handoff_id: handoffId,
            step,
            status,
            detail: detail || undefined
          })
        });
      } catch (_error) {
        // best effort only
      }
    }

    const updateChips = () => {
      const flowStep = activePanel === 'face' ? 'face' : activePanel === 'approve' || activePanel === 'done' ? 'approve' : 'account';
      const chipAccount = chips.account;
      const chipFace = chips.face;
      const chipApprove = chips.approve;
      if (chipAccount) {
        chipAccount.classList.toggle('active', flowStep === 'account');
        chipAccount.classList.toggle('complete', accountComplete && flowStep !== 'account');
      }
      if (chipFace) {
        chipFace.classList.toggle('active', flowStep === 'face');
        chipFace.classList.toggle('complete', faceComplete && flowStep !== 'face');
      }
      if (chipApprove) {
        const approvedDone = activePanel === 'done';
        chipApprove.classList.toggle('active', flowStep === 'approve');
        chipApprove.classList.toggle('complete', approvedDone);
      }
    };

    const panelToStep = {
      account: 'account',
      switch_account: 'switch_account',
      signup: 'signup',
      face: 'face',
      recovery_codes: 'approve',
      approve: 'approve',
      done: 'done'
    };

    const showPanel = (panelName) => {
      activePanel = panelName;
      Object.entries(panels).forEach(([name, panel]) => {
        if (!panel) return;
        const isActive = name === panelName;
        panel.style.display = isActive ? 'block' : 'none';
        panel.classList.toggle('active', isActive);
      });
      updateChips();
      const step = panelToStep[panelName];
      if (step) {
        trackStep(step, 'viewed');
      }
    };

    const b64urlToBuffer = (value) => {
      const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    };

    const bufferToB64url = (buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary).split('+').join('-').split('/').join('_').replace(/=+$/, '');
    };

    const sha256Hex = ZAuthFace.sha256Hex;
    const loadFaceApiModels = ZAuthFace.loadFaceApiModels;
    const extractFaceEmbedding = ZAuthFace.extractFaceEmbedding;
    const quantizeEmbedding = ZAuthFace.quantizeEmbedding;
    const hashEmbedding = ZAuthFace.hashEmbedding;
    const uint8ToBase64 = ZAuthFace.uint8ToBase64;
    const float32ToBase64 = ZAuthFace.float32ToBase64;

    async function verifyBiometricCommitment(uid, biometricHash) {
      const resp = await fetch('/pramaan/v2/biometric/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uid, biometric_hash: biometricHash })
      });
      const data = await resp.json();
      if (!resp.ok || !data.matched) {
        throw new Error(data.reason || 'Biometric commitment verification failed');
      }
      log('Biometric commitment verified');
    }

    function canonicalize(value) {
      if (Array.isArray(value)) {
        return value.map((item) => canonicalize(item));
      }
      if (!value || typeof value !== 'object') {
        return value;
      }
      const keys = Object.keys(value).sort();
      const out = {};
      for (const key of keys) {
        out[key] = canonicalize(value[key]);
      }
      return out;
    }

    async function buildMockZkProof(uid, challengeHash, extraSignals) {
      const publicSignals = canonicalize({
        uid,
        challenge_hash: challengeHash,
        handoff_id: handoffId,
        ...extraSignals
      });
      const signalsHash = await sha256Hex(JSON.stringify(publicSignals));
      const digest = await sha256Hex(challengeHash + ':' + signalsHash + ':' + uid);
      return {
        publicSignals,
        zkProof: { digest }
      };
    }

    function hexToFieldElement(hex) {
      const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
      const bigVal = BigInt('0x' + clean);
      const BN128_MASK = (1n << 253n) - 1n;
      return (bigVal & BN128_MASK).toString();
    }

    let zkMode = 'mock';

    async function buildRealZkProof(preimageHex, challengeFieldElement) {
      if (!window.snarkjs) {
        throw new Error('snarkjs not loaded');
      }
      log('Generating real Groth16 ZK proof...');
      const preimageField = hexToFieldElement(preimageHex);
      const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(
        { preimage: preimageField, challenge: challengeFieldElement },
        '/zk/biometric_commitment.wasm',
        '/zk/circuit_final.zkey'
      );
      log('Real ZK proof generated. Commitment: ' + publicSignals[0].substring(0, 16) + '...');
      return { zkProof: proof, publicSignals };
    }

    async function buildZkProof(uid, challengeHash, challengeField, extraContext) {
      if (zkMode === 'real' && window.snarkjs && challengeField) {
        const preimageHex = lastFaceEmbedding ? lastFaceEmbedding.hash : await sha256Hex('enroll:' + activeUsername + ':' + (enrollmentDraft ? enrollmentDraft.enrollment_id : ''));
        return buildRealZkProof(preimageHex, challengeField);
      }
      return buildMockZkProof(uid, challengeHash, extraContext);
    }

    function prepareLoginOptions(options) {
      options.challenge = b64urlToBuffer(options.challenge);
      if (Array.isArray(options.allowCredentials)) {
        options.allowCredentials = options.allowCredentials.map((cred) => ({ ...cred, id: b64urlToBuffer(cred.id) }));
      }
      return options;
    }

    function prepareRegisterOptions(options) {
      options.challenge = b64urlToBuffer(options.challenge);
      options.user.id = b64urlToBuffer(options.user.id);
      if (Array.isArray(options.excludeCredentials)) {
        options.excludeCredentials = options.excludeCredentials.map((cred) => ({ ...cred, id: b64urlToBuffer(cred.id) }));
      }
      return options;
    }

    const toAuthenticationCredentialJSON = (credential) => {
      const response = credential.response;
      return {
        id: credential.id,
        rawId: bufferToB64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToB64url(response.clientDataJSON),
          authenticatorData: bufferToB64url(response.authenticatorData),
          signature: bufferToB64url(response.signature),
          userHandle: response.userHandle ? bufferToB64url(response.userHandle) : null
        }
      };
    };

    const toRegistrationCredentialJSON = (credential) => {
      const response = credential.response;
      return {
        id: credential.id,
        rawId: bufferToB64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToB64url(response.clientDataJSON),
          attestationObject: bufferToB64url(response.attestationObject),
          transports: response.getTransports ? response.getTransports() : []
        }
      };
    };

    function getDisplayName(username) {
      const raw = signupDisplayNameInput ? signupDisplayNameInput.value.trim() : '';
      if (raw) return raw;
      const localPart = username.split('@')[0] || username;
      return localPart.slice(0, 64);
    }

    function ensurePasskeySupport() {
      if (!window.PublicKeyCredential) {
        throw new Error('This browser does not support passkeys.');
      }
      if (!window.isSecureContext) {
        throw new Error('Passkeys require HTTPS. Open ' + window.location.hostname + ' on your phone using HTTPS.');
      }
    }

    async function signInWithPasskey(username) {
      const optionsResp = await fetch('/auth/webauthn/login/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (!optionsResp.ok) {
        if (optionsResp.status === 404) {
          throw new Error('account_not_found');
        }
        throw new Error('Unable to start passkey sign-in');
      }

      const options = prepareLoginOptions(await optionsResp.json());
      const credential = await navigator.credentials.get({ publicKey: options });
      if (!credential) {
        throw new Error('Passkey sign-in was cancelled.');
      }

      const verifyResp = await fetch('/auth/webauthn/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, response: toAuthenticationCredentialJSON(credential) })
      });
      const verifyData = await verifyResp.json();
      if (!verifyResp.ok || !verifyData.verified) {
        throw new Error('Phone sign-in failed.');
      }

      signedIn = true;
      currentSessionUsername = username;
      identityContext = null;
      if (accountState) {
        accountState.textContent = 'Signed in. Continue with face verification.';
      }
    }

    async function ensureIdentityContext() {
      if (identityContext?.uid) {
        return identityContext;
      }
      const response = await fetch('/pramaan/v2/identity/me');
      if (!response.ok) {
        return null;
      }
      identityContext = await response.json();
      return identityContext;
    }

    async function startV2Enrollment(loginHint) {
      const response = await fetch('/pramaan/v2/enrollment/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'default',
          login_hint: loginHint,
          request_id: handoffId
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.reason || payload.error || 'Failed to start enrollment');
      }
      enrollmentDraft = await response.json();
      return enrollmentDraft;
    }

    async function runAuthenticationProof(uid) {
      const challengeResp = await fetch('/pramaan/v2/proof/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uid, purpose: 'handoff_login' })
      });
      const challengeData = await challengeResp.json();
      if (!challengeResp.ok) {
        throw new Error(challengeData.reason || challengeData.error || 'Unable to start proof challenge');
      }

      if (challengeData.zk_mode) zkMode = challengeData.zk_mode;
      const challengeField = challengeData.challenge_field || hexToFieldElement(challengeData.challenge_hash);
      const payload = await buildZkProof(uid, challengeData.challenge_hash, challengeField, {
        purpose: 'handoff_login'
      });
      const submitBody = {
          proof_request_id: challengeData.proof_request_id,
          uid,
          zk_proof: payload.zkProof,
          public_signals: payload.publicSignals,
          handoff_id: handoffId
      };
      if (lastFaceEmbedding && lastFaceEmbedding.hash) {
        submitBody.biometric_hash = lastFaceEmbedding.hash;
      }
      const submitResp = await fetch('/pramaan/v2/proof/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submitBody)
      });
      const submitData = await submitResp.json();
      if (!submitResp.ok || !submitData.verified) {
        throw new Error(submitData.reason || submitData.error || 'ZK proof verification failed');
      }
      proofVerificationId = submitData.verification_id;
      return submitData.verification_id;
    }

    async function completeEnrollmentAfterLiveness(username) {
      if (!enrollmentDraft) {
        await startV2Enrollment(username);
      }
      const draft = enrollmentDraft;
      let hash1;
      let biometricHashPayload = null;
      if (lastFaceEmbedding && lastFaceEmbedding.hash) {
        hash1 = lastFaceEmbedding.hash;
        biometricHashPayload = lastFaceEmbedding.hash;
        log('Using biometric hash as hash1: ' + hash1.substring(0, 16) + '...');
      } else {
        hash1 = await sha256Hex('enroll:' + username + ':' + draft.enrollment_id);
        log('Face embedding not available, using fallback hash1');
      }
      const hash2 = await sha256Hex(hash1 + ':' + draft.zk_challenge);
      const commitmentRoot = await sha256Hex(
        hash1 + ':' + hash2 + ':' + draft.did_draft + ':' + draft.uid_draft + ':' + draft.circuit_id
      );
      const challengeHash = await sha256Hex(draft.uid_draft + ':' + draft.zk_challenge);
      const challengeField = hexToFieldElement(challengeHash);
      if (draft.zk_mode) zkMode = draft.zk_mode;
      const payload = await buildZkProof(draft.uid_draft, challengeHash, challengeField, {
        phase: 'enrollment',
        commitment_root: commitmentRoot
      });
      const enrollBody = {
        enrollment_id: draft.enrollment_id,
        passkey_credential_id: 'device-passkey',
        liveness_session_id: livenessSessionId,
        zk_proof: payload.zkProof,
        public_signals: payload.publicSignals,
        hash1,
        hash2,
        commitment_root: commitmentRoot
      };
      if (biometricHashPayload) {
        enrollBody.biometric_hash = biometricHashPayload;
      }
      const resp = await fetch('/pramaan/v2/enrollment/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(enrollBody)
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.reason || data.error || 'Enrollment finalize failed');
      }
      identityContext = {
        uid: data.uid,
        did: data.did,
        commitment_root: commitmentRoot
      };
      if (data.recovery_codes && data.recovery_codes.length) {
        signupRecoveryCodes = data.recovery_codes;
      }
      return identityContext;
    }

    async function createAccountOnPhone() {
      const username = activeUsername;
      if (!username) {
        setStatus('Choose an account before creating a new profile.', 'error');
        return;
      }

      try {
        ensurePasskeySupport();
        const displayName = getDisplayName(username);
        setStatus('Creating your account on this phone...');

        const optionsResp = await fetch('/auth/webauthn/register/options', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, displayName })
        });
        if (!optionsResp.ok) {
          throw new Error('Unable to start account creation.');
        }

        const options = prepareRegisterOptions(await optionsResp.json());
        const credential = await navigator.credentials.create({ publicKey: options });
        if (!credential) {
          throw new Error('Passkey registration was cancelled.');
        }

        const verifyResp = await fetch('/auth/webauthn/register/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, response: toRegistrationCredentialJSON(credential) })
        });
        const verifyData = await verifyResp.json();
        if (!verifyResp.ok || !verifyData.verified) {
          throw new Error('Passkey registration failed.');
        }

        setStatus('Account created. Signing in...');
        await signInWithPasskey(username);
        await startV2Enrollment(username);
        accountComplete = true;
        signupMode = false;
        await trackStep('signup', 'completed');
        setStatus('Account ready. Continue with face verification.');
        showPanel('face');
      } catch (error) {
        await trackStep('signup', 'error', String(error?.message || 'create_account_failed'));
        setStatus('Create account failed: ' + error.message, 'error');
      }
    }

    async function continueWithAccount() {
      const username = activeUsername;
      if (!username) {
        setStatus('Choose your account to continue.', 'error');
        showPanel('switch_account');
        return;
      }
      try {
        setStatus('Confirming account on this phone...');
        if (!hasSessionForActiveAccount()) {
          ensurePasskeySupport();
          await signInWithPasskey(username);
        }

        const identity = identityContext || (await ensureIdentityContext());
        if (!identity?.uid) {
          signupMode = true;
          if (signupUsernameInput) signupUsernameInput.value = username;
          setStatus('No account found. Create account to continue.', 'error');
          showPanel('signup');
          return;
        }

        accountComplete = true;
        await trackStep('account', 'completed');
        setStatus('Account confirmed. Continue with face verification.');
        showPanel('face');
      } catch (error) {
        const message = String(error?.message || 'Sign-in failed.');
        if (message === 'account_not_found') {
          signupMode = true;
          if (signupUsernameInput) signupUsernameInput.value = username;
          setStatus('No account found. Create account to continue.', 'error');
          showPanel('signup');
          return;
        }
        await trackStep('account', 'error', message);
        setStatus('Sign-in failed: ' + message, 'error');
      }
    }

    function distance(a, b) {
      const dx = (a.x || 0) - (b.x || 0);
      const dy = (a.y || 0) - (b.y || 0);
      return Math.sqrt(dx * dx + dy * dy);
    }

    function eyeAspectRatio(landmarks, p1, p2, p3, p4, p5, p6) {
      const A = distance(landmarks[p2], landmarks[p6]);
      const B = distance(landmarks[p3], landmarks[p5]);
      const C = distance(landmarks[p1], landmarks[p4]);
      return C > 0 ? (A + B) / (2 * C) : 0;
    }

    function getBlinkRatio(landmarks) {
      const leftEar = eyeAspectRatio(landmarks, 33, 160, 158, 133, 153, 144);
      const rightEar = eyeAspectRatio(landmarks, 362, 385, 387, 263, 373, 380);
      return (leftEar + rightEar) / 2;
    }

    function getNoseOffset(landmarks) {
      const left = landmarks[33];
      const right = landmarks[263];
      const nose = landmarks[1];
      if (!left || !right || !nose) return 0;
      const eyeMidX = (left.x + right.x) / 2;
      const eyeSpan = Math.abs(right.x - left.x) || 1e-6;
      return (nose.x - eyeMidX) / eyeSpan;
    }

    function labelForAction(action) {
      if (action === 'turn_left') return 'turn your face left';
      if (action === 'turn_right') return 'turn your face right';
      return action;
    }

    function updateOverlay() {
      if (cueBlink) cueBlink.style.display = 'none';
      if (cueTurnRight) cueTurnRight.style.display = 'none';
      if (cueTurnLeft) cueTurnLeft.style.display = 'none';

      for (let i = 0; i < progressDots.length; i++) {
        const dot = progressDots[i];
        if (!dot) continue;
        dot.className = 'progress-dot';
        if (i < pointer) dot.classList.add('done');
        else if (i === pointer) dot.classList.add('active');
      }

      if (pointer >= challengeSequence.length) {
        if (faceInstruction) faceInstruction.textContent = 'Verifying...';
        if (faceViewport) faceViewport.classList.add('completing');
        return;
      }

      const action = challengeSequence[pointer];
      if (action === 'blink' && cueBlink) cueBlink.style.display = 'flex';
      else if (action === 'turn_right' && cueTurnRight) cueTurnRight.style.display = 'flex';
      else if (action === 'turn_left' && cueTurnLeft) cueTurnLeft.style.display = 'flex';

      if (faceInstruction) {
        const lbl = action === 'turn_left' ? 'Turn left' : action === 'turn_right' ? 'Turn right' : 'Blink';
        faceInstruction.textContent = 'Step ' + (pointer + 1) + '/' + challengeSequence.length + ': ' + lbl;
      }
    }

    function showStepSuccess() {
      const el = document.getElementById('face-success');
      if (!el) return;
      el.style.display = 'none';
      void el.offsetWidth;
      el.style.display = 'flex';
      setTimeout(function() { el.style.display = 'none'; }, 700);
    }

    function stopCamera() {
      detectorActive = false;
      if (camera && typeof camera.stop === 'function') {
        camera.stop();
      }
      camera = null;
      faceMesh = null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      stream = null;
      if (faceViewport) {
        faceViewport.style.display = 'none';
      }
    }

    async function verifyLiveness() {
      if (submitting || !livenessSessionId) {
        return;
      }
      submitting = true;
      setText('liveness-state', 'Verifying liveness result...');
      setStatus('Verifying face challenge...');

      try {
        setText('liveness-state', 'Extracting biometric data...');
        const videoEl = document.getElementById('preview');
        try {
          const descriptor = await extractFaceEmbedding(videoEl);
          const quantized = quantizeEmbedding(descriptor);
          const biometricHash = await hashEmbedding(quantized);
          const embeddingBase64 = float32ToBase64(descriptor);
          lastFaceEmbedding = { quantized, hash: biometricHash, base64: embeddingBase64 };
          log('Face embedding extracted (float32), biometric ID: ' + biometricHash.substring(0, 16) + '...');
        } catch (embErr) {
          log('Embedding extraction failed: ' + embErr.message);
          lastFaceEmbedding = null;
          if (!signupMode && !enrollmentDraft) {
            throw new Error('Face embedding extraction failed — cannot verify identity. Please ensure good lighting and try again.');
          }
        }
        setText('liveness-state', 'Verifying liveness result...');

        const durationMs = events.length > 1 ? events[events.length - 1].timestamp - events[0].timestamp : 1500;
        const avgConfidence = events.length
          ? events.reduce((sum, event) => sum + (Number(event.confidence) || 0.9), 0) / events.length
          : 0.9;

        const verifyResp = await fetch('/auth/liveness/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            handoff_id: handoffId,
            liveness_session_id: livenessSessionId,
            events,
            confidence: Number(avgConfidence.toFixed(3)),
            duration_ms: durationMs
          })
        });
        const verifyData = await verifyResp.json();
        if (!verifyResp.ok || !verifyData.verified) {
          throw new Error(verifyData.reason || 'Liveness check failed');
        }

        livenessResult = verifyData;
        setText('liveness-state', 'Liveness verified. Generating proof...');

        if (signupMode || enrollmentDraft) {
          if (!activeUsername) {
            throw new Error('Username is required to complete account setup');
          }
          await completeEnrollmentAfterLiveness(activeUsername);
        }

        const identity = identityContext || (await ensureIdentityContext());
        if (!identity?.uid) {
          throw new Error('Identity not available for proof verification');
        }

        if (!signupMode && !enrollmentDraft && lastFaceEmbedding) {
          setText('liveness-state', 'Verifying biometric identity...');
          await verifyBiometricCommitment(identity.uid, lastFaceEmbedding.hash);
        }

        await runAuthenticationProof(identity.uid);
        faceComplete = true;
        await trackStep('face', 'completed');
        setStatus('Face verified. Final approval required.', 'success');
        setText('liveness-state', 'Face and proof verified. Approve sign-in to continue.');
        document.getElementById('approve-btn').disabled = false;

        if (signupRecoveryCodes.length > 0) {
          const codesGrid = document.getElementById('signup-recovery-codes');
          codesGrid.innerHTML = signupRecoveryCodes.map((c, i) =>
            '<code style="background:var(--color-code-bg);padding:6px 10px;border-radius:6px;font-size:14px;letter-spacing:0.06em;">' + (i + 1) + '. ' + c + '</code>'
          ).join('');
          document.getElementById('codes-continue-btn').disabled = true;
          document.getElementById('codes-download-state').style.display = 'none';
          showPanel('recovery_codes');
        } else {
          showPanel('approve');
        }
      } catch (error) {
        await trackStep('face', 'error', String(error?.message || 'liveness_failed'));
        setStatus('Face verification failed: ' + error.message, 'error');
        setText('liveness-state', 'Verification failed: ' + error.message);
      } finally {
        stopCamera();
        submitting = false;
      }
    }

    function recordAction(action, confidence) {
      if (!livenessSessionId || pointer >= challengeSequence.length) return;
      const expected = challengeSequence[pointer];
      if (action !== expected) return;

      const now = Date.now();
      if (now - lastEventAt < 800) return;
      lastEventAt = now;

      events.push({
        action,
        timestamp: now,
        confidence: Number((confidence || 0.9).toFixed(3))
      });
      pointer += 1;
      showStepSuccess();
      updateOverlay();

      if (pointer < challengeSequence.length) {
        const next = labelForAction(challengeSequence[pointer]);
        setText('liveness-state', 'Great. Now ' + next + '.');
      } else {
        if (manualStepBtn) manualStepBtn.disabled = true;
        verifyLiveness();
      }
    }

    function handleFaceLandmarks(landmarks) {
      if (!detectorActive || pointer >= challengeSequence.length || !Array.isArray(landmarks) || landmarks.length < 388) {
        return;
      }

      const expected = challengeSequence[pointer];
      const ear = getBlinkRatio(landmarks);
      const rawOffset = getNoseOffset(landmarks);

      if (baselineOffset === null && Math.abs(rawOffset) < 0.08) {
        baselineOffset = rawOffset;
      }
      const offset = baselineOffset === null ? rawOffset : rawOffset - baselineOffset;

      if (expected === 'blink') {
        if (ear < 0.18) {
          blinkClosed = true;
          return;
        }
        if (blinkClosed && ear > 0.23) {
          blinkClosed = false;
          const confidence = Math.max(0.78, Math.min(0.98, 1 - Math.abs(0.2 - ear)));
          recordAction('blink', confidence);
        }
        return;
      }

      const magnitude = Math.abs(offset);
      if (magnitude < 0.08) return;
      const observedSign = offset > 0 ? 1 : -1;

      if (rightTurnSign === null) {
        rightTurnSign = expected === 'turn_right' ? observedSign : -observedSign;
      }

      const expectedSign = expected === 'turn_right' ? rightTurnSign : -rightTurnSign;
      if (observedSign !== expectedSign) return;

      const confidence = Math.max(0.76, Math.min(0.97, 0.72 + magnitude));
      recordAction(expected, confidence);
    }

    async function startFaceDetection(videoElement) {
      if (!window.FaceMesh || !window.Camera) {
        setText('auto-state', 'Auto detection unavailable on this browser. Use manual mode.');
        return;
      }

      faceMesh = new window.FaceMesh({
        locateFile: (file) => 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + file
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
      faceMesh.onResults((results) => {
        const faces = results.multiFaceLandmarks || [];
        if (!faces.length) {
          setText('auto-state', 'Face not detected. Keep your face centered.');
          return;
        }
        setText('auto-state', 'Face detected. Performing auto checks.');
        handleFaceLandmarks(faces[0]);
      });

      camera = new window.Camera(videoElement, {
        onFrame: async () => {
          if (faceMesh && detectorActive) {
            await faceMesh.send({ image: videoElement });
          }
        },
        width: 640,
        height: 480
      });
      detectorActive = true;
      await camera.start();
      stream = videoElement.srcObject || stream;
      setText('auto-state', 'Auto detection is active.');
    }

    async function startLiveness() {
      try {
        if (!hasSessionForActiveAccount()) {
          setStatus('Confirm your account in Step 1 first.', 'error');
          showPanel('account');
          return;
        }
        setStatus('Preparing face challenge...');
        showPanel('face');
        document.getElementById('approve-btn').disabled = true;

        const challengeResp = await fetch('/auth/liveness/challenge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ handoff_id: handoffId })
        });
        const challengeData = await challengeResp.json();
        if (!challengeResp.ok) throw new Error(challengeData.error || 'Unable to start liveness');

        livenessSessionId = challengeData.liveness_session_id;
        challengeSequence = Array.isArray(challengeData.sequence) ? challengeData.sequence : [];
        pointer = 0;
        events = [];
        livenessResult = null;
        proofVerificationId = null;
        baselineOffset = null;
        rightTurnSign = null;
        blinkClosed = false;
        lastEventAt = 0;

        setText('challenge-seq', 'Do this sequence: ' + challengeSequence.join(' -> '));
        setText('liveness-state', 'Start with: ' + labelForAction(challengeSequence[pointer]) + '.');
        if (manualStepBtn) manualStepBtn.disabled = false;
        setManualVisible(false);

        stopCamera();
        if (faceViewport) {
          faceViewport.style.display = 'block';
          faceViewport.classList.remove('completing');
        }
        updateOverlay();

        try {
          await startFaceDetection(preview);
        } catch (_error) {
          setText('auto-state', 'Auto detection failed. Manual mode enabled.');
        }

        loadFaceApiModels().catch(function(err) {
          log('Face recognition model preload failed: ' + err.message);
        });

        if (!detectorActive) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          if (preview) {
            preview.srcObject = stream;
          }
          setManualVisible(true);
          setText('auto-state', 'Manual mode active. Perform action then confirm.');
        }
        setStatus('Complete the face challenge.');
      } catch (error) {
        await trackStep('face', 'error', String(error?.message || 'liveness_setup_failed'));
        setStatus('Liveness setup failed: ' + error.message, 'error');
        stopCamera();
      }
    }

    async function completeStep() {
      if (!livenessSessionId || pointer >= challengeSequence.length) {
        return;
      }
      const action = challengeSequence[pointer];
      recordAction(action, 0.88);
    }

    async function approve() {
      try {
        if (!hasSessionForActiveAccount()) throw new Error('Phone sign-in required');
        if (!livenessSessionId || !livenessResult?.verified) throw new Error('Complete liveness challenge first');

        const resp = await fetch('/auth/handoff/approve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code,
            liveness_session_id: livenessSessionId,
            liveness_result: livenessResult,
            proof_verification_id: proofVerificationId || undefined,
            passkey_assertion: 'session-bound'
          })
        });
        const data = await resp.json();
        if (!resp.ok || !data.approved) throw new Error(data.error || 'Approval failed');

        await trackStep('approve', 'completed');
        setStatus('Approved. Return to your desktop to continue.', 'success');
        if (doneTitle) doneTitle.textContent = 'Approved';
        if (doneMessage) doneMessage.textContent = 'This sign-in is verified. You can return to your other device.';
        showPanel('done');
        log('Approval complete for handoff: ' + data.handoff_id);
      } catch (error) {
        await trackStep('approve', 'error', String(error?.message || 'approve_failed'));
        setStatus('Approve failed: ' + error.message, 'error');
        log('Approve error: ' + error.message);
      }
    }

    async function deny() {
      try {
        await fetch('/auth/handoff/deny', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code })
        });
        stopCamera();
        if (doneTitle) doneTitle.textContent = 'Request denied';
        if (doneMessage) doneMessage.textContent = 'This sign-in request was denied on phone.';
        setStatus('Request denied on this phone.', 'error');
        showPanel('done');
      } catch (error) {
        log('Deny error: ' + error.message);
      }
    }

    async function loadHandoffContext() {
      try {
        const resp = await fetch('/auth/handoff/context?handoff_id=' + encodeURIComponent(handoffId) + '&code=' + encodeURIComponent(code));
        const data = await resp.json();
        if (resp.status === 410 || data.status === 'expired') {
          setStatus('This verification request expired. Scan a new QR code.', 'error');
          if (doneTitle) doneTitle.textContent = 'Request expired';
          if (doneMessage) doneMessage.textContent = 'Scan a new QR code from desktop to continue.';
          showPanel('done');
          return false;
        }
        if (!resp.ok) {
          setStatus('This verification link is invalid.', 'error');
          if (doneTitle) doneTitle.textContent = 'Invalid request';
          if (doneMessage) doneMessage.textContent = 'Open a fresh QR link from desktop.';
          showPanel('done');
          return false;
        }

        if (data.login_hint && accountLocked) {
          setActiveUsername(data.login_hint);
        }

        if (data.status === 'denied') {
          setStatus('This request was denied.', 'error');
          if (doneTitle) doneTitle.textContent = 'Request denied';
          if (doneMessage) doneMessage.textContent = 'Start a new sign-in request from desktop.';
          showPanel('done');
          return false;
        }
        if (data.status === 'consumed') {
          setStatus('This request was already completed.', 'success');
          if (doneTitle) doneTitle.textContent = 'Already completed';
          if (doneMessage) doneMessage.textContent = 'This sign-in was already consumed.';
          showPanel('done');
          return false;
        }
        if (data.status === 'approved') {
          setStatus('This request is already approved.', 'success');
          if (doneTitle) doneTitle.textContent = 'Already approved';
          if (doneMessage) doneMessage.textContent = 'Return to desktop to continue.';
          showPanel('done');
          return false;
        }

        return true;
      } catch (_error) {
        setStatus('Unable to load request context. Check your connection.', 'error');
        return false;
      }
    }

    document.getElementById('account-continue-btn').onclick = continueWithAccount;
    document.getElementById('switch-account-link').onclick = () => {
      if (switchAccountInput) {
        switchAccountInput.value = activeUsername;
      }
      showPanel('switch_account');
    };
    document.getElementById('switch-account-cancel-btn').onclick = () => showPanel('account');
    document.getElementById('switch-account-continue-btn').onclick = async () => {
      const nextUsername = (switchAccountInput?.value || '').trim().toLowerCase();
      if (!nextUsername) {
        setStatus('Enter an email or username to continue.', 'error');
        return;
      }
      setActiveUsername(nextUsername);
      identityContext = null;
      enrollmentDraft = null;
      proofVerificationId = null;
      currentSessionUsername = '';
      signedIn = false;
      showPanel('account');
      setStatus('Account updated. Continue to verify.');
    };
    document.getElementById('signup-create-btn').onclick = createAccountOnPhone;
    document.getElementById('signup-back-btn').onclick = () => showPanel('account');
    document.getElementById('start-liveness-btn').onclick = startLiveness;
    document.getElementById('step-done-btn').onclick = completeStep;
    document.getElementById('approve-btn').onclick = approve;
    document.getElementById('deny-btn').onclick = deny;
    document.getElementById('codes-download-btn').onclick = () => {
      if (!signupRecoveryCodes.length) return;
      const text = 'Z Auth Recovery Codes\\n' +
        'Generated: ' + new Date().toISOString() + '\\n' +
        'Username: ' + (activeUsername || 'unknown') + '\\n\\n' +
        signupRecoveryCodes.map((c, i) => (i + 1) + '. ' + c).join('\\n') +
        '\\n\\nKeep these codes safe. Each code can only be used once.';
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zauth-recovery-codes.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      document.getElementById('codes-download-state').style.display = 'block';
      document.getElementById('codes-continue-btn').disabled = false;
    };
    document.getElementById('codes-continue-btn').onclick = () => {
      showPanel('approve');
    };
    if (manualToggleBtn) {
      manualToggleBtn.onclick = () => setManualVisible(!manualVisible);
    }
    window.addEventListener('beforeunload', stopCamera);

    setActiveUsername(activeUsername);
    setManualVisible(false);
    if (signupMode) {
      if (!activeUsername) {
        showPanel('switch_account');
        setStatus('Choose your account to create a profile.');
      } else {
        showPanel('signup');
        setStatus('Create your account to continue.');
      }
    } else {
      showPanel(activeUsername ? 'account' : 'switch_account');
      if (activeUsername) {
        setStatus('Confirm this account on your phone.');
      } else {
        setStatus('Choose your account to continue.');
      }
    }

    if (hasSessionForActiveAccount() && accountState) {
      accountState.textContent = 'Already signed in on this phone. Continue.';
    }

    loadHandoffContext();
  </script>
  `;

  res.type("html").send(layout("Z Auth Phone Approval", body));
});
uiRouter.get("/ui/passkey", (req, res) => {
  const requestId = String(req.query.request_id || "");
  const mode = String(req.query.mode || "signin").toLowerCase() === "signup" ? "signup" : "signin";
  const body = `
  <div class="card wide compact">
    <div class="card-shell passkey-shell">
      <section class="intro passkey-intro">
        ${brandLockup()}
        <h1>Try another way</h1>
        <h2 id="passkey-intro-subtitle">Use passkey directly on this device.</h2>
        <div id="passkey-intro-helper" class="helper-line">This fallback keeps access available if phone handoff is not possible.</div>
      </section>
      <section class="stack passkey-column">
        <input type="hidden" id="passkey-mode" value="${mode}" />
        <small class="passkey-header">Use this secure fallback when phone verification is unavailable.</small>
        <div class="passkey-switch" role="tablist" aria-label="Passkey action">
          <button id="tab-signin" class="passkey-tab" type="button" role="tab" aria-controls="signin-panel">Sign in</button>
          <button id="tab-signup" class="passkey-tab" type="button" role="tab" aria-controls="signup-panel">Create account</button>
        </div>

        <div id="signin-panel" class="status stage passkey-panel" role="tabpanel" aria-labelledby="tab-signin">
          <div class="passkey-panel-head">
            <span class="passkey-step-index">1</span>
            <span class="passkey-panel-title">Sign in with your passkey</span>
          </div>
          <div class="helper-line passkey-panel-note">Use the same account that was previously enrolled.</div>
          <input id="login-username" autocomplete="username" placeholder="founder@geturstyle.shop" />
          <button class="primary" id="login-btn">Sign in with passkey</button>
        </div>

        <div id="signup-panel" class="status stage passkey-panel" role="tabpanel" aria-labelledby="tab-signup">
          <div class="passkey-panel-head">
            <span class="passkey-step-index">1</span>
            <span class="passkey-panel-title">Create account with passkey</span>
          </div>
          <div class="helper-line passkey-panel-note">Register a new passkey on this device for fast future sign-ins.</div>
          <input id="register-username" autocomplete="username" placeholder="founder@geturstyle.shop" />
          <input id="register-display" placeholder="Display name" />
          <button class="primary" id="register-btn">Create account with passkey</button>
        </div>

        <div class="actions tight">
          <a class="link passkey-back-link" href="/ui/login${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}">Back to phone verification</a>
          <a class="link" href="/ui/recovery${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}">Lost your device?</a>
        </div>
      </section>
    </div>

    <pre id="log" class="log-panel" aria-live="polite"></pre>
  </div>

  <script>
  ${passkeyClientLogic(requestId)}
  </script>
  `;

  res.type("html").send(layout("Z Auth Passkey", body));
});

// ── Account Recovery ──────────────────────────────────────────────

uiRouter.get("/ui/recovery", (req, res) => {
  const requestId = String(req.query.request_id || "");
  const body = `
  <div class="card wide">
    <div class="card-shell">
      <section class="intro">
        ${brandLockup()}
        <h1>Account recovery</h1>
        <h2>Lost your device? Prove it's you to regain access.</h2>
        <div class="helper-line">You'll need your recovery code <strong>and</strong> your face to verify your identity.</div>
      </section>
      <section class="stack">
        <!-- Step 1: Recovery code -->
        <div id="step-code">
          <div class="passkey-panel-head" style="margin-bottom:12px;">
            <span class="passkey-step-index">1</span>
            <span class="passkey-panel-title">Enter recovery code</span>
          </div>
          <label for="recovery-username">Username or email</label>
          <input id="recovery-username" autocomplete="username" placeholder="founder@geturstyle.shop" />
          <label for="recovery-code">Recovery code</label>
          <input id="recovery-code" autocomplete="off" placeholder="ABCD123456" style="text-transform:uppercase; letter-spacing:0.08em; font-family:var(--font-body); font-size:18px;" />
          <div style="margin-top:16px;">
            <button class="primary" id="recovery-btn" type="button">Verify code</button>
          </div>
        </div>

        <!-- Step 2: Face verification (hidden until code verified) -->
        <div id="step-face" style="display:none;">
          <div class="passkey-panel-head" style="margin-bottom:12px;">
            <span class="passkey-step-index">2</span>
            <span class="passkey-panel-title">Verify your face</span>
          </div>
          <div class="helper-line">Look at the camera. We'll automatically scan and match your face.</div>

          <div id="recovery-face-viewport" class="face-viewport" style="margin:12px auto 0;">
            <video id="face-video" autoplay playsinline muted></video>
            <div class="face-frame">
              <svg class="face-frame-ring" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="100" cy="100" r="90" stroke="rgba(255,255,255,0.35)" stroke-width="2.5" stroke-dasharray="8 4" fill="none"/>
              </svg>
            </div>
            <div class="face-success" style="display:none;">
              <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="26" cy="26" r="24" fill="rgba(46,160,67,0.45)"/>
                <path class="check-path" d="M15 27 L23 35 L37 19" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
            </div>
            <div class="face-failure" style="display:none;">
              <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="26" cy="26" r="24" fill="rgba(220,53,69,0.45)"/>
                <path class="x-path" d="M18 18 L34 34" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>
                <path class="x-path" d="M34 18 L18 34" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>
              </svg>
            </div>
          </div>

          <div id="scan-status" class="scan-status">Preparing camera...</div>
          <button class="link" id="try-another-btn" type="button" style="display:none;margin:12px auto 0;text-align:center;width:100%;">Try another way</button>
        </div>

        <!-- Step 2b: Multi-code fallback (shown only if face doesn't match) -->
        <div id="step-multicode" style="display:none;">
          <div class="passkey-panel-head" style="margin-bottom:12px;">
            <span class="passkey-step-index" style="background:var(--color-danger);color:white;">!</span>
            <span class="passkey-panel-title">Face didn't match</span>
          </div>
          <div class="helper-line">Your appearance may have changed. Enter <strong>3 different recovery codes</strong> to verify your identity without biometric.</div>
          <label for="multi-code-1">Recovery code 1</label>
          <input id="multi-code-1" autocomplete="off" placeholder="Code 1" style="text-transform:uppercase; letter-spacing:0.08em; font-size:16px;" />
          <label for="multi-code-2">Recovery code 2</label>
          <input id="multi-code-2" autocomplete="off" placeholder="Code 2" style="text-transform:uppercase; letter-spacing:0.08em; font-size:16px;" />
          <label for="multi-code-3">Recovery code 3</label>
          <input id="multi-code-3" autocomplete="off" placeholder="Code 3" style="text-transform:uppercase; letter-spacing:0.08em; font-size:16px;" />
          <div style="margin-top:16px;">
            <button class="primary" id="multicode-btn" type="button">Verify with codes</button>
          </div>
        </div>

        <div id="recovery-status" class="status" style="display:none"></div>
        <div class="actions tight" style="margin-top:16px;">
          <a class="link" href="/ui/login${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}">Back to sign in</a>
          <span></span>
        </div>
      </section>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
  <script src="/ui/assets/face-utils.js"></script>
  <script>
    const statusEl = document.getElementById('recovery-status');
    const scanStatusEl = document.getElementById('scan-status');
    const viewport = document.getElementById('recovery-face-viewport');
    const tryAnotherBtn = document.getElementById('try-another-btn');

    const setStatus = (message, isError = false) => {
      statusEl.style.display = 'block';
      statusEl.className = 'status' + (isError ? ' error' : '');
      statusEl.textContent = message;
    };
    const setScanStatus = (text, cls) => {
      scanStatusEl.textContent = text;
      scanStatusEl.className = 'scan-status' + (cls ? ' ' + cls : '');
    };

    let recoveryToken = null;
    let videoStream = null;

    // ── Auto-retry constants ──
    const MAX_ATTEMPTS = 12;
    const MAX_SERVER_MISMATCHES = 3;
    const SCAN_INTERVAL_MS = 1500;
    let scanActive = false;
    let attempts = 0;
    let mismatches = 0;

    // Step 1: Verify recovery code
    document.getElementById('recovery-btn').onclick = async () => {
      const username = document.getElementById('recovery-username').value.trim();
      const code = document.getElementById('recovery-code').value.trim();
      if (!username || !code) {
        setStatus('Please enter both your username and a recovery code.', true);
        return;
      }

      setStatus('Verifying recovery code...');
      try {
        const resp = await fetch('/auth/recovery/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, recovery_code: code })
        });
        const data = await resp.json();
        if (!resp.ok || !data.verified) {
          const reasons = {
            user_not_found: 'No account found with that username.',
            invalid_code: 'Invalid recovery code. Please check and try again.',
            code_already_used: 'This recovery code has already been used.'
          };
          setStatus(reasons[data.reason] || 'Recovery verification failed.', true);
          return;
        }
        recoveryToken = data.recovery_token;
        setStatus('Recovery code verified. Starting face scan...');

        // Fade out step 1, show step 2
        document.getElementById('step-code').style.opacity = '0.4';
        document.getElementById('step-code').style.pointerEvents = 'none';
        document.getElementById('step-face').style.display = 'block';

        // Start camera + auto-scan
        try {
          const video = document.getElementById('face-video');
          videoStream = await ZAuthFace.startCameraStream(video);
          setScanStatus('Loading face recognition...');
          await ZAuthFace.loadFaceApiModels();
          startAutoScan();
        } catch (err) {
          setScanStatus('Camera access denied.', 'error');
          setStatus('Please allow camera access and reload to try again.', true);
        }
      } catch (error) {
        setStatus('Connection error. Please try again.', true);
      }
    };

    // ── Auto-scan state machine ──
    function startAutoScan() {
      scanActive = true;
      attempts = 0;
      mismatches = 0;
      viewport.classList.add('scanning');
      viewport.classList.remove('completing', 'failed');
      runScanLoop();
    }

    async function runScanLoop() {
      if (!scanActive) return;

      attempts++;
      if (attempts > MAX_ATTEMPTS || mismatches >= MAX_SERVER_MISMATCHES) {
        onAllFailed();
        return;
      }

      setScanStatus('Scanning... attempt ' + attempts + '/' + MAX_ATTEMPTS);

      try {
        const video = document.getElementById('face-video');
        const descriptor = await ZAuthFace.extractFaceEmbedding(video);

        // Face detected — verify with server
        setScanStatus('Verifying identity...');
        const biometricHash = await ZAuthFace.computeBiometricHash(descriptor);
        const resp = await fetch('/auth/recovery/biometric', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ recovery_token: recoveryToken, biometric_hash: biometricHash })
        });
        const data = await resp.json();

        if (resp.ok && data.verified) {
          onScanSuccess(data);
          return;
        }

        // Server mismatch
        if (data.reason === 'face_mismatch') {
          mismatches++;
          ZAuthFace.showFailureOverlay('recovery-face-viewport');
          setScanStatus('Face did not match (' + mismatches + '/' + MAX_SERVER_MISMATCHES + '). Retrying...', 'error');
        } else {
          const reasons = {
            recovery_token_expired: 'Recovery session expired. Please start over.',
            no_enrolled_identity: 'No biometric identity found for this account.'
          };
          scanActive = false;
          viewport.classList.remove('scanning');
          setStatus(reasons[data.reason] || 'Verification failed.', true);
          setScanStatus('Scan stopped.', 'error');
          return;
        }
      } catch (err) {
        // No face detected — keep scanning
        setScanStatus('No face detected. Keep your face centered. (' + attempts + '/' + MAX_ATTEMPTS + ')');
      }

      // Check limits again after this attempt
      if (attempts >= MAX_ATTEMPTS || mismatches >= MAX_SERVER_MISMATCHES) {
        onAllFailed();
        return;
      }

      // Schedule next scan
      setTimeout(runScanLoop, SCAN_INTERVAL_MS);
    }

    function onScanSuccess(data) {
      scanActive = false;
      viewport.classList.remove('scanning');
      viewport.classList.add('completing');
      ZAuthFace.showSuccessOverlay('recovery-face-viewport');
      setScanStatus('Identity verified!', 'success');
      setStatus('Identity verified! Redirecting to re-enrollment...');

      setTimeout(() => {
        ZAuthFace.stopCameraStream(videoStream);
        window.location.href = data.redirectTo || '/ui/recovery/enroll';
      }, 1200);
    }

    function onAllFailed() {
      scanActive = false;
      viewport.classList.remove('scanning');
      viewport.classList.add('failed');
      ZAuthFace.stopCameraStream(videoStream);

      const msg = mismatches >= MAX_SERVER_MISMATCHES
        ? 'Face did not match after ' + mismatches + ' attempts.'
        : 'Could not verify your face after ' + MAX_ATTEMPTS + ' attempts.';
      setScanStatus(msg, 'error');
      setStatus('Face verification unsuccessful.');
      tryAnotherBtn.style.display = 'block';
    }

    // ── "Try another way" → slide to multi-code ──
    tryAnotherBtn.onclick = () => {
      const stepFace = document.getElementById('step-face');
      const stepMulti = document.getElementById('step-multicode');

      stepFace.classList.add('recovery-step-exit');
      stepFace.addEventListener('animationend', function handler() {
        stepFace.removeEventListener('animationend', handler);
        stepFace.style.display = 'none';
        stepFace.classList.remove('recovery-step-exit');
        stepMulti.style.display = 'block';
        stepMulti.classList.add('recovery-step-enter');
        stepMulti.addEventListener('animationend', function h2() {
          stepMulti.removeEventListener('animationend', h2);
          stepMulti.classList.remove('recovery-step-enter');
        });
      });
      setStatus('Enter 3 different recovery codes to verify your identity.');
    };

    // Step 2b: Multi-code fallback
    document.getElementById('multicode-btn').onclick = async () => {
      const code1 = document.getElementById('multi-code-1').value.trim();
      const code2 = document.getElementById('multi-code-2').value.trim();
      const code3 = document.getElementById('multi-code-3').value.trim();
      if (!code1 || !code2 || !code3) {
        setStatus('Please enter all 3 recovery codes.', true);
        return;
      }
      if (!recoveryToken) {
        setStatus('Recovery session expired. Please start over.', true);
        return;
      }

      setStatus('Verifying recovery codes...');
      try {
        const resp = await fetch('/auth/recovery/multi-code', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ recovery_token: recoveryToken, recovery_codes: [code1, code2, code3] })
        });
        const data = await resp.json();
        if (!resp.ok || !data.verified) {
          setStatus(data.message || 'Multi-code verification failed.', true);
          return;
        }

        setStatus('Identity verified! Redirecting to re-enrollment...');
        window.location.href = data.redirectTo || '/ui/recovery/enroll';
      } catch (error) {
        setStatus('Connection error. Please try again.', true);
      }
    };
  </script>
  `;

  res.type("html").send(layout("Z Auth Recovery", body));
});

uiRouter.get("/ui/recovery/enroll", async (req, res) => {
  const sid = req.cookies.zauth_sid as string | undefined;
  const session = await getSession(sid);
  if (!session) {
    res.redirect("/ui/recovery");
    return;
  }

  const body = `
  <div class="card wide">
    <div class="card-shell">
      <section class="intro">
        ${brandLockup()}
        <h1>Re-enroll your identity</h1>
        <h2>Set up your new device to verify it's&nbsp;you.</h2>
        <div class="helper-line">
          You'll register a new passkey on this device and then complete biometric enrollment to restore full access.
        </div>
        <div class="account-pill">
          <span class="account-dot"></span>
          <span>${escapeHtml(session.username)}</span>
        </div>
      </section>
      <section class="stack">
        <div id="step-passkey" class="status stage active">
          <div class="passkey-panel-head">
            <span class="passkey-step-index">1</span>
            <span class="passkey-panel-title">Register a new passkey</span>
          </div>
          <div class="helper-line">Create a passkey on your new device for secure sign-in.</div>
          <button class="primary" id="register-passkey-btn" type="button">Register passkey</button>
        </div>

        <div id="step-enroll" class="status stage" style="display:none">
          <div class="passkey-panel-head">
            <span class="passkey-step-index">2</span>
            <span class="passkey-panel-title">Biometric enrollment</span>
          </div>
          <div class="helper-line">Complete face verification and zero-knowledge proof to restore your identity.</div>
          <div id="enroll-face-viewport" class="face-viewport" style="margin:12px auto 0;">
            <video id="face-video" autoplay playsinline muted></video>
            <div class="face-frame">
              <svg class="face-frame-ring" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="100" cy="100" r="90" stroke="rgba(255,255,255,0.35)" stroke-width="2.5" stroke-dasharray="8 4" fill="none"/>
              </svg>
            </div>
            <div class="face-success" style="display:none;">
              <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="26" cy="26" r="24" fill="rgba(46,160,67,0.45)"/>
                <path class="check-path" d="M15 27 L23 35 L37 19" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
            </div>
          </div>
          <div id="enroll-scan-status" class="scan-status">Waiting for passkey registration...</div>
          <button class="primary" id="capture-face-btn" type="button">Capture face & generate proof</button>
        </div>

        <div id="step-done" class="status stage" style="display:none">
          <div class="passkey-panel-head">
            <span class="passkey-step-index">3</span>
            <span class="passkey-panel-title">Recovery complete</span>
          </div>
          <div class="helper-line">Your identity has been re-established. Save your new recovery codes.</div>
          <div id="new-recovery-codes" style="margin:12px 0;"></div>
          <button class="primary" id="done-btn" type="button">Continue to sign in</button>
        </div>

        <div id="recovery-status" class="status" style="display:none"></div>
      </section>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@10/dist/bundle/index.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
  <script src="/ui/assets/face-utils.js"></script>
  <script>
    const username = ${JSON.stringify(session.username)};
    const subjectId = ${JSON.stringify(session.subjectId)};
    const statusEl = document.getElementById('recovery-status');
    const enrollScanStatus = document.getElementById('enroll-scan-status');
    let recoveryMethod = 'biometric';
    const sha256Hex = ZAuthFace.sha256Hex;

    const setStatus = (message, isError = false) => {
      statusEl.style.display = 'block';
      statusEl.className = 'status' + (isError ? ' error' : '');
      statusEl.textContent = message;
    };
    const setEnrollScan = (text, cls) => {
      enrollScanStatus.textContent = text;
      enrollScanStatus.className = 'scan-status' + (cls ? ' ' + cls : '');
    };

    // Check how this session was recovered
    (async () => {
      try {
        const resp = await fetch('/auth/recovery/method');
        const data = await resp.json();
        recoveryMethod = data.method || 'biometric';
      } catch {}
    })();

    // Step 1: Register passkey
    let videoStream = null;
    document.getElementById('register-passkey-btn').onclick = async () => {
      try {
        setStatus('Starting passkey registration...');
        const optResp = await fetch('/auth/webauthn/register/options', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username })
        });
        const options = await optResp.json();
        if (!optResp.ok) throw new Error(options.error || 'Failed to get registration options');

        const credential = await SimpleWebAuthnBrowser.startRegistration(options);

        const verifyResp = await fetch('/auth/webauthn/register/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, response: credential })
        });
        const verifyData = await verifyResp.json();
        if (!verifyData.verified) throw new Error('Passkey registration failed');

        setStatus('Passkey registered. Now capture your face for biometric enrollment.');
        document.getElementById('step-passkey').style.opacity = '0.5';
        document.getElementById('step-enroll').style.display = 'block';

        try {
          const video = document.getElementById('face-video');
          videoStream = await ZAuthFace.startCameraStream(video);
          setEnrollScan('Camera ready. Click the button below to capture.');
        } catch {
          setStatus('Camera access denied. Please allow camera access.', true);
          setEnrollScan('Camera denied.', 'error');
        }
      } catch (error) {
        setStatus(error.message || 'Passkey registration failed.', true);
      }
    };

    // Step 2: Capture face + ZK proof + enrollment
    document.getElementById('capture-face-btn').onclick = async () => {
      const viewport = document.getElementById('enroll-face-viewport');
      try {
        setEnrollScan('Loading face recognition...');
        viewport.classList.add('scanning');
        await ZAuthFace.loadFaceApiModels();

        setEnrollScan('Detecting face...');
        const video = document.getElementById('face-video');
        const descriptor = await ZAuthFace.extractFaceEmbedding(video);
        const quantized = ZAuthFace.quantizeEmbedding(descriptor);
        const biometricHash = await ZAuthFace.computeBiometricHash(descriptor);

        viewport.classList.remove('scanning');
        viewport.classList.add('completing');
        ZAuthFace.showSuccessOverlay('enroll-face-viewport');
        setEnrollScan('Face captured!', 'success');
        setStatus('Starting Pramaan V2 enrollment...');

        // 1. Start enrollment
        const enrollStartResp = await fetch('/pramaan/v2/enrollment/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenant_id: 'default' })
        });
        const enrollStart = await enrollStartResp.json();
        if (!enrollStartResp.ok) throw new Error(enrollStart.error || 'Enrollment start failed');

        setStatus('Generating zero-knowledge proof...');

        // 2. Compute hashes
        const hash1 = await sha256Hex(quantized);
        const hash2Str = hash1 + ':' + enrollStart.zk_challenge;
        const hash2 = await sha256Hex(new TextEncoder().encode(hash2Str));
        const commitmentRootStr = hash1 + ':' + hash2 + ':' + enrollStart.did_draft + ':' + enrollStart.uid_draft + ':' + enrollStart.circuit_id;
        const commitmentRoot = await sha256Hex(new TextEncoder().encode(commitmentRootStr));

        // 3. Compute ZK proof inputs
        const challengeHashStr = enrollStart.uid_draft + ':' + enrollStart.zk_challenge;
        const challengeHash = await sha256Hex(new TextEncoder().encode(challengeHashStr));

        let zkProof, publicSignals;
        if (enrollStart.zk_mode === 'real') {
          setStatus('Computing Groth16 ZK proof (this may take a moment)...');
          const biometricIdInt = BigInt('0x' + hash1) & ((1n << 253n) - 1n);
          const challengeFieldInt = BigInt('0x' + challengeHash) & ((1n << 253n) - 1n);
          const snarkjs = await import('https://cdn.jsdelivr.net/npm/snarkjs@0.7.4/+esm');
          const { proof, publicSignals: ps } = await snarkjs.groth16.fullProve(
            { biometricId: biometricIdInt.toString(), challengeHash: challengeFieldInt.toString() },
            '/zk/biometric_commitment.wasm',
            '/zk/biometric_commitment_final.zkey'
          );
          zkProof = proof;
          publicSignals = ps;
        } else {
          // Build mock proof matching server's computeMockProofDigest
          function canonicalize(value) {
            if (Array.isArray(value)) return value.map(v => canonicalize(v));
            if (!value || typeof value !== 'object') return value;
            const out = {};
            for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
            return out;
          }
          publicSignals = canonicalize({
            uid: enrollStart.uid_draft,
            challenge_hash: challengeHash
          });
          const signalsHash = await sha256Hex(JSON.stringify(publicSignals));
          const digest = await sha256Hex(challengeHash + ':' + signalsHash + ':' + enrollStart.uid_draft);
          zkProof = { digest };
        }

        setStatus('Submitting enrollment...');

        // Recovery context: liveness already proven via face match, use a placeholder session ID
        const livenessSessionId = 'recovery_liveness_' + Date.now();

        // 5. Complete enrollment
        const skipCodeRegen = recoveryMethod === 'multi_code';
        const enrollBody = {
          enrollment_id: enrollStart.enrollment_id,
          passkey_credential_id: 'recovery_cred',
          liveness_session_id: livenessSessionId,
          zk_proof: zkProof,
          public_signals: publicSignals,
          hash1,
          hash2,
          commitment_root: commitmentRoot,
          biometric_hash: biometricHash
        };
        if (skipCodeRegen) enrollBody.skip_recovery_code_regen = true;
        const completeResp = await fetch('/pramaan/v2/enrollment/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(enrollBody)
        });
        const completeData = await completeResp.json();
        if (!completeResp.ok) throw new Error(completeData.reason || completeData.error || 'Enrollment failed');

        // Stop camera
        ZAuthFace.stopCameraStream(videoStream);

        document.getElementById('step-enroll').style.opacity = '0.5';
        document.getElementById('step-done').style.display = 'block';

        const codesDiv = document.getElementById('new-recovery-codes');
        if (skipCodeRegen) {
          // Multi-code recovery: no new codes issued
          setStatus('Recovery complete. Your remaining recovery codes are still valid.');
          codesDiv.innerHTML = '<p style="color:var(--color-danger);font-weight:500;">No new recovery codes were issued because face verification was skipped.</p>' +
            '<p style="color:var(--color-muted);margin-top:6px;">Your remaining unused codes are still valid. To get fresh codes, sign in with the full biometric flow and re-enroll.</p>';
        } else if (completeData.recovery_codes && completeData.recovery_codes.length) {
          setStatus('Recovery complete! Save your new recovery codes.');
          codesDiv.innerHTML = '<p style="color:var(--color-text);font-weight:500;margin-bottom:8px;">New recovery codes (save these securely):</p>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' +
            completeData.recovery_codes.map(c => '<code style="background:var(--color-code-bg);padding:6px 10px;border-radius:6px;font-size:14px;letter-spacing:0.06em;">' + c + '</code>').join('') +
            '</div>';
        } else {
          setStatus('Recovery complete.');
        }
      } catch (error) {
        setStatus(error.message || 'Enrollment failed.', true);
      }
    };

    // Step 3: Done - redirect to login
    document.getElementById('done-btn').onclick = () => {
      window.location.href = '/ui/login';
    };
  </script>
  `;

  res.type("html").send(layout("Z Auth Recovery Enrollment", body));
});

uiRouter.get("/ui/consent", async (req, res) => {
  const requestId = String(req.query.request_id || "");
  if (!requestId) {
    res.status(400).type("html").send(layout("Invalid Request", `<div class="card"><h1>Invalid request</h1><h2>Missing request ID.</h2></div>`));
    return;
  }

  const authRequest = await getAuthRequest(requestId);
  if (!authRequest) {
    res
      .status(400)
      .type("html")
      .send(layout("Expired Request", `<div class="card"><h1>Request expired</h1><h2>Please sign in again.</h2></div>`));
    return;
  }

  const sid = req.cookies.zauth_sid as string | undefined;
  const session = await getSession(sid);
  if (!session) {
    res.redirect(`/ui/login?request_id=${encodeURIComponent(requestId)}`);
    return;
  }

  const client = await getClient(authRequest.clientId);
  const scopes = authRequest.scope.split(/\s+/).filter(Boolean);

  const body = `
  <div class="card wide">
    <div class="card-shell">
      <section class="intro">
        ${brandLockup()}
        <h1>${escapeHtml(client?.client_id ?? authRequest.clientId)} wants access</h1>
        <h2>Continue as ${escapeHtml(session.username)}</h2>
        <div class="helper-line">Review permissions before granting access.</div>
      </section>
      <section>
        <div class="status stage active">
          <strong>Requested permissions</strong>
          <ul class="scope-list">
            ${scopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join("")}
          </ul>
        </div>

        <form method="post" action="/oauth2/consent">
          <input type="hidden" name="request_id" value="${escapeHtml(requestId)}" />
          <div class="actions">
            <button class="secondary" name="decision" value="deny" type="submit">Cancel</button>
            <button class="primary" name="decision" value="allow" type="submit">Continue</button>
          </div>
        </form>

        <form method="post" action="/auth/logout">
          <div class="actions tight"><button class="link" type="submit">Use another account</button><span></span></div>
        </form>
      </section>
    </div>
  </div>`;

  res.type("html").send(layout("Z Auth Consent", body));
});

uiRouter.post("/auth/logout", async (req, res) => {
  const sid = req.cookies.zauth_sid as string | undefined;
  if (sid) {
    await deleteSession(sid);
  }

  clearSessionCookie(res);
  const requestId = req.query.request_id;
  if (requestId) {
    res.redirect(`/ui/login?request_id=${encodeURIComponent(String(requestId))}`);
    return;
  }
  res.redirect("/ui/login");
});
