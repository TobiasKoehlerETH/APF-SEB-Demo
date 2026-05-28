import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSensorStream } from "@/contexts/SensorStreamContext";
import { sensorApi } from "@/sensor-api";
import type {
  CaptureStatePayload,
  CaptureStopResultPayload,
} from "@/shared/capture-types";

interface DataCaptureContextValue {
  state: CaptureStatePayload;
  isRecording: boolean;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<string | null>;
}

const DEFAULT_STATE: CaptureStatePayload = {
  active: false,
  startedAt: null,
  totalCount: 0,
  pendingCount: 0,
  lastCsvPath: null,
  lastError: null,
  exporting: false,
};

const DataCaptureContext = createContext<DataCaptureContextValue | null>(null);

export function DataCaptureProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CaptureStatePayload>(DEFAULT_STATE);
  const recordingSampleRef = useRef<number | null>(null);
  const { sample, sensorSerialNumber } = useSensorStream();

  const syncState = useCallback((snapshot: CaptureStatePayload | null) => {
    if (!snapshot) {
      return;
    }
    setState(snapshot);
    if (!snapshot.active) {
      recordingSampleRef.current = null;
    }
  }, []);

  const startCapture = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const selection = await sensorApi.selectCaptureDirectory();
      if (!selection || selection.canceled || !selection.directory) {
        return;
      }
      const snapshot = await sensorApi.startCapture(selection.directory);
      syncState(snapshot);
    } catch (error) {
      console.error("Failed to start capture", error);
    }
  }, [syncState]);

  const stopCapture = useCallback(async () => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const serialNumber =
        typeof sensorSerialNumber === "string" && sensorSerialNumber.trim().length > 0
          ? sensorSerialNumber.trim()
          : null;
      const result: CaptureStopResultPayload = await sensorApi.stopCapture({
        serialNumber,
      });
      syncState(result?.state ?? null);
      return result?.csvPath ?? null;
    } catch (error) {
      console.error("Failed to stop capture", error);
      return null;
    }
  }, [sensorSerialNumber, syncState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let unsubscribe: (() => void) | null = null;
    void sensorApi.onCaptureState((snapshot) => syncState(snapshot)).then((cleanup) => {
      unsubscribe = cleanup;
    });
    sensorApi
      .getCaptureState()
      .then((snapshot) => syncState(snapshot))
      .catch(() => undefined);
    return () => unsubscribe?.();
  }, [syncState]);

  useEffect(() => {
    if (typeof window === "undefined" || !state.active) {
      return;
    }

    if (sample.timestampMs == null || sample.timestampMs === recordingSampleRef.current) {
      return;
    }

    const forceForCapture =
      sample.forceNewtons != null && Number.isFinite(sample.forceNewtons)
        ? sample.forceNewtons
        : null;

    if (sample.rawCounts == null || forceForCapture == null) {
      return;
    }

    void sensorApi.recordCaptureSample({
      timestamp: sample.timestampMs,
      uncalibratedOutput: sample.rawCounts,
      forceNewtons: forceForCapture,
      rawTemperatureDegC: sample.temperatureC,
    });

    recordingSampleRef.current = sample.timestampMs;
  }, [sample, state.active]);

  const value = useMemo<DataCaptureContextValue>(
    () => ({
      state,
      isRecording: state.active,
      startCapture,
      stopCapture,
    }),
    [state, startCapture, stopCapture],
  );

  return (
    <DataCaptureContext.Provider value={value}>
      {children}
    </DataCaptureContext.Provider>
  );
}

export function useDataCapture(): DataCaptureContextValue {
  const context = useContext(DataCaptureContext);
  if (!context) {
    throw new Error("useDataCapture must be used within DataCaptureProvider");
  }
  return context;
}
