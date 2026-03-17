#!/usr/bin/env python3
import re

def fix_file(filepath, replacements):
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
    
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Fixed: {filepath}")

# Fix ChatView.ts - only the title text
fix_file('src/components/ChatView.ts', [
    ("text: '🦞 Clawchat'", "text: '🦞 Claw Chat'"),
])

# Fix main.ts - ribbon icon and command name
fix_file('src/main.ts', [
    ("'Open Clawdian'", "'Open Claw Chat'"),
    ("'Open clawdian chat'", "'Open Claw Chat'"),
])

# Fix TokenModal.ts - Gateway URL sentence case
fix_file('src/components/TokenModal.ts', [
    (".setName('Gateway URL')", ".setName('Gateway url')"),
])

# Fix settings.ts - Gateway URL sentence case  
fix_file('src/settings.ts', [
    (".setName('Gateway URL')", ".setName('Gateway url')"),
])

print("\nDone! User-facing text updated.")
