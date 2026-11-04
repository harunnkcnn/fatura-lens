import { useEffect, useState } from 'react';

/** useState mirrored to localStorage. Storage failures (private mode, blocked) are ignored. */
export function usePersistentState<T extends string>(key: string, initial: T | (() => T), isValid?: (v: string) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null && (!isValid || isValid(saved))) return saved as T;
    } catch {
      /* storage unavailable */
    }
    return typeof initial === 'function' ? initial() : initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
