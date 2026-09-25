const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

async function sendLinePush(lineUserId, message) {
    if (!lineUserId) {
        console.log("⚠️ LINE User ID not found");
        return false;
    }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!token) {
        console.log("❌ LINE_CHANNEL_ACCESS_TOKEN not found");
        return false;
    }

    try {
        const response = await fetch(LINE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                to: lineUserId,
                messages: [
                    {
                        type: "text",
                        text: message
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();

            console.error(
                "❌ LINE Push Error:",
                response.status,
                errorText
            );

            return false;
        }

        console.log("✅ LINE message sent successfully");

        return true;

    } catch (error) {
        console.error("❌ LINE connection error:", error);

        return false;
    }
}

module.exports = {
    sendLinePush
};