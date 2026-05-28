import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sensorApi, type SensorDataPayload } from "@/sensor-api";
import type { SensorMetadataPayload } from "@/shared/sensor-metadata";
import type { SerialPortInfo } from "@/shared/serial-types";

export type Sample = {
  forceNewtons: number | null;
  rawCounts: number | null;
  temperatureC: number | null;
  timestampMs: number | null;
};

type SensorStreamContextValue = {
  sample: Sample;
  recentSamples: Sample[];
  status: string | null;
  serialPorts: SerialPortInfo[];
  serialPortsLoading: boolean;
  serialPortsError: string | null;
  selectedSerialPort: string | null;
  selectSerialPort: (port: string | null) => Promise<void>;
  refreshSerialPorts: () => Promise<void>;
  lastSampleTimestamp: number | null;
  tare: () => Promise<void>;
  sensorSerialNumber: string | null;
  resetSensor: () => Promise<void>;
  resetCounter: number;
};

const DEFAULT_SAMPLE: Sample = {
  forceNewtons: null,
  rawCounts: null,
  temperatureC: null,
  timestampMs: null,
};

const MAX_RECENT_SAMPLES = 100;
const NOISY_STATUS_SNIPPET = "rejected malformed payload";

const SensorStreamContext = createContext<SensorStreamContextValue | null>(null);

function shouldSuppressStatus(message: string | null | undefined): boolean {
  return Boolean(message?.toLowerCase().includes(NOISY_STATUS_SNIPPET));
}

function toTemperatureC(microC: number | undefined): number | null {
  if (microC == null || !Number.isFinite(microC)) {
    return null;
  }
  return microC / 1_000_000;
}

function normalizeTemperature(payload: SensorDataPayload): number | null {
  const loosePayload = payload as SensorDataPayload & {
    temperature?: number;
    temperature_c?: number;
    temperatureC?: number;
  };
  if (typeof loosePayload.temperatureMc === "number") {
    return toTemperatureC(loosePayload.temperatureMc);
  }
  if (typeof loosePayload.temperature_c === "number") {
    return loosePayload.temperature_c;
  }
  if (typeof loosePayload.temperatureC === "number") {
    return loosePayload.temperatureC;
  }
  if (typeof loosePayload.temperature === "number") {
    return loosePayload.temperature;
  }
  return null;
}

function formatSampleForLog(sample: Sample): string {
  const forceLabel =
    sample.forceNewtons == null
      ? "---"
      : sample.forceNewtons.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const tempLabel =
    sample.temperatureC == null
      ? "---"
      : sample.temperatureC.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  const countsLabel =
    sample.rawCounts == null
      ? "---"
      : sample.rawCounts.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        });
  const timestampLabel = sample.timestampMs == null ? "" : ` @${sample.timestampMs}`;
  return `[sensor] force=${forceLabel} N | temp=${tempLabel} C | counts=${countsLabel}${timestampLabel}`;
}

