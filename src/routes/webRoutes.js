const express = require("express");
const db = require("../../database/database");

const router = express.Router();

router.post("/update-slots", (req, res) => {
    const { deviceId, slots } = req.body;

    if (!deviceId) {
        return res.status(400).json({
            status: "error",
            message: "deviceId is required"
        });
    }

    if (!slots) {
        return res.status(400).json({
            status: "error",
            message: "slots is required"
        });
    }

    const requiredSlots = [
        "morning",
        "noon",
        "evening",
        "bedtime"
    ];

    for (const slot of requiredSlots) {
        if (!slots[slot]) {
            return res.status(400).json({
                status: "error",
                message: `Missing slot: ${slot}`
            });
        }

        if (
            typeof slots[slot].h !== "number" ||
            typeof slots[slot].m !== "number"
        ) {
            return res.status(400).json({
                status: "error",
                message: `Invalid time for slot: ${slot}`
            });
        }
    }

    const existingDevice = db.prepare(`
        SELECT id
        FROM pillbox_devices
        WHERE device_id = ?
    `).get(deviceId);

    if (!existingDevice) {
        db.prepare(`
            INSERT INTO pillbox_devices (device_id)
            VALUES (?)
        `).run(deviceId);
    }

    const update = db.prepare(`
        UPDATE pillbox_devices
        SET
            morning_h = ?,
            morning_m = ?,
            noon_h = ?,
            noon_m = ?,
            evening_h = ?,
            evening_m = ?,
            bedtime_h = ?,
            bedtime_m = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE device_id = ?
    `);

    const result = update.run(
        slots.morning.h,
        slots.morning.m,
        slots.noon.h,
        slots.noon.m,
        slots.evening.h,
        slots.evening.m,
        slots.bedtime.h,
        slots.bedtime.m,
        deviceId
    );

    // อ่านค่าจาก Database กลับมาเพื่อยืนยัน
    const saved = db.prepare(`
        SELECT
            device_id,
            morning_h,
            morning_m,
            noon_h,
            noon_m,
            evening_h,
            evening_m,
            bedtime_h,
            bedtime_m
        FROM pillbox_devices
        WHERE device_id = ?
    `).get(deviceId);

    console.log("Database updated:", saved);

    res.json({
        status: "success",
        message: "Medication schedule updated",
        deviceId,
        slots,
        database: saved,
        changes: result.changes
    });
});

module.exports = router;