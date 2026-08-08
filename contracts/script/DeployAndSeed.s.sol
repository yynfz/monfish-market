// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {DigitalEscrow} from "../src/DigitalEscrow.sol";

/// @notice One run: deploy MockUSDC + DigitalEscrow, mint demo balances,
/// seed the three demo listings, emit ../shared/deployments.json.
/// Usage: forge script script/DeployAndSeed.s.sol --rpc-url monad_testnet --broadcast
contract DeployAndSeed is Script {
    uint8 constant CORAL_CAPITAL = 0;
    uint8 constant SARDINE_HARBOR = 1;

    function run() external {
        uint256 sellerKey = vm.envUint("SELLER_PRIVATE_KEY");
        address buyer = vm.envAddress("BUYER_ADDRESS");
        address sellerAddr = vm.addr(sellerKey);

        vm.startBroadcast(sellerKey);

        MockUSDC usdc = new MockUSDC();
        DigitalEscrow escrow = new DigitalEscrow(address(usdc));

        usdc.mint(buyer, 1_000_000_000); // $1,000
        usdc.mint(sellerAddr, 100_000_000); // $100

        // Seed listings — ids 1..3 must match the frontend's listings metadata
        // (docs/integration-memo.md).
        escrow.createListing(SARDINE_HARBOR, hashOf("pixel-reef-starter-pack.zip"), 5_000_000, 24 hours);
        escrow.createListing(SARDINE_HARBOR, hashOf("ghost-ship-map-pack.zip"), 3_000_000, 60);
        escrow.createListing(CORAL_CAPITAL, hashOf("captains-hat-template.zip"), 2_000_000, 24 hours);

        vm.stopBroadcast();

        string memory json = "deployments";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeString(json, "rpcUrl", vm.envString("RPC_URL"));
        vm.serializeAddress(json, "usdc", address(usdc));
        vm.serializeAddress(json, "escrow", address(escrow));
        vm.serializeAddress(json, "seller", sellerAddr);
        vm.serializeAddress(json, "buyer", buyer);
        uint256[] memory ids = new uint256[](3);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        string memory out = vm.serializeUint(json, "seedListingIds", ids);
        vm.writeJson(out, "../shared/deployments.json");
    }

    function hashOf(string memory assetFile) internal view returns (bytes32) {
        return keccak256(vm.readFileBinary(string.concat("../assets/", assetFile)));
    }
}
