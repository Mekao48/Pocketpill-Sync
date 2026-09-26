const express = require("express");
const database = require("../services/database");
const { sendLineBroadcast } = require("../services/lineService");

const router = express.Router();

function isValidDeviceId(deviceId) {
    return typeof deviceId === "string" && deviceId.trim().length > 0 && deviceId.length <= 100;
}

function serializeSlots(settings) {
    return settings.slots;
}


// ========================================
// Dashboard schedule settings
// ========================================
router.get("/settings", async (req, res) => {
    const { deviceId } = req.query;

    if (!isValidDeviceId(deviceId)) {
        return res.status(400).json({ status: "error", message: "deviceId is required" });
    }

    const device = await database.getOrCreateSettings(deviceId);
    res.json({
        status: "success",
        deviceId,
        slots: serializeSlots(device),
        updated_at: Math.floor(new Date(device.updated_at).getTime() / 1000)
    });
});

router.put("/settings", async (req, res) => {
    const { deviceId, slots } = req.body || {};

    if (!isValidDeviceId(deviceId)) {
        return res.status(400).json({ status: "error", message: "deviceId is required" });
    }

    if (!slots || typeof slots !== "object" || Array.isArray(slots)) {
        return res.status(400).json({ status: "error", message: "slots must be an object" });
    }

    for (const name of ["morning", "noon", "evening", "bedtime"]) {
        const slot = slots[name];
        if (!slot || !Number.isInteger(slot.h) || slot.h < 0 || slot.h > 23 ||
            !Number.isInteger(slot.m) || slot.m < 0 || slot.m > 59 ||
            typeof slot.enabled !== "boolean") {
            return res.status(400).json({
                status: "error",
                message: `slots.${name} must include valid h, m, and enabled values`
            });
        }
    }

    const saved = await database.saveSettings(deviceId, slots);
    res.json({ status: "success", deviceId, slots: serializeSlots(saved) });
});


// ========================================
// GET /api/pillbox/sync
// ESP32 ใช้เรียกเพื่อดึงเวลาตั้งยา
// ========================================
router.get("/sync", async (req, res) => {

    const { deviceId } = req.query;

    if (!isValidDeviceId(deviceId)) {
        return res.status(400).json({
            status: "error",
            message: "deviceId is required"
        });
    }

    const device = await database.getOrCreateSettings(deviceId);

    res.json({
        status: "success",
        deviceId: deviceId,
        slots: serializeSlots(device),
        updated_at: Math.floor(new Date(device.updated_at).getTime() / 1000)
    });
});


