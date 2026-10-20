/** Splits contract enum names like `ProofSubmitted` into "Proof submitted". */
export function statusLabel(status: string) {
  const words = status.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status.toLowerCase()}`}><span />{statusLabel(status)}</span>;
}
