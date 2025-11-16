import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import prisma from '@/lib/db/prisma'
import Safe from '@safe-global/protocol-kit'
import { ethers } from 'ethers'

const TRADE_MODULE_ADDRESS = '0xca9842b9c41b7edDDF8C162a35c9BA7097a6649b'
const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { signature, transaction, safeTxHash } = await req.json()

    if (!signature || !transaction) {
      return NextResponse.json({ error: 'Signature and transaction required' }, { status: 400 })
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

    console.log('[ExecuteEnableModule] Initializing Safe SDK...')
    console.log('[ExecuteEnableModule] Safe address:', user.safeAddress)
    console.log('[ExecuteEnableModule] User wallet:', user.walletAddress)
    console.log('[ExecuteEnableModule] Signature:', signature)

    // Initialize Safe Protocol Kit with the operator's wallet (to pay gas)
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const operatorWallet = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY!, provider)

    const protocolKit = await Safe.init({
      provider: RPC_URL,
      signer: operatorWallet.privateKey,
      safeAddress: user.safeAddress,
    })

    console.log('[ExecuteEnableModule] Reconstructing Safe transaction from data...')

    // Reconstruct the exact same Safe transaction using the data we sent
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [{
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        operation: transaction.operation,
      }],
      options: {
        nonce: transaction.nonce,
        safeTxGas: transaction.safeTxGas,
        baseGas: transaction.baseGas,
        gasPrice: transaction.gasPrice,
        gasToken: transaction.gasToken,
        refundReceiver: transaction.refundReceiver,
      }
    })

    // Verify the transaction hash matches what user signed
    const reconstructedHash = await protocolKit.getTransactionHash(safeTransaction)
    console.log('[ExecuteEnableModule] Original hash:', safeTxHash)
    console.log('[ExecuteEnableModule] Reconstructed hash:', reconstructedHash)

    if (reconstructedHash !== safeTxHash) {
      throw new Error('Transaction hash mismatch - security check failed')
    }

    // Add the user's signature
    safeTransaction.addSignature({
      signer: user.walletAddress!,
      data: signature,
    })

    console.log('[ExecuteEnableModule] Executing transaction...')

    // Execute the transaction (operator pays gas)
    const executeTxResponse = await protocolKit.executeTransaction(safeTransaction)

    console.log('[ExecuteEnableModule] Execute response:', {
      hash: executeTxResponse.hash,
      transactionResponse: !!executeTxResponse.transactionResponse,
    })

    const receipt = await executeTxResponse.transactionResponse?.wait()

    console.log('[ExecuteEnableModule] Transaction executed!', {
      executeTxHash: executeTxResponse.hash,
      receiptHash: receipt?.hash,
      blockNumber: receipt?.blockNumber?.toString(),
    })

    return NextResponse.json({
      success: true,
      transactionHash: receipt?.hash || executeTxResponse.hash,
      blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : undefined,
    })
  } catch (error: any) {
    console.error('[ExecuteEnableModule] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to execute transaction',
        details: error.message
      },
      { status: 500 }
    )
  }
}
