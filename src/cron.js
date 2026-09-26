const cron = require("node-cron");
const database = require("./services/database");
const { sendLineBroadcast } = require("./services/lineService");


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

const BANGKOK_TIME_ZONE = "Asia/Bangkok";

function getBangkokDateParts(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BANGKOK_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);

    return Object.fromEntries(parts
        .filter(part => part.type !== "literal")
        .map(part => [part.type, Number(part.value)]));
}

function getBangkokDayBounds(date) {
    const { year, month, day } = getBangkokDateParts(date);
    const bangkokMidnightAsUtc = Date.UTC(year, month - 1, day) - 7 * 60 * 60 * 1000;
    return {
        start: Math.floor(bangkokMidnightAsUtc / 1000),
        end: Math.floor((bangkokMidnightAsUtc + 24 * 60 * 60 * 1000) / 1000)
    };
}


// ฟังก์ชันตรวจสอบการแจ้งเตือน
async function checkMedicationReminders() {

    console.log("");
    console.log("========================================");
    console.log("Checking medication reminders...");
    console.log("Time:", new Date().toLocaleString("th-TH", { timeZone: BANGKOK_TIME_ZONE }));
    console.log("========================================");


    // วันที่ปัจจุบัน
    const now = new Date();

    const { year, month, day } = getBangkokDateParts(now);
    const todayString =
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const { start: startOfToday, end: startOfTomorrow } = getBangkokDayBounds(now);


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
                Date.UTC(year, month - 1, day, hour, minute) - 7 * 60 * 60 * 1000
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

            const lineSent = await sendLineBroadcast(lineMessage);


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

module.exports = {
    checkMedicationReminders,
    getBangkokDateParts,
    getBangkokDayBounds
};


console.log("Medication reminder cron started");