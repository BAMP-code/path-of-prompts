"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import type {
  InfrastructureGeoJSON,
  DataCenterNode,
  MineralDepositFeature,
  AquiferFeature,
  Phase,
} from "@/types/trace";
interface AncestryMapProps {
  geojson: InfrastructureGeoJSON | null;
  dataCenter: DataCenterNode | null;
  phase: Phase;
  // Resolved user coordinates. Null means GPS hasn't returned yet — animation waits.
  userLocation: [number, number] | null;
  onAnimationComplete: () => void;
}

type RGBAColor = [number, number, number, number];

interface HoveredPoint {
  type: "aquifer" | "mineral";
  x: number;
  y: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

const MINERAL_INFO: Record<string, { role: string; why: string }> = {
  neodymium:    { role: "Rare-earth magnet", why: "Forms the permanent magnets in GPU cooling fans and hard-drive motors. Every data-center rack requires kilograms of neodymium-based magnets." },
  dysprosium:   { role: "High-temp magnet additive", why: "Added to neodymium magnets to prevent demagnetisation in the heat of a GPU cluster. Without it, fan magnets fail within months." },
  terbium:      { role: "Phosphor & magnet dopant", why: "Improves efficiency and temperature stability of rare-earth magnets used in data-center cooling and drive motors." },
  praseodymium: { role: "Rare-earth magnet", why: "Alloyed with neodymium to increase magnet strength — used in the electric motors that power data-center cooling systems." },
  lanthanum:    { role: "Optical glass & catalysts", why: "Used in the precision optics of lithography machines that manufacture the chips powering this query." },
  cobalt:       { role: "Battery cathode & superalloy", why: "Critical for lithium-ion UPS batteries that keep data centers online during grid failures. Also in superalloys for cooling-system turbines." },
  tantalum:     { role: "Capacitors", why: "Found in thousands of tantalum capacitors on every GPU and server motherboard. The DRC — primary source — has seen decades of conflict over its extraction." },
  gallium:      { role: "Power semiconductors", why: "Used in gallium-nitride (GaN) transistors in server power supplies and GPU voltage regulators. China controls roughly 80 % of global production." },
  germanium:    { role: "Fiber optics & infrared", why: "Core material of the fiber-optic cables that connect data centers and of IR thermal sensors used in cooling management." },
  indium:       { role: "Touchscreens & soldering", why: "Used in indium-tin-oxide displays and as a low-temperature solder in high-density GPU chip packaging." },
  silicon:      { role: "Chip substrate", why: "The foundational material of every processor, GPU, and memory chip powering AI. Requires ultra-pure silicon refined from quartz sand." },
  copper:       { role: "Wiring & heat sinks", why: "The backbone of all data-center wiring and heat-sink infrastructure. A single hyperscale facility can contain millions of kilometres of copper cable." },
  lithium:      { role: "Backup power", why: "Powers the battery banks that sustain AI training through power outages. Long training runs cannot be interrupted — batteries are non-negotiable." },
};

const MINERAL_COLORS: Record<string, RGBAColor> = {
  neodymium:    [255, 145,  77, 230],
  dysprosium:   [255, 145,  77, 230],
  terbium:      [255, 145,  77, 230],
  praseodymium: [255, 145,  77, 230],
  lanthanum:    [255, 145,  77, 230],
  cobalt:       [255,  92, 138, 230],
  tantalum:     [255,  92, 138, 230],
  gallium:      [192, 132, 252, 230],
  germanium:    [192, 132, 252, 230],
  indium:       [192, 132, 252, 230],
  silicon:      [200, 200, 200, 180],
  copper:       [251, 191,  36, 230],
  lithium:      [134, 239, 172, 230],
};

const DEFAULT_USER_LNG_LAT: [number, number] = [-74.006, 40.7128];
const PATH_SOURCE = "ancestry-path";
const PATH_LAYER  = "ancestry-path-layer";
const PATH_GLOW   = "ancestry-path-glow";
const ARC_STEPS   = 120;

/**
 * Quadratic bezier arc in lng/lat space with a perpendicular control-point
 * offset. This produces a visually curved flight-path on a flat Mercator map,
 * unlike a great-circle which appears straight at short distances.
 *
 * curveFactor: how far the control point is offset as a fraction of the
 * straight-line distance between the two endpoints (0.35 = moderate curve).
 */
function bezierArcPoints(
  from: [number, number],
  to: [number, number],
  steps: number,
  curveFactor = 0.38
): [number, number][] {
  const [x0, y0] = from;
  const [x2, y2] = to;

  const mx = (x0 + x2) / 2;
  const my = (y0 + y2) / 2;
  const dx = x2 - x0;
  const dy = y2 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // Perpendicular unit vector (rotated 90° counter-clockwise)
  const px = -dy / len;
  const py =  dx / len;

  // Control point offset — always curve "upward" on screen (north-ish)
  const cx = mx + px * len * curveFactor;
  const cy = my + py * len * curveFactor;

  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * x0 + 2 * u * t * cx + t * t * x2,
      u * u * y0 + 2 * u * t * cy + t * t * y2,
    ]);
  }
  return pts;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 2);
}

