/**
 * ContextChips - Manage context attachments in chat input
 * Shows file references, selected text, and other context as removable chips
 */

import { setIcon } from 'obsidian';

export interface ContextItem {
    id: string;
    type: 'file' | 'text' | 'url' | 'note';
    label: string;
    value: string;
    icon?: string;
}

export class ContextChips {
    container: HTMLElement;
    chipsEl: HTMLElement;
    items: ContextItem[] = [];
    onChange?: (items: ContextItem[]) => void;

    constructor(parent: HTMLElement) {
        this.container = parent.createEl('div', { 
            cls: 'clawdian-context-container' 
        });
        
        // Chips wrapper
        this.chipsEl = this.container.createEl('div', { 
            cls: 'clawdian-context-chips' 
        });

        // Empty state hint
        const hintEl = this.container.createEl('div', { 
            cls: 'clawdian-context-hint',
            text: 'Drop files or click + to add context'
        });

        this.chipsEl.addEventListener('click', () => {
            hintEl.style.display = this.items.length === 0 ? 'block' : 'none';
        });
    }

    /**
     * Add a file context chip
     */
    async addFile(path: string): Promise<ContextItem> {
        const item: ContextItem = {
            id: crypto.randomUUID(),
            type: 'file',
            label: this.basename(path),
            value: path,
            icon: 'file-text'
        };

        this.addItem(item);
        return item;
    }

    /**
     * Add selected text as context
     */
    addText(text: string, source?: string): ContextItem {
        const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;
        const item: ContextItem = {
            id: crypto.randomUUID(),
            type: 'text',
            label: truncated,
            value: text,
            icon: 'text-select'
        };

        this.addItem(item);
        return item;
    }

    /**
     * Add a note reference
     */
    addNote(path: string, alias?: string): ContextItem {
        const item: ContextItem = {
            id: crypto.randomUUID(),
            type: 'note',
            label: alias || this.basename(path),
            value: path,
            icon: 'sticky-note'
        };

        this.addItem(item);
        return item;
    }

    /**
     * Add a URL reference
     */
    addURL(url: string, title?: string): ContextItem {
        const item: ContextItem = {
            id: crypto.randomUUID(),
            type: 'url',
            label: title || this.truncateUrl(url),
            value: url,
            icon: 'link'
        };

        this.addItem(item);
        return item;
    }

    /**
     * Add a generic context item
     */
    addItem(item: ContextItem): void {
        // Check for duplicates
        const existing = this.items.find(i => 
            i.type === item.type && i.value === item.value
        );
        if (existing) {
            // Flash the existing chip
            this.flashChip(existing.id);
            return;
        }

        this.items.push(item);
        this.renderChip(item);
        this.emitChange();

        // Show container if it was hidden
        this.container.addClass('clawdian-context-has-items');
    }

    /**
     * Remove a context item by ID
     */
    removeItem(id: string): void {
        const index = this.items.findIndex(i => i.id === id);
        if (index === -1) return;

        const chipEl = this.chipsEl.querySelector(`[data-chip-id="${id}"]`);
        if (chipEl) {
            chipEl.addClass('clawdian-chip-removing');
            setTimeout(() => {
                chipEl.remove();
                this.items.splice(index, 1);
                this.emitChange();

                if (this.items.length === 0) {
                    this.container.removeClass('clawdian-context-has-items');
                }
            }, 200);
        }
    }

    /**
     * Get all context items
     */
    getContext(): Record<string, any> {
        const result: Record<string, any> = {};
        
        this.items.forEach(item => {
            switch (item.type) {
                case 'file':
                    if (!result.files) result.files = [];
                    result.files.push(item.value);
                    break;
                case 'text':
                    if (!result.selectedText) result.selectedText = [];
                    result.selectedText.push(item.value);
                    break;
                case 'note':
                    if (!result.notes) result.notes = [];
                    result.notes.push(item.value);
                    break;
                case 'url':
                    if (!result.urls) result.urls = [];
                    result.urls.push(item.value);
                    break;
            }
        });

        return result;
    }

    /**
     * Get context items as array
     */
    getItems(): ContextItem[] {
        return [...this.items];
    }

    /**
     * Clear all context items
     */
    clear(): void {
        this.items = [];
        this.chipsEl.empty();
        this.container.removeClass('clawdian-context-has-items');
        this.emitChange();
    }

    /**
     * Set callback for change events
     */
    onItemsChange(callback: (items: ContextItem[]) => void): void {
        this.onChange = callback;
    }

