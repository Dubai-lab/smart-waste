import { useEffect, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
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
