import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { ethers } from 'ethers'
import { verifySecuritySetup } from '@/lib/contracts/safe-security-setup'
import { deriveOperatorWallet } from '@/lib/operators/wallet-derivation'

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

const SAFE_ABI = [
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)',
]

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
]

async function executeWithdrawal(
  safe: ethers.Contract,
  operatorWallet: ethers.Wallet,
  recipient: string,
  amount: number
): Promise<string> {
  const provider = operatorWallet.provider!
  const usdcContract = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, provider)

  // Convert amount to USDC.e units (6 decimals)
  const amountInUnits = ethers.parseUnits(amount.toString(), 6)

  // Encode transfer call
  const transferData = usdcContract.interface.encodeFunctionData('transfer', [
    recipient,
    amountInUnits,
  ])

  // Get nonce
  const nonce = await safe.nonce()

  // Get transaction hash
  const txHash = await safe.getTransactionHash(
    USDC_E_ADDRESS,  // to (USDC.e contract)
    0,               // value (no ETH sent)
    transferData,    // data
    0,               // operation (0 = call)
    0,               // safeTxGas
    0,               // baseGas
    0,               // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    nonce
  )

  // Sign with operator wallet
  const signature = await operatorWallet.signMessage(ethers.getBytes(txHash))
  const sigBytes = ethers.getBytes(signature)
  sigBytes[64] += 4 // eth_sign adjustment for Safe

  // Execute transaction
  const tx = await safe.execTransaction(
    USDC_E_ADDRESS,
    0,
    transferData,
    0,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.hexlify(sigBytes)
  )

  const receipt = await tx.wait()
  return receipt.hash
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, recipient } = body

    // Validate inputs
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    if (!recipient || !ethers.isAddress(recipient)) {
      return NextResponse.json(
        { error: 'Invalid recipient address' },
        { status: 400 }
      )
    }

    // Get user and their Safe address
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        walletAddress: true,
        safeAddress: true,
      },
    })

    if (!user?.safeAddress) {
      return NextResponse.json(
        { error: 'Safe wallet not found' },
        { status: 404 }
      )
    }

    if (!user.walletAddress) {
      return NextResponse.json(
        { error: 'User wallet address not found' },
        { status: 404 }
      )
    }

    // Verify security setup and authorization
    const securitySetup = await verifySecuritySetup(
      user.safeAddress,
      user.walletAddress
    )

    if (!securitySetup.isComplete || !securitySetup.userAuthorized) {
      return NextResponse.json(
        {
          error: 'Wallet not authorized to withdraw',
          details: 'Your wallet has not been authorized in the withdrawal module',
        },
        { status: 403 }
      )
    }

    // Initialize provider
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)

    // Get current Safe USDC.e balance
    const usdcEContract = new ethers.Contract(
      USDC_E_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    )
    const balanceWei = await usdcEContract.balanceOf(user.safeAddress)
    const currentBalance = parseFloat(ethers.formatUnits(balanceWei, 6))

    // Get locked funds from open positions
    const openPositions = await prisma.position.findMany({
      where: {
        userId: user.id,
        status: 'OPEN',
      },
      select: {
        value: true,
      },
    })

    const lockedFunds = openPositions.reduce(
      (total: number, position: { value: number }) => total + position.value,
      0
    )

    const availableToWithdraw = Math.max(0, currentBalance - lockedFunds)

    // Validate amount against available balance
    if (amount > availableToWithdraw) {
      return NextResponse.json(
        {
          error: 'Insufficient available balance',
          details: `You have $${availableToWithdraw.toFixed(2)} available to withdraw`,
          balance: currentBalance,
          lockedFunds,
          availableToWithdraw,
        },
        { status: 400 }
      )
    }

    // Initialize operator wallet and Safe contract
    const operatorWallet = deriveOperatorWallet(user.walletAddress).connect(provider)
    const safe = new ethers.Contract(user.safeAddress, SAFE_ABI, provider)

    // Execute the withdrawal
    console.log(`[Withdrawal] Executing withdrawal of $${amount} to ${recipient}`)
    const transactionHash = await executeWithdrawal(
      safe,
      operatorWallet,
      recipient,
      amount
    )

    console.log(`[Withdrawal] Transaction successful: ${transactionHash}`)

    // Log the withdrawal in the database (optional: create a withdrawals table)
    // For now, we can add a note or create a transaction log entry if needed

    return NextResponse.json({
      success: true,
      transactionHash,
      amount,
      recipient,
      token: {
        symbol: 'USDC.e',
        address: USDC_E_ADDRESS,
      },
      explorer: `https://polygonscan.com/tx/${transactionHash}`,
    })
  } catch (error) {
    console.error('Error executing withdrawal:', error)

    // Provide more specific error messages
    let errorMessage = 'Failed to execute withdrawal'
    let errorDetails = error instanceof Error ? error.message : 'Unknown error'

    if (errorDetails.includes('insufficient funds')) {
      errorMessage = 'Insufficient gas funds'
      errorDetails = 'The operator wallet does not have enough MATIC to pay for gas fees'
    } else if (errorDetails.includes('nonce')) {
      errorMessage = 'Transaction nonce error'
      errorDetails = 'Please try again in a moment'
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    )
  }
}
