import type { Metadata } from 'next';
import { LegalPageLayout } from '../../components/legal-page-layout';

export const metadata: Metadata = {
  title: 'Privacy Policy | Atmos',
  description: 'How Atmos uses and protects account, weather, and location data.',
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy">
      <p>
        Atmos is a weather intelligence dashboard operated by the Atmos project owner. This policy
        explains the information processed when you use the site and how you can manage it.
      </p>

      <h2>Google sign-in</h2>
      <p>
        Google sign-in uses the basic OpenID Connect identity scopes <code>openid</code>,{' '}
        <code>email</code>, and <code>profile</code> through Supabase Auth. The app uses the
        returned identity information to authenticate you and associate your Atmos account with your
        saved data. Atmos does not request access to Gmail, Drive, Calendar, contacts, or other
        Google services, and does not sell Google user data or use it for advertising.
      </p>
      <p>
        Supabase Auth processes the sign-in and maintains your session. Atmos does not receive or
        store your Google password. Use of Google sign-in is also subject to{' '}
        <a href="https://policies.google.com/privacy" rel="noreferrer" target="_blank">
          Google&apos;s Privacy Policy
        </a>
        .
      </p>

      <h2>Information associated with your Atmos account</h2>
      <ul>
        <li>
          <strong>Account information:</strong> your email address, Supabase user identifier, and
          basic identity details returned by your selected sign-in provider.
        </li>
        <li>
          <strong>Saved places:</strong> place names and latitude/longitude coordinates that you
          choose to save.
        </li>
        <li>
          <strong>Preferences:</strong> account preferences such as units, time zone, and theme,
          where those settings are saved to your account.
        </li>
        <li>
          <strong>Weather history and alerts:</strong> if you use these features, the app stores
          selected location coordinates, observation time, weather payloads, and alert conditions or
          schedules with your account.
        </li>
      </ul>
      <p>
        Supabase database policies restrict account records to their owner. Account records are
        retained while the account is active and are deleted when you complete account deletion.
      </p>

      <h2>Weather and location requests</h2>
      <p>
        Public weather features work without an account. When you search for or select a place, its
        coordinates and time zone are sent through the Atmos gateway to Open-Meteo for weather,
        air-quality, or geocoding results. A selected place can appear in the page URL so that the
        view can be restored or shared. Device geolocation is requested only after you activate the
        browser control and grant permission; that device location is not automatically added to the
        URL or saved as a place.
      </p>
      <p>
        The map loads base-map tiles from OpenFreeMap and OpenMapTiles/OpenStreetMap. RainViewer
        radar tiles are requested from RainViewer. Optional OpenWeather current-map tiles are
        proxied through the Atmos gateway; the OpenWeather API key stays on the server and is not
        sent to your browser. These providers may receive technical request data such as your IP
        address and the requested tile or location needed to serve their services.
      </p>

      <h2>Browser storage and technical information</h2>
      <p>
        Supabase Auth uses browser storage to maintain your sign-in session. Atmos also stores your
        theme and units, saved-place ordering/default on this device, and a recent weather snapshot
        for offline display. Device geolocation is excluded from the offline snapshot. You can clear
        browser storage in your browser settings; account deletion also clears the app&apos;s
        account-specific place preferences and offline snapshot on the current device.
      </p>
      <p>
        Atmos hosting and gateway providers process technical information needed to operate and
        secure the service. Where enabled, diagnostic traces contain sanitized route, method,
        status, and timing information. Atmos&apos;s custom gateway analytics use bounded
        route/provider labels and timing values rather than account identifiers or raw weather
        coordinates. Vercel, Cloudflare, Supabase, and other service providers may separately
        process request metadata under their own policies.
      </p>

      <h2>Data sharing and choices</h2>
      <p>
        Atmos shares information with providers only as needed to provide the feature you use:
        Supabase for authentication and account data; Google for Google sign-in; Cloudflare and
        Vercel for gateway and site hosting; Open-Meteo for weather, air-quality, and location
        services; and OpenFreeMap, OpenMapTiles, OpenStreetMap, RainViewer, and OpenWeather for map
        content. Atmos does not sell personal information or use it for advertising.
      </p>
      <p>
        You can review and remove saved places, weather history, and alerts in the app. In User
        Management, you can request permanent account deletion after confirming your email and
        signing in again if your session is not recent enough. Deletion removes the Supabase Auth
        account and related user-owned records. For privacy questions or requests, contact the Atmos
        project owner at <a href="mailto:jach96443@gmail.com">jach96443@gmail.com</a>.
      </p>
    </LegalPageLayout>
  );
}
