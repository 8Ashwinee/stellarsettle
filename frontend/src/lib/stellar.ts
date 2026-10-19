import {
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { getWalletAdapter, type WalletId } from "./wallets";

const network = import.meta.env.VITE_STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
const rpcUrl = import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const passphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const contractId = import.meta.env.VITE_STELLAR_CONTRACT_ID as string;
const server = new rpc.Server(rpcUrl);

export type Wallet = { address: string; network: string; networkPassphrase: string; walletId?: WalletId };
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

export async function connectWallet(walletId: WalletId = "freighter"): Promise<Wallet> {
  const session = await getWalletAdapter(walletId).connect(passphrase, network);
  return { ...session, walletId };
}

export async function getShipmentSummary(address: string, shipmentId: string): Promise<Shipment> {
  const account = await server.getAccount(address);
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(requireContract().call("get_shipment_summary", scString(shipmentId)))
    .setTimeout(30)
    .build();
  const simulated = await server.simulateTransaction(transaction);
  if ("error" in simulated) throw new Error(simulated.error);
  const result = simulated.result;
  if (!result) throw new Error("Contract query returned no result.");
  return scValToNative(result.retval) as Shipment;
}

export async function setShipmentMetadata(
  wallet: Wallet,
  shipmentId: string,
  key: string,
  value: string,
): Promise<string> {
  const account = await server.getAccount(wallet.address);
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(requireContract().call(
      "set_shipment_metadata",
      scAddress(wallet.address),
      scString(shipmentId),
      scSymbol(key),
      scString(value),
    ))
    .setTimeout(60)
    .build();
  const simulated = await server.simulateTransaction(transaction);
  if ("error" in simulated) throw new Error(simulated.error);
  const prepared = rpc.assembleTransaction(transaction, simulated).build();
  const signedXdr = await getWalletAdapter(wallet.walletId).sign(prepared.toXDR(), {
    networkPassphrase: passphrase,
    address: wallet.address,
  });
  const signedTransaction = TransactionBuilder.fromXDR(signedXdr, passphrase);
  const submitted = await server.sendTransaction(signedTransaction);
  if (submitted.status === "ERROR") throw new Error("The network rejected the signed transaction.");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await server.getTransaction(submitted.hash);
    if (result.status === "SUCCESS") return submitted.hash;
    if (result.status === "FAILED") throw new Error("The metadata transaction failed on-chain.");
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error(`Transaction ${submitted.hash} is still pending. Check it on Stellar Expert.`);
}

export const appNetwork = network;
export const configuredContractId = contractId;