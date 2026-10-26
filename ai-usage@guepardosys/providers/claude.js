import GLib from 'gi://GLib';
import {UsageProvider} from './base.js';
import {claudeCredentials} from '../services/credentials.js';
import {normalizeClaude} from './normalize.js';
// Claude Code can replace credentials while a usage query is in flight.
async function waitForCredentials(seconds, cancellable) {
    cancellable.set_error_if_cancelled();
    await new Promise(resolve => GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
        resolve(); return GLib.SOURCE_REMOVE;
    }));
    cancellable.set_error_if_cancelled();
}
export default class ClaudeProvider extends UsageProvider {
    constructor(credentials = claudeCredentials, wait = waitForCredentials) {
        super(); this.credentials = credentials; this.wait = wait;
    }
    async getUsage(account, cancellable) {
        for (let attempt = 0; ; attempt++) {
            cancellable.set_error_if_cancelled();
            try {
                const {token} = await this.credentials(account, cancellable);
                const raw = await this.request('https://api.anthropic.com/api/oauth/usage',
                    {Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20'}, cancellable);
                return normalizeClaude(raw);
            } catch (error) {
                if (!error.authentication || attempt >= 2 || cancellable.is_cancelled()) throw error;
                await this.wait(attempt === 0 ? 2 : 5, cancellable);
            }
        }
    }
}
