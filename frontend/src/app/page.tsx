"use client";

import { createElement, useEffect, useState } from "react";

type CronofySchedulerEvent = CustomEvent<{
  scheduling_request?: {
    primary_select_url?: string;
    recipient_operations?: {
      view_url?: string;
    };
  };
}>;

type MeetingStatus = {
  has_update: boolean;
  last_update: {
    notification?: {
      type?: string;
    };
    scheduling_request?: {
      slot_selection?: string;
      summary?: string;
      duration?: {
        minutes?: number;
      };
      recipients?: Array<{
        email?: string;
        display_name?: string;
      }>;
      metadata?: {
        scheduler?: {
          correlation_id?: string;
        };
      };
    };
  } | null;
};

function Pill({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "blue";
}) {
  const styles = {
    default: "border-neutral-800 bg-neutral-950 text-neutral-300",
    success: "border-emerald-800 bg-emerald-950 text-emerald-300",
    blue: "border-blue-800 bg-blue-950 text-blue-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined;
}) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-black p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-600">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium text-neutral-100">
        {value ?? "Waiting"}
      </p>
    </div>
  );
}

export default function Home() {
  const [embedToken, setEmbedToken] = useState<string | null>(null);
  const [schedulerReady, setSchedulerReady] = useState(false);
  const [requestUrl, setRequestUrl] = useState<string | null>(null);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadScheduler() {
      try {
        await import("cronofy-scheduler-embed");
        setSchedulerReady(true);
      } catch {
        setError("Could not load Cronofy Scheduler Embed.");
      }
    }

    loadScheduler();
  }, []);

  useEffect(() => {
    async function loadToken() {
      try {
        const response = await fetch("http://127.0.0.1:3001/embed-token");

        if (!response.ok) {
          throw new Error("Failed to fetch embed token");
        }

        const data = await response.json();
        setEmbedToken(data.embed_token);
      } catch {
        setError("Could not fetch embed token from the Rust backend.");
      }
    }

    loadToken();
  }, []);

  useEffect(() => {
    async function loadMeetingStatus() {
      try {
        const response = await fetch("http://127.0.0.1:3001/meeting-status");

        if (!response.ok) {
          throw new Error("Failed to fetch meeting status");
        }

        const data = await response.json();
        setMeetingStatus(data);
      } catch {
        // Silent for demo UI.
      }
    }

    loadMeetingStatus();

    const interval = setInterval(loadMeetingStatus, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!embedToken || !schedulerReady) return;

    const button = document.getElementById("cronofy-scheduler-button");

    if (!button) return;

    const handleRequestCreated = (event: Event) => {
      const customEvent = event as CronofySchedulerEvent;

      const url =
        customEvent.detail?.scheduling_request?.primary_select_url ??
        customEvent.detail?.scheduling_request?.recipient_operations?.view_url ??
        null;

      setRequestUrl(url);
    };

    button.addEventListener(
      "cronofyschedulerrequestcreated",
      handleRequestCreated
    );

    return () => {
      button.removeEventListener(
        "cronofyschedulerrequestcreated",
        handleRequestCreated
      );
    };
  }, [embedToken, schedulerReady]);

  const schedulingRequest = meetingStatus?.last_update?.scheduling_request;
  const notification = meetingStatus?.last_update?.notification;

  const meetingComplete =
    meetingStatus?.has_update &&
    schedulingRequest?.slot_selection === "complete";

  const recipient = schedulingRequest?.recipients?.[0];
  const duration = schedulingRequest?.duration?.minutes;
  const correlationId =
    schedulingRequest?.metadata?.scheduler?.correlation_id ?? "youtube-demo-001";

  const schedulerLoaded = Boolean(embedToken && schedulerReady && !error);

  return (
    <main className="min-h-screen bg-black text-white">
      <style>{`
        cronofy-scheduler-button {
          cursor: pointer;
          display: inline-block;
          transform: scale(1.2);
          transform-origin: left center;
          margin-top: 8px;
          margin-bottom: 12px;
        }
      `}</style>

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between border-b border-neutral-900 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-sm font-semibold">
              C
            </div>

            <div>
              <p className="text-sm font-medium text-white">Cronofy Demo</p>
              <p className="text-xs text-neutral-500">AI Meeting Workflow</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-xs text-neutral-400 md:flex">
            <span>Next.js</span>
            <span className="text-neutral-700">/</span>
            <span>Rust</span>
            <span className="text-neutral-700">/</span>
            <span>Cronofy</span>
          </div>
        </header>

        <section className="py-12">
          <Pill variant="blue">Scheduling infrastructure demo</Pill>

          <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight md:text-7xl">
            Turn scheduling into product workflow.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-400">
            A minimal demo with a Rust backend, Cronofy Scheduler Embed, and
            webhooks that update the app when a meeting is booked.
          </p>

          <div className="mt-8 flex flex-wrap gap-2 text-sm text-neutral-400">
            <span className="rounded-full border border-neutral-900 bg-neutral-950 px-4 py-2">
              Rust signs token
            </span>
            <span className="rounded-full border border-neutral-900 bg-neutral-950 px-4 py-2">
              Cronofy schedules
            </span>
            <span className="rounded-full border border-neutral-900 bg-neutral-950 px-4 py-2">
              Webhook updates app
            </span>
          </div>
        </section>

        <section className="grid gap-6 border-y border-neutral-900 py-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-500">Scheduler Embed</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Create a meeting request
                </h2>
                <p className="mt-3 text-sm leading-6 text-neutral-500">
                  The token is generated by Rust. Cronofy handles the booking
                  flow.
                </p>
              </div>

              <Pill variant={schedulerLoaded ? "success" : "default"}>
                {schedulerLoaded ? "Ready" : "Loading"}
              </Pill>
            </div>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-900 bg-red-950 p-4 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-neutral-900 bg-black p-5">
              <p className="mb-4 text-xs uppercase tracking-wide text-neutral-600">
                Create request
              </p>

              <div className="min-h-16">
                {schedulerLoaded ? (
                  createElement("cronofy-scheduler-button", {
                    id: "cronofy-scheduler-button",
                    "embed-token": embedToken,
                    "correlation-id": "youtube-demo-001",
                    "recipient-email": "demo@example.com",
                    "recipient-name": "Demo User",
                    "recipient-organization-name": "Demo Company",
                    "event-summary": "AI Meeting Workflow Demo",
                    "event-duration-minutes": "30",
                  })
                ) : (
                  <p className="text-sm text-neutral-500">
                    Loading Cronofy Scheduler...
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-900 bg-black p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-600">
                Correlation id
              </p>
              <p className="mt-2 font-mono text-sm text-neutral-300">
                {correlationId}
              </p>
            </div>

            {requestUrl && (
              <div className="mt-4 rounded-2xl border border-blue-900 bg-blue-950/60 p-4">
                <p className="text-sm font-medium text-blue-100">
                  Request link created
                </p>

                <a
                  href={requestUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all text-sm text-blue-300 underline"
                >
                  {requestUrl}
                </a>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-500">Application state</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Updated by webhook
                </h2>
                <p className="mt-3 text-sm leading-6 text-neutral-500">
                  Cronofy sends the update. The Rust backend stores it. The UI
                  reflects the workflow state.
                </p>
              </div>

              <Pill variant={meetingComplete ? "success" : "default"}>
                {meetingComplete ? "Complete" : "Waiting"}
              </Pill>
            </div>

            {!meetingStatus?.has_update && (
              <div className="mt-6 rounded-2xl border border-neutral-900 bg-black p-5 text-sm text-neutral-500">
                Waiting for Cronofy webhook...
              </div>
            )}

            {meetingStatus?.has_update && (
              <div className="mt-6 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Event" value={notification?.type} />
                  <Field
                    label="Status"
                    value={schedulingRequest?.slot_selection}
                  />
                  <Field label="Meeting" value={schedulingRequest?.summary} />
                  <Field
                    label="Invitee"
                    value={recipient?.email ?? recipient?.display_name}
                  />
                </div>

                <Field
                  label="Duration"
                  value={duration ? `${duration} minutes` : undefined}
                />

                {meetingComplete && (
                  <div className="rounded-2xl border border-emerald-900 bg-emerald-950/60 p-5">
                    <p className="text-lg font-semibold text-emerald-200">
                      Meeting booked
                    </p>

                    <div className="mt-4 grid gap-3 text-sm text-emerald-100 md:grid-cols-3">
                      <div className="rounded-xl border border-emerald-900 bg-emerald-950 p-3">
                        Calendar updated
                      </div>
                      <div className="rounded-xl border border-emerald-900 bg-emerald-950 p-3">
                        Context captured
                      </div>
                      <div className="rounded-xl border border-emerald-900 bg-emerald-950 p-3">
                        Workflow ready
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="py-8">
          <div className="rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-neutral-500">Potential MCP layer</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  From manual scheduling to agentic workflows
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-500">
                  The next layer could let an AI agent coordinate time through
                  Cronofy, then push the result back into this application.
                </p>
              </div>

              <Pill variant="blue">Next step</Pill>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}