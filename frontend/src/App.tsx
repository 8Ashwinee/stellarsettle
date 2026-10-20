import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileSearch,
  LayoutDashboard,
  LoaderCircle,
  PiggyBank,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import {
  appNetwork,
  batchCancelShipments,
  batchConfirmMilestones,
  configuredContractId,
  connectWallet,
  fileWarrantyClaim,
  getReputation,
  getShipmentDetail,
  getShipmentSummary,
  maxBatchCancel,
  raiseDispute,
  rateCounterparty,
  resolveWarrantyClaim,
  setShipmentMetadata,
  type Reputation,
  type Shipment,
  type ShipmentDetail,
  type Wallet,
   configuredContractId
} from "./lib/stellar";
import { BulkActionsToolbar } from "./components/BulkActionsToolbar";
import { DisputeForm } from "./components/DisputeForm";
import { RatingPrompt } from "./components/RatingPrompt";
import { StatusPill } from "./components/StatusPill";
import { WarrantyPanel } from "./components/WarrantyPanel";
import { amount, shortAddress } from "./lib/format";
import { ShipmentMilestones } from "./components/ShipmentMilestones";
import { TopUpForm } from "./components/TopUpForm";
import { VaultPage } from "./components/VaultPage";

type Escalation = {
  id: string;
  ledger: number;
  type: string;
  shipmentId: string;
  milestoneIndex: number;
  openedLedger: number;
  currentLedger: number;
};

const backendUrl = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8787").replace(/\/$/, "");

function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

const eventLabels: Record<string, string> = {
  dispute_escalated: "Dispute escalated",
  dispute_raised: "Dispute raised",
};

