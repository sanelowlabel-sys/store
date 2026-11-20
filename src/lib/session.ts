import { CustomerSession } from '../types';
import { WishlistCoordinator, WishlistScope } from './wishlist';

export type SessionVerificationStatus = 'unresolved' | 'authenticated' | 'guest';

export type SessionVerificationTrigger =
  | 'mount'
  | 'tab-return'
  | 'focus'
  | 'session-change'
  | 'cross-tab'
  | 'retry'
  | 'logout-recovery';

export interface SessionVerificationState {
  sessionStatus: SessionVerificationStatus;
  customerSession: CustomerSession | null;
  sessionError: string | null;
  isVerifying: boolean;
  isLogoutInProgress: boolean;
  requestSeq: number;
}

export type SessionStateListener = (state: SessionVerificationState) => void;

export interface SessionVerificationDependencies {
  fetchSession: () => Promise<CustomerSession>;
  wishlistCoordinator: WishlistCoordinator;
  remoteLogoutGraceMs?: number;
}

export const SESSION_INVALIDATION_CHANNEL_NAME = 'sanelow_session_invalidation_v1';
export const SESSION_INVALIDATION_STORAGE_KEY = 'sanelow_cross_tab_invalidation_ping';
export const DEFAULT_REMOTE_LOGOUT_GRACE_MS = 5000;
const MAX_RECOVERABLE_FAILED_ATTEMPTS = 64;

let crossTabEventSeq = 0;
let logoutAttemptSeq = 0;

/**
 * Generates a non-sensitive correlation identifier for a single logout attempt.
 * Never embeds customer identity, email, secrets, or session tokens.
 */
