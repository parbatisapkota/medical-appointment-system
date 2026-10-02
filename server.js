/**
 * MedicalCare server
 * -------------------
 * A small Express server that serves the static MedicalCare site AND
 * a JSON REST API backed by a real SQLite database (patients,
 * appointments, messages).
 *
 * The database is SQLite, accessed through Turso's `@libsql/client`
 * library, so the SAME code works in two places:
 *
 *   - Locally (default): no setup needed. Data is stored in the
 *     `medicalcare.db` file in this folder, just like before.
 *   - Online (Turso): set the TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
 *     environment variables (e.g. in Render's dashboard) and the server
 *     uses a hosted Turso database that the whole team shares instead.
 *
 * Never commit TURSO_AUTH_TOKEN to git - it's a password.
 *
 * This is a class project prototype, not a production system:
 *   - Auth is intentionally simple (no sessions/JWT) - the browser
 *     just remembers the logged-in patient's id in localStorage and
 *     sends it back on later requests.
 *   - Passwords ARE hashed (scrypt) before being stored, but there is
 *     no rate limiting, email verification, HTTPS, etc.
 */

const path = require("node:path");
const crypto = require("node:crypto");
const { createClient } = require("@libsql/client");
const express = require("express");

const LOCAL_DB_FILE = path.join(__dirname, "medicalcare.db");
const DATABASE_URL = process.env.TURSO_DATABASE_URL || `file:${LOCAL_DB_FILE}`;
const USING_TURSO = Boolean(process.env.TURSO_DATABASE_URL);
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// Lookup tables (match the <option> values used in the HTML forms)
// ---------------------------------------------------------------

const PROVIDERS = {
    johnson: "Dr. Johnson",
    patel: "Dr. Patel",
    williams: "Dr. Williams",
};

const APPOINTMENT_TYPES = {
    checkup: "General Checkup",
    followup: "Follow-up Visit",
    consultation: "Consultation",
    physical: "Physical Examination",
};

function providerLabel(value) {
    return PROVIDERS[value] || value;
}

function appointmentTypeLabel(value) {
    return APPOINTMENT_TYPES[value] || value;
}

