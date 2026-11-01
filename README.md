# Food Donation Management System

A polished, responsive full-stack food-sharing application that connects surplus food donors with registered recipients. The SharePlate interface includes a branded landing page, responsive authentication screens, role-aware dashboards, donation discovery, claim tracking, and an admin overview. Donors publish food listings, recipients claim available donations, and donors record collection. Data is stored in Supabase PostgreSQL.

## 1. Problem and objectives

Edible surplus food can go unused when donors cannot easily reach community organizations. SharePlate provides a shared listing and claim workflow to make coordination easier.

Objectives:
- Publish and manage surplus food listings.
- Search available food and claim a complete listing.
- Track pending claims and confirm collection.
- Provide administrator visibility over accounts and listings.
- Demonstrate frontend, REST API, authentication, SQL, and Git workflows.


## 2A. Interface and experience

The SharePlate frontend is designed as a responsive community product rather than a plain admin form. It includes:
- A branded editorial-style landing page with clear calls to action and a three-step explanation.
- Separate sign-in and registration states with accessible labels and inline feedback.
- Role-aware donor, recipient, and administrator dashboards.
- Donation cards with clear status, quantity, category, pickup details, and actions.
- Responsive layouts for desktop, tablet, and mobile, plus reduced-motion support.
- Confirmation dialogs for consequential actions and toast/notice feedback.

The decorative food illustration is CSS-based, so the page does not depend on an external image service. Google Fonts are an optional enhancement; system fallback fonts are used if they cannot load.

## 2. Users and features

- **Donor:** create, edit, and cancel available listings; see claims; confirm collection.
- **Recipient:** search listings; claim one available donation; cancel a pending claim; track collection.
- **Administrator:** view overview, members, and donations; change a member between donor and recipient. Admin access is determined by `ADMIN_EMAILS` on the server.

The application uses Supabase Auth for passwords and identities. Profiles, donations, and claims are stored in PostgreSQL. A claim reserves the whole donation; partial quantities and delivery tracking are outside this MVP.

## 3. Technology stack

- HTML5, CSS3, Vanilla JavaScript
- Node.js 20+ and Express 5
- Supabase Auth and Supabase PostgreSQL
- Git and GitHub
- npm packages: `express`, `@supabase/supabase-js`, `dotenv`, `helmet`, `express-rate-limit`

No frontend framework is used. Google Fonts are an optional visual enhancement; the app has system font fallbacks and does not depend on remote images or APIs.

## 4. Folder structure

```text
food-donation-management-system/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/
│   ├── server.js
│   ├── supabase.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── donations.js
│   │   ├── claims.js
│   │   └── admin.js
│   ├── middleware/
│   │   └── auth.js
│   ├── utils/
│   │   ├── http.js
│   │   └── http.test.js
│   ├── package.json
│   ├── .env.example
│   └── .gitignore
├── database/
│   └── schema.sql
├── .gitignore
└── README.md
```

`package-lock.json` is created by `npm install`. The local `backend/.env` is created by you and must never be committed. The `middleware/` directory contains `auth.js`.

## 5. Prerequisites

Install:
- Visual Studio Code: https://code.visualstudio.com/
- Node.js LTS (npm is included): https://nodejs.org/
- Git: https://git-scm.com/downloads
- Supabase account: https://supabase.com/ (the core project can be built on the free tier subject to provider limits)
- GitHub account: https://github.com/

Check in a terminal:
```bash
node --version
npm --version
git --version
```
Use Node.js 20 or newer.

## 6. Create a Supabase project and database

1. Sign in at https://supabase.com/ and create a new project.
2. Choose a project name, database password, and region. Store the database password privately; this app does not need it directly.
3. Open **SQL Editor** in the project dashboard.
4. Open `database/schema.sql` in VS Code, copy the entire file, paste it into a new SQL Editor query, and run it.
5. Open **Table Editor** and confirm `profiles`, `donations`, and `claims` exist.
6. In **Project Settings → API** (wording can vary), copy the Project URL, publishable/anon key, and server-side service-role key. The service-role key is privileged and must never be shared or placed in frontend code.
7. In **Authentication → Providers / Sign In**, ensure Email is enabled. For a local classroom demo, you may turn off email confirmation in the Auth settings so registration immediately returns a session. For real deployments, keep email confirmation enabled and configure email delivery.

The SQL enables RLS and revokes direct table access from `anon` and `authenticated`. The Express API uses the server-only service-role key after checking the user's access token and permissions. Never expose that key to the browser. The SQL RPC functions are executable only by `service_role`.

## 7. Configure environment variables

From the `backend/` directory, copy `.env.example` to `.env`.

