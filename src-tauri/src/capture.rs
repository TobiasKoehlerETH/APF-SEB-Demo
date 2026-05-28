use chrono::{DateTime, Local, SecondsFormat, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const MAX_CSV_DATA_ROWS: usize = 1_048_575;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSamplePayload {
    pub timestamp: f64,
    pub uncalibrated_output: f64,
    pub force_newtons: f64,
    pub raw_temperature_deg_c: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatePayload {
    pub active: bool,
    pub started_at: Option<u64>,
    pub total_count: usize,
    pub pending_count: usize,
    pub last_csv_path: Option<String>,
    pub last_error: Option<String>,
    pub exporting: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStopResultPayload {
    pub state: CaptureStatePayload,
    pub csv_path: Option<String>,
    pub csv_paths: Vec<String>,
}

#[derive(Default)]
struct CaptureInner {
    state: CaptureStatePayload,
    active_directory: Option<PathBuf>,
    last_selected_directory: Option<PathBuf>,
    active_file_base: Option<String>,
    active_serial_number: Option<String>,
    rows: Vec<CaptureSamplePayload>,
}

pub struct CaptureStore {
    inner: Mutex<CaptureInner>,
}

impl Default for CaptureStatePayload {
    fn default() -> Self {
        Self {
            active: false,
            started_at: None,
            total_count: 0,
            pending_count: 0,
            last_csv_path: None,
            last_error: None,
            exporting: false,
        }
    }
}

impl CaptureStore {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(CaptureInner::default()),
        }
    }

    pub fn get_state(&self) -> CaptureStatePayload {
        self.inner
            .lock()
            .map(|inner| inner.state.clone())
            .unwrap_or_default()
    }

    pub fn start_capture(
        &self,
        directory: Option<String>,
    ) -> Result<CaptureStatePayload, String> {
        let target_directory = directory
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .ok_or_else(|| "No capture directory configured".to_string())?;

        fs::create_dir_all(&target_directory)
            .map_err(|error| format!("Failed to create capture directory: {error}"))?;

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "capture store lock poisoned".to_string())?;
        inner.active_directory = Some(target_directory.clone());
        inner.last_selected_directory = Some(target_directory);
        inner.active_file_base = Some(format_date_for_filename(Local::now()));
        inner.active_serial_number = None;
        inner.rows.clear();
        inner.state = CaptureStatePayload {
            active: true,
            started_at: Some(now_ms()),
            total_count: 0,
            pending_count: 0,
            last_csv_path: None,
            last_error: None,
            exporting: false,
        };
        Ok(inner.state.clone())
    }

    pub fn stop_capture(&self, serial_number: Option<String>) -> CaptureStopResultPayload {
        let mut inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => {
                let state = CaptureStatePayload {
                    last_error: Some("capture store lock poisoned".to_string()),
                    ..CaptureStatePayload::default()
                };
                return CaptureStopResultPayload {
                    state,
                    csv_path: None,
                    csv_paths: Vec::new(),
                };
            }
        };

        if let Some(serial) = serial_number.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }) {
            inner.active_serial_number = Some(serial);
        }

        if !inner.state.active {
            return CaptureStopResultPayload {
                state: inner.state.clone(),
                csv_path: None,
                csv_paths: Vec::new(),
            };
        }

        inner.state.exporting = true;
        let output_directory = inner
            .active_directory
            .clone()
            .or_else(|| inner.last_selected_directory.clone());
        let file_base = inner
            .active_file_base
            .clone()
            .unwrap_or_else(|| format_date_for_filename(Local::now()));
        let file_base = with_serial_suffix(
            &file_base,
            inner.active_serial_number.as_deref().unwrap_or_default(),
        );
        let serial_number = inner.active_serial_number.clone().unwrap_or_default();
        let rows = inner.rows.clone();

        let export_result = output_directory
            .ok_or_else(|| "No capture directory configured".to_string())
            .and_then(|directory| {
                export_rows_to_csv(
                    &directory,
                    &file_base,
                    &serial_number,
                    &rows,
                    MAX_CSV_DATA_ROWS,
                )
            });

        match export_result {
            Ok(paths) => {
                let csv_path = paths.first().cloned();
                inner.state = CaptureStatePayload {
                    active: false,
                    started_at: inner.state.started_at,
                    total_count: rows.len(),
                    pending_count: 0,
                    last_csv_path: csv_path.clone(),
                    last_error: None,
                    exporting: false,
                };
                CaptureStopResultPayload {
                    state: inner.state.clone(),
                    csv_path,
                    csv_paths: paths,
                }
            }
            Err(error) => {
                inner.state = CaptureStatePayload {
                    active: false,
                    started_at: inner.state.started_at,
                    total_count: rows.len(),
                    pending_count: 0,
                    last_csv_path: inner.state.last_csv_path.clone(),
                    last_error: Some(error),
                    exporting: false,
                };
                CaptureStopResultPayload {
                    state: inner.state.clone(),
                    csv_path: None,
                    csv_paths: Vec::new(),
                }
            }
        }
    }

    pub fn queue_sample(&self, sample: CaptureSamplePayload) -> CaptureStatePayload {
        let mut inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return CaptureStatePayload::default(),
        };
        if !inner.state.active || !sample.is_valid() {
            return inner.state.clone();
        }

        inner.rows.push(sample);
        inner.state.total_count = inner.rows.len();
        inner.state.pending_count = 0;
        inner.state.clone()
    }
}

