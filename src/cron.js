const cron = require("node-cron");
const database = require("./services/database");
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
    },
    {
        name: "noon",
        index: 1,
    },
    {
        name: "evening",
        index: 2,
    },
    {
        name: "bedtime",
        index: 3,
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
    const devices = await database.getDevices();


    // ตรวจสอบแต่ละกล่อง
    for (const device of devices) {

        // ตรวจสอบทั้ง 4 ช่วงเวลา
        for (const slot of slotConfig) {

            const schedule = device.slots[slot.name];
            if (!schedule || !schedule.enabled) {
                continue;
            }

            const hour = Number(schedule.h);
            const minute = Number(schedule.m);


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

            const startOfToday = Math.floor(new Date(year, month, date).getTime() / 1000);
            const startOfTomorrow = Math.floor(new Date(year, month, date + 1).getTime() / 1000);
            const takenToday = await database.getLogForSlot(
                device.device_id,
                slot.name,
                startOfToday,
                startOfTomorrow
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

            const reminderAlreadySent = await database.hasReminder(
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

                    await database.insertReminder({
                        device_id: device.device_id,
                        slot_name: slot.name,
                        reminder_date: todayString,
                        sent_at: Math.floor(Date.now() / 1000)
                    });


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

if (process.env.VERCEL !== "1") {
    checkMedicationReminders().catch(error => {
        console.error("Medication reminder check failed:", error);
    });

    cron.schedule("*/5 * * * *", async () => {
        try {
            await checkMedicationReminders();
        } catch (error) {
            console.error("Medication reminder check failed:", error);
        }
    });
}

module.exports = { checkMedicationReminders };


console.log("Medication reminder cron started");