"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import Map, { MapLegend } from "@/components/Map";
import { Empty, ErrorBox, MechanicCard, Skeleton, useLoad } from "@/components/ui";
import { CITIES, CITY_CENTRES, DELHI_REGIONS, SERVICES, param } from "@/lib/api";

export default function MapPage() {
  const [tick, setTick] = useState(0);
  const zones = useLoad("/zones");
  const mechs = useLoad("/mechanics", [tick]);
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [zone, setZone] = useState("");
  const [service, setService] = useState("");
  const [kind, setKind] = useState("");
  const [picked, setPicked] = useState<any>(null);
  const [boundaries, setBoundaries] = useState(true);
  const [labels, setLabels] = useState(true);
  const [focus, setFocus] = useState<any>(null);

  useEffect(() => { const c = param("city"); if (c) pickCity(c); }, []); // eslint-disable-line
  // refresh positions every 30 seconds so live markers move
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  const pickCity = (c: string) => { setCity(c); setRegion(""); setZone(""); setPicked(null); setFocus(CITY_CENTRES[c] || CITY_CENTRES[""]); };
  const pickRegion = (r: string) => { setRegion(r); setZone(""); setFocus(CITY_CENTRES[r || "Delhi"]); };
  const pickZone = (z: any) => { setZone(z.code); setPicked(null); if (z.lat != null) setFocus([z.lat, z.lng, 13]); if (!city) setCity(z.city); };

  const inArea = (x: any) => (!city || x.city === city) && (!region || x.region === region);
  const zoneList = useMemo(() => (zones.data || []).filter(inArea), [zones.data, city, region]); // eslint-disable-line
  const list = useMemo(() => (mechs.data || []).filter((m: any) => inArea(m) && (!zone || m.zone === zone) && (!service || m.service_type === service) && (!kind || m.position.kind === kind)),
    [mechs.data, city, region, zone, service, kind]); // eslint-disable-line
  const zoneInfo = zoneList.find((z: any) => z.code === zone);

  return (
    <Shell title="Live Map" wide>
      <ErrorBox text={zones.error || mechs.error} />
      <div className="card !p-3 flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap items-center">
          <button className={`pill ${!city ? "pill-on" : ""}`} onClick={() => pickCity("")}>All NCR</button>
          {CITIES.map((c) => <button key={c} className={`pill ${city === c ? "pill-on" : ""}`} onClick={() => pickCity(c)}>{c} <span className="tabular-nums opacity-70">{(mechs.data || []).filter((m: any) => m.city === c).length}</span></button>)}
        </div>
        {city === "Delhi" && <div className="flex gap-2 flex-wrap"><button className={`pill text-xs ${!region ? "pill-on" : ""}`} onClick={() => pickRegion("")}>All Delhi</button>{DELHI_REGIONS.map((r) => <button key={r} className={`pill text-xs ${region === r ? "pill-on" : ""}`} onClick={() => pickRegion(r)}>{r}</button>)}</div>}
        <div className="flex gap-2 flex-wrap items-center">
          <select aria-label="Zone" className="input !w-auto" value={zone} onChange={(e) => { const z = zoneList.find((x: any) => x.code === e.target.value); z ? pickZone(z) : setZone(""); }}>
            <option value="">All zones</option>{zoneList.map((z: any) => <option key={z.code} value={z.code}>{z.code} {z.name} ({z.mechanics})</option>)}
          </select>
          <select aria-label="Service type" className="input !w-auto" value={service} onChange={(e) => setService(e.target.value)}><option value="">Any service</option>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select>
          <select aria-label="Location type" className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Any location type</option><option value="live">Live only</option><option value="exact">Exact</option><option value="approximate">Approximate</option></select>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={boundaries} onChange={(e) => setBoundaries(e.target.checked)} /> Boundaries</label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Zone labels</label>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="card !p-2 flex flex-col gap-2">
          <Map zones={zoneList} mechanics={list} selectedZone={zone} onZone={pickZone} onMechanic={setPicked} focus={focus} radiusFor={picked} showBoundaries={boundaries} showLabels={labels} height="620px" />
          <div className="px-2 pb-1 flex flex-col gap-1"><MapLegend />{!city && <span className="text-xs text-muted">Pick a city or zoom in to see zone labels. Point at a dot to see its zone.</span>}</div>
        </div>
        <div className="flex flex-col gap-3 lg:max-h-[690px] lg:overflow-auto">
          {zoneInfo && <div className="card !p-4"><div className="flex justify-between gap-2"><h2>{zoneInfo.code} · {zoneInfo.name || "Area not named yet"}</h2><button className="pill text-xs" onClick={() => setZone("")}>Clear</button></div><p className="muted">{zoneInfo.region} · {zoneInfo.mechanics} mechanics{zoneInfo.polygon?.length ? "" : " · boundary not drawn yet"}</p>{zoneInfo.localities && <p className="text-sm mt-1">Covers: {zoneInfo.localities}</p>}</div>}
          {picked && <div><div className="muted mb-1">Selected on map</div><MechanicCard m={picked} /></div>}
          <div className="muted">{list.length} mechanics {zone ? `in ${zone}` : city ? `in ${region || city}` : "in all cities"}</div>
          {mechs.loading && !mechs.data && <Skeleton />}
          {list.filter((m: any) => m.id !== picked?.id).map((m: any) => <MechanicCard key={m.id} m={m} />)}
          {mechs.data && !list.length && <Empty text={zone ? "No mechanics are listed in this zone." : "No mechanics match these filters."} />}
        </div>
      </div>
    </Shell>
  );
}
