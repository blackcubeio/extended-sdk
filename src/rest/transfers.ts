import type { ExtendedClient } from '../common/config';
import { COLLATERAL_DECIMALS } from '../common/constants';
import type { ExtendedEnvelope } from '../common/native';
import { scaleToStark } from '../common/utils';
import { httpPost } from './client';
import {
  collateralId,
  hashTransfer,
  hashWithdrawal,
  settlementExpiration,
  signMsgHash,
  toBigInt,
} from './signing';
import type { SigningCtx } from './trading';

const COLLATERAL_RESOLUTION = 10 ** COLLATERAL_DECIMALS;

/**
 * Retrait (`POST /user/withdraw`) : construit le settlement StarkEx signé (hash de retrait, buffer
 * 15 j) puis envoie. **À VALIDER au bit près sur testnet** (cf. `rest/signing.ts`).
 */
export function withdraw(
  client: ExtendedClient,
  ctx: SigningCtx,
  params: { amount: string; recipient?: string; nonce?: number; description?: string },
  label?: string,
): Promise<ExtendedEnvelope> {
  const nonce = params.nonce ?? Math.floor(Math.random() * 2 ** 31);
  const expirationMs = Date.now();
  const recipient = params.recipient ?? ctx.l2PublicKey;
  const amount = scaleToStark(params.amount, COLLATERAL_RESOLUTION, 'down');
  const msgHash = hashWithdrawal(
    {
      recipient: toBigInt(recipient),
      positionId: toBigInt(String(ctx.vaultId)),
      amount,
      expiration: settlementExpiration(expirationMs, 'withdrawal'),
      salt: BigInt(nonce),
      userPublicKey: toBigInt(ctx.l2PublicKey),
      collateralId: collateralId(),
    },
    ctx.network,
  );
  const signature = signMsgHash(msgHash, ctx.l2PrivateKey);
  const body = {
    amount: params.amount,
    asset: 'USD',
    description: params.description,
    settlement: {
      recipient,
      positionId: String(ctx.vaultId),
      collateralId: collateralId().toString(),
      amount: amount.toString(),
      expiration: settlementExpiration(expirationMs, 'withdrawal').toString(),
      salt: nonce,
      signature,
    },
  };
  return httpPost(client, '/user/withdraw', ctx.apiKey, body, label);
}

/**
 * Transfert collatéral vers un autre compte/sous-compte (`POST /user/transfer`) : settlement StarkEx
 * signé (hash de transfert, buffer 21 j). **À VALIDER au bit près sur testnet**.
 */
export function transfer(
  client: ExtendedClient,
  ctx: SigningCtx,
  params: { toVault: string; toPublicKey: string; amount: string; nonce?: number },
  label?: string,
): Promise<ExtendedEnvelope> {
  const nonce = params.nonce ?? Math.floor(Math.random() * 2 ** 31);
  const expirationMs = Date.now();
  const amount = scaleToStark(params.amount, COLLATERAL_RESOLUTION, 'down');
  const msgHash = hashTransfer(
    {
      recipientPositionId: toBigInt(params.toVault),
      senderPositionId: toBigInt(String(ctx.vaultId)),
      amount,
      expiration: settlementExpiration(expirationMs, 'transfer'),
      salt: BigInt(nonce),
      userPublicKey: toBigInt(ctx.l2PublicKey),
      collateralId: collateralId(),
    },
    ctx.network,
  );
  const signature = signMsgHash(msgHash, ctx.l2PrivateKey);
  const body = {
    fromVault: String(ctx.vaultId),
    toVault: params.toVault,
    amount: params.amount,
    transferredAsset: collateralId().toString(),
    settlement: {
      amount: amount.toString(),
      assetId: collateralId().toString(),
      expirationTimestamp: settlementExpiration(expirationMs, 'transfer').toString(),
      nonce,
      receiverPositionId: params.toVault,
      receiverPublicKey: params.toPublicKey,
      senderPositionId: String(ctx.vaultId),
      senderPublicKey: ctx.l2PublicKey,
      signature,
    },
  };
  return httpPost(client, '/user/transfer', ctx.apiKey, body, label);
}
