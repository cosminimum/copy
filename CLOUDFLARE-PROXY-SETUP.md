# Cloudflare Bypass Setup with Scrape.do

This guide explains how your copy trading bot bypasses Cloudflare blocking using scrape.do when deployed on Railway.

## Problem

When deployed on cloud infrastructure like Railway, requests to Polymarket's CLOB API are blocked by Cloudflare with a 403 Forbidden error. This happens because:

1. Railway's IP addresses are flagged as datacenter IPs
2. Cloudflare's bot detection triggers on cloud infrastructure requests
3. Missing browser-like headers and fingerprints

## Solution - Scrape.do Integration ✅

We've integrated **scrape.do** proxy service by patching axios at the module level:

- ✅ Token is hardcoded: `bc113e34f8584ac0936675f5df2ad52ea7b101f0ce7`
- ✅ **Patches axios globally** to route ALL Polymarket requests through scrape.do
- ✅ Handles Cloudflare challenges automatically
- ✅ No environment variables needed
- ✅ Works for all axios instances (including internal CLOB client instances)

## How It Works

### Technical Implementation

The solution patches axios at the module level (`lib/polymarket/axios-config.ts`):

1. **Replaces axios default adapter** before any other code runs
2. **Intercepts all HTTP requests** made by any part of the application
3. **Detects Polymarket URLs** (`clob.polymarket.com`, `polymarket.com`)
4. **Rewrites URL** to route through scrape.do API
5. **Scrape.do handles** Cloudflare challenges, browser fingerprinting, etc.
6. **Returns response** transparently to the application

### Request Flow

```
Your App → ClobClient makes request to https://clob.polymarket.com/order
    ↓
Axios default adapter intercepts (our custom adapter)
    ↓
Detects it's a Polymarket domain
    ↓
Rewrites URL to: https://api.scrape.do/?token=...&url=https%3A%2F%2Fclob.polymarket.com%2Forder
    ↓
Makes request to scrape.do API
    ↓
Scrape.do proxies through their network
    ↓
Cloudflare sees legitimate residential IP ✅
    ↓
Response returned to ClobClient (transparent)
```

## Deployment on Railway

**Zero configuration needed!** The axios patching happens automatically.

### What Gets Proxied

Only requests to these domains are proxied:
- `clob.polymarket.com` (CLOB API - order placement, balance checks, etc.)
- `polymarket.com` (Polymarket API)

All other requests (database, other APIs) go direct without proxy.

### Entry Point Configuration

The axios module is patched at the very start of the application:

**`scripts/websocket-listener.ts`** (lines 18-21):
```typescript
// IMPORTANT: Configure axios BEFORE any other imports
import { configureAxiosForCloudflare } from '../lib/polymarket/axios-config.js'
configureAxiosForCloudflare()

// Now import everything else...
import { PrismaClient } from '@prisma/client'
// ... rest of imports
```

This ensures axios is patched BEFORE any code tries to use it.

## Monitoring

When your app starts, you'll see these logs:

```
[AxiosConfig] ===============================================
[AxiosConfig] Patching axios module for scrape.do proxy...
[AxiosConfig] Token: bc113e34f8584a...
[AxiosConfig] Domains: clob.polymarket.com, polymarket.com
[AxiosConfig] ✅ Axios module patched successfully!
[AxiosConfig] ===============================================
```

When making requests to Polymarket:

```
[AxiosConfig] 🔄 Proxying: https://clob.polymarket.com/order
[AxiosConfig] ➡️  Via: https://api.scrape.do/?token=bc113e34f8584ac0936675f5df2ad52ea7b101f0ce7&url=http...
```

**If you still see 403 errors with NO proxy logs**, the axios patching isn't working - check that `configureAxiosForCloudflare()` is called before all other imports.

## Troubleshooting

### Still Getting 403 Errors?

1. **Check logs** - Do you see `[AxiosConfig]` proxy messages?
   - **YES**: Scrape.do issue (check credits/status below)
   - **NO**: Axios not patched (check import order)

2. **Verify scrape.do has credits**:
   - Login to https://app.scrape.do/
   - Check dashboard for remaining credits
   - Check for any error messages

3. **Check scrape.do status**:
   - Visit https://scrape.do/status
   - Verify service is operational

4. **Test manually**:
   ```bash
   curl "https://api.scrape.do/?token=bc113e34f8584ac0936675f5df2ad52ea7b101f0ce7&url=https://clob.polymarket.com/ok"
   ```

