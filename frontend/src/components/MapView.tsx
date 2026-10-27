import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Checkpoint, HeatmapFeatureCollection, RouteAnalysis } from '../types';
import { formatDuration, formatTime } from '../utils/formatters';
import { getRiskStyle } from '../utils/palette';
import { calculateTruckPosition } from '../utils/truckPosition';
import { Award, ShieldAlert } from 'lucide-react';
import { MapRadarHUD } from './MapRadarHUD';

// Configure MapLibre Web Worker URL explicitly for Vite ESM bundler
if (typeof window !== 'undefined' && (maplibregl as any).setWorkerUrl) {
  (maplibregl as any).setWorkerUrl(maplibreglWorkerUrl);
}

interface MapViewProps {
  routes: RouteAnalysis[];
  selectedRouteId: string | null;
  recommendedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  heatmapData?: HeatmapFeatureCollection | null;
  forecastHour: number;
  departureTime?: string;
  isAnalyzing?: boolean;
  activeOrigin?: string;
  activeDestination?: string;
  loadLb?: number;
  theme?: 'dark' | 'light';
}

// Reliable dual dark/light basemap tile style requiring NO API KEY and having NO WATERMARKS
const DUAL_THEME_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'esri-dark-base': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    },
    'esri-dark-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
    'esri-light-base': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    },
    'esri-light-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'esri-dark-base',
      type: 'raster',
      source: 'esri-dark-base',
      minzoom: 0,
      maxzoom: 16,
    },
    {
      id: 'esri-dark-labels',
      type: 'raster',
      source: 'esri-dark-labels',
      minzoom: 0,
      maxzoom: 16,
    },
    {
      id: 'esri-light-base',
      type: 'raster',
      source: 'esri-light-base',
      minzoom: 0,
      maxzoom: 16,
      layout: { visibility: 'none' },
    },
    {
      id: 'esri-light-labels',
      type: 'raster',
      source: 'esri-light-labels',
      minzoom: 0,
      maxzoom: 16,
      layout: { visibility: 'none' },
    },
  ],
};

const DEFAULT_STYLE = import.meta.env.VITE_MAP_STYLE_URL || DUAL_THEME_STYLE;

// Stable source/layer IDs — single merged source for all routes
const ROUTES_SOURCE_ID    = 'all-routes-source';
const ROUTES_CASING_LAYER = 'all-routes-casing';
const ROUTES_LINE_LAYER   = 'all-routes-line';
const ROUTES_HIT_LAYER    = 'all-routes-hit';
const HEATMAP_SOURCE_ID   = 'corridor-heatmap-source';
const HEATMAP_LAYER_ID    = 'corridor-heatmap-layer';

/** Build a single merged GeoJSON FeatureCollection for all routes.
 *  Features are sorted so that unselected routes are rendered first,
 *  and the active selected route is rendered last (topmost).
 *  Properties drive GPU paint expressions — no per-frame JS needed. */
function buildRoutesGeoJSON(
  routes: RouteAnalysis[],
  selectedRouteId: string | null,
  recommendedRouteId: string | null,
  isAnalyzing: boolean
): GeoJSON.FeatureCollection {
  const activeSelectedId = selectedRouteId || recommendedRouteId || (routes.length > 0 ? routes[0].id : null);

  // Sort routes so that unselected routes are drawn first, and the active selected route is drawn on top
  const sortedRoutes = [...routes].sort((a, b) => {
    const aIsSelected = a.id === activeSelectedId ? 1 : 0;
    const bIsSelected = b.id === activeSelectedId ? 1 : 0;
    if (aIsSelected !== bIsSelected) {
      return aIsSelected - bIsSelected; // 0 first (unselected), 1 last (selected)
    }
    const aIsRec = a.id === recommendedRouteId ? 1 : 0;
    const bIsRec = b.id === recommendedRouteId ? 1 : 0;
    return aIsRec - bIsRec; // recommended above standard unselected
  });

  return {
    type: 'FeatureCollection',
    features: sortedRoutes.map((r) => {
      const isSelected = r.id === activeSelectedId;
      const isRecommended = r.id === recommendedRouteId;
      const sortKey = isSelected ? 10 : isRecommended ? 5 : 1;

      return {
        type: 'Feature' as const,
        geometry: r.geometry,
        properties: {
          id: r.id,
          selected: isSelected ? 1 : 0,
          recommended: isRecommended ? 1 : 0,
          analyzing: isAnalyzing ? 1 : 0,
          sort_key: sortKey,
        },
      };
    }),
  };
}

