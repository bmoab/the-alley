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

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=thealleyoncenter@gmail.com
SMTP_PASS=<Google App Password>
EMAIL_FROM=The Alley On Center <thealleyoncenter@gmail.com>
OWNER_EMAIL=thealleyoncenter@gmail.com

CRON_SECRET=<random string>
```

---

## Persisting uploads (do at deploy time)

`DATABASE_PATH=/data/alley.db` puts the DB on the volume. Uploaded files,
however, currently write to `public/uploads` (see `lib/uploads.js`), which is
**not** on the volume. Before going live we need uploads on the same volume.

Recommended approach (single Railway volume at `/data`):
1. Store uploads under `/data/uploads` via a new `UPLOAD_DIR` env read in
   `lib/uploads.js`.
2. Serve them with a small streaming route at `app/uploads/[...path]/route.js`
   (since files outside `public/` aren't served automatically).
3. Keep the committed sample `public/uploads/rental-agreement.pdf` working by
   having the route fall back to `public/uploads` when a file isn't on the volume
   (or copy it onto the volume on first boot).

This is a ~1 hour change; it's deferred until the Railway volume exists so it can
be tested against the real mount.

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
