# wfr-host-astro

Reference [Astro](https://astro.build) host for [web-file-reader](https://github.com/igor-ganov/web-file-reader). Demonstrates the full system and serves as the integration/perf/a11y target.

## What it shows

- A **file grid** (`@web-file-reader/file-grid`) of sample files.
- Opening a file routes to `/viewer/[fileId]` and shows a **modal `<dialog>`** containing `@web-file-reader/viewer` — a dialog **with a real URL change**.
- **Normal + fullscreen** modes; single- and multi-page output scroll in both.
- **Paging between files** via `@web-file-reader/navigation` (arrow keys, hover/tap/focus auto-hiding controls) — each move is a route change animated by Astro **View Transitions**.
- **Per-provider settings** (`@web-file-reader/settings`) persisted to `localStorage`.
- All four providers registered **lazily**: Markdown, Image, PDF, CSV. Renderer code downloads only when a matching file is first opened.

## Run

```bash
bun install                    # from the monorepo root
bun run --filter '@web-file-reader/*' build   # build the libraries first
bun run --filter wfr-host-astro dev           # http://localhost:4321
```

`bun run --filter wfr-host-astro build` produces a static site in `dist/`.

## Architecture

- `src/lib/files.ts` — sample `FileDescriptor`s (sources in `public/samples`).
- `src/lib/registry.ts` — shared `ProviderRegistry`; imports only the light provider descriptors.
- `src/lib/setup-viewer.ts` — wires the dialog, paging, fullscreen and settings on each `astro:page-load`.
- `src/lib/settings-store.ts` — `localStorage` persistence via the core serializers.
- `src/components/Grid.astro` — the grid, persisted across navigations with `transition:persist`.
- `src/pages/viewer/[fileId].astro` — one static route per file; the dialog carries `transition:name` so file-to-file paging morphs.

## License

MIT © Igor Ganov
