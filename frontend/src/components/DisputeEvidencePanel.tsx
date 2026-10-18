import { useCallback, useEffect, useState } from "react";
import { FileText, LoaderCircle, Upload } from "lucide-react";
import { getDisputeEvidence, submitDisputeEvidence, type DisputeEvidence, type Wallet } from "../lib/stellar";
import { errorMessage, shortAddress } from "../lib/format";

type Props = {
  wallet: Wallet;
  shipmentId: string;
  milestoneIndex: number;
  maxEvidence: number;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const evidenceTypes = ["document", "invoice", "photo", "affidavit", "other"];

export function DisputeEvidencePanel({ wallet, shipmentId, milestoneIndex, maxEvidence, onError, onNotice }: Props) {
  const [entries, setEntries] = useState<DisputeEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [evidenceHash, setEvidenceHash] = useState("");
  const [evidenceType, setEvidenceType] = useState(evidenceTypes[0]);

  const loadEvidence = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getDisputeEvidence(wallet.address, shipmentId, milestoneIndex));
    } catch (cause) {
      onError(errorMessage(cause, "Unable to load dispute evidence."));
    } finally {
      setLoading(false);
    }
  }, [wallet.address, shipmentId, milestoneIndex, onError]);

  useEffect(() => {
    void loadEvidence();
  }, [loadEvidence]);

  const visible = entries.slice(0, maxEvidence);
  const limitReached = entries.length >= maxEvidence;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hash = evidenceHash.trim();
    if (!hash || limitReached) return;
    setWriting(true);
    onError("");
    onNotice("");
    try {
      const txHash = await submitDisputeEvidence(wallet, shipmentId, milestoneIndex, hash, evidenceType);
      onNotice(`Dispute evidence submitted · ${txHash.slice(0, 12)}…`);
      setEvidenceHash("");
      await loadEvidence();
    } catch (cause) {
      onError(errorMessage(cause, "Evidence transaction failed."));
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="evidence-panel" aria-label={`Dispute evidence for milestone ${milestoneIndex + 1}`}>
      <div className="sub-heading"><span>DISPUTE EVIDENCE</span><small>{Math.min(entries.length, maxEvidence)} / {maxEvidence}</small></div>
      {loading && !entries.length ? <div className="sub-empty"><LoaderCircle className="spin" size={14} />Loading evidence</div>
        : visible.length ? <ul className="evidence-list">{visible.map((entry, index) => <li key={`${entry.evidence_hash}-${index}`}>
          <FileText size={14} />
          <span className="evidence-copy"><code>{entry.evidence_hash}</code><small>{entry.evidence_type} · {shortAddress(entry.submitter)} · L{entry.submitted_ledger.toLocaleString()}</small></span>
        </li>)}</ul>
        : <div className="sub-empty">No evidence submitted yet.</div>}
      {limitReached ? <div className="sub-empty">Evidence limit of {maxEvidence} reached for this milestone.</div>
        : <form className="metadata-form evidence-form" onSubmit={handleSubmit}>
          <select aria-label="Evidence type" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}>
            {evidenceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input aria-label="Evidence hash or URI" placeholder="IPFS CID, hash or URI" value={evidenceHash} onChange={(event) => setEvidenceHash(event.target.value)} maxLength={256} required />
          <button className="primary-button" disabled={writing || !evidenceHash.trim()}>{writing ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{writing ? "Signing" : "Submit evidence"}</button>
        </form>}
    </div>
  );
}
