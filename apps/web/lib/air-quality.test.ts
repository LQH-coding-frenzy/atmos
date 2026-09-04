import { describe, expect, it } from 'vitest';
import { describeEuropeanAqi, describeUsAqi, mockAirQualitySnapshot } from './air-quality';

describe('air-quality classification', () => {
  it('classifies the documented mock snapshot consistently', () => {
    expect(describeUsAqi(mockAirQualitySnapshot.usAqi)).toMatchObject({
      label: 'Moderate',
      tone: 'moderate',
    });
    expect(describeEuropeanAqi(mockAirQualitySnapshot.europeanAqi)).toMatchObject({
      label: 'Fair',
      tone: 'fair',
    });
  });

  it('handles US AQI category boundaries without exposing health data', () => {
    expect(describeUsAqi(50).label).toBe('Good');
    expect(describeUsAqi(51).label).toBe('Moderate');
    expect(describeUsAqi(151).label).toBe('Unhealthy');
    expect(describeUsAqi(201).label).toBe('Very unhealthy');
  });
});