// ========================================
// POST /api/pillbox/log
// ESP32 ใช้ส่งข้อมูลการกินยา
// ========================================
router.post("/log", async (req, res) => {

    const {
        deviceId,
        slot_name,
        slot_index,
        taken_time,
        delay_sec,
        is_delayed,
        is_skipped = false,
        next_alert
    } = req.body || {};


    // ------------------------------------
    // ตรวจสอบ deviceId
    // ------------------------------------
    if (!isValidDeviceId(deviceId)) {
        return res.status(400).json({
            status: "error",
            message: "deviceId is required"
        });
    }


    // ------------------------------------
    // ตรวจสอบชื่อช่วงเวลา
    // ------------------------------------
    const allowedSlots = [
        "morning",
        "noon",
        "evening",
        "bedtime"
    ];

    if (!allowedSlots.includes(slot_name)) {
        return res.status(400).json({
            status: "error",
            message: "Invalid slot_name"
        });
    }


    // ------------------------------------
    // ตรวจสอบ slot_index
    // ------------------------------------
    if (
        !Number.isInteger(slot_index) ||
        slot_index < 0 ||
        slot_index > 3
    ) {
        return res.status(400).json({
            status: "error",
            message: "slot_index must be between 0 and 3"
        });
    }


    // ------------------------------------
    // ตรวจสอบ taken_time
    // ------------------------------------
    if (!Number.isInteger(taken_time)) {
        return res.status(400).json({
            status: "error",
            message: "taken_time must be Unix timestamp"
        });
    }


    // ------------------------------------
    // ตรวจสอบ delay_sec
    // ------------------------------------
    if (
        !Number.isInteger(delay_sec) ||
        delay_sec < 0
    ) {
        return res.status(400).json({
            status: "error",
            message: "delay_sec must be an integer >= 0"
        });
    }


    // ------------------------------------
    // ตรวจสอบ is_delayed
    // ------------------------------------
    if (typeof is_delayed !== "boolean") {
        return res.status(400).json({
            status: "error",
            message: "is_delayed must be true or false"
        });
    }

    if (typeof is_skipped !== "boolean") {
        return res.status(400).json({
            status: "error",
            message: "is_skipped must be true or false"
        });
    }

    if (!Number.isInteger(next_alert) || next_alert < 0) {
        return res.status(400).json({
            status: "error",
            message: "next_alert must be a Unix timestamp"
        });
    }


    // ------------------------------------
    // ตรวจสอบว่าเครื่องมีอยู่จริง
    // ------------------------------------
    const device = await database.getSettings(deviceId);

    if (!device) {
        return res.status(404).json({
            status: "error",
            message: "Device not found"
        });
    }

    const scheduledSlot = device.slots?.[slot_name];
    if (!scheduledSlot || !Number.isInteger(scheduledSlot.h) || !Number.isInteger(scheduledSlot.m)) {
        return res.status(500).json({
            status: "error",
            message: "Scheduled time is not configured for this slot"
        });
    }

    const scheduledTime = `${String(scheduledSlot.h).padStart(2, "0")}:${String(scheduledSlot.m).padStart(2, "0")}`;


    // ------------------------------------
    // บันทึกประวัติการกินยา
    // ------------------------------------
    const result = await database.insertLog({
        device_id: deviceId,
        slot_name,
        slot_index,
        scheduled_time: scheduledTime,
        taken_time,
        delay_sec,
        is_delayed,
        is_skipped,
        next_alert
    });


    console.log(
        "Medication log saved:",
        result.id
    );


    // ========================================
    // ส่งข้อความ LINE
    // ========================================

    const slotLabels = {
        morning: "เช้า",
        noon: "เที่ยง",
        evening: "เย็น",
        bedtime: "ก่อนนอน"
    };

    const slotLabel =
        slotLabels[slot_name] || slot_name;


    // แปลง next_alert จาก Unix timestamp
    // เป็นเวลา HH:mm
    const nextAlertTime = next_alert
        ? new Date(next_alert * 1000).toLocaleTimeString(
            "th-TH",
            {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }
        )
        : "--:--";


    let lineMessage;


    // ------------------------------------
    // กรณีกินตรงเวลา
    // ------------------------------------
    if (!is_delayed) {

        lineMessage =
            `คุณแม่ทานยา${slotLabel}เรียบร้อยแล้วค่ะ ` +
            `(ตรงเวลา) รอบถัดไปเวลา ${nextAlertTime} น.`;

    }


    // ------------------------------------
    // กรณีกินช้า
    // ------------------------------------
    else {

        const delayMinutes =
            Math.floor(delay_sec / 60);

        lineMessage =
            `คุณแม่ทานยา${slotLabel}แล้ว ` +
            `(ช้าไป ${delayMinutes} นาที) ` +
            `ระบบปรับเวลาเลื่อนรอบถัดไปเป็น ` +
            `${nextAlertTime} น. ให้อัตโนมัติ`;
    }


    console.log(
        "LINE message:",
        lineMessage
    );


    // ส่ง LINE
    const lineSent = is_skipped ? false : await sendLineBroadcast(lineMessage);


    // ------------------------------------
    // ตอบกลับ ESP32
    // ------------------------------------
    res.json({ status: "success", message: "Log recorded" });
});


// ========================================
// GET /api/pillbox/history
// ดูประวัติการกินยา
// ========================================
router.get("/history", async (req, res) => {

    const { deviceId, limit } = req.query;

    // ตรวจสอบ deviceId
    if (!deviceId) {
        return res.status(400).json({
            status: "error",
            message: "deviceId is required"
        });
    }


    // จำนวนรายการที่ต้องการ
    const historyLimit = limit === undefined ? 20 : Number(limit);

    if (
        !Number.isInteger(historyLimit) ||
        historyLimit < 1 ||
        historyLimit > 100
    ) {
        return res.status(400).json({
            status: "error",
            message: "limit must be between 1 and 100"
        });
    }


    // ดึงประวัติจากฐานข้อมูล
    const logs = await database.getLogs(deviceId, historyLimit);


    // แปลงข้อมูลให้อ่านง่าย
    const history = logs.map(log => {
        const scheduledTime = log.scheduled_time
            ? `${log.scheduled_time} น.`
            : "-";

        return {
            id: log.id,
            deviceId: log.device_id,
            slot_name: log.slot_name,
            slot_index: log.slot_index,
            scheduled_time: scheduledTime,
            taken_time: log.taken_time,
            delay_sec: log.delay_sec,
            delay_min: Math.floor(log.delay_sec / 60),
            is_delayed: log.is_delayed,
            is_skipped: log.is_skipped,
            next_alert: log.next_alert,
            created_at: log.created_at
        };
    });


    res.json({
        status: "success",
        deviceId: deviceId,
        count: history.length,
        history: history
    });
});


