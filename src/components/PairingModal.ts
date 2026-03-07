import { App, Modal, Notice, Setting } from 'obsidian';

export class PairingModal extends Modal {
    private gatewayUrl: string;
    private setupCode: string = '';
    private gatewayInput: HTMLInputElement = null!;
    private setupCodeInput: HTMLInputElement = null!;
    private onConnect: (gateway: string, setupCode: string) => void;

    constructor(
        app: App,
        gatewayUrl: string,
        onConnect: (gateway: string, setupCode: string) => void
    ) {
        super(app);
        this.gatewayUrl = gatewayUrl;
        this.onConnect = onConnect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('clawdian-pairing-modal');

        contentEl.createEl('h2', { text: 'Connect to OpenClaw' });

        // Step 1
        const step1 = contentEl.createEl('div', { cls: 'clawdian-pairing-step' });
        step1.createEl('span', { cls: 'clawdian-step-number', text: '1.' });
        step1.createEl('span', { text: ' Open a chat with OpenClaw (Discord, Telegram, TUI, etc.)' });

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
        new Setting(contentEl)
            .setName('Setup Code')
            .setDesc('The base64 code from /pair output')
            .addText(text => {
                this.setupCodeInput = text.inputEl;
                text.setPlaceholder('eyJ1cmwiOi...')
                    .setValue(this.setupCode);
                text.inputEl.addClass('clawdian-setup-code-input');
                // Allow paste
                this.setupCodeInput.addEventListener('paste', (e) => {
                    // Let the paste happen naturally
                });
            });

        // Step 4
        const step4 = contentEl.createEl('div', { cls: 'clawdian-pairing-step' });
        step4.createEl('span', { cls: 'clawdian-step-number', text: '4.' });
        step4.createEl('span', { text: ' Copy the Gateway URL and paste it here:' });

        // Gateway input
        new Setting(contentEl)
            .setName('Gateway URL')
            .setDesc('The WebSocket URL from /pair output')
            .addText(text => {
                this.gatewayInput = text.inputEl;
                text.setPlaceholder('wss://...')
                    .setValue(this.gatewayUrl);
                text.inputEl.addClass('clawdian-gateway-input');
            });

        // Step5
        const step5 = contentEl.createEl('div', { cls: 'clawdian-pairing-step' });
        step5.createEl('span', { cls: 'clawdian-step-number', text: '5.' });
        step5.createEl('span', { text: ' Click Connect' });

        // Connect button
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Connect')
                    .setCta()
                    .onClick(() => {
                        const setupCode = this.setupCodeInput.value.trim();
                        const gateway = this.gatewayInput.value.trim();

                        if (!setupCode) {
                            new Notice('Please enter the setup code');
                            return;
                        }
                        if (!gateway) {
                            new Notice('Please enter the gateway URL');
                            return;
                        }

                        this.close();
                        this.onConnect(gateway, setupCode);
                    });
            });

        // Cancel button
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Cancel')
                    .onClick(() => this.close());
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}