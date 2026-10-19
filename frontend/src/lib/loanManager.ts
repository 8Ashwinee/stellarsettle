import {
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { appNetwork, type Wallet } from "./stellar";

const rpcUrl = import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const contractId = import.meta.env.VITE_LOAN_MANAGER_CONTRACT_ID as string;
const server = new rpc.Server(rpcUrl);
const priceScale = 100_000_000n;
const maxInt128 = (1n << 127n) - 1n;

export type LoanMarket = {
  collateral_token: string;
  debt_token: string;
  liq_threshold_bps: number;
};

export type LoanPosition = {
  collateral: string;
  debt: string;
};

export type PoolInfo = {
  totalDeposits: string;
  totalBorrowed: string;
  twapFallbackCount: number;
};

export type LoanSnapshot = {
  market: LoanMarket;
  position: LoanPosition;
  depositorBalance: string;
  pool: PoolInfo;
  collateralPrice: string;
  debtPrice: string;
  paused: boolean;
};

function requireContract(): Contract {
  if (!contractId) throw new Error("Set VITE_LOAN_MANAGER_CONTRACT_ID in frontend/.env.local first.");
  return new Contract(contractId);
}

function address(value: string) {
  return nativeToScVal(value, { type: "address" });
}

function amount(value: string | bigint) {
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed > maxInt128) throw new Error("Amount must be a positive i128 value.");
  return nativeToScVal(parsed, { type: "i128" });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object") throw new Error("Loan manager returned an invalid value.");
  return value as Record<string, unknown>;
}

function asInteger(value: unknown): string {
  return BigInt(String(value)).toString();
}

function asAddress(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function parsePosition(value: unknown): LoanPosition {
  const position = asRecord(value);
  return { collateral: asInteger(position.collateral), debt: asInteger(position.debt) };
}

function parseMarket(value: unknown): LoanMarket {
  const market = asRecord(value);
  return {
    collateral_token: asAddress(market.collateral_token),
    debt_token: asAddress(market.debt_token),
    liq_threshold_bps: Number(market.liq_threshold_bps),
  };
}

function parsePoolInfo(value: unknown): PoolInfo {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("Loan manager returned invalid pool data.");
  return {
    totalDeposits: asInteger(value[0]),
    totalBorrowed: asInteger(value[1]),
    twapFallbackCount: Number(value[2]),
  };
}

function parsePrice(value: unknown): string {
  return asInteger(asRecord(value).price);
}

async function simulate(wallet: Wallet, method: string, ...args: xdr.ScVal[]) {
  const account = await server.getAccount(wallet.address);
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: wallet.networkPassphrase })
    .addOperation(requireContract().call(method, ...args))
    .setTimeout(30)
    .build();
  const result = await server.simulateTransaction(transaction);
  if ("error" in result) throw new Error(result.error);
  if (!result.result) throw new Error("Loan manager query returned no result.");
  return result.result.retval;
}

export async function getMarketConfig(wallet: Wallet): Promise<LoanMarket> {
  return parseMarket(scValToNative(await simulate(wallet, "get_market_config")));
}

export async function getPosition(wallet: Wallet, user = wallet.address): Promise<LoanPosition> {
  return parsePosition(scValToNative(await simulate(wallet, "get_position", address(user))));
}

export async function getDepositorBalance(wallet: Wallet, depositor = wallet.address): Promise<string> {
  return asInteger(scValToNative(await simulate(wallet, "get_depositor_balance", address(depositor))));
}

export async function getPoolInfo(wallet: Wallet): Promise<PoolInfo> {
  return parsePoolInfo(scValToNative(await simulate(wallet, "get_pool_info")));
}

export async function previewPrice(wallet: Wallet, asset: string): Promise<string> {
  return parsePrice(scValToNative(await simulate(wallet, "preview_price", address(asset))));
}

export async function isPaused(wallet: Wallet): Promise<boolean> {
  return Boolean(scValToNative(await simulate(wallet, "is_paused_view")));
}

