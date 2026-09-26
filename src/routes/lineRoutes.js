const express = require("express");
const crypto = require("crypto");
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
router.post("/webhook", async (req, res) => {

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


            console.log(
                "LINE source type:",
                event.source?.type || "unknown"
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