import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Wallet } from "../lib/stellar";
import { queryContract, scAddr } from "../lib/contractCalls";
import { completionRate, formatAverageRating, isStellarAddress, supplierFromHash, supplierHash, tierName, totalOrders, type Reputation } from "../lib/reputation";
import "./SupplierProfile.css";

type Profile = { reputation: Reputation; ratingCount: number; averageX100: number; tier: string };

export function SupplierProfile({ wallet }: { wallet: Wallet | null }) {
  const [input, setInput] = useState(() => supplierFromHash(window.location.hash));
  const [address, setAddress] = useState(() => supplierFromHash(window.location.hash));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onHash = () => { const next = supplierFromHash(window.location.hash); if (next) { setInput(next); setAddress(next); } };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!wallet || !address) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setProfile(null);
    (async () => {
      if (!isStellarAddress(address)) throw new Error("Invalid supplier address.");
      const arg = [scAddr(address)];
      const [rep, rating, tier] = await Promise.all([
        queryContract<Reputation>(wallet.address, "get_reputation", arg),
        queryContract<[number, number]>(wallet.address, "get_rating_summary", arg),
        queryContract<unknown>(wallet.address, "get_supplier_tier", arg),
      ]);
      if (!cancelled) setProfile({ reputation: rep, ratingCount: Number(rating[0]), averageX100: Number(rating[1]), tier: tierName(tier) });
    })()
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load supplier profile."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [wallet, address]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = input.trim();
    if (!next) return;
    window.location.hash = supplierHash(next);
    setAddress(next);
  }

  return (
    <section className="panel supplier-profile" aria-label="Supplier reputation">
      <div className="panel-heading"><div><div className="section-kicker">REPUTATION</div><h2>Supplier profile</h2></div></div>
      <form className="search-form" onSubmit={submit}>
        <input aria-label="Supplier address" placeholder="Supplier address (G...)" value={input} onChange={(event) => setInput(event.target.value)} />
        <button className="primary-button" disabled={!wallet || loading || !input.trim()}>View</button>
      </form>
      {!wallet && <p className="sp-note">Connect a wallet to load supplier reputation.</p>}
      {loading && <p className="sp-note"><LoaderCircle className="spin" size={15} /> Loading profile</p>}
      {error && <p className="sp-note sp-error" role="alert">{error}</p>}
      {profile && (
        <div className="sp-grid">
          <div><span>TIER</span><strong className={`sp-tier sp-${profile.tier.toLowerCase()}`}>{profile.tier}</strong></div>
          <div><span>COMPLETED</span><strong>{profile.reputation.completed}</strong></div>
          <div><span>DISPUTED</span><strong>{profile.reputation.disputed}</strong></div>
          <div><span>CANCELLED</span><strong>{profile.reputation.cancelled}</strong></div>
          <div><span>COMPLETION RATE</span><strong>{completionRate(profile.reputation)}</strong><small>{totalOrders(profile.reputation)} shipments</small></div>
          <div><span>RATING</span><strong>{profile.ratingCount ? `${formatAverageRating(profile.averageX100)} / 5` : "Not rated"}</strong><small>{profile.ratingCount} ratings</small></div>
        </div>
      )}
    </section>
  );
}
