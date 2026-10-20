import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, LoaderCircle, PiggyBank, RefreshCw, WalletCards } from "lucide-react";
import { getVaultBalance, vaultDeposit, vaultWithdraw, type Wallet } from "../lib/stellar";
import { amount, errorMessage, isPositiveAmount } from "../lib/format";

type Props = {
  wallet: Wallet | null;
  defaultToken?: string;
  onConnect: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

type Action = "deposit" | "withdraw";

const tokenPattern = /^C[A-Z2-7]{55}$/;

export function VaultPage({ wallet, defaultToken = "", onConnect, onError, onNotice }: Props) {
  const [token, setToken] = useState(defaultToken);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const validToken = tokenPattern.test(token.trim());

  const loadBalance = useCallback(async () => {
    if (!wallet || !validToken) return;
    setLoading(true);
    try {
      setBalance(await getVaultBalance(wallet.address, token.trim()));
    } catch (cause) {
      setBalance(null);
      onError(errorMessage(cause, "Unable to load vault balance."));
    } finally {
      setLoading(false);
    }
  }, [wallet, token, validToken, onError]);

  useEffect(() => {
    setBalance(null);
    void loadBalance();
  }, [loadBalance]);

  async function handleAction(action: Action, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = (action === "deposit" ? depositAmount : withdrawAmount).trim();
    if (!wallet || !validToken || !isPositiveAmount(value)) return;
    setPending(action);
    onError("");
    onNotice("");
    try {
      const hash = action === "deposit"
        ? await vaultDeposit(wallet, token.trim(), value)
        : await vaultWithdraw(wallet, token.trim(), value);
      // Reflect the confirmed transaction right away, then reconcile with the contract.
      setBalance((current) => {
        const base = BigInt(current ?? "0");
        const next = action === "deposit" ? base + BigInt(value) : base - BigInt(value);
        return (next < 0n ? 0n : next).toString();
      });
      onNotice(`Vault ${action === "deposit" ? "deposit" : "withdrawal"} confirmed · ${hash.slice(0, 12)}…`);
      if (action === "deposit") setDepositAmount(""); else setWithdrawAmount("");
      void loadBalance();
    } catch (cause) {
      onError(errorMessage(cause, `Vault ${action === "deposit" ? "deposit" : "withdrawal"} failed.`));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel vault-panel" id="vault">
      <div className="panel-heading">
        <div><div className="section-kicker">BUYER ESCROW VAULT</div><h2>Vault balance</h2></div>
        <button className="icon-button refresh-button" title="Refresh balance" aria-label="Refresh balance" disabled={!wallet || !validToken || loading} onClick={() => void loadBalance()}><RefreshCw size={16} /></button>
      </div>
      {!wallet && <div className="inline-callout"><WalletCards size={16} /><span>Connect Freighter to view and manage your vault balance.</span><button onClick={onConnect}>Connect</button></div>}
      <div className="vault-body">
        <label className="field-label">
          <span>TOKEN CONTRACT</span>
          <input aria-label="Token address" placeholder="C… token contract address" value={token} onChange={(event) => setToken(event.target.value)} />
        </label>
        <div className="vault-balance" aria-live="polite">
          <span className="metric-icon green-icon"><PiggyBank size={16} /></span>
          <span>
            <small>AVAILABLE BALANCE</small>
            <strong data-testid="vault-balance">{loading && balance === null ? <LoaderCircle className="spin" size={16} /> : balance !== null ? amount(balance) : "—"}</strong>
            <small>{validToken ? "base units" : "Enter a token contract to load"}</small>
          </span>
        </div>
        <div className="vault-forms">
          <form className="metadata-form action-form" onSubmit={(event) => handleAction("deposit", event)}>
            <input aria-label="Deposit amount" inputMode="numeric" pattern="[0-9]+" placeholder="Deposit amount" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} required />
            <button className="primary-button" disabled={!wallet || !validToken || pending !== null || !isPositiveAmount(depositAmount)}>{pending === "deposit" ? <LoaderCircle className="spin" size={15} /> : <ArrowDownLeft size={15} />}{pending === "deposit" ? "Signing" : "Deposit"}</button>
          </form>
          <form className="metadata-form action-form" onSubmit={(event) => handleAction("withdraw", event)}>
            <input aria-label="Withdraw amount" inputMode="numeric" pattern="[0-9]+" placeholder="Withdraw amount" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} required />
            <button className="primary-button" disabled={!wallet || !validToken || pending !== null || !isPositiveAmount(withdrawAmount)}>{pending === "withdraw" ? <LoaderCircle className="spin" size={15} /> : <ArrowUpRight size={15} />}{pending === "withdraw" ? "Signing" : "Withdraw"}</button>
          </form>
        </div>
      </div>
      <div className="panel-bottom-note"><span>Vaulted funds can be used to fund new shipments without a fresh transfer.</span></div>
    </section>
  );
}
