import { ItemView, WorkspaceLeaf, Notice, setIcon, TFile, FuzzySuggestModal, App } from 'obsidian';
import { OpenClawClient, AgentInfo } from '../utils/OpenClawClient';
import ClawdianPlugin from '../main';
import { TokenModal } from './TokenModal';
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
    agentSelectEl: HTMLSelectElement | null = null;
    loadingEl: HTMLElement | null = null;
    contextBarEl: HTMLElement | null = null;
    attachedFiles: AttachedFile[] = [];
    isLoading = false;
    isStreaming = false;
    currentStreamingMessage: HTMLElement | null = null;
    streamingText: string = '';
    lastProcessedRunId: string | null = null;
    sessionId: string;
    currentAgentId: string = '';
    sessionIds: Map<string, string> = new Map();
    agentMessages: Map<string, Array<{sender: 'user' | 'agent', text: string}>> = new Map();
    responseTimeout: ReturnType<typeof setTimeout> | null = null;
    statusPollingInterval: ReturnType<typeof setInterval> | null = null;
    currentRunId: string | null = null;
    hasShownConnected = false;  // Track if connected message was shown
    processedRunIds = new Set<string>();  // Track processed messages to prevent duplicates
    readonly RESPONSE_TIMEOUT_MS = 60000;
    readonly STATUS_POLLING_MS = 60000;

    constructor(leaf: WorkspaceLeaf, client: OpenClawClient, plugin: ClawdianPlugin) {
        super(leaf);
        this.client = client;
        this.plugin = plugin;
        this.sessionId = 'obsidian-chat-' + this.generateSessionId();
        console.log('[Clawdian] Created chat session:', this.sessionId);
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
        
        // Agent selector
        const headerRight = header.createEl('div', { cls: 'clawdian-header-right' });
        headerRight.createEl('label', { text: 'Agent:', cls: 'clawdian-agent-label' });
        this.agentSelectEl = headerRight.createEl('select', { cls: 'clawdian-agent-select' });

        // Messages area
        this.messagesEl = container.createEl('div', { cls: 'clawdian-messages' });

        // Loading indicator
        this.loadingEl = container.createEl('div', { cls: 'clawdian-loading' });
        this.loadingEl.createEl('div', { cls: 'clawdian-spinner' });
        this.loadingEl.createEl('span', { cls: 'clawdian-loading-text' });
        this.updateLoadingText();
        this.loadingEl.style.display = 'none';

        // Connect prompt
        this.connectPromptEl = container.createEl('div', { cls: 'clawdian-connect-prompt' });
        const connectBtn = this.connectPromptEl.createEl('button', {
            cls: 'clawdian-connect-btn',
            text: 'Connect'
        });
        connectBtn.addEventListener('click', () => this.handleConnect());

        // Context bar
        this.contextBarEl = container.createEl('div', { cls: 'clawdian-context-bar' });
        this.contextBarEl.style.display = 'none';

        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.updateCurrentFile();
        }));

        this.initContextFiles();

        // Input container
        this.inputContainerEl = container.createEl('div', { cls: 'clawdian-input-container' });
        this.inputEl = this.inputContainerEl.createEl('textarea', {
            cls: 'clawdian-input',
            attr: { placeholder: 'Type your message...' }
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

        // Setup callbacks
        this.setupCallbacks();

        // Check connection
        if (this.client.isConnected()) {
            this.showConnected();
        } else {
            this.showDisconnected();
        }
    }

    setupCallbacks() {
        this.client.onMessage = (text: string) => {
            try {
                const data = JSON.parse(text);
                
                // Handle agent lifecycle events (start/end)
                if (data.type === 'event' && data.event === 'agent') {
                    const payload = data.payload;
                    
                    // Filter by session ID
                    if (payload?.sessionKey) {
                        const messageSessionId = payload.sessionKey.split(':session:')[1];
                        if (messageSessionId !== this.sessionId) return;
                    }
                    
                    // Handle lifecycle events
                    if (payload?.stream === 'lifecycle') {
                        if (payload?.data?.phase === 'start') {
                            console.log('[Clawdian] Agent started processing');
                        } else if (payload?.data?.phase === 'end') {
                            console.log('[Clawdian] Agent finished processing');
                        }
                    }
                    
                    // Handle errors
                    if (payload?.state === 'error') {
                        this.hideLoading();
                        this.showErrorText('⚠️ ' + (payload.error || 'An error occurred'));
                    }
                    return;
                }
                
                // Only handle chat events with final state - ignore agent events to avoid duplicates
                if (data.type === 'event' && data.event === 'chat') {
                    const payload = data.payload;
                    
                    // Filter by session ID
                    if (payload?.sessionKey) {
                        const messageSessionId = payload.sessionKey.split(':session:')[1];
                        if (messageSessionId !== this.sessionId) return;
                    }
                    
                    // Only process final messages
                    if (payload?.state === 'final' && payload?.message?.content) {
                        // Check for duplicate runId
                        const runId = payload.runId;
                        if (runId && this.processedRunIds.has(runId)) {
                            console.log('[Clawdian] Skipping duplicate message for runId:', runId);
                            return;
                        }
                        if (runId) {
                            this.processedRunIds.add(runId);
                            // Clean up old IDs after 100 messages
                            if (this.processedRunIds.size > 100) {
                                const ids = Array.from(this.processedRunIds);
                                this.processedRunIds = new Set(ids.slice(-50));
                            }
                        }
                        
                        const textContent = payload.message.content
                            .filter((item: any) => item.type === 'text')
                            .map((item: any) => item.text)
                            .join('');
                        this.hideLoading();
                        this.addMessage('agent', textContent);
                    }
                    return;
                }

            } catch (e) {
                // Ignore parse errors
            }
        };
        
        this.client.onConnect = () => {
            this.showConnected();
            this.fetchAndUpdateAgents();
        };
        
        this.client.onAgentsUpdated = (agents) => {
            this.populateAgentDropdown(agents);
        };
        
        this.client.onDisconnect = () => {
            this.showDisconnected();
        };
        
        this.client.onAuthError = (msg) => {
            this.showDisconnected();
            this.plugin.showTokenModal();
        };
    }

    async handleConnect() {
        if (this.client.isConnected()) {
            this.client.disconnect();
            this.showDisconnected();
            return;
        }
        
        await this.plugin.tryConnect();
        
        // Check if we're now connected (modal might have connected us)
        if (this.client.isConnected()) {
            this.showConnected();
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
        this.agentSelectEl.empty();
        const agentsList = agents?.length ? agents : this.client.getAgents();
        
        if (agentsList.length === 0) {
            this.agentSelectEl.createEl('option', {
                text: 'No agents available',
                value: '',
                attr: { disabled: 'true', selected: 'true' }
            });
        } else {
            agentsList.forEach(agent => {
                const option = this.agentSelectEl!.createEl('option', { 
                    text: agent.name || agent.id,
                    value: agent.id 
                });
                const selectedAgent = this.plugin.settings.lastAgent || this.plugin.settings.defaultAgent;
                if (agent.id === selectedAgent) option.selected = true;
            });
            
            this.agentSelectEl.addEventListener('change', async () => {
                const selectedValue = this.agentSelectEl?.value;
                if (selectedValue) {
                    this.plugin.settings.lastAgent = selectedValue;
                    await this.plugin.saveSettings();
                    if (!this.sessionIds.has(selectedValue)) {
                        this.sessionIds.set(selectedValue, 'obsidian-chat-' + this.generateSessionId());
                    }
                    this.sessionId = this.sessionIds.get(selectedValue)!;
                    this.currentAgentId = selectedValue;
                }
            });
        }
    }

    showConnected() {
        if (this.connectPromptEl) this.connectPromptEl.style.display = 'none';
        if (this.contextBarEl) this.contextBarEl.style.display = 'flex';
        if (this.inputContainerEl) this.inputContainerEl.style.display = 'flex';
        // Only show connected message once per session
        if (!this.hasShownConnected) {
            this.showInfoText('✅ Connected to OpenClaw');
            this.hasShownConnected = true;
        }
    }

    showDisconnected() {
        if (this.connectPromptEl) {
            this.connectPromptEl.style.display = 'flex';
            const btn = this.connectPromptEl.querySelector('.clawdian-connect-btn') as HTMLButtonElement;
            if (btn) {
                btn.setText('Connect');
                btn.disabled = false;
            }
        }
        if (this.contextBarEl) this.contextBarEl.style.display = 'none';
        if (this.inputContainerEl) this.inputContainerEl.style.display = 'none';
    }

    initContextFiles() {
        if (this.plugin.settings.includeVaultContext && this.attachedFiles.length === 0) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && activeFile.extension === 'md') {
                this.attachedFiles.push({ path: activeFile.path, name: activeFile.name });
            }
        }
        this.renderContextBar();
    }

    updateCurrentFile() {
        if (this.attachedFiles.length === 0 && this.plugin.settings.includeVaultContext) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && activeFile.extension === 'md') {
                this.attachedFiles.push({ path: activeFile.path, name: activeFile.name });
                this.renderContextBar();
            }
        }
    }

    renderContextBar() {
        if (!this.contextBarEl) return;
        this.contextBarEl.empty();

        const addBtn = this.contextBarEl.createEl('button', {
            cls: 'clawdian-context-add-btn',
            text: '+ Add file'
        });
        addBtn.addEventListener('click', () => new FileSuggestModal(this.app, this).open());

        const filesContainer = this.contextBarEl.createEl('div', { cls: 'clawdian-context-files' });
        this.attachedFiles.forEach((file, index) => {
            const chip = filesContainer.createEl('div', { cls: 'clawdian-context-file-chip' });
            chip.createEl('span', { text: file.name, cls: 'clawdian-context-file-name' });
            const removeBtn = chip.createEl('button', { cls: 'clawdian-context-file-remove', text: '×' });
            removeBtn.addEventListener('click', () => {
                this.attachedFiles.splice(index, 1);
                this.renderContextBar();
            });
        });
    }

    async addFile(file: TFile) {
        if (this.attachedFiles.some(f => f.path === file.path)) {
            new Notice('File already attached');
            return;
        }
        this.attachedFiles.push({ path: file.path, name: file.name });
        this.renderContextBar();
    }

    async sendMessage() {
        if (!this.client.isConnected()) {
            new Notice('Not connected. Click Connect first.');
            return;
        }
        if (this.isLoading) return;

        const text = this.inputEl.value.trim();
        if (!text) return;

        this.addMessage('user', text);
        this.inputEl.value = '';
        this.showLoading();

        const context: any = {};
        const maxChars = CONTEXT_SIZES[this.plugin.settings.contextSize].chars;
        
        if (this.attachedFiles.length > 0) {
            const fileContents: string[] = [];
            for (const file of this.attachedFiles) {
                try {
                    const tfile = this.app.vault.getAbstractFileByPath(file.path);
                    if (tfile instanceof TFile) {
                        const content = await this.app.vault.read(tfile);
                        const truncated = maxChars === Infinity ? content : content.slice(0, maxChars);
                        fileContents.push(`--- ${file.name} ---\n${truncated}`);
                    }
                } catch (e) {
                    console.log('[Clawdian] Could not read file:', file.path, e);
                }
            }
            if (fileContents.length > 0) {
                context.currentFile = this.attachedFiles.map(f => f.path).join(', ');
                context.fileContent = fileContents.join('\n\n');
            }
        }

        try {
            const selectedAgent = this.agentSelectEl?.value || this.plugin.settings.defaultAgent;
            const runId = await this.client.sendMessage({
                agent: selectedAgent,
                content: text,
                context,
                sessionId: this.sessionId
            });
            // Store runId for status polling
            this.currentRunId = runId;
            console.log('[Clawdian] Message sent, runId:', runId);
        } catch (err) {
            this.hideLoading();
            this.addMessage('agent', '⚠️ Failed to send. Connection lost?');
        }
    }

    showLoading() {
        this.isLoading = true;
        if (this.loadingEl) this.loadingEl.style.display = 'flex';
        // Scroll to show loading indicator
        requestAnimationFrame(() => {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
        // Start status polling every 60 seconds
        this.startStatusPolling();
        // Set a timeout to show a message if taking too long
        this.responseTimeout = setTimeout(() => {
            if (this.isLoading) {
                this.showInfoText('⏳ Agent is still thinking... This may take a while.');
            }
        }, this.RESPONSE_TIMEOUT_MS);
    }

    hideLoading() {
        this.isLoading = false;
        if (this.loadingEl) this.loadingEl.style.display = 'none';
        // Stop status polling
        this.stopStatusPolling();
        // Clear the timeout
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
        }
        // Clear the runId
        this.currentRunId = null;
    }

    updateLoadingText() {
        if (!this.loadingEl) return;
        const agentId = this.agentSelectEl?.value || this.plugin.settings.defaultAgent || 'Agent';
        const agentName = (this.agentSelectEl && this.agentSelectEl.selectedIndex >= 0 
            ? this.agentSelectEl.options[this.agentSelectEl.selectedIndex]?.text 
            : null) || agentId;
        const loadingText = this.loadingEl.querySelector('.clawdian-loading-text');
        if (loadingText) loadingText.setText(`${agentName} is thinking...`);
    }

    startStreamingMessage() {
        const agentId = this.agentSelectEl?.value || this.plugin.settings.defaultAgent;
        const agentName = this.agentSelectEl?.options[this.agentSelectEl.selectedIndex]?.text || agentId;
        const agentColor = this.getAgentColor(agentId);
        const agents = this.client.getAgents();
        const agent = agents.find(a => a.id === agentId);
        
        let avatar = agentName.charAt(0).toUpperCase();
        let useImageAvatar = false;
        if (agent?.identity?.emoji) avatar = agent.identity.emoji;
        else if (agent?.identity?.avatarUrl) { avatar = agent.identity.avatarUrl; useImageAvatar = true; }
        else if (agent?.identity?.avatar) { avatar = agent.identity.avatar; useImageAvatar = true; }
        
        const msgContainer = this.messagesEl.createEl('div', {
            cls: 'clawdian-message-container clawdian-message-container-agent clawdian-streaming'
        });
        msgContainer.style.setProperty('--agent-color', agentColor);
        
        const avatarEl = msgContainer.createEl('div', { cls: 'clawdian-avatar' });
        if (useImageAvatar) {
            const img = avatarEl.createEl('img', { cls: 'clawdian-avatar-img', attr: { src: avatar, alt: agentName } });
            img.onerror = () => { avatarEl.empty(); avatarEl.setText(agentName.charAt(0).toUpperCase()); };
        } else {
            avatarEl.setText(avatar);
        }
        avatarEl.style.backgroundColor = agentColor;
        
        const messageBlock = msgContainer.createEl('div', { cls: 'clawdian-message-block' });
        messageBlock.createEl('div', { cls: 'clawdian-message-sender', text: agentName });
        this.currentStreamingMessage = messageBlock.createEl('div', {
            cls: 'clawdian-message-bubble clawdian-streaming-bubble',
            text: '▋'
        });
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    updateStreamingMessage(text: string) {
        if (this.currentStreamingMessage) {
            this.currentStreamingMessage.setText(text + '▋');
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    finishStreamingMessage(text: string) {
        if (this.currentStreamingMessage) {
            this.currentStreamingMessage.setText(text);
            this.currentStreamingMessage.parentElement?.parentElement?.removeClass('clawdian-streaming');
            this.currentStreamingMessage = null;
        }
    }

    startStatusPolling() {
        this.stopStatusPolling();
        this.statusPollingInterval = setInterval(() => this.checkSessionStatus(), this.STATUS_POLLING_MS);
    }

    stopStatusPolling() {
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
        }
    }

    async checkSessionStatus() {
        if (!this.currentRunId || !this.client.isConnected()) return;
        try {
            const status = await this.client.getSessionStatus(this.currentRunId);
            if (status) this.showInfoText(`⏳ Agent is ${status}...`);
        } catch (err) {
            console.log('[Clawdian] Status check failed:', err);
        }
    }

    showInfoText(text: string) {
        const infoEl = this.messagesEl.createEl('div', { cls: 'clawdian-info-text', text });
        setTimeout(() => infoEl.remove(), 5000);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    showErrorText(text: string) {
        const errorEl = this.messagesEl.createEl('div', { cls: 'clawdian-error-text', text });
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    generateSessionId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    addMessage(sender: 'user' | 'agent', text: string) {
        const agentId = this.agentSelectEl?.value || this.plugin.settings.defaultAgent;
        const agentName = this.agentSelectEl?.options[this.agentSelectEl.selectedIndex]?.text || agentId;
        const agentColor = this.getAgentColor(agentId);
        const agents = this.client.getAgents();
        const agent = agents.find(a => a.id === agentId);
        
        let avatar = agentName.charAt(0).toUpperCase();
        let useImageAvatar = false;
        if (agent?.identity?.emoji) avatar = agent.identity.emoji;
        else if (agent?.identity?.avatarUrl) { avatar = agent.identity.avatarUrl; useImageAvatar = true; }
        else if (agent?.identity?.avatar) { avatar = agent.identity.avatar; useImageAvatar = true; }
        
        const msgContainer = this.messagesEl.createEl('div', {
            cls: `clawdian-message-container clawdian-message-container-${sender}`
        });
        
        if (sender === 'agent') {
            msgContainer.style.setProperty('--agent-color', agentColor);
            const avatarEl = msgContainer.createEl('div', { cls: 'clawdian-avatar' });
            if (useImageAvatar) {
                const img = avatarEl.createEl('img', { cls: 'clawdian-avatar-img', attr: { src: avatar, alt: agentName } });
                img.onerror = () => { avatarEl.empty(); avatarEl.setText(agentName.charAt(0).toUpperCase()); };
            } else {
                avatarEl.setText(avatar);
            }
            avatarEl.style.backgroundColor = agentColor;
            const messageBlock = msgContainer.createEl('div', { cls: 'clawdian-message-block' });
            messageBlock.createEl('div', { cls: 'clawdian-message-sender', text: agentName });
            messageBlock.createEl('div', { cls: 'clawdian-message-bubble', text });
        } else {
            const messageBlock = msgContainer.createEl('div', { cls: 'clawdian-message-block clawdian-user-block' });
            messageBlock.createEl('div', { cls: 'clawdian-message-sender clawdian-user-sender', text: 'You' });
            messageBlock.createEl('div', { cls: 'clawdian-message-bubble clawdian-user-bubble', text });
        }
        
        // Scroll to bottom after message is added (use requestAnimationFrame for DOM update)
        requestAnimationFrame(() => {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
    }
}

class FileSuggestModal extends FuzzySuggestModal<TFile> {
    chatView: ChatView;
    constructor(app: App, chatView: ChatView) {
        super(app);
        this.chatView = chatView;
        this.setPlaceholder('Search files to add...');
    }
    getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
    getItemText(file: TFile): string { return file.basename; }
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void { this.chatView.addFile(file); }
}