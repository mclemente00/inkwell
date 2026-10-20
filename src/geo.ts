import type { GeoPoint, Note } from './types';

export function here(timeout = 8000): Promise<GeoPoint | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60_000 },
    );
  });
}

/** Great-circle distance in metres. */
export function distance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371e3;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const NEARBY_M = 300;

export function nearest(notes: Note[], at: GeoPoint): { note: Note; d: number } | null {
  let best: { note: Note; d: number } | null = null;
  for (const n of notes) {
    if (!n.loc) continue;
    const d = distance(n.loc, at);
    if (!best || d < best.d) best = { note: n, d };
  }
  return best && best.d <= NEARBY_M ? best : null;
}

export const fmtDistance = (m: number) =>
  m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