/** Derive current_risk per heatmap feature from risk_by_hour[forecastHour].
 *  Returns a new FeatureCollection for setData(). */
function buildHeatmapGeoJSON(
  heatmapData: HeatmapFeatureCollection,
  forecastHour: number
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: heatmapData.features.map((feat) => {
      const arr: number[] = feat.properties.risk_by_hour || [];
      return {
        ...feat,
        properties: {
          ...feat.properties,
          current_risk: forecastHour < arr.length ? arr[forecastHour] : -1,
        },
      };
    }),
  } as unknown as GeoJSON.FeatureCollection;
}

// GPU paint expressions — evaluated by WebGL, not JS per frame ---------------

const CASING_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'case', ['==', ['get', 'selected'], 1], 11, 7,
];
const CASING_OPACITY_EXPR: maplibregl.ExpressionSpecification = [
  'case',
  ['==', ['get', 'analyzing'], 1], 0.15,
  ['==', ['get', 'selected'], 1], 0.90,
  0.45,
];
const LINE_COLOR_EXPR: maplibregl.ExpressionSpecification = [
  'case',
  ['all', ['==', ['get', 'selected'], 1], ['==', ['get', 'recommended'], 1]], '#10b981',
  ['==', ['get', 'selected'], 1],    '#38bdf8',
  ['==', ['get', 'recommended'], 1], 'rgba(16,185,129,0.7)',
  '#64748b',
];
const LINE_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'case',
  ['==', ['get', 'selected'], 1],    7.5,
  ['==', ['get', 'recommended'], 1], 5.0,
  4.0,
];
const LINE_OPACITY_EXPR: maplibregl.ExpressionSpecification = [
  'case',
  ['==', ['get', 'analyzing'], 1],   0.20,
  ['==', ['get', 'selected'], 1],    1.0,
  ['==', ['get', 'recommended'], 1], 0.85,
  0.75,
];
// Heatmap color: GPU match expression — -1=Baseline/Low, 0=Low, 1=Moderate, 2=High, 3=Severe, 4=NoTravel
const HEATMAP_COLOR_EXPR: maplibregl.ExpressionSpecification = [
  'match', ['get', 'current_risk'],
  -1, 'rgba(16,185,129,0.35)',
  0,  'rgba(16,185,129,0.45)',
  1,  'rgba(59,130,246,0.55)',
  2,  'rgba(245,158,11,0.65)',
  3,  'rgba(236,72,153,0.80)',
  4,  'rgba(239,68,68,0.85)',
  'rgba(16,185,129,0.35)',
];

// ----------------------------------------------------------------------------

