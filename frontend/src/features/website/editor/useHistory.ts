import { useCallback, useRef, useState } from "react";

const LIMIT = 100;
/** Edits to the same thing within this time count as one undo step (e.g. typing a word). */
const MERGE_MS = 1000;

/**
 * Undo/redo for the editor's page content.
 * `set(next, key)` — pass the same `key` for repeated edits of one field so they merge into one step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const last = useRef<{ key?: string; at: number }>({ at: 0 });

  const set = useCallback((next: T, key?: string) => {
    const now = Date.now();
    const merge = key !== undefined && key === last.current.key && now - last.current.at < MERGE_MS;
    last.current = { key, at: now };
    setState((s) => ({
      past: merge ? s.past : [...s.past, s.present].slice(-LIMIT),
      present: next,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    last.current = { at: 0 };
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = { at: 0 };
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  /** Replace without creating an undo step (e.g. after loading or restoring a version). */
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return { value: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
