# Provider research — 2026-09-30

Sources inspected before implementation:
- [Official Codex authentication](https://developers.openai.com/codex/auth/): existing auth.json or OS credential store. Subscription login and API-key billing are different.
- [Codex backend client](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client.rs): ChatGPT backend uses `/wham/usage`, Bearer and ChatGPT-Account-Id. Windows contain used_percent, limit_window_seconds and reset_at.
- [Codex credential storage](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs): legacy direct keyring service `Codex Auth`, user `cli|` plus first 16 hexadecimal SHA256 characters of canonical CODEX_HOME. Newer managed keyring storage is not the same protocol; this implementation reports unsupported credentials instead of searching unrelated secrets.
- [CodexBar Claude fetcher](https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/Claude/ClaudeOAuth/ClaudeOAuthUsageFetcher.swift): `https://api.anthropic.com/api/oauth/usage`, OAuth Bearer, `anthropic-beta: oauth-2025-04-20`. five_hour / seven_day / scoped weekly windows, utilization and resets_at; newer limits array and extra_usage.
- [GNOME blur](https://gnome.pages.gitlab.gnome.org/gnome-shell/shell/class.BlurEffect.html): BACKGROUND mode, sigma/radius compatibility detected from properties.

These quota endpoints are internal client mechanisms, not guaranteed public subscription APIs. They can reject third-party clients, expired auth, missing scopes or rate limiting. The extension does not scrape, estimate token quotas, mint credentials, refresh rotating tokens, or modify CLI auth. Reauthenticate using the matching CLI profile when necessary. API-key-only accounts cannot expose subscription quotas.

Architecture: credential reader (async Gio/libsecret, read only) → fixed-host libsoup request → pure normalizers → per-account refresh state → St view. All operations share cancellables; responses never logged or persisted. Accounts and appearance alone live in GSettings. Refresh batches use at most four concurrent requests and honor Retry-After. No subprocesses.
