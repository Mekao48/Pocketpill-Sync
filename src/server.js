require("dotenv").config();

const express = require("express");
const path = require("path");
const { checkMedicationReminders } = require("./cron");

const pillboxRoutes = require("./routes/pillboxRoutes");
const lineRoutes = require("./routes/lineRoutes");
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// รับข้อมูล JSON จาก ESP32 และหน้าเว็บไซต์
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.use(express.static(path.join(__dirname, "../public")));

// หน้าแรก
app.get("/", (req, res) => {
    res.json({
        status: "success",
        message: "Smart Medicine Box API is running"
    });
});


// Routes สำหรับกล่องยา ESP32
app.use("/api/pillbox", pillboxRoutes);


// Routes สำหรับ LINE
app.use("/api/line", lineRoutes);


app.get("/api/cron/reminders", async (req, res) => {
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || req.headers.authorization !== `Bearer ${expectedToken}`) {
        return res.sendStatus(401);
    }

    try {
        await checkMedicationReminders();
        res.json({ status: "success" });
    } catch (error) {
        console.error("Medication reminder check failed:", error);
        res.status(500).json({ status: "error", message: "Reminder check failed" });
    }
});

app.use((error, req, res, next) => {
    console.error("API request failed:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(error.status || 500).json({
        status: "error",
        message: error.status && error.status < 500 ? error.message : "Internal server error"
    });
});

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Pocketpill-Sync API running at http://localhost:${PORT}`);
    });
}

module.exports = app;