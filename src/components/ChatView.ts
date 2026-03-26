import { ItemView, WorkspaceLeaf, Notice, TFile, FuzzySuggestModal, App, Setting } from 'obsidian';
import { OpenClawClient, AgentInfo } from '../utils/OpenClawClient';
import ClawChatPlugin, { ChatMessage } from '../main';
import { CONTEXT_SIZES, AGENT_COLORS, DEFAULT_AGENT_COLORS } from '../settings';

export const VIEW_TYPE_CHAT = 'clawchat-chat-view';

interface AttachedFile {
    path: string;
    name: string;
    content?: string;
}

export class ChatView extends ItemView {
    client: OpenClawClient;
    plugin: ClawChatPlugin;
    messagesEl: HTMLElement;
    inputEl: HTMLTextAreaElement;
    connectOverlayEl: HTMLElement | null = null;
    inputContainerEl: HTMLElement | null = null;
    agentSelectEl: HTMLSelectElement | null = null;
    loadingEl: HTMLElement | null = null;
    contextBarEl: HTMLElement | null = null;
    attachedFiles: AttachedFile[] = [];
    isLoading = false;
    isStreaming = false;
    currentStreamingMessage: HTMLElement | null = null;
    streamingText = '';
    sessionId: string;
    sessionIds: Map<string, string> = new Map();
    responseTimeout: ReturnType<typeof setTimeout> | null = null;
    statusPollingInterval: ReturnType<typeof setInterval> | null = null;
    currentRunId: string | null = null;
    currentAgentId = '';
    messageStartTime = 0;
    hasShownConnected = false;
    processedRunIds = new Set<string>();
    readonly RESPONSE_TIMEOUT_MS = 60000;
    readonly STATUS_POLLING_MS = 60000;
    private commandPaletteEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, client: OpenClawClient, plugin: ClawChatPlugin) {
        super(leaf);
        this.client = client;
        this.plugin = plugin;
        this.sessionId = 'obsidian-chat-' + this.generateSessionId();
    }

    getViewType(): string { return VIEW_TYPE_CHAT; }
    getDisplayText(): string { return 'Clawchat'; }
    getIcon(): string { return 'message-square'; }

     
    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('clawchat-chat-container');

        // Header
        const header = container.createEl('div', { cls: 'clawchat-header' });
        header.createEl('span', { text: '🦞 claw chat', cls: 'clawchat-title' });
        
        // Agent selector
        const headerRight = header.createEl('div', { cls: 'clawchat-header-right' });
        headerRight.createEl('label', { text: 'Agent:', cls: 'clawchat-agent-label' });
        this.agentSelectEl = headerRight.createEl('select', { cls: 'clawchat-agent-select' });

        // Messages area
        this.messagesEl = container.createEl('div', { cls: 'clawchat-messages' });

        // Render history FIRST (before connection UI)
        // Small delay to ensure plugin.onload() has completed
        setTimeout(() => { void this.renderHistory(); }, 50);

        // Loading indicator
        this.loadingEl = container.createEl('div', { cls: 'clawchat-loading' });
        this.loadingEl.createEl('div', { cls: 'clawchat-spinner' });
        this.loadingEl.createEl('span', { cls: 'clawchat-loading-text' });
        this.updateLoadingText();
        this.loadingEl.addClass('clawchat-hidden');

        // Connect overlay (shown if NOT connected)
        this.createConnectOverlay(container);

        // Context bar (file attachments)
        this.contextBarEl = container.createEl('div', { cls: 'clawchat-context-bar' });
        this.contextBarEl.addClass('clawchat-hidden');

        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.updateCurrentFile();
        }));

        this.initContextFiles();

        // Input container
        this.inputContainerEl = container.createEl('div', { cls: 'clawchat-input-container' });
        this.inputContainerEl.addClass('clawchat-hidden');

        this.inputEl = this.inputContainerEl.createEl('textarea', {
            cls: 'clawchat-input',
            attr: { placeholder: 'Type your message...' }
        });

        const sendBtn = this.inputContainerEl.createEl('button', {
            cls: 'clawchat-send-btn',
            text: 'Send'
        });

        sendBtn.addEventListener('click', () => { void this.sendMessage(); });
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.sendMessage();
            }
        });
        this.inputEl.addEventListener('input', () => this.handleSlashCommands());

        this.setupCallbacks();

        // Check connection - always show overlay if not connected
        if (this.client.isConnected()) {
            this.showConnected();
        } else {
            this.showConnectOverlay();
        }
    }

    createConnectOverlay(container: HTMLElement) {
        this.connectOverlayEl = container.createEl('div', { cls: 'clawchat-connect-overlay' });
        this.connectOverlayEl.addClass('clawchat-hidden');
        
        const overlayContent = this.connectOverlayEl.createEl('div', { cls: 'clawchat-connect-overlay-content' });
        new Setting(overlayContent).setName('Connect to openclaw').setHeading();
        
        const instructions = overlayContent.createEl('div', { cls: 'clawchat-instructions' });
        instructions.createEl('p', { text: 'To connect:' });
        
        const ol = instructions.createEl('ol');
        const step1 = ol.createEl('li');
        step1.createEl('span', { text: 'Run ' });
        step1.createEl('code', { text: 'Openclaw dashboard' });
        
        ol.createEl('li', { text: 'Click "overview" and copy the gateway token' });
        ol.createEl('li', { text: 'Click connect below and paste the token' });

        const connectBtn = overlayContent.createEl('button', {
            cls: 'clawchat-connect-btn',
            text: 'Connect'
        });
        
        connectBtn.addEventListener('click', () => {
            void (async () => {
                const connected = await this.plugin.tryConnect();
                if (connected) {
                    this.showConnected();
                } else {
                    this.plugin.showTokenModal();
                }
            })();
        });
        void connectBtn;
    }

    showConnectOverlay() {
        if (this.connectOverlayEl) {
            this.connectOverlayEl.removeClass('clawchat-hidden');
            this.connectOverlayEl.addClass('clawchat-visible');
        }
    }

    hideConnectOverlay() {
        if (this.connectOverlayEl) {
            this.connectOverlayEl.addClass('clawchat-hidden');
            this.connectOverlayEl.removeClass('clawchat-visible');
        }
    }

    setupCallbacks() {
        this.client.onMessage = (text: string) => {
            void (async () => {
                try {
                    const data = JSON.parse(text);
                    
                    // Handle agent lifecycle events
                    if (data.type === 'event' && data.event === 'agent') {
                        const payload = data.payload;
                        
                        if (payload?.sessionKey) {
                            const messageSessionId = payload.sessionKey.split(':session:')[1];
                            if (messageSessionId !== this.sessionId) return;
                        }
                        
                        if (payload?.stream === 'lifecycle') {
                            if (payload?.data?.phase === 'start') {
                                this.messageStartTime = Date.now();
                            }
                        }
                        
                        if (payload?.state === 'error') {
                            const errorMsg = payload?.error || 'an error occurred';
                            const isAborted = errorMsg.includes('aborted') || errorMsg.includes('timeout');
                            
                            this.hideLoading();
                            
                            if (isAborted) {
                                this.showErrorText('⚠️ Agent timed out after 10 minutes. Try a shorter request.');
                            } else {
                                this.showErrorText('⚠️ ' + errorMsg);
                            }
                        }
                        return;
                    }
                    
                    // Handle chat events
                    if (data.type === 'event' && data.event === 'chat') {
                        const payload = data.payload;
                        
                        if (payload?.sessionKey) {
                            const messageSessionId = payload.sessionKey.split(':session:')[1];
                            if (messageSessionId !== this.sessionId) return;
                        }
                        
                        // Hide loading on any chat response
                        if (payload?.state === 'final' || payload?.state === 'complete' || payload?.state === 'done') {
                            this.hideLoading();
                        }
                        
                        // Also hide loading if we receive any message content
                        if (payload?.message?.content && payload?.message?.content.length > 0) {
                            this.hideLoading();
                        }
                        
                        if (payload?.state === 'final' && payload?.message?.content) {
                            const runId = payload.runId;
                            if (runId && this.processedRunIds.has(runId)) {
                                return;
                            }
                            if (runId) {
                                this.processedRunIds.add(runId);
                                if (this.processedRunIds.size > 100) {
                                    const ids = Array.from(this.processedRunIds);
                                    this.processedRunIds = new Set(ids.slice(-50));
                                }
                            }
                            
                            interface MessageContent {
                                type: string;
                                text?: string;
                            }
                            const textContent = payload.message.content
                                .filter((item: MessageContent) => item.type === 'text')
                                .map((item: MessageContent) => item.text || '')
                                .join('');
                            
                            // Get agent info - use payload agent if available, fallback to selected
                            const agentId = payload.agent || this.agentSelectEl?.value || this.plugin.settings.defaultAgent || 'main';
                            const agentName = this.agentSelectEl?.options[this.agentSelectEl.selectedIndex]?.text || agentId;
                            const agentEmoji = this.getAgentEmoji(agentId);
                            
                            // Save to history
                            await this.plugin.addMessageToHistory({
                                agentId,
                                agentName,
                                agentEmoji,
                                role: 'assistant',
                                content: textContent
                            });
                            
                            this.hideLoading();
                            this.addMessage('assistant', textContent, agentEmoji);
                        }
                        return;
                    }

                } catch {
                    // Ignore parse errors
                }
            })();
        };
        
        this.client.onConnect = () => {
            this.showConnected();
            void this.fetchAndUpdateAgents();
        };
        
        this.client.onAgentsUpdated = (agents) => {
            this.populateAgentDropdown(agents);
        };
        
        this.client.onDisconnect = () => {
            this.showDisconnected();
        };
        
        this.client.onAuthError = (_msg) => {
            this.showDisconnected();
            this.plugin.showTokenModal();
        };
    }

    private sanitizeInput(input: string): string {
        // Remove potentially dangerous characters
        return input.replace(/[<>]/g, '').trim();
    }

    private validateCommand(cmdId: string): boolean {
        const allowedCommands = ['search', 'create', 'summarize', 'clear'];
        return allowedCommands.includes(cmdId);
    }

    async handleConnect() {
        if (this.client.isConnected()) {
            this.client.disconnect();
            this.showDisconnected();
            return;
        }
        
        const connected = await this.plugin.tryConnect();
        
        if (connected) {
            this.showConnected();
        } else {
            // No token or connection failed - show modal to enter credentials
            this.plugin.showTokenModal();
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

    getAgentEmoji(agentId: string): string | undefined {
        const agents = this.client.getAgents();
        const agent = agents.find(a => a.id === agentId);
        return agent?.identity?.emoji;
    }

    private getAgentDisplayInfo(agentId: string): { avatar: string; useImageAvatar: boolean; color: string; name: string } {
        const agents = this.client.getAgents();
        const agent = agents.find(a => a.id === agentId);
        const agentName = agent?.name || agentId;
        const agentColor = this.getAgentColor(agentId);
        
        let avatar = agentName.charAt(0).toUpperCase();
        let useImageAvatar = false;
        
        if (agent?.identity?.emoji) avatar = agent.identity.emoji;
        else if (agent?.identity?.avatarUrl) { avatar = agent.identity.avatarUrl; useImageAvatar = true; }
        else if (agent?.identity?.avatar) { avatar = agent.identity.avatar; useImageAvatar = true; }
        
        return { avatar, useImageAvatar, color: agentColor, name: agentName };
    }

    populateAgentDropdown(agents?: AgentInfo[]) {
        if (!this.agentSelectEl) return;
        const selectEl = this.agentSelectEl;
        selectEl.empty();
        const agentsList = agents?.length ? agents : this.client.getAgents();
        
        if (agentsList.length === 0) {
            selectEl.createEl('option', {
                text: 'No agents available',
                value: '',
                attr: { disabled: 'true', selected: 'true' }
            });
        } else {
            agentsList.forEach(agent => {
                const option = selectEl.createEl('option', { 
                    text: agent.name || agent.id,
                    value: agent.id 
                });
                const selectedAgent = this.plugin.settings.lastAgent || this.plugin.settings.defaultAgent;
                if (agent.id === selectedAgent) option.selected = true;
            });
            
            selectEl.addEventListener('change', () => {
                void (async () => {
                    const selectedValue = selectEl.value;
                    if (selectedValue) {
                        this.plugin.settings.lastAgent = selectedValue;
                        await this.plugin.saveSettings();
                        if (!this.sessionIds.has(selectedValue)) {
                            this.sessionIds.set(selectedValue, 'obsidian-chat-' + this.generateSessionId());
                        }
                        this.sessionId = this.sessionIds.get(selectedValue) ?? this.generateSessionId();
                        this.currentAgentId = selectedValue;
                        
                        // Re-render history for this agent
                        this.renderHistory();
                    }
                })();
            });
        }
    }

    showConnected() {
        this.hideConnectOverlay();
        if (this.connectOverlayEl) this.connectOverlayEl.addClass('clawchat-hidden');
        if (this.contextBarEl) {
            this.contextBarEl.removeClass('clawchat-hidden');
            this.contextBarEl.addClass('clawchat-visible');
        }
        if (this.inputContainerEl) {
            this.inputContainerEl.removeClass('clawchat-hidden');
            this.inputContainerEl.addClass('clawchat-visible');
        }
        
        // Only show notice once
        if (!this.hasShownConnected) {
            new Notice('🦞 connected');
            this.hasShownConnected = true;
        }
    }

    showDisconnected() {
        if (!this.plugin.settings.autoConnect) {
            this.showConnectOverlay();
        }
        if (this.contextBarEl) this.contextBarEl.addClass('clawchat-hidden');
        if (this.inputContainerEl) this.inputContainerEl.addClass('clawchat-hidden');
    }

    renderHistory() {
        if (!this.messagesEl) return;
        
        // Clear existing messages
        this.messagesEl.empty();
        
        // Show ALL messages (global history - group chat style)
        const messages = this.plugin.chatHistory?.messages || [];
        
        if (!messages || messages.length === 0) {
            // Optionally show a placeholder
            this.messagesEl.createEl('div', { 
                cls: 'clawchat-empty-history',
                text: 'No chat history yet. Start a conversation!' 
            });
            return;
        }
        
        messages.forEach((msg) => {
            this.renderMessage(msg);
        });
        
        // Scroll to bottom
        requestAnimationFrame(() => {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
    }

    renderMessage(msg: ChatMessage) {
        const agentId = msg.agentId;
        const agentName = msg.agentName || agentId;
        const agentColor = this.getAgentColor(agentId);
        const agents = this.client.getAgents();
        const agent = agents.find(a => a.id === agentId);
        
        let avatar = agentName.charAt(0).toUpperCase();
        let useImageAvatar = false;
        // Use saved emoji from message if available, otherwise get from agent identity
        if (msg.agentEmoji) avatar = msg.agentEmoji;
        else if (agent?.identity?.emoji) avatar = agent.identity.emoji;
        else if (agent?.identity?.avatarUrl) { avatar = agent.identity.avatarUrl; useImageAvatar = true; }
        else if (agent?.identity?.avatar) { avatar = agent.identity.avatar; useImageAvatar = true; }
        
        if (msg.role === 'user') {
            const msgContainer = this.messagesEl.createEl('div', {
                cls: 'clawchat-message-container clawchat-message-container-user'
            });
            const block = msgContainer.createEl('div', { cls: 'clawchat-message-block clawchat-user-block' });
            block.createEl('div', { cls: 'clawchat-message-sender clawchat-user-sender', text: 'You' });
            block.createEl('div', { cls: 'clawchat-message-bubble clawchat-user-bubble', text: msg.content });
        } else {
            const msgContainer = this.messagesEl.createEl('div', {
                cls: 'clawchat-message-container clawchat-message-container-agent'
            });
            msgContainer.style.setProperty('--agent-color', agentColor);
            
            const avatarEl = msgContainer.createEl('div', { cls: 'clawchat-avatar' });
            if (useImageAvatar) {
                const img = avatarEl.createEl('img', { cls: 'clawchat-avatar-img', attr: { src: avatar, alt: agentName } });
                img.onerror = () => { avatarEl.empty(); avatarEl.setText(agentName.charAt(0).toUpperCase()); };
            } else {
                avatarEl.setText(avatar);
            }
            avatarEl.style.setProperty('--clawchat-avatar-color', agentColor);
            
            const block = msgContainer.createEl('div', { cls: 'clawchat-message-block' });
            block.createEl('div', { cls: 'clawchat-message-sender', text: agentName });
            block.createEl('div', { cls: 'clawchat-message-bubble', text: msg.content });
        }
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
            cls: 'clawchat-context-add-btn',
            text: '+ add file'
        });
        addBtn.addEventListener('click', () => { new FileSuggestModal(this.app, this).open(); });

        this.attachedFiles.forEach((file, index) => {
            if (!this.contextBarEl) return;
            const chip = this.contextBarEl.createEl('div', { cls: 'clawchat-context-file-chip' });
            chip.createEl('span', { text: file.name, cls: 'clawchat-context-file-name' });
            const removeBtn = chip.createEl('button', { cls: 'clawchat-context-file-remove', text: '×' });
            removeBtn.addEventListener('click', () => {
                this.attachedFiles.splice(index, 1);
                this.renderContextBar();
            });
        });
    }

    addFile(file: TFile) {
        // TFile objects from Obsidian vault are already validated
        // But add a check for safety
        if (!file || !file.path) {
            new Notice('Invalid file');
            return;
        }
        if (this.attachedFiles.some(f => f.path === file.path)) {
            new Notice('File already attached');
            return;
        }
        this.attachedFiles.push({ path: file.path, name: file.name });
        this.renderContextBar();
    }

    async sendMessage() {
        
        if (!this.client.isConnected()) {
            new Notice('Not connected. Click connect first.');
            return;
        }
        if (this.isLoading) return;

        const text = this.inputEl.value.trim();
        const MAX_MESSAGE_LENGTH = 50000;
        if (text.length > MAX_MESSAGE_LENGTH) {
            new Notice('message too long. maximum ' + MAX_MESSAGE_LENGTH + ' characters.');
            return;
        }
        if (!text) return;
        
        // Check for slash commands
        if (text.startsWith('/')) {
            const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
            if (match) {
                const commandId = match[1];
                const args = match[2] || '';
                
                // Validate command
                if (this.validateCommand(commandId)) {
                    this.inputEl.value = '';
                    void this.executeCommand(commandId, args);
                    return;
                }
            }
        }
        

        // Add to history and render
        const agentId = this.agentSelectEl?.value || this.plugin.settings.defaultAgent || 'main';
        const agentName = this.agentSelectEl?.options[this.agentSelectEl.selectedIndex]?.text || agentId;
        const agentEmoji = this.getAgentEmoji(agentId);
        
        await this.plugin.addMessageToHistory({
            agentId,
            agentName,
            agentEmoji,
            role: 'user',
            content: text
        });
        
        this.addMessage('user', text);
        this.inputEl.value = '';
        this.showLoading();

        const context: { currentFile?: string; fileContent?: string } = {};
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
                    void e;
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
            this.currentRunId = runId;
        } catch (err) {
            this.hideLoading();
            this.addMessage('assistant', '⚠️ Failed to send. Connection lost?');
            void err;
        }
    }

    addMessage(role: 'user' | 'assistant', text: string, savedEmoji?: string) {
        
        // Render immediately
        const agentId = this.agentSelectEl?.value || this.plugin.settings.defaultAgent || 'main';
        const agentName = role === 'user' ? 'You' : (this.agentSelectEl?.options[this.agentSelectEl.selectedIndex]?.text || agentId);
        
        const agentColor = role === 'user' ? '' : this.getAgentColor(agentId);
        const agents = this.client.getAgents();
        const agent = agents.find(a => a.id === agentId);
        
        let avatar = agentName.charAt(0).toUpperCase();
        let useImageAvatar = false;
        // Use saved emoji if provided, otherwise get from agent identity
        if (savedEmoji) avatar = savedEmoji;
        else if (agent?.identity?.emoji) avatar = agent.identity.emoji;
        else if (agent?.identity?.avatarUrl) { avatar = agent.identity.avatarUrl; useImageAvatar = true; }
        else if (agent?.identity?.avatar) { avatar = agent.identity.avatar; useImageAvatar = true; }
        
        if (role === 'user') {
            const msgContainer = this.messagesEl.createEl('div', {
                cls: 'clawchat-message-container clawchat-message-container-user'
            });
            const block = msgContainer.createEl('div', { cls: 'clawchat-message-block clawchat-user-block' });
            block.createEl('div', { cls: 'clawchat-message-sender clawchat-user-sender', text: 'You' });
            block.createEl('div', { cls: 'clawchat-message-bubble clawchat-user-bubble', text });
        } else {
            const msgContainer = this.messagesEl.createEl('div', {
                cls: 'clawchat-message-container clawchat-message-container-agent'
            });
            msgContainer.style.setProperty('--agent-color', agentColor);
            
            const avatarEl = msgContainer.createEl('div', { cls: 'clawchat-avatar' });
            if (useImageAvatar) {
                const img = avatarEl.createEl('img', { cls: 'clawchat-avatar-img', attr: { src: avatar, alt: agentName } });
                img.onerror = () => { avatarEl.empty(); avatarEl.setText(agentName.charAt(0).toUpperCase()); };
                void img;
            } else {
                avatarEl.setText(avatar);
            }
            avatarEl.style.setProperty('--clawchat-avatar-color', agentColor);

            const block = msgContainer.createEl('div', { cls: 'clawchat-message-block' });
            block.createEl('div', { cls: 'clawchat-message-sender', text: agentName });
            block.createEl('div', { cls: 'clawchat-message-bubble', text });
        }
        
        requestAnimationFrame(() => {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
    }

    showLoading() {
        this.isLoading = true;
        if (this.loadingEl) {
            this.loadingEl.removeClass('clawchat-hidden');
            this.loadingEl.addClass('clawchat-visible');
        }
        requestAnimationFrame(() => {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
        this.startStatusPolling();
    }

    hideLoading() {
        this.isLoading = false;
        if (this.loadingEl) this.loadingEl.addClass('clawchat-hidden');
        this.stopStatusPolling();
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
        }
    }

    updateLoadingText() {
        if (!this.loadingEl) return;
        const agentId = this.agentSelectEl?.value || this.plugin.settings.defaultAgent || 'Agent';
        const agentName = (this.agentSelectEl && this.agentSelectEl.selectedIndex >= 0 
            ? this.agentSelectEl.options[this.agentSelectEl.selectedIndex]?.text 
            : null) || agentId;
        const loadingText = this.loadingEl.querySelector('.clawchat-loading-text');
        if (loadingText) loadingText.setText(`${agentName} is thinking...`);
    }

    startStatusPolling() {
        this.stopStatusPolling();
        this.statusPollingInterval = setInterval(() => { void this.checkSessionStatus(); }, this.STATUS_POLLING_MS);
    }

    stopStatusPolling() {
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
        }
    }

    async checkSessionStatus() {
        if (!this.sessionId || !this.client.isConnected()) return;
        
        const elapsed = Date.now() - this.messageStartTime;
        const elapsedMin = Math.floor(elapsed / 60000);
        
        if (elapsedMin >= 8 && elapsedMin < 9) {
            this.showInfoText('⚠️ Agent taking >8 minutes - will timeout at 10 min. Consider cancelling.');
        } else if (elapsedMin >= 5 && elapsedMin < 6) {
            this.showInfoText('⏳ Still processing (>5 min). Gateway timeout at 10 min.');
        } else if (elapsedMin >= 3 && elapsedMin < 4) {
            this.showInfoText('⏳ This is taking longer than usual (>3 min)...');
        } else if (elapsedMin >= 1 && elapsedMin < 2) {
            this.showInfoText('⏳ Agent is thinking...');
        }
        
        const selectedAgent = this.agentSelectEl?.value || this.plugin.settings.defaultAgent || 'main';
        const sessionKey = `agent:${selectedAgent}:session:${this.sessionId}`;
        
        try {
            const status = await this.client.getSessionStatus(sessionKey);
            
            if (status === 'error' || status === 'aborted' || status === 'timeout') {
                this.hideLoading();
                this.showErrorText('⚠️ Agent timed out or failed. Please try again.');
            }
        } catch (err) {
            void err;
        }
    }

    showInfoText(text: string) {
        const infoEl = this.messagesEl.createEl('div', { cls: 'clawchat-info-text', text });
        setTimeout(() => { infoEl.remove(); }, 5000);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    showErrorText(text: string) {
        const errorEl = this.messagesEl.createEl('div', { cls: 'clawchat-error-text', text });
        void errorEl;
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    generateSessionId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }

    handleSlashCommands(): void {
        const text = this.inputEl.value;
        if (text.startsWith('/')) {
            this.showCommandPalette();
        }
    }

    showCommandPalette(): void {
        // Close any existing palette first
        if (this.commandPaletteEl) {
            this.commandPaletteEl.remove();
            this.commandPaletteEl = null;
        }
        
        const commands = [
            { id: 'search', label: '/search <query> - Search vault and include results', icon: 'search' },
            { id: 'create', label: '/create <title> - Create a new note', icon: 'file-plus' },
            { id: 'summarize', label: '/summarize - Summarize current note', icon: 'file-text' },
            { id: 'clear', label: '/clear - Clear chat history', icon: 'trash' }
        ];
        
        const palette = document.createElement('div');
        palette.className = 'clawchat-command-palette';
        this.commandPaletteEl = palette;
        
        commands.forEach(cmd => {
            const item = palette.createEl('div', { cls: 'clawchat-command-item' });
            item.createEl('span', { text: cmd.label, cls: 'clawchat-command-label' });
            
            item.addEventListener('click', () => {
                void this.executeCommand(cmd.id);
                this.closeCommandPalette();
            });
        });
        
        if (this.inputContainerEl) {
            this.inputContainerEl.addClass('clawchat-input-container');
            this.inputContainerEl.appendChild(palette);
        }
        
        const removePalette = (e: MouseEvent) => {
            if (!palette.contains(e.target as Node)) {
                this.closeCommandPalette();
            }
        };
        
        setTimeout(() => {
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    palette.remove();
                    document.removeEventListener('click', removePalette);
                    document.removeEventListener('keydown', handleEscape);
                    this.commandPaletteEl = null;
                }
            };
            
            const handleEnter = (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    // Execute the current command from input
                    const text = this.inputEl.value;
                    const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
                    if (match) {
                        const commandId = match[1];
                        const args = match[2] || '';
                        void this.executeCommand(commandId, args);
                    }
                }
            };
            
            document.addEventListener('click', removePalette);
            document.addEventListener('keydown', handleEscape);
            document.addEventListener('keydown', handleEnter);
        }, 0);
    }
    
    private closeCommandPalette(): void {
        if (this.commandPaletteEl) {
            this.commandPaletteEl.remove();
            this.commandPaletteEl = null;
        }
    }

    async executeCommand(commandId: string, args?: string): Promise<void> {
        // Validate command ID before executing
        if (!this.validateCommand(commandId)) {
            new Notice(`"${commandId}" is not a valid command. use /search, /create, /summarize, or /clear`);
            this.closeCommandPalette();
            return;
        }
        
        // If args not provided, parse from input
        if (args === undefined) {
            const text = this.inputEl.value;
            const match = text.match(/^\/(\w+)(?:\s+(.+))?$/);
            args = match?.[2] || '';
        }
        
        switch (commandId) {
            case 'search': await this.commandSearch(args); break;
            case 'create': await this.commandCreate(args); break;
            case 'summarize': await this.commandSummarize(); break;
            case 'clear': await this.commandClear(); break;
        }
        
        this.closeCommandPalette();
    }

    async commandSearch(query: string): Promise<void> {
        if (!query.trim()) { new Notice('usage: /search <query>'); return; }
        // Sanitize query input
        const sanitizedQuery = this.sanitizeInput(query);
        if (!sanitizedQuery) { new Notice('Invalid query'); return; }
        new Notice(`🔍 searching for "${sanitizedQuery}"...`);
        
        const files = this.app.vault.getMarkdownFiles();
        const results: { file: TFile; content: string }[] = [];
        
        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                if (content.toLowerCase().includes(query.toLowerCase())) {
                    results.push({ file, content });
                    if (results.length >= 5) break;
                }
            } catch {
                        // Skip files that can't be read
                    }
        }
        
        if (results.length === 0) {
            this.addMessage('assistant', `No results found for "${query}"`);
            return;
        }
        
        const contextParts = results.map(r => {
            const excerpt = r.content.substring(0, 500);
            return `--- ${r.file.path} ---\n${excerpt}`;
        }).join('\n\n');
        
        this.addMessage('user', `/search ${sanitizedQuery}`);
        this.showLoading();
        
        await this.plugin.addMessageToHistory({
            agentId: this.agentSelectEl?.value || 'main',
            agentName: 'You',
            role: 'user',
            content: `/search ${sanitizedQuery}`
        });
        
        await this.client.sendMessage({
            agent: this.agentSelectEl?.value || this.plugin.settings.defaultAgent,
            content: `Found ${results.length} results for "${sanitizedQuery}". Here's what I found:\n\n${contextParts}\n\nSummarize these results.`,
            context: { currentFile: `Search: ${sanitizedQuery}`, fileContent: contextParts },
            sessionId: this.sessionId
        });
    }

    async commandCreate(title: string): Promise<void> {
        if (!title.trim()) { new Notice('usage: /create <title>'); return; }
        
        // Sanitize title input
        const sanitizedTitle = this.sanitizeInput(title).replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
        if (!sanitizedTitle) { new Notice('Invalid title'); return; }
        
        const path = `${sanitizedTitle}.md`;
        
        try {
            const file = await this.app.vault.create(path, `# ${title}\n\n`);
            new Notice(`created: ${path}`);
            
            // Open in a new tab instead of current tab
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(file);
            
            await this.plugin.addMessageToHistory({
                agentId: this.agentSelectEl?.value || 'main',
                agentName: 'Assistant',
                role: 'assistant',
                content: `Created note: [[${path}]]`
            });
            
            this.addMessage('user', `/create ${title}`);
            this.addMessage('assistant', `Created note: [[${path}]]`);
        } catch (e) {
            new Notice(`failed to create note: ${e}`);
        }
    }

    async commandSummarize(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) { new Notice('No file active. Open a note first.'); return; }
        
        try {
            const content = await this.app.vault.read(activeFile);
            const excerpt = content.substring(0, 3000);
            
            await this.plugin.addMessageToHistory({
                agentId: this.agentSelectEl?.value || 'main',
                agentName: 'You',
                role: 'user',
                content: `/summarize ${activeFile.name}`
            });
            
            this.addMessage('user', `/summarize ${activeFile.name}`);
            this.showLoading();
            
            await this.client.sendMessage({
                agent: this.agentSelectEl?.value || this.plugin.settings.defaultAgent,
                content: `Please summarize this note:\n\n---\n${excerpt}\n---\n\nProvide a concise summary.`,
                context: { currentFile: activeFile.path, fileContent: excerpt },
                sessionId: this.sessionId
            });
        } catch (e) {
            new Notice(`failed to read file: ${e}`);
        }
    }

    async commandClear(): Promise<void> {
        // Clear ALL history (global chat history)
        this.plugin.chatHistory.messages = [];
        await this.plugin.saveChatHistory();
        this.messagesEl.empty();
        new Notice('Chat history cleared');
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
    onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void { this.chatView.addFile(file); }
}