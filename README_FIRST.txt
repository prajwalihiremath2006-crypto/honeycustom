HONEYCHAIN SYNOPSIS-ALIGNED COMPLETE PROTOTYPE

This version is a single-page application with view-based navigation. Fixes in this ZIP:
- Login/auth view is no longer force-hidden by logged-out CSS when a protected section is selected.
- Public /track/:batchId route now activates only the public tracking view instead of leaving Home selected.
- Frontend JavaScript and server JavaScript passed Node syntax checks; this is not a full end-to-end browser test.

Use the sidebar to switch views. The website always opens on a public Home page first, whether or not a session already exists. Home explains all main modules and loads up to 30 real, publicly viewable batch summaries from the database. Public Home/About/Help and QR tracking do not require sign-in. Opening protected Dashboard/data-management sections redirects to Login and explains why. Creating or changing records requires an authenticated account and the correct role.

This version follows the synopsis modules: role-based accounts, apiary/hive/harvest records, batch management, quality-report attachments, supply-chain events, QR customer tracking, live dashboard, reports and an admin audit log.

INSTALL ON WINDOWS 11
1. Stop the running server in VS Code terminal: Ctrl+C.
2. Back up your existing project folder.
3. Copy server.js, database.js, package.json, public/index.html into your project folder.
4. IMPORTANT: keep your existing honeychain.db file. The database setup creates missing tables without deleting old batch records.
5. Open the project folder in VS Code.
6. Terminal > New Terminal.
7. Run: npm install
8. Run: npm start
9. Open http://localhost:3000 and press Ctrl+F5.

FIRST USE
- Register a Customer or Beekeeper account from Login / Register.
- Beekeeper can add apiaries, hives and batches.
- Processing and Admin users can add quality reports; Beekeeper, Processing and Admin can add supply-chain events.
- Public registration cannot create Admin/Processing users.
- To grant Admin/Processing role, use the database user table carefully. A user can be registered normally first; stop the server, then use a SQLite database viewer to change that user's role to 'admin' or 'processing'. Do not expose admin APIs before you have secured the admin account.
- The Admin audit endpoint is /api/audit and is restricted to admin sessions.
- Export CSV after login.

DATABASE / OLD DATA
- Do not delete honeychain.db. New tables are created automatically.
- Old batch rows from the previous project are preserved. Existing older batch hash formats may need verification/testing because this version includes optional hive/apiary fields in its canonical hash.
- This project keeps the same core /api/health, /api/batches, /api/batches/:batchId, /api/batches/:batchId/qr and /api/batches/:batchId/verify routes. API responses add fields where needed.

NEW ROUTES
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
GET  /api/public/batches (public read-only summaries)
GET  /api/dashboard
GET/POST /api/apiaries
GET/POST /api/hives
GET/POST /api/batches/:batchId/stages
GET/POST /api/batches/:batchId/reports
GET  /api/reports/:id/file
GET  /api/reports/batches.csv
GET  /api/reports/summary
GET  /api/audit (admin only)
GET  /api/admin/users (admin only)
PATCH /api/admin/users/:id/role (admin only)

HONEST FEATURE BOUNDARIES
- This implements SHA-256 hash-linked records in SQLite, not a deployed decentralized blockchain or Solidity smart contract. The synopsis lists Solidity/Hardhat/test network; real chain integration is a separate build requiring a contract, RPC endpoint, wallet and transaction handling.
- Hash verification checks record field integrity and previous-record links; it does not prove the physical honey is genuine.
- QR codes created on localhost only open on the same computer. For remote phones, deploy the app and set PUBLIC_BASE_URL to its HTTPS base URL before generating QR codes.
- Uploaded quality files are saved in the local uploads folder and limited to PDF/JPG/PNG/WEBP up to 5 MB.
- This is a college prototype, not production-ready security. Before public deployment: set a long random SESSION_SECRET environment variable, use HTTPS, configure a persistent production session store, add CSRF protection, backups and proper deployment hardening.
