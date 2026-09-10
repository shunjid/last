<h1><img src="src/app/icon.svg" width="30" height="30" alt=""> LAST</h1>

Your Claude Code sessions, in a browser tab.

LAST lists every Claude Code session on your machine and lets you keep chatting in any of them. It
reads the transcripts your terminal already writes and continues the session through the Claude Agent
SDK, so a reply you send here is waiting for you the next time you run `claude --resume`.

## What you get

- **Every session in one list.** Grouped by project, newest first, with git branch and relative time.
- **The whole conversation.** Markdown, syntax-highlighted code, tool calls and thinking blocks,
  replayed the way the terminal showed them.
- **Reply from the browser.** Same folder, same session, same Claude. The turn is appended to the
  same transcript file your terminal uses.
- **Live.** Leave a session open in the browser, keep working in the terminal, and the page follows
  along on its own. No refresh.
- **Streaming replies** with token count, cost and duration for every turn.
- **Permission prompts in the browser.** Allow once, allow for the session, or deny.
- **Permission modes** in the composer: Ask before changes, Auto-accept edits, Plan only.
- **Model and effort pickers**, and a light / dark / system theme.
- **Works on a phone.** The sidebar becomes a drawer and the whole app resizes down to a small
  screen.
- **Keyboard first.** `⌘K` session palette, `⌘B` sidebar, `Esc` stops a running turn.
- **Nothing leaves your machine.** No telemetry, no analytics, no account, no server-side database.

## Requirements

- Node.js 20.9 or newer
- macOS or Linux (Windows is untested)
- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and signed in. LAST reuses
  your existing CLI credentials, so there is no API key to set up

## Run it

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:4123.

You need one Claude Code session on disk before there is anything to show, so run `claude` in a
project once, then reload.

For a production-style run:

```bash
npm run build
npm start
```

Press Ctrl-C to stop it. `npm run check-bind` tells you what is still listening on 4123.

## Read this before you run it

There is no login and no token. Anything that can open a TCP connection to `127.0.0.1:4123` has your
whole Claude Code history and can run Bash on your machine as you.

So: do not run LAST on a shared or multi-user machine, and do not port-forward or tunnel port 4123.
Check whether your editor forwards ports for you.

Every tool call asks you first. LAST loads no Claude Code settings files by default, so nothing on
your CLI allow list runs unprompted. The trade-off is that `CLAUDE.md` and `AGENTS.md` are not
loaded either. Set `LAST_SETTING_SOURCES=project` to opt back in, or `user,project,local` for full
CLI parity.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Notes

This is an unofficial, community-built project. It is not affiliated with, endorsed by or supported
by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic. LAST is provided as is, with no
warranty. You are responsible for what the agent does on your machine.

LAST depends on `@anthropic-ai/claude-agent-sdk`, which is proprietary to Anthropic PBC and is **not**
covered by LAST's licence. It is fetched from npm under Anthropic's own terms, and it spends your
Claude credits.

UI ideas were inspired by [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui). No code
was copied from it.

## License

[Apache-2.0](LICENSE).
