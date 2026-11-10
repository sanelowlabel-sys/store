import { Product } from '../types';

/**
 * Customer identity scope for browser-local storage:
 * - `undefined`: identity is unresolved or actively changing.
 * - `null`: confirmed guest session.
 * - `<string>`: confirmed authenticated customer ID (e.g. 'gid://shopify/Customer/123').
 */
export type WishlistScope = string | null | undefined;

export interface WishlistState {
  customerId: WishlistScope;
  scopeGeneration: number;
  items: Product[];
}

export type WishlistListener = (state: WishlistState) => void;

export const GUEST_WISHLIST_STORAGE_KEY = 'sanelow_merch_wishlist';

/**
 * Returns customer-scoped or guest storage key for browser-local wishlist:
 * - `undefined`: returns `null` (unresolved identity has no storage key; never accesses guest or customer storage).
 * - `null`: returns `GUEST_WISHLIST_STORAGE_KEY` ('sanelow_merch_wishlist').
 * - Non-empty string: returns `sanelow_merch_wishlist_cust_<hex>`.
 * - Empty string or whitespace: returns `null` (invalid customer ID).
 */
export function getWishlistStorageKey(scope: WishlistScope): string | null {
  if (scope === undefined) {
    return null; // Unresolved identity must never select a storage key
  }
  if (scope === null) {
    return GUEST_WISHLIST_STORAGE_KEY;
  }
  if (typeof scope === 'string' && scope.trim().length > 0) {
    const bytes = new TextEncoder().encode(scope.trim());
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `sanelow_merch_wishlist_cust_${hex}`;
  }
  return null;
}

/**
 * Pluggable storage adapter interface (defaults to window.localStorage).
 */
export interface WishlistStorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

const defaultLocalStorageAdapter: WishlistStorageAdapter = {
  getItem: (key: string) => {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, value);
    } catch {
      // Browser storage quota or privacy mode restriction
    }
  },
};

/**
 * Loads wishlist items safely from browser local storage for the specified scope.
 * - If scope is `undefined`: returns `[]` immediately without touching storage.
 * - If scope is `null`: loads from `GUEST_WISHLIST_STORAGE_KEY`.
 * - If scope is a valid string: loads from customer-specific key.
 * Never merges guest items into customer accounts.
 */
