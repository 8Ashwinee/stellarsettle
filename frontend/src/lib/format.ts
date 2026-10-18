export function shortAddress(address: string) {
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

export function amount(value?: string | bigint) {
  if (value === undefined || value === "") return "--";
  try {
    return new Intl.NumberFormat("en-US").format(BigInt(value));
  } catch {
    return String(value);
  }
}

export function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

/** Splits a contract enum variant such as `ProofSubmitted` into `Proof submitted`. */
export function statusLabel(status: string) {
  const words = status.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
