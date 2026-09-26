const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function execute(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

async function getSettings(deviceId) {
    return execute(
        supabase
            .from("pillbox_settings")
            .select("device_id,slots,updated_at")
            .eq("device_id", deviceId)
            .maybeSingle()
    );
}

async function getOrCreateSettings(deviceId) {
    const settings = await getSettings(deviceId);
    if (settings) return settings;

    const slots = {
        morning: { h: 8, m: 0, enabled: true },
        noon: { h: 12, m: 0, enabled: true },
        evening: { h: 18, m: 0, enabled: true },
        bedtime: { h: 21, m: 0, enabled: true }
    };

    return execute(
        supabase
            .from("pillbox_settings")
            .upsert({ device_id: deviceId, slots }, { onConflict: "device_id" })
            .select("device_id,slots,updated_at")
            .single()
    );
}

async function saveSettings(deviceId, slots) {
    return execute(
        supabase
            .from("pillbox_settings")
            .upsert({ device_id: deviceId, slots, updated_at: new Date().toISOString() }, { onConflict: "device_id" })
            .select("device_id,slots,updated_at")
            .single()
    );
}

async function getLogs(deviceId, limit) {
    return execute(
        supabase
            .from("pillbox_logs")
            .select("id,device_id,slot_name,slot_index,scheduled_time,taken_time,delay_sec,is_delayed,is_skipped,next_alert,created_at")
            .eq("device_id", deviceId)
            .order("taken_time", { ascending: false })
            .limit(limit)
    );
}

async function insertLog(log) {
    return execute(
        supabase
            .from("pillbox_logs")
            .insert(log)
            .select("id")
            .single()
    );
}

async function getLogForSlot(deviceId, slotName, startTime, endTime) {
    return execute(
        supabase
            .from("pillbox_logs")
            .select("*")
            .eq("device_id", deviceId)
            .eq("slot_name", slotName)
            .gte("taken_time", startTime)
            .lt("taken_time", endTime)
            .order("taken_time", { ascending: false })
            .limit(1)
            .maybeSingle()
    );
}

async function getDevices() {
    return execute(
        supabase
            .from("pillbox_settings")
            .select("device_id,slots")
    );
}

async function hasReminder(deviceId, slotName, reminderDate) {
    const reminder = await execute(
        supabase
            .from("pillbox_reminders")
            .select("id")
            .eq("device_id", deviceId)
            .eq("slot_name", slotName)
            .eq("reminder_date", reminderDate)
            .maybeSingle()
    );
    return Boolean(reminder);
}

async function insertReminder(reminder) {
    return execute(
        supabase
            .from("pillbox_reminders")
            .upsert(reminder, {
                onConflict: "device_id,slot_name,reminder_date",
                ignoreDuplicates: true
            })
    );
}

module.exports = {
    getSettings,
    getOrCreateSettings,
    saveSettings,
    getLogs,
    insertLog,
    getLogForSlot,
    getDevices,
    hasReminder,
    insertReminder
};