import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import { ethers } from 'ethers'

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // Bridged USDC.e
const USDC_NATIVE_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Native USDC

const USDC_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
]

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { safeAddress: true },
    })

    if (!user?.safeAddress) {
      return NextResponse.json({ error: 'Safe not deployed' }, { status: 400 })
    }

    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)

    // Check USDC.e balance
    const usdcEContract = new ethers.Contract(USDC_E_ADDRESS, USDC_ABI, provider)
    const usdcEBalance = await usdcEContract.balanceOf(user.safeAddress)
    const usdcEBalanceFormatted = Number(ethers.formatUnits(usdcEBalance, 6))

    // Check native USDC balance
    const usdcNativeContract = new ethers.Contract(USDC_NATIVE_ADDRESS, USDC_ABI, provider)
    const usdcNativeBalance = await usdcNativeContract.balanceOf(user.safeAddress)
    const usdcNativeBalanceFormatted = Number(ethers.formatUnits(usdcNativeBalance, 6))

    // Check POL balance
    const polBalance = await provider.getBalance(user.safeAddress)
    const polBalanceFormatted = Number(ethers.formatEther(polBalance))

    console.log('[CheckBalances] Safe:', user.safeAddress)
    console.log('[CheckBalances] USDC.e:', usdcEBalanceFormatted)
    console.log('[CheckBalances] Native USDC:', usdcNativeBalanceFormatted)
    console.log('[CheckBalances] POL:', polBalanceFormatted)

    return NextResponse.json({
      safeAddress: user.safeAddress,
      balances: {
        usdcE: {
          address: USDC_E_ADDRESS,
          balance: usdcEBalanceFormatted,
          symbol: 'USDC.e',
          name: 'Bridged USDC',
        },
        usdcNative: {
          address: USDC_NATIVE_ADDRESS,
          balance: usdcNativeBalanceFormatted,
          symbol: 'USDC',
          name: 'Native USDC',
        },
        pol: {
          balance: polBalanceFormatted,
          symbol: 'POL',
        },
      },
      totalUSDC: usdcEBalanceFormatted + usdcNativeBalanceFormatted,
    })
  } catch (error: any) {
    console.error('[CheckBalances] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check balances', details: error.message },
      { status: 500 }
    )
  }
}