export default function AncestryMap({
  geojson,
  dataCenter,
  phase,
  userLocation,
  onAnimationComplete,
}: AncestryMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const overlayRef   = useRef<MapboxOverlay | null>(null);
  const dcMarkerRef  = useRef<mapboxgl.Marker | null>(null);
  const userMarkerRef= useRef<mapboxgl.Marker | null>(null);
  const rafRef       = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [dotOpacity, setDotOpacity] = useState(0);
  const [hoveredInfo, setHoveredInfo] = useState<HoveredPoint | null>(null);

  // Initialize map once — mounted permanently so tiles pre-load on landing screen
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { console.error("NEXT_PUBLIC_MAPBOX_TOKEN not set"); return; }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-20, 25],
      zoom: 1.8,
      antialias: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Add GeoJSON source and line layers for the animated arc
      map.addSource(PATH_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Outer glow (wide, soft)
      map.addLayer({
        id: PATH_GLOW,
        type: "line",
        source: PATH_SOURCE,
        paint: {
          "line-color": "#00c9ff",
          "line-width": 14,
          "line-opacity": 0.25,
          "line-blur": 8,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      // Core line (bright, solid)
      map.addLayer({
        id: PATH_LAYER,
        type: "line",
        source: PATH_SOURCE,
        paint: {
          "line-color": "#ffffff",
          "line-width": 2.5,
          "line-opacity": 1,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      const deckOverlay = new MapboxOverlay({ layers: [] });
      map.addControl(deckOverlay as unknown as mapboxgl.IControl);
      overlayRef.current = deckOverlay;
      setMapReady(true);
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      overlayRef.current?.finalize();
      mapRef.current?.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  const addUserMarker = (map: mapboxgl.Map, coords: [number, number]) => {
    if (userMarkerRef.current) userMarkerRef.current.remove();
    const el = document.createElement("div");
    el.className = "user-dot";
    userMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat(coords)
      .addTo(map);
  };

  // Update user marker on map whenever resolved location arrives/changes
  useEffect(() => {
    if (!userLocation || !mapRef.current) return;
    addUserMarker(mapRef.current, userLocation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, mapReady]);

  const updateDCMarker = useCallback((dc: DataCenterNode) => {
    if (!mapRef.current) return;
    if (dcMarkerRef.current) dcMarkerRef.current.remove();
    const el = document.createElement("div");
    el.className = "dc-pulse-ring";
    dcMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([dc.lon, dc.lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(
          `<div style="color:#fff;font-size:12px;line-height:1.5">
            <strong style="color:#00c9ff">${dc.name}</strong><br/>
            ${dc.hardwareGeneration}<br/>
            <span style="color:#ffffff80">${dc.territory}</span>
          </div>`
        )
      )
      .addTo(mapRef.current);
  }, []);

  // Clear arc when returning to landing
  useEffect(() => {
    if (phase === "landing" && mapRef.current && mapReady) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      clearPathSource();
      if (dcMarkerRef.current) { dcMarkerRef.current.remove(); dcMarkerRef.current = null; }
      overlayRef.current?.setProps({ layers: [] });
      setDotOpacity(0);
      mapRef.current.flyTo({ center: [-20, 25], zoom: 1.8, duration: 1000 });
    }
  }, [phase, mapReady]);

  const clearPathSource = () => {
    const src = mapRef.current?.getSource(PATH_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: [] });
  };

  const setPathPoints = (points: [number, number][]) => {
    if (points.length < 2) return;
    const src = mapRef.current?.getSource(PATH_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    src?.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: points },
      properties: {},
    });
  };

  // Kick off arc animation when all three prerequisites are ready:
  // geojson+dataCenter (from API), mapReady (Mapbox loaded), userLocation (GPS resolved).
  useEffect(() => {
    if (!geojson || !dataCenter || !mapReady || phase !== "animating" || !userLocation) return;

    const map = mapRef.current;
    if (!map) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    clearPathSource();
    setDotOpacity(0);

    const from = userLocation;
    const dcPos: [number, number] = [dataCenter.lon, dataCenter.lat];
    const allPoints = bezierArcPoints(from, dcPos, ARC_STEPS);
    const revPoints = [...allPoints].reverse();

    updateDCMarker(dataCenter);

    // Timings — slow and cinematic
    const FOLLOW_ZOOM  = 6;
    const FORWARD_MS   = 6000;
    const PAUSE_MS     = 700;
    const RETURN_MS    = 4500;
    const DOT_FADE_MS  = 800;
    const CAM_DURATION = 250;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const safeTimeout = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { if (!cancelled) fn(); }, ms);
      timers.push(id);
    };

    // Snap camera to user location quickly, then immediately start drawing
    map.flyTo({ center: from, zoom: FOLLOW_ZOOM, duration: 400, essential: true });
    safeTimeout(() => {
      rafRef.current = requestAnimationFrame(animateForward);
    }, 420);

    // ── Forward: user → DC, camera follows tip ───────────────────────────
    let fwdStart: number | null = null;
    let lastCamFrame = -1;

    function animateForward(ts: number) {
      if (cancelled) return;
      if (!fwdStart) fwdStart = ts;
      const t = Math.min(1, (ts - fwdStart) / FORWARD_MS);
      const count = Math.max(2, Math.round(easeInOut(t) * ARC_STEPS));
      const pts = allPoints.slice(0, count);
      setPathPoints(pts);

      // Camera follows the tip — update every ~4 frames to stay smooth
      const frame = Math.floor(ts / (1000 / 15)); // ~15 cam updates/sec
      if (frame !== lastCamFrame) {
        lastCamFrame = frame;
        const tip = pts[pts.length - 1];
        mapRef.current?.easeTo({ center: tip, zoom: FOLLOW_ZOOM, duration: CAM_DURATION, easing: easeOut });
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animateForward);
      } else {
        rafRef.current = null;
        safeTimeout(startReturn, PAUSE_MS);
      }
    }

    // ── Return: DC → user, camera follows ───────────────────────────────
    function startReturn() {
      clearPathSource();
      let retStart: number | null = null;
      let lastRetCamFrame = -1;

      function animateReturn(ts: number) {
        if (cancelled) return;
        if (!retStart) retStart = ts;
        const t = Math.min(1, (ts - retStart) / RETURN_MS);
        const count = Math.max(2, Math.round(easeInOut(t) * ARC_STEPS));
        const pts = revPoints.slice(0, count);
        setPathPoints(pts);

        const frame = Math.floor(ts / (1000 / 15));
        if (frame !== lastRetCamFrame) {
          lastRetCamFrame = frame;
          const tip = pts[pts.length - 1];
          mapRef.current?.easeTo({ center: tip, zoom: FOLLOW_ZOOM, duration: CAM_DURATION, easing: easeOut });
        }

        if (t < 1) {
          rafRef.current = requestAnimationFrame(animateReturn);
        } else {
          clearPathSource();
          rafRef.current = null;
          startFade();
        }
      }
      rafRef.current = requestAnimationFrame(animateReturn);
    }

    // ── Dot fade-in then reveal ──────────────────────────────────────────
    function startFade() {
      let fadeStart: number | null = null;
      function animateFade(ts: number) {
        if (cancelled) return;
        if (!fadeStart) fadeStart = ts;
        const t = Math.min(1, (ts - fadeStart) / DOT_FADE_MS);
        setDotOpacity(t);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(animateFade);
        } else {
          rafRef.current = null;
          onAnimationComplete();
        }
      }
      rafRef.current = requestAnimationFrame(animateFade);
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, dataCenter, mapReady, phase, userLocation]);

  // Update deck.gl resource dot layers reactively to dotOpacity
  useEffect(() => {
    if (!overlayRef.current || !geojson) return;

    const mineralFeatures = geojson.features.filter(
      (f): f is MineralDepositFeature => "mrdsId" in (f.properties ?? {})
    );
    const aquiferFeatures = geojson.features.filter(
      (f): f is AquiferFeature =>
        "siteId" in (f.properties ?? {}) && !("mrdsId" in (f.properties ?? {}))
    );

    const op = dotOpacity;

    const aquiferLayer = new ScatterplotLayer({
      id: "aquifer-sites",
      data: aquiferFeatures.map((f) => ({
        position: f.geometry.coordinates,
        name: f.properties.siteName,
        aquifer: f.properties.aquiferName ?? "Unknown aquifer",
        wellDepth: f.properties.wellDepth,
      })),
      getPosition: (d: { position: [number, number] }) => d.position,
      getFillColor: [74, 159, 255, Math.round(op * 200)],
      getRadius: 6000,
      radiusMinPixels: 3,
      radiusMaxPixels: 8,
      pickable: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onHover: (info: any) => {
        setHoveredInfo(
          info.object
            ? { type: "aquifer", x: info.x, y: info.y, data: info.object }
            : null
        );
      },
    });

    const mineralLayer = new ScatterplotLayer({
      id: "mineral-deposits",
      data: mineralFeatures.map((f) => ({
        position: f.geometry.coordinates,
        mineral: f.properties.mineral,
        name: f.properties.name,
        country: f.properties.country,
        status: f.properties.status,
      })),
      getPosition: (d: { position: [number, number] }) => d.position,
      getFillColor: (d: { mineral: string }) => {
        const base = MINERAL_COLORS[d.mineral] ?? [255, 255, 255, 180];
        return [base[0], base[1], base[2], Math.round(op * base[3])] as RGBAColor;
      },
      getRadius: 30000,
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
      stroked: true,
      lineWidthMinPixels: 1,
      getLineColor: [255, 255, 255, Math.round(op * 60)],
      updateTriggers: { getFillColor: op, getLineColor: op },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onHover: (info: any) => {
        setHoveredInfo(
          info.object
            ? { type: "mineral", x: info.x, y: info.y, data: info.object }
            : null
        );
      },
    });

    overlayRef.current.setProps({ layers: [aquiferLayer, mineralLayer] });
  }, [geojson, dotOpacity]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Hover tooltip for map points */}
      {hoveredInfo && (
        <MapTooltip info={hoveredInfo} />
      )}

      {/* Legend — only visible in result phase */}
      {phase === "result" && geojson && (
        <div className="absolute bottom-6 left-6 flex flex-col gap-1.5 text-xs">
          <LegendItem color="bg-[#4a9fff]"  label="Water monitoring sites" />
          <LegendItem color="bg-[#ff914d]"  label="Rare earth deposits" />
          <LegendItem color="bg-[#ff5c8a]"  label="Conflict mineral deposits" />
          <LegendItem color="bg-[#c084fc]"  label="Specialty semiconductor minerals" />
          <LegendItem color="bg-[#fbbf24]"  label="Copper deposits" />
          <LegendItem color="bg-[#86efac]"  label="Lithium deposits" />
        </div>
      )}
    </div>
  );
}

