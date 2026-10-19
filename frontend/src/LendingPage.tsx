import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleAlert,
  Coins,
  Gauge,
  Landmark,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { Wallet } from "./lib/stellar";
import {
  borrow,
  borrowCapacity,
  configuredLoanManagerContractId,
  depositCollateral,
  depositLiquidity,
  getLoanSnapshot,
  healthFactor,
  loanManagerNetwork,
  repay,
  withdrawLiquidity,
  type LoanPosition,
  type LoanSnapshot,
} from "./lib/loanManager";

type Props = { wallet: Wallet | null; onConnect: () => Promise<void> };
const maxInt128 = ((1n << 127n) - 1n).toString();

function formatAmount(value: bigint | string) {
  try {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(BigInt(value));
  } catch {
    return String(value);
  }
}

function healthLabel(position: LoanPosition, snapshot: LoanSnapshot) {
  if (BigInt(position.debt) === 0n) return "No debt";
  const ratio = healthFactor(position, snapshot);
  if (ratio.denominator === 0n) return "Unavailable";
  const scaled = ratio.numerator * 100n / ratio.denominator;
  return `${scaled / 100n}.${String(scaled % 100n).padStart(2, "0")}`;
}

function explainError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Transaction failed. Check the network and try again.";
  if (/insufficient pool liquidity/i.test(message)) return "Insufficient pool liquidity. Reduce the borrow amount or wait for repayments.";
  if (/insufficient depositor balance/i.test(message)) return "The withdrawal exceeds your deposited balance.";
  if (/insufficient collateral|undercollateralize/i.test(message)) return "That amount would exceed the collateral-backed limit at current oracle prices.";
  if (/paused/i.test(message)) return "The lending pool is paused. Transactions are temporarily disabled.";
  return message;
}

function Field({ label, value, onChange, disabled, max }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  max?: string;
}) {
  return (
    <label className="loan-field">
      <span>{label}</span>
      <input
        aria-label={label}
        inputMode="numeric"
        min="1"
        maxLength={39}
        pattern="[0-9]+"
        placeholder="Amount in base units"
        type="text"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          const limit = max ?? maxInt128;
          const exceedsLimit = /^\d+$/.test(next) && BigInt(next) > BigInt(limit);
          event.target.setCustomValidity(exceedsLimit
            ? max ? `Maximum available: ${formatAmount(max)} units.` : "Amount exceeds the Soroban i128 limit."
            : "");
          onChange(next);
        }}
        disabled={disabled}
        required
      />
    </label>
  );
}

