import type { ShipmentDetail, Wallet } from "../lib/stellar";

export const BUYER = "GBUYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const SUPPLIER = "GSUPPLIERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const LOGISTICS = "GLOGISTICSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const ARBITER = "GARBITERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const TOKEN = "CTOKENAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function walletFor(address: string): Wallet {
  return { address, network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" };
}

export function makeShipment(overrides: Partial<ShipmentDetail> = {}): ShipmentDetail {
  return {
    id: "PO-1",
    status: "Active",
    buyers: [BUYER],
    supplier: SUPPLIER,
    logistics: LOGISTICS,
    arbiter: ARBITER,
    token: TOKEN,
    total_amount: "1000",
    released_amount: "0",
    total_advanced_amount: "0",
    buyer_cancel_fee_bps: 0,
    milestones: [
      { index: 0, name: "Goods dispatched", payment_percent: 50, proof_hash: "", status: "Pending" },
      { index: 1, name: "Delivered", payment_percent: 50, proof_hash: "", status: "Pending" },
    ],
    cancellation_reason: [],
    ...overrides,
  };
}
