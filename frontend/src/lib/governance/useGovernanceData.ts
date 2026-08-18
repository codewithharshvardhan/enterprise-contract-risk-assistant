import { useEffect, useState } from "react";

// Renders `fallback` immediately (bundled fixtures → works with no backend),
// then swaps in live data once the governance API responds.
export function useGovernanceData<T>(fetcher: () => Promise<T>, fallback: T): T {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    let active = true;
    void fetcher().then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [fetcher]);
  return data;
}
