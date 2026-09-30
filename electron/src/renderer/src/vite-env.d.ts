/// <reference types="vite/client" />

// Asset imports. Vite resolves these to URLs (or inlined data URLs under the
// size limit), so TypeScript needs to be told they exist.
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