    private renderChip(item: ContextItem) {
        const chipEl = this.chipsEl.createEl('div', {
            cls: `clawdian-chip clawdian-chip-${item.type}`,
            attr: { 'data-chip-id': item.id, 'data-context-type': item.type }
        });

        // Icon
        if (item.icon) {
            const iconEl = chipEl.createEl('span', { cls: 'clawdian-chip-icon' });
            setIcon(iconEl, item.icon);
        }

        // Label
        chipEl.createEl('span', { 
            cls: 'clawdian-chip-label',
            text: item.label,
            attr: { title: item.value }
        });

        // Type indicator (small badge)
        const badgeEl = chipEl.createEl('span', { 
            cls: 'clawdian-chip-badge',
            text: this.getTypeLabel(item.type)
        });

        // Remove button
        const removeBtn = chipEl.createEl('button', {
            cls: 'clawdian-chip-remove',
            attr: { 'aria-label': 'Remove', type: 'button' }
        });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeItem(item.id);
        });

        // Click to preview (for files and notes)
        if (item.type === 'file' || item.type === 'note') {
            chipEl.addClass('clawdian-chip-clickable');
            chipEl.addEventListener('click', (e) => {
                if (e.target !== removeBtn && !removeBtn.contains(e.target as Node)) {
                    this.previewItem(item);
                }
            });
        }

        // Animate in
        requestAnimationFrame(() => {
            chipEl.addClass('clawdian-chip-visible');
        });
    }

    private flashChip(id: string) {
        const chipEl = this.chipsEl.querySelector(`[data-chip-id="${id}"]`);
        if (chipEl) {
            chipEl.addClass('clawdian-chip-flash');
            setTimeout(() => chipEl.removeClass('clawdian-chip-flash'), 600);
        }
    }

    private previewItem(item: ContextItem) {
        // Dispatch custom event that ChatView can handle
        const event = new CustomEvent('clawdian:preview-context', {
            detail: item,
            bubbles: true
        });
        this.container.dispatchEvent(event);
    }

    private emitChange() {
        if (this.onChange) {
            this.onChange(this.items);
        }
    }

    private getTypeLabel(type: ContextItem['type']): string {
        const labels: Record<string, string> = {
            file: 'FILE',
            text: 'TEXT',
            note: 'NOTE',
            url: 'LINK'
        };
        return labels[type] || type.toUpperCase();
    }

    private basename(path: string): string {
        return path.split('/').pop() || path;
    }

    private truncateUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch {
            return url.slice(0, 30) + (url.length > 30 ? '...' : '');
        }
    }
}

/**
 * QuickActionButtons - Context-aware action buttons below input
 */
export class QuickActionButtons {
    container: HTMLElement;

    constructor(parent: HTMLElement, actions: QuickAction[]) {
        this.container = parent.createEl('div', { 
            cls: 'clawdian-quick-actions' 
        });

        actions.forEach(action => {
            const btn = this.container.createEl('button', {
                cls: 'clawdian-quick-action',
                attr: { title: action.description || action.label }
            });
            
            if (action.icon) {
                const iconEl = btn.createEl('span', { cls: 'clawdian-quick-action-icon' });
                setIcon(iconEl, action.icon);
            }
            
            btn.createEl('span', { 
                cls: 'clawdian-quick-action-label',
                text: action.label 
            });

            btn.addEventListener('click', () => {
                action.onClick();
                btn.addClass('clawdian-quick-action-active');
                setTimeout(() => btn.removeClass('clawdian-quick-action-active'), 200);
            });
        });
    }
}

export interface QuickAction {
    id: string;
    label: string;
    icon?: string;
    description?: string;
    onClick: () => void;
}

/**
 * MentionSuggestion - @mention autocomplete for files/notes
 */
export class MentionSuggestion {
    container: HTMLElement;
    input: HTMLTextAreaElement;
    isOpen = false;
    selectedIndex = 0;
    items: MentionItem[] = [];

    constructor(parent: HTMLElement, input: HTMLTextAreaElement) {
        this.container = parent.createEl('div', { 
            cls: 'clawdian-mention-popup' 
        });
        this.input = input;
        this.setupListeners();
    }

    setupListeners() {
        this.input.addEventListener('input', (e) => this.handleInput(e));
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target as Node)) {
                this.close();
            }
        });
    }

    handleInput(e: Event) {
        const value = this.input.value;
        const cursor = this.input.selectionStart || 0;
        const beforeCursor = value.slice(0, cursor);
        
        // Check for @ trigger
        const match = beforeCursor.match(/@([^\s]*)$/);
        if (match) {
            this.open(match[1]);
        } else {
            this.close();
        }
    }

    handleKeydown(e: KeyboardEvent) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.items.length - 1);
                this.updateSelection();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.updateSelection();
                break;
            case 'Enter':
                e.preventDefault();
                this.selectItem(this.selectedIndex);
                break;
            case 'Escape':
                this.close();
                break;
        }
    }

    open(query: string) {
        this.isOpen = true;
        this.container.addClass('clawdian-mention-visible');
        this.updatePosition();
        this.filterItems(query);
    }

    close() {
        this.isOpen = false;
        this.container.removeClass('clawdian-mention-visible');
    }

    updatePosition() {
        // Position popup below cursor
        const coords = this.getCaretCoordinates();
        this.container.style.left = `${coords.left}px`;
        this.container.style.top = `${coords.top + 20}px`;
    }

    updateSelection() {
        const items = this.container.querySelectorAll('.clawdian-mention-item');
        items.forEach((item, i) => {
            item.toggleClass('clawdian-mention-selected', i === this.selectedIndex);
        });
    }

    filterItems(query: string) {
        // Filter logic here - would be populated from vault files
        this.renderItems();
    }

    renderItems() {
        this.container.empty();
        this.items.forEach((item, i) => {
            const el = this.container.createEl('div', {
                cls: 'clawdian-mention-item',
                attr: { 'data-index': i.toString() }
            });
            // ... render item
        });
    }

    selectItem(index: number) {
        const item = this.items[index];
        if (!item) return;

        const value = this.input.value;
        const cursor = this.input.selectionStart || 0;
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);
        
        // Replace @query with [[link]]
        const replaced = before.replace(/@[^\s]*$/, `[[${item.path}]]`);
        this.input.value = replaced + after;
        this.input.setSelectionRange(replaced.length, replaced.length);
        
        this.close();
    }

    getCaretCoordinates(): { left: number; top: number } {
        // Simplified - in reality would need to calculate from textarea
        const rect = this.input.getBoundingClientRect();
        return { left: rect.left, top: rect.bottom };
    }
}

export interface MentionItem {
    path: string;
    displayName: string;
    icon?: string;
}
