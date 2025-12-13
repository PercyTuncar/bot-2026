// Global type declarations for legacy browser context code

declare global {
  interface Window {
    WWebJS: any;
    Store: any;
  }
  
  var window: Window & typeof globalThis;
}

export {};
