use crate::models::UsageData;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("Authentication error (status {status_code})")]
    AuthError { status_code: u16 },
    #[error("HTTP error (status {status_code})")]
    HttpError { status_code: u16 },
    #[error("Missing credentials")]
    MissingCredentials,
    #[error("Invalid response: {0}")]
    InvalidResponse(String),
    #[error("Network error: {0}")]
    NetworkError(String),
}

impl serde::Serialize for ApiError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub struct FetchResult {
    pub data: UsageData,
    pub new_session_key: Option<String>,
}

pub async fn fetch_usage(
    session_key: &str,
    org_id: &str,
) -> Result<FetchResult, ApiError> {
    if session_key.is_empty() || org_id.is_empty() {
        return Err(ApiError::MissingCredentials);
    }

    let url = format!(
        "https://claude.ai/api/organizations/{}/usage",
        org_id
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("accept", "*/*")
        .header("content-type", "application/json")
        .header("anthropic-client-platform", "web_claude_ai")
        .header("Cookie", format!("sessionKey={}", session_key))
        .send()
        .await
        .map_err(|e| ApiError::NetworkError(e.to_string()))?;

    let status = response.status().as_u16();

    // Extract Set-Cookie header before consuming response
    let new_session_key = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .find_map(|val| {
            let val_str = val.to_str().ok()?;
            parse_set_cookie_session_key(val_str)
        });

    if status == 401 || status == 403 {
        return Err(ApiError::AuthError { status_code: status });
    }

    if !response.status().is_success() {
        return Err(ApiError::HttpError { status_code: status });
    }

    let body = response
        .text()
        .await
        .map_err(|e| ApiError::InvalidResponse(e.to_string()))?;

    let data: UsageData = serde_json::from_str(&body)
        .map_err(|e| ApiError::InvalidResponse(format!("{}: {}", e, &body[..body.len().min(200)])))?;

    Ok(FetchResult {
        data,
        new_session_key,
    })
}

fn parse_set_cookie_session_key(header: &str) -> Option<String> {
    for part in header.split(';') {
        let trimmed = part.trim();
        if let Some(value) = trimmed.strip_prefix("sessionKey=") {
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_set_cookie() {
        let header = "sessionKey=sk-ant-sid01-new; Path=/; HttpOnly; Secure";
        assert_eq!(
            parse_set_cookie_session_key(header),
            Some("sk-ant-sid01-new".to_string())
        );
    }

    #[test]
    fn test_parse_set_cookie_no_match() {
        let header = "other=value; Path=/";
        assert_eq!(parse_set_cookie_session_key(header), None);
    }
}
