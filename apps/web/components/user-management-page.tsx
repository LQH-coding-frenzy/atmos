'use client';

import type { LocationSearchResult } from '@atmos/contracts';
import { LayoutDashboard, Map, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { defaultLocation } from '../lib/default-location';
import { LegalLinks } from './legal-links';
import { SavedLocationsPanel } from './saved-locations-panel';

type UserManagementPageProps = {
  gatewayOrigin: string;
};

export function UserManagementPage({ gatewayOrigin }: UserManagementPageProps) {
  const router = useRouter();

  async function openSavedLocation(location: LocationSearchResult) {
    const search = new URLSearchParams({
      lat: String(location.latitude),
      lon: String(location.longitude),
      timezone: location.timezone,
      name: location.name,
      country: location.country,
    });
    router.push(`/?${search.toString()}`);
    return true;
  }

  return (
    <main className="atmos-page user-management-page">
      <section className="dashboard-shell user-management-shell" id="user">
        <header className="user-management-header">
          <a className="user-management-home" href="/" aria-label="Return to dashboard">
            <span className="brand" aria-hidden="true">
              a<span>o</span>
            </span>
          </a>
          <div className="user-management-title">
            <p className="eyebrow">Profile and security</p>
            <h1 id="user-management-title">User management</h1>
            <p>Manage your account, saved places, and personal weather data.</p>
          </div>
          <span className="user-management-avatar" aria-hidden="true">
            <UserRound size={22} />
          </span>
        </header>

        <nav className="user-management-navigation" aria-label="Main navigation">
          <a href="/">
            <LayoutDashboard size={17} aria-hidden="true" />
            <span>Dashboard</span>
          </a>
          <a href="/#map">
            <Map size={17} aria-hidden="true" />
            <span>Full map view</span>
          </a>
          <a href="/user" aria-current="page">
            <UserRound size={17} aria-hidden="true" />
            <span>User management</span>
          </a>
        </nav>

        <div className="user-management-layout">
          <SavedLocationsPanel
            gatewayOrigin={gatewayOrigin}
            currentLocation={defaultLocation}
            initialLocationExplicit
            onSelect={openSavedLocation}
            presentation="page"
          />
          <aside className="panel user-management-guide">
            <p className="eyebrow">Your account</p>
            <h2>Manage your weather workspace</h2>
            <ul>
              <li>Sign in with email or Google.</li>
              <li>Review, rename, reorder, and remove saved places.</li>
              <li>
                Sync place favorites, categories, ordering, and your default place to your account.
              </li>
              <li>Request permanent account and saved-data deletion.</li>
            </ul>
            <a href="/">Return to the dashboard</a>
          </aside>
        </div>

        <footer>
          <span>Live weather data: Open-Meteo.</span>
          <span>Maps: OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors.</span>
          <LegalLinks />
        </footer>
      </section>
    </main>
  );
}
