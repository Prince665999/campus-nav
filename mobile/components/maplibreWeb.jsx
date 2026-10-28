// maplibreWeb.jsx — WEB ONLY.
//
// Your phone app draws its maps with @maplibre/maplibre-react-native, which
// does not exist in a browser. This file gives the web app the SAME building
// blocks (MapView, Camera, ShapeSource, FillLayer, LineLayer, CircleLayer,
// SymbolLayer, Images, MarkerView) built on MapLibre GL JS ("maplibre-gl"),
// the browser version of the same map engine.
//
// Because the names and props match, MapView.web.jsx, IndoorMapView.web.jsx
// and OutdoorBaseMap.web.jsx are your phone files with only the import line
// changed. Same layers, same colours, same zoom rules, same expressions.
//
// How it works, in short:
//   * <MapView> creates one maplibre-gl Map inside a <div>.
//   * Sources and layers register themselves (what SHOULD be on the map).
//     A small "sync" step then makes the real map match, in one batch. This
//     avoids the "layer added before its source" problem and keeps layer
//     order identical to the order you wrote them in JSX.
//   * Style props (fillColor, lineWidth, textField ...) are converted from the
//     phone's camelCase names to the map spec's paint/layout names.
//
// This file is imported only by the *.web.jsx files, so the phone build never
// loads it.

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Asset } from 'expo-asset';
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Text, View } from 'react-native';

// ---------------------------------------------------------------------------
// Style conversion: phone names -> map spec names
// ---------------------------------------------------------------------------

// Every property that belongs in a layer's "layout". Anything else is "paint".
const LAYOUT_KEYS = new Set([
  'visibility',
  'lineCap', 'lineJoin', 'lineMiterLimit', 'lineRoundLimit', 'lineSortKey',
  'fillSortKey', 'circleSortKey',
  'symbolPlacement', 'symbolSpacing', 'symbolAvoidEdges', 'symbolSortKey', 'symbolZOrder',
  'iconAllowOverlap', 'iconIgnorePlacement', 'iconOptional', 'iconRotationAlignment',
  'iconSize', 'iconTextFit', 'iconTextFitPadding', 'iconImage', 'iconRotate',
  'iconPadding', 'iconKeepUpright', 'iconOffset', 'iconAnchor', 'iconPitchAlignment',
  'textPitchAlignment', 'textRotationAlignment', 'textField', 'textFont', 'textSize',
  'textMaxWidth', 'textLineHeight', 'textLetterSpacing', 'textJustify',
  'textRadialOffset', 'textVariableAnchor', 'textAnchor', 'textMaxAngle',
  'textWritingMode', 'textRotate', 'textPadding', 'textKeepUpright', 'textTransform',
  'textOffset', 'textAllowOverlap', 'textIgnorePlacement', 'textOptional',
]);

const toKebab = (key) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** { fillColor, lineCap, ... } -> { layout: {...}, paint: {...} } (kebab-case). */
export function splitStyle(style) {
  const layout = {};
  const paint = {};
  for (const [key, value] of Object.entries(style || {})) {
    if (value === undefined || value === null) continue;
    (LAYOUT_KEYS.has(key) ? layout : paint)[toKebab(key)] = value;
  }
  return { layout, paint };
}

