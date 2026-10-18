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

export function isPositiveAmount(value: string) {
  return /^[0-9]+$/.test(value.trim()) && BigInt(value.trim()) > 0n;
}
