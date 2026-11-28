"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

async function callNotifications(url: string) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

    throw new Error(payload?.error?.message || "The request could not be completed.");
  }
}

function errorMessageOf(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

/** Per-item mark-read island: one POST to `POST /api/notifications/[id]/read`, then a refresh. */
export function MarkReadButton({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function markRead() {
    if (pending) {
      return;
    }

    setPending(true);
    setErrorMessage("");

    try {
      await callNotifications(`/api/notifications/${notificationId}/read`);
      router.refresh();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="notification-read">
      <button className="button button--ghost button--small" disabled={pending} onClick={markRead} type="button">
        {pending ? "Marking..." : "Mark read"}
      </button>

      {errorMessage ? (
        <span className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </span>
      ) : null}
    </span>
  );
}

/** The inbox-wide mark-all-read island: one POST to `POST /api/notifications/read-all`. */
export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function markAll() {
    if (pending) {
      return;
    }

    setPending(true);
    setErrorMessage("");

    try {
      await callNotifications("/api/notifications/read-all");
      router.refresh();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="notification-actions">
      <button className="button button--primary button--small" disabled={pending} onClick={markAll} type="button">
        {pending ? "Marking..." : "Mark all read"}
      </button>

      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
