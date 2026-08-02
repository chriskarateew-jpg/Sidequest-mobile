// Wrangler's bundler resolves a `.wasm` import specifier to a compiled
// WebAssembly.Module at build time — this just tells TypeScript that shape.
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
