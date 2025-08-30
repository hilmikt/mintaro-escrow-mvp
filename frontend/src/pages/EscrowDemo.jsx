// src/pages/EscrowDemo.jsx
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, formatEther, parseEventLogs } from "viem";
import { MINTARO_ADDRESS, MINTARO_ABI, ZERO_ADDRESS } from "@/contracts";
import { toast } from "sonner"; // NEW

/* ---------- tiny helpers ---------- */
const toLower = (a) => (a ? a.toLowerCase() : a);
const isEthAddress = (s) => /^0x[a-fA-F0-9]{40}$/.test(s || "");
const ESCROW_STATE = [
  "Created",
  "Funded",
  "InProgress",
  "Completed",
  "CancelRequested",
  "Canceled",
  "Disputed",
];

/* ---------- UI bits ---------- */
function Stepper({ step }) {
  const steps = [
    { n: 1, label: "Create" },
    { n: 2, label: "Fund" },
    { n: 3, label: "Approve" },
    { n: 4, label: "Withdraw" },
  ];
  return (
    <div className="mb-6 flex items-center gap-3 justify-center">
      {steps.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shadow-sm transition ${
                done
                  ? "bg-red-500 text-white"
                  : active
                  ? "bg-red-400 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
              title={s.label}
            >
              {done ? "✓" : s.n}
            </div>
            <span
              className={`text-sm ${
                active ? "text-red-600 font-medium" : "text-gray-500"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-10 bg-gray-300 mx-2" />}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children, extra }) {
  return (
    <section className="mint-card mb-8">
      <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Pill({ label, tone }) {
  const style =
    tone === "green"
      ? "bg-green-100 text-green-700"
      : tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : tone === "yellow"
      ? "bg-yellow-100 text-yellow-700"
      : tone === "red"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-700";
  return <span className={`text-xs px-2 py-0.5 rounded-full ${style}`}>{label}</span>;
}

/* ---------- Main ---------- */
export default function EscrowDemo() {
  const { address } = useAccount();

  // role toggle
  const [roleTab, setRoleTab] = useState("client");

  // create state
  const [freelancer, setFreelancer] = useState("");
  const [milestones, setMilestones] = useState([{ amount: "0.05", title: "Design" }]);

  // shared state
  const [escrowId, setEscrowId] = useState("");
  const [approveIndex, setApproveIndex] = useState(0);
  const escrowIdBig = escrowId ? BigInt(escrowId) : undefined;

  // derived totals
  const totalAllocated = useMemo(
    () => milestones.reduce((sum, m) => sum + (parseFloat(m.amount || "0") || 0), 0),
    [milestones]
  );
  const totalStr = totalAllocated ? String(totalAllocated) : "";

  // reads
  const { data: feeBps } = useReadContract({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "feeBps",
  });

  const { data: escrowBasic } = useReadContract({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "getEscrowBasic",
    args: escrowIdBig !== undefined ? [escrowIdBig] : undefined,
    query: { enabled: escrowIdBig !== undefined },
  });

  const { data: pendingNative = 0n } = useReadContract({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "pending",
    args: address ? [ZERO_ADDRESS, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  // auto role detection
  useEffect(() => {
    if (!escrowBasic || !address) return;
    const [clientAddr, freelancerAddr] = [escrowBasic[0], escrowBasic[1]];
    if (toLower(clientAddr) === toLower(address)) setRoleTab("client");
    else if (toLower(freelancerAddr) === toLower(address)) setRoleTab("freelancer");
  }, [escrowBasic, address]);

  // writers
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { data: receipt, isSuccess: isMined, isLoading: isMining } =
    useWaitForTransactionReceipt({ hash: txHash });
  const [pendingAction, setPendingAction] = useState(null);
  const busy = isPending || isMining;

  // harvest created escrowId from event
  useEffect(() => {
    if (!isMined || !receipt) return;
    if (pendingAction === "create") {
      try {
        const logs = parseEventLogs({
          abi: MINTARO_ABI,
          logs: receipt.logs,
          eventName: "EscrowCreated",
        });
        const evt = logs?.[0];
        if (evt?.args?.id) setEscrowId(String(evt.args.id));
      } catch {}
    }
    setPendingAction(null);
  }, [isMined, receipt, pendingAction, setEscrowId, MINTARO_ABI]);

  // step logic
  const isCreated = Boolean(escrowId);
  const totalDeposited = escrowBasic?.[3] ?? 0n;
  const totalAllocatedBn = escrowBasic?.[4] ?? 0n;
  const isFunded = Boolean(escrowBasic && totalAllocatedBn > 0n && totalDeposited === totalAllocatedBn);
  let step = 1;
  if (isCreated && !isFunded) step = 2;
  if (isFunded) step = 3;

  // inline validation
  const badFreelancer = freelancer && !isEthAddress(freelancer);
  const badAmounts =
    milestones.length === 0 ||
    milestones.some((m) => !m.amount || isNaN(Number(m.amount)) || Number(m.amount) <= 0);

  // handlers with toasts
  function onCreateEscrow() {
    if (badFreelancer || badAmounts) {
      toast.error("Fix the highlighted fields before creating.");
      return;
    }
    const amounts = milestones.map((m) => parseEther(m.amount || "0"));
    const titles = milestones.map((m) => m.title || "");
    const dueDates = milestones.map(() => 0);

    const t = toast.loading("Creating escrow…");
    setPendingAction("create");
    writeContract(
      {
        address: MINTARO_ADDRESS,
        abi: MINTARO_ABI,
        functionName: "createEscrow",
        args: [freelancer, ZERO_ADDRESS, amounts, titles, dueDates],
      },
      {
        onError: (e) => toast.error(e?.shortMessage || e.message || "Create failed", { id: t }),
        onSuccess: (hash) => toast.success("Escrow tx submitted", { id: t, description: hash }),
      }
    );
  }

  function onFundEscrow() {
    if (!escrowIdBig) return toast.error("Enter a valid escrow ID.");
    const t = toast.loading("Funding escrow…");
    setPendingAction("fund");
    writeContract(
      {
        address: MINTARO_ADDRESS,
        abi: MINTARO_ABI,
        functionName: "fundEscrow",
        args: [escrowIdBig, parseEther(totalStr)],
        value: parseEther(totalStr),
      },
      {
        onError: (e) => toast.error(e?.shortMessage || e.message || "Funding failed", { id: t }),
        onSuccess: (hash) => toast.success("Funding tx submitted", { id: t, description: hash }),
      }
    );
  }

  function onApproveMilestone() {
    if (!escrowIdBig) return toast.error("Enter a valid escrow ID.");
    const t = toast.loading("Approving milestone…");
    setPendingAction("approve");
    writeContract(
      {
        address: MINTARO_ADDRESS,
        abi: MINTARO_ABI,
        functionName: "approveMilestone",
        args: [escrowIdBig, 0n + BigInt(approveIndex)],
      },
      {
        onError: (e) => toast.error(e?.shortMessage || e.message || "Approval failed", { id: t }),
        onSuccess: (hash) => toast.success("Approval tx submitted", { id: t, description: hash }),
      }
    );
  }

  function onWithdrawNative() {
    const t = toast.loading("Withdrawing AVAX…");
    setPendingAction("withdraw");
    writeContract(
      {
        address: MINTARO_ADDRESS,
        abi: MINTARO_ABI,
        functionName: "withdrawNative",
      },
      {
        onError: (e) => toast.error(e?.shortMessage || e.message || "Withdraw failed", { id: t }),
        onSuccess: (hash) => toast.success("Withdraw tx submitted", { id: t, description: hash }),
      }
    );
  }

  // UI helpers
  function addMilestone() {
    setMilestones((s) => [...s, { amount: "0.05", title: `M${s.length + 1}` }]);
  }
  function updateMilestone(i, key, val) {
    setMilestones((s) => {
      const next = s.slice();
      next[i] = { ...next[i], [key]: val };
      return next;
    });
  }
  function removeMilestone(i) {
    setMilestones((s) => {
      const next = s.slice();
      next.splice(i, 1);
      return next;
    });
  }

  // status pill (if escrow loaded)
  let statePill = null;
  if (escrowBasic) {
    const idx = Number(escrowBasic[6]);
    const label = ESCROW_STATE[idx] ?? "Unknown";
    const tone =
      label === "Completed" ? "green" :
      label === "InProgress" ? "blue" :
      label === "Funded" ? "yellow" :
      (label === "Canceled" || label === "Disputed") ? "red" : "gray";
    statePill = <Pill label={label} tone={tone} />;
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {/* role toggle */}
      <div className="flex items-center gap-2 mb-4 justify-between">
        <div className="inline-flex rounded-2xl border p-1 bg-white shadow-sm">
          <button
            onClick={() => setRoleTab("client")}
            className={`px-4 py-1.5 rounded-xl text-sm transition ${
              roleTab === "client" ? "bg-red-500 text-white shadow" : "hover:bg-red-50 text-gray-600"
            }`}
          >
            Client
          </button>
          <button
            onClick={() => setRoleTab("freelancer")}
            className={`px-4 py-1.5 rounded-xl text-sm transition ${
              roleTab === "freelancer" ? "bg-red-500 text-white shadow" : "hover:bg-red-50 text-gray-600"
            }`}
          >
            Freelancer
          </button>
        </div>
        <div className="text-xs text-gray-500">
          Connected: <span className="font-mono">{address ?? "—"}</span> • Fee: {String(feeBps ?? "—")} bps
        </div>
      </div>

      {roleTab === "client" && (
        <>
          <Section title="1) Create Escrow (as CLIENT)" extra={statePill}>
            <div className="grid gap-3">
              <label className="mint-label">Freelancer Address</label>
              <input
                className={`mint-input ${freelancer && !isEthAddress(freelancer) ? "border-red-400 ring-1 ring-red-200" : ""}`}
                placeholder="0x..."
                value={freelancer}
                onChange={(e) => setFreelancer(e.target.value)}
              />
              {freelancer && !isEthAddress(freelancer) && (
                <p className="text-xs text-red-600">Enter a valid 0x address.</p>
              )}

              <div className="mint-label mt-2">Milestones (AVAX amounts)</div>
              <div className="space-y-2">
                {milestones.map((m, i) => {
                  const bad = !m.amount || isNaN(Number(m.amount)) || Number(m.amount) <= 0;
                  return (
                    <div key={i} className="flex gap-2">
                      <input
                        className={`mint-input w-32 ${bad ? "border-red-400 ring-1 ring-red-200" : ""}`}
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
                      <button type="button" className="rounded-xl border px-3" onClick={() => removeMilestone(i)}>
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <button type="button" className="rounded-xl border px-3 py-2" onClick={addMilestone}>
                  + Add Milestone
                </button>
                <div className="text-sm text-gray-600">
                  Total: <b>{totalAllocated.toFixed(4)} AVAX</b>
                </div>
              </div>

              <button
                className="mint-button mt-2"
                onClick={onCreateEscrow}
                disabled={
                  busy ||
                  !freelancer ||
                  !isEthAddress(freelancer) ||
                  milestones.length === 0 ||
                  milestones.some((m) => !m.amount || Number(m.amount) <= 0) ||
                  isCreated
                }
              >
                {busy && pendingAction === "create"
                  ? "Submitting…"
                  : isCreated
                  ? "Created ✓"
                  : "Create Escrow"}
              </button>

              {isCreated && (
                <div className="text-xs text-gray-600">
                  Escrow ID: <span className="font-mono">{escrowId}</span>
                </div>
              )}
            </div>
          </Section>

          <Section title="2) Fund Escrow (as CLIENT)" extra={statePill}>
            <div className="grid gap-3">
              <label className="mint-label">Escrow ID</label>
              <input
                className="mint-input w-40"
                placeholder="1"
                value={escrowId}
                onChange={(e) => setEscrowId(e.target.value)}
              />
              <label className="mint-label">Total (must equal sum of milestones)</label>
              <input className="mint-input w-40" value={totalStr} readOnly />
              <button
                className="mint-button mt-2"
                onClick={onFundEscrow}
                disabled={!isCreated || !totalStr || busy || isFunded}
              >
                {busy && pendingAction === "fund" ? "Submitting…" : isFunded ? "Funded ✓" : "Fund (AVAX)"}
              </button>
            </div>
          </Section>

          <Section title="3) Approve Milestone (as CLIENT)" extra={statePill}>
            <div className="grid gap-3">
              <div className="text-sm text-gray-600">
                {isFunded ? "Escrow is fully funded — ready to approve." : "Approve enabled after full funding."}
              </div>
              <label className="mint-label">Milestone Index</label>
              <input
                className="mint-input w-28"
                type="number"
                min={0}
                value={approveIndex}
                onChange={(e) => setApproveIndex(parseInt(e.target.value || "0", 10))}
              />
              <button
                className="mint-button mt-2"
                onClick={onApproveMilestone}
                disabled={!isFunded || busy}
              >
                {busy && pendingAction === "approve" ? "Submitting…" : "Approve Milestone"}
              </button>
            </div>
          </Section>
        </>
      )}

      {roleTab === "freelancer" && (
        <>
          <Section title="4) Withdraw (as FREELANCER)" extra={statePill}>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                {address ? <>Address: <span className="font-mono">{address}</span></> : "Connect wallet"}
              </div>
              <div className="text-base font-semibold text-red-600">
                {formatEther(pendingNative || 0n)} AVAX
              </div>
            </div>
            <button
              className="mint-button mt-3"
              onClick={onWithdrawNative}
              disabled={busy || (pendingNative || 0n) === 0n}
            >
              {busy && pendingAction === "withdraw" ? "Submitting…" : "Withdraw AVAX"}
            </button>
            <div className="text-xs text-gray-500 mt-2">
              Tip: Use a second wallet as the Freelancer when testing.
            </div>
          </Section>

          <Section title="Lookup Escrow (optional)" extra={statePill}>
            <div className="grid gap-3">
              <label className="mint-label">Escrow ID</label>
              <input
                className="mint-input w-40"
                placeholder="1"
                value={escrowId}
                onChange={(e) => setEscrowId(e.target.value)}
              />
              {escrowBasic && (
                <pre className="text-xs bg-red-50 p-3 rounded overflow-x-auto border border-red-100">
                  {JSON.stringify(
                    {
                      client: escrowBasic[0],
                      freelancer: escrowBasic[1],
                      token: escrowBasic[2],
                      totalDeposited: formatEther(escrowBasic[3] || 0n),
                      totalAllocated: formatEther(escrowBasic[4] || 0n),
                      totalReleased: formatEther(escrowBasic[5] || 0n),
                      state: Number(escrowBasic[6]),
                      milestonesCount: Number(escrowBasic[7]),
                    },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
