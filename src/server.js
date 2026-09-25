require("dotenv").config();

const express = require("express");
const db = require("../database/database");

require("./cron");

const pillboxRoutes = require("./routes/pillboxRoutes");
const webRoutes = require("./routes/webRoutes");
const lineRoutes = require("./routes/lineRoutes");
const historyRoutes = require("./routes/historyRoutes");
const app = express();
const PORT = 3000;

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

app.use(express.static("public"));

// หน้าแรก
app.get("/", (req, res) => {
    res.json({
        status: "success",
        message: "Smart Medicine Box API is running"
    });
});


// Routes สำหรับกล่องยา ESP32
app.use("/api/pillbox", pillboxRoutes);


// Routes สำหรับเว็บไซต์
app.use("/api/web", webRoutes);


// Routes สำหรับ LINE
app.use("/api/line", lineRoutes);


app.use("/api/history", historyRoutes);

// เริ่ม Server
app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Pocketpill-Sync API running at http://localhost:${PORT}`
    );
});