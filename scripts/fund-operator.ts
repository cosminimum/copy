/**
 * Fund Operator Wallet
 *
 * Sends POL to operator wallet for gas fees
 *
 * Usage:
 *   npx ts-node scripts/fund-operator.ts <OPERATOR_ADDRESS> [AMOUNT_POL]
 *
 * Example:
 *   npx ts-node scripts/fund-operator.ts 0x21c8414... 1
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node scripts/fund-operator.ts <OPERATOR_ADDRESS> [AMOUNT_POL]');
    console.log('\nExample:');
    console.log('  npx ts-node scripts/fund-operator.ts 0x21c8414EFF1f8c9B2F22f4fDA4321e715f9c8b76 1');
    console.log('\nDefault amount: 1 POL');
    process.exit(1);
  }

  const operatorAddress = args[0];
  const amount = args[1] || '1';

  console.log('💰 Funding Operator Wallet\n');
  console.log(`Operator: ${operatorAddress}`);
  console.log(`Amount: ${amount} POL\n`);

  // Get treasury wallet (platform pays for operator gas)
  const treasuryKey =
    process.env.TREASURY_PRIVATE_KEY ||
    process.env.OPERATOR_PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY;

  if (!treasuryKey) {
    console.error('❌ No treasury wallet configured');
    console.error('Set one of: TREASURY_PRIVATE_KEY, OPERATOR_PRIVATE_KEY, or DEPLOYER_PRIVATE_KEY');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);
  const treasury = new ethers.Wallet(treasuryKey, provider);

  console.log(`Treasury: ${treasury.address}`);

  // Check treasury balance
  const treasuryBalance = await provider.getBalance(treasury.address);
  console.log(`Treasury Balance: ${ethers.formatEther(treasuryBalance)} POL\n`);

  const amountWei = ethers.parseEther(amount);

  if (treasuryBalance < amountWei) {
    console.error(`❌ Insufficient treasury balance`);
    console.error(`Has: ${ethers.formatEther(treasuryBalance)} POL`);
    console.error(`Needs: ${amount} POL`);
    process.exit(1);
  }

  // Check current operator balance
  const operatorBalance = await provider.getBalance(operatorAddress);
  console.log(`Current Operator Balance: ${ethers.formatEther(operatorBalance)} POL`);

  if (operatorBalance >= ethers.parseEther('0.1')) {
    console.log('✅ Operator already has sufficient balance');
    console.log('No funding needed. Exiting.');
    process.exit(0);
  }

  // Send POL to operator
  console.log(`\nSending ${amount} POL to operator...`);

  const tx = await treasury.sendTransaction({
    to: operatorAddress,
    value: amountWei,
  });

  console.log(`Transaction sent: ${tx.hash}`);
  console.log('Waiting for confirmation...');

  const receipt = await tx.wait();

  console.log(`\n✅ Operator funded successfully!`);
  console.log(`Transaction: ${receipt?.hash}`);
  console.log(`Block: ${receipt?.blockNumber}`);

  // Check new balance
  const newBalance = await provider.getBalance(operatorAddress);
  console.log(`New Balance: ${ethers.formatEther(newBalance)} POL`);

  console.log('\n🎉 Operator is ready to execute transactions!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
