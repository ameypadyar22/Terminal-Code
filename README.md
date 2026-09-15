# Code Terminal

Code Terminal is a terminal-based AI assistant for coding, debugging, and project work. It uses OpenRouter by default, supports OpenAI's Chat Completions API, and lets compatible models call a constrained set of workspace and utility tools.

## Requirements

- Node.js 18 or later
- A valid API key for either OpenRouter or OpenAI

No package installation is currently required; the CLI uses Node.js built-in modules.

## Project structure

```text
.
├── index.js                 # Executable CLI entry point and session loop
├── src/
│   ├── config.js            # Limits, provider selection, and shared configuration
│   ├── tools/
│   │   └── schema.js        # Model tool definitions
│   └── ui/
│       └── terminal.js      # ANSI colors and terminal display helpers
├── README.md
├── SECURITY.md
└── package.json
```

The entry point remains `index.js` so both `npm start` and the global `code-terminal` command continue to work. Add new provider settings in `src/config.js`, new model-callable tool schemas in `src/tools/schema.js`, and reusable terminal styling in `src/ui/terminal.js`.

## Run

Start the application from the project directory:

```powershell
npm start
```

If the relevant API-key environment variable is not set, Code Terminal prompts for it at startup with hidden input. The key is kept in memory only for the current session.

Before showing the model selector or command menu, Code Terminal validates the key with the selected provider. If the key has an invalid format or the provider rejects it, the CLI displays `INVALID API KEY` and exits. If the provider cannot be reached or returns another validation error, it displays `API KEY VALIDATION FAILED` and exits; restart the CLI after resolving the connection or provider issue.

To install the `code-terminal` command globally, run this once from the project directory:

```powershell
npm link
```

Open a new PowerShell window afterward. You can then start Code Terminal from any folder:

```powershell
code-terminal
```

The folder from which you run the command becomes the workspace available to the agent.

## Providers and models

OpenRouter is the default provider. Set `OPENROUTER_API_KEY` before starting, or enter the key when prompted.

```powershell
$env:OPENROUTER_API_KEY = "your-openrouter-key"
npm start
```

With OpenRouter, the startup model picker requests the current catalog and shows free models that advertise native tool support, plus the `openrouter/free` router. The selector is logo-free so the available models remain in focus. If the catalog cannot be loaded, the CLI uses `openrouter/free`.

Use OpenAI instead by setting both the provider and its API key:

```powershell
$env:CODE_TERMINAL_PROVIDER = "openai"
$env:OPENAI_API_KEY = "your-openai-key"
npm start
```

The default OpenAI model is `gpt-4o-mini`. Override the initial model for either provider with `CODE_TERMINAL_MODEL`:

```powershell
$env:CODE_TERMINAL_MODEL = "provider/model-name"
npm start
```

If a model rejects native tool calling before any tools have run, Code Terminal automatically retries the request in regular chat mode.

## Commands

| Command | Description |
| --- | --- |
| `/` | Open the arrow-key command palette. |
| `/help` | Show commands and tool categories. |
| `/clear` | Clear the in-memory conversation. |
| `/status` | Show provider, model, connection, and session status. |
| `/model` | Open a model selector; with OpenRouter, refresh the free tool-capable catalog. |
| `/model <name>` | Set a model name for the current session. |
| `/exit` or `/quit` | Close Code Terminal. |

Tab completion is available for slash commands and known model choices.

## Agent tools

Compatible models can request these tools:

- Arithmetic and percentage calculation
- Public-web search
- Workspace file listing, text search, and reading
- Text-file creation and updates
- Python execution and an allowlisted terminal runner
- SQLite queries
- HTTP GET and POST requests
- Session-only preference memory and date/time calculations
- JSON and text processing
- Git inspection and supported Git commands

The CLI displays each model-initiated action as `USING TOOL`. File writes, Python execution, SQLite mutations, and potentially destructive terminal or Git commands ask for confirmation. Approvals apply only to the current user request.

## Limits and safeguards

- Workspace paths are restricted to the directory where Code Terminal started.
- Directory scans skip `.git`, `node_modules`, `dist`, `build`, and `coverage`.
- Individual file reads are limited to 100 KB; tool output and tool-write content are limited to 12,000 characters.
- A prompt may be at most 12,000 characters.
- The assistant retains up to six conversation exchanges in memory and can take up to eight tool steps per request.
- API requests have a 45-second overall assistant-request timeout; individual tool web requests use shorter timeouts.
- Session memory rejects likely sensitive values and is discarded when the CLI closes.

## Test

```powershell
npm test
```

## Security

Do not commit API keys or paste them into prompts, source files, or screenshots. See [SECURITY.md](SECURITY.md) for the project's security notes and deployment guidance.
