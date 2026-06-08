# Deploying The Alley On Center (Railway)

This app keeps its data in a **file-based SQLite database** and stores **uploaded
photos/PDFs on the local filesystem**. That means it must run on a host with a
**persistent disk** — Railway (or Render, or a VPS). It will **not** work on
Vercel/Netlify, which wipe the filesystem between requests.

## Why not Vercel?
Vercel runs serverless functions with an ephemeral, read-only filesystem. The
SQLite file (`data/alley.db`) and the `/uploads` folder would be lost on every
request/restart. Railway runs the app as one always-on container with a mounted
volume, so both persist.

---

## One-time Railway setup

1. **Create the service** from the GitHub repo (Railway → New Project → Deploy
   from GitHub). Railway auto-detects Next.js (Nixpacks) and runs
   `npm run build` then `npm start`.
2. **Add a Volume** to the service and mount it at **`/data`**.
3. **Set environment variables** (Railway → Variables) — see the list below.
4. Deploy. First boot creates the database and seeds defaults automatically.

### Required environment variables
```
APP_URL=https://alleyoncenter.com
SESSION_SECRET=<64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_EMAIL=thealleyoncenter@gmail.com
ADMIN_PASSWORD=<a strong password>
DATABASE_PATH=/data/alley.db

# Square (production)
SQUARE_ACCESS_TOKEN=<prod token>
SQUARE_LOCATION_ID=<location id>
SQUARE_ENVIRONMENT=production

# Email — Resend (HTTPS API). Gmail SMTP does NOT work on Railway: Railway
# blocks outbound SMTP ports (25/465/587), so SMTP connections time out. Use an
# HTTPS email API instead. The app prefers Resend whenever RESEND_API_KEY is set.
RESEND_API_KEY=<re_... from resend.com>
EMAIL_FROM=The Alley On Center <hello@alleyoncenter.com>   # domain verified in Resend
OWNER_EMAIL=thealleyoncenter@gmail.com
# (SMTP_* vars are ignored when RESEND_API_KEY is present.)

UPLOAD_DIR=/data/uploads
CRON_SECRET=<random string>
```

---

## Persisting uploads — DONE (set the env var)

Both the DB and uploads live on the single `/data` volume:
- `DATABASE_PATH=/data/alley.db`
- `UPLOAD_DIR=/data/uploads`

On boot, `scripts/prestart.mjs` (wired into `npm start`) ensures `/data/uploads`
exists, copies the committed sample files (e.g. `rental-agreement.pdf`) onto the
volume once, and symlinks `public/uploads → /data/uploads` so Next keeps serving
`/uploads/*` from the persistent volume. It's idempotent and a **no-op locally**
(when `UPLOAD_DIR` is unset). Tested in a sandbox: first boot, reboot, and dev
mode all behave correctly.

So nothing more to build here — just set `UPLOAD_DIR=/data/uploads` in Railway.

---

## Cron (deposit reminders)

Add a Railway **Cron** (or an external scheduler) hitting
`GET https://alleyoncenter.com/api/cron/deposit-reminders` once a day with header
`Authorization: Bearer <CRON_SECRET>`.

---

## Backups

The whole dataset is one file. Schedule a daily copy of `/data/alley.db`
off the volume (Railway cron + `cp`, or download via a small admin export).

---

## DNS cutover (last step)

1. Verify everything on the temporary `*.up.railway.app` URL first.
2. In Railway → Settings → Domains, add `alleyoncenter.com`.
3. Update DNS at the registrar to the records Railway shows (CNAME/A).
4. Set `APP_URL=https://alleyoncenter.com` so email links are correct.
