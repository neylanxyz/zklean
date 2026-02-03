/**
 * Production Deposit Data Refresh Script (INCREMENTAL - Rate Limited)
 *
 * Fetches new deposits respecting Alchemy Free Tier limits:
 * - 25 requests/second
 * - 10 blocks per request
 * - Max: 250 blocks per execution
 *
 * Usage:
 *   node indexer/scripts/refresh-deposits.js
 *
 * Environment variables:
 *   RPC_URL - RPC endpoint (required)
 *   OUTPUT_FILE         - Output file path (default: ./src/data/deposits.json)
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Load .env file
config();

const SWIRL_CONTRACT_ADDRESS = '0xDAfA37E8DA60c00F689e70fefcD06EdC1C4dACbe';
const OUTPUT_FILE = process.env.OUTPUT_FILE || './src/data/deposits.json';

// Alchemy Free Tier limits
const BLOCKS_PER_REQUEST = 10;
const MAX_REQUESTS_PER_SECOND = 25;
const MAX_BLOCKS_PER_EXECUTION = BLOCKS_PER_REQUEST * MAX_REQUESTS_PER_SECOND; // 250 blocks

// Deposit event ABI
const DEPOSIT_EVENT = {
    type: 'event',
    name: 'Deposit',
    inputs: [
        { type: 'uint256', name: 'leafIndex', indexed: true },
        { type: 'bytes32', name: 'commitment', indexed: true },
    ],
};

/**
 * Load existing deposits from file
 */
function loadExistingDeposits() {
    if (!existsSync(OUTPUT_FILE)) {
        return { deposits: [], lastBlockNumber: 0n, lastLeafIndex: -1 };
    }

    try {
        const content = readFileSync(OUTPUT_FILE, 'utf-8');
        const data = JSON.parse(content);

        if (!data.deposits || data.deposits.length === 0) {
            return { deposits: [], lastBlockNumber: 0n, lastLeafIndex: -1 };
        }

        const lastDeposit = data.deposits[data.deposits.length - 1];
        const lastBlockNumber = BigInt(lastDeposit.blockNumber || data.metadata.lastBlockNumber);
        const lastLeafIndex = data.deposits.length - 1;

        console.log(`📦 Found ${data.deposits.length} existing deposits`);
        console.log(`📊 Last block: ${lastBlockNumber}`);
        console.log(`📊 Last leafIndex: ${lastLeafIndex}`);

        return {
            deposits: data.deposits,
            lastBlockNumber,
            lastLeafIndex,
        };
    } catch (error) {
        console.warn(`⚠️  Error reading existing file: ${error.message}`);
        return { deposits: [], lastBlockNumber: 0n, lastLeafIndex: -1 };
    }
}

