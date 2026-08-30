var nv=Object.defineProperty;var av=(e,t,s)=>t in e?nv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ut=(e,t,s)=>av(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class iv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new hl("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new hd(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new hl("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new hd((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new hl((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof hl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class hl extends Error{constructor(t){super(t),this.name="AuthError"}}class hd extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class lv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const r of this._subscriptions)a.send(JSON.stringify({subscribe:r}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let r;try{r=JSON.parse(l.data)}catch{return}const o=r.type;if(o==="pong"){r.ts&&(this._latency=Date.now()-r.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(o==="subscribed"){this._ackSubscription(a,r.channel);return}if(o==="log")for(const c of this._handlers.logs||[])c(r);else if(o==="event")for(const c of this._handlers.events||[])c(r);else if(o==="chat_response"||o==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(r)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const W=new iv,Ye=new lv(W);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Ts(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ke={},Ba=[],Vt=()=>{},$a=()=>!1,ya=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),mr=e=>e.startsWith("onUpdate:"),Ge=Object.assign,nc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},rv=Object.prototype.hasOwnProperty,tt=(e,t)=>rv.call(e,t),Ae=Array.isArray,Ha=e=>oi(e)==="[object Map]",xa=e=>oi(e)==="[object Set]",md=e=>oi(e)==="[object Date]",ov=e=>oi(e)==="[object RegExp]",Fe=e=>typeof e=="function",Ue=e=>typeof e=="string",es=e=>typeof e=="symbol",et=e=>e!==null&&typeof e=="object",ac=e=>(et(e)||Fe(e))&&Fe(e.then)&&Fe(e.catch),xp=Object.prototype.toString,oi=e=>xp.call(e),cv=e=>oi(e).slice(8,-1),vr=e=>oi(e)==="[object Object]",gr=e=>Ue(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,kn=Ts(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),dv=Ts("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),br=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},uv=/-\w/g,ot=br(e=>e.replace(uv,t=>t.slice(1).toUpperCase())),pv=/\B([A-Z])/g,vs=br(e=>e.replace(pv,"-$1").toLowerCase()),_a=br(e=>e.charAt(0).toUpperCase()+e.slice(1)),za=br(e=>e?`on${_a(e)}`:""),Ft=(e,t)=>!Object.is(e,t),ja=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},_p=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},yr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Ul=e=>{const t=Ue(e)?Number(e):NaN;return isNaN(t)?e:t};let vd;const xr=()=>vd||(vd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function fv(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const hv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",mv=Ts(hv);function nl(e){if(Ae(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ue(n)?wp(n):nl(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ue(e)||et(e))return e}const vv=/;(?![^(]*\))/g,gv=/:([^]+)/,bv=/\/\*[^]*?\*\//g;function wp(e){const t={};return e.replace(bv,"").split(vv).forEach(s=>{if(s){const n=s.split(gv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function al(e){let t="";if(Ue(e))t=e;else if(Ae(e))for(let s=0;s<e.length;s++){const n=al(e[s]);n&&(t+=n+" ")}else if(et(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function yv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ue(t)&&(e.class=al(t)),s&&(e.style=nl(s)),e}const xv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",_v="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",wv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",kv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Sv=Ts(xv),Tv=Ts(_v),Cv=Ts(wv),Ev=Ts(kv),Av="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Rv=Ts(Av);function kp(e){return!!e||e===""}function Iv(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=En(e[n],t[n]);return s}function En(e,t){if(e===t)return!0;let s=md(e),n=md(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=es(e),n=es(t),s||n)return e===t;if(s=Ae(e),n=Ae(t),s||n)return s&&n?Iv(e,t):!1;if(s=et(e),n=et(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!En(e[l],t[l]))return!1}}return String(e)===String(t)}function _r(e,t){return e.findIndex(s=>En(s,t))}const Sp=e=>!!(e&&e.__v_isRef===!0),Tp=e=>Ue(e)?e:e==null?"":Ae(e)||et(e)&&(e.toString===xp||!Fe(e.toString))?Sp(e)?Tp(e.value):JSON.stringify(e,Cp,2):String(e),Cp=(e,t)=>Sp(t)?Cp(e,t.value):Ha(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[qr(n,i)+" =>"]=a,s),{})}:xa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>qr(s))}:es(t)?qr(t):et(t)&&!Ae(t)&&!vr(t)?String(t):t,qr=(e,t="")=>{var s;return es(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Ov(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Dt;class ic{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Dt&&(Dt.active?(this.parent=Dt,this.index=(Dt.scopes||(Dt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Dt;try{return Dt=this,t()}finally{Dt=s}}}on(){++this._on===1&&(this.prevScope=Dt,Dt=this)}off(){if(this._on>0&&--this._on===0){if(Dt===this)Dt=this.prevScope;else{let t=Dt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Lv(e){return new ic(e)}function Ep(){return Dt}function Nv(e,t=!1){Dt&&Dt.cleanups.push(e)}let pt;const Gr=new WeakSet;class Ui{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Dt&&(Dt.active?Dt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Gr.has(this)&&(Gr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Rp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,gd(this),Ip(this);const t=pt,s=js;pt=this,js=!0;try{return this.fn()}finally{Op(this),pt=t,js=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)oc(t);this.deps=this.depsTail=void 0,gd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Gr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){wo(this)&&this.run()}get dirty(){return wo(this)}}let Ap=0,Ai,Ri;function Rp(e,t=!1){if(e.flags|=8,t){e.next=Ri,Ri=e;return}e.next=Ai,Ai=e}function lc(){Ap++}function rc(){if(--Ap>0)return;if(Ri){let t=Ri;for(Ri=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Ai;){let t=Ai;for(Ai=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Ip(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Op(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),oc(n),Dv(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function wo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Lp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Lp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Bi)||(e.globalVersion=Bi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!wo(e))))return;e.flags|=2;const t=e.dep,s=pt,n=js;pt=e,js=!0;try{Ip(e);const a=e.fn(e._value);(t.version===0||Ft(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{pt=s,js=n,Op(e),e.flags&=-3}}function oc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)oc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Dv(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Mv(e,t){e.effect instanceof Ui&&(e=e.effect.fn);const s=new Ui(e);t&&Ge(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Pv(e){e.effect.stop()}let js=!0;const Np=[];function An(){Np.push(js),js=!1}function Rn(){const e=Np.pop();js=e===void 0?!0:e}function gd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=pt;pt=void 0;try{t()}finally{pt=s}}}let Bi=0;class Fv{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class wr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!pt||!js||pt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==pt)s=this.activeLink=new Fv(pt,this),pt.deps?(s.prevDep=pt.depsTail,pt.depsTail.nextDep=s,pt.depsTail=s):pt.deps=pt.depsTail=s,Dp(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=pt.depsTail,s.nextDep=void 0,pt.depsTail.nextDep=s,pt.depsTail=s,pt.deps===s&&(pt.deps=n)}return s}trigger(t){this.version++,Bi++,this.notify(t)}notify(t){lc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{rc()}}}function Dp(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Dp(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Bl=new WeakMap,da=Symbol(""),ko=Symbol(""),Hi=Symbol("");function Jt(e,t,s){if(js&&pt){let n=Bl.get(e);n||Bl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new wr),a.map=n,a.key=s),a.track()}}function bn(e,t,s,n,a,i){const l=Bl.get(e);if(!l){Bi++;return}const r=o=>{o&&o.trigger()};if(lc(),t==="clear")l.forEach(r);else{const o=Ae(e),c=o&&gr(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Hi||!es(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Hi)),t){case"add":o?c&&r(l.get("length")):(r(l.get(da)),Ha(e)&&r(l.get(ko)));break;case"delete":o||(r(l.get(da)),Ha(e)&&r(l.get(ko)));break;case"set":Ha(e)&&r(l.get(da));break}}rc()}function $v(e,t){const s=Bl.get(e);return s&&s.get(t)}function Aa(e){const t=Je(e);return t===e?t:(Jt(t,"iterate",Hi),bs(e)?t:t.map(qs))}function kr(e){return Jt(e=Je(e),"iterate",Hi),e}function sn(e,t){return an(e)?Ja(Sn(e)?qs(t):t):qs(t)}const Uv={__proto__:null,[Symbol.iterator](){return Kr(this,Symbol.iterator,e=>sn(this,e))},concat(...e){return Aa(this).concat(...e.map(t=>Ae(t)?Aa(t):t))},entries(){return Kr(this,"entries",e=>(e[1]=sn(this,e[1]),e))},every(e,t){return dn(this,"every",e,t,void 0,arguments)},filter(e,t){return dn(this,"filter",e,t,s=>s.map(n=>sn(this,n)),arguments)},find(e,t){return dn(this,"find",e,t,s=>sn(this,s),arguments)},findIndex(e,t){return dn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return dn(this,"findLast",e,t,s=>sn(this,s),arguments)},findLastIndex(e,t){return dn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return dn(this,"forEach",e,t,void 0,arguments)},includes(...e){return Wr(this,"includes",e)},indexOf(...e){return Wr(this,"indexOf",e)},join(e){return Aa(this).join(e)},lastIndexOf(...e){return Wr(this,"lastIndexOf",e)},map(e,t){return dn(this,"map",e,t,void 0,arguments)},pop(){return fi(this,"pop")},push(...e){return fi(this,"push",e)},reduce(e,...t){return bd(this,"reduce",e,t)},reduceRight(e,...t){return bd(this,"reduceRight",e,t)},shift(){return fi(this,"shift")},some(e,t){return dn(this,"some",e,t,void 0,arguments)},splice(...e){return fi(this,"splice",e)},toReversed(){return Aa(this).toReversed()},toSorted(e){return Aa(this).toSorted(e)},toSpliced(...e){return Aa(this).toSpliced(...e)},unshift(...e){return fi(this,"unshift",e)},values(){return Kr(this,"values",e=>sn(this,e))}};function Kr(e,t,s){const n=kr(e),a=n[t]();return n!==e&&!bs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Bv=Array.prototype;function dn(e,t,s,n,a,i){const l=kr(e),r=l!==e&&!bs(e),o=l[t];if(o!==Bv[t]){const u=o.apply(e,i);return r?qs(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,sn(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function bd(e,t,s,n){const a=kr(e),i=a!==e&&!bs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=sn(e,c)),s.call(this,c,sn(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?sn(e,o):o}function Wr(e,t,s){const n=Je(e);Jt(n,"iterate",Hi);const a=n[t](...s);return(a===-1||a===!1)&&il(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function fi(e,t,s=[]){An(),lc();const n=Je(e)[t].apply(e,s);return rc(),Rn(),n}const Hv=Ts("__proto__,__v_isRef,__isVue"),Mp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(es));function zv(e){es(e)||(e=String(e));const t=Je(this);return Jt(t,"has",e),t.hasOwnProperty(e)}class Pp{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?zp:Hp:i?Bp:Up).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ae(t);if(!a){let o;if(l&&(o=Uv[s]))return o;if(s==="hasOwnProperty")return zv}const r=Reflect.get(t,s,Rt(t)?t:n);if((es(s)?Mp.has(s):Hv(s))||(a||Jt(t,"get",s),i))return r;if(Rt(r)){const o=l&&gr(s)?r:r.value;return a&&et(o)?Hl(o):o}return et(r)?a?Hl(r):Wn(r):r}}class Fp extends Pp{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ae(t)&&gr(s);if(!this._isShallow){const c=an(i);if(!bs(n)&&!an(n)&&(i=Je(i),n=Je(n)),!l&&Rt(i)&&!Rt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:tt(t,s),o=Reflect.set(t,s,n,Rt(t)?t:a);return t===Je(a)&&(r?Ft(n,i)&&bn(t,"set",s,n):bn(t,"add",s,n)),o}deleteProperty(t,s){const n=tt(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&bn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!es(s)||!Mp.has(s))&&Jt(t,"has",s),n}ownKeys(t){return Jt(t,"iterate",Ae(t)?"length":da),Reflect.ownKeys(t)}}class $p extends Pp{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const jv=new Fp,Vv=new $p,qv=new Fp(!0),Gv=new $p(!0),So=e=>e,ml=e=>Reflect.getPrototypeOf(e);function Kv(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=Ha(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?So:t?Ja:qs;return!t&&Jt(i,"iterate",o?ko:da),Ge(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function vl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Wv(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),r=Je(a);e||(Ft(a,r)&&Jt(l,"get",a),Jt(l,"get",r));const{has:o}=ml(l),c=t?So:e?Ja:qs;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Jt(Je(a),"iterate",da),a.size},has(a){const i=this.__v_raw,l=Je(i),r=Je(a);return e||(Ft(a,r)&&Jt(l,"has",a),Jt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Je(r),c=t?So:e?Ja:qs;return!e&&Jt(o,"iterate",da),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return Ge(s,e?{add:vl("add"),set:vl("set"),delete:vl("delete"),clear:vl("clear")}:{add(a){const i=Je(this),l=ml(i),r=Je(a),o=!t&&!bs(a)&&!an(a)?r:a;return l.has.call(i,o)||Ft(a,o)&&l.has.call(i,a)||Ft(r,o)&&l.has.call(i,r)||(i.add(o),bn(i,"add",o,o)),this},set(a,i){!t&&!bs(i)&&!an(i)&&(i=Je(i));const l=Je(this),{has:r,get:o}=ml(l);let c=r.call(l,a);c||(a=Je(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Ft(i,d)&&bn(l,"set",a,i):bn(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:r}=ml(i);let o=l.call(i,a);o||(a=Je(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&bn(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&bn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Kv(a,e,t)}),s}function Sr(e,t){const s=Wv(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(tt(s,a)&&a in n?s:n,a,i)}const Zv={get:Sr(!1,!1)},Jv={get:Sr(!1,!0)},Yv={get:Sr(!0,!1)},Qv={get:Sr(!0,!0)},Up=new WeakMap,Bp=new WeakMap,Hp=new WeakMap,zp=new WeakMap;function Xv(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Wn(e){return an(e)?e:Tr(e,!1,jv,Zv,Up)}function cc(e){return Tr(e,!1,qv,Jv,Bp)}function Hl(e){return Tr(e,!0,Vv,Yv,Hp)}function eg(e){return Tr(e,!0,Gv,Qv,zp)}function Tr(e,t,s,n,a){if(!et(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Xv(cv(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function Sn(e){return an(e)?Sn(e.__v_raw):!!(e&&e.__v_isReactive)}function an(e){return!!(e&&e.__v_isReadonly)}function bs(e){return!!(e&&e.__v_isShallow)}function il(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function jp(e){return!tt(e,"__v_skip")&&Object.isExtensible(e)&&_p(e,"__v_skip",!0),e}const qs=e=>et(e)?Wn(e):e,Ja=e=>et(e)?Hl(e):e;function Rt(e){return e?e.__v_isRef===!0:!1}function f(e){return Vp(e,!1)}function dc(e){return Vp(e,!0)}function Vp(e,t){return Rt(e)?e:new tg(e,t)}class tg{constructor(t,s){this.dep=new wr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:qs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||bs(t)||an(t);t=n?t:Je(t),Ft(t,s)&&(this._rawValue=t,this._value=n?t:qs(t),this.dep.trigger())}}function sg(e){e.dep&&e.dep.trigger()}function nn(e){return Rt(e)?e.value:e}function ng(e){return Fe(e)?e():nn(e)}const ag={get:(e,t,s)=>t==="__v_raw"?e:nn(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Rt(a)&&!Rt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function uc(e){return Sn(e)?e:new Proxy(e,ag)}class ig{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new wr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function qp(e){return new ig(e)}function lg(e){const t=Ae(e)?new Array(e.length):{};for(const s in e)t[s]=Gp(e,s);return t}class rg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=es(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!Ae(t)||es(this._key)||!gr(this._key))do a=!il(i)||bs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=nn(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Rt(this._raw[this._key])){const s=this._object[this._key];if(Rt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return $v(this._raw,this._key)}}class og{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function cg(e,t,s){return Rt(e)?e:Fe(e)?new og(e):et(e)&&arguments.length>1?Gp(e,t,s):f(e)}function Gp(e,t,s){return new rg(e,t,s)}class dg{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new wr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Bi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&pt!==this)return Rp(this,!0),!0}get value(){const t=this.dep.track();return Lp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function ug(e,t,s=!1){let n,a;return Fe(e)?n=e:(n=e.get,a=e.set),new dg(n,a,s)}const pg={GET:"get",HAS:"has",ITERATE:"iterate"},fg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},gl={},zl=new WeakMap;let Hn;function hg(){return Hn}function Kp(e,t=!1,s=Hn){if(s){let n=zl.get(s);n||zl.set(s,n=[]),n.push(e)}}function mg(e,t,s=Ke){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=b=>a?b:bs(b)||a===!1||a===0?yn(b,1):yn(b);let d,u,p,h,m=!1,v=!1;if(Rt(e)?(u=()=>e.value,m=bs(e)):Sn(e)?(u=()=>c(e),m=!0):Ae(e)?(v=!0,m=e.some(b=>Sn(b)||bs(b)),u=()=>e.map(b=>{if(Rt(b))return b.value;if(Sn(b))return c(b);if(Fe(b))return o?o(b,2):b()})):Fe(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){An();try{p()}finally{Rn()}}const b=Hn;Hn=d;try{return o?o(e,3,[h]):e(h)}finally{Hn=b}}:u=Vt,t&&a){const b=u,S=a===!0?1/0:a;u=()=>yn(b(),S)}const C=Ep(),L=()=>{d.stop(),C&&C.active&&nc(C.effects,d)};if(i&&t){const b=t;t=(...S)=>{const k=b(...S);return L(),k}}let y=v?new Array(e.length).fill(gl):gl;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const S=d.run();if(b||a||m||(v?S.some((k,A)=>Ft(k,y[A])):Ft(S,y))){p&&p();const k=Hn;Hn=d;try{const A=[S,y===gl?void 0:v&&y[0]===gl?[]:y,h];y=S,o?o(t,3,A):t(...A)}finally{Hn=k}}}else d.run()};return r&&r(g),d=new Ui(u),d.scheduler=l?()=>l(g,!1):g,h=b=>Kp(b,!1,d),p=d.onStop=()=>{const b=zl.get(d);if(b){if(o)o(b,4);else for(const S of b)S();zl.delete(d)}},t?n?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),L.pause=d.pause.bind(d),L.resume=d.resume.bind(d),L.stop=L,L}function yn(e,t=1/0,s){if(t<=0||!et(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Rt(e))yn(e.value,t,s);else if(Ae(e))for(let n=0;n<e.length;n++)yn(e[n],t,s);else if(xa(e)||Ha(e))e.forEach(n=>{yn(n,t,s)});else if(vr(e)){for(const n in e)yn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&yn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Wp=[];function vg(e){Wp.push(e)}function gg(){Wp.pop()}function bg(e,t){}const yg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},xg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function ci(e,t,s,n){try{return n?e(...n):e()}catch(a){wa(a,t,s)}}function Ss(e,t,s,n){if(Fe(e)){const a=ci(e,t,s,n);return a&&ac(a)&&a.catch(i=>{wa(i,t,s)}),a}if(Ae(e)){const a=[];for(let i=0;i<e.length;i++)a.push(Ss(e[i],t,s,n));return a}}function wa(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ke;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){An(),ci(i,null,10,[e,o,c]),Rn();return}}_g(e,s,a,n,l)}function _g(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ls=[];let en=-1;const Va=[];let zn=null,Da=0;const Zp=Promise.resolve();let jl=null;function Et(e){const t=jl||Zp;return e?t.then(this?e.bind(this):e):t}function wg(e){let t=en+1,s=ls.length;for(;t<s;){const n=t+s>>>1,a=ls[n],i=ji(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function pc(e){if(!(e.flags&1)){const t=ji(e),s=ls[ls.length-1];!s||!(e.flags&2)&&t>=ji(s)?ls.push(e):ls.splice(wg(t),0,e),e.flags|=1,Jp()}}function Jp(){jl||(jl=Zp.then(Yp))}function zi(e){Ae(e)?Va.push(...e):zn&&e.id===-1?zn.splice(Da+1,0,e):e.flags&1||(Va.push(e),e.flags|=1),Jp()}function yd(e,t,s=en+1){for(;s<ls.length;s++){const n=ls[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ls.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Vl(e){if(Va.length){const t=[...new Set(Va)].sort((s,n)=>ji(s)-ji(n));if(Va.length=0,zn){zn.push(...t);return}for(zn=t,Da=0;Da<zn.length;Da++){const s=zn[Da];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}zn=null,Da=0}}const ji=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Yp(e){try{for(en=0;en<ls.length;en++){const t=ls[en];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),ci(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;en<ls.length;en++){const t=ls[en];t&&(t.flags&=-2)}en=-1,ls.length=0,Vl(),jl=null,(ls.length||Va.length)&&Yp()}}let Ma,bl=[];function Qp(e,t){var s,n;Ma=e,Ma?(Ma.enabled=!0,bl.forEach(({event:a,args:i})=>Ma.emit(a,...i)),bl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Qp(i,t)}),setTimeout(()=>{Ma||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,bl=[])},3e3)):bl=[]}let jt=null,Cr=null;function Vi(e){const t=jt;return jt=e,Cr=e&&e.type.__scopeId||null,t}function kg(e){Cr=e}function Sg(){Cr=null}const Tg=e=>fc;function fc(e,t=jt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Wi(-1);const i=Vi(t);let l;try{l=e(...a)}finally{Vi(i),n._d&&Wi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Cg(e,t){if(jt===null)return e;const s=cl(jt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Ke]=t[a];i&&(Fe(i)&&(i={mounted:i,updated:i}),i.deep&&yn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function tn(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(An(),Ss(o,s,8,[e.el,r,e,t]),Rn())}}function Ii(e,t){if(zt){let s=zt.provides;const n=zt.parent&&zt.parent.provides;n===s&&(s=zt.provides=Object.create(n)),s[e]=t}}function Ms(e,t,s=!1){const n=cs();if(n||ua){let a=ua?ua._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Fe(t)?t.call(n&&n.proxy):t}}function Eg(){return!!(cs()||ua)}const Xp=Symbol.for("v-scx"),ef=()=>Ms(Xp);function Ag(e,t){return ll(e,null,t)}function Rg(e,t){return ll(e,null,{flush:"post"})}function tf(e,t){return ll(e,null,{flush:"sync"})}function os(e,t,s){return ll(e,t,s)}function ll(e,t,s=Ke){const{immediate:n,deep:a,flush:i,once:l}=s,r=Ge({},s),o=t&&n||!t&&i!=="post";let c;if(va){if(i==="sync"){const h=ef();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!o){const h=()=>{};return h.stop=Vt,h.resume=Vt,h.pause=Vt,h}}const d=zt;r.call=(h,m,v)=>Ss(h,d,m,v);let u=!1;i==="post"?r.scheduler=h=>{Ct(h,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(h,m)=>{m?h():pc(h)}),r.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=mg(e,t,r);return va&&(c?c.push(p):o&&p()),p}function Ig(e,t,s){const n=this.proxy,a=Ue(e)?e.includes(".")?sf(n,e):()=>n[e]:e.bind(n,n);let i;Fe(t)?i=t:(i=t.handler,s=t);const l=di(this),r=ll(a,i.bind(n),s);return l(),r}function sf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Un=new WeakMap,nf=Symbol("_vte"),af=e=>e.__isTeleport,la=e=>e&&(e.disabled||e.disabled===""),Og=e=>e&&(e.defer||e.defer===""),xd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,_d=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,To=(e,t)=>{const s=e&&e.to;return Ue(s)?t?t(s):null:s},Lg={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:C,parentNode:L}}=c,y=la(t.props);let{dynamicChildren:g}=t;const b=(A,T,_)=>{A.shapeFlag&16&&d(A.children,T,_,a,i,l,r,o)},S=(A=t)=>{const T=la(A.props),_=A.target=To(A.props,m),D=Co(_,A,v,h);_&&(l!=="svg"&&xd(_)?l="svg":l!=="mathml"&&_d(_)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(_),T||(b(A,_,D),ki(A,!1)))},k=A=>{const T=()=>{if(Un.get(A)===T){if(Un.delete(A),la(A.props)){const _=L(A.el)||s;b(A,_,A.anchor),ki(A,!0)}S(A)}};Un.set(A,T),Ct(T,i)};if(e==null){const A=t.el=v(""),T=t.anchor=v("");if(h(A,s,n),h(T,s,n),Og(t.props)||i&&i.pendingBranch){k(t);return}y&&(b(t,s,T),ki(t,!0)),S()}else{t.el=e.el;const A=t.anchor=e.anchor,T=Un.get(e);if(T){T.flags|=8,Un.delete(e),k(t);return}t.targetStart=e.targetStart;const _=t.target=e.target,D=t.targetAnchor=e.targetAnchor,E=la(e.props),R=E?s:_,$=E?A:D;if(l==="svg"||xd(_)?l="svg":(l==="mathml"||_d(_))&&(l="mathml"),g?(p(e.dynamicChildren,g,R,a,i,l,r),Sc(e,t,!0)):o||u(e,t,R,$,a,i,l,r,!1),y)E?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):yl(t,s,A,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const V=t.target=To(t.props,m);V&&yl(t,V,null,c,0)}else E&&yl(t,_,D,c,1);ki(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!la(p),m=Un.get(e);if(m&&(m.flags|=8,Un.delete(e)),u&&(a(c),a(d)),i&&a(o),!m&&l&16)for(let v=0;v<r.length;v++){const C=r[v];n(C,t,s,h,!!C.dynamicChildren)}},move:yl,hydrate:Ng};function yl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Un.has(e)&&(!u||la(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function Ng(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(C,L){let y=L;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,C._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(C,L){L.anchor=u(l(C),L,r(C),s,n,a,i)}const m=t.target=To(t.props,o),v=la(t.props);if(m){const C=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,C),t.targetAnchor||Co(m,t,d,c,r(e)===m?e:null)):(t.anchor=l(e),p(m,C),t.targetAnchor||Co(m,t,d,c),u(C&&l(C),t,m,s,n,a,i))),ki(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Dg=Lg;function ki(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Co(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[nf]=l,e&&(n(i,e,a),n(l,e,a)),l}const Os=Symbol("_leaveCb"),hi=Symbol("_enterCb");function hc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return We(()=>{e.isMounted=!0}),Ir(()=>{e.isUnmounting=!0}),e}const Is=[Function,Array],mc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Is,onEnter:Is,onAfterEnter:Is,onEnterCancelled:Is,onBeforeLeave:Is,onLeave:Is,onAfterLeave:Is,onLeaveCancelled:Is,onBeforeAppear:Is,onAppear:Is,onAfterAppear:Is,onAppearCancelled:Is},lf=e=>{const t=e.subTree;return t.component?lf(t.component):t},Mg={name:"BaseTransition",props:mc,setup(e,{slots:t}){const s=cs(),n=hc();return()=>{const a=t.default&&Er(t.default(),!0),i=a&&a.length?rf(a):s.subTree?jf():void 0;if(!i)return;const l=Je(e),{mode:r}=l;if(n.isLeaving)return Zr(i);const o=wd(i);if(!o)return Zr(i);let c=Ya(o,l,n,s,u=>c=u);o.type!==Tt&&In(o,c);let d=s.subTree&&wd(s.subTree);if(d&&d.type!==Tt&&!zs(d,o)&&lf(s).type!==Tt){let u=Ya(d,l,n,s);if(In(d,u),r==="out-in"&&o.type!==Tt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Zr(i);r==="in-out"&&o.type!==Tt?u.delayLeave=(p,h,m)=>{const v=cf(n,d);v[String(d.key)]=d,p[Os]=()=>{h(),p[Os]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function rf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Tt){t=s;break}}return t}const of=Mg;function cf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Ya(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:C,onAppear:L,onAfterAppear:y,onAppearCancelled:g}=t,b=String(e.key),S=cf(s,e),k=(_,D)=>{_&&Ss(_,n,9,D)},A=(_,D)=>{const E=D[1];k(_,D),Ae(_)?_.every(R=>R.length<=1)&&E():_.length<=1&&E()},T={mode:l,persisted:r,beforeEnter(_){let D=o;if(!s.isMounted)if(i)D=C||o;else return;_[Os]&&_[Os](!0);const E=S[b];E&&zs(e,E)&&E.el[Os]&&E.el[Os](),k(D,[_])},enter(_){if(S[b]===e)return;let D=c,E=d,R=u;if(!s.isMounted)if(i)D=L||c,E=y||d,R=g||u;else return;let $=!1;_[hi]=oe=>{$||($=!0,oe?k(R,[_]):k(E,[_]),T.delayedLeave&&T.delayedLeave(),_[hi]=void 0)};const V=_[hi].bind(null,!1);D?A(D,[_,V]):V()},leave(_,D){const E=String(e.key);if(_[hi]&&_[hi](!0),s.isUnmounting)return D();k(p,[_]);let R=!1;_[Os]=V=>{R||(R=!0,D(),V?k(v,[_]):k(m,[_]),_[Os]=void 0,S[E]===e&&delete S[E])};const $=_[Os].bind(null,!1);S[E]=e,h?A(h,[_,$]):$()},clone(_){const D=Ya(_,t,s,n,a);return a&&a(D),D}};return T}function Zr(e){if(ol(e))return e=ln(e),e.children=null,e}function wd(e){if(!ol(e))return af(e.type)&&e.children?rf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Fe(s.default))return s.default()}}function In(e,t){e.shapeFlag&6&&e.component?(e.transition=t,In(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Er(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===$t?(l.patchFlag&128&&a++,n=n.concat(Er(l.children,t,r))):(t||l.type!==Tt)&&n.push(r!=null?ln(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function rl(e,t){return Fe(e)?Ge({name:e.name},t,{setup:e}):e}function Pg(){const e=cs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function vc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Fg(e){const t=cs(),s=dc(null);if(t){const a=t.refs===Ke?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function kd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const ql=new WeakMap;function qa(e,t,s,n,a=!1){if(Ae(e)){e.forEach((v,C)=>qa(v,t&&(Ae(t)?t[C]:t),s,n,a));return}if(Tn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&qa(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?cl(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Ke?r.refs={}:r.refs,u=r.setupState,p=Je(u),h=u===Ke?$a:v=>kd(d,v)?!1:tt(p,v),m=(v,C)=>!(C&&kd(d,C));if(c!=null&&c!==o){if(Sd(t),Ue(c))d[c]=null,h(c)&&(u[c]=null);else if(Rt(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Fe(o))ci(o,r,12,[l,d]);else{const v=Ue(o),C=Rt(o);if(v||C){const L=()=>{if(e.f){const y=v?h(o)?u[o]:d[o]:m()||!e.k?o.value:d[e.k];if(a)Ae(y)&&nc(y,i);else if(Ae(y))y.includes(i)||y.push(i);else if(v)d[o]=[i],h(o)&&(u[o]=d[o]);else{const g=[i];m(o,e.k)&&(o.value=g),e.k&&(d[e.k]=g)}}else v?(d[o]=l,h(o)&&(u[o]=l)):C&&(m(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{L(),ql.delete(e)};y.id=-1,ql.set(e,y),Ct(y,s)}else Sd(e),L()}}}function Sd(e){const t=ql.get(e);t&&(t.flags|=8,ql.delete(e))}let Td=!1;const Ra=()=>{Td||(console.error("Hydration completed but contains mismatches."),Td=!0)},$g=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Ug=e=>e.namespaceURI.includes("MathML"),xl=e=>{if(e.nodeType===1){if($g(e))return"svg";if(Ug(e))return"mathml"}},Ua=e=>e.nodeType===8;function Bg(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),Vl(),b._vnode=g;return}u(b.firstChild,g,null,null,null),Vl(),b._vnode=g},u=(g,b,S,k,A,T=!1)=>{T=T||!!b.dynamicChildren;const _=Ua(g)&&g.data==="[",D=()=>v(g,b,S,k,A,_),{type:E,ref:R,shapeFlag:$,patchFlag:V}=b;let oe=g.nodeType;b.el=g,V===-2&&(T=!1,b.dynamicChildren=null);let P=null;switch(E){case qn:oe!==3?b.children===""?(o(b.el=a(""),l(g),g),P=g):P=D():(g.data!==b.children&&(Ra(),g.data=b.children),P=i(g));break;case Tt:y(g)?(P=i(g),L(b.el=g.content.firstChild,g,S)):oe!==8||_?P=D():P=i(g);break;case pa:if(_&&(g=i(g),oe=g.nodeType),oe===1||oe===3){P=g;const N=!b.children.length;for(let O=0;O<b.staticCount;O++)N&&(b.children+=P.nodeType===1?P.outerHTML:P.data),O===b.staticCount-1&&(b.anchor=P),P=i(P);return _?i(P):P}else D();break;case $t:_?P=m(g,b,S,k,A,T):P=D();break;default:if($&1)(oe!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?P=D():P=p(g,b,S,k,A,T);else if($&6){b.slotScopeIds=A;const N=l(g);if(_?P=C(g):Ua(g)&&g.data==="teleport start"?P=C(g,g.data,"teleport end"):P=i(g),t(b,N,null,S,k,xl(N),T),Tn(b)&&!b.type.__asyncResolved){let O;_?(O=vt($t),O.anchor=P?P.previousSibling:N.lastChild):O=g.nodeType===3?Cc(""):vt("div"),O.el=g,b.component.subTree=O}}else $&64?oe!==8?P=D():P=b.type.hydrate(g,b,S,k,A,T,e,h):$&128&&(P=b.type.hydrate(g,b,S,k,xl(l(g)),A,T,e,u))}return R!=null&&qa(R,null,k,b),P},p=(g,b,S,k,A,T)=>{T=T||!!b.dynamicChildren;const{type:_,props:D,patchFlag:E,shapeFlag:R,dirs:$,transition:V}=b,oe=_==="input"||_==="option";if(oe||E!==-1){$&&tn(b,null,S,"created");let P=!1;if(y(g)){P=Df(null,V)&&S&&S.vnode.props&&S.vnode.props.appear;const O=g.content.firstChild;if(P){const U=O.getAttribute("class");U&&(O.$cls=U),V.beforeEnter(O)}L(O,g,S),b.el=g=O}if(R&16&&!(D&&(D.innerHTML||D.textContent))){let O=h(g.firstChild,b,g,S,k,A,T);for(O&&!_l(g,1)&&Ra();O;){const U=O;O=O.nextSibling,r(U)}}else if(R&8){let O=b.children;O[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(O=O.slice(1));const{textContent:U}=g;U!==O&&U!==O.replace(/\r\n|\r/g,`
`)&&(_l(g,0)||Ra(),g.textContent=b.children)}if(D){if(oe||!T||E&48){const O=g.tagName.includes("-");for(const U in D)(oe&&(U.endsWith("value")||U==="indeterminate")||ya(U)&&!kn(U)||U[0]==="."||O&&!kn(U))&&n(g,U,null,D[U],void 0,S)}else if(D.onClick)n(g,"onClick",null,D.onClick,void 0,S);else if(E&4&&Sn(D.style))for(const O in D.style)D.style[O]}let N;(N=D&&D.onVnodeBeforeMount)&&fs(N,S,b),$&&tn(b,null,S,"beforeMount"),((N=D&&D.onVnodeMounted)||$||P)&&$f(()=>{N&&fs(N,S,b),P&&V.enter(g),$&&tn(b,null,S,"mounted")},k)}return g.nextSibling},h=(g,b,S,k,A,T,_)=>{_=_||!!b.dynamicChildren;const D=b.children,E=D.length;let R=!1;for(let $=0;$<E;$++){const V=_?D[$]:D[$]=ms(D[$]),oe=V.type===qn;g?(oe&&!_&&$+1<E&&ms(D[$+1]).type===qn&&(o(a(g.data.slice(V.children.length)),S,i(g)),g.data=V.children),g=u(g,V,k,A,T,_)):oe&&!V.children?o(V.el=a(""),S):(R||(R=!0,_l(S,1)||Ra()),s(null,V,S,null,k,A,xl(S),T))}return g},m=(g,b,S,k,A,T)=>{const{slotScopeIds:_}=b;_&&(A=A?A.concat(_):_);const D=l(g),E=h(i(g),b,D,S,k,A,T);return E&&Ua(E)&&E.data==="]"?i(b.anchor=E):(Ra(),o(b.anchor=c("]"),D,E),E)},v=(g,b,S,k,A,T)=>{if(_l(g.parentElement,1)||Ra(),b.el=null,T){const E=C(g);for(;;){const R=i(g);if(R&&R!==E)r(R);else break}}const _=i(g),D=l(g);return r(g),s(null,b,D,_,S,k,xl(D),A),S&&(S.vnode.el=b.el,Lr(S,b.el)),_},C=(g,b="[",S="]")=>{let k=0;for(;g;)if(g=i(g),g&&Ua(g)&&(g.data===b&&k++,g.data===S)){if(k===0)return i(g);k--}return g},L=(g,b,S)=>{const k=b.parentNode;k&&k.replaceChild(g,b);let A=S;for(;A;)A.vnode.el===b&&(A.vnode.el=A.subTree.el=g),A=A.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const Cd="data-allow-mismatch",Hg={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function _l(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Cd);)e=e.parentElement;const s=e&&e.getAttribute(Cd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Hg[t])}}const zg=xr().requestIdleCallback||(e=>setTimeout(e,1)),jg=xr().cancelIdleCallback||(e=>clearTimeout(e)),Vg=(e=1e4)=>t=>{const s=zg(t,{timeout:e});return()=>jg(s)};function qg(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Gg=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(qg(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Kg=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Wg=(e=[])=>(t,s)=>{Ue(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Zg(e,t){if(Ua(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ua(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Tn=e=>!!e.type.__asyncLoader;function Jg(e){Fe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),o)return new Promise((C,L)=>{o(v,()=>C(p()),()=>L(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return rl({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,C){let L=!1;(v.bu||(v.bu=[])).push(()=>L=!0);const y=()=>{L||C()},g=i?()=>{const b=i(y,S=>Zg(m,S));b&&(v.bum||(v.bum=[])).push(b)}:y;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=zt;if(vc(m),d)return()=>wl(d,m);const v=S=>{c=null,wa(S,m,13,!n)};if(r&&m.suspense||va)return h().then(S=>()=>wl(S,m)).catch(S=>(v(S),()=>n?vt(n,{error:S}):null));const C=f(!1),L=f(),y=f(!!a);let g,b;return mt(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),a&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!C.value&&!L.value){const S=new Error(`Async component timed out after ${l}ms.`);v(S),L.value=S}},l)),h().then(()=>{m.isUnmounted||(C.value=!0,m.parent&&ol(m.parent.vnode)&&m.parent.update())}).catch(S=>{if(m.isUnmounted){c=null;return}v(S),L.value=S}),()=>{if(C.value&&d)return wl(d,m);if(L.value&&n)return vt(n,{error:L.value});if(s&&!y.value)return wl(s,m)}}})}function wl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=vt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const ol=e=>e.type.__isKeepAlive,Yg={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=cs(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(y,g,b,S,k)=>{const A=y.component;c(y,g,b,0,r),o(A.vnode,y,g,b,A,r,S,y.slotScopeIds,k),Ct(()=>{A.isDeactivated=!1,A.a&&ja(A.a);const T=y.props&&y.props.onVnodeMounted;T&&fs(T,A.parent,y)},r)},n.deactivate=y=>{const g=y.component;Kl(g.m),Kl(g.a),c(y,p,null,1,r),Ct(()=>{g.da&&ja(g.da);const b=y.props&&y.props.onVnodeUnmounted;b&&fs(b,g.parent,y),g.isDeactivated=!0},r)};function h(y){Jr(y),d(y,s,r,!0)}function m(y){a.forEach((g,b)=>{const S=Mo(Tn(g)?g.type.__asyncResolved||{}:g.type);S&&!y(S)&&v(b)})}function v(y){const g=a.get(y);g&&(!l||!zs(g,l))?h(g):l&&Jr(l),a.delete(y),i.delete(y)}os(()=>[e.include,e.exclude],([y,g])=>{y&&m(b=>Si(y,b)),g&&m(b=>!Si(g,b))},{flush:"post",deep:!0});let C=null;const L=()=>{C!=null&&(Wl(s.subTree.type)?Ct(()=>{a.set(C,kl(s.subTree))},s.subTree.suspense):a.set(C,kl(s.subTree)))};return We(L),Rr(L),Ir(()=>{a.forEach(y=>{const{subTree:g,suspense:b}=s,S=kl(g);if(y.type===S.type&&y.key===S.key){Jr(S);const k=S.component.da;k&&Ct(k,b);return}h(y)})}),()=>{if(C=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!On(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=kl(g);if(b.type===Tt)return l=null,b;const S=b.type,k=Mo(Tn(b)?b.type.__asyncResolved||{}:S),{include:A,exclude:T,max:_}=e;if(A&&(!k||!Si(A,k))||T&&k&&Si(T,k))return b.shapeFlag&=-257,l=b,g;const D=b.key==null?S:b.key,E=a.get(D);return b.el&&(b=ln(b),g.shapeFlag&128&&(g.ssContent=b)),C=D,E?(b.el=E.el,b.component=E.component,b.transition&&In(b,b.transition),b.shapeFlag|=512,i.delete(D),i.add(D)):(i.add(D),_&&i.size>parseInt(_,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,Wl(g.type)?g:b}}},Qg=Yg;function Si(e,t){return Ae(e)?e.some(s=>Si(s,t)):Ue(e)?e.split(",").includes(t):ov(e)?(e.lastIndex=0,e.test(t)):!1}function us(e,t){df(e,"a",t)}function ts(e,t){df(e,"da",t)}function df(e,t,s=zt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Ar(t,n,s),s){let a=s.parent;for(;a&&a.parent;)ol(a.parent.vnode)&&Xg(n,t,s,a),a=a.parent}}function Xg(e,t,s,n){const a=Ar(t,e,n,!0);mt(()=>{nc(n[t],a)},s)}function Jr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function kl(e){return e.shapeFlag&128?e.ssContent:e}function Ar(e,t,s=zt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{An();const r=di(s),o=Ss(t,s,e,l);return r(),Rn(),o});return n?a.unshift(i):a.push(i),i}}const Ln=e=>(t,s=zt)=>{(!va||e==="sp")&&Ar(e,(...n)=>t(...n),s)},uf=Ln("bm"),We=Ln("m"),gc=Ln("bu"),Rr=Ln("u"),Ir=Ln("bum"),mt=Ln("um"),pf=Ln("sp"),ff=Ln("rtg"),hf=Ln("rtc");function mf(e,t=zt){Ar("ec",e,t)}const bc="components",eb="directives";function tb(e,t){return yc(bc,e,!0,t)||e}const vf=Symbol.for("v-ndc");function sb(e){return Ue(e)?yc(bc,e,!1)||e:e||vf}function nb(e){return yc(eb,e)}function yc(e,t,s=!0,n=!1){const a=jt||zt;if(a){const i=a.type;if(e===bc){const r=Mo(i,!1);if(r&&(r===t||r===ot(t)||r===_a(ot(t))))return i}const l=Ed(a[e]||i[e],t)||Ed(a.appContext[e],t);return!l&&n?i:l}}function Ed(e,t){return e&&(e[t]||e[ot(t)]||e[_a(ot(t))])}function ab(e,t,s,n){let a;const i=s&&s[n],l=Ae(e);if(l||Ue(e)){const r=l&&Sn(e);let o=!1,c=!1;r&&(o=!bs(e),c=an(e),e=kr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?Ja(qs(e[d])):qs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(et(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function ib(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ae(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function lb(e,t,s={},n,a){if(jt.ce||jt.parent&&Tn(jt.parent)&&jt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Ki(),Zl($t,null,[vt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Ki();const l=i&&xc(i(s)),r=s.key||l&&l.key,o=Zl($t,{key:(r&&!es(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function xc(e){return e.some(t=>On(t)?!(t.type===Tt||t.type===$t&&!xc(t.children)):!0)?e:null}function rb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:za(n)]=e[n];return s}const Eo=e=>e?Gf(e)?cl(e):Eo(e.parent):null,Oi=Ge(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Eo(e.parent),$root:e=>Eo(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>_c(e),$forceUpdate:e=>e.f||(e.f=()=>{pc(e.update)}),$nextTick:e=>e.n||(e.n=Et.bind(e.proxy)),$watch:e=>Ig.bind(e)}),Yr=(e,t)=>e!==Ke&&!e.__isScriptSetup&&tt(e,t),Ao={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Yr(n,t))return l[t]=1,n[t];if(a!==Ke&&tt(a,t))return l[t]=2,a[t];if(tt(i,t))return l[t]=3,i[t];if(s!==Ke&&tt(s,t))return l[t]=4,s[t];Ro&&(l[t]=0)}}const c=Oi[t];let d,u;if(c)return t==="$attrs"&&Jt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Ke&&tt(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,tt(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Yr(a,t)?(a[t]=s,!0):n!==Ke&&tt(n,t)?(n[t]=s,!0):tt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Ke&&r[0]!=="$"&&tt(e,r)||Yr(t,r)||tt(i,r)||tt(n,r)||tt(Oi,r)||tt(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:tt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},ob=Ge({},Ao,{get(e,t){if(t!==Symbol.unscopables)return Ao.get(e,t,e)},has(e,t){return t[0]!=="_"&&!mv(t)}});function cb(){return null}function db(){return null}function ub(e){}function pb(e){}function fb(){return null}function hb(){}function mb(e,t){return null}function vb(){return gf().slots}function gb(){return gf().attrs}function gf(e){const t=cs();return t.setupContext||(t.setupContext=Jf(t))}function qi(e){return Ae(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function bb(e,t){const s=qi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ae(a)||Fe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function yb(e,t){return!e||!t?e||t:Ae(e)&&Ae(t)?e.concat(t):Ge({},qi(e),qi(t))}function xb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function _b(e){const t=cs(),s=va;let n=e();Zi(),s&&Ka(!1);const a=()=>{di(t),s&&Ka(!0)},i=()=>{cs()!==t&&t.scope.off(),Zi(),s&&Ka(!1)};return ac(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Ro=!0;function wb(e){const t=_c(e),s=e.proxy,n=e.ctx;Ro=!1,t.beforeCreate&&Ad(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:C,beforeDestroy:L,beforeUnmount:y,destroyed:g,unmounted:b,render:S,renderTracked:k,renderTriggered:A,errorCaptured:T,serverPrefetch:_,expose:D,inheritAttrs:E,components:R,directives:$,filters:V}=t;if(c&&kb(c,n,null),l)for(const N in l){const O=l[N];Fe(O)&&(n[N]=O.bind(s))}if(a){const N=a.call(s,s);et(N)&&(e.data=Wn(N))}if(Ro=!0,i)for(const N in i){const O=i[N],U=Fe(O)?O.bind(s,s):Fe(O.get)?O.get.bind(s,s):Vt,K=!Fe(O)&&Fe(O.set)?O.set.bind(s):Vt,q=J({get:U,set:K});Object.defineProperty(n,N,{enumerable:!0,configurable:!0,get:()=>q.value,set:Q=>q.value=Q})}if(r)for(const N in r)bf(r[N],n,s,N);if(o){const N=Fe(o)?o.call(s):o;Reflect.ownKeys(N).forEach(O=>{Ii(O,N[O])})}d&&Ad(d,e,"c");function P(N,O){Ae(O)?O.forEach(U=>N(U.bind(s))):O&&N(O.bind(s))}if(P(uf,u),P(We,p),P(gc,h),P(Rr,m),P(us,v),P(ts,C),P(mf,T),P(hf,k),P(ff,A),P(Ir,y),P(mt,b),P(pf,_),Ae(D))if(D.length){const N=e.exposed||(e.exposed={});D.forEach(O=>{Object.defineProperty(N,O,{get:()=>s[O],set:U=>s[O]=U,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===Vt&&(e.render=S),E!=null&&(e.inheritAttrs=E),R&&(e.components=R),$&&(e.directives=$),_&&vc(e)}function kb(e,t,s=Vt){Ae(e)&&(e=Io(e));for(const n in e){const a=e[n];let i;et(a)?"default"in a?i=Ms(a.from||n,a.default,!0):i=Ms(a.from||n):i=Ms(a),Rt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Ad(e,t,s){Ss(Ae(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function bf(e,t,s,n){let a=n.includes(".")?sf(s,n):()=>s[n];if(Ue(e)){const i=t[e];Fe(i)&&os(a,i)}else if(Fe(e))os(a,e.bind(s));else if(et(e))if(Ae(e))e.forEach(i=>bf(i,t,s,n));else{const i=Fe(e.handler)?e.handler.bind(s):t[e.handler];Fe(i)&&os(a,i,e)}}function _c(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Gl(o,c,l,!0)),Gl(o,t,l)),et(t)&&i.set(t,o),o}function Gl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Gl(e,i,s,!0),a&&a.forEach(l=>Gl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=Sb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const Sb={data:Rd,props:Id,emits:Id,methods:Ti,computed:Ti,beforeCreate:ns,created:ns,beforeMount:ns,mounted:ns,beforeUpdate:ns,updated:ns,beforeDestroy:ns,beforeUnmount:ns,destroyed:ns,unmounted:ns,activated:ns,deactivated:ns,errorCaptured:ns,serverPrefetch:ns,components:Ti,directives:Ti,watch:Cb,provide:Rd,inject:Tb};function Rd(e,t){return t?e?function(){return Ge(Fe(e)?e.call(this,this):e,Fe(t)?t.call(this,this):t)}:t:e}function Tb(e,t){return Ti(Io(e),Io(t))}function Io(e){if(Ae(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function ns(e,t){return e?[...new Set([].concat(e,t))]:t}function Ti(e,t){return e?Ge(Object.create(null),e,t):t}function Id(e,t){return e?Ae(e)&&Ae(t)?[...new Set([...e,...t])]:Ge(Object.create(null),qi(e),qi(t??{})):t}function Cb(e,t){if(!e)return t;if(!t)return e;const s=Ge(Object.create(null),e);for(const n in t)s[n]=ns(e[n],t[n]);return s}function yf(){return{app:null,config:{isNativeTag:$a,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Eb=0;function Ab(e,t){return function(n,a=null){Fe(n)||(n=Ge({},n)),a!=null&&!et(a)&&(a=null);const i=yf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Eb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Qf,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Fe(d.install)?(l.add(d),d.install(c,...u)):Fe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const h=c._ceVNode||vt(n,a);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),o=!0,c._container=d,d.__vue_app__=c,cl(h.component)}},onUnmount(d){r.push(d)},unmount(){o&&(Ss(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=ua;ua=c;try{return d()}finally{ua=u}}};return c}}let ua=null;function Rb(e,t,s=Ke){const n=cs(),a=ot(t),i=vs(t),l=xf(e,a),r=qp((o,c)=>{let d,u=Ke,p;return tf(()=>{const h=e[a];Ft(d,h)&&(d=h,c())}),{get(){return o(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!Ft(m,d)&&!(u!==Ke&&Ft(h,u)))return;const v=n.vnode.props,C=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));C||(d=h,c()),n.emit(`update:${t}`,m),Ft(h,u)&&(Ft(h,m)&&!Ft(m,p)||C&&u!==Ke&&!Ft(m,d))&&c(),u=h,p=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Ke:r,done:!1}:{done:!0}}}},r}const xf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${ot(t)}Modifiers`]||e[`${vs(t)}Modifiers`];function Ib(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ke;let a=s;const i=t.startsWith("update:"),l=i&&xf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Ue(d)?d.trim():d)),l.number&&(a=s.map(yr)));let r,o=n[r=za(t)]||n[r=za(ot(t))];!o&&i&&(o=n[r=za(vs(t))]),o&&Ss(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,Ss(c,e,6,a)}}const Ob=new WeakMap;function _f(e,t,s=!1){const n=s?Ob:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Fe(e)){const o=c=>{const d=_f(c,t,!0);d&&(r=!0,Ge(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(et(e)&&n.set(e,null),null):(Ae(i)?i.forEach(o=>l[o]=null):Ge(l,i),et(e)&&n.set(e,l),l)}function Or(e,t){return!e||!ya(t)?!1:(t=t.slice(2).replace(/Once$/,""),tt(e,t[0].toLowerCase()+t.slice(1))||tt(e,vs(t))||tt(e,t))}function Ll(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,C=Vi(e);let L,y;try{if(s.shapeFlag&4){const b=a||n,S=b;L=ms(c.call(S,b,d,u,h,p,m)),y=r}else{const b=t;L=ms(b.length>1?b(u,{attrs:r,slots:l,emit:o}):b(u,null)),y=t.props?r:Nb(r)}}catch(b){Li.length=0,wa(b,e,1),L=vt(Tt)}let g=L;if(y&&v!==!1){const b=Object.keys(y),{shapeFlag:S}=g;b.length&&S&7&&(i&&b.some(mr)&&(y=Db(y,i)),g=ln(g,y,!1,!0))}return s.dirs&&(g=ln(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&In(g,s.transition),L=g,Vi(C),L}function Lb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(On(a)){if(a.type!==Tt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Nb=e=>{let t;for(const s in e)(s==="class"||s==="style"||ya(s))&&((t||(t={}))[s]=e[s]);return t},Db=(e,t)=>{const s={};for(const n in e)(!mr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Mb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?Od(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(wf(l,n,p)&&!Or(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?Od(n,l,c):!0:!!l;return!1}function Od(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(wf(t,e,i)&&!Or(s,i))return!0}return!1}function wf(e,t,s){const n=e[s],a=t[s];return s==="style"&&et(n)&&et(a)?!En(n,a):n!==a}function Lr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const kf={},Sf=()=>Object.create(kf),Tf=e=>Object.getPrototypeOf(e)===kf;function Pb(e,t,s,n=!1){const a={},i=Sf();e.propsDefaults=Object.create(null),Cf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:cc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Fb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Je(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Or(e.emitsOptions,p))continue;const h=t[p];if(o)if(tt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=ot(p);a[m]=Oo(o,r,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{Cf(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!tt(t,u)&&((d=vs(u))===u||!tt(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Oo(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!tt(t,u))&&(delete i[u],c=!0)}c&&bn(e.attrs,"set","")}function Cf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(kn(o))continue;const c=t[o];let d;a&&tt(a,d=ot(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:Or(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Je(s),c=r||Ke;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Oo(a,o,u,c[u],e,!tt(c,u))}}return l}function Oo(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=tt(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Fe(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=di(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===vs(s))&&(n=!0))}return n}const $b=new WeakMap;function Ef(e,t,s=!1){const n=s?$b:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Fe(e)){const d=u=>{o=!0;const[p,h]=Ef(u,t,!0);Ge(l,p),h&&r.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return et(e)&&n.set(e,Ba),Ba;if(Ae(i))for(let d=0;d<i.length;d++){const u=ot(i[d]);Ld(u)&&(l[u]=Ke)}else if(i)for(const d in i){const u=ot(d);if(Ld(u)){const p=i[d],h=l[u]=Ae(p)||Fe(p)?{type:p}:Ge({},p),m=h.type;let v=!1,C=!0;if(Ae(m))for(let L=0;L<m.length;++L){const y=m[L],g=Fe(y)&&y.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(C=!1)}else v=Fe(m)&&m.name==="Boolean";h[0]=v,h[1]=C,(v||tt(h,"default"))&&r.push(u)}}const c=[l,r];return et(e)&&n.set(e,c),c}function Ld(e){return e[0]!=="$"&&!kn(e)}const wc=e=>e==="_"||e==="_ctx"||e==="$stable",kc=e=>Ae(e)?e.map(ms):[ms(e)],Ub=(e,t,s)=>{if(t._n)return t;const n=fc((...a)=>kc(t(...a)),s);return n._c=!1,n},Af=(e,t,s)=>{const n=e._ctx;for(const a in e){if(wc(a))continue;const i=e[a];if(Fe(i))t[a]=Ub(a,i,n);else if(i!=null){const l=kc(i);t[a]=()=>l}}},Rf=(e,t)=>{const s=kc(t);e.slots.default=()=>s},If=(e,t,s)=>{for(const n in t)(s||!wc(n))&&(e[n]=t[n])},Bb=(e,t,s)=>{const n=e.slots=Sf();if(e.vnode.shapeFlag&32){const a=t._;a?(If(n,t,s),s&&_p(n,"_",a,!0)):Af(t,n)}else t&&Rf(e,t)},Hb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ke;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:If(a,t,s):(i=!t.$stable,Af(t,a)),l=t}else t&&(Rf(e,t),l={default:1});if(i)for(const r in a)!wc(r)&&l[r]==null&&delete a[r]},Ct=$f;function Of(e){return Nf(e)}function Lf(e){return Nf(e,Bg)}function Nf(e,t){const s=xr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Vt,insertStaticContent:m}=e,v=(x,M,B,ae=null,te=null,ne=null,he=void 0,de=null,pe=!!M.dynamicChildren)=>{if(x===M)return;x&&!zs(x,M)&&(ae=Y(x),Q(x,te,ne,!0),x=null),M.patchFlag===-2&&(pe=!1,M.dynamicChildren=null);const{type:le,ref:ke,shapeFlag:ye}=M;switch(le){case qn:C(x,M,B,ae);break;case Tt:L(x,M,B,ae);break;case pa:x==null&&y(M,B,ae,he);break;case $t:R(x,M,B,ae,te,ne,he,de,pe);break;default:ye&1?S(x,M,B,ae,te,ne,he,de,pe):ye&6?$(x,M,B,ae,te,ne,he,de,pe):(ye&64||ye&128)&&le.process(x,M,B,ae,te,ne,he,de,pe,re)}ke!=null&&te?qa(ke,x&&x.ref,ne,M||x,!M):ke==null&&x&&x.ref!=null&&qa(x.ref,null,ne,x,!0)},C=(x,M,B,ae)=>{if(x==null)n(M.el=r(M.children),B,ae);else{const te=M.el=x.el;M.children!==x.children&&c(te,M.children)}},L=(x,M,B,ae)=>{x==null?n(M.el=o(M.children||""),B,ae):M.el=x.el},y=(x,M,B,ae)=>{[x.el,x.anchor]=m(x.children,M,B,ae,x.el,x.anchor)},g=({el:x,anchor:M},B,ae)=>{let te;for(;x&&x!==M;)te=p(x),n(x,B,ae),x=te;n(M,B,ae)},b=({el:x,anchor:M})=>{let B;for(;x&&x!==M;)B=p(x),a(x),x=B;a(M)},S=(x,M,B,ae,te,ne,he,de,pe)=>{if(M.type==="svg"?he="svg":M.type==="math"&&(he="mathml"),x==null)k(M,B,ae,te,ne,he,de,pe);else{const le=x.el&&x.el._isVueCE?x.el:null;try{le&&le._beginPatch(),_(x,M,te,ne,he,de,pe)}finally{le&&le._endPatch()}}},k=(x,M,B,ae,te,ne,he,de)=>{let pe,le;const{props:ke,shapeFlag:ye,transition:_e,dirs:ce}=x;if(pe=x.el=l(x.type,ne,ke&&ke.is,ke),ye&8?d(pe,x.children):ye&16&&T(x.children,pe,null,ae,te,Qr(x,ne),he,de),ce&&tn(x,null,ae,"created"),A(pe,x,x.scopeId,he,ae),ke){for(const ve in ke)ve!=="value"&&!kn(ve)&&i(pe,ve,null,ke[ve],ne,ae);"value"in ke&&i(pe,"value",null,ke.value,ne),(le=ke.onVnodeBeforeMount)&&fs(le,ae,x)}ce&&tn(x,null,ae,"beforeMount");const z=Df(te,_e);z&&_e.beforeEnter(pe),n(pe,M,B),((le=ke&&ke.onVnodeMounted)||z||ce)&&Ct(()=>{try{le&&fs(le,ae,x),z&&_e.enter(pe),ce&&tn(x,null,ae,"mounted")}finally{}},te)},A=(x,M,B,ae,te)=>{if(B&&h(x,B),ae)for(let ne=0;ne<ae.length;ne++)h(x,ae[ne]);if(te){let ne=te.subTree;if(M===ne||Wl(ne.type)&&(ne.ssContent===M||ne.ssFallback===M)){const he=te.vnode;A(x,he,he.scopeId,he.slotScopeIds,te.parent)}}},T=(x,M,B,ae,te,ne,he,de,pe=0)=>{for(let le=pe;le<x.length;le++){const ke=x[le]=de?vn(x[le]):ms(x[le]);v(null,ke,M,B,ae,te,ne,he,de)}},_=(x,M,B,ae,te,ne,he)=>{const de=M.el=x.el;let{patchFlag:pe,dynamicChildren:le,dirs:ke}=M;pe|=x.patchFlag&16;const ye=x.props||Ke,_e=M.props||Ke;let ce;if(B&&ta(B,!1),(ce=_e.onVnodeBeforeUpdate)&&fs(ce,B,M,x),ke&&tn(M,x,B,"beforeUpdate"),B&&ta(B,!0),(ye.innerHTML&&_e.innerHTML==null||ye.textContent&&_e.textContent==null)&&d(de,""),le?D(x.dynamicChildren,le,de,B,ae,Qr(M,te),ne):he||O(x,M,de,null,B,ae,Qr(M,te),ne,!1),pe>0){if(pe&16)E(de,ye,_e,B,te);else if(pe&2&&ye.class!==_e.class&&i(de,"class",null,_e.class,te),pe&4&&i(de,"style",ye.style,_e.style,te),pe&8){const z=M.dynamicProps;for(let ve=0;ve<z.length;ve++){const Te=z[ve],Oe=ye[Te],De=_e[Te];(De!==Oe||Te==="value")&&i(de,Te,Oe,De,te,B)}}pe&1&&x.children!==M.children&&d(de,M.children)}else!he&&le==null&&E(de,ye,_e,B,te);((ce=_e.onVnodeUpdated)||ke)&&Ct(()=>{ce&&fs(ce,B,M,x),ke&&tn(M,x,B,"updated")},ae)},D=(x,M,B,ae,te,ne,he)=>{for(let de=0;de<M.length;de++){const pe=x[de],le=M[de],ke=pe.el&&(pe.type===$t||!zs(pe,le)||pe.shapeFlag&198)?u(pe.el):B;v(pe,le,ke,null,ae,te,ne,he,!0)}},E=(x,M,B,ae,te)=>{if(M!==B){if(M!==Ke)for(const ne in M)!kn(ne)&&!(ne in B)&&i(x,ne,M[ne],null,te,ae);for(const ne in B){if(kn(ne))continue;const he=B[ne],de=M[ne];he!==de&&ne!=="value"&&i(x,ne,de,he,te,ae)}"value"in B&&i(x,"value",M.value,B.value,te)}},R=(x,M,B,ae,te,ne,he,de,pe)=>{const le=M.el=x?x.el:r(""),ke=M.anchor=x?x.anchor:r("");let{patchFlag:ye,dynamicChildren:_e,slotScopeIds:ce}=M;ce&&(de=de?de.concat(ce):ce),x==null?(n(le,B,ae),n(ke,B,ae),T(M.children||[],B,ke,te,ne,he,de,pe)):ye>0&&ye&64&&_e&&x.dynamicChildren&&x.dynamicChildren.length===_e.length?(D(x.dynamicChildren,_e,B,te,ne,he,de),(M.key!=null||te&&M===te.subTree)&&Sc(x,M,!0)):O(x,M,B,ke,te,ne,he,de,pe)},$=(x,M,B,ae,te,ne,he,de,pe)=>{M.slotScopeIds=de,x==null?M.shapeFlag&512?te.ctx.activate(M,B,ae,he,pe):V(M,B,ae,te,ne,he,pe):oe(x,M,pe)},V=(x,M,B,ae,te,ne,he)=>{const de=x.component=qf(x,ae,te);if(ol(x)&&(de.ctx.renderer=re),Kf(de,!1,he),de.asyncDep){if(te&&te.registerDep(de,P,he),!x.el){const pe=de.subTree=vt(Tt);L(null,pe,M,B),x.placeholder=pe.el}}else P(de,x,M,B,te,ne,he)},oe=(x,M,B)=>{const ae=M.component=x.component;if(Mb(x,M,B))if(ae.asyncDep&&!ae.asyncResolved){N(ae,M,B);return}else ae.next=M,ae.update();else M.el=x.el,ae.vnode=M},P=(x,M,B,ae,te,ne,he)=>{const de=()=>{if(x.isMounted){let{next:ye,bu:_e,u:ce,parent:z,vnode:ve}=x;{const rt=Mf(x);if(rt){ye&&(ye.el=ve.el,N(x,ye,he)),rt.asyncDep.then(()=>{Ct(()=>{x.isUnmounted||le()},te)});return}}let Te=ye,Oe;ta(x,!1),ye?(ye.el=ve.el,N(x,ye,he)):ye=ve,_e&&ja(_e),(Oe=ye.props&&ye.props.onVnodeBeforeUpdate)&&fs(Oe,z,ye,ve),ta(x,!0);const De=Ll(x),ct=x.subTree;x.subTree=De,v(ct,De,u(ct.el),Y(ct),x,te,ne),ye.el=De.el,Te===null&&Lr(x,De.el),ce&&Ct(ce,te),(Oe=ye.props&&ye.props.onVnodeUpdated)&&Ct(()=>fs(Oe,z,ye,ve),te)}else{let ye;const{el:_e,props:ce}=M,{bm:z,m:ve,parent:Te,root:Oe,type:De}=x,ct=Tn(M);if(ta(x,!1),z&&ja(z),!ct&&(ye=ce&&ce.onVnodeBeforeMount)&&fs(ye,Te,M),ta(x,!0),_e&&Le){const rt=()=>{x.subTree=Ll(x),Le(_e,x.subTree,x,te,null)};ct&&De.__asyncHydrate?De.__asyncHydrate(_e,x,rt):rt()}else{Oe.ce&&Oe.ce._hasShadowRoot()&&Oe.ce._injectChildStyle(De,x.parent?x.parent.type:void 0);const rt=x.subTree=Ll(x);v(null,rt,B,ae,x,te,ne),M.el=rt.el}if(ve&&Ct(ve,te),!ct&&(ye=ce&&ce.onVnodeMounted)){const rt=M;Ct(()=>fs(ye,Te,rt),te)}(M.shapeFlag&256||Te&&Tn(Te.vnode)&&Te.vnode.shapeFlag&256)&&x.a&&Ct(x.a,te),x.isMounted=!0,M=B=ae=null}};x.scope.on();const pe=x.effect=new Ui(de);x.scope.off();const le=x.update=pe.run.bind(pe),ke=x.job=pe.runIfDirty.bind(pe);ke.i=x,ke.id=x.uid,pe.scheduler=()=>pc(ke),ta(x,!0),le()},N=(x,M,B)=>{M.component=x;const ae=x.vnode.props;x.vnode=M,x.next=null,Fb(x,M.props,ae,B),Hb(x,M.children,B),An(),yd(x),Rn()},O=(x,M,B,ae,te,ne,he,de,pe=!1)=>{const le=x&&x.children,ke=x?x.shapeFlag:0,ye=M.children,{patchFlag:_e,shapeFlag:ce}=M;if(_e>0){if(_e&128){K(le,ye,B,ae,te,ne,he,de,pe);return}else if(_e&256){U(le,ye,B,ae,te,ne,he,de,pe);return}}ce&8?(ke&16&&Pe(le,te,ne),ye!==le&&d(B,ye)):ke&16?ce&16?K(le,ye,B,ae,te,ne,he,de,pe):Pe(le,te,ne,!0):(ke&8&&d(B,""),ce&16&&T(ye,B,ae,te,ne,he,de,pe))},U=(x,M,B,ae,te,ne,he,de,pe)=>{x=x||Ba,M=M||Ba;const le=x.length,ke=M.length,ye=Math.min(le,ke);let _e;for(_e=0;_e<ye;_e++){const ce=M[_e]=pe?vn(M[_e]):ms(M[_e]);v(x[_e],ce,B,null,te,ne,he,de,pe)}le>ke?Pe(x,te,ne,!0,!1,ye):T(M,B,ae,te,ne,he,de,pe,ye)},K=(x,M,B,ae,te,ne,he,de,pe)=>{let le=0;const ke=M.length;let ye=x.length-1,_e=ke-1;for(;le<=ye&&le<=_e;){const ce=x[le],z=M[le]=pe?vn(M[le]):ms(M[le]);if(zs(ce,z))v(ce,z,B,null,te,ne,he,de,pe);else break;le++}for(;le<=ye&&le<=_e;){const ce=x[ye],z=M[_e]=pe?vn(M[_e]):ms(M[_e]);if(zs(ce,z))v(ce,z,B,null,te,ne,he,de,pe);else break;ye--,_e--}if(le>ye){if(le<=_e){const ce=_e+1,z=ce<ke?M[ce].el:ae;for(;le<=_e;)v(null,M[le]=pe?vn(M[le]):ms(M[le]),B,z,te,ne,he,de,pe),le++}}else if(le>_e)for(;le<=ye;)Q(x[le],te,ne,!0),le++;else{const ce=le,z=le,ve=new Map;for(le=z;le<=_e;le++){const we=M[le]=pe?vn(M[le]):ms(M[le]);we.key!=null&&ve.set(we.key,le)}let Te,Oe=0;const De=_e-z+1;let ct=!1,rt=0;const Pt=new Array(De);for(le=0;le<De;le++)Pt[le]=0;for(le=ce;le<=ye;le++){const we=x[le];if(Oe>=De){Q(we,te,ne,!0);continue}let Ie;if(we.key!=null)Ie=ve.get(we.key);else for(Te=z;Te<=_e;Te++)if(Pt[Te-z]===0&&zs(we,M[Te])){Ie=Te;break}Ie===void 0?Q(we,te,ne,!0):(Pt[Ie-z]=le+1,Ie>=rt?rt=Ie:ct=!0,v(we,M[Ie],B,null,te,ne,he,de,pe),Oe++)}const se=ct?zb(Pt):Ba;for(Te=se.length-1,le=De-1;le>=0;le--){const we=z+le,Ie=M[we],ze=M[we+1],it=we+1<ke?ze.el||Pf(ze):ae;Pt[le]===0?v(null,Ie,B,it,te,ne,he,de,pe):ct&&(Te<0||le!==se[Te]?q(Ie,B,it,2):Te--)}}},q=(x,M,B,ae,te=null)=>{const{el:ne,type:he,transition:de,children:pe,shapeFlag:le}=x;if(le&6){q(x.component.subTree,M,B,ae);return}if(le&128){x.suspense.move(M,B,ae);return}if(le&64){he.move(x,M,B,re);return}if(he===$t){n(ne,M,B);for(let ye=0;ye<pe.length;ye++)q(pe[ye],M,B,ae);n(x.anchor,M,B);return}if(he===pa){g(x,M,B);return}if(ae!==2&&le&1&&de)if(ae===0)de.persisted&&!ne[Os]?n(ne,M,B):(de.beforeEnter(ne),n(ne,M,B),Ct(()=>de.enter(ne),te));else{const{leave:ye,delayLeave:_e,afterLeave:ce}=de,z=()=>{x.ctx.isUnmounted?a(ne):n(ne,M,B)},ve=()=>{const Te=ne._isLeaving||!!ne[Os];ne._isLeaving&&ne[Os](!0),de.persisted&&!Te?z():ye(ne,()=>{z(),ce&&ce()})};_e?_e(ne,z,ve):ve()}else n(ne,M,B)},Q=(x,M,B,ae=!1,te=!1)=>{const{type:ne,props:he,ref:de,children:pe,dynamicChildren:le,shapeFlag:ke,patchFlag:ye,dirs:_e,cacheIndex:ce,memo:z}=x;if(ye===-2&&(te=!1),de!=null&&(An(),qa(de,null,B,x,!0),Rn()),ce!=null&&(M.renderCache[ce]=void 0),ke&256){M.ctx.deactivate(x);return}const ve=ke&1&&_e,Te=!Tn(x);let Oe;if(Te&&(Oe=he&&he.onVnodeBeforeUnmount)&&fs(Oe,M,x),ke&6)fe(x.component,B,ae);else{if(ke&128){x.suspense.unmount(B,ae);return}ve&&tn(x,null,M,"beforeUnmount"),ke&64?x.type.remove(x,M,B,re,ae):le&&!le.hasOnce&&(ne!==$t||ye>0&&ye&64)?Pe(le,M,B,!1,!0):(ne===$t&&ye&384||!te&&ke&16)&&Pe(pe,M,B),ae&&ie(x)}const De=z!=null&&ce==null;(Te&&(Oe=he&&he.onVnodeUnmounted)||ve||De)&&Ct(()=>{Oe&&fs(Oe,M,x),ve&&tn(x,null,M,"unmounted"),De&&(x.el=null)},B)},ie=x=>{const{type:M,el:B,anchor:ae,transition:te}=x;if(M===$t){X(B,ae);return}if(M===pa){b(x);return}const ne=()=>{a(B),te&&!te.persisted&&te.afterLeave&&te.afterLeave()};if(x.shapeFlag&1&&te&&!te.persisted){const{leave:he,delayLeave:de}=te,pe=()=>he(B,ne);de?de(x.el,ne,pe):pe()}else ne()},X=(x,M)=>{let B;for(;x!==M;)B=p(x),a(x),x=B;a(M)},fe=(x,M,B)=>{const{bum:ae,scope:te,job:ne,subTree:he,um:de,m:pe,a:le}=x;Kl(pe),Kl(le),ae&&ja(ae),te.stop(),ne&&(ne.flags|=8,Q(he,x,M,B)),de&&Ct(de,M),Ct(()=>{x.isUnmounted=!0},M)},Pe=(x,M,B,ae=!1,te=!1,ne=0)=>{for(let he=ne;he<x.length;he++)Q(x[he],M,B,ae,te)},Y=x=>{if(x.shapeFlag&6)return Y(x.component.subTree);if(x.shapeFlag&128)return x.suspense.next();const M=p(x.anchor||x.el),B=M&&M[nf];return B?p(B):M};let be=!1;const H=(x,M,B)=>{let ae;x==null?M._vnode&&(Q(M._vnode,null,null,!0),ae=M._vnode.component):v(M._vnode||null,x,M,null,null,null,B),M._vnode=x,be||(be=!0,yd(ae),Vl(),be=!1)},re={p:v,um:Q,m:q,r:ie,mt:V,mc:T,pc:O,pbc:D,n:Y,o:e};let ue,Le;return t&&([ue,Le]=t(re)),{render:H,hydrate:ue,createApp:Ab(H,ue)}}function Qr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function ta({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Df(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Sc(e,t,s=!1){const n=e.children,a=t.children;if(Ae(n)&&Ae(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=vn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Sc(l,r)),r.type===qn&&(r.patchFlag===-1&&(r=a[i]=vn(r)),r.el=l.el),r.type===Tt&&!r.el&&(r.el=l.el)}}function zb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Mf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Mf(t)}function Kl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Pf(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Pf(t.subTree):null}const Wl=e=>e.__isSuspense;let Lo=0;const jb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)qb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Gb(e,t,s,n,a,l,r,o,c)}},hydrate:Kb,normalize:Wb},Vb=jb;function Gi(e,t){const s=e.props&&e.props[t];Fe(s)&&s()}function qb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=Ff(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Gi(e,"onPending"),Gi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Ga(p,e.ssFallback)):p.resolve(!1,!0)}function Gb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:C,isHydrating:L}=u;if(v)u.pendingBranch=p,zs(v,p)?(o(v,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():C&&(L||(o(m,h,s,n,a,null,i,l,r),Ga(u,h)))):(u.pendingId=Lo++,L?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),C?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(m,h,s,n,a,null,i,l,r),Ga(u,h))):m&&zs(m,p)?(o(m,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(m&&zs(m,p))o(m,p,s,n,a,u,i,l,r),Ga(u,p);else if(Gi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Lo++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},y):y===0&&u.fallback(h)}}function Ff(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:C}}=c;let L;const y=Zb(e);y&&t&&t.pendingBranch&&(L=t.pendingId,t.deps++);const g=e.props?Ul(e.props.timeout):void 0,b=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Lo++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(k=!1,A=!1){const{vnode:T,activeBranch:_,pendingBranch:D,pendingId:E,effects:R,parentComponent:$,container:V,isInFallback:oe}=S;let P=!1;if(S.isHydrating)S.isHydrating=!1;else if(!k){P=_&&D.transition&&D.transition.mode==="out-in";let U=!1;P&&(_.transition.afterLeave=()=>{E===S.pendingId&&(p(D,V,i===b&&!U?m(_):i,0),zi(R),oe&&T.ssFallback&&(T.ssFallback.el=null))}),_&&!S.isFallbackMountPending&&(v(_.el)===V&&(i=m(_),U=!0),h(_,$,S,!0),!P&&oe&&T.ssFallback&&Ct(()=>T.ssFallback.el=null,S)),P||p(D,V,i,0)}S.isFallbackMountPending=!1,Ga(S,D),S.pendingBranch=null,S.isInFallback=!1;let N=S.parent,O=!1;for(;N;){if(N.pendingBranch){N.effects.push(...R),O=!0;break}N=N.parent}!O&&!P&&zi(R),S.effects=[],y&&t&&t.pendingBranch&&L===t.pendingId&&(t.deps--,t.deps===0&&!A&&t.resolve()),Gi(T,"onResolve")},fallback(k){if(!S.pendingBranch)return;const{vnode:A,activeBranch:T,parentComponent:_,container:D,namespace:E}=S;Gi(A,"onFallback");const R=m(T),$=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,k,D,R,_,null,E,r,o),Ga(S,k))},V=k.transition&&k.transition.mode==="out-in";V&&(S.isFallbackMountPending=!0,T.transition.afterLeave=$),S.isInFallback=!0,h(T,_,null,!0),V||$()},move(k,A,T){S.activeBranch&&p(S.activeBranch,k,A,T),S.container=k},next(){return S.activeBranch&&m(S.activeBranch)},registerDep(k,A,T){const _=!!S.pendingBranch;_&&S.deps++;const D=k.vnode.el;k.asyncDep.catch(E=>{wa(E,k,0)}).then(E=>{if(k.isUnmounted||S.isUnmounted||S.pendingId!==k.suspenseId)return;Zi(),k.asyncResolved=!0;const{vnode:R}=k;No(k,E,!1),D&&(R.el=D);const $=!D&&k.subTree.el;A(k,R,v(D||k.subTree.el),D?null:m(k.subTree),S,l,T),$&&(R.placeholder=null,C($)),Lr(k,R.el),_&&--S.deps===0&&S.resolve()})},unmount(k,A){S.isUnmounted=!0,S.activeBranch&&h(S.activeBranch,s,k,A),S.pendingBranch&&h(S.pendingBranch,s,k,A)}};return S}function Kb(e,t,s,n,a,i,l,r,o){const c=t.suspense=Ff(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Wb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Nd(n?s.default:s),e.ssFallback=n?Nd(s.fallback):vt(Tt)}function Nd(e){let t;if(Fe(e)){const s=ma&&e._c;s&&(e._d=!1,Ki()),e=e(),s&&(e._d=!0,t=Yt,Uf())}return Ae(e)&&(e=Lb(e)),e=ms(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function $f(e,t){t&&t.pendingBranch?Ae(e)?t.effects.push(...e):t.effects.push(e):zi(e)}function Ga(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Lr(n,a))}function Zb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const $t=Symbol.for("v-fgt"),qn=Symbol.for("v-txt"),Tt=Symbol.for("v-cmt"),pa=Symbol.for("v-stc"),Li=[];let Yt=null;function Ki(e=!1){Li.push(Yt=e?null:[])}function Uf(){Li.pop(),Yt=Li[Li.length-1]||null}let ma=1;function Wi(e,t=!1){ma+=e,e<0&&Yt&&t&&(Yt.hasOnce=!0)}function Bf(e){return e.dynamicChildren=ma>0?Yt||Ba:null,Uf(),ma>0&&Yt&&Yt.push(e),e}function Jb(e,t,s,n,a,i){return Bf(Tc(e,t,s,n,a,i,!0))}function Zl(e,t,s,n,a){return Bf(vt(e,t,s,n,a,!0))}function On(e){return e?e.__v_isVNode===!0:!1}function zs(e,t){return e.type===t.type&&e.key===t.key}function Yb(e){}const Hf=({key:e})=>e??null,Nl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ue(e)||Rt(e)||Fe(e)?{i:jt,r:e,k:t,f:!!s}:e:null);function Tc(e,t=null,s=null,n=0,a=null,i=e===$t?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Hf(t),ref:t&&Nl(t),scopeId:Cr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:jt};return r?(Ec(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Ue(s)?8:16),ma>0&&!l&&Yt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Yt.push(o),o}const vt=Qb;function Qb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===vf)&&(e=Tt),On(e)){const r=ln(e,t,!0);return s&&Ec(r,s),ma>0&&!i&&Yt&&(r.shapeFlag&6?Yt[Yt.indexOf(e)]=r:Yt.push(r)),r.patchFlag=-2,r}if(iy(e)&&(e=e.__vccOpts),t){t=zf(t);let{class:r,style:o}=t;r&&!Ue(r)&&(t.class=al(r)),et(o)&&(il(o)&&!Ae(o)&&(o=Ge({},o)),t.style=nl(o))}const l=Ue(e)?1:Wl(e)?128:af(e)?64:et(e)?4:Fe(e)?2:0;return Tc(e,t,s,n,a,l,i,!0)}function zf(e){return e?il(e)||Tf(e)?Ge({},e):e:null}function ln(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Vf(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Hf(c),ref:t&&t.ref?s&&i?Ae(i)?i.concat(Nl(t)):[i,Nl(t)]:Nl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==$t?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&ln(e.ssContent),ssFallback:e.ssFallback&&ln(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&In(d,o.clone(d)),d}function Cc(e=" ",t=0){return vt(qn,null,e,t)}function Xb(e,t){const s=vt(pa,null,e);return s.staticCount=t,s}function jf(e="",t=!1){return t?(Ki(),Zl(Tt,null,e)):vt(Tt,null,e)}function ms(e){return e==null||typeof e=="boolean"?vt(Tt):Ae(e)?vt($t,null,e.slice()):On(e)?vn(e):vt(qn,null,String(e))}function vn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:ln(e)}function Ec(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ae(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Ec(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Tf(t)?t._ctx=jt:a===3&&jt&&(jt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Fe(t)?(t={default:t,_ctx:jt},s=32):(t=String(t),n&64?(s=16,t=[Cc(t)]):s=8);e.children=t,e.shapeFlag|=s}function Vf(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=al([t.class,n.class]));else if(a==="style")t.style=nl([t.style,n.style]);else if(ya(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ae(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!mr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function fs(e,t,s,n=null){Ss(e,t,7,[s,n])}const ey=yf();let ty=0;function qf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||ey,i={uid:ty++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new ic(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Ef(n,a),emitsOptions:_f(n,a),emit:null,emitted:null,propsDefaults:Ke,inheritAttrs:n.inheritAttrs,ctx:Ke,data:Ke,props:Ke,attrs:Ke,slots:Ke,refs:Ke,setupState:Ke,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Ib.bind(null,i),e.ce&&e.ce(i),i}let zt=null;const cs=()=>zt||jt;let Jl,Ka;{const e=xr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Jl=t("__VUE_INSTANCE_SETTERS__",s=>zt=s),Ka=t("__VUE_SSR_SETTERS__",s=>va=s)}const di=e=>{const t=zt;return Jl(e),e.scope.on(),()=>{e.scope.off(),Jl(t)}},Zi=()=>{zt&&zt.scope.off(),Jl(null)};function Gf(e){return e.vnode.shapeFlag&4}let va=!1;function Kf(e,t=!1,s=!1){t&&Ka(t);const{props:n,children:a}=e.vnode,i=Gf(e);Pb(e,n,i,t),Bb(e,a,s||t);const l=i?sy(e,t):void 0;return t&&Ka(!1),l}function sy(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Ao);const{setup:n}=s;if(n){An();const a=e.setupContext=n.length>1?Jf(e):null,i=di(e),l=ci(n,e,0,[e.props,a]),r=ac(l);if(Rn(),i(),(r||e.sp)&&!Tn(e)&&vc(e),r){if(l.then(Zi,Zi),t)return l.then(o=>{No(e,o,t)}).catch(o=>{wa(o,e,0)});e.asyncDep=l}else No(e,l,t)}else Zf(e,t)}function No(e,t,s){Fe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:et(t)&&(e.setupState=uc(t)),Zf(e,s)}let Yl,Do;function Wf(e){Yl=e,Do=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,ob))}}const ny=()=>!Yl;function Zf(e,t,s){const n=e.type;if(!e.render){if(!t&&Yl&&!n.render){const a=n.template||_c(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Ge(Ge({isCustomElement:i,delimiters:r},l),o);n.render=Yl(a,c)}}e.render=n.render||Vt,Do&&Do(e)}{const a=di(e);An();try{wb(e)}finally{Rn(),a()}}}const ay={get(e,t){return Jt(e,"get",""),e[t]}};function Jf(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,ay),slots:e.slots,emit:e.emit,expose:t}}function cl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(uc(jp(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Oi)return Oi[s](e)},has(t,s){return s in t||s in Oi}})):e.proxy}function Mo(e,t=!0){return Fe(e)?e.displayName||e.name:e.name||t&&e.__name}function iy(e){return Fe(e)&&"__vccOpts"in e}const J=(e,t)=>ug(e,t,va);function Qa(e,t,s){try{Wi(-1);const n=arguments.length;return n===2?et(t)&&!Ae(t)?On(t)?vt(e,null,[t]):vt(e,t):vt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&On(s)&&(s=[s]),vt(e,t,s))}finally{Wi(1)}}function ly(){}function ry(e,t,s,n){const a=s[n];if(a&&Yf(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Yf(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Ft(s[n],t[n]))return!1;return ma>0&&Yt&&Yt.push(e),!0}const Qf="3.5.38",oy=Vt,cy=xg,dy=Ma,uy=Qp,py={createComponentInstance:qf,setupComponent:Kf,renderComponentRoot:Ll,setCurrentRenderingInstance:Vi,isVNode:On,normalizeVNode:ms,getComponentPublicInstance:cl,ensureValidVNode:xc,pushWarningContext:vg,popWarningContext:gg},fy=py,hy=null,my=null,vy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Po;const Dd=typeof window<"u"&&window.trustedTypes;if(Dd)try{Po=Dd.createPolicy("vue",{createHTML:e=>e})}catch{}const Xf=Po?e=>Po.createHTML(e):e=>e,gy="http://www.w3.org/2000/svg",by="http://www.w3.org/1998/Math/MathML",mn=typeof document<"u"?document:null,Md=mn&&mn.createElement("template"),eh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?mn.createElementNS(gy,e):t==="mathml"?mn.createElementNS(by,e):s?mn.createElement(e,{is:s}):mn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>mn.createTextNode(e),createComment:e=>mn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>mn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Md.innerHTML=Xf(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Md.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Pn="transition",mi="animation",Xa=Symbol("_vtc"),th={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},sh=Ge({},mc,th),yy=e=>(e.displayName="Transition",e.props=sh,e),xy=yy((e,{slots:t})=>Qa(of,nh(e),t)),sa=(e,t=[])=>{Ae(e)?e.forEach(s=>s(...t)):e&&e(...t)},Pd=e=>e?Ae(e)?e.some(t=>t.length>1):e.length>1:!1;function nh(e){const t={};for(const R in e)R in th||(t[R]=e[R]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=_y(a),v=m&&m[0],C=m&&m[1],{onBeforeEnter:L,onEnter:y,onEnterCancelled:g,onLeave:b,onLeaveCancelled:S,onBeforeAppear:k=L,onAppear:A=y,onAppearCancelled:T=g}=t,_=(R,$,V,oe)=>{R._enterCancelled=oe,Bn(R,$?d:r),Bn(R,$?c:l),V&&V()},D=(R,$)=>{R._isLeaving=!1,Bn(R,u),Bn(R,h),Bn(R,p),$&&$()},E=R=>($,V)=>{const oe=R?A:y,P=()=>_($,R,V);sa(oe,[$,P]),Fd(()=>{Bn($,R?o:i),Ys($,R?d:r),Pd(oe)||$d($,n,v,P)})};return Ge(t,{onBeforeEnter(R){sa(L,[R]),Ys(R,i),Ys(R,l)},onBeforeAppear(R){sa(k,[R]),Ys(R,o),Ys(R,c)},onEnter:E(!1),onAppear:E(!0),onLeave(R,$){R._isLeaving=!0;const V=()=>D(R,$);Ys(R,u),R._enterCancelled?(Ys(R,p),Fo(R)):(Fo(R),Ys(R,p)),Fd(()=>{R._isLeaving&&(Bn(R,u),Ys(R,h),Pd(b)||$d(R,n,C,V))}),sa(b,[R,V])},onEnterCancelled(R){_(R,!1,void 0,!0),sa(g,[R])},onAppearCancelled(R){_(R,!0,void 0,!0),sa(T,[R])},onLeaveCancelled(R){D(R),sa(S,[R])}})}function _y(e){if(e==null)return null;if(et(e))return[Xr(e.enter),Xr(e.leave)];{const t=Xr(e);return[t,t]}}function Xr(e){return Ul(e)}function Ys(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Xa]||(e[Xa]=new Set)).add(t)}function Bn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Xa];s&&(s.delete(t),s.size||(e[Xa]=void 0))}function Fd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let wy=0;function $d(e,t,s,n){const a=e._endId=++wy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=ah(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function ah(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${Pn}Delay`),i=n(`${Pn}Duration`),l=Ud(a,i),r=n(`${mi}Delay`),o=n(`${mi}Duration`),c=Ud(r,o);let d=null,u=0,p=0;t===Pn?l>0&&(d=Pn,u=l,p=i.length):t===mi?c>0&&(d=mi,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?Pn:mi:null,p=d?d===Pn?i.length:o.length:0);const h=d===Pn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Pn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function Ud(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Bd(s)+Bd(e[n])))}function Bd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Fo(e){return(e?e.ownerDocument:document).body.offsetHeight}function ky(e,t,s){const n=e[Xa];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Ql=Symbol("_vod"),Ac=Symbol("_vsh"),ih={name:"show",beforeMount(e,{value:t},{transition:s}){e[Ql]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):vi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),vi(e,!0),n.enter(e)):n.leave(e,()=>{vi(e,!1)}):vi(e,t))},beforeUnmount(e,{value:t}){vi(e,t)}};function vi(e,t){e.style.display=t?e[Ql]:"none",e[Ac]=!t}function Sy(){ih.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const lh=Symbol("");function Ty(e){const t=cs();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Xl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Xl(t.ce,a):$o(t.subTree,a),s(a)};gc(()=>{zi(n)}),We(()=>{os(n,Vt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),mt(()=>a.disconnect())})}function $o(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{$o(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Xl(e.el,t);else if(e.type===$t)e.children.forEach(s=>$o(s,t));else if(e.type===pa){let{el:s,anchor:n}=e;for(;s&&(Xl(s,t),s!==n);)s=s.nextSibling}}function Xl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Ov(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[lh]=n}}const Cy=/(?:^|;)\s*display\s*:/;function Ey(e,t,s){const n=e.style,a=Ue(s);let i=!1;if(s&&!a){if(t)if(Ue(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&Ci(n,r,"")}else for(const l in t)s[l]==null&&Ci(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Ry(e,l,!Ue(t)&&t?t[l]:void 0,r)||Ci(n,l,r):Ci(n,l,"")}}else if(a){if(t!==s){const l=n[lh];l&&(s+=";"+l),n.cssText=s,i=Cy.test(s)}}else t&&e.removeAttribute("style");Ql in e&&(e[Ql]=i?n.display:"",e[Ac]&&(n.display="none"))}const Hd=/\s*!important$/;function Ci(e,t,s){if(Ae(s))s.forEach(n=>Ci(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Ay(e,t);Hd.test(s)?e.setProperty(vs(n),s.replace(Hd,""),"important"):e[n]=s}}const zd=["Webkit","Moz","ms"],eo={};function Ay(e,t){const s=eo[t];if(s)return s;let n=ot(t);if(n!=="filter"&&n in e)return eo[t]=n;n=_a(n);for(let a=0;a<zd.length;a++){const i=zd[a]+n;if(i in e)return eo[t]=i}return t}function Ry(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ue(n)&&s===n}const jd="http://www.w3.org/1999/xlink";function Vd(e,t,s,n,a,i=Rv(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(jd,t.slice(6,t.length)):e.setAttributeNS(jd,t,s):s==null||i&&!kp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":es(s)?String(s):s)}function qd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Xf(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=kp(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function xn(e,t,s,n){e.addEventListener(t,s,n)}function Iy(e,t,s,n){e.removeEventListener(t,s,n)}const Gd=Symbol("_vei");function Oy(e,t,s,n,a=null){const i=e[Gd]||(e[Gd]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Ly(t);if(n){const c=i[t]=My(n,a);xn(e,r,c,o)}else l&&(Iy(e,r,l,o),i[t]=void 0)}}const Kd=/(?:Once|Passive|Capture)$/;function Ly(e){let t;if(Kd.test(e)){t={};let n;for(;n=e.match(Kd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):vs(e.slice(2)),t]}let to=0;const Ny=Promise.resolve(),Dy=()=>to||(Ny.then(()=>to=0),to=Date.now());function My(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ae(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&Ss(c,t,5,r)}}else Ss(a,t,5,[n])};return s.value=e,s.attached=Dy(),s}const Wd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,rh=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?ky(e,n,l):t==="style"?Ey(e,s,n):ya(t)?mr(t)||Oy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Py(e,t,n,l))?(qd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Vd(e,t,n,l,i,t!=="value")):e._isVueCE&&(Fy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ue(n)))?qd(e,ot(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Vd(e,t,n,l))};function Py(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Wd(t)&&Fe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Wd(t)&&Ue(s)?!1:t in e}function Fy(e,t){const s=e._def.props;if(!s)return!1;const n=ot(t);return Array.isArray(s)?s.some(a=>ot(a)===n):Object.keys(s).some(a=>ot(a)===n)}const Zd={};function oh(e,t,s){let n=rl(e,t);vr(n)&&(n=Ge({},n,t));class a extends Nr{constructor(l){super(n,l,s)}}return a.def=n,a}const $y=((e,t)=>oh(e,t,_h)),Uy=typeof HTMLElement<"u"?HTMLElement:class{};class Nr extends Uy{constructor(t,s={},n=sr){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==sr?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ge({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Nr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Et(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!Ae(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Ul(this._props[o])),(r||(r=Object.create(null)))[ot(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)tt(this,n)||Object.defineProperty(this,n,{get:()=>nn(s[n])})}_resolveProps(t){const{props:s}=t,n=Ae(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(ot))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Zd;const a=ot(t);s&&this._numberProps&&this._numberProps[a]&&(n=Ul(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Zd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(vs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(vs(t),s+""):s||this.removeAttribute(vs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),xh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=vt(this._def,Ge(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,vr(l[0])?Ge({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),vs(i)!==i&&a(vs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function ch(e){const t=cs(),s=t&&t.ce;return s||null}function By(){const e=ch();return e&&e.shadowRoot}function Hy(e="$style"){{const t=cs();if(!t)return Ke;const s=t.type.__cssModules;if(!s)return Ke;const n=s[e];return n||Ke}}const dh=new WeakMap,uh=new WeakMap,er=Symbol("_moveCb"),Jd=Symbol("_enterCb"),zy=e=>(delete e.props.mode,e),jy=zy({name:"TransitionGroup",props:Ge({},sh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=cs(),n=hc();let a,i;return Rr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Wy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(qy),a.forEach(Gy);const r=a.filter(Ky);Fo(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Ys(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[er]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[er]=null,Bn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),r=nh(l);let o=l.tag||$t;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Ac]&&(a.push(d),In(d,Ya(d,r,n,s)),dh.set(d,ph(d.el)))}i=t.default?Er(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&In(d,Ya(d,r,n,s))}return vt(o,null,i)}}}),Vy=jy;function qy(e){const t=e.el;t[er]&&t[er](),t[Jd]&&t[Jd]()}function Gy(e){uh.set(e,ph(e.el))}function Ky(e){const t=dh.get(e),s=uh.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function ph(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Wy(e,t,s){const n=e.cloneNode(),a=e[Xa];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=ah(n);return i.removeChild(n),l}const Kn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ae(t)?s=>ja(t,s):t};function Zy(e){e.target.composing=!0}function Yd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ps=Symbol("_assign");function Qd(e,t,s){return t&&(e=e.trim()),s&&(e=yr(e)),e}const tr={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ps]=Kn(a);const i=n||a.props&&a.props.type==="number";xn(e,t?"change":"input",l=>{l.target.composing||e[Ps](Qd(e.value,s,i))}),(s||i)&&xn(e,"change",()=>{e.value=Qd(e.value,s,i)}),t||(xn(e,"compositionstart",Zy),xn(e,"compositionend",Yd),xn(e,"change",Yd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ps]=Kn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?yr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Rc={deep:!0,created(e,t,s){e[Ps]=Kn(s),xn(e,"change",()=>{const n=e._modelValue,a=ei(e),i=e.checked,l=e[Ps];if(Ae(n)){const r=_r(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(xa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(hh(e,i))})},mounted:Xd,beforeUpdate(e,t,s){e[Ps]=Kn(s),Xd(e,t,s)}};function Xd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ae(t))a=_r(t,n.props.value)>-1;else if(xa(t))a=t.has(n.props.value);else{if(t===s)return;a=En(t,hh(e,!0))}e.checked!==a&&(e.checked=a)}const Ic={created(e,{value:t},s){e.checked=En(t,s.props.value),e[Ps]=Kn(s),xn(e,"change",()=>{e[Ps](ei(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ps]=Kn(n),t!==s&&(e.checked=En(t,n.props.value))}},fh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=xa(t);xn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?yr(ei(l)):ei(l));e[Ps](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Et(()=>{e._assigning=!1})}),e[Ps]=Kn(n)},mounted(e,{value:t}){eu(e,t)},beforeUpdate(e,t,s){e[Ps]=Kn(s)},updated(e,{value:t}){e._assigning||eu(e,t)}};function eu(e,t){const s=e.multiple,n=Ae(t);if(!(s&&!n&&!xa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ei(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=_r(t,r)>-1}else l.selected=t.has(r);else if(En(ei(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ei(e){return"_value"in e?e._value:e.value}function hh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const mh={created(e,t,s){Sl(e,t,s,null,"created")},mounted(e,t,s){Sl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Sl(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Sl(e,t,s,n,"updated")}};function vh(e,t){switch(e){case"SELECT":return fh;case"TEXTAREA":return tr;default:switch(t){case"checkbox":return Rc;case"radio":return Ic;default:return tr}}}function Sl(e,t,s,n,a){const l=vh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Jy(){tr.getSSRProps=({value:e})=>({value:e}),Ic.getSSRProps=({value:e},t)=>{if(t.props&&En(t.props.value,e))return{checked:!0}},Rc.getSSRProps=({value:e},t)=>{if(Ae(e)){if(t.props&&_r(e,t.props.value)>-1)return{checked:!0}}else if(xa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},mh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=vh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Yy=["ctrl","shift","alt","meta"],Qy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Yy.some(s=>e[`${s}Key`]&&!t.includes(s))},Xy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Qy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},ex={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},tx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=vs(a.key);if(t.some(l=>l===i||ex[l]===i))return e(a)}))},gh=Ge({patchProp:rh},eh);let Ni,tu=!1;function bh(){return Ni||(Ni=Of(gh))}function yh(){return Ni=tu?Ni:Lf(gh),tu=!0,Ni}const xh=((...e)=>{bh().render(...e)}),sx=((...e)=>{yh().hydrate(...e)}),sr=((...e)=>{const t=bh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=kh(n);if(!a)return;const i=t._component;!Fe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,wh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),_h=((...e)=>{const t=yh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=kh(n);if(a)return s(a,!0,wh(a))},t});function wh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function kh(e){return Ue(e)?document.querySelector(e):e}let su=!1;const nx=()=>{su||(su=!0,Jy(),Sy())},ax=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:of,BaseTransitionPropsValidators:mc,Comment:Tt,DeprecationTypes:vy,EffectScope:ic,ErrorCodes:yg,ErrorTypeStrings:cy,Fragment:$t,KeepAlive:Qg,ReactiveEffect:Ui,Static:pa,Suspense:Vb,Teleport:Dg,Text:qn,TrackOpTypes:pg,Transition:xy,TransitionGroup:Vy,TriggerOpTypes:fg,VueElement:Nr,assertNumber:bg,callWithAsyncErrorHandling:Ss,callWithErrorHandling:ci,camelize:ot,capitalize:_a,cloneVNode:ln,compatUtils:my,computed:J,createApp:sr,createBlock:Zl,createCommentVNode:jf,createElementBlock:Jb,createElementVNode:Tc,createHydrationRenderer:Lf,createPropsRestProxy:xb,createRenderer:Of,createSSRApp:_h,createSlots:ib,createStaticVNode:Xb,createTextVNode:Cc,createVNode:vt,customRef:qp,defineAsyncComponent:Jg,defineComponent:rl,defineCustomElement:oh,defineEmits:db,defineExpose:ub,defineModel:hb,defineOptions:pb,defineProps:cb,defineSSRCustomElement:$y,defineSlots:fb,devtools:dy,effect:Mv,effectScope:Lv,getCurrentInstance:cs,getCurrentScope:Ep,getCurrentWatcher:hg,getTransitionRawChildren:Er,guardReactiveProps:zf,h:Qa,handleError:wa,hasInjectionContext:Eg,hydrate:sx,hydrateOnIdle:Vg,hydrateOnInteraction:Wg,hydrateOnMediaQuery:Kg,hydrateOnVisible:Gg,initCustomFormatter:ly,initDirectivesForSSR:nx,inject:Ms,isMemoSame:Yf,isProxy:il,isReactive:Sn,isReadonly:an,isRef:Rt,isRuntimeOnly:ny,isShallow:bs,isVNode:On,markRaw:jp,mergeDefaults:bb,mergeModels:yb,mergeProps:Vf,nextTick:Et,nodeOps:eh,normalizeClass:al,normalizeProps:yv,normalizeStyle:nl,onActivated:us,onBeforeMount:uf,onBeforeUnmount:Ir,onBeforeUpdate:gc,onDeactivated:ts,onErrorCaptured:mf,onMounted:We,onRenderTracked:hf,onRenderTriggered:ff,onScopeDispose:Nv,onServerPrefetch:pf,onUnmounted:mt,onUpdated:Rr,onWatcherCleanup:Kp,openBlock:Ki,patchProp:rh,popScopeId:Sg,provide:Ii,proxyRefs:uc,pushScopeId:kg,queuePostFlushCb:zi,reactive:Wn,readonly:Hl,ref:f,registerRuntimeCompiler:Wf,render:xh,renderList:ab,renderSlot:lb,resolveComponent:tb,resolveDirective:nb,resolveDynamicComponent:sb,resolveFilter:hy,resolveTransitionHooks:Ya,setBlockTracking:Wi,setDevtoolsHook:uy,setTransitionHooks:In,shallowReactive:cc,shallowReadonly:eg,shallowRef:dc,ssrContextKey:Xp,ssrUtils:fy,stop:Pv,toDisplayString:Tp,toHandlerKey:za,toHandlers:rb,toRaw:Je,toRef:cg,toRefs:lg,toValue:ng,transformVNodeArgs:Yb,triggerRef:sg,unref:nn,useAttrs:gb,useCssModule:Hy,useCssVars:Ty,useHost:ch,useId:Pg,useModel:Rb,useSSRContext:ef,useShadowRoot:By,useSlots:vb,useTemplateRef:Fg,useTransitionState:hc,vModelCheckbox:Rc,vModelDynamic:mh,vModelRadio:Ic,vModelSelect:fh,vModelText:tr,vShow:ih,version:Qf,warn:oy,watch:os,watchEffect:Ag,watchPostEffect:Rg,watchSyncEffect:tf,withAsyncContext:_b,withCtx:fc,withDefaults:mb,withDirectives:Cg,withKeys:tx,withMemo:ry,withModifiers:Xy,withScopeId:Tg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ji=Symbol(""),Di=Symbol(""),Oc=Symbol(""),nr=Symbol(""),Sh=Symbol(""),ga=Symbol(""),Th=Symbol(""),Ch=Symbol(""),Lc=Symbol(""),Nc=Symbol(""),dl=Symbol(""),Dc=Symbol(""),Eh=Symbol(""),Mc=Symbol(""),Pc=Symbol(""),Fc=Symbol(""),$c=Symbol(""),Uc=Symbol(""),Bc=Symbol(""),Ah=Symbol(""),Rh=Symbol(""),Dr=Symbol(""),ar=Symbol(""),Hc=Symbol(""),zc=Symbol(""),Yi=Symbol(""),ul=Symbol(""),jc=Symbol(""),Uo=Symbol(""),ix=Symbol(""),Bo=Symbol(""),ir=Symbol(""),lx=Symbol(""),rx=Symbol(""),Vc=Symbol(""),ox=Symbol(""),cx=Symbol(""),qc=Symbol(""),Ih=Symbol(""),ti={[Ji]:"Fragment",[Di]:"Teleport",[Oc]:"Suspense",[nr]:"KeepAlive",[Sh]:"BaseTransition",[ga]:"openBlock",[Th]:"createBlock",[Ch]:"createElementBlock",[Lc]:"createVNode",[Nc]:"createElementVNode",[dl]:"createCommentVNode",[Dc]:"createTextVNode",[Eh]:"createStaticVNode",[Mc]:"resolveComponent",[Pc]:"resolveDynamicComponent",[Fc]:"resolveDirective",[$c]:"resolveFilter",[Uc]:"withDirectives",[Bc]:"renderList",[Ah]:"renderSlot",[Rh]:"createSlots",[Dr]:"toDisplayString",[ar]:"mergeProps",[Hc]:"normalizeClass",[zc]:"normalizeStyle",[Yi]:"normalizeProps",[ul]:"guardReactiveProps",[jc]:"toHandlers",[Uo]:"camelize",[ix]:"capitalize",[Bo]:"toHandlerKey",[ir]:"setBlockTracking",[lx]:"pushScopeId",[rx]:"popScopeId",[Vc]:"withCtx",[ox]:"unref",[cx]:"isRef",[qc]:"withMemo",[Ih]:"isMemoSame"};function dx(e){Object.getOwnPropertySymbols(e).forEach(t=>{ti[t]=e[t]})}const Cs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function ux(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Cs}}function Qi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=Cs){return e&&(r?(e.helper(ga),e.helper(ai(e.inSSR,c))):e.helper(ni(e.inSSR,c)),l&&e.helper(Uc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function fa(e,t=Cs){return{type:17,loc:t,elements:e}}function Ds(e,t=Cs){return{type:15,loc:t,properties:e}}function At(e,t){return{type:16,loc:Cs,key:Ue(e)?He(e,!0):e,value:t}}function He(e,t=!1,s=Cs,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Vs(e,t=Cs){return{type:8,loc:t,children:e}}function Mt(e,t=[],s=Cs){return{type:14,loc:s,callee:e,arguments:t}}function si(e,t=void 0,s=!1,n=!1,a=Cs){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Ho(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Cs}}function px(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Cs}}function fx(e){return{type:21,body:e,loc:Cs}}function ni(e,t){return e||t?Lc:Nc}function ai(e,t){return e||t?Th:Ch}function Gc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ni(n,e.isComponent)),t(ga),t(ai(n,e.isComponent)))}const nu=new Uint8Array([123,123]),au=new Uint8Array([125,125]);function iu(e){return e>=97&&e<=122||e>=65&&e<=90}function ws(e){return e===32||e===10||e===9||e===12||e===13}function Fn(e){return e===47||e===62||ws(e)}function lr(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Kt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class hx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=nu,this.delimiterClose=au,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=nu,this.delimiterClose=au}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Fn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||ws(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Kt.TitleEnd||this.currentSequence===Kt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Kt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Kt.Cdata.length&&(this.state=28,this.currentSequence=Kt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Kt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):iu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Fn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Fn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(lr("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){ws(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=iu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||ws(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):ws(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):ws(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Fn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Fn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Fn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Fn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Fn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):ws(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):ws(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){ws(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Kt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Kt.ScriptEnd[3]?this.startSpecial(Kt.ScriptEnd,4):t===Kt.StyleEnd[3]?this.startSpecial(Kt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Kt.TitleEnd[3]?this.startSpecial(Kt.TitleEnd,4):t===Kt.TextareaEnd[3]?this.startSpecial(Kt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Kt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function lu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ha(e,t){const s=lu("MODE",t),n=lu(e,t);return s===3?n===!0:n!==!1}function Xi(e,t,s,...n){return ha(e,t)}function Kc(e){throw e}function Oh(e){}function ht(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const gs=e=>e.type===4&&e.isStatic;function Lh(e){switch(e){case"Teleport":case"teleport":return Di;case"Suspense":case"suspense":return Oc;case"KeepAlive":case"keep-alive":return nr;case"BaseTransition":case"base-transition":return Sh}}const mx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Wc=e=>!mx.test(e),Nh=/[A-Za-z_$\xA0-\uFFFF]/,vx=/[\.\?\w$\xA0-\uFFFF]/,gx=/\s+[.[]\s*|\s*[.[]\s+/g,Dh=e=>e.type===4?e.content:e.loc.source,bx=e=>{const t=Dh(e).trim().replace(gx,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?Nh:vx).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},Mh=bx,yx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,xx=e=>yx.test(Dh(e)),_x=xx;function Ns(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ue(t)?a.name===t:t.test(a.name)))return a}}function Mr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&ra(i.arg,t))return i}}function ra(e,t){return!!(e&&gs(e)&&e.content===t)}function wx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function so(e){return e.type===5||e.type===2}function ru(e){return e.type===7&&e.name==="pre"}function kx(e){return e.type===7&&e.name==="slot"}function rr(e){return e.type===1&&e.tagType===3}function or(e){return e.type===1&&e.tagType===2}const Sx=new Set([Yi,ul]);function Ph(e,t=[]){if(e&&!Ue(e)&&e.type===14){const s=e.callee;if(!Ue(s)&&Sx.has(s))return Ph(e.arguments[0],t.concat(e))}return[e,t]}function cr(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ue(a)&&a.type===14){const r=Ph(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Ue(a))n=Ds([t]);else if(a.type===14){const r=a.arguments[0];!Ue(r)&&r.type===15?ou(t,r)||r.properties.unshift(t):a.callee===jc?n=Mt(s.helper(ar),[Ds([t]),a]):a.arguments.unshift(Ds([t])),!n&&(n=a)}else a.type===15?(ou(t,a)||a.properties.unshift(t),n=a):(n=Mt(s.helper(ar),[Ds([t]),a]),l&&l.callee===ul&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function ou(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function el(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Tx(e){return e.type===14&&e.callee===qc?e.arguments[1].returns:e}const Cx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Fh(e){for(let t=0;t<e.length;t++)if(!ws(e.charCodeAt(t)))return!1;return!0}function Zc(e){return e.type===2&&Fh(e.content)||e.type===12&&Zc(e.content)}function $h(e){return e.type===3||Zc(e)}const Uh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:$a,isPreTag:$a,isIgnoreNewlineTag:$a,isCustomElement:$a,onError:Kc,onWarn:Oh,comments:!1,prefixIdentifiers:!1};let Xe=Uh,tl=null,Cn="",Zt=null,Ze=null,ps="",hn=-1,aa=-1,Jc=0,jn=!1,zo=null;const ft=[],xt=new hx(ft,{onerr:un,ontext(e,t){Tl(Ht(e,t),e,t)},ontextentity(e,t,s){Tl(e,t,s)},oninterpolation(e,t){if(jn)return Tl(Ht(e,t),e,t);let s=e+xt.delimiterOpen.length,n=t-xt.delimiterClose.length;for(;ws(Cn.charCodeAt(s));)s++;for(;ws(Cn.charCodeAt(n-1));)n--;let a=Ht(s,n);a.includes("&")&&(a=Xe.decodeEntities(a,!1)),jo({type:5,content:Ml(a,!1,St(s,n)),loc:St(e,t)})},onopentagname(e,t){const s=Ht(e,t);Zt={type:1,tag:s,ns:Xe.getNamespace(s,ft[0],Xe.ns),tagType:0,props:[],children:[],loc:St(e-1,t),codegenNode:void 0}},onopentagend(e){du(e)},onclosetag(e,t){const s=Ht(e,t);if(!Xe.isVoidTag(s)){let n=!1;for(let a=0;a<ft.length;a++)if(ft[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&un(24,ft[0].loc.start.offset);for(let l=0;l<=a;l++){const r=ft.shift();Dl(r,t,l<a)}break}n||un(23,Bh(e,60))}},onselfclosingtag(e){const t=Zt.tag;Zt.isSelfClosing=!0,du(e),ft[0]&&ft[0].tag===t&&Dl(ft.shift(),e)},onattribname(e,t){Ze={type:6,name:Ht(e,t),nameLoc:St(e,t),value:void 0,loc:St(e)}},ondirname(e,t){const s=Ht(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!jn&&n===""&&un(26,e),jn||n==="")Ze={type:6,name:s,nameLoc:St(e,t),value:void 0,loc:St(e)};else if(Ze={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[He("prop")]:[],loc:St(e)},n==="pre"){jn=xt.inVPre=!0,zo=Zt;const a=Zt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Px(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ht(e,t);if(jn&&!ru(Ze))Ze.name+=s,oa(Ze.nameLoc,t);else{const n=s[0]!=="[";Ze.arg=Ml(n?s:s.slice(1,-1),n,St(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ht(e,t);if(jn&&!ru(Ze))Ze.name+="."+s,oa(Ze.nameLoc,t);else if(Ze.name==="slot"){const n=Ze.arg;n&&(n.content+="."+s,oa(n.loc,t))}else{const n=He(s,!0,St(e,t));Ze.modifiers.push(n)}},onattribdata(e,t){ps+=Ht(e,t),hn<0&&(hn=e),aa=t},onattribentity(e,t,s){ps+=e,hn<0&&(hn=t),aa=s},onattribnameend(e){const t=Ze.loc.start.offset,s=Ht(t,e);Ze.type===7&&(Ze.rawName=s),Zt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&un(2,t)},onattribend(e,t){if(Zt&&Ze){if(oa(Ze.loc,t),e!==0)if(ps.includes("&")&&(ps=Xe.decodeEntities(ps,!0)),Ze.type===6)Ze.name==="class"&&(ps=zh(ps).trim()),e===1&&!ps&&un(13,t),Ze.value={type:2,content:ps,loc:e===1?St(hn,aa):St(hn-1,aa+1)},xt.inSFCRoot&&Zt.tag==="template"&&Ze.name==="lang"&&ps&&ps!=="html"&&xt.enterRCDATA(lr("</template"),0);else{let s=0;Ze.exp=Ml(ps,!1,St(hn,aa),0,s),Ze.name==="for"&&(Ze.forParseResult=Ax(Ze.exp));let n=-1;Ze.name==="bind"&&(n=Ze.modifiers.findIndex(a=>a.content==="sync"))>-1&&Xi("COMPILER_V_BIND_SYNC",Xe,Ze.loc,Ze.arg.loc.source)&&(Ze.name="model",Ze.modifiers.splice(n,1))}(Ze.type!==7||Ze.name!=="pre")&&Zt.props.push(Ze)}ps="",hn=aa=-1},oncomment(e,t){Xe.comments&&jo({type:3,content:Ht(e,t),loc:St(e-4,t+3)})},onend(){const e=Cn.length;for(let t=0;t<ft.length;t++)Dl(ft[t],e-1),un(24,ft[t].loc.start.offset)},oncdata(e,t){(ft[0]?ft[0].ns:Xe.ns)!==0?Tl(Ht(e,t),e,t):un(1,e-9)},onprocessinginstruction(e){(ft[0]?ft[0].ns:Xe.ns)===0&&un(21,e-1)}}),cu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Ex=/^\(|\)$/g;function Ax(e){const t=e.loc,s=e.content,n=s.match(Cx);if(!n)return;const[,a,i]=n,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return Ml(u,!1,St(m,v),0,h?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Ex,"").trim();const c=a.indexOf(o),d=o.match(cu);if(d){o=o.replace(cu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(r.index=l(h,s.indexOf(h,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ht(e,t){return Cn.slice(e,t)}function du(e){xt.inSFCRoot&&(Zt.innerLoc=St(e+1,e+1)),jo(Zt);const{tag:t,ns:s}=Zt;s===0&&Xe.isPreTag(t)&&Jc++,Xe.isVoidTag(t)?Dl(Zt,e):(ft.unshift(Zt),(s===1||s===2)&&(xt.inXML=!0)),Zt=null}function Tl(e,t,s){{const i=ft[0]&&ft[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Xe.decodeEntities(e,!1))}const n=ft[0]||tl,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,oa(a.loc,s)):n.children.push({type:2,content:e,loc:St(t,s)})}function Dl(e,t,s=!1){s?oa(e.loc,Bh(t,60)):oa(e.loc,Rx(t,62)+1),xt.inSFCRoot&&(e.children.length?e.innerLoc.end=Ge({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ge({},e.innerLoc.start),e.innerLoc.source=Ht(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(jn||(n==="slot"?e.tagType=2:uu(e)?e.tagType=3:Ox(e)&&(e.tagType=1)),xt.inRCDATA||(e.children=Hh(i)),a===0&&Xe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Xe.isPreTag(n)&&Jc--,zo===e&&(jn=xt.inVPre=!1,zo=null),xt.inXML&&(ft[0]?ft[0].ns:Xe.ns)===0&&(xt.inXML=!1);{const l=e.props;if(!xt.inSFCRoot&&ha("COMPILER_NATIVE_TEMPLATE",Xe)&&e.tag==="template"&&!uu(e)){const o=ft[0]||tl,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Xi("COMPILER_INLINE_TEMPLATE",Xe,r.loc)&&e.children.length&&(r.value={type:2,content:Ht(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Rx(e,t){let s=e;for(;Cn.charCodeAt(s)!==t&&s<Cn.length-1;)s++;return s}function Bh(e,t){let s=e;for(;Cn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Ix=new Set(["if","else","else-if","for","slot"]);function uu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Ix.has(t[s].name))return!0}return!1}function Ox({tag:e,props:t}){if(Xe.isCustomElement(e))return!1;if(e==="component"||Lx(e.charCodeAt(0))||Lh(e)||Xe.isBuiltInComponent&&Xe.isBuiltInComponent(e)||Xe.isNativeTag&&!Xe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Xi("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}}else if(n.name==="bind"&&ra(n.arg,"is")&&Xi("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}return!1}function Lx(e){return e>64&&e<91}const Nx=/\r\n/g;function Hh(e){const t=Xe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Jc)a.content=a.content.replace(Nx,`
`);else if(Fh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Dx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=zh(a.content))}return s?e.filter(Boolean):e}function Dx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function zh(e){let t="",s=!1;for(let n=0;n<e.length;n++)ws(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function jo(e){(ft[0]||tl).children.push(e)}function St(e,t){return{start:xt.getPos(e),end:t==null?t:xt.getPos(t),source:t==null?t:Ht(e,t)}}function Mx(e){return St(e.start.offset,e.end.offset)}function oa(e,t){e.end=xt.getPos(t),e.source=Ht(e.start.offset,t)}function Px(e){const t={type:6,name:e.rawName,nameLoc:St(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Ml(e,t=!1,s,n=0,a=0){return He(e,t,s,n)}function un(e,t,s){Xe.onError(ht(e,St(t,t)))}function Fx(){xt.reset(),Zt=null,Ze=null,ps="",hn=-1,aa=-1,ft.length=0}function $x(e,t){if(Fx(),Cn=e,Xe=Ge({},Uh),t){let a;for(a in t)t[a]!=null&&(Xe[a]=t[a])}xt.mode=Xe.parseMode==="html"?1:Xe.parseMode==="sfc"?2:0,xt.inXML=Xe.ns===1||Xe.ns===2;const s=t&&t.delimiters;s&&(xt.delimiterOpen=lr(s[0]),xt.delimiterClose=lr(s[1]));const n=tl=ux([],e);return xt.parse(Cn),n.loc=St(0,e.length),n.children=Hh(n.children),tl=null,n}function Ux(e,t){Pl(e,void 0,t,!!jh(e))}function jh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!or(t[0])?t[0]:null}function Pl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:ks(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&qh(u,s)>=2){const v=Gh(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(n?0:ks(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Pl(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Pl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Pl(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ae(e.codegenNode.children))e.codegenNode.children=o(fa(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ae(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(fa(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ae(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Ns(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(fa(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ae(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ks(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=qh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ks(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=ks(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ga),t.removeHelper(ai(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ni(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ks(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Ue(r)||es(r))continue;const o=ks(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Bx=new Set([Hc,zc,Yi,ul]);function Vh(e,t){if(e.type===14&&!Ue(e.callee)&&Bx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ks(s,t);if(s.type===14)return Vh(s,t)}return 0}function qh(e,t){let s=3;const n=Gh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ks(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ks(r,t):r.type===14?c=Vh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Gh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Hx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Vt,isCustomElement:d=Vt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:C="",bindingMetadata:L=Ke,inline:y=!1,isTS:g=!1,onError:b=Kc,onWarn:S=Oh,compatConfig:k}){const A=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:A&&_a(ot(A[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:C,bindingMetadata:L,inline:y,isTS:g,onError:b,onWarn:S,compatConfig:k,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(_){const D=T.helpers.get(_)||0;return T.helpers.set(_,D+1),_},removeHelper(_){const D=T.helpers.get(_);if(D){const E=D-1;E?T.helpers.set(_,E):T.helpers.delete(_)}},helperString(_){return`_${ti[T.helper(_)]}`},replaceNode(_){T.parent.children[T.childIndex]=T.currentNode=_},removeNode(_){const D=T.parent.children,E=_?D.indexOf(_):T.currentNode?T.childIndex:-1;!_||_===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>E&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(E,1)},onNodeRemoved:Vt,addIdentifiers(_){},removeIdentifiers(_){},hoist(_){Ue(_)&&(_=He(_)),T.hoists.push(_);const D=He(`_hoisted_${T.hoists.length}`,!1,_.loc,2);return D.hoisted=_,D},cache(_,D=!1,E=!1){const R=px(T.cached.length,_,D,E);return T.cached.push(R),R}};return T.filters=new Set,T}function zx(e,t){const s=Hx(e,t);Pr(e,s),t.hoistStatic&&Ux(e,s),t.ssr||jx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function jx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=jh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Gc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Qi(t,s(Ji),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Vx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ue(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Pr(a,t))}}function Pr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ae(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(dl);break;case 5:t.ssr||t.helper(Dr);break;case 9:for(let i=0;i<e.branches.length;i++)Pr(e.branches[i],t);break;case 10:case 11:case 1:case 0:Vx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Kh(e,t){const s=Ue(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(kx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Fr="/*@__PURE__*/",Wh=e=>`${ti[e]}: _${ti[e]}`;function qx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${ti[v]}`},push(v,C=-2,L){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function Gx(e,t={}){const s=qx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&n!=="module";Kx(e,s);const v=d?"ssrRender":"render",L=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${L}) {`),l(),h&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(Wh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(no(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(no(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),no(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Qt(e.codegenNode,s):a("null"),h&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Kx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Lc,Nc,dl,Dc,Eh].filter(p=>d.includes(p)).map(Wh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Wx(e.hoists,t),i(),a("return ")}function no(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?$c:t==="component"?Mc:Fc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${el(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Wx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Qt(i,t),n())}t.pure=!1}function Yc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),pl(e,t,s),s&&t.deindent(),t.push("]")}function pl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Ue(r)?a(r,-3):Ae(r)?Yc(r,t):Qt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Qt(e,t){if(Ue(e)){t.push(e,-3);return}if(es(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Qt(e.codegenNode,t);break;case 2:Zx(e,t);break;case 4:Zh(e,t);break;case 5:Jx(e,t);break;case 12:Qt(e.codegenNode,t);break;case 8:Jh(e,t);break;case 3:Qx(e,t);break;case 13:Xx(e,t);break;case 14:t0(e,t);break;case 15:s0(e,t);break;case 17:n0(e,t);break;case 18:a0(e,t);break;case 19:i0(e,t);break;case 20:l0(e,t);break;case 21:pl(e.body,t,!0,!1);break}}function Zx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Zh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Jx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Fr),s(`${n(Dr)}(`),Qt(e.content,t),s(")")}function Jh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ue(n)?t.push(n,-3):Qt(n,t)}}function Yx(e,t){const{push:s}=t;if(e.type===8)s("["),Jh(e,t),s("]");else if(e.isStatic){const n=Wc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Qx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Fr),s(`${n(dl)}(${JSON.stringify(e.content)})`,-3,e)}function Xx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;o&&(m=String(o)),d&&s(n(Uc)+"("),u&&s(`(${n(ga)}(${p?"true":""}), `),a&&s(Fr);const v=u?ai(t.inSSR,h):ni(t.inSSR,h);s(n(v)+"(",-2,e),pl(e0([i,l,r,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),Qt(d,t),s(")"))}function e0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function t0(e,t){const{push:s,helper:n,pure:a}=t,i=Ue(e.callee)?e.callee:n(e.callee);a&&s(Fr),s(i+"(",-2,e),pl(e.arguments,t),s(")")}function s0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Yx(c,t),s(": "),Qt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function n0(e,t){Yc(e.elements,t)}function a0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${ti[Vc]}(`),s("(",-2,e),Ae(i)?pl(i,t):i&&Qt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),Ae(l)?Yc(l,t):Qt(l,t)):r&&Qt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function i0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Wc(s.content);u&&l("("),Zh(s,t),u&&l(")")}else l("("),Qt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Qt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Qt(a,t),d||t.indentLevel--,i&&o(!0)}function l0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(ir)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Qt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(ir)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const r0=Kh(/^(?:if|else|else-if)$/,(e,t,s)=>o0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=fu(a,o,s);else{const c=c0(n.codegenNode);c.alternate=fu(a,o+n.branches.length-1,s)}}}));function o0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ht(28,t.loc)),t.exp=He("true",!1,a)}if(t.name==="if"){const a=pu(e,t),i={type:9,loc:Mx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&$h(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ht(30,e.loc)),s.removeNode();const r=pu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Pr(r,s),o&&o(),s.currentNode=null}else s.onError(ht(30,e.loc));break}}}function pu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Ns(e,"for")?e.children:[e],userKey:Mr(e,"key"),isTemplateIf:s}}function fu(e,t,s){return e.condition?Ho(e.condition,hu(e,t,s),Mt(s.helper(dl),['""',"true"])):hu(e,t,s)}function hu(e,t,s){const{helper:n}=s,a=At("key",He(`${t}`,!1,Cs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return cr(o,a,s),o}else return Qi(s,n(Ji),Ds([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=Tx(o);return c.type===13&&Gc(c,s),cr(c,a,s),o}}function c0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const d0=Kh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return u0(e,t,s,i=>{const l=Mt(n(Bc),[i.source]),r=rr(e),o=Ns(e,"memo"),c=Mr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?He(c.value.content,!0):void 0:c.exp);const u=d?At("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=Qi(s,n(Ji),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,C=v.length!==1||v[0].type!==1,L=or(e)?e:r&&e.children.length===1&&or(e.children[0])?e.children[0]:null;if(L?(m=L.codegenNode,r&&u&&cr(m,u,s)):C?m=Qi(s,n(Ji),u?Ds([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,r&&u&&cr(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(ga),a(ai(s.inSSR,m.isComponent))):a(ni(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(ga),n(ai(s.inSSR,m.isComponent))):n(ni(s.inSSR,m.isComponent))),o){const y=si(Vo(i.parseResult,[He("_cached")]));y.body=fx([Vs(["const _memo = (",o.exp,")"]),Vs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Ih)}(_cached, _memo)) return _cached`]),Vs(["const _item = ",m]),He("_item.memo = _memo"),He("return _item")]),l.arguments.push(y,He("_cache"),He(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(si(Vo(i.parseResult),m,!0))}})});function u0(e,t,s,n){if(!t.exp){s.onError(ht(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ht(32,t.loc));return}Yh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:rr(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const h=n&&n(p);return()=>{r.vFor--,h&&h()}}function Yh(e,t){e.finalized||(e.finalized=!0)}function Vo({value:e,key:t,index:s},n=[]){return p0([e,t,s,...n])}function p0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||He("_".repeat(n+1),!1))}const mu=He("undefined",!1),f0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Ns(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},h0=(e,t,s,n)=>si(e,s,!1,!0,s.length?s[0].loc:n);function m0(e,t,s=h0){t.helper(Vc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=Ns(e,"slot",!0);if(o){const{arg:C,exp:L}=o;C&&!gs(C)&&(r=!0),i.push(At(C||He("default",!0),s(L,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let C=0;C<n.length;C++){const L=n[C];let y;if(!rr(L)||!(y=Ns(L,"slot",!0))){L.type!==3&&u.push(L);continue}if(o){t.onError(ht(37,y.loc));break}c=!0;const{children:g,loc:b}=L,{arg:S=He("default",!0),exp:k,loc:A}=y;let T;gs(S)?T=S?S.content:"default":r=!0;const _=Ns(L,"for"),D=s(k,_,g,b);let E,R;if(E=Ns(L,"if"))r=!0,l.push(Ho(E.exp,Cl(S,D,h++),mu));else if(R=Ns(L,/^else(?:-if)?$/,!0)){let $=C,V;for(;$--&&(V=n[$],!!$h(V)););if(V&&rr(V)&&Ns(V,/^(?:else-)?if$/)){let oe=l[l.length-1];for(;oe.alternate.type===19;)oe=oe.alternate;oe.alternate=R.exp?Ho(R.exp,Cl(S,D,h++),mu):Cl(S,D,h++)}else t.onError(ht(30,R.loc))}else if(_){r=!0;const $=_.forParseResult;$?(Yh($),l.push(Mt(t.helper(Bc),[$.source,si(Vo($),Cl(S,D),!0)]))):t.onError(ht(32,_.loc))}else{if(T){if(p.has(T)){t.onError(ht(38,A));continue}p.add(T),T==="default"&&(d=!0)}i.push(At(S,D))}}if(!o){const C=(L,y)=>{const g=s(L,void 0,y,a);return t.compatConfig&&(g.isNonScopedSlot=!0),At("default",g)};c?u.length&&!u.every(Zc)&&(d?t.onError(ht(39,u[0].loc)):i.push(C(void 0,u))):i.push(C(void 0,n))}const m=r?2:Fl(e.children)?3:1;let v=Ds(i.concat(At("_",He(m+"",!1))),a);return l.length&&(v=Mt(t.helper(Rh),[v,fa(l)])),{slots:v,hasDynamicSlots:r}}function Cl(e,t,s){const n=[At("name",e),At("fn",t)];return s!=null&&n.push(At("key",He(String(s),!0))),Ds(n)}function Fl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Fl(s.children))return!0;break;case 9:if(Fl(s.branches))return!0;break;case 10:case 11:if(Fl(s.children))return!0;break}}return!1}const Qh=new WeakMap,v0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?g0(e,t):`"${n}"`;const r=et(l)&&l.callee===Pc;let o,c,d=0,u,p,h,m=r||l===Di||l===Oc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=Xh(e,t,void 0,i,r);o=v.props,d=v.patchFlag,p=v.dynamicPropNames;const C=v.directives;h=C&&C.length?fa(C.map(L=>y0(L,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===nr&&(m=!0,d|=1024),i&&l!==Di&&l!==nr){const{slots:C,hasDynamicSlots:L}=m0(e,t);c=C,L&&(d|=1024)}else if(e.children.length===1&&l!==Di){const C=e.children[0],L=C.type,y=L===5||L===8;y&&ks(C,t)===0&&(d|=1),y||L===2?c=C:c=e.children}else c=e.children;p&&p.length&&(u=x0(p)),e.codegenNode=Qi(t,l,o,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function g0(e,t,s=!1){let{tag:n}=e;const a=qo(n),i=Mr(e,"is",!1,!0);if(i)if(a||ha("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&He(i.value.content,!0):(r=i.exp,r||(r=He("is",!1,i.arg.loc))),r)return Mt(t.helper(Pc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Lh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Mc),t.components.add(n),el(n,"component"))}function Xh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let h=!1,m=0,v=!1,C=!1,L=!1,y=!1,g=!1,b=!1;const S=[],k=D=>{c.length&&(d.push(Ds(vu(c),r)),c=[]),D&&d.push(D)},A=()=>{t.scopes.vFor>0&&c.push(At(He("ref_for",!0),He("true")))},T=({key:D,value:E})=>{if(gs(D)){const R=D.content,$=ya(R);if($&&(!n||a)&&R.toLowerCase()!=="onclick"&&R!=="onUpdate:modelValue"&&!kn(R)&&(y=!0),$&&kn(R)&&(b=!0),$&&E.type===14&&(E=E.arguments[0]),E.type===20||(E.type===4||E.type===8)&&ks(E,t)>0)return;R==="ref"?v=!0:R==="class"?C=!0:R==="style"?L=!0:R!=="key"&&!S.includes(R)&&S.push(R),n&&(R==="class"||R==="style")&&!S.includes(R)&&S.push(R)}else g=!0};for(let D=0;D<s.length;D++){const E=s[D];if(E.type===6){const{loc:R,name:$,nameLoc:V,value:oe}=E;let P=!0;if($==="ref"&&(v=!0,A()),$==="is"&&(qo(l)||oe&&oe.content.startsWith("vue:")||ha("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(At(He($,!0,V),He(oe?oe.content:"",P,oe?oe.loc:R)))}else{const{name:R,arg:$,exp:V,loc:oe,modifiers:P}=E,N=R==="bind",O=R==="on";if(R==="slot"){n||t.onError(ht(40,oe));continue}if(R==="once"||R==="memo"||R==="is"||N&&ra($,"is")&&(qo(l)||ha("COMPILER_IS_ON_ELEMENT",t))||O&&i)continue;if((N&&ra($,"key")||O&&p&&ra($,"vue:before-update"))&&(h=!0),N&&ra($,"ref")&&A(),!$&&(N||O)){if(g=!0,V)if(N){if(k(),ha("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(V);continue}A(),k(),d.push(V)}else k({type:14,loc:oe,callee:t.helper(jc),arguments:n?[V]:[V,"true"]});else t.onError(ht(N?34:35,oe));continue}N&&P.some(K=>K.content==="prop")&&(m|=32);const U=t.directiveTransforms[R];if(U){const{props:K,needRuntime:q}=U(E,e,t);!i&&K.forEach(T),O&&$&&!gs($)?k(Ds(K,r)):c.push(...K),q&&(u.push(E),es(q)&&Qh.set(E,q))}else dv(R)||(u.push(E),p&&(h=!0))}}let _;if(d.length?(k(),d.length>1?_=Mt(t.helper(ar),d,r):_=d[0]):c.length&&(_=Ds(vu(c),r)),g?m|=16:(C&&!n&&(m|=2),L&&!n&&(m|=4),S.length&&(m|=8),y&&(m|=32)),!h&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&_)switch(_.type){case 15:let D=-1,E=-1,R=!1;for(let oe=0;oe<_.properties.length;oe++){const P=_.properties[oe].key;gs(P)?P.content==="class"?D=oe:P.content==="style"&&(E=oe):P.isHandlerKey||(R=!0)}const $=_.properties[D],V=_.properties[E];R?_=Mt(t.helper(Yi),[_]):($&&!gs($.value)&&($.value=Mt(t.helper(Hc),[$.value])),V&&(L||V.value.type===4&&V.value.content.trim()[0]==="["||V.value.type===17)&&(V.value=Mt(t.helper(zc),[V.value])));break;case 14:break;default:_=Mt(t.helper(Yi),[Mt(t.helper(ul),[_])]);break}return{props:_,directives:u,patchFlag:m,dynamicPropNames:S,shouldUseBlock:h}}function vu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ya(i))&&b0(l,a):(t.set(i,a),s.push(a))}return s}function b0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=fa([e.value,t.value],e.loc)}function y0(e,t){const s=[],n=Qh.get(e);n?s.push(t.helperString(n)):(t.helper(Fc),t.directives.add(e.name),s.push(el(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=He("true",!1,a);s.push(Ds(e.modifiers.map(l=>At(l,i)),a))}return fa(s,e.loc)}function x0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function qo(e){return e==="component"||e==="Component"}const _0=(e,t)=>{if(or(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=w0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=si([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Mt(t.helper(Ah),l,n)}};function w0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=ot(l.name),a.push(l)));else if(l.name==="bind"&&ra(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=ot(l.arg.content);s=l.exp=He(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&gs(l.arg)&&(l.arg.content=ot(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Xh(e,t,a,!1,!1);n=i,l.length&&t.onError(ht(36,l[0].loc))}return{slotName:s,slotProps:n}}const em=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ht(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?za(ot(u)):`on:${u}`;r=He(p,!0,l.loc)}else r=Vs([`${s.helperString(Bo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(Bo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=Mh(o),p=!(u||_x(o)),h=o.content.includes(";");(p||c&&u)&&(o=Vs([`${p?"$event":"(...args)"} => ${h?"{":"("}`,o,h?"}":")"]))}let d={props:[At(r,o||He("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},k0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=ot(i.content):i.content=`${s.helperString(Uo)}(${i.content})`:(i.children.unshift(`${s.helperString(Uo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&gu(i,"."),n.some(r=>r.content==="attr")&&gu(i,"^")),{props:[At(i,l)]}},gu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},S0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(so(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(so(o))n||(n=s[i]=Vs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(so(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ks(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Mt(t.helper(Dc),r)}}}}},bu=new WeakSet,T0=(e,t)=>{if(e.type===1&&Ns(e,"once",!0))return bu.has(e)||t.inVOnce||t.inSSR?void 0:(bu.add(e),t.inVOnce=!0,t.helper(ir),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},tm=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ht(41,e.loc)),gi();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ht(44,n.loc)),gi();if(r==="literal-const"||r==="setup-const")return s.onError(ht(45,n.loc)),gi();if(!l.trim()||!Mh(n))return s.onError(ht(42,n.loc)),gi();const o=a||He("modelValue",!0),c=a?gs(a)?`onUpdate:${ot(a.content)}`:Vs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Vs([`${u} => ((`,n,") = $event)"]);const p=[At(o,e.exp),At(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(Wc(v)?v:JSON.stringify(v))+": true").join(", "),m=a?gs(a)?`${a.content}Modifiers`:Vs([a,' + "Modifiers"']):"modelModifiers";p.push(At(m,He(`{ ${h} }`,!1,e.loc,2)))}return gi(p)};function gi(e=[]){return{props:e}}const C0=/[\w).+\-_$\]]/,E0=(e,t)=>{ha("COMPILER_FILTERS",t)&&(e.type===5?dr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&dr(s.exp,t)}))};function dr(e,t){if(e.type===4)yu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?yu(n,t):n.type===8?dr(e,t):n.type===5&&dr(n.content,t))}}function yu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!r&&!o&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):C();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let L=h-1,y;for(;L>=0&&(y=s.charAt(L),y===" ");L--);(!y||!C0.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&C();function C(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=A0(m,v[h],t);e.content=m,e.ast=void 0}}function A0(e,t,s){s.helper($c);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${el(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${el(a,"filter")}(${e}${i!==")"?","+i:i}`}}const xu=new WeakSet,R0=(e,t)=>{if(e.type===1){const s=Ns(e,"memo");return!s||xu.has(e)||t.inSSR?void 0:(xu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Gc(n,t),e.codegenNode=Mt(t.helper(qc),[s.exp,si(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},I0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ht(53,n.loc)),s.exp=He("",!0,n.loc);else{const a=ot(n.content);(Nh.test(a[0])||a[0]==="-")&&(s.exp=He(a,!1,n.loc))}}}};function O0(e){return[[I0,T0,r0,R0,d0,E0,_0,v0,f0,S0],{on:em,bind:k0,model:tm}]}function L0(e,t={}){const s=t.onError||Kc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ht(48)):n&&s(ht(49));const a=!1;t.cacheHandlers&&s(ht(50)),t.scopeId&&!n&&s(ht(51));const i=Ge({},t,{prefixIdentifiers:a}),l=Ue(e)?$x(e,i):e,[r,o]=O0();return zx(l,Ge({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Ge({},o,t.directiveTransforms||{})})),Gx(l,i)}const N0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const sm=Symbol(""),nm=Symbol(""),am=Symbol(""),im=Symbol(""),Go=Symbol(""),lm=Symbol(""),rm=Symbol(""),om=Symbol(""),cm=Symbol(""),dm=Symbol("");dx({[sm]:"vModelRadio",[nm]:"vModelCheckbox",[am]:"vModelText",[im]:"vModelSelect",[Go]:"vModelDynamic",[lm]:"withModifiers",[rm]:"withKeys",[om]:"vShow",[cm]:"Transition",[dm]:"TransitionGroup"});let Ia;function D0(e,t=!1){return Ia||(Ia=document.createElement("div")),t?(Ia.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Ia.children[0].getAttribute("foo")):(Ia.innerHTML=e,Ia.textContent)}const M0={parseMode:"html",isVoidTag:Ev,isNativeTag:e=>Sv(e)||Tv(e)||Cv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:D0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return cm;if(e==="TransitionGroup"||e==="transition-group")return dm},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},P0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:He("style",!0,t.loc),exp:F0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},F0=(e,t)=>{const s=wp(e);return He(JSON.stringify(s),!1,t,3)};function Gn(e,t){return ht(e,t)}const $0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Gn(54,a)),t.children.length&&(s.onError(Gn(55,a)),t.children.length=0),{props:[At(He("innerHTML",!0,a),n||He("",!0))]}},U0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Gn(56,a)),t.children.length&&(s.onError(Gn(57,a)),t.children.length=0),{props:[At(He("textContent",!0),n?ks(n,s)>0?n:Mt(s.helperString(Dr),[n],a):He("",!0))]}},B0=(e,t,s)=>{const n=tm(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Gn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=am,r=!1;if(a==="input"||i){const o=Mr(t,"type");if(o){if(o.type===7)l=Go;else if(o.value)switch(o.value.content){case"radio":l=sm;break;case"checkbox":l=nm;break;case"file":r=!0,s.onError(Gn(60,e.loc));break}}else wx(t)&&(l=Go)}else a==="select"&&(l=im);r||(n.needRuntime=s.helper(l))}else s.onError(Gn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},H0=Ts("passive,once,capture"),z0=Ts("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),j0=Ts("left,right"),um=Ts("onkeyup,onkeydown,onkeypress"),V0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Xi("COMPILER_V_ON_NATIVE",s)||H0(o)?l.push(o):j0(o)?gs(e)?um(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):z0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},_u=(e,t)=>gs(e)&&e.content.toLowerCase()==="onclick"?He(t,!0):e.type!==4?Vs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,q0=(e,t,s)=>em(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=V0(i,a,s,e.loc);if(o.includes("right")&&(i=_u(i,"onContextmenu")),o.includes("middle")&&(i=_u(i,"onMouseup")),o.length&&(l=Mt(s.helper(lm),[l,JSON.stringify(o)])),r.length&&(!gs(i)||um(i.content.toLowerCase()))&&(l=Mt(s.helper(rm),[l,JSON.stringify(r)])),c.length){const d=c.map(_a).join("");i=gs(i)?He(`${i.content}${d}`,!0):Vs(["(",i,`) + "${d}"`])}return{props:[At(i,l)]}}),G0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Gn(62,a)),{props:[],needRuntime:s.helper(om)}},K0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},W0=[P0],Z0={cloak:N0,html:$0,text:U0,model:B0,on:q0,show:G0};function J0(e,t={}){return L0(e,Ge({},M0,t,{nodeTransforms:[K0,...W0,...t.nodeTransforms||[]],directiveTransforms:Ge({},Z0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const wu=Object.create(null);function Y0(e,t){if(!Ue(e))if(e.nodeType)e=e.innerHTML;else return Vt;const s=fv(e,t),n=wu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Ge({hoistStatic:!0,onError:void 0,onWarn:Vt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=J0(e,a),l=new Function("Vue",i)(ax);return l._rc=!0,wu[s]=l}Wf(Y0);const ur=Wn({items:[]});let Q0=1;function $r(e,t="info",s=3e3){const n=Q0++;return ur.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Qc(n),s),n}function Qc(e){const t=ur.items.findIndex(s=>s.id===e);t>=0&&ur.items.splice(t,1)}function Re(e,t="info",s=3e3){return $r(e,t,s)}Re.success=(e,t=3e3)=>$r(e,"success",t);Re.error=(e,t=5e3)=>$r(e,"error",t);Re.info=(e,t=3e3)=>$r(e,"info",t);Re.dismiss=Qc;const X0={setup(){return{state:ur,dismiss:Qc}},template:`
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      <transition-group name="toast">
        <div
          v-for="t in state.items"
          :key="t.id"
          class="toast-item"
          :class="'toast-' + t.type"
          role="status"
          @click="dismiss(t.id)"
        >
          <span class="toast-icon" aria-hidden="true"><odin-icon :name="t.type === 'success' ? 'success' : t.type === 'error' ? 'error' : 'info'" :size="18" /></span>
          <span class="toast-text">{{ t.message }}</span>
        </div>
      </transition-group>
    </div>
  `},gn=Wn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Wa=null;function Xt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Wa&&Wa(!1),gn.title=e,gn.message=t,gn.confirmLabel=s,gn.cancelLabel=n,gn.danger=a,gn.open=!0,new Promise(i=>{Wa=i})}function ku(e){gn.open=!1,Wa&&(Wa(e),Wa=null)}const e_={setup(){function e(t){gn.open&&t.key==="Escape"&&(t.stopPropagation(),ku(!1))}return We(()=>document.addEventListener("keydown",e,!0)),mt(()=>document.removeEventListener("keydown",e,!0)),{state:gn,settle:ku}},template:`
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay" @click.self="settle(false)" @keydown.escape.prevent.stop="settle(false)" role="dialog" aria-modal="true" :aria-label="state.title">
        <div class="modal-content confirm-dialog" v-modal-focus tabindex="-1">
          <div class="confirm-heading">
            <span class="confirm-icon" :class="{ danger: state.danger }" aria-hidden="true"><odin-icon :name="state.danger ? 'warning' : 'info'" :size="20" /></span>
            <div><h3>{{ state.title }}</h3><p style="white-space: pre-wrap;">{{ state.message }}</p></div>
          </div>
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost text-sm" @click="settle(false)">{{ state.cancelLabel }}</button>
            <button class="btn text-sm" :class="state.danger ? 'btn-danger' : 'btn-primary'" @click="settle(true)" autofocus>
              {{ state.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  `};/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */const Pa=typeof document<"u";function pm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function t_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&pm(e.default)}const nt=Object.assign;function ao(e,t){const s={};for(const n in t){const a=t[n];s[n]=Gs(a)?a.map(e):e(a)}return s}const Mi=()=>{},Gs=Array.isArray;function Su(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const fm=/#/g,s_=/&/g,n_=/\//g,a_=/=/g,i_=/\?/g,hm=/\+/g,l_=/%5B/g,r_=/%5D/g,mm=/%5E/g,o_=/%60/g,vm=/%7B/g,c_=/%7C/g,gm=/%7D/g,d_=/%20/g;function Xc(e){return e==null?"":encodeURI(""+e).replace(c_,"|").replace(l_,"[").replace(r_,"]")}function u_(e){return Xc(e).replace(vm,"{").replace(gm,"}").replace(mm,"^")}function Ko(e){return Xc(e).replace(hm,"%2B").replace(d_,"+").replace(fm,"%23").replace(s_,"%26").replace(o_,"`").replace(vm,"{").replace(gm,"}").replace(mm,"^")}function p_(e){return Ko(e).replace(a_,"%3D")}function f_(e){return Xc(e).replace(fm,"%23").replace(i_,"%3F")}function h_(e){return f_(e).replace(n_,"%2F")}function sl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const m_=/\/$/,v_=e=>e.replace(m_,"");function io(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=x_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:sl(l)}}function g_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Tu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function b_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ii(t.matched[n],s.matched[a])&&bm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ii(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function bm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!y_(e[s],t[s]))return!1;return!0}function y_(e,t){return Gs(e)?Cu(e,t):Gs(t)?Cu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Cu(e,t){return Gs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function x_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const $n={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Wo=(function(e){return e.pop="pop",e.push="push",e})({}),lo=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function __(e){if(!e)if(Pa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),v_(e)}const w_=/^[^#]+#/;function k_(e,t){return e.replace(w_,"#")+t}function S_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Ur=()=>({left:window.scrollX,top:window.scrollY});function T_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=S_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Eu(e,t){return(history.state?history.state.position-t:-1)+e}const Zo=new Map;function C_(e,t){Zo.set(e,t)}function E_(e){const t=Zo.get(e);return Zo.delete(e),t}function A_(e){return typeof e=="string"||e&&typeof e=="object"}function ym(e){return typeof e=="string"||typeof e=="symbol"}let yt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const xm=Symbol("");yt.MATCHER_NOT_FOUND+"",yt.NAVIGATION_GUARD_REDIRECT+"",yt.NAVIGATION_ABORTED+"",yt.NAVIGATION_CANCELLED+"",yt.NAVIGATION_DUPLICATED+"";function li(e,t){return nt(new Error,{type:e,[xm]:!0},t)}function pn(e,t){return e instanceof Error&&xm in e&&(t==null||!!(e.type&t))}const R_=["params","query","hash"];function I_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of R_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function O_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(hm," "),i=a.indexOf("="),l=sl(i<0?a:a.slice(0,i)),r=i<0?null:sl(a.slice(i+1));if(l in t){let o=t[l];Gs(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function Au(e){let t="";for(let s in e){const n=e[s];if(s=p_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Gs(n)?n.map(a=>a&&Ko(a)):[n&&Ko(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function L_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Gs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const N_=Symbol(""),Ru=Symbol(""),Br=Symbol(""),ed=Symbol(""),Jo=Symbol("");function bi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Vn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(li(yt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):A_(p)?o(li(yt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function ro(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(pm(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Vn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=t_(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&Vn(p,s,n,l,r,a)()}))}}return i}function D_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>ii(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>ii(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let M_=()=>location.protocol+"//"+location.host;function _m(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),Tu(r,"")}return Tu(s,e)+n+a}function P_(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const h=_m(e,location),m=s.value,v=t.value;let C=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}C=v?p.position-v.position:0}else n(h);a.forEach(L=>{L(s.value,m,{delta:C,type:Wo.pop,direction:C?C>0?lo.forward:lo.back:lo.unknown})})};function o(){l=s.value}function c(p){a.push(p);const h=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(nt({},p.state,{scroll:Ur()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function Iu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Ur():null}}function F_(e){const{history:t,location:s}=window,n={value:_m(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:M_()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(o,c){i(o,nt({},t.state,Iu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=nt({},a.value,t.state,{forward:o,scroll:Ur()});i(d.current,d,!0),i(o,nt({},Iu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function $_(e){e=__(e);const t=F_(e),s=P_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=nt({location:"",base:e,go:n,createHref:k_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function U_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),$_(e)}let ca=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Nt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Nt||{});const B_={type:ca.Static,value:""},H_=/[a-zA-Z0-9_]/;function z_(e){if(!e)return[[]];if(e==="/")return[[B_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Nt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Nt.Static?i.push({type:ca.Static,value:c}):s===Nt.Param||s===Nt.ParamRegExp||s===Nt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:ca.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Nt.ParamRegExp){n=s,s=Nt.EscapeNext;continue}switch(s){case Nt.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Nt.Param):p();break;case Nt.EscapeNext:p(),s=n;break;case Nt.Param:o==="("?s=Nt.ParamRegExp:H_.test(o)?p():(u(),s=Nt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Nt.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Nt.ParamRegExpEnd:d+=o;break;case Nt.ParamRegExpEnd:u(),s=Nt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Nt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Ou="[^/]+?",j_={sensitive:!1,strict:!1,start:!0,end:!0};var is=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(is||{});const V_=/[.+*?^${}()[\]/\\]/g;function q_(e,t){const s=nt({},j_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[is.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=is.Segment+(s.sensitive?is.BonusCaseSensitive:0);if(p.type===ca.Static)u||(a+="/"),a+=p.value.replace(V_,"\\$&"),h+=is.Static;else if(p.type===ca.Param){const{value:m,repeatable:v,optional:C,regexp:L}=p;i.push({name:m,repeatable:v,optional:C});const y=L||Ou;if(y!==Ou){h+=is.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let g=v?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=C&&c.length<2?`(?:/${g})`:"/"+g),C&&(g+="?"),a+=g,h+=is.Dynamic,C&&(h+=is.BonusOptional),v&&(h+=is.BonusRepeatable),y===".*"&&(h+=is.BonusWildcard)}d.push(h)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=is.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===ca.Static)d+=h.value;else if(h.type===ca.Param){const{value:m,repeatable:v,optional:C}=h,L=m in c?c[m]:"";if(Gs(L)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Gs(L)?L.join("/"):L;if(!y)if(C)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function G_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===is.Static+is.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===is.Static+is.Segment?1:-1:0}function wm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=G_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Lu(n))return 1;if(Lu(a))return-1}return a.length-n.length}function Lu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const K_={strict:!1,end:!0,sensitive:!1};function W_(e,t,s){const n=q_(z_(e.path),s),a=nt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function Z_(e,t){const s=[],n=new Map;t=Su(K_,t);function a(u){return n.get(u)}function i(u,p,h){const m=!h,v=Du(u);v.aliasOf=h&&h.record;const C=Su(t,u),L=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of b)L.push(Du(nt({},v,{components:h?h.record.components:v.components,path:S,aliasOf:h?h.record:v})))}let y,g;for(const b of L){const{path:S}=b;if(p&&S[0]!=="/"){const k=p.record.path,A=k[k.length-1]==="/"?"":"/";b.path=p.record.path+(S&&A+S)}if(y=W_(b,p,C),h?h.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),m&&u.name&&!Mu(y)&&l(u.name)),km(y)&&o(y),v.children){const k=v.children;for(let A=0;A<k.length;A++)i(k[A],y,h&&h.children[A])}h=h||y}return g?()=>{l(g)}:Mi}function l(u){if(ym(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=Q_(u,s);s.splice(p,0,u),u.record.name&&!Mu(u)&&n.set(u.record.name,u)}function c(u,p){let h,m={},v,C;if("name"in u&&u.name){if(h=n.get(u.name),!h)throw li(yt.MATCHER_NOT_FOUND,{location:u});C=h.record.name,m=nt(Nu(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Nu(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),C=h.record.name);else{if(h=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw li(yt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});C=h.record.name,m=nt({},p.params,u.params),v=h.stringify(m)}const L=[];let y=h;for(;y;)L.unshift(y.record),y=y.parent;return{name:C,path:v,params:m,matched:L,meta:Y_(L)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Nu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Du(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:J_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function J_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Mu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Y_(e){return e.reduce((t,s)=>nt(t,s.meta),{})}function Q_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;wm(e,t[i])<0?n=i:s=i+1}const a=X_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function X_(e){let t=e;for(;t=t.parent;)if(km(t)&&wm(e,t)===0)return t}function km({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Pu(e){const t=Ms(Br),s=Ms(ed),n=J(()=>{const o=nn(e.to);return t.resolve(o)}),a=J(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(ii.bind(null,d));if(p>-1)return p;const h=Fu(o[c-2]);return c>1&&Fu(d)===h&&u[u.length-1].path!==h?u.findIndex(ii.bind(null,o[c-2])):p}),i=J(()=>a.value>-1&&aw(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&bm(s.params,n.value.params));function r(o={}){if(nw(o)){const c=t[nn(e.replace)?"replace":"push"](nn(e.to)).catch(Mi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function ew(e){return e.length===1?e[0]:e}const tw=rl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Pu,setup(e,{slots:t}){const s=Wn(Pu(e)),{options:n}=Ms(Br),a=J(()=>({[$u(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[$u(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&ew(t.default(s));return e.custom?i:Qa("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),sw=tw;function nw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function aw(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Gs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Fu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const $u=(e,t,s)=>e??t??s,iw=rl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ms(Jo),a=J(()=>e.route||n.value),i=Ms(Ru,0),l=J(()=>{let c=nn(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=J(()=>a.value.matched[l.value]);Ii(Ru,J(()=>l.value+1)),Ii(N_,r),Ii(Jo,a);const o=f();return os(()=>[o.value,r.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!ii(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return Uu(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,C=Qa(p,nt({},m,t,{onVnodeUnmounted:L=>{L.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Uu(s.default,{Component:C,route:c})||C}}});function Uu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const lw=iw;function rw(e){const t=Z_(e.routes,e),s=e.parseQuery||O_,n=e.stringifyQuery||Au,a=e.history,i=bi(),l=bi(),r=bi(),o=dc($n);let c=$n;Pa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=ao.bind(null,Y=>""+Y),u=ao.bind(null,h_),p=ao.bind(null,sl);function h(Y,be){let H,re;return ym(Y)?(H=t.getRecordMatcher(Y),re=be):re=Y,t.addRoute(re,H)}function m(Y){const be=t.getRecordMatcher(Y);be&&t.removeRoute(be)}function v(){return t.getRoutes().map(Y=>Y.record)}function C(Y){return!!t.getRecordMatcher(Y)}function L(Y,be){if(be=nt({},be||o.value),typeof Y=="string"){const M=io(s,Y,be.path),B=t.resolve({path:M.path},be),ae=a.createHref(M.fullPath);return nt(M,B,{params:p(B.params),hash:sl(M.hash),redirectedFrom:void 0,href:ae})}let H;if(Y.path!=null)H=nt({},Y,{path:io(s,Y.path,be.path).path});else{const M=nt({},Y.params);for(const B in M)M[B]==null&&delete M[B];H=nt({},Y,{params:u(M)}),be.params=u(be.params)}const re=t.resolve(H,be),ue=Y.hash||"";re.params=d(p(re.params));const Le=g_(n,nt({},Y,{hash:u_(ue),path:re.path})),x=a.createHref(Le);return nt({fullPath:Le,hash:ue,query:n===Au?L_(Y.query):Y.query||{}},re,{redirectedFrom:void 0,href:x})}function y(Y){return typeof Y=="string"?io(s,Y,o.value.path):nt({},Y)}function g(Y,be){if(c!==Y)return li(yt.NAVIGATION_CANCELLED,{from:be,to:Y})}function b(Y){return A(Y)}function S(Y){return b(nt(y(Y),{replace:!0}))}function k(Y,be){const H=Y.matched[Y.matched.length-1];if(H&&H.redirect){const{redirect:re}=H;let ue=typeof re=="function"?re(Y,be):re;return typeof ue=="string"&&(ue=ue.includes("?")||ue.includes("#")?ue=y(ue):{path:ue},ue.params={}),nt({query:Y.query,hash:Y.hash,params:ue.path!=null?{}:Y.params},ue)}}function A(Y,be){const H=c=L(Y),re=o.value,ue=Y.state,Le=Y.force,x=Y.replace===!0,M=k(H,re);if(M)return A(nt(y(M),{state:typeof M=="object"?nt({},ue,M.state):ue,force:Le,replace:x}),be||H);const B=H;B.redirectedFrom=be;let ae;return!Le&&b_(n,re,H)&&(ae=li(yt.NAVIGATION_DUPLICATED,{to:B,from:re}),q(re,re,!0,!1)),(ae?Promise.resolve(ae):D(B,re)).catch(te=>pn(te)?pn(te,yt.NAVIGATION_GUARD_REDIRECT)?te:K(te):O(te,B,re)).then(te=>{if(te){if(pn(te,yt.NAVIGATION_GUARD_REDIRECT))return A(nt({replace:x},y(te.to),{state:typeof te.to=="object"?nt({},ue,te.to.state):ue,force:Le}),be||B)}else te=R(B,re,!0,x,ue);return E(B,re,te),te})}function T(Y,be){const H=g(Y,be);return H?Promise.reject(H):Promise.resolve()}function _(Y){const be=X.values().next().value;return be&&typeof be.runWithContext=="function"?be.runWithContext(Y):Y()}function D(Y,be){let H;const[re,ue,Le]=D_(Y,be);H=ro(re.reverse(),"beforeRouteLeave",Y,be);for(const M of re)M.leaveGuards.forEach(B=>{H.push(Vn(B,Y,be))});const x=T.bind(null,Y,be);return H.push(x),Pe(H).then(()=>{H=[];for(const M of i.list())H.push(Vn(M,Y,be));return H.push(x),Pe(H)}).then(()=>{H=ro(ue,"beforeRouteUpdate",Y,be);for(const M of ue)M.updateGuards.forEach(B=>{H.push(Vn(B,Y,be))});return H.push(x),Pe(H)}).then(()=>{H=[];for(const M of Le)if(M.beforeEnter)if(Gs(M.beforeEnter))for(const B of M.beforeEnter)H.push(Vn(B,Y,be));else H.push(Vn(M.beforeEnter,Y,be));return H.push(x),Pe(H)}).then(()=>(Y.matched.forEach(M=>M.enterCallbacks={}),H=ro(Le,"beforeRouteEnter",Y,be,_),H.push(x),Pe(H))).then(()=>{H=[];for(const M of l.list())H.push(Vn(M,Y,be));return H.push(x),Pe(H)}).catch(M=>pn(M,yt.NAVIGATION_CANCELLED)?M:Promise.reject(M))}function E(Y,be,H){r.list().forEach(re=>_(()=>re(Y,be,H)))}function R(Y,be,H,re,ue){const Le=g(Y,be);if(Le)return Le;const x=be===$n,M=Pa?history.state:{};H&&(re||x?a.replace(Y.fullPath,nt({scroll:x&&M&&M.scroll},ue)):a.push(Y.fullPath,ue)),o.value=Y,q(Y,be,H,x),K()}let $;function V(){$||($=a.listen((Y,be,H)=>{if(!fe.listening)return;const re=L(Y),ue=k(re,fe.currentRoute.value);if(ue){A(nt(ue,{replace:!0,force:!0}),re).catch(Mi);return}c=re;const Le=o.value;Pa&&C_(Eu(Le.fullPath,H.delta),Ur()),D(re,Le).catch(x=>pn(x,yt.NAVIGATION_ABORTED|yt.NAVIGATION_CANCELLED)?x:pn(x,yt.NAVIGATION_GUARD_REDIRECT)?(A(nt(y(x.to),{force:!0}),re).then(M=>{pn(M,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&!H.delta&&H.type===Wo.pop&&a.go(-1,!1)}).catch(Mi),Promise.reject()):(H.delta&&a.go(-H.delta,!1),O(x,re,Le))).then(x=>{x=x||R(re,Le,!1),x&&(H.delta&&!pn(x,yt.NAVIGATION_CANCELLED)?a.go(-H.delta,!1):H.type===Wo.pop&&pn(x,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),E(re,Le,x)}).catch(Mi)}))}let oe=bi(),P=bi(),N;function O(Y,be,H){K(Y);const re=P.list();return re.length?re.forEach(ue=>ue(Y,be,H)):console.error(Y),Promise.reject(Y)}function U(){return N&&o.value!==$n?Promise.resolve():new Promise((Y,be)=>{oe.add([Y,be])})}function K(Y){return N||(N=!Y,V(),oe.list().forEach(([be,H])=>Y?H(Y):be()),oe.reset()),Y}function q(Y,be,H,re){const{scrollBehavior:ue}=e;if(!Pa||!ue)return Promise.resolve();const Le=!H&&E_(Eu(Y.fullPath,0))||(re||!H)&&history.state&&history.state.scroll||null;return Et().then(()=>ue(Y,be,Le)).then(x=>x&&T_(x)).catch(x=>O(x,Y,be))}const Q=Y=>a.go(Y);let ie;const X=new Set,fe={currentRoute:o,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:C,getRoutes:v,resolve:L,options:e,push:b,replace:S,go:Q,back:()=>Q(-1),forward:()=>Q(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:P.add,isReady:U,install(Y){Y.component("RouterLink",sw),Y.component("RouterView",lw),Y.config.globalProperties.$router=fe,Object.defineProperty(Y.config.globalProperties,"$route",{enumerable:!0,get:()=>nn(o)}),Pa&&!ie&&o.value===$n&&(ie=!0,b(a.location).catch(re=>{}));const be={};for(const re in $n)Object.defineProperty(be,re,{get:()=>o.value[re],enumerable:!0});Y.provide(Br,fe),Y.provide(ed,cc(be)),Y.provide(Jo,o);const H=Y.unmount;X.add(Y),Y.unmount=function(){X.delete(Y),X.size<1&&(c=$n,$&&$(),$=null,o.value=$n,ie=!1,N=!1),H()}}};function Pe(Y){return Y.reduce((be,H)=>be.then(()=>_(H)),Promise.resolve())}return fe}function Sm(){return Ms(Br)}function ow(e){return Ms(ed)}const Hr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=ow(),s=Sm(),n=J({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});os(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
    <section class="section-shell" :aria-label="groupLabel">
      <div class="section-tabs-wrap">
        <div class="section-tabs" role="tablist" :aria-label="groupLabel + ' navigation'">
          <button v-for="(tab, index) in tabs" :key="tab.id" @click="activeTab = tab.id"
            @keydown="onTabKeydown($event, index)" role="tab" :id="'tab-' + tab.id"
            :aria-selected="activeTab === tab.id" :aria-controls="'panel-' + tab.id"
            :tabindex="activeTab === tab.id ? 0 : -1" class="section-tab"
            :class="{ active: activeTab === tab.id }">{{ tab.label }}</button>
        </div>
      </div>
      <div class="section-panel" role="tabpanel" :id="'panel-' + activeTab" :aria-labelledby="'tab-' + activeTab">
        <keep-alive><component :is="activeComponent" :key="activeTab" /></keep-alive>
      </div>
    </section>
  `},cw={setup(){const e=f([]),t=f([]),s=f({}),n=50;function a(p){var v,C,L,y,g;const h=p.payload||p,m=h.type||p.type;if(m==="tool_start"){const b=((v=h.metadata)==null?void 0:v.call_id)||null,S={callId:b,id:b||`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:((C=h.metadata)==null?void 0:C.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(m==="tool_end"){const b=((L=h.metadata)==null?void 0:L.call_id)||null;let S=-1;if(b&&(S=e.value.findIndex(k=>k.callId===b&&k.status==="running")),S<0&&!b)for(let k=e.value.length-1;k>=0;k--){const A=e.value[k];if(A.tool===h.action&&A.status==="running"){S=k;break}}if(S>=0){const k=e.value[S];k.status=(y=h.metadata)!=null&&y.error?"error":"success",k.elapsed=((g=h.metadata)==null?void 0:g.elapsed_ms)||Date.now()-k.startTime,k.result=h.detail||"",k.fadingOut=!0,setTimeout(()=>{const A=e.value.indexOf(k);A>=0&&e.value.splice(A,1),t.value.unshift(k),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const b=h.call_id||h.tool_name||"unknown";if(h.finished){const S={...s.value};delete S[b],s.value=S}else{const k=((s.value[b]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[b]:k.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let r=!1;function o(){r||(r=!0,Ye.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Ye.off("events",a),i&&(clearInterval(i),i=null))}We(o),us(o),ts(c),mt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
    <div class="p-6 page-fade-in space-y-6">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <odin-icon name="target" :size="22" /> Execution Viewer
      </h2>

      <!-- Active Tasks -->
      <div class="bg-gray-800 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Active</h3>
        <div v-if="activeTasks.length === 0" class="text-gray-500 text-sm py-4 text-center">
          No active tool executions
        </div>
        <div v-for="task in activeTasks" :key="task.id"
             class="bg-gray-900 rounded-lg p-3 mb-2"
             :class="task.fadingOut
               ? (task.status === 'error' ? 'border border-red-500/40' : 'border border-green-500/40')
               : 'border border-blue-500/30'"
             :style="task.fadingOut ? 'opacity: 0; transition: opacity 4.5s ease-out;' : ''">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span v-if="task.fadingOut" :class="task.status === 'error' ? 'text-red-400' : 'text-green-400'"><odin-icon :name="statusIcon(task.status)" :size="17" /></span>
              <span v-else class="animate-pulse text-blue-400"><odin-icon name="clock" :size="17" /></span>
              <span class="text-white font-mono text-sm font-bold">{{ task.tool }}</span>
              <span class="text-gray-500 text-xs">iter {{ task.iteration }}</span>
            </div>
            <span :class="task.fadingOut ? 'text-gray-400' : 'text-blue-400'" class="font-mono text-sm">{{ formatMs(task.elapsed) }}</span>
          </div>
          <!-- Streaming output for this tool -->
          <div v-if="streamOutput[task.callId || task.tool]"
               class="bg-black rounded p-2 mt-2 max-h-48 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap break-all">{{ streamOutput[task.callId || task.tool] }}</div>
        </div>
      </div>

      <!-- Streaming Output (tools without active task match) -->
      <div v-if="Object.keys(streamOutput).length > 0" class="bg-gray-800 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Output</h3>
        <div v-for="(output, tool) in streamOutput" :key="tool"
             class="bg-black rounded p-2 mb-2">
          <div class="text-gray-400 text-xs mb-1 font-mono break-all">{{ tool }}</div>
          <!-- break-all: one long unbroken token (a URL, a base64 blob, a deep
               path) widened this div past the viewport and scrolled the whole
               Operations page sideways on a phone. -->
          <div class="max-h-64 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap break-all">{{ output }}</div>
        </div>
      </div>

      <!-- Recent History -->
      <div class="bg-gray-800 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Recent ({{ recentHistory.length }})
        </h3>
        <div v-if="recentHistory.length === 0" class="text-gray-500 text-sm py-4 text-center">
          No recent executions
        </div>
        <div v-for="task in recentHistory" :key="task.id"
             class="flex items-center gap-3 py-2 border-b border-gray-700/50 last:border-0">
          <span class="text-lg"><odin-icon :name="statusIcon(task.status)" :size="17" /></span>
          <span class="text-white font-mono text-sm flex-1">{{ task.tool }}</span>
          <span class="text-gray-400 text-xs max-w-md truncate">{{ task.result }}</span>
          <span class="text-gray-500 font-mono text-xs whitespace-nowrap">{{ formatMs(task.elapsed) }}</span>
        </div>
      </div>
    </div>
  `};function td(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ka(e){const t=td(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Tm(e){const t=td(e);return t?t.toLocaleTimeString():"—"}function Cm(e){const t=td(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function dw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function ri(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function sd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Em(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Bu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Am(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function Rm(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Im=Symbol("agent-detail-cancelled"),uw=15e3;function pw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((h,m)=>{o=h,c=m});function u(h,m){r||(r=!0,l!==null&&a(l),l=null,(h?o:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return r||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Im),i==null||i.abort()}}}function Om({state:e,requestDetail:t,timeoutMs:s=uw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const C=pw(L=>t(p,{signal:L}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=C.cancel,v.promise=(async()=>{let L=null,y=null;try{L=await C.promise}catch(g){y=g}L!==Im&&(l!==v||e.detailId!==p||(l=null,!y&&(L===null||typeof L!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=L,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function fw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const hw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Agents</h1>
        <div class="flex gap-2 items-center">
          <label class="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" v-model="autoRefresh" class="ag-checkbox" />
            Auto-refresh
          </label>
          <button @click="fetchAgents()" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Summary stats -->
      <div v-if="agents.length > 0" class="ag-stats-bar">
        <div class="ag-stat">
          <span class="ag-stat-value">{{ agents.length }}</span>
          <span class="ag-stat-label">Total</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-value ag-stat-running">{{ runningCount }}</span>
          <span class="ag-stat-label">Running</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-value ag-stat-completed">{{ completedCount }}</span>
          <span class="ag-stat-label">Completed</span>
        </div>
        <div class="ag-stat">
          <span class="ag-stat-value ag-stat-failed">{{ failedCount }}</span>
          <span class="ag-stat-label">Failed</span>
        </div>
      </div>

      <!-- Status filter -->
      <div v-if="agents.length > 0" class="ag-filter-bar" role="toolbar" aria-label="Filter agents by status">
        <button v-for="f in statusFilters" :key="f.value"
                class="ag-filter-btn" :class="{ 'ag-filter-active': statusFilter === f.value }"
                @click="statusFilter = f.value"
                :aria-pressed="statusFilter === f.value">
          {{ f.label }}
          <span v-if="f.count > 0" class="ag-filter-count">{{ f.count }}</span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading && agents.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchAgents()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="agents.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="bot" :size="23" /></span>
        <span class="empty-state-text">No agents</span>
        <span class="empty-state-hint">Agents are spawned via Discord commands or the chat interface</span>
      </div>

      <!-- Agent cards -->
      <div v-else class="ag-card-grid" role="list" aria-label="Agent list">
        <!-- The list ITEM is the semantic container; the actionable body is a
             button inside it, with Kill as a SIBLING — nesting a control
             inside a control is what the previous markup did. -->
        <div v-for="agent in filteredAgents" :key="agent.id" role="listitem"
             class="ag-card" :class="'ag-card-' + agent.status">
          <div class="ag-card-body ag-card-clickable" role="button" tabindex="0"
               :aria-label="'Open details for agent ' + agent.label"
               @click="openDetail(agent)"
               @keydown.enter.prevent="openDetail(agent)"
               @keydown.space.prevent="openDetail(agent)">
          <!-- Card header -->
          <div class="ag-card-header">
            <div class="ag-card-title-row">
              <span class="ag-status-dot" :class="'ag-dot-' + agent.status" role="img" :aria-label="'Status: ' + agent.status"></span>
              <span class="ag-card-label" :title="agent.label">{{ agent.label }}</span>
              <span class="ag-card-id">{{ agent.id }}</span>
            </div>
            <span class="ag-status-badge" :class="'ag-badge-' + agent.status">{{ agent.status }}</span>
          </div>

          <!-- Model / reasoning provenance — directly under the identity row
               so it sits at the SAME height in every card and reads as a
               property of the agent, not as a tag on its request text. -->
          <!-- Each tooltip reports ITS OWN axis source. Using the summary
               field made the effort chip claim it was requested at spawn
               while correctly displaying an inherited value — the precise
               kind of confident mislabelling this provenance work exists to
               prevent. -->
          <div class="ag-card-policy">
            <span class="ag-policy-chip"
                  :title="displayModelText(agent) + ' — ' + displaySourceLabel(agent.display_model_source || agent.display_source)">{{ displayModelText(agent) }}</span>
            <span class="ag-policy-chip ag-policy-effort"
                  :title="displayEffortText(agent) + ' — ' + displaySourceLabel(agent.display_reasoning_effort_source || agent.display_source)">{{ displayEffortText(agent) }}</span>
          </div>

          <!-- Goal (reserved height, faded overflow — variable goal lengths
               used to push everything below them out of alignment) -->
          <div class="ag-card-goal">{{ agent.goal }}</div>

          <!-- Progress bar (running agents, honest cap only) -->
          <div v-if="agent.status === 'running' && hasProgress(agent)" class="ag-progress-bar"
               role="progressbar" :aria-valuenow="agent.iteration_count"
               :aria-valuemin="0" :aria-valuemax="agent.max_iterations"
               aria-label="Agent iteration progress"
               :aria-valuetext="agent.iteration_count + ' of ' + agent.max_iterations + ' iterations'"
               :title="agent.iteration_count + ' of ' + agent.max_iterations + ' iterations'">
            <div class="ag-progress-fill" :style="{ width: progressPercent(agent) + '%' }"></div>
          </div>

          <!-- Stats row -->
          <div class="ag-card-stats">
            <div class="ag-card-stat">
              <span class="ag-card-stat-label">Iterations</span>
              <span class="ag-card-stat-value">{{ agent.iteration_count }}</span>
            </div>
            <div class="ag-card-stat">
              <span class="ag-card-stat-label">Runtime</span>
              <span class="ag-card-stat-value">{{ formatDuration(agent.runtime_seconds) }}</span>
            </div>
            <div class="ag-card-stat">
              <span class="ag-card-stat-label">Tools</span>
              <span class="ag-card-stat-value">{{ agent.tools_used_count ?? 0 }}</span>
            </div>
          </div>

          <!-- Requester -->
          <div class="ag-card-meta">
            <span v-if="agent.requester_name" class="text-gray-500 text-xs">
              by {{ agent.requester_name }}
            </span>
            <span v-if="agent.created_at" class="text-gray-600 text-xs">
              {{ formatTs(agent.created_at) }}
            </span>
          </div>

          <!-- Result / error (terminal states) -->
          <div v-if="agent.result && agent.status !== 'running'" class="ag-card-result">
            <div class="ag-result-label">Result</div>
            <div class="ag-result-text">{{ agent.result }}</div>
          </div>
          <div v-if="agent.error" class="ag-card-error">
            <div class="ag-result-label">Error</div>
            <div class="ag-result-text text-red-400">{{ agent.error }}</div>
          </div>

          </div><!-- /ag-card-body -->

          <!-- Kill is a SIBLING of the actionable body, never nested inside
               it: a control within a control is neither valid nor operable. -->
          <div v-if="agent.status === 'running'" class="ag-card-actions">
            <button @click="killAgent(agent.id)" class="btn btn-danger text-xs"
                    :disabled="killing === agent.id">
              {{ killing === agent.id ? 'Killing...' : 'Kill Agent' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Agent detail modal -->
      <div v-if="detailId" class="modal-overlay" v-modal-focus @click.self="closeDetail"
           @keyup.escape="closeDetail" tabindex="-1" role="dialog" aria-modal="true"
           aria-labelledby="agent-detail-title">
        <div class="modal-content ag-detail-modal">
          <div class="ag-detail-header">
            <div class="ag-detail-title-row">
              <span v-if="detail" class="ag-status-dot" :class="'ag-dot-' + detail.status"
                    role="img" :aria-label="'Status: ' + detail.status"></span>
              <h2 id="agent-detail-title" class="ag-detail-title">
                {{ detail ? detail.label : 'Agent' }}
              </h2>
              <span v-if="detail" class="ag-status-badge" :class="'ag-badge-' + detail.status">
                {{ detail.status }}
              </span>
              <span class="ag-card-id">{{ detailId }}</span>
            </div>
            <button @click="closeDetail" class="btn btn-ghost text-xs" aria-label="Close details">
              Close
            </button>
          </div>

          <div v-if="detailLoading && !detail" class="skeleton skeleton-row"></div>
          <div v-else-if="detailError" class="error-state" role="alert">
            <p class="text-red-400">{{ detailError }}</p>
          </div>

          <template v-else-if="detail">
            <!-- Metadata grid -->
            <div class="ag-detail-meta">
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Model</span>
                <span class="ag-detail-meta-value">{{ displayModelText(detail) }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Reasoning</span>
                <span class="ag-detail-meta-value">{{ displayEffortText(detail) }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Provider</span>
                <span class="ag-detail-meta-value">{{ detail.last_provider || '—' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Iterations</span>
                <span class="ag-detail-meta-value">
                  {{ detail.iteration_count }}<template v-if="detail.max_iterations"> / {{ detail.max_iterations }}</template>
                </span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Runtime</span>
                <span class="ag-detail-meta-value">{{ formatDuration(detail.runtime_seconds) }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Tools used</span>
                <span class="ag-detail-meta-value">{{ detail.tools_used_count ?? 0 }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Requested by</span>
                <span class="ag-detail-meta-value">{{ detail.requester_name || '—' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Started</span>
                <span class="ag-detail-meta-value">{{ formatTs(detail.created_at) }}</span>
              </div>
              <div v-if="detail.parent_id" class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Parent</span>
                <span class="ag-detail-meta-value">{{ detail.parent_id }}</span>
              </div>
              <div v-if="detail.children_ids && detail.children_ids.length" class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Children</span>
                <span class="ag-detail-meta-value">{{ detail.children_ids.length }}</span>
              </div>
            </div>
            <p class="ag-detail-source">{{ displaySourceLabel(detail.display_source) }}</p>

            <!-- Request -->
            <div class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Request</span>
                <button @click="copyText('goal', detail.goal)" class="btn btn-ghost text-xs">
                  {{ copied === 'goal' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="ag-detail-text">{{ detail.goal }}</pre>
            </div>

            <!-- Result / error -->
            <div v-if="detail.result" class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Result</span>
                <button @click="copyText('result', detail.result)" class="btn btn-ghost text-xs">
                  {{ copied === 'result' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="ag-detail-text">{{ detail.result }}</pre>
            </div>
            <div v-else-if="detail.status === 'running'" class="ag-detail-section">
              <span class="ag-result-label">Result</span>
              <p class="ag-detail-pending">Still running — the result appears here when it completes.</p>
            </div>

            <div v-if="detail.error" class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Error</span>
                <button @click="copyText('error', detail.error)" class="btn btn-ghost text-xs">
                  {{ copied === 'error' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="ag-detail-text text-red-400">{{ detail.error }}</pre>
            </div>
          </template>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f(!0),i=f("all");let l=!1;const r=J(()=>e.value.filter(O=>O.status==="running").length),o=J(()=>e.value.filter(O=>O.status==="completed").length),c=J(()=>e.value.filter(O=>["failed","timeout","killed"].includes(O.status)).length),d=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(O=>["failed","timeout","killed"].includes(O.status)):e.value.filter(O=>O.status===i.value));function p(O){const U=Number(O.max_iterations)||0;return U<=0?0:Math.min(100,Math.round(O.iteration_count/U*100))}function h(O){return(Number(O.max_iterations)||0)>0}function m(O,U){return O?O==="N/A"?"N/A":U==="current_inheritance"?`inherit (currently ${O})`:O:"unknown"}function v(O){return m(O.display_model,O.display_model_source||O.display_source)}function C(O){return m(O.display_reasoning_effort,O.display_reasoning_effort_source||O.display_source)}function L(O){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[O]||""}const y=f(null),g=f(null),b=f(!1),S=f(null),k=f(""),T=Om({state:{get detail(){return y.value},set detail(O){y.value=O},get detailId(){return g.value},set detailId(O){g.value=O},get detailLoading(){return b.value},set detailLoading(O){b.value=O},get detailError(){return S.value},set detailError(O){S.value=O}},requestDetail:(O,{signal:U})=>W.get(`/api/agents/${encodeURIComponent(O)}`,{signal:U})});async function _(O){k.value="",await T.open(O.id)}function D(){T.close(),k.value=""}async function E(){await T.refresh()}async function R(O,U){try{await navigator.clipboard.writeText(U||""),k.value=O,setTimeout(()=>{k.value===O&&(k.value="")},1500)}catch{Re.error("Copy failed")}}async function $(O=!1){O=O===!0,O||(t.value=!0);try{const U=await W.get("/api/agents");e.value=Array.isArray(U)?U:[],s.value=null}catch(U){O||(s.value=U.message)}O||(t.value=!1)}async function V(O){const U=e.value.find(q=>q.id===O);if(await Xt({title:"Kill agent",message:`Kill agent "${(U==null?void 0:U.label)||O}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=O;try{await W.del(`/api/agents/${encodeURIComponent(O)}`),Re.success("Agent killed"),await $()}catch(q){Re.error(q.message||"Failed to kill agent")}n.value=null}}const oe=fw({isEnabled:()=>a.value&&l,refreshList:()=>$(!0),hasOpenDetail:()=>!!g.value,refreshDetail:E});function P(){oe.start()}function N(){oe.stop()}return os(a,()=>oe.sync()),We(()=>{l=!0,$(),P()}),us(()=>{l=!0,$(!0),P()}),ts(()=>{l=!1,N()}),mt(()=>{l=!1,N(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ka,formatDuration:ri,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:C,displaySourceLabel:L,detail:y,detailId:g,detailLoading:b,detailError:S,copied:k,openDetail:_,closeDetail:D,copyText:R,fetchAgents:$,killAgent:V,startAutoRefresh:P,stopAutoRefresh:N}}},mw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Autonomous Loops</h1>
        <div class="flex gap-2">
          <button @click="showCreate = !showCreate" class="btn btn-primary text-xs">
            {{ showCreate ? 'Cancel' : 'Start Loop' }}
          </button>
          <button @click="fetchLoops()" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Create form -->
      <div v-if="showCreate" class="hm-card mb-4">
        <h2 class="text-sm font-medium mb-3">Start New Loop</h2>

        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Goal
          <textarea v-model="form.goal" class="hm-input" rows="3"
                    placeholder="What should this loop accomplish? e.g. Monitor disk usage and warn if above 80%"></textarea>
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Interval (seconds)
            <input v-model.number="form.interval_seconds" type="number" class="hm-input"
                   min="10" placeholder="60" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Mode
            <select v-model="form.mode" class="hm-input">
              <option value="notify">Notify (check + report)</option>
              <option value="act">Act (check + take actions + report)</option>
              <option value="silent">Silent (only report if notable)</option>
            </select>
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Max Iterations
            <input v-model.number="form.max_iterations" type="number" class="hm-input"
                   min="1" placeholder="50" />
            </label>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Stop Condition (optional)
            <input v-model="form.stop_condition" type="text" class="hm-input"
                   placeholder="e.g. when disk is below 50%" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Channel ID
            <input v-model="form.channel_id" type="text" class="hm-input"
                   placeholder="Discord channel ID" />
            </label>
          </div>
        </div>

        <div v-if="createError" class="mb-3 text-red-400 text-sm">{{ createError }}</div>

        <button @click="doCreate" class="btn btn-primary text-xs" :disabled="creating">
          {{ creating ? 'Starting...' : 'Start Loop' }}
        </button>
      </div>

      <!-- Loop list -->
      <div v-if="loading && loops.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchLoops()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="loops.length === 0 && !showCreate" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="rotate" :size="23" /></span>
        <span class="empty-state-text">No active loops</span>
        <span class="empty-state-hint">Click "Start Loop" to create an autonomous recurring task</span>
      </div>
      <div v-else-if="loops.length > 0">
        <!-- Summary -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ loops.length }}</div>
            <div class="text-gray-400 text-xs">Total Loops</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold text-green-400">{{ runningCount }}</div>
            <div class="text-gray-400 text-xs">Running</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ totalIterations }}</div>
            <div class="text-gray-400 text-xs">Total Iterations</div>
          </div>
        </div>

        <!-- Loop cards -->
        <div class="space-y-3">
          <div v-for="loop in loops" :key="loop.id" class="hm-card loop-card">
            <div class="loop-card-main" role="button" tabindex="0"
                 :aria-label="'Open details for loop ' + loop.id"
                 @click="openDetail(loop)"
                 @keydown.enter.prevent="openDetail(loop)"
                 @keydown.space.prevent="openDetail(loop)">
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="loop-status-dot" :class="statusDotClass(loop.status)"></span>
                <span class="badge" :class="statusBadge(loop.status)">{{ loop.status || 'running' }}</span>
                <span class="badge" :class="modeBadge(loop.mode)">{{ loop.mode }}</span>
                <span class="font-mono text-xs text-gray-500">{{ loop.id }}</span>
              </div>
            </div>

            <div class="loop-card-goal">{{ loop.goal }}</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-400">
              <div>
                <span class="text-gray-500">Interval:</span>
                {{ formatDuration(loop.interval_seconds) }}
              </div>
              <div>
                <span class="text-gray-500">Iterations:</span>
                {{ loop.iteration_count }} / {{ loop.max_iterations }}
                <div class="mt-1 w-full bg-gray-800 rounded-full h-1">
                  <div class="bg-indigo-500 h-1 rounded-full transition-all duration-300"
                       :style="{ width: Math.min(100, (loop.iteration_count / loop.max_iterations) * 100) + '%' }"></div>
                </div>
              </div>
              <div>
                <span class="text-gray-500">Last trigger:</span>
                {{ loop.last_trigger_age_seconds == null ? 'pending' : formatDuration(loop.last_trigger_age_seconds) + ' ago' }}
              </div>
              <div>
                <span class="text-gray-500">Created:</span>
                {{ formatAge(loop.created_at) }}
              </div>
            </div>

            <div v-if="loop.stop_condition" class="mt-2 text-xs text-gray-500">
              <span class="text-gray-600">Stop when:</span> {{ loop.stop_condition }}
            </div>

            <div v-if="loop.requester_name" class="mt-1 text-xs text-gray-600">
              Started by {{ loop.requester_name }}
            </div>

            <div v-if="loop.iteration_history && loop.iteration_history.length" class="loop-card-preview">
              <span class="ag-result-label">Latest context preview</span>
              <span>{{ loop.iteration_history[loop.iteration_history.length - 1] }}</span>
            </div>
            </div><!-- /loop-card-main -->
            <div class="loop-card-actions">
              <button @click="doRestart(loop.id)" class="btn btn-ghost text-xs"
                      :disabled="restartingId === loop.id"
                      title="Restart loop with same config">
                {{ restartingId === loop.id ? 'Restarting...' : 'Restart' }}
              </button>
              <button v-if="loop.status === 'running'"
                      @click="doStop(loop.id)" class="btn btn-danger text-xs"
                      :disabled="stoppingId === loop.id">
                {{ stoppingId === loop.id ? 'Stopping...' : 'Stop' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Durable loop detail. The manager deque is prompt context only;
           iteration records below come from trajectory JSONL. -->
      <div v-if="detailId" class="modal-overlay" v-modal-focus @click.self="closeDetail"
           @keyup.escape="closeDetail" tabindex="-1" role="dialog" aria-modal="true"
           aria-labelledby="loop-detail-title">
        <div class="modal-content ag-detail-modal loop-detail-modal">
          <div class="ag-detail-header">
            <div class="ag-detail-title-row">
              <span v-if="detail" class="loop-status-dot" :class="statusDotClass(detail.status)"></span>
              <h2 id="loop-detail-title" class="ag-detail-title">Loop {{ detailId }}</h2>
              <span v-if="detail" class="badge" :class="statusBadge(detail.status)">{{ detail.status }}</span>
              <span v-if="detail" class="badge" :class="modeBadge(detail.mode)">{{ detail.mode }}</span>
            </div>
            <button @click="closeDetail" class="btn btn-ghost text-xs" aria-label="Close loop details">Close</button>
          </div>

          <div v-if="detailLoading && !detail" class="skeleton skeleton-row"></div>
          <div v-else-if="detailError" class="error-state" role="alert">
            <p class="text-red-400">{{ detailError }}</p>
          </div>
          <template v-else-if="detail">
            <div class="ag-detail-meta">
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Iterations</span><span class="ag-detail-meta-value">{{ detail.iteration_count }} / {{ detail.max_iterations }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Interval</span><span class="ag-detail-meta-value">{{ formatDuration(detail.interval_seconds) }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Channel</span><span class="ag-detail-meta-value">{{ detail.channel_id || '—' }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Requested by</span><span class="ag-detail-meta-value">{{ detail.requester_name || '—' }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Started</span><span class="ag-detail-meta-value">{{ formatTs(detail.created_at) }}</span></div>
              <div class="ag-detail-meta-item"><span class="ag-detail-meta-label">Last trigger</span><span class="ag-detail-meta-value">{{ detail.last_trigger_age_seconds == null ? 'pending' : formatDuration(detail.last_trigger_age_seconds) + ' ago' }}</span></div>
            </div>

            <div class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Goal</span>
                <button @click="copyText('goal', detail.goal)" class="btn btn-ghost text-xs">{{ copied === 'goal' ? 'Copied' : 'Copy' }}</button>
              </div>
              <pre class="ag-detail-text loop-detail-goal">{{ detail.goal }}</pre>
            </div>

            <div v-if="detail.stop_condition" class="ag-detail-section">
              <div class="ag-detail-section-head">
                <span class="ag-result-label">Stop condition</span>
                <button @click="copyText('stop', detail.stop_condition)" class="btn btn-ghost text-xs">{{ copied === 'stop' ? 'Copied' : 'Copy' }}</button>
              </div>
              <pre class="ag-detail-text loop-detail-condition">{{ detail.stop_condition }}</pre>
            </div>

            <div class="loop-detail-history-head">
              <div>
                <h3>Iteration history</h3>
                <p v-if="detail.history_available" class="ag-detail-source">Durable trajectory records, newest first.</p>
                <p v-else class="ag-detail-source">Trajectory history is unavailable. Showing only the manager's bounded context previews.</p>
              </div>
              <span class="ag-card-id">{{ detail.iterations.length }} record{{ detail.iterations.length === 1 ? '' : 's' }}</span>
            </div>

            <div v-if="detail.history_truncated" class="loop-detail-notice">Showing the newest {{ detail.history_limit }} records.</div>
            <div v-if="detail.iterations.length" class="loop-detail-iterations">
              <article v-for="turn in detail.iterations" :key="turn.message_id || turn.timestamp" class="loop-detail-iteration">
                <header class="loop-detail-iteration-head">
                  <div>
                    <strong>Iteration {{ turn.loop_iteration || '?' }}</strong>
                    <span class="ag-detail-source">{{ formatTs(turn.timestamp) }}</span>
                  </div>
                  <span v-if="turn.is_error" class="badge badge-danger">error</span>
                </header>
                <div class="loop-detail-turn-meta">
                  <span>{{ turn.tools_used?.length || 0 }} tools</span>
                  <span>{{ formatTokens((turn.total_input_tokens || 0) + (turn.total_output_tokens || 0)) }} tokens</span>
                  <span v-if="turn.total_duration_ms > 0">{{ formatDuration(turn.total_duration_ms / 1000) }}</span>
                  <span><template v-if="turn.provider">{{ turn.provider }} / </template>{{ turn.model || 'unknown model' }}<template v-if="turn.reasoning_effort"> / {{ turn.reasoning_effort }}</template></span>
                </div>
                <div class="ag-detail-section-head">
                  <span class="ag-result-label">Response</span>
                  <button @click="copyText('turn-' + turn.loop_iteration, turn.final_response)" class="btn btn-ghost text-xs">{{ copied === 'turn-' + turn.loop_iteration ? 'Copied' : 'Copy' }}</button>
                </div>
                <pre class="ag-detail-text loop-detail-response" :class="{ 'text-red-400': turn.is_error }">{{ turn.final_response || '(no output)' }}</pre>
                <div v-if="turn.tools_used?.length" class="loop-detail-tools" aria-label="Tools used">
                  <span v-for="tool in turn.tools_used" :key="tool" class="ag-tool-chip">{{ tool }}</span>
                </div>
              </article>
            </div>
            <p v-else class="ag-detail-pending">No durable iteration record yet.</p>

            <details v-if="detail.context_history.length" class="loop-context-details">
              <summary>Runtime context buffer ({{ detail.context_history.length }})</summary>
              <p class="ag-detail-source">Bounded, write-truncated previews used to prompt the next iteration. This may include orchestration failures that produced no trajectory record; it is not an audit log.</p>
              <div class="loop-context-list">
                <pre v-for="(entry, i) in detail.context_history" :key="i" class="ag-detail-text loop-context-entry">{{ entry }}</pre>
              </div>
            </details>
          </template>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!1),a=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),r=f(null),o=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const C=Om({state:{get detail(){return c.value},set detail(N){c.value=N},get detailId(){return d.value},set detailId(N){d.value=N},get detailLoading(){return u.value},set detailLoading(N){u.value=N},get detailError(){return p.value},set detailError(N){p.value=N}},detailLabel:"Loop detail",requestDetail:(N,{signal:O})=>W.get(`/api/loops/${encodeURIComponent(N)}?limit=100`,{signal:O})});async function L(N){h.value="",await C.open(N.id)}function y(){C.close(),h.value=""}async function g(N,O){try{await navigator.clipboard.writeText(O||""),h.value=N,setTimeout(()=>{h.value===N&&(h.value="")},1500)}catch{Re.error("Copy failed")}}const b=J(()=>e.value.reduce((N,O)=>N+(O.iteration_count||0),0)),S=J(()=>e.value.filter(N=>N.status==="running").length);function k(N){return N==="running"?"loop-status-running":N==="error"?"loop-status-error":"loop-status-stopped"}function A(N){return N==="running"?"badge-success":N==="error"?"badge-danger":N==="completed"?"badge-info":"badge-warning"}function T(N){return N==="act"?"badge-warning":N==="silent"?"badge-info":"badge-success"}async function _(N=!1){N=N===!0,N||(t.value=!0);try{const O=await W.get("/api/loops");e.value=Array.isArray(O)?O:[],s.value=null}catch(O){N||(s.value=O.message)}N||(t.value=!1)}async function D(){l.value=null;const N=a.value;if(!N.goal.trim()){l.value="Goal is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}const O={goal:N.goal.trim(),channel_id:N.channel_id.trim(),interval_seconds:N.interval_seconds||60,mode:N.mode,max_iterations:N.max_iterations||50};N.stop_condition.trim()&&(O.stop_condition=N.stop_condition.trim()),i.value=!0;try{const U=await W.post("/api/loops",O);Re.success(`Loop started: ${U.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await _()}catch(U){l.value=U.message}i.value=!1}async function E(N){if(await Xt({title:"Stop loop",message:`Stop loop ${N}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=N;try{await W.del(`/api/loops/${encodeURIComponent(N)}`),Re.success("Loop stopped"),await _()}catch(U){Re.error(U.message||"Failed to stop loop")}r.value=null}}async function R(N){o.value=N;try{await W.post(`/api/loops/${encodeURIComponent(N)}/restart`),Re.success("Loop restarted"),await _()}catch(O){Re.error(O.message||"Failed to restart loop")}o.value=null}function $(N){m&&N.payload&&(N.payload.loop_id||N.payload.type==="loop")&&(_(!0),d.value&&C.refresh())}let V=null;function oe(){V!==null&&clearInterval(V),V=null}function P(){oe(),m&&(V=setInterval(()=>{_(!0),d.value&&C.refresh()},5e3))}return We(()=>{m=!0,_(),Ye.subscribe("events",$),P()}),us(()=>{m=!0,_(!0),P()}),ts(()=>{m=!1,oe()}),mt(()=>{m=!1,Ye.unsubscribe("events",$),oe(),C.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:S,statusDotClass:k,statusBadge:A,modeBadge:T,formatAge:Cm,formatDuration:ri,formatTs:ka,formatTokens:Rm,openDetail:L,closeDetail:y,copyText:g,fetchLoops:_,doCreate:D,doStop:E,doRestart:R}}},vw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 class="text-xl font-semibold">Processes</h1>
          <p class="page-lede">Inspect managed command lifecycles, output, and exit state.</p>
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <span class="toggle-switch" style="width:28px; height:16px;">
              <input type="checkbox" v-model="autoRefresh" />
              <span class="toggle-slider" style="border-radius:8px;">
                <span style="width:10px; height:10px; left:3px; bottom:3px;"></span>
              </span>
            </span>
            Auto-refresh
            <span v-if="autoRefresh" class="text-green-400">(5s)</span>
          </label>
          <button @click="fetchProcesses()" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div v-if="loading && processes.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchProcesses()" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="processes.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="terminal" :size="23" /></span>
        <span class="empty-state-text">No background processes</span>
        <span class="empty-state-hint">Processes appear when Odin runs long-running commands</span>
      </div>
      <div v-else>
        <!-- Summary -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ processes.length }}</div>
            <div class="text-gray-400 text-xs">Total</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold" :class="runningCount > 0 ? 'text-green-400' : ''">{{ runningCount }}</div>
            <div class="text-gray-400 text-xs">Running</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ completedCount }}</div>
            <div class="text-gray-400 text-xs">Completed</div>
          </div>
        </div>

        <!-- Process cards -->
        <div class="space-y-3">
          <div v-for="p in processes" :key="p.pid" class="hm-card">
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="loop-status-dot" :class="procStatusDot(p.status)"></span>
                <span class="font-mono text-sm font-semibold">PID {{ p.pid }}</span>
                <span class="badge" :class="statusBadge(p.status)">{{ p.status }}</span>
                <span v-if="p.exit_code !== null && p.exit_code !== undefined"
                      class="text-xs text-gray-500">(exit {{ p.exit_code }})</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500">{{ formatDuration(p.uptime_seconds) }}</span>
                <button v-if="p.status === 'running'"
                        @click="doKill(p.pid)"
                        class="btn btn-danger text-xs"
                        :disabled="killingPid === p.pid">
                  {{ killingPid === p.pid ? 'Killing...' : 'Kill' }}
                </button>
              </div>
            </div>

            <div class="text-sm font-mono text-gray-300 mb-2" :title="p.command">
              {{ p.command }}
            </div>

            <div class="text-xs text-gray-500 mb-1">
              <span class="text-gray-600">Host:</span> {{ p.host || 'local' }}
            </div>

            <!-- Output preview (last 3 lines) -->
            <div v-if="p.output_preview && p.output_preview.length > 0" class="mt-2">
              <div class="text-xs text-gray-600 mb-1">Recent output:</div>
              <pre class="process-output-preview">{{ p.output_preview.join('\\n') }}</pre>
            </div>
          </div>
        </div>
      </div>

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!0);let a=null;const i=f(null),l=J(()=>e.value.filter(y=>y.status==="running").length),r=J(()=>e.value.filter(y=>y.status!=="running").length);function o(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await W.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}os(n,y=>{y?u():p()});async function h(y){if(await Xt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await W.del(`/api/processes/${y}`),Re.success(`Process ${y} killed`),await d()}catch(b){Re.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let v=!1;function C(){v||(v=!0,d(),Ye.subscribe("events",m),u())}function L(){v&&(v=!1,Ye.unsubscribe("events",m),p())}return We(C),us(C),ts(L),mt(L),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:ri,fetchProcesses:d,doKill:h}}},gw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Hu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function bw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function yw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function xw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=gw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const C of new Set([p,h])){const L=new Date(u+C*6e4);bw(L,c)===d&&(m.some(y=>y.getTime()===L.getTime())||m.push(L))}if(m.sort((C,L)=>C.getTime()-L.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(C=>({instant:C,offset:yw(C),iso:C.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const _w={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 class="text-xl font-semibold">Schedules</h1>
          <p class="page-lede">Create, inspect, and run recurring or one-time automation.</p>
        </div>
        <div class="flex gap-2">
          <button @click="showCreate = !showCreate" class="btn btn-primary text-xs">
            {{ showCreate ? 'Cancel' : 'New Schedule' }}
          </button>
          <button @click="fetchSchedules" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Create form -->
      <div v-if="showCreate" class="hm-card form-panel mb-4">
        <h2 class="text-sm font-medium mb-3">Create Schedule</h2>

        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Description
          <input v-model="form.description" type="text" class="hm-input"
                 placeholder="e.g. Daily disk check" />
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Action Type
            <select v-model="form.action" class="hm-input">
              <option value="reminder">Reminder</option>
              <option value="check">Check (tool call)</option>
              <option value="workflow">Workflow (multi-step)</option>
              <option value="digest">Digest</option>
            </select>
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Channel ID
            <input v-model="form.channel_id" type="text" class="hm-input"
                   placeholder="Discord channel ID" />
            </label>
          </div>
        </div>

        <p class="text-xs text-gray-500 mb-2">Choose one timing mode. Entering a Cron expression clears One-Time, and entering a One-Time value clears Cron.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <span class="text-gray-400 text-xs block mb-1">Cron Expression</span>
            <div class="flex gap-2">
              <input v-model="form.cron" type="text" class="hm-input"
                     placeholder="e.g. 0 */6 * * *" @input="onCronInput($event.target.value)" />
              <button @click="validateCron" class="btn btn-ghost text-xs whitespace-nowrap"
                      :disabled="!form.cron.trim() || validatingCron">
                {{ validatingCron ? '...' : 'Validate' }}
              </button>
            </div>
            <!-- Cron helper -->
            <div v-if="cronResult" class="mt-2 text-xs">
              <div v-if="cronResult.valid" class="text-green-400">
                Valid. Next runs:
                <div v-for="(run, i) in cronResult.next_runs" :key="i" class="text-gray-400 ml-2">
                  {{ formatTs(run) }} ({{ formatFuture(run) }})
                </div>
              </div>
              <div v-else class="text-red-400">{{ cronResult.error }}</div>
            </div>
            <!-- Quick cron presets -->
            <div class="flex flex-wrap gap-1 mt-2">
              <button v-for="p in cronPresets" :key="p.expr"
                      @click="form.cron = p.expr; onCronInput()"
                      class="cron-preset-btn">
                {{ p.label }}
              </button>
            </div>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">One-Time (your local time)
            <input v-model="form.run_at" type="datetime-local" step="1" class="hm-input" @input="onRunAtInput($event.target.value)" />
            </label>
            <p v-if="runAtAnalysis.state === 'nonexistent'" class="text-xs text-red-400 mt-1" role="alert">
              That local time does not exist — clocks skip it when daylight saving begins. Choose another time.
            </p>
            <div v-else-if="runAtAnalysis.state === 'ambiguous'" class="mt-1">
              <p class="text-xs text-amber-400" role="alert">
                That local time happens twice when daylight saving ends. Choose which one:
              </p>
              <select v-model="runAtOccurrence" class="hm-select text-xs mt-1">
                <option :value="null">Choose an occurrence…</option>
                <option v-for="(opt, i) in runAtAnalysis.options" :key="opt.iso" :value="i">
                  {{ opt.offset }} — {{ opt.iso }}
                </option>
              </select>
            </div>
            <p v-else-if="runAtAnalysis.state === 'invalid'" class="text-xs text-red-400 mt-1" role="alert">
              That is not a valid date and time.
            </p>
            <p v-if="runAtUtcPreview" class="text-xs text-gray-500 mt-1">
              Fires at {{ runAtUtcPreview }}
            </p>
          </div>
        </div>

        <div v-if="form.action === 'reminder'" class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Message
          <input v-model="form.message" type="text" class="hm-input"
                 placeholder="Reminder message..." />
          </label>
        </div>

        <div v-if="form.action === 'check'" class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool Name
            <input v-model="form.tool_name" type="text" class="hm-input"
                   placeholder="e.g. run_command" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool Input (JSON)
            <input v-model="form.tool_input_str" type="text" class="hm-input"
                   placeholder='e.g. {"host":"server1"}' />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Report Format
            <select v-model="form.report_format" class="hm-input">
              <option value="">Plain text</option>
              <option value="paginated_embed_v1">Paginated embeds (paginated_embed_v1)</option>
            </select>
            </label>
            <p class="text-xs text-gray-500 mt-1">
              Requires the command to emit the generic paginated JSON contract.
            </p>
          </div>
        </div>

        <div v-if="createError" class="mb-3 text-red-400 text-sm">{{ createError }}</div>

        <button @click="doCreate" class="btn btn-primary text-xs" :disabled="creating">
          {{ creating ? 'Creating...' : 'Create' }}
        </button>
      </div>

      <!-- Schedule list -->
      <div v-if="loading && schedules.length === 0" class="space-y-2">
        <div v-for="n in 4" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="22" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchSchedules" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="schedules.length === 0 && !showCreate" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="calendar" :size="23" /></span>
        <span class="empty-state-text">No scheduled tasks</span>
        <span class="empty-state-hint">Click "New Schedule" to set up automated checks or reminders</span>
      </div>
      <div v-else-if="schedules.length > 0">
        <!-- Summary cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ schedules.length }}</div>
            <div class="text-gray-400 text-xs">Total</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ cronCount }}</div>
            <div class="text-gray-400 text-xs">Recurring</div>
          </div>
          <div class="hm-card text-center">
            <div class="text-2xl font-bold">{{ oneTimeCount }}</div>
            <div class="text-gray-400 text-xs">One-Time</div>
          </div>
          <div v-if="webhookCount > 0" class="hm-card text-center">
            <div class="text-2xl font-bold">{{ webhookCount }}</div>
            <div class="text-gray-400 text-xs">Webhook</div>
          </div>
          <div v-if="pausedCount > 0" class="hm-card text-center">
            <div class="text-2xl font-bold text-yellow-400">{{ pausedCount }}</div>
            <div class="text-gray-400 text-xs">Paused</div>
          </div>
          <div v-if="failingCount > 0" class="hm-card text-center">
            <div class="text-2xl font-bold text-red-400">{{ failingCount }}</div>
            <div class="text-gray-400 text-xs">Failing</div>
          </div>
        </div>

        <div class="table-responsive">
        <table class="hm-table">
          <thead>
            <tr>
              <th></th>
              <th>Description</th>
              <th>Type</th>
              <th class="mobile-hide">Schedule</th>
              <th class="mobile-hide">Last Run</th>
              <th class="mobile-hide">Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="s in schedules" :key="s.id">
            <tr :class="{ 'opacity-50': s.paused }">
              <td class="text-center" style="width:40px;">
                <button class="row-expander" @click="toggleExpand(s.id)" :aria-expanded="expandedId === s.id" :aria-label="(expandedId === s.id ? 'Collapse ' : 'Expand ') + s.description">
                  <odin-icon :name="expandedId === s.id ? 'chevronUp' : 'chevronDown'" :size="15" />
                </button>
              </td>
              <td class="text-sm">
                {{ s.description }}
                <span v-if="s.consecutive_failures > 0" class="ml-1 text-red-400 text-xs font-mono">
                  ({{ s.consecutive_failures }} fail{{ s.consecutive_failures > 1 ? 's' : '' }})
                </span>
              </td>
              <td>
                <span v-if="s.paused" class="badge badge-danger mr-1">paused</span>
                <span v-if="s.retry_at" class="badge badge-warning mr-1">retrying</span>
                <span v-if="s.trigger" class="badge badge-warning">webhook</span>
                <span v-else-if="s.one_time" class="badge badge-info">one-time</span>
                <span v-else class="badge badge-success">cron</span>
              </td>
              <td class="text-sm text-gray-400 font-mono mobile-hide">
                <span v-if="s.cron">{{ s.cron }}</span>
                <span v-else-if="s.run_at">{{ formatTs(s.run_at) }}</span>
                <span v-else-if="s.trigger">{{ s.trigger.source || 'webhook' }}</span>
                <span v-else>-</span>
              </td>
              <td class="text-sm mobile-hide">
                <span v-if="s.last_run" class="text-gray-300">{{ formatAge(s.last_run) }}</span>
                <span v-else class="text-gray-600">never</span>
              </td>
              <td class="text-sm mobile-hide">
                <span v-if="s.last_error" class="text-red-400" :title="s.last_error">failed</span>
                <span v-else-if="s.last_run" class="text-green-400">ok</span>
                <span v-else class="text-gray-600">-</span>
              </td>
              <td class="whitespace-nowrap">
                <div class="flex gap-1">
                  <button @click="doTogglePause(s)" class="btn btn-ghost text-xs"
                          :disabled="togglingId === s.id"
                          :title="s.paused ? 'Resume this schedule' : 'Pause this schedule'">
                    {{ togglingId === s.id ? '...' : (s.paused ? 'Resume' : 'Pause') }}
                  </button>
                  <button @click="doRunNow(s.id)" class="btn btn-ghost text-xs"
                          :disabled="runningId === s.id"
                          title="Trigger this schedule immediately">
                    {{ runningId === s.id ? '...' : 'Run' }}
                  </button>
                  <button v-if="s.consecutive_failures > 0"
                          @click="doResetFailures(s.id)" class="btn btn-ghost text-xs"
                          :disabled="resettingId === s.id"
                          title="Reset failure counters and pending retries">
                    {{ resettingId === s.id ? '...' : 'Reset' }}
                  </button>
                  <button @click="doDelete(s.id)" class="btn btn-danger text-xs"
                          :disabled="deletingId === s.id">
                    {{ deletingId === s.id ? '...' : 'Del' }}
                  </button>
                </div>
              </td>
            </tr>
            <!-- Expanded detail row -->
            <tr v-if="expandedId === s.id">
              <td :colspan="7" class="p-0">
                <div class="p-4" style="background: rgba(255,255,255,0.02);">
                  <!-- Failure detail -->
                  <div v-if="s.last_error" class="mb-3 p-2 rounded" style="background: rgba(239,68,68,0.1);">
                    <div class="text-xs text-red-400 font-medium mb-1">Last Error</div>
                    <div class="text-xs text-red-300 font-mono">{{ s.last_error }}</div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ s.last_error_at ? formatAge(s.last_error_at) : '' }}
                      <span v-if="s.retry_at"> · Next retry: {{ formatFuture(s.retry_at) }}</span>
                      <span v-if="s.retry_count > 0"> · Retry {{ s.retry_count }}/{{ s.max_retries }}</span>
                    </div>
                  </div>

                  <!-- Schedule details: every cell is label-above-value so the
                       band stays uniform whether the value is text or the
                       report select (audit 4.5 — mixed inline/stacked cells
                       made the first detail row ragged). -->
                  <div class="sched-detail-grid mb-3 text-xs">
                    <div><span class="sched-detail-label">ID</span><span class="font-mono">{{ s.id }}</span></div>
                    <div><span class="sched-detail-label">Action</span><span>{{ s.action }}</span></div>
                    <div v-if="s.action === 'check'">
                      <label class="sched-detail-label" :for="'report-format-' + s.id">Report</label>
                      <select :id="'report-format-' + s.id"
                              :value="s.report_format || ''"
                              @change="doUpdateReportFormat(s, $event.target.value)"
                              class="hm-input text-xs"
                              :disabled="reportUpdatingId === s.id">
                        <option value="">Plain text</option>
                        <option value="paginated_embed_v1">Paginated embeds</option>
                      </select>
                    </div>
                    <div v-else><span class="sched-detail-label">Report</span><span>plain text</span></div>
                    <div><span class="sched-detail-label">Next run</span>
                      <span v-if="s.next_run">{{ formatFuture(s.next_run) }}</span>
                      <span v-else>on trigger</span>
                    </div>
                    <div><span class="sched-detail-label">Created</span><span>{{ formatTs(s.created_at) }}</span></div>
                  </div>

                  <!-- Execution history -->
                  <div class="text-xs font-medium text-gray-400 mb-2">Execution History</div>
                  <div v-if="historyLoading" class="text-xs text-gray-500">Loading...</div>
                  <div v-else-if="historyError" class="text-xs text-red-400" role="alert">{{ historyError }}</div>
                  <div v-else-if="history.length === 0" class="text-xs text-gray-600">No execution history yet.</div>
                  <table v-else class="hm-table text-xs">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(h, i) in history" :key="i">
                        <td>{{ formatAge(h.timestamp) }}</td>
                        <td>
                          <span v-if="h.status === 'success'" class="text-green-400">success</span>
                          <span v-else class="text-red-400">failure</span>
                        </td>
                        <td class="font-mono">{{ formatMs(h.duration_ms) }}</td>
                        <td class="text-red-300 font-mono" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">
                          {{ h.error || '-' }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
        </div>
      </div>

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!1),a=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=f(!1),l=f(null),r=f(null),o=J(()=>xw(a.value.run_at));os(()=>a.value.run_at,()=>{r.value=null});const c=J(()=>{var re;const H=o.value;return H.state==="ok"?H.instant:H.state==="ambiguous"&&r.value!==null&&((re=H.options[r.value])==null?void 0:re.instant)||null}),d=J(()=>{const H=c.value;return H?`${H.toLocaleString()} local — ${H.toISOString()} UTC`:""}),u=f(null),p=f(!1),h=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=f(null),v=f(null),C=f(null),L=f(null),y=f(null),g=f(null),b=f([]),S=f(!1),k=f("");let A=0;const T=J(()=>e.value.filter(H=>H.cron&&!H.one_time).length),_=J(()=>e.value.filter(H=>H.one_time).length),D=J(()=>e.value.filter(H=>H.trigger).length),E=J(()=>e.value.filter(H=>H.paused).length),R=J(()=>e.value.filter(H=>H.consecutive_failures>0).length);function $(H){if(!H)return"-";const re=Date.now(),Le=(new Date(H).getTime()-re)/1e3;if(Le<0)return"overdue";if(Le<60)return"in < 1 min";if(Le<3600)return`in ${Math.floor(Le/60)} min`;if(Le<86400){const M=Math.floor(Le/3600),B=Math.floor(Le%3600/60);return B>0?`in ${M}h ${B}m`:`in ${M}h`}const x=Math.floor(Le/86400);return`in ${x} day${x!==1?"s":""}`}function V(H){return H==null?"-":H<1e3?`${H}ms`:H<6e4?`${(H/1e3).toFixed(1)}s`:ri(H/1e3)}function oe(H=a.value.cron){a.value.cron=H,Hu(a.value,"cron"),u.value=null}function P(H=a.value.run_at){a.value.run_at=H,Hu(a.value,"run_at"),u.value=null}async function N(){const H=a.value.cron.trim();if(H){p.value=!0;try{u.value=await W.post("/api/schedules/validate-cron",{expression:H})}catch(re){u.value={valid:!1,error:re.message}}p.value=!1}}async function O(){t.value=!0,s.value=null;try{e.value=await W.get("/api/schedules")}catch(H){s.value=H.message}t.value=!1}async function U(H){if(g.value===H){g.value=null,b.value=[];return}g.value=H,S.value=!0,b.value=[];const re=++A;try{const ue=await W.get(`/api/schedules/${encodeURIComponent(H)}/history?limit=10`);if(re!==A||g.value!==H)return;b.value=ue,k.value=""}catch(ue){if(re!==A||g.value!==H)return;b.value=[],k.value=ue.message||"Failed to load execution history"}re===A&&(S.value=!1)}async function K(){l.value=null;const H=a.value;if(!H.description.trim()){l.value="Description is required";return}if(!H.channel_id.trim()){l.value="Channel ID is required";return}if(!H.cron.trim()&&!H.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(H.cron.trim()&&H.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const re={description:H.description.trim(),action:H.action,channel_id:H.channel_id.trim()};if(H.cron.trim()&&(re.cron=H.cron.trim()),H.run_at.trim()){const ue=o.value;if(ue.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){l.value="One-time run time is not a valid date";return}const Le=c.value;if(ue.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Le){l.value="One-time run time could not be resolved";return}re.run_at=Le.toISOString()}if(H.action==="reminder"&&H.message.trim()&&(re.message=H.message.trim()),H.action==="check"&&(H.tool_name.trim()&&(re.tool_name=H.tool_name.trim()),H.report_format&&(re.report_format=H.report_format),H.tool_input_str.trim()))try{re.tool_input=JSON.parse(H.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await W.post("/api/schedules",re),Re.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await O()}catch(ue){l.value=ue.message}i.value=!1}async function q(H){m.value=H;try{const re=await W.post(`/api/schedules/${encodeURIComponent(H)}/run`);if(re.status==="failure")Re.error(`Execution failed: ${re.error||"unknown error"}`);else{const ue=re.warning?`Executed (${re.warning})`:"Executed successfully";Re.success(ue)}await O()}catch(re){Re.error(re.message||"Failed to trigger")}m.value=null}async function Q(H){C.value=H.id;const re=!H.paused;try{await W.put(`/api/schedules/${encodeURIComponent(H.id)}`,{paused:re}),Re.success(re?"Schedule paused":"Schedule resumed"),await O()}catch(ue){Re.error(ue.message||"Failed to update schedule")}C.value=null}const ie=new Map;function X(H,re){const ue=ie.get(H.id);ue&&clearTimeout(ue.timer);const Le={run:()=>fe(H,re),timer:null};Le.timer=setTimeout(()=>{ie.delete(H.id),Le.run()},500),ie.set(H.id,Le)}async function fe(H,re){y.value=H.id;try{await W.put(`/api/schedules/${encodeURIComponent(H.id)}`,{report_format:re}),Re.success(re?"Structured report enabled":"Plain-text report enabled")}catch(ue){Re.error(`Update failed: ${ue.message}`)}finally{await O(),y.value=null}}function Pe(){for(const[H,re]of[...ie])clearTimeout(re.timer),ie.delete(H),re.run()}async function Y(H){L.value=H;try{await W.post(`/api/schedules/${encodeURIComponent(H)}/reset-failures`),Re.success("Failure counters reset"),await O()}catch(re){Re.error(re.message||"Failed to reset")}L.value=null}async function be(H){const re=e.value.find(Le=>Le.id===H);if(await Xt({title:"Delete schedule",message:`Delete "${(re==null?void 0:re.description)||H}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=H;try{await W.del(`/api/schedules/${encodeURIComponent(H)}`),Re.success("Schedule deleted"),await O()}catch(Le){Re.error(Le.message||"Failed to delete schedule")}v.value=null}}return We(()=>{O()}),mt(Pe),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:p,cronPresets:h,runningId:m,deletingId:v,togglingId:C,resettingId:L,reportUpdatingId:y,flushReportFormatTimers:Pe,expandedId:g,history:b,historyLoading:S,historyError:k,cronCount:T,oneTimeCount:_,webhookCount:D,pausedCount:E,failingCount:R,formatTs:ka,formatAge:Cm,formatFuture:$,formatMs:V,formatDuration:ri,onCronInput:oe,onRunAtInput:P,validateCron:N,toggleExpand:U,fetchSchedules:O,doCreate:K,doRunNow:q,doTogglePause:Q,doUpdateReportFormat:X,doResetFailures:Y,doDelete:be}}},Lm=[{id:"live",label:"Live",component:cw},{id:"agents",label:"Agents",component:hw},{id:"loops",label:"Loops",component:mw},{id:"processes",label:"Processes",component:vw},{id:"schedules",label:"Schedules",component:_w}],ww={components:{TabbedPage:Hr},setup(){return{tabs:Lm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},kw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Audit Log</h1>
        <div class="flex items-center gap-2">
          <button @click="verifyIntegrity" class="btn btn-ghost text-xs" :disabled="verifying">
            {{ verifying ? 'Verifying...' : 'Verify integrity' }}
          </button>
          <button @click="fetchAudit" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Tamper-evidence result (audit 7.2): the HMAC chain verifier has
           existed since v3.49.0 with no operator surface. Every state is
           rendered honestly — disabled signing and the permanent
           pre-enablement unsigned prefix are facts, not alarms. -->
      <div v-if="verifyError" class="hm-card mb-4 border-red-900">
        <p class="text-red-400 text-sm">Verification failed: {{ verifyError }}</p>
      </div>
      <div v-else-if="verifyResult && verifyResult.not_enabled" class="hm-card mb-4">
        <p class="text-xs text-gray-400">Tamper-evidence is not enabled — no signing key is configured, so the chain cannot be verified.</p>
      </div>
      <div v-else-if="verifyResult" class="hm-card mb-4" :class="verifyResult.valid ? 'audit-verify-ok' : 'border-red-900'">
        <p v-if="verifyResult.valid" class="text-sm audit-verify-valid">
          Chain valid — {{ verifyResult.verified }} signed entr{{ verifyResult.verified === 1 ? 'y' : 'ies' }} verified.
        </p>
        <p v-else class="text-sm text-red-400">
          Chain INVALID — first break at entry {{ verifyResult.first_bad }}; {{ verifyResult.verified }} verified before it.
        </p>
        <p v-if="verifyResult.unsigned_prefix > 0" class="text-xs text-gray-500 mt-1">
          {{ verifyResult.unsigned_prefix.toLocaleString() }} older entries predate signing and are permanently unsigned — expected, not tampering.
        </p>
      </div>

      <!-- Filters -->
      <div class="hm-card mb-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool
            <input v-model="filters.tool" type="text" class="hm-input"
                   placeholder="e.g. run_command" @keyup.enter="fetchAudit" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">User
            <input v-model="filters.user" type="text" class="hm-input"
                   placeholder="User ID or name" @keyup.enter="fetchAudit" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Keyword
            <input v-model="filters.keyword" type="text" class="hm-input"
                   placeholder="Search in output..." @keyup.enter="fetchAudit" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Date
            <input v-model="filters.date" type="date" class="hm-input" @change="fetchAudit" />
            </label>
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button @click="fetchAudit" class="btn btn-primary text-xs">Search</button>
          <button @click="clearFilters" class="btn btn-ghost text-xs">Clear Filters</button>
          <div class="flex-1"></div>
          <div class="flex items-center gap-2">
            <label class="text-gray-400 text-xs">Limit:
            <select v-model="filters.limit" class="hm-input" style="width:auto;min-width:70px;" @change="fetchAudit">
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
            </select>
            </label>
          </div>
        </div>
      </div>

      <!-- Results -->
      <div v-if="loading && entries.length === 0" class="space-y-2">
        <div v-for="n in 5" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchAudit" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="entries.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="file" :size="23" /></span>
        <span class="empty-state-text">No audit entries found</span>
        <span class="empty-state-hint">Try adjusting your filters or wait for tool executions to appear</span>
      </div>
      <div v-else>
        <div class="text-xs text-gray-500 mb-2">Showing {{ entries.length }} entries</div>
        <div class="table-responsive">
        <table class="hm-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Tool</th>
              <th class="mobile-hide">User</th>
              <th class="mobile-hide">Host</th>
              <th class="mobile-hide">Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(e, i) in entries" :key="i">
            <tr @click="toggleExpand(i)" @keydown.enter="toggleExpand(i)" @keydown.space.prevent="toggleExpand(i)"
                role="button" tabindex="0" :aria-expanded="expandedIdx === i" style="cursor:pointer;"
                :class="expandedIdx === i ? 'bg-gray-800/50' : ''">
              <td class="text-xs text-gray-400 font-mono whitespace-nowrap">{{ formatTs(e.timestamp) }}</td>
              <td class="font-mono text-xs">{{ e.tool || e.tool_name || '—' }}</td>
              <td class="text-xs text-gray-400 mobile-hide">{{ e.user || e.user_id || '—' }}</td>
              <td class="text-xs text-gray-400 font-mono mobile-hide">{{ e.host || '—' }}</td>
              <td class="text-xs text-gray-400 mobile-hide">
                {{ e.duration ? (e.duration < 1 ? (e.duration * 1000).toFixed(0) + 'ms' : e.duration.toFixed(1) + 's')
                   : e.execution_time_ms != null ? (e.execution_time_ms < 1000 ? e.execution_time_ms + 'ms' : (e.execution_time_ms / 1000).toFixed(1) + 's')
                   : '—' }}
              </td>
              <td>
                <span v-if="e.error" class="badge badge-danger">error</span>
                <span v-if="e.failure && e.failure.class" class="badge badge-warning" :title="e.failure.subclass">{{ e.failure.class }}</span>
                <span v-if="!e.error" class="badge badge-success">ok</span>
              </td>
            </tr>
            <!-- Inline expanded detail: renders directly under the clicked row -->
            <tr v-if="expandedIdx === i">
              <td colspan="6" class="!p-0">
                <div class="m-2 hm-card">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium font-mono">{{ entries[expandedIdx].tool || entries[expandedIdx].tool_name }}</span>
            <button @click="expandedIdx = null" class="btn btn-ghost text-xs">Close</button>
          </div>

          <div v-if="entries[expandedIdx].input || entries[expandedIdx].tool_input" class="mb-3">
            <div class="text-gray-400 text-xs mb-1">Input</div>
            <pre class="p-2 rounded bg-gray-900 text-xs text-gray-300 overflow-x-auto font-mono max-h-40 overflow-y-auto">{{ formatDetail(entries[expandedIdx].input || entries[expandedIdx].tool_input) }}</pre>
          </div>

          <div v-if="entries[expandedIdx].output || entries[expandedIdx].result">
            <div class="text-gray-400 text-xs mb-1">Output</div>
            <pre class="p-2 rounded bg-gray-900 text-xs text-gray-300 overflow-x-auto font-mono max-h-60 overflow-y-auto whitespace-pre-wrap break-all">{{ truncateBlock(formatDetail(entries[expandedIdx].output || entries[expandedIdx].result), 5000) }}</pre>
          </div>

          <div v-if="entries[expandedIdx].error" class="mt-2">
            <div class="text-red-400 text-xs mb-1">Error</div>
            <pre class="p-2 rounded bg-red-950/30 text-xs text-red-300 overflow-x-auto font-mono">{{ entries[expandedIdx].error }}</pre>
          </div>

          <div v-if="entries[expandedIdx].failure" class="mt-2 text-xs text-gray-500">
            Failure class: <span class="badge badge-warning">{{ entries[expandedIdx].failure.class }}</span>
            <span class="ml-1">{{ entries[expandedIdx].failure.subclass }}</span>
            <span class="ml-1 text-gray-600">rule {{ entries[expandedIdx].failure.matched_rule || '—' }},
              confidence {{ entries[expandedIdx].failure.confidence }}</span>
          </div>
                </div>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
        </div>

      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){n.value=n.value===m?null:m}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let o=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await W.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++o;t.value=!0,s.value=null,n.value=null;try{const v=new URLSearchParams;a.value.tool&&v.set("tool",a.value.tool),a.value.user&&v.set("user",a.value.user),a.value.keyword&&v.set("q",a.value.keyword),a.value.date&&v.set("date",a.value.date),v.set("limit",String(a.value.limit));const C=v.toString(),L=await W.get(`/api/audit${C?"?"+C:""}`);if(m!==o)return;e.value=Array.isArray(L)?L:[]}catch(v){if(m!==o)return;s.value=v.message}m===o&&(t.value=!1)}return We(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ka,formatDetail:i,truncateBlock:Em,toggleExpand:l,clearFilters:r,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},zu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Sw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],Tw={template:`
    <div class="p-6 page-fade-in">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 class="text-xl font-semibold">Sessions</h1>
          <p class="text-xs text-gray-500 mt-0.5" v-if="sessions.length > 0">
            {{ sessions.length }} session{{ sessions.length !== 1 ? 's' : '' }}
            <span v-if="filteredSessions.length !== sessions.length">
              · {{ filteredSessions.length }} shown
            </span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button v-if="selected.size > 0" @click="confirmBulkClear"
                  class="btn btn-danger text-xs">
            Clear Selected ({{ selected.size }})
          </button>
          <button @click="fetchSessions" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Filter presets bar -->
      <div class="sess-filter-bar mb-3">
        <div class="flex gap-1.5 flex-wrap items-center">
          <button v-for="preset in filterPresets" :key="preset.id"
                  @click="applyPreset(preset.id)"
                  class="sess-preset-chip"
                  :class="{ 'sess-preset-active': activePreset === preset.id }">
            <span class="sess-preset-icon"><odin-icon :name="preset.icon" :size="15" /></span>
            <span>{{ preset.name }}</span>
          </button>
        </div>
        <div class="flex gap-2 items-center mt-2">
          <!-- Search -->
          <input v-model="searchQuery" type="text" class="hm-input flex-1"
                 placeholder="Search channels, users..." style="min-width: 140px; max-width: 300px;" />
          <!-- Sort -->
          <select v-model="sortBy" class="hm-select">
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <button @click="sortAsc = !sortAsc" class="icon-btn"
                  :title="sortAsc ? 'Ascending' : 'Descending'" :aria-label="sortAsc ? 'Sort ascending' : 'Sort descending'">
            <odin-icon name="sort" :size="15" :class="{ 'rotate-180': sortAsc }" />
          </button>
        </div>
        <!-- Custom preset save -->
        <div v-if="hasActiveFilters && activePreset === 'all'" class="mt-2 flex items-center gap-2">
          <button @click="showSavePreset = !showSavePreset" class="btn btn-ghost text-xs">
            Save as preset
          </button>
          <template v-if="showSavePreset">
            <input v-model="newPresetName" type="text" class="hm-input text-xs"
                   placeholder="Preset name..." style="max-width: 180px;" />
            <button @click="saveCustomPreset" class="btn btn-primary text-xs" :disabled="!newPresetName.trim()">
              Save
            </button>
          </template>
        </div>
        <!-- Custom presets -->
        <div v-if="customPresets.length > 0" class="flex gap-1.5 flex-wrap mt-2">
          <div v-for="cp in customPresets" :key="cp.id" class="sess-preset-chip sess-preset-custom"
               :class="{ 'sess-preset-active': activePreset === cp.id }">
            <button type="button" class="inline-flex items-center gap-1" @click="applyCustomPreset(cp)">
              <odin-icon name="sparkles" :size="14" />
              <span>{{ cp.name }}</span>
            </button>
            <button type="button" class="sess-preset-remove" @click="removeCustomPreset(cp.id)"
                  :aria-label="'Remove preset ' + cp.name" title="Remove preset">&times;</button>
          </div>
        </div>
      </div>

      <!-- Full-text search panel -->
      <div class="hm-card mb-3 p-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-sm font-medium text-gray-300">Search History</span>
          <span class="text-xs text-gray-500">Full-text search across all sessions and archives</span>
        </div>
        <div class="flex gap-2 items-end flex-wrap">
          <div class="flex-1" style="min-width: 200px;">
            <input v-model="ftsQuery" type="text" class="hm-input w-full"
                   placeholder="Search message content..."
                   @keyup.enter="runFtsSearch" />
          </div>
          <input v-model="ftsChannelId" type="text" class="hm-input text-xs"
                 placeholder="Channel ID (optional)" style="max-width: 160px;" />
          <input v-model="ftsUserId" type="text" class="hm-input text-xs"
                 placeholder="User ID (optional)" style="max-width: 140px;" />
          <button @click="runFtsSearch" class="btn btn-primary text-xs" :disabled="ftsSearching || !ftsQuery.trim()">
            {{ ftsSearching ? 'Searching...' : 'Search' }}
          </button>
          <button v-if="ftsResults !== null" @click="clearFtsSearch" class="btn btn-ghost text-xs">
            Clear
          </button>
        </div>
        <!-- FTS results -->
        <div v-if="ftsSearching" class="mt-3 flex items-center gap-2 text-gray-400 text-sm">
          <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Searching...
        </div>
        <div v-else-if="ftsResults !== null" class="mt-3">
          <div v-if="ftsResults.length === 0" class="text-gray-500 text-sm">No results found</div>
          <div v-else>
            <div class="text-xs text-gray-500 mb-2">{{ ftsResults.length }} result{{ ftsResults.length !== 1 ? 's' : '' }}</div>
            <div class="space-y-2 max-h-96 overflow-y-auto pr-1" style="scrollbar-gutter: stable;">
              <div v-for="(r, i) in ftsResults" :key="i"
                   class="p-2 rounded text-sm border"
                   :class="ftsResultClass(r.type)">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <span class="badge" :class="ftsTypeBadge(r.type)">{{ r.type }}</span>
                  <span class="text-xs text-gray-500 font-mono">{{ r.channel_id }}</span>
                  <span v-if="r.user_id" class="text-xs text-gray-500 font-mono">{{ r.user_id }}</span>
                  <span v-if="r.author" class="text-xs text-gray-500">{{ r.author }}</span>
                  <span class="text-xs text-gray-600 ml-auto" :title="formatFullTimestamp(r.timestamp)">
                    {{ formatTimestamp(r.timestamp) }}
                  </span>
                  <span v-if="r.rank != null" class="text-xs text-gray-600" :title="'BM25 rank: ' + r.rank.toFixed(2)">
                    score: {{ Math.abs(r.rank).toFixed(1) }}
                  </span>
                </div>
                <div class="whitespace-pre-wrap break-words text-gray-200 text-sm" v-html="highlightSnippet(r.content)"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Skeleton loading -->
      <div v-if="loading && sessions.length === 0" class="space-y-2">
        <div v-for="n in 4" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="sessions.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="message" :size="23" /></span>
        <span class="empty-state-text">No active sessions</span>
        <span class="empty-state-hint">Sessions appear when users interact with Odin via Discord or the chat interface</span>
      </div>
      <div v-else-if="filteredSessions.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="search" :size="23" /></span>
        <span class="empty-state-text">No sessions match the current filter</span>
        <button @click="resetFilters" class="btn btn-ghost text-xs mt-2">Clear Filters</button>
      </div>
      <div v-else>
        <!-- Select all -->
        <div class="flex items-center gap-2 mb-2 text-sm text-gray-400">
          <label class="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" :checked="allSelected" @change="toggleSelectAll"
                   class="session-checkbox" />
            <span>Select all ({{ filteredSessions.length }})</span>
          </label>
        </div>

        <div class="space-y-2">
          <div v-for="s in filteredSessions" :key="s.channel_id"
               class="session-card hm-card"
               :class="{ 'flash-new': s._updated, 'session-selected': selected.has(s.channel_id) }">
            <!-- Header row -->
            <div class="flex items-center gap-3 cursor-pointer" role="button" tabindex="0"
                 :aria-expanded="expandedId === s.channel_id" @click="toggleSession(s.channel_id)"
                 @keydown.enter="toggleSession(s.channel_id)" @keydown.space.prevent="toggleSession(s.channel_id)">
              <input type="checkbox" :checked="selected.has(s.channel_id)"
                     :aria-label="'Select session ' + (s.channel_name || s.channel_id)"
                     @click.stop @change="toggleSelect(s.channel_id)"
                     class="session-checkbox" />
              <div class="sess-source-icon" :class="s.source === 'web' ? 'sess-source-web' : 'sess-source-discord'">
                <odin-icon :name="s.source === 'web' ? 'globe' : 'message'" :size="14" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono text-sm font-medium">{{ s.channel_id }}</span>
                  <span class="badge badge-info">{{ s.message_count }} msg</span>
                  <span v-if="s.has_summary" class="badge badge-warning" title="Session has compacted summary">compacted</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  Active {{ formatAge(s.last_active) }} · Created {{ formatAge(s.created_at) }}
                  <span v-if="s.last_user_id"> · <span class="font-mono">{{ s.last_user_id }}</span></span>
                </div>
              </div>
              <div class="flex items-center gap-1" @click.stop>
                <span class="sess-expand-icon" aria-hidden="true">
                  <odin-icon :name="expandedId === s.channel_id ? 'chevronUp' : 'chevronDown'" :size="14" />
                </span>
                <button @click="exportSession(s.channel_id, 'json')" class="btn btn-ghost text-xs" title="Export JSON">
                  JSON
                </button>
                <button @click="exportSession(s.channel_id, 'text')" class="btn btn-ghost text-xs" title="Export text">
                  TXT
                </button>
                <button @click="confirmClear(s.channel_id)" class="btn btn-danger text-xs">Clear</button>
              </div>
            </div>

            <!-- Preview (last 2 messages) -->
            <div v-if="s.preview && s.preview.length > 0 && expandedId !== s.channel_id"
                 class="session-preview mt-2 pt-2 border-t border-gray-800">
              <div v-for="(p, i) in s.preview" :key="i" class="flex gap-2 text-xs mb-1 last:mb-0">
                <span class="session-preview-role" :class="p.role === 'user' ? 'text-cyan-400' : 'text-indigo-400'">
                  {{ p.role === 'user' ? 'USER' : 'ODIN' }}:
                </span>
                <span class="text-gray-400 truncate">{{ p.content || '(empty)' }}</span>
              </div>
            </div>

            <!-- Expanded session detail with conversation threading -->
            <div v-if="expandedId === s.channel_id" class="mt-3 pt-3 border-t border-gray-800">
              <div v-if="detailLoading" class="flex items-center gap-2 text-gray-400 text-sm">
                <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Loading...
              </div>
              <div v-else-if="detail">
                <!-- Summary banner -->
                <div v-if="detail.summary" class="sess-summary-banner mb-3">
                  <div class="sess-summary-label">Compacted Summary</div>
                  <div class="mt-1 text-sm text-gray-300">{{ detail.summary }}</div>
                </div>

                <!-- Thread view toggle -->
                <div class="flex items-center gap-2 mb-3">
                  <button @click="threadView = 'threaded'" class="sess-view-btn"
                          :class="{ 'sess-view-active': threadView === 'threaded' }">
                    Threaded
                  </button>
                  <button @click="threadView = 'flat'" class="sess-view-btn"
                          :class="{ 'sess-view-active': threadView === 'flat' }">
                    Flat
                  </button>
                  <span class="text-xs text-gray-500 ml-2" v-if="detail.messages">
                    {{ detail.messages.length }} message{{ detail.messages.length !== 1 ? 's' : '' }}
                    <span v-if="threadView === 'threaded' && threads.length > 0">
                      · {{ threads.length }} thread{{ threads.length !== 1 ? 's' : '' }}
                    </span>
                  </span>
                </div>

                <!-- THREADED view -->
                <div v-if="threadView === 'threaded'" class="max-h-96 overflow-y-auto pr-1" style="scrollbar-gutter: stable;">
                  <div v-for="(thread, ti) in threads" :key="ti" class="mb-4">
                    <div class="flex items-center gap-2 mb-2 px-2 py-1 bg-gray-800 rounded cursor-pointer select-none"
                         @click="toggleThread(ti)" role="button" tabindex="0"
                         @keydown.enter="toggleThread(ti)" @keydown.space.prevent="toggleThread(ti)"
                         :aria-expanded="!collapsedThreads.has(ti)">
                      <span class="text-xs font-bold text-amber-400">#{{ ti + 1 }}</span>
                      <span class="text-xs text-gray-300">{{ threadSummary(thread) }}</span>
                      <span class="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">{{ thread.length }} msg</span>
                      <span class="text-xs text-gray-500 ml-auto" v-if="thread[0]">{{ formatTimestamp(thread[0].timestamp) }}</span>
                      <span class="text-xs text-gray-500" aria-hidden="true"><odin-icon :name="collapsedThreads.has(ti) ? 'chevronDown' : 'chevronUp'" :size="13" /></span>
                    </div>
                    <div v-if="!collapsedThreads.has(ti)" class="space-y-2 pl-2">
                      <div v-for="(m, mi) in thread" :key="mi"
                           class="p-2 rounded text-sm"
                           :class="messageClass(m.role)">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="badge" :class="roleBadge(m.role)">{{ m.role }}</span>
                          <span v-if="m.user_id" class="text-gray-500 text-xs font-mono">{{ m.user_id }}</span>
                          <span class="text-gray-600 text-xs ml-auto" :title="formatFullTimestamp(m.timestamp)">
                            {{ formatTimestamp(m.timestamp) }}
                          </span>
                        </div>
                        <div class="whitespace-pre-wrap break-words text-gray-200 text-sm">{{ truncateContent(m.content) }}</div>
                      </div>
                    </div>
                  </div>
                  <div v-if="detail.error" class="text-red-400 text-sm" role="alert">{{ detail.error }}</div>
                  <div v-else-if="threads.length === 0 && detail.messages && detail.messages.length === 0"
                       class="text-gray-500 text-sm">No messages in this session</div>
                </div>

                <!-- FLAT view (original) -->
                <div v-else class="session-messages space-y-2 max-h-96 overflow-y-auto pr-1" style="scrollbar-gutter: stable;">
                  <div v-for="(m, i) in detail.messages" :key="i"
                       class="session-msg p-2 rounded text-sm"
                       :class="messageClass(m.role)">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="sess-role-dot" :class="roleDotClass(m.role)"></span>
                      <span class="badge" :class="roleBadge(m.role)">{{ m.role }}</span>
                      <span v-if="m.user_id" class="text-gray-500 text-xs font-mono">{{ m.user_id }}</span>
                      <span class="text-gray-600 text-xs ml-auto" :title="formatFullTimestamp(m.timestamp)">
                        {{ formatTimestamp(m.timestamp) }}
                      </span>
                    </div>
                    <div class="whitespace-pre-wrap break-words text-gray-200 session-msg-content">{{ truncateContent(m.content) }}</div>
                  </div>
                  <div v-if="detail.error" class="text-red-400 text-sm" role="alert">{{ detail.error }}</div>
                  <div v-else-if="detail.messages && detail.messages.length === 0" class="text-gray-500 text-sm">No messages in this session</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Confirm clear modal (single) -->
      <div v-if="clearTarget" class="modal-overlay" v-modal-focus @click.self="clearTarget = null" @keyup.escape="clearTarget = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sess-clear-title">
        <div class="modal-content">
          <h3 id="sess-clear-title" class="text-lg font-semibold mb-2">Clear Session</h3>
          <p class="text-gray-400 text-sm mb-4">
            Clear all conversation history for channel <span class="font-mono">{{ clearTarget }}</span>? This cannot be undone.
          </p>
          <div class="flex gap-2 justify-end">
            <button @click="clearTarget = null" class="btn btn-ghost">Cancel</button>
            <button @click="clearSession" class="btn btn-danger" :disabled="clearing">
              {{ clearing ? 'Clearing...' : 'Clear Session' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Confirm bulk clear modal -->
      <div v-if="bulkClearing" class="modal-overlay" v-modal-focus @click.self="bulkClearing = false" @keyup.escape="bulkClearing = false" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sess-bulk-clear-title">
        <div class="modal-content">
          <h3 id="sess-bulk-clear-title" class="text-lg font-semibold mb-2">Clear Selected Sessions</h3>
          <p class="text-gray-400 text-sm mb-4">
            Clear <strong>{{ selected.size }}</strong> selected session(s)? This cannot be undone.
          </p>
          <div class="flex gap-2 justify-end">
            <button @click="bulkClearing = false" class="btn btn-ghost">Cancel</button>
            <button @click="doBulkClear" class="btn btn-danger" :disabled="clearing">
              {{ clearing ? 'Clearing...' : 'Clear All Selected' }}
            </button>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f(null),i=f(!1);let l=0;const r=f(null),o=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=zu,C=Sw,L=f([]),y=f(!1),g=f(""),b=f("flat"),S=f(new Set),k=f(""),A=f(""),T=f(""),_=f(null),D=f(!1);function E(){try{const se=localStorage.getItem("odin-session-presets");se&&(L.value=JSON.parse(se))}catch{}}function R(){try{localStorage.setItem("odin-session-presets",JSON.stringify(L.value))}catch{}}const $=J(()=>p.value.trim()!==""||u.value!=="all"),V=J(()=>{let se=[...e.value];const we=zu.find(qe=>qe.id===u.value),Ie=we?we.filters:{};if(Ie.source&&(se=se.filter(qe=>qe.source===Ie.source)),Ie.minMessages&&(se=se.filter(qe=>qe.message_count>=Ie.minMessages)),Ie.hasCompaction&&(se=se.filter(qe=>qe.has_summary)),Ie.maxAge!=null){const qe=Date.now()/1e3;se=se.filter(_t=>_t.last_active&&qe-_t.last_active<=Ie.maxAge)}if(p.value.trim()){const qe=p.value.toLowerCase().trim();se=se.filter(_t=>(_t.channel_id||"").toLowerCase().includes(qe)||(_t.last_user_id||"").toLowerCase().includes(qe)||(_t.source||"").toLowerCase().includes(qe))}const ze=h.value,it=m.value?1:-1;return se.sort((qe,_t)=>{const Ot=qe[ze]||0,Es=_t[ze]||0;return(Ot-Es)*it}),se}),oe=J(()=>{if(!a.value||!a.value.messages)return[];const se=a.value.messages;if(se.length===0)return[];const we=[];let Ie=[];for(const ze of se)ze.role==="user"&&Ie.length>0&&(we.push(Ie),Ie=[]),Ie.push(ze);return Ie.length>0&&we.push(Ie),we}),P=J(()=>V.value.length>0&&c.value.size===V.value.length);function N(se){const we=se.find(Ie=>Ie.role==="user");if(we&&we.content){const Ie=we.content.slice(0,120);return Ie.length<we.content.length?Ie+"...":Ie}return"(no user message)"}function O(se){const we=new Set(S.value);we.has(se)?we.delete(se):we.add(se),S.value=we}function U(se){u.value=se}function K(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(h.value=se.filters.sortBy)}function q(){if(!g.value.trim())return;const se={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};L.value=[...L.value,se],R(),y.value=!1,g.value=""}function Q(se){L.value=L.value.filter(we=>we.id!==se),R(),u.value===se&&(u.value="all")}function ie(){u.value="all",p.value="",h.value="last_active",m.value=!1}function X(se){if(!se)return"—";const we=Date.now()/1e3-se;if(we<60)return"just now";if(we<3600){const ze=Math.floor(we/60);return`${ze} minute${ze!==1?"s":""} ago`}if(we<86400){const ze=Math.floor(we/3600);return`${ze} hour${ze!==1?"s":""} ago`}const Ie=Math.floor(we/86400);return`${Ie} day${Ie!==1?"s":""} ago`}function fe(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function Pe(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function Y(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function be(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function H(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function re(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ue(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function Le(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function x(){const se=k.value.trim();if(se){D.value=!0;try{let we=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;A.value.trim()&&(we+=`&channel_id=${encodeURIComponent(A.value.trim())}`),T.value.trim()&&(we+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Ie=await W.get(we);_.value=Ie.results||[]}catch{_.value=[]}D.value=!1}}function M(){k.value="",A.value="",T.value="",_.value=null}function B(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ae(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function te(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let ne=0;async function he(){const se=++ne;t.value=!0,s.value=null;try{const we=await W.get("/api/sessions");if(se!==ne)return;e.value=we}catch(we){if(se!==ne)return;s.value=we.message}se===ne&&(t.value=!1)}function de(){s.value=null,he()}async function pe(se){if(n.value===se){n.value=null,a.value=null,S.value=new Set;return}n.value=se,a.value=null,i.value=!0,S.value=new Set;const we=++l;try{const Ie=await W.get(`/api/sessions/${encodeURIComponent(se)}`);we===l&&n.value===se&&(a.value=Ie)}catch(Ie){we===l&&n.value===se&&(a.value={messages:[],summary:"",error:Ie.message||"Failed to load session"})}finally{we===l&&(i.value=!1)}}function le(se){const we=new Set(c.value);we.has(se)?we.delete(se):we.add(se),c.value=we}function ke(){P.value?c.value=new Set:c.value=new Set(V.value.map(se=>se.channel_id))}function ye(se){r.value=se}async function _e(){if(r.value){o.value=!0;try{await W.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await he()}catch(se){s.value=se.message||"Failed to clear session"}o.value=!1,r.value=null}}function ce(){d.value=!0}async function z(){if(c.value.size!==0){o.value=!0;try{await W.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await he()}catch(se){s.value=se.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function ve(se,we){const Ie=`/api/sessions/${encodeURIComponent(se)}/export?format=${we}`;try{const ze=await W.getBlob(Ie),it=URL.createObjectURL(ze),qe=document.createElement("a");qe.href=it,qe.download=`session-${se}.${we==="text"?"txt":"json"}`,qe.click(),URL.revokeObjectURL(it)}catch(ze){s.value=ze.message||"Failed to export session"}}let Te=null;function Oe(se){se.payload&&se.payload.channel_id&&(clearTimeout(Te),Te=setTimeout(()=>{if(he(),n.value&&se.payload.channel_id===n.value){const we=n.value,Ie=l;W.get(`/api/sessions/${encodeURIComponent(we)}`).then(ze=>{Ie!==l||n.value!==we||(a.value=ze)}).catch(()=>{})}},2e3))}let De=!1,ct=null;function rt(){De||(De=!0,he(),Ye.subscribe("events",Oe),ct=Ye.onReconnected(()=>he()))}We(()=>{E(),rt()}),us(()=>{rt()});function Pt(){De&&(De=!1,Ye.unsubscribe("events",Oe),ct&&(ct(),ct=null),clearTimeout(Te))}return ts(Pt),mt(Pt),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:P,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:C,filteredSessions:V,hasActiveFilters:$,customPresets:L,showSavePreset:y,newPresetName:g,threadView:b,threads:oe,collapsedThreads:S,ftsQuery:k,ftsChannelId:A,ftsUserId:T,ftsResults:_,ftsSearching:D,formatAge:X,formatTimestamp:fe,formatFullTimestamp:Pe,messageClass:Y,threadMsgClass:be,roleBadge:H,roleDotClass:re,roleLabelClass:ue,truncateContent:Le,threadSummary:N,fetchSessions:he,retry:de,toggleSession:pe,toggleSelect:le,toggleSelectAll:ke,confirmClear:ye,clearSession:_e,confirmBulkClear:ce,doBulkClear:z,exportSession:ve,applyPreset:U,applyCustomPreset:K,saveCustomPreset:q,removeCustomPreset:Q,resetFilters:ie,toggleThread:O,runFtsSearch:x,clearFtsSearch:M,highlightSnippet:B,ftsResultClass:ae,ftsTypeBadge:te}}},Cw={props:["trace"],template:`
              <!-- Context trace (observability): what the prompt assembler did -->
              <div v-if="trace" class="mt-3">
                <div class="text-gray-400 text-xs mb-1">Context Assembly</div>
                <div class="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                  <div class="p-2 rounded bg-gray-900 text-xs">
                    <span class="text-gray-500 block">System tokens</span>
                    <span class="font-semibold">{{ formatTokens(trace.summary?.system_tokens) }}</span>
                  </div>
                  <div class="p-2 rounded bg-gray-900 text-xs">
                    <span class="text-gray-500 block">History tokens</span>
                    <span class="font-semibold">{{ formatTokens(trace.summary?.history_used_tokens) }}</span>
                  </div>
                  <div class="p-2 rounded bg-gray-900 text-xs">
                    <span class="text-gray-500 block">Learned injected</span>
                    <span class="font-semibold">{{ trace.summary?.learned_injected ?? '—' }}
                      <span class="text-gray-500">({{ trace.learned?.mode || '?' }})</span>
                    </span>
                  </div>
                  <div class="p-2 rounded bg-gray-900 text-xs">
                    <span class="text-gray-500 block">Continuity</span>
                    <span class="font-semibold">{{ trace.continuity_source || '—' }}</span>
                  </div>
                </div>
                <table v-if="(trace.sections || []).length" class="hm-table text-xs mb-2">
                  <thead><tr><th>Section</th><th class="text-right">Tokens</th></tr></thead>
                  <tbody>
                    <tr v-for="s in trace.sections" :key="s.section">
                      <td class="font-mono">{{ s.section }}</td>
                      <td class="text-right">{{ formatTokens(s.tokens) }}</td>
                    </tr>
                    <tr v-if="trace.history?.used">
                      <td class="font-mono">history ({{ trace.history.kept_recent }} recent + {{ trace.history.kept_relevant }} relevant of {{ trace.history.candidates }})</td>
                      <td class="text-right">{{ formatTokens(trace.history.used) }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="(trace.warnings || []).length" class="mt-1">
                  <span v-for="w in trace.warnings" :key="w.code"
                        class="badge badge-danger mr-1" :title="w.detail">{{ w.code }}</span>
                </div>
                <div v-if="trace.summary?.trace_truncated" class="text-xs text-amber-400 mt-1">
                  trace truncated ({{ trace.truncation_reason }})
                </div>
              </div>
  `,setup(){return{formatTokens:Rm}}},Ew={components:{ContextAssemblyPanel:Cw},template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Trace Viewer</h1>
        <div class="flex items-center gap-2">
          <button @click="fetchTraces" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Message ID lookup -->
      <div class="hm-card mb-4">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div class="md:col-span-2">
            <label class="text-gray-400 text-xs block mb-1">Message ID
            <input v-model="messageIdQuery" type="text" class="hm-input"
                   placeholder="Look up by message ID..." @keyup.enter="lookupMessage" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">File
            <select v-model="selectedFile" class="hm-input" @change="fetchTraces">
              <option value="">All files</option>
              <option v-for="f in files" :key="f" :value="f">{{ f.replace('.jsonl', '') }}</option>
            </select>
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Tool
            <input v-model="filters.tool_name" type="text" class="hm-input"
                   placeholder="e.g. run_command" @keyup.enter="fetchTraces" />
            </label>
          </div>
          <div>
            <span class="text-gray-400 text-xs block mb-1">Filters</span>
            <div class="flex gap-2">
              <label class="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" v-model="filters.errors_only" @change="fetchTraces" class="rounded" />
                Errors only
              </label>
              <button @click="clearFilters" class="btn btn-ghost text-xs ml-auto">Clear</button>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Channel
            <input v-model="filters.channel_id" type="text" class="hm-input"
                   placeholder="Channel ID" @keyup.enter="fetchTraces" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">User
            <input v-model="filters.user_id" type="text" class="hm-input"
                   placeholder="User ID" @keyup.enter="fetchTraces" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Limit
            <select v-model="filters.limit" class="hm-input" @change="fetchTraces">
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
            </label>
          </div>
          <div class="flex items-end">
            <button @click="fetchTraces" class="btn btn-primary text-xs">Search</button>
          </div>
        </div>
      </div>

      <!-- Single trace detail (from message ID lookup) -->
      <div v-if="singleTrace" class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-sm font-medium text-gray-300">Trace for message {{ singleTrace.message_id }}</span>
          <button @click="singleTrace = null" class="btn btn-ghost text-xs">Back to list</button>
        </div>
        <div class="hm-card">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <span class="text-gray-500 text-xs block">User</span>
              <span class="text-sm font-mono">{{ singleTrace.user_name || singleTrace.user_id || '—' }}</span>
            </div>
            <div>
              <span class="text-gray-500 text-xs block">Channel</span>
              <span class="text-sm font-mono">{{ singleTrace.channel_id || '—' }}</span>
            </div>
            <div>
              <span class="text-gray-500 text-xs block">Time</span>
              <span class="text-sm">{{ formatTs(singleTrace.timestamp) }}</span>
            </div>
            <div>
              <span class="text-gray-500 text-xs block">Status</span>
              <span v-if="singleTrace.is_error" class="badge badge-danger">error</span>
              <span v-else-if="singleTrace.handoff" class="badge badge-warning">handoff</span>
              <span v-else class="badge badge-success">ok</span>
            </div>
          </div>

          <!-- Summary stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="p-2 rounded bg-gray-800/50">
              <span class="text-gray-500 text-xs block">Iterations</span>
              <span class="text-lg font-semibold">{{ singleTrace.iteration_count || 0 }}</span>
            </div>
            <div class="p-2 rounded bg-gray-800/50">
              <span class="text-gray-500 text-xs block">Tools Used</span>
              <span class="text-lg font-semibold">{{ (singleTrace.tools_used || []).length }}</span>
            </div>
            <div class="p-2 rounded bg-gray-800/50">
              <span class="text-gray-500 text-xs block">Duration</span>
              <span class="text-lg font-semibold">{{ formatDuration(singleTrace.total_duration_ms) }}</span>
            </div>
            <div class="p-2 rounded bg-gray-800/50">
              <span class="text-gray-500 text-xs block">Tokens</span>
              <span class="text-lg font-semibold">{{ formatTokens(singleTrace.total_input_tokens + singleTrace.total_output_tokens) }}</span>
            </div>
          </div>

          <!-- User message -->
          <div v-if="singleTrace.user_content" class="mb-3">
            <div class="text-gray-400 text-xs mb-1">User Message</div>
            <pre class="p-2 rounded bg-gray-900 text-xs text-gray-300 font-mono max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{{ singleTrace.user_content }}</pre>
          </div>

          <!-- Tool chain timeline -->
          <div v-if="singleTrace.iterations && singleTrace.iterations.length > 0" class="mb-3">
            <div class="text-gray-400 text-xs mb-2">Tool Chain</div>
            <div class="space-y-2">
              <div v-for="(it, idx) in singleTrace.iterations" :key="idx"
                   class="border border-gray-700 rounded p-3 hover:border-gray-600 transition-colors">
                <!-- Iteration header -->
                <div class="flex items-center justify-between cursor-pointer" role="button" tabindex="0"
                     @click="toggleIteration('single', idx)" @keydown.enter="toggleIteration('single', idx)"
                     @keydown.space.prevent="toggleIteration('single', idx)">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono font-semibold text-gray-400">#{{ it.iteration + 1 }}</span>
                    <div class="flex gap-1 flex-wrap">
                      <span v-for="tc in it.tool_calls" :key="tc.name"
                            class="px-1.5 py-0.5 rounded text-xs font-mono bg-blue-900/40 text-blue-300">
                        {{ tc.name || 'unknown' }}
                      </span>
                      <span v-if="!it.tool_calls || it.tool_calls.length === 0"
                            class="text-xs text-gray-500 italic">no tool calls</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 text-xs text-gray-500">
                    <span v-if="it.duration_ms">{{ formatDuration(it.duration_ms) }}</span>
                    <span v-if="it.input_tokens || it.output_tokens">{{ it.input_tokens + it.output_tokens }} tok</span>
                    <span class="text-gray-600" aria-hidden="true"><odin-icon :name="isIterationExpanded('single', idx) ? 'chevronUp' : 'chevronDown'" :size="14" /></span>
                  </div>
                </div>

                <!-- Iteration detail -->
                <div v-if="isIterationExpanded('single', idx)" class="mt-3 space-y-2">
                  <!-- Duration bar -->
                  <div v-if="singleTrace.total_duration_ms > 0" class="mb-2">
                    <div class="h-1.5 rounded bg-gray-800 overflow-hidden">
                      <div class="h-full rounded bg-blue-500/60"
                           :style="{ width: Math.max(2, (it.duration_ms / singleTrace.total_duration_ms) * 100) + '%' }"></div>
                    </div>
                    <div class="text-xs text-gray-600 mt-0.5">{{ Math.round((it.duration_ms / singleTrace.total_duration_ms) * 100) }}% of total</div>
                  </div>

                  <!-- LLM text -->
                  <div v-if="it.llm_text" class="mb-2">
                    <div class="text-gray-500 text-xs mb-1">LLM Text</div>
                    <pre class="p-2 rounded bg-gray-900 text-xs text-gray-300 font-mono max-h-24 overflow-y-auto whitespace-pre-wrap break-words">{{ it.llm_text }}</pre>
                  </div>

                  <!-- Tool calls -->
                  <div v-for="(tc, tci) in it.tool_calls" :key="tci" class="mb-2">
                    <div class="text-gray-500 text-xs mb-1">
                      Call: <span class="font-mono text-blue-300">{{ tc.name }}</span>
                    </div>
                    <pre v-if="tc.input" class="p-2 rounded bg-gray-900 text-xs text-gray-300 font-mono max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{{ formatJSON(tc.input) }}</pre>
                  </div>

                  <!-- Tool results -->
                  <div v-for="(tr, tri) in it.tool_results" :key="tri" class="mb-2">
                    <div class="text-gray-500 text-xs mb-1">
                      Result: <span class="font-mono" :class="tr.error ? 'text-red-400' : 'text-green-400'">{{ tr.name || 'result ' + tri }}</span>
                    </div>
                    <pre class="p-2 rounded text-xs font-mono max-h-40 overflow-y-auto whitespace-pre-wrap break-all"
                         :class="tr.error ? 'bg-red-950/30 text-red-300' : 'bg-gray-900 text-gray-300'">{{ truncateBlock(formatJSON(tr.output || tr.result || tr.error || tr), 5000) }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Final response -->
          <div v-if="singleTrace.final_response" class="mb-3">
            <div class="text-gray-400 text-xs mb-1">Final Response</div>
            <pre class="p-2 rounded bg-gray-900 text-xs text-gray-300 font-mono max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{{ truncateBlock(singleTrace.final_response, 5000) }}</pre>
          </div>

          <context-assembly-panel
            v-if="singleTrace.context_trace"
            :trace="singleTrace.context_trace" />

          <!-- Tools used summary -->
          <div v-if="singleTrace.tools_used && singleTrace.tools_used.length" class="flex flex-wrap gap-1">
            <span class="text-gray-500 text-xs mr-1 self-center">Tools:</span>
            <span v-for="t in singleTrace.tools_used" :key="t"
                  class="px-1.5 py-0.5 rounded text-xs font-mono bg-gray-800 text-gray-400">{{ t }}</span>
          </div>
        </div>
      </div>

      <!-- Trace list -->
      <div v-else>
        <div v-if="loading && entries.length === 0" class="space-y-2">
          <div v-for="n in 5" :key="n" class="skeleton skeleton-row"></div>
        </div>
        <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
          <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
          <p class="text-red-400">{{ error }}</p>
          <button @click="fetchTraces" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <div v-else-if="entries.length === 0" class="hm-card empty-state">
          <span class="empty-state-icon"><odin-icon name="search" :size="23" /></span>
          <span class="empty-state-text">No traces found</span>
          <span class="empty-state-hint">Traces appear when the bot processes messages with tool calls</span>
        </div>
        <div v-else>
          <div class="text-xs text-gray-500 mb-2">
            Showing {{ entries.length }} traces
            <span v-if="totalSaved > 0">({{ totalSaved }} total saved)</span>
          </div>

          <!-- Trace list table -->
          <div class="table-responsive">
            <table class="hm-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th class="mobile-hide">Message</th>
                  <th>Tools</th>
                  <th class="mobile-hide">Duration</th>
                  <th class="mobile-hide">Tokens</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(e, i) in entries" :key="i">
                <tr @click="toggleExpand(i)" @keydown.enter="toggleExpand(i)" @keydown.space.prevent="toggleExpand(i)"
                    role="button" tabindex="0" :aria-expanded="expandedIdx === i" style="cursor:pointer;"
                    :class="expandedIdx === i ? 'bg-gray-800/50' : ''">
                  <td class="text-xs text-gray-400 font-mono whitespace-nowrap">{{ formatTs(e.timestamp) }}</td>
                  <td class="text-xs font-mono">{{ e.user_name || e.user_id || '—' }}</td>
                  <td class="text-xs text-gray-400 mobile-hide" style="max-width:200px;">
                    <span v-if="e.user_content" class="truncate block">{{ e.user_content.slice(0, 60) }}{{ e.user_content.length > 60 ? '...' : '' }}</span>
                    <span v-else class="badge badge-info" :title="'No user message recorded for this ' + (e.source || 'api') + ' turn'">{{ e.source || 'api' }}</span>
                  </td>
                  <td>
                    <div class="flex gap-1 flex-wrap">
                      <span v-for="t in (e.tools_used || []).slice(0, 3)" :key="t"
                            class="px-1 py-0.5 rounded text-xs font-mono bg-gray-800 text-gray-400">{{ t }}</span>
                      <span v-if="(e.tools_used || []).length > 3"
                            class="text-xs text-gray-500">+{{ e.tools_used.length - 3 }}</span>
                      <span v-if="!e.tools_used || e.tools_used.length === 0"
                            class="text-xs text-gray-600 italic">none</span>
                    </div>
                  </td>
                  <td class="text-xs text-gray-400 mobile-hide">{{ formatDuration(e.total_duration_ms) }}</td>
                  <td class="text-xs text-gray-400 font-mono mobile-hide">{{ formatTokens(e.total_input_tokens + e.total_output_tokens) }}</td>
                  <td>
                    <span v-if="e.is_error" class="badge badge-danger">error</span>
                    <span v-else-if="e.handoff" class="badge badge-warning">handoff</span>
                    <span v-else class="badge badge-success">ok</span>
                  </td>
                </tr>
                <!-- Inline expanded detail: renders directly under the clicked row -->
                <tr v-if="expandedIdx === i">
                  <td colspan="7" class="!p-0">
                    <div class="m-2">
            <div class="hm-card">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium font-mono">{{ entries[expandedIdx].message_id || 'Trace ' + (expandedIdx + 1) }}</span>
                  <span class="text-xs text-gray-500">{{ entries[expandedIdx].source || 'discord' }}</span>
                </div>
                <button @click="expandedIdx = null" class="btn btn-ghost text-xs">Close</button>
              </div>

              <!-- Quick stats row -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <div class="p-2 rounded bg-gray-800/50 text-center">
                  <span class="text-gray-500 text-xs block">Iterations</span>
                  <span class="font-semibold">{{ entries[expandedIdx].iteration_count || (entries[expandedIdx].iterations || []).length }}</span>
                </div>
                <div class="p-2 rounded bg-gray-800/50 text-center">
                  <span class="text-gray-500 text-xs block">Duration</span>
                  <span class="font-semibold">{{ formatDuration(entries[expandedIdx].total_duration_ms) }}</span>
                </div>
                <div class="p-2 rounded bg-gray-800/50 text-center">
                  <span class="text-gray-500 text-xs block">Input Tok</span>
                  <span class="font-semibold">{{ formatTokens(entries[expandedIdx].total_input_tokens) }}</span>
                </div>
                <div class="p-2 rounded bg-gray-800/50 text-center">
                  <span class="text-gray-500 text-xs block">Output Tok</span>
                  <span class="font-semibold">{{ formatTokens(entries[expandedIdx].total_output_tokens) }}</span>
                </div>
              </div>

              <!-- User content -->
              <div v-if="entries[expandedIdx].user_content" class="mb-3">
                <div class="text-gray-400 text-xs mb-1">User Message</div>
                <pre class="p-2 rounded bg-gray-900 text-xs text-gray-300 font-mono max-h-24 overflow-y-auto whitespace-pre-wrap break-words">{{ entries[expandedIdx].user_content }}</pre>
              </div>

              <!-- Iteration timeline -->
              <div v-if="entries[expandedIdx].iterations && entries[expandedIdx].iterations.length > 0" class="mb-3">
                <div class="text-gray-400 text-xs mb-2">Tool Chain ({{ entries[expandedIdx].iterations.length }} iterations)</div>
                <div class="space-y-2">
                  <div v-for="(it, idx) in entries[expandedIdx].iterations" :key="idx"
                       class="border border-gray-700 rounded p-3 hover:border-gray-600 transition-colors">
                    <div class="flex items-center justify-between cursor-pointer" role="button" tabindex="0"
                         @click.stop="toggleIteration('list', idx)" @keydown.enter.stop="toggleIteration('list', idx)"
                         @keydown.space.prevent.stop="toggleIteration('list', idx)">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-mono font-semibold text-gray-400">#{{ it.iteration + 1 }}</span>
                        <div class="flex gap-1 flex-wrap">
                          <span v-for="tc in it.tool_calls" :key="tc.name"
                                class="px-1.5 py-0.5 rounded text-xs font-mono bg-blue-900/40 text-blue-300">
                            {{ tc.name || 'unknown' }}
                          </span>
                          <span v-if="!it.tool_calls || it.tool_calls.length === 0"
                                class="text-xs text-gray-500 italic">no tool calls</span>
                        </div>
                      </div>
                      <div class="flex items-center gap-3 text-xs text-gray-500">
                        <span v-if="it.duration_ms">{{ formatDuration(it.duration_ms) }}</span>
                        <span v-if="it.input_tokens || it.output_tokens">{{ it.input_tokens + it.output_tokens }} tok</span>
                        <span class="text-gray-600" aria-hidden="true"><odin-icon :name="isIterationExpanded('list', idx) ? 'chevronUp' : 'chevronDown'" :size="14" /></span>
                      </div>
                    </div>

                    <div v-if="isIterationExpanded('list', idx)" class="mt-3 space-y-2">
                      <div v-if="entries[expandedIdx].total_duration_ms > 0" class="mb-2">
                        <div class="h-1.5 rounded bg-gray-800 overflow-hidden">
                          <div class="h-full rounded bg-blue-500/60"
                               :style="{ width: Math.max(2, (it.duration_ms / entries[expandedIdx].total_duration_ms) * 100) + '%' }"></div>
                        </div>
                        <div class="text-xs text-gray-600 mt-0.5">{{ Math.round((it.duration_ms / entries[expandedIdx].total_duration_ms) * 100) }}% of total</div>
                      </div>

                      <div v-if="it.llm_text" class="mb-2">
                        <div class="text-gray-500 text-xs mb-1">LLM Text</div>
                        <pre class="p-2 rounded bg-gray-900 text-xs text-gray-300 font-mono max-h-24 overflow-y-auto whitespace-pre-wrap break-words">{{ it.llm_text }}</pre>
                      </div>

                      <div v-for="(tc, tci) in it.tool_calls" :key="tci" class="mb-2">
                        <div class="text-gray-500 text-xs mb-1">
                          Call: <span class="font-mono text-blue-300">{{ tc.name }}</span>
                        </div>
                        <pre v-if="tc.input" class="p-2 rounded bg-gray-900 text-xs text-gray-300 font-mono max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{{ formatJSON(tc.input) }}</pre>
                      </div>

                      <div v-for="(tr, tri) in it.tool_results" :key="tri" class="mb-2">
                        <div class="text-gray-500 text-xs mb-1">
                          Result: <span class="font-mono" :class="tr.error ? 'text-red-400' : 'text-green-400'">{{ tr.name || 'result ' + tri }}</span>
                        </div>
                        <pre class="p-2 rounded text-xs font-mono max-h-40 overflow-y-auto whitespace-pre-wrap break-all"
                             :class="tr.error ? 'bg-red-950/30 text-red-300' : 'bg-gray-900 text-gray-300'">{{ truncateBlock(formatJSON(tr.output || tr.result || tr.error || tr), 5000) }}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Final response -->
              <div v-if="entries[expandedIdx].final_response">
                <div class="text-gray-400 text-xs mb-1">Final Response</div>
                <pre class="p-2 rounded bg-gray-900 text-xs text-gray-300 font-mono max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{{ truncateBlock(entries[expandedIdx].final_response, 5000) }}</pre>
              </div>

              <context-assembly-panel
                v-if="entries[expandedIdx].context_trace"
                :trace="entries[expandedIdx].context_trace" />
            </div>
                    </div>
                  </td>
                </tr>
                </template>
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),n=f(null),a=f(null),i=f(null),l=f(""),r=f(""),o=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(A){if(!A)return"—";try{const T=new Date(A);return isNaN(T.getTime())?A:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return A}}function p(A){return!A&&A!==0?"—":A<1e3?A+"ms":(A/1e3).toFixed(1)+"s"}function h(A){return!A&&A!==0?"—":A>=1e3?(A/1e3).toFixed(1)+"k":String(A)}function m(A){if(!A)return"";if(typeof A=="string")return A;try{return JSON.stringify(A,null,2)}catch{return String(A)}}function v(A){a.value===A?a.value=null:(a.value=A,c.value={})}function C(A,T){const _=A+"-"+T;c.value={...c.value,[_]:!c.value[_]}}function L(A,T){return!!c.value[A+"-"+T]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,S()}async function g(){try{const A=await W.get("/api/trajectories");e.value=A.files||[],o.value=A.count||0}catch{}}let b=0;async function S(){const A=++b;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await W.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(A!==b)return;let _=T.entries||[];d.value.tool_name&&(_=_.filter(D=>(D.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(_=_.filter(D=>D.is_error)),d.value.channel_id&&(_=_.filter(D=>D.channel_id===d.value.channel_id)),d.value.user_id&&(_=_.filter(D=>D.user_id===d.value.user_id)),t.value=_}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const _=T.toString(),D=await W.get(`/api/trajectories/search/query?${_}`);if(A!==b)return;t.value=D.results||[]}}catch(T){if(A!==b)return;n.value=T.message}A===b&&(s.value=!1)}async function k(){if(!l.value.trim())return;const A=++b;s.value=!0,n.value=null,c.value={};try{const T=await W.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(A!==b)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(A!==b)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}A===b&&(s.value=!1)}return We(async()=>{await g(),await S()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:Em,toggleExpand:v,toggleIteration:C,isIterationExpanded:L,clearFilters:y,fetchFiles:g,fetchTraces:S,lookupMessage:k}}},Aw={template:`
    <div class="p-6 page-fade-in" role="region" aria-label="Usage">
      <!-- Loading -->
      <div v-if="loading" class="space-y-4" role="status" aria-label="Loading usage data">
        <div class="hm-card"><div class="skeleton skeleton-text" style="width:200px;"></div></div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="n in 4" :key="n" class="hm-card text-center">
            <div class="skeleton skeleton-stat"></div>
            <div class="skeleton skeleton-text" style="width:60%;margin:0.25rem auto 0;"></div>
          </div>
        </div>
      </div>

      <!-- Error -->
      <!-- Full-page error ONLY when there is nothing to show. A failed
           background refresh must not replace data we already have:
           one 502 during a restart used to blank a page that had been
           rendering fine, until the next poll a full interval later. -->
      <div v-else-if="error && !hasData" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <div v-if="error && hasData" class="hm-card border-amber-900 mb-3" role="status" aria-live="polite">
          <p class="text-amber-400 text-sm">Last refresh failed: {{ error }} — showing the most recent data.</p>
        </div>
        <!-- Totals -->
        <h2 class="text-lg font-semibold mb-3 text-slate-200">LLM Usage</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="hm-card stat-card text-center">
            <div class="text-2xl font-bold text-white">{{ fmtNum(totals.requests) }}</div>
            <div class="text-xs text-slate-400 mt-1">Requests</div>
          </div>
          <div class="hm-card stat-card text-center">
            <div class="text-2xl font-bold text-white">{{ fmtNum(totals.input_tokens) }}</div>
            <div class="text-xs text-slate-400 mt-1">Input Tokens</div>
          </div>
          <div class="hm-card stat-card text-center">
            <div class="text-2xl font-bold text-white">{{ fmtNum(totals.output_tokens) }}</div>
            <div class="text-xs text-slate-400 mt-1">Output Tokens</div>
          </div>
          <div class="hm-card stat-card text-center">
            <div class="text-2xl font-bold text-emerald-400">\${{ totals.cost_usd.toFixed(4) }}</div>
            <div class="text-xs text-slate-400 mt-1">Est. Cost (USD)</div>
          </div>
        </div>

        <!-- Tabs for breakdowns -->
        <div class="flex gap-2 mb-4">
          <button v-for="t in tabs" :key="t.key"
                  @click="activeTab = t.key"
                  class="btn text-xs"
                  :class="activeTab === t.key ? 'btn-primary' : 'btn-ghost'">
            {{ t.label }}
          </button>
        </div>

        <!-- By User -->
        <div v-if="activeTab === 'user'" class="hm-card">
          <div class="table-responsive">
            <table class="w-full text-sm">
            <thead><tr class="text-slate-400 text-left">
              <th class="pb-2">User</th><th class="pb-2 text-right">Requests</th>
              <th class="pb-2 text-right">Input</th><th class="pb-2 text-right">Output</th>
              <th class="pb-2 text-right">Cost</th>
            </tr></thead>
            <tbody>
              <tr v-for="(v, uid) in data.by_user" :key="uid" class="border-t border-slate-700">
                <td class="py-1 text-slate-200">{{ uid }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.requests) }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.input_tokens) }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.output_tokens) }}</td>
                <td class="py-1 text-right text-emerald-400">\${{ v.cost_usd.toFixed(4) }}</td>
              </tr>
              <tr v-if="!Object.keys(data.by_user).length">
                <td colspan="5" class="py-4 text-center text-slate-500">No usage data yet</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <!-- By Channel -->
        <div v-if="activeTab === 'channel'" class="hm-card">
          <div class="table-responsive">
            <table class="w-full text-sm">
            <thead><tr class="text-slate-400 text-left">
              <th class="pb-2">Channel</th><th class="pb-2 text-right">Requests</th>
              <th class="pb-2 text-right">Input</th><th class="pb-2 text-right">Output</th>
              <th class="pb-2 text-right">Cost</th>
            </tr></thead>
            <tbody>
              <tr v-for="(v, cid) in data.by_channel" :key="cid" class="border-t border-slate-700">
                <td class="py-1 text-slate-200">{{ cid }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.requests) }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.input_tokens) }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.output_tokens) }}</td>
                <td class="py-1 text-right text-emerald-400">\${{ v.cost_usd.toFixed(4) }}</td>
              </tr>
              <tr v-if="!Object.keys(data.by_channel).length">
                <td colspan="5" class="py-4 text-center text-slate-500">No usage data yet</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <!-- By Tool -->
        <div v-if="activeTab === 'tool'" class="hm-card">
          <div class="table-responsive">
            <table class="w-full text-sm">
            <thead><tr class="text-slate-400 text-left">
              <th class="pb-2">Tool</th><th class="pb-2 text-right">Requests</th>
              <th class="pb-2 text-right">Input</th><th class="pb-2 text-right">Output</th>
              <th class="pb-2 text-right">Cost</th>
            </tr></thead>
            <tbody>
              <tr v-for="(v, tool) in data.by_tool" :key="tool" class="border-t border-slate-700">
                <td class="py-1 text-slate-200 font-mono">{{ tool }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.requests) }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.input_tokens) }}</td>
                <td class="py-1 text-right">{{ fmtNum(v.output_tokens) }}</td>
                <td class="py-1 text-right text-emerald-400">\${{ v.cost_usd.toFixed(4) }}</td>
              </tr>
              <tr v-if="!Object.keys(data.by_tool).length">
                <td colspan="5" class="py-4 text-center text-slate-500">No usage data yet</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <!-- Recent calls -->
        <div v-if="activeTab === 'recent'" class="hm-card">
          <div class="table-responsive">
            <table class="w-full text-sm">
            <thead><tr class="text-slate-400 text-left">
              <th class="pb-2">Time</th><th class="pb-2">User</th>
              <th class="pb-2 text-right">In</th><th class="pb-2 text-right">Out</th>
              <th class="pb-2 text-right">Cost</th><th class="pb-2">Tools</th>
            </tr></thead>
            <tbody>
              <tr v-for="(r, i) in recentReversed" :key="i" class="border-t border-slate-700">
                <td class="py-1 text-slate-400 text-xs">{{ formatTime(r.timestamp) }}</td>
                <td class="py-1 text-slate-200 text-xs">{{ r.user_id || '-' }}</td>
                <td class="py-1 text-right">{{ fmtNum(r.input_tokens) }}</td>
                <td class="py-1 text-right">{{ fmtNum(r.output_tokens) }}</td>
                <td class="py-1 text-right text-emerald-400">\${{ r.cost_usd.toFixed(4) }}</td>
                <td class="py-1 text-xs text-slate-400">{{ (r.tools_used || []).join(', ') || '-' }}</td>
              </tr>
              <tr v-if="!data.recent || !data.recent.length">
                <td colspan="6" class="py-4 text-center text-slate-500">No recent calls</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <div class="mt-4 text-xs text-slate-500">
          {{ data.pricing ? data.pricing.note : '' }}
        </div>
      </div>
    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=f({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=f("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=J(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const m=await W.get("/api/usage");n.value=m,a.value=m.totals||a.value,t.value=null,s.value=!0}catch(m){t.value=m.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function h(){u&&(u=!1,l&&(clearInterval(l),l=null))}return We(p),us(p),ts(h),mt(h),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:Am,formatTime:Tm,retry:d}}},Nm=[{id:"audit",label:"Audit",component:kw},{id:"sessions",label:"Sessions",component:Tw},{id:"traces",label:"Traces",component:Ew},{id:"usage",label:"Usage",component:Aw}],Rw={components:{TabbedPage:Hr},setup(){return{tabs:Nm}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},oo=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Iw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-xl font-semibold">Tools</h1>
          <p class="tl-panel-warning">Disabling a tool removes it from future model requests and causes stored jobs that call it to fail. Already-running calls are not cancelled.</p>
        </div>
        <div class="flex gap-2 items-center">
          <div class="tl-view-toggle" role="toolbar" aria-label="View mode">
            <button @click="viewMode = 'cards'" class="tl-view-btn" :class="{ 'tl-view-active': viewMode === 'cards' }" :aria-pressed="viewMode === 'cards'" aria-label="Card view"><odin-icon name="grid" :size="16" /></button>
            <button @click="viewMode = 'table'" class="tl-view-btn" :class="{ 'tl-view-active': viewMode === 'table' }" :aria-pressed="viewMode === 'table'" aria-label="Table view"><odin-icon name="list" :size="16" /></button>
          </div>
          <button @click="refresh" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading && tools.length === 0" class="space-y-3">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="n in 4" :key="n" class="hm-card text-center">
            <div class="skeleton skeleton-stat"></div>
            <div class="skeleton skeleton-text" style="width:60%;margin:0.25rem auto 0;"></div>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div v-for="n in 6" :key="n + 4" class="hm-card"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-text mt-2" style="width:80%"></div></div>
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="refresh" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <!-- Stats bar -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="tl-stat-card">
            <div class="tl-stat-value">{{ tools.length }}</div>
            <div class="tl-stat-label">Total Tools</div>
          </div>
          <div v-if="inventoryAvailable" class="tl-stat-card">
            <div class="tl-stat-value">{{ coreCount }}</div>
            <div class="tl-stat-label">Core Tools</div>
          </div>
          <div v-if="inventoryAvailable" class="tl-stat-card">
            <div class="tl-stat-value">{{ skillCount }}</div>
            <div class="tl-stat-label">Skill Tools</div>
          </div>
          <div class="tl-stat-card">
            <div class="tl-stat-value">{{ totalUsage.toLocaleString() }}</div>
            <div class="tl-stat-label">Total Executions</div>
          </div>
        </div>

        <!-- Search + Category filter -->
        <div class="flex flex-wrap gap-2 mb-4 items-center">
          <input v-model="search" type="text" class="hm-input tl-search" placeholder="Search tools by name or description..." />
          <div class="tl-category-chips" role="toolbar" aria-label="Filter by category">
            <button @click="activeCategory = null"
                    class="tl-category-chip" :class="{ 'tl-category-active': !activeCategory }"
                    :aria-pressed="!activeCategory">All</button>
            <button v-for="cat in usedCategories" :key="cat.id"
                    @click="activeCategory = activeCategory === cat.id ? null : cat.id"
                    class="tl-category-chip" :class="{ 'tl-category-active': activeCategory === cat.id }"
                    :aria-pressed="activeCategory === cat.id">
              <odin-icon :name="cat.icon" :size="15" /> {{ cat.label }}
            </button>
          </div>
        </div>

        <!-- CARD VIEW -->
        <div v-if="viewMode === 'cards'">
          <div v-for="group in groupedTools" :key="group.label" class="mb-5">
            <div class="tl-group-header">
              <span class="tl-group-icon"><odin-icon :name="group.icon" :size="17" /></span>
              <span class="tl-group-label">{{ group.label }}</span>
              <span class="badge badge-info">{{ group.tools.length }}</span>
            </div>
            <div class="tl-tool-grid">
              <div v-for="t in group.tools" :key="t.name"
                   class="tl-tool-card" :class="{ 'tl-tool-card-active': stats[t.name] > 0, 'tl-tool-off': t.source === 'builtin' && !t.enabled }"
                   role="button" tabindex="0" :aria-expanded="!!expanded[t.name]"
                   @click="toggleExpand(t.name)" @keydown.enter="toggleExpand(t.name)" @keydown.space.prevent="toggleExpand(t.name)">
                <div class="tl-tool-header">
                  <span class="tl-tool-name">{{ t.name }}</span>
                  <span v-if="stateBadge(t)" :class="['tl-state-badge', 'tl-state-' + t.state]">{{ stateBadge(t) }}</span>
                </div>
                <div class="tl-tool-desc">{{ truncate(t.description, 80) }}</div>
                <div class="tl-tool-footer">
                  <div class="tl-tool-usage">
                    <span v-if="stats[t.name]" class="tl-tool-usage-count">{{ stats[t.name].toLocaleString() }}</span>
                    <span v-else class="tl-tool-usage-zero">—</span>
                    <span class="tl-tool-usage-label">uses</span>
                  </div>
                  <label v-if="t.source === 'builtin'" class="tl-tool-switch" @click.stop @keydown.space.stop @keydown.enter.stop>
                    <span class="tl-tool-switch-label">Enabled for model</span>
                    <span class="toggle-switch" :aria-busy="togglePending.has(t.name) ? 'true' : 'false'">
                      <input type="checkbox" :checked="t.enabled" :disabled="togglePending.has(t.name)" :aria-label="'Enabled for model — ' + t.name" @change="toggleBuiltinTool(t, $event)" />
                      <span class="toggle-slider"></span>
                    </span>
                  </label>
                </div>
                <!-- Expanded detail -->
                <div v-if="expanded[t.name]" class="tl-tool-detail">
                  <div class="tl-tool-detail-desc">{{ t.description }}</div>
                  <div v-if="t.source === 'builtin' && t.is_core" class="tl-core-advisory">Core capability. Disabling it may cause automation, recovery, or stored workflows that depend on it to fail.</div>
                  <div v-if="t.input_schema && t.input_schema.properties" class="tl-tool-params">
                    <div class="tl-tool-params-title">Parameters</div>
                    <div v-for="(prop, pname) in t.input_schema.properties" :key="pname" class="tl-tool-param">
                      <span class="tl-tool-param-name">{{ pname }}</span>
                      <span v-if="prop.type" class="tl-tool-param-type">{{ prop.type }}</span>
                      <span v-if="(t.input_schema.required || []).includes(pname)" class="tl-tool-param-req">required</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TABLE VIEW (classic) -->
        <div v-if="viewMode === 'table'">
          <div v-for="group in groupedTools" :key="group.label" class="mb-4">
            <div class="tl-group-header">
              <span class="tl-group-icon"><odin-icon :name="group.icon" :size="17" /></span>
              <span class="tl-group-label">{{ group.label }}</span>
              <span class="badge badge-info">{{ group.tools.length }}</span>
            </div>
            <div class="table-responsive">
            <table class="hm-table">
              <thead>
                <tr>
                  <th style="width:30%">Name</th>
                  <th class="mobile-hide">Description</th>
                  <th style="width:100px" class="text-right">Uses</th>
                  <th style="width:160px" class="text-right">Enabled for model</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="t in group.tools" :key="t.name">
                  <tr class="cursor-pointer" :class="{ 'tl-tool-off': t.source === 'builtin' && !t.enabled }" role="button" tabindex="0" :aria-expanded="!!expanded[t.name]"
                      @click="toggleExpand(t.name)" @keydown.enter="toggleExpand(t.name)" @keydown.space.prevent="toggleExpand(t.name)">
                    <td class="font-mono text-sm whitespace-nowrap">
                      <span class="tool-expand-icon text-gray-600 mr-1" aria-hidden="true"><odin-icon :name="expanded[t.name] ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
                      {{ t.name }}
                      <span v-if="stateBadge(t)" :class="['tl-state-badge', 'tl-state-' + t.state]">{{ stateBadge(t) }}</span>
                    </td>
                    <td class="text-gray-400 text-sm mobile-hide">{{ truncate(t.description, 100) }}</td>
                    <td class="text-right">
                      <div class="flex items-center justify-end gap-2">
                        <span v-if="stats[t.name]" class="text-gray-300 text-sm font-mono">{{ stats[t.name].toLocaleString() }}</span>
                        <span v-else class="text-gray-600 text-sm">—</span>
                      </div>
                    </td>
                    <td class="text-right">
                      <label v-if="t.source === 'builtin'" class="tl-tool-switch" @click.stop @keydown.space.stop @keydown.enter.stop>
                        <span class="toggle-switch" :aria-busy="togglePending.has(t.name) ? 'true' : 'false'">
                          <input type="checkbox" :checked="t.enabled" :disabled="togglePending.has(t.name)" :aria-label="'Enabled for model — ' + t.name" @change="toggleBuiltinTool(t, $event)" />
                          <span class="toggle-slider"></span>
                        </span>
                      </label>
                    </td>
                  </tr>
                  <tr v-if="expanded[t.name]" class="tool-detail-row">
                    <td colspan="4" class="tool-detail-cell">
                      <div class="text-gray-300 text-sm whitespace-pre-wrap">{{ t.description }}</div>
                      <div v-if="t.source === 'builtin' && t.is_core" class="tl-core-advisory">Core capability. Disabling it may cause automation, recovery, or stored workflows that depend on it to fail.</div>
                      <div v-if="t.input_schema && t.input_schema.properties" class="tl-tool-params">
                        <div class="tl-tool-params-title">Parameters</div>
                        <div v-for="(prop, pname) in t.input_schema.properties" :key="pname" class="tl-tool-param">
                          <span class="tl-tool-param-name">{{ pname }}</span>
                          <span v-if="prop.type" class="tl-tool-param-type">{{ prop.type }}</span>
                          <span v-if="(t.input_schema.required || []).includes(pname)" class="tl-tool-param-req">required</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <!-- Empty search state -->
        <div v-if="filteredTools.length === 0 && search" class="hm-card empty-state">
          <span class="empty-state-icon"><odin-icon name="search" :size="23" /></span>
          <span class="empty-state-text">No tools match "{{ search }}"</span>
          <span class="empty-state-hint">Try a different search term</span>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(""),a=f({}),i=f({}),l=f("cards"),r=f(null),o=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(_){return _.source!=="builtin"?"":u[_.state]||""}function h(_,D){const E=_&&Array.isArray(_.tools)?_.tools:null;if(c.value=!!E,o.value=E?!!_.global_enabled:null,!E){e.value=D.map(V=>({...V,source:"unknown",enabled:void 0,state:null}));return}const R=new Set(E.map(V=>V.name)),$=D.filter(V=>!R.has(V.name)).map(V=>({...V,source:V.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...E.map(V=>({...V,source:"builtin"})),...$]}async function m(_,D){if(d.value.has(_.name))return;const E=!!D.target.checked,R=new Set(d.value);R.add(_.name),d.value=R;try{const $=await W.post(`/api/tools/builtins/${encodeURIComponent(_.name)}/enabled`,{enabled:E});h($,e.value),s.value=null;try{const V=await W.get("/api/tools");h($,V)}catch(V){console.warn("Built-in toggle committed; visible catalog refresh failed",V)}}catch($){D.target.checked=!!_.enabled,s.value=$.message||`Failed to toggle ${_.name}`}finally{const $=new Set(d.value);$.delete(_.name),d.value=$}}const v=J(()=>e.value.filter(_=>_.source==="builtin"&&_.is_core).length),C=J(()=>e.value.filter(_=>_.source==="skill").length),L=J(()=>Object.values(a.value).reduce((_,D)=>_+D,0));function y(_){for(const D of oo)if(D.id!=="other"&&D.match(_))return D.id;return"other"}const g=J(()=>{let _=e.value;if(n.value){const D=n.value.toLowerCase();_=_.filter(E=>E.name.toLowerCase().includes(D)||(E.description||"").toLowerCase().includes(D))}return r.value&&(_=_.filter(D=>y(D.name)===r.value)),_}),b=J(()=>{const _=new Set;for(const D of e.value)_.add(y(D.name));return oo.filter(D=>_.has(D.id))}),S=J(()=>{const _=g.value,D={};for(const R of _){const $=y(R.name);D[$]||(D[$]=[]),D[$].push(R)}const E=[];for(const R of oo)D[R.id]&&D[R.id].length>0&&E.push({label:R.label,icon:R.icon,tools:D[R.id].sort(($,V)=>$.name.localeCompare(V.name))});return E});function k(_){i.value={...i.value,[_]:!i.value[_]}}async function A(){t.value=!0,s.value=null;try{const[_,D,E]=await Promise.all([W.get("/api/tools"),W.get("/api/tools/stats").catch(()=>({})),W.get("/api/tools/builtins").catch(()=>null)]);h(E,_),a.value=D||{}}catch(_){s.value=_.message}t.value=!1}function T(){A()}return We(()=>{A()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,globalEnabled:o,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:C,totalUsage:L,filteredTools:g,groupedTools:S,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:sd,toggleExpand:k,refresh:T}}};function Ow(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Lw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const Nw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Skills</h1>
        <div class="flex gap-2 items-center">
          <button @click="showCreate" class="btn btn-primary text-xs">New Skill</button>
          <button @click="fetchSkills" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Stats summary -->
      <div v-if="skills.length > 0 && !editing" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="sk-stat-card">
          <div class="sk-stat-value">{{ skills.length }}</div>
          <div class="sk-stat-label">Total Skills</div>
        </div>
        <div class="sk-stat-card">
          <div class="sk-stat-value">{{ enabledCount }}</div>
          <div class="sk-stat-label">Active Skills</div>
        </div>
        <div class="sk-stat-card">
          <div class="sk-stat-value">{{ totalExecutions.toLocaleString() }}</div>
          <div class="sk-stat-label">Total Runs</div>
        </div>
        <div class="sk-stat-card">
          <div class="sk-stat-value">{{ totalLines.toLocaleString() }}</div>
          <div class="sk-stat-label">Lines of Code</div>
        </div>
      </div>

      <!-- Search/filter (when not editing) -->
      <div v-if="skills.length > 0 && !editing" class="mb-4">
        <input v-model="search" type="text" class="hm-input sk-search" placeholder="Search skills by name or description..." />
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading && skills.length === 0" class="space-y-3">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="n in 4" :key="n" class="hm-card text-center">
            <div class="skeleton skeleton-stat"></div>
            <div class="skeleton skeleton-text" style="width:60%;margin:0.25rem auto 0;"></div>
          </div>
        </div>
        <div v-for="n in 3" :key="n + 4" class="hm-card"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-text mt-2" style="width:70%"></div></div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchSkills" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <!-- Empty state -->
      <div v-else-if="skills.length === 0 && !editing" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="puzzle" :size="23" /></span>
        <span class="empty-state-text">No skills loaded</span>
        <span class="empty-state-hint">Click "New Skill" to create a custom tool</span>
      </div>

      <!-- Skill cards -->
      <div v-else-if="!editing">
        <div class="sk-card-grid">
          <div v-for="s in displayedSkills" :key="s.name" class="sk-card" :class="{ 'sk-card-tested': testResults[s.name] }">
            <!-- Card header -->
            <div class="sk-card-header">
              <div class="sk-card-title-row">
                <span class="sk-card-icon"><odin-icon name="puzzle" :size="17" /></span>
                <span class="sk-card-name">{{ s.name }}</span>
                <span v-if="s.execution_count > 0" class="sk-card-runs">{{ s.execution_count.toLocaleString() }} runs</span>
              </div>
              <div class="sk-card-actions">
                <button @click.stop="testSkill(s.name)"
                        class="sk-action-btn sk-action-test"
                        :disabled="testing === s.name"
                        :title="testing === s.name ? 'Testing...' : 'Run test'">
                  <odin-icon :name="testing === s.name ? 'clock' : 'play'" :size="15" />
                </button>
                <button @click.stop="toggleCode(s.name)"
                        class="sk-action-btn sk-action-code"
                        :title="showCode[s.name] ? 'Hide code' : 'View code'">
                  <odin-icon :name="showCode[s.name] ? 'book' : 'file'" :size="15" />
                </button>
                <button @click.stop="editSkill(s)" class="sk-action-btn sk-action-edit" title="Edit" aria-label="Edit skill"><odin-icon name="edit" :size="14" /></button>
                <button @click.stop="confirmDelete(s.name)" class="sk-action-btn sk-action-delete" title="Delete" aria-label="Delete skill"><odin-icon name="trash" :size="14" /></button>
              </div>
            </div>

            <!-- Card body -->
            <div class="sk-card-body">
              <div class="sk-card-desc">{{ s.description || 'No description' }}</div>
              <div class="sk-card-meta">
                <span class="sk-card-date">Loaded: {{ formatTs(s.loaded_at) }}</span>
                <span v-if="s.code" class="sk-card-lines">{{ countLines(s.code) }} lines</span>
              </div>
            </div>

            <!-- Test result -->
            <div v-if="testResults[s.name]" class="sk-test-result"
                 :class="testResults[s.name].is_error ? 'sk-test-fail' : 'sk-test-pass'">
              <div class="sk-test-label">
                {{ testResults[s.name].is_error ? 'Test failed' : 'Test passed' }}
              </div>
              <div class="sk-test-output">{{ truncate(testResults[s.name].result, 500) }}</div>
            </div>

            <!-- Code preview with line numbers -->
            <div v-if="showCode[s.name] && s.code" class="sk-code-container">
              <div class="sk-code-header">
                <span class="sk-code-filename">{{ s.name }}.py</span>
                <button @click.stop="copyCode(s.code)" class="sk-code-copy" title="Copy code">
                  <odin-icon :name="copied === s.name ? 'success' : 'copy'" :size="15" />
                </button>
              </div>
              <div class="sk-code-wrap">
                <pre class="sk-line-numbers">{{ getLineNumbers(s.code) }}</pre>
                <pre class="sk-code-block"><code v-html="highlight(s.code)"></code></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty search -->
        <div v-if="displayedSkills.length === 0 && search" class="hm-card empty-state">
          <span class="empty-state-icon"><odin-icon name="search" :size="23" /></span>
          <span class="empty-state-text">No skills match "{{ search }}"</span>
          <span class="empty-state-hint">Try a different search term</span>
        </div>
      </div>

      <!-- Create/Edit form with enhanced editor -->
      <div v-if="editing" class="sk-editor-panel">
        <div class="sk-editor-header">
          <h2 class="sk-editor-title">
            {{ editMode === 'create' ? 'Create Skill' : 'Edit Skill: ' + editName }}
          </h2>
          <button @click="cancelEdit" class="btn btn-ghost text-xs">Cancel</button>
        </div>

        <div v-if="editMode === 'create'" class="mb-3">
          <label class="sk-field-label">Name
          <input v-model="editName" type="text" class="hm-input" placeholder="my_skill"
                 style="max-width:300px" />
          </label>
          <div class="sk-field-hint">Lowercase, alphanumeric + underscores, starts with letter</div>
        </div>

        <div class="mb-3">
          <span class="sk-field-label">Code</span>
          <div class="sk-editor-wrap">
            <div class="sk-editor-gutter">{{ editorLineNums }}</div>
            <textarea v-model="editCode" class="sk-editor-textarea" rows="24"
                      @keydown="handleEditorKey"
                      @scroll="syncScroll"
                      ref="editorRef"
                      placeholder="# Skill code here...&#10;&#10;SKILL_DEFINITION = {&#10;    'name': 'my_skill',&#10;    'description': 'What this skill does',&#10;    'input_schema': {&#10;        'type': 'object',&#10;        'properties': {},&#10;    },&#10;}&#10;&#10;async def execute(tool_input, context):&#10;    return 'result'"></textarea>
          </div>
          <div class="sk-editor-status">
            <span class="sk-editor-line-count">{{ editLineCount }} lines</span>
            <span class="sk-editor-char-count">{{ editCode.length.toLocaleString() }} chars</span>
          </div>
        </div>

        <!-- Validation preview -->
        <div v-if="editCode && editValidation" class="sk-validation-box"
             :class="editValidation.valid ? 'sk-validation-ok' : 'sk-validation-err'">
          <span>{{ editValidation.valid ? 'Valid Python structure' : editValidation.message }}</span>
        </div>

        <div v-if="editError" class="mb-3 p-2 rounded bg-red-950/30 border border-red-900/50">
          <div class="text-red-400 text-sm font-semibold mb-1">Error</div>
          <div class="text-red-300 text-sm whitespace-pre-wrap">{{ editError }}</div>
        </div>
        <div v-if="editSuccess" class="mb-3 text-green-400 text-sm">{{ editSuccess }}</div>

        <div class="flex gap-2">
          <button @click="saveSkill" class="btn btn-primary text-xs" :disabled="saving">
            {{ saving ? 'Saving...' : (editMode === 'create' ? 'Create' : 'Save') }}
          </button>
          <button @click="cancelEdit" class="btn btn-ghost text-xs">Cancel</button>
        </div>
      </div>

      <!-- Delete confirmation -->
      <div v-if="deleteTarget" class="modal-overlay" v-modal-focus @click.self="deleteTarget = null" @keyup.escape="deleteTarget = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="skill-delete-title">
        <div class="modal-content">
          <h3 id="skill-delete-title" class="text-lg font-semibold mb-2">Delete Skill</h3>
          <p class="text-gray-400 text-sm mb-4">
            Delete skill <span class="font-mono font-semibold text-gray-200">{{ deleteTarget }}</span>? This cannot be undone.
          </p>
          <div class="flex gap-2 justify-end">
            <button @click="deleteTarget = null" class="btn btn-ghost">Cancel</button>
            <button @click="doDelete" class="btn btn-danger" :disabled="deleting">
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f({}),a=f({}),i=f(null),l=f(""),r=f(null),o=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),C=f(null),L=f(!1),y=J(()=>e.value.length),g=J(()=>e.value.reduce((X,fe)=>X+(fe.execution_count||0),0)),b=J(()=>e.value.reduce((X,fe)=>X+D(fe.code),0)),S=J(()=>{if(!l.value)return e.value;const X=l.value.toLowerCase();return e.value.filter(fe=>fe.name.toLowerCase().includes(X)||(fe.description||"").toLowerCase().includes(X))}),k=J(()=>u.value?u.value.split(`
`).length:0),A=J(()=>{const X=Math.max(k.value,1);return Array.from({length:X},(fe,Pe)=>Pe+1).join(`
`)}),T=J(()=>{const X=u.value.trim();return X?X.includes("SKILL_DEFINITION")?X.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function _(X){return Ow(X)}function D(X){return X?X.split(`
`).length:0}function E(X){return Lw(X)}function R(X){n.value={...n.value,[X]:!n.value[X]}}async function $(X){try{await navigator.clipboard.writeText(X);const fe=e.value.find(Pe=>Pe.code===X);fe&&(r.value=fe.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function V(X){if(X.key==="Tab"){X.preventDefault();const fe=X.target,Pe=fe.selectionStart,Y=fe.selectionEnd;u.value=u.value.substring(0,Pe)+"    "+u.value.substring(Y),Et(()=>{fe.selectionStart=fe.selectionEnd=Pe+4})}}function oe(X){const fe=X.target.previousElementSibling;fe&&(fe.scrollTop=X.target.scrollTop)}async function P(){t.value=!0,s.value=null;try{e.value=await W.get("/api/skills")}catch(X){s.value=X.message}t.value=!1}async function N(X){i.value=X,delete a.value[X],a.value={...a.value};try{const fe=await W.post(`/api/skills/${encodeURIComponent(X)}/test`);a.value={...a.value,[X]:fe}}catch(fe){a.value={...a.value,[X]:{result:fe.message,is_error:!0}}}i.value=null}function O(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function U(X){o.value=!0,c.value="edit",d.value=X.name,u.value=X.code||"",p.value=null,h.value=null}function K(){o.value=!1,p.value=null,h.value=null}async function q(){p.value=null,h.value=null;const X=d.value.trim(),fe=u.value.trim();if(!X){p.value="Name is required";return}if(!fe){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await W.post("/api/skills",{name:X,code:fe}),h.value="Skill created successfully"):(await W.put(`/api/skills/${encodeURIComponent(X)}`,{code:fe}),h.value="Skill updated successfully"),await P(),setTimeout(()=>{o.value=!1},800)}catch(Pe){p.value=Pe.message}m.value=!1}function Q(X){C.value=X}async function ie(){if(C.value){L.value=!0;try{await W.del(`/api/skills/${encodeURIComponent(C.value)}`),await P()}catch(X){Re.error(`Failed to delete skill: ${X.message||"unknown error"}`)}L.value=!1,C.value=null}}return We(()=>{P()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:C,deleting:L,enabledCount:y,totalExecutions:g,totalLines:b,displayedSkills:S,editLineCount:k,editorLineNums:A,editValidation:T,highlight:_,truncate:sd,formatTs:ka,countLines:D,getLineNumbers:E,toggleCode:R,copyCode:$,handleEditorKey:V,syncScroll:oe,fetchSkills:P,testSkill:N,showCreate:O,editSkill:U,cancelEdit:K,saveSkill:q,confirmDelete:Q,doDelete:ie}}};class Ls extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Dw=/^[A-Za-z_][A-Za-z0-9_]*$/;function ju(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Vu(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const r=String((l==null?void 0:l.key)||"").trim(),o=String((l==null?void 0:l.value)??"");if(!(!r&&!o)){if(!r)throw new Ls(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(r))throw new Ls(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,r))throw new Ls(`${s} key “${r}” appears more than once.`,"authentication");if(i.has(r))throw new Ls(`${s} key “${r}” cannot be replaced and removed in the same save.`,"authentication");n[r]=o}}return{set:n,remove:a}}function Mw(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Pw(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Ls("Server name is required.","name");if(a.length>128||!Dw.test(a))throw new Ls("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,r={enabled:!!e.enabled,transport:i};if(n&&(r.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Ls("An executable path is required for a new stdio connection.","command");if(d&&(r.command=d),(n||e.replaceArgs)&&(r.args=ju(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Ls("Working directory must be an absolute path.","cwd");r.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Ls("An HTTP endpoint is required for this connection.","url");if(d&&!Mw(d))throw new Ls("Endpoint must be a valid http:// or https:// URL.","url");d&&(r.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Ls("Timeout must be a whole number from 1 to 3600 seconds.","timeout");r.timeout_seconds=d}(n||e.replaceAllowlist)&&(r.tool_allowlist=ju(e.allowlistText));const o=Vu(e.headerRows,e.headersRemove,"Header"),c=Vu(e.envRows,e.envRemove,"Environment variable");return Object.keys(o.set).length&&(r.headers_set=o.set),o.remove.length&&(r.headers_remove=o.remove),Object.keys(c.set).length&&(r.env_set=c.set),c.remove.length&&(r.env_remove=c.remove),r}function Fw(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function $w(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Uw(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const Bw=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Hw(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const zw=1e4,jw=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function co(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Vw(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const qw={template:`
    <div class="mcp-page p-6 page-fade-in">
      <header class="mcp-page-header">
        <div>
          <div class="mcp-eyebrow">Model Context Protocol</div>
          <h1 class="text-xl font-semibold">MCP Servers</h1>
          <p class="mcp-lede">Connect tool providers over stdio or Streamable HTTP. Only current, connected, validated tools enter the model catalog.</p>
        </div>
        <div class="mcp-header-actions">
          <button type="button" class="btn btn-ghost text-xs" @click="refreshAll" :disabled="loading || mutating">
            <odin-icon name="refresh" :size="15" /> {{ loading ? 'Refreshing' : 'Refresh' }}
          </button>
          <button type="button" class="btn btn-primary text-xs" @click="openAdd" :disabled="mutating">
            <odin-icon name="plus" :size="15" /> Add server
          </button>
        </div>
      </header>

      <div v-if="loading && !status" class="mcp-loading" aria-label="Loading MCP servers">
        <div class="hm-card skeleton skeleton-row"></div>
        <div v-for="n in 2" :key="n" class="hm-card"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-text mt-3"></div></div>
      </div>

      <div v-else-if="pageError && !status" class="hm-card error-state" role="alert">
        <span class="error-icon"><odin-icon name="warning" :size="21" /></span>
        <div><strong>Could not load MCP management</strong><p>{{ pageError }}</p></div>
        <button type="button" class="btn btn-ghost text-xs" @click="refreshAll">Retry</button>
      </div>

      <template v-else>
        <section class="mcp-control-card" aria-labelledby="mcp-control-title">
          <div class="mcp-control-main">
            <div class="mcp-control-icon" aria-hidden="true"><odin-icon name="network" :size="22" /></div>
            <div>
              <div class="mcp-control-title-row">
                <h2 id="mcp-control-title">MCP tool publication</h2>
                <span :class="['mcp-master-state', masterEnabled ? 'enabled' : 'disabled']">{{ masterEnabled ? 'Enabled' : 'Disabled' }}</span>
              </div>
              <p>{{ masterEnabled ? 'Enabled servers may connect and publish validated tools.' : 'All MCP tools are unpublished and transports are stopped.' }}</p>
            </div>
          </div>
          <label class="mcp-master-toggle">
            <span class="sr-only">Enable MCP servers globally</span>
            <span class="toggle-switch">
              <input type="checkbox" :checked="masterEnabled" @change="setMasterEnabled($event.target.checked)" :disabled="mutating" />
              <span class="toggle-slider"></span>
            </span>
          </label>
          <div class="mcp-aggregate" aria-label="MCP aggregate status">
            <div><strong>{{ aggregate.serverCount }}</strong><span>Configured</span></div>
            <div><strong>{{ aggregate.enabledCount }}</strong><span>Enabled</span></div>
            <div><strong>{{ aggregate.connectedCount }}</strong><span>Connected</span></div>
            <div><strong>{{ aggregate.toolCount }}</strong><span>Published tools</span></div>
          </div>
        </section>

        <div v-if="pageError" class="mcp-inline-error" role="alert">
          <odin-icon name="warning" :size="15" /><span>{{ pageError }}</span>
          <button type="button" @click="pageError = ''" aria-label="Dismiss error"><odin-icon name="close" :size="13" /></button>
        </div>

        <section class="mcp-server-section" aria-labelledby="mcp-server-heading">
          <div class="mcp-section-heading">
            <div><h2 id="mcp-server-heading">Configured servers</h2><p>Saved configuration and current runtime state are shown separately. A failed connection remains saved.</p></div>
            <span>{{ servers.length }} server{{ servers.length === 1 ? '' : 's' }}</span>
          </div>

          <div v-if="!servers.length" class="hm-card empty-state mcp-empty">
            <span class="empty-state-icon"><odin-icon name="network" :size="22" /></span>
            <h3>No MCP servers configured</h3>
            <p>Add a stdio process or Streamable HTTP endpoint. Static authentication is supported; interactive OAuth is not.</p>
            <button type="button" class="btn btn-primary text-xs" @click="openAdd">Add your first server</button>
          </div>

          <article v-for="server in servers" :key="server.name" :class="['mcp-server-card', 'state-' + serverState(server), { 'mcp-card-off': !server.enabled }]">
            <header class="mcp-server-header">
              <div class="mcp-server-identity">
                <span :class="['mcp-state-indicator', serverState(server)]" aria-hidden="true"></span>
                <div>
                  <div class="mcp-server-title-row">
                    <h3>{{ server.name }}</h3>
                    <span :class="['mcp-state-pill', serverState(server)]">{{ stateLabel(server) }}</span>
                  </div>
                  <div class="mcp-server-subtitle">
                    <span><odin-icon :name="server.transport === 'http' ? 'globe' : 'terminal'" :size="13" /> {{ transportLabel(server) }}</span>
                    <span>{{ protocolLabel(server) }}</span>
                    <span>Refresh {{ formatAge(server.last_refresh_age_seconds) }}</span>
                  </div>
                </div>
              </div>
              <label class="mcp-card-switch">
                <span class="mcp-card-switch-copy"><strong>Server enabled</strong><small>Takes effect immediately and changes tool availability.</small></span>
                <span class="toggle-switch" :aria-busy="togglePending.has(server.name) ? 'true' : 'false'">
                  <input type="checkbox" :checked="server.enabled" :disabled="togglePending.has(server.name)" :aria-label="'Server enabled — ' + server.name" @change="toggleServerEnabled(server, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <div class="mcp-server-actions">
                <button type="button" class="btn btn-ghost text-xs" @click="refreshTools(server)" :disabled="busy(server.name) || !masterEnabled || !server.enabled" title="Re-list tools without rebuilding the transport">
                  <odin-icon name="refresh" :size="14" /> Refresh tools
                </button>
                <button type="button" class="btn btn-ghost text-xs" @click="reconnect(server)" :disabled="busy(server.name) || !masterEnabled || !server.enabled" title="Retire and rebuild the connection">
                  <odin-icon name="rotate" :size="14" /> Reconnect
                </button>
                <button type="button" class="icon-btn" @click="openEdit(server)" :disabled="busy(server.name)" :aria-label="'Edit ' + server.name" title="Edit server">
                  <odin-icon name="edit" :size="15" />
                </button>
                <button type="button" class="icon-btn danger" @click="removeServer(server)" :disabled="busy(server.name)" :aria-label="'Remove ' + server.name" title="Remove server">
                  <odin-icon name="trash" :size="15" />
                </button>
              </div>
            </header>

            <div class="mcp-server-body">
              <div class="mcp-metrics">
                <div><strong>{{ server.discovered_count || 0 }}</strong><span>Discovered</span></div>
                <div><strong>{{ server.published_count || 0 }}</strong><span>Published</span></div>
                <div><strong>{{ server.excluded_count || 0 }}</strong><span>Excluded</span></div>
                <div><strong>{{ server.generation || '—' }}</strong><span>Generation</span></div>
              </div>

              <div v-if="server.blocked_reason || server.last_error" :class="['mcp-server-message', server.blocked_reason ? 'blocked' : 'error']" role="status">
                <odin-icon :name="server.blocked_reason ? 'shield' : 'warning'" :size="15" />
                <div><strong>{{ server.blocked_reason ? 'Publication blocked' : 'Last error' }}</strong><p>{{ server.blocked_reason || server.last_error }}</p></div>
              </div>

              <details v-if="server.transport === 'stdio' && server.stderr_tail" class="mcp-stderr">
                <summary>stderr tail</summary>
                <pre>{{ server.stderr_tail }}</pre>
              </details>

              <div class="mcp-tool-disclosure">
                <button type="button" class="mcp-tools-toggle" @click="toggleTools(server)" :aria-expanded="expandedServers.has(server.name)" :aria-controls="'mcp-tools-' + server.name">
                  <span><odin-icon :name="expandedServers.has(server.name) ? 'chevronDown' : 'chevronRight'" :size="15" /> Tools</span>
                  <span>{{ toolSummary(server) }}</span>
                </button>

                <div v-if="expandedServers.has(server.name)" :id="'mcp-tools-' + server.name" class="mcp-tools-panel">
                  <div class="mcp-tool-search">
                    <odin-icon name="search" :size="15" />
                    <input type="search" :value="toolQueries[server.name] || ''" @input="setToolQuery(server.name, $event.target.value)" placeholder="Search original names, published names, descriptions, or exclusions" :aria-label="'Search tools from ' + server.name" />
                    <span v-if="toolsLoading.has(server.name)">Loading…</span>
                  </div>
                  <div v-if="toolErrors[server.name]" class="mcp-tool-error" role="alert">{{ toolErrors[server.name] }}</div>
                  <div v-else-if="!toolsLoading.has(server.name) && !filteredTools(server.name).length" class="mcp-tool-empty">
                    {{ (toolQueries[server.name] || '').trim() ? 'No tools match this search.' : 'No discovered tools are available.' }}
                  </div>
                  <div v-else class="mcp-tool-list">
                    <div v-for="tool in filteredTools(server.name)" :key="tool.original_name + ':' + (tool.published_name || '')" class="mcp-tool-row">
                      <div class="mcp-tool-names">
                        <code>{{ tool.original_name }}</code>
                        <span v-if="tool.published_name"><odin-icon name="chevronRight" :size="12" /><code>{{ tool.published_name }}</code></span>
                        <span v-else class="mcp-not-published">Not published</span>
                      </div>
                      <span :class="['mcp-tool-state', tool.published ? 'published' : (tool.excluded ? 'excluded' : 'unpublished')]">{{ tool.published ? 'Published' : (tool.excluded ? 'Excluded' : 'Not published') }}</span>
                      <p v-if="tool.description">{{ tool.description }}</p>
                      <p v-if="tool.exclusion_reason" class="mcp-exclusion"><strong>Reason:</strong> {{ tool.exclusion_reason }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>
      </template>

      <div v-if="editorOpen" class="modal-overlay mcp-modal-overlay" v-modal-focus @click.self="closeEditor" @keyup.escape="closeEditor" tabindex="-1" role="dialog" aria-modal="true" :aria-labelledby="'mcp-editor-title'">
        <form class="modal-content mcp-editor" @submit.prevent="saveServer">
          <header class="mcp-editor-header">
            <div>
              <div class="mcp-eyebrow">{{ editorMode === 'add' ? 'New connection' : 'Saved connection' }}</div>
              <h2 id="mcp-editor-title">{{ editorMode === 'add' ? 'Add MCP server' : 'Edit ' + editingName }}</h2>
              <p>Secrets are write-only. Existing values are never sent back to this browser.</p>
            </div>
            <button type="button" class="icon-btn" @click="closeEditor" aria-label="Close editor"><odin-icon name="close" :size="16" /></button>
          </header>

          <div v-if="formError" class="mcp-form-error" role="alert"><odin-icon name="warning" :size="15" /> {{ formError }}</div>

          <nav class="mcp-editor-nav" aria-label="MCP server form sections">
            <button v-for="group in editorGroups" :key="group.id" type="button" :aria-controls="'mcp-form-' + group.id" @click="jumpToEditorGroup(group.id)">{{ group.label }}</button>
          </nav>

          <div class="mcp-editor-groups">
            <section id="mcp-form-identity" class="mcp-form-group">
              <header><span>01</span><div><h3 tabindex="-1" data-mcp-form-heading>Identity</h3><p>Name the connection and control its own activation.</p></div></header>
              <div class="mcp-form-grid two">
                <label class="mcp-field"><span>Name</span><input v-model="form.name" class="hm-input font-mono" type="text" autocomplete="off" maxlength="128" :disabled="editorMode === 'edit'" placeholder="github_tools" /><small>Letters, digits, and underscores. Cannot be renamed.</small></label>
                <label class="mcp-switch-field"><span>Server enabled</span><span class="mcp-switch-line"><span>{{ form.enabled ? 'Enabled' : 'Disabled' }}</span><span class="toggle-switch"><input v-model="form.enabled" type="checkbox" /><span class="toggle-slider"></span></span></span><small>The global master switch must also be on.</small></label>
              </div>
            </section>

            <section id="mcp-form-transport" class="mcp-form-group">
              <header><span>02</span><div><h3 tabindex="-1" data-mcp-form-heading>Transport</h3><p>Choose how Odin reaches this MCP server.</p></div></header>
              <div class="mcp-transport-choice" role="radiogroup" aria-label="Transport">
                <label :class="{ selected: form.transport === 'stdio' }"><input v-model="form.transport" type="radio" value="stdio" /><odin-icon name="terminal" :size="18" /><span><strong>stdio</strong><small>Run an isolated local process</small></span></label>
                <label :class="{ selected: form.transport === 'http' }"><input v-model="form.transport" type="radio" value="http" /><odin-icon name="globe" :size="18" /><span><strong>Streamable HTTP</strong><small>Connect to an HTTP(S) endpoint</small></span></label>
              </div>

              <div v-if="form.transport === 'stdio'" class="mcp-form-grid">
                <label class="mcp-field"><span>Executable path <small v-if="editorMode === 'edit'">leave blank to keep current</small></span><input v-model="form.command" class="hm-input font-mono" type="text" autocomplete="off" placeholder="/usr/local/bin/my-mcp-server" /></label>
                <label v-if="editorMode === 'add' || form.replaceArgs" class="mcp-field"><span>Arguments <small>one per line</small></span><textarea v-model="form.argsText" class="hm-input" rows="3" placeholder="--flag&#10;value"></textarea></label>
                <button v-else type="button" class="mcp-replace-field" @click="form.replaceArgs = true"><odin-icon name="edit" :size="14" /><span><strong>Replace command arguments</strong><small>The current values are not exposed by the management API.</small></span></button>
                <label v-if="editorMode === 'add' || form.replaceCwd" class="mcp-field"><span>Working directory <small>optional absolute path</small></span><input v-model="form.cwd" class="hm-input font-mono" type="text" autocomplete="off" placeholder="/srv/mcp" /></label>
                <button v-else type="button" class="mcp-replace-field" @click="form.replaceCwd = true"><odin-icon name="folder" :size="14" /><span><strong>Replace working directory</strong><small>Leave unchanged unless you explicitly replace it.</small></span></button>
              </div>
              <div v-else class="mcp-form-grid">
                <div v-if="editorMode === 'edit' && editingServer?.url_display" class="mcp-current-endpoint">
                  <span>Currently set — masked display</span>
                  <code>{{ editingServer.url_display }}</code>
                  <small>Sensitive URL components are hidden. This display is for recognition only and is not the literal saved URL. Enter a complete URL below only to replace it.</small>
                </div>
                <label class="mcp-field">
                  <span>{{ endpointFieldLabel }} <small v-if="savedHttpEndpoint" class="mcp-configured-indicator">Endpoint configured</small><small v-else-if="endpointRequired">required</small></span>
                  <input v-model="form.url" class="hm-input font-mono" type="url" autocomplete="off" :placeholder="endpointPlaceholder" :required="endpointRequired" />
                  <small v-if="savedHttpEndpoint">The current endpoint remains unchanged unless a replacement is entered.</small>
                  <small v-else-if="editorMode === 'edit'">A new endpoint is required when switching to HTTP.</small>
                </label>
                <div class="mcp-static-auth-note"><odin-icon name="info" :size="15" /><span>Streamable HTTP with static headers is supported. Interactive OAuth and the deprecated HTTP+SSE transport are not part of v1.</span></div>
              </div>
            </section>

            <section id="mcp-form-authentication" class="mcp-form-group">
              <header><span>03</span><div><h3 tabindex="-1" data-mcp-form-heading>Authentication</h3><p>Rotate static headers or child-process environment values without exposing configured secrets.</p></div></header>
              <div class="mcp-secret-columns">
                <div class="mcp-secret-editor">
                  <div class="mcp-secret-heading"><div><strong>HTTP headers</strong><small v-if="form.transport !== 'http'">Stored, but used only by HTTP</small></div><button type="button" class="btn btn-ghost text-xs" @click="addSecretRow('headers')"><odin-icon name="plus" :size="13" /> Add</button></div>
                  <div v-if="configuredHeaderKeys.length" class="mcp-configured-secrets">
                    <div v-for="key in configuredHeaderKeys" :key="key"><code>{{ key }}</code><span>Configured</span><button type="button" @click="toggleSecretRemoval('headers', key)" :class="{ undo: form.headersRemove.includes(key) }">{{ form.headersRemove.includes(key) ? 'Undo remove' : 'Remove' }}</button></div>
                  </div>
                  <div v-for="(row, index) in form.headerRows" :key="'h-' + index" class="mcp-secret-row"><input v-model="row.key" class="hm-input font-mono" type="text" placeholder="Header name" autocomplete="off" /><input v-model="row.value" class="hm-input" type="password" placeholder="New value" autocomplete="new-password" /><button type="button" class="icon-btn" @click="removeSecretRow('headers', index)" aria-label="Remove new header row"><odin-icon name="close" :size="14" /></button></div>
                  <p v-if="!configuredHeaderKeys.length && !form.headerRows.length" class="mcp-secret-empty">No configured header keys.</p>
                </div>
                <div class="mcp-secret-editor">
                  <div class="mcp-secret-heading"><div><strong>Environment variables</strong><small v-if="form.transport !== 'stdio'">Stored, but used only by stdio</small></div><button type="button" class="btn btn-ghost text-xs" @click="addSecretRow('env')"><odin-icon name="plus" :size="13" /> Add</button></div>
                  <div v-if="configuredEnvKeys.length" class="mcp-configured-secrets">
                    <div v-for="key in configuredEnvKeys" :key="key"><code>{{ key }}</code><span>Configured</span><button type="button" @click="toggleSecretRemoval('env', key)" :class="{ undo: form.envRemove.includes(key) }">{{ form.envRemove.includes(key) ? 'Undo remove' : 'Remove' }}</button></div>
                  </div>
                  <div v-for="(row, index) in form.envRows" :key="'e-' + index" class="mcp-secret-row"><input v-model="row.key" class="hm-input font-mono" type="text" placeholder="Variable name" autocomplete="off" /><input v-model="row.value" class="hm-input" type="password" placeholder="New value" autocomplete="new-password" /><button type="button" class="icon-btn" @click="removeSecretRow('env', index)" aria-label="Remove new environment row"><odin-icon name="close" :size="14" /></button></div>
                  <p v-if="!configuredEnvKeys.length && !form.envRows.length" class="mcp-secret-empty">No configured environment keys.</p>
                </div>
              </div>
            </section>

            <section id="mcp-form-limits" class="mcp-form-group">
              <header><span>04</span><div><h3 tabindex="-1" data-mcp-form-heading>Limits</h3><p>Bound calls and optionally narrow discovery to named tools.</p></div></header>
              <div class="mcp-form-grid two">
                <label v-if="editorMode === 'add' || form.replaceTimeout" class="mcp-field"><span>Call timeout <small>seconds</small></span><input v-model="form.timeoutSeconds" class="hm-input font-mono" type="number" min="1" max="3600" step="1" /></label>
                <button v-else type="button" class="mcp-replace-field" @click="form.replaceTimeout = true"><odin-icon name="clock" :size="14" /><span><strong>Replace call timeout</strong><small>Current value remains unchanged until replaced.</small></span></button>
                <label v-if="editorMode === 'add' || form.replaceAllowlist" class="mcp-field"><span>Tool allowlist <small>one original name per line; empty allows all</small></span><textarea v-model="form.allowlistText" class="hm-input font-mono" rows="4" placeholder="search_code&#10;create_issue"></textarea></label>
                <button v-else type="button" class="mcp-replace-field" @click="form.replaceAllowlist = true"><odin-icon name="list" :size="14" /><span><strong>Replace tool allowlist</strong><small>Use this to narrow an over-limit blocked server.</small></span></button>
              </div>
              <div class="mcp-limit-note"><odin-icon name="shield" :size="15" /><span>Defaults: 40 published tools per server and globally, 128 discovered tools per server, 32 list pages, bounded descriptions and schemas. Over-limit servers publish nothing rather than silently truncating.</span></div>
            </section>
          </div>

          <footer class="mcp-editor-footer">
            <span>{{ editorMode === 'edit' ? 'Unspecified edit fields stay unchanged.' : 'The server is saved even if its first connection fails.' }}</span>
            <div><button type="button" class="btn btn-ghost text-sm" @click="closeEditor" :disabled="saving">Cancel</button><button type="submit" class="btn btn-primary text-sm" :disabled="saving">{{ saving ? 'Saving…' : (editorMode === 'add' ? 'Add server' : 'Save changes') }}</button></div>
          </footer>
        </form>
      </div>
    </div>
  `,setup(){const e=f(null),t=f(!1),s=f(!1),n=f(""),a=f(new Set),i=f(new Set),l=f({}),r=f({}),o=f({}),c=f(new Set),d=f(!1),u=f("add"),p=f(""),h=f(null),m=f(co()),v=f(""),C=f(!1);let L=null,y=0,g=!1,b=!1;const S=Bw,k=J(()=>{var z;return((z=e.value)==null?void 0:z.servers)||[]}),A=J(()=>{var z;return!!((z=e.value)!=null&&z.enabled)}),T=J(()=>{var z,ve,Te,Oe;return{serverCount:((z=e.value)==null?void 0:z.server_count)||0,enabledCount:((ve=e.value)==null?void 0:ve.enabled_server_count)||0,connectedCount:((Te=e.value)==null?void 0:Te.connected_count)||0,toolCount:((Oe=e.value)==null?void 0:Oe.published_tool_count)||0}}),_=J(()=>{var z;return((z=h.value)==null?void 0:z.header_keys)||[]}),D=J(()=>{var z;return((z=h.value)==null?void 0:z.env_keys)||[]}),E=J(()=>{var z;return u.value==="edit"&&((z=h.value)==null?void 0:z.transport)==="http"}),R=J(()=>u.value==="add"||!E.value),$=J(()=>E.value?"Replace endpoint URL":"Endpoint URL"),V=J(()=>E.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function oe(){P(),L=window.setInterval(()=>N({quiet:!0}),zw)}function P(){L&&window.clearInterval(L),L=null}async function N({quiet:z=!1}={}){const ve=++y;z||(t.value=!0);try{const Te=await W.get("/api/mcp/status");if(ve!==y||!g)return;e.value=Te,n.value="";const Oe=new Set((Te.servers||[]).map(De=>De.name));i.value=new Set([...i.value].filter(De=>Oe.has(De)))}catch(Te){ve===y&&g&&(n.value=Te.message||"Failed to load MCP status")}finally{ve===y&&(t.value=!1)}}function O(z){return s.value||a.value.has(z)}function U(z,ve){const Te=new Set(a.value);ve?Te.add(z):Te.delete(z),a.value=Te}function K(z){return $w(z.state)}function q(z){if(K(z)==="disabled"){if(!z.enabled)return"Disabled — server switch off";if(!A.value)return"Disabled — global MCP is off"}return jw[K(z)]}function Q(z){return z.transport==="http"?"Streamable HTTP":"stdio"}function ie(z){return z.negotiated_version?`${z.era?`${String(z.era).charAt(0).toUpperCase()}${String(z.era).slice(1)}`:"Protocol"} · ${z.negotiated_version}`:"Not negotiated"}function X(z){return z.discovered_count?`${z.published_count||0} published · ${z.excluded_count||0} excluded`:"No tools discovered"}const fe=f(new Set);async function Pe(z,ve){if(fe.value.has(z.name))return;const Te=!!ve.target.checked,Oe=new Set(fe.value);Oe.add(z.name),fe.value=Oe;try{const De=await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/enabled`,{enabled:Te});De&&Array.isArray(De.servers)?e.value=De:await N({quiet:!0})}catch(De){ve.target.checked=!!z.enabled,Re.error(De.message||`Failed to toggle ${z.name}`)}finally{const De=new Set(fe.value);De.delete(z.name),fe.value=De}}async function Y(z){if(z!==A.value&&!(!z&&!await Xt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await W.post("/api/mcp/enabled",{enabled:z}),Re.success(z?"MCP enabled":"MCP disabled"),await N({quiet:!0})}catch(ve){Re.error(ve.message||"Failed to update MCP state"),await N({quiet:!0})}finally{s.value=!1}}}async function be(z){U(z.name,!0);try{await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/reconnect`,{}),Re.success(`Reconnected ${z.name}`)}catch(ve){Re.error(ve.message||`Failed to reconnect ${z.name}`)}finally{U(z.name,!1),await N({quiet:!0})}}async function H(z){U(z.name,!0);try{await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/refresh-tools`,{}),Re.success(`Refreshed tools from ${z.name}`),await Le(z.name,!0)}catch(ve){Re.error(ve.message||`Failed to refresh ${z.name}`)}finally{U(z.name,!1),await N({quiet:!0})}}async function re(z){if(await Xt({title:`Remove ${z.name}`,message:`Remove this saved MCP server? Its ${z.published_count||0} published tool${z.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){U(z.name,!0);try{await W.del(`/api/mcp/servers/${encodeURIComponent(z.name)}`),Re.success(`Removed ${z.name}`),delete r.value[z.name]}catch(Te){Re.error(Te.message||`Failed to remove ${z.name}`)}finally{U(z.name,!1),await N({quiet:!0})}}}async function ue(z){const ve=new Set(i.value);if(ve.has(z.name)){ve.delete(z.name),i.value=ve;return}ve.add(z.name),i.value=ve,Object.hasOwn(r.value,z.name)||await Le(z.name)}async function Le(z,ve=!1){if(!ve&&Object.hasOwn(r.value,z))return;const Te=new Set(c.value);Te.add(z),c.value=Te,o.value={...o.value,[z]:""};try{const Oe=await W.get(`/api/mcp/servers/${encodeURIComponent(z)}/tools`);r.value={...r.value,[z]:Oe.tools||[]}}catch(Oe){o.value={...o.value,[z]:Oe.message||"Failed to load tools"}}finally{const Oe=new Set(c.value);Oe.delete(z),c.value=Oe}}function x(z){return(r.value[z]||[]).filter(ve=>Uw(ve,l.value[z]))}function M(z,ve){l.value={...l.value,[z]:ve}}function B(){u.value="add",p.value="",h.value=null,m.value=co(),v.value="",d.value=!0}function ae(z){u.value="edit",p.value=z.name,h.value=z,m.value={...co(),name:z.name,enabled:!!z.enabled,transport:z.transport||"stdio"},v.value="",d.value=!0}function te(){C.value||(d.value=!1)}function ne(z){d.value&&Hw(z)}function he(z){const ve=z==="headers"?"headerRows":"envRows";m.value[ve].push({key:"",value:""})}function de(z,ve){const Te=z==="headers"?"headerRows":"envRows";m.value[Te].splice(ve,1)}function pe(z,ve){const Te=z==="headers"?"headersRemove":"envRemove",Oe=m.value[Te];m.value[Te]=Oe.includes(ve)?Oe.filter(De=>De!==ve):[...Oe,ve]}async function le(){var ve,Te;v.value="";let z;try{z=Pw(m.value,{mode:u.value,originalTransport:((ve=h.value)==null?void 0:ve.transport)||""})}catch(Oe){v.value=Oe instanceof Ls?Oe.message:"Invalid MCP server configuration",await Et(),(Te=document.querySelector(".mcp-editor"))==null||Te.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&Fw(z,h.value)&&!await Xt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){C.value=!0;try{u.value==="add"?await W.post("/api/mcp/servers",z):await W.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,z),Re.success(u.value==="add"?`Saved ${z.name}`:`Updated ${p.value}`),d.value=!1,await N({quiet:!0})}catch(Oe){v.value=Oe.message||"Failed to save MCP server"}finally{C.value=!1}}}let ke=null;function ye(z){`${(z==null?void 0:z.event)||""} ${(z==null?void 0:z.type)||""} ${(z==null?void 0:z.tool)||""} ${(z==null?void 0:z.message)||""}`.toLowerCase().includes("mcp")&&(ke&&window.clearTimeout(ke),ke=window.setTimeout(()=>N({quiet:!0}),200))}function _e(){g||(g=!0,b||(Ye.subscribe("events",ye),b=!0),N(),oe())}function ce(){g=!1,P(),ke&&window.clearTimeout(ke),ke=null,b&&(Ye.unsubscribe("events",ye),b=!1)}return We(_e),us(_e),ts(ce),mt(ce),{status:e,loading:t,mutating:s,pageError:n,servers:k,masterEnabled:A,aggregate:T,expandedServers:i,toolQueries:l,toolErrors:o,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:h,form:m,formError:v,saving:C,editorGroups:S,configuredHeaderKeys:_,configuredEnvKeys:D,savedHttpEndpoint:E,endpointRequired:R,endpointFieldLabel:$,endpointPlaceholder:V,refreshAll:N,busy:O,serverState:K,stateLabel:q,transportLabel:Q,protocolLabel:ie,toolSummary:X,formatAge:Vw,setMasterEnabled:Y,togglePending:fe,toggleServerEnabled:Pe,reconnect:be,refreshTools:H,removeServer:re,toggleTools:ue,filteredTools:x,setToolQuery:M,openAdd:B,openEdit:ae,closeEditor:te,jumpToEditorGroup:ne,addSecretRow:he,removeSecretRow:de,toggleSecretRemoval:pe,saveServer:le}}};function Gw(e,t){if(!e||!t)return Bu(e);const s=Bu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Kw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Knowledge</h1>
        <div class="flex gap-2">
          <button @click="showIngest = !showIngest" class="btn btn-primary text-xs">
            {{ showIngest ? 'Cancel' : 'Ingest Document' }}
          </button>
          <button @click="fetchSources" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Stats bar -->
      <div v-if="!loading && sources.length > 0" class="kb-stats-bar">
        <div class="kb-stat">
          <span class="kb-stat-value">{{ sources.length }}</span>
          <span class="kb-stat-label">Sources</span>
        </div>
        <div class="kb-stat">
          <span class="kb-stat-value">{{ totalChunks }}</span>
          <span class="kb-stat-label">Chunks</span>
        </div>
        <div class="kb-stat">
          <span class="kb-stat-value">{{ uploaderCount }}</span>
          <span class="kb-stat-label">Uploaders</span>
        </div>
      </div>

      <!-- Search bar -->
      <div class="mb-4 flex gap-2">
        <input v-model="searchQuery" type="text" class="hm-input"
               placeholder="Search knowledge base..."
               @keyup.enter="doSearch" />
        <button @click="doSearch" class="btn btn-primary text-xs whitespace-nowrap" :disabled="searching">
          {{ searching ? 'Searching...' : 'Search' }}
        </button>
        <button v-if="searchResults" @click="clearSearch" class="btn btn-ghost text-xs">Clear</button>
      </div>

      <!-- Search results -->
      <div v-if="searchResults" class="mb-6">
        <div class="text-sm font-medium text-gray-400 mb-2">
          Search Results <span class="badge badge-info">{{ searchResults.length }}</span>
          <span class="text-gray-500 text-xs ml-2">for "{{ lastQuery }}"</span>
        </div>
        <div v-if="searchError" class="hm-card border-red-900">
          <p class="text-red-400 text-sm">Search error: {{ searchError }}</p>
        </div>
        <div v-else-if="searchResults.length === 0" class="hm-card empty-state">
          <span class="empty-state-icon"><odin-icon name="search" :size="23" /></span>
          <span class="empty-state-text">No results for "{{ lastQuery }}"</span>
          <span class="empty-state-hint">Try different search terms or ingest more documents</span>
        </div>
        <div v-else class="space-y-2">
          <div v-for="(r, i) in searchResults" :key="i" class="hm-card kb-search-result">
            <div class="flex items-center gap-2 mb-1">
              <span class="badge badge-info">{{ r.source || 'unknown' }}</span>
              <span v-if="r.score" class="kb-score-badge">{{ r.score.toFixed(3) }}</span>
              <span v-if="r.chunk_index !== undefined" class="text-gray-600 text-xs">chunk #{{ r.chunk_index }}</span>
            </div>
            <div class="text-sm text-gray-300 whitespace-pre-wrap break-words"
                 v-html="highlightTerms(truncate(r.content || r.text || '', 500), lastQuery)"></div>
          </div>
        </div>
      </div>

      <!-- Ingest form -->
      <div v-if="showIngest" class="hm-card mb-4 kb-ingest-form">
        <h2 class="text-sm font-medium mb-3">Ingest Document</h2>
        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Source Name
          <input v-model="ingestSource" type="text" class="hm-input" placeholder="e.g. project-docs, api-reference" />
          </label>
        </div>
        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Content
          <textarea v-model="ingestContent" class="hm-input" rows="8"
                    placeholder="Paste document content here..."></textarea>
          </label>
        </div>
        <div v-if="ingestError" class="mb-3 text-red-400 text-sm">{{ ingestError }}</div>
        <div v-if="ingestSuccess" class="mb-3 text-green-400 text-sm">{{ ingestSuccess }}</div>
        <button @click="doIngest" class="btn btn-primary text-xs" :disabled="ingesting">
          {{ ingesting ? 'Ingesting...' : 'Ingest' }}
        </button>
      </div>

      <!-- Sources tree view -->
      <div v-if="loading && sources.length === 0" class="space-y-2" role="status" aria-label="Loading sources">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchSources" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="sources.length === 0 && !showIngest" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="book" :size="23" /></span>
        <span class="empty-state-text">No documents ingested</span>
        <span class="empty-state-hint">Click "Ingest Document" to add knowledge for Odin to reference</span>
      </div>
      <div v-else-if="sources.length > 0" class="kb-tree">
        <div class="text-sm font-medium text-gray-400 mb-2">
          Sources <span class="badge badge-info">{{ sources.length }}</span>
        </div>
        <div class="kb-tree-list">
          <div v-for="s in sources" :key="s.source || s.name || s" class="kb-tree-node">
            <!-- Source header (tree branch) -->
            <div class="kb-tree-header" @click="toggleSource(s.source || s.name || s)"
                 role="button" tabindex="0" @keydown.enter="toggleSource(s.source || s.name || s)" @keydown.space.prevent="toggleSource(s.source || s.name || s)"
                 :aria-expanded="!!expanded[s.source || s.name || s]">
              <span class="kb-tree-arrow" aria-hidden="true">
                <odin-icon :name="expanded[s.source || s.name || s] ? 'chevronUp' : 'chevronDown'" :size="14" />
              </span>
              <span class="kb-tree-icon"><odin-icon name="file" :size="17" /></span>
              <span class="kb-tree-name">{{ s.source || s.name || s }}</span>
              <span class="badge badge-info text-xs">{{ s.chunks || 0 }} chunks</span>
              <span v-if="s.uploader" class="badge badge-warning text-xs">{{ s.uploader }}</span>
              <div class="kb-tree-actions">
                <button @click.stop="doReingest(s.source || s.name || s)"
                        class="btn btn-ghost text-xs"
                        :disabled="reingesting === (s.source || s.name || s)">
                  {{ reingesting === (s.source || s.name || s) ? 'Re-ingesting...' : 'Re-ingest' }}
                </button>
                <button @click.stop="confirmDelete(s.source || s.name || s)" class="btn btn-danger text-xs">Delete</button>
              </div>
            </div>

            <!-- Source metadata -->
            <div v-if="s.ingested_at && !expanded[s.source || s.name || s]" class="kb-tree-meta">
              Ingested: {{ formatTs(s.ingested_at) }}
            </div>
            <div v-if="s.preview && !expanded[s.source || s.name || s]" class="kb-tree-preview">{{ s.preview }}</div>

            <!-- Re-ingest result -->
            <div v-if="reingestResult && reingestResult.source === (s.source || s.name || s)"
                 class="kb-tree-meta"
                 :class="reingestResult.error ? 'text-red-400' : 'text-green-400'">
              {{ reingestResult.message }}
            </div>

            <!-- Chunk browser (expanded) -->
            <div v-if="expanded[s.source || s.name || s]" class="kb-chunk-browser">
              <div v-if="loadingChunks[s.source || s.name || s]" class="kb-chunk-loading">
                <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Loading chunks...
              </div>
              <div v-else-if="sourceChunks[s.source || s.name || s]" class="kb-chunk-list">
                <div class="kb-chunk-header">
                  <span class="text-gray-400 text-xs">{{ sourceChunks[s.source || s.name || s].length }} chunks</span>
                  <span class="text-gray-600 text-xs">Ingested: {{ formatTs(s.ingested_at) }}</span>
                </div>
                <div v-for="chunk in sourceChunks[s.source || s.name || s]" :key="chunk.chunk_id"
                     class="kb-chunk-item" role="button" tabindex="0" :aria-expanded="selectedChunk === chunk.chunk_id"
                     :class="{ 'kb-chunk-selected': selectedChunk === chunk.chunk_id }"
                     @click="selectedChunk = selectedChunk === chunk.chunk_id ? null : chunk.chunk_id"
                     @keydown.enter="selectedChunk = selectedChunk === chunk.chunk_id ? null : chunk.chunk_id"
                     @keydown.space.prevent="selectedChunk = selectedChunk === chunk.chunk_id ? null : chunk.chunk_id">
                  <div class="kb-chunk-item-header">
                    <span class="kb-chunk-index">#{{ chunk.chunk_index }}</span>
                    <span class="kb-chunk-chars">{{ chunk.char_count }} chars</span>
                    <div class="kb-chunk-bar">
                      <div class="kb-chunk-bar-fill" :style="{ width: chunkBarWidth(chunk, s.source || s.name || s) + '%' }"></div>
                    </div>
                  </div>
                  <div v-if="selectedChunk === chunk.chunk_id" class="kb-chunk-content">{{ chunk.content }}</div>
                  <div v-else class="kb-chunk-preview">{{ truncate(chunk.content, 120) }}</div>
                </div>
              </div>
              <div v-else-if="chunkErrors[s.source || s.name || s]" class="kb-chunk-empty kb-chunk-error text-xs">Couldn't load chunks — {{ chunkErrors[s.source || s.name || s] }}. Collapse and expand to retry.</div>
              <div v-else class="kb-chunk-empty text-gray-500 text-xs">No chunks found</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Delete confirmation -->
      <div v-if="deleteTarget" class="modal-overlay" v-modal-focus @click.self="deleteTarget = null" @keyup.escape="deleteTarget = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="kb-delete-title">
        <div class="modal-content">
          <h3 id="kb-delete-title" class="text-lg font-semibold mb-2">Delete Source</h3>
          <p class="text-gray-400 text-sm mb-4">
            Delete all chunks for <span class="font-mono font-semibold text-gray-200">{{ deleteTarget }}</span>? This cannot be undone.
          </p>
          <div class="flex gap-2 justify-end">
            <button @click="deleteTarget = null" class="btn btn-ghost">Cancel</button>
            <button @click="doDelete" class="btn btn-danger" :disabled="deleting">
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(""),a=f(null),i=f(!1),l=f(""),r=f(null),o=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let C=null;const L=f(null),y=f(!1),g=f({}),b=f({}),S=f({}),k=f({}),A=new Map,T=f(null),_=J(()=>e.value.reduce((q,Q)=>q+(Q.chunks||0),0)),D=J(()=>new Set(e.value.map(Q=>Q.uploader).filter(Boolean)).size);function E(q,Q){const ie=b.value[Q];if(!ie||ie.length===0)return 0;const X=Math.max(...ie.map(fe=>fe.char_count||0));return X===0?0:Math.round(q.char_count/X*100)}async function R(){t.value=!0,s.value=null;try{const q=await W.get("/api/knowledge");e.value=Array.isArray(q)?q:[]}catch(q){s.value=q.message}t.value=!1}async function $(q){if(g.value[q]){g.value[q]=!1,T.value=null;return}if(g.value[q]=!0,Object.prototype.hasOwnProperty.call(b.value,q))return;if(A.has(q))return A.get(q);const Q={...k.value,[q]:!0};k.value=Q;const ie={...S.value};delete ie[q],S.value=ie;const X=W.get(`/api/knowledge/${encodeURIComponent(q)}/chunks`).then(fe=>{b.value={...b.value,[q]:Array.isArray(fe)?fe:[]}}).catch(fe=>{S.value={...S.value,[q]:fe.message||"load failed"}}).finally(()=>{if(A.get(q)!==X)return;A.delete(q);const fe={...k.value};delete fe[q],k.value=fe});return A.set(q,X),X}let V=0;async function oe(){const q=n.value.trim();if(!q)return;const Q=++V;i.value=!0,r.value=null,l.value=q;try{const ie=await W.get(`/api/knowledge/search?q=${encodeURIComponent(q)}`);if(Q!==V)return;a.value=Array.isArray(ie)?ie:[]}catch(ie){if(Q!==V)return;a.value=[],r.value=ie.message||"Search failed"}Q===V&&(i.value=!1)}function P(){V+=1,i.value=!1,a.value=null,n.value="",r.value=null}async function N(){u.value=null,p.value=null;const q=c.value.trim(),Q=d.value.trim();if(!q){u.value="Source name is required";return}if(!Q){u.value="Content is required";return}h.value=!0;try{const ie=await W.post("/api/knowledge",{source:q,content:Q});p.value=`Ingested ${ie.chunks||0} chunks from "${q}"`,c.value="",d.value="",b.value={},await R(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(ie){u.value=ie.message}h.value=!1}async function O(q){m.value=q,v.value=null,C&&(clearTimeout(C),C=null);try{const Q=await W.post(`/api/knowledge/${encodeURIComponent(q)}/reingest`);v.value={source:q,error:!1,message:`Re-ingested ${Q.chunks||0} chunks`},delete b.value[q],await R(),C=setTimeout(()=>{v.value=null,C=null},3e3)}catch(Q){v.value={source:q,error:!0,message:Q.message}}m.value=null}function U(q){L.value=q}async function K(){if(L.value){y.value=!0;try{await W.del(`/api/knowledge/${encodeURIComponent(L.value)}`),delete b.value[L.value],await R()}catch(q){Re.error(`Failed to delete source: ${q.message||"unknown error"}`)}y.value=!1,L.value=null}}return We(()=>{R()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:L,deleting:y,expanded:g,sourceChunks:b,chunkErrors:S,loadingChunks:k,selectedChunk:T,totalChunks:_,uploaderCount:D,truncate:sd,formatTs:ka,highlightTerms:Gw,chunkBarWidth:E,fetchSources:R,toggleSource:$,doSearch:oe,clearSearch:P,doIngest:N,doReingest:O,confirmDelete:U,doDelete:K}}},Ww={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Memory</h1>
        <div class="flex gap-2">
          <button @click="showAdd = !showAdd" class="btn btn-primary text-xs">
            {{ showAdd ? 'Cancel' : 'Add Entry' }}
          </button>
          <button @click="fetchMemory" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Summary stats -->
      <div v-if="!loading && scopes.length > 0" class="mem-stats-bar">
        <div class="mem-stat">
          <span class="mem-stat-value">{{ totalEntries }}</span>
          <span class="mem-stat-label">Entries</span>
        </div>
        <div class="mem-stat">
          <span class="mem-stat-value">{{ scopes.length }}</span>
          <span class="mem-stat-label">Scopes</span>
        </div>
        <div class="mem-stat">
          <span class="mem-stat-value">{{ selectedCount }}</span>
          <span class="mem-stat-label">Selected</span>
        </div>
        <div class="mem-stat mem-stat-action">
          <button v-if="selectedCount > 0" @click="confirmBulkDelete"
                  class="btn btn-danger text-xs">
            Delete Selected ({{ selectedCount }})
          </button>
          <span v-else class="text-gray-600 text-xs">Select entries to delete</span>
        </div>
      </div>

      <!-- Search/filter -->
      <div v-if="scopes.length > 0" class="mb-4">
        <input v-model="filterQuery" type="text" class="hm-input"
               placeholder="Filter memory keys..." />
      </div>

      <!-- Add form -->
      <div v-if="showAdd" class="hm-card mb-4 mem-add-form">
        <h2 class="text-sm font-medium mb-3">Add Memory Entry</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="text-gray-400 text-xs block mb-1">Scope
            <input v-model="addForm.scope" type="text" class="hm-input"
                   placeholder="e.g. global, user:12345" />
            </label>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Key
            <input v-model="addForm.key" type="text" class="hm-input"
                   placeholder="e.g. preferred_language" />
            </label>
          </div>
        </div>
        <div class="mb-3">
          <label class="text-gray-400 text-xs block mb-1">Value
          <textarea v-model="addForm.value" class="hm-input" rows="3"
                    placeholder="Enter value..."></textarea>
          </label>
        </div>
        <div v-if="addError" class="mb-3 text-red-400 text-sm">{{ addError }}</div>
        <div v-if="addSuccess" class="mb-3 text-green-400 text-sm">{{ addSuccess }}</div>
        <button @click="doAdd" class="btn btn-primary text-xs" :disabled="adding">
          {{ adding ? 'Saving...' : 'Save' }}
        </button>
      </div>

      <!-- Action error toast -->
      <div v-if="actionError" class="hm-card border-red-900 mb-4">
        <div class="flex items-center justify-between">
          <p class="text-red-400 text-sm">{{ actionError }}</p>
          <button @click="actionError = null" class="btn btn-ghost text-xs">Dismiss</button>
        </div>
      </div>

      <!-- Loading / error -->
      <div v-if="loading && scopes.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchMemory" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="scopes.length === 0 && !showAdd" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="brain" :size="23" /></span>
        <span class="empty-state-text">No memory entries</span>
        <span class="empty-state-hint">Click "Add Entry" or let Odin learn preferences through conversations</span>
      </div>

      <!-- Memory tree -->
      <div v-else class="mem-tree">
        <div v-for="scope in scopes" :key="scope.name" class="mem-tree-node">
          <!-- Scope header -->
          <div class="mem-tree-header" role="button" tabindex="0" :aria-expanded="expanded[scope.name]"
               @click="toggleScope(scope.name)" @keydown.enter="toggleScope(scope.name)" @keydown.space.prevent="toggleScope(scope.name)">
            <span class="mem-tree-arrow" aria-hidden="true">
              <odin-icon :name="expanded[scope.name] ? 'chevronUp' : 'chevronDown'" :size="14" />
            </span>
            <span class="memory-scope-badge"
                  :class="scope.name === 'global' ? 'memory-scope-global' : 'memory-scope-user'">
              {{ scope.name }}
            </span>
            <span class="badge badge-info text-xs">{{ scope.count }} keys</span>
            <input type="checkbox" class="memory-checkbox ml-auto"
                   :checked="isScopeAllSelected(scope.name)"
                   :aria-label="'Select all keys in ' + scope.name"
                   @click.stop
                   @change="toggleSelectAll(scope.name, $event.target.checked)" />
          </div>

          <!-- Entries (expanded) -->
          <div v-if="expanded[scope.name]" class="mem-tree-entries">
            <div v-if="loadingScope === scope.name" class="mem-tree-loading">
              <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Loading...
            </div>
            <div v-else-if="filteredEntries(scope.name).length === 0" class="mem-tree-empty">
              <span class="text-gray-500 text-xs">{{ filterQuery ? 'No matching keys' : 'No entries' }}</span>
            </div>
            <div v-else>
              <div v-for="entry in filteredEntries(scope.name)" :key="entry.key"
                   class="mem-tree-entry" :class="{ 'mem-tree-entry-selected': isSelected(scope.name, entry.key) }">
                <div class="mem-tree-entry-header">
                  <input type="checkbox" class="memory-checkbox"
                         :checked="isSelected(scope.name, entry.key)"
                         :aria-label="'Select ' + entry.key + ' in ' + scope.name"
                         @change="toggleSelect(scope.name, entry.key)" />
                  <span class="mem-tree-key">{{ entry.key }}</span>
                  <div class="mem-tree-entry-actions">
                    <button @click="copyValue(scope.name, entry)" class="btn btn-ghost text-xs" :disabled="entry.failed">
                      {{ copied === scope.name + '/' + entry.key ? 'Copied!' : 'Copy' }}
                    </button>
                    <button @click="startEdit(scope.name, entry.key, entry.value)" class="btn btn-ghost text-xs" :disabled="entry.failed">Edit</button>
                    <button @click="confirmDelete(scope.name, entry.key)" class="btn btn-danger text-xs">Del</button>
                  </div>
                </div>
                <div v-if="editingKey === scope.name + '/' + entry.key" class="mem-tree-edit">
                  <textarea v-model="editValue" class="hm-input text-sm" rows="2" :aria-label="'Edit value for ' + entry.key"></textarea>
                  <div class="flex gap-1 mt-1">
                    <button @click="doEdit(scope.name, entry.key)" class="btn btn-primary text-xs" :disabled="saving">
                      {{ saving ? 'Saving...' : 'Save' }}
                    </button>
                    <button @click="editingKey = null" class="btn btn-ghost text-xs">Cancel</button>
                  </div>
                </div>
                <div v-else-if="entry.failed" class="mem-tree-value text-red-400" role="alert">
                  Could not load this value — {{ entry.error }}
                </div>
                <div v-else class="mem-tree-value">{{ entry.value }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Delete confirmation (single) -->
      <div v-if="deleteTarget" class="modal-overlay" v-modal-focus @click.self="deleteTarget = null" @keyup.escape="deleteTarget = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="mem-delete-title">
        <div class="modal-content">
          <h3 id="mem-delete-title" class="text-lg font-semibold mb-2">Delete Memory Entry</h3>
          <p class="text-gray-400 text-sm mb-4">
            Delete <span class="font-mono font-semibold text-gray-200">{{ deleteTarget.scope }}/{{ deleteTarget.key }}</span>? This cannot be undone.
          </p>
          <div class="flex gap-2 justify-end">
            <button @click="deleteTarget = null" class="btn btn-ghost">Cancel</button>
            <button @click="doDelete" class="btn btn-danger" :disabled="deleting">
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Bulk delete confirmation -->
      <div v-if="showBulkDelete" class="modal-overlay" v-modal-focus @click.self="showBulkDelete = false" @keyup.escape="showBulkDelete = false" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="mem-bulk-delete-title">
        <div class="modal-content">
          <h3 id="mem-bulk-delete-title" class="text-lg font-semibold mb-2">Bulk Delete</h3>
          <p class="text-gray-400 text-sm mb-4">
            Delete <span class="font-semibold text-gray-200">{{ selectedCount }}</span> selected entries? This cannot be undone.
          </p>
          <div class="flex gap-2 justify-end">
            <button @click="showBulkDelete = false" class="btn btn-ghost">Cancel</button>
            <button @click="doBulkDelete" class="btn btn-danger" :disabled="deleting">
              {{ deleting ? 'Deleting...' : 'Delete All Selected' }}
            </button>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),n=f(null),a=f({}),i=f(null),l=f(""),r=f(!1),o=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),C=f(null),L=f(new Set),y=f(null),g=f(!1),b=f(!1),S=J(()=>e.value.reduce((Q,ie)=>Q+ie.count,0)),k=J(()=>L.value.size);function A(Q){const ie=t.value[Q];if(!ie)return[];if(!l.value.trim())return ie;const X=l.value.trim().toLowerCase();return ie.filter(fe=>fe.key.toLowerCase().includes(X)||fe.value&&fe.value.toLowerCase().includes(X))}function T(Q,ie){return L.value.has(Q+"/"+ie)}function _(Q,ie){const X=Q+"/"+ie,fe=new Set(L.value);fe.has(X)?fe.delete(X):fe.add(X),L.value=fe}function D(Q){const ie=t.value[Q];return!ie||ie.length===0?!1:ie.every(X=>L.value.has(Q+"/"+X.key))}function E(Q,ie){const X=t.value[Q];if(!X)return;const fe=new Set(L.value);for(const Pe of X){const Y=Q+"/"+Pe.key;ie?fe.add(Y):fe.delete(Y)}L.value=fe}async function R(){s.value=!0,n.value=null;try{const Q=await W.get("/api/memory");e.value=Object.entries(Q).map(([ie,X])=>({name:ie,keys:X.keys||[],count:X.count||0}))}catch(Q){n.value=Q.message}s.value=!1}async function $(Q){if(a.value[Q]){a.value[Q]=!1;return}a.value[Q]=!0;const ie=e.value.find(fe=>fe.name===Q);if(!ie||t.value[Q]||i.value===Q)return;i.value=Q;let X;try{const Pe=(await W.get(`/api/memory/${encodeURIComponent(Q)}`)).entries||{};X=ie.keys.map(Y=>Object.prototype.hasOwnProperty.call(Pe,Y)?{key:Y,value:Pe[Y]||"",failed:!1}:{key:Y,value:"",failed:!0,error:"Not found in scope"})}catch(fe){X=ie.keys.map(Pe=>({key:Pe,value:"",failed:!0,error:fe.message||"Failed to load"}))}t.value[Q]=X,i.value=null}function V(Q,ie,X){p.value=Q+"/"+ie,h.value=X}async function oe(Q,ie){m.value=!0,v.value=null;try{await W.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(ie)}`,{value:h.value});const X=t.value[Q];if(X){const fe=X.find(Pe=>Pe.key===ie);fe&&(fe.value=h.value)}p.value=null}catch(X){v.value=`Failed to save: ${X.message||"unknown error"}`}m.value=!1}async function P(Q,ie){try{await navigator.clipboard.writeText(ie.value),C.value=Q+"/"+ie.key,setTimeout(()=>{C.value=null},1500)}catch{}}async function N(){d.value=null,u.value=null;const Q=o.value.scope.trim(),ie=o.value.key.trim(),X=o.value.value.trim();if(!Q){d.value="Scope is required";return}if(!ie){d.value="Key is required";return}if(!X){d.value="Value is required";return}c.value=!0;try{await W.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(ie)}`,{value:X}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await R(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(fe){d.value=fe.message}c.value=!1}function O(Q,ie){y.value={scope:Q,key:ie}}async function U(){if(!y.value)return;g.value=!0,v.value=null;const{scope:Q,key:ie}=y.value;try{await W.del(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(ie)}`);const X=t.value[Q];X&&(t.value[Q]=X.filter(Y=>Y.key!==ie));const fe=e.value.find(Y=>Y.name===Q);fe&&(fe.count--,fe.keys=fe.keys.filter(Y=>Y!==ie));const Pe=new Set(L.value);Pe.delete(Q+"/"+ie),L.value=Pe}catch(X){v.value=`Failed to delete: ${X.message||"unknown error"}`}g.value=!1,y.value=null}function K(){b.value=!0}async function q(){g.value=!0,v.value=null;const Q=[];for(const ie of L.value){const X=ie.indexOf("/");Q.push({scope:ie.slice(0,X),key:ie.slice(X+1)})}try{await W.post("/api/memory/bulk-delete",{entries:Q}),L.value=new Set,t.value={},await R()}catch(ie){v.value=`Bulk delete failed: ${ie.message||"unknown error"}`}g.value=!1,b.value=!1}return We(()=>{R()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:C,selected:L,selectedCount:k,totalEntries:S,deleteTarget:y,deleting:g,showBulkDelete:b,fetchMemory:R,toggleScope:$,startEdit:V,doEdit:oe,copyValue:P,doAdd:N,confirmDelete:O,doDelete:U,confirmBulkDelete:K,doBulkDelete:q,isSelected:T,toggleSelect:_,isScopeAllSelected:D,toggleSelectAll:E,filteredEntries:A}}},Zw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-xl font-semibold">Learned Context</h1>
          <p class="text-xs text-gray-500 mt-1" v-if="meta">
            {{ entries.length }} entries | Last reflection: {{ formatTs(meta.last_reflection) }}
          </p>
        </div>
        <button @click="fetchEntries" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading && entries.length === 0" class="space-y-2">
        <div v-for="n in 5" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchEntries" class="btn btn-ghost text-xs">Retry</button>
      </div>
      <div v-else-if="entries.length === 0" class="hm-card empty-state">
        <span class="empty-state-icon"><odin-icon name="brain" :size="28" /></span>
        <span class="empty-state-text">No learned entries yet</span>
        <span class="empty-state-hint">Odin learns from conversations automatically</span>
      </div>

      <div v-else class="space-y-2">
        <!-- Filter -->
        <div class="flex gap-2 mb-3">
          <button v-for="cat in categories" :key="cat"
                  @click="filterCat = filterCat === cat ? null : cat"
                  :class="['btn text-xs', filterCat === cat ? 'btn-primary' : 'btn-ghost']">
            {{ cat }} ({{ catCounts[cat] || 0 }})
          </button>
        </div>

        <!-- Entries -->
        <div v-for="entry in filtered" :key="entry.key" class="hm-card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-mono text-sm text-white">{{ entry.key }}</span>
                <span :class="catBadge(entry.category)" class="badge text-xs">{{ entry.category }}</span>
                <span v-if="entry.user_id && entry.user_id !== 'global'" class="text-xs text-gray-500">
                  user: {{ entry.user_id }}
                </span>
              </div>
              <div v-if="editing === entry.key" class="mt-2">
                <textarea v-model="editContent" class="hm-input font-mono text-xs w-full" rows="3" :aria-label="'Edit learned entry ' + entry.key"></textarea>
                <div class="flex gap-2 mt-2">
                  <button @click="saveEdit(entry.key)" class="btn btn-primary text-xs">Save</button>
                  <button @click="editing = null" class="btn btn-ghost text-xs">Cancel</button>
                </div>
              </div>
              <p v-else class="text-sm text-gray-300 mt-1">{{ entry.content }}</p>
              <div class="text-xs text-gray-600 mt-1">
                Created: {{ formatTs(entry.created_at) }}
                <span v-if="entry.updated_at !== entry.created_at"> | Updated: {{ formatTs(entry.updated_at) }}</span>
              </div>
            </div>
            <div class="flex gap-1 shrink-0">
              <button @click="startEdit(entry)" class="icon-btn" title="Edit" aria-label="Edit entry"><odin-icon name="edit" :size="16" /></button>
              <button @click="deleteEntry(entry.key)" class="icon-btn icon-btn-danger" title="Delete" aria-label="Delete entry"><odin-icon name="trash" :size="16" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,setup(){const e=f([]),t=f(null),s=f(!0),n=f(null),a=f(null),i=f(null),l=f(""),r=J(()=>[...new Set(e.value.map(C=>C.category))].sort()),o=J(()=>{const v={};return e.value.forEach(C=>{v[C.category]=(v[C.category]||0)+1}),v}),c=J(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await W.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,Re.success("Entry updated"),await m()}catch(C){Re.error(C.message||"Failed to save entry")}}async function h(v){if(await Xt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/learned/"+encodeURIComponent(v)),Re.success("Entry deleted"),await m()}catch(L){Re.error(L.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await W.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return We(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ka,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:m}}},Dm=[{id:"tools",label:"Tools",component:Iw},{id:"skills",label:"Skills",component:Nw},{id:"mcp-servers",label:"MCP Servers",component:qw},{id:"knowledge",label:"Knowledge",component:Kw},{id:"memory",label:"Memory",component:Ww},{id:"learned",label:"Learned",component:Zw}],Jw={components:{TabbedPage:Hr},setup(){return{tabs:Dm}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Yw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Qw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Xw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},ek={template:`
    <div class="p-6 page-fade-in" role="region" aria-label="Health Dashboard">
      <!-- Loading skeleton -->
      <div v-if="loading" class="space-y-4" role="status" aria-label="Loading health data">
        <div class="hm-card" style="padding:1.5rem;">
          <div class="skeleton skeleton-text" style="width:200px;"></div>
          <div class="skeleton skeleton-text" style="width:300px;"></div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div v-for="n in 8" :key="n" class="hm-card" style="padding:1rem;">
            <div class="skeleton skeleton-text" style="width:80%;"></div>
            <div class="skeleton skeleton-text" style="width:60%;"></div>
          </div>
        </div>
      </div>

      <!-- Error state -->
      <!-- Full-page error ONLY when there is nothing to show. A failed
           background refresh must not replace data we already have:
           one 502 during a restart used to blank a page that had been
           rendering fine, until the next poll a full interval later. -->
      <div v-else-if="error && !hasData" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <div v-if="error && hasData" class="hm-card border-amber-900 mb-3" role="status" aria-live="polite">
          <p class="text-amber-400 text-sm">Last refresh failed: {{ error }} — showing the most recent data.</p>
        </div>
        <!-- Overall status banner -->
        <div class="hm-card mb-4" style="padding:1.25rem 1.5rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span :class="overallColor" aria-hidden="true"><odin-icon :name="overallIcon" :size="26" /></span>
              <div>
                <div class="text-lg font-semibold" :class="overallColor">{{ overallLabel }}</div>
                <div class="text-xs text-gray-400">
                  {{ data.healthy_count }} healthy, {{ data.degraded_count }} degraded, {{ data.down_count }} down, {{ data.unconfigured_count }} unconfigured
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span class="text-xs text-gray-500">Updated {{ formatTime(data.checked_at) }}</span>
              <button @click="fetchHealth" class="btn btn-ghost text-xs" :disabled="refreshing">
                <odin-icon name="refresh" :size="14" :class="{ 'animate-spin': refreshing }" />
                {{ refreshing ? 'Refreshing...' : 'Refresh' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Component cards grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <div v-for="c in components" :key="c.name"
               class="hm-card health-card"
               :class="'health-card-' + c.status">
            <div class="health-card-header">
              <span class="health-card-icon" :class="statusColor(c.status)"><odin-icon :name="statusIcon(c.status)" :size="18" /></span>
              <span class="health-card-name">{{ formatName(c.name) }}</span>
              <span class="badge" :class="badgeClass(c.status)">{{ c.status }}</span>
            </div>
            <div class="health-card-detail">{{ c.detail }}</div>

            <!-- SSH hosts expanded view -->
            <div v-if="c.name === 'ssh_hosts' && c.metadata && c.metadata.hosts && c.metadata.hosts.length > 0"
                 class="health-card-meta">
              <div class="text-xs text-gray-500 mb-1">Configured hosts:</div>
              <div v-for="h in c.metadata.hosts" :key="h.alias" class="health-host-item">
                <span class="health-host-dot"
                      :class="h.pool_connected === true ? 'dot-connected' : (h.pool_connected === false ? 'dot-idle' : 'dot-unknown')"></span>
                <span class="text-xs">{{ h.alias }}</span>
                <span class="text-xs text-gray-500">{{ h.ssh_user }}@{{ h.address }}</span>
                <span class="text-xs text-gray-600">({{ h.os }})</span>
              </div>
              <div v-if="c.metadata.pool_enabled" class="text-xs text-gray-500 mt-1">
                Pool: {{ c.metadata.active_connections || 0 }} active,
                {{ c.metadata.total_reused || 0 }} reused,
                {{ c.metadata.total_opened || 0 }} opened
              </div>
            </div>

            <!-- Codex metadata -->
            <div v-if="c.name === 'codex' && c.metadata" class="health-card-meta">
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Model:</span>
                <span class="text-xs">{{ c.metadata.model || 'unknown' }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Circuit:</span>
                <span class="text-xs" :class="circuitColor(c.metadata.circuit_breaker)">{{ c.metadata.circuit_breaker }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Pool:</span>
                <span class="text-xs">{{ c.metadata.http_pool_active_connections || 0 }}/{{ c.metadata.http_pool_max_connections || 0 }} connections</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Requests:</span>
                <span class="text-xs">{{ c.metadata.http_pool_total_requests || 0 }} total</span>
              </div>
            </div>

            <!-- Knowledge metadata -->
            <div v-if="c.name === 'knowledge' && c.metadata" class="health-card-meta">
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Chunks:</span>
                <span class="text-xs">{{ c.metadata.chunks || 0 }}</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Vector search:</span>
                <span class="text-xs" :class="c.metadata.vector_search ? 'text-green-400' : 'text-yellow-400'">
                  {{ c.metadata.vector_search ? 'enabled' : 'FTS only' }}
                </span>
              </div>
            </div>

            <!-- Sessions metadata -->
            <div v-if="c.name === 'sessions' && c.metadata" class="health-card-meta">
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Active:</span>
                <span class="text-xs">{{ c.metadata.count || 0 }} session(s)</span>
              </div>
              <div class="health-meta-row">
                <span class="text-xs text-gray-500">Tokens:</span>
                <span class="text-xs">{{ formatNumber(c.metadata.total_tokens || 0) }}</span>
              </div>
              <div v-if="c.metadata.over_budget > 0" class="health-meta-row">
                <span class="text-xs text-yellow-400">{{ c.metadata.over_budget }} over budget</span>
              </div>
            </div>

            <!-- Generic count metadata for scheduler/loops/agents -->
            <div v-if="(c.name === 'scheduler' || c.name === 'loops' || c.name === 'agents') && c.metadata" class="health-card-meta">
              <div v-for="(val, key) in c.metadata" :key="key" class="health-meta-row">
                <span class="text-xs text-gray-500">{{ key }}:</span>
                <span class="text-xs">{{ val }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),n=f(!1),a=f(!1),i=J(()=>e.value.components||[]),l=J(()=>Xw[e.value.overall]||"text-gray-400"),r=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=J(()=>{const k=e.value.overall;return k==="healthy"?"All Systems Healthy":k==="degraded"?"Some Systems Degraded":k==="unhealthy"?"System Issues Detected":"Unknown"});function c(k){return Yw[k]||"text-gray-400"}function d(k){return Qw[k]||"info"}function u(k){return k==="ok"?"badge-success":k==="degraded"?"badge-warning":k==="down"?"badge-danger":"badge-info"}function p(k){return k==="closed"?"text-green-400":k==="half_open"?"text-yellow-400":k==="open"?"text-red-400":"text-gray-400"}function h(k){return k.replace(/_/g," ").replace(/\b\w/g,A=>A.toUpperCase())}function m(k){if(!k)return"—";try{return new Date(k).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return k}}function v(k){return k>=1e6?(k/1e6).toFixed(1)+"M":k>=1e3?(k/1e3).toFixed(1)+"K":String(k)}async function C(){a.value=!0;try{e.value=await W.get("/api/health/components"),s.value=null,n.value=!0}catch(k){s.value=k.message}finally{t.value=!1,a.value=!1}}function L(){t.value=!0,s.value=null,C()}let y=null,g=!1;function b(){g||(g=!0,C(),y||(y=setInterval(C,3e4)))}function S(){g&&(g=!1,y&&(clearInterval(y),y=null))}return We(b),us(b),ts(S),mt(S),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:C,retry:L}}},tk={template:`
    <div class="p-6 page-fade-in" role="region" aria-label="Resource Usage">
      <!-- Loading -->
      <div v-if="loading" class="space-y-4" role="status" aria-label="Loading resource data">
        <div class="hm-card"><div class="skeleton skeleton-text" style="width:220px;"></div></div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="n in 4" :key="n" class="hm-card text-center">
            <div class="skeleton skeleton-stat"></div>
            <div class="skeleton skeleton-text" style="width:60%;margin:0.25rem auto 0;"></div>
          </div>
        </div>
      </div>

      <!-- Error -->
      <!-- Full-page error ONLY when there is nothing to show. A failed
           background refresh must not replace data we already have:
           one 502 during a restart used to blank a page that had been
           rendering fine, until the next poll a full interval later. -->
      <div v-else-if="error && !hasData" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <div v-if="error && hasData" class="hm-card border-amber-900 mb-3" role="status" aria-live="polite">
          <p class="text-amber-400 text-sm">Last refresh failed: {{ error }} — showing the most recent data.</p>
        </div>
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-slate-200">Resource Usage</h2>
          <div class="flex items-center gap-3">
            <span class="text-xs text-slate-500">{{ collectedAt }}</span>
            <button @click="refresh" class="btn btn-ghost text-xs" :disabled="refreshing">
              {{ refreshing ? 'Refreshing…' : 'Refresh' }}
            </button>
          </div>
        </div>

        <!-- Top-level summary cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="hm-card stat-card text-center">
            <div class="text-2xl font-bold text-white">{{ data.sessions.active_count }}</div>
            <div class="text-xs text-slate-400 mt-1">Active Sessions</div>
          </div>
          <div class="hm-card stat-card text-center">
            <div class="text-2xl font-bold text-white">{{ fmtNum(data.knowledge.chunk_count) }}</div>
            <div class="text-xs text-slate-400 mt-1">Knowledge Chunks</div>
          </div>
          <div class="hm-card stat-card text-center">
            <div class="text-2xl font-bold text-white">{{ fmtNum(data.trajectories.total_count) }}</div>
            <div class="text-xs text-slate-400 mt-1">Trajectories Saved</div>
          </div>
          <div class="hm-card stat-card text-center">
            <div class="text-2xl font-bold text-emerald-400">{{ data.storage_total_mb }} MB</div>
            <div class="text-xs text-slate-400 mt-1">Total Storage</div>
          </div>
        </div>

        <!-- Section tabs -->
        <div class="flex gap-2 mb-4">
          <button v-for="t in tabs" :key="t.key"
                  @click="activeTab = t.key"
                  class="btn text-xs"
                  :class="activeTab === t.key ? 'btn-primary' : 'btn-ghost'">
            {{ t.label }}
          </button>
        </div>

        <!-- Sessions tab -->
        <div v-if="activeTab === 'sessions'">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ fmtNum(data.sessions.total_tokens) }}</div>
              <div class="text-xs text-slate-400 mt-1">Total Tokens</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ fmtNum(data.sessions.total_messages) }}</div>
              <div class="text-xs text-slate-400 mt-1">Total Messages</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold" :class="data.sessions.over_budget_count > 0 ? 'text-amber-400' : 'text-white'">
                {{ data.sessions.over_budget_count }}
              </div>
              <div class="text-xs text-slate-400 mt-1">Over Budget</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ data.sessions.persist_dir.total_mb }} MB</div>
              <div class="text-xs text-slate-400 mt-1">Persist Storage</div>
            </div>
          </div>

          <div v-if="data.sessions.per_session.length" class="hm-card">
            <h3 class="text-sm font-semibold text-slate-300 mb-2">Per-Session Breakdown</h3>
            <div class="table-responsive">
              <table class="w-full text-sm">
              <thead><tr class="text-slate-400 text-left">
                <th class="pb-2">Channel</th>
                <th class="pb-2 text-right">Tokens</th>
                <th class="pb-2 text-right">Messages</th>
                <th class="pb-2 text-right">Summary</th>
              </tr></thead>
              <tbody>
                <tr v-for="s in data.sessions.per_session" :key="s.channel_id" class="border-t border-slate-700">
                  <td class="py-1 text-slate-200 font-mono text-xs">{{ s.channel_id }}</td>
                  <td class="py-1 text-right">{{ fmtNum(s.tokens) }}</td>
                  <td class="py-1 text-right">{{ s.messages }}</td>
                  <td class="py-1 text-right">
                    <span :class="s.has_summary ? 'text-emerald-400' : 'text-slate-500'">
                      {{ s.has_summary ? 'Yes' : 'No' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
          <div v-else class="hm-card text-center text-slate-500 py-6">
            No active sessions
          </div>
        </div>

        <!-- Knowledge tab -->
        <div v-if="activeTab === 'knowledge'">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ data.knowledge.source_count }}</div>
              <div class="text-xs text-slate-400 mt-1">Sources</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ fmtNum(data.knowledge.chunk_count) }}</div>
              <div class="text-xs text-slate-400 mt-1">Chunks</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold" :class="data.knowledge.vector_search ? 'text-emerald-400' : 'text-amber-400'">
                {{ data.knowledge.vector_search ? 'Vector + FTS' : 'FTS Only' }}
              </div>
              <div class="text-xs text-slate-400 mt-1">Search Mode</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ data.knowledge.db_file.total_mb }} MB</div>
              <div class="text-xs text-slate-400 mt-1">DB Size</div>
            </div>
          </div>

          <div v-if="data.knowledge.sources.length" class="hm-card">
            <h3 class="text-sm font-semibold text-slate-300 mb-2">Ingested Sources</h3>
            <div class="table-responsive">
              <table class="w-full text-sm">
              <thead><tr class="text-slate-400 text-left">
                <th class="pb-2">Source</th>
                <th class="pb-2 text-right">Chunks</th>
                <th class="pb-2 text-right">Uploader</th>
              </tr></thead>
              <tbody>
                <tr v-for="s in data.knowledge.sources" :key="s.source" class="border-t border-slate-700">
                  <td class="py-1 text-slate-200 truncate" style="max-width:300px;" :title="s.source">{{ s.source }}</td>
                  <td class="py-1 text-right">{{ s.chunks }}</td>
                  <td class="py-1 text-right text-slate-400">{{ s.uploader }}</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
          <div v-else class="hm-card text-center text-slate-500 py-6">
            {{ data.knowledge.available ? 'No documents ingested' : 'Knowledge store unavailable' }}
          </div>
        </div>

        <!-- Trajectories tab -->
        <div v-if="activeTab === 'trajectories'">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ fmtNum(data.trajectories.message_count) }}</div>
              <div class="text-xs text-slate-400 mt-1">Message Turns</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ fmtNum(data.trajectories.agent_count) }}</div>
              <div class="text-xs text-slate-400 mt-1">Agent Turns</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ data.trajectories.message_dir.file_count }}</div>
              <div class="text-xs text-slate-400 mt-1">Message Files</div>
            </div>
            <div class="hm-card text-center">
              <div class="text-xl font-bold text-white">{{ data.trajectories.combined_mb }} MB</div>
              <div class="text-xs text-slate-400 mt-1">Total Volume</div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Message trajectory files -->
            <div class="hm-card">
              <h3 class="text-sm font-semibold text-slate-300 mb-2">
                Message Trajectory Files
                <span class="text-xs text-slate-500 ml-1">({{ data.trajectories.message_dir.total_mb }} MB)</span>
              </h3>
              <div v-if="data.trajectories.message_files.length" class="space-y-1 max-h-48 overflow-y-auto">
                <div v-for="f in data.trajectories.message_files" :key="f"
                     class="text-xs text-slate-400 font-mono py-0.5">
                  {{ f }}
                </div>
              </div>
              <div v-else class="text-xs text-slate-500">No trajectory files yet</div>
            </div>

            <!-- Agent trajectory files -->
            <div class="hm-card">
              <h3 class="text-sm font-semibold text-slate-300 mb-2">
                Agent Trajectory Files
                <span class="text-xs text-slate-500 ml-1">({{ data.trajectories.agent_dir.total_mb }} MB)</span>
              </h3>
              <div v-if="data.trajectories.agent_files.length" class="space-y-1 max-h-48 overflow-y-auto">
                <div v-for="f in data.trajectories.agent_files" :key="f"
                     class="text-xs text-slate-400 font-mono py-0.5">
                  {{ f }}
                </div>
              </div>
              <div v-else class="text-xs text-slate-500">No agent trajectory files yet</div>
            </div>
          </div>
        </div>

        <!-- Storage tab -->
        <div v-if="activeTab === 'storage'">
          <div class="hm-card">
            <h3 class="text-sm font-semibold text-slate-300 mb-3">Storage Breakdown</h3>
            <div class="space-y-3">
              <div v-for="item in storageItems" :key="item.label">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-slate-300">{{ item.label }}</span>
                  <span class="text-slate-400">{{ item.mb }} MB ({{ item.files }} files)</span>
                </div>
                <div class="res-bar-bg">
                  <div class="res-bar-fill" :style="{ width: item.pct + '%' }"
                       :class="item.color"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f(!1),a=f("sessions"),i=f(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=J(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=J(()=>{if(!i.value)return[];const C=i.value,L=C.storage_total_bytes||1;return[{label:"Session Persistence",mb:C.sessions.persist_dir.total_mb,bytes:C.sessions.persist_dir.total_bytes,files:C.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(C.sessions.persist_dir.total_bytes/L*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:C.knowledge.db_file.total_mb,bytes:C.knowledge.db_file.total_bytes,files:C.knowledge.db_file.file_count,pct:Math.min(100,Math.round(C.knowledge.db_file.total_bytes/L*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:C.trajectories.message_dir.total_mb,bytes:C.trajectories.message_dir.total_bytes,files:C.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(C.trajectories.message_dir.total_bytes/L*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:C.trajectories.agent_dir.total_mb,bytes:C.trajectories.agent_dir.total_bytes,files:C.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(C.trajectories.agent_dir.total_bytes/L*100)),color:"res-bar-amber"}]});async function d(){try{const C=await W.get("/api/resource-usage");i.value=C,t.value=null,s.value=!0}catch(C){t.value=C.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return We(m),us(m),ts(v),mt(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:Am,refresh:u,retry:p}}},sk=["INFO","WARNING","ERROR"],nk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],uo=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],ak=[50,100,200,500],ik={template:`
    <div class="p-6 page-fade-in flex flex-col"
         style="height: calc(100vh - var(--hm-topbar-h) - var(--hm-section-tabs-h));">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 class="text-xl font-semibold">Logs</h1>
          <p class="text-xs text-gray-500 mt-0.5" v-if="mode === 'live' && logs.length > 0">
            {{ filteredLogs.length.toLocaleString() }} / {{ logs.length.toLocaleString() }} entries
          </p>
          <p class="text-xs text-gray-500 mt-0.5" v-if="mode === 'search' && searchResults.length > 0">
            {{ searchResults.length.toLocaleString() }} results
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <!-- Mode toggle -->
          <div class="flex rounded overflow-hidden border border-gray-700">
            <button @click="mode = 'live'" class="px-3 py-1 text-xs"
                    :class="mode === 'live' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'">
              Live Tail
            </button>
            <button @click="switchToSearch" class="px-3 py-1 text-xs"
                    :class="mode === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'">
              Search History
            </button>
          </div>
          <template v-if="mode === 'live'">
            <button @click="togglePause" class="btn text-xs" :class="paused ? 'btn-primary' : 'btn-ghost'">
              {{ paused ? 'Resume' : 'Pause' }}
            </button>
            <button @click="clearLogs" class="btn btn-ghost text-xs">Clear</button>
          </template>
          <button @click="exportLogs" class="btn btn-ghost text-xs">Export</button>
        </div>
      </div>

      <!-- ===== LIVE MODE ===== -->
      <template v-if="mode === 'live'">
        <!-- Filter presets bar -->
        <div class="logs-filter-bar mb-2">
          <div class="flex gap-1.5 flex-wrap items-center">
            <button v-for="preset in logPresets" :key="preset.id"
                    @click="applyLogPreset(preset)"
                    class="sess-preset-chip"
                    :class="{ 'sess-preset-active': activeLogPreset === preset.id }">
              <span class="sess-preset-icon"><odin-icon :name="preset.icon" :size="15" /></span>
              <span>{{ preset.name }}</span>
            </button>
          </div>
        </div>

        <!-- Filters row -->
        <div class="flex gap-2 mb-2 flex-wrap items-center">
          <!-- Level chips -->
          <div class="flex gap-1">
            <button v-for="lvl in levels" :key="lvl"
                    @click="toggleLevel(lvl)"
                    class="log-chip"
                    :class="[levelChipClass(lvl), { 'log-chip-active': levelFilter === lvl }]">
              {{ lvl }}
            </button>
            <button v-if="levelFilter" @click="levelFilter = ''" class="log-chip log-chip-clear">ALL</button>
          </div>

          <!-- Time range -->
          <select v-model="timeRange" class="hm-select text-xs">
            <option v-for="tr in timeRanges" :key="tr.value" :value="tr.value">{{ tr.label }}</option>
          </select>

          <div class="log-filter-field">
            <div class="log-filter-row">
              <input v-model="textFilter" type="text" class="hm-input flex-1 log-filter-input"
                     :placeholder="useRegex ? 'Regex pattern...' : 'Filter logs...'"
                     :class="{ 'border-red-700': regexError }" />
              <button @click="useRegex = !useRegex" class="btn text-xs"
                      :class="useRegex ? 'btn-primary' : 'btn-ghost'"
                      title="Toggle regex filtering">.*</button>
            </div>
            <div v-if="regexError" class="text-red-400 text-xs mt-0.5">{{ regexError }}</div>
          </div>

          <label class="flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-pointer flex-shrink-0">
            <input type="checkbox" v-model="autoScroll" @change="onAutoScrollToggle" class="rounded" />
            Auto-scroll
          </label>
        </div>

        <!-- Custom preset save bar -->
        <div class="flex gap-2 items-center mb-2 flex-wrap">
          <button v-if="hasActiveLogFilters" @click="showSaveLogPreset = !showSaveLogPreset"
                  class="btn btn-ghost text-xs">Save as preset</button>
          <template v-if="showSaveLogPreset">
            <input v-model="newLogPresetName" type="text" class="hm-input text-xs"
                   placeholder="Preset name..." style="max-width: 180px;" />
            <button @click="saveLogCustomPreset" class="btn btn-primary text-xs"
                    :disabled="!newLogPresetName.trim()">Save</button>
          </template>
          <!-- Custom presets -->
          <button v-for="cp in customLogPresets" :key="cp.id"
                  @click="applyCustomLogPreset(cp)"
                  class="sess-preset-chip sess-preset-custom"
                  :class="{ 'sess-preset-active': activeLogPreset === cp.id }">
            <odin-icon name="sparkles" :size="14" />
            <span>{{ cp.name }}</span>
            <span class="sess-preset-remove" @click.stop="removeLogCustomPreset(cp.id)">&times;</span>
          </button>
        </div>

        <!-- Timeline visualization -->
        <div v-if="logs.length > 0" class="logs-timeline mb-2">
          <div class="logs-timeline-header">
            <span class="text-xs text-gray-500">Activity Timeline</span>
            <span class="text-xs text-gray-600">{{ timelineSpanLabel }}</span>
          </div>
          <div class="logs-timeline-chart">
            <div v-for="(bucket, bi) in timelineBuckets" :key="bi"
                 class="logs-timeline-bar-wrap"
                 :title="bucket.label + ': ' + bucket.total + ' entries'"
                 @click="jumpToTimelineBucket(bucket)">
              <div class="logs-timeline-bar">
                <div v-if="bucket.errors > 0" class="logs-timeline-segment logs-tl-error"
                     :style="{ height: segmentHeight(bucket.errors, timelineMax) }"></div>
                <div v-if="bucket.warnings > 0" class="logs-timeline-segment logs-tl-warning"
                     :style="{ height: segmentHeight(bucket.warnings, timelineMax) }"></div>
                <div v-if="bucket.info > 0" class="logs-timeline-segment logs-tl-info"
                     :style="{ height: segmentHeight(bucket.info, timelineMax) }"></div>
              </div>
              <span class="logs-timeline-label" v-if="bi % timelineLabelSkip === 0">{{ bucket.shortLabel }}</span>
            </div>
          </div>
        </div>

        <!-- Status bar -->
        <div class="flex items-center gap-3 mb-2 text-xs text-gray-500 flex-wrap">
          <div class="flex items-center gap-1.5">
            <span class="ws-indicator" :class="'ws-' + wsState"></span>
            {{ wsStateLabel }}
          </div>
          <span class="font-mono">{{ filteredLogs.length.toLocaleString() }} / {{ logs.length.toLocaleString() }} lines</span>
          <span v-if="paused" class="badge badge-warning">Paused ({{ pauseBuffer.length }} buffered)</span>
          <span v-if="timeRange" class="badge badge-info">{{ timeRangeLabel }}</span>
          <span v-if="copiedIndex !== null" class="text-green-400">Copied!</span>
        </div>

        <!-- Log output -->
        <div class="relative flex-1" style="min-height:200px;">
          <div ref="logContainer" @scroll="onScroll"
               @wheel="onUserScrollIntent" @touchmove="onUserScrollIntent"
               @pointerdown="onPointerDown" @keydown="onUserScrollKey"
               tabindex="0" role="region" aria-label="Log output"
               class="absolute inset-0 overflow-y-auto bg-gray-950 border border-gray-800 rounded p-3 font-mono text-xs">
            <div v-if="filteredLogs.length === 0" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon"><odin-icon :name="logs.length === 0 ? 'file' : 'search'" :size="23" /></span>
              <span class="empty-state-text">{{ logs.length === 0 ? 'Waiting for log entries...' : 'No entries match the current filter' }}</span>
            </div>
            <div v-for="(entry, i) in filteredLogs" :key="i"
                 class="log-line py-0.5 leading-relaxed whitespace-pre-wrap break-all"
                 :class="logLineClass(entry)">
              <span class="log-ts text-gray-600 cursor-pointer hover:text-gray-400"
                    @click="copyLine(entry, i)"
                    title="Click to copy line">{{ entry.ts || '' }}</span>
              <span class="log-level mx-1" :class="levelClass(entry.level)">{{ entry.level || 'INFO' }}</span>
              <span v-if="entry.tool" class="logs-tool-badge">{{ entry.tool }}</span>
              <span>{{ entry.text || entry.raw || '' }}</span>
            </div>
          </div>

          <!-- Jump to bottom -->
          <button v-if="showJumpBottom" @click="jumpToBottom"
                  class="log-jump-btn">
            <odin-icon name="download" :size="14" /> Jump to bottom
          </button>
        </div>
      </template>

      <!-- ===== SEARCH HISTORY MODE ===== -->
      <template v-if="mode === 'search'">
        <!-- Stats bar -->
        <div v-if="searchStats" class="flex gap-4 mb-3 flex-wrap">
          <div class="bg-gray-800 rounded px-3 py-2 text-center min-w-[100px]">
            <div class="text-lg font-semibold">{{ (searchStats.total || 0).toLocaleString() }}</div>
            <div class="text-xs text-gray-500">Total entries</div>
          </div>
          <div class="bg-gray-800 rounded px-3 py-2 text-center min-w-[100px]">
            <div class="text-lg font-semibold text-red-400">{{ (searchStats.errors || 0).toLocaleString() }}</div>
            <div class="text-xs text-gray-500">Errors</div>
          </div>
          <div class="bg-gray-800 rounded px-3 py-2 text-center min-w-[100px]">
            <div class="text-lg font-semibold text-blue-400">{{ (searchStats.tool_count || 0).toLocaleString() }}</div>
            <div class="text-xs text-gray-500">Unique tools</div>
          </div>
          <div class="bg-gray-800 rounded px-3 py-2 text-center min-w-[100px]">
            <div class="text-lg font-semibold text-purple-400">{{ (searchStats.web_actions || 0).toLocaleString() }}</div>
            <div class="text-xs text-gray-500">Web actions</div>
          </div>
        </div>

        <!-- Search filters -->
        <div class="bg-gray-800 rounded p-3 mb-3">
          <div class="flex gap-3 flex-wrap items-end">
            <!-- Level -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Level
              <select v-model="searchLevel" class="hm-select text-xs" style="min-width:100px;">
                <option value="all">All</option>
                <option value="error">Errors only</option>
                <option value="info">Info only</option>
              </select>
              </label>
            </div>

            <!-- Tool name -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Tool
              <select v-model="searchTool" class="hm-select text-xs" style="min-width:140px;">
                <option value="">Any tool</option>
                <option v-for="t in (searchStats ? searchStats.tools || [] : [])" :key="t" :value="t">{{ t }}</option>
              </select>
              </label>
            </div>

            <!-- Time range quick select -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Time range
              <select v-model="searchTimePreset" @change="applySearchTimePreset" class="hm-select text-xs" style="min-width:130px;">
                <option value="">Custom / All</option>
                <option value="last_5m">Last 5 min</option>
                <option value="last_15m">Last 15 min</option>
                <option value="last_1h">Last 1 hour</option>
                <option value="last_4h">Last 4 hours</option>
                <option value="last_24h">Last 24 hours</option>
                <option value="last_7d">Last 7 days</option>
              </select>
              </label>
            </div>

            <!-- Start time -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">From
              <input v-model="searchStart" type="datetime-local" class="hm-input text-xs" style="min-width:170px;" />
              </label>
            </div>

            <!-- End time -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">To
              <input v-model="searchEnd" type="datetime-local" class="hm-input text-xs" style="min-width:170px;" />
              </label>
            </div>

            <!-- Keyword -->
            <div class="flex flex-col gap-1 flex-1" style="min-width:150px;">
              <label class="text-xs text-gray-500">Keyword
              <input v-model="searchKeyword" type="text" class="hm-input text-xs"
                     placeholder="Search text..."
                     @keyup.enter="runSearch" />
              </label>
            </div>

            <!-- Limit -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-gray-500">Limit
              <select v-model.number="searchLimit" class="hm-select text-xs" style="min-width:80px;">
                <option v-for="l in searchLimits" :key="l" :value="l">{{ l }}</option>
              </select>
              </label>
            </div>

            <!-- Search button -->
            <button @click="runSearch" class="btn btn-primary text-xs self-end"
                    :disabled="searching">
              {{ searching ? 'Searching...' : 'Search' }}
            </button>

            <!-- Clear filters -->
            <button @click="clearSearchFilters" class="btn btn-ghost text-xs self-end">Clear</button>
          </div>
        </div>

        <!-- Search error -->
        <div v-if="searchError" class="bg-red-900/30 border border-red-800 rounded p-3 mb-3 text-sm text-red-300">
          {{ searchError }}
        </div>

        <!-- Search results -->
        <div class="relative flex-1" style="min-height:200px;">
          <div class="absolute inset-0 overflow-y-auto bg-gray-950 border border-gray-800 rounded p-3 font-mono text-xs">
            <!-- Loading -->
            <div v-if="searching" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon"><odin-icon name="clock" :size="23" /></span>
              <span class="empty-state-text">Searching...</span>
            </div>

            <!-- No results -->
            <div v-else-if="searchResults.length === 0 && searchRan" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon"><odin-icon name="search" :size="23" /></span>
              <span class="empty-state-text">No entries match the search criteria</span>
            </div>

            <!-- Prompt to search -->
            <div v-else-if="searchResults.length === 0 && !searchRan" class="empty-state" style="padding:2rem 0;">
              <span class="empty-state-icon"><odin-icon name="chart" :size="23" /></span>
              <span class="empty-state-text">Set filters and click Search to query log history</span>
            </div>

            <!-- Results list -->
            <template v-else>
              <div v-for="(entry, i) in searchResults" :key="i"
                   class="log-line py-0.5 leading-relaxed whitespace-pre-wrap break-all cursor-pointer"
                   :class="searchLogLineClass(entry)"
                   @click="toggleSearchExpand(i)">
                <span class="log-ts text-gray-600">{{ formatSearchTs(entry) }}</span>
                <span class="log-level mx-1" :class="entry.error ? 'text-red-500 font-semibold' : 'text-blue-500'">
                  {{ entry.error ? 'ERROR' : 'INFO' }}
                </span>
                <span v-if="entry.tool_name" class="logs-tool-badge">{{ entry.tool_name }}</span>
                <span v-if="entry.type === 'web_action'" class="logs-tool-badge" style="background:rgba(139,92,246,.18);color:#a78bfa;">
                  {{ entry.method }} {{ entry.path }}
                </span>
                <span v-if="entry.user_name" class="text-gray-500 mr-1">[{{ entry.user_name }}]</span>
                <span>{{ searchEntryText(entry) }}</span>

                <!-- Expanded detail -->
                <div v-if="expandedSearch === i" class="mt-2 ml-4 p-2 bg-gray-900 border border-gray-700 rounded text-xs"
                     @click.stop>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mb-2" style="max-width:500px;">
                    <span class="text-gray-500">Timestamp:</span>
                    <span>{{ entry.timestamp || 'N/A' }}</span>
                    <template v-if="entry.user_id">
                      <span class="text-gray-500">User:</span>
                      <span>{{ entry.user_name || '' }} ({{ entry.user_id }})</span>
                    </template>
                    <template v-if="entry.channel_id">
                      <span class="text-gray-500">Channel:</span>
                      <span>{{ entry.channel_id }}</span>
                    </template>
                    <template v-if="entry.execution_time_ms !== undefined">
                      <span class="text-gray-500">Duration:</span>
                      <span>{{ entry.execution_time_ms }}ms</span>
                    </template>
                  </div>
                  <div v-if="entry.tool_input" class="mb-2">
                    <div class="text-gray-500 mb-1">Input:</div>
                    <pre class="bg-gray-800 rounded p-2 overflow-x-auto" style="max-height:150px;">{{ formatJson(entry.tool_input) }}</pre>
                  </div>
                  <div v-if="entry.result_summary">
                    <div class="text-gray-500 mb-1">Result:</div>
                    <pre class="bg-gray-800 rounded p-2 overflow-x-auto whitespace-pre-wrap" style="max-height:200px;">{{ entry.result_summary }}</pre>
                  </div>
                  <div v-if="entry.error" class="mt-2">
                    <div class="text-red-400 mb-1">Error:</div>
                    <pre class="bg-red-900/20 rounded p-2 overflow-x-auto whitespace-pre-wrap" style="max-height:150px;">{{ entry.error }}</pre>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>`,setup(){const e=f("live"),t=f([]),s=f(!1),n=f(!0),a=f(""),i=f(""),l=f(!1),r=f(!1),o=f(Ye.state||"disconnected"),c=J(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=f(null),u=f(!1),p=f(null),h=2e3,m=sk,v=nk,C=uo,L=f("all"),y=f(""),g=f([]),b=f(!1),S=f(""),k=f([]);function A(){try{const G=localStorage.getItem("odin-log-presets");G&&(g.value=JSON.parse(G))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(g.value))}catch{}}const _=J(()=>a.value!==""||i.value.trim()!==""||y.value!==""),D=J(()=>{const G=uo.find(me=>me.value===y.value);return G?G.label:""}),E=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(G){return G.message}}),R=24,$=J(()=>{if(K.value.length===0)return[];const G=[],me=new Date,Ne=3600*1e3;for(let Ve=R-1;Ve>=0;Ve--){const dt=new Date(me.getTime()-(Ve+1)*Ne),Lt=new Date(me.getTime()-Ve*Ne);G.push({start:dt,end:Lt,label:N(dt,Lt),shortLabel:Lt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ve of K.value){if(!Ve._time)continue;const dt=Ve._time.getTime();for(const Lt of G)if(dt>=Lt.start.getTime()&&dt<Lt.end.getTime()){Lt.total++,Ve.level==="ERROR"?Lt.errors++:Ve.level==="WARNING"?Lt.warnings++:Lt.info++;break}}return G}),V=J(()=>{let G=1;for(const me of $.value)me.total>G&&(G=me.total);return G}),oe=J(()=>{if($.value.length===0)return"";const G=K.value.map(Ve=>Ve._time&&Ve._time.getTime()).filter(Boolean);if(G.length===0)return"";const me=new Date(Math.min(...G));return`${K.value.length} shown, oldest ${me.toLocaleTimeString()}`}),P=J(()=>Math.ceil(R/8));function N(G,me){const Ne={hour:"2-digit",minute:"2-digit"};return G.toLocaleTimeString([],Ne)+" - "+me.toLocaleTimeString([],Ne)}function O(G,me){return!me||!G?"0px":Math.max(2,G/me*100)+"%"}function U(G){const me=K.value.findIndex(Ne=>Ne._time&&Ne._time.getTime()>=G.start.getTime()&&Ne._time.getTime()<G.end.getTime());if(me>=0&&d.value){const Ne=d.value.querySelectorAll(".log-line");Ne[me]&&(Ne[me].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const K=J(()=>{let G=t.value;if(a.value&&(G=G.filter(me=>(me.level||"INFO")===a.value)),y.value){const me=uo.find(Ne=>Ne.value===y.value);if(me&&me.seconds){const Ne=new Date(Date.now()-me.seconds*1e3);G=G.filter(Ve=>Ve._time&&Ve._time>=Ne)}}if(i.value&&!E.value)if(l.value)try{const me=new RegExp(i.value,"i");G=G.filter(Ne=>{const Ve=Ne.text||Ne.raw||"",dt=Ne.tool||"";return me.test(Ve)||me.test(dt)})}catch{}else{const me=i.value.toLowerCase();G=G.filter(Ne=>{const Ve=(Ne.text||Ne.raw||"").toLowerCase(),dt=(Ne.tool||"").toLowerCase();return Ve.includes(me)||dt.includes(me)})}return G});function q(G){if(G.type==="log"&&G.line)try{const me=typeof G.line=="string"?JSON.parse(G.line):G.line,Ne=me.timestamp?new Date(me.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:me.error?"ERROR":"INFO",text:me.tool_name?`[${me.tool_name}] ${me.result_summary||""}`.trim():me.message||JSON.stringify(me),tool:me.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(G.line),tool:"",raw:String(G.line)}}if(G.payload){const me=G.payload,Ne=me.timestamp?new Date(me.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:me.error?"ERROR":"INFO",text:me.tool_name?`[${me.tool_name}] ${me.result_summary||""}`.trim():me.message||JSON.stringify(me),tool:me.tool_name||"",raw:null}}return typeof G=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:G,tool:"",raw:G}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(G),tool:"",raw:null}}function Q(G){const me=q(G);if(s.value){k.value.push(me);return}ie(me)}function ie(G){t.value.push(G),t.value.length>h&&(t.value=t.value.slice(-h)),n.value&&Et(()=>X())}function X(G=!1){const me=d.value;me&&me.scrollTo({top:me.scrollHeight,behavior:G?"smooth":"instant"})}function fe(){n.value=!0,u.value=!1,Et(()=>X(!0))}const Pe=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function Y(){const G=d.value;if(!G)return;const me=G.scrollHeight-G.scrollTop-G.clientHeight<40;u.value=!n.value&&!me&&t.value.length>0,ue.value&&be()}function be(){const G=d.value;!G||!n.value||G.scrollHeight-G.scrollTop-G.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function H(){n.value&&requestAnimationFrame(be)}function re(G){Pe.has(G.key)&&H()}const ue=f(!1);function Le(){n.value&&(ue.value=!0,requestAnimationFrame(be))}function x(){ue.value&&(ue.value=!1,be())}function M(){n.value&&(u.value=!1,Et(()=>X()))}function B(){if(s.value=!s.value,!s.value&&k.value.length>0){for(const G of k.value)ie(G);k.value=[]}}function ae(){t.value=[],k.value=[],u.value=!1}function te(){let G;e.value==="search"?G=ze.value.map(dt=>{const Lt=dt.error?"ERROR":"INFO",Jn=dt.tool_name?`[${dt.tool_name}] `:"";return`${dt.timestamp||""} ${Lt} ${Jn}${dt.result_summary||dt.message||""}`}).join(`
`):G=K.value.map(dt=>`${dt.ts} ${dt.level} ${dt.text}`).join(`
`);const me=new Blob([G],{type:"text/plain"}),Ne=URL.createObjectURL(me),Ve=document.createElement("a");Ve.href=Ne,Ve.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ve.click(),URL.revokeObjectURL(Ne)}function ne(G,me){const Ne=`${G.ts} ${G.level} ${G.text||G.raw||""}`;navigator.clipboard.writeText(Ne).then(()=>{p.value=me,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function he(G){a.value=a.value===G?"":G,L.value="all"}function de(G){return G.level==="ERROR"?"log-line-error":G.level==="WARNING"?"log-line-warning":"text-gray-300"}function pe(G){return G==="ERROR"?"text-red-500 font-semibold":G==="WARNING"?"text-yellow-500":"text-blue-500"}function le(G){return G==="ERROR"?"log-chip-error":G==="WARNING"?"log-chip-warning":"log-chip-info"}function ke(G){L.value=G.id;const me=G.filters;a.value=me.level||"",y.value=me.timeRange||"",i.value=me.text||"",me.levels&&(a.value=me.levels[0]||""),me.hasToolName&&(i.value="")}function ye(G){L.value=G.id,a.value=G.filters.level||"",y.value=G.filters.timeRange||"",i.value=G.filters.text||""}function _e(){if(!S.value.trim())return;const G={id:"custom-"+Date.now(),name:S.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};g.value=[...g.value,G],T(),b.value=!1,S.value=""}function ce(G){g.value=g.value.filter(me=>me.id!==G),T(),L.value===G&&(L.value="all")}const z=f("all"),ve=f(""),Te=f(""),Oe=f(""),De=f(""),ct=f(""),rt=f(100),Pt=ak,se=f(!1),we=f(!1),Ie=f(""),ze=f([]),it=f(null),qe=f(null);function _t(){e.value="search",it.value||Ot()}async function Ot(){try{it.value=await W.get("/api/logs/stats")}catch{}}function Es(){const G=ct.value;if(!G){Oe.value="",De.value="";return}const Ne={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[G];if(Ne){const Ve=new Date(Date.now()-Ne*1e3);Oe.value=$s(Ve),De.value=""}}function $s(G){const me=Ne=>String(Ne).padStart(2,"0");return`${G.getFullYear()}-${me(G.getMonth()+1)}-${me(G.getDate())}T${me(G.getHours())}:${me(G.getMinutes())}`}function Ut(G){if(!G)return"";const me=new Date(G);return isNaN(me.getTime())?"":me.toISOString()}async function ys(){se.value=!0,Ie.value="",we.value=!0,qe.value=null;try{const G=new URLSearchParams;z.value&&z.value!=="all"&&G.set("level",z.value),ve.value&&G.set("tool",ve.value),Te.value&&G.set("q",Te.value);const me=Ut(Oe.value),Ne=Ut(De.value);me&&G.set("start",me),Ne&&G.set("end",Ne),G.set("limit",String(rt.value));const Ve=await W.get(`/api/logs/search?${G.toString()}`);ze.value=Ve.entries||[]}catch(G){Ie.value=G.message||"Search failed",ze.value=[]}finally{se.value=!1}}function As(){z.value="all",ve.value="",Te.value="",Oe.value="",De.value="",ct.value="",rt.value=100,ze.value=[],we.value=!1,Ie.value="",qe.value=null}function Ks(G){qe.value=qe.value===G?null:G}function Nn(G){if(!G.timestamp)return"";try{return new Date(G.timestamp).toLocaleString()}catch{return G.timestamp}}function Us(G){return G.type==="web_action"?`${G.status||""} (${G.execution_time_ms||0}ms)`:(G.result_summary||"").slice(0,200)}function Ws(G){return G.error?"log-line-error":"text-gray-300"}function rn(G){try{return JSON.stringify(G,null,2)}catch{return String(G)}}let wt=null,Rs=!1;function Dn(){Rs||(Rs=!0,Ye.subscribe("logs",Q),r.value=Ye.connected,o.value=Ye.state||"disconnected",wt=Ye.onState(G=>{o.value=G,r.value=G==="connected"}))}function lt(){Rs&&(Rs=!1,Ye.unsubscribe("logs",Q),wt&&(wt(),wt=null))}return We(()=>{A(),window.addEventListener("pointerup",x),window.addEventListener("pointercancel",x)}),us(Dn),ts(lt),mt(()=>{lt(),window.removeEventListener("pointerup",x),window.removeEventListener("pointercancel",x)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:K,pauseBuffer:k,showJumpBottom:u,copiedIndex:p,regexError:E,levels:m,logPresets:v,timeRanges:C,timeRange:y,activeLogPreset:L,customLogPresets:g,showSaveLogPreset:b,newLogPresetName:S,hasActiveLogFilters:_,timeRangeLabel:D,timelineBuckets:$,timelineMax:V,timelineSpanLabel:oe,timelineLabelSkip:P,togglePause:B,clearLogs:ae,exportLogs:te,logLineClass:de,levelClass:pe,levelChipClass:le,toggleLevel:he,copyLine:ne,jumpToBottom:fe,onScroll:Y,onUserScrollIntent:H,onUserScrollKey:re,onAutoScrollToggle:M,onPointerDown:Le,applyLogPreset:ke,applyCustomLogPreset:ye,saveLogCustomPreset:_e,removeLogCustomPreset:ce,segmentHeight:O,jumpToTimelineBucket:U,searchLevel:z,searchTool:ve,searchKeyword:Te,searchStart:Oe,searchEnd:De,searchTimePreset:ct,searchLimit:rt,searchLimits:Pt,searching:se,searchRan:we,searchError:Ie,searchResults:ze,searchStats:it,expandedSearch:qe,switchToSearch:_t,runSearch:ys,clearSearchFilters:As,toggleSearchExpand:Ks,formatSearchTs:Nn,searchEntryText:Us,searchLogLineClass:Ws,formatJson:rn,applySearchTimePreset:Es}}};function El(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const lk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function rk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const r=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(r)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Za=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],ok={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},po=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),ck=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function qu(e){return ck.some(t=>e===t||e.startsWith(`${t}.`))}const Mm="odin_config_center_expanded_v1",Pm="odin_config_center_category_v1",dk=50,uk=650,fo=()=>W.get("/api/config/meta");function ia(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Pi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Oa(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function pk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function fk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Fm(e,t){if(Pi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return ia(t);const n={};for(const[a,i]of Object.entries(t)){const l=Fm(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function hk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Fm(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function $m(e,t,s,n){if(Pi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)$m(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function mk(){try{const e=JSON.parse(localStorage.getItem(Mm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function vk(){try{const e=localStorage.getItem(Pm);return Za.some(t=>t.key===e)?e:Za[0].key}catch{return Za[0].key}}const gk={template:`
    <div class="config-center-page p-6 page-fade-in">
      <header class="cfgc-page-header">
        <div>
          <div class="cfgc-eyebrow">System settings</div>
          <h1 class="text-xl font-semibold">Configuration center</h1>
          <p class="cfgc-page-summary" v-if="config">
            {{ sectionCount }} sections · {{ fieldCount }} settings · revision {{ meta?.revision || 'unavailable' }}
          </p>
        </div>
        <div class="cfgc-header-actions">
          <button type="button" class="btn btn-ghost text-xs cfgc-desktop-history" @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">
            <odin-icon name="undo" :size="14" /> Undo
          </button>
          <button type="button" class="btn btn-ghost text-xs cfgc-desktop-history" @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Y)">
            <odin-icon name="redo" :size="14" /> Redo
          </button>
          <button type="button" class="btn btn-ghost text-xs" @click="fetchConfig" :disabled="loading || hasChanges">
            <odin-icon name="refresh" :size="14" /> {{ loading ? 'Refreshing' : 'Refresh' }}
          </button>
          <button type="button" class="btn btn-primary text-xs" @click="openReview" :disabled="!hasChanges || hasDraftErrors">
            Review {{ changeCount ? changeCount : '' }}
          </button>
        </div>
      </header>

      <div v-if="toast" :class="['toast', toast.type === 'success' ? 'toast-success' : 'toast-error']" role="status" aria-live="polite">
        {{ toast.message }}
      </div>

      <div v-if="loading && !config" class="cfgc-loading" aria-label="Loading configuration">
        <div class="skeleton skeleton-row"></div>
        <div class="cfgc-loading-grid">
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
        </div>
      </div>

      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <div class="flex-1">
          <p class="text-red-400">Configuration could not be loaded</p>
          <p class="text-xs text-gray-500 mt-1">{{ error }}</p>
        </div>
        <button type="button" @click="fetchConfig" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <template v-else-if="config && meta">
        <section class="cfgc-health" aria-labelledby="cfgc-health-title">
          <div class="cfgc-health-heading">
            <div>
              <div class="cfgc-eyebrow">Configuration health</div>
              <h2 id="cfgc-health-title">Desired and effective state</h2>
            </div>
            <span v-if="hasChanges" class="cfgc-unsaved-pill">
              {{ changeCount }} unsaved change{{ changeCount === 1 ? '' : 's' }}
            </span>
            <span v-else class="cfgc-health-ok"><odin-icon name="success" :size="13" /> No unsaved changes</span>
          </div>

          <div class="cfgc-health-filters" role="group" aria-label="Filter configuration health">
            <button v-for="filter in healthFilters" :key="filter.key" type="button"
                    :class="['cfgc-health-filter', { active: healthFilter === filter.key }]"
                    :aria-pressed="healthFilter === filter.key" @click="selectHealthFilter(filter.key)">
              <span :class="['cfgc-health-icon', 'state-' + filter.key]"><odin-icon :name="filter.icon" :size="14" /></span>
              <span class="cfgc-health-copy">
                <span>{{ filter.label }}</span>
                <small>{{ healthCount(filter.key) }} setting{{ healthCount(filter.key) === 1 ? '' : 's' }}</small>
              </span>
            </button>
          </div>

          <div v-if="metaRefreshError" class="cfgc-health-alert warning" role="alert">
            <odin-icon name="warning" :size="16" />
            <div><strong>Apply status is stale</strong><span>{{ metaRefreshError }} Refresh to retrieve current registry state.</span></div>
          </div>
          <div v-if="meta.status?.persistence_error" class="cfgc-health-alert danger" role="alert">
            <odin-icon name="error" :size="16" />
            <div><strong>Persistence error</strong><span>{{ meta.status.persistence_error }}</span></div>
          </div>
          <div v-if="meta.status?.unsafe_overrides?.length" class="cfgc-health-alert warning" role="status">
            <odin-icon name="warning" :size="16" />
            <div><strong>Unsafe overrides effective</strong><span>{{ meta.status.unsafe_overrides.length }} item{{ meta.status.unsafe_overrides.length === 1 ? '' : 's' }} require review.</span></div>
          </div>
        </section>

        <section v-if="pendingRestartCount" class="cfgc-restart-banner" role="status">
          <odin-icon name="refresh" :size="18" />
          <div>
            <strong v-if="restartScheduled">Restart scheduled; waiting for Odin to return</strong>
            <strong v-else>Restart needed</strong>
            <span>Odin is still using startup values for {{ pendingRestartCount }} saved setting{{ pendingRestartCount === 1 ? '' : 's' }}.</span>
            <span v-if="restartError" class="text-red-400">{{ restartError }}</span>
          </div>
          <div class="cfgc-restart-actions">
            <button type="button" class="btn btn-ghost text-xs" @click="reviewPendingRestart">Review settings</button>
            <button type="button" class="btn btn-primary text-xs" @click="restartOdin" :disabled="restartScheduled">{{ restartScheduled ? 'Restarting…' : 'Restart Odin now' }}</button>
          </div>
        </section>

        <div class="cfgc-workspace">
          <aside class="cfgc-category-rail" aria-label="Configuration categories">
            <div class="cfgc-rail-label">Categories</div>
            <div class="cfgc-category-scroll">
              <button v-for="category in visibleCategories" :key="category.key" type="button"
                      :class="['cfgc-category', { active: activeCategory === category.key && !globalFilterActive }]"
                      :aria-current="activeCategory === category.key && !globalFilterActive ? 'page' : undefined"
                      @click="selectCategory(category.key)">
                <span class="cfgc-category-icon"><odin-icon :name="category.icon" :size="16" /></span>
                <span class="cfgc-category-copy">
                  <span>{{ category.label }}</span>
                  <small>{{ categoryStats(category).fields }} settings</small>
                </span>
                <span class="cfgc-category-counts" aria-hidden="true">
                  <span v-if="categoryStats(category).modified" class="modified">{{ categoryStats(category).modified }}M</span>
                  <span v-if="categoryStats(category).pending_restart" class="restart">{{ categoryStats(category).pending_restart }}R</span>
                  <span v-if="categoryStats(category).invalid" class="invalid">{{ categoryStats(category).invalid }}I</span>
                  <span v-if="categoryStats(category).dormant" class="dormant">{{ categoryStats(category).dormant }}D</span>
                </span>
              </button>
            </div>
            <div class="cfgc-rail-key">
              <span><b class="modified">M</b> Modified</span>
              <span><b class="restart">R</b> Restart</span>
              <span><b class="invalid">I</b> Invalid</span>
              <span><b class="dormant">D</b> Saved only</span>
            </div>
          </aside>

          <main ref="configMain" class="cfgc-main">
            <div class="cfgc-toolbar">
              <label class="cfgc-search">
                <span class="sr-only">Search configuration</span>
                <odin-icon name="search" :size="16" />
                <input v-model.trim="searchQuery" type="search"
                       placeholder="Search labels, paths, descriptions, or aliases"
                       autocomplete="off" />
                <button v-if="searchQuery" type="button" class="icon-btn" @click="searchQuery = ''" aria-label="Clear search">
                  <odin-icon name="close" :size="14" />
                </button>
              </label>
              <button v-if="globalFilterActive" type="button" class="btn btn-ghost text-xs" @click="clearFilters">
                Clear filters
              </button>
            </div>

            <div v-if="displayGroups.length === 0" class="cfgc-empty hm-card">
              <odin-icon name="search" :size="24" />
              <h2>No configuration matches</h2>
              <p>Try a label such as “timeout”, a raw path such as <code>tools.streaming</code>, or clear the health filter.</p>
              <button type="button" class="btn btn-ghost text-xs" @click="clearFilters">Clear filters</button>
            </div>

            <section v-for="group in displayGroups" :key="group.key" class="cfgc-category-panel" :aria-labelledby="'cfgc-group-' + group.key">
              <div class="cfgc-category-panel-heading">
                <div>
                  <div class="cfgc-eyebrow">{{ globalFilterActive ? 'Matching category' : 'Category' }}</div>
                  <h2 :id="'cfgc-group-' + group.key">{{ group.label }}</h2>
                </div>
                <span>{{ group.sections.length }} section{{ group.sections.length === 1 ? '' : 's' }}</span>
              </div>

              <article v-for="section in group.sections" :key="section"
                       :class="['cfgc-section', { modified: sectionChanged(section) }]">
                <button type="button" class="cfgc-section-header" @click="toggleSection(section)"
                        :aria-expanded="isSectionExpanded(section)" :aria-controls="'cfgc-section-' + section">
                  <span class="cfgc-section-chevron"><odin-icon :name="isSectionExpanded(section) ? 'chevronDown' : 'chevronRight'" :size="15" /></span>
                  <span class="cfgc-section-title">
                    <span>{{ sectionLabel(section) }}</span>
                    <small>{{ section }}</small>
                  </span>
                  <span class="cfgc-section-summary">{{ sectionDescription(section) }}</span>
                  <span class="cfgc-section-badges">
                    <span v-if="sectionChanged(section)" class="badge badge-warning">modified</span>
                    <span v-if="sectionHealthCount(section, 'pending_restart')" class="badge cfgc-badge-restart">restart</span>
                    <span v-if="sectionHealthCount(section, 'invalid')" class="badge badge-danger">invalid</span>
                    <span v-if="sectionHealthCount(section, 'dormant')" class="badge cfgc-badge-dormant">saved only</span>
                    <span class="cfgc-field-count">{{ sectionFieldCount(section) }}</span>
                  </span>
                </button>

                <div v-if="isSectionExpanded(section)" :id="'cfgc-section-' + section" class="cfgc-section-body">
                  <div v-if="section !== 'mcp' && searchQuery && sectionSearchHits(section).length" class="cfgc-search-hits">
                    <span>Matched</span>
                    <button v-for="hit in sectionSearchHits(section).slice(0, 5)" :key="hit.path" type="button" @click="focusField(hit.path)">
                      {{ hit.label }} <code>{{ hit.path }}</code>
                    </button>
                    <span v-if="sectionSearchHits(section).length > 5">+{{ sectionSearchHits(section).length - 5 }} more</span>
                  </div>




                  <div v-if="section === 'mcp'" class="cfgc-mcp-owner">
                    <span class="cfgc-mcp-owner-icon" aria-hidden="true"><odin-icon name="network" :size="18" /></span>
                    <div>
                      <strong>Managed in MCP Servers</strong>
                      <p>{{ mcpConfigSummary() }} Configuration Center is read-only for this section so there is one editor for durable and runtime truth.</p>
                    </div>
                    <router-link class="btn btn-ghost text-xs" :to="{ path: '/capabilities', query: { tab: 'mcp-servers' } }">
                      Open MCP Servers <odin-icon name="chevronRight" :size="14" />
                    </router-link>
                  </div>

                  <div v-else class="cfgc-field-groups">
                    <section v-for="fieldGroup in fieldGroups(section)" :key="fieldGroup.key" :class="['cfgc-field-group', { nested: fieldGroup.path }]">
                      <header v-if="fieldGroup.path" class="cfgc-field-group-header">
                        <div>
                          <strong>{{ fieldGroup.label }}</strong>
                          <code>{{ fieldGroup.path }}</code>
                          <p v-if="fieldGroup.description">{{ fieldGroup.description }}</p>
                        </div>
                        <span>{{ fieldGroup.entries.length }} setting{{ fieldGroup.entries.length === 1 ? '' : 's' }}</span>
                      </header>

                      <div class="cfgc-fields">
                        <div v-for="field in fieldGroup.entries" :key="field.path" :id="fieldId(field.path)"
                             :class="['cfgc-field', { changed: fieldChanged(field.path), invalid: fieldError(field) }]">
                          <div class="cfgc-field-copy">
                            <label :for="fieldInputId(field.path)">{{ field.label }}</label>
                            <code>{{ field.path }}</code>
                            <p>{{ field.description }}</p>
                            <div class="cfgc-field-meta">
                              <span :class="['cfgc-apply-pill', applyClass(field.apply_mode)]">{{ applyModeLabel(field.apply_mode) }}</span>
                              <span v-if="field.unit">{{ field.unit }}</span>
                              <span v-if="field.sensitivity !== 'public'" class="cfgc-sensitive"><odin-icon name="shield" :size="12" /> write-only</span>
                            </div>
                          </div>

                          <div class="cfgc-field-control">
                            <template v-if="field.structured_container || field.structured_container_child">
                              <div class="cfgc-structured-summary">
                                <span v-if="field.sensitivity !== 'public'"><odin-icon name="shield" :size="15" /> {{ field.configured ? 'Configured value' : 'Not configured' }}</span>
                                <span v-else>{{ compactValue(field.value) }}</span>
                                <small><template v-if="field.sensitivity !== 'public'">Values are hidden. </template><template v-if="field.structured_container_child">Part of a structured collection. </template>Read-only here. Edit this collection in config.yml. {{ structuredApplyCopy(field) }}</small>
                              </div>
                            </template>

                            <template v-else-if="field.sensitivity !== 'public'">
                              <div class="cfgc-write-only">
                                <span><odin-icon name="shield" :size="15" /> {{ field.configured ? 'Configured' : 'Not configured' }}</span>
                                <small>{{ field.provenance === 'unset' ? 'No credential source' : 'Source: ' + field.provenance.replace('_', ' ') }}</small>
                                <button v-if="hasHonestAction(field)" type="button" class="btn btn-ghost text-xs" @click="runFieldAction(field)">{{ field.action_label }}</button>
                              </div>
                            </template>

                            <template v-else>
                              <select v-if="field.enum?.length" :id="fieldInputId(field.path)" class="hm-select"
                                      :value="field.value" @change="setFieldValue(field, $event.target.value)">
                                <option v-for="option in field.enum" :key="String(option)" :value="option">{{ option }}</option>
                              </select>

                              <label v-else-if="typeof field.value === 'boolean'" class="cfgc-boolean-control" :for="fieldInputId(field.path)">
                                <span>{{ field.value ? 'Enabled' : 'Disabled' }}</span>
                                <span class="toggle-switch">
                                  <input :id="fieldInputId(field.path)" type="checkbox" :checked="field.value"
                                         @change="setFieldValue(field, $event.target.checked)" />
                                  <span class="toggle-slider"></span>
                                </span>
                              </label>

                              <div v-else-if="field.editor === 'warning-chips'" class="cfgc-chip-editor">
                                <div class="cfgc-chip-list" aria-label="Warning thresholds">
                                  <span v-for="item in field.value" :key="item" class="cfgc-chip">
                                    {{ item }}
                                    <button type="button" @click="removeWarningThreshold(field, item)" :aria-label="'Remove warning at ' + item + ' iterations'">×</button>
                                  </span>
                                </div>
                                <div class="cfgc-chip-add">
                                  <label :for="fieldInputId(field.path)">Warn when</label>
                                  <input :id="fieldInputId(field.path)" class="hm-input font-mono" type="number" min="1"
                                         v-model="warningThresholdInput" @keydown.enter.prevent="addWarningThreshold(field)" />
                                  <span>iterations remain</span>
                                  <button type="button" class="btn btn-ghost text-xs" @click="addWarningThreshold(field)">Add</button>
                                </div>
                              </div>

                              <div v-else-if="isScalarArray(field)" class="cfgc-chip-editor">
                                <div class="cfgc-chip-list">
                                  <span v-for="item in field.value" :key="String(item)" class="cfgc-chip">
                                    {{ item }}
                                    <button type="button" @click="removeScalarArrayItem(field, item)" :aria-label="'Remove ' + item">×</button>
                                  </span>
                                  <span v-if="!field.value.length" class="cfgc-chip-empty">No entries</span>
                                </div>
                                <div class="cfgc-chip-add">
                                  <input :id="fieldInputId(field.path)" class="hm-input font-mono" type="text"
                                         v-model="arrayInputs[field.path]" @keydown.enter.prevent="addScalarArrayItem(field)" placeholder="Add an entry" />
                                  <button type="button" class="btn btn-ghost text-xs" @click="addScalarArrayItem(field)">Add</button>
                                </div>
                              </div>

                              <input v-else-if="field.type === 'integer' || field.type === 'number'" :id="fieldInputId(field.path)" class="hm-input font-mono"
                                     type="number" :min="field.constraints?.minimum" :max="field.constraints?.maximum"
                                     :step="field.type === 'integer' ? 1 : 'any'" :value="numberInputValue(field)"
                                     @focus="beginInputEdit(field.path)" @input="setNumberFieldValue(field, $event.target.value)" @blur="endInputEdit(field)" />

                              <input v-else :id="fieldInputId(field.path)" class="hm-input font-mono" type="text"
                                     :value="field.value ?? ''" @focus="beginInputEdit(field.path)"
                                     @input="setFieldValue(field, $event.target.value, { coalesce: true })" @blur="endTextInputEdit(field.path)" />
                            </template>
                            <p v-if="fieldError(field)" class="cfgc-field-error" role="alert">{{ fieldError(field) }}</p>
                          </div>

                          <div v-if="fieldSpecificRuntimeNote(field)" class="cfgc-field-runtime-note">
                            <strong>{{ field.apply_mode === 'activation_required' ? 'Activation note' : 'Runtime note' }}</strong>
                            <p>{{ fieldSpecificRuntimeNote(field) }}</p>
                            <button v-if="hasHonestAction(field)" type="button" class="btn btn-ghost text-xs" @click="runFieldAction(field)">{{ field.action_label }}</button>
                          </div>
                        </div>
                      </div>

                      <div v-if="fieldGroup.runtime_summaries.length || fieldGroup.apply_details.length" class="cfgc-group-apply-details">
                        <details>
                          <summary>{{ fieldGroup.runtime_summaries.length ? 'What saving changes' : fieldGroup.apply_details.length + ' runtime detail' + (fieldGroup.apply_details.length === 1 ? '' : 's') }}</summary>
                          <div v-if="fieldGroup.runtime_summaries.length" class="cfgc-runtime-summary-list">
                            <div v-for="summary in fieldGroup.runtime_summaries" :key="summary.key" class="cfgc-runtime-summary">
                              <strong>{{ summary.label }}</strong>
                              <p>{{ summary.save }}</p>
                              <p>{{ summary.runtime }}</p>
                            </div>
                          </div>
                          <div v-if="fieldGroup.apply_details.length" class="cfgc-apply-detail-list">
                            <div v-for="detail in fieldGroup.apply_details" :key="detail.key" :class="['cfgc-apply-detail', 'detail-' + detail.kind]">
                              <div class="cfgc-apply-detail-heading">
                                <strong>{{ detail.label }}</strong>
                                <span v-if="detail.apply_mode" :class="['cfgc-apply-pill', applyClass(detail.apply_mode)]">{{ applyModeLabel(detail.apply_mode) }}</span>
                              </div>
                              <code v-if="detail.code">{{ detail.code }}</code>
                              <p v-if="detail.text">{{ detail.text }}</p>
                            </div>
                          </div>
                        </details>
                      </div>
                    </section>
                  </div>
                </div>
              </article>
            </section>
          </main>
        </div>

        <div v-if="hasChanges" class="cfgc-mobile-action-bar" aria-label="Draft actions">
          <button type="button" class="btn btn-ghost" @click="mobileCancel">Cancel</button>
          <button type="button" class="btn btn-primary" @click="openReview" :disabled="!hasChanges || hasDraftErrors">Review</button>
          <div class="cfgc-mobile-overflow">
            <button type="button" class="icon-btn" @click="mobileOverflowOpen = !mobileOverflowOpen" :aria-expanded="mobileOverflowOpen" aria-label="More draft actions">
              <odin-icon name="more" :size="18" />
            </button>
            <div v-if="mobileOverflowOpen" class="cfgc-mobile-overflow-menu">
              <button type="button" @click="undo(); mobileOverflowOpen = false" :disabled="!canUndo"><odin-icon name="undo" :size="14" /> Undo</button>
              <button type="button" @click="redo(); mobileOverflowOpen = false" :disabled="!canRedo"><odin-icon name="redo" :size="14" /> Redo</button>
              <button type="button" @click="discardAllDrafts(); mobileOverflowOpen = false" :disabled="!hasChanges"><odin-icon name="trash" :size="14" /> Discard all</button>
            </div>
          </div>
        </div>

        <div v-if="restartPromptOpen" class="cfgc-review-overlay" @click.self="restartLater" @keyup.escape="restartLater" tabindex="-1">
          <aside class="cfgc-restart-dialog" v-modal-focus role="dialog" aria-modal="true" aria-labelledby="cfgc-restart-title">
            <div class="cfgc-eyebrow">Configuration saved</div>
            <h2 id="cfgc-restart-title">{{ pendingRestartCount }} setting{{ pendingRestartCount === 1 ? '' : 's' }} still use startup values</h2>
            <p>A clean restart applies them. Deferring is safe; the reminder stays visible until a fresh Odin process confirms the settings are active.</p>
            <p v-if="restartError" class="cfgc-field-error" role="alert">{{ restartError }}</p>
            <div class="cfgc-restart-dialog-actions">
              <button type="button" class="btn btn-ghost" @click="reviewPendingRestart">Review pending settings</button>
              <button type="button" class="btn btn-ghost" @click="restartLater">Restart later</button>
              <button type="button" class="btn btn-primary" @click="restartOdin" :disabled="restartScheduled">Restart Odin now</button>
            </div>
          </aside>
        </div>

        <div v-if="reviewOpen" class="cfgc-review-overlay" @click.self="closeReview" @keyup.escape="closeReview" tabindex="-1">
          <aside class="cfgc-review-tray" v-modal-focus role="dialog" aria-modal="true" aria-labelledby="cfgc-review-title">
            <header class="cfgc-review-header">
              <div>
                <div class="cfgc-eyebrow">Commit gate</div>
                <h2 id="cfgc-review-title">Review configuration changes</h2>
                <p>{{ changeCount }} change{{ changeCount === 1 ? '' : 's' }} across {{ changedSectionCount }} section{{ changedSectionCount === 1 ? '' : 's' }}</p>
              </div>
              <button type="button" class="icon-btn" @click="closeReview" aria-label="Close review tray"><odin-icon name="close" :size="17" /></button>
            </header>

            <div class="cfgc-review-body">
              <div v-if="hasDraftErrors" class="cfgc-health-alert danger" role="alert">
                <odin-icon name="error" :size="16" />
                <div><strong>Draft contains errors</strong><span>Resolve every field error before saving.</span></div>
              </div>

              <section v-for="group in reviewGroups" :key="group.key" class="cfgc-review-group">
                <header>
                  <span :class="['cfgc-apply-pill', applyClass(group.key)]">{{ group.label }}</span>
                  <span>{{ group.entries.length }}</span>
                </header>
                <div v-for="entry in group.entries" :key="entry.path" class="cfgc-review-entry">
                  <div>
                    <strong>{{ entry.label }}</strong>
                    <code>{{ entry.path }}</code>
                  </div>
                  <div class="cfgc-review-values">
                    <span>{{ compactValue(entry.oldVal) }}</span>
                    <odin-icon name="chevronRight" :size="13" />
                    <span>{{ compactValue(entry.newVal) }}</span>
                  </div>
                </div>
              </section>
            </div>

            <footer class="cfgc-review-footer">
              <div>
                <strong>Nothing changes until you save this review.</strong>
                <span v-if="reviewRestartCount">{{ reviewRestartCount }} change{{ reviewRestartCount === 1 ? '' : 's' }} will remain pending until restart.</span>
                <span v-else>Apply behaviour follows the class shown above.</span>
              </div>
              <button type="button" class="btn btn-ghost" @click="closeReview">Back to draft</button>
              <button type="button" class="btn btn-primary" @click="saveConfig" :disabled="saving || hasDraftErrors || !hasChanges">
                {{ saving ? 'Saving…' : 'Save reviewed changes' }}
              </button>
            </footer>
          </aside>
        </div>
      </template>
    </div>
  `,setup(){const e=f(null),t=f(null),s=f(!0),n=f(null),a=f(!1),i=f(null),l=f(null),r=f(null),o=f(!1),c=f(!1),d=f(null),u=f(""),p=f("all"),h=f(vk()),m=f(mk()),v=f({}),C=f({}),L=f(""),y=f({}),g=f({}),b=f([]),S=f([]),k=f(!1),A=f(!1),T=f(!1);let _=null,D=null,E={path:null,at:0},R=0;const $=J(()=>{var w;return(((w=t.value)==null?void 0:w.fields)||[]).filter(F=>!po.has(F.path.split(".")[0])&&!qu(F.path))}),V=J(()=>new Map($.value.map(w=>[w.path,w]))),oe=J(()=>K.value.reduce((w,F)=>w+F.sections.length,0)),P=J(()=>$.value.length),N=J(()=>lk),O=J(()=>b.value.length>0),U=J(()=>S.value.length>0),K=J(()=>{if(!e.value)return[];const w=new Set(Za.flatMap(xe=>xe.sections)),F=Za.map(xe=>({...xe,sections:xe.sections.filter(Qe=>Object.hasOwn(e.value,Qe)&&!po.has(Qe))})).filter(xe=>xe.sections.length),Z=Object.keys(e.value).filter(xe=>!w.has(xe)&&!po.has(xe));return Z.length&&F.push({key:"other",label:"Other",icon:"folder",sections:Z}),F}),q=J(()=>e.value?{...e.value,...v.value}:null),Q=J(()=>{if(!e.value)return[];const w=[];for(const[F,Z]of Object.entries(v.value))$m(e.value[F],Z,F,w);return w.filter(F=>!Pi(F.oldVal,F.newVal)).map(F=>{const Z=M(F.path);return{...F,label:(Z==null?void 0:Z.label)||Oa(F.path.split(".").at(-1)),apply_mode:(Z==null?void 0:Z.apply_mode)||he(F.path.split(".")[0])}})}),ie=J(()=>Q.value.length>0),X=J(()=>Q.value.length),fe=J(()=>new Set(Q.value.map(w=>w.path.split(".")[0])).size),Pe=J(()=>!!u.value||p.value!=="all"),Y=J(()=>{const w={...g.value};for(const F of Q.value){const Z=M(F.path),xe=Ta(Z,F.newVal);xe&&(w[F.path]=xe)}return w}),be=J(()=>Object.keys(Y.value).length>0),H=J(()=>e.value?(Pe.value?K.value:K.value.filter(F=>F.key===h.value)).map(F=>({...F,sections:F.sections.filter(Z=>se(Z))})).filter(F=>F.sections.length):[]),re=J(()=>{const w=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],F=new Map(w.map(Z=>[Z,[]]));for(const Z of Q.value){const xe=F.has(Z.apply_mode)?Z.apply_mode:"restart";F.get(xe).push(Z)}return w.filter(Z=>F.get(Z).length).map(Z=>({key:Z,label:xs(Z),entries:F.get(Z)}))}),ue=J(()=>Q.value.filter(w=>w.apply_mode==="restart").length),Le=J(()=>$.value.filter(w=>w.pending_restart)),x=J(()=>Le.value.length);function M(w){const F=V.value.get(w);return F?{...F,apply_details:El([F])}:null}function B(w){const F=`${w}.`;return $.value.filter(Z=>Z.path===w||Z.path.startsWith(F))}function ae(w){return B(w).length}function te(w){return Oa(w)}function ne(w){const F=B(w);if(!F.length)return`${Oa(w)} configuration.`;const Z=F.find(Gt=>Gt.sensitivity==="public"&&Gt.description)||F.find(Gt=>Gt.description),xe=(Z==null?void 0:Z.description)||"";return xe.match(/setting for (.+)\.$/i)?`${Oa(w)} settings and runtime behaviour.`:xe}function he(w){const F=[...new Set(B(w).map(Z=>Z.apply_mode))];return F.length===1?F[0]:F.includes("restart")?"restart":F.includes("activation_required")?"activation_required":F[0]||"restart"}function de(w){const F=[...new Set(B(w).map(Z=>xs(Z.apply_mode)))];return F.length?F.length===1?F[0]:`Mixed apply behaviour: ${F.join(" · ")}`:""}function pe(w){return El(B(w))}function le(w){var F;return Object.hasOwn(v.value,w)?v.value[w]:(F=e.value)==null?void 0:F[w]}function ke(){const w=le("mcp")||{},F=Object.keys(w.servers||{}).length;return`${w.enabled?"Globally enabled":"Globally disabled"} · ${F} configured server${F===1?"":"s"}.`}function ye(w,F){return F.split(".").reduce((Z,xe)=>Z==null?void 0:Z[xe],w)}function _e(w){const F=q.value;return B(w).filter(Z=>qu(Z.path)?!1:Z.path.split(".").length<=2?!0:!Z.path.includes(".*")).map(Z=>({...Z,key:Z.path.split(".").at(-1),value:ye(F,Z.path),apply_details:El([Z]),editor:Z.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ce(w){const F=w.path.split(".");return F.length>2?F.slice(0,2).join("."):null}function z(w){const F=new Map;for(const Z of _e(w)){const xe=ce(Z),Qe=xe||`${w}.__root`;F.has(Qe)||F.set(Qe,{key:Qe,path:xe,entries:[]}),F.get(Qe).entries.push(Z)}return[...F.values()].map(Z=>{const xe=Z.entries.find(Qe=>Qe.group_description);return{...Z,label:Z.path?Oa(Z.path.split(".").at(-1)):null,description:(xe==null?void 0:xe.group_description)||null,apply_details:El(Z.entries),runtime_summaries:Te(Z.entries)}})}function ve(w){return{save:w.save_effect||(w.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:w.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[w.apply_mode]||"Effective runtime state is not currently observable."}}function Te(w){const F=new Map;for(const Z of w){const xe=ve(Z),Qe=`${Z.apply_mode}|${xe.save}|${xe.runtime}`;F.has(Qe)||F.set(Qe,{key:Qe,label:xs(Z.apply_mode),save:xe.save,runtime:xe.runtime})}return[...F.values()]}function Oe(w){if(De(w))return w.runtime_effect||w.activation_policy||"";if(w.apply_mode==="activation_required"){const F=w.activation_policy||w.runtime_effect;return F?`Not active after saving. No activation control exists in this release. ${F}`:"Not active after saving; no activation control exists in this release."}return""}function De(w){return w.action_available===!0&&!!(w.action_label&&w.action_endpoint)}async function ct(w){if(De(w))try{if(qe(w.path))throw new Error("Save this setting before applying its action.");const F=String(w.action_method||"POST").toLowerCase(),Z={post:W.post.bind(W),put:W.put.bind(W),delete:W.del.bind(W)}[F];if(!Z)throw new Error("Unsupported configuration action");await Z(w.action_endpoint,w.action_body||void 0),await ee(),Ce("success",`${w.action_label} completed.`)}catch(F){Ce("error",F.message||`${w.action_label} failed`)}}function rt(w,F){return[w.label,w.path,w.description,...w.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(F)}function Pt(w){const F=u.value.trim().toLowerCase();return F?B(w).filter(Z=>rt(Z,F)):[]}function se(w){const F=B(w);if(p.value!=="all"&&!F.some(xe=>xe.apply_state===p.value))return!1;const Z=u.value.trim().toLowerCase();return!Z||`${te(w)} ${w}`.toLowerCase().includes(Z)?!0:F.some(xe=>rt(xe,Z))}function we(w,F){return B(w).filter(Z=>Z.apply_state===F).length}function Ie(w){return w==="all"?P.value:$.value.filter(F=>F.apply_state===w).length}function ze(w){const F=w.sections.flatMap(Z=>B(Z));return{fields:F.length,modified:Q.value.filter(Z=>w.sections.includes(Z.path.split(".")[0])).length,pending_restart:F.filter(Z=>Z.apply_state==="pending_restart").length,invalid:F.filter(Z=>Z.apply_state==="invalid").length,dormant:F.filter(Z=>Z.apply_state==="dormant").length}}function it(w){var F;return Object.hasOwn(v.value,w)&&!Pi((F=e.value)==null?void 0:F[w],v.value[w])}function qe(w){return Q.value.some(F=>F.path===w||F.path.startsWith(`${w}.`))}function _t(w){h.value=w,u.value="",p.value="all";try{localStorage.setItem(Pm,w)}catch{}}function Ot(w){p.value=w}function Es(){u.value="",p.value="all"}function $s(w){var F;return((F=K.value.find(Z=>Z.sections.includes(w)))==null?void 0:F.sections)||[]}function Ut(w){const F=$s(w),Z=F.find(xe=>m.value[xe]===!0);return Z||F.find(xe=>m.value[xe]!==!1)||null}function ys(w){return u.value&&!T.value&&se(w)?!0:T.value?Ut(w)===w:Object.hasOwn(m.value,w)?m.value[w]===!0:!0}function As(w){const F=!ys(w);if(T.value){const Z={...m.value};for(const xe of $s(w))Z[xe]===!0&&(Z[xe]=!1);Z[w]=F,m.value=Z;return}m.value={...m.value,[w]:F}}function Ks(){b.value.push(ia(v.value)),b.value.length>dk&&b.value.shift(),S.value=[]}function Nn(){ie.value&&(Ks(),v.value={},g.value={},k.value=!1)}function Us(w,F=!1){const Z=Date.now();if(F&&E.path===w&&Z-E.at<uk){E.at=Z;return}Ks(),E={path:w,at:Z}}function Ws(w,F,Z){if(!F.length)return Z;const xe=ia(w??{});let Qe=xe;for(let Gt=0;Gt<F.length-1;Gt+=1){const cn=F[Gt];Qe[cn]=ia(Qe[cn]??{}),Qe=Qe[cn]}return Qe[F.at(-1)]=Z,xe}function rn(w){var F;return Object.hasOwn(v.value,w)?v.value[w]:ia((F=e.value)==null?void 0:F[w])}function wt(w,F,Z={}){var pd;const[xe,...Qe]=w.path.split(".");Us(w.path,!!Z.coalesce);const Gt=rn(xe),cn=Qe.length?Ws(Gt,Qe,F):F,ea={...v.value};if(Pi(cn,(pd=e.value)==null?void 0:pd[xe])?delete ea[xe]:ea[xe]=cn,v.value=ea,g.value[w.path]){const fd={...g.value};delete fd[w.path],g.value=fd}}function Rs(w){E={path:null,at:0},C.value={...C.value,[w]:String(ye(q.value,w)??"")}}function Dn(w){if(E={path:null,at:0},!Object.hasOwn(C.value,w))return;const F={...C.value};delete F[w],C.value=F}function lt(w){const F=C.value[w.path];if(E={path:null,at:0},F===""){g.value={...g.value,[w.path]:"Enter a number."};return}const Z=Number(F);if(Number.isNaN(Z)||w.type==="integer"&&!Number.isInteger(Z)){g.value={...g.value,[w.path]:w.type==="integer"?"Enter a whole number.":"Enter a number."};return}const xe={...C.value};delete xe[w.path],C.value=xe,wt(w,Z,{coalesce:!0})}function G(w){return Object.hasOwn(C.value,w.path)?C.value[w.path]:w.value??""}function me(w,F){if(C.value={...C.value,[w.path]:F},F===""){g.value={...g.value,[w.path]:"Enter a number."};return}const Z=Number(F);if(!Number.isFinite(Z)||w.type==="integer"&&!Number.isInteger(Z)){g.value={...g.value,[w.path]:w.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(g.value[w.path]){const xe={...g.value};delete xe[w.path],g.value=xe}wt(w,Z,{coalesce:!0})}function Ne(w){const F=Number.parseInt(L.value,10);if(!Number.isInteger(F)||F<1){g.value={...g.value,[w.path]:"Warning thresholds must be positive whole numbers."};return}const Z=[...new Set([...w.value||[],F])].sort((xe,Qe)=>Qe-xe);L.value="",wt(w,Z)}function Ve(w,F){wt(w,(w.value||[]).filter(Z=>Z!==F))}function dt(w){return w.apply_mode==="live_read"?"Odin reads the saved file value on next use.":w.apply_mode==="live_for_new_work"?"New work uses the saved file value.":w.apply_mode==="live_apply"?w.apply_handler?`Apply the saved value through ${w.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":w.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":w.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":w.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function Lt(w){return w.type==="array"&&Array.isArray(w.value)&&!w.structured_container&&!w.structured_container_child&&w.sensitivity==="public"&&w.value.every(F=>["string","number","boolean"].includes(typeof F))}function Jn(w){const F=String(y.value[w.path]??"").trim();if(!F)return;const Z=[...new Set([...w.value||[],F])];y.value={...y.value,[w.path]:""},wt(w,Z)}function ss(w,F){wt(w,(w.value||[]).filter(Z=>Z!==F))}function Ta(w,F){var xe;if(!w)return null;if((xe=w.enum)!=null&&xe.length&&!w.enum.includes(F))return`Choose one of: ${w.enum.join(", ")}`;if(w.path==="agents.final_warning_iterations"&&(!Array.isArray(F)||!F.length))return"Add at least one warning threshold.";const Z=w.constraints||{};if((w.type==="integer"||w.type==="number")&&typeof F=="number"){if(Z.minimum!==void 0&&F<Z.minimum)return`Must be at least ${Z.minimum}${w.unit?` ${w.unit}`:""}`;if(Z.maximum!==void 0&&F>Z.maximum)return`Must be at most ${Z.maximum}${w.unit?` ${w.unit}`:""}`}return null}function Bs(w){return Y.value[w.path]||null}function ui(w){const F=`${w}.`;return Object.keys(Y.value).some(Z=>Z===w||Z.startsWith(F))}function Ca(){b.value.length&&(S.value.push(ia(v.value)),v.value=b.value.pop(),g.value={},C.value={},E={path:null,at:0})}function Yn(){S.value.length&&(b.value.push(ia(v.value)),v.value=S.value.pop(),g.value={},C.value={},E={path:null,at:0})}function Ea(){!ie.value||be.value||(k.value=!0,A.value=!1)}function Qn(){k.value=!1}function Mn(){Nn()}function xs(w){return ok[w]||Oa(w||"unknown")}function on(w){return`apply-${String(w||"unknown").replaceAll("_","-")}`}function qt(w){return`cfgc-field-${w.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function j(w){return`${qt(w)}-input`}function Se(w){const F=document.getElementById(qt(w))||document.getElementById(qt(w.split(".").slice(0,2).join(".")));F==null||F.scrollIntoView({behavior:"smooth",block:"center"})}function Ce(w,F){l.value={type:w,message:F},window.setTimeout(()=>{var Z;((Z=l.value)==null?void 0:Z.message)===F&&(l.value=null)},3500)}function Hs(){o.value=!1,p.value="pending_restart",u.value="";const w=rk(n.value);w&&(w.scrollTop=0)}function Xn(){o.value=!1}function Zs(w=1800){D&&window.clearTimeout(D),D=window.setTimeout(pi,w)}async function pi(){if(c.value){if(R+=1,R>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await fo(),x.value===0){c.value=!1,d.value=null,Ce("success","Odin restarted and the saved startup settings are active.");return}}catch{}Zs(2e3)}}async function Ee(){if(!c.value){d.value=null;try{await W.post("/api/restart",{}),c.value=!0,R=0,o.value=!1,Zs()}catch(w){d.value=w.message||"Odin could not schedule a restart."}}}async function I(){if(!(!ie.value||be.value||a.value)){a.value=!0;try{const w=hk(e.value,v.value),F=await W.put("/api/config",w);e.value=F,v.value={},b.value=[],S.value=[],g.value={},k.value=!1;try{t.value=await fo(),r.value=null,o.value=x.value>0,Ce("success",x.value?`Configuration saved. ${x.value} setting${x.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(Z){r.value=Z.message||"Unknown metadata error.",Ce("error",`Configuration saved, but apply status could not be refreshed: ${r.value}`)}}catch(w){Ce("error",w.message||"Configuration could not be saved")}finally{a.value=!1}}}async function ee(){var w,F;if(!ie.value){s.value=!0,i.value=null;try{const Z=await W.get("/api/config"),xe=await fo();e.value=Z,t.value=xe,r.value=null;const Qe=K.value;if(Qe.some(Gt=>Gt.key===h.value)||(h.value=((w=Qe[0])==null?void 0:w.key)||Za[0].key),T.value){const cn=(((F=Qe.find(ea=>ea.key===h.value))==null?void 0:F.sections)||[]).find(ea=>m.value[ea]===!0);m.value=cn?{...m.value,[cn]:!0}:{}}}catch(Z){i.value=Z.message||"Unknown configuration error"}finally{s.value=!1}}}function ge(w){if(k.value||!(w.ctrlKey||w.metaKey))return;const F=w.target;F instanceof HTMLElement&&(F.matches("input, textarea, select")||F.isContentEditable)||(!w.shiftKey&&w.key.toLowerCase()==="z"?(w.preventDefault(),Ca()):(w.key.toLowerCase()==="y"||w.shiftKey&&w.key.toLowerCase()==="z")&&(w.preventDefault(),Yn()))}function Me(w){T.value=w.matches}os(m,w=>{try{localStorage.setItem(Mm,JSON.stringify(w))}catch{}},{deep:!0});let $e=!1;function Be(){$e||($e=!0,document.addEventListener("keydown",ge))}function gt(){$e&&($e=!1,document.removeEventListener("keydown",ge))}return We(()=>{var w;ee(),Be(),_=window.matchMedia("(max-width: 760px)"),Me(_),(w=_.addEventListener)==null||w.call(_,"change",Me)}),us(Be),ts(gt),mt(()=>{var w;gt(),(w=_==null?void 0:_.removeEventListener)==null||w.call(_,"change",Me),D&&window.clearTimeout(D)}),{armKeydown:Be,disarmKeydown:gt,handleKeydown:ge,config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:r,restartPromptOpen:o,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:h,reviewOpen:k,mobileOverflowOpen:A,warningThresholdInput:L,arrayInputs:y,healthFilters:N,visibleCategories:K,displayGroups:H,reviewGroups:re,sectionCount:oe,fieldCount:P,hasChanges:ie,changeCount:X,changedSectionCount:fe,hasDraftErrors:be,canUndo:O,canRedo:U,globalFilterActive:Pe,reviewRestartCount:ue,pendingRestartCount:x,pendingRestartFields:Le,healthCount:Ie,categoryStats:ze,selectCategory:_t,selectHealthFilter:Ot,clearFilters:Es,sectionLabel:te,sectionDescription:ne,sectionFieldCount:ae,sectionHealthCount:we,sectionApplySummary:de,sectionApplyDetails:pe,sectionEntries:_e,fieldGroups:z,sectionSearchHits:Pt,mcpConfigSummary:ke,fieldRuntimeCopy:ve,fieldSpecificRuntimeNote:Oe,hasHonestAction:De,runFieldAction:ct,sectionChanged:it,fieldChanged:qe,isSectionExpanded:ys,toggleSection:As,discardAllDrafts:Nn,setFieldValue:wt,setNumberFieldValue:me,numberInputValue:G,beginInputEdit:Rs,endTextInputEdit:Dn,endInputEdit:lt,addWarningThreshold:Ne,removeWarningThreshold:Ve,isScalarArray:Lt,addScalarArrayItem:Jn,removeScalarArrayItem:ss,fieldError:Bs,sectionHasErrors:ui,undo:Ca,redo:Yn,openReview:Ea,closeReview:Qn,mobileCancel:Mn,applyModeLabel:xs,applyClass:on,compactValue:pk,formatValue:fk,structuredApplyCopy:dt,fieldId:qt,fieldInputId:j,focusField:Se,fetchConfig:ee,saveConfig:I,restartOdin:Ee,restartLater:Xn,reviewPendingRestart:Hs}}},bk=/^\d{15,25}$/;function Um(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Bm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
    <div class="discord-user-combobox">
      <input ref="input" v-model="query" type="text" class="hm-input"
             :placeholder="placeholder" role="combobox" :aria-label="ariaLabel"
             aria-autocomplete="list" :aria-expanded="open" :aria-controls="optionsId"
             :aria-activedescendant="activeOptionId"
             @focus="openOptions" @input="onInput"
             @keydown.down.prevent="highlightNext" @keydown.up.prevent="highlightPrevious"
             @keydown.enter.prevent="selectHighlighted" @keydown.escape="closeOptions"
             @blur="onBlur" />
      <div v-if="open && (filteredMembers.length || rawId)" :id="optionsId" role="listbox"
           class="discord-user-combobox-options">
        <button v-for="(member, index) in filteredMembers" :key="member.id" type="button"
                :id="optionsId + '-' + index" role="option" :aria-selected="index === highlightedIndex"
                :class="['discord-user-combobox-option', { active: index === highlightedIndex }]"
                @mousedown.prevent="selectMember(member)">
          <img v-if="member.avatar_url" :src="member.avatar_url + '?size=24'" alt="" />
          <span v-else class="discord-user-combobox-avatar">{{ memberName(member).charAt(0) }}</span>
          <span class="discord-user-combobox-name">{{ memberName(member) }}</span>
          <span class="discord-user-combobox-username">{{ member.username }}</span>
          <span v-if="member.bot" class="discord-user-combobox-bot">BOT</span>
        </button>
        <button v-if="rawId" type="button" :id="optionsId + '-raw'" role="option"
                :aria-selected="highlightedIndex === 0" class="discord-user-combobox-option"
                :class="{ active: highlightedIndex === 0 }" @mousedown.prevent="selectId(rawId)">
          <span class="discord-user-combobox-avatar">?</span>
          <span class="discord-user-combobox-name">Add by ID: {{ rawId }}</span>
          <span class="discord-user-combobox-username">press Enter</span>
        </button>
      </div>
    </div>
  `,setup(e,{emit:t}){const s=f(""),n=f(!1),a=f(0),i=f(null),l=J(()=>new Set((e.excludedIds||[]).map(String))),r=J(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(k=>l.value.has(String(k.id))?!1:S?u(k).toLowerCase().includes(S)||String(k.username||"").toLowerCase().includes(S)||String(k.id).includes(S):!0)}),o=J(()=>{const S=s.value.trim();return r.value.length===0&&bk.test(S)&&!l.value.has(S)?S:""}),c=J(()=>r.value.length+(o.value?1:0)),d=J(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(S){return Um(S)}function p(){n.value=!0,a.value=0}function h(){p()}function m(){const S=Math.max(c.value-1,0);a.value=Math.min(a.value+1,S)}function v(){a.value=Math.max(a.value-1,0)}function C(){const S=r.value[a.value];S?L(S):o.value&&a.value===r.value.length&&y(o.value)}function L(S){y(String(S.id))}function y(S){t("select",S),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function b(){setTimeout(g,150)}return We(()=>{e.autofocus&&Et(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:C,selectMember:L,selectId:y,closeOptions:g,onBlur:b}}};function Gu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const yk={components:{DiscordUserCombobox:Bm},template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Discord Channels</h1>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-4">
        For ordinary conversational intake, allowed users and channels are absolute global gates; guild and channel settings cannot readmit a blocked message.
        Prefix commands use separate authorization, and explicitly allowed test webhooks bypass the user gate. Require-mention and bot-response behavior
        resolve channel → guild → global. An explicit mention bypasses the ignored-bot list, but the effective respond-to-bots policy still applies.
        Changes take effect immediately.
      </p>

      <div v-if="loading && guilds.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchAll" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-4">
        <section v-if="globalDraft" class="hm-card discord-global-card">
          <div class="discord-global-heading">
            <div>
              <h2 class="text-sm font-semibold text-gray-300">Global defaults</h2>
              <p>Allowed users and channels are absolute. Require-mention and bot-response values are defaults that guild or channel settings may override.</p>
            </div>
          </div>
          <div v-if="globalError" class="text-xs text-red-400 mb-3" role="alert">{{ globalError }}</div>
          <div class="discord-global-grid">
            <label class="discord-global-toggle">Require @mention by default
              <span class="toggle-switch"><input v-model="globalDraft.require_mention" type="checkbox" /><span class="toggle-slider"></span></span>
            </label>
            <label class="discord-global-toggle">Respond to bots by default
              <span class="toggle-switch"><input v-model="globalDraft.respond_to_bots" type="checkbox" /><span class="toggle-slider"></span></span>
            </label>
            <div v-for="editor in globalListEditors" :key="editor.key" :class="['discord-global-list', { 'discord-global-list-full': editor.fullWidth }]">
              <strong>{{ editor.label }}</strong>
              <p>{{ editor.description }}</p>
              <div class="cfgc-chip-list">
                <span v-for="item in globalDraft[editor.key]" :key="item" class="cfgc-chip">{{ globalItemLabel(editor, item) }}
                  <button type="button" @click="removeGlobalItem(editor.key, item)" :aria-label="'Remove ' + globalItemLabel(editor, item)">×</button>
                </span>
                <span v-if="!globalDraft[editor.key].length" class="cfgc-chip-empty">No entries</span>
              </div>
              <div v-if="editor.userAutocomplete" class="cfgc-chip-add discord-global-user-picker">
                <discord-user-combobox :members="globalMembers" :excluded-ids="globalDraft[editor.key]"
                                        :options-id="'discord-global-' + editor.key + '-options'"
                                        :placeholder="editor.placeholder" :aria-label="'Search ' + editor.label.toLowerCase()"
                                        @select="addGlobalItem(editor.key, $event)" />
              </div>
              <div v-else class="cfgc-chip-add">
                <input v-model="globalArrayInputs[editor.key]" class="hm-input font-mono" type="text" :placeholder="editor.placeholder"
                       @keydown.enter.prevent="addGlobalItem(editor.key)" />
                <button type="button" class="btn btn-ghost text-xs" @click="addGlobalItem(editor.key)">Add</button>
              </div>
            </div>
          </div>
          <div class="discord-global-footer">
            <span>Saving changes these global gates and defaults. Guild and channel behavior overrides remain untouched and cannot bypass the allowlists.</span>
            <button type="button" class="btn btn-primary text-xs" @click="saveGlobalDefaults" :disabled="globalSaving || !globalChanged">{{ globalSaving ? 'Saving…' : 'Save global defaults' }}</button>
          </div>
        </section>

        <div v-for="guild in guilds" :key="guild.id" class="hm-card">
          <!-- Guild header -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <img v-if="guild.icon_url" :src="guild.icon_url + '?size=32'" class="w-8 h-8 rounded-full" />
              <div v-else class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                {{ guild.name.charAt(0) }}
              </div>
              <div>
                <span class="text-white font-medium">{{ guild.name }}</span>
                <span class="text-gray-500 text-xs ml-2">{{ guild.member_count }} members</span>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Enabled
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildEnabled(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':enabled')"
                    @change="setGuildConfig(guild.id, 'enabled', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Require @mention
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildMention(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':require_mention')"
                    @change="setGuildConfig(guild.id, 'require_mention', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Respond to bots
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildBots(guild)"
                    :disabled="mutationPending.has('guild:' + guild.id + ':respond_to_bots')"
                    @change="setGuildConfig(guild.id, 'respond_to_bots', $event.target.checked, $event)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <button @click="toggleGuild(guild.id)" class="btn btn-ghost text-xs">
                {{ expanded[guild.id] ? 'Hide channels' : 'Show channels' }}
              </button>
            </div>
          </div>

          <!-- Channel list -->
          <div v-if="expanded[guild.id]">
            <div class="table-responsive">
              <table class="hm-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Category</th>
                  <th class="text-center" style="width:100px">Enabled</th>
                  <th class="text-center" style="width:120px">Require @mention</th>
                  <th class="text-center" style="width:120px">Respond to bots</th>
                  <th class="text-center" style="width:80px">Override</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ch in guild.channels" :key="ch.id"
                    :class="{'opacity-40': !ch.effective.enabled}">
                  <td class="font-mono text-sm">#{{ ch.name }}</td>
                  <td class="text-xs text-gray-500">{{ ch.category || '—' }}</td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.enabled"
                        :disabled="mutationPending.has('channel:' + ch.id + ':enabled')"
                        @change="setChannelConfig(ch.id, guild.id, 'enabled', $event.target.checked, $event)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.require_mention"
                        :disabled="mutationPending.has('channel:' + ch.id + ':require_mention')"
                        @change="setChannelConfig(ch.id, guild.id, 'require_mention', $event.target.checked, $event)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.respond_to_bots"
                        :disabled="mutationPending.has('channel:' + ch.id + ':respond_to_bots')"
                        @change="setChannelConfig(ch.id, guild.id, 'respond_to_bots', $event.target.checked, $event)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <button v-if="hasOverride(ch)" type="button" class="badge badge-warning text-xs cursor-pointer"
                          @click="clearOverride(ch.id, guild.id)" :aria-label="'Clear override for channel ' + ch.name" title="Click to clear override">
                      custom
                    </button>
                    <span v-else class="text-gray-600 text-xs">inherit</span>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,setup(){const e=f([]),t=f(!0),s=f(null),n=f({}),a=f(null),i=f(null),l=f(!1),r=f(null),o=f({}),c=f([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=J(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),h=J(()=>new Map(c.value.map(P=>[String(P.id),P])));function m(P){return P.config&&P.config.enabled!==void 0?P.config.enabled:!0}function v(P){return Gu(P,"require_mention",a.value)}function C(P){return Gu(P,"respond_to_bots",a.value)}function L(P){return P.config&&Object.keys(P.config).length>0}function y(P){n.value[P]=!n.value[P]}function g(P){const N=P.discord||{};return{allowed_users:[...N.allowed_users||[]],channels:[...N.channels||[]],respond_to_bots:!!N.respond_to_bots,require_mention:!!N.require_mention,ignore_bot_ids:[...N.ignore_bot_ids||[]]}}async function b({showLoading:P=!0}={}){const N=++d;P&&(t.value=!0),s.value=null;try{const O=await W.get("/api/discord/guilds");N===d&&(e.value=O)}catch(O){N===d&&(s.value=O.message)}finally{P&&N===d&&(t.value=!1)}}async function S(){t.value=!0,s.value=null;try{const[P,N,O]=await Promise.all([W.get("/api/discord/guilds"),W.get("/api/discord/members").catch(()=>[]),W.get("/api/config")]),U=g(O),K=p.value;a.value=U,K||(i.value=JSON.parse(JSON.stringify(U))),c.value=N,e.value=P,r.value=null}catch(P){s.value=P.message}finally{t.value=!1}}let k=Promise.resolve();const A=f(new Set);function T(P,N){const O=new Set(A.value);O.add(P),A.value=O;const U=k.then(N);return k=U.catch(()=>{}),U.finally(()=>{const K=new Set(A.value);K.delete(P),A.value=K})}function _(P,N,O,U){const K=(U==null?void 0:U.target)??null;return T(`guild:${P}:${N}`,async()=>{try{await W.put("/api/discord/guild/"+P+"/config",{[N]:O}),await b({showLoading:!1})}catch(q){s.value=q.message,K&&typeof O=="boolean"&&(K.checked=!O)}})}function D(P,N,O,U,K){const q=(K==null?void 0:K.target)??null;return T(`channel:${P}:${O}`,async()=>{try{await W.put("/api/discord/channel/"+P+"/config",{[O]:U}),await b({showLoading:!1})}catch(Q){s.value=Q.message,q&&typeof U=="boolean"&&(q.checked=!U)}})}function E(P,N){return T(`channel:${P}:clear`,async()=>{try{await W.put("/api/discord/channel/"+P+"/config",{clear:!0}),await b({showLoading:!1})}catch(O){s.value=O.message}})}function R(P,N){const O=String(N);if(!P.userAutocomplete)return O;const U=h.value.get(O);return U?Um(U):O}function $(P,N=null){const O=String(N??o.value[P]??"").trim();!O||i.value[P].includes(O)||(i.value[P]=[...i.value[P],O],o.value={...o.value,[P]:""})}function V(P,N){i.value[P]=i.value[P].filter(O=>O!==N)}async function oe(){if(!(!p.value||l.value)){l.value=!0,r.value=null;try{const N=(await W.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...N.allowed_users||[]],channels:[...N.channels||[]],respond_to_bots:!!N.respond_to_bots,require_mention:!!N.require_mention,ignore_bot_ids:[...N.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(P){r.value=P.message||"Global defaults could not be saved."}finally{l.value=!1}}}return We(S),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:C,hasOverride:L,toggleGuild:y,fetchAll:S,fetchGuilds:b,setGuildConfig:_,setChannelConfig:D,clearOverride:E,mutationPending:A,globalItemLabel:R,addGlobalItem:$,removeGlobalItem:V,saveGlobalDefaults:oe}}},_s=e=>e==null?e:JSON.parse(JSON.stringify(e));function xk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(k){d+=1;const A=c.then(k,k);return c=A.catch(()=>{}),A}function C(k,A){h=_s(k),m.clear();for(const[T,_]of Object.entries(A||{}))m.set(T,_s(_))}function L(k){const A=_s(k),T=++u;return v(async()=>{try{await e(_s(A)),h=_s(A),T===u&&n(_s(A))}catch(_){T===u&&(a(_s(h)),o(_,{kind:"default"}))}})}function y(k,A){const T=_s(A),_=(p.get(k)||0)+1;return p.set(k,_),v(async()=>{try{await t(k,_s(T)),m.set(k,_s(T)),_===p.get(k)&&i(k,_s(T))}catch(D){_===p.get(k)&&(l(k,_s(m.get(k)??null)),o(D,{kind:"user",uid:k}))}})}function g(k){const A=(p.get(k)||0)+1;return p.set(k,A),v(async()=>{try{await s(k),m.delete(k),A===p.get(k)&&r(k)}catch(T){A===p.get(k)&&(l(k,_s(m.get(k)??null)),o(T,{kind:"delete",uid:k}))}})}async function b(){for(;;){const k=c;if(await k,k===c)return d}}async function S(k){for(;;){const A=await b(),T=await k();if(A===d)return T}}return{seed:C,saveDefault:L,saveUser:y,deleteUser:g,whenIdle:b,readSnapshot:S,get revision(){return d}}}const _k={components:{DiscordUserCombobox:Bm},template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Host Access Control</h1>
        <button @click="fetchData" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-6">
        Control which hosts each user can execute commands on and set per-user defaults.
        Users without an explicit entry fall back to the default policy.
      </p>

      <div v-if="loading && !data" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchData" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-6">
        <!-- Default policy -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Default Policy</h2>
          <p class="text-xs text-gray-500 mb-3">Applied to users without an explicit host access entry.</p>
          <div class="flex flex-wrap gap-3 mb-3">
            <label v-for="host in availableHosts" :key="'dp-'+host"
                   class="flex items-center gap-2 text-sm">
              <input type="checkbox" :checked="defaultPolicy.allowed_hosts.includes(host)"
                     @change="toggleDefaultHost(host, $event.target.checked)"
                     class="rounded border-gray-600 bg-gray-800" />
              <span class="text-gray-300">{{ host }}</span>
            </label>
          </div>
          <div class="flex items-center gap-3">
            <label for="default-policy-host" class="text-xs text-gray-500">Default host:</label>
            <select id="default-policy-host" v-model="defaultPolicy.default_host" @change="saveDefaultPolicy"
                    class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300">
              <option value="">— none —</option>
              <option v-for="host in defaultPolicy.allowed_hosts" :key="'dpd-'+host" :value="host">
                {{ host }}
              </option>
            </select>
          </div>
        </div>

        <!-- User entries -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">User Overrides</h2>
            <button @click="openAddUser" class="btn btn-ghost text-xs" v-if="!showAddUser">
              + Add User
            </button>
          </div>

          <!-- Add user form with autocomplete -->
          <div v-if="showAddUser" class="mb-4 p-3 bg-gray-800 rounded border border-gray-700">
            <div class="flex items-center gap-3 relative">
              <discord-user-combobox class="w-72" :members="members" :excluded-ids="Object.keys(users)"
                                      options-id="host-user-options" placeholder="Search users…"
                                      aria-label="Search users" autofocus @select="addUserById" />
              <button @click="showAddUser = false" class="btn btn-ghost text-xs">Cancel</button>
            </div>
          </div>

          <!-- Users table -->
          <div v-if="Object.keys(users).length > 0" class="table-responsive">
            <table class="hm-table">
            <thead>
              <tr>
                <th>User</th>
                <th v-for="host in availableHosts" :key="'th-'+host" class="text-center" style="min-width:90px">
                  {{ host }}
                </th>
                <th class="text-center" style="min-width:120px">Default Host</th>
                <th class="text-center" style="width:80px">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, uid) in users" :key="uid">
                <td class="text-sm">
                  <div class="flex items-center gap-2">
                    <img v-if="getMember(uid)?.avatar_url" :src="getMember(uid).avatar_url + '?size=24'"
                         class="w-5 h-5 rounded-full" />
                    <div v-else class="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                      {{ (getMember(uid)?.display_name || '?').charAt(0) }}
                    </div>
                    <span class="text-gray-200">{{ getMember(uid)?.display_name || uid }}</span>
                    <span v-if="getMember(uid)" class="text-gray-500 text-xs">{{ getMember(uid).username }}</span>
                    <span v-if="getMember(uid)?.bot" class="text-xs px-1 rounded bg-indigo-900 text-indigo-300">BOT</span>
                  </div>
                </td>
                <td v-for="host in availableHosts" :key="uid+'-'+host" class="text-center">
                  <input type="checkbox" :checked="entry.allowed_hosts.includes(host)"
                         :aria-label="'Allow ' + (getMember(uid)?.display_name || uid) + ' access to ' + host"
                         @change="toggleUserHost(uid, host, $event.target.checked)"
                         class="rounded border-gray-600 bg-gray-800" />
                </td>
                <td class="text-center">
                  <select :value="entry.default_host" :aria-label="'Default host for ' + (getMember(uid)?.display_name || uid)" @change="setUserDefault(uid, $event.target.value)"
                          class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300">
                    <option value="">— none —</option>
                    <option v-for="host in entry.allowed_hosts" :key="uid+'-def-'+host" :value="host">
                      {{ host }}
                    </option>
                  </select>
                </td>
                <td class="text-center">
                  <button @click="deleteUser(uid)" class="text-red-400 hover:text-red-300 text-xs">Remove</button>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
          <p v-else class="text-xs text-gray-500">No user overrides configured. All users follow the default policy.</p>
        </div>
      </div>

    </div>
  `,setup(){const e=f(!0),t=f(""),s=f(null),n=f([]),a=f({allowed_hosts:[],default_host:""}),i=f({}),l=f(!1),r=f([]),o=J(()=>{const E={};for(const R of r.value)E[R.id]=R;return E});function c(E){return o.value[E]||null}function d(E,R){return E?E.allowed_hosts===null||E.allowed_hosts===void 0?{allowed_hosts:[...R],default_host:E.default_host||"",allow_all:!0}:{allowed_hosts:E.allowed_hosts,default_host:E.default_host||"",allow_all:!1}:{allowed_hosts:[...R],default_host:R[0]||"",allow_all:!0}}const u=xk({applyDefault:async E=>{const R=E.allow_all?null:E.allowed_hosts;await W.put("/api/host-access/default-policy",{allowed_hosts:R,default_host:E.default_host})},applyUser:async(E,R)=>{const $=R.allow_all?null:R.allowed_hosts;await W.put(`/api/host-access/user/${E}`,{allowed_hosts:$,default_host:R.default_host})},applyDelete:E=>W.del(`/api/host-access/user/${E}`),onDefaultConfirmed:()=>Re.success("Default policy updated"),onDefaultRollback:E=>{E&&(a.value=E)},onUserConfirmed:E=>{const R=c(E);Re.success(`Updated access for ${R?R.display_name:E}`)},onUserRollback:(E,R)=>{const $={...i.value};R?$[E]=R:delete $[E],i.value=$},onUserDeleted:E=>{const R={...i.value};delete R[E],i.value=R},onError:(E,R)=>{var V;const $=R.uid?` ${((V=c(R.uid))==null?void 0:V.display_name)||R.uid}`:"";Re.error(`${E.message||"Failed to save"} — reverted${$}`)}});let p=0;async function h(){const E=++p;e.value=!0,t.value="";try{const R=await u.readSnapshot(()=>W.get("/api/host-access"));if(E!==p)return;s.value=R,n.value=R.available_hosts||[],a.value=d(R.default_policy,n.value);const $=R.users||{},V={};for(const[oe,P]of Object.entries($))V[oe]=d(P,n.value);i.value=V,u.seed(a.value,V)}catch(R){E===p&&(t.value=R.message||"Failed to fetch host access data")}finally{E===p&&(e.value=!1)}try{const R=await W.get("/api/discord/members")||[];E===p&&(r.value=R)}catch{E===p&&(r.value=[])}}const m=500,v=new Map;function C(E,R){const $=v.get(E);$&&clearTimeout($.timer);const V={run:R,timer:null};V.timer=setTimeout(()=>{v.delete(E),R()},m),v.set(E,V)}function L(E){const R=v.get(E);R&&(clearTimeout(R.timer),v.delete(E))}function y(){for(const[E,R]of[...v])clearTimeout(R.timer),v.delete(E),R.run()}function g(){C("default",()=>u.saveDefault(a.value))}function b(E,R){a.value.allow_all=!1,R?a.value.allowed_hosts.includes(E)||a.value.allowed_hosts.push(E):(a.value.allowed_hosts=a.value.allowed_hosts.filter($=>$!==E),a.value.default_host===E&&(a.value.default_host=a.value.allowed_hosts[0]||"")),g()}function S(E){C(`user:${E}`,()=>{const R=i.value[E];R&&u.saveUser(E,R)})}function k(E,R,$){const V=i.value[E];V&&(V.allow_all=!1,$?V.allowed_hosts.includes(R)||V.allowed_hosts.push(R):(V.allowed_hosts=V.allowed_hosts.filter(oe=>oe!==R),V.default_host===R&&(V.default_host=V.allowed_hosts[0]||"")),S(E))}function A(E,R){const $=i.value[E];$&&($.default_host=R,S(E))}function T(){l.value=!0}function _(E){!/^\d{15,25}$/.test(E)||i.value[E]||(i.value[E]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},u.saveUser(E,i.value[E]),l.value=!1)}async function D(E){const R=c(E);await Xt({title:"Remove user override",message:`Remove the host access override for ${R?R.display_name:E}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(L(`user:${E}`),await u.deleteUser(E),i.value[E]||Re.success(`Removed override for ${R?R.display_name:E}`))}return We(h),ts(y),mt(y),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:h,saveDefaultPolicy:g,toggleDefaultHost:b,getMember:c,toggleUserHost:k,setUserDefault:A,openAddUser:T,addUserById:_,deleteUser:D,flushPendingSaves:y}}},wk={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">API Tokens</h1>
        <button @click="fetchData" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-6">
        Manage API tokens for programmatic access, orchestrators, and web-chat identity.
        Each token has its own user identity, permission tier, and host access scope.
      </p>

      <div v-if="loading && !tokens" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchData" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-6">
        <!-- New token created banner -->
        <div v-if="newToken" class="hm-card border-green-800 bg-green-950/30">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-green-400">Token Created</span>
            <button @click="newToken = null" class="text-gray-500 hover:text-gray-300 text-xs">Dismiss</button>
          </div>
          <p class="text-xs text-gray-400 mb-2">Copy this token now. It will not be shown again.</p>
          <div class="flex items-center gap-2">
            <code class="bg-gray-900 px-3 py-1.5 rounded text-sm text-green-300 flex-1 overflow-x-auto">{{ newToken }}</code>
            <button @click="copyToken" class="btn btn-primary text-xs">Copy</button>
          </div>
        </div>

        <!-- Create token form -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Create Token</h2>
            <button @click="showCreate = !showCreate" class="btn btn-ghost text-xs">
              {{ showCreate ? 'Cancel' : '+ New Token' }}
            </button>
          </div>
          <div v-if="showCreate" class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-500 block mb-1">User ID (unique identifier)
                <input v-model="createForm.user_id" class="hm-input w-full text-sm"
                       placeholder="e.g. orchestrator-1" />
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Display Name
                <input v-model="createForm.username" class="hm-input w-full text-sm"
                       placeholder="e.g. Task Orchestrator" />
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Permission Tier
                <select v-model="createForm.tier" class="hm-input w-full text-sm">
                  <option value="admin">admin — full tool access</option>
                  <option value="user">user — read-only tools</option>
                  <option value="guest">guest — chat only, no tools</option>
                </select>
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Label (description)
                <input v-model="createForm.label" class="hm-input w-full text-sm"
                       placeholder="e.g. CI/CD pipeline" />
                </label>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Host Access
              <select v-model="createForm.host_mode" class="hm-input w-full text-sm mb-2">
                <option value="default">Use default host policy</option>
                <option value="select">Restrict to selected hosts</option>
                <option value="none">No host access (chat only)</option>
              </select>
              </label>
              <div v-if="createForm.host_mode === 'select'" class="flex flex-wrap gap-3">
                <label v-for="host in availableHosts" :key="'ch-'+host"
                       class="flex items-center gap-2 text-sm">
                  <input type="checkbox" :checked="createForm.allowed_hosts.includes(host)"
                         @change="toggleCreateHost(host, $event.target.checked)"
                         class="rounded border-gray-600 bg-gray-800" />
                  <span class="text-gray-300">{{ host }}</span>
                </label>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Default Host
              <select v-model="createForm.default_host" class="hm-input w-full text-sm"
                      :disabled="createForm.host_mode === 'none'">
                <option value="">Use host policy default</option>
                <option v-for="host in createDefaultHostOptions" :key="'cdh-'+host" :value="host">
                  {{ host }}
                </option>
              </select>
              </label>
              <p class="text-xs text-gray-500 mt-1">Used when API requests don't specify a host.</p>
            </div>
            <div>
              <label class="text-xs text-gray-500 block mb-1">Allowed Tools (comma-separated, leave empty for tier default)
              <input v-model="createForm.allowed_tools_str" class="hm-input w-full text-sm"
                     placeholder="e.g. run_command, web_search, fetch_url" />
              </label>
            </div>
            <div class="flex justify-end">
              <button @click="createToken" class="btn btn-primary text-sm" :disabled="!createForm.user_id.trim() || creating">
                {{ creating ? 'Creating...' : 'Create Token' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Token list -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Active Tokens</h2>
          <div v-if="!tokens || tokens.length === 0" class="text-xs text-gray-500 py-4 text-center">
            No API tokens configured.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="hm-table w-full text-sm">
              <thead>
                <tr>
                  <th class="text-left">User ID</th>
                  <th class="text-left">Label</th>
                  <th class="text-left">Tier</th>
                  <th class="text-left">Hosts</th>
                  <th class="text-left">Default</th>
                  <th class="text-left">Tools</th>
                  <th class="text-left">Source</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in tokens" :key="t.user_id">
                  <td class="font-mono text-xs text-gray-300">{{ t.user_id }}</td>
                  <td class="text-gray-400">{{ t.label || '—' }}</td>
                  <td>
                    <span :class="tierBadge(t.tier)">{{ t.tier }}</span>
                  </td>
                  <td class="text-gray-400 text-xs">
                    {{ t.allowed_hosts === null || t.allowed_hosts === undefined ? 'default policy' : t.allowed_hosts.length === 0 ? 'no host access' : t.allowed_hosts.join(', ') }}
                  </td>
                  <td class="text-gray-400 text-xs font-mono">
                    {{ t.default_host || 'policy' }}
                  </td>
                  <td class="text-gray-400 text-xs">
                    {{ t.allowed_tools && t.allowed_tools.length ? t.allowed_tools.length + ' tools' : 'tier default' }}
                  </td>
                  <td>
                    <span class="text-xs px-1.5 py-0.5 rounded"
                          :class="t.source === 'config' ? 'bg-gray-700 text-gray-400' : 'bg-blue-900/50 text-blue-400'">
                      {{ t.source === 'config' ? 'config.yml' : 'dynamic' }}
                    </span>
                  </td>
                  <td class="text-right space-x-2" v-if="t.source !== 'config'">
                    <button @click="startEdit(t)" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
                    <button @click="confirmRegenerate(t)" class="text-yellow-400 hover:text-yellow-300 text-xs">Regen</button>
                    <button @click="confirmDelete(t)" class="text-red-400 hover:text-red-300 text-xs">Delete</button>
                  </td>
                  <td class="text-right text-xs text-gray-600" v-else>read-only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Edit modal -->
        <div v-if="editing" class="modal-overlay" v-modal-focus @click.self="editing = null" @keyup.escape="editing = null" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="token-edit-title">
          <div class="modal-content" style="max-width:640px">
            <h3 id="token-edit-title" class="text-sm font-semibold text-gray-300 mb-4">Edit Token: {{ editing.user_id }}</h3>
            <div class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-500 block mb-1">Display Name
                  <input v-model="editForm.username" class="hm-input w-full text-sm" />
                  </label>
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">Tier
                  <select v-model="editForm.tier" class="hm-input w-full text-sm">
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                    <option value="guest">guest</option>
                  </select>
                  </label>
                </div>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Label
                <input v-model="editForm.label" class="hm-input w-full text-sm" />
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Host Access
                <select v-model="editForm.host_mode" class="hm-input w-full text-sm mb-2">
                  <option value="default">Use default host policy</option>
                  <option value="select">Restrict to selected hosts</option>
                  <option value="none">No host access (chat only)</option>
                </select>
                </label>
                <div v-if="editForm.host_mode === 'select'" class="flex flex-wrap gap-3">
                  <label v-for="host in availableHosts" :key="'eh-'+host"
                         class="flex items-center gap-2 text-sm">
                    <input type="checkbox" :checked="editForm.allowed_hosts.includes(host)"
                           @change="toggleEditHost(host, $event.target.checked)"
                           class="rounded border-gray-600 bg-gray-800" />
                    <span class="text-gray-300">{{ host }}</span>
                  </label>
                </div>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Default Host
                <select v-model="editForm.default_host" class="hm-input w-full text-sm"
                        :disabled="editForm.host_mode === 'none'">
                  <option value="">Use host policy default</option>
                  <option v-for="host in editDefaultHostOptions" :key="'edh-'+host" :value="host">
                    {{ host }}
                  </option>
                </select>
                </label>
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">Allowed Tools (comma-separated, empty for tier default)
                <input v-model="editForm.allowed_tools_str" class="hm-input w-full text-sm" />
                </label>
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button @click="editing = null" class="btn btn-ghost text-sm">Cancel</button>
                <button @click="saveEdit" class="btn btn-primary text-sm" :disabled="saving">
                  {{ saving ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `,setup(){const e=f(!0),t=f(""),s=f(null),n=f([]),a=f(!1),i=f(!1),l=f(null),r=f(null),o=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=J(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function h(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const T=await W.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function v(T){return!T||!T.trim()?[]:T.split(",").map(_=>_.trim()).filter(Boolean)}function C(T,_){const D=c.value.allowed_hosts;if(_&&!D.includes(T)&&D.push(T),!_){const E=D.indexOf(T);E>=0&&D.splice(E,1)}}function L(T,_){const D=d.value.allowed_hosts;if(_&&!D.includes(T)&&D.push(T),!_){const E=D.indexOf(T);E>=0&&D.splice(E,1)}}async function y(){var T;i.value=!0;try{const _=v(c.value.allowed_tools_str),D=c.value.host_mode,E=D==="none"?[]:D==="select"?c.value.allowed_hosts:null,R={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:_.length?_:[]};E!==null&&(R.allowed_hosts=E),R.default_host=c.value.default_host||"";const $=await W.post("/api/tokens",R);l.value=$.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Re.success("Token created"),await m()}catch(_){Re.error(((T=_.data)==null?void 0:T.error)||_.message||"Failed to create token")}finally{i.value=!1}}function g(T){r.value=T;const _=T.allowed_hosts;let D="default";_==null?D="default":Array.isArray(_)&&_.length===0?D="none":Array.isArray(_)&&(D="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:D,allowed_hosts:Array.isArray(_)?[..._]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function b(){var T;if(r.value){o.value=!0;try{const _=v(d.value.allowed_tools_str),D=d.value.host_mode,E={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:_};D==="none"?E.allowed_hosts=[]:D==="select"?E.allowed_hosts=d.value.allowed_hosts:E.allowed_hosts=null,E.default_host=d.value.default_host||"",await W.put("/api/tokens/"+encodeURIComponent(r.value.user_id),E),r.value=null,Re.success("Token updated"),await m()}catch(_){Re.error(((T=_.data)==null?void 0:T.error)||_.message||"Failed to update")}finally{o.value=!1}}}async function S(T){var D;if(await Xt({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const E=await W.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=E.token,Re.success("Token regenerated")}catch(E){Re.error(((D=E.data)==null?void 0:D.error)||E.message||"Failed to regenerate")}}async function k(T){var D;if(await Xt({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/tokens/"+encodeURIComponent(T.user_id)),Re.success("Token deleted"),await m()}catch(E){Re.error(((D=E.data)==null?void 0:D.error)||E.message||"Failed to delete")}}async function A(){if(l.value)try{await navigator.clipboard.writeText(l.value),Re.success("Copied to clipboard")}catch{Re.error("Copy failed — select and copy manually")}}return We(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:C,toggleEditHost:L,createToken:y,startEdit:g,saveEdit:b,confirmRegenerate:S,confirmDelete:k,copyToken:A}}},kk=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),Sk=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),Tk=Object.freeze(["enabled","base_url","model","max_tokens"]),Ck=Object.freeze(["enabled","model","max_tokens"]);function zr(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function Ku(e){return zr(e,kk)}function Wu(e){return zr(e,Sk)}function Ek(e,{includeApiKey:t=!1}={}){const s=zr(e,Tk);return t&&(s.api_key=e.api_key),s}function Ak(e){return{timeout:e.timeout}}function Rk(e,{includeApiKey:t=!1}={}){const s=zr(e,Ck);return t&&(s.api_key=e.api_key),s}function Ik(e){return{timeout:e.timeout}}function Al(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Ok={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">LLM Configuration</h1>
          <p class="page-lede">Provider routing, model selection, credentials, and Codex accounts.</p>
        </div>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading && !llmStatus" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>

      <div v-else class="space-y-6">

        <!-- ==================== Active Provider ==================== -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Active Provider</h2>
          <div v-if="llmStatus" class="provider-choice-list">
            <div class="provider-choice">
              <label class="provider-choice-label">
                <input type="radio" value="codex" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.codex.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.codex.configured ? 'text-gray-200' : 'text-gray-500'">
                  Codex (OpenAI)
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.codex.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.codex.configured" class="text-xs text-gray-500">
                  {{ llmStatus.codex.model }}
                </span>
                <span v-if="llmStatus.active_provider === 'codex'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">active</span>
              </label>
            </div>
            <div class="provider-choice">
              <label class="provider-choice-label">
                <input type="radio" value="ollama" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.ollama.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.ollama.configured ? 'text-gray-200' : 'text-gray-500'">
                  Ollama (Local/Remote)
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.ollama.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.ollama.configured" class="text-xs text-gray-500">
                  {{ llmStatus.ollama.model }}
                </span>
                <span v-if="llmStatus.active_provider === 'ollama'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">active</span>
              </label>
            </div>
            <div class="provider-choice">
              <label class="provider-choice-label">
                <input type="radio" value="kimi" v-model="selectedProvider" @change="switchProvider"
                       :disabled="!llmStatus.kimi.configured"
                       class="provider-control" />
                <span class="text-sm" :class="llmStatus.kimi.configured ? 'text-gray-200' : 'text-gray-500'">
                  Kimi (Moonshot AI)
                </span>
                <span v-if="llmStatusLoadFailed" class="text-xs text-amber-500">— status unavailable</span>
                <span v-else-if="!llmStatus.kimi.configured" class="text-xs text-yellow-500">— not configured</span>
                <span v-else-if="llmStatus.kimi.configured" class="text-xs text-gray-500">
                  {{ llmStatus.kimi.model }}
                </span>
                <span v-if="llmStatus.active_provider === 'kimi'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">active</span>
              </label>
            </div>
            <div v-if="llmStatus.active_model" class="mt-2">
              <span class="text-xs text-gray-400">
                Current: <code class="bg-gray-800 px-1 rounded">{{ llmStatus.active_model }}</code>
              </span>
            </div>
          </div>
        </div>

        <!-- ==================== Codex (OpenAI) — Config + Auth ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Codex (OpenAI)</h2>
            <div class="flex items-center gap-3">
              <div v-if="codexData.configured" class="text-sm">
                <span class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="codexForm.enabled" @change="saveCodexConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400 block">Model
              <select v-model="codexForm.model" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option v-for="m in codexModelOptions" :key="m" :value="m"
                        :disabled="mainModelOptionDisabled(m)">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent Model
              <select v-model="codexForm.agent_model" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat model</option>
                <option value="auto">Auto — choose per spawn</option>
                <option v-for="m in codexAgentModelOptions" :key="m" :value="m"
                        :disabled="agentModelOptionDisabled(m)">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Reasoning
              <select v-model="codexForm.reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra High</option>
                <option v-if="mainMaxAllowed" value="max">Max</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent Reasoning
              <select v-model="codexForm.agent_reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat setting</option>
                <option value="auto">Auto — choose per spawn</option>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">Extra High</option>
                <option v-if="agentMaxAllowed" value="max">Max</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Auxiliary Model
              <select :value="auxForm.enabled ? auxForm.model : ''" @change="onAuxModelChange"
                      class="hm-input">
                <option value="">Off — use primary model</option>
                <option v-for="m in auxModelOptions" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
            </div>
            <div class="llm-context-summary">
              <span>Effective context</span>
              <div class="llm-context-summary-value">
                <span class="llm-context-summary-pair">
                  <strong>{{ formatCount(activeContextBudget?.effective?.effective_budget) }} <small>tokens</small></strong>
                  <span class="llm-budget-provenance" :class="provenanceClass(activeContextBudget?.provenance)">{{ activeContextBudget?.provenance || 'unavailable' }}</span>
                  <span v-if="activeContextBudget?.density_source === 'calibrated'" class="llm-budget-density">density-calibrated · {{ formatDensity(activeContextBudget.density_milli) }} chars/token</span>
                </span>
                <small v-if="activeContextBudget?.clamp_expires_at">Expires {{ formatExpiry(activeContextBudget.clamp_expires_at) }}</small>
              </div>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-3">
            The Auxiliary Model runs the background jobs (compaction, reflection, consolidation,
            background follow-up) on a cheaper Codex model, with automatic fallback to the primary
            on error. It shares the main Codex login; only the model differs.
            "Off" runs those jobs on the primary model.
          </p>
          <div v-if="auxData.unavailable_reason"
               class="text-sm text-yellow-400 bg-yellow-900/20 rounded p-2 border border-yellow-800 mt-3">
            {{ auxData.unavailable_reason }}
          </div>
          <details class="llm-advanced" :open="advancedOpen.codex" @toggle="advancedOpen.codex = $event.target.open">
            <summary>
              <span>Advanced Settings</span>
              <small>Transport, retries, and model-aware context policy</small>
            </summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group">
                <header><strong>Transport</strong><span>Request lifecycle limits</span></header>
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="codexForm.request_timeout_seconds" type="number" min="60" max="86400" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Stream stall timeout <small>seconds</small></span>
                  <input v-model.number="codexForm.stream_stall_timeout_seconds" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group">
                <header><strong>Retry policy</strong><span>Transient request failures</span></header>
                <label><span class="llm-field-label">Maximum retries</span>
                  <input v-model.number="codexForm.retry.max_retries" type="number" min="0" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Base delay <small>seconds</small></span>
                  <input v-model.number="codexForm.retry.base_delay" type="number" min="0" step="any" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Maximum delay <small>seconds</small></span>
                  <input v-model.number="codexForm.retry.max_delay" type="number" min="0" step="any" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group">
                <header><strong>Connection pool</strong><span>Shared Codex HTTP transport</span></header>
                <p v-if="llmStatus?.codex?.connection_pool_pending_restart === true" class="llm-advanced-state pending" role="status">
                  Saved values need a restart. This process still uses {{ llmStatus.codex.effective_connection_pool?.max_connections }} connections with {{ llmStatus.codex.effective_connection_pool?.keepalive_timeout }}s keepalive.
                </p>
                <p v-else-if="llmStatus?.codex?.connection_pool_pending_restart === false" class="llm-advanced-state">
                  Saved values match this process. Future changes take effect after restart.
                </p>
                <p v-else class="llm-advanced-state">Future changes take effect after restart; current process values are unavailable.</p>
                <label><span class="llm-field-label">Maximum connections</span>
                  <input v-model.number="codexForm.connection_pool.max_connections" type="number" min="1" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Keepalive timeout <small>seconds</small></span>
                  <input v-model.number="codexForm.connection_pool.keepalive_timeout" type="number" min="0" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group">
                <header><strong>Context compression</strong><span>Long-conversation compaction</span></header>
                <p v-if="llmStatus?.codex?.context_compression_pending_restart === true" class="llm-advanced-state pending" role="status">
                  Saved values need a restart. This process still uses compression {{ llmStatus.codex.effective_context_compression?.enabled ? 'on' : 'off' }}, {{ formatContextCeiling(llmStatus.codex.effective_context_compression?.max_context_chars) }}, and {{ llmStatus.codex.effective_context_compression?.keep_recent_iterations }} recent iterations.
                </p>
                <p v-else-if="llmStatus?.codex?.context_compression_pending_restart === false" class="llm-advanced-state">
                  Saved values match this process. Future changes take effect after restart.
                </p>
                <p v-else class="llm-advanced-state">Future changes take effect after restart; current process values are unavailable.</p>
                <label class="llm-advanced-toggle"><span class="llm-field-label">Enabled</span>
                  <span class="llm-toggle-control"><span class="toggle-switch"><input v-model="codexForm.context_compression.enabled" type="checkbox" /><span class="toggle-slider"></span></span></span>
                </label>
                <label><span class="llm-field-label">Maximum context characters</span>
                  <input v-model.number="codexForm.context_compression.max_context_chars" type="number" min="1" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Recent iterations to keep</span>
                  <input v-model.number="codexForm.context_compression.keep_recent_iterations" type="number" min="1" class="hm-input" />
                </label>
              </section>
              <section class="llm-context-budget-panel">
                <div class="llm-context-budget-heading">
                  <div>
                    <strong>Context budgets</strong>
                    <span>Capability, working-set policy, and temporary evidence</span>
                  </div>
                  <label class="llm-utilization-field">
                    <span>Context utilization</span>
                    <span class="llm-utilization-input"><input :value="codexForm.context_utilization" @input="setContextUtilization($event)" type="number" min="30" max="100" class="hm-input" /><small>%</small></span>
                  </label>
                </div>
                <p class="llm-context-budget-copy">
                  Overrides describe usable input capability. Utilization is the working-set policy applied to larger models; budgets at or below 272,000 tokens keep legacy behavior. Learned clamps are temporary evidence from successful overflow recovery, not operator policy.
                </p>
                <div v-if="contextWindowsLoading && !contextWindows" class="llm-context-budget-loading" role="status">
                  <span class="spinner" aria-hidden="true"></span><span>Loading context budgets…</span>
                </div>
                <div v-else-if="contextWindowsError" class="llm-context-budget-error" role="alert">
                  <span>{{ contextWindowsError }}</span>
                  <button type="button" class="btn btn-ghost text-xs" @click="fetchContextWindows">Retry</button>
                </div>
                <template v-else>
                  <div class="llm-context-budget-table-wrap">
                    <table class="hm-table llm-context-budget-table">
                      <thead>
                        <tr>
                          <th>Canonical model</th>
                          <th>Built-in floor</th>
                          <th>Configured override</th>
                          <th>Effective budget</th>
                          <th>Configured target</th>
                          <th>Runtime target</th>
                          <th>Provenance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in contextBudgetRows" :key="row.model" :class="{ 'has-clamp': row.provenance === 'temporary learned clamp' }">
                          <td data-label="Canonical model"><code>{{ row.model }}</code></td>
                          <td data-label="Built-in floor"><span class="llm-budget-value">{{ formatCount(row.floor) }}</span><small>tokens</small></td>
                          <td data-label="Configured override">
                            <div class="llm-budget-override">
                              <input :value="codexForm.context_budget_overrides[row.model] ?? ''" @input="setContextOverride(row.model, $event)"
                                     type="number" min="50192" max="2000000" step="1"
                                     :placeholder="'No override'" class="hm-input"
                                     :aria-label="'Configured context budget override for ' + row.model" />
                              <button v-if="row.override != null || codexForm.context_budget_overrides[row.model] != null" type="button"
                                      class="llm-budget-reset" @click="resetContextOverride(row.model)" :aria-label="'Reset ' + row.model + ' to its built-in budget'">Reset</button>
                            </div>
                            <small v-if="overrideAboveFloor(row)" class="llm-budget-warning">Above the known-safe floor</small>
                          </td>
                          <td data-label="Effective budget"><span class="llm-budget-value llm-budget-effective">{{ formatCount(row.effectiveBudget) }}</span><small>tokens</small></td>
                          <td data-label="Configured target"><span class="llm-budget-value">{{ formatCount(row.configuredPrimaryChars) }}</span><small>characters · saved policy</small></td>
                          <td data-label="Runtime target">
                            <span class="llm-budget-value llm-budget-effective">{{ formatCount(row.primaryChars) }}</span><small>characters · active process</small>
                            <span v-if="contextWindows.max_context_chars_pending_restart === true && row.configuredPrimaryChars !== row.primaryChars" class="llm-budget-pending">Restart pending</span>
                          </td>
                          <td data-label="Provenance">
                            <span class="llm-budget-provenance" :class="provenanceClass(row.provenance)">{{ row.provenance }}</span>
                            <span v-if="row.densitySource === 'calibrated'" class="llm-budget-density">density-calibrated · {{ formatDensity(row.densityMilli) }} chars/token</span>
                            <small v-if="row.clampExpiresAt">Expires {{ formatExpiry(row.clampExpiresAt) }}</small>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-if="activeClampRows.length" class="llm-clamp-list">
                    <div class="llm-clamp-list-heading">
                      <div><strong>Temporary learned clamps</strong><span>Account-scoped recovery evidence. Clearing never changes the configured override.</span></div>
                      <span class="badge badge-warning">{{ activeClampRows.length }} active</span>
                    </div>
                    <div class="llm-clamp-grid">
                      <article v-for="clamp in activeClampRows" :key="clamp.account_key + ':' + clamp.model" class="llm-clamp-card">
                        <div><code>{{ clamp.model }}</code><span>{{ formatCount(clamp.value) }} tokens</span></div>
                        <p>Account {{ shortAccountKey(clamp.account_key) }} · expires {{ formatExpiry(clamp.expires_at) }}</p>
                        <button type="button" class="btn btn-ghost text-xs" @click="clearContextClamp(clamp)"
                                :disabled="clearingClamp === clamp.account_key + ':' + clamp.model">
                          {{ clearingClamp === clamp.account_key + ':' + clamp.model ? 'Clearing…' : 'Clear clamp' }}
                        </button>
                      </article>
                    </div>
                  </div>
                </template>
              </section>
              <div class="llm-advanced-footer">
                <p>Transport and retry changes apply to the primary client now. Context budgets and utilization apply to the next logical generation. An existing auxiliary client keeps the transport and retry settings captured when it was built until it is rebuilt. Connection-pool and context-compression changes are saved for the next restart.</p>
                <button type="button" class="btn btn-primary text-xs" @click="saveCodexAdvancedConfigNow" :disabled="savingCodex">{{ savingCodex ? 'Saving…' : 'Save advanced settings' }}</button>
              </div>
            </div>
          </details>
          <div class="border-t border-gray-700 pt-4">
          <h3 class="text-xs font-semibold text-gray-400 mb-2">Authentication</h3>
          <p class="text-xs text-gray-500 mb-4">
            OAuth credentials for ChatGPT subscription. Supports automatic refresh and pool rotation.
          </p>

          <div v-if="codexLoading && !codexData.configured" class="space-y-2">
            <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
          </div>
          <div v-else-if="codexError" class="text-red-400 text-sm">
            {{ codexError }}
            <button @click="fetchCodexStatus" class="btn btn-ghost text-xs ml-2">Retry</button>
          </div>

          <div v-else class="space-y-4">
            <!-- Status -->
            <div v-if="!codexData.configured" class="text-yellow-400 text-sm">
              No Codex credentials configured. Use the device login below or run
              <code class="bg-gray-800 px-1 rounded">python scripts/codex_login.py</code>
            </div>
            <div v-else class="text-sm text-gray-300">
              {{ codexData.account_count }} account{{ codexData.account_count !== 1 ? 's' : '' }} configured,
              active: #{{ codexData.current_index + 1 }}
            </div>

            <!-- Accounts table -->
            <div v-if="codexData.configured && codexData.accounts.length">
              <div class="table-responsive">
                <table class="hm-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Label</th>
                    <th>Email</th>
                    <th>Plan</th>
                    <th class="text-center">Status</th>
                    <th class="text-center">Active</th>
                    <th class="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="a in codexData.accounts" :key="a.index">
                    <td class="text-gray-400">{{ a.index + 1 }}</td>
                    <td>
                      <button v-if="editingLabel !== a.index" type="button" class="text-gray-200 cursor-pointer hover:text-indigo-300 inline-flex items-center"
                            @click="startEditLabel(a.index, a.label)" :aria-label="'Edit label for account ' + (a.index + 1)">
                        {{ a.label || '—' }}
                        <span class="text-gray-600 ml-1" aria-hidden="true"><odin-icon name="edit" :size="12" /></span>
                      </button>
                      <span v-else class="flex items-center gap-1">
                        <input v-model="labelValue" @keydown.enter="saveLabel(a.index)" @keydown.escape="editingLabel = null"
                               class="bg-gray-900 border border-gray-600 rounded px-2 py-0.5 text-sm text-gray-300 w-32" />
                        <button @click="saveLabel(a.index)" class="text-green-400 text-xs">Save</button>
                        <button @click="editingLabel = null" class="text-gray-500 text-xs">Cancel</button>
                      </span>
                    </td>
                    <td class="text-gray-200">{{ a.email || '—' }}</td>
                    <td class="text-xs">
                      <span v-if="a.plan_type" class="px-1.5 py-0.5 rounded"
                            :class="a.plan_type === 'plus' ? 'bg-green-900 text-green-300' : a.plan_type === 'team' ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-300'">
                        {{ a.plan_type }}
                      </span>
                      <span v-else class="text-gray-500">—</span>
                    </td>
                    <td class="text-center">
                      <span v-if="a.error" class="text-red-400 text-xs">Error</span>
                      <span v-else-if="a.expired" class="text-red-400 text-xs">Expired</span>
                      <span v-else-if="a.rate_limited" class="text-yellow-400 text-xs">Rate limited</span>
                      <span v-else class="text-green-400 text-xs">Active</span>
                    </td>
                    <td class="text-center">
                      <span v-if="a.is_current" class="text-xs px-1 rounded bg-indigo-900 text-indigo-300">Current</span>
                    </td>
                    <td class="text-center text-xs space-x-2">
                      <button v-if="!a.is_current" @click="activateAccount(a.index)"
                              class="text-green-400 hover:text-green-300">Activate</button>
                      <button @click="refreshAccount(a.index)" :disabled="refreshing === a.index"
                              class="text-blue-400 hover:text-blue-300">
                        {{ refreshing === a.index ? '...' : 'Refresh' }}
                      </button>
                      <button @click="deleteAccount(a.index, a.label || a.email)"
                              class="text-red-400 hover:text-red-300">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>

            <!-- Device login -->
            <div class="mt-4 pt-4 border-t border-gray-700">
              <div v-if="!deviceState" class="flex items-center justify-end gap-3">
                <h3 class="text-xs font-semibold text-gray-400">Add Account (Device Login)</h3>
                <button @click="startDeviceLogin" class="btn btn-primary text-xs" :disabled="deviceLoading">
                  {{ deviceLoading ? 'Requesting code...' : 'Start Device Login' }}
                </button>
              </div>
              <div v-if="false"></div>
              <div v-else-if="deviceState === 'pending'" class="p-3 bg-gray-800 rounded border border-gray-700">
                <div class="text-sm text-gray-300 mb-2">
                  <p class="mb-1">1. Open: <a :href="deviceInfo.verify_url" target="_blank"
                       class="text-indigo-400 hover:text-indigo-300 underline">{{ deviceInfo.verify_url }}</a></p>
                  <p>2. Enter code: <code class="bg-gray-900 px-2 py-1 rounded text-lg font-bold text-white">{{ deviceInfo.user_code }}</code></p>
                </div>
                <div class="flex items-center gap-3">
                  <div class="provider-status text-xs text-gray-500"><span class="status-dot starting animate-pulse" aria-hidden="true"></span>Waiting...</div>
                  <button @click="cancelDeviceLogin" class="btn btn-ghost text-xs">Cancel</button>
                </div>
              </div>
              <div v-else-if="deviceState === 'success'" class="p-3 bg-green-900/30 rounded border border-green-800">
                <p class="text-green-400 text-sm">Authenticated as {{ deviceResult.email }}.</p>
                <button @click="deviceState = null" class="btn btn-ghost text-xs mt-1">Done</button>
              </div>
              <div v-else-if="deviceState === 'error'" class="p-3 bg-red-900/30 rounded border border-red-800">
                <p class="text-red-400 text-sm">{{ deviceError }}</p>
                <button @click="deviceState = null" class="btn btn-ghost text-xs mt-1">Try Again</button>
              </div>
            </div>
          </div>
        </div>
      </div>

        <!-- ==================== Kimi Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Kimi (Moonshot AI)</h2>
            <div class="flex items-center gap-3">
              <div v-if="kimiStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="kimiStatus.configured" class="text-sm">
                <span v-if="kimiStatus.health && kimiStatus.health.healthy" class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
                <span v-else class="provider-status text-red-400"><span class="status-dot offline" aria-hidden="true"></span>Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="kimiForm.enabled" @change="saveKimiConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 block">Model
              <select v-model="kimiForm.model" @change="saveKimiConfigDebounced"
                      class="hm-input">
                <option v-if="!kimiModels.length" value="" disabled>No models available</option>
                <option v-for="m in kimiModels" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="kimiForm.max_tokens" type="number" @keydown.enter="saveKimiConfigNow"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <span class="text-xs text-gray-400">API Key</span>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.kimi.has_api_key && !kimiForm.api_key" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
                <input v-model="kimiForm.api_key" type="password" aria-label="Kimi API key" @keydown.enter="saveKimiConfigNow" @input="kimiKeyDirty = true"
                       :placeholder="llmStatus && llmStatus.kimi.has_api_key ? '••••••••  (press Enter to replace)' : 'sk-...'"
                       class="hm-input flex-1" />
              </div>
            </div>
          </div>
          <details class="llm-advanced compact" :open="advancedOpen.kimi" @toggle="advancedOpen.kimi = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="kimiForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveKimiAdvancedConfigNow" :disabled="savingKimi">Save timeout</button></div>
            </div>
          </details>
          <div v-if="kimiStatus?.health && kimiStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ kimiStatus.health.error }}
          </div>
        </div>

        <!-- ==================== Ollama Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Ollama (Local/Remote)</h2>
            <div class="flex items-center gap-3">
              <div v-if="ollamaStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="ollamaStatus.configured" class="text-sm">
                <span v-if="ollamaStatus.health && ollamaStatus.health.healthy" class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
                <span v-else class="provider-status text-red-400"><span class="status-dot offline" aria-hidden="true"></span>Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="ollamaForm.enabled" @change="saveOllamaConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 block">Model
              <select v-model="ollamaForm.model" @change="saveOllamaConfigDebounced"
                      class="hm-input">
                <option v-if="!ollamaModels.length" value="" disabled>No models available</option>
                <option v-for="m in ollamaModels" :key="m.name" :value="m.name">{{ m.name }} ({{ formatSize(m.size) }})</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="ollamaForm.max_tokens" type="number" @keydown.enter="saveOllamaConfigNow"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">API Key <span class="text-gray-600">(optional, for remote)</span>
              <input v-model="ollamaForm.api_key" type="password" placeholder="Leave empty for local" @keydown.enter="saveOllamaConfigNow" @input="ollamaKeyDirty = true"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Base URL
              <input v-model="ollamaForm.base_url" placeholder="http://127.0.0.1:11434" @keydown.enter="saveOllamaConfigNow"
                     class="hm-input" />
              </label>
            </div>
          </div>
          <details class="llm-advanced compact" :open="advancedOpen.ollama" @toggle="advancedOpen.ollama = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="ollamaForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveOllamaAdvancedConfigNow" :disabled="savingOllama">Save timeout</button></div>
            </div>
          </details>
          <div v-if="ollamaStatus?.health && ollamaStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ ollamaStatus.health.error }}
          </div>
        </div>
      </div>

    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f("codex"),a=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=J(()=>{const j=a.value.model;return j&&!i.includes(j)?[j,...i]:i}),r=J(()=>{const j=a.value.agent_model;return j&&j!=="auto"&&!i.includes(j)?[j,...i]:i}),o=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],c=J(()=>!o.includes(a.value.model)&&!(o.includes(a.value.agent_model)&&a.value.agent_reasoning_effort==="")),d=J(()=>{const j=a.value.agent_model;return j==="auto"?!0:!o.includes(j||a.value.model)}),u=J(()=>{const j=a.value.agent_reasoning_effort;return j==="auto"?!1:(j||a.value.reasoning_effort)==="max"}),p=j=>o.includes(j)&&(a.value.reasoning_effort==="max"||a.value.agent_model===""&&u.value),h=j=>o.includes(j)&&u.value,m=f({enabled:!1,model:"gpt-5.6-luna"}),v=f({unavailable_reason:null}),C=J(()=>{const j=m.value.model;return j&&!i.includes(j)?[j,...i]:i});function L(j){const Se=j.target.value;m.value.enabled=Se!=="",Se!==""&&(m.value.model=Se),me()}const y=f(!1),g=f({codex:!1,ollama:!1,kimi:!1}),b=f(null),S=f(!1),k=f(""),A=f(null),T=f(!1);let _=0;const D=J(()=>{var j;return Object.entries(((j=b.value)==null?void 0:j.models)||{}).map(([Se,Ce])=>{var Hs,Xn,Zs;return{model:Se,floor:Ce.floor,override:Ce.override,effectiveBudget:(Hs=Ce.effective)==null?void 0:Hs.effective_budget,configuredPrimaryChars:(Xn=Ce.configured)==null?void 0:Xn.primary_chars,primaryChars:(Zs=Ce.effective)==null?void 0:Zs.primary_chars,provenance:Ce.provenance,clampExpiresAt:Ce.clamp_expires_at,densityMilli:Ce.density_milli,densitySource:Ce.density_source}})}),E=J(()=>{var j;return((j=b.value)==null?void 0:j.clamps)||[]}),R=J(()=>{var j,Se;return((Se=(j=b.value)==null?void 0:j.models)==null?void 0:Se[a.value.model])||null}),$=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),V=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),oe=f(!1),P=f(!1),N=f(!1),O=f(!1),U=f(!1),K=f(!1),q=f(!1),Q=f({configured:null}),ie=f(!1),X=f([]),fe=f(""),Pe=f(!1),Y=f(!1),be=f({configured:null}),H=f(!1),re=f([]),ue=f(""),Le=f(!1),x=f(!1),M=f(!0),B=f(""),ae=f({configured:null,accounts:[]}),te=f(null),ne=f(null),he=f(""),de=f(null),pe=f(!1),le=f(null),ke=f(null),ye=f("");let _e=null;function ce(j,Se="success"){Re(j,Se==="error"?"error":"success")}function z(j){if(!j)return"?";const Se=j/(1024*1024*1024);return Se>=1?Se.toFixed(1)+" GB":(j/(1024*1024)).toFixed(0)+" MB"}function ve(j){return Number.isFinite(Number(j))?Number(j).toLocaleString():"—"}function Te(j){return j==null?"automatic (model-derived)":Number(j).toLocaleString()+" characters"}function Oe(j){const Se=new Date(j);return Number.isNaN(Se.getTime())?"unknown":Se.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function De(j){return typeof j=="string"&&j.length>12?j.slice(0,8)+"…"+j.slice(-4):j}function ct(j){return typeof j!="number"||!Number.isFinite(j)?"—":(j/1e3).toFixed(2)}function rt(j){return j==="temporary learned clamp"?"is-clamp":j==="override"?"is-override":"is-built-in"}function Pt(j){const Se=a.value.context_budget_overrides[j.model];return j.floor!=null&&Number.isFinite(Number(Se))&&Number(Se)>j.floor}function se(j,Se){const Ce={...a.value.context_budget_overrides};Se.target.value===""?delete Ce[j]:Ce[j]=Number(Se.target.value),a.value.context_budget_overrides=Ce,T.value=!0}function we(j){a.value.context_utilization=j.target.value===""?"":Number(j.target.value),T.value=!0}function Ie(j){const Se={...a.value.context_budget_overrides};delete Se[j],a.value.context_budget_overrides=Se,T.value=!0}async function ze(){e.value=!0,await Promise.all([it(),_t(),As(),Ot(),qe()]),e.value=!1}async function it({preserveBasic:j=!1,preserveAdvanced:Se=!1}={}){try{const Ce=await W.get("/api/llm/status");t.value=Ce,s.value=!1,n.value=Ce.active_provider||"codex",Ce.codex&&!G.pending()&&(j||(a.value.enabled=Ce.codex.enabled,a.value.model=Ce.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Ce.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Ce.codex.agent_reasoning_effort||"",a.value.agent_model=Ce.codex.agent_model||""),Se||(a.value.request_timeout_seconds=Ce.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Ce.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Ce.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Ce.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Ce.codex.context_compression||{}},!T.value&&!N.value&&(a.value.context_budget_overrides={...Ce.codex.context_budget_overrides||{}},a.value.context_utilization=Ce.codex.context_utilization??a.value.context_utilization))),Ce.ollama&&!Ne.pending()&&(j||($.value.enabled=Ce.ollama.enabled,$.value.base_url=Ce.ollama.base_url||"",$.value.model=Ce.ollama.model||"",$.value.max_tokens=Ce.ollama.max_tokens||4096),Se||($.value.timeout=Ce.ollama.timeout??$.value.timeout)),Ce.kimi&&!Ve.pending()&&(j||(V.value.enabled=Ce.kimi.enabled,V.value.model=Ce.kimi.model||"",V.value.max_tokens=Ce.kimi.max_tokens||4096),Se||(V.value.timeout=Ce.kimi.timeout??V.value.timeout)),Ce.auxiliary&&(v.value=Ce.auxiliary,me.pending()||(m.value.enabled=Ce.auxiliary.enabled,m.value.model=Ce.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function qe(){const j=++_;S.value=!0,k.value="";try{const Se=await W.get("/api/context/windows");if(j!==_)return;b.value=Se,!N.value&&!T.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(Se.models||{}).filter(([,Ce])=>Ce.override!=null).map(([Ce,Hs])=>[Ce,Hs.override])),a.value.context_utilization=Se.utilization??a.value.context_utilization)}catch(Se){j===_&&(k.value=Se.message||"Failed to load context budgets")}finally{j===_&&(S.value=!1)}}async function _t(){try{if(Q.value=await W.get("/api/ollama/status"),ie.value=!1,Q.value.model&&(fe.value=Q.value.model),Q.value.configured)try{const j=await W.get("/api/ollama/models");X.value=j.models||[]}catch{X.value=[]}else if($.value.base_url)try{const j=await W.post("/api/ollama/probe-models",{base_url:$.value.base_url});X.value=j.models||[]}catch{X.value=[]}}catch{ie.value=!0}}async function Ot(){M.value=!0,B.value="";try{ae.value=await W.get("/api/codex/status")}catch(j){B.value=j.message||"Failed to fetch Codex status"}finally{M.value=!1}}async function Es(){const j=t.value?t.value.active_provider:"codex";q.value=!0;try{const Se=await W.post("/api/llm/switch",{provider:n.value});Se.error?(n.value=j,ce(Se.error,"error")):(ce("Switched to "+n.value+" ("+Se.model+")"),await ze())}catch(Se){n.value=j,ce(Se.message||"Switch failed","error")}finally{q.value=!1}}async function $s(){Pe.value=!0;try{const j=await W.post("/api/ollama/reload");ce(j.configured?"Ollama reloaded":j.reason||"Ollama not configured",j.configured?"success":"error"),await ze()}catch(j){ce(j.message||"Reload failed","error")}finally{Pe.value=!1}}async function Ut(){Y.value=!0;try{await W.post("/api/ollama/model",{model:fe.value}),ce("Model set to "+fe.value),await ze()}catch(j){ce(j.message||"Failed","error")}finally{Y.value=!1}}async function ys(){const j=$.value.base_url;if(!j){ce("Enter a base URL first","error");return}K.value=!0;try{const Se=await W.post("/api/ollama/probe-models",{base_url:j});X.value=Se.models||[],X.value.length?(ce(X.value.length+" model(s) found"),!$.value.model&&X.value.length&&($.value.model=X.value[0].name)):ce("No models found at "+j,"error")}catch(Se){ce(Se.message||"Could not reach Ollama","error")}finally{K.value=!1}}async function As(){try{if(be.value=await W.get("/api/kimi/status"),H.value=!1,be.value.model&&(ue.value=be.value.model),be.value.configured)try{const j=await W.get("/api/kimi/models");re.value=j.models||[]}catch{re.value=[]}}catch{H.value=!0}}async function Ks(){Le.value=!0;try{const j=await W.post("/api/kimi/reload");ce(j.configured?"Kimi reloaded":j.reason||"Kimi not configured",j.configured?"success":"error"),await ze()}catch(j){ce(j.message||"Reload failed","error")}finally{Le.value=!1}}async function Nn(){x.value=!0;try{await W.post("/api/kimi/model",{model:ue.value}),ce("Model set to "+ue.value),await ze()}catch(j){ce(j.message||"Failed","error")}finally{x.value=!1}}async function Us(){if(N.value){G();return}N.value=!0;const j=Ku(a.value);try{await W.put("/api/llm/codex/config",j),ce("Codex config saved"),await Promise.all([it({preserveBasic:!0,preserveAdvanced:!0}),Ot()])}catch(Se){ce(Se.message||"Failed","error");const Ce=JSON.stringify(Ku(a.value))!==JSON.stringify(j);await Promise.all([it({preserveBasic:Ce,preserveAdvanced:!0}),Ot()])}finally{N.value=!1}}async function Ws(){if(N.value)return;N.value=!0;const j=Wu(a.value);try{await W.put("/api/llm/codex/config",j),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:j.context_budget_overrides,context_utilization:j.context_utilization})&&(T.value=!1),ce("Codex advanced settings saved"),await Promise.all([it({preserveBasic:!0,preserveAdvanced:!0}),Ot(),qe()])}catch(Se){ce(Se.message||"Failed","error");const Ce=JSON.stringify(Wu(a.value))!==JSON.stringify(j);await Promise.all([it({preserveBasic:!0,preserveAdvanced:Ce}),Ot(),qe()])}finally{N.value=!1}}async function rn(){if(O.value){Ne();return}O.value=!0;try{const j=oe.value?$.value.api_key:null,Se=Ek($.value,{includeApiKey:j!==null});await W.put("/api/llm/ollama/config",Se),ce("Ollama config saved"),j!==null&&$.value.api_key===j&&($.value.api_key="",oe.value=!1),await Promise.all([it({preserveBasic:!0,preserveAdvanced:!0}),_t()])}catch(j){ce(j.message||"Failed","error")}finally{O.value=!1}}async function wt(){if(!O.value){O.value=!0;try{await W.put("/api/llm/ollama/config",Ak($.value)),ce("Ollama timeout saved"),await Promise.all([it({preserveBasic:!0,preserveAdvanced:!0}),_t()])}catch(j){ce(j.message||"Failed","error")}finally{O.value=!1}}}async function Rs(){if(U.value){Ve();return}U.value=!0;try{const j=P.value?V.value.api_key:null,Se=Rk(V.value,{includeApiKey:j!==null});await W.put("/api/llm/kimi/config",Se),ce("Kimi config saved"),j!==null&&V.value.api_key===j&&(V.value.api_key="",P.value=!1),await Promise.all([it({preserveBasic:!0,preserveAdvanced:!0}),As()])}catch(j){ce(j.message||"Failed","error")}finally{U.value=!1}}async function Dn(){if(!U.value){U.value=!0;try{await W.put("/api/llm/kimi/config",Ik(V.value)),ce("Kimi timeout saved"),await Promise.all([it({preserveBasic:!0,preserveAdvanced:!0}),As()])}catch(j){ce(j.message||"Failed","error")}finally{U.value=!1}}}async function lt(){if(y.value){me();return}y.value=!0;try{await W.put("/api/llm/auxiliary/config",m.value),ce("Auxiliary config saved"),await it()}catch(j){ce(j.message||"Failed","error"),await it()}finally{y.value=!1}}const G=Al(Us),me=Al(lt),Ne=Al(rn),Ve=Al(Rs),dt=()=>(G.cancel(),Us()),Lt=()=>(Ne.cancel(),rn()),Jn=()=>(Ve.cancel(),Rs()),ss=()=>Ws(),Ta=()=>wt(),Bs=()=>Dn();async function ui(j){const Se=j.account_key+":"+j.model;A.value=Se;try{const Ce=await W.post("/api/context/windows/clear",{account_key:j.account_key,model:j.model});ce(Ce.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await qe()}catch(Ce){ce(Ce.message||"Failed to clear clamp","error"),await qe()}finally{A.value=null}}async function Ca(j){try{await W.post("/api/codex/account/"+j+"/activate"),ce("Active account switched"),await Ot()}catch(Se){ce(Se.message||"Failed","error")}}async function Yn(j){te.value=j;try{await W.post("/api/codex/account/"+j+"/refresh"),ce("Token refreshed"),await Ot()}catch(Se){ce(Se.message||"Refresh failed","error")}finally{te.value=null}}function Ea(j,Se){ne.value=j,he.value=Se||""}async function Qn(j){try{await W.put("/api/codex/account/"+j+"/label",{label:he.value}),ce("Label updated"),ne.value=null,await Ot()}catch(Se){ce(Se.message||"Failed","error")}}async function Mn(j,Se){if(await Xt({title:"Delete Codex account",message:`Delete ${Se||"account #"+(j+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/codex/account/"+j),ce("Deleted. Pool reloaded."),await Ot()}catch(Hs){ce(Hs.message||"Failed","error")}}async function xs(){pe.value=!0;try{const j=await W.post("/api/codex/device-code");le.value=j,de.value="pending",on(j)}catch(j){ce(j.message||"Failed","error")}finally{pe.value=!1}}async function on(j){_e={cancelled:!1};const Se=_e;try{const Ce=await W.post("/api/codex/device-poll",{device_auth_id:j.device_auth_id,user_code:j.user_code,interval:j.interval});if(Se.cancelled)return;ke.value=Ce,de.value="success",await ze()}catch(Ce){if(Se.cancelled)return;ye.value=Ce.message||"Device login failed",de.value="error"}}function qt(){_e&&(_e.cancelled=!0),de.value=null,le.value=null}return We(ze),mt(()=>{_e&&(_e.cancelled=!0),G.cancel(),me.cancel(),Ne.cancel(),Ve.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:q,advancedOpen:g,codexForm:a,codexModelOptions:l,codexAgentModelOptions:r,mainMaxAllowed:c,agentMaxAllowed:d,mainModelOptionDisabled:p,agentModelOptionDisabled:h,auxForm:m,auxData:v,auxModelOptions:C,onAuxModelChange:L,savingAux:y,saveAuxConfigDebounced:me,ollamaForm:$,kimiForm:V,savingCodex:N,savingOllama:O,savingKimi:U,probingOllama:K,ollamaKeyDirty:oe,kimiKeyDirty:P,fetchCodexStatus:Ot,ollamaStatus:Q,ollamaStatusLoadFailed:ie,ollamaModels:X,ollamaSelectedModel:fe,reloading:Pe,settingModel:Y,kimiStatus:be,kimiStatusLoadFailed:H,kimiModels:re,kimiSelectedModel:ue,reloadingKimi:Le,settingKimiModel:x,codexLoading:M,codexError:B,codexData:ae,refreshing:te,editingLabel:ne,labelValue:he,contextWindows:b,contextWindowsLoading:S,contextWindowsError:k,contextBudgetRows:D,activeClampRows:E,activeContextBudget:R,clearingClamp:A,contextPolicyDirty:T,deviceState:de,deviceLoading:pe,deviceInfo:le,deviceResult:ke,deviceError:ye,fetchAll:ze,fetchLLMStatus:it,fetchOllamaStatus:_t,fetchKimiStatus:As,switchProvider:Es,reloadOllama:$s,setOllamaModel:Ut,reloadKimi:Ks,setKimiModel:Nn,probeOllamaModels:ys,saveCodexConfig:Us,saveOllamaConfig:rn,saveKimiConfig:Rs,saveCodexAdvancedConfig:Ws,saveOllamaAdvancedConfig:wt,saveKimiAdvancedConfig:Dn,saveCodexConfigDebounced:G,saveOllamaConfigDebounced:Ne,saveKimiConfigDebounced:Ve,saveCodexConfigNow:dt,saveOllamaConfigNow:Lt,saveKimiConfigNow:Jn,saveCodexAdvancedConfigNow:ss,saveOllamaAdvancedConfigNow:Ta,saveKimiAdvancedConfigNow:Bs,activateAccount:Ca,refreshAccount:Yn,startEditLabel:Ea,saveLabel:Qn,deleteAccount:Mn,startDeviceLogin:xs,cancelDeviceLogin:qt,formatSize:z,fetchContextWindows:qe,clearContextClamp:ui,setContextOverride:se,setContextUtilization:we,resetContextOverride:Ie,overrideAboveFloor:Pt,formatCount:ve,formatContextCeiling:Te,formatExpiry:Oe,shortAccountKey:De,provenanceClass:rt,formatDensity:ct}}},Zu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Lk(e){return Zu[e]||Zu[(e||"").toLowerCase()]||"text-gray-400"}const Nk={template:`
    <div class="p-6 page-fade-in" role="region" aria-label="Internals">
      <div v-if="loading" class="hm-card" style="padding:2rem;text-align:center;">
        <div class="skeleton skeleton-text" style="width:200px;margin:0 auto;"></div>
      </div>

      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-4">
        <div v-if="failedCount > 0" class="hm-card border-amber-900" role="status" aria-live="polite">
          <p class="text-amber-400 text-sm">
            {{ failedCount }} of {{ endpoints.length }} internal endpoints failed to load:
            <strong>{{ failedEndpointSummary }}</strong>.
          </p>
        </div>

        <!-- Startup Diagnostics -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Startup Diagnostics</h2>
          <div v-if="startup.results && startup.results.length" class="space-y-1">
            <div style="margin-bottom:0.5rem;font-size:0.8rem;color:#888;">
              {{ startup.passed_count || 0 }}/{{ startup.total_checks || 0 }} passed
              <span v-if="startup.duration_ms"> ({{ startup.duration_ms }}ms)</span>
            </div>
            <div v-for="d in startup.results" :key="d.name"
                 style="display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0;">
              <span :class="d.passed ? 'text-green-400' : 'text-red-400'" style="font-size:0.9rem;width:1.5rem;text-align:center;">
                <odin-icon :name="d.passed ? 'success' : 'error'" :size="17" />
              </span>
              <span class="text-sm" style="flex:1;">{{ d.name }}</span>
              <span class="text-xs text-gray-500" style="max-width:50%;text-align:right;">{{ d.detail || '' }}</span>
            </div>
          </div>
          <p v-else class="text-sm text-gray-500">No diagnostics available</p>
        </section>

        <!-- Subsystem Status -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Subsystem Guard</h2>
          <div v-if="subsystems.length" class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div v-for="s in subsystems" :key="s.name" class="hm-card" style="padding:0.75rem;">
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <span :class="statusColor(s.state === 'available' ? 'ok' : s.state === 'degraded' ? 'degraded' : 'down')" style="font-size:1.1rem;">
                  <odin-icon :name="s.state === 'available' ? 'success' : s.state === 'degraded' ? 'warning' : 'error'" :size="18" />
                </span>
                <span class="text-sm font-medium">{{ s.name }}</span>
              </div>
              <div class="text-xs text-gray-500 mt-1">
                {{ s.total_successes || 0 }} ok / {{ s.total_failures || 0 }} fail
                <span v-if="s.last_failure_age_seconds != null"> &mdash; last fail: {{ formatAgeSeconds(s.last_failure_age_seconds) }}</span>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-gray-500">No subsystems registered</p>
        </section>

        <!-- Connection Pools -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Connection Pools</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="hm-card" style="padding:0.75rem;">
              <h3 class="text-sm font-medium mb-1">SSH Pool</h3>
              <div v-if="sshPool && Object.keys(sshPool).length" class="text-xs text-gray-400 space-y-1">
                <div>Active connections: {{ sshPool.active_connections || 0 }}</div>
                <div>Active hosts: {{ sshPool.active_hosts?.length ? sshPool.active_hosts.join(', ') : 'None' }}</div>
                <div>Opened: {{ sshPool.total_opened || 0 }}</div>
                <div>Reused: {{ sshPool.total_reused || 0 }}</div>
              </div>
              <p v-else class="text-xs text-gray-500">No SSH pool data</p>
            </div>
            <div class="hm-card" style="padding:0.75rem;">
              <h3 class="text-sm font-medium mb-1">HTTP Pools</h3>
              <div v-if="httpPool && Object.keys(httpPool).length" class="text-xs text-gray-400 space-y-2">
                <div v-for="(pool, provider) in httpPool" :key="provider">
                  <strong class="text-gray-300">{{ provider }}</strong>
                  <template v-if="provider === 'codex'">
                    <div>Active: {{ pool.http_pool_active_connections || 0 }} / {{ pool.http_pool_max_connections || 0 }}</div>
                    <div>Requests: {{ pool.http_pool_total_requests || 0 }}</div>
                    <div>Keepalive: {{ pool.http_pool_keepalive_timeout || 0 }}s</div>
                  </template>
                  <template v-else>
                    <div>Requests: {{ pool.total_requests || 0 }}</div>
                    <div>Model: {{ pool.model || 'Unknown' }}</div>
                  </template>
                </div>
              </div>
              <p v-else class="text-xs text-gray-500">No HTTP pool data</p>
            </div>
          </div>
        </section>

        <!-- Command Governor -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Command Governor</h2>
          <div v-if="governorStats" class="space-y-2">
            <div style="display:flex;gap:2rem;font-size:0.85rem;">
              <span>Blocked: <span class="text-red-400 font-medium">{{ governorStats.blocked || 0 }}</span></span>
              <span>High-risk allowed: <span class="text-yellow-400 font-medium">{{ governorStats.allowed_high_risk || 0 }}</span></span>
            </div>
            <div v-if="governorStats.recent_blocks && governorStats.recent_blocks.length" class="mt-2">
              <div class="text-xs text-gray-500 mb-1">Recent blocks:</div>
              <div v-for="(b, i) in governorStats.recent_blocks" :key="i"
                   class="text-xs text-red-400" style="padding:0.15rem 0;">
                [{{ b.risk }}] {{ b.reason }} &mdash; <code class="text-gray-500">{{ b.command }}</code>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-gray-500">No governor data</p>
        </section>

        <!-- Stats Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

          <!-- Risk Stats -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Risk Classifier</h3>
            <div v-if="riskStats" class="text-xs text-gray-400 space-y-1">
              <div>Total assessed: {{ riskTotal }}</div>
              <div>Critical: <span class="text-red-400">{{ riskStats.totals?.critical || 0 }}</span></div>
              <div>High risk: <span class="text-red-400">{{ riskStats.totals?.high || 0 }}</span></div>
              <div>Medium: <span class="text-yellow-400">{{ riskStats.totals?.medium || 0 }}</span></div>
              <div>Low: <span class="text-green-400">{{ riskStats.totals?.low || 0 }}</span></div>
            </div>
            <p v-else class="text-xs text-gray-500">No risk data</p>
          </section>

          <!-- Recovery Stats -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Recovery</h3>
            <div v-if="recoveryStats" class="text-xs text-gray-400 space-y-1">
              <div>Attempts: {{ recoveryStats.totals?.attempts || 0 }}</div>
              <div>Recovered: <span class="text-green-400">{{ recoveryStats.totals?.successes || 0 }}</span></div>
              <div>Failed: <span class="text-red-400">{{ recoveryStats.totals?.failures || 0 }}</span></div>
            </div>
            <p v-else class="text-xs text-gray-500">Recovery disabled or no data</p>
          </section>

          <!-- Context Compression -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Context Compression</h3>
            <div v-if="compressionStats" class="text-xs text-gray-400 space-y-1">
              <div>Compressions: {{ compressionStats.compressions || 0 }}</div>
              <div>Iterations compressed: {{ compressionStats.iterations_compressed || 0 }}</div>
              <div>Chars saved: {{ (compressionStats.chars_saved || 0).toLocaleString() }}</div>
              <div>Prefix cache hit rate: {{ ((compressionStats.prefix_hit_rate || 0) * 100).toFixed(0) }}%</div>
            </div>
            <p v-else class="text-xs text-gray-500">No compression data</p>
          </section>

        </div>

        <!-- Freshness Stats -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Branch Freshness</h2>
          <div v-if="freshnessStats" class="text-xs text-gray-400 space-y-1">
            <div>Checks: {{ freshnessStats.total_checks || 0 }}</div>
            <div>Stale detected: <span class="text-yellow-400">{{ freshnessStats.stale_found || 0 }}</span></div>
            <div>Fetch failures: <span class="text-red-400">{{ freshnessStats.fetch_failures || 0 }}</span></div>
          </div>
          <p v-else class="text-xs text-gray-500">Freshness checking disabled or no data</p>
        </section>

      </div>
    </div>
  `,setup(){const e=f(!0),t=f({}),s=f([]),n=f({}),a=f({}),i=f(null),l=f(null),r=f(null),o=f(null),c=f(null),d=J(()=>{var k;return Object.values(((k=i.value)==null?void 0:k.totals)||{}).reduce((A,T)=>A+Number(T||0),0)}),u=f(""),p=f(0),h=f([]),m=J(()=>h.value.map(k=>`${k.label} (${k.path}${k.reason?`: ${k.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let C=null;async function L(){var D;const k=await Promise.allSettled(v.map(E=>W.get(E.path))),A=E=>k[E].status==="fulfilled"?k[E].value:null;t.value=A(0)||{};const T=A(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],n.value=A(2)||{},a.value=A(3)||{},i.value=A(4),l.value=A(5),r.value=A(6),o.value=A(7),c.value=A(8);const _=k.filter(E=>E.status==="rejected");if(h.value=k.flatMap((E,R)=>{var $;return E.status==="rejected"?[{...v[R],reason:(($=E.reason)==null?void 0:$.message)||"request failed"}]:[]}),p.value=h.value.length,_.length===k.length){const E=(D=_[0])==null?void 0:D.reason;u.value=(E==null?void 0:E.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",L()}let g=!1;function b(){g||(g=!0,L(),C||(C=setInterval(L,3e4)))}function S(){g&&(g=!1,C&&(clearInterval(C),C=null))}return We(b),us(b),ts(S),mt(S),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:y,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Lk,formatAgeSeconds:dw}}},Dk=1e4,Ju=3e4;function yi(e,t){return Math.max(0,e-t)}function ho(e,t){const s=new Set((e.operations||[]).map(n=>n.state));return s.has("OUTCOME_UNKNOWN")?0:s.has("MANUAL_RESOLUTION_REQUIRED")?1:e.status==="ACTIVE"&&e.lease_expires_at&&e.lease_expires_at<t?2:e.status==="SUSPENDED"?3:e.status==="ACTIVE"?4:5}const Mk=[{label:"Outcome unknown",cls:"badge-danger"},{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],Pk={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Turn State</h1>
        <div class="flex items-center gap-2">
          <span v-if="anyStale" class="badge badge-warning text-xs">Data stale</span>
          <button @click="refreshAll" class="btn btn-ghost text-xs"
                  :disabled="turnsLoading && breakersLoading">Refresh</button>
        </div>
      </div>
      <p class="text-xs text-gray-500 mb-4">
        Read-only posture over durable chat turns and model capacity breakers.
        Rows with uncertain external effects surface first; nothing here can
        resume, resolve, or delete anything.
      </p>

      <!-- Durable turns -->
      <div class="hm-card mb-4">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 class="text-sm font-semibold text-gray-300">Durable turns</h2>
          <span v-if="turnsStale" class="text-xs text-amber-500">stale — last success {{ turnsAgeSeconds }}s ago</span>
        </div>

        <div v-if="turnsAvailability === 'not_enabled'" class="text-xs text-gray-500">
          Turn durability is not enabled in this deployment.
        </div>
        <div v-else-if="turnsError && !turnsData" class="error-state">
          <p class="text-red-400 text-sm">{{ turnsError }}</p>
          <button @click="fetchTurns" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <template v-else-if="turnsData">
          <div v-if="turnsError" class="dash-load-warning text-xs mb-2">Refresh failed: {{ turnsError }} — showing last known posture</div>
          <div class="ts-count-row mb-3">
            <div class="ts-count"><span class="ts-count-value">{{ turnsData.counts.active }}</span><span class="ts-count-label">Active</span></div>
            <div class="ts-count"><span class="ts-count-value">{{ turnsData.counts.suspended }}</span><span class="ts-count-label">Suspended</span></div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.attention_required > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.attention_required }}</span><span class="ts-count-label">Attention</span>
            </div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.outcome_unknown_operations > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.outcome_unknown_operations }}</span><span class="ts-count-label">Outcome unknown ops</span>
            </div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.manual_resolution_operations > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.manual_resolution_operations }}</span><span class="ts-count-label">Manual resolution ops</span>
            </div>
          </div>

          <div v-if="sortedTurns.length === 0" class="text-xs text-gray-500">
            No active, suspended, or attention-carrying turns.
          </div>
          <div v-else class="space-y-2">
            <div v-if="turnsData.truncated" class="text-xs text-amber-500">
              Showing {{ sortedTurns.length }} prioritized matching turns —
              {{ turnsData.omitted_turns }} older match{{ turnsData.omitted_turns === 1 ? '' : 'es' }} omitted.
              <span v-if="turnsData.omitted_attention_turns > 0" role="alert">
                {{ turnsData.omitted_attention_turns }} omitted turn{{ turnsData.omitted_attention_turns === 1 ? '' : 's' }} still carry unresolved-effect evidence.
              </span>
            </div>
            <div v-for="t in sortedTurns" :key="t.source + ':' + t.channel_id + ':' + t.message_id"
                 class="ts-turn-row">
              <div class="ts-turn-head">
                <span class="badge text-xs" :class="priorityBadge(t).cls">{{ priorityBadge(t).label }}</span>
                <span class="text-xs text-gray-400">{{ t.source }}</span>
                <span class="text-xs text-gray-500 font-mono">{{ t.channel_id }}</span>
                <span class="text-xs text-gray-600 font-mono">{{ t.message_id }}</span>
                <span v-if="t.has_checkpoint" class="text-xs text-gray-500">checkpointed</span>
                <span class="text-xs text-gray-600 ts-turn-age">{{ ageLabel(t.last_progress_at) }}</span>
              </div>
              <div v-if="priorityOf(t) === 0" class="ts-turn-warning" role="alert">
                An external effect may or may not have applied — verify before repeating it.
              </div>
              <div v-if="t.operations.length" class="ts-op-list">
                <span v-for="op in t.operations" :key="op.tool_call_id" class="ts-op"
                      :class="{ 'ts-op-alert': op.state === 'OUTCOME_UNKNOWN' || op.state === 'MANUAL_RESOLUTION_REQUIRED' }">
                  {{ op.tool_name }} · {{ op.state }}<template v-if="op.iteration !== null"> · iter {{ op.iteration }}</template>
                </span>
                <span v-if="t.more_attention_evidence" class="text-xs text-amber-500" role="alert">
                  …{{ t.attention_operations_count - t.operations.filter(op => op.state === 'OUTCOME_UNKNOWN' || op.state === 'MANUAL_RESOLUTION_REQUIRED').length }} more unresolved-effect operation{{ t.attention_operations_count - t.operations.filter(op => op.state === 'OUTCOME_UNKNOWN' || op.state === 'MANUAL_RESOLUTION_REQUIRED').length === 1 ? '' : 's' }}
                </span>
                <span v-else-if="t.operations_truncated" class="text-xs text-gray-500">…more pending operations</span>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="space-y-2">
          <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
        </div>
      </div>

      <!-- Capacity breakers -->
      <div class="hm-card">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 class="text-sm font-semibold text-gray-300">Model capacity breakers</h2>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-600">process lifetime</span>
            <span v-if="breakersStale" class="text-xs text-amber-500">stale — last success {{ breakersAgeSeconds }}s ago</span>
          </div>
        </div>

        <div v-if="breakersAvailability === 'not_enabled'" class="text-xs text-gray-500">
          Breaker registry is not constructed in this deployment.
        </div>
        <div v-else-if="breakersError && !breakersData" class="error-state">
          <p class="text-red-400 text-sm">{{ breakersError }}</p>
          <button @click="fetchBreakers" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <template v-else-if="breakersData">
          <div v-if="breakersError" class="dash-load-warning text-xs mb-2">Refresh failed: {{ breakersError }} — showing last known posture</div>
          <div v-if="breakersData.breakers.length === 0" class="text-xs text-gray-500">
            No breakers registered yet this process.
          </div>
          <div v-else class="table-responsive">
            <table class="hm-table">
              <thead><tr>
                <th>Provider</th><th>Model</th><th>State</th>
                <th class="text-right">Failed generations</th>
                <th class="text-right">Opens</th>
                <th class="text-right">Cooldown</th>
              </tr></thead>
              <tbody>
                <tr v-for="b in breakersData.breakers" :key="b.name">
                  <td class="text-xs">{{ b.provider }}</td>
                  <td class="text-xs font-mono">{{ b.model }}</td>
                  <td><span class="badge text-xs" :class="breakerBadge(b)">{{ b.state }}</span></td>
                  <td class="text-right text-xs">{{ b.failed_generations }}</td>
                  <td class="text-right text-xs">{{ b.consecutive_opens }}</td>
                  <td class="text-right text-xs">{{ cooldownLabel(b) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <div v-else class="space-y-2">
          <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
        </div>
      </div>
    </div>
  `,setup(){const e=f(null),t=f(""),s=f(null),n=f(!1),a=f(0),i=f(null),l=f(""),r=f(null),o=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const N=++p;n.value=!0;try{const O=await W.get("/api/turn-state/turns?limit=100");if(N!==p)return;t.value=O.availability,e.value=O.availability==="available"?O.data:null,s.value=null,a.value=Date.now()}catch(O){if(N!==p)return;s.value=O.message||"Turn-state read failed",O.status===503&&(t.value="unavailable")}N===p&&(n.value=!1)}async function v(){const N=++h;o.value=!0;try{const O=await W.get("/api/turn-state/capacity-breakers");if(N!==h)return;l.value=O.availability,i.value=O.availability==="available"?O.data:null,r.value=null,c.value=Date.now()}catch(O){if(N!==h)return;r.value=O.message||"Breaker read failed",O.status===503&&(l.value="unavailable")}N===h&&(o.value=!1)}function C(){m(),v()}const L=J(()=>e.value!==null&&yi(d.value,a.value)>Ju),y=J(()=>i.value!==null&&yi(d.value,c.value)>Ju),g=J(()=>L.value||y.value),b=J(()=>Math.round(yi(d.value,a.value)/1e3)),S=J(()=>Math.round(yi(d.value,c.value)/1e3));function k(N){return ho(N,d.value/1e3)}function A(N){return Mk[k(N)]}const T=J(()=>{var U;const N=[...((U=e.value)==null?void 0:U.turns)||[]],O=d.value/1e3;return N.sort((K,q)=>ho(K,O)-ho(q,O)||(q.last_progress_at||0)-(K.last_progress_at||0))});function _(N){return N.state==="closed"?"badge-success":N.state==="probing"?"badge-warning":"badge-danger"}function D(N){if(N.state==="closed")return"—";const O=yi(d.value,c.value)/1e3,U=Math.max(0,(N.cooldown_remaining_seconds||0)-O);return U>0?`${Math.ceil(U)}s`:N.state==="probing"?"probe in flight":"probe eligible"}function E(N){if(!N)return"";const O=Math.max(0,Math.round(d.value/1e3-N));if(O<90)return`${O}s ago`;const U=Math.round(O/60);return U<90?`${U}m ago`:`${Math.round(U/60)}h ago`}let R=null,$=null,V=!1;function oe(){V||(V=!0,C(),R=setInterval(C,Dk),u=setInterval(()=>{d.value=Date.now()},1e3),$=Ye.onReconnected(C))}function P(){V&&(V=!1,R&&(clearInterval(R),R=null),u&&(clearInterval(u),u=null),$&&($(),$=null))}return We(oe),us(oe),ts(P),mt(P),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:n,breakersData:i,breakersAvailability:l,breakersError:r,breakersLoading:o,turnsStale:L,breakersStale:y,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:S,sortedTurns:T,priorityOf:k,priorityBadge:A,breakerBadge:_,cooldownLabel:D,ageLabel:E,fetchTurns:m,fetchBreakers:v,refreshAll:C,arm:oe,disarm:P}}},Fk={setup(){const e=f(""),t=f(""),s=f(!1),n=f(""),a=f(!1),i=f(!1),l=f(!1),r=f(null),o=f(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await W.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await Xt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await W.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return We(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
  <div class="p-6 space-y-6 max-w-2xl">
    <div>
      <h2 class="text-lg font-semibold mb-1">Updates</h2>
      <p class="text-gray-400 text-sm">Check for new Odin releases and apply updates.</p>
    </div>

    <!-- Current version -->
    <div class="hm-card">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-gray-400 text-sm">Current version</span>
          <p class="text-lg font-mono font-semibold">{{ current || '...' }}</p>
        </div>
        <button @click="checkUpdate" :disabled="checking" class="btn btn-ghost">
          <span v-if="checking" class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
          {{ checking ? 'Checking...' : 'Check for updates' }}
        </button>
      </div>
    </div>

    <!-- Update available -->
    <div v-if="checkDone && updateAvailable" class="hm-card border-blue-500/30">
      <div class="flex items-center gap-2 mb-3">
        <span class="w-2 h-2 bg-blue-400 rounded-full"></span>
        <span class="font-medium">Update available: {{ latest }}</span>
      </div>
      <div v-if="changelog" class="bg-gray-900 rounded-lg p-4 text-sm text-gray-300 mb-4 max-h-64 overflow-y-auto whitespace-pre-wrap">{{ changelog }}</div>
      <button @click="applyUpdate" :disabled="applying" class="btn btn-primary">
        <span v-if="applying" class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
        {{ applying ? 'Updating...' : 'Update & Restart' }}
      </button>
    </div>

    <!-- No update -->
    <div v-if="checkDone && !updateAvailable && !error" class="hm-card">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 bg-green-400 rounded-full"></span>
        <span class="text-gray-300">You're running the latest version.</span>
      </div>
    </div>

    <!-- Applied -->
    <div v-if="applied" class="hm-card border-green-500/30">
      <div class="flex items-center gap-2">
        <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
        <span class="text-green-400">Update applied. Restarting... This page will reload automatically.</span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="hm-card border-red-500/30">
      <p class="text-red-400 text-sm">{{ error }}</p>
    </div>
  </div>
  `},Hm=[{id:"health",label:"Health",component:ek},{id:"resources",label:"Resources",component:tk},{id:"logs",label:"Logs",component:ik},{id:"config",label:"Config",component:gk},{id:"discord",label:"Discord",component:yk},{id:"host-access",label:"Host Access",component:_k},{id:"api-tokens",label:"API Tokens",component:wk},{id:"llm",label:"LLM Config",component:Ok},{id:"internals",label:"Internals",component:Nk},{id:"turn-state",label:"Turn State",component:Pk},{id:"update",label:"Update",component:Fk}],$k={components:{TabbedPage:Hr},setup(){return{tabs:Hm}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Rl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Uk=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Rl("Operations","operations","/operations",Lm),...Rl("History","history","/history",Nm),...Rl("Capabilities","capabilities","/capabilities",Dm),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Rl("System","system","/system",Hm)],hs=Wn({open:!1,query:"",selected:0});function Yu(){hs.query="",hs.selected=0,hs.open=!0}function mo(){hs.open=!1}function Bk(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Hk={setup(){const e=Sm(),t=f(null),s=J(()=>{const i=hs.query.trim().toLowerCase();return Uk.map(l=>({...l,_score:Bk(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});os(()=>hs.open,async i=>{var l;i&&(await Et(),(l=t.value)==null||l.focus())}),os(()=>hs.query,()=>{hs.selected=0});function n(i){mo(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),mo();return}if(i.key==="ArrowDown")i.preventDefault(),hs.selected=Math.min(hs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),hs.selected=Math.max(hs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[hs.selected];l&&n(l)}}return{state:hs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:mo}},template:`
    <transition name="modal">
      <div v-if="state.open" class="modal-overlay palette-overlay" @click.self="closePalette()" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette" v-modal-focus tabindex="-1">
          <div class="palette-search"><odin-icon name="search" :size="19" />
            <input ref="inputEl" v-model="state.query" type="text" class="palette-input"
              placeholder="Search pages and sections" aria-label="Search pages" role="combobox"
              :aria-activedescendant="results[state.selected] ? 'palette-option-' + state.selected : undefined"
              aria-autocomplete="list" aria-expanded="true" aria-controls="palette-results" @keydown="onKeydown" />
          </div>
          <div id="palette-results" class="palette-results" role="listbox">
            <div v-if="!results.length" class="palette-empty">No destinations match your search.</div>
            <button v-for="(r, i) in results" :key="r.group + '-' + r.label"
              :id="'palette-option-' + i" class="palette-item" :class="{ selected: i === state.selected }" role="option"
              :aria-selected="i === state.selected" @click="go(r)" @mousemove="state.selected = i">
              <span class="palette-icon" aria-hidden="true"><odin-icon :name="r.icon" :size="17" /></span>
              <span class="palette-copy"><span class="palette-label">{{ r.label }}</span><span class="palette-group">{{ r.group }}</span></span>
              <odin-icon name="chevronRight" :size="15" class="palette-arrow" />
            </button>
          </div>
          <div class="palette-footer"><span><kbd>Up/Down</kbd> Navigate</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div>
        </div>
      </div>
    </transition>
  `},Yo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Yo));const zk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Qa("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Qa("path",{d:Yo[e.name]||Yo.info})])}},jk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Qu(e){return[...e.querySelectorAll(jk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Vk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Qu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Qu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},qk={template:`
    <div class="p-6 page-fade-in" role="region" aria-label="Dashboard">
      <!-- Skeleton loading -->
      <div v-if="loading" class="space-y-4" role="status" aria-label="Loading dashboard">
        <div class="hm-card dash-hero-skeleton">
          <div class="skeleton" style="width:48px;height:48px;border-radius:50%;flex-shrink:0;"></div>
          <div style="flex:1;">
            <div class="skeleton skeleton-text" style="width:140px;"></div>
            <div class="skeleton skeleton-text" style="width:200px;margin-bottom:0;"></div>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div v-for="n in 10" :key="n" class="hm-card text-center">
            <div class="skeleton skeleton-stat"></div>
            <div class="skeleton skeleton-text" style="width:60%;margin:0.25rem auto 0;"></div>
          </div>
        </div>
      </div>

      <!-- Error state with retry -->
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <!-- Hero status banner -->
        <div class="dash-hero hm-card mb-4">
          <div class="dash-hero-left">
            <div class="dash-hero-ring" :class="status.status === 'online' ? 'ring-online' : 'ring-starting'">
              <svg viewBox="0 0 48 48" class="dash-ring-svg" role="img" :aria-label="'Uptime: ' + uptime">
                <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="3" opacity="0.15"/>
                <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="3"
                  stroke-dasharray="125.66" :stroke-dashoffset="uptimeRingOffset"
                  stroke-linecap="round" class="dash-ring-progress"/>
              </svg>
              <span class="dash-hero-icon" aria-hidden="true"><odin-icon name="brand" :size="21" /></span>
            </div>
            <div>
              <div class="dash-hero-name">Odin</div>
              <div class="dash-hero-sub">
                <span class="status-dot" :class="status.status === 'online' ? 'online' : 'starting'" style="width:8px;height:8px;"></span>
                {{ status.status === 'online' ? 'Online' : 'Starting' }}
                <span class="dash-hero-sep">·</span>
                {{ uptime }}
              </div>
            </div>
          </div>
          <div class="dash-hero-actions">
            <button @click="reloadConfig" class="btn btn-ghost text-xs" :disabled="actionLoading.reload">
              {{ actionLoading.reload ? '...' : 'Reload' }}
            </button>
            <button @click="clearSessions" class="btn btn-ghost text-xs" :disabled="actionLoading.clearSessions">
              {{ actionLoading.clearSessions ? '...' : 'Clear Sessions' }}
            </button>
            <button @click="stopAllLoops" class="btn btn-ghost text-xs" :disabled="actionLoading.stopLoops || (status.loop_count || 0) === 0">
              {{ actionLoading.stopLoops ? '...' : 'Stop Loops' }}
            </button>
          </div>
        </div>

        <!-- Stat cards grid -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div v-for="s in stats" :key="s.label"
               class="hm-card stat-card dash-stat"
               :class="s.highlight ? 'dash-stat-highlight' : ''">
            <div class="dash-stat-header">
              <span class="dash-stat-icon" :class="s.iconColor"><odin-icon :name="s.icon" :size="17" /></span>
              <span class="dash-stat-label">{{ s.label }}</span>
            </div>
            <div class="dash-stat-value" :class="s.color || ''">{{ s.value }}</div>
            <div v-if="s.sub" class="dash-stat-sub" :class="s.subColor || ''">{{ s.sub }}</div>
          </div>
        </div>

        <!-- Health indicators bar -->
        <div class="dash-health-bar hm-card mb-4" v-if="healthIndicators.length > 0" role="region" aria-label="System health">
          <div class="hm-section-title" style="margin-bottom:0.5rem;">System Health</div>
          <div class="dash-health-items">
            <div v-for="h in healthIndicators" :key="h.label" class="dash-health-item">
              <span class="dash-health-dot" :class="'dash-health-' + h.status" role="img" :aria-label="h.status"></span>
              <span class="dash-health-label">{{ h.label }}</span>
              <span v-if="h.detail" class="dash-health-detail">{{ h.detail }}</span>
            </div>
          </div>
        </div>

        <!-- Main grid: 2 columns on large, 1 on small -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          <!-- Active Agents panel -->
          <div class="hm-card dash-panel">
            <div class="dash-panel-header">
              <span class="dash-panel-title">Active Agents</span>
              <span class="badge badge-info" v-if="agents.length > 0">{{ agents.length }}</span>
            </div>
            <div v-if="agents.length === 0" class="dash-empty">
              <span class="dash-empty-icon"><odin-icon name="bot" :size="21" /></span>
              <span>No active agents</span>
            </div>
            <div v-else class="dash-agent-list">
              <div v-for="a in agents" :key="a.id" class="dash-agent-item">
                <div class="dash-agent-top">
                  <span class="dash-agent-dot" :class="'dash-agent-' + a.status"></span>
                  <span class="dash-agent-label">{{ a.label }}</span>
                  <span class="dash-agent-iters">{{ a.iteration_count }} iters</span>
                </div>
                <div class="dash-agent-goal">{{ a.goal }}</div>
                <div class="dash-agent-meta">
                  <span>{{ formatDuration(a.runtime_seconds) }}</span>
                  <span v-if="(a.tools_used_count ?? 0) > 0" class="dash-agent-tools">{{ a.tools_used_count }} tools</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="hm-card dash-panel">
            <div class="dash-panel-header">
              <span class="dash-panel-title">
                Recent Activity
                <span v-if="newEventCount > 0" class="badge badge-success" style="font-size:0.625rem;margin-left:4px;">+{{ newEventCount }}</span>
              </span>
              <button @click="fetchActivity" class="icon-btn" :disabled="activityLoading" aria-label="Refresh recent activity" title="Refresh recent activity">
                <odin-icon name="refresh" :size="15" :class="{ 'animate-spin': activityLoading }" />
              </button>
            </div>
            <div v-if="activityLoading && activity.length === 0" class="dash-empty"><span>Loading...</span></div>
            <div v-else-if="activity.length === 0" class="dash-empty">
              <span class="dash-empty-icon"><odin-icon name="activity" :size="21" /></span>
              <span>No recent activity</span>
            </div>
            <div v-else class="dash-activity-list">
              <div v-for="(a, i) in activity" :key="a._key || i"
                   class="dash-activity-item"
                   :class="{ 'flash-new': a._isNew, 'item-enter': a._isNew }">
                <span class="dash-activity-dot" :class="a.error ? 'dot-error' : 'dot-ok'"></span>
                <span class="dash-activity-tool">{{ a.tool_name }}</span>
                <span class="dash-activity-time">{{ formatTime(a.timestamp) }}</span>
              </div>
            </div>
          </div>

          <!-- Connected Guilds + Errors stacked -->
          <div class="space-y-4">
            <!-- Guilds -->
            <div class="hm-card dash-panel">
              <div class="dash-panel-header">
                <span class="dash-panel-title">Guilds</span>
              </div>
              <div v-if="!status.guilds || status.guilds.length === 0" class="dash-empty">
                <span class="dash-empty-icon"><odin-icon name="history" :size="21" /></span>
                <span>No guilds</span>
              </div>
              <div v-else class="space-y-1.5">
                <div v-for="g in status.guilds" :key="g.id" class="dash-guild-item">
                  <span class="status-dot online" style="width:6px;height:6px;"></span>
                  <span>{{ g.name }}</span>
                  <span v-if="g.member_count" class="dash-guild-count">{{ g.member_count }}</span>
                </div>
              </div>
            </div>

            <!-- Recent Errors -->
            <div class="hm-card dash-panel">
              <div class="dash-panel-header">
                <span class="dash-panel-title">Recent Errors</span>
                <span v-if="errors.length > 0" class="badge badge-danger" style="font-size:0.625rem;">{{ errors.length }}</span>
              </div>
              <div v-if="errors.length === 0 && errorsError" class="dash-empty dash-load-failed">
                <span class="dash-empty-icon"><odin-icon name="warning" :size="21" /></span>
                <span>Couldn't load recent errors</span>
              </div>
              <div v-else-if="errors.length === 0" class="dash-empty">
                <span class="dash-empty-icon"><odin-icon name="success" :size="21" /></span>
                <span>All clear</span>
              </div>
              <div v-else class="dash-error-list">
                <div v-if="errorsError" class="dash-load-warning text-xs">Refresh failed — showing known errors</div>
                <div v-for="(e, i) in errors" :key="i" class="dash-error-item">
                  <div class="dash-error-top">
                    <span class="text-red-400"><odin-icon name="warning" :size="16" /></span>
                    <span class="dash-error-tool">{{ e.tool_name }}</span>
                    <span class="dash-error-time">{{ formatTime(e.timestamp) }}</span>
                  </div>
                  <div v-if="e.error" class="dash-error-msg">{{ e.error }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),n=f([]),a=f(!1),i=f([]),l=f(!1),r=f(!1),o=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=J(()=>{const K=e.value.uptime_seconds||0,q=Math.floor(K/86400),Q=Math.floor(K%86400/3600),ie=Math.floor(K%3600/60),X=[];return q>0&&X.push(`${q}d`),Q>0&&X.push(`${Q}h`),(X.length===0||q===0&&Q===0)&&X.push(`${ie}m`),X.join(" ")}),m=J(()=>{const K=e.value.uptime_seconds||0;return 125.66*(1-Math.min(K/86400,1))}),v=J(()=>{const K=e.value;return[{label:"Guilds",value:K.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:K.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:K.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${K.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:K.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:K.loop_count>0?"text-green-400":"",highlight:K.loop_count>0},{label:"Agents",value:K.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:K.agent_count>0?`${K.agent_count} total`:"",subColor:"text-gray-500",highlight:(K.agent_running??0)>0},{label:"Processes",value:K.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:K.process_count>0?`${K.process_count} total`:"",subColor:"text-gray-500",highlight:(K.process_running??0)>0},{label:"Schedules",value:K.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(K.schedule_failing>0?`${K.schedule_failing} failing`:"")+(K.schedule_failing>0&&K.schedule_paused>0?", ":"")+(K.schedule_paused>0?`${K.schedule_paused} paused`:"")||void 0,subColor:K.schedule_failing>0?"text-red-400":"text-yellow-400",color:K.schedule_failing>0?"text-red-400":"",highlight:K.schedule_failing>0},{label:"Users",value:K.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),C=J(()=>{const K=e.value,q=[];return q.push({label:"Bot",status:K.status==="online"?"ok":"warn",detail:K.status==="online"?"Online":"Starting"}),(K.schedule_failing||0)>0?q.push({label:"Schedules",status:"error",detail:`${K.schedule_failing} failing`}):(K.schedule_count||0)>0&&q.push({label:"Schedules",status:"ok",detail:`${K.schedule_count} configured`}),(K.loop_count||0)>0&&q.push({label:"Loops",status:"ok",detail:`${K.loop_count} active`}),(K.agent_running||0)>0&&q.push({label:"Agents",status:"ok",detail:`${K.agent_running} running`}),(K.process_running||0)>0&&q.push({label:"Processes",status:"ok",detail:`${K.process_running} running`}),q});async function L(){try{e.value=await W.get("/api/status"),s.value=null}catch(K){s.value=K.message}finally{t.value=!1}}let y=0,g=0,b=0,S=0;function k(K,q){const Q=new Set;return[...q,...K].filter(ie=>{const X=ie._hmac||JSON.stringify([ie.timestamp,ie.tool_name,ie.user_id,ie.result_summary,ie.error]);return Q.has(X)?!1:(Q.add(X),!0)})}async function A(){const K=++y,q=b;a.value=!0;try{const Q=await W.get("/api/audit?limit=10");if(K!==y)return;const ie=q===b?[]:n.value.filter(X=>(X._liveEpoch||0)>q);n.value=k(Q,ie).slice(0,10),c.value=ie.length}catch{}K===y&&(a.value=!1)}async function T(){const K=++g,q=S;l.value=!0;try{const Q=await W.get("/api/audit?error_only=1&limit=5");if(K!==g)return;const ie=q===S?[]:i.value.filter(X=>(X._liveErrorEpoch||0)>q);i.value=k(Q,ie).slice(0,5),r.value=!1}catch{if(K!==g)return;r.value=q===S||i.value.length===0}K===g&&(l.value=!1)}async function _(){try{const K=await W.get("/api/knowledge");d.value=(Array.isArray(K)?K:[]).reduce((q,Q)=>q+(Q.chunks||0),0)}catch{d.value=null}}async function D(){try{const K=await W.get("/api/agents");o.value=K.filter(q=>q.status==="running")}catch{}}async function E(){u.value={...u.value,reload:!0};try{await W.post("/api/reload"),Re.success("Config reloaded")}catch(K){Re.error(K.message)}u.value={...u.value,reload:!1}}async function R(){if(!await Xt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const q=e.value.session_count;e.value={...e.value,session_count:0};try{const Q=await W.post("/api/sessions/clear-all");Re.success(`Cleared ${Q.count} session${Q.count!==1?"s":""}`),await L()}catch(Q){e.value={...e.value,session_count:q},Re.error(Q.message)}u.value={...u.value,clearSessions:!1}}async function $(){if(!await Xt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const q=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Q=await W.post("/api/loops/stop-all");Re.success(Q.result),await L()}catch(Q){e.value={...e.value,loop_count:q},Re.error(Q.message)}u.value={...u.value,stopLoops:!1}}function V(){t.value=!0,s.value=null,L(),A(),T(),D()}let oe=null,P=null,N=null;function O(K){if(K.payload&&K.payload.tool_name){b+=1;const q={...K.payload,_isNew:!0,_key:++p,_liveEpoch:b};n.value.unshift(q),n.value.length>10&&n.value.pop(),c.value++,q.error&&(S+=1,q._liveErrorEpoch=S,r.value=!1,i.value.unshift(q),i.value.length>5&&i.value.pop()),setTimeout(()=>{q._isNew=!1},1500),clearTimeout(N),N=setTimeout(()=>{c.value=0},1e4)}}let U=null;return We(async()=>{await Promise.all([L(),A(),T(),D(),_()]),oe=setInterval(L,15e3),P=setInterval(D,1e4),Ye.subscribe("events",O),U=Ye.onReconnected(()=>{A(),T()})}),mt(()=>{oe&&clearInterval(oe),P&&clearInterval(P),clearTimeout(N),Ye.unsubscribe("events",O),U&&(U(),U=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:C,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:r,agents:o,actionLoading:u,fetchActivity:A,fetchErrors:T,fetchStatus:L,onEvent:O,formatTime:Tm,formatDuration:ri,retry:V,reloadConfig:E,clearSessions:R,stopAllLoops:$}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Xu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Gk(e){if(Array.isArray(e))return e}function Kk(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function Wk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Zk(e,t){return Gk(e)||Kk(e,t)||Jk(e,t)||Wk()}function Jk(e,t){if(e){if(typeof e=="string")return Xu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Xu(e,t):void 0}}const zm=Object.entries,ep=Object.setPrototypeOf,Yk=Object.isFrozen,Qk=Object.getPrototypeOf,Xk=Object.getOwnPropertyDescriptor;let ds=Object.freeze,Fs=Object.seal,Fa=Object.create,jm=typeof Reflect<"u"&&Reflect,Qo=jm.apply,Xo=jm.construct;ds||(ds=function(t){return t});Fs||(Fs=function(t){return t});Qo||(Qo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Xo||(Xo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const fn=It(Array.prototype.forEach),eS=It(Array.prototype.lastIndexOf),tp=It(Array.prototype.pop),La=It(Array.prototype.push),tS=It(Array.prototype.splice),as=Array.isArray,Ei=It(String.prototype.toLowerCase),vo=It(String.prototype.toString),sp=It(String.prototype.match),Na=It(String.prototype.replace),np=It(String.prototype.indexOf),sS=It(String.prototype.trim),nS=It(Number.prototype.toString),aS=It(Boolean.prototype.toString),ap=typeof BigInt>"u"?null:It(BigInt.prototype.toString),ip=typeof Symbol>"u"?null:It(Symbol.prototype.toString),bt=It(Object.prototype.hasOwnProperty),xi=It(Object.prototype.toString),Bt=It(RegExp.prototype.test),na=iS(TypeError);function It(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Qo(e,t,n)}}function iS(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Xo(e,s)}}function je(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ei;if(ep&&ep(e,null),!as(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(Yk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function lS(e){for(let t=0;t<e.length;t++)bt(e,t)||(e[t]=null);return e}function Wt(e){const t=Fa(null);for(const n of zm(e)){var s=Zk(n,2);const a=s[0],i=s[1];bt(e,a)&&(as(i)?t[a]=lS(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Wt(i):t[a]=i)}return t}function rS(e){switch(typeof e){case"string":return e;case"number":return nS(e);case"boolean":return aS(e);case"bigint":return ap?ap(e):"0";case"symbol":return ip?ip(e):"Symbol()";case"undefined":return xi(e);case"function":case"object":{if(e===null)return xi(e);const t=e,s=Qs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:xi(n)}return xi(e)}default:return xi(e)}}function Qs(e,t){for(;e!==null;){const n=Xk(e,t);if(n){if(n.get)return It(n.get);if(typeof n.value=="function")return It(n.value)}e=Qk(e)}function s(){return null}return s}function oS(e){try{return Bt(e,""),!0}catch{return!1}}const lp=ds(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),go=ds(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),bo=ds(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),cS=ds(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),yo=ds(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),dS=ds(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),rp=ds(["#text"]),op=ds(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),xo=ds(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),cp=ds(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Il=ds(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),uS=Fs(/{{[\w\W]*|^[\w\W]*}}/g),pS=Fs(/<%[\w\W]*|^[\w\W]*%>/g),fS=Fs(/\${[\w\W]*/g),hS=Fs(/^data-[\-\w.\u00B7-\uFFFF]+$/),mS=Fs(/^aria-[\-\w]+$/),dp=Fs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),vS=Fs(/^(?:\w+script|data):/i),gS=Fs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),bS=Fs(/^html$/i),yS=Fs(/^[a-z][.\w]*(-[.\w]+)+$/i),Js={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},xS=function(){return typeof window>"u"?null:window},_S=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},up=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Vm(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:xS();const t=Ee=>Vm(Ee);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Js.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,h=Qs(p,"cloneNode"),m=Qs(p,"remove"),v=Qs(p,"nextSibling"),C=Qs(p,"childNodes"),L=Qs(p,"parentNode"),y=Qs(p,"shadowRoot"),g=Qs(p,"attributes"),b=l&&l.prototype?Qs(l.prototype,"nodeType"):null,S=l&&l.prototype?Qs(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ee=s.createElement("template");Ee.content&&Ee.content.ownerDocument&&(s=Ee.content.ownerDocument)}let k,A="",T,_=!1,D=0;const E=function(){if(D>0)throw na('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},R=function(I){E(),D++;try{return k.createHTML(I)}finally{D--}},$=function(I){E(),D++;try{return k.createScriptURL(I)}finally{D--}},V=function(){return _||(T=_S(u,a),_=!0),T},oe=s,P=oe.implementation,N=oe.createNodeIterator,O=oe.createDocumentFragment,U=oe.getElementsByTagName,K=n.importNode;let q=up();t.isSupported=typeof zm=="function"&&typeof L=="function"&&P&&P.createHTMLDocument!==void 0;const Q=uS,ie=pS,X=fS,fe=hS,Pe=mS,Y=vS,be=gS,H=yS;let re=dp,ue=null;const Le=je({},[...lp,...go,...bo,...yo,...rp]);let x=null;const M=je({},[...op,...xo,...cp,...Il]);let B=Object.seal(Fa(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ae=null,te=null;const ne=Object.seal(Fa(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let he=!0,de=!0,pe=!1,le=!0,ke=!1,ye=!0,_e=!1,ce=!1,z=!1,ve=!1,Te=!1,Oe=!1,De=!0,ct=!1;const rt="user-content-";let Pt=!0,se=!1,we={},Ie=null;const ze=je({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let it=null;const qe=je({},["audio","video","img","source","image","track"]);let _t=null;const Ot=je({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Es="http://www.w3.org/1998/Math/MathML",$s="http://www.w3.org/2000/svg",Ut="http://www.w3.org/1999/xhtml";let ys=Ut,As=!1,Ks=null;const Nn=je({},[Es,$s,Ut],vo);let Us=je({},["mi","mo","mn","ms","mtext"]),Ws=je({},["annotation-xml"]);const rn=je({},["title","style","font","a","script"]);let wt=null;const Rs=["application/xhtml+xml","text/html"],Dn="text/html";let lt=null,G=null;const me=s.createElement("form"),Ne=function(I){return I instanceof RegExp||I instanceof Function},Ve=function(){let I=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(G&&G===I)return;(!I||typeof I!="object")&&(I={}),I=Wt(I),wt=Rs.indexOf(I.PARSER_MEDIA_TYPE)===-1?Dn:I.PARSER_MEDIA_TYPE,lt=wt==="application/xhtml+xml"?vo:Ei,ue=bt(I,"ALLOWED_TAGS")&&as(I.ALLOWED_TAGS)?je({},I.ALLOWED_TAGS,lt):Le,x=bt(I,"ALLOWED_ATTR")&&as(I.ALLOWED_ATTR)?je({},I.ALLOWED_ATTR,lt):M,Ks=bt(I,"ALLOWED_NAMESPACES")&&as(I.ALLOWED_NAMESPACES)?je({},I.ALLOWED_NAMESPACES,vo):Nn,_t=bt(I,"ADD_URI_SAFE_ATTR")&&as(I.ADD_URI_SAFE_ATTR)?je(Wt(Ot),I.ADD_URI_SAFE_ATTR,lt):Ot,it=bt(I,"ADD_DATA_URI_TAGS")&&as(I.ADD_DATA_URI_TAGS)?je(Wt(qe),I.ADD_DATA_URI_TAGS,lt):qe,Ie=bt(I,"FORBID_CONTENTS")&&as(I.FORBID_CONTENTS)?je({},I.FORBID_CONTENTS,lt):ze,ae=bt(I,"FORBID_TAGS")&&as(I.FORBID_TAGS)?je({},I.FORBID_TAGS,lt):Wt({}),te=bt(I,"FORBID_ATTR")&&as(I.FORBID_ATTR)?je({},I.FORBID_ATTR,lt):Wt({}),we=bt(I,"USE_PROFILES")?I.USE_PROFILES&&typeof I.USE_PROFILES=="object"?Wt(I.USE_PROFILES):I.USE_PROFILES:!1,he=I.ALLOW_ARIA_ATTR!==!1,de=I.ALLOW_DATA_ATTR!==!1,pe=I.ALLOW_UNKNOWN_PROTOCOLS||!1,le=I.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ke=I.SAFE_FOR_TEMPLATES||!1,ye=I.SAFE_FOR_XML!==!1,_e=I.WHOLE_DOCUMENT||!1,ve=I.RETURN_DOM||!1,Te=I.RETURN_DOM_FRAGMENT||!1,Oe=I.RETURN_TRUSTED_TYPE||!1,z=I.FORCE_BODY||!1,De=I.SANITIZE_DOM!==!1,ct=I.SANITIZE_NAMED_PROPS||!1,Pt=I.KEEP_CONTENT!==!1,se=I.IN_PLACE||!1,re=oS(I.ALLOWED_URI_REGEXP)?I.ALLOWED_URI_REGEXP:dp,ys=typeof I.NAMESPACE=="string"?I.NAMESPACE:Ut,Us=bt(I,"MATHML_TEXT_INTEGRATION_POINTS")&&I.MATHML_TEXT_INTEGRATION_POINTS&&typeof I.MATHML_TEXT_INTEGRATION_POINTS=="object"?Wt(I.MATHML_TEXT_INTEGRATION_POINTS):je({},["mi","mo","mn","ms","mtext"]),Ws=bt(I,"HTML_INTEGRATION_POINTS")&&I.HTML_INTEGRATION_POINTS&&typeof I.HTML_INTEGRATION_POINTS=="object"?Wt(I.HTML_INTEGRATION_POINTS):je({},["annotation-xml"]);const ee=bt(I,"CUSTOM_ELEMENT_HANDLING")&&I.CUSTOM_ELEMENT_HANDLING&&typeof I.CUSTOM_ELEMENT_HANDLING=="object"?Wt(I.CUSTOM_ELEMENT_HANDLING):Fa(null);if(B=Fa(null),bt(ee,"tagNameCheck")&&Ne(ee.tagNameCheck)&&(B.tagNameCheck=ee.tagNameCheck),bt(ee,"attributeNameCheck")&&Ne(ee.attributeNameCheck)&&(B.attributeNameCheck=ee.attributeNameCheck),bt(ee,"allowCustomizedBuiltInElements")&&typeof ee.allowCustomizedBuiltInElements=="boolean"&&(B.allowCustomizedBuiltInElements=ee.allowCustomizedBuiltInElements),ke&&(de=!1),Te&&(ve=!0),we&&(ue=je({},rp),x=Fa(null),we.html===!0&&(je(ue,lp),je(x,op)),we.svg===!0&&(je(ue,go),je(x,xo),je(x,Il)),we.svgFilters===!0&&(je(ue,bo),je(x,xo),je(x,Il)),we.mathMl===!0&&(je(ue,yo),je(x,cp),je(x,Il))),ne.tagCheck=null,ne.attributeCheck=null,bt(I,"ADD_TAGS")&&(typeof I.ADD_TAGS=="function"?ne.tagCheck=I.ADD_TAGS:as(I.ADD_TAGS)&&(ue===Le&&(ue=Wt(ue)),je(ue,I.ADD_TAGS,lt))),bt(I,"ADD_ATTR")&&(typeof I.ADD_ATTR=="function"?ne.attributeCheck=I.ADD_ATTR:as(I.ADD_ATTR)&&(x===M&&(x=Wt(x)),je(x,I.ADD_ATTR,lt))),bt(I,"ADD_URI_SAFE_ATTR")&&as(I.ADD_URI_SAFE_ATTR)&&je(_t,I.ADD_URI_SAFE_ATTR,lt),bt(I,"FORBID_CONTENTS")&&as(I.FORBID_CONTENTS)&&(Ie===ze&&(Ie=Wt(Ie)),je(Ie,I.FORBID_CONTENTS,lt)),bt(I,"ADD_FORBID_CONTENTS")&&as(I.ADD_FORBID_CONTENTS)&&(Ie===ze&&(Ie=Wt(Ie)),je(Ie,I.ADD_FORBID_CONTENTS,lt)),Pt&&(ue["#text"]=!0),_e&&je(ue,["html","head","body"]),ue.table&&(je(ue,["tbody"]),delete ae.tbody),I.TRUSTED_TYPES_POLICY){if(typeof I.TRUSTED_TYPES_POLICY.createHTML!="function")throw na('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof I.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw na('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ge=k;k=I.TRUSTED_TYPES_POLICY;try{A=R("")}catch(Me){throw k=ge,Me}}else I.TRUSTED_TYPES_POLICY===null?(k=void 0,A=""):(k===void 0&&(k=V()),k&&typeof A=="string"&&(A=R("")));(q.uponSanitizeElement.length>0||q.uponSanitizeAttribute.length>0)&&ue===Le&&(ue=Wt(ue)),q.uponSanitizeAttribute.length>0&&x===M&&(x=Wt(x)),ds&&ds(I),G=I},dt=je({},[...go,...bo,...cS]),Lt=je({},[...yo,...dS]),Jn=function(I){let ee=L(I);(!ee||!ee.tagName)&&(ee={namespaceURI:ys,tagName:"template"});const ge=Ei(I.tagName),Me=Ei(ee.tagName);return Ks[I.namespaceURI]?I.namespaceURI===$s?ee.namespaceURI===Ut?ge==="svg":ee.namespaceURI===Es?ge==="svg"&&(Me==="annotation-xml"||Us[Me]):!!dt[ge]:I.namespaceURI===Es?ee.namespaceURI===Ut?ge==="math":ee.namespaceURI===$s?ge==="math"&&Ws[Me]:!!Lt[ge]:I.namespaceURI===Ut?ee.namespaceURI===$s&&!Ws[Me]||ee.namespaceURI===Es&&!Us[Me]?!1:!Lt[ge]&&(rn[ge]||!dt[ge]):!!(wt==="application/xhtml+xml"&&Ks[I.namespaceURI]):!1},ss=function(I){La(t.removed,{element:I});try{L(I).removeChild(I)}catch{if(m(I),!L(I))throw na("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Ta=function(I){const ee=C?C(I):I.childNodes;if(ee){const Me=[];fn(ee,$e=>{La(Me,$e)}),fn(Me,$e=>{try{m($e)}catch{}})}const ge=g?g(I):null;if(ge)for(let Me=ge.length-1;Me>=0;--Me){const $e=ge[Me],Be=$e&&$e.name;if(typeof Be=="string")try{I.removeAttribute(Be)}catch{}}},Bs=function(I,ee){try{La(t.removed,{attribute:ee.getAttributeNode(I),from:ee})}catch{La(t.removed,{attribute:null,from:ee})}if(ee.removeAttribute(I),I==="is")if(ve||Te)try{ss(ee)}catch{}else try{ee.setAttribute(I,"")}catch{}},ui=function(I){const ee=g?g(I):I.attributes;if(ee)for(let ge=ee.length-1;ge>=0;--ge){const Me=ee[ge],$e=Me&&Me.name;if(!(typeof $e!="string"||x[lt($e)]))try{I.removeAttribute($e)}catch{}}},Ca=function(I){const ee=[I];for(;ee.length>0;){const ge=ee.pop();(b?b(ge):ge.nodeType)===Js.element&&ui(ge);const $e=C?C(ge):ge.childNodes;if($e)for(let Be=$e.length-1;Be>=0;--Be)ee.push($e[Be])}},Yn=function(I){let ee=null,ge=null;if(z)I="<remove></remove>"+I;else{const Be=sp(I,/^[\r\n\t ]+/);ge=Be&&Be[0]}wt==="application/xhtml+xml"&&ys===Ut&&(I='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+I+"</body></html>");const Me=k?R(I):I;if(ys===Ut)try{ee=new d().parseFromString(Me,wt)}catch{}if(!ee||!ee.documentElement){ee=P.createDocument(ys,"template",null);try{ee.documentElement.innerHTML=As?A:Me}catch{}}const $e=ee.body||ee.documentElement;return I&&ge&&$e.insertBefore(s.createTextNode(ge),$e.childNodes[0]||null),ys===Ut?U.call(ee,_e?"html":"body")[0]:_e?ee.documentElement:$e},Ea=function(I){return N.call(I.ownerDocument||I,I,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Qn=function(I){var ee,ge;I.normalize();const Me=N.call(I.ownerDocument||I,I,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let $e=Me.nextNode();for(;$e;){let gt=$e.data;fn([Q,ie,X],w=>{gt=Na(gt,w," ")}),$e.data=gt,$e=Me.nextNode()}const Be=(ee=(ge=I.querySelectorAll)===null||ge===void 0?void 0:ge.call(I,"template"))!==null&&ee!==void 0?ee:[];fn(Array.from(Be),gt=>{xs(gt.content)&&Qn(gt.content)})},Mn=function(I){const ee=S?S(I):null;return typeof ee!="string"||lt(ee)!=="form"?!1:typeof I.nodeName!="string"||typeof I.textContent!="string"||typeof I.removeChild!="function"||I.attributes!==g(I)||typeof I.removeAttribute!="function"||typeof I.setAttribute!="function"||typeof I.namespaceURI!="string"||typeof I.insertBefore!="function"||typeof I.hasChildNodes!="function"||I.nodeType!==b(I)||I.childNodes!==C(I)},xs=function(I){if(!b||typeof I!="object"||I===null)return!1;try{return b(I)===Js.documentFragment}catch{return!1}},on=function(I){if(!b||typeof I!="object"||I===null)return!1;try{return typeof b(I)=="number"}catch{return!1}};function qt(Ee,I,ee){fn(Ee,ge=>{ge.call(t,I,ee,G)})}const j=function(I){let ee=null;if(qt(q.beforeSanitizeElements,I,null),Mn(I))return ss(I),!0;const ge=lt(S?S(I):I.nodeName);if(qt(q.uponSanitizeElement,I,{tagName:ge,allowedTags:ue}),ye&&I.hasChildNodes()&&!on(I.firstElementChild)&&Bt(/<[/\w!]/g,I.innerHTML)&&Bt(/<[/\w!]/g,I.textContent)||ye&&I.namespaceURI===Ut&&ge==="style"&&on(I.firstElementChild)||I.nodeType===Js.progressingInstruction||ye&&I.nodeType===Js.comment&&Bt(/<[/\w]/g,I.data))return ss(I),!0;if(ae[ge]||!(ne.tagCheck instanceof Function&&ne.tagCheck(ge))&&!ue[ge]){if(!ae[ge]&&Hs(ge)&&(B.tagNameCheck instanceof RegExp&&Bt(B.tagNameCheck,ge)||B.tagNameCheck instanceof Function&&B.tagNameCheck(ge)))return!1;if(Pt&&!Ie[ge]){const $e=L(I),Be=C(I);if(Be&&$e){const gt=Be.length;for(let w=gt-1;w>=0;--w){const F=se?Be[w]:h(Be[w],!0);$e.insertBefore(F,v(I))}}}return ss(I),!0}return(b?b(I):I.nodeType)===Js.element&&!Jn(I)||(ge==="noscript"||ge==="noembed"||ge==="noframes")&&Bt(/<\/no(script|embed|frames)/i,I.innerHTML)?(ss(I),!0):(ke&&I.nodeType===Js.text&&(ee=I.textContent,fn([Q,ie,X],$e=>{ee=Na(ee,$e," ")}),I.textContent!==ee&&(La(t.removed,{element:I.cloneNode()}),I.textContent=ee)),qt(q.afterSanitizeElements,I,null),!1)},Se=function(I,ee,ge){if(te[ee]||De&&(ee==="id"||ee==="name")&&(ge in s||ge in me))return!1;const Me=x[ee]||ne.attributeCheck instanceof Function&&ne.attributeCheck(ee,I);if(!(de&&!te[ee]&&Bt(fe,ee))){if(!(he&&Bt(Pe,ee))){if(!Me||te[ee]){if(!(Hs(I)&&(B.tagNameCheck instanceof RegExp&&Bt(B.tagNameCheck,I)||B.tagNameCheck instanceof Function&&B.tagNameCheck(I))&&(B.attributeNameCheck instanceof RegExp&&Bt(B.attributeNameCheck,ee)||B.attributeNameCheck instanceof Function&&B.attributeNameCheck(ee,I))||ee==="is"&&B.allowCustomizedBuiltInElements&&(B.tagNameCheck instanceof RegExp&&Bt(B.tagNameCheck,ge)||B.tagNameCheck instanceof Function&&B.tagNameCheck(ge))))return!1}else if(!_t[ee]){if(!Bt(re,Na(ge,be,""))){if(!((ee==="src"||ee==="xlink:href"||ee==="href")&&I!=="script"&&np(ge,"data:")===0&&it[I])){if(!(pe&&!Bt(Y,Na(ge,be,"")))){if(ge)return!1}}}}}}return!0},Ce=je({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Hs=function(I){return!Ce[Ei(I)]&&Bt(H,I)},Xn=function(I){qt(q.beforeSanitizeAttributes,I,null);const ee=I.attributes;if(!ee||Mn(I))return;const ge={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:x,forceKeepAttr:void 0};let Me=ee.length;for(;Me--;){const $e=ee[Me],Be=$e.name,gt=$e.namespaceURI,w=$e.value,F=lt(Be),Z=w;let xe=Be==="value"?Z:sS(Z);if(ge.attrName=F,ge.attrValue=xe,ge.keepAttr=!0,ge.forceKeepAttr=void 0,qt(q.uponSanitizeAttribute,I,ge),xe=ge.attrValue,ct&&(F==="id"||F==="name")&&np(xe,rt)!==0&&(Bs(Be,I),xe=rt+xe),ye&&Bt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,xe)){Bs(Be,I);continue}if(F==="attributename"&&sp(xe,"href")){Bs(Be,I);continue}if(ge.forceKeepAttr)continue;if(!ge.keepAttr){Bs(Be,I);continue}if(!le&&Bt(/\/>/i,xe)){Bs(Be,I);continue}ke&&fn([Q,ie,X],Gt=>{xe=Na(xe,Gt," ")});const Qe=lt(I.nodeName);if(!Se(Qe,F,xe)){Bs(Be,I);continue}if(k&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!gt)switch(u.getAttributeType(Qe,F)){case"TrustedHTML":{xe=R(xe);break}case"TrustedScriptURL":{xe=$(xe);break}}if(xe!==Z)try{gt?I.setAttributeNS(gt,Be,xe):I.setAttribute(Be,xe),Mn(I)?ss(I):tp(t.removed)}catch{Bs(Be,I)}}qt(q.afterSanitizeAttributes,I,null)},Zs=function(I){let ee=null;const ge=Ea(I);for(qt(q.beforeSanitizeShadowDOM,I,null);ee=ge.nextNode();)if(qt(q.uponSanitizeShadowNode,ee,null),j(ee),Xn(ee),xs(ee.content)&&Zs(ee.content),(b?b(ee):ee.nodeType)===Js.element){const $e=y?y(ee):ee.shadowRoot;xs($e)&&(pi($e),Zs($e))}qt(q.afterSanitizeShadowDOM,I,null)},pi=function(I){const ee=[{node:I,shadow:null}];for(;ee.length>0;){const ge=ee.pop();if(ge.shadow){Zs(ge.shadow);continue}const Me=ge.node,Be=(b?b(Me):Me.nodeType)===Js.element,gt=C?C(Me):Me.childNodes;if(gt)for(let w=gt.length-1;w>=0;--w)ee.push({node:gt[w],shadow:null});if(Be){const w=S?S(Me):null;if(typeof w=="string"&&lt(w)==="template"){const F=Me.content;xs(F)&&ee.push({node:F,shadow:null})}}if(Be){const w=y?y(Me):Me.shadowRoot;xs(w)&&ee.push({node:null,shadow:w},{node:w,shadow:null})}}};return t.sanitize=function(Ee){let I=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ee=null,ge=null,Me=null,$e=null;if(As=!Ee,As&&(Ee="<!-->"),typeof Ee!="string"&&!on(Ee)&&(Ee=rS(Ee),typeof Ee!="string"))throw na("dirty is not a string, aborting");if(!t.isSupported)return Ee;ce||Ve(I),t.removed=[];const Be=se&&typeof Ee!="string"&&on(Ee);if(Be){const F=S?S(Ee):Ee.nodeName;if(typeof F=="string"){const Z=lt(F);if(!ue[Z]||ae[Z])throw na("root node is forbidden and cannot be sanitized in-place")}if(Mn(Ee))throw na("root node is clobbered and cannot be sanitized in-place");try{pi(Ee)}catch(Z){throw Ta(Ee),Z}}else if(on(Ee))ee=Yn("<!---->"),ge=ee.ownerDocument.importNode(Ee,!0),ge.nodeType===Js.element&&ge.nodeName==="BODY"||ge.nodeName==="HTML"?ee=ge:ee.appendChild(ge),pi(ge);else{if(!ve&&!ke&&!_e&&Ee.indexOf("<")===-1)return k&&Oe?R(Ee):Ee;if(ee=Yn(Ee),!ee)return ve?null:Oe?A:""}ee&&z&&ss(ee.firstChild);const gt=Ea(Be?Ee:ee);try{for(;Me=gt.nextNode();)j(Me),Xn(Me),xs(Me.content)&&Zs(Me.content)}catch(F){throw Be&&Ta(Ee),F}if(Be)return fn(t.removed,F=>{F.element&&Ca(F.element)}),ke&&Qn(Ee),Ee;if(ve){if(ke&&Qn(ee),Te)for($e=O.call(ee.ownerDocument);ee.firstChild;)$e.appendChild(ee.firstChild);else $e=ee;return(x.shadowroot||x.shadowrootmode)&&($e=K.call(n,$e,!0)),$e}let w=_e?ee.outerHTML:ee.innerHTML;return _e&&ue["!doctype"]&&ee.ownerDocument&&ee.ownerDocument.doctype&&ee.ownerDocument.doctype.name&&Bt(bS,ee.ownerDocument.doctype.name)&&(w="<!DOCTYPE "+ee.ownerDocument.doctype.name+`>
`+w),ke&&fn([Q,ie,X],F=>{w=Na(w,F," ")}),k&&Oe?R(w):w},t.setConfig=function(){let Ee=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ve(Ee),ce=!0},t.clearConfig=function(){G=null,ce=!1,k=T,A=""},t.isValidAttribute=function(Ee,I,ee){G||Ve({});const ge=lt(Ee),Me=lt(I);return Se(ge,Me,ee)},t.addHook=function(Ee,I){typeof I=="function"&&La(q[Ee],I)},t.removeHook=function(Ee,I){if(I!==void 0){const ee=eS(q[Ee],I);return ee===-1?void 0:tS(q[Ee],ee,1)[0]}return tp(q[Ee])},t.removeHooks=function(Ee){q[Ee]=[]},t.removeAllHooks=function(){q=up()},t}var pp=Vm();function nd(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Sa=nd();function qm(e){Sa=e}var Fi={exec:()=>null};function at(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(rs.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var rs={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},wS=/^(?:[ \t]*(?:\n|$))+/,kS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,SS=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,fl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,TS=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,ad=/(?:[*+-]|\d{1,9}[.)])/,Gm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Km=at(Gm).replace(/bull/g,ad).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),CS=at(Gm).replace(/bull/g,ad).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),id=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,ES=/^[^\n]+/,ld=/(?!\s*\])(?:\\.|[^\[\]\\])+/,AS=at(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",ld).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),RS=at(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,ad).getRegex(),jr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",rd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,IS=at("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",rd).replace("tag",jr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Wm=at(id).replace("hr",fl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",jr).getRegex(),OS=at(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Wm).getRegex(),od={blockquote:OS,code:kS,def:AS,fences:SS,heading:TS,hr:fl,html:IS,lheading:Km,list:RS,newline:wS,paragraph:Wm,table:Fi,text:ES},fp=at("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",fl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",jr).getRegex(),LS={...od,lheading:CS,table:fp,paragraph:at(id).replace("hr",fl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",fp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",jr).getRegex()},NS={...od,html:at(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",rd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Fi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:at(id).replace("hr",fl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Km).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},DS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,MS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Zm=/^( {2,}|\\)\n(?!\s*$)/,PS=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Vr=/[\p{P}\p{S}]/u,cd=/[\s\p{P}\p{S}]/u,Jm=/[^\s\p{P}\p{S}]/u,FS=at(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,cd).getRegex(),Ym=/(?!~)[\p{P}\p{S}]/u,$S=/(?!~)[\s\p{P}\p{S}]/u,US=/(?:[^\s\p{P}\p{S}]|~)/u,BS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Qm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,HS=at(Qm,"u").replace(/punct/g,Vr).getRegex(),zS=at(Qm,"u").replace(/punct/g,Ym).getRegex(),Xm="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",jS=at(Xm,"gu").replace(/notPunctSpace/g,Jm).replace(/punctSpace/g,cd).replace(/punct/g,Vr).getRegex(),VS=at(Xm,"gu").replace(/notPunctSpace/g,US).replace(/punctSpace/g,$S).replace(/punct/g,Ym).getRegex(),qS=at("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Jm).replace(/punctSpace/g,cd).replace(/punct/g,Vr).getRegex(),GS=at(/\\(punct)/,"gu").replace(/punct/g,Vr).getRegex(),KS=at(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),WS=at(rd).replace("(?:-->|$)","-->").getRegex(),ZS=at("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",WS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),pr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,JS=at(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",pr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),ev=at(/^!?\[(label)\]\[(ref)\]/).replace("label",pr).replace("ref",ld).getRegex(),tv=at(/^!?\[(ref)\](?:\[\])?/).replace("ref",ld).getRegex(),YS=at("reflink|nolink(?!\\()","g").replace("reflink",ev).replace("nolink",tv).getRegex(),dd={_backpedal:Fi,anyPunctuation:GS,autolink:KS,blockSkip:BS,br:Zm,code:MS,del:Fi,emStrongLDelim:HS,emStrongRDelimAst:jS,emStrongRDelimUnd:qS,escape:DS,link:JS,nolink:tv,punctuation:FS,reflink:ev,reflinkSearch:YS,tag:ZS,text:PS,url:Fi},QS={...dd,link:at(/^!?\[(label)\]\((.*?)\)/).replace("label",pr).getRegex(),reflink:at(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",pr).getRegex()},ec={...dd,emStrongRDelimAst:VS,emStrongLDelim:zS,url:at(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},XS={...ec,br:at(Zm).replace("{2,}","*").getRegex(),text:at(ec.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Ol={normal:od,gfm:LS,pedantic:NS},_i={normal:dd,gfm:ec,breaks:XS,pedantic:QS},e1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},hp=e=>e1[e];function Xs(e,t){if(t){if(rs.escapeTest.test(e))return e.replace(rs.escapeReplace,hp)}else if(rs.escapeTestNoEncode.test(e))return e.replace(rs.escapeReplaceNoEncode,hp);return e}function mp(e){try{e=encodeURI(e).replace(rs.percentDecode,"%")}catch{return null}return e}function vp(e,t){var i;const s=e.replace(rs.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(rs.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(rs.slashPipe,"|");return n}function wi(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function t1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function gp(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function s1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var fr=class{constructor(e){ut(this,"options");ut(this,"rules");ut(this,"lexer");this.options=e||Sa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:wi(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=s1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=wi(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:wi(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=wi(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const h=p,m=h.raw+`
`+s.join(`
`),v=this.blockquote(m);i[i.length-1]=v,n=n.substring(0,n.length-h.raw.length)+v.raw,a=a.substring(0,a.length-h.text.length)+v.text;break}else if((p==null?void 0:p.type)==="list"){const h=p,m=h.raw+`
`+s.join(`
`),v=this.list(m);i[i.length-1]=v,n=n.substring(0,n.length-p.raw.length)+v.raw,a=a.substring(0,a.length-h.raw.length)+v.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,L=>" ".repeat(3*L.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const L=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),S=this.rules.other.htmlBeginRegex(m);for(;e;){const k=e.split(`
`,1)[0];let A;if(p=k,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),A=p):A=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||S.test(p)||L.test(p)||y.test(p))break;if(A.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+A.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=k+`
`,e=e.substring(k.length+1),u=A.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,C;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(C=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:C,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=vp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(vp(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=wi(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=t1(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),gp(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return gp(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},_n=class tc{constructor(t){ut(this,"tokens");ut(this,"options");ut(this,"state");ut(this,"tokenizer");ut(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Sa,this.options.tokenizer=this.options.tokenizer||new fr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:rs,block:Ol.normal,inline:_i.normal};this.options.pedantic?(s.block=Ol.pedantic,s.inline=_i.pedantic):this.options.gfm&&(s.block=Ol.gfm,this.options.breaks?s.inline=_i.breaks:s.inline=_i.gfm),this.tokenizer.rules=s}static get rules(){return{block:Ol,inline:_i}}static lex(t,s){return new tc(s).lex(t)}static lexInline(t,s){return new tc(s).inlineTokens(t)}lex(t){t=t.replace(rs.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(rs.tabCharGlobal,"    ").replace(rs.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},hr=class{constructor(e){ut(this,"options");ut(this,"parser");this.options=e||Sa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(rs.notSpaceStart))==null?void 0:i[0],a=e.replace(rs.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Xs(n)+'">'+(s?a:Xs(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Xs(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+Xs(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Xs(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=mp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Xs(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=mp(e);if(a===null)return Xs(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Xs(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Xs(e.text)}},ud=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},wn=class sc{constructor(t){ut(this,"options");ut(this,"renderer");ut(this,"textRenderer");this.options=t||Sa,this.options.renderer=this.options.renderer||new hr,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new ud}static parse(t,s){return new sc(s).parse(t)}static parseInline(t,s){return new sc(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},_o,$l=(_o=class{constructor(e){ut(this,"options");ut(this,"block");this.options=e||Sa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?_n.lex:_n.lexInline}provideParser(){return this.block?wn.parse:wn.parseInline}},ut(_o,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),_o),n1=class{constructor(...e){ut(this,"defaults",nd());ut(this,"options",this.setOptions);ut(this,"parse",this.parseMarkdown(!0));ut(this,"parseInline",this.parseMarkdown(!1));ut(this,"Parser",wn);ut(this,"Renderer",hr);ut(this,"TextRenderer",ud);ut(this,"Lexer",_n);ut(this,"Tokenizer",fr);ut(this,"Hooks",$l);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new hr(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new fr(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new $l;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];$l.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return _n.lex(e,t??this.defaults)}parser(e,t){return wn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?_n.lex:_n.lexInline,o=i.hooks?i.hooks.provideParser():e?wn.parse:wn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Xs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ba=new n1;function st(e,t){return ba.parse(e,t)}st.options=st.setOptions=function(e){return ba.setOptions(e),st.defaults=ba.defaults,qm(st.defaults),st};st.getDefaults=nd;st.defaults=Sa;st.use=function(...e){return ba.use(...e),st.defaults=ba.defaults,qm(st.defaults),st};st.walkTokens=function(e,t){return ba.walkTokens(e,t)};st.parseInline=ba.parseInline;st.Parser=wn;st.parser=wn.parse;st.Renderer=hr;st.TextRenderer=ud;st.Lexer=_n;st.lexer=_n.lex;st.Tokenizer=fr;st.Hooks=$l;st.parse=st;st.options;st.setOptions;st.use;st.walkTokens;st.parseInline;wn.parse;_n.lex;const a1={breaks:!0,gfm:!0};function bp(e){if(!e)return"";try{if(typeof st<"u"&&st.parse){const t=st.parse(e,a1);return typeof pp<"u"?pp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function i1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const l1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function r1(e){return l1[e]||"wrench"}const o1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function yp(e){if(!e)return[];const t=e.match(o1);return t?[...new Set(t)]:[]}const c1={template:`
    <div class="chat-container page-fade-in" role="region" aria-label="Chat">
      <div v-if="historyError" class="chat-history-warning" role="alert">{{ historyError }}</div>
      <!-- Message list -->
      <div class="chat-messages" ref="messagesEl" role="log" aria-live="polite" aria-label="Messages">
        <!-- Empty state -->
        <div v-if="messages.length === 0" class="chat-empty">
          <div class="chat-welcome">
            <div class="chat-welcome-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                <circle cx="12" cy="12" r="9" stroke-dasharray="4 3"/>
              </svg>
            </div>
            <div class="chat-welcome-title">Odin is watching</div>
            <div class="chat-welcome-subtitle">Ask anything. Run commands. Manage infrastructure.</div>
            <div class="chat-suggestions">
              <button v-for="s in suggestions" :key="s" class="chat-suggestion" @click="useSuggestion(s)">{{ s }}</button>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <template v-for="(msg, i) in messages" :key="msg.id">
          <!-- Date separator -->
          <div v-if="showDateSeparator(i)" class="chat-date-sep">
            <span>{{ formatDate(msg.timestamp) }}</span>
          </div>

          <div class="chat-message" :class="'chat-' + msg.role">
            <!-- Avatar -->
            <div class="chat-avatar" :class="'chat-avatar-' + msg.role">
              <span v-if="msg.role === 'bot'" class="chat-avatar-eye">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/>
                </svg>
              </span>
              <span v-else class="chat-avatar-user">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                  <path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0H3z"/>
                </svg>
              </span>
            </div>

            <!-- Bubble -->
            <div class="chat-bubble-wrap">
              <!-- User message -->
              <div v-if="msg.role === 'user'" class="chat-bubble chat-bubble-user">
                <div class="chat-bubble-text">{{ msg.content }}</div>
              </div>

              <!-- Bot message -->
              <div v-else class="chat-bubble chat-bubble-bot">
                <div class="chat-bubble-header">
                  <span class="chat-bubble-label">Odin</span>
                  <span v-if="msg.is_error" class="chat-error-indicator">error</span>
                </div>

                <!-- Tool cards -->
                <div v-if="msg.tools_used && msg.tools_used.length > 0" class="chat-tool-cards">
                  <button class="chat-tools-toggle" @click="msg._showTools = !msg._showTools"
                          :aria-expanded="msg._showTools" aria-label="Toggle tool details">
                    <span class="chat-tools-toggle-icon" aria-hidden="true"><odin-icon :name="msg._showTools ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
                    <span class="chat-tools-toggle-count">{{ msg.tools_used.length }}</span>
                    <span>tool{{ msg.tools_used.length > 1 ? 's' : '' }} executed</span>
                  </button>
                  <div v-if="msg._showTools" class="chat-tool-list">
                    <div v-for="t in msg.tools_used" :key="t" class="chat-tool-card">
                      <span class="chat-tool-icon"><odin-icon :name="getToolIcon(t)" :size="15" /></span>
                      <span class="chat-tool-name">{{ t }}</span>
                    </div>
                  </div>
                </div>

                <!-- Markdown body -->
                <div class="chat-bubble-text chat-markdown" v-html="msg.html"></div>

                <!-- Inline images -->
                <div v-if="msg.images && msg.images.length > 0" class="chat-images">
                  <div v-for="(url, j) in msg.images" :key="j" class="chat-image-thumb">
                    <img :src="url" :alt="'Image ' + (j+1)" loading="lazy" @click="openImage(url)" @error="onImageError($event)"/>
                  </div>
                </div>

                <!-- Attached files (from tool calls like browser_screenshot, post_file) -->
                <div v-if="msg.files && msg.files.length > 0" class="chat-files" style="margin-top: 8px;">
                  <div v-for="(file, j) in msg.files" :key="'f'+j" style="margin-bottom: 6px;">
                    <img
                      v-if="file.content_type && file.content_type.startsWith('image/')"
                      :src="'data:' + file.content_type + ';base64,' + file.data"
                      :alt="file.filename"
                      style="max-width: 100%; border-radius: 6px; border: 1px solid var(--hm-border); cursor: pointer;"
                      @click="openImage('data:' + file.content_type + ';base64,' + file.data)"
                      loading="lazy"
                    />
                    <a
                      v-else
                      :href="'data:' + file.content_type + ';base64,' + file.data"
                      :download="file.filename"
                      style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--hm-border); color: var(--hm-text-muted); font-size: 13px; text-decoration: none;"
                    >
                      <odin-icon name="attachment" :size="15" /> {{ file.filename }} ({{ (file.size / 1024).toFixed(1) }} KB)
                    </a>
                  </div>
                </div>
              </div>

              <!-- Timestamp -->
              <div class="chat-timestamp">{{ formatTime(msg.timestamp) }}</div>
            </div>
          </div>
        </template>

        <!-- Typing indicator -->
        <div v-if="sending" class="chat-message chat-bot" role="status" aria-label="Odin is responding">
          <div class="chat-avatar chat-avatar-bot">
            <span class="chat-avatar-eye chat-avatar-pulse">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/>
              </svg>
            </span>
          </div>
          <div class="chat-bubble-wrap">
            <div class="chat-bubble chat-bubble-bot chat-bubble-typing">
              <div class="chat-typing" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
              <span class="chat-typing-text">{{ typingText }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Input area -->
      <div class="chat-input-area" role="form" aria-label="Send message">
        <div class="chat-input-row">
          <label for="chat-message-input" class="sr-only">Message</label>
          <textarea
            id="chat-message-input"
            ref="inputEl"
            v-model="input"
            class="chat-input"
            placeholder="Message Odin..."
            rows="1"
            :disabled="sending"
            @keydown.enter.exact.prevent="send"
            @input="autoResize"
          ></textarea>
          <button class="btn btn-primary chat-send-btn" :disabled="!canSend" @click="send" aria-label="Send message">
            <span v-if="sending" class="spinner" style="width:14px;height:14px;border-width:2px;" aria-hidden="true"></span>
            <svg v-else viewBox="0 0 20 20" width="16" height="16" fill="currentColor" class="chat-send-icon" aria-hidden="true">
              <path d="M2.94 5.34l6.22 2.6L2.94 5.34zM9.16 12.06l-6.22 2.6 1.36-5.2 4.86 2.6zM18.44 10L2.12 2.4l2.06 7.6-2.06 7.6L18.44 10z"/>
            </svg>
          </button>
        </div>
        <div class="chat-input-hint">
          <span class="text-gray-600 text-xs">Enter to send &middot; Shift+Enter for newline</span>
          <span class="chat-connection-status" :class="wsStatus === 'Connected' ? 'chat-ws-on' : 'chat-ws-off'">
            <span class="chat-status-dot"></span>
            {{ wsStatus }}
          </span>
        </div>
      </div>
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),n=f(""),a=f(null),i=f(null),l=f(0),r=f("");let o=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=J(()=>t.value.trim().length>0&&!s.value),p=f(Ye.state||"disconnected");let h=null;const m=J(()=>{const P=p.value;return P==="connected"?"Connected":P==="reconnecting"?"Reconnecting…":P==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],C=J(()=>{const P=Math.floor(l.value/4)%v.length,N=l.value;return N>3?`${v[P]} (${N}s)`:v[0]});function L(){Et(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function y(){if(!i.value)return;const P=i.value;P.style.height="auto",P.style.height=Math.min(P.scrollHeight,120)+"px"}function g(P,N,O={}){const U={id:++c,role:P,content:N,timestamp:Date.now(),html:P==="bot"?bp(N):"",tools_used:O.tools_used||[],is_error:O.is_error||!1,images:P==="bot"?yp(N):[],files:O.files||[],_showTools:!1};return e.value.push(U),L(),P==="bot"&&Et(()=>b()),U}function b(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(N=>{N.setAttribute("data-copy","true"),N.style.position="relative";const O=document.createElement("button");O.className="chat-code-copy",O.textContent="Copy",O.addEventListener("click",()=>{const U=N.querySelector("code"),K=U?U.textContent:N.textContent;navigator.clipboard.writeText(K).then(()=>{O.textContent="Copied!",setTimeout(()=>{O.textContent="Copy"},1500)}).catch(()=>{})}),N.appendChild(O)})}function S(P){if(P===0)return!0;const N=e.value[P-1],O=e.value[P],U=new Date(N.timestamp).toDateString(),K=new Date(O.timestamp).toDateString();return U!==K}function k(P){const N=new Date(P),O=new Date;if(N.toDateString()===O.toDateString())return"Today";const U=new Date(O);return U.setDate(U.getDate()-1),N.toDateString()===U.toDateString()?"Yesterday":N.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function A(P){t.value=P,Et(()=>V())}function T(P){window.open(P,"_blank","noopener")}function _(P){P.target.style.display="none"}function D(){l.value=0,o=setInterval(()=>{l.value++},1e3)}function E(){o&&(clearInterval(o),o=null),l.value=0}function R(P){s.value&&(s.value=!1,E(),P.type==="chat_response"?g("bot",P.content,{tools_used:P.tools_used||[],is_error:P.is_error||!1,files:P.files||[]}):P.type==="chat_error"&&g("bot",P.error||"Unknown error",{is_error:!0}),Et(()=>{var N;return(N=i.value)==null?void 0:N.focus()}))}async function $(P){try{const N=await W.post("/api/chat",{content:P,channel_id:r.value});g("bot",N.response,{tools_used:N.tools_used||[],is_error:N.is_error||!1,files:N.files||[]})}catch(N){g("bot",N.message||"Failed to send message",{is_error:!0})}}async function V(){const P=t.value.trim();if(!P||s.value)return;g("user",P),t.value="",s.value=!0,D(),i.value&&(i.value.style.height="auto"),Ye.connected&&Ye.sendChat(P,{channelId:r.value})||(await $(P),s.value=!1,E()),Et(()=>{var O;return(O=i.value)==null?void 0:O.focus()})}async function oe(){n.value="";try{if(!r.value){const N=await W.get("/api/auth/session");r.value=N.channel_id||N.user_id||"web-user"}const P=await W.get("/api/sessions/"+encodeURIComponent(r.value));if(P&&P.messages&&P.messages.length>0){for(const N of P.messages){const O=N.role==="user"?"user":"bot";let U=N.content||"";if(O==="user"){const q=U.match(/^\[.*?\]:\s*/);q&&(U=U.slice(q[0].length))}if(!U.trim())continue;const K={id:++c,role:O,content:U,timestamp:N.timestamp?N.timestamp*1e3:Date.now(),html:O==="bot"?bp(U):"",tools_used:[],is_error:!1,images:O==="bot"?yp(U):[],files:[],_showTools:!1};e.value.push(K)}Et(()=>{L(),b()})}}catch(P){P&&P.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Re.error(n.value))}}return We(()=>{Ye.subscribe("chat",R),p.value=Ye.state||"disconnected",h=Ye.onState(P=>{p.value=P}),oe(),Et(()=>{var P;return(P=i.value)==null?void 0:P.focus()})}),mt(()=>{Ye.unsubscribe("chat",R),h&&(h(),h=null),E()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:C,suggestions:d,send:V,autoResize:y,formatTime:i1,formatDate:k,showDateSeparator:S,useSuggestion:A,openImage:T,onImageError:_,getToolIcon:r1,loadHistory:oe}}},d1={setup(){const e=f("odin"),t=f(""),s=f(""),n=f(""),a=f({}),i=f([]),l=f([]),r=f(!1),o=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=J(()=>e.value==="custom"),v=J(()=>[...i.value,...l.value]),C=J(()=>l.value.includes(e.value)),L=J(()=>{var T;return m.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),y=J(()=>{var T;return m.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),g=J(()=>{var T;return m.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function b(){d.value=!0;try{const T=await W.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function S(){r.value=!0,c.value=null,o.value=!1;try{await W.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function k(){const T=u.value.trim();if(T){h.value=!0,c.value=null;try{await W.post("/api/personality/presets",{name:T,display_name:L.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(_){c.value=_.message}finally{h.value=!1}}}async function A(){if(await Xt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await W.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(_){c.value=_.message}}}return We(b),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:C,previewName:L,previewIdentity:y,previewVoice:g,saving:r,saved:o,error:c,loading:d,save:S,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:k,deletePreset:A,builtinPresets:i,userPresets:l}},template:`
  <div class="p-6 space-y-6 max-w-3xl">
    <div>
      <h2 class="text-lg font-semibold mb-1">Personality</h2>
      <p class="text-gray-400 text-sm">Configure how Odin presents itself. Changes apply immediately — no restart needed.</p>
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-gray-400">
      <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Loading...
    </div>

    <template v-else>
      <!-- Preset selector -->
      <div class="hm-card">
        <label for="personality-preset" class="block text-sm font-medium mb-2">Preset</label>
        <div class="flex items-center gap-2">
          <select id="personality-preset" v-model="preset" class="hm-input max-w-xs">
            <optgroup label="Built-in">
              <option v-for="name in builtinPresets" :key="name" :value="name">{{ name.charAt(0).toUpperCase() + name.slice(1) }}</option>
            </optgroup>
            <optgroup v-if="userPresets.length" label="Custom presets">
              <option v-for="name in userPresets" :key="name" :value="name">{{ name.charAt(0).toUpperCase() + name.slice(1) }}</option>
            </optgroup>
            <optgroup label="Other">
              <option value="custom">Custom</option>
            </optgroup>
          </select>
          <button v-if="isUserPreset" @click="deletePreset" class="btn btn-ghost text-red-400 text-xs">Delete</button>
        </div>
        <p class="text-gray-500 text-xs mt-1">Select a personality preset or choose Custom to write your own.</p>
      </div>

      <!-- Custom fields -->
      <div v-if="isCustom" class="hm-card space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Name
          <input v-model="customName" class="hm-input w-full max-w-xs" placeholder="e.g. Muninn, Heimdall, Loki..." />
          </label>
          <p class="text-gray-500 text-xs mt-1">The bot's name as used in prompts and responses.</p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Identity
          <textarea v-model="customIdentity" class="hm-input w-full" rows="4"
            placeholder="Describe who the bot is — background, role, perspective..."></textarea>
          </label>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Voice
          <textarea v-model="customVoice" class="hm-input w-full" rows="6"
            placeholder="Define communication style — tone, formatting, constraints. Use one rule per line starting with -"></textarea>
          </label>
        </div>
      </div>

      <!-- Preview -->
      <div class="hm-card">
        <h3 class="text-sm font-medium mb-2">Preview</h3>
        <div class="bg-gray-900 rounded-lg p-4 text-sm space-y-3">
          <div>
            <span class="text-gray-500 text-xs uppercase tracking-wide">Name</span>
            <p class="text-gray-300 mt-1 font-semibold">{{ previewName }}</p>
          </div>
          <div>
            <span class="text-gray-500 text-xs uppercase tracking-wide">Identity</span>
            <p class="text-gray-300 mt-1 whitespace-pre-wrap">{{ previewIdentity }}</p>
          </div>
          <div>
            <span class="text-gray-500 text-xs uppercase tracking-wide">Voice</span>
            <p class="text-gray-300 mt-1 whitespace-pre-wrap">{{ previewVoice }}</p>
          </div>
        </div>
      </div>

      <!-- Save actions -->
      <div class="flex items-center gap-3 flex-wrap">
        <button @click="save" :disabled="saving" class="btn btn-primary">
          <span v-if="saving" class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
          {{ saving ? 'Saving...' : 'Save & Apply' }}
        </button>
        <button @click="showSavePreset = !showSavePreset" class="btn btn-ghost text-sm">
          {{ showSavePreset ? 'Cancel' : 'Save as preset...' }}
        </button>
        <span v-if="saved" class="text-green-400 text-sm">Applied successfully</span>
        <span v-if="error" class="text-red-400 text-sm">{{ error }}</span>
      </div>

      <!-- Save as preset form -->
      <div v-if="showSavePreset" class="hm-card">
        <label for="personality-new-preset" class="block text-sm font-medium mb-2">New preset name</label>
        <div class="flex items-center gap-2">
          <input id="personality-new-preset" v-model="newPresetName" class="hm-input max-w-xs" placeholder="e.g. incident-commander"
            @keyup.enter="saveAsPreset" />
          <button @click="saveAsPreset" :disabled="savingPreset || !newPresetName.trim()" class="btn btn-primary text-sm">
            {{ savingPreset ? 'Saving...' : 'Save preset' }}
          </button>
        </div>
        <p class="text-gray-500 text-xs mt-1">Saves the current preview as a reusable preset.</p>
      </div>
    </template>
  </div>
  `},kt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),sv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:qk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:c1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:ww,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Rw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Jw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:d1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:$k,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:kt("/operations","live")},{path:"/agents",redirect:kt("/operations","agents")},{path:"/loops",redirect:kt("/operations","loops")},{path:"/processes",redirect:kt("/operations","processes")},{path:"/schedules",redirect:kt("/operations","schedules")},{path:"/audit",redirect:kt("/history","audit")},{path:"/sessions",redirect:kt("/history","sessions")},{path:"/traces",redirect:kt("/history","traces")},{path:"/usage",redirect:kt("/history","usage")},{path:"/tools",redirect:kt("/capabilities","tools")},{path:"/skills",redirect:kt("/capabilities","skills")},{path:"/mcp",redirect:kt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:kt("/capabilities","knowledge")},{path:"/memory",redirect:kt("/capabilities","memory")},{path:"/learned",redirect:kt("/capabilities","learned")},{path:"/health",redirect:kt("/system","health")},{path:"/resources",redirect:kt("/system","resources")},{path:"/logs",redirect:kt("/system","logs")},{path:"/config",redirect:kt("/system","config")},{path:"/host-access",redirect:kt("/system","host-access")},{path:"/internals",redirect:kt("/system","internals")}],$i=rw({history:U_(),routes:sv});$i.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const u1={template:`
    <div class="login-shell" role="main">
      <div class="login-panel">
        <div class="login-brand" aria-hidden="true"><odin-icon name="brand" :size="30" /></div>
        <p class="login-eyebrow">Operator console</p>
        <h1 id="login-title" class="login-title">Odin</h1>
        <p class="login-subtitle">Authenticate to manage the system.</p>
        <div v-if="error" class="mb-3 text-red-400 text-sm text-center" role="alert">{{ error }}</div>
        <div v-if="sessionExpired" class="mb-3 text-amber-400 text-sm text-center" role="alert">Session expired. Please log in again.</div>
        <form @submit.prevent="login" aria-labelledby="login-title">
          <label for="login-token" class="sr-only">API Token</label>
          <input
            id="login-token"
            v-model="token"
            type="password"
            placeholder="API Token"
            class="hm-input mb-3"
            autofocus
            autocomplete="current-password"
          />
          <label class="flex items-center gap-2 mb-3 text-sm text-gray-400 cursor-pointer select-none">
            <input type="checkbox" v-model="persist" class="rounded bg-gray-800 border-gray-600" />
            Stay logged in
          </label>
          <button type="submit" class="btn btn-primary w-full justify-center" :disabled="busy">
            <span v-if="busy" class="spinner" style="width:14px;height:14px;border-width:2px;" aria-hidden="true"></span>
            {{ busy ? 'Connecting...' : 'Connect' }}
          </button>
        </form>
      </div>
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),n=f(!1),a=f(!1);async function i(){n.value=!0,s.value=null;try{W.setPersist(a.value),await W.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},p1={template:`
    <div v-if="authState === 'checking'" class="app-loading" role="status" aria-label="Loading">
      <div class="brand-loader"><odin-icon name="brand" :size="28" /></div>
      <span class="sr-only">Loading application...</span>
    </div>
    <login-screen v-else-if="authState === 'login'" :on-login="onLogin" :session-expired="sessionExpired" />
    <div v-else class="app-shell">
      <aside ref="sidebarEl" class="hm-sidebar" :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }"
             :role="isMobileViewport && mobileOpen ? 'dialog' : undefined"
             :aria-modal="isMobileViewport && mobileOpen ? 'true' : undefined"
             :aria-hidden="isMobileViewport && !mobileOpen ? 'true' : undefined"
             :inert="isMobileViewport && !mobileOpen" aria-label="Primary navigation">
        <div class="sidebar-brand">
          <div class="brand-mark" aria-hidden="true"><odin-icon name="brand" :size="24" /></div>
          <div class="sidebar-brand-copy">
            <span class="brand-wordmark">ODIN</span>
            <span class="brand-caption">Management</span>
          </div>
          <button @click="toggleSidebar" class="icon-btn sidebar-toggle-btn"
                  :aria-expanded="!sidebarCollapsed" aria-controls="sidebar-nav"
                  :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
            <odin-icon :name="sidebarCollapsed ? 'chevronRight' : 'chevronLeft'" :size="17" />
          </button>
        </div>
        <nav id="sidebar-nav" class="sidebar-nav" aria-label="Page navigation">
          <div v-for="group in navGroups" :key="group.name" class="nav-group">
            <div class="nav-section-label">{{ group.name }}</div>
            <router-link
              v-for="r in group.routes"
              :key="r.path"
              :to="r.path"
              class="nav-item"
              active-class="active"
              :aria-current="$route.path === r.path ? 'page' : undefined"
              :title="sidebarCollapsed ? r.meta.label : undefined"
              @click="mobileOpen = false"
            >
              <span class="nav-icon" aria-hidden="true"><odin-icon :name="r.meta.icon" :size="18" /></span>
              <span class="nav-label">{{ r.meta.label }}</span>
            </router-link>
          </div>
        </nav>
        <div class="sidebar-footer">
          <div class="connection-card" :class="'connection-' + wsState" aria-live="polite">
            <span class="ws-indicator" :class="'ws-' + wsState" aria-hidden="true"></span>
            <div class="connection-copy">
              <span class="connection-label">{{ wsLabel }}</span>
              <span v-if="wsLatency >= 0" class="connection-latency">{{ wsLatency }}ms</span>
            </div>
          </div>
          <button class="shortcut-hint" @click="openPalette" aria-label="Open command palette">
            <odin-icon name="command" :size="14" />
            <span>Quick jump</span><kbd>Ctrl K</kbd>
          </button>
        </div>
      </aside>

      <!-- Outside the aside on purpose: the mobile sidebar is translated
           off-canvas, and a transformed ancestor becomes the containing
           block for position:fixed — a toast mounted inside it renders
           off-screen with the rail (audit 4.1). -->
      <transition name="ws-toast">
        <div v-if="wsToast" class="ws-toast" :class="'ws-toast-' + wsToast.level" role="status" aria-live="assertive">
          {{ wsToast.text }}
        </div>
      </transition>

      <div v-if="mobileOpen" class="mobile-scrim" @click="mobileOpen = false" aria-hidden="true"></div>

      <main id="main-content" class="hm-main" role="main" :inert="isMobileViewport && mobileOpen">
        <header class="hm-topbar" role="banner">
          <button ref="mobileMenuButton" class="icon-btn mobile-menu-btn" @click="toggleMobileNavigation"
                  :aria-expanded="mobileOpen" aria-controls="sidebar-nav"
                  :aria-label="mobileOpen ? 'Close navigation menu' : 'Open navigation menu'">
            <odin-icon name="menu" :size="20" />
          </button>
          <div class="topbar-context">
            <span class="topbar-kicker">{{ currentSection }}</span>
            <div class="topbar-title-row">
              <h1>{{ currentPage }}</h1>
              <span class="status-pill" :class="'status-' + botStatus">
                <span class="status-dot" :class="botStatus" aria-hidden="true"></span>
                {{ botStatus }}
              </span>
            </div>
          </div>
          <p class="topbar-description">{{ currentDescription }}</p>
          <div class="topbar-actions">
            <span v-if="botUptime" class="uptime-label" aria-label="Uptime">{{ botUptime }}</span>
            <button class="command-trigger" @click="openPalette" aria-label="Open command palette">
              <odin-icon name="search" :size="15" />
              <span>Jump to</span><kbd>Ctrl K</kbd>
            </button>
            <button @click="logout" class="icon-btn" aria-label="Log out" title="Log out">
              <odin-icon name="logout" :size="17" />
            </button>
          </div>
        </header>
        <div class="page-viewport"><router-view /></div>
      </main>
    </div>
    <toast-container />
    <confirm-host />
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),n=f(!1),a=f(null),i=f(null),l=f(!1);let r=null,o=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),C=sv.filter(U=>U.meta),L=J(()=>["Workspace","Operate","Observe","Manage"].map(U=>({name:U,routes:C.filter(K=>K.meta.section===U)})).filter(U=>U.routes.length)),y=J(()=>{var U;return((U=$i.currentRoute.value.meta)==null?void 0:U.label)||"Odin"}),g=J(()=>{var U;return((U=$i.currentRoute.value.meta)==null?void 0:U.section)||"Management"}),b=J(()=>{var U;return((U=$i.currentRoute.value.meta)==null?void 0:U.description)||"Management console"});function S(){Ye.disconnect(),V&&(clearInterval(V),V=null)}W.onSessionExpired=()=>{t.value=!0,S(),W.setToken(""),e.value="login"};function k(U){var K;if((U.ctrlKey||U.metaKey)&&U.key.toLowerCase()==="k"){e.value==="ready"&&(U.preventDefault(),Yu());return}if(n.value&&U.key==="Tab"){const q=[...((K=a.value)==null?void 0:K.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(q.length){const Q=q[0],ie=q[q.length-1];if(U.shiftKey&&(document.activeElement===Q||!a.value.contains(document.activeElement))){U.preventDefault(),ie.focus();return}if(!U.shiftKey&&(document.activeElement===ie||!a.value.contains(document.activeElement))){U.preventDefault(),Q.focus();return}}}if(U.key==="Escape"&&n.value){n.value=!1,U.preventDefault();return}if(U.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(U.target.tagName)){U.preventDefault();const q=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');q&&q.focus()}}function A(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}We(async()=>{document.addEventListener("keydown",k),r=window.matchMedia("(max-width: 900px)"),A(),r.addEventListener("change",A);const U=await W.check();U.ok?(e.value="ready",N()):U.needsAuth?e.value="login":(e.value="ready",N())});function T(){t.value=!1,e.value="ready",N()}async function _(){S(),e.value="login",await W.logout()}function D(){s.value=!s.value}function E(){n.value=!n.value}os(n,async U=>{var K,q;if(U)o=document.activeElement,await Et(),(q=(K=a.value)==null?void 0:K.querySelector(".nav-item"))==null||q.focus();else if(o!=null&&o.isConnected){const Q=o;o=null,requestAnimationFrame(()=>Q.focus())}});const R=J(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function $(U,K="info",q=3e3){p.value={text:U,level:K},clearTimeout(h),h=setTimeout(()=>{p.value=null},q)}let V=null,oe=!1,P=[];function N(){for(const U of P)U();P=[Ye.onStatus(U=>{c.value=U}),Ye.onLatencyChange(U=>{u.value=U}),Ye.onState((U,K)=>{d.value=U,U==="connected"?(oe&&$("Connection restored","success"),oe=!0):U==="reconnecting"&&K.attempt===1&&$("Connection lost — reconnecting…","warn")})],Ye.connect(),O(),V&&clearInterval(V),V=setInterval(O,15e3)}async function O(){try{const U=await W.get("/api/status");m.value=U.status==="online"?"online":"starting";const K=U.uptime_seconds||0,q=Math.floor(K/3600),Q=Math.floor(K%3600/60);v.value=`${q}h ${Q}m uptime`}catch{m.value="offline",v.value=""}}return mt(()=>{V&&clearInterval(V);for(const U of P)U();P=[],Ye.disconnect(),document.removeEventListener("keydown",k),r==null||r.removeEventListener("change",A)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:R,wsToast:p,botStatus:m,botUptime:v,navRoutes:C,navGroups:L,currentPage:y,currentSection:g,currentDescription:b,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:T,logout:_,toggleSidebar:D,toggleMobileNavigation:E,openPalette:Yu}}},Zn=sr(p1);Zn.component("odin-icon",zk);Zn.component("login-screen",u1);Zn.component("toast-container",X0);Zn.component("confirm-host",e_);Zn.component("command-palette",Hk);Zn.directive("modal-focus",Vk);Zn.use($i);Zn.mount("#app");
