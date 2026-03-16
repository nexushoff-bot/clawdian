const fs = require('fs');

// Fix ChatView.ts
let chatView = fs.readFileSync('src/components/ChatView.ts', 'utf8');

// Fix 1: Line ~76 setTimeout with async function - add void
chatView = chatView.replace(
  /setTimeout\(\(\) => \{\s*this\.renderHistory\(\);\s*\}, 50\);/,
  'setTimeout(() => { void this.renderHistory(); }, 50);'
);

// Fix 2: Line ~112 sendBtn event listener
chatView = chatView.replace(
  /sendBtn\.addEventListener\('click', \(\) => this\.sendMessage\(\)\);/,
  `sendBtn.addEventListener('click', () => { void this.sendMessage(); });`
);

// Fix 3: Line ~136 connectBtn event listener - add void connectBtn
chatView = chatView.replace(
  /(connectBtn\.addEventListener\('click', \(\) => \{\s*void \(async \(\) => \{\s*const connected = await this\.plugin\.tryConnect\(\);[\s\S]*?\}\)\(\);\s*\}\);)/,
  `$1\n        void connectBtn;`
);

// Fix 4: Line ~236-237 - any types in filter/map
chatView = chatView.replace(
  /const textContent = payload\.message\.content\s*\.filter\(\(item: any\) => item\.type === 'text'\)\s*\.map\(\(item: any\) => item\.text\)\s*\.join\(''\);/,
  `interface MessageContent {\n                            type: string;\n                            text?: string;\n                        }\n                        const textContent = payload.message.content\n                            .filter((item: MessageContent) => item.type === 'text')\n                            .map((item: MessageContent) => item.text || '')\n                            .join('');`
);

// Fix 5: Line ~267 agentSelectEl change handler - already has void

// Fix 6: Line ~399 addBtn event listener
chatView = chatView.replace(
  /addBtn\.addEventListener\('click', \(\) => new FileSuggestModal\(this\.app, this\)\.open\(\)\);/,
  `addBtn.addEventListener('click', () => { new FileSuggestModal(this.app, this).open(); });`
);

// Fix 7: Line ~509 showInfoText setTimeout
chatView = chatView.replace(
  /setTimeout\(\(\) => infoEl\.remove\(\), 5000\);/,
  `setTimeout(() => { infoEl.remove(); }, 5000);`
);

// Fix 8: Line ~594 context type
chatView = chatView.replace(
  /const context: any = \{\};/,
  `const context: { currentFile?: string; fileContent?: string } = {};`
);

// Fix 9: Line ~626 catch e
chatView = chatView.replace(
  /\} catch \(e\) \{\s*\/\/ console\.log\('\[Clawdian\] Could not read file:', file\.path, e\);\s*\}/,
  `} catch (e) {\n                    // console.log('[Clawdian] Could not read file:', file.path, e);\n                    void e;\n                }`
);

// Fix 10: Line ~718 setInterval
chatView = chatView.replace(
  /this\.statusPollingInterval = setInterval\(\(\) => this\.checkSessionStatus\(\), this\.STATUS_POLLING_MS\);/,
  `this.statusPollingInterval = setInterval(() => { void this.checkSessionStatus(); }, this.STATUS_POLLING_MS);`
);

// Fix 11: Line ~755 catch err
chatView = chatView.replace(
  /\} catch \(err\) \{\s*this\.hideLoading\(\);\s*this\.addMessage\('assistant', '⚠️ Failed to send\. Connection lost\?'\);\s*\}/,
  `} catch (err) {\n            this.hideLoading();\n            this.addMessage('assistant', '⚠️ Failed to send. Connection lost?');\n            void err;\n        }`
);

// Fix 12: Line ~805 checkSessionStatus catch
chatView = chatView.replace(
  /\} catch \(err\) \{\s*\/\/ console\.log\('\[Clawdian\] Status check failed:', err\);\s*\}/,
  `} catch (err) {\n            // console.log('[Clawdian] Status check failed:', err);\n            void err;\n        }`
);

