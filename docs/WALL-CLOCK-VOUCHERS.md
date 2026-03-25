# Wall-clock voucher expiry (24h from first use, counts while offline)

## What to do now (simple order)

1. **Know your target:** You want **wall-clock from first login** (e.g. login 2:00 → must be finished 5:00 for a 3h plan, code dead after). RouterHub “new style” **alone** does **not** do that; you still need **Option C** below on each MikroTik (scripts) or an external system.
2. **RouterHub vouchers:** New codes are created **without** `limit-uptime`; timing comes from the profile’s **`session-timeout`** (and optional wall-clock scripts below). The **scripts** enforce strict first-login wall-clock if you deploy them.
3. **Deploy Option C on each router:** Step-by-step scripts (on-login + 1-minute scheduler) are in **[MIKROTIK-WALL-CLOCK-SCRIPTS.md](./MIKROTIK-WALL-CLOCK-SCRIPTS.md)** — test `[:timestamp]` first, then attach `on-login` only to voucher profiles. If something fails on your build, use the [MikroTik forum](https://forum.mikrotik.com/) with RouterOS version and profile names.
4. **Billing:** Do **not** delete sold vouchers. Keep generating new codes from billing → RouterHub as you do now.

---

## What you want

- Clock starts at **first successful login**.
- Time keeps running on the **real-world clock** while the user is disconnected, phone off, or the router reboots.
- When the window ends, the user **cannot** log in again.

## What MikroTik does by default

| Mechanism | Typical behaviour |
|-----------|-------------------|
| **`limit-uptime` on the hotspot user** (what Mikhmon/RouterHub often set) | Like a **stopwatch**: counts mainly while **connected**; pauses when offline → matches the issue you see. |
| **`session-timeout` on the profile** | Limits **one login session**. After disconnect, the next login may start a **new** session with a **new** full allowance unless you design around it (e.g. mac-cookie behaviour). It is **not** the same as “one fixed deadline from first ever login” by itself. |

So: **no single checkbox** on the router gives “24h wall-clock from first login including all offline time.” You choose one of the approaches below.

---

## Option A — RouterHub: profile `session-timeout` (default)

`generateVouchersOnMikrotik` **does not** set `limit-uptime` on voucher users. Plan length is intended to come from the hotspot **user profile**’s `session-timeout` (set when the profile is created or via **Fix all profiles** in RouterHub).

The legacy env `HOTSPOT_VOUCHER_LIMIT_UPTIME` is **ignored**.

**You must test** on your routers whether reconnect + mac-cookie gives users a **new** full session each time (bad for “one 24h window”) or continues one logical session. Profile `session-timeout` alone is **not** guaranteed to equal wall-clock from first login; use Option C for that.

Restart backend after changing `.env`.

---

## Option B — Mikhmon-generated vouchers

If vouchers are created in **Mikhmon**, RouterHub’s flag does not affect them. You need Mikhmon to **stop** pushing `limit-uptime` (or whatever maps to it) if that version allows it — check Mikhmon docs/forums for “validity / limit uptime / hotspot user add”.

---

## Option C — True wall-clock from first login (recommended for your rule)

Implement on **each MikroTik** (or use RADIUS/billing):

1. **On first login** — Hotspot **on-login** script (or similar) records a **fixed expiry time** for that user (e.g. append to `comment`, or use a script variable store).
2. **Scheduler** every 1–5 minutes — For each user with an expiry in the past: **disable** the hotspot user and **remove** active sessions.

Duration must match the **plan** (1d, 12h, …), often by reading the user’s **profile** name or a tag in `comment`.

This is the only approach that matches your wording regardless of disconnects or reboots, as long as the router’s clock is correct.

Search MikroTik forums for “hotspot wall clock expiry script” or “first login expiry comment” for copy-paste examples tuned to RouterOS 7.

---

## Option D — RouterHub + database (future idea)

Track `first_used_at` in MySQL when you detect first login (polling or webhook), compute expiry on the VPS, and **disable** the user via MikroTik API at expiry. More moving parts; good if you already centralise everything in RouterHub.

---

## Checklist

1. [ ] Decide: “session model only” (A/B + test) vs “real wall-clock” (C or D).
2. [ ] For RouterHub-only generation: confirm profiles have the right `session-timeout` (create profile or **Fix all**); verify with a **new** voucher: `/ip hotspot user print detail where name="..."` (no `limit-uptime`).
3. [ ] For Mikhmon: adjust creation so users are not created with `limit-uptime` if you move to profile-only timing.
4. [ ] For strict wall-clock: deploy Option C (or RADIUS) on each site.
