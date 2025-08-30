import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import {
  MINTARO_ADDRESS,
  MINTARO_ABI,
  ZERO_ADDRESS, // ensure this exists in src/contracts/index.(ts|js)
} from "@/contracts";

function Section({ title, children }) {
  return (
    <section className="mint-card mb-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

const toLower = (a) => (a ? a.toLowerCase() : a);

export default function EscrowDemo() {
  const { address } = useAccount();

  // ---------- Role tab ----------
  // "client" | "freelancer"
  const [roleTab, setRoleTab] = useState("client");

  // ---------- Local UI state ----------
  const [freelancer, setFreelancer] = useState("");
  const [milestones, setMilestones] = useState([{ amount: "0.05", title: "Design" }]);

  const [escrowId, setEscrowId] = useState(""); // user-entered escrow id
  const escrowIdBig = escrowId ? BigInt(escrowId) : undefined;

  const [fundTotal, setFundTotal] = useState("");
  const [approveIndex, setApproveIndex] = useState(0);

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

  // Escrow info (for role auto-detect + read panel)
  const { data: escrowBasic } = useReadContract({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "getEscrowBasic",
    args: escrowIdBig !== undefined ? [escrowIdBig] : undefined,
    query: { enabled: escrowIdBig !== undefined },
  });

  // Freelancer pending native balance
  const { data: pendingNative = 0n } = useReadContract({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "pending",
    args: address ? [ZERO_ADDRESS, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  // ---------- Auto-detect role from escrowId ----------
  useEffect(() => {
    if (!escrowBasic || !address) return;
    const [clientAddr, freelancerAddr] = [escrowBasic[0], escrowBasic[1]];
    if (toLower(clientAddr) === toLower(address)) setRoleTab("client");
    else if (toLower(freelancerAddr) === toLower(address)) setRoleTab("freelancer");
  }, [escrowBasic, address]);

  // ---------- Writes / tx state ----------
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess: isMined } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isMining;

  // ---------- UI helpers ----------
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
  function onCreateEscrow() {
    if (!freelancer || milestones.length === 0) return;
    const amounts = milestones.map((m) => parseEther(m.amount || "0"));
    const titles = milestones.map((m) => m.title || "");
    const dueDates = milestones.map(() => 0);
    writeContract(
      {
        address: MINTARO_ADDRESS,
        abi: MINTARO_ABI,
        functionName: "createEscrow",
        args: [freelancer, ZERO_ADDRESS, amounts, titles, dueDates],
      },
      { onError: (e) => alert(e?.shortMessage || e.message) }
    );
  }

  function onFundEscrow() {
    if (!escrowIdBig || !fundTotal) return;
    writeContract(
      {
        address: MINTARO_ADDRESS,
        abi: MINTARO_ABI,
        functionName: "fundEscrow",
        args: [escrowIdBig, parseEther(fundTotal)],
        value: parseEther(fundTotal),
      },
      { onError: (e) => alert(e?.shortMessage || e.message) }
    );
  }

  function onApproveMilestone() {
    if (!escrowIdBig) return;
    writeContract(
      {
        address: MINTARO_ADDRESS,
        abi: MINTARO_ABI,
        functionName: "approveMilestone",
        args: [escrowIdBig, BigInt(approveIndex)],
      },
      { onError: (e) => alert(e?.shortMessage || e.message) }
    );
  }

  function onWithdrawNative() {
    writeContract(
      {
        address: MINTARO_ADDRESS,
        abi: MINTARO_ABI,
        functionName: "withdrawNative",
        args: [],
      },
      { onError: (e) => alert(e?.shortMessage || e.message) }
    );
  }

  // ---------- UI ----------
  return (
    <div className="space-y-6">
      {/* Role toggle */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-2xl border p-1 bg-white shadow-sm">
          <button
            onClick={() => setRoleTab("client")}
            className={`px-4 py-1.5 rounded-xl text-sm ${
              roleTab === "client" ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            Client
          </button>
          <button
            onClick={() => setRoleTab("freelancer")}
            className={`px-4 py-1.5 rounded-xl text-sm ${
              roleTab === "freelancer" ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            Freelancer
          </button>
        </div>
        <div className="text-xs text-gray-500">
          Connected: <span className="font-mono">{address ?? "—"}</span> • Fee:{" "}
          {String(feeBps ?? "—")} bps
        </div>
      </div>

      {/* CLIENT VIEW */}
      {roleTab === "client" && (
        <>
          <Section title="1) Create Escrow (as CLIENT)">
            <div className="grid gap-3">
              <label className="mint-label">Freelancer Address</label>
              <input
                className="mint-input"
                placeholder="0x..."
                value={freelancer}
                onChange={(e) => setFreelancer(e.target.value)}
              />

              <div className="mint-label mt-2">Milestones (AVAX amounts)</div>
              <div className="space-y-2">
                {milestones.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="mint-input w-32"
                      placeholder="0.05"
                      value={m.amount}
                      onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                    />
                    <input
                      className="mint-input flex-1"
                      placeholder={`Milestone ${i + 1}`}
                      value={m.title}
                      onChange={(e) => updateMilestone(i, "title", e.target.value)}
                    />
                    <button
                      type="button"
                      className="rounded-xl border px-3"
                      onClick={() => removeMilestone(i)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-xl border px-3 py-2"
                  onClick={addMilestone}
                >
                  + Add Milestone
                </button>
                <div className="text-sm text-gray-600">
                  Total: <b>{totalAllocated.toFixed(4)} AVAX</b>
                </div>
              </div>

              <button
                className="mint-button mt-2"
                onClick={onCreateEscrow}
                disabled={!freelancer || milestones.length === 0 || busy}
              >
                {busy ? "Submitting..." : "Create Escrow"}
              </button>
              {isMined && (
                <div className="text-green-600 text-sm">Txn confirmed ✅</div>
              )}
            </div>
          </Section>

          <Section title="2) Fund Escrow (as CLIENT)">
            <div className="grid gap-3">
              <label className="mint-label">Escrow ID</label>
              <input
                className="mint-input w-40"
                placeholder="1"
                value={escrowId}
                onChange={(e) => setEscrowId(e.target.value)}
              />
              <label className="mint-label">
                Total (must equal sum of milestones)
              </label>
              <input
                className="mint-input w-40"
                placeholder="0.20"
                value={fundTotal}
                onChange={(e) => setFundTotal(e.target.value)}
              />

              <button
                className="mint-button mt-2"
                onClick={onFundEscrow}
                disabled={!escrowId || !fundTotal || busy}
              >
                {busy ? "Submitting..." : "Fund (AVAX)"}
              </button>
            </div>
          </Section>

          <Section title="3) Approve Milestone (as CLIENT)">
            <div className="grid gap-3">
              <div className="text-sm text-gray-600">
                Milestones in this escrow:{" "}
                <b>
                  {escrowBasic ? Number(escrowBasic[7]) : "—"}
                </b>
              </div>
              <label className="mint-label">Milestone Index</label>
              <input
                className="mint-input w-28"
                type="number"
                min={0}
                value={approveIndex}
                onChange={(e) =>
                  setApproveIndex(parseInt(e.target.value || "0", 10))
                }
              />
              <button
                className="mint-button mt-2"
                onClick={onApproveMilestone}
                disabled={!escrowId || busy}
              >
                {busy ? "Submitting..." : "Approve Milestone"}
              </button>
            </div>
          </Section>
        </>
      )}

      {/* FREELANCER VIEW */}
      {roleTab === "freelancer" && (
        <>
          <Section title="Your Withdrawable Balance (AVAX)">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                {address ? (
                  <>
                    Address: <span className="font-mono">{address}</span>
                  </>
                ) : (
                  "Connect wallet"
                )}
              </div>
              <div className="text-base font-semibold">
                {formatEther(pendingNative || 0n)} AVAX
              </div>
            </div>
            <button
              className="mint-button mt-3"
              onClick={onWithdrawNative}
              disabled={busy || (pendingNative || 0n) === 0n}
            >
              {busy ? "Submitting..." : "Withdraw AVAX"}
            </button>
            <div className="text-xs text-gray-500 mt-2">
              Tip: Use a second wallet as the Freelancer when testing.
            </div>
          </Section>

          <Section title="Lookup Escrow (optional)">
            <div className="grid gap-3">
              <label className="mint-label">Escrow ID</label>
              <input
                className="mint-input w-40"
                placeholder="1"
                value={escrowId}
                onChange={(e) => setEscrowId(e.target.value)}
              />
              {escrowBasic && (
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
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
