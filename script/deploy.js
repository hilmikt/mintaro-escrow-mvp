const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const MintaroEscrow = await ethers.getContractFactory("MintaroEscrow");
  const escrow = await MintaroEscrow.deploy();
  await escrow.deployed();

  console.log("MintaroEscrow deployed at:", escrow.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
