import type {
  CurrentWeather,
  DailyForecast,
  ExtendedDailyForecast,
  HourlyForecast,
  UnitSystem,
} from '@atmos/contracts';
import { formatTemperature, formatWindSpeed } from '@atmos/domain';
import {
  formatDaylight,
  formatDirection,
  formatOptionalNumber,
  formatPrecipitation,
  formatSnowfall,
  formatSunTime,
  formatUv,
  formatVisibility,
} from '../lib/weather-measurements';

function Measurements({ values, label }: { values: Array<[string, string]>; label: string }) {
  return (
    <dl className="measurement-grid" aria-label={label}>
      {values.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function wind(value: number | null | undefined, units: UnitSystem) {
  return value == null ? 'Unavailable' : formatWindSpeed(value, units);
}
function temperature(value: number | null | undefined, units: UnitSystem) {
  return value == null
    ? 'Unavailable'
    : `${formatTemperature(value, units).replace(' deg', '')}°${units === 'metric' ? 'C' : 'F'}`;
}

export function DaylightMeasurements({
  day,
  timezone,
}: {
  day?: Pick<DailyForecast, 'sunrise' | 'sunset' | 'daylightSeconds'>;
  timezone: string;
}) {
  return (
    <Measurements
      label="Sun and daylight"
      values={[
        ['Sunrise', formatSunTime(day?.sunrise, timezone)],
        ['Sunset', formatSunTime(day?.sunset, timezone)],
        ['Daylight', formatDaylight(day?.daylightSeconds)],
      ]}
    />
  );
}

export function CurrentMeasurements({
  current,
  day,
  timezone,
  units,
}: {
  current: CurrentWeather;
  day?: DailyForecast;
  timezone: string;
  units: UnitSystem;
}) {
  return (
    <div className="weather-measurements">
      <Measurements
        label="Additional current conditions"
        values={[
          ['Feels like', temperature(current.apparentTemperatureC, units)],
          ['Pressure', formatOptionalNumber(current.pressureHpa, ' hPa')],
          ['Wind direction', formatDirection(current.windDirectionDegrees)],
          ['Wind gusts', wind(current.windGustKph, units)],
          ['Cloud cover', formatOptionalNumber(current.cloudCoverPercent, '%')],
          ['Precipitation', formatPrecipitation(current.precipitationMm, units)],
          ['Rain', formatPrecipitation(current.rainMm, units)],
          ['Snowfall', formatSnowfall(current.snowfallCm, units)],
        ]}
      />
      <p className="measurement-note">
        Wind direction is where the wind comes from. Current precipitation is the model’s current
        reporting interval, not a daily total.
      </p>
      <Measurements
        label="Hourly model estimates"
        values={[
          ['Visibility', formatVisibility(current.hourlyEstimates?.visibilityM, units)],
          ['UV index', formatUv(current.hourlyEstimates?.uvIndex)],
        ]}
      />
      <p className="measurement-note">
        {current.hourlyEstimates
          ? `Visibility and UV are hourly model estimates for ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(current.hourlyEstimates.time))} local time.`
          : 'Visibility and UV estimates are unavailable in this response.'}
      </p>
      <DaylightMeasurements day={day} timezone={timezone} />
      <p className="measurement-note">
        Sun times use {timezone}. “No event” can occur during polar day or night.
      </p>
    </div>
  );
}

export function HourlyMeasurements({ hour, units }: { hour: HourlyForecast; units: UnitSystem }) {
  return (
    <Measurements
      label="Hourly weather measurements"
      values={[
        ['Feels like', temperature(hour.apparentTemperatureC, units)],
        ['Humidity', formatOptionalNumber(hour.humidityPercent, '%')],
        ['Pressure', formatOptionalNumber(hour.pressureHpa, ' hPa')],
        ['Wind', wind(hour.windSpeedKph, units)],
        ['Wind direction', formatDirection(hour.windDirectionDegrees)],
        ['Wind gusts', wind(hour.windGustKph, units)],
        ['Cloud cover', formatOptionalNumber(hour.cloudCoverPercent, '%')],
        ['Precipitation (preceding hour)', formatPrecipitation(hour.precipitationMm, units)],
        ['Rain (preceding hour)', formatPrecipitation(hour.rainMm, units)],
        ['Snowfall (preceding hour)', formatSnowfall(hour.snowfallCm, units)],
        ['Visibility', formatVisibility(hour.visibilityM, units)],
        ['UV index', formatUv(hour.uvIndex)],
      ]}
    />
  );
}

export function DailyMeasurements({
  day,
  units,
  timezone,
}: {
  day: ExtendedDailyForecast;
  units: UnitSystem;
  timezone: string;
}) {
  return (
    <div className="weather-measurements">
      <Measurements
        label="Daily weather measurements"
        values={[
          ['Total precipitation', formatPrecipitation(day.precipitationMm, units)],
          ['Total rain', formatPrecipitation(day.rainMm, units)],
          ['Total snowfall', formatSnowfall(day.snowfallCm, units)],
          ['Maximum UV', formatUv(day.uvIndexMax)],
          ['Maximum wind', wind(day.windSpeedMaxKph, units)],
          ['Maximum gusts', wind(day.windGustMaxKph, units)],
        ]}
      />
      <DaylightMeasurements day={day} timezone={timezone} />
    </div>
  );
}
