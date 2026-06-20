# Web File Reader

A **headless**, slots-first file reader built from a series of Lit web components.

## Features

- Grid of files that open into an extensible viewer
- Normal and **fullscreen** modes — both scroll
- Pluggable, **lazy-loaded** providers (Markdown, Images, PDF, CSV)
- Per-provider settings with serialization
- Keyboard, hover, tap and focus paging
- View Transitions between files

## Code

```ts
const registry = createProviderRegistry();
registry.register(markdownDescriptor);
viewer.registry = registry;
viewer.file = file;
```

> Everything is customizable via slots, parts and custom properties.
