    checkSessionStatus() {
        if (!this.client.isConnected()) {
            this.showDisconnected();
            this.hideLoading();
            this.stopStatusPolling();
            new Notice('🔴 Connection lost. Check gateway settings.');
            return;
        }
        // ... rest unchanged
    }