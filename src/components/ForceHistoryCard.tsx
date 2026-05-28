import React from "react";
import ReactECharts from "echarts-for-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSensorStream } from "@/contexts/SensorStreamContext";
import { cn } from "@/utils/tailwind";

const HISTORY_WINDOW_MS = 30_000;
const MIN_Y_AXIS_MAX = 1;
const Y_AXIS_PADDING_RATIO = 0.15;

type ForceHistoryCardProps = {
  className?: string;
  chartHeight?: number;
};

type ForceSample = {
  timestamp: number;
  seconds: number;
  value: number;
};

function computePaddedMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return MIN_Y_AXIS_MAX;
  }
  const padded = value + value * Y_AXIS_PADDING_RATIO;
  return Math.max(MIN_Y_AXIS_MAX, padded);
}

export default function ForceHistoryCard({
  className,
  chartHeight,
}: ForceHistoryCardProps = {}) {
  const { sample, resetCounter } = useSensorStream();

  const firstTimestampRef = React.useRef<number | null>(null);
  const lastPlottedTimestampRef = React.useRef<number | null>(null);
  const [history, setHistory] = React.useState<ForceSample[]>([]);
  const [yAxisMax, setYAxisMax] = React.useState<number>(MIN_Y_AXIS_MAX);

  React.useEffect(() => {
    const timestamp = Number(
      sample.timestampMs != null ? sample.timestampMs : Date.now(),
    );
    if (!Number.isFinite(timestamp)) {
      return;
    }
    const rawForce =
      sample.forceNewtons == null || !Number.isFinite(sample.forceNewtons)
        ? 0
        : sample.forceNewtons;
    const effectiveForce = Math.max(0, rawForce);

    const previousTimestamp = lastPlottedTimestampRef.current;
    const nextTimestamp =
      previousTimestamp != null && timestamp <= previousTimestamp
        ? previousTimestamp + 1
        : timestamp;

    if (firstTimestampRef.current == null) {
      firstTimestampRef.current = nextTimestamp;
    }

    const seconds =
      (nextTimestamp - firstTimestampRef.current) / 1000;

    const cutoffTimestamp = nextTimestamp - HISTORY_WINDOW_MS;

    setHistory((current) => {
      const nextHistory = [...current, { timestamp: nextTimestamp, seconds, value: effectiveForce }];
      while (nextHistory.length > 0 && nextHistory[0]!.timestamp < cutoffTimestamp) {
        nextHistory.shift();
      }

      let peakValue = 0;
      for (let index = 0; index < nextHistory.length; index += 1) {
        peakValue = Math.max(peakValue, nextHistory[index]!.value);
      }
      setYAxisMax(computePaddedMax(peakValue));

      return nextHistory;
    });

    lastPlottedTimestampRef.current = nextTimestamp;
  }, [sample]);

  React.useEffect(() => {
    setHistory([]);
    firstTimestampRef.current = null;
    lastPlottedTimestampRef.current = null;
    setYAxisMax(MIN_Y_AXIS_MAX);
  }, [resetCounter]);

  const chartOption = React.useMemo(() => {
    const samples = history;
    const lastSample =
      samples.length > 0 ? samples[samples.length - 1]! : null;
    const lastSeconds = lastSample?.seconds ?? 0;
    const minSeconds = Math.max(
      0,
      lastSeconds - HISTORY_WINDOW_MS / 1000,
    );
    const seriesData = samples.map((sample) => [
      sample.seconds,
      sample.value,
    ]);

    return {
      animation: false,
      grid: { left: 56, right: 20, top: 32, bottom: 48 },
      tooltip: { show: false },
      xAxis: {
        type: "value",
        min: minSeconds,
        max: Math.max(lastSeconds, HISTORY_WINDOW_MS / 1000),
        axisLabel: { formatter: "{value}s" },
        axisPointer: { show: false },
        name: "Time [s]",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: {
          fontSize: 14,
          fontWeight: "600",
          color: "#000000",
        },
        minInterval: 1,
      },
      yAxis: {
        type: "value",
        name: "Force [N]",
        nameLocation: "middle",
        nameGap: 42,
        nameTextStyle: {
          fontSize: 14,
          fontWeight: "600",
          color: "#000000",
        },
        min: 0,
        max: yAxisMax,
        axisLabel: { formatter: (value: number) => `${value}` },
        axisPointer: { show: false },
        splitLine: { lineStyle: { type: "dashed", opacity: 0.4 } },
      },
      series: [
        {
          name: "Force",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: "#000000" },
          itemStyle: { color: "#000000" },
          emphasis: { disabled: true },
          data: seriesData,
        },
      ],
    };
  }, [history, yAxisMax]);

  const resolvedChartHeight = chartHeight ?? 256;

  return (
    <Card className={cn("border-muted/60", className)}>
      <CardHeader className="p-8 pb-4">
        <CardTitle className="text-lg font-semibold">Live Plot</CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0 md:p-4">
        <ReactECharts
          className="w-full"
          style={{ height: resolvedChartHeight }}
          option={chartOption}
          lazyUpdate
          opts={{ renderer: "canvas" }}
        />
      </CardContent>
    </Card>
  );
}
