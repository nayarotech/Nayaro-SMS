# Nayaro SMS

School management system for schools in Nepal: a web dashboard for school staff, a mobile app for parents and teachers, and a public website for every school. Several schools run on one installation, each with its own data, roles and settings.

| Part | Stack | Folder |
| --- | --- | --- |
| API | Node.js, Express 5, TypeScript, Prisma 7, MySQL 8, Redis | [`backend/`](backend/) |
| Web dashboard | React 19, Vite, Tailwind CSS 4, TanStack Query | [`frontend/`](frontend/) |
| Mobile app | React Native with Expo (Expo Router); also runs in a browser | [`mobile/`](mobile/) |

## Features

**Schools, users and permissions**
- Platform owner creates schools, sets each school's student limit (its plan), suspends or reactivates them, and can open any school for support
- Student limit per school: only active students count; at the limit, admissions stop and the school is asked to contact you to upgrade
- Login with email/phone and password, or phone and SMS code (Sparrow SMS). One phone number can belong to several schools
- 8 built-in roles, custom roles, around 50 permissions, and per-user exceptions; audit log of every change
- School settings: branding, BS/AD dates, working days, admission number format, modules on/off, English and Nepali interface

**Academics**
- Academic years (BS), classes, sections, subjects and each class's curriculum, including optional subjects in groups (e.g. Grade 9–10: Computer or Account)
- Class teachers, subject teachers, bell schedule and timetable with clash detection; copy all of it into a new year
- Each student's optional subject choice per year; mark sheets then list only the students who take that subject

**Students and parents**
- Admission with guardians, photo and documents; automatic admission and roll numbers; siblings share parent accounts
- Student profile with every year's class, attendance and exam results, GPA trend, and notes (achievements, discipline, counselling, health) that can be shared with parents
- Export or delete a student's data on request

**Attendance**
- Class teachers take attendance on the web or phone; proxy teachers for set dates; edit window and audit trail
- Parents are notified when their child is absent
- Daily overview, monthly register (Excel/PDF) and per-student reports

**Exams and results**
- Exams with full/pass marks and credit hours per class; copy the setup between classes or from another exam
- Marks entry by the assigned subject teacher (web or phone, works offline) → submitted → verified → published, with "verify all"
- NEB letter grading and GPA (editable scale), ledgers, ranks and branded PDF report cards
- Year-end promotion one class at a time: suggestions from results and attendance, promote/detain/graduate in bulk, undo

**Homework and study materials**
- Teachers post homework for their sections and subjects (several sections at once) from the web or phone, with photos from the camera, PDFs and office files; a coordinator can post for any teacher
- Parents are notified and see each child's upcoming and past homework; optional-subject homework reaches only the students who take it
- After the due date the teacher ticks Done / Partly / Not done; parents see it and are told when homework wasn't done
- Study materials (notes, worksheets, slides, video links) per class or section and subject, which parents and students browse by subject

