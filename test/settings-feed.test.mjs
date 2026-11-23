import test from "node:test";
import assert from "node:assert/strict";
import { watchSettings } from "../settings-feed-client/index.ts";
import { registerSettingsFeed } from "../settings-feed-server/index.ts";

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function clock() {
  let time = 0, next = 0; const jobs = new Map();
  return {
    jobs,
    setTimeout(fn, ms) { const id = ++next; jobs.set(id, { fn, at: time + ms }); return id; },
    clearTimeout(id) { jobs.delete(id); },
    setInterval(fn, ms) { const id = ++next; jobs.set(id, { fn, at: time + ms, interval: ms }); return id; },
    clearInterval(id) { jobs.delete(id); },
    async advance(ms) {
      const end = time + ms;
      for (;;) {
        const found = [...jobs].filter(([,j]) => j.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
        if (!found) break;
        const [id,j] = found; time = j.at; jobs.delete(id);
        if (j.interval) jobs.set(id, { ...j, at: time+j.interval });
        j.fn(); await flush();
      }
      time = end; await flush();
    },
  };
}
test("settings changes reach the client without a poll, and both sides clean up", async () => {
  const timer = clock(); let handler, changed, reads = 0, settingsOff = 0, closed = 0;
  let doc = { status: "ready", values: { showSidebar: true } };
  const stopServer = registerSettingsFeed({ handle(_contract, run) { handler = run; } }, {}, {
    read: async () => doc,
    subscribe(listener) { changed = listener; return () => { settingsOff++; }; },
  });
  const seen = [];
  const client = { subscribe(_contract, _input, event) {
    const abort = new AbortController();
    handler({}, { push: async value => event(value), signal: abort.signal });
    return Object.assign(() => { closed++; abort.abort(); }, { ready: Promise.resolve() });
  } };
  const watch = watchSettings({ client, contract: {}, read: async () => { reads++; return doc; }, apply: value => seen.push(value), clock: timer });
  await flush();
  doc = { status: "ready", values: { showSidebar: false } }; changed(doc); await flush();
  assert.deepEqual(seen.map(value => value.values.showSidebar), [true, false]);
  await timer.advance(120_000); assert.equal(reads, 0);
  watch.stop(); stopServer(); changed(doc); await flush();
  assert.equal(seen.length, 2); assert.equal(settingsOff, 1); assert.equal(closed, 1); assert.equal(timer.jobs.size, 0);
});
test("older clients poll once a minute, suppress stale reads and stop after disposal", async () => {
  const timer = clock(); let reads = 0, resolve, revision = 0; const seen = [];
  const watch = watchSettings({ client: {}, contract: {}, read: () => { reads++; return new Promise(r => { resolve = r; }); }, apply: doc => seen.push(doc), revision: () => revision, clock: timer });
  revision++; resolve({ old: true }); await flush(); assert.deepEqual(seen, []);
  await timer.advance(59_999); assert.equal(reads, 1);
  await timer.advance(1); assert.equal(reads, 2);
  watch.stop(); resolve({ late: true }); await flush();
  assert.deepEqual(seen, []); assert.equal(timer.jobs.size, 0);
});
test("a dropped or refused feed polls while retrying, recovers, and ignores late callbacks", async () => {
  const timer = clock(); let reads = 0, attempts = 0; const seen = [], connections = [];
  const client = { subscribe(_contract, _input, event, options) {
    attempts++; const h = Object.assign(() => {}, { ready: Promise.resolve() });
    connections.push({ event, close: options.onClosed }); return h;
  } };
  const watch = watchSettings({ client, contract: {}, read: async () => ({ read: ++reads }), apply: doc => seen.push(doc), clock: timer });
  await flush(); connections[0].close(); await flush(); assert.equal(reads, 1);
  await timer.advance(1_000); assert.equal(attempts, 2);
  connections[0].event({ stale: true }); connections[1].event({ pushed: true }); await flush();
  assert.equal(seen.some(doc => doc.stale), false);
  await timer.advance(30_000); await timer.advance(120_000); assert.equal(reads, 1);
  watch.stop(); assert.equal(timer.jobs.size, 0);
});
test("repeated refusals do not create an RPC read for each subscription attempt", async () => {
  const timer = clock(); let reads = 0, attempts = 0;
  const watch = watchSettings({ client: { subscribe() { attempts++; throw new Error("unavailable"); } }, contract: {}, read: async () => ++reads, apply() {}, clock: timer });
  await flush(); await timer.advance(60_000);
  assert.ok(attempts > 2); assert.equal(reads, 2);
  watch.stop(); assert.equal(timer.jobs.size, 0);
});
test("an initial settings read cannot overwrite a newer push", async () => {
  let handler, changed, resolve; const seen = [];
  const stop = registerSettingsFeed({ handle(_contract, run) { handler = run; } }, {}, {
    read: () => new Promise(r => { resolve = r; }),
    subscribe(listener) { changed = listener; return () => {}; },
  });
  const abort = new AbortController();
  handler({}, { push: async doc => seen.push(doc), signal: abort.signal });
  changed({ current: true }); resolve({ stale: true }); await flush();
  assert.deepEqual(seen, [{ current: true }]);
  abort.abort(); changed({ late: true }); await flush(); assert.equal(seen.length, 1);
  stop();
});
