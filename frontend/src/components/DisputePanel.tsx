import { useState } from "react";
import { Check, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { resolveDispute, type ShipmentDetail, type Wallet } from "../lib/stellar";
import { errorMessage } from "../lib/format";

type Props = {
  wallet: Wallet | null;
  shipment: ShipmentDetail;
  onStart: () => void;
  onResolved: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
};

export function DisputePanel({ wallet, shipment, onStart, onResolved, onError }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const disputes = shipment.milestones.filter((milestone) => milestone.status === "Disputed");
  const isArbiter = !!wallet && wallet.address === shipment.arbiter;

  async function handleResolve(milestoneIndex: number, approve: boolean) {
    if (!wallet || !isArbiter) return;
    setPending(`${milestoneIndex}:${approve}`);
    onStart();
    try {
      const hash = await resolveDispute(wallet, shipment.id, milestoneIndex, approve);
      await onResolved(`Dispute on milestone ${milestoneIndex + 1} ${approve ? "approved" : "rejected"} · ${hash.slice(0, 12)}…`);
    } catch (cause) {
      onError(errorMessage(cause, "Dispute resolution failed."));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="action-block">
      <div className="action-block-head"><strong>Active disputes</strong><small>Arbiter</small></div>
      {disputes.length ? <ul className="dispute-list" aria-label="Active disputes">{disputes.map((milestone) => {
        const busy = pending !== null && pending.startsWith(`${milestone.index}:`);
        return <li className="dispute-row" key={milestone.index}>
          <span className="event-mark"><ShieldCheck size={14} /></span>
          <span className="event-copy"><strong>{milestone.name}</strong><small>Milestone {milestone.index + 1}{milestone.proof_hash ? ` · ${milestone.proof_hash}` : ""}</small></span>
          <span className="dispute-actions">
            <button className="primary-button" aria-label={`Approve milestone ${milestone.index + 1}`} disabled={!isArbiter || pending !== null} onClick={() => handleResolve(milestone.index, true)}>{busy && pending?.endsWith("true") ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Approve</button>
            <button className="secondary-button" aria-label={`Reject milestone ${milestone.index + 1}`} disabled={!isArbiter || pending !== null} onClick={() => handleResolve(milestone.index, false)}>{busy && pending?.endsWith("false") ? <LoaderCircle className="spin" size={14} /> : <X size={14} />}Reject</button>
          </span>
        </li>;
      })}</ul> : <p className="action-hint">No active disputes on this shipment.</p>}
      {disputes.length > 0 && !isArbiter && <p className="action-hint">Only the shipment's arbiter can resolve disputes.</p>}
    </div>
  );
}
