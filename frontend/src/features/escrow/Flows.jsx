// src/features/escrow/Flows.jsx
import React, { useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, zeroAddress } from "viem";

import fuji from "../../contracts/fuji.json";
import abiFile from "../../contracts/MintaroEscrow.json";

const ADDRESS = fuji.address;
const ABI = abiFile.abi;
const ZERO = zeroAddress; // 0x000...000

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border p-5 shadow-sm mb-6">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function TxStatus({ hash, isLoading, isSuccess, isError, error }) {
  return (
    <div className="mt-2 text-sm">
      {isLoading && <div>⏳ Waiting for confirmation…</div>}
      {isSuccess && <div>✅ Confirmed! {hash && <a className="underline" href={`https://testnet.snowtrace.io/tx/${hash}`} target="_blank" rel="noreferrer">View on Snowtrace</a>}</div>}
      {isError && <div className="text-red-600">⚠️ {error?.shortMessage || error?.message}</div>}
    </div>
  );
}

/** -------------------------
 * Create Escrow (client)
 * ------------------------- */
export function CreateEscrowSection({ onCreatedId }) {
  const [freelancer, setFreelancer] = useState("");
  const [token, setToken] = useState(ZERO); // AVAX by default
  const [rows, setRows] = useState([{ amount: "", title: "" }]);

  const amountsWei = useMemo(() => {
    try {
      return rows.map(r => parseEther((r.amount || "0").trim() || "0"));
    } catch {
      return [];
    }
  }, [rows]);

  const dueDates = useMemo(() => rows.map(() => 0), [rows]);
  const titles = useMemo(() => rows.map(r => (r.title ?? "")), [rows]);

  const total = useMemo(() => {
    try {
      const sum = amountsWei.reduce((acc, x) => acc + x, 0n);
      return { wei: sum, avax: formatEther(sum) };
    } catch {
      return { wei: 0n, avax: "0" };
    }
  }, [amountsWei]);

  // Read nextEscrowId so we can show the ID that will be created
  const { data: nextId } = useReadContract({
    address: ADDRESS,
    abi: ABI,
    functionName: "nextEscrowId",
  });

  const { writeContract, data: hash, error, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const addRow = () => setRows(prev => [...prev, { amount: "", title: "" }]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i, key, val) => setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const canSubmit =
    freelancer &&
    freelancer.startsWith("0x") &&
    rows.length > 0 &&
    amountsWei.length === rows.length &&
    amountsWei.every(x => x > 0n);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      await writeContract({
        address: ADDRESS,
        abi: ABI,
        functionName: "createEscrow",
        args: [freelancer, token, amountsWei, titles, dueDates],
      });
      // Predict created ID from nextEscrowId (it increments inside create)
      if (typeof onCreatedId === "function" && typeof nextId === "bigint") {
        onCreatedId(nextId); // the new escrow will be `nextId`
      }
    // eslint-disable-next-line no-unused-vars
    } catch (_) { /* handled by error state */ }
  };

  return (
    <Section title="1) Create Escrow (client)">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Freelancer Address</label>
          <input className="input input-bordered w-full p-2 border rounded" placeholder="0x..." value={freelancer} onChange={e => setFreelancer(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium">Token</label>
          <select className="input input-bordered w-full p-2 border rounded" value={token} onChange={e => setToken(e.target.value)}>
            <option value={ZERO}>AVAX (native)</option>
            {/* Later you can add ERC-20 token addresses here */}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Milestones</span>
            <button type="button" onClick={addRow} className="text-blue-600 underline">+ Add milestone</button>
          </div>

          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input className="col-span-3 p-2 border rounded" placeholder="Amount (AVAX)" value={r.amount} onChange={e => updateRow(i, "amount", e.target.value)} />
              <input className="col-span-8 p-2 border rounded" placeholder="Title (short)" value={r.title} onChange={e => updateRow(i, "title", e.target.value)} />
              <button type="button" className="col-span-1 text-red-600" onClick={() => removeRow(i)}>✕</button>
            </div>
          ))}
        </div>

        <div className="text-sm">
          <div>Total (AVAX): <span className="font-mono">{total.avax}</span></div>
          {typeof nextId === "bigint" && (
            <div className="opacity-80">Next escrow will be ID <b>{nextId.toString()}</b></div>
          )}
        </div>

        <button disabled={!canSubmit || isPending} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
          {isPending ? "Creating..." : "Create Escrow"}
        </button>
      </form>

      <TxStatus
        hash={hash}
        isLoading={receipt.isLoading}
        isSuccess={receipt.isSuccess}
        isError={receipt.isError}
        error={error || receipt.error}
      />
    </Section>
  );
}

/** -------------------------
 * Fund Escrow (client, AVAX)
 * ------------------------- */
