const express = require("express");
const crypto = require("crypto");
const db = require("../../database/database");

const router = express.Router();


// ========================================
// ตรวจสอบ LINE Webhook Signature
// ========================================
function verifyLineSignature(req) {

    const signature =
        req.headers["x-line-signature"];

    if (!signature) {
        return false;
    }

    const channelSecret =
        process.env.LINE_CHANNEL_SECRET;

    if (!channelSecret) {
        console.error(
            "❌ LINE_CHANNEL_SECRET not found"
        );

        return false;
    }

    if (!req.rawBody) {
        console.error(
            "❌ Raw request body not found"
        );

        return false;
    }

    const hash = crypto
        .createHmac(
            "SHA256",
            channelSecret
        )
        .update(req.rawBody)
        .digest("base64");

    return crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(signature)
    );
}


// ========================================
// POST /api/line/webhook
// LINE Messaging API Webhook
// ========================================
router.post("/webhook", (req, res) => {

    try {

        // ------------------------------------
        // ตรวจสอบว่าเป็น Webhook จาก LINE จริง
        // ------------------------------------
        if (!verifyLineSignature(req)) {

            console.log(
                "❌ Invalid LINE Webhook Signature"
            );

            return res.sendStatus(401);
        }


        console.log(
            "✅ LINE Webhook Signature verified"
        );


        const events =
            req.body.events || [];


        console.log(
            "========================================"
        );

        console.log(
            "LINE Webhook received"
        );

        console.log(
            "Events:",
            events.length
        );

        console.log(
            "========================================"
        );


        // LINE อาจส่ง events เป็น []
        if (events.length === 0) {

            return res.sendStatus(200);
        }


        for (const event of events) {

            console.log(
                "LINE Event Type:",
                event.type
            );


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
            // Follow Event
            // ------------------------------------
            if (event.type === "follow") {

                console.log(
                    "✅ User followed LINE Official Account"
                );
            }


            // ------------------------------------
            // Message Event
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