**Fees and collections**
- Automatic billing is opt-in per recurring plan. **Enable automatic billing** requires explicit approval of the current fee amount and authorizing user. New opt-ins start on the next BS/AD billing date; a one-minute worker in the running API catches up only the current month after downtime. Previous months remain reviewed work. Paused plans, disabled fees, suspended schools and plans outside their current academic year do not issue automatically. The authorizer must retain active fee-management access; a changed fee amount requires fresh approval. Reauthorizing an already automatic plan preserves its start date so a due current month can be retried.
- Scheduled billing uses durable database leases, atomic issuance and the same unique monthly run/bill keys as manual billing. It retries failures after 5 and 15 minutes (three automatic attempts), then exposes **Retry current month**. The latest 12 monthly checks and 20 unread in-app failure alerts appear on the recurring-plans page; active fee managers receive one failure alert per plan/month. `FEE_SCHEDULER_ENABLED=false` stops polling globally. The API process must remain running; reviewed billing remains available.
- Recurring fee plans: **Fees & payments → Recurring fee plans** saves a class/section, fee, BS/AD calendar, billing day and due day (1–28, same month). Each plan is pinned to the current academic year. Choose a month, preview active students, save per-student recurring discounts, then confirm issuance. Dates must lie within that academic year. Existing bills for the same student/fee/period are skipped; a unique monthly run and transaction protect retries and overlapping runs. Pause/resume plans and view the latest 12 runs. A completed run stays closed; use bulk billing for later admissions. Create new plans for a new academic year. Automatic scheduling requires explicit per-plan approval.
- Payment corrections: users with `fees.reverse` can open a bill's payment history, select **Reverse payment**, enter a reason and confirm the full reversal. The original amount, payment timestamp and receipt ID remain; the paid balance decreases once and the outstanding balance increases. The audit log records the reason, operator and reversal date. This corrects the recorded payment; any cash/bank refund is handled separately. School Admins have access; existing accountant/custom roles can be granted the new permission under Roles.
- Reversed payments remain visible in parent history and exports. Newly generated PDFs are prominently marked reversed, and previous signed PDF copies are revoked. Reports show original amounts, reversed amounts and net collections on the **original payment date** using current reversal status; these are corrected collection reports, not refund cash-flow reports.
- Collection reports: **Fees & payments → Collection reports** filters payments by inclusive Nepal dates, current class/section, method and collector. Daily totals and summary amounts cover all matching records. The unpaid tab filters bill due dates and shows current balances, not historical snapshots. Excel exports include all matching records (up to 10,000), numeric NPR values and filter/timezone metadata; reports require `fees.report` permission. Maximum date range: 366 days.
- SMS fee reminders: choose **SMS** in the reminder preview to review mobile numbers and message text (up to 50 per batch). `SMS_PROVIDER=console` simulates messages; real submission requires `SMS_PROVIDER=sparrow`, `SPARROW_SMS_TOKEN` and `SPARROW_SMS_FROM`. SMS and in-app attempts have separate daily limits. History distinguishes simulated, pending, provider-accepted, rejected, uncertain and skipped attempts. Provider acceptance is not confirmation of handset delivery. Pending/interrupted, rejected and uncertain attempts are not automatically replayed; check history and the provider before trying on a later day. Attempts are recorded before external submission, and balances/guardian phones are rechecked before sending.
- Overdue tracking: filter bills by current class/section, outstanding, overdue or paid (overdue dates use Nepal time). Select outstanding bills on a page, preview linked active parents and send in-app reminders. Paid/changed bills and inactive/unlinked parents are skipped; a database constraint limits each parent to one reminder per bill per Nepal calendar day. Payment details show the latest 50 reminder recipients. Parent inbox reminders open the relevant bill.
- Bulk billing: select a class or section, fee, period and due date; preview active students in the current year, select students and set individual discounts, then confirm. Existing bills are skipped, including concurrent submissions and retries (up to 500 students per batch).
- Reusable fee structures in NPR; issue a student bill for a named billing period with a due date, discount and fixed fine
- Partial or full manual payments (cash, bank transfer or other), receipt IDs, payment history and school-branded PDF receipts
- Download receipts from the dashboard payment history, or open a receipt PDF from the parent app. Parent links expire after one hour; generated PDFs are private files in the configured storage. Chrome/Chromium is required (`PDF_CHROME_PATH` if not installed in a standard location). Each receipt identifies the original payment and labels totals/balance as current at PDF generation time.
- All-time billed, collected and outstanding totals; separate view, management, collection and reporting permissions
- Duplicate bills are refused for the same student, fee structure and period; payment retries use a request ID and concurrent collections cannot overpay
- Parent mobile app: **Home → Fees** shows each child's bills, all-period totals, overdue status and payment history, with English/Nepali text and cached offline access
- Parent API: `GET /api/my/children/:id/fees` returns paginated bills and all-period totals; `GET /api/my/children/:id/fees/:billId` returns bill details and receipts, limited to the guardian's own children

