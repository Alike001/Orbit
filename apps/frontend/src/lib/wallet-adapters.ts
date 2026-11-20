import freighterApi from "@stellar/freighter-api";
const { getAddress, isConnected, requestAccess, signTransaction: freighterSignTransaction } = freighterApi;
import { StrKey } from "@stellar/stellar-sdk";
import albedo from "@albedo-link/intent";

export type WalletProvider = "freighter" | "albedo" | "xbull";
export interface SignOptions { networkPassphrase?: string; address?: string; }
function networkName(passphrase?: string): "testnet" | "public" {
  return passphrase === "Public Global Stellar Network ; September 2015" || passphrase?.toUpperCase() === "PUBLIC" ? "public" : "testnet";
}
export interface WalletAdapter {
  readonly provider: WalletProvider;
  connect(): Promise<string>;
  disconnect(): Promise<void>;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, opts?: SignOptions): Promise<string>;
}
export const WALLET_STORAGE_KEY = "orbit_wallet_provider";
const names: WalletProvider[] = ["freighter", "albedo", "xbull"];
export function isWalletProvider(value: unknown): value is WalletProvider {
  return typeof value === "string" && names.includes(value as WalletProvider);
}
export function storedWalletProvider(): WalletProvider | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(WALLET_STORAGE_KEY);
    return isWalletProvider(saved) ? saved : null;
  } catch { return null; }
}
export function persistWalletProvider(provider: WalletProvider): void {
  try { window.localStorage.setItem(WALLET_STORAGE_KEY, provider); } catch { /* optional storage */ }
}
export function clearWalletProvider(): void {
  try { window.localStorage.removeItem(WALLET_STORAGE_KEY); } catch { /* storage may be blocked */ }
}
function requireAddress(address: unknown): string {
  if (typeof address !== "string" || !StrKey.isValidEd25519PublicKey(address)) {
    throw new Error("Wallet did not return a valid Stellar public key.");
  }
  return address;
}
function userFacingError(error: unknown, provider: string): Error {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (/reject|cancel|deny|declin|closed/i.test(msg)) return new Error(provider + " connection or signing request was rejected.");
  return new Error(msg || provider + " wallet request failed.");
}
export class FreighterAdapter implements WalletAdapter {
  readonly provider = "freighter" as const;
  async connect(): Promise<string> {
    try {
      const connected = await isConnected();
      if (!connected.isConnected || connected.error) throw new Error("Freighter extension is not available. Install Freighter and refresh.");
      const access = await requestAccess();
      if (access.error) throw new Error(access.error.message);
      return requireAddress(access.address || (await getAddress()).address);
    } catch (err) { throw userFacingError(err, "Freighter"); }
  }
  async getPublicKey(): Promise<string> {
    const response = await getAddress();
    if (response.error) throw new Error(response.error.message);
    return requireAddress(response.address);
  }
  async signTransaction(xdr: string, opts: SignOptions = {}): Promise<string> {
    const response = await freighterSignTransaction(xdr, {
      address: opts.address || await this.getPublicKey(),
      networkPassphrase: opts.networkPassphrase,
    });
    if (response.error || !response.signedTxXdr) throw new Error(response.error?.message || "Freighter signing failed.");
    return response.signedTxXdr;
  }
  async disconnect(): Promise<void> { /* Freighter does not expose permission revocation. */ }
}
export class AlbedoAdapter implements WalletAdapter {
  readonly provider = "albedo" as const;
  private publicKey: string | null = null;
  async connect(): Promise<string> {
    try {
      const result = await albedo.publicKey({});
      this.publicKey = requireAddress(result.pubkey);
      return this.publicKey;
    } catch (err) { throw userFacingError(err, "Albedo"); }
  }
  async getPublicKey(): Promise<string> {
    return this.publicKey || this.connect();
  }
  async signTransaction(xdr: string, opts: SignOptions = {}): Promise<string> {
    try {
      const result = await albedo.tx({
        xdr, pubkey: opts.address || await this.getPublicKey(),
        network: networkName(opts.networkPassphrase), submit: false,
      });
      if (!result.signed_envelope_xdr) throw new Error("Albedo did not return a signed envelope.");
      return result.signed_envelope_xdr;
    } catch (err) { throw userFacingError(err, "Albedo"); }
  }
  async disconnect(): Promise<void> { this.publicKey = null; }
}
interface XBullBridge {
  connect(options: { canRequestPublicKey: boolean; canRequestSign: boolean }): Promise<unknown>;
  getPublicKey(): Promise<string>;
  signXDR(xdr: string, opts?: { network: string; publicKey: string }): Promise<string>;
}
function xbull(): XBullBridge {
  if (typeof window === "undefined" || !("xBullSDK" in window) || !window.xBullSDK) {
    throw new Error("xBull extension not detected. Install xBull Wallet and reload this page.");
  }
  return window.xBullSDK;
}
declare global {
  interface Window { xBullSDK?: XBullBridge; }
}
export class XBullAdapter implements WalletAdapter {
  readonly provider = "xbull" as const;
  async connect(): Promise<string> {
    try {
      await xbull().connect({ canRequestPublicKey: true, canRequestSign: true });
      return this.getPublicKey();
    } catch (err) { throw userFacingError(err, "xBull"); }
  }
  async getPublicKey(): Promise<string> {
    return requireAddress(await xbull().getPublicKey());
  }
  async signTransaction(xdr: string, opts: SignOptions = {}): Promise<string> {
    try {
      const key = opts.address || await this.getPublicKey();
      const network = networkName(opts.networkPassphrase);
      const signed = await xbull().signXDR(xdr, { publicKey: key, network });
      if (typeof signed !== "string" || !signed) throw new Error("xBull did not return signed transaction XDR.");
      return signed;
    } catch (err) { throw userFacingError(err, "xBull"); }
  }
  async disconnect(): Promise<void> { /* Wallet extension permissions are managed by xBull. */ }
}
export function getWalletAdapter(provider: WalletProvider): WalletAdapter {
  switch (provider) {
    case "freighter": return new FreighterAdapter();
    case "albedo": return new AlbedoAdapter();
    case "xbull": return new XBullAdapter();
  }
}
