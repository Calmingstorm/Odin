import { api } from '../api.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../confirm.js';
import { computed, onMounted, ref } from 'vue';

export default {
  template: `
    <div class="p-6 page-fade-in space-y-6">
      <div class="flex items-center justify-between">
        <div><h1 class="text-xl font-semibold">Managed Hosts</h1><p class="text-xs text-gray-500 mt-1">Live inventory, pinned SSH trust, and connection health.</p></div>
        <div class="flex gap-2"><button class="btn btn-ghost text-xs" @click="load">Refresh</button><button class="btn btn-primary text-xs" @click="beginAdd">Add Host</button></div>
      </div>
      <div v-if="error" class="hm-card border-red-900 text-red-400">{{ error }}</div>
      <div v-if="pendingReferences.length" class="hm-card border-amber-800 space-y-2">
        <div class="text-sm text-amber-300">Deletion is blocked by these references:</div>
        <ul class="text-xs text-gray-300 list-disc pl-5"><li v-for="item in pendingReferences" :key="item.kind+':'+item.location"><span class="text-gray-400">{{ item.kind }}</span> · {{ item.location }}</li></ul>
      </div>
      <div class="hm-card flex flex-wrap gap-3 items-end">
        <label class="text-xs">Default host<select class="hm-input mt-1" v-model="defaultHost"><option value="">Require explicit host</option><option v-for="host in hosts" :key="host.host_id" :value="host.alias">{{ host.alias }}</option></select></label>
        <label class="text-xs flex gap-2 items-center"><input type="checkbox" v-model="tofuEnabled" /> Allow explicit TOFU enrollment</label>
        <button class="btn btn-ghost text-xs" @click="saveSettings">Save host settings</button>
      </div>
      <div class="hm-card table-responsive" v-if="hosts.length">
        <table class="hm-table"><thead><tr><th>Alias</th><th>Endpoint</th><th>Trust</th><th>State</th><th>Last test</th><th>Actions</th></tr></thead>
        <tbody><tr v-for="host in hosts" :key="host.host_id">
          <td><div class="text-gray-200">{{ host.alias }}</div><div class="text-xs text-gray-500">{{ host.description || 'No description' }}</div></td>
          <td class="text-xs">{{ host.ssh_user }}@{{ host.address }}:{{ host.port }}<br>{{ host.os }}</td>
          <td><span class="badge">{{ host.trust_state }}</span></td>
          <td class="text-xs"><span :class="host.targetable ? 'text-emerald-400' : 'text-amber-400'">{{ host.targetable ? 'Targetable' : 'Disabled' }}</span><span v-if="host.draining"> · draining</span></td>
          <td class="text-xs">{{ host.last_test?.detail || 'Not tested this process' }}</td>
          <td><div class="flex gap-2 flex-wrap"><button class="btn btn-ghost text-xs" @click="beginEdit(host)">Edit</button><button v-if="host.trust_mode==='legacy'" class="btn btn-ghost text-xs" @click="importLegacy(host)">Enroll trusted key</button><button class="btn btn-ghost text-xs" @click="toggle(host)">{{ host.enabled ? 'Disable' : 'Enable' }}</button><button class="btn btn-ghost text-xs text-red-400" @click="remove(host)">Delete</button><button v-if="host.draining" class="btn btn-ghost text-xs text-red-400" @click="forceRevoke(host)">Force revoke</button></div></td>
        </tr></tbody></table>
      </div>
      <div v-else-if="!loading" class="hm-card text-sm text-gray-500">No managed hosts configured.</div>

      <div v-if="wizard" class="hm-card space-y-4">
        <div class="flex justify-between"><h2 class="font-semibold">{{ editing ? 'Edit host' : 'Add host' }} · Step {{ step }} of 5</h2><button class="btn btn-ghost text-xs" @click="wizard=false">Close</button></div>
        <div v-if="step===1" class="grid md:grid-cols-2 gap-3">
          <label class="text-xs">Alias<input class="hm-input mt-1" v-model="form.alias" :disabled="editing" /></label>
          <label class="text-xs">Address<input class="hm-input mt-1" v-model="form.address" /></label>
          <label class="text-xs">Port<input class="hm-input mt-1" type="number" v-model.number="form.port" /></label>
          <label class="text-xs">SSH user<input class="hm-input mt-1" v-model="form.ssh_user" /></label>
          <label class="text-xs">Operating system<select class="hm-input mt-1" v-model="form.os"><option value="linux">Linux</option><option value="macos">macOS</option></select></label>
          <label class="text-xs">Description<input class="hm-input mt-1" maxlength="200" v-model="form.description" /></label>
          <label class="text-xs">Trust mode<select class="hm-input mt-1" v-model="form.trust_mode"><option value="pinned">Pinned fingerprint</option><option value="ca">Host CA</option><option value="tofu">TOFU</option><option v-if="editing && form.trust_mode==='legacy'" value="legacy">Legacy known_hosts</option></select></label>
          <label v-if="isLocal" class="text-xs flex gap-2 items-center"><input type="checkbox" v-model="form.confirm_local" /> I understand this target executes locally inside Odin</label>
        </div>
        <div v-if="step===2" class="space-y-3"><p class="text-sm">Install Odin's public key for <code>{{ form.ssh_user }}@{{ form.address }}</code>. Odin never accepts passwords or private keys here.</p><div v-if="keyInfo"><pre class="code-block whitespace-pre-wrap">{{ keyInfo.public_key }}</pre><pre class="code-block whitespace-pre-wrap">{{ keyInfo.authorized_keys_command }}</pre><p class="text-xs text-gray-500">Fingerprint: {{ keyInfo.fingerprint }}. {{ keyInfo.permissions }}</p></div><button class="btn btn-ghost text-xs" @click="loadKey">Load public key</button></div>
        <div v-if="step===3" class="space-y-3"><p class="text-sm">Verify the host key out of band. Run <code>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</code> on the target and paste its SHA256 fingerprint.</p><textarea class="hm-input" rows="3" v-model="fingerprintsText" placeholder="SHA256:..."></textarea><label v-if="form.trust_mode==='tofu'" class="text-xs flex gap-2"><input type="checkbox" v-model="form.confirm_tofu" /> Accept the exact scanned fingerprint under TOFU</label><button class="btn btn-primary text-xs" @click="prepare">Scan and compare</button><div v-if="observed.length" class="text-xs text-gray-400">Observed: {{ observed.join(', ') }}</div></div>
        <div v-if="step===4" class="space-y-3"><p class="text-sm">Test non-interactive authentication and platform identity before activation.</p><button class="btn btn-primary text-xs" @click="testConnection">Test connection</button><pre v-if="testResult" class="code-block">{{ JSON.stringify(testResult,null,2) }}</pre></div>
        <div v-if="step===5" class="space-y-3"><p class="text-sm">Activation is live. Users with <code>allowed_hosts: null</code> gain this host automatically. Review grants on Host Access after saving.</p><button class="btn btn-primary" :disabled="!tested" @click="commit">Save and activate</button><a class="btn btn-ghost text-xs" href="#/system?tab=host-access">Open Host Access</a></div>
        <div class="flex justify-between"><button class="btn btn-ghost text-xs" :disabled="step===1" @click="step--">Back</button><button v-if="step<5 && step!==3 && step!==4" class="btn btn-ghost text-xs" @click="step++">Next</button></div>
      </div>
    </div>`,
  setup() {
    const hosts=ref([]), loading=ref(false), error=ref(''), pendingReferences=ref([]), wizard=ref(false), editing=ref(false), step=ref(1), defaultHost=ref(''), tofuEnabled=ref(false);
    const keyInfo=ref(null), candidate=ref(''), observed=ref([]), tested=ref(false), testResult=ref(null), fingerprintsText=ref('');
    const blank=()=>({alias:'',address:'',port:22,ssh_user:'root',os:'linux',description:'',trust_mode:'pinned',enabled:true,confirm_local:false,confirm_tofu:false});
    const form=ref(blank()); const isLocal=computed(()=>['127.0.0.1','localhost','::1'].includes(form.value.address));
    async function load(){loading.value=true;error.value='';try{const r=await api.get('/api/hosts');hosts.value=r.hosts||[];defaultHost.value=r.default_host||'';tofuEnabled.value=!!r.tofu_enabled;}catch(e){error.value=e.message;}finally{loading.value=false;}}
    async function saveSettings(){try{await api.post('/api/hosts/settings',{default_host:defaultHost.value,allow_host_tofu:tofuEnabled.value});toast.success('Host settings saved and published live');await load();}catch(e){toast.error(e.message);}}
    function reset(){candidate.value='';observed.value=[];tested.value=false;testResult.value=null;keyInfo.value=null;fingerprintsText.value='';step.value=1;wizard.value=true;}
    function beginAdd(){editing.value=false;form.value=blank();reset();}
    function beginEdit(h){editing.value=true;form.value={...blank(),...h};reset();}
    async function loadKey(){try{keyInfo.value=await api.get('/api/hosts/public-key');}catch(e){toast.error(e.message);}}
    async function importLegacy(h){try{const r=await api.post('/api/hosts/'+encodeURIComponent(h.alias)+'/import-legacy',{});editing.value=true;form.value={...blank(),...h,trust_mode:'pinned'};reset();candidate.value=r.candidate_token;observed.value=r.fingerprints||[];fingerprintsText.value=observed.value.join('\n');step.value=4;toast.info('Imported existing known_hosts trust. Test before activation.');}catch(e){toast.error(e.message);}}
    async function prepare(){try{const expected=fingerprintsText.value.split(/\s+/).filter(Boolean);const body={...form.value,expected_fingerprints:expected,candidate_fingerprints:observed.value};const r=await api.post('/api/hosts/candidates',body);candidate.value=r.candidate_token;observed.value=r.fingerprints||[];if(form.value.trust_mode==='tofu'&&body.candidate_fingerprints.length===0){form.value.confirm_tofu=false;toast.info('Fingerprint scanned. Review it, tick confirmation, then scan again.');return;}step.value=4;}catch(e){toast.error(e.message);}}
    async function testConnection(){try{const r=await api.post('/api/hosts/candidates/'+candidate.value+'/test',{});tested.value=!!r.tested;testResult.value=r.last_test;if(tested.value)step.value=5;}catch(e){toast.error(e.message);}}
    async function commit(){try{await api.post('/api/hosts/candidates/'+candidate.value+'/commit',{});toast.success('Host saved and published live');wizard.value=false;await load();}catch(e){toast.error(e.message);}}
    async function toggle(h){try{await api.post('/api/hosts/'+encodeURIComponent(h.alias)+'/enabled',{enabled:!h.enabled});await load();}catch(e){toast.error(e.message);}}
    async function remove(h){if(!await confirmDialog('Delete host '+h.alias+'? Dependencies will block deletion.'))return;pendingReferences.value=[];try{await api.del('/api/hosts/'+encodeURIComponent(h.alias));await load();}catch(e){pendingReferences.value=Array.isArray(e.data?.pending_references)?e.data.pending_references:[];toast.error(e.message);}}
    async function forceRevoke(h){if(!await confirmDialog('Force revoke '+h.alias+'? Remote outcomes may be unknown.'))return;try{await api.post('/api/hosts/'+encodeURIComponent(h.alias)+'/force-revoke',{});await load();}catch(e){toast.error(e.message);}}
    onMounted(load); return{hosts,loading,error,pendingReferences,wizard,editing,step,defaultHost,tofuEnabled,form,isLocal,keyInfo,candidate,observed,tested,testResult,fingerprintsText,load,saveSettings,beginAdd,beginEdit,loadKey,importLegacy,prepare,testConnection,commit,toggle,remove,forceRevoke};
  }
};
