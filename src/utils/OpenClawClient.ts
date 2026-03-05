import { DeviceIdentityManager } from './DeviceIdentity';

export interface ChatMessage {
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
    deviceToken?: string;
}

export interface AgentInfo {
    id: string;
    name: string;
    description: string;
    icon?: string;
    identity?: {
        name?: string;
        avatar?: string;
        emoji?: string;
        creature?: string;
    };
}

export class OpenClawClient {
    private ws: WebSocket | null = null;
    private url: string;
    private token: string;
    private deviceManager: DeviceIdentityManager;
    private connected = false;
    private connectionResolve: (() => void) | null = null;
    private connectionReject: ((err: Error) => void) | null = null;
    
    onMessage: ((text: string) => void) | null = null;
    onError: ((err: Error) => void) | null = null;
    onConnect: (() => void) | null = null;
    onDisconnect: (() => void) | null = null;
    onAuthError: ((message: string) => void) | null = null;
    onPairingRequired: ((deviceId: string) => void) | null = null;
    onAgentsUpdated: ((agents: AgentInfo[]) => void) | null = null;

    private agents: AgentInfo[] = [];

    constructor(url: string, token: string) {
        this.url = url;
        this.token = token;
        this.deviceManager = new DeviceIdentityManager();
    }

    getAgents(): AgentInfo[] {
        return this.agents;
    }

