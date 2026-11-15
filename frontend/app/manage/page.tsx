"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import Map from "@/components/Map";
import { Empty, ErrorBox, Notice, Skeleton, useLoad } from "@/components/ui";
import { API, FLAG_TEXT, api, isAdmin, param, session, when } from "@/lib/api";

const TABS = [["review", "To confirm"], ["sync", "Sync from site"], ["import", "CSV upload"], ["zones", "Zones"], ["removed", "Deactivated"], ["quiz", "Quiz scores"], ["history", "Change history"], ["users", "Users"]];

function Review() {
  const { data, error, loading, reload } = useLoad("/review");
  const [err, setErr] = useState("");
  const ok = async (id: number) => { try { await api(`/mechanics/${id}`, { method: "PUT", json: { review_flags: [], confirm_duplicates: true } }); reload(); } catch (e: any) { setErr(e.message); } };
  if (loading) return <Skeleton />;
  return (
    <div className="flex flex-col gap-5">
      <ErrorBox text={error || err} />
      <div className="card"><h2>Rows to confirm ({data?.flagged.length || 0})</h2><p className="muted mb-3">The import found something odd in these rows. Check each one, fix it if needed, then mark it correct.</p>
        {!data?.flagged.length && <Empty text="Nothing to confirm." />}
        <div className="flex flex-col gap-2">{data?.flagged.map((m: any) => (
          <div key={m.id} className="rounded-xl border border-line p-3 flex gap-3 flex-wrap items-center">
            <div className="flex-1 min-w-[220px]"><Link className="font-bold hover:text-brand-deep" href={`/mechanic/?id=${m.id}`}>{m.name}</Link> <span className="chip">{m.zone}</span>{m.source_row && <span className="text-xs text-muted"> sheet row {m.source_row}</span>}
              <ul className="text-sm list-disc pl-5 text-amber-800">{m.review_flags.map((f: string) => <li key={f}>{FLAG_TEXT[f] || f}</li>)}</ul></div>
            <Link className="btn text-sm" href={`/mechanic/edit/?id=${m.id}`}>Fix</Link><button className="btn btn-primary text-sm" onClick={() => ok(m.id)}>It is correct</button>
          </div>))}</div>
      </div>
      <div className="card"><h2>Possible duplicates ({data?.duplicates.length || 0})</h2><p className="muted mb-3">These share a name, phone or Maps name. If they are the same person, deactivate the extra record. If one mechanic covers two zones, keep both.</p>
        {!data?.duplicates.length && <Empty text="No possible duplicates." />}
        <div className="flex flex-col gap-2">{data?.duplicates.map((d: any, i: number) => (
          <div key={i} className="rounded-xl border border-line p-3"><div className="chip chip-warn mb-2">Same {d.same}</div>
            <div className="grid gap-2 sm:grid-cols-2">{d.mechanics.map((m: any) => <Link key={m.id} href={`/mechanic/?id=${m.id}`} className="rounded-lg border border-line p-2 text-sm hover:border-brand-orange"><b>{m.name}</b> <span className="chip">{m.zone}</span><div className="text-muted">Maps: {m.gmaps_name || "none"} · {m.locality || "no area"} · {m.working_hours || "no hours"}</div></Link>)}</div></div>))}</div>
      </div>
    </div>
  );
}

