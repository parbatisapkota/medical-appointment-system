# MedicalCare

A class project prototype for a simple, accessible healthcare
appointment and patient management system.

The site is backed by a real **patient database** (SQLite) instead
of hardcoded sample data. Patient accounts, appointments, and messages
are stored on a small Node.js server and read/written over a JSON API.

The database can live in two places, with no code changes:

- **On your own computer (default)** — a `medicalcare.db` file in this
  folder. Nothing to set up.
- **Online on [Turso](https://turso.tech)** (free, hosted SQLite) — one
  shared database for the whole team, used by the live site on
  [Render](https://render.com). See "Deploying online" below.

## What's in the database

- **patients** — username, password (hashed), name, date of birth,
  phone, email, preferred contact method, emergency contact, primary
  care provider, preferred pharmacy, insurance provider
- **appointments** — linked to a patient: provider, appointment type,
  date, time, reason, status (upcoming / completed / cancelled)
- **messages** — linked to a patient: sender, recipient, message body,
  timestamp

## Requirements

- [Node.js](https://nodejs.org) version **20 or newer**. Check your
  version with `node --version`.

## Running it

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

The first time the server runs, it creates `medicalcare.db` in the
project folder and fills it with two demo patients so the site isn't
empty:

| Username  | Password      |
|-----------|---------------|
| jdoe      | password123   |
| mgarcia   | password123   |

You can also create a brand new account from the "Create an account"
link on the login page — that writes a real row into the `patients`
table.

## Deploying online (free): Render + Turso

Render runs the website; Turso stores the database. Render's free plan
erases files whenever the server restarts or sleeps, which is why the
database can't just be a file there.

**1. Create the database on Turso** (one person does this)

1. Sign up at [turso.tech](https://turso.tech) (free, no credit card).
2. Create a database (e.g. `medicalcare`).
3. Copy its **Database URL** (starts with `libsql://`).
4. Create a **database token** and copy it. Treat it like a password —
   never commit it to git or paste it in group chats.

**2. Create the website on Render**

1. Sign up at [render.com](https://render.com) with GitHub.
2. Click **New → Blueprint**, pick this repository. Render reads
   `render.yaml` and asks for two values:
   - `TURSO_DATABASE_URL` → the Database URL from step 1
   - `TURSO_AUTH_TOKEN` → the token from step 1
3. Click **Apply**. After the first deploy, the logs should say
   `Database: Turso (...)` and "Seeding demo patient data" the first time.
4. Your site is at `https://medicalcare-XXXX.onrender.com`.

Every `git push` to the main branch redeploys the site automatically.
The Turso data survives redeploys.

**Things to know**

- The free site **sleeps after 15 minutes** without visitors; the next
  visit takes about a minute to wake it. Open it a few minutes before
  a demo.
- If the logs show a WARNING about `TURSO_DATABASE_URL` not being set,
  the Turso values are missing — add them under **Environment** in the
  Render dashboard, then redeploy.
- Everyone using the live site shares the same data. Use fake data only.

**Optional: point your local copy at the shared Turso database**

```bash
# macOS / Linux
TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." npm start

# Windows PowerShell
$env:TURSO_DATABASE_URL="libsql://..."; $env:TURSO_AUTH_TOKEN="..."; npm start
```

## Installing it as a phone app

The site is an installable web app: the same pages, server and database,
with a home-screen icon and a full-screen window on phones. Nothing
separate to build or maintain.

- **iPhone (Safari):** open the site → Share button → **Add to Home Screen**.
- **Android (Chrome):** open the site → menu (⋮) → **Install app**
  (or tap the install prompt).

Installing needs the live `https://` site (Render). On your own computer
it also works at `http://localhost:3000`, but a phone can't reach that.

Files involved:

- `manifest.json` — app name, icon, colors, and start page.
- `service-worker.js` — required by phones for installing. It never
  saves patient data (`/api/...`) on the device; pages and styles are
  always fetched fresh when online, with `offline.html` as a friendly
  fallback when there's no connection. Bump `CACHE_VERSION` in it if you
  change its list of files.
- `offline.html` — shown when there's no internet connection.
- `icons/` — app icons for home screens and the browser tab.
- `style.css` — the section at the bottom only applies on screens
  700px wide or smaller, so the desktop layout is unchanged.

## How the pieces fit together

- `server.js` — the Express server. Serves the static HTML/CSS/JS files
  *and* the `/api/...` JSON endpoints, all from one process.
- `medicalcare.db` — the local SQLite database file, used when no Turso
  settings are present (created automatically, not committed to git —
  see `.gitignore`).
- `render.yaml` — tells Render how to build and run the site.
- `manifest.json`, `service-worker.js`, `offline.html`, `icons/` — make
  the site installable on phones (see above).
- `script.js` — shared front-end JavaScript. Each page-specific loader
  function (`loadAppointments`, `loadMessages`, `loadPatientInformation`,
  `loadTodayAppointments`) checks whether the page it's running on has
  the right container element before doing anything, so one script.js
  file can safely be shared by every page.
- Login state lives in the browser's `localStorage` under the key
  `medicalCarePatient` (just the logged-in patient's id, username, and
  name — never the password). It's a stand-in for real sessions/auth,
  which is out of scope for this prototype.

## API overview

| Method | Path                        | Purpose                              |
|--------|------------------------------|---------------------------------------|
| POST   | `/api/register`              | Create a new patient account          |
| POST   | `/api/login`                 | Check username/password               |
| GET    | `/api/patients/:id`          | Get one patient's info                |
| PUT    | `/api/patients/:id`          | Update a patient's info               |
| GET    | `/api/patients?search=name`  | Staff: search patients by name        |
| GET    | `/api/appointments?patientId=` | A patient's appointments            |
| GET    | `/api/appointments?date=today` | Staff: all appointments for a date  |
| POST   | `/api/appointments`          | Book an appointment                   |
| PATCH  | `/api/appointments/:id`      | Change an appointment's status        |
| GET    | `/api/messages?patientId=`   | A patient's messages                  |
| POST   | `/api/messages`              | Send a message                        |

## Known limitations (fine for a class project, worth knowing)

- No real sessions — anyone with browser dev tools could edit the
  `localStorage` value and view another patient's `id`. Good enough for
  a prototype demo, not for real patient data.
- Staff and patients share the same login form; there's no separate
  staff account type or role-based permissions yet.
- The Patient Dashboard's "Next Appointment" summary card is still a
  static example — the full Appointments page is the one wired to the
  real database.
- Please don't enter real medical or personal information — this is a
  demo project.
