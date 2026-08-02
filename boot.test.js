/*
 * Boot check: does the page script survive being loaded, and does it compute the
 * example it ships with?
 *
 * core.test.js proves the maths. It cannot prove the page ever calls it. A
 * script that throws while the browser is parsing it leaves a form that looks
 * finished and does nothing, with the error in a console nobody has open.
 *
 * No dependencies on purpose, so the DOM below is a hand stub. It only has to be
 * good enough to run the page, not to be a browser.
 *
 * Run: node boot.test.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function node(tag) {
  const classes = new Set();
  const n = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [], parentNode: null, style: {}, attributes: {},
    textContent: '', value: '', checked: false, hidden: false, title: '',
    type: '', placeholder: '', autocomplete: '', spellcheck: true, id: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    listeners: {},
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c, ref) {
      c.parentNode = this;
      const i = this.children.indexOf(ref);
      this.children.splice(i < 0 ? this.children.length : i, 0, c);
      return c;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    fire(type) { (this.listeners[type] || []).forEach((fn) => fn({ type })); },
    click() { this.fire('click'); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(n, 'className', {
    get: () => Array.from(classes).join(' '),
    set: (v) => {
      classes.clear();
      String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
  });
  // what the page reads back out of a subtree it built
  Object.defineProperty(n, 'text', {
    get() {
      return this.children.length
        ? this.children.map((c) => c.text).join('')
        : this.textContent;
    },
  });
  return n;
}

const IDS = ['sym', 'formula', 'unit', 'quantities', 'add', 'onesig', 'result',
             'answer', 'facts', 'budgetWrap', 'budget', 'copyText', 'copyLatex',
             'copyBudget', 'copied', 'fhelp'];

function run(source, core) {
  const byId = {};
  IDS.forEach((id) => { byId[id] = node('div'); byId[id].id = id; });
  byId.sym.value = 'R';
  byId.formula.value = 'V/I';
  byId.unit.value = 'Ω';

  let copied = null;
  const sandbox = {
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: node,
      createTextNode: (t) => { const n = node('#text'); n.textContent = t; return n; },
      body: node('body'),
    },
    navigator: { clipboard: { writeText: (t) => { copied = t; return Promise.resolve(); } } },
    setTimeout: () => 0,
    console,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(core, sandbox);
  vm.runInContext(source, sandbox);
  return { byId, copied: () => copied, sandbox };
}

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(dir, 'core.js'), 'utf8');
const start = html.indexOf('<script>', html.indexOf('core.js'));
const script = html.slice(start + '<script>'.length, html.indexOf('</' + 'script>', start));

assert.ok(script.length > 500, 'could not find the page script inside index.html');

// Loading it must not throw. A temporal dead zone error, a typo, anything fatal
// at parse or during init fails right here.
let app;
assert.doesNotThrow(() => { app = run(script, core); }, 'the page script threw while loading');

// The page ships with a worked example so the first thing you see is an answer.
// V = 5.000 ±(0.5% + 2 counts x 0.001) = 0.027 -> u = 0.0155885
// I = 0.500 ±(1.0% + 3 counts x 0.001) = 0.008 -> u = 0.0046188
// R = 10, c_V = 2, c_I = -20, u_c = 0.0974977, U = 1.96 u_c = 0.191095 -> 0.19
assert.strictEqual(app.byId.answer.textContent, 'R = 10.00 ± 0.19 Ω',
  'seeded example got ' + app.byId.answer.textContent);
assert.strictEqual(app.byId.quantities.children.length, 2, 'two seeded quantities');
assert.strictEqual(app.byId.budgetWrap.hidden, false, 'the budget table should be showing');
assert.strictEqual(app.byId.budget.children.length, 2, 'one budget row per quantity');
assert.ok(/relative/.test(app.byId.facts.text), 'facts row is populated');

// One figure instead of two moves both numbers together.
app.byId.onesig.checked = true;
app.byId.onesig.fire('change');
assert.strictEqual(app.byId.answer.textContent, 'R = 10.0 ± 0.2 Ω',
  'one significant figure got ' + app.byId.answer.textContent);
app.byId.onesig.checked = false;
app.byId.onesig.fire('change');

// A formula that cannot parse has to say so in the page, not in the console.
app.byId.formula.value = 'V/';
app.byId.formula.fire('input');
assert.ok(app.byId.result.classList.contains('bad'), 'a bad formula marks the result');
assert.ok(/ends too early/.test(app.byId.facts.text), 'the parse error is shown: ' + app.byId.facts.text);

app.byId.formula.value = 'V/I';
app.byId.formula.fire('input');
assert.strictEqual(app.byId.answer.textContent, 'R = 10.00 ± 0.19 Ω', 'recovers after a bad formula');

// Copy buttons produce something a report can use.
app.byId.copyLatex.fire('click');
assert.ok(/^\$R = 10\.00 \\pm 0\.19\\ \\mathrm\{.+\}\$$/.test(app.copied()),
  'latex output: ' + app.copied());
app.byId.copyBudget.fire('click');
assert.ok(/\| Quantity \|/.test(app.copied()) && /u_c = /.test(app.copied()),
  'budget markdown output');

// Without core.js the page has to say so instead of throwing on every keystroke.
const orphan = run(script, '/* core.js missing */');
assert.ok(/did not load/.test(orphan.byId.answer.textContent),
  'missing core.js should be announced, got ' + orphan.byId.answer.textContent);

console.log('boot: the page loads, computes its example, and fails out loud');
