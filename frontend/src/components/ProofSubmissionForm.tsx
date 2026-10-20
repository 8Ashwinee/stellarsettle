import { useState } from "react";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { submitProof, type ShipmentDetail, type Wallet } from "../lib/stellar";
import { errorMessage } from "../lib/format";

type Props = {
  wallet: Wallet | null;
  shipment: ShipmentDetail;
  onStart: () => void;
  onSubmitted: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
};

export function ProofSubmissionForm({ wallet, shipment, onStart, onSubmitted, onError }: Props) {
  const pending = shipment.milestones.filter((milestone) => milestone.status === "Pending");
  const [selected, setSelected] = useState<string>("");
  const [proofHash, setProofHash] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSubmitter = !!wallet && (wallet.address === shipment.supplier || wallet.address === shipment.logistics);
  const active = shipment.status === "Active";
  const milestoneIndex = pending.some((milestone) => String(milestone.index) === selected) ? Number(selected) : pending[0]?.index;
  const enabled = isSubmitter && active && milestoneIndex !== undefined;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !enabled || milestoneIndex === undefined) return;
    setSubmitting(true);
    onStart();
    try {
      const hash = await submitProof(wallet, shipment.id, milestoneIndex, proofHash.trim());
      setProofHash("");
      setSelected("");
      await onSubmitted(`Proof submitted for milestone ${milestoneIndex + 1} · ${hash.slice(0, 12)}…`);
    } catch (cause) {
      onError(errorMessage(cause, "Proof submission failed."));
    } finally {
      setSubmitting(false);
    }
  }

  let hint = "";
  if (!isSubmitter) hint = "Only the shipment's supplier or logistics wallet can submit proof.";
  else if (!active) hint = "Proof can only be submitted on an active shipment.";
  else if (milestoneIndex === undefined) hint = "No milestone is awaiting proof.";

  return (
    <div className="action-block">
      <div className="action-block-head"><strong>Submit delivery proof</strong><small>Supplier / logistics</small></div>
      <form className="proof-form" onSubmit={handleSubmit} aria-label="Submit proof">
        <select aria-label="Proof milestone" value={milestoneIndex ?? ""} onChange={(event) => setSelected(event.target.value)} disabled={!enabled || submitting}>
          {pending.length ? pending.map((milestone) => <option key={milestone.index} value={milestone.index}>{milestone.index + 1}. {milestone.name}</option>) : <option value="">No pending milestone</option>}
        </select>
        <input aria-label="Proof hash" placeholder="IPFS proof hash (ipfs://...)" value={proofHash} onChange={(event) => setProofHash(event.target.value)} maxLength={256} disabled={!enabled || submitting} required />
        <button className="primary-button" disabled={!enabled || submitting || !proofHash.trim()}>{submitting ? <LoaderCircle className="spin" size={15} /> : <ArrowUpRight size={15} />}{submitting ? "Signing" : "Sign & submit"}</button>
      </form>
      {hint && <p className="action-hint">{hint}</p>}
    </div>
  );
}
