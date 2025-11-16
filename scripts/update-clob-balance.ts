/**
 * Update CLOB Balance
 *
 * Manually sync Safe's on-chain balance with Polymarket CLOB backend
 *
 * Usage:
 *   npx ts-node scripts/update-clob-balance.ts <USER_EOA>
 *
 * This fixes "not enough balance / allowance" errors
 */

import { PrismaClient } from '@prisma/client';
import { deriveOperatorWallet } from '../lib/operators/wallet-derivation.js';
import { loadCLOBCredentialsByEOA } from '../lib/polymarket/credential-manager.js';
import { updateBalanceAllowance, getCLOBBalance } from '../lib/polymarket/signature-type2-signer.js';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const userEOA = process.argv[2];

  if (!userEOA) {
    console.error('Usage: npx ts-node scripts/update-clob-balance.ts <USER_EOA>');
    console.error('\nExample:');
    console.error('  npx ts-node scripts/update-clob-balance.ts 0x137B210AaB15F04f6Ee8ef0616C62C6042b98f04');
    process.exit(1);
  }

  console.log('🔄 Updating CLOB Balance\n');
  console.log(`User EOA: ${userEOA}\n`);

  // Get user
  const user = await prisma.user.findUnique({
    where: { walletAddress: ethers.getAddress(userEOA) },
    select: {
      id: true,
      safeAddress: true,
      walletAddress: true,
    },
  });

  if (!user) {
    console.error('❌ User not found in database');
    process.exit(1);
  }

  if (!user.safeAddress) {
    console.error('❌ User does not have a Safe deployed');
    process.exit(1);
  }

  console.log(`Safe Address: ${user.safeAddress}`);

  // Check on-chain balance
  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);
  const usdcContract = new ethers.Contract(
    '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  const onChainBalance = await usdcContract.balanceOf(user.safeAddress);
  const onChainBalanceUSDC = parseFloat(ethers.formatUnits(onChainBalance, 6));

  console.log(`On-Chain USDC.e Balance: $${onChainBalanceUSDC.toFixed(2)}\n`);

  if (onChainBalanceUSDC === 0) {
    console.log('⚠️  Warning: Safe has $0 USDC.e balance on-chain');
    console.log('   Make sure to deposit USDC.e first!');
    console.log('');
  }

  // Load credentials
  const credentials = await loadCLOBCredentialsByEOA(userEOA);

  if (!credentials) {
    console.error('❌ CLOB credentials not found');
    console.error('   Run: npx ts-node scripts/onboard-user-complete.ts', userEOA);
    process.exit(1);
  }

  console.log(`CLOB API Key: ${credentials.apiKey}\n`);

  // Derive operator
  const operator = deriveOperatorWallet(userEOA);
  console.log(`Operator Address: ${operator.address}\n`);

  // Check CLOB balance before update
  console.log('Checking CLOB balance before update...');
  try {
    const clobBalanceBefore = await getCLOBBalance(
      operator.privateKey,
      credentials,
      user.safeAddress,
      137
    );
    console.log(`CLOB Balance (before): $${clobBalanceBefore.toFixed(2)}`);
  } catch (error: any) {
    console.log(`CLOB Balance (before): Unable to fetch (${error.message})`);
  }

  // Update balance
  console.log('\nUpdating CLOB balance...');
  try {
    await updateBalanceAllowance(
      operator.privateKey,
      credentials,
      user.safeAddress,
      137
    );

    console.log('✅ Balance update request sent to CLOB');
  } catch (error: any) {
    console.error('❌ Failed to update balance:', error.message);
    process.exit(1);
  }

  // Wait a moment for CLOB to process
  console.log('Waiting 2 seconds for CLOB to process...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check CLOB balance after update
  console.log('\nChecking CLOB balance after update...');
  try {
    const clobBalanceAfter = await getCLOBBalance(
      operator.privateKey,
      credentials,
      user.safeAddress,
      137
    );
    console.log(`CLOB Balance (after): $${clobBalanceAfter.toFixed(2)}`);

    if (clobBalanceAfter === onChainBalanceUSDC) {
      console.log('\n✅ CLOB balance matches on-chain balance!');
      console.log('   User can now trade on Polymarket.');
    } else {
      console.log('\n⚠️  Warning: CLOB balance does not match on-chain balance');
      console.log(`   On-chain: $${onChainBalanceUSDC.toFixed(2)}`);
      console.log(`   CLOB: $${clobBalanceAfter.toFixed(2)}`);
      console.log('   This may take a few minutes to sync. Wait and retry.');
    }
  } catch (error: any) {
    console.error('❌ Failed to check balance:', error.message);
  }

  console.log('\n🎉 Done!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
