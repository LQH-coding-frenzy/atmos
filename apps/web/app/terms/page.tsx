import type { Metadata } from 'next';
import { LegalPageLayout } from '../../components/legal-page-layout';

export const metadata: Metadata = {
  title: 'Terms of Service | Atmos',
  description: 'Terms for using the Atmos weather intelligence dashboard.',
};

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service">
      <p>
        These terms apply to your use of Atmos, a weather intelligence dashboard operated by the
        Atmos project owner. By using the site, you agree to these terms and to the{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>The service</h2>
      <p>
        Atmos provides weather forecasts, map layers, saved places, weather history, and optional
        alert settings. Features may change, be unavailable, or be withdrawn as the project and its
        third-party providers change.
      </p>

      <h2>Weather information is not safety advice</h2>
      <p>
        Weather observations, forecasts, radar imagery, and map labels come from third-party
        providers and may be delayed, incomplete, or inaccurate. Atmos does not guarantee their
        accuracy or availability. Do not rely on Atmos for emergency response, evacuation, medical,
        transportation, aviation, or other safety-critical decisions. Follow local authorities and
        official warnings.
      </p>

      <h2>Accounts and your data</h2>
      <p>
        You are responsible for keeping access to your sign-in method secure and for activity under
        your account. Do not attempt to disrupt the service, bypass access controls, or use the site
        unlawfully. You can manage saved places and request account deletion from User Management.
        Account deletion requires email confirmation and a recent sign-in and removes the
        account&apos;s associated saved data.
      </p>

      <h2>Third-party services and attribution</h2>
      <p>
        Atmos relies on Google and Supabase for authentication, Cloudflare and Vercel for delivery,
        Open-Meteo for weather and location data, OpenFreeMap/OpenMapTiles/OpenStreetMap for base
        maps, and RainViewer and OpenWeather for optional weather-map layers. Those providers have
        their own terms, availability limits, and attribution requirements. The free RainViewer API
        is described as for personal and educational use and provides past radar frames only; free
        OpenWeather map layers are current snapshots. Atmos does not provide paid provider products
        through these features.
      </p>

      <h2>Changes and contact</h2>
      <p>
        The Atmos project owner may update these terms as the service changes. The current version
        will remain available at this URL. For questions about these terms, contact the Atmos
        project owner at <a href="mailto:jach96443@gmail.com">jach96443@gmail.com</a>.
      </p>
    </LegalPageLayout>
  );
}
