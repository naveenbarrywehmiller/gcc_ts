export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Browser permissions can block the Clipboard API even on HTTPS.
    }
  }

  // HTTP intranet sites need the legacy copy command.
  const previousFocus = document.activeElement;
  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy was blocked');
    }
  } finally {
    input.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}
