"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Empty, ErrorBox, MechanicCard, Notice, Skeleton, useLoad } from "@/components/ui";
import { CITIES, api, isAdmin, param } from "@/lib/api";

export default function Groups() {
  const list = useLoad("/groups");
  const [sel, setSel] = useState("");
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const detail = useLoad(sel ? `/groups/${sel}` : null);
  const [form, setForm] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const admin = isAdmin();
  useEffect(() => setSel(param("id")), []);
  const rows = (list.data || []).filter((g: any) => (!city || g.city === city) && (!q || (g.name + g.zones.join(" ")).toLowerCase().includes(q.toLowerCase())));
  const save = async (e: any) => { e.preventDefault(); setErr(""); try { const g = await api("/groups", { json: form }); setForm(null); setMsg("Group saved."); list.reload(); setSel(String(g.id)); detail.reload(); } catch (x: any) { setErr(x.message); } };
  const del = async () => { try { await api(`/groups/${sel}`, { method: "DELETE" }); setSel(""); setConfirmDel(false); setMsg("Group deleted. The mechanics were not changed."); list.reload(); } catch (x: any) { setErr(x.message); } };

  return (
    <Shell title="WhatsApp Groups">
      <ErrorBox text={err || list.error} /><Notice text={msg} />
      <div className="card !p-3 flex gap-2 flex-wrap items-center">
        <input aria-label="Search groups" className="input !w-60 !rounded-full" placeholder="Group name or zone" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="City" className="input !w-auto" value={city} onChange={(e) => setCity(e.target.value)}><option value="">All cities</option>{CITIES.map((c) => <option key={c}>{c}</option>)}</select>
        {admin && <button className="btn btn-primary ml-auto text-sm" onClick={() => setForm({ name: "", link: "", city: "", notes: "" })}>Add group</button>}
      </div>
      {form && (
        <form onSubmit={save} className="card grid gap-3 md:grid-cols-2 border-brand-orange">
          <h2 className="md:col-span-2">{form.id ? "Edit group" : "Add group"}</h2>
          <div><label className="label" htmlFor="g-name">Group name, exactly as in WhatsApp *</label><input id="g-name" required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="g-city">City</label><select id="g-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}><option value="">Not set</option>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label" htmlFor="g-link">Invite link (optional)</label><input id="g-link" className="input" placeholder="https://chat.whatsapp.com/…" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></div>
          <div><label className="label" htmlFor="g-notes">Notes</label><input id="g-notes" className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="md:col-span-2 flex gap-2"><button className="btn btn-primary">Save group</button><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      {list.loading && <Skeleton />}
      {list.data && !list.data.length && <Empty text={admin ? "No WhatsApp groups yet. Add your first group, then link mechanics to it from each mechanic's Edit page or by CSV upload." : "No WhatsApp groups have been added yet."} />}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-2">
          {rows.map((g: any) => (
            <button key={g.id} onClick={() => { setSel(String(g.id)); setConfirmDel(false); }} className={`text-left rounded-xl border p-3 bg-white hover:border-brand-orange ${String(g.id) === sel ? "border-brand-orange bg-brand-tint" : "border-line"}`}>
              <div className="font-bold">{g.name}</div>
              <div className="muted">{g.city || "City not set"} · {g.members} mechanics</div>
              <div className="flex gap-1 flex-wrap mt-1">{g.zones.map((z: string) => <span key={z} className="chip">{z}</span>)}</div>
            </button>
          ))}
        </div>
        <div>
          {sel && detail.loading && <Skeleton />}
          {sel && detail.data && (
            <div className="flex flex-col gap-3">
              <div className="card"><div className="flex justify-between gap-2 flex-wrap"><h2>{detail.data.name}</h2><div className="flex gap-2">{detail.data.link && <a className="btn btn-primary text-sm" href={detail.data.link} target="_blank" rel="noreferrer">Open group</a>}{admin && <><button className="btn text-sm" onClick={() => setForm({ id: detail.data.id, name: detail.data.name, link: detail.data.link, city: detail.data.city, notes: detail.data.notes })}>Edit</button><button className="btn btn-danger text-sm" onClick={() => setConfirmDel(true)}>Delete</button></>}</div></div>
                <p className="muted">{detail.data.city || "City not set"} · zones: {detail.data.zones.join(", ") || "none yet"}</p>{detail.data.notes && <p className="text-sm mt-1">{detail.data.notes}</p>}
                {confirmDel && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3"><p className="text-sm">Delete this group? Its {detail.data.members} mechanics stay in the dashboard but lose this group name.</p><div className="flex gap-2 mt-2"><button className="btn btn-danger text-sm" onClick={del}>Yes, delete the group</button><button className="btn text-sm" onClick={() => setConfirmDel(false)}>Cancel</button></div></div>}
              </div>
              {detail.data.mechanics.map((m: any) => <MechanicCard key={m.id} m={m} />)}
              {!detail.data.mechanics.length && <Empty text="No mechanics are linked to this group yet." />}
            </div>
          )}
          {!sel && list.data?.length > 0 && <Empty text="Choose a group to see its mechanics." />}
        </div>
      </div>
    </Shell>
  );
}
