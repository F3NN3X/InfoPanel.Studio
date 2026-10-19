// settings.html: server address, startup, updates, coding agents, debug mode, diagnostics and the log.
"use strict";

let saved = null;

const LOOPBACK = "127.0.0.1";
const WILDCARD = "0.0.0.0";

// ---- Server status ----

function renderStatus(s) {
  const dot = $("status-dot");
  dot.className = "dot " + (s.state === "running" ? "running" : s.state === "starting" ? "starting" : "problem");
  const where = `${s.host}:${s.port}`;
  const text = {
    starting: `Starting on ${where}…`,
    running: s.owned ? `Running on ${where}` : `Using a server the app did not start on ${where}`,
    failed: s.message ?? "Not running",
    foreign_dashboard: s.message ?? "Another dashboard server holds the port",
    port_in_use: s.message ?? "The port is in use",
  };
  $("status-text").textContent = text[s.state] ?? s.state;
  $("kiosk-url").textContent = s.kioskUrl;
  show($("debug-forced"), Boolean(s.debug && saved && !saved.debug));
}

// ---- Server and startup form ----

async function fillHosts(current) {
  const addresses = await call("list_local_addresses").catch(() => []);
  const select = $("host");
  select.replaceChildren();
  const add = (value, label) => {
    const o = el("option", label);
    o.value = value;
    select.append(o);
  };
  add(LOOPBACK, "This computer only (127.0.0.1)");
  add(WILDCARD, "All network interfaces (0.0.0.0)");
  for (const a of addresses) add(a, `${a} (a network address of this computer)`);
  if (![LOOPBACK, WILDCARD, ...addresses].includes(current)) add(current, `${current} (not found on this computer now)`);
  select.value = current;
}

function syncHostUi() {
  const loopback = $("host").value === LOOPBACK;
  show($("host-warning"), !loopback);
  show($("allowed-wrap"), !loopback);
}

function fillForm(s) {
  saved = s;
  $("host").value = s.host;
  $("port").value = s.port;
  $("allowed").value = s.allowedHosts.join(", ");
  for (const key of ["startAtLogin", "openStudioOnLaunch", "closeToTray", "checkForUpdates"]) $(key).checked = s[key];
  $("agents").checked = s.agents.enabled;
  $("debug").checked = s.debug;
  syncHostUi();
}

function clearErrors() {
  for (const id of ["host-error", "port-error", "allowed-error"]) show($(id), false);
}

function showErrors(errors) {
  const box = { host: "host-error", port: "port-error", allowedHosts: "allowed-error" };
  for (const e of errors) {
    const target = $(box[e.field] ?? "port-error");
    target.textContent = e.message;
    show(target, true);
  }
}

/** Checks the port before asking Rust (which checks it again, and whether it is free). */
function portError(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) return "Use a port from 1024 to 65535.";
  return null;
}

function formSettings() {
  return {
    ...saved,
    host: $("host").value,
    port: Number($("port").value),
    allowedHosts: $("allowed").value.split(/[,\s]+/).filter(Boolean),
    startAtLogin: $("startAtLogin").checked,
    openStudioOnLaunch: $("openStudioOnLaunch").checked,
    closeToTray: $("closeToTray").checked,
    checkForUpdates: $("checkForUpdates").checked,
  };
}

async function save(next) {
  clearErrors();
  const bad = portError(next.port);
  if (bad) {
    showErrors([{ field: "port", message: bad }]);
    return false;
  }
  $("save").disabled = true;
  $("save-result").textContent = "Saving…";
  try {
    const result = await call("save_settings", { settings: next });
    if (!result.ok) {
      showErrors(result.errors);
      $("save-result").textContent = "Not saved.";
      return false;
    }
    fillForm(result.settings);
    $("save-result").textContent = result.restarted ? "Saved. The server is restarting." : "Saved.";
    return true;
  } catch (e) {
    $("save-result").textContent = `Not saved: ${e}`;
    return false;
  } finally {
    $("save").disabled = false;
  }
}

$("host").addEventListener("change", syncHostUi);
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  save(formSettings());
});
$("restart").addEventListener("click", () => call("restart_server"));

// ---- Updates ----

function renderUpdate(info) {
  $("update-result").textContent = info ? `Version ${info.version} is available.` : "You're up to date.";
  $("update-notes").textContent = info?.notes ?? "";
  show($("update-notes"), Boolean(info?.notes));
  show($("install-update"), Boolean(info));
}

function updateBusy(text) {
  $("update-busy-text").textContent = text ?? "";
  show($("update-busy"), Boolean(text));
  $("check-update").disabled = Boolean(text);
  $("install-update").disabled = Boolean(text);
}

$("check-update").addEventListener("click", async () => {
  updateBusy("Checking…");
  $("update-result").textContent = "";
  try {
    renderUpdate(await call("check_for_update"));
  } catch (e) {
    $("update-result").textContent = `Could not check for updates: ${e}`;
    show($("install-update"), false);
  } finally {
    updateBusy(null);
  }
});

$("install-update").addEventListener("click", async () => {
  updateBusy("Downloading and installing. The app restarts when it is done…");
  try {
    await call("install_update");
  } catch (e) {
    $("update-result").textContent = `Could not install the update: ${e}`;
    updateBusy(null);
  }
});

// ---- Coding agents ----

const STATUS_TEXT = {
  installed: "hooks added",
  removed: "hooks removed",
  unchanged: "nothing to change",
  skipped: "not installed on this computer, skipped",
  error: "error",
};

