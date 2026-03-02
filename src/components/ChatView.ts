import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import { OpenClawClient, AgentInfo } from '../utils/OpenClawClient';
import ClawdianPlugin from '../main';
import { SetupCodeModal } from './SetupCodeModal';

export const VIEW_TYPE_CHAT = 'clawdian-chat-view';

export class ChatView extends ItemView {
    client: OpenClawClient;
    plugin: ClawdianPlugin;
    messagesEl: HTMLElement;
    inputEl: HTMLTextAreaElement;
    connectPromptEl: HTMLElement | null = null;
    inputContainerEl: HTMLElement | null = null;
    deviceIdDisplayEl: HTMLElement | null = null;
    agentSelectEl: HTMLSelectElement | null = null;

    constructor(leaf: WorkspaceLeaf, client: OpenClawClient, plugin: ClawdianPlugin) {
        super(leaf);
        this.client = client;
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText(): string {
        return 'Clawdian Chat';
    }

    getIcon(): string {
        return 'message-square';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('clawdian-chat-container');

        // Header
        const header = container.createEl('div', { cls: 'clawdian-header' });
        header.createEl('span', { text: '🦞 Clawdian', cls: 'clawdian-title' });

        this.agentSelectEl = header.createEl('select', { cls: 'clawdian-agent-select' });
        this.populateAgentDropdown();
        this.agentSelectEl.addEventListener('change', (e) => {
            this.plugin.settings.defaultAgent = (e.target as HTMLSelectElement).value;
            this.plugin.saveSettings();
        });

        // Messages area
        this.messagesEl = container.createEl('div', { cls: 'clawdian-messages' });

        // Connect/Prompt section
        this.connectPromptEl = this.messagesEl.createEl('div', {
            cls: 'clawdian-connect-prompt'
        });
        
        const statusIcon = this.connectPromptEl.createEl('div', { cls: 'clawdian-status-icon' });
        setIcon(statusIcon, 'plug');
        
        this.connectPromptEl.createEl('h3', { text: 'Not Connected', cls: 'clawdian-connect-title' });
        this.connectPromptEl.createEl('p', { 
            text: 'Click Connect to start chatting with your OpenClaw agents.',
            cls: 'clawdian-connect-desc'
        });
        
        // Device ID display (hidden initially)
        this.deviceIdDisplayEl = this.connectPromptEl.createEl('div', {
            cls: 'clawdian-device-id',
            attr: { style: 'display: none;' }
        });
        
        const btnContainer = this.connectPromptEl.createEl('div', { cls: 'clawdian-btn-container' });
        
        const connectBtn = btnContainer.createEl('button', {
            cls: 'clawdian-connect-btn',
            text: 'Connect'
        });
        connectBtn.addEventListener('click', async () => {
            connectBtn.setText('Connecting...');
            connectBtn.disabled = true;
            await this.tryConnect();
        });

        const setupCodeBtn = btnContainer.createEl('button', {
            cls: 'clawdian-setup-code-btn',
            text: 'Use Setup Code'
        });
        setupCodeBtn.addEventListener('click', () => {
            new SetupCodeModal(this.app, (url, token) => {
                // Update plugin settings
                this.plugin.settings.gatewayUrl = url;
                this.plugin.settings.gatewayToken = token;
                this.plugin.saveSettings();
                
                // Update client and connect
                this.client.updateConfig(url, token);
                this.tryConnect();
            }).open();
        });

        // Input area (hidden initially)
        this.inputContainerEl = container.createEl('div', {
            cls: 'clawdian-input-container',
            attr: { style: 'display: none;' }
        });
        
        this.inputEl = this.inputContainerEl.createEl('textarea', {
            cls: 'clawdian-input',
            placeholder: 'Type a message...'
        });

        const sendBtn = this.inputContainerEl.createEl('button', {
            cls: 'clawdian-send-btn',
            text: 'Send'
        });

        sendBtn.addEventListener('click', () => this.sendMessage());
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Setup callbacks BEFORE checking connection
        this.client.onMessage = (text: string) => {
            // Try to parse as JSON (chat events are structured)
            try {
                const data = JSON.parse(text);
                if (data.type === 'event' && data.event === 'chat' && data.payload?.message) {
                    // Extract text from structured chat response
                    const message = data.payload.message;
                    if (message.content && Array.isArray(message.content)) {
                        const textContent = message.content
                            .filter((item: any) => item.type === 'text')
                            .map((item: any) => item.text)
                            .join('');
                        this.addMessage('agent', textContent);
                        return;
                    }
                }
            } catch (e) {
                // Not JSON, treat as plain text
            }
            // Fallback to plain text handling
            this.addMessage('agent', text);
        };
        this.client.onConnect = () => {
            console.log('[Clawdian] ChatView onConnect called');
            this.showConnected();
            // Fetch agents after connecting
            this.fetchAndUpdateAgents();
        };
        this.client.onAgentsUpdated = (agents) => {
            this.populateAgentDropdown(agents);
        };
        this.client.onDisconnect = () => {
            console.log('[Clawdian] ChatView onDisconnect called');
            this.showDisconnected();
        };
        this.client.onAuthError = (msg) => {
            console.log('[Clawdian] Auth error in view:', msg);
        };
        this.client.onPairingRequired = (deviceId) => {
            this.showPairingRequired(deviceId);
        };

        // Check if already connected
        if (this.client.isConnected()) {
            console.log('[Clawdian] Already connected, showing chat');
            this.showConnected();
        }
    }

    async tryConnect() {
        const connectBtn = this.connectPromptEl?.querySelector('.clawdian-connect-btn') as HTMLButtonElement;
        
        try {
            await this.client.connect();
            // Success - handled by onConnect callback
        } catch (err: any) {
            console.log('[Clawdian] Connection failed:', err.message);
            // Check if it's a pairing error
            if (err.message.includes('pairing') || err.message.includes('device') || err.message.includes('unauthorized')) {
                // Pairing required - will be handled by onPairingRequired callback
            } else {
                // Other error
                if (connectBtn) {
                    connectBtn.setText('Connect');
                    connectBtn.disabled = false;
                }
                new Notice('Connection failed: ' + err.message);
            }
        }
    }

    async fetchAndUpdateAgents() {
        const agents = await this.client.fetchAgents();
        this.populateAgentDropdown(agents);
    }

    populateAgentDropdown(agents?: AgentInfo[]) {
        if (!this.agentSelectEl) return;
        
        // Clear existing options
        this.agentSelectEl.empty();
        
        // Use provided agents or fall back to stored agents
        const agentsList = agents?.length ? agents : this.client.getAgents();
        
        if (agentsList.length === 0) {
            // No agents available - show placeholder
            const option = this.agentSelectEl!.createEl('option', {
                text: 'No agents available',
                value: '',
                attr: { disabled: 'true', selected: 'true' }
            });
        } else {
            // Use fetched agents
            agentsList.forEach(agent => {
                const option = this.agentSelectEl!.createEl('option', { 
                    text: agent.name || agent.id,
                    value: agent.id 
                });
                if (agent.id === this.plugin.settings.defaultAgent) {
                    option.selected = true;
                }
            });
        }
    }

    showConnected() {
        console.log('[Clawdian] showConnected called');
        if (this.connectPromptEl) {
            this.connectPromptEl.style.display = 'none';
            console.log('[Clawdian] Hid connect prompt');
        }
        if (this.inputContainerEl) {
            this.inputContainerEl.style.display = 'flex';
            console.log('[Clawdian] Showed input container');
        }
        this.addMessage('agent', '✅ Connected to OpenClaw!');
    }

    showDisconnected() {
        if (this.connectPromptEl) {
            this.connectPromptEl.style.display = 'block';
            const connectBtn = this.connectPromptEl.querySelector('.clawdian-connect-btn') as HTMLButtonElement;
            if (connectBtn) {
                connectBtn.setText('Connect');
                connectBtn.disabled = false;
            }
            // Reset to initial state
            const title = this.connectPromptEl.querySelector('.clawdian-connect-title');
            if (title) title.setText('Not Connected');
            const desc = this.connectPromptEl.querySelector('.clawdian-connect-desc');
            if (desc) desc.setText('Click Connect to start chatting with your OpenClaw agents.');
            if (this.deviceIdDisplayEl) {
                this.deviceIdDisplayEl.style.display = 'none';
            }
        }
        if (this.inputContainerEl) {
            this.inputContainerEl.style.display = 'none';
        }
    }

    showPairingRequired(deviceId: string) {
        if (!this.connectPromptEl) return;
        
        // Update the connect prompt to show pairing instructions
        const title = this.connectPromptEl.querySelector('.clawdian-connect-title');
        if (title) title.setText('Pairing Required');
        
        const desc = this.connectPromptEl.querySelector('.clawdian-connect-desc');
        if (desc) {
            desc.setText('To authorize this device, run the command below in your terminal:');
        }
        
        // Show device ID and command
        if (this.deviceIdDisplayEl) {
            this.deviceIdDisplayEl.empty();
            this.deviceIdDisplayEl.style.display = 'block';
            
            const cmdEl = this.deviceIdDisplayEl.createEl('div', { cls: 'clawdian-terminal-command' });
            cmdEl.createEl('code', { text: `openclaw pairing approve ${deviceId}` });
            
            const copyBtn = this.deviceIdDisplayEl.createEl('button', {
                cls: 'clawdian-copy-btn',
                text: 'Copy Command'
            });
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(`openclaw pairing approve ${deviceId}`);
                new Notice('Command copied to clipboard!');
            });
            
            this.deviceIdDisplayEl.createEl('div', {
                cls: 'clawdian-device-id-label',
                text: `Device ID: ${deviceId}`
            });
        }
        