const MapViewInner: React.FC<MapViewProps> = ({
  routes,
  selectedRouteId,
  recommendedRouteId,
  onSelectRoute,
  heatmapData,
  forecastHour,
  departureTime,
  isAnalyzing = false,
  activeOrigin,
  activeDestination,
  loadLb,
  theme = 'dark',
}) => {
  const mapContainer   = useRef<HTMLDivElement>(null);
  const mapInstance    = useRef<MapLibreMap | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const markersRef     = useRef<Marker[]>([]);
  const routeBadgesRef = useRef<Marker[]>([]);
  const truckMarkerRef = useRef<Marker | null>(null);
  const truckElRef     = useRef<{
    container: HTMLDivElement;
    pulse: HTMLDivElement;
    core: HTMLDivElement;
  } | null>(null);
  const prevRouteKeyRef = useRef<string>('');

  // 1. Initialize map --------------------------------------------------------
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: DEFAULT_STYLE,
      center: [-96.0, 39.5],
      zoom: 4.2,
      attributionControl: false,
      renderWorldCopies: false, // halves draw calls
      trackResize: false,       // managed by ResizeObserver below
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
    map.on('load', () => setIsMapLoaded(true));
    mapInstance.current = map;

    // ResizeObserver — avoids stale resize loops from trackResize
    const ro = new ResizeObserver(() => { map.resize(); });
    if (mapContainer.current) ro.observe(mapContainer.current);

    return () => {
      ro.disconnect();
      if (truckMarkerRef.current) {
        truckMarkerRef.current.remove();
        truckMarkerRef.current = null;
        truckElRef.current = null;
      }
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // 2. Basemap theme toggle (dark/light) ------------------------------------
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isMapLoaded) return;
    const isDark = theme === 'dark';
    ['esri-dark-base', 'esri-dark-labels', 'carto-dark-base'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', isDark ? 'visible' : 'none');
    });
    ['esri-light-base', 'esri-light-labels', 'carto-light-base'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', !isDark ? 'visible' : 'none');
    });
  }, [theme, isMapLoaded]);

  // 3. Routes — single merged source, setData() for updates -----------------
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isMapLoaded) return;

    const routeKey = routes.map((r) => r.id).join(',');
    const geoJSON  = buildRoutesGeoJSON(routes, selectedRouteId, recommendedRouteId, isAnalyzing);

    const existingSrc = map.getSource(ROUTES_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (existingSrc) {
      existingSrc.setData(geoJSON);
      if (map.getLayer(ROUTES_LINE_LAYER)) {
        try {
          map.setLayoutProperty(ROUTES_LINE_LAYER, 'line-sort-key', ['get', 'sort_key']);
          map.setLayoutProperty(ROUTES_CASING_LAYER, 'line-sort-key', ['get', 'sort_key']);
          map.setLayoutProperty(ROUTES_HIT_LAYER, 'line-sort-key', ['get', 'sort_key']);
        } catch {
          // ignore if already set
        }
      }
    } else {
      if (!routes.length) return;
      map.addSource(ROUTES_SOURCE_ID, { type: 'geojson', data: geoJSON });

      map.addLayer({
        id: ROUTES_CASING_LAYER,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'line-sort-key': ['get', 'sort_key'],
        },
        paint: { 'line-color': '#020617', 'line-width': CASING_WIDTH_EXPR, 'line-opacity': CASING_OPACITY_EXPR },
      });

      map.addLayer({
        id: ROUTES_LINE_LAYER,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'line-sort-key': ['get', 'sort_key'],
        },
        paint: { 'line-color': LINE_COLOR_EXPR, 'line-width': LINE_WIDTH_EXPR, 'line-opacity': LINE_OPACITY_EXPR },
      });

      map.addLayer({
        id: ROUTES_HIT_LAYER,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'line-sort-key': ['get', 'sort_key'],
        },
        paint: { 'line-color': '#ffffff', 'line-width': 26, 'line-opacity': 0.0001 },
      });

      const handleClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onSelectRoute(String(id));
      };
      map.on('click', ROUTES_HIT_LAYER, handleClick);
      map.on('click', ROUTES_LINE_LAYER, handleClick);
      map.on('mouseenter', ROUTES_HIT_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', ROUTES_HIT_LAYER, () => { map.getCanvas().style.cursor = ''; });
    }

    // Duration badge markers
    routeBadgesRef.current.forEach((b) => b.remove());
    routeBadgesRef.current = [];
    if (!isAnalyzing && routes.length > 0) {
      const activeSelectedId = selectedRouteId || recommendedRouteId || routes[0].id;
      const fastest  = Math.min(...routes.map((r) => r.duration_min));
      const fractions = [0.46, 0.36, 0.58];
      routes.forEach((r, idx) => {
        const coords = r.geometry.coordinates;
        if (coords.length <= 5) return;
        const fi = Math.min(coords.length - 1, Math.max(0, Math.floor(coords.length * fractions[idx % 3])));
        const anchor      = coords[fi];
        const deltaMin    = Math.round(r.duration_min - fastest);
        const isSel       = r.id === activeSelectedId;
        const isRec       = r.id === recommendedRouteId;
        const statusText  = isSel
          ? (isRec ? '★ Recommended' : `${r.id} (Active)`)
          : (deltaMin > 0 ? `+${deltaMin} min` : 'Fastest');

        const el = document.createElement('div');
        el.className = `gmaps-route-badge ${isSel ? 'active' : 'inactive'} ${isRec ? 'recommended' : ''}`;
        el.title = `Click to choose ${r.id}`;
        el.innerHTML = `
          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:0.85rem">⏱️</span>
            <span style="font-weight:800;font-size:0.84rem">${formatDuration(r.duration_min)}</span>
          </div>
          <span style="font-size:0.72rem;opacity:0.85;border-left:1px solid rgba(255,255,255,0.25);padding-left:6px;font-weight:600">${statusText}</span>
        `;
        el.addEventListener('click', (e) => { e.stopPropagation(); onSelectRoute(r.id); });
        routeBadgesRef.current.push(
          new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([anchor[0], anchor[1]]).addTo(map)
        );
      });
    }

    // Fit bounds only when the route set changes
    if (routeKey !== prevRouteKeyRef.current && routes.length > 0) {
      prevRouteKeyRef.current = routeKey;
      const bounds = new maplibregl.LngLatBounds();
      routes.forEach((r) => r.geometry.coordinates.forEach((c: number[]) => bounds.extend([c[0], c[1]])));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: { top: 90, bottom: 160, left: 70, right: 70 },
          maxZoom: 12,
          duration: 600,
        });
      }
    }
  }, [routes, selectedRouteId, recommendedRouteId, isMapLoaded, isAnalyzing, onSelectRoute]);

  // 4. Checkpoint markers — circle DOM elements (pure GPU geometry) ----------
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isMapLoaded) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (isAnalyzing || !routes.length) return;

    const activeSelectedId = selectedRouteId || recommendedRouteId || routes[0].id;

    // Sort routes so unselected routes have their checkpoint markers placed first,
    // and the selected route has its checkpoint markers placed last (on top in DOM)
    const sortedForMarkers = [...routes].sort((a, b) => {
      const aSel = a.id === activeSelectedId ? 1 : 0;
      const bSel = b.id === activeSelectedId ? 1 : 0;
      return aSel - bSel;
    });

    sortedForMarkers.forEach((r) => {
      const isSel = r.id === activeSelectedId;
      if (!r.checkpoints) return;
      r.checkpoints.forEach((cp: Checkpoint) => {
        const style = getRiskStyle(cp.level);
        const el    = document.createElement('div');
        // Predefined class names avoid inline style recalc; GPU handles color via attribute
        el.className = `checkpoint-marker${isSel ? ' active' : ''} risk-dot-${cp.level.toLowerCase().replace('_', '-')}`;
        el.style.cssText = isSel
          ? `width:14px;height:14px;border:2px solid #fff;box-shadow:0 0 10px ${style.color};opacity:1;border-radius:50%;background:${style.color};cursor:pointer`
          : `width:9px;height:9px;border:1px solid rgba(255,255,255,0.7);box-shadow:0 0 4px ${style.color};opacity:0.75;border-radius:50%;background:${style.color};cursor:pointer`;

        let driverText = '';
        if      (cp.driver === 'load_rule') driverText = '⚠️ Load rule elevated risk due to wind speed and truck weight';
        else if (cp.driver === 'wind')      driverText = `💨 Driven by sustained winds of ${cp.wind_mph ?? 0} mph`;
        else if (cp.driver === 'rain')      driverText = `🌧️ Driven by rain intensity of ${cp.rain_in_hr ?? 0} in/hr`;
        else if (cp.driver === 'snow')      driverText = `❄️ Driven by snowfall intensity of ${cp.snow_in_hr ?? 0} in/hr`;

        const popup = new maplibregl.Popup({ offset: 14, closeButton: true }).setHTML(`
          <div style="min-width:210px;padding:2px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div>
                <span style="font-weight:800;color:#60a5fa;font-size:0.8rem;margin-right:6px">${r.id}</span>
                <strong style="font-size:0.95rem;color:#f8fafc">Mile ${cp.mile}</strong>
              </div>
              <span style="font-size:0.72rem;font-weight:700;padding:2px 6px;border-radius:4px;background:${style.bg};color:${style.color};border:1px solid ${style.border}">${style.label}</span>
            </div>
            <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:8px">
              Estimated Arrival: <strong style="color:#f1f5f9">${formatTime(cp.eta)}</strong>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:0.78rem;background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;margin-bottom:6px">
              <div>Wind: <strong>${cp.wind_mph !== null ? `${cp.wind_mph} mph` : 'N/A'}</strong></div>
              <div>Rain: <strong>${cp.rain_in_hr !== null ? `${cp.rain_in_hr} in/hr` : 'N/A'}</strong></div>
              <div>Snow: <strong>${cp.snow_in_hr !== null ? `${cp.snow_in_hr} in/hr` : 'N/A'}</strong></div>
            </div>
            ${driverText ? `<div style="font-size:0.73rem;color:#fbbf24;line-height:1.3">${driverText}</div>` : ''}
          </div>
        `);

        el.addEventListener('click', () => { if (!isSel) onSelectRoute(r.id); });
        const marker = new maplibregl.Marker({ element: el }).setLngLat([cp.lon, cp.lat]).setPopup(popup).addTo(map);
        marker.getElement().style.zIndex = isSel ? '25' : '10';
        markersRef.current.push(marker);
      });
    });
  }, [routes, selectedRouteId, recommendedRouteId, isMapLoaded, isAnalyzing, onSelectRoute]);

  // 5. Heatmap — create once, update via setData(); GPU expression handles color
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isMapLoaded) return;

    if (!heatmapData?.features?.length) {
      if (map.getLayer(HEATMAP_LAYER_ID))  map.removeLayer(HEATMAP_LAYER_ID);
      if (map.getSource(HEATMAP_SOURCE_ID)) map.removeSource(HEATMAP_SOURCE_ID);
      return;
    }

    const geoJSON   = buildHeatmapGeoJSON(heatmapData, forecastHour);
    const existingSrc = map.getSource(HEATMAP_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

    if (existingSrc) {
      existingSrc.setData(geoJSON);
    } else {
      map.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: geoJSON });
      map.addLayer(
        {
          id: HEATMAP_LAYER_ID,
          type: 'circle',
          source: HEATMAP_SOURCE_ID,
          minzoom: 3,   // skip heatmap compute at global zoom levels
          maxzoom: 14,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 20, 11, 40],
            'circle-color':   HEATMAP_COLOR_EXPR,
            'circle-blur':    0.6,
            'circle-opacity': 0.75,
          },
        },
        map.getLayer(ROUTES_CASING_LAYER) ? ROUTES_CASING_LAYER : undefined
      );
    }
  }, [heatmapData, forecastHour, isMapLoaded]);

  // 6. Dynamic Truck Position Marker (Trip Rehearsal) ------------------------
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isMapLoaded) return;

    if (isAnalyzing || !routes.length) {
      if (truckMarkerRef.current) {
        truckMarkerRef.current.remove();
        truckMarkerRef.current = null;
        truckElRef.current = null;
      }
      return;
    }

    const activeSelectedId = selectedRouteId || recommendedRouteId || routes[0].id;
    const activeRoute = routes.find((r) => r.id === activeSelectedId) || routes[0];
    const pos = calculateTruckPosition(activeRoute, departureTime, forecastHour);

    if (!pos) {
      if (truckMarkerRef.current) {
        truckMarkerRef.current.remove();
        truckMarkerRef.current = null;
        truckElRef.current = null;
      }
      return;
    }

    const style = getRiskStyle(pos.currentRisk);

    // Create marker DOM structure once, then reuse for zero-allocation scrubbing
    if (!truckMarkerRef.current || !truckElRef.current) {
      const container = document.createElement('div');
      container.className = 'truck-position-marker';

      const pulse = document.createElement('div');
      pulse.className = 'truck-pulse-ring';

      const core = document.createElement('div');
      core.className = 'truck-beacon-core';
      core.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
          <circle cx="17" cy="18" r="2"/>
          <circle cx="7" cy="18" r="2"/>
        </svg>
      `;

      container.appendChild(pulse);
      container.appendChild(core);

      const marker = new maplibregl.Marker({ element: container, anchor: 'center' })
        .setLngLat([pos.lon, pos.lat])
        .addTo(map);

      truckMarkerRef.current = marker;
      truckElRef.current = { container, pulse, core };
    }

    // Direct GPU compositor transform update
    truckMarkerRef.current.setLngLat([pos.lon, pos.lat]);

    const { container, pulse, core } = truckElRef.current;
    pulse.style.background = style.color;
    core.style.boxShadow = `0 0 16px ${style.color}, 0 4px 14px rgba(0,0,0,0.6)`;
    container.title = `Truck: ${activeRoute.id} · ${pos.statusLabel} · ${pos.timestamp}`;
  }, [routes, selectedRouteId, recommendedRouteId, departureTime, forecastHour, isMapLoaded, isAnalyzing]);

  // Render ------------------------------------------------------------------
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isAnalyzing && (
        <div className="map-radar-overlay">
          <MapRadarHUD origin={activeOrigin} destination={activeDestination} loadLb={loadLb} />
        </div>
      )}

      <div ref={mapContainer} className={`map-canvas-container ${isAnalyzing ? 'map-blurred' : ''}`} />

      {!isAnalyzing && routes.length > 0 && (
        <div style={{ position: 'absolute', top: '16px', left: '60px', zIndex: 50, display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: 'calc(100% - 180px)' }}>
          {routes.map((r) => {
            const isSel     = r.id === selectedRouteId;
            const isRec     = r.id === recommendedRouteId;
            const maxRisk   = getRiskStyle(r.summary.max_level);
            const noTravel  = r.summary.no_travel_miles > 0;
            return (
              <div
                key={r.id}
                onClick={() => onSelectRoute(r.id)}
                className="glass-panel"
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  border: isSel
                    ? '1px solid var(--color-obsidian)'
                    : isRec
                    ? '1px solid var(--color-terminal-green)'
                    : '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  boxShadow: isSel
                    ? '0 0 0 1px var(--color-obsidian), var(--shadow-subtle)'
                    : 'var(--shadow-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {r.id}
                    </strong>
                    {isRec && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--color-terminal-green)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontWeight: 500,
                          letterSpacing: '0.04em',
                        }}
                      >
                        <Award size={11} /> REC
                      </span>
                    )}
                    {noTravel && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: '#d32f2f',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontWeight: 500,
                          letterSpacing: '0.04em',
                        }}
                      >
                        <ShieldAlert size={11} /> NO TRAVEL
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>{r.distance_mi} mi</span>
                    <span>•</span>
                    <span>{formatDuration(r.duration_min)}</span>
                  </div>
                </div>
                <span className={`risk-badge risk-badge-${r.summary.max_level.toLowerCase().replace('_', '-')}`}>
                  {maxRisk.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * React.memo with custom comparator — MapView only re-renders when meaningful
 * props change. Prevents re-renders from unrelated parent state updates.
 */
export const MapView = React.memo(MapViewInner, (prev, next) => {
  const sameRoutes =
    prev.routes.length === next.routes.length &&
    prev.routes.every((r, i) => r.id === next.routes[i]?.id);
  return (
    sameRoutes &&
    prev.selectedRouteId    === next.selectedRouteId    &&
    prev.recommendedRouteId === next.recommendedRouteId &&
    prev.forecastHour       === next.forecastHour       &&
    prev.departureTime      === next.departureTime      &&
    prev.heatmapData        === next.heatmapData        &&
    prev.isAnalyzing        === next.isAnalyzing        &&
    prev.theme              === next.theme              &&
    prev.loadLb             === next.loadLb             &&
    prev.onSelectRoute      === next.onSelectRoute
  );
});
