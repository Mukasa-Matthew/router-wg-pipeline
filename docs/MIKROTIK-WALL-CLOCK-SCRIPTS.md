# MikroTik wall-clock voucher expiry (first login → fixed deadline)

This matches the rule: **first successful login starts a real-world timer**; when it ends, the user is **kicked** and the **same code cannot log in again** (user disabled), even if they were offline in between.

**Requires RouterOS 7** with **`[:timestamp]`** (test below). **Apply on each hotspot router.**

---

## 0) Test `[:timestamp]` (30 seconds)

Paste in Terminal:

```ros
/system script add name=wctest source={:put ("TS=" . [:timestamp])}
/system script run wctest
/system script remove wctest
```

**What you should see:** RouterOS often prints something like `TS=2933w6d13:14:15.617130979` — that is **normal** on RouterOS 7. Per [MikroTik Scripting](https://help.mikrotik.com/docs/display/ROS/Scripting), `[:timestamp]` is **time since 1970-01-01**; the CLI just formats it like a duration. Internally it is **nanoseconds**, not “Unix seconds” as a small integer.

Quick sanity check (should print `time` then `true`):

```ros
:put [:typeof [:timestamp]]
:put ([:timestamp] > 0)
```

If those error, upgrade RouterOS or ask on the MikroTik forum before continuing.

---

## 1) Create the on-login script

**Winbox:** `System` → `Scripts` → `+`  
**Name:** `hs-wall-expiry-onlogin`  
**Policy:** enable **`read`**, **`write`**, **`policy`**, **`test`** (minimum so hotspot can run it).

**Source** (copy whole block):

```ros
{
:local u $user
:foreach id in=[/ip hotspot user find where name=$u] do={
  :local c [/ip hotspot user get $id comment]
  :if ([:find $c "WCEXP="] >= 0) do={ :return }
  :local p [/ip hotspot user get $id profile]
  :local secs 0
  :if ($p = "3-HRS") do={ :set secs 10800 }
  :if ($p = "12-HOURS") do={ :set secs 43200 }
  :if ($p = "daily") do={ :set secs 86400 }
  :if ($p = "DAILY-INTERNET") do={ :set secs 86400 }
  :if ($p = "1-WEEK") do={ :set secs 604800 }
  :if ($p = "WEEKLY") do={ :set secs 604800 }
  :if ($p = "MONTHLY") do={ :set secs 2592000 }
  :if ($p = "test") do={ :set secs 3600 }
  :if ($secs = 0) do={ :return }
  :local ns 1000000000
  :local exp ([:timestamp] + ($secs * $ns))
  :local newc $c
  :if ([:len $newc] > 0) do={ :set newc ($newc . "|") }
  :set newc ($newc . "WCEXP=" . $exp)
  /ip hotspot user set $id comment=$newc
  :log info ("WallClock: WCEXP set for " . $u . " exp=" . $exp)
}
}
```

**Profiles covered:** `3-HRS`, `12-HOURS`, `daily`, `DAILY-INTERNET` (24h), `1-WEEK`, `WEEKLY`, `MONTHLY` (30d = `4w2d`), `test`.  
`MONTHLY` here is **2592000** s (30 days). If your plan is **31 days**, use **2678400** instead.  
If you use **other profile names**, add more `:if ($p = "YourProfile") do={ :set secs ... }` lines (seconds: 1h=3600, 6h=21600, 12h=43200, 1d=86400, 7d=604800, 30d=2592000, 31d=2678400).

**Earlier doc revision:** If you already ran an on-login script that used `[:timestamp] + $secs` without multiplying seconds by `1000000000`, stored `WCEXP=` values can be wrong. Strip `WCEXP=…` from those users’ comments (or issue new codes) before relying on the version above.

---

## 2) Create the scheduler script

**Name:** `hs-wall-expiry-check`  
**Policy:** same as above (`read`, `write`, `policy`, `test`).

**Source:**

```ros
{
:local now [:timestamp]
:foreach id in=[/ip hotspot user find where comment~"WCEXP="] do={
  :local c [/ip hotspot user get $id comment]
  :local pos [:find $c "WCEXP="]
  :if ($pos >= 0) do={
    :local rest [:pick $c ($pos + 6) [:len $c]]
    :local exp [:tonum $rest]
    :if ($exp < 1) do={
      :local pipe [:find $rest "|"]
      :if ($pipe >= 0) do={
        :set exp [:tonum [:pick $rest 0 $pipe]]
      }
    }
    :if ($exp > 0) do={
      :if ($now > $exp) do={
        :local n [/ip hotspot user get $id name]
        :foreach a in=[/ip hotspot active find where user=$n] do={
          /ip hotspot active remove $a
        }
        /ip hotspot user disable $id
        :log info ("WallClock: expired and disabled " . $n)
      }
    }
  }
}
}
```

---

## 3) Run the check every minute

```ros
/system scheduler add name=hs-wall-expiry-sched interval=1m on-event=hs-wall-expiry-check start-time=startup
```

---

## 4) Attach on-login to each voucher profile

Repeat for **every hotspot user profile** used for paid vouchers (voucher **profile** name must match an `:if ($p = "...")` line in the script):

```ros
/ip hotspot user profile set [find name="3-HRS"] on-login=hs-wall-expiry-onlogin
/ip hotspot user profile set [find name="12-HOURS"] on-login=hs-wall-expiry-onlogin
/ip hotspot user profile set [find name="daily"] on-login=hs-wall-expiry-onlogin
/ip hotspot user profile set [find name="DAILY-INTERNET"] on-login=hs-wall-expiry-onlogin
/ip hotspot user profile set [find name="1-WEEK"] on-login=hs-wall-expiry-onlogin
/ip hotspot user profile set [find name="WEEKLY"] on-login=hs-wall-expiry-onlogin
/ip hotspot user profile set [find name="MONTHLY"] on-login=hs-wall-expiry-onlogin
/ip hotspot user profile set [find name="test"] on-login=hs-wall-expiry-onlogin
```

**Do not** attach to `default` if staff use it — the script exits with `secs=0` for unknown profiles, but safer to only set voucher profiles.

---

## 5) RouterHub / billing

- RouterHub **no longer sets `limit-uptime`** on new vouchers (profile `session-timeout` applies). Remove `limit-uptime` from **old** hotspot users if you still see it, so it does not fight the wall-clock script.
- **Old** users with `limit-uptime` still work until you clean them; after **first login** with this script they also get `WCEXP=` — ideally migrate to vouchers **without** `limit-uptime` only.

---

## 6) Quick test (3h profile)

1. Create a test hotspot user on profile **`3-HRS`**, no `limit-uptime`.
2. Log in once → comment should gain **`WCEXP=<number>`** (nanoseconds since Unix epoch; a long decimal string — not the `2933w…` display form) (`/ip hotspot user print detail where name="..."`).
3. Optional: temporarily set expiry in the past in comment (edit comment digits) → within 1 minute user should be disabled and kicked.

---

## Remove / rollback

```ros
/system scheduler remove [find name=hs-wall-expiry-sched]
/system script remove [find name=hs-wall-expiry-check]
/system script remove [find name=hs-wall-expiry-onlogin]
/ip hotspot user profile set [find name="3-HRS"] on-login=""
```

(Repeat `on-login=""` for each voucher profile you changed — `12-HOURS`, `daily`, etc.)