// The phone passes the blank style as a JSON string; the web wants an object.
// A normal style URL (the online "liberty" map) is passed through unchanged.
function parseStyle(mapStyle) {
  if (typeof mapStyle === 'string') {
    const text = mapStyle.trim();
    return text.startsWith('{') ? JSON.parse(text) : text;
  }
  return mapStyle;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Small GeoJSON (a dot, a line, a circle) is compared by value so that a
// freshly built but identical object does not redraw the map. Big collections
// (all your roads) are compared by identity only, which is instant.
function sameData(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const small = (d) => d.type !== 'FeatureCollection' || (d.features?.length ?? 0) <= 25;
  if (!small(a) || !small(b)) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

const MapCtx = createContext(null);
const SourceCtx = createContext(null);

function useMapCtx() {
  const ctx = useContext(MapCtx);
  if (!ctx) throw new Error('Map layers, sources and markers must be inside <MapView>.');
  return ctx;
}

// ---------------------------------------------------------------------------
// MapView
// ---------------------------------------------------------------------------

export function MapView({
  style,
  mapStyle,
  children,
  compassEnabled = false,
  rotateEnabled = true,
  onDidFinishLoadingMap,
  onRegionDidChange,
  // Accepted so the phone code can pass them unchanged. On the web the logo
  // and the attribution button are never shown (your own credit line is).
  // eslint-disable-next-line no-unused-vars
  logoEnabled,
  // eslint-disable-next-line no-unused-vars
  attributionEnabled,
}) {
  const containerRef = useRef(null);
  const orderRef = useRef(null); // hidden div: its child order = JSX layer order
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const [failed, setFailed] = useState(false);

  const desired = useRef({ sources: new Map(), layers: new Map() });
  const applied = useRef({ sources: new Map(), layers: new Map() });
  const styleReady = useRef(false);
  const syncQueued = useRef(false);
  const cameraDefaults = useRef({});
  const pendingCamera = useRef(null);
  const currentStyle = useRef(mapStyle);

  const callbacks = useRef({});
  callbacks.current = { onDidFinishLoadingMap, onRegionDidChange };

  // Stable functions, created once. They only touch refs.
  const api = useMemo(() => {
    // Make the real map match what the components asked for.
    function sync() {
      const m = mapRef.current;
      if (!m || !styleReady.current) return;
      const want = desired.current;
      const have = applied.current;

      // 1. Remove layers that are gone, or whose source is gone.
      for (const id of [...have.layers.keys()]) {
        const spec = want.layers.get(id);
        if (!spec || !want.sources.has(spec.source)) {
          if (m.getLayer(id)) m.removeLayer(id);
          have.layers.delete(id);
        }
      }
      // 2. Remove sources that are gone (their layers are already removed).
      for (const id of [...have.sources.keys()]) {
        if (!want.sources.has(id)) {
          if (m.getSource(id)) m.removeSource(id);
          have.sources.delete(id);
        }
      }
      // 3. Add new sources, update the data of changed ones.
      for (const [id, data] of want.sources) {
        if (!have.sources.has(id)) {
          m.addSource(id, { type: 'geojson', data });
          have.sources.set(id, data);
        } else if (!sameData(have.sources.get(id), data)) {
          m.getSource(id).setData(data);
          have.sources.set(id, data);
        }
      }
      // 4. Layers, in JSX order. Walking from the top one down, each new
      //    layer is inserted just under the one above it, so the stacking
      //    matches the order you wrote them in.
      const domOrder = orderRef.current
        ? Array.from(orderRef.current.querySelectorAll('[data-ml-layer]')).map((n) =>
            n.getAttribute('data-ml-layer')
          )
        : [];
      const rank = new Map(domOrder.map((id, i) => [id, i]));
      const ordered = [...want.layers.entries()]
        .filter(([, spec]) => want.sources.has(spec.source))
        .sort((a, b) => (rank.get(a[0]) ?? 1e9) - (rank.get(b[0]) ?? 1e9));

      let beforeId;
      for (let i = ordered.length - 1; i >= 0; i--) {
        const [id, spec] = ordered[i];
        let cur = have.layers.get(id);

        // A layer whose type or source changed is rebuilt.
        if (cur && (cur.type !== spec.type || cur.source !== spec.source)) {
          if (m.getLayer(id)) m.removeLayer(id);
          have.layers.delete(id);
          cur = undefined;
        }

        if (!cur) {
          const layer = {
            id,
            type: spec.type,
            source: spec.source,
            layout: spec.layout,
            paint: spec.paint,
          };
          if (spec.filter) layer.filter = spec.filter;
          if (spec.minzoom != null) layer.minzoom = spec.minzoom;
          if (spec.maxzoom != null) layer.maxzoom = spec.maxzoom;
          m.addLayer(layer, beforeId && m.getLayer(beforeId) ? beforeId : undefined);
        } else {
          if (!same(cur.filter, spec.filter)) m.setFilter(id, spec.filter ?? null);
          if (cur.minzoom !== spec.minzoom || cur.maxzoom !== spec.maxzoom) {
            m.setLayerZoomRange(id, spec.minzoom ?? 0, spec.maxzoom ?? 24);
          }
          for (const key of new Set([...Object.keys(cur.paint), ...Object.keys(spec.paint)])) {
            if (!same(cur.paint[key], spec.paint[key])) {
              m.setPaintProperty(id, key, spec.paint[key] ?? null);
            }
          }
          for (const key of new Set([...Object.keys(cur.layout), ...Object.keys(spec.layout)])) {
            if (!same(cur.layout[key], spec.layout[key])) {
              m.setLayoutProperty(id, key, spec.layout[key] ?? null);
            }
          }
        }
        have.layers.set(id, spec);
        beforeId = id;
      }
    }

    // Many components register in the same moment; do one sync for all.
    function requestSync() {
      if (syncQueued.current) return;
      syncQueued.current = true;
      queueMicrotask(() => {
        syncQueued.current = false;
        try {
          sync();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[map] sync failed:', e && e.message);
        }
      });
    }

    function applyCamera(cam) {
      const m = mapRef.current;
      if (!m) {
        // The map is not created yet: remember, and apply it as soon as it is.
        pendingCamera.current = { ...(pendingCamera.current || {}), ...cam, animationDuration: 0 };
        return;
      }
      const opts = {};
      if (cam.centerCoordinate) opts.center = cam.centerCoordinate;
      if (cam.zoomLevel != null) opts.zoom = cam.zoomLevel;
      if (cam.heading != null) opts.bearing = cam.heading;
      const duration = cam.animationDuration || 0;
      if (duration > 0) m.easeTo({ ...opts, duration });
      else m.jumpTo(opts);
    }

    return {
      requestSync,
      sync,
      applyCamera,
      setSource(id, data) {
        desired.current.sources.set(id, data);
        requestSync();
      },
      removeSource(id) {
        desired.current.sources.delete(id);
        requestSync();
      },
      setLayer(id, spec) {
        desired.current.layers.set(id, spec);
        requestSync();
      },
      removeLayer(id) {
        desired.current.layers.delete(id);
        requestSync();
      },
    };
  }, []);

  // Create the map once.
  useEffect(() => {
    const cam = cameraDefaults.current || {};
    let m;
    try {
      m = new maplibregl.Map({
        container: containerRef.current,
        style: parseStyle(currentStyle.current),
        center: cam.centerCoordinate || [0, 0],
        zoom: cam.zoomLevel ?? 1,
        bearing: cam.heading ?? 0,
        pitch: 0,
        maxPitch: 0, // the campus map is flat, like on the phone
        attributionControl: false,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[map] could not start the map (WebGL missing?):', e && e.message);
      setFailed(true);
      return undefined;
    }
    mapRef.current = m;

    if (pendingCamera.current) {
      api.applyCamera(pendingCamera.current);
      pendingCamera.current = null;
    }

    let loadReported = false;
    const reportLoaded = () => {
      if (loadReported) return;
      loadReported = true;
      callbacks.current.onDidFinishLoadingMap?.();
    };
    let fallbackTimer = null;

    m.on('style.load', () => {
      // A new style starts empty: forget what was on the old one and re-add.
      applied.current.sources.clear();
      applied.current.layers.clear();
      styleReady.current = true;
      setStyleVersion((v) => v + 1);
      api.sync();
      // Safety net: if 'load' is slow to fire, report ready after a moment.
      if (!fallbackTimer) fallbackTimer = setTimeout(reportLoaded, 4000);
    });
    m.on('load', reportLoaded);
    m.on('moveend', (e) => {
      callbacks.current.onRegionDidChange?.({
        properties: {
          zoomLevel: m.getZoom(),
          heading: m.getBearing(),
          isUserInteraction: !!e.originalEvent,
        },
      });
    });
    m.on('error', (e) => {
      // eslint-disable-next-line no-console
      console.warn('[map]', (e && e.error && e.error.message) || e);
    });

    // Keep the canvas the right size when the layout changes.
    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => m.resize());
      observer.observe(containerRef.current);
    }

    setMap(m);

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (observer) observer.disconnect();
      styleReady.current = false;
      applied.current.sources.clear();
      applied.current.layers.clear();
      mapRef.current = null;
      m.remove();
      setMap(null);
    };
  }, [api]);

  // The style changed (for example, your own map failed and we switch to the
  // online map picture).
  useEffect(() => {
    if (!map || currentStyle.current === mapStyle) return;
    currentStyle.current = mapStyle;
    styleReady.current = false;
    map.setStyle(parseStyle(mapStyle), { diff: false });
  }, [map, mapStyle]);

  // Rotation by hand (two fingers / right-drag). The indoor map turns it off.
  useEffect(() => {
    if (!map) return;
    if (rotateEnabled) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }
  }, [map, rotateEnabled]);

  // The compass button (walking screen).
  useEffect(() => {
    if (!map || !compassEnabled) return undefined;
    const control = new maplibregl.NavigationControl({
      showZoom: false,
      showCompass: true,
      visualizePitch: false,
    });
    map.addControl(control, 'top-right');
    return () => {
      try {
        map.removeControl(control);
      } catch {
        // The map is already gone.
      }
    };
  }, [map, compassEnabled]);

  const ctx = useMemo(() => ({ map, styleVersion, api, cameraDefaults }), [map, styleVersion, api]);

  if (failed) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', padding: 16 }]}>
        <Text style={{ color: '#4a574f', textAlign: 'center' }}>
          This browser could not start the map. Try Chrome, Edge, Firefox or Safari, and make sure
          hardware acceleration is on.
        </Text>
      </View>
    );
  }

  return (
    <MapCtx.Provider value={ctx}>
      <View style={style}>
        <div
          ref={containerRef}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        {/* Never shown. Its only job is to keep the layers in JSX order. */}
        <div ref={orderRef} style={{ display: 'none' }}>
          {children}
        </div>
      </View>
    </MapCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

// ref.setCamera({ centerCoordinate, zoomLevel, heading, animationDuration })
export const Camera = forwardRef(function Camera({ defaultSettings }, ref) {
  const { api, cameraDefaults } = useMapCtx();

  // Layout effects of children run before the parent's effects, so the map
  // (created in MapView's effect) sees these settings.
  useLayoutEffect(() => {
    cameraDefaults.current = defaultSettings || {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    setCamera: (cam) => api.applyCamera(cam || {}),
  }), [api]);

  return null;
});

// ---------------------------------------------------------------------------
// Sources and layers
// ---------------------------------------------------------------------------

export function ShapeSource({ id, shape, children }) {
  const { api } = useMapCtx();

  useEffect(() => {
    if (!shape) return undefined;
    api.setSource(id, shape);
    return () => api.removeSource(id);
  }, [api, id, shape]);

  return <SourceCtx.Provider value={shape ? id : null}>{children}</SourceCtx.Provider>;
}

function makeLayer(type, displayName) {
  function Layer({ id, style, filter, minZoomLevel, maxZoomLevel }) {
    const { api } = useMapCtx();
    const sourceId = useContext(SourceCtx);

    // Rebuild only when something really changed (props are new objects on
    // every render, so compare by value).
    const signature = JSON.stringify([
      sourceId,
      filter ?? null,
      minZoomLevel ?? null,
      maxZoomLevel ?? null,
      style ?? null,
    ]);

    useEffect(() => {
      if (!sourceId) return undefined;
      const { layout, paint } = splitStyle(style);
      api.setLayer(id, {
        type,
        source: sourceId,
        filter: filter ?? null,
        minzoom: minZoomLevel,
        maxzoom: maxZoomLevel,
        layout,
        paint,
      });
      return () => api.removeLayer(id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, id, signature]);

    return <span data-ml-layer={id} />;
  }
  Layer.displayName = displayName;
  return Layer;
}

export const FillLayer = makeLayer('fill', 'FillLayer');
export const LineLayer = makeLayer('line', 'LineLayer');
export const CircleLayer = makeLayer('circle', 'CircleLayer');
export const SymbolLayer = makeLayer('symbol', 'SymbolLayer');

// ---------------------------------------------------------------------------
// Images (the map symbols: parking, library, ...)
// ---------------------------------------------------------------------------

function imageUri(src) {
  if (!src) return null;
  if (typeof src === 'string') return src;
  if (typeof src === 'object' && src.uri) return src.uri;
  try {
    return Asset.fromModule(src).uri; // a require('./x.png') on the web
  } catch {
    return null;
  }
}

function loadHtmlImage(uri) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load map image: ${uri}`));
    img.src = uri;
  });
}

const TRANSPARENT = { width: 1, height: 1, data: new Uint8Array(4) };

export function Images({ images }) {
  const { map, styleVersion } = useMapCtx();
  // Reload only when the set of pictures really changes, not on every render.
  const imagesKey = JSON.stringify(images ?? null);

  useEffect(() => {
    // styleVersion is 0 until the map's style has loaded; wait for that.
    if (!map || !images || styleVersion === 0) return undefined;
    let cancelled = false;
    const names = Object.keys(images);

    // A symbol layer may ask for an icon a moment before it has downloaded.
    // Give it an empty placeholder so the map stays quiet, then swap it.
    const onMissing = (e) => {
      if (names.includes(e.id) && !map.hasImage(e.id)) map.addImage(e.id, TRANSPARENT);
    };
    map.on('styleimagemissing', onMissing);

    names.forEach(async (name) => {
      const uri = imageUri(images[name]);
      if (!uri) return;
      try {
        const img = await loadHtmlImage(uri);
        if (cancelled) return;
        if (map.hasImage(name)) map.updateImage(name, img);
        else map.addImage(name, img);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[map]', e && e.message);
      }
    });

    return () => {
      cancelled = true;
      map.off('styleimagemissing', onMissing);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleVersion, imagesKey]);

  return null;
}

// ---------------------------------------------------------------------------
// MarkerView (the green start dot and the red destination dot)
// ---------------------------------------------------------------------------

// {x, y} anchor (0, 0.5 or 1) -> the name maplibre-gl uses.
function anchorName(anchor) {
  const x = anchor?.x ?? 0.5;
  const y = anchor?.y ?? 0.5;
  const col = x < 0.25 ? 'left' : x > 0.75 ? 'right' : '';
  const row = y < 0.25 ? 'top' : y > 0.75 ? 'bottom' : '';
  if (row && col) return `${row}-${col}`;
  return row || col || 'center';
}

export function MarkerView({ coordinate, anchor, children }) {
  const { map } = useMapCtx();
  const [element] = useState(() => document.createElement('div'));
  const markerRef = useRef(null);
  const [lon, lat] = coordinate;
  const anchorKey = anchorName(anchor);

  useEffect(() => {
    if (!map) return undefined;
    const marker = new maplibregl.Marker({ element, anchor: anchorKey })
      .setLngLat([lon, lat])
      .addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, element, anchorKey]);

  useEffect(() => {
    if (markerRef.current) markerRef.current.setLngLat([lon, lat]);
  }, [lon, lat]);

  return createPortal(children, element);
}
