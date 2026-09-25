const express = require("express");
const db = require("../../database/database");
const { sendLinePush } = require("../services/lineService");

const router = express.Router();


// ========================================
// GET /api/pillbox/sync
// ESP32 ใช้เรียกเพื่อดึงเวลาตั้งยา
// ========================================
router.get("/sync", (req, res) => {

    const { deviceId } = req.query;

    if (!deviceId) {
        return res.status(400).json({
            status: "error",
            message: "deviceId is required"
        });
    }

    let device = db.prepare(`
        SELECT *
        FROM pillbox_devices
        WHERE device_id = ?
    `).get(deviceId);

    // ถ้ายังไม่มีเครื่อง ให้สร้างเครื่องใหม่
    if (!device) {
        db.prepare(`
            INSERT INTO pillbox_devices (device_id)
            VALUES (?)
        `).run(deviceId);

        device = db.prepare(`
            SELECT *
            FROM pillbox_devices
            WHERE device_id = ?
        `).get(deviceId);
    }

    const slots = {
        morning: {
            h: device.morning_h,
            m: device.morning_m
        },
        noon: {
            h: device.noon_h,
            m: device.noon_m
        },
        evening: {
            h: device.evening_h,
            m: device.evening_m
        },
        bedtime: {
            h: device.bedtime_h,
            m: device.bedtime_m
        }
    };

    res.json({
        status: "success",
        deviceId: deviceId,
        slots: slots
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
        next_alert
    } = req.body;


    // ------------------------------------
    // ตรวจสอบ deviceId
    // ------------------------------------
    if (!deviceId) {
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


    // ------------------------------------
    // ตรวจสอบว่าเครื่องมีอยู่จริง
    // ------------------------------------
    const device = db.prepare(`
        SELECT *
        FROM pillbox_devices
        WHERE device_id = ?
    `).get(deviceId);

    if (!device) {
        return res.status(404).json({
            status: "error",
            message: "Device not found"
        });
    }


    // ------------------------------------
    // บันทึกประวัติการกินยา
    // ------------------------------------
    const result = db.prepare(`
        INSERT INTO medication_logs (
            device_id,
            slot_name,
            slot_index,
            taken_time,
            delay_sec,
            is_delayed,
            next_alert
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        deviceId,
        slot_name,
        slot_index,
        taken_time,
        delay_sec,
        is_delayed ? 1 : 0,
        next_alert || null
    );


    console.log(
        "Medication log saved:",
        result.lastInsertRowid
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
    const lineSent = await sendLinePush(
        device.line_user_id,
        lineMessage
    );


    // ------------------------------------
    // ตอบกลับ ESP32
    // ------------------------------------
    res.json({
        status: "success",
        message: "Medication log saved",
        logId: result.lastInsertRowid,

        line: {
            sent: lineSent
        },

        data: {
            deviceId,
            slot_name,
            slot_index,
            taken_time,
            delay_sec,
            is_delayed,
            next_alert: next_alert || null
        }
    });
});


// ========================================
// GET /api/pillbox/history
// ดูประวัติการกินยา
// ========================================
router.get("/history", (req, res) => {

    const { deviceId, limit } = req.query;

    // ตรวจสอบ deviceId
    if (!deviceId) {
        return res.status(400).json({
            status: "error",
            message: "deviceId is required"
        });
    }


    // จำนวนรายการที่ต้องการ
    const historyLimit = Number(limit) || 20;

    if (
        historyLimit < 1 ||
        historyLimit > 100
    ) {
        return res.status(400).json({
            status: "error",
            message: "limit must be between 1 and 100"
        });
    }


    // ดึงประวัติจากฐานข้อมูล
    const logs = db.prepare(`
        SELECT
            id,
            device_id,
            slot_name,
            slot_index,
            taken_time,
            delay_sec,
            is_delayed,
            next_alert,
            created_at
        FROM medication_logs
        WHERE device_id = ?
        ORDER BY taken_time DESC
        LIMIT ?
    `).all(deviceId, historyLimit);


    // แปลงข้อมูลให้อ่านง่าย
    const history = logs.map(log => ({
        id: log.id,
        deviceId: log.device_id,
        slot_name: log.slot_name,
        slot_index: log.slot_index,
        taken_time: log.taken_time,
        delay_sec: log.delay_sec,
        delay_min: Math.floor(
            log.delay_sec / 60
        ),
        is_delayed: Boolean(
            log.is_delayed
        ),
        next_alert: log.next_alert,
        created_at: log.created_at
    }));


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
router.get("/status", (req, res) => {

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
    const device = db.prepare(`
        SELECT *
        FROM pillbox_devices
        WHERE device_id = ?
    `).get(deviceId);

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
    const slots = [
        {
            slot_name: "morning",
            slot_index: 0,
            hour: device.morning_h,
            minute: device.morning_m
        },
        {
            slot_name: "noon",
            slot_index: 1,
            hour: device.noon_h,
            minute: device.noon_m
        },
        {
            slot_name: "evening",
            slot_index: 2,
            hour: device.evening_h,
            minute: device.evening_m
        },
        {
            slot_name: "bedtime",
            slot_index: 3,
            hour: device.bedtime_h,
            minute: device.bedtime_m
        }
    ];


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
    const result = slots.map(slot => {

        const scheduledTotalSeconds =
            slot.hour * 3600 +
            slot.minute * 60;


        // ========================================
        // ตรวจว่ารอบนี้กินยาแล้วหรือยัง
        // เฉพาะข้อมูลของวันนี้
        // ========================================
        const log = db.prepare(`
            SELECT *
            FROM medication_logs
            WHERE device_id = ?
              AND slot_name = ?
              AND taken_time >= ?
              AND taken_time < ?
            ORDER BY taken_time DESC
            LIMIT 1
        `).get(
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
    });


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