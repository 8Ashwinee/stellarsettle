import { useState } from "react";
import { Ban, LoaderCircle } from "lucide-react";
import { cancelShipment, cancellationRefund, type ShipmentDetail, type Wallet } from "../lib/stellar";
import { amount, errorMessage } from "../lib/format";

type Props = {
  wallet: Wallet | null;
  shipment: ShipmentDetail;
  onStart: () => void;
  onCancelled: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
};

export function CancelShipmentForm({ wallet, shipment, onStart, onCancelled, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (shipment.status === "Cancelled") {
    return (
      <div className="action-block cancelled-block">
        <div className="action-block-head"><strong>Shipment cancelled</strong><small>Refund</small></div>
        <p className="refund-line">Refunded <strong>{amount(cancellationRefund(shipment))}</strong> units to the buyer.</p>
      </div>
    );
  }

  const isBuyer = !!wallet && shipment.buyers.includes(wallet.address);
  const hasDispute = shipment.milestones.some((milestone) => milestone.status === "Disputed");
  const enabled = isBuyer && shipment.status === "Active" && !hasDispute;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !enabled) return;
    setSubmitting(true);
    onStart();
    try {
      const hash = await cancelShipment(wallet, shipment.id, reason);
      setReason("");
      setOpen(false);
      await onCancelled(`Shipment ${shipment.id} cancelled · ${hash.slice(0, 12)}…`);
    } catch (cause) {
      onError(errorMessage(cause, "Cancellation failed."));
    } finally {
      setSubmitting(false);
    }
  }

  let hint = "";
  if (!isBuyer) hint = "Only the shipment's buyer can cancel it.";
  else if (shipment.status !== "Active") hint = "Only active shipments can be cancelled.";
  else if (hasDispute) hint = "Resolve open disputes before cancelling.";

  return (
    <div className="action-block">
      <div className="action-block-head"><strong>Cancel shipment</strong><small>Buyer</small></div>
      {open && enabled ? <form className="cancel-form" onSubmit={handleSubmit} aria-label="Cancel shipment">
        <input aria-label="Cancellation reason" placeholder="Reason (optional, recorded on-chain)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={256} disabled={submitting} />
        <button className="danger-button" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={15} /> : <Ban size={15} />}{submitting ? "Signing" : "Sign & cancel"}</button>
        <button type="button" className="text-button" onClick={() => setOpen(false)} disabled={submitting}>Keep shipment</button>
      </form> : <button className="danger-button" onClick={() => setOpen(true)} disabled={!enabled}><Ban size={15} />Cancel shipment</button>}
      {hint && <p className="action-hint">{hint}</p>}
    </div>
  );
}