        // Update connect button
        const connectBtn = this.connectPromptEl.querySelector('.clawdian-connect-btn') as HTMLButtonElement;
        if (connectBtn) {
            connectBtn.setText('Retry Connection');
            connectBtn.disabled = false;
        }
    }

    async sendMessage() {
        if (!this.client.isConnected()) {
            new Notice('Not connected. Click Connect first.');
            return;
        }

        const text = this.inputEl.value.trim();
        if (!text) return;

        this.addMessage('user', text);
        this.inputEl.value = '';

        // Get vault context
        const context: any = {};
        if (this.plugin.settings.includeVaultContext) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                context.currentFile = activeFile.path;
                try {
                    const content = await this.app.vault.read(activeFile);
                    context.fileContent = content.slice(0, 5000);
                } catch (e) {
                    console.log('[Clawdian] Could not read file:', e);
                }
            }
        }

        try {
            await this.client.sendMessage({
                agent: this.plugin.settings.defaultAgent,
                content: text,
                context
            });
        } catch (err) {
            this.addMessage('agent', '⚠️ Failed to send. Connection lost?');
        }
    }

    addMessage(sender: 'user' | 'agent', text: string) {
        const msgEl = this.messagesEl.createEl('div', {
            cls: `clawdian-message clawdian-message-${sender}`
        });
        msgEl.createEl('div', {
            cls: 'clawdian-message-sender',
            text: sender === 'user' ? 'You' : this.plugin.settings.defaultAgent
        });
        msgEl.createEl('div', {
            cls: 'clawdian-message-text',
            text: text
        });
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
}
