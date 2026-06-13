use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::Serialize;
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

async fn generate_embed_token() -> Result<Json<EmbedTokenResponse>, (StatusCode, String)> {
    let public_key = env::var("CRONOFY_SCHEDULER_EMBED_PUBLIC_KEY")
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Missing public key".to_string()))?;

    let embed_secret = env::var("CRONOFY_SCHEDULER_EMBED_SECRET")
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Missing embed secret".to_string()))?;

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

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let state = AppState {
        last_webhook: Arc::new(Mutex::new(None)),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/embed-token", get(generate_embed_token))
        .route("/cronofy/webhook", post(receive_cronofy_webhook))
        .route("/meeting-status", get(get_meeting_status))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
        .await
        .expect("Failed to bind server");

    println!("Backend running on http://127.0.0.1:3001");

    axum::serve(listener, app).await.expect("Server failed");
}