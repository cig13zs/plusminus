/* plusminus core: instrument readings -> a measurement you can report.
   No dependencies, no network, no eval. Shared by the web app and the tests. */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- parser */

  /* eval() would be four lines instead of two hundred. It also runs whatever
     the page hands it, and this page is public, so the expression gets parsed
     properly and evaluated over a fixed function table. */

  var FUNCS = {
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    ln: Math.log, log: function (x) { return Math.log(x) / Math.LN10; },
    log10: function (x) { return Math.log(x) / Math.LN10; },
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh
  };
  var CONSTS = { pi: Math.PI, e: Math.E };

  function tokenize(src) {
    var out = [], i = 0, s = String(src);
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(s.slice(i));
        if (!m) throw new Error('bad number at position ' + i);
        out.push({ t: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var w = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i))[0];
        out.push({ t: 'name', v: w });
        i += w.length;
        continue;
      }
      if ('+-*/^(),'.indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      // ** is how a lot of people type a power
      throw new Error('character "' + c + '" does not belong in a formula');
    }
    return out;
  }

  // precedence climbing; ^ binds tighter than * / and is right-associative
  var BIN = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

  function parse(src) {
    var toks = tokenize(src.replace(/\*\*/g, '^')), pos = 0;

    function peek() { return toks[pos]; }
    function take(t) {
      var k = toks[pos];
      if (!k || (t && k.t !== t)) throw new Error('expected ' + (t || 'something') + ' in the formula');
      pos++;
      return k;
    }

    function primary() {
      var k = peek();
      if (!k) throw new Error('the formula ends too early');
      if (k.t === 'num') { take(); return { k: 'num', v: k.v }; }
      if (k.t === '-') { take(); return { k: 'neg', a: unary() }; }
      if (k.t === '+') { take(); return unary(); }
      if (k.t === '(') {
        take('(');
        var e = expr(0);
        take(')');
        return e;
      }
      if (k.t === 'name') {
        take();
        if (peek() && peek().t === '(') {
          take('(');
          var args = [];
          if (peek() && peek().t !== ')') {
            args.push(expr(0));
            while (peek() && peek().t === ',') { take(','); args.push(expr(0)); }
          }
          take(')');
          if (!FUNCS[k.v]) throw new Error('unknown function "' + k.v + '"');
          if (args.length !== 1) throw new Error(k.v + '() takes one value');
          return { k: 'call', f: k.v, a: args[0] };
        }
        if (CONSTS[k.v] !== undefined) return { k: 'num', v: CONSTS[k.v] };
        return { k: 'var', n: k.v };
      }
      throw new Error('unexpected "' + (k.v !== undefined ? k.v : k.t) + '"');
    }

    function unary() { return primary(); }

    function expr(min) {
      var left = unary();
      for (;;) {
        var k = peek();
        if (!k || BIN[k.t] === undefined || BIN[k.t] < min) return left;
        var op = k.t;
        take();
        var next = op === '^' ? BIN[op] : BIN[op] + 1;   // ^ is right-associative
        left = { k: 'bin', op: op, a: left, b: expr(next) };
      }
    }

    var ast = expr(0);
    if (pos !== toks.length) throw new Error('there is leftover text after the formula');
    return ast;
  }

  function evaluate(ast, vars) {
    switch (ast.k) {
      case 'num': return ast.v;
      case 'var':
        if (!(ast.n in vars)) throw new Error('no value given for "' + ast.n + '"');
        return vars[ast.n];
      case 'neg': return -evaluate(ast.a, vars);
      case 'call': return FUNCS[ast.f](evaluate(ast.a, vars));
      case 'bin': {
        var a = evaluate(ast.a, vars), b = evaluate(ast.b, vars);
        if (ast.op === '+') return a + b;
        if (ast.op === '-') return a - b;
        if (ast.op === '*') return a * b;
        if (ast.op === '/') return a / b;
        return Math.pow(a, b);
      }
    }
    throw new Error('cannot evaluate this formula');
  }

  function symbolsOf(ast, into) {
    var set = into || [];
    if (ast.k === 'var') { if (set.indexOf(ast.n) < 0) set.push(ast.n); }
    else if (ast.k === 'neg' || ast.k === 'call') symbolsOf(ast.a, set);
    else if (ast.k === 'bin') { symbolsOf(ast.a, set); symbolsOf(ast.b, set); }
    return set;
  }

  /* Sensitivity coefficient df/dx, central difference. Symbolic differentiation
     would be exact but only for the operators it knows; this works for anything
     the parser accepts. Step is relative so it holds up at 1e-9 and at 1e9. */
  function sensitivity(ast, vars, name) {
    var x = vars[name];
    var h = (Math.abs(x) > 0 ? Math.abs(x) : 1) * 1e-6;
    var up = {}, dn = {}, k;
    for (k in vars) { up[k] = vars[k]; dn[k] = vars[k]; }
    up[name] = x + h;
    dn[name] = x - h;
    return (evaluate(ast, up) - evaluate(ast, dn)) / (2 * h);
  }

  /* ------------------------------------------------------- uncertainty types */

  /* A "±(a% of reading + b counts)" specification gives a bound under the
     manufacturer's stated conditions, not a standard deviation. When only the
     bounds are known, this model can treat the error as rectangular, giving a
     standard uncertainty of halfWidth/sqrt(3). */
  var DIVISOR = { rectangular: Math.sqrt(3), triangular: Math.sqrt(6), normal95: 2, normal99: 2.576, standard: 1 };

  function specHalfWidth(spec) {
    var pct = Number(spec.percent) || 0;
    var counts = Number(spec.counts) || 0;
    var res = Number(spec.resolution) || 0;
    return Math.abs(Number(spec.reading) || 0) * pct / 100 + counts * res;
  }

  function fromSpec(spec) {
    var a = specHalfWidth(spec);
    var shape = spec.shape || 'rectangular';
    return { halfWidth: a, shape: shape, u: a / DIVISOR[shape], dof: Infinity };
  }

  /* This model treats display quantization error as rectangular over ±step/2,
     giving a standard uncertainty of step/sqrt(12). */
  function fromResolution(step) {
    var a = Math.abs(Number(step) || 0) / 2;
    return { halfWidth: a, shape: 'rectangular', u: a / Math.sqrt(3), dof: Infinity };
  }

  // Type A: repeated readings. u is the standard error of the mean, dof = n-1.
  function fromRepeats(values) {
    var xs = (values || []).map(Number).filter(function (v) { return isFinite(v); });
    var n = xs.length;
    if (n === 0) return { n: 0, mean: NaN, sd: NaN, u: NaN, dof: 0 };
    var mean = xs.reduce(function (a, b) { return a + b; }, 0) / n;
    if (n === 1) return { n: 1, mean: mean, sd: 0, u: 0, dof: 0, only: true };
    var ss = xs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0);
    var sd = Math.sqrt(ss / (n - 1));
    return { n: n, mean: mean, sd: sd, u: sd / Math.sqrt(n), dof: n - 1 };
  }

  /* Student t, two sided, 95%. Table where it matters, interpolated in 1/dof
     between the listed rows because t is close to linear in 1/dof. */
  var T95 = [[1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447],
             [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228], [11, 2.201], [12, 2.179],
             [13, 2.160], [14, 2.145], [15, 2.131], [16, 2.120], [17, 2.110], [18, 2.101],
             [19, 2.093], [20, 2.086], [25, 2.060], [30, 2.042], [40, 2.021], [50, 2.009],
             [60, 2.000], [80, 1.990], [100, 1.984], [1e9, 1.960]];

  function tFactor(dof) {
    if (!isFinite(dof) || dof >= 1e9) return 1.960;
    if (dof < 1) return T95[0][1];
    for (var i = 0; i < T95.length - 1; i++) {
      var lo = T95[i], hi = T95[i + 1];
      if (dof === lo[0]) return lo[1];
      if (dof < hi[0]) {
        var f = (1 / dof - 1 / lo[0]) / (1 / hi[0] - 1 / lo[0]);
        return lo[1] + f * (hi[1] - lo[1]);
      }
    }
    return 1.960;
  }

  /* --------------------------------------------------------------- combining */

  /* components: [{name, value, u, dof}] against a formula.
     Returns the value, the combined standard uncertainty, the expanded
     uncertainty, and every input's share of the variance. */
  function propagate(formula, inputs, opts) {
    var options = opts || {};
    var ast = typeof formula === 'string' ? parse(formula) : formula;
    var vars = {}, i;
    for (i = 0; i < inputs.length; i++) vars[inputs[i].name] = Number(inputs[i].value);

    var need = symbolsOf(ast);
    for (i = 0; i < need.length; i++) {
      if (!(need[i] in vars)) throw new Error('no value given for "' + need[i] + '"');
    }

    var value = evaluate(ast, vars);
    if (!isFinite(value)) throw new Error('the formula does not produce a number with these values');

    var terms = [], varianceSum = 0;
    for (i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var used = need.indexOf(inp.name) >= 0;
      var c = used ? sensitivity(ast, vars, inp.name) : 0;
      var u = Math.abs(Number(inp.u) || 0);
      var contrib = c * u;
      varianceSum += contrib * contrib;
      terms.push({
        name: inp.name, value: Number(inp.value), u: u, used: used,
        sensitivity: c, contribution: Math.abs(contrib),
        dof: inp.dof === undefined ? Infinity : inp.dof
      });
    }

    var uc = Math.sqrt(varianceSum);

    // Welch-Satterthwaite: how many degrees of freedom the combination really has
    var dofEff = Infinity;
    if (uc > 0) {
      var denom = 0;
      for (i = 0; i < terms.length; i++) {
        var t = terms[i];
        if (!isFinite(t.dof) || t.dof <= 0) continue;
        denom += Math.pow(t.contribution, 4) / t.dof;
      }
      dofEff = denom > 0 ? Math.pow(uc, 4) / denom : Infinity;
    }

    var k = options.k || tFactor(dofEff);
    for (i = 0; i < terms.length; i++) {
      terms[i].share = varianceSum > 0 ? (terms[i].contribution * terms[i].contribution) / varianceSum : 0;
    }
    terms.sort(function (a, b) { return b.share - a.share; });

    return {
      value: value, uc: uc, k: k, U: k * uc,
      dofEff: dofEff,
      relative: value !== 0 ? (k * uc) / Math.abs(value) : NaN,
      terms: terms
    };
  }

  /* ------------------------------------------------------------- reporting */

  function decimalsFor(u, sig) {
    if (!(u > 0) || !isFinite(u)) return 0;
    var mag = Math.floor(Math.log(u) / Math.LN10);
    return Math.max(0, -(mag - (sig - 1)));
  }

  /* Round the uncertainty first, then bring the value to the same decimal place
     so the value and its uncertainty use a consistent reporting precision. */
  function report(value, U, opts) {
    var options = opts || {};
    var sig = options.sigFigs === 1 ? 1 : 2;
    if (!(U > 0) || !isFinite(U) || !isFinite(value)) {
      return { value: String(value), U: String(U), text: value + ' ± ' + U, decimals: 0 };
    }
    var mag = Math.floor(Math.log(U) / Math.LN10);
    var step = Math.pow(10, mag - (sig - 1));
    var Ur = Math.round(U / step) * step;
    // 0.0996 rounds to 0.10 and gains a digit; recompute so the value follows it
    var mag2 = Math.floor(Math.log(Ur) / Math.LN10);
    if (mag2 !== mag) step = Math.pow(10, mag2 - (sig - 1));
    var dec = Math.max(0, -Math.floor(Math.log(step) / Math.LN10 + 1e-9));
    var vr = Math.round(value / step) * step;
    var unit = options.unit ? ' ' + options.unit : '';
    return {
      value: vr.toFixed(dec),
      U: Ur.toFixed(dec),
      decimals: dec,
      text: vr.toFixed(dec) + ' ± ' + Ur.toFixed(dec) + unit
    };
  }

  var PREFIX = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
                [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];

  // Engineering notation for the value and its uncertainty together, so the pair
  // never ends up on two different scales.
  function engineering(value, U, unit) {
    var mag = Math.abs(value) || Math.abs(U);
    var chosen = PREFIX[PREFIX.length - 1];
    for (var i = 0; i < PREFIX.length; i++) {
      if (mag >= PREFIX[i][0]) { chosen = PREFIX[i]; break; }
    }
    if (!(mag > 0)) chosen = [1, ''];
    return { scale: chosen[0], prefix: chosen[1], unit: chosen[1] + (unit || '') };
  }

  /* --------------------------------------------------------- straight line */

  /* Weighted least squares. Each point is weighted by 1/u_y^2, so a reading you
     trust pulls the line harder than one you don't, which is the whole reason
     for carrying uncertainties through a lab in the first place.

     Uncertainty in x is folded in through the effective variance
     u_eff^2 = u_y^2 + (m u_x)^2. That needs the slope, which needs the weights,
     so it runs once on an unweighted slope and then again on the real one.

     With no uncertainties at all it falls back to ordinary least squares and
     takes the uncertainty from the scatter of the residuals instead. */
  function fitLine(points, opts) {
    var options = opts || {};
    var pts = (points || []).filter(function (p) {
      return isFinite(p.x) && isFinite(p.y);
    });
    var n = pts.length;
    if (n < 2) return { n: n, ok: false, reason: 'two points are the minimum for a line' };

    var anyU = pts.some(function (p) { return Number(p.uy) > 0 || Number(p.ux) > 0; });
    var weighted = anyU && options.weighted !== false;

    function solve(slopeGuess) {
      var Sw = 0, Swx = 0, Swy = 0, Swxx = 0, Swxy = 0, i, w;
      for (i = 0; i < n; i++) {
        var p = pts[i];
        if (weighted) {
          var uy = Number(p.uy) || 0;
          var ux = Number(p.ux) || 0;
          var ueff2 = uy * uy + slopeGuess * slopeGuess * ux * ux;
          w = ueff2 > 0 ? 1 / ueff2 : 0;
          if (!isFinite(w) || w === 0) w = 0;
        } else { w = 1; }
        Sw += w; Swx += w * p.x; Swy += w * p.y;
        Swxx += w * p.x * p.x; Swxy += w * p.x * p.y;
      }
      var delta = Sw * Swxx - Swx * Swx;
      if (!(Math.abs(delta) > 0)) return null;
      return {
        Sw: Sw, Swx: Swx, delta: delta,
        slope: (Sw * Swxy - Swx * Swy) / delta,
        intercept: (Swxx * Swy - Swx * Swxy) / delta,
        Swxx: Swxx
      };
    }

    var first = solve(0);
    if (!first) return { n: n, ok: false, reason: 'every x is the same, so there is no line to fit' };
    var s = weighted ? (solve(first.slope) || first) : first;

    // chi-square against the line, and the residual scatter for the plain case
    var chi2 = 0, sse = 0, sumY = 0, i;
    for (i = 0; i < n; i++) sumY += pts[i].y;
    var meanY = sumY / n, sst = 0;
    for (i = 0; i < n; i++) {
      var p = pts[i];
      var resid = p.y - (s.slope * p.x + s.intercept);
      sse += resid * resid;
      sst += (p.y - meanY) * (p.y - meanY);
      if (weighted) {
        var uy2 = Number(p.uy) || 0;
        var ux2 = Number(p.ux) || 0;
        var ue2 = uy2 * uy2 + s.slope * s.slope * ux2 * ux2;
        if (ue2 > 0) chi2 += (resid * resid) / ue2;
      }
    }

    var dof = n - 2;
    var uSlope, uIntercept;
    if (weighted) {
      uSlope = Math.sqrt(s.Sw / s.delta);
      uIntercept = Math.sqrt(s.Swxx / s.delta);
    } else {
      // s_y from the residuals; the classic textbook standard errors
      var sy = dof > 0 ? Math.sqrt(sse / dof) : 0;
      var Sxx = s.Swxx - (s.Swx * s.Swx) / s.Sw;
      uSlope = Sxx > 0 ? sy / Math.sqrt(Sxx) : Infinity;
      uIntercept = Sxx > 0 ? sy * Math.sqrt(1 / n + (s.Swx / s.Sw) * (s.Swx / s.Sw) / Sxx) : Infinity;
      chi2 = NaN;
    }

    return {
      n: n, ok: true, weighted: weighted,
      slope: s.slope, uSlope: uSlope,
      intercept: s.intercept, uIntercept: uIntercept,
      dof: dof,
      chi2: chi2,
      redChi2: weighted && dof > 0 ? chi2 / dof : NaN,
      r2: sst > 0 ? 1 - sse / sst : NaN,
      k: tFactor(dof)
    };
  }

  /* Does a measurement agree with a reference? The normalised error compares the
     gap against the uncertainty of both sides at once. Under 1 they agree; over
     1 something is off, and that sentence is the conclusion of the report. */
  function consistency(a, Ua, b, Ub) {
    var spread = Math.sqrt((Ua || 0) * (Ua || 0) + (Ub || 0) * (Ub || 0));
    var gap = Math.abs(a - b);
    var En = spread > 0 ? gap / spread : (gap === 0 ? 0 : Infinity);
    return {
      gap: gap, En: En, agrees: En <= 1,
      percentError: b !== 0 ? ((a - b) / Math.abs(b)) * 100 : NaN
    };
  }

  root.PlusMinus = {
    fitLine: fitLine,
    consistency: consistency,
    parse: parse,
    evaluate: evaluate,
    symbolsOf: symbolsOf,
    sensitivity: sensitivity,
    specHalfWidth: specHalfWidth,
    fromSpec: fromSpec,
    fromResolution: fromResolution,
    fromRepeats: fromRepeats,
    tFactor: tFactor,
    propagate: propagate,
    report: report,
    engineering: engineering,
    DIVISOR: DIVISOR
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.PlusMinus;
