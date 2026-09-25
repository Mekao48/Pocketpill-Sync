const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "smart-medicine-box.db");

const db = new Database(dbPath);

// เปิดโหมดตรวจสอบ Foreign Key
db.pragma("foreign_keys = ON");


// ========================================
// ตารางอุปกรณ์และเวลาตั้งยา
// ========================================
db.exec(`
    CREATE TABLE IF NOT EXISTS pillbox_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL UNIQUE,
        line_user_id TEXT,

        morning_h INTEGER NOT NULL DEFAULT 8,
        morning_m INTEGER NOT NULL DEFAULT 0,
        morning_enabled INTEGER NOT NULL DEFAULT 1,

        noon_h INTEGER NOT NULL DEFAULT 12,
        noon_m INTEGER NOT NULL DEFAULT 0,
        noon_enabled INTEGER NOT NULL DEFAULT 1,

        evening_h INTEGER NOT NULL DEFAULT 18,
        evening_m INTEGER NOT NULL DEFAULT 0,
        evening_enabled INTEGER NOT NULL DEFAULT 1,

        bedtime_h INTEGER NOT NULL DEFAULT 21,
        bedtime_m INTEGER NOT NULL DEFAULT 0,
        bedtime_enabled INTEGER NOT NULL DEFAULT 1,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);


// ========================================
// ตารางประวัติการกินยา
// ========================================
db.exec(`
    CREATE TABLE IF NOT EXISTS medication_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        device_id TEXT NOT NULL,

        slot_name TEXT NOT NULL,
        slot_index INTEGER NOT NULL,

        taken_time INTEGER NOT NULL,
        delay_sec INTEGER NOT NULL DEFAULT 0,

        is_delayed INTEGER NOT NULL DEFAULT 0,
        is_skipped INTEGER NOT NULL DEFAULT 0,

        next_alert INTEGER,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const deviceColumns = new Set(
    db.pragma("table_info(pillbox_devices)").map(column => column.name)
);

for (const slot of ["morning", "noon", "evening", "bedtime"]) {
    const column = `${slot}_enabled`;
    if (!deviceColumns.has(column)) {
        db.exec(`ALTER TABLE pillbox_devices ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 1`);
    }
}

const logColumns = new Set(
    db.pragma("table_info(medication_logs)").map(column => column.name)
);

if (!logColumns.has("is_skipped")) {
    db.exec("ALTER TABLE medication_logs ADD COLUMN is_skipped INTEGER NOT NULL DEFAULT 0");
}


// ========================================
// ตารางประวัติการแจ้งเตือน
// ใช้ป้องกันการแจ้งเตือนซ้ำภายในวันเดียวกัน
// ========================================
db.exec(`
    CREATE TABLE IF NOT EXISTS medication_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        device_id TEXT NOT NULL,

        slot_name TEXT NOT NULL,

        reminder_date TEXT NOT NULL,

        sent_at INTEGER NOT NULL,

        UNIQUE (
            device_id,
            slot_name,
            reminder_date
        )
    )
`);


console.log("Database initialized successfully");

module.exports = db;