// ========================================
// GET /api/pillbox/status
// ตรวจสถานะการกินยา
// ========================================
router.get("/status", async (req, res) => {

    const { deviceId } = req.query;

    if (!deviceId) {
        return res.status(400).json({
            status: "error",
            message: "deviceId is required"
        });
    }


    // ------------------------------------
    // หาอุปกรณ์
    // ------------------------------------
    const device = await database.getSettings(deviceId);

    if (!device) {
        return res.status(404).json({
            status: "error",
            message: "Device not found"
        });
    }


    // ------------------------------------
    // เวลาปัจจุบัน
    // ------------------------------------
    const now = new Date();

    const currentHour =
        now.getHours();

    const currentMinute =
        now.getMinutes();

    const currentSecond =
        now.getSeconds();

    const currentTotalSeconds =
        currentHour * 3600 +
        currentMinute * 60 +
        currentSecond;


    // ------------------------------------
    // ตารางเวลายา
    // ------------------------------------
    const slots = ["morning", "noon", "evening", "bedtime"].map((name, index) => ({
        slot_name: name,
        slot_index: index,
        hour: device.slots[name].h,
        minute: device.slots[name].m,
        enabled: device.slots[name].enabled
    }));


    // ------------------------------------
    // คำนวณ Unix timestamp
    // ของต้นวันและวันถัดไป
    // ------------------------------------
    const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
    );

    const tomorrowStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0,
        0
    );

    const todayStartUnix =
        Math.floor(todayStart.getTime() / 1000);

    const tomorrowStartUnix =
        Math.floor(tomorrowStart.getTime() / 1000);


    // ------------------------------------
    // สร้างข้อมูลแต่ละช่วงเวลา
    // ------------------------------------
    const result = await Promise.all(slots.map(async slot => {

        if (!slot.enabled) {
            return {
                slot_name: slot.slot_name,
                slot_index: slot.slot_index,
                scheduled_time: `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`,
                current_time: `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`,
                enabled: false,
                taken: false,
                delay_sec: 0,
                delay_min: 0,
                is_delayed: false,
                taken_time: null
            };
        }

        const scheduledTotalSeconds =
            slot.hour * 3600 +
            slot.minute * 60;


        // ========================================
        // ตรวจว่ารอบนี้กินยาแล้วหรือยัง
        // เฉพาะข้อมูลของวันนี้
        // ========================================
                const log = await database.getLogForSlot(
            deviceId,
            slot.slot_name,
            todayStartUnix,
            tomorrowStartUnix
        );


        // ========================================
        // ถ้ามี log แปลว่ากินยาแล้ว
        // ========================================
        if (log) {

            const takenDelaySec =
                Number(log.delay_sec) || 0;

            const takenDelayMin =
                Math.floor(takenDelaySec / 60);

            return {

                slot_name:
                    slot.slot_name,

                slot_index:
                    slot.slot_index,

                scheduled_time:
                    `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`,

                current_time:
                    `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`,

                taken:
                    true,

                delay_sec:
                    takenDelaySec,

                delay_min:
                    takenDelayMin,

                is_delayed:
                    Boolean(log.is_delayed),

                taken_time:
                    log.taken_time
            };
        }


        // ========================================
        // ยังไม่ได้กินยา
        // ========================================

        // ถ้ายังไม่ถึงเวลานัด
        if (currentTotalSeconds < scheduledTotalSeconds) {

            return {

                slot_name:
                    slot.slot_name,

                slot_index:
                    slot.slot_index,

                scheduled_time:
                    `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`,

                current_time:
                    `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`,

                taken:
                    false,

                delay_sec:
                    0,

                delay_min:
                    0,

                is_delayed:
                    false,

                taken_time:
                    null
            };
        }


        // ------------------------------------
        // เลยเวลานัดแล้ว แต่ยังไม่ได้กิน
        // ------------------------------------
        const overdueSec =
            currentTotalSeconds -
            scheduledTotalSeconds;


        // ถ้าเลยเวลาเกิน 30 นาที
        const isDelayed =
            overdueSec > 1800;


        return {

            slot_name:
                slot.slot_name,

            slot_index:
                slot.slot_index,

            scheduled_time:
                `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`,

            current_time:
                `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`,

            taken:
                false,

            // ยังไม่ได้กิน จึงยังไม่มี delay จริง
            delay_sec:
                0,

            delay_min:
                0,

            is_delayed:
                isDelayed,

            taken_time:
                null
        };
    }));


    // ------------------------------------
    // ส่งผลลัพธ์
    // ------------------------------------
    res.json({
        status: "success",
        deviceId: deviceId,

        current_time:
            `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`,

        slots: result
    });
});


module.exports = router;