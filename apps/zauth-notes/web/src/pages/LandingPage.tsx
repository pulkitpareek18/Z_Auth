import { useEffect, useRef } from "react";

type LandingPageProps = {
  loginUrl: string;
  authError?: string;
  authMessage?: string;
};

/* ---- Reusable logo ---- */
function ZNotesLogo({ compact }: { compact?: boolean }) {
  return (
    <div className={`znotes-logo${compact ? " compact" : ""}`} aria-label="Z Notes">
      <span className="znotes-logo-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="znotesGrad" x1="3" y1="2.5" x2="21" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#4285F4" />
              <stop offset="1" stopColor="#0B57D0" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#znotesGrad)" />
          <path d="M7.25 7.75H16.75L7.25 16.25H16.75" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="znotes-logo-text">Z Notes</span>
    </div>
  );
}

/* ---- Inline SVG icons ---- */
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconFace() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2" />
      <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2" />
    </svg>
  );
}

function IconZK() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconDevices() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconPatent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 2v4" />
      <path d="M17 2v4" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  );
}

function IconBlockchain() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="9" height="9" rx="1.5" />
      <rect x="14" y="1" width="9" height="9" rx="1.5" />
      <rect x="1" y="14" width="9" height="9" rx="1.5" />
      <rect x="14" y="14" width="9" height="9" rx="1.5" />
      <path d="M10 5.5h4" />
      <path d="M5.5 10v4" />
      <path d="M18.5 10v4" />
      <path d="M10 18.5h4" />
    </svg>
  );
}

