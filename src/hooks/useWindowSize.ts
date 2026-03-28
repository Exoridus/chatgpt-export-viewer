import { useEffect, useState } from 'react';

const getInitialSize = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 0,
  height: typeof window !== 'undefined' ? window.innerHeight : 0,
});

export function useWindowSize() {
  const [size, setSize] = useState(getInitialSize);
  useEffect(() => {
    let frameId: number | null = null;
    const listener = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        setSize(getInitialSize());
        frameId = null;
      });
    };
    window.addEventListener('resize', listener);
    return () => {
      window.removeEventListener('resize', listener);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);
  return size;
}
