# Pedro

A personal AI assistant that runs **entirely on your phone**. No server, no accounts,
no backend. The page talks straight to the AI provider; your key and your chats never
touch anyone else's machine.

Say **"Pedro"** out loud and it answers you by voice.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app — UI, chat, wake word, voice, settings, encryption |
| `manifest.webmanifest` | Makes it installable as a real app (own icon, no browser bars) |
| `sw.js` | Service worker — caches the app shell so it opens offline |
| `icon.svg` / `icon.png` / `icon-512.png` | App icons |

## Setup (2 minutes, free)

1. **Get a free Google AI Studio key** — <https://aistudio.google.com/apikey> →
   *Create API key*. No card needed. (Claude is also supported in Settings, but it's
   pay-as-you-go — a Claude subscription does **not** include API access.)
2. **Put it online.** Needed for the mic, install-to-home-screen, and the PIN lock —
   browsers gate all three behind `https://`. Free options:
   - **Netlify Drop** — <https://app.netlify.com/drop>, drag this whole folder in
   - **Cloudflare Pages** — <https://pages.cloudflare.com> → *Upload assets*
   - **GitHub Pages** — push the folder to a repo → Settings → Pages
3. **Open the URL on your phone** → ⚙ → paste your key.
4. **Add to Home Screen** — iPhone: Share → *Add to Home Screen*. Android: ⋮ → *Install app*.

## Hands-free mode

Tap **🔊** in the header. Pedro listens continuously:

- Say **"Pedro"** → it answers *"Yeah?"* → ask your question → it replies **out loud**.
- Or say it in one go: *"Pedro, what's the weather like?"*
- The orb shows what it's doing: waiting → listening → thinking → speaking.
- The screen is held awake (Wake Lock) so it can stay listening while docked.
- Rename it in Settings — the name **is** the wake word. Call it Jarvis if you want.

### What "always on" can and can't mean

Be aware of one hard limit, and it's a browser rule rather than something this app chose:

| | Works |
|---|---|
| Listening while the hands-free screen is open | ✅ |
| Listening while the screen is on but you're in another app | ❌ |
| Listening while the phone is locked / in your pocket | ❌ |

Phones suspend web apps the moment they lose the screen — no web app can wake on a
word from your pocket the way Siri does. Real always-on needs a native app with a
wake-word engine (Picovoice Porcupine + Capacitor is the usual route).

The practical version: leave it open on a charger by your desk or bed and it's a
proper always-listening assistant.

## Working without wifi

| | Offline |
|---|---|
| App opens (cached by the service worker) | ✅ |
| Speaking replies out loud | ✅ on-device |
| Hearing you / wake word | ⚠️ usually needs a connection — most phones send audio to a cloud speech service. The app asks for on-device recognition where the browser supports it (newer Chrome), and falls back automatically. |
| Actually answering | ❌ the model lives in the cloud |

**Mobile data is completely fine** — nothing here needs wifi specifically, just some
connection. It works anywhere you have signal.

A fully offline AI would mean shipping a model onto the phone; that's a different,
much heavier project and it wouldn't be anywhere near this good.

## Photos, pictures and code

**Send a photo** — tap 📷 in the composer (camera or gallery), or paste/drag one in on a
computer. Up to 6 per message. They're shrunk to 1024px on your phone before sending, so
it stays fast and cheap. Ask about anything in the shot; tap a photo in the chat to view
it full-screen.

**Get a picture made** — tap 🎨 then describe what you want, or just ask naturally
("draw me a logo for my game"). It picks up phrasings like *generate an image of…* on its
own. Attach a photo first and it edits that photo instead of starting from blank.

> Picture-making is Gemini-only — Claude models can read images but can't draw them.
> If the picture model 404s, open Settings and tap **Load models from my account**:
> Google renames these often, and that pulls the real list for your key.

**Code** — ask and you get complete, runnable code in a syntax block with a **copy**
button, not a sketch full of TODOs. The brevity rule in its instructions is deliberately
switched off for code.

Pictures are stored with the chat, and browser storage is only a few MB. When it fills
up, the app drops the oldest **pictures** and keeps every message — you'll see a note
when that happens.

## Keeping it yours

- **There's nothing to log into.** No server, no accounts. It only works with your
  API key, which exists only in your phone's local storage.
- **Turn on the PIN lock** (Settings). Your keys are then stored AES-256-GCM
  encrypted, with the encryption key derived from your PIN (PBKDF2, 250,000
  iterations). Without the PIN the stored data is unusable — and there's no copy
  anywhere else, so if you forget it you just re-enter the key.
- Your chat *text* is stored unencrypted in local storage; the PIN gates the app and
  protects the keys, not the message history.

## Settings worth knowing

- **Powered by** — Gemini (free) or Claude (paid, smarter).
- **Load models from my account** — Google ships new models constantly; this pulls
  the live list for your key instead of guessing.
- **What to call it** — the assistant's name *and* the wake word.
- **What it should remember about you** — free text, added to every conversation.
  This is what makes it yours rather than a generic chatbot.
- **Thinking depth** (Claude only) — Low is snappy; High reasons harder, costs more.

## Cost

**Gemini**: free tier, generous daily limits, no card. If you hit the limit it says so
and you wait a few minutes.

**Claude**: pay-per-token. Roughly $0.003/message on Haiku, $0.018 on Opus 5. Tapping
**+ New chat** resets the history it re-sends each turn, which is the biggest lever
on cost.