function LendingPage({ wallet, onConnect }: Props) {
  const [snapshot, setSnapshot] = useState<LoanSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [depositValue, setDepositValue] = useState("");
  const [withdrawValue, setWithdrawValue] = useState("");
  const [collateralValue, setCollateralValue] = useState("");
  const [borrowValue, setBorrowValue] = useState("");
  const [repayValue, setRepayValue] = useState("");

  async function refresh() {
    if (!wallet) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setSnapshot(await getLoanSnapshot(wallet));
    } catch (cause) {
      setSnapshot(null);
      setError(explainError(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [wallet]);

  async function transact(label: string, action: () => Promise<string>) {
    setWriting(label);
    setError("");
    setNotice("");
    try {
      const hash = await action();
      if (wallet) setSnapshot(await getLoanSnapshot(wallet));
      setNotice(`${label} confirmed · ${hash.slice(0, 12)}…`);
    } catch (cause) {
      setError(explainError(cause));
    } finally {
      setWriting("");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, label: string, action: () => Promise<string>) {
    event.preventDefault();
    void transact(label, action);
  }

  const freeLiquidity = snapshot
    ? BigInt(snapshot.pool.totalDeposits) - BigInt(snapshot.pool.totalBorrowed)
    : 0n;
  const withdrawable = snapshot
    ? [BigInt(snapshot.depositorBalance), freeLiquidity].reduce((min, value) => value < min ? value : min)
    : 0n;
  const capacity = snapshot ? borrowCapacity(snapshot) : 0n;
  const projectedPosition = snapshot && BigInt(snapshot.position.debt) > 0n
    ? {
      ...snapshot.position,
      debt: String(BigInt(snapshot.position.debt) - (repayValue && /^\d+$/.test(repayValue)
        ? [BigInt(repayValue), BigInt(snapshot.position.debt)].reduce((min, value) => value < min ? value : min)
        : 0n)),
    }
    : snapshot?.position;

  if (!configuredLoanManagerContractId) {
    return (
      <section className="lending-page">
        <div className="page-heading">
          <div><div className="eyebrow"><span className="eyebrow-rule" />LENDING MARKETS</div><h1>Lending pool</h1><p>Liquidity and collateral-backed borrowing on Stellar.</p></div>
          <div className="heading-meta">{loanManagerNetwork.toUpperCase()}</div>
        </div>
        <section className="panel loan-unconfigured" aria-live="polite">
          <span className="empty-icon"><Landmark size={22} /></span>
          <h2>Lending contract not configured</h2>
          <p>This page is a placeholder until the loan manager contract address is configured.</p>
          <code>VITE_LOAN_MANAGER_CONTRACT_ID</code>
        </section>
      </section>
    );
  }

  return (
    <section className="lending-page">
      <div className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-rule" />LENDING MARKETS</div><h1>Lending pool</h1><p>Supply liquidity or borrow against oracle-priced collateral.</p></div>
        <div className="lending-heading-actions">
          <div className="heading-meta"><span className="live-pulse" />{loanManagerNetwork.toUpperCase()}</div>
          <button className="icon-button refresh-button" onClick={() => void refresh()} disabled={!wallet || loading} aria-label="Refresh lending data" title="Refresh lending data">
            {loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>

      {!wallet && <div className="inline-callout lending-connect"><WalletCards size={16} /><span>Connect Freighter to view pool data and submit lending transactions.</span><button onClick={() => void onConnect()}>Connect</button></div>}
      {(error || notice) && <div className={`toast ${error ? "toast-error" : "toast-success"}`} role={error ? "alert" : "status"}>
        {error ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}{error || notice}
      </div>}

      {snapshot && <>
        {snapshot.paused && <div className="pool-paused"><CircleAlert size={15} />Pool paused: state-changing calls are currently unavailable.</div>}
        <section className="metrics-grid lending-metrics" aria-label="Lending pool status">
          <article className="metric metric-primary"><div className="metric-top"><span>Total liquidity</span><span className="metric-icon green-icon"><Coins size={16} /></span></div><div className="metric-value">{formatAmount(snapshot.pool.totalDeposits)}</div><div className="metric-foot">Debt-token base units</div></article>
          <article className="metric"><div className="metric-top"><span>Available to borrow</span><span className="metric-icon blue-icon"><ArrowUpFromLine size={16} /></span></div><div className="metric-value">{formatAmount(freeLiquidity > 0n ? freeLiquidity : 0n)}</div><div className="metric-foot">Pool liquidity not currently borrowed</div></article>
          <article className="metric"><div className="metric-top"><span>Your deposits</span><span className="metric-icon amber-icon"><ArrowDownToLine size={16} /></span></div><div className="metric-value">{formatAmount(snapshot.depositorBalance)}</div><div className="metric-foot">Maximum withdrawable {formatAmount(withdrawable)}</div></article>
          <article className="metric"><div className="metric-top"><span>Your health factor</span><span className="metric-icon coral-icon"><Gauge size={16} /></span></div><div className="metric-value status-metric">{healthLabel(snapshot.position, snapshot)}</div><div className="metric-foot">Healthy at 1.00 or above</div></article>
        </section>

        <div className="lending-grid">
          <section className="panel lending-panel">
            <div className="panel-heading"><div><div className="section-kicker">LIQUIDITY PROVIDER</div><h2>Deposit or withdraw</h2></div><span className="chain-badge"><span />POOL</span></div>
            <div className="loan-forms">
              <form className="loan-form" onSubmit={(event) => submit(event, "Deposit", () => depositLiquidity(wallet!, depositValue))}>
                <div className="loan-form-heading"><ArrowDownToLine size={16} /><strong>Deposit liquidity</strong></div>
                <Field label="Deposit amount" value={depositValue} onChange={setDepositValue} disabled={!wallet || !!writing || snapshot.paused} />
                <button className="primary-button" disabled={!wallet || !!writing || snapshot.paused}>{writing === "Deposit" ? <LoaderCircle className="spin" size={15} /> : <ArrowDownToLine size={15} />}{writing === "Deposit" ? "Signing" : "Deposit"}</button>
              </form>
              <form className="loan-form" onSubmit={(event) => submit(event, "Withdraw", () => withdrawLiquidity(wallet!, withdrawValue))}>
                <div className="loan-form-heading"><ArrowUpFromLine size={16} /><strong>Withdraw liquidity</strong></div>
                <Field label="Withdraw amount" value={withdrawValue} onChange={setWithdrawValue} disabled={!wallet || !!writing || snapshot.paused} max={withdrawable.toString()} />
                <div className="loan-form-note">Up to {formatAmount(withdrawable)} units, limited by pool liquidity.</div>
                <button className="secondary-button" disabled={!wallet || !!writing || snapshot.paused || withdrawable === 0n}>{writing === "Withdraw" ? <LoaderCircle className="spin" size={15} /> : <ArrowUpFromLine size={15} />}{writing === "Withdraw" ? "Signing" : "Withdraw"}</button>
              </form>
            </div>
          </section>

          <section className="panel lending-panel">
            <div className="panel-heading"><div><div className="section-kicker">BORROWER POSITION</div><h2>Collateral and debt</h2></div><span className="chain-badge"><span />ORACLE PRICED</span></div>
            <div className="position-summary">
              <div><span>COLLATERAL</span><strong>{formatAmount(snapshot.position.collateral)}</strong></div>
              <div><span>OUTSTANDING DEBT</span><strong>{formatAmount(snapshot.position.debt)}</strong></div>
              <div><span>BORROW CAPACITY</span><strong>{formatAmount(capacity)}</strong></div>
            </div>
            <div className="oracle-note">Oracle prices: collateral {formatAmount(snapshot.collateralPrice)} · debt {formatAmount(snapshot.debtPrice)} (1e8 scale)</div>
            <div className="loan-forms borrower-forms">
              <form className="loan-form" onSubmit={(event) => submit(event, "Post collateral", () => depositCollateral(wallet!, collateralValue))}>
                <div className="loan-form-heading"><Coins size={16} /><strong>Post collateral</strong></div>
                <Field label="Collateral amount" value={collateralValue} onChange={setCollateralValue} disabled={!wallet || !!writing || snapshot.paused} />
                <button className="primary-button" disabled={!wallet || !!writing || snapshot.paused}>{writing === "Post collateral" ? <LoaderCircle className="spin" size={15} /> : <Coins size={15} />}{writing === "Post collateral" ? "Signing" : "Post collateral"}</button>
              </form>
              <form className="loan-form" onSubmit={(event) => submit(event, "Borrow", () => borrow(wallet!, borrowValue))}>
                <div className="loan-form-heading"><ArrowUpFromLine size={16} /><strong>Borrow debt tokens</strong></div>
                <Field label="Borrow amount" value={borrowValue} onChange={setBorrowValue} disabled={!wallet || !!writing || snapshot.paused} max={capacity.toString()} />
                <div className="loan-form-note">Available capacity: {formatAmount(capacity)} units.</div>
                <button className="secondary-button" disabled={!wallet || !!writing || snapshot.paused || capacity === 0n}>{writing === "Borrow" ? <LoaderCircle className="spin" size={15} /> : <ArrowUpFromLine size={15} />}{writing === "Borrow" ? "Signing" : "Borrow"}</button>
              </form>
              <form className="loan-form loan-form-repay" onSubmit={(event) => submit(event, "Repay", () => repay(wallet!, repayValue))}>
                <div className="loan-form-heading"><ArrowDownToLine size={16} /><strong>Repay debt</strong></div>
                <Field label="Repay amount" value={repayValue} onChange={setRepayValue} disabled={!wallet || !!writing || snapshot.paused || BigInt(snapshot.position.debt) === 0n} max={snapshot.position.debt} />
                <div className="repay-preview"><span>Health factor</span><strong>{healthLabel(snapshot.position, snapshot)} <span>→</span> {projectedPosition ? healthLabel(projectedPosition, snapshot) : "—"}</strong></div>
                <button className="primary-button" disabled={!wallet || !!writing || snapshot.paused || BigInt(snapshot.position.debt) === 0n}>{writing === "Repay" ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}{writing === "Repay" ? "Signing" : "Repay"}</button>
              </form>
            </div>
          </section>
        </div>
        <div className="market-addresses"><span>Collateral <code>{snapshot.market.collateral_token}</code></span><span>Debt <code>{snapshot.market.debt_token}</code></span></div>
      </>}
    </section>
  );
}

export default LendingPage;