export function loadWishlistForScope(
  scope: WishlistScope,
  storage: WishlistStorageAdapter = defaultLocalStorageAdapter
): Product[] {
  if (scope === undefined) {
    return []; // Identity is unresolved, do not load or expose items
  }
  const key = getWishlistStorageKey(scope);
  if (!key) return [];
  try {
    const saved = storage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists wishlist items to browser local storage for the specified scope.
 * - If scope is `undefined`: aborts and returns `false` (never persists unresolved identity).
 * - If scope is `null` or valid string: persists to the corresponding storage key.
 */
export function saveWishlistForScope(
  scope: WishlistScope,
  items: Product[],
  storage: WishlistStorageAdapter = defaultLocalStorageAdapter
): boolean {
  if (scope === undefined) {
    return false; // Never persist for unresolved identity
  }
  const key = getWishlistStorageKey(scope);
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function getWishlistNotificationMessage(
  action: 'added' | 'removed',
  productTitle: string,
  persisted: boolean = true
): string {
  if (action === 'removed') {
    return persisted
      ? 'Removed from saved merch'
      : 'Removed from saved merch (in-memory only; browser storage unavailable)';
  }
  return persisted
    ? `Saved "${productTitle}" locally on this device`
    : `Saved "${productTitle}" in-memory only (browser storage unavailable)`;
}

export type WishlistTransitionResult =
  | {
      accepted: true;
      action: 'added' | 'removed';
      product: Product;
      state: WishlistState;
      notificationMessage: string;
      persisted: boolean;
    }
  | {
      accepted: false;
      reason: 'unresolved' | 'scope_mismatch' | 'stale_generation';
      state: WishlistState;
    };

/**
 * Pure transition function that computes the next state without side-effects.
 */
export function applyWishlistToggle(
  prevState: WishlistState,
  params: {
    product: Product;
    intendedScope: WishlistScope;
    intendedGeneration: number;
  }
): WishlistTransitionResult {
  const { product, intendedScope, intendedGeneration } = params;

  // 1. Identity must be resolved: undefined cannot undergo mutations
  if (intendedScope === undefined || prevState.customerId === undefined) {
    return {
      accepted: false,
      reason: 'unresolved',
      state: prevState,
    };
  }

  // 2. Validate scope generation when applied (invalidates delayed actions / A -> B -> A)
  if (prevState.scopeGeneration !== intendedGeneration) {
    return {
      accepted: false,
      reason: 'stale_generation',
      state: prevState,
    };
  }

  // 3. Validate scope when applied
  if (prevState.customerId !== intendedScope) {
    return {
      accepted: false,
      reason: 'scope_mismatch',
      state: prevState,
    };
  }

  const exists = prevState.items.some((p) => p.id === product.id);
  const nextItems = exists
    ? prevState.items.filter((p) => p.id !== product.id)
    : [...prevState.items, product];

  const action: 'added' | 'removed' = exists ? 'removed' : 'added';
  const notificationMessage = getWishlistNotificationMessage(action, product.title);

  const nextState: WishlistState = {
    ...prevState,
    items: nextItems,
  };

  return {
    accepted: true,
    action,
    product,
    state: nextState,
    notificationMessage,
    persisted: true,
  };
}

/**
 * Pure reducer for wishlist state transitions.
 */
export type WishlistAction =
  | {
      type: 'SET_SCOPE';
      payload: {
        scope: WishlistScope;
        generation: number;
        items?: Product[];
      };
    }
  | {
      type: 'TOGGLE_ITEM';
      payload: {
        product: Product;
        intendedScope: WishlistScope;
        intendedGeneration: number;
      };
    };

export function wishlistReducer(
  state: WishlistState,
  action: WishlistAction
): WishlistState {
  switch (action.type) {
    case 'SET_SCOPE': {
      const { scope, generation, items } = action.payload;
      if (scope === undefined) {
        return {
          customerId: undefined,
          scopeGeneration: generation,
          items: [],
        };
      }
      return {
        customerId: scope,
        scopeGeneration: generation,
        items: items !== undefined ? items : loadWishlistForScope(scope),
      };
    }
    case 'TOGGLE_ITEM': {
      const result = applyWishlistToggle(state, action.payload);
      return result.state;
    }
    default:
      return state;
  }
}

/**
 * Authoritative production state coordinator.
 * - Single source of truth for wishlist state in memory.
 * - Scope/generation changes and toggles pass through this coordinator.
 * - Reads current state at execution time, never render-captured state.
 * - Applies each accepted transition once.
 * - Persists and notifies only for accepted transitions.
 * - Publishes resulting state to React subscribers without putting side-effects in updaters.
 * - Guarantees rapid toggles cannot overwrite storage with stale arrays.
 * - Synchronises generation even when customer ID stays the same.
 */
export class WishlistCoordinator {
  private state: WishlistState;
  private listeners: Set<WishlistListener> = new Set();
  private storage: WishlistStorageAdapter;
  private onNotify?: (message: string, isError?: boolean) => void;

  constructor(options?: {
    initialScope?: WishlistScope;
    storage?: WishlistStorageAdapter;
    onNotify?: (message: string, isError?: boolean) => void;
  }) {
    this.storage = options?.storage || defaultLocalStorageAdapter;
    this.onNotify = options?.onNotify;
    const initialScope = options?.initialScope;
    this.state = {
      customerId: initialScope,
      scopeGeneration: 0,
      items: initialScope !== undefined ? loadWishlistForScope(initialScope, this.storage) : [],
    };
  }

  public getState(): WishlistState {
    return this.state;
  }

  public reset(options?: {
    scope?: WishlistScope;
    storage?: WishlistStorageAdapter;
    onNotify?: (message: string, isError?: boolean) => void;
  }): void {
    if (options?.storage) {
      this.storage = options.storage;
    }
    if (options?.onNotify !== undefined) {
      this.onNotify = options.onNotify;
    }
    const targetScope = options?.scope;
    this.state = {
      customerId: targetScope,
      scopeGeneration: 0,
      items: targetScope !== undefined ? loadWishlistForScope(targetScope, this.storage) : [],
    };
    this.notifySubscribers();
  }

  public setOnNotify(handler?: (message: string, isError?: boolean) => void): void {
    this.onNotify = handler;
  }

  public subscribe = (listener: WishlistListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notifySubscribers(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // Guard against subscriber errors
      }
    }
  }

  /**
   * Updates scope and increments generation counter.
   * Synchronises generation even when customer ID remains the same.
   */
  public setScope(newScope: WishlistScope): WishlistState {
    const nextGen = this.state.scopeGeneration + 1;

    if (newScope === undefined) {
      this.state = {
        customerId: undefined,
        scopeGeneration: nextGen,
        items: [],
      };
    } else {
      const items = loadWishlistForScope(newScope, this.storage);
      this.state = {
        customerId: newScope,
        scopeGeneration: nextGen,
        items,
      };
    }

    this.notifySubscribers();
    return this.state;
  }

  /**
   * Starts session verification: advances generation, sets scope to unresolved,
   * hides items, and invalidates in-flight actions.
   */
  public startSessionVerification(): number {
    this.setScope(undefined);
    return this.state.scopeGeneration;
  }

  /**
   * Authoritative toggle executor.
   * Reads state at execution time, validates scope and generation,
   * applies transition once, persists and notifies only on acceptance,
   * and publishes to React.
   */
  public toggle(
    product: Product,
    options?: {
      intendedScope?: WishlistScope;
      intendedGeneration?: number;
      delayMs?: number;
    }
  ): Promise<WishlistTransitionResult> {
    const intendedScope =
      options?.intendedScope !== undefined ? options.intendedScope : this.state.customerId;
    const intendedGeneration =
      options?.intendedGeneration !== undefined ? options.intendedGeneration : this.state.scopeGeneration;

    const executeNow = (): WishlistTransitionResult => {
      // Read current state at execution time!
      const current = this.state;

      if (current.customerId === undefined || intendedScope === undefined) {
        if (this.onNotify) {
          this.onNotify('Session updating — please wait a moment', true);
        }
        return {
          accepted: false,
          reason: 'unresolved',
          state: current,
        };
      }

      if (intendedGeneration !== current.scopeGeneration) {
        return {
          accepted: false,
          reason: 'stale_generation',
          state: current,
        };
      }

      if (intendedScope !== current.customerId) {
        return {
          accepted: false,
          reason: 'scope_mismatch',
          state: current,
        };
      }

      // Apply transition once
      const transition = applyWishlistToggle(current, {
        product,
        intendedScope,
        intendedGeneration,
      });

      if (transition.accepted) {
        // Update authoritative in-memory state
        this.state = transition.state;

        // Persist accepted transition
        const persisted = saveWishlistForScope(this.state.customerId, this.state.items, this.storage);

        // Report in-memory only result honestly when persistence fails
        const notificationMessage = getWishlistNotificationMessage(
          transition.action,
          transition.product.title,
          persisted
        );

        const finalResult: WishlistTransitionResult = {
          ...transition,
          persisted,
          notificationMessage,
        };

        // Notify user callback
        if (this.onNotify) {
          this.onNotify(notificationMessage, !persisted);
        }

        // Publish resulting state to React subscribers
        this.notifySubscribers();

        return finalResult;
      }

      return transition;
    };

    if (options?.delayMs && options.delayMs > 0) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(executeNow());
        }, options.delayMs);
      });
    }

    return Promise.resolve(executeNow());
  }
}

