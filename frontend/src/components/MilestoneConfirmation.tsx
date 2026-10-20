import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { confirmMilestone } from "../lib/stellar";
import { errorMessage, isBuyer, shortHash, statusLabel, type ShipmentActionProps } from "./shared";

export function MilestoneConfirmation({ wallet, shipment, onUpdated, onError, onNotice }: ShipmentActionProps) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const buyer = isBuyer(wallet, shipment);

  async function handleConfirm(index: number) {
    if (!wallet) return;
    setConfirming(index);
    onError("");
    onNotice("");
    try {
      const hash = await confirmMilestone(wallet, shipment.id, index);
      onNotice(`Milestone ${index + 1} confirmed · ${shortHash(hash)}`);
      await onUpdated();
    } catch (cause) {
      onError(errorMessage(cause, "Milestone confirmation failed."));
    } finally {
      setConfirming(null);
    }
  }

  return (
    <section className="panel workflow-panel" aria-label="Milestones">
      <div className="panel-heading">
        <div><div className="section-kicker">ESCROW RELEASE</div><h2>Milestones</h2></div>
        {buyer && <span className="chain-badge"><span />BUYER VIEW</span>}
      </div>
      {shipment.milestones.length ? <ul className="milestone-list">{shipment.milestones.map((milestone, index) => (
        <li className="milestone-row" key={`${milestone.name}-${index}`}>
          <span className="milestone-copy"><strong>{index + 1}. {milestone.name}</strong><small>{milestone.payment_percent}% of escrow</small></span>
          <span className={`status-pill ${milestone.status.toLowerCase()}`}><span />{statusLabel(milestone.status)}</span>
          {buyer && milestone.status === "ProofSubmitted" && (
            <button className="primary-button" disabled={confirming !== null} onClick={() => handleConfirm(index)}>
              {confirming === index ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{confirming === index ? "Signing" : "Confirm"}
            </button>
          )}
        </li>
      ))}</ul> : <div className="workflow-empty">This shipment has no milestones.</div>}
    </section>
  );
}