Windows PowerShell:
```powershell
Copy-Item .env.example .env
```
Windows Command Prompt:
```cmd
copy .env.example .env
```
macOS/Linux:
```bash
cp .env.example .env
```

Edit `backend/.env`:
```dotenv
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
ADMIN_EMAILS=your-admin-email@example.com
```

Replace all placeholders with values from your own Supabase project. `ADMIN_EMAILS` is a comma-separated allowlist of administrator email addresses. Register an account with one of these emails to use the admin dashboard; server configuration grants admin privileges regardless of the profile's donor/recipient role. Never put the service-role key in `frontend/`, GitHub, screenshots, or shared reports.

`.env` holds your local secrets. `.env.example` documents the variable names with placeholders and is safe to commit.

## 8. Install dependencies and start

Open a terminal in the project root, then:
```bash
cd backend
npm install
npm test
npm run dev
```
`npm install` downloads packages and creates `backend/package-lock.json`. `npm test` runs local utility tests. `npm run dev` starts Node's watch mode. Expected message:
```text
Food Donation Management System running at http://localhost:3000
```
Open **http://localhost:3000** in your browser. Do not open `frontend/index.html` directly from the file system; Express serves it and handles API requests.

Production-style local start:
```bash
npm start
```
Stop the server with `Ctrl+C`.

## 9. Architecture

1. Browser displays HTML and CSS and uses `fetch()` to call `/api/...`.
2. Express validates input and verifies the Supabase Auth bearer token.
3. Middleware loads the user's profile. Roles are enforced by backend routes.
4. Authorized backend operations use the server-only Supabase client to access PostgreSQL.
5. SQL constraints protect data integrity. The `claim_donation`, `cancel_claim`, and `complete_claim` functions use row locks so claim transitions happen atomically.

The access token is held in `sessionStorage` for this educational MVP and sent in the Authorization header. It is cleared on sign out and is not persisted beyond the browser tab session. This is simpler to learn but remains exposed to JavaScript running on the same origin; avoid injecting untrusted HTML, keep dependencies updated, and consider an HttpOnly-cookie architecture for a production deployment.

## 10. API reference

All endpoints are same-origin. Authenticated endpoints require `Authorization: Bearer <accessToken>`. JSON errors use `{ "error": { "code": "...", "message": "..." } }`.

| Method | Path | Purpose / permissions |
|---|---|---|
| GET | `/api/health` | Health check; public |
| POST | `/api/auth/register` | Create Auth user and donor/recipient profile; public |
| POST | `/api/auth/login` | Verify email/password and return access token; public, rate limited |
| GET | `/api/auth/me` | Current verified account; authenticated |
| GET | `/api/donations` | List donations; donor sees own listings, recipient sees relevant listings, admin can view listings |
| POST | `/api/donations` | Create donation; donor |
| PATCH | `/api/donations/:id` | Edit own available donation; donor |
| DELETE | `/api/donations/:id` | Cancel own available donation; donor |
| GET | `/api/claims` | List own claims or claims for donor's listings; admin is not given this endpoint's all-claims view |
| POST | `/api/claims/:donationId` | Atomically claim a full available donation; recipient |
| PATCH | `/api/claims/:claimId/cancel` | Cancel own pending claim; recipient |
| PATCH | `/api/claims/:claimId/complete` | Confirm collection for own donation; donor |
| GET | `/api/admin/overview` | Platform totals; admin |
| GET | `/api/admin/users` | List profiles; admin |
| PATCH | `/api/admin/users/:id/role` | Set donor/recipient role; admin |
| GET | `/api/admin/donations` | List donations; admin |

Typical success responses include `{ "donations": [...] }`, `{ "claims": [...] }`, `{ "user": {...} }`, or `{ "message": "..." }`. Registration may return `requiresEmailConfirmation: true` if Supabase requires email confirmation. Invalid input usually returns 400, missing/invalid authentication 401, forbidden role/ownership 403, missing records 404 where applicable, conflicting state 409, and unexpected/database errors 500. The exact error message may be intentionally generic.

### Request examples

Register:
```json
{
  "fullName": "Demo Donor",
  "email": "donor@example.com",
  "password": "change-this-password",
  "role": "donor"
}
```

Create donation:
```json
{
  "title": "Vegetable meal boxes",
  "description": "Freshly prepared meals. Ask the donor about allergens before collection.",
  "foodType": "Cooked meals",
  "quantity": 20,
  "unit": "servings",
  "pickupLocation": "Community Hall, Main Street, Hyderabad",
  "expiresAt": "2027-01-20T17:00:00.000Z"
}
```

