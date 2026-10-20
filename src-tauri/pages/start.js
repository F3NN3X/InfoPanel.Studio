// start.html: what the server is doing before the studio can load, and the ways out of a problem.
"use strict";

let current = null;
let foreign = null;

async function render(status) {
  current = status;
  const state = status.state;
  show($("spinner"), state === "starting" || state === "restarting" || state === "running");
  show($("failed"), state === "failed");
  show($("foreign"), state === "foreign_dashboard");
  show($("in-use"), state === "port_in_use");
  show($("stopped"), state === "stopped");
  show($("running"), state === "running");
  const address = `${status.host}:${status.port}`;
  const titles = {
    starting: `Starting the dashboard server on ${address}…`,
    restarting: `Restarting the dashboard server on ${address}…`,
    running: "Opening the studio…",
    stopped: "The dashboard server is stopped",
    failed: "The dashboard server is not running",
    foreign_dashboard: "Another InfoPanel Studio server is running on this port",
    port_in_use: `Port ${status.port} is used by another program`,
  };
  $("title").textContent = titles[state] ?? state;
  $("message").textContent = status.message ?? "";
  if (state === "failed") {
    $("log").textContent = (await call("read_log_tail", { name: "server", lines: 30 })) || "(the log is empty)";
  }
  if (state === "foreign_dashboard") await describeForeign(status);
}

async function describeForeign(status) {
  const version = $("foreign-version");
  const differs = status.foreignVersion && status.foreignVersion !== status.appVersion;
  show(version, Boolean(differs));
  if (differs) version.textContent = `It reports version ${status.foreignVersion}; this app is ${status.appVersion}.`;
  foreign = await call("foreign_server_info").catch(() => null);
  $("foreign-process").textContent = foreign ? `Process: ${foreign.exe} (PID ${foreign.pid})` : "";
  // Stopping is only offered for a node.exe that answers as a dashboard server.
  show($("stop"), Boolean(foreign && foreign.stoppable));
  // Using it is only offered for a node.exe owned by the current user.
  show($("use"), Boolean(foreign && foreign.adoptable));
}

$("stop").addEventListener("click", () => {
  if (!foreign) return;
  $("confirm-text").textContent = `Stop ${foreign.exe} (PID ${foreign.pid}) and start InfoPanel Studio's own server on port ${current.port}?`;
  show($("confirm"), true);
});

$("confirm-cancel").addEventListener("click", () => show($("confirm"), false));

$("confirm-stop").addEventListener("click", async () => {
  show($("confirm"), false);
  $("stop").disabled = true;
  const result = await call("stop_foreign_server").catch((e) => ({ ok: false, message: String(e) }));
  $("stop").disabled = false;
  const box = $("stop-result");
  show(box, !result.ok);
  box.textContent = result.ok ? "" : result.message;
});

$("use").addEventListener("click", async () => {
  const result = await call("use_foreign_server").catch((e) => ({ ok: false, message: String(e) }));
  const box = $("stop-result");
  show(box, !result.ok);
  box.textContent = result.ok ? "" : result.message;
});
$("retry").addEventListener("click", () => call("restart_server"));
$("start").addEventListener("click", () => call("start_server"));
for (const b of document.querySelectorAll(".retry-port")) b.addEventListener("click", () => call("restart_server"));
for (const b of document.querySelectorAll(".open-settings")) b.addEventListener("click", () => call("open_settings"));
$("open-studio").addEventListener("click", () => call("open_studio"));

onStatus(render);
call("server_status").then(render);
