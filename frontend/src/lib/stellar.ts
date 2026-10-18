import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Account,
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
  name: string;
  payment_percent: number;
  status: string;
  deadline_ledger: number;
};
export type ShipmentDetail = {
  id: string;
  status: string;
  buyers: string[];
  supplier: string;
  released_amount: string;
  total_advanced_amount: string;
  milestones: Milestone[];
};
export type ExtensionState = {
  milestoneIndex: number;
  deadline: number;
  pending: { extraLedgers: number; reason: string } | null;
};
export type AdvanceRequest = {
  milestoneIndex: number;
  requestedPercent: number;
  approved: boolean;
  amountAdvanced: string;
};
export type StandingOrder = {
  order_id: string;
  buyer: string;
  template_name: string;
  supplier: string;
  token: string;
  amount: string;
  interval_ledgers: number;
  max_occurrences: number;
  occurrences: number;
  next_ledger: number;
  cancelled: boolean;
};
export type StandingOrderInput = {
  template_name: string;
  supplier: string;
  logistics: string;
  arbiter: string;
  token: string;
  amount: string;
  interval_ledgers: number;
  max_occurrences: number;
  milestones: { name: string; payment_percent: number }[];
};

type RawShipment = Omit<ShipmentDetail, "status" | "released_amount" | "total_advanced_amount" | "milestones"> & {
  status: unknown;
  released_amount: bigint;
  total_advanced_amount: bigint;
  milestones: (Omit<Milestone, "status"> & { status: unknown })[];
};
type RawStandingOrder = Omit<StandingOrder, "order_id" | "amount"> & { order_id: bigint; amount: bigint };

/** Raised when the contract rejects a simulated call (e.g. a panic), as opposed to a network failure. */
export class SimulationError extends Error {}

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

function scU64(value: string) {
  return nativeToScVal(BigInt(value), { type: "u64" });
}

/** Encodes a #[contracttype] struct: a map keyed by field-name symbols in sorted order. */
function scStruct(fields: Record<string, xdr.ScVal>) {
  return xdr.ScVal.scvMap(Object.keys(fields).sort().map((key) => new xdr.ScMapEntry({ key: scSymbol(key), val: fields[key] })));
}

/** Contract enums decode as `["Variant"]`; reduce them to the variant name. */
function enumTag(value: unknown): string {
  return Array.isArray(value) ? String(value[0]) : String(value);
}

function normalizeStandingOrder(raw: RawStandingOrder): StandingOrder {
  return {
    order_id: String(raw.order_id),
    buyer: raw.buyer,
    template_name: raw.template_name,
    supplier: raw.supplier,
    token: raw.token,
    amount: String(raw.amount),
    interval_ledgers: raw.interval_ledgers,
    max_occurrences: raw.max_occurrences,
    occurrences: raw.occurrences,
    next_ledger: raw.next_ledger,
    cancelled: raw.cancelled,
  };
}

async function simulateWithAccount(account: Account, method: string, args: xdr.ScVal[]): Promise<unknown> {
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(requireContract().call(method, ...args))
    .setTimeout(30)
    .build();
  const simulated = await server.simulateTransaction(transaction);
  if ("error" in simulated) throw new SimulationError(simulated.error);
  const result = simulated.result;
  if (!result) throw new Error("Contract query returned no result.");
  return scValToNative(result.retval);
}

async function simulateRead(address: string, method: string, args: xdr.ScVal[]): Promise<unknown> {
  return simulateWithAccount(await server.getAccount(address), method, args);
}

/**
 * Reads a `(String, u32)`-keyed persistent entry directly from contract storage,
 * for state the contract stores but exposes no getter for. Returns null when absent.
 */
async function readPersistentEntry<T>(variant: string, shipmentId: string, milestoneIndex: number): Promise<T | null> {
  const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: new Address(requireContract().contractId()).toScAddress(),
    key: xdr.ScVal.scvVec([scSymbol(variant), scString(shipmentId), scU32(milestoneIndex)]),
    durability: xdr.ContractDataDurability.persistent(),
  }));
  const { entries } = await server.getLedgerEntries(key);
  if (!entries.length) return null;
  return scValToNative(entries[0].val.contractData().val()) as T;
}

