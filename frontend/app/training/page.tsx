"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Blank, Empty, ErrorBox, Skeleton, useLoad } from "@/components/ui";
import { CITIES, api, session } from "@/lib/api";

function Quiz() {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [count, setCount] = useState(10);
  const [qs, setQs] = useState<any[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { try { setName(localStorage.getItem("im-agent-name") || session()?.name || ""); } catch {} }, []);

  const start = async (e: any) => {
    e.preventDefault(); setErr("");
    if (!name.trim()) { setErr("Type your name so your score is saved under it."); return; }
    try { localStorage.setItem("im-agent-name", name.trim()); } catch {}
    try {
      const r = await api(`/quiz?count=${count}&city=${encodeURIComponent(city)}`);
      if (!r.questions.length) { setErr("There is not enough data to make a quiz for this city yet."); return; }
      setQs(r.questions); setI(0); setScore(0); setWrong([]); setPicked(null); setSaved(false);
    } catch (x: any) { setErr(x.message); }
  };
  const answer = (o: string) => { if (picked) return; setPicked(o); if (o === qs![i].answer) setScore((s) => s + 1); else setWrong((w) => [...w, { ...qs![i], chosen: o }]); };
  const next = async () => {
    if (i + 1 < qs!.length) { setI(i + 1); setPicked(null); return; }
    setI(qs!.length);
    try { await api("/quiz/result", { json: { agent_name: name.trim(), city: city || "All", score, total: qs!.length } }); setSaved(true); } catch (x: any) { setErr("Your score could not be saved: " + x.message); }
  };

  if (!qs) return (
    <form onSubmit={start} className="card flex flex-col gap-4 max-w-xl">
      <h2>Start a quiz</h2><p className="muted">Questions are made from the current zones and mechanics, so they change as the data changes.</p>
      <div><label className="label" htmlFor="agent">Your name</label><input id="agent" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name and surname" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="qcity">City</label><select id="qcity" className="input" value={city} onChange={(e) => setCity(e.target.value)}><option value="">All cities</option>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label" htmlFor="qcount">Questions</label><select id="qcount" className="input" value={count} onChange={(e) => setCount(+e.target.value)}>{[5, 10, 15, 20].map((n) => <option key={n}>{n}</option>)}</select></div>
      </div>
      <ErrorBox text={err} /><button className="btn btn-primary self-start">Start quiz</button>
    </form>
  );
  if (i >= qs.length) {
    const pct = Math.round((100 * score) / qs.length);
    return (
      <div className="card flex flex-col gap-3 max-w-2xl">
        <h2>{name}, you scored {score} of {qs.length} ({pct}%)</h2>
        <ErrorBox text={err} />{saved && <p className="chip chip-ok self-start">Score saved</p>}
        {wrong.length > 0 && <><h3>Review these</h3>{wrong.map((w, k) => <div key={k} className="rounded-xl border border-line p-3 text-sm"><div className="font-semibold">{w.prompt}</div><div className="text-alert">You chose: {w.chosen}</div><div className="text-ok">Correct: {w.answer}</div><div className="muted">{w.explain}</div></div>)}</>}
        <button className="btn btn-primary self-start" onClick={() => setQs(null)}>Take another quiz</button>
      </div>
    );
  }
  const q = qs[i];
  return (
    <div className="card flex flex-col gap-3 max-w-2xl">
      <div className="flex justify-between muted"><span>Question {i + 1} of {qs.length}</span><span>Score {score}</span></div>
      <div className="h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-brand-orange" style={{ width: `${(i / qs.length) * 100}%` }} /></div>
      <h2>{q.prompt}</h2>
      <div className="grid gap-2">{q.options.map((o: string) => {
        const state = !picked ? "" : o === q.answer ? "border-green-300 bg-okbg" : o === picked ? "border-red-300 bg-red-50" : "opacity-60";
        return <button key={o} disabled={!!picked} onClick={() => answer(o)} className={`text-left rounded-xl border border-line px-4 py-3 font-medium hover:border-brand-orange disabled:cursor-default ${state}`}>{o}{picked && o === q.answer ? "  ✓" : ""}</button>;
      })}</div>
      {picked && <div className="rounded-xl bg-canvas border border-line p-3 text-sm" role="status"><b>{picked === q.answer ? "Correct." : "Not quite."}</b> {q.explain}</div>}
      {picked && <button className="btn btn-primary self-start" onClick={next}>{i + 1 < qs.length ? "Next question" : "See my score"}</button>}
    </div>
  );
}

function Lessons() {
  const zones = useLoad("/zones");
  const [city, setCity] = useState("Gurugram");
  const mechs = useLoad(`/mechanics?city=${encodeURIComponent(city)}`);
  const zs = (zones.data || []).filter((z: any) => z.city === city);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap items-center no-print">{CITIES.map((c) => <button key={c} className={`pill ${city === c ? "pill-on" : ""}`} onClick={() => setCity(c)}>{c}</button>)}<button className="btn text-sm ml-auto" onClick={() => window.print()}>Print this city sheet</button></div>
      <ErrorBox text={zones.error || mechs.error} />
      {(zones.loading || mechs.loading) && <Skeleton />}
      <div className="card"><h2>{city}: {zs.length} zones, {(mechs.data || []).length} mechanics</h2><p className="muted">Read each zone, then test yourself with the quiz.</p></div>
      {zs.map((z: any) => {
        const ms = (mechs.data || []).filter((m: any) => m.zone === z.code);
        return (
          <div key={z.code} className="card">
            <div className="flex justify-between gap-2 flex-wrap"><h3 className="!text-lg">{z.code} · {z.name || "Area not named yet"}</h3><span className={`chip ${ms.length ? "" : "chip-alert"}`}>{ms.length ? `${ms.length} mechanics` : "No mechanics: coverage gap"}</span></div>
            {city === "Delhi" && <div className="muted">{z.region}</div>}
            {ms.length > 0 && (
              <div className="overflow-x-auto mt-2"><table className="w-full text-sm min-w-[640px]">
                <thead><tr>{["Real name", "Name on Google Maps", "WhatsApp group", "Area", "Hours", "Service"].map((h) => <th key={h} className="th !static">{h}</th>)}</tr></thead>
                <tbody>{ms.map((m: any) => <tr key={m.id}><td className="td font-semibold">{m.name}</td><td className="td"><Blank v={m.gmaps_name} /></td><td className="td"><Blank v={m.groups.map((g: any) => g.name).join(", ")} /></td><td className="td"><Blank v={m.locality} /></td><td className="td whitespace-nowrap"><Blank v={m.working_hours} /></td><td className="td"><Blank v={m.service_type} /></td></tr>)}</tbody>
              </table></div>
            )}
          </div>
        );
      })}
      {zones.data && !zs.length && <Empty text="No zones in this city." />}
    </div>
  );
}

export default function Training() {
  const [tab, setTab] = useState("lessons");
  return (
    <Shell title="Training">
      <div className="flex gap-2 no-print"><button className={`pill ${tab === "lessons" ? "pill-on" : ""}`} onClick={() => setTab("lessons")}>Zone lessons</button><button className={`pill ${tab === "quiz" ? "pill-on" : ""}`} onClick={() => setTab("quiz")}>Quiz</button></div>
      {tab === "lessons" ? <Lessons /> : <Quiz />}
    </Shell>
  );
}
