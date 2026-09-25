const express = require("express");
const crypto = require("crypto");
const db = require("../../database/database");

const router = express.Router();


// ========================================
// POST /api/line/webhook
// LINE Messaging API Webhook
// ========================================
router.post("/webhook", (req, res) => {

    try {

        const events = req.body.events || [];

        console.log("========================================");
        console.log("LINE Webhook received");
        console.log("Events:", events.length);
        console.log("========================================");


        // LINE อาจส่ง events เป็น []
        // เพื่อทดสอบการเชื่อมต่อ
        if (events.length === 0) {
            return res.sendStatus(200);
        }


        for (const event of events) {

            console.log("LINE Event Type:", event.type);


            // ------------------------------------
            // ดึง LINE User ID
            // ------------------------------------
            const lineUserId =
                event.source?.userId;


            if (!lineUserId) {
                console.log(
                    "⚠️ No LINE User ID in this event"
                );

                continue;
            }


            console.log(
                "LINE User ID:",
                lineUserId
            );


            // ------------------------------------
            // ถ้าเป็น follow event
            // ผู้ใช้เพิ่ม OA เป็นเพื่อน
            // ------------------------------------
            if (event.type === "follow") {

                console.log(
                    "✅ User followed LINE Official Account"
                );

            }


            // ------------------------------------
            // ถ้าเป็น message event
            // ผู้ใช้ส่งข้อความหา OA
            // ------------------------------------
            if (event.type === "message") {

                console.log(
                    "💬 User sent a message"
                );

            }


            // ------------------------------------
            // บันทึก LINE User ID ให้ BOX_001
            // ------------------------------------
            db.prepare(`
                UPDATE pillbox_devices
                SET line_user_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE device_id = ?
            `).run(
                lineUserId,
                "BOX_001"
            );


            console.log(
                "✅ LINE User ID saved to BOX_001"
            );
        }


        // LINE ต้องการ HTTP 200
        res.sendStatus(200);


    } catch (error) {

        console.error(
            "❌ LINE Webhook Error:",
            error
        );

        res.sendStatus(500);
    }
});


module.exports = router;