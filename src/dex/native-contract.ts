import type { Ack } from '../common/types';

/**
 * Interfaces **complémentaires** Extended : surface spécifique, hors contrat commun aux DEX.
 * Accessibles via le namespace uniforme `dex.native.<capacité>(label?)` (convention partagée par les
 * SDK Blackcube). Noms d'interfaces (`ISubAccounts`, `IVault`, `IBuilder`, `ISigning`…) et verbes
 * (`create`/`getPerformance`/…) **alignés** sur les autres SDK quand le geste existe ailleurs.
 *
 * ⚠️ Toutes les écritures signées passent par la signature **StarkEx** (`rest/signing.ts`), **À
 * VALIDER au bit près sur testnet**.
 */

/** Entrée — onboarding/clé : signature EIP-712 produite par le wallet L1. */
export interface OnboardingInput {
  /** Signature EIP-712 `AccountCreation` (hex `0x…`) produite par le wallet L1. */
  ethSignature: string;
}

/**
 * Signature / onboarding Extended — dérivation de la keypair Stark L2 et helpers de hash. Spécifique
 * Extended (StarkEx).
 */
export interface ISigning {
  /**
   * Dérive la keypair Stark L2 (`privateKey`/`publicKey`) depuis une signature EIP-712 L1. **À
   * VALIDER** : équivalence avec `generate_keypair_from_eth_signature` du SDK Python.
   */
  deriveL2Key(input: OnboardingInput): { privateKey: string; publicKey: string };
}

/** Entrée — création d'un sous-compte (action SNIP `CREATE_SUB_ACCOUNT`). */
export interface CreateSubAccountInput {
  description?: string;
}

/** Sous-comptes Extended (action SNIP `CREATE_SUB_ACCOUNT` ; la **liste** est `account().getSubAccounts()`). */
export interface ISubAccountsAdmin {
  /** Crée un sous-compte (renvoie un {@link Ack} ; payload natif en `xtras`). */
  create(input?: CreateSubAccountInput): Promise<Ack>;
}

/** Vault de rendement Extended (`/user/vault/*`). Lectures de performance/résumé (passe-plats). */
export interface IVault {
  /** Performance du vault (brut volontaire — pas de forme commune cross-DEX). */
  getPerformance(): Promise<unknown>;
  /** Résumé du vault (brut volontaire). */
  getSummary(): Promise<unknown>;
}

/** Entrée — placement avec builder code (frais d'intégrateur). */
export interface BuilderInfo {
  builderId: number;
  builderFee: string;
}

/**
 * Builder codes Extended : un placement peut porter `builderFee`/`builderId`. Cette interface expose
 * la **configuration** d'un builder par défaut, appliquée aux placements via `native.perp()`.
 */
export interface IBuilder {
  /** Définit le builder code par défaut appliqué aux ordres signés. */
  setDefault(info: BuilderInfo): void;
  /** Builder code courant (ou `null`). */
  current(): BuilderInfo | null;
}
