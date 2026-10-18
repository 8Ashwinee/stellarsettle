import type { ShipmentDetail, Wallet } from "../lib/stellar";

export const buyerAddress = "GBUYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const supplierAddress = "GSUPPLIERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function walletFor(address: string): Wallet {
  return { address, network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" };
}

export function shipmentFixture(overrides: Partial<ShipmentDetail> = {}): ShipmentDetail {
  return {
    id: "SHIP-1",
    status: "Active",
    buyers: [buyerAddress],
    supplier: supplierAddress,
    released_amount: "0",
    total_advanced_amount: "0",
    milestones: [
      { name: "Pickup", payment_percent: 40, status: "ProofSubmitted", deadline_ledger: 0 },
      { name: "Delivery", payment_percent: 60, status: "Pending", deadline_ledger: 0 },
    ],
    ...overrides,
  };
}
