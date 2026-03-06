// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Groth16Verifier.sol";

contract ZAuthIdentity is Groth16Verifier {
    address public immutable owner;

    struct Identity {
        bytes32 commitmentRoot;
        uint256 zkCommitment;
        uint256 version;
        uint256 timestamp;
    }

    mapping(bytes32 => Identity) public identities;

    event IdentityCommitted(
        bytes32 indexed uidHash,
        bytes32 commitmentRoot,
        uint256 zkCommitment,
        uint256 version,
        uint256 timestamp
    );

    event ProofVerified(
        bytes32 indexed uidHash,
        uint256 commitment,
        uint256 binding,
        uint256 challenge,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function enrollIdentity(
        bytes32 uidHash,
        bytes32 commitmentRoot,
        uint256 zkCommitment,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[3] calldata publicSignals
    ) external onlyOwner {
        require(this.verifyProof(a, b, c, publicSignals), "invalid proof");
        require(publicSignals[0] == zkCommitment, "commitment mismatch");

        uint256 nextVersion = identities[uidHash].version + 1;
        identities[uidHash] = Identity(commitmentRoot, zkCommitment, nextVersion, block.timestamp);
        emit IdentityCommitted(uidHash, commitmentRoot, zkCommitment, nextVersion, block.timestamp);
    }

    function verifyAndLog(
        bytes32 uidHash,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[3] calldata publicSignals
    ) external onlyOwner returns (bool) {
        bool valid = this.verifyProof(a, b, c, publicSignals);
        if (valid) {
            require(identities[uidHash].zkCommitment == publicSignals[0], "commitment mismatch");
            emit ProofVerified(uidHash, publicSignals[0], publicSignals[1], publicSignals[2], block.timestamp);
        }
        return valid;
    }

    function getIdentity(bytes32 uidHash) external view returns (
        bytes32 commitmentRoot,
        uint256 zkCommitment,
        uint256 version,
        uint256 timestamp
    ) {
        Identity memory id = identities[uidHash];
        return (id.commitmentRoot, id.zkCommitment, id.version, id.timestamp);
    }
}