// ---------------------------------------------------------------
// Password hashing (scrypt, built into Node - no extra dependency)
// ---------------------------------------------------------------

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(":");
    const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(candidate, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------

const db = createClient({
    url: DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

// Small helpers so the route code reads almost the same as before.
// Each one sends a query to the database and WAITS (await) for the answer.

function rowToObject(result, row) {
    const obj = {};
    result.columns.forEach((column, i) => {
        obj[column] = row[i];
    });
    return obj;
}

// First matching row as a plain object, or undefined.
async function get(sql, ...args) {
    const result = await db.execute({ sql, args });
    return result.rows.length ? rowToObject(result, result.rows[0]) : undefined;
}

// All matching rows as plain objects.
async function all(sql, ...args) {
    const result = await db.execute({ sql, args });
    return result.rows.map((row) => rowToObject(result, row));
}

// INSERT / UPDATE / DELETE. Returns the new row's id for inserts.
async function run(sql, ...args) {
    const result = await db.execute({ sql, args });
    return {
        lastInsertRowid: result.lastInsertRowid === undefined
            ? undefined
            : Number(result.lastInsertRowid),
        changes: result.rowsAffected,
    };
}

// Turn a URL/body value into a numeric id. Anything that isn't a whole
// number becomes -1, which simply matches no rows (same behavior as before).
function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) ? id : -1;
}

// Express 4 doesn't catch errors thrown inside async route handlers,
// so wrap each one: a database error becomes a 500 JSON response
// instead of crashing the server or hanging the request.
function handle(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function createTables() {
    await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS patients (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        username                TEXT UNIQUE NOT NULL,
        password_hash           TEXT NOT NULL,
        full_name               TEXT NOT NULL,
        date_of_birth           TEXT,
        phone                   TEXT,
        email                   TEXT,
        preferred_contact       TEXT DEFAULT 'Email',
        emergency_name          TEXT,
        emergency_relationship  TEXT,
        emergency_phone         TEXT,
        primary_care_provider   TEXT,
        preferred_pharmacy      TEXT,
        insurance_provider      TEXT,
        created_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id        INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        provider          TEXT NOT NULL,
        appointment_type  TEXT NOT NULL,
        appointment_date  TEXT NOT NULL,
        appointment_time  TEXT NOT NULL,
        reason            TEXT,
        status            TEXT NOT NULL DEFAULT 'upcoming',
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        sender      TEXT NOT NULL,
        recipient   TEXT NOT NULL,
        body        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
`);
}

// ---------------------------------------------------------------
// Seed demo data the very first time the database is created, so
// the site has something to show without anyone registering first.
// ---------------------------------------------------------------

async function seedIfEmpty() {
    const { count } = await get("SELECT COUNT(*) AS count FROM patients");

    if (count > 0) {
        return;
    }

    console.log("Seeding demo patient data (first run)...");

    const insertPatientSql = `
        INSERT INTO patients (
            username, password_hash, full_name, date_of_birth, phone, email,
            preferred_contact, emergency_name, emergency_relationship,
            emergency_phone, primary_care_provider, preferred_pharmacy,
            insurance_provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Appointments and messages look up Jamie Doe's id by username, so the
    // whole seed can run as ONE batch: it all succeeds or none of it does.
    const JDOE_ID = "(SELECT id FROM patients WHERE username = 'jdoe')";

    const insertAppointmentSql = `
        INSERT INTO appointments (
            patient_id, provider, appointment_type, appointment_date,
            appointment_time, reason, status
        ) VALUES (${JDOE_ID}, ?, ?, ?, ?, ?, ?)
    `;

    const insertMessageSql = `
        INSERT INTO messages (patient_id, sender, recipient, body)
        VALUES (${JDOE_ID}, ?, ?, ?)
    `;

    await db.batch([
        {
            sql: insertPatientSql,
            args: [
                "jdoe",
                hashPassword("password123"),
                "Jamie Doe",
                "2000-01-15",
                "(555) 123-4567",
                "patient@example.com",
                "Email",
                "Alex Johnson",
                "Family Member",
                "(555) 987-6543",
                "Dr. Johnson",
                "MedicalCare Pharmacy",
                "Demo Health Insurance",
            ],
        },
        {
            sql: insertPatientSql,
            args: [
                "mgarcia",
                hashPassword("password123"),
                "Maria Garcia",
                "1992-06-03",
                "(555) 222-3344",
                "maria.garcia@example.com",
                "Phone",
                "Luis Garcia",
                "Spouse",
                "(555) 222-9988",
                "Dr. Patel",
                "Downtown Pharmacy",
                "Demo Health Insurance",
            ],
        },
        {
            sql: insertAppointmentSql,
            args: ["johnson", "checkup", "2026-09-28", "10:30 AM", "Annual checkup", "upcoming"],
        },
        {
            sql: insertAppointmentSql,
            args: ["patel", "checkup", "2026-08-12", "9:00 AM", "Annual checkup", "completed"],
        },
        {
            sql: insertAppointmentSql,
            args: ["williams", "followup", "2026-06-04", "2:00 PM", "Follow-up visit", "completed"],
        },
        {
            sql: insertMessageSql,
            args: [
                "Dr. Johnson", "jdoe",
                "Your upcoming appointment is confirmed for September 28, 2026 at 10:30 AM.",
            ],
        },
        {
            sql: insertMessageSql,
            args: [
                "MedicalCare Health Center", "jdoe",
                "Please remember to bring your identification and insurance information to your appointment.",
            ],
        },
    ], "write");
}

// ---------------------------------------------------------------
// Helpers for turning a DB row into a safe JSON response
// (never send password_hash back to the browser)
// ---------------------------------------------------------------

function publicPatient(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        dateOfBirth: row.date_of_birth,
        phone: row.phone,
        email: row.email,
        preferredContact: row.preferred_contact,
        emergencyName: row.emergency_name,
        emergencyRelationship: row.emergency_relationship,
        emergencyPhone: row.emergency_phone,
        primaryCareProvider: row.primary_care_provider,
        preferredPharmacy: row.preferred_pharmacy,
        insuranceProvider: row.insurance_provider,
    };
}

function publicAppointment(row) {
    return {
        id: row.id,
        patientId: row.patient_id,
        patientName: row.patient_name || undefined,
        provider: row.provider,
        providerLabel: providerLabel(row.provider),
        appointmentType: row.appointment_type,
        appointmentTypeLabel: appointmentTypeLabel(row.appointment_type),
        date: row.appointment_date,
        time: row.appointment_time,
        reason: row.reason,
        status: row.status,
    };
}

function publicMessage(row) {
    return {
        id: row.id,
        patientId: row.patient_id,
        sender: row.sender,
        recipient: row.recipient,
        body: row.body,
        createdAt: row.created_at,
    };
}

// ---------------------------------------------------------------
// App + API routes
// ---------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const api = express.Router();
app.use("/api", api);

// ---- Auth --------------------------------------------------------

api.post("/register", handle(async (req, res) => {
    const {
        username, password, fullName, dateOfBirth, phone, email,
        preferredContact,
    } = req.body || {};

    if (!username || !password || !fullName) {
        return res.status(400).json({
            error: "Username, password, and full name are required.",
        });
    }

    const existing = await get("SELECT id FROM patients WHERE username = ?", username);

    if (existing) {
        return res.status(409).json({ error: "That username is already taken." });
    }

    const result = await run(`
        INSERT INTO patients (
            username, password_hash, full_name, date_of_birth, phone, email,
            preferred_contact
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        username,
        hashPassword(password),
        fullName,
        dateOfBirth || null,
        phone || null,
        email || null,
        preferredContact || "Email"
    );

    const patient = await get("SELECT * FROM patients WHERE id = ?", result.lastInsertRowid);

    res.status(201).json({ patient: publicPatient(patient) });
}));

api.post("/login", handle(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    const row = await get("SELECT * FROM patients WHERE username = ?", username);

    if (!row || !verifyPassword(password, row.password_hash)) {
        return res.status(401).json({ error: "Invalid username or password." });
    }

    res.json({ patient: publicPatient(row) });
}));

// ---- Patients ------------------------------------------------------

// Staff-style search MUST be registered before the ":id" route below,
// otherwise Express would try to treat "search" as an id.
api.get("/patients", handle(async (req, res) => {
    const search = (req.query.search || "").toString().trim();

    if (!search) {
        return res.status(400).json({ error: "Provide a ?search= name to look up." });
    }

    const rows = await all(
        "SELECT * FROM patients WHERE full_name LIKE ? ORDER BY full_name",
        `%${search}%`
    );

    res.json({ patients: rows.map(publicPatient) });
}));

api.get("/patients/:id", handle(async (req, res) => {
    const row = await get("SELECT * FROM patients WHERE id = ?", toId(req.params.id));

    if (!row) {
        return res.status(404).json({ error: "Patient not found." });
    }

    res.json({ patient: publicPatient(row) });
}));

api.put("/patients/:id", handle(async (req, res) => {
    const id = toId(req.params.id);
    const existing = await get("SELECT * FROM patients WHERE id = ?", id);

    if (!existing) {
        return res.status(404).json({ error: "Patient not found." });
    }

    const body = req.body || {};
    const fields = {
        full_name: body.fullName ?? existing.full_name,
        date_of_birth: body.dateOfBirth ?? existing.date_of_birth,
        phone: body.phone ?? existing.phone,
        email: body.email ?? existing.email,
        preferred_contact: body.preferredContact ?? existing.preferred_contact,
        emergency_name: body.emergencyName ?? existing.emergency_name,
        emergency_relationship:
            body.emergencyRelationship ?? existing.emergency_relationship,
        emergency_phone: body.emergencyPhone ?? existing.emergency_phone,
        primary_care_provider:
            body.primaryCareProvider ?? existing.primary_care_provider,
        preferred_pharmacy: body.preferredPharmacy ?? existing.preferred_pharmacy,
        insurance_provider: body.insuranceProvider ?? existing.insurance_provider,
    };

    await run(`
        UPDATE patients SET
            full_name = ?, date_of_birth = ?, phone = ?, email = ?,
            preferred_contact = ?, emergency_name = ?, emergency_relationship = ?,
            emergency_phone = ?, primary_care_provider = ?, preferred_pharmacy = ?,
            insurance_provider = ?
        WHERE id = ?
    `,
        fields.full_name, fields.date_of_birth, fields.phone, fields.email,
        fields.preferred_contact, fields.emergency_name, fields.emergency_relationship,
        fields.emergency_phone, fields.primary_care_provider, fields.preferred_pharmacy,
        fields.insurance_provider, id
    );

    const updated = await get("SELECT * FROM patients WHERE id = ?", id);
    res.json({ patient: publicPatient(updated) });
}));

// ---- Appointments ----------------------------------------------------

const APPOINTMENT_WITH_PATIENT_SQL = `
    SELECT a.*, p.full_name AS patient_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
`;

api.get("/appointments", handle(async (req, res) => {
    const { patientId, date } = req.query;

    if (patientId) {
        const rows = await all(`
            ${APPOINTMENT_WITH_PATIENT_SQL}
            WHERE a.patient_id = ?
            ORDER BY a.appointment_date DESC, a.appointment_time ASC
        `, toId(patientId));

        return res.json({ appointments: rows.map(publicAppointment) });
    }

    if (date) {
        const targetDate =
            date === "today" ? new Date().toISOString().slice(0, 10) : String(date);

        const rows = await all(`
            ${APPOINTMENT_WITH_PATIENT_SQL}
            WHERE a.appointment_date = ?
            ORDER BY a.appointment_time ASC
        `, targetDate);

        return res.json({ appointments: rows.map(publicAppointment) });
    }

    res.status(400).json({ error: "Provide ?patientId= or ?date=." });
}));

api.post("/appointments", handle(async (req, res) => {
    const { patientId, provider, appointmentType, date, time, reason } =
        req.body || {};

    if (!patientId || !provider || !appointmentType || !date || !time) {
        return res.status(400).json({
            error: "patientId, provider, appointmentType, date, and time are required.",
        });
    }

    const result = await run(`
        INSERT INTO appointments (
            patient_id, provider, appointment_type, appointment_date,
            appointment_time, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'upcoming')
    `, toId(patientId), provider, appointmentType, date, time, reason || null);

    const row = await get(
        `${APPOINTMENT_WITH_PATIENT_SQL} WHERE a.id = ?`,
        result.lastInsertRowid
    );

    res.status(201).json({ appointment: publicAppointment(row) });
}));

api.patch("/appointments/:id", handle(async (req, res) => {
    const id = toId(req.params.id);
    const { status } = req.body || {};

    if (!["upcoming", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({
            error: "status must be one of: upcoming, completed, cancelled.",
        });
    }

    const existing = await get("SELECT id FROM appointments WHERE id = ?", id);
    if (!existing) {
        return res.status(404).json({ error: "Appointment not found." });
    }

    await run("UPDATE appointments SET status = ? WHERE id = ?", status, id);

    const row = await get(`${APPOINTMENT_WITH_PATIENT_SQL} WHERE a.id = ?`, id);

    res.json({ appointment: publicAppointment(row) });
}));

// ---- Messages ----------------------------------------------------------

api.get("/messages", handle(async (req, res) => {
    const { patientId } = req.query;

    if (!patientId) {
        return res.status(400).json({ error: "Provide ?patientId=." });
    }

    const rows = await all(
        "SELECT * FROM messages WHERE patient_id = ? ORDER BY created_at DESC",
        toId(patientId)
    );

    res.json({ messages: rows.map(publicMessage) });
}));

api.post("/messages", handle(async (req, res) => {
    const { patientId, recipient, body } = req.body || {};

    if (!patientId || !recipient || !body) {
        return res.status(400).json({ error: "patientId, recipient, and body are required." });
    }

    const patient = await get("SELECT username FROM patients WHERE id = ?", toId(patientId));

    if (!patient) {
        return res.status(404).json({ error: "Patient not found." });
    }

    const result = await run(`
        INSERT INTO messages (patient_id, sender, recipient, body)
        VALUES (?, ?, ?, ?)
    `, toId(patientId), patient.username, providerLabel(recipient), body);

    const row = await get("SELECT * FROM messages WHERE id = ?", result.lastInsertRowid);

    res.status(201).json({ message: publicMessage(row) });
}));

// Any database error inside a route ends up here.
app.use((err, req, res, next) => {
    // Problems with the request itself (e.g. malformed JSON) keep their 4xx code.
    if (err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ error: "Invalid request." });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
});

// ---------------------------------------------------------------
// Start up: make sure the tables exist, seed demo data if the
// database is brand new, then start listening for requests.
// ---------------------------------------------------------------

async function start() {
    if (process.env.RENDER && !USING_TURSO) {
        console.warn(
            "WARNING: TURSO_DATABASE_URL is not set, so this server is using a " +
            "local database file. On Render's free plan that file is ERASED " +
            "whenever the server restarts or sleeps. Add TURSO_DATABASE_URL and " +
            "TURSO_AUTH_TOKEN under Environment in the Render dashboard."
        );
    }

    await createTables();
    await seedIfEmpty();

    app.listen(PORT, () => {
        console.log(`MedicalCare server running at http://localhost:${PORT}`);
        console.log(
            USING_TURSO
                ? `Database: Turso (${new URL(DATABASE_URL).host})`
                : `Database file: ${LOCAL_DB_FILE}`
        );
    });
}

start().catch((err) => {
    console.error("Could not start the server - database connection failed:");
    console.error(err.message || err);
    if (USING_TURSO) {
        console.error(
            "Check that TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set correctly."
        );
    }
    process.exit(1);
});
