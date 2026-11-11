// Loaded before application modules or dotenv, in test/build child processes only.
require('./test-safety.cjs').assertTestContext();
require('dotenv').config = () => ({ parsed: {} });
const path = require('node:path');
const fs = require('node:fs');
function sensitive(file) {
  if (file instanceof URL) file = require('node:url').fileURLToPath(file);
  if (Buffer.isBuffer(file)) file = file.toString();
  if (typeof file !== 'string') return false;
  const normalized = file.replaceAll('\\', '/');
  return /(^|\/)\.env($|\.)/.test(normalized) || /(^|\/)\.deployment-private(\/|$)/.test(normalized) ||
    /(^|\/)(\.aws|\.azure|gcloud)(\/|$)/i.test(normalized) ||
    /(^|\/)(application_default_credentials|firebase-tools)\.json$/i.test(normalized);
}
function missing() { return Object.assign(Error('Sensitive local files are unavailable in isolated tests.'), { code: 'ENOENT' }); }
// Next's env exports are getters, so monkey-patching its loader is insufficient.
// Block the underlying reads, including ESM bindings and streams, before loading Next.
for (const key of ['readFileSync', 'openSync', 'statSync', 'lstatSync', 'accessSync']) {
  const original = fs[key];
  fs[key] = function (file, ...args) { if (sensitive(file)) throw missing(); return original.call(this, file, ...args); };
}
const exists = fs.existsSync;
fs.existsSync = file => !sensitive(file) && exists(file);
for (const key of ['readFile', 'open', 'stat', 'lstat', 'access']) {
  const original = fs[key];
  fs[key] = function (file, ...args) {
    if (sensitive(file)) { const callback = args.at(-1); queueMicrotask(() => callback(missing())); return; }
    return original.call(this, file, ...args);
  };
  const promise = fs.promises[key];
  fs.promises[key] = async function (file, ...args) { if (sensitive(file)) throw missing(); return promise.call(this, file, ...args); };
}
require('node:module').syncBuiltinESMExports();
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  const host = typeof options === 'object' ? (options.host || options.hostname) : args[1];
  // Node workers need IPC; network access is restricted to loopback.
  if (!(typeof options === 'object' && options.path) && typeof options !== 'string' &&
      host && !['127.0.0.1', '::1', 'localhost'].includes(host))
    throw Error('External network access is forbidden in isolated tests (destination withheld).');
  return connect.apply(this, args);
};
