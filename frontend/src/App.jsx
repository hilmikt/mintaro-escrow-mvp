import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useContractRead } from "wagmi";
import { MINTARO_ADDRESS, MINTARO_ABI } from "./contracts";
import "@rainbow-me/rainbowkit/styles.css";

import EscrowDemo from "@/pages/EscrowDemo";
// If you still have EscrowFlows, render only ONE page to avoid duplicates
// import EscrowFlows from "@/features/escrow/Flows";

export default function App() {
  const { data: feeBps } = useContractRead({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "feeBps",
    chainId: 43113,
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold">Mintaro — Milestone Escrow (Fuji)</h1>
          <ConnectButton />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        <p className="mb-4 text-sm text-gray-600">
          Platform Fee: {feeBps !== undefined ? `${feeBps} bps` : "Loading..."}
        </p>

        <EscrowDemo />
        {/* Or: <EscrowFlows /> (but not both) */}
      </main>
    </div>
  );
}
