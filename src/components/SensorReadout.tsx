import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSensorStream } from "@/contexts/SensorStreamContext";
import { useDataCapture } from "@/contexts/DataCaptureContext";
import ForceHistoryCard from "@/components/ForceHistoryCard";
import { useViewportSize } from "@/hooks/useViewportSize";
import { Play, Square } from "lucide-react";
import { cn } from "@/utils/tailwind";

const HP_QUADRANT_WIDTH = 1920 / 2;
const HP_QUADRANT_HEIGHT = 1080 / 2;

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number | null, min = 1, max = 1) {
  if (value == null || Number.isNaN(value)) {
    return "---";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

export default function SensorReadout() {
  const { sample, sensorSerialNumber } = useSensorStream();
  const {
    state: captureState,
    isRecording,
    startCapture,
    stopCapture,
  } = useDataCapture();
  const [isStartingCapture, setIsStartingCapture] = React.useState(false);
  const [isStoppingCapture, setIsStoppingCapture] = React.useState(false);
  const { width: viewportWidth, height: viewportHeight } = useViewportSize();

  const forceValue = sample.forceNewtons == null ? null : Math.max(0, sample.forceNewtons);
  const forceLabel = formatNumber(forceValue, 1, 1);
  const captureStatusLabel = React.useMemo(() => {
    if (captureState.exporting) {
      return "Finalizing log";
    }
    if (isRecording) {
      return "Recording";
    }
    if (captureState.lastCsvPath) {
      const segments = captureState.lastCsvPath.split(/[/\\]/);
      const filename = segments[segments.length - 1] ?? captureState.lastCsvPath;
      return `Last log: ${filename}`;
    }
    return "";
  }, [captureState, isRecording]);

  const handleStartCapture = async () => {
    if (isStartingCapture || isRecording) {
      return;
    }
    setIsStartingCapture(true);
    try {
      await startCapture();
    } finally {
      setIsStartingCapture(false);
    }
  };

  const handleStopCapture = async () => {
    if (isStoppingCapture || !isRecording) {
      return;
    }
    setIsStoppingCapture(true);
    try {
      await stopCapture();
    } finally {
      setIsStoppingCapture(false);
    }
  };

  const effectiveWidth = viewportWidth || HP_QUADRANT_WIDTH;
  const effectiveHeight = viewportHeight || HP_QUADRANT_HEIGHT;
  const showSideBySide = effectiveWidth >= 900;
  const primaryCardMinHeight = showSideBySide
    ? clampValue(effectiveHeight * 0.55, 320, 520)
    : undefined;
  const chartHeight = clampValue(effectiveHeight * 0.35, 220, 360);
  const temperatureLabel =
    sample.temperatureC == null
      ? null
      : sample.temperatureC.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const forceFontSize = clampValue(
    (primaryCardMinHeight ?? clampValue(effectiveHeight * 0.45, 320, 520)) * 0.22,
    48,
    120,
  );
  const rootClasses = cn(
    "flex w-full flex-col gap-6",
    showSideBySide ? "" : "max-w-2xl",
  );
  const primaryLayoutClasses = cn(
    "gap-6",
    showSideBySide ? "grid items-stretch md:grid-cols-2" : "flex flex-col",
  );

  return (
    <div className={rootClasses}>
      <div className={primaryLayoutClasses}>
        <Card
          className="shadow-lg flex flex-col"
          style={primaryCardMinHeight ? { minHeight: primaryCardMinHeight } : undefined}
        >
          <CardHeader className="space-y-4 p-8 pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-2xl font-semibold">Force</CardTitle>
                <p className="text-muted-foreground text-sm tracking-wide uppercase">
                  newtons
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                {isRecording ? (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={handleStopCapture}
                      disabled={isStoppingCapture || captureState.exporting}
                      title="Stop capture"
                    >
                      <Square className="h-4 w-4" />
                      <span className="sr-only">Stop capture</span>
                    </Button>
                    {!captureState.exporting ? null : (
                      <div className="flex items-center gap-2 text-xs font-medium text-destructive">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                        {captureStatusLabel}
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleStartCapture}
                    disabled={isStartingCapture}
                    className="w-full md:w-auto px-4"
                  >
                    <Play className="h-4 w-4" />
                    Log
                  </Button>
                )}
                {!isRecording && (
                  <p className="text-muted-foreground text-xs">{captureStatusLabel}</p>
                )}
                {captureState.lastError ? (
                  <p className="text-destructive text-xs">{captureState.lastError}</p>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col items-center justify-center p-8 pt-0 text-center">
            <div
              className="font-mono font-semibold tracking-tight whitespace-nowrap"
              style={{ fontSize: forceFontSize }}
            >
              {forceLabel}
              {forceLabel === "---" ? "" : " N"}
            </div>
            <div className="mt-10 flex w-full flex-wrap items-center justify-center gap-6 rounded-xl border border-muted/30 bg-card px-6 py-5">
              <div className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-left">
                <p className="text-muted-foreground text-[11px] uppercase tracking-[0.08em]">
                  Temperature
                </p>
                <p className="font-mono text-2xl font-semibold leading-none">
                  {temperatureLabel ?? "---"}
                  {temperatureLabel ? " \u00b0C" : ""}
                </p>
              </div>
              <div className="hidden h-10 w-px bg-border sm:block" />
              <div className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-left">
                <p className="text-muted-foreground text-[11px] uppercase tracking-[0.08em]">
                  Sensor
                </p>
                <p className="font-mono text-2xl font-semibold leading-none">
                  {sensorSerialNumber ?? "---"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <ForceHistoryCard
          className={showSideBySide ? "h-full" : undefined}
          chartHeight={chartHeight}
        />
      </div>
    </div>
  );
}
