import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";

// ─── Types ──────────────────────────────────────────────────────────────────
interface DeliveryMapProps {
  lat: number | null;
  lng: number | null;
  destLat?: number | null;
  destLng?: number | null;
  address?: string;
  neighborhood?: string;
  height?: number;
}

interface RouteData {
  coordinates: [number, number][]; // [[lat, lng], ...] — converted from OSRM GeoJSON
  distance: number; // meters
  duration: number; // seconds
}

// ─── Constants ──────────────────────────────────────────────────────────────
const NP_ORIGIN = { lat: -12.9333, lng: -38.4567 };
const OSRM_BASE = "https://router.project-osrm.org";
const ROUTE_CACHE = new Map<string, RouteData>();

// ─── Marker HTML builders ───────────────────────────────────────────────────
function originIconHtml(): string {
  return `<div style="background:#4C1D95;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 12px rgba(76,29,149,0.5);"><i class="ri-store-2-fill" style="font-size:17px;color:white;"></i></div>`;
}

function motoActiveIconHtml(): string {
  return `<div style="background:#7C3AED;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3.5px solid white;box-shadow:0 4px 16px rgba(124,58,237,0.55);animation:motoPulse 1.6s ease-in-out infinite;"><i class="ri-motorbike-fill" style="font-size:22px;color:white;"></i></div>`;
}

function motoStaticIconHtml(): string {
  return `<div style="background:#9CA3AF;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3.5px solid white;box-shadow:0 4px 14px rgba(156,163,175,0.3);opacity:0.85;"><i class="ri-motorbike-line" style="font-size:22px;color:white;"></i></div>`;
}

