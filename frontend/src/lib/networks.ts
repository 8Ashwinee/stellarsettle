import { Networks } from "@stellar/stellar-sdk";

export type NetworkName = "testnet" | "mainnet";
export type NetworkConfig = { name: NetworkName; label: string; rpcUrl: string; passphrase: string; contractId: string };

const STORAGE_KEY = "stellarsettle:network";
const env = import.meta.env;
const buildDefault: NetworkName = env.VITE_STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

function pick(name: NetworkName, specific: string | undefined, legacy: string | undefined, fallback: string) {
  return specific || (name === buildDefault && legacy) || fallback;
}

export const networkConfigs: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: "testnet",
    label: "Stellar Testnet",
    rpcUrl: pick("testnet", env.VITE_STELLAR_TESTNET_RPC_URL, env.VITE_STELLAR_RPC_URL, "https://soroban-testnet.stellar.org"),
    passphrase: Networks.TESTNET,
    contractId: pick("testnet", env.VITE_STELLAR_TESTNET_CONTRACT_ID, env.VITE_STELLAR_CONTRACT_ID, ""),
  },
  mainnet: {
    name: "mainnet",
    label: "Stellar Mainnet",
    rpcUrl: pick("mainnet", env.VITE_STELLAR_MAINNET_RPC_URL, env.VITE_STELLAR_RPC_URL, "https://mainnet.sorobanrpc.com"),
    passphrase: Networks.PUBLIC,
    contractId: pick("mainnet", env.VITE_STELLAR_MAINNET_CONTRACT_ID, env.VITE_STELLAR_CONTRACT_ID, ""),
  },
};

export function getInitialNetwork(): NetworkName {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "testnet" || saved === "mainnet") return saved;
  } catch {
    /* ignore */
  }
  return buildDefault;
}

export function rememberNetwork(name: NetworkName) {
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* ignore */
  }
}
