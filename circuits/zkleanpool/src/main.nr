// =============================================
// zkLean Keccak Merkle Membership Proof (Noir)
// =============================================
use dep::keccak256::keccak256;

global TREE_DEPTH: u32 = 20;

// -----------------------------------------
// Hash two 32-byte arrays into one 32-byte array
// -----------------------------------------
fn hash_pair_bytes(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
    let mut input: [u8; 64] = [0u8; 64];
    for i in 0..32 {
        input[i] = left[i];
        input[i + 32] = right[i];
    }
    keccak256::<64>(input, 32)
}

// -----------------------------------------
// Hash a single 32-byte array
// -----------------------------------------
fn hash_single_bytes(x: [u8; 32]) -> [u8; 32] {
    keccak256::<32>(x, 32)
}

// -----------------------------------------
// Convert a 32-byte array to Field (only for public equality checks)
// -----------------------------------------
fn bytes_to_field(bytes: [u8; 32]) -> Field {
    let mut acc: Field = 0;
    for i in 0..32 {
        acc = acc * 256 + bytes[i] as Field;
    }
    acc
}

// -----------------------------------------
// Main circuit
// -----------------------------------------
fn main(
    // Public inputs (as 32-byte arrays)
    root: pub [u8; 32],
    nullifier_hash: pub [u8; 32],

    // Private inputs (32-byte arrays)
    secret: [u8; 32],
    nullifier: [u8; 32],
    path_elements: [[u8; 32]; TREE_DEPTH],
    path_indices: [bool; TREE_DEPTH],
) {
    // -----------------------------------------
    // 1. Compute commitment = keccak256(secret || nullifier)
    // -----------------------------------------
    let commitment = hash_pair_bytes(secret, nullifier);

    // -----------------------------------------
    // 2. Recompute Merkle root
    // -----------------------------------------
    let mut computed = commitment;
    for i in 0..TREE_DEPTH {
        if path_indices[i] {
            computed = hash_pair_bytes(path_elements[i], computed);
        } else {
            computed = hash_pair_bytes(computed, path_elements[i]);
        }
    }

    // -----------------------------------------
    // 3. Check root equality
    // -----------------------------------------
    assert(bytes_to_field(computed) == bytes_to_field(root));

    // -----------------------------------------
    // 4. Compute nullifier hash and check
    // -----------------------------------------
    let computed_nullifier_hash = hash_single_bytes(nullifier);
    assert(bytes_to_field(computed_nullifier_hash) == bytes_to_field(nullifier_hash));
}
