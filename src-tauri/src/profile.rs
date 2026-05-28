pub const PROFILE_FLAG: &str = "--profile";
pub const PROFILE_ENV_VAR: &str = "APF_SEB_PROFILE_ID";
pub const DEFAULT_PROFILE_ID: &str = "default";

pub fn sanitize_profile_id(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut normalized = String::with_capacity(trimmed.len());
    let mut previous_was_underscore = false;
    for ch in trimmed.chars() {
        let next = if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
            ch
        } else {
            '_'
        };

        if next == '_' {
            if previous_was_underscore {
                continue;
            }
            previous_was_underscore = true;
        } else {
            previous_was_underscore = false;
        }
        normalized.push(next);
    }

    let trimmed = normalized.trim_matches('_');
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.chars().take(48).collect())
}

pub fn resolve_profile_id() -> String {
    sanitize_profile_id(extract_flag_value(PROFILE_FLAG).as_deref())
        .or_else(|| sanitize_profile_id(std::env::var(PROFILE_ENV_VAR).ok().as_deref()))
        .unwrap_or_else(|| DEFAULT_PROFILE_ID.to_string())
}

pub fn is_custom_profile(profile_id: &str) -> bool {
    profile_id != DEFAULT_PROFILE_ID
}

fn extract_flag_value(flag: &str) -> Option<String> {
    let eq_prefix = format!("{flag}=");
    let args: Vec<String> = std::env::args().collect();
    for (index, arg) in args.iter().enumerate() {
        if let Some(value) = arg.strip_prefix(&eq_prefix) {
            return Some(value.to_string());
        }
        if arg == flag {
            return args.get(index + 1).cloned();
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_ids_are_sanitized_for_profile_paths() {
        assert_eq!(
            sanitize_profile_id(Some(" press 1 / left ")).as_deref(),
            Some("press_1_left"),
        );
        assert_eq!(sanitize_profile_id(Some("___")).as_deref(), None);
        assert_eq!(
            sanitize_profile_id(Some("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"))
                .unwrap()
                .len(),
            48,
        );
    }
}
