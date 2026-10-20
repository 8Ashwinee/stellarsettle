import { useState } from "react";
import { ArrowUpRight, LoaderCircle, Plus, WalletCards, X } from "lucide-react";
import { createShipment, type CreateShipmentInput, type Wallet } from "../lib/stellar";
import { errorMessage } from "../lib/format";

type MilestoneRow = { name: string; percent: string };

type Props = {
  wallet: Wallet | null;
  onStart: () => void;
  onCreated: (shipmentId: string, hash: string) => Promise<void> | void;
  onError: (message: string) => void;
};

const initialMilestones: MilestoneRow[] = [
  { name: "Goods dispatched", percent: "50" },
  { name: "Delivered", percent: "50" },
];

export function CreateShipmentForm({ wallet, onStart, onCreated, onError }: Props) {
  const [shipmentId, setShipmentId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [logistics, setLogistics] = useState("");
  const [arbiter, setArbiter] = useState("");
  const [token, setToken] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [milestoneMode, setMilestoneMode] = useState<CreateShipmentInput["milestoneMode"]>("Sequential");
  const [milestones, setMilestones] = useState<MilestoneRow[]>(initialMilestones);
  const [submitting, setSubmitting] = useState(false);

  const percentTotal = milestones.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  const amountValid = /^\d+$/.test(totalAmount.trim()) && BigInt(totalAmount.trim()) > 0n;
  const milestonesValid = milestones.length > 0 && percentTotal === 100 && milestones.every((row) => row.name.trim() && Number(row.percent) > 0);

  function updateMilestone(index: number, patch: Partial<MilestoneRow>) {
    setMilestones((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) return;
    if (!amountValid) {
      onError("Escrow amount must be a positive whole number of base units.");
      return;
    }
    if (!milestonesValid) {
      onError("Milestone percentages must be positive and add up to 100.");
      return;
    }
    const id = shipmentId.trim();
    setSubmitting(true);
    onStart();
    try {
      const hash = await createShipment(wallet, {
        shipmentId: id,
        supplier: supplier.trim(),
        logistics: logistics.trim(),
        arbiter: arbiter.trim(),
        token: token.trim(),
        totalAmount: totalAmount.trim(),
        milestoneMode,
        milestones: milestones.map((row) => ({ name: row.name.trim(), paymentPercent: Number(row.percent) })),
      });
      setShipmentId("");
      setSupplier("");
      setLogistics("");
      setArbiter("");
      setToken("");
      setTotalAmount("");
      setMilestones(initialMilestones);
      await onCreated(id, hash);
    } catch (cause) {
      onError(errorMessage(cause, "Shipment creation failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel create-panel" id="create">
      <div className="panel-heading">
        <div><div className="section-kicker">NEW ESCROW</div><h2>Create shipment</h2></div>
        <span className="chain-badge"><span />BUYER</span>
      </div>
      {!wallet && <div className="inline-callout create-callout"><WalletCards size={16} /><span>Connect a wallet to fund a new escrow shipment as the buyer.</span></div>}
      <form className="create-form" onSubmit={handleSubmit} aria-label="Create shipment">
        <div className="field-grid">
          <label className="field"><span>Shipment ID</span><input aria-label="New shipment ID" placeholder="e.g. PO-1042" value={shipmentId} onChange={(event) => setShipmentId(event.target.value)} maxLength={64} required /></label>
          <label className="field"><span>Escrow amount (base units)</span><input aria-label="Escrow amount" inputMode="numeric" placeholder="1000000000" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} required /></label>
          <label className="field"><span>Supplier</span><input aria-label="Supplier address" placeholder="G..." value={supplier} onChange={(event) => setSupplier(event.target.value)} required /></label>
          <label className="field"><span>Logistics</span><input aria-label="Logistics address" placeholder="G..." value={logistics} onChange={(event) => setLogistics(event.target.value)} required /></label>
          <label className="field"><span>Arbiter</span><input aria-label="Arbiter address" placeholder="G..." value={arbiter} onChange={(event) => setArbiter(event.target.value)} required /></label>
          <label className="field"><span>Token contract</span><input aria-label="Token address" placeholder="C..." value={token} onChange={(event) => setToken(event.target.value)} required /></label>
          <label className="field"><span>Milestone mode</span><select aria-label="Milestone mode" value={milestoneMode} onChange={(event) => setMilestoneMode(event.target.value as CreateShipmentInput["milestoneMode"])}><option value="Sequential">Sequential</option><option value="Parallel">Parallel</option></select></label>
        </div>
        <div className="milestone-editor">
          <div className="milestone-editor-head"><span>MILESTONES</span><span className={percentTotal === 100 ? "" : "text-coral"}>{percentTotal}% of 100%</span></div>
          {milestones.map((row, index) => <div className="milestone-row" key={index}>
            <input aria-label={`Milestone ${index + 1} name`} placeholder="Milestone name" value={row.name} onChange={(event) => updateMilestone(index, { name: event.target.value })} required />
            <input aria-label={`Milestone ${index + 1} percent`} type="number" min={1} max={100} value={row.percent} onChange={(event) => updateMilestone(index, { percent: event.target.value })} required />
            <button type="button" className="icon-button" aria-label={`Remove milestone ${index + 1}`} disabled={milestones.length === 1} onClick={() => setMilestones((rows) => rows.filter((_, i) => i !== index))}><X size={14} /></button>
          </div>)}
          <button type="button" className="text-button" onClick={() => setMilestones((rows) => [...rows, { name: "", percent: "" }])}><Plus size={15} />Add milestone</button>
        </div>
        <div className="form-actions">
          <button className="primary-button" disabled={!wallet || submitting}>{submitting ? <LoaderCircle className="spin" size={15} /> : <ArrowUpRight size={15} />}{submitting ? "Signing" : "Sign & create"}</button>
        </div>
      </form>
    </section>
  );
}
