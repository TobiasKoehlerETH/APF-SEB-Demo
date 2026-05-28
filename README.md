# APF-SEB Demo

Tauri 2 desktop app for the APF-SEB force sensor workflow. The app streams APF serial lines, shows live force, temperature, sensor serial number, and a force history plot, and can export capture logs as CSV.

The current app version is `0.1.0`.

## Launch

```powershell
npm install
npm run dev
```

`npm run dev` starts Vite on `http://127.0.0.1:1420` and opens the Tauri desktop window.

The app lists serial ports in Settings. Selecting a port opens it at `115200` baud, sends `log=0`, `sn`, and `log=20`, then parses payloads shaped like:

```text
100,0,6411,20479,133999
```

Those fields are force in millinewtons, staleness flag, raw counts, temperature in milli-degrees Celsius, and timestamp in milliseconds.

## UI Overview

- The main dashboard shows live force in newtons, temperature, sensor serial number, and a rolling force plot.
- The sidebar has icon buttons for tare and settings.
- Settings lists COM ports, refreshes port discovery, and disconnects the active stream.
- The Log button starts capture; stopping capture exports CSV data with header `timestamp,uncalibrated_output,force_newtons,temperature_raw_c,serial_number`.
- The titlebar update icon checks GitHub Releases and turns active when an updater release is available, including download/install progress text on hover.

## Package

```powershell
npm install
npm run build:tauri
```

The Windows MSI is written under:

```text
src-tauri/target/release/bundle/msi/
```

The release executable is:

```text
src-tauri/target/release/apf-seb-demo.exe
```

## Publish Auto Updates

The installed app checks GitHub Releases for signed Tauri updater metadata:

```text
https://github.com/TobiasKoehlerETH/APF-SEB-Demo/releases/latest/download/latest.json
```

The GitHub repository needs these secrets before publishing signed updater artifacts:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Run `.github/workflows/release.yml` manually to publish a new release. Choose `patch`, `minor`, or `major`, or pass an exact SemVer version such as `0.1.0`. The workflow updates `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, commits the version bump, tags the release, and publishes the MSI plus updater metadata.

Local version bumps use:

```powershell
node scripts/bump-version.mjs --bump patch
```

Each GitHub release should include release notes with a bullet-point list of major user-facing changes and this installer guidance:

```text
Download the Windows installer asset named APF-SEB.Demo_<version>_x64_en-US.msi.
```

The `.sig` file and `latest.json` asset are used by the in-app auto updater and do not need to be downloaded manually.

## Verify

```powershell
npm run build
npm test
```

`npm run build` runs TypeScript, builds the Vite frontend, and compiles the Rust backend. `npm test` runs `cargo test --manifest-path src-tauri/Cargo.toml`.
