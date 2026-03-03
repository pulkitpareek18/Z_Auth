import { useEffect, useRef } from "react";
import { ZAuthLogo } from "../components/ZAuthLogo";

type LandingPageProps = {
  loginUrl: string;
  authError?: string;
  authMessage?: string;
};

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
      { threshold: 0.12 }
    );
    const targets = document.querySelectorAll(".fade-in-section");
    targets.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <main className="landing-page">
      {/* Sticky nav */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <ZAuthLogo compact />
            <span className="landing-brand-name">Z Notes</span>
          </div>
          <a className="btn btn-primary landing-nav-cta" href={loginUrl}>
            Get Started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero-section">
        <div className="landing-hero-inner">
          <div className="landing-hero-content">
            <span className="hero-badge">Secure by default</span>
            <h1>Your notes, protected by&nbsp;who&nbsp;you&nbsp;are.</h1>
            <p className="lead">
              A focused writing space with fast search, tags, and effortless
              organization&mdash;secured by biometric authentication so only you
              can access your&nbsp;notes.
            </p>
            <a className="btn btn-primary landing-hero-cta" href={loginUrl}>
              Get Started with Z&nbsp;Auth
              <span aria-hidden="true">&rarr;</span>
            </a>
            {authError ? (
              <div className="alert-card" role="alert">
                <strong>Sign-in could not be completed.</strong>
                <p>{authMessage || authError}</p>
              </div>
            ) : null}
          </div>
          <aside className="landing-hero-visual" aria-label="App preview">
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
                    <p>Finalize messaging, coordinate with design team on assets, schedule social posts.</p>
                    <div>
                      <span>work</span>
                      <span>launch</span>
                    </div>
                  </article>
                  <article className="preview-note">
                    <h3>Weekly Reflection</h3>
                    <p>Three things that went well this week and one area to improve next sprint.</p>
                    <div>
                      <span>personal</span>
                    </div>
                  </article>
                </div>
                <div className="preview-editor">
                  <h4>Product Launch Plan</h4>
                  <p>1. Finalize landing page copy by Thursday.</p>
                  <p>2. Review analytics dashboard with the team.</p>
                  <p>3. Send preview link to early-access users.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Metrics strip */}
      <section className="landing-metrics-section fade-in-section">
        <div className="landing-metrics-inner">
          <ul className="metric-row">
            <li>
              <strong>&lt; 20s</strong>
              <span>Sign-in time</span>
            </li>
            <li>
              <strong>Zero</strong>
              <span>Passwords to remember</span>
            </li>
            <li>
              <strong>E2E</strong>
              <span>Encrypted sessions</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features-section fade-in-section">
        <div className="landing-features-inner">
          <div className="section-header">
            <h2>Everything you need to capture your thinking</h2>
            <p>A distraction-free workspace designed for speed and clarity.</p>
          </div>
          <div className="features-grid">
            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">&#9998;</div>
              <h3>Quick capture</h3>
              <p>Start writing immediately. No folders to navigate, no templates to choose. Just open and type.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">#</div>
              <h3>Organize with tags</h3>
              <p>Add tags to any note and filter instantly. Keep your workspace tidy without rigid folder structures.</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">&#8981;</div>
              <h3>Search everything</h3>
              <p>Find any note in milliseconds. Full-text search across titles, content, and tags.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="landing-security-section fade-in-section">
        <div className="landing-security-inner">
          <div className="section-header">
            <h2>Security that stays out of your way</h2>
            <p>Z Auth uses zero-knowledge biometric authentication&mdash;your identity is verified without exposing your data.</p>
          </div>
          <div className="trust-grid">
            <article className="trust-point">
              <div className="trust-icon" aria-hidden="true">&#9673;</div>
              <h3>Biometric sign-in</h3>
              <p>Authenticate with your face from your phone. No passwords, no codes, no friction.</p>
            </article>
            <article className="trust-point">
              <div className="trust-icon" aria-hidden="true">&#9726;</div>
              <h3>Zero-knowledge proofs</h3>
              <p>Your biometric data never leaves your device. We verify your identity without seeing it.</p>
            </article>
            <article className="trust-point">
              <div className="trust-icon" aria-hidden="true">&#9670;</div>
              <h3>Private by design</h3>
              <p>Session tokens stay server-side. Your notes are tied to your identity, not a guessable password.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="landing-bottom-cta-section fade-in-section">
        <div className="landing-bottom-cta-inner">
          <h2>Ready to take notes the&nbsp;secure&nbsp;way?</h2>
          <p>Get started in under 20 seconds. No passwords required.</p>
          <a className="btn btn-primary landing-hero-cta" href={loginUrl}>
            Get Started with Z&nbsp;Auth
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-brand">
            <ZAuthLogo compact />
            <span className="landing-brand-name">Z Notes</span>
          </div>
          <p>Secured by Z Auth &middot; &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </main>
  );
}