/**
 * Factory function to create a new isolated WishlistCoordinator instance.
 */
export function createWishlistCoordinator(options?: {
  initialScope?: WishlistScope;
  storage?: WishlistStorageAdapter;
  onNotify?: (message: string, isError?: boolean) => void;
}): WishlistCoordinator {
  return new WishlistCoordinator(options);
}

/**
 * Canonical singleton coordinator for the application runtime.
 */
export const defaultWishlistCoordinator = new WishlistCoordinator();

/**
 * Backward-compatible wrapper delegating to defaultWishlistCoordinator.
 */
export function executeWishlistToggle(params: {
  getState?: () => WishlistState;
  setState?: (updater: (prev: WishlistState) => WishlistState) => void;
  product: Product;
  intendedScope: WishlistScope;
  intendedGeneration: number;
  delayMs?: number;
  onNotify?: (message: string, isError?: boolean) => void;
  onPersist?: (scope: WishlistScope, items: Product[]) => void;
}): Promise<WishlistTransitionResult> {
  if (params.onNotify) {
    defaultWishlistCoordinator.setOnNotify(params.onNotify);
  }
  return defaultWishlistCoordinator.toggle(params.product, {
    intendedScope: params.intendedScope,
    intendedGeneration: params.intendedGeneration,
    delayMs: params.delayMs,
  });
}
