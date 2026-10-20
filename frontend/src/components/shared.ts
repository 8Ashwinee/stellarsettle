import type { ShipmentDetail, Wallet } from "../lib/stellar";

/** Props shared by the shipment workflow panels; feedback goes through the dashboard toast. */
export type ShipmentActionProps = {
  wallet: Wallet | null;
  shipment: ShipmentDetail;
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

export function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export function shortHash(hash: string) {
  return `${hash.slice(0, 12)}…`;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

export function amount(value?: string) {
  if (!value) return "--";
  try {
    return new Intl.NumberFormat("en-US").format(BigInt(value));
  } catch {
    return value;
  }
}

export function isBuyer(wallet: Wallet | null, shipment: ShipmentDetail) {
  return !!wallet && shipment.buyers.includes(wallet.address);
}

export function isSupplier(wallet: Wallet | null, shipment: ShipmentDetail) {
  return !!wallet && shipment.supplier === wallet.address;
}

/** Splits CamelCase contract statuses for display, e.g. ProofSubmitted -> Proof submitted. */
export function statusLabel(status: string) {
  const spaced = status.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
