import { useEffect, useRef } from 'react';

const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? true;
};

export const useScrollToTopOnChange = (deps: any[], options?: { smooth?: boolean }) => {
  const topRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = topRef.current;
    if (!node) return;

    const behavior: ScrollBehavior =
      options?.smooth === false || prefersReducedMotion() ? 'auto' : 'smooth';

    // Wait for UI to update before scrolling (pagination changes often re-render lists).
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'start', behavior });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return topRef;
};

