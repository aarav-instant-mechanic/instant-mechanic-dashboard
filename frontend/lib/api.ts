// All calls to the backend go through here. The address comes from NEXT_PUBLIC_API_URL.
export const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export function session() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("im-session") || "null"); } catch { return null; }
}
export function saveSession(s: any) { localStorage.setItem("im-session", JSON.stringify(s)); }
export function signOut() { localStorage.removeItem("im-session"); window.location.href = "/login/"; }
export const isAdmin = () => session()?.role === "admin";

export async function api(path: string, opts: any = {}) {
  const s = session();
  const headers: any = { ...(opts.headers || {}) };
  if (s?.token) headers.Authorization = "Bearer " + s.token;
  let body = opts.body;
  if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
  let res: Response;
  try {
    res = await fetch(API + path, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new Error("Cannot reach the server. If the site was idle it can take about a minute to wake up. Try again.");
  }
  if (res.status === 401 && !opts.public && !path.startsWith("/auth/login")) { signOut(); throw new Error("Please sign in again."); }
  if (opts.raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Try again.");
  return data;
}

export const param = (name: string) => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get(name) || "");

export function ago(iso?: string | null) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}
export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "");

export const CITIES = ["Delhi", "Gurugram", "Noida", "Greater Noida", "Ghaziabad", "Faridabad"];
export const DELHI_REGIONS = ["North Delhi", "South Delhi", "East Delhi", "West Delhi", "Central Delhi"];
export const CITY_CENTRES: Record<string, [number, number, number]> = {
  "": [28.58, 77.2, 10], Delhi: [28.63, 77.2, 11], Gurugram: [28.44, 77.03, 11], Noida: [28.57, 77.36, 12],
  "Greater Noida": [28.5, 77.48, 11], Ghaziabad: [28.665, 77.39, 12], Faridabad: [28.4, 77.31, 12],
  "North Delhi": [28.74, 77.15, 12], "South Delhi": [28.53, 77.22, 12], "East Delhi": [28.65, 77.295, 13],
  "West Delhi": [28.63, 77.08, 12], "Central Delhi": [28.66, 77.21, 13],
};
export const SERVICES = ["RSA", "RSA + Garage", "Garage", "Puncture only"];
export const FLAG_TEXT: Record<string, string> = {
  hours_were_a_date: "Hours showed a date in the sheet, saved as 24/7. Is that right?",
  hours_missing: "Working hours are missing",
  location_missing: "Location is missing",
  name_taken_from_maps_name: "No real name in the sheet, so the Maps name was used",
};