Open **Fees & payments** as a school admin or accountant. Create a fee structure, issue a bill, then open **Bill & payments** to record a collection. Amounts display in NPR; the API stores and accepts integer paisa (100 paisa = NPR 1). Issued bills and original payment details cannot be edited or deleted; a recorded payment can be fully reversed with an audit trail. Financial records prevent deleting a billed student. Partial reversals, refund disbursement and online payment gateways are follow-up work.

**Mobile app**
- Parents: each child's attendance, results, homework, study materials, notes from school and notifications
- Teachers: today's attendance, homework (post with photos, check who did it), study materials, marks entry, and their own children if they are also parents
- English and Nepali; keeps working on a weak connection

**School website**
- Drag-and-drop page builder with 22 blocks, themes, menus, notices, news, events, gallery and enquiry forms
- Served at `/sites/<SCHOOL-CODE>`, a subdomain, or the school's own domain; SEO tags and sitemap included

## Requirements

- **Node.js 22.12+** (20.19+ also works; check with `node -v`)
- **Docker Desktop**, for MySQL and Redis (or install MySQL 8 and Redis 7 yourself)
- **Google Chrome or Chromium**, for PDFs (report cards, registers, ledgers)
- Optional: **Expo Go** on your phone to open the mobile app

## Quick start

```bash
git clone https://github.com/nayarotech/Nayaro-SMS.git
cd Nayaro-SMS
./dev.sh
```

`dev.sh` starts MySQL and Redis in Docker, installs dependencies, creates the `.env` files from the examples, runs the database migrations, creates the super admin account, then starts the API, the web dashboard and the mobile app. Press Ctrl+C to stop everything. Logs are written to `.dev-logs/`.

| Open | Address |
| --- | --- |
| Web dashboard | http://localhost:5173 |
| API | http://localhost:4000 (docs at http://localhost:4000/api/docs) |
| Mobile app in a browser | http://localhost:8081 |

To use the mobile app on your phone, install **Expo Go** and scan the QR code that `dev.sh` prints. The phone and computer must be on the same Wi-Fi; if they can't reach each other, run `./dev.sh --tunnel`.

## Manual setup

If you'd rather start each part yourself (or you're on Windows without bash):

```bash
# 1. Database and cache
docker compose up -d

# 2. API → http://localhost:4000
cd backend
cp .env.example .env          # then change the three secrets (see below)
npm install
npx prisma migrate dev
npm run db:seed               # creates the super admin account
npm run dev

# 3. Web dashboard → http://localhost:5173   (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev

# 4. Mobile app → http://localhost:8081      (new terminal)
cd mobile
cp .env.example .env          # on a real phone, set your computer's Wi-Fi IP here
npm install
npx expo start
```

## First login

`npm run db:seed` creates one account, the **platform owner (super admin)**. Its email and password come from `backend/.env`:

```
SEED_SUPER_ADMIN_EMAIL=superadmin@sms.local
SEED_SUPER_ADMIN_PASSWORD=SuperAdmin@123
```

Change them before seeding a real server. Then:

1. Sign in to the web dashboard as the super admin.
2. **Schools → New school**: enter the school's details, its **student limit** (how many active students it paid for) and its first School Admin login.
3. Give the School Admin their login. They set up academic years, classes, subjects and staff, then admit students.
4. When a school buys a bigger plan, click its **Students / plan** figure on the Schools page and raise the limit. Leave it empty for no limit.

Only active students count towards the limit; students who left, transferred or graduated free their place. When a school reaches its limit, new admissions (and re-activating a student who left) are refused with a message to contact you, using `SALES_CONTACT` from `backend/.env`.

In development, SMS login codes are printed in the API log and shown on the login screen instead of being sent (`SMS_PROVIDER=console`).

## Configuration

Each app has a `.env.example`; copy it to `.env`. `.env` files are never committed.