async function refreshDeposits() {
    console.log('🔄 Starting INCREMENTAL deposit data refresh...\n');

    // Accept both RPC_URL and VITE_PUBLIC_RPC_URL
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
        console.error('❌ RPC_URL environment variable is required');
        console.error('   Set in .env: RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY');
        process.exit(1);
    }

    // Create public client
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        // Get current block number
        const currentBlock = await client.getBlockNumber();
        console.log(`📦 Current block: ${currentBlock}`);

        // Load existing deposits
        const { deposits: existingDeposits, lastBlockNumber, lastLeafIndex } = loadExistingDeposits();

        // Calculate blocks to fetch
        const fromBlock = lastBlockNumber + 1n;
        const totalBlocksToFetch = currentBlock - fromBlock;

        console.log(`\n📊 Blocks to fetch: ${Number(totalBlocksToFetch).toLocaleString()}`);
        console.log(`⚡ Max blocks per execution: ${MAX_BLOCKS_PER_EXECUTION} (Alchemy Free limit)`);
        console.log(`⏱️  Rate limit: ${MAX_REQUESTS_PER_SECOND} requests/second × ${BLOCKS_PER_REQUEST} blocks = ${MAX_BLOCKS_PER_EXECUTION} blocks/second\n`);

        // If already up to date
        if (totalBlocksToFetch <= 0) {
            console.log('✅ Already up to date! No new blocks to fetch.\n');
            return;
        }

        // Calculate how many blocks we can fetch THIS TIME
        let blocksToFetchNow = totalBlocksToFetch;
        let remainingBlocks = 0n;
        let warningMessage = '';

        if (totalBlocksToFetch > BigInt(MAX_BLOCKS_PER_EXECUTION)) {
            blocksToFetchNow = BigInt(MAX_BLOCKS_PER_EXECUTION);
            remainingBlocks = totalBlocksToFetch - blocksToFetchNow;
            warningMessage = `\n⚠️  WARNING: Cannot fetch all blocks in one execution!\n` +
                           `   Will fetch: ${Number(blocksToFetchNow)} blocks now\n` +
                           `   Remaining: ${Number(remainingBlocks)} blocks (next cron in ~7 min)\n`;
        }

        const toBlock = fromBlock + blocksToFetchNow - 1n;
        const totalPages = Math.ceil(Number(blocksToFetchNow) / BLOCKS_PER_REQUEST);

        console.log(`📄 Pages to fetch: ${totalPages}`);
        console.log(`📊 Range: ${fromBlock} → ${toBlock} (${Number(blocksToFetchNow)} blocks)`);
        console.log(`⏱️  Estimated time: ~${Math.ceil(totalPages * 0.04)}s\n`);

        if (warningMessage) {
            console.log(warningMessage);
        }

        let newDeposits = [];
        let startTime = Date.now();

        // Fetch in chunks of 10 blocks
        for (let page = 0; page < totalPages; page++) {
            const pageFrom = fromBlock + (BigInt(page) * BigInt(BLOCKS_PER_REQUEST));
            const maxPageTo = pageFrom + BigInt(BLOCKS_PER_REQUEST) - 1n;
            const pageTo = (maxPageTo > toBlock) ? toBlock : maxPageTo;

            const progress = Math.round(((page + 1) / totalPages) * 100);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            process.stdout.write(`\r[${progress}%] Page ${page + 1}/${totalPages} (${elapsed}s)`);

            const logs = await client.getLogs({
                address: SWIRL_CONTRACT_ADDRESS,
                event: DEPOSIT_EVENT,
                fromBlock: pageFrom,
                toBlock: pageTo,
            });

            for (const log of logs) {
                newDeposits.push({
                    leafIndex: Number(log.args.leafIndex),
                    commitment: log.args.commitment,
                    blockNumber: Number(log.blockNumber),
                });
            }

            // Small delay to respect rate limit (40ms between requests = 25 req/sec)
            if (page < totalPages - 1) {
                await new Promise(resolve => setTimeout(resolve, 40));
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\r[100%] Completed in ${elapsed}s`);
        console.log(`🆕 Found ${newDeposits.length} new deposits\n`);

        // If no new deposits
        if (newDeposits.length === 0) {
            console.log('✅ No new deposits in fetched range.\n');
            if (remainingBlocks > 0n) {
                console.log(`ℹ️  Remaining ${Number(remainingBlocks)} blocks will be fetched in next cron.\n`);
            }
            return;
        }

        // Filter only deposits with leafIndex > lastLeafIndex
        const actuallyNewDeposits = newDeposits.filter(d => d.leafIndex > lastLeafIndex);

        if (actuallyNewDeposits.length === 0) {
            console.log('✅ No new deposits (all already indexed).\n');
            if (remainingBlocks > 0n) {
                console.log(`ℹ️  Remaining ${Number(remainingBlocks)} blocks will be fetched in next cron.\n`);
            }
            return;
        }

        console.log(`📊 Adding ${actuallyNewDeposits.length} new deposits:\n`);
        actuallyNewDeposits.forEach(d => {
            console.log(`   - leafIndex ${d.leafIndex} (block ${d.blockNumber})`);
        });
        console.log('');

        // Merge existing + new
        const allDeposits = [...existingDeposits, ...actuallyNewDeposits];

        // Sort by leafIndex
        allDeposits.sort((a, b) => a.leafIndex - b.leafIndex);

        // Validate sequence
        for (let i = 0; i < allDeposits.length; i++) {
            if (allDeposits[i].leafIndex !== i) {
                console.error(`\n❌ Invalid sequence at index ${i}: expected ${i}, got ${allDeposits[i].leafIndex}`);
                console.error('   This should not happen. Check for missing deposits.');
                process.exit(1);
            }
        }

        // Create output
        const output = {
            metadata: {
                totalDeposits: allDeposits.length,
                lastBlockNumber: allDeposits[allDeposits.length - 1]?.blockNumber || Number(toBlock),
                generatedAt: new Date().toISOString(),
                source: 'rpc-incremental-rate-limited',
            },
            deposits: allDeposits,
        };

        // Write to file
        writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

        console.log('✅ Done!\n');
        console.log(`📊 Total deposits: ${output.metadata.totalDeposits}`);
        console.log(`📦 Last block: ${output.metadata.lastBlockNumber}`);
        console.log(`💾 Saved to: ${OUTPUT_FILE}`);
        console.log(`📅 Generated at: ${output.metadata.generatedAt}`);

        if (remainingBlocks > 0n) {
            console.log(`\nℹ️  Note: ${Number(remainingBlocks)} blocks remaining for next cron.`);
        }
        console.log('');

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);

        if (error.message.includes('rate limit')) {
            console.error('\n💡 Tip: RPC rate limit exceeded. Try increasing delay between requests.');
        }

        process.exit(1);
    }
}

refreshDeposits();
