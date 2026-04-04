use uuid::Uuid;

const SERVICE_NAME: &str = "com.claudeusage.desktop";

fn scoped_key(account_id: &Uuid, key: &str) -> String {
    format!("{}-{}", account_id, key)
}

pub fn save_session_key(account_id: &Uuid, value: &str) -> Result<(), String> {
    let key = scoped_key(account_id, "sessionKey");
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Failed to save session key: {}", e))
}

pub fn read_session_key(account_id: &Uuid) -> Option<String> {
    let key = scoped_key(account_id, "sessionKey");
    let entry = keyring::Entry::new(SERVICE_NAME, &key).ok()?;
    entry.get_password().ok()
}

pub fn delete_session_key(account_id: &Uuid) -> Result<(), String> {
    let key = scoped_key(account_id, "sessionKey");
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    // Ignore "not found" errors on delete
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete session key: {}", e)),
    }
}
