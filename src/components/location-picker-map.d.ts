// Ambient shim so plain `tsc` can resolve the extensionless
// `@/components/location-picker-map` import. Metro's bundler already
// resolves Component.native.tsx / Component.web.tsx per platform on its
// own (built-in behavior, nothing to configure) — this file exists only
// because tsc's standalone type-checking doesn't know that convention
// without a project-wide `moduleSuffixes` setting, which was tried and
// reverted: it also changed how tsc resolves types for unrelated
// third-party packages (expo-image-manipulator, expo-file-system broke),
// a blast radius not worth it for one local file. Which concrete
// implementation gets aliased here doesn't matter for type-checking —
// both share the exact same prop contract from location-picker-map.types.
declare module '@/components/location-picker-map' {
  export { LocationPickerMap } from '@/components/location-picker-map.native';
}
