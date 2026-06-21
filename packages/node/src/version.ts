/**
 * Single source of truth for the SDK version reported in the User-Agent
 * header. **Keep this in sync with `package.json#version`** when bumping.
 *
 * Hardcoded rather than imported from package.json so that the build does
 * not bundle the entire package.json blob (with dev/test config) into the
 * production output.
 */
export const SDK_VERSION = '1.1.0';
