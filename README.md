# x402-xapi

Express + x402 paywall (TypeScript). Provides:
- `POST /x402/twitter/following` (paid): verify if `source_username` follows `target_username` on X.
- `GET /health` (free): basic health check.

The backend uses an **internal external provider** for follow verification. The provider name/URL is **not exposed** to clients.

## Requirements
- Node.js >= 18
- USDC receiver wallet for x402 (EVM)

## Setup

```bash
npm i
cp .env.example .env
# edit .env
```

**.env variables:**

```env
PORT=4021

# x402 paywall
X402_PAY_TO=0xYourReceiverWallet
X402_NETWORK=base-sepolia
X402_ASSET=USDC
FACILITATOR_URL=https://x402.org/facilitator

# Pricing
TW_FOLLOW_PRICE=$0.10

# Internal external provider (hidden from users)
EXTERNAL_FOLLOW_API_URL=https://api.example.com/v2/check-follow
EXTERNAL_FOLLOW_API_KEY=your-external-api-key
```

## Run (dev)

```bash
npm run dev
```

## Build & Start (prod)

```bash
npm run build
npm start
```

## API

### POST /x402/twitter/following  _(paid)_
**Body:**
```json
{
  "source_username": "jack",
  "target_username": "elonmusk"
}
```
**Success 200:**
```json
{ "follow": true }
```
**Errors:** `400`, `403`, `404`, `500` with
```json
{ "message": "string" }
```

### GET /health _(free)_
**Success 200:**
```json
{ "status": "ok", "uptime": 123.45 }
```
