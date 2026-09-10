# LAST

An unofficial, community-built project. Not affiliated with, endorsed by or supported by Anthropic.
"Claude" and "Claude Code" are trademarks of Anthropic.

A local web app that lists every Claude Code session on your machine and lets you keep chatting in
any of them from the browser.

It reads the transcripts your terminal already writes (`~/.claude/projects/**/*.jsonl`) and continues
a session through the Claude Agent SDK, so a reply you send here shows up the next time you run
`claude --resume` in that project.

## Read this before you run it

There is no login and no token. Anything that can open a TCP connection to `127.0.0.1:4123` has your
whole Claude Code history and can run Bash on your machine as you.

The `Host` allowlist in `src/proxy.ts` stops remote hosts and stops web pages in your browser. It
does not stop another local process, and it does not stop another logged-in user.

So: do not run LAST on a shared or multi-user machine. Do not port-forward or tunnel port 4123, and
check whether your editor forwards ports automatically.

## Requirements

- Node.js 20.9 or newer. `package.json` declares `"engines": { "node": ">=20.9.0" }`; the floor comes
  from Next.js 16
- macOS and Linux. Windows is untested
- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and signed in. The app reuses
  your existing CLI credentials, so there is no API key to configure
- An internet connection for the first build. `next/font/google` fetches the fonts at compile time
  and caches them afterwards

## Run it

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:4123.

You need at least one Claude Code session already on disk. The server only accepts new chats in a
directory it has seen a session for, so run `claude` once in a project before opening it here.

For a production-style run:

```bash
npm run build
npm start
```

## Stopping it

Press Ctrl-C in the terminal running `npm run dev`. To confirm nothing is still listening, run
`npm run check-bind`.

## What you get

- Your 300 most recent sessions, grouped by project, newest first, with git branch and relative time
- Full transcript replay: markdown, syntax-highlighted code, tool calls, thinking blocks
- Realtime. Keep a session open in the browser, keep working in the terminal, and the page follows
  along on its own with no refresh
- Live streaming replies with token, cost and duration stats per turn
- Permission prompts in the browser: allow once, allow for the session, or deny
- A permission mode picker in the composer: Ask before changes, Auto-accept edits, Plan only
- Model and effort pickers, light / dark / system theme
- `⌘K / Ctrl-K` session palette, `⌘B / Ctrl-B` sidebar, `Esc` to stop a running turn

## Where your data lives

It reads `~/.claude/projects/**/*.jsonl`, or `$CLAUDE_CONFIG_DIR/projects` when that variable is set.
New turns are appended by Claude Code to the same transcript file your terminal uses.

Outside of that it writes nothing but your browser's `localStorage`:

| Key                 | What it holds                    |
| ------------------- | -------------------------------- |
| `last:model`        | Selected model                   |
| `last:effort`       | Selected effort                  |
| `last:drafts`       | Unsent composer text per session |
| `last-mode`         | Theme mode (MUI)                 |
| `last-color-scheme` | Resolved colour scheme (MUI)     |

## What it never does

No telemetry. No analytics. No server-side database. No account. No network calls except the Claude
API reached through your CLI credentials.

## Security

There is no authentication, by design. Read the section at the top of this file first, then this.

**Permission modes.** You pick the mode in the composer and it applies to that turn.

- **Ask before changes** is the default. Tools stop and ask you in the browser
- **Auto-accept edits** lets the agent write and edit files with no prompt
- **Plan only** means it cannot act at all

**No settings files are loaded by default.** LAST reads `LAST_SETTING_SOURCES`, a comma separated
list of `user`, `project` and `local`. It is empty by default. Out of the box the app loads no
`~/.claude/settings.json`, no `<cwd>/.claude/settings.json` and no `.claude/settings.local.json`, so
every tool call reaches the browser permission prompt.

That is the safe default, and here is the trade-off: your project instruction files are not loaded
either. `CLAUDE.md` and `AGENTS.md` are read for a run only when you opt in.

Set `LAST_SETTING_SOURCES=project` to opt back in. That loads the project's `.claude/settings.json`,
which is also what loads `CLAUDE.md` and `AGENTS.md`. Setting
`LAST_SETTING_SOURCES=user,project,local` restores full CLI parity. Once a settings file is loaded,
allow rules in it are applied by the SDK before the browser prompt ever appears, so anything on your
allow list runs with no prompt, and hooks in those files execute too.

**Network surface.** The server binds `127.0.0.1` only. `src/proxy.ts` runs on page and API requests
(`/_next/static` and the favicon are exempt from the matcher) and rejects any request whose `Host`
is not the loopback host on the current port. The port comes from `process.env.PORT` and falls back
to `4123`; IPv6 loopback (`[::1]`) is allowed too. API routes get stricter treatment: `OPTIONS` is
refused, the `Sec-Fetch-Site`, `Sec-Fetch-Mode` and `Sec-Fetch-Dest` headers must be present and
correct so the checks fail closed, and unsafe methods also need a matching `Origin` and a JSON
content type. Page responses carry a nonce-based Content Security Policy, and the image optimizer
is turned off.

For how to report a problem, see [SECURITY.md](SECURITY.md).

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

## Fonts

Body text is [Google Sans](https://fonts.google.com/specimen/Google+Sans); monospace is Google Sans
Code. Google Sans Code is under the SIL Open Font License. Google Sans is served by the Google Fonts
API but is not in the open-licence catalogue. There is no `ofl/googlesans` entry in the
`google/fonts` repository. It is downloaded at build time into the gitignored `.next` directory, and
nothing is redistributed by this repository. If you need a fully open font stack, swap the body face.

## Layout

| Path             | What lives there                                                |
| ---------------- | --------------------------------------------------------------- |
| `src/lib`        | Shared types, zod schemas, formatters, HTTP helpers             |
| `src/server`     | Transcript parsing, the session registry, the file watcher, SSE |
| `src/client`     | Browser-side stores and hooks                                   |
| `src/app/api`    | Route handlers                                                  |
| `src/components` | UI, one CSS module per component                                |
| `src/theme.ts`   | The MUI theme, both colour schemes                              |

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

## Troubleshooting

- **The sidebar is empty.** There are no transcripts under that path. Run `claude` once in a project,
  then reload
- **Port already in use.** Run `npm run check-bind` to see what is holding 4123

## Third-party software

LAST depends on `@anthropic-ai/claude-agent-sdk`. That package is proprietary to Anthropic PBC
("(c) Anthropic PBC. All rights reserved"). It is **not** covered by LAST's licence, it is fetched
from npm, and it is governed by Anthropic's own terms. Installing it downloads a large platform
binary, and the SDK carries its own bundled Claude Code build. For the exact version LAST installs,
see `package.json`. LAST reuses your existing Claude Code credentials and spends your credits.

`npm install` runs one postinstall script: `unrs-resolver`, a dev-only transitive dependency of
`eslint-config-next`.

UI ideas were inspired by [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui). No code
was copied from it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and house style, and
[SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability privately.

## Disclaimer

This is an unofficial, community-built project. It is not affiliated with, endorsed by or supported
by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic. LAST is provided as is, with no
warranty of any kind. You are responsible for what the agent does on your machine.

## License

[Apache-2.0](LICENSE).