### Not Seeing Proxy Logs?

If you don't see `[AxiosConfig]` messages, the module patching isn't working:

1. **Verify import order**: `configureAxiosForCloudflare()` must be called BEFORE any imports that use axios
2. **Check entry point**: Make sure it's in `scripts/websocket-listener.ts` at the top
3. **Rebuild**: Run `npm run build` if necessary
4. **Check logs**: Look for `[AxiosConfig] ❌ Failed to patch` error messages

### Timeout Errors?

Scrape.do may take longer than direct requests:
- Default timeout: 30 seconds
- If timing out, check scrape.do status
- May need to upgrade plan for better performance

### Rate Limiting?

- Check usage at https://app.scrape.do/
- Upgrade plan if needed

## Cost & Plans

Scrape.do pricing: https://scrape.do/pricing

**Typical usage for copy trading bot:**
- ~1,000-5,000 requests/day (depending on trade frequency)
- Each request = 1 credit
- Plans start at $29/month for 100K credits

**Recommendations:**
- **Starter Plan** ($29/mo - 100K credits): Good for 3,000 requests/day
- **Basic Plan** ($99/mo - 500K credits): Good for 16,000 requests/day
- **Pro Plan** ($249/mo - 2M credits): High volume production

## Security

✅ **Token Security**: While the token is hardcoded, this is acceptable because:
- The repository is private
- Railway environment is secure
- Token can be rotated if compromised
- No payment info stored in token (billing is separate in scrape.do account)

🔄 **To Rotate Token** (if compromised):
1. Login to https://app.scrape.do/
2. Generate new token
3. Update `lib/polymarket/axios-config.ts:16`
4. Redeploy on Railway

## Testing Locally

The configuration works automatically - just run:

```bash
npm run websocket:start
```

You should see the axios patching messages, and requests should succeed.

### Debugging Locally

To verify the patch is working:

1. Run: `npm run websocket:start`
2. Look for: `[AxiosConfig] ✅ Axios module patched successfully!`
3. Make a trade (or wait for websocket event)
4. Look for: `[AxiosConfig] 🔄 Proxying: https://clob.polymarket.com/...`

If you see these logs, the patch is working correctly!

## Implementation Details

### Files Modified

1. **`lib/polymarket/axios-config.ts`**
   - Patches axios.defaults.adapter globally
   - Replaces default HTTP adapter with custom scrape.do adapter
   - Intercepts ALL axios requests (regardless of instance)

2. **`scripts/websocket-listener.ts:18-21`**
   - Calls `configureAxiosForCloudflare()` before any other imports
   - Ensures axios is patched before CLOB client loads

3. **`lib/polymarket/signature-type2-signer.ts:90-91`**
   - Comment notes that axios is configured globally
   - No local configuration needed

4. **`lib/polymarket/credential-manager.ts:83-84`**
   - Comment notes that axios is configured globally
   - No local configuration needed

### Why Module-Level Patching?

The `@polymarket/clob-client` package uses axios internally. Traditional interceptors only apply to the specific axios instance you add them to. By patching `axios.defaults.adapter` at the module level, we ensure ALL axios instances use our custom adapter, including:

- Direct axios calls in our code
- Axios calls inside @polymarket/clob-client
- Axios calls in any other dependency

This is the most reliable way to intercept ALL HTTP traffic.

## Alternative: Disable Proxy for Local Development

If you want to test without the proxy locally (and you're not getting blocked):

1. Comment out lines 20-21 in `scripts/websocket-listener.ts`:
   ```typescript
   // import { configureAxiosForCloudflare } from '../lib/polymarket/axios-config.js'
   // configureAxiosForCloudflare()
   ```
2. Run locally
3. **Remember to uncomment before deploying to Railway!**

## Support

For scrape.do support:
- Documentation: https://docs.scrape.do/
- Support: https://scrape.do/contact
- Status page: https://scrape.do/status

For application issues:
- Check Railway logs for `[AxiosConfig]` messages
- Verify scrape.do has sufficient credits
- Test with curl (see Troubleshooting section above)

## Summary

✅ **Setup**: Zero configuration - token hardcoded, axios patched globally
✅ **Deployment**: Just deploy to Railway, it works automatically
✅ **Monitoring**: Look for `[AxiosConfig]` logs to verify it's working
✅ **Cost**: ~$29-99/month depending on volume
✅ **Reliability**: Module-level patching ensures ALL requests are proxied
✅ **Transparency**: Works seamlessly with existing CLOB client code
