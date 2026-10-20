export type TransferRole = "buyer" | "supplier" | "logistics";

export const TRANSFER_METHODS: Record<TransferRole, string> = {
  buyer: "transfer_buyer",
  supplier: "transfer_supplier",
  logistics: "transfer_logistics",
};

export function validateTransfer(shipmentId: string, current: string, next: string): string {
  if (!shipmentId.trim()) return "Shipment ID is required.";
  if (!/^G[A-Z2-7]{55}$/.test(next.trim())) return "Enter a valid Stellar address for the new party.";
  if (next.trim() === current) return "The new party must differ from the current one.";
  return "";
}

export function validateDelegate(delegate: string, cap: string): string {
  if (!/^G[A-Z2-7]{55}$/.test(delegate.trim())) return "Enter a valid delegate address.";
  if (!/^\d+$/.test(cap.trim()) || BigInt(cap.trim()) <= 0n) return "Per-transaction cap must be a positive whole number.";
  return "";
}
