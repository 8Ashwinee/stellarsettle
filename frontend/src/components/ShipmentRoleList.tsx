import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Wallet } from "../lib/stellar";
import { queryContract, scAddr, scNone, scU32 } from "../lib/contractCalls";
import { ROLE_PAGE_LIMIT, SHIPMENT_ROLES, normalizeShipmentIds, roleConfig, type ShipmentRole } from "../lib/roleFilter";
import "./ShipmentRoleList.css";

export function ShipmentRoleList({ wallet }: { wallet: Wallet | null }) {
  const [role, setRole] = useState<ShipmentRole>("buyer");
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!wallet) return;
    const config = roleConfig(role);
    setLoading(true);
    setError("");
    try {
      const args = config.paginated ? [scAddr(wallet.address), scNone(), scU32(ROLE_PAGE_LIMIT)] : [scAddr(wallet.address)];
      setIds(normalizeShipmentIds(await queryContract(wallet.address, config.method, args)));
    } catch (cause) {
      setIds([]);
      setError(cause instanceof Error ? cause.message : "Unable to load shipments.");
    } finally {
      setLoading(false);
    }
  }, [wallet, role]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="panel role-list-panel" aria-label="Shipments by role">
      <div className="panel-heading"><div><div className="section-kicker">YOUR SHIPMENTS</div><h2>Shipments by role</h2></div></div>
      <div className="role-tabs" role="tablist">
        {SHIPMENT_ROLES.map((item) => (
          <button key={item.role} role="tab" aria-selected={role === item.role} className={role === item.role ? "active" : ""} onClick={() => setRole(item.role)}>{item.label}</button>
        ))}
      </div>
      {!wallet ? <p className="role-note">Connect a wallet to list shipments where you hold a role.</p>
        : loading ? <p className="role-note"><LoaderCircle className="spin" size={15} /> Loading shipments</p>
        : error ? <p className="role-note role-error" role="alert">{error}</p>
        : ids.length === 0 ? <p className="role-note">No shipments where you are {roleConfig(role).label.toLowerCase()}.</p>
        : <ul className="role-ids">{ids.map((id) => <li key={id}><code>{id}</code></li>)}</ul>}
    </section>
  );
}
