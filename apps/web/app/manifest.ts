import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Atmos Weather Intelligence',
    short_name: 'Atmos',
    description: 'A personal weather dashboard with forecast-aware city exploration.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d191e',
    theme_color: '#183236',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    categories: ['weather', 'utilities'],
  };
}
