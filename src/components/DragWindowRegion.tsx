import {
  closeWindow,
  maximizeWindow,
  minimizeWindow,
} from "@/helpers/window_helpers";
import { isMacOS } from "@/utils/platform";
import type { ReactNode } from "react";

interface DragWindowRegionProps {
  title?: ReactNode;
}

export default function DragWindowRegion({ title }: DragWindowRegionProps) {
  return (
    <div className="bg-background/80 flex w-full items-stretch justify-between border-b">
      <div className="draglayer flex w-full items-center" data-tauri-drag-region>
        {title && !isMacOS() && (
          <div
            className="text-muted-foreground flex flex-1 px-4 py-2 text-xs whitespace-nowrap select-none"
            data-tauri-drag-region
          >
            {title}
          </div>
        )}
        {isMacOS() && <div className="h-8 flex-1" />}
      </div>
      {!isMacOS() && (
        <div className="flex">
          <WindowButtons />
        </div>
      )}
    </div>
  );
}

function WindowButtons() {
  return (
    <>
      <button
        title="Minimize"
        type="button"
        className="hover:bg-secondary px-3 py-2"
        onClick={minimizeWindow}
      >
        <svg
          aria-hidden="true"
          role="img"
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <rect fill="currentColor" width="10" height="1" x="1" y="6" />
        </svg>
      </button>
      <button
        title="Maximize"
        type="button"
        className="hover:bg-secondary px-3 py-2"
        onClick={maximizeWindow}
      >
        <svg
          aria-hidden="true"
          role="img"
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <rect
            width="9"
            height="9"
            x="1.5"
            y="1.5"
            fill="none"
            stroke="currentColor"
          />
        </svg>
      </button>
      <button
        type="button"
        title="Close"
        className="hover:bg-destructive/20 px-3 py-2"
        onClick={closeWindow}
      >
        <svg
          aria-hidden="true"
          role="img"
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <polygon
            fill="currentColor"
            fillRule="evenodd"
            points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
          />
        </svg>
      </button>
    </>
  );
}
