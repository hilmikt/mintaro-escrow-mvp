// src/App.jsx
import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useContractRead } from "wagmi";
import { MINTARO_ADDRESS, MINTARO_ABI } from "./contracts";
import "@rainbow-me/rainbowkit/styles.css";
import { Toaster } from "sonner"; // NEW

import EscrowDemo from "@/pages/EscrowDemo"; // render ONE main page

export default function App() {
  const { data: feeBps } = useContractRead({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "feeBps",
    chainId: 43113,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white text-gray-900">
      {/* Toasts */}
      <Toaster position="top-center" richColors />  {/* NEW */}

      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold">Mintaro — Milestone Escrow (Fuji)</h1>
          <ConnectButton />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 py-6 space-y-2">
        <p className="text-sm text-gray-600">
          Platform Fee: {feeBps !== undefined ? `${feeBps} bps` : "Loading..."}
        </p>

        <EscrowDemo />
      </main>

      {/* Footer (optional) */}
      <footer className="mt-8 mb-6 text-center text-xs text-gray-500">
        Avalanche Fuji • Mintaro MVP
      </footer>
    </div>
  );
}
