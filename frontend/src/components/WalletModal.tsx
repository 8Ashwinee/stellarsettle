import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { walletAdapters, type WalletId } from "../lib/wallets";
import "./wallet-modal.css";

export function WalletModal({ onSelect, onClose }: { onSelect: (id: WalletId) => void; onClose: () => void }) {
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(walletAdapters.map(async (adapter) => [adapter.id, await adapter.isAvailable()] as const))
      .then((entries) => { if (!cancelled) setAvailable(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="wallet-modal-backdrop" onClick={onClose}>
      <div className="wallet-modal" role="dialog" aria-modal="true" aria-label="Connect a wallet" onClick={(event) => event.stopPropagation()}>
        <div className="wallet-modal-head">
          <strong>Connect a wallet</strong>
          <button type="button" className="wallet-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <ul className="wallet-modal-list">
          {walletAdapters.map((adapter) => {
            const ready = available?.[adapter.id];
            return (
              <li key={adapter.id}>
                <button type="button" className="wallet-modal-option" disabled={!ready} onClick={() => onSelect(adapter.id)}>
                  <span>{adapter.name}</span>
                  <small>{available === null ? "Checking…" : ready ? "Detected" : "Not detected"}</small>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
