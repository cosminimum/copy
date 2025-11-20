/**
 * API Endpoint: Prepare USDC Funding Flow
 *
 * Validates USDC input, calculates funding distribution, gets swap quotes,
 * and creates a funding session for state management and recovery.
 *
 * POST /api/onboarding/prepare-funding
 *
 * Request:
 *   { usdcAmount: string, userAddress: string }
 *
 * Response:
 *   {
 *     sessionId: string,
 *     operatorAddress: string,
 *     safeAddress: string,
 *     distribution: { ... },
 *     quotes: { wmatic: ..., usdcE: ... },
 *     transactions: [...],
 *     estimatedGas: { ... }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import prisma from '@/lib/db/prisma';
import {
  validateUsdcFundingAmount,
  calculateUsdcFundingSplit,
  getUsdcToWmaticQuote,
  getUsdcToUsdcEQuote,
  getUsdcBalance,
} from '@/lib/dex/quickswap-utils';
import { FUNDING_CONTRACTS, USDC_FUNDING_STEPS } from '@/lib/constants/funding';
import { estimateUsdcFlowGas } from '@/lib/transactions/usdc-funding-flow';

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);

// Derive operator address from user EOA
function getOperatorAddress(userAddress: string): string {
  const masterKey = process.env.MASTER_OPERATOR_PRIVATE_KEY!;
  // Normalize address to lowercase to avoid checksum issues
  const normalizedAddress = userAddress.toLowerCase();
  const operatorPrivateKey = ethers.solidityPackedKeccak256(
    ['string', 'address'],
    [masterKey, normalizedAddress]
  );
  const operatorWallet = new ethers.Wallet(operatorPrivateKey);
  return operatorWallet.address;
}

// Get Safe address from CTF Exchange
async function getSafeAddress(operatorAddress: string): Promise<string> {
  const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
  const ctfExchange = new ethers.Contract(
    CTF_EXCHANGE,
    ['function getSafeAddress(address) view returns (address)'],
    provider
  );
  return await ctfExchange.getSafeAddress(operatorAddress);
}

// (Gas estimation moved to usdc-funding-flow.ts, using estimateUsdcFlowGas instead)

export async function POST(request: NextRequest) {
  try {
    console.log('[prepare-funding] Request received');

    const body = await request.json();
    const { usdcAmount, userAddress } = body;

    console.log('[prepare-funding] Request body:', { usdcAmount, userAddress });

    // Validate inputs
    if (!usdcAmount || !userAddress) {
      console.error('[prepare-funding] Missing required fields');
      return NextResponse.json(
        { error: 'USDC amount and user address are required' },
        { status: 400 }
      );
    }

    // Simple address validation (40 hex characters with 0x prefix)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(userAddress)) {
      console.error('[prepare-funding] Invalid address format');
      return NextResponse.json({ error: 'Invalid user address format' }, { status: 400 });
    }

    console.log('[prepare-funding] Address validated:', userAddress);

    const validation = validateUsdcFundingAmount(usdcAmount);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Parse amount and calculate split
    console.log('[prepare-funding] Parsing USDC amount:', usdcAmount);
    const totalUsdc = ethers.parseUnits(usdcAmount, 6); // USDC has 6 decimals
    const { operatorAmount, safeAmount } = calculateUsdcFundingSplit(totalUsdc);
    console.log('[prepare-funding] Split calculated:', {
      operator: ethers.formatUnits(operatorAmount, 6),
      safe: ethers.formatUnits(safeAmount, 6),
    });

    // Get operator and Safe addresses
    console.log('[prepare-funding] Getting operator address...');
    const operatorAddress = getOperatorAddress(userAddress);
    console.log('[prepare-funding] Operator address:', operatorAddress);

    console.log('[prepare-funding] Getting Safe address...');
    const safeAddress = await getSafeAddress(operatorAddress);
    console.log('[prepare-funding] Safe address:', safeAddress);

    // Verify Safe is deployed
    const safeCode = await provider.getCode(safeAddress);
    if (safeCode === '0x') {
      return NextResponse.json(
        { error: 'Safe not deployed yet. Please complete Step 1 first.' },
        { status: 400 }
      );
    }

    // Check user USDC balance
    const userUsdcBalance = await getUsdcBalance(userAddress, provider);
    if (userUsdcBalance < totalUsdc) {
      return NextResponse.json(
        {
          error: 'Insufficient USDC balance',
          details: `You have ${ethers.formatUnits(userUsdcBalance, 6)} USDC, need ${usdcAmount} USDC`,
        },
        { status: 400 }
      );
    }

    // Get Uniswap V3 quotes for both swaps
    console.log(
      '[prepare-funding] Getting USDC → WMATIC quote for:',
      ethers.formatUnits(operatorAmount, 6),
      'USDC'
    );
    const wmaticQuote = await getUsdcToWmaticQuote(operatorAmount, provider);
    console.log('[prepare-funding] WMATIC quote received:', wmaticQuote);

    console.log(
      '[prepare-funding] Getting USDC → USDC.e quote for:',
      ethers.formatUnits(safeAmount, 6),
      'USDC'
    );
    const usdcEQuote = await getUsdcToUsdcEQuote(safeAmount, provider);
    console.log('[prepare-funding] USDC.e quote received:', usdcEQuote);

    // Estimate gas costs
    const gasCosts = await estimateUsdcFlowGas(usdcAmount, provider);

    // Create funding session in database
    const session = await prisma.fundingSession.create({
      data: {
        userAddress: userAddress.toLowerCase(),
        operatorAddress: operatorAddress.toLowerCase(),
        safeAddress: safeAddress.toLowerCase(),
        usdcAmount: usdcAmount,
        status: 'PREPARED',
        lastStep: 0,
        quoteData: {
          operatorUsdc: ethers.formatUnits(operatorAmount, 6),
          safeUsdc: ethers.formatUnits(safeAmount, 6),
          expectedWmatic: ethers.formatEther(wmaticQuote.expectedOutput),
          minimumWmatic: ethers.formatEther(wmaticQuote.minimumOutput),
          expectedUsdcE: ethers.formatUnits(usdcEQuote.expectedOutput, 6),
          minimumUsdcE: ethers.formatUnits(usdcEQuote.minimumOutput, 6),
          timestamp: Date.now(),
        },
      },
    });

    // Return prepared funding data
    return NextResponse.json({
      success: true,
      sessionId: session.id,
      operatorAddress,
      safeAddress,
      distribution: {
        totalUsdc: usdcAmount,
        operatorUsdc: ethers.formatUnits(operatorAmount, 6), // 5% for gas
        safeUsdc: ethers.formatUnits(safeAmount, 6), // 95% for trading
        operatorPercent: '5%',
        safePercent: '95%',
      },
      quotes: {
        wmatic: {
          inputUsdc: ethers.formatUnits(operatorAmount, 6),
          expectedWmatic: ethers.formatEther(wmaticQuote.expectedOutput),
          minimumWmatic: ethers.formatEther(wmaticQuote.minimumOutput),
          exchangeRate: wmaticQuote.exchangeRate,
          slippage: `${wmaticQuote.slippage}%`,
        },
        usdcE: {
          inputUsdc: ethers.formatUnits(safeAmount, 6),
          expectedUsdcE: ethers.formatUnits(usdcEQuote.expectedOutput, 6),
          minimumUsdcE: ethers.formatUnits(usdcEQuote.minimumOutput, 6),
          exchangeRate: usdcEQuote.exchangeRate,
          slippage: `${usdcEQuote.slippage}%`,
        },
      },
      steps: USDC_FUNDING_STEPS.map((step, index) => ({
        id: step.id,
        name: step.name,
        description: step.description,
        requiresUserAction: step.requiresUserAction,
        details:
          index === 0
            ? `Send ${usdcAmount} USDC to operator wallet`
            : index === 2
            ? `Swap ${ethers.formatUnits(operatorAmount, 6)} USDC to ~${ethers.formatEther(wmaticQuote.expectedOutput)} WMATIC`
            : index === 3
            ? `Swap ${ethers.formatUnits(safeAmount, 6)} USDC to ~${ethers.formatUnits(usdcEQuote.expectedOutput, 6)} USDC.e`
            : index === 4
            ? `Transfer USDC.e to Safe wallet`
            : 'Approve USDC for swapping',
      })),
      estimatedGas: {
        totalPol: gasCosts.totalGasCostPol,
        totalUsdc: gasCosts.totalGasCostUsdc,
        breakdown: {
          approve: ethers.formatEther(gasCosts.breakdown.approve),
          swapToPol: ethers.formatEther(gasCosts.breakdown.swapToPol),
          swapToUsdcE: ethers.formatEther(gasCosts.breakdown.swapToUsdcE),
        },
      },
      summary: {
        youSend: `${usdcAmount} USDC`,
        operatorReceives: `~${ethers.formatEther(wmaticQuote.expectedOutput)} WMATIC (for gas)`,
        safeReceives: `~${ethers.formatUnits(usdcEQuote.expectedOutput, 6)} USDC.e (for trading)`,
        estimatedGasCost: `~${gasCosts.totalGasCostUsdc} USD (~${gasCosts.totalGasCostPol} POL)`,
      },
    });
  } catch (error) {
    console.error('[prepare-funding] Error:', error);

    // Extract meaningful error message
    let errorMessage = 'Failed to prepare funding';
    let errorDetails = 'Unknown error';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetails = error;
    } else if (error && typeof error === 'object') {
      errorMessage = (error as any).reason || (error as any).message || errorMessage;
      errorDetails = JSON.stringify(error);
    }

    console.error('[prepare-funding] Error message:', errorMessage);
    console.error('[prepare-funding] Error details:', errorDetails);

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}
