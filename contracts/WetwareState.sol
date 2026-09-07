// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./IAggregatorV3.sol";
import {IAttestationVerifier} from "./IAttestationVerifier.sol";

/**
 * @title WetwareState
 * @notice On-chain nervous system record for a simulated C. elegans organism whose
 *         sensory input is a tokenized equity's Chainlink price feed.
 *
 * @dev The trust model, stated plainly, because this is the part that matters.
 *
 *      The organism runs off-chain: 299 neurons and 98 muscles are far too much
 *      computation to put on a rollup. So the question is what a reader of this
 *      contract actually has to take on faith.
 *
 *      They do NOT have to trust the poster about the price. Every update names a
 *      Chainlink roundId, and this contract reads that round back from the feed
 *      itself and rejects the update if the reported answer does not match. The
 *      stimulus driving the organism is therefore oracle-attested, not asserted.
 *
 *      They do NOT have to trust the poster about the simulation either, provided
 *      they are willing to run it. The simulator is deterministic and open source:
 *      given the same sequence of oracle rounds it produces one and only one
 *      stateHash. Anyone can replay the feed history and check every hash this
 *      contract has ever stored. A poster that fakes a state is caught by the first
 *      person who bothers to replay.
 *
 *      What they DO trust, in v1, is that the poster is running the published code
 *      rather than something that looks like it until someone checks. v2 removes
 *      that last assumption by moving the simulator into a TEE and requiring the
 *      poster key to be introduced by a remote attestation. The hook is already
 *      here: set an attestation verifier, and the poster can only be rotated by a
 *      key that proves it came from an enclave running the published image.
 */
