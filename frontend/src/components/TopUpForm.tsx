import { useState } from "react";
import { ArrowDownLeft, LoaderCircle } from "lucide-react";
import { topUpEscrow, type Wallet } from "../lib/stellar";
import { errorMessage, isPositiveAmount } from "../lib/format";

type Props = {
  wallet: Wallet;
  shipmentId: string;
  onToppedUp: () => Promise<void> | void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

export function TopUpForm({ wallet, shipmentId, onToppedUp, onError, onNotice }: Props) {
  const [value, setValue] = useState("");
  const [writing, setWriting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isPositiveAmount(value)) return;
    setWriting(true);
    onError("");
    onNotice("");
    try {
      const hash = await topUpEscrow(wallet, shipmentId, value.trim());
      onNotice(`Escrow topped up · ${hash.slice(0, 12)}…`);
      setValue("");
      await onToppedUp();
    } catch (cause) {
      onError(errorMessage(cause, "Top-up transaction failed."));
    } finally {
      setWriting(false);
    }
  }

  return (
    <form className="metadata-form action-form" onSubmit={handleSubmit}>
      <input aria-label="Top-up amount" inputMode="numeric" pattern="[0-9]+" placeholder="Additional escrow amount" value={value} onChange={(event) => setValue(event.target.value)} required />
      <button className="primary-button" disabled={writing || !isPositiveAmount(value)}>{writing ? <LoaderCircle className="spin" size={15} /> : <ArrowDownLeft size={15} />}{writing ? "Signing" : "Sign & top up"}</button>
    </form>
  );
}
