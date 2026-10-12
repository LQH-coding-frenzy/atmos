import type { UnitSystem } from '@atmos/contracts';

export function temperatureDifference(comparedC: number, currentC: number, units: UnitSystem) {
  const deltaC = comparedC - currentC;
  const value = units === 'imperial' ? (deltaC * 9) / 5 : deltaC;
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return {
    value: rounded,
    label: `${sign}${rounded.toFixed(1)}°${units === 'imperial' ? 'F' : 'C'}`,
    direction: rounded > 0 ? 'warmer' : rounded < 0 ? 'cooler' : 'the same temperature',
  } as const;
}
