import { PrismaClient } from '@prisma/client';
import { deriveOperatorWallet } from '../lib/operators/wallet-derivation.js';
import { loadCLOBCredentialsByEOA } from '../lib/polymarket/credential-manager.js';
import { getOpenOrders } from '../lib/polymarket/signature-type2-signer.js';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const userEOA = process.argv[2] || '0xf6f42cfe39B8d815631a31d8B9882a484949E91e';

  console.log('🔍 Checking Open Orders\n');
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

  const credentials = await loadCLOBCredentialsByEOA(userEOA);
  if (!credentials) {
    console.error('❌ CLOB credentials not found');
    process.exit(1);
  }

  const operator = deriveOperatorWallet(userEOA);

  console.log(`Safe: ${user.safeAddress}`);
  console.log(`Operator: ${operator.address}\n`);

  try {
    const openOrders = await getOpenOrders(
      operator.privateKey,
      credentials,
      user.safeAddress,
      137
    );

    console.log(`Open Orders: ${openOrders.length}\n`);

    if (openOrders.length === 0) {
      console.log('✅ No open orders - full balance available for trading');
    } else {
      console.log('⚠️  Found open orders consuming balance:\n');
      openOrders.forEach((order: any, i: number) => {
        console.log(`Order ${i + 1}:`);
        console.log(`  ID: ${order.id}`);
        console.log(`  Side: ${order.side}`);
        console.log(`  Size: ${order.originalSize}`);
        console.log(`  Price: $${order.price}`);
        console.log(`  Value: $${(parseFloat(order.originalSize) * parseFloat(order.price)).toFixed(2)}`);
        console.log('');
      });

      const totalLocked = openOrders.reduce((sum: number, order: any) => {
        return sum + parseFloat(order.originalSize) * parseFloat(order.price);
      }, 0);

      console.log(`Total Balance Locked in Orders: $${totalLocked.toFixed(2)}`);
      console.log('Available Balance: $' + (2.0 - totalLocked).toFixed(2));
    }
  } catch (error: any) {
    console.error('❌ Error fetching open orders:', error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