function App() {
  const [path, setPath] = useState(currentPath);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [shipmentId, setShipmentId] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [events, setEvents] = useState<Escalation[]>([]);
  const [apiState, setApiState] = useState<"checking" | "online" | "offline">("checking");
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showMetadata, setShowMetadata] = useState(false);
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(to: string, event?: React.MouseEvent) {
    event?.preventDefault();
    window.history.pushState(null, "", to);
    setPath(currentPath());
  }

  const refreshShipment = useCallback(async () => {
    if (!wallet || !shipment) return;
    try {
      setShipment(await getShipmentSummary(wallet.address, shipment.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh shipment.");
    }
  }, [wallet, shipment]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${backendUrl}/api/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Backend unavailable");
        setApiState("online");
      })
      .catch(() => setApiState("offline"));
    fetch(`${backendUrl}/api/events?limit=8`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Escalation[]> : [])
      .then(setEvents)
      .catch(() => undefined);
    const stream = new EventSource(`${backendUrl}/api/stream`);
    stream.addEventListener("dispute_escalated", (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as Escalation;
      setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 8));
    });
    return () => {
      controller.abort();
      stream.close();
    };
  }, []);

  async function handleConnect() {
    setError("");
    try {
      setWallet(await connectWallet());
      setNotice("Wallet connected");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect wallet.");
    }
  }

  function upsertRows(updated: Shipment[]) {
    setShipments((current) => {
      const byId = new Map(updated.map((row) => [row.id, row]));
      const kept = current.map((row) => byId.get(row.id) ?? row);
      const added = updated.filter((row) => !current.some((existing) => existing.id === row.id));
      return [...added, ...kept];
    });
  }

  async function refreshRows(ids: string[]) {
    if (!wallet) return;
    const results = await Promise.allSettled(ids.map((id) => getShipmentSummary(wallet.address, id)));
    upsertRows(results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
    if (shipment && ids.includes(shipment.id)) await loadShipment(wallet.address, shipment.id).catch(() => undefined);
  }

  async function openShipment(id: string) {
    if (!wallet) return;
    setLoading(true);
    setError("");
    setNotice("");
    setShowDispute(false);
    try {
      await loadShipment(wallet.address, id);
    } catch (cause) {
      setShipment(null);
      setDetail(null);
      setReputation(null);
    }
  }
  async function loadShipment(address: string, id: string) {
    setLoading(true);
    try {
      const [summary, full] = await Promise.all([getShipmentSummary(address, id), getShipment(address, id)]);
      setShipment(summary);
      setDetail(full);
    } catch (cause) {
      setShipment(null);
      setDetail(null);
      setError(errorMessage(cause, "Unable to load shipment."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !shipmentId.trim()) return;
    await openShipment(shipmentId.trim());
  }

  /** Runs a signed contract call with the dashboard's shared loading/toast handling. */
  async function runWrite(action: (wallet: Wallet) => Promise<string>, success: string, fallback: string, refreshIds: string[]): Promise<boolean> {
    if (!wallet) return false;
    setWriting(true);
    setError("");
    setNotice("");
    try {
      const hash = await action(wallet);
      setNotice(`${success} · ${hash.slice(0, 12)}…`);
      await refreshRows(refreshIds);
      return true;
    } catch (cause) {
      setError(errorMessage(cause, fallback));
      return false;
    } finally {
      setWriting(false);
    }
  }

  async function handleDispute(milestoneIndex: number, reason: string) {
    if (!shipment) return false;
    const id = shipment.id;
    const ok = await runWrite((signer) => raiseDispute(signer, id, milestoneIndex, reason), `Dispute raised on milestone ${milestoneIndex + 1}`, "Dispute transaction failed.", [id]);
    if (ok) setShowDispute(false);
    return ok;
  }

  async function handleWarrantyClaim(evidence: string) {
    if (!shipment) return false;
    const id = shipment.id;
    return runWrite((signer) => fileWarrantyClaim(signer, id, evidence), "Warranty claim filed", "Warranty claim transaction failed.", [id]);
  }

  async function handleWarrantyResolution(refundBuyer: boolean) {
    if (!shipment) return false;
    const id = shipment.id;
    return runWrite((signer) => resolveWarrantyClaim(signer, id, refundBuyer), refundBuyer ? "Warranty claim refunded to buyer" : "Warranty claim dismissed", "Warranty resolution transaction failed.", [id]);
  }

  async function handleRating(stars: number) {
    if (!shipment) return false;
    const id = shipment.id;
    return runWrite((signer) => rateCounterparty(signer, id, stars), `Rated counterparty ${stars}/5`, "Rating transaction failed.", [id]);
  }

  async function handleBulkConfirm() {
    if (!wallet || !selectedIds.length) return false;
    const ids = [...selectedIds];
    setWriting(true);
    setError("");
    setNotice("");
    const confirmed: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];
    // Soroban allows one contract call per transaction, so each shipment is its own batch.
    for (const id of ids) {
      try {
        const { milestones } = await getShipmentDetail(wallet.address, id);
        const indices = milestones.flatMap((milestone, index) => milestone.status === "ProofSubmitted" ? [index] : []);
        if (!indices.length) {
          skipped.push(id);
          continue;
        }
        await batchConfirmMilestones(wallet, id, indices);
        confirmed.push(id);
      } catch (cause) {
        failed.push(`${id}: ${errorMessage(cause, "confirm failed")}`);
      }
    }
    await refreshRows(ids);
    setWriting(false);
    const summary = `Confirmed milestones on ${confirmed.length} shipment${confirmed.length === 1 ? "" : "s"}${skipped.length ? ` · ${skipped.length} had nothing to confirm` : ""}`;
    if (failed.length) {
      setError(`${summary} · ${failed.length} failed — ${failed.join("; ")}`);
      return false;
    }
    setNotice(summary);
    setSelectedIds([]);
    return true;
  }

  async function handleBulkCancel(reason: string) {
    const ids = [...selectedIds];
    const ok = await runWrite((signer) => batchCancelShipments(signer, ids, reason), `Cancelled ${ids.length} shipment${ids.length === 1 ? "" : "s"}`, "Batch cancel transaction failed.", ids);
    if (ok) setSelectedIds([]);
    return ok;
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setError("");
    setNotice("");
    await loadShipment(wallet.address, shipmentId.trim());
  }

  function handleActionStart() {
    setWriting(true);
    setError("");
    setNotice("");
  }

  function handleActionError(message: string) {
    setWriting(false);
    setError(message);
  }

  async function handleActionComplete(message: string, id: string) {
    setWriting(false);
    setNotice(message);
    setShipmentId(id);
    if (wallet) await loadShipment(wallet.address, id);
  }

  async function handleMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet || !shipment) return;
    setWriting(true);
    setError("");
    setNotice("");
    try {
      const hash = await setShipmentMetadata(wallet, shipment.id, metadataKey.trim(), metadataValue);
      setNotice(`On-chain metadata saved · ${hash.slice(0, 12)}…`);
      setMetadataKey("");
      setMetadataValue("");
      setShowMetadata(false);
    } catch (cause) {
      setError(errorMessage(cause, "Metadata transaction failed."));
    } finally {
      setWriting(false);
    }
  }

  const status = shipment?.status ?? "Waiting for lookup";
  const isBuyer = Boolean(wallet && detail?.buyers.includes(wallet.address));
  const isSupplier = Boolean(wallet && shipment && shipment.supplier === wallet.address);
  const isArbiter = Boolean(wallet && detail && detail.arbiter === wallet.address);
  const alreadyRated = Boolean(wallet && detail?.audit_log.some((entry) => entry.action === "counterparty_rated" && entry.caller === wallet.address));
  const disputeActivity: Escalation[] = shipment && detail ? detail.milestones.flatMap((milestone, index) => milestone.status === "Disputed" ? [{
    id: `${shipment.id}:${index}:dispute_raised`,
    ledger: Number(milestone.dispute_opened_ledger ?? 0),
    type: "dispute_raised",
    shipmentId: shipment.id,
    milestoneIndex: index,
    openedLedger: Number(milestone.dispute_opened_ledger ?? 0),
    currentLedger: Number(milestone.dispute_opened_ledger ?? 0),
  }] : []) : [];
  const activity = [...disputeActivity, ...events];
  const allSelected = shipments.length > 0 && shipments.every((row) => selectedIds.includes(row.id));
  const onVault = path === "/vault";
  const overviewLink = (hash: string) => ({
    href: `/${hash}`,
    onClick: (event: React.MouseEvent) => { if (onVault) navigate(`/${hash}`, event); },
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="StellarSettle home">
          <span className="brand-mark"><span /></span>
          <span className="brand-name">stellar<span>settle</span></span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">S</span>
          <span><strong>Settlement desk</strong><small>Contract operations</small></span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <a className={`nav-item ${onVault ? "" : "active"}`} {...overviewLink("#overview")}><LayoutDashboard size={17} />Overview</a>
          <a className="nav-item" {...overviewLink("#shipment")}><FileSearch size={17} />Shipments<span className="nav-count">{shipment ? "1" : "0"}</span></a>
          <a className="nav-item" {...overviewLink("#activity")}><Activity size={17} />Dispute activity{events.length > 0 && <span className="nav-count alert-count">{events.length}</span>}</a>
          <a className={`nav-item ${onVault ? "active" : ""}`} href="/vault" onClick={(event) => navigate("/vault", event)}><PiggyBank size={17} />Buyer vault</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="network-card">
            <span className="network-dot" />
            <span><strong>{appNetwork === "testnet" ? "Stellar Testnet" : "Stellar Mainnet"}</strong><small>Network configured</small></span>
          </div>
          <a className="nav-item help-link" href="https://developers.stellar.org/docs" target="_blank" rel="noreferrer"><CircleHelp size={17} />Stellar docs<ExternalLink size={13} /></a>
          <div className="profile-row">
            <span className="profile-avatar">{wallet ? wallet.address.slice(1, 2) : "S"}</span>
            <span><strong>{wallet ? shortAddress(wallet.address) : "Guest session"}</strong><small>{wallet ? "Wallet connected" : "Connect to get started"}</small></span>
            <button className="icon-button" aria-label="Account options"><ChevronDown size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area" id="overview">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{onVault ? "Buyer vault" : "Overview"}</strong></div>
          <div className="top-actions">
            <span className={`backend-indicator ${apiState}`}><span />API {apiState === "online" ? "connected" : apiState === "offline" ? "offline" : "checking"}</span>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} />{events.length > 0 && <i />}</button>
            <button className={`wallet-button ${wallet ? "connected" : ""}`} onClick={wallet ? () => setWallet(null) : handleConnect}>
              <WalletCards size={16} />{wallet ? shortAddress(wallet.address) : "Connect wallet"}
            </button>
          </div>
        </header>

        {onVault ? <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-rule" />BUYER</div>
              <h1>Escrow vault</h1>
              <p>Pre-fund escrow by depositing tokens into your contract-held vault.</p>
            </div>
            <div className="heading-meta"><span className="live-pulse" />LIVE NETWORK <span className="meta-divider" />{appNetwork.toUpperCase()}</div>
          </section>

          {(error || notice) && <div className={`toast ${error ? "toast-error" : "toast-success"}`} role="status">{error ? <X size={16} /> : <Check size={16} />}{error || notice}<button className="icon-button" onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss"><X size={15} /></button></div>}

          <VaultPage wallet={wallet} defaultToken={shipment?.token ?? ""} onConnect={handleConnect} onError={setError} onNotice={setNotice} />
        </div> : <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-rule" />OPERATIONS</div>
              <h1>Settlement overview</h1>
              <p>Shipment health and escrow activity on Stellar.</p>
            </div>
            <div className="heading-meta"><span className="live-pulse" />LIVE NETWORK <span className="meta-divider" />{appNetwork.toUpperCase()}</div>
          </section>

          <section className="metrics-grid" aria-label="Workspace status">
            <article className="metric metric-primary">
              <div className="metric-top"><span>Tracked shipment</span><span className="metric-icon green-icon"><FileSearch size={16} /></span></div>
              <div className="metric-value">{shipment ? shipment.id : "—"}</div>
              <div className="metric-foot"><span className="metric-foot-dot" />{shipment ? "Loaded from contract" : "Search by shipment ID"}</div>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Escrow value</span><span className="metric-icon blue-icon"><ArrowDownLeft size={16} /></span></div>
              <div className="metric-value">{shipment ? amount(shipment.total_amount) : "—"}<small>{shipment ? "base units" : "Awaiting data"}</small></div>
              <div className="metric-foot">{shipment ? `${amount(shipment.released_amount)} released` : "Connect and look up a shipment"}</div>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Open disputes</span><span className="metric-icon coral-icon"><ShieldCheck size={16} /></span></div>
              <div className="metric-value">{shipment ? shipment.open_disputes : "—"}</div>
              <div className="metric-foot">{shipment ? "On tracked shipment" : "No shipment selected"}</div>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Network status</span><span className="metric-icon amber-icon"><Activity size={16} /></span></div>
              <div className="metric-value status-metric">{apiState === "online" ? "Operational" : apiState === "offline" ? "Disconnected" : "Checking"}</div>
              <div className="metric-foot">Soroban RPC · {appNetwork}</div>
            </article>
          </section>

          {(error || notice) && <div className={`toast ${error ? "toast-error" : "toast-success"}`} role="status">{error ? <X size={16} /> : <Check size={16} />}{error || notice}<button className="icon-button" onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss"><X size={15} /></button></div>}

          <div className="content-grid">
            <section className="panel shipment-panel" id="shipment">
              <div className="panel-heading">
                <div><div className="section-kicker">CONTRACT DATA</div><h2>Shipment lookup</h2></div>
                <span className="chain-badge"><span />{configuredContractId ? "ON-CHAIN" : "CONTRACT NOT SET"}</span>
              </div>
              <form className="search-form" onSubmit={handleSearch}>
                <label className="search-input-wrap"><Search size={17} /><input aria-label="Shipment ID" placeholder="Enter shipment ID" value={shipmentId} onChange={(event) => setShipmentId(event.target.value)} /><kbd>↵</kbd></label>
                <button className="primary-button" disabled={!wallet || loading || !shipmentId.trim()}>{loading ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{loading ? "Loading" : "Look up"}</button>
              </form>
              {!wallet && <div className="inline-callout"><WalletCards size={16} /><span>Connect Freighter to query public contract data and submit authorized transactions.</span><button onClick={handleConnect}>Connect</button></div>}
              {shipment ? <div className="shipment-detail">
                <div className="detail-topline"><div className="shipment-ref"><span className="shipment-icon"><FileSearch size={18} /></span><span><strong>{shipment.id}</strong><small>Created at ledger {shipment.created_at.toLocaleString()}</small></span></div><StatusPill status={status} /></div>
                <div className="detail-grid">
                  <div><span>ESCROW TOTAL</span><strong>{amount(shipment.total_amount)} <small>units</small></strong></div>
                  <div><span>RELEASED</span><strong>{amount(shipment.released_amount)} <small>units</small></strong></div>
                  <div><span>MILESTONES</span><strong>{shipment.milestone_count}</strong></div>
                  <div><span>OPEN DISPUTES</span><strong className={shipment.open_disputes ? "text-coral" : ""}>{shipment.open_disputes}</strong></div>
                </div>
                <div className="detail-footer"><span>Supplier <code>{shortAddress(shipment.supplier)}</code><span className="footer-sep"> · </span>Token <code>{shortAddress(shipment.token)}</code></span><span className="detail-actions">{wallet && <button className="text-button" onClick={() => setShowTopUp((shown) => !shown)}><ArrowDownLeft size={15} />Top up escrow</button>}<button className="text-button" onClick={() => setShowMetadata((shown) => !shown)}><Plus size={15} />Add metadata</button></span></div>
                {showTopUp && wallet && <TopUpForm wallet={wallet} shipmentId={shipment.id} onToppedUp={async () => { await refreshShipment(); setShowTopUp(false); }} onError={setError} onNotice={setNotice} />}
                {showMetadata && <form className="metadata-form" onSubmit={handleMetadata}>
                  <input aria-label="Metadata key" placeholder="Key (e.g. po_number)" value={metadataKey} onChange={(event) => setMetadataKey(event.target.value)} pattern="[a-zA-Z0-9_]{1,32}" required />
                  <input aria-label="Metadata value" placeholder="Value" value={metadataValue} onChange={(event) => setMetadataValue(event.target.value)} maxLength={1000} required />
                  <button className="primary-button" disabled={writing}>{writing ? <LoaderCircle className="spin" size={15} /> : <ArrowUpRight size={15} />}{writing ? "Signing" : "Sign & save"}</button>
                </form>}
                {wallet && <ShipmentMilestones key={shipment.id} wallet={wallet} shipmentId={shipment.id} onShipmentChanged={refreshShipment} onError={setError} onNotice={setNotice} />}
              </div> : <div className="empty-shipment"><span className="empty-icon"><FileSearch size={23} /></span><strong>Shipment details appear here</strong><span>Look up a shipment ID to inspect escrow, milestone, and dispute status.</span></div>}
              <div className="panel-bottom-note"><span>Amounts shown in the token's smallest units.</span><a href={`https://stellar.expert/explorer/${appNetwork}/contract/${configuredContractId || ""}`} target="_blank" rel="noreferrer">View contract <ExternalLink size={13} /></a></div>
            </section>

            <section className="panel activity-panel" id="activity">
              <div className="panel-heading">
                <div><div className="section-kicker">EVENT MONITOR</div><h2>Dispute activity</h2></div>
                <button className="icon-button refresh-button" title="Refresh events" onClick={() => fetch(`${backendUrl}/api/events?limit=8`).then((response) => response.json()).then(setEvents).catch(() => setError("Could not refresh backend events."))}><RefreshCw size={16} /></button>
              </div>
              {activity.length ? <div className="event-list">{activity.map((event) => <article className={`event-row ${event.type}`} key={event.id}>
                <span className="event-mark">{event.type === "dispute_raised" ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}</span>
                <span className="event-copy"><strong>{eventLabels[event.type] ?? "Dispute escalated"}</strong><small>{event.shipmentId} · Milestone {event.milestoneIndex + 1}</small></span>
                <span className="event-ledger">L{event.ledger.toLocaleString()}</span>
              </article>)}</div> : <div className="empty-events"><span className="empty-icon subtle-icon"><Bell size={21} /></span><strong>No escalation events</strong><span>New contract alerts will appear here in real time.</span></div>}
              <div className="activity-footer"><span className="stream-dot" />Listening for dispute_escalated<span className="stream-status">{apiState === "online" ? "Connected" : "Offline"}</span></div>
            </section>
          </div>

          <CreateShipmentForm wallet={wallet} onStart={handleActionStart} onCreated={(id, hash) => handleActionComplete(`Shipment ${id} created · ${hash.slice(0, 12)}…`, id)} onError={handleActionError} />

          <section className="panel table-panel">
            <div className="panel-heading table-heading">
              <div><div className="section-kicker">RECENTLY VIEWED</div><h2>Shipment record</h2></div>
              <button className="filter-button" onClick={() => { setShipment(null); setDetail(null); setShipmentId(""); }}>Clear view <X size={14} /></button>
            </div>
            <BulkActionsToolbar selectedCount={selectedIds.length} maxCancel={maxBatchCancel} busy={writing} onConfirm={handleBulkConfirm} onCancel={handleBulkCancel} onClear={() => setSelectedIds([])} />
            <div className="table-wrap">
              <table>
                <thead><tr><th className="select-cell"><input type="checkbox" aria-label="Select all shipments" checked={allSelected} disabled={!shipments.length || writing} onChange={() => setSelectedIds(allSelected ? [] : shipments.map((row) => row.id))} /></th><th>SHIPMENT</th><th>STATUS</th><th>ESCROW</th><th>MILESTONES</th><th>DISPUTES</th><th>CREATED LEDGER</th></tr></thead>
                <tbody>{shipments.length ? shipments.map((row) => <tr key={row.id} className={selectedIds.includes(row.id) ? "row-selected" : ""}><td className="select-cell"><input type="checkbox" aria-label={`Select shipment ${row.id}`} checked={selectedIds.includes(row.id)} disabled={writing} onChange={() => toggleSelected(row.id)} /></td><td><button className="table-id table-link" onClick={() => openShipment(row.id)}><span className="table-file"><FileSearch size={14} /></span>{row.id}</button></td><td><StatusPill status={row.status} /></td><td>{amount(row.total_amount)} <span className="muted">units</span></td><td>{row.milestone_count}</td><td>{row.open_disputes > 0 ? <span className="dispute-count">{row.open_disputes} open</span> : "None"}</td><td>{row.created_at.toLocaleString()}</td></tr>) : <tr><td colSpan={7} className="table-empty">No shipment loaded. Search above to view a contract record.</td></tr>}</tbody>
              </table>
            </div>
          </section>

          <footer className="page-footer"><span>StellarSettle operations · Soroban contract interface</span><span><span className="footer-live" />{appNetwork} <span className="footer-sep">·</span> Contract {configuredContractId ? shortAddress(configuredContractId) : "not configured"}</span></footer>
        </div>}
      </main>
    </div>
  );
}

export default App;