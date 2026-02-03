import { useState, useCallback } from 'react';
import axios from 'axios';
import { INDEXER } from "@/config/environmentVars"

// Create axios instance with defaults
const indexerApi = axios.create({
    baseURL: INDEXER.API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

interface Commitment {
    leafIndex: number;
    commitment: string;
}

/**
 * Hook para buscar commitments do indexer GraphQL
 */
export function useIndexer() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Busca todos os commitments do índice 0 até maxLeafIndex
     */
    const fetchCommitments = useCallback(async (maxLeafIndex: number): Promise<Commitment[]> => {
        setLoading(true);
        setError(null);

        if (!INDEXER.API_URL) {
            const errorMsg = 'Indexer URL is not defined';
            setError(errorMsg);
            console.error(errorMsg);
            setLoading(false);
            return [];
        }

        try {
            const query = `
                query GetCommitments($maxLeafIndex: Int!, $limit: Int!) {
                    depositEvents(
                        where: { leafIndex_lte: $maxLeafIndex }
                        orderBy: "leafIndex"
                        orderDirection: "asc"
                        limit: $limit
                    ) {
                        items {
                            leafIndex
                            commitment
                        }
                    }
                }
            `;

            const { data } = await indexerApi.post('', {
                query,
                variables: {
                    maxLeafIndex,
                    limit: 1000 // Set high limit to get all deposits
                }
            });

            if (data.errors) {
                console.error('❌ GraphQL Errors:', JSON.stringify(data.errors, null, 2));
                throw new Error(data.errors[0]?.message || 'GraphQL error');
            }

            const commitments = data.data?.depositEvents?.items || [];

            // Log warning if we hit the limit
            if (commitments.length >= 1000) {
                console.warn(`⚠️ Reached limit of 1000 deposits. Requested maxLeafIndex: ${maxLeafIndex}`);
            }

            console.log(`✅ Fetched ${commitments.length} commitments from indexer (0 to ${maxLeafIndex})`);

            return commitments;
        } catch (err) {
            // Axios errors already have status code in err.response.status
            if (axios.isAxiosError(err)) {
                const status = err.response?.status;
                const errorMsg = status
                    ? `HTTP ${status}: ${err.message}`
                    : 'Network error - unable to reach indexer';
                setError(errorMsg);
                console.error('Error fetching commitments:', errorMsg);
                throw err;
            }

            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMsg);
            console.error('Error fetching commitments from indexer:', errorMsg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Busca um commitment específico pelo leafIndex
     */
    const fetchCommitmentByIndex = useCallback(async (leafIndex: number): Promise<Commitment | null> => {
        setLoading(true);
        setError(null);

        if (!INDEXER.API_URL) {
            const errorMsg = 'Indexer URL is not defined';
            setError(errorMsg);
            console.error(errorMsg);
            setLoading(false);
            return null;
        }

        try {
            const query = `
                query GetCommitmentByIndex($leafIndex: Int!) {
                    commitments(where: { leafIndex: $leafIndex }) {
                        leafIndex
                        commitment
                    }
                }
            `;

            const { data } = await indexerApi.post('', {
                query,
                variables: { leafIndex }
            });

            if (data.errors) {
                console.error('❌ GraphQL Errors:', JSON.stringify(data.errors, null, 2));
                throw new Error(data.errors[0]?.message || 'GraphQL error');
            }

            const commitments = data.data?.commitments || [];
            return commitments.length > 0 ? commitments[0] : null;
        } catch (err) {
            // Axios errors already have status code in err.response.status
            if (axios.isAxiosError(err)) {
                const status = err.response?.status;
                const errorMsg = status
                    ? `HTTP ${status}: ${err.message}`
                    : 'Network error - unable to reach indexer';
                setError(errorMsg);
                console.error('Error fetching commitment:', errorMsg);
                throw err;
            }

            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMsg);
            console.error('Error fetching commitment by index:', errorMsg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        error,
        fetchCommitments,
        fetchCommitmentByIndex
    };
}
