// jira.js — Jira Cloud integration for Report Mode (main process only).
//
// Auth model: the user's own Atlassian API token (email + token, Basic auth) —
// see the Integrations tab in Settings. Unlike the Polar token (an app-level
// secret that belongs on the license proxy), this is a per-user credential, so
// the right custody is the user's own machine: the token is encrypted at rest
// with Electron safeStorage (DPAPI on Windows / Keychain on macOS), decrypted
// only inside this module at request time, and never included in IPC payloads,
// logs, or error messages. The renderer only ever sees status objects and
// normalized results.
//
// This module is require()d lazily from the first jira:* IPC call — nothing
// here loads or runs on the startup path, and no network happens outside an
// explicit user action (Connect in Settings, or using Send to Jira).
//
// Both Atlassian API-token flavors are supported transparently:
//   - classic (unscoped) tokens authenticate against the site URL directly
//   - scoped tokens only work via the api.atlassian.com/ex/jira/{cloudId}
//     gateway
// connect() tries the site URL first and falls back to the gateway (resolving
// the cloudId from the public /_edge/tenant_info endpoint), then remembers
// which base worked.

const { safeStorage, shell } = require('electron');
const getStore = require('./store');

const REQUEST_TIMEOUT_MS = 20000;

// ─── Credential storage ─────────────────────────────────────────────────────────

function encryptToken(token) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(token).toString('base64');
}

function decryptToken(tokenEnc) {
  try { return safeStorage.decryptString(Buffer.from(tokenEnc, 'base64')); }
  catch { return null; }
}

function getRecord() {
  const rec = getStore().get('jira');
  return rec && rec.tokenEnc && rec.email && rec.siteUrl ? rec : null;
}

// Safe-for-renderer status: no token material, ever.
function getStatus() {
  const rec = getRecord();
  if (!rec) return { connected: false };
  return {
    connected: true,
    email: rec.email,
    siteUrl: rec.siteUrl,
    displayName: rec.displayName || rec.email,
    accountId: rec.accountId || null,
    lastProjectId: rec.lastProjectId || null,
    lastIssueTypeId: rec.lastIssueTypeId || null,
  };
}

function disconnect() {
  getStore().delete('jira');
  return { ok: true };
}

// Open the Atlassian API-token management page (Connect helper link).
function openTokenPage() {
  shell.openExternal('https://id.atlassian.com/manage-profile/security/api-tokens');
}

// Open a created issue in the browser. Only URLs under the connected site's
// /browse/ path are allowed — the renderer can't use this to open arbitrary URLs.
function openIssueUrl(url) {
  const rec = getRecord();
  if (!rec || typeof url !== 'string') return;
  if (url.startsWith(rec.siteUrl + '/browse/')) shell.openExternal(url);
}

// ─── HTTP plumbing ──────────────────────────────────────────────────────────────

// "acme" → https://acme.atlassian.net; "acme.atlassian.net" → https://….
// http:// is allowed only for loopback hosts (integration tests).
function normalizeSiteUrl(input) {
  let s = String(input || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let url;
  try { url = new URL(s); } catch { return null; }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'http:' && !loopback) url.protocol = 'https:';
  if (!url.hostname.includes('.') && !loopback) url.hostname += '.atlassian.net';
  return url.origin;
}

