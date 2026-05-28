# Agent Notes

## Project Shape

`apf-seb-demo` is a Tauri 2 desktop app for the APF-SEB force sensor workflow. The frontend is Vite + React + TypeScript with Tailwind-style CSS, shadcn-style controls, Lucide React icons, and ECharts. The backend is Rust under `src-tauri`.

The app reads APF serial text lines at `115200` baud. Selecting a COM port sends `log=0`, `sn`, and `log=20`, then emits Tauri events for sensor data, status, metadata, and capture state.

## Common Commands

Run from the repository root:

```powershell
npm install
npm run dev
npm run build
npm test
```

`npm run dev` starts Vite on `http://127.0.0.1:1420` and launches the Tauri desktop window. `npm run build` builds the frontend and Rust backend. `npm test` runs `cargo test --manifest-path src-tauri/Cargo.toml`.

For release packaging:

```powershell
npm run build:tauri
```

Local version bumps use:

```powershell
node scripts/bump-version.mjs --bump patch
```

## Important Files

- `src/App.tsx` wires the APF dashboard into the Tauri app shell.
- `src/sensor-api.ts` is the frontend adapter for Tauri commands and events.
- `src/contexts/SensorStreamContext.tsx` normalizes sensor data and serial metadata for the UI.
- `src/contexts/DataCaptureContext.tsx` records live samples into the Rust capture store.
- `src-tauri/src/serial_stream.rs` owns COM port listing, selected-port streaming, APF line parsing, init commands, and tare forwarding.
- `src-tauri/src/capture.rs` owns capture state and CSV export.
- `src-tauri/src/profile.rs` owns optional profile ID parsing.
- `src-tauri/tauri.conf.json` owns app metadata, bundling, and updater settings.
- `.github/workflows/release.yml` publishes MSI releases and updater metadata.

## Engineering Constraints

Keep release/updater behavior aligned with IMU FFT: the workflow should produce signed updater metadata, and the app should keep the titlebar update icon for available updates and progress/errors.

Keep serial behavior APF-specific. Do not reintroduce IMU binary frame parsing, FFT processing, 3D model rendering, or simulation unless explicitly requested.

Keep capture output compatible with the APF-SEB desktop workflow: CSV header `timestamp,uncalibrated_output,force_newtons,temperature_raw_c,serial_number`, serial-number suffixes where available, and split files before Excel's sheet row limit.

Keep versions aligned across `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.

## Testing Expectations

For frontend or packaging changes, run:

```powershell
npm run build
```

For Rust serial or capture changes, run:

```powershell
npm test
```

For launch smoke tests, run:

```powershell
npm run dev
```

Then confirm the `apf-seb-demo.exe` process is responding and `http://127.0.0.1:1420/` returns HTTP 200.

## Repo Hygiene

Do not commit generated build output from `dist`, `node_modules`, or `src-tauri/target`. Be careful with hardware-specific assumptions: the app only connects after a user selects a serial port in Settings.
