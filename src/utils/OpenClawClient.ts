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
}

export interface AgentInfo {
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

export class OpenClawClient {
    private ws: WebSocket | null = null;
    private url: string;
    private token: string;
    private connected = false;
    private connectionResolve: (() => void) | null = null;
    private connectionReject: ((err: Error) => void) | null = null;
    
    onMessage: ((text: string) => void) | null = null;
    onError: ((err: Error) => void) | null = null;
    onConnect: (() => void) | null = null;
    onDisconnect: (() => void) | null = null;
    onAuthError: ((message: string) => void) | null = null;
    onAgentsUpdated: ((agents: AgentInfo[]) => void) | null = null;

    private agents: AgentInfo[] = [];

    constructor(url: string, token: string) {
        this.url = url;
        this.token = token;
    }

    getAgents(): AgentInfo[] {
        return this.agents;
    }

    async fetchAgents(): Promise<AgentInfo[]> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return [];
        }

        return new Promise((resolve) => {
            const requestId = this.generateId();
            const timeout = setTimeout(() => resolve([]), 5000);

            const originalHandler = this.handleMessage.bind(this);
            this.handleMessage = async (data) => {
                if (data.id === requestId) {
                    clearTimeout(timeout);
                    this.handleMessage = originalHandler;
                    if (data.type === 'res' && data.payload?.agents) {
                        this.agents = data.payload.agents;
                        this.onAgentsUpdated?.(this.agents);
                    }
                    resolve(this.agents);
                } else {
                    originalHandler(data);
                }
            };

            this.ws!.send(JSON.stringify({
                type: 'req',
                id: requestId,
                method: 'agents.list',
                params: {}
            }));
        });
    }

    updateConfig(url: string, token: string) {
        this.url = url;
        this.token = token;
        if (this.ws) this.disconnect();
    }

    isConnected(): boolean {
        return this.connected;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.connectionResolve = resolve;
            this.connectionReject = reject;
            
            try {
                console.log('[Clawdian] Connecting to:', this.url);
                this.ws = new WebSocket(this.url);
                
                this.ws.onopen = () => {
                    console.log('[Clawdian] WebSocket connected, waiting for challenge...');
                    // Don't send connect here - wait for connect.challenge event
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (e) {
                        this.onMessage?.(event.data);
                    }
                };

                this.ws.onerror = (err) => {
                    console.error('[Clawdian] WebSocket error:', err);
                    this.onError?.(new Error('WebSocket connection failed'));
                    this.connectionReject?.(new Error('WebSocket connection failed'));
                    this.connectionResolve = null;
                    this.connectionReject = null;
                };

                this.ws.onclose = () => {
                    console.log('[Clawdian] WebSocket closed');
                    this.connected = false;
                    this.onDisconnect?.();
                };
            } catch (err) {
                reject(err);
            }
        });
    }

    private handleConnectChallenge(nonce: string) {
        // For now, just send connect without nonce - token auth should work
        console.log('[Clawdian] Received challenge, sending connect...');
        this.sendConnectRequest();
    }

    private handleMessage(data: GatewayMessage) {
        console.log('[Clawdian] Received:', data.type, data.event || '', data);
        
        // Handle connect.challenge event
        if (data.type === 'event' && data.event === 'connect.challenge') {
            console.log('[Clawdian] Challenge received, responding...');
            this.handleConnectChallenge(data.payload?.nonce);
            return;
        }
        
        switch (data.type) {
            case 'event':
                if (data.event === 'agent' || data.event === 'chat') {
                    this.onMessage?.(JSON.stringify(data));
                }
                break;
                
            case 'res':
                // Handle connect response (hello-ok)
                if (data.payload?.type === 'hello-ok' || data.ok === true) {
                    this.connected = true;
                    console.log('[Clawdian] Connected successfully');
                    this.onConnect?.();
                    this.connectionResolve?.();
                    this.connectionResolve = null;
                    this.connectionReject = null;
                } else if (data.error) {
                    const errorMsg = data.error.message || data.error || 'Connection failed';
                    console.error('[Clawdian] Connection error:', errorMsg);
                    this.onAuthError?.(errorMsg);
                    this.connectionReject?.(new Error(errorMsg));
                    this.connectionResolve = null;
                    this.connectionReject = null;
                } else if (data.payload?.agents) {
                    this.agents = data.payload.agents;
                    this.onAgentsUpdated?.(this.agents);
                }
                break;
                
            case 'auth':
            case 'connected':
                if (data.ok === true) {
                    this.connected = true;
                    console.log('[Clawdian] Auth successful');
                    this.onConnect?.();
                    this.connectionResolve?.();
                    this.connectionResolve = null;
                    this.connectionReject = null;
                } else if (data.error) {
                    const errorMsg = data.error.message || data.error || 'Auth failed';
                    console.error('[Clawdian] Auth error:', errorMsg);
                    this.onAuthError?.(errorMsg);
                    this.connectionReject?.(new Error(errorMsg));
                    this.connectionResolve = null;
                    this.connectionReject = null;
                }
                break;
                
            default:
                console.log('[Clawdian] Unknown message type:', data.type);
        }
    }

    private sendConnectRequest() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('[Clawdian] WebSocket not ready');
            return;
        }

        const request = {
            type: 'req',
            id: this.generateId(),
            method: 'connect',
            params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                    id: 'cli',
                    version: '1.0.1',
                    platform: this.getPlatform(),
                    mode: 'ui'
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write', 'operator.admin'],
                auth: {
                    token: this.token
                }
            }
        };

        console.log('[Clawdian] Sending connect request');
        this.ws.send(JSON.stringify(request));
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    private getPlatform(): string {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes('mac')) return 'macos';
        if (platform.includes('win')) return 'windows';
        if (platform.includes('linux')) return 'linux';
        return 'unknown';
    }

    sendMessage(msg: ChatMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('Not connected'));
                return;
            }

            const agentId = msg.agent || 'main';
            const sessionKey = `agent:${agentId}:session:${msg.sessionId || this.generateId()}`;

            let fullPrompt = msg.content;
            if (msg.context?.currentFile) {
                let contextHeader = `Context: Currently viewing "${msg.context.currentFile}"`;
                if (msg.context.fileContent) {
                    const excerpt = msg.context.fileContent.slice(0, 3000).trim();
                    contextHeader += `\n\nFile excerpt:\n${excerpt}`;
                }
                fullPrompt = `${contextHeader}\n\n---\n\n${msg.content}`;
            }

            const request = {
                type: 'req',
                id: 'msg-' + this.generateId(),
                method: 'chat.send',
                params: {
                    sessionKey,
                    message: fullPrompt,
                    idempotencyKey: this.generateId()
                }
            };

            this.ws.send(JSON.stringify(request));
            resolve(request.id);
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    async getSessionStatus(runId: string): Promise<string | null> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;

        return new Promise((resolve) => {
            const requestId = this.generateId();
            const timeout = setTimeout(() => resolve(null), 5000);

            const originalHandler = this.handleMessage.bind(this);
            this.handleMessage = (data) => {
                if (data.id === requestId) {
                    clearTimeout(timeout);
                    this.handleMessage = originalHandler;
                    
                    // Get the state from the response
                    const state = data.payload?.state || data.payload?.status || 
                                  (data.ok ? 'running' : null);
                    console.log('[Clawdian] getSessionStatus response:', data.payload);
                    resolve(state);
                } else {
                    originalHandler(data);
                }
            };

            this.ws!.send(JSON.stringify({
                type: 'req',
                id: requestId,
                method: 'sessions.get',
                params: { runId }
            }));
        });
    }
}