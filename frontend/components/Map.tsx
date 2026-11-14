"use client";
import dynamic from "next/dynamic";
// Leaflet needs the browser, so the map is loaded only on the client.
const Map = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-[420px] rounded-2xl bg-line/60 animate-pulse" /> });
export default Map;
export const MapLegend = dynamic(() => import("./MapView").then((m) => m.MapLegend), { ssr: false });
