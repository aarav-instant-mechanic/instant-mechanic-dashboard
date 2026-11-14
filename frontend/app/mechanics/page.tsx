"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { Blank, ContactButtons, Empty, ErrorBox, PositionChip, Skeleton, useLoad } from "@/components/ui";
import { API, CITIES, DELHI_REGIONS, SERVICES, isAdmin, param, session } from "@/lib/api";

const PAGE = 50;
const MISSING: Record<string, string> = { phone: "No phone number", gmaps_name: "No Maps name", group: "No WhatsApp group", location: "No exact location" };

export default function Mechanics() {
  const [f, setF] = useState<any>(null);
  const [sort, setSort] = useState("zone");
  const [page, setPage] = useState(1);
  useEffect(() => setF({ q: param("q"), city: param("city"), zone: param("zone"), service: "", hours: "", missing: param("missing") }), []);
  const query = f ? "/mechanics?" + new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString() : null;
  const { data, error, loading } = useLoad(query);
  const zones = useLoad("/zones");
  const set = (k: string, v: string) => { setF({ ...f, [k]: v, ...(k === "city" ? { zone: "" } : {}) }); setPage(1); };
  const rows = useMemo(() => {
    const r = [...(data || [])];
    if (sort === "name") r.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "area") r.sort((a, b) => (a.locality || "~").localeCompare(b.locality || "~"));
    if (sort === "updated") r.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    return r;
  }, [data, sort]);
  const shown = rows.slice(0, page * PAGE);
  const download = async () => {
    const res = await fetch(API + "/export", { headers: { Authorization: "Bearer " + session().token } });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = "mechanics.csv"; a.click(); URL.revokeObjectURL(url);
  };
  if (!f) return <Shell title="Mechanics"><Skeleton /></Shell>;
  const zoneOpts = (zones.data || []).filter((z: any) => !f.city || z.city === f.city || z.region === f.city);

  return (
    <Shell title="Mechanics" wide>
      <div className="card !p-3 flex gap-2 flex-wrap items-center">
        <input aria-label="Search" className="input !w-64 !rounded-full" placeholder="Name, Maps name, group, phone, area" value={f.q} onChange={(e) => set("q", e.target.value)} />
        <select aria-label="City" className="input !w-auto" value={f.city} onChange={(e) => set("city", e.target.value)}><option value="">All cities</option>{CITIES.map((c) => <option key={c}>{c}</option>)}<optgroup label="Delhi regions">{DELHI_REGIONS.map((c) => <option key={c}>{c}</option>)}</optgroup></select>
        <select aria-label="Zone" className="input !w-auto" value={f.zone} onChange={(e) => set("zone", e.target.value)}><option value="">All zones</option>{zoneOpts.map((z: any) => <option key={z.code} value={z.code}>{z.code} {z.name}</option>)}</select>
        <select aria-label="Service" className="input !w-auto" value={f.service} onChange={(e) => set("service", e.target.value)}><option value="">Any service</option>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Hours" className="input !w-auto" value={f.hours} onChange={(e) => set("hours", e.target.value)}><option value="">Any hours</option><option value="24/7">24/7</option><option value="timed">Fixed hours</option></select>
        <select aria-label="Missing details" className="input !w-auto" value={f.missing} onChange={(e) => set("missing", e.target.value)}><option value="">All records</option>{Object.entries(MISSING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Sort" className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value)}><option value="zone">Sort by zone</option><option value="name">Sort by name</option><option value="area">Sort by area</option><option value="updated">Recently updated</option></select>
        <span className="ml-auto flex gap-2">{isAdmin() && <><button className="btn text-sm" onClick={download}>Export CSV</button><Link className="btn btn-primary text-sm" href="/mechanic/edit/">Add mechanic</Link></>}</span>
      </div>
      <ErrorBox text={error} />
      <div className="muted">{loading ? "Loading…" : `${rows.length} mechanics`}</div>
      {loading && !data && <Skeleton rows={8} />}
      {data && !rows.length && <Empty text="No mechanics match. Try fewer filters or a shorter search." />}
      {rows.length > 0 && (
        <div className="card !p-0 overflow-auto max-h-[72vh]">
          <table className="w-full text-sm min-w-[1000px]">
            <thead><tr>{["Mechanic", "Google Maps name", "Zone", "Area", "Phone", "WhatsApp group", "Hours", "Service", "Location", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((m: any) => (
                <tr key={m.id} className="hover:bg-canvas">
                  <td className="td"><Link href={`/mechanic/?id=${m.id}`} className="font-bold hover:text-brand-deep">{m.name}</Link><div className="text-xs text-muted">{m.code}{m.under_tx ? ` · under ${m.under_tx}` : ""}</div></td>
                  <td className="td"><Blank v={m.gmaps_name} /></td>
                  <td className="td"><span className="chip">{m.zone}</span><div className="text-xs text-muted">{m.region}</div></td>
                  <td className="td"><Blank v={m.locality} /></td>
                  <td className="td tabular-nums"><Blank v={m.phone} /></td>
                  <td className="td"><Blank v={m.groups.map((g: any) => g.name).join(", ")} /></td>
                  <td className="td whitespace-nowrap"><Blank v={m.working_hours} /></td>
                  <td className="td"><Blank v={m.service_type} /></td>
                  <td className="td"><PositionChip p={m.position} /></td>
                  <td className="td"><ContactButtons m={m} small /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown.length < rows.length && <button className="btn self-center" onClick={() => setPage(page + 1)}>Show {Math.min(PAGE, rows.length - shown.length)} more</button>}
    </Shell>
  );
}
