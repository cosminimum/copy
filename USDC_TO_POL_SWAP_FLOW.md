# USDC to POL Swap Flow for Operator Gas Funding

## Problem

The original flow expected the user to send USDC to the operator wallet, then the operator would swap USDC to POL and USDC.e. However, the operator needs POL for gas fees to execute those swaps. This created a chicken-and-egg problem.

## Solution

The user now performs a small USDC → POL swap in their own wallet and sends that POL to the operator **before** sending the bulk USDC. This ensures the operator has gas to execute the main funding flow.

## New Flow

### Step 1: Calculate Gas Requirements (API)

**Endpoint:** `POST /api/onboarding/calculate-gas-swap`

**Request:**
```json
{
  "usdcAmount": "100"
}
```

**Response:**
```json
{
  "success": true,
  "usdcToSwap": "0.043051",
  "expectedPol": "0.08",
  "minimumPol": "0.0792",
  "exchangeRate": "1 POL = $0.538137",
  "estimatedGasCost": "0.02152582580115",
  "estimatedGasCostUsdc": "0.01",
  "breakdown": {
    "approve": "0.00015",
    "swapToPol": "0.0075",
    "swapToUsdcE": "0.0045"
  }
}
```

This calculates how much USDC the user needs to swap to POL to cover the operator's gas fees (with 20% buffer).

### Step 2: Prepare Gas Transfer Transactions (API)

**Endpoint:** `POST /api/onboarding/prepare-gas-transfer`

**Request:**
```json
{
  "userAddress": "0x...",
  "operatorAddress": "0x...",
  "usdcAmount": "100"
}
```

**Response:**
```json
{
  "success": true,
  "steps": [
    {
      "type": "approve",
      "to": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      "data": "0x095ea7b3...",
      "value": "0",
      "description": "Approve 0.043051 USDC for QuickSwap",
      "gasLimit": "60000"
    },
    {
      "type": "swap",
      "to": "0xf5b509bB0909a69B1c207E495f687a596C168E12",
      "data": "0x414bf389...",
      "value": "0",
      "description": "Swap 0.043051 USDC to WMATIC",
      "gasLimit": "250000"
    },
    {
      "type": "unwrap",
      "to": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      "data": "0x2e1a7d4d...",
      "value": "0",
      "description": "Unwrap WMATIC to 0.08 POL",
      "gasLimit": "50000"
    },
    {
      "type": "transfer",
      "to": "0xd8bec09ee096db0b8e7f4207aee00f22e8f0e7f3",
      "data": "0x",
      "value": "79200000000000000",
      "description": "Transfer 0.0792 POL to operator",
      "gasLimit": "21000"
    }
  ],
  "summary": {
    "usdcToSwap": "0.043051",
    "expectedPol": "0.08",
    "minimumPol": "0.0792",
    "exchangeRate": "1 POL = $0.538137",
    "estimatedGasCost": "0.02152582580115",
    "operatorAddress": "0xd8bec09ee096db0b8e7f4207aee00f22e8f0e7f3"
  },
  "checks": {
    "hasEnoughUsdc": true,
    "needsApproval": true
  }
}
```

### Step 3: User Executes Transactions (Client)

The client sends these transactions sequentially using wagmi/viem:

1. **Approve USDC** (if `needsApproval === true`)
   - Wait for confirmation

2. **Swap USDC → WMATIC**
   - Wait for confirmation

3. **Unwrap WMATIC → POL**
   - Wait for confirmation

4. **Transfer POL to operator**
   - Wait for confirmation

### Step 4: User Sends USDC to Operator (Client)

After the POL transfer is complete, the user sends the remaining USDC to the operator:

```typescript
// Send USDC to operator
const { hash } = await writeContract({
  address: FUNDING_CONTRACTS.USDC,
  abi: erc20Abi,
  functionName: 'transfer',
  args: [operatorAddress, parseUnits(usdcAmount, 6)],
});

await waitForTransactionReceipt({ hash });
```

### Step 5: Execute Funding Flow (API)

**Endpoint:** `POST /api/onboarding/execute-funding`

**Request:**
```json
{
  "sessionId": "...",
  "userTxHash": "0x..."
}
```

Now the validation will pass because:
- ✅ Operator has USDC (sent by user in Step 4)
- ✅ Operator has POL for gas (sent by user in Step 3)

The operator can now execute the swaps:
1. Approve USDC for QuickSwap
2. Swap 5% USDC → WMATIC → POL (operator gas)
3. Swap 95% USDC → USDC.e → Safe (trading capital)

## Key Changes

### New Files

1. **`lib/dex/user-usdc-swap.ts`**
   - Client-side utilities for USDC → POL swaps
   - Functions: `calculateRequiredUsdcForGas`, `buildUserUsdcApproval`, `buildUserUsdcToWmaticSwap`, `buildUserWmaticUnwrap`

2. **`app/api/onboarding/calculate-gas-swap/route.ts`**
   - API to calculate required USDC for gas swap

3. **`app/api/onboarding/prepare-gas-transfer/route.ts`**
   - API to prepare all transaction data for gas transfer

### Modified Files

1. **`lib/transactions/usdc-funding-flow.ts`**
   - Updated `validateUsdcFlowRequirements` to return `warnings` and `requiredPolForGas`
   - Better error messages

2. **`app/api/onboarding/execute-funding/route.ts`**
   - Handle new validation response with warnings

## Usage Example (Client)

```typescript
// 1. Calculate gas requirements
const gasCalc = await fetch('/api/onboarding/calculate-gas-swap', {
  method: 'POST',
  body: JSON.stringify({ usdcAmount: '100' }),
});
const { usdcToSwap, expectedPol } = await gasCalc.json();

// 2. Prepare transactions
const prepResp = await fetch('/api/onboarding/prepare-gas-transfer', {
  method: 'POST',
  body: JSON.stringify({
    userAddress: address,
    operatorAddress: operatorAddress,
    usdcAmount: '100',
  }),
});
const { steps, summary } = await prepResp.json();

// 3. Execute each step
for (const step of steps) {
  const hash = await sendTransaction({
    to: step.to,
    data: step.data,
    value: step.value ? BigInt(step.value) : 0n,
    gas: BigInt(step.gasLimit),
  });
  await waitForTransactionReceipt({ hash });
}

// 4. Send USDC to operator
const usdcHash = await writeContract({
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: 'transfer',
  args: [operatorAddress, parseUnits('100', 6)],
});
await waitForTransactionReceipt({ hash: usdcHash });

// 5. Execute funding flow
const execResp = await fetch('/api/onboarding/execute-funding', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: sessionId,
    userTxHash: usdcHash,
  }),
});
```

## Benefits

1. **Self-funding operator gas**: User provides the gas POL upfront
2. **Clear error messages**: Validation tells user exactly what's missing
3. **Automated flow**: Once POL and USDC are sent, the rest is automatic
4. **Safe buffer**: 20% extra POL to handle gas price fluctuations
5. **Modular design**: Each step can be monitored and retried independently

## Contract Addresses (Polygon)

- **USDC (Native):** `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- **USDC.e (Bridged):** `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- **WMATIC:** `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270`
- **QuickSwap V3 Router:** `0xf5b509bB0909a69B1c207E495f687a596C168E12`
- **QuickSwap V3 Quoter:** `0xa15F0D7377B2A0C0c10db057f641beD21028FC89`
