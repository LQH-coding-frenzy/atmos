'use client';

import type {
  Dashboard,
  LocationSearchResult,
  SavedLocation,
  ThemePreference,
  UnitSystem,
} from '@atmos/contracts';
import { AirQualityPanel } from './air-quality-panel';
import { InAppAlertsPanel } from './in-app-alerts-panel';
import { PreferencesPanel } from './preferences-panel';
import { SavedLocationsPanel } from './saved-locations-panel';
import { SevereWeatherPanel } from './severe-weather-panel';
import { WeatherCalendarPanel } from './weather-calendar-panel';
import { WeatherComparisonPanel } from './weather-comparison-panel';
import { WeatherHistoryPanel } from './weather-history-panel';
import { WeatherTools } from './weather-tools';

type DashboardToolsProps = {
  dashboard: Dashboard;
  gatewayOrigin: string;
  initialLocationExplicit: boolean;
  units: UnitSystem;
  theme: ThemePreference;
  timezonePreference: string;
  onSelectLocation: (location: LocationSearchResult) => Promise<boolean>;
  onLocationsChange: (locations: SavedLocation[]) => void;
  onUnitsChange: (units: UnitSystem) => void;
  onThemeChange: (theme: ThemePreference) => void;
  onTimezoneChange: (timezone: string) => void;
};

export function DashboardTools({
  dashboard,
  gatewayOrigin,
  initialLocationExplicit,
  units,
  theme,
  timezonePreference,
  onSelectLocation,
  onLocationsChange,
  onUnitsChange,
  onThemeChange,
  onTimezoneChange,
}: DashboardToolsProps) {
  return (
    <WeatherTools>
      <h3 className="tool-group-heading">Places</h3>
      <SavedLocationsPanel
        gatewayOrigin={gatewayOrigin}
        currentLocation={dashboard.location}
        initialLocationExplicit={initialLocationExplicit}
        onSelect={onSelectLocation}
        onLocationsChange={onLocationsChange}
      />
      <h3 className="tool-group-heading">Weather details</h3>
      <WeatherCalendarPanel gatewayOrigin={gatewayOrigin} dashboard={dashboard} units={units} />
      <AirQualityPanel location={dashboard.location} />
      <SevereWeatherPanel location={dashboard.location} />
      <WeatherComparisonPanel
        current={dashboard}
        gatewayOrigin={gatewayOrigin}
        units={units}
        onUseAsCurrent={onSelectLocation}
      />
      <WeatherHistoryPanel
        gatewayOrigin={gatewayOrigin}
        location={dashboard.location}
        current={dashboard.current}
        provider={dashboard.meta.provider}
        stale={dashboard.meta.stale}
        units={units}
      />
      <h3 className="tool-group-heading">Personal</h3>
      <InAppAlertsPanel
        gatewayOrigin={gatewayOrigin}
        location={dashboard.location}
        current={dashboard.current}
        hourly={dashboard.hourly}
        stale={dashboard.meta.stale}
      />
      <PreferencesPanel
        gatewayOrigin={gatewayOrigin}
        units={units}
        theme={theme}
        timezonePreference={timezonePreference}
        onUnitsChange={onUnitsChange}
        onThemeChange={onThemeChange}
        onTimezoneChange={onTimezoneChange}
      />
    </WeatherTools>
  );
}
