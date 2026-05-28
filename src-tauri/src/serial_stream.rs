use serde::Serialize;
use serialport::SerialPort;
use std::io::{ErrorKind, Read, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const BAUD_RATE: u32 = 115_200;
const READ_TIMEOUT: Duration = Duration::from_millis(500);
const RETRY_INTERVAL: Duration = Duration::from_millis(2_500);
const INIT_COMMAND_PAUSE: Duration = Duration::from_millis(200);
const TARE_COMMAND: &str = "tare";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortInfo {
    path: String,
    description: String,
    manufacturer: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct SelectSerialPortResult {
    port: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct TareResult {
    success: Option<bool>,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SensorDataPayload {
    raw_value: i64,
    port: u8,
    temperature_mc: Option<i64>,
    age_us: Option<u64>,
    received_at: u64,
    force_newtons: Option<f64>,
    timestamp_ms: Option<i64>,
}

#[derive(Clone, Serialize)]
struct SensorStatusPayload {
    level: &'static str,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SensorMetadataPayload {
    serial_number: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedSensorLine {
    pub force_newtons: f64,
    pub stale: bool,
    pub counts: i64,
    pub temperature_c: f64,
    pub timestamp_ms: i64,
}

struct WorkerState {
    stop: Option<Arc<AtomicBool>>,
    command_tx: Option<mpsc::Sender<String>>,
    handle: Option<JoinHandle<()>>,
}

pub struct SerialController {
    worker: Mutex<WorkerState>,
}

impl SerialController {
    pub fn new() -> Self {
        Self {
            worker: Mutex::new(WorkerState {
                stop: None,
                command_tx: None,
                handle: None,
            }),
        }
    }

    pub fn list_serial_ports(&self) -> Result<Vec<SerialPortInfo>, String> {
        serialport::available_ports()
            .map_err(|error| format!("Serial port scan failed: {error}"))
            .map(|ports| {
                ports
                    .into_iter()
                    .map(|port| SerialPortInfo {
                        path: port.port_name,
                        description: port_description(&port.port_type),
                        manufacturer: port_manufacturer(&port.port_type),
                    })
                    .collect()
            })
    }

    pub fn select_port(
        &self,
        app: AppHandle,
        port: Option<String>,
    ) -> Result<SelectSerialPortResult, String> {
        let normalized = port.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        let mut worker = self
            .worker
            .lock()
            .map_err(|_| "serial worker lock poisoned".to_string())?;
        stop_worker(&mut worker);

        if let Some(port_name) = normalized.clone() {
            let stop = Arc::new(AtomicBool::new(false));
            let (command_tx, command_rx) = mpsc::channel();
            let thread_stop = stop.clone();
            let thread_port_name = port_name.clone();
            let handle = thread::spawn(move || {
                run_serial_worker(app, thread_port_name, thread_stop, command_rx);
            });

            worker.stop = Some(stop);
            worker.command_tx = Some(command_tx);
            worker.handle = Some(handle);
        } else {
            emit_status(
                &app,
                "info",
                "Serial stream paused. Select a COM port to connect.",
            );
        }

        Ok(SelectSerialPortResult { port: normalized })
    }

    pub fn tare(&self) -> TareResult {
        match self.send_command(TARE_COMMAND) {
            Ok(()) => TareResult {
                success: Some(true),
                error: None,
            },
            Err(error) => TareResult {
                success: None,
                error: Some(error),
            },
        }
    }

    fn send_command(&self, command: &str) -> Result<(), String> {
        let worker = self
            .worker
            .lock()
            .map_err(|_| "serial worker lock poisoned".to_string())?;
        let tx = worker
            .command_tx
            .as_ref()
            .ok_or_else(|| "Sensor process is not ready for commands.".to_string())?;
        tx.send(command.to_string())
            .map_err(|_| "Sensor process is not ready for commands.".to_string())
    }
}

impl Drop for SerialController {
    fn drop(&mut self) {
        if let Ok(mut worker) = self.worker.lock() {
            stop_worker(&mut worker);
        }
    }
}

fn stop_worker(worker: &mut WorkerState) {
    if let Some(stop) = worker.stop.take() {
        stop.store(true, Ordering::Relaxed);
    }
    worker.command_tx.take();
    if let Some(handle) = worker.handle.take() {
        let _ = handle.join();
    }
}

fn run_serial_worker(
    app: AppHandle,
    port_name: String,
    stop: Arc<AtomicBool>,
    command_rx: mpsc::Receiver<String>,
) {
    emit_status(&app, "info", "Waiting for data...");

    while !stop.load(Ordering::Relaxed) {
        let mut port = match serialport::new(&port_name, BAUD_RATE)
            .timeout(READ_TIMEOUT)
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None)
            .open()
        {
            Ok(port) => port,
            Err(error) => {
                emit_status(&app, "error", &format!("Could not open {port_name}: {error}"));
                sleep_or_stop(&stop, RETRY_INTERVAL);
                continue;
            }
        };

        let _ = port.clear(serialport::ClearBuffer::Input);
        emit_status(&app, "info", &format!("Connected to {port_name} at {BAUD_RATE} baud."));
        send_init_commands(&mut port, &stop);

        let mut read_buf = [0u8; 512];
        let mut line_buf: Vec<u8> = Vec::with_capacity(128);

        while !stop.load(Ordering::Relaxed) {
            while let Ok(command) = command_rx.try_recv() {
                if let Err(error) = send_serial_command(&mut port, &command) {
                    emit_status(&app, "error", &format!("Failed to forward command: {error}"));
                    break;
                }
            }

            match port.read(&mut read_buf) {
                Ok(bytes_read) => {
                    for byte in &read_buf[..bytes_read] {
                        match *byte {
                            b'\n' | b'\r' => {
                                if !line_buf.is_empty() {
                                    handle_line(&app, &line_buf);
                                    line_buf.clear();
                                }
                            }
                            byte => line_buf.push(byte),
                        }
                    }
                }
                Err(error) if error.kind() == ErrorKind::TimedOut => {}
                Err(error) => {
                    emit_status(&app, "error", &format!("{port_name} read failed: {error}"));
                    break;
                }
            }
        }
    }
}

pub fn init_commands() -> [&'static str; 4] {
    [TARE_COMMAND, "log=0", "sn", "log=20"]
}

fn send_init_commands(port: &mut Box<dyn SerialPort>, stop: &AtomicBool) {
    for command in init_commands() {
        if stop.load(Ordering::Relaxed) {
            return;
        }
        let _ = send_serial_command(port, command);
        sleep_or_stop(stop, INIT_COMMAND_PAUSE);
    }
}

fn send_serial_command(port: &mut Box<dyn SerialPort>, command: &str) -> std::io::Result<()> {
    let line = format!("{}\n", command.trim());
    port.write_all(line.as_bytes())?;
    port.flush()
}

fn handle_line(app: &AppHandle, raw_line: &[u8]) {
    let decoded = match std::str::from_utf8(raw_line) {
        Ok(value) => value.trim(),
        Err(_) => {
            emit_status(app, "error", "Dropped non-UTF8 payload from serial stream.");
            return;
        }
    };

    if decoded.is_empty() {
        return;
    }

    if let Some(serial_number) = normalize_serial_announcement(decoded) {
        let _ = app.emit("sensor:metadata", SensorMetadataPayload { serial_number });
        return;
    }

    match parse_sensor_payload(decoded) {
        Some(parsed) => {
            let _ = app.emit(
                "sensor:data",
                SensorDataPayload {
                    raw_value: parsed.counts,
                    port: 0,
                    temperature_mc: Some((parsed.temperature_c * 1_000_000.0).round() as i64),
                    age_us: None,
                    received_at: now_ms(),
                    force_newtons: Some(parsed.force_newtons),
                    timestamp_ms: Some(parsed.timestamp_ms),
                },
            );
        }
        None => {
            emit_status(app, "error", &format!("Rejected malformed payload: {decoded}"));
        }
    }
}

pub fn parse_sensor_payload(raw_line: &str) -> Option<ParsedSensorLine> {
    let parts: Vec<&str> = raw_line
        .split(',')
        .map(str::trim)
        .filter(|piece| !piece.is_empty())
        .collect();
    if parts.len() < 5 {
        return None;
    }

    let force_mn = parts.first()?.parse::<f64>().ok()?;
    let stale_flag = parts.get(1)?.parse::<i64>().ok()?;
    let counts = parts.get(2)?.parse::<i64>().ok()?;
    let temperature_mdeg_c = parts.get(3)?.parse::<f64>().ok()?;
    let timestamp_ms = parts.last()?.parse::<i64>().ok()?;

    Some(ParsedSensorLine {
        force_newtons: force_mn / 1000.0,
        stale: stale_flag != 0,
        counts,
        temperature_c: temperature_mdeg_c / 1000.0,
        timestamp_ms,
    })
}

pub fn normalize_serial_announcement(raw_line: &str) -> Option<String> {
    let trimmed = raw_line.trim();
    if trimmed.is_empty() {
        return None;
    }

    let upper = trimmed.to_ascii_uppercase();
    let prefixed = upper.starts_with("SERIAL:")
        || upper.starts_with("SN:")
        || upper.starts_with("SN ");
    if prefixed {
        return trimmed
            .split_once(':')
            .map(|(_, value)| value.trim())
            .or_else(|| trimmed.split_once(' ').map(|(_, value)| value.trim()))
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
    }

    if looks_like_bare_serial(trimmed) {
        return Some(trimmed.to_string());
    }

    None
}

fn looks_like_bare_serial(value: &str) -> bool {
    (4..=64).contains(&value.len())
        && !value.contains(',')
        && !value.contains(':')
        && !value.contains(' ')
        && value.chars().all(|ch| ch.is_ascii_alphanumeric())
}

fn emit_status(app: &AppHandle, level: &'static str, message: &str) {
    let _ = app.emit(
        "sensor:status",
        SensorStatusPayload {
            level,
            message: message.to_string(),
        },
    );
}

fn sleep_or_stop(stop: &AtomicBool, duration: Duration) {
    let start = std::time::Instant::now();
    while start.elapsed() < duration && !stop.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(25));
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn port_description(port_type: &serialport::SerialPortType) -> String {
    match port_type {
        serialport::SerialPortType::UsbPort(info) => info.product.clone().unwrap_or_default(),
        serialport::SerialPortType::PciPort => "PCI serial port".to_string(),
        serialport::SerialPortType::BluetoothPort => "Bluetooth serial port".to_string(),
        serialport::SerialPortType::Unknown => String::new(),
    }
}

fn port_manufacturer(port_type: &serialport::SerialPortType) -> Option<String> {
    match port_type {
        serialport::SerialPortType::UsbPort(info) => info.manufacturer.clone(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_apf_force_line() {
        let parsed = parse_sensor_payload("100,0,6411,20479,133999").unwrap();
        assert!((parsed.force_newtons - 0.1).abs() < f64::EPSILON);
        assert!(!parsed.stale);
        assert_eq!(parsed.counts, 6411);
        assert!((parsed.temperature_c - 20.479).abs() < f64::EPSILON);
        assert_eq!(parsed.timestamp_ms, 133999);
    }

    #[test]
    fn normalizes_prefixed_and_bare_serial_numbers() {
        assert_eq!(
            normalize_serial_announcement("SERIAL: 1F5EB423").as_deref(),
            Some("1F5EB423"),
        );
        assert_eq!(
            normalize_serial_announcement("SN 1F5EB423").as_deref(),
            Some("1F5EB423"),
        );
        assert_eq!(
            normalize_serial_announcement("1F5EB423").as_deref(),
            Some("1F5EB423"),
        );
        assert_eq!(normalize_serial_announcement("10,0,1,2,3"), None);
    }

    #[test]
    fn init_command_sequence_matches_apf_helper() {
        assert_eq!(init_commands(), ["tare", "log=0", "sn", "log=20"]);
    }
}
