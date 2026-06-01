import type { NativeMarket } from '../common/native';
import type { Pair } from '../common/types';
import { decimalsOf } from '../common/utils';
import { xtrasOf } from './xtras';

const KNOWN = ['name', 'assetName', 'collateralAssetName', 'active', 'status'] as const;

/**
 * Convertisseur paire : marché natif Extended (`/info/markets`) ↔ {@link Pair} unifiée. Extended est
 * perp-only ; nom hyphené `BTC-USD` → base `BTC`, quote `USD`. Les pas viennent du `tradingConfig`
 * (`minPriceChange`/`minOrderSizeChange`) ; le levier max de `tradingConfig.maxLeverage`.
 */
export class PairConverter {
  toCommon(m: NativeMarket): Pair {
    const [base, quote] = m.name.includes('-')
      ? (m.name.split('-') as [string, string])
      : [m.assetName ?? m.name, m.collateralAssetName ?? 'USD'];
    const tc = m.tradingConfig ?? {};
    const stepSize = tc.minOrderSizeChange;
    const tickSize = tc.minPriceChange;
    const maxLeverage = tc.maxLeverage !== undefined ? Number(tc.maxLeverage) : undefined;
    return {
      name: m.name,
      base,
      quote,
      kind: 'perp',
      szDecimals: stepSize !== undefined ? decimalsOf(stepSize) : (m.assetPrecision ?? 0),
      ...(maxLeverage !== undefined && Number.isFinite(maxLeverage) ? { maxLeverage } : {}),
      ...(tickSize !== undefined ? { tickSize } : {}),
      ...(stepSize !== undefined ? { stepSize } : {}),
      ...(tc.minOrderSize !== undefined ? { minNotional: tc.minOrderSize } : {}),
      status: m.status,
      xtras: xtrasOf(m, KNOWN),
    };
  }
}
