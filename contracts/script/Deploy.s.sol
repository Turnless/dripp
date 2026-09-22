// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TipVault} from "../src/TipVault.sol";

/// @dev Run with:
///   forge script script/Deploy.s.sol \
///     --rpc-url $MONAD_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast
/// Then paste the deployed address into TIPVAULT_CONTRACT_ADDRESS in .env.
contract DeployTipVault is Script {
    function run() external {
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address ownerAddress = vm.envAddress("TIPVAULT_OWNER_ADDRESS");

        vm.startBroadcast();
        TipVault vault = new TipVault(usdcAddress, ownerAddress);
        vm.stopBroadcast();

        console2.log("TipVault deployed at:", address(vault));
    }
}
