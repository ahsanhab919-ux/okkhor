"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Icon } from "@/src/modules/experience/ui";
import { resolveSafeNextPath } from "@/src/modules/identity/domain/auth-navigation";
import {
  formatCountdown,
  getOtpStatusMessage,
  isValidBangladeshPhone,
  isValidOtpCode,
  maskPhoneNumber,
  normalizeBangladeshPhone,
  type OtpFlowState,
} from "@/src/modules/identity/domain/phone-auth";

const RESEND_SECONDS = 30;
const DEMO_OTP = "246810";

export function PhoneAuthFlow({
  credentialPanelId,
  onOtpVerified,
}: {
  credentialPanelId?: string;
  onOtpVerified?: (phoneNumber: string) => void;
}) {
  const searchParams = useSearchParams();
  const requestedNextPath = searchParams.get("next");
  const [flowState, setFlowState] = useState<OtpFlowState>("phone-entry");
  const [phoneInput, setPhoneInput] = useState("+880 ");
  const [otpInput, setOtpInput] = useState("");
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [errorMessage, setErrorMessage] = useState("");

  const normalizedPhone = useMemo(() => normalizeBangladeshPhone(phoneInput), [phoneInput]);
  const phoneValid = isValidBangladeshPhone(phoneInput);
  const nextPath = useMemo(() => resolveSafeNextPath(requestedNextPath), [requestedNextPath]);

  useEffect(() => {
    if (flowState !== "otp-entry" || countdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [flowState, countdown]);

  function handleRequestOtp() {
    if (!phoneValid) {
      setErrorMessage("Enter a valid Bangladesh mobile number, for example 017XXXXXXXX.");
      setStatusTone("error");
      return;
    }

    setFlowState("otp-entry");
    setStatusTone("success");
    setErrorMessage("");
    setCountdown(RESEND_SECONDS);
  }

  function handleVerifyOtp() {
    if (!isValidOtpCode(otpInput)) {
      setErrorMessage("Enter the 6-digit OTP sent to your phone.");
      setStatusTone("error");
      return;
    }

    if (otpInput !== DEMO_OTP) {
      setErrorMessage("The code did not match. Use 246810 in this demo flow or request a new OTP.");
      setStatusTone("error");
      return;
    }

    setFlowState("success");
    setStatusTone("success");
    setErrorMessage("");
    onOtpVerified?.(normalizedPhone);
  }

  function handleResend() {
    setCountdown(RESEND_SECONDS);
    setOtpInput("");
    setStatusTone("success");
    setErrorMessage("");
  }

  function handleReset() {
    setFlowState("phone-entry");
    setOtpInput("");
    setStatusTone("neutral");
    setErrorMessage("");
    setCountdown(RESEND_SECONDS);
  }

  return (
    <div className="auth-shell">
      <section className="auth-hero-panel">
        <p className="eyebrow eyebrow--blue">Phone-First Access</p>
        <h1>Sign in with your mobile number, not a complicated account stack.</h1>
        <p className="lead">
          Okkhor uses a Bangla-first, trust-building sign-in flow designed for shared devices, unstable networks, and
          first-time digital users.
        </p>

        <div className="auth-proof-grid">
          <div className="trust-chip">
            <Icon className="icon-sm" name="shield" />
            <span>OTP confirmations stay visible and explicit.</span>
          </div>
          <div className="trust-chip">
            <Icon className="icon-sm" name="community" />
            <span>Quick logout protects privacy on shared household devices.</span>
          </div>
          <div className="trust-chip">
            <Icon className="icon-sm" name="book" />
            <span>Bangla-first copy explains each step in plain language.</span>
          </div>
        </div>

        <div className="auth-tips">
          <h2>Trust and safety reminders</h2>
          <ul>
            <li>Never share your OTP with another person, shop, or support agent.</li>
            <li>Always confirm the masked phone destination before entering the code.</li>
            <li>Use Quick Logout when handing the device to another family member.</li>
          </ul>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card__header">
          <div>
            <p className="eyebrow eyebrow--blue">
              {flowState === "phone-entry" ? "Step 1 of 2" : flowState === "otp-entry" ? "Step 2 of 2" : "Complete"}
            </p>
            <h2>{flowState === "success" ? "Login confirmed" : "Secure mobile sign-in"}</h2>
          </div>
          <button className="quick-logout quick-logout--inline" type="button">
            <Icon className="icon-sm" name="logout" />
            Quick Logout
          </button>
        </div>

        <p
          className={`auth-status auth-status--${statusTone}`}
          role={statusTone === "error" ? "alert" : "status"}
        >
          {errorMessage || getOtpStatusMessage(flowState, normalizedPhone)}
        </p>

        {flowState === "phone-entry" ? (
          <div className="auth-form">
            <label className="field field--full">
              <span>Phone number</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                name="phone"
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="+880 17XXXXXXXX"
                value={phoneInput}
              />
            </label>

            <div className="auth-support-row">
              <span className={`validation-pill${phoneValid ? " validation-pill--valid" : ""}`}>
                {phoneValid ? "Number looks ready" : "Bangladesh mobile number required"}
              </span>
              <span className="muted-copy">Default country context keeps the flow fast for local learners.</span>
            </div>

            <button className="button button--primary button--large" onClick={handleRequestOtp} type="button">
              Send OTP
            </button>
          </div>
        ) : null}

        {flowState === "otp-entry" ? (
          <div className="auth-form">
            <div className="auth-proof-card">
              <strong>Code sent</strong>
              <span>{maskPhoneNumber(normalizedPhone)}</span>
            </div>

            <label className="field field--full">
              <span>One-time password</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                name="otp"
                onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                value={otpInput}
              />
            </label>

            <div className="auth-support-row">
              <span className="validation-pill">Demo OTP: {DEMO_OTP}</span>
              <span className="muted-copy">
                Resend available in {countdown > 0 ? formatCountdown(countdown) : "now"}.
              </span>
            </div>

            <div className="hero-actions hero-actions--stackable">
              <button className="button button--primary button--large" onClick={handleVerifyOtp} type="button">
                Verify and Continue
              </button>
              <button
                className="button button--ghost button--large"
                disabled={countdown > 0}
                onClick={handleResend}
                type="button"
              >
                Resend OTP
              </button>
              <button className="button button--ghost button--large" onClick={handleReset} type="button">
                Change Number
              </button>
            </div>
          </div>
        ) : null}

        {flowState === "success" ? (
          <div className="auth-form">
            <div className="auth-proof-card auth-proof-card--success">
              <Icon className="icon-sm" name="check" />
              <div>
                <strong>Login successful</strong>
                <span>
                  {maskPhoneNumber(normalizedPhone)} passed the OTP demo. Continue below to create the real protected
                  session.
                </span>
              </div>
            </div>

            <div className="auth-next-actions">
              <Link className="button button--primary button--large" href={credentialPanelId ? `#${credentialPanelId}` : "#"}>
                Continue to Backend Sign-In
              </Link>
              <span className="validation-pill">Requested destination after sign-in: {nextPath}</span>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
