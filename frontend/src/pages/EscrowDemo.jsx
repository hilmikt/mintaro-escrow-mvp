import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { MINTARO_ADDRESS, MINTARO_ABI, ZERO_ADDRESS } from "@/contracts";

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm mb-6">
      <div className="font-semibold text-lg mb-3">{title}</div>
      {children}
    </div>
  );
}

export default function EscrowDemo() {
  const { address } = useAccount();

  // ---------- Local UI state ----------
  const [freelancer, setFreelancer] = useState("");
  const [milestones, setMilestones] = useState([{ amount: "0.05", title: "Design" }]);
  const [escrowId, setEscrowId] = useState("");         // string for input
  const [fundTotal, setFundTotal] = useState("");       // computed or typed
  const [approveIndex, setApproveIndex] = useState(0);  // number

  // ---------- Derived totals ----------
  const totalAllocated = useMemo(
    () => milestones.reduce((sum, m) => sum + (parseFloat(m.amount || "0") || 0), 0),
    [milestones]
  );

  useEffect(() => setFundTotal(totalAllocated ? String(totalAllocated) : ""), [totalAllocated]);

  // ---------- Reads ----------
  const { data: feeBps } = useReadContract({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "feeBps",
  });

  const escrowIdBig = escrowId ? BigInt(escrowId) : undefined;

  const { data: escrowBasic } = useReadContract({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "getEscrowBasic",
    args: escrowIdBig !== undefined ? [escrowIdBig] : undefined,
    query: { enabled: escrowIdBig !== undefined },
  });

  const { data: milestonesCount } = useReadContract({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "getMilestonesCount",
    args: escrowIdBig !== undefined ? [escrowIdBig] : undefined,
    query: { enabled: escrowIdBig !== undefined },
  });

  // ---------- Writes ----------
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess: isMined } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Helpers
  const busy = isPending || isMining;

  function addMilestone() {
    setMilestones([...milestones, { amount: "0.05", title: `M${milestones.length + 1}` }]);
  }
  function updateMilestone(i, key, val) {
    const next = milestones.slice();
    next[i] = { ...next[i], [key]: val };
    setMilestones(next);
  }
  function removeMilestone(i) {
    const next = milestones.slice();
    next.splice(i, 1);
    setMilestones(next);
  }

  // ---------- Actions ----------
  async function onCreateEscrow() {
    if (!freelancer || milestones.length === 0) return;
    const amounts = milestones.map((m) => parseEther(m.amount || "0"));
    const titles = milestones.map((m) => m.title || "");
    const dueDates = milestones.map(() => 0); // MVP: informational only

    writeContract({
      address: MINTARO_ADDRESS,
      abi: MINTARO_ABI,
      functionName: "createEscrow",
      args: [freelancer, ZERO_ADDRESS, amounts, titles, dueDates],
    }, {
      onSuccess: () => console.log("createEscrow submitted"),
      onError: (e) => alert(e?.shortMessage || e.message),
    });
  }

  async function onFundEscrow() {
    if (!escrowIdBig || !fundTotal) return;
    writeContract({
      address: MINTARO_ADDRESS,
      abi: MINTARO_ABI,
      functionName: "fundEscrow",
      args: [escrowIdBig, parseEther(fundTotal)],
      value: parseEther(fundTotal), // AVAX funding path
    }, {
      onSuccess: () => console.log("fundEscrow submitted"),
      onError: (e) => alert(e?.shortMessage || e.message),
    });
  }

  async function onApproveMilestone() {
    if (!escrowIdBig) return;
    writeContract({
      address: MINTARO_ADDRESS,
      abi: MINTARO_ABI,
      functionName: "approveMilestone",
      args: [escrowIdBig, BigInt(approveIndex)],
    }, {
      onSuccess: () => console.log("approveMilestone submitted"),
      onError: (e) => alert(e?.shortMessage || e.message),
    });
  }

  async function onWithdrawNative() {
    writeContract({
      address: MINTARO_ADDRESS,
      abi: MINTARO_ABI,
      functionName: "withdrawNative",
      args: [],
    }, {
      onSuccess: () => console.log("withdrawNative submitted"),
      onError: (e) => alert(e?.shortMessage || e.message),
    });
  }

  // ---------- UI ----------
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Mintaro — Escrow Demo (Fuji)</h1>
      <div className="text-sm opacity-80">
        Connected: <span className="font-mono">{address ?? "—"}</span> • Fee: {String(feeBps ?? "—")} bps
      </div>

      <Section title="1) Create Escrow (as CLIENT)">
        <div className="grid gap-3">
          <label className="text-sm">Freelancer Address</label>
          <input
            className="border rounded px-3 py-2"
            placeholder="0x..."
            value={freelancer}
            onChange={(e) => setFreelancer(e.target.value)}
          />

          <div className="text-sm mt-2 font-medium">Milestones (AVAX amounts)</div>
          <div className="space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="border rounded px-3 py-2 w-32"
                  placeholder="0.05"
                  value={m.amount}
                  onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                />
                <input
                  className="border rounded px-3 py-2 flex-1"
                  placeholder={`Milestone ${i + 1}`}
                  value={m.title}
                  onChange={(e) => updateMilestone(i, "title", e.target.value)}
                />
                <button className="px-3 rounded border" onClick={() => removeMilestone(i)}>✕</button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button className="px-3 py-2 rounded border" onClick={addMilestone}>+ Add Milestone</button>
            <div className="text-sm">Total: <b>{totalAllocated.toFixed(4)} AVAX</b></div>
          </div>

          <button
            className="mt-2 px-4 py-2 rounded-2xl bg-black text-white disabled:opacity-50"
            onClick={onCreateEscrow}
            disabled={!freelancer || milestones.length === 0 || busy}
          >
            {busy ? "Submitting..." : "Create Escrow"}
          </button>
          {isMined && <div className="text-green-600 text-sm">Txn confirmed ✅</div>}
        </div>
      </Section>

      <Section title="2) Fund Escrow (as CLIENT)">
        <div className="grid gap-3">
          <label className="text-sm">Escrow ID</label>
          <input
            className="border rounded px-3 py-2 w-40"
            placeholder="1"
            value={escrowId}
            onChange={(e) => setEscrowId(e.target.value)}
          />
          <label className="text-sm">Total (must equal sum of milestones)</label>
          <input
            className="border rounded px-3 py-2 w-40"
            placeholder="0.20"
            value={fundTotal}
            onChange={(e) => setFundTotal(e.target.value)}
          />
          <button
            className="mt-2 px-4 py-2 rounded-2xl bg-black text-white disabled:opacity-50"
            onClick={onFundEscrow}
            disabled={!escrowId || !fundTotal || busy}
          >
            {busy ? "Submitting..." : "Fund (AVAX)"}
          </button>
        </div>
      </Section>

      <Section title="3) Approve Milestone (as CLIENT)">
        <div className="grid gap-3">
          <div className="text-sm">Milestones in this escrow: <b>{String(milestonesCount ?? "—")}</b></div>
          <label className="text-sm">Milestone Index</label>
          <input
            className="border rounded px-3 py-2 w-40"
            type="number"
            min={0}
            value={approveIndex}
            onChange={(e) => setApproveIndex(parseInt(e.target.value || "0", 10))}
          />
          <button
            className="mt-2 px-4 py-2 rounded-2xl bg-black text-white disabled:opacity-50"
            onClick={onApproveMilestone}
            disabled={!escrowId || busy}
          >
            {busy ? "Submitting..." : "Approve Milestone"}
          </button>
        </div>
      </Section>

      <Section title="4) Withdraw (as FREELANCER)">
        <button
          className="px-4 py-2 rounded-2xl bg-black text-white disabled:opacity-50"
          onClick={onWithdrawNative}
          disabled={busy}
        >
          {busy ? "Submitting..." : "Withdraw AVAX"}
        </button>
        <div className="text-xs opacity-80 mt-2">
          Tip: Switch MetaMask to the freelancer wallet before clicking.
        </div>
      </Section>

      {escrowBasic && (
        <Section title="Escrow Status (read-only)">
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
            {JSON.stringify({
              client: escrowBasic[0],
              freelancer: escrowBasic[1],
              token: escrowBasic[2],
              totalDeposited: formatEther(escrowBasic[3] || 0n),
              totalAllocated: formatEther(escrowBasic[4] || 0n),
              totalReleased: formatEther(escrowBasic[5] || 0n),
              state: Number(escrowBasic[6]),
              milestonesCount: Number(escrowBasic[7]),
            }, null, 2)}
          </pre>
        </Section>
      )}
    </div>
  );
}
