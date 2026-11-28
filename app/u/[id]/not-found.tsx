import Link from "next/link";
import React from "react";

import { publicNavItems } from "@/src/modules/experience/site-content";
import { PublicTopNav } from "@/src/modules/experience/ui";

export default function MemberProfileNotFound() {
  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell">
        <section className="content-band">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Not Found</p>
              <h1>This member profile is unavailable</h1>
            </div>
            <p>We could not find a member with that identifier.</p>
          </div>

          <Link className="inline-link inline-link--featured" href="/content">
            Back to the archive
          </Link>
        </section>
      </main>
    </div>
  );
}
