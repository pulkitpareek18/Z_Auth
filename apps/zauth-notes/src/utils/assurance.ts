export function acrRank(acr: string): number {
  if (acr === "urn:zauth:aal2:zk") {
    return 2;
  }
  return 1;
}

export function assuranceBadgeLabel(acr: string): string {
  return acr === "urn:zauth:aal2:zk" ? "Verified by ZK + Phone" : "Passkey verified";
}
