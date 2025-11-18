/**
 * SignatureType 2 Order Signer
 *
 * Creates and signs Polymarket orders using SignatureType 2 (POLY_GNOSIS_SAFE).
 *
 * Architecture:
 * - Operator signs the order (has private key)
 * - Safe holds the funds (maker address)
 * - CTF Exchange validates signature and executes trade
 * - No module needed - direct CLOB API interaction
 *
 * Order Structure:
 * - maker: Safe address (funds source)
 * - signer: Operator address (signature authority)
 * - signatureType: 2 (POLY_GNOSIS_SAFE)
 */

import { ethers } from 'ethers';
import { ClobClient, Side, OrderType, ApiKeyCreds } from '@polymarket/clob-client';
import { createV5CompatibleWallet, CLOBCredentials } from './credential-manager';

// OrderArgs type (from CLOB client)
interface OrderArgs {
  tokenID: string;
  price: number;
  size: number;
  side: Side;
  feeRateBps?: number;
}

export interface SignatureType2OrderParams {
  tokenId: string; // Market token ID
  price: number; // Limit price (e.g., 0.55 for 55%)
  size: number; // Number of shares
  side: 'BUY' | 'SELL';
  safeAddress: string; // Safe holding funds
  operatorPrivateKey: string; // Operator signing order
  credentials: CLOBCredentials; // CLOB API credentials
  chainId?: number; // Default: 137 (Polygon)
}

export interface MarketBuyParams {
  tokenId: string;
  usdcAmount: number;
  safeAddress: string;
  operatorPrivateKey: string;
  credentials: CLOBCredentials;
  chainId?: number;
}

export interface MarketSellParams {
  tokenId: string;
  shares: number;
  safeAddress: string;
  operatorPrivateKey: string;
  credentials: CLOBCredentials;
  chainId?: number;
}

export interface OrderResult {
  orderId: string;
  transactionHash: string | null;
  status: 'matched' | 'unmatched';
  outcome: string;
  outcomePrices: string[];
  size: number;
  price: number;
  side: 'BUY' | 'SELL';
  maker: string;
  signer: string;
  fillAmount?: number;
  actualCost?: number;
}

/**
 * Create ClobClient with SignatureType 2 configuration
 *
 * @param operatorPrivateKey Operator private key
 * @param credentials CLOB API credentials
 * @param safeAddress Safe address (funder/maker)
 * @param chainId Chain ID
 * @returns Configured ClobClient
 */
export function createSignatureType2Client(
  operatorPrivateKey: string,
  credentials: CLOBCredentials,
  safeAddress: string,
  chainId: number = 137
): ClobClient {
  // Note: axios is configured globally at app startup
  // See scripts/websocket-listener.ts for axios configuration

  // Create v5-compatible wallet for CLOB client
  const v5Wallet = createV5CompatibleWallet(operatorPrivateKey);

  // Initialize CLOB client with SignatureType 2
  const clobClient = new ClobClient(
    'https://clob.polymarket.com',
    chainId,
    v5Wallet,
    {
      key: credentials.apiKey,
      secret: credentials.apiSecret,
      passphrase: credentials.apiPassphrase,
    } as ApiKeyCreds,
    2, // SignatureType.POLY_GNOSIS_SAFE
    safeAddress // Funder address (Safe)
  );

  return clobClient;
}

/**
 * Create and post a limit order
 *
 * @param params Order parameters
 * @returns Order result with ID and status
 *
 * @example
 * ```ts
 * const result = await createLimitOrder({
 *   tokenId: '27118005...',
 *   price: 0.55,
 *   size: 10,
 *   side: 'BUY',
 *   safeAddress: '0xSafe...',
 *   operatorPrivateKey: '0x...',
 *   credentials: { apiKey: '...', apiSecret: '...', apiPassphrase: '...' },
 * });
 * console.log(result.orderId);
 * ```
 */
