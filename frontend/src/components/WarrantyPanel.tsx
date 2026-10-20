import { useState } from "react";
import { Check, LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { WarrantyState } from "../lib/stellar";

type WarrantyPanelProps = {
  warranty: WarrantyState;
  shipmentStatus: string;
  isBuyer: boolean;
  isArbiter: boolean;
  busy: boolean;
  onFile: (evidence: string) => Promise<boolean>;
  onResolve: (refundBuyer: boolean) => Promise<boolean>;
};

function amount(value: string) {
  try {
    return new Intl.NumberFormat("en-US").format(BigInt(value));
  } catch {
    return value;
  }
}

export function WarrantyPanel({ warranty, shipmentStatus, isBuyer, isArbiter, busy, onFile, onResolve }: WarrantyPanelProps) {
  const [evidence, setEvidence] = useState("");
  const hasHoldback = warranty.balance !== "0";
  const canFile = isBuyer && shipmentStatus === "Completed" && hasHoldback && !warranty.claim;

  if (!hasHoldback && !warranty.claim && !warranty.resolution) return null;

  async function handleFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidence.trim()) return;
    if (await onFile(evidence.trim())) setEvidence("");
  }

  const claimStatus = warranty.claim ? "Open" : warranty.resolution ? "Resolved" : "None";

  return (
    <div className="sub-panel warranty-panel" aria-label="Warranty claim">
      <div className="sub-panel-heading"><ShieldCheck size={15} /><strong>Warranty</strong>
        <span className={`status-pill ${warranty.claim ? "disputed" : warranty.resolution ? "completed" : ""}`}><span />Claim: {claimStatus}</span>
      </div>
      <div className="detail-grid compact-grid">
        <div><span>HOLDBACK</span><strong>{amount(warranty.balance)} <small>units</small></strong></div>
        <div><span>PERIOD ENDS</span><strong>{warranty.endsAt ? `L${warranty.endsAt.toLocaleString()}` : "Not started"}</strong></div>
        {warranty.claim && <div><span>FILED AT</span><strong>L{warranty.claim.filed_ledger.toLocaleString()}</strong></div>}
        {warranty.resolution && <div><span>OUTCOME</span><strong>{warranty.resolution.outcome === "buyer" ? "Refunded to buyer" : "Dismissed · supplier keeps holdback"}</strong></div>}
      </div>
      {warranty.claim && <p className="form-hint">Evidence <code>{warranty.claim.evidence_hash.slice(0, 16)}…</code> is awaiting the arbiter's decision.</p>}
      {canFile && <form className="action-form" onSubmit={handleFile} aria-label="File warranty claim">
        <textarea aria-label="Warranty evidence" placeholder="Describe the defect or paste a 64-char evidence hash" value={evidence} onChange={(event) => setEvidence(event.target.value)} required />
        <button className="primary-button" disabled={busy || !evidence.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}{busy ? "Signing" : "File claim"}</button>
      </form>}
      {isArbiter && warranty.claim && <div className="resolution-actions" aria-label="Resolve warranty claim">
        <button className="primary-button" disabled={busy} onClick={() => onResolve(true)}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Refund buyer</button>
        <button className="filter-button" disabled={busy} onClick={() => onResolve(false)}><X size={14} />Dismiss claim</button>
      </div>}
    </div>
  );
}
