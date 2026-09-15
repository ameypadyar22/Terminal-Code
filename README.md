# Code Terminal

An AI-powered developer console with a terminal-first interface.

## Start with OpenRouter

Requires Node.js 18 or newer. Code Terminal uses OpenRouter by default:

```powershell
$env:OPENROUTER_API_KEY = "your-openrouter-api-key"
npm start
```

The default model is `openrouter/auto`, which lets OpenRouter choose a suitable
model. Select a model yourself before starting, for example:

```powershell
$env:CODE_TERMINAL_MODEL = "anthropic/claude-sonnet-4"
npm start
```

## Use OpenAI instead

```powershell
$env:CODE_TERMINAL_PROVIDER = "openai"
$env:OPENAI_API_KEY = "your-openai-api-key"
npm start
```

Ask questions at the `user@code-terminal` prompt. Conversation context remains
available until you use `/clear` or close the app.

## Commands

- `/help` — show the command deck
- `/clear` — begin a fresh conversation
- `/status` — view provider, model, and session status
- `/model <name>` — change the model for this session
- `/exit` — close Code Terminal

To install the CLI globally from this folder, run `npm link`, then launch it
from any directory with `code-terminal`.

## Security

Keep API keys out of source code, prompts, screenshots, and Git. Code Terminal
only reads them from process environment variables and never displays them. See
[SECURITY.md](SECURITY.md) for the client protections and the recommended
server-side relay design for production use.
