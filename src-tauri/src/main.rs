#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod profile;
mod serial_stream;

use capture::{CaptureSamplePayload, CaptureStatePayload, CaptureStopResultPayload, CaptureStore};
use profile::{is_custom_profile, resolve_profile_id};
use serial_stream::{SelectSerialPortResult, SerialController, SerialPortInfo, TareResult};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    serial: Arc<SerialController>,
    capture: Arc<CaptureStore>,
}

#[tauri::command]
fn list_serial_ports(state: State<'_, AppState>) -> Result<Vec<SerialPortInfo>, String> {
    state.serial.list_serial_ports()
}

#[tauri::command]
fn select_serial_port(
    app: AppHandle,
    state: State<'_, AppState>,
    port: Option<String>,
) -> Result<SelectSerialPortResult, String> {
    state.serial.select_port(app, port)
}

#[tauri::command]
fn tare(state: State<'_, AppState>) -> TareResult {
    state.serial.tare()
}

#[tauri::command]
fn start_capture(
    app: AppHandle,
    state: State<'_, AppState>,
    directory: Option<String>,
) -> Result<CaptureStatePayload, String> {
    let snapshot = state.capture.start_capture(directory)?;
    let _ = app.emit("sensor:capture:state", snapshot.clone());
    Ok(snapshot)
}

#[tauri::command]
fn stop_capture(
    app: AppHandle,
    state: State<'_, AppState>,
    serial_number: Option<String>,
) -> CaptureStopResultPayload {
    let result = state.capture.stop_capture(serial_number);
    let _ = app.emit("sensor:capture:state", result.state.clone());
    result
}

#[tauri::command]
fn get_capture_state(state: State<'_, AppState>) -> CaptureStatePayload {
    state.capture.get_state()
}

#[tauri::command]
fn record_capture_sample(
    app: AppHandle,
    state: State<'_, AppState>,
    sample: CaptureSamplePayload,
) -> CaptureStatePayload {
    let snapshot = state.capture.queue_sample(sample);
    let _ = app.emit("sensor:capture:state", snapshot.clone());
    snapshot
}

fn main() {
    let serial = Arc::new(SerialController::new());
    let capture = Arc::new(CaptureStore::new());
    let profile_id = resolve_profile_id();
    let is_profile_custom = is_custom_profile(&profile_id);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState { serial, capture })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            select_serial_port,
            tare,
            start_capture,
            stop_capture,
            get_capture_state,
            record_capture_sample,
        ])
        .setup(move |app| {
            if is_profile_custom {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title(&format!("APF-SEB Demo [{profile_id}]"));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running APF-SEB Demo");
}