## 11. How to use the app

1. Register as a donor using one email address.
2. Add a food listing and provide a future use-by time.
3. Sign out and register a second account as a recipient.
4. Search for the listing and claim it.
5. Sign out and sign back in as the donor.
6. Open Incoming claims and confirm collection only after pickup occurs.
7. For the admin view, configure the email in `ADMIN_EMAILS`, restart the backend, and register/sign in with that email.

Use fictional sample details only. Do not list unsafe, spoiled, or improperly stored food.

## 12. Testing

Run:
```bash
cd backend
npm test
```
The included Node.js tests cover UUID validation and text cleanup. JavaScript syntax checks and these unit tests can run without a Supabase project; they do not constitute a live database, browser, or end-to-end integration test.

Manual end-to-end checklist:
- `GET /api/health` returns `{ "status": "ok", ... }`.
- Register donor and recipient accounts.
- Invalid email, short password, missing fields, and invalid role are rejected.
- Donor can create, edit, and cancel an available listing.
- Recipient can search and claim an available listing.
- A second recipient cannot claim a listing already claimed.
- Recipient can cancel a pending claim; the listing becomes available again unless expired.
- Donor can confirm collection only for their own listing.
- Donor cannot edit or cancel another donor's listing.
- Recipient cannot create donations or confirm collection.
- Non-admin cannot access `/api/admin/...`.
- Expired use-by times and invalid quantities are rejected.
- Reloading the dashboard still shows persisted records.
- Layout remains usable at narrow mobile widths.
- Direct table access with the anon key is denied by RLS.

## 13. Troubleshooting

- **Missing environment variable:** confirm `backend/.env` exists and its names match `.env.example`; restart Node after edits.
- **Invalid API key / failed connection:** verify Project URL and keys belong to the same Supabase project; remove extra spaces.
- **Table or function missing:** rerun `database/schema.sql` in SQL Editor and inspect its output.
- **Registration asks for email confirmation:** confirm the email using the Supabase email, or configure Auth confirmation settings for your local demo.
- **Profile not ready:** check that the schema was installed and registration could write to `profiles`.
- **401 Unauthorized:** sign in again; the access token may be expired.
- **403 Forbidden:** confirm the correct role and, for admin, that the email appears in `ADMIN_EMAILS`; restart the server after changing `.env`.
- **Port in use:** change `PORT` in `.env` and visit the matching localhost port.
- **`npm` not recognized:** install Node.js LTS and reopen the terminal.
- **No donations visible:** check that the donor saved a listing, the recipient search is cleared, and the listing has not been claimed or cancelled.
- **Schema relationship error:** run the supplied schema as a whole on a clean project and check that the foreign-key names match the file.

## 14. Security and limitations

- Never commit `.env`, service-role keys, database passwords, or real user data.
- The service-role key bypasses RLS; backend authorization is therefore essential.
- Passwords are handled by Supabase Auth, not stored by this application.
- The API has Helmet security headers, request-size limits, rate limiting, input validation, and ownership checks.
- The app reserves one complete donation per claim. It does not implement partial quantities, chat, delivery tracking, image uploads, notifications, or food-safety certification.
- Admin email allowlisting is suitable for a classroom MVP. A production system should add a controlled admin provisioning workflow, audit logs, secure server-managed sessions, monitoring, backups, and deployment-specific configuration.
- Do not use real personal or health information in classroom demos.

## 15. Git and GitHub

1. Create an empty repository at https://github.com/new.
2. In a terminal at the project root:
```bash
git init
git status
git add .
git status
git commit -m "Build food donation management system"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```
Replace `YOUR_GITHUB_REPOSITORY_URL` with your repository URL, such as `https://github.com/YOUR_USERNAME/food-donation-management-system.git`.

Before `git add .`, confirm `backend/.env` and `node_modules/` are ignored. `.env.example` should be tracked. Review `git status` and the staged file list; do not commit secrets, private user information, or database exports. If a secret was committed, `.gitignore` is not enough: rotate the exposed credential immediately and remove it from repository history as appropriate.

If Git says the remote already exists, inspect `git remote -v` and update it with `git remote set-url origin YOUR_GITHUB_REPOSITORY_URL`. If GitHub rejects authentication, use GitHub's supported sign-in or token flow rather than putting a password in the remote URL.

## 16. Future improvements

Possible extensions include partial quantity claims, donor-recipient messaging, collection reminders, moderation reports, food-category filters, CSV reports, audit logging, and deployment with HTTPS and a secure HttpOnly-cookie session.

## 17. License

For educational and demonstration use. Add a license file if you decide to publish or redistribute the project.
