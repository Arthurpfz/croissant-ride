// The ride clock's heartbeat. A worker's timers keep their pace when the tab is hidden; the page's own get slowed.
setInterval(() => postMessage(0), 250);
