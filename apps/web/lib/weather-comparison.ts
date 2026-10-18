import type { UnitSystem } from '@atmos/contracts';

export const maximumComparedDestinations = 3;
export const maximumConcurrentComparisonAqiRequests = 2;
export const maximumComparisonAqiCacheEntries = 8;

export function comparisonLocationKey(location: { latitude: number; longitude: number }) {
  return `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
}

export async function runWithComparisonConcurrency<T>(
  items: readonly T[],
  concurrencyLimit: number,
  task: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const concurrency = Math.min(
    items.length,
    Number.isFinite(concurrencyLimit) ? Math.max(1, Math.floor(concurrencyLimit)) : 1,
  );
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await task(items[index]!);
      }
    }),
  );
}

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
