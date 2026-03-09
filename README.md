# Clawdian 🦞

> **Production-ready Obsidian plugin for AI-powered chat with vault context**

[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

Clawdian embeds an intelligent chat interface directly into Obsidian, allowing you to:

- 💬 **Chat with AI agents** inside your vault with full context awareness
- 📄 **Vault context** automatically includes current note content with messages
- 🗨️ **Chat history persistence** - your conversations are saved locally
- 📎 **File attachments** - attach any vault files to your messages
- ⚡ **Slash commands** - `/search`, `/create`, `/summarize`, `/clear` for quick actions
- 🎨 **Multi-agent support** - switch between agents with custom color themes
- 🔄 **Auto-connect** - automatically connect to Gateway on plugin startup
- 🔐 **Secure auth** - tokens stored in Obsidian's Secret Storage

## Features

### Core Capabilities

- **Vault Context Integration**: Automatically sends current file content with messages
- **Multiple Agent Support**: Switch between different OpenClaw agents seamlessly
- **Chat History**: All conversations persisted locally in `.clawdian/chat-history.json`
- **File Attachments**: Attach vault files as context via the context bar
- **Slash Commands**: Quick actions via `/` prefix in input

### Slash Commands

| Command | Description |
|---------|-------------|
| `/search <query>` | Search vault for relevant files |
| `/create <title>` | Create a new note with AI |
| `/summarize` | Summarize attached files or context |
| `/clear` | Clear current conversation |

### Agent Customization

- **Color Theming**: Each agent has a customizable color theme (affects avatars and UI)
- **Auto-Select**: Remembers last-selected agent for quick switching
- **Agent List**: Dynamically fetched from OpenClaw Gateway

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Gateway URL | OpenClaw WebSocket endpoint | `ws://127.0.0.1:18789` |
| Auto-connect | Connect on plugin startup | `Off` |
| Default Agent | Agent to use when none selected | `Last used` |
| Include Vault Context | Send current file with messages | `On` |
| Context Size | File content truncation | `Large (3000 chars)` |
| Include Chat History | Include previous messages in context | `On` |
| History Depth | Number of previous messages | `5` |

## Installation

### Quick Setup

1. **Install Clawdian in Obsidian**:
   - Download the latest release from [GitHub Releases](https://github.com/nexushoff-bot/clawdian/releases)
   - Extract files to your vault's `.obsidian/plugins/clawdian/` folder
   - Enable "Clawdian" in Obsidian Settings → Community Plugins

2. **Start OpenClaw Gateway**:
   ```bash
   # Local access
   openclaw gateway start
   
   # Remote access via Tailscale
   openclaw gateway run --tailscale serve
   ```

3. **Configure in Obsidian**:
   - Click the 🦞 icon in Obsidian's ribbon
   - In Settings (gear icon), enter your Gateway URL
   - Click "Reset Token" and paste your OpenClaw gateway token
   - Toggle **Auto-connect** if you want automatic connections
   - Click the 🦞 ribbon icon to open chat

### Development Setup

For developers contributing to Clawdian:

```bash
# Clone repository
git clone https://github.com/nexushoff-bot/clawdian.git
cd clawdian
npm install

# Build
npm run build

# Copy to test vault
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/clawdian/

# Reload Obsidian
Cmd/Ctrl + R
```

See [CODE_REFERENCE.md](CODE_REFERENCE.md) for detailed architecture documentation.

## Usage

### Starting a Conversation

1. Click the **🦞 icon** in Obsidian's ribbon to open the chat view
2. Select an agent from the dropdown (if not auto-connected)
3. Your current note's content is automatically included (if enabled)
4. Type your message and press **Enter** or click **Send**

### Attaching Files

1. Click **"+ Add file"** in the context bar
2. Select files from your vault
3. Attached files appear as chips above the input
4. Click **×** on a chip to remove a file

### Slash Commands

Type `/` in the input field to see available commands:

```
/search marketing plan
→ Searches vault for "marketing plan" and includes results in context

/create "Q1 Review"
→ Creates a new note and generates content with AI

/summarize
→ Summarizes attached files or current context

/clear
→ Clears the conversation history (local only)
```

### Switching Agents

1. Click the **agent dropdown** in the header
2. Select from available agents
3. Each agent has its own chat session and color theme
4. The plugin remembers your last selection

### Chat History

- All messages are automatically saved to `.clawdian/chat-history.json` in your vault root
- History is **global** (group chat style), not per-agent
- Controls: Settings → Include Chat History / History Depth
- History loads automatically when you open the chat view

## Security

### Token Storage

⚠️ **Important**: Clawdian uses **Obsidian's Secret Storage** for token management, NOT:
- ❌ `settings.json`
- ❌ `plugin-data.json`
- ❌ localStorage

**Token Location**: `.obsidian/plugins/clawdian/.secrets/token`

This ensures your gateway token is encrypted and isolated per-plugin.

### Network Security

- **HTTPS/WSS**: Always use WebSocket Secure (`wss://`) for remote connections
- **Local Development**: `ws://` is safe for localhost/Tailscale
- **Token Scopes**: Plugin requests `operator.read`, `operator.write`, `operator.admin`

### Vault Data Privacy

- All chat history stored **locally** in your vault
- No external logging or telemetry
- Agent tokens never leave your device except to Gateway

## Troubleshooting

### "Cannot connect to Gateway"

**Check Gateway status:**
```bash
openclaw gateway status
```

**Verify URL matches setup code:**
- Settings → Gateway URL must match the WebSocket address from your token
- For local: `ws://127.0.0.1:18789`
- For Tailscale: `wss://your-node.tailscale.io:18789`

**Check firewall:**
- macOS: System Settings → Network → Firewall
- Windows: Windows Defender Firewall
- Allow Node.js/OpenClaw if prompted

### "Auth error: missing scope"

**Generate a new token with proper scopes:**
```bash
# In OpenClaw chat
/pair

# Ensure token includes:
- operator.read
- operator.write
- operator.admin
```

**Reset token in Clawdian:**
- Settings → Reset Token button
- Paste new token from `/pair`

### "Invalid connect params"

The Gateway protocol enforces strict schema values:
- `client.id`: Must be `'cli'` (restricted)
- `client.mode`: `'operator'`, `'node'`, `'cli'`, `'ui'`
- `role`: `'operator'`

This is a **Gateway security feature**, not a Clawdian bug.

### UI not updating after connect

**Hard reload Obsidian:**
```bash
Cmd/Ctrl + Shift + R (clears cache)
```

**Or manually:**
1. Disable Clawdian in settings
2. Reload Obsidian
3. Re-enable Clawdian

### Chat history not loading

**Check file exists:**
```bash
ls -la .clawdian/chat-history.json
```

**If missing, history starts fresh** (this is normal for new installs)

**Increase history depth:**
- Settings → Chat History Depth (default: 5, max: 500 messages retained)

### Performance Issues

**Large vaults:**
- Settings → Context Size → Switch from "max" to "large" or "medium"
- Reduce History Depth to 3-5 messages
- Avoid attaching too many large files simultaneously

## Development

### Project Structure

```
clawdian/
├── src/
│   ├── main.ts              # Plugin entry point, history, token management
│   ├── settings.ts          # Settings panel UI and defaults
│   ├── components/
│   │   ├── ChatView.ts      # Chat UI, message rendering, slash commands
│   │   └── TokenModal.ts    # Token input modal
│   └── utils/
│       └── OpenClawClient.ts # WebSocket connection handler
├── styles.css               # All plugin styling
├── manifest.json            # Obsidian plugin metadata
├── package.json             # Dependencies and scripts
├── AGENT.md                 # Workflow instructions (for contributors)
├── CODE_REFERENCE.md        # Architecture documentation (READ FIRST)
└── README.md                # This file
```

### Building

```bash
# Production build
npm run build

# Output:
# - main.js (compiled)
# - styles.css (compiled)
```

### Testing

1. **Clone test vault**: `./clawdian-vault`
2. **Copy build files**:
   ```bash
   cp main.js manifest.json styles.css clawdian-vault/.obsidian/plugins/clawdian/
   ```
3. **Reload Obsidian**: `Cmd/Ctrl + R`
4. **Check logs**: `Cmd/Ctrl + Option + I` → look for `[Clawdian]` prefixed messages

### Key Files for Developers

| File | Purpose | When to Edit |
|------|---------|--------------|
| `CODE_REFERENCE.md` | Architecture reference | Update when you add new features |
| `src/main.ts` | Core plugin logic | Token storage, history management |
| `src/components/ChatView.ts` | UI component | Message rendering, commands |
| `src/utils/OpenClawClient.ts` | WebSocket client | Connection logic, message handling |
| `styles.css` | Styling | UI appearance, theme support |

## Known Limitations

1. **Single Vault Context**: Only one file can be actively attached at a time (plus chat history)
2. **History Cap**: Maximum 500 messages retained in chat history
3. **No Cloud Sync**: All data local to vault (by design for privacy)
4. **Agent Sessions**: Each agent has independent session state (no cross-agent context)
5. **WebSocket Only**: Requires WebSocket connection to OpenClaw Gateway (no REST fallback)

## Future Roadmap

- [ ] Agent avatars (custom images)
- [ ] Threaded conversations
- [ ] Export chat history to Markdown
- [ ] Voice-to-text input
- [ ] Multiple simultaneous attachments with per-file context
- [ ] Rich message formatting (code blocks, tables)

## Contributing

1. **Read first**: `AGENT.md` and `CODE_REFERENCE.md` before making changes
2. **Fork the repo**: `https://github.com/nexushoff-bot/clawdian`
3. **Create a branch**: `git checkout -b feature/your-feature`
4. **Make changes**: Follow the architecture in `CODE_REFERENCE.md`
5. **Test thoroughly**: Use the test vault at `./clawdian-vault`
6. **Update docs**: Modify `CODE_REFERENCE.md` if you change architecture
7. **Submit PR**: Describe changes, link related issues

### Git Commit Conventions

```bash
feat: Add new agent color picker
fix: Fix history loading on view open
docs: Update README with slash commands
style: Format CSS with prettier
refactor: Simplify OpenClawClient message handling
test: Add unit tests for token storage
```

## Publishing to Obsidian Community Plugins

To submit Clawdian to the official plugin directory:

1. **Update version** in `manifest.json` and `package.json` (Semantic Versioning)
2. **Create GitHub release** with assets: `main.js`, `manifest.json`, `styles.css`
3. **Fork obsidian-releases**: `https://github.com/obsidianmd/obsidian-releases`
4. **Add entry** to `community-plugins.json`:
   ```json
   {
     "id": "clawdian",
     "name": "Clawdian",
     "author": "Neil Hoff",
     "description": "Chat with OpenClaw AI agents inside Obsidian with vault context",
     "repo": "nexushoff-bot/clawdian",
     "branch": "main"
   }
   ```
5. **Submit PR** and wait for review

See [official docs](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) for complete instructions.

## Credits

Built with 🦞 by **Neil Hoff** for the OpenClaw community.

Clawdian connects Obsidian users to the power of agentic AI while keeping your data local and private.

---

**License**: MIT | **Version**: 1.0.0 | **Status**: Production Ready

[GitHub](https://github.com/nexushoff-bot/clawdian) | [Documentation](CODE_REFERENCE.md)
