import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useContractRead } from "wagmi";
import { MINTARO_ADDRESS, MINTARO_ABI } from "./contracts";
import "@rainbow-me/rainbowkit/styles.css";

import EscrowDemo from "@/pages/EscrowDemo";
// import EscrowFlows from "@/features/escrow/Flows"; // <- remove for now

export default function App() {
  const { data: feeBps } = useContractRead({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "feeBps",
    chainId: 43113,
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="p-4 border-b flex justify-between items-center">
        <h1 className="text-2xl font-bold">Mintaro — Milestone Escrow (Fuji)</h1>
        <ConnectButton />
      </div>

      <div className="p-4">
        <p className="mb-4">Platform Fee: {feeBps !== undefined ? `${feeBps} bps` : "Loading..."}</p>
        <EscrowDemo />
      </div>
    </div>
  );
}
