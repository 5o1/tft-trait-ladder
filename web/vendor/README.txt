highs-js (npm package highs) 1.15.4, embedding HiGHS 1.15.1 (04024d7)
Source: https://registry.npmjs.org/highs/-/highs-1.15.4.tgz
Wrapper upstream: https://github.com/lovasoa/highs-js
Solver upstream: https://github.com/ERGO-Code/HiGHS
Wrapper license: MIT (LICENSE-highs-js.txt, from package LICENSE)
Solver license: MIT (LICENSE-HiGHS.txt)
Solver license source: https://raw.githubusercontent.com/ERGO-Code/HiGHS/04024d7/LICENSE.txt

highs.js and highs.wasm are unmodified package build/ files.
The single-threaded WebAssembly runtime loads in the Web Worker; no build,
npm install, external solver service, or cross-origin isolation is needed.
All runtime assets use paths relative to the worker, including Pages subpaths.
