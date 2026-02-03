/**
 * Production Deposit Data Refresh Script
 *
 * This script fetches deposit data directly from the blockchain via RPC
 * and generates an updated deposits.json file for production deployment.
 *
 * Usage:
 *   node indexer/scripts/refresh-deposits.js
 *
 * Environment variables:
 *   VITE_PUBLIC_RPC_URL - RPC endpoint (required)
 *   OUTPUT_FILE         - Output file path (default: ./src/data/deposits.json)
 *   START_BLOCK         - Contract deployment block (default: 33349712)
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const SWIRL_CONTRACT_ADDRESS = '0xDAfA37E8DA60c00F689e70fefcD06EdC1C4dACbe';
const START_BLOCK = BigInt(process.env.START_BLOCK || 33349712);
const OUTPUT_FILE = process.env.OUTPUT_FILE || './src/data/deposits.json';
const BLOCK_RANGE = 10000n;

// Deposit event ABI
const DEPOSIT_EVENT = {
    type: 'event',
    name: 'Deposit',
    inputs: [
        { type: 'uint256', name: 'leafIndex', indexed: true },
        { type: 'bytes32', name: 'commitment', indexed: true },
    ],
};

async function refreshDeposits() {
    console.log('🔄 Starting deposit data refresh...\n');

    const rpcUrl = process.env.VITE_PUBLIC_RPC_URL;
    if (!rpcUrl) {
        console.error('❌ VITE_PUBLIC_RPC_URL environment variable is required');
        console.error('   Example: VITE_PUBLIC_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY node indexer/scripts/refresh-deposits.js');
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
        console.log(`📊 Range: ${START_BLOCK} → ${currentBlock}`);
        console.log(`📈 Total blocks: ${Number(currentBlock - START_BLOCK).toLocaleString()}\n`);

        const totalBlocks = currentBlock - START_BLOCK;
        const totalPages = Math.ceil(Number(totalBlocks) / Number(BLOCK_RANGE));

        console.log(`📄 Pages to fetch: ${totalPages}`);
        console.log(`⏱️  Estimated time: ~${Math.ceil(totalPages * 0.5)}s\n`);

        let allDeposits = [];
        let startTime = Date.now();

        for (let page = 0; page < totalPages; page++) {
            const pageFrom = START_BLOCK + (BigInt(page) * BLOCK_RANGE);
            let pageTo = pageFrom + BLOCK_RANGE - 1n;

            if (page === totalPages - 1) {
                pageTo = currentBlock;
            }

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
                allDeposits.push({
                    leafIndex: Number(log.args.leafIndex),
                    commitment: log.args.commitment,
                    blockNumber: Number(log.blockNumber),
                });
            }

            // Small delay to avoid rate limiting
            if (page < totalPages - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\r[100%] Completed in ${elapsed}s`);

        // Sort by leafIndex
        allDeposits.sort((a, b) => a.leafIndex - b.leafIndex);

        // Validate sequence
        for (let i = 0; i < allDeposits.length; i++) {
            if (allDeposits[i].leafIndex !== i) {
                console.error(`\n❌ Invalid sequence at index ${i}: expected ${i}, got ${allDeposits[i].leafIndex}`);
                process.exit(1);
            }
        }

        // Create output
        const output = {
            metadata: {
                totalDeposits: allDeposits.length,
                lastBlockNumber: allDeposits[allDeposits.length - 1]?.blockNumber || Number(START_BLOCK),
                generatedAt: new Date().toISOString(),
                source: 'rpc',
            },
            deposits: allDeposits,
        };

        // Write to file
        const fs = await import('fs');
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

        console.log('\n✅ Done!\n');
        console.log(`📊 Total deposits: ${output.metadata.totalDeposits}`);
        console.log(`📦 Last block: ${output.metadata.lastBlockNumber}`);
        console.log(`💾 Saved to: ${OUTPUT_FILE}`);
        console.log(`📅 Generated at: ${output.metadata.generatedAt}\n`);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);

        if (error.message.includes('rate limit')) {
            console.error('\n💡 Tip: RPC rate limit exceeded. Try again later or use a different RPC endpoint.');
        }

        process.exit(1);
    }
}

refreshDeposits();
