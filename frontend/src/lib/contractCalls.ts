import { BASE_FEE, Contract, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import type { Wallet } from "./stellar";

// Generic read/write adapter for contract methods that lib/stellar.ts does not wrap yet.
const network = import.meta.env.VITE_STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
const rpcUrl = import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const passphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const contractId = import.meta.env.VITE_STELLAR_CONTRACT_ID as string;
const server = new rpc.Server(rpcUrl);

export const scStr = (value: string) => nativeToScVal(value, { type: "string" });
export const scAddr = (value: string) => nativeToScVal(value, { type: "address" });
export const scU32 = (value: number) => nativeToScVal(value, { type: "u32" });
export const scI128 = (value: bigint | number | string) => nativeToScVal(BigInt(value), { type: "i128" });
export const scNone = () => xdr.ScVal.scvVoid();

function contract(): Contract {
  if (!contractId) throw new Error("Set VITE_STELLAR_CONTRACT_ID in frontend/.env.local first.");
  return new Contract(contractId);
}

export async function queryContract<T>(source: string, method: string, args: xdr.ScVal[] = []): Promise<T> {
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(contract().call(method, ...args))
    .setTimeout(30)
    .build();
  const simulated = await server.simulateTransaction(tx);
  if ("error" in simulated) throw new Error(simulated.error);
  if (!simulated.result) throw new Error("Contract query returned no result.");
  return scValToNative(simulated.result.retval) as T;
}

export async function invokeContract(wallet: Wallet, method: string, args: xdr.ScVal[]): Promise<string> {
  const account = await server.getAccount(wallet.address);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(contract().call(method, ...args))
    .setTimeout(60)
    .build();
  const simulated = await server.simulateTransaction(tx);
  if ("error" in simulated) throw new Error(simulated.error);
  const prepared = rpc.assembleTransaction(tx, simulated).build();
  const signed = await signTransaction(prepared.toXDR(), { networkPassphrase: passphrase, address: wallet.address });
  if (signed.error) throw new Error(signed.error.message);
  const submitted = await server.sendTransaction(TransactionBuilder.fromXDR(signed.signedTxXdr, passphrase));
  if (submitted.status === "ERROR") throw new Error("The network rejected the signed transaction.");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await server.getTransaction(submitted.hash);
    if (result.status === "SUCCESS") return submitted.hash;
    if (result.status === "FAILED") throw new Error(`The ${method} transaction failed on-chain.`);
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error(`Transaction ${submitted.hash} is still pending. Check it on Stellar Expert.`);
}
