"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import Map from "@/components/Map";
import { Empty, ErrorBox, MechanicCard, Skeleton, useLoad } from "@/components/ui";
import { CITIES, CITY_CENTRES, DELHI_REGIONS, isAdmin, param } from "@/lib/api";

export default function Zones() {
  const zones = useLoad("/zones");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [zone, setZone] = useState("");
  useEffect(() => { setCity(param("city")); setZone(param("zone")); }, []);
  useEffect(() => { if (zone && zones.data && !city) { const z = zones.data.find((x: any) => x.code === zone); if (z) setCity(z.city); } }, [zone, zones.data, city]);
  const mechs = useLoad(zone ? `/mechanics?zone=${zone}` : city ? `/mechanics?city=${encodeURIComponent(region || city)}` : null);
  const all = zones.data || [];
  const inCity = all.filter((z: any) => z.city === city && (!region || z.region === region));
  const z = all.find((x: any) => x.code === zone);
  const focus: any = z?.lat != null ? [z.lat, z.lng, 13] : CITY_CENTRES[region || city] || null;

  return (
    <Shell title="Cities and Zones">
      <ErrorBox text={zones.error} />
      {zones.loading && <Skeleton />}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {CITIES.map((c) => {
          const zs = all.filter((x: any) => x.city === c);
          const n = zs.reduce((a: number, x: any) => a + x.mechanics, 0);
          const empty = zs.filter((x: any) => !x.mechanics).length;
          return (
            <button key={c} onClick={() => { setCity(c); setRegion(""); setZone(""); }} className={`card !p-4 text-left hover:border-brand-orange ${city === c ? "border-brand-orange bg-brand-tint" : ""}`}>
              <div className="font-display font-bold text-lg">{c}</div>
              <div className="font-display font-bold text-3xl tabular-nums">{n}</div>
              <div className="muted">mechanics · {zs.length} zones</div>
              {empty > 0 && <div className="chip chip-alert mt-1">{empty} empty</div>}
            </button>
          );
        })}
      </div>
      {!city && zones.data && <Empty text="Choose a city to see its zones and mechanics." />}
      {city === "Delhi" && <div className="flex gap-2 flex-wrap"><button className={`pill ${!region ? "pill-on" : ""}`} onClick={() => { setRegion(""); setZone(""); }}>All Delhi</button>{DELHI_REGIONS.map((r) => <button key={r} className={`pill ${region === r ? "pill-on" : ""}`} onClick={() => { setRegion(r); setZone(""); }}>{r}</button>)}</div>}
      {city && (
        <>
          <div className="card"><h2 className="mb-3">Zones in {region || city}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {inCity.map((x: any) => (
                <button key={x.code} onClick={() => setZone(x.code === zone ? "" : x.code)} className={`text-left rounded-xl border p-3 hover:border-brand-orange ${x.code === zone ? "border-brand-orange bg-brand-tint" : "border-line bg-white"}`}>
                  <div className="flex justify-between gap-2"><b>{x.code}</b><span className={`chip ${x.mechanics === 0 ? "chip-alert" : x.mechanics === 1 ? "chip-warn" : "chip-ok"}`}>{x.mechanics === 0 ? "No mechanics" : `${x.mechanics} mechanics`}</span></div>
                  <div className="text-sm">{x.name || <span className="italic text-muted">Area not named yet</span>}</div>
                  {city === "Delhi" && !region && <div className="text-xs text-muted">{x.region}</div>}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="card !p-2"><Map zones={inCity} mechanics={mechs.data || []} selectedZone={zone} onZone={(x: any) => setZone(x.code)} focus={focus} height="480px" /></div>
            <div className="flex flex-col gap-3 lg:max-h-[500px] lg:overflow-auto">
              {z && <div className="card !p-4"><h2>{z.code} · {z.name || "Area not named yet"}</h2><p className="muted">{z.region}</p>{z.localities && <p className="text-sm mt-1">Covers: {z.localities}</p>}{z.notes && <p className="text-sm mt-1 text-amber-800">{z.notes}</p>}<p className="text-sm mt-1">{z.polygon?.length ? "Boundary drawn by Admin." : "Boundary not drawn yet. The dot is an approximate centre."}</p>
                {isAdmin() && <div className="flex gap-2 mt-2 flex-wrap"><Link className="btn text-sm" href={`/manage/?tab=zones&zone=${z.code}`}>Edit zone</Link><Link className="btn btn-primary text-sm" href={`/mechanic/edit/?zone=${z.code}`}>Add mechanic here</Link></div>}</div>}
              <div className="muted">{mechs.loading ? "Loading…" : `${(mechs.data || []).length} mechanics in ${zone || region || city}`}</div>
              {(mechs.data || []).map((m: any) => <MechanicCard key={m.id} m={m} />)}
              {mechs.data && !mechs.data.length && <Empty text="No mechanics are listed here. This is a coverage gap." />}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
