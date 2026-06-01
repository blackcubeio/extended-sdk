import type { NativePosition } from '../common/native';
import type { Position } from '../common/types';
import { xtrasOf } from './xtras';

const KNOWN = [
  'market',
  'side',
  'size',
  'openPrice',
  'markPrice',
  'unrealisedPnl',
  'leverage',
  'liquidationPrice',
  'margin',
] as const;

/** Convertisseur position Extended (`/user/positions`) ↔ {@link Position} unifiée. */
export class PositionConverter {
  toCommon(wire: NativePosition): Position {
    const size = String(wire.size ?? '0');
    const side =
      Number(size) === 0
        ? null
        : wire.side === 'SHORT'
          ? 'short'
          : wire.side === 'LONG'
            ? 'long'
            : null;
    return {
      name: wire.market,
      side,
      size,
      entryPrice: wire.openPrice != null ? String(wire.openPrice) : null,
      markPrice: wire.markPrice != null ? String(wire.markPrice) : null,
      unrealizedPnl: wire.unrealisedPnl != null ? String(wire.unrealisedPnl) : null,
      leverage: wire.leverage != null ? Number(wire.leverage) : null,
      liquidationPrice: wire.liquidationPrice != null ? String(wire.liquidationPrice) : null,
      margin: wire.margin != null ? String(wire.margin) : null,
      xtras: xtrasOf(wire, KNOWN),
    };
  }
}
