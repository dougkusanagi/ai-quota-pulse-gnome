import {UsageProvider} from './base.js';
import {claudeCredentials} from '../services/credentials.js';
import {normalizeClaude} from './normalize.js';
export default class ClaudeProvider extends UsageProvider {
    async getUsage(account, cancellable) {
        const {token} = await claudeCredentials(account, cancellable);
        const raw = await this.request('https://api.anthropic.com/api/oauth/usage',
            {Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20'}, cancellable);
        return normalizeClaude(raw);
    }
}
