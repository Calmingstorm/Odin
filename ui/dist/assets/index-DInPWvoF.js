var _v=Object.defineProperty;var wv=(e,t,s)=>t in e?_v(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ft=(e,t,s)=>wv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class kv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new xl("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new Id(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new xl("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new Id((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new xl((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof xl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class xl extends Error{constructor(t){super(t),this.name="AuthError"}}class Id extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Sv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)a.send(JSON.stringify({subscribe:o}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(a,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const G=new kv,Ye=new Sv(G);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Is(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ge={},Va=[],Jt=()=>{},za=()=>!1,Sa=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),So=e=>e.startsWith("onUpdate:"),qe=Object.assign,gc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Tv=Object.prototype.hasOwnProperty,nt=(e,t)=>Tv.call(e,t),Ce=Array.isArray,qa=e=>pi(e)==="[object Map]",Ta=e=>pi(e)==="[object Set]",Od=e=>pi(e)==="[object Date]",Cv=e=>pi(e)==="[object RegExp]",Me=e=>typeof e=="function",Be=e=>typeof e=="string",is=e=>typeof e=="symbol",tt=e=>e!==null&&typeof e=="object",bc=e=>(tt(e)||Me(e))&&Me(e.then)&&Me(e.catch),$p=Object.prototype.toString,pi=e=>$p.call(e),Ev=e=>pi(e).slice(8,-1),To=e=>pi(e)==="[object Object]",Co=e=>Be(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Cn=Is(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Av=Is("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Eo=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Rv=/-\w/g,pt=Eo(e=>e.replace(Rv,t=>t.slice(1).toUpperCase())),Iv=/\B([A-Z])/g,xs=Eo(e=>e.replace(Iv,"-$1").toLowerCase()),Ca=Eo(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ga=Eo(e=>e?`on${Ca(e)}`:""),jt=(e,t)=>!Object.is(e,t),Ka=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Bp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Ao=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Gl=e=>{const t=Be(e)?Number(e):NaN;return isNaN(t)?e:t};let Ld;const Ro=()=>Ld||(Ld=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Ov(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Lv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Nv=Is(Lv);function cl(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Be(n)?Up(n):cl(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Be(e)||tt(e))return e}const Dv=/;(?![^(]*\))/g,Mv=/:([^]+)/,Pv=/\/\*[^]*?\*\//g;function Up(e){const t={};return e.replace(Pv,"").split(Dv).forEach(s=>{if(s){const n=s.split(Mv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function dl(e){let t="";if(Be(e))t=e;else if(Ce(e))for(let s=0;s<e.length;s++){const n=dl(e[s]);n&&(t+=n+" ")}else if(tt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Fv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Be(t)&&(e.class=dl(t)),s&&(e.style=cl(s)),e}const $v="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Bv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Uv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Hv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",zv=Is($v),jv=Is(Bv),Vv=Is(Uv),qv=Is(Hv),Gv="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Kv=Is(Gv);function Hp(e){return!!e||e===""}function Wv(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=In(e[n],t[n]);return s}function In(e,t){if(e===t)return!0;let s=Od(e),n=Od(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=is(e),n=is(t),s||n)return e===t;if(s=Ce(e),n=Ce(t),s||n)return s&&n?Wv(e,t):!1;if(s=tt(e),n=tt(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!In(e[l],t[l]))return!1}}return String(e)===String(t)}function Io(e,t){return e.findIndex(s=>In(s,t))}const zp=e=>!!(e&&e.__v_isRef===!0),jp=e=>Be(e)?e:e==null?"":Ce(e)||tt(e)&&(e.toString===$p||!Me(e.toString))?zp(e)?jp(e.value):JSON.stringify(e,Vp,2):String(e),Vp=(e,t)=>zp(t)?Vp(e,t.value):qa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[tr(n,i)+" =>"]=a,s),{})}:Ta(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>tr(s))}:is(t)?tr(t):tt(t)&&!Ce(t)&&!To(t)?String(t):t,tr=(e,t="")=>{var s;return is(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Zv(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Bt;class yc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Bt&&(Bt.active?(this.parent=Bt,this.index=(Bt.scopes||(Bt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Bt;try{return Bt=this,t()}finally{Bt=s}}}on(){++this._on===1&&(this.prevScope=Bt,Bt=this)}off(){if(this._on>0&&--this._on===0){if(Bt===this)Bt=this.prevScope;else{let t=Bt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Jv(e){return new yc(e)}function qp(){return Bt}function Yv(e,t=!1){Bt&&Bt.cleanups.push(e)}let ht;const sr=new WeakSet;class ji{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Bt&&(Bt.active?Bt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,sr.has(this)&&(sr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Kp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Nd(this),Wp(this);const t=ht,s=qs;ht=this,qs=!0;try{return this.fn()}finally{Zp(this),ht=t,qs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)wc(t);this.deps=this.depsTail=void 0,Nd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?sr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Lr(this)&&this.run()}get dirty(){return Lr(this)}}let Gp=0,Li,Ni;function Kp(e,t=!1){if(e.flags|=8,t){e.next=Ni,Ni=e;return}e.next=Li,Li=e}function xc(){Gp++}function _c(){if(--Gp>0)return;if(Ni){let t=Ni;for(Ni=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Li;){let t=Li;for(Li=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Wp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Zp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),wc(n),Qv(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Lr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Jp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Jp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Vi)||(e.globalVersion=Vi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Lr(e))))return;e.flags|=2;const t=e.dep,s=ht,n=qs;ht=e,qs=!0;try{Wp(e);const a=e.fn(e._value);(t.version===0||jt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ht=s,qs=n,Zp(e),e.flags&=-3}}function wc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)wc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Qv(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Xv(e,t){e.effect instanceof ji&&(e=e.effect.fn);const s=new ji(e);t&&qe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function eg(e){e.effect.stop()}let qs=!0;const Yp=[];function On(){Yp.push(qs),qs=!1}function Ln(){const e=Yp.pop();qs=e===void 0?!0:e}function Nd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ht;ht=void 0;try{t()}finally{ht=s}}}let Vi=0;class tg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Oo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ht||!qs||ht===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ht)s=this.activeLink=new tg(ht,this),ht.deps?(s.prevDep=ht.depsTail,ht.depsTail.nextDep=s,ht.depsTail=s):ht.deps=ht.depsTail=s,Qp(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ht.depsTail,s.nextDep=void 0,ht.depsTail.nextDep=s,ht.depsTail=s,ht.deps===s&&(ht.deps=n)}return s}trigger(t){this.version++,Vi++,this.notify(t)}notify(t){xc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{_c()}}}function Qp(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Qp(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Kl=new WeakMap,ma=Symbol(""),Nr=Symbol(""),qi=Symbol("");function ss(e,t,s){if(qs&&ht){let n=Kl.get(e);n||Kl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Oo),a.map=n,a.key=s),a.track()}}function _n(e,t,s,n,a,i){const l=Kl.get(e);if(!l){Vi++;return}const o=r=>{r&&r.trigger()};if(xc(),t==="clear")l.forEach(o);else{const r=Ce(e),c=r&&Co(s);if(r&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===qi||!is(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(qi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(ma)),qa(e)&&o(l.get(Nr)));break;case"delete":r||(o(l.get(ma)),qa(e)&&o(l.get(Nr)));break;case"set":qa(e)&&o(l.get(ma));break}}_c()}function sg(e,t){const s=Kl.get(e);return s&&s.get(t)}function La(e){const t=Je(e);return t===e?t:(ss(t,"iterate",qi),ws(e)?t:t.map(Ks))}function Lo(e){return ss(e=Je(e),"iterate",qi),e}function an(e,t){return on(e)?ei(En(e)?Ks(t):t):Ks(t)}const ng={__proto__:null,[Symbol.iterator](){return nr(this,Symbol.iterator,e=>an(this,e))},concat(...e){return La(this).concat(...e.map(t=>Ce(t)?La(t):t))},entries(){return nr(this,"entries",e=>(e[1]=an(this,e[1]),e))},every(e,t){return fn(this,"every",e,t,void 0,arguments)},filter(e,t){return fn(this,"filter",e,t,s=>s.map(n=>an(this,n)),arguments)},find(e,t){return fn(this,"find",e,t,s=>an(this,s),arguments)},findIndex(e,t){return fn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return fn(this,"findLast",e,t,s=>an(this,s),arguments)},findLastIndex(e,t){return fn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return fn(this,"forEach",e,t,void 0,arguments)},includes(...e){return ar(this,"includes",e)},indexOf(...e){return ar(this,"indexOf",e)},join(e){return La(this).join(e)},lastIndexOf(...e){return ar(this,"lastIndexOf",e)},map(e,t){return fn(this,"map",e,t,void 0,arguments)},pop(){return gi(this,"pop")},push(...e){return gi(this,"push",e)},reduce(e,...t){return Dd(this,"reduce",e,t)},reduceRight(e,...t){return Dd(this,"reduceRight",e,t)},shift(){return gi(this,"shift")},some(e,t){return fn(this,"some",e,t,void 0,arguments)},splice(...e){return gi(this,"splice",e)},toReversed(){return La(this).toReversed()},toSorted(e){return La(this).toSorted(e)},toSpliced(...e){return La(this).toSpliced(...e)},unshift(...e){return gi(this,"unshift",e)},values(){return nr(this,"values",e=>an(this,e))}};function nr(e,t,s){const n=Lo(e),a=n[t]();return n!==e&&!ws(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const ag=Array.prototype;function fn(e,t,s,n,a,i){const l=Lo(e),o=l!==e&&!ws(e),r=l[t];if(r!==ag[t]){const u=r.apply(e,i);return o?Ks(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,an(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,n);return o&&a?a(d):d}function Dd(e,t,s,n){const a=Lo(e),i=a!==e&&!ws(e);let l=s,o=!1;a!==e&&(i?(o=n.length===0,l=function(c,d,u){return o&&(o=!1,c=an(e,c)),s.call(this,c,an(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=a[t](l,...n);return o?an(e,r):r}function ar(e,t,s){const n=Je(e);ss(n,"iterate",qi);const a=n[t](...s);return(a===-1||a===!1)&&ul(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function gi(e,t,s=[]){On(),xc();const n=Je(e)[t].apply(e,s);return _c(),Ln(),n}const ig=Is("__proto__,__v_isRef,__isVue"),Xp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(is));function lg(e){is(e)||(e=String(e));const t=Je(this);return ss(t,"has",e),t.hasOwnProperty(e)}class ef{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?of:lf:i?af:nf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ce(t);if(!a){let r;if(l&&(r=ng[s]))return r;if(s==="hasOwnProperty")return lg}const o=Reflect.get(t,s,Dt(t)?t:n);if((is(s)?Xp.has(s):ig(s))||(a||ss(t,"get",s),i))return o;if(Dt(o)){const r=l&&Co(s)?o:o.value;return a&&tt(r)?Wl(r):r}return tt(o)?a?Wl(o):ea(o):o}}class tf extends ef{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ce(t)&&Co(s);if(!this._isShallow){const c=on(i);if(!ws(n)&&!on(n)&&(i=Je(i),n=Je(n)),!l&&Dt(i)&&!Dt(n))return c||(i.value=n),!0}const o=l?Number(s)<t.length:nt(t,s),r=Reflect.set(t,s,n,Dt(t)?t:a);return t===Je(a)&&(o?jt(n,i)&&_n(t,"set",s,n):_n(t,"add",s,n)),r}deleteProperty(t,s){const n=nt(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&_n(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!is(s)||!Xp.has(s))&&ss(t,"has",s),n}ownKeys(t){return ss(t,"iterate",Ce(t)?"length":ma),Reflect.ownKeys(t)}}class sf extends ef{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const og=new tf,rg=new sf,cg=new tf(!0),dg=new sf(!0),Dr=e=>e,_l=e=>Reflect.getPrototypeOf(e);function ug(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=qa(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=a[e](...n),d=s?Dr:t?ei:Ks;return!t&&ss(i,"iterate",r?Nr:ma),qe(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function wl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function pg(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),o=Je(a);e||(jt(a,o)&&ss(l,"get",a),ss(l,"get",o));const{has:r}=_l(l),c=t?Dr:e?ei:Ks;if(r.call(l,a))return c(i.get(a));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&ss(Je(a),"iterate",ma),a.size},has(a){const i=this.__v_raw,l=Je(i),o=Je(a);return e||(jt(a,o)&&ss(l,"has",a),ss(l,"has",o)),a===o?i.has(a):i.has(a)||i.has(o)},forEach(a,i){const l=this,o=l.__v_raw,r=Je(o),c=t?Dr:e?ei:Ks;return!e&&ss(r,"iterate",ma),o.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return qe(s,e?{add:wl("add"),set:wl("set"),delete:wl("delete"),clear:wl("clear")}:{add(a){const i=Je(this),l=_l(i),o=Je(a),r=!t&&!ws(a)&&!on(a)?o:a;return l.has.call(i,r)||jt(a,r)&&l.has.call(i,a)||jt(o,r)&&l.has.call(i,o)||(i.add(r),_n(i,"add",r,r)),this},set(a,i){!t&&!ws(i)&&!on(i)&&(i=Je(i));const l=Je(this),{has:o,get:r}=_l(l);let c=o.call(l,a);c||(a=Je(a),c=o.call(l,a));const d=r.call(l,a);return l.set(a,i),c?jt(i,d)&&_n(l,"set",a,i):_n(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:o}=_l(i);let r=l.call(i,a);r||(a=Je(a),r=l.call(i,a)),o&&o.call(i,a);const c=i.delete(a);return r&&_n(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&_n(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=ug(a,e,t)}),s}function No(e,t){const s=pg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(nt(s,a)&&a in n?s:n,a,i)}const fg={get:No(!1,!1)},hg={get:No(!1,!0)},mg={get:No(!0,!1)},vg={get:No(!0,!0)},nf=new WeakMap,af=new WeakMap,lf=new WeakMap,of=new WeakMap;function gg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function ea(e){return on(e)?e:Do(e,!1,og,fg,nf)}function kc(e){return Do(e,!1,cg,hg,af)}function Wl(e){return Do(e,!0,rg,mg,lf)}function bg(e){return Do(e,!0,dg,vg,of)}function Do(e,t,s,n,a){if(!tt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=gg(Ev(e));if(l===0)return e;const o=new Proxy(e,l===2?n:s);return a.set(e,o),o}function En(e){return on(e)?En(e.__v_raw):!!(e&&e.__v_isReactive)}function on(e){return!!(e&&e.__v_isReadonly)}function ws(e){return!!(e&&e.__v_isShallow)}function ul(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function rf(e){return!nt(e,"__v_skip")&&Object.isExtensible(e)&&Bp(e,"__v_skip",!0),e}const Ks=e=>tt(e)?ea(e):e,ei=e=>tt(e)?Wl(e):e;function Dt(e){return e?e.__v_isRef===!0:!1}function h(e){return cf(e,!1)}function Sc(e){return cf(e,!0)}function cf(e,t){return Dt(e)?e:new yg(e,t)}class yg{constructor(t,s){this.dep=new Oo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:Ks(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ws(t)||on(t);t=n?t:Je(t),jt(t,s)&&(this._rawValue=t,this._value=n?t:Ks(t),this.dep.trigger())}}function xg(e){e.dep&&e.dep.trigger()}function ln(e){return Dt(e)?e.value:e}function _g(e){return Me(e)?e():ln(e)}const wg={get:(e,t,s)=>t==="__v_raw"?e:ln(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Dt(a)&&!Dt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Tc(e){return En(e)?e:new Proxy(e,wg)}class kg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Oo,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function df(e){return new kg(e)}function Sg(e){const t=Ce(e)?new Array(e.length):{};for(const s in e)t[s]=uf(e,s);return t}class Tg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=is(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!Ce(t)||is(this._key)||!Co(this._key))do a=!ul(i)||ws(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=ln(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Dt(this._raw[this._key])){const s=this._object[this._key];if(Dt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return sg(this._raw,this._key)}}class Cg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Eg(e,t,s){return Dt(e)?e:Me(e)?new Cg(e):tt(e)&&arguments.length>1?uf(e,t,s):h(e)}function uf(e,t,s){return new Tg(e,t,s)}class Ag{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Oo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Vi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ht!==this)return Kp(this,!0),!0}get value(){const t=this.dep.track();return Jp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Rg(e,t,s=!1){let n,a;return Me(e)?n=e:(n=e.get,a=e.set),new Ag(n,a,s)}const Ig={GET:"get",HAS:"has",ITERATE:"iterate"},Og={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},kl={},Zl=new WeakMap;let Kn;function Lg(){return Kn}function pf(e,t=!1,s=Kn){if(s){let n=Zl.get(s);n||Zl.set(s,n=[]),n.push(e)}}function Ng(e,t,s=Ge){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>a?b:ws(b)||a===!1||a===0?wn(b,1):wn(b);let d,u,p,f,m=!1,v=!1;if(Dt(e)?(u=()=>e.value,m=ws(e)):En(e)?(u=()=>c(e),m=!0):Ce(e)?(v=!0,m=e.some(b=>En(b)||ws(b)),u=()=>e.map(b=>{if(Dt(b))return b.value;if(En(b))return c(b);if(Me(b))return r?r(b,2):b()})):Me(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){On();try{p()}finally{Ln()}}const b=Kn;Kn=d;try{return r?r(e,3,[f]):e(f)}finally{Kn=b}}:u=Jt,t&&a){const b=u,C=a===!0?1/0:a;u=()=>wn(b(),C)}const w=qp(),L=()=>{d.stop(),w&&w.active&&gc(w.effects,d)};if(i&&t){const b=t;t=(...C)=>{const S=b(...C);return L(),S}}let x=v?new Array(e.length).fill(kl):kl;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const C=d.run();if(b||a||m||(v?C.some((S,A)=>jt(S,x[A])):jt(C,x))){p&&p();const S=Kn;Kn=d;try{const A=[C,x===kl?void 0:v&&x[0]===kl?[]:x,f];x=C,r?r(t,3,A):t(...A)}finally{Kn=S}}}else d.run()};return o&&o(g),d=new ji(u),d.scheduler=l?()=>l(g,!1):g,f=b=>pf(b,!1,d),p=d.onStop=()=>{const b=Zl.get(d);if(b){if(r)r(b,4);else for(const C of b)C();Zl.delete(d)}},t?n?g(!0):x=d.run():l?l(g.bind(null,!0),!0):d.run(),L.pause=d.pause.bind(d),L.resume=d.resume.bind(d),L.stop=L,L}function wn(e,t=1/0,s){if(t<=0||!tt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Dt(e))wn(e.value,t,s);else if(Ce(e))for(let n=0;n<e.length;n++)wn(e[n],t,s);else if(Ta(e)||qa(e))e.forEach(n=>{wn(n,t,s)});else if(To(e)){for(const n in e)wn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&wn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ff=[];function Dg(e){ff.push(e)}function Mg(){ff.pop()}function Pg(e,t){}const Fg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},$g={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function fi(e,t,s,n){try{return n?e(...n):e()}catch(a){Ea(a,t,s)}}function Rs(e,t,s,n){if(Me(e)){const a=fi(e,t,s,n);return a&&bc(a)&&a.catch(i=>{Ea(i,t,s)}),a}if(Ce(e)){const a=[];for(let i=0;i<e.length;i++)a.push(Rs(e[i],t,s,n));return a}}function Ea(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ge;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){On(),fi(i,null,10,[e,r,c]),Ln();return}}Bg(e,s,a,n,l)}function Bg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const us=[];let sn=-1;const Wa=[];let Wn=null,$a=0;const hf=Promise.resolve();let Jl=null;function Rt(e){const t=Jl||hf;return e?t.then(this?e.bind(this):e):t}function Ug(e){let t=sn+1,s=us.length;for(;t<s;){const n=t+s>>>1,a=us[n],i=Ki(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Cc(e){if(!(e.flags&1)){const t=Ki(e),s=us[us.length-1];!s||!(e.flags&2)&&t>=Ki(s)?us.push(e):us.splice(Ug(t),0,e),e.flags|=1,mf()}}function mf(){Jl||(Jl=hf.then(vf))}function Gi(e){Ce(e)?Wa.push(...e):Wn&&e.id===-1?Wn.splice($a+1,0,e):e.flags&1||(Wa.push(e),e.flags|=1),mf()}function Md(e,t,s=sn+1){for(;s<us.length;s++){const n=us[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;us.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Yl(e){if(Wa.length){const t=[...new Set(Wa)].sort((s,n)=>Ki(s)-Ki(n));if(Wa.length=0,Wn){Wn.push(...t);return}for(Wn=t,$a=0;$a<Wn.length;$a++){const s=Wn[$a];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Wn=null,$a=0}}const Ki=e=>e.id==null?e.flags&2?-1:1/0:e.id;function vf(e){try{for(sn=0;sn<us.length;sn++){const t=us[sn];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),fi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;sn<us.length;sn++){const t=us[sn];t&&(t.flags&=-2)}sn=-1,us.length=0,Yl(),Jl=null,(us.length||Wa.length)&&vf()}}let Ba,Sl=[];function gf(e,t){var s,n;Ba=e,Ba?(Ba.enabled=!0,Sl.forEach(({event:a,args:i})=>Ba.emit(a,...i)),Sl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{gf(i,t)}),setTimeout(()=>{Ba||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Sl=[])},3e3)):Sl=[]}let Zt=null,Mo=null;function Wi(e){const t=Zt;return Zt=e,Mo=e&&e.type.__scopeId||null,t}function Hg(e){Mo=e}function zg(){Mo=null}const jg=e=>Ec;function Ec(e,t=Zt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Qi(-1);const i=Wi(t);let l;try{l=e(...a)}finally{Wi(i),n._d&&Qi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Vg(e,t){if(Zt===null)return e;const s=ml(Zt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,o,r=Ge]=t[a];i&&(Me(i)&&(i={mounted:i,updated:i}),i.deep&&wn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function nn(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const o=a[l];i&&(o.oldValue=i[l].value);let r=o.dir[n];r&&(On(),Rs(r,s,8,[e.el,o,e,t]),Ln())}}function Di(e,t){if(Wt){let s=Wt.provides;const n=Wt.parent&&Wt.parent.provides;n===s&&(s=Wt.provides=Object.create(n)),s[e]=t}}function Us(e,t,s=!1){const n=fs();if(n||va){let a=va?va._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Me(t)?t.call(n&&n.proxy):t}}function qg(){return!!(fs()||va)}const bf=Symbol.for("v-scx"),yf=()=>Us(bf);function Gg(e,t){return pl(e,null,t)}function Kg(e,t){return pl(e,null,{flush:"post"})}function xf(e,t){return pl(e,null,{flush:"sync"})}function Mt(e,t,s){return pl(e,t,s)}function pl(e,t,s=Ge){const{immediate:n,deep:a,flush:i,once:l}=s,o=qe({},s),r=t&&n||!t&&i!=="post";let c;if(_a){if(i==="sync"){const f=yf();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!r){const f=()=>{};return f.stop=Jt,f.resume=Jt,f.pause=Jt,f}}const d=Wt;o.call=(f,m,v)=>Rs(f,d,m,v);let u=!1;i==="post"?o.scheduler=f=>{Lt(f,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(f,m)=>{m?f():Cc(f)}),o.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=Ng(e,t,o);return _a&&(c?c.push(p):r&&p()),p}function Wg(e,t,s){const n=this.proxy,a=Be(e)?e.includes(".")?_f(n,e):()=>n[e]:e.bind(n,n);let i;Me(t)?i=t:(i=t.handler,s=t);const l=hi(this),o=pl(a,i.bind(n),s);return l(),o}function _f(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const qn=new WeakMap,wf=Symbol("_vte"),kf=e=>e.__isTeleport,da=e=>e&&(e.disabled||e.disabled===""),Zg=e=>e&&(e.defer||e.defer===""),Pd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Fd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Mr=(e,t)=>{const s=e&&e.to;return Be(s)?t?t(s):null:s},Jg={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:m,createText:v,createComment:w,parentNode:L}}=c,x=da(t.props);let{dynamicChildren:g}=t;const b=(A,T,y)=>{A.shapeFlag&16&&d(A.children,T,y,a,i,l,o,r)},C=(A=t)=>{const T=da(A.props),y=A.target=Mr(A.props,m),O=Pr(y,A,v,f);y&&(l!=="svg"&&Pd(y)?l="svg":l!=="mathml"&&Fd(y)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(y),T||(b(A,y,O),Ei(A,!1)))},S=A=>{const T=()=>{if(qn.get(A)===T){if(qn.delete(A),da(A.props)){const y=L(A.el)||s;b(A,y,A.anchor),Ei(A,!0)}C(A)}};qn.set(A,T),Lt(T,i)};if(e==null){const A=t.el=v(""),T=t.anchor=v("");if(f(A,s,n),f(T,s,n),Zg(t.props)||i&&i.pendingBranch){S(t);return}x&&(b(t,s,T),Ei(t,!0)),C()}else{t.el=e.el;const A=t.anchor=e.anchor,T=qn.get(e);if(T){T.flags|=8,qn.delete(e),S(t);return}t.targetStart=e.targetStart;const y=t.target=e.target,O=t.targetAnchor=e.targetAnchor,$=da(e.props),k=$?s:y,M=$?A:O;if(l==="svg"||Pd(y)?l="svg":(l==="mathml"||Fd(y))&&(l="mathml"),g?(p(e.dynamicChildren,g,k,a,i,l,o),$c(e,t,!0)):r||u(e,t,k,M,a,i,l,o,!1),x)$?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Tl(t,s,A,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const j=t.target=Mr(t.props,m);j&&Tl(t,j,null,c,0)}else $&&Tl(t,y,O,c,1);Ei(t,x)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!da(p),m=qn.get(e);if(m&&(m.flags|=8,qn.delete(e)),u&&(a(c),a(d)),i&&a(r),!m&&l&16)for(let v=0;v<o.length;v++){const w=o[v];n(w,t,s,f,!!w.dynamicChildren)}},move:Tl,hydrate:Yg};function Tl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!qn.has(e)&&(!u||da(d))&&r&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(o,t,s)}function Yg(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(w,L){let x=L;for(;x;){if(x&&x.nodeType===8){if(x.data==="teleport start anchor")t.targetStart=x;else if(x.data==="teleport anchor"){t.targetAnchor=x,w._lpa=t.targetAnchor&&l(t.targetAnchor);break}}x=l(x)}}function f(w,L){L.anchor=u(l(w),L,o(w),s,n,a,i)}const m=t.target=Mr(t.props,r),v=da(t.props);if(m){const w=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(f(e,t),p(m,w),t.targetAnchor||Pr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,w),t.targetAnchor||Pr(m,t,d,c),u(w&&l(w),t,m,s,n,a,i))),Ei(t,v)}else v&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Qg=Jg;function Ei(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Pr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[wf]=l,e&&(n(i,e,a),n(l,e,a)),l}const Ps=Symbol("_leaveCb"),bi=Symbol("_enterCb");function Ac(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ve(()=>{e.isMounted=!0}),Bo(()=>{e.isUnmounting=!0}),e}const Ms=[Function,Array],Rc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ms,onEnter:Ms,onAfterEnter:Ms,onEnterCancelled:Ms,onBeforeLeave:Ms,onLeave:Ms,onAfterLeave:Ms,onLeaveCancelled:Ms,onBeforeAppear:Ms,onAppear:Ms,onAfterAppear:Ms,onAppearCancelled:Ms},Sf=e=>{const t=e.subTree;return t.component?Sf(t.component):t},Xg={name:"BaseTransition",props:Rc,setup(e,{slots:t}){const s=fs(),n=Ac();return()=>{const a=t.default&&Po(t.default(),!0),i=a&&a.length?Tf(a):s.subTree?oh():void 0;if(!i)return;const l=Je(e),{mode:o}=l;if(n.isLeaving)return ir(i);const r=$d(i);if(!r)return ir(i);let c=ti(r,l,n,s,u=>c=u);r.type!==It&&Nn(r,c);let d=s.subTree&&$d(s.subTree);if(d&&d.type!==It&&!Vs(d,r)&&Sf(s).type!==It){let u=ti(d,l,n,s);if(Nn(d,u),o==="out-in"&&r.type!==It)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},ir(i);o==="in-out"&&r.type!==It?u.delayLeave=(p,f,m)=>{const v=Ef(n,d);v[String(d.key)]=d,p[Ps]=()=>{f(),p[Ps]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Tf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==It){t=s;break}}return t}const Cf=Xg;function Ef(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function ti(e,t,s,n,a){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:w,onAppear:L,onAfterAppear:x,onAppearCancelled:g}=t,b=String(e.key),C=Ef(s,e),S=(y,O)=>{y&&Rs(y,n,9,O)},A=(y,O)=>{const $=O[1];S(y,O),Ce(y)?y.every(k=>k.length<=1)&&$():y.length<=1&&$()},T={mode:l,persisted:o,beforeEnter(y){let O=r;if(!s.isMounted)if(i)O=w||r;else return;y[Ps]&&y[Ps](!0);const $=C[b];$&&Vs(e,$)&&$.el[Ps]&&$.el[Ps](),S(O,[y])},enter(y){if(C[b]===e)return;let O=c,$=d,k=u;if(!s.isMounted)if(i)O=L||c,$=x||d,k=g||u;else return;let M=!1;y[bi]=q=>{M||(M=!0,q?S(k,[y]):S($,[y]),T.delayedLeave&&T.delayedLeave(),y[bi]=void 0)};const j=y[bi].bind(null,!1);O?A(O,[y,j]):j()},leave(y,O){const $=String(e.key);if(y[bi]&&y[bi](!0),s.isUnmounting)return O();S(p,[y]);let k=!1;y[Ps]=j=>{k||(k=!0,O(),j?S(v,[y]):S(m,[y]),y[Ps]=void 0,C[$]===e&&delete C[$])};const M=y[Ps].bind(null,!1);C[$]=e,f?A(f,[y,M]):M()},clone(y){const O=ti(y,t,s,n,a);return a&&a(O),O}};return T}function ir(e){if(hl(e))return e=rn(e),e.children=null,e}function $d(e){if(!hl(e))return kf(e.type)&&e.children?Tf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Me(s.default))return s.default()}}function Nn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Nn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Po(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Vt?(l.patchFlag&128&&a++,n=n.concat(Po(l.children,t,o))):(t||l.type!==It)&&n.push(o!=null?rn(l,{key:o}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function fl(e,t){return Me(e)?qe({name:e.name},t,{setup:e}):e}function eb(){const e=fs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Ic(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function tb(e){const t=fs(),s=Sc(null);if(t){const a=t.refs===Ge?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Bd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Ql=new WeakMap;function Za(e,t,s,n,a=!1){if(Ce(e)){e.forEach((v,w)=>Za(v,t&&(Ce(t)?t[w]:t),s,n,a));return}if(An(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Za(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ml(n.component):n.el,l=a?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ge?o.refs={}:o.refs,u=o.setupState,p=Je(u),f=u===Ge?za:v=>Bd(d,v)?!1:nt(p,v),m=(v,w)=>!(w&&Bd(d,w));if(c!=null&&c!==r){if(Ud(t),Be(c))d[c]=null,f(c)&&(u[c]=null);else if(Dt(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Me(r))fi(r,o,12,[l,d]);else{const v=Be(r),w=Dt(r);if(v||w){const L=()=>{if(e.f){const x=v?f(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(a)Ce(x)&&gc(x,i);else if(Ce(x))x.includes(i)||x.push(i);else if(v)d[r]=[i],f(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,f(r)&&(u[r]=l)):w&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const x=()=>{L(),Ql.delete(e)};x.id=-1,Ql.set(e,x),Lt(x,s)}else Ud(e),L()}}}function Ud(e){const t=Ql.get(e);t&&(t.flags|=8,Ql.delete(e))}let Hd=!1;const Na=()=>{Hd||(console.error("Hydration completed but contains mismatches."),Hd=!0)},sb=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",nb=e=>e.namespaceURI.includes("MathML"),Cl=e=>{if(e.nodeType===1){if(sb(e))return"svg";if(nb(e))return"mathml"}},ja=e=>e.nodeType===8;function ab(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),Yl(),b._vnode=g;return}u(b.firstChild,g,null,null,null),Yl(),b._vnode=g},u=(g,b,C,S,A,T=!1)=>{T=T||!!b.dynamicChildren;const y=ja(g)&&g.data==="[",O=()=>v(g,b,C,S,A,y),{type:$,ref:k,shapeFlag:M,patchFlag:j}=b;let q=g.nodeType;b.el=g,j===-2&&(T=!1,b.dynamicChildren=null);let D=null;switch($){case Yn:q!==3?b.children===""?(r(b.el=a(""),l(g),g),D=g):D=O():(g.data!==b.children&&(Na(),g.data=b.children),D=i(g));break;case It:x(g)?(D=i(g),L(b.el=g.content.firstChild,g,C)):q!==8||y?D=O():D=i(g);break;case ga:if(y&&(g=i(g),q=g.nodeType),q===1||q===3){D=g;const R=!b.children.length;for(let I=0;I<b.staticCount;I++)R&&(b.children+=D.nodeType===1?D.outerHTML:D.data),I===b.staticCount-1&&(b.anchor=D),D=i(D);return y?i(D):D}else O();break;case Vt:y?D=m(g,b,C,S,A,T):D=O();break;default:if(M&1)(q!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!x(g)?D=O():D=p(g,b,C,S,A,T);else if(M&6){b.slotScopeIds=A;const R=l(g);if(y?D=w(g):ja(g)&&g.data==="teleport start"?D=w(g,g.data,"teleport end"):D=i(g),t(b,R,null,C,S,Cl(R),T),An(b)&&!b.type.__asyncResolved){let I;y?(I=xt(Vt),I.anchor=D?D.previousSibling:R.lastChild):I=g.nodeType===3?Uc(""):xt("div"),I.el=g,b.component.subTree=I}}else M&64?q!==8?D=O():D=b.type.hydrate(g,b,C,S,A,T,e,f):M&128&&(D=b.type.hydrate(g,b,C,S,Cl(l(g)),A,T,e,u))}return k!=null&&Za(k,null,S,b),D},p=(g,b,C,S,A,T)=>{T=T||!!b.dynamicChildren;const{type:y,props:O,patchFlag:$,shapeFlag:k,dirs:M,transition:j}=b,q=y==="input"||y==="option";if(q||$!==-1){M&&nn(b,null,C,"created");let D=!1;if(x(g)){D=Qf(null,j)&&C&&C.vnode.props&&C.vnode.props.appear;const I=g.content.firstChild;if(D){const U=I.getAttribute("class");U&&(I.$cls=U),j.beforeEnter(I)}L(I,g,C),b.el=g=I}if(k&16&&!(O&&(O.innerHTML||O.textContent))){let I=f(g.firstChild,b,g,C,S,A,T);for(I&&!El(g,1)&&Na();I;){const U=I;I=I.nextSibling,o(U)}}else if(k&8){let I=b.children;I[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(I=I.slice(1));const{textContent:U}=g;U!==I&&U!==I.replace(/\r\n|\r/g,`
`)&&(El(g,0)||Na(),g.textContent=b.children)}if(O){if(q||!T||$&48){const I=g.tagName.includes("-");for(const U in O)(q&&(U.endsWith("value")||U==="indeterminate")||Sa(U)&&!Cn(U)||U[0]==="."||I&&!Cn(U))&&n(g,U,null,O[U],void 0,C)}else if(O.onClick)n(g,"onClick",null,O.onClick,void 0,C);else if($&4&&En(O.style))for(const I in O.style)O.style[I]}let R;(R=O&&O.onVnodeBeforeMount)&&gs(R,C,b),M&&nn(b,null,C,"beforeMount"),((R=O&&O.onVnodeMounted)||M||D)&&sh(()=>{R&&gs(R,C,b),D&&j.enter(g),M&&nn(b,null,C,"mounted")},S)}return g.nextSibling},f=(g,b,C,S,A,T,y)=>{y=y||!!b.dynamicChildren;const O=b.children,$=O.length;let k=!1;for(let M=0;M<$;M++){const j=y?O[M]:O[M]=ys(O[M]),q=j.type===Yn;g?(q&&!y&&M+1<$&&ys(O[M+1]).type===Yn&&(r(a(g.data.slice(j.children.length)),C,i(g)),g.data=j.children),g=u(g,j,S,A,T,y)):q&&!j.children?r(j.el=a(""),C):(k||(k=!0,El(C,1)||Na()),s(null,j,C,null,S,A,Cl(C),T))}return g},m=(g,b,C,S,A,T)=>{const{slotScopeIds:y}=b;y&&(A=A?A.concat(y):y);const O=l(g),$=f(i(g),b,O,C,S,A,T);return $&&ja($)&&$.data==="]"?i(b.anchor=$):(Na(),r(b.anchor=c("]"),O,$),$)},v=(g,b,C,S,A,T)=>{if(El(g.parentElement,1)||Na(),b.el=null,T){const $=w(g);for(;;){const k=i(g);if(k&&k!==$)o(k);else break}}const y=i(g),O=l(g);return o(g),s(null,b,O,y,C,S,Cl(O),A),C&&(C.vnode.el=b.el,Ho(C,b.el)),y},w=(g,b="[",C="]")=>{let S=0;for(;g;)if(g=i(g),g&&ja(g)&&(g.data===b&&S++,g.data===C)){if(S===0)return i(g);S--}return g},L=(g,b,C)=>{const S=b.parentNode;S&&S.replaceChild(g,b);let A=C;for(;A;)A.vnode.el===b&&(A.vnode.el=A.subTree.el=g),A=A.parent},x=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const zd="data-allow-mismatch",ib={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function El(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(zd);)e=e.parentElement;const s=e&&e.getAttribute(zd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(ib[t])}}const lb=Ro().requestIdleCallback||(e=>setTimeout(e,1)),ob=Ro().cancelIdleCallback||(e=>clearTimeout(e)),rb=(e=1e4)=>t=>{const s=lb(t,{timeout:e});return()=>ob(s)};function cb(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const db=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(cb(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},ub=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},pb=(e=[])=>(t,s)=>{Be(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,a)})};return s(l=>{for(const o of e)l.addEventListener(o,a,{once:!0})}),i};function fb(e,t){if(ja(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(ja(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const An=e=>!!e.type.__asyncLoader;function hb(e){Me(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((w,L)=>{r(v,()=>w(p()),()=>L(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return fl({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(m,v,w){let L=!1;(v.bu||(v.bu=[])).push(()=>L=!0);const x=()=>{L||w()},g=i?()=>{const b=i(x,C=>fb(m,C));b&&(v.bum||(v.bum=[])).push(b)}:x;d?g():f().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Wt;if(Ic(m),d)return()=>Al(d,m);const v=C=>{c=null,Ea(C,m,13,!n)};if(o&&m.suspense||_a)return f().then(C=>()=>Al(C,m)).catch(C=>(v(C),()=>n?xt(n,{error:C}):null));const w=h(!1),L=h(),x=h(!!a);let g,b;return mt(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),a&&(b=setTimeout(()=>{m.isUnmounted||(x.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!w.value&&!L.value){const C=new Error(`Async component timed out after ${l}ms.`);v(C),L.value=C}},l)),f().then(()=>{m.isUnmounted||(w.value=!0,m.parent&&hl(m.parent.vnode)&&m.parent.update())}).catch(C=>{if(m.isUnmounted){c=null;return}v(C),L.value=C}),()=>{if(w.value&&d)return Al(d,m);if(L.value&&n)return xt(n,{error:L.value});if(s&&!x.value)return Al(s,m)}}})}function Al(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=xt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const hl=e=>e.type.__isKeepAlive,mb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=fs(),n=s.ctx;if(!n.renderer)return()=>{const x=t.default&&t.default();return x&&x.length===1?x[0]:x};const a=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(x,g,b,C,S)=>{const A=x.component;c(x,g,b,0,o),r(A.vnode,x,g,b,A,o,C,x.slotScopeIds,S),Lt(()=>{A.isDeactivated=!1,A.a&&Ka(A.a);const T=x.props&&x.props.onVnodeMounted;T&&gs(T,A.parent,x)},o)},n.deactivate=x=>{const g=x.component;eo(g.m),eo(g.a),c(x,p,null,1,o),Lt(()=>{g.da&&Ka(g.da);const b=x.props&&x.props.onVnodeUnmounted;b&&gs(b,g.parent,x),g.isDeactivated=!0},o)};function f(x){lr(x),d(x,s,o,!0)}function m(x){a.forEach((g,b)=>{const C=qr(An(g)?g.type.__asyncResolved||{}:g.type);C&&!x(C)&&v(b)})}function v(x){const g=a.get(x);g&&(!l||!Vs(g,l))?f(g):l&&lr(l),a.delete(x),i.delete(x)}Mt(()=>[e.include,e.exclude],([x,g])=>{x&&m(b=>Ai(x,b)),g&&m(b=>!Ai(g,b))},{flush:"post",deep:!0});let w=null;const L=()=>{w!=null&&(to(s.subTree.type)?Lt(()=>{a.set(w,Rl(s.subTree))},s.subTree.suspense):a.set(w,Rl(s.subTree)))};return Ve(L),$o(L),Bo(()=>{a.forEach(x=>{const{subTree:g,suspense:b}=s,C=Rl(g);if(x.type===C.type&&x.key===C.key){lr(C);const S=C.component.da;S&&Lt(S,b);return}f(x)})}),()=>{if(w=null,!t.default)return l=null;const x=t.default(),g=x[0];if(x.length>1)return l=null,x;if(!Dn(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=Rl(g);if(b.type===It)return l=null,b;const C=b.type,S=qr(An(b)?b.type.__asyncResolved||{}:C),{include:A,exclude:T,max:y}=e;if(A&&(!S||!Ai(A,S))||T&&S&&Ai(T,S))return b.shapeFlag&=-257,l=b,g;const O=b.key==null?C:b.key,$=a.get(O);return b.el&&(b=rn(b),g.shapeFlag&128&&(g.ssContent=b)),w=O,$?(b.el=$.el,b.component=$.component,b.transition&&Nn(b,b.transition),b.shapeFlag|=512,i.delete(O),i.add(O)):(i.add(O),y&&i.size>parseInt(y,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,to(g.type)?g:b}}},vb=mb;function Ai(e,t){return Ce(e)?e.some(s=>Ai(s,t)):Be(e)?e.split(",").includes(t):Cv(e)?(e.lastIndex=0,e.test(t)):!1}function ms(e,t){Af(e,"a",t)}function ls(e,t){Af(e,"da",t)}function Af(e,t,s=Wt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Fo(t,n,s),s){let a=s.parent;for(;a&&a.parent;)hl(a.parent.vnode)&&gb(n,t,s,a),a=a.parent}}function gb(e,t,s,n){const a=Fo(t,e,n,!0);mt(()=>{gc(n[t],a)},s)}function lr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Rl(e){return e.shapeFlag&128?e.ssContent:e}function Fo(e,t,s=Wt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{On();const o=hi(s),r=Rs(t,s,e,l);return o(),Ln(),r});return n?a.unshift(i):a.push(i),i}}const Mn=e=>(t,s=Wt)=>{(!_a||e==="sp")&&Fo(e,(...n)=>t(...n),s)},Rf=Mn("bm"),Ve=Mn("m"),Oc=Mn("bu"),$o=Mn("u"),Bo=Mn("bum"),mt=Mn("um"),If=Mn("sp"),Of=Mn("rtg"),Lf=Mn("rtc");function Nf(e,t=Wt){Fo("ec",e,t)}const Lc="components",bb="directives";function yb(e,t){return Nc(Lc,e,!0,t)||e}const Df=Symbol.for("v-ndc");function xb(e){return Be(e)?Nc(Lc,e,!1)||e:e||Df}function _b(e){return Nc(bb,e)}function Nc(e,t,s=!0,n=!1){const a=Zt||Wt;if(a){const i=a.type;if(e===Lc){const o=qr(i,!1);if(o&&(o===t||o===pt(t)||o===Ca(pt(t))))return i}const l=jd(a[e]||i[e],t)||jd(a.appContext[e],t);return!l&&n?i:l}}function jd(e,t){return e&&(e[t]||e[pt(t)]||e[Ca(pt(t))])}function wb(e,t,s,n){let a;const i=s&&s[n],l=Ce(e);if(l||Be(e)){const o=l&&En(e);let r=!1,c=!1;o&&(r=!ws(e),c=on(e),e=Lo(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(r?c?ei(Ks(e[d])):Ks(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let o=0;o<e;o++)a[o]=t(o+1,o,void 0,i&&i[o])}else if(tt(e))if(e[Symbol.iterator])a=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);a=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];a[r]=t(e[d],d,r,i&&i[r])}}else a=[];return s&&(s[n]=a),a}function kb(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ce(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Sb(e,t,s={},n,a){if(Zt.ce||Zt.parent&&An(Zt.parent)&&Zt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Yi(),so(Vt,null,[xt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Yi();const l=i&&Dc(i(s)),o=s.key||l&&l.key,r=so(Vt,{key:(o&&!is(o)?o:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Dc(e){return e.some(t=>Dn(t)?!(t.type===It||t.type===Vt&&!Dc(t.children)):!0)?e:null}function Tb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Ga(n)]=e[n];return s}const Fr=e=>e?dh(e)?ml(e):Fr(e.parent):null,Mi=qe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Fr(e.parent),$root:e=>Fr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Mc(e),$forceUpdate:e=>e.f||(e.f=()=>{Cc(e.update)}),$nextTick:e=>e.n||(e.n=Rt.bind(e.proxy)),$watch:e=>Wg.bind(e)}),or=(e,t)=>e!==Ge&&!e.__isScriptSetup&&nt(e,t),$r={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(or(n,t))return l[t]=1,n[t];if(a!==Ge&&nt(a,t))return l[t]=2,a[t];if(nt(i,t))return l[t]=3,i[t];if(s!==Ge&&nt(s,t))return l[t]=4,s[t];Br&&(l[t]=0)}}const c=Mi[t];let d,u;if(c)return t==="$attrs"&&ss(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ge&&nt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,nt(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return or(a,t)?(a[t]=s,!0):n!==Ge&&nt(n,t)?(n[t]=s,!0):nt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},o){let r;return!!(s[o]||e!==Ge&&o[0]!=="$"&&nt(e,o)||or(t,o)||nt(i,o)||nt(n,o)||nt(Mi,o)||nt(a.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:nt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Cb=qe({},$r,{get(e,t){if(t!==Symbol.unscopables)return $r.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Nv(t)}});function Eb(){return null}function Ab(){return null}function Rb(e){}function Ib(e){}function Ob(){return null}function Lb(){}function Nb(e,t){return null}function Db(){return Mf().slots}function Mb(){return Mf().attrs}function Mf(e){const t=fs();return t.setupContext||(t.setupContext=hh(t))}function Zi(e){return Ce(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Pb(e,t){const s=Zi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ce(a)||Me(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Fb(e,t){return!e||!t?e||t:Ce(e)&&Ce(t)?e.concat(t):qe({},Zi(e),Zi(t))}function $b(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Bb(e){const t=fs(),s=_a;let n=e();Xi(),s&&Ya(!1);const a=()=>{hi(t),s&&Ya(!0)},i=()=>{fs()!==t&&t.scope.off(),Xi(),s&&Ya(!1)};return bc(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Br=!0;function Ub(e){const t=Mc(e),s=e.proxy,n=e.ctx;Br=!1,t.beforeCreate&&Vd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:m,activated:v,deactivated:w,beforeDestroy:L,beforeUnmount:x,destroyed:g,unmounted:b,render:C,renderTracked:S,renderTriggered:A,errorCaptured:T,serverPrefetch:y,expose:O,inheritAttrs:$,components:k,directives:M,filters:j}=t;if(c&&Hb(c,n,null),l)for(const R in l){const I=l[R];Me(I)&&(n[R]=I.bind(s))}if(a){const R=a.call(s,s);tt(R)&&(e.data=ea(R))}if(Br=!0,i)for(const R in i){const I=i[R],U=Me(I)?I.bind(s,s):Me(I.get)?I.get.bind(s,s):Jt,Z=!Me(I)&&Me(I.set)?I.set.bind(s):Jt,W=K({get:U,set:Z});Object.defineProperty(n,R,{enumerable:!0,configurable:!0,get:()=>W.value,set:J=>W.value=J})}if(o)for(const R in o)Pf(o[R],n,s,R);if(r){const R=Me(r)?r.call(s):r;Reflect.ownKeys(R).forEach(I=>{Di(I,R[I])})}d&&Vd(d,e,"c");function D(R,I){Ce(I)?I.forEach(U=>R(U.bind(s))):I&&R(I.bind(s))}if(D(Rf,u),D(Ve,p),D(Oc,f),D($o,m),D(ms,v),D(ls,w),D(Nf,T),D(Lf,S),D(Of,A),D(Bo,x),D(mt,b),D(If,y),Ce(O))if(O.length){const R=e.exposed||(e.exposed={});O.forEach(I=>{Object.defineProperty(R,I,{get:()=>s[I],set:U=>s[I]=U,enumerable:!0})})}else e.exposed||(e.exposed={});C&&e.render===Jt&&(e.render=C),$!=null&&(e.inheritAttrs=$),k&&(e.components=k),M&&(e.directives=M),y&&Ic(e)}function Hb(e,t,s=Jt){Ce(e)&&(e=Ur(e));for(const n in e){const a=e[n];let i;tt(a)?"default"in a?i=Us(a.from||n,a.default,!0):i=Us(a.from||n):i=Us(a),Dt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Vd(e,t,s){Rs(Ce(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Pf(e,t,s,n){let a=n.includes(".")?_f(s,n):()=>s[n];if(Be(e)){const i=t[e];Me(i)&&Mt(a,i)}else if(Me(e))Mt(a,e.bind(s));else if(tt(e))if(Ce(e))e.forEach(i=>Pf(i,t,s,n));else{const i=Me(e.handler)?e.handler.bind(s):t[e.handler];Me(i)&&Mt(a,i,e)}}function Mc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!a.length&&!s&&!n?r=t:(r={},a.length&&a.forEach(c=>Xl(r,c,l,!0)),Xl(r,t,l)),tt(t)&&i.set(t,r),r}function Xl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Xl(e,i,s,!0),a&&a.forEach(l=>Xl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const o=zb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const zb={data:qd,props:Gd,emits:Gd,methods:Ri,computed:Ri,beforeCreate:rs,created:rs,beforeMount:rs,mounted:rs,beforeUpdate:rs,updated:rs,beforeDestroy:rs,beforeUnmount:rs,destroyed:rs,unmounted:rs,activated:rs,deactivated:rs,errorCaptured:rs,serverPrefetch:rs,components:Ri,directives:Ri,watch:Vb,provide:qd,inject:jb};function qd(e,t){return t?e?function(){return qe(Me(e)?e.call(this,this):e,Me(t)?t.call(this,this):t)}:t:e}function jb(e,t){return Ri(Ur(e),Ur(t))}function Ur(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function rs(e,t){return e?[...new Set([].concat(e,t))]:t}function Ri(e,t){return e?qe(Object.create(null),e,t):t}function Gd(e,t){return e?Ce(e)&&Ce(t)?[...new Set([...e,...t])]:qe(Object.create(null),Zi(e),Zi(t??{})):t}function Vb(e,t){if(!e)return t;if(!t)return e;const s=qe(Object.create(null),e);for(const n in t)s[n]=rs(e[n],t[n]);return s}function Ff(){return{app:null,config:{isNativeTag:za,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let qb=0;function Gb(e,t){return function(n,a=null){Me(n)||(n=qe({},n)),a!=null&&!tt(a)&&(a=null);const i=Ff(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:qb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:vh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Me(d.install)?(l.add(d),d.install(c,...u)):Me(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const f=c._ceVNode||xt(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),r=!0,c._container=d,d.__vue_app__=c,ml(f.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Rs(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=va;va=c;try{return d()}finally{va=u}}};return c}}let va=null;function Kb(e,t,s=Ge){const n=fs(),a=pt(t),i=xs(t),l=$f(e,a),o=df((r,c)=>{let d,u=Ge,p;return xf(()=>{const f=e[a];jt(d,f)&&(d=f,c())}),{get(){return r(),s.get?s.get(d):d},set(f){const m=s.set?s.set(f):f;if(!jt(m,d)&&!(u!==Ge&&jt(f,u)))return;const v=n.vnode.props,w=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));w||(d=f,c()),n.emit(`update:${t}`,m),jt(f,u)&&(jt(f,m)&&!jt(m,p)||w&&u!==Ge&&!jt(m,d))&&c(),u=f,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ge:o,done:!1}:{done:!0}}}},o}const $f=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${pt(t)}Modifiers`]||e[`${xs(t)}Modifiers`];function Wb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ge;let a=s;const i=t.startsWith("update:"),l=i&&$f(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Be(d)?d.trim():d)),l.number&&(a=s.map(Ao)));let o,r=n[o=Ga(t)]||n[o=Ga(pt(t))];!r&&i&&(r=n[o=Ga(xs(t))]),r&&Rs(r,e,6,a);const c=n[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Rs(c,e,6,a)}}const Zb=new WeakMap;function Bf(e,t,s=!1){const n=s?Zb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},o=!1;if(!Me(e)){const r=c=>{const d=Bf(c,t,!0);d&&(o=!0,qe(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(tt(e)&&n.set(e,null),null):(Ce(i)?i.forEach(r=>l[r]=null):qe(l,i),tt(e)&&n.set(e,l),l)}function Uo(e,t){return!e||!Sa(t)?!1:(t=t.slice(2).replace(/Once$/,""),nt(e,t[0].toLowerCase()+t.slice(1))||nt(e,xs(t))||nt(e,t))}function Bl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:m,inheritAttrs:v}=e,w=Wi(e);let L,x;try{if(s.shapeFlag&4){const b=a||n,C=b;L=ys(c.call(C,b,d,u,f,p,m)),x=o}else{const b=t;L=ys(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),x=t.props?o:Yb(o)}}catch(b){Pi.length=0,Ea(b,e,1),L=xt(It)}let g=L;if(x&&v!==!1){const b=Object.keys(x),{shapeFlag:C}=g;b.length&&C&7&&(i&&b.some(So)&&(x=Qb(x,i)),g=rn(g,x,!1,!0))}return s.dirs&&(g=rn(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&Nn(g,s.transition),L=g,Wi(w),L}function Jb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Dn(a)){if(a.type!==It||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Yb=e=>{let t;for(const s in e)(s==="class"||s==="style"||Sa(s))&&((t||(t={}))[s]=e[s]);return t},Qb=(e,t)=>{const s={};for(const n in e)(!So(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Xb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return n?Kd(n,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Uf(l,n,p)&&!Uo(c,p))return!0}}}else return(a||o)&&(!o||!o.$stable)?!0:n===l?!1:n?l?Kd(n,l,c):!0:!!l;return!1}function Kd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Uf(t,e,i)&&!Uo(s,i))return!0}return!1}function Uf(e,t,s){const n=e[s],a=t[s];return s==="style"&&tt(n)&&tt(a)?!In(n,a):n!==a}function Ho({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Hf={},zf=()=>Object.create(Hf),jf=e=>Object.getPrototypeOf(e)===Hf;function ey(e,t,s,n=!1){const a={},i=zf();e.propsDefaults=Object.create(null),Vf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:kc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function ty(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,o=Je(a),[r]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Uo(e.emitsOptions,p))continue;const f=t[p];if(r)if(nt(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const m=pt(p);a[m]=Hr(r,o,m,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{Vf(e,t,a,i)&&(c=!0);let d;for(const u in o)(!t||!nt(t,u)&&((d=xs(u))===u||!nt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Hr(r,o,u,void 0,e,!0)):delete a[u]);if(i!==o)for(const u in i)(!t||!nt(t,u))&&(delete i[u],c=!0)}c&&_n(e.attrs,"set","")}function Vf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Cn(r))continue;const c=t[r];let d;a&&nt(a,d=pt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Uo(e.emitsOptions,r)||(!(r in n)||c!==n[r])&&(n[r]=c,l=!0)}if(i){const r=Je(s),c=o||Ge;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Hr(a,r,u,c[u],e,!nt(c,u))}}return l}function Hr(e,t,s,n,a,i){const l=e[s];if(l!=null){const o=nt(l,"default");if(o&&n===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Me(r)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=hi(a);n=c[s]=r.call(null,t),d()}}else n=r;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!o?n=!1:l[1]&&(n===""||n===xs(s))&&(n=!0))}return n}const sy=new WeakMap;function qf(e,t,s=!1){const n=s?sy:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},o=[];let r=!1;if(!Me(e)){const d=u=>{r=!0;const[p,f]=qf(u,t,!0);qe(l,p),f&&o.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return tt(e)&&n.set(e,Va),Va;if(Ce(i))for(let d=0;d<i.length;d++){const u=pt(i[d]);Wd(u)&&(l[u]=Ge)}else if(i)for(const d in i){const u=pt(d);if(Wd(u)){const p=i[d],f=l[u]=Ce(p)||Me(p)?{type:p}:qe({},p),m=f.type;let v=!1,w=!0;if(Ce(m))for(let L=0;L<m.length;++L){const x=m[L],g=Me(x)&&x.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(w=!1)}else v=Me(m)&&m.name==="Boolean";f[0]=v,f[1]=w,(v||nt(f,"default"))&&o.push(u)}}const c=[l,o];return tt(e)&&n.set(e,c),c}function Wd(e){return e[0]!=="$"&&!Cn(e)}const Pc=e=>e==="_"||e==="_ctx"||e==="$stable",Fc=e=>Ce(e)?e.map(ys):[ys(e)],ny=(e,t,s)=>{if(t._n)return t;const n=Ec((...a)=>Fc(t(...a)),s);return n._c=!1,n},Gf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Pc(a))continue;const i=e[a];if(Me(i))t[a]=ny(a,i,n);else if(i!=null){const l=Fc(i);t[a]=()=>l}}},Kf=(e,t)=>{const s=Fc(t);e.slots.default=()=>s},Wf=(e,t,s)=>{for(const n in t)(s||!Pc(n))&&(e[n]=t[n])},ay=(e,t,s)=>{const n=e.slots=zf();if(e.vnode.shapeFlag&32){const a=t._;a?(Wf(n,t,s),s&&Bp(n,"_",a,!0)):Gf(t,n)}else t&&Kf(e,t)},iy=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ge;if(n.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:Wf(a,t,s):(i=!t.$stable,Gf(t,a)),l=t}else t&&(Kf(e,t),l={default:1});if(i)for(const o in a)!Pc(o)&&l[o]==null&&delete a[o]},Lt=sh;function Zf(e){return Yf(e)}function Jf(e){return Yf(e,ab)}function Yf(e,t){const s=Ro();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=Jt,insertStaticContent:m}=e,v=(_,P,H,ie=null,se=null,ae=null,fe=void 0,ue=null,de=!!P.dynamicChildren)=>{if(_===P)return;_&&!Vs(_,P)&&(ie=Q(_),J(_,se,ae,!0),_=null),P.patchFlag===-2&&(de=!1,P.dynamicChildren=null);const{type:le,ref:xe,shapeFlag:me}=P;switch(le){case Yn:w(_,P,H,ie);break;case It:L(_,P,H,ie);break;case ga:_==null&&x(P,H,ie,fe);break;case Vt:k(_,P,H,ie,se,ae,fe,ue,de);break;default:me&1?C(_,P,H,ie,se,ae,fe,ue,de):me&6?M(_,P,H,ie,se,ae,fe,ue,de):(me&64||me&128)&&le.process(_,P,H,ie,se,ae,fe,ue,de,re)}xe!=null&&se?Za(xe,_&&_.ref,ae,P||_,!P):xe==null&&_&&_.ref!=null&&Za(_.ref,null,ae,_,!0)},w=(_,P,H,ie)=>{if(_==null)n(P.el=o(P.children),H,ie);else{const se=P.el=_.el;P.children!==_.children&&c(se,P.children)}},L=(_,P,H,ie)=>{_==null?n(P.el=r(P.children||""),H,ie):P.el=_.el},x=(_,P,H,ie)=>{[_.el,_.anchor]=m(_.children,P,H,ie,_.el,_.anchor)},g=({el:_,anchor:P},H,ie)=>{let se;for(;_&&_!==P;)se=p(_),n(_,H,ie),_=se;n(P,H,ie)},b=({el:_,anchor:P})=>{let H;for(;_&&_!==P;)H=p(_),a(_),_=H;a(P)},C=(_,P,H,ie,se,ae,fe,ue,de)=>{if(P.type==="svg"?fe="svg":P.type==="math"&&(fe="mathml"),_==null)S(P,H,ie,se,ae,fe,ue,de);else{const le=_.el&&_.el._isVueCE?_.el:null;try{le&&le._beginPatch(),y(_,P,se,ae,fe,ue,de)}finally{le&&le._endPatch()}}},S=(_,P,H,ie,se,ae,fe,ue)=>{let de,le;const{props:xe,shapeFlag:me,transition:_e,dirs:Re}=_;if(de=_.el=l(_.type,ae,xe&&xe.is,xe),me&8?d(de,_.children):me&16&&T(_.children,de,null,ie,se,rr(_,ae),fe,ue),Re&&nn(_,null,ie,"created"),A(de,_,_.scopeId,fe,ie),xe){for(const ve in xe)ve!=="value"&&!Cn(ve)&&i(de,ve,null,xe[ve],ae,ie);"value"in xe&&i(de,"value",null,xe.value,ae),(le=xe.onVnodeBeforeMount)&&gs(le,ie,_)}Re&&nn(_,null,ie,"beforeMount");const F=Qf(se,_e);F&&_e.beforeEnter(de),n(de,P,H),((le=xe&&xe.onVnodeMounted)||F||Re)&&Lt(()=>{try{le&&gs(le,ie,_),F&&_e.enter(de),Re&&nn(_,null,ie,"mounted")}finally{}},se)},A=(_,P,H,ie,se)=>{if(H&&f(_,H),ie)for(let ae=0;ae<ie.length;ae++)f(_,ie[ae]);if(se){let ae=se.subTree;if(P===ae||to(ae.type)&&(ae.ssContent===P||ae.ssFallback===P)){const fe=se.vnode;A(_,fe,fe.scopeId,fe.slotScopeIds,se.parent)}}},T=(_,P,H,ie,se,ae,fe,ue,de=0)=>{for(let le=de;le<_.length;le++){const xe=_[le]=ue?yn(_[le]):ys(_[le]);v(null,xe,P,H,ie,se,ae,fe,ue)}},y=(_,P,H,ie,se,ae,fe)=>{const ue=P.el=_.el;let{patchFlag:de,dynamicChildren:le,dirs:xe}=P;de|=_.patchFlag&16;const me=_.props||Ge,_e=P.props||Ge;let Re;if(H&&ia(H,!1),(Re=_e.onVnodeBeforeUpdate)&&gs(Re,H,P,_),xe&&nn(P,_,H,"beforeUpdate"),H&&ia(H,!0),(me.innerHTML&&_e.innerHTML==null||me.textContent&&_e.textContent==null)&&d(ue,""),le?O(_.dynamicChildren,le,ue,H,ie,rr(P,se),ae):fe||I(_,P,ue,null,H,ie,rr(P,se),ae,!1),de>0){if(de&16)$(ue,me,_e,H,se);else if(de&2&&me.class!==_e.class&&i(ue,"class",null,_e.class,se),de&4&&i(ue,"style",me.style,_e.style,se),de&8){const F=P.dynamicProps;for(let ve=0;ve<F.length;ve++){const ke=F[ve],Oe=me[ke],Pe=_e[ke];(Pe!==Oe||ke==="value")&&i(ue,ke,Oe,Pe,se,H)}}de&1&&_.children!==P.children&&d(ue,P.children)}else!fe&&le==null&&$(ue,me,_e,H,se);((Re=_e.onVnodeUpdated)||xe)&&Lt(()=>{Re&&gs(Re,H,P,_),xe&&nn(P,_,H,"updated")},ie)},O=(_,P,H,ie,se,ae,fe)=>{for(let ue=0;ue<P.length;ue++){const de=_[ue],le=P[ue],xe=de.el&&(de.type===Vt||!Vs(de,le)||de.shapeFlag&198)?u(de.el):H;v(de,le,xe,null,ie,se,ae,fe,!0)}},$=(_,P,H,ie,se)=>{if(P!==H){if(P!==Ge)for(const ae in P)!Cn(ae)&&!(ae in H)&&i(_,ae,P[ae],null,se,ie);for(const ae in H){if(Cn(ae))continue;const fe=H[ae],ue=P[ae];fe!==ue&&ae!=="value"&&i(_,ae,ue,fe,se,ie)}"value"in H&&i(_,"value",P.value,H.value,se)}},k=(_,P,H,ie,se,ae,fe,ue,de)=>{const le=P.el=_?_.el:o(""),xe=P.anchor=_?_.anchor:o("");let{patchFlag:me,dynamicChildren:_e,slotScopeIds:Re}=P;Re&&(ue=ue?ue.concat(Re):Re),_==null?(n(le,H,ie),n(xe,H,ie),T(P.children||[],H,xe,se,ae,fe,ue,de)):me>0&&me&64&&_e&&_.dynamicChildren&&_.dynamicChildren.length===_e.length?(O(_.dynamicChildren,_e,H,se,ae,fe,ue),(P.key!=null||se&&P===se.subTree)&&$c(_,P,!0)):I(_,P,H,xe,se,ae,fe,ue,de)},M=(_,P,H,ie,se,ae,fe,ue,de)=>{P.slotScopeIds=ue,_==null?P.shapeFlag&512?se.ctx.activate(P,H,ie,fe,de):j(P,H,ie,se,ae,fe,de):q(_,P,de)},j=(_,P,H,ie,se,ae,fe)=>{const ue=_.component=ch(_,ie,se);if(hl(_)&&(ue.ctx.renderer=re),uh(ue,!1,fe),ue.asyncDep){if(se&&se.registerDep(ue,D,fe),!_.el){const de=ue.subTree=xt(It);L(null,de,P,H),_.placeholder=de.el}}else D(ue,_,P,H,se,ae,fe)},q=(_,P,H)=>{const ie=P.component=_.component;if(Xb(_,P,H))if(ie.asyncDep&&!ie.asyncResolved){R(ie,P,H);return}else ie.next=P,ie.update();else P.el=_.el,ie.vnode=P},D=(_,P,H,ie,se,ae,fe)=>{const ue=()=>{if(_.isMounted){let{next:me,bu:_e,u:Re,parent:F,vnode:ve}=_;{const st=Xf(_);if(st){me&&(me.el=ve.el,R(_,me,fe)),st.asyncDep.then(()=>{Lt(()=>{_.isUnmounted||le()},se)});return}}let ke=me,Oe;ia(_,!1),me?(me.el=ve.el,R(_,me,fe)):me=ve,_e&&Ka(_e),(Oe=me.props&&me.props.onVnodeBeforeUpdate)&&gs(Oe,F,me,ve),ia(_,!0);const Pe=Bl(_),dt=_.subTree;_.subTree=Pe,v(dt,Pe,u(dt.el),Q(dt),_,se,ae),me.el=Pe.el,ke===null&&Ho(_,Pe.el),Re&&Lt(Re,se),(Oe=me.props&&me.props.onVnodeUpdated)&&Lt(()=>gs(Oe,F,me,ve),se)}else{let me;const{el:_e,props:Re}=P,{bm:F,m:ve,parent:ke,root:Oe,type:Pe}=_,dt=An(P);if(ia(_,!1),F&&Ka(F),!dt&&(me=Re&&Re.onVnodeBeforeMount)&&gs(me,ke,P),ia(_,!0),_e&&Ie){const st=()=>{_.subTree=Bl(_),Ie(_e,_.subTree,_,se,null)};dt&&Pe.__asyncHydrate?Pe.__asyncHydrate(_e,_,st):st()}else{Oe.ce&&Oe.ce._hasShadowRoot()&&Oe.ce._injectChildStyle(Pe,_.parent?_.parent.type:void 0);const st=_.subTree=Bl(_);v(null,st,H,ie,_,se,ae),P.el=st.el}if(ve&&Lt(ve,se),!dt&&(me=Re&&Re.onVnodeMounted)){const st=P;Lt(()=>gs(me,ke,st),se)}(P.shapeFlag&256||ke&&An(ke.vnode)&&ke.vnode.shapeFlag&256)&&_.a&&Lt(_.a,se),_.isMounted=!0,P=H=ie=null}};_.scope.on();const de=_.effect=new ji(ue);_.scope.off();const le=_.update=de.run.bind(de),xe=_.job=de.runIfDirty.bind(de);xe.i=_,xe.id=_.uid,de.scheduler=()=>Cc(xe),ia(_,!0),le()},R=(_,P,H)=>{P.component=_;const ie=_.vnode.props;_.vnode=P,_.next=null,ty(_,P.props,ie,H),iy(_,P.children,H),On(),Md(_),Ln()},I=(_,P,H,ie,se,ae,fe,ue,de=!1)=>{const le=_&&_.children,xe=_?_.shapeFlag:0,me=P.children,{patchFlag:_e,shapeFlag:Re}=P;if(_e>0){if(_e&128){Z(le,me,H,ie,se,ae,fe,ue,de);return}else if(_e&256){U(le,me,H,ie,se,ae,fe,ue,de);return}}Re&8?(xe&16&&Ne(le,se,ae),me!==le&&d(H,me)):xe&16?Re&16?Z(le,me,H,ie,se,ae,fe,ue,de):Ne(le,se,ae,!0):(xe&8&&d(H,""),Re&16&&T(me,H,ie,se,ae,fe,ue,de))},U=(_,P,H,ie,se,ae,fe,ue,de)=>{_=_||Va,P=P||Va;const le=_.length,xe=P.length,me=Math.min(le,xe);let _e;for(_e=0;_e<me;_e++){const Re=P[_e]=de?yn(P[_e]):ys(P[_e]);v(_[_e],Re,H,null,se,ae,fe,ue,de)}le>xe?Ne(_,se,ae,!0,!1,me):T(P,H,ie,se,ae,fe,ue,de,me)},Z=(_,P,H,ie,se,ae,fe,ue,de)=>{let le=0;const xe=P.length;let me=_.length-1,_e=xe-1;for(;le<=me&&le<=_e;){const Re=_[le],F=P[le]=de?yn(P[le]):ys(P[le]);if(Vs(Re,F))v(Re,F,H,null,se,ae,fe,ue,de);else break;le++}for(;le<=me&&le<=_e;){const Re=_[me],F=P[_e]=de?yn(P[_e]):ys(P[_e]);if(Vs(Re,F))v(Re,F,H,null,se,ae,fe,ue,de);else break;me--,_e--}if(le>me){if(le<=_e){const Re=_e+1,F=Re<xe?P[Re].el:ie;for(;le<=_e;)v(null,P[le]=de?yn(P[le]):ys(P[le]),H,F,se,ae,fe,ue,de),le++}}else if(le>_e)for(;le<=me;)J(_[le],se,ae,!0),le++;else{const Re=le,F=le,ve=new Map;for(le=F;le<=_e;le++){const rt=P[le]=de?yn(P[le]):ys(P[le]);rt.key!=null&&ve.set(rt.key,le)}let ke,Oe=0;const Pe=_e-F+1;let dt=!1,st=0;const _t=new Array(Pe);for(le=0;le<Pe;le++)_t[le]=0;for(le=Re;le<=me;le++){const rt=_[le];if(Oe>=Pe){J(rt,se,ae,!0);continue}let Qe;if(rt.key!=null)Qe=ve.get(rt.key);else for(ke=F;ke<=_e;ke++)if(_t[ke-F]===0&&Vs(rt,P[ke])){Qe=ke;break}Qe===void 0?J(rt,se,ae,!0):(_t[Qe-F]=le+1,Qe>=st?st=Qe:dt=!0,v(rt,P[Qe],H,null,se,ae,fe,ue,de),Oe++)}const Ot=dt?ly(_t):Va;for(ke=Ot.length-1,le=Pe-1;le>=0;le--){const rt=F+le,Qe=P[rt],ne=P[rt+1],Se=rt+1<xe?ne.el||eh(ne):ie;_t[le]===0?v(null,Qe,H,Se,se,ae,fe,ue,de):dt&&(ke<0||le!==Ot[ke]?W(Qe,H,Se,2):ke--)}}},W=(_,P,H,ie,se=null)=>{const{el:ae,type:fe,transition:ue,children:de,shapeFlag:le}=_;if(le&6){W(_.component.subTree,P,H,ie);return}if(le&128){_.suspense.move(P,H,ie);return}if(le&64){fe.move(_,P,H,re);return}if(fe===Vt){n(ae,P,H);for(let me=0;me<de.length;me++)W(de[me],P,H,ie);n(_.anchor,P,H);return}if(fe===ga){g(_,P,H);return}if(ie!==2&&le&1&&ue)if(ie===0)ue.persisted&&!ae[Ps]?n(ae,P,H):(ue.beforeEnter(ae),n(ae,P,H),Lt(()=>ue.enter(ae),se));else{const{leave:me,delayLeave:_e,afterLeave:Re}=ue,F=()=>{_.ctx.isUnmounted?a(ae):n(ae,P,H)},ve=()=>{const ke=ae._isLeaving||!!ae[Ps];ae._isLeaving&&ae[Ps](!0),ue.persisted&&!ke?F():me(ae,()=>{F(),Re&&Re()})};_e?_e(ae,F,ve):ve()}else n(ae,P,H)},J=(_,P,H,ie=!1,se=!1)=>{const{type:ae,props:fe,ref:ue,children:de,dynamicChildren:le,shapeFlag:xe,patchFlag:me,dirs:_e,cacheIndex:Re,memo:F}=_;if(me===-2&&(se=!1),ue!=null&&(On(),Za(ue,null,H,_,!0),Ln()),Re!=null&&(P.renderCache[Re]=void 0),xe&256){P.ctx.deactivate(_);return}const ve=xe&1&&_e,ke=!An(_);let Oe;if(ke&&(Oe=fe&&fe.onVnodeBeforeUnmount)&&gs(Oe,P,_),xe&6)ce(_.component,H,ie);else{if(xe&128){_.suspense.unmount(H,ie);return}ve&&nn(_,null,P,"beforeUnmount"),xe&64?_.type.remove(_,P,H,re,ie):le&&!le.hasOnce&&(ae!==Vt||me>0&&me&64)?Ne(le,P,H,!1,!0):(ae===Vt&&me&384||!se&&xe&16)&&Ne(de,P,H),ie&&oe(_)}const Pe=F!=null&&Re==null;(ke&&(Oe=fe&&fe.onVnodeUnmounted)||ve||Pe)&&Lt(()=>{Oe&&gs(Oe,P,_),ve&&nn(_,null,P,"unmounted"),Pe&&(_.el=null)},H)},oe=_=>{const{type:P,el:H,anchor:ie,transition:se}=_;if(P===Vt){ee(H,ie);return}if(P===ga){b(_);return}const ae=()=>{a(H),se&&!se.persisted&&se.afterLeave&&se.afterLeave()};if(_.shapeFlag&1&&se&&!se.persisted){const{leave:fe,delayLeave:ue}=se,de=()=>fe(H,ae);ue?ue(_.el,ae,de):de()}else ae()},ee=(_,P)=>{let H;for(;_!==P;)H=p(_),a(_),_=H;a(P)},ce=(_,P,H)=>{const{bum:ie,scope:se,job:ae,subTree:fe,um:ue,m:de,a:le}=_;eo(de),eo(le),ie&&Ka(ie),se.stop(),ae&&(ae.flags|=8,J(fe,_,P,H)),ue&&Lt(ue,P),Lt(()=>{_.isUnmounted=!0},P)},Ne=(_,P,H,ie=!1,se=!1,ae=0)=>{for(let fe=ae;fe<_.length;fe++)J(_[fe],P,H,ie,se)},Q=_=>{if(_.shapeFlag&6)return Q(_.component.subTree);if(_.shapeFlag&128)return _.suspense.next();const P=p(_.anchor||_.el),H=P&&P[wf];return H?p(H):P};let ge=!1;const z=(_,P,H)=>{let ie;_==null?P._vnode&&(J(P._vnode,null,null,!0),ie=P._vnode.component):v(P._vnode||null,_,P,null,null,null,H),P._vnode=_,ge||(ge=!0,Md(ie),Yl(),ge=!1)},re={p:v,um:J,m:W,r:oe,mt:j,mc:T,pc:I,pbc:O,n:Q,o:e};let pe,Ie;return t&&([pe,Ie]=t(re)),{render:z,hydrate:pe,createApp:Gb(z,pe)}}function rr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function ia({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Qf(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function $c(e,t,s=!1){const n=e.children,a=t.children;if(Ce(n)&&Ce(a))for(let i=0;i<n.length;i++){const l=n[i];let o=a[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=a[i]=yn(a[i]),o.el=l.el),!s&&o.patchFlag!==-2&&$c(l,o)),o.type===Yn&&(o.patchFlag===-1&&(o=a[i]=yn(o)),o.el=l.el),o.type===It&&!o.el&&(o.el=l.el)}}function ly(e){const t=e.slice(),s=[0];let n,a,i,l,o;const r=e.length;for(n=0;n<r;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Xf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Xf(t)}function eo(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function eh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?eh(t.subTree):null}const to=e=>e.__isSuspense;let zr=0;const oy={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,o,r,c){if(e==null)cy(t,s,n,a,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}dy(e,t,s,n,a,l,o,r,c)}},hydrate:uy,normalize:py},ry=oy;function Ji(e,t){const s=e.props&&e.props[t];Me(s)&&s()}function cy(e,t,s,n,a,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=th(e,a,n,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Ji(e,"onPending"),Ji(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Ja(p,e.ssFallback)):p.resolve(!1,!0)}function dy(e,t,s,n,a,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:w,isHydrating:L}=u;if(v)u.pendingBranch=p,Vs(v,p)?(r(v,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():w&&(L||(r(m,f,s,n,a,null,i,l,o),Ja(u,f)))):(u.pendingId=zr++,L?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),w?(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():(r(m,f,s,n,a,null,i,l,o),Ja(u,f))):m&&Vs(m,p)?(r(m,p,s,n,a,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Vs(m,p))r(m,p,s,n,a,u,i,l,o),Ja(u,p);else if(Ji(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=zr++,r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:x,pendingId:g}=u;x>0?setTimeout(()=>{u.pendingId===g&&u.fallback(f)},x):x===0&&u.fallback(f)}}function th(e,t,s,n,a,i,l,o,r,c,d=!1){const{p:u,m:p,um:f,n:m,o:{parentNode:v,remove:w}}=c;let L;const x=fy(e);x&&t&&t.pendingBranch&&(L=t.pendingId,t.deps++);const g=e.props?Gl(e.props.timeout):void 0,b=i,C={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:zr++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(S=!1,A=!1){const{vnode:T,activeBranch:y,pendingBranch:O,pendingId:$,effects:k,parentComponent:M,container:j,isInFallback:q}=C;let D=!1;if(C.isHydrating)C.isHydrating=!1;else if(!S){D=y&&O.transition&&O.transition.mode==="out-in";let U=!1;D&&(y.transition.afterLeave=()=>{$===C.pendingId&&(p(O,j,i===b&&!U?m(y):i,0),Gi(k),q&&T.ssFallback&&(T.ssFallback.el=null))}),y&&!C.isFallbackMountPending&&(v(y.el)===j&&(i=m(y),U=!0),f(y,M,C,!0),!D&&q&&T.ssFallback&&Lt(()=>T.ssFallback.el=null,C)),D||p(O,j,i,0)}C.isFallbackMountPending=!1,Ja(C,O),C.pendingBranch=null,C.isInFallback=!1;let R=C.parent,I=!1;for(;R;){if(R.pendingBranch){R.effects.push(...k),I=!0;break}R=R.parent}!I&&!D&&Gi(k),C.effects=[],x&&t&&t.pendingBranch&&L===t.pendingId&&(t.deps--,t.deps===0&&!A&&t.resolve()),Ji(T,"onResolve")},fallback(S){if(!C.pendingBranch)return;const{vnode:A,activeBranch:T,parentComponent:y,container:O,namespace:$}=C;Ji(A,"onFallback");const k=m(T),M=()=>{C.isFallbackMountPending=!1,C.isInFallback&&(u(null,S,O,k,y,null,$,o,r),Ja(C,S))},j=S.transition&&S.transition.mode==="out-in";j&&(C.isFallbackMountPending=!0,T.transition.afterLeave=M),C.isInFallback=!0,f(T,y,null,!0),j||M()},move(S,A,T){C.activeBranch&&p(C.activeBranch,S,A,T),C.container=S},next(){return C.activeBranch&&m(C.activeBranch)},registerDep(S,A,T){const y=!!C.pendingBranch;y&&C.deps++;const O=S.vnode.el;S.asyncDep.catch($=>{Ea($,S,0)}).then($=>{if(S.isUnmounted||C.isUnmounted||C.pendingId!==S.suspenseId)return;Xi(),S.asyncResolved=!0;const{vnode:k}=S;jr(S,$,!1),O&&(k.el=O);const M=!O&&S.subTree.el;A(S,k,v(O||S.subTree.el),O?null:m(S.subTree),C,l,T),M&&(k.placeholder=null,w(M)),Ho(S,k.el),y&&--C.deps===0&&C.resolve()})},unmount(S,A){C.isUnmounted=!0,C.activeBranch&&f(C.activeBranch,s,S,A),C.pendingBranch&&f(C.pendingBranch,s,S,A)}};return C}function uy(e,t,s,n,a,i,l,o,r){const c=t.suspense=th(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function py(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Zd(n?s.default:s),e.ssFallback=n?Zd(s.fallback):xt(It)}function Zd(e){let t;if(Me(e)){const s=xa&&e._c;s&&(e._d=!1,Yi()),e=e(),s&&(e._d=!0,t=ns,nh())}return Ce(e)&&(e=Jb(e)),e=ys(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function sh(e,t){t&&t.pendingBranch?Ce(e)?t.effects.push(...e):t.effects.push(e):Gi(e)}function Ja(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Ho(n,a))}function fy(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Vt=Symbol.for("v-fgt"),Yn=Symbol.for("v-txt"),It=Symbol.for("v-cmt"),ga=Symbol.for("v-stc"),Pi=[];let ns=null;function Yi(e=!1){Pi.push(ns=e?null:[])}function nh(){Pi.pop(),ns=Pi[Pi.length-1]||null}let xa=1;function Qi(e,t=!1){xa+=e,e<0&&ns&&t&&(ns.hasOnce=!0)}function ah(e){return e.dynamicChildren=xa>0?ns||Va:null,nh(),xa>0&&ns&&ns.push(e),e}function hy(e,t,s,n,a,i){return ah(Bc(e,t,s,n,a,i,!0))}function so(e,t,s,n,a){return ah(xt(e,t,s,n,a,!0))}function Dn(e){return e?e.__v_isVNode===!0:!1}function Vs(e,t){return e.type===t.type&&e.key===t.key}function my(e){}const ih=({key:e})=>e??null,Ul=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Be(e)||Dt(e)||Me(e)?{i:Zt,r:e,k:t,f:!!s}:e:null);function Bc(e,t=null,s=null,n=0,a=null,i=e===Vt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&ih(t),ref:t&&Ul(t),scopeId:Mo,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Zt};return o?(Hc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Be(s)?8:16),xa>0&&!l&&ns&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&ns.push(r),r}const xt=vy;function vy(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Df)&&(e=It),Dn(e)){const o=rn(e,t,!0);return s&&Hc(o,s),xa>0&&!i&&ns&&(o.shapeFlag&6?ns[ns.indexOf(e)]=o:ns.push(o)),o.patchFlag=-2,o}if(ky(e)&&(e=e.__vccOpts),t){t=lh(t);let{class:o,style:r}=t;o&&!Be(o)&&(t.class=dl(o)),tt(r)&&(ul(r)&&!Ce(r)&&(r=qe({},r)),t.style=cl(r))}const l=Be(e)?1:to(e)?128:kf(e)?64:tt(e)?4:Me(e)?2:0;return Bc(e,t,s,n,a,l,i,!0)}function lh(e){return e?ul(e)||jf(e)?qe({},e):e:null}function rn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?rh(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&ih(c),ref:t&&t.ref?s&&i?Ce(i)?i.concat(Ul(t)):[i,Ul(t)]:Ul(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Vt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&rn(e.ssContent),ssFallback:e.ssFallback&&rn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&n&&Nn(d,r.clone(d)),d}function Uc(e=" ",t=0){return xt(Yn,null,e,t)}function gy(e,t){const s=xt(ga,null,e);return s.staticCount=t,s}function oh(e="",t=!1){return t?(Yi(),so(It,null,e)):xt(It,null,e)}function ys(e){return e==null||typeof e=="boolean"?xt(It):Ce(e)?xt(Vt,null,e.slice()):Dn(e)?yn(e):xt(Yn,null,String(e))}function yn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:rn(e)}function Hc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ce(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Hc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!jf(t)?t._ctx=Zt:a===3&&Zt&&(Zt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Me(t)?(t={default:t,_ctx:Zt},s=32):(t=String(t),n&64?(s=16,t=[Uc(t)]):s=8);e.children=t,e.shapeFlag|=s}function rh(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=dl([t.class,n.class]));else if(a==="style")t.style=cl([t.style,n.style]);else if(Sa(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ce(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!So(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function gs(e,t,s,n=null){Rs(e,t,7,[s,n])}const by=Ff();let yy=0;function ch(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||by,i={uid:yy++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new yc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:qf(n,a),emitsOptions:Bf(n,a),emit:null,emitted:null,propsDefaults:Ge,inheritAttrs:n.inheritAttrs,ctx:Ge,data:Ge,props:Ge,attrs:Ge,slots:Ge,refs:Ge,setupState:Ge,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Wb.bind(null,i),e.ce&&e.ce(i),i}let Wt=null;const fs=()=>Wt||Zt;let no,Ya;{const e=Ro(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};no=t("__VUE_INSTANCE_SETTERS__",s=>Wt=s),Ya=t("__VUE_SSR_SETTERS__",s=>_a=s)}const hi=e=>{const t=Wt;return no(e),e.scope.on(),()=>{e.scope.off(),no(t)}},Xi=()=>{Wt&&Wt.scope.off(),no(null)};function dh(e){return e.vnode.shapeFlag&4}let _a=!1;function uh(e,t=!1,s=!1){t&&Ya(t);const{props:n,children:a}=e.vnode,i=dh(e);ey(e,n,i,t),ay(e,a,s||t);const l=i?xy(e,t):void 0;return t&&Ya(!1),l}function xy(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,$r);const{setup:n}=s;if(n){On();const a=e.setupContext=n.length>1?hh(e):null,i=hi(e),l=fi(n,e,0,[e.props,a]),o=bc(l);if(Ln(),i(),(o||e.sp)&&!An(e)&&Ic(e),o){if(l.then(Xi,Xi),t)return l.then(r=>{jr(e,r,t)}).catch(r=>{Ea(r,e,0)});e.asyncDep=l}else jr(e,l,t)}else fh(e,t)}function jr(e,t,s){Me(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:tt(t)&&(e.setupState=Tc(t)),fh(e,s)}let ao,Vr;function ph(e){ao=e,Vr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Cb))}}const _y=()=>!ao;function fh(e,t,s){const n=e.type;if(!e.render){if(!t&&ao&&!n.render){const a=n.template||Mc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=n,c=qe(qe({isCustomElement:i,delimiters:o},l),r);n.render=ao(a,c)}}e.render=n.render||Jt,Vr&&Vr(e)}{const a=hi(e);On();try{Ub(e)}finally{Ln(),a()}}}const wy={get(e,t){return ss(e,"get",""),e[t]}};function hh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,wy),slots:e.slots,emit:e.emit,expose:t}}function ml(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Tc(rf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Mi)return Mi[s](e)},has(t,s){return s in t||s in Mi}})):e.proxy}function qr(e,t=!0){return Me(e)?e.displayName||e.name:e.name||t&&e.__name}function ky(e){return Me(e)&&"__vccOpts"in e}const K=(e,t)=>Rg(e,t,_a);function si(e,t,s){try{Qi(-1);const n=arguments.length;return n===2?tt(t)&&!Ce(t)?Dn(t)?xt(e,null,[t]):xt(e,t):xt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Dn(s)&&(s=[s]),xt(e,t,s))}finally{Qi(1)}}function Sy(){}function Ty(e,t,s,n){const a=s[n];if(a&&mh(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function mh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(jt(s[n],t[n]))return!1;return xa>0&&ns&&ns.push(e),!0}const vh="3.5.38",Cy=Jt,Ey=$g,Ay=Ba,Ry=gf,Iy={createComponentInstance:ch,setupComponent:uh,renderComponentRoot:Bl,setCurrentRenderingInstance:Wi,isVNode:Dn,normalizeVNode:ys,getComponentPublicInstance:ml,ensureValidVNode:Dc,pushWarningContext:Dg,popWarningContext:Mg},Oy=Iy,Ly=null,Ny=null,Dy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Gr;const Jd=typeof window<"u"&&window.trustedTypes;if(Jd)try{Gr=Jd.createPolicy("vue",{createHTML:e=>e})}catch{}const gh=Gr?e=>Gr.createHTML(e):e=>e,My="http://www.w3.org/2000/svg",Py="http://www.w3.org/1998/Math/MathML",bn=typeof document<"u"?document:null,Yd=bn&&bn.createElement("template"),bh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?bn.createElementNS(My,e):t==="mathml"?bn.createElementNS(Py,e):s?bn.createElement(e,{is:s}):bn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>bn.createTextNode(e),createComment:e=>bn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>bn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Yd.innerHTML=gh(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const o=Yd.content;if(n==="svg"||n==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},zn="transition",yi="animation",ni=Symbol("_vtc"),yh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},xh=qe({},Rc,yh),Fy=e=>(e.displayName="Transition",e.props=xh,e),$y=Fy((e,{slots:t})=>si(Cf,_h(e),t)),la=(e,t=[])=>{Ce(e)?e.forEach(s=>s(...t)):e&&e(...t)},Qd=e=>e?Ce(e)?e.some(t=>t.length>1):e.length>1:!1;function _h(e){const t={};for(const k in e)k in yh||(t[k]=e[k]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,m=By(a),v=m&&m[0],w=m&&m[1],{onBeforeEnter:L,onEnter:x,onEnterCancelled:g,onLeave:b,onLeaveCancelled:C,onBeforeAppear:S=L,onAppear:A=x,onAppearCancelled:T=g}=t,y=(k,M,j,q)=>{k._enterCancelled=q,Gn(k,M?d:o),Gn(k,M?c:l),j&&j()},O=(k,M)=>{k._isLeaving=!1,Gn(k,u),Gn(k,f),Gn(k,p),M&&M()},$=k=>(M,j)=>{const q=k?A:x,D=()=>y(M,k,j);la(q,[M,D]),Xd(()=>{Gn(M,k?r:i),Xs(M,k?d:o),Qd(q)||eu(M,n,v,D)})};return qe(t,{onBeforeEnter(k){la(L,[k]),Xs(k,i),Xs(k,l)},onBeforeAppear(k){la(S,[k]),Xs(k,r),Xs(k,c)},onEnter:$(!1),onAppear:$(!0),onLeave(k,M){k._isLeaving=!0;const j=()=>O(k,M);Xs(k,u),k._enterCancelled?(Xs(k,p),Kr(k)):(Kr(k),Xs(k,p)),Xd(()=>{k._isLeaving&&(Gn(k,u),Xs(k,f),Qd(b)||eu(k,n,w,j))}),la(b,[k,j])},onEnterCancelled(k){y(k,!1,void 0,!0),la(g,[k])},onAppearCancelled(k){y(k,!0,void 0,!0),la(T,[k])},onLeaveCancelled(k){O(k),la(C,[k])}})}function By(e){if(e==null)return null;if(tt(e))return[cr(e.enter),cr(e.leave)];{const t=cr(e);return[t,t]}}function cr(e){return Gl(e)}function Xs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ni]||(e[ni]=new Set)).add(t)}function Gn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[ni];s&&(s.delete(t),s.size||(e[ni]=void 0))}function Xd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Uy=0;function eu(e,t,s,n){const a=e._endId=++Uy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=wh(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function wh(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${zn}Delay`),i=n(`${zn}Duration`),l=tu(a,i),o=n(`${yi}Delay`),r=n(`${yi}Duration`),c=tu(o,r);let d=null,u=0,p=0;t===zn?l>0&&(d=zn,u=l,p=i.length):t===yi?c>0&&(d=yi,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?zn:yi:null,p=d?d===zn?i.length:r.length:0);const f=d===zn&&/\b(?:transform|all)(?:,|$)/.test(n(`${zn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function tu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>su(s)+su(e[n])))}function su(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Kr(e){return(e?e.ownerDocument:document).body.offsetHeight}function Hy(e,t,s){const n=e[ni];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const io=Symbol("_vod"),zc=Symbol("_vsh"),kh={name:"show",beforeMount(e,{value:t},{transition:s}){e[io]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):xi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),xi(e,!0),n.enter(e)):n.leave(e,()=>{xi(e,!1)}):xi(e,t))},beforeUnmount(e,{value:t}){xi(e,t)}};function xi(e,t){e.style.display=t?e[io]:"none",e[zc]=!t}function zy(){kh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Sh=Symbol("");function jy(e){const t=fs();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>lo(i,a))},n=()=>{const a=e(t.proxy);t.ce?lo(t.ce,a):Wr(t.subTree,a),s(a)};Oc(()=>{Gi(n)}),Ve(()=>{Mt(n,Jt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),mt(()=>a.disconnect())})}function Wr(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Wr(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)lo(e.el,t);else if(e.type===Vt)e.children.forEach(s=>Wr(s,t));else if(e.type===ga){let{el:s,anchor:n}=e;for(;s&&(lo(s,t),s!==n);)s=s.nextSibling}}function lo(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Zv(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Sh]=n}}const Vy=/(?:^|;)\s*display\s*:/;function qy(e,t,s){const n=e.style,a=Be(s);let i=!1;if(s&&!a){if(t)if(Be(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&Ii(n,o,"")}else for(const l in t)s[l]==null&&Ii(n,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?Ky(e,l,!Be(t)&&t?t[l]:void 0,o)||Ii(n,l,o):Ii(n,l,"")}}else if(a){if(t!==s){const l=n[Sh];l&&(s+=";"+l),n.cssText=s,i=Vy.test(s)}}else t&&e.removeAttribute("style");io in e&&(e[io]=i?n.display:"",e[zc]&&(n.display="none"))}const nu=/\s*!important$/;function Ii(e,t,s){if(Ce(s))s.forEach(n=>Ii(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Gy(e,t);nu.test(s)?e.setProperty(xs(n),s.replace(nu,""),"important"):e[n]=s}}const au=["Webkit","Moz","ms"],dr={};function Gy(e,t){const s=dr[t];if(s)return s;let n=pt(t);if(n!=="filter"&&n in e)return dr[t]=n;n=Ca(n);for(let a=0;a<au.length;a++){const i=au[a]+n;if(i in e)return dr[t]=i}return t}function Ky(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Be(n)&&s===n}const iu="http://www.w3.org/1999/xlink";function lu(e,t,s,n,a,i=Kv(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(iu,t.slice(6,t.length)):e.setAttributeNS(iu,t,s):s==null||i&&!Hp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":is(s)?String(s):s)}function ou(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?gh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=Hp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function kn(e,t,s,n){e.addEventListener(t,s,n)}function Wy(e,t,s,n){e.removeEventListener(t,s,n)}const ru=Symbol("_vei");function Zy(e,t,s,n,a=null){const i=e[ru]||(e[ru]={}),l=i[t];if(n&&l)l.value=n;else{const[o,r]=Jy(t);if(n){const c=i[t]=Xy(n,a);kn(e,o,c,r)}else l&&(Wy(e,o,l,r),i[t]=void 0)}}const cu=/(?:Once|Passive|Capture)$/;function Jy(e){let t;if(cu.test(e)){t={};let n;for(;n=e.match(cu);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):xs(e.slice(2)),t]}let ur=0;const Yy=Promise.resolve(),Qy=()=>ur||(Yy.then(()=>ur=0),ur=Date.now());function Xy(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ce(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),o=[n];for(let r=0;r<l.length&&!n._stopped;r++){const c=l[r];c&&Rs(c,t,5,o)}}else Rs(a,t,5,[n])};return s.value=e,s.attached=Qy(),s}const du=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Th=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Hy(e,n,l):t==="style"?qy(e,s,n):Sa(t)?So(t)||Zy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):ex(e,t,n,l))?(ou(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&lu(e,t,n,l,i,t!=="value")):e._isVueCE&&(tx(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Be(n)))?ou(e,pt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),lu(e,t,n,l))};function ex(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&du(t)&&Me(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return du(t)&&Be(s)?!1:t in e}function tx(e,t){const s=e._def.props;if(!s)return!1;const n=pt(t);return Array.isArray(s)?s.some(a=>pt(a)===n):Object.keys(s).some(a=>pt(a)===n)}const uu={};function Ch(e,t,s){let n=fl(e,t);To(n)&&(n=qe({},n,t));class a extends zo{constructor(l){super(n,l,s)}}return a.def=n,a}const sx=((e,t)=>Ch(e,t,Bh)),nx=typeof HTMLElement<"u"?HTMLElement:class{};class zo extends nx{constructor(t,s={},n=co){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==co?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(qe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof zo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Rt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let o;if(i&&!Ce(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Gl(this._props[r])),(o||(o=Object.create(null)))[pt(r)]=!0)}this._numberProps=o,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)nt(this,n)||Object.defineProperty(this,n,{get:()=>ln(s[n])})}_resolveProps(t){const{props:s}=t,n=Ce(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(pt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):uu;const a=pt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Gl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===uu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(xs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(xs(t),s+""):s||this.removeAttribute(xs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),$h(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=xt(this._def,qe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,To(l[0])?qe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),xs(i)!==i&&a(xs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],o=a.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,a)}else for(;a.firstChild;)o.insertBefore(a.firstChild,a);o.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Eh(e){const t=fs(),s=t&&t.ce;return s||null}function ax(){const e=Eh();return e&&e.shadowRoot}function ix(e="$style"){{const t=fs();if(!t)return Ge;const s=t.type.__cssModules;if(!s)return Ge;const n=s[e];return n||Ge}}const Ah=new WeakMap,Rh=new WeakMap,oo=Symbol("_moveCb"),pu=Symbol("_enterCb"),lx=e=>(delete e.props.mode,e),ox=lx({name:"TransitionGroup",props:qe({},xh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=fs(),n=Ac();let a,i;return $o(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!px(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(cx),a.forEach(dx);const o=a.filter(ux);Kr(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;Xs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[oo]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[oo]=null,Gn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),o=_h(l);let r=l.tag||Vt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[zc]&&(a.push(d),Nn(d,ti(d,o,n,s)),Ah.set(d,Ih(d.el)))}i=t.default?Po(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Nn(d,ti(d,o,n,s))}return xt(r,null,i)}}}),rx=ox;function cx(e){const t=e.el;t[oo]&&t[oo](),t[pu]&&t[pu]()}function dx(e){Rh.set(e,Ih(e.el))}function ux(e){const t=Ah.get(e),s=Rh.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/r}px,${a/c}px)`,l.transitionDuration="0s",e}}function Ih(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function px(e,t,s){const n=e.cloneNode(),a=e[ni];a&&a.forEach(o=>{o.split(/\s+/).forEach(r=>r&&n.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&n.classList.add(o)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=wh(n);return i.removeChild(n),l}const Xn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ce(t)?s=>Ka(t,s):t};function fx(e){e.target.composing=!0}function fu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Hs=Symbol("_assign");function hu(e,t,s){return t&&(e=e.trim()),s&&(e=Ao(e)),e}const ro={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Hs]=Xn(a);const i=n||a.props&&a.props.type==="number";kn(e,t?"change":"input",l=>{l.target.composing||e[Hs](hu(e.value,s,i))}),(s||i)&&kn(e,"change",()=>{e.value=hu(e.value,s,i)}),t||(kn(e,"compositionstart",fx),kn(e,"compositionend",fu),kn(e,"change",fu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Hs]=Xn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Ao(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===r)||(e.value=r)}},jc={deep:!0,created(e,t,s){e[Hs]=Xn(s),kn(e,"change",()=>{const n=e._modelValue,a=ai(e),i=e.checked,l=e[Hs];if(Ce(n)){const o=Io(n,a),r=o!==-1;if(i&&!r)l(n.concat(a));else if(!i&&r){const c=[...n];c.splice(o,1),l(c)}}else if(Ta(n)){const o=new Set(n);i?o.add(a):o.delete(a),l(o)}else l(Lh(e,i))})},mounted:mu,beforeUpdate(e,t,s){e[Hs]=Xn(s),mu(e,t,s)}};function mu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ce(t))a=Io(t,n.props.value)>-1;else if(Ta(t))a=t.has(n.props.value);else{if(t===s)return;a=In(t,Lh(e,!0))}e.checked!==a&&(e.checked=a)}const Vc={created(e,{value:t},s){e.checked=In(t,s.props.value),e[Hs]=Xn(s),kn(e,"change",()=>{e[Hs](ai(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Hs]=Xn(n),t!==s&&(e.checked=In(t,n.props.value))}},Oh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Ta(t);kn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Ao(ai(l)):ai(l));e[Hs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Rt(()=>{e._assigning=!1})}),e[Hs]=Xn(n)},mounted(e,{value:t}){vu(e,t)},beforeUpdate(e,t,s){e[Hs]=Xn(s)},updated(e,{value:t}){e._assigning||vu(e,t)}};function vu(e,t){const s=e.multiple,n=Ce(t);if(!(s&&!n&&!Ta(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],o=ai(l);if(s)if(n){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Io(t,o)>-1}else l.selected=t.has(o);else if(In(ai(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ai(e){return"_value"in e?e._value:e.value}function Lh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Nh={created(e,t,s){Il(e,t,s,null,"created")},mounted(e,t,s){Il(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Il(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Il(e,t,s,n,"updated")}};function Dh(e,t){switch(e){case"SELECT":return Oh;case"TEXTAREA":return ro;default:switch(t){case"checkbox":return jc;case"radio":return Vc;default:return ro}}}function Il(e,t,s,n,a){const l=Dh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function hx(){ro.getSSRProps=({value:e})=>({value:e}),Vc.getSSRProps=({value:e},t)=>{if(t.props&&In(t.props.value,e))return{checked:!0}},jc.getSSRProps=({value:e},t)=>{if(Ce(e)){if(t.props&&Io(e,t.props.value)>-1)return{checked:!0}}else if(Ta(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Nh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Dh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const mx=["ctrl","shift","alt","meta"],vx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>mx.some(s=>e[`${s}Key`]&&!t.includes(s))},gx=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const o=vx[t[l]];if(o&&o(a,t))return}return e(a,...i)}))},bx={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},yx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=xs(a.key);if(t.some(l=>l===i||bx[l]===i))return e(a)}))},Mh=qe({patchProp:Th},bh);let Fi,gu=!1;function Ph(){return Fi||(Fi=Zf(Mh))}function Fh(){return Fi=gu?Fi:Jf(Mh),gu=!0,Fi}const $h=((...e)=>{Ph().render(...e)}),xx=((...e)=>{Fh().hydrate(...e)}),co=((...e)=>{const t=Ph().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Hh(n);if(!a)return;const i=t._component;!Me(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Uh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Bh=((...e)=>{const t=Fh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Hh(n);if(a)return s(a,!0,Uh(a))},t});function Uh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Hh(e){return Be(e)?document.querySelector(e):e}let bu=!1;const _x=()=>{bu||(bu=!0,hx(),zy())},wx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Cf,BaseTransitionPropsValidators:Rc,Comment:It,DeprecationTypes:Dy,EffectScope:yc,ErrorCodes:Fg,ErrorTypeStrings:Ey,Fragment:Vt,KeepAlive:vb,ReactiveEffect:ji,Static:ga,Suspense:ry,Teleport:Qg,Text:Yn,TrackOpTypes:Ig,Transition:$y,TransitionGroup:rx,TriggerOpTypes:Og,VueElement:zo,assertNumber:Pg,callWithAsyncErrorHandling:Rs,callWithErrorHandling:fi,camelize:pt,capitalize:Ca,cloneVNode:rn,compatUtils:Ny,computed:K,createApp:co,createBlock:so,createCommentVNode:oh,createElementBlock:hy,createElementVNode:Bc,createHydrationRenderer:Jf,createPropsRestProxy:$b,createRenderer:Zf,createSSRApp:Bh,createSlots:kb,createStaticVNode:gy,createTextVNode:Uc,createVNode:xt,customRef:df,defineAsyncComponent:hb,defineComponent:fl,defineCustomElement:Ch,defineEmits:Ab,defineExpose:Rb,defineModel:Lb,defineOptions:Ib,defineProps:Eb,defineSSRCustomElement:sx,defineSlots:Ob,devtools:Ay,effect:Xv,effectScope:Jv,getCurrentInstance:fs,getCurrentScope:qp,getCurrentWatcher:Lg,getTransitionRawChildren:Po,guardReactiveProps:lh,h:si,handleError:Ea,hasInjectionContext:qg,hydrate:xx,hydrateOnIdle:rb,hydrateOnInteraction:pb,hydrateOnMediaQuery:ub,hydrateOnVisible:db,initCustomFormatter:Sy,initDirectivesForSSR:_x,inject:Us,isMemoSame:mh,isProxy:ul,isReactive:En,isReadonly:on,isRef:Dt,isRuntimeOnly:_y,isShallow:ws,isVNode:Dn,markRaw:rf,mergeDefaults:Pb,mergeModels:Fb,mergeProps:rh,nextTick:Rt,nodeOps:bh,normalizeClass:dl,normalizeProps:Fv,normalizeStyle:cl,onActivated:ms,onBeforeMount:Rf,onBeforeUnmount:Bo,onBeforeUpdate:Oc,onDeactivated:ls,onErrorCaptured:Nf,onMounted:Ve,onRenderTracked:Lf,onRenderTriggered:Of,onScopeDispose:Yv,onServerPrefetch:If,onUnmounted:mt,onUpdated:$o,onWatcherCleanup:pf,openBlock:Yi,patchProp:Th,popScopeId:zg,provide:Di,proxyRefs:Tc,pushScopeId:Hg,queuePostFlushCb:Gi,reactive:ea,readonly:Wl,ref:h,registerRuntimeCompiler:ph,render:$h,renderList:wb,renderSlot:Sb,resolveComponent:yb,resolveDirective:_b,resolveDynamicComponent:xb,resolveFilter:Ly,resolveTransitionHooks:ti,setBlockTracking:Qi,setDevtoolsHook:Ry,setTransitionHooks:Nn,shallowReactive:kc,shallowReadonly:bg,shallowRef:Sc,ssrContextKey:bf,ssrUtils:Oy,stop:eg,toDisplayString:jp,toHandlerKey:Ga,toHandlers:Tb,toRaw:Je,toRef:Eg,toRefs:Sg,toValue:_g,transformVNodeArgs:my,triggerRef:xg,unref:ln,useAttrs:Mb,useCssModule:ix,useCssVars:jy,useHost:Eh,useId:eb,useModel:Kb,useSSRContext:yf,useShadowRoot:ax,useSlots:Db,useTemplateRef:tb,useTransitionState:Ac,vModelCheckbox:jc,vModelDynamic:Nh,vModelRadio:Vc,vModelSelect:Oh,vModelText:ro,vShow:kh,version:vh,warn:Cy,watch:Mt,watchEffect:Gg,watchPostEffect:Kg,watchSyncEffect:xf,withAsyncContext:Bb,withCtx:Ec,withDefaults:Nb,withDirectives:Vg,withKeys:yx,withMemo:Ty,withModifiers:gx,withScopeId:jg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const el=Symbol(""),$i=Symbol(""),qc=Symbol(""),uo=Symbol(""),zh=Symbol(""),wa=Symbol(""),jh=Symbol(""),Vh=Symbol(""),Gc=Symbol(""),Kc=Symbol(""),vl=Symbol(""),Wc=Symbol(""),qh=Symbol(""),Zc=Symbol(""),Jc=Symbol(""),Yc=Symbol(""),Qc=Symbol(""),Xc=Symbol(""),ed=Symbol(""),Gh=Symbol(""),Kh=Symbol(""),jo=Symbol(""),po=Symbol(""),td=Symbol(""),sd=Symbol(""),tl=Symbol(""),gl=Symbol(""),nd=Symbol(""),Zr=Symbol(""),kx=Symbol(""),Jr=Symbol(""),fo=Symbol(""),Sx=Symbol(""),Tx=Symbol(""),ad=Symbol(""),Cx=Symbol(""),Ex=Symbol(""),id=Symbol(""),Wh=Symbol(""),ii={[el]:"Fragment",[$i]:"Teleport",[qc]:"Suspense",[uo]:"KeepAlive",[zh]:"BaseTransition",[wa]:"openBlock",[jh]:"createBlock",[Vh]:"createElementBlock",[Gc]:"createVNode",[Kc]:"createElementVNode",[vl]:"createCommentVNode",[Wc]:"createTextVNode",[qh]:"createStaticVNode",[Zc]:"resolveComponent",[Jc]:"resolveDynamicComponent",[Yc]:"resolveDirective",[Qc]:"resolveFilter",[Xc]:"withDirectives",[ed]:"renderList",[Gh]:"renderSlot",[Kh]:"createSlots",[jo]:"toDisplayString",[po]:"mergeProps",[td]:"normalizeClass",[sd]:"normalizeStyle",[tl]:"normalizeProps",[gl]:"guardReactiveProps",[nd]:"toHandlers",[Zr]:"camelize",[kx]:"capitalize",[Jr]:"toHandlerKey",[fo]:"setBlockTracking",[Sx]:"pushScopeId",[Tx]:"popScopeId",[ad]:"withCtx",[Cx]:"unref",[Ex]:"isRef",[id]:"withMemo",[Wh]:"isMemoSame"};function Ax(e){Object.getOwnPropertySymbols(e).forEach(t=>{ii[t]=e[t]})}const Os={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Rx(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Os}}function sl(e,t,s,n,a,i,l,o=!1,r=!1,c=!1,d=Os){return e&&(o?(e.helper(wa),e.helper(ri(e.inSSR,c))):e.helper(oi(e.inSSR,c)),l&&e.helper(Xc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function ba(e,t=Os){return{type:17,loc:t,elements:e}}function Bs(e,t=Os){return{type:15,loc:t,properties:e}}function Nt(e,t){return{type:16,loc:Os,key:Be(e)?He(e,!0):e,value:t}}function He(e,t=!1,s=Os,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Gs(e,t=Os){return{type:8,loc:t,children:e}}function Ut(e,t=[],s=Os){return{type:14,loc:s,callee:e,arguments:t}}function li(e,t=void 0,s=!1,n=!1,a=Os){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Yr(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Os}}function Ix(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Os}}function Ox(e){return{type:21,body:e,loc:Os}}function oi(e,t){return e||t?Gc:Kc}function ri(e,t){return e||t?jh:Vh}function ld(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(oi(n,e.isComponent)),t(wa),t(ri(n,e.isComponent)))}const yu=new Uint8Array([123,123]),xu=new Uint8Array([125,125]);function _u(e){return e>=97&&e<=122||e>=65&&e<=90}function Es(e){return e===32||e===10||e===9||e===12||e===13}function jn(e){return e===47||e===62||Es(e)}function ho(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Xt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Lx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=yu,this.delimiterClose=xu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=yu,this.delimiterClose=xu}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,o=a;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?jn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Es(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Xt.TitleEnd||this.currentSequence===Xt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Xt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Xt.Cdata.length&&(this.state=28,this.currentSequence=Xt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Xt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):_u(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){jn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(jn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(ho("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Es(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=_u(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Es(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Es(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Es(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||jn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||jn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||jn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||jn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||jn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Es(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Es(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Es(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Xt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Xt.ScriptEnd[3]?this.startSpecial(Xt.ScriptEnd,4):t===Xt.StyleEnd[3]?this.startSpecial(Xt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Xt.TitleEnd[3]?this.startSpecial(Xt.TitleEnd,4):t===Xt.TextareaEnd[3]?this.startSpecial(Xt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Xt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function wu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ya(e,t){const s=wu("MODE",t),n=wu(e,t);return s===3?n===!0:n!==!1}function nl(e,t,s,...n){return ya(e,t)}function od(e){throw e}function Zh(e){}function bt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const _s=e=>e.type===4&&e.isStatic;function Jh(e){switch(e){case"Teleport":case"teleport":return $i;case"Suspense":case"suspense":return qc;case"KeepAlive":case"keep-alive":return uo;case"BaseTransition":case"base-transition":return zh}}const Nx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,rd=e=>!Nx.test(e),Yh=/[A-Za-z_$\xA0-\uFFFF]/,Dx=/[\.\?\w$\xA0-\uFFFF]/,Mx=/\s+[.[]\s*|\s*[.[]\s+/g,Qh=e=>e.type===4?e.content:e.loc.source,Px=e=>{const t=Qh(e).trim().replace(Mx,o=>o.trim());let s=0,n=[],a=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")n.push(s),s=1,a++;else if(r==="(")n.push(s),s=2,i++;else if(!(o===0?Yh:Dx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(n.push(s),s=3,l=r):r==="["?a++:r==="]"&&(--a||(s=n.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")n.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=n.pop())}break;case 3:r===l&&(s=n.pop(),l=null);break}}return!a&&!i},Xh=Px,Fx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,$x=e=>Fx.test(Qh(e)),Bx=$x;function $s(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Be(t)?a.name===t:t.test(a.name)))return a}}function Vo(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&ua(i.arg,t))return i}}function ua(e,t){return!!(e&&_s(e)&&e.content===t)}function Ux(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function pr(e){return e.type===5||e.type===2}function ku(e){return e.type===7&&e.name==="pre"}function Hx(e){return e.type===7&&e.name==="slot"}function mo(e){return e.type===1&&e.tagType===3}function vo(e){return e.type===1&&e.tagType===2}const zx=new Set([tl,gl]);function em(e,t=[]){if(e&&!Be(e)&&e.type===14){const s=e.callee;if(!Be(s)&&zx.has(s))return em(e.arguments[0],t.concat(e))}return[e,t]}function go(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Be(a)&&a.type===14){const o=em(a);a=o[0],i=o[1],l=i[i.length-1]}if(a==null||Be(a))n=Bs([t]);else if(a.type===14){const o=a.arguments[0];!Be(o)&&o.type===15?Su(t,o)||o.properties.unshift(t):a.callee===nd?n=Ut(s.helper(po),[Bs([t]),a]):a.arguments.unshift(Bs([t])),!n&&(n=a)}else a.type===15?(Su(t,a)||a.properties.unshift(t),n=a):(n=Ut(s.helper(po),[Bs([t]),a]),l&&l.callee===gl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Su(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function al(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function jx(e){return e.type===14&&e.callee===id?e.arguments[1].returns:e}const Vx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function tm(e){for(let t=0;t<e.length;t++)if(!Es(e.charCodeAt(t)))return!1;return!0}function cd(e){return e.type===2&&tm(e.content)||e.type===12&&cd(e.content)}function sm(e){return e.type===3||cd(e)}const nm={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:za,isPreTag:za,isIgnoreNewlineTag:za,isCustomElement:za,onError:od,onWarn:Zh,comments:!1,prefixIdentifiers:!1};let et=nm,il=null,Rn="",ts=null,We=null,vs="",gn=-1,ra=-1,dd=0,Zn=!1,Qr=null;const gt=[],Ct=new Lx(gt,{onerr:hn,ontext(e,t){Ol(Kt(e,t),e,t)},ontextentity(e,t,s){Ol(e,t,s)},oninterpolation(e,t){if(Zn)return Ol(Kt(e,t),e,t);let s=e+Ct.delimiterOpen.length,n=t-Ct.delimiterClose.length;for(;Es(Rn.charCodeAt(s));)s++;for(;Es(Rn.charCodeAt(n-1));)n--;let a=Kt(s,n);a.includes("&")&&(a=et.decodeEntities(a,!1)),Xr({type:5,content:zl(a,!1,At(s,n)),loc:At(e,t)})},onopentagname(e,t){const s=Kt(e,t);ts={type:1,tag:s,ns:et.getNamespace(s,gt[0],et.ns),tagType:0,props:[],children:[],loc:At(e-1,t),codegenNode:void 0}},onopentagend(e){Cu(e)},onclosetag(e,t){const s=Kt(e,t);if(!et.isVoidTag(s)){let n=!1;for(let a=0;a<gt.length;a++)if(gt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&hn(24,gt[0].loc.start.offset);for(let l=0;l<=a;l++){const o=gt.shift();Hl(o,t,l<a)}break}n||hn(23,am(e,60))}},onselfclosingtag(e){const t=ts.tag;ts.isSelfClosing=!0,Cu(e),gt[0]&&gt[0].tag===t&&Hl(gt.shift(),e)},onattribname(e,t){We={type:6,name:Kt(e,t),nameLoc:At(e,t),value:void 0,loc:At(e)}},ondirname(e,t){const s=Kt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Zn&&n===""&&hn(26,e),Zn||n==="")We={type:6,name:s,nameLoc:At(e,t),value:void 0,loc:At(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[He("prop")]:[],loc:At(e)},n==="pre"){Zn=Ct.inVPre=!0,Qr=ts;const a=ts.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=e0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Kt(e,t);if(Zn&&!ku(We))We.name+=s,pa(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=zl(n?s:s.slice(1,-1),n,At(e,t),n?3:0)}},ondirmodifier(e,t){const s=Kt(e,t);if(Zn&&!ku(We))We.name+="."+s,pa(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,pa(n.loc,t))}else{const n=He(s,!0,At(e,t));We.modifiers.push(n)}},onattribdata(e,t){vs+=Kt(e,t),gn<0&&(gn=e),ra=t},onattribentity(e,t,s){vs+=e,gn<0&&(gn=t),ra=s},onattribnameend(e){const t=We.loc.start.offset,s=Kt(t,e);We.type===7&&(We.rawName=s),ts.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&hn(2,t)},onattribend(e,t){if(ts&&We){if(pa(We.loc,t),e!==0)if(vs.includes("&")&&(vs=et.decodeEntities(vs,!0)),We.type===6)We.name==="class"&&(vs=lm(vs).trim()),e===1&&!vs&&hn(13,t),We.value={type:2,content:vs,loc:e===1?At(gn,ra):At(gn-1,ra+1)},Ct.inSFCRoot&&ts.tag==="template"&&We.name==="lang"&&vs&&vs!=="html"&&Ct.enterRCDATA(ho("</template"),0);else{let s=0;We.exp=zl(vs,!1,At(gn,ra),0,s),We.name==="for"&&(We.forParseResult=Gx(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&nl("COMPILER_V_BIND_SYNC",et,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&ts.props.push(We)}vs="",gn=ra=-1},oncomment(e,t){et.comments&&Xr({type:3,content:Kt(e,t),loc:At(e-4,t+3)})},onend(){const e=Rn.length;for(let t=0;t<gt.length;t++)Hl(gt[t],e-1),hn(24,gt[t].loc.start.offset)},oncdata(e,t){(gt[0]?gt[0].ns:et.ns)!==0?Ol(Kt(e,t),e,t):hn(1,e-9)},onprocessinginstruction(e){(gt[0]?gt[0].ns:et.ns)===0&&hn(21,e-1)}}),Tu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,qx=/^\(|\)$/g;function Gx(e){const t=e.loc,s=e.content,n=s.match(Vx);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const m=t.start.offset+p,v=m+u.length;return zl(u,!1,At(m,v),0,f?1:0)},o={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=a.trim().replace(qx,"").trim();const c=a.indexOf(r),d=r.match(Tu);if(d){r=r.replace(Tu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(o.index=l(f,s.indexOf(f,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Kt(e,t){return Rn.slice(e,t)}function Cu(e){Ct.inSFCRoot&&(ts.innerLoc=At(e+1,e+1)),Xr(ts);const{tag:t,ns:s}=ts;s===0&&et.isPreTag(t)&&dd++,et.isVoidTag(t)?Hl(ts,e):(gt.unshift(ts),(s===1||s===2)&&(Ct.inXML=!0)),ts=null}function Ol(e,t,s){{const i=gt[0]&&gt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=et.decodeEntities(e,!1))}const n=gt[0]||il,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,pa(a.loc,s)):n.children.push({type:2,content:e,loc:At(t,s)})}function Hl(e,t,s=!1){s?pa(e.loc,am(t,60)):pa(e.loc,Kx(t,62)+1),Ct.inSFCRoot&&(e.children.length?e.innerLoc.end=qe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=qe({},e.innerLoc.start),e.innerLoc.source=Kt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Zn||(n==="slot"?e.tagType=2:Eu(e)?e.tagType=3:Zx(e)&&(e.tagType=1)),Ct.inRCDATA||(e.children=im(i)),a===0&&et.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&et.isPreTag(n)&&dd--,Qr===e&&(Zn=Ct.inVPre=!1,Qr=null),Ct.inXML&&(gt[0]?gt[0].ns:et.ns)===0&&(Ct.inXML=!1);{const l=e.props;if(!Ct.inSFCRoot&&ya("COMPILER_NATIVE_TEMPLATE",et)&&e.tag==="template"&&!Eu(e)){const r=gt[0]||il,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&nl("COMPILER_INLINE_TEMPLATE",et,o.loc)&&e.children.length&&(o.value={type:2,content:Kt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function Kx(e,t){let s=e;for(;Rn.charCodeAt(s)!==t&&s<Rn.length-1;)s++;return s}function am(e,t){let s=e;for(;Rn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Wx=new Set(["if","else","else-if","for","slot"]);function Eu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Wx.has(t[s].name))return!0}return!1}function Zx({tag:e,props:t}){if(et.isCustomElement(e))return!1;if(e==="component"||Jx(e.charCodeAt(0))||Jh(e)||et.isBuiltInComponent&&et.isBuiltInComponent(e)||et.isNativeTag&&!et.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(nl("COMPILER_IS_ON_ELEMENT",et,n.loc))return!0}}else if(n.name==="bind"&&ua(n.arg,"is")&&nl("COMPILER_IS_ON_ELEMENT",et,n.loc))return!0}return!1}function Jx(e){return e>64&&e<91}const Yx=/\r\n/g;function im(e){const t=et.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(dd)a.content=a.content.replace(Yx,`
`);else if(tm(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Qx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=lm(a.content))}return s?e.filter(Boolean):e}function Qx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function lm(e){let t="",s=!1;for(let n=0;n<e.length;n++)Es(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Xr(e){(gt[0]||il).children.push(e)}function At(e,t){return{start:Ct.getPos(e),end:t==null?t:Ct.getPos(t),source:t==null?t:Kt(e,t)}}function Xx(e){return At(e.start.offset,e.end.offset)}function pa(e,t){e.end=Ct.getPos(t),e.source=Kt(e.start.offset,t)}function e0(e){const t={type:6,name:e.rawName,nameLoc:At(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function zl(e,t=!1,s,n=0,a=0){return He(e,t,s,n)}function hn(e,t,s){et.onError(bt(e,At(t,t)))}function t0(){Ct.reset(),ts=null,We=null,vs="",gn=-1,ra=-1,gt.length=0}function s0(e,t){if(t0(),Rn=e,et=qe({},nm),t){let a;for(a in t)t[a]!=null&&(et[a]=t[a])}Ct.mode=et.parseMode==="html"?1:et.parseMode==="sfc"?2:0,Ct.inXML=et.ns===1||et.ns===2;const s=t&&t.delimiters;s&&(Ct.delimiterOpen=ho(s[0]),Ct.delimiterClose=ho(s[1]));const n=il=Rx([],e);return Ct.parse(Rn),n.loc=At(0,e.length),n.children=im(n.children),il=null,n}function n0(e,t){jl(e,void 0,t,!!om(e))}function om(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!vo(t[0])?t[0]:null}function jl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:As(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const m=f.patchFlag;if((m===void 0||m===512||m===1)&&cm(u,s)>=2){const v=dm(u);v&&(f.props=s.hoist(v))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:As(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,jl(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)jl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)jl(u.branches[p],e,s,u.branches[p].children.length===1,a)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ce(e.codegenNode.children))e.codegenNode.children=r(ba(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ce(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(ba(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ce(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=$s(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(ba(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ce(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function As(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const o=cm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=As(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=As(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(wa),t.removeHelper(ri(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(oi(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return As(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Be(o)||is(o))continue;const r=As(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const a0=new Set([td,sd,tl,gl]);function rm(e,t){if(e.type===14&&!Be(e.callee)&&a0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return As(s,t);if(s.type===14)return rm(s,t)}return 0}function cm(e,t){let s=3;const n=dm(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:o}=a[i],r=As(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=As(o,t):o.type===14?c=rm(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function dm(e){const t=e.codegenNode;if(t.type===13)return t.props}function i0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Jt,isCustomElement:d=Jt,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:w="",bindingMetadata:L=Ge,inline:x=!1,isTS:g=!1,onError:b=od,onWarn:C=Zh,compatConfig:S}){const A=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:A&&Ca(pt(A[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:m,inSSR:v,ssrCssVars:w,bindingMetadata:L,inline:x,isTS:g,onError:b,onWarn:C,compatConfig:S,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(y){const O=T.helpers.get(y)||0;return T.helpers.set(y,O+1),y},removeHelper(y){const O=T.helpers.get(y);if(O){const $=O-1;$?T.helpers.set(y,$):T.helpers.delete(y)}},helperString(y){return`_${ii[T.helper(y)]}`},replaceNode(y){T.parent.children[T.childIndex]=T.currentNode=y},removeNode(y){const O=T.parent.children,$=y?O.indexOf(y):T.currentNode?T.childIndex:-1;!y||y===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>$&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice($,1)},onNodeRemoved:Jt,addIdentifiers(y){},removeIdentifiers(y){},hoist(y){Be(y)&&(y=He(y)),T.hoists.push(y);const O=He(`_hoisted_${T.hoists.length}`,!1,y.loc,2);return O.hoisted=y,O},cache(y,O=!1,$=!1){const k=Ix(T.cached.length,y,O,$);return T.cached.push(k),k}};return T.filters=new Set,T}function l0(e,t){const s=i0(e,t);qo(e,s),t.hoistStatic&&n0(e,s),t.ssr||o0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function o0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=om(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&ld(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=sl(t,s(el),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function r0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Be(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,qo(a,t))}}function qo(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ce(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(vl);break;case 5:t.ssr||t.helper(jo);break;case 9:for(let i=0;i<e.branches.length;i++)qo(e.branches[i],t);break;case 10:case 11:case 1:case 0:r0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function um(e,t){const s=Be(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(Hx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(n,r,a);c&&l.push(c)}}return l}}}const Go="/*@__PURE__*/",pm=e=>`${ii[e]}: _${ii[e]}`;function c0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${ii[v]}`},push(v,w=-2,L){f.code+=v},indent(){m(++f.indentLevel)},deindent(v=!1){v?--f.indentLevel:m(--f.indentLevel)},newline(){m(f.indentLevel)}};function m(v){f.push(`
`+"  ".repeat(v),0)}return f}function d0(e,t={}){const s=c0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";u0(e,s);const v=d?"ssrRender":"render",L=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${L}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(pm).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(fr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(fr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),fr(e.filters,"filter",s),r()),e.temps>0){a("let ");for(let x=0;x<e.temps;x++)a(`${x>0?", ":""}_temp${x}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),r()),d||a("return "),e.codegenNode?as(e.codegenNode,s):a("null"),f&&(o(),a("}")),o(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function u0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Gc,Kc,vl,Wc,qh].filter(p=>d.includes(p)).map(pm).join(", ");a(`const { ${u} } = _Vue
`,-1)}p0(e.hoists,t),i(),a("return ")}function fr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Qc:t==="component"?Zc:Yc);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),n(`const ${al(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&a()}}function p0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),as(i,t),n())}t.pure=!1}function ud(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),bl(e,t,s),s&&t.deindent(),t.push("]")}function bl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Be(o)?a(o,-3):Ce(o)?ud(o,t):as(o,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function as(e,t){if(Be(e)){t.push(e,-3);return}if(is(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:as(e.codegenNode,t);break;case 2:f0(e,t);break;case 4:fm(e,t);break;case 5:h0(e,t);break;case 12:as(e.codegenNode,t);break;case 8:hm(e,t);break;case 3:v0(e,t);break;case 13:g0(e,t);break;case 14:y0(e,t);break;case 15:x0(e,t);break;case 17:_0(e,t);break;case 18:w0(e,t);break;case 19:k0(e,t);break;case 20:S0(e,t);break;case 21:bl(e.body,t,!0,!1);break}}function f0(e,t){t.push(JSON.stringify(e.content),-3,e)}function fm(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function h0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Go),s(`${n(jo)}(`),as(e.content,t),s(")")}function hm(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Be(n)?t.push(n,-3):as(n,t)}}function m0(e,t){const{push:s}=t;if(e.type===8)s("["),hm(e,t),s("]");else if(e.isStatic){const n=rd(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function v0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Go),s(`${n(vl)}(${JSON.stringify(e.content)})`,-3,e)}function g0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let m;r&&(m=String(r)),d&&s(n(Xc)+"("),u&&s(`(${n(wa)}(${p?"true":""}), `),a&&s(Go);const v=u?ri(t.inSSR,f):oi(t.inSSR,f);s(n(v)+"(",-2,e),bl(b0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),as(d,t),s(")"))}function b0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function y0(e,t){const{push:s,helper:n,pure:a}=t,i=Be(e.callee)?e.callee:n(e.callee);a&&s(Go),s(i+"(",-2,e),bl(e.arguments,t),s(")")}function x0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&n();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];m0(c,t),s(": "),as(d,t),r<l.length-1&&(s(","),i())}o&&a(),s(o?"}":" }")}function _0(e,t){ud(e.elements,t)}function w0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${ii[ad]}(`),s("(",-2,e),Ce(i)?bl(i,t):i&&as(i,t),s(") => "),(r||o)&&(s("{"),n()),l?(r&&s("return "),Ce(l)?ud(l,t):as(l,t)):o&&as(o,t),(r||o)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function k0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!rd(s.content);u&&l("("),fm(s,t),u&&l(")")}else l("("),as(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),as(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,as(a,t),d||t.indentLevel--,i&&r(!0)}function S0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(a(),s(`${n(fo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),as(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(fo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const T0=um(/^(?:if|else|else-if)$/,(e,t,s)=>C0(e,t,s,(n,a,i)=>{const l=s.parent.children;let o=l.indexOf(n),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)n.codegenNode=Ru(a,r,s);else{const c=E0(n.codegenNode);c.alternate=Ru(a,r+n.branches.length-1,s)}}}));function C0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(bt(28,t.loc)),t.exp=He("true",!1,a)}if(t.name==="if"){const a=Au(e,t),i={type:9,loc:Xx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&sm(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(bt(30,e.loc)),s.removeNode();const o=Au(e,t);l.branches.push(o);const r=n&&n(l,o,!1);qo(o,s),r&&r(),s.currentNode=null}else s.onError(bt(30,e.loc));break}}}function Au(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!$s(e,"for")?e.children:[e],userKey:Vo(e,"key"),isTemplateIf:s}}function Ru(e,t,s){return e.condition?Yr(e.condition,Iu(e,t,s),Ut(s.helper(vl),['""',"true"])):Iu(e,t,s)}function Iu(e,t,s){const{helper:n}=s,a=Nt("key",He(`${t}`,!1,Os,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return go(r,a,s),r}else return sl(s,n(el),Bs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=jx(r);return c.type===13&&ld(c,s),go(c,a,s),r}}function E0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const A0=um("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return R0(e,t,s,i=>{const l=Ut(n(ed),[i.source]),o=mo(e),r=$s(e,"memo"),c=Vo(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?He(c.value.content,!0):void 0:c.exp);const u=d?Nt("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=sl(s,n(el),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,w=v.length!==1||v[0].type!==1,L=vo(e)?e:o&&e.children.length===1&&vo(e.children[0])?e.children[0]:null;if(L?(m=L.codegenNode,o&&u&&go(m,u,s)):w?m=sl(s,n(el),u?Bs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&go(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(wa),a(ri(s.inSSR,m.isComponent))):a(oi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(wa),n(ri(s.inSSR,m.isComponent))):n(oi(s.inSSR,m.isComponent))),r){const x=li(ec(i.parseResult,[He("_cached")]));x.body=Ox([Gs(["const _memo = (",r.exp,")"]),Gs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Wh)}(_cached, _memo)) return _cached`]),Gs(["const _item = ",m]),He("_item.memo = _memo"),He("return _item")]),l.arguments.push(x,He("_cache"),He(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(li(ec(i.parseResult),m,!0))}})});function R0(e,t,s,n){if(!t.exp){s.onError(bt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(bt(32,t.loc));return}mm(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:mo(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const f=n&&n(p);return()=>{o.vFor--,f&&f()}}function mm(e,t){e.finalized||(e.finalized=!0)}function ec({value:e,key:t,index:s},n=[]){return I0([e,t,s,...n])}function I0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||He("_".repeat(n+1),!1))}const Ou=He("undefined",!1),O0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=$s(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},L0=(e,t,s,n)=>li(e,s,!1,!0,s.length?s[0].loc:n);function N0(e,t,s=L0){t.helper(ad);const{children:n,loc:a}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=$s(e,"slot",!0);if(r){const{arg:w,exp:L}=r;w&&!_s(w)&&(o=!0),i.push(Nt(w||He("default",!0),s(L,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let w=0;w<n.length;w++){const L=n[w];let x;if(!mo(L)||!(x=$s(L,"slot",!0))){L.type!==3&&u.push(L);continue}if(r){t.onError(bt(37,x.loc));break}c=!0;const{children:g,loc:b}=L,{arg:C=He("default",!0),exp:S,loc:A}=x;let T;_s(C)?T=C?C.content:"default":o=!0;const y=$s(L,"for"),O=s(S,y,g,b);let $,k;if($=$s(L,"if"))o=!0,l.push(Yr($.exp,Ll(C,O,f++),Ou));else if(k=$s(L,/^else(?:-if)?$/,!0)){let M=w,j;for(;M--&&(j=n[M],!!sm(j)););if(j&&mo(j)&&$s(j,/^(?:else-)?if$/)){let q=l[l.length-1];for(;q.alternate.type===19;)q=q.alternate;q.alternate=k.exp?Yr(k.exp,Ll(C,O,f++),Ou):Ll(C,O,f++)}else t.onError(bt(30,k.loc))}else if(y){o=!0;const M=y.forParseResult;M?(mm(M),l.push(Ut(t.helper(ed),[M.source,li(ec(M),Ll(C,O),!0)]))):t.onError(bt(32,y.loc))}else{if(T){if(p.has(T)){t.onError(bt(38,A));continue}p.add(T),T==="default"&&(d=!0)}i.push(Nt(C,O))}}if(!r){const w=(L,x)=>{const g=s(L,void 0,x,a);return t.compatConfig&&(g.isNonScopedSlot=!0),Nt("default",g)};c?u.length&&!u.every(cd)&&(d?t.onError(bt(39,u[0].loc)):i.push(w(void 0,u))):i.push(w(void 0,n))}const m=o?2:Vl(e.children)?3:1;let v=Bs(i.concat(Nt("_",He(m+"",!1))),a);return l.length&&(v=Ut(t.helper(Kh),[v,ba(l)])),{slots:v,hasDynamicSlots:o}}function Ll(e,t,s){const n=[Nt("name",e),Nt("fn",t)];return s!=null&&n.push(Nt("key",He(String(s),!0))),Bs(n)}function Vl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Vl(s.children))return!0;break;case 9:if(Vl(s.branches))return!0;break;case 10:case 11:if(Vl(s.children))return!0;break}}return!1}const vm=new WeakMap,D0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?M0(e,t):`"${n}"`;const o=tt(l)&&l.callee===Jc;let r,c,d=0,u,p,f,m=o||l===$i||l===qc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=gm(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const w=v.directives;f=w&&w.length?ba(w.map(L=>F0(L,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===uo&&(m=!0,d|=1024),i&&l!==$i&&l!==uo){const{slots:w,hasDynamicSlots:L}=N0(e,t);c=w,L&&(d|=1024)}else if(e.children.length===1&&l!==$i){const w=e.children[0],L=w.type,x=L===5||L===8;x&&As(w,t)===0&&(d|=1),x||L===2?c=w:c=e.children}else c=e.children;p&&p.length&&(u=$0(p)),e.codegenNode=sl(t,l,r,c,d===0?void 0:d,u,f,!!m,!1,i,e.loc)};function M0(e,t,s=!1){let{tag:n}=e;const a=tc(n),i=Vo(e,"is",!1,!0);if(i)if(a||ya("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&He(i.value.content,!0):(o=i.exp,o||(o=He("is",!1,i.arg.loc))),o)return Ut(t.helper(Jc),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Jh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Zc),t.components.add(n),al(n,"component"))}function gm(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let f=!1,m=0,v=!1,w=!1,L=!1,x=!1,g=!1,b=!1;const C=[],S=O=>{c.length&&(d.push(Bs(Lu(c),o)),c=[]),O&&d.push(O)},A=()=>{t.scopes.vFor>0&&c.push(Nt(He("ref_for",!0),He("true")))},T=({key:O,value:$})=>{if(_s(O)){const k=O.content,M=Sa(k);if(M&&(!n||a)&&k.toLowerCase()!=="onclick"&&k!=="onUpdate:modelValue"&&!Cn(k)&&(x=!0),M&&Cn(k)&&(b=!0),M&&$.type===14&&($=$.arguments[0]),$.type===20||($.type===4||$.type===8)&&As($,t)>0)return;k==="ref"?v=!0:k==="class"?w=!0:k==="style"?L=!0:k!=="key"&&!C.includes(k)&&C.push(k),n&&(k==="class"||k==="style")&&!C.includes(k)&&C.push(k)}else g=!0};for(let O=0;O<s.length;O++){const $=s[O];if($.type===6){const{loc:k,name:M,nameLoc:j,value:q}=$;let D=!0;if(M==="ref"&&(v=!0,A()),M==="is"&&(tc(l)||q&&q.content.startsWith("vue:")||ya("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Nt(He(M,!0,j),He(q?q.content:"",D,q?q.loc:k)))}else{const{name:k,arg:M,exp:j,loc:q,modifiers:D}=$,R=k==="bind",I=k==="on";if(k==="slot"){n||t.onError(bt(40,q));continue}if(k==="once"||k==="memo"||k==="is"||R&&ua(M,"is")&&(tc(l)||ya("COMPILER_IS_ON_ELEMENT",t))||I&&i)continue;if((R&&ua(M,"key")||I&&p&&ua(M,"vue:before-update"))&&(f=!0),R&&ua(M,"ref")&&A(),!M&&(R||I)){if(g=!0,j)if(R){if(S(),ya("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(j);continue}A(),S(),d.push(j)}else S({type:14,loc:q,callee:t.helper(nd),arguments:n?[j]:[j,"true"]});else t.onError(bt(R?34:35,q));continue}R&&D.some(Z=>Z.content==="prop")&&(m|=32);const U=t.directiveTransforms[k];if(U){const{props:Z,needRuntime:W}=U($,e,t);!i&&Z.forEach(T),I&&M&&!_s(M)?S(Bs(Z,o)):c.push(...Z),W&&(u.push($),is(W)&&vm.set($,W))}else Av(k)||(u.push($),p&&(f=!0))}}let y;if(d.length?(S(),d.length>1?y=Ut(t.helper(po),d,o):y=d[0]):c.length&&(y=Bs(Lu(c),o)),g?m|=16:(w&&!n&&(m|=2),L&&!n&&(m|=4),C.length&&(m|=8),x&&(m|=32)),!f&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&y)switch(y.type){case 15:let O=-1,$=-1,k=!1;for(let q=0;q<y.properties.length;q++){const D=y.properties[q].key;_s(D)?D.content==="class"?O=q:D.content==="style"&&($=q):D.isHandlerKey||(k=!0)}const M=y.properties[O],j=y.properties[$];k?y=Ut(t.helper(tl),[y]):(M&&!_s(M.value)&&(M.value=Ut(t.helper(td),[M.value])),j&&(L||j.value.type===4&&j.value.content.trim()[0]==="["||j.value.type===17)&&(j.value=Ut(t.helper(sd),[j.value])));break;case 14:break;default:y=Ut(t.helper(tl),[Ut(t.helper(gl),[y])]);break}return{props:y,directives:u,patchFlag:m,dynamicPropNames:C,shouldUseBlock:f}}function Lu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Sa(i))&&P0(l,a):(t.set(i,a),s.push(a))}return s}function P0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=ba([e.value,t.value],e.loc)}function F0(e,t){const s=[],n=vm.get(e);n?s.push(t.helperString(n)):(t.helper(Yc),t.directives.add(e.name),s.push(al(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=He("true",!1,a);s.push(Bs(e.modifiers.map(l=>Nt(l,i)),a))}return ba(s,e.loc)}function $0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function tc(e){return e==="component"||e==="Component"}const B0=(e,t)=>{if(vo(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=U0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=li([],s,!1,!1,n),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Ut(t.helper(Gh),l,n)}};function U0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=pt(l.name),a.push(l)));else if(l.name==="bind"&&ua(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=pt(l.arg.content);s=l.exp=He(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&_s(l.arg)&&(l.arg.content=pt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=gm(e,t,a,!1,!1);n=i,l.length&&t.onError(bt(36,l[0].loc))}return{slotName:s,slotProps:n}}const bm=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(bt(35,a));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ga(pt(u)):`on:${u}`;o=He(p,!0,l.loc)}else o=Gs([`${s.helperString(Jr)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(Jr)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=Xh(r),p=!(u||Bx(r)),f=r.content.includes(";");(p||c&&u)&&(r=Gs([`${p?"$event":"(...args)"} => ${f?"{":"("}`,r,f?"}":")"]))}let d={props:[Nt(o,r||He("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},H0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=pt(i.content):i.content=`${s.helperString(Zr)}(${i.content})`:(i.children.unshift(`${s.helperString(Zr)}(`),i.children.push(")"))),s.inSSR||(n.some(o=>o.content==="prop")&&Nu(i,"."),n.some(o=>o.content==="attr")&&Nu(i,"^")),{props:[Nt(i,l)]}},Nu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},z0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(pr(l)){a=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(pr(r))n||(n=s[i]=Gs([l],l.loc)),n.children.push(" + ",r),s.splice(o,1),o--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(pr(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&As(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Ut(t.helper(Wc),o)}}}}},Du=new WeakSet,j0=(e,t)=>{if(e.type===1&&$s(e,"once",!0))return Du.has(e)||t.inVOnce||t.inSSR?void 0:(Du.add(e),t.inVOnce=!0,t.helper(fo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},ym=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(bt(41,e.loc)),_i();const i=n.loc.source.trim(),l=n.type===4?n.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(bt(44,n.loc)),_i();if(o==="literal-const"||o==="setup-const")return s.onError(bt(45,n.loc)),_i();if(!l.trim()||!Xh(n))return s.onError(bt(42,n.loc)),_i();const r=a||He("modelValue",!0),c=a?_s(a)?`onUpdate:${pt(a.content)}`:Gs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Gs([`${u} => ((`,n,") = $event)"]);const p=[Nt(r,e.exp),Nt(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(v=>v.content).map(v=>(rd(v)?v:JSON.stringify(v))+": true").join(", "),m=a?_s(a)?`${a.content}Modifiers`:Gs([a,' + "Modifiers"']):"modelModifiers";p.push(Nt(m,He(`{ ${f} }`,!1,e.loc,2)))}return _i(p)};function _i(e=[]){return{props:e}}const V0=/[\w).+\-_$\]]/,q0=(e,t)=>{ya("COMPILER_FILTERS",t)&&(e.type===5?bo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&bo(s.exp,t)}))};function bo(e,t){if(e.type===4)Mu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?Mu(n,t):n.type===8?bo(e,t):n.type===5&&bo(n.content,t))}}function Mu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,f,m,v=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!o&&!r&&!c)m===void 0?(d=f+1,m=s.slice(0,f).trim()):w();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let L=f-1,x;for(;L>=0&&(x=s.charAt(L),x===" ");L--);(!x||!V0.test(x))&&(l=!0)}}m===void 0?m=s.slice(0,f).trim():d!==0&&w();function w(){v.push(s.slice(d,f).trim()),d=f+1}if(v.length){for(f=0;f<v.length;f++)m=G0(m,v[f],t);e.content=m,e.ast=void 0}}function G0(e,t,s){s.helper(Qc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${al(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${al(a,"filter")}(${e}${i!==")"?","+i:i}`}}const Pu=new WeakSet,K0=(e,t)=>{if(e.type===1){const s=$s(e,"memo");return!s||Pu.has(e)||t.inSSR?void 0:(Pu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&ld(n,t),e.codegenNode=Ut(t.helper(id),[s.exp,li(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},W0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(bt(53,n.loc)),s.exp=He("",!0,n.loc);else{const a=pt(n.content);(Yh.test(a[0])||a[0]==="-")&&(s.exp=He(a,!1,n.loc))}}}};function Z0(e){return[[W0,j0,T0,K0,A0,q0,B0,D0,O0,z0],{on:bm,bind:H0,model:ym}]}function J0(e,t={}){const s=t.onError||od,n=t.mode==="module";t.prefixIdentifiers===!0?s(bt(48)):n&&s(bt(49));const a=!1;t.cacheHandlers&&s(bt(50)),t.scopeId&&!n&&s(bt(51));const i=qe({},t,{prefixIdentifiers:a}),l=Be(e)?s0(e,i):e,[o,r]=Z0();return l0(l,qe({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:qe({},r,t.directiveTransforms||{})})),d0(l,i)}const Y0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const xm=Symbol(""),_m=Symbol(""),wm=Symbol(""),km=Symbol(""),sc=Symbol(""),Sm=Symbol(""),Tm=Symbol(""),Cm=Symbol(""),Em=Symbol(""),Am=Symbol("");Ax({[xm]:"vModelRadio",[_m]:"vModelCheckbox",[wm]:"vModelText",[km]:"vModelSelect",[sc]:"vModelDynamic",[Sm]:"withModifiers",[Tm]:"withKeys",[Cm]:"vShow",[Em]:"Transition",[Am]:"TransitionGroup"});let Da;function Q0(e,t=!1){return Da||(Da=document.createElement("div")),t?(Da.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Da.children[0].getAttribute("foo")):(Da.innerHTML=e,Da.textContent)}const X0={parseMode:"html",isVoidTag:qv,isNativeTag:e=>zv(e)||jv(e)||Vv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:Q0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Em;if(e==="TransitionGroup"||e==="transition-group")return Am},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},e_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:He("style",!0,t.loc),exp:t_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},t_=(e,t)=>{const s=Up(e);return He(JSON.stringify(s),!1,t,3)};function Qn(e,t){return bt(e,t)}const s_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Qn(54,a)),t.children.length&&(s.onError(Qn(55,a)),t.children.length=0),{props:[Nt(He("innerHTML",!0,a),n||He("",!0))]}},n_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Qn(56,a)),t.children.length&&(s.onError(Qn(57,a)),t.children.length=0),{props:[Nt(He("textContent",!0),n?As(n,s)>0?n:Ut(s.helperString(jo),[n],a):He("",!0))]}},a_=(e,t,s)=>{const n=ym(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Qn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=wm,o=!1;if(a==="input"||i){const r=Vo(t,"type");if(r){if(r.type===7)l=sc;else if(r.value)switch(r.value.content){case"radio":l=xm;break;case"checkbox":l=_m;break;case"file":o=!0,s.onError(Qn(60,e.loc));break}}else Ux(t)&&(l=sc)}else a==="select"&&(l=km);o||(n.needRuntime=s.helper(l))}else s.onError(Qn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},i_=Is("passive,once,capture"),l_=Is("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),o_=Is("left,right"),Rm=Is("onkeyup,onkeydown,onkeypress"),r_=(e,t,s,n)=>{const a=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&nl("COMPILER_V_ON_NATIVE",s)||i_(r)?l.push(r):o_(r)?_s(e)?Rm(e.content.toLowerCase())?a.push(r):i.push(r):(a.push(r),i.push(r)):l_(r)?i.push(r):a.push(r)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Fu=(e,t)=>_s(e)&&e.content.toLowerCase()==="onclick"?He(t,!0):e.type!==4?Gs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,c_=(e,t,s)=>bm(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=r_(i,a,s,e.loc);if(r.includes("right")&&(i=Fu(i,"onContextmenu")),r.includes("middle")&&(i=Fu(i,"onMouseup")),r.length&&(l=Ut(s.helper(Sm),[l,JSON.stringify(r)])),o.length&&(!_s(i)||Rm(i.content.toLowerCase()))&&(l=Ut(s.helper(Tm),[l,JSON.stringify(o)])),c.length){const d=c.map(Ca).join("");i=_s(i)?He(`${i.content}${d}`,!0):Gs(["(",i,`) + "${d}"`])}return{props:[Nt(i,l)]}}),d_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Qn(62,a)),{props:[],needRuntime:s.helper(Cm)}},u_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},p_=[e_],f_={cloak:Y0,html:s_,text:n_,model:a_,on:c_,show:d_};function h_(e,t={}){return J0(e,qe({},X0,t,{nodeTransforms:[u_,...p_,...t.nodeTransforms||[]],directiveTransforms:qe({},f_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const $u=Object.create(null);function m_(e,t){if(!Be(e))if(e.nodeType)e=e.innerHTML;else return Jt;const s=Ov(e,t),n=$u[s];if(n)return n;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const a=qe({hoistStatic:!0,onError:void 0,onWarn:Jt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=o=>!!customElements.get(o));const{code:i}=h_(e,a),l=new Function("Vue",i)(wx);return l._rc=!0,$u[s]=l}ph(m_);const yo=ea({items:[]});let v_=1;function Ko(e,t="info",s=3e3){const n=v_++;return yo.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>pd(n),s),n}function pd(e){const t=yo.items.findIndex(s=>s.id===e);t>=0&&yo.items.splice(t,1)}function ye(e,t="info",s=3e3){return Ko(e,t,s)}ye.success=(e,t=3e3)=>Ko(e,"success",t);ye.error=(e,t=5e3)=>Ko(e,"error",t);ye.info=(e,t=3e3)=>Ko(e,"info",t);ye.dismiss=pd;const g_={setup(){return{state:yo,dismiss:pd}},template:`
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
  `},xn=ea({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Qa=null;function qt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Qa&&Qa(!1),xn.title=e,xn.message=t,xn.confirmLabel=s,xn.cancelLabel=n,xn.danger=a,xn.open=!0,new Promise(i=>{Qa=i})}function Bu(e){xn.open=!1,Qa&&(Qa(e),Qa=null)}const b_={setup(){function e(t){xn.open&&t.key==="Escape"&&(t.stopPropagation(),Bu(!1))}return Ve(()=>document.addEventListener("keydown",e,!0)),mt(()=>document.removeEventListener("keydown",e,!0)),{state:xn,settle:Bu}},template:`
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
 */const Ua=typeof document<"u";function Im(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function y_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Im(e.default)}const lt=Object.assign;function hr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ws(a)?a.map(e):e(a)}return s}const Bi=()=>{},Ws=Array.isArray;function Uu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Om=/#/g,x_=/&/g,__=/\//g,w_=/=/g,k_=/\?/g,Lm=/\+/g,S_=/%5B/g,T_=/%5D/g,Nm=/%5E/g,C_=/%60/g,Dm=/%7B/g,E_=/%7C/g,Mm=/%7D/g,A_=/%20/g;function fd(e){return e==null?"":encodeURI(""+e).replace(E_,"|").replace(S_,"[").replace(T_,"]")}function R_(e){return fd(e).replace(Dm,"{").replace(Mm,"}").replace(Nm,"^")}function nc(e){return fd(e).replace(Lm,"%2B").replace(A_,"+").replace(Om,"%23").replace(x_,"%26").replace(C_,"`").replace(Dm,"{").replace(Mm,"}").replace(Nm,"^")}function I_(e){return nc(e).replace(w_,"%3D")}function O_(e){return fd(e).replace(Om,"%23").replace(k_,"%3F")}function L_(e){return O_(e).replace(__,"%2F")}function ll(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const N_=/\/$/,D_=e=>e.replace(N_,"");function mr(e,t,s="/"){let n,a={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(n=t.slice(0,r),i=t.slice(r,o>0?o:t.length),a=e(i.slice(1))),o>=0&&(n=n||t.slice(0,o),l=t.slice(o,t.length)),n=$_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:ll(l)}}function M_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Hu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function P_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ci(t.matched[n],s.matched[a])&&Pm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ci(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Pm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!F_(e[s],t[s]))return!1;return!0}function F_(e,t){return Ws(e)?zu(e,t):Ws(t)?zu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function zu(e,t){return Ws(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function $_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,o;for(l=0;l<n.length;l++)if(o=n[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Vn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let ac=(function(e){return e.pop="pop",e.push="push",e})({}),vr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function B_(e){if(!e)if(Ua){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),D_(e)}const U_=/^[^#]+#/;function H_(e,t){return e.replace(U_,"#")+t}function z_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Wo=()=>({left:window.scrollX,top:window.scrollY});function j_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=z_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function ju(e,t){return(history.state?history.state.position-t:-1)+e}const ic=new Map;function V_(e,t){ic.set(e,t)}function q_(e){const t=ic.get(e);return ic.delete(e),t}function G_(e){return typeof e=="string"||e&&typeof e=="object"}function Fm(e){return typeof e=="string"||typeof e=="symbol"}let Tt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const $m=Symbol("");Tt.MATCHER_NOT_FOUND+"",Tt.NAVIGATION_GUARD_REDIRECT+"",Tt.NAVIGATION_ABORTED+"",Tt.NAVIGATION_CANCELLED+"",Tt.NAVIGATION_DUPLICATED+"";function di(e,t){return lt(new Error,{type:e,[$m]:!0},t)}function mn(e,t){return e instanceof Error&&$m in e&&(t==null||!!(e.type&t))}const K_=["params","query","hash"];function W_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of K_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Z_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Lm," "),i=a.indexOf("="),l=ll(i<0?a:a.slice(0,i)),o=i<0?null:ll(a.slice(i+1));if(l in t){let r=t[l];Ws(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Vu(e){let t="";for(let s in e){const n=e[s];if(s=I_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ws(n)?n.map(a=>a&&nc(a)):[n&&nc(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function J_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ws(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const Y_=Symbol(""),qu=Symbol(""),Zo=Symbol(""),hd=Symbol(""),lc=Symbol("");function wi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Jn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(di(Tt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):G_(p)?r(di(Tt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function gr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Im(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Jn(c,s,n,l,o,a))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=y_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Jn(p,s,n,l,o,a)()}))}}return i}function Q_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>ci(c,o))?n.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>ci(c,r))||a.push(r))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let X_=()=>location.protocol+"//"+location.host;function Bm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,o=a.slice(l);return o[0]!=="/"&&(o="/"+o),Hu(o,"")}return Hu(s,e)+n+a}function ew(e,t,s,n){let a=[],i=[],l=null;const o=({state:p})=>{const f=Bm(e,location),m=s.value,v=t.value;let w=0;if(p){if(s.value=f,t.value=p,l&&l===m){l=null;return}w=v?p.position-v.position:0}else n(f);a.forEach(L=>{L(s.value,m,{delta:w,type:ac.pop,direction:w?w>0?vr.forward:vr.back:vr.unknown})})};function r(){l=s.value}function c(p){a.push(p);const f=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(lt({},p.state,{scroll:Wo()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Gu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Wo():null}}function tw(e){const{history:t,location:s}=window,n={value:Bm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:X_()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(r,c){i(r,lt({},t.state,Gu(a.value.back,r,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=r}function o(r,c){const d=lt({},a.value,t.state,{forward:r,scroll:Wo()});i(d.current,d,!0),i(r,lt({},Gu(n.value,r,null),{position:d.position+1},c),!1),n.value=r}return{location:n,state:a,push:o,replace:l}}function sw(e){e=B_(e);const t=tw(e),s=ew(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=lt({location:"",base:e,go:n,createHref:H_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function nw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),sw(e)}let fa=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var $t=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})($t||{});const aw={type:fa.Static,value:""},iw=/[a-zA-Z0-9_]/;function lw(e){if(!e)return[[]];if(e==="/")return[[aw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=$t.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===$t.Static?i.push({type:fa.Static,value:c}):s===$t.Param||s===$t.ParamRegExp||s===$t.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:fa.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==$t.ParamRegExp){n=s,s=$t.EscapeNext;continue}switch(s){case $t.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=$t.Param):p();break;case $t.EscapeNext:p(),s=n;break;case $t.Param:r==="("?s=$t.ParamRegExp:iw.test(r)?p():(u(),s=$t.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case $t.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=$t.ParamRegExpEnd:d+=r;break;case $t.ParamRegExpEnd:u(),s=$t.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===$t.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Ku="[^/]+?",ow={sensitive:!1,strict:!1,start:!0,end:!0};var ds=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ds||{});const rw=/[.+*?^${}()[\]/\\]/g;function cw(e,t){const s=lt({},ow,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ds.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=ds.Segment+(s.sensitive?ds.BonusCaseSensitive:0);if(p.type===fa.Static)u||(a+="/"),a+=p.value.replace(rw,"\\$&"),f+=ds.Static;else if(p.type===fa.Param){const{value:m,repeatable:v,optional:w,regexp:L}=p;i.push({name:m,repeatable:v,optional:w});const x=L||Ku;if(x!==Ku){f+=ds.BonusCustomRegExp;try{`${x}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${x}): `+b.message)}}let g=v?`((?:${x})(?:/(?:${x}))*)`:`(${x})`;u||(g=w&&c.length<2?`(?:/${g})`:"/"+g),w&&(g+="?"),a+=g,f+=ds.Dynamic,w&&(f+=ds.BonusOptional),v&&(f+=ds.BonusRepeatable),x===".*"&&(f+=ds.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=ds.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",m=i[p-1];u[m.name]=f&&m.repeatable?f.split("/"):f}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===fa.Static)d+=f.value;else if(f.type===fa.Param){const{value:m,repeatable:v,optional:w}=f,L=m in c?c[m]:"";if(Ws(L)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const x=Ws(L)?L.join("/"):L;if(!x)if(w)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=x}}return d||"/"}return{re:l,score:n,keys:i,parse:o,stringify:r}}function dw(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===ds.Static+ds.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ds.Static+ds.Segment?1:-1:0}function Um(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=dw(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Wu(n))return 1;if(Wu(a))return-1}return a.length-n.length}function Wu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const uw={strict:!1,end:!0,sensitive:!1};function pw(e,t,s){const n=cw(lw(e.path),s),a=lt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function fw(e,t){const s=[],n=new Map;t=Uu(uw,t);function a(u){return n.get(u)}function i(u,p,f){const m=!f,v=Ju(u);v.aliasOf=f&&f.record;const w=Uu(t,u),L=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const C of b)L.push(Ju(lt({},v,{components:f?f.record.components:v.components,path:C,aliasOf:f?f.record:v})))}let x,g;for(const b of L){const{path:C}=b;if(p&&C[0]!=="/"){const S=p.record.path,A=S[S.length-1]==="/"?"":"/";b.path=p.record.path+(C&&A+C)}if(x=pw(b,p,w),f?f.alias.push(x):(g=g||x,g!==x&&g.alias.push(x),m&&u.name&&!Yu(x)&&l(u.name)),Hm(x)&&r(x),v.children){const S=v.children;for(let A=0;A<S.length;A++)i(S[A],x,f&&f.children[A])}f=f||x}return g?()=>{l(g)}:Bi}function l(u){if(Fm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=vw(u,s);s.splice(p,0,u),u.record.name&&!Yu(u)&&n.set(u.record.name,u)}function c(u,p){let f,m={},v,w;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw di(Tt.MATCHER_NOT_FOUND,{location:u});w=f.record.name,m=lt(Zu(p.params,f.keys.filter(g=>!g.optional).concat(f.parent?f.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Zu(u.params,f.keys.map(g=>g.name))),v=f.stringify(m)}else if(u.path!=null)v=u.path,f=s.find(g=>g.re.test(v)),f&&(m=f.parse(v),w=f.record.name);else{if(f=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!f)throw di(Tt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});w=f.record.name,m=lt({},p.params,u.params),v=f.stringify(m)}const L=[];let x=f;for(;x;)L.unshift(x.record),x=x.parent;return{name:w,path:v,params:m,matched:L,meta:mw(L)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:a}}function Zu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Ju(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:hw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function hw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Yu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function mw(e){return e.reduce((t,s)=>lt(t,s.meta),{})}function vw(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Um(e,t[i])<0?n=i:s=i+1}const a=gw(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function gw(e){let t=e;for(;t=t.parent;)if(Hm(t)&&Um(e,t)===0)return t}function Hm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Qu(e){const t=Us(Zo),s=Us(hd),n=K(()=>{const r=ln(e.to);return t.resolve(r)}),a=K(()=>{const{matched:r}=n.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(ci.bind(null,d));if(p>-1)return p;const f=Xu(r[c-2]);return c>1&&Xu(d)===f&&u[u.length-1].path!==f?u.findIndex(ci.bind(null,r[c-2])):p}),i=K(()=>a.value>-1&&ww(s.params,n.value.params)),l=K(()=>a.value>-1&&a.value===s.matched.length-1&&Pm(s.params,n.value.params));function o(r={}){if(_w(r)){const c=t[ln(e.replace)?"replace":"push"](ln(e.to)).catch(Bi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:K(()=>n.value.href),isActive:i,isExactActive:l,navigate:o}}function bw(e){return e.length===1?e[0]:e}const yw=fl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Qu,setup(e,{slots:t}){const s=ea(Qu(e)),{options:n}=Us(Zo),a=K(()=>({[ep(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[ep(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&bw(t.default(s));return e.custom?i:si("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),xw=yw;function _w(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function ww(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ws(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Xu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const ep=(e,t,s)=>e??t??s,kw=fl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Us(lc),a=K(()=>e.route||n.value),i=Us(qu,0),l=K(()=>{let c=ln(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=K(()=>a.value.matched[l.value]);Di(qu,K(()=>l.value+1)),Di(Y_,o),Di(lc,a);const r=h();return Mt(()=>[r.value,o.value,e.name],([c,d,u],[p,f,m])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!ci(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return tp(s.default,{Component:p,route:c});const f=u.props[d],m=f?f===!0?c.params:typeof f=="function"?f(c):f:null,w=si(p,lt({},m,t,{onVnodeUnmounted:L=>{L.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return tp(s.default,{Component:w,route:c})||w}}});function tp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Sw=kw;function Tw(e){const t=fw(e.routes,e),s=e.parseQuery||Z_,n=e.stringifyQuery||Vu,a=e.history,i=wi(),l=wi(),o=wi(),r=Sc(Vn);let c=Vn;Ua&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=hr.bind(null,Q=>""+Q),u=hr.bind(null,L_),p=hr.bind(null,ll);function f(Q,ge){let z,re;return Fm(Q)?(z=t.getRecordMatcher(Q),re=ge):re=Q,t.addRoute(re,z)}function m(Q){const ge=t.getRecordMatcher(Q);ge&&t.removeRoute(ge)}function v(){return t.getRoutes().map(Q=>Q.record)}function w(Q){return!!t.getRecordMatcher(Q)}function L(Q,ge){if(ge=lt({},ge||r.value),typeof Q=="string"){const P=mr(s,Q,ge.path),H=t.resolve({path:P.path},ge),ie=a.createHref(P.fullPath);return lt(P,H,{params:p(H.params),hash:ll(P.hash),redirectedFrom:void 0,href:ie})}let z;if(Q.path!=null)z=lt({},Q,{path:mr(s,Q.path,ge.path).path});else{const P=lt({},Q.params);for(const H in P)P[H]==null&&delete P[H];z=lt({},Q,{params:u(P)}),ge.params=u(ge.params)}const re=t.resolve(z,ge),pe=Q.hash||"";re.params=d(p(re.params));const Ie=M_(n,lt({},Q,{hash:R_(pe),path:re.path})),_=a.createHref(Ie);return lt({fullPath:Ie,hash:pe,query:n===Vu?J_(Q.query):Q.query||{}},re,{redirectedFrom:void 0,href:_})}function x(Q){return typeof Q=="string"?mr(s,Q,r.value.path):lt({},Q)}function g(Q,ge){if(c!==Q)return di(Tt.NAVIGATION_CANCELLED,{from:ge,to:Q})}function b(Q){return A(Q)}function C(Q){return b(lt(x(Q),{replace:!0}))}function S(Q,ge){const z=Q.matched[Q.matched.length-1];if(z&&z.redirect){const{redirect:re}=z;let pe=typeof re=="function"?re(Q,ge):re;return typeof pe=="string"&&(pe=pe.includes("?")||pe.includes("#")?pe=x(pe):{path:pe},pe.params={}),lt({query:Q.query,hash:Q.hash,params:pe.path!=null?{}:Q.params},pe)}}function A(Q,ge){const z=c=L(Q),re=r.value,pe=Q.state,Ie=Q.force,_=Q.replace===!0,P=S(z,re);if(P)return A(lt(x(P),{state:typeof P=="object"?lt({},pe,P.state):pe,force:Ie,replace:_}),ge||z);const H=z;H.redirectedFrom=ge;let ie;return!Ie&&P_(n,re,z)&&(ie=di(Tt.NAVIGATION_DUPLICATED,{to:H,from:re}),W(re,re,!0,!1)),(ie?Promise.resolve(ie):O(H,re)).catch(se=>mn(se)?mn(se,Tt.NAVIGATION_GUARD_REDIRECT)?se:Z(se):I(se,H,re)).then(se=>{if(se){if(mn(se,Tt.NAVIGATION_GUARD_REDIRECT))return A(lt({replace:_},x(se.to),{state:typeof se.to=="object"?lt({},pe,se.to.state):pe,force:Ie}),ge||H)}else se=k(H,re,!0,_,pe);return $(H,re,se),se})}function T(Q,ge){const z=g(Q,ge);return z?Promise.reject(z):Promise.resolve()}function y(Q){const ge=ee.values().next().value;return ge&&typeof ge.runWithContext=="function"?ge.runWithContext(Q):Q()}function O(Q,ge){let z;const[re,pe,Ie]=Q_(Q,ge);z=gr(re.reverse(),"beforeRouteLeave",Q,ge);for(const P of re)P.leaveGuards.forEach(H=>{z.push(Jn(H,Q,ge))});const _=T.bind(null,Q,ge);return z.push(_),Ne(z).then(()=>{z=[];for(const P of i.list())z.push(Jn(P,Q,ge));return z.push(_),Ne(z)}).then(()=>{z=gr(pe,"beforeRouteUpdate",Q,ge);for(const P of pe)P.updateGuards.forEach(H=>{z.push(Jn(H,Q,ge))});return z.push(_),Ne(z)}).then(()=>{z=[];for(const P of Ie)if(P.beforeEnter)if(Ws(P.beforeEnter))for(const H of P.beforeEnter)z.push(Jn(H,Q,ge));else z.push(Jn(P.beforeEnter,Q,ge));return z.push(_),Ne(z)}).then(()=>(Q.matched.forEach(P=>P.enterCallbacks={}),z=gr(Ie,"beforeRouteEnter",Q,ge,y),z.push(_),Ne(z))).then(()=>{z=[];for(const P of l.list())z.push(Jn(P,Q,ge));return z.push(_),Ne(z)}).catch(P=>mn(P,Tt.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function $(Q,ge,z){o.list().forEach(re=>y(()=>re(Q,ge,z)))}function k(Q,ge,z,re,pe){const Ie=g(Q,ge);if(Ie)return Ie;const _=ge===Vn,P=Ua?history.state:{};z&&(re||_?a.replace(Q.fullPath,lt({scroll:_&&P&&P.scroll},pe)):a.push(Q.fullPath,pe)),r.value=Q,W(Q,ge,z,_),Z()}let M;function j(){M||(M=a.listen((Q,ge,z)=>{if(!ce.listening)return;const re=L(Q),pe=S(re,ce.currentRoute.value);if(pe){A(lt(pe,{replace:!0,force:!0}),re).catch(Bi);return}c=re;const Ie=r.value;Ua&&V_(ju(Ie.fullPath,z.delta),Wo()),O(re,Ie).catch(_=>mn(_,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_CANCELLED)?_:mn(_,Tt.NAVIGATION_GUARD_REDIRECT)?(A(lt(x(_.to),{force:!0}),re).then(P=>{mn(P,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_DUPLICATED)&&!z.delta&&z.type===ac.pop&&a.go(-1,!1)}).catch(Bi),Promise.reject()):(z.delta&&a.go(-z.delta,!1),I(_,re,Ie))).then(_=>{_=_||k(re,Ie,!1),_&&(z.delta&&!mn(_,Tt.NAVIGATION_CANCELLED)?a.go(-z.delta,!1):z.type===ac.pop&&mn(_,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),$(re,Ie,_)}).catch(Bi)}))}let q=wi(),D=wi(),R;function I(Q,ge,z){Z(Q);const re=D.list();return re.length?re.forEach(pe=>pe(Q,ge,z)):console.error(Q),Promise.reject(Q)}function U(){return R&&r.value!==Vn?Promise.resolve():new Promise((Q,ge)=>{q.add([Q,ge])})}function Z(Q){return R||(R=!Q,j(),q.list().forEach(([ge,z])=>Q?z(Q):ge()),q.reset()),Q}function W(Q,ge,z,re){const{scrollBehavior:pe}=e;if(!Ua||!pe)return Promise.resolve();const Ie=!z&&q_(ju(Q.fullPath,0))||(re||!z)&&history.state&&history.state.scroll||null;return Rt().then(()=>pe(Q,ge,Ie)).then(_=>_&&j_(_)).catch(_=>I(_,Q,ge))}const J=Q=>a.go(Q);let oe;const ee=new Set,ce={currentRoute:r,listening:!0,addRoute:f,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:w,getRoutes:v,resolve:L,options:e,push:b,replace:C,go:J,back:()=>J(-1),forward:()=>J(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:D.add,isReady:U,install(Q){Q.component("RouterLink",xw),Q.component("RouterView",Sw),Q.config.globalProperties.$router=ce,Object.defineProperty(Q.config.globalProperties,"$route",{enumerable:!0,get:()=>ln(r)}),Ua&&!oe&&r.value===Vn&&(oe=!0,b(a.location).catch(re=>{}));const ge={};for(const re in Vn)Object.defineProperty(ge,re,{get:()=>r.value[re],enumerable:!0});Q.provide(Zo,ce),Q.provide(hd,kc(ge)),Q.provide(lc,r);const z=Q.unmount;ee.add(Q),Q.unmount=function(){ee.delete(Q),ee.size<1&&(c=Vn,M&&M(),M=null,r.value=Vn,oe=!1,R=!1),z()}}};function Ne(Q){return Q.reduce((ge,z)=>ge.then(()=>y(z)),Promise.resolve())}return ce}function zm(){return Us(Zo)}function Cw(e){return Us(hd)}const Jo={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Cw(),s=zm(),n=K({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),a=K(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.component)||null}),i=K(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.label)||""});Mt(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},ol=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),cn=e=>Number.isSafeInteger(e)&&e>=0,Ew=e=>e===null||typeof e=="string",xo=(e,t)=>cn(e)&&cn(t)&&t>=e,md=e=>ol(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&Ew(e.cursor);function Aw(e){return!md(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&ol(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!cn(e.total_chars)||!cn(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!xo(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&ol(e.tail)&&typeof e.tail.text=="string"&&xo(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function sp(e){return md(e)&&e.kind==="process_output"&&cn(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>cn(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&xo(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Rw(e){return md(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>cn(e[t]))&&xo(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&cn(e.tools_omitted)}function oc(e){try{return JSON.parse(e)}catch{return}}const rc=e=>JSON.stringify(e,null,2),Iw=e=>{const t=oc(e);return t===void 0?e:rc(t)},Nl=(e,t,s)=>`[${e}, ${t}) ${s}`;function jm(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:rc(e)??"";let n=typeof e=="string"?oc(e):e,a=null;if(typeof e=="string"&&n===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=oc(e.slice(d+c.length)),f=e.slice(0,u);sp(p)&&!("text"in p)&&f.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(n=p,a=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?Iw(d):d});if(ol(n)&&n.kind==="audit_preview"&&n.audit_clipped===!0&&(!("original_chars"in n)||cn(n.original_chars))&&(!("preview"in n)||typeof n.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...cn(n.original_chars)?[`original ${n.original_chars} code points`]:[]],ol(n.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof n.source[c])&&i.header.push(`source ${c}: ${n.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:n.preview??(t?"(no preview retained in audit)":"")}),i.metadata=n,i}if(Aw(n))i.kind="tool_output",i.header=[n.status,`retention: ${n.retention}`],n.retention==="retained"?(i.header.push(`${n.total_bytes} UTF-8 bytes`,`${n.total_chars} code points`),i.sections.push(l(`${"head"in n?"Head":"Page"} ${Nl(n.start,n.end,"code points")}`,n.head??n.text)),(o=n.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Nl(n.tail.start,n.tail.end,"code points")} — not a continuation`,n.tail.text))):(i.header.push(n.error),i.sections.push(l("Head — retention failed",n.head),l("Tail context only — may overlap head",n.tail.text))),typeof((r=n.matches)==null?void 0:r.summary)=="string"&&i.header.push(n.matches.summary);else if(sp(n)&&(typeof n.text=="string"||a!==null)){i.kind="process_output",i.header=[n.status,`PID ${n.pid}`,...n.exit_code!==null?[`exit ${n.exit_code}`]:[],`emitted ${n.emitted_bytes} B`,`retained ${n.retained_bytes} B`,`shown ${n.shown_bytes} B`,`capture-limit loss ${n.capture_limit_loss_bytes} B`,`not retained ${n.not_retained_bytes} B`],n.capture_error&&i.header.push(`capture error: ${n.capture_error}`),n.tail_status&&i.header.push(`recent output: ${n.tail_status}`);const c=n.shown_intervals.map(d=>Nl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${a!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,a??n.text))}else if(Rw(n))i.kind="agent_result",i.header=[n.status,`agent ${n.id}`,n.label,`original ${n.original_bytes} B`,`result ${n.result_bytes} B`,`error ${n.error_bytes} B`,`source ${n.source_original_bytes} B`,`tools ${n.tools_used.length} shown / ${n.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Nl(n.offset,n.end,"UTF-8 bytes")}`,n.preview));else return i.kind=n===void 0?"text":"json",i.sections.push({label:"",text:n===void 0||!t&&typeof e=="string"?s:t?rc(n):JSON.stringify(n)}),i;if(i.metadata=n,i.header.push(`source truncated: ${n.truncated?"yes":"no"}`,`cursor: ${n.cursor?"present":"none"}`),typeof n.expires_at=="string"&&i.header.push(`expires: ${n.expires_at}`),typeof n.expires_at=="number"){const c=new Date(n.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function Vm(e,t=30,s=6e3){let n=1,a=0,i=0;if(t>0&&s>0)for(const l of e){if(a>=s||l===`
`&&n>=t)break;l===`
`&&n++,a++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:a,lines:n}}const br=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Ow=e=>e!==null&&typeof e=="object",Lw=new Set(["_hmac","_prev_hmac"]),cc=e=>e.replace(/\r\n?/g,`
`);function rl(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const n=JSON.parse(t,(a,i)=>{if(Lw.has(a)){s=!0;return}return i});return cc(s?JSON.stringify(n):t)}catch{return cc(t)}}function Nw(e){const t=e.metadata;if(!t)return[];const s=[],n=e.kind==="audit_preview"&&Ow(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),n.truncated===!0&&s.push("source truncated"),n.retention==="failed"&&s.push("retention unavailable"),n.capture_error&&s.push(`capture unavailable: ${n.capture_error}`),n.capture_limit_loss_bytes>0&&s.push(`capture loss ${n.capture_limit_loss_bytes} B`),n.not_retained_bytes>0&&s.push(`not retained ${n.not_retained_bytes} B`),n.capture_lost_bytes>0&&s.push(`capture lost ${n.capture_lost_bytes} B`),n.dropped_bytes>0&&s.push(`dropped ${n.dropped_bytes} B`),(n.capture_loss===!0||n.output_lost===!0||n.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(n.exit_code)&&n.exit_code!==0&&s.push(`process exit ${n.exit_code}`),["failed","error","cancelled","timed_out"].includes(n.status)&&s.push(`source ${n.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function Dw(e){var f;const t=jm(typeof e=="string"?cc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:rl(m.text)})),n=s.map(m=>m.text).filter(Boolean).join(`
`),a=n.replace(/\n$/,""),i=[...n].length,l=a?a.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>br.inlineChars||o&&a.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=Vm(c,br.previewLines,br.previewChars),u=t.kind==="audit_preview"?(f=t.metadata)==null?void 0:f.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:a.replace(/\n/g," "),warnings:Nw(t)}}const Mw={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"}},setup(e){const t=h(!1),s=h(!0),n=h(!1),a=h(""),i=h(null),l=h(null),o=h(!1),r=K(()=>Dw(e.value)),c=K(()=>{const g=e.rawValue===void 0?e.value:e.rawValue;return typeof g=="string"?g:JSON.stringify(g,null,2)??""}),d=K(()=>n.value?c.value:r.value.formatted),u=K(()=>r.value.promoted&&r.value.preview.folded||o.value),p=K(()=>t.value?!!d.value:r.value.promoted);let f;function m(){if(t.value)return;const g=r.value.promoted?i.value:l.value;o.value=!!(g&&(g.scrollHeight>g.clientHeight+1||g.scrollWidth>g.clientWidth+1))}function v(){f==null||f.disconnect();for(const g of[i.value,l.value])g&&(f==null||f.observe(g));m()}function w(){t.value=!t.value,t.value||(n.value=!1)}function L(){n.value=!n.value,t.value=!0,a.value=""}async function x(){const g=e.value;try{await navigator.clipboard.writeText(d.value),g===e.value&&(a.value="Copied")}catch{g===e.value&&(a.value="Copy unavailable — select text manually")}}return Mt(()=>e.value,()=>{t.value=!1,n.value=!1,a.value=""}),Mt([i,l,t,s,r],()=>Rt(v),{flush:"post"}),Ve(()=>{f=new ResizeObserver(m),v()}),mt(()=>f==null?void 0:f.disconnect()),{expanded:t,wrapped:s,rawMode:n,copyStatus:a,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,toggleExpanded:w,toggleRaw:L,copyOutput:x}},template:`
    <section class="output-renderer output-compact" :class="{ 'output-compact-expanded': expanded }" :aria-label="label">
      <div class="output-event-row">
        <div class="output-event-heading">
          <slot name="header" />
          <span ref="summaryElement" class="output-inline-summary">{{ model.summary }}</span>
        </div>
        <span v-if="model.outcome" class="output-compact-outcome" :title="model.outcome">{{ model.outcome }}</span>
        <button v-if="model.warnings.length" type="button" class="output-compact-warning" @click="expanded = true"
                @pointerdown.stop @keydown.stop :aria-label="model.warnings.join('; ') + ' — inspect record'" :title="model.warnings.join('; ')">
          <span class="output-warning-full">{{ model.warnings.join('; ') }}</span><span class="output-warning-short" aria-hidden="true">Warning</span>
        </button>
        <div class="output-compact-actions" @pointerdown.stop @keydown.stop>
          <div class="output-controls">
            <button type="button" class="btn btn-ghost" :aria-pressed="wrapped" @click="wrapped = !wrapped">Wrap</button>
            <button type="button" class="btn btn-ghost" :aria-pressed="rawMode" @click="toggleRaw" title="Inspect raw retained record">Raw</button>
            <button type="button" class="btn btn-ghost" @click="copyOutput" :title="rawMode ? 'Copy raw retained record' : 'Copy complete display body'">Copy</button>
          </div>
          <button type="button" class="btn btn-ghost output-expand" :aria-expanded="expanded" @click="toggleExpanded"
                  :title="canExpand ? 'More received text hidden locally — expand without retrieving' : 'Inspect already-loaded record'">
            {{ expanded ? 'Collapse' : canExpand ? 'Expand' : 'Inspect' }}
          </button>
        </div>
      </div>
      <pre v-if="showBody" ref="previewElement" class="output-body output-compact-preview"
           :class="{ 'output-wrapped': wrapped, 'output-compact-folded': !expanded }">{{ expanded ? body : model.preview.text }}</pre>
      <div v-if="expanded && !rawMode" class="output-compact-detail">
        <div v-if="model.warnings.length" class="output-compact-warning-detail">{{ model.warnings.join('; ') }}</div>
        <div v-if="model.header.length" class="output-compact-envelope-detail">{{ model.header.join(' · ') }}</div>
        <slot name="details" />
      </div>
      <span v-if="copyStatus" class="output-copy-status" role="status">{{ copyStatus }}</span>
    </section>`},Yo={name:"ToolOutput",components:{CompactOutput:Mw},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0}},setup(e){const t=h(!1),s=h(!0),n=h(!1),a=h(""),i=K(()=>jm(e.value)),l=K(()=>n.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=K(()=>{let u=30,p=6e3;return l.value.map(f=>{const m=Vm(f.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...f,display:t.value?f.text:m.text,folded:m.folded}})}),r=K(()=>o.value.some(u=>u.folded)),c=K(()=>n.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(a.value="Copied")}catch{e.value===u&&(a.value="Copy unavailable — select text manually")}}return Mt(()=>e.value,()=>{t.value=!1,a.value=""}),Mt(n,()=>{t.value=!1,a.value=""}),{expanded:t,wrapped:s,rawMode:n,copyStatus:a,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
    <compact-output v-if="presentation === 'compact'" :value="value" :raw-value="rawValue" :label="label">
      <template #header><slot name="header" /></template>
      <template #details><slot name="details" /></template>
    </compact-output>
    <section v-else class="output-renderer" :aria-label="label">
      <div class="output-summary">
        <strong>{{ model.kind }}</strong>
        <span v-for="(item, index) in model.header" :key="index">{{ item }}</span>
      </div>
      <div class="output-controls">
        <button type="button" class="btn btn-ghost" :aria-pressed="wrapped" @click="wrapped = !wrapped">Wrap</button>
        <button type="button" class="btn btn-ghost" :aria-pressed="rawMode" @click="rawMode = !rawMode">Raw</button>
        <button type="button" class="btn btn-ghost" @click="copyOutput" :title="rawMode ? 'Copy exact received value, including locally folded text' : 'Copy formatted body, including locally folded text'">Copy</button>
        <span role="status">{{ copyStatus }}</span>
      </div>
      <div v-for="(section, index) in foldedSections" :key="index" class="output-section">
        <div v-if="section.label" class="output-section-label">{{ section.label }}</div>
        <pre class="output-body" :class="{ 'output-wrapped': wrapped }">{{ section.display }}</pre>
        <span v-if="section.folded && !expanded" class="output-fold-note">More received text hidden locally.</span>
      </div>
      <button v-if="canExpand" type="button" class="btn btn-ghost output-expand" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? 'Collapse' : 'Expand received text' }}
      </button>
    </section>
  `},Pw={components:{ToolOutput:Yo},setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var v,w,L,x,g,b,C,S,A,T,y;const f=p.payload||p,m=f.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(f.agent_id||(v=f.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(f.call_id||(w=f.metadata)!=null&&w.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const O=f.call_id||((L=f.metadata)==null?void 0:L.call_id)||null,$=f.agent_id||((x=f.metadata)==null?void 0:x.agent_id)||"",k={callId:O,agentId:$,agentLabel:f.agent_label||((g=f.metadata)==null?void 0:g.agent_label)||"",toolInput:f.tool_input,id:O?`${$}:${O}`:`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:f.iteration??((b=f.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(k);return}if(m==="tool_end"||m==="loop_tool"){const O=f.call_id||((C=f.metadata)==null?void 0:C.call_id)||null,$=f.agent_id||((S=f.metadata)==null?void 0:S.agent_id)||"";let k=-1;if(O&&(k=e.value.findIndex(M=>M.callId===O&&M.agentId===$&&M.status==="running")),k<0&&!O)for(let M=e.value.length-1;M>=0;M--){const j=e.value[M];if(j.tool===f.action&&j.agentId===$&&j.status==="running"){k=M;break}}if(k>=0){const M=e.value[k];M.status=f.error||(A=f.metadata)!=null&&A.error||["error","failed","cancelled","denied","outcome_unknown"].includes(f.status||((T=f.metadata)==null?void 0:T.status))?"error":"success",M.elapsed=f.duration_ms??((y=f.metadata)==null?void 0:y.elapsed_ms)??Date.now()-M.startTime,M.result=f.detail||"",M.fadingOut=!0,setTimeout(()=>{const j=e.value.indexOf(M);j>=0&&e.value.splice(j,1),t.value.unshift(M),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const O=f.call_id||f.tool_name||"unknown";if(f.finished){const $={...s.value};delete $[O],s.value=$}else{const k=((s.value[O]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[O]:k.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let o=!1;function r(){o||(o=!0,Ye.on("events",a),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,Ye.off("events",a),i&&(clearInterval(i),i=null))}Ve(r),ms(r),ls(c),mt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
              <span v-if="task.agentId" class="text-gray-400 text-xs">agent {{ task.agentLabel || task.agentId }}</span>
            </div>
            <span :class="task.fadingOut ? 'text-gray-400' : 'text-blue-400'" class="font-mono text-sm">{{ formatMs(task.elapsed) }}</span>
          </div>
          <!-- Streaming output for this tool -->
          <details v-if="task.toolInput"><summary class="text-xs text-gray-400">Arguments</summary><tool-output :value="task.toolInput" label="Tool arguments" /></details>
          <tool-output v-if="streamOutput[task.callId || task.tool]" :value="streamOutput[task.callId || task.tool]" label="Streaming tool output" />
          <tool-output v-if="task.result" :value="task.result" label="Tool result" />
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
          <tool-output :value="output" label="Live tool output" />
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
             class="flex flex-wrap items-center gap-3 py-2 border-b border-gray-700/50 last:border-0">
          <span class="text-lg"><odin-icon :name="statusIcon(task.status)" :size="17" /></span>
          <span class="text-white font-mono text-sm flex-1">{{ task.tool }}</span>
          <span v-if="task.agentId" class="text-gray-400 text-xs">agent {{ task.agentLabel || task.agentId }}</span>
          <span class="text-gray-500 font-mono text-xs whitespace-nowrap">{{ formatMs(task.elapsed) }}</span>
          <details v-if="task.toolInput" class="w-full"><summary class="text-xs text-gray-400">Arguments</summary><tool-output :value="task.toolInput" label="Recent tool arguments" /></details>
          <tool-output class="w-full" :value="task.result" label="Recent tool result" />
        </div>
      </div>
    </div>
  `};function vd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Aa(e){const t=vd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Fw(e){const t=vd(e);return t?t.toLocaleTimeString():"—"}function qm(e){const t=vd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function $w(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function ui(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function gd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Gm(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function np(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function bd(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function Km(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Wm=Symbol("agent-detail-cancelled"),Bw=15e3;function Uw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((f,m)=>{r=f,c=m});function u(f,m){o||(o=!0,l!==null&&a(l),l=null,(f?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return o||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!o&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Wm),i==null||i.abort()}}}function Zm({state:e,requestDetail:t,timeoutMs:s=Bw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:f,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const w=Uw(L=>t(p,{signal:L}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=w.cancel,v.promise=(async()=>{let L=null,x=null;try{L=await w.promise}catch(g){x=g}L!==Wm&&(l!==v||e.detailId!==p||(l=null,!x&&(L===null||typeof L!="object")&&(x=new Error(`${n} response was empty or invalid`)),x?e.detail===null&&(e.detailError=(x==null?void 0:x.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=L,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Hw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&n())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const zw={components:{ToolOutput:Yo},template:`
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
                <span class="ag-detail-meta-label">Activity</span>
                <span class="ag-detail-meta-value">{{ detail.activity || 'Not recorded' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Tool executions</span>
                <span class="ag-detail-meta-value">{{ detail.tool_execution_count ?? 'Not recorded' }}</span>
              </div>
              <div class="ag-detail-meta-item">
                <span class="ag-detail-meta-label">Parent inbox</span>
                <span class="ag-detail-meta-value">{{ detail.pending_inbox_count ?? '—' }} queued; consumed sequence {{ detail.last_consumed_sequence ?? '—' }}</span>
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
              <tool-output :value="detail.result" label="Agent result" />
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
              <tool-output :value="detail.error" label="Agent error" />
            </div>
          </template>
        </div>
      </div>
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const o=K(()=>e.value.filter(I=>I.status==="running").length),r=K(()=>e.value.filter(I=>I.status==="completed").length),c=K(()=>e.value.filter(I=>["failed","timeout","killed"].includes(I.status)).length),d=K(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=K(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(I=>["failed","timeout","killed"].includes(I.status)):e.value.filter(I=>I.status===i.value));function p(I){const U=Number(I.max_iterations)||0;return U<=0?0:Math.min(100,Math.round(I.iteration_count/U*100))}function f(I){return(Number(I.max_iterations)||0)>0}function m(I,U){return I?I==="N/A"?"N/A":U==="current_inheritance"?`inherit (currently ${I})`:I:"unknown"}function v(I){return m(I.display_model,I.display_model_source||I.display_source)}function w(I){return m(I.display_reasoning_effort,I.display_reasoning_effort_source||I.display_source)}function L(I){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[I]||""}const x=h(null),g=h(null),b=h(!1),C=h(null),S=h(""),T=Zm({state:{get detail(){return x.value},set detail(I){x.value=I},get detailId(){return g.value},set detailId(I){g.value=I},get detailLoading(){return b.value},set detailLoading(I){b.value=I},get detailError(){return C.value},set detailError(I){C.value=I}},requestDetail:(I,{signal:U})=>G.get(`/api/agents/${encodeURIComponent(I)}`,{signal:U})});async function y(I){S.value="",await T.open(I.id)}function O(){T.close(),S.value=""}async function $(){await T.refresh()}async function k(I,U){try{await navigator.clipboard.writeText(U||""),S.value=I,setTimeout(()=>{S.value===I&&(S.value="")},1500)}catch{ye.error("Copy failed")}}async function M(I=!1){I=I===!0,I||(t.value=!0);try{const U=await G.get("/api/agents");e.value=Array.isArray(U)?U:[],s.value=null}catch(U){I||(s.value=U.message)}I||(t.value=!1)}async function j(I){const U=e.value.find(W=>W.id===I);if(await qt({title:"Kill agent",message:`Kill agent "${(U==null?void 0:U.label)||I}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=I;try{await G.del(`/api/agents/${encodeURIComponent(I)}`),ye.success("Agent killed"),await M()}catch(W){ye.error(W.message||"Failed to kill agent")}n.value=null}}const q=Hw({isEnabled:()=>a.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!g.value,refreshDetail:$});function D(){q.start()}function R(){q.stop()}return Mt(a,()=>q.sync()),Ve(()=>{l=!0,M(),D()}),ms(()=>{l=!0,M(!0),D()}),ls(()=>{l=!1,R()}),mt(()=>{l=!1,R(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Aa,formatDuration:ui,progressPercent:p,hasProgress:f,displayModelText:v,displayEffortText:w,displaySourceLabel:L,detail:x,detailId:g,detailLoading:b,detailError:C,copied:S,openDetail:y,closeDetail:O,copyText:k,fetchAgents:M,killAgent:j,startAutoRefresh:D,stopAutoRefresh:R}}},jw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),o=h(null),r=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let m=!1;const w=Zm({state:{get detail(){return c.value},set detail(R){c.value=R},get detailId(){return d.value},set detailId(R){d.value=R},get detailLoading(){return u.value},set detailLoading(R){u.value=R},get detailError(){return p.value},set detailError(R){p.value=R}},detailLabel:"Loop detail",requestDetail:(R,{signal:I})=>G.get(`/api/loops/${encodeURIComponent(R)}?limit=100`,{signal:I})});async function L(R){f.value="",await w.open(R.id)}function x(){w.close(),f.value=""}async function g(R,I){try{await navigator.clipboard.writeText(I||""),f.value=R,setTimeout(()=>{f.value===R&&(f.value="")},1500)}catch{ye.error("Copy failed")}}const b=K(()=>e.value.reduce((R,I)=>R+(I.iteration_count||0),0)),C=K(()=>e.value.filter(R=>R.status==="running").length);function S(R){return R==="running"?"loop-status-running":R==="error"?"loop-status-error":"loop-status-stopped"}function A(R){return R==="running"?"badge-success":R==="error"?"badge-danger":R==="completed"?"badge-info":"badge-warning"}function T(R){return R==="act"?"badge-warning":R==="silent"?"badge-info":"badge-success"}async function y(R=!1){R=R===!0,R||(t.value=!0);try{const I=await G.get("/api/loops");e.value=Array.isArray(I)?I:[],s.value=null}catch(I){R||(s.value=I.message)}R||(t.value=!1)}async function O(){l.value=null;const R=a.value;if(!R.goal.trim()){l.value="Goal is required";return}if(!R.channel_id.trim()){l.value="Channel ID is required";return}const I={goal:R.goal.trim(),channel_id:R.channel_id.trim(),interval_seconds:R.interval_seconds||60,mode:R.mode,max_iterations:R.max_iterations||50};R.stop_condition.trim()&&(I.stop_condition=R.stop_condition.trim()),i.value=!0;try{const U=await G.post("/api/loops",I);ye.success(`Loop started: ${U.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await y()}catch(U){l.value=U.message}i.value=!1}async function $(R){if(await qt({title:"Stop loop",message:`Stop loop ${R}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=R;try{await G.del(`/api/loops/${encodeURIComponent(R)}`),ye.success("Loop stopped"),await y()}catch(U){ye.error(U.message||"Failed to stop loop")}o.value=null}}async function k(R){r.value=R;try{await G.post(`/api/loops/${encodeURIComponent(R)}/restart`),ye.success("Loop restarted"),await y()}catch(I){ye.error(I.message||"Failed to restart loop")}r.value=null}function M(R){m&&R.payload&&(R.payload.loop_id||R.payload.type==="loop")&&(y(!0),d.value&&w.refresh())}let j=null;function q(){j!==null&&clearInterval(j),j=null}function D(){q(),m&&(j=setInterval(()=>{y(!0),d.value&&w.refresh()},5e3))}return Ve(()=>{m=!0,y(),Ye.subscribe("events",M),D()}),ms(()=>{m=!0,y(!0),D()}),ls(()=>{m=!1,q()}),mt(()=>{m=!1,Ye.unsubscribe("events",M),q(),w.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:b,runningCount:C,statusDotClass:S,statusBadge:A,modeBadge:T,formatAge:qm,formatDuration:ui,formatTs:Aa,formatTokens:Km,openDetail:L,closeDetail:x,copyText:g,fetchLoops:y,doCreate:O,doStop:$,doRestart:k}}},Vw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=K(()=>e.value.filter(x=>x.status==="running").length),o=K(()=>e.value.filter(x=>x.status!=="running").length);function r(x){return x==="running"?"loop-status-running":x==="failed"||x==="error"?"loop-status-error":"loop-status-stopped"}function c(x){return x==="running"?"badge-success":x==="completed"||x==="exited"?"badge-info":x==="killed"||x==="error"||x==="failed"?"badge-danger":"badge-warning"}async function d(x=!1){x=x===!0,x||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(g){x||(s.value=g.message)}x||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}Mt(n,x=>{x?u():p()});async function f(x){if(await qt({title:"Kill process",message:`Kill process ${x}?`,confirmLabel:"Kill",danger:!0})){i.value=x;try{await G.del(`/api/processes/${x}`),ye.success(`Process ${x} killed`),await d()}catch(b){ye.error(b.message||"Failed to kill process")}i.value=null}}function m(x){x.payload&&(x.payload.pid||x.payload.type==="process")&&d(!0)}let v=!1;function w(){v||(v=!0,d(),Ye.subscribe("events",m),u())}function L(){v&&(v=!1,Ye.unsubscribe("events",m),p())}return Ve(w),ms(w),ls(L),mt(L),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:ui,fetchProcesses:d,doKill:f}}},qw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function ap(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function Gw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function Kw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function Ww(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=qw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),m=[];for(const w of new Set([p,f])){const L=new Date(u+w*6e4);Gw(L,c)===d&&(m.some(x=>x.getTime()===L.getTime())||m.push(L))}if(m.sort((w,L)=>w.getTime()-L.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(w=>({instant:w,offset:Kw(w),iso:w.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const Zw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),o=h(null),r=K(()=>Ww(a.value.run_at));Mt(()=>a.value.run_at,()=>{o.value=null});const c=K(()=>{var re;const z=r.value;return z.state==="ok"?z.instant:z.state==="ambiguous"&&o.value!==null&&((re=z.options[o.value])==null?void 0:re.instant)||null}),d=K(()=>{const z=c.value;return z?`${z.toLocaleString()} local — ${z.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=h(null),v=h(null),w=h(null),L=h(null),x=h(null),g=h(null),b=h([]),C=h(!1),S=h("");let A=0;const T=K(()=>e.value.filter(z=>z.cron&&!z.one_time).length),y=K(()=>e.value.filter(z=>z.one_time).length),O=K(()=>e.value.filter(z=>z.trigger).length),$=K(()=>e.value.filter(z=>z.paused).length),k=K(()=>e.value.filter(z=>z.consecutive_failures>0).length);function M(z){if(!z)return"-";const re=Date.now(),Ie=(new Date(z).getTime()-re)/1e3;if(Ie<0)return"overdue";if(Ie<60)return"in < 1 min";if(Ie<3600)return`in ${Math.floor(Ie/60)} min`;if(Ie<86400){const P=Math.floor(Ie/3600),H=Math.floor(Ie%3600/60);return H>0?`in ${P}h ${H}m`:`in ${P}h`}const _=Math.floor(Ie/86400);return`in ${_} day${_!==1?"s":""}`}function j(z){return z==null?"-":z<1e3?`${z}ms`:z<6e4?`${(z/1e3).toFixed(1)}s`:ui(z/1e3)}function q(z=a.value.cron){a.value.cron=z,ap(a.value,"cron"),u.value=null}function D(z=a.value.run_at){a.value.run_at=z,ap(a.value,"run_at"),u.value=null}async function R(){const z=a.value.cron.trim();if(z){p.value=!0;try{u.value=await G.post("/api/schedules/validate-cron",{expression:z})}catch(re){u.value={valid:!1,error:re.message}}p.value=!1}}async function I(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(z){s.value=z.message}t.value=!1}async function U(z){if(g.value===z){g.value=null,b.value=[];return}g.value=z,C.value=!0,b.value=[];const re=++A;try{const pe=await G.get(`/api/schedules/${encodeURIComponent(z)}/history?limit=10`);if(re!==A||g.value!==z)return;b.value=pe,S.value=""}catch(pe){if(re!==A||g.value!==z)return;b.value=[],S.value=pe.message||"Failed to load execution history"}re===A&&(C.value=!1)}async function Z(){l.value=null;const z=a.value;if(!z.description.trim()){l.value="Description is required";return}if(!z.channel_id.trim()){l.value="Channel ID is required";return}if(!z.cron.trim()&&!z.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(z.cron.trim()&&z.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const re={description:z.description.trim(),action:z.action,channel_id:z.channel_id.trim()};if(z.cron.trim()&&(re.cron=z.cron.trim()),z.run_at.trim()){const pe=r.value;if(pe.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(pe.state==="invalid"){l.value="One-time run time is not a valid date";return}const Ie=c.value;if(pe.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Ie){l.value="One-time run time could not be resolved";return}re.run_at=Ie.toISOString()}if(z.action==="reminder"&&z.message.trim()&&(re.message=z.message.trim()),z.action==="check"&&(z.tool_name.trim()&&(re.tool_name=z.tool_name.trim()),z.report_format&&(re.report_format=z.report_format),z.tool_input_str.trim()))try{re.tool_input=JSON.parse(z.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",re),ye.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await I()}catch(pe){l.value=pe.message}i.value=!1}async function W(z){m.value=z;try{const re=await G.post(`/api/schedules/${encodeURIComponent(z)}/run`);if(re.status==="failure")ye.error(`Execution failed: ${re.error||"unknown error"}`);else{const pe=re.warning?`Executed (${re.warning})`:"Executed successfully";ye.success(pe)}await I()}catch(re){ye.error(re.message||"Failed to trigger")}m.value=null}async function J(z){w.value=z.id;const re=!z.paused;try{await G.put(`/api/schedules/${encodeURIComponent(z.id)}`,{paused:re}),ye.success(re?"Schedule paused":"Schedule resumed"),await I()}catch(pe){ye.error(pe.message||"Failed to update schedule")}w.value=null}const oe=new Map;function ee(z,re){const pe=oe.get(z.id);pe&&clearTimeout(pe.timer);const Ie={run:()=>ce(z,re),timer:null};Ie.timer=setTimeout(()=>{oe.delete(z.id),Ie.run()},500),oe.set(z.id,Ie)}async function ce(z,re){x.value=z.id;try{await G.put(`/api/schedules/${encodeURIComponent(z.id)}`,{report_format:re}),ye.success(re?"Structured report enabled":"Plain-text report enabled")}catch(pe){ye.error(`Update failed: ${pe.message}`)}finally{await I(),x.value=null}}function Ne(){for(const[z,re]of[...oe])clearTimeout(re.timer),oe.delete(z),re.run()}async function Q(z){L.value=z;try{await G.post(`/api/schedules/${encodeURIComponent(z)}/reset-failures`),ye.success("Failure counters reset"),await I()}catch(re){ye.error(re.message||"Failed to reset")}L.value=null}async function ge(z){const re=e.value.find(Ie=>Ie.id===z);if(await qt({title:"Delete schedule",message:`Delete "${(re==null?void 0:re.description)||z}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=z;try{await G.del(`/api/schedules/${encodeURIComponent(z)}`),ye.success("Schedule deleted"),await I()}catch(Ie){ye.error(Ie.message||"Failed to delete schedule")}v.value=null}}return Ve(()=>{I()}),mt(Ne),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:f,runningId:m,deletingId:v,togglingId:w,resettingId:L,reportUpdatingId:x,flushReportFormatTimers:Ne,expandedId:g,history:b,historyLoading:C,historyError:S,cronCount:T,oneTimeCount:y,webhookCount:O,pausedCount:$,failingCount:k,formatTs:Aa,formatAge:qm,formatFuture:M,formatMs:j,formatDuration:ui,onCronInput:q,onRunAtInput:D,validateCron:R,toggleExpand:U,fetchSchedules:I,doCreate:Z,doRunNow:W,doTogglePause:J,doUpdateReportFormat:ee,doResetFailures:Q,doDelete:ge}}},Jm=[{id:"live",label:"Live",component:Pw},{id:"agents",label:"Agents",component:zw},{id:"loops",label:"Loops",component:jw},{id:"processes",label:"Processes",component:Vw},{id:"schedules",label:"Schedules",component:Zw}],Jw={components:{TabbedPage:Jo},setup(){return{tabs:Jm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},Yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){n.value=n.value===m?null:m}function o(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},f()}let r=0;const c=h(!1),d=h(null),u=h(null);async function p(){c.value=!0,u.value=null;try{d.value=await G.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function f(){const m=++r;t.value=!0,s.value=null,n.value=null;try{const v=new URLSearchParams;a.value.tool&&v.set("tool",a.value.tool),a.value.user&&v.set("user",a.value.user),a.value.keyword&&v.set("q",a.value.keyword),a.value.date&&v.set("date",a.value.date),v.set("limit",String(a.value.limit));const w=v.toString(),L=await G.get(`/api/audit${w?"?"+w:""}`);if(m!==r)return;e.value=Array.isArray(L)?L:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return Ve(()=>{f()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Aa,formatDetail:i,truncateBlock:Gm,toggleExpand:l,clearFilters:o,fetchAudit:f,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},ip=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Qw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],Xw={template:`
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
          <button v-if="ftsResults !== null || ftsError || ftsSearching" @click="clearFtsSearch" class="btn btn-ghost text-xs">
            Clear
          </button>
        </div>
        <!-- FTS results -->
        <div v-if="ftsSearching" class="mt-3 flex items-center gap-2 text-gray-400 text-sm">
          <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Searching...
        </div>
        <div v-if="ftsError" class="mt-3 text-red-400 text-sm" role="alert">
          {{ ftsError }} <button @click="runFtsSearch" class="btn btn-ghost text-xs">Retry</button>
        </div>
        <div v-if="!ftsSearching && ftsResults !== null" class="mt-3">
          <div v-if="ftsStale" class="text-amber-400 text-sm">Previous results — not current for these filters.</div>
          <div v-if="ftsResults.length === 0 && !ftsStale && !ftsError" class="text-gray-500 text-sm">No results found</div>
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const o=h(null),r=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),m=h(!1),v=ip,w=Qw,L=h([]),x=h(!1),g=h(""),b=h("flat"),C=h(new Set),S=h(""),A=h(""),T=h(""),y=h(null),O=h(!1),$=h(""),k=h(!1);let M=0;Mt([S,A,T],()=>{M++,O.value=!1,$.value="",k.value=y.value!==null},{flush:"sync"});function j(){try{const ne=localStorage.getItem("odin-session-presets");ne&&(L.value=JSON.parse(ne))}catch{}}function q(){try{localStorage.setItem("odin-session-presets",JSON.stringify(L.value))}catch{}}const D=K(()=>p.value.trim()!==""||u.value!=="all"),R=K(()=>{let ne=[...e.value];const Se=ip.find(je=>je.id===u.value),Le=Se?Se.filters:{};if(Le.source&&(ne=ne.filter(je=>je.source===Le.source)),Le.minMessages&&(ne=ne.filter(je=>je.message_count>=Le.minMessages)),Le.hasCompaction&&(ne=ne.filter(je=>je.has_summary)),Le.maxAge!=null){const je=Date.now()/1e3;ne=ne.filter(Ft=>Ft.last_active&&je-Ft.last_active<=Le.maxAge)}if(p.value.trim()){const je=p.value.toLowerCase().trim();ne=ne.filter(Ft=>(Ft.channel_id||"").toLowerCase().includes(je)||(Ft.last_user_id||"").toLowerCase().includes(je)||(Ft.source||"").toLowerCase().includes(je))}const Ke=f.value,Et=m.value?1:-1;return ne.sort((je,Ft)=>{const Ht=je[Ke]||0,os=Ft[Ke]||0;return(Ht-os)*Et}),ne}),I=K(()=>{if(!a.value||!a.value.messages)return[];const ne=a.value.messages;if(ne.length===0)return[];const Se=[];let Le=[];for(const Ke of ne)Ke.role==="user"&&Le.length>0&&(Se.push(Le),Le=[]),Le.push(Ke);return Le.length>0&&Se.push(Le),Se}),U=K(()=>R.value.length>0&&c.value.size===R.value.length);function Z(ne){const Se=ne.find(Le=>Le.role==="user");if(Se&&Se.content){const Le=Se.content.slice(0,120);return Le.length<Se.content.length?Le+"...":Le}return"(no user message)"}function W(ne){const Se=new Set(C.value);Se.has(ne)?Se.delete(ne):Se.add(ne),C.value=Se}function J(ne){u.value=ne}function oe(ne){u.value=ne.id,ne.filters.searchQuery!=null&&(p.value=ne.filters.searchQuery),ne.filters.sortBy&&(f.value=ne.filters.sortBy)}function ee(){if(!g.value.trim())return;const ne={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};L.value=[...L.value,ne],q(),x.value=!1,g.value=""}function ce(ne){L.value=L.value.filter(Se=>Se.id!==ne),q(),u.value===ne&&(u.value="all")}function Ne(){u.value="all",p.value="",f.value="last_active",m.value=!1}function Q(ne){if(!ne)return"—";const Se=Date.now()/1e3-ne;if(Se<60)return"just now";if(Se<3600){const Ke=Math.floor(Se/60);return`${Ke} minute${Ke!==1?"s":""} ago`}if(Se<86400){const Ke=Math.floor(Se/3600);return`${Ke} hour${Ke!==1?"s":""} ago`}const Le=Math.floor(Se/86400);return`${Le} day${Le!==1?"s":""} ago`}function ge(ne){if(!ne)return"";try{return new Date(ne*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function z(ne){if(!ne)return"";try{return new Date(ne*1e3).toLocaleString()}catch{return""}}function re(ne){return ne==="user"?"bg-gray-900/50 border border-gray-800":ne==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function pe(ne){return ne==="user"?"sess-msg-user":ne==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Ie(ne){return ne==="user"?"badge-info":ne==="assistant"?"badge-success":"badge-warning"}function _(ne){return ne==="user"?"sess-dot-user":ne==="assistant"?"sess-dot-assistant":"sess-dot-system"}function P(ne){return ne==="user"?"text-cyan-400":ne==="assistant"?"text-indigo-400":"text-gray-500"}function H(ne){return ne?ne.length>2e3?ne.slice(0,2e3)+`
... (truncated)`:ne:""}async function ie(){const ne=S.value.trim();if(!ne)return;const Se=++M;O.value=!0,$.value="",k.value=y.value!==null;try{let Le=`/api/sessions/search?q=${encodeURIComponent(ne)}&limit=50`;A.value.trim()&&(Le+=`&channel_id=${encodeURIComponent(A.value.trim())}`),T.value.trim()&&(Le+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Ke=await G.get(Le);if(Se!==M)return;y.value=Ke.results||[],k.value=!1}catch(Le){if(Se!==M)return;$.value=Le.message||"Search failed. Please retry."}finally{Se===M&&(O.value=!1)}}function se(){M++,S.value="",A.value="",T.value="",y.value=null,$.value="",k.value=!1,O.value=!1}function ae(ne){return ne?ne.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function fe(ne){return ne==="user"?"fts-result-user":ne==="assistant"?"fts-result-assistant":ne==="summary"?"fts-result-summary":ne==="fts"?"fts-result-fts":ne==="channel"?"fts-result-channel":"fts-result-default"}function ue(ne){return ne==="user"?"badge-info":ne==="assistant"?"badge-success":ne==="summary"?"badge-warning":ne==="fts"?"badge-success":"badge-info"}let de=0;async function le(){const ne=++de;t.value=!0,s.value=null;try{const Se=await G.get("/api/sessions");if(ne!==de)return;e.value=Se}catch(Se){if(ne!==de)return;s.value=Se.message}ne===de&&(t.value=!1)}function xe(){s.value=null,le()}async function me(ne){if(n.value===ne){n.value=null,a.value=null,C.value=new Set;return}n.value=ne,a.value=null,i.value=!0,C.value=new Set;const Se=++l;try{const Le=await G.get(`/api/sessions/${encodeURIComponent(ne)}`);Se===l&&n.value===ne&&(a.value=Le)}catch(Le){Se===l&&n.value===ne&&(a.value={messages:[],summary:"",error:Le.message||"Failed to load session"})}finally{Se===l&&(i.value=!1)}}function _e(ne){const Se=new Set(c.value);Se.has(ne)?Se.delete(ne):Se.add(ne),c.value=Se}function Re(){U.value?c.value=new Set:c.value=new Set(R.value.map(ne=>ne.channel_id))}function F(ne){o.value=ne}async function ve(){if(o.value){r.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(o.value)}`),n.value===o.value&&(n.value=null,a.value=null),c.value.delete(o.value),await le()}catch(ne){s.value=ne.message||"Failed to clear session"}r.value=!1,o.value=null}}function ke(){d.value=!0}async function Oe(){if(c.value.size!==0){r.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await le()}catch(ne){s.value=ne.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Pe(ne,Se){const Le=`/api/sessions/${encodeURIComponent(ne)}/export?format=${Se}`;try{const Ke=await G.getBlob(Le),Et=URL.createObjectURL(Ke),je=document.createElement("a");je.href=Et,je.download=`session-${ne}.${Se==="text"?"txt":"json"}`,je.click(),URL.revokeObjectURL(Et)}catch(Ke){s.value=Ke.message||"Failed to export session"}}let dt=null;function st(ne){ne.payload&&ne.payload.channel_id&&(clearTimeout(dt),dt=setTimeout(()=>{if(le(),n.value&&ne.payload.channel_id===n.value){const Se=n.value,Le=l;G.get(`/api/sessions/${encodeURIComponent(Se)}`).then(Ke=>{Le!==l||n.value!==Se||(a.value=Ke)}).catch(()=>{})}},2e3))}let _t=!1,Ot=null;function rt(){_t||(_t=!0,le(),Ye.subscribe("events",st),Ot=Ye.onReconnected(()=>le()))}Ve(()=>{j(),rt()}),ms(()=>{rt()});function Qe(){_t&&(_t=!1,Ye.unsubscribe("events",st),Ot&&(Ot(),Ot=null),clearTimeout(dt))}return ls(Qe),mt(Qe),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:U,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:m,filterPresets:v,sortOptions:w,filteredSessions:R,hasActiveFilters:D,customPresets:L,showSavePreset:x,newPresetName:g,threadView:b,threads:I,collapsedThreads:C,ftsQuery:S,ftsChannelId:A,ftsUserId:T,ftsResults:y,ftsSearching:O,ftsError:$,ftsStale:k,formatAge:Q,formatTimestamp:ge,formatFullTimestamp:z,messageClass:re,threadMsgClass:pe,roleBadge:Ie,roleDotClass:_,roleLabelClass:P,truncateContent:H,threadSummary:Z,fetchSessions:le,retry:xe,toggleSession:me,toggleSelect:_e,toggleSelectAll:Re,confirmClear:F,clearSession:ve,confirmBulkClear:ke,doBulkClear:Oe,exportSession:Pe,applyPreset:J,applyCustomPreset:oe,saveCustomPreset:ee,removeCustomPreset:ce,resetFilters:Ne,toggleThread:W,runFtsSearch:ie,clearFtsSearch:se,highlightSnippet:ae,ftsResultClass:fe,ftsTypeBadge:ue}}},ek={props:["trace"],template:`
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
  `,setup(){return{formatTokens:Km}}},tk={components:{ContextAssemblyPanel:ek},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=h(""),r=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(A){if(!A)return"—";try{const T=new Date(A);return isNaN(T.getTime())?A:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return A}}function p(A){return!A&&A!==0?"—":A<1e3?A+"ms":(A/1e3).toFixed(1)+"s"}function f(A){return!A&&A!==0?"—":A>=1e3?(A/1e3).toFixed(1)+"k":String(A)}function m(A){if(!A)return"";if(typeof A=="string")return A;try{return JSON.stringify(A,null,2)}catch{return String(A)}}function v(A){a.value===A?a.value=null:(a.value=A,c.value={})}function w(A,T){const y=A+"-"+T;c.value={...c.value,[y]:!c.value[y]}}function L(A,T){return!!c.value[A+"-"+T]}function x(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,C()}async function g(){try{const A=await G.get("/api/trajectories");e.value=A.files||[],r.value=A.count||0}catch{}}let b=0;async function C(){const A=++b;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(o.value){const T=await G.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(A!==b)return;let y=T.entries||[];d.value.tool_name&&(y=y.filter(O=>(O.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(y=y.filter(O=>O.is_error)),d.value.channel_id&&(y=y.filter(O=>O.channel_id===d.value.channel_id)),d.value.user_id&&(y=y.filter(O=>O.user_id===d.value.user_id)),t.value=y}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const y=T.toString(),O=await G.get(`/api/trajectories/search/query?${y}`);if(A!==b)return;t.value=O.results||[]}}catch(T){if(A!==b)return;n.value=T.message}A===b&&(s.value=!1)}async function S(){if(!l.value.trim())return;const A=++b;s.value=!0,n.value=null,c.value={};try{const T=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(A!==b)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(A!==b)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}A===b&&(s.value=!1)}return Ve(async()=>{await g(),await C()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:m,truncateBlock:Gm,toggleExpand:v,toggleIteration:w,isIterationExpanded:L,clearFilters:x,fetchFiles:g,fetchTraces:C,lookupMessage:S}}};function sk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function nk(e){return e?`${e.approximate?"~":""}${bd(e.total||0)}`:"0"}const ak={template:`
    <div class="p-6 page-fade-in" role="region" aria-label="Usage and Activity">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-200">Usage &amp; Activity</h2>
          <p class="text-xs text-slate-500 mt-1">Persistent statistics from settled trajectories and the read-only audit index.</p>
        </div>
        <div class="flex gap-1" aria-label="Statistics range">
          <button v-for="r in ranges" :key="r.key" class="btn text-xs"
                  :class="range === r.key ? 'btn-primary' : 'btn-ghost'"
                  @click="selectRange(r.key)">{{ r.label }}</button>
        </div>
      </div>

      <div v-if="loading" class="space-y-4" role="status" aria-label="Loading usage data">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="n in 4" :key="n" class="hm-card"><div class="skeleton skeleton-stat"></div></div>
        </div>
      </div>

      <div v-else-if="error && !hasData" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
        <div v-if="error && hasData" class="hm-card border-amber-900 mb-3" role="status" aria-live="polite">
          <p class="text-amber-400 text-sm">Last refresh failed: {{ error }} — showing the last successful response.</p>
        </div>
        <div v-if="data.coverage && !data.coverage.backfill_complete" class="hm-card border-amber-900 mb-3" role="status">
          <p class="text-amber-300 text-sm">Historical indexing is still running. Recent data appears first; all-time totals are incomplete.</p>
          <p class="text-xs text-slate-500 mt-1">{{ data.coverage.sources_complete }} / {{ data.coverage.sources_indexed }} sources complete · {{ data.coverage.malformed_rows_skipped }} malformed rows skipped</p>
        </div>
        <div v-if="isStale" class="hm-card border-amber-900 mb-3 text-sm text-amber-300" role="status">
          Statistics are stale. Last successful receipt was more than 30 seconds ago.
        </div>

        <section aria-labelledby="usage-work-heading">
          <h3 id="usage-work-heading" class="text-sm font-semibold text-slate-300 mb-2">How much work happened</h3>
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white">{{ fmtNum(work.settled_turns) }}</div><div class="text-xs text-slate-400 mt-1">Settled turns</div></div>
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white">{{ fmtNum(work.accepted_generations) }}</div><div class="text-xs text-slate-400 mt-1">Accepted generations</div></div>
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white">{{ tokenLabel(work.input_tokens) }}</div><div class="text-xs text-slate-400 mt-1">Input processed</div></div>
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white">{{ tokenLabel(work.output_tokens) }}</div><div class="text-xs text-slate-400 mt-1">Output generated</div></div>
            <div class="hm-card stat-card text-center"><div class="text-2xl font-bold text-white" :title="work.recorded_processing_ms == null ? 'Not recorded' : null">{{ fmtDuration(work.recorded_processing_ms) }}</div><div class="text-xs text-slate-400 mt-1">Recorded processing</div></div>
          </div>
          <div class="hm-card mb-5 text-xs text-slate-400" v-if="work.input_tokens">
            Input provenance: {{ fmtNum(work.input_tokens.provider_reported) }} provider-reported ·
            {{ fmtNum(work.input_tokens.estimated) }} current estimates ·
            {{ fmtNum(work.input_tokens.legacy_estimated) }} legacy estimates ·
            {{ work.input_tokens.provider_reported_percent }}% reported coverage.
            Recorded processing is summed operation time, not wall-clock uptime. A dash means timing was not recorded; unavailable samples are excluded.
          </div>
        </section>

        <div v-if="!work.settled_turns" class="hm-card text-center py-8 text-slate-500 mb-5">
          No settled usage history in this range.
        </div>

        <section v-if="(data.activity_over_time || []).length" class="hm-card min-w-0 mb-4" aria-labelledby="usage-time-heading">
          <h3 id="usage-time-heading" class="text-sm font-semibold text-slate-300 mb-3">Activity over time</h3>
          <div class="usage-activity-scroll w-full min-w-0 max-w-full overflow-x-auto">
            <div class="usage-activity-track flex items-end gap-1 h-28 min-w-full" :style="activityTrackStyle" role="img" aria-label="Daily settled turns by surface">
              <div v-for="row in data.activity_over_time" :key="row.bucket + ':' + row.surface"
                   class="flex-1 min-w-0 bg-amber-700/70 rounded-t" :style="activityBar(row.count)"
                   :title="row.bucket + ' · ' + row.surface + ': ' + row.count"></div>
            </div>
          </div>
          <p class="text-xs text-slate-500 mt-2">Daily settled work units by recorded surface. Hover a bar for its value.</p>
        </section>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <section class="hm-card" aria-labelledby="usage-kind-heading">
            <h3 id="usage-kind-heading" class="text-sm font-semibold text-slate-300 mb-3">What kind of work</h3>
            <div class="table-responsive"><table class="w-full text-sm">
              <thead><tr class="text-left text-slate-400"><th>Surface</th><th>Outcome</th><th class="text-right">Turns</th><th class="text-right">Processing</th></tr></thead>
              <tbody><tr v-for="row in data.activity || []" :key="row.surface + ':' + row.outcome" class="border-t border-slate-700">
                <td class="py-2">{{ row.surface }}</td><td>{{ row.outcome }}</td><td class="text-right">{{ fmtNum(row.count) }}</td><td class="text-right" :title="row.duration_ms == null ? 'Not recorded' : null">{{ fmtDuration(row.duration_ms) }}</td>
              </tr><tr v-if="!(data.activity || []).length"><td colspan="4" class="py-4 text-center text-slate-500">No activity yet</td></tr></tbody>
            </table></div>
          </section>

          <section class="hm-card" aria-labelledby="usage-serve-heading">
            <h3 id="usage-serve-heading" class="text-sm font-semibold text-slate-300 mb-3">What served it</h3>
            <div class="table-responsive"><table class="w-full text-sm">
              <thead><tr class="text-left text-slate-400"><th>Provider / model</th><th>Effort</th><th class="text-right">Generations</th><th class="text-right">Input</th><th class="text-right">Output</th><th class="text-right">Processing</th></tr></thead>
              <tbody><tr v-for="row in data.serving || []" :key="row.provider + ':' + row.model + ':' + row.effort" class="border-t border-slate-700">
                <td class="py-2"><span class="text-slate-500">{{ row.provider }}</span><br><span class="font-mono text-xs">{{ row.model }}</span></td><td>{{ row.effort || 'n/a' }}</td><td class="text-right">{{ fmtNum(row.generations) }}</td><td class="text-right">{{ fmtNum(row.input_tokens) }}</td><td class="text-right">{{ fmtNum(row.output_tokens) }}</td><td class="text-right" :title="row.duration_ms == null ? 'Not recorded' : null">{{ fmtDuration(row.duration_ms) }}</td>
              </tr><tr v-if="!(data.serving || []).length"><td colspan="6" class="py-4 text-center text-slate-500">No generations yet</td></tr></tbody>
            </table></div>
          </section>
        </div>

        <section class="hm-card mb-4" aria-labelledby="usage-tools-heading">
          <h3 id="usage-tools-heading" class="text-sm font-semibold text-slate-300 mb-3">What tools Odin used</h3>
          <div class="table-responsive"><table class="w-full text-sm">
            <thead><tr class="text-left text-slate-400"><th>Tool</th><th class="text-right">Executions</th><th class="text-right">Errors</th><th class="text-right">Error rate</th><th class="text-right">Average time</th></tr></thead>
            <tbody><tr v-for="row in data.tools || []" :key="row.tool_name" class="border-t border-slate-700">
              <td class="py-2 font-mono text-xs">{{ row.tool_name }}</td><td class="text-right">{{ fmtNum(row.executions) }}</td><td class="text-right">{{ fmtNum(row.errors) }}</td><td class="text-right">{{ row.error_rate_percent }}%</td><td class="text-right" :title="row.avg_duration_ms == null ? 'Not recorded' : null">{{ fmtDuration(row.avg_duration_ms) }}</td>
            </tr><tr v-if="!(data.tools || []).length"><td colspan="5" class="py-4 text-center text-slate-500">No audited tool executions yet</td></tr></tbody>
          </table></div>
        </section>

        <section class="hm-card" aria-labelledby="usage-auto-heading">
          <h3 id="usage-auto-heading" class="text-sm font-semibold text-slate-300 mb-3">Automation</h3>
          <div class="flex flex-wrap gap-2"><span v-for="row in data.automation || []" :key="row.state" class="status-badge status-info">{{ row.state }}: {{ fmtNum(row.count) }} · recoveries {{ fmtNum(row.recovery_attempts) }}</span><span v-if="!(data.automation || []).length" class="text-sm text-slate-500">No agent outcomes yet</span></div>
        </section>

        <p class="mt-4 text-xs text-slate-500">Modeled cost is not actual spend. This screen does not have invoice, cache-pricing, or historical-rate truth.</p>
      </div>
    </div>
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),a=h("7d"),i=h(0),l=h(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=K(()=>n.value.work||{}),f=K(()=>Math.max(1,...(n.value.activity_over_time||[]).map(S=>Number(S.count||0)))),m=K(()=>({minWidth:`max(100%, ${(n.value.activity_over_time||[]).length*5}px)`})),v=S=>({height:`${Math.max(4,Math.round(Number(S||0)/f.value*100))}%`}),w=K(()=>s.value&&l.value-i.value>3e4);async function L(){const S=++d,A=a.value;try{const T=await G.get(`/api/usage?range=${encodeURIComponent(A)}`);if(S!==d||A!==a.value)return;n.value=T,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(T){S===d&&(t.value=T.message)}finally{S===d&&(e.value=!1)}}function x(S){a.value=S,e.value=!s.value,L()}function g(){e.value=!0,L()}function b(){c||(c=!0,L(),o=setInterval(L,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function C(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Ve(b),ms(b),ls(C),mt(C),{data:n,work:p,loading:e,error:t,hasData:s,range:a,ranges:u,isStale:w,fmtNum:bd,fmtDuration:sk,tokenLabel:nk,activityTrackStyle:m,activityBar:v,selectRange:x,retry:g}}},Ym=[{id:"audit",label:"Audit",component:Yw},{id:"sessions",label:"Sessions",component:Xw},{id:"traces",label:"Traces",component:tk},{id:"usage",label:"Usage & Activity",component:ak}],ik={components:{TabbedPage:Jo},setup(){return{tabs:Ym}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},yr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],lk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),o=h(null),r=h(null),c=h(!1),d=h(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(y){return y.source!=="builtin"?"":u[y.state]||""}function f(y,O){const $=y&&Array.isArray(y.tools)?y.tools:null;if(c.value=!!$,r.value=$?!!y.global_enabled:null,!$){e.value=O.map(j=>({...j,source:"unknown",enabled:void 0,state:null}));return}const k=new Set($.map(j=>j.name)),M=O.filter(j=>!k.has(j.name)).map(j=>({...j,source:j.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...$.map(j=>({...j,source:"builtin"})),...M]}async function m(y,O){if(d.value.has(y.name))return;const $=!!O.target.checked,k=new Set(d.value);k.add(y.name),d.value=k;try{const M=await G.post(`/api/tools/builtins/${encodeURIComponent(y.name)}/enabled`,{enabled:$});f(M,e.value),s.value=null;try{const j=await G.get("/api/tools");f(M,j)}catch(j){console.warn("Built-in toggle committed; visible catalog refresh failed",j)}}catch(M){O.target.checked=!!y.enabled,s.value=M.message||`Failed to toggle ${y.name}`}finally{const M=new Set(d.value);M.delete(y.name),d.value=M}}const v=K(()=>e.value.filter(y=>y.source==="builtin"&&y.is_core).length),w=K(()=>e.value.filter(y=>y.source==="skill").length),L=K(()=>Object.values(a.value).reduce((y,O)=>y+O,0));function x(y){for(const O of yr)if(O.id!=="other"&&O.match(y))return O.id;return"other"}const g=K(()=>{let y=e.value;if(n.value){const O=n.value.toLowerCase();y=y.filter($=>$.name.toLowerCase().includes(O)||($.description||"").toLowerCase().includes(O))}return o.value&&(y=y.filter(O=>x(O.name)===o.value)),y}),b=K(()=>{const y=new Set;for(const O of e.value)y.add(x(O.name));return yr.filter(O=>y.has(O.id))}),C=K(()=>{const y=g.value,O={};for(const k of y){const M=x(k.name);O[M]||(O[M]=[]),O[M].push(k)}const $=[];for(const k of yr)O[k.id]&&O[k.id].length>0&&$.push({label:k.label,icon:k.icon,tools:O[k.id].sort((M,j)=>M.name.localeCompare(j.name))});return $});function S(y){i.value={...i.value,[y]:!i.value[y]}}async function A(){t.value=!0,s.value=null;try{const[y,O,$]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({})),G.get("/api/tools/builtins").catch(()=>null)]);f($,y),a.value=O||{}}catch(y){s.value=y.message}t.value=!1}function T(){A()}return Ve(()=>{A()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:w,totalUsage:L,filteredTools:g,groupedTools:C,usedCategories:b,stateBadge:p,applyInventory:f,toggleBuiltinTool:m,truncate:gd,toggleExpand:S,refresh:T}}};function ok(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function rk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const ck={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),o=h(null),r=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),m=h(!1),v=h(null),w=h(null),L=h(!1),x=K(()=>e.value.length),g=K(()=>e.value.reduce((ee,ce)=>ee+(ce.execution_count||0),0)),b=K(()=>e.value.reduce((ee,ce)=>ee+O(ce.code),0)),C=K(()=>{if(!l.value)return e.value;const ee=l.value.toLowerCase();return e.value.filter(ce=>ce.name.toLowerCase().includes(ee)||(ce.description||"").toLowerCase().includes(ee))}),S=K(()=>u.value?u.value.split(`
`).length:0),A=K(()=>{const ee=Math.max(S.value,1);return Array.from({length:ee},(ce,Ne)=>Ne+1).join(`
`)}),T=K(()=>{const ee=u.value.trim();return ee?ee.includes("SKILL_DEFINITION")?ee.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function y(ee){return ok(ee)}function O(ee){return ee?ee.split(`
`).length:0}function $(ee){return rk(ee)}function k(ee){n.value={...n.value,[ee]:!n.value[ee]}}async function M(ee){try{await navigator.clipboard.writeText(ee);const ce=e.value.find(Ne=>Ne.code===ee);ce&&(o.value=ce.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function j(ee){if(ee.key==="Tab"){ee.preventDefault();const ce=ee.target,Ne=ce.selectionStart,Q=ce.selectionEnd;u.value=u.value.substring(0,Ne)+"    "+u.value.substring(Q),Rt(()=>{ce.selectionStart=ce.selectionEnd=Ne+4})}}function q(ee){const ce=ee.target.previousElementSibling;ce&&(ce.scrollTop=ee.target.scrollTop)}async function D(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(ee){s.value=ee.message}t.value=!1}async function R(ee){i.value=ee,delete a.value[ee],a.value={...a.value};try{const ce=await G.post(`/api/skills/${encodeURIComponent(ee)}/test`);a.value={...a.value,[ee]:ce}}catch(ce){a.value={...a.value,[ee]:{result:ce.message,is_error:!0}}}i.value=null}function I(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function U(ee){r.value=!0,c.value="edit",d.value=ee.name,u.value=ee.code||"",p.value=null,f.value=null}function Z(){r.value=!1,p.value=null,f.value=null}async function W(){p.value=null,f.value=null;const ee=d.value.trim(),ce=u.value.trim();if(!ee){p.value="Name is required";return}if(!ce){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:ee,code:ce}),f.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(ee)}`,{code:ce}),f.value="Skill updated successfully"),await D(),setTimeout(()=>{r.value=!1},800)}catch(Ne){p.value=Ne.message}m.value=!1}function J(ee){w.value=ee}async function oe(){if(w.value){L.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(w.value)}`),await D()}catch(ee){ye.error(`Failed to delete skill: ${ee.message||"unknown error"}`)}L.value=!1,w.value=null}}return Ve(()=>{D()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:m,editorRef:v,deleteTarget:w,deleting:L,enabledCount:x,totalExecutions:g,totalLines:b,displayedSkills:C,editLineCount:S,editorLineNums:A,editValidation:T,highlight:y,truncate:gd,formatTs:Aa,countLines:O,getLineNumbers:$,toggleCode:k,copyCode:M,handleEditorKey:j,syncScroll:q,fetchSkills:D,testSkill:R,showCreate:I,editSkill:U,cancelEdit:Z,saveSkill:W,confirmDelete:J,doDelete:oe}}};class Fs extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const dk=/^[A-Za-z_][A-Za-z0-9_]*$/;function lp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function op(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Fs(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Fs(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,o))throw new Fs(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Fs(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");n[o]=r}}return{set:n,remove:a}}function uk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function pk(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Fs("Server name is required.","name");if(a.length>128||!dk.test(a))throw new Fs("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(n&&(o.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Fs("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(n||e.replaceArgs)&&(o.args=lp(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Fs("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Fs("An HTTP endpoint is required for this connection.","url");if(d&&!uk(d))throw new Fs("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Fs("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(n||e.replaceAllowlist)&&(o.tool_allowlist=lp(e.allowlistText));const r=op(e.headerRows,e.headersRemove,"Header"),c=op(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function fk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function hk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function mk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const vk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function gk(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const bk=1e4,yk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function xr(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function xk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const _k={template:`
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),o=h({}),r=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),m=h(xr()),v=h(""),w=h(!1);let L=null,x=0,g=!1,b=!1;const C=vk,S=K(()=>{var F;return((F=e.value)==null?void 0:F.servers)||[]}),A=K(()=>{var F;return!!((F=e.value)!=null&&F.enabled)}),T=K(()=>{var F,ve,ke,Oe;return{serverCount:((F=e.value)==null?void 0:F.server_count)||0,enabledCount:((ve=e.value)==null?void 0:ve.enabled_server_count)||0,connectedCount:((ke=e.value)==null?void 0:ke.connected_count)||0,toolCount:((Oe=e.value)==null?void 0:Oe.published_tool_count)||0}}),y=K(()=>{var F;return((F=f.value)==null?void 0:F.header_keys)||[]}),O=K(()=>{var F;return((F=f.value)==null?void 0:F.env_keys)||[]}),$=K(()=>{var F;return u.value==="edit"&&((F=f.value)==null?void 0:F.transport)==="http"}),k=K(()=>u.value==="add"||!$.value),M=K(()=>$.value?"Replace endpoint URL":"Endpoint URL"),j=K(()=>$.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function q(){D(),L=window.setInterval(()=>R({quiet:!0}),bk)}function D(){L&&window.clearInterval(L),L=null}async function R({quiet:F=!1}={}){const ve=++x;F||(t.value=!0);try{const ke=await G.get("/api/mcp/status");if(ve!==x||!g)return;e.value=ke,n.value="";const Oe=new Set((ke.servers||[]).map(Pe=>Pe.name));i.value=new Set([...i.value].filter(Pe=>Oe.has(Pe)))}catch(ke){ve===x&&g&&(n.value=ke.message||"Failed to load MCP status")}finally{ve===x&&(t.value=!1)}}function I(F){return s.value||a.value.has(F)}function U(F,ve){const ke=new Set(a.value);ve?ke.add(F):ke.delete(F),a.value=ke}function Z(F){return hk(F.state)}function W(F){if(Z(F)==="disabled"){if(!F.enabled)return"Disabled — server switch off";if(!A.value)return"Disabled — global MCP is off"}return yk[Z(F)]}function J(F){return F.transport==="http"?"Streamable HTTP":"stdio"}function oe(F){return F.negotiated_version?`${F.era?`${String(F.era).charAt(0).toUpperCase()}${String(F.era).slice(1)}`:"Protocol"} · ${F.negotiated_version}`:"Not negotiated"}function ee(F){return F.discovered_count?`${F.published_count||0} published · ${F.excluded_count||0} excluded`:"No tools discovered"}const ce=h(new Set);async function Ne(F,ve){if(ce.value.has(F.name))return;const ke=!!ve.target.checked,Oe=new Set(ce.value);Oe.add(F.name),ce.value=Oe;try{const Pe=await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/enabled`,{enabled:ke});Pe&&Array.isArray(Pe.servers)?e.value=Pe:await R({quiet:!0})}catch(Pe){ve.target.checked=!!F.enabled,ye.error(Pe.message||`Failed to toggle ${F.name}`)}finally{const Pe=new Set(ce.value);Pe.delete(F.name),ce.value=Pe}}async function Q(F){if(F!==A.value&&!(!F&&!await qt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await G.post("/api/mcp/enabled",{enabled:F}),ye.success(F?"MCP enabled":"MCP disabled"),await R({quiet:!0})}catch(ve){ye.error(ve.message||"Failed to update MCP state"),await R({quiet:!0})}finally{s.value=!1}}}async function ge(F){U(F.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/reconnect`,{}),ye.success(`Reconnected ${F.name}`)}catch(ve){ye.error(ve.message||`Failed to reconnect ${F.name}`)}finally{U(F.name,!1),await R({quiet:!0})}}async function z(F){U(F.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/refresh-tools`,{}),ye.success(`Refreshed tools from ${F.name}`),await Ie(F.name,!0)}catch(ve){ye.error(ve.message||`Failed to refresh ${F.name}`)}finally{U(F.name,!1),await R({quiet:!0})}}async function re(F){if(await qt({title:`Remove ${F.name}`,message:`Remove this saved MCP server? Its ${F.published_count||0} published tool${F.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){U(F.name,!0);try{await G.del(`/api/mcp/servers/${encodeURIComponent(F.name)}`),ye.success(`Removed ${F.name}`),delete o.value[F.name]}catch(ke){ye.error(ke.message||`Failed to remove ${F.name}`)}finally{U(F.name,!1),await R({quiet:!0})}}}async function pe(F){const ve=new Set(i.value);if(ve.has(F.name)){ve.delete(F.name),i.value=ve;return}ve.add(F.name),i.value=ve,Object.hasOwn(o.value,F.name)||await Ie(F.name)}async function Ie(F,ve=!1){if(!ve&&Object.hasOwn(o.value,F))return;const ke=new Set(c.value);ke.add(F),c.value=ke,r.value={...r.value,[F]:""};try{const Oe=await G.get(`/api/mcp/servers/${encodeURIComponent(F)}/tools`);o.value={...o.value,[F]:Oe.tools||[]}}catch(Oe){r.value={...r.value,[F]:Oe.message||"Failed to load tools"}}finally{const Oe=new Set(c.value);Oe.delete(F),c.value=Oe}}function _(F){return(o.value[F]||[]).filter(ve=>mk(ve,l.value[F]))}function P(F,ve){l.value={...l.value,[F]:ve}}function H(){u.value="add",p.value="",f.value=null,m.value=xr(),v.value="",d.value=!0}function ie(F){u.value="edit",p.value=F.name,f.value=F,m.value={...xr(),name:F.name,enabled:!!F.enabled,transport:F.transport||"stdio"},v.value="",d.value=!0}function se(){w.value||(d.value=!1)}function ae(F){d.value&&gk(F)}function fe(F){const ve=F==="headers"?"headerRows":"envRows";m.value[ve].push({key:"",value:""})}function ue(F,ve){const ke=F==="headers"?"headerRows":"envRows";m.value[ke].splice(ve,1)}function de(F,ve){const ke=F==="headers"?"headersRemove":"envRemove",Oe=m.value[ke];m.value[ke]=Oe.includes(ve)?Oe.filter(Pe=>Pe!==ve):[...Oe,ve]}async function le(){var ve,ke;v.value="";let F;try{F=pk(m.value,{mode:u.value,originalTransport:((ve=f.value)==null?void 0:ve.transport)||""})}catch(Oe){v.value=Oe instanceof Fs?Oe.message:"Invalid MCP server configuration",await Rt(),(ke=document.querySelector(".mcp-editor"))==null||ke.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&fk(F,f.value)&&!await qt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){w.value=!0;try{u.value==="add"?await G.post("/api/mcp/servers",F):await G.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,F),ye.success(u.value==="add"?`Saved ${F.name}`:`Updated ${p.value}`),d.value=!1,await R({quiet:!0})}catch(Oe){v.value=Oe.message||"Failed to save MCP server"}finally{w.value=!1}}}let xe=null;function me(F){`${(F==null?void 0:F.event)||""} ${(F==null?void 0:F.type)||""} ${(F==null?void 0:F.tool)||""} ${(F==null?void 0:F.message)||""}`.toLowerCase().includes("mcp")&&(xe&&window.clearTimeout(xe),xe=window.setTimeout(()=>R({quiet:!0}),200))}function _e(){g||(g=!0,b||(Ye.subscribe("events",me),b=!0),R(),q())}function Re(){g=!1,D(),xe&&window.clearTimeout(xe),xe=null,b&&(Ye.unsubscribe("events",me),b=!1)}return Ve(_e),ms(_e),ls(Re),mt(Re),{status:e,loading:t,mutating:s,pageError:n,servers:S,masterEnabled:A,aggregate:T,expandedServers:i,toolQueries:l,toolErrors:r,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:f,form:m,formError:v,saving:w,editorGroups:C,configuredHeaderKeys:y,configuredEnvKeys:O,savedHttpEndpoint:$,endpointRequired:k,endpointFieldLabel:M,endpointPlaceholder:j,refreshAll:R,busy:I,serverState:Z,stateLabel:W,transportLabel:J,protocolLabel:oe,toolSummary:ee,formatAge:xk,setMasterEnabled:Q,togglePending:ce,toggleServerEnabled:Ne,reconnect:ge,refreshTools:z,removeServer:re,toggleTools:pe,filteredTools:_,setToolQuery:P,openAdd:H,openEdit:ie,closeEditor:se,jumpToEditorGroup:ae,addSecretRow:fe,removeSecretRow:ue,toggleSecretRemoval:de,saveServer:le}}};function wk(e,t){if(!e||!t)return np(e);const s=np(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const kk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),o=h(null),r=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),m=h(null),v=h(null);let w=null;const L=h(null),x=h(!1),g=h({}),b=h({}),C=h({}),S=h({}),A=new Map,T=h(null),y=K(()=>e.value.reduce((W,J)=>W+(J.chunks||0),0)),O=K(()=>new Set(e.value.map(J=>J.uploader).filter(Boolean)).size);function $(W,J){const oe=b.value[J];if(!oe||oe.length===0)return 0;const ee=Math.max(...oe.map(ce=>ce.char_count||0));return ee===0?0:Math.round(W.char_count/ee*100)}async function k(){t.value=!0,s.value=null;try{const W=await G.get("/api/knowledge");e.value=Array.isArray(W)?W:[]}catch(W){s.value=W.message}t.value=!1}async function M(W){if(g.value[W]){g.value[W]=!1,T.value=null;return}if(g.value[W]=!0,Object.prototype.hasOwnProperty.call(b.value,W))return;if(A.has(W))return A.get(W);const J={...S.value,[W]:!0};S.value=J;const oe={...C.value};delete oe[W],C.value=oe;const ee=G.get(`/api/knowledge/${encodeURIComponent(W)}/chunks`).then(ce=>{b.value={...b.value,[W]:Array.isArray(ce)?ce:[]}}).catch(ce=>{C.value={...C.value,[W]:ce.message||"load failed"}}).finally(()=>{if(A.get(W)!==ee)return;A.delete(W);const ce={...S.value};delete ce[W],S.value=ce});return A.set(W,ee),ee}let j=0;async function q(){const W=n.value.trim();if(!W)return;const J=++j;i.value=!0,o.value=null,l.value=W;try{const oe=await G.get(`/api/knowledge/search?q=${encodeURIComponent(W)}`);if(J!==j)return;a.value=Array.isArray(oe)?oe:[]}catch(oe){if(J!==j)return;a.value=[],o.value=oe.message||"Search failed"}J===j&&(i.value=!1)}function D(){j+=1,i.value=!1,a.value=null,n.value="",o.value=null}async function R(){u.value=null,p.value=null;const W=c.value.trim(),J=d.value.trim();if(!W){u.value="Source name is required";return}if(!J){u.value="Content is required";return}f.value=!0;try{const oe=await G.post("/api/knowledge",{source:W,content:J});p.value=`Ingested ${oe.chunks||0} chunks from "${W}"`,c.value="",d.value="",b.value={},await k(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(oe){u.value=oe.message}f.value=!1}async function I(W){m.value=W,v.value=null,w&&(clearTimeout(w),w=null);try{const J=await G.post(`/api/knowledge/${encodeURIComponent(W)}/reingest`);v.value={source:W,error:!1,message:`Re-ingested ${J.chunks||0} chunks`},delete b.value[W],await k(),w=setTimeout(()=>{v.value=null,w=null},3e3)}catch(J){v.value={source:W,error:!0,message:J.message}}m.value=null}function U(W){L.value=W}async function Z(){if(L.value){x.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(L.value)}`),delete b.value[L.value],await k()}catch(W){ye.error(`Failed to delete source: ${W.message||"unknown error"}`)}x.value=!1,L.value=null}}return Ve(()=>{k()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:m,reingestResult:v,deleteTarget:L,deleting:x,expanded:g,sourceChunks:b,chunkErrors:C,loadingChunks:S,selectedChunk:T,totalChunks:y,uploaderCount:O,truncate:gd,formatTs:Aa,highlightTerms:wk,chunkBarWidth:$,fetchSources:k,toggleSource:M,doSearch:q,clearSearch:D,doIngest:R,doReingest:I,confirmDelete:U,doDelete:Z}}},Sk={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),o=h(!1),r=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),m=h(!1),v=h(null),w=h(null),L=h(new Set),x=h(null),g=h(!1),b=h(!1),C=K(()=>e.value.reduce((J,oe)=>J+oe.count,0)),S=K(()=>L.value.size);function A(J){const oe=t.value[J];if(!oe)return[];if(!l.value.trim())return oe;const ee=l.value.trim().toLowerCase();return oe.filter(ce=>ce.key.toLowerCase().includes(ee)||ce.value&&ce.value.toLowerCase().includes(ee))}function T(J,oe){return L.value.has(J+"/"+oe)}function y(J,oe){const ee=J+"/"+oe,ce=new Set(L.value);ce.has(ee)?ce.delete(ee):ce.add(ee),L.value=ce}function O(J){const oe=t.value[J];return!oe||oe.length===0?!1:oe.every(ee=>L.value.has(J+"/"+ee.key))}function $(J,oe){const ee=t.value[J];if(!ee)return;const ce=new Set(L.value);for(const Ne of ee){const Q=J+"/"+Ne.key;oe?ce.add(Q):ce.delete(Q)}L.value=ce}async function k(){s.value=!0,n.value=null;try{const J=await G.get("/api/memory");e.value=Object.entries(J).map(([oe,ee])=>({name:oe,keys:ee.keys||[],count:ee.count||0}))}catch(J){n.value=J.message}s.value=!1}async function M(J){if(a.value[J]){a.value[J]=!1;return}a.value[J]=!0;const oe=e.value.find(ce=>ce.name===J);if(!oe||t.value[J]||i.value===J)return;i.value=J;let ee;try{const Ne=(await G.get(`/api/memory/${encodeURIComponent(J)}`)).entries||{};ee=oe.keys.map(Q=>Object.prototype.hasOwnProperty.call(Ne,Q)?{key:Q,value:Ne[Q]||"",failed:!1}:{key:Q,value:"",failed:!0,error:"Not found in scope"})}catch(ce){ee=oe.keys.map(Ne=>({key:Ne,value:"",failed:!0,error:ce.message||"Failed to load"}))}t.value[J]=ee,i.value=null}function j(J,oe,ee){p.value=J+"/"+oe,f.value=ee}async function q(J,oe){m.value=!0,v.value=null;try{await G.put(`/api/memory/${encodeURIComponent(J)}/${encodeURIComponent(oe)}`,{value:f.value});const ee=t.value[J];if(ee){const ce=ee.find(Ne=>Ne.key===oe);ce&&(ce.value=f.value)}p.value=null}catch(ee){v.value=`Failed to save: ${ee.message||"unknown error"}`}m.value=!1}async function D(J,oe){try{await navigator.clipboard.writeText(oe.value),w.value=J+"/"+oe.key,setTimeout(()=>{w.value=null},1500)}catch{}}async function R(){d.value=null,u.value=null;const J=r.value.scope.trim(),oe=r.value.key.trim(),ee=r.value.value.trim();if(!J){d.value="Scope is required";return}if(!oe){d.value="Key is required";return}if(!ee){d.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(J)}/${encodeURIComponent(oe)}`,{value:ee}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await k(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ce){d.value=ce.message}c.value=!1}function I(J,oe){x.value={scope:J,key:oe}}async function U(){if(!x.value)return;g.value=!0,v.value=null;const{scope:J,key:oe}=x.value;try{await G.del(`/api/memory/${encodeURIComponent(J)}/${encodeURIComponent(oe)}`);const ee=t.value[J];ee&&(t.value[J]=ee.filter(Q=>Q.key!==oe));const ce=e.value.find(Q=>Q.name===J);ce&&(ce.count--,ce.keys=ce.keys.filter(Q=>Q!==oe));const Ne=new Set(L.value);Ne.delete(J+"/"+oe),L.value=Ne}catch(ee){v.value=`Failed to delete: ${ee.message||"unknown error"}`}g.value=!1,x.value=null}function Z(){b.value=!0}async function W(){g.value=!0,v.value=null;const J=[];for(const oe of L.value){const ee=oe.indexOf("/");J.push({scope:oe.slice(0,ee),key:oe.slice(ee+1)})}try{await G.post("/api/memory/bulk-delete",{entries:J}),L.value=new Set,t.value={},await k()}catch(oe){v.value=`Bulk delete failed: ${oe.message||"unknown error"}`}g.value=!1,b.value=!1}return Ve(()=>{k()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:m,actionError:v,copied:w,selected:L,selectedCount:S,totalEntries:C,deleteTarget:x,deleting:g,showBulkDelete:b,fetchMemory:k,toggleScope:M,startEdit:j,doEdit:q,copyValue:D,doAdd:R,confirmDelete:I,doDelete:U,confirmBulkDelete:Z,doBulkDelete:W,isSelected:T,toggleSelect:y,isScopeAllSelected:O,toggleSelectAll:$,filteredEntries:A}}},Tk={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=K(()=>[...new Set(e.value.map(w=>w.category))].sort()),r=K(()=>{const v={};return e.value.forEach(w=>{v[w.category]=(v[w.category]||0)+1}),v}),c=K(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await G.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,ye.success("Entry updated"),await m()}catch(w){ye.error(w.message||"Failed to save entry")}}async function f(v){if(await qt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(v)),ye.success("Entry deleted"),await m()}catch(L){ye.error(L.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await G.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return Ve(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:Aa,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:m}}},Qm=[{id:"tools",label:"Tools",component:lk},{id:"skills",label:"Skills",component:ck},{id:"mcp-servers",label:"MCP Servers",component:_k},{id:"knowledge",label:"Knowledge",component:kk},{id:"memory",label:"Memory",component:Sk},{id:"learned",label:"Learned",component:Tk}],Ck={components:{TabbedPage:Jo},setup(){return{tabs:Qm}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Ek={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Ak={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Rk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ik={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=K(()=>e.value.components||[]),l=K(()=>Rk[e.value.overall]||"text-gray-400"),o=K(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=K(()=>{const S=e.value.overall;return S==="healthy"?"All Systems Healthy":S==="degraded"?"Some Systems Degraded":S==="unhealthy"?"System Issues Detected":"Unknown"});function c(S){return Ek[S]||"text-gray-400"}function d(S){return Ak[S]||"info"}function u(S){return S==="ok"?"badge-success":S==="degraded"?"badge-warning":S==="down"?"badge-danger":"badge-info"}function p(S){return S==="closed"?"text-green-400":S==="half_open"?"text-yellow-400":S==="open"?"text-red-400":"text-gray-400"}function f(S){return S.replace(/_/g," ").replace(/\b\w/g,A=>A.toUpperCase())}function m(S){if(!S)return"—";try{return new Date(S).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return S}}function v(S){return S>=1e6?(S/1e6).toFixed(1)+"M":S>=1e3?(S/1e3).toFixed(1)+"K":String(S)}async function w(){a.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null,n.value=!0}catch(S){s.value=S.message}finally{t.value=!1,a.value=!1}}function L(){t.value=!0,s.value=null,w()}let x=null,g=!1;function b(){g||(g=!0,w(),x||(x=setInterval(w,3e4)))}function C(){g&&(g=!1,x&&(clearInterval(x),x=null))}return Ve(b),ms(b),ls(C),mt(C),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:m,formatNumber:v,fetchHealth:w,retry:L}}},Ok={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=K(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=K(()=>{if(!i.value)return[];const w=i.value,L=w.storage_total_bytes||1;return[{label:"Session Persistence",mb:w.sessions.persist_dir.total_mb,bytes:w.sessions.persist_dir.total_bytes,files:w.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(w.sessions.persist_dir.total_bytes/L*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:w.knowledge.db_file.total_mb,bytes:w.knowledge.db_file.total_bytes,files:w.knowledge.db_file.file_count,pct:Math.min(100,Math.round(w.knowledge.db_file.total_bytes/L*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:w.trajectories.message_dir.total_mb,bytes:w.trajectories.message_dir.total_bytes,files:w.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.message_dir.total_bytes/L*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:w.trajectories.agent_dir.total_mb,bytes:w.trajectories.agent_dir.total_bytes,files:w.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.agent_dir.total_bytes/L*100)),color:"res-bar-amber"}]});async function d(){try{const w=await G.get("/api/resource-usage");i.value=w,t.value=null,s.value=!0}catch(w){t.value=w.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function m(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function v(){f&&(f=!1,l&&(clearInterval(l),l=null))}return Ve(m),ms(m),ls(v),mt(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:o,collectedAt:r,storageItems:c,fmtNum:bd,refresh:u,retry:p}}},Lk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),Nk=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function Dk(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const n=Object.fromEntries(Object.entries(e[s]).filter(([a])=>!Nk.has(a)));Object.keys(n).length&&(t[s]=n)}return Object.keys(t).length?rl(t):""}function Mk(e){var a,i,l;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const o of["result_summary","detail","message","diff","error"])if(t[o]!==void 0&&t[o]!==null&&t[o]!==""){s=t[o];break}if(s===void 0&&((a=t.metadata)!=null&&a.error)&&(s=t.metadata.error),s===void 0){const o=Object.fromEntries(Object.entries(t).filter(([r])=>!Lk.has(r)));s=Object.keys(o).length?rl(o):""}const n=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:n,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??null}}const Pk={components:{ToolOutput:Yo},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=K(()=>Mk(e.entry)),s=K(()=>{var i;return rl(((i=e.entry.record)==null?void 0:i.tool_input)??"")}),n=K(()=>{var i,l,o;return rl(((i=e.entry.record)==null?void 0:i.error)||((o=(l=e.entry.record)==null?void 0:l.metadata)==null?void 0:o.error)||"")}),a=K(()=>Dk(e.entry.record));return{display:t,argumentsText:s,errorText:n,metadataText:a}},template:`
    <article class="log-line log-compact-line min-w-0"
             :class="{ 'log-line-error': entry.level === 'ERROR', 'log-line-warning': entry.level === 'WARNING' }"
             :data-log-id="entry.id">
      <tool-output presentation="compact" :value="display.body" :raw-value="entry.record || undefined" label="Live log record">
        <template #header>
          <button class="log-ts text-gray-500 hover:text-gray-300" @click="$emit('copy', entry)"
                  title="Copy complete retained record">{{ entry.ts }}</button>
          <span :class="entry.level === 'ERROR' ? 'text-red-400' : 'text-blue-400'">{{ entry.level }}</span>
          <span v-if="display.action" class="log-compact-action" :title="display.action">{{ display.action }}</span>
          <span v-if="display.status !== ''" class="text-gray-400">{{ display.status }}</span>
          <span v-if="display.duration !== null" class="text-gray-500">{{ display.duration }}ms</span>
          <span v-if="entry.attribution.agentId" class="log-compact-agent text-gray-400" :title="entry.attribution.agentId">{{ entry.attribution.label || entry.attribution.agentId }}</span>
          <span v-if="argumentsText" class="log-compact-arguments text-gray-500" data-log-arguments :title="argumentsText">{{ argumentsText }}</span>
        </template>
        <template #details>
          <div class="log-compact-attribution text-gray-500">
            <span v-if="entry.attribution.agentId">Agent {{ entry.attribution.label || entry.attribution.agentId }} ({{ entry.attribution.agentId }})</span>
            <span v-if="entry.attribution.turnId">turn {{ entry.attribution.turnId }}</span>
            <span v-if="entry.attribution.parentId">parent {{ entry.attribution.parentId }}</span>
            <span v-if="entry.attribution.rootId">root {{ entry.attribution.rootId }}</span>
            <span v-if="entry.attribution.iteration">iteration {{ entry.attribution.iteration }}</span>
            <span v-if="entry.attribution.callId">call {{ entry.attribution.callId }}</span>
          </div>
          <div v-if="argumentsText" class="log-compact-detail-arguments">
            <div class="text-gray-500">Arguments</div>
            <pre class="output-body output-wrapped">{{ argumentsText }}</pre>
          </div>
          <div v-if="errorText && errorText !== display.body" class="text-red-400">
            <span>Error</span><pre class="output-body output-wrapped">{{ errorText }}</pre>
          </div>
          <div v-if="metadataText" class="log-compact-metadata">
            <span class="text-gray-500">Metadata</span><pre class="output-body output-wrapped">{{ metadataText }}</pre>
          </div>
        </template>
      </tool-output>
    </article>`},ha=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),dc=e=>typeof e=="string"||typeof e=="number"?String(e):"";function Fk(e){const t=ha(e)?e:{},s=ha(t.metadata)?t.metadata:{},n=ha(t.audit_metadata)?t.audit_metadata:{},a=ha(t.turn)?t.turn:{},i=l=>dc(t[l]??s[l]??n[l]??a[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function rp(e){return e.record?JSON.stringify(e.record,null,2):e.text}function $k(e,t,s=new Date){var p,f;let n=e;if(ha(e)&&e.type==="log"&&"line"in e?n=e.line:ha(e)&&"payload"in e&&(n=e.payload),typeof n=="string")try{n=JSON.parse(n)}catch{}const a=ha(n)?n:null,i=a!=null&&a.timestamp?new Date(a.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=a?a.result_summary??a.detail??a.message??JSON.stringify(a):typeof n=="string"?n:JSON.stringify(n)??"",r=((p=a==null?void 0:a.metadata)==null?void 0:p.status)??(a==null?void 0:a.status),d=(a==null?void 0:a.error)||((f=a==null?void 0:a.metadata)==null?void 0:f.error)||["failed","error","cancelled","denied","outcome_unknown"].includes(r)?"ERROR":dc(a==null?void 0:a.level).toUpperCase()||"INFO",u={id:t,record:a,ts:l.toLocaleTimeString(),_time:l,level:d,text:typeof o=="string"?o:JSON.stringify(o),tool:dc(a==null?void 0:a.tool_name),raw:a?null:o,attribution:Fk(a)};return u.searchText=a?JSON.stringify(a):u.text,u}function Bk(e){const t=new Map;for(const s of e){const{turnId:n,agentId:a,rootId:i,label:l,parentId:o}=s.attribution,r=n?`turn:${n}`:a?`root:${i||a}`:"unattributed";t.has(r)||t.set(r,{key:r,title:n?`Turn ${n}`:a?`Agent root ${i||a} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=a?`agent:${a}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:a,label:l,parentId:o,rootId:i,title:a?`${l||"Agent"} (${a})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...n})=>n)}const Uk=["INFO","WARNING","ERROR"],Hk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],_r=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],zk=[50,100,200,500],jk={components:{ToolOutput:Yo,LogRecord:Pk},template:`
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
          <label class="flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-pointer">
            <input type="checkbox" v-model="groupByTurn" class="rounded" />
            Group by turn / agent
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
          <span class="font-mono">{{ filteredLogs.length.toLocaleString() }} / {{ logs.length.toLocaleString() }} records</span>
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
            <template v-if="groupByTurn">
              <section v-for="group in groupedLogs" :key="group.key" class="mb-3 min-w-0" data-log-group>
                <h2 class="text-sm font-semibold text-gray-300 break-all">{{ group.title }} · {{ group.count }} records</h2>
                <section v-for="section in group.sections" :key="section.key" class="pl-3 border-l border-gray-700 min-w-0" data-log-agent>
                  <h3 class="text-xs text-gray-400 mt-2 break-all">{{ section.title }}<span v-if="section.parentId"> · parent {{ section.parentId }}</span><span v-if="section.rootId"> · root {{ section.rootId }}</span></h3>
                  <log-record v-for="entry in section.entries" :key="entry.id" :entry="entry" @copy="copyLine" />
                </section>
              </section>
            </template>
            <template v-else>
              <log-record v-for="entry in filteredLogs" :key="entry.id" :entry="entry" @copy="copyLine" />
            </template>
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
                    <tool-output :value="entry.tool_input" />
                  </div>
                  <div v-if="entry.result_summary">
                    <div class="text-gray-500 mb-1">Result:</div>
                    <tool-output :value="entry.result_summary" />
                  </div>
                  <div v-if="entry.error" class="mt-2">
                    <div class="text-red-400 mb-1">Error:</div>
                    <tool-output :value="entry.error" />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>`,setup(){const e=h("live"),t=h([]);let s=0;const n=h(!1),a=h(!1),i=h(!0),l=h(""),o=h(""),r=h(!1),c=h(!1),d=h(Ye.state||"disconnected"),u=K(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=h(null),f=h(!1),m=h(null),v=2e3,w=Uk,L=Hk,x=_r,g=h("all"),b=h(""),C=h([]),S=h(!1),A=h(""),T=h([]);function y(){try{const X=localStorage.getItem("odin-log-presets");X&&(C.value=JSON.parse(X))}catch{}}function O(){try{localStorage.setItem("odin-log-presets",JSON.stringify(C.value))}catch{}}const $=K(()=>l.value!==""||o.value.trim()!==""||b.value!==""),k=K(()=>{const X=_r.find(we=>we.value===b.value);return X?X.label:""}),M=K(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(X){return X.message}}),j=24,q=K(()=>{if(J.value.length===0)return[];const X=[],we=new Date,$e=3600*1e3;for(let Ze=j-1;Ze>=0;Ze--){const wt=new Date(we.getTime()-(Ze+1)*$e),ut=new Date(we.getTime()-Ze*$e);X.push({start:wt,end:ut,label:U(wt,ut),shortLabel:ut.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ze of J.value){if(!Ze._time)continue;const wt=Ze._time.getTime();for(const ut of X)if(wt>=ut.start.getTime()&&wt<ut.end.getTime()){ut.total++,Ze.level==="ERROR"?ut.errors++:Ze.level==="WARNING"?ut.warnings++:ut.info++;break}}return X}),D=K(()=>{let X=1;for(const we of q.value)we.total>X&&(X=we.total);return X}),R=K(()=>{if(q.value.length===0)return"";const X=J.value.map(Ze=>Ze._time&&Ze._time.getTime()).filter(Boolean);if(X.length===0)return"";const we=new Date(Math.min(...X));return`${J.value.length} shown, oldest ${we.toLocaleTimeString()}`}),I=K(()=>Math.ceil(j/8));function U(X,we){const $e={hour:"2-digit",minute:"2-digit"};return X.toLocaleTimeString([],$e)+" - "+we.toLocaleTimeString([],$e)}function Z(X,we){return!we||!X?"0px":Math.max(2,X/we*100)+"%"}function W(X){const we=J.value.findIndex($e=>$e._time&&$e._time.getTime()>=X.start.getTime()&&$e._time.getTime()<X.end.getTime());if(we>=0&&p.value){const $e=p.value.querySelector('[data-log-id="'+J.value[we].id+'"]');$e&&($e.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const J=K(()=>{let X=t.value;if(l.value&&(X=X.filter(we=>(we.level||"INFO")===l.value)),b.value){const we=_r.find($e=>$e.value===b.value);if(we&&we.seconds){const $e=new Date(Date.now()-we.seconds*1e3);X=X.filter(Ze=>Ze._time&&Ze._time>=$e)}}if(o.value&&!M.value)if(r.value)try{const we=new RegExp(o.value,"i");X=X.filter($e=>{const Ze=$e.searchText,wt=$e.tool||"";return we.test(Ze)||we.test(wt)})}catch{}else{const we=o.value.toLowerCase();X=X.filter($e=>{const Ze=$e.searchText.toLowerCase(),wt=($e.tool||"").toLowerCase();return Ze.includes(we)||wt.includes(we)})}return X}),oe=K(()=>Bk(J.value));function ee(X){const we=$k(X,++s);if(a.value){T.value.push(we);return}ce(we)}function ce(X){t.value.push(X),t.value.length>v&&(t.value=t.value.slice(-v)),i.value&&Rt(()=>Ne())}function Ne(X=!1){const we=p.value;we&&we.scrollTo({top:we.scrollHeight,behavior:X?"smooth":"instant"})}function Q(){i.value=!0,f.value=!1,Rt(()=>Ne(!0))}const ge=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function z(){const X=p.value;if(!X)return;const we=X.scrollHeight-X.scrollTop-X.clientHeight<40;f.value=!i.value&&!we&&t.value.length>0,_.value&&re()}function re(){const X=p.value;!X||!i.value||X.scrollHeight-X.scrollTop-X.clientHeight>=40&&(i.value=!1,f.value=t.value.length>0)}function pe(){i.value&&requestAnimationFrame(re)}function Ie(X){ge.has(X.key)&&pe()}const _=h(!1);function P(){i.value&&(_.value=!0,requestAnimationFrame(re))}function H(){_.value&&(_.value=!1,re())}function ie(){i.value&&(f.value=!1,Rt(()=>Ne()))}function se(){if(a.value=!a.value,!a.value&&T.value.length>0){for(const X of T.value)ce(X);T.value=[]}}function ae(){t.value=[],T.value=[],f.value=!1}function fe(){let X;e.value==="search"?X=Le.value.map(wt=>{const ut=wt.error?"ERROR":"INFO",$n=wt.tool_name?`[${wt.tool_name}] `:"";return`${wt.timestamp||""} ${ut} ${$n}${wt.result_summary||wt.message||""}`}).join(`
`):X=J.value.map(rp).join(`

`);const we=new Blob([X],{type:"text/plain"}),$e=URL.createObjectURL(we),Ze=document.createElement("a");Ze.href=$e,Ze.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ze.click(),URL.revokeObjectURL($e)}function ue(X){const we=rp(X);navigator.clipboard.writeText(we).then(()=>{m.value=X.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function de(X){l.value=l.value===X?"":X,g.value="all"}function le(X){return X.level==="ERROR"?"log-line-error":X.level==="WARNING"?"log-line-warning":"text-gray-300"}function xe(X){return X==="ERROR"?"text-red-500 font-semibold":X==="WARNING"?"text-yellow-500":"text-blue-500"}function me(X){return X==="ERROR"?"log-chip-error":X==="WARNING"?"log-chip-warning":"log-chip-info"}function _e(X){g.value=X.id;const we=X.filters;l.value=we.level||"",b.value=we.timeRange||"",o.value=we.text||"",we.levels&&(l.value=we.levels[0]||""),we.hasToolName&&(o.value="")}function Re(X){g.value=X.id,l.value=X.filters.level||"",b.value=X.filters.timeRange||"",o.value=X.filters.text||""}function F(){if(!A.value.trim())return;const X={id:"custom-"+Date.now(),name:A.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};C.value=[...C.value,X],O(),S.value=!1,A.value=""}function ve(X){C.value=C.value.filter(we=>we.id!==X),O(),g.value===X&&(g.value="all")}const ke=h("all"),Oe=h(""),Pe=h(""),dt=h(""),st=h(""),_t=h(""),Ot=h(100),rt=zk,Qe=h(!1),ne=h(!1),Se=h(""),Le=h([]),Ke=h(null),Et=h(null);function je(){e.value="search",Ke.value||Ft()}async function Ft(){try{Ke.value=await G.get("/api/logs/stats")}catch{}}function Ht(){const X=_t.value;if(!X){dt.value="",st.value="";return}const $e={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[X];if($e){const Ze=new Date(Date.now()-$e*1e3);dt.value=os(Ze),st.value=""}}function os(X){const we=$e=>String($e).padStart(2,"0");return`${X.getFullYear()}-${we(X.getMonth()+1)}-${we(X.getDate())}T${we(X.getHours())}:${we(X.getMinutes())}`}function Zs(X){if(!X)return"";const we=new Date(X);return isNaN(we.getTime())?"":we.toISOString()}async function ks(){Qe.value=!0,Se.value="",ne.value=!0,Et.value=null;try{const X=new URLSearchParams;ke.value&&ke.value!=="all"&&X.set("level",ke.value),Oe.value&&X.set("tool",Oe.value),Pe.value&&X.set("q",Pe.value);const we=Zs(dt.value),$e=Zs(st.value);we&&X.set("start",we),$e&&X.set("end",$e),X.set("limit",String(Ot.value));const Ze=await G.get(`/api/logs/search?${X.toString()}`);Le.value=Ze.entries||[]}catch(X){Se.value=X.message||"Search failed",Le.value=[]}finally{Qe.value=!1}}function sa(){ke.value="all",Oe.value="",Pe.value="",dt.value="",st.value="",_t.value="",Ot.value=100,Le.value=[],ne.value=!1,Se.value="",Et.value=null}function Js(X){Et.value=Et.value===X?null:X}function Ls(X){if(!X.timestamp)return"";try{return new Date(X.timestamp).toLocaleString()}catch{return X.timestamp}}function Pn(X){return X.type==="web_action"?`${X.status||""} (${X.execution_time_ms||0}ms)`:(X.result_summary||"").slice(0,200)}function Ss(X){return X.error?"log-line-error":"text-gray-300"}function Fn(X){try{return JSON.stringify(X,null,2)}catch{return String(X)}}let zt=null,Xe=!1;function Ns(){Xe||(Xe=!0,Ye.subscribe("logs",ee),c.value=Ye.connected,d.value=Ye.state||"disconnected",zt=Ye.onState(X=>{d.value=X,c.value=X==="connected"}))}function Ds(){Xe&&(Xe=!1,Ye.unsubscribe("logs",ee),zt&&(zt(),zt=null))}return Ve(()=>{y(),window.addEventListener("pointerup",H),window.addEventListener("pointercancel",H)}),ms(Ns),ls(Ds),mt(()=>{Ds(),window.removeEventListener("pointerup",H),window.removeEventListener("pointercancel",H)}),{mode:e,logs:t,paused:a,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:n,groupedLogs:oe,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:J,pauseBuffer:T,showJumpBottom:f,copiedIndex:m,regexError:M,levels:w,logPresets:L,timeRanges:x,timeRange:b,activeLogPreset:g,customLogPresets:C,showSaveLogPreset:S,newLogPresetName:A,hasActiveLogFilters:$,timeRangeLabel:k,timelineBuckets:q,timelineMax:D,timelineSpanLabel:R,timelineLabelSkip:I,togglePause:se,clearLogs:ae,exportLogs:fe,logLineClass:le,levelClass:xe,levelChipClass:me,toggleLevel:de,copyLine:ue,jumpToBottom:Q,onScroll:z,onUserScrollIntent:pe,onUserScrollKey:Ie,onAutoScrollToggle:ie,onPointerDown:P,applyLogPreset:_e,applyCustomLogPreset:Re,saveLogCustomPreset:F,removeLogCustomPreset:ve,segmentHeight:Z,jumpToTimelineBucket:W,searchLevel:ke,searchTool:Oe,searchKeyword:Pe,searchStart:dt,searchEnd:st,searchTimePreset:_t,searchLimit:Ot,searchLimits:rt,searching:Qe,searchRan:ne,searchError:Se,searchResults:Le,searchStats:Ke,expandedSearch:Et,switchToSearch:je,runSearch:ks,clearSearchFilters:sa,toggleSearchExpand:Js,formatSearchTs:Ls,searchEntryText:Pn,searchLogLineClass:Ss,formatJson:Fn,applySearchTimePreset:Ht}}};function Dl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const Vk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function qk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Xa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Gk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},wr=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),Kk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function cp(e){return Kk.some(t=>e===t||e.startsWith(`${t}.`))}const Xm="odin_config_center_expanded_v1",ev="odin_config_center_category_v1",Wk=50,Zk=650,kr=()=>G.get("/api/config/meta");function ca(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Ui(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Ma(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Jk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function Yk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function tv(e,t){if(Ui(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return ca(t);const n={};for(const[a,i]of Object.entries(t)){const l=tv(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function Qk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=tv(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function sv(e,t,s,n){if(Ui(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)sv(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function Xk(){try{const e=JSON.parse(localStorage.getItem(Xm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function eS(){try{const e=localStorage.getItem(ev);return Xa.some(t=>t.key===e)?e:Xa[0].key}catch{return Xa[0].key}}const tS={template:`
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
                    <div v-if="section === 'tools' && hasHostsCollection()" class="cfgc-mcp-owner">
                      <span class="cfgc-mcp-owner-icon" aria-hidden="true"><odin-icon name="server" :size="18" /></span>
                      <div>
                        <strong>Managed hosts have a dedicated control plane</strong>
                        <p>{{ hostsConfigSummary() }} Host inventory is read-only here so durable config, runtime generations, access fences, and pinned trust cannot split.</p>
                      </div>
                      <router-link class="btn btn-ghost text-xs" :to="{ path: '/system', query: { tab: 'hosts' } }">
                        Open Hosts <odin-icon name="chevronRight" :size="14" />
                      </router-link>
                    </div>
                    <section v-for="fieldGroup in fieldGroups(section).filter(group => section !== 'tools' || group.path !== 'tools.hosts')" :key="fieldGroup.key" :class="['cfgc-field-group', { nested: fieldGroup.path }]">
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),o=h(null),r=h(!1),c=h(!1),d=h(null),u=h(""),p=h("all"),f=h(eS()),m=h(Xk()),v=h({}),w=h({}),L=h(""),x=h({}),g=h({}),b=h([]),C=h([]),S=h(!1),A=h(!1),T=h(!1);let y=null,O=null,$={path:null,at:0},k=0;const M=K(()=>{var E;return(((E=t.value)==null?void 0:E.fields)||[]).filter(B=>!wr.has(B.path.split(".")[0])&&!cp(B.path))}),j=K(()=>new Map(M.value.map(E=>[E.path,E]))),q=K(()=>Z.value.reduce((E,B)=>E+B.sections.length,0)),D=K(()=>M.value.length),R=K(()=>Vk),I=K(()=>b.value.length>0),U=K(()=>C.value.length>0),Z=K(()=>{if(!e.value)return[];const E=new Set(Xa.flatMap(Ee=>Ee.sections)),B=Xa.map(Ee=>({...Ee,sections:Ee.sections.filter(ct=>Object.hasOwn(e.value,ct)&&!wr.has(ct))})).filter(Ee=>Ee.sections.length),Y=Object.keys(e.value).filter(Ee=>!E.has(Ee)&&!wr.has(Ee));return Y.length&&B.push({key:"other",label:"Other",icon:"folder",sections:Y}),B}),W=K(()=>e.value?{...e.value,...v.value}:null),J=K(()=>{if(!e.value)return[];const E=[];for(const[B,Y]of Object.entries(v.value))sv(e.value[B],Y,B,E);return E.filter(B=>!Ui(B.oldVal,B.newVal)).map(B=>{const Y=P(B.path);return{...B,label:(Y==null?void 0:Y.label)||Ma(B.path.split(".").at(-1)),apply_mode:(Y==null?void 0:Y.apply_mode)||de(B.path.split(".")[0])}})}),oe=K(()=>J.value.length>0),ee=K(()=>J.value.length),ce=K(()=>new Set(J.value.map(E=>E.path.split(".")[0])).size),Ne=K(()=>!!u.value||p.value!=="all"),Q=K(()=>{const E={...g.value};for(const B of J.value){const Y=P(B.path),Ee=mi(Y,B.newVal);Ee&&(E[B.path]=Ee)}return E}),ge=K(()=>Object.keys(Q.value).length>0),z=K(()=>e.value?(Ne.value?Z.value:Z.value.filter(B=>B.key===f.value)).map(B=>({...B,sections:B.sections.filter(Y=>Qe(Y))})).filter(B=>B.sections.length):[]),re=K(()=>{const E=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],B=new Map(E.map(Y=>[Y,[]]));for(const Y of J.value){const Ee=B.has(Y.apply_mode)?Y.apply_mode:"restart";B.get(Ee).push(Y)}return E.filter(Y=>B.get(Y).length).map(Y=>({key:Y,label:Yt(Y),entries:B.get(Y)}))}),pe=K(()=>J.value.filter(E=>E.apply_mode==="restart").length),Ie=K(()=>M.value.filter(E=>E.pending_restart)),_=K(()=>Ie.value.length);function P(E){const B=j.value.get(E);return B?{...B,apply_details:Dl([B])}:null}function H(E){const B=`${E}.`;return M.value.filter(Y=>Y.path===E||Y.path.startsWith(B))}function ie(){return M.value.some(E=>E.path==="tools.hosts"||E.path.startsWith("tools.hosts."))}function se(){var Y,Ee;const E=((Ee=(Y=e.value)==null?void 0:Y.tools)==null?void 0:Ee.hosts)||{},B=Object.keys(E).length;return`${B} host${B===1?"":"s"} configured.`}function ae(E){return H(E).length}function fe(E){return Ma(E)}function ue(E){const B=H(E);if(!B.length)return`${Ma(E)} configuration.`;const Y=B.find(Ts=>Ts.sensitivity==="public"&&Ts.description)||B.find(Ts=>Ts.description),Ee=(Y==null?void 0:Y.description)||"";return Ee.match(/setting for (.+)\.$/i)?`${Ma(E)} settings and runtime behaviour.`:Ee}function de(E){const B=[...new Set(H(E).map(Y=>Y.apply_mode))];return B.length===1?B[0]:B.includes("restart")?"restart":B.includes("activation_required")?"activation_required":B[0]||"restart"}function le(E){const B=[...new Set(H(E).map(Y=>Yt(Y.apply_mode)))];return B.length?B.length===1?B[0]:`Mixed apply behaviour: ${B.join(" · ")}`:""}function xe(E){return Dl(H(E))}function me(E){var B;return Object.hasOwn(v.value,E)?v.value[E]:(B=e.value)==null?void 0:B[E]}function _e(){const E=me("mcp")||{},B=Object.keys(E.servers||{}).length;return`${E.enabled?"Globally enabled":"Globally disabled"} · ${B} configured server${B===1?"":"s"}.`}function Re(E,B){return B.split(".").reduce((Y,Ee)=>Y==null?void 0:Y[Ee],E)}function F(E){const B=W.value;return H(E).filter(Y=>cp(Y.path)?!1:Y.path.split(".").length<=2?!0:!Y.path.includes(".*")).map(Y=>({...Y,key:Y.path.split(".").at(-1),value:Re(B,Y.path),apply_details:Dl([Y]),editor:Y.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ve(E){const B=E.path.split(".");return B.length>2?B.slice(0,2).join("."):null}function ke(E){const B=new Map;for(const Y of F(E)){const Ee=ve(Y),ct=Ee||`${E}.__root`;B.has(ct)||B.set(ct,{key:ct,path:Ee,entries:[]}),B.get(ct).entries.push(Y)}return[...B.values()].map(Y=>{const Ee=Y.entries.find(ct=>ct.group_description);return{...Y,label:Y.path?Ma(Y.path.split(".").at(-1)):null,description:(Ee==null?void 0:Ee.group_description)||null,apply_details:Dl(Y.entries),runtime_summaries:Pe(Y.entries)}})}function Oe(E){return{save:E.save_effect||(E.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:E.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[E.apply_mode]||"Effective runtime state is not currently observable."}}function Pe(E){const B=new Map;for(const Y of E){const Ee=Oe(Y),ct=`${Y.apply_mode}|${Ee.save}|${Ee.runtime}`;B.has(ct)||B.set(ct,{key:ct,label:Yt(Y.apply_mode),save:Ee.save,runtime:Ee.runtime})}return[...B.values()]}function dt(E){if(st(E))return E.runtime_effect||E.activation_policy||"";if(E.apply_mode==="activation_required"){const B=E.activation_policy||E.runtime_effect;return B?`Not active after saving. No activation control exists in this release. ${B}`:"Not active after saving; no activation control exists in this release."}return""}function st(E){return E.action_available===!0&&!!(E.action_label&&E.action_endpoint)}async function _t(E){if(st(E))try{if(Et(E.path))throw new Error("Save this setting before applying its action.");const B=String(E.action_method||"POST").toLowerCase(),Y={post:G.post.bind(G),put:G.put.bind(G),delete:G.del.bind(G)}[B];if(!Y)throw new Error("Unsupported configuration action");await Y(E.action_endpoint,E.action_body||void 0),await De(),Qt("success",`${E.action_label} completed.`)}catch(B){Qt("error",B.message||`${E.action_label} failed`)}}function Ot(E,B){return[E.label,E.path,E.description,...E.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(B)}function rt(E){const B=u.value.trim().toLowerCase();return B?H(E).filter(Y=>Ot(Y,B)):[]}function Qe(E){const B=H(E);if(p.value!=="all"&&!B.some(Ee=>Ee.apply_state===p.value))return!1;const Y=u.value.trim().toLowerCase();return!Y||`${fe(E)} ${E}`.toLowerCase().includes(Y)?!0:B.some(Ee=>Ot(Ee,Y))}function ne(E,B){return H(E).filter(Y=>Y.apply_state===B).length}function Se(E){return E==="all"?D.value:M.value.filter(B=>B.apply_state===E).length}function Le(E){const B=E.sections.flatMap(Y=>H(Y));return{fields:B.length,modified:J.value.filter(Y=>E.sections.includes(Y.path.split(".")[0])).length,pending_restart:B.filter(Y=>Y.apply_state==="pending_restart").length,invalid:B.filter(Y=>Y.apply_state==="invalid").length,dormant:B.filter(Y=>Y.apply_state==="dormant").length}}function Ke(E){var B;return Object.hasOwn(v.value,E)&&!Ui((B=e.value)==null?void 0:B[E],v.value[E])}function Et(E){return J.value.some(B=>B.path===E||B.path.startsWith(`${E}.`))}function je(E){f.value=E,u.value="",p.value="all";try{localStorage.setItem(ev,E)}catch{}}function Ft(E){p.value=E}function Ht(){u.value="",p.value="all"}function os(E){var B;return((B=Z.value.find(Y=>Y.sections.includes(E)))==null?void 0:B.sections)||[]}function Zs(E){const B=os(E),Y=B.find(Ee=>m.value[Ee]===!0);return Y||B.find(Ee=>m.value[Ee]!==!1)||null}function ks(E){return u.value&&!T.value&&Qe(E)?!0:T.value?Zs(E)===E:Object.hasOwn(m.value,E)?m.value[E]===!0:!0}function sa(E){const B=!ks(E);if(T.value){const Y={...m.value};for(const Ee of os(E))Y[Ee]===!0&&(Y[Ee]=!1);Y[E]=B,m.value=Y;return}m.value={...m.value,[E]:B}}function Js(){b.value.push(ca(v.value)),b.value.length>Wk&&b.value.shift(),C.value=[]}function Ls(){oe.value&&(Js(),v.value={},g.value={},S.value=!1)}function Pn(E,B=!1){const Y=Date.now();if(B&&$.path===E&&Y-$.at<Zk){$.at=Y;return}Js(),$={path:E,at:Y}}function Ss(E,B,Y){if(!B.length)return Y;const Ee=ca(E??{});let ct=Ee;for(let Ts=0;Ts<B.length-1;Ts+=1){const pn=B[Ts];ct[pn]=ca(ct[pn]??{}),ct=ct[pn]}return ct[B.at(-1)]=Y,Ee}function Fn(E){var B;return Object.hasOwn(v.value,E)?v.value[E]:ca((B=e.value)==null?void 0:B[E])}function zt(E,B,Y={}){var Ad;const[Ee,...ct]=E.path.split(".");Pn(E.path,!!Y.coalesce);const Ts=Fn(Ee),pn=ct.length?Ss(Ts,ct,B):B,aa={...v.value};if(Ui(pn,(Ad=e.value)==null?void 0:Ad[Ee])?delete aa[Ee]:aa[Ee]=pn,v.value=aa,g.value[E.path]){const Rd={...g.value};delete Rd[E.path],g.value=Rd}}function Xe(E){$={path:null,at:0},w.value={...w.value,[E]:String(Re(W.value,E)??"")}}function Ns(E){if($={path:null,at:0},!Object.hasOwn(w.value,E))return;const B={...w.value};delete B[E],w.value=B}function Ds(E){const B=w.value[E.path];if($={path:null,at:0},B===""){g.value={...g.value,[E.path]:"Enter a number."};return}const Y=Number(B);if(Number.isNaN(Y)||E.type==="integer"&&!Number.isInteger(Y)){g.value={...g.value,[E.path]:E.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Ee={...w.value};delete Ee[E.path],w.value=Ee,zt(E,Y,{coalesce:!0})}function X(E){return Object.hasOwn(w.value,E.path)?w.value[E.path]:E.value??""}function we(E,B){if(w.value={...w.value,[E.path]:B},B===""){g.value={...g.value,[E.path]:"Enter a number."};return}const Y=Number(B);if(!Number.isFinite(Y)||E.type==="integer"&&!Number.isInteger(Y)){g.value={...g.value,[E.path]:E.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(g.value[E.path]){const Ee={...g.value};delete Ee[E.path],g.value=Ee}zt(E,Y,{coalesce:!0})}function $e(E){const B=Number.parseInt(L.value,10);if(!Number.isInteger(B)||B<1){g.value={...g.value,[E.path]:"Warning thresholds must be positive whole numbers."};return}const Y=[...new Set([...E.value||[],B])].sort((Ee,ct)=>ct-Ee);L.value="",zt(E,Y)}function Ze(E,B){zt(E,(E.value||[]).filter(Y=>Y!==B))}function wt(E){return E.apply_mode==="live_read"?"Odin reads the saved file value on next use.":E.apply_mode==="live_for_new_work"?"New work uses the saved file value.":E.apply_mode==="live_apply"?E.apply_handler?`Apply the saved value through ${E.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":E.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":E.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":E.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function ut(E){return E.type==="array"&&Array.isArray(E.value)&&!E.structured_container&&!E.structured_container_child&&E.sensitivity==="public"&&E.value.every(B=>["string","number","boolean"].includes(typeof B))}function $n(E){const B=String(x.value[E.path]??"").trim();if(!B)return;const Y=[...new Set([...E.value||[],B])];x.value={...x.value,[E.path]:""},zt(E,Y)}function js(E,B){zt(E,(E.value||[]).filter(Y=>Y!==B))}function mi(E,B){var Ee;if(!E)return null;if((Ee=E.enum)!=null&&Ee.length&&!E.enum.includes(B))return`Choose one of: ${E.enum.join(", ")}`;if(E.path==="agents.final_warning_iterations"&&(!Array.isArray(B)||!B.length))return"Add at least one warning threshold.";const Y=E.constraints||{};if((E.type==="integer"||E.type==="number")&&typeof B=="number"){if(Y.minimum!==void 0&&B<Y.minimum)return`Must be at least ${Y.minimum}${E.unit?` ${E.unit}`:""}`;if(Y.maximum!==void 0&&B>Y.maximum)return`Must be at most ${Y.maximum}${E.unit?` ${E.unit}`:""}`}return null}function vi(E){return Q.value[E.path]||null}function Ia(E){const B=`${E}.`;return Object.keys(Q.value).some(Y=>Y===E||Y.startsWith(B))}function na(){b.value.length&&(C.value.push(ca(v.value)),v.value=b.value.pop(),g.value={},w.value={},$={path:null,at:0})}function Bn(){C.value.length&&(b.value.push(ca(v.value)),v.value=C.value.pop(),g.value={},w.value={},$={path:null,at:0})}function Un(){!oe.value||ge.value||(S.value=!0,A.value=!1)}function Ys(){S.value=!1}function dn(){Ls()}function Yt(E){return Gk[E]||Ma(E||"unknown")}function Oa(E){return`apply-${String(E||"unknown").replaceAll("_","-")}`}function V(E){return`cfgc-field-${E.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function be(E){return`${V(E)}-input`}function Ae(E){const B=document.getElementById(V(E))||document.getElementById(V(E.split(".").slice(0,2).join(".")));B==null||B.scrollIntoView({behavior:"smooth",block:"center"})}function Qt(E,B){l.value={type:E,message:B},window.setTimeout(()=>{var Y;((Y=l.value)==null?void 0:Y.message)===B&&(l.value=null)},3500)}function un(){r.value=!1,p.value="pending_restart",u.value="";const E=qk(n.value);E&&(E.scrollTop=0)}function Hn(){r.value=!1}function Te(E=1800){O&&window.clearTimeout(O),O=window.setTimeout(N,E)}async function N(){if(c.value){if(k+=1,k>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await kr(),_.value===0){c.value=!1,d.value=null,Qt("success","Odin restarted and the saved startup settings are active.");return}}catch{}Te(2e3)}}async function te(){if(!c.value){d.value=null;try{await G.post("/api/restart",{}),c.value=!0,k=0,r.value=!1,Te()}catch(E){d.value=E.message||"Odin could not schedule a restart."}}}async function he(){if(!(!oe.value||ge.value||a.value)){a.value=!0;try{const E=Qk(e.value,v.value),B=await G.put("/api/config",E);e.value=B,v.value={},b.value=[],C.value=[],g.value={},S.value=!1;try{t.value=await kr(),o.value=null,r.value=_.value>0,Qt("success",_.value?`Configuration saved. ${_.value} setting${_.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(Y){o.value=Y.message||"Unknown metadata error.",Qt("error",`Configuration saved, but apply status could not be refreshed: ${o.value}`)}}catch(E){Qt("error",E.message||"Configuration could not be saved")}finally{a.value=!1}}}async function De(){var E,B;if(!oe.value){s.value=!0,i.value=null;try{const Y=await G.get("/api/config"),Ee=await kr();e.value=Y,t.value=Ee,o.value=null;const ct=Z.value;if(ct.some(Ts=>Ts.key===f.value)||(f.value=((E=ct[0])==null?void 0:E.key)||Xa[0].key),T.value){const pn=(((B=ct.find(aa=>aa.key===f.value))==null?void 0:B.sections)||[]).find(aa=>m.value[aa]===!0);m.value=pn?{...m.value,[pn]:!0}:{}}}catch(Y){i.value=Y.message||"Unknown configuration error"}finally{s.value=!1}}}function Fe(E){if(S.value||!(E.ctrlKey||E.metaKey))return;const B=E.target;B instanceof HTMLElement&&(B.matches("input, textarea, select")||B.isContentEditable)||(!E.shiftKey&&E.key.toLowerCase()==="z"?(E.preventDefault(),na()):(E.key.toLowerCase()==="y"||E.shiftKey&&E.key.toLowerCase()==="z")&&(E.preventDefault(),Bn()))}function Ue(E){T.value=E.matches}Mt(m,E=>{try{localStorage.setItem(Xm,JSON.stringify(E))}catch{}},{deep:!0});let yt=!1;function it(){yt||(yt=!0,document.addEventListener("keydown",Fe))}function vt(){yt&&(yt=!1,document.removeEventListener("keydown",Fe))}return Ve(()=>{var E;De(),it(),y=window.matchMedia("(max-width: 760px)"),Ue(y),(E=y.addEventListener)==null||E.call(y,"change",Ue)}),ms(it),ls(vt),mt(()=>{var E;vt(),(E=y==null?void 0:y.removeEventListener)==null||E.call(y,"change",Ue),O&&window.clearTimeout(O)}),{armKeydown:it,disarmKeydown:vt,handleKeydown:Fe,config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:o,restartPromptOpen:r,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:f,reviewOpen:S,mobileOverflowOpen:A,warningThresholdInput:L,arrayInputs:x,healthFilters:R,visibleCategories:Z,displayGroups:z,reviewGroups:re,sectionCount:q,fieldCount:D,hasChanges:oe,changeCount:ee,changedSectionCount:ce,hasDraftErrors:ge,canUndo:I,canRedo:U,globalFilterActive:Ne,reviewRestartCount:pe,pendingRestartCount:_,pendingRestartFields:Ie,healthCount:Se,categoryStats:Le,selectCategory:je,selectHealthFilter:Ft,clearFilters:Ht,sectionLabel:fe,sectionDescription:ue,sectionFieldCount:ae,sectionHealthCount:ne,sectionApplySummary:le,sectionApplyDetails:xe,sectionEntries:F,fieldGroups:ke,sectionSearchHits:rt,mcpConfigSummary:_e,fieldRuntimeCopy:Oe,fieldSpecificRuntimeNote:dt,hasHonestAction:st,runFieldAction:_t,hasHostsCollection:ie,hostsConfigSummary:se,sectionChanged:Ke,fieldChanged:Et,isSectionExpanded:ks,toggleSection:sa,discardAllDrafts:Ls,setFieldValue:zt,setNumberFieldValue:we,numberInputValue:X,beginInputEdit:Xe,endTextInputEdit:Ns,endInputEdit:Ds,addWarningThreshold:$e,removeWarningThreshold:Ze,isScalarArray:ut,addScalarArrayItem:$n,removeScalarArrayItem:js,fieldError:vi,sectionHasErrors:Ia,undo:na,redo:Bn,openReview:Un,closeReview:Ys,mobileCancel:dn,applyModeLabel:Yt,applyClass:Oa,compactValue:Jk,formatValue:Yk,structuredApplyCopy:wt,fieldId:V,fieldInputId:be,focusField:Ae,fetchConfig:De,saveConfig:he,restartOdin:te,restartLater:Hn,reviewPendingRestart:un}}},sS=/^\d{15,25}$/;function nv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const av={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=K(()=>new Set((e.excludedIds||[]).map(String))),o=K(()=>{const C=s.value.toLowerCase().trim();return(e.members||[]).filter(S=>l.value.has(String(S.id))?!1:C?u(S).toLowerCase().includes(C)||String(S.username||"").toLowerCase().includes(C)||String(S.id).includes(C):!0)}),r=K(()=>{const C=s.value.trim();return o.value.length===0&&sS.test(C)&&!l.value.has(C)?C:""}),c=K(()=>o.value.length+(r.value?1:0)),d=K(()=>{if(n.value){if(o.value[a.value])return`${e.optionsId}-${a.value}`;if(r.value&&a.value===o.value.length)return`${e.optionsId}-raw`}});function u(C){return nv(C)}function p(){n.value=!0,a.value=0}function f(){p()}function m(){const C=Math.max(c.value-1,0);a.value=Math.min(a.value+1,C)}function v(){a.value=Math.max(a.value-1,0)}function w(){const C=o.value[a.value];C?L(C):r.value&&a.value===o.value.length&&x(r.value)}function L(C){x(String(C.id))}function x(C){t("select",C),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function b(){setTimeout(g,150)}return Ve(()=>{e.autofocus&&Rt(()=>{var C;return(C=i.value)==null?void 0:C.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:m,highlightPrevious:v,selectHighlighted:w,selectMember:L,selectId:x,closeOptions:g,onBlur:b}}};function dp(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const nS={components:{DiscordUserCombobox:av},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),o=h(null),r=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=K(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=K(()=>new Map(c.value.map(D=>[String(D.id),D])));function m(D){return D.config&&D.config.enabled!==void 0?D.config.enabled:!0}function v(D){return dp(D,"require_mention",a.value)}function w(D){return dp(D,"respond_to_bots",a.value)}function L(D){return D.config&&Object.keys(D.config).length>0}function x(D){n.value[D]=!n.value[D]}function g(D){const R=D.discord||{};return{allowed_users:[...R.allowed_users||[]],channels:[...R.channels||[]],respond_to_bots:!!R.respond_to_bots,require_mention:!!R.require_mention,ignore_bot_ids:[...R.ignore_bot_ids||[]]}}async function b({showLoading:D=!0}={}){const R=++d;D&&(t.value=!0),s.value=null;try{const I=await G.get("/api/discord/guilds");R===d&&(e.value=I)}catch(I){R===d&&(s.value=I.message)}finally{D&&R===d&&(t.value=!1)}}async function C(){t.value=!0,s.value=null;try{const[D,R,I]=await Promise.all([G.get("/api/discord/guilds"),G.get("/api/discord/members").catch(()=>[]),G.get("/api/config")]),U=g(I),Z=p.value;a.value=U,Z||(i.value=JSON.parse(JSON.stringify(U))),c.value=R,e.value=D,o.value=null}catch(D){s.value=D.message}finally{t.value=!1}}let S=Promise.resolve();const A=h(new Set);function T(D,R){const I=new Set(A.value);I.add(D),A.value=I;const U=S.then(R);return S=U.catch(()=>{}),U.finally(()=>{const Z=new Set(A.value);Z.delete(D),A.value=Z})}function y(D,R,I,U){const Z=(U==null?void 0:U.target)??null;return T(`guild:${D}:${R}`,async()=>{try{await G.put("/api/discord/guild/"+D+"/config",{[R]:I}),await b({showLoading:!1})}catch(W){s.value=W.message,Z&&typeof I=="boolean"&&(Z.checked=!I)}})}function O(D,R,I,U,Z){const W=(Z==null?void 0:Z.target)??null;return T(`channel:${D}:${I}`,async()=>{try{await G.put("/api/discord/channel/"+D+"/config",{[I]:U}),await b({showLoading:!1})}catch(J){s.value=J.message,W&&typeof U=="boolean"&&(W.checked=!U)}})}function $(D,R){return T(`channel:${D}:clear`,async()=>{try{await G.put("/api/discord/channel/"+D+"/config",{clear:!0}),await b({showLoading:!1})}catch(I){s.value=I.message}})}function k(D,R){const I=String(R);if(!D.userAutocomplete)return I;const U=f.value.get(I);return U?nv(U):I}function M(D,R=null){const I=String(R??r.value[D]??"").trim();!I||i.value[D].includes(I)||(i.value[D]=[...i.value[D],I],r.value={...r.value,[D]:""})}function j(D,R){i.value[D]=i.value[D].filter(I=>I!==R)}async function q(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const R=(await G.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...R.allowed_users||[]],channels:[...R.channels||[]],respond_to_bots:!!R.respond_to_bots,require_mention:!!R.require_mention,ignore_bot_ids:[...R.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(D){o.value=D.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ve(C),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:w,hasOverride:L,toggleGuild:x,fetchAll:C,fetchGuilds:b,setGuildConfig:y,setChannelConfig:O,clearOverride:$,mutationPending:A,globalItemLabel:k,addGlobalItem:M,removeGlobalItem:j,saveGlobalDefaults:q}}},Cs=e=>e==null?e:JSON.parse(JSON.stringify(e));function aS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const m=new Map;function v(S){d+=1;const A=c.then(S,S);return c=A.catch(()=>{}),A}function w(S,A){f=Cs(S),m.clear();for(const[T,y]of Object.entries(A||{}))m.set(T,Cs(y))}function L(S){const A=Cs(S),T=++u;return v(async()=>{try{await e(Cs(A)),f=Cs(A),T===u&&n(Cs(A))}catch(y){T===u&&(a(Cs(f)),r(y,{kind:"default"}))}})}function x(S,A){const T=Cs(A),y=(p.get(S)||0)+1;return p.set(S,y),v(async()=>{try{await t(S,Cs(T)),m.set(S,Cs(T)),y===p.get(S)&&i(S,Cs(T))}catch(O){y===p.get(S)&&(l(S,Cs(m.get(S)??null)),r(O,{kind:"user",uid:S}))}})}function g(S){const A=(p.get(S)||0)+1;return p.set(S,A),v(async()=>{try{await s(S),m.delete(S),A===p.get(S)&&o(S)}catch(T){A===p.get(S)&&(l(S,Cs(m.get(S)??null)),r(T,{kind:"delete",uid:S}))}})}async function b(){for(;;){const S=c;if(await S,S===c)return d}}async function C(S){for(;;){const A=await b(),T=await S();if(A===d)return T}}return{seed:w,saveDefault:L,saveUser:x,deleteUser:g,whenIdle:b,readSnapshot:C,get revision(){return d}}}const iS={components:{DiscordUserCombobox:av},template:`
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
              <span v-if="hostDescriptions[host]" class="text-gray-500 text-xs">— {{ hostDescriptions[host] }}</span>
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
                  <div>{{ host }}</div><div v-if="hostDescriptions[host]" class="text-gray-500 text-xs font-normal">{{ hostDescriptions[host] }}</div>
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({}),i=h({allowed_hosts:[],default_host:""}),l=h({}),o=h(!1),r=h([]),c=K(()=>{const k={};for(const M of r.value)k[M.id]=M;return k});function d(k){return c.value[k]||null}function u(k,M){return k?k.allowed_hosts===null||k.allowed_hosts===void 0?{allowed_hosts:[...M],default_host:k.default_host||"",allow_all:!0}:{allowed_hosts:k.allowed_hosts,default_host:k.default_host||"",allow_all:!1}:{allowed_hosts:[...M],default_host:M[0]||"",allow_all:!0}}const p=aS({applyDefault:async k=>{const M=k.allow_all?null:k.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:M,default_host:k.default_host})},applyUser:async(k,M)=>{const j=M.allow_all?null:M.allowed_hosts;await G.put(`/api/host-access/user/${k}`,{allowed_hosts:j,default_host:M.default_host})},applyDelete:k=>G.del(`/api/host-access/user/${k}`),onDefaultConfirmed:()=>ye.success("Default policy updated"),onDefaultRollback:k=>{k&&(i.value=k)},onUserConfirmed:k=>{const M=d(k);ye.success(`Updated access for ${M?M.display_name:k}`)},onUserRollback:(k,M)=>{const j={...l.value};M?j[k]=M:delete j[k],l.value=j},onUserDeleted:k=>{const M={...l.value};delete M[k],l.value=M},onError:(k,M)=>{var q;const j=M.uid?` ${((q=d(M.uid))==null?void 0:q.display_name)||M.uid}`:"";ye.error(`${k.message||"Failed to save"} — reverted${j}`)}});let f=0;async function m(){const k=++f;e.value=!0,t.value="";try{const M=await p.readSnapshot(()=>G.get("/api/host-access"));if(k!==f)return;s.value=M,n.value=M.available_hosts||[],a.value=M.host_descriptions||{},i.value=u(M.default_policy,n.value);const j=M.users||{},q={};for(const[D,R]of Object.entries(j))q[D]=u(R,n.value);l.value=q,p.seed(i.value,q)}catch(M){k===f&&(t.value=M.message||"Failed to fetch host access data")}finally{k===f&&(e.value=!1)}try{const M=await G.get("/api/discord/members")||[];k===f&&(r.value=M)}catch{k===f&&(r.value=[])}}const v=500,w=new Map;function L(k,M){const j=w.get(k);j&&clearTimeout(j.timer);const q={run:M,timer:null};q.timer=setTimeout(()=>{w.delete(k),M()},v),w.set(k,q)}function x(k){const M=w.get(k);M&&(clearTimeout(M.timer),w.delete(k))}function g(){for(const[k,M]of[...w])clearTimeout(M.timer),w.delete(k),M.run()}function b(){L("default",()=>p.saveDefault(i.value))}function C(k,M){i.value.allow_all=!1,M?i.value.allowed_hosts.includes(k)||i.value.allowed_hosts.push(k):(i.value.allowed_hosts=i.value.allowed_hosts.filter(j=>j!==k),i.value.default_host===k&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function S(k){L(`user:${k}`,()=>{const M=l.value[k];M&&p.saveUser(k,M)})}function A(k,M,j){const q=l.value[k];q&&(q.allow_all=!1,j?q.allowed_hosts.includes(M)||q.allowed_hosts.push(M):(q.allowed_hosts=q.allowed_hosts.filter(D=>D!==M),q.default_host===M&&(q.default_host=q.allowed_hosts[0]||"")),S(k))}function T(k,M){const j=l.value[k];j&&(j.default_host=M,S(k))}function y(){o.value=!0}function O(k){!/^\d{15,25}$/.test(k)||l.value[k]||(l.value[k]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},p.saveUser(k,l.value[k]),o.value=!1)}async function $(k){const M=d(k);await qt({title:"Remove user override",message:`Remove the host access override for ${M?M.display_name:k}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(x(`user:${k}`),await p.deleteUser(k),l.value[k]||ye.success(`Removed override for ${M?M.display_name:k}`))}return Ve(m),ls(g),mt(g),{loading:e,error:t,data:s,availableHosts:n,hostDescriptions:a,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:C,getMember:d,toggleUserHost:A,setUserDefault:T,openAddUser:y,addUserById:O,deleteUser:$,flushPendingSaves:g}}},lS={template:`
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
        <div v-if="step===4" class="space-y-3"><p class="text-sm">Test non-interactive authentication and platform identity before activation.</p><button class="btn btn-primary text-xs" @click="testConnection">Test connection</button><pre v-if="testResult" class="code-block whitespace-pre-wrap" role="status">{{ JSON.stringify(testResult,null,2) }}</pre></div>
        <div v-if="step===5" class="space-y-3"><p class="text-sm">Activation is live. Users with <code>allowed_hosts: null</code> gain this host automatically. Review grants on Host Access after saving.</p><button class="btn btn-primary" :disabled="!tested" @click="commit">Save and activate</button><a class="btn btn-ghost text-xs" href="#/system?tab=host-access">Open Host Access</a></div>
        <div class="flex justify-between"><button class="btn btn-ghost text-xs" :disabled="step===1" @click="step--">Back</button><button v-if="step<5 && step!==3 && step!==4" class="btn btn-ghost text-xs" @click="step++">Next</button></div>
      </div>
    </div>`,setup(){const e=h([]),t=h(!1),s=h(""),n=h([]),a=h(!1),i=h(!1),l=h(1),o=h(""),r=h(!1),c=h(null),d=h(""),u=h([]),p=h(!1),f=h(null),m=h(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),w=h(v()),L=K(()=>["127.0.0.1","localhost","::1"].includes(w.value.address));async function x(){t.value=!0,s.value="";try{const q=await G.get("/api/hosts");e.value=q.hosts||[],o.value=q.default_host||"",r.value=!!q.tofu_enabled}catch(q){s.value=q.message}finally{t.value=!1}}async function g(){try{await G.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),ye.success("Host settings saved and published live"),await x()}catch(q){ye.error(q.message)}}function b(){d.value="",u.value=[],p.value=!1,f.value=null,c.value=null,m.value="",l.value=1,a.value=!0}function C(){i.value=!1,w.value=v(),b()}function S(q){i.value=!0,w.value={...v(),...q},b()}async function A(){try{c.value=await G.get("/api/hosts/public-key")}catch(q){ye.error(q.message)}}async function T(q){try{const D=await G.post("/api/hosts/"+encodeURIComponent(q.alias)+"/import-legacy",{});i.value=!0,w.value={...v(),...q,trust_mode:"pinned"},b(),d.value=D.candidate_token,u.value=D.fingerprints||[],m.value=u.value.join(`
`),l.value=4,ye.info("Imported existing known_hosts trust. Test before activation.")}catch(D){ye.error(D.message)}}async function y(){try{const q=m.value.split(/\s+/).filter(Boolean),D={...w.value,expected_fingerprints:q,candidate_fingerprints:u.value},R=await G.post("/api/hosts/candidates",D);if(d.value=R.candidate_token,u.value=R.fingerprints||[],w.value.trust_mode==="tofu"&&D.candidate_fingerprints.length===0){w.value.confirm_tofu=!1,ye.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(q){ye.error(q.message)}}async function O(){var q,D;p.value=!1,f.value=null;try{const R=await G.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!R.tested,f.value=R.last_test,p.value&&(l.value=5)}catch(R){const I=(q=R.data)==null?void 0:q.last_test;I&&typeof I=="object"&&!Array.isArray(I)&&(f.value=I);const U=(D=f.value)==null?void 0:D.detail;ye.error(typeof U=="string"&&U.trim()?U:R.message)}}async function $(){try{await G.post("/api/hosts/candidates/"+d.value+"/commit",{}),ye.success("Host saved and published live"),a.value=!1,await x()}catch(q){ye.error(q.message)}}async function k(q){try{await G.post("/api/hosts/"+encodeURIComponent(q.alias)+"/enabled",{enabled:!q.enabled}),await x()}catch(D){ye.error(D.message)}}async function M(q){var D;if(await qt("Delete host "+q.alias+"? Dependencies will block deletion.")){n.value=[];try{await G.del("/api/hosts/"+encodeURIComponent(q.alias)),await x()}catch(R){n.value=Array.isArray((D=R.data)==null?void 0:D.pending_references)?R.data.pending_references:[],ye.error(R.message)}}}async function j(q){if(await qt("Force revoke "+q.alias+"? Remote outcomes may be unknown."))try{await G.post("/api/hosts/"+encodeURIComponent(q.alias)+"/force-revoke",{}),await x()}catch(D){ye.error(D.message)}}return Ve(x),{hosts:e,loading:t,error:s,pendingReferences:n,wizard:a,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:w,isLocal:L,keyInfo:c,candidate:d,observed:u,tested:p,testResult:f,fingerprintsText:m,load:x,saveSettings:g,beginAdd:C,beginEdit:S,loadKey:A,importLegacy:T,prepare:y,testConnection:O,commit:$,toggle:k,remove:M,forceRevoke:j}}},oS={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),o=h(null),r=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=K(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=K(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const T=await G.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function v(T){return!T||!T.trim()?[]:T.split(",").map(y=>y.trim()).filter(Boolean)}function w(T,y){const O=c.value.allowed_hosts;if(y&&!O.includes(T)&&O.push(T),!y){const $=O.indexOf(T);$>=0&&O.splice($,1)}}function L(T,y){const O=d.value.allowed_hosts;if(y&&!O.includes(T)&&O.push(T),!y){const $=O.indexOf(T);$>=0&&O.splice($,1)}}async function x(){var T;i.value=!0;try{const y=v(c.value.allowed_tools_str),O=c.value.host_mode,$=O==="none"?[]:O==="select"?c.value.allowed_hosts:null,k={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:y.length?y:[]};$!==null&&(k.allowed_hosts=$),k.default_host=c.value.default_host||"";const M=await G.post("/api/tokens",k);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,ye.success("Token created"),await m()}catch(y){ye.error(((T=y.data)==null?void 0:T.error)||y.message||"Failed to create token")}finally{i.value=!1}}function g(T){o.value=T;const y=T.allowed_hosts;let O="default";y==null?O="default":Array.isArray(y)&&y.length===0?O="none":Array.isArray(y)&&(O="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:O,allowed_hosts:Array.isArray(y)?[...y]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function b(){var T;if(o.value){r.value=!0;try{const y=v(d.value.allowed_tools_str),O=d.value.host_mode,$={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:y};O==="none"?$.allowed_hosts=[]:O==="select"?$.allowed_hosts=d.value.allowed_hosts:$.allowed_hosts=null,$.default_host=d.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(o.value.user_id),$),o.value=null,ye.success("Token updated"),await m()}catch(y){ye.error(((T=y.data)==null?void 0:T.error)||y.message||"Failed to update")}finally{r.value=!1}}}async function C(T){var O;if(await qt({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const $=await G.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=$.token,ye.success("Token regenerated")}catch($){ye.error(((O=$.data)==null?void 0:O.error)||$.message||"Failed to regenerate")}}async function S(T){var O;if(await qt({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(T.user_id)),ye.success("Token deleted"),await m()}catch($){ye.error(((O=$.data)==null?void 0:O.error)||$.message||"Failed to delete")}}async function A(){if(l.value)try{await navigator.clipboard.writeText(l.value),ye.success("Copied to clipboard")}catch{ye.error("Copy failed — select and copy manually")}}return Ve(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:f,toggleCreateHost:w,toggleEditHost:L,createToken:x,startEdit:g,saveEdit:b,confirmRegenerate:C,confirmDelete:S,copyToken:A}}},rS=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),cS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),dS=Object.freeze(["enabled","base_url","model","max_tokens"]),uS=Object.freeze(["enabled","model","max_tokens"]);function Qo(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function up(e){return Qo(e,rS)}function pp(e){return Qo(e,cS)}function pS(e,{includeApiKey:t=!1}={}){const s=Qo(e,dS);return t&&(s.api_key=e.api_key),s}function fS(e){return{timeout:e.timeout}}function hS(e,{includeApiKey:t=!1}={}){const s=Qo(e,uS);return t&&(s.api_key=e.api_key),s}function mS(e){return{timeout:e.timeout}}function Ml(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const vS={template:`
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
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Configured Provider</h2>
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
                <span v-if="llmStatus.serving_provider === 'codex'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">serving</span>
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
                <span v-if="llmStatus.serving_provider === 'ollama'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">serving</span>
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
                <span v-if="llmStatus.serving_provider === 'kimi'" class="text-xs px-1.5 py-0.5 rounded bg-green-900 text-green-300">serving</span>
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
                <option v-if="mainEffortAllowed('none')" value="none">None</option>
                <option v-if="mainEffortAllowed('low')" value="low">Low</option>
                <option v-if="mainEffortAllowed('medium')" value="medium">Medium</option>
                <option v-if="mainEffortAllowed('high')" value="high">High</option>
                <option v-if="mainEffortAllowed('xhigh')" value="xhigh">Extra High</option>
                <option v-if="mainEffortAllowed('max')" value="max">Max</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent Reasoning
              <select v-model="codexForm.agent_reasoning_effort" @change="saveCodexConfigDebounced"
                      class="hm-input">
                <option value="">Inherit chat setting</option>
                <option value="auto">Auto — choose per spawn</option>
                <option v-if="agentEffortAllowed('none')" value="none">None</option>
                <option v-if="agentEffortAllowed('low')" value="low">Low</option>
                <option v-if="agentEffortAllowed('medium')" value="medium">Medium</option>
                <option v-if="agentEffortAllowed('high')" value="high">High</option>
                <option v-if="agentEffortAllowed('xhigh')" value="xhigh">Extra High</option>
                <option v-if="agentEffortAllowed('max')" value="max">Max</option>
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
                  <span v-if="activeContextBudget?.workload_calibration?.active_workloads" class="llm-budget-density">{{ activeContextBudget.density_scope }} · {{ activeContextBudget.workload_calibration.active_workloads }} active</span>
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
                          <th>Fresh-workload target</th>
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
                          <td data-label="Fresh-workload target">
                            <span class="llm-budget-value llm-budget-effective">{{ formatCount(row.primaryChars) }}</span><small>characters · fixed prior for a new workload</small>
                            <span v-if="contextWindows.max_context_chars_pending_restart === true && row.configuredPrimaryChars !== row.primaryChars" class="llm-budget-pending">Restart pending</span>
                          </td>
                          <td data-label="Provenance">
                            <span class="llm-budget-provenance" :class="provenanceClass(row.provenance)">{{ row.provenance }}</span>
                            <span v-if="row.workloadCalibration?.active_workloads" class="llm-budget-density">{{ row.densityScope }} · {{ row.workloadCalibration.active_workloads }} active</span>
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("codex"),a=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=K(()=>{const V=a.value.model;return V&&!i.includes(V)?[V,...i]:i}),o=K(()=>{const V=a.value.agent_model;return V&&V!=="auto"&&!i.includes(V)?[V,...i]:i}),r={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(V,be)=>!!V&&!!be&&(r[V]||[]).includes(be),d=V=>!c(a.value.model,V)&&!(a.value.agent_reasoning_effort===""&&c(a.value.agent_model,V)),u=V=>{const be=a.value.agent_model;return be==="auto"?!0:!c(be||a.value.model,V)},p=K(()=>{const V=a.value.agent_reasoning_effort;return V==="auto"?null:V||a.value.reasoning_effort}),f=V=>c(V,a.value.reasoning_effort)||a.value.agent_model===""&&c(V,p.value),m=V=>c(V,p.value),v=h({enabled:!1,model:"gpt-5.6-luna"}),w=h({unavailable_reason:null}),L=K(()=>{const V=v.value.model;return V&&!i.includes(V)?[V,...i]:i});function x(V){const be=V.target.value;v.value.enabled=be!=="",be!==""&&(v.value.model=be),X()}const g=h(!1),b=h({codex:!1,ollama:!1,kimi:!1}),C=h(null),S=h(!1),A=h(""),T=h(null),y=h(!1);let O=0;const $=K(()=>{var V;return Object.entries(((V=C.value)==null?void 0:V.models)||{}).map(([be,Ae])=>{var Qt,un,Hn;return{model:be,floor:Ae.floor,override:Ae.override,effectiveBudget:(Qt=Ae.effective)==null?void 0:Qt.effective_budget,configuredPrimaryChars:(un=Ae.configured)==null?void 0:un.primary_chars,primaryChars:(Hn=Ae.effective)==null?void 0:Hn.primary_chars,provenance:Ae.provenance,clampExpiresAt:Ae.clamp_expires_at,densityPriorMilli:Ae.density_prior_milli,densityScope:Ae.density_scope,workloadCalibration:Ae.workload_calibration}})}),k=K(()=>{var V;return((V=C.value)==null?void 0:V.clamps)||[]}),M=K(()=>{var V,be;return((be=(V=C.value)==null?void 0:V.models)==null?void 0:be[a.value.model])||null}),j=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),q=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),D=h(!1),R=h(!1),I=h(!1),U=h(!1),Z=h(!1),W=h(!1),J=h(!1),oe=h({configured:null}),ee=h(!1),ce=h([]),Ne=h(""),Q=h(!1),ge=h(!1),z=h({configured:null}),re=h(!1),pe=h([]),Ie=h(""),_=h(!1),P=h(!1),H=h(!0),ie=h(""),se=h({configured:null,accounts:[]}),ae=h(null),fe=h(null),ue=h(""),de=h(null),le=h(!1),xe=h(null),me=h(null),_e=h("");let Re=null;function F(V,be="success"){ye(V,be==="error"?"error":"success")}function ve(V){if(!V)return"?";const be=V/(1024*1024*1024);return be>=1?be.toFixed(1)+" GB":(V/(1024*1024)).toFixed(0)+" MB"}function ke(V){return Number.isFinite(Number(V))?Number(V).toLocaleString():"—"}function Oe(V){return V==null?"automatic (model-derived)":Number(V).toLocaleString()+" characters"}function Pe(V){const be=new Date(V);return Number.isNaN(be.getTime())?"unknown":be.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function dt(V){return typeof V=="string"&&V.length>12?V.slice(0,8)+"…"+V.slice(-4):V}function st(V){return typeof V!="number"||!Number.isFinite(V)?"—":(V/1e3).toFixed(2)}function _t(V){return V==="temporary learned clamp"?"is-clamp":V==="override"?"is-override":"is-built-in"}function Ot(V){const be=a.value.context_budget_overrides[V.model];return V.floor!=null&&Number.isFinite(Number(be))&&Number(be)>V.floor}function rt(V,be){const Ae={...a.value.context_budget_overrides};be.target.value===""?delete Ae[V]:Ae[V]=Number(be.target.value),a.value.context_budget_overrides=Ae,y.value=!0}function Qe(V){a.value.context_utilization=V.target.value===""?"":Number(V.target.value),y.value=!0}function ne(V){const be={...a.value.context_budget_overrides};delete be[V],a.value.context_budget_overrides=be,y.value=!0}async function Se(){e.value=!0,await Promise.all([Le(),Et(),ks(),je(),Ke()]),e.value=!1}async function Le({preserveBasic:V=!1,preserveAdvanced:be=!1}={}){try{const Ae=await G.get("/api/llm/status");t.value=Ae,s.value=!1,n.value=Ae.active_provider||"codex",Ae.codex&&!Ds.pending()&&(V||(a.value.enabled=Ae.codex.enabled,a.value.model=Ae.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Ae.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Ae.codex.agent_reasoning_effort||"",a.value.agent_model=Ae.codex.agent_model||""),be||(a.value.request_timeout_seconds=Ae.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Ae.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Ae.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Ae.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Ae.codex.context_compression||{}},!y.value&&!I.value&&(a.value.context_budget_overrides={...Ae.codex.context_budget_overrides||{}},a.value.context_utilization=Ae.codex.context_utilization??a.value.context_utilization))),Ae.ollama&&!we.pending()&&(V||(j.value.enabled=Ae.ollama.enabled,j.value.base_url=Ae.ollama.base_url||"",j.value.model=Ae.ollama.model||"",j.value.max_tokens=Ae.ollama.max_tokens||4096),be||(j.value.timeout=Ae.ollama.timeout??j.value.timeout)),Ae.kimi&&!$e.pending()&&(V||(q.value.enabled=Ae.kimi.enabled,q.value.model=Ae.kimi.model||"",q.value.max_tokens=Ae.kimi.max_tokens||4096),be||(q.value.timeout=Ae.kimi.timeout??q.value.timeout)),Ae.auxiliary&&(w.value=Ae.auxiliary,X.pending()||(v.value.enabled=Ae.auxiliary.enabled,v.value.model=Ae.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function Ke(){const V=++O;S.value=!0,A.value="";try{const be=await G.get("/api/context/windows");if(V!==O)return;C.value=be,!I.value&&!y.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(be.models||{}).filter(([,Ae])=>Ae.override!=null).map(([Ae,Qt])=>[Ae,Qt.override])),a.value.context_utilization=be.utilization??a.value.context_utilization)}catch(be){V===O&&(A.value=be.message||"Failed to load context budgets")}finally{V===O&&(S.value=!1)}}async function Et(){try{if(oe.value=await G.get("/api/ollama/status"),ee.value=!1,oe.value.model&&(Ne.value=oe.value.model),oe.value.configured)try{const V=await G.get("/api/ollama/models");ce.value=V.models||[]}catch{ce.value=[]}else if(j.value.base_url)try{const V=await G.post("/api/ollama/probe-models",{base_url:j.value.base_url});ce.value=V.models||[]}catch{ce.value=[]}}catch{ee.value=!0}}async function je(){H.value=!0,ie.value="";try{se.value=await G.get("/api/codex/status")}catch(V){ie.value=V.message||"Failed to fetch Codex status"}finally{H.value=!1}}async function Ft(){const V=t.value?t.value.active_provider:"codex";J.value=!0;try{const be=await G.post("/api/llm/switch",{provider:n.value});be.error?(n.value=V,F(be.error,"error")):(F("Switched to "+n.value+" ("+be.model+")"),await Se())}catch(be){n.value=V,F(be.message||"Switch failed","error")}finally{J.value=!1}}async function Ht(){Q.value=!0;try{const V=await G.post("/api/ollama/reload");F(V.configured?"Ollama reloaded":V.reason||"Ollama not configured",V.configured?"success":"error"),await Se()}catch(V){F(V.message||"Reload failed","error")}finally{Q.value=!1}}async function os(){ge.value=!0;try{await G.post("/api/ollama/model",{model:Ne.value}),F("Model set to "+Ne.value),await Se()}catch(V){F(V.message||"Failed","error")}finally{ge.value=!1}}async function Zs(){const V=j.value.base_url;if(!V){F("Enter a base URL first","error");return}W.value=!0;try{const be=await G.post("/api/ollama/probe-models",{base_url:V});ce.value=be.models||[],ce.value.length?(F(ce.value.length+" model(s) found"),!j.value.model&&ce.value.length&&(j.value.model=ce.value[0].name)):F("No models found at "+V,"error")}catch(be){F(be.message||"Could not reach Ollama","error")}finally{W.value=!1}}async function ks(){try{if(z.value=await G.get("/api/kimi/status"),re.value=!1,z.value.model&&(Ie.value=z.value.model),z.value.configured)try{const V=await G.get("/api/kimi/models");pe.value=V.models||[]}catch{pe.value=[]}}catch{re.value=!0}}async function sa(){_.value=!0;try{const V=await G.post("/api/kimi/reload");F(V.configured?"Kimi reloaded":V.reason||"Kimi not configured",V.configured?"success":"error"),await Se()}catch(V){F(V.message||"Reload failed","error")}finally{_.value=!1}}async function Js(){P.value=!0;try{await G.post("/api/kimi/model",{model:Ie.value}),F("Model set to "+Ie.value),await Se()}catch(V){F(V.message||"Failed","error")}finally{P.value=!1}}async function Ls(){if(I.value){Ds();return}I.value=!0;const V=up(a.value);try{await G.put("/api/llm/codex/config",V),F("Codex config saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),je()])}catch(be){F(be.message||"Failed","error");const Ae=JSON.stringify(up(a.value))!==JSON.stringify(V);await Promise.all([Le({preserveBasic:Ae,preserveAdvanced:!0}),je()])}finally{I.value=!1}}async function Pn(){if(I.value)return;I.value=!0;const V=pp(a.value);try{await G.put("/api/llm/codex/config",V),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:V.context_budget_overrides,context_utilization:V.context_utilization})&&(y.value=!1),F("Codex advanced settings saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),je(),Ke()])}catch(be){F(be.message||"Failed","error");const Ae=JSON.stringify(pp(a.value))!==JSON.stringify(V);await Promise.all([Le({preserveBasic:!0,preserveAdvanced:Ae}),je(),Ke()])}finally{I.value=!1}}async function Ss(){if(U.value){we();return}U.value=!0;try{const V=D.value?j.value.api_key:null,be=pS(j.value,{includeApiKey:V!==null});await G.put("/api/llm/ollama/config",be),F("Ollama config saved"),V!==null&&j.value.api_key===V&&(j.value.api_key="",D.value=!1),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Et()])}catch(V){F(V.message||"Failed","error")}finally{U.value=!1}}async function Fn(){if(!U.value){U.value=!0;try{await G.put("/api/llm/ollama/config",fS(j.value)),F("Ollama timeout saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Et()])}catch(V){F(V.message||"Failed","error")}finally{U.value=!1}}}async function zt(){if(Z.value){$e();return}Z.value=!0;try{const V=R.value?q.value.api_key:null,be=hS(q.value,{includeApiKey:V!==null});await G.put("/api/llm/kimi/config",be),F("Kimi config saved"),V!==null&&q.value.api_key===V&&(q.value.api_key="",R.value=!1),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),ks()])}catch(V){F(V.message||"Failed","error")}finally{Z.value=!1}}async function Xe(){if(!Z.value){Z.value=!0;try{await G.put("/api/llm/kimi/config",mS(q.value)),F("Kimi timeout saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),ks()])}catch(V){F(V.message||"Failed","error")}finally{Z.value=!1}}}async function Ns(){if(g.value){X();return}g.value=!0;try{await G.put("/api/llm/auxiliary/config",v.value),F("Auxiliary config saved"),await Le()}catch(V){F(V.message||"Failed","error"),await Le()}finally{g.value=!1}}const Ds=Ml(Ls),X=Ml(Ns),we=Ml(Ss),$e=Ml(zt),Ze=()=>(Ds.cancel(),Ls()),wt=()=>(we.cancel(),Ss()),ut=()=>($e.cancel(),zt()),$n=()=>Pn(),js=()=>Fn(),mi=()=>Xe();async function vi(V){const be=V.account_key+":"+V.model;T.value=be;try{const Ae=await G.post("/api/context/windows/clear",{account_key:V.account_key,model:V.model});F(Ae.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Ke()}catch(Ae){F(Ae.message||"Failed to clear clamp","error"),await Ke()}finally{T.value=null}}async function Ia(V){try{await G.post("/api/codex/account/"+V+"/activate"),F("Active account switched"),await je()}catch(be){F(be.message||"Failed","error")}}async function na(V){ae.value=V;try{await G.post("/api/codex/account/"+V+"/refresh"),F("Token refreshed"),await je()}catch(be){F(be.message||"Refresh failed","error")}finally{ae.value=null}}function Bn(V,be){fe.value=V,ue.value=be||""}async function Un(V){try{await G.put("/api/codex/account/"+V+"/label",{label:ue.value}),F("Label updated"),fe.value=null,await je()}catch(be){F(be.message||"Failed","error")}}async function Ys(V,be){if(await qt({title:"Delete Codex account",message:`Delete ${be||"account #"+(V+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+V),F("Deleted. Pool reloaded."),await je()}catch(Qt){F(Qt.message||"Failed","error")}}async function dn(){le.value=!0;try{const V=await G.post("/api/codex/device-code");xe.value=V,de.value="pending",Yt(V)}catch(V){F(V.message||"Failed","error")}finally{le.value=!1}}async function Yt(V){Re={cancelled:!1};const be=Re;try{const Ae=await G.post("/api/codex/device-poll",{device_auth_id:V.device_auth_id,user_code:V.user_code,interval:V.interval});if(be.cancelled)return;me.value=Ae,de.value="success",await Se()}catch(Ae){if(be.cancelled)return;_e.value=Ae.message||"Device login failed",de.value="error"}}function Oa(){Re&&(Re.cancelled=!0),de.value=null,xe.value=null}return Ve(Se),mt(()=>{Re&&(Re.cancelled=!0),Ds.cancel(),X.cancel(),we.cancel(),$e.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:J,advancedOpen:b,codexForm:a,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:f,agentModelOptionDisabled:m,auxForm:v,auxData:w,auxModelOptions:L,onAuxModelChange:x,savingAux:g,saveAuxConfigDebounced:X,ollamaForm:j,kimiForm:q,savingCodex:I,savingOllama:U,savingKimi:Z,probingOllama:W,ollamaKeyDirty:D,kimiKeyDirty:R,fetchCodexStatus:je,ollamaStatus:oe,ollamaStatusLoadFailed:ee,ollamaModels:ce,ollamaSelectedModel:Ne,reloading:Q,settingModel:ge,kimiStatus:z,kimiStatusLoadFailed:re,kimiModels:pe,kimiSelectedModel:Ie,reloadingKimi:_,settingKimiModel:P,codexLoading:H,codexError:ie,codexData:se,refreshing:ae,editingLabel:fe,labelValue:ue,contextWindows:C,contextWindowsLoading:S,contextWindowsError:A,contextBudgetRows:$,activeClampRows:k,activeContextBudget:M,clearingClamp:T,contextPolicyDirty:y,deviceState:de,deviceLoading:le,deviceInfo:xe,deviceResult:me,deviceError:_e,fetchAll:Se,fetchLLMStatus:Le,fetchOllamaStatus:Et,fetchKimiStatus:ks,switchProvider:Ft,reloadOllama:Ht,setOllamaModel:os,reloadKimi:sa,setKimiModel:Js,probeOllamaModels:Zs,saveCodexConfig:Ls,saveOllamaConfig:Ss,saveKimiConfig:zt,saveCodexAdvancedConfig:Pn,saveOllamaAdvancedConfig:Fn,saveKimiAdvancedConfig:Xe,saveCodexConfigDebounced:Ds,saveOllamaConfigDebounced:we,saveKimiConfigDebounced:$e,saveCodexConfigNow:Ze,saveOllamaConfigNow:wt,saveKimiConfigNow:ut,saveCodexAdvancedConfigNow:$n,saveOllamaAdvancedConfigNow:js,saveKimiAdvancedConfigNow:mi,activateAccount:Ia,refreshAccount:na,startEditLabel:Bn,saveLabel:Un,deleteAccount:Ys,startDeviceLogin:dn,cancelDeviceLogin:Oa,formatSize:ve,fetchContextWindows:Ke,clearContextClamp:vi,setContextOverride:rt,setContextUtilization:Qe,resetContextOverride:ne,overrideAboveFloor:Ot,formatCount:ke,formatContextCeiling:Oe,formatExpiry:Pe,shortAccountKey:dt,provenanceClass:_t,formatDensity:st}}},fp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function gS(e){return fp[e]||fp[(e||"").toLowerCase()]||"text-gray-400"}const bS={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),o=h(null),r=h(null),c=h(null),d=K(()=>{var S;return Object.values(((S=i.value)==null?void 0:S.totals)||{}).reduce((A,T)=>A+Number(T||0),0)}),u=h(""),p=h(0),f=h([]),m=K(()=>f.value.map(S=>`${S.label} (${S.path}${S.reason?`: ${S.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let w=null;async function L(){var O;const S=await Promise.allSettled(v.map($=>G.get($.path))),A=$=>S[$].status==="fulfilled"?S[$].value:null;t.value=A(0)||{};const T=A(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],n.value=A(2)||{},a.value=A(3)||{},i.value=A(4),l.value=A(5),o.value=A(6),r.value=A(7),c.value=A(8);const y=S.filter($=>$.status==="rejected");if(f.value=S.flatMap(($,k)=>{var M;return $.status==="rejected"?[{...v[k],reason:((M=$.reason)==null?void 0:M.message)||"request failed"}]:[]}),p.value=f.value.length,y.length===S.length){const $=(O=y[0])==null?void 0:O.reason;u.value=($==null?void 0:$.message)||"Failed to load internals"}else u.value="";e.value=!1}function x(){e.value=!0,u.value="",L()}let g=!1;function b(){g||(g=!0,L(),w||(w=setInterval(L,3e4)))}function C(){g&&(g=!1,w&&(clearInterval(w),w=null))}return Ve(b),ms(b),ls(C),mt(C),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:m,endpoints:v,retry:x,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:gS,formatAgeSeconds:$w}}},yS=1e4,hp=3e4;function ki(e,t){return Math.max(0,e-t)}function Sr(e,t){return new Set((e.operations||[]).map(n=>n.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const xS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],_S={template:`
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
        Read-only current recovery posture. Historical interrupted-effect evidence
        remains available below as diagnostics, not operator work.
      </p>

      <div class="hm-card mb-4">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 class="text-sm font-semibold text-gray-300">Current posture</h2>
            <p class="text-xs text-gray-600 mt-1">Active work, suspended recovery, expired leases, and effects requiring a human.</p>
          </div>
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
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.expired_active > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.expired_active }}</span><span class="ts-count-label">Expired leases</span>
            </div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.manual_resolution_operations > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.manual_resolution_operations }}</span><span class="ts-count-label">Manual effects</span>
            </div>
            <div class="ts-count" :class="{ 'ts-count-alert': turnsData.counts.attention_required > 0 }">
              <span class="ts-count-value">{{ turnsData.counts.attention_required }}</span><span class="ts-count-label">Attention</span>
            </div>
          </div>

          <div v-if="sortedTurns.length === 0" class="text-xs text-gray-500">
            No active, suspended, or manual-resolution turns.
          </div>
          <div v-else class="space-y-2">
            <div v-if="turnsData.truncated" class="text-xs text-amber-500">
              Showing {{ sortedTurns.length }} prioritized posture rows —
              {{ turnsData.omitted_turns }} older row{{ turnsData.omitted_turns === 1 ? '' : 's' }} omitted.
              <span v-if="turnsData.omitted_attention_turns > 0" role="alert">
                {{ turnsData.omitted_attention_turns }} omitted row{{ turnsData.omitted_attention_turns === 1 ? '' : 's' }} still require attention.
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
                A human owns verification of an unresolved external effect.
              </div>
              <div v-else-if="priorityOf(t) === 1" class="ts-turn-warning" role="alert">
                The active owner lease is missing or expired; recovery should sweep or resume this turn.
              </div>
              <div v-if="t.operations.length" class="ts-op-list">
                <span v-for="op in t.operations" :key="op.tool_call_id" class="ts-op"
                      :class="{ 'ts-op-alert': op.state === 'MANUAL_RESOLUTION_REQUIRED' }">
                  {{ op.tool_name }} · {{ op.state }}<template v-if="op.iteration !== null"> · iter {{ op.iteration }}</template>
                </span>
                <span v-if="t.more_attention_evidence" class="text-xs text-amber-500" role="alert">
                  …more manual-resolution evidence retained in the ledger
                </span>
                <span v-else-if="t.operations_truncated" class="text-xs text-gray-500">…more operation evidence</span>
              </div>
            </div>
          </div>

          <div class="ts-diagnostics mt-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="text-sm font-semibold text-gray-400">Historical diagnostics</h3>
                <p class="text-xs text-gray-600 mt-1">Retained ambiguous-effect evidence. Diagnostic only; not counted as Attention.</p>
              </div>
              <div class="flex items-center gap-3 text-xs text-gray-500">
                <span>{{ turnsData.diagnostics.outcome_unknown.operations }} unknown operation{{ turnsData.diagnostics.outcome_unknown.operations === 1 ? '' : 's' }}</span>
                <span>{{ turnsData.diagnostics.outcome_unknown.turns }} turn{{ turnsData.diagnostics.outcome_unknown.turns === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <div v-if="turnsData.diagnostics.outcome_unknown.by_tool.length" class="ts-op-list mt-2">
              <span v-for="row in turnsData.diagnostics.outcome_unknown.by_tool" :key="row.tool_name" class="ts-op">
                {{ row.tool_name }} · {{ row.operations }}
              </span>
              <span v-if="turnsData.diagnostics.outcome_unknown.tools_truncated" class="text-xs text-gray-500">
                …{{ turnsData.diagnostics.outcome_unknown.omitted_tools }} more tool{{ turnsData.diagnostics.outcome_unknown.omitted_tools === 1 ? '' : 's' }}
              </span>
            </div>
            <p v-else class="text-xs text-gray-600 mt-2">No historical unknown-effect evidence.</p>
          </div>
        </template>
        <div v-else class="space-y-2">
          <div v-for="n in 2" :key="n" class="skeleton skeleton-row"></div>
        </div>
      </div>

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
                <th class="text-right">Consecutive opens</th>
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
  `,setup(){const e=h(null),t=h(""),s=h(null),n=h(!1),a=h(0),i=h(null),l=h(""),o=h(null),r=h(!1),c=h(0),d=h(Date.now());let u=null,p=0,f=0;async function m(){const R=++p;n.value=!0;try{const I=await G.get("/api/turn-state/turns?limit=100");if(R!==p)return;t.value=I.availability,e.value=I.availability==="available"?I.data:null,s.value=null,a.value=Date.now()}catch(I){if(R!==p)return;s.value=I.message||"Turn-state read failed",I.status===503&&(t.value="unavailable")}R===p&&(n.value=!1)}async function v(){const R=++f;r.value=!0;try{const I=await G.get("/api/turn-state/capacity-breakers");if(R!==f)return;l.value=I.availability,i.value=I.availability==="available"?I.data:null,o.value=null,c.value=Date.now()}catch(I){if(R!==f)return;o.value=I.message||"Breaker read failed",I.status===503&&(l.value="unavailable")}R===f&&(r.value=!1)}function w(){m(),v()}const L=K(()=>e.value!==null&&ki(d.value,a.value)>hp),x=K(()=>i.value!==null&&ki(d.value,c.value)>hp),g=K(()=>L.value||x.value),b=K(()=>Math.round(ki(d.value,a.value)/1e3)),C=K(()=>Math.round(ki(d.value,c.value)/1e3));function S(R){return Sr(R,d.value/1e3)}function A(R){return xS[S(R)]}const T=K(()=>{var U;const R=[...((U=e.value)==null?void 0:U.turns)||[]],I=d.value/1e3;return R.sort((Z,W)=>Sr(Z,I)-Sr(W,I)||(W.last_progress_at||0)-(Z.last_progress_at||0))});function y(R){return R.state==="closed"?"badge-success":R.state==="probing"?"badge-warning":"badge-danger"}function O(R){if(R.state==="closed")return"—";const I=ki(d.value,c.value)/1e3,U=Math.max(0,(R.cooldown_remaining_seconds||0)-I);return U>0?`${Math.ceil(U)}s`:R.state==="probing"?"probe in flight":"probe eligible"}function $(R){if(!R)return"";const I=Math.max(0,Math.round(d.value/1e3-R));if(I<90)return`${I}s ago`;const U=Math.round(I/60);return U<90?`${U}m ago`:`${Math.round(U/60)}h ago`}let k=null,M=null,j=!1;function q(){j||(j=!0,w(),k=setInterval(w,yS),u=setInterval(()=>{d.value=Date.now()},1e3),M=Ye.onReconnected(w))}function D(){j&&(j=!1,k&&(clearInterval(k),k=null),u&&(clearInterval(u),u=null),M&&(M(),M=null))}return Ve(q),ms(q),ls(D),mt(D),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:n,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:L,breakersStale:x,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:C,sortedTurns:T,priorityOf:S,priorityBadge:A,breakerBadge:y,cooldownLabel:O,ageLabel:$,fetchTurns:m,fetchBreakers:v,refreshAll:w,arm:q,disarm:D}}},wS={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),o=h(null),r=h(!1);async function c(){a.value=!0,o.value=null,r.value=!1;try{const u=await G.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{a.value=!1}}async function d(){if(await qt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ve(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},iv=[{id:"health",label:"Health",component:Ik},{id:"resources",label:"Resources",component:Ok},{id:"logs",label:"Logs",component:jk},{id:"config",label:"Config",component:tS},{id:"discord",label:"Discord",component:nS},{id:"hosts",label:"Hosts",component:lS},{id:"host-access",label:"Host Access",component:iS},{id:"api-tokens",label:"API Tokens",component:oS},{id:"llm",label:"LLM Config",component:vS},{id:"internals",label:"Internals",component:bS},{id:"turn-state",label:"Turn State",component:_S},{id:"update",label:"Update",component:wS}],kS={components:{TabbedPage:Jo},setup(){return{tabs:iv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Pl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),SS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Pl("Operations","operations","/operations",Jm),...Pl("History","history","/history",Ym),...Pl("Capabilities","capabilities","/capabilities",Qm),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Pl("System","system","/system",iv)],bs=ea({open:!1,query:"",selected:0});function mp(){bs.query="",bs.selected=0,bs.open=!0}function Tr(){bs.open=!1}function TS(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const CS={setup(){const e=zm(),t=h(null),s=K(()=>{const i=bs.query.trim().toLowerCase();return SS.map(l=>({...l,_score:TS(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Mt(()=>bs.open,async i=>{var l;i&&(await Rt(),(l=t.value)==null||l.focus())}),Mt(()=>bs.query,()=>{bs.selected=0});function n(i){Tr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Tr();return}if(i.key==="ArrowDown")i.preventDefault(),bs.selected=Math.min(bs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),bs.selected=Math.max(bs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[bs.selected];l&&n(l)}}return{state:bs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Tr}},template:`
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
  `},uc={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(uc));const ES={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>si("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[si("path",{d:uc[e.name]||uc.info})])}},AS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function vp(e){return[...e.querySelectorAll(AS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const RS={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=vp(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||vp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},IS={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),o=h(!1),r=h([]),c=h(0),d=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const f=K(()=>{const Z=e.value.uptime_seconds||0,W=Math.floor(Z/86400),J=Math.floor(Z%86400/3600),oe=Math.floor(Z%3600/60),ee=[];return W>0&&ee.push(`${W}d`),J>0&&ee.push(`${J}h`),(ee.length===0||W===0&&J===0)&&ee.push(`${oe}m`),ee.join(" ")}),m=K(()=>{const Z=e.value.uptime_seconds||0;return 125.66*(1-Math.min(Z/86400,1))}),v=K(()=>{const Z=e.value;return[{label:"Guilds",value:Z.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:Z.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:Z.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${Z.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:Z.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:Z.loop_count>0?"text-green-400":"",highlight:Z.loop_count>0},{label:"Agents",value:Z.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:Z.agent_count>0?`${Z.agent_count} total`:"",subColor:"text-gray-500",highlight:(Z.agent_running??0)>0},{label:"Processes",value:Z.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:Z.process_count>0?`${Z.process_count} total`:"",subColor:"text-gray-500",highlight:(Z.process_running??0)>0},{label:"Schedules",value:Z.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(Z.schedule_failing>0?`${Z.schedule_failing} failing`:"")+(Z.schedule_failing>0&&Z.schedule_paused>0?", ":"")+(Z.schedule_paused>0?`${Z.schedule_paused} paused`:"")||void 0,subColor:Z.schedule_failing>0?"text-red-400":"text-yellow-400",color:Z.schedule_failing>0?"text-red-400":"",highlight:Z.schedule_failing>0},{label:"Users",value:Z.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),w=K(()=>{const Z=e.value,W=[];return W.push({label:"Bot",status:Z.status==="online"?"ok":"warn",detail:Z.status==="online"?"Online":"Starting"}),(Z.schedule_failing||0)>0?W.push({label:"Schedules",status:"error",detail:`${Z.schedule_failing} failing`}):(Z.schedule_count||0)>0&&W.push({label:"Schedules",status:"ok",detail:`${Z.schedule_count} configured`}),(Z.loop_count||0)>0&&W.push({label:"Loops",status:"ok",detail:`${Z.loop_count} active`}),(Z.agent_running||0)>0&&W.push({label:"Agents",status:"ok",detail:`${Z.agent_running} running`}),(Z.process_running||0)>0&&W.push({label:"Processes",status:"ok",detail:`${Z.process_running} running`}),W});async function L(){try{e.value=await G.get("/api/status"),s.value=null}catch(Z){s.value=Z.message}finally{t.value=!1}}let x=0,g=0,b=0,C=0;function S(Z,W){const J=new Set;return[...W,...Z].filter(oe=>{const ee=oe._hmac||JSON.stringify([oe.timestamp,oe.tool_name,oe.user_id,oe.result_summary,oe.error]);return J.has(ee)?!1:(J.add(ee),!0)})}async function A(){const Z=++x,W=b;a.value=!0;try{const J=await G.get("/api/audit?limit=10");if(Z!==x)return;const oe=W===b?[]:n.value.filter(ee=>(ee._liveEpoch||0)>W);n.value=S(J,oe).slice(0,10),c.value=oe.length}catch{}Z===x&&(a.value=!1)}async function T(){const Z=++g,W=C;l.value=!0;try{const J=await G.get("/api/audit?error_only=1&limit=5");if(Z!==g)return;const oe=W===C?[]:i.value.filter(ee=>(ee._liveErrorEpoch||0)>W);i.value=S(J,oe).slice(0,5),o.value=!1}catch{if(Z!==g)return;o.value=W===C||i.value.length===0}Z===g&&(l.value=!1)}async function y(){try{const Z=await G.get("/api/knowledge");d.value=(Array.isArray(Z)?Z:[]).reduce((W,J)=>W+(J.chunks||0),0)}catch{d.value=null}}async function O(){try{const Z=await G.get("/api/agents");r.value=Z.filter(W=>W.status==="running")}catch{}}async function $(){u.value={...u.value,reload:!0};try{await G.post("/api/reload"),ye.success("Config reloaded")}catch(Z){ye.error(Z.message)}u.value={...u.value,reload:!1}}async function k(){if(!await qt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const W=e.value.session_count;e.value={...e.value,session_count:0};try{const J=await G.post("/api/sessions/clear-all");ye.success(`Cleared ${J.count} session${J.count!==1?"s":""}`),await L()}catch(J){e.value={...e.value,session_count:W},ye.error(J.message)}u.value={...u.value,clearSessions:!1}}async function M(){if(!await qt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const W=e.value.loop_count;e.value={...e.value,loop_count:0};try{const J=await G.post("/api/loops/stop-all");ye.success(J.result),await L()}catch(J){e.value={...e.value,loop_count:W},ye.error(J.message)}u.value={...u.value,stopLoops:!1}}function j(){t.value=!0,s.value=null,L(),A(),T(),O()}let q=null,D=null,R=null;function I(Z){if(Z.payload&&Z.payload.tool_name){b+=1;const W={...Z.payload,_isNew:!0,_key:++p,_liveEpoch:b};n.value.unshift(W),n.value.length>10&&n.value.pop(),c.value++,W.error&&(C+=1,W._liveErrorEpoch=C,o.value=!1,i.value.unshift(W),i.value.length>5&&i.value.pop()),setTimeout(()=>{W._isNew=!1},1500),clearTimeout(R),R=setTimeout(()=>{c.value=0},1e4)}}let U=null;return Ve(async()=>{await Promise.all([L(),A(),T(),O(),y()]),q=setInterval(L,15e3),D=setInterval(O,1e4),Ye.subscribe("events",I),U=Ye.onReconnected(()=>{A(),T()})}),mt(()=>{q&&clearInterval(q),D&&clearInterval(D),clearTimeout(R),Ye.unsubscribe("events",I),U&&(U(),U=null)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:m,stats:v,healthIndicators:w,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:A,fetchErrors:T,fetchStatus:L,onEvent:I,formatTime:Fw,formatDuration:ui,retry:j,reloadConfig:$,clearSessions:k,stopAllLoops:M}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function gp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function OS(e){if(Array.isArray(e))return e}function LS(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(n=i.call(s)).done)&&(o.push(n.value),o.length!==t);r=!0);}catch(d){c=!0,a=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return o}}function NS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function DS(e,t){return OS(e)||LS(e,t)||MS(e,t)||NS()}function MS(e,t){if(e){if(typeof e=="string")return gp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?gp(e,t):void 0}}const lv=Object.entries,bp=Object.setPrototypeOf,PS=Object.isFrozen,FS=Object.getPrototypeOf,$S=Object.getOwnPropertyDescriptor;let hs=Object.freeze,zs=Object.seal,Ha=Object.create,ov=typeof Reflect<"u"&&Reflect,pc=ov.apply,fc=ov.construct;hs||(hs=function(t){return t});zs||(zs=function(t){return t});pc||(pc=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});fc||(fc=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const vn=Pt(Array.prototype.forEach),BS=Pt(Array.prototype.lastIndexOf),yp=Pt(Array.prototype.pop),Pa=Pt(Array.prototype.push),US=Pt(Array.prototype.splice),cs=Array.isArray,Oi=Pt(String.prototype.toLowerCase),Cr=Pt(String.prototype.toString),xp=Pt(String.prototype.match),Fa=Pt(String.prototype.replace),_p=Pt(String.prototype.indexOf),HS=Pt(String.prototype.trim),zS=Pt(Number.prototype.toString),jS=Pt(Boolean.prototype.toString),wp=typeof BigInt>"u"?null:Pt(BigInt.prototype.toString),kp=typeof Symbol>"u"?null:Pt(Symbol.prototype.toString),St=Pt(Object.prototype.hasOwnProperty),Si=Pt(Object.prototype.toString),Gt=Pt(RegExp.prototype.test),oa=VS(TypeError);function Pt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return pc(e,t,n)}}function VS(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return fc(e,s)}}function ze(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Oi;if(bp&&bp(e,null),!cs(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(PS(t)||(t[n]=i),a=i)}e[a]=!0}return e}function qS(e){for(let t=0;t<e.length;t++)St(e,t)||(e[t]=null);return e}function es(e){const t=Ha(null);for(const n of lv(e)){var s=DS(n,2);const a=s[0],i=s[1];St(e,a)&&(cs(i)?t[a]=qS(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=es(i):t[a]=i)}return t}function GS(e){switch(typeof e){case"string":return e;case"number":return zS(e);case"boolean":return jS(e);case"bigint":return wp?wp(e):"0";case"symbol":return kp?kp(e):"Symbol()";case"undefined":return Si(e);case"function":case"object":{if(e===null)return Si(e);const t=e,s=en(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Si(n)}return Si(e)}default:return Si(e)}}function en(e,t){for(;e!==null;){const n=$S(e,t);if(n){if(n.get)return Pt(n.get);if(typeof n.value=="function")return Pt(n.value)}e=FS(e)}function s(){return null}return s}function KS(e){try{return Gt(e,""),!0}catch{return!1}}const Sp=hs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Er=hs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Ar=hs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),WS=hs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Rr=hs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),ZS=hs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Tp=hs(["#text"]),Cp=hs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Ir=hs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Ep=hs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Fl=hs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),JS=zs(/{{[\w\W]*|^[\w\W]*}}/g),YS=zs(/<%[\w\W]*|^[\w\W]*%>/g),QS=zs(/\${[\w\W]*/g),XS=zs(/^data-[\-\w.\u00B7-\uFFFF]+$/),e1=zs(/^aria-[\-\w]+$/),Ap=zs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),t1=zs(/^(?:\w+script|data):/i),s1=zs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),n1=zs(/^html$/i),a1=zs(/^[a-z][.\w]*(-[.\w]+)+$/i),Qs={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},i1=function(){return typeof window>"u"?null:window},l1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Rp=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function rv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:i1();const t=Te=>rv(Te);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Qs.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,f=en(p,"cloneNode"),m=en(p,"remove"),v=en(p,"nextSibling"),w=en(p,"childNodes"),L=en(p,"parentNode"),x=en(p,"shadowRoot"),g=en(p,"attributes"),b=l&&l.prototype?en(l.prototype,"nodeType"):null,C=l&&l.prototype?en(l.prototype,"nodeName"):null;if(typeof i=="function"){const Te=s.createElement("template");Te.content&&Te.content.ownerDocument&&(s=Te.content.ownerDocument)}let S,A="",T,y=!1,O=0;const $=function(){if(O>0)throw oa('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},k=function(N){$(),O++;try{return S.createHTML(N)}finally{O--}},M=function(N){$(),O++;try{return S.createScriptURL(N)}finally{O--}},j=function(){return y||(T=l1(u,a),y=!0),T},q=s,D=q.implementation,R=q.createNodeIterator,I=q.createDocumentFragment,U=q.getElementsByTagName,Z=n.importNode;let W=Rp();t.isSupported=typeof lv=="function"&&typeof L=="function"&&D&&D.createHTMLDocument!==void 0;const J=JS,oe=YS,ee=QS,ce=XS,Ne=e1,Q=t1,ge=s1,z=a1;let re=Ap,pe=null;const Ie=ze({},[...Sp,...Er,...Ar,...Rr,...Tp]);let _=null;const P=ze({},[...Cp,...Ir,...Ep,...Fl]);let H=Object.seal(Ha(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ie=null,se=null;const ae=Object.seal(Ha(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let fe=!0,ue=!0,de=!1,le=!0,xe=!1,me=!0,_e=!1,Re=!1,F=!1,ve=!1,ke=!1,Oe=!1,Pe=!0,dt=!1;const st="user-content-";let _t=!0,Ot=!1,rt={},Qe=null;const ne=ze({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Se=null;const Le=ze({},["audio","video","img","source","image","track"]);let Ke=null;const Et=ze({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),je="http://www.w3.org/1998/Math/MathML",Ft="http://www.w3.org/2000/svg",Ht="http://www.w3.org/1999/xhtml";let os=Ht,Zs=!1,ks=null;const sa=ze({},[je,Ft,Ht],Cr);let Js=ze({},["mi","mo","mn","ms","mtext"]),Ls=ze({},["annotation-xml"]);const Pn=ze({},["title","style","font","a","script"]);let Ss=null;const Fn=["application/xhtml+xml","text/html"],zt="text/html";let Xe=null,Ns=null;const Ds=s.createElement("form"),X=function(N){return N instanceof RegExp||N instanceof Function},we=function(){let N=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ns&&Ns===N)return;(!N||typeof N!="object")&&(N={}),N=es(N),Ss=Fn.indexOf(N.PARSER_MEDIA_TYPE)===-1?zt:N.PARSER_MEDIA_TYPE,Xe=Ss==="application/xhtml+xml"?Cr:Oi,pe=St(N,"ALLOWED_TAGS")&&cs(N.ALLOWED_TAGS)?ze({},N.ALLOWED_TAGS,Xe):Ie,_=St(N,"ALLOWED_ATTR")&&cs(N.ALLOWED_ATTR)?ze({},N.ALLOWED_ATTR,Xe):P,ks=St(N,"ALLOWED_NAMESPACES")&&cs(N.ALLOWED_NAMESPACES)?ze({},N.ALLOWED_NAMESPACES,Cr):sa,Ke=St(N,"ADD_URI_SAFE_ATTR")&&cs(N.ADD_URI_SAFE_ATTR)?ze(es(Et),N.ADD_URI_SAFE_ATTR,Xe):Et,Se=St(N,"ADD_DATA_URI_TAGS")&&cs(N.ADD_DATA_URI_TAGS)?ze(es(Le),N.ADD_DATA_URI_TAGS,Xe):Le,Qe=St(N,"FORBID_CONTENTS")&&cs(N.FORBID_CONTENTS)?ze({},N.FORBID_CONTENTS,Xe):ne,ie=St(N,"FORBID_TAGS")&&cs(N.FORBID_TAGS)?ze({},N.FORBID_TAGS,Xe):es({}),se=St(N,"FORBID_ATTR")&&cs(N.FORBID_ATTR)?ze({},N.FORBID_ATTR,Xe):es({}),rt=St(N,"USE_PROFILES")?N.USE_PROFILES&&typeof N.USE_PROFILES=="object"?es(N.USE_PROFILES):N.USE_PROFILES:!1,fe=N.ALLOW_ARIA_ATTR!==!1,ue=N.ALLOW_DATA_ATTR!==!1,de=N.ALLOW_UNKNOWN_PROTOCOLS||!1,le=N.ALLOW_SELF_CLOSE_IN_ATTR!==!1,xe=N.SAFE_FOR_TEMPLATES||!1,me=N.SAFE_FOR_XML!==!1,_e=N.WHOLE_DOCUMENT||!1,ve=N.RETURN_DOM||!1,ke=N.RETURN_DOM_FRAGMENT||!1,Oe=N.RETURN_TRUSTED_TYPE||!1,F=N.FORCE_BODY||!1,Pe=N.SANITIZE_DOM!==!1,dt=N.SANITIZE_NAMED_PROPS||!1,_t=N.KEEP_CONTENT!==!1,Ot=N.IN_PLACE||!1,re=KS(N.ALLOWED_URI_REGEXP)?N.ALLOWED_URI_REGEXP:Ap,os=typeof N.NAMESPACE=="string"?N.NAMESPACE:Ht,Js=St(N,"MATHML_TEXT_INTEGRATION_POINTS")&&N.MATHML_TEXT_INTEGRATION_POINTS&&typeof N.MATHML_TEXT_INTEGRATION_POINTS=="object"?es(N.MATHML_TEXT_INTEGRATION_POINTS):ze({},["mi","mo","mn","ms","mtext"]),Ls=St(N,"HTML_INTEGRATION_POINTS")&&N.HTML_INTEGRATION_POINTS&&typeof N.HTML_INTEGRATION_POINTS=="object"?es(N.HTML_INTEGRATION_POINTS):ze({},["annotation-xml"]);const te=St(N,"CUSTOM_ELEMENT_HANDLING")&&N.CUSTOM_ELEMENT_HANDLING&&typeof N.CUSTOM_ELEMENT_HANDLING=="object"?es(N.CUSTOM_ELEMENT_HANDLING):Ha(null);if(H=Ha(null),St(te,"tagNameCheck")&&X(te.tagNameCheck)&&(H.tagNameCheck=te.tagNameCheck),St(te,"attributeNameCheck")&&X(te.attributeNameCheck)&&(H.attributeNameCheck=te.attributeNameCheck),St(te,"allowCustomizedBuiltInElements")&&typeof te.allowCustomizedBuiltInElements=="boolean"&&(H.allowCustomizedBuiltInElements=te.allowCustomizedBuiltInElements),xe&&(ue=!1),ke&&(ve=!0),rt&&(pe=ze({},Tp),_=Ha(null),rt.html===!0&&(ze(pe,Sp),ze(_,Cp)),rt.svg===!0&&(ze(pe,Er),ze(_,Ir),ze(_,Fl)),rt.svgFilters===!0&&(ze(pe,Ar),ze(_,Ir),ze(_,Fl)),rt.mathMl===!0&&(ze(pe,Rr),ze(_,Ep),ze(_,Fl))),ae.tagCheck=null,ae.attributeCheck=null,St(N,"ADD_TAGS")&&(typeof N.ADD_TAGS=="function"?ae.tagCheck=N.ADD_TAGS:cs(N.ADD_TAGS)&&(pe===Ie&&(pe=es(pe)),ze(pe,N.ADD_TAGS,Xe))),St(N,"ADD_ATTR")&&(typeof N.ADD_ATTR=="function"?ae.attributeCheck=N.ADD_ATTR:cs(N.ADD_ATTR)&&(_===P&&(_=es(_)),ze(_,N.ADD_ATTR,Xe))),St(N,"ADD_URI_SAFE_ATTR")&&cs(N.ADD_URI_SAFE_ATTR)&&ze(Ke,N.ADD_URI_SAFE_ATTR,Xe),St(N,"FORBID_CONTENTS")&&cs(N.FORBID_CONTENTS)&&(Qe===ne&&(Qe=es(Qe)),ze(Qe,N.FORBID_CONTENTS,Xe)),St(N,"ADD_FORBID_CONTENTS")&&cs(N.ADD_FORBID_CONTENTS)&&(Qe===ne&&(Qe=es(Qe)),ze(Qe,N.ADD_FORBID_CONTENTS,Xe)),_t&&(pe["#text"]=!0),_e&&ze(pe,["html","head","body"]),pe.table&&(ze(pe,["tbody"]),delete ie.tbody),N.TRUSTED_TYPES_POLICY){if(typeof N.TRUSTED_TYPES_POLICY.createHTML!="function")throw oa('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof N.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw oa('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const he=S;S=N.TRUSTED_TYPES_POLICY;try{A=k("")}catch(De){throw S=he,De}}else N.TRUSTED_TYPES_POLICY===null?(S=void 0,A=""):(S===void 0&&(S=j()),S&&typeof A=="string"&&(A=k("")));(W.uponSanitizeElement.length>0||W.uponSanitizeAttribute.length>0)&&pe===Ie&&(pe=es(pe)),W.uponSanitizeAttribute.length>0&&_===P&&(_=es(_)),hs&&hs(N),Ns=N},$e=ze({},[...Er,...Ar,...WS]),Ze=ze({},[...Rr,...ZS]),wt=function(N){let te=L(N);(!te||!te.tagName)&&(te={namespaceURI:os,tagName:"template"});const he=Oi(N.tagName),De=Oi(te.tagName);return ks[N.namespaceURI]?N.namespaceURI===Ft?te.namespaceURI===Ht?he==="svg":te.namespaceURI===je?he==="svg"&&(De==="annotation-xml"||Js[De]):!!$e[he]:N.namespaceURI===je?te.namespaceURI===Ht?he==="math":te.namespaceURI===Ft?he==="math"&&Ls[De]:!!Ze[he]:N.namespaceURI===Ht?te.namespaceURI===Ft&&!Ls[De]||te.namespaceURI===je&&!Js[De]?!1:!Ze[he]&&(Pn[he]||!$e[he]):!!(Ss==="application/xhtml+xml"&&ks[N.namespaceURI]):!1},ut=function(N){Pa(t.removed,{element:N});try{L(N).removeChild(N)}catch{if(m(N),!L(N))throw oa("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},$n=function(N){const te=w?w(N):N.childNodes;if(te){const De=[];vn(te,Fe=>{Pa(De,Fe)}),vn(De,Fe=>{try{m(Fe)}catch{}})}const he=g?g(N):null;if(he)for(let De=he.length-1;De>=0;--De){const Fe=he[De],Ue=Fe&&Fe.name;if(typeof Ue=="string")try{N.removeAttribute(Ue)}catch{}}},js=function(N,te){try{Pa(t.removed,{attribute:te.getAttributeNode(N),from:te})}catch{Pa(t.removed,{attribute:null,from:te})}if(te.removeAttribute(N),N==="is")if(ve||ke)try{ut(te)}catch{}else try{te.setAttribute(N,"")}catch{}},mi=function(N){const te=g?g(N):N.attributes;if(te)for(let he=te.length-1;he>=0;--he){const De=te[he],Fe=De&&De.name;if(!(typeof Fe!="string"||_[Xe(Fe)]))try{N.removeAttribute(Fe)}catch{}}},vi=function(N){const te=[N];for(;te.length>0;){const he=te.pop();(b?b(he):he.nodeType)===Qs.element&&mi(he);const Fe=w?w(he):he.childNodes;if(Fe)for(let Ue=Fe.length-1;Ue>=0;--Ue)te.push(Fe[Ue])}},Ia=function(N){let te=null,he=null;if(F)N="<remove></remove>"+N;else{const Ue=xp(N,/^[\r\n\t ]+/);he=Ue&&Ue[0]}Ss==="application/xhtml+xml"&&os===Ht&&(N='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+N+"</body></html>");const De=S?k(N):N;if(os===Ht)try{te=new d().parseFromString(De,Ss)}catch{}if(!te||!te.documentElement){te=D.createDocument(os,"template",null);try{te.documentElement.innerHTML=Zs?A:De}catch{}}const Fe=te.body||te.documentElement;return N&&he&&Fe.insertBefore(s.createTextNode(he),Fe.childNodes[0]||null),os===Ht?U.call(te,_e?"html":"body")[0]:_e?te.documentElement:Fe},na=function(N){return R.call(N.ownerDocument||N,N,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},Bn=function(N){var te,he;N.normalize();const De=R.call(N.ownerDocument||N,N,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let Fe=De.nextNode();for(;Fe;){let yt=Fe.data;vn([J,oe,ee],it=>{yt=Fa(yt,it," ")}),Fe.data=yt,Fe=De.nextNode()}const Ue=(te=(he=N.querySelectorAll)===null||he===void 0?void 0:he.call(N,"template"))!==null&&te!==void 0?te:[];vn(Array.from(Ue),yt=>{Ys(yt.content)&&Bn(yt.content)})},Un=function(N){const te=C?C(N):null;return typeof te!="string"||Xe(te)!=="form"?!1:typeof N.nodeName!="string"||typeof N.textContent!="string"||typeof N.removeChild!="function"||N.attributes!==g(N)||typeof N.removeAttribute!="function"||typeof N.setAttribute!="function"||typeof N.namespaceURI!="string"||typeof N.insertBefore!="function"||typeof N.hasChildNodes!="function"||N.nodeType!==b(N)||N.childNodes!==w(N)},Ys=function(N){if(!b||typeof N!="object"||N===null)return!1;try{return b(N)===Qs.documentFragment}catch{return!1}},dn=function(N){if(!b||typeof N!="object"||N===null)return!1;try{return typeof b(N)=="number"}catch{return!1}};function Yt(Te,N,te){vn(Te,he=>{he.call(t,N,te,Ns)})}const Oa=function(N){let te=null;if(Yt(W.beforeSanitizeElements,N,null),Un(N))return ut(N),!0;const he=Xe(C?C(N):N.nodeName);if(Yt(W.uponSanitizeElement,N,{tagName:he,allowedTags:pe}),me&&N.hasChildNodes()&&!dn(N.firstElementChild)&&Gt(/<[/\w!]/g,N.innerHTML)&&Gt(/<[/\w!]/g,N.textContent)||me&&N.namespaceURI===Ht&&he==="style"&&dn(N.firstElementChild)||N.nodeType===Qs.progressingInstruction||me&&N.nodeType===Qs.comment&&Gt(/<[/\w]/g,N.data))return ut(N),!0;if(ie[he]||!(ae.tagCheck instanceof Function&&ae.tagCheck(he))&&!pe[he]){if(!ie[he]&&Ae(he)&&(H.tagNameCheck instanceof RegExp&&Gt(H.tagNameCheck,he)||H.tagNameCheck instanceof Function&&H.tagNameCheck(he)))return!1;if(_t&&!Qe[he]){const Fe=L(N),Ue=w(N);if(Ue&&Fe){const yt=Ue.length;for(let it=yt-1;it>=0;--it){const vt=Ot?Ue[it]:f(Ue[it],!0);Fe.insertBefore(vt,v(N))}}}return ut(N),!0}return(b?b(N):N.nodeType)===Qs.element&&!wt(N)||(he==="noscript"||he==="noembed"||he==="noframes")&&Gt(/<\/no(script|embed|frames)/i,N.innerHTML)?(ut(N),!0):(xe&&N.nodeType===Qs.text&&(te=N.textContent,vn([J,oe,ee],Fe=>{te=Fa(te,Fe," ")}),N.textContent!==te&&(Pa(t.removed,{element:N.cloneNode()}),N.textContent=te)),Yt(W.afterSanitizeElements,N,null),!1)},V=function(N,te,he){if(se[te]||Pe&&(te==="id"||te==="name")&&(he in s||he in Ds))return!1;const De=_[te]||ae.attributeCheck instanceof Function&&ae.attributeCheck(te,N);if(!(ue&&!se[te]&&Gt(ce,te))){if(!(fe&&Gt(Ne,te))){if(!De||se[te]){if(!(Ae(N)&&(H.tagNameCheck instanceof RegExp&&Gt(H.tagNameCheck,N)||H.tagNameCheck instanceof Function&&H.tagNameCheck(N))&&(H.attributeNameCheck instanceof RegExp&&Gt(H.attributeNameCheck,te)||H.attributeNameCheck instanceof Function&&H.attributeNameCheck(te,N))||te==="is"&&H.allowCustomizedBuiltInElements&&(H.tagNameCheck instanceof RegExp&&Gt(H.tagNameCheck,he)||H.tagNameCheck instanceof Function&&H.tagNameCheck(he))))return!1}else if(!Ke[te]){if(!Gt(re,Fa(he,ge,""))){if(!((te==="src"||te==="xlink:href"||te==="href")&&N!=="script"&&_p(he,"data:")===0&&Se[N])){if(!(de&&!Gt(Q,Fa(he,ge,"")))){if(he)return!1}}}}}}return!0},be=ze({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ae=function(N){return!be[Oi(N)]&&Gt(z,N)},Qt=function(N){Yt(W.beforeSanitizeAttributes,N,null);const te=N.attributes;if(!te||Un(N))return;const he={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:_,forceKeepAttr:void 0};let De=te.length;for(;De--;){const Fe=te[De],Ue=Fe.name,yt=Fe.namespaceURI,it=Fe.value,vt=Xe(Ue),E=it;let B=Ue==="value"?E:HS(E);if(he.attrName=vt,he.attrValue=B,he.keepAttr=!0,he.forceKeepAttr=void 0,Yt(W.uponSanitizeAttribute,N,he),B=he.attrValue,dt&&(vt==="id"||vt==="name")&&_p(B,st)!==0&&(js(Ue,N),B=st+B),me&&Gt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,B)){js(Ue,N);continue}if(vt==="attributename"&&xp(B,"href")){js(Ue,N);continue}if(he.forceKeepAttr)continue;if(!he.keepAttr){js(Ue,N);continue}if(!le&&Gt(/\/>/i,B)){js(Ue,N);continue}xe&&vn([J,oe,ee],Ee=>{B=Fa(B,Ee," ")});const Y=Xe(N.nodeName);if(!V(Y,vt,B)){js(Ue,N);continue}if(S&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!yt)switch(u.getAttributeType(Y,vt)){case"TrustedHTML":{B=k(B);break}case"TrustedScriptURL":{B=M(B);break}}if(B!==E)try{yt?N.setAttributeNS(yt,Ue,B):N.setAttribute(Ue,B),Un(N)?ut(N):yp(t.removed)}catch{js(Ue,N)}}Yt(W.afterSanitizeAttributes,N,null)},un=function(N){let te=null;const he=na(N);for(Yt(W.beforeSanitizeShadowDOM,N,null);te=he.nextNode();)if(Yt(W.uponSanitizeShadowNode,te,null),Oa(te),Qt(te),Ys(te.content)&&un(te.content),(b?b(te):te.nodeType)===Qs.element){const Fe=x?x(te):te.shadowRoot;Ys(Fe)&&(Hn(Fe),un(Fe))}Yt(W.afterSanitizeShadowDOM,N,null)},Hn=function(N){const te=[{node:N,shadow:null}];for(;te.length>0;){const he=te.pop();if(he.shadow){un(he.shadow);continue}const De=he.node,Ue=(b?b(De):De.nodeType)===Qs.element,yt=w?w(De):De.childNodes;if(yt)for(let it=yt.length-1;it>=0;--it)te.push({node:yt[it],shadow:null});if(Ue){const it=C?C(De):null;if(typeof it=="string"&&Xe(it)==="template"){const vt=De.content;Ys(vt)&&te.push({node:vt,shadow:null})}}if(Ue){const it=x?x(De):De.shadowRoot;Ys(it)&&te.push({node:null,shadow:it},{node:it,shadow:null})}}};return t.sanitize=function(Te){let N=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},te=null,he=null,De=null,Fe=null;if(Zs=!Te,Zs&&(Te="<!-->"),typeof Te!="string"&&!dn(Te)&&(Te=GS(Te),typeof Te!="string"))throw oa("dirty is not a string, aborting");if(!t.isSupported)return Te;Re||we(N),t.removed=[];const Ue=Ot&&typeof Te!="string"&&dn(Te);if(Ue){const vt=C?C(Te):Te.nodeName;if(typeof vt=="string"){const E=Xe(vt);if(!pe[E]||ie[E])throw oa("root node is forbidden and cannot be sanitized in-place")}if(Un(Te))throw oa("root node is clobbered and cannot be sanitized in-place");try{Hn(Te)}catch(E){throw $n(Te),E}}else if(dn(Te))te=Ia("<!---->"),he=te.ownerDocument.importNode(Te,!0),he.nodeType===Qs.element&&he.nodeName==="BODY"||he.nodeName==="HTML"?te=he:te.appendChild(he),Hn(he);else{if(!ve&&!xe&&!_e&&Te.indexOf("<")===-1)return S&&Oe?k(Te):Te;if(te=Ia(Te),!te)return ve?null:Oe?A:""}te&&F&&ut(te.firstChild);const yt=na(Ue?Te:te);try{for(;De=yt.nextNode();)Oa(De),Qt(De),Ys(De.content)&&un(De.content)}catch(vt){throw Ue&&$n(Te),vt}if(Ue)return vn(t.removed,vt=>{vt.element&&vi(vt.element)}),xe&&Bn(Te),Te;if(ve){if(xe&&Bn(te),ke)for(Fe=I.call(te.ownerDocument);te.firstChild;)Fe.appendChild(te.firstChild);else Fe=te;return(_.shadowroot||_.shadowrootmode)&&(Fe=Z.call(n,Fe,!0)),Fe}let it=_e?te.outerHTML:te.innerHTML;return _e&&pe["!doctype"]&&te.ownerDocument&&te.ownerDocument.doctype&&te.ownerDocument.doctype.name&&Gt(n1,te.ownerDocument.doctype.name)&&(it="<!DOCTYPE "+te.ownerDocument.doctype.name+`>
`+it),xe&&vn([J,oe,ee],vt=>{it=Fa(it,vt," ")}),S&&Oe?k(it):it},t.setConfig=function(){let Te=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};we(Te),Re=!0},t.clearConfig=function(){Ns=null,Re=!1,S=T,A=""},t.isValidAttribute=function(Te,N,te){Ns||we({});const he=Xe(Te),De=Xe(N);return V(he,De,te)},t.addHook=function(Te,N){typeof N=="function"&&Pa(W[Te],N)},t.removeHook=function(Te,N){if(N!==void 0){const te=BS(W[Te],N);return te===-1?void 0:US(W[Te],te,1)[0]}return yp(W[Te])},t.removeHooks=function(Te){W[Te]=[]},t.removeAllHooks=function(){W=Rp()},t}var Ip=rv();function yd(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Ra=yd();function cv(e){Ra=e}var Hi={exec:()=>null};function ot(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ps.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var ps={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},o1=/^(?:[ \t]*(?:\n|$))+/,r1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,c1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,yl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,d1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,xd=/(?:[*+-]|\d{1,9}[.)])/,dv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,uv=ot(dv).replace(/bull/g,xd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),u1=ot(dv).replace(/bull/g,xd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),_d=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,p1=/^[^\n]+/,wd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,f1=ot(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",wd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),h1=ot(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,xd).getRegex(),Xo="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",kd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,m1=ot("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",kd).replace("tag",Xo).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),pv=ot(_d).replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Xo).getRegex(),v1=ot(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",pv).getRegex(),Sd={blockquote:v1,code:r1,def:f1,fences:c1,heading:d1,hr:yl,html:m1,lheading:uv,list:h1,newline:o1,paragraph:pv,table:Hi,text:p1},Op=ot("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Xo).getRegex(),g1={...Sd,lheading:u1,table:Op,paragraph:ot(_d).replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Op).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Xo).getRegex()},b1={...Sd,html:ot(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",kd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Hi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:ot(_d).replace("hr",yl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",uv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},y1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,x1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,fv=/^( {2,}|\\)\n(?!\s*$)/,_1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,er=/[\p{P}\p{S}]/u,Td=/[\s\p{P}\p{S}]/u,hv=/[^\s\p{P}\p{S}]/u,w1=ot(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Td).getRegex(),mv=/(?!~)[\p{P}\p{S}]/u,k1=/(?!~)[\s\p{P}\p{S}]/u,S1=/(?:[^\s\p{P}\p{S}]|~)/u,T1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,vv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,C1=ot(vv,"u").replace(/punct/g,er).getRegex(),E1=ot(vv,"u").replace(/punct/g,mv).getRegex(),gv="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",A1=ot(gv,"gu").replace(/notPunctSpace/g,hv).replace(/punctSpace/g,Td).replace(/punct/g,er).getRegex(),R1=ot(gv,"gu").replace(/notPunctSpace/g,S1).replace(/punctSpace/g,k1).replace(/punct/g,mv).getRegex(),I1=ot("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,hv).replace(/punctSpace/g,Td).replace(/punct/g,er).getRegex(),O1=ot(/\\(punct)/,"gu").replace(/punct/g,er).getRegex(),L1=ot(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),N1=ot(kd).replace("(?:-->|$)","-->").getRegex(),D1=ot("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",N1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),_o=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,M1=ot(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",_o).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),bv=ot(/^!?\[(label)\]\[(ref)\]/).replace("label",_o).replace("ref",wd).getRegex(),yv=ot(/^!?\[(ref)\](?:\[\])?/).replace("ref",wd).getRegex(),P1=ot("reflink|nolink(?!\\()","g").replace("reflink",bv).replace("nolink",yv).getRegex(),Cd={_backpedal:Hi,anyPunctuation:O1,autolink:L1,blockSkip:T1,br:fv,code:x1,del:Hi,emStrongLDelim:C1,emStrongRDelimAst:A1,emStrongRDelimUnd:I1,escape:y1,link:M1,nolink:yv,punctuation:w1,reflink:bv,reflinkSearch:P1,tag:D1,text:_1,url:Hi},F1={...Cd,link:ot(/^!?\[(label)\]\((.*?)\)/).replace("label",_o).getRegex(),reflink:ot(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",_o).getRegex()},hc={...Cd,emStrongRDelimAst:R1,emStrongLDelim:E1,url:ot(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},$1={...hc,br:ot(fv).replace("{2,}","*").getRegex(),text:ot(hc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},$l={normal:Sd,gfm:g1,pedantic:b1},Ti={normal:Cd,gfm:hc,breaks:$1,pedantic:F1},B1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Lp=e=>B1[e];function tn(e,t){if(t){if(ps.escapeTest.test(e))return e.replace(ps.escapeReplace,Lp)}else if(ps.escapeTestNoEncode.test(e))return e.replace(ps.escapeReplaceNoEncode,Lp);return e}function Np(e){try{e=encodeURI(e).replace(ps.percentDecode,"%")}catch{return null}return e}function Dp(e,t){var i;const s=e.replace(ps.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(ps.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(ps.slashPipe,"|");return n}function Ci(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function U1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Mp(e,t,s,n,a){const i=t.href,l=t.title||null,o=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:n.inlineTokens(o)};return n.state.inLink=!1,r}function H1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=a.length?i.slice(a.length):i}).join(`
`)}var wo=class{constructor(e){ft(this,"options");ft(this,"rules");ft(this,"lexer");this.options=e||Ra}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Ci(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=H1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Ci(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Ci(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Ci(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const f=p,m=f.raw+`
`+s.join(`
`),v=this.blockquote(m);i[i.length-1]=v,n=n.substring(0,n.length-f.raw.length)+v.raw,a=a.substring(0,a.length-f.text.length)+v.text;break}else if((p==null?void 0:p.type)==="list"){const f=p,m=f.raw+`
`+s.join(`
`),v=this.list(m);i[i.length-1]=v,n=n.substring(0,n.length-p.raw.length)+v.raw,a=a.substring(0,a.length-f.raw.length)+v.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,L=>" ".repeat(3*L.length)),p=e.split(`
`,1)[0],f=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):f?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const L=this.rules.other.nextBulletRegex(m),x=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),C=this.rules.other.htmlBeginRegex(m);for(;e;){const S=e.split(`
`,1)[0];let A;if(p=S,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),A=p):A=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||C.test(p)||L.test(p)||x.test(p))break;if(A.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+A.slice(m);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||x.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=S+`
`,e=e.substring(S.length+1),u=A.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,w;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(w=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:w,loose:!1,text:d,tokens:[]}),a.raw+=c}const o=a.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let r=0;r<a.items.length;r++)if(this.lexer.state.top=!1,a.items[r].tokens=this.lexer.blockTokens(a.items[r].text,[]),!a.loose){const c=a.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let r=0;r<a.items.length;r++)a.items[r].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Dp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const o of n)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of a)i.rows.push(Dp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Ci(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=U1(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Mp(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Mp(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,o,r=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(o=[...l].length,n[3]||n[4]){r+=o;continue}else if((n[5]||n[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Sn=class mc{constructor(t){ft(this,"tokens");ft(this,"options");ft(this,"state");ft(this,"tokenizer");ft(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Ra,this.options.tokenizer=this.options.tokenizer||new wo,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ps,block:$l.normal,inline:Ti.normal};this.options.pedantic?(s.block=$l.pedantic,s.inline=Ti.pedantic):this.options.gfm&&(s.block=$l.gfm,this.options.breaks?s.inline=Ti.breaks:s.inline=Ti.gfm),this.tokenizer.rules=s}static get rules(){return{block:$l,inline:Ti}}static lex(t,s){return new mc(s).lex(t)}static lexInline(t,s){return new mc(s).inlineTokens(t)}lex(t){t=t.replace(ps.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(ps.tabCharGlobal,"    ").replace(ps.spaceLine,""));t;){let o;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),n=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},f),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},ko=class{constructor(e){ft(this,"options");ft(this,"parser");this.options=e||Ra}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(ps.notSpaceStart))==null?void 0:i[0],a=e.replace(ps.endingNewline,"")+`
`;return n?'<pre><code class="language-'+tn(n)+'">'+(s?a:tn(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:tn(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const o=e.items[l];n+=this.listitem(o)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+tn(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${tn(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Np(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+tn(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Np(e);if(a===null)return tn(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${tn(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:tn(e.text)}},Ed=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Tn=class vc{constructor(t){ft(this,"options");ft(this,"renderer");ft(this,"textRenderer");this.options=t||Ra,this.options.renderer=this.options.renderer||new ko,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Ed}static parse(t,s){return new vc(s).parse(t)}static parseInline(t,s){return new vc(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const r=o;switch(r.type){case"space":{n+=this.renderer.space(r);continue}case"hr":{n+=this.renderer.hr(r);continue}case"heading":{n+=this.renderer.heading(r);continue}case"code":{n+=this.renderer.code(r);continue}case"table":{n+=this.renderer.table(r);continue}case"blockquote":{n+=this.renderer.blockquote(r);continue}case"list":{n+=this.renderer.list(r);continue}case"html":{n+=this.renderer.html(r);continue}case"paragraph":{n+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){n+=c||"";continue}}const r=o;switch(r.type){case"escape":{n+=s.text(r);break}case"html":{n+=s.html(r);break}case"link":{n+=s.link(r);break}case"image":{n+=s.image(r);break}case"strong":{n+=s.strong(r);break}case"em":{n+=s.em(r);break}case"codespan":{n+=s.codespan(r);break}case"br":{n+=s.br(r);break}case"del":{n+=s.del(r);break}case"text":{n+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Or,ql=(Or=class{constructor(e){ft(this,"options");ft(this,"block");this.options=e||Ra}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Sn.lex:Sn.lexInline}provideParser(){return this.block?Tn.parse:Tn.parseInline}},ft(Or,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Or),z1=class{constructor(...e){ft(this,"defaults",yd());ft(this,"options",this.setOptions);ft(this,"parse",this.parseMarkdown(!0));ft(this,"parseInline",this.parseMarkdown(!1));ft(this,"Parser",Tn);ft(this,"Renderer",ko);ft(this,"TextRenderer",Ed);ft(this,"Lexer",Sn);ft(this,"Tokenizer",wo);ft(this,"Hooks",ql);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let o=a.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new ko(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new wo(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new ql;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=a[l];ql.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(a,c)).then(u=>r.call(a,u));const d=o.call(a,c);return r.call(a,d)}:a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),a&&(o=o.concat(a.call(this,l))),o}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Sn.lex(e,t??this.defaults)}parser(e,t){return Tn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Sn.lex:Sn.lexInline,r=i.hooks?i.hooks.provideParser():e?Tn.parse:Tn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+tn(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ka=new z1;function at(e,t){return ka.parse(e,t)}at.options=at.setOptions=function(e){return ka.setOptions(e),at.defaults=ka.defaults,cv(at.defaults),at};at.getDefaults=yd;at.defaults=Ra;at.use=function(...e){return ka.use(...e),at.defaults=ka.defaults,cv(at.defaults),at};at.walkTokens=function(e,t){return ka.walkTokens(e,t)};at.parseInline=ka.parseInline;at.Parser=Tn;at.parser=Tn.parse;at.Renderer=ko;at.TextRenderer=Ed;at.Lexer=Sn;at.lexer=Sn.lex;at.Tokenizer=wo;at.Hooks=ql;at.parse=at;at.options;at.setOptions;at.use;at.walkTokens;at.parseInline;Tn.parse;Sn.lex;const j1={breaks:!0,gfm:!0};function Pp(e){if(!e)return"";try{if(typeof at<"u"&&at.parse){const t=at.parse(e,j1);return typeof Ip<"u"?Ip.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function V1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const q1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function G1(e){return q1[e]||"wrench"}const K1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Fp(e){if(!e)return[];const t=e.match(K1);return t?[...new Set(t)]:[]}const W1={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(""),a=h(null),i=h(null),l=h(0),o=h("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=K(()=>t.value.trim().length>0&&!s.value),p=h(Ye.state||"disconnected");let f=null;const m=K(()=>{const D=p.value;return D==="connected"?"Connected":D==="reconnecting"?"Reconnecting…":D==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],w=K(()=>{const D=Math.floor(l.value/4)%v.length,R=l.value;return R>3?`${v[D]} (${R}s)`:v[0]});function L(){Rt(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function x(){if(!i.value)return;const D=i.value;D.style.height="auto",D.style.height=Math.min(D.scrollHeight,120)+"px"}function g(D,R,I={}){const U={id:++c,role:D,content:R,timestamp:Date.now(),html:D==="bot"?Pp(R):"",tools_used:I.tools_used||[],is_error:I.is_error||!1,images:D==="bot"?Fp(R):[],files:I.files||[],_showTools:!1};return e.value.push(U),L(),D==="bot"&&Rt(()=>b()),U}function b(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(R=>{R.setAttribute("data-copy","true"),R.style.position="relative";const I=document.createElement("button");I.className="chat-code-copy",I.textContent="Copy",I.addEventListener("click",()=>{const U=R.querySelector("code"),Z=U?U.textContent:R.textContent;navigator.clipboard.writeText(Z).then(()=>{I.textContent="Copied!",setTimeout(()=>{I.textContent="Copy"},1500)}).catch(()=>{})}),R.appendChild(I)})}function C(D){if(D===0)return!0;const R=e.value[D-1],I=e.value[D],U=new Date(R.timestamp).toDateString(),Z=new Date(I.timestamp).toDateString();return U!==Z}function S(D){const R=new Date(D),I=new Date;if(R.toDateString()===I.toDateString())return"Today";const U=new Date(I);return U.setDate(U.getDate()-1),R.toDateString()===U.toDateString()?"Yesterday":R.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function A(D){t.value=D,Rt(()=>j())}function T(D){window.open(D,"_blank","noopener")}function y(D){D.target.style.display="none"}function O(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function $(){r&&(clearInterval(r),r=null),l.value=0}function k(D){s.value&&(s.value=!1,$(),D.type==="chat_response"?g("bot",D.content,{tools_used:D.tools_used||[],is_error:D.is_error||!1,files:D.files||[]}):D.type==="chat_error"&&g("bot",D.error||"Unknown error",{is_error:!0}),Rt(()=>{var R;return(R=i.value)==null?void 0:R.focus()}))}async function M(D){try{const R=await G.post("/api/chat",{content:D,channel_id:o.value});g("bot",R.response,{tools_used:R.tools_used||[],is_error:R.is_error||!1,files:R.files||[]})}catch(R){g("bot",R.message||"Failed to send message",{is_error:!0})}}async function j(){const D=t.value.trim();if(!D||s.value)return;g("user",D),t.value="",s.value=!0,O(),i.value&&(i.value.style.height="auto"),Ye.connected&&Ye.sendChat(D,{channelId:o.value})||(await M(D),s.value=!1,$()),Rt(()=>{var I;return(I=i.value)==null?void 0:I.focus()})}async function q(){n.value="";try{if(!o.value){const R=await G.get("/api/auth/session");o.value=R.channel_id||R.user_id||"web-user"}const D=await G.get("/api/sessions/"+encodeURIComponent(o.value));if(D&&D.messages&&D.messages.length>0){for(const R of D.messages){const I=R.role==="user"?"user":"bot";let U=R.content||"";if(I==="user"){const W=U.match(/^\[.*?\]:\s*/);W&&(U=U.slice(W[0].length))}if(!U.trim())continue;const Z={id:++c,role:I,content:U,timestamp:R.timestamp?R.timestamp*1e3:Date.now(),html:I==="bot"?Pp(U):"",tools_used:[],is_error:!1,images:I==="bot"?Fp(U):[],files:[],_showTools:!1};e.value.push(Z)}Rt(()=>{L(),b()})}}catch(D){D&&D.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",ye.error(n.value))}}return Ve(()=>{Ye.subscribe("chat",k),p.value=Ye.state||"disconnected",f=Ye.onState(D=>{p.value=D}),q(),Rt(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}),mt(()=>{Ye.unsubscribe("chat",k),f&&(f(),f=null),$()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:w,suggestions:d,send:j,autoResize:x,formatTime:V1,formatDate:S,showDateSeparator:C,useSuggestion:A,openImage:T,onImageError:y,getToolIcon:G1,loadHistory:q}}},Z1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),o=h(!1),r=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),m=K(()=>e.value==="custom"),v=K(()=>[...i.value,...l.value]),w=K(()=>l.value.includes(e.value)),L=K(()=>{var T;return m.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),x=K(()=>{var T;return m.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),g=K(()=>{var T;return m.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function b(){d.value=!0;try{const T=await G.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function C(){o.value=!0,c.value=null,r.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(T){c.value=T.message}finally{o.value=!1}}async function S(){const T=u.value.trim();if(T){f.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:T,display_name:L.value,identity:x.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(y){c.value=y.message}finally{f.value=!1}}}async function A(){if(await qt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(y){c.value=y.message}}}return Ve(b),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:w,previewName:L,previewIdentity:x,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:C,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:S,deletePreset:A,builtinPresets:i,userPresets:l}},template:`
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
  `},kt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),xv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:IS,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:W1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:Jw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:ik,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Ck,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:Z1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:kS,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:kt("/operations","live")},{path:"/agents",redirect:kt("/operations","agents")},{path:"/loops",redirect:kt("/operations","loops")},{path:"/processes",redirect:kt("/operations","processes")},{path:"/schedules",redirect:kt("/operations","schedules")},{path:"/audit",redirect:kt("/history","audit")},{path:"/sessions",redirect:kt("/history","sessions")},{path:"/traces",redirect:kt("/history","traces")},{path:"/usage",redirect:kt("/history","usage")},{path:"/tools",redirect:kt("/capabilities","tools")},{path:"/skills",redirect:kt("/capabilities","skills")},{path:"/mcp",redirect:kt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:kt("/capabilities","knowledge")},{path:"/memory",redirect:kt("/capabilities","memory")},{path:"/learned",redirect:kt("/capabilities","learned")},{path:"/health",redirect:kt("/system","health")},{path:"/resources",redirect:kt("/system","resources")},{path:"/logs",redirect:kt("/system","logs")},{path:"/config",redirect:kt("/system","config")},{path:"/host-access",redirect:kt("/system","host-access")},{path:"/hosts",redirect:kt("/system","hosts")},{path:"/internals",redirect:kt("/system","internals")}],zi=Tw({history:nw(),routes:xv});zi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const J1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{G.setPersist(a.value),await G.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},Y1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let o=null,r=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const m=h("starting"),v=h(""),w=xv.filter(U=>U.meta),L=K(()=>["Workspace","Operate","Observe","Manage"].map(U=>({name:U,routes:w.filter(Z=>Z.meta.section===U)})).filter(U=>U.routes.length)),x=K(()=>{var U;return((U=zi.currentRoute.value.meta)==null?void 0:U.label)||"Odin"}),g=K(()=>{var U;return((U=zi.currentRoute.value.meta)==null?void 0:U.section)||"Management"}),b=K(()=>{var U;return((U=zi.currentRoute.value.meta)==null?void 0:U.description)||"Management console"});function C(){Ye.disconnect(),j&&(clearInterval(j),j=null)}G.onSessionExpired=()=>{t.value=!0,C(),G.setToken(""),e.value="login"};function S(U){var Z;if((U.ctrlKey||U.metaKey)&&U.key.toLowerCase()==="k"){e.value==="ready"&&(U.preventDefault(),mp());return}if(n.value&&U.key==="Tab"){const W=[...((Z=a.value)==null?void 0:Z.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(W.length){const J=W[0],oe=W[W.length-1];if(U.shiftKey&&(document.activeElement===J||!a.value.contains(document.activeElement))){U.preventDefault(),oe.focus();return}if(!U.shiftKey&&(document.activeElement===oe||!a.value.contains(document.activeElement))){U.preventDefault(),J.focus();return}}}if(U.key==="Escape"&&n.value){n.value=!1,U.preventDefault();return}if(U.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(U.target.tagName)){U.preventDefault();const W=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');W&&W.focus()}}function A(){l.value=!!(o!=null&&o.matches),l.value||(n.value=!1)}Ve(async()=>{document.addEventListener("keydown",S),o=window.matchMedia("(max-width: 900px)"),A(),o.addEventListener("change",A);const U=await G.check();U.ok?(e.value="ready",R()):U.needsAuth?e.value="login":(e.value="ready",R())});function T(){t.value=!1,e.value="ready",R()}async function y(){C(),e.value="login",await G.logout()}function O(){s.value=!s.value}function $(){n.value=!n.value}Mt(n,async U=>{var Z,W;if(U)r=document.activeElement,await Rt(),(W=(Z=a.value)==null?void 0:Z.querySelector(".nav-item"))==null||W.focus();else if(r!=null&&r.isConnected){const J=r;r=null,requestAnimationFrame(()=>J.focus())}});const k=K(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M(U,Z="info",W=3e3){p.value={text:U,level:Z},clearTimeout(f),f=setTimeout(()=>{p.value=null},W)}let j=null,q=!1,D=[];function R(){for(const U of D)U();D=[Ye.onStatus(U=>{c.value=U}),Ye.onLatencyChange(U=>{u.value=U}),Ye.onState((U,Z)=>{d.value=U,U==="connected"?(q&&M("Connection restored","success"),q=!0):U==="reconnecting"&&Z.attempt===1&&M("Connection lost — reconnecting…","warn")})],Ye.connect(),I(),j&&clearInterval(j),j=setInterval(I,15e3)}async function I(){try{const U=await G.get("/api/status");m.value=U.status==="online"?"online":"starting";const Z=U.uptime_seconds||0,W=Math.floor(Z/3600),J=Math.floor(Z%3600/60);v.value=`${W}h ${J}m uptime`}catch{m.value="offline",v.value=""}}return mt(()=>{j&&clearInterval(j);for(const U of D)U();D=[],Ye.disconnect(),document.removeEventListener("keydown",S),o==null||o.removeEventListener("change",A)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:k,wsToast:p,botStatus:m,botUptime:v,navRoutes:w,navGroups:L,currentPage:x,currentSection:g,currentDescription:b,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:T,logout:y,toggleSidebar:O,toggleMobileNavigation:$,openPalette:mp}}},ta=co(Y1);ta.component("odin-icon",ES);ta.component("login-screen",J1);ta.component("toast-container",g_);ta.component("confirm-host",b_);ta.component("command-palette",CS);ta.directive("modal-focus",RS);ta.use(zi);ta.mount("#app");
