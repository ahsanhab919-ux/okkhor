import type {
  ScholarVerification,
  VerificationRepository,
  VerificationStore,
} from "@/src/modules/verification/domain/verification-types";

declare global {
  var __okkhorVerificationStore: VerificationStore | undefined;
  var __okkhorMemoryVerificationRepository: VerificationRepository | undefined;
}

function createStore(): VerificationStore {
  return {
    verifications: new Map(),
  };
}

/** Orders the review queue by last edit, newest first, with `id` breaking ties. */
function compareByUpdatedDesc(left: ScholarVerification, right: ScholarVerification): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}

function createMemoryVerificationRepository(): VerificationRepository {
  return {
    async getByApplicantId(applicantId) {
      return Array.from(getVerificationStore().verifications.values()).find(
        (verification) => verification.applicantId === applicantId,
      );
    },
    async getById(id) {
      return getVerificationStore().verifications.get(id);
    },
    async listByStatus(status) {
      return Array.from(getVerificationStore().verifications.values())
        .filter((verification) => (status ? verification.status === status : true))
        .sort(compareByUpdatedDesc);
    },
    async create(verification) {
      getVerificationStore().verifications.set(verification.id, verification);
    },
    async updateIfUnchanged(verification, expectedUpdatedAt) {
      const existing = getVerificationStore().verifications.get(verification.id);

      if (!existing || existing.updatedAt !== expectedUpdatedAt) {
        return false;
      }

      getVerificationStore().verifications.set(verification.id, verification);

      return true;
    },
  };
}

export function getVerificationStore(): VerificationStore {
  if (!globalThis.__okkhorVerificationStore) {
    globalThis.__okkhorVerificationStore = createStore();
  }

  return globalThis.__okkhorVerificationStore;
}

export function getMemoryVerificationRepository(): VerificationRepository {
  if (!globalThis.__okkhorMemoryVerificationRepository) {
    globalThis.__okkhorMemoryVerificationRepository = createMemoryVerificationRepository();
  }

  return globalThis.__okkhorMemoryVerificationRepository;
}

export function resetVerificationStoreForTesting() {
  globalThis.__okkhorVerificationStore = createStore();
  globalThis.__okkhorMemoryVerificationRepository = createMemoryVerificationRepository();
}
