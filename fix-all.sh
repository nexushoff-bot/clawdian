#!/bin/bash
set -e

cd /Users/nexus/clawdian

# Fix main.ts - handle any types in catch blocks
sed -i '' 's/catch (e: any)/catch (e: unknown)/g' src/main.ts
sed -i '' 's/catch (folderError: any)/catch (folderError: unknown)/g' src/main.ts

# Fix the debugLog and debugError to use unknown[]
sed -i '' 's/private debugLog(\.\.\.args: any\[\])/private debugLog(...args: unknown[])/g' src/main.ts
sed -i '' 's/private debugError(\.\.\.args: any\[\])/private debugError(...args: unknown[])/g' src/main.ts

# Fix OpenClawClient.ts - change any to unknown in interface
sed -i '' 's/payload?: any;/payload?: unknown;/g' src/utils/OpenClawClient.ts
sed -i '' 's/error?: any;/error?: unknown;/g' src/utils/OpenClawClient.ts

# Add type assertions for error handling in OpenClawClient.ts
sed -i '' 's/const errorMsg = data\.error\.message/const errorMsg = (data.error as { message?: string }).message/g' src/utils/OpenClawClient.ts
sed -i '' 's/data\.error || .Connection failed./String(data.error) || 'Connection failed'/g' src/utils/OpenClawClient.ts
sed -i '' 's/data\.error || .Auth failed./String(data.error) || 'Auth failed'/g' src/utils/OpenClawClient.ts

# Fix payload access
sed -i '' 's/data\.payload\.agents/(data.payload as { agents?: AgentInfo[] })?.agents/g' src/utils/OpenClawClient.ts
sed -i '' 's/this\.agents = data\.payload\.agents/this.agents = (data.payload as { agents: AgentInfo[] }).agents/g' src/utils/OpenClawClient.ts
sed -i '' 's/data\.payload\.nonce/(data.payload as { nonce?: string })?.nonce/g' src/utils/OpenClawClient.ts

# Fix getSessionStatus payload access
sed -i '' 's/const state = data\.payload\.state/const payload = data.payload as { state?: string; status?: string; session?: { state?: string } };\n                    const state = payload?.state/g' src/utils/OpenClawClient.ts
sed -i '' 's/data\.payload\.status/payload?.status/g' src/utils/OpenClawClient.ts
sed -i '' 's/data\.payload\.session/payload?.session/g' src/utils/OpenClawClient.ts

# Fix main.ts error messages
sed -i '' 's/e\.message || e/(e instanceof Error ? e.message : String(e))/g' src/main.ts
sed -i '' 's/folderError\.message/folderError instanceof Error ? folderError.message : String(folderError)/g' src/main.ts

echo "Fixes applied!"
