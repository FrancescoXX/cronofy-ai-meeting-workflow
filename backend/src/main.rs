use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, Redirect},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, SecondsFormat, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env,
    sync::{Arc, Mutex},
};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    last_webhook: Arc<Mutex<Option<Value>>>,
    auth: Arc<Mutex<Option<AuthSession>>>,
    last_slots: Arc<Mutex<Vec<AvailabilitySlot>>>,
}

#[derive(Clone, Debug)]
struct AuthSession {
    access_token: String,
    refresh_token: Option<String>,
    sub: String,
    calendar_id: Option<String>,
}

#[derive(Serialize)]
struct Claims {
    iss: String,
    iat: i64,
    exp: i64,
    aud: String,
    jti: String,
}

#[derive(Serialize)]
struct EmbedTokenResponse {
    embed_token: String,
}

#[derive(Serialize)]
struct WebhookResponse {
    status: String,
}

#[derive(Deserialize)]
struct MeetingRequest {
    prompt: String,
    duration_minutes: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
struct AvailabilitySlot {
    id: String,
    label: String,
    start: String,
    end: String,
}

#[derive(Serialize)]
struct AvailabilityResponse {
    source: String,
    request: String,
    duration_minutes: u32,
    slots: Vec<AvailabilitySlot>,
}

#[derive(Deserialize)]
struct BookMeetingRequest {
    slot_id: Option<String>,
}

#[derive(Serialize)]
struct BookMeetingResponse {
    status: String,
    meeting_id: String,
    selected_slot: String,
    calendar_updated: bool,
    workflow_updated: bool,
}

#[derive(Serialize)]
struct MeetingContextResponse {
    status: String,
    transcript_status: String,
    summary: String,
    next_actions: Vec<String>,
}

#[derive(Serialize)]
struct AgentWorkflowResponse {
    status: String,
    prompt: String,
    steps: Vec<String>,
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    code: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    sub: Option<String>,
    account_id: Option<String>,
}

#[derive(Deserialize)]
struct CalendarsResponse {
    calendars: Vec<CronofyCalendar>,
}

#[derive(Clone, Deserialize, Serialize)]
struct CronofyCalendar {
    calendar_id: String,
    calendar_name: String,
    calendar_readonly: bool,
    calendar_deleted: bool,
    calendar_primary: bool,
    provider_name: Option<String>,
}

fn data_center_url() -> String {
    env::var("CRONOFY_DATA_CENTER_URL")
        .unwrap_or_else(|_| "https://api.cronofy.com".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn app_url() -> String {
    env::var("CRONOFY_APP_URL")
        .unwrap_or_else(|_| "https://app.cronofy.com".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn encode_component(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~' => vec![byte as char],
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn require_env(name: &str) -> Result<String, (StatusCode, String)> {
    env::var(name).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Missing environment variable: {name}"),
        )
    })
}

async fn generate_embed_token() -> Result<Json<EmbedTokenResponse>, (StatusCode, String)> {
    let public_key = require_env("CRONOFY_SCHEDULER_EMBED_PUBLIC_KEY")?;
    let embed_secret = require_env("CRONOFY_SCHEDULER_EMBED_SECRET")?;

    let now = Utc::now().timestamp();

    let claims = Claims {
        iss: public_key,
        iat: now,
        exp: now + 60 * 60 * 4,
        aud: "scheduler_embed".to_string(),
        jti: Uuid::new_v4().to_string(),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(embed_secret.as_bytes()),
    )
    .map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to generate token: {err}"),
        )
    })?;

    Ok(Json(EmbedTokenResponse { embed_token: token }))
}

