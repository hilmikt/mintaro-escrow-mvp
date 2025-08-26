# Mintaro Escrow — MVP (Avalanche Fuji)

Mintaro is a milestone-based escrow DApp for clients and freelancers. The MVP demo proves one clean flow: client creates a job and deposits funds; freelancer completes the milestone; client releases funds. Built for Avalanche Fuji with Solidity + Hardhat and a React frontend (RainbowKit, Wagmi, Ethers).

## Why this exists
Web2 freelance platforms delay or dispute payouts. Mintaro anchors payments to on-chain milestones: deposit → deliver → release. Judges get a live, simple, trustworthy demo.

## Tech stack
Solidity, Hardhat, TypeScript tests; Avalanche Fuji RPC; React (Vite), RainbowKit + Wagmi (wallet), Ethers (v6), Tailwind.

## Repo layout
contracts/ (Solidity)
script/ (deploy)
test/ (unit/integration)
frontend/ (React app)
.env.example (copy to .env and fill)

## Quick start (contracts)
1) Copy .env.example to .env and set ALCHEMY_API_KEY or AVAX RPC + PRIVATE_KEY.
2) Install deps, run tests, and deploy to Fuji.
3) Note the deployed address; paste into frontend/src/lib/contract.ts.

## Quick start (frontend)
1) In frontend/ install deps, run dev server.
2) Connect wallet (MetaMask on Fuji), try: create job → deposit → release.

## Security notes
This MVP is demo-grade: no production audits, limited checks. Funds should be testnet only. Add reentrancy guards, dispute resolution, and full role logic before mainnet.

## License
MIT
