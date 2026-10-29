<h1><img src="src/app/icon.svg" width="30" height="30" alt=""> LAST</h1>

Use your Claude Code sessions in a browser tab.

LAST shows all the Claude Code sessions on your computer. You can open a session and continue it in
the browser. LAST reads the transcripts that Claude Code writes, and it continues each session
through the Claude Agent SDK. When you run `claude --resume` in the terminal, you see the messages
that you sent from LAST.

## What you can do in LAST

- **See all your sessions in one list.** LAST groups the sessions by project. Each session shows
  its git branch and the time of its last activity. Open a project to see all of its sessions.
- **Pin a session.** Click the pin button above the chat. Pinned sessions show at the top of the
  sidebar, above Recent.
- **See which sessions need you.** When a session waits for a permission or an answer, the sidebar
  shows "needs your answer". Jump to a session (`⌘K`) shows these sessions first.
- **Read the full conversation.** LAST shows Markdown, highlighted code, tool calls and thinking
  blocks, as the terminal shows them.
- **Continue a session from the browser.** Your message goes into the same session, in the same
  folder. LAST adds the turn to the transcript file that the terminal uses.
- **Follow a session live.** Keep a session open in the browser and continue it in the terminal.
  The page updates without a refresh.
- **Watch each reply as Claude writes it.** Each turn shows its token count, cost and duration.
- **Close the tab during a turn.** The turn continues until it ends or until you stop it. Open the
  session again to follow it.
- **Approve or deny tool calls.** Each permission prompt has Allow once and Deny. Some prompts also
  have Allow for this session.
- **Answer questions from Claude.** When Claude asks a multiple-choice question, LAST shows it in a
  dialog. Each option shows its explanation.
- **Select a permission mode.** Auto mode is the default, as in Claude Code. These are the modes:
  - **Auto-approve safe actions** (Auto mode): A classifier from Anthropic approves or denies each
    tool call. LAST asks you only when the classifier cannot decide.
  - **Ask before changes**: LAST asks you before each change.
  - **Auto-accept edits**: Claude edits files without a prompt. LAST asks you about other changes.
  - **Plan only**: Claude makes a plan. It does not make changes.
  - **Bypass permissions**: Claude runs all tool calls without a prompt. This is the same as
    `claude --dangerously-skip-permissions`.
- **Send a message while Claude works.** LAST puts the message in a queue and sends it when the
  turn ends. To send a message immediately, press `⌘J` or `⌘⇧↵` instead of Enter. To send a queued
  message immediately, click its Send now button. Claude stops its reply, answers your message and
  keeps the work that it did.
- **Select the model, the effort level and the theme.** The theme can be light, dark or the same as
  your system.
- **Use LAST on a phone.** The sidebar becomes a drawer, and the page fits a small screen.
- **Read a long reply as cards on a phone.** Under a long reply, tap Show as cards. LAST splits the
  reply at its headings and bold labels, and shows one card at a time. Swipe left or right to go to
  the next card.
- **Search the open session.** Press `⌘F` to find text in your messages, the replies, the thinking
  and the tool calls. LAST opens the card that has each match, from the newest match to the oldest.
- **Copy the resume command.** In Jump to a session (`⌘K`), copy the `claude --resume` command of a
  session. Paste it in your terminal to continue the session there.
- **Use the keyboard.** `⌘K` jumps to a session. `⌘F` searches the open session. `⌘B` shows or
  hides the sidebar. `⌘J` sends a message immediately. `Esc` stops the turn.
- **Keep your data on your computer.** LAST itself sends no data off your computer. It has no
  telemetry, no analytics, no account and no server database. Claude Code sends your messages to
  Anthropic, as it does in the terminal.

## Requirements

- Node.js 20.9 or later
- macOS or Linux. Windows is untested.
- [Claude Code](https://docs.claude.com/en/docs/claude-code), installed and signed in. LAST uses
  your Claude Code login, so you do not need an API key.

LAST uses the Claude Code that comes with `@anthropic-ai/claude-agent-sdk`. It does not use the
`claude` command on your PATH. LAST pins the SDK at version 0.3.310, which includes Claude Code
2.1.310.

New Claude models need Claude Code 2.1.280 or later. If a reply fails with "Claude Code … does not
support this model", `claude update` does not fix it. Increase the SDK version in `package.json`.

## Run LAST

1. Run `npm ci` to install the packages.
2. Run `npm run dev` to start LAST.
3. Open http://127.0.0.1:4123 in your browser.

LAST needs at least one Claude Code session on your computer. If the list is empty, run `claude` in
a project one time. Then reload the page.

To run a production build, run `npm run build`, then `npm start`.

To stop LAST, press Ctrl-C. To see what still uses port 4123, run `npm run check-bind`.

## Read this before you run LAST

> [!WARNING]
> Do not run LAST on a computer that other people use. Do not forward or tunnel port 4123. LAST has
> no login and no token. Any program that can connect to `127.0.0.1:4123` can read all your Claude
> Code history. It can also run Bash commands on your computer as you.

Make sure that your code editor does not forward port 4123 for you.

Auto mode is the default. In Auto mode, the classifier approves the tool calls that it is sure are
safe, and it does not tell you. When it is sure that a call is not safe, it denies the call. LAST
shows a warning after the denial. LAST asks you only about the calls that the classifier is not
sure about. To see each change before it runs, select Ask before changes.

LAST does not load Claude Code settings files by default. This means that your Claude Code allow
list does not apply in LAST. LAST also does not load `CLAUDE.md` and `AGENTS.md`. To load them, set
`LAST_SETTING_SOURCES=project`. To load all the settings files, as the terminal does, set
`LAST_SETTING_SOURCES=user,project,local`.

The word "ultracode" in a message starts a Claude Code workflow. A workflow can run many subagents
at the same time. This is a Claude Code feature, not a LAST feature. It needs Workflows on your
Anthropic plan and a model with the highest effort level. LAST cannot check these for you. LAST
shows when a workflow starts and when it ends, but not its progress.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Notes

LAST is an unofficial community project. It has no affiliation with Anthropic, and Anthropic does
not endorse or support it. "Claude" and "Claude Code" are trademarks of Anthropic. LAST comes as
is, with no warranty. You are responsible for what the agent does on your computer.

LAST uses `@anthropic-ai/claude-agent-sdk`. Anthropic PBC owns this SDK, and the LAST license does
not cover it. You get the SDK from npm under the terms of Anthropic. The SDK uses your Claude
credits.

Some UI ideas come from [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui). LAST
contains no code from that project.

## License

[Apache-2.0](LICENSE).
