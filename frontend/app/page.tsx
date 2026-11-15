"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { ErrorBox, Skeleton, useLoad } from "@/components/ui";
import { isAdmin, session } from "@/lib/api";

const CarScene = dynamic(() => import("@/components/CarScene"), { ssr: false });

/** Counts up from 0 when the page opens (skipped when the system asks for reduced motion). */
function CountUp({ n }: { n: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(n); return; }
    let raf = 0; const start = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - start) / 1100); setV(Math.round(n * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <>{v}</>;
}

function Hero({ s }: { s: any }) {
  const me = session();
  const h = new Date().getHours();
  const hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-white via-canvas to-brand-tint shadow-card min-h-[260px] rise">
      <div className="hidden md:block absolute inset-y-0 left-0 w-[55%] bg-gradient-to-r from-white via-white/85 to-transparent pointer-events-none z-[1]" />
      <div className="relative z-[2] p-6 md:p-8 pb-0 md:pb-8 flex flex-col gap-3 max-w-xl">
        <span className="chip self-start !bg-white">{hello}{me?.name ? `, ${me.name}` : ""}</span>
        <h1 className="!text-[34px] md:!text-[42px] !leading-[1.05]">Your mechanic network <span className="text-brand-deep">across Delhi NCR</span></h1>
        <div className="flex gap-6 flex-wrap mt-1">
          <div><div className="font-display font-bold text-4xl tabular-nums"><CountUp n={s.mechanics} /></div><div className="muted">mechanics</div></div>
          <div><div className="font-display font-bold text-4xl tabular-nums"><CountUp n={s.covered_zones} /><span className="text-xl text-muted">/{s.zones}</span></div><div className="muted">zones covered</div></div>
          <div><div className="font-display font-bold text-4xl tabular-nums text-ok"><CountUp n={s.location.live} /></div><div className="muted">sharing live now</div></div>
        </div>
        <div className="flex gap-2 flex-wrap mt-1 pointer-events-auto">
          <Link href="/map/" className="btn btn-primary">Open live map</Link>
          <Link href="/lookup/" className="btn !bg-white">Find who covers a place</Link>
        </div>
      </div>
      <CarScene className="relative h-44 md:h-auto md:absolute md:inset-0 md:left-[30%]" />
    </div>
  );
}

function Bars({ rows, max }: { rows: [string, number, string?][]; max?: number }) {
  const top = max || Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([label, n, href]) => (
        <div key={label} className="grid grid-cols-[130px_1fr_36px] items-center gap-2 text-sm">
          {href ? <Link href={href} className="font-medium hover:text-brand-deep truncate">{label}</Link> : <span className="font-medium truncate">{label}</span>}
          <div className="h-4 rounded-full bg-canvas border border-line overflow-hidden"><div className="h-full bg-gradient-to-r from-brand-yellow to-brand-orange" style={{ width: `${(n / top) * 100}%` }} /></div>
          <span className="text-right tabular-nums font-semibold">{n}</span>
        </div>
      ))}
    </div>
  );
}
const Kpi = ({ n, label, href, tone, i = 0 }: any) => (
  <Link href={href || "#"} className="card !p-4 hover:border-brand-orange hover:-translate-y-0.5 transition rise" style={{ animationDelay: `${120 + i * 60}ms` }}>
    <div className={`font-display font-bold text-3xl tabular-nums ${tone === "alert" ? "text-alert" : ""}`}>{n}</div>
    <div className="muted">{label}</div>
  </Link>
);

