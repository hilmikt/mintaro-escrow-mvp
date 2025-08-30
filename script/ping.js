const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const file = path.join(__dirname, "..", "deployments", "fuji.json");
  const { address } = JSON.parse(fs.readFileSync(file, "utf8"));

  const c = await ethers.getContractAt("MintaroEscrow", address);
  const fee = await c.feeBps();
  console.log("feeBps:", fee.toString());
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
