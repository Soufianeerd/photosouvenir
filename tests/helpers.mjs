import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';

export function frontend(indexedDB = new IDBFactory()) {
  const elements = new Map(), timers = [];
  function element(id = '') {
    const classes = new Set(), attributes = new Map();
    const value = { id, hidden: true, disabled: false, value: '', textContent: '', innerHTML: '', dataset: {}, children: [], listeners: {}, width: 390, height: 844,
      videoWidth: 720, videoHeight: 1280, readyState: 2, paused: false,
      style: { setProperty() {} },
      classList: { add(...v) { v.forEach(x => classes.add(x)); }, remove(...v) { v.forEach(x => classes.delete(x)); }, contains(v) { return classes.has(v); }, toggle(v, on) { if (on ?? !classes.has(v)) { classes.add(v); return true; } classes.delete(v); return false; } },
      addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }, removeEventListener() {},
      setAttribute(name, value) { attributes.set(name, value); }, getAttribute(name) { return attributes.get(name); }, removeAttribute(name) { attributes.delete(name); },
      appendChild(child) { this.children.push(child); child.parentNode = this; }, replaceChildren(...children) { this.children = children; }, remove() {},
      querySelector() { return null; }, querySelectorAll() { return []; }, focus() {}, click() { for (const fn of this.listeners.click || []) fn({}); },
      getBoundingClientRect() { return { width: 390, height: 844 }; }, getContext() { return { clearRect() {}, drawImage() {}, save() {}, restore() {}, translate() {}, scale() {} }; },
      play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, scrollIntoView() {}
    }; return value;
  }
  const doc = { hidden: false, getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); }, createElement: element, querySelector() { return null; }, addEventListener() {}, documentElement: element(), body: element(), head: element() };
  const timing = fn => (callback, ms) => { timers.push({ callback, ms }); const t = fn(callback, ms); t.unref?.(); return t; };
  const context = { indexedDB, crypto: webcrypto, console: { info() {}, warn() {}, error() {} }, document: doc,
    navigator: { onLine: true, mediaDevices: { getUserMedia: async () => stream() } }, location: { protocol: 'https:', hostname: 'localhost' },
    Blob, File, URL, Uint8Array, Map, Date, Math, Promise, Error, Object, Number, String, Array, JSON, RegExp, isFinite,
    setTimeout: timing(setTimeout), clearTimeout, setInterval: timing(setInterval), clearInterval,
    requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, matchMedia() { return { matches: false }; }, HTMLCanvasElement: class {},
    FilterRender: { preload() {} }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, innerWidth: 390, innerHeight: 844, addEventListener() {}, scrollTo() {},
    FileReader: class { readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = 'data:' + blob.type + ';base64,' + Buffer.from(bytes).toString('base64'); this.onload?.(); }); } }
  };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').split('(async function init() {')[0], context);
  return { context, elements, timers, run: text => vm.runInContext(text, context) };
}
export function stream(facing = 'user', torch = false) {
  const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {}, getSettings: () => ({ facingMode: facing, width: 720, height: 1280, torch: false }), getCapabilities: () => ({ torch }), applyConstraints: async () => {} };
  return { track, getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] };
}
export function backend() {
  const cache = new Map(), props = new Map(), files = [], folders = new Map(); let locked = false;
  const lock = { tryLock() { if (locked) return false; locked = true; return true; }, waitLock() { if (locked) throw Error('Lock busy'); locked = true; }, hasLock: () => locked, releaseLock() { locked = false; } };
  const folder = name => ({ getName: () => name, getFoldersByName(n) { return { hasNext: () => folders.has(n), next: () => folders.get(n) }; }, createFolder(n) { const f = folder(n); folders.set(n, f); return f; },
    getFilesByName(name) { const matches = files.filter(f => f.name === name); return { hasNext: () => !!matches.length, next: () => matches[0] }; },
    createFile(blob) { const f = { ...blob, description: '', getId: () => 'file-' + files.length, getSize: () => blob.bytes.length, setDescription(text) { this.description = text; } }; files.push(f); return f; }
  });
  const main = folder('Memories');
  const context = { console, Logger: { log() {} }, LockService: { getScriptLock: () => lock },
    Utilities: { getUuid: () => webcrypto.randomUUID(), base64Decode: text => Array.from(Buffer.from(text, 'base64')), newBlob: (bytes, type, name) => ({ bytes, type, name }) },
    CacheService: { getScriptCache: () => ({ put: (k, v) => cache.set(k, v), get: k => cache.get(k), remove: k => cache.delete(k) }) },
    PropertiesService: { getScriptProperties: () => ({ setProperty: (k, v) => props.set(k, v), getProperty: k => props.get(k), deleteProperty: k => props.delete(k), getProperties: () => Object.fromEntries(props) }) },
    DriveApp: { getFolderById: () => main }, ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js', TEXT: 'text' }, createTextOutput: value => ({ value, setMimeType() { return this; } }) }
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync('Code-livre-photos.gs', 'utf8'), context);
  const run = text => vm.runInContext(text, context);
  const payload = extra => ({ uploadId: 'test-upload', mediaType: 'photo', mimeType: 'image/jpeg', mediaBase64: '/9j/2Q==', filename: 'memory.jpg', message: 'Vive les mariés !', guestName: 'Élodie', ...extra });
  return { context, cache, props, files, run, payload, post(extra) { context.request = { postData: { contents: JSON.stringify(payload(extra)) } }; return JSON.parse(run('doPost(request)').value); } };
}
