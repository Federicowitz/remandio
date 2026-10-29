import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const workerSource = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

function worker({ cached, keys = [] } = {}) {
  const handlers = {};
  const deleted = [];
  let fetched = 0;
  let claimed = false;
  vm.runInNewContext(workerSource, {
    URL,
    self: {
      location: { origin: "https://remandio.test" },
      registration: { scope: "https://remandio.test/app/" },
      addEventListener: (name, callback) => { handlers[name] = callback; },
      clients: { claim: async () => { claimed = true; } },
      skipWaiting: async () => {}
    },
    caches: {
      keys: async () => keys,
      delete: async (key) => { deleted.push(key); },
      open: async () => ({ match: async () => cached, addAll: async () => {} })
    },
    fetch: async () => { fetched++; return "network"; }
  });
  return { handlers, deleted, fetched: () => fetched, claimed: () => claimed };
}

test("PWA shell is served from cache without waiting for the network", async () => {
  const instance = worker({ cached: "cached shell" });
  let response;
  instance.handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://remandio.test/app/" }, respondWith: (value) => { response = value; } });
  assert.equal(await response, "cached shell");
  assert.equal(instance.fetched(), 0);
});

test("activation removes only old Remandio caches and does not navigate open drafts", async () => {
  const current = workerSource.match(/const CACHE_NAME = "([^"]+)"/)[1];
  const instance = worker({ keys: [current, "remandio-shell-old", "another-app"] });
  let activation;
  instance.handlers.activate({ waitUntil: (value) => { activation = value; } });
  await activation;
  assert.deepEqual(instance.deleted, ["remandio-shell-old"]);
  assert.equal(instance.claimed(), true);
});

test("worker does not intercept external traffic", () => {
  const instance = worker();
  let intercepted = false;
  instance.handlers.fetch({ request: { method: "GET", url: "https://external.test/resource" }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});

for (const scenario of [
  { saved: "dark", systemDark: false, expected: "#080706" },
  { saved: "light", systemDark: true, expected: "#eeede9" },
  { saved: null, systemDark: true, expected: "#080706" },
  { saved: "invalid", systemDark: false, expected: "#eeede9" },
  { blocked: true, systemDark: true, expected: "#080706" }
]) {
  test(`theme is set before styles and IndexedDB: ${JSON.stringify(scenario)}`, () => {
    const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(bootstrap.index < html.indexOf('rel="stylesheet"'));
    const root = { dataset: {}, style: {} };
    vm.runInNewContext(bootstrap[1], {
      document: { documentElement: root, querySelectorAll: () => [] },
      localStorage: { getItem: () => { if (scenario.blocked) throw new Error("Blocked"); return scenario.saved; } },
      matchMedia: () => ({ matches: scenario.systemDark })
    });
    assert.equal(root.style.backgroundColor, scenario.expected);
  });
}
