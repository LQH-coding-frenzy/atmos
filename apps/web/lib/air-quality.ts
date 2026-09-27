export type AirQualityCategory = {
  label: string;
  level: 'good' | 'moderate' | 'elevated' | 'poor' | 'very-poor' | 'hazardous';
};

export function classifyUsAqi(value: number | null): AirQualityCategory | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  if (value <= 50) return { label: 'Good', level: 'good' };
  if (value <= 100) return { label: 'Moderate', level: 'moderate' };
  if (value <= 150) return { label: 'Unhealthy for sensitive groups', level: 'elevated' };
  if (value <= 200) return { label: 'Unhealthy', level: 'poor' };
  if (value <= 300) return { label: 'Very unhealthy', level: 'very-poor' };
  return { label: 'Hazardous', level: 'hazardous' };
}

export function classifyEuropeanAqi(value: number | null): AirQualityCategory | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  if (value <= 20) return { label: 'Good', level: 'good' };
  if (value <= 40) return { label: 'Fair', level: 'moderate' };
  if (value <= 60) return { label: 'Moderate', level: 'elevated' };
  if (value <= 80) return { label: 'Poor', level: 'poor' };
  if (value <= 100) return { label: 'Very poor', level: 'very-poor' };
  return { label: 'Extremely poor', level: 'hazardous' };
}

export function formatAqiValue(value: number | null): string {
  return value === null ? 'Unavailable' : String(Math.round(value));
}
