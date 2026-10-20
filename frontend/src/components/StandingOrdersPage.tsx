import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Play, Plus, RefreshCw, Repeat, WalletCards, X } from "lucide-react";
import {
  cancelStandingOrder,
  createStandingOrder,
  executeStandingOrder,
  listStandingOrders,
  type StandingOrder,
  type StandingOrderInput,
  type Wallet,
} from "../lib/stellar";
import { amount, errorMessage, shortAddress } from "./shared";

type Props = {
  wallet: Wallet | null;
  onConnect: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const emptyForm = {
  template_name: "",
  supplier: "",
  logistics: "",
  arbiter: "",
  token: "",
  amount: "",
  interval_ledgers: "",
  max_occurrences: "",
  milestones: "Delivery:100",
};

/** Parses "Name:percent, Name:percent" into milestone templates. */
export function parseMilestones(value: string): StandingOrderInput["milestones"] {
  const milestones = value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.lastIndexOf(":");
    const name = separator > 0 ? part.slice(0, separator).trim() : "";
    const percent = Number(part.slice(separator + 1));
    if (!name || !Number.isInteger(percent) || percent <= 0) throw new Error(`Invalid milestone "${part}". Use Name:percent.`);
    return { name, payment_percent: percent };
  });
  if (!milestones.length) throw new Error("Add at least one milestone.");
  if (milestones.reduce((total, milestone) => total + milestone.payment_percent, 0) !== 100) {
    throw new Error("Milestone percentages must sum to 100.");
  }
  return milestones;
}

function orderStatus(order: StandingOrder) {
  if (order.cancelled) return "Cancelled";
  if (order.occurrences >= order.max_occurrences) return "Completed";
  return "Active";
}

export function StandingOrdersPage({ wallet, onConnect, onError, onNotice }: Props) {
  const [orders, setOrders] = useState<StandingOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const address = wallet?.address;

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setOrders(await listStandingOrders(address, address));
    } catch (cause) {
      onError(errorMessage(cause, "Unable to load standing orders."));
    } finally {
      setLoading(false);
    }
  }, [address, onError]);

  useEffect(() => {
    if (address) void load();
    else setOrders([]);
  }, [address, load]);

  async function run(key: string, action: () => Promise<string>) {
    setWriting(key);
    onError("");
    onNotice("");
    try {
      onNotice(await action());
      await load();
      return true;
    } catch (cause) {
      onError(errorMessage(cause, "Standing order transaction failed."));
      return false;
    } finally {
      setWriting(null);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet) return;
    const ok = await run("create", async () => {
      const orderId = await createStandingOrder(wallet, {
        template_name: form.template_name.trim(),
        supplier: form.supplier.trim(),
        logistics: form.logistics.trim(),
        arbiter: form.arbiter.trim(),
        token: form.token.trim(),
        amount: form.amount.trim(),
        interval_ledgers: Number(form.interval_ledgers),
        max_occurrences: Number(form.max_occurrences),
        milestones: parseMilestones(form.milestones),
      });
      return `Standing order #${orderId} created`;
    });
    if (ok) {
      setForm(emptyForm);
      setShowCreate(false);
    }
  }

  function field(key: keyof typeof emptyForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) {
    return <input aria-label={label} placeholder={label} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} required {...props} />;
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-rule" />RECURRING SHIPMENTS</div>
          <h1>Standing orders</h1>
          <p>Vault-funded orders that create a new shipment every interval.</p>
        </div>
        {wallet && <button className="primary-button" onClick={() => setShowCreate((shown) => !shown)}><Plus size={15} />New standing order</button>}
      </section>

      <section className="panel table-panel standing-orders-panel">
        <div className="panel-heading table-heading">
          <div><div className="section-kicker">BUYER ORDERS</div><h2>Your standing orders</h2></div>
          <button className="icon-button refresh-button" title="Refresh standing orders" disabled={!wallet || loading} onClick={() => void load()}>{loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}</button>
        </div>
        {!wallet && <div className="inline-callout standing-callout"><WalletCards size={16} /><span>Connect Freighter to manage the standing orders you own as a buyer.</span><button onClick={onConnect}>Connect</button></div>}
        {wallet && showCreate && <form className="standing-order-form" onSubmit={handleCreate}>
          {field("template_name", "Template name", { maxLength: 64 })}
          {field("supplier", "Supplier address")}
          {field("logistics", "Logistics address")}
          {field("arbiter", "Arbiter address")}
          {field("token", "Token contract address")}
          {field("amount", "Amount (base units)", { pattern: "[0-9]+" })}
          {field("interval_ledgers", "Interval (ledgers)", { type: "number", min: 1 })}
          {field("max_occurrences", "Max occurrences", { type: "number", min: 1 })}
          {field("milestones", "Milestones (Name:percent, …)")}
          <button className="primary-button" disabled={writing !== null}>{writing === "create" ? <LoaderCircle className="spin" size={15} /> : <Repeat size={15} />}{writing === "create" ? "Signing" : "Create standing order"}</button>
        </form>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>ORDER</th><th>TEMPLATE</th><th>SUPPLIER</th><th>AMOUNT</th><th>RUNS</th><th>NEXT LEDGER</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>{orders.length ? orders.map((order) => {
              const status = orderStatus(order);
              return (
                <tr key={order.order_id}>
                  <td><span className="table-id">#{order.order_id}</span></td>
                  <td>{order.template_name}</td>
                  <td><code>{shortAddress(order.supplier)}</code></td>
                  <td>{amount(order.amount)} <span className="muted">units</span></td>
                  <td>{order.occurrences} / {order.max_occurrences}</td>
                  <td>{order.next_ledger.toLocaleString()}</td>
                  <td><span className={`status-pill ${status.toLowerCase()}`}><span />{status}</span></td>
                  <td><span className="row-actions">
                    <button className="primary-button" disabled={status !== "Active" || writing !== null} onClick={() => run(`execute-${order.order_id}`, async () => `Standing order #${order.order_id} executed · shipment ${await executeStandingOrder(wallet!, order.order_id)}`)}>
                      {writing === `execute-${order.order_id}` ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}Execute
                    </button>
                    <button className="filter-button" disabled={order.cancelled || writing !== null} onClick={() => run(`cancel-${order.order_id}`, async () => { await cancelStandingOrder(wallet!, order.order_id); return `Standing order #${order.order_id} cancelled`; })}>
                      {writing === `cancel-${order.order_id}` ? <LoaderCircle className="spin" size={13} /> : <X size={13} />}Cancel
                    </button>
                  </span></td>
                </tr>
              );
            }) : <tr><td colSpan={8} className="table-empty">{loading ? "Loading standing orders…" : wallet ? "No standing orders yet. Create one to schedule recurring shipments." : "Connect a wallet to see your standing orders."}</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
