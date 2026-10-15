import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Kernel sandbox permits only this proxy and explicitly declared local CDP port.
const [hostsJson, localPort, command, ...args] = process.argv.slice(2);
const hosts = new Set(JSON.parse(hostsJson));
if (!hosts.size || !command || process.platform !== 'darwin') throw new Error('Network isolation unavailable');
let child;
let blocked = false;
let logLimited = false;
let capturedBytes = 0;
const discardMaintenance = process.env.LUXURY_BROWSER_MAINTENANCE_SINK === '1'
  && new Set(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Aside.app/Contents/MacOS/Aside']).has(command);
// Explicit browser-only policy: deny unlisted resources locally, without
// terminating the approved page. Never create upstream sockets for them.
const rejectUnlisted = discardMaintenance && process.env.LUXURY_BROWSER_REJECT_UNLISTED === '1';
// These browser services receive only a local rejection, never an upstream socket.
const maintenanceHosts = new Set(['clients1.google.com', 'clients2.google.com', 'www.gstatic.com', 'www.google.com', 'accounts.google.com', 'android.clients.google.com', 'update.googleapis.com']);
// Exact observed page telemetry endpoint: reject locally, never forward.
const rejectedTelemetryHosts = new Set(['sec51707.live.dynatrace.com', 'se.monetate.net', 'www.googletagmanager.com']);
function stop(host = null) {
  blocked = true;
  if (process.env.LUXURY_NETWORK_STATUS_FILE && host) {
    try {
      writeFileSync(process.env.LUXURY_NETWORK_STATUS_FILE, JSON.stringify({ status: 'blocked', host }), { mode: 0o600 });
    } catch {}
  }
  if (child) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
}
const proxy = http.createServer((req, res) => {
  let host;
  try { host = new URL(req.url).hostname; } catch {}
  if ((rejectUnlisted && host) || (discardMaintenance && (maintenanceHosts.has(host) || rejectedTelemetryHosts.has(host)))) {
    req.resume(); res.writeHead(403); res.end(); return;
  }
  if (process.env.LUXURY_NETWORK_DIAGNOSTIC === '1') {
    try { console.error(`DENIED_HOST=${new URL(req.url).hostname}`); } catch {}
  }
  res.writeHead(403); res.end(); stop(host || 'INVALID');
});
proxy.on('connect', (req, socket, head) => {
  // A rejected CONNECT may be reset by Chromium before the 403 is flushed.
  // Handle that reset on the rejection path as well as on forwarded sockets;
  // otherwise Node exits 1 before the safety-stop result (78) can be delivered.
  socket.on('error', () => {});
  const match = /^([a-z0-9.-]+):443$/i.exec(req.url || '');
  if (rejectUnlisted && match && !hosts.has(match[1].toLowerCase())) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return;
  }
  if (discardMaintenance && (maintenanceHosts.has(match?.[1].toLowerCase()) || rejectedTelemetryHosts.has(match?.[1].toLowerCase()))) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return;
  }
  if (!match || !hosts.has(match[1].toLowerCase())) {
    if (process.env.LUXURY_NETWORK_DIAGNOSTIC === '1') console.error(`DENIED_HOST=${match?.[1] || 'INVALID'}`);
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); stop(match?.[1] || 'INVALID'); return;
  }
  const upstream = net.connect(443, match[1], () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream); upstream.pipe(socket);
  });
  upstream.on('error', error => {
    if (process.env.LUXURY_NETWORK_STATUS_FILE) {
      try {
        writeFileSync(process.env.LUXURY_NETWORK_STATUS_FILE, JSON.stringify({
          status: 'upstream_failed', host: match[1], code: error.code || 'UNKNOWN',
        }), { mode: 0o600 });
      } catch {}
    }
    socket.destroy();
  });
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
});
await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
const port = proxy.address().port;
const proxyUrl = `http://127.0.0.1:${port}`;
const profile = `(version 1)(allow default)(deny network-outbound)
 (allow network-outbound (remote unix-socket))
 (allow network-outbound (remote ip "localhost:${port}"))
 ${localPort === '0' ? '' : `(allow network-outbound (remote ip "localhost:${Number(localPort)}"))`}`;
child = spawn('/usr/bin/sandbox-exec', ['-p', profile, command, ...args.map(arg => arg.replace('__NETWORK_PROXY__', proxyUrl))], {
  detached: true, stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl,
    https_proxy: proxyUrl, http_proxy: proxyUrl, ALL_PROXY: proxyUrl,
    NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
    LUXURY_NETWORK_PROXY: proxyUrl, LUXURY_NETWORK_ISOLATED: 'enabled' },
});
for (const [source, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  source.on('data', chunk => {
    capturedBytes += chunk.length;
    if (capturedBytes > 1048000) {
      logLimited = true;
      stop();
      return;
    }
    destination.write(chunk);
  });
}
child.on('error', () => { proxy.close(); process.exit(1); });
child.on('exit', code => {
  proxy.close();
  if (logLimited) console.error('BLOCKED: LOG_LIMIT; process group terminated.');
  else if (blocked) console.error('BLOCKED: unauthorized network destination; process group terminated.');
  process.exit(blocked ? 78 : code ?? 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); proxy.close(); process.exit(1); });
