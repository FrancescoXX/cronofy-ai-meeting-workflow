"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

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

type MeetingAgentResource = {
  category?: string;
  type?: string;
  url?: string;
};

type MeetingAgentResponse = {
  meeting_agent?: {
    state?: string;
    sub?: string;
    resources?: MeetingAgentResource[];
  };
};

const API_URL = "http://127.0.0.1:3001";

function Button({
  children,
  onClick,
  disabled = false,
  variant = "primary",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        variant === "primary"
          ? "rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          : "rounded-lg border border-neutral-800 bg-black px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-neutral-100">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusBadge({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-emerald-900 bg-emerald-950 px-3 py-1 text-xs text-emerald-300"
          : "rounded-full border border-neutral-800 bg-black px-3 py-1 text-xs text-neutral-500"
      }
    >
      {children}
    </span>
  );
}

function ValueRow({
  label,
  value,
  success = false,
}: {
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-900 bg-black px-4 py-3">
      <span className="text-sm text-neutral-500">{label}</span>
      <span
        className={
          success
            ? "text-right text-sm font-medium text-emerald-400"
            : "text-right text-sm font-medium text-neutral-100"
        }
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Europe/Rome",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  }).format(new Date(value));
}

function formatSlot(slot: AvailabilitySlot) {
  return `${formatDate(slot.start)} · ${formatTime(slot.start)} - ${formatTime(
    slot.end
  )}`;
}

export default function Home() {
  const [meetingPrompt, setMeetingPrompt] = useState(
    "Schedule a 30-minute customer onboarding call next week."
  );

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null
  );
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(
    null
  );
  const [booking, setBooking] = useState<BookMeetingResponse | null>(null);

  const [meetUrl, setMeetUrl] = useState("");
  const [meetingAgent, setMeetingAgent] = useState<MeetingAgentResponse | null>(
    null
  );

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedSlotLabel = useMemo(() => {
    if (!selectedSlot) return "";
    return formatSlot(selectedSlot);
  }, [selectedSlot]);

  const dashboardUrl =
    meetingAgent?.meeting_agent?.resources?.find(
      (resource) => resource.type === "dashboard"
    )?.url ?? null;

  async function findAvailability() {
    setError("");
    setLoading("availability");
    setAvailability(null);
    setSelectedSlot(null);
    setBooking(null);
    setMeetingAgent(null);

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
        throw new Error("Availability failed");
      }

      const data: AvailabilityResponse = await response.json();

      setAvailability(data);
      setSelectedSlot(data.slots[0] ?? null);
    } catch {
      setError("Could not load availability. Check OAuth and backend.");
    } finally {
      setLoading(null);
    }
  }

  async function bookSelectedSlot() {
    if (!selectedSlot) return;

    setError("");
    setLoading("booking");

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
        throw new Error("Booking failed");
      }

      const data: BookMeetingResponse = await response.json();
      setBooking(data);
    } catch {
      setError("Could not create the calendar event.");
    } finally {
      setLoading(null);
    }
  }

  async function dispatchMeetingAgent() {
    if (!meetUrl.trim()) {
      setError("Paste the Google Meet link before dispatching the agent.");
      return;
    }

    setError("");
    setLoading("agent");
    setMeetingAgent(null);

    try {
      const response = await fetch(`${API_URL}/meeting-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          join_url: meetUrl.trim(),
          attendee_email: "me@francescociulla.com",
          display_name: "Cronofy AI Meeting Demo",
        }),
      });

      if (!response.ok) {
        throw new Error("Meeting Agent failed");
      }

      const data: MeetingAgentResponse = await response.json();
      setMeetingAgent(data);
    } catch {
      setError("Could not dispatch the Meeting Agent.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen w-full max-w-7xl px-8 py-6">
        <header className="flex items-center justify-between border-b border-neutral-900 pb-4">
          <div>
            <h1 className="text-base font-semibold">Cronofy Meeting Workflow</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Availability, booking, and Meeting Agents.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge active={Boolean(availability)}>
              Availability
            </StatusBadge>
            <StatusBadge active={Boolean(booking)}>Booking</StatusBadge>
            <StatusBadge active={Boolean(meetingAgent)}>
              Meeting Agent
            </StatusBadge>
          </div>
        </header>

        {error && (
          <div className="mt-5 rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="grid gap-5 py-6 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-5">
            <Card title="Request">
              <textarea
                value={meetingPrompt}
                onChange={(event) => setMeetingPrompt(event.target.value)}
                className="min-h-32 w-full resize-none rounded-xl border border-neutral-800 bg-black p-4 text-sm leading-6 text-neutral-100 outline-none focus:border-neutral-600"
              />

              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={findAvailability}
                  disabled={loading === "availability"}
                >
                  {loading === "availability"
                    ? "Finding..."
                    : "Find availability"}
                </Button>

                {availability && (
                  <span className="text-sm text-neutral-500">
                    {availability.slots.length} slots
                  </span>
                )}
              </div>
            </Card>

            <Card title="Meeting">
              {!booking && (
                <div className="rounded-xl border border-neutral-900 bg-black px-4 py-6 text-sm text-neutral-500">
                  No meeting booked yet.
                </div>
              )}

              {booking && (
                <div className="space-y-3">
                  <ValueRow label="Status" value="Booked" success />
                  <ValueRow label="When" value={selectedSlotLabel} />
                  <ValueRow
                    label="Title"
                    value="AI Meeting Workflow Demo"
                  />
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            <Card
              title="Available times"
              action={
                selectedSlot && (
                  <span className="text-xs text-neutral-500">
                    {selectedSlot.id}
                  </span>
                )
              }
            >
              {!availability && (
                <div className="rounded-xl border border-neutral-900 bg-black px-4 py-6 text-sm text-neutral-500">
                  Run availability search.
                </div>
              )}

              {availability && (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    {availability.slots.map((slot) => {
                      const isSelected = selectedSlot?.id === slot.id;

                      return (
                        <button
                          key={slot.id}
                          onClick={() => setSelectedSlot(slot)}
                          className={
                            isSelected
                              ? "rounded-xl border border-blue-700 bg-blue-950 px-4 py-3 text-left"
                              : "rounded-xl border border-neutral-900 bg-black px-4 py-3 text-left transition hover:border-neutral-700"
                          }
                        >
                          <p className="text-sm font-medium text-white">
                            {formatSlot(slot)}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <Button
                    onClick={bookSelectedSlot}
                    disabled={!selectedSlot || loading === "booking"}
                  >
                    {loading === "booking" ? "Booking..." : "Book selected slot"}
                  </Button>
                </div>
              )}
            </Card>

            <Card title="Meeting Agent">
              <input
                value={meetUrl}
                onChange={(event) => setMeetUrl(event.target.value)}
                placeholder="Paste Google Meet link"
                className="w-full rounded-xl border border-neutral-800 bg-black p-4 text-sm text-neutral-100 outline-none focus:border-neutral-600"
              />

              <div className="mt-4">
                <Button
                  onClick={dispatchMeetingAgent}
                  disabled={loading === "agent"}
                >
                  {loading === "agent"
                    ? "Dispatching..."
                    : "Dispatch Meeting Agent"}
                </Button>
              </div>

              {!meetingAgent && (
                <div className="mt-4 rounded-xl border border-neutral-900 bg-black px-4 py-6 text-sm text-neutral-500">
                  Agent not dispatched yet.
                </div>
              )}

              {meetingAgent && (
                <div className="mt-4 space-y-3">
                  <ValueRow
                    label="Status"
                    value={meetingAgent.meeting_agent?.state ?? "created"}
                    success
                  />

                  {dashboardUrl && (
                    <a
                      href={dashboardUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl border border-neutral-800 bg-black px-4 py-3 text-sm font-medium text-neutral-100 underline transition hover:border-neutral-600"
                    >
                      Open Meeting Agent dashboard
                    </a>
                  )}
                </div>
              )}
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}