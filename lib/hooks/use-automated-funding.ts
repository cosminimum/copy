/**
 * Hook: Automated Funding Transaction Flow
 *
 * Manages the 4-step funding process with state persistence and recovery
 *
 * Steps:
 * 1. Send POL to operator
 * 2. Wrap POL to WMATIC
 * 3. Approve WMATIC to Uniswap V3 Router
 * 4. Swap WMATIC → USDC.e (recipient: Safe)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi';
import { parseEther, parseUnits, Address } from 'viem';
import { polygon } from 'wagmi/chains';
import {
  buildWmaticDepositTx,
  buildWmaticApproveTx,
  buildUniswapV3SwapTx,
  getWmaticAllowance,
  getUniswapV3Quote,
} from '@/lib/dex/uniswap-v3-utils';
import { FUNDING_CONTRACTS, FUNDING_CONFIG } from '@/lib/constants/funding';
import { ethers } from 'ethers';

export type FundingStep = 1 | 2 | 3 | 4;
export type StepStatus = 'pending' | 'signing' | 'confirming' | 'success' | 'failed';

export interface FundingFlowState {
  sessionId: string | null;
  currentStep: FundingStep | null;
  steps: {
    step1: {
      status: StepStatus;
      txHash?: string;
      error?: string;
    };
    step2: {
      status: StepStatus;
      txHash?: string;
      error?: string;
    };
    step3: {
      status: StepStatus;
      txHash?: string;
      error?: string;
    };
    step4: {
      status: StepStatus;
      txHash?: string;
      error?: string;
    };
  };
}

interface PreparedFunding {
  sessionId: string;
  operatorAddress: string;
  safeAddress: string;
  distribution: {
    totalPol: string;
    operatorPol: string;
    swapPol: string;
  };
  quote: {
    expectedUsdc: string;
    minimumUsdc: string;
  };
}

const STORAGE_KEY = 'automated-funding-state';
const QUOTE_VALIDITY_MS = FUNDING_CONFIG.QUOTE_VALIDITY_MS;

export function useAutomatedFunding() {
  const { address, chain, connector } = useAccount();
  const { data: walletClient } = useWalletClient({ account: address, chainId: chain?.id });
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();

  console.log('[useAutomatedFunding] Debug:', {
    address,
    chain: chain?.id,
    connector: connector?.name,
    walletClient: !!walletClient
  });

  const [state, setState] = useState<FundingFlowState>({
    sessionId: null,
    currentStep: null,
    steps: {
      step1: { status: 'pending' },
      step2: { status: 'pending' },
      step3: { status: 'pending' },
      step4: { status: 'pending' },
    },
  });

  const [preparedData, setPreparedData] = useState<PreparedFunding | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [quoteTimestamp, setQuoteTimestamp] = useState<number>(0);

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.sessionId && address && parsed.userAddress === address.toLowerCase()) {
          setState(parsed.state);
          setPreparedData(parsed.preparedData);
          setQuoteTimestamp(parsed.quoteTimestamp || 0);
        }
      } catch (error) {
        console.error('Failed to load funding state:', error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [address]);

  // Save state to localStorage whenever it changes
  const saveState = useCallback(
    (newState: FundingFlowState, prepared: PreparedFunding | null, timestamp: number) => {
      if (address) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            userAddress: address.toLowerCase(),
            state: newState,
            preparedData: prepared,
            quoteTimestamp: timestamp,
          })
        );
      }
    },
    [address]
  );

  // Update state helper
  const updateStepStatus = useCallback(
    (step: FundingStep, status: StepStatus, txHash?: string, error?: string) => {
      setState((prev) => {
        const newState = {
          ...prev,
          currentStep: status === 'success' ? (step < 4 ? ((step + 1) as FundingStep) : null) : step,
          steps: {
            ...prev.steps,
            [`step${step}`]: {
              status,
              txHash,
              error,
            },
          },
        };
        saveState(newState, preparedData, quoteTimestamp);
        return newState;
      });
    },
    [preparedData, quoteTimestamp, saveState]
  );

  // Prepare funding: call API to get quote and session
  const prepare = useCallback(
    async (polAmount: string): Promise<PreparedFunding> => {
      if (!address) throw new Error('Wallet not connected');

      console.log('[prepare] Calling API with:', { polAmount, userAddress: address });

      const response = await fetch('/api/onboarding/prepare-funding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polAmount, userAddress: address }),
      });

      console.log('[prepare] Response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error('[prepare] API error:', error);
        throw new Error(error.error || error.details || 'Failed to prepare funding');
      }

      const data = await response.json();
      console.log('[prepare] Success:', data);
      const prepared: PreparedFunding = {
        sessionId: data.sessionId,
        operatorAddress: data.operatorAddress,
        safeAddress: data.safeAddress,
        distribution: data.distribution,
        quote: data.quote,
      };

      setPreparedData(prepared);
      const timestamp = Date.now();
      setQuoteTimestamp(timestamp);

      const initialState: FundingFlowState = {
        sessionId: prepared.sessionId,
        currentStep: 1,
        steps: {
          step1: { status: 'pending' },
          step2: { status: 'pending' },
          step3: { status: 'pending' },
          step4: { status: 'pending' },
        },
      };

      setState(initialState);
      saveState(initialState, prepared, timestamp);

      return prepared;
    },
    [address, saveState]
  );

  // Check if quote needs refresh (older than 2 minutes)
  const needsQuoteRefresh = useCallback((): boolean => {
    if (!quoteTimestamp) return false;
    return Date.now() - quoteTimestamp > QUOTE_VALIDITY_MS;
  }, [quoteTimestamp]);

  // Execute Step 1: Send POL to operator
  const executeStep1 = useCallback(async () => {
    try {
      console.log('[executeStep1] START');
      console.log('[executeStep1] walletClient:', walletClient);
      console.log('[executeStep1] preparedData:', preparedData);
      console.log('[executeStep1] current chain:', chain?.id);
      console.log('[executeStep1] polygon.id:', polygon.id);

      // Auto-switch to Polygon if not on it
      if (chain?.id !== polygon.id) {
        console.log('[executeStep1] Need to switch - Switching to Polygon...');
        console.log('[executeStep1] switchChainAsync available:', !!switchChainAsync);

        if (!switchChainAsync) {
          console.error('[executeStep1] switchChainAsync is not available!');
          throw new Error('Chain switching not available');
        }

        console.log('[executeStep1] About to call switchChainAsync...');
        const result = await switchChainAsync({ chainId: polygon.id });
        console.log('[executeStep1] Switch result:', result);
        console.log('[executeStep1] Switched to Polygon successfully');
        // Wait a bit for wallet client to update
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('[executeStep1] Already on Polygon, no switch needed');
      }
    } catch (switchError) {
      console.error('[executeStep1] Switch error caught:', switchError);
      throw new Error(`Failed to switch to Polygon: ${switchError instanceof Error ? switchError.message : 'Unknown error'}`);
    }

    if (!walletClient || !preparedData) {
      throw new Error(`Not prepared: walletClient=${!!walletClient}, preparedData=${!!preparedData}`);
    }

    updateStepStatus(1, 'signing');

    try {
      const hash = await walletClient.sendTransaction({
        to: preparedData.operatorAddress as Address,
        value: parseEther(preparedData.distribution.operatorPol),
      });

      updateStepStatus(1, 'confirming', hash);

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      updateStepStatus(1, 'success', hash);
      return hash;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Transaction failed';
      updateStepStatus(1, 'failed', undefined, errorMsg);
      throw error;
    }
  }, [chain, walletClient, publicClient, preparedData, updateStepStatus, switchChainAsync]);

  // Execute Step 2: Wrap POL to WMATIC
  const executeStep2 = useCallback(async () => {
    if (!walletClient || !preparedData) throw new Error('Not prepared');

    updateStepStatus(2, 'signing');

    try {
      const wrapTx = buildWmaticDepositTx(parseEther(preparedData.distribution.swapPol));

      const hash = await walletClient.sendTransaction({
        to: wrapTx.to as Address,
        data: wrapTx.data as `0x${string}`,
        value: wrapTx.value,
      });

      updateStepStatus(2, 'confirming', hash);

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      updateStepStatus(2, 'success', hash);
      return hash;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Transaction failed';
      updateStepStatus(2, 'failed', undefined, errorMsg);
      throw error;
    }
  }, [walletClient, publicClient, preparedData, updateStepStatus]);

  // Execute Step 3: Approve WMATIC (check allowance first)
  const executeStep3 = useCallback(async () => {
    if (!walletClient || !preparedData || !publicClient || !address) throw new Error('Not prepared');

    try {
      // Check current allowance
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_POLYGON_RPC_URL!);
      const currentAllowance = await getWmaticAllowance(
        address,
        FUNDING_CONTRACTS.UNISWAP_V3_ROUTER,
        provider
      );

      const requiredAmount = parseEther(preparedData.distribution.swapPol);

      // Skip if already approved
      if (currentAllowance >= requiredAmount) {
        updateStepStatus(3, 'success', undefined);
        return 'skipped-already-approved';
      }

      updateStepStatus(3, 'signing');

      // Approve max uint256 for future transactions
      const approveTx = buildWmaticApproveTx(
        FUNDING_CONTRACTS.UNISWAP_V3_ROUTER,
        BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
      );

      const hash = await walletClient.sendTransaction({
        to: approveTx.to as Address,
        data: approveTx.data as `0x${string}`,
        value: approveTx.value,
      });

      updateStepStatus(3, 'confirming', hash);

      await publicClient.waitForTransactionReceipt({ hash });

      updateStepStatus(3, 'success', hash);
      return hash;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Transaction failed';
      updateStepStatus(3, 'failed', undefined, errorMsg);
      throw error;
    }
  }, [walletClient, publicClient, address, preparedData, updateStepStatus]);

  // Execute Step 4: Swap WMATIC → USDC.e
  const executeStep4 = useCallback(async () => {
    if (!walletClient || !preparedData || !publicClient) throw new Error('Not prepared');

    // Check if quote needs refresh
    if (needsQuoteRefresh()) {
      throw new Error('Quote expired. Please refresh quote before swapping.');
    }

    updateStepStatus(4, 'signing');

    try {
      const wmaticAmount = parseEther(preparedData.distribution.swapPol);
      const minimumUsdcOut = parseUnits(preparedData.quote.minimumUsdc, 6);

      const swapTx = buildUniswapV3SwapTx(
        wmaticAmount,
        minimumUsdcOut,
        preparedData.safeAddress,
        10 // 10 minutes deadline
      );

      const hash = await walletClient.sendTransaction({
        to: swapTx.to as Address,
        data: swapTx.data as `0x${string}`,
        value: swapTx.value,
      });

      updateStepStatus(4, 'confirming', hash);

      await publicClient.waitForTransactionReceipt({ hash });

      updateStepStatus(4, 'success', hash);
      return hash;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Transaction failed';
      updateStepStatus(4, 'failed', undefined, errorMsg);
      throw error;
    }
  }, [walletClient, publicClient, preparedData, updateStepStatus, needsQuoteRefresh]);

  // Execute all steps sequentially
  const executeAll = useCallback(async () => {
    if (!preparedData || isExecuting) return;

    setIsExecuting(true);

    try {
      // Execute based on current step
      const currentStep = state.currentStep || 1;

      if (currentStep <= 1 && state.steps.step1.status !== 'success') {
        await executeStep1();
      }

      if (currentStep <= 2 && state.steps.step2.status !== 'success') {
        await executeStep2();
      }

      if (currentStep <= 3 && state.steps.step3.status !== 'success') {
        await executeStep3();
      }

      if (currentStep <= 4 && state.steps.step4.status !== 'success') {
        await executeStep4();
      }
    } catch (error) {
      console.error('Funding flow error:', error);
    } finally {
      setIsExecuting(false);
    }
  }, [preparedData, isExecuting, state, executeStep1, executeStep2, executeStep3, executeStep4]);

  // Reset state
  const reset = useCallback(() => {
    setState({
      sessionId: null,
      currentStep: null,
      steps: {
        step1: { status: 'pending' },
        step2: { status: 'pending' },
        step3: { status: 'pending' },
        step4: { status: 'pending' },
      },
    });
    setPreparedData(null);
    setQuoteTimestamp(0);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    state,
    preparedData,
    prepare,
    executeStep1,
    executeStep2,
    executeStep3,
    executeStep4,
    executeAll,
    reset,
    isExecuting,
    needsQuoteRefresh,
  };
}
