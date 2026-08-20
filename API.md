# Pedro API

Lets other programs talk to Pedro — with his personality and everything you've
taught him. Roblox, iPhone Shortcuts, scripts, anything that can make a web request.

## Run it

```
node api.js
```

Serves the app *and* the API on **http://localhost:8788**. (`serve.js` is still there
if you only want the app.)

## Endpoints

| | |
|---|---|
| `POST /api/chat` | `{ "message": "...", "history": [...] }` → `{ "reply": "...", "model": "..." }` |
| `POST /v1/chat/completions` | OpenAI-compatible, for tools that expect that shape |
| `GET /api/health` | provider, model, and how much you've taught it |

Every request needs your token, as `x-pedro-key: <token>` or `Authorization: Bearer <token>`.
Your token is in **pedro-api.json** — it was generated on first run. Don't share it.

## Give it what you taught Pedro

In the app: **Teach → "Save what I've taught"**, then put the downloaded
`pedro-brain.json` next to `api.js`. The API re-reads it on every request, so editing
it takes effect immediately — no restart.

## Settings

Edit **pedro-api.json**:

```json
{
  "provider": "local",
  "localModel": "qwen2.5:7b",
  "geminiKey": "",
  "geminiModel": "gemini-2.5-flash",
  "userName": "Adam",
  "about": "Builds Roblox games in Luau."
}
```

`provider` is `local` (Ollama, free, private, PC must be on) or `gemini` (needs a key,
works from anywhere).

## From Roblox

```lua
local HttpService = game:GetService("HttpService")

local function askPedro(message)
    local ok, result = pcall(function()
        return HttpService:PostAsync(
            "http://localhost:8788/api/chat",
            HttpService:JSONEncode({ message = message }),
            Enum.HttpContentType.ApplicationJson,
            false,
            { ["x-pedro-key"] = "YOUR_TOKEN_HERE" }
        )
    end)
    if not ok then
        warn("Pedro unreachable: " .. tostring(result))
        return nil
    end
    return HttpService:JSONDecode(result).reply
end

print(askPedro("Give me an idea for a boss fight"))
```

Turn on **Game Settings → Security → Allow HTTP Requests** in Studio first.
Roblox servers can't reach `localhost` — this works in Studio, or point it at a
public address if you host the API.

## From a terminal

```bash
curl -X POST http://localhost:8788/api/chat \
  -H "content-type: application/json" \
  -H "x-pedro-key: YOUR_TOKEN_HERE" \
  -d '{"message":"what should I build today?"}'
```

## From an iPhone Shortcut

*Get Contents of URL* → your API address → **POST** → Headers: `x-pedro-key` = your
token → Request Body **JSON**: `message` = your text. Then *Get Dictionary Value*
`reply`. Ask Siri to run it and Pedro answers out loud.

Your phone needs to reach the PC — same WiFi, or a tunnel.

## Keeping it closed

The token is required on every call, and the server only listens on this machine
unless you deliberately expose it. If you ever put it on the internet, rotate the
token by deleting it from `pedro-api.json` and restarting — a new one is generated.
