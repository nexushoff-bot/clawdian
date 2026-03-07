import { Modal, App, Setting, Notice } from 'obsidian';

interface SetupCodeData {
    url: string;
    token: string;
}

export class SetupCodeModal extends Modal {
    onSetupComplete: (url: string, token: string) => void;
    private defaultGateway: string;

    constructor(app: App, defaultGateway: string, onSetupComplete: (url: string, token: string) => void) {
        super(app);
        this.defaultGateway = defaultGateway;
        this.onSetupComplete = onSetupComplete;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('clawdian-pairing-modal');

        contentEl.createEl('h2', { text: 'Connect to OpenClaw' });

        // Step 1
        const step1 = contentEl.createEl('div', { cls: 'clawdian-pairing-step' });
        step1.createEl('span', { cls: 'clawdian-step-number', text: '1.' });
        step1.createEl('span', { text: ' Open up a chat with OpenClaw (OpenClaw TUI, Discord, Telegram, etc.)' });

        // Step 2
        const step2 = contentEl.createEl('div', { cls: 'clawdian-pairing-step' });
        step2.createEl('span', { cls: 'clawdian-step-number', text: '2.' });
        step2.createEl('span', { text: ' Type ' });
        step2.createEl('code', { text: '/pair' });
        step2.createEl('span', { text: ' and press Enter' });

        // Step 3
        const step3 = contentEl.createEl('div', { cls: 'clawdian-pairing-step' });
        step3.createEl('span', { cls: 'clawdian-step-number', text: '3.' });
        step3.createEl('span', { text: ' Copy the Setup code and paste it here:' });

        // Setup code input
        let codeInput: HTMLTextAreaElement;
        new Setting(contentEl)
            .setName('Setup Code')
            .setDesc('The base64 code from /pair output')
            .addTextArea((text) => {
                codeInput = text.inputEl;
                text.setPlaceholder('eyJ1cmwiOiJ3c3M6Ly8...');
                codeInput.rows = 3;
                codeInput.style.fontFamily = 'var(--font-monospace)';
                codeInput.style.width = '100%';
            });

        // Step 4
        const step4 = contentEl.createEl('div', { cls: 'clawdian-pairing-step' });
        step4.createEl('span', { cls: 'clawdian-step-number', text: '4.' });
        step4.createEl('span', { text: ' Copy the Gateway URL and paste it here:' });

        // Gateway input
        let gatewayInput: HTMLInputElement;
        new Setting(contentEl)
            .setName('Gateway URL')
            .setDesc('The WebSocket URL from /pair output')
            .addText((text) => {
                gatewayInput = text.inputEl;
                text.setPlaceholder('wss://your-gateway-url');
                text.setValue(this.defaultGateway);
                gatewayInput.style.width = '100%';
            });

        // Step 5
        const step5 = contentEl.createEl('div', { cls: 'clawdian-pairing-step' });
        step5.createEl('span', { cls: 'clawdian-step-number', text: '5.' });
        step5.createEl('span', { text: ' Click Connect' });

        // Buttons
        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText('Connect')
                    .setCta()
                    .onClick(() => {
                        const code = codeInput.value.trim();
                        const gateway = gatewayInput.value.trim();

                        if (!code) {
                            new Notice('Please enter the setup code');
                            return;
                        }
                        if (!gateway) {
                            new Notice('Please enter the gateway URL');
                            return;
                        }

                        try {
                            const data = this.decodeSetupCode(code);
                            if (!data.url || !data.token) {
                                new Notice('Invalid setup code: missing URL or token');
                                return;
                            }
                            // Use the gateway from input, but token from setup code
                            this.onSetupComplete(gateway, data.token);
                            new Notice('✅ Connecting...');
                            this.close();
                        } catch (err) {
                            new Notice('Invalid setup code: ' + (err as Error).message);
                        }
                    });
            })
            .addButton((btn) => {
                btn.setButtonText('Cancel')
                    .onClick(() => this.close());
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    /**
     * Decode base64 setup code
     */
    private decodeSetupCode(code: string): SetupCodeData {
        try {
            // Remove any whitespace
            code = code.trim();
            // Add padding if needed
            const padding = 4 - (code.length % 4);
            if (padding !== 4) {
                code += 'String('.repeat(padding);
            }
            
            const json = atob(code);
            return JSON.parse(json);
        } catch (err) {
            throw new Error('Failed to decode setup code. Make sure you copied the entire code.');
        }
    }
}