// Read-only provider check. Prints only normalized limits or sanitized errors.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import OpenAIProvider from '../ai-usage@guepardosys/providers/openai.js';
import ClaudeProvider from '../ai-usage@guepardosys/providers/claude.js';
const providerName = ARGV[0] ?? 'openai';
if (!['openai','claude'].includes(providerName)) throw new Error('Use openai ou claude.');
const provider = providerName === 'openai' ? new OpenAIProvider() : new ClaudeProvider();
const loop = new GLib.MainLoop(null, false);
const cancellable = new Gio.Cancellable();
let timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 35, () => {timeout = 0; cancellable.cancel(); return GLib.SOURCE_REMOVE;});
provider.getUsage({provider:providerName,profilePath:ARGV[1] ?? (providerName==='openai'?'~/.codex':'~/.claude')},cancellable)
    .then(usage => print(JSON.stringify({provider:providerName, windows:usage.windows, primary:usage.primary?.label})))
    .catch(error => print(JSON.stringify({provider:providerName,error:error.message})))
    .finally(() => {if (timeout) GLib.Source.remove(timeout);provider.destroy();loop.quit();});
loop.run();
