import { Platform } from 'obsidian';

export interface DeviceIdentity {
    id: string;
    publicKey: string;
    privateKey: string;
    createdAt: number;
}

export interface DeviceAuth {
    deviceToken: string;
    role: string;
    scopes: string[];
}

/**
 * Manages device identity for OpenClaw authentication
 * Generates and persists a keypair for device-based auth
 */
export class DeviceIdentityManager {
    private static readonly STORAGE_KEY = 'clawdian-device-identity';
    private static readonly TOKEN_KEY = 'clawdian-device-token';
    
    private identity: DeviceIdentity | null = null;
    private deviceToken: string | null = null;

    /**
     * Load or create device identity
     */
    async loadIdentity(): Promise<DeviceIdentity> {
        // Try to load existing identity
        const stored = localStorage.getItem(DeviceIdentityManager.STORAGE_KEY);
        if (stored) {
            this.identity = JSON.parse(stored);
            return this.identity!;
        }

        // Generate new identity
        this.identity = await this.generateIdentity();
        this.saveIdentity();
        return this.identity;
    }

    /**
     * Generate a new device identity with keypair
     */
    private async generateIdentity(): Promise<DeviceIdentity> {
        // Generate device ID
        const id = this.generateDeviceId();
        
        // Generate keypair using Web Crypto API
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            true,
            ['sign', 'verify']
        );

        // Export keys
        const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
        const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

        const publicKey = this.arrayBufferToBase64(publicKeyBuffer);
        const privateKey = this.arrayBufferToBase64(privateKeyBuffer);

        return {
            id,
            publicKey,
            privateKey,
            createdAt: Date.now()
        };
    }

    /**
     * Generate a stable device ID
     */
    private generateDeviceId(): string {
        const random = Math.random().toString(36).substring(2, 10);
        return `clawdian-${Platform.isMacOS ? 'macos' : Platform.isWin ? 'windows' : 'linux'}-${random}`;
    }

    /**
     * Save identity to localStorage
     */
    private saveIdentity() {
        if (this.identity) {
            localStorage.setItem(DeviceIdentityManager.STORAGE_KEY, JSON.stringify(this.identity));
        }
    }

    /**
     * Get device identity
     */
    getIdentity(): DeviceIdentity | null {
        return this.identity;
    }

    /**
     * Get device ID
     */
    getDeviceId(): string | null {
        return this.identity?.id || null;
    }

    /**
     * Sign a challenge nonce
     */
    async signChallenge(nonce: string): Promise<string | null> {
        if (!this.identity) return null;

        try {
            // Import private key
            const privateKeyBuffer = this.base64ToArrayBuffer(this.identity.privateKey);
            const privateKey = await crypto.subtle.importKey(
                'pkcs8',
                privateKeyBuffer,
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['sign']
            );

            // Create payload: nonce + timestamp
            const timestamp = Date.now();
            const payload = JSON.stringify({
                nonce,
                deviceId: this.identity.id,
                timestamp,
                publicKey: this.identity.publicKey
            });

            // Sign
            const encoder = new TextEncoder();
            const signature = await crypto.subtle.sign(
                { name: 'ECDSA', hash: 'SHA-256' },
                privateKey,
                encoder.encode(payload)
            );

            return this.arrayBufferToBase64(signature);
        } catch (err) {
            console.error('[Clawdian] Failed to sign challenge:', err);
            return null;
        }
    }

    /**
     * Save device token from Gateway
     */
    saveDeviceToken(token: string) {
        this.deviceToken = token;
        localStorage.setItem(DeviceIdentityManager.TOKEN_KEY, token);
    }

    /**
     * Load device token
     */
    loadDeviceToken(): string | null {
        if (!this.deviceToken) {
            this.deviceToken = localStorage.getItem(DeviceIdentityManager.TOKEN_KEY);
        }
        return this.deviceToken;
    }

    /**
     * Clear device token (for re-pairing)
     */
    clearDeviceToken() {
        this.deviceToken = null;
        localStorage.removeItem(DeviceIdentityManager.TOKEN_KEY);
    }

    /**
     * Clear all identity data
     */
    clearIdentity() {
        this.identity = null;
        this.deviceToken = null;
        localStorage.removeItem(DeviceIdentityManager.STORAGE_KEY);
        localStorage.removeItem(DeviceIdentityManager.TOKEN_KEY);
    }

    /**
     * Convert ArrayBuffer to base64
     */
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert base64 to ArrayBuffer
     */
    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
