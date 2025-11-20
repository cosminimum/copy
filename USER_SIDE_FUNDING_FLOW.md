# User-Side USDC Funding Flow

## Overview

The user executes **ALL swaps in their own wallet**. The operator receives POL for gas fees, and the Safe receives USDC.e for trading capital. No swaps are executed by the operator.

## Flow Architecture

### User Actions (6 Steps)

**User starts with:** 100 USDC in their wallet

**Step 1: Approve USDC for QuickSwap**
- User approves 100 USDC for QuickSwap V3 Router
- Transaction: `USDC.approve(QuickSwapRouter, 100 USDC)`

**Step 2: Swap 5% USDC → WMATIC → POL (for operator gas)**
- User swaps 5 USDC → ~10 POL via QuickSwap V3
- Transaction: `QuickSwapRouter.exactInputSingle(USDC → WMATIC, recipient: user)`
- POL stays in user's wallet as WMATIC (unwrapped in next step)

**Step 3: Unwrap WMATIC → POL & Transfer to Operator**
- User unwraps WMATIC to native POL
- Transaction: `WMATIC.withdraw(amount)`
- Then transfers POL to operator
- Transaction: `transfer(operator, POL amount)`

**Step 4: Swap 95% USDC → USDC.e (for Safe trading capital)**
- User swaps 95 USDC → ~94.9 USDC.e via QuickSwap V3
- Transaction: `QuickSwapRouter.exactInputSingle(USDC → USDC.e, recipient: user)`

**Step 5: Transfer USDC.e to Safe**
- User sends USDC.e to Safe wallet
- Transaction: `USDC_E.transfer(safe, amount)`

**Step 6: Verify Completion**
- Backend verifies operator has POL and Safe has USDC.e
- API call: `POST /api/onboarding/execute-funding`
- Marks funding session as COMPLETED

### Server Actions (Verification Only)

The backend **DOES NOT** execute any swaps. It only:
1. Verifies operator received POL
2. Verifies Safe received USDC.e
3. Marks funding session as completed

## API Endpoints

### 1. Prepare User Funding Transactions

**Endpoint:** `POST /api/onboarding/prepare-user-funding`