contract WetwareState {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct State {
        /// @dev Total simulation ticks since genesis.
        uint64 tick;
        /// @dev Chainlink round that produced this state.
        uint80 roundId;
        /// @dev Feed answer for that round, 8 decimals.
        int192 answer;
        /// @dev Position, in organism units.
        int64 x;
        int64 y;
        /// @dev Heading in tenths of a degree, 0 to 3599.
        uint16 heading;
        /// @dev Muscle drive on each side after the final tick of the round.
        int64 leftMuscle;
        int64 rightMuscle;
        /// @dev keccak256 over every neuron and muscle. Replay this to check our work.
        bytes32 stateHash;
        /// @dev Block timestamp at which this state was recorded.
        uint64 recordedAt;
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event WetwareStateUpdated(
        uint64 indexed tick,
        uint80 indexed roundId,
        int192 answer,
        int64 deltaX,
        int64 deltaY,
        int64 leftMuscle,
        int64 rightMuscle,
        uint16 heading,
        bytes32 stateHash
    );

    /// @notice Someone poked the worm. The simulator watches for this and applies
    ///         an extra burst of stimulus on the next round.
    event Poked(address indexed sender, uint64 at);

    event PosterChanged(address indexed previousPoster, address indexed newPoster, bool viaAttestation);
    event VerifierChanged(address indexed verifier, bytes32[3] pcrs);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event OwnerRenounced(address indexed previousOwner);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotOwner();
    error NotPoster();
    error OwnershipRenounced();
    error StaleRound();
    error PriceMismatch(int256 reported, int256 onFeed);
    error RoundNotAnswered();
    error PokeTooSoon(uint64 availableAt);
    error VerifierNotSet();
    error ZeroAddress();

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice The equity feed the organism feeds on. Immutable: a different feed is a
    ///         different organism, and it should get its own contract and its own genesis.
    IAggregatorV3 public immutable feed;

    /// @notice Minimum seconds between pokes, per the whole contract rather than per caller.
    uint64 public constant POKE_COOLDOWN = 60;

    address public owner;
    address public poster;

    IAttestationVerifier public attestationVerifier;
    bytes32[3] public expectedPcrs;

    State private _state;
    uint64 public lastPokedAt;
    /// @notice Pokes recorded since the poster last consumed them.
    uint32 public pendingPokes;
    /// @notice Lifetime pokes. Doubles as the "has ever been poked" sentinel, so the
    ///         cooldown does not depend on a nonzero block timestamp.
    uint64 public totalPokes;

    // ---------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------

    constructor(IAggregatorV3 _feed, address _poster) {
        if (address(_feed) == address(0) || _poster == address(0)) revert ZeroAddress();
        feed = _feed;
        poster = _poster;
        owner = msg.sender;
        emit PosterChanged(address(0), _poster, false);
        emit OwnerChanged(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (owner == address(0)) revert OwnershipRenounced();
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ---------------------------------------------------------------------
    // The organism
    // ---------------------------------------------------------------------

    /**
     * @notice Record the organism's state after processing one oracle round.
     * @dev Reverts unless `answer` matches what the feed itself reports for `roundId`.
     *      That check is the reason a reader does not have to trust the poster about
     *      the input, only about the computation, which is separately replayable.
     */
    function postState(
        uint64 tick,
        uint80 roundId,
        int192 answer,
        int64 x,
        int64 y,
        uint16 heading,
        int64 leftMuscle,
        int64 rightMuscle,
        bytes32 stateHash
    ) external {
        if (msg.sender != poster) revert NotPoster();

        State memory previous = _state;
        if (roundId <= previous.roundId) revert StaleRound();
        if (tick < previous.tick) revert StaleRound();

        _requireMatchesFeed(roundId, answer);

        int64 deltaX = x - previous.x;
        int64 deltaY = y - previous.y;

        _state = State({
            tick: tick,
            roundId: roundId,
            answer: answer,
            x: x,
            y: y,
            heading: heading,
            leftMuscle: leftMuscle,
            rightMuscle: rightMuscle,
            stateHash: stateHash,
            recordedAt: uint64(block.timestamp)
        });

        pendingPokes = 0;

        emit WetwareStateUpdated(
            tick, roundId, answer, deltaX, deltaY, leftMuscle, rightMuscle, heading, stateHash
        );
    }

    /// @dev Confirms the reported price against the feed's own record of that round.
    function _requireMatchesFeed(uint80 roundId, int192 answer) private view {
        (, int256 onFeed,, uint256 updatedAt,) = feed.getRoundData(roundId);
        if (updatedAt == 0) revert RoundNotAnswered();
        if (onFeed != int256(answer)) revert PriceMismatch(int256(answer), onFeed);
    }

    /**
     * @notice Poke the worm. Costs a transaction and does nothing for you.
     * @dev Kept from the original DeepWorm design because it is the only way an
     *      onlooker can touch the organism, and that turns out to be the thing
     *      people actually want to do.
     */
    function poke() external {
        uint64 availableAt = lastPokedAt + POKE_COOLDOWN;
        if (totalPokes != 0 && block.timestamp < availableAt) revert PokeTooSoon(availableAt);
        lastPokedAt = uint64(block.timestamp);
        pendingPokes += 1;
        totalPokes += 1;
        emit Poked(msg.sender, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    function getState() external view returns (State memory) {
        return _state;
    }

    /// @notice Muscle drive on each side, the two numbers anything building on the
    ///         organism most likely wants.
    function getMuscles() external view returns (int64 left, int64 right) {
        return (_state.leftMuscle, _state.rightMuscle);
    }

    function getPosition() external view returns (int64 x, int64 y, uint16 heading) {
        return (_state.x, _state.y, _state.heading);
    }

    /// @notice Seconds since the last state was recorded. Large values mean the
    ///         organism is unattended, which is exactly how the last one died.
    function secondsSinceUpdate() external view returns (uint64) {
        if (_state.recordedAt == 0) return type(uint64).max;
        return uint64(block.timestamp) - _state.recordedAt;
    }

    function pokeAvailableAt() external view returns (uint64) {
        return totalPokes == 0 ? 0 : lastPokedAt + POKE_COOLDOWN;
    }

    // ---------------------------------------------------------------------
    // Poster rotation
    // ---------------------------------------------------------------------

    /// @notice Owner-set poster. Only available while no attestation verifier is set;
    ///         once one is, the owner cannot hand the organism to an arbitrary key.
    function setPoster(address newPoster) external onlyOwner {
        if (newPoster == address(0)) revert ZeroAddress();
        if (address(attestationVerifier) != address(0)) revert VerifierNotSet();
        address previous = poster;
        poster = newPoster;
        emit PosterChanged(previous, newPoster, false);
    }

    /// @notice Configure the v2 attestation path. After this, `setPoster` is disabled
    ///         and the poster can only be replaced by `registerEnclaveKey`.
    function setVerifier(IAttestationVerifier verifier, bytes32[3] calldata pcrs) external onlyOwner {
        if (address(verifier) == address(0)) revert ZeroAddress();
        attestationVerifier = verifier;
        expectedPcrs = pcrs;
        emit VerifierChanged(address(verifier), pcrs);
    }

    /**
     * @notice Install a poster key proven to live inside an enclave running the
     *         published image. Permissionless by design: if the organism's host
     *         disappears, anyone can stand up a replacement and take over posting.
     */
    function registerEnclaveKey(bytes calldata attestation) external {
        IAttestationVerifier verifier = attestationVerifier;
        if (address(verifier) == address(0)) revert VerifierNotSet();

        address enclaveKey = verifier.verify(attestation, expectedPcrs);
        if (enclaveKey == address(0)) revert ZeroAddress();

        address previous = poster;
        poster = enclaveKey;
        emit PosterChanged(previous, enclaveKey, true);
    }

    // ---------------------------------------------------------------------
    // Ownership
    // ---------------------------------------------------------------------

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previous = owner;
        owner = newOwner;
        emit OwnerChanged(previous, newOwner);
    }

    /// @notice Give up admin permanently. Intended to be called once the attestation
    ///         verifier is live, at which point the organism needs no operator at all.
    function renounceOwnership() external onlyOwner {
        address previous = owner;
        owner = address(0);
        emit OwnerRenounced(previous);
    }
}
