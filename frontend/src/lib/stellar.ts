import {
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { getNetwork, requestAccess, signTransaction } from "@stellar/freighter-api";

const network = import.meta.env.VITE_STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
const rpcUrl = import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const passphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const contractId = import.meta.env.VITE_STELLAR_CONTRACT_ID as string;
const server = new rpc.Server(rpcUrl);

export type Wallet = { address: string; network: string; networkPassphrase: string };
export type Shipment = {
  id: string;
  status: string;
  supplier: string;
  token: string;
  total_amount: string;
  released_amount: string;
  milestone_count: number;
  open_disputes: number;
  created_at: number;
};
export type Milestone = {
  index: number;
  name: string;
  payment_percent: number;
  proof_hash: string;
  status: string;
};
export type ShipmentDetail = {
  id: string;
  status: string;
  buyers: string[];
  supplier: string;
  logistics: string;
  arbiter: string;
  token: string;
  total_amount: string;
  released_amount: string;
  total_advanced_amount: string;
  buyer_cancel_fee_bps: number;
  milestones: Milestone[];
  cancellation_reason: string[];
};
export type MilestoneInput = { name: string; paymentPercent: number };
export type CreateShipmentInput = {
  shipmentId: string;
  supplier: string;
  logistics: string;
  arbiter: string;
  token: string;
  totalAmount: string;
  milestoneMode: "Sequential" | "Parallel";
  milestones: MilestoneInput[];
};

function requireContract(): Contract {
  if (!contractId) throw new Error("Set VITE_STELLAR_CONTRACT_ID in frontend/.env.local first.");
  return new Contract(contractId);
}

function scString(value: string) {
  return nativeToScVal(value, { type: "string" });
}

function scAddress(value: string) {
  return nativeToScVal(value, { type: "address" });
}

function scSymbol(value: string) {
  return nativeToScVal(value, { type: "symbol" });
}

function scU32(value: number) {
  return nativeToScVal(value, { type: "u32" });
}

function scU64(value: number) {
  return nativeToScVal(value, { type: "u64" });
}

function scI128(value: string | bigint) {
  return nativeToScVal(BigInt(value), { type: "i128" });
}

function scVec(values: xdr.ScVal[] = []) {
  return xdr.ScVal.scvVec(values);
}

function scNone() {
  return xdr.ScVal.scvVoid();
}

/** Unit enum variants are encoded as a single-symbol vector. */
function scEnum(variant: string) {
  return scVec([scSymbol(variant)]);
}

/** Contract structs are maps keyed by field symbol, sorted by key. */
function scStruct(fields: Record<string, xdr.ScVal>) {
  return xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((key) => new xdr.ScMapEntry({ key: scSymbol(key), val: fields[key] })),
  );
}

/** Native decoding turns unit enum variants into `["Variant"]`. */
function enumVariant(value: unknown): string {
  return Array.isArray(value) ? String(value[0]) : String(value);
}

function milestoneScVal(milestone: MilestoneInput) {
  return scStruct({
    name: scString(milestone.name),
    payment_percent: scU32(milestone.paymentPercent),
    proof_hash: scString(""),
    status: scEnum("Pending"),
    release_after_ledger: scU32(0),
    proof_submitted_ledger: scNone(),
    dispute_opened_ledger: scNone(),
    deadline_ledger: scU32(0),
    penalty_bps_per_ledger: scU32(0),
  });
}