async function submitContractCall(
  wallet: Wallet,
  method: string,
  args: xdr.ScVal[],
  failureMessage: string,
): Promise<{ hash: string; result: unknown }> {
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
    if (result.status === "SUCCESS") {
      return { hash: submitted.hash, result: result.returnValue ? scValToNative(result.returnValue) : undefined };
    }
    if (result.status === "FAILED") throw new Error(failureMessage);
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
  const raw = await simulateRead(address, "get_shipment_summary", [scString(shipmentId)]) as Omit<Shipment, "status"> & { status: unknown };
  return { ...raw, status: enumTag(raw.status) };
}

export async function setShipmentMetadata(
  wallet: Wallet,
  shipmentId: string,
  key: string,
  value: string,
): Promise<string> {
  const { hash } = await submitContractCall(
    wallet,
    "set_shipment_metadata",
    [scAddress(wallet.address), scString(shipmentId), scSymbol(key), scString(value)],
    "The metadata transaction failed on-chain.",
  );
  return hash;
}

export async function getShipmentDetail(address: string, shipmentId: string): Promise<ShipmentDetail> {
  const raw = await simulateRead(address, "get_shipment", [scString(shipmentId)]) as RawShipment;
  return {
    id: raw.id,
    status: enumTag(raw.status),
    buyers: raw.buyers,
    supplier: raw.supplier,
    released_amount: String(raw.released_amount),
    total_advanced_amount: String(raw.total_advanced_amount),
    milestones: raw.milestones.map((milestone) => ({ ...milestone, status: enumTag(milestone.status) })),
  };
}

// ── Milestone confirmation ────────────────────────────────────

export async function confirmMilestone(wallet: Wallet, shipmentId: string, milestoneIndex: number): Promise<string> {
  const { hash } = await submitContractCall(
    wallet,
    "confirm_milestone",
    [scAddress(wallet.address), scString(shipmentId), scU32(milestoneIndex)],
    "The milestone confirmation failed on-chain.",
  );
  return hash;
}

// ── Milestone deadline extensions ─────────────────────────────

export function extensionReasonKey(milestoneIndex: number) {
  return `extension_reason_${milestoneIndex}`;
}

export async function getExtensionState(address: string, shipmentId: string, milestoneIndex: number): Promise<ExtensionState> {
  const [deadline, request] = await Promise.all([
    simulateRead(address, "get_milestone_deadline", [scString(shipmentId), scU32(milestoneIndex)]) as Promise<number>,
    readPersistentEntry<{ extra_ledgers: number }>("ExtensionRequest", shipmentId, milestoneIndex),
  ]);
  let reason: string | null = null;
  if (request) {
    reason = await simulateRead(
      address,
      "get_shipment_metadata",
      [scString(shipmentId), scSymbol(extensionReasonKey(milestoneIndex))],
    ) as string | null;
  }
  return {
    milestoneIndex,
    deadline: Number(deadline),
    pending: request ? { extraLedgers: Number(request.extra_ledgers), reason: reason ?? "" } : null,
  };
}

/** Requests an extension and records the supplier's reason as shipment metadata (the contract call takes no reason). */
export async function requestExtension(
  wallet: Wallet,
  shipmentId: string,
  milestoneIndex: number,
  extraLedgers: number,
  reason: string,
): Promise<string> {
  const { hash } = await submitContractCall(
    wallet,
    "request_extension",
    [scAddress(wallet.address), scString(shipmentId), scU32(milestoneIndex), scU32(extraLedgers)],
    "The extension request failed on-chain.",
  );
  if (reason.trim()) await setShipmentMetadata(wallet, shipmentId, extensionReasonKey(milestoneIndex), reason.trim());
  return hash;
}

export async function approveExtension(wallet: Wallet, shipmentId: string, milestoneIndex: number): Promise<string> {
  const { hash } = await submitContractCall(
    wallet,
    "approve_extension",
    [scAddress(wallet.address), scString(shipmentId), scU32(milestoneIndex)],
    "The extension approval failed on-chain.",
  );
  return hash;
}

export async function denyExtension(wallet: Wallet, shipmentId: string, milestoneIndex: number): Promise<string> {
  const { hash } = await submitContractCall(
    wallet,
    "deny_extension",
    [scAddress(wallet.address), scString(shipmentId), scU32(milestoneIndex)],
    "The extension denial failed on-chain.",
  );
  return hash;
}

// ── Supplier advance payments ─────────────────────────────────

export async function getMaxAdvancePercent(address: string): Promise<number> {
  return Number(await simulateRead(address, "get_max_advance_percent", []));
}

