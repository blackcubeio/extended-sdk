import type { NativeBalance } from '../common/native';
import type { Balance } from '../common/types';
import { xtrasOf } from './xtras';

const KNOWN = ['collateralName', 'balance', 'equity', 'availableForTrade'] as const;

/**
 * Convertisseur solde Extended (`/user/balance`) ↔ {@link Balance} unifié. Le compte Extended porte
 * un collatéral USD unique (`balance`/`equity`), `available` = disponible au trading.
 */
export class BalanceConverter {
  toCommon(wire: NativeBalance): Balance {
    return {
      asset: wire.collateralName ?? 'USD',
      total: String(wire.balance ?? wire.equity ?? '0'),
      available: wire.availableForTrade != null ? String(wire.availableForTrade) : null,
      usdValue: wire.equity != null ? String(wire.equity) : null,
      xtras: xtrasOf(wire, KNOWN),
    };
  }
}