function basicAuth(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// Normalize any failure into { ok:false, code, message } with a message that is
// safe and specific enough to show the user directly. `doing` is the human verb
// phrase for context ("create the issue", "load your projects", …).
function httpError(status, data, doing) {
  if (status === 401) return {
    ok: false, code: 'auth',
    message: 'Jira rejected the credentials — your API token may have expired or been revoked. Reconnect in Settings → Integrations.',
  };
  if (status === 403) return {
    ok: false, code: 'forbidden',
    message: `Your Jira account doesn't have permission to ${doing}.`,
  };
  if (status === 404) return {
    ok: false, code: 'notfound',
    message: `Jira couldn't find what was needed to ${doing} — it may have been deleted or you may have lost access.`,
  };
  if (status === 429) return {
    ok: false, code: 'rate',
    message: 'Jira is rate-limiting requests from this account — wait a minute and try again.',
  };
  if (status === 400 && data) {
    const parts = []
      .concat(Array.isArray(data.errorMessages) ? data.errorMessages : [])
      .concat(data.errors && typeof data.errors === 'object'
        ? Object.entries(data.errors).map(([f, m]) => `${f}: ${m}`) : []);
    return {
      ok: false, code: 'bad-request',
      message: parts.length ? `Jira rejected the request: ${parts.join(' · ')}` : `Jira rejected the request to ${doing}.`,
    };
  }
  return {
    ok: false, code: 'server',
    message: `Jira had a problem (HTTP ${status}) trying to ${doing}. Try again shortly.`,
  };
}

const networkError = () => ({
  ok: false, code: 'network',
  message: "Can't reach Jira — check your internet connection.",
});

// One authenticated JSON request against `base`. Returns { ok:true, data } or a
// normalized error object. Never throws; never logs the Authorization header.
async function request(base, auth, pathname, { method = 'GET', body, headers = {}, doing = 'talk to Jira' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(base + pathname, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return networkError();
  }
  clearTimeout(timer);
  let data = null;
  try { data = await res.json(); } catch { /* 204s and HTML error pages */ }
  if (!res.ok) return httpError(res.status, data, doing);
  return { ok: true, data };
}

// Authenticated request using the stored connection. Fails cleanly (as an
// 'auth' error) if the connection is missing or the token can't be decrypted.
async function api(pathname, opts) {
  const rec = getRecord();
  if (!rec) return { ok: false, code: 'auth', message: 'No Jira account is connected. Connect one in Settings → Integrations.' };
  const token = decryptToken(rec.tokenEnc);
  if (!token) return { ok: false, code: 'auth', message: 'Stored Jira credentials could not be read. Reconnect in Settings → Integrations.' };
  return request(rec.apiBase, basicAuth(rec.email, token), pathname, opts);
}

// ─── Connect / validate ─────────────────────────────────────────────────────────

// Resolve the site's cloudId from the public tenant-info endpoint (no auth).
async function resolveCloudId(siteUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(siteUrl + '/_edge/tenant_info', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.cloudId ? data.cloudId : null;
  } catch { return null; }
}

// Validate site+email+token and store the connection (token encrypted).
async function connect({ site, email, token }) {
  const siteUrl = normalizeSiteUrl(site);
  const mail = String(email || '').trim();
  const tok = String(token || '').trim();
  if (!siteUrl) return { ok: false, code: 'input', message: 'Enter your Jira site, e.g. your-team.atlassian.net.' };
  if (!mail.includes('@')) return { ok: false, code: 'input', message: 'Enter the email address of your Atlassian account.' };
  if (!tok) return { ok: false, code: 'input', message: 'Paste an API token (use the "Create an API token" link above).' };
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, code: 'storage', message: "This system can't encrypt stored credentials (OS keychain unavailable), so the token wasn't saved." };
  }

  const auth = basicAuth(mail, tok);
  const doing = 'verify the connection';

  // Classic tokens work straight against the site; scoped tokens 401/403 there
  // and need the api.atlassian.com gateway instead.
  let apiBase = siteUrl;
  let me = await request(siteUrl, auth, '/rest/api/3/myself', { doing });
  if (!me.ok && me.code !== 'network') {
    const cloudId = await resolveCloudId(siteUrl);
    if (cloudId) {
      const gateway = 'https://api.atlassian.com/ex/jira/' + cloudId;
      const retry = await request(gateway, auth, '/rest/api/3/myself', { doing });
      if (retry.ok) { me = retry; apiBase = gateway; }
    }
  }
  if (!me.ok) {
    // A 401 here is bad credentials, not an expired session — reword for the connect form.
    if (me.code === 'auth') return { ok: false, code: 'auth', message: 'Jira rejected these credentials. Check the site, email, and token (tokens also expire — you may need a new one).' };
    return me;
  }

  getStore().set('jira', {
    siteUrl,
    apiBase,
    email: mail,
    tokenEnc: encryptToken(tok),
    displayName: (me.data && me.data.displayName) || mail,
    accountId: (me.data && me.data.accountId) || null,
    connectedAt: Date.now(),
  });
  return { ok: true, status: getStatus() };
}

// ─── Reads for the issue form ───────────────────────────────────────────────────

async function getProjects() {
  const r = await api('/rest/api/3/project/search?maxResults=100&orderBy=name', { doing: 'load your projects' });
  if (!r.ok) return r;
  const values = (r.data && r.data.values) || [];
  return {
    ok: true,
    projects: values.map((p) => ({ id: p.id, key: p.key, name: p.name })),
  };
}

