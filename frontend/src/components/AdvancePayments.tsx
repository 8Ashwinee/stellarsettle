import { useCallback, useEffect, useState } from "react";
import { Check, HandCoins, LoaderCircle } from "lucide-react";
import { approveAdvance, getAdvanceRequest, getMaxAdvancePercent, requestAdvance, type AdvanceRequest } from "../lib/stellar";
import { amount, errorMessage, isBuyer, isSupplier, shortHash, type ShipmentActionProps } from "./shared";

export function AdvancePayments({ wallet, shipment, onUpdated, onError, onNotice }: ShipmentActionProps) {
  const [maxPercent, setMaxPercent] = useState<number | null>(null);
  const [requests, setRequests] = useState<AdvanceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [percent, setPercent] = useState("");
  const buyer = isBuyer(wallet, shipment);
  const supplier = isSupplier(wallet, shipment);
  const active = shipment.status === "Active";
  const address = wallet?.address;
  // request_advance only accepts Pending milestones that have no approved advance yet.
  const eligible = shipment.milestones
    .map((milestone, index) => ({ milestone, index }))
    .filter(({ milestone, index }) => milestone.status === "Pending" && !requests.some((request) => request.milestoneIndex === index && request.approved));
  const selectedIndex = eligible.some(({ index }) => index === milestoneIndex) ? milestoneIndex : eligible[0]?.index ?? 0;
  const percentValue = Number(percent);
  const percentInvalid = percent !== "" && (!Number.isInteger(percentValue) || percentValue < 1 || (maxPercent !== null && percentValue > maxPercent));

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const [max, found] = await Promise.all([
        getMaxAdvancePercent(address),
        Promise.all(shipment.milestones.map((_, index) => getAdvanceRequest(shipment.id, index))),
      ]);
      setMaxPercent(max);
      setRequests(found.filter((request): request is AdvanceRequest => request !== null));
    } catch (cause) {
      onError(errorMessage(cause, "Unable to load advance requests."));
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
    if (!wallet || percentInvalid) return;
    const ok = await run(
      "request",
      () => requestAdvance(wallet, shipment.id, selectedIndex, percentValue),
      "Advance requested",
      "Advance request failed.",
    );
    if (ok) setPercent("");
  }

  return (
    <section className="panel workflow-panel" aria-label="Advance payments">
      <div className="panel-heading">
        <div><div className="section-kicker">SUPPLIER FINANCING</div><h2>Advance payments</h2></div>
        {loading ? <LoaderCircle className="spin" size={16} aria-label="Loading advance requests" /> : maxPercent !== null && <span className="chain-badge"><span />MAX {maxPercent}%</span>}
      </div>
      {!wallet ? <div className="workflow-empty">Connect your wallet to view advance requests.</div> : <>
        {requests.length ? <ul className="milestone-list">{requests.map((request) => (
          <li className="milestone-row" key={request.milestoneIndex}>
            <span className="milestone-copy">
              <strong>{request.milestoneIndex + 1}. {shipment.milestones[request.milestoneIndex]?.name}</strong>
              <small>{request.approved ? `${amount(request.amountAdvanced)} units advanced` : `${request.requestedPercent}% of milestone payment requested`}</small>
            </span>
            <span className={`status-pill ${request.approved ? "confirmed" : "proofsubmitted"}`}><span />{request.approved ? "Approved" : "Pending"}</span>
            {!request.approved && buyer && active && (
              <button className="primary-button" disabled={writing !== null} onClick={() => run(`approve-${request.milestoneIndex}`, () => approveAdvance(wallet, shipment.id, request.milestoneIndex), `Advance approved for milestone ${request.milestoneIndex + 1}`, "Advance approval failed.")}>
                {writing === `approve-${request.milestoneIndex}` ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{writing === `approve-${request.milestoneIndex}` ? "Signing" : "Approve"}
              </button>
            )}
          </li>
        ))}</ul> : !loading && <div className="workflow-empty">No advance requests on this shipment.</div>}
        {supplier && active && eligible.length > 0 && <form className="workflow-form" onSubmit={handleRequest}>
          <select aria-label="Advance milestone" value={selectedIndex} onChange={(event) => setMilestoneIndex(Number(event.target.value))}>
            {eligible.map(({ index }) => <option key={index} value={index}>Milestone {index + 1}</option>)}
          </select>
          <input aria-label="Advance percent" type="number" min={1} max={maxPercent ?? undefined} placeholder={maxPercent !== null ? `Percent (max ${maxPercent})` : "Percent"} value={percent} onChange={(event) => setPercent(event.target.value)} required />
          <button className="primary-button" disabled={writing !== null || percentInvalid || maxPercent === null}>{writing === "request" ? <LoaderCircle className="spin" size={15} /> : <HandCoins size={15} />}{writing === "request" ? "Signing" : "Request advance"}</button>
        </form>}
        {supplier && percentInvalid && <div className="workflow-hint text-coral">Advance must be between 1% and {maxPercent ?? "the configured maximum"}%.</div>}
      </>}
    </section>
  );
}