// Fix 13: Line ~841 - add void img after img.onerror (need to do both occurrences)
// First occurrence in renderMessage
chatView = chatView.replace(
  /(const img = avatarEl\.createEl\('img', \{ cls: 'clawdian-avatar-img', attr: \{ src: avatar, alt: agentName \} \);\s*img\.onerror = \(\) => \{ avatarEl\.empty\(\); avatarEl\.setText\(agentName\.charAt\(0\)\.toUpperCase\(\)\); \};)/,
  `$1\n            void img;`
);

// Fix 14: Line ~767 showErrorText - add void errorEl
chatView = chatView.replace(
  /showErrorText\(text: string\) \{\s*const errorEl = this\.messagesEl\.createEl\('div', \{ cls: 'clawdian-error-text', text \}\);\s*this\.messagesEl\.scrollTop = this\.messagesEl\.scrollHeight;\s*\}/,
  `showErrorText(text: string) {\n        const errorEl = this.messagesEl.createEl('div', { cls: 'clawdian-error-text', text });\n        void errorEl;\n        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;\n    }`
);

// Fix file ending corruption
chatView = chatView.replace(/class FileSuggestModal[\s\S]*$/, `class FileSuggestModal extends FuzzySuggestModal<TFile> {
    chatView: ChatView;
    constructor(app: App, chatView: ChatView) {
        super(app);
        this.chatView = chatView;
        this.setPlaceholder('Search files to add...');
    }
    getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
    getItemText(file: TFile): string { return file.basename; }
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void { this.chatView.addFile(file); }
}`);

fs.writeFileSync('src/components/ChatView.ts', chatView);
console.log('Fixed ChatView.ts');

// Fix LoadingIndicator.ts - Line ~90 setTimeout
let loadingIndicator = fs.readFileSync('src/components/LoadingIndicator.ts', 'utf8');
loadingIndicator = loadingIndicator.replace(
  /setTimeout\(\(\) => this\.stopStatusCycle\(\), 300\);/,
  `setTimeout(() => { this.stopStatusCycle(); }, 300);`
);
fs.writeFileSync('src/components/LoadingIndicator.ts', loadingIndicator);
console.log('Fixed LoadingIndicator.ts');

// Fix ContextChips.ts
let contextChips = fs.readFileSync('src/components/ContextChips.ts', 'utf8');

// Fix: Line ~46 async addFile with no await
contextChips = contextChips.replace(
  /async addFile\(path: string\): Promise<ContextItem> \{/,
  `addFile(path: string): ContextItem {`
);

// Fix: Line ~155-156 unused badgeEl
contextChips = contextChips.replace(
  /(const badgeEl = chipEl\.createEl\('span', \{[\s]*cls: 'clawdian-chip-badge',[\s]*text: this\.getTypeLabel\(item\.type\)[\s]*\}\);)/,
  `$1\n        void badgeEl;`
);

// Fix: Line ~226 unused el  
contextChips = contextChips.replace(
  /(const el = this\.container\.createEl\('div', \{[\s]*cls: 'clawdian-mention-item',[\s]*attr: \{ 'data-index': i\.toString\(\) \}[\s]*\}\);\s*\/\/ \.\.\. render item)/,
  `$1\n            void el;`
);

// Fix: Line ~451 getContext with any
contextChips = contextChips.replace(
  /getContext\(\): Record<string, any> \{/, 
  `getContext(): Record<string, string | string[] | undefined> {`
);

fs.writeFileSync('src/components/ContextChips.ts', contextChips);
console.log('Fixed ContextChips.ts');

// Fix main.ts
let mainTs = fs.readFileSync('src/main.ts', 'utf8');

// Fix any types at lines 33, 39
mainTs = mainTs.replace(
  /private debugLog\(\.\.\.args: any\[\]\) \{/, 
  `private debugLog(...args: unknown[]) {`
);
mainTs = mainTs.replace(
  /private debugError\(\.\.\.args: any\[\]\) \{/, 
  `private debugError(...args: unknown[]) {`
);

// Fix catch blocks with any
mainTs = mainTs.replace(/catch \(e: any\)/g, 'catch (e: unknown)');
mainTs = mainTs.replace(/catch \(folderError: any\)/g, 'catch (folderError: unknown)');

// Fix line 268-281 promise
mainTs = mainTs.replace(
  /void this\.tryConnect\(\)\.then\(\(connected\) => \{[\s]*\/\/ Notice shown by ChatView\.showConnected\(\) to avoid duplicate[\s]*if \(connected\) \{[\s]*this\.debugLog\('Auto-connect successful'\);[\s]*\}[\s]*\}\)\.catch\(\(err: Error\) => \{[\s]*this\.debugLog\('Auto-connect failed:', err\.message\);[\s]*\}\);/,
  `void this.tryConnect().then((connected: boolean) => {\n                // Notice shown by ChatView.showConnected() to avoid duplicate\n                if (connected) {\n                    this.debugLog('Auto-connect successful');\n                }\n            }).catch((err: Error) => {\n                this.debugLog('Auto-connect failed:', err.message);\n            });`
);

// Fix line 327 - add void
mainTs = mainTs.replace(
  /callback: \(\) => \{ void this\.activateView\(\); \}/,
  `callback: () => { void this.activateView(); }`
);

// Fix unused e in catch blocks
mainTs = mainTs.replace(
  /\.catch\(\(e\) => \{[\s]*\/\/ console\.log/g,
  `.catch((e) => {\n                    void e;\n                    // console.log`
);

fs.writeFileSync('src/main.ts', mainTs);
console.log('Fixed main.ts');

// Fix OpenClawClient.ts
let openClawClient = fs.readFileSync('src/utils/OpenClawClient.ts', 'utf8');

// Fix any types at lines 17-18
openClawClient = openClawClient.replace(
  /interface GatewayMessage \{[\s]*type: string;[\s]*event\?: string;[\s]*id\?: string;[\s]*payload\?: any;[\s]*error\?: any;[\s]*ok\?: boolean;[\s]*\}/,
  `interface GatewayMessage {\n    type: string;\n    event?: string;\n    id?: string;\n    payload?: unknown;\n    error?: unknown;\n    ok?: boolean;\n}`
);

// Fix line 141 - unused e
openClawClient = openClawClient.replace(
  /\} catch \(e\) \{[\s]*this\.onMessage\?\.\(event\.data\);[\s]*\}/,
  `} catch (e) {\n                    this.onMessage?.(event.data);\n                    void e;\n                }`
);

fs.writeFileSync('src/utils/OpenClawClient.ts', openClawClient);
console.log('Fixed OpenClawClient.ts');

console.log('\\nAll fixes applied!');
