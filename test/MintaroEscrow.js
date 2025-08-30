const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MintaroEscrow", function () {
  let contract, client, freelancer, treasury;

  beforeEach(async () => {
    [client, freelancer, treasury] = await ethers.getSigners();
    const MintaroEscrow = await ethers.getContractFactory("MintaroEscrow");
    contract = await MintaroEscrow.deploy(treasury.address);
    await contract.waitForDeployment(); // ethers v6
  });

  it("sets feeBps default to 200", async () => {
    expect(await contract.feeBps()).to.equal(200);
  });

  it("creates an escrow with milestones", async () => {
    const oneAvax = ethers.parseEther("1"); // v6
    const tx = await contract.connect(client).createEscrow(
      freelancer.address,
      ethers.ZeroAddress,           // native AVAX
      [oneAvax],                    // amounts
      ["Milestone 1"],              // titles
      [0]                           // due dates
    );
    await tx.wait();

    // nextEscrowId starts at 1 and increments after create
    expect(await contract.nextEscrowId()).to.equal(2n); // v6 returns BigInt
  });
});
