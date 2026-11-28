import Link from "next/link";
import React from "react";

import { ThreadForm } from "@/src/modules/community/ui/thread-form";

export const dynamic = "force-dynamic";

export default function CommunityNewThreadPage() {
  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Scholarly Discourse</p>
          <h1>Start a thread</h1>
        </div>
        <Link className="inline-link" href="/community">
          Back to the community
        </Link>
      </div>

      <ThreadForm />
    </section>
  );
}
