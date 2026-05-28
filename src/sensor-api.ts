import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  CaptureSamplePayload,
  CaptureStatePayload,
  CaptureStopResultPayload,
} from "@/shared/capture-types";
import type { SensorMetadataPayload } from "@/shared/sensor-metadata";
import type { SerialPortInfo } from "@/shared/serial-types";

export interface SensorDataPayload {
  rawValue: number;
  port: number;
  temperatureMc?: number;
  ageUs?: number;
  receivedAt: number;
  forceNewtons?: number;
  timestampMs?: number;
}

export interface SensorStatusPayload {
  level: "info" | "error";
  message: string;
}

export const sensorApi = {
  onData: (callback: (payload: SensorDataPayload) => void) =>
    listen<SensorDataPayload>("sensor:data", (event) => callback(event.payload)),

  onStatus: (callback: (payload: SensorStatusPayload) => void) =>
    listen<SensorStatusPayload>("sensor:status", (event) => callback(event.payload)),

  onMetadata: (callback: (payload: SensorMetadataPayload) => void) =>
    listen<SensorMetadataPayload>("sensor:metadata", (event) => callback(event.payload)),

  onCaptureState: (callback: (payload: CaptureStatePayload) => void) =>
    listen<CaptureStatePayload>("sensor:capture:state", (event) =>
      callback(event.payload),
    ),

  listSerialPorts: () => invoke<SerialPortInfo[]>("list_serial_ports"),

  selectSerialPort: (port?: string | null) =>
    invoke<{ port: string | null }>("select_serial_port", { port: port ?? null }),

  tare: async () => {
    const result = await invoke<{ success?: boolean; error?: string }>("tare");
    if (result.error) {
      throw new Error(result.error);
    }
  },

  selectCaptureDirectory: async (): Promise<{
    canceled: boolean;
    directory?: string;
  }> => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select log folder",
    });
    const directory = Array.isArray(selected) ? selected[0] : selected;
    return typeof directory === "string" && directory.trim().length > 0
      ? { canceled: false, directory }
      : { canceled: true };
  },

  startCapture: (directory?: string) =>
    invoke<CaptureStatePayload>("start_capture", { directory }),

  stopCapture: (params?: { serialNumber?: string | null }) =>
    invoke<CaptureStopResultPayload>("stop_capture", {
      serialNumber: params?.serialNumber ?? null,
    }),

  getCaptureState: () => invoke<CaptureStatePayload>("get_capture_state"),

  recordCaptureSample: (sample: CaptureSamplePayload) =>
    invoke<CaptureStatePayload>("record_capture_sample", { sample }),
};