/* ---- Main landing page ---- */
export function LandingPage({ loginUrl, authError, authMessage }: LandingPageProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        }
      },
      { threshold: 0.08 }
    );
    const targets = document.querySelectorAll(".fade-in-section");
    targets.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <main className="landing-page">
      {/* ===== Navigation ===== */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-left">
            <ZNotesLogo />
            <span className="nav-powered-badge">Powered by Z Auth</span>
          </div>
          <div className="landing-nav-links">
            <a href="#features">Features</a>
            <a href="#security">Security</a>
            <a href="#how-it-works">How It Works</a>
          </div>
          <a className="btn btn-primary landing-nav-cta" href={loginUrl}>
            Sign In
          </a>
        </div>
      </nav>

      {/* ===== Hero ===== */}
      <section className="landing-hero-section">
        <div className="landing-hero-inner">
          <div className="landing-hero-content">
            <div className="hero-badge-row">
              <span className="hero-badge">
                <IconPatent />
                Indian Patent Granted
              </span>
              <span className="hero-badge hero-badge-secondary">
                <IconShield />
                Zero-Knowledge Auth
              </span>
            </div>
            <h1>
              Your thoughts deserve{" "}
              <span className="gradient-text">zero-knowledge</span>{" "}
              protection.
            </h1>
            <p className="lead">
              A focused notes app secured by patented biometric authentication.
              Your face verifies your identity through cryptographic proofs &mdash;
              no biometric data ever leaves your&nbsp;device.
            </p>
            <div className="hero-cta-row">
              <a className="btn btn-primary landing-hero-cta" href={loginUrl}>
                Get Started Free
                <IconArrowRight />
              </a>
              <a className="btn btn-secondary landing-hero-cta-alt" href="#how-it-works">
                See How It Works
              </a>
            </div>
            <p className="hero-trust-line">
              No passwords &middot; No data leaks &middot; Patented technology
            </p>
            {authError ? (
              <div className="alert-card" role="alert">
                <strong>Sign-in could not be completed.</strong>
                <p>{authMessage || authError}</p>
              </div>
            ) : null}
          </div>

          <aside className="landing-hero-visual" aria-label="App preview">
            <div className="hero-visual-wrapper">
              <div className="preview-window">
                <div className="preview-window-head">
                  <span className="preview-dot" />
                  <span className="preview-dot" />
                  <span className="preview-dot" />
                  <p>Z Notes</p>
                </div>
                <div className="preview-layout">
                  <div className="preview-list">
                    <article className="preview-note is-active">
                      <h3>Product Launch Plan</h3>
                      <p>Finalize messaging, coordinate with design team on assets.</p>
                      <div>
                        <span>work</span>
                        <span>launch</span>
                      </div>
                    </article>
                    <article className="preview-note">
                      <h3>Weekly Reflection</h3>
                      <p>Three things that went well this week.</p>
                      <div>
                        <span>personal</span>
                      </div>
                    </article>
                    <article className="preview-note">
                      <h3>API Design Notes</h3>
                      <p>RESTful patterns for the new auth service.</p>
                      <div>
                        <span>dev</span>
                        <span>api</span>
                      </div>
                    </article>
                  </div>
                  <div className="preview-editor">
                    <h4>Product Launch Plan</h4>
                    <p>1. Finalize landing page copy by Thursday.</p>
                    <p>2. Review analytics dashboard with the team.</p>
                    <p>3. Send preview link to early-access users.</p>
                    <p>4. Coordinate social media announcements.</p>
                  </div>
                </div>
              </div>
              <div className="hero-shield-badge" aria-hidden="true">
                <IconShield />
                <span>ZK Protected</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* ===== Tech Strip ===== */}
      <section className="landing-tech-section fade-in-section">
        <div className="landing-tech-inner">
          <p className="tech-strip-label">Built with industry-leading security standards</p>
          <div className="tech-strip">
            <div className="tech-item">
              <IconKey />
              <span>WebAuthn / FIDO2</span>
            </div>
            <div className="tech-item">
              <IconZK />
              <span>Groth16 ZK Proofs</span>
            </div>
            <div className="tech-item">
              <IconBlockchain />
              <span>Polygon Blockchain</span>
            </div>
            <div className="tech-item">
              <IconShield />
              <span>OpenID Connect</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== How It Works ===== */}
      <section className="landing-how-section fade-in-section" id="how-it-works">
        <div className="landing-how-inner">
          <div className="section-header">
            <span className="section-label">How It Works</span>
            <h2>Three steps. Zero exposure.</h2>
            <p>Sign in with your face in seconds. Your biometric data never touches our servers.</p>
          </div>
          <div className="how-steps">
            <div className="how-step">
              <div className="how-step-number">1</div>
              <div className="how-step-icon"><IconFace /></div>
              <h3>Scan your face</h3>
              <p>Your device camera captures and matches your face entirely on-device. The raw image is never transmitted.</p>
            </div>
            <div className="how-connector" aria-hidden="true">
              <svg viewBox="0 0 60 8" preserveAspectRatio="none">
                <path d="M0 4 L60 4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
                <polygon points="54,1 60,4 54,7" fill="currentColor" />
              </svg>
            </div>
            <div className="how-step">
              <div className="how-step-number">2</div>
              <div className="how-step-icon"><IconZK /></div>
              <h3>Generate ZK proof</h3>
              <p>A Groth16 zero-knowledge proof cryptographically binds your identity to the session challenge &mdash; without revealing any biometric data.</p>
            </div>
            <div className="how-connector" aria-hidden="true">
              <svg viewBox="0 0 60 8" preserveAspectRatio="none">
                <path d="M0 4 L60 4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
                <polygon points="54,1 60,4 54,7" fill="currentColor" />
              </svg>
            </div>
            <div className="how-step">
              <div className="how-step-number">3</div>
              <div className="how-step-icon"><IconShield /></div>
              <h3>Access granted</h3>
              <p>The server verifies the proof and issues signed OIDC tokens. Your notes are unlocked &mdash; your identity stays private.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section className="landing-features-section fade-in-section" id="features">
        <div className="landing-features-inner">
          <div className="section-header">
            <span className="section-label">Features</span>
            <h2>Everything you need, nothing you don't</h2>
            <p>A distraction-free workspace designed for speed and clarity.</p>
          </div>
          <div className="features-grid">
            <article className="feature-card">
              <div className="feature-icon"><IconEdit /></div>
              <h3>Instant capture</h3>
              <p>Start writing immediately. No folders to navigate, no templates to choose. Just open and type.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon"><IconTag /></div>
              <h3>Smart tags</h3>
              <p>Organize notes with flexible tags. Filter and find instantly without rigid folder hierarchies.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon"><IconSearch /></div>
              <h3>Full-text search</h3>
              <p>Find any note in milliseconds. Search across titles, content, and tags simultaneously.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon"><IconDevices /></div>
              <h3>Any device, anywhere</h3>
              <p>Your notes follow you. Sign in from any browser and pick up right where you left off.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ===== Security Deep-Dive ===== */}
      <section className="landing-security-section fade-in-section" id="security">
        <div className="landing-security-inner">
          <div className="section-header section-header-light">
            <span className="section-label section-label-light">Security</span>
            <h2>Security that's not just a checkbox</h2>
            <p>Zero-knowledge biometric authentication verifies your identity without exposing your data.</p>
          </div>

          {/* Row 1: ZK Proofs */}
          <div className="security-row">
            <div className="security-text">
              <h3>Zero-Knowledge Biometric Proofs</h3>
              <p>
                Your face embedding is processed entirely on your device. A Groth16 circuit generates a
                cryptographic proof that binds your identity to a server-issued challenge &mdash; the server
                verifies the proof without ever seeing the biometric&nbsp;data.
              </p>
              <ul className="security-checklist">
                <li>Poseidon hash commitment binding</li>
                <li>Client-side face matching via face-api.js</li>
                <li>SHA-256 irreversible biometric hash</li>
              </ul>
            </div>
            <div className="security-visual">
              <div className="security-flow-card">
                <div className="flow-node">
                  <IconFace />
                  <span>Your Device</span>
                </div>
                <div className="flow-arrow" aria-hidden="true">
                  <span className="flow-arrow-label">ZK proof only</span>
                  <svg viewBox="0 0 80 8" preserveAspectRatio="none"><path d="M0 4 L80 4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" /><polygon points="74,1 80,4 74,7" fill="currentColor" /></svg>
                </div>
                <div className="flow-node">
                  <IconShield />
                  <span>Z Auth Server</span>
                </div>
              </div>
              <div className="security-data-table">
                <div className="data-table-col data-sent">
                  <h4>What's sent</h4>
                  <ul>
                    <li>ZK proof + public signals</li>
                    <li>SHA-256 biometric hash</li>
                    <li>Passkey assertion</li>
                  </ul>
                </div>
                <div className="data-table-col data-not-sent">
                  <h4>What's NOT sent</h4>
                  <ul>
                    <li>Face images or video</li>
                    <li>Biometric templates</li>
                    <li>Passwords or secrets</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Passkeys */}
          <div className="security-row security-row-reverse">
            <div className="security-text">
              <h3>No Passwords, Ever</h3>
              <p>
                Z Auth uses WebAuthn FIDO2 discoverable credentials (passkeys) stored in your device's
                secure enclave. There are no passwords to steal, no phishing vectors, no server-side
                secrets to&nbsp;breach.
              </p>
              <ul className="security-checklist">
                <li>FIDO2 discoverable credentials</li>
                <li>Hardware-backed secure enclave</li>
                <li>Phishing-resistant by design</li>
              </ul>
            </div>
            <div className="security-visual">
              <div className="passkey-visual-card">
                <div className="passkey-visual-icon">
                  <IconKey />
                </div>
                <div className="passkey-visual-info">
                  <strong>Passkey Authentication</strong>
                  <span>Secured by your device's hardware enclave</span>
                  <div className="passkey-visual-bar">
                    <div className="passkey-visual-bar-fill" />
                  </div>
                  <span className="passkey-visual-status">Authentication Level: AAL2 (ZK Biometric)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Patent & Trust ===== */}
      <section className="landing-patent-section fade-in-section">
        <div className="landing-patent-inner">
          <div className="patent-card">
            <div className="patent-icon">
              <IconPatent />
            </div>
            <div className="patent-content">
              <h3>Patented Technology</h3>
              <p className="patent-detail">
                <strong>Indian Patent Granted</strong> &mdash; Application No. 202311041001
              </p>
              <p className="patent-detail">
                <strong>US Patent Filed</strong>
              </p>
              <p className="patent-title">
                A system for performing person identification using biometric data
                and zero-knowledge proof in a decentralized network
              </p>
              <p className="patent-applicant">
                Yushu Excellence Technologies Private Limited
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Bottom CTA ===== */}
      <section className="landing-bottom-cta-section fade-in-section">
        <div className="landing-bottom-cta-inner">
          <h2>Start taking notes the&nbsp;secure&nbsp;way</h2>
          <p>Get started in under 20 seconds. No passwords. No biometric data stored on any server.</p>
          <a className="btn btn-primary landing-hero-cta" href={loginUrl}>
            Get Started Free
            <IconArrowRight />
          </a>
          <p className="cta-fine-print">
            Free &middot; No credit card &middot; Works on any device
          </p>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-col footer-col-brand">
            <ZNotesLogo compact />
            <p>Privacy-first notes, protected by zero-knowledge biometric authentication.</p>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#security">Security</a>
            <a href="#how-it-works">How It Works</a>
          </div>
          <div className="footer-col">
            <h4>Platform</h4>
            <a href="https://auth.geturstyle.shop" target="_blank" rel="noopener noreferrer">Z Auth</a>
            <a href="https://github.com/pulkitpareek18/Z_Auth" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://auth.geturstyle.shop/.well-known/openid-configuration" target="_blank" rel="noopener noreferrer">OIDC Discovery</a>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <p>&copy; {new Date().getFullYear()} Z Notes &middot; Powered by <a href="https://auth.geturstyle.shop" target="_blank" rel="noopener noreferrer">Z Auth</a></p>
        </div>
      </footer>
    </main>
  );
}
