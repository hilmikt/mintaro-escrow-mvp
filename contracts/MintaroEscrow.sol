// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Mintaro — Milestone-based escrow (Avalanche Fuji)
 * - Strict full-funding before any approvals
 * - Native AVAX or single ERC-20 per escrow
 * - Pull-payments (pending withdrawals) to avoid reentrancy
 * - Platform fee in basis points (bps) on each approved milestone
 * - Pause switch for emergencies
 * - Simple dispute placeholder (freeze + owner resolve)
 */

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MintaroEscrow is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------
    // Constants & Types
    // -----------------------------

    address public constant NATIVE_TOKEN = address(0);
    uint16 public constant MAX_FEE_BPS = 500; // 5% hard cap
    uint16 public feeBps = 200;               // default 2%

    enum EscrowState {
        Created,
        Funded,
        InProgress,
        Completed,
        CancelRequested,
        Canceled,
        Disputed
    }

    struct Milestone {
        uint256 amount;
        string title;     // keep short; UI can display richer off-chain text
        uint32 dueDate;   // unix timestamp (optional in MVP)
        bool approved;
        bool released;    // credited to pending balances (set on approval)
    }

    struct Escrow {
        address client;
        address freelancer;
        address token; // address(0) = native AVAX
        uint256 totalDeposited;
        uint256 totalAllocated; // sum of milestone amounts
        uint256 totalReleased;  // sum of amounts credited on approvals
        EscrowState state;
        Milestone[] milestones;
    }

    // -----------------------------
    // Storage
    // -----------------------------

    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) private escrows;

    // pending[token][account] => amount
    mapping(address => mapping(address => uint256)) public pending;

    address payable public feeTreasury;

    // -----------------------------
    // Events
    // -----------------------------

    event EscrowCreated(
        uint256 indexed id,
        address indexed client,
        address indexed freelancer,
        address token,
        uint256 totalAmount
    );
    event EscrowFunded(uint256 indexed id, address indexed from, uint256 amount);
    event WorkStarted(uint256 indexed id);
    event MilestoneApproved(
        uint256 indexed id,
        uint256 indexed index,
        uint256 amount,
        uint256 fee
    );
    event Withdrawal(address indexed account, address indexed token, uint256 amount);
    event EscrowCompleted(uint256 indexed id);
    event CancelRequested(uint256 indexed id);
    event EscrowCanceled(uint256 indexed id, uint256 refundAmount);
    event DisputeOpened(uint256 indexed id);
    event DisputeResolved(
        uint256 indexed id,
        uint256 clientPayout,
        uint256 freelancerPayout
    );
    event FeeUpdated(uint16 newFeeBps);
    event FeeTreasuryUpdated(address indexed newTreasury);
    event Paused(address account);
    event Unpaused(address account);

    // -----------------------------
    // Constructor
    // -----------------------------

    constructor(address payable _feeTreasury) {
        require(_feeTreasury != address(0), "fee treasury required");
        feeTreasury = _feeTreasury;
    }

    // -----------------------------
    // Modifiers & internal helpers
    // -----------------------------

    modifier onlyClient(uint256 id) {
        require(msg.sender == escrows[id].client, "not client");
        _;
    }

    modifier onlyFreelancer(uint256 id) {
        require(msg.sender == escrows[id].freelancer, "not freelancer");
        _;
    }

    modifier inState(uint256 id, EscrowState s) {
        require(escrows[id].state == s, "bad state");
        _;
    }

    function _remainingDeposited(uint256 id) internal view returns (uint256) {
        Escrow storage e = escrows[id];
        return e.totalDeposited - e.totalReleased;
    }

    function _allMilestonesReleased(Escrow storage e) internal view returns (bool) {
        for (uint256 i = 0; i < e.milestones.length; i++) {
            if (!e.milestones[i].released) return false;
        }
        return true;
    }

    // -----------------------------
    // Core flows
    // -----------------------------

    /// @notice Create a new escrow with fixed milestones.
    /// @param freelancer The service provider.
    /// @param token address(0) for AVAX, or ERC-20 token address.
    /// @param amounts Array of milestone amounts.
    /// @param titles Array of short titles (can be empty strings).
    /// @param dueDates Array of unix timestamps (0 if unused).
    function createEscrow(
        address freelancer,
        address token,
        uint256[] calldata amounts,
        string[] calldata titles,
        uint32[] calldata dueDates
    ) external whenNotPaused returns (uint256 id) {
        require(freelancer != address(0), "freelancer required");
        require(freelancer != msg.sender, "client != freelancer");
        uint256 n = amounts.length;
        require(n > 0, "milestones required");
        require(titles.length == n && dueDates.length == n, "array length mismatch");

        id = nextEscrowId++;
        Escrow storage e = escrows[id];
        e.client = msg.sender;
        e.freelancer = freelancer;
        e.token = token;
        e.state = EscrowState.Created;

        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            require(amounts[i] > 0, "zero milestone");
            e.milestones.push(
                Milestone({
                    amount: amounts[i],
                    title: titles[i],
                    dueDate: dueDates[i],
                    approved: false,
                    released: false
                })
            );
            total += amounts[i];
        }
        e.totalAllocated = total;

        emit EscrowCreated(id, e.client, e.freelancer, e.token, total);
    }

    /// @notice Client funds the escrow. Strict: cannot exceed totalAllocated.
    function fundEscrow(uint256 id, uint256 amount)
        external
        payable
        whenNotPaused
        onlyClient(id)
        inState(id, EscrowState.Created)
        nonReentrant
    {
        Escrow storage e = escrows[id];
        require(amount > 0, "zero amount");
        require(e.totalDeposited + amount <= e.totalAllocated, "exceeds allocation");

        if (e.token == NATIVE_TOKEN) {
            require(msg.value == amount, "bad msg.value");
        } else {
            require(msg.value == 0, "no AVAX for ERC20");
            IERC20(e.token).safeTransferFrom(msg.sender, address(this), amount);
        }

        e.totalDeposited += amount;
        emit EscrowFunded(id, msg.sender, amount);

        if (e.totalDeposited == e.totalAllocated) {
            e.state = EscrowState.Funded;
        }
    }

    /// @notice Optional explicit start; otherwise auto-starts on first approval.
    function startWork(uint256 id)
        external
        whenNotPaused
        onlyClient(id)
        inState(id, EscrowState.Funded)
    {
        escrows[id].state = EscrowState.InProgress;
        emit WorkStarted(id);
    }

    /// @notice Client approves a milestone; funds become withdrawable by freelancer.
    function approveMilestone(uint256 id, uint256 index)
        external
        whenNotPaused
        onlyClient(id)
        nonReentrant
    {
        Escrow storage e = escrows[id];
        require(e.state != EscrowState.Canceled && e.state != EscrowState.Disputed && e.state != EscrowState.Completed, "not allowed");
        require(e.totalDeposited == e.totalAllocated, "not fully funded");
        require(index < e.milestones.length, "bad index");

        Milestone storage m = e.milestones[index];
        require(!m.approved && !m.released, "already approved");

        // credit funds
        uint256 amount = m.amount;
        require(e.totalReleased + amount <= e.totalDeposited, "insufficient deposited");

        uint256 fee = (amount * feeBps) / 10_000;
        uint256 toFreelancer = amount - fee;

        pending[e.token][e.freelancer] += toFreelancer;
        if (fee > 0) {
            pending[e.token][feeTreasury] += fee;
        }

        // state updates
        m.approved = true;
        m.released = true;
        e.totalReleased += amount;

        // move into progress on first approval if still Funded
        if (e.state == EscrowState.Funded) {
            e.state = EscrowState.InProgress;
            emit WorkStarted(id);
        }

        emit MilestoneApproved(id, index, amount, fee);

        // complete if all milestones released
        if (_allMilestonesReleased(e)) {
            e.state = EscrowState.Completed;
            emit EscrowCompleted(id);
        }
    }

    // -----------------------------
    // Cancel & Dispute
    // -----------------------------

    /// @notice Client can request cancel only before any approvals.
    function requestCancel(uint256 id)
        external
        whenNotPaused
        onlyClient(id)
    {
        Escrow storage e = escrows[id];
        require(
            e.state == EscrowState.Created || e.state == EscrowState.Funded || e.state == EscrowState.InProgress,
            "bad state"
        );
        require(e.totalReleased == 0, "some milestones approved");
        e.state = EscrowState.CancelRequested;
        emit CancelRequested(id);
    }

    /// @notice Freelancer accepts cancel; remaining deposited funds are refunded to client.
    function acceptCancel(uint256 id)
        external
        whenNotPaused
        onlyFreelancer(id)
        inState(id, EscrowState.CancelRequested)
        nonReentrant
    {
        Escrow storage e = escrows[id];
        uint256 refund = _remainingDeposited(id); // equals totalDeposited when nothing approved
        if (refund > 0) {
            pending[e.token][e.client] += refund;
        }
        e.state = EscrowState.Canceled;
        emit EscrowCanceled(id, refund);
    }

    /// @notice Either party can open a dispute; freezes approvals.
    function openDispute(uint256 id) external whenNotPaused {
        Escrow storage e = escrows[id];
        require(msg.sender == e.client || msg.sender == e.freelancer, "not participant");
        require(
            e.state == EscrowState.Funded || e.state == EscrowState.InProgress || e.state == EscrowState.CancelRequested,
            "bad state"
        );
        e.state = EscrowState.Disputed;
        emit DisputeOpened(id);
    }

    /// @notice Owner resolves dispute by splitting remaining deposited funds.
    function resolveDispute(uint256 id, uint256 clientPayout, uint256 freelancerPayout)
        external
        onlyOwner
        nonReentrant
    {
        Escrow storage e = escrows[id];
        require(e.state == EscrowState.Disputed, "not disputed");

        uint256 remaining = _remainingDeposited(id);
        require(clientPayout + freelancerPayout == remaining, "sum mismatch");

        if (clientPayout > 0) pending[e.token][e.client] += clientPayout;
        if (freelancerPayout > 0) pending[e.token][e.freelancer] += freelancerPayout;

        // After resolution, mark as Canceled (funds allocated off-chain) or Completed.
        e.state = EscrowState.Canceled;
        emit DisputeResolved(id, clientPayout, freelancerPayout);
    }

    // -----------------------------
    // Withdrawals (pull pattern)
    // -----------------------------

    function withdrawNative() external nonReentrant {
        uint256 amt = pending[NATIVE_TOKEN][msg.sender];
        require(amt > 0, "nothing to withdraw");
        pending[NATIVE_TOKEN][msg.sender] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amt}("");
        require(ok, "AVAX transfer failed");
        emit Withdrawal(msg.sender, NATIVE_TOKEN, amt);
    }

    function withdrawToken(address token) external nonReentrant {
        require(token != NATIVE_TOKEN, "use withdrawNative");
        uint256 amt = pending[token][msg.sender];
        require(amt > 0, "nothing to withdraw");
        pending[token][msg.sender] = 0;

        IERC20(token).safeTransfer(msg.sender, amt);
        emit Withdrawal(msg.sender, token, amt);
    }

    // -----------------------------
    // Views
    // -----------------------------

    function getEscrowBasic(uint256 id)
        external
        view
        returns (
            address client,
            address freelancer,
            address token,
            uint256 totalDeposited,
            uint256 totalAllocated,
            uint256 totalReleased,
            EscrowState state,
            uint256 milestonesCount
        )
    {
        Escrow storage e = escrows[id];
        return (
            e.client,
            e.freelancer,
            e.token,
            e.totalDeposited,
            e.totalAllocated,
            e.totalReleased,
            e.state,
            e.milestones.length
        );
    }

    function getMilestone(uint256 id, uint256 index)
        external
        view
        returns (uint256 amount, string memory title, uint32 dueDate, bool approved, bool released)
    {
        Escrow storage e = escrows[id];
        require(index < e.milestones.length, "bad index");
        Milestone storage m = e.milestones[index];
        return (m.amount, m.title, m.dueDate, m.approved, m.released);
    }

    function getMilestonesCount(uint256 id) external view returns (uint256) {
        return escrows[id].milestones.length;
    }

    // -----------------------------
    // Admin
    // -----------------------------

    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "fee too high");
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setFeeTreasury(address payable newTreasury) external onlyOwner {
        require(newTreasury != address(0), "zero address");
        feeTreasury = newTreasury;
        emit FeeTreasuryUpdated(newTreasury);
    }

    function pause() external onlyOwner {
        _pause();
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit Unpaused(msg.sender);
    }

    /// @notice Recover stray ERC20 accidentally sent to this contract (not escrowed balances).
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "bad token");
        IERC20(token).safeTransfer(owner(), amount);
    }

    // receive: only accept AVAX when funding an escrow via fundEscrow
    receive() external payable {
        revert("direct AVAX not accepted");
    }
}
