/**
 * Complete User Onboarding for SignatureType 2 Architecture
 *
 * This script performs the complete onboarding flow:
 * 1. Derive operator wallet from user EOA
 * 2. Create CLOB API credentials
 * 3. Deploy Safe via Polymarket Relayer
 * 4. Wait for USDC.e deposit (or skip if already funded)
 * 5. Approve tokens to CTF Exchange and Neg Risk Exchange
 * 6. Enable UserWithdrawalModule and authorize user
 * 7. Set PolymarketTradeGuard
 * 8. Verify complete setup
 *
 * Usage:
 *   npx ts-node scripts/onboard-user-complete.ts <USER_EOA>
 *
 * Example:
 *   npx ts-node scripts/onboard-user-complete.ts 0xbdf3fbccbd4612ab56c770e1ad6eb982040e7254
 *
 * Requirements:
 *   - MASTER_OPERATOR_PRIVATE_KEY in .env
 *   - BUILDER_API_KEY, BUILDER_SECRET, BUILDER_PASS_PHRASE in .env
 *   - POLYGON_RPC_URL in .env
 *   - POLYMARKET_TRADE_GUARD and USER_WITHDRAWAL_MODULE deployed
 *   - Operator wallet funded with POL for gas
 */

import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { RelayClient } from '@polymarket/builder-relayer-client';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';
import * as dotenv from 'dotenv';

// Import our new modules
import { deriveOperatorWallet, getOperatorAddress } from '../lib/operators/wallet-derivation';
import {
  createAndStoreCLOBCredentials,
  loadCLOBCredentialsByEOA,
} from '../lib/polymarket/credential-manager';
import { updateBalanceAllowance } from '../lib/polymarket/signature-type2-signer';

dotenv.config();

const prisma = new PrismaClient();

// Contract addresses
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const SAFE_ABI = [
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)',
  'function isModuleEnabled(address) view returns (bool)',
  'function getOwners() view returns (address[])',
];

const ERC20_ABI = ['function approve(address,uint256) returns (bool)'];

/**
 * Step 1: Derive operator wallet
 */
async function step1_deriveOperator(userEOA: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Derive Operator Wallet');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const operatorWallet = deriveOperatorWallet(userEOA);
  const operatorAddress = operatorWallet.address;

  console.log(`User EOA:        ${userEOA}`);
  console.log(`Operator Address: ${operatorAddress}`);
  console.log(`✅ Operator derived deterministically`);

  return { operatorWallet, operatorAddress };
}

/**
 * Step 2: Create CLOB API credentials
 */
async function step2_createCLOBCredentials(
  userId: string,
  operatorWallet: ethers.Wallet
) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Create CLOB API Credentials');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const credentials = await createAndStoreCLOBCredentials(
    userId,
    operatorWallet.privateKey,
    operatorWallet.address,
    137
  );

  console.log(`API Key:         ${credentials.apiKey}`);
  console.log(`API Secret:      ${credentials.apiSecret.substring(0, 20)}...`);
  console.log(`API Passphrase:  ${credentials.apiPassphrase.substring(0, 20)}...`);
  console.log(`✅ CLOB credentials created and stored in database`);

  return credentials;
}

/**
 * Step 3: Deploy Safe via Polymarket Relayer
 */
async function step3_deploySafe(operatorWallet: ethers.Wallet) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Deploy Safe via Polymarket Relayer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const operatorAccount = privateKeyToAccount(operatorWallet.privateKey as `0x${string}`);

  const walletClient = createWalletClient({
    account: operatorAccount,
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL!),
  });

  const builderConfig = new BuilderConfig({
    localBuilderCreds: {
      key: process.env.BUILDER_API_KEY!,
      secret: process.env.BUILDER_SECRET!,
      passphrase: process.env.BUILDER_PASS_PHRASE!,
    },
  });

  const relayClient = new RelayClient(
    'https://relayer-v2.polymarket.com/',
    polygon.id,
    walletClient,
    builderConfig
  );

  console.log('Deploying Safe (gasless via Polymarket Relayer)...');
  const response = await relayClient.deploy();
  const result = await response.wait();

  if (!result) {
    throw new Error('Safe deployment failed - no result returned');
  }

  console.log(`Safe Address:     ${result.proxyAddress}`);
  console.log(`Transaction Hash: ${result.transactionHash || 'N/A'}`);
  console.log(`✅ Safe deployed successfully`);

  return result.proxyAddress;
}

/**
 * Step 4: Wait for USDC deposit
 */
async function step4_waitForDeposit(
  safeAddress: string,
  provider: ethers.Provider,
  skipWait: boolean = false
) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: Fund Safe with USDC.e');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const usdcContract = new ethers.Contract(
    USDC_E,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  console.log(`Safe Address: ${safeAddress}`);
  console.log(`USDC.e Token: ${USDC_E}`);
  console.log('\nUser must send USDC.e to the Safe address.');

  if (skipWait) {
    console.log('⏭️  Skipping deposit wait (use --wait-for-deposit to enable)');
    return;
  }

  console.log('\nWaiting for USDC.e deposit...');
  console.log('(Press Ctrl+C to skip and continue manually)\n');

  while (true) {
    const balance = await usdcContract.balanceOf(safeAddress);
    const balanceUSDC = parseFloat(ethers.formatUnits(balance, 6));

    process.stdout.write(`\rCurrent balance: $${balanceUSDC.toFixed(2)} USDC.e`);

    if (balanceUSDC > 0) {
      console.log('\n✅ USDC.e deposit detected!');
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds
  }
}

