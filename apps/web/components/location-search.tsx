'use client';

import { locationSearchResultSchema, type LocationSearchResult } from '@atmos/contracts';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { versionAffinityHeaders } from '../lib/version-affinity';
import {
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches,
} from '../lib/saved-place-preferences';

type LocationSearchProps = {
  gatewayOrigin: string;
  onSelect: (location: LocationSearchResult) => Promise<boolean>;
};

type SearchStatus = 'idle' | 'searching' | 'empty' | 'invalid' | 'limited' | 'failed';

const autocompleteDebounceMs = 350;
const autocompleteCacheMs = 30_000;
const maximumAutomaticSearchesPerMinute = 8;

export function LocationSearch({ gatewayOrigin, onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectingId, setSelectingId] = useState<string>();
  const [selectionMessage, setSelectionMessage] = useState('');
  const [recentLocations, setRecentLocations] = useState<LocationSearchResult[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [coordinatesOpen, setCoordinatesOpen] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [coordinateError, setCoordinateError] = useState('');
  const requestGeneration = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const debounceTimer = useRef<number | undefined>(undefined);
  const automaticSearchTimes = useRef<number[]>([]);
  const searchCache = useRef(
    new Map<string, { results: LocationSearchResult[]; expiresAt: number }>(),
  );

  useEffect(() => {
    try {
      setRecentLocations(readRecentSearches(window.localStorage));
    } catch {
      setRecentLocations([]);
    }
  }, []);

  async function fetchLocations(value: string, signal: AbortSignal, automatic: boolean) {
    const cacheKey = value.trim().toLocaleLowerCase('en-US');
    const now = Date.now();
    for (const [key, entry] of searchCache.current) {
      if (entry.expiresAt <= now) searchCache.current.delete(key);
    }
    const cached = searchCache.current.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.results;

    if (automatic) {
      automaticSearchTimes.current = automaticSearchTimes.current.filter(
        (time) => now - time < 60_000,
      );
      if (automaticSearchTimes.current.length >= maximumAutomaticSearchesPerMinute) {
        throw new Error('AUTOCOMPLETE_LIMIT');
      }
      automaticSearchTimes.current.push(now);
    }

    const url = new URL('/api/v1/locations/search', gatewayOrigin);
    url.searchParams.set('q', value);
    const response = await fetch(url, { headers: versionAffinityHeaders(), signal });
    const body = (await response.json().catch(() => undefined)) as
      { results?: unknown } | undefined;
    const parsed = locationSearchResultSchema.array().safeParse(body?.results);
    if (!response.ok || !parsed.success) throw new Error('Location search failed');
    if (searchCache.current.size >= 32) {
      const firstKey = searchCache.current.keys().next().value;
      if (firstKey) searchCache.current.delete(firstKey);
    }
    searchCache.current.set(cacheKey, {
      results: parsed.data,
      expiresAt: now + autocompleteCacheMs,
    });
    return parsed.data;
  }

  useEffect(() => {
    const value = query.trim();
    if (!autocompleteEnabled || value.length < 3 || selectingId !== undefined) return;
    if (debounceTimer.current !== undefined) window.clearTimeout(debounceTimer.current);
    searchController.current?.abort();
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    searchController.current = controller;
    setActiveIndex(-1);
    setStatus('searching');
    debounceTimer.current = window.setTimeout(() => {
      void fetchLocations(value, controller.signal, true)
        .then((nextResults) => {
          if (generation !== requestGeneration.current) return;
          setResults(nextResults);
          setStatus(nextResults.length ? 'idle' : 'empty');
        })
        .catch((error: unknown) => {
          if (generation !== requestGeneration.current) return;
          setResults([]);
          setStatus(
            error instanceof Error && error.message === 'AUTOCOMPLETE_LIMIT' ? 'limited' : 'failed',
          );
        })
        .finally(() => {
          if (generation === requestGeneration.current) searchController.current = null;
        });
    }, autocompleteDebounceMs);

    return () => {
      if (debounceTimer.current !== undefined) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = undefined;
      }
      controller.abort();
    };
  }, [autocompleteEnabled, gatewayOrigin, query, selectingId]);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) {
      setStatus('invalid');
      setResults([]);
      return;
    }
    if (debounceTimer.current !== undefined) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = undefined;
    }
    searchController.current?.abort();
    setAutocompleteEnabled(false);
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    searchController.current = controller;
    setResults([]);
    setSelectionMessage('');
    setSelectingId(undefined);
    setActiveIndex(-1);
    setStatus('searching');
    try {
      const nextResults = await fetchLocations(value, controller.signal, false);
      if (generation !== requestGeneration.current) return;
      setResults(nextResults);
      setStatus(nextResults.length === 0 ? 'empty' : 'idle');
    } catch {
      if (generation !== requestGeneration.current) return;
      setResults([]);
      setStatus('failed');
    } finally {
      if (generation === requestGeneration.current) searchController.current = null;
    }
  }

  async function select(location: LocationSearchResult) {
    if (debounceTimer.current !== undefined) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = undefined;
    }
    searchController.current?.abort();
    setAutocompleteEnabled(false);
    const generation = ++requestGeneration.current;
    setSelectingId(location.id);
    setSelectionMessage(`Loading weather for ${location.name}…`);
    let loaded: boolean;
    try {
      loaded = await onSelect(location);
    } catch {
      loaded = false;
    }
    if (generation !== requestGeneration.current) return;
    setSelectingId(undefined);
    if (loaded) {
      try {
        setRecentLocations(addRecentSearch(window.localStorage, location));
      } catch {
        /* Keep successful weather selection usable when browser storage is blocked. */
      }
      setQuery(location.name);
      setResults([]);
      setStatus('idle');
      setActiveIndex(-1);
      setSelectionMessage('');
      return;
    }
    setSelectionMessage(`Weather for ${location.name} could not be loaded. Try again.`);
  }

  async function searchCoordinates(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lat = Number(latitude),
      lon = Number(longitude);
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      setCoordinateError('Enter a latitude from −90 to 90 and longitude from −180 to 180.');
      return;
    }
    setCoordinateError('');
    setRecentOpen(false);
    await select({
      id: `coordinates:${lat.toFixed(5)}:${lon.toFixed(5)}`,
      name: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
      country: 'Coordinates',
      latitude: lat,
      longitude: lon,
      timezone: 'auto',
    });
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      void select(results[activeIndex]);
    } else if (event.key === 'Escape' && (results.length > 0 || recentOpen)) {
      event.preventDefault();
      requestGeneration.current += 1;
      searchController.current?.abort();
      setResults([]);
      setRecentOpen(false);
      setActiveIndex(-1);
      setAutocompleteEnabled(false);
      setStatus('idle');
    }
  }

  return (
    <div className="location-search">
      <form onSubmit={search} role="search">
        <label className="sr-only" htmlFor="location-query">
          Search for a city
        </label>
        <input
          id="location-query"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={
            results.length > 0 || (recentOpen && !query.trim() && recentLocations.length > 0)
          }
          aria-controls="location-search-results location-search-recents"
          aria-activedescendant={
            activeIndex >= 0 ? `location-search-option-${activeIndex}` : undefined
          }
          value={query}
          onKeyDown={handleSearchKeyDown}
          onChange={(event) => {
            requestGeneration.current += 1;
            searchController.current?.abort();
            if (debounceTimer.current !== undefined) {
              window.clearTimeout(debounceTimer.current);
              debounceTimer.current = undefined;
            }
            setQuery(event.target.value);
            setResults([]);
            setStatus('idle');
            setSelectingId(undefined);
            setActiveIndex(-1);
            setAutocompleteEnabled(true);
            setSelectionMessage('');
            setRecentOpen(!event.target.value.trim());
          }}
          onFocus={() => {
            if (!query.trim()) setRecentOpen(true);
          }}
          placeholder="Search a city"
          minLength={2}
          maxLength={80}
          autoComplete="off"
        />
        <button type="submit" aria-label="Search locations" disabled={selectingId !== undefined}>
          <Search size={17} aria-hidden="true" />
        </button>
      </form>
      {status === 'searching' ? <p role="status">Searching locations…</p> : null}
      {status === 'invalid' ? (
        <p role="status">Enter at least two characters to search for a place.</p>
      ) : null}
      {status === 'empty' ? <p role="status">No matching places. Try another city name.</p> : null}
      {status === 'limited' ? (
        <p role="status">Suggestion limit reached. Press Search to submit this query.</p>
      ) : null}
      {status === 'failed' ? (
        <p role="status">Location search is temporarily unavailable. Try again in a moment.</p>
      ) : null}
      {selectionMessage ? (
        <p role="status" aria-live="polite">
          {selectionMessage}
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul id="location-search-results" role="listbox" aria-label="Location search results">
          {results.map((location, index) => (
            <li key={location.id} role="presentation">
              <button
                id={`location-search-option-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void select(location)}
                disabled={selectingId !== undefined}
                aria-busy={selectingId === location.id}
              >
                <strong>{location.name}</strong>
                <span>{location.country}</span>
                {selectingId === location.id ? <span>Loading weather…</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!results.length && recentOpen && !query.trim() && recentLocations.length > 0 ? (
        <section className="location-search-recents" aria-label="Recent places">
          <div className="recent-search-heading">
            <span>Recent places</span>
            <button
              type="button"
              onClick={() => {
                try {
                  clearRecentSearches(window.localStorage);
                } catch {
                  /* Storage is optional. */
                }
                setRecentLocations([]);
                setRecentOpen(false);
              }}
            >
              Clear
            </button>
          </div>
          <ul id="location-search-recents" aria-label="Recent places">
            {recentLocations.map((location) => (
              <li key={`${location.latitude}:${location.longitude}`}>
                <button
                  type="button"
                  onClick={() => void select(location)}
                  disabled={selectingId !== undefined}
                >
                  <strong>{location.name}</strong>
                  <span>{location.country}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <details
        className="coordinate-search"
        open={coordinatesOpen}
        onToggle={(event) => setCoordinatesOpen(event.currentTarget.open)}
      >
        <summary>Enter coordinates</summary>
        <form onSubmit={searchCoordinates} aria-label="Search coordinates">
          <label htmlFor="coordinate-latitude">Latitude</label>
          <input
            id="coordinate-latitude"
            type="number"
            inputMode="decimal"
            min="-90"
            max="90"
            step="any"
            required
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
          />
          <label htmlFor="coordinate-longitude">Longitude</label>
          <input
            id="coordinate-longitude"
            type="number"
            inputMode="decimal"
            min="-180"
            max="180"
            step="any"
            required
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
          />
          <button type="submit" disabled={selectingId !== undefined}>
            {selectingId !== undefined ? 'Loading weather…' : 'Show weather'}
          </button>
        </form>
        {coordinateError ? <p role="alert">{coordinateError}</p> : null}
      </details>
    </div>
  );
}
