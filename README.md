# MedicalCare

A class project prototype for a simple, accessible healthcare
appointment and patient management system.

The site is now backed by a real **patient database** (SQLite) instead
of hardcoded sample data. Patient accounts, appointments, and messages
are stored on a small Node.js server and read/written over a JSON API.

## What's in the database

- **patients** — username, password (hashed), name, date of birth,
  phone, email, preferred contact method, emergency contact, primary
  care provider, preferred pharmacy, insurance provider
- **appointments** — linked to a patient: provider, appointment type,
  date, time, reason, status (upcoming / completed / cancelled)
- **messages** — linked to a patient: sender, recipient, message body,
  timestamp

## Requirements

- [Node.js](https://nodejs.org) version **22.5 or newer** (the server
  uses Node's built-in `node:sqlite` module, so nothing needs to be
  compiled — no native build tools required). Check your version with
  `node --version`.

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

## How the pieces fit together

- `server.js` — the Express server. Serves the static HTML/CSS/JS files
  *and* the `/api/...` JSON endpoints, all from one process.
- `medicalcare.db` — the SQLite database file (created automatically,
  not committed to git — see `.gitignore`).
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
