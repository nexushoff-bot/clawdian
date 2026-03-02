import { Modal, App, Setting, Notice } from 'obsidian';

interface SetupCodeData {
    url: string;
    token: string;
}

export class SetupCodeModal extends Modal {
    onSetupComplete: (url: string, token: string) => void;

    constructor(app: App, onSetupComplete: (url: string, token: string) => void) {
        super(app);
        this.onSetupComplete = onSetupComplete;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Connect with Setup Code' });

        contentEl.createEl('p', {
            text: 'To connect to your OpenClaw Gateway, run /pair in your OpenClaw chat (Discord, Signal, etc.) and paste the setup code below.'
        });

        let codeInput: HTMLTextAreaElement;
        new Setting(contentEl)
            .setName('Setup Code')
            .setDesc('Paste the code from /pair command')
            .addTextArea((text) => {
                codeInput = text.inputEl;
                text.setPlaceholder('eyJ1cmwiOiJ3c3M6Ly8...');
                codeInput.rows = 4;
                codeInput.style.fontFamily = 'var(--font-monospace)';
            });

        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText('Connect')
                    .setCta()
                    .onClick(() => {
                        const code = codeInput.value.trim();
                        if (!code) {
                            new Notice('Please enter a setup code');
                            return;
                        }

                        try {
                            const data = this.decodeSetupCode(code);
                            if (!data.url || !data.token) {
                                new Notice('Invalid setup code: missing URL or token');
                                return;
                            }
                            this.onSetupComplete(data.url, data.token);
                            new Notice('✅ Connected!');
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

        // Instructions
        contentEl.createEl('h3', { text: 'How to get a setup code:' });
        const ol = contentEl.createEl('ol');
        ol.createEl('li', { text: 'Open your OpenClaw chat (Discord, Signal, etc.)' });
        ol.createEl('li', { text: 'Type: /pair' });
        ol.createEl('li', { text: 'Copy the setup code that appears' });
        ol.createEl('li', { text: 'Paste it here and click Connect' });
    }

    /**
     * Decode base64 setup code
     */
    private decodeSetupCode(code: string): SetupCodeData {
        try {
            // Add padding if needed
            const padding = 4 - (code.length % 4);
            if (padding !== 4) {
                code += '='.repeat(padding);
            }
            
            const json = atob(code);
            return JSON.parse(json);
        } catch (err) {
            throw new Error('Failed to decode setup code');
        }
    }
}
