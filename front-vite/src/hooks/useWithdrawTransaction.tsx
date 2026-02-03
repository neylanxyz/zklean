import { useState, useCallback } from 'react';
import { useSwirlPool } from './useSwirlPool';
import { useIndexerHybrid } from './useIndexerHybrid';
import { publicClient } from '@/config';
import { compute } from '@/scripts/compute.mjs';
import { generateProof } from '@/helpers/generateProof';

export const WithdrawStep = {
    IDLE: 'IDLE',
    FETCHING_DATA: 'FETCHING_DATA',
    GENERATING_INPUTS: 'GENERATING_INPUTS',
    GENERATING_PROOF: 'GENERATING_PROOF',
    SIMULATING: 'SIMULATING',
    AWAITING_SIGNATURE: 'AWAITING_SIGNATURE',
    SENDING_TRANSACTION: 'SENDING_TRANSACTION',
    CONFIRMING_TRANSACTION: 'CONFIRMING_TRANSACTION',
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
} as const;

export type WithdrawStep = typeof WithdrawStep[keyof typeof WithdrawStep];

const LOADING_STEPS: WithdrawStep[] = [
    WithdrawStep.FETCHING_DATA,
    WithdrawStep.GENERATING_INPUTS,
    WithdrawStep.GENERATING_PROOF,
    WithdrawStep.SIMULATING,
    WithdrawStep.AWAITING_SIGNATURE,
    WithdrawStep.SENDING_TRANSACTION,
    WithdrawStep.CONFIRMING_TRANSACTION,
];

export function useWithdrawTransaction() {
    const [step, setStep] = useState<WithdrawStep>(WithdrawStep.IDLE);
    const [txHash, setTxHash] = useState<string | undefined>();
    const [error, setError] = useState<Error | undefined>();

    const { withdrawAction, address, nextIndex } = useSwirlPool();
    const { fetchCommitments } = useIndexerHybrid();

    const executeWithdraw = useCallback(async (
        encodedInput: string,
        leafIndex: number,
        recipientAddress?: string
    ) => {
        try {
            setStep(WithdrawStep.IDLE);
            setError(undefined);
            setTxHash(undefined);

            if (!address) throw new Error("Wallet not connected");

            // --- STEP 1: Fetch Commitments (Indexer → Hybrid → RPC fallback) ---
            setStep(WithdrawStep.FETCHING_DATA);

            // Calculate total deposits needed from contract's nextIndex
            // If nextIndex = 60, we need deposits 0-59
            const totalDepositsNeeded = nextIndex ? Number(nextIndex) : leafIndex + 1;
            console.log(`[Withdraw] Contract nextIndex: ${nextIndex}, fetching ${totalDepositsNeeded} deposits`);

            const deposits = await fetchCommitments(totalDepositsNeeded);

            if (!deposits || deposits.length === 0) {
                throw new Error('No commitments found. Please try again.');
            }

            // --- STEP 2: Generate Inputs (Off-chain) ---
            setStep(WithdrawStep.GENERATING_INPUTS);

            // Validate commitments are sequential
            for (let i = 0; i < deposits.length; i++) {
                if (deposits[i].leafIndex !== i) {
                    throw new Error(`Commitments out of order! Expected ${i}, got ${deposits[i].leafIndex}`);
                }
            }

            const commitments = deposits.map((d) => d.commitment);

            // Generate proof inputs
            // @ts-ignore
            const inputs = await compute(commitments, encodedInput);

            // --- STEP 3: Generate ZK Proof ---
            setStep(WithdrawStep.GENERATING_PROOF);

            // @ts-ignore
            const proof = await generateProof(inputs);

            // --- STEP 4: Sign & Send Transaction ---
            setStep(WithdrawStep.AWAITING_SIGNATURE);

            const finalRecipient = (recipientAddress || address) as `0x${string}`;

            // @ts-ignore
            const hash = await withdrawAction(
                proof.proof as `0x${string}`,
                // @ts-ignore
                inputs.root_bytes32 as `0x${string}`,
                // @ts-ignore
                inputs.nullifier_hash_bytes32 as `0x${string}`,
                finalRecipient
            );

            setTxHash(hash);
            setStep(WithdrawStep.SENDING_TRANSACTION);

            // --- STEP 5: Confirm Transaction ---
            setStep(WithdrawStep.CONFIRMING_TRANSACTION);

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            if (receipt.status === 'success') {
                setStep(WithdrawStep.SUCCESS);
            } else {
                throw new Error('Transaction reverted');
            }

        } catch (err) {
            console.error(err);
            setStep(WithdrawStep.ERROR);
            setError(err as Error);
            throw err;
        }
    }, [withdrawAction, address, fetchCommitments]);

    const reset = useCallback(() => {
        setStep(WithdrawStep.IDLE);
        setError(undefined);
        setTxHash(undefined);
    }, []);

    return {
        step,
        txHash,
        error,
        executeWithdraw,
        reset,

        // Helpers
        isIdle: step === WithdrawStep.IDLE,
        isFetchingData: step === WithdrawStep.FETCHING_DATA,
        isGeneratingInputs: step === WithdrawStep.GENERATING_INPUTS,
        isGeneratingProof: step === WithdrawStep.GENERATING_PROOF,
        isAwaitingSignature: step === WithdrawStep.AWAITING_SIGNATURE,
        isSending: step === WithdrawStep.SENDING_TRANSACTION,
        isConfirming: step === WithdrawStep.CONFIRMING_TRANSACTION,
        isSuccess: step === WithdrawStep.SUCCESS,
        isError: step === WithdrawStep.ERROR,

        isLoading: LOADING_STEPS.includes(step),
    };
}