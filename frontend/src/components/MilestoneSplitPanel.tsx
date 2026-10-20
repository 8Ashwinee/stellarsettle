import { useCallback, useEffect, useState } from "react";
import { Check, GitFork, LoaderCircle, Plus } from "lucide-react";
import {
  approveMilestoneSplit,
  getMilestoneSplitProposal,
  proposeMilestoneSplit,
  type Milestone,
  type MilestoneSplitProposal,
  type Wallet,
} from "../lib/stellar";
import { errorMessage, shortAddress } from "../lib/format";

type Props = {
  wallet: Wallet;
  shipmentId: string;
  milestones: Milestone[];
  onApplied: () => Promise<void> | void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

export function MilestoneSplitPanel({ wallet, shipmentId, milestones, onApplied, onError, onNotice }: Props) {
  const [proposal, setProposal] = useState<MilestoneSplitProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const splittable = milestones.filter((milestone) => milestone.status === "Pending");
  const [milestoneIndex, setMilestoneIndex] = useState<number | null>(null);
  const [firstName, setFirstName] = useState("");
  const [firstPercent, setFirstPercent] = useState("");
  const [secondName, setSecondName] = useState("");

  const loadProposal = useCallback(async () => {
    setLoading(true);
    try {
      setProposal(await getMilestoneSplitProposal(wallet.address, shipmentId));
    } catch (cause) {
      onError(errorMessage(cause, "Unable to load milestone split proposal."));
    } finally {
      setLoading(false);
    }
  }, [wallet.address, shipmentId, onError]);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  const selected = milestones.find((milestone) => milestone.index === (milestoneIndex ?? splittable[0]?.index));
  const first = Number(firstPercent);
  const secondPercent = selected && Number.isInteger(first) ? selected.payment_percent - first : NaN;
  const validSplit = Boolean(selected && firstName.trim() && secondName.trim() && Number.isInteger(first) && first > 0 && secondPercent > 0);

  async function handlePropose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !validSplit) return;
    setWriting(true);
    onError("");
    onNotice("");
    try {
      const hash = await proposeMilestoneSplit(wallet, shipmentId, selected.index, [
        { name: firstName.trim(), payment_percent: first },
        { name: secondName.trim(), payment_percent: secondPercent },
      ]);
      onNotice(`Milestone split proposed · ${hash.slice(0, 12)}…`);
      setShowForm(false);
      setFirstName("");
      setFirstPercent("");
      setSecondName("");
      await loadProposal();
    } catch (cause) {
      onError(errorMessage(cause, "Split proposal transaction failed."));
    } finally {
      setWriting(false);
    }
  }

  async function handleApprove() {
    if (!proposal) return;
    setWriting(true);
    onError("");
    onNotice("");
    try {
      const hash = await approveMilestoneSplit(wallet, shipmentId, proposal.milestone_index);
      onNotice(`Milestone split approved · ${hash.slice(0, 12)}…`);
      await Promise.all([loadProposal(), onApplied()]);
    } catch (cause) {
      onError(errorMessage(cause, "Split approval transaction failed."));
    } finally {
      setWriting(false);
    }
  }

  const original = proposal ? milestones.find((milestone) => milestone.index === proposal.milestone_index) : undefined;
  const isProposer = proposal?.proposer === wallet.address;

  return (
    <div className="split-panel">
      <div className="sub-heading"><span>MILESTONE SPLIT</span>{!proposal && splittable.length > 0 && <button className="text-button" onClick={() => setShowForm((shown) => !shown)}><Plus size={15} />Propose split</button>}</div>
      {loading && !proposal ? <div className="sub-empty"><LoaderCircle className="spin" size={14} />Checking for split proposals</div>
        : proposal ? <div className="split-proposal" role="region" aria-label="Pending split proposal">
          <div className="split-proposal-top">
            <GitFork size={14} />
            <span><strong>Pending split of milestone {proposal.milestone_index + 1}{original ? ` · ${original.name}` : ""}</strong><small>Proposed by {isProposer ? "you" : shortAddress(proposal.proposer)}</small></span>
          </div>
          <ul className="split-parts">{proposal.parts.map((part, index) => <li key={`${part.name}-${index}`}><span>{part.name}</span><strong>{part.payment_percent}%</strong></li>)}</ul>
          {isProposer ? <div className="sub-empty">Awaiting counterparty approval.</div>
            : <button className="primary-button" onClick={handleApprove} disabled={writing}>{writing ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{writing ? "Signing" : "Approve split"}</button>}
        </div>
        : !showForm && <div className="sub-empty">{splittable.length ? "No pending split proposal." : "No pending milestones available to split."}</div>}
      {!proposal && showForm && selected && <form className="metadata-form split-form" onSubmit={handlePropose}>
        <select aria-label="Milestone to split" value={selected.index} onChange={(event) => setMilestoneIndex(Number(event.target.value))}>
          {splittable.map((milestone) => <option key={milestone.index} value={milestone.index}>{milestone.index + 1}. {milestone.name} ({milestone.payment_percent}%)</option>)}
        </select>
        <input aria-label="First part name" placeholder="First part name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        <input aria-label="First part percent" inputMode="numeric" pattern="[0-9]+" placeholder="%" value={firstPercent} onChange={(event) => setFirstPercent(event.target.value)} required />
        <input aria-label="Second part name" placeholder="Second part name" value={secondName} onChange={(event) => setSecondName(event.target.value)} required />
        <span className="split-remainder">{Number.isFinite(secondPercent) && secondPercent > 0 ? `${secondPercent}%` : "—"}</span>
        <button className="primary-button" disabled={writing || !validSplit}>{writing ? <LoaderCircle className="spin" size={15} /> : <GitFork size={15} />}{writing ? "Signing" : "Sign & propose"}</button>
      </form>}
    </div>
  );
}
