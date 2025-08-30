const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const feeTreasury = process.env.FEE_TREASURY;
  if (!feeTreasury) throw new Error("FEE_TREASURY missing in .env");

  const MintaroEscrow = await ethers.getContractFactory("MintaroEscrow");
  const contract = await MintaroEscrow.deploy(feeTreasury);
  await contract.waitForDeployment();                 // v6

  const address = await contract.getAddress();        // v6 (Hardhat also sets contract.target)
  console.log("MintaroEscrow deployed to:", address);

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "fuji.json");
  fs.writeFileSync(outPath, JSON.stringify({ chainId: 43113, address }, null, 2));
  console.log("Wrote", outPath);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
