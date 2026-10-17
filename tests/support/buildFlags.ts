// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The build flags Vite substitutes at compile time (`define` in
// `vite.config.ts`), as the website build has them. A module that reads one at
// load — `src/app/storageBackends.ts`, through the sync engine — would
// otherwise throw on a bare `__NATIVE_BUILD__` under Vitest. A test about
// another build stubs the flag over these (`vi.stubGlobal`) and imports the
// module afresh; `vi.unstubAllGlobals` puts these back.

Object.assign(globalThis, {
  __NATIVE_BUILD__: false,
  __SHELL_BUILD__: false,
});
