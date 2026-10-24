# Plusminus

Turn what your instrument shows into a measurement you can hand in. Type the
accuracy line from your meter's manual, type your formula, and get the value,
the uncertainty, the coverage factor, and a budget table showing which
measurement is costing you the most.

[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/jju1s)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/cig13zs/plusminus/test.yml?style=flat-square&label=tests)](https://github.com/cig13zs/plusminus/actions)

Web app: **[cig13zs.github.io/plusminus](https://cig13zs.github.io/plusminus/)**

## The workflow this covers

Many lab manuals give a multimeter's accuracy as `±(a% of reading + b counts)`,
while the report expects a result such as `R = 10.00 ± 0.15 Ω`. References and
full metrology packages explain or calculate parts of that process. Plusminus
keeps the common student workflow in one small page: enter the instrument spec,
add repeatability and resolution, propagate the inputs through a formula, and
inspect the resulting budget.

It is intentionally narrower than a general metrology package and more specific
than a significant-figure calculator or unit converter.

## What it does

| Step | What happens |
|---|---|
| Instrument spec | `0.5% of 5.000 V + 2 counts × 0.001 V` becomes a limit of ±0.027 V |
| Distribution | A limit from a manual is rectangular, so `u = 0.027 / √3 = 0.0156 V` |
| Repeated readings | Mean, sample standard deviation, `u = s/√n`, and `n−1` degrees of freedom |
| Display resolution | Half a step, rectangular again |
| Propagation | `∂f/∂x` per input, combined as the root of summed squares |
| Coverage | Student's t at 95% on the Welch–Satterthwaite effective degrees of freedom |
| Rounding | Uncertainty to two figures, then the value moved to match it |

The budget table sorts your inputs by their share of the variance, so you can
see whether a better meter would help or whether one measurement is carrying
the whole error.

## A modelling choice that matters

An accuracy specification gives a bounded error under the conditions stated by
the manufacturer; it is not itself a standard deviation. When only the bounds
are known and a rectangular distribution is appropriate, this tool uses
`u = a / √3`. Treating the bound `a` as a standard uncertainty instead makes
that component √3 times larger.

If a calibration certificate reports an expanded uncertainty, choose
"expanded, from a certificate" and type the coverage factor it states, so
`u = U / k`. That works for an instrument spec and for a ± you already know.
`k = 2` is the usual value; certificates with few degrees of freedom print
others, such as 2.03 or 2.52.

## Formulas

`+ - * / ^ ( )` with `sqrt ln log exp sin cos tan asin acos atan sinh cosh
tanh abs`, the constants `pi` and `e`, and any symbols you name. `**` works as
a power if that is how you type.

There is no `eval` anywhere in this. Expressions are tokenised and parsed, then
evaluated against a fixed function table, because the page is public and
`eval` would run whatever it was handed.

Sensitivity coefficients are computed numerically with a central difference on a
relative step, so a formula the parser accepts is a formula it can propagate,
without a symbolic differentiation table to keep in sync.

## Limits

- It does not check units. Every value and uncertainty for one quantity has to
  be in the same unit; the unit box is a label printed with the answer.
- It assumes the inputs are independent and omits covariance terms. Correlation
  can make the combined uncertainty higher or lower.
- There is no instrument database, on purpose. A spec depends on range,
  function, temperature and time since calibration, so it comes from your
  manual, not from a table someone typed once.
- It reports precision, not correctness. A wired-wrong experiment produces a
  confident, tight, wrong answer.

## Offline and private

One HTML file plus `core.js`. No build step, no dependencies, no analytics, no
storage, no network requests. Download both files into the same folder and the
tool works without a connection. Open the network tab and watch it stay empty.

## Tests

```bash
node core.test.js   # the maths
node boot.test.js   # the page loads, computes its example, and fails out loud
```

No dependencies either way. The expected numbers are worked examples rather
than snapshots of whatever the code returned first. The Fluke 115 case is
checked against its published DC volts specification of ±(0.5% + 2 counts), and
the reporting cases check the documented rounding convention.

`boot.test.js` exists because maths that is correct and never called still looks
like a finished form that does nothing. It runs the page script against a hand
stub and asserts the shipped example comes out at `R = 10.00 ± 0.19 Ω`.

## Sources

- Fluke 114/115/116/117 extended specifications, DC volts accuracy
  ([PDF](https://dam-assets.fluke.com/s3fs-public/2793260_6116_ENG_A_W.PDF))
- JCGM 100, *Evaluation of measurement data: Guide to the expression of
  uncertainty in measurement*, sections on Type A/B evaluation, the law of
  propagation, and expanded uncertainty
  ([ISO](https://www.iso.org/sites/JCGM/GUM/JCGM100/C045315e-html/C045315e_FILES/MAIN_C045315e/06_e.html))
- Kwantlen Polytechnic University, digital multimeter uncertainties
  ([page](https://www.kpu.ca/physics/Phys1102-1220/DMMUncertainties))

## License

MIT.
