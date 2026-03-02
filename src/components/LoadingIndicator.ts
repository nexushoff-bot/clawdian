/**
 * LoadingIndicator - A modern typing indicator component
 * Shows animated dots to indicate the agent is thinking
 */

export class LoadingIndicator {
    element: HTMLElement;
    parent: HTMLElement;
    isVisible = false;
    animationInterval?: number;

    constructor(parent: HTMLElement) {
        this.parent = parent;
        this.element = this.createElement();
    }

    private createElement(): HTMLElement {
        const wrapper = this.parent.createEl('div', { 
            cls: 'clawdian-loading-wrapper' 
        });

        // Create message group structure matching ChatView
        const groupEl = wrapper.createEl('div', { 
            cls: 'clawdian-message-group clawdian-message-group-agent clawdian-loading-group' 
        });

        // Avatar
        const avatarEl = groupEl.createEl('div', { 
            cls: 'clawdian-avatar clawdian-avatar-agent' 
        });
        avatarEl.setAttribute('data-agent', 'loading');
        
        // Animated avatar with pulsing effect
        const avatarInner = avatarEl.createEl('div', { cls: 'clawdian-avatar-inner' });
        avatarInner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`;

        // Content
        const contentEl = groupEl.createEl('div', { cls: 'clawdian-message-content' });
        
        // Header
        const headerEl = contentEl.createEl('div', { cls: 'clawdian-message-header' });
        headerEl.createEl('span', { 
            cls: 'clawdian-message-author',
            text: 'Clawdian'
        });
        headerEl.createEl('span', { 
            cls: 'clawdian-loading-status',
            text: 'thinking...'
        });

        // Typing bubble with animated dots
        const bubbleEl = contentEl.createEl('div', { 
            cls: 'clawdian-message-bubble clawdian-loading-bubble'
        });

        const dotsContainer = bubbleEl.createEl('div', { cls: 'clawdian-typing-dots' });
        for (let i = 0; i < 3; i++) {
            dotsContainer.createEl('span', { cls: 'clawdian-typing-dot' });
        }

        // Progress bar for long operations
        const progressContainer = bubbleEl.createEl('div', { 
            cls: 'clawdian-loading-progress' 
        });
        const progressBar = progressContainer.createEl('div', { 
            cls: 'clawdian-loading-progress-bar' 
        });

        // Status text that cycles through different states
        const statusEl = contentEl.createEl('div', { 
            cls: 'clawdian-loading-status-text' 
        });

        return wrapper;
    }

    show() {
        if (this.isVisible) return;
        this.isVisible = true;
        this.element.style.display = 'block';
        
        // Trigger enter animation
        requestAnimationFrame(() => {
            this.element.addClass('clawdian-loading-visible');
        });

        // Start status cycling
        this.startStatusCycle();
    }

    hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        
        this.element.removeClass('clawdian-loading-visible');
        
        // Wait for exit animation
        setTimeout(() => {
            this.element.style.display = 'none';
            this.stopStatusCycle();
        }, 300);
    }

    private startStatusCycle() {
        const statuses = [
            'Thinking...',
            'Analyzing context...',
            'Processing...',
            'Generating response...'
        ];
        let index = 0;

        const updateStatus = () => {
            if (!this.isVisible) return;
            const statusEl = this.element.querySelector('.clawdian-loading-status-text');
            if (statusEl) {
                statusEl.textContent = statuses[index];
                index = (index + 1) % statuses.length;
            }
        };

        updateStatus();
        this.animationInterval = window.setInterval(updateStatus, 2000);
    }

    private stopStatusCycle() {
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
            this.animationInterval = undefined;
        }
    }

    /**
     * Update loading progress (0-100)
     */
    setProgress(percent: number) {
        const progressBar = this.element.querySelector('.clawdian-loading-progress-bar');
        if (progressBar) {
            (progressBar as HTMLElement).style.width = `${Math.min(100, Math.max(0, percent))}%`;
            
            // Show progress bar when there's actual progress
            if (percent > 0) {
                this.element.addClass('clawdian-loading-has-progress');
            }
        }
    }

    /**
     * Set custom status message
     */
    setStatus(message: string) {
        const statusEl = this.element.querySelector('.clawdian-loading-status');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    /**
     * Destroy the indicator
     */
    destroy() {
        this.stopStatusCycle();
        this.element.remove();
    }
}

/**
 * LoadingSkeleton - Placeholder for streaming content
 * Shows gray blocks while content is loading
 */
export class LoadingSkeleton {
    element: HTMLElement;

    constructor(parent: HTMLElement, lines = 3) {
        this.element = parent.createEl('div', { cls: 'clawdian-skeleton' });
        
        for (let i = 0; i < lines; i++) {
            const line = this.element.createEl('div', { 
                cls: 'clawdian-skeleton-line',
                attr: { style: `--skeleton-delay: ${i * 0.1}s` }
            });
            // Vary the width for realism
            const width = i === lines - 1 ? 60 : 100;
            line.style.width = `${width}%`;
        }
    }

    remove() {
        this.element.addClass('clawdian-skeleton-fade-out');
        setTimeout(() => this.element.remove(), 300);
    }
}
