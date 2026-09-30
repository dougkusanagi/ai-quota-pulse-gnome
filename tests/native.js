import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {Accounts} from '../ai-usage@guepardosys/services/accounts.js';
import {RefreshService} from '../ai-usage@guepardosys/services/refresh.js';
import {UsageProvider} from '../ai-usage@guepardosys/providers/base.js';
import {codexCredentials, claudeCredentials} from '../ai-usage@guepardosys/services/credentials.js';
const loop = new GLib.MainLoop(null, false);
function assert(value, message) { if (!value) throw new Error(message); }
function sleep(ms) { return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {resolve(); return GLib.SOURCE_REMOVE;})); }
async function main() {
    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(`${GLib.get_current_dir()}/build/ai-usage@guepardosys/schemas`, Gio.SettingsSchemaSource.get_default(), false);
    const settings = new Gio.Settings({settings_schema: schemaSource.lookup('org.gnome.shell.extensions.aiusage', false)});
    const accounts = new Accounts(settings);
    for (let i=0;i<7;i++) accounts.put({id:`id-${i}`,provider:i===1?'claude':'openai',name:`Conta ${i}`,initials:'AB',color:'#0A84FF',profilePath:'~/.codex',visible:true});
    assert(accounts.list().length===7,'N accounts'); accounts.move('id-0',1); assert(accounts.list()[1].id==='id-0','ordering');
    let active=0,max=0,destroyed=0,callbacks=0;
    const provider = {async getUsage(account) {active++; max=Math.max(max,active); await sleep(20); active--; if(account.id==='id-1') throw new Error('Sanitized error'); return {windows:[],primary:null};},destroy(){destroyed++;}};
    const service = new RefreshService(accounts, settings,()=>callbacks++,{openai:provider,claude:provider});
    await service.refresh(); assert(max<=4,'bounded concurrency'); assert(service.states.size===7,'all accounts'); assert(service.states.get('id-1').error,'isolated failure'); assert(!service.busy,'refresh finished');
    service.start(); await sleep(2); const cancellable=service._cancellable; service.destroy(); const count=callbacks;
    assert(cancellable.is_cancelled(),'cancel requests'); await sleep(60); assert(callbacks===count,'no callback after disable'); assert(!service._timer,'no timer'); assert(destroyed===2,'providers destroyed');
    const tmp=GLib.dir_make_tmp('aiusage-test-XXXXXX');
    try {
        GLib.file_set_contents(`${tmp}/auth.json`,JSON.stringify({tokens:{access_token:'fixture-not-a-secret',account_id:'fixture'}}));
        GLib.file_set_contents(`${tmp}/.credentials.json`,JSON.stringify({claudeAiOauth:{accessToken:'fixture-not-a-secret',expiresAt:Date.now()+10000}}));
        assert((await codexCredentials({profilePath:tmp},new Gio.Cancellable())).accountId==='fixture','Codex credential shape');
        assert((await claudeCredentials({profilePath:tmp},new Gio.Cancellable())).token==='fixture-not-a-secret','Claude credential shape');
    } finally {Gio.File.new_for_path(`${tmp}/auth.json`).delete(null);Gio.File.new_for_path(`${tmp}/.credentials.json`).delete(null);Gio.File.new_for_path(tmp).delete(null);}
    const server=new Soup.Server(); let targetHits=0;
    server.add_handler('/ok',(_s,msg)=>{msg.set_status(200,null);msg.set_response('application/json',Soup.MemoryUse.COPY,'{"ok":true}');});
    server.add_handler('/redirect',(_s,msg)=>{msg.set_redirect(302,`${server.get_uris()[0].to_string()}target`);});
    server.add_handler('/target',(_s,msg)=>{targetHits++;msg.set_status(200,null);});
    server.add_handler('/limited',(_s,msg)=>{msg.set_status(429,null);msg.get_response_headers().append('Retry-After','600');});
    server.listen_local(0,0); const url=server.get_uris()[0].to_string(); const http=new UsageProvider();
    assert((await http.request(`${url}ok`,{},new Gio.Cancellable())).ok,'native libsoup request');
    try {await http.request(`${url}redirect`,{Authorization:'Bearer fixture'},new Gio.Cancellable());throw new Error('redirect accepted');}catch(e){assert(e.message.includes('302'),`redirect error: ${e.message}`);}
    assert(targetHits===0,'no credential redirect');
    try {await http.request(`${url}limited`,{},new Gio.Cancellable());throw new Error('429 accepted');}catch(e){assert(e.retryAfter===600,`Retry-After honored: ${e.message} ${e.retryAfter}`);}
    http.destroy();server.disconnect(); print('GJS: accounts, lifecycle, cancellation, credentials, HTTP and redirect security OK');
}
let failed=false;
main().catch(e=>{printerr(e.message);printerr(e.stack);failed=true;}).finally(()=>loop.quit());loop.run();if(failed) imports.system.exit(1);
