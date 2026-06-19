"use client";

import { createElement, useEffect, useState } from "react";
import type { ReactNode } from "react";

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

type AvailabilitySlot = {
  id: string;
  label: string;
  start: string;
  end: string;
};

type AvailabilityResponse = {
  source: string;
  request: string;
  duration_minutes: number;
  slots: AvailabilitySlot[];
};

type BookMeetingResponse = {
  status: string;
  meeting_id: string;
  selected_slot: string;
  calendar_updated: boolean;
  workflow_updated: boolean;
};

type MeetingContextResponse = {
  status: string;
  transcript_status: string;
  summary: string;
  next_actions: string[];
};

type AgentWorkflowResponse = {
  status: string;
  prompt: string;
  steps: string[];
};

const API_URL = "http://127.0.0.1:3001";

function Pill({
  children,
  variant = "default",
}: {
  children: ReactNode;
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

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
      <p className="text-sm text-neutral-500">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-neutral-500">{description}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

export default function Home() {
  const [embedToken, setEmbedToken] = useState<string | null>(null);
  const [schedulerReady, setSchedulerReady] = useState(false);
  const [schedulerError, setSchedulerError] = useState<string | null>(null);
  const [requestUrl, setRequestUrl] = useState<string | null>(null);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus | null>(null);

  const [meetingPrompt, setMeetingPrompt] = useState(
    "Schedule a 30-minute customer onboarding call next week."
  );
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null
  );
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [booking, setBooking] = useState<BookMeetingResponse | null>(null);
  const [meetingContext, setMeetingContext] =
    useState<MeetingContextResponse | null>(null);
  const [agentWorkflow, setAgentWorkflow] =
    useState<AgentWorkflowResponse | null>(null);
  const [flowLoading, setFlowLoading] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);

  useEffect(() => {
    async function loadScheduler() {
      try {
        await import("cronofy-scheduler-embed");
        setSchedulerReady(true);
      } catch {
        setSchedulerError("Could not load Cronofy Scheduler Embed.");
      }
    }

    loadScheduler();
  }, []);

  useEffect(() => {
    async function loadToken() {
      try {
        const response = await fetch(`${API_URL}/embed-token`);

        if (!response.ok) {
          throw new Error("Failed to fetch embed token");
        }

        const data = await response.json();
        setEmbedToken(data.embed_token);
      } catch {
        setSchedulerError("Could not fetch embed token from the Rust backend.");
      }
    }

    loadToken();
  }, []);

  useEffect(() => {
    async function loadMeetingStatus() {
      try {
        const response = await fetch(`${API_URL}/meeting-status`);

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

  async function findAvailability() {
    setFlowError(null);
    setFlowLoading("availability");
    setAvailability(null);
    setSelectedSlot(null);
    setBooking(null);
    setMeetingContext(null);
    setAgentWorkflow(null);

    try {
      const response = await fetch(`${API_URL}/availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: meetingPrompt,
          duration_minutes: 30,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to find availability");
      }

      const data: AvailabilityResponse = await response.json();

      setAvailability(data);
      setSelectedSlot(data.slots[0] ?? null);
    } catch {
      setFlowError("Could not load availability from the Rust backend.");
    } finally {
      setFlowLoading(null);
    }
  }

  async function loadMeetingContext() {
    const response = await fetch(`${API_URL}/meeting-context`);

    if (!response.ok) {
      throw new Error("Failed to load meeting context");
    }

    const data: MeetingContextResponse = await response.json();
    setMeetingContext(data);
  }

  async function loadAgentWorkflow() {
    const response = await fetch(`${API_URL}/agent-workflow`);

    if (!response.ok) {
      throw new Error("Failed to load agent workflow");
    }

    const data: AgentWorkflowResponse = await response.json();
    setAgentWorkflow(data);
  }

  async function bookSelectedSlot() {
    if (!selectedSlot) return;

    setFlowError(null);
    setFlowLoading("booking");

    try {
      const response = await fetch(`${API_URL}/book-meeting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slot_id: selectedSlot.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to book meeting");
      }

      const data: BookMeetingResponse = await response.json();
      setBooking(data);

      await loadMeetingContext();
      await loadAgentWorkflow();
    } catch {
      setFlowError("Could not book the meeting or load the workflow context.");
    } finally {
      setFlowLoading(null);
    }
  }

  const schedulingRequest = meetingStatus?.last_update?.scheduling_request;
  const notification = meetingStatus?.last_update?.notification;

  const meetingComplete =
    meetingStatus?.has_update &&
    schedulingRequest?.slot_selection === "complete";

  const recipient = schedulingRequest?.recipients?.[0];
  const duration = schedulingRequest?.duration?.minutes;
  const correlationId =
    schedulingRequest?.metadata?.scheduler?.correlation_id ?? "youtube-demo-001";

  const schedulerLoaded = Boolean(
    embedToken && schedulerReady && !schedulerError
  );

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

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between border-b border-neutral-900 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-sm font-semibold">
              C
            </div>

            <div>
              <p className="text-sm font-medium text-white">Cronofy Demo</p>
              <p className="text-xs text-neutral-500">AI Meeting Coordinator</p>
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
          <Pill variant="blue">API-first scheduling infrastructure demo</Pill>

          <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
            Build AI meeting workflows on top of time infrastructure.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-400">
            A minimal developer demo showing how an app can use Cronofy as the
            coordination layer for availability, booking, workflow updates,
            meeting context, and agentic scheduling.
          </p>

          <div className="mt-8 flex flex-wrap gap-2 text-sm text-neutral-400">
            <span className="rounded-full border border-neutral-900 bg-neutral-950 px-4 py-2">
              Find availability
            </span>
            <span className="rounded-full border border-neutral-900 bg-neutral-950 px-4 py-2">
              Book meeting
            </span>
            <span className="rounded-full border border-neutral-900 bg-neutral-950 px-4 py-2">
              Update workflow
            </span>
            <span className="rounded-full border border-neutral-900 bg-neutral-950 px-4 py-2">
              Surface context
            </span>
            <span className="rounded-full border border-neutral-900 bg-neutral-950 px-4 py-2">
              MCP agent layer
            </span>
          </div>
        </section>

        <section className="grid gap-6 border-y border-neutral-900 py-8 lg:grid-cols-[0.95fr_1.05fr]">
          <SectionCard
            eyebrow="Meeting request"
            title="Start with an intent"
            description="The app receives a meeting coordination request. In a real product this could come from a user, a CRM, a support workflow, or an AI agent."
          >
            <textarea
              value={meetingPrompt}
              onChange={(event) => setMeetingPrompt(event.target.value)}
              className="min-h-28 w-full rounded-2xl border border-neutral-900 bg-black p-4 text-sm leading-6 text-neutral-100 outline-none focus:border-blue-800"
            />

            <button
              onClick={findAvailability}
              disabled={flowLoading === "availability"}
              className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {flowLoading === "availability"
                ? "Finding available times..."
                : "Find available times"}
            </button>

            {flowError && (
              <div className="mt-4 rounded-2xl border border-red-900 bg-red-950 p-4 text-sm text-red-200">
                {flowError}
              </div>
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Availability layer"
            title="Cronofy returns valid time slots"
            description="This is the API-first part of the demo: the app asks Cronofy for availability and gets back time options it can use in its own product workflow."
          >
            {!availability && (
              <div className="rounded-2xl border border-neutral-900 bg-black p-5 text-sm text-neutral-500">
                No availability loaded yet. Start by finding available times.
              </div>
            )}

            {availability && (
              <div className="space-y-4">
                <Field label="Source" value={availability.source} />
                <Field
                  label="Duration"
                  value={`${availability.duration_minutes} minutes`}
                />

                <div className="space-y-3">
                  {availability.slots.map((slot) => {
                    const isSelected = selectedSlot?.id === slot.id;

                    return (
                      <button
                        key={slot.id}
                        onClick={() => setSelectedSlot(slot)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? "border-blue-700 bg-blue-950/60"
                            : "border-neutral-900 bg-black hover:border-neutral-700"
                        }`}
                      >
                        <p className="text-sm font-semibold text-neutral-100">
                          {slot.label}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {slot.start} → {slot.end}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={bookSelectedSlot}
                  disabled={!selectedSlot || flowLoading === "booking"}
                  className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {flowLoading === "booking"
                    ? "Booking meeting..."
                    : "Book selected slot"}
                </button>
              </div>
            )}
          </SectionCard>
        </section>

        <section className="grid gap-6 border-b border-neutral-900 py-8 lg:grid-cols-2">
          <SectionCard
            eyebrow="Booking workflow"
            title="The app turns a slot into a meeting"
            description="After a slot is selected, the backend can book the meeting, update the calendar, and move the product workflow forward."
          >
            {!booking && (
              <div className="rounded-2xl border border-neutral-900 bg-black p-5 text-sm text-neutral-500">
                Waiting for a selected slot to be booked.
              </div>
            )}

            {booking && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Status" value={booking.status} />
                  <Field label="Meeting ID" value={booking.meeting_id} />
                  <Field label="Selected slot" value={booking.selected_slot} />
                  <Field
                    label="Workflow"
                    value={
                      booking.workflow_updated
                        ? "Application workflow updated"
                        : "Waiting"
                    }
                  />
                </div>

                <div className="rounded-2xl border border-emerald-900 bg-emerald-950/60 p-5">
                  <p className="text-lg font-semibold text-emerald-200">
                    Meeting booked through the coordination layer
                  </p>

                  <div className="mt-4 grid gap-3 text-sm text-emerald-100 md:grid-cols-3">
                    <div className="rounded-xl border border-emerald-900 bg-emerald-950 p-3">
                      Calendar updated
                    </div>
                    <div className="rounded-xl border border-emerald-900 bg-emerald-950 p-3">
                      Workflow updated
                    </div>
                    <div className="rounded-xl border border-emerald-900 bg-emerald-950 p-3">
                      Context ready
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Meeting intelligence"
            title="Context flows back into the app"
            description="This completes the product story: once the meeting is created or completed, context can flow back into the application and power the next step."
          >
            {!meetingContext && (
              <div className="rounded-2xl border border-neutral-900 bg-black p-5 text-sm text-neutral-500">
                Meeting context will appear after booking a slot.
              </div>
            )}

            {meetingContext && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Context status" value={meetingContext.status} />
                  <Field
                    label="Transcript"
                    value={meetingContext.transcript_status}
                  />
                </div>

                <div className="rounded-2xl border border-neutral-900 bg-black p-5">
                  <p className="text-xs uppercase tracking-wide text-neutral-600">
                    Summary
                  </p>
                  <p className="mt-3 text-sm leading-6 text-neutral-300">
                    {meetingContext.summary}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-900 bg-black p-5">
                  <p className="text-xs uppercase tracking-wide text-neutral-600">
                    Next actions
                  </p>

                  <div className="mt-3 space-y-2">
                    {meetingContext.next_actions.map((action) => (
                      <div
                        key={action}
                        className="rounded-xl border border-neutral-900 bg-neutral-950 p-3 text-sm text-neutral-300"
                      >
                        {action}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        </section>

        <section className="grid gap-6 border-b border-neutral-900 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <SectionCard
            eyebrow="MCP agent workflow"
            title="Let an agent coordinate the same workflow"
            description="The agentic layer is where this becomes especially interesting: an AI agent can ask for availability, book a meeting, and push the result back into the app through deterministic tools."
          >
            {!agentWorkflow && (
              <div className="rounded-2xl border border-neutral-900 bg-black p-5 text-sm text-neutral-500">
                Agent workflow will appear after the booking step.
              </div>
            )}

            {agentWorkflow && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-900 bg-blue-950/50 p-5">
                  <p className="text-xs uppercase tracking-wide text-blue-300">
                    Agent prompt
                  </p>
                  <p className="mt-3 text-sm leading-6 text-blue-100">
                    “{agentWorkflow.prompt}”
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {agentWorkflow.steps.map((step, index) => (
                    <div
                      key={step}
                      className="rounded-2xl border border-neutral-900 bg-black p-4"
                    >
                      <p className="text-xs uppercase tracking-wide text-neutral-600">
                        Step {index + 1}
                      </p>
                      <p className="mt-2 text-sm font-medium text-neutral-200">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Real webhook state"
            title="Existing Cronofy webhook receiver"
            description="The previous working demo is still preserved. If the Scheduler Embed is used, Cronofy can send updates to the Rust backend and the UI can reflect the latest webhook state."
          >
            <Pill variant={meetingComplete ? "success" : "default"}>
              {meetingComplete ? "Webhook complete" : "Waiting for webhook"}
            </Pill>

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
              </div>
            )}
          </SectionCard>
        </section>

        <section className="py-8">
          <div className="rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm text-neutral-500">
                  Drop-in scheduling option
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Need a pre-packaged scheduler?
                </h2>
                <p className="mt-3 text-sm leading-7 text-neutral-500">
                  The API-first flow shows what developers can build on top of
                  Cronofy. If they do not want to build the scheduling
                  experience themselves, Scheduler Embed is still available as a
                  drop-in option.
                </p>
              </div>

              <Pill variant={schedulerLoaded ? "success" : "default"}>
                {schedulerLoaded ? "Scheduler ready" : "Scheduler loading"}
              </Pill>
            </div>

            {schedulerError && (
              <div className="mt-6 rounded-2xl border border-red-900 bg-red-950 p-4 text-sm text-red-200">
                {schedulerError}
              </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-neutral-900 bg-black p-5">
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

              <div className="rounded-2xl border border-neutral-900 bg-black p-5">
                <p className="text-xs uppercase tracking-wide text-neutral-600">
                  Correlation id
                </p>
                <p className="mt-2 font-mono text-sm text-neutral-300">
                  {correlationId}
                </p>

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
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}