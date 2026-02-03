/**
 * Script para exportar deposits do Ponder para JSON
 * Uso: node indexer/scripts/export-deposits.js
 *
 * Requisitos:
 * - Ponder rodando em http://localhost:42069
 */

const PONDER_GRAPHQL_URL = process.env.PONDER_GRAPHQL_URL || 'http://localhost:42069/graphql';
const OUTPUT_FILE = process.env.OUTPUT_FILE || './src/data/deposits.json';

const query = `
  query GetAllDeposits {
    depositEvents(
      orderBy: "leafIndex"
      orderDirection: "asc"
      limit: 1000
    ) {
      items {
        leafIndex
        commitment
        transactionHash
        blockNumber
      }
    }
  }
`;

async function exportDeposits() {
  console.log('🔄 Fetching deposits from Ponder...');
  console.log(`📡 URL: ${PONDER_GRAPHQL_URL}`);

  try {
    const response = await fetch(PONDER_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error('❌ GraphQL Errors:');
      result.errors.forEach((err, i) => {
        console.error(`  ${i + 1}. ${err.message}`);
      });
      process.exit(1);
    }

    const deposits = result.data.depositEvents.items;

    if (deposits.length === 0) {
      console.warn('⚠️ No deposits found!');
      process.exit(0);
    }

    console.log(`✅ Found ${deposits.length} deposits`);

    // Converte para formato do front
    const output = {
      metadata: {
        totalDeposits: deposits.length,
        lastBlockNumber: deposits[deposits.length - 1].blockNumber,
        generatedAt: new Date().toISOString(),
      },
      deposits: deposits.map((d) => ({
        leafIndex: d.leafIndex,
        commitment: d.commitment,
        blockNumber: d.blockNumber,
      })),
    };

    // Salva JSON
    const fs = await import('fs');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

    console.log('\n✅ Done!');
    console.log(`📊 Total deposits: ${output.metadata.totalDeposits}`);
    console.log(`📦 Last block: ${output.metadata.lastBlockNumber}`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    console.log(`\n📅 Generated at: ${output.metadata.generatedAt}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Tip: Make sure Ponder is running!');
      console.error('   Run: cd indexer && npm run dev');
    }

    process.exit(1);
  }
}

exportDeposits();
