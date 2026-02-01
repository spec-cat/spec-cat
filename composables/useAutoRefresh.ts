import { useGitGraphStore } from "~/stores/gitGraph";

/**
 * Options for auto-refresh composable.
 */
interface AutoRefreshOptions {
  repositoryPath?: string;
  getScrollPosition?: () => number;
  setScrollPosition?: (pos: number) => void;
}

/**
 * Composable for Git Graph auto-refresh functionality.
 * Uses WebSocket (chokidar file watching on server) for immediate updates.
 */
export function useAutoRefresh(options: AutoRefreshOptions = {}) {
  const store = useGitGraphStore();

  const INTERACTION_DEBOUNCE = 300; // 300ms interaction debounce
  const WS_RECONNECT_DELAY = 5000; // 5 seconds
  const REFRESH_DEBOUNCE = 250; // collapse bursty watcher events

  let interactionTimeout: ReturnType<typeof setTimeout> | null = null;
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let ws: WebSocket | null = null;
  let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let currentWorkingDirectory: string | null = null;
  let refreshInFlight = false;
  let refreshQueued = false;

  // Track if user is currently interacting (FR-034)
  const isUserInteracting = ref(false);

  // Track if refresh is deferred due to interaction
  const isDeferredRefresh = ref(false);

  // Store scroll position callbacks (NFR-005)
  let scrollCallbacks = options;

  /**
   * Update scroll position callbacks (for late binding).
   */
  function setScrollCallbacks(callbacks: AutoRefreshOptions) {
    scrollCallbacks = callbacks;
  }

  /**
   * Perform refresh with scroll position preservation (NFR-005).
   */
  async function performRefresh(): Promise<boolean> {
    // Save scroll position before refresh
    const scrollPos = scrollCallbacks.getScrollPosition?.() ?? 0;

    const refreshed = await store.checkAndRefresh();

    // Restore scroll position after refresh if it happened (NFR-005)
    if (refreshed && scrollCallbacks.setScrollPosition) {
      // Use nextTick to ensure DOM has updated
      await nextTick();
      scrollCallbacks.setScrollPosition(scrollPos);
    }

    return refreshed;
  }

  /**
   * Check if refresh should be deferred (FR-065).
   * Defers when user is interacting, context menu is open, or dialog is open.
   */
  function shouldDeferRefresh(): boolean {
    return isUserInteracting.value || !!store.activeContextMenu || !!store.activeDialog;
  }

  /**
   * Handle incoming refresh trigger from WebSocket.
   * Respects user interaction and menu/dialog deferral (FR-065).
   */
  async function triggerRefresh() {
    if (shouldDeferRefresh()) {
      isDeferredRefresh.value = true;
      return;
    }
    scheduleRefresh();
  }

  async function runRefreshQueue() {
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }

    refreshInFlight = true;
    try {
      await performRefresh();
    } finally {
      refreshInFlight = false;
      if (refreshQueued) {
        refreshQueued = false;
        scheduleRefresh();
      }
    }
  }

  function scheduleRefresh() {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      refreshTimeout = null;
      runRefreshQueue();
    }, REFRESH_DEBOUNCE);
  }

  // ---- WebSocket Connection ----

  function connectWebSocket(workingDirectory: string) {
    if (typeof window === 'undefined') return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Already connected, just send watch for new directory
      ws.send(JSON.stringify({ type: 'watch', workingDirectory }));
      return;
    }

    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/git-watcher-ws`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      // Register which directory to watch
      ws!.send(JSON.stringify({ type: 'watch', workingDirectory }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'git_changed') {
          triggerRefresh();
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      ws = null;
      // Reconnect after delay (only if auto-refresh is still active)
      if (store.isPollingActive && currentWorkingDirectory) {
        wsReconnectTimer = setTimeout(() => {
          if (currentWorkingDirectory) {
            connectWebSocket(currentWorkingDirectory);
          }
        }, WS_RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      // Will trigger onclose
    };
  }

  function disconnectWebSocket() {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  /**
   * Start auto-refresh and WebSocket connection.
   */
  function startPolling(workingDirectory?: string) {
    if (workingDirectory) {
      currentWorkingDirectory = workingDirectory;
    }

    if (store.isPollingActive) return; // Already running

    store.startPolling();

    // Start WebSocket for real-time updates
    if (currentWorkingDirectory) {
      connectWebSocket(currentWorkingDirectory);
    }
  }

  /**
   * Stop auto-refresh and WebSocket.
   */
  function stopPolling() {
    disconnectWebSocket();
    store.stopPolling();
  }

  /**
   * Signal that user interaction has started (FR-034).
   * Defers refresh until interaction ends.
   */
  function startInteraction() {
    isUserInteracting.value = true;

    // Clear any existing timeout
    if (interactionTimeout) {
      clearTimeout(interactionTimeout);
      interactionTimeout = null;
    }
  }

  /**
   * Signal that user interaction has ended (FR-034).
   * Triggers deferred refresh if one was pending.
   */
  function endInteraction() {
    // Debounce end of interaction (300ms after last event)
    if (interactionTimeout) {
      clearTimeout(interactionTimeout);
    }

    interactionTimeout = setTimeout(async () => {
      isUserInteracting.value = false;

      // If a refresh was deferred, trigger it now
      if (isDeferredRefresh.value) {
        isDeferredRefresh.value = false;
        scheduleRefresh();
      }
    }, INTERACTION_DEBOUNCE);
  }

  /**
   * Cleanup on unmount.
   */
  function cleanup() {
    stopPolling();
    if (interactionTimeout) {
      clearTimeout(interactionTimeout);
      interactionTimeout = null;
    }
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
      refreshTimeout = null;
    }
    refreshInFlight = false;
    refreshQueued = false;
    currentWorkingDirectory = null;
  }

  // Watch for context menu / dialog closing to flush deferred refresh (FR-065)
  watch(
    () => [store.activeContextMenu, store.activeDialog],
    () => {
      if (!store.activeContextMenu && !store.activeDialog && isDeferredRefresh.value && !isUserInteracting.value) {
        isDeferredRefresh.value = false;
        scheduleRefresh();
      }
    },
  );

  return {
    isUserInteracting: readonly(isUserInteracting),
    isDeferredRefresh: readonly(isDeferredRefresh),
    startPolling,
    stopPolling,
    startInteraction,
    endInteraction,
    cleanup,
    setScrollCallbacks,
  };
}
