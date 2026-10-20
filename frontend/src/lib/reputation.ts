export type Reputation = { completed: number; disputed: number; cancelled: number };

const ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

export function isStellarAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value.trim());
}

/** Reads a supplier address from a `#/suppliers/:address` hash route. */
export function supplierFromHash(hash: string): string {
  const match = /^#\/suppliers\/([^/?#]+)/.exec(hash);
  return match ? decodeURIComponent(match[1]) : "";
}

export function supplierHash(address: string): string {
  return `#/suppliers/${encodeURIComponent(address.trim())}`;
}

/** `average_x100` of 450 becomes "4.50". */
export function formatAverageRating(averageX100: number): string {
  return (averageX100 / 100).toFixed(2);
}

export function totalOrders(rep: Reputation): number {
  return rep.completed + rep.disputed + rep.cancelled;
}

export function completionRate(rep: Reputation): string {
  const total = totalOrders(rep);
  return total === 0 ? "--" : `${Math.round((rep.completed / total) * 100)}%`;
}

/** Soroban enums decode as a string or a single-element array. */
export function tierName(raw: unknown): string {
  if (Array.isArray(raw)) return String(raw[0]);
  return String(raw);
}
