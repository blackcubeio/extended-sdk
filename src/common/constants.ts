import type { Network } from './types';

// ── Hôtes Extended (Starknet/StarkEx perp), suffixe REST `/api/v1` (cf. x10 config.py) ────────
export const REST_URLS: Record<Network, string> = {
  mainnet: 'https://api.starknet.extended.exchange/api/v1',
  testnet: 'https://api.starknet.sepolia.extended.exchange/api/v1',
};

/** URLs WebSocket (souscription par PATH, 1 channel = 1 connexion). */
export const WS_URLS: Record<Network, string> = {
  mainnet: 'wss://api.starknet.extended.exchange/stream.extended.exchange/v1',
  testnet: 'wss://api.starknet.sepolia.extended.exchange/stream.extended.exchange/v1',
};

/** URLs d'onboarding (signature EIP-712 AccountRegistration → keypair L2). Sans suffixe `/api/v1`. */
export const ONBOARDING_URLS: Record<Network, string> = {
  mainnet: 'https://api.starknet.extended.exchange',
  testnet: 'https://api.starknet.sepolia.extended.exchange',
};

/** Domaine de signature L1 (EIP-712 `EIP712Domain{name}`) par réseau (cf. config.py `signing_domain`). */
export const SIGNING_DOMAIN: Record<Network, string> = {
  mainnet: 'extended.exchange',
  testnet: 'starknet.sepolia.extended.exchange',
};

/**
 * Domaine SNIP-12 StarkEx (rev. 1) par réseau (cf. config.py `starknet_domain`). `name="Perpetuals"`,
 * `version="v0"`, `revision="1"` partout ; seul `chainId` diffère (`SN_MAIN` / `SN_SEPOLIA`).
 */
export const STARKNET_DOMAIN: Record<
  Network,
  { name: string; version: string; chainId: string; revision: string }
> = {
  mainnet: { name: 'Perpetuals', version: 'v0', chainId: 'SN_MAIN', revision: '1' },
  testnet: { name: 'Perpetuals', version: 'v0', chainId: 'SN_SEPOLIA', revision: '1' },
};

/** Décimales du collatéral USD (`collateral_decimals=6`). */
export const COLLATERAL_DECIMALS = 6;

/** `collateral_asset_on_chain_id` StarkEx (= `0x1`) — identifiant collatéral pour transferts/retraits. */
export const COLLATERAL_ASSET_ON_CHAIN_ID = '0x1';

/** Frais taker par défaut (cf. order_object.py `DEFAULT_TAKER_FEE`). */
export const DEFAULT_TAKER_FEE = '0.0005';

/**
 * Buffer (jours) ajouté à l'expiration côté **signature** (cf. order_object_settlement.py
 * `SETTLEMENT_EXPIRATION_BUFFER_DAYS`). 14 pour les ordres ; 15 pour les retraits ; 21 pour les transferts.
 */
export const SETTLEMENT_EXPIRATION_BUFFER_DAYS = {
  order: 14,
  withdrawal: 15,
  transfer: 21,
} as const;

/** En-tête `User-Agent` **obligatoire** sur REST ET WS (sinon requêtes rejetées). */
export const USER_AGENT = '@blackcube/extended-sdk';