// Issue types the user can create in a project (sub-tasks excluded — they need
// a parent issue, which doesn't fit the "new report" flow).
async function getIssueTypes(projectId) {
  const r = await api(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectId)}/issuetypes?maxResults=50`, { doing: 'load issue types for this project' });
  if (!r.ok) return r;
  const values = (r.data && (r.data.issueTypes || r.data.values)) || [];
  return {
    ok: true,
    issueTypes: values.filter((t) => !t.subtask).map((t) => ({ id: t.id, name: t.name })),
  };
}

// Fields on the create screen for (project, issue type): which of our optional
// fields apply (with their allowed values), plus any required field we can't
// fill — surfaced as an early warning instead of a failed create.
const OUR_FIELDS = new Set(['project', 'issuetype', 'summary', 'description', 'priority', 'labels', 'components', 'assignee', 'attachment', 'reporter']);

async function getFieldMeta(projectId, issueTypeId) {
  const r = await api(
    `/rest/api/3/issue/createmeta/${encodeURIComponent(projectId)}/issuetypes/${encodeURIComponent(issueTypeId)}?maxResults=200`,
    { doing: 'load the fields for this issue type' }
  );
  if (!r.ok) return r;
  const fields = (r.data && (r.data.fields || r.data.values)) || [];
  const byId = new Map(fields.map((f) => [f.fieldId || f.key, f]));
  const allowed = (id) => ((byId.get(id) || {}).allowedValues) || [];
  return {
    ok: true,
    hasPriority: byId.has('priority'),
    priorities: allowed('priority').map((p) => ({ id: p.id, name: p.name })),
    hasLabels: byId.has('labels'),
    hasAssignee: byId.has('assignee'),
    hasReporter: byId.has('reporter'),
    components: allowed('components').map((c) => ({ id: c.id, name: c.name })),
    // Required fields Lumshot doesn't collect and Jira won't default — the
    // create would 400, so the form warns up front.
    missingRequired: fields
      .filter((f) => f.required && !f.hasDefaultValue && !OUR_FIELDS.has(f.fieldId || f.key))
      .map((f) => f.name),
  };
}

// Assignable users for the project (for the optional Assignee picker).
async function getAssignableUsers(projectKey) {
  const r = await api(`/rest/api/3/user/assignable/search?project=${encodeURIComponent(projectKey)}&maxResults=50`, { doing: 'load assignable users' });
  if (!r.ok) return r;
  const users = Array.isArray(r.data) ? r.data : [];
  return { ok: true, users: users.map((u) => ({ accountId: u.accountId, displayName: u.displayName })) };
}

// ─── Create ─────────────────────────────────────────────────────────────────────

// Plain text → Atlassian Document Format. Blank-line-separated chunks become
// paragraphs; single newlines inside a chunk become hard breaks.
function textToADF(text) {
  const content = [];
  const chunks = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const chunk of chunks) {
    const para = [];
    chunk.split('\n').forEach((line, i) => {
      if (i) para.push({ type: 'hardBreak' });
      if (line) para.push({ type: 'text', text: line });
    });
    if (para.length) content.push({ type: 'paragraph', content: para });
  }
  return content.length ? { type: 'doc', version: 1, content } : null;
}

// Jira labels may not contain spaces.
const cleanLabel = (l) => l.trim().replace(/\s+/g, '-');

// Create the issue, then attach the screenshot. Attachment failure is a partial
// success — the issue exists and is reported with its link either way.
async function createIssue(payload) {
  const rec = getRecord();
  if (!rec) return { ok: false, code: 'auth', message: 'No Jira account is connected. Connect one in Settings → Integrations.' };

  const summary = String(payload.summary || '').trim();
  if (!summary) return { ok: false, code: 'input', message: 'Enter a summary for the issue.' };
  if (!payload.projectId || !payload.issueTypeId) {
    return { ok: false, code: 'input', message: 'Pick a project and an issue type first.' };
  }

  const fields = {
    project: { id: String(payload.projectId) },
    issuetype: { id: String(payload.issueTypeId) },
    summary,
  };
  const adf = textToADF(payload.description);
  if (adf) fields.description = adf;
  if (payload.priorityId) fields.priority = { id: String(payload.priorityId) };
  if (payload.assigneeAccountId) fields.assignee = { id: String(payload.assigneeAccountId) };
  // Only sent when the user picked someone other than themselves — Jira
  // defaults the reporter to the authenticated account, and setting it
  // explicitly needs the "Modify reporter" permission.
  if (payload.reporterAccountId) fields.reporter = { id: String(payload.reporterAccountId) };
  if (Array.isArray(payload.labels) && payload.labels.length) {
    fields.labels = payload.labels.map(cleanLabel).filter(Boolean);
  }
  if (Array.isArray(payload.componentIds) && payload.componentIds.length) {
    fields.components = payload.componentIds.map((id) => ({ id: String(id) }));
  }

  const created = await request(rec.apiBase, basicAuth(rec.email, decryptToken(rec.tokenEnc) || ''), '/rest/api/3/issue', {
    method: 'POST',
    body: { fields },
    doing: 'create the issue in this project',
  });
  if (!created.ok) return created;

  const key = created.data && created.data.key;
  const url = `${rec.siteUrl}/browse/${key}`;

  // Remember the project/type for next time (prefills the form).
  getStore().set('jira', { ...rec, lastProjectId: String(payload.projectId), lastIssueTypeId: String(payload.issueTypeId) });

  // Attach the screenshot. `attachments` requires multipart + XSRF opt-out.
  let attached = false;
  let attachError = null;
  if (payload.imageDataUrl && key) {
    const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(payload.imageDataUrl);
    if (m) {
      const form = new FormData();
      form.append('file', new Blob([Buffer.from(m[2], 'base64')], { type: `image/${m[1]}` }),
        `lumshot-${key}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
      const att = await api(`/rest/api/3/issue/${encodeURIComponent(key)}/attachments`, {
        method: 'POST',
        body: form,
        headers: { 'X-Atlassian-Token': 'no-check' },
        doing: 'attach the screenshot',
      });
      if (att.ok) attached = true;
      else attachError = att.message;
    }
  }

  return { ok: true, key, url, attached, attachError };
}

module.exports = {
  getStatus,
  connect,
  disconnect,
  openTokenPage,
  openIssueUrl,
  getProjects,
  getIssueTypes,
  getFieldMeta,
  getAssignableUsers,
  createIssue,
};
