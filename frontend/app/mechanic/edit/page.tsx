"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import Map from "@/components/Map";
import { ErrorBox, Notice, Skeleton, useLoad } from "@/components/ui";
import { SERVICES, api, param } from "@/lib/api";

const EMPTY = { name: "", under_tx: "", phone: "", alt_phone: "", gmaps_name: "", gmaps_link: "", zone: "", locality: "", coverage_areas: "", radius_km: 10, service_type: "", garage_name: "", weekly_off: "", notes: "", group_ids: [] as number[], exact_lat: null as any, exact_lng: null as any };
const TIMES = Array.from({ length: 24 }, (_, h) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`);

export default function Edit() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(param("id")), []);
  const existing = useLoad(id ? `/mechanics/${id}` : null);
  const zones = useLoad("/zones");
  const groups = useLoad("/groups");
  const [v, setV] = useState<any>(EMPTY);
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState("8 am");
  const [to, setTo] = useState("11 pm");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [warn, setWarn] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const m = existing.data; if (!m) return;
    setV({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).filter((k) => k in m).map((k) => [k, m[k]])), group_ids: m.groups.map((g: any) => g.id), exact_lat: m.exact_lat, exact_lng: m.exact_lng });
    const match = /^(\d{1,2} [ap]m) to (\d{1,2} [ap]m)$/i.exec(m.working_hours || "");
    setAllDay(m.working_hours === "24/7" || !match);
    if (match) { setFrom(match[1].toLowerCase()); setTo(match[2].toLowerCase()); }
  }, [existing.data]);
  useEffect(() => { const z = param("zone"); if (z) setV((x: any) => ({ ...x, zone: z })); }, []);

  const set = (k: string, val: any) => setV((x: any) => ({ ...x, [k]: val }));
  const zone = (zones.data || []).find((z: any) => z.code === v.zone);
  const pin: any = v.exact_lat != null ? [v.exact_lat, v.exact_lng] : null;
  const focus: any = pin ? [pin[0], pin[1], 14] : zone?.lat != null ? [zone.lat, zone.lng, 12] : null;

  const readLink = async () => {
    setErr(""); setMsg("");
    try { const p = await api("/maps-link", { json: { link: v.gmaps_link } }); setV((x: any) => ({ ...x, exact_lat: p.lat, exact_lng: p.lng })); setMsg("Location read from the link. Check the pin on the map, then save."); }
    catch (e: any) { setErr(e.message); }
  };
  const save = async (confirm = false) => {
    setErr(""); setMsg("");
    if (!v.name.trim() || !v.zone) { setErr("Real name and zone are required."); return; }
    setBusy(true);
    const body = { ...v, working_hours: allDay ? "24/7" : `${from} to ${to}`, confirm_duplicates: confirm };
    try {
      const r = await api(id ? `/mechanics/${id}` : "/mechanics", { method: id ? "PUT" : "POST", json: body });
      if (!r.saved) { setWarn(r.warnings); setBusy(false); return; }
      window.location.href = `/mechanic/?id=${r.mechanic.id}`;
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  if (id === null || (id && existing.loading)) return <Shell title="Mechanic"><Skeleton rows={8} /></Shell>;
  const F = ({ k, label, ...p }: any) => (<div><label className="label" htmlFor={k}>{label}</label><input id={k} className="input" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...p} /></div>);

  return (
    <Shell title={id ? "Edit mechanic" : "Add mechanic"}>
      <ErrorBox text={err || existing.error} /><Notice text={msg} />
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-5">
        <div className="card grid gap-4 md:grid-cols-2">
          <h2 className="md:col-span-2">Who he is</h2>
          {F({ k: "name", label: "Real name *", required: true })}
          {F({ k: "under_tx", label: "Under TX (the technician he works under)" })}
          {F({ k: "phone", label: "Phone number", inputMode: "tel" })}
          {F({ k: "alt_phone", label: "Alternate or backup number", inputMode: "tel" })}
          {F({ k: "gmaps_name", label: "Name shown on Google Maps" })}
          <div><span className="label">WhatsApp groups</span>
            <div className="flex gap-2 flex-wrap">{(groups.data || []).map((g: any) => { const on = v.group_ids.includes(g.id); return <button type="button" key={g.id} aria-pressed={on} className={`pill text-sm ${on ? "pill-on" : ""}`} onClick={() => set("group_ids", on ? v.group_ids.filter((i: number) => i !== g.id) : [...v.group_ids, g.id])}>{g.name}</button>; })}
              {groups.data && !groups.data.length && <span className="muted">No groups yet. Add them on the WhatsApp Groups page.</span>}</div></div>
        </div>
        <div className="card grid gap-4 md:grid-cols-2">
          <h2 className="md:col-span-2">Work</h2>
          <div><span className="label">Working hours</span>
            <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Works 24/7</label>
            {!allDay && <div className="flex items-center gap-2"><select aria-label="From" className="input" value={from} onChange={(e) => setFrom(e.target.value)}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select><span>to</span><select aria-label="To" className="input" value={to} onChange={(e) => setTo(e.target.value)}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></div>}</div>
          {F({ k: "weekly_off", label: "Weekly off day", placeholder: "For example: Sunday" })}
          <div><label className="label" htmlFor="service_type">Service type</label><select id="service_type" className="input" value={v.service_type} onChange={(e) => set("service_type", e.target.value)}><option value="">Not added yet</option>{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></div>
          {F({ k: "garage_name", label: "Garage name" })}
          <div className="md:col-span-2"><label className="label" htmlFor="notes">Notes</label><textarea id="notes" className="input" rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <div className="card grid gap-4 md:grid-cols-2">
          <h2 className="md:col-span-2">Where he works</h2>
          <div><label className="label" htmlFor="zone">Zone *</label><select id="zone" required className="input" value={v.zone} onChange={(e) => set("zone", e.target.value)}><option value="">Choose a zone</option>{(zones.data || []).map((z: any) => <option key={z.code} value={z.code}>{z.code} · {z.name || "unnamed"} ({z.region})</option>)}</select></div>
          {F({ k: "locality", label: "Area or locality" })}
          {F({ k: "coverage_areas", label: "Other areas he covers", placeholder: "Separate with commas" })}
          {F({ k: "radius_km", label: "Service radius in km", type: "number", min: 0.5, max: 50, step: 0.5 })}
          <div className="md:col-span-2 flex flex-col gap-2">
            <label className="label !mb-0" htmlFor="gmaps_link">Exact location</label>
            <p className="muted">Paste his Google Maps link and press Read link, or click the map to place the pin, then drag it to the exact spot.</p>
            <div className="flex gap-2 flex-wrap"><input id="gmaps_link" className="input flex-1 min-w-[240px]" placeholder="https://maps.app.goo.gl/… or https://www.google.com/maps/…" value={v.gmaps_link} onChange={(e) => set("gmaps_link", e.target.value)} /><button type="button" className="btn" disabled={!v.gmaps_link} onClick={readLink}>Read link</button>{pin && <button type="button" className="btn btn-danger" onClick={() => setV((x: any) => ({ ...x, exact_lat: null, exact_lng: null }))}>Remove pin</button>}</div>
            <Map zones={zone ? [zone] : []} pin={pin} focus={focus} height="340px" onPick={(lat: number, lng: number) => setV((x: any) => ({ ...x, exact_lat: lat, exact_lng: lng }))} onPinMove={(lat: number, lng: number) => setV((x: any) => ({ ...x, exact_lat: lat, exact_lng: lng }))} />
            <p className="muted">{pin ? `Pin at ${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}. This will show as an exact location.` : "No pin. He will show near the zone centre, marked approximate."}</p>
          </div>
        </div>
        {warn.length > 0 && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4"><div className="font-semibold text-amber-800">Possible duplicate</div><ul className="list-disc pl-5 text-sm my-2">{warn.map((w) => <li key={w}>{w}</li>)}</ul><button type="button" className="btn" onClick={() => save(true)}>Save anyway</button></div>}
        <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : id ? "Save changes" : "Save mechanic"}</button><button type="button" className="btn" onClick={() => history.back()}>Cancel</button></div>
      </form>
    </Shell>
  );
}
