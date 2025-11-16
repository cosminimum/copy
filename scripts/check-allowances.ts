import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const SAFE = '0x55b682b220a0b59d41fef166a88ef372885978cd';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const CT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL!);

  console.log('🔍 Checking Allowances for Safe:', SAFE);
  console.log('');

  // Check USDC.e allowances
  const usdcContract = new ethers.Contract(
    USDC_E,
    ['function allowance(address,address) view returns (uint256)'],
    provider
  );

  const [usdcToCTF, usdcToNegRisk] = await Promise.all([
    usdcContract.allowance(SAFE, CTF_EXCHANGE),
    usdcContract.allowance(SAFE, NEG_RISK),
  ]);

  console.log('USDC.e Allowances:');
  console.log('  → CTF Exchange:', ethers.formatUnits(usdcToCTF, 6), 'USDC');
  console.log('  → Neg Risk:', ethers.formatUnits(usdcToNegRisk, 6), 'USDC');
  console.log('');

  // Check CT approvals (ERC1155)
  const ctContract = new ethers.Contract(
    CT,
    ['function isApprovedForAll(address,address) view returns (bool)'],
    provider
  );

  const [ctToCTF, ctToNegRisk] = await Promise.all([
    ctContract.isApprovedForAll(SAFE, CTF_EXCHANGE),
    ctContract.isApprovedForAll(SAFE, NEG_RISK),
  ]);

  console.log('Conditional Tokens Approvals (ERC1155):');
  console.log('  → CTF Exchange:', ctToCTF ? '✅ Approved' : '❌ NOT Approved');
  console.log('  → Neg Risk:', ctToNegRisk ? '✅ Approved' : '❌ NOT Approved');
  console.log('');

  // Summary
  const allSet =
    usdcToCTF > 0n && usdcToNegRisk > 0n && ctToCTF && ctToNegRisk;

  if (allSet) {
    console.log('✅ ALL APPROVALS SET - Ready to trade!');
  } else {
    console.log('❌ MISSING APPROVALS:');
    if (usdcToCTF === 0n) console.log('  - USDC.e → CTF Exchange');
    if (usdcToNegRisk === 0n) console.log('  - USDC.e → Neg Risk Exchange');
    if (!ctToCTF) console.log('  - CT → CTF Exchange');
    if (!ctToNegRisk) console.log('  - CT → Neg Risk Exchange');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
