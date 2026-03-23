# Clawchat 🦞

> **Obsidian plugin for AI-powered chat with vault context**

[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

Chat with OpenClaw AI agents directly in Obsidian. Your vault content is automatically included as context.

## ⚡ Quick Start

### 1. Install
```bash
mkdir -p your-vault/.obsidian/plugins/clawchat
cd your-vault/.obsidian/plugins/clawchat
# Download main.js, manifest.json, styles.css from https://github.com/nexushoff-bot/clawdian/releases
```
Enable in Obsidian: **Settings → Community Plugins → Clawchat**

### 2. Start Gateway
```bash
openclaw gateway run --tailscale serve
```

### 3. Connect
In Clawchat settings:
- **Gateway URL**: `wss://your-machine.tailXXXX.ts.net`
- **Token**: From `~/.openclaw/openclaw.json` → `gateway.auth.token`

> **Why Tailscale?** Obsidian's Electron app origin (`app://obsidian.md`) isn't recognized by standard WebSocket origin checks. Tailscale authenticates at the network level, bypassing this issue.

---

## Features

| Feature | Description |
|---------|-------------|
| **Vault Context** | Current note content sent with messages |
| **Chat History** | Saved locally in `.clawchat/chat-history.json` |
| **File Attachments** | Attach vault files as context |
| **Slash Commands** | `/search`, `/create`, `/summarize`, `/clear` |
| **Multi-Agent** | Switch between agents with color themes |
| **Auto-Connect** | Connect automatically on startup |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/search <query>` | Search vault and include results |
| `/create <title>` | Create a new note |
| `/summarize` | Summarize context or attachments |
| `/clear` | Clear conversation history |

## Usage

### Start Chatting
1. Click the **chat icon** in Obsidian's ribbon
2. Select an agent (if not auto-connected)
3. Type your message — current note is included automatically

### Attach Files
1. Click **"+ Add file"** in the context bar
2. Select files from your vault
3. Click **×** to remove

### Switch Agents
Click the **agent dropdown** in the header. Your selection is remembered.

---

## Security

### Token Storage
Uses Obsidian's Secret Storage (encrypted, isolated per-plugin):
- Location: `.obsidian/plugins/clawchat/.secrets/token`
- NOT in settings.json or localStorage

### Network
- All traffic via Tailscale (`wss://`)
- No external telemetry
- Chat history stored locally only

---

## Troubleshooting

### "Cannot connect to Gateway"
```bash
openclaw gateway status
```
Verify Gateway URL matches your Tailscale address in settings.

### "Auth error: missing scope"
Generate a new token with `operator.read`, `operator.write`, `operator.admin` scopes.

### UI not updating
Hard reload: `Cmd/Ctrl + Shift + R`

### Chat history not loading
Normal for new installs. Check `.clawchat/chat-history.json` exists.

---

## Development

```bash
git clone https://github.com/nexushoff-bot/clawdian.git
cd clawchat-fix
npm install
npm run build
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/clawchat/
```

See [CODE_REFERENCE.md](CODE_REFERENCE.md) for architecture docs.

### Project Structure
```
src/
├── main.ts                 # Plugin entry, history, tokens
├── settings.ts             # Settings panel UI
├── components/
│   ├── ChatView.ts         # Chat UI, messages, commands
│   └── TokenModal.ts       # Token input modal
└── utils/
    └── OpenClawClient.ts   # WebSocket client
```

## Publishing

1. Update version in `manifest.json`
2. Create GitHub release with `main.js`, `manifest.json`, `styles.css`
3. Add entry to `community-plugins.json`:
```json
{
  "id": "clawchat",
  "name": "Clawchat",
  "author": "Neil Hoff",
  "description": "Chat with OpenClaw AI agents with vault context.",
  "repo": "nexushoff-bot/clawdian"
}
```
4. Submit PR to [obsidian-releases](https://github.com/obsidianmd/obsidian-releases)

---

**License**: MIT | [GitHub](https://github.com/nexushoff-bot/clawdian) | [Docs](CODE_REFERENCE.md)