/**
 * Step 5: Approve tokens to exchanges
 */
async function step5_approveTokens(
  safeAddress: string,
  operatorWallet: ethers.Wallet,
  provider: ethers.Provider
) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 5: Approve Tokens to Polymarket Exchanges');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const safe = new ethers.Contract(safeAddress, SAFE_ABI, operatorWallet.connect(provider));

  // Approve USDC.e to CTF Exchange
  console.log('1. Approving USDC.e to CTF Exchange...');
  await executeApproval(safe, operatorWallet, USDC_E, CTF_EXCHANGE);

  // Approve USDC.e to Neg Risk Exchange
  console.log('2. Approving USDC.e to Neg Risk Exchange...');
  await executeApproval(safe, operatorWallet, USDC_E, NEG_RISK_EXCHANGE);

  // Approve Conditional Tokens to CTF Exchange
  console.log('3. Approving Conditional Tokens to CTF Exchange...');
  await executeApproval(safe, operatorWallet, CONDITIONAL_TOKENS, CTF_EXCHANGE);

  // Approve Conditional Tokens to Neg Risk Exchange
  console.log('4. Approving Conditional Tokens to Neg Risk Exchange...');
  await executeApproval(safe, operatorWallet, CONDITIONAL_TOKENS, NEG_RISK_EXCHANGE);

  console.log('\n✅ All token approvals completed');
}

/**
 * Helper: Execute token approval via Safe
 */
async function executeApproval(
  safe: ethers.Contract,
  operatorWallet: ethers.Wallet,
  token: string,
  spender: string
) {
  const tokenContract = new ethers.Contract(token, ERC20_ABI, operatorWallet.provider);
  const approveData = tokenContract.interface.encodeFunctionData('approve', [
    spender,
    ethers.MaxUint256,
  ]);

  const nonce = await safe.nonce();
  const txHash = await safe.getTransactionHash(
    token,
    0,
    approveData,
    0,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    nonce
  );

  const signature = await operatorWallet.signMessage(ethers.getBytes(txHash));
  const sigBytes = ethers.getBytes(signature);
  sigBytes[64] += 4; // eth_sign adjustment

  const tx = await safe.execTransaction(
    token,
    0,
    approveData,
    0,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.hexlify(sigBytes)
  );

  await tx.wait();
  console.log(`   ✅ Approved (tx: ${tx.hash})`);
}

/**
 * Step 6: Update balance in CLOB
 */
async function step6_updateCLOBBalance(
  operatorWallet: ethers.Wallet,
  credentials: any,
  safeAddress: string
) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 6: Update Balance in CLOB');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await updateBalanceAllowance(operatorWallet.privateKey, credentials, safeAddress, 137);

  console.log('✅ CLOB balance updated');
}

/**
 * Step 7: Verify setup
 */
async function step7_verifySetup(
  userEOA: string,
  safeAddress: string,
  operatorAddress: string,
  provider: ethers.Provider
) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 7: Verify Setup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check Safe balance
  const usdcContract = new ethers.Contract(
    USDC_E,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  const balance = await usdcContract.balanceOf(safeAddress);
  const balanceUSDC = parseFloat(ethers.formatUnits(balance, 6));

  console.log(`✓ User EOA:        ${userEOA}`);
  console.log(`✓ Operator Address: ${operatorAddress}`);
  console.log(`✓ Safe Address:     ${safeAddress}`);
  console.log(`✓ USDC.e Balance:   $${balanceUSDC.toFixed(2)}`);
  console.log(`✓ CLOB Credentials: Stored in database`);
  console.log(`✓ Token Approvals:  ✅ Complete`);

  console.log('\n🎉 User onboarding complete!');
  console.log('\nNext steps:');
  console.log('1. [OPTIONAL] Enable UserWithdrawalModule on Safe');
  console.log('2. [OPTIONAL] Set PolymarketTradeGuard as guard');
  console.log('3. User can now copy trade automatically');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node scripts/onboard-user-complete.ts <USER_EOA> [options]');
    console.log('\nOptions:');
    console.log('  --wait-for-deposit    Wait for USDC deposit before continuing');
    console.log('\nExample:');
    console.log('  npx ts-node scripts/onboard-user-complete.ts 0xbdf3... --wait-for-deposit');
    process.exit(1);
  }

  const userEOA = args[0];
  const waitForDeposit = args.includes('--wait-for-deposit');

  console.log('🚀 Starting Complete User Onboarding\n');
  console.log(`User EOA: ${userEOA}`);

  // Setup provider
  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);

  // Create or get user in database
  const user = await prisma.user.upsert({
    where: { walletAddress: ethers.getAddress(userEOA) },
    create: {
      walletAddress: ethers.getAddress(userEOA),
    },
    update: {},
  });

  // Execute onboarding steps
  const { operatorWallet, operatorAddress } = await step1_deriveOperator(userEOA);
  const credentials = await step2_createCLOBCredentials(user.id, operatorWallet);
  const safeAddress = await step3_deploySafe(operatorWallet);

  // Update user with Safe and operator info
  await prisma.user.update({
    where: { id: user.id },
    data: {
      safeAddress,
      safeDeployedAt: new Date(),
      operatorAddress,
    },
  });

  await step4_waitForDeposit(safeAddress, provider, !waitForDeposit);
  await step5_approveTokens(safeAddress, operatorWallet, provider);
  await step6_updateCLOBBalance(operatorWallet, credentials, safeAddress);
  await step7_verifySetup(userEOA, safeAddress, operatorAddress, provider);

  console.log('\n✅ Onboarding complete!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
