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
  name: string;
  payment_percent: number;
  proof_hash: string;
  status: string;
  dispute_opened_ledger?: number | null;
};
export type AuditEntry = { action: string; caller: string; ledger: number; detail: string };
export type WarrantyClaim = { buyer: string; evidence_hash: string; filed_ledger: number };
export type WarrantyState = {
  balance: string;
  endsAt: number;
  claim: WarrantyClaim | null;
  filed: AuditEntry | null;
  resolution: { outcome: "buyer" | "supplier"; ledger: number } | null;
};
export type ShipmentDetail = {
  milestones: Milestone[];
  buyers: string[];
  arbiter: string;
  audit_log: AuditEntry[];
  warranty: WarrantyState;
};
export type Reputation = {
  address: string;
  ratingCount: number;
  averageX100: number;
  completed?: number;
  disputed?: number;
  cancelled?: number;
};

/** Max shipments accepted by `batch_cancel_shipments` (contract `MAX_BATCH_CANCEL_SHIPMENTS`). */
export const maxBatchCancel = 20;

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

/** Contract unit enums decode as `["Variant"]`; flatten them to `"Variant"`. */
function enumName(value: unknown): string {
  return Array.isArray(value) ? String(value[0]) : String(value);
}

function toHex(value: unknown): string {
  if (typeof value === "string") return value;
  return Array.from(value as Uint8Array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Accepts a 64-char hex digest as-is; otherwise SHA-256 hashes the text. */
export async function hashEvidence(input: string): Promise<Uint8Array> {
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Uint8Array.from(trimmed.match(/../g)!.map((pair) => parseInt(pair, 16)));
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(trimmed)));
}

async function readContract<T>(address: string, method: string, ...args: xdr.ScVal[]): Promise<T> {
  const account = await server.getAccount(address);
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(requireContract().call(method, ...args))
    .setTimeout(30)
    .build();
  const simulated = await server.simulateTransaction(transaction);
  if ("error" in simulated) throw new Error(simulated.error);
  const result = simulated.result;
  if (!result) throw new Error("Contract query returned no result.");
  return scValToNative(result.retval) as T;
}

async function invokeContract(wallet: Wallet, method: string, failure: string, ...args: xdr.ScVal[]): Promise<string> {
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
    if (result.status === "FAILED") throw new Error(failure);
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
  const summary = await readContract<Shipment>(address, "get_shipment_summary", scString(shipmentId));
  return { ...summary, status: enumName(summary.status) };
}

type RawShipment = {
  milestones: Array<Omit<Milestone, "status"> & { status: unknown }>;
  buyers: string[];
  arbiter: string;
  audit_log: AuditEntry[];
};

export async function getShipmentDetail(address: string, shipmentId: string): Promise<ShipmentDetail> {
  const [raw, balance, endsAt, claim] = await Promise.all([
    readContract<RawShipment>(address, "get_shipment", scString(shipmentId)),
    readContract<bigint>(address, "get_warranty_balance", scString(shipmentId)),
    readContract<number>(address, "get_warranty_end_ledger", scString(shipmentId)),
    readContract<{ buyer: string; evidence_hash: Uint8Array; filed_ledger: number } | null | undefined>(
      address,
      "get_warranty_claim",
      scString(shipmentId),
    ),
  ]);
  const auditLog = raw.audit_log.map((entry) => ({ ...entry, ledger: Number(entry.ledger) }));
  const latest = (action: string) => [...auditLog].reverse().find((entry) => entry.action === action) ?? null;
  const filed = latest("warranty_claim_filed");
  const resolved = latest("warranty_claim_resolved");
  return {
    milestones: raw.milestones.map((milestone) => ({ ...milestone, status: enumName(milestone.status) })),
    buyers: raw.buyers,
    arbiter: raw.arbiter,
    audit_log: auditLog,
    warranty: {
      balance: String(balance),
      endsAt: Number(endsAt),
      claim: claim ? { buyer: claim.buyer, evidence_hash: toHex(claim.evidence_hash), filed_ledger: Number(claim.filed_ledger) } : null,
      filed,
      // A resolution only counts if it is newer than the latest filing.
      resolution: !claim && resolved && (!filed || resolved.ledger >= filed.ledger)
        ? { outcome: resolved.detail === "buyer" ? "buyer" : "supplier", ledger: resolved.ledger }
        : null,
    },
  };
}

