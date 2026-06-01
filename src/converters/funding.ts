import type { NativeFunding } from '../common/native';
import type { FundingRate } from '../common/types';
import { xtrasOf } from './xtras';

const KNOWN = ['m', 'T', 'f'] as const;

/**
 * Convertisseur funding Extended (`/info/{m}/funding`, clés courtes `m,T,f`) ↔ {@link FundingRate}
 * unifié. `T` en **ms**, `f` taux décimal.
 */
export class FundingConverter {
  constructor(private readonly name: string) {}

  toCommon(wire: NativeFunding): FundingRate {
    return {
      name: wire.m ?? this.name,
      fundingRate: String(wire.f),
      time: Number(wire.T ?? 0),
      xtras: xtrasOf(wire, KNOWN),
    };
  }
}
