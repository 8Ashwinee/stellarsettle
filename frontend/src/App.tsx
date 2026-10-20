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
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { appNetwork, configuredContractId, connectWallet, getShipmentSummary, setShipmentMetadata, type Shipment, type Wallet } from "./lib/stellar";
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

type Notification = Escalation & {
  read: boolean;
};

const backendUrl = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8787").replace(/\/$/, "");

function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function App() {
  const [path, setPath] = useState(currentPath);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [shipmentId, setShipmentId] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [events, setEvents] = useState<Escalation[]>([]);
  const [apiState, setApiState] = useState<"checking" | "online" | "offline">("checking");
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showMetadata, setShowMetadata] = useState(false);
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");
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
    fetch(`${backendUrl}/api/events?limit=20`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Escalation[]> : [])
      .then((events) => setNotifications(events.map((e) => ({ ...e, read: false }))))
      .catch(() => undefined);
    const stream = new EventSource(`${backendUrl}/api/stream`);
    stream.addEventListener("dispute_escalated", (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as Escalation;
      setNotifications((current) => [
        { ...event, read: false },
        ...current.filter((item) => item.id !== event.id)
      ].slice(0, 20));
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
  const unreadCount = notifications.filter((n) => !n.read).length;
  const eventTypes = Array.from(new Set(notifications.map((n) => n.type)));
  const filteredNotifications = selectedEventType
    ? notifications.filter((n) => n.type === selectedEventType)
    : notifications;

  function markNotificationsAsRead() {
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
  }

  function handleNotificationClick(id: string) {
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }
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
          <a className="nav-item active" href="#overview"><LayoutDashboard size={17} />Overview</a>
          <a className="nav-item" href="#shipment"><FileSearch size={17} />Shipments<span className="nav-count">{shipment ? "1" : "0"}</span></a>
          <a className="nav-item" href="#activity"><Activity size={17} />Dispute activity{unreadCount > 0 && <span className="nav-count alert-count">{unreadCount}</span>}</a>
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
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => { markNotificationsAsRead(); setSelectedEventType(null); }}><Bell size={17} />{unreadCount > 0 && <i />}</button>
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
                <div className="detail-topline"><div className="shipment-ref"><span className="shipment-icon"><FileSearch size={18} /></span><span><strong>{shipment.id}</strong><small>Created at ledger {shipment.created_at.toLocaleString()}</small></span></div><span className={`status-pill ${status.toLowerCase()}`}><span />{status}</span></div>
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
                <div><div className="section-kicker">NOTIFICATION CENTER</div><h2>Event monitor</h2></div>
                <button className="icon-button refresh-button" title="Refresh notifications" onClick={() => fetch(`${backendUrl}/api/events?limit=20`).then((response) => response.json()).then((events: Escalation[]) => setNotifications(events.map((e) => ({ ...e, read: true })))).catch(() => setError("Could not refresh backend events."))}><RefreshCw size={16} /></button>
              </div>
              {notifications.length > 0 ? <>
                {eventTypes.length > 1 && <div className="event-type-filters">
                  <button
                    className={`filter-chip ${!selectedEventType ? "active" : ""}`}
                    onClick={() => setSelectedEventType(null)}
                  >
                    All events ({notifications.length})
                  </button>
                  {eventTypes.map((type) => {
                    const count = notifications.filter((n) => n.type === type).length;
                    return (
                      <button
                        key={type}
                        className={`filter-chip ${selectedEventType === type ? "active" : ""}`}
                        onClick={() => setSelectedEventType(type)}
                      >
                        {type} ({count})
                      </button>
                    );
                  })}
                </div>}
                <div className="event-list">{filteredNotifications.map((notification) => (
                  <article
                    key={notification.id}
                    className={`event-row ${!notification.read ? "unread" : ""}`}
                    onClick={() => handleNotificationClick(notification.id)}
                  >
                    {!notification.read && <span className="unread-indicator" title="Unread" />}
                    <span className="event-mark"><ShieldCheck size={15} /></span>
                    <span className="event-copy">
                      <strong>{notification.type === "dispute_escalated" ? "Dispute escalated" : notification.type}</strong>
                      <small>{notification.shipmentId} · Milestone {notification.milestoneIndex + 1}</small>
                    </span>
                    <span className="event-ledger">L{notification.ledger.toLocaleString()}</span>
                  </article>
                ))}</div>
              </> : <div className="empty-events"><span className="empty-icon subtle-icon"><Bell size={21} /></span><strong>No events yet</strong><span>Contract events and notifications will appear here in real time.</span></div>}
              <div className="activity-footer"><span className="stream-dot" />Listening for all event types<span className="stream-status">{apiState === "online" ? "Connected" : "Offline"}</span></div>
            </section>
          </div>

          <CreateShipmentForm wallet={wallet} onStart={handleActionStart} onCreated={(id, hash) => handleActionComplete(`Shipment ${id} created · ${hash.slice(0, 12)}…`, id)} onError={handleActionError} />

          <section className="panel table-panel">
            <div className="panel-heading table-heading">
              <div><div className="section-kicker">RECENTLY VIEWED</div><h2>Shipment record</h2></div>
              <button className="filter-button" onClick={() => { setShipment(null); setDetail(null); setShipmentId(""); }}>Clear view <X size={14} /></button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>SHIPMENT</th><th>STATUS</th><th>ESCROW</th><th>MILESTONES</th><th>DISPUTES</th><th>CREATED LEDGER</th></tr></thead>
                <tbody>{shipment ? <tr><td><span className="table-id"><span className="table-file"><FileSearch size={14} /></span>{shipment.id}</span></td><td><span className={`status-pill ${status.toLowerCase()}`}><span />{status}</span></td><td>{amount(shipment.total_amount)} <span className="muted">units</span></td><td>{shipment.milestone_count}</td><td>{shipment.open_disputes > 0 ? <span className="dispute-count">{shipment.open_disputes} open</span> : "None"}</td><td>{shipment.created_at.toLocaleString()}</td></tr> : <tr><td colSpan={6} className="table-empty">No shipment loaded. Search above to view a contract record.</td></tr>}</tbody>
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