function renderAgents(result) {
  const box = $("agents-result");
  box.replaceChildren();
  // Turning on runs a removal first, then the install; both are listed.
  for (const step of result.steps ?? []) {
    box.append(el("h3", step.step === "install" ? "Install" : "Remove"));
    if (!step.ok) box.append(el("p", step.error ?? "Failed.", "notice error"));
    for (const r of step.output?.results ?? []) {
      const row = el("div", undefined, "agent-result");
      const head = el("div");
      head.append(el("strong", `${r.agent}: `), el("span", STATUS_TEXT[r.status] ?? r.status, `status-${r.status}`));
      row.append(head);
      if (r.file) row.append(el("div", r.file, "muted"));
      if (r.backup) row.append(el("div", `Backup: ${r.backup}`, "muted"));
      if (r.status === "error" && r.message) row.append(el("div", r.message, "notice error"));
      box.append(row);
    }
  }
  if (result.ok && result.enabled) {
    box.append(el("p", "Codex asks you to review new hooks: run /hooks in Codex once.", "notice warn"));
  }
  show(box, true);
}

$("agents").addEventListener("change", async (e) => {
  const box = e.target;
  const enabled = box.checked;
  box.disabled = true;
  show($("agents-busy"), true);
  try {
    renderAgents(await call("set_agents", { enabled }));
  } catch (err) {
    renderAgents({ ok: false, steps: [{ step: enabled ? "install" : "remove", ok: false, error: String(err) }] });
  } finally {
    saved = await call("get_settings");
    box.checked = saved.agents.enabled;
    box.disabled = false;
    show($("agents-busy"), false);
  }
});

// ---- Debug mode and diagnostics ----

$("debug").addEventListener("change", async (e) => {
  const ok = await save({ ...saved, debug: e.target.checked });
  if (!ok) e.target.checked = !e.target.checked;
  refreshDiagnostics();
});

function fmt(n) {
  if (n === null || n === undefined) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n * 10) / 10}`;
}

function fmtGrowth(g) {
  if (!g) return "–";
  const sign = g.to >= g.from ? "+" : "";
  const pct = g.pct === null ? "" : ` (${sign}${g.pct.toFixed(0)}%)`;
  return `${sign}${fmt(g.to - g.from)}${pct} over ${Math.round(g.minutes)} min`;
}

let lastDiagnostics = null;

async function refreshDiagnostics() {
  const d = await call("get_diagnostics");
  lastDiagnostics = d;
  $("devtools").disabled = !d.debug;
  const when = d.latestTime ? new Date(d.latestTime * 1000).toLocaleTimeString() : "";
  let text;
  if (!d.debug) text = "Turn on debug mode to start sampling.";
  else if (d.samples === 0) text = `Sampling every ${d.sampleEverySecs} s; the first sample is on its way.`;
  else
    text = `${d.samples} samples, latest at ${when}. A series is flagged as growing when it rose in at least 80% of the samples over the last hour and by more than 20%.`;
  $("diag-summary").textContent = text;
  const body = $("diag-body");
  body.replaceChildren();
  for (const s of d.series) {
    const tr = el("tr");
    tr.append(el("td", s.name), el("td", fmt(s.latest)), el("td", fmtGrowth(s.growth30)), el("td", fmtGrowth(s.growth60)));
    tr.append(el("td", s.growing ? "growing" : "", s.growing ? "growing" : ""));
    body.append(tr);
  }
  show($("diag-table"), d.series.length > 0);
}

function summary(d) {
  const st = d.status;
  const lines = [
    `InfoPanel Studio ${st.appVersion}, debug ${d.debug ? "on" : "off"}`,
    `Server: ${st.state} on ${st.host}:${st.port}${st.owned ? "" : " (not started by the app)"}${st.message ? ` - ${st.message}` : ""}`,
    `Logs: ${d.logsDir}`,
    `Samples: ${d.samples}`,
  ];
  for (const s of d.series) {
    lines.push(`${s.name}: ${fmt(s.latest)} | 30m ${fmtGrowth(s.growth30)} | 60m ${fmtGrowth(s.growth60)}${s.growing ? " | GROWING" : ""}`);
  }
  return lines.join("\n");
}

$("open-logs").addEventListener("click", () => call("open_logs_folder"));
$("devtools").addEventListener("click", () =>
  call("open_devtools").catch((e) => {
    $("copy-result").textContent = String(e);
  }),
);
$("copy").addEventListener("click", async () => {
  const d = lastDiagnostics ?? (await call("get_diagnostics"));
  await navigator.clipboard.writeText(summary(d));
  $("copy-result").textContent = "Copied.";
  setTimeout(() => {
    $("copy-result").textContent = "";
  }, 2000);
});

// ---- Log tail ----

async function refreshLog() {
  const pre = $("log");
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  const text = await call("read_log_tail", { name: $("log-name").value, lines: 200 });
  pre.textContent = text || "(the log is empty)";
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

$("log-name").addEventListener("change", refreshLog);
$("log-refresh").addEventListener("click", refreshLog);

// ---- Start ----

async function init() {
  const s = await call("get_settings");
  await fillHosts(s.host);
  fillForm(s);
  const status = await call("server_status");
  renderStatus(status);
  onStatus(renderStatus);
  $("app-version").textContent = status.appVersion;
  const pending = await call("pending_update");
  if (pending) renderUpdate(pending);
  refreshDiagnostics();
  refreshLog();
  setInterval(() => {
    if (document.visibilityState === "visible") refreshLog();
  }, 5000);
  setInterval(refreshDiagnostics, 30000);
}

init();
