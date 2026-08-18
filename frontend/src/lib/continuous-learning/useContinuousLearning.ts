import { useCallback, useEffect, useState } from "react";
import { fetchContinuousLearning } from "./api";
import { hydrateCL } from "./fixtures";

// Fetches the live Continuous Learning bundle once on mount, hydrates the bundled
// fixtures in place (they are `let` bindings in fixtures.ts), then bumps `tick` to
// force a re-render — so the entire workspace swaps from fixtures to live data
// with no prop-drilling. Call it once, at the top of the page.
//
// Returns `{ ready, refresh }`:
//   • ready   — true once the first live fetch has resolved.
//   • refresh — re-fetch the bundle, re-hydrate the fixtures, and re-render.
//     Call it after any write (create / update / delete a baseline) so the list
//     reflects the backend immediately.
export function useContinuousLearning(): { ready: boolean; refresh: () => Promise<void> } {
  const [ready, setReady] = useState(false);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    const bundle = await fetchContinuousLearning();
    hydrateCL(bundle);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchContinuousLearning().then((bundle) => {
      if (!active) return;
      hydrateCL(bundle);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { ready, refresh };
}
