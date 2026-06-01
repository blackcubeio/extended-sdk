import { existsSync, readFileSync } from 'node:fs';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { SIGNING_DOMAIN } from '../src/common/constants';
import type { Network } from '../src/common/types';
import { l2KeyFromEthSignature } from '../src/rest/signing';

/** Lit une variable depuis le `.env` racine (ou les variables d'environnement). undefined si absente. */
export function readEnv(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess !== undefined && fromProcess !== '') {
    return fromProcess;
  }
  const url = new URL('../.env', import.meta.url);
  if (existsSync(url) === false) {
    return undefined;
  }
  const line = readFileSync(url, 'utf-8')
    .split('\n')
    .find((entry) => entry.startsWith(`${name}=`));
  if (line === undefined) {
    return undefined;
  }
  const value = line.slice(name.length + 1).trim();
  return value === '' ? undefined : value;
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function bytes32(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function addressBytes32(address: string): Uint8Array {
  const hex = address.toLowerCase().replace('0x', '').padStart(64, '0');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/**
 * Signe la struct EIP-712 `AccountCreation{accountIndex,wallet,tosAccepted}` (domaine
 * `EIP712Domain{name=signing_domain}`) avec la clé EVM, **exactement** comme
 * `get_key_derivation_struct_to_sign` du SDK Python (onboarding.py). Renvoie la signature `0x…65` octets
 * (r||s||v) attendue par `l2KeyFromEthSignature`.
 */
export function signAccountCreation(
  evmPrivateKey: string,
  evmAddress: string,
  network: Network,
): string {
  const signingDomain = SIGNING_DOMAIN[network];
  const domainTypeHash = keccak_256(utf8('EIP712Domain(string name)'));
  const nameHash = keccak_256(utf8(signingDomain));
  const domainSeparator = keccak_256(concat(domainTypeHash, nameHash));

  const structTypeHash = keccak_256(
    utf8('AccountCreation(int8 accountIndex,address wallet,bool tosAccepted)'),
  );
  const structHash = keccak_256(
    concat(structTypeHash, bytes32(0n), addressBytes32(evmAddress), bytes32(1n)),
  );

  const digest = keccak_256(concat(Uint8Array.from([0x19, 0x01]), domainSeparator, structHash));
  const sig = secp256k1.sign(digest, evmPrivateKey.replace(/^0x/, ''));
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  const v = (sig.recovery + 27).toString(16).padStart(2, '0');
  return `0x${r}${s}${v}`;
}

/**
 * Dérive le keypair Stark L2 (clé privée/publique) depuis la clé EVM via l'onboarding EIP-712 du SDK,
 * **sans dépendance externe** (signature secp256k1 maison + `l2KeyFromEthSignature`). Reproduit
 * `get_l2_keys_from_l1_account` → `generate_keypair_from_eth_signature` du SDK Python.
 */
export function deriveL2Signer(
  evmPrivateKey: string,
  evmAddress: string,
  network: Network,
): { privateKey: `0x${string}`; publicKey: `0x${string}` } {
  const signature = signAccountCreation(evmPrivateKey, evmAddress, network);
  const { privateKey, publicKey } = l2KeyFromEthSignature(signature);
  const norm = (h: string): `0x${string}` => (h.startsWith('0x') ? h : `0x${h}`) as `0x${string}`;
  return { privateKey: norm(privateKey), publicKey: norm(publicKey) };
}
