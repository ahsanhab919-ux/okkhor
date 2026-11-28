"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

async function callLibrary(method: string, url: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

    throw new Error(payload?.error?.message || "The request could not be completed.");
  }
}

function errorMessageOf(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

type SaveItemButtonProps = {
  itemId: string;
  initialSaved: boolean;
  authenticated: boolean;
};

/**
 * The detail-page save island. It owns a single boolean and one fetch, posting to
 * `POST /api/library/items` or `DELETE /api/library/items/[id]`, then refreshes the server-rendered
 * page. An anonymous visitor gets a sign-in affordance that returns to the item afterwards.
 */
export function SaveItemButton({ itemId, initialSaved, authenticated }: SaveItemButtonProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!authenticated) {
    return (
      <Link className="button button--ghost" href={`/auth?next=${encodeURIComponent(`/content/${itemId}`)}`}>
        Sign in to save
      </Link>
    );
  }

  async function toggle() {
    if (pending) {
      return;
    }

    setPending(true);
    setErrorMessage("");

    try {
      if (saved) {
        await callLibrary("DELETE", `/api/library/items/${itemId}`);
        setSaved(false);
      } else {
        await callLibrary("POST", "/api/library/items", { itemId });
        setSaved(true);
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="library-save">
      <button className="button button--primary" disabled={pending} onClick={toggle} type="button">
        {saved ? "Saved" : "Save"}
      </button>

      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

/** The library-page remove island. It deletes the save and refreshes the list. */
export function RemoveSavedItemButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function remove() {
    if (pending) {
      return;
    }

    setPending(true);
    setErrorMessage("");

    try {
      await callLibrary("DELETE", `/api/library/items/${itemId}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="library-remove">
      <button className="button button--ghost button--small" disabled={pending} onClick={remove} type="button">
        {pending ? "Removing..." : "Remove"}
      </button>

      {errorMessage ? (
        <span className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </span>
      ) : null}
    </span>
  );
}
