function fallbackCopyText(text: string) {
  if (typeof document === "undefined" || !document.body) {
    throw new Error("Clipboard is unavailable in this environment");
  }

  const textarea = document.createElement("textarea");
  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = typeof document.execCommand === "function" && document.execCommand("copy");
    if (!copied) {
      throw new Error("Failed to copy to clipboard");
    }
  } finally {
    document.body.removeChild(textarea);
    activeElement?.focus();
  }
}

export async function writeTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      fallbackCopyText(text);
      return;
    }
  }

  fallbackCopyText(text);
}