export async function createLimitOrder(
  params: SignatureType2OrderParams
): Promise<OrderResult> {
  const {
    tokenId,
    price,
    size,
    side,
    safeAddress,
    operatorPrivateKey,
    credentials,
    chainId = 137,
  } = params;

  // Create CLOB client
  const clobClient = createSignatureType2Client(
    operatorPrivateKey,
    credentials,
    safeAddress,
    chainId
  );

  // Create order
  const orderArgs: OrderArgs = {
    tokenID: tokenId,
    price,
    size,
    side: side === 'BUY' ? Side.BUY : Side.SELL,
    feeRateBps: 0, // Fee rate in basis points
  };

  const signedOrder = await clobClient.createOrder(orderArgs);

  // Post order to CLOB
  let response: any;
  try {
    response = await clobClient.postOrder(signedOrder, OrderType.GTC);
  } catch (error: any) {
    // Handle CLOB API errors
    console.error('[SignatureType2] CLOB postOrder error:', error);

    // Check for common errors
    if (error.response?.data?.error) {
      const errorMsg = error.response.data.error;

      if (errorMsg.includes('not enough balance')) {
        throw new Error(
          'Insufficient balance in CLOB. The CLOB backend may not recognize your Safe\'s balance. ' +
          'This can happen if balance wasn\'t updated after deposit. Try again in a few minutes or run updateBalanceAllowance().'
        );
      }

      throw new Error(`CLOB API error: ${errorMsg}`);
    }

    throw error;
  }

  // Check if response indicates an error (CLOB client may return error response instead of throwing)
  if (response?.status && response.status >= 400) {
    console.error('[SignatureType2] CLOB returned error response:', response);
    throw new Error(`CLOB API error (${response.status}): ${response.data?.error || response.statusText || 'Unknown error'}`);
  }

  if (!response || !response.orderID) {
    console.error('[SignatureType2] Invalid response from CLOB:', response);
    throw new Error('Invalid response from CLOB API - no order ID returned');
  }

  // Parse response
  return {
    orderId: response.orderID,
    transactionHash: response.transactionsHashes?.[0] || null,
    status: response.status as 'matched' | 'unmatched',
    outcome: response.outcome || '',
    outcomePrices: response.outcomePrices || [],
    size: parseFloat(response.originalSize || size.toString()),
    price: parseFloat(response.price || price.toString()),
    side: side,
    maker: safeAddress,
    signer: new ethers.Wallet(operatorPrivateKey).address,
    fillAmount: parseFloat(response.takingAmount || '0'),
    actualCost: parseFloat(response.makingAmount || '0'),
  };
}

/**
 * Execute a market buy order (buy at best available price)
 *
 * @param params Market order parameters
 * @returns Order result
 *
 * @example
 * ```ts
 * const result = await marketBuy({
 *   tokenId: '27118005...',
 *   usdcAmount: 10, // Spend $10 USDC
 *   safeAddress: '0xSafe...',
 *   operatorPrivateKey: '0x...',
 *   credentials: creds,
 * });
 * ```
 */
export async function marketBuy(params: MarketBuyParams): Promise<OrderResult> {
  const {
    tokenId,
    usdcAmount,
    safeAddress,
    operatorPrivateKey,
    credentials,
    chainId = 137,
  } = params;

  // Create CLOB client
  const clobClient = createSignatureType2Client(
    operatorPrivateKey,
    credentials,
    safeAddress,
    chainId
  );

  // Get best ask price from order book
  const orderBook = await clobClient.getOrderBook(tokenId);

  if (!orderBook.asks || orderBook.asks.length === 0) {
    throw new Error('No asks available in order book');
  }

  const bestAsk = parseFloat(orderBook.asks[0].price);

  // Calculate shares to buy (round up to ensure >= $1 minimum)
  let shares = usdcAmount / bestAsk;
  shares = Math.ceil(shares * 100) / 100; // Round up to 2 decimals

  // Ensure order meets $1 minimum
  const orderValue = shares * bestAsk;
  if (orderValue < 1.0) {
    shares = Math.ceil((1.0 / bestAsk) * 100) / 100;
  }

  // Create order at best ask price
  return await createLimitOrder({
    tokenId,
    price: bestAsk,
    size: shares,
    side: 'BUY',
    safeAddress,
    operatorPrivateKey,
    credentials,
    chainId,
  });
}

/**
 * Execute a market sell order (sell at best available price)
 *
 * @param params Market order parameters with shares to sell
 * @returns Order result
 *
 * @example
 * ```ts
 * const result = await marketSell({
 *   tokenId: '27118005...',
 *   shares: 10, // Sell 10 shares
 *   safeAddress: '0xSafe...',
 *   operatorPrivateKey: '0x...',
 *   credentials: creds,
 * });
 * ```
 */
