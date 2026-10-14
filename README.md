# HoneyChain

A Node.js + Express + SQLite prototype for honey batch traceability, QR tracking, supply-chain events, and SHA-256 record integrity verification.

## Requirements
- Node.js 20 or newer (LTS recommended)
- npm

## Run locally
1. Extract this project folder.
2. Open the `honeycustom` folder in VS Code.
3. In the VS Code terminal, run:

   ```bash
   npm install
   npm start
   ```

4. Open <http://localhost:3000>.

The web entry point is `public/index.html`. Start the app with `npm start`; do not open `index.html` directly from File Explorer because the frontend uses the Express API.

## GitHub notes
- Upload or push the **contents of the `honeycustom` folder** to your repository, so `package.json`, `server.js`, `database.js`, and `public/index.html` are visible in the repository.
- GitHub is source-code hosting. **GitHub Pages cannot run this project's Express server or SQLite database.** To make the complete application accessible online, deploy the Node.js backend to a Node-compatible host and configure persistent storage for SQLite.
- `.gitignore` excludes `node_modules`, local database files, uploads, and `.env` secrets. Keep private database/user data and secrets out of GitHub.

## Important project limits
This prototype stores hash-linked records in SQLite and verifies record integrity with SHA-256. It is not a deployed decentralized blockchain or a smart contract. Hash verification does not independently prove honey purity or authenticity.
