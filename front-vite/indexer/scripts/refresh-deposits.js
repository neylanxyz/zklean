/**
 * Production Deposit Data Refresh Script (INCREMENTAL)
 *
 * This script fetches deposit data incrementally from the blockchain via RPC
 * and generates an updated deposits.json file for production deployment.
 *
 * Usage:
 *   node indexer/scripts/refresh-deposits.js
 *
 * Environment variables:
 *   RPC_URL - RPC endpoint (required)
 *   OUTPUT_FILE         - Output file path (default: ./src/data/deposits.json)
 *   START_BLOCK         - Contract deployment block (default: 33349712)
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Load .env file
config();

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

/**
 * Load existing deposits from file
 */
function loadExistingDeposits() {
    if (!existsSync(OUTPUT_FILE)) {
        return { deposits: [], lastBlockNumber: START_BLOCK - 1n };
    }

    try {
        const content = readFileSync(OUTPUT_FILE, 'utf-8');
        const data = JSON.parse(content);

        if (!data.deposits || data.deposits.length === 0) {
            return { deposits: [], lastBlockNumber: START_BLOCK - 1n };
        }

        const lastDeposit = data.deposits[data.deposits.length - 1];
        const lastBlockNumber = BigInt(lastDeposit.blockNumber || data.metadata.lastBlockNumber);

        console.log(`📦 Found ${data.deposits.length} existing deposits`);
        console.log(`📊 Last block: ${lastBlockNumber}`);

        return {
            deposits: data.deposits,
            lastBlockNumber,
        };
    } catch (error) {
        console.warn(`⚠️  Error reading existing file: ${error.message}`);
        return { deposits: [], lastBlockNumber: START_BLOCK - 1n };
    }
}

async function refreshDeposits() {
    console.log('🔄 Starting INCREMENTAL deposit data refresh...\n');

    // Accept both RPC_URL and VITE_PUBLIC_RPC_URL
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
        console.error('❌ RPC_URL environment variable is required');
        console.error('   Set in .env: RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY');
        console.error('   Or pass: RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY pnpm run refresh:deposits');
        process.exit(1);
    }

    // Create public client
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        // Load existing deposits
        const { deposits: existingDeposits, lastBlockNumber } = loadExistingDeposits();

        // Get current block number
        const currentBlock = await client.getBlockNumber();
        const fromBlock = lastBlockNumber + 1n;

        console.log(`\n📦 Current block: ${currentBlock}`);
        console.log(`📊 From block: ${fromBlock} (incremental)`);
        console.log(`📈 Blocks to fetch: ${Number(currentBlock - fromBlock).toLocaleString()}\n`);

        // If already up to date
        if (fromBlock > currentBlock) {
            console.log('✅ Already up to date! No new blocks to fetch.\n');
            return;
        }

        const totalBlocks = currentBlock - fromBlock;

        // If fetching too many blocks, warn user
        if (totalBlocks > 100000n) {
            console.log('⚠️  WARNING: Large block range detected!');
            console.log(`   This might take a while and consume significant RPC quota.\n`);
        }

        const totalPages = Math.ceil(Number(totalBlocks) / Number(BLOCK_RANGE));

        console.log(`📄 Pages to fetch: ${totalPages}`);
        console.log(`⏱️  Estimated time: ~${Math.ceil(totalPages * 0.5)}s\n`);

        let newDeposits = [];
        let startTime = Date.now();

        for (let page = 0; page < totalPages; page++) {
            const pageFrom = fromBlock + (BigInt(page) * BLOCK_RANGE);
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
                newDeposits.push({
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

        // Merge existing + new
        const allDeposits = [...existingDeposits, ...newDeposits];

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
                lastBlockNumber: allDeposits[allDeposits.length - 1]?.blockNumber || Number(fromBlock),
                generatedAt: new Date().toISOString(),
                source: 'rpc-incremental',
            },
            deposits: allDeposits,
        };

        // Write to file
        writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

        console.log('\n✅ Done!\n');
        console.log(`📊 Total deposits: ${output.metadata.totalDeposits}`);
        console.log(`📦 Last block: ${output.metadata.lastBlockNumber}`);
        console.log(`🆕 New deposits: ${newDeposits.length}`);
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