    async fetchAgents(): Promise<AgentInfo[]> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[Clawdian] Cannot fetch agents - not connected');
            return [];
        }

        return new Promise((resolve) => {
            const requestId = this.generateId();
            const timeout = setTimeout(() => {
                console.log('[Clawdian] Agent fetch timeout');
                resolve([]);
            }, 5000);

            // Store original handler
            const originalHandler = this.handleMessage.bind(this);
            
            // Temporary handler for this request
            this.handleMessage = async (data) => {
                if (data.id === requestId) {
                    clearTimeout(timeout);
                    this.handleMessage = originalHandler; // Restore
                    
                    if (data.type === 'res' && data.payload?.agents) {
                        this.agents = data.payload.agents;
                        if (this.onAgentsUpdated) {
                            this.onAgentsUpdated(this.agents);
                        }
                        resolve(this.agents);
                    } else {
                        console.log('[Clawdian] No agents in response:', data);
                        resolve([]);
                    }
                } else {
                    // Pass other messages to original handler
                    originalHandler(data);
                }
            };

            // Send agents list request with verbose=true to get identity info
            const request = {
                type: 'req',
                id: requestId,
                method: 'agents.list',
                params: {
                    verbose: true
                }
            };

            console.log('[Clawdian] Requesting agents list via WebSocket:', request);
            this.ws!.send(JSON.stringify(request));
        });
    }

    updateConfig(url: string, token: string) {
        this.url = url;
        this.token = token;
        if (this.ws) {
            this.disconnect();
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    async connect(): Promise<void> {
        // Load device identity
        try {
            await this.deviceManager.loadIdentity();
        } catch (e) {
            console.log('[Clawdian] Device identity not available');
        }
        
        return new Promise((resolve, reject) => {
            this.connectionResolve = resolve;
            this.connectionReject = reject;
            
            try {
                console.log('[Clawdian] Connecting to:', this.url);
                this.ws = new WebSocket(this.url);
                
                this.ws.onopen = () => {
                    console.log('[Clawdian] WebSocket connected, waiting for challenge...');
                };

                this.ws.onmessage = async (event) => {
                    try {
                        const data: GatewayMessage = JSON.parse(event.data);
                        await this.handleMessage(data);
                    } catch (e) {
                        console.log('[Clawdian] Received non-JSON message:', event.data);
                        if (this.onMessage) {
                            this.onMessage(event.data);
                        }
                    }
                };

                this.ws.onerror = (err) => {
                    console.error('[Clawdian] WebSocket error:', err);
                    const error = new Error('WebSocket connection failed');
                    if (this.onError) this.onError(error);
                    if (this.connectionReject) {
                        this.connectionReject(error);
                        this.connectionReject = null;
                        this.connectionResolve = null;
                    }
                };

                this.ws.onclose = () => {
                    console.log('[Clawdian] WebSocket closed');
                    this.connected = false;
                    if (this.onDisconnect) this.onDisconnect();
                };
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Request pairing - user needs to approve this device
     */
    async requestPairing(): Promise<void> {
        const identity = this.deviceManager.getIdentity();
        if (!identity) {
            await this.deviceManager.loadIdentity();
        }
        
        const deviceId = this.getDeviceId();
        if (!deviceId) {
            throw new Error('No device ID available');
        }

        // Notify user they need to run the pairing command
        if (this.onPairingRequired) {
            this.onPairingRequired(deviceId);
        }
    }

    /**
     * Handle Gateway messages
     */
    private async handleMessage(data: GatewayMessage) {
        console.log('[Clawdian] Received:', data.type, data);
        
        switch (data.type) {
            case 'event':
                if (data.event === 'connect.challenge') {
                    console.log('[Clawdian] Challenge received, signing...');
                    await this.handleChallenge(data.payload?.nonce);
                } else if (data.event === 'chat' && data.payload?.message) {
                    console.log('[Clawdian] Chat event received, calling onMessage');
                    // Send the full event data as JSON string to UI
                    if (this.onMessage) {
                        this.onMessage(JSON.stringify(data));
                    }
                }
                break;
                
            case 'res':
                // Handle connect response
                if (data.payload?.type === 'hello-ok') {
                    this.connected = true;
                    console.log('[Clawdian] Connect successful (hello-ok)');
                    
                    if (data.payload?.auth?.deviceToken) {
                        this.deviceManager.saveDeviceToken(data.payload.auth.deviceToken);
                        console.log('[Clawdian] Device token saved');
                    }
                    
                    if (this.onConnect) this.onConnect();
                    if (this.connectionResolve) {
                        this.connectionResolve();
                        this.connectionResolve = null;
                        this.connectionReject = null;
                    }
                } else if (data.error) {
                    const errorMsg = data.error.message || data.error || 'Auth failed';
                    console.error('[Clawdian] Auth error:', errorMsg);
                    
                    // Check if pairing is required
                    if (errorMsg.includes('pairing') || 
                        errorMsg.includes('device') || 
                        errorMsg.includes('unauthorized')) {
                        console.log('[Clawdian] Pairing required');
                        const deviceId = this.getDeviceId();
                        if (deviceId && this.onPairingRequired) {
                            this.onPairingRequired(deviceId);
                        }
                    }
                    
                    if (this.onAuthError) this.onAuthError(errorMsg);
                    if (this.connectionReject) {
                        this.connectionReject(new Error(errorMsg));
                        this.connectionResolve = null;
                        this.connectionReject = null;
                    }
                }
                break;
                
            case 'auth':
            case 'connected':
                if (data.ok === true || data.type === 'connected') {
                    this.connected = true;
                    console.log('[Clawdian] Auth successful, connected =', this.connected);
                    
                    if (data.deviceToken) {
                        this.deviceManager.saveDeviceToken(data.deviceToken);
                        console.log('[Clawdian] Device token saved');
                    }
                    
                    // Call onConnect callback
                    if (this.onConnect) {
                        console.log('[Clawdian] Calling onConnect callback');
                        this.onConnect();
                    }
                    
                    if (this.connectionResolve) {
                        this.connectionResolve();
                        this.connectionResolve = null;
                        this.connectionReject = null;
                    }
                }
                break;
                
            case 'message':
                if (this.onMessage && data.payload?.content) {
                    this.onMessage(data.payload.content);
                } else if (this.onMessage && typeof data.payload === 'string') {
                    this.onMessage(data.payload);
                }
                break;
                
            default:
                console.log('[Clawdian] Unknown message type:', data.type);
        }
    }

    /**
     * Handle connect challenge by sending proper connect request
     */
    private async handleChallenge(nonce: string) {
        if (!nonce) {
            console.error('[Clawdian] No nonce in challenge');
            return;
        }

        console.log('[Clawdian] Sending connect request with token');
        
        // Build connect request with required client property
        // Per OpenClaw Gateway protocol, client.mode is REQUIRED
        // Valid modes: "node" | "cli" | "ui" | "test" | "webchat" | "backend" | "probe"
        const connectRequest = {
            type: 'req',
            id: this.generateId(),
            method: 'connect',
            params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                    id: 'cli',
                    version: '0.1.0',
                    platform: 'macos',
                    mode: 'ui'  // REQUIRED: ui mode for Obsidian plugin (desktop UI client)
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write', 'operator.admin'],
                auth: {
                    token: this.token
                }
            }
        };

        console.log('[Clawdian] Connect request:', JSON.stringify(connectRequest, null, 2));
        this.ws?.send(JSON.stringify(connectRequest));
    }

    /**
     * Fallback auth without device identity
     */
    private sendLegacyAuth() {
        const authMessage = this.token 
            ? { type: 'auth', token: this.token }
            : { type: 'auth' };
        console.log('[Clawdian] Sending legacy auth');
        this.ws?.send(JSON.stringify(authMessage));
    }

    /**
     * Generate random ID
     */
    private generateId(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    /**
     * Get platform string
     */
    private getPlatform(): string {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('mac')) return 'macos';
        if (platform.includes('win')) return 'windows';
        if (platform.includes('linux')) return 'linux';
        return 'unknown';
    }

    getDeviceId(): string | null {
        return this.deviceManager.getDeviceId();
    }

    clearDeviceToken() {
        this.deviceManager.clearDeviceToken();
    }

    sendMessage(msg: ChatMessage): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('Not connected'));
                return;
            }

            // Use the selected agent in the session key
            const agentId = msg.agent || 'main';
            const sessionKey = `agent:${agentId}:session:${msg.sessionId || this.generateId()}`;
            console.log('[Clawdian] Using agent:', agentId, 'sessionKey:', sessionKey);

            // Build the full prompt as a plain string
            let fullPrompt = msg.content;

            console.log('[Clawdian] Context received:', msg.context);

            if (msg.context?.currentFile) {
                let contextHeader = `Context: Currently viewing "${msg.context.currentFile}"`;
                if (msg.context.fileContent) {
                    // Optional: truncate to avoid token blow-up
                    const excerpt = msg.context.fileContent.slice(0, 3000).trim();
                    contextHeader += `\n\nFile excerpt:\n${excerpt}`;
                }
                fullPrompt = `${contextHeader}\n\n---\n\n${msg.content}`;
                console.log('[Clawdian] Context prepended to message. File:', msg.context.currentFile);
            } else {
                console.log('[Clawdian] No context to prepend - currentFile is missing or empty');
            }

            const request = {
                type: 'req',
                id: 'msg-' + this.generateId(),
                method: 'chat.send',
                params: {
                    sessionKey,
                    message: fullPrompt,           // ← must be string
                    idempotencyKey: this.generateId()
                }
            };

            console.log('[Clawdian] Sending chat.send request:', JSON.stringify(request, null, 2));
            this.ws.send(JSON.stringify(request));
            resolve();
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
}