/** Default `ShipmentOptions`: every optional contract feature disabled. */
function shipmentOptionsScVal(milestoneMode: CreateShipmentInput["milestoneMode"]) {
  return scStruct({
    response_deadline: scU32(0),
    penalty_bps: scU32(0),
    milestone_mode: scEnum(milestoneMode),
    holdback_ledgers: scU32(0),
    dispute_cooldown_ledgers: scU32(0),
    late_penalty_bps_per_ledger: scU32(0),
    auto_confirm_ledgers: scU32(0),
    dispute_bond_amount: scI128(0n),
    dispute_bond_bps: scU32(0),
    arbiter_fee_bps: scU32(0),
    logistics_fee_bps: scU32(0),
    supplier_collateral: scI128(0n),
    expires_at_ledger: scNone(),
    metadata_hash: scNone(),
    referrer: scNone(),
    buyer_cancel_fee_bps: scU32(0),
    early_bonus_pool: scI128(0n),
    review_window_ledgers: scNone(),
    milestone_splits: scVec(),
    deadlines: scVec(),
    dispute_timeout_seconds: scU64(0),
    default_resolution: scEnum("Buyer"),
    backup_arbiter: scNone(),
    confirmation_cooldown_ledgers: scNone(),
    arbiter_panel: scVec(),
    jurisdiction: scNone(),
    grace_period_ledgers: scU32(0),
    quality_grades: scVec(),
    milestone_quantities: scVec(),
    retainage_bps: scU32(0),
    warranty_bps: scU32(0),
    warranty_ledgers: scU32(0),
    inspector: scNone(),
    inspected_milestones: scVec(),
    proof_submitters: scVec(),
    require_dual_attestation: xdr.ScVal.scvBool(false),
    fund_from_vault: xdr.ScVal.scvBool(false),
    milestone_suppliers: scVec(),
    refund_recipient: scNone(),
  });
}

async function simulateRead(address: string, method: string, ...args: xdr.ScVal[]): Promise<unknown> {
  const account = await server.getAccount(address);
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(requireContract().call(method, ...args))
    .setTimeout(30)
    .build();
  const simulated = await server.simulateTransaction(transaction);
  if ("error" in simulated) throw new Error(simulated.error);
  const result = simulated.result;
  if (!result) throw new Error("Contract query returned no result.");
  return scValToNative(result.retval);
}

async function invokeContract(wallet: Wallet, method: string, label: string, ...args: xdr.ScVal[]): Promise<string> {
  const account = await server.getAccount(wallet.address);
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(requireContract().call(method, ...args))
    .setTimeout(60)
    .build();
  const simulated = await server.simulateTransaction(transaction);
  if ("error" in simulated) throw new Error(simulated.error);
  const prepared = rpc.assembleTransaction(transaction, simulated).build();
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: passphrase,
    address: wallet.address,
  });
  if (signed.error) throw new Error(signed.error.message);
  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, passphrase);
  const submitted = await server.sendTransaction(signedTransaction);
  if (submitted.status === "ERROR") throw new Error("The network rejected the signed transaction.");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await server.getTransaction(submitted.hash);
    if (result.status === "SUCCESS") return submitted.hash;
    if (result.status === "FAILED") throw new Error(`The ${label} transaction failed on-chain.`);
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error(`Transaction ${submitted.hash} is still pending. Check it on Stellar Expert.`);
}

export async function connectWallet(): Promise<Wallet> {
  const access = await requestAccess();
  if (access.error) throw new Error(access.error.message);
  if (!access.address) throw new Error("Freighter did not return an account address.");
  const selectedNetwork = await getNetwork();
  if (selectedNetwork.error) throw new Error(selectedNetwork.error.message);
  if (selectedNetwork.networkPassphrase !== passphrase) {
    throw new Error(`Freighter is on ${selectedNetwork.network}; this app is configured for ${network}.`);
  }
  return { address: access.address, network: selectedNetwork.network, networkPassphrase: selectedNetwork.networkPassphrase };
}

export async function getShipmentSummary(address: string, shipmentId: string): Promise<Shipment> {
  const summary = await simulateRead(address, "get_shipment_summary", scString(shipmentId)) as Record<string, unknown>;
  return {
    ...summary,
    status: enumVariant(summary.status),
    total_amount: String(summary.total_amount),
    released_amount: String(summary.released_amount),
  } as Shipment;
}

