# Clawchat Plugin Code Reference

Comprehensive documentation of the ClawChat Obsidian plugin to prevent future bugs and ease onboarding.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [src/main.ts](#srcmaints)
3. [src/components/ChatView.ts](#srccomponentschatviewts)
4. [src/utils/OpenClawClient.ts](#srcutilsopenclawclientts)
5. [src/settings.ts](#srcsettingsts)
6. [styles.css](#stylescss)
7. [Data Structures](#data-structures)
8. [Lifecycle Events](#lifecycle-events)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ClawChatPlugin                            │
│                    (main.ts)                                  │
│  - Settings management                                       │
│  - Chat history storage                                      │
│  - Token management (Secret Storage)                         │
│  - View registration                                          │
│  - Client initialization                                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌──────────┐    ┌──────────┐
   │ChatView │    │ Settings │    │  Client  │
   │(UI)     │    │  Tab     │    │(WebSocket)│
   └─────────┘    └──────────┘    └──────────┘
```

---

## src/main.ts

### Purpose

Main plugin class that handles:
- Plugin lifecycle (load/unload)
- Chat history persistence
- Gateway token management via Obsidian's Secret Storage
- View activation and command registration

### Key Classes/Functions

#### `ClawChatPlugin` (default export)
Extends Obsidian's `Plugin` class.

**Properties:**
- `settings: ClawChatSettings` - Plugin configuration
- `client: OpenClawClient` - WebSocket connection handler
- `chatHistory: ChatHistory` - In-memory message cache
- `HISTORY_FILE: string` - Path to persisted history (`.clawchat/chat-history.json`)

**Methods:**

| Method | Purpose |
|--------|---------|
| `onload()` | Initializes plugin: loads settings, history, token, registers view, adds ribbon icon, creates command, adds settings tab, auto-connects if enabled |
| `onunload()` | Disconnects WebSocket client |
| `loadChatHistory()` | Reads `.clawchat/chat-history.json` from vault |
| `saveChatHistory()` | Writes chat history to file (auto-creates `.clawdian` directory) |
| `addMessageToHistory(msg)` | Adds message to history, keeps only last 500 messages |
| `loadToken()` | Retrieves token from Obsidian Secret Storage at `.obsidian/plugins/{plugin-id}/.secrets/token` |
| `saveToken(token)` | Stores token in Secret Storage |
| `clearToken()` | Removes token from Secret Storage |
| `setupClientCallbacks()` | Attaches callback handlers to client (connect, disconnect, error, authError) |
| `tryConnect()` | Attempts WebSocket connection with stored token |
| `showTokenModal()` | Opens modal for user to enter gateway URL and token |
| `activateView()` | Shows or creates ChatView leaf, attempts connection if needed |
| `loadSettings()` / `saveSettings()` | Persist settings to plugin data |

### Data Structures

```typescript
interface ChatMessage {
    id: string;           // Generated: timestamp + random
    timestamp: number;    // Unix timestamp (ms)
    agentId: string;      // Agent identifier (e.g., 'main', 'nexus')
    agentName: string;    // Human-readable name
    role: 'user' | 'assistant';
    content: string;      // Message text
}

interface ChatHistory {
    messages: ChatMessage[];
    lastUpdated: number;  // Unix timestamp
}
```

### Dependencies

- `obsidian` - Plugin, WorkspaceLeaf, Notice, TFile
- `./settings` - ClawChatSettingTab, ClawChatSettings, DEFAULT_SETTINGS
- `./components/ChatView` - ChatView, VIEW_TYPE_CHAT
- `./utils/OpenClawClient` - OpenClawClient
- `./components/TokenModal` - TokenModal

### Lifecycle Events

1. **onload()** - Called when Obsidian loads the plugin
2. **onunload()** - Called when plugin is disabled or Obsidian closes
3. **Settings loaded** - Before history (settings needed for autoConnect)
4. **History loaded** - Before view opens (so messages available immediately)
5. **Client callbacks set** - Before potential auto-connect
6. **View registered** - Available to open
7. **Auto-connect** - If enabled and token exists

---

## src/components/ChatView.ts

### Purpose

Chat UI component that handles:
- Message rendering (user/agent messages with avatars)
- Input handling and message sending
- Agent selection dropdown
- File attachment context bar
- Slash command parsing
- Connection state UI (overlay when disconnected)
- Status polling for long-running requests

### Key Classes/Functions

#### `ChatView` (export)
Extends Obsidian's `ItemView`.

**Properties:**

| Property | Type | Purpose |
|----------|------|---------|
| `client` | OpenClawClient | WebSocket handler |
| `plugin` | ClawChatPlugin | Reference to main plugin |
| `messagesEl` | HTMLElement | Message container |
| `inputEl` | HTMLTextAreaElement | User input |
| `agentSelectEl` | HTMLSelectElement | Agent dropdown |
| `connectedOverlayEl` | HTMLElement | Connection prompt overlay |
| `contextBarEl` | HTMLElement | File attachment bar |
| `attachedFiles` | AttachedFile[] | Currently attached files |
| `isLoading` | boolean | Loading state |
| `sessionId` | string | Current chat session |
| `currentRunId` | string | Active run identifier |
| `processedRunIds` | Set<string> | Deduplication cache |

**Constants:**
- `RESPONSE_TIMEOUT_MS: 60000` - 10 minute timeout
- `STATUS_POLLING_MS: 60000` - Poll every minute after 1 min elapsed

**Key Methods:**

| Method | Purpose |
|--------|---------|
| `onOpen()` | Builds UI: header, messages, loading indicator, connect overlay, context bar, input |
| `setupCallbacks()` | Handles incoming WebSocket messages, connection state changes |
| `showConnected()` / `showDisconnected()` | Toggles UI based on connection |
| `renderHistory()` | Loads and displays all messages from `plugin.chatHistory` |
| `renderMessage(msg)` | Renders single message with avatar, sender name, bubble |
| `sendMessage()` | Sends user input via client, adds to history |
| `addMessage(role, text)` | Immediately renders message to UI |
| `showLoading()` / `hideLoading()` | Toggles loading spinner |
| `populateAgentDropdown(agents)` | Fills agent selector with available agents |
| `initContextFiles()` | Attaches current file if `includeVaultContext` enabled |
| `renderContextBar()` | Shows attached file chips |
| `handleSlashCommands()` | Detects `/` prefix, shows command palette |
| `showCommandPalette()` | Renders slash command options |
| `executeCommand(cmdId)` | Runs slash command (search, create, summarize, clear) |
| `startStatusPolling()` / `stopStatusPolling()` | Manages session status checks |
| `checkSessionStatus()` | Polls for run status, shows warnings at 1, 3, 5, 8 min |
| `showInfoText()` / `showErrorText()` | Displays temporary status messages |

### Data Structures

```typescript
interface AttachedFile {
    path: string;      // Full vault path
    name: string;      // Filename only
    content?: string;  // Optional cached content
}

const VIEW_TYPE_CHAT = 'clawchat-chat-view';
```

### Dependencies

- `obsidian` - ItemView, WorkspaceLeaf, Notice, TFile, FuzzySuggestModal, App
- `../utils/OpenClawClient` - OpenClawClient, AgentInfo
- `../main` - ClawChatPlugin, ChatMessage
- `./TokenModal` - TokenModal
- `../settings` - CONTEXT_SIZES, AGENT_COLORS, DEFAULT_AGENT_COLORS

### Lifecycle Events

1. **onOpen()** - Called when view leaf is opened
   - Creates DOM elements
   - Loads chat history
   - Sets up event listeners
   - Checks connection state
2. **Callbacks set** - During onOpen, but also updated dynamically
3. **Connection change** - Triggers UI updates via callbacks

---

## src/utils/OpenClawClient.ts

### Purpose

WebSocket client for communicating with OpenClaw Gateway:
- Connection management (connect/disconnect)
- Authentication via token
- Message sending and receiving
- Agent list fetching
- Session status polling

### Key Classes/Functions

#### `OpenClawClient` (export)

**Properties:**

| Property | Type | Purpose |
|----------|------|---------|
| `ws` | WebSocket \| null | Active connection |
| `url` | string | Gateway WebSocket URL |
| `token` | string | Authentication token |
| `connected` | boolean | Connection state |
| `agents` | AgentInfo[] | Cached agent list |
| `onMessage` | function | Received message handler |
| `onConnect` | function | Connected handler |
| `onDisconnect` | function | Disconnected handler |
| `onError` | function | Error handler |
| `onAuthError` | function | Auth failure handler |
| `onAgentsUpdated` | function | Agent list change handler |

**Methods:**

| Method | Purpose |
|--------|---------|
| `connect()` | Establishes WebSocket connection, waits for challenge/response |
| `isConnected()` | Returns connection state |
| `updateConfig(url, token)` | Updates URL/token, disconnects existing connection |
| `sendMessage(msg)` | Sends chat message, returns request ID |
| `fetchAgents()` | Requests agent list from gateway |
| `getSessionStatus(runId)` | Polls for session/run status |
| `disconnect()` | Closes WebSocket |
| `handleMessage(data)` | Routes incoming messages to appropriate handlers |
| `sendConnectRequest()` | Sends `connect` method request with auth token |
| `handleConnectChallenge(nonce)` | Responds to auth challenge (future use) |

### Data Structures

```typescript
interface ChatMessage {
    agent: string;                    // Agent ID
    content: string;                  // Message text
    context?: {                       // Optional context
        currentFile?: string;
        fileContent?: string;
    };
    sessionId?: string;               // Session key
}

interface GatewayMessage {
    type: 'req' | 'res' | 'event' | 'auth' | 'connected';
    event?: string;                   // Event name (e.g., 'connect.challenge', 'agent', 'chat')
    id?: string;                      // Request/response ID
    payload?: any;                    // Response data
    error?: any;                      // Error object
    ok?: boolean;                     // Success flag
}

interface AgentInfo {
    id: string;
    name?: string;
    identity?: {
        name?: string;
        theme?: string;
        emoji?: string;
        avatar?: string;
        avatarUrl?: string;
    };
}
```

### Connection Protocol

1. Connect to WebSocket URL
2. Wait for `connect.challenge` event
3. Send `connect` request with:
   - `minProtocol` / `maxProtocol`: 3
   - `client`: { id, version, platform, mode }
   - `role`: 'operator'
   - `scopes`: ['operator.read', 'operator.write', 'operator.admin']
   - `auth.token`: user's gateway token
4. Receive `hello-ok` response or `auth` event with `ok: true`
5. Connection established

### Dependencies

None (standalone utility class)

### Lifecycle Events

1. **WebSocket open** - Connection established
2. **connect.challenge** event - Auth challenge received
3. **hello-ok / auth ok** - Authentication successful
4. **Message events** - Agent/chat events received
5. **WebSocket close** - Connection lost

---

## src/settings.ts

### Purpose

Plugin settings management:
- Setting tab UI (ClawChatSettingTab)
- Default configuration values
- Agent color palette definitions

### Key Classes/Functions

#### `ClawChatSettingTab`
Extends Obsidian's `PluginSettingTab`.

**Methods:**

| Method | Purpose |
|--------|---------|
| `display()` | Renders all setting sections: Connection, Preferences, Context |

**Setting Sections:**

1. **Connection**
   - Status indicator (Connected/Disconnected)
   - Gateway URL text input
   - Auto-connect toggle
   - Reset Token button

2. **Preferences**
   - Default Agent dropdown
   - Agent Color picker (per-agent)
   - Include vault context toggle
   - Context size dropdown (small/medium/large/max)
   - Include chat history toggle
   - Chat history depth dropdown

3. **Context**
   - (Duplicated in display for organization)

### Data Structures

```typescript
interface ClawChatSettings {
    gatewayUrl: string;               // WebSocket URL (default: ws://127.0.0.1:18789)
    defaultAgent: string;             // Default agent ID
    lastAgent: string;                // Last selected agent (persists across sessions)
    agentColors: Record<string, string>; // Custom colors per agent
    includeVaultContext: boolean;     // Send current file content
    includeChatHistory: boolean;      // Include previous messages
    chatHistoryDepth: number;         // Number of previous messages
    contextSize: 'small' | 'medium' | 'large' | 'max';
    autoConnect: boolean;             // Connect on startup
}

const DEFAULT_SETTINGS: ClawChatSettings = {
    gatewayUrl: 'ws://127.0.0.1:18789',
    defaultAgent: '',
    lastAgent: '',
    agentColors: {},
    includeVaultContext: true,
    includeChatHistory: true,
    chatHistoryDepth: 5,
    contextSize: 'large',
    autoConnect: false
};

const CONTEXT_SIZES: Record<string, { label: string; chars: number }> = {
    'small': { label: 'Small (500 chars)', chars: 500 },
    'medium': { label: 'Medium (1500 chars)', chars: 1500 },
    'large': { label: 'Large (3000 chars)', chars: 3000 },
    'max': { label: 'Max (entire file)', chars: Infinity }
};

const AGENT_COLORS = [
    '#6366f1', '#f97316', '#10b981', '#ec4899', '#8b5cf6',
    '#06b6d4', '#f43f5e', '#84cc16', '#f59e0b', '#14b8a6'
];

const DEFAULT_AGENT_COLORS: Record<string, string> = {
    'main': '#6366f1',
    'nexus': '#6366f1',
    'aristotowl': '#f97316',
    'prism': '#ec4899',
    'orion': '#10b981',
};
```

### Dependencies

- `obsidian` - PluginSettingTab, Setting, App, Notice
- `./main` - ClawChatPlugin

---

## styles.css

### Purpose

All styling for the ChatView UI. Uses Obsidian CSS variables for theming compatibility.

### CSS Classes

#### Layout Containers

| Class | Purpose |
|-------|---------|
| `.clawchat-chat-container` | Main flex container, 100% height, padding |
| `.clawchat-header` | Top bar with title and agent selector |
| `.clawchat-messages` | Scrollable message area, flex column |
| `.clawchat-input-container` | Bottom input area with textarea and button |
| `.clawchat-context-bar` | File attachment chips bar |
| `.clawchat-connect-overlay` | Full-screen blur overlay when disconnected |

#### Header Elements

| Class | Purpose |
|-------|---------|
| `.clawchat-title` | Plugin title "🦞 ClawChat" |
| `.clawchat-header-right` | Flex container for agent selector |
| `.clawchat-agent-label` | "Agent:" label |
| `.clawchat-agent-select` | Agent dropdown select |

#### Messages

| Class | Purpose |
|-------|---------|
| `.clawchat-message-container` | Wrapper for message + avatar |
| `.clawchat-message-container-user` | User messages (right-aligned) |
| `.clawchat-message-container-agent` | Agent messages (left-aligned) |
| `.clawchat-avatar` | Agent avatar circle (32x32) |
| `.clawchat-avatar-img` | Image avatar fallback |
| `.clawchat-message-block` | Sender name + bubble container |
| `.clawchat-message-sender` | Sender name text |
| `.clawchat-message-bubble` | Message content bubble |
| `.clawchat-user-bubble` | Blue gradient user bubble |
| `.clawchat-user-block` | Aligns user content to right |

#### Input

| Class | Purpose |
|-------|---------|
| `.clawchat-input` | Multi-line textarea |
| `.clawchat-send-btn` | Send button (accent color) |

#### Context Bar

| Class | Purpose |
|-------|---------|
| `.clawchat-context-bar` | File attachment area |
| `.clawchat-context-add-btn` | "+ Add file" button |
| `.clawchat-context-file-chip` | Attached file chip |
| `.clawchat-context-file-name` | Filename in chip |
| `.clawchat-context-file-remove` | × remove button |

#### Loading/Status

| Class | Purpose |
|-------|---------|
| `.clawchat-loading` | Loading container |
| `.clawchat-spinner` | Animated spinner |
| `.clawchat-loading-text` | "Agent is thinking..." text |
| `.clawchat-info-text` | Temporary info message (fades) |
| `.clawchat-error-text` | Error message with background |

#### Connect Overlay

| Class | Purpose |
|-------|---------|
| `.clawchat-connect-overlay` | Blur backdrop |
| `.clawchat-connect-overlay-content` | Centered card |
| `.clawchat-connect-btn` | Connect button |
| `.clawchat-instructions` | Instruction list container |

#### Command Palette

| Class | Purpose |
|-------|---------|
| `.clawchat-command-palette` | Slash command dropdown |
| `.clawchat-command-item` | Individual command option |
| `.clawchat-command-label` | Command text |

#### Deprecated (backwards compat)

| Class | Purpose |
|-------|---------|
| `.clawchat-message` | Old single-div message |
| `.clawchat-message-user` | Old user style |
| `.clawchat-message-agent` | Old agent style |
| `.clawchat-message-text` | Old message text wrapper |

### CSS Variables Used

```css
var(--background-primary)       /* Main background */
var(--background-secondary)     /* Secondary background */
var(--background-modifier-border) /* Borders */
var(--background-modifier-hover) /* Hover state */
var(--background-modifier-form-field) /* Form fields */
var(--background-secondary-alt) /* Alt secondary */
var(--text-normal)              /* Body text */
var(--text-muted)               /* Muted text */
var(--text-error)               /* Error text */
var(--text-accent)              /* Accent text */
var(--text-on-accent)           /* Text on accent color */
var(--interactive-accent)       /* Primary button color */
var(--interactive-accent-hover) /* Button hover */
var(--font-monospace)           /* Code font */
```

---

## Data Structures

### Summary of All Interfaces

```typescript
// main.ts
interface ChatMessage {
    id: string;
    timestamp: number;
    agentId: string;
    agentName: string;
    role: 'user' | 'assistant';
    content: string;
}

interface ChatHistory {
    messages: ChatMessage[];
    lastUpdated: number;
}

// ChatView.ts
interface AttachedFile {
    path: string;
    name: string;
    content?: string;
}

// OpenClawClient.ts
interface ChatMessage {
    agent: string;
    content: string;
    context?: {
        currentFile?: string;
        fileContent?: string;
    };
    sessionId?: string;
}

interface GatewayMessage {
    type: string;
    event?: string;
    id?: string;
    payload?: any;
    error?: any;
    ok?: boolean;
}

interface AgentInfo {
    id: string;
    name?: string;
    identity?: {
        name?: string;
        theme?: string;
        emoji?: string;
        avatar?: string;
        avatarUrl?: string;
    };
}

// settings.ts
interface ClawChatSettings {
    gatewayUrl: string;
    defaultAgent: string;
    lastAgent: string;
    agentColors: Record<string, string>;
    includeVaultContext: boolean;
    includeChatHistory: boolean;
    chatHistoryDepth: number;
    contextSize: 'small' | 'medium' | 'large' | 'max';
    autoConnect: boolean;
}
```

---

## Lifecycle Events

### Plugin Lifecycle

```
onload()
├── loadSettings()
├── loadChatHistory()
├── loadToken()
├── new OpenClawClient()
├── setupClientCallbacks()
├── registerView(ChatView)
├── addRibbonIcon()
├── addCommand()
├── addSettingTab()
└── tryConnect() (if autoConnect && token)

onunload()
└── client.disconnect()
```

### View Lifecycle

```
ChatView.onOpen()
├── Build header
├── Build messages container
├── renderHistory()
├── Build loading indicator
├── createConnectOverlay()
├── Build context bar
├── Register workspace events
├── initContextFiles()
├── Build input container
├── setupCallbacks()
└── Check connection state
    ├── showConnected() (if connected)
    └── showConnectOverlay() (if not connected && !autoConnect)
```

### WebSocket Lifecycle

```
client.connect()
├── new WebSocket(url)
├── ws.onopen
├── ws.onmessage (handle connect.challenge)
├── sendConnectRequest()
├── ws.onmessage (handle hello-ok)
├── connected = true
└── onConnect() callback

Messages received:
├── Agent lifecycle events (phase: start/end, state: error)
├── Chat events (state: final)
└── Session status responses

client.disconnect()
├── ws.close()
├── connected = false
└── onDisconnect() callback
```

---

## Common Pitfalls & Tips

1. **Token Storage**: Uses Obsidian's Secret Storage, not plugin data. Token path includes plugin ID for isolation.

2. **History Loading**: Loads BEFORE view opens to ensure messages available immediately. File stored at `.clawchat/chat-history.json`.

3. **Message Deduplication**: Uses `processedRunIds` Set to prevent duplicate messages from gateway. Limited to 50 IDs.

4. **Session Management**: Each agent has its own `sessionId` stored in `sessionIds` Map. Switching agents changes session.

5. **Status Polling**: Starts after 1 minute of waiting, polls every minute. Shows warnings at 1, 3, 5, 8 minutes.

6. **Context Truncation**: File content truncated based on `contextSize` setting before sending to gateway.

7. **Slash Commands**: Parsed via regex `^\/(\w+)(?:\s+(.+))?$` - command + optional argument.

8. **Theme Compatibility**: Uses CSS variables (`var(--background-primary)`, etc.) for light/dark mode support.

---

*Generated for ClawChat v1.0+*