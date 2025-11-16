import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import Safe from '@safe-global/protocol-kit'

const TRADE_MODULE_ADDRESS = '0xca9842b9c41b7edDDF8C162a35c9BA7097a6649b'
const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's Safe address
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { safeAddress: true, walletAddress: true },
    })

    if (!user?.safeAddress) {
      return NextResponse.json(
        { error: 'Safe not deployed yet' },
        { status: 400 }
      )
    }

    console.log('[PrepareEnableModule] Initializing Safe SDK...')
    console.log('[PrepareEnableModule] Safe address:', user.safeAddress)
    console.log('[PrepareEnableModule] User wallet:', user.walletAddress)

    // Initialize Safe Protocol Kit
    const protocolKit = await Safe.init({
      provider: RPC_URL,
      safeAddress: user.safeAddress,
    })

    console.log('[PrepareEnableModule] Creating enable module transaction...')

    // Create the transaction to enable the module
    const safeTransaction = await protocolKit.createEnableModuleTx(TRADE_MODULE_ADDRESS)

    console.log('[PrepareEnableModule] Transaction created:', {
      to: safeTransaction.data.to,
      data: safeTransaction.data.data,
      value: safeTransaction.data.value,
    })

    // Get the transaction hash that needs to be signed
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction)

    console.log('[PrepareEnableModule] Safe transaction hash:', safeTxHash)

    // Get EIP-712 typed data for signing
    const safeVersion = await protocolKit.getContractVersion()
    const chainId = await protocolKit.getChainId()

    // Safe EIP-712 domain
    const domain = {
      chainId: Number(chainId),
      verifyingContract: user.safeAddress as `0x${string}`,
    }

    // Safe transaction types
    const types = {
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    }

    // Safe transaction message (keep as strings for JSON serialization)
    const message = {
      to: safeTransaction.data.to,
      value: safeTransaction.data.value,
      data: safeTransaction.data.data,
      operation: safeTransaction.data.operation,
      safeTxGas: safeTransaction.data.safeTxGas,
      baseGas: safeTransaction.data.baseGas,
      gasPrice: safeTransaction.data.gasPrice,
      gasToken: safeTransaction.data.gasToken,
      refundReceiver: safeTransaction.data.refundReceiver,
      nonce: safeTransaction.data.nonce,
    }

    return NextResponse.json({
      success: true,
      safeAddress: user.safeAddress,
      moduleAddress: TRADE_MODULE_ADDRESS,
      transaction: {
        to: safeTransaction.data.to,
        value: safeTransaction.data.value,
        data: safeTransaction.data.data,
        operation: safeTransaction.data.operation,
        safeTxGas: safeTransaction.data.safeTxGas,
        baseGas: safeTransaction.data.baseGas,
        gasPrice: safeTransaction.data.gasPrice,
        gasToken: safeTransaction.data.gasToken,
        refundReceiver: safeTransaction.data.refundReceiver,
        nonce: safeTransaction.data.nonce,
      },
      safeTxHash,
      eip712: {
        domain,
        types,
        message,
      },
    })
  } catch (error: any) {
    console.error('[PrepareEnableModule] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to prepare transaction',
        details: error.message
      },
      { status: 500 }
    )
  }
}
