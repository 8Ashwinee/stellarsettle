import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { getShipmentSummary, type Shipment, type Wallet } from "../lib/stellar";
import { invokeContract, scAddr, scI128, scStr } from "../lib/contractCalls";
import { TRANSFER_METHODS, validateDelegate, validateTransfer, type TransferRole } from "../lib/partyTransfer";
import "./PartyTransferPanel.css";

export function PartyTransferPanel({ wallet }: { wallet: Wallet | null }) {
  const [shipmentId, setShipmentId] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [role, setRole] = useState<TransferRole>("supplier");
  const [newParty, setNewParty] = useState("");
  const [delegate, setDelegate] = useState("");
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function run(action: () => Promise<string>, success: string, refresh = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const hash = await action();
      if (refresh && wallet) setShipment(await getShipmentSummary(wallet.address, shipmentId.trim()));
      setNotice(`${success} · ${hash.slice(0, 12)}…`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    if (!wallet || !shipmentId.trim()) return;
    setBusy(true);
    setError("");
    try { setShipment(await getShipmentSummary(wallet.address, shipmentId.trim())); }
    catch (cause) { setShipment(null); setError(cause instanceof Error ? cause.message : "Unable to load shipment."); }
    finally { setBusy(false); }
  }

  function transfer(event: React.FormEvent) {
    event.preventDefault();
    if (!wallet) return;
    const problem = validateTransfer(shipmentId, wallet.address, newParty);
    if (problem) { setError(problem); return; }
    void run(() => invokeContract(wallet, TRANSFER_METHODS[role], [scAddr(wallet.address), scStr(shipmentId.trim()), scAddr(newParty.trim())]), `${role} transferred`, true);
  }

  function authorize(event: React.FormEvent) {
    event.preventDefault();
    if (!wallet) return;
    const problem = validateDelegate(delegate, cap);
    if (problem) { setError(problem); return; }
    void run(() => invokeContract(wallet, "authorize_delegate", [scAddr(wallet.address), scStr(shipmentId.trim()), scAddr(delegate.trim()), scI128(cap.trim())]), "Delegate authorized");
  }

  return (
    <section className="panel party-transfer" aria-label="Shipment settings">
      <div className="panel-heading"><div><div className="section-kicker">SETTINGS</div><h2>Party transfer and delegates</h2></div></div>
      {!wallet && <p className="pt-note">Connect a wallet to act as a shipment party.</p>}
      <div className="pt-row">
        <input aria-label="Settings shipment ID" placeholder="Shipment ID" value={shipmentId} onChange={(event) => setShipmentId(event.target.value)} />
        <button className="primary-button" type="button" disabled={!wallet || busy || !shipmentId.trim()} onClick={load}>Load</button>
      </div>
      {shipment && <p className="pt-note">Current supplier: <code>{shipment.supplier}</code> ({shipment.status})</p>}
      {busy && <p className="pt-note"><LoaderCircle className="spin" size={15} /> Working</p>}
      {error && <p className="pt-note pt-error" role="alert">{error}</p>}
      {notice && <p className="pt-note" role="status">{notice}</p>}
      <form className="pt-form" onSubmit={transfer}>
        <strong>Transfer your role</strong>
        <select aria-label="Role to transfer" value={role} onChange={(event) => setRole(event.target.value as TransferRole)}>
          <option value="buyer">Buyer</option><option value="supplier">Supplier</option><option value="logistics">Logistics</option>
        </select>
        <input aria-label="New party address" placeholder="New party address (G...)" value={newParty} onChange={(event) => setNewParty(event.target.value)} />
        <button className="primary-button" disabled={!wallet || busy}>Sign & transfer</button>
      </form>
      <form className="pt-form" onSubmit={authorize}>
        <strong>Delegates (buyer only)</strong>
        <input aria-label="Delegate address" placeholder="Delegate address (G...)" value={delegate} onChange={(event) => setDelegate(event.target.value)} />
        <input aria-label="Per-transaction cap" placeholder="Per-transaction cap (base units)" value={cap} onChange={(event) => setCap(event.target.value)} />
        <div className="pt-row">
          <button className="primary-button" disabled={!wallet || busy || !shipmentId.trim()}>Authorize</button>
          <button type="button" className="text-button" disabled={!wallet || busy || !shipmentId.trim()} onClick={() => wallet && void run(() => invokeContract(wallet, "revoke_delegate", [scAddr(wallet.address), scStr(shipmentId.trim())]), "Delegate revoked")}>Revoke</button>
        </div>
      </form>
    </section>
  );
}
