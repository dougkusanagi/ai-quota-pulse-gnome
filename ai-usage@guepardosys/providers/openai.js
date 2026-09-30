import {UsageProvider} from './base.js';
import {codexCredentials} from '../services/credentials.js';
import {normalizeOpenAI} from './normalize.js';
export default class OpenAIProvider extends UsageProvider {
    async getUsage(account, cancellable) {
        const {token, accountId} = await codexCredentials(account, cancellable);
        const raw = await this.request('https://chatgpt.com/backend-api/wham/usage',
            {Authorization: `Bearer ${token}`, 'ChatGPT-Account-Id': accountId}, cancellable);
        return normalizeOpenAI(raw);
    }
}
