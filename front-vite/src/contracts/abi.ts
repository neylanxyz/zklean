/**
 * ABI para eventos do Swirl Private Pool
 * Endereço: 0xDAfA37E8DA60c00F689e70fefcD06EdC1C4dACbe
 * Chain: mantleSepolia (5003)
 * StartBlock: 33349712
 */

export const SWIRL_PRIVATE_POOL_ABI = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "commitment",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "uint32",
                "name": "leafIndex",
                "type": "uint32"
            }
        ],
        "name": "Deposit",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "recipient",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "nullifierHash",
                "type": "bytes32"
            }
        ],
        "name": "Withdrawal",
        "type": "event"
    }
] as const;

export const SWIRL_CONTRACT_ADDRESS = '0xDAfA37E8DA60c00F689e70fefcD06EdC1C4dACbe' as `0x${string}`;
export const SWIRL_START_BLOCK = 33349712n;
