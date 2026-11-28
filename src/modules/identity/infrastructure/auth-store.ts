import type {
  AuthRepository,
  AuthSessionRecord,
  AuthStore,
  PasswordResetRecord,
  UserRecord,
} from "@/src/modules/identity/domain/auth-types";

declare global {
  var __okkhorAuthStore: AuthStore | undefined;
}

function createStore(): AuthStore {
  return {
    usersById: new Map(),
    usersByPhone: new Map(),
    sessionsById: new Map(),
    passwordResetById: new Map(),
  };
}

function createMemoryAuthRepository(): AuthRepository {
  return {
    async getUserById(id) {
      return getAuthStore().usersById.get(id);
    },
    async getUserByPhone(phoneNumber) {
      const store = getAuthStore();
      const userId = store.usersByPhone.get(phoneNumber);

      return userId ? store.usersById.get(userId) : undefined;
    },
    async listProfilesByIds(ids) {
      const store = getAuthStore();

      return ids
        .map((id) => store.usersById.get(id))
        .filter((user): user is UserRecord => user !== undefined)
        .map((user) => ({ id: user.id, displayName: user.displayName }));
    },
    async listUsers() {
      return Array.from(getAuthStore().usersById.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },
    async createUser(user) {
      const store = getAuthStore();
      store.usersById.set(user.id, user);
      store.usersByPhone.set(user.phoneNumber, user.id);
    },
    async updateUser(user) {
      const store = getAuthStore();
      store.usersById.set(user.id, user);
      store.usersByPhone.set(user.phoneNumber, user.id);
    },
    async getSessionById(id) {
      return getAuthStore().sessionsById.get(id);
    },
    async createSession(session) {
      getAuthStore().sessionsById.set(session.id, session);
    },
    async updateSession(session) {
      getAuthStore().sessionsById.set(session.id, session);
    },
    async listSessionsByUserId(userId) {
      return Array.from(getAuthStore().sessionsById.values()).filter((session) => session.userId === userId);
    },
    async createPasswordReset(record) {
      getAuthStore().passwordResetById.set(record.id, record);
    },
    async updatePasswordReset(record) {
      getAuthStore().passwordResetById.set(record.id, record);
    },
    async getPasswordResetByTokenHash(tokenHash) {
      return Array.from(getAuthStore().passwordResetById.values()).find((record) => record.tokenHash === tokenHash);
    },
  };
}

declare global {
  var __okkhorMemoryAuthRepository: AuthRepository | undefined;
}

export function getAuthStore(): AuthStore {
  if (!globalThis.__okkhorAuthStore) {
    globalThis.__okkhorAuthStore = createStore();
  }

  return globalThis.__okkhorAuthStore;
}

export function getMemoryAuthRepository(): AuthRepository {
  if (!globalThis.__okkhorMemoryAuthRepository) {
    globalThis.__okkhorMemoryAuthRepository = createMemoryAuthRepository();
  }

  return globalThis.__okkhorMemoryAuthRepository;
}

export function resetAuthStoreForTesting() {
  globalThis.__okkhorAuthStore = createStore();
  globalThis.__okkhorMemoryAuthRepository = createMemoryAuthRepository();
}
