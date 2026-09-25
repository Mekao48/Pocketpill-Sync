const cron = require("node-cron");
const db = require("../database/database");
const { sendLinePush } = require("./services/lineService");


// ชื่อช่วงเวลาสำหรับแสดงใน LINE
const slotLabels = {
    morning: "เช้า",
    noon: "เที่ยง",
    evening: "เย็น",
    bedtime: "ก่อนนอน"
};


// ตารางเวลาของแต่ละ slot
const slotConfig = [
    {
        name: "morning",
        index: 0,
        hourField: "morning_h",
        minuteField: "morning_m"
    },
    {
        name: "noon",
        index: 1,
        hourField: "noon_h",
        minuteField: "noon_m"
    },
    {
        name: "evening",
        index: 2,
        hourField: "evening_h",
        minuteField: "evening_m"
    },
    {
        name: "bedtime",
        index: 3,
        hourField: "bedtime_h",
        minuteField: "bedtime_m"
    }
];


// ฟังก์ชันตรวจสอบการแจ้งเตือน
async function checkMedicationReminders() {

    console.log("");
    console.log("========================================");
    console.log("Checking medication reminders...");
    console.log("Time:", new Date().toLocaleString("th-TH"));
    console.log("========================================");


    // วันที่ปัจจุบัน
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();

    const todayString =
        `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;


    // ดึงข้อมูลกล่องยาทั้งหมด
    const devices = db.prepare(`
        SELECT *
        FROM pillbox_devices
    `).all();


    // ตรวจสอบแต่ละกล่อง
    for (const device of devices) {

        // ตรวจสอบทั้ง 4 ช่วงเวลา
        for (const slot of slotConfig) {

            const hour = Number(device[slot.hourField]);
            const minute = Number(device[slot.minuteField]);


            // เวลาที่ควรกินยาในวันนี้
            const scheduledTime = new Date(
                year,
                month,
                date,
                hour,
                minute,
                0,
                0
            );


            // เวลาปัจจุบันมากกว่าเวลาที่กำหนดกี่นาที
            const delayMinutes =
                (now.getTime() - scheduledTime.getTime()) / 60000;


            /*
            |--------------------------------------------------------------------------
            | ยังไม่ถึงเวลา หรือเลยเวลาไม่ถึง 30 นาที
            |--------------------------------------------------------------------------
            */

            if (delayMinutes <= 30) {
                continue;
            }


            /*
            |--------------------------------------------------------------------------
            | ตรวจสอบว่ากินยาแล้วหรือยังในวันนี้
            |--------------------------------------------------------------------------
            */

            const takenToday = db.prepare(`
                SELECT id
                FROM medication_logs
                WHERE device_id = ?
                AND slot_name = ?
                AND date(
                    taken_time,
                    'unixepoch',
                    'localtime'
                ) = date('now', 'localtime')
                LIMIT 1
            `).get(
                device.device_id,
                slot.name
            );


            if (takenToday) {

                console.log(
                    `[${device.device_id}] ${slot.name}: medication already taken`
                );

                continue;
            }


            /*
            |--------------------------------------------------------------------------
            | ตรวจสอบว่าแจ้งเตือนไปแล้วหรือยัง
            |--------------------------------------------------------------------------
            */

            const reminderAlreadySent = db.prepare(`
                SELECT id
                FROM medication_reminders
                WHERE device_id = ?
                AND slot_name = ?
                AND reminder_date = ?
                LIMIT 1
            `).get(
                device.device_id,
                slot.name,
                todayString
            );


            if (reminderAlreadySent) {

                console.log(
                    `[${device.device_id}] ${slot.name}: reminder already sent today`
                );

                continue;
            }


            /*
            |--------------------------------------------------------------------------
            | สร้างข้อความ LINE
            |--------------------------------------------------------------------------
            */

            const slotLabel = slotLabels[slot.name];

            const lineMessage =
                `แจ้งเตือน! เลยเวลาทานยา${slotLabel}มา 30 นาทีแล้ว คุณแม่ยังไม่ได้เปิดกล่องยา`;


            console.log(
                `[${device.device_id}] ${slot.name}: sending LINE reminder...`
            );


            /*
            |--------------------------------------------------------------------------
            | ส่ง LINE
            |--------------------------------------------------------------------------
            */

            const lineSent = await sendLinePush(
                device.line_user_id,
                lineMessage
            );


            /*
            |--------------------------------------------------------------------------
            | บันทึก reminder เฉพาะเมื่อส่ง LINE สำเร็จ
            |--------------------------------------------------------------------------
            */

            if (lineSent) {

                try {

                    db.prepare(`
                        INSERT OR IGNORE INTO medication_reminders (
                            device_id,
                            slot_name,
                            reminder_date,
                            sent_at
                        )
                        VALUES (?, ?, ?, ?)
                    `).run(
                        device.device_id,
                        slot.name,
                        todayString,
                        Math.floor(Date.now() / 1000)
                    );


                    console.log(
                        `✅ [${device.device_id}] ${slot.name}: LINE reminder sent`
                    );

                } catch (error) {

                    console.error(
                        `❌ [${device.device_id}] ${slot.name}: failed to save reminder`,
                        error
                    );

                }

            } else {

                console.log(
                    `❌ [${device.device_id}] ${slot.name}: LINE reminder failed`
                );

            }
        }
    }
}


/*
|--------------------------------------------------------------------------
| ตรวจสอบทันทีเมื่อ Server เริ่มทำงาน
|--------------------------------------------------------------------------
*/

checkMedicationReminders();


/*
|--------------------------------------------------------------------------
| ตรวจสอบทุก 5 นาที
|--------------------------------------------------------------------------
*/

cron.schedule("*/5 * * * *", async () => {

    await checkMedicationReminders();

});


console.log("Medication reminder cron started");