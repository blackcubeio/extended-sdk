import type { NativeUserTrade } from '../common/native';
import type { MarketKind, UserTrade } from '../common/types';
import { xtrasOf } from './xtras';

const KNOWN = [
  'id',
  'orderId',
  'market',
  'side',
  'price',
  'qty',
  'fee',
  'feeAsset',
  'isTaker',
  'realisedPnl',
  'createdTime',
] as const;

/** Convertisseur fill Extended (`/user/trades`) ↔ {@link UserTrade} unifié. */
export class UserTradeConverter {
  constructor(private readonly kind: MarketKind = 'perp') {}

  toCommon(wire: NativeUserTrade): UserTrade {
    return {
      name: wire.market,
      kind: this.kind,
      id: String(wire.id ?? ''),
      orderId: String(wire.orderId ?? ''),
      side: wire.side === 'SELL' ? 'sell' : 'buy',
      price: String(wire.price ?? '0'),
      size: String(wire.qty ?? '0'),
      fee: String(wire.fee ?? '0'),
      feeAsset: wire.feeAsset != null ? String(wire.feeAsset) : null,
      pnl: wire.realisedPnl != null ? String(wire.realisedPnl) : null,
      maker: typeof wire.isTaker === 'boolean' ? !wire.isTaker : null,
      time: Number(wire.createdTime ?? 0),
      xtras: xtrasOf(wire, KNOWN),
    };
  }
}
