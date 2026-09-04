import { Wind } from 'lucide-react';
import { describeEuropeanAqi, describeUsAqi, mockAirQualitySnapshot } from '../lib/air-quality';

export function AirQualityCard() {
  const usAqi = describeUsAqi(mockAirQualitySnapshot.usAqi);
  const europeanAqi = describeEuropeanAqi(mockAirQualitySnapshot.europeanAqi);

  return (
    <article className="aqi-card panel" aria-labelledby="aqi-heading">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Air quality</p>
          <h2 id="aqi-heading">Breathing room</h2>
        </div>
        <Wind size={21} aria-hidden="true" />
      </div>
      <div className="aqi-summary">
        <div className={`aqi-value aqi-${usAqi.tone}`}>
          <strong>{mockAirQualitySnapshot.usAqi}</strong>
          <span>US AQI</span>
        </div>
        <div>
          <p className="aqi-category">{usAqi.label}</p>
          <p className="muted">{usAqi.guidance}</p>
          <p className="aqi-european">
            European AQI <strong>{mockAirQualitySnapshot.europeanAqi}</strong> · {europeanAqi.label}
          </p>
        </div>
      </div>
      <dl className="pollutant-grid">
        {mockAirQualitySnapshot.pollutants.map((pollutant) => (
          <div key={pollutant.name}>
            <dt>{pollutant.name}</dt>
            <dd>
              {pollutant.value} <small>{pollutant.unit}</small>
            </dd>
          </div>
        ))}
      </dl>
      <p className="aqi-source">
        Deterministic mock AQI snapshot until the live adapter is connected.
      </p>
    </article>
  );
}
