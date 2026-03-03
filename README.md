# Clawdian 🦞

An Obsidian plugin that connects your vault to OpenClaw agents, enabling AI-powered chat with full vault context awareness.

## What is Clawdian?

Clawdian embeds a chat interface directly into Obsidian, allowing you to:

- 💬 Chat with AI agents inside your vault
- 📄 Get context-aware responses based on your current note
- 🔍 Include vault context automatically with messages
- 🔐 Secure device-based authentication with OpenClaw Gateway
- 🌐 Works over local network or Tailscale

## Features

- **Vault Context**: Automatically sends current file content with messages
- **Multiple Agents**: Switch between different OpenClaw agents
- **Secure Auth**: Device identity-based pairing (no manual tokens needed)
- **Setup Code Support**: Connect via `/pair` command from OpenClaw chat
- **Cross-Platform**: Works on macOS, Windows, Linux

## Requirements

- Obsidian v0.15.0+
- OpenClaw Gateway running (local or remote)
- OpenClaw v2026.2.25 or newer

## Setup

### Step 1: Install OpenClaw

If you haven't already:

```bash
npm install -g openclaw
```

### Step 2: Start OpenClaw Gateway

On your OpenClaw machine:

```bash
openclaw gateway start
```

Or for remote access via Tailscale:

```bash
openclaw gateway run --tailscale serve
```

### Step 3: Get Setup Code

In your OpenClaw chat (Discord, Signal, etc.):

```
/pair
```

Copy the setup code that appears.

### Step 4: Install Clawdian in Obsidian

1. Download the latest release from GitHub releases
2. Extract to your Obsidian vault's `.obsidian/plugins/clawdian/` folder
3. Enable "Clawdian" in Obsidian Settings → Community Plugins

### Step 5: Connect

1. Click the 🦞 icon in Obsidian's ribbon
2. Click "Use Setup Code"
3. Paste your setup code from Step 3
4. Click "Connect"
5. You're ready to chat!

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Obsidian desktop app (for testing)

### Clone & Install

```bash
git clone https://github.com/yourusername/clawdian.git
cd clawdian
npm install
```

### Project Structure

```
clawdian/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Settings panel
│   ├── components/
│   │   ├── ChatView.ts      # Chat UI component
│   │   ├── PairingModal.ts  # Pairing setup modal
│   │   └── SetupCodeModal.ts # Setup code input modal
│   └── utils/
│       ├── OpenClawClient.ts # WebSocket client
│       └── DeviceIdentity.ts # Device auth management
├── tests/                   # Test files
├── docs/                    # Documentation
├── esbuild.config.mjs       # Build configuration
├── manifest.json            # Obsidian manifest
└── package.json             # Dependencies
```

### Development Workflow

1. **Make changes** to source files in `src/`
2. **Build** the plugin:
   ```bash
   npm run build
   ```
3. **Copy to test vault**:
   ```bash
   npm run dev
   # Or manually:
   cp main.js styles.css /path/to/vault/.obsidian/plugins/clawdian/
   ```
4. **Reload Obsidian** (`Cmd/Ctrl + R`)

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build production version |
| `npm run dev` | Build and copy to test vault |
| `npm test` | Run tests |

### Hot Reload Development

For faster iteration:

```bash
# Terminal 1: Watch and rebuild
npm run dev

# Terminal 2: In Obsidian, reload with Cmd+R after each build
```

## Building

### Production Build

```bash
npm run build
```

This creates:
- `main.js` - Compiled plugin code
- `styles.css` - Plugin styles

### Creating a Release

1. Update version in `manifest.json` and `package.json`
2. Run `npm run build`
3. Create GitHub release with:
   - `main.js`
   - `styles.css`
   - `manifest.json`

### Installing in Obsidian Vault

**Manual Installation:**

```bash
# Create plugin directory
mkdir -p /path/to/vault/.obsidian/plugins/clawdian

# Copy files
cp main.js styles.css manifest.json /path/to/vault/.obsidian/plugins/clawdian/
```

**Enable in Obsidian:**

1. Open Obsidian Settings (`Cmd/Ctrl + ,`)
2. Go to Community Plugins
3. Turn off "Safe Mode" if enabled
4. Find "Clawdian" and enable it

## Architecture

### Authentication Flow

```
1. User clicks "Use Setup Code"
2. Plugin decodes base64 setup code → {url, token}
3. Plugin connects WebSocket to Gateway
4. Gateway sends connect.challenge
5. Plugin sends connect request with token
6. Gateway responds with hello-ok
7. Connection established!
```

### Message Flow

```
User types message
    ↓
ChatView.sendMessage()
    ↓
OpenClawClient.sendMessage()
    ↓
HTTP POST to /tools/invoke
    ↓
OpenClaw Gateway processes
    ↓
Message sent to agent
```

## Troubleshooting

### "Cannot connect to Gateway"

- Check Gateway is running: `openclaw gateway status`
- Verify URL in settings matches your setup code
- Check firewall/Tailscale status

### "Auth error: missing scope"

The Gateway requires specific scopes. The plugin requests:
- `operator.read`
- `operator.write`
- `operator.admin`

If your token doesn't have these, generate a new setup code.

### "Invalid connect params"

The Gateway protocol is strict. Valid values are:
- `client.id`: `"cli"`, `"web"`, etc.
- `client.mode`: `"operator"`, `"node"`, `"cli"`, `"ui"`
- `role`: `"operator"`
- `scopes`: `["operator.read", "operator.write"]`

### UI not updating after connect

Reload Obsidian: `Cmd/Ctrl + R`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a PR

## Publishing to Community Plugins

To share Clawdian with the Obsidian community, submit it to the official plugin directory.

### Prerequisites

Before submitting, ensure your repository has:
- ✅ `README.md` - Plugin description and usage instructions
- ✅ `LICENSE` - MIT or other open-source license
- ✅ `manifest.json` - Plugin metadata

### Step 1: Create a GitHub Release

1. Update `version` in `manifest.json` following [Semantic Versioning](https://semver.org/)
2. Create a GitHub release:
   - Go to your repo → Releases → Draft a new release
   - **Tag version**: Must match manifest version (no `v` prefix, e.g., `1.0.0`)
   - Upload these assets:
     - `main.js`
     - `manifest.json`
     - `styles.css` (optional)

### Step 2: Submit to Community Plugins

1. Fork [obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. Edit `community-plugins.json`, add your entry:
   ```json
   {
     "id": "clawdian",
     "name": "Clawdian",
     "author": "Your Name",
     "description": "Chat with OpenClaw AI agents inside Obsidian with vault context awareness",
     "repo": "nexushoff-bot/clawdian",
     "branch": "main"
   }
   ```
3. Create a Pull Request
4. Wait for Obsidian team review

Once merged, users can install directly from Obsidian Settings → Community Plugins.

For detailed instructions, see the [official docs](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

## License

MIT

## Credits

Built with 🦞 by the OpenClaw community