function destIconHtml(): string {
  return `<div style="background:#DC2626;width:38px;height:38px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 12px rgba(220,38,38,0.5);margin-top:-19px;"><div style="transform:rotate(45deg);"><i class="ri-map-pin-2-fill" style="font-size:17px;color:white;"></i></div></div>`;
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function haversineDistance(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aVal =
    sinLat * sinLat +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function findClosestIndex(route: [number, number][], point: [number, number]): number {
  let minDist = Infinity;
  let best = 0;
  for (let i = 0; i < route.length; i++) {
    const d = haversineDistance(route[i], point);
    if (d < minDist) {
      minDist = d;
      best = i;
    }
  }
  return best;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}min`;
}

// ─── Route fetching ─────────────────────────────────────────────────────────
async function fetchRoute(
  origin: [number, number],
  dest: [number, number]
): Promise<RouteData | null> {
  const cacheKey = `${origin[0]},${origin[1]}|${dest[0]},${dest[1]}`;
  const cached = ROUTE_CACHE.get(cacheKey);
  if (cached) return cached;

  try {
    const url = `${OSRM_BASE}/route/v1/driving/${origin[1]},${origin[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    // OSRM returns GeoJSON [lng, lat]; convert to [lat, lng] for Leaflet
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]]
    );

    const result: RouteData = {
      coordinates,
      distance: route.distance,
      duration: route.duration,
    };
    ROUTE_CACHE.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function DeliveryMap({
  lat,
  lng,
  destLat,
  destLng,
  address,
  neighborhood,
  height = 360,
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const motoMarkerRef = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const traveledLineRef = useRef<L.Polyline | null>(null);
  const remainingLineRef = useRef<L.Polyline | null>(null);
  const straightLineRef = useRef<L.Polyline | null>(null);
  const initRef = useRef(false);

  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeFetchedRef = useRef<string>("");

  const hasGps = lat !== null && lng !== null;
  const driverLat = hasGps ? lat! : NP_ORIGIN.lat;
  const driverLng = hasGps ? lng! : NP_ORIGIN.lng;
  const hasDest = destLat != null && destLng != null;

  // ─── Pulse animation CSS ─────────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById("moto-pulse-style")) {
      const style = document.createElement("style");
      style.id = "moto-pulse-style";
      style.textContent = `
        @keyframes motoPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById("moto-pulse-style");
      if (el) el.remove();
    };
  }, []);

  // ─── Init map ────────────────────────────────────────────────────────────
  const initMap = useCallback(() => {
    if (!mapContainerRef.current || initRef.current) return;
    initRef.current = true;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      zoom: 14,
      center: [NP_ORIGIN.lat, NP_ORIGIN.lng],
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
  }, []);

  useEffect(() => {
    const id = setTimeout(initMap, 100);
    return () => {
      clearTimeout(id);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        initRef.current = false;
      }
    };
  }, [initMap]);

  // ─── Fetch route when destination changes ────────────────────────────────
  useEffect(() => {
    if (!hasDest) return;
    const routeKey = `${NP_ORIGIN.lat},${NP_ORIGIN.lng}|${destLat},${destLng}`;
    if (routeFetchedRef.current === routeKey) return;
    routeFetchedRef.current = routeKey;

    setRouteLoading(true);
    fetchRoute([NP_ORIGIN.lat, NP_ORIGIN.lng], [destLat!, destLng!])
      .then((data) => {
        setRouteData(data);
        setRouteLoading(false);
      })
      .catch(() => setRouteLoading(false));
  }, [destLat, destLng, hasDest]);

  // ─── Clear route lines ──────────────────────────────────────────────────
  const clearLines = useCallback(() => {
    if (traveledLineRef.current) { traveledLineRef.current.remove(); traveledLineRef.current = null; }
    if (remainingLineRef.current) { remainingLineRef.current.remove(); remainingLineRef.current = null; }
    if (straightLineRef.current) { straightLineRef.current.remove(); straightLineRef.current = null; }
  }, []);

  // ─── Update markers + polylines ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Origin marker
    if (!originMarkerRef.current) {
      const icon = L.divIcon({
        html: originIconHtml(),
        className: "",
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });
      const marker = L.marker([NP_ORIGIN.lat, NP_ORIGIN.lng], {
        icon,
        zIndexOffset: 600,
      }).addTo(map);
      marker.bindPopup("<b>NP Empório</b><br>Cafeteria &amp; Massas");
      originMarkerRef.current = marker;
    }

    // Destination marker
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    if (hasDest) {
      const dIcon = L.divIcon({
        html: destIconHtml(),
        className: "",
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      });
      const marker = L.marker([destLat!, destLng!], {
        icon: dIcon,
        zIndexOffset: 800,
      }).addTo(map);
      const popupText = address
        ? `<b>Cliente</b><br>${address}`
        : "<b>Cliente</b>";
      marker.bindPopup(popupText);
      destMarkerRef.current = marker;
    }

    // Motorcycle marker
    const motoIconHtml = hasGps ? motoActiveIconHtml() : motoStaticIconHtml();
    const mIcon = L.divIcon({
      html: motoIconHtml,
      className: "",
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    if (motoMarkerRef.current) {
      motoMarkerRef.current.setLatLng([driverLat, driverLng]);
      motoMarkerRef.current.setIcon(mIcon);
      if (hasGps && motoMarkerRef.current.getPopup()) {
        motoMarkerRef.current.setPopupContent("<b>Entregador</b><br>Em rota — GPS ativo");
      } else if (!hasGps && motoMarkerRef.current.getPopup()) {
        motoMarkerRef.current.setPopupContent("<b>NP Empório</b><br>Aguardando entregador iniciar GPS");
      }
    } else {
      const marker = L.marker([driverLat, driverLng], {
        icon: mIcon,
        zIndexOffset: 1000,
      }).addTo(map);
      marker.bindPopup(
        hasGps
          ? "<b>Entregador</b><br>Em rota — GPS ativo"
          : "<b>NP Empório</b><br>Aguardando entregador iniciar GPS"
      );
      motoMarkerRef.current = marker;
    }

    // Polylines
    clearLines();

    if (hasDest) {
      if (routeData) {
        // Split route into traveled (solid) and remaining (dashed)
        const driverPoint: [number, number] = [driverLat, driverLng];
        const closestIdx = findClosestIndex(routeData.coordinates, driverPoint);
        const traveledCoords = routeData.coordinates.slice(0, closestIdx + 1);
        traveledCoords.push(driverPoint);
        const remainingCoords = routeData.coordinates.slice(closestIdx);
        remainingCoords[0] = driverPoint;

        if (traveledCoords.length >= 2) {
          traveledLineRef.current = L.polyline(traveledCoords, {
            color: "#7C3AED",
            weight: 5,
            opacity: 0.85,
          }).addTo(map);
        }

        if (remainingCoords.length >= 2) {
          remainingLineRef.current = L.polyline(remainingCoords, {
            color: "#7C3AED",
            weight: 3,
            dashArray: "12, 8",
            opacity: 0.5,
          }).addTo(map);
        }
      } else {
        // Fallback: straight line
        straightLineRef.current = L.polyline(
          [
            [driverLat, driverLng],
            [destLat!, destLng!],
          ],
          {
            color: "#7C3AED",
            weight: 3,
            dashArray: "10, 6",
            opacity: 0.55,
          }
        ).addTo(map);
      }

      // Fit bounds
      const bounds = L.latLngBounds([
        [NP_ORIGIN.lat, NP_ORIGIN.lng],
        [destLat!, destLng!],
      ]);
      if (hasGps) bounds.extend([driverLat, driverLng]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else {
      map.setView([driverLat, driverLng], hasGps ? 15 : 14);
    }
  }, [driverLat, driverLng, hasGps, destLat, destLng, hasDest, address, routeData, clearLines]);

  // ─── Derived UI state ────────────────────────────────────────────────────
  const destinationLabel = neighborhood || address || "Destino";
  const remainingDist = routeData
    ? formatDistance(
        haversineDistance([driverLat, driverLng], [
          routeData.coordinates[routeData.coordinates.length - 1][0],
          routeData.coordinates[routeData.coordinates.length - 1][1],
        ])
      )
    : null;
  const totalDist = routeData ? formatDistance(routeData.distance) : null;
  const eta = routeData ? formatDuration(routeData.duration) : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: hasGps ? "#EDE9FE" : "#F3F4F6" }}
          >
            <i
              className={`text-lg ${
                hasGps
                  ? "ri-motorbike-fill text-purple-600"
                  : "ri-motorbike-line text-gray-400"
              }`}
            ></i>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Percurso ao Vivo
            </p>
            <p className="text-xs text-gray-500">
              {hasGps
                ? "Moto em movimento — GPS ativo"
                : "Aguardando entregador iniciar GPS"}
            </p>
          </div>
        </div>
        {hasGps && hasDest && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${driverLat},${driverLng}&destination=${destLat},${destLng}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-700 hover:bg-purple-800 text-white transition-colors whitespace-nowrap flex-shrink-0"
          >
            <i className="ri-external-link-line"></i>
            Google Maps
          </a>
        )}
      </div>

      {/* Map */}
      <div className="relative">
        {routeLoading && (
          <div className="absolute inset-0 z-[2000] bg-white/80 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <i className="ri-loader-4-line animate-spin"></i>
              Calculando rota...
            </div>
          </div>
        )}
        <div ref={mapContainerRef} style={{ height }} className="w-full" />
      </div>

      {/* Footer with route info */}
      <div className="p-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <i className="ri-map-pin-line text-gray-400 text-sm flex-shrink-0"></i>
          <p className="text-xs text-gray-600 truncate flex-1 min-w-0">
            Em rota para: {destinationLabel}
          </p>
          {routeData && (
            <span className="text-xs text-gray-500 flex-shrink-0 flex items-center gap-3">
              {totalDist && (
                <span className="flex items-center gap-1">
                  <i className="ri-road-map-line text-gray-400"></i>
                  {totalDist}
                </span>
              )}
              {eta && (
                <span className="flex items-center gap-1">
                  <i className="ri-time-line text-gray-400"></i>
                  ~{eta}
                </span>
              )}
            </span>
          )}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-purple-900 inline-block"></span>
            NP Empório
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-purple-500 inline-block animate-pulse"></span>
            Entregador
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span>
            Cliente
          </span>
          {routeData && hasGps && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-500 inline-block"></span>
                Percorrido
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-4 h-0.5 inline-block"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, #7C3AED 0px, #7C3AED 4px, transparent 4px, transparent 8px)",
                  }}
                ></span>
                Restante
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}