// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Escrow for digital goods: a Trade moves Funded -> Delivered -> Completed,
/// or exits to Refunded after its deadline. Release happens only on buyer
/// confirmation; refund is allowed from Funded or Delivered once the deadline
/// passes (buyer-favored — see docs/adr/0001-escrow-state-machine.md).
contract DigitalEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Listing {
        address seller;
        uint8 zoneId; // frontend routing data, deliberately unvalidated
        uint64 deliveryWindow; // seconds; deadline starts at funding, not listing
        uint256 price; // 6-decimal USDC base units
        bytes32 productHash;
    }

    enum TradeStatus {
        Funded,
        Delivered,
        Completed,
        Refunded
    }

    struct Trade {
        uint256 listingId;
        address buyer;
        uint64 deadline; // fundedAt + listing.deliveryWindow
        TradeStatus status;
        uint256 amount;
        bytes32 deliveryHash;
    }

    IERC20 public immutable usdc;

    uint256 public listingCount;
    mapping(uint256 => Listing) public listings;
    uint256 public tradeCount;
    mapping(uint256 => Trade) public trades;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        uint8 zoneId,
        uint256 price,
        bytes32 productHash,
        uint64 deliveryWindow
    );

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

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function createListing(uint8 zoneId, bytes32 productHash, uint256 price, uint64 deliveryWindow)
        external
        returns (uint256 listingId)
    {
        listingId = ++listingCount;
        listings[listingId] = Listing({
            seller: msg.sender,
            zoneId: zoneId,
            deliveryWindow: deliveryWindow,
            price: price,
            productHash: productHash
        });
        emit ListingCreated(listingId, msg.sender, zoneId, price, productHash, deliveryWindow);
    }

    function fundTrade(uint256 listingId) external nonReentrant returns (uint256 tradeId) {
        Listing memory listing = listings[listingId];
        require(listing.seller != address(0), "listing does not exist");
        require(msg.sender != listing.seller, "cannot buy own listing");

        tradeId = ++tradeCount;
        uint64 deadline = uint64(block.timestamp) + listing.deliveryWindow;
        trades[tradeId] = Trade({
            listingId: listingId,
            buyer: msg.sender,
            deadline: deadline,
            status: TradeStatus.Funded,
            amount: listing.price,
            deliveryHash: bytes32(0)
        });
        usdc.safeTransferFrom(msg.sender, address(this), listing.price);
        emit TradeFunded(tradeId, listingId, msg.sender, listing.seller, listing.price, deadline);
    }

    function markDelivered(uint256 tradeId, bytes32 deliveryHash) external {
        Trade storage trade = trades[tradeId];
        require(msg.sender == listings[trade.listingId].seller, "only seller");
        require(trade.status == TradeStatus.Funded, "not funded");
        trade.status = TradeStatus.Delivered;
        trade.deliveryHash = deliveryHash;
        emit TradeDelivered(tradeId, deliveryHash);
    }

    function confirmReceipt(uint256 tradeId) external nonReentrant {
        Trade storage trade = trades[tradeId];
        require(msg.sender == trade.buyer, "only buyer");
        require(trade.status == TradeStatus.Delivered, "not delivered");
        trade.status = TradeStatus.Completed;
        usdc.safeTransfer(listings[trade.listingId].seller, trade.amount);
        emit TradeCompleted(tradeId);
    }

    function refundExpired(uint256 tradeId) external nonReentrant {
        Trade storage trade = trades[tradeId];
        require(msg.sender == trade.buyer, "only buyer");
        require(trade.status == TradeStatus.Funded || trade.status == TradeStatus.Delivered, "not refundable");
        require(block.timestamp > trade.deadline, "deadline not passed");
        trade.status = TradeStatus.Refunded;
        usdc.safeTransfer(trade.buyer, trade.amount);
        emit TradeRefunded(tradeId);
    }
}
