// Gateway message types
export interface GatewayMessage {
  type: 'auth' | 'chat' | 'message' | 'error' | 'ping' | 'pong';
  content?: string;
  token?: string;
  agent?: string;
  context?: VaultContext;
  error?: string;
}

export interface VaultContext {
  currentFile?: string;
  fileContent?: string;
  vaultSearch?: string[];
  cursorPosition?: { line: number; ch: number };
}

// Plugin settings
export interface ClawdianSettings {
  gatewayUrl: string;
  gatewayToken: string;
  defaultAgent: 'nexus' | 'prism' | 'orion' | 'aristotowl';
  includeVaultContext: boolean;
  autoConnect: boolean;
  messageHistorySize: number;
}

// Chat message types
export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  agentId?: string;
  content: string;
  timestamp: number;
  context?: VaultContext;
}

export interface ChatThread {
  id: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// Agent types
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt?: string;
}

export const AGENTS: AgentConfig[] = [
  {
    id: 'nexus',
    name: 'Nexus',
    description: 'Project coordinator and marketing maestro',
    icon: '🧠'
  },
  {
    id: 'prism',
    name: 'Prism',
    description: 'Expert designer and UI/UX specialist',
    icon: '💎'
  },
  {
    id: 'orion',
    name: 'Orion',
    description: 'Expert software developer',
    icon: '⭐'
  },
  {
    id: 'aristotowl',
    name: 'Aristotowl',
    description: 'Expert writer and artist',
    icon: '🦉'
  }
];

// WebSocket states
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Error = 'error'
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AgentResponse {
  message: string;
  suggestions?: string[];
  actions?: AgentAction[];
}

export interface AgentAction {
  type: 'search' | 'create' | 'edit' | 'command';
  payload: unknown;
}