function MapTooltip({ info }: { info: HoveredPoint }) {
  const OFFSET = 14;
  const style: React.CSSProperties = {
    position: "absolute",
    left: info.x + OFFSET,
    top: info.y + OFFSET,
    pointerEvents: "none",
    zIndex: 10,
    maxWidth: 280,
  };

  if (info.type === "aquifer") {
    const { name, aquifer, wellDepth } = info.data;
    return (
      <div style={style} className="rounded-xl border border-[#4a9fff]/30 bg-[rgba(8,14,26,0.92)] px-4 py-3 space-y-1.5" >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#4a9fff] shrink-0" />
          <span className="text-white text-xs font-medium leading-snug">{name}</span>
        </div>
        <p className="text-[#4a9fff]/80 text-[11px]">{aquifer}</p>
        {wellDepth && (
          <p className="text-white/40 text-[11px]">Well depth: {wellDepth} m</p>
        )}
        <p className="text-white/55 text-[11px] leading-relaxed pt-0.5 border-t border-white/8">
          Data centers use evaporative cooling towers that draw from local groundwater.
          AI training runs can consume millions of litres from aquifers like this one.
        </p>
      </div>
    );
  }

  // mineral
  const { name, mineral, country, status } = info.data;
  const info2 = MINERAL_INFO[mineral];
  const dotColor = (() => {
    const c = MINERAL_COLORS[mineral];
    if (!c) return "#fff";
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  })();

  return (
    <div style={style} className="rounded-xl border border-white/10 bg-[rgba(8,14,26,0.92)] px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        <span className="text-white text-xs font-medium leading-snug">{name}</span>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span style={{ color: dotColor }} className="font-medium capitalize">{mineral}</span>
        {country && <span className="text-white/35">· {country}</span>}
        {status && (
          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${
            status === "Active"
              ? "border-green-500/30 text-green-400/70"
              : "border-white/15 text-white/30"
          }`}>{status}</span>
        )}
      </div>
      {info2 && (
        <>
          <p className="text-white/40 text-[11px]">{info2.role}</p>
          <p className="text-white/55 text-[11px] leading-relaxed pt-0.5 border-t border-white/8">
            {info2.why}
          </p>
        </>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-black/40 rounded px-2 py-1">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} />
      <span className="text-white/70">{label}</span>
    </div>
  );
}
