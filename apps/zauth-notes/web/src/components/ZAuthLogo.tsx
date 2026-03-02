type ZAuthLogoProps = {
  compact?: boolean;
};

export function ZAuthLogo({ compact = false }: ZAuthLogoProps) {
  return (
    <div className={`z-logo-lockup${compact ? " is-compact" : ""}`} aria-label="Z Auth">
      <span className="z-logo-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Z Auth logo">
          <defs>
            <linearGradient id="zauthLogoGradientNotes" x1="3" y1="2.5" x2="21" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#4285F4" />
              <stop offset="1" stopColor="#0B57D0" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#zauthLogoGradientNotes)" />
          <path d="M7.25 7.75H16.75L7.25 16.25H16.75" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="z-logo-text">Z Auth</span>
    </div>
  );
}
