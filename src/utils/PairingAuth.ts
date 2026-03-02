import { Platform } from 'obsidian';

export interface PairingRequest {
    code: string;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    token?: string;
    expiresAt: number;
}

/**
 * File-based pairing that works with existing OpenClaw
 * Uses filesystem since HTTP endpoint doesn't exist yet
 */
export class PairingAuth {
    private pairingCode: string | null = null;
    private checkInterval: number | null = null;
    private onApprovedCallback: ((token: string) => void) | null = null;
    private onRejectedCallback: (() => void) | null = null;
    private onExpiredCallback: (() => void) | null = null;

    /**
     * Generate a pairing code
     */
    async startPairing(): Promise<string> {
        this.pairingCode = `CLAW-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        return this.pairingCode;
    }

    /**
     * Stop the pairing process
     */
    stopPairing() {
        if (this.checkInterval) {
            window.clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.pairingCode = null;
    }

    /**
     * Get the pairing code
     */
    getCode(): string | null {
        return this.pairingCode;
    }

    /**
     * Manual completion - call this when user pastes the token
     */
    completeWithToken(token: string) {
        this.stopPairing();
        this.onApprovedCallback?.(token);
    }

    onApproved(callback: (token: string) => void) {
        this.onApprovedCallback = callback;
    }

    onRejected(callback: () => void) {
        this.onRejectedCallback = callback;
    }

    onExpired(callback: () => void) {
        this.onExpiredCallback = callback;
    }
}
