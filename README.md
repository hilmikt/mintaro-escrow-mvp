# Mintaro — Milestone Escrow MVP

Mintaro is a Web3 freelance platform prototype built around ~milestone-based escrow payments~.  
It ensures freelancers are rewarded fairly for completed work while giving clients protection if projects stall or are abandoned.  
This MVP is deployed on Avalanche Fuji Testnet.

---

## ✨ Key Features

- ~Milestone-based escrow~ — fund and release project step-by-step  
- ~Pull payment model~ — freelancers withdraw earned funds themselves (safer than push payouts)  
- ~Dispute mechanism~ — cancellation requests, freelancer confirmations, and owner resolution  
- ~Platform fee system~ — configurable by owner (10 bps = 0.1%)  
- Multi-token support — works with AVAX + ERC20 tokens  
- Admin controls — pause/unpause, update treasury, adjust fee rates  

---

## 🛠️ Tech Stack

- **Smart Contracts**: Solidity, Hardhat, OpenZeppelin  
- **Frontend**: React, Vite, TailwindCSS  
- **Web3 Integration**: Wagmi, RainbowKit, Viem  
- **Deployment**: Avalanche Fuji Testnet  
- **Infra Roadmap**: IPFS/Arweave for storage, Cross-chain bridges, Oracles  

---

## 📦 Project Structure

    mintaro-escrow-mvp/
    ├── contracts/          # Solidity smart contracts
    ├── script/             # Deployment + automation scripts
    ├── test/               # Hardhat test cases
    ├── deployments/        # Saved deployment addresses
    ├── frontend/           # React + Vite dApp
    │   ├── src/            # Components, hooks, UI
    │   └── public/         # Static assets
    └── .gitignore

---

## 🚀 Getting Started

### 1. Smart Contracts

Install dependencies:

    npm install

Compile:

    npx hardhat compile

Deploy locally:

    npx hardhat node
    npx hardhat run script/deploy.js --network localhost

Deploy to Fuji testnet:

    npx hardhat run script/deploy.js --network fuji

> Configure `.env` with ~FUJI_RPC_URL~, ~PRIVATE_KEY~, ~FEE_TREASURY~.

---

### 2. Frontend

Move into frontend and install:

    cd frontend
    npm install

Start dev server:

    npm run dev

Build for production:

    npm run build

Required env variables in ~frontend/.env~:

    VITE_WALLETCONNECT_PROJECT_ID=your_project_id

---

## 🔗 Deployed Contract (Fuji Testnet)

- Address: ~0x52EF27e7E2800f7E186d15D1Cd122F7a020338DF~  
- Explorer: https://testnet.snowtrace.io/address/0x52EF27e7E2800f7E186d15D1Cd122F7a020338DF  

---

## 📖 Example Flow

1. Client creates escrow with milestones + deposits funds  
2. Freelancer completes work → submits for approval  
3. Client approves milestone → freelancer balance updates  
4. Freelancer withdraws funds anytime  
5. Disputes: client requests cancel → freelancer confirms OR owner resolves  

---

## 🧩 Roadmap

- ~Reputation system~ — combined on-chain scoring + off-chain verifiable proof  
- ~DAO governance~ — community-driven fee & treasury settings  
- ~Cross-chain escrow~ — Avalanche ↔ Ethereum ↔ L2 support  
- ~AI integration~ — automatic milestone verification, fraud detection  
- ~Advanced dispute resolution~ — third-party arbitrators + DAO voting  
- ~Fiat on/off ramps~ — smoother Web2 → Web3 user experience  
- ~Mobile-first dApp~ — freelancers/clients manage work on-the-go  

---

## ⚖️ License

MIT License. See LICENSE for details.
