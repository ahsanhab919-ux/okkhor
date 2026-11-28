export type UserRole = "learner" | "scholar" | "admin";

export type UserProfile = {
  id: string;
  phoneNumber: string;
  displayName: string;
  locale: string;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  passwordUpdatedAt: string;
  /**
   * Optional recovery/notification contact (`password-reset-delivery-slice.md` §5). It is not an
   * identifier, is not unique, and is returned only to its owner — never through `PublicProfile`.
   */
  email?: string;
};

export type UserRecord = UserProfile & {
  passwordHash: string;
};

/** A minimal author label: the id and the name to show for it. */
export type UserProfileLabel = {
  id: string;
  displayName: string;
};

/**
 * The public footprint of a member: the only member shape a profile page may render. It
 * deliberately excludes `phoneNumber`, `locale`, `lastLoginAt`, `updatedAt`, and
 * `passwordUpdatedAt` so no sensitive field can leak through a profile route
 * (`member-profile-slice.md` §5, §7).
 */
export type PublicProfile = {
  id: string;
  displayName: string;
  roles: UserRole[];
  createdAt: string;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

export type PasswordResetRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

export type AuthSuccess = {
  user: UserProfile;
  tokens: AuthTokens;
};

export type AccessTokenClaims = {
  sub: string;
  sessionId: string;
  phoneNumber: string;
  roles: UserRole[];
  type: "access";
};

export type RefreshTokenClaims = {
  sub: string;
  sessionId: string;
  type: "refresh";
};

export type AuthStore = {
  usersById: Map<string, UserRecord>;
  usersByPhone: Map<string, string>;
  sessionsById: Map<string, AuthSessionRecord>;
  passwordResetById: Map<string, PasswordResetRecord>;
};

export type AuthRepository = {
  getUserById(id: string): Promise<UserRecord | undefined>;
  getUserByPhone(phoneNumber: string): Promise<UserRecord | undefined>;
  /** Display labels for the given ids; unknown ids are omitted. */
  listProfilesByIds(ids: string[]): Promise<UserProfileLabel[]>;
  createUser(user: UserRecord): Promise<void>;
  updateUser(user: UserRecord): Promise<void>;
  getSessionById(id: string): Promise<AuthSessionRecord | undefined>;
  createSession(session: AuthSessionRecord): Promise<void>;
  updateSession(session: AuthSessionRecord): Promise<void>;
  listSessionsByUserId(userId: string): Promise<AuthSessionRecord[]>;
  createPasswordReset(record: PasswordResetRecord): Promise<void>;
  updatePasswordReset(record: PasswordResetRecord): Promise<void>;
  getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRecord | undefined>;
};
