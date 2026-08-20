# Pedro for iPhone — free build

Turns the Pedro web app into a real iOS app you can install without paying Apple $99/year.

**What it gets you that the website can't:**

- **Works offline** — answers come from the model built into your iPhone
- **The microphone works** — Apple's real speech recogniser, not Safari's blocked one
- Proper app icon, no browser bars, no cache eviction

**What it costs:** the app stops working every 7 days unless AltStore refreshes it
(automatic over WiFi while your PC is on). That's the price of not paying the $99.

---

## The pieces

| Step | Where | Who |
|---|---|---|
| Wrap the web app | this folder | done for you |
| Compile it into an `.ipa` | GitHub Actions (free Mac) | automatic on push |
| Sign + install onto the phone | AltServer on your PC | you, over USB |
| Keep it alive | AltStore on the phone | automatic over WiFi |

You never need a Mac. GitHub lends you one for the build.

---

## One-time setup

### 1. GitHub

Free account at <https://github.com>. Make a **private** repository called `pedro`, then
from this folder:

```bash
git init
git add .
git commit -m "Pedro"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pedro.git
git push -u origin main
```

The build starts by itself. When it finishes, open the run under **Actions** and download
the **Pedro-ipa** artifact from the bottom of the page.

### 2. AltServer on Windows

1. Install **iTunes** and **iCloud** — from <https://apple.com>, *not* the Microsoft Store
   versions. AltServer can't talk to the Store builds.
2. Install AltServer from <https://altstore.io>
3. Plug the iPhone in, trust the computer
4. AltServer tray icon → **Install AltStore** → pick your iPhone → sign in with your
   Apple ID (a normal free one is fine)
5. On the phone: **Settings → General → VPN & Device Management** → trust your Apple ID

### 3. Install Pedro

1. Put the downloaded `.ipa` somewhere on the phone (AirDrop, iCloud Drive, email)
2. Open **AltStore → My Apps → +** → choose the file
3. It installs. Done.

---

## Keeping it alive

Free Apple IDs sign apps for **7 days**. AltStore refreshes automatically when your phone
and PC are on the same WiFi and AltServer is running — so in practice it just keeps working.

If it ever refuses to open, plug into the PC and hit **Refresh All** in AltStore.

> Free Apple IDs also cap you at **3 sideloaded apps** at once.

---

## Updating Pedro later

Change the web app, then:

```bash
git add . && git commit -m "update" && git push
```

GitHub builds a fresh `.ipa`; install it over the old one through AltStore. Your chats,
settings and everything you taught it are kept.
