import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, LoaderCircle, X } from "lucide-react";
import { approveExtension, denyExtension, getExtensionState, requestExtension, type ExtensionState } from "../lib/stellar";
import { errorMessage, isBuyer, isSupplier, shortHash, type ShipmentActionProps } from "./shared";

export function ExtensionWorkflow({ wallet, shipment, onUpdated, onError, onNotice }: ShipmentActionProps) {
  const [states, setStates] = useState<ExtensionState[]>([]);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [extraLedgers, setExtraLedgers] = useState("");
  const [reason, setReason] = useState("");
  const buyer = isBuyer(wallet, shipment);
  const supplier = isSupplier(wallet, shipment);
  const active = shipment.status === "Active";
  const address = wallet?.address;
  const pending = states.filter((state) => state.pending);
  const requestable = states.filter((state) => !state.pending);
  const selectedIndex = requestable.some((state) => state.milestoneIndex === milestoneIndex) ? milestoneIndex : requestable[0]?.milestoneIndex ?? 0;

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setStates(await Promise.all(shipment.milestones.map((_, index) => getExtensionState(address, shipment.id, index))));
    } catch (cause) {
      onError(errorMessage(cause, "Unable to load extension requests."));
    } finally {
      setLoading(false);
    }
  }, [address, shipment, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<string>, success: string, fallback: string) {
    setWriting(key);
    onError("");
    onNotice("");
    try {
      const hash = await action();
      onNotice(`${success} · ${shortHash(hash)}`);
      await Promise.all([load(), onUpdated()]);
      return true;
    } catch (cause) {
      onError(errorMessage(cause, fallback));
      return false;
    } finally {
      setWriting(null);
    }
  }

  async function handleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) return;
    const ok = await run(
      "request",
      () => requestExtension(wallet, shipment.id, selectedIndex, Number(extraLedgers), reason),
      "Extension requested",
      "Extension request failed.",
    );
    if (ok) {
      setExtraLedgers("");
      setReason("");
    }
  }

  return (
    <section className="panel workflow-panel" aria-label="Deadline extensions">
      <div className="panel-heading">
        <div><div className="section-kicker">MILESTONE DEADLINES</div><h2>Deadline extensions</h2></div>
        {loading && <LoaderCircle className="spin" size={16} aria-label="Loading extension requests" />}
      </div>
      {!wallet ? <div className="workflow-empty">Connect your wallet to view extension requests.</div> : <>
        <ul className="milestone-list">{states.map((state) => {
          const milestone = shipment.milestones[state.milestoneIndex];
          return (
            <li className="milestone-row" key={state.milestoneIndex}>
              <span className="milestone-copy">
                <strong>{state.milestoneIndex + 1}. {milestone?.name}</strong>
                <small>{state.deadline ? `Deadline ledger ${state.deadline.toLocaleString()}` : "No deadline set"}</small>
                {state.pending && <small className="pending-note">Pending: +{state.pending.extraLedgers.toLocaleString()} ledgers{state.pending.reason ? ` · “${state.pending.reason}”` : ""}</small>}
              </span>
              {state.pending && <span className="status-pill proofsubmitted"><span />Pending</span>}
              {state.pending && buyer && active && <span className="row-actions">
                <button className="primary-button" disabled={writing !== null} onClick={() => run(`approve-${state.milestoneIndex}`, () => approveExtension(wallet, shipment.id, state.milestoneIndex), `Extension approved for milestone ${state.milestoneIndex + 1}`, "Extension approval failed.")}>
                  {writing === `approve-${state.milestoneIndex}` ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Approve
                </button>
                <button className="filter-button" disabled={writing !== null} onClick={() => run(`deny-${state.milestoneIndex}`, () => denyExtension(wallet, shipment.id, state.milestoneIndex), `Extension denied for milestone ${state.milestoneIndex + 1}`, "Extension denial failed.")}>
                  {writing === `deny-${state.milestoneIndex}` ? <LoaderCircle className="spin" size={14} /> : <X size={14} />}Deny
                </button>
              </span>}
            </li>
          );
        })}</ul>
        {!loading && states.length > 0 && pending.length === 0 && <div className="workflow-empty">No pending extension requests.</div>}
        {supplier && active && requestable.length > 0 && <form className="workflow-form" onSubmit={handleRequest}>
          <select aria-label="Extension milestone" value={selectedIndex} onChange={(event) => setMilestoneIndex(Number(event.target.value))}>
            {requestable.map((state) => <option key={state.milestoneIndex} value={state.milestoneIndex}>Milestone {state.milestoneIndex + 1}</option>)}
          </select>
          <input aria-label="Extra ledgers" type="number" min={1} placeholder="Extra ledgers" value={extraLedgers} onChange={(event) => setExtraLedgers(event.target.value)} required />
          <input aria-label="Extension reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} required />
          <button className="primary-button" disabled={writing !== null}>{writing === "request" ? <LoaderCircle className="spin" size={15} /> : <CalendarClock size={15} />}{writing === "request" ? "Signing" : "Request extension"}</button>
        </form>}
      </>}
    </section>
  );
}