**`backend/.env`** — the important ones:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | MySQL connection, e.g. `mysql://root:root@localhost:3306/sms` |
| `REDIS_URL` | Redis connection |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_SECRET` | Random strings of 32+ characters. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `PUBLIC_API_URL` | Public address of the API, used in file links |
| `CORS_ORIGINS` | Web addresses allowed to call the API (dashboard, mobile web) |
| `SMS_PROVIDER` | `console` in development, `sparrow` to send real SMS (`SPARROW_SMS_TOKEN`, `SPARROW_SMS_FROM`) |
| `PDF_CHROME_PATH` | Path to Chrome/Chromium if it isn't found automatically |
| `SALES_CONTACT` | Shown to a school that reaches its student limit, e.g. `Nayaro Tech · 98XXXXXXXX · sales@example.com` |
| `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD` | The platform owner account created by `npm run db:seed` |
| `SITES_BASE_DOMAIN` | Optional: serve school websites at `<code>.<domain>` (needs wildcard DNS) |
| `STORAGE_LOCAL_DIR` | Where uploaded photos and documents are stored |

**`frontend/.env`**: `VITE_API_URL`, empty in development (Vite forwards `/api` to the backend).

**`mobile/.env`**: `EXPO_PUBLIC_API_URL`, the API address the app uses. Browser: `http://localhost:4000`; Android emulator: `http://10.0.2.2:4000`; real phone: `http://<computer's Wi-Fi IP>:4000`.

## Common commands

| Where | Command | Does |
| --- | --- | --- |
| backend | `npm run dev` | API with reload on change |
| backend | `npm test` | Tests (use a separate `sms_test` database, so your data is untouched) |
| backend | `npm run test:fees` | Fee integration tests in `sms_test` (billing, permissions, guardian access and concurrent collection) |
| backend | `npm run typecheck` | Type check |
| backend | `npx prisma migrate dev --name <change>` | Create a migration after editing `prisma/schema.prisma` |
| backend | `npm run db:seed` | Create the super admin account (safe to run again) |
| backend | `npm run db:reset` | Delete everything and start over (asks no questions) |
| frontend | `npm run dev` / `npm run build` | Dashboard dev server / production build into `dist/` |
| mobile | `npx expo start` | Mobile dev server (QR code for Expo Go) |
| mobile | `npx tsc --noEmit` and `npx expo lint` | Type check and lint |

## Running in production

```bash
# API
cd backend
npm ci
npm run build
npm run db:deploy        # apply migrations
npm start                # runs dist/server.js on $PORT

# Web dashboard: static files in frontend/dist, served by nginx or any static host
cd frontend
npm ci
VITE_API_URL=https://api.example.com npm run build
```

Set `NODE_ENV=production`, real secrets, `SMS_PROVIDER=sparrow`, and install Chromium on the server (`apt-get install chromium`) for PDFs. Uploaded files are kept on local disk under `STORAGE_LOCAL_DIR`; include that folder in backups. The mobile app is built with Expo EAS (`npx eas-cli build`).

## Project structure

```
backend/
  prisma/schema.prisma       database schema (MySQL)
  prisma/migrations/         migrations
  prisma/seed.ts             creates the super admin
  src/config/env.ts          environment variables, checked at startup
  src/http/                  route definitions → Express router + OpenAPI docs, auth, errors
  src/lib/                   database, Redis, storage, SMS, BS⇄AD dates, PDFs
  src/modules/<feature>/     *.service.ts (logic) and *.routes.ts (HTTP), one folder per feature
  test/                      API and unit tests (Vitest + Supertest)
frontend/src/
  features/<feature>/        screens, one folder per feature
  components/                UI kit and layout (sidebar menu in components/layout/navigation.ts)
  lib/                       API client, auth, dates, i18n
  locales/                   English and Nepali text
mobile/src/
  app/                       screens (Expo Router; (tabs) is the bottom tab bar)
  components/, lib/          shared UI, API client, session, offline cache, translations
```