**Request:**
```json
{
  "userAddress": "0xuser...",
  "operatorAddress": "0xoperator...",
  "safeAddress": "0xsafe...",
  "usdcAmount": "100"
}
```

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "type": "approve",
      "to": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      "data": "0x095ea7b3...",
      "value": "0",
      "description": "Approve 100 USDC for QuickSwap",
      "gasLimit": "60000"
    },
    {
      "type": "swap_to_pol",
      "to": "0xf5b509bB0909a69B1c207E495f687a596C168E12",
      "data": "0x414bf389...",
      "value": "0",
      "description": "Swap 5 USDC to WMATIC (for operator gas)",
      "gasLimit": "250000"
    },
    {
      "type": "unwrap_pol",
      "to": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      "data": "0x2e1a7d4d...",
      "value": "0",
      "description": "Unwrap WMATIC to 10 POL",
      "gasLimit": "50000"
    },
    {
      "type": "transfer_pol",
      "to": "0xoperator...",
      "data": "0x",
      "value": "10000000000000000000",
      "description": "Transfer 10 POL to operator",
      "gasLimit": "21000"
    },
    {
      "type": "swap_to_usdce",
      "to": "0xf5b509bB0909a69B1c207E495f687a596C168E12",
      "data": "0x414bf389...",
      "value": "0",
      "description": "Swap 95 USDC to USDC.e (for Safe trading)",
      "gasLimit": "200000"
    },
    {
      "type": "transfer_usdce",
      "to": "0xsafe...",
      "data": "0xa9059cbb...",
      "value": "0",
      "description": "Transfer 94.9 USDC.e to Safe",
      "gasLimit": "65000"
    }
  ],
  "summary": {
    "totalUsdc": "100",
    "operatorPol": {
      "usdc": "5",
      "expectedPol": "10",
      "minimumPol": "9.9",
      "rate": "1 POL = $0.505"
    },
    "safeUsdcE": {
      "usdc": "95",
      "expectedUsdcE": "94.95",
      "minimumUsdcE": "94.9",
      "rate": "1 USDC.e = $0.9995"
    },
    "operatorAddress": "0xoperator...",
    "safeAddress": "0xsafe..."
  },
  "checks": {
    "hasEnoughUsdc": true,
    "needsApproval": true,
    "currentBalance": "100",
    "currentAllowance": "0"
  }
}
```

### 2. Verify Funding Completion

**Endpoint:** `POST /api/onboarding/execute-funding`

**Request:**
```json
{
  "sessionId": "...",
  "txHashes": {
    "approve": "0x...",
    "swapToPol": "0x...",
    "transferPol": "0x...",
    "swapToUsdcE": "0x...",
    "transferUsdcE": "0x..."
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "verified": true,
  "balances": {
    "operatorPol": "10",
    "safeUsdcE": "94.9"
  },
  "warnings": [],
  "message": "Funding completed successfully. Operator has POL for gas, Safe has USDC.e for trading."
}
```

**Response (Failure):**
```json
{
  "success": false,
  "verified": false,
  "errors": [
    "Operator has insufficient POL. Expected at least 9.9 POL, but has 0 POL. User must complete the POL transfer.",
    "Safe has insufficient USDC.e. Expected at least 94.9 USDC.e, but has 0 USDC.e. User must complete the USDC.e transfer."
  ],
  "balances": {
    "operatorPol": "0",
    "safeUsdcE": "0"
  },
  "expected": {
    "operatorPol": "9.9",
    "safeUsdcE": "94.9"
  }
}
```

## Client Implementation Example

```typescript
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions';

async function executeFunding(userAddress: string, sessionId: string) {
  // 1. Prepare transactions
  const response = await fetch('/api/onboarding/prepare-user-funding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userAddress,
      operatorAddress: session.operatorAddress,
      safeAddress: session.safeAddress,
      usdcAmount: session.usdcAmount,
    }),
  });

  const { transactions, summary } = await response.json();

  // 2. Execute each transaction
  const txHashes: Record<string, string> = {};

  for (const tx of transactions) {
    // Send transaction
    const hash = await sendTransaction({
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
      gas: BigInt(tx.gasLimit),
    });

    // Wait for confirmation
    await waitForTransactionReceipt({ hash });

    // Store hash
    txHashes[tx.type] = hash;

    // Update UI progress
    console.log(`✓ ${tx.description}`);
  }

  // 3. Verify completion
  const verifyResponse = await fetch('/api/onboarding/execute-funding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      txHashes,
    }),
  });

  const result = await verifyResponse.json();

  if (result.verified) {
    console.log('✓ Funding completed!');
    console.log(`Operator POL: ${result.balances.operatorPol}`);
    console.log(`Safe USDC.e: ${result.balances.safeUsdcE}`);
  } else {
    console.error('✗ Funding verification failed:', result.errors);
  }
}
```

## Key Benefits

1. **No operator gas dependency**: User provides gas POL upfront
2. **Full transparency**: User sees all swaps happening in their wallet
3. **Better slippage control**: User can see exact amounts before signing
4. **Simpler backend**: No private key management for swaps
5. **Atomic operations**: Each step can be retried independently

## Contract Addresses (Polygon)

- **USDC (Native):** `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- **USDC.e (Bridged):** `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- **WMATIC:** `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270`
- **QuickSwap V3 Router:** `0xf5b509bB0909a69B1c207E495f687a596C168E12`
- **QuickSwap V3 Quoter:** `0xa15F0D7377B2A0C0c10db057f641beD21028FC89`

## Split Configuration

- **Operator:** 5% of USDC → POL (for gas fees)
- **Safe:** 95% of USDC → USDC.e (for trading capital)
- **Slippage Tolerance:** 1% (100 basis points)

## Gas Estimates

- **Approve USDC:** ~60,000 gas
- **Swap USDC → WMATIC:** ~250,000 gas
- **Unwrap WMATIC:** ~50,000 gas
- **Transfer POL:** ~21,000 gas
- **Swap USDC → USDC.e:** ~200,000 gas
- **Transfer USDC.e:** ~65,000 gas
- **Total:** ~646,000 gas (~0.02 POL at 30 gwei)
