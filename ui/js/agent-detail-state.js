const CANCELLED = Symbol('agent-detail-cancelled');

export const AGENT_DETAIL_REQUEST_TIMEOUT_MS = 15000;

export function createAgentDetailState() {
  return {
    detail: null,
    detailId: null,
    detailLoading: false,
    detailError: null,
  };
}

function boundedRequest(factory, {
  timeoutMs,
  scheduleTimeout,
  cancelTimeout,
}) {
  const abortController = typeof AbortController === 'function'
    ? new AbortController()
    : null;
  let timer = null;
  let settled = false;
  let resolveOuter;
  let rejectOuter;

  const promise = new Promise((resolve, reject) => {
    resolveOuter = resolve;
    rejectOuter = reject;
  });

  function finish(resolve, value) {
    if (settled) return;
    settled = true;
    if (timer !== null) cancelTimeout(timer);
    timer = null;
    (resolve ? resolveOuter : rejectOuter)(value);
  }

  // Invoke immediately so issuing a request starts its transport before a
  // later open can supersede it. Synchronous throws join the same bounded
  // rejection path as asynchronous transport failures.
  let source;
  try {
    source = factory(abortController?.signal);
  } catch (error) {
    finish(false, error);
  }
  if (!settled) {
    Promise.resolve(source).then(
      (value) => finish(true, value),
      (error) => finish(false, error),
    );
  }

  if (!settled && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = scheduleTimeout(() => {
      const seconds = Math.max(1, Math.round(timeoutMs / 1000));
      finish(false, new Error(`Agent detail request timed out after ${seconds}s`));
      abortController?.abort();
    }, timeoutMs);
  }

  return {
    promise,
    cancel() {
      // Resolve the controller's waiter when a close or newer open orphans the
      // request. The underlying fetch may still finish, but its handlers are
      // already attached and it has no route back into modal state.
      finish(true, CANCELLED);
      abortController?.abort();
    },
  };
}

/**
 * Owns the agent-detail modal's asynchronous state contract.
 *
 * Opens may supersede older opens. Periodic refreshes are deliberately
 * single-flight: a tick while the current agent is loading coalesces onto that
 * request instead of creating a newer request that would starve slow results.
 * Every request has a deadline, so a hung transport eventually releases the
 * flight and lets a later tick retry.
 */
export function createAgentDetailController({
  state,
  requestDetail,
  timeoutMs = AGENT_DETAIL_REQUEST_TIMEOUT_MS,
  scheduleTimeout = globalThis.setTimeout.bind(globalThis),
  cancelTimeout = globalThis.clearTimeout.bind(globalThis),
}) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('agent detail state is required');
  }
  if (typeof requestDetail !== 'function') {
    throw new TypeError('requestDetail must be a function');
  }

  let activeRequest = null;

  function orphanActiveRequest() {
    const request = activeRequest;
    activeRequest = null;
    request?.cancel();
  }

  function issue(agentId, { initial, coalesce }) {
    if (!agentId) return Promise.resolve();

    if (
      coalesce
      && activeRequest
      && activeRequest.agentId === agentId
      && state.detailId === agentId
    ) {
      return activeRequest.promise;
    }

    orphanActiveRequest();

    const token = { agentId, cancel: null, promise: null };
    activeRequest = token;

    if (initial) {
      state.detail = null;
      state.detailError = null;
      state.detailLoading = true;
    } else if (state.detail === null && state.detailError === null) {
      // Defensive preservation of the modal coherence invariant: if a caller
      // asks for a refresh before anything is renderable, keep a skeleton up.
      state.detailLoading = true;
    }

    const bounded = boundedRequest(
      (signal) => requestDetail(agentId, { signal }),
      { timeoutMs, scheduleTimeout, cancelTimeout },
    );
    token.cancel = bounded.cancel;

    token.promise = (async () => {
      let data = null;
      let failure = null;
      try {
        data = await bounded.promise;
      } catch (error) {
        failure = error;
      }

      if (data === CANCELLED) return;
      if (activeRequest !== token || state.detailId !== agentId) return;

      activeRequest = null;
      if (!failure && (data === null || typeof data !== 'object')) {
        // The shared API client intentionally returns null for an empty or
        // malformed successful response. That is not renderable detail and
        // must follow the failure path rather than violating modal coherence.
        failure = new Error('Agent detail response was empty or invalid');
      }

      if (failure) {
        // A refresh failure keeps the last good record. With no record to
        // render, it must surface the failure rather than leave a blank modal.
        if (state.detail === null) {
          state.detailError = failure?.message || 'Failed to load agent detail';
        }
      } else {
        // Success is one atomic commit: live data can never retain an obsolete
        // error that would hide it in the modal template.
        state.detail = data;
        state.detailError = null;
      }
      state.detailLoading = false;
    })();

    return token.promise;
  }

  function open(agentId) {
    state.detailId = agentId;
    return issue(agentId, { initial: true, coalesce: false });
  }

  function refresh() {
    const agentId = state.detailId;
    if (!agentId) return Promise.resolve();
    return issue(agentId, { initial: false, coalesce: true });
  }

  function close() {
    orphanActiveRequest();
    state.detailId = null;
    state.detail = null;
    state.detailError = null;
    state.detailLoading = false;
  }

  return {
    open,
    refresh,
    close,
    hasInFlight: () => activeRequest !== null,
  };
}

/**
 * Production polling primitive for the Agents page. Extracting the timer
 * means CI can drive the same callback that the browser interval runs.
 */
export function createAgentAutoRefresh({
  isEnabled,
  refreshList,
  hasOpenDetail,
  refreshDetail,
  intervalMs = 5000,
  scheduleInterval = globalThis.setInterval.bind(globalThis),
  cancelInterval = globalThis.clearInterval.bind(globalThis),
}) {
  let interval = null;

  function tick() {
    if (!isEnabled()) return;
    refreshList();
    if (hasOpenDetail()) refreshDetail();
  }

  function stop() {
    if (interval !== null) {
      cancelInterval(interval);
      interval = null;
    }
  }

  function start() {
    stop();
    if (isEnabled()) interval = scheduleInterval(tick, intervalMs);
  }

  function sync() {
    if (isEnabled()) start();
    else stop();
  }

  return {
    start,
    stop,
    sync,
    isRunning: () => interval !== null,
  };
}