export async function getShipment(address: string, shipmentId: string): Promise<ShipmentDetail> {
  const shipment = await simulateRead(address, "get_shipment", scString(shipmentId)) as Record<string, unknown>;
  const milestones = (shipment.milestones as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: String(shipment.id),
    status: enumVariant(shipment.status),
    buyers: ((shipment.buyers as string[] | undefined) ?? []).map(String),
    supplier: String(shipment.supplier),
    logistics: String(shipment.logistics),
    arbiter: String(shipment.arbiter),
    token: String(shipment.token),
    total_amount: String(shipment.total_amount),
    released_amount: String(shipment.released_amount),
    total_advanced_amount: String(shipment.total_advanced_amount ?? 0),
    buyer_cancel_fee_bps: Number(shipment.buyer_cancel_fee_bps ?? 0),
    milestones: milestones.map((milestone, index) => ({
      index,
      name: String(milestone.name),
      payment_percent: Number(milestone.payment_percent),
      proof_hash: String(milestone.proof_hash ?? ""),
      status: enumVariant(milestone.status),
    })),
    cancellation_reason: ((shipment.cancellation_reason as unknown[] | undefined) ?? []).map(enumVariant),
  };
}

export async function setShipmentMetadata(
  wallet: Wallet,
  shipmentId: string,
  key: string,
  value: string,
): Promise<string> {
  return invokeContract(
    wallet,
    "set_shipment_metadata",
    "metadata",
    scAddress(wallet.address),
    scString(shipmentId),
    scSymbol(key),
    scString(value),
  );
}

export async function createShipment(wallet: Wallet, input: CreateShipmentInput): Promise<string> {
  return invokeContract(
    wallet,
    "create_shipment",
    "shipment creation",
    scString(input.shipmentId),
    scVec([scAddress(wallet.address)]),
    scAddress(input.supplier),
    scAddress(input.logistics),
    scAddress(input.arbiter),
    scAddress(input.token),
    scI128(input.totalAmount),
    scVec(input.milestones.map(milestoneScVal)),
    shipmentOptionsScVal(input.milestoneMode),
  );
}

export async function submitProof(
  wallet: Wallet,
  shipmentId: string,
  milestoneIndex: number,
  proofHash: string,
  proofType = "ipfs",
): Promise<string> {
  return invokeContract(
    wallet,
    "submit_proof",
    "proof submission",
    scAddress(wallet.address),
    scString(shipmentId),
    scU32(milestoneIndex),
    scString(proofHash),
    scSymbol(proofType),
  );
}

export async function resolveDispute(
  wallet: Wallet,
  shipmentId: string,
  milestoneIndex: number,
  approve: boolean,
): Promise<string> {
  return invokeContract(
    wallet,
    "resolve_dispute",
    "dispute resolution",
    scAddress(wallet.address),
    scString(shipmentId),
    scU32(milestoneIndex),
    xdr.ScVal.scvBool(approve),
    // `None` lets the contract default to ProofValid / ProofInvalid.
    scNone(),
  );
}

/**
 * Cancels a shipment as the buyer. `cancel_shipment` takes no reason, so when one
 * is provided the single-shipment `batch_cancel_shipments` entry point is used: it
 * runs the same cancellation path and also records the reason on-chain.
 */
export async function cancelShipment(wallet: Wallet, shipmentId: string, reason: string): Promise<string> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return invokeContract(wallet, "cancel_shipment", "cancellation", scAddress(wallet.address), scString(shipmentId));
  }
  return invokeContract(
    wallet,
    "batch_cancel_shipments",
    "cancellation",
    scAddress(wallet.address),
    scVec([scString(shipmentId)]),
    scString(trimmed),
  );
}

/** Mirrors the contract's buyer-cancel refund: unreleased escrow minus the cancel fee. */
export function cancellationRefund(shipment: ShipmentDetail): bigint {
  const unreleased = BigInt(shipment.total_amount) - BigInt(shipment.released_amount) - BigInt(shipment.total_advanced_amount);
  if (!shipment.cancellation_reason.includes("BuyerCancelled")) return unreleased;
  return unreleased - (unreleased * BigInt(shipment.buyer_cancel_fee_bps)) / 10_000n;
}

export const appNetwork = network;
export const configuredContractId = contractId;