import { getNotificationDestinationById } from "@/src/modules/identity/application/auth-service";
import { createNotification } from "@/src/modules/notifications/application/notification-service";
import type { ScholarVerification } from "@/src/modules/verification/domain/verification-types";

/**
 * Composition-root helper: joins `verification` and `notifications` without either module importing
 * the other. The decision route calls this **after** the decision has committed (and after the
 * approval grant); every failure is logged and swallowed so a notification can never fail the
 * decision it reports on, and an administrator is never messaged about their own decision
 * (`notifications-slice.md` §7, §8; `verification-notifications-slice.md` §7, §8).
 */

/**
 * Notifies an applicant that their scholar application was decided. Only a successful
 * `approved`/`rejected` decision notifies; the notification carries the outcome and a link to the
 * applicant's own verification page — never the review note, the reviewer's identity, or any
 * application content. Keyed on the **decision** (`verification_<status>:<applicationId>:<reviewedAt>`)
 * so a retried identical decision is a no-op while a later decision on the same (edited and
 * resubmitted) application notifies again (`verification-notifications-slice.md` §5, §13 decision 3).
 */
export async function notifyVerificationDecision(
  actorId: string,
  application: ScholarVerification,
): Promise<void> {
  const isApproved = application.status === "approved";
  const isRejected = application.status === "rejected";

  if (!isApproved && !isRejected) {
    return;
  }

  // A member is never notified about their own decision (self-suppression).
  if (actorId === application.applicantId) {
    return;
  }

  try {
    const destination = await getNotificationDestinationById(application.applicantId);

    await createNotification({
      recipientId: application.applicantId,
      type: isApproved ? "verification_approved" : "verification_rejected",
      title: isApproved
        ? "Your scholar verification was approved"
        : "Your scholar verification was rejected",
      body: isApproved
        ? "An administrator approved your scholar verification. Your profile now shows the Scholar badge."
        : "An administrator reviewed your scholar verification and did not approve it. You can update and resubmit your application.",
      href: "/scholar-verify",
      dedupeKey: `${isApproved ? "verification_approved" : "verification_rejected"}:${application.id}:${application.reviewedAt}`,
      destination,
    });
  } catch (error) {
    console.error("[notification] Failed to create a verification-decision notification.", error);
  }
}
