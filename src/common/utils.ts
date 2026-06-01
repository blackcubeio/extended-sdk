/** Durée (ms) d'un intervalle de bougie unifié (`1m`, `5m`, `1h`, `1d`, `1w`…). */
const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** Convertit un intervalle unifié (`<n><unit>`) en millisecondes. Renvoie `0` si non reconnu. */
export function intervalToMs(interval: string): number {
  const match = /^(\d+)\s*([mhdw])$/.exec(interval.trim().toLowerCase());
  if (match === null) {
    return 0;
  }
  const count = Number(match[1]);
  const unit = UNIT_MS[match[2] as string] ?? 0;
  return count * unit;
}

/**
 * Mappe un intervalle unifié (`1m`,`5m`,`15m`,`30m`,`1h`,`2h`,`4h`,`1d`) vers le code de résolution
 * Extended (`PT1M`,`PT5M`,…,`P1D`). Renvoie `undefined` si non supporté par la venue.
 */
const RESOLUTION: Record<string, string> = {
  '1m': 'PT1M',
  '5m': 'PT5M',
  '15m': 'PT15M',
  '30m': 'PT30M',
  '1h': 'PT1H',
  '2h': 'PT2H',
  '4h': 'PT4H',
  '1d': 'P1D',
};
export function toResolution(interval: string): string | undefined {
  return RESOLUTION[interval.trim().toLowerCase()];
}

/** Convertit un datetime unifié `YYYY-MM-DD HH:MM:SS` (UTC, C7) en millisecondes epoch. */
export function dateToMs(date: string): number {
  return new Date(`${date.replace(' ', 'T')}Z`).getTime();
}

/** Convertit des millisecondes epoch en datetime unifié `YYYY-MM-DD HH:MM:SS` (UTC). */
export function msToDate(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Convertit une valeur décimale (chaîne) en **entier StarkEx scalé** par `resolution` (cf.
 * `Asset.convert_human_readable_to_stark_quantity` : `value * resolution`, arrondi). `resolution`
 * est `syntheticResolution` / `collateralResolution` du `l2Config` du marché (ex. `1e6`).
 *
 * `rounding` : `'up'` (achat/fee) ou `'down'` (vente), pour reproduire les contextes d'arrondi du
 * SDK Python (`ROUNDING_BUY_CONTEXT`/`ROUNDING_SELL_CONTEXT`/`ROUNDING_FEE_CONTEXT`). Le calcul se
 * fait en **arithmétique entière** (BigInt) pour éviter toute perte de précision flottante.
 */
export function scaleToStark(
  value: string,
  resolution: number,
  rounding: 'up' | 'down' = 'down',
): bigint {
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  // resolution est une puissance de 10 (1eN) ; on compte ses décimales.
  const decimals = Math.round(Math.log10(resolution));
  const [intPart, fracPart = ''] = abs.split('.');
  const fracPadded = `${fracPart}${'0'.repeat(decimals)}`;
  const kept = fracPadded.slice(0, decimals);
  const dropped = fracPadded.slice(decimals);
  let q = BigInt(`${intPart}${kept}`);
  // Arrondi sur la partie tronquée (ROUND_UP si reste non nul, sinon ROUND_DOWN/exact).
  if (rounding === 'up' && /[1-9]/.test(dropped)) {
    q += 1n;
  }
  return negative ? -q : q;
}

/** Pas décimal `10^-decimals` sous forme de chaîne (ex. `5` → `"0.00001"`). */
export function decimalStep(decimals: number): string {
  if (decimals <= 0) {
    return '1';
  }
  return `0.${'0'.repeat(decimals - 1)}1`;
}

/** Nombre de décimales d'un pas décimal (ex. `"0.001"` → `3`). */
export function decimalsOf(step: string): number {
  const idx = step.indexOf('.');
  return idx === -1 ? 0 : step.length - idx - 1;
}
