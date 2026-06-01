import type { ExtendedClient } from '../common/config';
import { DEFAULT_TAKER_FEE } from '../common/constants';
import type { ExtendedEnvelope, NativeOrder } from '../common/native';
import type { Network, Order, Side } from '../common/types';
import { scaleProductToStark, scaleToStark } from '../common/utils';
import { OrderConverter } from '../converters/order';
import { httpDelete, httpPatch, httpPost } from './client';
import {
  type StarkSignature,
  hashOrder,
  settlementExpiration,
  signMsgHash,
  toBigInt,
} from './signing';

/** Métadonnée de marché résolue (l2Config + nom) injectée par la façade pour le scaling/signature. */
export interface ResolvedMarket {
  name: string;
  syntheticId: string;
  syntheticResolution: number;
  collateralId: string;
  collateralResolution: number;
}

/** Signer résolu (clés Stark + apiKey + vault) pour une écriture. */
export interface SigningCtx {
  apiKey: string;
  l2PrivateKey: `0x${string}`;
  l2PublicKey: `0x${string}`;
  vaultId: number | string;
  network: Network;
}

/** Type d'ordre Extended (wire). */
const ORDER_TYPE: Record<string, string> = {
  limit: 'LIMIT',
  market: 'MARKET',
  stop: 'CONDITIONAL',
  stopMarket: 'CONDITIONAL',
  takeProfit: 'TPSL',
  takeProfitMarket: 'TPSL',
};

export interface PlaceOrderInput {
  name: string;
  side: Side;
  type: 'limit' | 'market' | 'stop' | 'stopMarket' | 'takeProfit' | 'takeProfitMarket';
  size: string;
  price?: string;
  triggerPrice?: string;
  tif?: 'gtc' | 'ioc' | 'fok' | 'alo';
  reduceOnly?: boolean;
  clientId?: string;
  /** Expiration de l'ordre (ms epoch). Défaut +1 h. */
  expireTimeMs?: number;
  /** Nonce/salt entier. Défaut aléatoire. */
  nonce?: number;
}

/**
 * Construit le **settlement StarkEx** d'un ordre (champs entiers scalés + signature `(r,s)`).
 *
 * Reproduit `create_order_settlement_data` du SDK Python : montant synthétique scalé par
 * `syntheticResolution`, montant collatéral = `size*price` scalé par `collateralResolution`, fee =
 * `taker_fee * collateral`, expiration = `expireTime + 14 j`, signe < 0 selon le sens (BUY ⇒ quote < 0,
 * SELL ⇒ base < 0). **Validé sur testnet Sepolia** : ordre BTC-USD accepté puis annulé (signature
 * StarkEx vérifiée par le serveur). Les montants sont calculés en décimal exact (BigInt) — un calcul
 * flottant dériverait sur le `fee_amount` et casserait la signature (cf. `common/utils.ts`).
 */
export function buildOrderSettlement(
  input: PlaceOrderInput,
  market: ResolvedMarket,
  ctx: SigningCtx,
  expireTimeMs: number,
  nonce: number,
): {
  orderHash: string;
  settlement: { signature: StarkSignature; starkKey: string; collateralPosition: string };
  debugging: { syntheticAmount: string; collateralAmount: string; feeAmount: string };
} {
  const isBuy = input.side === 'buy';
  const rounding = isBuy ? 'up' : 'down';
  const price = input.price ?? '0';

  // Montants scalés en **arithmétique décimale exacte** (cf. `create_order_settlement_data` Python) :
  // synthetic = size·synRes ; collateral = size·price·colRes ; fee = taker·size·price·colRes. Le
  // produit reste en BigInt pour reproduire au bit près l'arrondi Python (sinon la signature casse).
  let baseAmount = scaleToStark(input.size, market.syntheticResolution, rounding);
  let quoteAmount = scaleProductToStark([input.size, price], market.collateralResolution, rounding);
  const feeAmount = scaleProductToStark(
    [DEFAULT_TAKER_FEE, input.size, price],
    market.collateralResolution,
    'up',
  );
  if (isBuy) {
    quoteAmount = -quoteAmount;
  } else {
    baseAmount = -baseAmount;
  }

  const positionId = toBigInt(String(ctx.vaultId));
  const msgHash = hashOrder(
    {
      positionId,
      baseAssetId: toBigInt(market.syntheticId),
      baseAmount,
      quoteAssetId: toBigInt(market.collateralId),
      quoteAmount,
      feeAmount,
      feeAssetId: toBigInt(market.collateralId),
      expiration: settlementExpiration(expireTimeMs, 'order'),
      salt: BigInt(nonce),
      userPublicKey: toBigInt(ctx.l2PublicKey),
    },
    ctx.network,
  );
  const signature = signMsgHash(msgHash, ctx.l2PrivateKey);
  return {
    orderHash: msgHash.toString(),
    settlement: {
      signature,
      starkKey: ctx.l2PublicKey,
      collateralPosition: String(ctx.vaultId),
    },
    debugging: {
      syntheticAmount: baseAmount.toString(),
      collateralAmount: quoteAmount.toString(),
      feeAmount: feeAmount.toString(),
    },
  };
}

