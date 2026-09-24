'use client';

import { locationSearchResultSchema, type LocationSearchResult } from '@atmos/contracts';
import { Search } from 'lucide-react';
import { useState } from 'react';

type LocationSearchProps = {
  gatewayOrigin: string;
  onSelect: (location: LocationSearchResult) => void;
};

export function LocationSearch({ gatewayOrigin, onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'failed'>('idle');

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;
    setStatus('searching');
    try {
      const url = new URL('/api/v1/locations/search', gatewayOrigin);
      url.searchParams.set('q', value);
      const response = await fetch(url);
      const parsed = locationSearchResultSchema.array().safeParse((await response.json()).results);
      if (!response.ok || !parsed.success) throw new Error('Location search failed');
      setResults(parsed.data);
      setStatus('idle');
    } catch {
      setResults([]);
      setStatus('failed');
    }
  }

  function select(location: LocationSearchResult) {
    onSelect(location);
    setQuery(location.name);
    setResults([]);
    setStatus('idle');
  }

  return (
    <div className="location-search">
      <form onSubmit={search} role="search">
        <label className="sr-only" htmlFor="location-query">
          Search for a city
        </label>
        <input
          id="location-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a city"
          minLength={2}
          maxLength={80}
        />
        <button type="submit" aria-label="Search locations" disabled={status === 'searching'}>
          <Search size={17} aria-hidden="true" />
        </button>
      </form>
      {status === 'failed' ? (
        <p role="status">Location search is temporarily unavailable.</p>
      ) : null}
      {results.length > 0 ? (
        <ul aria-label="Location search results">
          {results.map((location) => (
            <li key={location.id}>
              <button type="button" onClick={() => select(location)}>
                <strong>{location.name}</strong>
                <span>{location.country}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
