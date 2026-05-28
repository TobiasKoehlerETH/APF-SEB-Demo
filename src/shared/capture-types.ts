export interface CaptureSamplePayload {
  timestamp: number;
  uncalibratedOutput: number;
  forceNewtons: number;
  rawTemperatureDegC: number | null;
}

export interface CaptureStatePayload {
  active: boolean;
  startedAt: number | null;
  totalCount: number;
  pendingCount: number;
  lastCsvPath: string | null;
  lastError: string | null;
  exporting: boolean;
}

export interface CaptureStopResultPayload {
  state: CaptureStatePayload;
  csvPath: string | null;
  csvPaths: string[];
}
