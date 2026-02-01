import { useGitGraphStore } from "~/stores/gitGraph";

interface KeyboardShortcutOptions {
  onFind: () => void;
  onRefresh: () => void;
  onScrollToHead: () => void;
  onEscape: () => void;
}

/**
 * Composable for global keyboard shortcuts (FR-077 to FR-082).
 * Platform-aware: uses Cmd on macOS, Ctrl elsewhere.
 */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions) {
  const store = useGitGraphStore();

  function handleKeydown(event: KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey;

    // Ctrl/Cmd+F: Open find widget (FR-077)
    if (mod && event.key === 'f') {
      event.preventDefault();
      options.onFind();
      return;
    }

    // Ctrl/Cmd+R: Refresh graph (FR-079)
    if (mod && event.key === 'r') {
      event.preventDefault();
      options.onRefresh();
      return;
    }

    // Ctrl/Cmd+H: Scroll to HEAD (FR-078)
    if (mod && event.key === 'h') {
      event.preventDefault();
      options.onScrollToHead();
      return;
    }

    // Escape: cascading close — dialog → menu → detail → find (FR-081)
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onEscape();
      return;
    }
  }

  function start() {
    document.addEventListener('keydown', handleKeydown);
  }

  function stop() {
    document.removeEventListener('keydown', handleKeydown);
  }

  return {
    start,
    stop,
  };
}
