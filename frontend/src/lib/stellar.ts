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
export type Milestone = { index: number; name: string; payment_percent: number; status: string };
export type DisputeEvidence = {
  submitter: string;
  evidence_hash: string;
  evidence_type: string;
  submitted_ledger: number;
};
export type MilestoneSplitPart = { name: string; payment_percent: number };
export type MilestoneSplitProposal = {
  milestone_index: number;
  proposer: string;
  parts: MilestoneSplitPart[];
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

function scU32(value: number) {
  return nativeToScVal(value, { type: "u32" });
}

function scI128(value: string) {
  return nativeToScVal(BigInt(value), { type: "i128" });
}

function scSplitParts(parts: MilestoneSplitPart[]) {
  return xdr.ScVal.scvVec(parts.map((part) => xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: scSymbol("name"), val: scString(part.name) }),
    new xdr.ScMapEntry({ key: scSymbol("payment_percent"), val: scU32(part.payment_percent) }),
  ])));
}

// Soroban unit enums decode as `["Variant"]`; flatten them to the variant name.
function enumName(value: unknown): string {
  return Array.isArray(value) ? String(value[0]) : String(value);
}

async function readContract(address: string, method: string, ...args: xdr.ScVal[]): Promise<unknown> {
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

async function invokeContract(wallet: Wallet, label: string, method: string, ...args: xdr.ScVal[]): Promise<string> {
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

export async function getShipmentSummary(address: string, shipmentId: string): Promise<Shipment> {
  return await readContract(address, "get_shipment_summary", scString(shipmentId)) as Shipment;
}

export async function setShipmentMetadata(
  wallet: Wallet,
  shipmentId: string,
  key: string,
  value: string,
): Promise<string> {
  return invokeContract(
    wallet,
    "metadata",
    "set_shipment_metadata",
    scAddress(wallet.address),
    scString(shipmentId),
    scSymbol(key),
    scString(value),
  );
}

// ---- Buyer vault (vault_ui) ----

export async function getVaultBalance(address: string, token: string): Promise<string> {
  const balance = await readContract(address, "get_vault_balance", scAddress(address), scAddress(token));
  return String(balance);
}

export async function vaultDeposit(wallet: Wallet, token: string, amount: string): Promise<string> {
  return invokeContract(wallet, "vault deposit", "vault_deposit", scAddress(wallet.address), scAddress(token), scI128(amount));
}

export async function vaultWithdraw(wallet: Wallet, token: string, amount: string): Promise<string> {
  return invokeContract(wallet, "vault withdrawal", "vault_withdraw", scAddress(wallet.address), scAddress(token), scI128(amount));
}

// ---- Escrow top-up (topup_escrow) ----

export async function topUpEscrow(wallet: Wallet, shipmentId: string, amount: string): Promise<string> {
  return invokeContract(wallet, "top-up", "top_up_escrow", scAddress(wallet.address), scString(shipmentId), scI128(amount));
}

// ---- Milestones & dispute evidence (evidence_upload_ui) ----

export async function getMilestones(address: string, shipmentId: string): Promise<Milestone[]> {
  const shipment = await readContract(address, "get_shipment", scString(shipmentId)) as {
    milestones: { name: string; payment_percent: number; status: unknown }[];
  };
  return shipment.milestones.map((milestone, index) => ({
    index,
    name: milestone.name,
    payment_percent: Number(milestone.payment_percent),
    status: enumName(milestone.status),
  }));
}

export async function getMaxEvidencePerMilestone(address: string): Promise<number> {
  return Number(await readContract(address, "get_max_evidence_per_milestone"));
}

export async function getDisputeEvidence(address: string, shipmentId: string, milestoneIndex: number): Promise<DisputeEvidence[]> {
  const entries = await readContract(address, "get_dispute_evidence", scString(shipmentId), scU32(milestoneIndex)) as DisputeEvidence[];
  return entries.map((entry) => ({ ...entry, submitted_ledger: Number(entry.submitted_ledger) }));
}

export async function submitDisputeEvidence(
  wallet: Wallet,
  shipmentId: string,
  milestoneIndex: number,
  evidenceHash: string,
  evidenceType: string,
): Promise<string> {
  return invokeContract(
    wallet,
    "evidence",
    "submit_dispute_evidence",
    scAddress(wallet.address),
    scString(shipmentId),
    scU32(milestoneIndex),
    scString(evidenceHash),
    scSymbol(evidenceType),
  );
}

// ---- Milestone split proposals (milestone_split_ui) ----

export async function getMilestoneSplitProposal(address: string, shipmentId: string): Promise<MilestoneSplitProposal | null> {
  const proposal = await readContract(address, "get_milestone_split_proposal", scString(shipmentId)) as MilestoneSplitProposal | null | undefined;
  if (!proposal) return null;
  return {
    milestone_index: Number(proposal.milestone_index),
    proposer: proposal.proposer,
    parts: proposal.parts.map((part) => ({ name: part.name, payment_percent: Number(part.payment_percent) })),
  };
}

export async function proposeMilestoneSplit(
  wallet: Wallet,
  shipmentId: string,
  milestoneIndex: number,
  parts: MilestoneSplitPart[],
): Promise<string> {
  return invokeContract(
    wallet,
    "split proposal",
    "propose_milestone_split",
    scAddress(wallet.address),
    scString(shipmentId),
    scU32(milestoneIndex),
    scSplitParts(parts),
  );
}

export async function approveMilestoneSplit(wallet: Wallet, shipmentId: string, milestoneIndex: number): Promise<string> {
  return invokeContract(
    wallet,
    "split approval",
    "approve_milestone_split",
    scAddress(wallet.address),
    scString(shipmentId),
    scU32(milestoneIndex),
  );
}

export const appNetwork = network;
export const configuredContractId = contractId;