Each API route is declared once with its permission, validation and documentation:

```ts
route({
  method: "post",
  path: "/",
  summary: "Admit a student",
  permission: "student.create",   // checked before the handler runs
  body: admissionSchema,           // zod; invalid input returns 400 with field errors
  handler: ({ actor, body }) => studentService.admitStudent(actor, body),
})
```

Every query is limited to the logged-in user's school. Services take the school from the session, never from the request body.

## Extending

| To… | Do this |
| --- | --- |
| Add a school setting | Add an entry to `backend/src/modules/settings/settings.registry.ts`. It appears in Settings with validation; read it with `getSchoolSettings(schoolId)`. |
| Add a permission | Add it to `permissions/permission.catalog.ts`, use `permission: "x.y"` on a route, and optionally add it to a role in `default-roles.ts`. |
| Add an API module | Create `modules/<name>/<name>.routes.ts` with `defineModule(...)` and list it in `modules/index.ts`. |
| Add a dashboard page | Create it under `frontend/src/features/`, add a route in `routes.tsx` and a menu item in `navigation.ts`. |
| Add a website block | Create it with `defineBlock()` in `backend/src/modules/website/renderer/blocks/` and add it to `blocks/index.ts`. |
| Add UI text | Add the key to both `locales/en.json` and `locales/ne.json` (mobile: `mobile/src/lib/i18n.tsx`). |
| Store files on S3 | Implement `StorageDriver` in `lib/storage/` and register it in `lib/storage/index.ts`. |

## Design notes

- **Dates are stored in AD** and shown in BS, AD or both, depending on the school's setting. Date inputs accept BS.
- **Grading code is shared** between the API and the web marks grid (`backend/src/modules/exams/grading.ts`), so the grade a teacher sees while typing is exactly what the report card prints.
- **History is never overwritten.** Promotion closes the year's enrollment and creates the next one, so every year's class, marks and attendance stay available.
- **Parents see data by relationship** (their own children), not by permissions.
- **Permissions are re-read on every request**, so role changes apply without logging out.
- **PDFs are rendered with headless Chrome** so Nepali text and the school's branding print correctly.
- **Rate limits are kept in memory.** Switch to a Redis store if you run more than one API server.

## Troubleshooting

- **`dev.sh` says a port is in use**: something is already running on 4000, 5173 or 8081. Stop it, or stop the old `dev.sh`.
- **Port 4000 is used by another project**: start the API on another port (`PORT=4100 npm run dev` in `backend/`) and the dashboard with `API_PROXY_TARGET=http://localhost:4100 npm run dev` in `frontend/`.
- **`dev.sh` stops at "Updating the database"**: it now prints the error. Common causes:
  - *Another MySQL on port 3306* (e.g. installed with Homebrew). It answers instead of the Docker database and rejects the `root`/`root` login. Stop it (`brew services stop mysql`) or move one of them to another port.
  - *"failed migrations" (P3009)*: the migration history in the database was lost or a migration was interrupted. If the tables are already there, check the database matches the schema with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (in `backend/`). If it prints an empty migration, mark the history as applied: `npx prisma migrate resolve --rolled-back <failed migration>` and then `npx prisma migrate resolve --applied <name>` for each folder in `prisma/migrations`. On a development machine with nothing to keep, `npm run db:reset` starts over instead.
- **PDF download fails**: install Chrome/Chromium or set `PDF_CHROME_PATH`.
- **Phone can't reach the API**: `mobile/.env` must use your computer's Wi-Fi IP (not `localhost`), and both must be on the same network; or run `./dev.sh --tunnel`.
- **Prisma errors after pulling changes**: run `npx prisma migrate dev` and `npx prisma generate` in `backend/`.
- **Tests fail to connect**: tests use the `sms_test` database on the same MySQL; make sure `docker compose up -d` is running.
