import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useContractRead } from "wagmi";
import { MINTARO_ADDRESS, MINTARO_ABI } from "./contracts";

function App() {
  const { data: feeBps } = useContractRead({
    address: MINTARO_ADDRESS,
    abi: MINTARO_ABI,
    functionName: "feeBps",
    chainId: 43113,
  });

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <ConnectButton />
      <h1>Mintaro Escrow (Fuji)</h1>
      <p>
        Platform Fee:{" "}
        {feeBps !== undefined ? feeBps.toString() + " bps" : "Loading..."}
      </p>
    </div>
  );
}

export default App;
