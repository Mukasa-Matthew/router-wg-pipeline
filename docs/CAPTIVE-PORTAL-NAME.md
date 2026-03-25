# Why the Captive Portal May Not Show the Router Name

## What RouterHub Does When You Rename a Router

1. **MikroTik hotspot** – Updates the hotspot server `name` via API (so the variable `$(server-name)` gets the new value).
2. **MikHmon** – Updates the `hotspot-name` in MikHmon config (for voucher/session display).

## Why You Might Not See It

### 1. Default MikroTik Login Page Ignores the Name

The built‑in MikroTik login page does **not** use the hotspot name. It uses fixed text like `"internet hotspot > login"`.

To show the name, the login page must include the variable `$(server-name)` in the HTML.

### 2. MikroTik API Not Reachable

For routers where the API is not reachable (e.g. connection refused on 8728), the hotspot name is never updated on the router.

Check: On the router, run `/ip hotspot print` and look at the `name` column. If it’s still the old name, the API update never ran.

### 3. Custom HTML Directory in Use

If you use `html-override-directory` with custom login pages, those files decide what is shown. Unless they contain `$(server-name)`, the name will not appear.

---

## Fix: Use a Custom Login Page With `$(server-name)`

Create or edit a custom login page that uses `$(server-name)` where the name should appear.

Example in the title/heading:

```html
<title>$(server-name) - WiFi Login</title>
...
<h1>$(server-name)</h1>
<p>Please enter your voucher credentials</p>
```

### Steps (example for a single hotspot)

1. Connect to the router (Winbox, SSH, or FTP).
2. Copy the default hotspot HTML folder from `hotspot` to a new folder, e.g. `hotspot-custom`.
3. Edit `login.html` in `hotspot-custom`:
   - Add or change the title: `<title>$(server-name)</title>`
   - Add or change the heading: `<h1>$(server-name)</h1>`
4. Point the hotspot profile to this folder:

   ```
   /ip hotspot profile set [find] html-directory-override=hotspot-custom
   ```

5. Upload your modified `login.html` (and any other changed files) back to that folder on the router.

---

## Verify the Hotspot Name on the Router

To confirm the hotspot name was set correctly:

```
/ip hotspot print
```

Check that the `name` column reflects the new name. If it doesn’t, the API update from RouterHub did not apply (often because the API connection failed).
