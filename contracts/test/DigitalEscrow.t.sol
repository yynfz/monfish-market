// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {DigitalEscrow} from "../src/DigitalEscrow.sol";

contract DigitalEscrowTest is Test {
    MockUSDC usdc;
    DigitalEscrow escrow;

    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address stranger = makeAddr("stranger");

    uint8 constant ZONE_SARDINE_HARBOR = 1;
    uint256 constant PRICE = 5_000_000; // $5.00
    uint64 constant WINDOW = 24 hours;
    bytes32 constant PRODUCT_HASH = keccak256("pixel-reef-starter-pack.zip");

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        uint8 zoneId,
        uint256 price,
        bytes32 productHash,
        uint64 deliveryWindow
    );

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new DigitalEscrow(address(usdc));
        usdc.mint(buyer, 1_000_000_000); // $1,000
    }

    event TradeFunded(
        uint256 indexed tradeId,
        uint256 indexed listingId,
        address indexed buyer,
        address seller,
        uint256 amount,
        uint64 deadline
    );
    event TradeDelivered(uint256 indexed tradeId, bytes32 deliveryHash);
    event TradeCompleted(uint256 indexed tradeId);
    event TradeRefunded(uint256 indexed tradeId);

    bytes32 constant DELIVERY_HASH = keccak256("delivered-file-bytes");

    function createDefaultListing() internal returns (uint256) {
        vm.prank(seller);
        return escrow.createListing(ZONE_SARDINE_HARBOR, PRODUCT_HASH, PRICE, WINDOW);
    }

    function fundDefaultTrade() internal returns (uint256) {
        uint256 listingId = createDefaultListing();
        vm.startPrank(buyer);
        usdc.approve(address(escrow), PRICE);
        uint256 tradeId = escrow.fundTrade(listingId);
        vm.stopPrank();
        return tradeId;
    }

    function test_fundTrade_movesUsdcIntoEscrowAndStartsDeadline() public {
        uint256 listingId = createDefaultListing();
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.startPrank(buyer);
        usdc.approve(address(escrow), PRICE);
        vm.expectEmit();
        emit TradeFunded(1, listingId, buyer, seller, PRICE, uint64(block.timestamp) + WINDOW);
        uint256 tradeId = escrow.fundTrade(listingId);
        vm.stopPrank();

        assertEq(tradeId, 1);
        assertEq(usdc.balanceOf(buyer), buyerBefore - PRICE);
        assertEq(usdc.balanceOf(address(escrow)), PRICE);
        (uint256 tListingId, address tBuyer, uint64 tDeadline, DigitalEscrow.TradeStatus tStatus, uint256 tAmount,)
        = escrow.trades(tradeId);
        assertEq(tListingId, listingId);
        assertEq(tBuyer, buyer);
        assertEq(tDeadline, uint64(block.timestamp) + WINDOW);
        assertEq(uint8(tStatus), uint8(DigitalEscrow.TradeStatus.Funded));
        assertEq(tAmount, PRICE);
    }

    function test_markDelivered_recordsHashAndStatus() public {
        uint256 tradeId = fundDefaultTrade();

        vm.expectEmit();
        emit TradeDelivered(tradeId, DELIVERY_HASH);
        vm.prank(seller);
        escrow.markDelivered(tradeId, DELIVERY_HASH);

        (,,, DigitalEscrow.TradeStatus tStatus,, bytes32 tHash) = escrow.trades(tradeId);
        assertEq(uint8(tStatus), uint8(DigitalEscrow.TradeStatus.Delivered));
        assertEq(tHash, DELIVERY_HASH);
    }

    function test_confirmReceipt_paysSellerAndCompletes() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(seller);
        escrow.markDelivered(tradeId, DELIVERY_HASH);

        vm.expectEmit();
        emit TradeCompleted(tradeId);
        vm.prank(buyer);
        escrow.confirmReceipt(tradeId);

        assertEq(usdc.balanceOf(seller), PRICE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        (,,, DigitalEscrow.TradeStatus tStatus,,) = escrow.trades(tradeId);
        assertEq(uint8(tStatus), uint8(DigitalEscrow.TradeStatus.Completed));
    }

    function test_refundExpired_returnsFundsToBuyerAfterDeadline() public {
        uint256 tradeId = fundDefaultTrade();
        uint256 buyerAfterFunding = usdc.balanceOf(buyer);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectEmit();
        emit TradeRefunded(tradeId);
        vm.prank(buyer);
        escrow.refundExpired(tradeId);

        assertEq(usdc.balanceOf(buyer), buyerAfterFunding + PRICE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        (,,, DigitalEscrow.TradeStatus tStatus,,) = escrow.trades(tradeId);
        assertEq(uint8(tStatus), uint8(DigitalEscrow.TradeStatus.Refunded));
    }

    function test_refundExpired_allowedFromDeliveredPerAdr0001() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(seller);
        escrow.markDelivered(tradeId, DELIVERY_HASH);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(buyer);
        escrow.refundExpired(tradeId);

        (,,, DigitalEscrow.TradeStatus tStatus,,) = escrow.trades(tradeId);
        assertEq(uint8(tStatus), uint8(DigitalEscrow.TradeStatus.Refunded));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_refundExpired_revertsBeforeDeadline() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(buyer);
        vm.expectRevert("deadline not passed");
        escrow.refundExpired(tradeId);
    }

    function test_confirmReceipt_revertsBeforeDelivery() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(buyer);
        vm.expectRevert("not delivered");
        escrow.confirmReceipt(tradeId);
    }

    function test_confirmReceipt_revertsWhenCalledTwice() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(seller);
        escrow.markDelivered(tradeId, DELIVERY_HASH);
        vm.prank(buyer);
        escrow.confirmReceipt(tradeId);

        vm.prank(buyer);
        vm.expectRevert("not delivered");
        escrow.confirmReceipt(tradeId);
    }

    function test_refundExpired_revertsAfterCompletion() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(seller);
        escrow.markDelivered(tradeId, DELIVERY_HASH);
        vm.prank(buyer);
        escrow.confirmReceipt(tradeId);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(buyer);
        vm.expectRevert("not refundable");
        escrow.refundExpired(tradeId);
    }

    function test_confirmReceipt_revertsAfterRefund() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(seller);
        escrow.markDelivered(tradeId, DELIVERY_HASH);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(buyer);
        escrow.refundExpired(tradeId);

        vm.prank(buyer);
        vm.expectRevert("not delivered");
        escrow.confirmReceipt(tradeId);
    }

    function test_confirmReceipt_revertsForNonBuyer() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(seller);
        escrow.markDelivered(tradeId, DELIVERY_HASH);

        vm.prank(stranger);
        vm.expectRevert("only buyer");
        escrow.confirmReceipt(tradeId);
    }

    function test_refundExpired_revertsForNonBuyer() public {
        uint256 tradeId = fundDefaultTrade();
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(stranger);
        vm.expectRevert("only buyer");
        escrow.refundExpired(tradeId);
    }

    function test_markDelivered_revertsForNonSeller() public {
        uint256 tradeId = fundDefaultTrade();
        vm.prank(stranger);
        vm.expectRevert("only seller");
        escrow.markDelivered(tradeId, DELIVERY_HASH);
    }

    function test_fundTrade_revertsWithoutApproval() public {
        uint256 listingId = createDefaultListing();
        vm.prank(buyer);
        vm.expectRevert();
        escrow.fundTrade(listingId);
    }

    function test_fundTrade_revertsForSelfBuy() public {
        uint256 listingId = createDefaultListing();
        vm.prank(seller);
        vm.expectRevert("cannot buy own listing");
        escrow.fundTrade(listingId);
    }

    function test_fundTrade_revertsForUnknownListing() public {
        vm.prank(buyer);
        vm.expectRevert("listing does not exist");
        escrow.fundTrade(42);
    }

    function test_createListing_storesListingAndEmits() public {
        vm.expectEmit();
        emit ListingCreated(1, seller, ZONE_SARDINE_HARBOR, PRICE, PRODUCT_HASH, WINDOW);

        vm.prank(seller);
        uint256 id = escrow.createListing(ZONE_SARDINE_HARBOR, PRODUCT_HASH, PRICE, WINDOW);

        assertEq(id, 1);
        (address lSeller, uint8 lZone, uint64 lWindow, uint256 lPrice, bytes32 lHash) = escrow.listings(id);
        assertEq(lSeller, seller);
        assertEq(lZone, ZONE_SARDINE_HARBOR);
        assertEq(lWindow, WINDOW);
        assertEq(lPrice, PRICE);
        assertEq(lHash, PRODUCT_HASH);
        assertEq(escrow.listingCount(), 1);
    }
}
