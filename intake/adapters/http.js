const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 5_000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterSeconds(value) {
  if (!value) {
    return null;
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && asNumber >= 0) {
    return Math.floor(asNumber * 1000);
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return null;
  }
  const delta = dateMs - Date.now();
  return delta > 0 ? delta : 0;
}

function computeBackoffMs(attempt, baseDelayMs, maxDelayMs, retryAfterHeader) {
  const retryAfterMs = parseRetryAfterSeconds(retryAfterHeader);
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, maxDelayMs);
  }
  const jitter = Math.floor(Math.random() * baseDelayMs);
  return Math.min(baseDelayMs * (2 ** attempt) + jitter, maxDelayMs);
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

export async function fetchWithRetry(url, init = {}, options = {}) {
  const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : DEFAULT_MAX_RETRIES;
  const baseDelayMs = Number.isInteger(options.baseDelayMs) ? options.baseDelayMs : DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = Number.isInteger(options.maxDelayMs) ? options.maxDelayMs : DEFAULT_MAX_DELAY_MS;
  const label = options.label || "request";

  let lastNetworkError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok || !isRetryableStatus(response.status) || attempt === maxRetries) {
        return response;
      }

      const retryAfter = response.headers.get("retry-after");
      const waitMs = computeBackoffMs(attempt, baseDelayMs, maxDelayMs, retryAfter);
      await sleep(waitMs);
      continue;
    } catch (error) {
      lastNetworkError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries) {
        break;
      }
      const waitMs = computeBackoffMs(attempt, baseDelayMs, maxDelayMs, null);
      await sleep(waitMs);
    }
  }

  throw new Error(`${label} failed after ${maxRetries + 1} attempts: ${lastNetworkError?.message || "unknown network error"}`);
}
