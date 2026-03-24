import { Platform } from 'obsidian';

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
    payload?: unknown;
    error?: unknown;
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
            this.handleMessage = (data) => {
                if (data.id === requestId) {
                    clearTimeout(timeout);
                    this.handleMessage = originalHandler;
                    if (data.type === 'res' && (data.payload as { agents?: AgentInfo[] })?.agents) {
                        this.agents = (data.payload as { agents: AgentInfo[] }).agents;
                        this.onAgentsUpdated?.(this.agents);
                    }
                    resolve(this.agents);
                } else {
                    originalHandler(data);
                }
            };

            this.ws?.send(JSON.stringify({
                type: 'req',
                id: requestId,
                method: 'agents.list',
                params: {}
            }));
        });
    }

    private validateGatewayUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'wss:' || parsed.protocol === 'ws:';
        } catch {
            return false;
        }
    }

    updateConfig(url: string, token: string) {
        if (!this.validateGatewayUrl(url)) {
            throw new Error('invalid gateway URL. Must use wss:// or ws:// protocol.');
        }
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
            
            // Validate URL before attempting connection
            if (!this.validateGatewayUrl(this.url)) {
                const errorMsg = 'invalid gateway URL. Must use wss:// or ws:// protocol.';
                console.error('[ClawChat] ' + errorMsg);
                reject(new Error(errorMsg));
                return;
            }
            
            try {
                // console.log('[ClawChat] Connecting to:', this.url);
                this.ws = new WebSocket(this.url);
                
                this.ws.onopen = () => {
                    // console.log('[ClawChat] WebSocket connected, waiting for challenge...');
                    // Don't send connect here - wait for connect.challenge event
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch {
                        this.onMessage?.(event.data);
                    }
                };

                this.ws.onerror = (err) => {
                    console.error('[ClawChat] WebSocket error:', err);
                    this.onError?.(new Error('websocket connection failed'));
                    this.connectionReject?.(new Error('websocket connection failed'));
                    this.connectionResolve = null;
                    this.connectionReject = null;
                };

                this.ws.onclose = () => {
                    // console.log('[ClawChat] WebSocket closed');
                    this.connected = false;
                    this.onDisconnect?.();
                };
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
    }

    private handleConnectChallenge(_nonce: string) {
        // For now, just send connect without nonce - token auth should work
        // console.log('[ClawChat] Received challenge, sending connect...');
        this.sendConnectRequest();
    }

    private handleMessage(data: GatewayMessage) {
        // console.log('[ClawChat] Received:', data.type, data.event || '', data);
        
        // Handle connect.challenge event
        if (data.type === 'event' && data.event === 'connect.challenge') {
            // console.log('[ClawChat] Challenge received, responding...');
            const nonce = (data.payload as { nonce?: string })?.nonce;
            if (nonce) this.handleConnectChallenge(nonce);
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
                if ((data.payload as { type?: string })?.type === 'hello-ok' || data.ok === true) {
                    this.connected = true;
                    // console.log('[ClawChat] Connected successfully');
                    this.onConnect?.();
                    this.connectionResolve?.();
                    this.connectionResolve = null;
                    this.connectionReject = null;
                } else if (data.error) {
                    const errorMsg = (data.error as { message?: string }).message 
                        || (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
                        || 'connection failed';
                    console.error('[Claw Chat] Connection error:', errorMsg);
                    this.onAuthError?.(errorMsg);
                    this.connectionReject?.(new Error(errorMsg));
                    this.connectionResolve = null;
                    this.connectionReject = null;
                } else if ((data.payload as { agents?: AgentInfo[] })?.agents) {
                    this.agents = (data.payload as { agents: AgentInfo[] }).agents;
                    this.onAgentsUpdated?.(this.agents);
                }
                break;
                
            case 'auth':
            case 'connected':
                if (data.ok === true) {
                    this.connected = true;
                    // console.log('[ClawChat] Auth successful');
                    this.onConnect?.();
                    this.connectionResolve?.();
                    this.connectionResolve = null;
                    this.connectionReject = null;
                } else if (data.error) {
                    const errorMsg = (data.error as { message?: string }).message 
                        || (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
                        || 'auth failed';
                    console.error('[Claw Chat] Auth error:', errorMsg);
                    this.onAuthError?.(errorMsg);
                    this.connectionReject?.(new Error(errorMsg));
                    this.connectionResolve = null;
                    this.connectionReject = null;
                }
                break;
                
            default:
                // console.log('[ClawChat] Unknown message type:', data.type);
        }
    }

    private sendConnectRequest() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('[ClawChat] WebSocket not ready');
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

        // console.log('[ClawChat] Sending connect request');
        this.ws.send(JSON.stringify(request));
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    private getPlatform(): string {
        if (Platform.isMacOS) return 'macos';
        if (Platform.isWin) return 'windows';
        if (Platform.isLinux) return 'linux';
        if (Platform.isMobile) return 'mobile';
        return 'unknown';
    }

    sendMessage(msg: ChatMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('not connected'));
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

            // console.log('[ClawChat] Sending to agent:', agentId, 'sessionKey:', sessionKey);
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

    async getSessionStatus(sessionKey: string): Promise<string | null> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;

        return new Promise((resolve) => {
            const requestId = this.generateId();
            const timeout = setTimeout(() => {
                // console.log('[ClawChat] getSessionStatus timeout');
                resolve(null);
            }, 5000);

            const originalHandler = this.handleMessage.bind(this);
            this.handleMessage = (data) => {
                if (data.id === requestId) {
                    clearTimeout(timeout);
                    this.handleMessage = originalHandler;
                    
                    // Log full response for debugging
                    // console.log('[ClawChat] getSessionStatus response:', JSON.stringify(data, null, 2));
                    
                    // Try different response structures
                    const payload = data.payload as { state?: string; status?: string; session?: { state?: string } };
                    const state = payload?.state ||
                                  payload?.status ||
                                  payload?.session?.state ||
                                  (data.ok ? 'running' : null);
                    resolve(state);
                } else {
                    originalHandler(data);
                }
            };

            // Try sessions.get with sessionKey instead of runId
            this.ws?.send(JSON.stringify({
                type: 'req',
                id: requestId,
                method: 'sessions.get',
                params: { sessionKey }
            }));
        });
    }
}