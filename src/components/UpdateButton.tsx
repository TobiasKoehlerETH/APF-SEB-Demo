import React from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/tailwind";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type UpdateButtonProps = {
  className?: string;
};

export default function UpdateButton({ className }: UpdateButtonProps) {
  const [pendingUpdate, setPendingUpdate] = React.useState<Update | null>(null);
  const [label, setLabel] = React.useState("Checking for updates");
  const [disabled, setDisabled] = React.useState(true);
  const [isVisible, setIsVisible] = React.useState(false);
  const downloadedBytes = React.useRef(0);
  const contentLength = React.useRef<number | null>(null);

  React.useEffect(() => {
    void check({ timeout: 15000 })
      .then((update) => {
        if (!update) {
          setLabel("No update available");
          return;
        }
        setPendingUpdate(update);
        setIsVisible(true);
        setLabel(`Update ${update.version} available`);
        setDisabled(false);
      })
      .catch((error) => {
        console.warn("Update check failed", error);
        setLabel("Update check failed");
      });
  }, []);

  const applyDownloadEvent = (event: DownloadEvent) => {
    if (event.event === "Started") {
      downloadedBytes.current = 0;
      contentLength.current = event.data.contentLength ?? null;
      setLabel(contentLength.current === null ? "Downloading update" : "Downloading update 0%");
      return;
    }

    if (event.event === "Progress") {
      downloadedBytes.current += event.data.chunkLength;
      if (contentLength.current === null || contentLength.current <= 0) {
        setLabel(`Downloaded ${formatBytes(downloadedBytes.current)}`);
        return;
      }

      const percent = Math.min(
        100,
        Math.round((downloadedBytes.current / contentLength.current) * 100),
      );
      setLabel(`Downloading update ${percent}%`);
      return;
    }

    setLabel("Installing update");
  };

  const install = async () => {
    const update = pendingUpdate;
    if (!update) {
      return;
    }

    setPendingUpdate(null);
    setDisabled(true);
    setLabel(`Downloading ${update.version}`);

    try {
      await update.downloadAndInstall((event) => applyDownloadEvent(event));
      setLabel("Restarting to finish update");
      await relaunch();
    } catch (error) {
      setPendingUpdate(update);
      setDisabled(false);
      setLabel(`Update failed: ${String(error)}`);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Button
      type="button"
      title={label}
      aria-label={label}
      aria-live="polite"
      variant="ghost"
      size="icon"
      className={cn(
        pendingUpdate ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground",
        className,
      )}
      disabled={disabled}
      onClick={install}
    >
      <Download aria-hidden="true" className="h-5 w-5" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
