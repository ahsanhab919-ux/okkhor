"use client";

import React from "react";
import { useState } from "react";

import { CredentialAuthPanel } from "@/src/modules/identity/ui/credential-auth-panel";
import { PhoneAuthFlow } from "@/src/modules/identity/ui/phone-auth-flow";

const DEFAULT_PHONE_NUMBER = "01712345678";

export function AuthPageShell() {
  const [prefilledPhoneNumber, setPrefilledPhoneNumber] = useState(DEFAULT_PHONE_NUMBER);

  return (
    <div className="auth-page-stack">
      <PhoneAuthFlow credentialPanelId="credential-auth-panel" onOtpVerified={setPrefilledPhoneNumber} />
      <CredentialAuthPanel initialPhoneNumber={prefilledPhoneNumber} panelId="credential-auth-panel" />
    </div>
  );
}
