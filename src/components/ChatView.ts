import { ItemView, WorkspaceLeaf, Notice, setIcon, TFile, FuzzySuggestModal, App } from 'obsidian';
import { OpenClawClient, AgentInfo } from '../utils/OpenClawClient';
import ClawdianPlugin from '../main';
import { SetupCodeModal } from './SetupCodeModal';
import { CONTEXT_SIZES, AGENT_COLORS, DEFAULT_AGENT_COLORS } from '../settings';

export const VIEW_TYPE_CHAT = 'clawdian-chat-view';

interface AttachedFile {
    path: string;
    name: string;
    content?: string;
}

export class ChatView extends ItemView {
    client: OpenClawClient;
    plugin: ClawdianPlugin;
    messagesEl: HTMLElement;
    inputEl: HTMLTextAreaElement;
    connectPromptEl: HTMLElement | null = null;
    inputContainerEl: HTMLElement | null = null;
    deviceIdDisplayEl: HTMLElement | null = null;
    agentSelectEl: HTMLSelectElement | null = null;
    loadingEl: HTMLElement | null = null;
    contextBarEl: HTMLElement | null = null;
    attachedFiles: AttachedFile[] = [];
    isLoading = false;
    lastProcessedRunId: string | null = null;
    sessionId: string;

    constructor(leaf: WorkspaceLeaf, client: OpenClawClient, plugin: ClawdianPlugin) {
        super(leaf);
        this.client = client;
        this.plugin = plugin;
        // Generate unique session ID for this chat instance
        this.sessionId = 'obsidian-chat-' + this.generateSessionId();
        console.log('[Clawdian] Created isolated chat session:', this.sessionId);
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
        
        // Agent selector in header (top right)
        const headerRight = header.createEl('div', { cls: 'clawdian-header-right' });
        headerRight.createEl('label', { text: 'Agent:', cls: 'clawdian-agent-label' });
        this.agentSelectEl = headerRight.createEl('select', { cls: 'clawdian-agent-select' });

        // Messages area
        this.messagesEl = container.createEl('div', { cls: 'clawdian-messages' });

        // Loading indicator
        this.loadingEl = container.createEl('div', { cls: 'clawdian-loading' });
        this.loadingEl.createEl('div', { cls: 'clawdian-spinner' });
        this.loadingEl.createEl('span', { text: 'Waiting for response...', cls: 'clawdian-loading-text' });
        this.loadingEl.style.display = 'none';

        // Create connect prompt (shown when not connected)
        this.connectPromptEl = container.createEl('div', { cls: 'clawdian-connect-prompt' });
        
        const connectBtn = this.connectPromptEl.createEl('button', {
            cls: 'clawdian-connect-btn',
            text: 'Connect'
        });
        connectBtn.addEventListener('click', () => this.tryConnect());
        
        // Device ID display area (for pairing)
        this.deviceIdDisplayEl = this.connectPromptEl.createEl('div', { cls: 'clawdian-device-id' });
        this.deviceIdDisplayEl.style.display = 'none';

        // Context bar (file attachments) - hidden until connected
        this.contextBarEl = container.createEl('div', { cls: 'clawdian-context-bar' });
        this.contextBarEl.style.display = 'none';

        // Register event listener for active file changes
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.updateCurrentFile();
        }));

        // Initialize context files
        this.initContextFiles();

        // Input container
        this.inputContainerEl = container.createEl('div', { cls: 'clawdian-input-container' });

        // Input area (full width)
        this.inputEl = this.inputContainerEl.createEl('textarea', {
            cls: 'clawdian-input',
            attr: { placeholder: 'Type your message...' }
        });

        // Send button
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
            console.log('[Clawdian] UI received message:', text);
            
            // Filter messages by session key - use the currently selected agent
            const selectedAgent = this.agentSelectEl?.value || 'main';
            const expectedSessionKey = `agent:${selectedAgent}:session:${this.sessionId}`;
            console.log('[Clawdian] Expected session key:', expectedSessionKey, 'selected agent:', selectedAgent);
            
            // Try to parse as JSON (responses are direct payload format)
            try {
                const data = JSON.parse(text);
                console.log('[Clawdian] Parsed data:', data);

                // Filter by session key - only process messages for this Obsidian session
                if (data.type === 'event' && data.event === 'chat' && data.payload?.sessionKey) {
                    const messageSessionKey = data.payload.sessionKey;
                    console.log('[Clawdian] Message session key:', messageSessionKey);
                    if (messageSessionKey !== expectedSessionKey) {
                        console.log('[Clawdian] Ignoring message for different session:', messageSessionKey);
                        return; // Skip this message
                    }
                }

                // Check if this is a direct chat payload (not wrapped in event)
                if (data.message && data.message.role === 'assistant' && data.message.content) {
                    console.log('[Clawdian] Found direct chat payload, extracting text...');
                    const message = data.message;
                    if (message.content && Array.isArray(message.content)) {
                        const textContent = message.content
                            .filter((item: any) => item.type === 'text')
                            .map((item: any) => item.text)
                            .join('');
                        console.log('[Clawdian] Extracted text:', textContent);
                        this.hideLoading();
                        this.addMessage('agent', textContent);
                        return;
                    }
                }

                // Check for wrapped event format (fallback)
                if (data.type === 'event' && data.event === 'chat') {
                    console.log('[Clawdian] Found chat event, checking payload...');
                    const message = data.payload?.message;
                    const state = data.payload?.state;
                    console.log('[Clawdian] Chat event state:', state);

                    // Only process final messages to avoid duplicates
                    if (state === 'final' && message) {
                        console.log('[Clawdian] Processing final message, extracting text...');
                        if (message.content && Array.isArray(message.content)) {
                            const textContent = message.content
                                .filter((item: any) => item.type === 'text')
                                .map((item: any) => item.text)
                                .join('');
                            console.log('[Clawdian] Extracted text from final chat event:', textContent);
                            this.hideLoading();
                            this.addMessage('agent', textContent);
                            return;
                        } else {
                            console.log('[Clawdian] Message content not in expected array format');
                        }
                    } else if (state !== 'final') {
                        console.log('[Clawdian] Skipping non-final message (state:, state, )');
                        return; // Skip delta messages entirely (state:', state, ')');
                    }
                }

                console.log('[Clawdian] Message does not match expected formats');
            } catch (e) {
                console.log('[Clawdian] Failed to parse as JSON:', e);
                // Not JSON, treat as plain text
            }
            // Fallback to plain text handling
            console.log('[Clawdian] Using fallback text handling');
            this.hideLoading();
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
        } else {
            console.log('[Clawdian] Not connected, showing connect prompt');
            this.showDisconnected();
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

    getAgentColor(agentId: string): string {
        return this.plugin.settings.agentColors[agentId] || 
               DEFAULT_AGENT_COLORS[agentId] || 
               AGENT_COLORS[0];
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
                // Use lastAgent if available, otherwise defaultAgent
                const selectedAgent = this.plugin.settings.lastAgent || this.plugin.settings.defaultAgent;
                if (agent.id === selectedAgent) {
                    option.selected = true;
                }
            });
            
            // Add change listener to save last agent
            this.agentSelectEl.addEventListener('change', async () => {
                const selectedValue = this.agentSelectEl?.value;
                if (selectedValue) {
                    this.plugin.settings.lastAgent = selectedValue;
                    await this.plugin.saveSettings();
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
        if (this.contextBarEl) {
            this.contextBarEl.style.display = 'flex';
        }
        if (this.inputContainerEl) {
            this.inputContainerEl.style.display = 'flex';
            console.log('[Clawdian] Showed input container');
        }
        this.addMessage('agent', '✅ Connected to OpenClaw!');
    }

    showDisconnected() {
        console.log('[Clawdian] showDisconnected called');
        if (this.connectPromptEl) {
            this.connectPromptEl.style.display = 'flex';
            const connectBtn = this.connectPromptEl.querySelector('.clawdian-connect-btn') as HTMLButtonElement;
            if (connectBtn) {
                connectBtn.setText('Connect');
                connectBtn.disabled = false;
            }
            if (this.deviceIdDisplayEl) {
                this.deviceIdDisplayEl.style.display = 'none';
            }
        }
        if (this.contextBarEl) {
            this.contextBarEl.style.display = 'none';
        }
        if (this.inputContainerEl) {
            this.inputContainerEl.style.display = 'none';
        }
    }

    showPairingRequired(deviceId: string) {
        if (!this.connectPromptEl) return;
        
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

    initContextFiles() {
        // Auto-add current file if setting is enabled and no files attached
        console.log('[Clawdian] initContextFiles - includeVaultContext:', this.plugin.settings.includeVaultContext, 'attachedFiles:', this.attachedFiles.length);
        if (this.plugin.settings.includeVaultContext && this.attachedFiles.length === 0) {
            const activeFile = this.app.workspace.getActiveFile();
            console.log('[Clawdian] initContextFiles - activeFile:', activeFile?.path);
            if (activeFile && activeFile.extension === 'md') {
                this.attachedFiles.push({
                    path: activeFile.path,
                    name: activeFile.name
                });
                console.log('[Clawdian] initContextFiles - added file:', activeFile.path);
            }
        }
        this.renderContextBar();
    }

    updateCurrentFile() {
        // Update context bar when active file changes (only if no files manually added)
        if (this.attachedFiles.length === 0 && this.plugin.settings.includeVaultContext) {
            const activeFile = this.app.workspace.getActiveFile();
            console.log('[Clawdian] updateCurrentFile - activeFile:', activeFile?.path);
            if (activeFile && activeFile.extension === 'md') {
                this.attachedFiles.push({
                    path: activeFile.path,
                    name: activeFile.name
                });
                this.renderContextBar();
            }
        }
    }

    renderContextBar() {
        if (!this.contextBarEl) return;
        this.contextBarEl.empty();

        // Add file button
        const addBtn = this.contextBarEl.createEl('button', {
            cls: 'clawdian-context-add-btn',
            text: '+ Add file'
        });
        addBtn.addEventListener('click', () => this.showFilePicker());

        // Render attached files
        const filesContainer = this.contextBarEl.createEl('div', { cls: 'clawdian-context-files' });
        this.attachedFiles.forEach((file, index) => {
            const fileChip = filesContainer.createEl('div', { cls: 'clawdian-context-file-chip' });
            fileChip.createEl('span', { text: file.name, cls: 'clawdian-context-file-name' });
            const removeBtn = fileChip.createEl('button', { cls: 'clawdian-context-file-remove', text: '×' });
            removeBtn.addEventListener('click', () => {
                this.attachedFiles.splice(index, 1);
                this.renderContextBar();
            });
        });
    }

    showFilePicker() {
        new FileSuggestModal(this.app, this).open();
    }

    async addFile(file: TFile) {
        // Check if already attached
        if (this.attachedFiles.some(f => f.path === file.path)) {
            new Notice('File already attached');
            return;
        }
        this.attachedFiles.push({
            path: file.path,
            name: file.name
        });
        this.renderContextBar();
    }

    async sendMessage() {
        if (!this.client.isConnected()) {
            new Notice('Not connected. Click Connect first.');
            return;
        }

        if (this.isLoading) {
            return; // Prevent multiple sends while loading
        }

        const text = this.inputEl.value.trim();
        if (!text) return;

        this.addMessage('user', text);
        this.inputEl.value = '';

        // Show loading spinner
        this.showLoading();

        // Get vault context from attached files
        const context: any = {};
        const maxChars = CONTEXT_SIZES[this.plugin.settings.contextSize].chars;
        
        if (this.attachedFiles.length > 0) {
            console.log('[Clawdian] Reading attached files:', this.attachedFiles.map(f => f.path));
            const fileContents: string[] = [];
            
            for (const file of this.attachedFiles) {
                try {
                    const tfile = this.app.vault.getAbstractFileByPath(file.path);
                    if (tfile instanceof TFile) {
                        const content = await this.app.vault.read(tfile);
                        const truncated = maxChars === Infinity ? content : content.slice(0, maxChars);
                        fileContents.push(`--- ${file.name} ---\n${truncated}`);
                        console.log('[Clawdian] Read file:', file.path, 'length:', truncated.length);
                    }
                } catch (e) {
                    console.log('[Clawdian] Could not read file:', file.path, e);
                }
            }
            
            if (fileContents.length > 0) {
                context.currentFile = this.attachedFiles.map(f => f.path).join(', ');
                context.fileContent = fileContents.join('\n\n');
            }
        } else {
            console.log('[Clawdian] No files attached, skipping context');
        }

        try {
            console.log('[Clawdian] Sending message with session ID:', this.sessionId);
            // Use selected agent from dropdown, or fall back to default
            const selectedAgent = this.agentSelectEl?.value || this.plugin.settings.defaultAgent;
            console.log('[Clawdian] Using agent:', selectedAgent);
            await this.client.sendMessage({
                agent: selectedAgent,
                content: text,
                context,
                sessionId: this.sessionId  // Use unique session for this chat
            });
        } catch (err) {
            this.addMessage('agent', '⚠️ Failed to send. Connection lost?');
        }
    }

    showLoading() {
        this.isLoading = true;
        if (this.loadingEl) {
            this.loadingEl.style.display = 'flex';
        }
    }

    hideLoading() {
        this.isLoading = false;
        if (this.loadingEl) {
            this.loadingEl.style.display = 'none';
        }
    }

    private generateSessionId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    addMessage(sender: 'user' | 'agent', text: string) {
        console.log('[Clawdian] addMessage called with sender:', sender, 'text:', text);
        const msgEl = this.messagesEl.createEl('div', {
            cls: `clawdian-message clawdian-message-${sender}`
        });
        
        // Use selected agent from dropdown for display name
        const agentId = this.agentSelectEl?.value || this.plugin.settings.defaultAgent;
        const agentName = this.agentSelectEl?.options[this.agentSelectEl.selectedIndex]?.text || agentId;
        
        // Apply agent color for agent messages
        if (sender === 'agent') {
            const agentColor = this.getAgentColor(agentId);
            msgEl.style.setProperty('--agent-color', agentColor);
            msgEl.addClass('clawdian-message-colored');
        }
        
        msgEl.createEl('div', {
            cls: 'clawdian-message-sender',
            text: sender === 'user' ? 'You' : agentName
        });
        msgEl.createEl('div', {
            cls: 'clawdian-message-text',
            text: text
        });
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        console.log('[Clawdian] Message added to UI');
    }
}

// File picker modal
class FileSuggestModal extends FuzzySuggestModal<TFile> {
    chatView: ChatView;

    constructor(app: App, chatView: ChatView) {
        super(app);
        this.chatView = chatView;
        this.setPlaceholder('Search files to add...');
    }

    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    getItemText(file: TFile): string {
        return file.basename;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.chatView.addFile(file);
    }
}