export function createLogoutAttemptId(): string {
  logoutAttemptSeq += 1;
  return `logout_${Date.now()}_${logoutAttemptSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractValidatedCustomerId(sess: CustomerSession | null | undefined): string | null {
  if (!sess || sess.authenticated !== true) return null;
  const rawId = sess.customer?.id;
  if (typeof rawId === 'string' && rawId.trim().length > 0) {
    return rawId.trim();
  }
  return null;
}

export class SessionVerificationCoordinator {
  private fetchSession: () => Promise<CustomerSession>;
  private wishlistCoordinator: WishlistCoordinator;
  private remoteLogoutGraceMs: number;
  private listeners = new Set<SessionStateListener>();
  private state: SessionVerificationState = {
    sessionStatus: 'unresolved',
    customerSession: null,
    sessionError: null,
    isVerifying: false,
    isLogoutInProgress: false,
    requestSeq: 0,
  };
  private inFlightPromise: Promise<SessionVerificationState> | null = null;
  private localLogoutAttemptId: string | null = null;
  private lastLocalLogoutAttemptId: string | null = null;
  private pendingRemoteLogoutAttempts = new Map<string, ReturnType<typeof setTimeout>>();
  private recoverableFailedRemoteAttempts: string[] = [];
  private recoverableFailedRemoteAttemptSet = new Set<string>();

  constructor(deps: SessionVerificationDependencies) {
    this.fetchSession = deps.fetchSession;
    this.wishlistCoordinator = deps.wishlistCoordinator;
    this.remoteLogoutGraceMs =
      typeof deps.remoteLogoutGraceMs === 'number' && deps.remoteLogoutGraceMs >= 0
        ? deps.remoteLogoutGraceMs
        : DEFAULT_REMOTE_LOGOUT_GRACE_MS;
  }

  public getState(): SessionVerificationState {
    return this.state;
  }

  public isAnyLogoutLockActive(): boolean {
    return this.localLogoutAttemptId !== null || this.pendingRemoteLogoutAttempts.size > 0;
  }

  public getLogoutLockMode(): 'none' | 'local' | 'remote' {
    if (this.localLogoutAttemptId !== null) return 'local';
    if (this.pendingRemoteLogoutAttempts.size > 0) return 'remote';
    return 'none';
  }

  public getLocalLogoutAttemptId(): string | null {
    return this.localLogoutAttemptId ?? this.lastLocalLogoutAttemptId;
  }

  public getPendingRemoteLogoutAttemptIds(): string[] {
    return Array.from(this.pendingRemoteLogoutAttempts.keys());
  }

  public subscribe = (listener: SessionStateListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // Guard against listener exceptions
      }
    }
  }

  private recordRecoverableFailedRemoteAttempt(attemptId: string): void {
    if (this.recoverableFailedRemoteAttemptSet.has(attemptId)) {
      return;
    }
    this.recoverableFailedRemoteAttemptSet.add(attemptId);
    this.recoverableFailedRemoteAttempts.push(attemptId);
    if (this.recoverableFailedRemoteAttempts.length > MAX_RECOVERABLE_FAILED_ATTEMPTS) {
      const oldest = this.recoverableFailedRemoteAttempts.shift();
      if (oldest) {
        this.recoverableFailedRemoteAttemptSet.delete(oldest);
      }
    }
  }

  private clearRecoverableFailedRemoteAttempts(): void {
    this.recoverableFailedRemoteAttempts.length = 0;
    this.recoverableFailedRemoteAttemptSet.clear();
  }

  public clearRemoteLogoutTimer(): void {
    for (const timer of this.pendingRemoteLogoutAttempts.values()) {
      clearTimeout(timer);
    }
    this.pendingRemoteLogoutAttempts.clear();
  }

  public getConfirmedScope(): WishlistScope {
    if (this.state.isLogoutInProgress || this.state.isVerifying) return undefined;
    if (this.state.sessionStatus === 'authenticated') {
      return extractValidatedCustomerId(this.state.customerSession) ?? undefined;
    }
    if (this.state.sessionStatus === 'guest') {
      return null;
    }
    return undefined;
  }

  public reset(): void {
    this.clearRemoteLogoutTimer();
    this.clearRecoverableFailedRemoteAttempts();
    this.localLogoutAttemptId = null;
    this.lastLocalLogoutAttemptId = null;
    this.inFlightPromise = null;
    this.state = {
      sessionStatus: 'unresolved',
      customerSession: null,
      sessionError: null,
      isVerifying: false,
      isLogoutInProgress: false,
      requestSeq: this.state.requestSeq + 1,
    };
    this.wishlistCoordinator.startSessionVerification();
    this.notifyListeners();
  }

  public handleLogoutStart(logoutAttemptId?: string): string {
    const attemptId =
      typeof logoutAttemptId === 'string' && logoutAttemptId.trim().length > 0
        ? logoutAttemptId.trim()
        : createLogoutAttemptId();
    this.clearRecoverableFailedRemoteAttempts();
    this.localLogoutAttemptId = attemptId;
    this.lastLocalLogoutAttemptId = attemptId;
    const nextSeq = this.state.requestSeq + 1;
    this.inFlightPromise = null;
    this.wishlistCoordinator.startSessionVerification();
    this.state = {
      sessionStatus: 'unresolved',
      customerSession: null,
      sessionError: null,
      isVerifying: false,
      isLogoutInProgress: true,
      requestSeq: nextSeq,
    };
    this.notifyListeners();
    return attemptId;
  }

  public handleLogoutRecovered(logoutAttemptId?: string): Promise<SessionVerificationState> {
    if (
      typeof logoutAttemptId === 'string' &&
      logoutAttemptId.trim().length > 0 &&
      this.localLogoutAttemptId !== null &&
      logoutAttemptId.trim() !== this.localLogoutAttemptId
    ) {
      return Promise.resolve(this.state);
    }
    this.localLogoutAttemptId = null;
    this.lastLocalLogoutAttemptId = null;
    if (this.isAnyLogoutLockActive()) {
      this.wishlistCoordinator.startSessionVerification();
      this.state = {
        ...this.state,
        sessionStatus: 'unresolved',
        customerSession: null,
        isVerifying: false,
        isLogoutInProgress: true,
      };
      this.notifyListeners();
      return Promise.resolve(this.state);
    }
    this.state = {
      ...this.state,
      isLogoutInProgress: false,
    };
    return this.verify('logout-recovery');
  }

  /**
   * Handles a sibling tab starting logout for a specific logoutAttemptId:
   * - Immediately locks mutations, clears exposed customer state, and rejects pending/late responses.
   * - Tracks each pending remote attempt independently so one attempt finishing never releases another.
   * - Establishes a bounded per-attempt grace window so an interrupted initiating tab cannot cause a permanent unexplained lock.
   */
  public handleRemoteLogoutStart(options?: {
    logoutAttemptId?: string;
    graceMs?: number;
  }): string {
    const attemptId =
      typeof options?.logoutAttemptId === 'string' && options.logoutAttemptId.trim().length > 0
        ? options.logoutAttemptId.trim()
        : createLogoutAttemptId();

    this.clearRecoverableFailedRemoteAttempts();

    const existingTimer = this.pendingRemoteLogoutAttempts.get(attemptId);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      this.pendingRemoteLogoutAttempts.delete(attemptId);
    }

    const nextSeq = this.state.requestSeq + 1;
    this.inFlightPromise = null;
    this.wishlistCoordinator.startSessionVerification();
    this.state = {
      sessionStatus: 'unresolved',
      customerSession: null,
      sessionError: null,
      isVerifying: false,
      isLogoutInProgress: true,
      requestSeq: nextSeq,
    };

    const graceMs =
      typeof options?.graceMs === 'number' && options.graceMs >= 0
        ? options.graceMs
        : this.remoteLogoutGraceMs;

    const timer = setTimeout(() => {
      if (this.pendingRemoteLogoutAttempts.get(attemptId) !== timer) {
        return;
      }
      this.pendingRemoteLogoutAttempts.delete(attemptId);
      if (this.isAnyLogoutLockActive()) {
        this.notifyListeners();
        return;
      }
      this.wishlistCoordinator.startSessionVerification();
      this.state = {
        ...this.state,
        sessionStatus: 'unresolved',
        customerSession: null,
        sessionError:
          'Sign out started in another tab did not confirm completion. Click Retry Verification to check your session.',
        isVerifying: false,
        isLogoutInProgress: false,
      };
      this.notifyListeners();
    }, graceMs);
    if (typeof (timer as any)?.unref === 'function') {
      (timer as any).unref();
    }

    this.pendingRemoteLogoutAttempts.set(attemptId, timer);
    this.notifyListeners();
    return attemptId;
  }

  public handleRemoteLogoutComplete(logoutAttemptId: string): Promise<SessionVerificationState> {
    const attemptId = typeof logoutAttemptId === 'string' ? logoutAttemptId.trim() : '';
    if (!attemptId || !this.pendingRemoteLogoutAttempts.has(attemptId)) {
      return Promise.resolve(this.state);
    }

    const timer = this.pendingRemoteLogoutAttempts.get(attemptId);
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    this.pendingRemoteLogoutAttempts.delete(attemptId);
    this.recoverableFailedRemoteAttemptSet.delete(attemptId);

    if (this.isAnyLogoutLockActive()) {
      this.notifyListeners();
      return Promise.resolve(this.state);
    }

    this.clearRecoverableFailedRemoteAttempts();
    this.state = {
      ...this.state,
      isLogoutInProgress: false,
      sessionError: null,
    };
    return this.verify('cross-tab');
  }

  public handleRemoteLogoutFailed(logoutAttemptId: string): void {
    const attemptId = typeof logoutAttemptId === 'string' ? logoutAttemptId.trim() : '';
    if (!attemptId || !this.pendingRemoteLogoutAttempts.has(attemptId)) {
      return;
    }

    const timer = this.pendingRemoteLogoutAttempts.get(attemptId);
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    this.pendingRemoteLogoutAttempts.delete(attemptId);

    if (this.isAnyLogoutLockActive()) {
      this.notifyListeners();
      return;
    }

    this.recordRecoverableFailedRemoteAttempt(attemptId);
    this.inFlightPromise = null;
    this.wishlistCoordinator.startSessionVerification();
    this.state = {
      sessionStatus: 'unresolved',
      customerSession: null,
      sessionError:
        'Sign out failed in another tab. Click Retry Verification to check your session.',
      isVerifying: false,
      isLogoutInProgress: false,
      requestSeq: this.state.requestSeq + 1,
    };
    this.notifyListeners();
  }

  public handleRemoteLogoutRecovery(logoutAttemptId: string): Promise<SessionVerificationState> {
    const attemptId = typeof logoutAttemptId === 'string' ? logoutAttemptId.trim() : '';
    if (!attemptId) {
      return Promise.resolve(this.state);
    }

    if (this.pendingRemoteLogoutAttempts.has(attemptId)) {
      const timer = this.pendingRemoteLogoutAttempts.get(attemptId);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      this.pendingRemoteLogoutAttempts.delete(attemptId);
      this.recoverableFailedRemoteAttemptSet.delete(attemptId);

      if (this.isAnyLogoutLockActive()) {
        this.notifyListeners();
        return Promise.resolve(this.state);
      }

      this.clearRecoverableFailedRemoteAttempts();
      this.state = {
        ...this.state,
        isLogoutInProgress: false,
        sessionError: null,
      };
      return this.verify('cross-tab');
    }

    // Never release an active lock for another attempt or run recovery if another attempt is pending
    if (this.isAnyLogoutLockActive() || this.state.isLogoutInProgress) {
      return Promise.resolve(this.state);
    }

    // Allow matching recovery once when that exact attempt transitioned directly from failure to Resume Session
    if (this.recoverableFailedRemoteAttemptSet.has(attemptId)) {
      this.recoverableFailedRemoteAttemptSet.delete(attemptId);
      this.state = {
        ...this.state,
        isLogoutInProgress: false,
        sessionError: null,
      };
      return this.verify('cross-tab');
    }

    return Promise.resolve(this.state);
  }

  public handleRemoteSessionChange(): Promise<SessionVerificationState> {
    // An unrelated session-change must NEVER release an active local or remote logout lock
    if (this.isAnyLogoutLockActive() || this.state.isLogoutInProgress) {
      return Promise.resolve(this.state);
    }
    return this.verify('cross-tab');
  }

  public verify(trigger: SessionVerificationTrigger = 'retry'): Promise<SessionVerificationState> {
    // 1. Block all verification while logout is in progress
    if (this.state.isLogoutInProgress) {
      return Promise.resolve(this.state);
    }

    // 2. Prevent unbounded automatic retry loops after a verification failure
    if (
      (trigger === 'focus' || trigger === 'tab-return') &&
      this.state.sessionStatus === 'unresolved' &&
      this.state.sessionError !== null
    ) {
      return Promise.resolve(this.state);
    }

    const isAuthoritativeChange =
      trigger === 'session-change' || trigger === 'cross-tab' || trigger === 'logout-recovery';

    // 3. Coalesce overlapping equivalent requests onto the active in-flight check
    if (this.inFlightPromise && !isAuthoritativeChange) {
      return this.inFlightPromise;
    }

    // 4. Immediately hide customer-scoped saved items, block mutations, and enter unresolved verifying state
    // whenever identity verification runs. Never retain an older customer's active scope while pending.
    const reqSeq = this.state.requestSeq + 1;
    this.wishlistCoordinator.startSessionVerification();
    this.state = {
      ...this.state,
      sessionStatus: 'unresolved',
      customerSession: null,
      sessionError: null,
      isVerifying: true,
      requestSeq: reqSeq,
    };
    this.notifyListeners();

    const promise = this.fetchSession()
      .then((sess) => {
        if (this.state.isLogoutInProgress || reqSeq !== this.state.requestSeq) {
          return this.state;
        }

        if (sess && sess.authenticated === true) {
          const customerId = extractValidatedCustomerId(sess);
          if (customerId) {
            this.wishlistCoordinator.setScope(customerId);
            this.state = {
              ...this.state,
              sessionStatus: 'authenticated',
              customerSession: sess,
              sessionError: null,
              isVerifying: false,
            };
          } else {
            this.wishlistCoordinator.startSessionVerification();
            this.state = {
              ...this.state,
              sessionStatus: 'unresolved',
              customerSession: null,
              sessionError: 'Session response missing valid customer identity.',
              isVerifying: false,
            };
          }
        } else if (sess && sess.authenticated === false) {
          this.wishlistCoordinator.setScope(null);
          this.state = {
            ...this.state,
            sessionStatus: 'guest',
            customerSession: sess,
            sessionError: null,
            isVerifying: false,
          };
        } else {
          this.wishlistCoordinator.startSessionVerification();
          this.state = {
            ...this.state,
            sessionStatus: 'unresolved',
            customerSession: null,
            sessionError: 'Unrecognized session status.',
            isVerifying: false,
          };
        }

        if (this.inFlightPromise === promise) {
          this.inFlightPromise = null;
        }
        this.notifyListeners();
        return this.state;
      })
      .catch((err: any) => {
        if (this.state.isLogoutInProgress || reqSeq !== this.state.requestSeq) {
          return this.state;
        }

        if (this.inFlightPromise === promise) {
          this.inFlightPromise = null;
        }
        this.wishlistCoordinator.startSessionVerification();
        this.state = {
          ...this.state,
          sessionStatus: 'unresolved',
          customerSession: null,
          sessionError: err?.message || 'Unable to verify session.',
          isVerifying: false,
        };
        this.notifyListeners();
        return this.state;
      })
      .finally(() => {
        if (this.inFlightPromise === promise) {
          this.inFlightPromise = null;
        }
      });

    this.inFlightPromise = promise;
    return promise;
  }
}

export function createSessionVerificationCoordinator(
  deps: SessionVerificationDependencies
): SessionVerificationCoordinator {
  return new SessionVerificationCoordinator(deps);
}

export interface TabReturnTrackerOptions {
  getVisibilityState?: () => string;
  hasDocumentFocus?: () => boolean;
}

/**
 * Distinguishes actual browser tab/window departure & return from in-page focus movement,
 * and deduplicates overlapping visibilitychange / pageshow / focus events belonging to the same return,
 * without any time-based cooldown skipping required identity verification.
 */
export class TabReturnTracker {
  private hasDeparted = false;
  private returnDispatched = false;
  private getVisibilityState: () => string;
  private hasDocumentFocus: () => boolean;

  constructor(options?: TabReturnTrackerOptions) {
    this.getVisibilityState =
      options?.getVisibilityState ??
      (() => (typeof document !== 'undefined' ? document.visibilityState : 'visible'));
    this.hasDocumentFocus =
      options?.hasDocumentFocus ??
      (() =>
        typeof document !== 'undefined' && typeof document.hasFocus === 'function'
          ? document.hasFocus()
          : false);
  }

  public handleVisibilityChange(): boolean {
    const vis = this.getVisibilityState();
    if (vis === 'hidden') {
      this.hasDeparted = true;
      this.returnDispatched = false;
      return false;
    }
    if (vis === 'visible' && this.hasDeparted && !this.returnDispatched) {
      this.hasDeparted = false;
      this.returnDispatched = true;
      return true;
    }
    return false;
  }

  public handlePageHide(): void {
    this.hasDeparted = true;
    this.returnDispatched = false;
  }

  public handlePageShow(): boolean {
    const vis = this.getVisibilityState();
    if (vis === 'visible' && this.hasDeparted && !this.returnDispatched) {
      this.hasDeparted = false;
      this.returnDispatched = true;
      return true;
    }
    return false;
  }

  public handleWindowBlur(): void {
    // Only mark departure if document is hidden or window truly lost focus.
    // Focus movement between elements inside the active document keeps document.hasFocus() === true.
    if (this.getVisibilityState() === 'hidden' || !this.hasDocumentFocus()) {
      this.hasDeparted = true;
      this.returnDispatched = false;
    }
  }

  public handleWindowFocus(): boolean {
    if (this.getVisibilityState() === 'hidden') {
      return false;
    }
    if (this.hasDeparted && !this.returnDispatched) {
      this.hasDeparted = false;
      this.returnDispatched = true;
      return true;
    }
    return false;
  }

  public reset(): void {
    this.hasDeparted = false;
    this.returnDispatched = false;
  }
}

export type CrossTabInvalidationReason =
  | 'logout-start'
  | 'logout-complete'
  | 'logout-failed'
  | 'logout-recovery'
  | 'session-change';

const VALID_CROSS_TAB_REASONS = new Set<CrossTabInvalidationReason>([
  'logout-start',
  'logout-complete',
  'logout-failed',
  'logout-recovery',
  'session-change',
]);

const LOGOUT_CROSS_TAB_REASONS = new Set<CrossTabInvalidationReason>([
  'logout-start',
  'logout-complete',
  'logout-failed',
  'logout-recovery',
]);

/**
 * Non-sensitive cross-tab synchronization signal payload.
 * Never contains credentials, customer identity, or authenticated-state booleans.
 */
export interface CrossTabInvalidationMessage {
  type: 'session-invalidated';
  reason: CrossTabInvalidationReason;
  sourceId: string;
  eventId: string;
  emittedAt: number;
  logoutAttemptId?: string;
}

export interface BrowserSessionSyncEnvironment {
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  documentTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'> & {
    visibilityState?: string;
    hasFocus?: () => boolean;
  };
  createBroadcastChannel?: (name: string) => {
    postMessage: (msg: unknown) => void;
    close: () => void;
    addEventListener: (type: 'message', listener: (ev: { data: unknown }) => void) => void;
    removeEventListener: (type: 'message', listener: (ev: { data: unknown }) => void) => void;
  };
  storage?: Pick<Storage, 'setItem'>;
  tabInstanceId?: string;
  remoteLogoutGraceMs?: number;
}

function createCrossTabEventId(sourceId: string): string {
  crossTabEventSeq += 1;
  return `evt_${Date.now()}_${crossTabEventSeq}_${sourceId}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseCrossTabInvalidationMessage(
  raw: unknown
): CrossTabInvalidationMessage | null {
  let candidate: any = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }
  if (candidate.type !== 'session-invalidated') {
    return null;
  }
  if (
    typeof candidate.reason !== 'string' ||
    !VALID_CROSS_TAB_REASONS.has(candidate.reason as CrossTabInvalidationReason)
  ) {
    return null;
  }
  if (typeof candidate.sourceId !== 'string' || candidate.sourceId.trim().length === 0) {
    return null;
  }
  if (typeof candidate.eventId !== 'string' || candidate.eventId.trim().length === 0) {
    return null;
  }

  const reason = candidate.reason as CrossTabInvalidationReason;
  const requiresLogoutAttemptId = LOGOUT_CROSS_TAB_REASONS.has(reason);
  let logoutAttemptId: string | undefined;
  if (candidate.logoutAttemptId !== undefined) {
    if (
      typeof candidate.logoutAttemptId !== 'string' ||
      candidate.logoutAttemptId.trim().length === 0
    ) {
      return null;
    }
    logoutAttemptId = candidate.logoutAttemptId.trim();
  } else if (requiresLogoutAttemptId) {
    return null;
  }

  const emittedAt =
    typeof candidate.emittedAt === 'number' && Number.isFinite(candidate.emittedAt)
      ? candidate.emittedAt
      : Date.now();
  return {
    type: 'session-invalidated',
    reason,
    sourceId: candidate.sourceId,
    eventId: candidate.eventId,
    emittedAt,
    ...(logoutAttemptId ? { logoutAttemptId } : {}),
  };
}

