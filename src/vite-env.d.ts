/// <reference types="vite/client" />

/**
 * Type declarations for Vite asset imports.
 */

/** Raw WGSL shader imports */
declare module '*.wgsl?raw' {
  const content: string;
  export default content;
}

/** Raw GLSL shader imports */
declare module '*.glsl?raw' {
  const content: string;
  export default content;
}
