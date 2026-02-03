import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useIndexer } from './useIndexer';
import depositsJson from '@/data/deposits.json';

interface Commitment {
    leafIndex: number;
    commitment: string;
}

interface DepositsData {
    metadata: {
        totalDeposits: number;
        lastBlockNumber: number;
        generatedAt: string;
    };
    deposits: Array<{
        leafIndex: number;
        commitment: string;
    }>;
}

export interface DataSource {
    tier: 'indexer' | 'json';
    sourceName: string;
    icon: string;
}

const DATA_SOURCES: Record<string, DataSource> = {
    indexer: {
        tier: 'indexer',
        sourceName: 'Indexer',
        icon: '⚡',
    },
    json: {
        tier: 'json',
        sourceName: 'Static JSON',
        icon: '📦',
    },
};

/**
 * Hook simplificado com 2 camadas:
 * 1. Indexer (GraphQL) - rápido e em tempo real
 * 2. JSON estático - atualizado pelo GitHub Actions a cada 1h
 */
export function useIndexerHybrid() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState<DataSource | null>(null);

    const indexer = useIndexer();

    // Deposits estáticos do JSON (atualizado pelo GitHub Actions)
    const staticDeposits = useMemo(() => {
        const data = depositsJson as unknown as DepositsData;
        return data.deposits.map(d => ({
            leafIndex: d.leafIndex,
            commitment: d.commitment,
        }));
    }, []);

    const staticMetadata = useMemo(() => {
        const data = depositsJson as unknown as DepositsData;
        return {
            totalDeposits: data.metadata.totalDeposits,
            lastBlockNumber: Number(data.metadata.lastBlockNumber),
            generatedAt: data.metadata.generatedAt,
        };
    }, []);

    /**
     * Fetch all commitments com fallback automático
     * Tenta: Indexer → JSON estático
     */
    const fetchCommitments = useCallback(async (nextIndex: number): Promise<Commitment[]> => {
        setLoading(true);
        setError(null);

        try {
            // TIER 1: Indexer (GraphQL)
            setDataSource(DATA_SOURCES.indexer);
            toast.loading('Fetching from Indexer...', {
                icon: DATA_SOURCES.indexer.icon,
                id: 'data-source',
            });

            try {
                console.log('[Tier 1] Trying Indexer...');
                const commitments = await indexer.fetchCommitments(nextIndex);

                toast.success(`Loaded ${commitments.length} deposits via Indexer`, {
                    icon: DATA_SOURCES.indexer.icon,
                    id: 'data-source',
                    duration: 2000,
                });

                return commitments;
            } catch (err) {
                console.warn('[Tier 1] Indexer failed, falling back to JSON...', err);

                // TIER 2: JSON estático (atualizado pelo GitHub Actions)
                setDataSource(DATA_SOURCES.json);
                toast.loading('Loading from static JSON...', {
                    icon: DATA_SOURCES.json.icon,
                    id: 'data-source',
                });

                console.log('[Tier 2] Using static JSON');
                console.log(`[Tier 2] JSON has ${staticMetadata.totalDeposits} deposits`);
                console.log(`[Tier 2] Generated at: ${staticMetadata.generatedAt}`);
                console.log(`[Tier 2] Required: ${nextIndex} deposits`);

                // Check if JSON has enough deposits
                if (staticMetadata.totalDeposits < nextIndex) {
                    const errorMsg = `Insufficient deposits in JSON. Have ${staticMetadata.totalDeposits}, need ${nextIndex}. Please wait for next update.`;
                    console.error('[Tier 2] ❌', errorMsg);

                    toast.error(errorMsg, {
                        icon: '❌',
                        id: 'data-source',
                        duration: 5000,
                    });

                    throw new Error(errorMsg);
                }

                toast.success(
                    `Loaded ${staticDeposits.length} deposits from static JSON`,
                    {
                        icon: DATA_SOURCES.json.icon,
                        id: 'data-source',
                        duration: 3000,
                    }
                );

                // Return only deposits up to nextIndex
                return staticDeposits.filter(d => d.leafIndex < nextIndex);
            }
        } finally {
            setLoading(false);
        }
    }, [indexer, staticDeposits, staticMetadata]);

    return {
        loading,
        error,
        dataSource,
        fetchCommitments,
    };
}