export function broadcastCrossTabSessionInvalidation(
  reason: CrossTabInvalidationReason,
  sourceId: string,
  env?: Pick<BrowserSessionSyncEnvironment, 'createBroadcastChannel' | 'storage'>,
  explicitEventId?: string,
  explicitLogoutAttemptId?: string
): string {
  const eventId = explicitEventId || createCrossTabEventId(sourceId);
  const logoutAttemptId = LOGOUT_CROSS_TAB_REASONS.has(reason)
    ? (typeof explicitLogoutAttemptId === 'string' && explicitLogoutAttemptId.trim().length > 0
        ? explicitLogoutAttemptId.trim()
        : createLogoutAttemptId())
    : undefined;

  const payload: CrossTabInvalidationMessage = {
    type: 'session-invalidated',
    reason,
    sourceId,
    eventId,
    emittedAt: Date.now(),
    ...(logoutAttemptId ? { logoutAttemptId } : {}),
  };

  try {
    if (env?.createBroadcastChannel) {
      const ch = env.createBroadcastChannel(SESSION_INVALIDATION_CHANNEL_NAME);
      ch.postMessage(payload);
      ch.close();
    } else if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SESSION_INVALIDATION_CHANNEL_NAME);
      ch.postMessage(payload);
      ch.close();
    }
  } catch {
    // BroadcastChannel unavailable
  }

  try {
    const serialized = JSON.stringify(payload);
    if (env?.storage) {
      env.storage.setItem(SESSION_INVALIDATION_STORAGE_KEY, serialized);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_INVALIDATION_STORAGE_KEY, serialized);
    }
  } catch {
    // Storage unavailable
  }

  return eventId;
}

