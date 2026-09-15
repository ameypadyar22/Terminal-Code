# Security model

Code Terminal never stores, prints, writes, or sends an API key anywhere except
the selected provider's HTTPS API endpoint. Supply the key through a per-process
environment variable rather than putting it in source code or committing it to
a file.

```powershell
$env:OPENROUTER_API_KEY = "your-key"
npm start
```

The key is still available to the running Code Terminal process. This is
unavoidable for a direct-to-provider CLI, so no local encryption or asymmetric
keypair can make that architecture immune to a compromised computer.

## Production architecture

For a shared app or untrusted user devices, do not distribute a provider key.
Use an HTTPS backend relay instead:

```text
Code Terminal -> authenticated HTTPS relay -> OpenRouter
                                  |
                           provider key in server secret store
```

The relay should authenticate users, authorize model access, rate-limit requests,
apply spending limits, log without prompts/secrets, and keep the OpenRouter key
in a managed server secret store. Rotate or revoke a leaked provider key
immediately in the provider dashboard.

## Included client protections

- Provider endpoints are fixed HTTPS allowlisted URLs.
- API keys stay in environment memory and are never displayed in status, logs,
  errors, or project files.
- Requests time out after 45 seconds.
- Input and retained chat history are bounded to reduce accidental data exposure
  and cost.
- Model identifiers are validated before requests are sent.
