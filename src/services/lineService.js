const LINE_BROADCAST_API_URL = "https://api.line.me/v2/bot/message/broadcast";

async function sendLineBroadcast(message) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!token) {
        console.log("❌ LINE_CHANNEL_ACCESS_TOKEN not found");
        return false;
    }

    try {
        const response = await fetch(LINE_BROADCAST_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
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
                "LINE Broadcast Error:",
                response.status,
                errorText
            );

            return false;
        }

        console.log("LINE broadcast sent successfully");

        return true;

    } catch (error) {
        console.error("LINE broadcast connection error:", error);

        return false;
    }
}

module.exports = {
    sendLineBroadcast
};