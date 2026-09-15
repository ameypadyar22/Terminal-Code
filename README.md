# Code Terminal

Code Terminal is an agentic, terminal-first AI developer console. It keeps the
conversation open after every answer, chooses tools when they help, reports each
tool action clearly, and returns a clean, readable response in the terminal.

## Start with OpenRouter

Requires Node.js 18 or newer. OpenRouter is the default provider. On launch,
the CLI displays the Code Terminal logo and securely prompts for an API key. The
input is hidden, stays only in memory for the session, and is acknowledged after
a valid-looking key is entered. On Windows, paste with `Ctrl+V`, then press
Enter:

```powershell
npm start
```

Code Terminal then fetches free OpenRouter models that advertise native tool
calling. Use the Up/Down arrow keys to select a model and press Enter to run it.
The first option is `openrouter/free`; every option in this menu uses the same
`OPENROUTER_API_KEY`. The free router remains free, though tool support and
model availability can vary by the model selected by OpenRouter.

If a selected model explicitly rejects native tool calling, Code Terminal shows
a compatibility notice and retries that request in normal chat mode. This keeps
the model usable without changing the behavior of models that support agent
tools.

To choose a model before starting:

```powershell
$env:CODE_TERMINAL_MODEL = "anthropic/claude-sonnet-4"
npm start
```

## Agent tools

The model automatically selects from these tools when a request needs them:

- Calculator — arithmetic and percentage calculations
- Web search — public-web information
- Files and search — list directories, find text, and read TXT, JSON, CSV,
  Markdown, and limited PDF text
- File writer — create or update text-based project files, including missing
  parent directories
- Python — code execution for calculations, processing, and analysis
- Terminal — allowlisted project commands
- SQLite — query and modify workspace databases
- API requests — HTTP GET and POST requests
- Memory — session-only, non-sensitive preferences
- Date/time — current time and day calculations
- JSON and text processing — validate, transform, extract, and count data
- Git — repository status, branches, logs, diffs, and supported operations

Each tool use is shown as `USING TOOL` in the terminal. The agent remains ready
for the next request after its answer. Responses use clear headings, bullets,
and code formatting without heavy box borders.

## Confirmations and limits

File writes, Python execution, SQLite changes, and potentially destructive
terminal or Git operations require confirmation. Use `y` or `yes` to approve;
the CLI asks only once per action type during the current request, avoiding
duplicate prompts. A declined action is not performed.

Workspace file access is restricted to the folder where Code Terminal starts.
Tool use is capped at eight steps per request. Large files and generated
directories such as `node_modules`, `.git`, build output, and coverage output
are skipped. Memory is erased when the CLI closes and rejects likely secrets or
sensitive information.

## Use OpenAI instead

```powershell
$env:CODE_TERMINAL_PROVIDER = "openai"
npm start
```

## Commands

- `/` — open the colored arrow-key command palette
- `/help` — show commands plus the available agent-tool categories
- `/clear` — begin a fresh conversation
- `/status` — show provider, active model, tool status, and session status
- `/model <name>` — change the model for this session
- `/exit` — close Code Terminal

Type `/` to open a VS Code-style terminal command palette, then use Up/Down and
Enter to select a command. `/model` opens an arrow-key model picker directly.
It refreshes the available free OpenRouter models before displaying options.
Tab completion remains available after `/` and `/model `, and an unknown slash
command shows matching command suggestions.

## Troubleshooting

- If `/model` shows no choices beyond the free router, verify your network and
  OpenRouter key, then run `/model` again to refresh the catalog.
- If a model rejects agent tools, Code Terminal retries it automatically in chat
  mode and prints a compatibility notice.
- A `Missing Authentication header` response comes from the API being called;
  provide that API's required authorization through its supported request flow.

To install the CLI globally from this folder, run `npm link`, then launch it
from any directory with `code-terminal`.

## Security

Keep API keys out of source code, prompts, screenshots, and Git. Code Terminal
never prints or writes entered keys; environment variables remain an optional
convenience fallback. See [SECURITY.md](SECURITY.md) for the client protections
and a recommended server-side relay architecture for production use.
