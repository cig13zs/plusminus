/* Run: node core.test.js
   Every number here is checked against a worked example, not against whatever
   the code happened to return the first time. */
'use strict';
const assert = require('assert');
const P = require('./core.js');

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected} ± ${tol}, got ${actual}`);
}

/* -------------------------------------------------------------- the parser */

assert.strictEqual(P.evaluate(P.parse('2+3*4'), {}), 14);
assert.strictEqual(P.evaluate(P.parse('(2+3)*4'), {}), 20);
assert.strictEqual(P.evaluate(P.parse('2^3^2'), {}), 512, 'power is right-associative');
assert.strictEqual(P.evaluate(P.parse('2**3'), {}), 8, '** is accepted');
assert.strictEqual(P.evaluate(P.parse('-3^2'), {}), 9, 'unary minus binds to the base here');
assert.strictEqual(P.evaluate(P.parse('V/I'), { V: 10, I: 2 }), 5);
assert.strictEqual(P.evaluate(P.parse('sqrt(V)'), { V: 9 }), 3);
near(P.evaluate(P.parse('2*pi'), {}), 6.283185, 1e-5, 'pi');
assert.deepStrictEqual(P.symbolsOf(P.parse('V*V/R')), ['V', 'R']);

assert.throws(() => P.parse('V +'), /ends too early/);
assert.throws(() => P.parse('V & I'), /does not belong/);
assert.throws(() => P.parse('nope(3)'), /unknown function/);
assert.throws(() => P.parse('1 2'), /leftover/);
assert.throws(() => P.evaluate(P.parse('V/I'), { V: 1 }), /no value given/);
// the whole reason there is a parser at all
assert.throws(() => P.parse('fetch("http://x")'), /unknown function|does not belong/);

/* --------------------------------------------------------- sensitivities */

// d(V/I)/dV = 1/I = 0.5 ; d(V/I)/dI = -V/I^2 = -2.5
const ohm = P.parse('V/I');
near(P.sensitivity(ohm, { V: 10, I: 2 }, 'V'), 0.5, 1e-6, 'dR/dV');
near(P.sensitivity(ohm, { V: 10, I: 2 }, 'I'), -2.5, 1e-5, 'dR/dI');
// d(V^2/R)/dV = 2V/R = 2 at V=10,R=10
near(P.sensitivity(P.parse('V^2/R'), { V: 10, R: 10 }, 'V'), 2, 1e-5, 'dP/dV');

/* ------------------------------------------------------- instrument specs */

// Fluke 115, DC volts: ±(0.5% of reading + 2 counts). 6.000 V range, so one
// count is 0.001 V. Reading 5.000 V -> 0.5% * 5 = 0.025, plus 0.002 = 0.027 V.
const spec = P.fromSpec({ reading: 5.0, percent: 0.5, counts: 2, resolution: 0.001 });
near(spec.halfWidth, 0.027, 1e-9, 'Fluke 115 half width');
near(spec.u, 0.027 / Math.sqrt(3), 1e-9, 'rectangular divisor');
// treating the spec as a standard deviation overstates u by 73%
near(spec.halfWidth / spec.u, 1.7320508, 1e-6, 'sqrt(3)');

const asNormal = P.fromSpec({ reading: 5.0, percent: 0.5, counts: 2, resolution: 0.001, shape: 'normal95' });
near(asNormal.u, 0.0135, 1e-9, 'k=2 certificate divisor');

// a certificate with its own coverage factor
const k2 = P.fromSpec({ reading: 5.0, percent: 0.5, counts: 2, resolution: 0.001, shape: 'expanded', k: 2 });
near(k2.u, asNormal.u, 1e-12, 'expanded with k = 2 matches the k = 2 shape');
near(P.fromSpec({ reading: 5.0, percent: 0.5, counts: 2, resolution: 0.001, shape: 'expanded', k: '2.52' }).u,
  0.027 / 2.52, 1e-12, 'k = 2.52 from a certificate');
assert.ok(isNaN(P.fromSpec({ reading: 5, percent: 0.5, shape: 'expanded', k: 0 }).u), 'k = 0 is refused');
assert.ok(isNaN(P.fromSpec({ reading: 5, percent: 0.5, shape: 'expanded', k: 'two' }).u), 'k has to be a number');
const cert = P.fromExpanded(0.12, 2);
near(cert.u, 0.06, 1e-12, 'U = 0.12 at k = 2 is u = 0.06');
near(P.fromExpanded(-0.3, 3).u, 0.1, 1e-12, 'sign of U does not matter');
assert.ok(isNaN(P.fromExpanded(0.1, -1).u), 'negative k is refused');

// resolution alone: a 0.01 V display step means ±0.005 rectangular
const res = P.fromResolution(0.01);
near(res.halfWidth, 0.005, 1e-12, 'half a step');
near(res.u, 0.005 / Math.sqrt(3), 1e-12, 'resolution standard uncertainty');

/* --------------------------------------------------------------- type A */

const rep = P.fromRepeats([10.1, 10.3, 10.2, 10.0, 10.4]);
assert.strictEqual(rep.n, 5);
near(rep.mean, 10.2, 1e-12, 'mean');
near(rep.sd, 0.1581139, 1e-6, 'sample standard deviation');
near(rep.u, 0.0707107, 1e-6, 'standard error of the mean');
assert.strictEqual(rep.dof, 4);
assert.strictEqual(P.fromRepeats([5]).n, 1, 'one reading gives no spread');
assert.strictEqual(P.fromRepeats([]).n, 0);

/* ------------------------------------------------------------- t factors */

near(P.tFactor(4), 2.776, 1e-3, 't(4)');
near(P.tFactor(9), 2.262, 1e-3, 't(9)');
near(P.tFactor(Infinity), 1.960, 1e-3, 't(inf)');
assert.ok(P.tFactor(6) < P.tFactor(3), 't shrinks as dof grows');
assert.ok(P.tFactor(7.5) > P.tFactor(8) && P.tFactor(7.5) < P.tFactor(7), 't interpolates');

/* ------------------------------------------------------------ propagation */

// R = V/I, V = 5.000 ± 0.027 (limit), I = 0.500 A ± 0.006 (limit)
// u_V = 0.027/sqrt3 = 0.0155885, u_I = 0.006/sqrt3 = 0.0034641
// c_V = 1/I = 2, c_I = -V/I^2 = -20
// c_V*u_V = 0.0311769, c_I*u_I = -0.0692820
// u_c = sqrt(0.00097200 + 0.00480000) = sqrt(0.00577200) = 0.0759737
const r = P.propagate('V/I', [
  { name: 'V', value: 5.0, u: 0.027 / Math.sqrt(3), dof: Infinity },
  { name: 'I', value: 0.5, u: 0.006 / Math.sqrt(3), dof: Infinity }
]);
near(r.value, 10, 1e-9, 'R');
near(r.uc, 0.0759737, 1e-6, 'combined standard uncertainty');
near(r.k, 1.96, 1e-6, 'no type A, so k comes from the normal');
near(r.U, 0.1489085, 1e-5, 'expanded uncertainty');
// the current term dominates: its share should be four fifths of the variance
near(r.terms[0].share, 0.8316, 1e-3, 'dominant share');
assert.strictEqual(r.terms[0].name, 'I', 'terms come back worst first');
near(r.terms[0].share + r.terms[1].share, 1, 1e-9, 'shares add to one');

// an input the formula never uses contributes nothing
const unused = P.propagate('V/I', [
  { name: 'V', value: 5, u: 0.1 }, { name: 'I', value: 0.5, u: 0.01 },
  { name: 'T', value: 25, u: 5 }
]);
const tTerm = unused.terms.filter((t) => t.name === 'T')[0];
assert.strictEqual(tTerm.used, false);
assert.strictEqual(tTerm.contribution, 0);

// a type A component pulls the coverage factor above 1.96
const withA = P.propagate('V', [{ name: 'V', value: 10.2, u: 0.0707107, dof: 4 }]);
near(withA.dofEff, 4, 1e-6, 'one type A component keeps its own dof');
near(withA.k, 2.776, 1e-3, 'k follows Student t');

// Welch-Satterthwaite: a big type B alongside a small type A lifts dof toward infinity
const mixed = P.propagate('a+b', [
  { name: 'a', value: 1, u: 0.01, dof: 4 },
  { name: 'b', value: 1, u: 0.20, dof: Infinity }
]);
assert.ok(mixed.dofEff > 1000, 'type B dominance means effectively infinite dof');
near(mixed.k, 1.96, 1e-2, 'k returns to the normal');

assert.throws(() => P.propagate('V/I', [{ name: 'V', value: 1, u: 0.1 }]), /no value given/);

/* -------------------------------------------------------------- reporting */

// uncertainty to 2 significant figures, value follows it to the same decimal
let rep1 = P.report(10.00043, 0.0759737, { sigFigs: 2 });
assert.strictEqual(rep1.U, '0.076');
assert.strictEqual(rep1.value, '10.000');

// one significant figure moves both
let rep2 = P.report(10.00043, 0.0759737, { sigFigs: 1 });
assert.strictEqual(rep2.U, '0.08');
assert.strictEqual(rep2.value, '10.00');

// the classic: 20.47 ± 0.3 must be reported to the tenth, not the hundredth
let rep3 = P.report(20.47, 0.3, { sigFigs: 1 });
assert.strictEqual(rep3.text, '20.5 ± 0.3');

// a trailing zero that carries information must survive
let rep4 = P.report(20.0, 1.1, { sigFigs: 2 });
assert.strictEqual(rep4.text, '20.0 ± 1.1');

// 0.0996 to two figures is 0.10, which sits one decimal place higher than
// 0.0996 did. The value has to move with it, or it keeps a digit it no longer
// has any claim to.
let rep5 = P.report(1.23456, 0.0996, { sigFigs: 2 });
assert.strictEqual(rep5.U, '0.10');
assert.strictEqual(rep5.value, '1.23');

// whole numbers stay whole
let rep6 = P.report(1234, 56, { sigFigs: 2 });
assert.strictEqual(rep6.text, '1234 ± 56');

let rep7 = P.report(4700, 43, { sigFigs: 2, unit: 'Ω' });
assert.strictEqual(rep7.text, '4700 ± 43 Ω');

/* ------------------------------------------------------------ engineering */

assert.strictEqual(P.engineering(4700, 43, 'Ω').prefix, 'k');
assert.strictEqual(P.engineering(0.0047, 0.00004, 'F').prefix, 'm');
assert.strictEqual(P.engineering(4.7e-9, 1e-11, 'F').prefix, 'n');
assert.strictEqual(P.engineering(0, 0, 'V').prefix, '', 'zero has no prefix');
// the pair shares one scale so it never prints as 4.7 kΩ ± 43 Ω
const eng = P.engineering(4700, 43, 'Ω');
assert.strictEqual(4700 / eng.scale, 4.7);
assert.strictEqual(43 / eng.scale, 0.043);

/* ------------------------------------------------------------ line fitting */

// Textbook case: x = 1..4, y = 6,5,7,10.
// Sxy = 7, Sxx = 5 -> slope 1.4, intercept 3.5
// residuals 1.1, -1.3, -0.7, 0.9 -> SSE 4.2, s = sqrt(4.2/2) = 1.4491
// u_m = s/sqrt(Sxx) = 0.64807 ; u_b = s*sqrt(1/4 + 6.25/5) = 1.77482
// SST = 14 -> r2 = 1 - 4.2/14 = 0.7
const ols = P.fitLine([{ x: 1, y: 6 }, { x: 2, y: 5 }, { x: 3, y: 7 }, { x: 4, y: 10 }]);
assert.strictEqual(ols.ok, true);
assert.strictEqual(ols.weighted, false, 'no uncertainties means plain least squares');
near(ols.slope, 1.4, 1e-12, 'slope');
near(ols.intercept, 3.5, 1e-12, 'intercept');
near(ols.uSlope, 0.6480741, 1e-6, 'standard error of the slope');
near(ols.uIntercept, 1.7748239, 1e-6, 'standard error of the intercept');
near(ols.r2, 0.7, 1e-12, 'r squared');
assert.strictEqual(ols.dof, 2);
near(ols.k, 4.303, 1e-3, 'k for 2 degrees of freedom');

// A perfect line comes back exactly, with no residual scatter left over
const clean = P.fitLine([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]);
near(clean.slope, 2, 1e-12, 'perfect slope');
near(clean.intercept, 0, 1e-12, 'perfect intercept');
near(clean.r2, 1, 1e-12, 'perfect r squared');
near(clean.uSlope, 0, 1e-12, 'nothing left to be uncertain about');

// Equal weights must land on exactly the ordinary least squares answer
const equalW = P.fitLine([{ x: 1, y: 6, uy: 1 }, { x: 2, y: 5, uy: 1 },
                          { x: 3, y: 7, uy: 1 }, { x: 4, y: 10, uy: 1 }]);
assert.strictEqual(equalW.weighted, true);
near(equalW.slope, 1.4, 1e-12, 'equal weights match OLS');
near(equalW.intercept, 3.5, 1e-12, 'equal weights match OLS intercept');
// with uy = 1 everywhere: Sw = 4, Swxx = 30, delta = 4*30 - 100 = 20
near(equalW.uSlope, Math.sqrt(4 / 20), 1e-12, 'u_m = sqrt(Sw/delta)');
near(equalW.uIntercept, Math.sqrt(30 / 20), 1e-12, 'u_b = sqrt(Swxx/delta)');
near(equalW.chi2, 4.2, 1e-9, 'chi square with unit weights is the SSE');
near(equalW.redChi2, 2.1, 1e-9, 'reduced chi square');

// A badly measured point should stop dragging the line once it is weighted down
const outlier = [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }, { x: 4, y: 20 }];
const unweighted = P.fitLine(outlier);
const downweighted = P.fitLine(outlier.map((p, i) =>
  Object.assign({}, p, { uy: i === 3 ? 10 : 0.01 })));
assert.ok(Math.abs(downweighted.slope - 2) < Math.abs(unweighted.slope - 2),
  'weighting the bad point down should pull the slope back toward 2');
near(downweighted.slope, 2, 0.05, 'weighted slope');

// x uncertainty widens the slope uncertainty through the effective variance
const noXu = P.fitLine([{ x: 1, y: 2, uy: 0.1 }, { x: 2, y: 4, uy: 0.1 }, { x: 3, y: 6, uy: 0.1 }]);
const withXu = P.fitLine([{ x: 1, y: 2, uy: 0.1, ux: 0.5 }, { x: 2, y: 4, uy: 0.1, ux: 0.5 },
                          { x: 3, y: 6, uy: 0.1, ux: 0.5 }]);
assert.ok(withXu.uSlope > noXu.uSlope, 'uncertainty in x has to show up in the slope');

assert.strictEqual(P.fitLine([{ x: 1, y: 1 }]).ok, false, 'one point is not a line');
assert.strictEqual(P.fitLine([{ x: 2, y: 1 }, { x: 2, y: 5 }]).ok, false, 'a vertical line is not a fit');

/* --------------------------------------------------------- agreement check */

// 4.68 ± 0.05 against a 4.7 ± 0.24 resistor: they overlap comfortably
const agree = P.consistency(4.68, 0.05, 4.7, 0.235);
assert.strictEqual(agree.agrees, true);
near(agree.En, 0.02 / Math.sqrt(0.05 * 0.05 + 0.235 * 0.235), 1e-9, 'normalised error');
near(agree.percentError, -0.42553, 1e-4, 'percent error');

// same gap, far tighter uncertainties: now it does not agree
const clash = P.consistency(4.68, 0.001, 4.7, 0.002);
assert.strictEqual(clash.agrees, false);
assert.ok(clash.En > 1);

assert.strictEqual(P.consistency(5, 0, 5, 0).agrees, true, 'exactly equal with no uncertainty agrees');
assert.strictEqual(P.consistency(5, 0, 6, 0).En, Infinity, 'different with no uncertainty never agrees');

console.log('core: all checks passed');