async fn receive_cronofy_webhook(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Json<WebhookResponse> {
    println!("Cronofy webhook received:");
    println!("{:#}", payload);

    let mut last_webhook = state.last_webhook.lock().expect("Failed to lock state");
    *last_webhook = Some(payload);

    Json(WebhookResponse {
        status: "ok".to_string(),
    })
}

async fn get_meeting_status(State(state): State<AppState>) -> Json<Value> {
    let last_webhook = state.last_webhook.lock().expect("Failed to lock state");

    match &*last_webhook {
        Some(payload) => Json(json!({
            "has_update": true,
            "last_update": payload
        })),
        None => Json(json!({
            "has_update": false,
            "last_update": null
        })),
    }
}

async fn oauth_start() -> Result<Redirect, (StatusCode, String)> {
    let client_id = require_env("CRONOFY_CLIENT_ID")?;
    let redirect_uri = require_env("CRONOFY_REDIRECT_URI")?;

    let scope = "read_write";
    let state = Uuid::new_v4().to_string();

    let url = format!(
        "{}/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}",
        app_url(),
        encode_component(&client_id),
        encode_component(&redirect_uri),
        encode_component(scope),
        encode_component(&state),
    );

    Ok(Redirect::temporary(&url))
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<Html<String>, (StatusCode, String)> {
    if let Some(error) = query.error {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Cronofy authorization failed: {error}"),
        ));
    }

    let code = query.code.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Missing OAuth code from Cronofy callback".to_string(),
        )
    })?;

    let client_id = require_env("CRONOFY_CLIENT_ID")?;
    let client_secret = require_env("CRONOFY_CLIENT_SECRET")?;
    let redirect_uri = require_env("CRONOFY_REDIRECT_URI")?;

    let client = Client::new();

    let response = client
        .post(format!("{}/oauth/token", data_center_url()))
        .json(&json!({
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri
        }))
        .send()
        .await
        .map_err(|err| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Failed to call Cronofy token endpoint: {err}"),
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        return Err((
            StatusCode::BAD_GATEWAY,
            format!("Cronofy token exchange failed: {status} {body}"),
        ));
    }

    let token: TokenResponse = response.json().await.map_err(|err| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse Cronofy token response: {err}"),
        )
    })?;

    let sub = token.sub.or(token.account_id).ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            "Cronofy token response did not include sub/account_id".to_string(),
        )
    })?;

    let mut auth = state.auth.lock().expect("Failed to lock auth state");
    *auth = Some(AuthSession {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        sub,
        calendar_id: None,
    });

    Ok(Html(
        r#"
        <html>
          <body style="font-family: sans-serif; padding: 40px;">
            <h1>Cronofy connected</h1>
            <p>You can close this tab and go back to the demo.</p>
            <p>Next step: call <code>/calendars</code> once, then use the frontend.</p>
          </body>
        </html>
        "#
        .to_string(),
    ))
}

async fn auth_status(State(state): State<AppState>) -> Json<Value> {
    let auth = state.auth.lock().expect("Failed to lock auth state");

    match &*auth {
        Some(session) => Json(json!({
            "connected": true,
            "sub": session.sub,
            "calendar_id": session.calendar_id,
            "has_refresh_token": session.refresh_token.is_some()
        })),
        None => Json(json!({
            "connected": false
        })),
    }
}

async fn list_calendars(State(state): State<AppState>) -> Result<Json<Value>, (StatusCode, String)> {
    let session = {
        let auth = state.auth.lock().expect("Failed to lock auth state");
        auth.clone().ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Cronofy is not connected yet. Open http://127.0.0.1:3001/oauth/start first.".to_string(),
            )
        })?
    };

    let client = Client::new();

    let response = client
        .get(format!("{}/v1/calendars", data_center_url()))
        .bearer_auth(&session.access_token)
        .send()
        .await
        .map_err(|err| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Failed to call Cronofy calendars endpoint: {err}"),
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        return Err((
            StatusCode::BAD_GATEWAY,
            format!("Cronofy calendars request failed: {status} {body}"),
        ));
    }

    let calendars_response: CalendarsResponse = response.json().await.map_err(|err| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse Cronofy calendars response: {err}"),
        )
    })?;

    let writable_calendar = calendars_response
        .calendars
        .iter()
        .find(|calendar| {
            calendar.calendar_primary
                && !calendar.calendar_readonly
                && !calendar.calendar_deleted
        })
        .or_else(|| {
            calendars_response
                .calendars
                .iter()
                .find(|calendar| !calendar.calendar_readonly && !calendar.calendar_deleted)
        });

    if let Some(calendar) = writable_calendar {
        let mut auth = state.auth.lock().expect("Failed to lock auth state");

        if let Some(auth_session) = auth.as_mut() {
            auth_session.calendar_id = Some(calendar.calendar_id.clone());
        }
    }

    Ok(Json(json!({
        "calendars": calendars_response.calendars,
        "selected_calendar_id": writable_calendar.map(|calendar| calendar.calendar_id.clone())
    })))
}