function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (commit: boolean) => {
    if (!file) return; setBusy(true); setErr("");
    const body = new FormData(); body.append("file", file);
    try { setRes(await api(`/import?commit=${commit}`, { method: "POST", body })); } catch (e: any) { setErr(e.message); setRes(null); }
    setBusy(false);
  };
  const download = async () => {
    const r = await fetch(API + "/export", { headers: { Authorization: "Bearer " + session().token } });
    const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = url; a.download = "mechanics.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="card flex flex-col gap-3"><h2>Upload a mechanics CSV</h2>
        <ol className="list-decimal pl-5 text-sm flex flex-col gap-1">
          <li><b>First time:</b> in Google Sheets open the ZONE_WISE_MECHANIC_DIRECTORY tab, then File, Download, Comma-separated values. Upload that file here.</li>
          <li><b>Later updates:</b> press Download current list, edit it in Excel (add phones, WhatsApp groups, Maps links), save as CSV, and upload it. Keep the ID column unchanged so rows match.</li>
          <li>You always see a preview first. Nothing is saved until you press Confirm.</li>
        </ol>
        <div className="flex gap-2 flex-wrap items-center"><input aria-label="CSV file" type="file" accept=".csv,text/csv" className="input !w-auto" onChange={(e) => { setFile(e.target.files?.[0] || null); setRes(null); }} /><button className="btn btn-primary" disabled={!file || busy} onClick={() => send(false)}>{busy ? "Reading…" : "Preview"}</button><button className="btn ml-auto" onClick={download}>Download current list</button></div>
        <ErrorBox text={err} />
      </div>
      {res && (
        <div className="card flex flex-col gap-3">
          <h2>{res.committed ? "Import saved" : "Preview: nothing saved yet"}</h2>
          <div className="flex gap-2 flex-wrap"><span className="chip chip-ok">{res.counts.new} new</span><span className="chip">{res.counts.updates} updates</span><span className="chip">{res.counts.unchanged} unchanged</span><span className={`chip ${res.counts.problems ? "chip-alert" : ""}`}>{res.counts.problems} problems</span>{res.new_zones.length > 0 && <span className="chip chip-warn">New zones: {res.new_zones.join(", ")}</span>}</div>
          {res.problems.length > 0 && <div><h3>Problems (these rows are skipped)</h3><ul className="text-sm list-disc pl-5">{res.problems.map((p: any, i: number) => <li key={i}>Row {p.row} {p.name}: {p.problem}</li>)}</ul></div>}
          {res.updates.length > 0 && <div><h3>Updates</h3><div className="max-h-64 overflow-auto text-sm">{res.updates.map((u: any, i: number) => <div key={i} className="border-t border-line py-1"><b>{u.name}</b> {Object.entries(u.changes).map(([k, v]: any) => <span key={k} className="chip mr-1">{k}: {String(v[0] || "empty")} → {String(v[1])}</span>)}</div>)}</div></div>}
          {res.new.length > 0 && <div><h3>New mechanics</h3><div className="max-h-64 overflow-auto text-sm">{res.new.map((n: any, i: number) => <div key={i} className="border-t border-line py-1">Row {n.row}: <b>{n.name}</b> <span className="chip">{n.zone}</span> {n.flags.map((f: string) => <span key={f} className="chip chip-warn mr-1">{FLAG_TEXT[f] || f}</span>)}</div>)}</div></div>}
          {!res.committed && (res.counts.new + res.counts.updates > 0) && <button className="btn btn-primary self-start" disabled={busy} onClick={() => send(true)}>Confirm and save {res.counts.new + res.counts.updates} rows</button>}
          {!res.committed && res.counts.new + res.counts.updates === 0 && <Notice text="Nothing to save. The file matches what is already in the dashboard." />}
          {res.committed && <Notice text="Saved. Check the To confirm tab for any rows that need a look." />}
        </div>
      )}
    </div>
  );
}