export default function Overview() {
  const { data: s, error, loading } = useLoad("/stats");
  return (
    <Shell title="Overview">
      <ErrorBox text={error} />
      {loading && <Skeleton rows={6} />}
      {s && s.mechanics === 0 && (
        <div className="card border-brand-orange"><h2>No mechanics yet</h2><p className="muted mt-1">{isAdmin() ? "Upload your mechanic list to begin." : "Ask the Admin to upload the mechanic list."}</p>{isAdmin() && <Link className="btn btn-primary mt-3" href="/manage/?tab=import">Upload the mechanic CSV</Link>}</div>
      )}
      {s && (
        <>
          <Hero s={s} />
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Kpi i={1} n={s.mechanics} label="Active mechanics" href="/mechanics/" />
            <Kpi i={2} n={`${s.covered_zones} of ${s.zones}`} label="Zones with a mechanic" href="/zones/" />
            <Kpi i={3} n={s.empty_zones.length} label="Zones with no mechanic" href="/zones/" tone={s.empty_zones.length ? "alert" : ""} />
            <Kpi i={4} n={s.groups} label="WhatsApp groups" href="/groups/" />
            <Kpi i={5} n={s.location.live} label="Sharing live location now" href="/map/" />
            <Kpi i={6} n={s.location.exact + s.location.live} label="With an exact location" href="/map/" />
            <Kpi i={7} n={s.location.approximate + s.location.none} label="Location still approximate" href="/mechanics/?missing=location" />
            <Kpi i={8} n={s.missing.phone} label="Phone number not added" href="/mechanics/?missing=phone" />
          </div>
          <div className="grid gap-5 md:grid-cols-2 rise" style={{ animationDelay: "500ms" }}>
            <div className="card"><h2 className="mb-3">Mechanics by city</h2><Bars rows={s.by_city.map((c: any) => [c.city, c.mechanics, `/zones/?city=${encodeURIComponent(c.city)}`])} />
              {s.by_city[0]?.regions && Object.keys(s.by_city[0].regions).length > 0 && <div className="mt-4 pt-3 border-t border-line"><div className="muted mb-2">Delhi by region</div><Bars rows={Object.entries(s.by_city[0].regions).map(([k, v]: any) => [k, v, `/mechanics/?city=${encodeURIComponent(k)}`])} /></div>}
            </div>
            <div className="card flex flex-col gap-4">
              <div><h2 className="mb-3">Service type</h2><Bars rows={Object.entries(s.by_service).map(([k, v]: any) => [k, v])} /></div>
              <div><h2 className="mb-3">Working hours</h2><Bars rows={Object.entries(s.by_hours).map(([k, v]: any) => [k, v])} /></div>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="card"><h2 className="mb-1">Zones with no mechanic</h2><p className="muted mb-3">Counted from the current records. These need hiring first.</p>
              <div className="flex flex-wrap gap-2">{s.empty_zones.map((z: any) => <Link key={z.code} href={`/zones/?zone=${z.code}`} className="chip chip-alert">{z.code}{z.name ? ` · ${z.name}` : ""}</Link>)}{!s.empty_zones.length && <span className="muted">Every zone has at least one mechanic.</span>}</div>
              <h3 className="mt-4 mb-2">Zones with only one mechanic</h3>
              <div className="flex flex-wrap gap-2">{s.low_zones.map((z: any) => <Link key={z.code} href={`/zones/?zone=${z.code}`} className="chip chip-warn">{z.code}{z.name ? ` · ${z.name}` : ""}</Link>)}{!s.low_zones.length && <span className="muted">None.</span>}</div>
            </div>
            <div className="card"><h2 className="mb-3">Busiest zones</h2><Bars rows={s.by_zone.slice(0, 10).map((z: any) => [`${z.code} ${z.name}`, z.mechanics, `/zones/?zone=${z.code}`])} /></div>
          </div>
          <div className="card"><h2 className="mb-3">Details still to add</h2>
            <div className="flex gap-2 flex-wrap">
              <Link className="chip chip-warn" href="/mechanics/?missing=phone">{s.missing.phone} without a phone number</Link>
              <Link className="chip chip-warn" href="/mechanics/?missing=gmaps_name">{s.missing.gmaps_name} without a Maps name</Link>
              <Link className="chip chip-warn" href="/mechanics/?missing=group">{s.missing.group} without a WhatsApp group</Link>
              <Link className="chip chip-warn" href="/mechanics/?missing=location">{s.missing.location} without an exact location</Link>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
