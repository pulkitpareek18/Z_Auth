pragma circom 2.1.9;

template BiometricCommitment() {
    signal input uid_hash;
    signal input challenge_hash;
    signal input commitment_root;

    signal output out_uid_hash;
    signal output out_challenge_hash;
    signal output out_commitment_root;

    // Public signal pass-through scaffold. Replace with real constraints for production circuit.
    out_uid_hash <== uid_hash;
    out_challenge_hash <== challenge_hash;
    out_commitment_root <== commitment_root;
}

component main = BiometricCommitment();
