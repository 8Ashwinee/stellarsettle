import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { xdr } from "@stellar/stellar-sdk";
import type { Wallet } from "../lib/stellar";
import { invokeContract, queryContract, scAddr, scStr } from "../lib/contractCalls";
import { emptyDraft, milestoneToScVal, validateTemplate, type MilestoneDraft, type ShipmentDraft } from "../lib/milestoneTemplates";
import "./MilestoneTemplateManager.css";

export function MilestoneTemplateManager({ wallet, onUseTemplate }: { wallet: Wallet | null; onUseTemplate?: (draft: ShipmentDraft) => void }) {
  const [templates, setTemplates] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([{ name: "", percent: "100" }]);
  const [draft, setDraft] = useState<ShipmentDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError("");
    try {
      const list = await queryContract<string[]>(wallet.address, "list_milestone_templates", [scAddr(wallet.address)]);
      setTemplates(list.map(String));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load templates.");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { void load(); }, [load]);

  function updateRow(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!wallet) return;
    const problem = validateTemplate(name, milestones);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const list = xdr.ScVal.scvVec(milestones.map(milestoneToScVal));
      const hash = await invokeContract(wallet, "save_milestone_template", [scAddr(wallet.address), scStr(name.trim()), list]);
      setNotice(`Template saved · ${hash.slice(0, 12)}…`);
      setName("");
      setMilestones([{ name: "", percent: "100" }]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save template.");
    } finally {
      setSaving(false);
    }
  }

  function use(templateName: string) {
    const next = emptyDraft(templateName);
    setDraft(next);
    onUseTemplate?.(next);
  }

  return (
    <section className="panel template-manager" aria-label="Milestone templates">
      <div className="panel-heading"><div><div className="section-kicker">TEMPLATES</div><h2>Milestone templates</h2></div></div>
      {!wallet && <p className="tm-note">Connect a wallet to manage milestone templates.</p>}
      {loading && <p className="tm-note"><LoaderCircle className="spin" size={15} /> Loading templates</p>}
      {error && <p className="tm-note tm-error" role="alert">{error}</p>}
      {notice && <p className="tm-note" role="status">{notice}</p>}
      {wallet && !loading && (templates.length === 0
        ? <p className="tm-note">No saved templates yet.</p>
        : <ul className="tm-list">{templates.map((item) => <li key={item}><strong>{item}</strong><button className="text-button" onClick={() => use(item)}>Use for new shipment</button></li>)}</ul>)}
      <form className="tm-form" onSubmit={save}>
        <input aria-label="Template name" placeholder="Template name" value={name} onChange={(event) => setName(event.target.value)} />
        {milestones.map((row, index) => (
          <div className="tm-row" key={index}>
            <input aria-label={`Milestone ${index + 1} name`} placeholder="Milestone name" value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} />
            <input aria-label={`Milestone ${index + 1} percent`} placeholder="%" inputMode="numeric" value={row.percent} onChange={(event) => updateRow(index, { percent: event.target.value })} />
          </div>
        ))}
        <div className="tm-actions">
          <button type="button" className="text-button" onClick={() => setMilestones((rows) => [...rows, { name: "", percent: "" }])}><Plus size={14} />Add milestone</button>
          <button className="primary-button" disabled={!wallet || saving}>{saving ? <LoaderCircle className="spin" size={15} /> : null}{saving ? "Signing" : "Sign & save"}</button>
        </div>
      </form>
      {draft && (
        <div className="tm-draft" aria-label="Create shipment draft">
          <strong>New shipment from "{draft.templateName}"</strong>
          {(["shipmentId", "supplier", "logistics", "arbiter", "token", "totalAmount"] as const).map((field) => (
            <input key={field} aria-label={field} placeholder={field} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />
          ))}
        </div>
      )}
    </section>
  );
}