impl CaptureSamplePayload {
    fn is_valid(&self) -> bool {
        self.timestamp.is_finite()
            && self.uncalibrated_output.is_finite()
            && self.force_newtons.is_finite()
            && self
                .raw_temperature_deg_c
                .map(|value| value.is_finite())
                .unwrap_or(true)
    }
}

pub fn sanitize_serial_for_filename(serial: &str) -> String {
    let extracted = serial
        .trim()
        .rsplit_once([':', '-'])
        .map(|(_, value)| value)
        .unwrap_or(serial)
        .split_whitespace()
        .last()
        .unwrap_or_default();
    extracted
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        .collect()
}

fn with_serial_suffix(file_base: &str, serial: &str) -> String {
    let safe_serial = sanitize_serial_for_filename(serial);
    if safe_serial.is_empty() || file_base.ends_with(&format!("-{safe_serial}")) {
        file_base.to_string()
    } else {
        format!("{file_base}-{safe_serial}")
    }
}

fn export_rows_to_csv(
    output_directory: &Path,
    file_base: &str,
    serial_number: &str,
    rows: &[CaptureSamplePayload],
    max_csv_data_rows: usize,
) -> Result<Vec<String>, String> {
    fs::create_dir_all(output_directory)
        .map_err(|error| format!("Failed to create capture directory: {error}"))?;

    let max_rows = max_csv_data_rows.max(1);
    let mut paths = Vec::new();
    let chunks: Vec<&[CaptureSamplePayload]> = if rows.is_empty() {
        vec![rows]
    } else {
        rows.chunks(max_rows).collect()
    };

    for (index, chunk) in chunks.into_iter().enumerate() {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("_part{:02}", index + 1)
        };
        let file_path = output_directory.join(format!("{file_base}_log{suffix}.csv"));
        let mut payload =
            String::from("timestamp,uncalibrated_output,force_newtons,temperature_raw_c,serial_number\n");

        for (row_index, row) in chunk.iter().enumerate() {
            let timestamp = format_timestamp(row.timestamp);
            let temp = row
                .raw_temperature_deg_c
                .map(|value| format_number(value, 3))
                .unwrap_or_default();
            let serial_cell = if index == 0 && row_index == 0 {
                serial_number
            } else {
                ""
            };
            payload.push_str(&format!(
                "{},{},{},{},{}\n",
                timestamp,
                format_number(row.uncalibrated_output, 0),
                format_number(row.force_newtons, 3),
                temp,
                serial_cell,
            ));
        }

        fs::write(&file_path, payload)
            .map_err(|error| format!("Failed to write capture CSV: {error}"))?;
        paths.push(file_path.to_string_lossy().to_string());
    }

    Ok(paths)
}

fn format_timestamp(timestamp_ms: f64) -> String {
    let timestamp_ms = timestamp_ms.round() as i64;
    let dt: DateTime<Utc> = Utc
        .timestamp_millis_opt(timestamp_ms)
        .single()
        .unwrap_or_else(Utc::now);
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn format_number(value: f64, fraction_digits: usize) -> String {
    format!("{value:.fraction_digits$}")
}

fn format_date_for_filename(date: DateTime<Local>) -> String {
    date.format("%Y%m%d-%H%M").to_string()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("apf-seb-demo-{name}-{nonce}"))
    }

    #[test]
    fn serial_filename_sanitizer_extracts_last_token() {
        assert_eq!(
            sanitize_serial_for_filename("Serial number: APF 1F5EB423"),
            "1F5EB423",
        );
        assert_eq!(sanitize_serial_for_filename("bad / name"), "name");
    }

    #[test]
    fn export_writes_header_and_serial_once() {
        let dir = temp_dir("csv");
        let rows = vec![CaptureSamplePayload {
            timestamp: 1_700_000_000_000.0,
            uncalibrated_output: 6411.0,
            force_newtons: 0.1,
            raw_temperature_deg_c: Some(20.479),
        }];

        let paths = export_rows_to_csv(&dir, "20260528-1200-1F5EB423", "1F5EB423", &rows, 10)
            .unwrap();
        let csv = fs::read_to_string(&paths[0]).unwrap();
        assert!(csv.starts_with(
            "timestamp,uncalibrated_output,force_newtons,temperature_raw_c,serial_number\n"
        ));
        assert!(csv.contains(",6411,0.100,20.479,1F5EB423\n"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn export_splits_after_row_limit() {
        let dir = temp_dir("split");
        let rows = vec![
            CaptureSamplePayload {
                timestamp: 1.0,
                uncalibrated_output: 1.0,
                force_newtons: 1.0,
                raw_temperature_deg_c: None,
            };
            3
        ];

        let paths = export_rows_to_csv(&dir, "base", "", &rows, 2).unwrap();
        assert_eq!(paths.len(), 2);
        assert!(paths[1].contains("_part02"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn store_adds_serial_suffix_on_stop() {
        let dir = temp_dir("store");
        let store = CaptureStore::new();
        store
            .start_capture(Some(dir.to_string_lossy().to_string()))
            .unwrap();
        store.queue_sample(CaptureSamplePayload {
            timestamp: 1.0,
            uncalibrated_output: 2.0,
            force_newtons: 3.0,
            raw_temperature_deg_c: None,
        });
        let result = store.stop_capture(Some("SERIAL: 1F5EB423".to_string()));
        assert!(result.csv_path.unwrap().contains("1F5EB423_log.csv"));
        let _ = fs::remove_dir_all(dir);
    }
}
