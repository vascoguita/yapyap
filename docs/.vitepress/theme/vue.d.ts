// Lets TypeScript import the theme's single-file components, which Vite compiles.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
