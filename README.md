# Nayaro SMS

School management system for schools in Nepal: a web dashboard for school staff, a mobile app for parents and teachers, and a public website for every school. Several schools run on one installation, each with its own data, roles and settings.

| Part | Stack | Folder |
| --- | --- | --- |
| API | Node.js, Express 5, TypeScript, Prisma 7, MySQL 8, Redis | [`backend/`](backend/) |
| Web dashboard | React 19, Vite, Tailwind CSS 4, TanStack Query | [`frontend/`](frontend/) |
| Mobile app | React Native with Expo (Expo Router); also runs in a browser | [`mobile/`](mobile/) |

## Features

**Schools, users and permissions**
- Platform owner creates schools, suspends or reactivates them, and can open any school for support
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

**Mobile app**
- Parents: each child's attendance, results, notes from school and notifications
- Teachers: today's attendance, marks entry, and their own children if they are also parents
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

`dev.sh` starts MySQL and Redis in Docker, installs dependencies, creates the `.env` files from the examples, runs the database migrations, loads demo data, then starts the API, the web dashboard and the mobile app. Press Ctrl+C to stop everything. Logs are written to `.dev-logs/`.

| Open | Address |
| --- | --- |
| Web dashboard | http://localhost:5173 |
| API | http://localhost:4000 (docs at http://localhost:4000/api/docs) |
| Mobile app in a browser | http://localhost:8081 |
| Demo school website | http://localhost:4000/sites/DEMO |

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
npm run db:seed               # demo school, staff, ~145 students, exams and attendance
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

## Demo logins

Created by `npm run db:seed`. School code: **DEMO**.

| Who | Login | Password |
| --- | --- | --- |
| Platform owner | `superadmin@sms.local` | `SuperAdmin@123` |
| School admin | `admin@demo.school` | `Password@123` |
| Principal | `ramesh@demo.school` | `Password@123` |
| Class and subject teacher | `sunita@demo.school` | `Password@123` |
| Teacher who is also a parent | `deepak@demo.school` | `Password@123` |
| Proxy teacher | `pratima@demo.school` | `Password@123` |
| Parent with two children (mobile) | `9811000099` | `Parent@123`, or an SMS code |
| Parent of a Grade 5 student (mobile) | `9811000145` | `Parent@123`, or an SMS code |

In development, SMS codes are printed in the API log and shown on the login screen instead of being sent (`SMS_PROVIDER=console`).

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
| `SITES_BASE_DOMAIN` | Optional: serve school websites at `<code>.<domain>` (needs wildcard DNS) |
| `STORAGE_LOCAL_DIR` | Where uploaded photos and documents are stored |

**`frontend/.env`**: `VITE_API_URL`, empty in development (Vite forwards `/api` to the backend).

**`mobile/.env`**: `EXPO_PUBLIC_API_URL`, the API address the app uses. Browser: `http://localhost:4000`; Android emulator: `http://10.0.2.2:4000`; real phone: `http://<computer's Wi-Fi IP>:4000`.

## Common commands

| Where | Command | Does |
| --- | --- | --- |
| backend | `npm run dev` | API with reload on change |
| backend | `npm test` | Tests (uses a separate `sms_test` database; demo data is untouched) |
| backend | `npm run typecheck` | Type check |
| backend | `npx prisma migrate dev --name <change>` | Create a migration after editing `prisma/schema.prisma` |
| backend | `npm run db:seed` | Load demo data (safe to run again) |
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
  prisma/seed.ts             demo data
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
- **PDF download fails**: install Chrome/Chromium or set `PDF_CHROME_PATH`.
- **Phone can't reach the API**: `mobile/.env` must use your computer's Wi-Fi IP (not `localhost`), and both must be on the same network; or run `./dev.sh --tunnel`.
- **Prisma errors after pulling changes**: run `npx prisma migrate dev` and `npx prisma generate` in `backend/`.
- **Tests fail to connect**: tests use the `sms_test` database on the same MySQL; make sure `docker compose up -d` is running.
