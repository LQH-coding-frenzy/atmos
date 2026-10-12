'use client';

import { RefreshCw } from 'lucide-react';

export function RetryWeatherButton() {
  return (
    <button className="retry-weather-button" type="button" onClick={() => window.location.reload()}>
      <RefreshCw size={16} aria-hidden="true" />
      Retry weather
    </button>
  );
}
