const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(process.env.DB_PATH || path.join(__dirname, "honeychain.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','beekeeper','processing','customer')),
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS apiaries (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT NOT NULL,
 beekeeper_user_id INTEGER, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 FOREIGN KEY(beekeeper_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS hives (
 id INTEGER PRIMARY KEY AUTOINCREMENT, apiary_id INTEGER NOT NULL, hive_code TEXT NOT NULL UNIQUE,
 species TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 FOREIGN KEY(apiary_id) REFERENCES apiaries(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS honey_batches (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 batch_id TEXT UNIQUE NOT NULL, beekeeper TEXT NOT NULL, honey_type TEXT NOT NULL,
 quantity REAL NOT NULL, harvest_date TEXT NOT NULL, location TEXT NOT NULL,
 hive_id INTEGER, apiary_id INTEGER, previous_hash TEXT NOT NULL, record_hash TEXT NOT NULL,
 created_at TEXT NOT NULL, FOREIGN KEY(hive_id) REFERENCES hives(id), FOREIGN KEY(apiary_id) REFERENCES apiaries(id)
);
CREATE TABLE IF NOT EXISTS batch_stages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL, stage_name TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', stage_date TEXT NOT NULL,
 created_at TEXT NOT NULL, user_id INTEGER,
 FOREIGN KEY(batch_id) REFERENCES honey_batches(batch_id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS quality_reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL, report_title TEXT NOT NULL,
 inspection_result TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', file_name TEXT,
 stored_file TEXT, uploaded_by INTEGER, created_at TEXT NOT NULL,
 FOREIGN KEY(batch_id) REFERENCES honey_batches(batch_id) ON DELETE CASCADE,
 FOREIGN KEY(uploaded_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL,
 entity_type TEXT NOT NULL, entity_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);
module.exports=db;