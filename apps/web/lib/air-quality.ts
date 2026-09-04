export type AirQualitySnapshot = {
  observedAt: string;
  usAqi: number;
  europeanAqi: number;
  pollutants: ReadonlyArray<{ name: string; value: number; unit: string }>;
};

export type AirQualityCategory = {
  label: string;
  tone: 'good' | 'fair' | 'moderate' | 'poor' | 'very-poor';
  guidance: string;
};

// Temporary FEAT-AQI-001 fixture. The dashboard contract does not expose AQI yet;
// replace this boundary with the normalized Open-Meteo air-quality adapter when available.
export const mockAirQualitySnapshot: AirQualitySnapshot = {
  observedAt: '2026-09-01T10:00:00.000Z',
  usAqi: 52,
  europeanAqi: 24,
  pollutants: [
    { name: 'PM2.5', value: 12, unit: 'ug/m3' },
    { name: 'PM10', value: 18, unit: 'ug/m3' },
    { name: 'NO2', value: 14, unit: 'ug/m3' },
    { name: 'O3', value: 62, unit: 'ug/m3' },
    { name: 'SO2', value: 3, unit: 'ug/m3' },
    { name: 'CO', value: 0.3, unit: 'mg/m3' },
  ],
};

export function describeUsAqi(value: number): AirQualityCategory {
  if (value <= 50) {
    return {
      label: 'Good',
      tone: 'good',
      guidance: 'Air quality is satisfactory for most people.',
    };
  }
  if (value <= 100) {
    return {
      label: 'Moderate',
      tone: 'moderate',
      guidance: 'Air quality is acceptable for most people.',
    };
  }
  if (value <= 150) {
    return {
      label: 'Unhealthy for sensitive groups',
      tone: 'fair',
      guidance: 'Sensitive groups may want to reduce prolonged outdoor exertion.',
    };
  }
  if (value <= 200) {
    return {
      label: 'Unhealthy',
      tone: 'poor',
      guidance: 'Consider reducing prolonged outdoor exertion.',
    };
  }
  return {
    label: 'Very unhealthy',
    tone: 'very-poor',
    guidance: 'Avoid prolonged outdoor exertion.',
  };
}

export function describeEuropeanAqi(value: number): AirQualityCategory {
  if (value <= 20) return { label: 'Good', tone: 'good', guidance: 'Low air-pollution levels.' };
  if (value <= 40)
    return { label: 'Fair', tone: 'fair', guidance: 'Air-pollution levels are acceptable.' };
  if (value <= 60)
    return { label: 'Moderate', tone: 'moderate', guidance: 'Some pollutants are elevated.' };
  if (value <= 80)
    return { label: 'Poor', tone: 'poor', guidance: 'Air-pollution levels are elevated.' };
  return { label: 'Very poor', tone: 'very-poor', guidance: 'Air-pollution levels are high.' };
}
