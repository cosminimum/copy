/**
 * Token Approvals for Polymarket Trading
 *
 * Approves USDC.e and Conditional Tokens to Polymarket exchanges
 * via Gnosis Safe transactions signed by operator
 */

import { ethers } from 'ethers';

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

// Polymarket contracts (Polygon Mainnet)
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296'; // CRITICAL!
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const SAFE_ABI = [
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)',
];

const ERC20_ABI = [
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
];

const ERC1155_ABI = [
  'function setApprovalForAll(address,bool)',
  'function isApprovedForAll(address,address) view returns (bool)',
];

/**
 * Execute token approval via Safe
 *
 * @param safe Safe contract instance
 * @param operatorWallet Operator wallet (signer)
 * @param token Token address
 * @param spender Spender address
 * @returns Transaction hash
 */
async function executeApproval(
  safe: ethers.Contract,
  operatorWallet: ethers.Wallet,
  token: string,
  spender: string
): Promise<string> {
  const provider = operatorWallet.provider!;
  const tokenContract = new ethers.Contract(token, ERC20_ABI, provider);

  // Check current allowance
  const currentAllowance = await tokenContract.allowance(safe.target, spender);
  if (currentAllowance >= ethers.parseUnits('1000000', 6)) {
    console.log(`[TokenApprovals] Already approved (${ethers.formatUnits(currentAllowance, 6)} USDC)`);
    return 'already-approved';
  }

  // Encode approve call
  const approveData = tokenContract.interface.encodeFunctionData('approve', [
    spender,
    ethers.MaxUint256,
  ]);

  // Get nonce
  const nonce = await safe.nonce();

  // Get transaction hash
  const txHash = await safe.getTransactionHash(
    token,
    0, // value
    approveData,
    0, // operation (call)
    0, // safeTxGas
    0, // baseGas
    0, // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    nonce
  );

  // Sign
  const signature = await operatorWallet.signMessage(ethers.getBytes(txHash));
  const sigBytes = ethers.getBytes(signature);
  sigBytes[64] += 4; // eth_sign adjustment

  // Execute
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

  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Approve USDC.e to CTF Exchange
 *
 * @param safeAddress Safe address
 * @param operatorWallet Operator wallet
 * @returns Transaction hash
 */
export async function approveUSDCToCTFExchange(
  safeAddress: string,
  operatorWallet: ethers.Wallet
): Promise<string> {
  const provider = operatorWallet.provider || new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider).connect(operatorWallet) as any;

  console.log('[TokenApprovals] Approving USDC.e to CTF Exchange...');
  const txHash = await executeApproval(safe, operatorWallet, USDC_E, CTF_EXCHANGE);
  console.log(`[TokenApprovals] ✅ USDC.e approved to CTF Exchange (${txHash})`);

  return txHash;
}

/**
 * Approve USDC.e to Neg Risk Exchange
 *
 * @param safeAddress Safe address
 * @param operatorWallet Operator wallet
 * @returns Transaction hash
 */
export async function approveUSDCToNegRiskExchange(
  safeAddress: string,
  operatorWallet: ethers.Wallet
): Promise<string> {
  const provider = operatorWallet.provider || new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider).connect(operatorWallet) as any;

  console.log('[TokenApprovals] Approving USDC.e to Neg Risk Exchange...');
  const txHash = await executeApproval(safe, operatorWallet, USDC_E, NEG_RISK_EXCHANGE);
  console.log(`[TokenApprovals] ✅ USDC.e approved to Neg Risk Exchange (${txHash})`);

  return txHash;
}

/**
 * Approve Conditional Tokens to CTF Exchange (ERC1155)
 *
 * @param safeAddress Safe address
 * @param operatorWallet Operator wallet
 * @returns Transaction hash
 */
