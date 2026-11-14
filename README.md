# Instant Mechanic Training Dashboard

A map, directory and training tool for the Instant Mechanic agent team: cities, zones, mechanics, Google Maps names,
WhatsApp groups, exact and live locations, and quizzes. No bookings or dispatch.

- **frontend/** Next.js (React, TypeScript, Tailwind CSS, Leaflet with OpenStreetMap). Builds to plain static files.
- **backend/** Python FastAPI with SQLAlchemy. Works with a local file database or with Neon (PostgreSQL).
- **data/** where you keep your own `mechanics.csv`. It is never pushed to GitHub.

Two logins only: a shared **Agent** login (view and training) and an **Admin** login (add, edit, remove).

---

## 1. Run it on your PC (Windows PowerShell)

You need Git, Node.js LTS and Python 3.12 or newer. See the Setup page of the roadmap.

**Step 1. Settings file.** In VS Code, copy `backend/.env.example` to `backend/.env` and fill in:

- `SECRET_KEY`: run `python -c "import secrets; print(secrets.token_urlsafe(48))"` and paste the result.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AGENT_EMAIL`, `AGENT_PASSWORD`: choose them. Passwords of 8 characters or more.
- `DATABASE_URL`: leave empty to try things with a local file database, or paste your Neon connection string.

**Step 2. Backend.** VS Code Terminal 1:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

It is running when you see `Uvicorn running on http://127.0.0.1:8000`. The zones and the two logins are created
automatically on the first start.

**Step 3. Frontend.** VS Code Terminal 2:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and sign in with the Admin login.

**Step 4. Load your mechanics.** In Google Sheets open the `ZONE_WISE_MECHANIC_DIRECTORY` tab, then
File > Download > Comma-separated values. In the dashboard go to **Manage > CSV upload**, choose the file, press
**Preview**, check the numbers, then **Confirm**. Then open **Manage > To confirm** and go through the list.

The same can be done from the terminal (save the file as `data\mechanics.csv` first):

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.scripts.import_mechanics ..\data\mechanics.csv --preview
python -m app.scripts.import_mechanics ..\data\mechanics.csv --commit
```

**Next time** you only need: Terminal 1 `cd backend; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload`
and Terminal 2 `cd frontend; npm run dev`.

## 2. Run the tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

The tests use a temporary database with made-up test names. Your real data is not touched.

## 3. Push to GitHub

```powershell
git add .
git commit -m "Instant Mechanic training dashboard"
git push
```

`.gitignore` keeps `.env`, your mechanics CSV and the local database out of GitHub. Keep the repository **private**.

## 4. Put it online for free

| Part | Where | Notes |
|---|---|---|
| Database | Neon free plan | Create a project and copy its connection string |
| Backend | Render > New > Web Service | Root directory `backend` |
| Frontend | Render > New > Static Site | Root directory `frontend` |

**Backend service on Render**

- Build command: `pip install -r requirements.txt`
- Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment variables: `DATABASE_URL`, `SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AGENT_EMAIL`,
  `AGENT_PASSWORD`, `FRONTEND_URL` (the static site address, added after the next step), `PYTHON_VERSION` = `3.12.7`

**Frontend static site on Render**

- Build command: `npm install && npm run build`
- Publish directory: `out`
- Environment variable: `NEXT_PUBLIC_API_URL` = the backend address Render gave you (no slash at the end)

Then open the static site address, sign in as Admin, and upload the mechanics CSV in **Manage > CSV upload**
(only needed if the online database is new and empty).

The free Render backend sleeps after 15 minutes without requests; the first page after that takes about a minute.

## 5. Live GPS

Open a mechanic's profile as Admin and tick **Mechanic has agreed to share his location**. Then either:

- **Share link:** copy the link shown and send it to him. He opens it on his phone and taps Share. Works while
  the page stays open.
- **Traccar Client app** (free, Android and iPhone): in the app enter the Server URL and Device identifier shown
  on the profile. It keeps sending in the background.

A marker is "Live" only if the phone sent a position in the last 10 minutes. Switching sharing off clears his
last position.

## 6. Day-to-day admin

| Task | Where |
|---|---|
| Add a mechanic | Mechanics > Add mechanic |
| Edit phone, names, hours, groups, location, radius | Profile > Edit details |
| Remove or restore a mechanic | Profile > Deactivate, or Manage > Deactivated > Restore |
| Many updates at once | Manage > CSV upload > Download current list, edit in Excel, upload |
| WhatsApp groups | WhatsApp Groups > Add group, then link mechanics on their Edit page |
| Zone name, areas, centre, boundary | Manage > Zones |
| Quiz scores | Manage > Quiz scores |
| Who changed what | Manage > Change history |
| Change a password | Manage > Logins |

## 7. What is approximate or not finished

- **Zone boundaries are not drawn.** Each zone starts with an approximate centre point only. Draw the real
  boundary in Manage > Zones by clicking around the zone on the map. Until then, Location Lookup uses the nearest
  zone centre and says so.
- **Zones that are on the company zone map but not in the sheet summary** (G-9, ND-7, SD-9, N-4, N-5, N-6, F-6, F-7,
  GNM-1) have no area name and a centre guessed from the map image. Check and correct them.
- **Mechanic locations are approximate** until the Admin sets a pin or the mechanic shares GPS. Approximate
  markers are spread around the zone centre and labelled.
- **The Traccar Client app has not been tested with a real phone** against this backend. Both of its known
  message formats are accepted. Test with one phone before rolling out.
- **Short Google Maps links** (maps.app.goo.gl) are opened by the backend to find the location. If that fails,
  paste the long link from the browser address bar or drag the pin.
- A mechanic belongs to **one zone**; extra areas go in "Other areas he covers".
- The sheet's shift tabs are not imported; working hours come from the directory tab.
- Not included: bookings, dispatch, customer portal, Google sign-in, dark mode, profile photos.

## 8. Differences from the original master prompt

These were chosen to keep the project free, simple to run on Windows, and with fewer things that can break:

- No PostGIS, Redis, WebSockets or Docker. Distance and boundary checks are done in Python, and the map refreshes
  every 30 seconds. This also means any plain PostgreSQL (or the local file database) works.
- Tailwind components written by hand in place of shadcn/ui, and simple bar charts in place of Recharts.
- Alembic has one starting migration that creates all tables.
