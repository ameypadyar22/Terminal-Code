# Code Terminal

An AI-powered developer console with a terminal-first interface.

## Start with OpenRouter

Requires Node.js 18 or newer. Code Terminal uses OpenRouter by default and
securely prompts for the API key when it starts. The key is hidden while typing
and stays only in memory for that session:

```powershell
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
prompts for them with hidden input and never displays or writes them. Existing
environment variables remain an optional convenience fallback. See
[SECURITY.md](SECURITY.md) for the client protections and the recommended
server-side relay design for production use.