function SiteSync() {
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (commit: boolean) => { setBusy(true); setErr(""); try { setRes(await api(`/sync?commit=${commit}`, { method: "POST" })); } catch (e: any) { setErr(e.message); } setBusy(false); };
  const noZone = res?.skipped["outside Delhi NCR or no zone code"] || [];
  const todo = res ? res.counts.new + res.counts.linked + res.counts.updates + res.counts.deactivate : 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="card flex flex-col gap-3"><h2>Sync from instantmechanic.online</h2>
        <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
          <li>Reads the mechanic list from your company site: name, phone, zone, Google name, photo and shared location.</li>
          <li>A mechanic already in the dashboard is <b>linked</b>, not added twice. The site only fills his blank fields; it never overwrites what you typed here.</li>
          <li>Mechanics deleted on the site are deactivated here. Test records and records without a Delhi NCR zone code are skipped.</li>
          <li>After the first sync, shared locations refresh by themselves whenever the map or mechanic list is opened.</li>
        </ul>
        <div><button className="btn btn-primary" disabled={busy} onClick={() => run(false)}>{busy ? "Reading the site…" : "Preview sync"}</button></div>
        <ErrorBox text={err} />
      </div>
      {res && (
        <div className="card flex flex-col gap-3">
          <h2>{res.committed ? "Sync saved" : "Preview: nothing saved yet"}</h2>
          <div className="flex gap-2 flex-wrap"><span className="chip">{res.site_records} records on the site</span><span className="chip chip-ok">{res.counts.new} new</span><span className="chip chip-ok">{res.counts.linked} linked to existing</span><span className="chip">{res.counts.updates} updates</span><span className={`chip ${res.counts.deactivate ? "chip-alert" : ""}`}>{res.counts.deactivate} to deactivate</span><span className="chip">{res.counts.unchanged} unchanged</span><span className="chip">{res.with_shared_location} share a location</span></div>
          <div className="flex gap-2 flex-wrap"><span className="chip">{res.skipped["deleted on the site"]} deleted on the site, skipped</span><span className="chip">{res.skipped["test record"]} test records, skipped</span><span className={`chip ${noZone.length ? "chip-warn" : ""}`}>{noZone.length} without an NCR zone code, skipped</span>{res.new_zones.length > 0 && <span className="chip chip-warn">New zones: {res.new_zones.join(", ")}</span>}</div>
          {res.linked.length > 0 && <div><h3>Linked to mechanics already in the dashboard (check these)</h3><div className="max-h-60 overflow-auto text-sm">{res.linked.map((l: any, i: number) => <div key={i} className="border-t border-line py-1">Site #{l.site_id} <b>{l.site_name}</b> → dashboard <b>{l.dashboard_name}</b> <span className="chip">{l.zone}</span> <span className="chip">matched by {l.matched_by}</span></div>)}</div></div>}
          {res.new.length > 0 && <div><h3>New mechanics</h3><div className="max-h-60 overflow-auto text-sm">{res.new.map((n: any, i: number) => <div key={i} className="border-t border-line py-1">Site #{n.site_id} <b>{n.name}</b> <span className="chip">{n.zone}</span>{n.gmaps_name && <span className="chip ml-1">Maps: {n.gmaps_name}</span>}</div>)}</div></div>}
          {res.updates.length > 0 && <div><h3>Updates</h3><div className="max-h-48 overflow-auto text-sm">{res.updates.map((u: any, i: number) => <div key={i} className="border-t border-line py-1"><b>{u.name}</b> {Object.entries(u.changes).map(([k, v]: any) => <span key={k} className="chip mr-1">{k}: {String(v[0] || "empty")} → {String(v[1])}</span>)}</div>)}</div></div>}
          {res.deactivate.length > 0 && <div><h3>Will be deactivated (deleted on the site)</h3><div className="text-sm">{res.deactivate.map((d: any, i: number) => <span key={i} className="chip chip-alert mr-1">{d.name}</span>)}</div></div>}
          {noZone.length > 0 && <div><h3>Skipped: no Delhi NCR zone code</h3><p className="muted">Give these a zone code (like G-4) on the site, then sync again. Or add them by hand.</p><div className="max-h-48 overflow-auto text-sm">{noZone.map((n: any, i: number) => <div key={i} className="border-t border-line py-1">Site #{n.site_id} <b>{n.name}</b> <span className="text-muted">location: {n.location || "empty"}{n.city ? `, ${n.city}` : ""}</span></div>)}</div></div>}
          {!res.committed && todo > 0 && <button className="btn btn-primary self-start" disabled={busy} onClick={() => run(true)}>Confirm and save</button>}
          {!res.committed && todo === 0 && <Notice text="Nothing to save. The dashboard already matches the site." />}
          {res.committed && <Notice text="Saved. Open Live Map to see shared locations, and Manage > To confirm for possible duplicates." />}
        </div>
      )}
    </div>
  );
}

function ZonesTab() {
  const zones = useLoad("/zones");
  const [code, setCode] = useState("");
  const [v, setV] = useState<any>(null);
  const [mode, setMode] = useState("");          // "" | "centre" | "draw"
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [newCode, setNewCode] = useState("");
  useEffect(() => setCode(param("zone")), []);
  useEffect(() => { const z = (zones.data || []).find((x: any) => x.code === code); setV(z ? { ...z } : null); setMode(""); }, [code, zones.data]);
  const save = async () => { setErr(""); setMsg(""); try { await api(`/zones/${v.id}`, { method: "PUT", json: { name: v.name, localities: v.localities, notes: v.notes, lat: v.lat, lng: v.lng, polygon: v.polygon } }); setMsg(`Zone ${v.code} saved.`); zones.reload(); } catch (e: any) { setErr(e.message); } };
  const create = async (e: any) => { e.preventDefault(); setErr(""); try { const z = await api("/zones", { json: { code: newCode } }); setNewCode(""); zones.reload(); setCode(z.code); setMsg(`Zone ${z.code} created. Set its centre on the map.`); } catch (x: any) { setErr(x.message); } };
  const click = (lat: number, lng: number) => { if (mode === "centre") setV({ ...v, lat, lng }); if (mode === "draw") setV({ ...v, polygon: [...(v.polygon || []), [lat, lng]] }); };
  const others = (zones.data || []).filter((z: any) => z.code !== code);
  return (
    <div className="flex flex-col gap-4">
      <ErrorBox text={err || zones.error} /><Notice text={msg} />
      <div className="card !p-3 flex gap-2 flex-wrap items-center">
        <select aria-label="Zone to edit" className="input !w-auto" value={code} onChange={(e) => setCode(e.target.value)}><option value="">Choose a zone to edit</option>{(zones.data || []).map((z: any) => <option key={z.code} value={z.code}>{z.code} · {z.name || "unnamed"} {z.polygon?.length ? "" : "(no boundary)"}</option>)}</select>
        <form onSubmit={create} className="flex gap-2 ml-auto"><input aria-label="New zone code" className="input !w-36" placeholder="New code, e.g. G-10" value={newCode} onChange={(e) => setNewCode(e.target.value)} /><button className="btn text-sm" disabled={!newCode}>Create zone</button></form>
      </div>
      {!v && <Empty text="Choose a zone. You can rename it, list its areas, move its centre, and draw its boundary on the map." />}
      {v && (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="card flex flex-col gap-3">
            <h2>{v.code} <span className="muted font-sans font-normal">{v.region}</span></h2>
            <div><label className="label" htmlFor="z-name">Zone name</label><input id="z-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="z-loc">Areas covered (separate with commas)</label><textarea id="z-loc" rows={3} className="input" value={v.localities} onChange={(e) => setV({ ...v, localities: e.target.value })} /></div>
            <div><label className="label" htmlFor="z-notes">Notes</label><input id="z-notes" className="input" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
            <div className="rounded-xl border border-line p-3 flex flex-col gap-2"><b>Centre point</b><p className="muted">{v.lat != null ? `${v.lat.toFixed(4)}, ${v.lng.toFixed(4)}` : "Not set"}</p><button className={`btn text-sm ${mode === "centre" ? "btn-primary" : ""}`} onClick={() => setMode(mode === "centre" ? "" : "centre")}>{mode === "centre" ? "Click the map to place the centre" : "Move centre"}</button></div>
            <div className="rounded-xl border border-line p-3 flex flex-col gap-2"><b>Boundary</b><p className="muted">{v.polygon?.length ? `${v.polygon.length} points` : "Not drawn. Lookups use the nearest centre until you draw it."}</p>
              <div className="flex gap-2 flex-wrap"><button className={`btn text-sm ${mode === "draw" ? "btn-primary" : ""}`} onClick={() => setMode(mode === "draw" ? "" : "draw")}>{mode === "draw" ? "Clicking adds points" : "Draw boundary"}</button><button className="btn text-sm" disabled={!v.polygon?.length} onClick={() => setV({ ...v, polygon: v.polygon.slice(0, -1) })}>Undo point</button><button className="btn btn-danger text-sm" disabled={!v.polygon?.length} onClick={() => setV({ ...v, polygon: [] })}>Clear</button></div>
              <p className="muted">Open your zone map image beside this screen and click around the zone's edge, one corner at a time. At least 3 points.</p></div>
            <button className="btn btn-primary" onClick={save}>Save zone</button>
          </div>
          <div className="card !p-2"><Map zones={[...others, { ...v, polygon: [] }]} selectedZone={v.code} draw={v.polygon || []} onPick={click} focus={v.lat != null ? [v.lat, v.lng, 12] : null} height="620px" /></div>
        </div>
      )}
    </div>
  );
}

function Removed() {
  const { data, error, loading, reload } = useLoad("/mechanics?active=false");
  const restore = async (id: number) => { await api(`/mechanics/${id}/active`, { json: { active: true } }); reload(); };
  if (loading) return <Skeleton />;
  return (<div className="card"><h2 className="mb-3">Deactivated mechanics ({data?.length || 0})</h2><ErrorBox text={error} />{!data?.length && <Empty text="No one is deactivated." />}
    <div className="flex flex-col gap-2">{data?.map((m: any) => <div key={m.id} className="rounded-xl border border-line p-3 flex gap-3 items-center flex-wrap"><div className="flex-1"><Link className="font-bold" href={`/mechanic/?id=${m.id}`}>{m.name}</Link> <span className="chip">{m.zone}</span><div className="muted">Updated {when(m.updated_at)}</div></div><button className="btn btn-primary text-sm" onClick={() => restore(m.id)}>Restore</button></div>)}</div></div>);
}

function QuizScores() {
  const { data, error, loading } = useLoad("/quiz/results");
  if (loading) return <Skeleton />;
  return (
    <div className="flex flex-col gap-5"><ErrorBox text={error} />
      <div className="card !p-0 overflow-auto"><h2 className="p-5 pb-2">Progress by agent</h2>{!data?.people.length && <div className="p-5 pt-0"><Empty text="No one has finished a quiz yet." /></div>}
        {data?.people.length > 0 && <table className="w-full text-sm"><thead><tr>{["Agent", "Attempts", "Best score", "Cities practised", "Last attempt"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{data.people.map((p: any) => <tr key={p.agent_name}><td className="td font-semibold">{p.agent_name}</td><td className="td tabular-nums">{p.attempts}</td><td className="td"><span className={`chip ${p.best >= 80 ? "chip-ok" : p.best >= 50 ? "chip-warn" : "chip-alert"}`}>{p.best}%</span></td><td className="td">{p.cities.join(", ")}</td><td className="td">{when(p.last)}</td></tr>)}</tbody></table>}</div>
      <div className="card !p-0 overflow-auto"><h2 className="p-5 pb-2">Recent attempts</h2><table className="w-full text-sm"><thead><tr>{["When", "Agent", "City", "Score"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{data?.attempts.map((a: any, i: number) => <tr key={i}><td className="td">{when(a.at)}</td><td className="td">{a.agent_name}</td><td className="td">{a.city}</td><td className="td tabular-nums">{a.score} of {a.total}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function History() {
  const { data, error, loading } = useLoad("/audit?limit=300");
  if (loading) return <Skeleton />;
  const detail = (d: string) => { try { const o = JSON.parse(d); return Object.entries(o).map(([k, v]: any) => Array.isArray(v) && v.length === 2 ? `${k}: ${JSON.stringify(v[0])} → ${JSON.stringify(v[1])}` : `${k}: ${JSON.stringify(v)}`).join("; "); } catch { return d; } };
  return (<div className="card !p-0 overflow-auto max-h-[75vh]"><ErrorBox text={error} />{!data?.length && <div className="p-5"><Empty text="No changes recorded yet." /></div>}
    {data?.length > 0 && <table className="w-full text-sm min-w-[760px]"><thead><tr>{["When", "Who", "Action", "On", "Details"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{data.map((r: any) => <tr key={r.id}><td className="td whitespace-nowrap">{when(r.at)}</td><td className="td">{r.user}</td><td className="td"><span className="chip">{r.action.replace(/_/g, " ")}</span></td><td className="td">{r.entity.replace(/_/g, " ")}: {r.label}</td><td className="td text-muted break-words max-w-md">{detail(r.detail)}</td></tr>)}</tbody></table>}</div>);
}

function Users() {
  const { data, error, loading, reload } = useLoad("/users");
  const empty = { login: "", name: "", password: "", role: "agent" };
  const [form, setForm] = useState<any>(empty);
  const [reset, setReset] = useState<any>(null);       // {id, login, password}
  const [remove, setRemove] = useState<any>(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const run = async (fn: () => Promise<any>, done: string) => { setErr(""); setMsg(""); try { await fn(); setMsg(done); reload(); return true; } catch (e: any) { setErr(e.message); return false; } };
  const add = async (e: any) => { e.preventDefault(); if (await run(() => api("/users", { json: form }), `Login ${form.login} added as ${form.role === "admin" ? "Admin" : "Agent"}. Share the login and password with them privately.`)) setForm(empty); };
  if (loading) return <Skeleton />;
  return (
    <div className="flex flex-col gap-5">
      <ErrorBox text={err || error} /><Notice text={msg} />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="card !p-0 overflow-auto">
          <h2 className="p-5 pb-2">Logins ({data?.length || 0})</h2>
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr>{["Name", "Email or username", "Role", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{data?.map((u: any) => (
              <tr key={u.id}>
                <td className="td font-semibold">{u.name || "—"}{u.is_me && <span className="chip ml-2">You</span>}</td>
                <td className="td">{u.login}</td>
                <td className="td"><select aria-label={`Role of ${u.login}`} className="input !w-auto !py-1" value={u.role} disabled={u.is_me} onChange={(e) => run(() => api(`/users/${u.id}`, { method: "PUT", json: { role: e.target.value } }), `${u.login} is now ${e.target.value === "admin" ? "an Admin" : "an Agent"}.`)}><option value="agent">Agent</option><option value="admin">Admin</option></select></td>
                <td className="td whitespace-nowrap"><button className="btn text-xs" onClick={() => setReset({ id: u.id, login: u.login, password: "" })}>Reset password</button>{!u.is_me && <button className="btn btn-danger text-xs ml-2" onClick={() => setRemove(u)}>Remove</button>}</td>
              </tr>))}</tbody>
          </table>
          {reset && <form className="m-5 rounded-xl border border-brand-orange p-3 flex gap-2 flex-wrap items-end" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/users/${reset.id}`, { method: "PUT", json: { password: reset.password } }), `Password reset for ${reset.login}. They are signed out everywhere.`)) setReset(null); }}>
            <div className="flex-1 min-w-[200px]"><label className="label" htmlFor="rp">New password for {reset.login}</label><input id="rp" type="password" minLength={8} required autoComplete="new-password" className="input" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} /></div>
            <button className="btn btn-primary">Save password</button><button type="button" className="btn" onClick={() => setReset(null)}>Cancel</button></form>}
          {remove && <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-sm">Remove the login <b>{remove.login}</b>? They will be signed out and cannot sign in again.</p><div className="flex gap-2 mt-2"><button className="btn btn-danger text-sm" onClick={async () => { if (await run(() => api(`/users/${remove.id}`, { method: "DELETE" }), `Login ${remove.login} removed.`)) setRemove(null); }}>Yes, remove</button><button className="btn text-sm" onClick={() => setRemove(null)}>Cancel</button></div></div>}
        </div>
        <form onSubmit={add} className="card flex flex-col gap-3 self-start"><h2>Add a login</h2>
          <div><label className="label" htmlFor="u-name">Name</label><input id="u-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="For example: Ravi Kumar" /></div>
          <div><label className="label" htmlFor="u-login">Email or username *</label><input id="u-login" required className="input" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="ravi@instantmechanic.com or ravi.k" autoComplete="off" /></div>
          <div><label className="label" htmlFor="u-pw">Password * (at least 8 characters)</label><input id="u-pw" type="password" required minLength={8} className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></div>
          <div><span className="label">Role</span><div className="flex gap-2">{[["agent", "Agent"], ["admin", "Admin"]].map(([k, l]) => <button type="button" key={k} aria-pressed={form.role === k} className={`pill ${form.role === k ? "pill-on" : ""}`} onClick={() => setForm({ ...form, role: k })}>{l}</button>)}</div>
            <p className="muted mt-1">{form.role === "admin" ? "Admin can add, edit and remove mechanics, users and data." : "Agent can view the map, mechanics, groups and training. Cannot change data."}</p></div>
          <button className="btn btn-primary self-start">Add login</button>
        </form>
      </div>
    </div>
  );
}

export default function Manage() {
  const [tab, setTab] = useState("review");
  const [ready, setReady] = useState(false);
  useEffect(() => { setTab(param("tab") || "review"); setReady(true); }, []);
  if (ready && !isAdmin()) return <Shell title="Manage"><ErrorBox text="Only the Admin login can open this page." /></Shell>;
  return (
    <Shell title="Manage" wide>
      <div className="flex gap-2 flex-wrap">{TABS.map(([k, label]) => <button key={k} className={`pill ${tab === k ? "pill-on" : ""}`} onClick={() => setTab(k)}>{label}</button>)}<Link className="btn btn-primary text-sm ml-auto" href="/mechanic/edit/">Add mechanic</Link></div>
      {ready && tab === "review" && <Review />}{tab === "sync" && <SiteSync />}{tab === "import" && <Import />}{tab === "zones" && <ZonesTab />}{tab === "removed" && <Removed />}{tab === "quiz" && <QuizScores />}{tab === "history" && <History />}{tab === "users" && <Users />}
    </Shell>
  );
}
