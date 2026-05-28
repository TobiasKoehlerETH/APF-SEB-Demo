import React from "react";

type ViewportSize = {
  width: number;
  height: number;
};

const DEFAULT_SIZE: ViewportSize = { width: 0, height: 0 };

export function useViewportSize() {
  const [size, setSize] = React.useState<ViewportSize>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SIZE;
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let frameId: number | null = null;
    const updateSize = () => {
      frameId = null;
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    const handleResize = () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(updateSize);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return size;
}
