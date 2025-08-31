// setFee.js
const hre = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS = "0x52EF27e7E2800f7E186d15D1Cd122F7a020338DF"; // <-- paste exact 0x address
  const NEW_FEE_BPS = 10; // 0.1%

  // use the first configured signer (your PRIVATE_KEY from .env)
  const [signer] = await hre.ethers.getSigners();
  console.log("Using signer:", await signer.getAddress());

  // attach to the deployed contract
  const contract = await hre.ethers.getContractAt(
    "MintaroEscrow",
    CONTRACT_ADDRESS,
    signer
  );

  // call the owner-only setter
  const tx = await contract.setFeeBps(NEW_FEE_BPS);
  console.log("Submitted tx:", tx.hash);
  await tx.wait();
  const fee = await contract.feeBps();
  console.log("Updated feeBps =", fee.toString(), "(should be 10)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
