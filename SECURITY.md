# Security policy

## Supported versions

LAST is before 1.0. Only the latest release and the current `main` branch get fixes. There are no
patches for older versions.

## Reporting a vulnerability

Please report privately. Do not open a public issue.

Use the GitHub **Security** tab on this repository, then **Report a vulnerability**. That opens a
private advisory that only the maintainers can read. Private Vulnerability Reporting must be enabled
in the repository settings for this to work.

There is no security email address yet. The maintainer will add one here when there is one.

Tell us what you found, how to reproduce it, and what an attacker gets out of it. A small proof of
concept helps a lot.

## What to expect

LAST is maintained by one person in their spare time. There is no service level agreement. In
practice you can expect a first reply within a week, and a fix or a clear answer within a month for
anything serious. If a report is quiet for longer than that, feel free to ping the advisory thread.

Please give us a reasonable window to ship a fix before you write about the issue in public.

## Threat model

Read this before you report. LAST is a single-user tool that runs on your own machine.

- The server binds `127.0.0.1` and has no authentication. That is by design.
- It reads your entire local Claude Code history from `~/.claude/projects`.
- It reuses your Claude Code credentials and spends your model credits.
- It runs an agent that can execute Bash and write files as you.

So anyone who can reach port 4123, or who can already run code as your user, can read all your
transcripts, spend your credits, and run commands as you. That is the shape of the tool, not a bug.

### In scope

- Anything that makes the server reachable off `127.0.0.1`.
- Anything that accepts a cross-origin request: CSRF, DNS rebinding, missing origin checks.
- Path traversal, or reading files outside `~/.claude/projects`.
- Tool execution that skips the browser permission prompt on the default settings. By default
  `LAST_SETTING_SOURCES` is empty, no settings files are loaded, and every tool call must prompt.
- A permission prompt that misrepresents what you are approving.
- Prompt or transcript content that escapes rendering and runs as script.
- Prompt or transcript content that leaks local file contents to a remote host.
- Credentials leaking into logs or into responses.

### Out of scope

- Running LAST on a shared or multi-user machine. Any local user can reach `127.0.0.1:4123`. This is
  by design and will not be fixed.
- Deliberately exposing the port: a reverse proxy, a tunnel, binding `0.0.0.0`, or port forwarding.
- The agent doing damage after you approved it, including in Auto-accept edits mode.
- Prompts being skipped after you set `LAST_SETTING_SOURCES` yourself. That loads settings files,
  and the SDK applies their allow rules and hooks before the browser prompt ever appears. That is
  what opting in means.
- Bugs in `@anthropic-ai/claude-agent-sdk` or in Claude Code itself. Report those to Anthropic.
- Anything that needs you to already have code execution as the same user.
