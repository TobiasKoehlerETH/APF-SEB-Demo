import { Settings, RefreshCcw, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import UpdateButton from "@/components/UpdateButton";
import { useSensorStream } from "@/contexts/SensorStreamContext";

export default function AppSidebar() {
  const {
    sample,
    tare,
    serialPorts,
    serialPortsLoading,
    serialPortsError,
    selectedSerialPort,
    selectSerialPort,
    refreshSerialPorts,
    resetSensor,
  } = useSensorStream();
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
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) {
              void refreshSerialPorts();
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={selectedSerialPort ? "secondary" : "ghost"}
              size="icon"
              className="h-10 w-10"
              title="Select COM port"
            >
              <Settings className="h-5 w-5" />
              <span className="sr-only">Select COM port</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72" side="right" align="end">
            <DropdownMenuLabel>Sensor</DropdownMenuLabel>
            {serialPortsLoading ? (
              <DropdownMenuItem disabled>Refreshing ports...</DropdownMenuItem>
            ) : null}
            {serialPortsError ? (
              <DropdownMenuItem disabled className="text-destructive">
                {serialPortsError}
              </DropdownMenuItem>
            ) : null}
            {!serialPortsLoading && serialPorts.length === 0 ? (
              <DropdownMenuItem disabled>No ports found</DropdownMenuItem>
            ) : null}
            {serialPorts.map((port) => (
              <DropdownMenuCheckboxItem
                key={port.path}
                checked={selectedSerialPort === port.path}
                onCheckedChange={() => void selectSerialPort(port.path)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{port.path}</span>
                  {port.description || port.manufacturer ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {[port.description, port.manufacturer].filter(Boolean).join(" - ")}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => void resetSensor()}
              disabled={!selectedSerialPort}
            >
              <PlugZap className="h-4 w-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
