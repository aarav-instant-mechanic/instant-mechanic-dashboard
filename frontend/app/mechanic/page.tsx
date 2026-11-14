"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import Map from "@/components/Map";
import { Avatar, Blank, ContactButtons, ErrorBox, Notice, PositionChip, Skeleton, useLoad } from "@/components/ui";
import { API, FLAG_TEXT, api, isAdmin, param, when } from "@/lib/api";

const Row = ({ k, children }: any) => (<><dt className="text-muted">{k}</dt><dd>{children}</dd></>);

export default function Profile() {
  const [id, setId] = useState("");
  useEffect(() => setId(param("id")), []);
  const { data: m, error, loading, reload } = useLoad(id ? `/mechanics/${id}` : null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const [reason, setReason] = useState("");
  const admin = isAdmin();
  const act = async (fn: () => Promise<any>, done: string) => { setErr(""); setMsg(""); try { await fn(); setMsg(done); reload(); } catch (e: any) { setErr(e.message); } };
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => setMsg("Copied.")).catch(() => setErr("Could not copy. Select the text and copy it yourself."));

  if (loading || !id) return <Shell title="Mechanic"><Skeleton rows={6} /></Shell>;
  if (!m) return <Shell title="Mechanic"><ErrorBox text={error || "Mechanic not found."} /></Shell>;
  const pos = m.position;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/share/?t=${m.track_token}` : "";

  return (
    <Shell title="Mechanic profile">
      <ErrorBox text={err} /><Notice text={msg} />
      {!m.active && <div className="rounded-xl border border-red-200 bg-red-50 text-alert px-4 py-3 font-medium">This mechanic is deactivated. Agents cannot see him.</div>}
      <div className="card flex gap-4 flex-wrap items-center">
        <Avatar m={m} size={72} />
        <div className="flex-1 min-w-[220px]">
          <h1>{m.name}</h1>
          <div className="flex gap-2 flex-wrap mt-1 items-center"><span className="chip">{m.code}</span>{m.site_id && <span className="chip">Site ID #{m.site_id}</span>}<Link className="chip" href={`/zones/?zone=${m.zone}`}>{m.zone} · {m.zone_name}</Link><span className="chip">{m.region}</span>{m.service_type && <span className="chip">{m.service_type}</span>}<PositionChip p={pos} /></div>
        </div>
        <div className="flex flex-col gap-2 items-end"><ContactButtons m={m} />{admin && <Link className="btn btn-primary text-sm" href={`/mechanic/edit/?id=${m.id}`}>Edit details</Link>}</div>
      </div>

      <div className="card">
        <h2 className="mb-1">Same person, three names</h2><p className="muted mb-3">Use this to match what you see on Google Maps with the WhatsApp group.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-line p-3"><div className="muted">Real name</div><div className="font-bold text-lg">{m.name}</div>{m.under_tx && <div className="text-sm">Under TX: {m.under_tx}</div>}</div>
          <div className="rounded-xl border border-line p-3"><div className="muted">Name on Google Maps</div><div className="font-bold text-lg"><Blank v={m.gmaps_name} /></div></div>
          <div className="rounded-xl border border-line p-3"><div className="muted">WhatsApp group</div><div className="font-bold text-lg"><Blank v={m.groups.map((g: any) => g.name).join(", ")} /></div></div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="card"><h2 className="mb-3">Details</h2>
          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-sm">
            <Row k="Phone"><Blank v={m.phone} /></Row><Row k="Alternate phone"><Blank v={m.alt_phone} /></Row>
            <Row k="Working hours"><Blank v={m.working_hours} /></Row><Row k="Weekly off"><Blank v={m.weekly_off} /></Row>
            <Row k="Service"><Blank v={m.service_type} /></Row><Row k="Garage"><Blank v={m.garage_name} /></Row>
            <Row k="City"><>{m.city}{m.region !== m.city ? `, ${m.region}` : ""}</></Row><Row k="Area"><Blank v={m.locality} /></Row>
            <Row k="Also covers"><Blank v={m.coverage_areas} /></Row><Row k="Service radius">{m.radius_km} km</Row>
            <Row k="Notes"><Blank v={m.notes} /></Row><Row k="Last updated">{when(m.updated_at)}{admin && m.updated_by ? ` by ${m.updated_by}` : ""}</Row>
          </dl>
          {admin && m.review_flags?.length > 0 && <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3"><div className="font-semibold text-amber-800 mb-1">To confirm</div><ul className="list-disc pl-5 text-sm">{m.review_flags.map((f: string) => <li key={f}>{FLAG_TEXT[f] || f}</li>)}</ul><button className="btn text-sm mt-2" onClick={() => act(() => api(`/mechanics/${m.id}`, { method: "PUT", json: { review_flags: [], confirm_duplicates: true } }), "Marked as confirmed.")}>These are correct</button></div>}
        </div>
        <div className="card flex flex-col gap-2"><h2>Location</h2>
          {pos.kind === "approximate" && <p className="text-sm rounded-xl bg-amber-50 border border-amber-200 p-2 text-amber-800">Approximate. His exact location is not set, so the marker sits near the centre of {m.zone}.</p>}
          {pos.lat != null ? <Map zones={[]} mechanics={[m]} radiusFor={m} focus={[pos.lat, pos.lng, ["exact", "live"].includes(pos.kind) ? 11 : 13]} height="320px" /> : <p className="muted">No location yet.</p>}
          {["exact", "live"].includes(pos.kind) && <p className="muted">The dashed circle is his {m.radius_km} km service radius.</p>}
          {pos.live && <p className="text-sm"><b>{pos.live.fresh ? "Sharing now" : "Last shared"}:</b> {m.live_place || "place name not available"} · {when(pos.live.at)}. This is where his phone was, not a fixed address.</p>}
        </div>
      </div>

      {admin && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="card flex flex-col gap-3"><h2>Live location sharing</h2>
            <p className="text-sm">Switch this on only after the mechanic agrees. His position is then saved whenever his phone sends it.</p>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="w-5 h-5 accent-[#FF7900]" checked={m.share_enabled} onChange={(e) => act(() => api(`/mechanics/${m.id}/sharing`, { json: { enabled: e.target.checked } }), e.target.checked ? "Sharing switched on." : "Sharing switched off and his last position cleared.")} />Mechanic has agreed to share his location</label>
            {m.share_enabled && <>
              <div className="text-sm"><b>Option 1: share link.</b> Send him this link. He opens it and taps Share.<div className="flex gap-2 mt-1"><input readOnly aria-label="Share link" className="input text-xs" value={shareUrl} /><button className="btn text-sm" onClick={() => copy(shareUrl)}>Copy</button></div></div>
              <div className="text-sm"><b>Option 2: Traccar Client app.</b> In the app settings enter:<div className="grid grid-cols-[120px_1fr_auto] gap-2 mt-1 items-center"><span className="text-muted">Server URL</span><code className="text-xs break-all">{API}/gps</code><button className="btn text-xs" onClick={() => copy(`${API}/gps`)}>Copy</button><span className="text-muted">Device identifier</span><code className="text-xs break-all">{m.track_token}</code><button className="btn text-xs" onClick={() => copy(m.track_token)}>Copy</button></div></div>
              <button className="btn text-sm self-start" onClick={() => act(() => api(`/mechanics/${m.id}/sharing`, { json: { new_token: true } }), "New tracking ID issued. The old link and ID no longer work.")}>Issue a new tracking ID</button>
            </>}
          </div>
          <div className="card flex flex-col gap-3"><h2>{m.active ? "Remove from the dashboard" : "Restore"}</h2>
            {m.active ? <>
              <p className="text-sm">Deactivating hides him from the map, lists and quizzes. His record is kept and can be restored.</p>
              {!confirmOff ? <button className="btn btn-danger self-start" onClick={() => setConfirmOff(true)}>Deactivate this mechanic</button> : <div className="flex flex-col gap-2">
                <label className="label" htmlFor="reason">Reason (optional)</label><input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: no longer works with us" />
                <div className="flex gap-2"><button className="btn btn-danger" onClick={() => act(() => api(`/mechanics/${m.id}/active`, { json: { active: false, reason } }), "Deactivated.").then(() => setConfirmOff(false))}>Yes, deactivate {m.name}</button><button className="btn" onClick={() => setConfirmOff(false)}>Cancel</button></div></div>}
            </> : <button className="btn btn-primary self-start" onClick={() => act(() => api(`/mechanics/${m.id}/active`, { json: { active: true } }), "Restored.")}>Restore this mechanic</button>}
          </div>
        </div>
      )}
    </Shell>
  );
}
