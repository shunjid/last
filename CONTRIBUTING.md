# Contributing

Thanks for taking a look.

## Getting started

```bash
npm ci
npm run dev
```

The app runs at http://127.0.0.1:4123.

You need at least one Claude Code session on disk before the app shows anything. Run `claude` in any
project once, then reload.

## Before you open a pull request

Run all four checks. CI runs the same four on Node 20 and Node 22.

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## House style

- No code comments and no docstrings. Anywhere. The whole codebase has none. Keep it that way.
- Prettier decides formatting. Run `npm run format` and do not argue with it.
- Styles are CSS Modules. Use the `--last-*` custom properties for colors and spacing. Do not
  hardcode values that already have a token.

## One hard rule

The `dev` and `start` scripts bind `127.0.0.1`. Never change that to `0.0.0.0`.

No pull request may add a way to expose the port. No host flag, no environment variable, no config
option, no proxy helper. LAST has no authentication, and it can run Bash as you. Binding anything
other than the loopback address turns it into a remote shell.

## Scripts

| Script                 | What it does                                          |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Dev server on 127.0.0.1:4123                          |
| `npm run build`        | Production build                                      |
| `npm start`            | Serve the build on 127.0.0.1:4123                     |
| `npm run lint`         | ESLint                                                |
| `npm run typecheck`    | `next typegen` then `tsc --noEmit`                    |
| `npm run typegen`      | Generate Next's route types                           |
| `npm run format`       | Prettier write                                        |
| `npm run format:check` | Prettier check                                        |
| `npm run check-bind`   | What is listening on 4123. macOS and Linux; uses lsof |

`typecheck` runs `typegen` first because the app uses Next's generated route types, which live in the
gitignored `.next` directory. A fresh clone has to generate them before `tsc` can pass.

`npm install` runs one postinstall script: `unrs-resolver`, a dev-only transitive dependency of
`eslint-config-next`.

## Layout

| Path             | What lives there                                                |
| ---------------- | --------------------------------------------------------------- |
| `src/lib`        | Shared types, zod schemas, formatters, HTTP helpers             |
| `src/server`     | Transcript parsing, the session registry, the file watcher, SSE |
| `src/client`     | Browser-side stores and hooks                                   |
| `src/app/api`    | Route handlers                                                  |
| `src/components` | UI, one CSS module per component                                |
| `src/theme.ts`   | The MUI theme, both colour schemes                              |

## Design

