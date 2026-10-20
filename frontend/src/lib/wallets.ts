import { getNetwork, isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";

export type WalletId = "freighter" | "xbull";
export type WalletSession = { address: string; network: string; networkPassphrase: string };

export type WalletAdapter = {
  id: WalletId;
  name: string;
  isAvailable: () => Promise<boolean>;
  connect: (expectedPassphrase: string, expectedNetwork: string) => Promise<WalletSession>;
  sign: (xdr: string, opts: { networkPassphrase: string; address: string }) => Promise<string>;
};

type XBullSdk = {
  connect: (permissions: { canRequestPublicKey: boolean; canRequestSign: boolean }) => Promise<unknown>;
  getPublicKey: () => Promise<string>;
  signXDR: (xdr: string, opts?: { publicKey?: string; network?: string }) => Promise<string>;
};

function xbull(): XBullSdk | undefined {
  return (window as unknown as { xBullSDK?: XBullSdk }).xBullSDK;
}

const freighter: WalletAdapter = {
  id: "freighter",
  name: "Freighter",
  async isAvailable() {
    try {
      const status = await isConnected();
      return !status.error && status.isConnected;
    } catch {
      return false;
    }
  },
  async connect(expectedPassphrase, expectedNetwork) {
    const access = await requestAccess();
    if (access.error) throw new Error(access.error.message);
    if (!access.address) throw new Error("Freighter did not return an account address.");
    const selected = await getNetwork();
    if (selected.error) throw new Error(selected.error.message);
    if (selected.networkPassphrase !== expectedPassphrase) {
      throw new Error(`Freighter is on ${selected.network}; this app is configured for ${expectedNetwork}.`);
    }
    return { address: access.address, network: selected.network, networkPassphrase: selected.networkPassphrase };
  },
  async sign(xdr, opts) {
    const signed = await signTransaction(xdr, opts);
    if (signed.error) throw new Error(signed.error.message);
    return signed.signedTxXdr;
  },
};

const xBull: WalletAdapter = {
  id: "xbull",
  name: "xBull",
  async isAvailable() {
    return Boolean(xbull());
  },
  async connect(expectedPassphrase, expectedNetwork) {
    const sdk = xbull();
    if (!sdk) throw new Error("xBull is not installed or not available in this browser.");
    await sdk.connect({ canRequestPublicKey: true, canRequestSign: true });
    const address = await sdk.getPublicKey();
    if (!address) throw new Error("xBull did not return an account address.");
    return { address, network: expectedNetwork, networkPassphrase: expectedPassphrase };
  },
  async sign(xdr, opts) {
    const sdk = xbull();
    if (!sdk) throw new Error("xBull is not available.");
    return sdk.signXDR(xdr, { publicKey: opts.address, network: opts.networkPassphrase });
  },
};

export const walletAdapters: WalletAdapter[] = [freighter, xBull];

export function getWalletAdapter(id: WalletId = "freighter"): WalletAdapter {
  return walletAdapters.find((adapter) => adapter.id === id) ?? freighter;
}