export async function getAdvanceRequest(shipmentId: string, milestoneIndex: number): Promise<AdvanceRequest | null> {
  const raw = await readPersistentEntry<{ requested_percent: number; approved: boolean; amount_advanced: bigint }>(
    "AdvanceRequest",
    shipmentId,
    milestoneIndex,
  );
  if (!raw) return null;
  return {
    milestoneIndex,
    requestedPercent: Number(raw.requested_percent),
    approved: raw.approved,
    amountAdvanced: String(raw.amount_advanced),
  };
}

export async function requestAdvance(
  wallet: Wallet,
  shipmentId: string,
  milestoneIndex: number,
  advancePercent: number,
): Promise<string> {
  const { hash } = await submitContractCall(
    wallet,
    "request_advance",
    [scAddress(wallet.address), scString(shipmentId), scU32(milestoneIndex), scU32(advancePercent)],
    "The advance request failed on-chain.",
  );
  return hash;
}

export async function approveAdvance(wallet: Wallet, shipmentId: string, milestoneIndex: number): Promise<string> {
  const { hash } = await submitContractCall(
    wallet,
    "approve_advance",
    [scAddress(wallet.address), scString(shipmentId), scU32(milestoneIndex)],
    "The advance approval failed on-chain.",
  );
  return hash;
}

// ── Standing orders ───────────────────────────────────────────

const standingOrderScanLimit = 100;
const standingOrderScanBatch = 10;

export async function getStandingOrder(address: string, orderId: string): Promise<StandingOrder> {
  return normalizeStandingOrder(await simulateRead(address, "get_standing_order", [scU64(orderId)]) as RawStandingOrder);
}

/**
 * The contract has no per-buyer index, so order ids are scanned sequentially
 * (ids start at 1) until the first id that does not exist.
 */
export async function listStandingOrders(address: string, buyer: string): Promise<StandingOrder[]> {
  const account = await server.getAccount(address);
  const orders: StandingOrder[] = [];
  for (let first = 1; first <= standingOrderScanLimit; first += standingOrderScanBatch) {
    const ids = Array.from({ length: standingOrderScanBatch }, (_, offset) => first + offset);
    const batch = await Promise.all(ids.map((id) =>
      simulateWithAccount(account, "get_standing_order", [scU64(String(id))])
        .then((raw) => normalizeStandingOrder(raw as RawStandingOrder))
        .catch((cause) => {
          if (cause instanceof SimulationError) return null;
          throw cause;
        })));
    for (const order of batch) {
      if (order && order.buyer === buyer) orders.push(order);
    }
    if (batch.includes(null)) break;
  }
  return orders;
}

export async function createStandingOrder(wallet: Wallet, params: StandingOrderInput): Promise<string> {
  const milestones = xdr.ScVal.scvVec(params.milestones.map((milestone) => scStruct({
    name: scString(milestone.name),
    payment_percent: scU32(milestone.payment_percent),
    proof_hash: scString(""),
    status: xdr.ScVal.scvVec([scSymbol("Pending")]),
    release_after_ledger: scU32(0),
    proof_submitted_ledger: xdr.ScVal.scvVoid(),
    dispute_opened_ledger: xdr.ScVal.scvVoid(),
    deadline_ledger: scU32(0),
    penalty_bps_per_ledger: scU32(0),
  })));
  const { result } = await submitContractCall(
    wallet,
    "create_standing_order",
    [
      scAddress(wallet.address),
      scStruct({
        template_name: scString(params.template_name),
        supplier: scAddress(params.supplier),
        logistics: scAddress(params.logistics),
        arbiter: scAddress(params.arbiter),
        token: scAddress(params.token),
        amount: nativeToScVal(BigInt(params.amount), { type: "i128" }),
        milestones,
        interval_ledgers: scU32(params.interval_ledgers),
        max_occurrences: scU32(params.max_occurrences),
      }),
    ],
    "The standing order transaction failed on-chain.",
  );
  return String(result);
}

/** Returns the id of the shipment created by this execution. */
export async function executeStandingOrder(wallet: Wallet, orderId: string): Promise<string> {
  const { result } = await submitContractCall(
    wallet,
    "execute_standing_order",
    [scU64(orderId)],
    "The standing order execution failed on-chain.",
  );
  return String(result);
}

export async function cancelStandingOrder(wallet: Wallet, orderId: string): Promise<string> {
  const { hash } = await submitContractCall(
    wallet,
    "cancel_standing_order",
    [scAddress(wallet.address), scU64(orderId)],
    "The standing order cancellation failed on-chain.",
  );
  return hash;
}

export const appNetwork = network;
export const configuredContractId = contractId;