export function FundEscrowSection() {
  const [escrowIdInput, setEscrowIdInput] = useState("");
  const id = useMemo(() => {
    try { return BigInt(escrowIdInput || "0"); } catch { return 0n; }
  }, [escrowIdInput]);

  // Read totalAllocated to auto-fill correct amount (strict funding)
  const { data: basic } = useReadContract({
    address: ADDRESS,
    abi: ABI,
    functionName: "getEscrowBasic",
    args: id > 0n ? [id] : undefined,
    query: { enabled: id > 0n },
  });

  const totalAllocatedWei = useMemo(() => (Array.isArray(basic) ? basic[4] : 0n), [basic]);
  const totalAllocatedAvax = useMemo(() => formatEther(totalAllocatedWei || 0n), [totalAllocatedWei]);

  const { writeContract, data: hash, error, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const onFund = async () => {
    if (id <= 0n || !totalAllocatedWei || totalAllocatedWei === 0n) return;
    try {
      await writeContract({
        address: ADDRESS,
        abi: ABI,
        functionName: "fundEscrow",
        args: [id, totalAllocatedWei],
        value: totalAllocatedWei, // AVAX path
      });
    // eslint-disable-next-line no-empty
    } catch {} 
  };

  return (
    <Section title="2) Fund Escrow (client, AVAX)">
      <div className="grid gap-3">
        <div>
          <label className="block text-sm font-medium">Escrow ID</label>
          <input className="p-2 border rounded w-full" placeholder="e.g. 1" value={escrowIdInput} onChange={e => setEscrowIdInput(e.target.value)} />
        </div>
        <div className="text-sm">Total required: <b>{totalAllocatedAvax}</b> AVAX</div>
        <button onClick={onFund} disabled={id <= 0n || !totalAllocatedWei || isPending} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
          {isPending ? "Funding..." : "Fund Full Amount"}
        </button>
        <TxStatus
          hash={hash}
          isLoading={receipt.isLoading}
          isSuccess={receipt.isSuccess}
          isError={receipt.isError}
          error={error || receipt.error}
        />
      </div>
    </Section>
  );
}

/** -------------------------
 * Approve Milestone (client)
 * ------------------------- */
export function ApproveMilestoneSection() {
  const [escrowIdInput, setEscrowIdInput] = useState("");
  const [indexInput, setIndexInput] = useState("0");

  const id = useMemo(() => {
    try { return BigInt(escrowIdInput || "0"); } catch { return 0n; }
  }, [escrowIdInput]);
  const idx = useMemo(() => {
    try { return BigInt(indexInput || "0"); } catch { return 0n; }
  }, [indexInput]);

  const { writeContract, data: hash, error, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const onApprove = async () => {
    if (id <= 0n) return;
    try {
      await writeContract({
        address: ADDRESS,
        abi: ABI,
        functionName: "approveMilestone",
        args: [id, idx],
      });
    // eslint-disable-next-line no-unused-vars, no-empty
    } catch (_) {}
  };

  return (
    <Section title="3) Approve Milestone (client)">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">Escrow ID</label>
          <input className="p-2 border rounded w-full" value={escrowIdInput} onChange={e => setEscrowIdInput(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Milestone Index</label>
          <input className="p-2 border rounded w-full" value={indexInput} onChange={e => setIndexInput(e.target.value)} />
        </div>
      </div>
      <button onClick={onApprove} disabled={id <= 0n || isPending} className="mt-3 px-4 py-2 rounded bg-black text-white disabled:opacity-50">
        {isPending ? "Approving..." : "Approve"}
      </button>
      <TxStatus
        hash={hash}
        isLoading={receipt.isLoading}
        isSuccess={receipt.isSuccess}
        isError={receipt.isError}
        error={error || receipt.error}
      />
    </Section>
  );
}

/** -------------------------
 * Withdraw (freelancer, AVAX)
 * ------------------------- */
export function WithdrawSection() {
  const { address } = useAccount();

  // pending(address token, address account) -> amount
  const { data: withdrawableWei } = useReadContract({
    address: ADDRESS,
    abi: ABI,
    functionName: "pending",
    args: [ZERO, address ?? ZERO],
    query: { enabled: Boolean(address) },
  });

  const withdrawableAvax = useMemo(() => formatEther((withdrawableWei ?? 0n)), [withdrawableWei]);

  const { writeContract, data: hash, error, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const onWithdraw = async () => {
    try {
      await writeContract({
        address: ADDRESS,
        abi: ABI,
        functionName: "withdrawNative",
      });
    // eslint-disable-next-line no-unused-vars
    } catch (_) { /* empty */ }
  };

  return (
    <Section title="4) Withdraw (freelancer, AVAX)">
      <div className="text-sm mb-2">Your withdrawable: <b>{withdrawableAvax}</b> AVAX</div>
      <button onClick={onWithdraw} disabled={!address || (withdrawableWei ?? 0n) === 0n || isPending} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
        {isPending ? "Withdrawing..." : "Withdraw AVAX"}
      </button>
      <TxStatus
        hash={hash}
        isLoading={receipt.isLoading}
        isSuccess={receipt.isSuccess}
        isError={receipt.isError}
        error={error || receipt.error}
      />
    </Section>
  );
}

/** -------------------------
 * Composite page
 * ------------------------- */
export default function EscrowFlows() {
  const [createdId, setCreatedId] = useState(null);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <CreateEscrowSection onCreatedId={(id) => setCreatedId(id?.toString?.() || null)} />
      <FundEscrowSection />
      <ApproveMilestoneSection />
      <WithdrawSection />

      {createdId && (
        <div className="mt-6 p-3 rounded bg-green-50 border text-sm">
          🎉 Escrow created! Use ID <b>{createdId}</b> in the panels above.
        </div>
      )}
      <div className="mt-6 text-xs opacity-70">
        Tip: Use two wallets for demo — Wallet A as Client (create/fund/approve), Wallet B as Freelancer (withdraw).
      </div>
    </div>
  );
}
