/**
 * Copy text to the clipboard and report whether it really worked.
 * Tries the async Clipboard API first, then the legacy execCommand('copy') path.
 * Returns true only when one of them succeeds, false when both fail.
 */
export async function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand.
  }
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const active = document.activeElement;
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.setAttribute('aria-hidden', 'true');
  helper.style.position = 'fixed';
  helper.style.top = '0';
  helper.style.left = '0';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  let ok = false;
  try {
    helper.select();
    ok = document.execCommand('copy') === true;
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(helper);
    if (active && typeof active.focus === 'function') active.focus();
  }
  return ok;
}

/**
 * Select the visible text of an element so the user can copy it by hand.
 * Form fields use their own selection; other elements get a document range.
 */
export function selectVisibleText(el) {
  if (!el) return;
  if (typeof el.select === 'function') {
    el.focus?.();
    el.select();
    return;
  }
  const selection = window.getSelection?.();
  if (!selection || typeof document.createRange !== 'function') return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}