fn build_query_periods() -> Vec<Value> {
    let mut periods = Vec::new();

    for day_offset in 1..=7 {
        let date = Utc::now().date_naive() + Duration::days(day_offset);

        let start = date
            .and_hms_opt(8, 0, 0)
            .expect("Valid start time")
            .and_utc()
            .to_rfc3339_opts(SecondsFormat::Secs, true);

        let end = date
            .and_hms_opt(20, 0, 0)
            .expect("Valid end time")
            .and_utc()
            .to_rfc3339_opts(SecondsFormat::Secs, true);

        periods.push(json!({
            "start": start,
            "end": end
        }));
    }

    periods
}

fn slot_label(start: &str, end: &str) -> String {
    format!("{start} → {end}")
}

async fn find_availability(
    State(state): State<AppState>,
    Json(payload): Json<MeetingRequest>,
) -> Result<Json<AvailabilityResponse>, (StatusCode, String)> {
    let session = {
        let auth = state.auth.lock().expect("Failed to lock auth state");
        auth.clone().ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Cronofy is not connected yet. Open http://127.0.0.1:3001/oauth/start first.".to_string(),
            )
        })?
    };

    let calendar_id = session.calendar_id.clone().ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "No writable calendar selected yet. Open http://127.0.0.1:3001/calendars first.".to_string(),
        )
    })?;

    let client_secret = require_env("CRONOFY_CLIENT_SECRET")?;
    let duration_minutes = payload.duration_minutes.unwrap_or(30);

    let request_body = json!({
        "participants": [
            {
                "members": [
                    {
                        "sub": session.sub,
                        "calendar_ids": [calendar_id]
                    }
                ],
                "required": "all"
            }
        ],
        "required_duration": {
            "minutes": duration_minutes
        },
        "query_periods": build_query_periods(),
        "start_interval": {
            "minutes": 30
        },
        "response_format": "slots",
        "max_results": 10
    });

    println!("Availability request:");
    println!("{:#}", request_body);

    let client = Client::new();

    let response = client
        .post(format!("{}/v1/availability", data_center_url()))
        .bearer_auth(client_secret)
        .json(&request_body)
        .send()
        .await
        .map_err(|err| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Failed to call Cronofy availability endpoint: {err}"),
            )
        })?;

    let status = response.status();
    let value: Value = response.json().await.map_err(|err| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to parse Cronofy availability response: {err}"),
        )
    })?;

    println!("Availability response:");
    println!("{:#}", value);

    if !status.is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("Cronofy availability request failed: {status} {value}"),
        ));
    }

    let available_slots = value
        .get("available_slots")
        .and_then(|slots| slots.as_array())
        .cloned()
        .unwrap_or_default();

    let slots: Vec<AvailabilitySlot> = available_slots
        .iter()
        .take(6)
        .enumerate()
        .filter_map(|(index, slot)| {
            let start = slot.get("start")?.as_str()?.to_string();
            let end = slot.get("end")?.as_str()?.to_string();

            Some(AvailabilitySlot {
                id: format!("slot-{:03}", index + 1),
                label: slot_label(&start, &end),
                start,
                end,
            })
        })
        .collect();

    let mut last_slots = state.last_slots.lock().expect("Failed to lock slots state");
    *last_slots = slots.clone();

    Ok(Json(AvailabilityResponse {
        source: "Cronofy Availability API".to_string(),
        request: payload.prompt,
        duration_minutes,
        slots,
    }))
}

