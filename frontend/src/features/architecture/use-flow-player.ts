import { useCallback, useEffect, useState } from 'react';
import type { ArchFlow } from './architecture-data';

const STEP_DURATION_MS = 3500;

/** Steps through a flow, optionally auto-advancing like a slideshow. */
export function useFlowPlayer(flow: ArchFlow | undefined) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(Boolean(flow));
  const [currentFlow, setCurrentFlow] = useState(flow);
  const total = flow?.steps.length ?? 0;

  // Restart whenever a different flow is chosen. Done during render (not in an
  // effect) so the auto-advance effect below never sees the previous flow's step.
  if (flow !== currentFlow) {
    setCurrentFlow(flow);
    setStepIndex(0);
    setPlaying(Boolean(flow));
  }

  useEffect(() => {
    if (!playing || !flow) return;
    if (stepIndex >= total - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStepIndex((index) => Math.min(index + 1, total - 1)), STEP_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [playing, stepIndex, total, flow]);

  const next = useCallback(() => {
    setPlaying(false);
    setStepIndex((index) => Math.min(index + 1, total - 1));
  }, [total]);

  const previous = useCallback(() => {
    setPlaying(false);
    setStepIndex((index) => Math.max(index - 1, 0));
  }, []);

  const goTo = useCallback((index: number) => {
    setPlaying(false);
    setStepIndex(index);
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying((current) => {
      // Pressing play at the end replays from the start.
      if (!current && stepIndex >= total - 1) setStepIndex(0);
      return !current;
    });
  }, [stepIndex, total]);

  return { stepIndex, step: flow?.steps[stepIndex], total, playing, next, previous, goTo, togglePlay };
}