export async function getReputation(address: string, party: string, isSupplier: boolean): Promise<Reputation> {
  const [summary, supplierRep] = await Promise.all([
    readContract<[number, number]>(address, "get_rating_summary", scAddress(party)),
    isSupplier
      ? readContract<{ completed: number; disputed: number; cancelled: number }>(address, "get_reputation", scAddress(party))
      : Promise.resolve(null),
  ]);
  return {
    address: party,
    ratingCount: Number(summary[0]),
    averageX100: Number(summary[1]),
    ...(supplierRep ? {
      completed: Number(supplierRep.completed),
      disputed: Number(supplierRep.disputed),
      cancelled: Number(supplierRep.cancelled),
    } : {}),
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
    "The metadata transaction failed on-chain.",
    scAddress(wallet.address),
    scString(shipmentId),
    scSymbol(key),
    scString(value),
  );
}

/** Raises a dispute on a milestone, then records the buyer's reason as dispute evidence. */
export async function raiseDispute(wallet: Wallet, shipmentId: string, milestoneIndex: number, reason: string): Promise<string> {
  const hash = await invokeContract(
    wallet,
    "raise_dispute",
    "The dispute transaction failed on-chain.",
    scAddress(wallet.address),
    scString(shipmentId),
    scU32(milestoneIndex),
  );
  if (reason.trim()) {
    await invokeContract(
      wallet,
      "submit_dispute_evidence",
      "The dispute was raised, but recording the reason failed on-chain.",
      scAddress(wallet.address),
      scString(shipmentId),
      scU32(milestoneIndex),
      scString(reason.trim()),
      scSymbol("reason"),
    );
  }
  return hash;
}

export async function fileWarrantyClaim(wallet: Wallet, shipmentId: string, evidence: string): Promise<string> {
  const evidenceHash = await hashEvidence(evidence);
  return invokeContract(
    wallet,
    "file_warranty_claim",
    "The warranty claim transaction failed on-chain.",
    scAddress(wallet.address),
    scString(shipmentId),
    nativeToScVal(evidenceHash, { type: "bytes" }),
  );
}

export async function resolveWarrantyClaim(wallet: Wallet, shipmentId: string, refundBuyer: boolean): Promise<string> {
  return invokeContract(
    wallet,
    "resolve_warranty_claim",
    "The warranty resolution transaction failed on-chain.",
    scAddress(wallet.address),
    scString(shipmentId),
    nativeToScVal(refundBuyer),
  );
}

export async function rateCounterparty(wallet: Wallet, shipmentId: string, stars: number): Promise<string> {
  return invokeContract(
    wallet,
    "rate_counterparty",
    "The rating transaction failed on-chain.",
    scAddress(wallet.address),
    scString(shipmentId),
    scU32(stars),
    xdr.ScVal.scvVoid(),
  );
}

export async function batchConfirmMilestones(wallet: Wallet, shipmentId: string, milestoneIndices: number[]): Promise<string> {
  return invokeContract(
    wallet,
    "batch_confirm_milestones",
    "The batch confirm transaction failed on-chain.",
    scAddress(wallet.address),
    scString(shipmentId),
    nativeToScVal(milestoneIndices, { type: "u32" }),
  );
}

export async function batchCancelShipments(wallet: Wallet, shipmentIds: string[], reason: string): Promise<string> {
  return invokeContract(
    wallet,
    "batch_cancel_shipments",
    "The batch cancel transaction failed on-chain.",
    scAddress(wallet.address),
    nativeToScVal(shipmentIds, { type: "string" }),
    scString(reason),
  );
}

export const appNetwork = network;
export const configuredContractId = contractId;