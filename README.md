# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Environment variables for sign-in

| Variable | Needed | What it does |
|---|---|---|
| `SESSION_SECRET` | Recommended | Signs the sign-in cookies. When unset, the storage key (`BLOB_READ_WRITE_TOKEN` or `R2_SECRET_ACCESS_KEY`) is used instead, a warning is logged and the Admin panel shows a banner. Setting it, or changing it, signs everyone out once. Use a long random value. |
| `ADMIN_EMAILS` | Optional | Comma-separated emails treated as admins. On a brand-new deployment (no admin and no user has a password yet) and without `ADMIN_BOOTSTRAP_TOKEN`, one of these emails can sign in once with any password and must then choose a real one. |
| `ADMIN_BOOTSTRAP_TOKEN` | Optional | While no admin has a password, an admin (by role or in `ADMIN_EMAILS`) signs in once with this token as the password and must then choose a real one. Remove it once the first admin has a password. |

Once any admin has a password, neither bootstrap route applies: sign-in is by password only, and admins set everyone else's password in the Admin panel. There is no built-in password.

Local development (`npm run dev`) keeps its data in `.local-data`. On an empty `.local-data`, start it with `ADMIN_EMAILS=aman@tranzenergy.in npm run dev` (or with `ADMIN_BOOTSTRAP_TOKEN`) to set the first password.

## Storage (Cloudflare R2)

| Variable | Needed | What it does |
|---|---|---|
| `R2_ACCOUNT_ID` | Yes | Cloudflare account that holds the bucket. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Yes | R2 API token with read and write on the bucket. |
| `R2_BUCKET` | Yes | The bucket: drawings, CRS files, the workspace document `_system/db_state_v5.json` and the password store. Keep a copy of `_system/db_state_v5.json` before a deploy that changes how it is saved. |

### Activity log

The workspace log and each drawing's activity trail are not in `_system/db_state_v5.json`. Each entry is one immutable object, written create-only (`api/_lib/log.js`):

| Key | Holds |
|---|---|
| `_system/log/<revTs>-<id>.json` | workspace log entry |
| `_system/log-by/<userId>/<revTs>-<id>.json` | the same entry, indexed by author (what a consultant reads) |
| `_system/activity/<drawingId>/<revTs>-<id>.json` | drawing activity entry |
| `_system/activity-feed/<revTs>+<drawingId>+<id>.json` | the same entry, for recent activity across drawings |
| `_system/log-ids/<id>.json`, `_system/activity-ids/<drawingId>/<id>.json` | the id claim, written first |

`revTs` is `9999999999999 - epoch ms`, 13 digits, so a listing returns the newest first. The routes are `GET/POST /api/log`, `GET/POST /api/activity` and `POST /api/admin/migrate-log` (admin, `?dryRun=1`), which `vercel.json` rewrites to the get-state function (`api/_lib/logApi.js`). The migration moves the entries still inside the document to objects and strips them from it; it runs only when an admin calls it. `node tests/migrate-log.dryrun.mjs "<backup.json>"` shows its counts on a backup without touching R2.

## Email notifications (Resend)

Review-stage changes are emailed to the people of that stage once these are set (`api/_lib/notify.js`).

| Variable | Needed | What it does |
|---|---|---|
| `RESEND_API_KEY` | To send | API key from resend.com, restricted to sending from the notification domain. Mark it Sensitive. |
| `NOTIFY_FROM` | To send | The sender, e.g. `Tranz Energy DMS <dms@notify.tranzenergy.com>`, on a domain verified in Resend (DKIM and the two CNAME records in DNS). |
| `APP_URL` | Recommended | The link put in emails, e.g. `https://tranzenergy-dms.vercel.app`. Without it the "App link in emails" of Admin → Organisation is used; without either, emails carry no link. |

Environment variables are read at deploy time: after adding or changing one, redeploy (Deployments → ⋯ → Redeploy) or merge the next change into `main`.

## Pipeline API (review pipeline)

A small token-authenticated API for TranzEnergy's review pipeline, in `api/pipeline/[action].js` (one function; the rules are in `api/_lib/pipeline.js`):

| Route | What it does |
|---|---|
| `GET /api/pipeline/drawings?project=<id, code or name>` | The project's drawings: code, title, expected, current revision, revisions, review stage / due date / proposed category, CRS present and its row count |
| `POST /api/pipeline/register` `{ project, code, title?, revision?, fileName, contentBase64 \| key }` | A received PDF: creates the drawing, or fills an expected MDL record as its first revision (R0 unless given), or adds a new revision (a received drawing needs `revision`; one already held is refused with 409 `revision_exists`). The review starts as in the app |
| `POST /api/pipeline/attach-crs` `{ project, code, fileName, contentBase64 \| key }` | A CRS Excel on a drawing that has no sheet yet, parsed as the app does. A drawing with a sheet is refused with 409 `sheet_present` and its row count: a sheet is never replaced |
| `POST /api/pipeline/upload-url` `{ project, code, fileName, kind: 'pdf' \| 'crs' }` | For files over 3 MB: a presigned PUT to R2; then call register / attach-crs with the returned `key` |

It cannot change a review stage, comment, delete or replace anything. Every change is made as one workspace user and goes through the same `checkSave` rules as a browser save.

| Variable | Needed | What it does |
|---|---|---|
| `PIPELINE_TOKEN` | To enable it | The bearer token (`Authorization: Bearer …`), at least 32 characters; use a long random value. When unset the routes answer 404. |
| `PIPELINE_USER_EMAIL` | With the token | The workspace user the pipeline acts as. Must exist, must not be a Consultant, needs an uploading role (Admin, Project Manager, Senior Engineer, Engineer) and must be assigned to the project. |

Request bodies on Vercel are limited to 4.5 MB, so inline files (`contentBase64`) stop at 3 MB; larger files go through `upload-url`. Tests: `node tests/pipeline.test.mjs`.
