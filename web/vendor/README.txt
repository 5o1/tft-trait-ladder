javascript-lp-solver 1.0.3
Source: https://cdn.jsdelivr.net/npm/javascript-lp-solver@1.0.3/dist/solver.global.js
Upstream: https://github.com/JWally/jsLPSolver
License: Unlicense (see LICENSE)

Local modification: the default branch-and-cut service exposes searchComplete
when the branch heap is exhausted, or the root relaxation is integral. The UI
uses this flag to distinguish completed search from an incumbent returned on
timeout. Enhanced/experimental solver strategies are not enabled.
