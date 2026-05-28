import { SlidersHorizontal, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import UpdateButton from "@/components/UpdateButton";
import { useSensorStream } from "@/contexts/SensorStreamContext";

interface AppSidebarProps {
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
}

export default function AppSidebar({
  isSettingsOpen,
  onToggleSettings,
}: AppSidebarProps) {
  const { sample, tare } = useSensorStream();
  const canTare = sample.rawCounts != null;

  return (
    <aside className="bg-secondary/40 w-16 border-r shadow-sm">
      <div className="flex h-full flex-col items-center gap-6 py-6 justify-end">
        <UpdateButton className="h-10 w-10" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={() => void tare()}
          disabled={!canTare}
          title="Tare (send tare command)"
        >
          <RefreshCcw className="h-5 w-5" />
          <span className="sr-only">Tare sensor</span>
        </Button>
        <Button
          type="button"
          variant={isSettingsOpen ? "secondary" : "ghost"}
          size="icon"
          className="h-10 w-10"
          onClick={onToggleSettings}
          aria-pressed={isSettingsOpen}
        >
          <SlidersHorizontal className="h-5 w-5" />
          <span className="sr-only">Open settings</span>
        </Button>
      </div>
    </aside>
  );
}