export async function marketSell(params: MarketSellParams): Promise<OrderResult> {
  const {
    tokenId,
    shares,
    safeAddress,
    operatorPrivateKey,
    credentials,
    chainId = 137,
  } = params;

  if (!shares || shares <= 0) {
    throw new Error('Shares must be specified for SELL orders');
  }

  // Create CLOB client
  const clobClient = createSignatureType2Client(
    operatorPrivateKey,
    credentials,
    safeAddress,
    chainId
  );

  // Get best bid price from order book
  const orderBook = await clobClient.getOrderBook(tokenId);

  if (!orderBook.bids || orderBook.bids.length === 0) {
    throw new Error('No bids available in order book');
  }

  const bestBid = parseFloat(orderBook.bids[0].price);

  // Create order at best bid price
  return await createLimitOrder({
    tokenId,
    price: bestBid,
    size: shares,
    side: 'SELL',
    safeAddress,
    operatorPrivateKey,
    credentials,
    chainId,
  });
}

/**
 * Cancel an open order
 *
 * @param orderId Order ID to cancel
 * @param operatorPrivateKey Operator private key
 * @param credentials CLOB API credentials
 * @param safeAddress Safe address
 * @param chainId Chain ID
 * @returns True if canceled successfully
 */
export async function cancelOrder(
  orderId: string,
  operatorPrivateKey: string,
  credentials: CLOBCredentials,
  safeAddress: string,
  chainId: number = 137
): Promise<boolean> {
  const clobClient = createSignatureType2Client(
    operatorPrivateKey,
    credentials,
    safeAddress,
    chainId
  );

  const result = await clobClient.cancelOrder({ orderID: orderId });
  return result.canceled === true;
}

/**
 * Get open orders for a Safe
 *
 * @param operatorPrivateKey Operator private key
 * @param credentials CLOB API credentials
 * @param safeAddress Safe address
 * @param chainId Chain ID
 * @returns Array of open orders
 */
export async function getOpenOrders(
  operatorPrivateKey: string,
  credentials: CLOBCredentials,
  safeAddress: string,
  chainId: number = 137
): Promise<any[]> {
  const clobClient = createSignatureType2Client(
    operatorPrivateKey,
    credentials,
    safeAddress,
    chainId
  );

  return await clobClient.getOpenOrders();
}

/**
 * Update balance allowance in CLOB (refresh after deposits)
 *
 * @param operatorPrivateKey Operator private key
 * @param credentials CLOB API credentials
 * @param safeAddress Safe address
 * @param chainId Chain ID
 */
export async function updateBalanceAllowance(
  operatorPrivateKey: string,
  credentials: CLOBCredentials,
  safeAddress: string,
  chainId: number = 137
): Promise<void> {
  console.log('[UpdateBalance] Creating ClobClient for Safe:', safeAddress);
  console.log('[UpdateBalance] Operator:', new ethers.Wallet(operatorPrivateKey).address);
  console.log('[UpdateBalance] API Key:', credentials.apiKey);

  const clobClient = createSignatureType2Client(
    operatorPrivateKey,
    credentials,
    safeAddress,
    chainId
  );

  console.log('[UpdateBalance] Calling updateBalanceAllowance...');
  const result = await clobClient.updateBalanceAllowance({
    asset_type: 'COLLATERAL' as any,
  });

  console.log('[UpdateBalance] Result:', JSON.stringify(result, null, 2));
}

/**
 * Get USDC balance for Safe in CLOB
 *
 * @param operatorPrivateKey Operator private key
 * @param credentials CLOB API credentials
 * @param safeAddress Safe address
 * @param chainId Chain ID
 * @returns USDC balance (in USDC, not wei)
 */
export async function getCLOBBalance(
  operatorPrivateKey: string,
  credentials: CLOBCredentials,
  safeAddress: string,
  chainId: number = 137
): Promise<number> {
  const clobClient = createSignatureType2Client(
    operatorPrivateKey,
    credentials,
    safeAddress,
    chainId
  );

  console.log('[GetCLOBBalance] Fetching balance for Safe:', safeAddress);

  const balanceInfo = await clobClient.getBalanceAllowance({
    asset_type: 'COLLATERAL' as any,
  });

  console.log('[GetCLOBBalance] Raw response:', JSON.stringify(balanceInfo, null, 2));

  const balance = parseInt(balanceInfo.balance) / 1_000_000; // Convert from 6 decimals
  const allowance = parseInt(balanceInfo.allowance) / 1_000_000;

  console.log('[GetCLOBBalance] Balance:', balance);
  console.log('[GetCLOBBalance] Allowance:', allowance);

  return balance;
}
