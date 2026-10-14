import type {
  Map as MapLibreMap,
  ColorSpecification,
  PropertyValueSpecification,
} from 'maplibre-gl';

type ThemePaintProperty =
  'background-color' | 'fill-color' | 'line-color' | 'text-color' | 'text-halo-color';

/** Recolor only base-vector layers; radar rasters and weather markers keep their data colors. */
export function observeMapAppearance(map: MapLibreMap) {
  const paints: Array<{
    layer: string;
    property: ThemePaintProperty;
    original: PropertyValueSpecification<ColorSpecification> | undefined;
    dark: string;
  }> = [];
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('atmos-')) continue;
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
    const add = (property: ThemePaintProperty, dark: string) => {
      paints.push({
        layer: layer.id,
        property,
        original: map.getPaintProperty(layer.id, property) as
          PropertyValueSpecification<ColorSpecification> | undefined,
        dark,
      });
    };
    if (layer.type === 'background') add('background-color', '#142334');
    if (layer.type === 'fill') {
      if (sourceLayer === 'water') add('fill-color', '#0b192b');
      else if (sourceLayer === 'park' || sourceLayer === 'landcover') add('fill-color', '#1b303b');
      else if (sourceLayer === 'landuse') add('fill-color', '#1b2b3c');
      else if (sourceLayer === 'building') add('fill-color', '#283c51');
      else if (sourceLayer === 'aeroway') add('fill-color', '#334354');
    }
    if (layer.type === 'line') {
      if (sourceLayer === 'waterway') add('line-color', '#0b192b');
      if (sourceLayer === 'transportation') {
        add('line-color', layer.id.includes('casing') ? '#142334' : '#53697f');
      }
      if (sourceLayer === 'boundary') add('line-color', '#71839a');
      if (sourceLayer === 'park') add('line-color', '#29414a');
    }
    if (layer.type === 'symbol' && layer.layout?.['text-field'] && !layer.layout['icon-image']) {
      add('text-color', '#c6d5e7');
      add('text-halo-color', '#142334');
    }
  }
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const update = () => {
    const theme = document.documentElement.dataset.theme;
    const dark = theme === 'dark' || (theme !== 'light' && systemTheme.matches);
    for (const paint of paints) {
      if (map.getLayer(paint.layer)) {
        map.setPaintProperty(paint.layer, paint.property, dark ? paint.dark : paint.original);
      }
    }
  };
  update();
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  systemTheme.addEventListener('change', update);
  return () => {
    observer.disconnect();
    systemTheme.removeEventListener('change', update);
  };
}