/**
 * Binds authoritative browser tab/window return detection, deduplicated cross-tab session invalidation,
 * reason-aware logout synchronization, and local logout/session events to SessionVerificationCoordinator.
 */
export function bindBrowserSessionSync(
  coordinator: SessionVerificationCoordinator,
  env?: BrowserSessionSyncEnvironment
): () => void {
  const win = env?.windowTarget ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = env?.documentTarget ?? (typeof document !== 'undefined' ? document : undefined);
  const tabInstanceId =
    env?.tabInstanceId ?? `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const tabTracker = new TabReturnTracker({
    getVisibilityState: () => doc?.visibilityState ?? 'visible',
    hasDocumentFocus: () => (typeof doc?.hasFocus === 'function' ? doc.hasFocus() : false),
  });

  const broadcastEnv: Pick<BrowserSessionSyncEnvironment, 'createBroadcastChannel' | 'storage'> = {
    createBroadcastChannel: env?.createBroadcastChannel,
    storage: env?.storage,
  };

  const MAX_SEEN_EVENT_IDS = 128;
  const seenEventIds: string[] = [];
  const seenEventIdSet = new Set<string>();

  const markAndCheckSeenEvent = (eventId: string): boolean => {
    if (seenEventIdSet.has(eventId)) {
      return true;
    }
    seenEventIdSet.add(eventId);
    seenEventIds.push(eventId);
    if (seenEventIds.length > MAX_SEEN_EVENT_IDS) {
      const oldest = seenEventIds.shift();
      if (oldest) {
        seenEventIdSet.delete(oldest);
      }
    }
    return false;
  };

  const handleIncomingCrossTabPayload = (rawPayload: unknown) => {
    const msg = parseCrossTabInvalidationMessage(rawPayload);
    if (!msg) return;
    if (msg.sourceId === tabInstanceId) return;
    if (markAndCheckSeenEvent(msg.eventId)) return;

    switch (msg.reason) {
      case 'logout-start':
        coordinator.handleRemoteLogoutStart({
          logoutAttemptId: msg.logoutAttemptId,
          graceMs: env?.remoteLogoutGraceMs,
        });
        break;
      case 'logout-complete':
        if (msg.logoutAttemptId) {
          void coordinator.handleRemoteLogoutComplete(msg.logoutAttemptId);
        }
        break;
      case 'logout-failed':
        if (msg.logoutAttemptId) {
          coordinator.handleRemoteLogoutFailed(msg.logoutAttemptId);
        }
        break;
      case 'logout-recovery':
        if (msg.logoutAttemptId) {
          void coordinator.handleRemoteLogoutRecovery(msg.logoutAttemptId);
        }
        break;
      case 'session-change':
        void coordinator.handleRemoteSessionChange();
        break;
    }
  };

  let channel:
    | {
        postMessage: (msg: unknown) => void;
        close: () => void;
        addEventListener: (type: 'message', listener: (ev: { data: unknown }) => void) => void;
        removeEventListener: (type: 'message', listener: (ev: { data: unknown }) => void) => void;
      }
    | undefined;

  try {
    if (env?.createBroadcastChannel) {
      channel = env.createBroadcastChannel(SESSION_INVALIDATION_CHANNEL_NAME);
    } else if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(SESSION_INVALIDATION_CHANNEL_NAME);
    }
  } catch {
    channel = undefined;
  }

  const onVisibilityChange = () => {
    if (tabTracker.handleVisibilityChange()) {
      void coordinator.verify('tab-return');
    }
  };
  const onPageHide = () => {
    tabTracker.handlePageHide();
  };
  const onPageShow = () => {
    if (tabTracker.handlePageShow()) {
      void coordinator.verify('tab-return');
    }
  };
  const onWindowBlur = () => {
    tabTracker.handleWindowBlur();
  };
  const onWindowFocus = () => {
    if (tabTracker.handleWindowFocus()) {
      void coordinator.verify('tab-return');
    }
  };

  const extractEventAttemptId = (ev: Event): string | undefined => {
    const rawDetailId = (ev as CustomEvent<{ logoutAttemptId?: unknown }>)?.detail?.logoutAttemptId;
    if (typeof rawDetailId === 'string' && rawDetailId.trim().length > 0) {
      return rawDetailId.trim();
    }
    return undefined;
  };

  const onLogoutStart = (ev: Event) => {
    const attemptId = coordinator.handleLogoutStart(extractEventAttemptId(ev));
    broadcastCrossTabSessionInvalidation(
      'logout-start',
      tabInstanceId,
      broadcastEnv,
      undefined,
      attemptId
    );
  };
  const onLogoutComplete = (ev: Event) => {
    const attemptId = extractEventAttemptId(ev) ?? coordinator.getLocalLogoutAttemptId() ?? undefined;
    if (!attemptId) return;
    broadcastCrossTabSessionInvalidation(
      'logout-complete',
      tabInstanceId,
      broadcastEnv,
      undefined,
      attemptId
    );
  };
  const onLogoutFailed = (ev: Event) => {
    const attemptId = extractEventAttemptId(ev) ?? coordinator.getLocalLogoutAttemptId() ?? undefined;
    if (!attemptId) return;
    broadcastCrossTabSessionInvalidation(
      'logout-failed',
      tabInstanceId,
      broadcastEnv,
      undefined,
      attemptId
    );
  };
  const onLogoutRecovered = (ev: Event) => {
    const attemptId = extractEventAttemptId(ev) ?? coordinator.getLocalLogoutAttemptId() ?? undefined;
    void coordinator.handleLogoutRecovered(attemptId);
    if (!attemptId) return;
    broadcastCrossTabSessionInvalidation(
      'logout-recovery',
      tabInstanceId,
      broadcastEnv,
      undefined,
      attemptId
    );
  };
  const onSessionChanged = () => {
    void coordinator.verify('session-change');
    broadcastCrossTabSessionInvalidation('session-change', tabInstanceId, broadcastEnv);
  };

  const onBroadcastMessage = (ev: { data: unknown }) => {
    handleIncomingCrossTabPayload(ev?.data);
  };

  const onStorage = (ev: Event & { key?: string | null; newValue?: string | null }) => {
    if (ev.key === SESSION_INVALIDATION_STORAGE_KEY && ev.newValue) {
      handleIncomingCrossTabPayload(ev.newValue);
    }
  };

  void coordinator.verify('mount');

  doc?.addEventListener('visibilitychange', onVisibilityChange);
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);
  win?.addEventListener('blur', onWindowBlur);
  win?.addEventListener('focus', onWindowFocus);
  win?.addEventListener('customer-logout-started', onLogoutStart);
  win?.addEventListener('customer-logout-completed', onLogoutComplete);
  win?.addEventListener('customer-logout-failed', onLogoutFailed);
  win?.addEventListener('customer-logout-recovered', onLogoutRecovered);
  win?.addEventListener('customer-session-changed', onSessionChanged);
  win?.addEventListener('storage', onStorage as EventListener);
  channel?.addEventListener('message', onBroadcastMessage);

  return () => {
    coordinator.clearRemoteLogoutTimer();
    doc?.removeEventListener('visibilitychange', onVisibilityChange);
    win?.removeEventListener('pagehide', onPageHide);
    win?.removeEventListener('pageshow', onPageShow);
    win?.removeEventListener('blur', onWindowBlur);
    win?.removeEventListener('focus', onWindowFocus);
    win?.removeEventListener('customer-logout-started', onLogoutStart);
    win?.removeEventListener('customer-logout-completed', onLogoutComplete);
    win?.removeEventListener('customer-logout-failed', onLogoutFailed);
    win?.removeEventListener('customer-logout-recovered', onLogoutRecovered);
    win?.removeEventListener('customer-session-changed', onSessionChanged);
    win?.removeEventListener('storage', onStorage as EventListener);
    channel?.removeEventListener('message', onBroadcastMessage);
    try {
      channel?.close();
    } catch {
      // Ignore close error
    }
  };
}
