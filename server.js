/**
 * MedicalCare server
 * -------------------
 * A small Express server that serves the static MedicalCare site AND
 * a JSON REST API backed by a real SQLite database (patients,
 * appointments, messages).
 *
 * Uses Node's BUILT-IN `node:sqlite` module, so there is nothing to
 * compile and only one dependency to install (express). Requires
 * Node.js 22.5 or newer.
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
const { DatabaseSync } = require("node:sqlite");
const express = require("express");

const DB_PATH = path.join(__dirname, "medicalcare.db");
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

const db = new DatabaseSync(DB_PATH);

db.exec(`
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

// ---------------------------------------------------------------
// Seed demo data the very first time the database is created, so
// the site has something to show without anyone registering first.
// ---------------------------------------------------------------

function seedIfEmpty() {
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM patients").get();

    if (count > 0) {
        return;
    }

    console.log("Seeding demo patient data (first run)...");

    const insertPatient = db.prepare(`
        INSERT INTO patients (
            username, password_hash, full_name, date_of_birth, phone, email,
            preferred_contact, emergency_name, emergency_relationship,
            emergency_phone, primary_care_provider, preferred_pharmacy,
            insurance_provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const demoPatientId = Number(
        insertPatient.run(
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
            "Demo Health Insurance"
        ).lastInsertRowid
    );

    insertPatient.run(
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
        "Demo Health Insurance"
    );

    const insertAppointment = db.prepare(`
        INSERT INTO appointments (
            patient_id, provider, appointment_type, appointment_date,
            appointment_time, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertAppointment.run(
        demoPatientId, "johnson", "checkup", "2026-09-28", "10:30 AM",
        "Annual checkup", "upcoming"
    );
    insertAppointment.run(
        demoPatientId, "patel", "checkup", "2026-08-12", "9:00 AM",
        "Annual checkup", "completed"
    );
    insertAppointment.run(
        demoPatientId, "williams", "followup", "2026-06-04", "2:00 PM",
        "Follow-up visit", "completed"
    );

    const insertMessage = db.prepare(`
        INSERT INTO messages (patient_id, sender, recipient, body)
        VALUES (?, ?, ?, ?)
    `);

    insertMessage.run(
        demoPatientId, "Dr. Johnson", "jdoe",
        "Your upcoming appointment is confirmed for September 28, 2026 at 10:30 AM."
    );
    insertMessage.run(
        demoPatientId, "MedicalCare Health Center", "jdoe",
        "Please remember to bring your identification and insurance information to your appointment."
    );
}

seedIfEmpty();

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

api.post("/register", (req, res) => {
    const {
        username, password, fullName, dateOfBirth, phone, email,
        preferredContact,
    } = req.body || {};

    if (!username || !password || !fullName) {
        return res.status(400).json({
            error: "Username, password, and full name are required.",
        });
    }

    const existing = db
        .prepare("SELECT id FROM patients WHERE username = ?")
        .get(username);

    if (existing) {
        return res.status(409).json({ error: "That username is already taken." });
    }

    const insert = db.prepare(`
        INSERT INTO patients (
            username, password_hash, full_name, date_of_birth, phone, email,
            preferred_contact
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
        username,
        hashPassword(password),
        fullName,
        dateOfBirth || null,
        phone || null,
        email || null,
        preferredContact || "Email"
    );

    const patient = db
        .prepare("SELECT * FROM patients WHERE id = ?")
        .get(Number(result.lastInsertRowid));

    res.status(201).json({ patient: publicPatient(patient) });
});

api.post("/login", (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    const row = db
        .prepare("SELECT * FROM patients WHERE username = ?")
        .get(username);

    if (!row || !verifyPassword(password, row.password_hash)) {
        return res.status(401).json({ error: "Invalid username or password." });
    }

    res.json({ patient: publicPatient(row) });
});

// ---- Patients ------------------------------------------------------

// Staff-style search MUST be registered before the ":id" route below,
// otherwise Express would try to treat "search" as an id.
api.get("/patients", (req, res) => {
    const search = (req.query.search || "").toString().trim();

    if (!search) {
        return res.status(400).json({ error: "Provide a ?search= name to look up." });
    }

    const rows = db
        .prepare("SELECT * FROM patients WHERE full_name LIKE ? ORDER BY full_name")
        .all(`%${search}%`);

    res.json({ patients: rows.map(publicPatient) });
});

api.get("/patients/:id", (req, res) => {
    const row = db
        .prepare("SELECT * FROM patients WHERE id = ?")
        .get(Number(req.params.id));

    if (!row) {
        return res.status(404).json({ error: "Patient not found." });
    }

    res.json({ patient: publicPatient(row) });
});

api.put("/patients/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM patients WHERE id = ?").get(id);

    if (!existing) {
        return res.status(404).json({ error: "Patient not found." });
    }

    const fields = {
        full_name: req.body.fullName ?? existing.full_name,
        date_of_birth: req.body.dateOfBirth ?? existing.date_of_birth,
        phone: req.body.phone ?? existing.phone,
        email: req.body.email ?? existing.email,
        preferred_contact: req.body.preferredContact ?? existing.preferred_contact,
        emergency_name: req.body.emergencyName ?? existing.emergency_name,
        emergency_relationship:
            req.body.emergencyRelationship ?? existing.emergency_relationship,
        emergency_phone: req.body.emergencyPhone ?? existing.emergency_phone,
        primary_care_provider:
            req.body.primaryCareProvider ?? existing.primary_care_provider,
        preferred_pharmacy: req.body.preferredPharmacy ?? existing.preferred_pharmacy,
        insurance_provider: req.body.insuranceProvider ?? existing.insurance_provider,
    };

    db.prepare(`
        UPDATE patients SET
            full_name = ?, date_of_birth = ?, phone = ?, email = ?,
            preferred_contact = ?, emergency_name = ?, emergency_relationship = ?,
            emergency_phone = ?, primary_care_provider = ?, preferred_pharmacy = ?,
            insurance_provider = ?
        WHERE id = ?
    `).run(
        fields.full_name, fields.date_of_birth, fields.phone, fields.email,
        fields.preferred_contact, fields.emergency_name, fields.emergency_relationship,
        fields.emergency_phone, fields.primary_care_provider, fields.preferred_pharmacy,
        fields.insurance_provider, id
    );

    const updated = db.prepare("SELECT * FROM patients WHERE id = ?").get(id);
    res.json({ patient: publicPatient(updated) });
});

// ---- Appointments ----------------------------------------------------

api.get("/appointments", (req, res) => {
    const { patientId, date } = req.query;

    if (patientId) {
        const rows = db
            .prepare(`
                SELECT a.*, p.full_name AS patient_name
                FROM appointments a
                JOIN patients p ON p.id = a.patient_id
                WHERE a.patient_id = ?
                ORDER BY a.appointment_date DESC, a.appointment_time ASC
            `)
            .all(Number(patientId));

        return res.json({ appointments: rows.map(publicAppointment) });
    }

    if (date) {
        const targetDate =
            date === "today" ? new Date().toISOString().slice(0, 10) : date;

        const rows = db
            .prepare(`
                SELECT a.*, p.full_name AS patient_name
                FROM appointments a
                JOIN patients p ON p.id = a.patient_id
                WHERE a.appointment_date = ?
                ORDER BY a.appointment_time ASC
            `)
            .all(targetDate);

        return res.json({ appointments: rows.map(publicAppointment) });
    }

    res.status(400).json({ error: "Provide ?patientId= or ?date=." });
});

api.post("/appointments", (req, res) => {
    const { patientId, provider, appointmentType, date, time, reason } =
        req.body || {};

    if (!patientId || !provider || !appointmentType || !date || !time) {
        return res.status(400).json({
            error: "patientId, provider, appointmentType, date, and time are required.",
        });
    }

    const result = db.prepare(`
        INSERT INTO appointments (
            patient_id, provider, appointment_type, appointment_date,
            appointment_time, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'upcoming')
    `).run(Number(patientId), provider, appointmentType, date, time, reason || null);

    const row = db
        .prepare(`
            SELECT a.*, p.full_name AS patient_name
            FROM appointments a JOIN patients p ON p.id = a.patient_id
            WHERE a.id = ?
        `)
        .get(Number(result.lastInsertRowid));

    res.status(201).json({ appointment: publicAppointment(row) });
});

api.patch("/appointments/:id", (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!["upcoming", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({
            error: "status must be one of: upcoming, completed, cancelled.",
        });
    }

    const existing = db.prepare("SELECT id FROM appointments WHERE id = ?").get(id);
    if (!existing) {
        return res.status(404).json({ error: "Appointment not found." });
    }

    db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(status, id);

    const row = db
        .prepare(`
            SELECT a.*, p.full_name AS patient_name
            FROM appointments a JOIN patients p ON p.id = a.patient_id
            WHERE a.id = ?
        `)
        .get(id);

    res.json({ appointment: publicAppointment(row) });
});

// ---- Messages ----------------------------------------------------------

api.get("/messages", (req, res) => {
    const { patientId } = req.query;

    if (!patientId) {
        return res.status(400).json({ error: "Provide ?patientId=." });
    }

    const rows = db
        .prepare("SELECT * FROM messages WHERE patient_id = ? ORDER BY created_at DESC")
        .all(Number(patientId));

    res.json({ messages: rows.map(publicMessage) });
});

api.post("/messages", (req, res) => {
    const { patientId, recipient, body } = req.body || {};

    if (!patientId || !recipient || !body) {
        return res.status(400).json({ error: "patientId, recipient, and body are required." });
    }

    const patient = db.prepare("SELECT username FROM patients WHERE id = ?").get(Number(patientId));

    if (!patient) {
        return res.status(404).json({ error: "Patient not found." });
    }

    const result = db.prepare(`
        INSERT INTO messages (patient_id, sender, recipient, body)
        VALUES (?, ?, ?, ?)
    `).run(Number(patientId), patient.username, providerLabel(recipient), body);

    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(Number(result.lastInsertRowid));

    res.status(201).json({ message: publicMessage(row) });
});

// ---------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`MedicalCare server running at http://localhost:${PORT}`);
    console.log(`Database file: ${DB_PATH}`);
});
