export interface RestrictionHandle {
  release: () => void;
}

interface InertEntry {
  owners: Set<symbol>;
  hadAttributeBefore: boolean;
  wasPropertyTrueBefore: boolean;
}

interface AriaHiddenEntry {
  owners: Set<symbol>;
  previousValue: string | null;
}

interface ScrollLockEntry {
  owners: Set<symbol>;
  previousOverflow: string;
}

const inertEntries = new WeakMap<HTMLElement, InertEntry>();
const ariaHiddenEntries = new WeakMap<HTMLElement, AriaHiddenEntry>();
const scrollLockEntries = new WeakMap<HTMLElement, ScrollLockEntry>();

function isOrContainsModalDialog(el: HTMLElement): boolean {
  if (
    el.getAttribute?.('role') === 'dialog' &&
    el.getAttribute?.('aria-modal') === 'true'
  ) {
    return true;
  }
  if (typeof el.querySelectorAll === 'function') {
    return el.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 0;
  }
  return false;
}

export function acquireInertRestriction(
  el: HTMLElement,
  owner: symbol = Symbol('inert-owner')
): RestrictionHandle {
  let entry = inertEntries.get(el);
  if (!entry) {
    const hadAttributeBefore = Boolean(el.hasAttribute?.('inert'));
    const wasPropertyTrueBefore = (el as unknown as { inert?: boolean }).inert === true;
    entry = {
      owners: new Set(),
      hadAttributeBefore,
      wasPropertyTrueBefore,
    };
    inertEntries.set(el, entry);
  }

  entry.owners.add(owner);
  if (!el.hasAttribute?.('inert')) {
    el.setAttribute?.('inert', '');
  }
  try {
    if ((el as unknown as { inert?: boolean }).inert !== true) {
      (el as unknown as { inert?: boolean }).inert = true;
    }
  } catch {
    // Ignore read-only inert environments
  }

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;

      const current = inertEntries.get(el);
      if (!current) return;
      current.owners.delete(owner);
      if (current.owners.size > 0) return;

      inertEntries.delete(el);
      if (!current.hadAttributeBefore && !current.wasPropertyTrueBefore) {
        el.removeAttribute?.('inert');
        try {
          (el as unknown as { inert?: boolean }).inert = false;
        } catch {
          // Ignore read-only inert environments
        }
      }
    },
  };
}

export function acquireAriaHiddenRestriction(
  el: HTMLElement,
  owner: symbol = Symbol('aria-hidden-owner')
): RestrictionHandle {
  let entry = ariaHiddenEntries.get(el);
  if (!entry) {
    const previousValue = el.getAttribute?.('aria-hidden') ?? null;
    entry = {
      owners: new Set(),
      previousValue,
    };
    ariaHiddenEntries.set(el, entry);
  }

  entry.owners.add(owner);
  if (el.getAttribute?.('aria-hidden') !== 'true') {
    el.setAttribute?.('aria-hidden', 'true');
  }

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;

      const current = ariaHiddenEntries.get(el);
      if (!current) return;
      current.owners.delete(owner);
      if (current.owners.size > 0) return;

      ariaHiddenEntries.delete(el);
      if (current.previousValue === null) {
        if (el.getAttribute?.('aria-hidden') === 'true') {
          el.removeAttribute?.('aria-hidden');
        }
      } else {
        el.setAttribute?.('aria-hidden', current.previousValue);
      }
    },
  };
}

export function acquireBodyScrollLock(
  bodyEl: HTMLElement | null | undefined =
    typeof document !== 'undefined' ? document.body : null,
  owner: symbol = Symbol('scroll-lock-owner')
): RestrictionHandle {
  if (!bodyEl || !bodyEl.style) {
    return { release: () => {} };
  }

  let entry = scrollLockEntries.get(bodyEl);
  if (!entry) {
    entry = {
      owners: new Set(),
      previousOverflow: bodyEl.style.overflow,
    };
    scrollLockEntries.set(bodyEl, entry);
  }

  entry.owners.add(owner);
  if (bodyEl.style.overflow !== 'hidden') {
    bodyEl.style.overflow = 'hidden';
  }

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;

      const current = scrollLockEntries.get(bodyEl);
      if (!current) return;
      current.owners.delete(owner);
      if (current.owners.size > 0) return;

      scrollLockEntries.delete(bodyEl);
      if (bodyEl.style.overflow === 'hidden') {
        bodyEl.style.overflow = current.previousOverflow;
      }
    },
  };
}

export interface OverlayRestrictionsOptions {
  overlayEl: HTMLElement;
  doc?: Document | null;
  lockScroll?: boolean;
  ownerLabel?: string;
}

export function acquireOverlayRestrictions({
  overlayEl,
  doc = typeof document !== 'undefined' ? document : null,
  lockScroll = true,
  ownerLabel = 'overlay',
}: OverlayRestrictionsOptions): RestrictionHandle {
  const owner = Symbol(ownerLabel);
  const handles: RestrictionHandle[] = [];

  if (doc?.body) {
    let cur: HTMLElement | null = overlayEl;
    while (cur && cur !== doc.body) {
      const parent = cur.parentElement;
      if (!parent) break;
      const siblings = parent.children ? Array.from(parent.children) : [];
      for (const sibling of siblings) {
        if (sibling === cur || sibling.nodeType !== 1) continue;
        const el = sibling as HTMLElement;
        const tag = el.tagName?.toUpperCase();
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') continue;
        if (isOrContainsModalDialog(el)) continue;

        handles.push(acquireInertRestriction(el, owner));
        handles.push(acquireAriaHiddenRestriction(el, owner));
      }
      cur = parent;
    }

    if (lockScroll) {
      handles.push(acquireBodyScrollLock(doc.body, owner));
    }
  }

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      for (const handle of handles) {
        handle.release();
      }
    },
  };
}
