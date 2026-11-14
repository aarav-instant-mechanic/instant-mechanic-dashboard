"use client";
import { useMemo, useState } from "react";
import Shell from "@/components/Shell";
import Map from "@/components/Map";
import { Empty, ErrorBox, MechanicCard, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

export default function Lookup() {
  const zones = useLoad("/zones");
  const [q, setQ] = useState("");
  const [pin, setPin] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const find = async (lat: number, lng: number) => { setPin([lat, lng]); setErr(""); try { setRes(await api(`/lookup?lat=${lat}&lng=${lng}`)); } catch (e: any) { setErr(e.message); } };
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    return (zones.data || []).filter((z: any) => z.lat != null && `${z.code} ${z.name} ${z.localities} ${z.city} ${z.region}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, zones.data]);
  const z = res?.zone;

  return (
    <Shell title="Location Lookup" wide>
      <div className="card flex flex-col gap-2">
        <h2>Where is the customer?</h2>
        <p className="muted">Type an area name, or click the map where the customer is standing. You can drag the pin.</p>
        <input aria-label="Area name" className="input !rounded-full max-w-lg" placeholder="For example: Dwarka, Manesar, Sector 62" value={q} onChange={(e) => setQ(e.target.value)} />
        {matches.length > 0 && <div className="flex gap-2 flex-wrap">{matches.map((m: any) => <button key={m.code} className="pill text-sm" onClick={() => find(m.lat, m.lng)}>{m.name || m.code} <span className="opacity-60">({m.code})</span></button>)}</div>}
        {q.trim().length >= 2 && !matches.length && <p className="muted">No zone has that area name. Click the place on the map instead.</p>}
      </div>
      <ErrorBox text={err || zones.error} />
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="card !p-2"><Map zones={zones.data || []} mechanics={res ? [...res.covering, ...res.zone_mechanics_without_exact_location] : []} selectedZone={z?.code} pin={pin} onPick={find} onPinMove={find} focus={pin ? [pin[0], pin[1], 12] : null} height="600px" /></div>
        <div className="flex flex-col gap-3 lg:max-h-[620px] lg:overflow-auto">
          {!res && <Empty text="Pick a place to see its zone and the mechanics who cover it." />}
          {res && z && <div className="card !p-4"><div className="muted">This place is in</div><h2>{z.code} · {z.name || "Area not named yet"}</h2><p className="muted">{z.region}</p>
            {res.zone_found_by === "nearest_centre" && <p className="text-sm mt-2 rounded-xl bg-amber-50 border border-amber-200 p-2 text-amber-800">Best guess: this zone's boundary is not drawn yet, so the nearest zone centre was used ({res.distance_to_centre_km} km away). Check with a senior if the place is near a border.</p>}</div>}
          {res && <>
            <h3>Within service radius ({res.covering.length})</h3>
            {res.covering.map((m: any) => <MechanicCard key={m.id} m={m} extra={<span className="chip chip-ok">{m.distance_km} km away</span>} />)}
            {!res.covering.length && <p className="muted">No mechanic with an exact or live location covers this point.</p>}
            <h3>In this zone, exact location not set ({res.zone_mechanics_without_exact_location.length})</h3>
            {res.zone_mechanics_without_exact_location.map((m: any) => <MechanicCard key={m.id} m={m} />)}
            {!res.zone_mechanics_without_exact_location.length && <p className="muted">None.</p>}
          </>}
        </div>
      </div>
    </Shell>
  );
}
