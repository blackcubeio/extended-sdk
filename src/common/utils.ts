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

/** Compte les décimales d'une résolution puissance de 10 (`1e6` → `6`). */
function resolutionDecimals(resolution: number): number {
  return Math.round(Math.log10(resolution));
}

/** Décompose une chaîne décimale signée en `{ negative, digits, scale }` (entier `digits·10^-scale`). */
function parseDecimal(value: string): { negative: boolean; digits: bigint; scale: number } {
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  const [intPart, fracPart = ''] = abs.split('.');
  const digits = BigInt(`${intPart === '' ? '0' : intPart}${fracPart}`);
  return { negative, digits, scale: fracPart.length };
}

/**
 * Reproduit **exactement** `convert_human_readable_to_stark_quantity` du SDK Python : multiplie une
 * **chaîne décimale** par une `resolution` (puissance de 10) et arrondit en entier StarkEx. Tout le
 * calcul est en `BigInt` (zéro flottant) pour éviter la dérive de précision (ex. `0.0005*3.6` qui en
 * `Number` vaut `0.0018000000000000002` et casserait l'arrondi du `fee_amount`, donc la signature).
 *
 * `rounding` : `'up'` (achat/fee) ou `'down'` (vente), miroir des contextes Python
 * (`ROUNDING_BUY_CONTEXT`/`ROUNDING_SELL_CONTEXT`/`ROUNDING_FEE_CONTEXT`).
 */
export function scaleToStark(
  value: string,
  resolution: number,
  rounding: 'up' | 'down' = 'down',
): bigint {
  return scaleProductToStark([value], resolution, rounding);
}

/**
 * Variante : scale le **produit** de plusieurs chaînes décimales (ex. `size × price` pour le
 * collatéral, `fee × size × price` pour les frais) par `resolution`, en arithmétique entière exacte.
 * Le signe est porté hors de la magnitude ; l'arrondi (`up`/`down`) s'applique sur la troncature.
 */
export function scaleProductToStark(
  values: string[],
  resolution: number,
  rounding: 'up' | 'down' = 'down',
): bigint {
  let negative = false;
  let numerator = 1n; // produit des magnitudes (digits)
  let totalScale = 0; // somme des décimales des facteurs
  for (const value of values) {
    const parsed = parseDecimal(value);
    negative = negative !== parsed.negative;
    numerator *= parsed.digits;
    totalScale += parsed.scale;
  }
  // numerator · 10^-totalScale · 10^decimals = numerator · 10^(decimals-totalScale)
  const decimals = resolutionDecimals(resolution);
  const shift = decimals - totalScale;
  let q: bigint;
  let hasRemainder = false;
  if (shift >= 0) {
    q = numerator * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    q = numerator / divisor;
    hasRemainder = numerator % divisor !== 0n;
  }
  if (rounding === 'up' && hasRemainder) {
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
