// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Verifier for TEE remote attestations, enabled in v2.
/// @dev Robinhood Chain has no attestation verifier deployed today. WetwareState
/// is written so that one can be introduced later without migrating state: set the
/// verifier, and from that point the poster key can only be replaced by a signer
/// that proves it lives inside an enclave running the published image.
interface IAttestationVerifier {
    /// @param attestation Raw attestation document from the enclave.
    /// @param expectedPcrs Platform Configuration Registers the enclave must match.
    /// @return enclaveKey The public key the attestation binds, as an address.
    function verify(bytes calldata attestation, bytes32[3] calldata expectedPcrs)
        external
        view
        returns (address enclaveKey);
}
