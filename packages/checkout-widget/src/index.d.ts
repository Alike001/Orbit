export type OrbitTheme = 'dark' | 'light' | 'auto';
export interface OrbitBrandTheme {
  mode?: 'light' | 'dark';
  primaryColor?: string;
  backgroundColor?: string;
  borderRadius?: OrbitBorderRadius;
  logoUrl?: string;
  fontFamily?: string;
}
export interface OrbitCheckoutSuccessMessage { type: 'ORBIT_CHECKOUT_SUCCESS'; vaultId: string; transactionHash: string; timestamp: string; nonce: string; }
export interface OrbitCheckoutFailureMessage { type: 'ORBIT_CHECKOUT_FAILED'; code: string; message: string; nonce: string; }
export interface OrbitCheckoutClosedMessage { type: 'ORBIT_CHECKOUT_CLOSED'; nonce: string; }
export type OrbitBorderRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';
export interface OrbitCustomClasses { modal?: string; header?: string; button?: string; }

export interface OrbitCustomField {
  id: string;
  label?: string;
  type?: 'text' | 'email' | 'number' | 'tel';
  required?: boolean;
  placeholder?: string;
}

export interface OrbitReadyEvent { type: 'orbit:ready'; planId?: string; }
export interface OrbitWalletConnectedEvent { type: 'orbit:wallet_connected'; address: string; type?: 'wallet' | 'passkey' | 'wallet_connect'; isNew?: boolean; }
export interface OrbitSubscribedEvent { type: 'orbit:subscribed'; subscriptionId?: string; planId?: string; txHash: string; metadata?: Record<string, any>; couponCode?: string; }
export interface OrbitErrorEvent { type: 'orbit:error'; message: string; }
export interface OrbitCloseEvent { type: 'orbit:close'; }
export interface OrbitBridgeFundsArrivedEvent { type: 'orbit:bridge_funds_arrived'; address: string; balance: number; }

export interface OrbitCheckoutProps {
  planId?: string;
  planData?: any;
  apiUrl?: string;
  demo?: boolean;
  allowedWallets?: string[];
  orbitContractId?: string;
  tokenContractId?: string;
  rpcUrl?: string;
  networkPassphrase?: string;
  theme?: OrbitTheme | OrbitBrandTheme;
  accentColor?: string;
  borderRadius?: OrbitBorderRadius;
  fontFamily?: string;
  customClasses?: OrbitCustomClasses;
  allowedOrigins?: string[];
  customFields?: OrbitCustomField[];
  walletConnectProjectId?: string;
  termsUrl?: string;
  privacyUrl?: string;
  requireConsent?: boolean;
}

export interface DelegatedSessionKey {
  address: string;
  secret: string;
  delegatedBy?: string;
  createdAt: number;
  expiresAt: number;
  permissions?: Record<string, any>;
}
export function createDelegatedSessionKey(options?: any): any;
export function getActiveSessionKey(): any;
export function revokeSessionKey(): void;
export class SessionWalletAdapter {
  constructor(session: any);
  getAddress(): Promise<{ address: string }>;
  signTransaction(xdr: string, options?: any): Promise<{ signedTxXdr: string }>;
  disconnect(): Promise<boolean>;
}

export default function OrbitCheckout(props: OrbitCheckoutProps): JSX.Element;