export async function approveCTToCTFExchange(
  safeAddress: string,
  operatorWallet: ethers.Wallet
): Promise<string> {
  const provider = operatorWallet.provider || new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider).connect(operatorWallet) as any;
  const ctContract = new ethers.Contract(CONDITIONAL_TOKENS, ERC1155_ABI, provider);

  // Check current approval
  const isApproved = await ctContract.isApprovedForAll(safeAddress, CTF_EXCHANGE);
  if (isApproved) {
    console.log(`[TokenApprovals] Conditional Tokens already approved to CTF Exchange`);
    return 'already-approved';
  }

  // Encode setApprovalForAll call
  const approveData = ctContract.interface.encodeFunctionData('setApprovalForAll', [
    CTF_EXCHANGE,
    true,
  ]);

  // Get nonce
  const nonce = await safe.nonce();

  // Get transaction hash
  const txHash = await safe.getTransactionHash(
    CONDITIONAL_TOKENS,
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

  // Sign
  const signature = await operatorWallet.signMessage(ethers.getBytes(txHash));
  const sigBytes = ethers.getBytes(signature);
  sigBytes[64] += 4;

  // Execute
  const tx = await safe.execTransaction(
    CONDITIONAL_TOKENS,
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

  const receipt = await tx.wait();
  console.log(`[TokenApprovals] ✅ Conditional Tokens approved to CTF Exchange (${receipt.hash})`);
  return receipt.hash;
}

/**
 * Approve Conditional Tokens to Neg Risk Exchange (ERC1155)
 *
 * @param safeAddress Safe address
 * @param operatorWallet Operator wallet
 * @returns Transaction hash
 */
export async function approveCTToNegRiskExchange(
  safeAddress: string,
  operatorWallet: ethers.Wallet
): Promise<string> {
  const provider = operatorWallet.provider || new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider).connect(operatorWallet) as any;
  const ctContract = new ethers.Contract(CONDITIONAL_TOKENS, ERC1155_ABI, provider);

  // Check current approval
  const isApproved = await ctContract.isApprovedForAll(safeAddress, NEG_RISK_EXCHANGE);
  if (isApproved) {
    console.log(`[TokenApprovals] Conditional Tokens already approved to Neg Risk Exchange`);
    return 'already-approved';
  }

  // Encode setApprovalForAll call
  const approveData = ctContract.interface.encodeFunctionData('setApprovalForAll', [
    NEG_RISK_EXCHANGE,
    true,
  ]);

  // Get nonce
  const nonce = await safe.nonce();

  // Get transaction hash
  const txHash = await safe.getTransactionHash(
    CONDITIONAL_TOKENS,
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

  // Sign
  const signature = await operatorWallet.signMessage(ethers.getBytes(txHash));
  const sigBytes = ethers.getBytes(signature);
  sigBytes[64] += 4;

  // Execute
  const tx = await safe.execTransaction(
    CONDITIONAL_TOKENS,
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

  const receipt = await tx.wait();
  console.log(`[TokenApprovals] ✅ Conditional Tokens approved to Neg Risk Exchange (${receipt.hash})`);
  return receipt.hash;
}

/**
 * Approve USDC.e to Neg Risk Adapter
 *
 * @param safeAddress Safe address
 * @param operatorWallet Operator wallet
 * @returns Transaction hash
 */
export async function approveUSDCToNegRiskAdapter(
  safeAddress: string,
  operatorWallet: ethers.Wallet
): Promise<string> {
  const provider = operatorWallet.provider || new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider).connect(operatorWallet) as any;

  console.log('[TokenApprovals] Approving USDC.e to Neg Risk Adapter...');
  const txHash = await executeApproval(safe, operatorWallet, USDC_E, NEG_RISK_ADAPTER);
  console.log(`[TokenApprovals] ✅ USDC.e approved to Neg Risk Adapter (${txHash})`);

  return txHash;
}

/**
 * Approve all tokens to all exchanges (complete setup)
 *
 * @param safeAddress Safe address
 * @param operatorWallet Operator wallet
 * @returns Result with all transaction hashes
 */
export async function approveAllTokens(
  safeAddress: string,
  operatorWallet: ethers.Wallet
): Promise<{
  success: boolean;
  usdcToCTF: string;
  usdcToNegRisk: string;
  usdcToNegRiskAdapter: string;
  ctToCTF: string;
  ctToNegRisk: string;
  error?: string;
}> {
  try {
    console.log('[TokenApprovals] Starting complete token approval setup...');
    console.log(`[TokenApprovals] Safe: ${safeAddress}`);

    // Approve USDC.e to all three contracts
    const usdcToCTF = await approveUSDCToCTFExchange(safeAddress, operatorWallet);
    const usdcToNegRisk = await approveUSDCToNegRiskExchange(safeAddress, operatorWallet);
    const usdcToNegRiskAdapter = await approveUSDCToNegRiskAdapter(safeAddress, operatorWallet);

    // Approve Conditional Tokens to both exchanges
    const ctToCTF = await approveCTToCTFExchange(safeAddress, operatorWallet);
    const ctToNegRisk = await approveCTToNegRiskExchange(safeAddress, operatorWallet);

    console.log('[TokenApprovals] ✅ All token approvals complete (5 approvals)');

    return {
      success: true,
      usdcToCTF,
      usdcToNegRisk,
      usdcToNegRiskAdapter,
      ctToCTF,
      ctToNegRisk,
    };
  } catch (error: any) {
    console.error('[TokenApprovals] approveAllTokens error:', error);
    return {
      success: false,
      usdcToCTF: '',
      usdcToNegRisk: '',
      usdcToNegRiskAdapter: '',
      ctToCTF: '',
      ctToNegRisk: '',
      error: error.message,
    };
  }
}

/**
 * Check if all approvals are set
 *
 * @param safeAddress Safe address
 * @returns Approval status
 */
export async function checkApprovals(safeAddress: string): Promise<{
  usdcToCTF: boolean;
  usdcToNegRisk: boolean;
  ctToCTF: boolean;
  ctToNegRisk: boolean;
  allApproved: boolean;
}> {
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
  const usdcContract = new ethers.Contract(USDC_E, ERC20_ABI, provider);
  const ctContract = new ethers.Contract(CONDITIONAL_TOKENS, ERC1155_ABI, provider);

  const minApproval = ethers.parseUnits('1000000', 6); // 1M USDC

  // Check USDC (ERC20) approvals and CT (ERC1155) approvals
  const [usdcToCTFAmount, usdcToNegRiskAmount, ctToCTFApproved, ctToNegRiskApproved] = await Promise.all([
    usdcContract.allowance(safeAddress, CTF_EXCHANGE),
    usdcContract.allowance(safeAddress, NEG_RISK_EXCHANGE),
    ctContract.isApprovedForAll(safeAddress, CTF_EXCHANGE),
    ctContract.isApprovedForAll(safeAddress, NEG_RISK_EXCHANGE),
  ]);

  const result = {
    usdcToCTF: usdcToCTFAmount >= minApproval,
    usdcToNegRisk: usdcToNegRiskAmount >= minApproval,
    ctToCTF: ctToCTFApproved,
    ctToNegRisk: ctToNegRiskApproved,
    allApproved: false,
  };

  result.allApproved = result.usdcToCTF && result.usdcToNegRisk && result.ctToCTF && result.ctToNegRisk;

  return result;
}
