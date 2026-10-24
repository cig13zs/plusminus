# Changelog

## Unreleased

### Added

- Expanded uncertainties from a calibration certificate take the coverage factor the certificate states, not only `k = 2`. The choice is there for an instrument spec and for a ± you type in, which used to be treated as a standard uncertainty only. A k that isn't a positive number is flagged on its row instead of counting as zero.

## 2026-08-23

Instrument spec, repeated readings, display resolution and known ± inputs; propagation through a typed formula with Welch-Satterthwaite degrees of freedom and Student's t; an uncertainty budget; copy as text, LaTeX or a Markdown budget table.
