import { useState } from "react";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import type { Milestone } from "../lib/stellar";

/** Milestone states the contract accepts in `raise_dispute`. */
const disputableStatuses = ["ProofSubmitted", "ConfirmedHeld"];

type DisputeFormProps = {
  milestones: Milestone[];
  busy: boolean;
  onSubmit: (milestoneIndex: number, reason: string) => Promise<boolean>;
};

export function DisputeForm({ milestones, busy, onSubmit }: DisputeFormProps) {
  const disputable = milestones
    .map((milestone, index) => ({ milestone, index }))
    .filter(({ milestone }) => disputableStatuses.includes(milestone.status));
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const milestoneIndex = selected === "" ? disputable[0]?.index : Number(selected);

  if (!disputable.length) {
    return <p className="form-hint">No milestone has a submitted proof to dispute.</p>;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (milestoneIndex === undefined || !reason.trim()) return;
    if (await onSubmit(milestoneIndex, reason.trim())) {
      setReason("");
      setSelected("");
    }
  }

  return (
    <form className="action-form dispute-form" onSubmit={handleSubmit} aria-label="Raise dispute">
      <select aria-label="Milestone to dispute" value={milestoneIndex ?? ""} onChange={(event) => setSelected(event.target.value)}>
        {disputable.map(({ milestone, index }) => <option key={index} value={index}>Milestone {index + 1} · {milestone.name}</option>)}
      </select>
      <textarea aria-label="Dispute reason" placeholder="Why is this proof being disputed?" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} required />
      <button className="primary-button danger-button" disabled={busy || !reason.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <ShieldAlert size={15} />}{busy ? "Signing" : "Raise dispute"}</button>
    </form>
  );
}
