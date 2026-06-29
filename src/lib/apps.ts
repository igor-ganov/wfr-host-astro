/**
 * Open-source apps published on github.com/igor-ganov over the last ~18 months.
 * Live demos are same-origin github.io deployments, so they embed in an iframe;
 * code-only projects link out. Used by the "Apps & Demos" section.
 */
export interface AppExternalLink {
  readonly label: string;
  readonly href: string;
}

export interface AppItem {
  /** Stable id (used as a DOM id / key). */
  readonly id: string;
  /** Display title. */
  readonly title: string;
  /** One-line, honest description. */
  readonly description: string;
  /** Tech tags. */
  readonly tech: readonly string[];
  /** Source repository URL. */
  readonly source: string;
  /** Live, embeddable demo URL (same-origin github.io). */
  readonly demo?: string;
  /** Extra outbound links (live bot, packages, …). */
  readonly links?: readonly AppExternalLink[];
}

const repo = (name: string): string => `https://github.com/igor-ganov/${name}`;
const pages = (name: string): string => `https://igor-ganov.github.io/${name}/`;

/** Apps with a live, embeddable demo. */
export const LIVE_DEMOS: readonly AppItem[] = [
  {
    id: 'blog',
    title: 'Engineering Blog',
    description:
      'A living knowledge base of engineering best practices, distilled from real project decisions — built with the stack it documents.',
    tech: ['Astro 5', 'Lit', 'TypeScript'],
    source: repo('blog'),
    demo: pages('blog'),
  },
  {
    id: 'pyaeats',
    title: 'PyaEats',
    description:
      'Paraguayan food-delivery design mockups — five concepts plus an interactive “Glass” prototype.',
    tech: ['Astro', 'Web Components', 'Modern CSS'],
    source: repo('pyaeats'),
    demo: pages('pyaeats'),
  },
  {
    id: 'flying-menu',
    title: 'Flying Menu',
    description:
      'A headless, draggable, corner-snapping flying menu delivered as a single Lit web component.',
    tech: ['Lit', 'Web Component', 'TypeScript'],
    source: repo('flying-menu'),
    demo: pages('flying-menu'),
  },
  {
    id: 'angular-webcomponent-routing',
    title: 'Angular ⇄ Web-Component Routing',
    description:
      'An Angular host that delegates a URL subtree to a Lit web component running its own client-side router (bun-workspaces monorepo).',
    tech: ['Angular', 'Lit', 'Navigation API'],
    source: repo('angular-webcomponent-routing'),
    demo: pages('angular-webcomponent-routing'),
    links: [
      { label: 'angular-host', href: repo('angular-host') },
      { label: 'feature-web-component', href: repo('feature-web-component') },
      { label: 'subtree-router', href: repo('subtree-router') },
    ],
  },
];

/** Apps without a public live demo (auth/backend, native, or library). */
export const MORE_PROJECTS: readonly AppItem[] = [
  {
    id: 'jira-view',
    title: 'Jira View',
    description:
      'A calm, unbreakable alternative to the Jira backlog/board UI — OAuth 2.0 (3LO), drag-and-drop, bulk status changes, full E2E.',
    tech: ['Astro 5', 'Lit', 'OAuth 2.0'],
    source: repo('jira-view'),
  },
  {
    id: 'secret-manager',
    title: 'Secret Manager',
    description:
      'A Telegram bot for sharing secrets through one-time links, with per-user secret storage and a reveal-on-POST page so previews never burn the link.',
    tech: ['TypeScript', 'Telegram Bot'],
    source: repo('secret-manager'),
    links: [{ label: 'Live bot: @secret_manager_bot', href: 'https://t.me/secret_manager_bot' }],
  },
  {
    id: 'unsubmit-prevent-reload',
    title: 'Unsaved-Form Protection',
    description:
      'Demonstrates blocking route navigation (CanDeactivate guard) and page reload/close (beforeunload) while a form has unsaved changes.',
    tech: ['Angular', 'Standalone', 'TypeScript'],
    source: repo('unsubmit-prevent-reload'),
  },
  {
    id: 'web-file-reader',
    title: 'Web File Reader',
    description:
      'The headless, slots-first Lit file-reader you are looking at right now — pluggable providers, a scroll-snap carousel viewer, Lighthouse 100.',
    tech: ['Lit', 'Astro', 'TypeScript'],
    source: repo('web-file-reader'),
  },
];
