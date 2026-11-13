"use client";

import { useCallback, useState } from "react";

type State<T> = { past: T[]; present: T; future: T[] };

const LIMIT = 200;

/** Histórico com desfazer/refazer. Cada `push` vira um passo. */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [] });

  const push = useCallback((next: T) => {
    setState((s) => ({ past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] }));
  }, []);

  const undo = useCallback(() => {
    setState((s) =>
      s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s,
    );
  }, []);

  const redo = useCallback(() => {
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return {
    value: state.present,
    push,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
