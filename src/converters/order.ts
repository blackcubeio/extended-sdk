import type { NativeOrder } from '../common/native';
import type { MarketKind, Order } from '../common/types';
import { xtrasOf } from './xtras';

const KNOWN = [
  'id',
  'externalId',
  'market',
  'type',
  'side',
  'status',
  'price',
  'qty',
  'filledQty',
  'reduceOnly',
  'timeInForce',
  'createdTime',
] as const;

const TYPE: Record<string, Order['type']> = {
  LIMIT: 'limit',
  MARKET: 'market',
  CONDITIONAL: 'stop',
  TPSL: 'takeProfit',
  TWAP: 'other',
};
const STATUS: Record<string, Order['status']> = {
  NEW: 'open',
  UNTRIGGERED: 'open',
  PARTIALLY_FILLED: 'partiallyFilled',
  FILLED: 'filled',
  CANCELLED: 'canceled',
  EXPIRED: 'expired',
  REJECTED: 'rejected',
};
const TIF: Record<string, Order['tif']> = {
  GTT: 'gtc',
  IOC: 'ioc',
  FOK: 'fok',
};

/** Convertisseur ordre Extended (`/user/orders`) ↔ {@link Order} unifié. */
export class OrderConverter {
  constructor(private readonly kind: MarketKind = 'perp') {}

  toCommon(wire: NativeOrder): Order {
    return {
      name: wire.market,
      kind: this.kind,
      id: String(wire.id ?? ''),
      clientId: wire.externalId != null ? String(wire.externalId) : null,
      side: wire.side === 'SELL' ? 'sell' : 'buy',
      type: (wire.type !== undefined ? TYPE[wire.type] : undefined) ?? 'other',
      price: wire.price != null ? String(wire.price) : null,
      size: String(wire.qty ?? '0'),
      filled: String(wire.filledQty ?? '0'),
      status: (wire.status !== undefined ? STATUS[wire.status] : undefined) ?? 'other',
      tif: wire.timeInForce !== undefined ? (TIF[wire.timeInForce] ?? null) : null,
      reduceOnly: typeof wire.reduceOnly === 'boolean' ? wire.reduceOnly : null,
      time: Number(wire.createdTime ?? 0),
      xtras: xtrasOf(wire, KNOWN),
    };
  }
}
