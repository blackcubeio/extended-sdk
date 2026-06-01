import type { NativeTrade } from '../common/native';
import type { Side, Trade } from '../common/types';
import { xtrasOf } from './xtras';

const KNOWN = ['p', 'q', 'S', 'T', 'i'] as const;

const toSide = (v: unknown): Side | null => (v === 'BUY' ? 'buy' : v === 'SELL' ? 'sell' : null);

/**
 * Convertisseur trade public Extended (`/info/markets/{m}/trades`, clés courtes `p,q,S,tT,T,i`) ↔
 * {@link Trade} unifié. `side` = sens du taker (champ `S`).
 */
export class TradeConverter {
  toCommon(wire: NativeTrade): Trade {
    return {
      price: String(wire.p),
      size: String(wire.q),
      side: toSide(wire.S),
      maker: null,
      time: Number(wire.T ?? 0),
      id: wire.i !== undefined ? Number(wire.i) : null,
      xtras: xtrasOf(wire, KNOWN),
    };
  }
}
