# Cronofy AI Meeting Workflow Demo

A minimal demo application showing how Cronofy can turn scheduling into an application workflow.

The project uses:

* Next.js frontend
* Rust Axum backend
* Cronofy Scheduler Embed
* Cronofy Scheduler webhooks
* ngrok for local webhook testing

The goal is to show that scheduling is not just a booking widget. A scheduling action can become part of a product workflow: a request is created, an invitee chooses a time, Cronofy updates the calendar, and the application reacts to the booking through a webhook.

## What this demo shows

1. The frontend loads a Cronofy Scheduler Embed button.
2. The Rust backend generates a secure Scheduler Embed token.
3. The user creates a scheduling request through Cronofy.
4. The invitee chooses a time.
5. Cronofy creates the calendar event.
6. Cronofy sends a webhook to the Rust backend.
7. The frontend displays the updated workflow state.

## Architecture

```txt
Next.js frontend
    |
    | GET /embed-token
    v
Rust Axum backend
    |
    | signs Scheduler Embed JWT
    v
Cronofy Scheduler Embed
    |
    | invitee chooses a slot
    v
Cronofy calendar workflow
    |
    | POST /cronofy/webhook
    v
Rust backend stores latest update
    |
    | GET /meeting-status
    v
Next.js frontend shows workflow state
```

## Project structure

```txt
cronofy-ai-meeting-demo/
  backend/
    src/
      main.rs
    Cargo.toml
    .env.example

  frontend/
    src/
      app/
        page.tsx
    package.json

  README.md
```

## Prerequisites

You need:

```txt
Rust
Node.js
npm
A Cronofy developer account
ngrok, or another public tunnel for local webhook testing
```

## Cronofy setup

Create a Cronofy developer application.

Then generate Embedded Scheduler credentials from:

```txt
Developer
Applications
Your Application
Credentials
Embedded Scheduler Credentials
Generate a new embed secret
```

You need two values:

```txt
Embed public key: EMB_...
Embed secret: ESK_...
```

The embed secret must only be stored on the backend. Do not expose it in the frontend.

## Backend setup

Go to the backend folder:

```bash
cd backend
```

Create a `.env` file:

```bash
cp .env.example .env
```

Fill it with your Cronofy Embedded Scheduler credentials:

```env
CRONOFY_SCHEDULER_EMBED_PUBLIC_KEY=EMB_your_public_key
CRONOFY_SCHEDULER_EMBED_SECRET=ESK_your_embed_secret
```

Run the backend:

```bash
cargo run
```

The backend runs on:

```txt
http://127.0.0.1:3001
```

Available endpoints:

```txt
GET  /embed-token
POST /cronofy/webhook
GET  /meeting-status
```

## Frontend setup

Go to the frontend folder:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Open the URL printed by Next.js, usually:

```txt
http://localhost:3000
```

If port 3000 is already in use, Next.js may use another port, for example:

```txt
http://localhost:3002
```

## Local webhook setup with ngrok

Cronofy cannot call `127.0.0.1` directly. For local testing, expose the backend with ngrok.

Keep the Rust backend running on port `3001`, then start ngrok:

```bash
ngrok http 3001
```

ngrok will give you a public URL like:

```txt
https://your-ngrok-domain.ngrok-free.dev
```

Use this as your Cronofy Scheduler webhook callback URL:

```txt
https://your-ngrok-domain.ngrok-free.dev/cronofy/webhook
```

Configure it in Cronofy:

```txt
Developer
Applications
Your Application
Notifications
Scheduler Notification Callback URL
```

## Demo flow

Start the backend:

```bash
cd backend
cargo run
```

Start the frontend:

```bash
cd frontend
npm run dev
```

Start ngrok:

```bash
ngrok http 3001
```

Then:

1. Open the frontend.
2. Click the Cronofy Scheduler button.
3. Create a scheduling request.
4. Open the generated request link.
5. Choose a time slot.
6. Confirm the meeting.
7. Check that the meeting appears in Google Calendar.
8. Check that the Rust backend receives the Cronofy webhook.
9. Check that the frontend updates the workflow status.

Expected result in the frontend:

```txt
Meeting booked
Calendar updated
Context captured
Workflow ready
```

## Why Rust is used

The Rust backend is responsible for server-side work:

```txt
Generate the Scheduler Embed JWT
Keep the Cronofy embed secret out of the browser
Receive Cronofy webhooks
Store the latest workflow state
Expose the current meeting status to the frontend
```

## Why Cronofy is used

Cronofy handles the scheduling infrastructure:

```txt
Scheduler Embed
Availability and booking flow
Calendar event creation
Invitee slot selection
Webhook updates after scheduling changes
```

This allows the application to react to scheduling events instead of treating scheduling as a static booking link.

## Potential MCP extension

This prototype currently uses a human-driven scheduling flow.

The next layer could use Cronofy MCP to let an AI agent coordinate time through Cronofy.

Example flow:

```txt
AI agent receives intent
    |
    | "Find time with this person next week"
    v
Cronofy MCP
    |
    | availability and scheduling tools
    v
Meeting booked
    |
    | webhook update
    v
Application context updated
```

This would turn the current workflow into an agentic scheduling workflow where the user does not manually coordinate calendar availability.

## Environment variables

Backend:

```env
CRONOFY_SCHEDULER_EMBED_PUBLIC_KEY=EMB_your_public_key
CRONOFY_SCHEDULER_EMBED_SECRET=ESK_your_embed_secret
```

Frontend currently calls the backend locally at:

```txt
http://127.0.0.1:3001
```

For deployment, this should be moved into an environment variable such as:

```env
NEXT_PUBLIC_BACKEND_URL=https://your-backend-url.com
```

## Security notes

Do not commit `.env`.

Do not expose the `ESK_` embed secret in the frontend.

If any secret is accidentally shared, regenerate it from the Cronofy dashboard.

Before making this repository public, verify:

```txt
.env is ignored
.env.example contains placeholder values only
No real Cronofy secrets are committed
No access tokens are committed
No private ngrok URLs are required for production
```

## Deployment notes

This demo currently runs locally.

A deployed version would need:

```txt
Deployed Rust backend
Deployed Next.js frontend
Backend environment variables configured securely
Cronofy webhook callback URL updated to the deployed backend URL
Frontend configured to call the deployed backend
```

A platform such as Zerops can be used to deploy both the frontend and backend and provide a stable webhook URL.

## Current status

Implemented:

```txt
Next.js frontend
Rust Axum backend
Cronofy Scheduler Embed
Server-side embed token generation
Scheduling request creation
Real calendar booking
Cronofy webhook receiver
Frontend workflow status update
Potential MCP extension section
```

Next steps:

```txt
Clean up UI copy
Add deployment configuration
Add a stable public webhook URL
Decide how practical the MCP section should be in the final video
```
