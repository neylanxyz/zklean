# Exportar Deposits do Ponder para JSON

Script para exportar dados do indexer Ponder para um arquivo JSON estático no front.

## 🎯 Por que usar?

- ✅ **Indexer opcional**: Funciona sem infra 24/7
- ✅ **Carregamento instantâneo**: JSON carrega em < 1ms
- ✅ **RPC mínimo**: Busca só deposits novos via RPC
- ✅ **Custo zero**: Sem servidor rodando

## 📋 Pré-requisitos

- Ponder rodando localmente (default: `http://localhost:42069`)

## 🚀 Como usar

### 1. Inicie o Ponder

```bash
cd indexer
npm run dev
```

O Ponder estará disponível em `http://localhost:42069/graphql`

### 2. Exporte os deposits

```bash
# No diretório root do front-vite
npm run export:deposits
```

### 3. Resultado

O arquivo será salvo em `src/data/deposits.json`:

```json
{
  "metadata": {
    "totalDeposits": 60,
    "lastBlockNumber": 33490000,
    "generatedAt": "2025-01-31T12:00:00.000Z"
  },
  "deposits": [
    {
      "leafIndex": 0,
      "commitment": "0x123...",
      "blockNumber": 33349715
    },
    ...
  ]
}
```

## 🔄 Fluxo de Atualização

```
┌─────────────────┐
│  Novo deposit   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ nextIndex = 61  │  (contrato tem mais que JSON)
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Front detecta         │
│  (nextIndex > JSON)    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Busca RPC do          │
│  lastBlockNumber       │
│  → latest              │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  JSON + RPC combinados │
└─────────────────────────┘
```

## ⚙️ Configuração

### URL customizada do Ponder

```bash
PONDER_GRAPHQL_URL="http://localhost:42069/graphql" npm run export:deposits
```

### Arquivo de saída customizado

```bash
OUTPUT_FILE="./my-custom-path.json" npm run export:deposits
```

## 🐛 Troubleshooting

### ECONNREFUSED

```
❌ Error: connect ECONNREFUSED

💡 Tip: Make sure Ponder is running!
   Run: cd indexer && npm run dev
```

**Solução**: Inicie o Ponder com `npm run dev` no diretório do indexer.

### No deposits found

```
⚠️ No deposits found!
```

**Solução**: Verifique se o `startBlock` no `ponder.config.ts` está correto e se já houve deposits no contrato.

## 📊 Quando atualizar?

Atualize o JSON quando:
- ✅ Fizer muitos novos deposits
- ✅ Quiser reduzir chamadas RPC
- ✅ Quiser deployment mais rápido

**Frequência sugerida**: Semanal ou após cada 10+ novos deposits.
