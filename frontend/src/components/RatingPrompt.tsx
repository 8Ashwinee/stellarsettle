import { useState } from "react";
import { LoaderCircle, Star } from "lucide-react";
import type { Reputation } from "../lib/stellar";

type RatingPromptProps = {
  counterpartyLabel: string;
  reputation: Reputation | null;
  alreadyRated: boolean;
  busy: boolean;
  onRate: (stars: number) => Promise<boolean>;
};

function shortAddress(address: string) {
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

export function RatingPrompt({ counterpartyLabel, reputation, alreadyRated, busy, onRate }: RatingPromptProps) {
  const [stars, setStars] = useState(0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stars < 1) return;
    if (await onRate(stars)) setStars(0);
  }

  return (
    <div className="sub-panel rating-panel" aria-label="Counterparty rating">
      <div className="sub-panel-heading"><Star size={15} /><strong>Rate the {counterpartyLabel}</strong>{reputation && <code>{shortAddress(reputation.address)}</code>}</div>
      {reputation && <div className="detail-grid compact-grid" aria-label="Counterparty reputation">
        <div><span>AVG RATING</span><strong>{reputation.ratingCount ? `${(reputation.averageX100 / 100).toFixed(2)} / 5` : "Unrated"}</strong></div>
        <div><span>RATINGS</span><strong>{reputation.ratingCount}</strong></div>
        {reputation.completed !== undefined && <div><span>COMPLETED</span><strong>{reputation.completed}</strong></div>}
        {reputation.disputed !== undefined && <div><span>DISPUTED</span><strong>{reputation.disputed}</strong></div>}
      </div>}
      {alreadyRated ? <p className="form-hint">You have rated this shipment. Ratings are limited to one per party.</p> : <form className="rating-form" onSubmit={handleSubmit} aria-label="Submit rating">
        <div className="star-picker" role="radiogroup" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} role="radio" aria-checked={stars === value} aria-label={`${value} star${value > 1 ? "s" : ""}`} className={value <= stars ? "star active" : "star"} onClick={() => setStars(value)}><Star size={16} /></button>)}
        </div>
        <button className="primary-button" disabled={busy || stars < 1}>{busy ? <LoaderCircle className="spin" size={15} /> : <Star size={15} />}{busy ? "Signing" : "Submit rating"}</button>
      </form>}
    </div>
  );
}
