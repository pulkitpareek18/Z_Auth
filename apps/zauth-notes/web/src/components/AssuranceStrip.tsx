import type { AssuranceViewModel } from "../types";

function maskIdentifier(value: string | undefined): string {
  if (!value) {
    return "Unavailable";
  }
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

type AssuranceStripProps = {
  assurance: AssuranceViewModel;
};

export function AssuranceStrip({ assurance }: AssuranceStripProps) {
  const amr = assurance.amr.length ? assurance.amr.join(" + ") : "Unavailable";
  return (
    <section className="assurance-strip" aria-label="Z Auth assurance context">
      <div className="assurance-pill">{assurance.badge_label}</div>
      <div className="assurance-grid">
        <div className="assurance-cell">
          <span className="assurance-label">Assurance</span>
          <strong>{assurance.acr}</strong>
        </div>
        <div className="assurance-cell">
          <span className="assurance-label">Methods</span>
          <strong>{amr}</strong>
        </div>
        <div className="assurance-cell">
          <span className="assurance-label">UID</span>
          <strong title={assurance.uid}>{maskIdentifier(assurance.uid)}</strong>
        </div>
        <div className="assurance-cell">
          <span className="assurance-label">DID</span>
          <strong title={assurance.did}>{maskIdentifier(assurance.did)}</strong>
        </div>
      </div>
    </section>
  );
}
