"use client";
import "leaflet/dist/leaflet.css";
import { Fragment, useEffect, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { POSITION } from "./ui";

const pinIcon = L.divIcon({
  className: "", iconSize: [28, 36], iconAnchor: [14, 34],
  html: '<svg width="28" height="36" viewBox="0 0 28 36"><path d="M14 35S2 22 2 13a12 12 0 0 1 24 0c0 9-12 22-12 22z" fill="#FF7900" stroke="#202124" stroke-width="2"/><circle cx="14" cy="13" r="4.500" fill="#202124"/></svg>',
});

function Fly({ focus }: { focus?: [number, number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (focus) map.flyTo([focus[0], focus[1]], focus[2], { duration: 0.6 }); }, [focus?.[0], focus?.[1], focus?.[2]]); // eslint-disable-line
  return null;
}
function Clicks({ onPick, onZoom }: { onPick?: (lat: number, lng: number) => void; onZoom: (z: number) => void }) {
  const map = useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng), zoomend: () => onZoom(map.getZoom()) });
  return null;
}

/**
 * The one map used everywhere.
 * zones: zone list (centres and drawn boundaries)      mechanics: list with .position
 * pin + onPinMove: a draggable pin (set exact location, or lookup point)
 * onPick: called when the map is clicked                draw: points of a boundary being drawn
 */
export default function MapView(props: {
  zones?: any[]; mechanics?: any[]; selectedZone?: string; onZone?: (z: any) => void; onMechanic?: (m: any) => void;
  focus?: [number, number, number] | null; height?: string; pin?: [number, number] | null; onPinMove?: (lat: number, lng: number) => void;
  onPick?: (lat: number, lng: number) => void; draw?: [number, number][]; radiusFor?: any; showBoundaries?: boolean; showLabels?: boolean;
}) {
  const { zones = [], mechanics = [], selectedZone, height = "560px", showBoundaries = true, showLabels = true } = props;
  const [zoom, setZoom] = useState(10);
  const fixedLabels = zoom >= 11 || zones.length <= 12;   // when zoomed out, labels would overlap, so they show on hover
  return (
    <MapContainer center={[28.58, 77.2]} zoom={10} style={{ height, width: "100%" }} scrollWheelZoom>
      {/* OpenStreetMap tiles are free; the attribution line must stay visible. */}
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      <Fly focus={props.focus} />
      <Clicks onPick={props.onPick} onZoom={setZoom} />

      {zones.map((z) => {
        const sel = z.code === selectedZone;
        const empty = z.mechanics === 0;
        const style = { color: empty ? "#C62828" : sel ? "#E65C00" : "#202124", weight: sel ? 3 : 1.5, fillColor: empty ? "#C62828" : "#FFCC00", fillOpacity: sel ? 0.3 : 0.12, dashArray: empty ? "6 5" : undefined };
        return (
          <Fragment key={z.code}>
            {showBoundaries && z.polygon?.length >= 3 && <Polygon positions={z.polygon} pathOptions={style} eventHandlers={{ click: () => props.onZone?.(z) }} />}
            {z.lat != null && (
              <CircleMarker center={[z.lat, z.lng]} radius={sel ? 9 : 5} pathOptions={{ ...style, fillOpacity: 0.9, fillColor: empty ? "#fff" : "#FFCC00", dashArray: undefined }} eventHandlers={{ click: () => props.onZone?.(z) }}>
                {showLabels && <Tooltip key={fixedLabels || sel ? "fixed" : "hover"} permanent={fixedLabels || sel} direction="top" offset={[0, -6]} className="zone-label">{z.code}{z.name && !fixedLabels && !sel ? ` · ${z.name}` : ""}</Tooltip>}
              </CircleMarker>
            )}
          </Fragment>
        );
      })}

      {mechanics.filter((m) => m.position?.lat != null).map((m) => {
        const meta = POSITION[m.position.kind] || POSITION.none;
        const hollow = m.position.kind === "approximate";
        return (
          <CircleMarker key={m.id} center={[m.position.lat, m.position.lng]} radius={7}
            pathOptions={{ color: hollow ? meta.color : "#fff", weight: 2, fillColor: hollow ? "#fff" : meta.color, fillOpacity: 1 }}
            eventHandlers={{ click: () => props.onMechanic?.(m) }}>
            <Popup>
              <b>{m.name}</b><br />{m.zone} · {m.locality || "Area not added yet"}<br />
              Maps name: {m.gmaps_name || "Not added yet"}<br />
              {m.position.kind === "approximate" ? "Approximate: placed near the zone centre" : meta.label}<br />
              <a href={`/mechanic/?id=${m.id}`}>View full profile</a>
            </Popup>
          </CircleMarker>
        );
      })}

      {props.radiusFor?.position?.lat != null && ["exact", "live"].includes(props.radiusFor.position.kind) && (
        <Circle center={[props.radiusFor.position.lat, props.radiusFor.position.lng]} radius={props.radiusFor.radius_km * 1000} pathOptions={{ color: "#1E8E4E", weight: 1.5, dashArray: "5 5", fillOpacity: 0.05 }} />
      )}
      {props.draw && props.draw.length > 0 && (props.draw.length >= 3
        ? <Polygon positions={props.draw} pathOptions={{ color: "#E65C00", weight: 3, fillOpacity: 0.15 }} />
        : <Polyline positions={props.draw} pathOptions={{ color: "#E65C00", weight: 3 }} />)}
      {props.draw?.map((p, i) => <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#E65C00", fillOpacity: 1 }} />)}
      {props.pin && (
        <Marker position={props.pin} icon={pinIcon} draggable={!!props.onPinMove}
          eventHandlers={{ dragend: (e: any) => { const p = e.target.getLatLng(); props.onPinMove?.(p.lat, p.lng); } }} />
      )}
    </MapContainer>
  );
}

export function MapLegend() {
  return (
    <div className="flex gap-3 flex-wrap text-xs text-muted items-center">
      {Object.entries(POSITION).filter(([k]) => k !== "none").map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2" style={{ background: k === "approximate" ? "#fff" : v.color, borderColor: v.color }} />{v.label}</span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-brand-yellow border border-ink" />Zone centre</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-white border-2 border-dashed border-alert" />Zone with no mechanics</span>
    </div>
  );
}
