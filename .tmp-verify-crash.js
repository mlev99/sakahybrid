const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const match = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
if (!match) throw new Error('Main script not found');

const script = match[1];

function makeElement(id) {
  return {
    id,
    style: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    innerHTML: '',
    innerText: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    remove() {},
    click() {}
  };
}

const elements = new Map();
function getElement(id) {
  if (!elements.has(id)) elements.set(id, makeElement(id));
  return elements.get(id);
}

const documentStub = {
  body: makeElement('body'),
  addEventListener() {},
  getElementById(id) { return getElement(id); },
  querySelector(selector) {
    if (selector === '.toggle-label') return getElement('toggle-label');
    return null;
  },
  querySelectorAll(selector) {
    if (selector === '.page' || selector === '.nav-item' || selector === '#pin-dots span') return [];
    return [];
  },
  createElement() { return makeElement('created'); },
  documentElement: makeElement('documentElement')
};

const localStorageStub = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = String(value); },
  removeItem(key) { delete this.data[key]; }
};
localStorageStub.setItem('saka_tracker_v5_4', '{bad json');

const windowStub = {
  addEventListener() {},
  location: { reload() {} },
  matchMedia() { return { matches: false }; },
  scrollTo() {},
  setTimeout(fn) { fn(); return 1; },
  clearTimeout() {},
  confirm() { return true; },
  alert() {},
  document: documentStub,
  navigator: { serviceWorker: null, userAgent: 'node' },
  console,
  localStorage: localStorageStub,
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  crypto: { subtle: { digest: async () => new Uint8Array([1,2,3]) } },
  FileReader: function () {},
  Blob: class Blob {},
  URL: { createObjectURL() { return 'blob://test'; } },
  atob: (s) => Buffer.from(s, 'base64').toString('binary')
};

const context = vm.createContext({
  window: windowStub,
  document: documentStub,
  localStorage: localStorageStub,
  navigator: windowStub.navigator,
  console,
  setTimeout: windowStub.setTimeout,
  clearTimeout: windowStub.clearTimeout,
  alert: windowStub.alert,
  confirm: windowStub.confirm,
  fetch: windowStub.fetch,
  crypto: windowStub.crypto,
  FileReader: windowStub.FileReader,
  Blob: windowStub.Blob,
  URL: windowStub.URL,
  AbortSignal: { timeout: () => ({}) },
  TextEncoder: require('util').TextEncoder,
  TextDecoder: require('util').TextDecoder,
  Date,
  Math,
  JSON,
  Number,
  String,
  Array,
  Object,
  parseInt,
  isNaN,
  Promise,
  Map,
  Set,
  Error,
  RegExp
});

try {
  vm.runInContext(script, context, { filename: 'index.html' });
  console.log('HARNESS_OK');
} catch (err) {
  console.error('HARNESS_FAIL');
  console.error(err && err.stack || err);
  process.exit(1);
}
