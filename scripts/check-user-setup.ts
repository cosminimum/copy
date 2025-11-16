/**
 * Check User Setup - SignatureType 2 Architecture
 *
 * Verifies complete user onboarding status
 *
 * Usage:
 *   npx ts-node scripts/check-user-setup.ts <USER_EOA>
 */

import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { getOperatorAddress } from '../lib/operators/wallet-derivation';
import { loadCLOBCredentialsByEOA } from '../lib/polymarket/credential-manager';
import { isSafeDeployed, getSafeInfo } from '../lib/contracts/safe-deployer-v2';
import { verifySecuritySetup } from '../lib/contracts/safe-security-setup';
import { checkApprovals } from '../lib/contracts/token-approvals';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const userEOA = process.argv[2];

  if (!userEOA) {
    console.error('Usage: npx ts-node scripts/check-user-setup.ts <USER_EOA>');
    process.exit(1);
  }

  console.log('🔍 Checking User Setup\n');
  console.log(`User EOA: ${userEOA}\n`);

  // 1. Check database
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. DATABASE CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const user = await prisma.user.findUnique({
    where: { walletAddress: ethers.getAddress(userEOA) },
    include: { operatorCredential: true },
  });

  if (!user) {
    console.log('❌ User not found in database');
    console.log('\n➡️  Action: Run onboarding script');
    return;
  }

  console.log('✅ User found in database');
  console.log(`   User ID: ${user.id}`);
  console.log(`   Safe Address: ${user.safeAddress || 'NOT DEPLOYED'}`);
  console.log(`   Operator Address: ${user.operatorAddress || 'NOT SET'}`);
  console.log(`   Guard Enabled: ${user.guardEnabled ? 'YES' : 'NO'}`);
  console.log(`   Withdrawal Module: ${user.withdrawalModuleEnabled ? 'YES' : 'NO'}`);

  // 2. Check operator derivation
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2. OPERATOR DERIVATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const expectedOperatorAddress = getOperatorAddress(userEOA);
  console.log(`Expected Operator: ${expectedOperatorAddress}`);

  if (user.operatorAddress === expectedOperatorAddress) {
    console.log('✅ Operator address matches derivation');
  } else {
    console.log(`❌ Operator address mismatch`);
    console.log(`   Database: ${user.operatorAddress}`);
    console.log(`   Expected: ${expectedOperatorAddress}`);
  }

  // 3. Check CLOB credentials
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3. CLOB API CREDENTIALS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const credentials = await loadCLOBCredentialsByEOA(userEOA);

  if (credentials) {
    console.log('✅ CLOB credentials found');
    console.log(`   API Key: ${credentials.apiKey}`);
    console.log(`   Created: ${credentials.createdAt.toISOString()}`);
  } else {
    console.log('❌ CLOB credentials not found');
    console.log('\n➡️  Action: Run createAndStoreCLOBCredentials()');
  }

  // 4. Check Safe deployment
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4. SAFE DEPLOYMENT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!user.safeAddress) {
    console.log('❌ Safe address not set in database');
    console.log('\n➡️  Action: Deploy Safe via onboarding script');
  } else {
    const deployed = await isSafeDeployed(user.safeAddress);

    if (deployed) {
      console.log('✅ Safe is deployed on-chain');
      console.log(`   Address: ${user.safeAddress}`);

      const safeInfo = await getSafeInfo(user.safeAddress);
      console.log(`   Owners: ${safeInfo.owners.length}`);
      safeInfo.owners.forEach((owner: string, i: number) => {
        console.log(`      ${i + 1}. ${owner}`);
      });
      console.log(`   Threshold: ${safeInfo.threshold}`);
      console.log(`   Guard: ${safeInfo.guard}`);
    } else {
      console.log('❌ Safe not deployed on-chain');
      console.log(`   Address in DB: ${user.safeAddress}`);
      console.log('\n➡️  Action: Deploy Safe via relayer');
    }
  }

  // 5. Check token approvals
  if (user.safeAddress) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('5. TOKEN APPROVALS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const approvals = await checkApprovals(user.safeAddress);

    console.log(`USDC.e → CTF Exchange:        ${approvals.usdcToCTF ? '✅' : '❌'}`);
    console.log(`USDC.e → Neg Risk Exchange:   ${approvals.usdcToNegRisk ? '✅' : '❌'}`);
    console.log(`CT → CTF Exchange:            ${approvals.ctToCTF ? '✅' : '❌'}`);
    console.log(`CT → Neg Risk Exchange:       ${approvals.ctToNegRisk ? '✅' : '❌'}`);

    if (approvals.allApproved) {
      console.log('\n✅ All approvals set');
    } else {
      console.log('\n❌ Missing approvals');
      console.log('\n➡️  Action: Run approveAllTokens()');
    }
  }

  // 6. Check security setup
  if (user.safeAddress) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('6. SECURITY SETUP');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const security = await verifySecuritySetup(user.safeAddress, userEOA);

    console.log(`Withdrawal Module Enabled:  ${security.moduleEnabled ? '✅' : '❌'}`);
    console.log(`User Authorized:            ${security.userAuthorized ? '✅' : '❌'}`);
    console.log(`Trade Guard Set:            ${security.guardSet ? '✅' : '❌'}`);

    if (security.isComplete) {
      console.log('\n✅ Security setup complete');
    } else {
      console.log('\n❌ Security setup incomplete');
      console.log('\n➡️  Action: Run setupCompleteSecurity()');
    }
  }

  // 7. Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const checks = {
    database: !!user,
    operator: user.operatorAddress === expectedOperatorAddress,
    credentials: !!credentials,
    safeDeployed: user.safeAddress && await isSafeDeployed(user.safeAddress),
    approvals: user.safeAddress && (await checkApprovals(user.safeAddress)).allApproved,
    security: user.safeAddress && (await verifySecuritySetup(user.safeAddress, userEOA)).isComplete,
  };

  const allComplete = Object.values(checks).every(Boolean);

  if (allComplete) {
    console.log('🎉 User is fully onboarded and ready to trade!');
  } else {
    console.log('⚠️  User onboarding is incomplete. See details above.');
  }

  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
