import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { LayerGroup, LayersControl, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { LocateFixed, Search } from 'lucide-react';
import { toast } from 'sonner';
import { KIGALI_CENTER } from '@sw/shared';
import marker2x from 'leaflet/dist/images/marker-icon-2x.png';
import marker1x from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite does not resolve Leaflet's default icon URLs on its own
L.Icon.Default.mergeOptions({ iconRetinaUrl: marker2x, iconUrl: marker1x, shadowUrl: markerShadow });

export function MapView({ children, center, zoom = 14, className = 'h-[420px]', label = 'Map' }: {
  children?: ReactNode; center?: [number, number]; zoom?: number; className?: string; label?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-lg border border-border ${className}`} role="region" aria-label={label}>
      <MapContainer center={center ?? [KIGALI_CENTER.lat, KIGALI_CENTER.lng]} zoom={zoom} className="h-full w-full" scrollWheelZoom>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Map">
            <TileLayer
              attribution='Map &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <LayerGroup>
              <TileLayer
                attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
            </LayerGroup>
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        {children}
      </MapContainer>
    </div>
  );
}

/** Fit the map to a set of points once they are known. */
export function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, 16);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

type Place = { label: string; detail: string; lat: number; lng: number };

/**
 * Place search (Photon, OpenStreetMap data, biased to Kigali) and "my location", overlaid on a map.
 * Picking a result moves the map there and calls onPick, so a form can drop its marker on it.
 */
export function PlaceSearch({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const map = useMap();
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const picked = useRef(false); // filling the box with a chosen place must not search again

  // Typing and clicking in the box must not pan the map or drop a pin
  useEffect(() => {
    if (!box.current) return;
    L.DomEvent.disableClickPropagation(box.current);
    L.DomEvent.disableScrollPropagation(box.current);
  }, []);

  useEffect(() => {
    const term = text.trim();
    if (picked.current) { picked.current = false; return; }
    if (term.length < 3) { setResults([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const u = new URL('https://photon.komoot.io/api/');
        u.search = new URLSearchParams({ q: term, limit: '6', lang: 'en', lat: String(KIGALI_CENTER.lat), lon: String(KIGALI_CENTER.lng), bbox: '28.85,-2.85,30.9,-1.04' }).toString();
        const res = await fetch(u, { signal: ctl.signal });
        const json = await res.json();
        setResults((json.features ?? []).map((f: any) => {
          const p = f.properties ?? {};
          const street = [p.housenumber, p.street].filter(Boolean).join(' ');
          return {
            label: p.name || street || p.district || p.city || 'Unnamed place',
            detail: [p.name ? street : '', p.district || p.locality, p.city || p.county].filter(Boolean).join(', '),
            lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
          };
        }));
        setOpen(true);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([]);
      } finally {
        setBusy(false);
      }
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [text]);

  function choose(r: Place) {
    picked.current = true;
    setText(r.label);
    go(r.lat, r.lng);
  }

  function go(lat: number, lng: number) {
    map.flyTo([lat, lng], 18, { duration: 0.8 });
    onPick(lat, lng);
    setOpen(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); if (results[0]) choose(results[0]); }
    if (e.key === 'Escape') setOpen(false);
  }

  function locate() {
    if (!navigator.geolocation) return toast.error('This browser cannot share its location');
    navigator.geolocation.getCurrentPosition(
      (p) => { go(p.coords.latitude, p.coords.longitude); if (p.coords.accuracy > 100) toast.message(`Location is approximate (±${Math.round(p.coords.accuracy)} m). Drag the pin onto the gate.`); },
      () => toast.error('Location was blocked or unavailable. Search for the place instead.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div ref={box} className="absolute top-2.5 left-12 z-[1000] w-[min(20rem,calc(100%-7.5rem))]">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            type="search" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onFocus={() => results.length && setOpen(true)}
            placeholder="Search a place, street or landmark" aria-label="Search a place on the map" autoComplete="off"
            role="combobox" aria-expanded={open} aria-controls="place-results"
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pr-2 pl-8 text-sm text-slate-900 shadow-md outline-none placeholder:text-slate-500 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30"
          />
        </div>
        <button type="button" onClick={locate} title="Use my location" aria-label="Use my location"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-md hover:bg-slate-50">
          <LocateFixed className="size-4" aria-hidden />
        </button>
      </div>
      {open && (busy || results.length > 0 || text.trim().length >= 3) && (
        <ul id="place-results" role="listbox" className="mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-900 shadow-lg">
          {results.map((r, i) => (
            <li key={i} role="option" aria-selected={false}>
              <button type="button" onClick={() => choose(r)} className="w-full cursor-pointer px-3 py-1.5 text-left hover:bg-slate-100">
                <span className="block font-medium">{r.label}</span>
                {r.detail && <span className="block text-xs text-slate-500">{r.detail}</span>}
              </button>
            </li>
          ))}
          {!busy && results.length === 0 && <li className="px-3 py-1.5 text-slate-500">No places found. Try a nearby landmark or street.</li>}
          {busy && results.length === 0 && <li className="px-3 py-1.5 text-slate-500">Searching…</li>}
        </ul>
      )}
    </div>
  );
}

/** Heat layer: weight 0..1 */
export function HeatLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    const layer = (L as any).heatLayer(points, { radius: 28, blur: 22, maxZoom: 17, minOpacity: 0.35, gradient: { 0.2: '#15803d', 0.5: '#d97706', 0.85: '#dc2626' } });
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, points]);
  return null;
}

export const truckIcon = L.divIcon({
  className: '',
  html: '<div style="background:#d97706;color:#1c1917;border:2px solid #fff;border-radius:999px;width:30px;height:30px;display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.35)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

export const depotIcon = L.divIcon({
  className: '',
  html: '<div style="background:#0f766e;color:#fff;border:2px solid #fff;border-radius:6px;width:26px;height:26px;display:grid;place-items:center;font:600 12px Fira Sans">D</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

export function numberIcon(n: number, color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:999px;width:24px;height:24px;display:grid;place-items:center;font:600 11px 'Fira Code',monospace;box-shadow:0 1px 3px rgba(0,0,0,.3)">${n}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
