# Voucher Validity: Cumulative Time (limit-uptime)

## Problem

By default, MikroTik hotspot uses **session-timeout** on user profiles. This means:
- Each time a user **disconnects and reconnects**, they get a **new full session**
- A 24hr voucher effectively gives 24hr **per session**, not 24hr total

**Desired behavior:** A 24hr voucher bought at 8am should give 24hr **cumulative** time. If the user disconnects after 2hr and reconnects later, they should have **22hr left** — not a fresh 24hr.

---

## Solution: Use `limit-uptime`

MikroTik supports **limit-uptime** on hotspot users. This enforces **cumulative** time:
- Time used is preserved across disconnect/reconnect
- When the limit is reached, the user cannot reconnect until the counter is reset

---

## RouterHub (Fixed)

**RouterHub voucher generation** now adds `limit-uptime` when creating hotspot users. New vouchers generated via the RouterHub dashboard will use cumulative time automatically.

**No action needed** — just generate vouchers as usual.

---

## MikHmon

If you create vouchers via **MikHmon** (the PHP hotspot manager), you need to configure it to use `limit-uptime` instead of relying on profile `session-timeout`.

### Option 1: Change the User Profile on MikroTik

1. In **Winbox** or **SSH**, go to: `IP → Hotspot → User Profiles`
2. Edit the profile used for vouchers (e.g. "24-Hours", "1-Day")
3. Remove or increase **Session Timeout** (this resets each session)
4. Add **Limit Uptime** = your validity (e.g. `24h`, `1d`, `7d`)

### Option 2: MikHmon Profile Configuration

In MikHmon, when creating/editing a **User Profile**:
- Look for **Limit Uptime** or **Validity** settings
- Ensure the profile uses **limit-uptime** when creating users on MikroTik
- Some MikHmon versions map "Validity" to `session-timeout` — you may need to manually edit the profile on MikroTik to use `limit-uptime` instead

### Option 3: Edit Profile via MikroTik API

After MikHmon creates a profile, you can update it on MikroTik:

```
/ip hotspot user profile set [find name="YourProfileName"] limit-uptime=24h
```

(Remove or set `session-timeout` to a very high value so it doesn't interfere.)

---

## Verifying

1. Create a test voucher (e.g. 1hr)
2. Connect, use for ~10 minutes, then disconnect
3. Reconnect — you should see **~50 minutes left**, not a fresh 1hr

---

## Summary

| Setting           | Behavior                                      |
|-------------------|-----------------------------------------------|
| **session-timeout** | Per-session limit; resets on disconnect      |
| **limit-uptime**   | Cumulative limit; preserved across sessions  |

Use **limit-uptime** for vouchers so time counts down whether the user is connected or not.
