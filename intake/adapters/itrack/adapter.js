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

  const listUrl = new URL(endpoint, baseUrl);
  listUrl.searchParams.set("limit", String(limit));
  const requestUrl = withCursor(listUrl.toString(), cursor);

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
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

  const items = rawItems.map((item) => normalizeItrackItem(item, baseUrl));
  const nextCursor =
    items.map((i) => i.updated_at).filter(Boolean).sort().at(-1) || cursor || null;

  return { items, nextCursor };
}