async fn book_meeting(
    State(state): State<AppState>,
    Json(payload): Json<BookMeetingRequest>,
) -> Result<Json<BookMeetingResponse>, (StatusCode, String)> {
    let session = {
        let auth = state.auth.lock().expect("Failed to lock auth state");
        auth.clone().ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Cronofy is not connected yet. Open http://127.0.0.1:3001/oauth/start first.".to_string(),
            )
        })?
    };

    let calendar_id = session.calendar_id.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "No writable calendar selected yet. Open http://127.0.0.1:3001/calendars first.".to_string(),
        )
    })?;

    let selected_slot_id = payload.slot_id.unwrap_or_else(|| "slot-001".to_string());

    let selected_slot = {
        let last_slots = state.last_slots.lock().expect("Failed to lock slots state");

        last_slots
            .iter()
            .find(|slot| slot.id == selected_slot_id)
            .cloned()
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "Selected slot not found. Run availability again first.".to_string(),
                )
            })?
    };

    let event_id = format!("cronofy-ai-demo-{}", Uuid::new_v4());

    let event_body = json!({
        "event_id": event_id,
        "summary": "AI Meeting Workflow Demo",
        "description": "Created by the Cronofy AI Meeting Coordinator demo.",
        "start": selected_slot.start,
        "end": selected_slot.end,
        "tzid": "Europe/Rome",
        "location": {
            "description": "Online"
        },
        "reminders": []
    });

    println!("Create event request:");
    println!("{:#}", event_body);

    let client = Client::new();

    let response = client
        .post(format!(
            "{}/v1/calendars/{}/events",
            data_center_url(),
            calendar_id
        ))
        .bearer_auth(&session.access_token)
        .json(&event_body)
        .send()
        .await
        .map_err(|err| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Failed to call Cronofy events endpoint: {err}"),
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        return Err((
            StatusCode::BAD_GATEWAY,
            format!("Cronofy event creation failed: {status} {body}"),
        ));
    }

    Ok(Json(BookMeetingResponse {
        status: "booked".to_string(),
        meeting_id: event_id,
        selected_slot: selected_slot_id,
        calendar_updated: true,
        workflow_updated: true,
    }))
}

async fn get_meeting_context() -> Json<MeetingContextResponse> {
    Json(MeetingContextResponse {
        status: "ready".to_string(),
        transcript_status: "waiting for Meeting Agent integration".to_string(),
        summary: "The meeting was created in the calendar. In the complete flow, Meeting Agents can bring transcript, summary, and follow-up context back into the product.".to_string(),
        next_actions: vec![
            "Send confirmation to the attendee".to_string(),
            "Prepare the meeting brief".to_string(),
            "Use Meeting Agent output after the call".to_string(),
        ],
    })
}

async fn get_agent_workflow() -> Json<AgentWorkflowResponse> {
    Json(AgentWorkflowResponse {
        status: "ready".to_string(),
        prompt: "Find 30 minutes with the customer next week and prepare the meeting context.".to_string(),
        steps: vec![
            "Agent asks Cronofy for real availability".to_string(),
            "Cronofy returns valid calendar-aware time slots".to_string(),
            "The app books the selected meeting through the Calendar API".to_string(),
            "Meeting context can flow back into the app after the meeting".to_string(),
        ],
    })
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let state = AppState {
        last_webhook: Arc::new(Mutex::new(None)),
        auth: Arc::new(Mutex::new(None)),
        last_slots: Arc::new(Mutex::new(Vec::new())),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/embed-token", get(generate_embed_token))
        .route("/cronofy/webhook", post(receive_cronofy_webhook))
        .route("/meeting-status", get(get_meeting_status))
        .route("/oauth/start", get(oauth_start))
        .route("/oauth/callback", get(oauth_callback))
        .route("/auth-status", get(auth_status))
        .route("/calendars", get(list_calendars))
        .route("/availability", post(find_availability))
        .route("/book-meeting", post(book_meeting))
        .route("/meeting-context", get(get_meeting_context))
        .route("/agent-workflow", get(get_agent_workflow))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
        .await
        .expect("Failed to bind server");

    println!("Backend running on http://127.0.0.1:3001");
    println!("Connect Cronofy: http://127.0.0.1:3001/oauth/start");

    axum::serve(listener, app).await.expect("Server failed");
}