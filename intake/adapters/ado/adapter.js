import { fetchWithRetry } from "../http.js";
import { getCredential } from "../../../runtime/credentials/index.js";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function getRequiredSecret(name, credentialKey) {
  const envValue = process.env[name];
  if (envValue) {
    return envValue;
  }
  const stored = await getCredential(process.cwd(), credentialKey);
  if (stored) {
    return stored;
  }
  throw new Error(`Missing required environment variable or stored credential: ${name}`);
}

async function makeAdoHeaders() {
  const pat = await getRequiredSecret("ADO_PAT", "ado_pat");
  const token = Buffer.from(`:${pat}`).toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json"
  };
}

function normalizeAdoItem(item) {
  const fields = item.fields || {};
  return {
    source_system: "ado",
    source_id: String(item.id),
    title: fields["System.Title"] || "",
    description: fields["System.Description"] || "",
    priority: fields["Microsoft.VSTS.Common.Priority"] || "",
    status: fields["System.State"] || "",
    assignee: fields["System.AssignedTo"]?.displayName || "",
    labels: fields["System.Tags"] ? String(fields["System.Tags"]).split(";").map((x) => x.trim()).filter(Boolean) : [],
    sprint_or_milestone: fields["System.IterationPath"] || "",
    links: [
      fields["System.TeamProject"] && item.id
        ? `https://dev.azure.com/${encodeURIComponent(fields["System.TeamProject"])}/_workitems/edit/${item.id}`
        : ""
    ].filter(Boolean),
    updated_at: fields["System.ChangedDate"] || ""
  };
}

function toAdoDateLiteral(cursor) {
  // ADO WIQL expects single-quoted date/time literals.
  return `'${cursor.replace(/'/g, "")}'`;
}

export async function runAdoSync({ cursor, limit }) {
  const org = getRequiredEnv("ADO_ORG");
  const project = getRequiredEnv("ADO_PROJECT");
  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
  const headers = await makeAdoHeaders();
  const cappedLimit = Math.max(1, Math.floor(limit));

  const changedClause = cursor ? `AND [System.ChangedDate] > ${toAdoDateLiteral(cursor)}` : "";
  const wiql = {
    query:
      "SELECT [System.Id] FROM WorkItems " +
      "WHERE [System.TeamProject] = @project " +
      changedClause +
      " ORDER BY [System.ChangedDate] ASC"
  };

  const queryUrl = `${base}/_apis/wit/wiql?api-version=7.1`;
  const wiqlResp = await fetchWithRetry(queryUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(wiql)
  }, {
    label: "ADO WIQL"
  });
  if (!wiqlResp.ok) {
    throw new Error(`ADO WIQL failed (${wiqlResp.status}): ${await wiqlResp.text()}`);
  }
  const wiqlData = await wiqlResp.json();
  const ids = (wiqlData.workItems || []).map((w) => w.id).slice(0, cappedLimit);

  if (ids.length === 0) {
    return { items: [], nextCursor: cursor };
  }

  const batchUrl = `${base}/_apis/wit/workitemsbatch?api-version=7.1`;
  const fields = [
    "System.Title",
    "System.Description",
    "System.State",
    "System.AssignedTo",
    "System.Tags",
    "System.IterationPath",
    "System.TeamProject",
    "System.ChangedDate",
    "Microsoft.VSTS.Common.Priority"
  ];
  const batchSize = 200;
  const items = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batchIds = ids.slice(i, i + batchSize);
    const batchResp = await fetchWithRetry(batchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ids: batchIds,
        fields
      })
    }, {
      label: "ADO workitems batch"
    });
    if (!batchResp.ok) {
      throw new Error(`ADO batch fetch failed (${batchResp.status}): ${await batchResp.text()}`);
    }

    const batchData = await batchResp.json();
    items.push(...(batchData.value || []).map(normalizeAdoItem));
  }

  const nextCursor =
    items.map((i) => i.updated_at).filter(Boolean).sort().at(-1) || cursor || null;

  return { items, nextCursor };
}
