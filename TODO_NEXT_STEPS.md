# Next Steps to Complete USDC Funding Flow

## Immediate Actions Required

### 1. Database Migration ⚠️ **CRITICAL**

The `FundingSession` model has been added to your Prisma schema. You need to apply this migration:

```bash
# Option 1: Create a new migration (recommended for production)
npx prisma migrate dev --name add_funding_session

# Option 2: Push to database directly (for development)
npx prisma db push
```

After migration, regenerate the Prisma client:
```bash
npx prisma generate
```

---

## 2. Environment Variables

Ensure these are set in your `.env` file:

```env
# Required for operator wallet derivation
MASTER_OPERATOR_PRIVATE_KEY=your_master_key_here

# Required for blockchain operations
POLYGON_RPC_URL=https://polygon-rpc.com

# Database connection (should already exist)
DATABASE_URL=postgresql://...
```

---

## 3. Testing Checklist

### Prerequisites
- [ ] Wallet with USDC on Polygon network
- [ ] Small amount of POL for gas (0.1-1 POL)

### Test Flow
1. [ ] Start onboarding process
2. [ ] Complete Step 1: Deploy Safe
3. [ ] Reach Step 2: Fund Wallets
4. [ ] Enter USDC amount (try $10-20 for testing)
5. [ ] Verify quote displays correctly:
   - [ ] Shows 5% → WMATIC
   - [ ] Shows 95% → USDC.e
   - [ ] Displays gas estimates
6. [ ] Click "Start Funding"
7. [ ] Sign USDC transfer transaction
8. [ ] Wait for server-side automation
9. [ ] Verify completion:
   - [ ] Operator has WMATIC balance
   - [ ] Safe has USDC.e balance
   - [ ] Can proceed to next step

### What to Monitor
- Browser console for any errors
- Network tab in DevTools for API calls
- Server logs for execution details
- Polygonscan for transaction confirmations

---

## 4. Potential Issues & Solutions

### Issue: "Failed to prepare funding"
**Cause**: Quote fetching failed
**Solution**:
- Check Polygon RPC URL is working
- Verify Uniswap V3 contracts are accessible
- Check network connectivity

### Issue: "Insufficient USDC balance"
**Cause**: User doesn't have enough USDC
**Solution**:
- Acquire native USDC on Polygon
- Bridge USDC to Polygon from another chain

### Issue: "Funding session not found"
**Cause**: Database migration not run
**Solution**:
- Run `npx prisma migrate dev`
- Restart your Next.js server

### Issue: Server-side execution fails
**Cause**: Operator doesn't have gas for transactions
**Solution**:
- Fund the operator wallet with POL for gas
- Calculate operator address: `getOperatorAddress(userAddress)`

### Issue: Swaps fail with "Insufficient liquidity"
**Cause**: Uniswap V3 pool doesn't have enough liquidity
**Solution**:
- Use smaller test amount
- Check pool exists on Polygon for USDC/WMATIC and USDC/USDC.e

---

## 5. Code Quality Checks

### Before Deploying to Production

1. **TypeScript Compilation**
   ```bash
   npx tsc --noEmit
   ```

2. **Linting**
   ```bash
   npm run lint
   ```

3. **Build Test**
   ```bash
   npm run build
   ```

4. **Test Database Connection**
   ```bash
   npx prisma db pull
   ```

---

## 6. Optional Enhancements (Future)

### Add Retry Logic
- Implement retry for failed swaps
- Add exponential backoff

### Add Webhooks
- Replace polling with webhooks for real-time updates
- Use WebSocket for live progress

### Add Quote Refresh
- Auto-refresh quotes when expired
- Show countdown timer for quote expiry

### Add Analytics
- Track funding success rate
- Monitor average completion time
- Log common error patterns

### Add Multiple Token Support
- Support native USDC and USDC.e as input
- Support direct POL input (legacy flow)
- Auto-detect which token user has

---

## 7. Deployment Checklist

### Before Going Live

- [ ] All tests pass
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Server has sufficient POL for gas
- [ ] Error monitoring setup (Sentry, etc.)
- [ ] Analytics tracking configured
- [ ] Rate limiting on API endpoints
- [ ] User feedback mechanism in place

### Production Considerations

1. **Gas Price Management**
   - Monitor Polygon gas prices
   - Adjust gas estimates dynamically
   - Set maximum gas price threshold

2. **Quote Caching**
   - Cache quotes for a few seconds to reduce RPC calls
   - Implement quote batching for multiple users

3. **Error Recovery**
   - Add manual intervention UI for failed sessions
   - Allow users to retry from last successful step
   - Provide support contact for stuck transactions

4. **Monitoring**
   - Set up alerts for failed funding sessions
   - Track quote accuracy vs actual outputs
   - Monitor operator wallet balance

---

## 8. Documentation Updates

### Update User-Facing Docs

- [ ] Add section on USDC funding to help docs
- [ ] Create video tutorial for funding flow
- [ ] Update FAQ with common questions
- [ ] Add troubleshooting guide

### Update Developer Docs

- [ ] Document API endpoints
- [ ] Add architecture diagrams
- [ ] Document database schema changes
- [ ] Update deployment guide

---

## 9. Success Metrics to Track

Once deployed, monitor:

1. **Completion Rate**: % of users who successfully complete funding
2. **Average Time**: How long funding typically takes
3. **Error Rate**: % of sessions that fail
4. **Gas Costs**: Average gas spent per funding session
5. **Slippage**: Actual vs expected output amounts

---

## 10. Quick Reference

### Important Files
- Backend logic: `lib/transactions/usdc-funding-flow.ts`
- API endpoints: `app/api/onboarding/*/route.ts`
- Frontend UI: `components/onboarding/usdc-funding-flow.tsx`
- Database model: `prisma/schema.prisma` (FundingSession)

### Key Functions
- Prepare funding: `/api/onboarding/prepare-funding`
- Execute funding: `/api/onboarding/execute-funding`
- Check status: `/api/onboarding/execute-funding?sessionId=xxx`

### Contract Addresses (Polygon)
- Native USDC: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- USDC.e: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- WMATIC: `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270`
- Uniswap V3 Router: `0xE592427A0AEce92De3Edee1F18E0157C05861564`

---

## Ready to Go! 🚀

Your USDC funding flow is fully implemented. Just run the database migration and start testing!

```bash
# Run this now:
npx prisma migrate dev --name add_funding_session
npx prisma generate
npm run dev

# Then test the flow in your browser
```

Good luck! 🎉
