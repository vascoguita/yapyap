# Greeter: an example YapYap extension

Drafts a greeting in the open chat when you run **Extension Commands →
Greeter: Draft a greeting**, for you to edit and send. You choose the
greeting in the Extensions window. It uses a command, a settings form and the
`composer:insert-draft` capability, and nothing else.

```sh
pnpm --filter @yapyap/extension-example build   # writes dist/
```

[Writing an extension](https://yapyap.guita.org/extensions/) explains how it works and how
to sign, pack and install it.
