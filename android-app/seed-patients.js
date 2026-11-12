/**
 * seed-patients.js
 * ----------------
 * One-time script that adds 1,000 fake demo patients to the MedicalCare
 * database. It uses the SAME password hashing as the server, so every
 * generated patient can log in.
 *
 *   Default login for every generated patient:  password123
 *   Usernames are printed to patients-seeded.csv when the script finishes.
 *
 * Run it the same way you run the server:
 *   - Local file (default):      node seed-patients.js
 *   - Live Turso database:       set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
 *                                first, then run node seed-patients.js
 *
 * Safe to stop and re-run: usernames that already exist are skipped.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createClient } = require("@libsql/client");

const HOW_MANY = 1000;
const DEFAULT_PASSWORD = "password123";

const LOCAL_DB_FILE = path.join(__dirname, "medicalcare.db");
const DATABASE_URL = process.env.TURSO_DATABASE_URL || `file:${LOCAL_DB_FILE}`;
const USING_TURSO = Boolean(process.env.TURSO_DATABASE_URL);

const db = createClient({ url: DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// Same scrypt hashing the server uses, so these logins work.
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

const FIRST = ["James","Mary","John","Patricia","Robert","Jennifer","Michael","Linda","David","Elizabeth",
"William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Karen","Christopher","Sarah",
"Daniel","Lisa","Matthew","Nancy","Anthony","Betty","Mark","Sandra","Donald","Ashley",
"Steven","Kimberly","Paul","Emily","Andrew","Donna","Joshua","Michelle","Kenneth","Carol",
"Kevin","Amanda","Brian","Dorothy","George","Melissa","Timothy","Deborah","Ronald","Stephanie",
"Jason","Rebecca","Edward","Sharon","Jeffrey","Laura","Ryan","Cynthia","Jacob","Amy",
"Gary","Angela","Nicholas","Maria","Eric","Catherine","Jonathan","Heather","Stephen","Diane",
"Larry","Olivia","Justin","Julie","Scott","Joan","Brandon","Victoria","Benjamin","Kelly",
"Samuel","Christina","Gregory","Lauren","Alexander","Joyce","Patrick","Grace","Jack","Noah",
"Dennis","Rachel","Jerry","Carolyn","Tyler","Janet","Aaron","Hannah","Jose","Maria"];

const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
"Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin",
"Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
"Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
"Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts",
"Gomez","Phillips","Evans","Turner","Diaz","Parker","Cruz","Edwards","Collins","Reyes",
"Stewart","Morris","Morales","Murphy","Cook","Rogers","Gutierrez","Ortiz","Morgan","Cooper",
"Peterson","Bailey","Reed","Kelly","Howard","Ramos","Kim","Cox","Ward","Richardson",
"Watson","Brooks","Chavez","Wood","James","Bennett","Gray","Mendoza","Ruiz","Hughes",
"Price","Alvarez","Castillo","Sanders","Patel","Myers","Long","Ross","Foster","Powell"];

const PROVIDERS = ["Dr. Johnson","Dr. Patel","Dr. Williams"];
const PHARMACIES = ["MedicalCare Pharmacy","Downtown Pharmacy","Riverside Pharmacy","Oak Street Pharmacy"];
const INSURERS = ["Demo Health Insurance","Buckeye Health","Valley Mutual","First Care Plan"];
const CONTACT = ["Email","Phone","Text"];
const RELATION = ["Spouse","Parent","Sibling","Family Member","Friend"];

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (n, w) => String(n).padStart(w, "0");
// Deterministic name picks by index, so re-running makes the SAME usernames
// (and can safely skip ones that already exist).
const firstFor = (i) => FIRST[i % FIRST.length];
const lastFor = (i) => LAST[(i * 7) % LAST.length];

function phone() {
    return `(555) ${pad(Math.floor(Math.random()*900)+100,3)}-${pad(Math.floor(Math.random()*10000),4)}`;
}
function dob() {
    const y = 1950 + Math.floor(Math.random()*56);   // 1950-2005
    const m = 1 + Math.floor(Math.random()*12);
    const d = 1 + Math.floor(Math.random()*28);
    return `${y}-${pad(m,2)}-${pad(d,2)}`;
}

async function main() {
    console.log(`Connecting to ${USING_TURSO ? "Turso (" + new URL(DATABASE_URL).host + ")" : LOCAL_DB_FILE}`);

    // Make sure the patients table exists (matches the server's schema).
    await db.execute(`
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
        )
    `);

    const insertSql = `
        INSERT INTO patients (
            username, password_hash, full_name, date_of_birth, phone, email,
            preferred_contact, emergency_name, emergency_relationship,
            emergency_phone, primary_care_provider, preferred_pharmacy, insurance_provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Load usernames that already exist in ONE query, so re-running is fast
    // even against the online Turso database and never makes duplicates.
    const existingRows = await db.execute("SELECT username FROM patients");
    const existing = new Set(existingRows.rows.map(r => r.username));

    const statements = [];
    const seededUsernames = [];
    let made = 0, skipped = 0;

    for (let i = 0; i < HOW_MANY; i++) {
        const first = firstFor(i);
        const last = lastFor(i);
        const base = (first[0] + last).toLowerCase().replace(/[^a-z]/g, "");
        const username = `${base}${i + 1}`;   // deterministic + unique

        if (existing.has(username)) { skipped++; continue; }

        const fullName = `${first} ${last}`;
        const email = `${username}@example.com`;
        const emFirst = rnd(FIRST), emLast = rnd(LAST);

        statements.push({ sql: insertSql, args: [
            username, hashPassword(DEFAULT_PASSWORD), fullName, dob(), phone(), email,
            rnd(CONTACT), `${emFirst} ${emLast}`, rnd(RELATION), phone(),
            rnd(PROVIDERS), rnd(PHARMACIES), rnd(INSURERS),
        ]});
        seededUsernames.push(username);
        made++;
    }

    console.log(`Prepared ${made} new patients (skipped ${skipped} that already exist). Inserting...`);
    if (made === 0) { console.log("Nothing to add — all 1,000 are already in the database."); return; }

    // Insert in batches so one big transaction doesn't time out.
    const BATCH = 100;
    for (let i = 0; i < statements.length; i += BATCH) {
        await db.batch(statements.slice(i, i + BATCH), "write");
        process.stdout.write(`\r  inserted ${Math.min(i + BATCH, statements.length)} / ${statements.length}`);
    }
    console.log("");

    const total = await db.execute("SELECT COUNT(*) AS c FROM patients");
    fs.writeFileSync(
        path.join(__dirname, "patients-seeded.csv"),
        "username,password\n" + seededUsernames.map(u => `${u},${DEFAULT_PASSWORD}`).join("\n") + "\n"
    );

    console.log(`Done. Added ${made} patients. Table now holds ${total.rows[0].c} total.`);
    console.log(`Every generated patient logs in with password: ${DEFAULT_PASSWORD}`);
    console.log(`Usernames saved to patients-seeded.csv`);
}

main().catch((err) => { console.error("Seeding failed:", err.message || err); process.exit(1); });
