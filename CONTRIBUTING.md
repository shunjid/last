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

## Security

Do not report vulnerabilities in a public issue. See [SECURITY.md](SECURITY.md).

## AGENTS.md

Part of `AGENTS.md` is machine-generated. `next dev` rewrites the block between the
`BEGIN:nextjs-agent-rules` and `END:nextjs-agent-rules` markers every time it runs. Leave that block
alone. Add anything of your own below the END marker.
