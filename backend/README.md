# StellarSettle Backend

Node.js API and Soroban RPC event monitor for shipment escalation alerts and off-chain shipment metadata.

## Local setup

```sh
cp .env.example .env
npm install
npm run dev
```

Set `STELLAR_CONTRACT_ID` to enable the event monitor. By default, it scans recent contract events on Testnet and persists `dispute_escalated` alerts and metadata in a local SQLite database. The API exposes `GET /api/health`, `GET /api/events`, `GET /api/stream` (SSE), and metadata read/write endpoints. Metadata writes are disabled until a non-empty `METADATA_API_KEY` is configured; keep that key on the server and never expose it in frontend variables.

The event monitor starts from the latest ledger minus ten when `START_LEDGER` is unset. Configure a ledger explicitly when recovering an older range. This service does not sign or submit contract transactions; the connected wallet remains responsible for user-authorized actions.

```sh
npm run typecheck
npm run build
npm start
```