export function SensorStreamProvider({ children }: { children: React.ReactNode }) {
  const [sample, setSample] = useState<Sample>(DEFAULT_SAMPLE);
  const [recentSamples, setRecentSamples] = useState<Sample[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [serialPortsLoading, setSerialPortsLoading] = useState(false);
  const [serialPortsError, setSerialPortsError] = useState<string | null>(null);
  const [selectedSerialPort, setSelectedSerialPort] = useState<string | null>(null);
  const [sensorSerialNumber, setSensorSerialNumber] = useState<string | null>(null);
  const [resetCounter, setResetCounter] = useState(0);
  const lastTimestampRef = useRef<number | null>(null);

  const refreshSerialPorts = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    setSerialPortsLoading(true);
    setSerialPortsError(null);
    try {
      const ports = await sensorApi.listSerialPorts();
      setSerialPorts(ports);
    } catch (error) {
      setSerialPortsError(
        error instanceof Error ? error.message : "Failed to list serial ports",
      );
    } finally {
      setSerialPortsLoading(false);
    }
  }, []);

  const selectSerialPort = useCallback(async (port: string | null) => {
    if (typeof window === "undefined") {
      return;
    }
    const normalized =
      typeof port === "string" && port.trim().length > 0 ? port.trim() : null;
    try {
      await sensorApi.selectSerialPort(normalized);
      setSelectedSerialPort(normalized);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to select serial port",
      );
    }
  }, []);

  const tare = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      await sensorApi.tare();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send tare");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const unsubscribers: Array<() => void> = [];

    const normalizeTimestamp = (payload: SensorDataPayload): number => {
      const now = Date.now();
      const fallbackTimestamp =
        typeof payload.receivedAt === "number" && Number.isFinite(payload.receivedAt)
          ? payload.receivedAt
          : now;
      const rawCandidate =
        typeof payload.timestampMs === "number" && Number.isFinite(payload.timestampMs)
          ? payload.timestampMs
          : null;
      const candidate =
        rawCandidate != null && rawCandidate > 0 ? rawCandidate : fallbackTimestamp;
      const lastTimestamp = lastTimestampRef.current;
      if (lastTimestamp != null && candidate <= lastTimestamp) {
        return Math.max(lastTimestamp + 1, fallbackTimestamp);
      }
      return candidate;
    };

    void sensorApi
      .onData((payload) => {
        const normalizedTimestamp = normalizeTimestamp(payload);
        const nextSample: Sample = {
          forceNewtons:
            typeof payload.forceNewtons === "number" ? payload.forceNewtons : null,
          rawCounts:
            typeof payload.rawValue === "number" && Number.isFinite(payload.rawValue)
              ? payload.rawValue
              : null,
          temperatureC: normalizeTemperature(payload),
          timestampMs: normalizedTimestamp,
        };

        lastTimestampRef.current = normalizedTimestamp;
        setSample(nextSample);
        setRecentSamples((current) => {
          const next = [nextSample, ...current];
          if (next.length > MAX_RECENT_SAMPLES) {
            next.length = MAX_RECENT_SAMPLES;
          }
          return next;
        });
        console.log(formatSampleForLog(nextSample));
      })
      .then((unsubscribe) => unsubscribers.push(unsubscribe));

    void sensorApi
      .onStatus((payload) => {
        const message = payload.message ?? null;
        if (!shouldSuppressStatus(message)) {
          setStatus(message);
        }
      })
      .then((unsubscribe) => unsubscribers.push(unsubscribe));

    void sensorApi
      .onMetadata((payload: SensorMetadataPayload) => {
        const serial =
          typeof payload?.serialNumber === "string" ? payload.serialNumber.trim() : "";
        if (serial) {
          setSensorSerialNumber(serial);
        }
      })
      .then((unsubscribe) => unsubscribers.push(unsubscribe));

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          /* noop */
        }
      });
    };
  }, []);

  const resetSensor = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        await sensorApi.selectSerialPort(null);
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Failed to disconnect serial port",
        );
      }
    }

    setSelectedSerialPort(null);
    setSample(DEFAULT_SAMPLE);
    setRecentSamples([]);
    setSensorSerialNumber(null);
    setStatus(null);
    lastTimestampRef.current = null;
    setResetCounter((value) => value + 1);
  }, []);

  const value = useMemo<SensorStreamContextValue>(
    () => ({
      sample,
      recentSamples,
      status,
      serialPorts,
      serialPortsLoading,
      serialPortsError,
      selectedSerialPort,
      selectSerialPort,
      refreshSerialPorts,
      lastSampleTimestamp: sample.timestampMs,
      tare,
      sensorSerialNumber,
      resetSensor,
      resetCounter,
    }),
    [
      sample,
      recentSamples,
      status,
      serialPorts,
      serialPortsLoading,
      serialPortsError,
      selectedSerialPort,
      selectSerialPort,
      refreshSerialPorts,
      tare,
      sensorSerialNumber,
      resetSensor,
      resetCounter,
    ],
  );

  return (
    <SensorStreamContext.Provider value={value}>
      {children}
    </SensorStreamContext.Provider>
  );
}

export function useSensorStream(): SensorStreamContextValue {
  const context = useContext(SensorStreamContext);
  if (!context) {
    throw new Error("useSensorStream must be used within SensorStreamProvider");
  }
  return context;
}
