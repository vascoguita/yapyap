# Greeter: an example YapYap plugin

Drafts a greeting in the open chat when you run **Plugin Commands →
Greeter: Draft a greeting**, for you to edit and send. You choose the
greeting in the Plugins window. It uses a command, a settings form and the
`composer:insert-draft` capability, and nothing else.

```sh
pnpm --filter @yapyap/plugin-example build   # writes dist/
```

[Writing a plugin](https://yapyap.guita.org/plugins/) explains how it works and how
to sign, pack and install it.
