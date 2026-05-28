# Repo Memory

Last reviewed: 2026-05-28

## Latest Work

- Created APF-SEB Demo from the tracked IMU FFT Tauri base.
- Ported the APF-SEB React dashboard, settings panel, sidebar, force readout, force history chart, capture controls, fonts, and global styles.
- Replaced Electron IPC and Python helper behavior with Tauri commands/events backed by Rust.
- Implemented APF serial port listing, selected-port streaming at `115200` baud, init commands `log=0`, `sn`, `log=20`, serial metadata detection, APF line parsing, and tare forwarding.
- Implemented Rust capture state and CSV export with APF-compatible headers, serial suffixes, and Excel row-limit splitting.
- Preserved the IMU FFT-style Tauri release workflow and in-app titlebar update icon behavior, pointed at `TobiasKoehlerETH/APF-SEB-Demo`.
- Verified `npm run build:frontend`, `cargo test --manifest-path src-tauri/Cargo.toml --offline`, and a dev launch through `npm run dev`.

## Current Architecture Notes

- Frontend: React + TypeScript in `src`, Vite on port `1420`, ECharts for the force history plot, Lucide React for icon controls.
- Backend: Tauri 2 + Rust in `src-tauri`, with `serial_stream`, `capture`, and `profile` modules.
- Runtime stream: selected serial port at `115200` baud; APF text lines are parsed as force centi-newtons, stale flag, raw counts, temperature mdegC, and timestamp ms.
- Capture: frontend queues samples from live sensor state; Rust stores rows in memory during capture and writes CSV on stop.
- Updates: Tauri updater plugin remains enabled and uses GitHub Releases `latest.json`.

## Keep In Mind

- Keep the titlebar updater icon and GitHub release workflow behavior in sync with IMU FFT.
- Do not reintroduce IMU FFT binary frames, FFT charts, or 3D model assets unless explicitly requested.
- Keep `README.md`, `agent.md`, and this file synchronized when behavior changes.
- Run `npm run build` for app changes and `npm test` for Rust serial/capture changes.