export async function getLoanSnapshot(wallet: Wallet): Promise<LoanSnapshot> {
  const market = await getMarketConfig(wallet);
  const [position, depositorBalance, pool, collateralPrice, debtPrice, paused] = await Promise.all([
    getPosition(wallet),
    getDepositorBalance(wallet),
    getPoolInfo(wallet),
    previewPrice(wallet, market.collateral_token),
    previewPrice(wallet, market.debt_token),
    isPaused(wallet),
  ]);
  return {
    market,
    position,
    depositorBalance,
    pool,
    collateralPrice,
    debtPrice,
    paused,
  };
}

async function submit(wallet: Wallet, method: string, ...args: xdr.ScVal[]): Promise<string> {
  const account = await server.getAccount(wallet.address);
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: wallet.networkPassphrase })
    .addOperation(requireContract().call(method, ...args))
    .setTimeout(60)
    .build();
  const simulation = await server.simulateTransaction(transaction);
  if ("error" in simulation) throw new Error(simulation.error);
  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: wallet.networkPassphrase,
    address: wallet.address,
  });
  if (signed.error) throw new Error(signed.error.message);
  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, wallet.networkPassphrase);
  const submitted = await server.sendTransaction(signedTransaction);
  if (submitted.status === "ERROR") throw new Error("The network rejected the signed transaction.");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await server.getTransaction(submitted.hash);
    if (result.status === "SUCCESS") return submitted.hash;
    if (result.status === "FAILED") throw new Error("The lending transaction failed on-chain.");
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  throw new Error(`Transaction ${submitted.hash} is still pending. Check it on Stellar Expert.`);
}

export function depositLiquidity(wallet: Wallet, value: string) {
  return submit(wallet, "deposit", address(wallet.address), amount(value));
}

export function withdrawLiquidity(wallet: Wallet, value: string) {
  return submit(wallet, "withdraw", address(wallet.address), amount(value));
}

export function depositCollateral(wallet: Wallet, value: string) {
  return submit(wallet, "deposit_collateral", address(wallet.address), amount(value));
}

export function borrow(wallet: Wallet, value: string) {
  return submit(wallet, "borrow", address(wallet.address), amount(value));
}

export function repay(wallet: Wallet, value: string) {
  return submit(wallet, "repay", address(wallet.address), amount(value));
}

export function healthFactor(position: LoanPosition, snapshot: LoanSnapshot) {
  if (BigInt(position.debt) === 0n) return { numerator: 1n, denominator: 0n };
  const collateralValue = BigInt(position.collateral) * BigInt(snapshot.collateralPrice) / priceScale;
  const debtValue = BigInt(position.debt) * BigInt(snapshot.debtPrice) / priceScale;
  return {
    numerator: collateralValue * BigInt(snapshot.market.liq_threshold_bps),
    denominator: debtValue * 10_000n,
  };
}

export function borrowCapacity(snapshot: LoanSnapshot) {
  const collateralValue = BigInt(snapshot.position.collateral) * BigInt(snapshot.collateralPrice) / priceScale;
  const maxDebtValue = collateralValue * BigInt(snapshot.market.liq_threshold_bps) / 10_000n;
  const maxDebtUnits = maxDebtValue * priceScale / BigInt(snapshot.debtPrice);
  const positionCapacity = maxDebtUnits > BigInt(snapshot.position.debt)
    ? maxDebtUnits - BigInt(snapshot.position.debt)
    : 0n;
  const freeLiquidity = BigInt(snapshot.pool.totalDeposits) - BigInt(snapshot.pool.totalBorrowed);
  const available = positionCapacity < freeLiquidity ? positionCapacity : freeLiquidity > 0n ? freeLiquidity : 0n;
  return available > maxInt128 ? maxInt128 : available;
}

export function encodePoolInfoXdr(pool: PoolInfo): string {
  return xdr.ScVal.scvVec([
    BigInt(pool.totalDeposits),
    BigInt(pool.totalBorrowed),
    pool.twapFallbackCount,
  ].map((value, index) => index === 2
    ? nativeToScVal(value, { type: "u32" })
    : nativeToScVal(value, { type: "i128" }))).toXDR("base64");
}

export function decodePoolInfoXdr(encoded: string): PoolInfo {
  return parsePoolInfo(scValToNative(xdr.ScVal.fromXDR(encoded, "base64")));
}

export const loanManagerNetwork = appNetwork;
export const configuredLoanManagerContractId = contractId;