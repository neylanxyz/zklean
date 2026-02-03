# Production Guide - Swirl Hybrid Indexer

## How It Works Without an Indexer

Swirl uses a **3-tier fallback system** that works perfectly without a dedicated indexer:

```
Tier 1: Indexer (GraphQL)     → Fastest (optional)
Tier 2: JSON + localStorage   → Reliable (default)
Tier 3: Direct RPC            → Always works (fallback)
```

### Data Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              deposits.json (Static File)                    │
│         Shared by ALL users, updated via GitHub Action      │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
     ┌────▼─────┐                  ┌────▼─────┐
     │  User A  │                  │  User B  │
     │ localStorage│                │ localStorage│
     └───────────┘                  └───────────┘
     Per-user cache                Per-user cache
```

- **deposits.json**: Baseline data for all users (read-only in production)
- **localStorage**: Personal cache on top (helps repeat visitors)

## How New Deposits Are Handled

### Scenario: 64 deposits in JSON, 70 on chain

```
User withdraws (needs deposit #69):

1. Check deposits.json → 64 deposits (not enough)
2. Fetch blocks (last_json_block + 1) → current_block
3. Find 6 new deposits via RPC
4. Merge: [64 from JSON] + [6 from RPC] = 70 total ✅
5. Save to User's localStorage

Next user:
1. Check deposits.json → 64 deposits (not enough)
2. Fetch 6 new via RPC again
3. Each user builds their own localStorage cache
```

**Key Point**: localStorage is per-user, not shared. The GitHub Action updating `deposits.json` is what helps ALL users.

## Performance

| Scenario | Time | Notes |
|----------|------|-------|
| All in JSON | <1ms | deposits.json has enough deposits |
| Few new (1-10) | 1-3s | Fetches small range via RPC |
| Some new (10-50) | 5-15s | Medium range scan |
| Many new (50-200) | 15-45s | Large range scan |

**GitHub Action runs every 6 hours** → keeps deposits.json fresh → most users get instant loads.

## Setup Instructions

### 1. Generate Initial deposits.json

```bash
cd front-vite
VITE_PUBLIC_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
  npm run refresh:deposits
```

### 2. Configure GitHub Action (Recommended)

1. Go to: Repository → Settings → Secrets and variables → Actions
2. Add secret: `RPC_URL` = your RPC URL
3. Push code to trigger workflow automatically

The workflow (`.github/workflows/refresh-deposits.yml`) will:
- Run every 6 hours
- Update `src/data/deposits.json`
- Create a pull request with changes

### 3. Manual Refresh (Anytime)

```bash
VITE_PUBLIC_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
  npm run refresh:deposits
```

### 4. Deploy

```bash
npm run build
# Deploy dist/ folder to your hosting
```

## Features

### ✅ Automatic Retry with Exponential Backoff

RPC calls automatically retry if they fail:
- Attempt 1: Immediate
- Attempt 2: After 500ms
- Attempt 3: After 1000ms

### ✅ Progress Tracking

Users see real-time progress:
```
Fetching: 45/70 deposits (Page 3/5) (~8s remaining)
```

### ✅ Smart Caching

1. **localStorage**: Per-user cache (fastest for repeat visitors)
2. **deposits.json**: Shared baseline (updated via GitHub Action)
3. **RPC fetch**: Fallback for new deposits

### ✅ Early Stopping

Stops scanning blocks as soon as all required deposits are found.

## Why This Works in Production

### Even if GitHub Action fails:

```
Monday: deposits.json has 64 deposits
Tuesday: GitHub Action fails ❌
Wednesday: 150 deposits on-chain

User withdraws:
1. deposits.json has 64 (not enough)
2. Fetches 86 new via RPC (~30s)
3. Still works! ✅
```

### Solution for stale data:

1. **Manual refresh**: Run `npm run refresh:deposits`
2. **Check GitHub Actions**: Verify workflow is running
3. **Use faster RPC**: Alchemy, Infura, QuickNode

## Troubleshooting

### Issue: "Unable to fetch deposits"

**Causes**:
- RPC endpoint down
- Network issues
- Rate limiting

**Solutions**:
1. Check browser console for errors
2. Verify RPC URL in environment variables
3. Try again in a few minutes

### Issue: Slow performance (>30s)

**Causes**:
- deposits.json is very old
- Many new deposits to fetch
- Slow RPC provider

**Solutions**:
1. Run `npm run refresh:deposits`
2. Check GitHub Action is running
3. Switch to faster RPC provider

## File Structure

```
front-vite/
├── src/
│   ├── data/
│   │   └── deposits.json          # Static deposit data (updated via action)
│   ├── hooks/
│   │   ├── useIndexer.ts          # GraphQL indexer client
│   │   ├── useIndexerHybrid.ts    # 3-tier fallback logic
│   │   └── useWithdrawTransaction.tsx
│   └── stores/
│       └── depositsStore.ts       # localStorage cache management
├── indexer/
│   └── scripts/
│       ├── export-deposits.js     # Export from Ponder indexer
│       └── refresh-deposits.js    # Refresh via RPC (recommended)
└── .github/workflows/
    └── refresh-deposits.yml       # GitHub Action automation
```

## Environment Variables

Create `.env.production`:

```bash
VITE_PUBLIC_ENV=production
VITE_PUBLIC_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

## Cost Comparison

| Approach | Monthly Cost | Complexity |
|----------|-------------|------------|
| **Current (No Indexer)** | $0-5 (RPC) | Low ✅ |
| Ponder Indexer | $5-20 (Railway) | Medium |
| Dedicated Indexer | $20-100+ | High |

## Recommended RPC Providers

- **Alchemy**: Free tier up to 300M compute units/month
- **Infura**: Free tier up to 500k requests/day
- **QuickNode**: Paid but excellent performance

## Summary

✅ **Works without indexer** - 3-tier fallback ensures reliability
✅ **Self-healing** - Automatic retry with exponential backoff
✅ **Cost efficient** - Minimal infrastructure costs
✅ **User-friendly** - Progress tracking and smart caching
✅ **Automated** - GitHub Action keeps data fresh

**The only thing that changes without a fresh deposits.json is speed, not functionality.**
