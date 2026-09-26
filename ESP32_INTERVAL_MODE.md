# ESP32 Interval Mode Contract

The firmware source is not part of this repository, so these are the variables and behaviors to add to the ESP32-C3 project.

## Variables

```cpp
String scheduleMode = "manual";
uint8_t intervalHours = 4;
uint32_t intervalSeconds = 4UL * 60UL * 60UL;
uint32_t nextAlertEpoch = 0;
uint32_t intervalDoseIndex = 0;
```

Persist `nextAlertEpoch`, `intervalDoseIndex`, and the last-applied mode/interval using `Preferences` so they survive deep sleep. Use Unix epoch **seconds** from a valid NTP-synchronized clock; do not use `millis()` for values sent to the API.

## Sync

Call `GET /api/pillbox/sync?deviceId=BOX_001`. Read:

```json
{
  "slots": {
    "mode": "interval",
    "intervalHours": 4,
    "morning": { "h": 8, "m": 0, "enabled": true },
    "noon": { "h": 12, "m": 0, "enabled": true },
    "evening": { "h": 18, "m": 0, "enabled": true },
    "bedtime": { "h": 21, "m": 0, "enabled": true }
  }
}
```

When mode or interval changes, update the persisted values, calculate `intervalSeconds = intervalHours * 3600`, and start the first interval at `nowEpoch + intervalSeconds`. In manual mode, keep using the existing enabled meal times and ignore the interval timer.

## After A Dose

When an interval alarm is due and the box is opened:

1. Set `takenEpoch` from the current Unix time.
2. Calculate `delaySeconds = max(0, takenEpoch - nextAlertEpoch)`.
3. Set `isDelayed = delaySeconds > 1800`.
4. Calculate and persist `nextAlertEpoch = takenEpoch + intervalSeconds`.
5. Send the log below. Increment and persist `intervalDoseIndex` only after the log is accepted.

```json
{
  "deviceId": "BOX_001",
  "slot_name": "interval",
  "slot_index": 0,
  "taken_time": 1790000000,
  "delay_sec": 0,
  "is_delayed": false,
  "is_skipped": false,
  "next_alert": 1790014400
}
```

`slot_index` is a non-negative dose sequence number in interval mode. `next_alert` is required. For manual mode continue sending `slot_name` as `morning`, `noon`, `evening`, or `bedtime` and `slot_index` 0–3.

The backend returns `{"status":"success","message":"Log recorded"}` and broadcasts the medication message to LINE followers. The backend's scheduled reminder job intentionally skips interval-mode devices; the ESP32 firmware owns interval alarm timing and posts a log when the dose is taken.