/**
 * Place un ordre (`POST /user/order`, sert aussi à l'édition via `id`/`cancelId`). Construit le
 * settlement StarkEx puis envoie le corps signé.
 */
export function placeOrder(
  client: ExtendedClient,
  ctx: SigningCtx,
  market: ResolvedMarket,
  input: PlaceOrderInput,
  label?: string,
  cancelId?: string,
): Promise<Order> {
  const expireTimeMs = input.expireTimeMs ?? Date.now() + 3_600_000;
  const nonce = input.nonce ?? Math.floor(Math.random() * 2 ** 31);
  const tif = input.type === 'market' ? 'IOC' : input.tif === 'ioc' ? 'IOC' : 'GTT';
  const { orderHash, settlement, debugging } = buildOrderSettlement(
    input,
    market,
    ctx,
    expireTimeMs,
    nonce,
  );

  const body: Record<string, unknown> = {
    // Extended : `id` = `str(order_hash)` quand aucun externalId (cf. order_object.py).
    id: orderHash,
    market: input.name,
    type: ORDER_TYPE[input.type],
    side: input.side === 'buy' ? 'BUY' : 'SELL',
    qty: input.size,
    price: input.price ?? '0',
    reduceOnly: input.reduceOnly ?? false,
    postOnly: input.type !== 'market' && input.tif === 'alo',
    timeInForce: tif,
    expiryEpochMillis: expireTimeMs,
    fee: DEFAULT_TAKER_FEE,
    nonce,
    settlement,
    debuggingAmounts: debugging,
  };
  if (input.clientId !== undefined) {
    body.externalId = input.clientId;
  }
  if (cancelId !== undefined) {
    body.cancelId = cancelId;
  }
  if (input.triggerPrice !== undefined) {
    body.trigger = { triggerPrice: input.triggerPrice, triggerPriceType: 'LAST' };
  }

  const converter = new OrderConverter('perp');
  return httpPost<NativeOrder>(client, '/user/order', ctx.apiKey, body, label).then((env) => {
    const data = env.data;
    if (data != null && typeof data === 'object') {
      return converter.toCommon({ ...(data as NativeOrder), market: input.name });
    }
    // Réponse minimale (id seul) : on n'invente aucun statut/fill.
    return {
      name: input.name,
      kind: 'perp',
      id: String((env.data as { id?: unknown } | undefined)?.id ?? ''),
      clientId: input.clientId ?? null,
      side: input.side,
      type: input.type,
      price: input.price ?? null,
      size: input.size,
      filled: '',
      status: 'other',
      tif: input.tif ?? null,
      reduceOnly: input.reduceOnly ?? null,
      time: Date.now(),
      xtras: env as Record<string, unknown>,
    };
  });
}

/** Annule un ordre par id (`DELETE /user/order/{id}`) ou par externalId (`?externalId=`). */
export function cancelOrder(
  client: ExtendedClient,
  apiKey: string,
  params: { id?: string; clientId?: string },
  label?: string,
): Promise<ExtendedEnvelope> {
  if (params.id !== undefined) {
    return httpDelete(client, `/user/order/${params.id}`, apiKey, undefined, undefined, label);
  }
  if (params.clientId !== undefined) {
    return httpDelete(
      client,
      '/user/order',
      apiKey,
      { externalId: params.clientId },
      undefined,
      label,
    );
  }
  throw new Error('cancelOrder : `id` ou `clientId` requis.');
}

/** Annulation de masse (`POST /user/order/massCancel`). */
export function massCancel(
  client: ExtendedClient,
  apiKey: string,
  body: {
    markets?: string[];
    orderIds?: string[];
    externalOrderIds?: string[];
    cancelAll?: boolean;
  },
  label?: string,
): Promise<ExtendedEnvelope> {
  return httpPost(client, '/user/order/massCancel', apiKey, body, label);
}

/**
 * Dead-man-switch (`POST /user/orders/auto-cancel`) : arme l'annulation auto de tous les ordres après
 * `afterMs`, à rafraîchir périodiquement. Désarmé en envoyant un délai nul/négatif.
 */
export function autoCancel(
  client: ExtendedClient,
  apiKey: string,
  countdownMs: number,
  label?: string,
): Promise<ExtendedEnvelope> {
  return httpPost(
    client,
    '/user/orders/auto-cancel',
    apiKey,
    { countdownTime: countdownMs },
    label,
  );
}

/** Levier (`PATCH /user/leverage`). */
export function updateLeverage(
  client: ExtendedClient,
  apiKey: string,
  body: { market: string; leverage: number },
  label?: string,
): Promise<ExtendedEnvelope> {
  return httpPatch(client, '/user/leverage', apiKey, body, label);
}
