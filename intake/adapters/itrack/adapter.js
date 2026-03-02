import { fetchWithRetry } from "../http.js";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function withCursor(url, cursor) {
  if (!cursor) {
    return url;
  }
  const next = new URL(url);
  next.searchParams.set("updatedSince", cursor);
  return next.toString();
}

function buildPageUrl(baseRequestUrl, pageState, pageSize) {
  const url = new URL(baseRequestUrl);
  url.searchParams.set("limit", String(pageSize));

  if (typeof pageState.nextUrl === "string" && pageState.nextUrl) {
    return pageState.nextUrl;
  }
  if (typeof pageState.nextCursor === "string" && pageState.nextCursor) {
    url.searchParams.set("cursor", pageState.nextCursor);
  } else if (Number.isInteger(pageState.nextOffset) && pageState.nextOffset > 0) {
    url.searchParams.set("offset", String(pageState.nextOffset));
  }
  return url.toString();
}

function resolveNextPage(data, rawItems, currentState) {
  const nextUrl =
    (typeof data?.next === "string" && data.next) ||
    (typeof data?.nextUrl === "string" && data.nextUrl) ||
    (typeof data?.links?.next === "string" && data.links.next) ||
    null;

  const nextCursor =
    (typeof data?.nextCursor === "string" && data.nextCursor) ||
    (typeof data?.next_cursor === "string" && data.next_cursor) ||
    (typeof data?.pagination?.nextCursor === "string" && data.pagination.nextCursor) ||
    null;

  const nextOffset = Number.isInteger(data?.nextOffset)
    ? data.nextOffset
    : Number.isInteger(data?.pagination?.nextOffset)
      ? data.pagination.nextOffset
      : Number.isInteger(currentState.nextOffset)
        ? currentState.nextOffset + rawItems.length
        : rawItems.length;

  const hasMore = Boolean(data?.hasMore ?? data?.pagination?.hasMore ?? nextUrl ?? nextCursor);
  return { nextUrl, nextCursor, nextOffset, hasMore };
}

function normalizeItrackItem(item, baseUrl) {
  const sourceId = String(
    item.issueId ?? item.id ?? item.key ?? item.ticketId ?? ""
  );
  const updatedAt = item.updatedAt ?? item.updated_at ?? item.lastUpdated ?? item.modifiedAt ?? "";
  return {
    source_system: "itrack",
    source_id: sourceId,
    title: item.summary ?? item.title ?? "",
    description: item.description ?? "",
    priority: item.priority?.name ?? item.priority ?? "",
    status: item.state?.name ?? item.status ?? item.state ?? "",
    assignee: item.owner?.displayName ?? item.assignee?.displayName ?? item.owner ?? item.assignee ?? "",
    labels: Array.isArray(item.labels)
      ? item.labels.map((x) => (typeof x === "string" ? x : x.name || "")).filter(Boolean)
      : [],
    sprint_or_milestone:
      item.sprint?.name ?? item.milestone?.name ?? item.milestone ?? "",
    links: sourceId ? [`${baseUrl.replace(/\/$/, "")}/issues/${encodeURIComponent(sourceId)}`] : [],
    updated_at: updatedAt
  };
}

export async function runItrackSync({ cursor, limit }) {
  const baseUrl = getRequiredEnv("ITRACK_BASE_URL");
  const token = getRequiredEnv("ITRACK_TOKEN");
  const endpoint = process.env.ITRACK_ISSUES_ENDPOINT || "/api/issues";
  const cappedLimit = Math.max(1, Math.floor(limit));
  const pageSize = Math.min(cappedLimit, 100);

  const listUrl = new URL(endpoint, baseUrl);
  const baseRequestUrl = withCursor(listUrl.toString(), cursor);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
  const items = [];
  const seenIds = new Set();
  let pageState = { nextUrl: null, nextCursor: null, nextOffset: 0 };
  let hasMore = true;

  while (items.length < cappedLimit && hasMore) {
    const remaining = cappedLimit - items.length;
    const requestUrl = buildPageUrl(baseRequestUrl, pageState, Math.min(pageSize, remaining));
    const response = await fetchWithRetry(requestUrl, {
      method: "GET",
      headers
    }, {
      label: "iTrack list fetch"
    });
    if (!response.ok) {
      throw new Error(`iTrack list fetch failed (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    const rawItems = Array.isArray(data)
      ? data
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.issues)
          ? data.issues
          : [];

    for (const rawItem of rawItems) {
      if (items.length >= cappedLimit) {
        break;
      }
      const normalized = normalizeItrackItem(rawItem, baseUrl);
      const uniqueKey = normalized.source_id || `${normalized.title}:${normalized.updated_at}`;
      if (seenIds.has(uniqueKey)) {
        continue;
      }
      seenIds.add(uniqueKey);
      items.push(normalized);
    }

    const next = resolveNextPage(data, rawItems, pageState);
    pageState = {
      nextUrl: next.nextUrl,
      nextCursor: next.nextCursor,
      nextOffset: next.nextOffset
    };
    hasMore = next.hasMore || rawItems.length === pageSize;
    if (rawItems.length === 0) {
      hasMore = false;
    }
  }

  const nextCursor =
    items.map((i) => i.updated_at).filter(Boolean).sort().at(-1) || cursor || null;

  return { items, nextCursor };
}
