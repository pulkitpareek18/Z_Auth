import { ZAuthLogo } from "../components/ZAuthLogo";

type LandingPageProps = {
  loginUrl: string;
  authError?: string;
  authMessage?: string;
};

export function LandingPage({ loginUrl, authError, authMessage }: LandingPageProps) {
  return (
    <main className="screen">
      <section className="shell landing-shell">
        <header className="landing-header">
          <div className="landing-brand">
            <ZAuthLogo compact />
            <span className="landing-brand-name">Z Notes</span>
          </div>
          <a className="btn btn-primary landing-cta" href={loginUrl}>
            Continue with Z Auth
          </a>
        </header>

        <div className="landing-hero">
          <section className="landing-copy">
            <span className="hero-badge">Professional Notes Workspace</span>
            <h1>Capture ideas, plans, and meeting notes in one secure place.</h1>
            <p className="lead">
              Z Notes gives you a focused writing surface, fast search, and reliable organization while keeping sign-in
              secured through Z Auth phone verification.
            </p>
            <p className="landing-subline">Use the top-right button to continue with secure sign-in.</p>
            <ul className="metric-row">
              <li>
                <strong>&lt; 20s</strong>
                <span>Returning login</span>
              </li>
              <li>
                <strong>PKCE</strong>
                <span>OAuth code flow</span>
              </li>
              <li>
                <strong>ACR/AMR</strong>
                <span>Visible assurance context</span>
              </li>
            </ul>
            {authError ? (
              <div className="alert-card" role="alert">
                <strong>Secure sign-in could not be completed.</strong>
                <p>{authMessage || authError}</p>
              </div>
            ) : null}
          </section>

          <aside className="landing-preview" aria-label="Notes app preview">
            <div className="preview-window">
              <div className="preview-window-head">
                <span className="preview-dot" />
                <span className="preview-dot" />
                <span className="preview-dot" />
                <p>Today</p>
              </div>
              <div className="preview-layout">
                <div className="preview-list">
                  <article className="preview-note is-active">
                    <h3>Hackathon Demo Script</h3>
                    <p>Open with product value, then run phone-first login in under 20 seconds.</p>
                    <div>
                      <span>demo</span>
                      <span>zauth</span>
                    </div>
                  </article>
                  <article className="preview-note">
                    <h3>Security Talking Points</h3>
                    <p>Explain assurance levels and why OAuth tokens stay server-side.</p>
                    <div>
                      <span>security</span>
                    </div>
                  </article>
                </div>
                <div className="preview-editor">
                  <h4>Sprint Planning</h4>
                  <p>1. Finalize UI polish and landing copy.</p>
                  <p>2. Rehearse end-to-end sign-in from desktop and mobile.</p>
                  <p>3. Demo note creation, update, and assurance badge.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="landing-grid">
          <article className="trust-card">
            <h2>Trust context shown to users and judges</h2>
            <ul className="trust-list">
              <li>
                <strong>Phone-first verification:</strong> OAuth login starts at Z Auth and resumes here only after
                approval.
              </li>
              <li>
                <strong>Assurance transparency:</strong> ACR, AMR, UID, and DID are displayed inside the product.
              </li>
              <li>
                <strong>No token leakage:</strong> OAuth tokens stay server-side. Browser stores only notes session.
              </li>
            </ul>
          </article>

          <article className="feature-card">
            <h2>Built for real usage, not just a callback demo</h2>
            <ul className="feature-list">
              <li>Create, edit, search, and tag personal notes.</li>
              <li>Fast desktop and mobile layouts with system dark and light mode.</li>
              <li>CSRF-protected CRUD APIs with clear session boundaries.</li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
