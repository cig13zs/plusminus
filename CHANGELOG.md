# Changelog

## Unreleased

### Added

- A reload keeps your inputs, and "Copy a link to this calculation" copies a link that reopens the same formula, readings and settings. Everything sits in the address after `#c=`, which never reaches a server; a damaged or edited link falls back to the example instead of breaking the page.
- Expanded uncertainties from a calibration certificate take the coverage factor the certificate states, not only `k = 2`. The choice is there for an instrument spec and for a ± you type in, which used to be treated as a standard uncertainty only. A k that isn't a positive number is flagged on its row instead of counting as zero.

## 2026-08-23

Instrument spec, repeated readings, display resolution and known ± inputs; propagation through a typed formula with Welch-Satterthwaite degrees of freedom and Student's t; an uncertainty budget; copy as text, LaTeX or a Markdown budget table.
