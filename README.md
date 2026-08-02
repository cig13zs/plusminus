# Plusminus

Turn what your instrument shows into a measurement you can hand in. Type the
accuracy line from your meter's manual, type your formula, and get the value,
the uncertainty, the coverage factor, and a budget table showing which
measurement is costing you the most.

[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/jju1s)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/cig13zs/plusminus/test.yml?style=flat-square&label=tests)](https://github.com/cig13zs/plusminus/actions)

Web app: **[cig13zs.github.io/plusminus](https://cig13zs.github.io/plusminus/)**

## The gap this fills

Every lab manual tells you a multimeter's accuracy is `±(a% of reading + b
counts)`. Every lab report wants a result written as `R = 10.00 ± 0.15 Ω`. The
route between those two is four steps of arithmetic that no tool does for you.
Search for it and you get university PDFs, a Fluke application note, and an NI
support page, all of which explain how to do it by hand.

There are plenty of significant-figure calculators and plenty of unit
converters. None of them start from an instrument spec, and none of them show
you the budget at the end.

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

## The mistake it exists to stop

An accuracy spec is a limit the manufacturer promises you stay inside. It is
not a standard deviation. Feeding the raw ±0.027 V into a propagation formula
overstates the uncertainty by about 73%, because the right move is to divide by
√3 first. That single division is the difference between a budget that means
something and one that just looks careful.

If you have a calibration certificate rather than a manual, it usually quotes an
expanded uncertainty at k = 2, so the divisor is 2. There is an option for that.

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
- It assumes your inputs are independent. Two readings from the same meter on
  the same range are correlated, and the true uncertainty is then slightly
  larger than what you see here.
- There is no instrument database, on purpose. A spec depends on range,
  function, temperature and time since calibration, so it comes from your
  manual, not from a table someone typed once.
- It reports precision, not correctness. A wired-wrong experiment produces a
  confident, tight, wrong answer.

## Offline and private

One HTML file plus `core.js`. No build step, no dependencies, no analytics, no
storage, no network requests. Save the page and it still works. Open the network
tab and watch it stay empty.

## Tests

```bash
node core.test.js   # the maths
node boot.test.js   # the page loads, computes its example, and fails out loud
```

No dependencies either way. The expected numbers are worked examples, not
whatever the code returned first: the Fluke 115 case is checked against its
published DC volts spec of ±(0.5% + 2 counts), and the reporting cases against
the rounding rules lab rubrics mark on.

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
