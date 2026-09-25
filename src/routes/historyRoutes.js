const express = require("express");
const db = require("../../database/database");

const router = express.Router();


// ========================================
// GET ประวัติการกินยา
// ========================================

router.get("/", (req, res) => {

    try {

        const deviceId =
            req.query.deviceId || "BOX_001";


        // ----------------------------------------
        // ดึงข้อมูลอุปกรณ์
        // ----------------------------------------

        const device = db.prepare(`
            SELECT *
            FROM pillbox_devices
            WHERE device_id = ?
        `).get(deviceId);


        if (!device) {

            return res.status(404).json({

                status: "error",

                message: "ไม่พบอุปกรณ์"

            });

        }


        // ----------------------------------------
        // ดึงประวัติ
        // ----------------------------------------

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
        `).all(deviceId);


        // ----------------------------------------
        // ชื่อคอลัมน์เวลา
        // ----------------------------------------

        const slotColumns = {

            morning: {
                h: "morning_h",
                m: "morning_m"
            },

            noon: {
                h: "noon_h",
                m: "noon_m"
            },

            evening: {
                h: "evening_h",
                m: "evening_m"
            },

            bedtime: {
                h: "bedtime_h",
                m: "bedtime_m"
            }

        };


        // ----------------------------------------
        // แปลงข้อมูล
        // ----------------------------------------

        const history = logs.map(log => {

            const slot =
                slotColumns[log.slot_name];


            let scheduledTime = "-";


            if (slot) {

                const hour =
                    String(device[slot.h])
                        .padStart(2, "0");

                const minute =
                    String(device[slot.m])
                        .padStart(2, "0");


                scheduledTime =
                    `${hour}:${minute} น.`;

            }


            return {

                id: log.id,

                device_id:
                    log.device_id,

                slot_name:
                    log.slot_name,

                slot_index:
                    log.slot_index,

                scheduled_time:
                    scheduledTime,

                taken_time:
                    log.taken_time,

                delay_sec:
                    log.delay_sec,

                is_delayed:
                    Boolean(log.is_delayed),

                next_alert:
                    log.next_alert,

                created_at:
                    log.created_at

            };

        });


        // ----------------------------------------
        // ส่งกลับ
        // ----------------------------------------

        res.json({

            status: "success",

            deviceId,

            total:
                history.length,

            history

        });


    } catch (error) {

        console.error(
            "History API Error:",
            error
        );


        res.status(500).json({

            status: "error",

            message:
                "ไม่สามารถดึงประวัติได้"

        });

    }

});


module.exports = router;