import { weatherRouteHandlers } from '../../../../../lib/weather-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = weatherRouteHandlers.airQuality;
