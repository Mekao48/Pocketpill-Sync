คุณคือ Senior Full-Stack Developer หน้าที่ของคุณคือสร้างระบบ Backend RESTful API และ Web Dashboard สำหรับระบบกล่องยาอัจฉริยะ (PocketPill Sync) ที่เชื่อมต่อกับไมโครคอนโทรลเลอร์ ESP32-C3

### 1. ภาพรวมระบบ (System Overview)
- ฮาร์ดแวร์ ESP32-C3 จะตื่นจาก Deep-sleep ตามตารางเวลา หรือเมื่อมีการเปิดฝากล่องยา
- ESP32-C3 จะเรียก API ผ่าน HTTP/JSON เพื่อ:
  1. ดึงตารางเวลากินยาและสถานะการเปิด/ปิดมื้อ (Sync)
  2. ส่งประวัติและเวลาที่เปิดกินยาจริง (Log)
- มีหน้าเว็บ Web Dashboard สำหรับผู้ดูแล/ครอบครัว เพื่อตรวจสอบประวัติย้อนหลัง และตั้งเวลาหรือเปิด/ปิดมื้อยา

---

### 2. โครงสร้างข้อมูลตารางยา (Medication Schedule Schema)
แบ่งออกเป็น 4 ช่วงเวลาประจำวัน รองรับการเปิด/ปิดใช้งานแต่ละมื้อ (เช่น ทานแค่มื้อเช้า-เย็น หรือวันละ 1 มื้อ):
- `morning` : เช้า (เช่น 08:00)
- `noon` : กลางวัน (เช่น 12:00)
- `evening` : เย็น (เช่น 18:00)
- `bedtime` : ก่อนนอน (เช่น 21:00)
แต่ละมื้อประกอบด้วย: `{ "h": number, "m": number, "enabled": boolean }`

---

### 3. ข้อกำหนด API Endpoints (API Specifications)

#### 3.1 สำหรับอุปกรณ์ ESP32-C3
1. **GET `/api/pillbox/sync`**
   - **Query Params:** `deviceId` (string, เช่น `BOX_001`)
  - **หน้าที่:** ส่งคืน schedule mode, ค่า interval และข้อมูลเวลา/สถานะ enabled ของทั้ง 4 มื้อ
   - **Response (200 OK):**
     ```json
     {
       "status": "success",
       "deviceId": "BOX_001",
       "slots": {
         "mode": "manual",
         "intervalHours": 4,
         "morning": { "h": 8, "m": 0, "enabled": true },
         "noon":    { "h": 12, "m": 0, "enabled": false },
         "evening": { "h": 18, "m": 30, "enabled": true },
         "bedtime": { "h": 21, "m": 0, "enabled": false }
       },
       "updated_at": 1774465200
     }
     ```

2. **POST `/api/pillbox/log`**
   - **Headers:** `Content-Type: application/json`
   - **หน้าที่:** รับข้อมูลบันทึกการกินยาจริงจากตัวกล่อง
   - **Request Body:**
     ```json
     {
       "deviceId": "BOX_001",
       "slot_name": "evening",
       "slot_index": 2,
       "taken_time": 1774467000,
       "delay_sec": 2400,
       "is_delayed": true,
       "is_skipped": false,
       "next_alert": 1774477800
     }
     ```
   - **คำอธิบายฟิลด์:**
     - `taken_time`: Unix timestamp ที่เปิดกล่องยาจริง
     - `delay_sec`: จำนวนวินาทีที่เปิดช้ากว่าเวลาที่ตั้งไว้
     - `is_delayed`: true หากกินช้าเกิน 30 นาที (1800 วินาที)
     - `is_skipped`: true กรณีมื้อดึกถูกข้ามเนื่องจากมื้อเย็นกินช้าเกินไป
     - `next_alert`: Unix timestamp ของการนัดหมายรอบถัดไป
   - **Response (200 OK):** `{"status": "success", "message": "Log recorded"}`

#### 3.2 สำหรับหน้าเว็บ Dashboard
1. **GET `/api/pillbox/settings`**
   - Query: `deviceId`
   - คืนค่าตารางเวลาปัจจุบันเพื่อนำไปแสดงผลบนฟอร์ม
2. **PUT `/api/pillbox/settings`**
   - อัปเดตโหมดและตารางเวลา
   - `mode` คือ `manual` หรือ `interval`; `intervalHours` ต้องเป็นจำนวนเต็ม 1–24
   - Request Body:
     ```json
     {
       "deviceId": "BOX_001",
       "mode": "interval",
       "intervalHours": 4,
       "slots": {
         "morning": { "h": 8, "m": 0, "enabled": true },
         "noon": { "h": 12, "m": 0, "enabled": true },
         "evening": { "h": 18, "m": 0, "enabled": true },
         "bedtime": { "h": 21, "m": 0, "enabled": true }
       }
     }
     ```
   - Backward compatibility: หากไม่ส่ง `mode` จะถือเป็น `manual`; หากไม่ส่ง `intervalHours` จะใช้ `4`
3. **GET `/api/pillbox/history`**
   - Query: `deviceId`, `limit` (default: 20)
   - คืนรายการ Log ประวัติการกินยาย้อนหลัง เรียงจากล่าสุดไปเก่าสุด

---

### 4. สิ่งที่ต้องการให้พัฒนา (Deliverables)
1. **Backend Server (Node.js + Express):**
   - รันที่พอร์ต 3000 โดยเปิด host เป็น `0.0.0.0`
   - จัดการ CORS, Body Parsing, และ Input Validation
   - เก็บข้อมูลลงฐานข้อมูล SQLite (หรือ Mock Data ในหน่วยความจำที่พร้อมสลับเป็น DB จริง)
2. **Web Dashboard (HTML5 / Tailwind CSS / Vanilla JS):**
   - เสิร์ฟผ่าน Static folder หรือ Route `/`
   - หน้าจอ UI สะอาด เรียบง่าย ดูบนมือถือได้สะดวก (Mobile-Friendly)
   - ฟอร์มแก้ไขเวลาและสวิตช์ Toggle เปิด/ปิด แต่ละมื้อยา พร้อมปุ่มบันทึก
   - ตารางแสดงประวัติย้อนหลัง พร้อม Badge แสดงสถานะ (ตรงเวลา / ล่าช้า / ข้ามมื้อ)

### 5. ข้อกำหนด ESP32 สำหรับ Interval Mode
- อ่าน `slots.mode` และ `slots.intervalHours` จาก response ของ `/api/pillbox/sync`
- เมื่อ `mode == "manual"` ให้ใช้ slots ทั้ง 4 ตามเดิม
- เมื่อ `mode == "interval"` ให้ใช้ `intervalHours`; ไม่ใช้เวลา fixed ของ 4 slots ในการตั้ง alarm
- เมื่อบอร์ดส่ง log ใน interval mode ใช้ `slot_name: "interval"` และ `slot_index` เป็นลำดับรอบยา เริ่มจาก 0 และเพิ่มขึ้นทุกครั้ง
- `scheduled_time` ใน history API คำนวณจาก `taken_time - delay_sec` สำหรับ log แบบ interval
- ดูตัวแปรและ flow ตัวอย่างใน [`ESP32_INTERVAL_MODE.md`](ESP32_INTERVAL_MODE.md)