/**
 * Approve USDC.e to Neg Risk Adapter
 *
 * CRITICAL: This is required for neg risk markets (multi-outcome markets)
 *
 * Usage:
 *   npx tsx scripts/approve-neg-risk-adapter.ts <USER_EOA>
 */

import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { deriveOperatorWallet } from '../lib/operators/wallet-derivation.js';
import { approveUSDCToNegRiskAdapter } from '../lib/contracts/token-approvals.js';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const userEOA = process.argv[2];

  if (!userEOA) {
    console.error('Usage: npx tsx scripts/approve-neg-risk-adapter.ts <USER_EOA>');
    process.exit(1);


  }

  console.log('🔧 Approving USDC.e to Neg Risk Adapter\n');
  console.log(`User EOA: ${userEOA}\n`);

  const user = await prisma.user.findUnique({
    where: { walletAddress: ethers.getAddress(userEOA) },
    select: {
      id: true,
      safeAddress: true,
      walletAddress: true,
    },
  });

  if (!user?.safeAddress) {
    console.error('❌ User or Safe not found');
    process.exit(1);
  }

  console.log(`Safe: ${user.safeAddress}`);

  const operator = deriveOperatorWallet(user.walletAddress);
  console.log(`Operator: ${operator.address}\n`);

  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);
  const connectedOperator = operator.connect(provider);

  console.log('Approving USDC.e to Neg Risk Adapter...');
  console.log('Address: 0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296\n');

  try {
    const txHash = await approveUSDCToNegRiskAdapter(user.safeAddress, connectedOperator);

    if (txHash === 'already-approved') {
      console.log('✅ Already approved!');
    } else {
      console.log(`✅ Approved! Transaction: ${txHash}`);
      console.log(`View on PolygonScan: https://polygonscan.com/tx/${txHash}`);
    }

    console.log('\n🎉 Done! You can now trade on neg risk markets.\n');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
