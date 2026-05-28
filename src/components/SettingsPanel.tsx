import React from "react";
import { Button } from "@/components/ui/button";
import { X, RefreshCcw, PlugZap } from "lucide-react";
import { useSensorStream } from "@/contexts/SensorStreamContext";

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const {
    serialPorts,
    serialPortsLoading,
    serialPortsError,
    selectedSerialPort,
    selectSerialPort,
    refreshSerialPorts,
    status,
    resetSensor,
  } = useSensorStream();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    void selectSerialPort(value || null);
  };

  return (
    <aside className="bg-muted/30 border-l px-4 py-6 lg:absolute lg:inset-y-0 lg:right-0 lg:w-[24rem]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Settings</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          COM port
        </p>
        <div className="flex items-center gap-2">
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedSerialPort ?? ""}
            onChange={handleChange}
            disabled={serialPortsLoading}
          >
            <option value="">Select a port</option>
            {serialPorts.map((port) => (
              <option key={port.path} value={port.path}>
                {port.path} {port.description ? `- ${port.description}` : ""}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => void refreshSerialPorts()}
            disabled={serialPortsLoading}
          >
            <RefreshCcw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
        {serialPortsError ? (
          <p className="text-destructive text-sm">{serialPortsError}</p>
        ) : null}
        {status ? (
          <p className="text-muted-foreground text-sm">Status: {status}</p>
        ) : null}
      </div>

      <div className="mt-6">
        <Button
          type="button"
          variant="secondary"
          className="gap-2 bg-black text-white hover:bg-black/90"
          onClick={() => void resetSensor()}
        >
          <PlugZap className="h-4 w-4" />
          Disconnect
        </Button>
      </div>
    </aside>
  );
}