The UI is built on [MUI](https://mui.com) 9 with Emotion, and follows
[Material 3](https://m3.material.io/components) for shape, elevation, state layers and the tonal
surface roles. Colours come from the theme in `src/theme.ts`, which emits CSS variables under
`--mui-*`. `src/app/globals.css` aliases those to short `--last-*` names, and every CSS module uses
only those aliases. So a colour change lands in one file and both light and dark follow.

The split between the two files is not clean in one place, so it is worth knowing. Shadow colours are
themed (`palette.shadow.key` and `palette.shadow.ambient`), but the elevation geometry is composed in
`globals.css` as `--last-elev-1` through `--last-elev-3`, and `theme.ts` reads those back for the menu
and dialog defaults. The base corner radius is themed (`shape.borderRadius`). Everything else is a
literal value in `globals.css`: the rest of the radius scale, the state layer opacities, the durations,
the easings and the layout sizes (`--last-radius-*`, `--last-state-*`, `--last-duration-*`,
`--last-ease-*`).

The brand colour is emerald. MUI ships no emerald palette, so the scale in `src/theme.ts` is
[Tailwind's](https://tailwindcss.com/docs/colors), converted from its OKLCH values to sRGB. Light and
dark pick different steps off that one scale: the brand fill is emerald-700 on white and emerald-500
on black, because a single step cannot clear the contrast bar on both.

Theme switching goes through MUI's `useColorScheme`. The mode is stored in `localStorage` and applied
to `<html data-theme>` before hydration by `InitColorSchemeScript`, so there is no flash on reload.

Responsive layout has two breakpoints: 900px turns the sidebar into a drawer, 640px is the phone
layout. Both live in the CSS modules, and `src/client/use-media-query.ts` mirrors them for the few
places that need the value in JavaScript.

## Fonts

Body text is [Google Sans](https://fonts.google.com/specimen/Google+Sans); monospace is Google Sans
Code. Google Sans Code is under the SIL Open Font License. Google Sans is served by the Google Fonts
API but is not in the open-licence catalogue. There is no `ofl/googlesans` entry in the
`google/fonts` repository. It is downloaded at build time into the gitignored `.next` directory, and
nothing is redistributed by this repository. If you need a fully open font stack, swap the body face.

A first build needs an internet connection, because `next/font/google` fetches the fonts at compile
time. It caches them afterwards.

## Network surface

The server binds `127.0.0.1` only. `src/proxy.ts` runs on page and API requests (`/_next/static` and
the favicon are exempt from the matcher) and rejects any request whose `Host` is not the loopback
host on the current port. The port comes from `process.env.PORT` and falls back to `4123`; IPv6
loopback (`[::1]`) is allowed too.

API routes get stricter treatment: `OPTIONS` is refused, the `Sec-Fetch-Site`, `Sec-Fetch-Mode` and
`Sec-Fetch-Dest` headers must be present and correct so the checks fail closed, and unsafe methods
also need a matching `Origin` and a JSON content type. Page responses carry a nonce-based Content
Security Policy, and the image optimizer is turned off.

That `Host` allowlist stops remote hosts and stops web pages in your browser. It does not stop
another local process, and it does not stop another logged-in user. There is no authentication, by
design.

## Settings files

LAST reads `LAST_SETTING_SOURCES`, a comma separated list of `user`, `project` and `local`. It is
empty by default, so the app loads no `~/.claude/settings.json`, no `<cwd>/.claude/settings.json`
and no `.claude/settings.local.json`, and every tool call reaches the browser permission prompt.

The trade-off is that your project instruction files are not loaded either. `CLAUDE.md` and
`AGENTS.md` are read for a run only when you opt in.

`LAST_SETTING_SOURCES=project` loads the project's `.claude/settings.json`, which is also what loads
`CLAUDE.md` and `AGENTS.md`. `LAST_SETTING_SOURCES=user,project,local` restores full CLI parity.
Once a settings file is loaded, the SDK applies its allow rules before the browser prompt ever
appears, so anything on your allow list runs unprompted, and hooks in those files execute too.

## Where your data lives

LAST reads `~/.claude/projects/**/*.jsonl`, or `$CLAUDE_CONFIG_DIR/projects` when that variable is
set. New turns are appended by Claude Code to the same transcript file your terminal uses.

Outside of that it writes nothing but your browser's `localStorage`:

| Key                 | What it holds                    |
| ------------------- | -------------------------------- |
| `last:model`        | Selected model                   |
| `last:effort`       | Selected effort                  |
| `last:drafts`       | Unsent composer text per session |
| `last-mode`         | Theme mode (MUI)                 |
| `last-color-scheme` | Resolved colour scheme (MUI)     |

No telemetry. No analytics. No server-side database. No account. No network calls except the Claude
API reached through your CLI credentials.

## Troubleshooting

- **The sidebar is empty.** There are no transcripts under that path. Run `claude` once in a project,
  then reload.
- **Port already in use.** Run `npm run check-bind` to see what is holding 4123.

## Found a security problem

Do not open a public issue. Use the **Security** tab on this repository and pick **Report a
vulnerability**, which opens a private advisory.

## AGENTS.md

Part of `AGENTS.md` is machine-generated. `next dev` rewrites the block between the
`BEGIN:nextjs-agent-rules` and `END:nextjs-agent-rules` markers every time it runs. Leave that block
alone. Add anything of your own below the END marker.
