import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOWS } from './architecture-data';
import { useFlowPlayer } from './use-flow-player';

const [first, second] = FLOWS;

describe('useFlowPlayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-advances and stops on the last step', () => {
    const { result } = renderHook(() => useFlowPlayer(second));
    expect(result.current.playing).toBe(true);
    for (let i = 0; i < second!.steps.length + 2; i += 1) act(() => vi.advanceTimersByTime(3500));
    expect(result.current.stepIndex).toBe(second!.steps.length - 1);
    expect(result.current.playing).toBe(false);
  });

  it('restarts and plays from step 1 when switching flows after the previous one finished', () => {
    const { result, rerender } = renderHook(({ flow }) => useFlowPlayer(flow), { initialProps: { flow: first } });
    for (let i = 0; i < first!.steps.length + 2; i += 1) act(() => vi.advanceTimersByTime(3500));
    expect(result.current.playing).toBe(false);

    rerender({ flow: second });
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.playing).toBe(true);
    act(() => vi.advanceTimersByTime(3500));
    expect(result.current.stepIndex).toBe(1);
  });
});
