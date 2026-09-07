// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test double for a Chainlink equity feed. Not for deployment.
contract MockAggregator {
    mapping(uint80 => int256) public answers;
    mapping(uint80 => uint256) public updatedAts;
    uint80 public latest;

    function setRound(uint80 roundId, int256 answer, uint256 updatedAt) external {
        answers[roundId] = answer;
        updatedAts[roundId] = updatedAt;
        if (roundId > latest) latest = roundId;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (latest, answers[latest], updatedAts[latest], updatedAts[latest], latest);
    }

    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answers[roundId], updatedAts[roundId], updatedAts[roundId], roundId);
    }
}
