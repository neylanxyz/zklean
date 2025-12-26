// circuits/private_pool/src/main.nr
use dep::poseidon::poseidon::bn254;

// Tree depth must match Solidity
global TREE_DEPTH: u32 = 20;

// Hash helpers
fn hash2(a: Field, b: Field) -> Field {
    bn254::hash_2([a, b])
}

fn hash1(a: Field) -> Field {
    bn254::hash_1([a])
}

fn compute_root(
    leaf: Field,
    path_elements: [Field; TREE_DEPTH],
    path_indices: [bool; TREE_DEPTH],
) -> Field {
    let mut hash = leaf;

    for i in 0..TREE_DEPTH {
        let sibling = path_elements[i];

        hash = if path_indices[i] {
            // right child
            hash2(sibling, hash)
        } else {
            // left child
            hash2(hash, sibling)
        };
    }

    hash
}

fn main(
    // ======== PUBLIC INPUTS ========
    root: pub Field,
    nullifier_hash: pub Field,

    // ======== PRIVATE INPUTS ========
    secret: Field,
    nullifier: Field,
    path_elements: [Field; TREE_DEPTH],
    path_indices: [bool; TREE_DEPTH],
) {
    // Recompute commitment
    let commitment = hash2(secret, nullifier);

    // Recompute Merkle root
    let computed_root =
        compute_root(commitment, path_elements, path_indices);

    // Root must match on-chain root
    assert(computed_root == root);

    // Bind nullifier to this commitment
    let computed_nullifier_hash = hash1(nullifier);
    assert(computed_nullifier_hash == nullifier_hash);
}
