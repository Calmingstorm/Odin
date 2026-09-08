var Cv=Object.defineProperty;var Ev=(e,t,s)=>t in e?Cv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ht=(e,t,s)=>Ev(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Av{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new _l("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new Ld(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new _l("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new Ld((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new _l((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof _l?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class _l extends Error{constructor(t){super(t),this.name="AuthError"}}class Ld extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Rv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)a.send(JSON.stringify({subscribe:o}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(a,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const z=new Av,Ye=new Rv(z);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Os(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ge={},Va=[],Yt=()=>{},za=()=>!1,Sa=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Co=e=>e.startsWith("onUpdate:"),qe=Object.assign,yc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Iv=Object.prototype.hasOwnProperty,nt=(e,t)=>Iv.call(e,t),Ce=Array.isArray,qa=e=>pi(e)==="[object Map]",Ta=e=>pi(e)==="[object Set]",Nd=e=>pi(e)==="[object Date]",Ov=e=>pi(e)==="[object RegExp]",Pe=e=>typeof e=="function",Ue=e=>typeof e=="string",os=e=>typeof e=="symbol",tt=e=>e!==null&&typeof e=="object",xc=e=>(tt(e)||Pe(e))&&Pe(e.then)&&Pe(e.catch),zp=Object.prototype.toString,pi=e=>zp.call(e),Lv=e=>pi(e).slice(8,-1),Eo=e=>pi(e)==="[object Object]",Ao=e=>Ue(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Cn=Os(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Nv=Os("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ro=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Dv=/-\w/g,pt=Ro(e=>e.replace(Dv,t=>t.slice(1).toUpperCase())),Pv=/\B([A-Z])/g,xs=Ro(e=>e.replace(Pv,"-$1").toLowerCase()),Ca=Ro(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ga=Ro(e=>e?`on${Ca(e)}`:""),jt=(e,t)=>!Object.is(e,t),Ka=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},jp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Io=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Wl=e=>{const t=Ue(e)?Number(e):NaN;return isNaN(t)?e:t};let Dd;const Oo=()=>Dd||(Dd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Mv(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Fv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",$v=Os(Fv);function dl(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ue(n)?Vp(n):dl(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ue(e)||tt(e))return e}const Uv=/;(?![^(]*\))/g,Bv=/:([^]+)/,Hv=/\/\*[^]*?\*\//g;function Vp(e){const t={};return e.replace(Hv,"").split(Uv).forEach(s=>{if(s){const n=s.split(Bv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function ul(e){let t="";if(Ue(e))t=e;else if(Ce(e))for(let s=0;s<e.length;s++){const n=ul(e[s]);n&&(t+=n+" ")}else if(tt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function zv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ue(t)&&(e.class=ul(t)),s&&(e.style=dl(s)),e}const jv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Vv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",qv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Gv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Kv=Os(jv),Wv=Os(Vv),Jv=Os(qv),Zv=Os(Gv),Yv="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Qv=Os(Yv);function qp(e){return!!e||e===""}function Xv(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=In(e[n],t[n]);return s}function In(e,t){if(e===t)return!0;let s=Nd(e),n=Nd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=os(e),n=os(t),s||n)return e===t;if(s=Ce(e),n=Ce(t),s||n)return s&&n?Xv(e,t):!1;if(s=tt(e),n=tt(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!In(e[l],t[l]))return!1}}return String(e)===String(t)}function Lo(e,t){return e.findIndex(s=>In(s,t))}const Gp=e=>!!(e&&e.__v_isRef===!0),Kp=e=>Ue(e)?e:e==null?"":Ce(e)||tt(e)&&(e.toString===zp||!Pe(e.toString))?Gp(e)?Kp(e.value):JSON.stringify(e,Wp,2):String(e),Wp=(e,t)=>Gp(t)?Wp(e,t.value):qa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[nr(n,i)+" =>"]=a,s),{})}:Ta(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>nr(s))}:os(t)?nr(t):tt(t)&&!Ce(t)&&!Eo(t)?String(t):t,nr=(e,t="")=>{var s;return os(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function eg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Bt;class _c{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Bt&&(Bt.active?(this.parent=Bt,this.index=(Bt.scopes||(Bt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Bt;try{return Bt=this,t()}finally{Bt=s}}}on(){++this._on===1&&(this.prevScope=Bt,Bt=this)}off(){if(this._on>0&&--this._on===0){if(Bt===this)Bt=this.prevScope;else{let t=Bt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function tg(e){return new _c(e)}function Jp(){return Bt}function sg(e,t=!1){Bt&&Bt.cleanups.push(e)}let mt;const ar=new WeakSet;class ji{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Bt&&(Bt.active?Bt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,ar.has(this)&&(ar.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Yp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Pd(this),Qp(this);const t=mt,s=qs;mt=this,qs=!0;try{return this.fn()}finally{Xp(this),mt=t,qs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Sc(t);this.deps=this.depsTail=void 0,Pd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?ar.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Nr(this)&&this.run()}get dirty(){return Nr(this)}}let Zp=0,Li,Ni;function Yp(e,t=!1){if(e.flags|=8,t){e.next=Ni,Ni=e;return}e.next=Li,Li=e}function wc(){Zp++}function kc(){if(--Zp>0)return;if(Ni){let t=Ni;for(Ni=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Li;){let t=Li;for(Li=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Qp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Xp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Sc(n),ng(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Nr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(ef(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function ef(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Vi)||(e.globalVersion=Vi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Nr(e))))return;e.flags|=2;const t=e.dep,s=mt,n=qs;mt=e,qs=!0;try{Qp(e);const a=e.fn(e._value);(t.version===0||jt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{mt=s,qs=n,Xp(e),e.flags&=-3}}function Sc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Sc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function ng(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function ag(e,t){e.effect instanceof ji&&(e=e.effect.fn);const s=new ji(e);t&&qe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function ig(e){e.effect.stop()}let qs=!0;const tf=[];function On(){tf.push(qs),qs=!1}function Ln(){const e=tf.pop();qs=e===void 0?!0:e}function Pd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=mt;mt=void 0;try{t()}finally{mt=s}}}let Vi=0;class lg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class No{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!mt||!qs||mt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==mt)s=this.activeLink=new lg(mt,this),mt.deps?(s.prevDep=mt.depsTail,mt.depsTail.nextDep=s,mt.depsTail=s):mt.deps=mt.depsTail=s,sf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=mt.depsTail,s.nextDep=void 0,mt.depsTail.nextDep=s,mt.depsTail=s,mt.deps===s&&(mt.deps=n)}return s}trigger(t){this.version++,Vi++,this.notify(t)}notify(t){wc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{kc()}}}function sf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)sf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Jl=new WeakMap,ma=Symbol(""),Dr=Symbol(""),qi=Symbol("");function as(e,t,s){if(qs&&mt){let n=Jl.get(e);n||Jl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new No),a.map=n,a.key=s),a.track()}}function _n(e,t,s,n,a,i){const l=Jl.get(e);if(!l){Vi++;return}const o=r=>{r&&r.trigger()};if(wc(),t==="clear")l.forEach(o);else{const r=Ce(e),c=r&&Ao(s);if(r&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===qi||!os(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(qi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(ma)),qa(e)&&o(l.get(Dr)));break;case"delete":r||(o(l.get(ma)),qa(e)&&o(l.get(Dr)));break;case"set":qa(e)&&o(l.get(ma));break}}kc()}function og(e,t){const s=Jl.get(e);return s&&s.get(t)}function La(e){const t=Ze(e);return t===e?t:(as(t,"iterate",qi),ws(e)?t:t.map(Ks))}function Do(e){return as(e=Ze(e),"iterate",qi),e}function an(e,t){return on(e)?ei(En(e)?Ks(t):t):Ks(t)}const rg={__proto__:null,[Symbol.iterator](){return ir(this,Symbol.iterator,e=>an(this,e))},concat(...e){return La(this).concat(...e.map(t=>Ce(t)?La(t):t))},entries(){return ir(this,"entries",e=>(e[1]=an(this,e[1]),e))},every(e,t){return fn(this,"every",e,t,void 0,arguments)},filter(e,t){return fn(this,"filter",e,t,s=>s.map(n=>an(this,n)),arguments)},find(e,t){return fn(this,"find",e,t,s=>an(this,s),arguments)},findIndex(e,t){return fn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return fn(this,"findLast",e,t,s=>an(this,s),arguments)},findLastIndex(e,t){return fn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return fn(this,"forEach",e,t,void 0,arguments)},includes(...e){return lr(this,"includes",e)},indexOf(...e){return lr(this,"indexOf",e)},join(e){return La(this).join(e)},lastIndexOf(...e){return lr(this,"lastIndexOf",e)},map(e,t){return fn(this,"map",e,t,void 0,arguments)},pop(){return gi(this,"pop")},push(...e){return gi(this,"push",e)},reduce(e,...t){return Md(this,"reduce",e,t)},reduceRight(e,...t){return Md(this,"reduceRight",e,t)},shift(){return gi(this,"shift")},some(e,t){return fn(this,"some",e,t,void 0,arguments)},splice(...e){return gi(this,"splice",e)},toReversed(){return La(this).toReversed()},toSorted(e){return La(this).toSorted(e)},toSpliced(...e){return La(this).toSpliced(...e)},unshift(...e){return gi(this,"unshift",e)},values(){return ir(this,"values",e=>an(this,e))}};function ir(e,t,s){const n=Do(e),a=n[t]();return n!==e&&!ws(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const cg=Array.prototype;function fn(e,t,s,n,a,i){const l=Do(e),o=l!==e&&!ws(e),r=l[t];if(r!==cg[t]){const u=r.apply(e,i);return o?Ks(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,an(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,n);return o&&a?a(d):d}function Md(e,t,s,n){const a=Do(e),i=a!==e&&!ws(e);let l=s,o=!1;a!==e&&(i?(o=n.length===0,l=function(c,d,u){return o&&(o=!1,c=an(e,c)),s.call(this,c,an(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=a[t](l,...n);return o?an(e,r):r}function lr(e,t,s){const n=Ze(e);as(n,"iterate",qi);const a=n[t](...s);return(a===-1||a===!1)&&pl(s[0])?(s[0]=Ze(s[0]),n[t](...s)):a}function gi(e,t,s=[]){On(),wc();const n=Ze(e)[t].apply(e,s);return kc(),Ln(),n}const dg=Os("__proto__,__v_isRef,__isVue"),nf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(os));function ug(e){os(e)||(e=String(e));const t=Ze(this);return as(t,"has",e),t.hasOwnProperty(e)}class af{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?uf:df:i?cf:rf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ce(t);if(!a){let r;if(l&&(r=rg[s]))return r;if(s==="hasOwnProperty")return ug}const o=Reflect.get(t,s,Pt(t)?t:n);if((os(s)?nf.has(s):dg(s))||(a||as(t,"get",s),i))return o;if(Pt(o)){const r=l&&Ao(s)?o:o.value;return a&&tt(r)?Zl(r):r}return tt(o)?a?Zl(o):ta(o):o}}class lf extends af{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ce(t)&&Ao(s);if(!this._isShallow){const c=on(i);if(!ws(n)&&!on(n)&&(i=Ze(i),n=Ze(n)),!l&&Pt(i)&&!Pt(n))return c||(i.value=n),!0}const o=l?Number(s)<t.length:nt(t,s),r=Reflect.set(t,s,n,Pt(t)?t:a);return t===Ze(a)&&(o?jt(n,i)&&_n(t,"set",s,n):_n(t,"add",s,n)),r}deleteProperty(t,s){const n=nt(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&_n(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!os(s)||!nf.has(s))&&as(t,"has",s),n}ownKeys(t){return as(t,"iterate",Ce(t)?"length":ma),Reflect.ownKeys(t)}}class of extends af{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const pg=new lf,fg=new of,hg=new lf(!0),mg=new of(!0),Pr=e=>e,wl=e=>Reflect.getPrototypeOf(e);function vg(e,t,s){return function(...n){const a=this.__v_raw,i=Ze(a),l=qa(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=a[e](...n),d=s?Pr:t?ei:Ks;return!t&&as(i,"iterate",r?Dr:ma),qe(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function kl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function gg(e,t){const s={get(a){const i=this.__v_raw,l=Ze(i),o=Ze(a);e||(jt(a,o)&&as(l,"get",a),as(l,"get",o));const{has:r}=wl(l),c=t?Pr:e?ei:Ks;if(r.call(l,a))return c(i.get(a));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&as(Ze(a),"iterate",ma),a.size},has(a){const i=this.__v_raw,l=Ze(i),o=Ze(a);return e||(jt(a,o)&&as(l,"has",a),as(l,"has",o)),a===o?i.has(a):i.has(a)||i.has(o)},forEach(a,i){const l=this,o=l.__v_raw,r=Ze(o),c=t?Pr:e?ei:Ks;return!e&&as(r,"iterate",ma),o.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return qe(s,e?{add:kl("add"),set:kl("set"),delete:kl("delete"),clear:kl("clear")}:{add(a){const i=Ze(this),l=wl(i),o=Ze(a),r=!t&&!ws(a)&&!on(a)?o:a;return l.has.call(i,r)||jt(a,r)&&l.has.call(i,a)||jt(o,r)&&l.has.call(i,o)||(i.add(r),_n(i,"add",r,r)),this},set(a,i){!t&&!ws(i)&&!on(i)&&(i=Ze(i));const l=Ze(this),{has:o,get:r}=wl(l);let c=o.call(l,a);c||(a=Ze(a),c=o.call(l,a));const d=r.call(l,a);return l.set(a,i),c?jt(i,d)&&_n(l,"set",a,i):_n(l,"add",a,i),this},delete(a){const i=Ze(this),{has:l,get:o}=wl(i);let r=l.call(i,a);r||(a=Ze(a),r=l.call(i,a)),o&&o.call(i,a);const c=i.delete(a);return r&&_n(i,"delete",a,void 0),c},clear(){const a=Ze(this),i=a.size!==0,l=a.clear();return i&&_n(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=vg(a,e,t)}),s}function Po(e,t){const s=gg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(nt(s,a)&&a in n?s:n,a,i)}const bg={get:Po(!1,!1)},yg={get:Po(!1,!0)},xg={get:Po(!0,!1)},_g={get:Po(!0,!0)},rf=new WeakMap,cf=new WeakMap,df=new WeakMap,uf=new WeakMap;function wg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function ta(e){return on(e)?e:Mo(e,!1,pg,bg,rf)}function Tc(e){return Mo(e,!1,hg,yg,cf)}function Zl(e){return Mo(e,!0,fg,xg,df)}function kg(e){return Mo(e,!0,mg,_g,uf)}function Mo(e,t,s,n,a){if(!tt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=wg(Lv(e));if(l===0)return e;const o=new Proxy(e,l===2?n:s);return a.set(e,o),o}function En(e){return on(e)?En(e.__v_raw):!!(e&&e.__v_isReactive)}function on(e){return!!(e&&e.__v_isReadonly)}function ws(e){return!!(e&&e.__v_isShallow)}function pl(e){return e?!!e.__v_raw:!1}function Ze(e){const t=e&&e.__v_raw;return t?Ze(t):e}function pf(e){return!nt(e,"__v_skip")&&Object.isExtensible(e)&&jp(e,"__v_skip",!0),e}const Ks=e=>tt(e)?ta(e):e,ei=e=>tt(e)?Zl(e):e;function Pt(e){return e?e.__v_isRef===!0:!1}function h(e){return ff(e,!1)}function Cc(e){return ff(e,!0)}function ff(e,t){return Pt(e)?e:new Sg(e,t)}class Sg{constructor(t,s){this.dep=new No,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ze(t),this._value=s?t:Ks(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ws(t)||on(t);t=n?t:Ze(t),jt(t,s)&&(this._rawValue=t,this._value=n?t:Ks(t),this.dep.trigger())}}function Tg(e){e.dep&&e.dep.trigger()}function ln(e){return Pt(e)?e.value:e}function Cg(e){return Pe(e)?e():ln(e)}const Eg={get:(e,t,s)=>t==="__v_raw"?e:ln(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Pt(a)&&!Pt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Ec(e){return En(e)?e:new Proxy(e,Eg)}class Ag{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new No,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function hf(e){return new Ag(e)}function Rg(e){const t=Ce(e)?new Array(e.length):{};for(const s in e)t[s]=mf(e,s);return t}class Ig{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=os(s)?s:String(s),this._raw=Ze(t);let a=!0,i=t;if(!Ce(t)||os(this._key)||!Ao(this._key))do a=!pl(i)||ws(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=ln(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Pt(this._raw[this._key])){const s=this._object[this._key];if(Pt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return og(this._raw,this._key)}}class Og{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Lg(e,t,s){return Pt(e)?e:Pe(e)?new Og(e):tt(e)&&arguments.length>1?mf(e,t,s):h(e)}function mf(e,t,s){return new Ig(e,t,s)}class Ng{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new No(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Vi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&mt!==this)return Yp(this,!0),!0}get value(){const t=this.dep.track();return ef(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Dg(e,t,s=!1){let n,a;return Pe(e)?n=e:(n=e.get,a=e.set),new Ng(n,a,s)}const Pg={GET:"get",HAS:"has",ITERATE:"iterate"},Mg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Sl={},Yl=new WeakMap;let Kn;function Fg(){return Kn}function vf(e,t=!1,s=Kn){if(s){let n=Yl.get(s);n||Yl.set(s,n=[]),n.push(e)}}function $g(e,t,s=Ge){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:o,call:r}=s,c=y=>a?y:ws(y)||a===!1||a===0?wn(y,1):wn(y);let d,u,p,f,m=!1,v=!1;if(Pt(e)?(u=()=>e.value,m=ws(e)):En(e)?(u=()=>c(e),m=!0):Ce(e)?(v=!0,m=e.some(y=>En(y)||ws(y)),u=()=>e.map(y=>{if(Pt(y))return y.value;if(En(y))return c(y);if(Pe(y))return r?r(y,2):y()})):Pe(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){On();try{p()}finally{Ln()}}const y=Kn;Kn=d;try{return r?r(e,3,[f]):e(f)}finally{Kn=y}}:u=Yt,t&&a){const y=u,E=a===!0?1/0:a;u=()=>wn(y(),E)}const w=Jp(),N=()=>{d.stop(),w&&w.active&&yc(w.effects,d)};if(i&&t){const y=t;t=(...E)=>{const S=y(...E);return N(),S}}let x=v?new Array(e.length).fill(Sl):Sl;const b=y=>{if(!(!(d.flags&1)||!d.dirty&&!y))if(t){const E=d.run();if(y||a||m||(v?E.some((S,L)=>jt(S,x[L])):jt(E,x))){p&&p();const S=Kn;Kn=d;try{const L=[E,x===Sl?void 0:v&&x[0]===Sl?[]:x,f];x=E,r?r(t,3,L):t(...L)}finally{Kn=S}}}else d.run()};return o&&o(b),d=new ji(u),d.scheduler=l?()=>l(b,!1):b,f=y=>vf(y,!1,d),p=d.onStop=()=>{const y=Yl.get(d);if(y){if(r)r(y,4);else for(const E of y)E();Yl.delete(d)}},t?n?b(!0):x=d.run():l?l(b.bind(null,!0),!0):d.run(),N.pause=d.pause.bind(d),N.resume=d.resume.bind(d),N.stop=N,N}function wn(e,t=1/0,s){if(t<=0||!tt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Pt(e))wn(e.value,t,s);else if(Ce(e))for(let n=0;n<e.length;n++)wn(e[n],t,s);else if(Ta(e)||qa(e))e.forEach(n=>{wn(n,t,s)});else if(Eo(e)){for(const n in e)wn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&wn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const gf=[];function Ug(e){gf.push(e)}function Bg(){gf.pop()}function Hg(e,t){}const zg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},jg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function fi(e,t,s,n){try{return n?e(...n):e()}catch(a){Ea(a,t,s)}}function Is(e,t,s,n){if(Pe(e)){const a=fi(e,t,s,n);return a&&xc(a)&&a.catch(i=>{Ea(i,t,s)}),a}if(Ce(e)){const a=[];for(let i=0;i<e.length;i++)a.push(Is(e[i],t,s,n));return a}}function Ea(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ge;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){On(),fi(i,null,10,[e,r,c]),Ln();return}}Vg(e,s,a,n,l)}function Vg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ps=[];let sn=-1;const Wa=[];let Wn=null,$a=0;const bf=Promise.resolve();let Ql=null;function Rt(e){const t=Ql||bf;return e?t.then(this?e.bind(this):e):t}function qg(e){let t=sn+1,s=ps.length;for(;t<s;){const n=t+s>>>1,a=ps[n],i=Ki(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Ac(e){if(!(e.flags&1)){const t=Ki(e),s=ps[ps.length-1];!s||!(e.flags&2)&&t>=Ki(s)?ps.push(e):ps.splice(qg(t),0,e),e.flags|=1,yf()}}function yf(){Ql||(Ql=bf.then(xf))}function Gi(e){Ce(e)?Wa.push(...e):Wn&&e.id===-1?Wn.splice($a+1,0,e):e.flags&1||(Wa.push(e),e.flags|=1),yf()}function Fd(e,t,s=sn+1){for(;s<ps.length;s++){const n=ps[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ps.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Xl(e){if(Wa.length){const t=[...new Set(Wa)].sort((s,n)=>Ki(s)-Ki(n));if(Wa.length=0,Wn){Wn.push(...t);return}for(Wn=t,$a=0;$a<Wn.length;$a++){const s=Wn[$a];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Wn=null,$a=0}}const Ki=e=>e.id==null?e.flags&2?-1:1/0:e.id;function xf(e){try{for(sn=0;sn<ps.length;sn++){const t=ps[sn];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),fi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;sn<ps.length;sn++){const t=ps[sn];t&&(t.flags&=-2)}sn=-1,ps.length=0,Xl(),Ql=null,(ps.length||Wa.length)&&xf()}}let Ua,Tl=[];function _f(e,t){var s,n;Ua=e,Ua?(Ua.enabled=!0,Tl.forEach(({event:a,args:i})=>Ua.emit(a,...i)),Tl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{_f(i,t)}),setTimeout(()=>{Ua||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Tl=[])},3e3)):Tl=[]}let Zt=null,Fo=null;function Wi(e){const t=Zt;return Zt=e,Fo=e&&e.type.__scopeId||null,t}function Gg(e){Fo=e}function Kg(){Fo=null}const Wg=e=>Rc;function Rc(e,t=Zt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Qi(-1);const i=Wi(t);let l;try{l=e(...a)}finally{Wi(i),n._d&&Qi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Jg(e,t){if(Zt===null)return e;const s=vl(Zt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,o,r=Ge]=t[a];i&&(Pe(i)&&(i={mounted:i,updated:i}),i.deep&&wn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function nn(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const o=a[l];i&&(o.oldValue=i[l].value);let r=o.dir[n];r&&(On(),Is(r,s,8,[e.el,o,e,t]),Ln())}}function Di(e,t){if(Jt){let s=Jt.provides;const n=Jt.parent&&Jt.parent.provides;n===s&&(s=Jt.provides=Object.create(n)),s[e]=t}}function Bs(e,t,s=!1){const n=hs();if(n||va){let a=va?va._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Pe(t)?t.call(n&&n.proxy):t}}function Zg(){return!!(hs()||va)}const wf=Symbol.for("v-scx"),kf=()=>Bs(wf);function Yg(e,t){return fl(e,null,t)}function Qg(e,t){return fl(e,null,{flush:"post"})}function Sf(e,t){return fl(e,null,{flush:"sync"})}function Mt(e,t,s){return fl(e,t,s)}function fl(e,t,s=Ge){const{immediate:n,deep:a,flush:i,once:l}=s,o=qe({},s),r=t&&n||!t&&i!=="post";let c;if(_a){if(i==="sync"){const f=kf();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!r){const f=()=>{};return f.stop=Yt,f.resume=Yt,f.pause=Yt,f}}const d=Jt;o.call=(f,m,v)=>Is(f,d,m,v);let u=!1;i==="post"?o.scheduler=f=>{Nt(f,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(f,m)=>{m?f():Ac(f)}),o.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=$g(e,t,o);return _a&&(c?c.push(p):r&&p()),p}function Xg(e,t,s){const n=this.proxy,a=Ue(e)?e.includes(".")?Tf(n,e):()=>n[e]:e.bind(n,n);let i;Pe(t)?i=t:(i=t.handler,s=t);const l=hi(this),o=fl(a,i.bind(n),s);return l(),o}function Tf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const qn=new WeakMap,Cf=Symbol("_vte"),Ef=e=>e.__isTeleport,ua=e=>e&&(e.disabled||e.disabled===""),eb=e=>e&&(e.defer||e.defer===""),$d=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Ud=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Mr=(e,t)=>{const s=e&&e.to;return Ue(s)?t?t(s):null:s},tb={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:m,createText:v,createComment:w,parentNode:N}}=c,x=ua(t.props);let{dynamicChildren:b}=t;const y=(L,R,_)=>{L.shapeFlag&16&&d(L.children,R,_,a,i,l,o,r)},E=(L=t)=>{const R=ua(L.props),_=L.target=Mr(L.props,m),D=Fr(_,L,v,f);_&&(l!=="svg"&&$d(_)?l="svg":l!=="mathml"&&Ud(_)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(_),R||(y(L,_,D),Ei(L,!1)))},S=L=>{const R=()=>{if(qn.get(L)===R){if(qn.delete(L),ua(L.props)){const _=N(L.el)||s;y(L,_,L.anchor),Ei(L,!0)}E(L)}};qn.set(L,R),Nt(R,i)};if(e==null){const L=t.el=v(""),R=t.anchor=v("");if(f(L,s,n),f(R,s,n),eb(t.props)||i&&i.pendingBranch){S(t);return}x&&(y(t,s,R),Ei(t,!0)),E()}else{t.el=e.el;const L=t.anchor=e.anchor,R=qn.get(e);if(R){R.flags|=8,qn.delete(e),S(t);return}t.targetStart=e.targetStart;const _=t.target=e.target,D=t.targetAnchor=e.targetAnchor,U=ua(e.props),T=U?s:_,M=U?L:D;if(l==="svg"||$d(_)?l="svg":(l==="mathml"||Ud(_))&&(l="mathml"),b?(p(e.dynamicChildren,b,T,a,i,l,o),Bc(e,t,!0)):r||u(e,t,T,M,a,i,l,o,!1),x)U?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Cl(t,s,L,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const j=t.target=Mr(t.props,m);j&&Cl(t,j,null,c,0)}else U&&Cl(t,_,D,c,1);Ei(t,x)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!ua(p),m=qn.get(e);if(m&&(m.flags|=8,qn.delete(e)),u&&(a(c),a(d)),i&&a(r),!m&&l&16)for(let v=0;v<o.length;v++){const w=o[v];n(w,t,s,f,!!w.dynamicChildren)}},move:Cl,hydrate:sb};function Cl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!qn.has(e)&&(!u||ua(d))&&r&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(o,t,s)}function sb(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(w,N){let x=N;for(;x;){if(x&&x.nodeType===8){if(x.data==="teleport start anchor")t.targetStart=x;else if(x.data==="teleport anchor"){t.targetAnchor=x,w._lpa=t.targetAnchor&&l(t.targetAnchor);break}}x=l(x)}}function f(w,N){N.anchor=u(l(w),N,o(w),s,n,a,i)}const m=t.target=Mr(t.props,r),v=ua(t.props);if(m){const w=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(f(e,t),p(m,w),t.targetAnchor||Fr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,w),t.targetAnchor||Fr(m,t,d,c),u(w&&l(w),t,m,s,n,a,i))),Ei(t,v)}else v&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const nb=tb;function Ei(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Fr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Cf]=l,e&&(n(i,e,a),n(l,e,a)),l}const Ms=Symbol("_leaveCb"),bi=Symbol("_enterCb");function Ic(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return je(()=>{e.isMounted=!0}),Ho(()=>{e.isUnmounting=!0}),e}const Ps=[Function,Array],Oc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ps,onEnter:Ps,onAfterEnter:Ps,onEnterCancelled:Ps,onBeforeLeave:Ps,onLeave:Ps,onAfterLeave:Ps,onLeaveCancelled:Ps,onBeforeAppear:Ps,onAppear:Ps,onAfterAppear:Ps,onAppearCancelled:Ps},Af=e=>{const t=e.subTree;return t.component?Af(t.component):t},ab={name:"BaseTransition",props:Oc,setup(e,{slots:t}){const s=hs(),n=Ic();return()=>{const a=t.default&&$o(t.default(),!0),i=a&&a.length?Rf(a):s.subTree?uh():void 0;if(!i)return;const l=Ze(e),{mode:o}=l;if(n.isLeaving)return or(i);const r=Bd(i);if(!r)return or(i);let c=ti(r,l,n,s,u=>c=u);r.type!==It&&Nn(r,c);let d=s.subTree&&Bd(s.subTree);if(d&&d.type!==It&&!Vs(d,r)&&Af(s).type!==It){let u=ti(d,l,n,s);if(Nn(d,u),o==="out-in"&&r.type!==It)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},or(i);o==="in-out"&&r.type!==It?u.delayLeave=(p,f,m)=>{const v=Of(n,d);v[String(d.key)]=d,p[Ms]=()=>{f(),p[Ms]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Rf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==It){t=s;break}}return t}const If=ab;function Of(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function ti(e,t,s,n,a){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:w,onAppear:N,onAfterAppear:x,onAppearCancelled:b}=t,y=String(e.key),E=Of(s,e),S=(_,D)=>{_&&Is(_,n,9,D)},L=(_,D)=>{const U=D[1];S(_,D),Ce(_)?_.every(T=>T.length<=1)&&U():_.length<=1&&U()},R={mode:l,persisted:o,beforeEnter(_){let D=r;if(!s.isMounted)if(i)D=w||r;else return;_[Ms]&&_[Ms](!0);const U=E[y];U&&Vs(e,U)&&U.el[Ms]&&U.el[Ms](),S(D,[_])},enter(_){if(E[y]===e)return;let D=c,U=d,T=u;if(!s.isMounted)if(i)D=N||c,U=x||d,T=b||u;else return;let M=!1;_[bi]=J=>{M||(M=!0,J?S(T,[_]):S(U,[_]),R.delayedLeave&&R.delayedLeave(),_[bi]=void 0)};const j=_[bi].bind(null,!1);D?L(D,[_,j]):j()},leave(_,D){const U=String(e.key);if(_[bi]&&_[bi](!0),s.isUnmounting)return D();S(p,[_]);let T=!1;_[Ms]=j=>{T||(T=!0,D(),j?S(v,[_]):S(m,[_]),_[Ms]=void 0,E[U]===e&&delete E[U])};const M=_[Ms].bind(null,!1);E[U]=e,f?L(f,[_,M]):M()},clone(_){const D=ti(_,t,s,n,a);return a&&a(D),D}};return R}function or(e){if(ml(e))return e=rn(e),e.children=null,e}function Bd(e){if(!ml(e))return Ef(e.type)&&e.children?Rf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Pe(s.default))return s.default()}}function Nn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Nn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function $o(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Vt?(l.patchFlag&128&&a++,n=n.concat($o(l.children,t,o))):(t||l.type!==It)&&n.push(o!=null?rn(l,{key:o}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function hl(e,t){return Pe(e)?qe({name:e.name},t,{setup:e}):e}function ib(){const e=hs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Lc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function lb(e){const t=hs(),s=Cc(null);if(t){const a=t.refs===Ge?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Hd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const eo=new WeakMap;function Ja(e,t,s,n,a=!1){if(Ce(e)){e.forEach((v,w)=>Ja(v,t&&(Ce(t)?t[w]:t),s,n,a));return}if(An(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ja(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?vl(n.component):n.el,l=a?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ge?o.refs={}:o.refs,u=o.setupState,p=Ze(u),f=u===Ge?za:v=>Hd(d,v)?!1:nt(p,v),m=(v,w)=>!(w&&Hd(d,w));if(c!=null&&c!==r){if(zd(t),Ue(c))d[c]=null,f(c)&&(u[c]=null);else if(Pt(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Pe(r))fi(r,o,12,[l,d]);else{const v=Ue(r),w=Pt(r);if(v||w){const N=()=>{if(e.f){const x=v?f(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(a)Ce(x)&&yc(x,i);else if(Ce(x))x.includes(i)||x.push(i);else if(v)d[r]=[i],f(r)&&(u[r]=d[r]);else{const b=[i];m(r,e.k)&&(r.value=b),e.k&&(d[e.k]=b)}}else v?(d[r]=l,f(r)&&(u[r]=l)):w&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const x=()=>{N(),eo.delete(e)};x.id=-1,eo.set(e,x),Nt(x,s)}else zd(e),N()}}}function zd(e){const t=eo.get(e);t&&(t.flags|=8,eo.delete(e))}let jd=!1;const Na=()=>{jd||(console.error("Hydration completed but contains mismatches."),jd=!0)},ob=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",rb=e=>e.namespaceURI.includes("MathML"),El=e=>{if(e.nodeType===1){if(ob(e))return"svg";if(rb(e))return"mathml"}},ja=e=>e.nodeType===8;function cb(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(b,y)=>{if(!y.hasChildNodes()){s(null,b,y),Xl(),y._vnode=b;return}u(y.firstChild,b,null,null,null),Xl(),y._vnode=b},u=(b,y,E,S,L,R=!1)=>{R=R||!!y.dynamicChildren;const _=ja(b)&&b.data==="[",D=()=>v(b,y,E,S,L,_),{type:U,ref:T,shapeFlag:M,patchFlag:j}=y;let J=b.nodeType;y.el=b,j===-2&&(R=!1,y.dynamicChildren=null);let A=null;switch(U){case Qn:J!==3?y.children===""?(r(y.el=a(""),l(b),b),A=b):A=D():(b.data!==y.children&&(Na(),b.data=y.children),A=i(b));break;case It:x(b)?(A=i(b),N(y.el=b.content.firstChild,b,E)):J!==8||_?A=D():A=i(b);break;case ga:if(_&&(b=i(b),J=b.nodeType),J===1||J===3){A=b;const k=!y.children.length;for(let C=0;C<y.staticCount;C++)k&&(y.children+=A.nodeType===1?A.outerHTML:A.data),C===y.staticCount-1&&(y.anchor=A),A=i(A);return _?i(A):A}else D();break;case Vt:_?A=m(b,y,E,S,L,R):A=D();break;default:if(M&1)(J!==1||y.type.toLowerCase()!==b.tagName.toLowerCase())&&!x(b)?A=D():A=p(b,y,E,S,L,R);else if(M&6){y.slotScopeIds=L;const k=l(b);if(_?A=w(b):ja(b)&&b.data==="teleport start"?A=w(b,b.data,"teleport end"):A=i(b),t(y,k,null,E,S,El(k),R),An(y)&&!y.type.__asyncResolved){let C;_?(C=xt(Vt),C.anchor=A?A.previousSibling:k.lastChild):C=b.nodeType===3?zc(""):xt("div"),C.el=b,y.component.subTree=C}}else M&64?J!==8?A=D():A=y.type.hydrate(b,y,E,S,L,R,e,f):M&128&&(A=y.type.hydrate(b,y,E,S,El(l(b)),L,R,e,u))}return T!=null&&Ja(T,null,S,y),A},p=(b,y,E,S,L,R)=>{R=R||!!y.dynamicChildren;const{type:_,props:D,patchFlag:U,shapeFlag:T,dirs:M,transition:j}=y,J=_==="input"||_==="option";if(J||U!==-1){M&&nn(y,null,E,"created");let A=!1;if(x(b)){A=sh(null,j)&&E&&E.vnode.props&&E.vnode.props.appear;const C=b.content.firstChild;if(A){const $=C.getAttribute("class");$&&(C.$cls=$),j.beforeEnter(C)}N(C,b,E),y.el=b=C}if(T&16&&!(D&&(D.innerHTML||D.textContent))){let C=f(b.firstChild,y,b,E,S,L,R);for(C&&!Al(b,1)&&Na();C;){const $=C;C=C.nextSibling,o($)}}else if(T&8){let C=y.children;C[0]===`
`&&(b.tagName==="PRE"||b.tagName==="TEXTAREA")&&(C=C.slice(1));const{textContent:$}=b;$!==C&&$!==C.replace(/\r\n|\r/g,`
`)&&(Al(b,0)||Na(),b.textContent=y.children)}if(D){if(J||!R||U&48){const C=b.tagName.includes("-");for(const $ in D)(J&&($.endsWith("value")||$==="indeterminate")||Sa($)&&!Cn($)||$[0]==="."||C&&!Cn($))&&n(b,$,null,D[$],void 0,E)}else if(D.onClick)n(b,"onClick",null,D.onClick,void 0,E);else if(U&4&&En(D.style))for(const C in D.style)D.style[C]}let k;(k=D&&D.onVnodeBeforeMount)&&gs(k,E,y),M&&nn(y,null,E,"beforeMount"),((k=D&&D.onVnodeMounted)||M||A)&&lh(()=>{k&&gs(k,E,y),A&&j.enter(b),M&&nn(y,null,E,"mounted")},S)}return b.nextSibling},f=(b,y,E,S,L,R,_)=>{_=_||!!y.dynamicChildren;const D=y.children,U=D.length;let T=!1;for(let M=0;M<U;M++){const j=_?D[M]:D[M]=ys(D[M]),J=j.type===Qn;b?(J&&!_&&M+1<U&&ys(D[M+1]).type===Qn&&(r(a(b.data.slice(j.children.length)),E,i(b)),b.data=j.children),b=u(b,j,S,L,R,_)):J&&!j.children?r(j.el=a(""),E):(T||(T=!0,Al(E,1)||Na()),s(null,j,E,null,S,L,El(E),R))}return b},m=(b,y,E,S,L,R)=>{const{slotScopeIds:_}=y;_&&(L=L?L.concat(_):_);const D=l(b),U=f(i(b),y,D,E,S,L,R);return U&&ja(U)&&U.data==="]"?i(y.anchor=U):(Na(),r(y.anchor=c("]"),D,U),U)},v=(b,y,E,S,L,R)=>{if(Al(b.parentElement,1)||Na(),y.el=null,R){const U=w(b);for(;;){const T=i(b);if(T&&T!==U)o(T);else break}}const _=i(b),D=l(b);return o(b),s(null,y,D,_,E,S,El(D),L),E&&(E.vnode.el=y.el,jo(E,y.el)),_},w=(b,y="[",E="]")=>{let S=0;for(;b;)if(b=i(b),b&&ja(b)&&(b.data===y&&S++,b.data===E)){if(S===0)return i(b);S--}return b},N=(b,y,E)=>{const S=y.parentNode;S&&S.replaceChild(b,y);let L=E;for(;L;)L.vnode.el===y&&(L.vnode.el=L.subTree.el=b),L=L.parent},x=b=>b.nodeType===1&&b.tagName==="TEMPLATE";return[d,u]}const Vd="data-allow-mismatch",db={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Al(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Vd);)e=e.parentElement;const s=e&&e.getAttribute(Vd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(db[t])}}const ub=Oo().requestIdleCallback||(e=>setTimeout(e,1)),pb=Oo().cancelIdleCallback||(e=>clearTimeout(e)),fb=(e=1e4)=>t=>{const s=ub(t,{timeout:e});return()=>pb(s)};function hb(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const mb=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(hb(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},vb=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},gb=(e=[])=>(t,s)=>{Ue(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,a)})};return s(l=>{for(const o of e)l.addEventListener(o,a,{once:!0})}),i};function bb(e,t){if(ja(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(ja(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const An=e=>!!e.type.__asyncLoader;function yb(e){Pe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((w,N)=>{r(v,()=>w(p()),()=>N(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return hl({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(m,v,w){let N=!1;(v.bu||(v.bu=[])).push(()=>N=!0);const x=()=>{N||w()},b=i?()=>{const y=i(x,E=>bb(m,E));y&&(v.bum||(v.bum=[])).push(y)}:x;d?b():f().then(()=>!v.isUnmounted&&b())},get __asyncResolved(){return d},setup(){const m=Jt;if(Lc(m),d)return()=>Rl(d,m);const v=E=>{c=null,Ea(E,m,13,!n)};if(o&&m.suspense||_a)return f().then(E=>()=>Rl(E,m)).catch(E=>(v(E),()=>n?xt(n,{error:E}):null));const w=h(!1),N=h(),x=h(!!a);let b,y;return ft(()=>{b!=null&&clearTimeout(b),y!=null&&clearTimeout(y)}),a&&(y=setTimeout(()=>{m.isUnmounted||(x.value=!1)},a)),l!=null&&(b=setTimeout(()=>{if(!m.isUnmounted&&!w.value&&!N.value){const E=new Error(`Async component timed out after ${l}ms.`);v(E),N.value=E}},l)),f().then(()=>{m.isUnmounted||(w.value=!0,m.parent&&ml(m.parent.vnode)&&m.parent.update())}).catch(E=>{if(m.isUnmounted){c=null;return}v(E),N.value=E}),()=>{if(w.value&&d)return Rl(d,m);if(N.value&&n)return xt(n,{error:N.value});if(s&&!x.value)return Rl(s,m)}}})}function Rl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=xt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const ml=e=>e.type.__isKeepAlive,xb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=hs(),n=s.ctx;if(!n.renderer)return()=>{const x=t.default&&t.default();return x&&x.length===1?x[0]:x};const a=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(x,b,y,E,S)=>{const L=x.component;c(x,b,y,0,o),r(L.vnode,x,b,y,L,o,E,x.slotScopeIds,S),Nt(()=>{L.isDeactivated=!1,L.a&&Ka(L.a);const R=x.props&&x.props.onVnodeMounted;R&&gs(R,L.parent,x)},o)},n.deactivate=x=>{const b=x.component;so(b.m),so(b.a),c(x,p,null,1,o),Nt(()=>{b.da&&Ka(b.da);const y=x.props&&x.props.onVnodeUnmounted;y&&gs(y,b.parent,x),b.isDeactivated=!0},o)};function f(x){rr(x),d(x,s,o,!0)}function m(x){a.forEach((b,y)=>{const E=Gr(An(b)?b.type.__asyncResolved||{}:b.type);E&&!x(E)&&v(y)})}function v(x){const b=a.get(x);b&&(!l||!Vs(b,l))?f(b):l&&rr(l),a.delete(x),i.delete(x)}Mt(()=>[e.include,e.exclude],([x,b])=>{x&&m(y=>Ai(x,y)),b&&m(y=>!Ai(b,y))},{flush:"post",deep:!0});let w=null;const N=()=>{w!=null&&(no(s.subTree.type)?Nt(()=>{a.set(w,Il(s.subTree))},s.subTree.suspense):a.set(w,Il(s.subTree)))};return je(N),Bo(N),Ho(()=>{a.forEach(x=>{const{subTree:b,suspense:y}=s,E=Il(b);if(x.type===E.type&&x.key===E.key){rr(E);const S=E.component.da;S&&Nt(S,y);return}f(x)})}),()=>{if(w=null,!t.default)return l=null;const x=t.default(),b=x[0];if(x.length>1)return l=null,x;if(!Dn(b)||!(b.shapeFlag&4)&&!(b.shapeFlag&128))return l=null,b;let y=Il(b);if(y.type===It)return l=null,y;const E=y.type,S=Gr(An(y)?y.type.__asyncResolved||{}:E),{include:L,exclude:R,max:_}=e;if(L&&(!S||!Ai(L,S))||R&&S&&Ai(R,S))return y.shapeFlag&=-257,l=y,b;const D=y.key==null?E:y.key,U=a.get(D);return y.el&&(y=rn(y),b.shapeFlag&128&&(b.ssContent=y)),w=D,U?(y.el=U.el,y.component=U.component,y.transition&&Nn(y,y.transition),y.shapeFlag|=512,i.delete(D),i.add(D)):(i.add(D),_&&i.size>parseInt(_,10)&&v(i.values().next().value)),y.shapeFlag|=256,l=y,no(b.type)?b:y}}},_b=xb;function Ai(e,t){return Ce(e)?e.some(s=>Ai(s,t)):Ue(e)?e.split(",").includes(t):Ov(e)?(e.lastIndex=0,e.test(t)):!1}function Qt(e,t){Lf(e,"a",t)}function Gt(e,t){Lf(e,"da",t)}function Lf(e,t,s=Jt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Uo(t,n,s),s){let a=s.parent;for(;a&&a.parent;)ml(a.parent.vnode)&&wb(n,t,s,a),a=a.parent}}function wb(e,t,s,n){const a=Uo(t,e,n,!0);ft(()=>{yc(n[t],a)},s)}function rr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Il(e){return e.shapeFlag&128?e.ssContent:e}function Uo(e,t,s=Jt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{On();const o=hi(s),r=Is(t,s,e,l);return o(),Ln(),r});return n?a.unshift(i):a.push(i),i}}const Pn=e=>(t,s=Jt)=>{(!_a||e==="sp")&&Uo(e,(...n)=>t(...n),s)},Nf=Pn("bm"),je=Pn("m"),Nc=Pn("bu"),Bo=Pn("u"),Ho=Pn("bum"),ft=Pn("um"),Df=Pn("sp"),Pf=Pn("rtg"),Mf=Pn("rtc");function Ff(e,t=Jt){Uo("ec",e,t)}const Dc="components",kb="directives";function Sb(e,t){return Pc(Dc,e,!0,t)||e}const $f=Symbol.for("v-ndc");function Tb(e){return Ue(e)?Pc(Dc,e,!1)||e:e||$f}function Cb(e){return Pc(kb,e)}function Pc(e,t,s=!0,n=!1){const a=Zt||Jt;if(a){const i=a.type;if(e===Dc){const o=Gr(i,!1);if(o&&(o===t||o===pt(t)||o===Ca(pt(t))))return i}const l=qd(a[e]||i[e],t)||qd(a.appContext[e],t);return!l&&n?i:l}}function qd(e,t){return e&&(e[t]||e[pt(t)]||e[Ca(pt(t))])}function Eb(e,t,s,n){let a;const i=s&&s[n],l=Ce(e);if(l||Ue(e)){const o=l&&En(e);let r=!1,c=!1;o&&(r=!ws(e),c=on(e),e=Do(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(r?c?ei(Ks(e[d])):Ks(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let o=0;o<e;o++)a[o]=t(o+1,o,void 0,i&&i[o])}else if(tt(e))if(e[Symbol.iterator])a=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);a=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];a[r]=t(e[d],d,r,i&&i[r])}}else a=[];return s&&(s[n]=a),a}function Ab(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ce(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Rb(e,t,s={},n,a){if(Zt.ce||Zt.parent&&An(Zt.parent)&&Zt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Yi(),ao(Vt,null,[xt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Yi();const l=i&&Mc(i(s)),o=s.key||l&&l.key,r=ao(Vt,{key:(o&&!os(o)?o:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Mc(e){return e.some(t=>Dn(t)?!(t.type===It||t.type===Vt&&!Mc(t.children)):!0)?e:null}function Ib(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Ga(n)]=e[n];return s}const $r=e=>e?hh(e)?vl(e):$r(e.parent):null,Pi=qe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>$r(e.parent),$root:e=>$r(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Fc(e),$forceUpdate:e=>e.f||(e.f=()=>{Ac(e.update)}),$nextTick:e=>e.n||(e.n=Rt.bind(e.proxy)),$watch:e=>Xg.bind(e)}),cr=(e,t)=>e!==Ge&&!e.__isScriptSetup&&nt(e,t),Ur={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(cr(n,t))return l[t]=1,n[t];if(a!==Ge&&nt(a,t))return l[t]=2,a[t];if(nt(i,t))return l[t]=3,i[t];if(s!==Ge&&nt(s,t))return l[t]=4,s[t];Br&&(l[t]=0)}}const c=Pi[t];let d,u;if(c)return t==="$attrs"&&as(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ge&&nt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,nt(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return cr(a,t)?(a[t]=s,!0):n!==Ge&&nt(n,t)?(n[t]=s,!0):nt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},o){let r;return!!(s[o]||e!==Ge&&o[0]!=="$"&&nt(e,o)||cr(t,o)||nt(i,o)||nt(n,o)||nt(Pi,o)||nt(a.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:nt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Ob=qe({},Ur,{get(e,t){if(t!==Symbol.unscopables)return Ur.get(e,t,e)},has(e,t){return t[0]!=="_"&&!$v(t)}});function Lb(){return null}function Nb(){return null}function Db(e){}function Pb(e){}function Mb(){return null}function Fb(){}function $b(e,t){return null}function Ub(){return Uf().slots}function Bb(){return Uf().attrs}function Uf(e){const t=hs();return t.setupContext||(t.setupContext=bh(t))}function Ji(e){return Ce(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Hb(e,t){const s=Ji(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ce(a)||Pe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function zb(e,t){return!e||!t?e||t:Ce(e)&&Ce(t)?e.concat(t):qe({},Ji(e),Ji(t))}function jb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Vb(e){const t=hs(),s=_a;let n=e();Xi(),s&&Ya(!1);const a=()=>{hi(t),s&&Ya(!0)},i=()=>{hs()!==t&&t.scope.off(),Xi(),s&&Ya(!1)};return xc(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Br=!0;function qb(e){const t=Fc(e),s=e.proxy,n=e.ctx;Br=!1,t.beforeCreate&&Gd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:m,activated:v,deactivated:w,beforeDestroy:N,beforeUnmount:x,destroyed:b,unmounted:y,render:E,renderTracked:S,renderTriggered:L,errorCaptured:R,serverPrefetch:_,expose:D,inheritAttrs:U,components:T,directives:M,filters:j}=t;if(c&&Gb(c,n,null),l)for(const k in l){const C=l[k];Pe(C)&&(n[k]=C.bind(s))}if(a){const k=a.call(s,s);tt(k)&&(e.data=ta(k))}if(Br=!0,i)for(const k in i){const C=i[k],$=Pe(C)?C.bind(s,s):Pe(C.get)?C.get.bind(s,s):Yt,W=!Pe(C)&&Pe(C.set)?C.set.bind(s):Yt,G=q({get:$,set:W});Object.defineProperty(n,k,{enumerable:!0,configurable:!0,get:()=>G.value,set:Z=>G.value=Z})}if(o)for(const k in o)Bf(o[k],n,s,k);if(r){const k=Pe(r)?r.call(s):r;Reflect.ownKeys(k).forEach(C=>{Di(C,k[C])})}d&&Gd(d,e,"c");function A(k,C){Ce(C)?C.forEach($=>k($.bind(s))):C&&k(C.bind(s))}if(A(Nf,u),A(je,p),A(Nc,f),A(Bo,m),A(Qt,v),A(Gt,w),A(Ff,R),A(Mf,S),A(Pf,L),A(Ho,x),A(ft,y),A(Df,_),Ce(D))if(D.length){const k=e.exposed||(e.exposed={});D.forEach(C=>{Object.defineProperty(k,C,{get:()=>s[C],set:$=>s[C]=$,enumerable:!0})})}else e.exposed||(e.exposed={});E&&e.render===Yt&&(e.render=E),U!=null&&(e.inheritAttrs=U),T&&(e.components=T),M&&(e.directives=M),_&&Lc(e)}function Gb(e,t,s=Yt){Ce(e)&&(e=Hr(e));for(const n in e){const a=e[n];let i;tt(a)?"default"in a?i=Bs(a.from||n,a.default,!0):i=Bs(a.from||n):i=Bs(a),Pt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Gd(e,t,s){Is(Ce(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Bf(e,t,s,n){let a=n.includes(".")?Tf(s,n):()=>s[n];if(Ue(e)){const i=t[e];Pe(i)&&Mt(a,i)}else if(Pe(e))Mt(a,e.bind(s));else if(tt(e))if(Ce(e))e.forEach(i=>Bf(i,t,s,n));else{const i=Pe(e.handler)?e.handler.bind(s):t[e.handler];Pe(i)&&Mt(a,i,e)}}function Fc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!a.length&&!s&&!n?r=t:(r={},a.length&&a.forEach(c=>to(r,c,l,!0)),to(r,t,l)),tt(t)&&i.set(t,r),r}function to(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&to(e,i,s,!0),a&&a.forEach(l=>to(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const o=Kb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Kb={data:Kd,props:Wd,emits:Wd,methods:Ri,computed:Ri,beforeCreate:cs,created:cs,beforeMount:cs,mounted:cs,beforeUpdate:cs,updated:cs,beforeDestroy:cs,beforeUnmount:cs,destroyed:cs,unmounted:cs,activated:cs,deactivated:cs,errorCaptured:cs,serverPrefetch:cs,components:Ri,directives:Ri,watch:Jb,provide:Kd,inject:Wb};function Kd(e,t){return t?e?function(){return qe(Pe(e)?e.call(this,this):e,Pe(t)?t.call(this,this):t)}:t:e}function Wb(e,t){return Ri(Hr(e),Hr(t))}function Hr(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function cs(e,t){return e?[...new Set([].concat(e,t))]:t}function Ri(e,t){return e?qe(Object.create(null),e,t):t}function Wd(e,t){return e?Ce(e)&&Ce(t)?[...new Set([...e,...t])]:qe(Object.create(null),Ji(e),Ji(t??{})):t}function Jb(e,t){if(!e)return t;if(!t)return e;const s=qe(Object.create(null),e);for(const n in t)s[n]=cs(e[n],t[n]);return s}function Hf(){return{app:null,config:{isNativeTag:za,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Zb=0;function Yb(e,t){return function(n,a=null){Pe(n)||(n=qe({},n)),a!=null&&!tt(a)&&(a=null);const i=Hf(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:Zb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:xh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Pe(d.install)?(l.add(d),d.install(c,...u)):Pe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const f=c._ceVNode||xt(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),r=!0,c._container=d,d.__vue_app__=c,vl(f.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Is(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=va;va=c;try{return d()}finally{va=u}}};return c}}let va=null;function Qb(e,t,s=Ge){const n=hs(),a=pt(t),i=xs(t),l=zf(e,a),o=hf((r,c)=>{let d,u=Ge,p;return Sf(()=>{const f=e[a];jt(d,f)&&(d=f,c())}),{get(){return r(),s.get?s.get(d):d},set(f){const m=s.set?s.set(f):f;if(!jt(m,d)&&!(u!==Ge&&jt(f,u)))return;const v=n.vnode.props,w=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));w||(d=f,c()),n.emit(`update:${t}`,m),jt(f,u)&&(jt(f,m)&&!jt(m,p)||w&&u!==Ge&&!jt(m,d))&&c(),u=f,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ge:o,done:!1}:{done:!0}}}},o}const zf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${pt(t)}Modifiers`]||e[`${xs(t)}Modifiers`];function Xb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ge;let a=s;const i=t.startsWith("update:"),l=i&&zf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Ue(d)?d.trim():d)),l.number&&(a=s.map(Io)));let o,r=n[o=Ga(t)]||n[o=Ga(pt(t))];!r&&i&&(r=n[o=Ga(xs(t))]),r&&Is(r,e,6,a);const c=n[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Is(c,e,6,a)}}const ey=new WeakMap;function jf(e,t,s=!1){const n=s?ey:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},o=!1;if(!Pe(e)){const r=c=>{const d=jf(c,t,!0);d&&(o=!0,qe(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(tt(e)&&n.set(e,null),null):(Ce(i)?i.forEach(r=>l[r]=null):qe(l,i),tt(e)&&n.set(e,l),l)}function zo(e,t){return!e||!Sa(t)?!1:(t=t.slice(2).replace(/Once$/,""),nt(e,t[0].toLowerCase()+t.slice(1))||nt(e,xs(t))||nt(e,t))}function Hl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:m,inheritAttrs:v}=e,w=Wi(e);let N,x;try{if(s.shapeFlag&4){const y=a||n,E=y;N=ys(c.call(E,y,d,u,f,p,m)),x=o}else{const y=t;N=ys(y.length>1?y(u,{attrs:o,slots:l,emit:r}):y(u,null)),x=t.props?o:sy(o)}}catch(y){Mi.length=0,Ea(y,e,1),N=xt(It)}let b=N;if(x&&v!==!1){const y=Object.keys(x),{shapeFlag:E}=b;y.length&&E&7&&(i&&y.some(Co)&&(x=ny(x,i)),b=rn(b,x,!1,!0))}return s.dirs&&(b=rn(b,null,!1,!0),b.dirs=b.dirs?b.dirs.concat(s.dirs):s.dirs),s.transition&&Nn(b,s.transition),N=b,Wi(w),N}function ty(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Dn(a)){if(a.type!==It||a.children==="v-if"){if(s)return;s=a}}else return}return s}const sy=e=>{let t;for(const s in e)(s==="class"||s==="style"||Sa(s))&&((t||(t={}))[s]=e[s]);return t},ny=(e,t)=>{const s={};for(const n in e)(!Co(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function ay(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return n?Jd(n,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Vf(l,n,p)&&!zo(c,p))return!0}}}else return(a||o)&&(!o||!o.$stable)?!0:n===l?!1:n?l?Jd(n,l,c):!0:!!l;return!1}function Jd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Vf(t,e,i)&&!zo(s,i))return!0}return!1}function Vf(e,t,s){const n=e[s],a=t[s];return s==="style"&&tt(n)&&tt(a)?!In(n,a):n!==a}function jo({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const qf={},Gf=()=>Object.create(qf),Kf=e=>Object.getPrototypeOf(e)===qf;function iy(e,t,s,n=!1){const a={},i=Gf();e.propsDefaults=Object.create(null),Wf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Tc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function ly(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,o=Ze(a),[r]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(zo(e.emitsOptions,p))continue;const f=t[p];if(r)if(nt(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const m=pt(p);a[m]=zr(r,o,m,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{Wf(e,t,a,i)&&(c=!0);let d;for(const u in o)(!t||!nt(t,u)&&((d=xs(u))===u||!nt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=zr(r,o,u,void 0,e,!0)):delete a[u]);if(i!==o)for(const u in i)(!t||!nt(t,u))&&(delete i[u],c=!0)}c&&_n(e.attrs,"set","")}function Wf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Cn(r))continue;const c=t[r];let d;a&&nt(a,d=pt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:zo(e.emitsOptions,r)||(!(r in n)||c!==n[r])&&(n[r]=c,l=!0)}if(i){const r=Ze(s),c=o||Ge;for(let d=0;d<i.length;d++){const u=i[d];s[u]=zr(a,r,u,c[u],e,!nt(c,u))}}return l}function zr(e,t,s,n,a,i){const l=e[s];if(l!=null){const o=nt(l,"default");if(o&&n===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Pe(r)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=hi(a);n=c[s]=r.call(null,t),d()}}else n=r;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!o?n=!1:l[1]&&(n===""||n===xs(s))&&(n=!0))}return n}const oy=new WeakMap;function Jf(e,t,s=!1){const n=s?oy:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},o=[];let r=!1;if(!Pe(e)){const d=u=>{r=!0;const[p,f]=Jf(u,t,!0);qe(l,p),f&&o.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return tt(e)&&n.set(e,Va),Va;if(Ce(i))for(let d=0;d<i.length;d++){const u=pt(i[d]);Zd(u)&&(l[u]=Ge)}else if(i)for(const d in i){const u=pt(d);if(Zd(u)){const p=i[d],f=l[u]=Ce(p)||Pe(p)?{type:p}:qe({},p),m=f.type;let v=!1,w=!0;if(Ce(m))for(let N=0;N<m.length;++N){const x=m[N],b=Pe(x)&&x.name;if(b==="Boolean"){v=!0;break}else b==="String"&&(w=!1)}else v=Pe(m)&&m.name==="Boolean";f[0]=v,f[1]=w,(v||nt(f,"default"))&&o.push(u)}}const c=[l,o];return tt(e)&&n.set(e,c),c}function Zd(e){return e[0]!=="$"&&!Cn(e)}const $c=e=>e==="_"||e==="_ctx"||e==="$stable",Uc=e=>Ce(e)?e.map(ys):[ys(e)],ry=(e,t,s)=>{if(t._n)return t;const n=Rc((...a)=>Uc(t(...a)),s);return n._c=!1,n},Zf=(e,t,s)=>{const n=e._ctx;for(const a in e){if($c(a))continue;const i=e[a];if(Pe(i))t[a]=ry(a,i,n);else if(i!=null){const l=Uc(i);t[a]=()=>l}}},Yf=(e,t)=>{const s=Uc(t);e.slots.default=()=>s},Qf=(e,t,s)=>{for(const n in t)(s||!$c(n))&&(e[n]=t[n])},cy=(e,t,s)=>{const n=e.slots=Gf();if(e.vnode.shapeFlag&32){const a=t._;a?(Qf(n,t,s),s&&jp(n,"_",a,!0)):Zf(t,n)}else t&&Yf(e,t)},dy=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ge;if(n.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:Qf(a,t,s):(i=!t.$stable,Zf(t,a)),l=t}else t&&(Yf(e,t),l={default:1});if(i)for(const o in a)!$c(o)&&l[o]==null&&delete a[o]},Nt=lh;function Xf(e){return th(e)}function eh(e){return th(e,cb)}function th(e,t){const s=Oo();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=Yt,insertStaticContent:m}=e,v=(g,I,F,ee=null,X=null,ae=null,fe=void 0,pe=null,de=!!I.dynamicChildren)=>{if(g===I)return;g&&!Vs(g,I)&&(ee=Y(g),Z(g,X,ae,!0),g=null),I.patchFlag===-2&&(de=!1,I.dynamicChildren=null);const{type:le,ref:xe,shapeFlag:me}=I;switch(le){case Qn:w(g,I,F,ee);break;case It:N(g,I,F,ee);break;case ga:g==null&&x(I,F,ee,fe);break;case Vt:T(g,I,F,ee,X,ae,fe,pe,de);break;default:me&1?E(g,I,F,ee,X,ae,fe,pe,de):me&6?M(g,I,F,ee,X,ae,fe,pe,de):(me&64||me&128)&&le.process(g,I,F,ee,X,ae,fe,pe,de,re)}xe!=null&&X?Ja(xe,g&&g.ref,ae,I||g,!I):xe==null&&g&&g.ref!=null&&Ja(g.ref,null,ae,g,!0)},w=(g,I,F,ee)=>{if(g==null)n(I.el=o(I.children),F,ee);else{const X=I.el=g.el;I.children!==g.children&&c(X,I.children)}},N=(g,I,F,ee)=>{g==null?n(I.el=r(I.children||""),F,ee):I.el=g.el},x=(g,I,F,ee)=>{[g.el,g.anchor]=m(g.children,I,F,ee,g.el,g.anchor)},b=({el:g,anchor:I},F,ee)=>{let X;for(;g&&g!==I;)X=p(g),n(g,F,ee),g=X;n(I,F,ee)},y=({el:g,anchor:I})=>{let F;for(;g&&g!==I;)F=p(g),a(g),g=F;a(I)},E=(g,I,F,ee,X,ae,fe,pe,de)=>{if(I.type==="svg"?fe="svg":I.type==="math"&&(fe="mathml"),g==null)S(I,F,ee,X,ae,fe,pe,de);else{const le=g.el&&g.el._isVueCE?g.el:null;try{le&&le._beginPatch(),_(g,I,X,ae,fe,pe,de)}finally{le&&le._endPatch()}}},S=(g,I,F,ee,X,ae,fe,pe)=>{let de,le;const{props:xe,shapeFlag:me,transition:_e,dirs:Re}=g;if(de=g.el=l(g.type,ae,xe&&xe.is,xe),me&8?d(de,g.children):me&16&&R(g.children,de,null,ee,X,dr(g,ae),fe,pe),Re&&nn(g,null,ee,"created"),L(de,g,g.scopeId,fe,ee),xe){for(const ve in xe)ve!=="value"&&!Cn(ve)&&i(de,ve,null,xe[ve],ae,ee);"value"in xe&&i(de,"value",null,xe.value,ae),(le=xe.onVnodeBeforeMount)&&gs(le,ee,g)}Re&&nn(g,null,ee,"beforeMount");const B=sh(X,_e);B&&_e.beforeEnter(de),n(de,I,F),((le=xe&&xe.onVnodeMounted)||B||Re)&&Nt(()=>{try{le&&gs(le,ee,g),B&&_e.enter(de),Re&&nn(g,null,ee,"mounted")}finally{}},X)},L=(g,I,F,ee,X)=>{if(F&&f(g,F),ee)for(let ae=0;ae<ee.length;ae++)f(g,ee[ae]);if(X){let ae=X.subTree;if(I===ae||no(ae.type)&&(ae.ssContent===I||ae.ssFallback===I)){const fe=X.vnode;L(g,fe,fe.scopeId,fe.slotScopeIds,X.parent)}}},R=(g,I,F,ee,X,ae,fe,pe,de=0)=>{for(let le=de;le<g.length;le++){const xe=g[le]=pe?yn(g[le]):ys(g[le]);v(null,xe,I,F,ee,X,ae,fe,pe)}},_=(g,I,F,ee,X,ae,fe)=>{const pe=I.el=g.el;let{patchFlag:de,dynamicChildren:le,dirs:xe}=I;de|=g.patchFlag&16;const me=g.props||Ge,_e=I.props||Ge;let Re;if(F&&la(F,!1),(Re=_e.onVnodeBeforeUpdate)&&gs(Re,F,I,g),xe&&nn(I,g,F,"beforeUpdate"),F&&la(F,!0),(me.innerHTML&&_e.innerHTML==null||me.textContent&&_e.textContent==null)&&d(pe,""),le?D(g.dynamicChildren,le,pe,F,ee,dr(I,X),ae):fe||C(g,I,pe,null,F,ee,dr(I,X),ae,!1),de>0){if(de&16)U(pe,me,_e,F,X);else if(de&2&&me.class!==_e.class&&i(pe,"class",null,_e.class,X),de&4&&i(pe,"style",me.style,_e.style,X),de&8){const B=I.dynamicProps;for(let ve=0;ve<B.length;ve++){const ke=B[ve],Oe=me[ke],Me=_e[ke];(Me!==Oe||ke==="value")&&i(pe,ke,Oe,Me,X,F)}}de&1&&g.children!==I.children&&d(pe,I.children)}else!fe&&le==null&&U(pe,me,_e,F,X);((Re=_e.onVnodeUpdated)||xe)&&Nt(()=>{Re&&gs(Re,F,I,g),xe&&nn(I,g,F,"updated")},ee)},D=(g,I,F,ee,X,ae,fe)=>{for(let pe=0;pe<I.length;pe++){const de=g[pe],le=I[pe],xe=de.el&&(de.type===Vt||!Vs(de,le)||de.shapeFlag&198)?u(de.el):F;v(de,le,xe,null,ee,X,ae,fe,!0)}},U=(g,I,F,ee,X)=>{if(I!==F){if(I!==Ge)for(const ae in I)!Cn(ae)&&!(ae in F)&&i(g,ae,I[ae],null,X,ee);for(const ae in F){if(Cn(ae))continue;const fe=F[ae],pe=I[ae];fe!==pe&&ae!=="value"&&i(g,ae,pe,fe,X,ee)}"value"in F&&i(g,"value",I.value,F.value,X)}},T=(g,I,F,ee,X,ae,fe,pe,de)=>{const le=I.el=g?g.el:o(""),xe=I.anchor=g?g.anchor:o("");let{patchFlag:me,dynamicChildren:_e,slotScopeIds:Re}=I;Re&&(pe=pe?pe.concat(Re):Re),g==null?(n(le,F,ee),n(xe,F,ee),R(I.children||[],F,xe,X,ae,fe,pe,de)):me>0&&me&64&&_e&&g.dynamicChildren&&g.dynamicChildren.length===_e.length?(D(g.dynamicChildren,_e,F,X,ae,fe,pe),(I.key!=null||X&&I===X.subTree)&&Bc(g,I,!0)):C(g,I,F,xe,X,ae,fe,pe,de)},M=(g,I,F,ee,X,ae,fe,pe,de)=>{I.slotScopeIds=pe,g==null?I.shapeFlag&512?X.ctx.activate(I,F,ee,fe,de):j(I,F,ee,X,ae,fe,de):J(g,I,de)},j=(g,I,F,ee,X,ae,fe)=>{const pe=g.component=fh(g,ee,X);if(ml(g)&&(pe.ctx.renderer=re),mh(pe,!1,fe),pe.asyncDep){if(X&&X.registerDep(pe,A,fe),!g.el){const de=pe.subTree=xt(It);N(null,de,I,F),g.placeholder=de.el}}else A(pe,g,I,F,X,ae,fe)},J=(g,I,F)=>{const ee=I.component=g.component;if(ay(g,I,F))if(ee.asyncDep&&!ee.asyncResolved){k(ee,I,F);return}else ee.next=I,ee.update();else I.el=g.el,ee.vnode=I},A=(g,I,F,ee,X,ae,fe)=>{const pe=()=>{if(g.isMounted){let{next:me,bu:_e,u:Re,parent:B,vnode:ve}=g;{const st=nh(g);if(st){me&&(me.el=ve.el,k(g,me,fe)),st.asyncDep.then(()=>{Nt(()=>{g.isUnmounted||le()},X)});return}}let ke=me,Oe;la(g,!1),me?(me.el=ve.el,k(g,me,fe)):me=ve,_e&&Ka(_e),(Oe=me.props&&me.props.onVnodeBeforeUpdate)&&gs(Oe,B,me,ve),la(g,!0);const Me=Hl(g),dt=g.subTree;g.subTree=Me,v(dt,Me,u(dt.el),Y(dt),g,X,ae),me.el=Me.el,ke===null&&jo(g,Me.el),Re&&Nt(Re,X),(Oe=me.props&&me.props.onVnodeUpdated)&&Nt(()=>gs(Oe,B,me,ve),X)}else{let me;const{el:_e,props:Re}=I,{bm:B,m:ve,parent:ke,root:Oe,type:Me}=g,dt=An(I);if(la(g,!1),B&&Ka(B),!dt&&(me=Re&&Re.onVnodeBeforeMount)&&gs(me,ke,I),la(g,!0),_e&&Ie){const st=()=>{g.subTree=Hl(g),Ie(_e,g.subTree,g,X,null)};dt&&Me.__asyncHydrate?Me.__asyncHydrate(_e,g,st):st()}else{Oe.ce&&Oe.ce._hasShadowRoot()&&Oe.ce._injectChildStyle(Me,g.parent?g.parent.type:void 0);const st=g.subTree=Hl(g);v(null,st,F,ee,g,X,ae),I.el=st.el}if(ve&&Nt(ve,X),!dt&&(me=Re&&Re.onVnodeMounted)){const st=I;Nt(()=>gs(me,ke,st),X)}(I.shapeFlag&256||ke&&An(ke.vnode)&&ke.vnode.shapeFlag&256)&&g.a&&Nt(g.a,X),g.isMounted=!0,I=F=ee=null}};g.scope.on();const de=g.effect=new ji(pe);g.scope.off();const le=g.update=de.run.bind(de),xe=g.job=de.runIfDirty.bind(de);xe.i=g,xe.id=g.uid,de.scheduler=()=>Ac(xe),la(g,!0),le()},k=(g,I,F)=>{I.component=g;const ee=g.vnode.props;g.vnode=I,g.next=null,ly(g,I.props,ee,F),dy(g,I.children,F),On(),Fd(g),Ln()},C=(g,I,F,ee,X,ae,fe,pe,de=!1)=>{const le=g&&g.children,xe=g?g.shapeFlag:0,me=I.children,{patchFlag:_e,shapeFlag:Re}=I;if(_e>0){if(_e&128){W(le,me,F,ee,X,ae,fe,pe,de);return}else if(_e&256){$(le,me,F,ee,X,ae,fe,pe,de);return}}Re&8?(xe&16&&Ne(le,X,ae),me!==le&&d(F,me)):xe&16?Re&16?W(le,me,F,ee,X,ae,fe,pe,de):Ne(le,X,ae,!0):(xe&8&&d(F,""),Re&16&&R(me,F,ee,X,ae,fe,pe,de))},$=(g,I,F,ee,X,ae,fe,pe,de)=>{g=g||Va,I=I||Va;const le=g.length,xe=I.length,me=Math.min(le,xe);let _e;for(_e=0;_e<me;_e++){const Re=I[_e]=de?yn(I[_e]):ys(I[_e]);v(g[_e],Re,F,null,X,ae,fe,pe,de)}le>xe?Ne(g,X,ae,!0,!1,me):R(I,F,ee,X,ae,fe,pe,de,me)},W=(g,I,F,ee,X,ae,fe,pe,de)=>{let le=0;const xe=I.length;let me=g.length-1,_e=xe-1;for(;le<=me&&le<=_e;){const Re=g[le],B=I[le]=de?yn(I[le]):ys(I[le]);if(Vs(Re,B))v(Re,B,F,null,X,ae,fe,pe,de);else break;le++}for(;le<=me&&le<=_e;){const Re=g[me],B=I[_e]=de?yn(I[_e]):ys(I[_e]);if(Vs(Re,B))v(Re,B,F,null,X,ae,fe,pe,de);else break;me--,_e--}if(le>me){if(le<=_e){const Re=_e+1,B=Re<xe?I[Re].el:ee;for(;le<=_e;)v(null,I[le]=de?yn(I[le]):ys(I[le]),F,B,X,ae,fe,pe,de),le++}}else if(le>_e)for(;le<=me;)Z(g[le],X,ae,!0),le++;else{const Re=le,B=le,ve=new Map;for(le=B;le<=_e;le++){const rt=I[le]=de?yn(I[le]):ys(I[le]);rt.key!=null&&ve.set(rt.key,le)}let ke,Oe=0;const Me=_e-B+1;let dt=!1,st=0;const _t=new Array(Me);for(le=0;le<Me;le++)_t[le]=0;for(le=Re;le<=me;le++){const rt=g[le];if(Oe>=Me){Z(rt,X,ae,!0);continue}let Qe;if(rt.key!=null)Qe=ve.get(rt.key);else for(ke=B;ke<=_e;ke++)if(_t[ke-B]===0&&Vs(rt,I[ke])){Qe=ke;break}Qe===void 0?Z(rt,X,ae,!0):(_t[Qe-B]=le+1,Qe>=st?st=Qe:dt=!0,v(rt,I[Qe],F,null,X,ae,fe,pe,de),Oe++)}const Ot=dt?uy(_t):Va;for(ke=Ot.length-1,le=Me-1;le>=0;le--){const rt=B+le,Qe=I[rt],ie=I[rt+1],Se=rt+1<xe?ie.el||ah(ie):ee;_t[le]===0?v(null,Qe,F,Se,X,ae,fe,pe,de):dt&&(ke<0||le!==Ot[ke]?G(Qe,F,Se,2):ke--)}}},G=(g,I,F,ee,X=null)=>{const{el:ae,type:fe,transition:pe,children:de,shapeFlag:le}=g;if(le&6){G(g.component.subTree,I,F,ee);return}if(le&128){g.suspense.move(I,F,ee);return}if(le&64){fe.move(g,I,F,re);return}if(fe===Vt){n(ae,I,F);for(let me=0;me<de.length;me++)G(de[me],I,F,ee);n(g.anchor,I,F);return}if(fe===ga){b(g,I,F);return}if(ee!==2&&le&1&&pe)if(ee===0)pe.persisted&&!ae[Ms]?n(ae,I,F):(pe.beforeEnter(ae),n(ae,I,F),Nt(()=>pe.enter(ae),X));else{const{leave:me,delayLeave:_e,afterLeave:Re}=pe,B=()=>{g.ctx.isUnmounted?a(ae):n(ae,I,F)},ve=()=>{const ke=ae._isLeaving||!!ae[Ms];ae._isLeaving&&ae[Ms](!0),pe.persisted&&!ke?B():me(ae,()=>{B(),Re&&Re()})};_e?_e(ae,B,ve):ve()}else n(ae,I,F)},Z=(g,I,F,ee=!1,X=!1)=>{const{type:ae,props:fe,ref:pe,children:de,dynamicChildren:le,shapeFlag:xe,patchFlag:me,dirs:_e,cacheIndex:Re,memo:B}=g;if(me===-2&&(X=!1),pe!=null&&(On(),Ja(pe,null,F,g,!0),Ln()),Re!=null&&(I.renderCache[Re]=void 0),xe&256){I.ctx.deactivate(g);return}const ve=xe&1&&_e,ke=!An(g);let Oe;if(ke&&(Oe=fe&&fe.onVnodeBeforeUnmount)&&gs(Oe,I,g),xe&6)ce(g.component,F,ee);else{if(xe&128){g.suspense.unmount(F,ee);return}ve&&nn(g,null,I,"beforeUnmount"),xe&64?g.type.remove(g,I,F,re,ee):le&&!le.hasOnce&&(ae!==Vt||me>0&&me&64)?Ne(le,I,F,!1,!0):(ae===Vt&&me&384||!X&&xe&16)&&Ne(de,I,F),ee&&oe(g)}const Me=B!=null&&Re==null;(ke&&(Oe=fe&&fe.onVnodeUnmounted)||ve||Me)&&Nt(()=>{Oe&&gs(Oe,I,g),ve&&nn(g,null,I,"unmounted"),Me&&(g.el=null)},F)},oe=g=>{const{type:I,el:F,anchor:ee,transition:X}=g;if(I===Vt){se(F,ee);return}if(I===ga){y(g);return}const ae=()=>{a(F),X&&!X.persisted&&X.afterLeave&&X.afterLeave()};if(g.shapeFlag&1&&X&&!X.persisted){const{leave:fe,delayLeave:pe}=X,de=()=>fe(F,ae);pe?pe(g.el,ae,de):de()}else ae()},se=(g,I)=>{let F;for(;g!==I;)F=p(g),a(g),g=F;a(I)},ce=(g,I,F)=>{const{bum:ee,scope:X,job:ae,subTree:fe,um:pe,m:de,a:le}=g;so(de),so(le),ee&&Ka(ee),X.stop(),ae&&(ae.flags|=8,Z(fe,g,I,F)),pe&&Nt(pe,I),Nt(()=>{g.isUnmounted=!0},I)},Ne=(g,I,F,ee=!1,X=!1,ae=0)=>{for(let fe=ae;fe<g.length;fe++)Z(g[fe],I,F,ee,X)},Y=g=>{if(g.shapeFlag&6)return Y(g.component.subTree);if(g.shapeFlag&128)return g.suspense.next();const I=p(g.anchor||g.el),F=I&&I[Cf];return F?p(F):I};let ge=!1;const V=(g,I,F)=>{let ee;g==null?I._vnode&&(Z(I._vnode,null,null,!0),ee=I._vnode.component):v(I._vnode||null,g,I,null,null,null,F),I._vnode=g,ge||(ge=!0,Fd(ee),Xl(),ge=!1)},re={p:v,um:Z,m:G,r:oe,mt:j,mc:R,pc:C,pbc:D,n:Y,o:e};let ue,Ie;return t&&([ue,Ie]=t(re)),{render:V,hydrate:ue,createApp:Yb(V,ue)}}function dr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function la({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function sh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Bc(e,t,s=!1){const n=e.children,a=t.children;if(Ce(n)&&Ce(a))for(let i=0;i<n.length;i++){const l=n[i];let o=a[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=a[i]=yn(a[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Bc(l,o)),o.type===Qn&&(o.patchFlag===-1&&(o=a[i]=yn(o)),o.el=l.el),o.type===It&&!o.el&&(o.el=l.el)}}function uy(e){const t=e.slice(),s=[0];let n,a,i,l,o;const r=e.length;for(n=0;n<r;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function nh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:nh(t)}function so(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function ah(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?ah(t.subTree):null}const no=e=>e.__isSuspense;let jr=0;const py={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,o,r,c){if(e==null)hy(t,s,n,a,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}my(e,t,s,n,a,l,o,r,c)}},hydrate:vy,normalize:gy},fy=py;function Zi(e,t){const s=e.props&&e.props[t];Pe(s)&&s()}function hy(e,t,s,n,a,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=ih(e,a,n,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Zi(e,"onPending"),Zi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Za(p,e.ssFallback)):p.resolve(!1,!0)}function my(e,t,s,n,a,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:w,isHydrating:N}=u;if(v)u.pendingBranch=p,Vs(v,p)?(r(v,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():w&&(N||(r(m,f,s,n,a,null,i,l,o),Za(u,f)))):(u.pendingId=jr++,N?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),w?(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():(r(m,f,s,n,a,null,i,l,o),Za(u,f))):m&&Vs(m,p)?(r(m,p,s,n,a,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Vs(m,p))r(m,p,s,n,a,u,i,l,o),Za(u,p);else if(Zi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=jr++,r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:x,pendingId:b}=u;x>0?setTimeout(()=>{u.pendingId===b&&u.fallback(f)},x):x===0&&u.fallback(f)}}function ih(e,t,s,n,a,i,l,o,r,c,d=!1){const{p:u,m:p,um:f,n:m,o:{parentNode:v,remove:w}}=c;let N;const x=by(e);x&&t&&t.pendingBranch&&(N=t.pendingId,t.deps++);const b=e.props?Wl(e.props.timeout):void 0,y=i,E={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:jr++,timeout:typeof b=="number"?b:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(S=!1,L=!1){const{vnode:R,activeBranch:_,pendingBranch:D,pendingId:U,effects:T,parentComponent:M,container:j,isInFallback:J}=E;let A=!1;if(E.isHydrating)E.isHydrating=!1;else if(!S){A=_&&D.transition&&D.transition.mode==="out-in";let $=!1;A&&(_.transition.afterLeave=()=>{U===E.pendingId&&(p(D,j,i===y&&!$?m(_):i,0),Gi(T),J&&R.ssFallback&&(R.ssFallback.el=null))}),_&&!E.isFallbackMountPending&&(v(_.el)===j&&(i=m(_),$=!0),f(_,M,E,!0),!A&&J&&R.ssFallback&&Nt(()=>R.ssFallback.el=null,E)),A||p(D,j,i,0)}E.isFallbackMountPending=!1,Za(E,D),E.pendingBranch=null,E.isInFallback=!1;let k=E.parent,C=!1;for(;k;){if(k.pendingBranch){k.effects.push(...T),C=!0;break}k=k.parent}!C&&!A&&Gi(T),E.effects=[],x&&t&&t.pendingBranch&&N===t.pendingId&&(t.deps--,t.deps===0&&!L&&t.resolve()),Zi(R,"onResolve")},fallback(S){if(!E.pendingBranch)return;const{vnode:L,activeBranch:R,parentComponent:_,container:D,namespace:U}=E;Zi(L,"onFallback");const T=m(R),M=()=>{E.isFallbackMountPending=!1,E.isInFallback&&(u(null,S,D,T,_,null,U,o,r),Za(E,S))},j=S.transition&&S.transition.mode==="out-in";j&&(E.isFallbackMountPending=!0,R.transition.afterLeave=M),E.isInFallback=!0,f(R,_,null,!0),j||M()},move(S,L,R){E.activeBranch&&p(E.activeBranch,S,L,R),E.container=S},next(){return E.activeBranch&&m(E.activeBranch)},registerDep(S,L,R){const _=!!E.pendingBranch;_&&E.deps++;const D=S.vnode.el;S.asyncDep.catch(U=>{Ea(U,S,0)}).then(U=>{if(S.isUnmounted||E.isUnmounted||E.pendingId!==S.suspenseId)return;Xi(),S.asyncResolved=!0;const{vnode:T}=S;Vr(S,U,!1),D&&(T.el=D);const M=!D&&S.subTree.el;L(S,T,v(D||S.subTree.el),D?null:m(S.subTree),E,l,R),M&&(T.placeholder=null,w(M)),jo(S,T.el),_&&--E.deps===0&&E.resolve()})},unmount(S,L){E.isUnmounted=!0,E.activeBranch&&f(E.activeBranch,s,S,L),E.pendingBranch&&f(E.pendingBranch,s,S,L)}};return E}function vy(e,t,s,n,a,i,l,o,r){const c=t.suspense=ih(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function gy(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Yd(n?s.default:s),e.ssFallback=n?Yd(s.fallback):xt(It)}function Yd(e){let t;if(Pe(e)){const s=xa&&e._c;s&&(e._d=!1,Yi()),e=e(),s&&(e._d=!0,t=is,oh())}return Ce(e)&&(e=ty(e)),e=ys(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function lh(e,t){t&&t.pendingBranch?Ce(e)?t.effects.push(...e):t.effects.push(e):Gi(e)}function Za(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,jo(n,a))}function by(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Vt=Symbol.for("v-fgt"),Qn=Symbol.for("v-txt"),It=Symbol.for("v-cmt"),ga=Symbol.for("v-stc"),Mi=[];let is=null;function Yi(e=!1){Mi.push(is=e?null:[])}function oh(){Mi.pop(),is=Mi[Mi.length-1]||null}let xa=1;function Qi(e,t=!1){xa+=e,e<0&&is&&t&&(is.hasOnce=!0)}function rh(e){return e.dynamicChildren=xa>0?is||Va:null,oh(),xa>0&&is&&is.push(e),e}function yy(e,t,s,n,a,i){return rh(Hc(e,t,s,n,a,i,!0))}function ao(e,t,s,n,a){return rh(xt(e,t,s,n,a,!0))}function Dn(e){return e?e.__v_isVNode===!0:!1}function Vs(e,t){return e.type===t.type&&e.key===t.key}function xy(e){}const ch=({key:e})=>e??null,zl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ue(e)||Pt(e)||Pe(e)?{i:Zt,r:e,k:t,f:!!s}:e:null);function Hc(e,t=null,s=null,n=0,a=null,i=e===Vt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&ch(t),ref:t&&zl(t),scopeId:Fo,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Zt};return o?(jc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Ue(s)?8:16),xa>0&&!l&&is&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&is.push(r),r}const xt=_y;function _y(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===$f)&&(e=It),Dn(e)){const o=rn(e,t,!0);return s&&jc(o,s),xa>0&&!i&&is&&(o.shapeFlag&6?is[is.indexOf(e)]=o:is.push(o)),o.patchFlag=-2,o}if(Ay(e)&&(e=e.__vccOpts),t){t=dh(t);let{class:o,style:r}=t;o&&!Ue(o)&&(t.class=ul(o)),tt(r)&&(pl(r)&&!Ce(r)&&(r=qe({},r)),t.style=dl(r))}const l=Ue(e)?1:no(e)?128:Ef(e)?64:tt(e)?4:Pe(e)?2:0;return Hc(e,t,s,n,a,l,i,!0)}function dh(e){return e?pl(e)||Kf(e)?qe({},e):e:null}function rn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?ph(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&ch(c),ref:t&&t.ref?s&&i?Ce(i)?i.concat(zl(t)):[i,zl(t)]:zl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Vt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&rn(e.ssContent),ssFallback:e.ssFallback&&rn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&n&&Nn(d,r.clone(d)),d}function zc(e=" ",t=0){return xt(Qn,null,e,t)}function wy(e,t){const s=xt(ga,null,e);return s.staticCount=t,s}function uh(e="",t=!1){return t?(Yi(),ao(It,null,e)):xt(It,null,e)}function ys(e){return e==null||typeof e=="boolean"?xt(It):Ce(e)?xt(Vt,null,e.slice()):Dn(e)?yn(e):xt(Qn,null,String(e))}function yn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:rn(e)}function jc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ce(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),jc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Kf(t)?t._ctx=Zt:a===3&&Zt&&(Zt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Pe(t)?(t={default:t,_ctx:Zt},s=32):(t=String(t),n&64?(s=16,t=[zc(t)]):s=8);e.children=t,e.shapeFlag|=s}function ph(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=ul([t.class,n.class]));else if(a==="style")t.style=dl([t.style,n.style]);else if(Sa(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ce(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Co(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function gs(e,t,s,n=null){Is(e,t,7,[s,n])}const ky=Hf();let Sy=0;function fh(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||ky,i={uid:Sy++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new _c(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Jf(n,a),emitsOptions:jf(n,a),emit:null,emitted:null,propsDefaults:Ge,inheritAttrs:n.inheritAttrs,ctx:Ge,data:Ge,props:Ge,attrs:Ge,slots:Ge,refs:Ge,setupState:Ge,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Xb.bind(null,i),e.ce&&e.ce(i),i}let Jt=null;const hs=()=>Jt||Zt;let io,Ya;{const e=Oo(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};io=t("__VUE_INSTANCE_SETTERS__",s=>Jt=s),Ya=t("__VUE_SSR_SETTERS__",s=>_a=s)}const hi=e=>{const t=Jt;return io(e),e.scope.on(),()=>{e.scope.off(),io(t)}},Xi=()=>{Jt&&Jt.scope.off(),io(null)};function hh(e){return e.vnode.shapeFlag&4}let _a=!1;function mh(e,t=!1,s=!1){t&&Ya(t);const{props:n,children:a}=e.vnode,i=hh(e);iy(e,n,i,t),cy(e,a,s||t);const l=i?Ty(e,t):void 0;return t&&Ya(!1),l}function Ty(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Ur);const{setup:n}=s;if(n){On();const a=e.setupContext=n.length>1?bh(e):null,i=hi(e),l=fi(n,e,0,[e.props,a]),o=xc(l);if(Ln(),i(),(o||e.sp)&&!An(e)&&Lc(e),o){if(l.then(Xi,Xi),t)return l.then(r=>{Vr(e,r,t)}).catch(r=>{Ea(r,e,0)});e.asyncDep=l}else Vr(e,l,t)}else gh(e,t)}function Vr(e,t,s){Pe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:tt(t)&&(e.setupState=Ec(t)),gh(e,s)}let lo,qr;function vh(e){lo=e,qr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Ob))}}const Cy=()=>!lo;function gh(e,t,s){const n=e.type;if(!e.render){if(!t&&lo&&!n.render){const a=n.template||Fc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=n,c=qe(qe({isCustomElement:i,delimiters:o},l),r);n.render=lo(a,c)}}e.render=n.render||Yt,qr&&qr(e)}{const a=hi(e);On();try{qb(e)}finally{Ln(),a()}}}const Ey={get(e,t){return as(e,"get",""),e[t]}};function bh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Ey),slots:e.slots,emit:e.emit,expose:t}}function vl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Ec(pf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Pi)return Pi[s](e)},has(t,s){return s in t||s in Pi}})):e.proxy}function Gr(e,t=!0){return Pe(e)?e.displayName||e.name:e.name||t&&e.__name}function Ay(e){return Pe(e)&&"__vccOpts"in e}const q=(e,t)=>Dg(e,t,_a);function si(e,t,s){try{Qi(-1);const n=arguments.length;return n===2?tt(t)&&!Ce(t)?Dn(t)?xt(e,null,[t]):xt(e,t):xt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Dn(s)&&(s=[s]),xt(e,t,s))}finally{Qi(1)}}function Ry(){}function Iy(e,t,s,n){const a=s[n];if(a&&yh(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function yh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(jt(s[n],t[n]))return!1;return xa>0&&is&&is.push(e),!0}const xh="3.5.38",Oy=Yt,Ly=jg,Ny=Ua,Dy=_f,Py={createComponentInstance:fh,setupComponent:mh,renderComponentRoot:Hl,setCurrentRenderingInstance:Wi,isVNode:Dn,normalizeVNode:ys,getComponentPublicInstance:vl,ensureValidVNode:Mc,pushWarningContext:Ug,popWarningContext:Bg},My=Py,Fy=null,$y=null,Uy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Kr;const Qd=typeof window<"u"&&window.trustedTypes;if(Qd)try{Kr=Qd.createPolicy("vue",{createHTML:e=>e})}catch{}const _h=Kr?e=>Kr.createHTML(e):e=>e,By="http://www.w3.org/2000/svg",Hy="http://www.w3.org/1998/Math/MathML",bn=typeof document<"u"?document:null,Xd=bn&&bn.createElement("template"),wh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?bn.createElementNS(By,e):t==="mathml"?bn.createElementNS(Hy,e):s?bn.createElement(e,{is:s}):bn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>bn.createTextNode(e),createComment:e=>bn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>bn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Xd.innerHTML=_h(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const o=Xd.content;if(n==="svg"||n==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},zn="transition",yi="animation",ni=Symbol("_vtc"),kh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Sh=qe({},Oc,kh),zy=e=>(e.displayName="Transition",e.props=Sh,e),jy=zy((e,{slots:t})=>si(If,Th(e),t)),oa=(e,t=[])=>{Ce(e)?e.forEach(s=>s(...t)):e&&e(...t)},eu=e=>e?Ce(e)?e.some(t=>t.length>1):e.length>1:!1;function Th(e){const t={};for(const T in e)T in kh||(t[T]=e[T]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,m=Vy(a),v=m&&m[0],w=m&&m[1],{onBeforeEnter:N,onEnter:x,onEnterCancelled:b,onLeave:y,onLeaveCancelled:E,onBeforeAppear:S=N,onAppear:L=x,onAppearCancelled:R=b}=t,_=(T,M,j,J)=>{T._enterCancelled=J,Gn(T,M?d:o),Gn(T,M?c:l),j&&j()},D=(T,M)=>{T._isLeaving=!1,Gn(T,u),Gn(T,f),Gn(T,p),M&&M()},U=T=>(M,j)=>{const J=T?L:x,A=()=>_(M,T,j);oa(J,[M,A]),tu(()=>{Gn(M,T?r:i),Xs(M,T?d:o),eu(J)||su(M,n,v,A)})};return qe(t,{onBeforeEnter(T){oa(N,[T]),Xs(T,i),Xs(T,l)},onBeforeAppear(T){oa(S,[T]),Xs(T,r),Xs(T,c)},onEnter:U(!1),onAppear:U(!0),onLeave(T,M){T._isLeaving=!0;const j=()=>D(T,M);Xs(T,u),T._enterCancelled?(Xs(T,p),Wr(T)):(Wr(T),Xs(T,p)),tu(()=>{T._isLeaving&&(Gn(T,u),Xs(T,f),eu(y)||su(T,n,w,j))}),oa(y,[T,j])},onEnterCancelled(T){_(T,!1,void 0,!0),oa(b,[T])},onAppearCancelled(T){_(T,!0,void 0,!0),oa(R,[T])},onLeaveCancelled(T){D(T),oa(E,[T])}})}function Vy(e){if(e==null)return null;if(tt(e))return[ur(e.enter),ur(e.leave)];{const t=ur(e);return[t,t]}}function ur(e){return Wl(e)}function Xs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ni]||(e[ni]=new Set)).add(t)}function Gn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[ni];s&&(s.delete(t),s.size||(e[ni]=void 0))}function tu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let qy=0;function su(e,t,s,n){const a=e._endId=++qy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Ch(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Ch(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${zn}Delay`),i=n(`${zn}Duration`),l=nu(a,i),o=n(`${yi}Delay`),r=n(`${yi}Duration`),c=nu(o,r);let d=null,u=0,p=0;t===zn?l>0&&(d=zn,u=l,p=i.length):t===yi?c>0&&(d=yi,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?zn:yi:null,p=d?d===zn?i.length:r.length:0);const f=d===zn&&/\b(?:transform|all)(?:,|$)/.test(n(`${zn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function nu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>au(s)+au(e[n])))}function au(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Wr(e){return(e?e.ownerDocument:document).body.offsetHeight}function Gy(e,t,s){const n=e[ni];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const oo=Symbol("_vod"),Vc=Symbol("_vsh"),Eh={name:"show",beforeMount(e,{value:t},{transition:s}){e[oo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):xi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),xi(e,!0),n.enter(e)):n.leave(e,()=>{xi(e,!1)}):xi(e,t))},beforeUnmount(e,{value:t}){xi(e,t)}};function xi(e,t){e.style.display=t?e[oo]:"none",e[Vc]=!t}function Ky(){Eh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Ah=Symbol("");function Wy(e){const t=hs();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>ro(i,a))},n=()=>{const a=e(t.proxy);t.ce?ro(t.ce,a):Jr(t.subTree,a),s(a)};Nc(()=>{Gi(n)}),je(()=>{Mt(n,Yt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>a.disconnect())})}function Jr(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Jr(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)ro(e.el,t);else if(e.type===Vt)e.children.forEach(s=>Jr(s,t));else if(e.type===ga){let{el:s,anchor:n}=e;for(;s&&(ro(s,t),s!==n);)s=s.nextSibling}}function ro(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=eg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Ah]=n}}const Jy=/(?:^|;)\s*display\s*:/;function Zy(e,t,s){const n=e.style,a=Ue(s);let i=!1;if(s&&!a){if(t)if(Ue(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&Ii(n,o,"")}else for(const l in t)s[l]==null&&Ii(n,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?Qy(e,l,!Ue(t)&&t?t[l]:void 0,o)||Ii(n,l,o):Ii(n,l,"")}}else if(a){if(t!==s){const l=n[Ah];l&&(s+=";"+l),n.cssText=s,i=Jy.test(s)}}else t&&e.removeAttribute("style");oo in e&&(e[oo]=i?n.display:"",e[Vc]&&(n.display="none"))}const iu=/\s*!important$/;function Ii(e,t,s){if(Ce(s))s.forEach(n=>Ii(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Yy(e,t);iu.test(s)?e.setProperty(xs(n),s.replace(iu,""),"important"):e[n]=s}}const lu=["Webkit","Moz","ms"],pr={};function Yy(e,t){const s=pr[t];if(s)return s;let n=pt(t);if(n!=="filter"&&n in e)return pr[t]=n;n=Ca(n);for(let a=0;a<lu.length;a++){const i=lu[a]+n;if(i in e)return pr[t]=i}return t}function Qy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ue(n)&&s===n}const ou="http://www.w3.org/1999/xlink";function ru(e,t,s,n,a,i=Qv(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(ou,t.slice(6,t.length)):e.setAttributeNS(ou,t,s):s==null||i&&!qp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":os(s)?String(s):s)}function cu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?_h(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=qp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function kn(e,t,s,n){e.addEventListener(t,s,n)}function Xy(e,t,s,n){e.removeEventListener(t,s,n)}const du=Symbol("_vei");function ex(e,t,s,n,a=null){const i=e[du]||(e[du]={}),l=i[t];if(n&&l)l.value=n;else{const[o,r]=tx(t);if(n){const c=i[t]=ax(n,a);kn(e,o,c,r)}else l&&(Xy(e,o,l,r),i[t]=void 0)}}const uu=/(?:Once|Passive|Capture)$/;function tx(e){let t;if(uu.test(e)){t={};let n;for(;n=e.match(uu);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):xs(e.slice(2)),t]}let fr=0;const sx=Promise.resolve(),nx=()=>fr||(sx.then(()=>fr=0),fr=Date.now());function ax(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ce(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),o=[n];for(let r=0;r<l.length&&!n._stopped;r++){const c=l[r];c&&Is(c,t,5,o)}}else Is(a,t,5,[n])};return s.value=e,s.attached=nx(),s}const pu=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Rh=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Gy(e,n,l):t==="style"?Zy(e,s,n):Sa(t)?Co(t)||ex(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):ix(e,t,n,l))?(cu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&ru(e,t,n,l,i,t!=="value")):e._isVueCE&&(lx(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ue(n)))?cu(e,pt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),ru(e,t,n,l))};function ix(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&pu(t)&&Pe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return pu(t)&&Ue(s)?!1:t in e}function lx(e,t){const s=e._def.props;if(!s)return!1;const n=pt(t);return Array.isArray(s)?s.some(a=>pt(a)===n):Object.keys(s).some(a=>pt(a)===n)}const fu={};function Ih(e,t,s){let n=hl(e,t);Eo(n)&&(n=qe({},n,t));class a extends Vo{constructor(l){super(n,l,s)}}return a.def=n,a}const ox=((e,t)=>Ih(e,t,jh)),rx=typeof HTMLElement<"u"?HTMLElement:class{};class Vo extends rx{constructor(t,s={},n=po){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==po?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(qe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Vo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Rt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let o;if(i&&!Ce(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Wl(this._props[r])),(o||(o=Object.create(null)))[pt(r)]=!0)}this._numberProps=o,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)nt(this,n)||Object.defineProperty(this,n,{get:()=>ln(s[n])})}_resolveProps(t){const{props:s}=t,n=Ce(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(pt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):fu;const a=pt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Wl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===fu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(xs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(xs(t),s+""):s||this.removeAttribute(xs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),zh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=xt(this._def,qe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Eo(l[0])?qe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),xs(i)!==i&&a(xs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],o=a.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,a)}else for(;a.firstChild;)o.insertBefore(a.firstChild,a);o.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Oh(e){const t=hs(),s=t&&t.ce;return s||null}function cx(){const e=Oh();return e&&e.shadowRoot}function dx(e="$style"){{const t=hs();if(!t)return Ge;const s=t.type.__cssModules;if(!s)return Ge;const n=s[e];return n||Ge}}const Lh=new WeakMap,Nh=new WeakMap,co=Symbol("_moveCb"),hu=Symbol("_enterCb"),ux=e=>(delete e.props.mode,e),px=ux({name:"TransitionGroup",props:qe({},Sh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=hs(),n=Ic();let a,i;return Bo(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!gx(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(hx),a.forEach(mx);const o=a.filter(vx);Wr(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;Xs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[co]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[co]=null,Gn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ze(e),o=Th(l);let r=l.tag||Vt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Vc]&&(a.push(d),Nn(d,ti(d,o,n,s)),Lh.set(d,Dh(d.el)))}i=t.default?$o(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Nn(d,ti(d,o,n,s))}return xt(r,null,i)}}}),fx=px;function hx(e){const t=e.el;t[co]&&t[co](),t[hu]&&t[hu]()}function mx(e){Nh.set(e,Dh(e.el))}function vx(e){const t=Lh.get(e),s=Nh.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/r}px,${a/c}px)`,l.transitionDuration="0s",e}}function Dh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function gx(e,t,s){const n=e.cloneNode(),a=e[ni];a&&a.forEach(o=>{o.split(/\s+/).forEach(r=>r&&n.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&n.classList.add(o)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Ch(n);return i.removeChild(n),l}const ea=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ce(t)?s=>Ka(t,s):t};function bx(e){e.target.composing=!0}function mu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Hs=Symbol("_assign");function vu(e,t,s){return t&&(e=e.trim()),s&&(e=Io(e)),e}const uo={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Hs]=ea(a);const i=n||a.props&&a.props.type==="number";kn(e,t?"change":"input",l=>{l.target.composing||e[Hs](vu(e.value,s,i))}),(s||i)&&kn(e,"change",()=>{e.value=vu(e.value,s,i)}),t||(kn(e,"compositionstart",bx),kn(e,"compositionend",mu),kn(e,"change",mu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Hs]=ea(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Io(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===r)||(e.value=r)}},qc={deep:!0,created(e,t,s){e[Hs]=ea(s),kn(e,"change",()=>{const n=e._modelValue,a=ai(e),i=e.checked,l=e[Hs];if(Ce(n)){const o=Lo(n,a),r=o!==-1;if(i&&!r)l(n.concat(a));else if(!i&&r){const c=[...n];c.splice(o,1),l(c)}}else if(Ta(n)){const o=new Set(n);i?o.add(a):o.delete(a),l(o)}else l(Mh(e,i))})},mounted:gu,beforeUpdate(e,t,s){e[Hs]=ea(s),gu(e,t,s)}};function gu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ce(t))a=Lo(t,n.props.value)>-1;else if(Ta(t))a=t.has(n.props.value);else{if(t===s)return;a=In(t,Mh(e,!0))}e.checked!==a&&(e.checked=a)}const Gc={created(e,{value:t},s){e.checked=In(t,s.props.value),e[Hs]=ea(s),kn(e,"change",()=>{e[Hs](ai(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Hs]=ea(n),t!==s&&(e.checked=In(t,n.props.value))}},Ph={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Ta(t);kn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Io(ai(l)):ai(l));e[Hs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Rt(()=>{e._assigning=!1})}),e[Hs]=ea(n)},mounted(e,{value:t}){bu(e,t)},beforeUpdate(e,t,s){e[Hs]=ea(s)},updated(e,{value:t}){e._assigning||bu(e,t)}};function bu(e,t){const s=e.multiple,n=Ce(t);if(!(s&&!n&&!Ta(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],o=ai(l);if(s)if(n){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Lo(t,o)>-1}else l.selected=t.has(o);else if(In(ai(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ai(e){return"_value"in e?e._value:e.value}function Mh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Fh={created(e,t,s){Ol(e,t,s,null,"created")},mounted(e,t,s){Ol(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Ol(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Ol(e,t,s,n,"updated")}};function $h(e,t){switch(e){case"SELECT":return Ph;case"TEXTAREA":return uo;default:switch(t){case"checkbox":return qc;case"radio":return Gc;default:return uo}}}function Ol(e,t,s,n,a){const l=$h(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function yx(){uo.getSSRProps=({value:e})=>({value:e}),Gc.getSSRProps=({value:e},t)=>{if(t.props&&In(t.props.value,e))return{checked:!0}},qc.getSSRProps=({value:e},t)=>{if(Ce(e)){if(t.props&&Lo(e,t.props.value)>-1)return{checked:!0}}else if(Ta(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Fh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=$h(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const xx=["ctrl","shift","alt","meta"],_x={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>xx.some(s=>e[`${s}Key`]&&!t.includes(s))},wx=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const o=_x[t[l]];if(o&&o(a,t))return}return e(a,...i)}))},kx={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Sx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=xs(a.key);if(t.some(l=>l===i||kx[l]===i))return e(a)}))},Uh=qe({patchProp:Rh},wh);let Fi,yu=!1;function Bh(){return Fi||(Fi=Xf(Uh))}function Hh(){return Fi=yu?Fi:eh(Uh),yu=!0,Fi}const zh=((...e)=>{Bh().render(...e)}),Tx=((...e)=>{Hh().hydrate(...e)}),po=((...e)=>{const t=Bh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=qh(n);if(!a)return;const i=t._component;!Pe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Vh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),jh=((...e)=>{const t=Hh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=qh(n);if(a)return s(a,!0,Vh(a))},t});function Vh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function qh(e){return Ue(e)?document.querySelector(e):e}let xu=!1;const Cx=()=>{xu||(xu=!0,yx(),Ky())},Ex=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:If,BaseTransitionPropsValidators:Oc,Comment:It,DeprecationTypes:Uy,EffectScope:_c,ErrorCodes:zg,ErrorTypeStrings:Ly,Fragment:Vt,KeepAlive:_b,ReactiveEffect:ji,Static:ga,Suspense:fy,Teleport:nb,Text:Qn,TrackOpTypes:Pg,Transition:jy,TransitionGroup:fx,TriggerOpTypes:Mg,VueElement:Vo,assertNumber:Hg,callWithAsyncErrorHandling:Is,callWithErrorHandling:fi,camelize:pt,capitalize:Ca,cloneVNode:rn,compatUtils:$y,computed:q,createApp:po,createBlock:ao,createCommentVNode:uh,createElementBlock:yy,createElementVNode:Hc,createHydrationRenderer:eh,createPropsRestProxy:jb,createRenderer:Xf,createSSRApp:jh,createSlots:Ab,createStaticVNode:wy,createTextVNode:zc,createVNode:xt,customRef:hf,defineAsyncComponent:yb,defineComponent:hl,defineCustomElement:Ih,defineEmits:Nb,defineExpose:Db,defineModel:Fb,defineOptions:Pb,defineProps:Lb,defineSSRCustomElement:ox,defineSlots:Mb,devtools:Ny,effect:ag,effectScope:tg,getCurrentInstance:hs,getCurrentScope:Jp,getCurrentWatcher:Fg,getTransitionRawChildren:$o,guardReactiveProps:dh,h:si,handleError:Ea,hasInjectionContext:Zg,hydrate:Tx,hydrateOnIdle:fb,hydrateOnInteraction:gb,hydrateOnMediaQuery:vb,hydrateOnVisible:mb,initCustomFormatter:Ry,initDirectivesForSSR:Cx,inject:Bs,isMemoSame:yh,isProxy:pl,isReactive:En,isReadonly:on,isRef:Pt,isRuntimeOnly:Cy,isShallow:ws,isVNode:Dn,markRaw:pf,mergeDefaults:Hb,mergeModels:zb,mergeProps:ph,nextTick:Rt,nodeOps:wh,normalizeClass:ul,normalizeProps:zv,normalizeStyle:dl,onActivated:Qt,onBeforeMount:Nf,onBeforeUnmount:Ho,onBeforeUpdate:Nc,onDeactivated:Gt,onErrorCaptured:Ff,onMounted:je,onRenderTracked:Mf,onRenderTriggered:Pf,onScopeDispose:sg,onServerPrefetch:Df,onUnmounted:ft,onUpdated:Bo,onWatcherCleanup:vf,openBlock:Yi,patchProp:Rh,popScopeId:Kg,provide:Di,proxyRefs:Ec,pushScopeId:Gg,queuePostFlushCb:Gi,reactive:ta,readonly:Zl,ref:h,registerRuntimeCompiler:vh,render:zh,renderList:Eb,renderSlot:Rb,resolveComponent:Sb,resolveDirective:Cb,resolveDynamicComponent:Tb,resolveFilter:Fy,resolveTransitionHooks:ti,setBlockTracking:Qi,setDevtoolsHook:Dy,setTransitionHooks:Nn,shallowReactive:Tc,shallowReadonly:kg,shallowRef:Cc,ssrContextKey:wf,ssrUtils:My,stop:ig,toDisplayString:Kp,toHandlerKey:Ga,toHandlers:Ib,toRaw:Ze,toRef:Lg,toRefs:Rg,toValue:Cg,transformVNodeArgs:xy,triggerRef:Tg,unref:ln,useAttrs:Bb,useCssModule:dx,useCssVars:Wy,useHost:Oh,useId:ib,useModel:Qb,useSSRContext:kf,useShadowRoot:cx,useSlots:Ub,useTemplateRef:lb,useTransitionState:Ic,vModelCheckbox:qc,vModelDynamic:Fh,vModelRadio:Gc,vModelSelect:Ph,vModelText:uo,vShow:Eh,version:xh,warn:Oy,watch:Mt,watchEffect:Yg,watchPostEffect:Qg,watchSyncEffect:Sf,withAsyncContext:Vb,withCtx:Rc,withDefaults:$b,withDirectives:Jg,withKeys:Sx,withMemo:Iy,withModifiers:wx,withScopeId:Wg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const el=Symbol(""),$i=Symbol(""),Kc=Symbol(""),fo=Symbol(""),Gh=Symbol(""),wa=Symbol(""),Kh=Symbol(""),Wh=Symbol(""),Wc=Symbol(""),Jc=Symbol(""),gl=Symbol(""),Zc=Symbol(""),Jh=Symbol(""),Yc=Symbol(""),Qc=Symbol(""),Xc=Symbol(""),ed=Symbol(""),td=Symbol(""),sd=Symbol(""),Zh=Symbol(""),Yh=Symbol(""),qo=Symbol(""),ho=Symbol(""),nd=Symbol(""),ad=Symbol(""),tl=Symbol(""),bl=Symbol(""),id=Symbol(""),Zr=Symbol(""),Ax=Symbol(""),Yr=Symbol(""),mo=Symbol(""),Rx=Symbol(""),Ix=Symbol(""),ld=Symbol(""),Ox=Symbol(""),Lx=Symbol(""),od=Symbol(""),Qh=Symbol(""),ii={[el]:"Fragment",[$i]:"Teleport",[Kc]:"Suspense",[fo]:"KeepAlive",[Gh]:"BaseTransition",[wa]:"openBlock",[Kh]:"createBlock",[Wh]:"createElementBlock",[Wc]:"createVNode",[Jc]:"createElementVNode",[gl]:"createCommentVNode",[Zc]:"createTextVNode",[Jh]:"createStaticVNode",[Yc]:"resolveComponent",[Qc]:"resolveDynamicComponent",[Xc]:"resolveDirective",[ed]:"resolveFilter",[td]:"withDirectives",[sd]:"renderList",[Zh]:"renderSlot",[Yh]:"createSlots",[qo]:"toDisplayString",[ho]:"mergeProps",[nd]:"normalizeClass",[ad]:"normalizeStyle",[tl]:"normalizeProps",[bl]:"guardReactiveProps",[id]:"toHandlers",[Zr]:"camelize",[Ax]:"capitalize",[Yr]:"toHandlerKey",[mo]:"setBlockTracking",[Rx]:"pushScopeId",[Ix]:"popScopeId",[ld]:"withCtx",[Ox]:"unref",[Lx]:"isRef",[od]:"withMemo",[Qh]:"isMemoSame"};function Nx(e){Object.getOwnPropertySymbols(e).forEach(t=>{ii[t]=e[t]})}const Ls={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Dx(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ls}}function sl(e,t,s,n,a,i,l,o=!1,r=!1,c=!1,d=Ls){return e&&(o?(e.helper(wa),e.helper(ri(e.inSSR,c))):e.helper(oi(e.inSSR,c)),l&&e.helper(td)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function ba(e,t=Ls){return{type:17,loc:t,elements:e}}function Us(e,t=Ls){return{type:15,loc:t,properties:e}}function Dt(e,t){return{type:16,loc:Ls,key:Ue(e)?He(e,!0):e,value:t}}function He(e,t=!1,s=Ls,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Gs(e,t=Ls){return{type:8,loc:t,children:e}}function Ht(e,t=[],s=Ls){return{type:14,loc:s,callee:e,arguments:t}}function li(e,t=void 0,s=!1,n=!1,a=Ls){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Qr(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Ls}}function Px(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Ls}}function Mx(e){return{type:21,body:e,loc:Ls}}function oi(e,t){return e||t?Wc:Jc}function ri(e,t){return e||t?Kh:Wh}function rd(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(oi(n,e.isComponent)),t(wa),t(ri(n,e.isComponent)))}const _u=new Uint8Array([123,123]),wu=new Uint8Array([125,125]);function ku(e){return e>=97&&e<=122||e>=65&&e<=90}function As(e){return e===32||e===10||e===9||e===12||e===13}function jn(e){return e===47||e===62||As(e)}function vo(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const ts={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Fx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=_u,this.delimiterClose=wu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=_u,this.delimiterClose=wu}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,o=a;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?jn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||As(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===ts.TitleEnd||this.currentSequence===ts.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===ts.Cdata[this.sequenceIndex]?++this.sequenceIndex===ts.Cdata.length&&(this.state=28,this.currentSequence=ts.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):ku(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){jn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(jn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(vo("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){As(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=ku(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||As(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):As(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):As(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||jn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||jn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||jn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||jn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||jn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):As(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):As(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){As(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=ts.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===ts.ScriptEnd[3]?this.startSpecial(ts.ScriptEnd,4):t===ts.StyleEnd[3]?this.startSpecial(ts.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===ts.TitleEnd[3]?this.startSpecial(ts.TitleEnd,4):t===ts.TextareaEnd[3]?this.startSpecial(ts.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Su(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ya(e,t){const s=Su("MODE",t),n=Su(e,t);return s===3?n===!0:n!==!1}function nl(e,t,s,...n){return ya(e,t)}function cd(e){throw e}function Xh(e){}function bt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const _s=e=>e.type===4&&e.isStatic;function em(e){switch(e){case"Teleport":case"teleport":return $i;case"Suspense":case"suspense":return Kc;case"KeepAlive":case"keep-alive":return fo;case"BaseTransition":case"base-transition":return Gh}}const $x=/^$|^\d|[^\$\w\xA0-\uFFFF]/,dd=e=>!$x.test(e),tm=/[A-Za-z_$\xA0-\uFFFF]/,Ux=/[\.\?\w$\xA0-\uFFFF]/,Bx=/\s+[.[]\s*|\s*[.[]\s+/g,sm=e=>e.type===4?e.content:e.loc.source,Hx=e=>{const t=sm(e).trim().replace(Bx,o=>o.trim());let s=0,n=[],a=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")n.push(s),s=1,a++;else if(r==="(")n.push(s),s=2,i++;else if(!(o===0?tm:Ux).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(n.push(s),s=3,l=r):r==="["?a++:r==="]"&&(--a||(s=n.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")n.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=n.pop())}break;case 3:r===l&&(s=n.pop(),l=null);break}}return!a&&!i},nm=Hx,zx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,jx=e=>zx.test(sm(e)),Vx=jx;function $s(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ue(t)?a.name===t:t.test(a.name)))return a}}function Go(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&pa(i.arg,t))return i}}function pa(e,t){return!!(e&&_s(e)&&e.content===t)}function qx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function hr(e){return e.type===5||e.type===2}function Tu(e){return e.type===7&&e.name==="pre"}function Gx(e){return e.type===7&&e.name==="slot"}function go(e){return e.type===1&&e.tagType===3}function bo(e){return e.type===1&&e.tagType===2}const Kx=new Set([tl,bl]);function am(e,t=[]){if(e&&!Ue(e)&&e.type===14){const s=e.callee;if(!Ue(s)&&Kx.has(s))return am(e.arguments[0],t.concat(e))}return[e,t]}function yo(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ue(a)&&a.type===14){const o=am(a);a=o[0],i=o[1],l=i[i.length-1]}if(a==null||Ue(a))n=Us([t]);else if(a.type===14){const o=a.arguments[0];!Ue(o)&&o.type===15?Cu(t,o)||o.properties.unshift(t):a.callee===id?n=Ht(s.helper(ho),[Us([t]),a]):a.arguments.unshift(Us([t])),!n&&(n=a)}else a.type===15?(Cu(t,a)||a.properties.unshift(t),n=a):(n=Ht(s.helper(ho),[Us([t]),a]),l&&l.callee===bl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Cu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function al(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Wx(e){return e.type===14&&e.callee===od?e.arguments[1].returns:e}const Jx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function im(e){for(let t=0;t<e.length;t++)if(!As(e.charCodeAt(t)))return!1;return!0}function ud(e){return e.type===2&&im(e.content)||e.type===12&&ud(e.content)}function lm(e){return e.type===3||ud(e)}const om={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:za,isPreTag:za,isIgnoreNewlineTag:za,isCustomElement:za,onError:cd,onWarn:Xh,comments:!1,prefixIdentifiers:!1};let et=om,il=null,Rn="",ns=null,We=null,vs="",gn=-1,ca=-1,pd=0,Jn=!1,Xr=null;const gt=[],Ct=new Fx(gt,{onerr:hn,ontext(e,t){Ll(Wt(e,t),e,t)},ontextentity(e,t,s){Ll(e,t,s)},oninterpolation(e,t){if(Jn)return Ll(Wt(e,t),e,t);let s=e+Ct.delimiterOpen.length,n=t-Ct.delimiterClose.length;for(;As(Rn.charCodeAt(s));)s++;for(;As(Rn.charCodeAt(n-1));)n--;let a=Wt(s,n);a.includes("&")&&(a=et.decodeEntities(a,!1)),ec({type:5,content:Vl(a,!1,At(s,n)),loc:At(e,t)})},onopentagname(e,t){const s=Wt(e,t);ns={type:1,tag:s,ns:et.getNamespace(s,gt[0],et.ns),tagType:0,props:[],children:[],loc:At(e-1,t),codegenNode:void 0}},onopentagend(e){Au(e)},onclosetag(e,t){const s=Wt(e,t);if(!et.isVoidTag(s)){let n=!1;for(let a=0;a<gt.length;a++)if(gt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&hn(24,gt[0].loc.start.offset);for(let l=0;l<=a;l++){const o=gt.shift();jl(o,t,l<a)}break}n||hn(23,rm(e,60))}},onselfclosingtag(e){const t=ns.tag;ns.isSelfClosing=!0,Au(e),gt[0]&&gt[0].tag===t&&jl(gt.shift(),e)},onattribname(e,t){We={type:6,name:Wt(e,t),nameLoc:At(e,t),value:void 0,loc:At(e)}},ondirname(e,t){const s=Wt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Jn&&n===""&&hn(26,e),Jn||n==="")We={type:6,name:s,nameLoc:At(e,t),value:void 0,loc:At(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[He("prop")]:[],loc:At(e)},n==="pre"){Jn=Ct.inVPre=!0,Xr=ns;const a=ns.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=i0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Wt(e,t);if(Jn&&!Tu(We))We.name+=s,fa(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=Vl(n?s:s.slice(1,-1),n,At(e,t),n?3:0)}},ondirmodifier(e,t){const s=Wt(e,t);if(Jn&&!Tu(We))We.name+="."+s,fa(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,fa(n.loc,t))}else{const n=He(s,!0,At(e,t));We.modifiers.push(n)}},onattribdata(e,t){vs+=Wt(e,t),gn<0&&(gn=e),ca=t},onattribentity(e,t,s){vs+=e,gn<0&&(gn=t),ca=s},onattribnameend(e){const t=We.loc.start.offset,s=Wt(t,e);We.type===7&&(We.rawName=s),ns.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&hn(2,t)},onattribend(e,t){if(ns&&We){if(fa(We.loc,t),e!==0)if(vs.includes("&")&&(vs=et.decodeEntities(vs,!0)),We.type===6)We.name==="class"&&(vs=dm(vs).trim()),e===1&&!vs&&hn(13,t),We.value={type:2,content:vs,loc:e===1?At(gn,ca):At(gn-1,ca+1)},Ct.inSFCRoot&&ns.tag==="template"&&We.name==="lang"&&vs&&vs!=="html"&&Ct.enterRCDATA(vo("</template"),0);else{let s=0;We.exp=Vl(vs,!1,At(gn,ca),0,s),We.name==="for"&&(We.forParseResult=Yx(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&nl("COMPILER_V_BIND_SYNC",et,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&ns.props.push(We)}vs="",gn=ca=-1},oncomment(e,t){et.comments&&ec({type:3,content:Wt(e,t),loc:At(e-4,t+3)})},onend(){const e=Rn.length;for(let t=0;t<gt.length;t++)jl(gt[t],e-1),hn(24,gt[t].loc.start.offset)},oncdata(e,t){(gt[0]?gt[0].ns:et.ns)!==0?Ll(Wt(e,t),e,t):hn(1,e-9)},onprocessinginstruction(e){(gt[0]?gt[0].ns:et.ns)===0&&hn(21,e-1)}}),Eu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Zx=/^\(|\)$/g;function Yx(e){const t=e.loc,s=e.content,n=s.match(Jx);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const m=t.start.offset+p,v=m+u.length;return Vl(u,!1,At(m,v),0,f?1:0)},o={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=a.trim().replace(Zx,"").trim();const c=a.indexOf(r),d=r.match(Eu);if(d){r=r.replace(Eu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(o.index=l(f,s.indexOf(f,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Wt(e,t){return Rn.slice(e,t)}function Au(e){Ct.inSFCRoot&&(ns.innerLoc=At(e+1,e+1)),ec(ns);const{tag:t,ns:s}=ns;s===0&&et.isPreTag(t)&&pd++,et.isVoidTag(t)?jl(ns,e):(gt.unshift(ns),(s===1||s===2)&&(Ct.inXML=!0)),ns=null}function Ll(e,t,s){{const i=gt[0]&&gt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=et.decodeEntities(e,!1))}const n=gt[0]||il,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,fa(a.loc,s)):n.children.push({type:2,content:e,loc:At(t,s)})}function jl(e,t,s=!1){s?fa(e.loc,rm(t,60)):fa(e.loc,Qx(t,62)+1),Ct.inSFCRoot&&(e.children.length?e.innerLoc.end=qe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=qe({},e.innerLoc.start),e.innerLoc.source=Wt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Jn||(n==="slot"?e.tagType=2:Ru(e)?e.tagType=3:e0(e)&&(e.tagType=1)),Ct.inRCDATA||(e.children=cm(i)),a===0&&et.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&et.isPreTag(n)&&pd--,Xr===e&&(Jn=Ct.inVPre=!1,Xr=null),Ct.inXML&&(gt[0]?gt[0].ns:et.ns)===0&&(Ct.inXML=!1);{const l=e.props;if(!Ct.inSFCRoot&&ya("COMPILER_NATIVE_TEMPLATE",et)&&e.tag==="template"&&!Ru(e)){const r=gt[0]||il,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&nl("COMPILER_INLINE_TEMPLATE",et,o.loc)&&e.children.length&&(o.value={type:2,content:Wt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function Qx(e,t){let s=e;for(;Rn.charCodeAt(s)!==t&&s<Rn.length-1;)s++;return s}function rm(e,t){let s=e;for(;Rn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Xx=new Set(["if","else","else-if","for","slot"]);function Ru({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Xx.has(t[s].name))return!0}return!1}function e0({tag:e,props:t}){if(et.isCustomElement(e))return!1;if(e==="component"||t0(e.charCodeAt(0))||em(e)||et.isBuiltInComponent&&et.isBuiltInComponent(e)||et.isNativeTag&&!et.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(nl("COMPILER_IS_ON_ELEMENT",et,n.loc))return!0}}else if(n.name==="bind"&&pa(n.arg,"is")&&nl("COMPILER_IS_ON_ELEMENT",et,n.loc))return!0}return!1}function t0(e){return e>64&&e<91}const s0=/\r\n/g;function cm(e){const t=et.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(pd)a.content=a.content.replace(s0,`
`);else if(im(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&n0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=dm(a.content))}return s?e.filter(Boolean):e}function n0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function dm(e){let t="",s=!1;for(let n=0;n<e.length;n++)As(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function ec(e){(gt[0]||il).children.push(e)}function At(e,t){return{start:Ct.getPos(e),end:t==null?t:Ct.getPos(t),source:t==null?t:Wt(e,t)}}function a0(e){return At(e.start.offset,e.end.offset)}function fa(e,t){e.end=Ct.getPos(t),e.source=Wt(e.start.offset,t)}function i0(e){const t={type:6,name:e.rawName,nameLoc:At(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Vl(e,t=!1,s,n=0,a=0){return He(e,t,s,n)}function hn(e,t,s){et.onError(bt(e,At(t,t)))}function l0(){Ct.reset(),ns=null,We=null,vs="",gn=-1,ca=-1,gt.length=0}function o0(e,t){if(l0(),Rn=e,et=qe({},om),t){let a;for(a in t)t[a]!=null&&(et[a]=t[a])}Ct.mode=et.parseMode==="html"?1:et.parseMode==="sfc"?2:0,Ct.inXML=et.ns===1||et.ns===2;const s=t&&t.delimiters;s&&(Ct.delimiterOpen=vo(s[0]),Ct.delimiterClose=vo(s[1]));const n=il=Dx([],e);return Ct.parse(Rn),n.loc=At(0,e.length),n.children=cm(n.children),il=null,n}function r0(e,t){ql(e,void 0,t,!!um(e))}function um(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!bo(t[0])?t[0]:null}function ql(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:Rs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const m=f.patchFlag;if((m===void 0||m===512||m===1)&&fm(u,s)>=2){const v=hm(u);v&&(f.props=s.hoist(v))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:Rs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,ql(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)ql(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)ql(u.branches[p],e,s,u.branches[p].children.length===1,a)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ce(e.codegenNode.children))e.codegenNode.children=r(ba(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ce(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(ba(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ce(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=$s(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(ba(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ce(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Rs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const o=fm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Rs(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Rs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(wa),t.removeHelper(ri(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(oi(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Rs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Ue(o)||os(o))continue;const r=Rs(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const c0=new Set([nd,ad,tl,bl]);function pm(e,t){if(e.type===14&&!Ue(e.callee)&&c0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Rs(s,t);if(s.type===14)return pm(s,t)}return 0}function fm(e,t){let s=3;const n=hm(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:o}=a[i],r=Rs(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Rs(o,t):o.type===14?c=pm(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function hm(e){const t=e.codegenNode;if(t.type===13)return t.props}function d0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Yt,isCustomElement:d=Yt,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:w="",bindingMetadata:N=Ge,inline:x=!1,isTS:b=!1,onError:y=cd,onWarn:E=Xh,compatConfig:S}){const L=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),R={filename:t,selfName:L&&Ca(pt(L[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:m,inSSR:v,ssrCssVars:w,bindingMetadata:N,inline:x,isTS:b,onError:y,onWarn:E,compatConfig:S,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(_){const D=R.helpers.get(_)||0;return R.helpers.set(_,D+1),_},removeHelper(_){const D=R.helpers.get(_);if(D){const U=D-1;U?R.helpers.set(_,U):R.helpers.delete(_)}},helperString(_){return`_${ii[R.helper(_)]}`},replaceNode(_){R.parent.children[R.childIndex]=R.currentNode=_},removeNode(_){const D=R.parent.children,U=_?D.indexOf(_):R.currentNode?R.childIndex:-1;!_||_===R.currentNode?(R.currentNode=null,R.onNodeRemoved()):R.childIndex>U&&(R.childIndex--,R.onNodeRemoved()),R.parent.children.splice(U,1)},onNodeRemoved:Yt,addIdentifiers(_){},removeIdentifiers(_){},hoist(_){Ue(_)&&(_=He(_)),R.hoists.push(_);const D=He(`_hoisted_${R.hoists.length}`,!1,_.loc,2);return D.hoisted=_,D},cache(_,D=!1,U=!1){const T=Px(R.cached.length,_,D,U);return R.cached.push(T),T}};return R.filters=new Set,R}function u0(e,t){const s=d0(e,t);Ko(e,s),t.hoistStatic&&r0(e,s),t.ssr||p0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function p0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=um(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&rd(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=sl(t,s(el),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function f0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ue(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Ko(a,t))}}function Ko(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ce(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(gl);break;case 5:t.ssr||t.helper(qo);break;case 9:for(let i=0;i<e.branches.length;i++)Ko(e.branches[i],t);break;case 10:case 11:case 1:case 0:f0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function mm(e,t){const s=Ue(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(Gx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(n,r,a);c&&l.push(c)}}return l}}}const Wo="/*@__PURE__*/",vm=e=>`${ii[e]}: _${ii[e]}`;function h0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${ii[v]}`},push(v,w=-2,N){f.code+=v},indent(){m(++f.indentLevel)},deindent(v=!1){v?--f.indentLevel:m(--f.indentLevel)},newline(){m(f.indentLevel)}};function m(v){f.push(`
`+"  ".repeat(v),0)}return f}function m0(e,t={}){const s=h0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";v0(e,s);const v=d?"ssrRender":"render",N=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${N}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(vm).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(mr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(mr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),mr(e.filters,"filter",s),r()),e.temps>0){a("let ");for(let x=0;x<e.temps;x++)a(`${x>0?", ":""}_temp${x}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),r()),d||a("return "),e.codegenNode?ls(e.codegenNode,s):a("null"),f&&(o(),a("}")),o(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function v0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Wc,Jc,gl,Zc,Jh].filter(p=>d.includes(p)).map(vm).join(", ");a(`const { ${u} } = _Vue
`,-1)}g0(e.hoists,t),i(),a("return ")}function mr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?ed:t==="component"?Yc:Xc);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),n(`const ${al(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&a()}}function g0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),ls(i,t),n())}t.pure=!1}function fd(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),yl(e,t,s),s&&t.deindent(),t.push("]")}function yl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Ue(o)?a(o,-3):Ce(o)?fd(o,t):ls(o,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function ls(e,t){if(Ue(e)){t.push(e,-3);return}if(os(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ls(e.codegenNode,t);break;case 2:b0(e,t);break;case 4:gm(e,t);break;case 5:y0(e,t);break;case 12:ls(e.codegenNode,t);break;case 8:bm(e,t);break;case 3:_0(e,t);break;case 13:w0(e,t);break;case 14:S0(e,t);break;case 15:T0(e,t);break;case 17:C0(e,t);break;case 18:E0(e,t);break;case 19:A0(e,t);break;case 20:R0(e,t);break;case 21:yl(e.body,t,!0,!1);break}}function b0(e,t){t.push(JSON.stringify(e.content),-3,e)}function gm(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function y0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Wo),s(`${n(qo)}(`),ls(e.content,t),s(")")}function bm(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ue(n)?t.push(n,-3):ls(n,t)}}function x0(e,t){const{push:s}=t;if(e.type===8)s("["),bm(e,t),s("]");else if(e.isStatic){const n=dd(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function _0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Wo),s(`${n(gl)}(${JSON.stringify(e.content)})`,-3,e)}function w0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let m;r&&(m=String(r)),d&&s(n(td)+"("),u&&s(`(${n(wa)}(${p?"true":""}), `),a&&s(Wo);const v=u?ri(t.inSSR,f):oi(t.inSSR,f);s(n(v)+"(",-2,e),yl(k0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),ls(d,t),s(")"))}function k0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function S0(e,t){const{push:s,helper:n,pure:a}=t,i=Ue(e.callee)?e.callee:n(e.callee);a&&s(Wo),s(i+"(",-2,e),yl(e.arguments,t),s(")")}function T0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&n();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];x0(c,t),s(": "),ls(d,t),r<l.length-1&&(s(","),i())}o&&a(),s(o?"}":" }")}function C0(e,t){fd(e.elements,t)}function E0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${ii[ld]}(`),s("(",-2,e),Ce(i)?yl(i,t):i&&ls(i,t),s(") => "),(r||o)&&(s("{"),n()),l?(r&&s("return "),Ce(l)?fd(l,t):ls(l,t)):o&&ls(o,t),(r||o)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function A0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!dd(s.content);u&&l("("),gm(s,t),u&&l(")")}else l("("),ls(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ls(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,ls(a,t),d||t.indentLevel--,i&&r(!0)}function R0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(a(),s(`${n(mo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ls(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(mo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const I0=mm(/^(?:if|else|else-if)$/,(e,t,s)=>O0(e,t,s,(n,a,i)=>{const l=s.parent.children;let o=l.indexOf(n),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)n.codegenNode=Ou(a,r,s);else{const c=L0(n.codegenNode);c.alternate=Ou(a,r+n.branches.length-1,s)}}}));function O0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(bt(28,t.loc)),t.exp=He("true",!1,a)}if(t.name==="if"){const a=Iu(e,t),i={type:9,loc:a0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&lm(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(bt(30,e.loc)),s.removeNode();const o=Iu(e,t);l.branches.push(o);const r=n&&n(l,o,!1);Ko(o,s),r&&r(),s.currentNode=null}else s.onError(bt(30,e.loc));break}}}function Iu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!$s(e,"for")?e.children:[e],userKey:Go(e,"key"),isTemplateIf:s}}function Ou(e,t,s){return e.condition?Qr(e.condition,Lu(e,t,s),Ht(s.helper(gl),['""',"true"])):Lu(e,t,s)}function Lu(e,t,s){const{helper:n}=s,a=Dt("key",He(`${t}`,!1,Ls,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return yo(r,a,s),r}else return sl(s,n(el),Us([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=Wx(r);return c.type===13&&rd(c,s),yo(c,a,s),r}}function L0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const N0=mm("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return D0(e,t,s,i=>{const l=Ht(n(sd),[i.source]),o=go(e),r=$s(e,"memo"),c=Go(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?He(c.value.content,!0):void 0:c.exp);const u=d?Dt("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=sl(s,n(el),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,w=v.length!==1||v[0].type!==1,N=bo(e)?e:o&&e.children.length===1&&bo(e.children[0])?e.children[0]:null;if(N?(m=N.codegenNode,o&&u&&yo(m,u,s)):w?m=sl(s,n(el),u?Us([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&yo(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(wa),a(ri(s.inSSR,m.isComponent))):a(oi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(wa),n(ri(s.inSSR,m.isComponent))):n(oi(s.inSSR,m.isComponent))),r){const x=li(tc(i.parseResult,[He("_cached")]));x.body=Mx([Gs(["const _memo = (",r.exp,")"]),Gs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Qh)}(_cached, _memo)) return _cached`]),Gs(["const _item = ",m]),He("_item.memo = _memo"),He("return _item")]),l.arguments.push(x,He("_cache"),He(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(li(tc(i.parseResult),m,!0))}})});function D0(e,t,s,n){if(!t.exp){s.onError(bt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(bt(32,t.loc));return}ym(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:go(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const f=n&&n(p);return()=>{o.vFor--,f&&f()}}function ym(e,t){e.finalized||(e.finalized=!0)}function tc({value:e,key:t,index:s},n=[]){return P0([e,t,s,...n])}function P0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||He("_".repeat(n+1),!1))}const Nu=He("undefined",!1),M0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=$s(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},F0=(e,t,s,n)=>li(e,s,!1,!0,s.length?s[0].loc:n);function $0(e,t,s=F0){t.helper(ld);const{children:n,loc:a}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=$s(e,"slot",!0);if(r){const{arg:w,exp:N}=r;w&&!_s(w)&&(o=!0),i.push(Dt(w||He("default",!0),s(N,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let w=0;w<n.length;w++){const N=n[w];let x;if(!go(N)||!(x=$s(N,"slot",!0))){N.type!==3&&u.push(N);continue}if(r){t.onError(bt(37,x.loc));break}c=!0;const{children:b,loc:y}=N,{arg:E=He("default",!0),exp:S,loc:L}=x;let R;_s(E)?R=E?E.content:"default":o=!0;const _=$s(N,"for"),D=s(S,_,b,y);let U,T;if(U=$s(N,"if"))o=!0,l.push(Qr(U.exp,Nl(E,D,f++),Nu));else if(T=$s(N,/^else(?:-if)?$/,!0)){let M=w,j;for(;M--&&(j=n[M],!!lm(j)););if(j&&go(j)&&$s(j,/^(?:else-)?if$/)){let J=l[l.length-1];for(;J.alternate.type===19;)J=J.alternate;J.alternate=T.exp?Qr(T.exp,Nl(E,D,f++),Nu):Nl(E,D,f++)}else t.onError(bt(30,T.loc))}else if(_){o=!0;const M=_.forParseResult;M?(ym(M),l.push(Ht(t.helper(sd),[M.source,li(tc(M),Nl(E,D),!0)]))):t.onError(bt(32,_.loc))}else{if(R){if(p.has(R)){t.onError(bt(38,L));continue}p.add(R),R==="default"&&(d=!0)}i.push(Dt(E,D))}}if(!r){const w=(N,x)=>{const b=s(N,void 0,x,a);return t.compatConfig&&(b.isNonScopedSlot=!0),Dt("default",b)};c?u.length&&!u.every(ud)&&(d?t.onError(bt(39,u[0].loc)):i.push(w(void 0,u))):i.push(w(void 0,n))}const m=o?2:Gl(e.children)?3:1;let v=Us(i.concat(Dt("_",He(m+"",!1))),a);return l.length&&(v=Ht(t.helper(Yh),[v,ba(l)])),{slots:v,hasDynamicSlots:o}}function Nl(e,t,s){const n=[Dt("name",e),Dt("fn",t)];return s!=null&&n.push(Dt("key",He(String(s),!0))),Us(n)}function Gl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Gl(s.children))return!0;break;case 9:if(Gl(s.branches))return!0;break;case 10:case 11:if(Gl(s.children))return!0;break}}return!1}const xm=new WeakMap,U0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?B0(e,t):`"${n}"`;const o=tt(l)&&l.callee===Qc;let r,c,d=0,u,p,f,m=o||l===$i||l===Kc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=_m(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const w=v.directives;f=w&&w.length?ba(w.map(N=>z0(N,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===fo&&(m=!0,d|=1024),i&&l!==$i&&l!==fo){const{slots:w,hasDynamicSlots:N}=$0(e,t);c=w,N&&(d|=1024)}else if(e.children.length===1&&l!==$i){const w=e.children[0],N=w.type,x=N===5||N===8;x&&Rs(w,t)===0&&(d|=1),x||N===2?c=w:c=e.children}else c=e.children;p&&p.length&&(u=j0(p)),e.codegenNode=sl(t,l,r,c,d===0?void 0:d,u,f,!!m,!1,i,e.loc)};function B0(e,t,s=!1){let{tag:n}=e;const a=sc(n),i=Go(e,"is",!1,!0);if(i)if(a||ya("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&He(i.value.content,!0):(o=i.exp,o||(o=He("is",!1,i.arg.loc))),o)return Ht(t.helper(Qc),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=em(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Yc),t.components.add(n),al(n,"component"))}function _m(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let f=!1,m=0,v=!1,w=!1,N=!1,x=!1,b=!1,y=!1;const E=[],S=D=>{c.length&&(d.push(Us(Du(c),o)),c=[]),D&&d.push(D)},L=()=>{t.scopes.vFor>0&&c.push(Dt(He("ref_for",!0),He("true")))},R=({key:D,value:U})=>{if(_s(D)){const T=D.content,M=Sa(T);if(M&&(!n||a)&&T.toLowerCase()!=="onclick"&&T!=="onUpdate:modelValue"&&!Cn(T)&&(x=!0),M&&Cn(T)&&(y=!0),M&&U.type===14&&(U=U.arguments[0]),U.type===20||(U.type===4||U.type===8)&&Rs(U,t)>0)return;T==="ref"?v=!0:T==="class"?w=!0:T==="style"?N=!0:T!=="key"&&!E.includes(T)&&E.push(T),n&&(T==="class"||T==="style")&&!E.includes(T)&&E.push(T)}else b=!0};for(let D=0;D<s.length;D++){const U=s[D];if(U.type===6){const{loc:T,name:M,nameLoc:j,value:J}=U;let A=!0;if(M==="ref"&&(v=!0,L()),M==="is"&&(sc(l)||J&&J.content.startsWith("vue:")||ya("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Dt(He(M,!0,j),He(J?J.content:"",A,J?J.loc:T)))}else{const{name:T,arg:M,exp:j,loc:J,modifiers:A}=U,k=T==="bind",C=T==="on";if(T==="slot"){n||t.onError(bt(40,J));continue}if(T==="once"||T==="memo"||T==="is"||k&&pa(M,"is")&&(sc(l)||ya("COMPILER_IS_ON_ELEMENT",t))||C&&i)continue;if((k&&pa(M,"key")||C&&p&&pa(M,"vue:before-update"))&&(f=!0),k&&pa(M,"ref")&&L(),!M&&(k||C)){if(b=!0,j)if(k){if(S(),ya("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(j);continue}L(),S(),d.push(j)}else S({type:14,loc:J,callee:t.helper(id),arguments:n?[j]:[j,"true"]});else t.onError(bt(k?34:35,J));continue}k&&A.some(W=>W.content==="prop")&&(m|=32);const $=t.directiveTransforms[T];if($){const{props:W,needRuntime:G}=$(U,e,t);!i&&W.forEach(R),C&&M&&!_s(M)?S(Us(W,o)):c.push(...W),G&&(u.push(U),os(G)&&xm.set(U,G))}else Nv(T)||(u.push(U),p&&(f=!0))}}let _;if(d.length?(S(),d.length>1?_=Ht(t.helper(ho),d,o):_=d[0]):c.length&&(_=Us(Du(c),o)),b?m|=16:(w&&!n&&(m|=2),N&&!n&&(m|=4),E.length&&(m|=8),x&&(m|=32)),!f&&(m===0||m===32)&&(v||y||u.length>0)&&(m|=512),!t.inSSR&&_)switch(_.type){case 15:let D=-1,U=-1,T=!1;for(let J=0;J<_.properties.length;J++){const A=_.properties[J].key;_s(A)?A.content==="class"?D=J:A.content==="style"&&(U=J):A.isHandlerKey||(T=!0)}const M=_.properties[D],j=_.properties[U];T?_=Ht(t.helper(tl),[_]):(M&&!_s(M.value)&&(M.value=Ht(t.helper(nd),[M.value])),j&&(N||j.value.type===4&&j.value.content.trim()[0]==="["||j.value.type===17)&&(j.value=Ht(t.helper(ad),[j.value])));break;case 14:break;default:_=Ht(t.helper(tl),[Ht(t.helper(bl),[_])]);break}return{props:_,directives:u,patchFlag:m,dynamicPropNames:E,shouldUseBlock:f}}function Du(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Sa(i))&&H0(l,a):(t.set(i,a),s.push(a))}return s}function H0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=ba([e.value,t.value],e.loc)}function z0(e,t){const s=[],n=xm.get(e);n?s.push(t.helperString(n)):(t.helper(Xc),t.directives.add(e.name),s.push(al(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=He("true",!1,a);s.push(Us(e.modifiers.map(l=>Dt(l,i)),a))}return ba(s,e.loc)}function j0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function sc(e){return e==="component"||e==="Component"}const V0=(e,t)=>{if(bo(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=q0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=li([],s,!1,!1,n),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Ht(t.helper(Zh),l,n)}};function q0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=pt(l.name),a.push(l)));else if(l.name==="bind"&&pa(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=pt(l.arg.content);s=l.exp=He(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&_s(l.arg)&&(l.arg.content=pt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=_m(e,t,a,!1,!1);n=i,l.length&&t.onError(bt(36,l[0].loc))}return{slotName:s,slotProps:n}}const wm=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(bt(35,a));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ga(pt(u)):`on:${u}`;o=He(p,!0,l.loc)}else o=Gs([`${s.helperString(Yr)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(Yr)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=nm(r),p=!(u||Vx(r)),f=r.content.includes(";");(p||c&&u)&&(r=Gs([`${p?"$event":"(...args)"} => ${f?"{":"("}`,r,f?"}":")"]))}let d={props:[Dt(o,r||He("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},G0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=pt(i.content):i.content=`${s.helperString(Zr)}(${i.content})`:(i.children.unshift(`${s.helperString(Zr)}(`),i.children.push(")"))),s.inSSR||(n.some(o=>o.content==="prop")&&Pu(i,"."),n.some(o=>o.content==="attr")&&Pu(i,"^")),{props:[Dt(i,l)]}},Pu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},K0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(hr(l)){a=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(hr(r))n||(n=s[i]=Gs([l],l.loc)),n.children.push(" + ",r),s.splice(o,1),o--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(hr(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Rs(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Ht(t.helper(Zc),o)}}}}},Mu=new WeakSet,W0=(e,t)=>{if(e.type===1&&$s(e,"once",!0))return Mu.has(e)||t.inVOnce||t.inSSR?void 0:(Mu.add(e),t.inVOnce=!0,t.helper(mo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},km=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(bt(41,e.loc)),_i();const i=n.loc.source.trim(),l=n.type===4?n.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(bt(44,n.loc)),_i();if(o==="literal-const"||o==="setup-const")return s.onError(bt(45,n.loc)),_i();if(!l.trim()||!nm(n))return s.onError(bt(42,n.loc)),_i();const r=a||He("modelValue",!0),c=a?_s(a)?`onUpdate:${pt(a.content)}`:Gs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Gs([`${u} => ((`,n,") = $event)"]);const p=[Dt(r,e.exp),Dt(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(v=>v.content).map(v=>(dd(v)?v:JSON.stringify(v))+": true").join(", "),m=a?_s(a)?`${a.content}Modifiers`:Gs([a,' + "Modifiers"']):"modelModifiers";p.push(Dt(m,He(`{ ${f} }`,!1,e.loc,2)))}return _i(p)};function _i(e=[]){return{props:e}}const J0=/[\w).+\-_$\]]/,Z0=(e,t)=>{ya("COMPILER_FILTERS",t)&&(e.type===5?xo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&xo(s.exp,t)}))};function xo(e,t){if(e.type===4)Fu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?Fu(n,t):n.type===8?xo(e,t):n.type===5&&xo(n.content,t))}}function Fu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,f,m,v=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!o&&!r&&!c)m===void 0?(d=f+1,m=s.slice(0,f).trim()):w();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let N=f-1,x;for(;N>=0&&(x=s.charAt(N),x===" ");N--);(!x||!J0.test(x))&&(l=!0)}}m===void 0?m=s.slice(0,f).trim():d!==0&&w();function w(){v.push(s.slice(d,f).trim()),d=f+1}if(v.length){for(f=0;f<v.length;f++)m=Y0(m,v[f],t);e.content=m,e.ast=void 0}}function Y0(e,t,s){s.helper(ed);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${al(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${al(a,"filter")}(${e}${i!==")"?","+i:i}`}}const $u=new WeakSet,Q0=(e,t)=>{if(e.type===1){const s=$s(e,"memo");return!s||$u.has(e)||t.inSSR?void 0:($u.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&rd(n,t),e.codegenNode=Ht(t.helper(od),[s.exp,li(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},X0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(bt(53,n.loc)),s.exp=He("",!0,n.loc);else{const a=pt(n.content);(tm.test(a[0])||a[0]==="-")&&(s.exp=He(a,!1,n.loc))}}}};function e_(e){return[[X0,W0,I0,Q0,N0,Z0,V0,U0,M0,K0],{on:wm,bind:G0,model:km}]}function t_(e,t={}){const s=t.onError||cd,n=t.mode==="module";t.prefixIdentifiers===!0?s(bt(48)):n&&s(bt(49));const a=!1;t.cacheHandlers&&s(bt(50)),t.scopeId&&!n&&s(bt(51));const i=qe({},t,{prefixIdentifiers:a}),l=Ue(e)?o0(e,i):e,[o,r]=e_();return u0(l,qe({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:qe({},r,t.directiveTransforms||{})})),m0(l,i)}const s_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Sm=Symbol(""),Tm=Symbol(""),Cm=Symbol(""),Em=Symbol(""),nc=Symbol(""),Am=Symbol(""),Rm=Symbol(""),Im=Symbol(""),Om=Symbol(""),Lm=Symbol("");Nx({[Sm]:"vModelRadio",[Tm]:"vModelCheckbox",[Cm]:"vModelText",[Em]:"vModelSelect",[nc]:"vModelDynamic",[Am]:"withModifiers",[Rm]:"withKeys",[Im]:"vShow",[Om]:"Transition",[Lm]:"TransitionGroup"});let Da;function n_(e,t=!1){return Da||(Da=document.createElement("div")),t?(Da.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Da.children[0].getAttribute("foo")):(Da.innerHTML=e,Da.textContent)}const a_={parseMode:"html",isVoidTag:Zv,isNativeTag:e=>Kv(e)||Wv(e)||Jv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:n_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Om;if(e==="TransitionGroup"||e==="transition-group")return Lm},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},i_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:He("style",!0,t.loc),exp:l_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},l_=(e,t)=>{const s=Vp(e);return He(JSON.stringify(s),!1,t,3)};function Xn(e,t){return bt(e,t)}const o_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Xn(54,a)),t.children.length&&(s.onError(Xn(55,a)),t.children.length=0),{props:[Dt(He("innerHTML",!0,a),n||He("",!0))]}},r_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Xn(56,a)),t.children.length&&(s.onError(Xn(57,a)),t.children.length=0),{props:[Dt(He("textContent",!0),n?Rs(n,s)>0?n:Ht(s.helperString(qo),[n],a):He("",!0))]}},c_=(e,t,s)=>{const n=km(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Xn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Cm,o=!1;if(a==="input"||i){const r=Go(t,"type");if(r){if(r.type===7)l=nc;else if(r.value)switch(r.value.content){case"radio":l=Sm;break;case"checkbox":l=Tm;break;case"file":o=!0,s.onError(Xn(60,e.loc));break}}else qx(t)&&(l=nc)}else a==="select"&&(l=Em);o||(n.needRuntime=s.helper(l))}else s.onError(Xn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},d_=Os("passive,once,capture"),u_=Os("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),p_=Os("left,right"),Nm=Os("onkeyup,onkeydown,onkeypress"),f_=(e,t,s,n)=>{const a=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&nl("COMPILER_V_ON_NATIVE",s)||d_(r)?l.push(r):p_(r)?_s(e)?Nm(e.content.toLowerCase())?a.push(r):i.push(r):(a.push(r),i.push(r)):u_(r)?i.push(r):a.push(r)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Uu=(e,t)=>_s(e)&&e.content.toLowerCase()==="onclick"?He(t,!0):e.type!==4?Gs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,h_=(e,t,s)=>wm(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=f_(i,a,s,e.loc);if(r.includes("right")&&(i=Uu(i,"onContextmenu")),r.includes("middle")&&(i=Uu(i,"onMouseup")),r.length&&(l=Ht(s.helper(Am),[l,JSON.stringify(r)])),o.length&&(!_s(i)||Nm(i.content.toLowerCase()))&&(l=Ht(s.helper(Rm),[l,JSON.stringify(o)])),c.length){const d=c.map(Ca).join("");i=_s(i)?He(`${i.content}${d}`,!0):Gs(["(",i,`) + "${d}"`])}return{props:[Dt(i,l)]}}),m_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Xn(62,a)),{props:[],needRuntime:s.helper(Im)}},v_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},g_=[i_],b_={cloak:s_,html:o_,text:r_,model:c_,on:h_,show:m_};function y_(e,t={}){return t_(e,qe({},a_,t,{nodeTransforms:[v_,...g_,...t.nodeTransforms||[]],directiveTransforms:qe({},b_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Bu=Object.create(null);function x_(e,t){if(!Ue(e))if(e.nodeType)e=e.innerHTML;else return Yt;const s=Mv(e,t),n=Bu[s];if(n)return n;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const a=qe({hoistStatic:!0,onError:void 0,onWarn:Yt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=o=>!!customElements.get(o));const{code:i}=y_(e,a),l=new Function("Vue",i)(Ex);return l._rc=!0,Bu[s]=l}vh(x_);const _o=ta({items:[]});let __=1;function Jo(e,t="info",s=3e3){const n=__++;return _o.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>hd(n),s),n}function hd(e){const t=_o.items.findIndex(s=>s.id===e);t>=0&&_o.items.splice(t,1)}function ye(e,t="info",s=3e3){return Jo(e,t,s)}ye.success=(e,t=3e3)=>Jo(e,"success",t);ye.error=(e,t=5e3)=>Jo(e,"error",t);ye.info=(e,t=3e3)=>Jo(e,"info",t);ye.dismiss=hd;const w_={setup(){return{state:_o,dismiss:hd}},template:`
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
  `},xn=ta({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Qa=null;function qt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Qa&&Qa(!1),xn.title=e,xn.message=t,xn.confirmLabel=s,xn.cancelLabel=n,xn.danger=a,xn.open=!0,new Promise(i=>{Qa=i})}function Hu(e){xn.open=!1,Qa&&(Qa(e),Qa=null)}const k_={setup(){function e(t){xn.open&&t.key==="Escape"&&(t.stopPropagation(),Hu(!1))}return je(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:xn,settle:Hu}},template:`
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
 */const Ba=typeof document<"u";function Dm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function S_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Dm(e.default)}const lt=Object.assign;function vr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ws(a)?a.map(e):e(a)}return s}const Ui=()=>{},Ws=Array.isArray;function zu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Pm=/#/g,T_=/&/g,C_=/\//g,E_=/=/g,A_=/\?/g,Mm=/\+/g,R_=/%5B/g,I_=/%5D/g,Fm=/%5E/g,O_=/%60/g,$m=/%7B/g,L_=/%7C/g,Um=/%7D/g,N_=/%20/g;function md(e){return e==null?"":encodeURI(""+e).replace(L_,"|").replace(R_,"[").replace(I_,"]")}function D_(e){return md(e).replace($m,"{").replace(Um,"}").replace(Fm,"^")}function ac(e){return md(e).replace(Mm,"%2B").replace(N_,"+").replace(Pm,"%23").replace(T_,"%26").replace(O_,"`").replace($m,"{").replace(Um,"}").replace(Fm,"^")}function P_(e){return ac(e).replace(E_,"%3D")}function M_(e){return md(e).replace(Pm,"%23").replace(A_,"%3F")}function F_(e){return M_(e).replace(C_,"%2F")}function ll(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const $_=/\/$/,U_=e=>e.replace($_,"");function gr(e,t,s="/"){let n,a={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(n=t.slice(0,r),i=t.slice(r,o>0?o:t.length),a=e(i.slice(1))),o>=0&&(n=n||t.slice(0,o),l=t.slice(o,t.length)),n=j_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:ll(l)}}function B_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function ju(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function H_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ci(t.matched[n],s.matched[a])&&Bm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ci(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Bm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!z_(e[s],t[s]))return!1;return!0}function z_(e,t){return Ws(e)?Vu(e,t):Ws(t)?Vu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Vu(e,t){return Ws(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function j_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,o;for(l=0;l<n.length;l++)if(o=n[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Vn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let ic=(function(e){return e.pop="pop",e.push="push",e})({}),br=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function V_(e){if(!e)if(Ba){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),U_(e)}const q_=/^[^#]+#/;function G_(e,t){return e.replace(q_,"#")+t}function K_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Zo=()=>({left:window.scrollX,top:window.scrollY});function W_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=K_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function qu(e,t){return(history.state?history.state.position-t:-1)+e}const lc=new Map;function J_(e,t){lc.set(e,t)}function Z_(e){const t=lc.get(e);return lc.delete(e),t}function Y_(e){return typeof e=="string"||e&&typeof e=="object"}function Hm(e){return typeof e=="string"||typeof e=="symbol"}let Tt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const zm=Symbol("");Tt.MATCHER_NOT_FOUND+"",Tt.NAVIGATION_GUARD_REDIRECT+"",Tt.NAVIGATION_ABORTED+"",Tt.NAVIGATION_CANCELLED+"",Tt.NAVIGATION_DUPLICATED+"";function di(e,t){return lt(new Error,{type:e,[zm]:!0},t)}function mn(e,t){return e instanceof Error&&zm in e&&(t==null||!!(e.type&t))}const Q_=["params","query","hash"];function X_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Q_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function ew(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Mm," "),i=a.indexOf("="),l=ll(i<0?a:a.slice(0,i)),o=i<0?null:ll(a.slice(i+1));if(l in t){let r=t[l];Ws(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Gu(e){let t="";for(let s in e){const n=e[s];if(s=P_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ws(n)?n.map(a=>a&&ac(a)):[n&&ac(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function tw(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ws(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const sw=Symbol(""),Ku=Symbol(""),Yo=Symbol(""),vd=Symbol(""),oc=Symbol("");function wi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Zn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(di(Tt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):Y_(p)?r(di(Tt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function yr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Dm(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Zn(c,s,n,l,o,a))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=S_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Zn(p,s,n,l,o,a)()}))}}return i}function nw(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>ci(c,o))?n.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>ci(c,r))||a.push(r))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let aw=()=>location.protocol+"//"+location.host;function jm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,o=a.slice(l);return o[0]!=="/"&&(o="/"+o),ju(o,"")}return ju(s,e)+n+a}function iw(e,t,s,n){let a=[],i=[],l=null;const o=({state:p})=>{const f=jm(e,location),m=s.value,v=t.value;let w=0;if(p){if(s.value=f,t.value=p,l&&l===m){l=null;return}w=v?p.position-v.position:0}else n(f);a.forEach(N=>{N(s.value,m,{delta:w,type:ic.pop,direction:w?w>0?br.forward:br.back:br.unknown})})};function r(){l=s.value}function c(p){a.push(p);const f=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(lt({},p.state,{scroll:Zo()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Wu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Zo():null}}function lw(e){const{history:t,location:s}=window,n={value:jm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:aw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(r,c){i(r,lt({},t.state,Wu(a.value.back,r,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=r}function o(r,c){const d=lt({},a.value,t.state,{forward:r,scroll:Zo()});i(d.current,d,!0),i(r,lt({},Wu(n.value,r,null),{position:d.position+1},c),!1),n.value=r}return{location:n,state:a,push:o,replace:l}}function ow(e){e=V_(e);const t=lw(e),s=iw(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=lt({location:"",base:e,go:n,createHref:G_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function rw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),ow(e)}let ha=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Ut=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Ut||{});const cw={type:ha.Static,value:""},dw=/[a-zA-Z0-9_]/;function uw(e){if(!e)return[[]];if(e==="/")return[[cw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=Ut.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Ut.Static?i.push({type:ha.Static,value:c}):s===Ut.Param||s===Ut.ParamRegExp||s===Ut.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:ha.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Ut.ParamRegExp){n=s,s=Ut.EscapeNext;continue}switch(s){case Ut.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Ut.Param):p();break;case Ut.EscapeNext:p(),s=n;break;case Ut.Param:r==="("?s=Ut.ParamRegExp:dw.test(r)?p():(u(),s=Ut.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Ut.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Ut.ParamRegExpEnd:d+=r;break;case Ut.ParamRegExpEnd:u(),s=Ut.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Ut.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Ju="[^/]+?",pw={sensitive:!1,strict:!1,start:!0,end:!0};var us=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(us||{});const fw=/[.+*?^${}()[\]/\\]/g;function hw(e,t){const s=lt({},pw,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[us.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=us.Segment+(s.sensitive?us.BonusCaseSensitive:0);if(p.type===ha.Static)u||(a+="/"),a+=p.value.replace(fw,"\\$&"),f+=us.Static;else if(p.type===ha.Param){const{value:m,repeatable:v,optional:w,regexp:N}=p;i.push({name:m,repeatable:v,optional:w});const x=N||Ju;if(x!==Ju){f+=us.BonusCustomRegExp;try{`${x}`}catch(y){throw new Error(`Invalid custom RegExp for param "${m}" (${x}): `+y.message)}}let b=v?`((?:${x})(?:/(?:${x}))*)`:`(${x})`;u||(b=w&&c.length<2?`(?:/${b})`:"/"+b),w&&(b+="?"),a+=b,f+=us.Dynamic,w&&(f+=us.BonusOptional),v&&(f+=us.BonusRepeatable),x===".*"&&(f+=us.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=us.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",m=i[p-1];u[m.name]=f&&m.repeatable?f.split("/"):f}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===ha.Static)d+=f.value;else if(f.type===ha.Param){const{value:m,repeatable:v,optional:w}=f,N=m in c?c[m]:"";if(Ws(N)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const x=Ws(N)?N.join("/"):N;if(!x)if(w)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=x}}return d||"/"}return{re:l,score:n,keys:i,parse:o,stringify:r}}function mw(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===us.Static+us.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===us.Static+us.Segment?1:-1:0}function Vm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=mw(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Zu(n))return 1;if(Zu(a))return-1}return a.length-n.length}function Zu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const vw={strict:!1,end:!0,sensitive:!1};function gw(e,t,s){const n=hw(uw(e.path),s),a=lt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function bw(e,t){const s=[],n=new Map;t=zu(vw,t);function a(u){return n.get(u)}function i(u,p,f){const m=!f,v=Qu(u);v.aliasOf=f&&f.record;const w=zu(t,u),N=[v];if("alias"in u){const y=typeof u.alias=="string"?[u.alias]:u.alias;for(const E of y)N.push(Qu(lt({},v,{components:f?f.record.components:v.components,path:E,aliasOf:f?f.record:v})))}let x,b;for(const y of N){const{path:E}=y;if(p&&E[0]!=="/"){const S=p.record.path,L=S[S.length-1]==="/"?"":"/";y.path=p.record.path+(E&&L+E)}if(x=gw(y,p,w),f?f.alias.push(x):(b=b||x,b!==x&&b.alias.push(x),m&&u.name&&!Xu(x)&&l(u.name)),qm(x)&&r(x),v.children){const S=v.children;for(let L=0;L<S.length;L++)i(S[L],x,f&&f.children[L])}f=f||x}return b?()=>{l(b)}:Ui}function l(u){if(Hm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=_w(u,s);s.splice(p,0,u),u.record.name&&!Xu(u)&&n.set(u.record.name,u)}function c(u,p){let f,m={},v,w;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw di(Tt.MATCHER_NOT_FOUND,{location:u});w=f.record.name,m=lt(Yu(p.params,f.keys.filter(b=>!b.optional).concat(f.parent?f.parent.keys.filter(b=>b.optional):[]).map(b=>b.name)),u.params&&Yu(u.params,f.keys.map(b=>b.name))),v=f.stringify(m)}else if(u.path!=null)v=u.path,f=s.find(b=>b.re.test(v)),f&&(m=f.parse(v),w=f.record.name);else{if(f=p.name?n.get(p.name):s.find(b=>b.re.test(p.path)),!f)throw di(Tt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});w=f.record.name,m=lt({},p.params,u.params),v=f.stringify(m)}const N=[];let x=f;for(;x;)N.unshift(x.record),x=x.parent;return{name:w,path:v,params:m,matched:N,meta:xw(N)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:a}}function Yu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Qu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:yw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function yw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Xu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function xw(e){return e.reduce((t,s)=>lt(t,s.meta),{})}function _w(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Vm(e,t[i])<0?n=i:s=i+1}const a=ww(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function ww(e){let t=e;for(;t=t.parent;)if(qm(t)&&Vm(e,t)===0)return t}function qm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function ep(e){const t=Bs(Yo),s=Bs(vd),n=q(()=>{const r=ln(e.to);return t.resolve(r)}),a=q(()=>{const{matched:r}=n.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(ci.bind(null,d));if(p>-1)return p;const f=tp(r[c-2]);return c>1&&tp(d)===f&&u[u.length-1].path!==f?u.findIndex(ci.bind(null,r[c-2])):p}),i=q(()=>a.value>-1&&Ew(s.params,n.value.params)),l=q(()=>a.value>-1&&a.value===s.matched.length-1&&Bm(s.params,n.value.params));function o(r={}){if(Cw(r)){const c=t[ln(e.replace)?"replace":"push"](ln(e.to)).catch(Ui);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:q(()=>n.value.href),isActive:i,isExactActive:l,navigate:o}}function kw(e){return e.length===1?e[0]:e}const Sw=hl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:ep,setup(e,{slots:t}){const s=ta(ep(e)),{options:n}=Bs(Yo),a=q(()=>({[sp(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[sp(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&kw(t.default(s));return e.custom?i:si("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),Tw=Sw;function Cw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Ew(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ws(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function tp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const sp=(e,t,s)=>e??t??s,Aw=hl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Bs(oc),a=q(()=>e.route||n.value),i=Bs(Ku,0),l=q(()=>{let c=ln(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=q(()=>a.value.matched[l.value]);Di(Ku,q(()=>l.value+1)),Di(sw,o),Di(oc,a);const r=h();return Mt(()=>[r.value,o.value,e.name],([c,d,u],[p,f,m])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!ci(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return np(s.default,{Component:p,route:c});const f=u.props[d],m=f?f===!0?c.params:typeof f=="function"?f(c):f:null,w=si(p,lt({},m,t,{onVnodeUnmounted:N=>{N.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return np(s.default,{Component:w,route:c})||w}}});function np(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Rw=Aw;function Iw(e){const t=bw(e.routes,e),s=e.parseQuery||ew,n=e.stringifyQuery||Gu,a=e.history,i=wi(),l=wi(),o=wi(),r=Cc(Vn);let c=Vn;Ba&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=vr.bind(null,Y=>""+Y),u=vr.bind(null,F_),p=vr.bind(null,ll);function f(Y,ge){let V,re;return Hm(Y)?(V=t.getRecordMatcher(Y),re=ge):re=Y,t.addRoute(re,V)}function m(Y){const ge=t.getRecordMatcher(Y);ge&&t.removeRoute(ge)}function v(){return t.getRoutes().map(Y=>Y.record)}function w(Y){return!!t.getRecordMatcher(Y)}function N(Y,ge){if(ge=lt({},ge||r.value),typeof Y=="string"){const I=gr(s,Y,ge.path),F=t.resolve({path:I.path},ge),ee=a.createHref(I.fullPath);return lt(I,F,{params:p(F.params),hash:ll(I.hash),redirectedFrom:void 0,href:ee})}let V;if(Y.path!=null)V=lt({},Y,{path:gr(s,Y.path,ge.path).path});else{const I=lt({},Y.params);for(const F in I)I[F]==null&&delete I[F];V=lt({},Y,{params:u(I)}),ge.params=u(ge.params)}const re=t.resolve(V,ge),ue=Y.hash||"";re.params=d(p(re.params));const Ie=B_(n,lt({},Y,{hash:D_(ue),path:re.path})),g=a.createHref(Ie);return lt({fullPath:Ie,hash:ue,query:n===Gu?tw(Y.query):Y.query||{}},re,{redirectedFrom:void 0,href:g})}function x(Y){return typeof Y=="string"?gr(s,Y,r.value.path):lt({},Y)}function b(Y,ge){if(c!==Y)return di(Tt.NAVIGATION_CANCELLED,{from:ge,to:Y})}function y(Y){return L(Y)}function E(Y){return y(lt(x(Y),{replace:!0}))}function S(Y,ge){const V=Y.matched[Y.matched.length-1];if(V&&V.redirect){const{redirect:re}=V;let ue=typeof re=="function"?re(Y,ge):re;return typeof ue=="string"&&(ue=ue.includes("?")||ue.includes("#")?ue=x(ue):{path:ue},ue.params={}),lt({query:Y.query,hash:Y.hash,params:ue.path!=null?{}:Y.params},ue)}}function L(Y,ge){const V=c=N(Y),re=r.value,ue=Y.state,Ie=Y.force,g=Y.replace===!0,I=S(V,re);if(I)return L(lt(x(I),{state:typeof I=="object"?lt({},ue,I.state):ue,force:Ie,replace:g}),ge||V);const F=V;F.redirectedFrom=ge;let ee;return!Ie&&H_(n,re,V)&&(ee=di(Tt.NAVIGATION_DUPLICATED,{to:F,from:re}),G(re,re,!0,!1)),(ee?Promise.resolve(ee):D(F,re)).catch(X=>mn(X)?mn(X,Tt.NAVIGATION_GUARD_REDIRECT)?X:W(X):C(X,F,re)).then(X=>{if(X){if(mn(X,Tt.NAVIGATION_GUARD_REDIRECT))return L(lt({replace:g},x(X.to),{state:typeof X.to=="object"?lt({},ue,X.to.state):ue,force:Ie}),ge||F)}else X=T(F,re,!0,g,ue);return U(F,re,X),X})}function R(Y,ge){const V=b(Y,ge);return V?Promise.reject(V):Promise.resolve()}function _(Y){const ge=se.values().next().value;return ge&&typeof ge.runWithContext=="function"?ge.runWithContext(Y):Y()}function D(Y,ge){let V;const[re,ue,Ie]=nw(Y,ge);V=yr(re.reverse(),"beforeRouteLeave",Y,ge);for(const I of re)I.leaveGuards.forEach(F=>{V.push(Zn(F,Y,ge))});const g=R.bind(null,Y,ge);return V.push(g),Ne(V).then(()=>{V=[];for(const I of i.list())V.push(Zn(I,Y,ge));return V.push(g),Ne(V)}).then(()=>{V=yr(ue,"beforeRouteUpdate",Y,ge);for(const I of ue)I.updateGuards.forEach(F=>{V.push(Zn(F,Y,ge))});return V.push(g),Ne(V)}).then(()=>{V=[];for(const I of Ie)if(I.beforeEnter)if(Ws(I.beforeEnter))for(const F of I.beforeEnter)V.push(Zn(F,Y,ge));else V.push(Zn(I.beforeEnter,Y,ge));return V.push(g),Ne(V)}).then(()=>(Y.matched.forEach(I=>I.enterCallbacks={}),V=yr(Ie,"beforeRouteEnter",Y,ge,_),V.push(g),Ne(V))).then(()=>{V=[];for(const I of l.list())V.push(Zn(I,Y,ge));return V.push(g),Ne(V)}).catch(I=>mn(I,Tt.NAVIGATION_CANCELLED)?I:Promise.reject(I))}function U(Y,ge,V){o.list().forEach(re=>_(()=>re(Y,ge,V)))}function T(Y,ge,V,re,ue){const Ie=b(Y,ge);if(Ie)return Ie;const g=ge===Vn,I=Ba?history.state:{};V&&(re||g?a.replace(Y.fullPath,lt({scroll:g&&I&&I.scroll},ue)):a.push(Y.fullPath,ue)),r.value=Y,G(Y,ge,V,g),W()}let M;function j(){M||(M=a.listen((Y,ge,V)=>{if(!ce.listening)return;const re=N(Y),ue=S(re,ce.currentRoute.value);if(ue){L(lt(ue,{replace:!0,force:!0}),re).catch(Ui);return}c=re;const Ie=r.value;Ba&&J_(qu(Ie.fullPath,V.delta),Zo()),D(re,Ie).catch(g=>mn(g,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_CANCELLED)?g:mn(g,Tt.NAVIGATION_GUARD_REDIRECT)?(L(lt(x(g.to),{force:!0}),re).then(I=>{mn(I,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_DUPLICATED)&&!V.delta&&V.type===ic.pop&&a.go(-1,!1)}).catch(Ui),Promise.reject()):(V.delta&&a.go(-V.delta,!1),C(g,re,Ie))).then(g=>{g=g||T(re,Ie,!1),g&&(V.delta&&!mn(g,Tt.NAVIGATION_CANCELLED)?a.go(-V.delta,!1):V.type===ic.pop&&mn(g,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),U(re,Ie,g)}).catch(Ui)}))}let J=wi(),A=wi(),k;function C(Y,ge,V){W(Y);const re=A.list();return re.length?re.forEach(ue=>ue(Y,ge,V)):console.error(Y),Promise.reject(Y)}function $(){return k&&r.value!==Vn?Promise.resolve():new Promise((Y,ge)=>{J.add([Y,ge])})}function W(Y){return k||(k=!Y,j(),J.list().forEach(([ge,V])=>Y?V(Y):ge()),J.reset()),Y}function G(Y,ge,V,re){const{scrollBehavior:ue}=e;if(!Ba||!ue)return Promise.resolve();const Ie=!V&&Z_(qu(Y.fullPath,0))||(re||!V)&&history.state&&history.state.scroll||null;return Rt().then(()=>ue(Y,ge,Ie)).then(g=>g&&W_(g)).catch(g=>C(g,Y,ge))}const Z=Y=>a.go(Y);let oe;const se=new Set,ce={currentRoute:r,listening:!0,addRoute:f,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:w,getRoutes:v,resolve:N,options:e,push:y,replace:E,go:Z,back:()=>Z(-1),forward:()=>Z(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:A.add,isReady:$,install(Y){Y.component("RouterLink",Tw),Y.component("RouterView",Rw),Y.config.globalProperties.$router=ce,Object.defineProperty(Y.config.globalProperties,"$route",{enumerable:!0,get:()=>ln(r)}),Ba&&!oe&&r.value===Vn&&(oe=!0,y(a.location).catch(re=>{}));const ge={};for(const re in Vn)Object.defineProperty(ge,re,{get:()=>r.value[re],enumerable:!0});Y.provide(Yo,ce),Y.provide(vd,Tc(ge)),Y.provide(oc,r);const V=Y.unmount;se.add(Y),Y.unmount=function(){se.delete(Y),se.size<1&&(c=Vn,M&&M(),M=null,r.value=Vn,oe=!1,k=!1),V()}}};function Ne(Y){return Y.reduce((ge,V)=>ge.then(()=>_(V)),Promise.resolve())}return ce}function Gm(){return Bs(Yo)}function Ow(e){return Bs(vd)}const Qo={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Ow(),s=Gm(),n=q({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),a=q(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.component)||null}),i=q(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.label)||""});Mt(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},ol=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),cn=e=>Number.isSafeInteger(e)&&e>=0,Lw=e=>e===null||typeof e=="string",wo=(e,t)=>cn(e)&&cn(t)&&t>=e,gd=e=>ol(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&Lw(e.cursor);function Nw(e){return!gd(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&ol(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!cn(e.total_chars)||!cn(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!wo(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&ol(e.tail)&&typeof e.tail.text=="string"&&wo(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function ap(e){return gd(e)&&e.kind==="process_output"&&cn(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>cn(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&wo(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Dw(e){return gd(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>cn(e[t]))&&wo(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&cn(e.tools_omitted)}function rc(e){try{return JSON.parse(e)}catch{return}}const cc=e=>JSON.stringify(e,null,2),Pw=e=>{const t=rc(e);return t===void 0?e:cc(t)},Dl=(e,t,s)=>`[${e}, ${t}) ${s}`;function Km(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:cc(e)??"";let n=typeof e=="string"?rc(e):e,a=null;if(typeof e=="string"&&n===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=rc(e.slice(d+c.length)),f=e.slice(0,u);ap(p)&&!("text"in p)&&f.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(n=p,a=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?Pw(d):d});if(ol(n)&&n.kind==="audit_preview"&&n.audit_clipped===!0&&(!("original_chars"in n)||cn(n.original_chars))&&(!("preview"in n)||typeof n.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...cn(n.original_chars)?[`original ${n.original_chars} code points`]:[]],ol(n.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof n.source[c])&&i.header.push(`source ${c}: ${n.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:n.preview??(t?"(no preview retained in audit)":"")}),i.metadata=n,i}if(Nw(n))i.kind="tool_output",i.header=[n.status,`retention: ${n.retention}`],n.retention==="retained"?(i.header.push(`${n.total_bytes} UTF-8 bytes`,`${n.total_chars} code points`),i.sections.push(l(`${"head"in n?"Head":"Page"} ${Dl(n.start,n.end,"code points")}`,n.head??n.text)),(o=n.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Dl(n.tail.start,n.tail.end,"code points")} — not a continuation`,n.tail.text))):(i.header.push(n.error),i.sections.push(l("Head — retention failed",n.head),l("Tail context only — may overlap head",n.tail.text))),typeof((r=n.matches)==null?void 0:r.summary)=="string"&&i.header.push(n.matches.summary);else if(ap(n)&&(typeof n.text=="string"||a!==null)){i.kind="process_output",i.header=[n.status,`PID ${n.pid}`,...n.exit_code!==null?[`exit ${n.exit_code}`]:[],`emitted ${n.emitted_bytes} B`,`retained ${n.retained_bytes} B`,`shown ${n.shown_bytes} B`,`capture-limit loss ${n.capture_limit_loss_bytes} B`,`not retained ${n.not_retained_bytes} B`],n.capture_error&&i.header.push(`capture error: ${n.capture_error}`),n.tail_status&&i.header.push(`recent output: ${n.tail_status}`);const c=n.shown_intervals.map(d=>Dl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${a!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,a??n.text))}else if(Dw(n))i.kind="agent_result",i.header=[n.status,`agent ${n.id}`,n.label,`original ${n.original_bytes} B`,`result ${n.result_bytes} B`,`error ${n.error_bytes} B`,`source ${n.source_original_bytes} B`,`tools ${n.tools_used.length} shown / ${n.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Dl(n.offset,n.end,"UTF-8 bytes")}`,n.preview));else return i.kind=n===void 0?"text":"json",i.sections.push({label:"",text:n===void 0||!t&&typeof e=="string"?s:t?cc(n):JSON.stringify(n)}),i;if(i.metadata=n,i.header.push(`source truncated: ${n.truncated?"yes":"no"}`,`cursor: ${n.cursor?"present":"none"}`),typeof n.expires_at=="string"&&i.header.push(`expires: ${n.expires_at}`),typeof n.expires_at=="number"){const c=new Date(n.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function Wm(e,t=30,s=6e3){let n=1,a=0,i=0;if(t>0&&s>0)for(const l of e){if(a>=s||l===`
`&&n>=t)break;l===`
`&&n++,a++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:a,lines:n}}const xr=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Mw=e=>e!==null&&typeof e=="object",Fw=new Set(["_hmac","_prev_hmac"]),dc=e=>e.replace(/\r\n?/g,`
`);function rl(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const n=JSON.parse(t,(a,i)=>{if(Fw.has(a)){s=!0;return}return i});return dc(s?JSON.stringify(n):t)}catch{return dc(t)}}function $w(e){const t=e.metadata;if(!t)return[];const s=[],n=e.kind==="audit_preview"&&Mw(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),n.truncated===!0&&s.push("source truncated"),n.retention==="failed"&&s.push("retention unavailable"),n.capture_error&&s.push(`capture unavailable: ${n.capture_error}`),n.capture_limit_loss_bytes>0&&s.push(`capture loss ${n.capture_limit_loss_bytes} B`),n.not_retained_bytes>0&&s.push(`not retained ${n.not_retained_bytes} B`),n.capture_lost_bytes>0&&s.push(`capture lost ${n.capture_lost_bytes} B`),n.dropped_bytes>0&&s.push(`dropped ${n.dropped_bytes} B`),(n.capture_loss===!0||n.output_lost===!0||n.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(n.exit_code)&&n.exit_code!==0&&s.push(`process exit ${n.exit_code}`),["failed","error","cancelled","timed_out"].includes(n.status)&&s.push(`source ${n.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function Uw(e){var f;const t=Km(typeof e=="string"?dc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:rl(m.text)})),n=s.map(m=>m.text).filter(Boolean).join(`
`),a=n.replace(/\n$/,""),i=[...n].length,l=a?a.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>xr.inlineChars||o&&a.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=Wm(c,xr.previewLines,xr.previewChars),u=t.kind==="audit_preview"?(f=t.metadata)==null?void 0:f.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:a.replace(/\n/g," "),warnings:$w(t)}}const Bw={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=h(!1),s=h(!0),n=h(!1),a=h(""),i=h(null),l=h(null),o=h(!1),r=q(()=>Uw(e.value)),c=q(()=>{const y=e.rawValue===void 0?e.value:e.rawValue;return typeof y=="string"?y:JSON.stringify(y,null,2)??""}),d=q(()=>n.value?c.value:r.value.formatted),u=q(()=>r.value.promoted&&r.value.preview.folded||o.value),p=q(()=>t.value?!!d.value:r.value.promoted),f=q(()=>p.value?"":r.value.summary);let m;function v(){if(t.value)return;const y=r.value.promoted?i.value:l.value;o.value=!!(y&&(y.scrollHeight>y.clientHeight+1||y.scrollWidth>y.clientWidth+1))}function w(){m==null||m.disconnect();for(const y of[i.value,l.value])y&&(m==null||m.observe(y));v()}function N(){t.value=!t.value,t.value||(n.value=!1)}function x(){n.value=!n.value,t.value=!0,a.value=""}async function b(){const y=e.value;try{await navigator.clipboard.writeText(d.value),y===e.value&&(a.value="Copied")}catch{y===e.value&&(a.value="Copy unavailable — select text manually")}}return Mt([()=>e.value,()=>e.rawValue,()=>e.recordId],(y,E)=>{(e.recordId===null||y[2]!==E[2])&&(t.value=!1,n.value=!1),a.value=""}),Mt([i,l,t,s,r],()=>Rt(w),{flush:"post"}),je(()=>{m=new ResizeObserver(v),w()}),ft(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:n,copyStatus:a,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:f,toggleExpanded:N,toggleRaw:x,copyOutput:b}},template:`
    <section class="output-renderer output-compact" :class="{ 'output-compact-expanded': expanded }" :aria-label="label">
      <div class="output-event-row">
        <div class="output-event-heading">
          <slot name="header" />
          <div class="output-compact-actions" @pointerdown.stop @keydown.stop>
            <div v-if="model.chars > 0" class="output-controls">
              <button type="button" :aria-pressed="wrapped" @click="wrapped = !wrapped">Wrap</button>
              <button type="button" :aria-pressed="rawMode" @click="toggleRaw" title="Inspect raw retained record">Raw</button>
              <button type="button" @click="copyOutput" :title="rawMode ? 'Copy raw retained record' : 'Copy complete display body'">Copy</button>
            </div>
            <button type="button" class="output-expand" :aria-expanded="expanded" @click="toggleExpanded"
                    :title="canExpand ? 'More received text hidden locally — expand without retrieving' : 'Inspect already-loaded record'">
              {{ expanded ? 'Collapse' : model.promoted ? 'Expand' : 'Inspect' }}
            </button>
          </div>
          <span v-if="headerSummary.trim() || model.outcome || hasContext || model.warnings.length" class="output-control-separator output-summary-separator" aria-hidden="true"> — </span>
        </div>
        <button v-if="model.warnings.length" type="button" class="output-compact-warning" @click="expanded = true"
                @pointerdown.stop @keydown.stop :aria-label="model.warnings.join('; ') + ' — inspect record'" :title="model.warnings.join('; ')">
          <span class="output-warning-full">{{ model.warnings.join('; ') }}</span><span class="output-warning-short" aria-hidden="true">Warning</span>
        </button>
        <span ref="summaryElement" class="output-inline-summary">
          <slot name="context" />
          <span v-if="model.outcome" class="output-compact-outcome" :title="model.outcome">{{ model.outcome }}</span>
          {{ headerSummary }}
        </span>
      </div>
      <pre v-if="showBody" ref="previewElement" class="output-body output-compact-preview"
           :class="{ 'output-wrapped': wrapped, 'output-compact-folded': !expanded }">{{ expanded ? body : model.preview.text }}</pre>
      <div v-if="expanded && !rawMode" class="output-compact-detail">
        <div v-if="model.warnings.length" class="output-compact-warning-detail">{{ model.warnings.join('; ') }}</div>
        <div v-if="model.header.length" class="output-compact-envelope-detail">{{ model.header.join(' · ') }}</div>
        <slot name="details" />
      </div>
      <span v-if="copyStatus" class="output-copy-status" role="status">{{ copyStatus }}</span>
    </section>`},Xo={name:"ToolOutput",components:{CompactOutput:Bw},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=h(!1),s=h(!0),n=h(!1),a=h(""),i=q(()=>Km(e.value)),l=q(()=>n.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=q(()=>{let u=30,p=6e3;return l.value.map(f=>{const m=Wm(f.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...f,display:t.value?f.text:m.text,folded:m.folded}})}),r=q(()=>o.value.some(u=>u.folded)),c=q(()=>n.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(a.value="Copied")}catch{e.value===u&&(a.value="Copy unavailable — select text manually")}}return Mt(()=>e.value,()=>{t.value=!1,a.value=""}),Mt(n,()=>{t.value=!1,a.value=""}),{expanded:t,wrapped:s,rawMode:n,copyStatus:a,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
    <compact-output v-if="presentation === 'compact'" :value="value" :raw-value="rawValue" :label="label" :has-context="hasContext" :record-id="recordId">
      <template #header><slot name="header" /></template>
      <template #context><slot name="context" /></template>
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
  `},Hw={components:{ToolOutput:Xo},setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var v,w,N,x,b,y,E,S,L,R,_;const f=p.payload||p,m=f.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(f.agent_id||(v=f.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(f.call_id||(w=f.metadata)!=null&&w.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const D=f.call_id||((N=f.metadata)==null?void 0:N.call_id)||null,U=f.agent_id||((x=f.metadata)==null?void 0:x.agent_id)||"",T={callId:D,agentId:U,agentLabel:f.agent_label||((b=f.metadata)==null?void 0:b.agent_label)||"",toolInput:f.tool_input,id:D?`${U}:${D}`:`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:f.iteration??((y=f.metadata)==null?void 0:y.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(T);return}if(m==="tool_end"||m==="loop_tool"){const D=f.call_id||((E=f.metadata)==null?void 0:E.call_id)||null,U=f.agent_id||((S=f.metadata)==null?void 0:S.agent_id)||"";let T=-1;if(D&&(T=e.value.findIndex(M=>M.callId===D&&M.agentId===U&&M.status==="running")),T<0&&!D)for(let M=e.value.length-1;M>=0;M--){const j=e.value[M];if(j.tool===f.action&&j.agentId===U&&j.status==="running"){T=M;break}}if(T>=0){const M=e.value[T];M.status=f.error||(L=f.metadata)!=null&&L.error||["error","failed","cancelled","denied","outcome_unknown"].includes(f.status||((R=f.metadata)==null?void 0:R.status))?"error":"success",M.elapsed=f.execution_time_ms??f.duration_ms??((_=f.metadata)==null?void 0:_.elapsed_ms)??Date.now()-M.startTime,M.result=f.result_summary??f.detail??"",M.fadingOut=!0,setTimeout(()=>{const j=e.value.indexOf(M);j>=0&&e.value.splice(j,1),t.value.unshift(M),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const D=f.call_id||f.tool_name||"unknown";if(f.finished){const U={...s.value};delete U[D],s.value=U}else{const T=((s.value[D]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[D]:T.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let o=!1;function r(){o||(o=!0,Ye.on("events",a),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,Ye.off("events",a),i&&(clearInterval(i),i=null))}je(r),Qt(r),Gt(c),ft(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function bd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Aa(e){const t=bd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function zw(e){const t=bd(e);return t?t.toLocaleTimeString():"—"}function Jm(e){const t=bd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function jw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function ui(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function yd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Zm(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function ip(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function xd(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function Ym(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Qm=Symbol("agent-detail-cancelled"),Vw=15e3;function qw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((f,m)=>{r=f,c=m});function u(f,m){o||(o=!0,l!==null&&a(l),l=null,(f?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return o||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!o&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Qm),i==null||i.abort()}}}function Xm({state:e,requestDetail:t,timeoutMs:s=Vw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:f,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const w=qw(N=>t(p,{signal:N}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=w.cancel,v.promise=(async()=>{let N=null,x=null;try{N=await w.promise}catch(b){x=b}N!==Qm&&(l!==v||e.detailId!==p||(l=null,!x&&(N===null||typeof N!="object")&&(x=new Error(`${n} response was empty or invalid`)),x?e.detail===null&&(e.detailError=(x==null?void 0:x.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=N,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Gw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&n())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const Kw={components:{ToolOutput:Xo},template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const o=q(()=>e.value.filter(C=>C.status==="running").length),r=q(()=>e.value.filter(C=>C.status==="completed").length),c=q(()=>e.value.filter(C=>["failed","timeout","killed"].includes(C.status)).length),d=q(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=q(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(C=>["failed","timeout","killed"].includes(C.status)):e.value.filter(C=>C.status===i.value));function p(C){const $=Number(C.max_iterations)||0;return $<=0?0:Math.min(100,Math.round(C.iteration_count/$*100))}function f(C){return(Number(C.max_iterations)||0)>0}function m(C,$){return C?C==="N/A"?"N/A":$==="current_inheritance"?`inherit (currently ${C})`:C:"unknown"}function v(C){return m(C.display_model,C.display_model_source||C.display_source)}function w(C){return m(C.display_reasoning_effort,C.display_reasoning_effort_source||C.display_source)}function N(C){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[C]||""}const x=h(null),b=h(null),y=h(!1),E=h(null),S=h(""),R=Xm({state:{get detail(){return x.value},set detail(C){x.value=C},get detailId(){return b.value},set detailId(C){b.value=C},get detailLoading(){return y.value},set detailLoading(C){y.value=C},get detailError(){return E.value},set detailError(C){E.value=C}},requestDetail:(C,{signal:$})=>z.get(`/api/agents/${encodeURIComponent(C)}`,{signal:$})});async function _(C){S.value="",await R.open(C.id)}function D(){R.close(),S.value=""}async function U(){await R.refresh()}async function T(C,$){try{await navigator.clipboard.writeText($||""),S.value=C,setTimeout(()=>{S.value===C&&(S.value="")},1500)}catch{ye.error("Copy failed")}}async function M(C=!1){C=C===!0,C||(t.value=!0);try{const $=await z.get("/api/agents");e.value=Array.isArray($)?$:[],s.value=null}catch($){C||(s.value=$.message)}C||(t.value=!1)}async function j(C){const $=e.value.find(G=>G.id===C);if(await qt({title:"Kill agent",message:`Kill agent "${($==null?void 0:$.label)||C}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=C;try{await z.del(`/api/agents/${encodeURIComponent(C)}`),ye.success("Agent killed"),await M()}catch(G){ye.error(G.message||"Failed to kill agent")}n.value=null}}const J=Gw({isEnabled:()=>a.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!b.value,refreshDetail:U});function A(){J.start()}function k(){J.stop()}return Mt(a,()=>J.sync()),je(()=>{l=!0,M(),A()}),Qt(()=>{l=!0,M(!0),A()}),Gt(()=>{l=!1,k()}),ft(()=>{l=!1,k(),R.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Aa,formatDuration:ui,progressPercent:p,hasProgress:f,displayModelText:v,displayEffortText:w,displaySourceLabel:N,detail:x,detailId:b,detailLoading:y,detailError:E,copied:S,openDetail:_,closeDetail:D,copyText:T,fetchAgents:M,killAgent:j,startAutoRefresh:A,stopAutoRefresh:k}}},Ww={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),o=h(null),r=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let m=!1;const w=Xm({state:{get detail(){return c.value},set detail(k){c.value=k},get detailId(){return d.value},set detailId(k){d.value=k},get detailLoading(){return u.value},set detailLoading(k){u.value=k},get detailError(){return p.value},set detailError(k){p.value=k}},detailLabel:"Loop detail",requestDetail:(k,{signal:C})=>z.get(`/api/loops/${encodeURIComponent(k)}?limit=100`,{signal:C})});async function N(k){f.value="",await w.open(k.id)}function x(){w.close(),f.value=""}async function b(k,C){try{await navigator.clipboard.writeText(C||""),f.value=k,setTimeout(()=>{f.value===k&&(f.value="")},1500)}catch{ye.error("Copy failed")}}const y=q(()=>e.value.reduce((k,C)=>k+(C.iteration_count||0),0)),E=q(()=>e.value.filter(k=>k.status==="running").length);function S(k){return k==="running"?"loop-status-running":k==="error"?"loop-status-error":"loop-status-stopped"}function L(k){return k==="running"?"badge-success":k==="error"?"badge-danger":k==="completed"?"badge-info":"badge-warning"}function R(k){return k==="act"?"badge-warning":k==="silent"?"badge-info":"badge-success"}async function _(k=!1){k=k===!0,k||(t.value=!0);try{const C=await z.get("/api/loops");e.value=Array.isArray(C)?C:[],s.value=null}catch(C){k||(s.value=C.message)}k||(t.value=!1)}async function D(){l.value=null;const k=a.value;if(!k.goal.trim()){l.value="Goal is required";return}if(!k.channel_id.trim()){l.value="Channel ID is required";return}const C={goal:k.goal.trim(),channel_id:k.channel_id.trim(),interval_seconds:k.interval_seconds||60,mode:k.mode,max_iterations:k.max_iterations||50};k.stop_condition.trim()&&(C.stop_condition=k.stop_condition.trim()),i.value=!0;try{const $=await z.post("/api/loops",C);ye.success(`Loop started: ${$.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await _()}catch($){l.value=$.message}i.value=!1}async function U(k){if(await qt({title:"Stop loop",message:`Stop loop ${k}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=k;try{await z.del(`/api/loops/${encodeURIComponent(k)}`),ye.success("Loop stopped"),await _()}catch($){ye.error($.message||"Failed to stop loop")}o.value=null}}async function T(k){r.value=k;try{await z.post(`/api/loops/${encodeURIComponent(k)}/restart`),ye.success("Loop restarted"),await _()}catch(C){ye.error(C.message||"Failed to restart loop")}r.value=null}function M(k){m&&k.payload&&(k.payload.loop_id||k.payload.type==="loop")&&(_(!0),d.value&&w.refresh())}let j=null;function J(){j!==null&&clearInterval(j),j=null}function A(){J(),m&&(j=setInterval(()=>{_(!0),d.value&&w.refresh()},5e3))}return je(()=>{m=!0,_(),Ye.subscribe("events",M),A()}),Qt(()=>{m=!0,_(!0),A()}),Gt(()=>{m=!1,J()}),ft(()=>{m=!1,Ye.unsubscribe("events",M),J(),w.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:y,runningCount:E,statusDotClass:S,statusBadge:L,modeBadge:R,formatAge:Jm,formatDuration:ui,formatTs:Aa,formatTokens:Ym,openDetail:N,closeDetail:x,copyText:b,fetchLoops:_,doCreate:D,doStop:U,doRestart:T}}},Jw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=q(()=>e.value.filter(x=>x.status==="running").length),o=q(()=>e.value.filter(x=>x.status!=="running").length);function r(x){return x==="running"?"loop-status-running":x==="failed"||x==="error"?"loop-status-error":"loop-status-stopped"}function c(x){return x==="running"?"badge-success":x==="completed"||x==="exited"?"badge-info":x==="killed"||x==="error"||x==="failed"?"badge-danger":"badge-warning"}async function d(x=!1){x=x===!0,x||(t.value=!0);try{e.value=await z.get("/api/processes"),s.value=null}catch(b){x||(s.value=b.message)}x||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}Mt(n,x=>{x?u():p()});async function f(x){if(await qt({title:"Kill process",message:`Kill process ${x}?`,confirmLabel:"Kill",danger:!0})){i.value=x;try{await z.del(`/api/processes/${x}`),ye.success(`Process ${x} killed`),await d()}catch(y){ye.error(y.message||"Failed to kill process")}i.value=null}}function m(x){x.payload&&(x.payload.pid||x.payload.type==="process")&&d(!0)}let v=!1;function w(){v||(v=!0,d(),Ye.subscribe("events",m),u())}function N(){v&&(v=!1,Ye.unsubscribe("events",m),p())}return je(w),Qt(w),Gt(N),ft(N),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:ui,fetchProcesses:d,doKill:f}}},Zw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function lp(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function Yw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function Qw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function Xw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=Zw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),m=[];for(const w of new Set([p,f])){const N=new Date(u+w*6e4);Yw(N,c)===d&&(m.some(x=>x.getTime()===N.getTime())||m.push(N))}if(m.sort((w,N)=>w.getTime()-N.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(w=>({instant:w,offset:Qw(w),iso:w.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const ek={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),o=h(null),r=q(()=>Xw(a.value.run_at));Mt(()=>a.value.run_at,()=>{o.value=null});const c=q(()=>{var re;const V=r.value;return V.state==="ok"?V.instant:V.state==="ambiguous"&&o.value!==null&&((re=V.options[o.value])==null?void 0:re.instant)||null}),d=q(()=>{const V=c.value;return V?`${V.toLocaleString()} local — ${V.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=h(null),v=h(null),w=h(null),N=h(null),x=h(null),b=h(null),y=h([]),E=h(!1),S=h("");let L=0;const R=q(()=>e.value.filter(V=>V.cron&&!V.one_time).length),_=q(()=>e.value.filter(V=>V.one_time).length),D=q(()=>e.value.filter(V=>V.trigger).length),U=q(()=>e.value.filter(V=>V.paused).length),T=q(()=>e.value.filter(V=>V.consecutive_failures>0).length);function M(V){if(!V)return"-";const re=Date.now(),Ie=(new Date(V).getTime()-re)/1e3;if(Ie<0)return"overdue";if(Ie<60)return"in < 1 min";if(Ie<3600)return`in ${Math.floor(Ie/60)} min`;if(Ie<86400){const I=Math.floor(Ie/3600),F=Math.floor(Ie%3600/60);return F>0?`in ${I}h ${F}m`:`in ${I}h`}const g=Math.floor(Ie/86400);return`in ${g} day${g!==1?"s":""}`}function j(V){return V==null?"-":V<1e3?`${V}ms`:V<6e4?`${(V/1e3).toFixed(1)}s`:ui(V/1e3)}function J(V=a.value.cron){a.value.cron=V,lp(a.value,"cron"),u.value=null}function A(V=a.value.run_at){a.value.run_at=V,lp(a.value,"run_at"),u.value=null}async function k(){const V=a.value.cron.trim();if(V){p.value=!0;try{u.value=await z.post("/api/schedules/validate-cron",{expression:V})}catch(re){u.value={valid:!1,error:re.message}}p.value=!1}}async function C(){t.value=!0,s.value=null;try{e.value=await z.get("/api/schedules")}catch(V){s.value=V.message}t.value=!1}async function $(V){if(b.value===V){b.value=null,y.value=[];return}b.value=V,E.value=!0,y.value=[];const re=++L;try{const ue=await z.get(`/api/schedules/${encodeURIComponent(V)}/history?limit=10`);if(re!==L||b.value!==V)return;y.value=ue,S.value=""}catch(ue){if(re!==L||b.value!==V)return;y.value=[],S.value=ue.message||"Failed to load execution history"}re===L&&(E.value=!1)}async function W(){l.value=null;const V=a.value;if(!V.description.trim()){l.value="Description is required";return}if(!V.channel_id.trim()){l.value="Channel ID is required";return}if(!V.cron.trim()&&!V.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(V.cron.trim()&&V.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const re={description:V.description.trim(),action:V.action,channel_id:V.channel_id.trim()};if(V.cron.trim()&&(re.cron=V.cron.trim()),V.run_at.trim()){const ue=r.value;if(ue.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){l.value="One-time run time is not a valid date";return}const Ie=c.value;if(ue.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Ie){l.value="One-time run time could not be resolved";return}re.run_at=Ie.toISOString()}if(V.action==="reminder"&&V.message.trim()&&(re.message=V.message.trim()),V.action==="check"&&(V.tool_name.trim()&&(re.tool_name=V.tool_name.trim()),V.report_format&&(re.report_format=V.report_format),V.tool_input_str.trim()))try{re.tool_input=JSON.parse(V.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await z.post("/api/schedules",re),ye.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await C()}catch(ue){l.value=ue.message}i.value=!1}async function G(V){m.value=V;try{const re=await z.post(`/api/schedules/${encodeURIComponent(V)}/run`);if(re.status==="failure")ye.error(`Execution failed: ${re.error||"unknown error"}`);else{const ue=re.warning?`Executed (${re.warning})`:"Executed successfully";ye.success(ue)}await C()}catch(re){ye.error(re.message||"Failed to trigger")}m.value=null}async function Z(V){w.value=V.id;const re=!V.paused;try{await z.put(`/api/schedules/${encodeURIComponent(V.id)}`,{paused:re}),ye.success(re?"Schedule paused":"Schedule resumed"),await C()}catch(ue){ye.error(ue.message||"Failed to update schedule")}w.value=null}const oe=new Map;function se(V,re){const ue=oe.get(V.id);ue&&clearTimeout(ue.timer);const Ie={run:()=>ce(V,re),timer:null};Ie.timer=setTimeout(()=>{oe.delete(V.id),Ie.run()},500),oe.set(V.id,Ie)}async function ce(V,re){x.value=V.id;try{await z.put(`/api/schedules/${encodeURIComponent(V.id)}`,{report_format:re}),ye.success(re?"Structured report enabled":"Plain-text report enabled")}catch(ue){ye.error(`Update failed: ${ue.message}`)}finally{await C(),x.value=null}}function Ne(){for(const[V,re]of[...oe])clearTimeout(re.timer),oe.delete(V),re.run()}async function Y(V){N.value=V;try{await z.post(`/api/schedules/${encodeURIComponent(V)}/reset-failures`),ye.success("Failure counters reset"),await C()}catch(re){ye.error(re.message||"Failed to reset")}N.value=null}async function ge(V){const re=e.value.find(Ie=>Ie.id===V);if(await qt({title:"Delete schedule",message:`Delete "${(re==null?void 0:re.description)||V}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=V;try{await z.del(`/api/schedules/${encodeURIComponent(V)}`),ye.success("Schedule deleted"),await C()}catch(Ie){ye.error(Ie.message||"Failed to delete schedule")}v.value=null}}return je(()=>{C()}),ft(Ne),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:f,runningId:m,deletingId:v,togglingId:w,resettingId:N,reportUpdatingId:x,flushReportFormatTimers:Ne,expandedId:b,history:y,historyLoading:E,historyError:S,cronCount:R,oneTimeCount:_,webhookCount:D,pausedCount:U,failingCount:T,formatTs:Aa,formatAge:Jm,formatFuture:M,formatMs:j,formatDuration:ui,onCronInput:J,onRunAtInput:A,validateCron:k,toggleExpand:$,fetchSchedules:C,doCreate:W,doRunNow:G,doTogglePause:Z,doUpdateReportFormat:se,doResetFailures:Y,doDelete:ge}}},ev=[{id:"live",label:"Live",component:Hw},{id:"agents",label:"Agents",component:Kw},{id:"loops",label:"Loops",component:Ww},{id:"processes",label:"Processes",component:Jw},{id:"schedules",label:"Schedules",component:ek}],tk={components:{TabbedPage:Qo},setup(){return{tabs:ev}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},sk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){n.value=n.value===m?null:m}function o(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},f()}let r=0;const c=h(!1),d=h(null),u=h(null);async function p(){c.value=!0,u.value=null;try{d.value=await z.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function f(){const m=++r;t.value=!0,s.value=null,n.value=null;try{const v=new URLSearchParams;a.value.tool&&v.set("tool",a.value.tool),a.value.user&&v.set("user",a.value.user),a.value.keyword&&v.set("q",a.value.keyword),a.value.date&&v.set("date",a.value.date),v.set("limit",String(a.value.limit));const w=v.toString(),N=await z.get(`/api/audit${w?"?"+w:""}`);if(m!==r)return;e.value=Array.isArray(N)?N:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return je(()=>{f()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Aa,formatDetail:i,truncateBlock:Zm,toggleExpand:l,clearFilters:o,fetchAudit:f,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},op=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],nk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],ak={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const o=h(null),r=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),m=h(!1),v=op,w=nk,N=h([]),x=h(!1),b=h(""),y=h("flat"),E=h(new Set),S=h(""),L=h(""),R=h(""),_=h(null),D=h(!1),U=h(""),T=h(!1);let M=0;Mt([S,L,R],()=>{M++,D.value=!1,U.value="",T.value=_.value!==null},{flush:"sync"});function j(){try{const ie=localStorage.getItem("odin-session-presets");ie&&(N.value=JSON.parse(ie))}catch{}}function J(){try{localStorage.setItem("odin-session-presets",JSON.stringify(N.value))}catch{}}const A=q(()=>p.value.trim()!==""||u.value!=="all"),k=q(()=>{let ie=[...e.value];const Se=op.find(Ve=>Ve.id===u.value),Le=Se?Se.filters:{};if(Le.source&&(ie=ie.filter(Ve=>Ve.source===Le.source)),Le.minMessages&&(ie=ie.filter(Ve=>Ve.message_count>=Le.minMessages)),Le.hasCompaction&&(ie=ie.filter(Ve=>Ve.has_summary)),Le.maxAge!=null){const Ve=Date.now()/1e3;ie=ie.filter($t=>$t.last_active&&Ve-$t.last_active<=Le.maxAge)}if(p.value.trim()){const Ve=p.value.toLowerCase().trim();ie=ie.filter($t=>($t.channel_id||"").toLowerCase().includes(Ve)||($t.last_user_id||"").toLowerCase().includes(Ve)||($t.source||"").toLowerCase().includes(Ve))}const Ke=f.value,Et=m.value?1:-1;return ie.sort((Ve,$t)=>{const zt=Ve[Ke]||0,rs=$t[Ke]||0;return(zt-rs)*Et}),ie}),C=q(()=>{if(!a.value||!a.value.messages)return[];const ie=a.value.messages;if(ie.length===0)return[];const Se=[];let Le=[];for(const Ke of ie)Ke.role==="user"&&Le.length>0&&(Se.push(Le),Le=[]),Le.push(Ke);return Le.length>0&&Se.push(Le),Se}),$=q(()=>k.value.length>0&&c.value.size===k.value.length);function W(ie){const Se=ie.find(Le=>Le.role==="user");if(Se&&Se.content){const Le=Se.content.slice(0,120);return Le.length<Se.content.length?Le+"...":Le}return"(no user message)"}function G(ie){const Se=new Set(E.value);Se.has(ie)?Se.delete(ie):Se.add(ie),E.value=Se}function Z(ie){u.value=ie}function oe(ie){u.value=ie.id,ie.filters.searchQuery!=null&&(p.value=ie.filters.searchQuery),ie.filters.sortBy&&(f.value=ie.filters.sortBy)}function se(){if(!b.value.trim())return;const ie={id:"custom-"+Date.now(),name:b.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};N.value=[...N.value,ie],J(),x.value=!1,b.value=""}function ce(ie){N.value=N.value.filter(Se=>Se.id!==ie),J(),u.value===ie&&(u.value="all")}function Ne(){u.value="all",p.value="",f.value="last_active",m.value=!1}function Y(ie){if(!ie)return"—";const Se=Date.now()/1e3-ie;if(Se<60)return"just now";if(Se<3600){const Ke=Math.floor(Se/60);return`${Ke} minute${Ke!==1?"s":""} ago`}if(Se<86400){const Ke=Math.floor(Se/3600);return`${Ke} hour${Ke!==1?"s":""} ago`}const Le=Math.floor(Se/86400);return`${Le} day${Le!==1?"s":""} ago`}function ge(ie){if(!ie)return"";try{return new Date(ie*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function V(ie){if(!ie)return"";try{return new Date(ie*1e3).toLocaleString()}catch{return""}}function re(ie){return ie==="user"?"bg-gray-900/50 border border-gray-800":ie==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function ue(ie){return ie==="user"?"sess-msg-user":ie==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Ie(ie){return ie==="user"?"badge-info":ie==="assistant"?"badge-success":"badge-warning"}function g(ie){return ie==="user"?"sess-dot-user":ie==="assistant"?"sess-dot-assistant":"sess-dot-system"}function I(ie){return ie==="user"?"text-cyan-400":ie==="assistant"?"text-indigo-400":"text-gray-500"}function F(ie){return ie?ie.length>2e3?ie.slice(0,2e3)+`
... (truncated)`:ie:""}async function ee(){const ie=S.value.trim();if(!ie)return;const Se=++M;D.value=!0,U.value="",T.value=_.value!==null;try{let Le=`/api/sessions/search?q=${encodeURIComponent(ie)}&limit=50`;L.value.trim()&&(Le+=`&channel_id=${encodeURIComponent(L.value.trim())}`),R.value.trim()&&(Le+=`&user_id=${encodeURIComponent(R.value.trim())}`);const Ke=await z.get(Le);if(Se!==M)return;_.value=Ke.results||[],T.value=!1}catch(Le){if(Se!==M)return;U.value=Le.message||"Search failed. Please retry."}finally{Se===M&&(D.value=!1)}}function X(){M++,S.value="",L.value="",R.value="",_.value=null,U.value="",T.value=!1,D.value=!1}function ae(ie){return ie?ie.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function fe(ie){return ie==="user"?"fts-result-user":ie==="assistant"?"fts-result-assistant":ie==="summary"?"fts-result-summary":ie==="fts"?"fts-result-fts":ie==="channel"?"fts-result-channel":"fts-result-default"}function pe(ie){return ie==="user"?"badge-info":ie==="assistant"?"badge-success":ie==="summary"?"badge-warning":ie==="fts"?"badge-success":"badge-info"}let de=0;async function le(){const ie=++de;t.value=!0,s.value=null;try{const Se=await z.get("/api/sessions");if(ie!==de)return;e.value=Se}catch(Se){if(ie!==de)return;s.value=Se.message}ie===de&&(t.value=!1)}function xe(){s.value=null,le()}async function me(ie){if(n.value===ie){n.value=null,a.value=null,E.value=new Set;return}n.value=ie,a.value=null,i.value=!0,E.value=new Set;const Se=++l;try{const Le=await z.get(`/api/sessions/${encodeURIComponent(ie)}`);Se===l&&n.value===ie&&(a.value=Le)}catch(Le){Se===l&&n.value===ie&&(a.value={messages:[],summary:"",error:Le.message||"Failed to load session"})}finally{Se===l&&(i.value=!1)}}function _e(ie){const Se=new Set(c.value);Se.has(ie)?Se.delete(ie):Se.add(ie),c.value=Se}function Re(){$.value?c.value=new Set:c.value=new Set(k.value.map(ie=>ie.channel_id))}function B(ie){o.value=ie}async function ve(){if(o.value){r.value=!0;try{await z.del(`/api/sessions/${encodeURIComponent(o.value)}`),n.value===o.value&&(n.value=null,a.value=null),c.value.delete(o.value),await le()}catch(ie){s.value=ie.message||"Failed to clear session"}r.value=!1,o.value=null}}function ke(){d.value=!0}async function Oe(){if(c.value.size!==0){r.value=!0;try{await z.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await le()}catch(ie){s.value=ie.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Me(ie,Se){const Le=`/api/sessions/${encodeURIComponent(ie)}/export?format=${Se}`;try{const Ke=await z.getBlob(Le),Et=URL.createObjectURL(Ke),Ve=document.createElement("a");Ve.href=Et,Ve.download=`session-${ie}.${Se==="text"?"txt":"json"}`,Ve.click(),URL.revokeObjectURL(Et)}catch(Ke){s.value=Ke.message||"Failed to export session"}}let dt=null;function st(ie){ie.payload&&ie.payload.channel_id&&(clearTimeout(dt),dt=setTimeout(()=>{if(le(),n.value&&ie.payload.channel_id===n.value){const Se=n.value,Le=l;z.get(`/api/sessions/${encodeURIComponent(Se)}`).then(Ke=>{Le!==l||n.value!==Se||(a.value=Ke)}).catch(()=>{})}},2e3))}let _t=!1,Ot=null;function rt(){_t||(_t=!0,le(),Ye.subscribe("events",st),Ot=Ye.onReconnected(()=>le()))}je(()=>{j(),rt()}),Qt(()=>{rt()});function Qe(){_t&&(_t=!1,Ye.unsubscribe("events",st),Ot&&(Ot(),Ot=null),clearTimeout(dt))}return Gt(Qe),ft(Qe),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:$,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:m,filterPresets:v,sortOptions:w,filteredSessions:k,hasActiveFilters:A,customPresets:N,showSavePreset:x,newPresetName:b,threadView:y,threads:C,collapsedThreads:E,ftsQuery:S,ftsChannelId:L,ftsUserId:R,ftsResults:_,ftsSearching:D,ftsError:U,ftsStale:T,formatAge:Y,formatTimestamp:ge,formatFullTimestamp:V,messageClass:re,threadMsgClass:ue,roleBadge:Ie,roleDotClass:g,roleLabelClass:I,truncateContent:F,threadSummary:W,fetchSessions:le,retry:xe,toggleSession:me,toggleSelect:_e,toggleSelectAll:Re,confirmClear:B,clearSession:ve,confirmBulkClear:ke,doBulkClear:Oe,exportSession:Me,applyPreset:Z,applyCustomPreset:oe,saveCustomPreset:se,removeCustomPreset:ce,resetFilters:Ne,toggleThread:G,runFtsSearch:ee,clearFtsSearch:X,highlightSnippet:ae,ftsResultClass:fe,ftsTypeBadge:pe}}},ik={props:["trace"],template:`
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
  `,setup(){return{formatTokens:Ym}}},lk={components:{ContextAssemblyPanel:ik},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=h(""),r=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(L){if(!L)return"—";try{const R=new Date(L);return isNaN(R.getTime())?L:R.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return L}}function p(L){return!L&&L!==0?"—":L<1e3?L+"ms":(L/1e3).toFixed(1)+"s"}function f(L){return!L&&L!==0?"—":L>=1e3?(L/1e3).toFixed(1)+"k":String(L)}function m(L){if(!L)return"";if(typeof L=="string")return L;try{return JSON.stringify(L,null,2)}catch{return String(L)}}function v(L){a.value===L?a.value=null:(a.value=L,c.value={})}function w(L,R){const _=L+"-"+R;c.value={...c.value,[_]:!c.value[_]}}function N(L,R){return!!c.value[L+"-"+R]}function x(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,E()}async function b(){try{const L=await z.get("/api/trajectories");e.value=L.files||[],r.value=L.count||0}catch{}}let y=0;async function E(){const L=++y;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(o.value){const R=await z.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(L!==y)return;let _=R.entries||[];d.value.tool_name&&(_=_.filter(D=>(D.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(_=_.filter(D=>D.is_error)),d.value.channel_id&&(_=_.filter(D=>D.channel_id===d.value.channel_id)),d.value.user_id&&(_=_.filter(D=>D.user_id===d.value.user_id)),t.value=_}else{const R=new URLSearchParams;d.value.channel_id&&R.set("channel_id",d.value.channel_id),d.value.user_id&&R.set("user_id",d.value.user_id),d.value.tool_name&&R.set("tool_name",d.value.tool_name),d.value.errors_only&&R.set("errors_only","true"),R.set("limit",String(d.value.limit));const _=R.toString(),D=await z.get(`/api/trajectories/search/query?${_}`);if(L!==y)return;t.value=D.results||[]}}catch(R){if(L!==y)return;n.value=R.message}L===y&&(s.value=!1)}async function S(){if(!l.value.trim())return;const L=++y;s.value=!0,n.value=null,c.value={};try{const R=await z.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(L!==y)return;i.value=R.entry||null,i.value||(n.value="No trace found for this message ID")}catch(R){if(L!==y)return;R.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=R.message}L===y&&(s.value=!1)}return je(async()=>{await b(),await E()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:m,truncateBlock:Zm,toggleExpand:v,toggleIteration:w,isIterationExpanded:N,clearFilters:x,fetchFiles:b,fetchTraces:E,lookupMessage:S}}};function ok(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function rk(e){return e?`${e.approximate?"~":""}${xd(e.total||0)}`:"0"}const ck={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),a=h("7d"),i=h(0),l=h(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=q(()=>n.value.work||{}),f=q(()=>Math.max(1,...(n.value.activity_over_time||[]).map(S=>Number(S.count||0)))),m=q(()=>({minWidth:`max(100%, ${(n.value.activity_over_time||[]).length*5}px)`})),v=S=>({height:`${Math.max(4,Math.round(Number(S||0)/f.value*100))}%`}),w=q(()=>s.value&&l.value-i.value>3e4);async function N(){const S=++d,L=a.value;try{const R=await z.get(`/api/usage?range=${encodeURIComponent(L)}`);if(S!==d||L!==a.value)return;n.value=R,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(R){S===d&&(t.value=R.message)}finally{S===d&&(e.value=!1)}}function x(S){a.value=S,e.value=!s.value,N()}function b(){e.value=!0,N()}function y(){c||(c=!0,N(),o=setInterval(N,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function E(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return je(y),Qt(y),Gt(E),ft(E),{data:n,work:p,loading:e,error:t,hasData:s,range:a,ranges:u,isStale:w,fmtNum:xd,fmtDuration:ok,tokenLabel:rk,activityTrackStyle:m,activityBar:v,selectRange:x,retry:b}}},tv=[{id:"audit",label:"Audit",component:sk},{id:"sessions",label:"Sessions",component:ak},{id:"traces",label:"Traces",component:lk},{id:"usage",label:"Usage & Activity",component:ck}],dk={components:{TabbedPage:Qo},setup(){return{tabs:tv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},_r=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],uk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),o=h(null),r=h(null),c=h(!1),d=h(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(_){return _.source!=="builtin"?"":u[_.state]||""}function f(_,D){const U=_&&Array.isArray(_.tools)?_.tools:null;if(c.value=!!U,r.value=U?!!_.global_enabled:null,!U){e.value=D.map(j=>({...j,source:"unknown",enabled:void 0,state:null}));return}const T=new Set(U.map(j=>j.name)),M=D.filter(j=>!T.has(j.name)).map(j=>({...j,source:j.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...U.map(j=>({...j,source:"builtin"})),...M]}async function m(_,D){if(d.value.has(_.name))return;const U=!!D.target.checked,T=new Set(d.value);T.add(_.name),d.value=T;try{const M=await z.post(`/api/tools/builtins/${encodeURIComponent(_.name)}/enabled`,{enabled:U});f(M,e.value),s.value=null;try{const j=await z.get("/api/tools");f(M,j)}catch(j){console.warn("Built-in toggle committed; visible catalog refresh failed",j)}}catch(M){D.target.checked=!!_.enabled,s.value=M.message||`Failed to toggle ${_.name}`}finally{const M=new Set(d.value);M.delete(_.name),d.value=M}}const v=q(()=>e.value.filter(_=>_.source==="builtin"&&_.is_core).length),w=q(()=>e.value.filter(_=>_.source==="skill").length),N=q(()=>Object.values(a.value).reduce((_,D)=>_+D,0));function x(_){for(const D of _r)if(D.id!=="other"&&D.match(_))return D.id;return"other"}const b=q(()=>{let _=e.value;if(n.value){const D=n.value.toLowerCase();_=_.filter(U=>U.name.toLowerCase().includes(D)||(U.description||"").toLowerCase().includes(D))}return o.value&&(_=_.filter(D=>x(D.name)===o.value)),_}),y=q(()=>{const _=new Set;for(const D of e.value)_.add(x(D.name));return _r.filter(D=>_.has(D.id))}),E=q(()=>{const _=b.value,D={};for(const T of _){const M=x(T.name);D[M]||(D[M]=[]),D[M].push(T)}const U=[];for(const T of _r)D[T.id]&&D[T.id].length>0&&U.push({label:T.label,icon:T.icon,tools:D[T.id].sort((M,j)=>M.name.localeCompare(j.name))});return U});function S(_){i.value={...i.value,[_]:!i.value[_]}}async function L(){t.value=!0,s.value=null;try{const[_,D,U]=await Promise.all([z.get("/api/tools"),z.get("/api/tools/stats").catch(()=>({})),z.get("/api/tools/builtins").catch(()=>null)]);f(U,_),a.value=D||{}}catch(_){s.value=_.message}t.value=!1}function R(){L()}return je(()=>{L()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:w,totalUsage:N,filteredTools:b,groupedTools:E,usedCategories:y,stateBadge:p,applyInventory:f,toggleBuiltinTool:m,truncate:yd,toggleExpand:S,refresh:R}}};function pk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function fk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const hk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),o=h(null),r=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),m=h(!1),v=h(null),w=h(null),N=h(!1),x=q(()=>e.value.length),b=q(()=>e.value.reduce((se,ce)=>se+(ce.execution_count||0),0)),y=q(()=>e.value.reduce((se,ce)=>se+D(ce.code),0)),E=q(()=>{if(!l.value)return e.value;const se=l.value.toLowerCase();return e.value.filter(ce=>ce.name.toLowerCase().includes(se)||(ce.description||"").toLowerCase().includes(se))}),S=q(()=>u.value?u.value.split(`
`).length:0),L=q(()=>{const se=Math.max(S.value,1);return Array.from({length:se},(ce,Ne)=>Ne+1).join(`
`)}),R=q(()=>{const se=u.value.trim();return se?se.includes("SKILL_DEFINITION")?se.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function _(se){return pk(se)}function D(se){return se?se.split(`
`).length:0}function U(se){return fk(se)}function T(se){n.value={...n.value,[se]:!n.value[se]}}async function M(se){try{await navigator.clipboard.writeText(se);const ce=e.value.find(Ne=>Ne.code===se);ce&&(o.value=ce.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function j(se){if(se.key==="Tab"){se.preventDefault();const ce=se.target,Ne=ce.selectionStart,Y=ce.selectionEnd;u.value=u.value.substring(0,Ne)+"    "+u.value.substring(Y),Rt(()=>{ce.selectionStart=ce.selectionEnd=Ne+4})}}function J(se){const ce=se.target.previousElementSibling;ce&&(ce.scrollTop=se.target.scrollTop)}async function A(){t.value=!0,s.value=null;try{e.value=await z.get("/api/skills")}catch(se){s.value=se.message}t.value=!1}async function k(se){i.value=se,delete a.value[se],a.value={...a.value};try{const ce=await z.post(`/api/skills/${encodeURIComponent(se)}/test`);a.value={...a.value,[se]:ce}}catch(ce){a.value={...a.value,[se]:{result:ce.message,is_error:!0}}}i.value=null}function C(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function $(se){r.value=!0,c.value="edit",d.value=se.name,u.value=se.code||"",p.value=null,f.value=null}function W(){r.value=!1,p.value=null,f.value=null}async function G(){p.value=null,f.value=null;const se=d.value.trim(),ce=u.value.trim();if(!se){p.value="Name is required";return}if(!ce){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await z.post("/api/skills",{name:se,code:ce}),f.value="Skill created successfully"):(await z.put(`/api/skills/${encodeURIComponent(se)}`,{code:ce}),f.value="Skill updated successfully"),await A(),setTimeout(()=>{r.value=!1},800)}catch(Ne){p.value=Ne.message}m.value=!1}function Z(se){w.value=se}async function oe(){if(w.value){N.value=!0;try{await z.del(`/api/skills/${encodeURIComponent(w.value)}`),await A()}catch(se){ye.error(`Failed to delete skill: ${se.message||"unknown error"}`)}N.value=!1,w.value=null}}return je(()=>{A()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:m,editorRef:v,deleteTarget:w,deleting:N,enabledCount:x,totalExecutions:b,totalLines:y,displayedSkills:E,editLineCount:S,editorLineNums:L,editValidation:R,highlight:_,truncate:yd,formatTs:Aa,countLines:D,getLineNumbers:U,toggleCode:T,copyCode:M,handleEditorKey:j,syncScroll:J,fetchSkills:A,testSkill:k,showCreate:C,editSkill:$,cancelEdit:W,saveSkill:G,confirmDelete:Z,doDelete:oe}}};class Fs extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const mk=/^[A-Za-z_][A-Za-z0-9_]*$/;function rp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function cp(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Fs(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Fs(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,o))throw new Fs(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Fs(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");n[o]=r}}return{set:n,remove:a}}function vk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function gk(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Fs("Server name is required.","name");if(a.length>128||!mk.test(a))throw new Fs("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(n&&(o.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Fs("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(n||e.replaceArgs)&&(o.args=rp(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Fs("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Fs("An HTTP endpoint is required for this connection.","url");if(d&&!vk(d))throw new Fs("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Fs("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(n||e.replaceAllowlist)&&(o.tool_allowlist=rp(e.allowlistText));const r=cp(e.headerRows,e.headersRemove,"Header"),c=cp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function bk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function yk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function xk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const _k=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function wk(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const kk=1e4,Sk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function wr(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Tk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Ck={template:`
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),o=h({}),r=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),m=h(wr()),v=h(""),w=h(!1);let N=null,x=0,b=!1,y=!1;const E=_k,S=q(()=>{var B;return((B=e.value)==null?void 0:B.servers)||[]}),L=q(()=>{var B;return!!((B=e.value)!=null&&B.enabled)}),R=q(()=>{var B,ve,ke,Oe;return{serverCount:((B=e.value)==null?void 0:B.server_count)||0,enabledCount:((ve=e.value)==null?void 0:ve.enabled_server_count)||0,connectedCount:((ke=e.value)==null?void 0:ke.connected_count)||0,toolCount:((Oe=e.value)==null?void 0:Oe.published_tool_count)||0}}),_=q(()=>{var B;return((B=f.value)==null?void 0:B.header_keys)||[]}),D=q(()=>{var B;return((B=f.value)==null?void 0:B.env_keys)||[]}),U=q(()=>{var B;return u.value==="edit"&&((B=f.value)==null?void 0:B.transport)==="http"}),T=q(()=>u.value==="add"||!U.value),M=q(()=>U.value?"Replace endpoint URL":"Endpoint URL"),j=q(()=>U.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function J(){A(),N=window.setInterval(()=>k({quiet:!0}),kk)}function A(){N&&window.clearInterval(N),N=null}async function k({quiet:B=!1}={}){const ve=++x;B||(t.value=!0);try{const ke=await z.get("/api/mcp/status");if(ve!==x||!b)return;e.value=ke,n.value="";const Oe=new Set((ke.servers||[]).map(Me=>Me.name));i.value=new Set([...i.value].filter(Me=>Oe.has(Me)))}catch(ke){ve===x&&b&&(n.value=ke.message||"Failed to load MCP status")}finally{ve===x&&(t.value=!1)}}function C(B){return s.value||a.value.has(B)}function $(B,ve){const ke=new Set(a.value);ve?ke.add(B):ke.delete(B),a.value=ke}function W(B){return yk(B.state)}function G(B){if(W(B)==="disabled"){if(!B.enabled)return"Disabled — server switch off";if(!L.value)return"Disabled — global MCP is off"}return Sk[W(B)]}function Z(B){return B.transport==="http"?"Streamable HTTP":"stdio"}function oe(B){return B.negotiated_version?`${B.era?`${String(B.era).charAt(0).toUpperCase()}${String(B.era).slice(1)}`:"Protocol"} · ${B.negotiated_version}`:"Not negotiated"}function se(B){return B.discovered_count?`${B.published_count||0} published · ${B.excluded_count||0} excluded`:"No tools discovered"}const ce=h(new Set);async function Ne(B,ve){if(ce.value.has(B.name))return;const ke=!!ve.target.checked,Oe=new Set(ce.value);Oe.add(B.name),ce.value=Oe;try{const Me=await z.post(`/api/mcp/servers/${encodeURIComponent(B.name)}/enabled`,{enabled:ke});Me&&Array.isArray(Me.servers)?e.value=Me:await k({quiet:!0})}catch(Me){ve.target.checked=!!B.enabled,ye.error(Me.message||`Failed to toggle ${B.name}`)}finally{const Me=new Set(ce.value);Me.delete(B.name),ce.value=Me}}async function Y(B){if(B!==L.value&&!(!B&&!await qt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await z.post("/api/mcp/enabled",{enabled:B}),ye.success(B?"MCP enabled":"MCP disabled"),await k({quiet:!0})}catch(ve){ye.error(ve.message||"Failed to update MCP state"),await k({quiet:!0})}finally{s.value=!1}}}async function ge(B){$(B.name,!0);try{await z.post(`/api/mcp/servers/${encodeURIComponent(B.name)}/reconnect`,{}),ye.success(`Reconnected ${B.name}`)}catch(ve){ye.error(ve.message||`Failed to reconnect ${B.name}`)}finally{$(B.name,!1),await k({quiet:!0})}}async function V(B){$(B.name,!0);try{await z.post(`/api/mcp/servers/${encodeURIComponent(B.name)}/refresh-tools`,{}),ye.success(`Refreshed tools from ${B.name}`),await Ie(B.name,!0)}catch(ve){ye.error(ve.message||`Failed to refresh ${B.name}`)}finally{$(B.name,!1),await k({quiet:!0})}}async function re(B){if(await qt({title:`Remove ${B.name}`,message:`Remove this saved MCP server? Its ${B.published_count||0} published tool${B.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){$(B.name,!0);try{await z.del(`/api/mcp/servers/${encodeURIComponent(B.name)}`),ye.success(`Removed ${B.name}`),delete o.value[B.name]}catch(ke){ye.error(ke.message||`Failed to remove ${B.name}`)}finally{$(B.name,!1),await k({quiet:!0})}}}async function ue(B){const ve=new Set(i.value);if(ve.has(B.name)){ve.delete(B.name),i.value=ve;return}ve.add(B.name),i.value=ve,Object.hasOwn(o.value,B.name)||await Ie(B.name)}async function Ie(B,ve=!1){if(!ve&&Object.hasOwn(o.value,B))return;const ke=new Set(c.value);ke.add(B),c.value=ke,r.value={...r.value,[B]:""};try{const Oe=await z.get(`/api/mcp/servers/${encodeURIComponent(B)}/tools`);o.value={...o.value,[B]:Oe.tools||[]}}catch(Oe){r.value={...r.value,[B]:Oe.message||"Failed to load tools"}}finally{const Oe=new Set(c.value);Oe.delete(B),c.value=Oe}}function g(B){return(o.value[B]||[]).filter(ve=>xk(ve,l.value[B]))}function I(B,ve){l.value={...l.value,[B]:ve}}function F(){u.value="add",p.value="",f.value=null,m.value=wr(),v.value="",d.value=!0}function ee(B){u.value="edit",p.value=B.name,f.value=B,m.value={...wr(),name:B.name,enabled:!!B.enabled,transport:B.transport||"stdio"},v.value="",d.value=!0}function X(){w.value||(d.value=!1)}function ae(B){d.value&&wk(B)}function fe(B){const ve=B==="headers"?"headerRows":"envRows";m.value[ve].push({key:"",value:""})}function pe(B,ve){const ke=B==="headers"?"headerRows":"envRows";m.value[ke].splice(ve,1)}function de(B,ve){const ke=B==="headers"?"headersRemove":"envRemove",Oe=m.value[ke];m.value[ke]=Oe.includes(ve)?Oe.filter(Me=>Me!==ve):[...Oe,ve]}async function le(){var ve,ke;v.value="";let B;try{B=gk(m.value,{mode:u.value,originalTransport:((ve=f.value)==null?void 0:ve.transport)||""})}catch(Oe){v.value=Oe instanceof Fs?Oe.message:"Invalid MCP server configuration",await Rt(),(ke=document.querySelector(".mcp-editor"))==null||ke.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&bk(B,f.value)&&!await qt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){w.value=!0;try{u.value==="add"?await z.post("/api/mcp/servers",B):await z.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,B),ye.success(u.value==="add"?`Saved ${B.name}`:`Updated ${p.value}`),d.value=!1,await k({quiet:!0})}catch(Oe){v.value=Oe.message||"Failed to save MCP server"}finally{w.value=!1}}}let xe=null;function me(B){`${(B==null?void 0:B.event)||""} ${(B==null?void 0:B.type)||""} ${(B==null?void 0:B.tool)||""} ${(B==null?void 0:B.message)||""}`.toLowerCase().includes("mcp")&&(xe&&window.clearTimeout(xe),xe=window.setTimeout(()=>k({quiet:!0}),200))}function _e(){b||(b=!0,y||(Ye.subscribe("events",me),y=!0),k(),J())}function Re(){b=!1,A(),xe&&window.clearTimeout(xe),xe=null,y&&(Ye.unsubscribe("events",me),y=!1)}return je(_e),Qt(_e),Gt(Re),ft(Re),{status:e,loading:t,mutating:s,pageError:n,servers:S,masterEnabled:L,aggregate:R,expandedServers:i,toolQueries:l,toolErrors:r,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:f,form:m,formError:v,saving:w,editorGroups:E,configuredHeaderKeys:_,configuredEnvKeys:D,savedHttpEndpoint:U,endpointRequired:T,endpointFieldLabel:M,endpointPlaceholder:j,refreshAll:k,busy:C,serverState:W,stateLabel:G,transportLabel:Z,protocolLabel:oe,toolSummary:se,formatAge:Tk,setMasterEnabled:Y,togglePending:ce,toggleServerEnabled:Ne,reconnect:ge,refreshTools:V,removeServer:re,toggleTools:ue,filteredTools:g,setToolQuery:I,openAdd:F,openEdit:ee,closeEditor:X,jumpToEditorGroup:ae,addSecretRow:fe,removeSecretRow:pe,toggleSecretRemoval:de,saveServer:le}}};function Ek(e,t){if(!e||!t)return ip(e);const s=ip(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Ak={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),o=h(null),r=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),m=h(null),v=h(null);let w=null;const N=h(null),x=h(!1),b=h({}),y=h({}),E=h({}),S=h({}),L=new Map,R=h(null),_=q(()=>e.value.reduce((G,Z)=>G+(Z.chunks||0),0)),D=q(()=>new Set(e.value.map(Z=>Z.uploader).filter(Boolean)).size);function U(G,Z){const oe=y.value[Z];if(!oe||oe.length===0)return 0;const se=Math.max(...oe.map(ce=>ce.char_count||0));return se===0?0:Math.round(G.char_count/se*100)}async function T(){t.value=!0,s.value=null;try{const G=await z.get("/api/knowledge");e.value=Array.isArray(G)?G:[]}catch(G){s.value=G.message}t.value=!1}async function M(G){if(b.value[G]){b.value[G]=!1,R.value=null;return}if(b.value[G]=!0,Object.prototype.hasOwnProperty.call(y.value,G))return;if(L.has(G))return L.get(G);const Z={...S.value,[G]:!0};S.value=Z;const oe={...E.value};delete oe[G],E.value=oe;const se=z.get(`/api/knowledge/${encodeURIComponent(G)}/chunks`).then(ce=>{y.value={...y.value,[G]:Array.isArray(ce)?ce:[]}}).catch(ce=>{E.value={...E.value,[G]:ce.message||"load failed"}}).finally(()=>{if(L.get(G)!==se)return;L.delete(G);const ce={...S.value};delete ce[G],S.value=ce});return L.set(G,se),se}let j=0;async function J(){const G=n.value.trim();if(!G)return;const Z=++j;i.value=!0,o.value=null,l.value=G;try{const oe=await z.get(`/api/knowledge/search?q=${encodeURIComponent(G)}`);if(Z!==j)return;a.value=Array.isArray(oe)?oe:[]}catch(oe){if(Z!==j)return;a.value=[],o.value=oe.message||"Search failed"}Z===j&&(i.value=!1)}function A(){j+=1,i.value=!1,a.value=null,n.value="",o.value=null}async function k(){u.value=null,p.value=null;const G=c.value.trim(),Z=d.value.trim();if(!G){u.value="Source name is required";return}if(!Z){u.value="Content is required";return}f.value=!0;try{const oe=await z.post("/api/knowledge",{source:G,content:Z});p.value=`Ingested ${oe.chunks||0} chunks from "${G}"`,c.value="",d.value="",y.value={},await T(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(oe){u.value=oe.message}f.value=!1}async function C(G){m.value=G,v.value=null,w&&(clearTimeout(w),w=null);try{const Z=await z.post(`/api/knowledge/${encodeURIComponent(G)}/reingest`);v.value={source:G,error:!1,message:`Re-ingested ${Z.chunks||0} chunks`},delete y.value[G],await T(),w=setTimeout(()=>{v.value=null,w=null},3e3)}catch(Z){v.value={source:G,error:!0,message:Z.message}}m.value=null}function $(G){N.value=G}async function W(){if(N.value){x.value=!0;try{await z.del(`/api/knowledge/${encodeURIComponent(N.value)}`),delete y.value[N.value],await T()}catch(G){ye.error(`Failed to delete source: ${G.message||"unknown error"}`)}x.value=!1,N.value=null}}return je(()=>{T()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:m,reingestResult:v,deleteTarget:N,deleting:x,expanded:b,sourceChunks:y,chunkErrors:E,loadingChunks:S,selectedChunk:R,totalChunks:_,uploaderCount:D,truncate:yd,formatTs:Aa,highlightTerms:Ek,chunkBarWidth:U,fetchSources:T,toggleSource:M,doSearch:J,clearSearch:A,doIngest:k,doReingest:C,confirmDelete:$,doDelete:W}}},Rk={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),o=h(!1),r=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),m=h(!1),v=h(null),w=h(null),N=h(new Set),x=h(null),b=h(!1),y=h(!1),E=q(()=>e.value.reduce((Z,oe)=>Z+oe.count,0)),S=q(()=>N.value.size);function L(Z){const oe=t.value[Z];if(!oe)return[];if(!l.value.trim())return oe;const se=l.value.trim().toLowerCase();return oe.filter(ce=>ce.key.toLowerCase().includes(se)||ce.value&&ce.value.toLowerCase().includes(se))}function R(Z,oe){return N.value.has(Z+"/"+oe)}function _(Z,oe){const se=Z+"/"+oe,ce=new Set(N.value);ce.has(se)?ce.delete(se):ce.add(se),N.value=ce}function D(Z){const oe=t.value[Z];return!oe||oe.length===0?!1:oe.every(se=>N.value.has(Z+"/"+se.key))}function U(Z,oe){const se=t.value[Z];if(!se)return;const ce=new Set(N.value);for(const Ne of se){const Y=Z+"/"+Ne.key;oe?ce.add(Y):ce.delete(Y)}N.value=ce}async function T(){s.value=!0,n.value=null;try{const Z=await z.get("/api/memory");e.value=Object.entries(Z).map(([oe,se])=>({name:oe,keys:se.keys||[],count:se.count||0}))}catch(Z){n.value=Z.message}s.value=!1}async function M(Z){if(a.value[Z]){a.value[Z]=!1;return}a.value[Z]=!0;const oe=e.value.find(ce=>ce.name===Z);if(!oe||t.value[Z]||i.value===Z)return;i.value=Z;let se;try{const Ne=(await z.get(`/api/memory/${encodeURIComponent(Z)}`)).entries||{};se=oe.keys.map(Y=>Object.prototype.hasOwnProperty.call(Ne,Y)?{key:Y,value:Ne[Y]||"",failed:!1}:{key:Y,value:"",failed:!0,error:"Not found in scope"})}catch(ce){se=oe.keys.map(Ne=>({key:Ne,value:"",failed:!0,error:ce.message||"Failed to load"}))}t.value[Z]=se,i.value=null}function j(Z,oe,se){p.value=Z+"/"+oe,f.value=se}async function J(Z,oe){m.value=!0,v.value=null;try{await z.put(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(oe)}`,{value:f.value});const se=t.value[Z];if(se){const ce=se.find(Ne=>Ne.key===oe);ce&&(ce.value=f.value)}p.value=null}catch(se){v.value=`Failed to save: ${se.message||"unknown error"}`}m.value=!1}async function A(Z,oe){try{await navigator.clipboard.writeText(oe.value),w.value=Z+"/"+oe.key,setTimeout(()=>{w.value=null},1500)}catch{}}async function k(){d.value=null,u.value=null;const Z=r.value.scope.trim(),oe=r.value.key.trim(),se=r.value.value.trim();if(!Z){d.value="Scope is required";return}if(!oe){d.value="Key is required";return}if(!se){d.value="Value is required";return}c.value=!0;try{await z.put(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(oe)}`,{value:se}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await T(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ce){d.value=ce.message}c.value=!1}function C(Z,oe){x.value={scope:Z,key:oe}}async function $(){if(!x.value)return;b.value=!0,v.value=null;const{scope:Z,key:oe}=x.value;try{await z.del(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(oe)}`);const se=t.value[Z];se&&(t.value[Z]=se.filter(Y=>Y.key!==oe));const ce=e.value.find(Y=>Y.name===Z);ce&&(ce.count--,ce.keys=ce.keys.filter(Y=>Y!==oe));const Ne=new Set(N.value);Ne.delete(Z+"/"+oe),N.value=Ne}catch(se){v.value=`Failed to delete: ${se.message||"unknown error"}`}b.value=!1,x.value=null}function W(){y.value=!0}async function G(){b.value=!0,v.value=null;const Z=[];for(const oe of N.value){const se=oe.indexOf("/");Z.push({scope:oe.slice(0,se),key:oe.slice(se+1)})}try{await z.post("/api/memory/bulk-delete",{entries:Z}),N.value=new Set,t.value={},await T()}catch(oe){v.value=`Bulk delete failed: ${oe.message||"unknown error"}`}b.value=!1,y.value=!1}return je(()=>{T()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:m,actionError:v,copied:w,selected:N,selectedCount:S,totalEntries:E,deleteTarget:x,deleting:b,showBulkDelete:y,fetchMemory:T,toggleScope:M,startEdit:j,doEdit:J,copyValue:A,doAdd:k,confirmDelete:C,doDelete:$,confirmBulkDelete:W,doBulkDelete:G,isSelected:R,toggleSelect:_,isScopeAllSelected:D,toggleSelectAll:U,filteredEntries:L}}},Ik={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=q(()=>[...new Set(e.value.map(w=>w.category))].sort()),r=q(()=>{const v={};return e.value.forEach(w=>{v[w.category]=(v[w.category]||0)+1}),v}),c=q(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await z.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,ye.success("Entry updated"),await m()}catch(w){ye.error(w.message||"Failed to save entry")}}async function f(v){if(await qt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/learned/"+encodeURIComponent(v)),ye.success("Entry deleted"),await m()}catch(N){ye.error(N.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await z.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return je(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:Aa,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:m}}},sv=[{id:"tools",label:"Tools",component:uk},{id:"skills",label:"Skills",component:hk},{id:"mcp-servers",label:"MCP Servers",component:Ck},{id:"knowledge",label:"Knowledge",component:Ak},{id:"memory",label:"Memory",component:Rk},{id:"learned",label:"Learned",component:Ik}],Ok={components:{TabbedPage:Qo},setup(){return{tabs:sv}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Lk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Nk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Dk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Pk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=q(()=>e.value.components||[]),l=q(()=>Dk[e.value.overall]||"text-gray-400"),o=q(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=q(()=>{const S=e.value.overall;return S==="healthy"?"All Systems Healthy":S==="degraded"?"Some Systems Degraded":S==="unhealthy"?"System Issues Detected":"Unknown"});function c(S){return Lk[S]||"text-gray-400"}function d(S){return Nk[S]||"info"}function u(S){return S==="ok"?"badge-success":S==="degraded"?"badge-warning":S==="down"?"badge-danger":"badge-info"}function p(S){return S==="closed"?"text-green-400":S==="half_open"?"text-yellow-400":S==="open"?"text-red-400":"text-gray-400"}function f(S){return S.replace(/_/g," ").replace(/\b\w/g,L=>L.toUpperCase())}function m(S){if(!S)return"—";try{return new Date(S).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return S}}function v(S){return S>=1e6?(S/1e6).toFixed(1)+"M":S>=1e3?(S/1e3).toFixed(1)+"K":String(S)}async function w(){a.value=!0;try{e.value=await z.get("/api/health/components"),s.value=null,n.value=!0}catch(S){s.value=S.message}finally{t.value=!1,a.value=!1}}function N(){t.value=!0,s.value=null,w()}let x=null,b=!1;function y(){b||(b=!0,w(),x||(x=setInterval(w,3e4)))}function E(){b&&(b=!1,x&&(clearInterval(x),x=null))}return je(y),Qt(y),Gt(E),ft(E),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:m,formatNumber:v,fetchHealth:w,retry:N}}},Mk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=q(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=q(()=>{if(!i.value)return[];const w=i.value,N=w.storage_total_bytes||1;return[{label:"Session Persistence",mb:w.sessions.persist_dir.total_mb,bytes:w.sessions.persist_dir.total_bytes,files:w.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(w.sessions.persist_dir.total_bytes/N*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:w.knowledge.db_file.total_mb,bytes:w.knowledge.db_file.total_bytes,files:w.knowledge.db_file.file_count,pct:Math.min(100,Math.round(w.knowledge.db_file.total_bytes/N*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:w.trajectories.message_dir.total_mb,bytes:w.trajectories.message_dir.total_bytes,files:w.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.message_dir.total_bytes/N*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:w.trajectories.agent_dir.total_mb,bytes:w.trajectories.agent_dir.total_bytes,files:w.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.agent_dir.total_bytes/N*100)),color:"res-bar-amber"}]});async function d(){try{const w=await z.get("/api/resource-usage");i.value=w,t.value=null,s.value=!0}catch(w){t.value=w.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function m(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function v(){f&&(f=!1,l&&(clearInterval(l),l=null))}return je(m),Qt(m),Gt(v),ft(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:o,collectedAt:r,storageItems:c,fmtNum:xd,refresh:u,retry:p}}},Fk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),$k=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function Uk(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const n=Object.fromEntries(Object.entries(e[s]).filter(([a])=>!$k.has(a)));Object.keys(n).length&&(t[s]=n)}return Object.keys(t).length?rl(t):""}function Bk(e){var a,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((a=t.metadata)!=null&&a.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!Fk.has(c)));s=Object.keys(r).length?rl(r):""}const n=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:n,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const Yn=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),cl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function Hk(e){const t=Yn(e)?e:{},s=Yn(t.metadata)?t.metadata:{},n=Yn(t.audit_metadata)?t.audit_metadata:{},a=Yn(t.turn)?t.turn:{},i=l=>cl(t[l]??s[l]??n[l]??a[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function dp(e){return e.record?JSON.stringify(nv(e),null,2):e.text}function nv(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function uc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function up(e){if(!uc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,cl(s.channel_id),cl(s.user_id??s.actor)])}function zk(e,t,s=2e3){var i,l,o;const n=up(t),a=n?e.findIndex(r=>up(r)===n):-1;if(a<0)e.push(t);else{const r=e[a],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(x=>JSON.stringify(x)===d))return;c.push(t.record);const u=x=>"result_summary"in x?2:uc(x)==="end"?1:0,p=[...c].sort((x,b)=>u(x)-u(b)),f=Object.assign({},...p);f.type=p[p.length-1].type||"execution";for(const x of["metadata","audit_metadata","turn"]){const b=p.filter(y=>Yn(y[x])).map(y=>y[x]);b.length&&(f[x]=Object.assign({},...b))}const m=c.some(x=>uc(x)!=="start"),v=c.find(x=>pc(x,0).level==="ERROR"),w=(v==null?void 0:v.status)||((i=v==null?void 0:v.metadata)==null?void 0:i.status);f.status=v?["failed","error","cancelled","denied","outcome_unknown"].includes(w)?w:"failed":m?f.status||((l=f.metadata)==null?void 0:l.status)||"succeeded":"started",m&&f.status==="started"&&(f.status="succeeded"),v&&(f.error=v.error||((o=v.metadata)==null?void 0:o.error)||f.error);const N=pc(f,r.id,r._time);Object.assign(N,{events:c,ts:r.ts,_time:r._time,searchText:c.map(x=>JSON.stringify(x)).join(`
`)}),e.splice(a,1,N)}e.length>s&&e.splice(0,e.length-s)}function pc(e,t,s=new Date){var u,p;let n=e;if(Yn(e)&&e.type==="log"&&"line"in e?n=e.line:Yn(e)&&"payload"in e&&(n=e.payload),typeof n=="string")try{n=JSON.parse(n)}catch{}const a=Yn(n)?n:null,i=a!=null&&a.timestamp?new Date(a.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=a?a.result_summary??a.detail??a.message??JSON.stringify(a):typeof n=="string"?n:JSON.stringify(n)??"",c=(a==null?void 0:a.error)||((u=a==null?void 0:a.metadata)==null?void 0:u.error)||(a==null?void 0:a.success)===!1||[a==null?void 0:a.status,(p=a==null?void 0:a.metadata)==null?void 0:p.status].some(f=>["failed","error","cancelled","denied","outcome_unknown"].includes(f))?"ERROR":cl(a==null?void 0:a.level).toUpperCase()||"INFO",d={id:t,record:a,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:cl(a==null?void 0:a.tool_name),raw:a?null:o,attribution:Hk(a)};return d.searchText=a?JSON.stringify(a):d.text,d}function jk(e){const t=new Map;for(const s of e){const{turnId:n,agentId:a,rootId:i,label:l,parentId:o}=s.attribution,r=n?`turn:${n}`:a?`root:${i||a}`:"unattributed";t.has(r)||t.set(r,{key:r,title:n?`Turn ${n}`:a?`Agent root ${i||a} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=a?`agent:${a}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:a,label:l,parentId:o,rootId:i,title:a?`${l||"Agent"} (${a})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...n})=>n)}const Vk={components:{ToolOutput:Xo},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=q(()=>Bk(e.entry)),s=q(()=>{var o;return rl(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),n=q(()=>{var o,r,c;return rl(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),a=q(()=>Uk(e.entry.record)),i=q(()=>nv(e.entry)),l=q(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:n,metadataText:a,rawRecord:i,lifecycle:l}},template:`
    <article class="log-line log-compact-line min-w-0"
             :class="{ 'log-line-error': entry.level === 'ERROR', 'log-line-warning': entry.level === 'WARNING' }"
             :data-log-id="entry.id">
      <tool-output presentation="compact" :value="display.body" :raw-value="rawRecord || undefined" :record-id="entry.id" label="Live log record"
                   :has-context="display.status !== '' || display.duration !== null || Boolean(entry.attribution.agentId || argumentsText)">
        <template #header>
          <button class="log-ts text-gray-500 hover:text-gray-300" @click="$emit('copy', entry)"
                  title="Copy complete retained record">{{ entry.ts }}</button>
          <span class="log-level" :class="entry.level === 'ERROR' ? 'text-red-400' : 'text-blue-400'">{{ entry.level }}</span>
          <span v-if="display.action" class="log-compact-action"
                :class="{ 'log-compact-web-action': entry.record?.type === 'web_action' }" :title="display.action">{{ display.action }}</span>
          <span v-if="display.action" class="output-control-separator" aria-hidden="true"> | </span>
        </template>
        <template #context>
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
          <div v-if="entry.events" class="log-compact-lifecycle">
            <span class="text-gray-500">Retained lifecycle evidence ({{ lifecycle.length }} events)</span>
            <div v-for="(event, index) in lifecycle" :key="index">{{ event.type }} · {{ event.timestamp }} {{ event.status }}</div>
          </div>
        </template>
      </tool-output>
    </article>`},qk=["INFO","WARNING","ERROR"],Gk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],kr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Kk=[50,100,200,500],Wk={components:{ToolOutput:Xo,LogRecord:Vk},template:`
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
    </div>`,setup(){const e=h("live"),t=h([]);let s=0;const n=h(!1),a=h(!1),i=h(!0),l=h(""),o=h(""),r=h(!1),c=h(!1),d=h(Ye.state||"disconnected"),u=q(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=h(null),f=h(!1),m=h(null),v=2e3,w=qk,N=Gk,x=kr,b=h("all"),y=h(""),E=h([]),S=h(!1),L=h(""),R=h([]);function _(){try{const te=localStorage.getItem("odin-log-presets");te&&(E.value=JSON.parse(te))}catch{}}function D(){try{localStorage.setItem("odin-log-presets",JSON.stringify(E.value))}catch{}}const U=q(()=>l.value!==""||o.value.trim()!==""||y.value!==""),T=q(()=>{const te=kr.find(we=>we.value===y.value);return te?te.label:""}),M=q(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(te){return te.message}}),j=24,J=q(()=>{if(Z.value.length===0)return[];const te=[],we=new Date,$e=3600*1e3;for(let Je=j-1;Je>=0;Je--){const wt=new Date(we.getTime()-(Je+1)*$e),ut=new Date(we.getTime()-Je*$e);te.push({start:wt,end:ut,label:$(wt,ut),shortLabel:ut.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Je of Z.value){if(!Je._time)continue;const wt=Je._time.getTime();for(const ut of te)if(wt>=ut.start.getTime()&&wt<ut.end.getTime()){ut.total++,Je.level==="ERROR"?ut.errors++:Je.level==="WARNING"?ut.warnings++:ut.info++;break}}return te}),A=q(()=>{let te=1;for(const we of J.value)we.total>te&&(te=we.total);return te}),k=q(()=>{if(J.value.length===0)return"";const te=Z.value.map(Je=>Je._time&&Je._time.getTime()).filter(Boolean);if(te.length===0)return"";const we=new Date(Math.min(...te));return`${Z.value.length} shown, oldest ${we.toLocaleTimeString()}`}),C=q(()=>Math.ceil(j/8));function $(te,we){const $e={hour:"2-digit",minute:"2-digit"};return te.toLocaleTimeString([],$e)+" - "+we.toLocaleTimeString([],$e)}function W(te,we){return!we||!te?"0px":Math.max(2,te/we*100)+"%"}function G(te){const we=Z.value.findIndex($e=>$e._time&&$e._time.getTime()>=te.start.getTime()&&$e._time.getTime()<te.end.getTime());if(we>=0&&p.value){const $e=p.value.querySelector('[data-log-id="'+Z.value[we].id+'"]');$e&&($e.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Z=q(()=>{let te=t.value;if(l.value&&(te=te.filter(we=>(we.level||"INFO")===l.value)),y.value){const we=kr.find($e=>$e.value===y.value);if(we&&we.seconds){const $e=new Date(Date.now()-we.seconds*1e3);te=te.filter(Je=>Je._time&&Je._time>=$e)}}if(o.value&&!M.value)if(r.value)try{const we=new RegExp(o.value,"i");te=te.filter($e=>{const Je=$e.searchText,wt=$e.tool||"";return we.test(Je)||we.test(wt)})}catch{}else{const we=o.value.toLowerCase();te=te.filter($e=>{const Je=$e.searchText.toLowerCase(),wt=($e.tool||"").toLowerCase();return Je.includes(we)||wt.includes(we)})}return te}),oe=q(()=>jk(Z.value));function se(te){const we=pc(te,++s);if(a.value){R.value.push(we);return}ce(we)}function ce(te){zk(t.value,te,v),i.value&&Rt(()=>Ne())}function Ne(te=!1){const we=p.value;we&&we.scrollTo({top:we.scrollHeight,behavior:te?"smooth":"instant"})}function Y(){i.value=!0,f.value=!1,Rt(()=>Ne(!0))}const ge=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function V(){const te=p.value;if(!te)return;const we=te.scrollHeight-te.scrollTop-te.clientHeight<40;f.value=!i.value&&!we&&t.value.length>0,g.value&&re()}function re(){const te=p.value;!te||!i.value||te.scrollHeight-te.scrollTop-te.clientHeight>=40&&(i.value=!1,f.value=t.value.length>0)}function ue(){i.value&&requestAnimationFrame(re)}function Ie(te){ge.has(te.key)&&ue()}const g=h(!1);function I(){i.value&&(g.value=!0,requestAnimationFrame(re))}function F(){g.value&&(g.value=!1,re())}function ee(){i.value&&(f.value=!1,Rt(()=>Ne()))}function X(){if(a.value=!a.value,!a.value&&R.value.length>0){for(const te of R.value)ce(te);R.value=[]}}function ae(){t.value=[],R.value=[],f.value=!1}function fe(){let te;e.value==="search"?te=Le.value.map(wt=>{const ut=wt.error?"ERROR":"INFO",$n=wt.tool_name?`[${wt.tool_name}] `:"";return`${wt.timestamp||""} ${ut} ${$n}${wt.result_summary||wt.message||""}`}).join(`
`):te=Z.value.map(dp).join(`

`);const we=new Blob([te],{type:"text/plain"}),$e=URL.createObjectURL(we),Je=document.createElement("a");Je.href=$e,Je.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Je.click(),URL.revokeObjectURL($e)}function pe(te){const we=dp(te);navigator.clipboard.writeText(we).then(()=>{m.value=te.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function de(te){l.value=l.value===te?"":te,b.value="all"}function le(te){return te.level==="ERROR"?"log-line-error":te.level==="WARNING"?"log-line-warning":"text-gray-300"}function xe(te){return te==="ERROR"?"text-red-500 font-semibold":te==="WARNING"?"text-yellow-500":"text-blue-500"}function me(te){return te==="ERROR"?"log-chip-error":te==="WARNING"?"log-chip-warning":"log-chip-info"}function _e(te){b.value=te.id;const we=te.filters;l.value=we.level||"",y.value=we.timeRange||"",o.value=we.text||"",we.levels&&(l.value=we.levels[0]||""),we.hasToolName&&(o.value="")}function Re(te){b.value=te.id,l.value=te.filters.level||"",y.value=te.filters.timeRange||"",o.value=te.filters.text||""}function B(){if(!L.value.trim())return;const te={id:"custom-"+Date.now(),name:L.value.trim(),filters:{level:l.value,timeRange:y.value,text:o.value}};E.value=[...E.value,te],D(),S.value=!1,L.value=""}function ve(te){E.value=E.value.filter(we=>we.id!==te),D(),b.value===te&&(b.value="all")}const ke=h("all"),Oe=h(""),Me=h(""),dt=h(""),st=h(""),_t=h(""),Ot=h(100),rt=Kk,Qe=h(!1),ie=h(!1),Se=h(""),Le=h([]),Ke=h(null),Et=h(null);function Ve(){e.value="search",Ke.value||$t()}async function $t(){try{Ke.value=await z.get("/api/logs/stats")}catch{}}function zt(){const te=_t.value;if(!te){dt.value="",st.value="";return}const $e={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[te];if($e){const Je=new Date(Date.now()-$e*1e3);dt.value=rs(Je),st.value=""}}function rs(te){const we=$e=>String($e).padStart(2,"0");return`${te.getFullYear()}-${we(te.getMonth()+1)}-${we(te.getDate())}T${we(te.getHours())}:${we(te.getMinutes())}`}function Js(te){if(!te)return"";const we=new Date(te);return isNaN(we.getTime())?"":we.toISOString()}async function ks(){Qe.value=!0,Se.value="",ie.value=!0,Et.value=null;try{const te=new URLSearchParams;ke.value&&ke.value!=="all"&&te.set("level",ke.value),Oe.value&&te.set("tool",Oe.value),Me.value&&te.set("q",Me.value);const we=Js(dt.value),$e=Js(st.value);we&&te.set("start",we),$e&&te.set("end",$e),te.set("limit",String(Ot.value));const Je=await z.get(`/api/logs/search?${te.toString()}`);Le.value=Je.entries||[]}catch(te){Se.value=te.message||"Search failed",Le.value=[]}finally{Qe.value=!1}}function na(){ke.value="all",Oe.value="",Me.value="",dt.value="",st.value="",_t.value="",Ot.value=100,Le.value=[],ie.value=!1,Se.value="",Et.value=null}function Zs(te){Et.value=Et.value===te?null:te}function Ns(te){if(!te.timestamp)return"";try{return new Date(te.timestamp).toLocaleString()}catch{return te.timestamp}}function Mn(te){return te.type==="web_action"?`${te.status||""} (${te.execution_time_ms||0}ms)`:(te.result_summary||"").slice(0,200)}function Ss(te){return te.error?"log-line-error":"text-gray-300"}function Fn(te){try{return JSON.stringify(te,null,2)}catch{return String(te)}}let Lt=null,Xe=!1;function Ts(){Xe||(Xe=!0,Ye.subscribe("logs",se),c.value=Ye.connected,d.value=Ye.state||"disconnected",Lt=Ye.onState(te=>{d.value=te,c.value=te==="connected"}))}function Ds(){Xe&&(Xe=!1,Ye.unsubscribe("logs",se),Lt&&(Lt(),Lt=null))}return je(()=>{_(),window.addEventListener("pointerup",F),window.addEventListener("pointercancel",F)}),Qt(Ts),Gt(Ds),ft(()=>{Ds(),window.removeEventListener("pointerup",F),window.removeEventListener("pointercancel",F)}),{mode:e,logs:t,paused:a,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:n,groupedLogs:oe,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Z,pauseBuffer:R,showJumpBottom:f,copiedIndex:m,regexError:M,levels:w,logPresets:N,timeRanges:x,timeRange:y,activeLogPreset:b,customLogPresets:E,showSaveLogPreset:S,newLogPresetName:L,hasActiveLogFilters:U,timeRangeLabel:T,timelineBuckets:J,timelineMax:A,timelineSpanLabel:k,timelineLabelSkip:C,togglePause:X,clearLogs:ae,exportLogs:fe,logLineClass:le,levelClass:xe,levelChipClass:me,toggleLevel:de,copyLine:pe,jumpToBottom:Y,onScroll:V,onUserScrollIntent:ue,onUserScrollKey:Ie,onAutoScrollToggle:ee,onPointerDown:I,applyLogPreset:_e,applyCustomLogPreset:Re,saveLogCustomPreset:B,removeLogCustomPreset:ve,segmentHeight:W,jumpToTimelineBucket:G,searchLevel:ke,searchTool:Oe,searchKeyword:Me,searchStart:dt,searchEnd:st,searchTimePreset:_t,searchLimit:Ot,searchLimits:rt,searching:Qe,searchRan:ie,searchError:Se,searchResults:Le,searchStats:Ke,expandedSearch:Et,switchToSearch:Ve,runSearch:ks,clearSearchFilters:na,toggleSearchExpand:Zs,formatSearchTs:Ns,searchEntryText:Mn,searchLogLineClass:Ss,formatJson:Fn,applySearchTimePreset:zt}}};function Pl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const Jk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function Zk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Xa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Yk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},Ml=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),Qk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function pp(e){return Qk.some(t=>e===t||e.startsWith(`${t}.`))}const av="odin_config_center_expanded_v1",iv="odin_config_center_category_v1",Xk=50,eS=650,Sr=()=>z.get("/api/config/meta");function da(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Bi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Pa(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function tS(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function sS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function lv(e,t){if(Bi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return da(t);const n={};for(const[a,i]of Object.entries(t)){const l=lv(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function nS(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=lv(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function ov(e,t,s,n){if(Bi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)ov(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function aS(){try{const e=JSON.parse(localStorage.getItem(av)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function iS(){try{const e=localStorage.getItem(iv);return Xa.some(t=>t.key===e)?e:Xa[0].key}catch{return Xa[0].key}}const lS={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),o=h(null),r=h(!1),c=h(!1),d=h(null),u=h(""),p=h("all"),f=h(iS()),m=h(aS()),v=h({}),w=h({}),N=h(""),x=h({}),b=h({}),y=h([]),E=h([]),S=h(!1),L=h(!1),R=h(!1);let _=null,D=null,U={path:null,at:0},T=0;const M=q(()=>{var O;return(((O=t.value)==null?void 0:O.fields)||[]).filter(H=>!Ml.has(H.path.split(".")[0])&&!pp(H.path))}),j=q(()=>new Map(M.value.map(O=>[O.path,O]))),J=q(()=>W.value.reduce((O,H)=>O+H.sections.length,0)),A=q(()=>M.value.length),k=q(()=>Jk),C=q(()=>y.value.length>0),$=q(()=>E.value.length>0),W=q(()=>{if(!e.value)return[];const O=new Set(Xa.flatMap(Ee=>Ee.sections)),H=Xa.map(Ee=>({...Ee,sections:Ee.sections.filter(ct=>Object.hasOwn(e.value,ct)&&!Ml.has(ct))})).filter(Ee=>Ee.sections.length),Q=Object.keys(e.value).filter(Ee=>!O.has(Ee)&&!Ml.has(Ee));return Q.length&&H.push({key:"other",label:"Other",icon:"folder",sections:Q}),H}),G=q(()=>e.value?{...e.value,...v.value}:null),Z=q(()=>{if(!e.value)return[];const O=[];for(const[H,Q]of Object.entries(v.value))ov(e.value[H],Q,H,O);return O.filter(H=>!Bi(H.oldVal,H.newVal)).map(H=>{const Q=I(H.path);return{...H,label:(Q==null?void 0:Q.label)||Pa(H.path.split(".").at(-1)),apply_mode:(Q==null?void 0:Q.apply_mode)||de(H.path.split(".")[0])}})}),oe=q(()=>Z.value.length>0),se=q(()=>Z.value.length),ce=q(()=>new Set(Z.value.map(O=>O.path.split(".")[0])).size),Ne=q(()=>!!u.value||p.value!=="all"),Y=q(()=>{const O={...b.value};for(const H of Z.value){const Q=I(H.path),Ee=mi(Q,H.newVal);Ee&&(O[H.path]=Ee)}return O}),ge=q(()=>Object.keys(Y.value).length>0),V=q(()=>e.value?(Ne.value?W.value:W.value.filter(H=>H.key===f.value)).map(H=>({...H,sections:H.sections.filter(Q=>Qe(Q))})).filter(H=>H.sections.length):[]),re=q(()=>{const O=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],H=new Map(O.map(Q=>[Q,[]]));for(const Q of Z.value){const Ee=H.has(Q.apply_mode)?Q.apply_mode:"restart";H.get(Ee).push(Q)}return O.filter(Q=>H.get(Q).length).map(Q=>({key:Q,label:Xt(Q),entries:H.get(Q)}))}),ue=q(()=>Z.value.filter(O=>O.apply_mode==="restart").length),Ie=q(()=>M.value.filter(O=>O.pending_restart)),g=q(()=>Ie.value.length);function I(O){const H=j.value.get(O);return H?{...H,apply_details:Pl([H])}:null}function F(O){const H=`${O}.`;return M.value.filter(Q=>Q.path===O||Q.path.startsWith(H))}function ee(){return M.value.some(O=>O.path==="tools.hosts"||O.path.startsWith("tools.hosts."))}function X(){var Q,Ee;const O=((Ee=(Q=e.value)==null?void 0:Q.tools)==null?void 0:Ee.hosts)||{},H=Object.keys(O).length;return`${H} host${H===1?"":"s"} configured.`}function ae(O){return F(O).length}function fe(O){return Pa(O)}function pe(O){const H=F(O);if(!H.length)return`${Pa(O)} configuration.`;const Q=H.find(Cs=>Cs.sensitivity==="public"&&Cs.description)||H.find(Cs=>Cs.description),Ee=(Q==null?void 0:Q.description)||"";return Ee.match(/setting for (.+)\.$/i)?`${Pa(O)} settings and runtime behaviour.`:Ee}function de(O){const H=[...new Set(F(O).map(Q=>Q.apply_mode))];return H.length===1?H[0]:H.includes("restart")?"restart":H.includes("activation_required")?"activation_required":H[0]||"restart"}function le(O){const H=[...new Set(F(O).map(Q=>Xt(Q.apply_mode)))];return H.length?H.length===1?H[0]:`Mixed apply behaviour: ${H.join(" · ")}`:""}function xe(O){return Pl(F(O))}function me(O){var H;return Object.hasOwn(v.value,O)?v.value[O]:(H=e.value)==null?void 0:H[O]}function _e(){const O=me("mcp")||{},H=Object.keys(O.servers||{}).length;return`${O.enabled?"Globally enabled":"Globally disabled"} · ${H} configured server${H===1?"":"s"}.`}function Re(O,H){return H.split(".").reduce((Q,Ee)=>Q==null?void 0:Q[Ee],O)}function B(O){const H=G.value;return F(O).filter(Q=>pp(Q.path)?!1:Q.path.split(".").length<=2?!0:!Q.path.includes(".*")).map(Q=>({...Q,key:Q.path.split(".").at(-1),value:Re(H,Q.path),apply_details:Pl([Q]),editor:Q.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ve(O){const H=O.path.split(".");return H.length>2?H.slice(0,2).join("."):null}function ke(O){const H=new Map;for(const Q of B(O)){const Ee=ve(Q),ct=Ee||`${O}.__root`;H.has(ct)||H.set(ct,{key:ct,path:Ee,entries:[]}),H.get(ct).entries.push(Q)}return[...H.values()].map(Q=>{const Ee=Q.entries.find(ct=>ct.group_description);return{...Q,label:Q.path?Pa(Q.path.split(".").at(-1)):null,description:(Ee==null?void 0:Ee.group_description)||null,apply_details:Pl(Q.entries),runtime_summaries:Me(Q.entries)}})}function Oe(O){return{save:O.save_effect||(O.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:O.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[O.apply_mode]||"Effective runtime state is not currently observable."}}function Me(O){const H=new Map;for(const Q of O){const Ee=Oe(Q),ct=`${Q.apply_mode}|${Ee.save}|${Ee.runtime}`;H.has(ct)||H.set(ct,{key:ct,label:Xt(Q.apply_mode),save:Ee.save,runtime:Ee.runtime})}return[...H.values()]}function dt(O){if(st(O))return O.runtime_effect||O.activation_policy||"";if(O.apply_mode==="activation_required"){const H=O.activation_policy||O.runtime_effect;return H?`Not active after saving. No activation control exists in this release. ${H}`:"Not active after saving; no activation control exists in this release."}return""}function st(O){return O.action_available===!0&&!!(O.action_label&&O.action_endpoint)}async function _t(O){if(st(O))try{if(Et(O.path))throw new Error("Save this setting before applying its action.");const H=String(O.action_method||"POST").toLowerCase(),Q={post:z.post.bind(z),put:z.put.bind(z),delete:z.del.bind(z)}[H];if(!Q)throw new Error("Unsupported configuration action");await Q(O.action_endpoint,O.action_body||void 0),await De(),es("success",`${O.action_label} completed.`)}catch(H){es("error",H.message||`${O.action_label} failed`)}}function Ot(O,H){return[O.label,O.path,O.description,...O.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(H)}function rt(O){const H=u.value.trim().toLowerCase();return H?F(O).filter(Q=>Ot(Q,H)):[]}function Qe(O){const H=F(O);if(p.value!=="all"&&!H.some(Ee=>Ee.apply_state===p.value))return!1;const Q=u.value.trim().toLowerCase();return!Q||`${fe(O)} ${O}`.toLowerCase().includes(Q)?!0:H.some(Ee=>Ot(Ee,Q))}function ie(O,H){return F(O).filter(Q=>Q.apply_state===H).length}function Se(O){return O==="all"?A.value:M.value.filter(H=>H.apply_state===O).length}function Le(O){const H=O.sections.flatMap(Q=>F(Q));return{fields:H.length,modified:Z.value.filter(Q=>O.sections.includes(Q.path.split(".")[0])).length,pending_restart:H.filter(Q=>Q.apply_state==="pending_restart").length,invalid:H.filter(Q=>Q.apply_state==="invalid").length,dormant:H.filter(Q=>Q.apply_state==="dormant").length}}function Ke(O){var H;return Object.hasOwn(v.value,O)&&!Bi((H=e.value)==null?void 0:H[O],v.value[O])}function Et(O){return Z.value.some(H=>H.path===O||H.path.startsWith(`${O}.`))}function Ve(O){f.value=O,u.value="",p.value="all";try{localStorage.setItem(iv,O)}catch{}}function $t(O){p.value=O}function zt(){u.value="",p.value="all"}function rs(O){var H;return((H=W.value.find(Q=>Q.sections.includes(O)))==null?void 0:H.sections)||[]}function Js(O){const H=rs(O),Q=H.find(Ee=>m.value[Ee]===!0);return Q||H.find(Ee=>m.value[Ee]!==!1)||null}function ks(O){return u.value&&!R.value&&Qe(O)?!0:R.value?Js(O)===O:Object.hasOwn(m.value,O)?m.value[O]===!0:!0}function na(O){const H=!ks(O);if(R.value){const Q={...m.value};for(const Ee of rs(O))Q[Ee]===!0&&(Q[Ee]=!1);Q[O]=H,m.value=Q;return}m.value={...m.value,[O]:H}}function Zs(){y.value.push(da(v.value)),y.value.length>Xk&&y.value.shift(),E.value=[]}function Ns(){oe.value&&(Zs(),v.value={},b.value={},S.value=!1)}function Mn(O,H=!1){const Q=Date.now();if(H&&U.path===O&&Q-U.at<eS){U.at=Q;return}Zs(),U={path:O,at:Q}}function Ss(O,H,Q){if(!H.length)return Q;const Ee=da(O??{});let ct=Ee;for(let Cs=0;Cs<H.length-1;Cs+=1){const pn=H[Cs];ct[pn]=da(ct[pn]??{}),ct=ct[pn]}return ct[H.at(-1)]=Q,Ee}function Fn(O){var H;return Object.hasOwn(v.value,O)?v.value[O]:da((H=e.value)==null?void 0:H[O])}function Lt(O,H,Q={}){var Id;if(Ml.has(O.path.split(".")[0]))return;const[Ee,...ct]=O.path.split(".");Mn(O.path,!!Q.coalesce);const Cs=Fn(Ee),pn=ct.length?Ss(Cs,ct,H):H,ia={...v.value};if(Bi(pn,(Id=e.value)==null?void 0:Id[Ee])?delete ia[Ee]:ia[Ee]=pn,v.value=ia,b.value[O.path]){const Od={...b.value};delete Od[O.path],b.value=Od}}function Xe(O){U={path:null,at:0},w.value={...w.value,[O]:String(Re(G.value,O)??"")}}function Ts(O){if(U={path:null,at:0},!Object.hasOwn(w.value,O))return;const H={...w.value};delete H[O],w.value=H}function Ds(O){const H=w.value[O.path];if(U={path:null,at:0},H===""){if(O.nullable){Ts(O.path),Lt(O,null,{coalesce:!0});return}b.value={...b.value,[O.path]:"Enter a number."};return}const Q=Number(H);if(Number.isNaN(Q)||O.type==="integer"&&!Number.isInteger(Q)){b.value={...b.value,[O.path]:O.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Ee={...w.value};delete Ee[O.path],w.value=Ee,Lt(O,Q,{coalesce:!0})}function te(O){return Object.hasOwn(w.value,O.path)?w.value[O.path]:O.value??""}function we(O,H){if(w.value={...w.value,[O.path]:H},H===""){if(O.nullable){Lt(O,null,{coalesce:!0});return}b.value={...b.value,[O.path]:"Enter a number."};return}const Q=Number(H);if(!Number.isFinite(Q)||O.type==="integer"&&!Number.isInteger(Q)){b.value={...b.value,[O.path]:O.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(b.value[O.path]){const Ee={...b.value};delete Ee[O.path],b.value=Ee}Lt(O,Q,{coalesce:!0})}function $e(O){const H=Number.parseInt(N.value,10);if(!Number.isInteger(H)||H<1){b.value={...b.value,[O.path]:"Warning thresholds must be positive whole numbers."};return}const Q=[...new Set([...O.value||[],H])].sort((Ee,ct)=>ct-Ee);N.value="",Lt(O,Q)}function Je(O,H){Lt(O,(O.value||[]).filter(Q=>Q!==H))}function wt(O){return O.apply_mode==="live_read"?"Odin reads the saved file value on next use.":O.apply_mode==="live_for_new_work"?"New work uses the saved file value.":O.apply_mode==="live_apply"?O.apply_handler?`Apply the saved value through ${O.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":O.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":O.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":O.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function ut(O){return O.type==="array"&&Array.isArray(O.value)&&!O.structured_container&&!O.structured_container_child&&O.sensitivity==="public"&&O.value.every(H=>["string","number","boolean"].includes(typeof H))}function $n(O){const H=String(x.value[O.path]??"").trim();if(!H)return;const Q=[...new Set([...O.value||[],H])];x.value={...x.value,[O.path]:""},Lt(O,Q)}function js(O,H){Lt(O,(O.value||[]).filter(Q=>Q!==H))}function mi(O,H){var Ee;if(!O)return null;if((Ee=O.enum)!=null&&Ee.length&&!O.enum.includes(H))return`Choose one of: ${O.enum.join(", ")}`;if(O.path==="agents.final_warning_iterations"&&(!Array.isArray(H)||!H.length))return"Add at least one warning threshold.";const Q=O.constraints||{};if((O.type==="integer"||O.type==="number")&&typeof H=="number"){if(Q.minimum!==void 0&&H<Q.minimum)return`Must be at least ${Q.minimum}${O.unit?` ${O.unit}`:""}`;if(Q.maximum!==void 0&&H>Q.maximum)return`Must be at most ${Q.maximum}${O.unit?` ${O.unit}`:""}`}return null}function vi(O){return Y.value[O.path]||null}function Ia(O){const H=`${O}.`;return Object.keys(Y.value).some(Q=>Q===O||Q.startsWith(H))}function aa(){y.value.length&&(E.value.push(da(v.value)),v.value=y.value.pop(),b.value={},w.value={},U={path:null,at:0})}function Un(){E.value.length&&(y.value.push(da(v.value)),v.value=E.value.pop(),b.value={},w.value={},U={path:null,at:0})}function Bn(){!oe.value||ge.value||(S.value=!0,L.value=!1)}function Ys(){S.value=!1}function dn(){Ns()}function Xt(O){return Yk[O]||Pa(O||"unknown")}function Oa(O){return`apply-${String(O||"unknown").replaceAll("_","-")}`}function K(O){return`cfgc-field-${O.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function be(O){return`${K(O)}-input`}function Ae(O){const H=document.getElementById(K(O))||document.getElementById(K(O.split(".").slice(0,2).join(".")));H==null||H.scrollIntoView({behavior:"smooth",block:"center"})}function es(O,H){l.value={type:O,message:H},window.setTimeout(()=>{var Q;((Q=l.value)==null?void 0:Q.message)===H&&(l.value=null)},3500)}function un(){r.value=!1,p.value="pending_restart",u.value="";const O=Zk(n.value);O&&(O.scrollTop=0)}function Hn(){r.value=!1}function Te(O=1800){D&&window.clearTimeout(D),D=window.setTimeout(P,O)}async function P(){if(c.value){if(T+=1,T>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Sr(),g.value===0){c.value=!1,d.value=null,es("success","Odin restarted and the saved startup settings are active.");return}}catch{}Te(2e3)}}async function ne(){if(!c.value){d.value=null;try{await z.post("/api/restart",{}),c.value=!0,T=0,r.value=!1,Te()}catch(O){d.value=O.message||"Odin could not schedule a restart."}}}async function he(){if(!(!oe.value||ge.value||a.value)){a.value=!0;try{const O=nS(e.value,v.value),H=await z.put("/api/config",O);e.value=H,v.value={},y.value=[],E.value=[],b.value={},S.value=!1;try{t.value=await Sr(),o.value=null,r.value=g.value>0,es("success",g.value?`Configuration saved. ${g.value} setting${g.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(Q){o.value=Q.message||"Unknown metadata error.",es("error",`Configuration saved, but apply status could not be refreshed: ${o.value}`)}}catch(O){es("error",O.message||"Configuration could not be saved")}finally{a.value=!1}}}async function De(){var O,H;if(!oe.value){s.value=!0,i.value=null;try{const Q=await z.get("/api/config"),Ee=await Sr();e.value=Q,t.value=Ee,o.value=null;const ct=W.value;if(ct.some(Cs=>Cs.key===f.value)||(f.value=((O=ct[0])==null?void 0:O.key)||Xa[0].key),R.value){const pn=(((H=ct.find(ia=>ia.key===f.value))==null?void 0:H.sections)||[]).find(ia=>m.value[ia]===!0);m.value=pn?{...m.value,[pn]:!0}:{}}}catch(Q){i.value=Q.message||"Unknown configuration error"}finally{s.value=!1}}}function Fe(O){if(S.value||!(O.ctrlKey||O.metaKey))return;const H=O.target;H instanceof HTMLElement&&(H.matches("input, textarea, select")||H.isContentEditable)||(!O.shiftKey&&O.key.toLowerCase()==="z"?(O.preventDefault(),aa()):(O.key.toLowerCase()==="y"||O.shiftKey&&O.key.toLowerCase()==="z")&&(O.preventDefault(),Un()))}function Be(O){R.value=O.matches}Mt(m,O=>{try{localStorage.setItem(av,JSON.stringify(O))}catch{}},{deep:!0});let yt=!1;function it(){yt||(yt=!0,document.addEventListener("keydown",Fe))}function vt(){yt&&(yt=!1,document.removeEventListener("keydown",Fe))}return je(()=>{var O;De(),it(),_=window.matchMedia("(max-width: 760px)"),Be(_),(O=_.addEventListener)==null||O.call(_,"change",Be)}),Qt(it),Gt(vt),ft(()=>{var O;vt(),(O=_==null?void 0:_.removeEventListener)==null||O.call(_,"change",Be),D&&window.clearTimeout(D)}),{armKeydown:it,disarmKeydown:vt,handleKeydown:Fe,config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:o,restartPromptOpen:r,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:f,reviewOpen:S,mobileOverflowOpen:L,warningThresholdInput:N,arrayInputs:x,healthFilters:k,visibleCategories:W,displayGroups:V,reviewGroups:re,sectionCount:J,fieldCount:A,hasChanges:oe,changeCount:se,changedSectionCount:ce,hasDraftErrors:ge,canUndo:C,canRedo:$,globalFilterActive:Ne,reviewRestartCount:ue,pendingRestartCount:g,pendingRestartFields:Ie,healthCount:Se,categoryStats:Le,selectCategory:Ve,selectHealthFilter:$t,clearFilters:zt,sectionLabel:fe,sectionDescription:pe,sectionFieldCount:ae,sectionHealthCount:ie,sectionApplySummary:le,sectionApplyDetails:xe,sectionEntries:B,fieldGroups:ke,sectionSearchHits:rt,mcpConfigSummary:_e,fieldRuntimeCopy:Oe,fieldSpecificRuntimeNote:dt,hasHonestAction:st,runFieldAction:_t,hasHostsCollection:ee,hostsConfigSummary:X,sectionChanged:Ke,fieldChanged:Et,isSectionExpanded:ks,toggleSection:na,discardAllDrafts:Ns,setFieldValue:Lt,setNumberFieldValue:we,numberInputValue:te,beginInputEdit:Xe,endTextInputEdit:Ts,endInputEdit:Ds,addWarningThreshold:$e,removeWarningThreshold:Je,isScalarArray:ut,addScalarArrayItem:$n,removeScalarArrayItem:js,fieldError:vi,sectionHasErrors:Ia,undo:aa,redo:Un,openReview:Bn,closeReview:Ys,mobileCancel:dn,applyModeLabel:Xt,applyClass:Oa,compactValue:tS,formatValue:sS,structuredApplyCopy:wt,fieldId:K,fieldInputId:be,focusField:Ae,fetchConfig:De,saveConfig:he,restartOdin:ne,restartLater:Hn,reviewPendingRestart:un}}},oS=/^\d{15,25}$/;function rv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const cv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=q(()=>new Set((e.excludedIds||[]).map(String))),o=q(()=>{const E=s.value.toLowerCase().trim();return(e.members||[]).filter(S=>l.value.has(String(S.id))?!1:E?u(S).toLowerCase().includes(E)||String(S.username||"").toLowerCase().includes(E)||String(S.id).includes(E):!0)}),r=q(()=>{const E=s.value.trim();return o.value.length===0&&oS.test(E)&&!l.value.has(E)?E:""}),c=q(()=>o.value.length+(r.value?1:0)),d=q(()=>{if(n.value){if(o.value[a.value])return`${e.optionsId}-${a.value}`;if(r.value&&a.value===o.value.length)return`${e.optionsId}-raw`}});function u(E){return rv(E)}function p(){n.value=!0,a.value=0}function f(){p()}function m(){const E=Math.max(c.value-1,0);a.value=Math.min(a.value+1,E)}function v(){a.value=Math.max(a.value-1,0)}function w(){const E=o.value[a.value];E?N(E):r.value&&a.value===o.value.length&&x(r.value)}function N(E){x(String(E.id))}function x(E){t("select",E),s.value="",n.value=!1,a.value=0}function b(){n.value=!1}function y(){setTimeout(b,150)}return je(()=>{e.autofocus&&Rt(()=>{var E;return(E=i.value)==null?void 0:E.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:m,highlightPrevious:v,selectHighlighted:w,selectMember:N,selectId:x,closeOptions:b,onBlur:y}}};function fp(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const rS={components:{DiscordUserCombobox:cv},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),o=h(null),r=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=q(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=q(()=>new Map(c.value.map(A=>[String(A.id),A])));function m(A){return A.config&&A.config.enabled!==void 0?A.config.enabled:!0}function v(A){return fp(A,"require_mention",a.value)}function w(A){return fp(A,"respond_to_bots",a.value)}function N(A){return A.config&&Object.keys(A.config).length>0}function x(A){n.value[A]=!n.value[A]}function b(A){const k=A.discord||{};return{allowed_users:[...k.allowed_users||[]],channels:[...k.channels||[]],respond_to_bots:!!k.respond_to_bots,require_mention:!!k.require_mention,ignore_bot_ids:[...k.ignore_bot_ids||[]]}}async function y({showLoading:A=!0}={}){const k=++d;A&&(t.value=!0),s.value=null;try{const C=await z.get("/api/discord/guilds");k===d&&(e.value=C)}catch(C){k===d&&(s.value=C.message)}finally{A&&k===d&&(t.value=!1)}}async function E(){t.value=!0,s.value=null;try{const[A,k,C]=await Promise.all([z.get("/api/discord/guilds"),z.get("/api/discord/members").catch(()=>[]),z.get("/api/config")]),$=b(C),W=p.value;a.value=$,W||(i.value=JSON.parse(JSON.stringify($))),c.value=k,e.value=A,o.value=null}catch(A){s.value=A.message}finally{t.value=!1}}let S=Promise.resolve();const L=h(new Set);function R(A,k){const C=new Set(L.value);C.add(A),L.value=C;const $=S.then(k);return S=$.catch(()=>{}),$.finally(()=>{const W=new Set(L.value);W.delete(A),L.value=W})}function _(A,k,C,$){const W=($==null?void 0:$.target)??null;return R(`guild:${A}:${k}`,async()=>{try{await z.put("/api/discord/guild/"+A+"/config",{[k]:C}),await y({showLoading:!1})}catch(G){s.value=G.message,W&&typeof C=="boolean"&&(W.checked=!C)}})}function D(A,k,C,$,W){const G=(W==null?void 0:W.target)??null;return R(`channel:${A}:${C}`,async()=>{try{await z.put("/api/discord/channel/"+A+"/config",{[C]:$}),await y({showLoading:!1})}catch(Z){s.value=Z.message,G&&typeof $=="boolean"&&(G.checked=!$)}})}function U(A,k){return R(`channel:${A}:clear`,async()=>{try{await z.put("/api/discord/channel/"+A+"/config",{clear:!0}),await y({showLoading:!1})}catch(C){s.value=C.message}})}function T(A,k){const C=String(k);if(!A.userAutocomplete)return C;const $=f.value.get(C);return $?rv($):C}function M(A,k=null){const C=String(k??r.value[A]??"").trim();!C||i.value[A].includes(C)||(i.value[A]=[...i.value[A],C],r.value={...r.value,[A]:""})}function j(A,k){i.value[A]=i.value[A].filter(C=>C!==k)}async function J(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const k=(await z.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...k.allowed_users||[]],channels:[...k.channels||[]],respond_to_bots:!!k.respond_to_bots,require_mention:!!k.require_mention,ignore_bot_ids:[...k.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(A){o.value=A.message||"Global defaults could not be saved."}finally{l.value=!1}}}return je(E),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:w,hasOverride:N,toggleGuild:x,fetchAll:E,fetchGuilds:y,setGuildConfig:_,setChannelConfig:D,clearOverride:U,mutationPending:L,globalItemLabel:T,addGlobalItem:M,removeGlobalItem:j,saveGlobalDefaults:J}}},Es=e=>e==null?e:JSON.parse(JSON.stringify(e));function cS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const m=new Map;function v(S){d+=1;const L=c.then(S,S);return c=L.catch(()=>{}),L}function w(S,L){f=Es(S),m.clear();for(const[R,_]of Object.entries(L||{}))m.set(R,Es(_))}function N(S){const L=Es(S),R=++u;return v(async()=>{try{await e(Es(L)),f=Es(L),R===u&&n(Es(L))}catch(_){R===u&&(a(Es(f)),r(_,{kind:"default"}))}})}function x(S,L){const R=Es(L),_=(p.get(S)||0)+1;return p.set(S,_),v(async()=>{try{await t(S,Es(R)),m.set(S,Es(R)),_===p.get(S)&&i(S,Es(R))}catch(D){_===p.get(S)&&(l(S,Es(m.get(S)??null)),r(D,{kind:"user",uid:S}))}})}function b(S){const L=(p.get(S)||0)+1;return p.set(S,L),v(async()=>{try{await s(S),m.delete(S),L===p.get(S)&&o(S)}catch(R){L===p.get(S)&&(l(S,Es(m.get(S)??null)),r(R,{kind:"delete",uid:S}))}})}async function y(){for(;;){const S=c;if(await S,S===c)return d}}async function E(S){for(;;){const L=await y(),R=await S();if(L===d)return R}}return{seed:w,saveDefault:N,saveUser:x,deleteUser:b,whenIdle:y,readSnapshot:E,get revision(){return d}}}const dS={components:{DiscordUserCombobox:cv},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({}),i=h({allowed_hosts:[],default_host:""}),l=h({}),o=h(!1),r=h([]),c=q(()=>{const T={};for(const M of r.value)T[M.id]=M;return T});function d(T){return c.value[T]||null}function u(T,M){return T?T.allowed_hosts===null||T.allowed_hosts===void 0?{allowed_hosts:[...M],default_host:T.default_host||"",allow_all:!0}:{allowed_hosts:T.allowed_hosts,default_host:T.default_host||"",allow_all:!1}:{allowed_hosts:[...M],default_host:M[0]||"",allow_all:!0}}const p=cS({applyDefault:async T=>{const M=T.allow_all?null:T.allowed_hosts;await z.put("/api/host-access/default-policy",{allowed_hosts:M,default_host:T.default_host})},applyUser:async(T,M)=>{const j=M.allow_all?null:M.allowed_hosts;await z.put(`/api/host-access/user/${T}`,{allowed_hosts:j,default_host:M.default_host})},applyDelete:T=>z.del(`/api/host-access/user/${T}`),onDefaultConfirmed:()=>ye.success("Default policy updated"),onDefaultRollback:T=>{T&&(i.value=T)},onUserConfirmed:T=>{const M=d(T);ye.success(`Updated access for ${M?M.display_name:T}`)},onUserRollback:(T,M)=>{const j={...l.value};M?j[T]=M:delete j[T],l.value=j},onUserDeleted:T=>{const M={...l.value};delete M[T],l.value=M},onError:(T,M)=>{var J;const j=M.uid?` ${((J=d(M.uid))==null?void 0:J.display_name)||M.uid}`:"";ye.error(`${T.message||"Failed to save"} — reverted${j}`)}});let f=0;async function m(){const T=++f;e.value=!0,t.value="";try{const M=await p.readSnapshot(()=>z.get("/api/host-access"));if(T!==f)return;s.value=M,n.value=M.available_hosts||[],a.value=M.host_descriptions||{},i.value=u(M.default_policy,n.value);const j=M.users||{},J={};for(const[A,k]of Object.entries(j))J[A]=u(k,n.value);l.value=J,p.seed(i.value,J)}catch(M){T===f&&(t.value=M.message||"Failed to fetch host access data")}finally{T===f&&(e.value=!1)}try{const M=await z.get("/api/discord/members")||[];T===f&&(r.value=M)}catch{T===f&&(r.value=[])}}const v=500,w=new Map;function N(T,M){const j=w.get(T);j&&clearTimeout(j.timer);const J={run:M,timer:null};J.timer=setTimeout(()=>{w.delete(T),M()},v),w.set(T,J)}function x(T){const M=w.get(T);M&&(clearTimeout(M.timer),w.delete(T))}function b(){for(const[T,M]of[...w])clearTimeout(M.timer),w.delete(T),M.run()}function y(){N("default",()=>p.saveDefault(i.value))}function E(T,M){i.value.allow_all=!1,M?i.value.allowed_hosts.includes(T)||i.value.allowed_hosts.push(T):(i.value.allowed_hosts=i.value.allowed_hosts.filter(j=>j!==T),i.value.default_host===T&&(i.value.default_host=i.value.allowed_hosts[0]||"")),y()}function S(T){N(`user:${T}`,()=>{const M=l.value[T];M&&p.saveUser(T,M)})}function L(T,M,j){const J=l.value[T];J&&(J.allow_all=!1,j?J.allowed_hosts.includes(M)||J.allowed_hosts.push(M):(J.allowed_hosts=J.allowed_hosts.filter(A=>A!==M),J.default_host===M&&(J.default_host=J.allowed_hosts[0]||"")),S(T))}function R(T,M){const j=l.value[T];j&&(j.default_host=M,S(T))}function _(){o.value=!0}function D(T){!/^\d{15,25}$/.test(T)||l.value[T]||(l.value[T]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},p.saveUser(T,l.value[T]),o.value=!1)}async function U(T){const M=d(T);await qt({title:"Remove user override",message:`Remove the host access override for ${M?M.display_name:T}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(x(`user:${T}`),await p.deleteUser(T),l.value[T]||ye.success(`Removed override for ${M?M.display_name:T}`))}return je(m),Gt(b),ft(b),{loading:e,error:t,data:s,availableHosts:n,hostDescriptions:a,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:y,toggleDefaultHost:E,getMember:d,toggleUserHost:L,setUserDefault:R,openAddUser:_,addUserById:D,deleteUser:U,flushPendingSaves:b}}},uS={template:`
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
    </div>`,setup(){const e=h([]),t=h(!1),s=h(""),n=h([]),a=h(!1),i=h(!1),l=h(1),o=h(""),r=h(!1),c=h(null),d=h(""),u=h([]),p=h(!1),f=h(null),m=h(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),w=h(v()),N=q(()=>["127.0.0.1","localhost","::1"].includes(w.value.address));async function x(){t.value=!0,s.value="";try{const J=await z.get("/api/hosts");e.value=J.hosts||[],o.value=J.default_host||"",r.value=!!J.tofu_enabled}catch(J){s.value=J.message}finally{t.value=!1}}async function b(){try{await z.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),ye.success("Host settings saved and published live"),await x()}catch(J){ye.error(J.message)}}function y(){d.value="",u.value=[],p.value=!1,f.value=null,c.value=null,m.value="",l.value=1,a.value=!0}function E(){i.value=!1,w.value=v(),y()}function S(J){i.value=!0,w.value={...v(),...J},y()}async function L(){try{c.value=await z.get("/api/hosts/public-key")}catch(J){ye.error(J.message)}}async function R(J){try{const A=await z.post("/api/hosts/"+encodeURIComponent(J.alias)+"/import-legacy",{});i.value=!0,w.value={...v(),...J,trust_mode:"pinned"},y(),d.value=A.candidate_token,u.value=A.fingerprints||[],m.value=u.value.join(`
`),l.value=4,ye.info("Imported existing known_hosts trust. Test before activation.")}catch(A){ye.error(A.message)}}async function _(){try{const J=m.value.split(/\s+/).filter(Boolean),A={...w.value,expected_fingerprints:J,candidate_fingerprints:u.value},k=await z.post("/api/hosts/candidates",A);if(d.value=k.candidate_token,u.value=k.fingerprints||[],w.value.trust_mode==="tofu"&&A.candidate_fingerprints.length===0){w.value.confirm_tofu=!1,ye.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(J){ye.error(J.message)}}async function D(){var J,A;p.value=!1,f.value=null;try{const k=await z.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!k.tested,f.value=k.last_test,p.value&&(l.value=5)}catch(k){const C=(J=k.data)==null?void 0:J.last_test;C&&typeof C=="object"&&!Array.isArray(C)&&(f.value=C);const $=(A=f.value)==null?void 0:A.detail;ye.error(typeof $=="string"&&$.trim()?$:k.message)}}async function U(){try{await z.post("/api/hosts/candidates/"+d.value+"/commit",{}),ye.success("Host saved and published live"),a.value=!1,await x()}catch(J){ye.error(J.message)}}async function T(J){try{await z.post("/api/hosts/"+encodeURIComponent(J.alias)+"/enabled",{enabled:!J.enabled}),await x()}catch(A){ye.error(A.message)}}async function M(J){var A;if(await qt("Delete host "+J.alias+"? Dependencies will block deletion.")){n.value=[];try{await z.del("/api/hosts/"+encodeURIComponent(J.alias)),await x()}catch(k){n.value=Array.isArray((A=k.data)==null?void 0:A.pending_references)?k.data.pending_references:[],ye.error(k.message)}}}async function j(J){if(await qt("Force revoke "+J.alias+"? Remote outcomes may be unknown."))try{await z.post("/api/hosts/"+encodeURIComponent(J.alias)+"/force-revoke",{}),await x()}catch(A){ye.error(A.message)}}return je(x),{hosts:e,loading:t,error:s,pendingReferences:n,wizard:a,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:w,isLocal:N,keyInfo:c,candidate:d,observed:u,tested:p,testResult:f,fingerprintsText:m,load:x,saveSettings:b,beginAdd:E,beginEdit:S,loadKey:L,importLegacy:R,prepare:_,testConnection:D,commit:U,toggle:T,remove:M,forceRevoke:j}}},pS={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),o=h(null),r=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=q(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=q(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(R){return R==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":R==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const R=await z.get("/api/tokens");s.value=R.tokens||[],n.value=R.available_hosts||[]}catch(R){t.value=R.message||"Failed to load tokens"}finally{e.value=!1}}function v(R){return!R||!R.trim()?[]:R.split(",").map(_=>_.trim()).filter(Boolean)}function w(R,_){const D=c.value.allowed_hosts;if(_&&!D.includes(R)&&D.push(R),!_){const U=D.indexOf(R);U>=0&&D.splice(U,1)}}function N(R,_){const D=d.value.allowed_hosts;if(_&&!D.includes(R)&&D.push(R),!_){const U=D.indexOf(R);U>=0&&D.splice(U,1)}}async function x(){var R;i.value=!0;try{const _=v(c.value.allowed_tools_str),D=c.value.host_mode,U=D==="none"?[]:D==="select"?c.value.allowed_hosts:null,T={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:_.length?_:[]};U!==null&&(T.allowed_hosts=U),T.default_host=c.value.default_host||"";const M=await z.post("/api/tokens",T);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,ye.success("Token created"),await m()}catch(_){ye.error(((R=_.data)==null?void 0:R.error)||_.message||"Failed to create token")}finally{i.value=!1}}function b(R){o.value=R;const _=R.allowed_hosts;let D="default";_==null?D="default":Array.isArray(_)&&_.length===0?D="none":Array.isArray(_)&&(D="select"),d.value={username:R.username||"",tier:R.tier||"admin",label:R.label||"",host_mode:D,allowed_hosts:Array.isArray(_)?[..._]:[],default_host:R.default_host||"",allowed_tools_str:(R.allowed_tools||[]).join(", ")}}async function y(){var R;if(o.value){r.value=!0;try{const _=v(d.value.allowed_tools_str),D=d.value.host_mode,U={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:_};D==="none"?U.allowed_hosts=[]:D==="select"?U.allowed_hosts=d.value.allowed_hosts:U.allowed_hosts=null,U.default_host=d.value.default_host||"",await z.put("/api/tokens/"+encodeURIComponent(o.value.user_id),U),o.value=null,ye.success("Token updated"),await m()}catch(_){ye.error(((R=_.data)==null?void 0:R.error)||_.message||"Failed to update")}finally{r.value=!1}}}async function E(R){var D;if(await qt({title:"Regenerate token",message:`Regenerate token for ${R.username||R.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const U=await z.post("/api/tokens/"+encodeURIComponent(R.user_id)+"/regenerate");l.value=U.token,ye.success("Token regenerated")}catch(U){ye.error(((D=U.data)==null?void 0:D.error)||U.message||"Failed to regenerate")}}async function S(R){var D;if(await qt({title:"Delete token",message:`Delete token for ${R.username||R.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/tokens/"+encodeURIComponent(R.user_id)),ye.success("Token deleted"),await m()}catch(U){ye.error(((D=U.data)==null?void 0:D.error)||U.message||"Failed to delete")}}async function L(){if(l.value)try{await navigator.clipboard.writeText(l.value),ye.success("Copied to clipboard")}catch{ye.error("Copy failed — select and copy manually")}}return je(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:f,toggleCreateHost:w,toggleEditHost:N,createToken:x,startEdit:b,saveEdit:y,confirmRegenerate:E,confirmDelete:S,copyToken:L}}},fS=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),hS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),mS=Object.freeze(["enabled","base_url","model","max_tokens"]),vS=Object.freeze(["enabled","model","max_tokens"]);function er(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function hp(e){return er(e,fS)}function mp(e){return er(e,hS)}function gS(e,{includeApiKey:t=!1}={}){const s=er(e,mS);return t&&(s.api_key=e.api_key),s}function bS(e){return{timeout:e.timeout}}function yS(e,{includeApiKey:t=!1}={}){const s=er(e,vS);return t&&(s.api_key=e.api_key),s}function xS(e){return{timeout:e.timeout}}function Fl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const _S={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("codex"),a=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=q(()=>{const K=a.value.model;return K&&!i.includes(K)?[K,...i]:i}),o=q(()=>{const K=a.value.agent_model;return K&&K!=="auto"&&!i.includes(K)?[K,...i]:i}),r={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(K,be)=>!!K&&!!be&&(r[K]||[]).includes(be),d=K=>!c(a.value.model,K)&&!(a.value.agent_reasoning_effort===""&&c(a.value.agent_model,K)),u=K=>{const be=a.value.agent_model;return be==="auto"?!0:!c(be||a.value.model,K)},p=q(()=>{const K=a.value.agent_reasoning_effort;return K==="auto"?null:K||a.value.reasoning_effort}),f=K=>c(K,a.value.reasoning_effort)||a.value.agent_model===""&&c(K,p.value),m=K=>c(K,p.value),v=h({enabled:!1,model:"gpt-5.6-luna"}),w=h({unavailable_reason:null}),N=q(()=>{const K=v.value.model;return K&&!i.includes(K)?[K,...i]:i});function x(K){const be=K.target.value;v.value.enabled=be!=="",be!==""&&(v.value.model=be),te()}const b=h(!1),y=h({codex:!1,ollama:!1,kimi:!1}),E=h(null),S=h(!1),L=h(""),R=h(null),_=h(!1);let D=0;const U=q(()=>{var K;return Object.entries(((K=E.value)==null?void 0:K.models)||{}).map(([be,Ae])=>{var es,un,Hn;return{model:be,floor:Ae.floor,override:Ae.override,effectiveBudget:(es=Ae.effective)==null?void 0:es.effective_budget,configuredPrimaryChars:(un=Ae.configured)==null?void 0:un.primary_chars,primaryChars:(Hn=Ae.effective)==null?void 0:Hn.primary_chars,provenance:Ae.provenance,clampExpiresAt:Ae.clamp_expires_at,densityPriorMilli:Ae.density_prior_milli,densityScope:Ae.density_scope,workloadCalibration:Ae.workload_calibration}})}),T=q(()=>{var K;return((K=E.value)==null?void 0:K.clamps)||[]}),M=q(()=>{var K,be;return((be=(K=E.value)==null?void 0:K.models)==null?void 0:be[a.value.model])||null}),j=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),J=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),A=h(!1),k=h(!1),C=h(!1),$=h(!1),W=h(!1),G=h(!1),Z=h(!1),oe=h({configured:null}),se=h(!1),ce=h([]),Ne=h(""),Y=h(!1),ge=h(!1),V=h({configured:null}),re=h(!1),ue=h([]),Ie=h(""),g=h(!1),I=h(!1),F=h(!0),ee=h(""),X=h({configured:null,accounts:[]}),ae=h(null),fe=h(null),pe=h(""),de=h(null),le=h(!1),xe=h(null),me=h(null),_e=h("");let Re=null;function B(K,be="success"){ye(K,be==="error"?"error":"success")}function ve(K){if(!K)return"?";const be=K/(1024*1024*1024);return be>=1?be.toFixed(1)+" GB":(K/(1024*1024)).toFixed(0)+" MB"}function ke(K){return Number.isFinite(Number(K))?Number(K).toLocaleString():"—"}function Oe(K){return K==null?"automatic (model-derived)":Number(K).toLocaleString()+" characters"}function Me(K){const be=new Date(K);return Number.isNaN(be.getTime())?"unknown":be.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function dt(K){return typeof K=="string"&&K.length>12?K.slice(0,8)+"…"+K.slice(-4):K}function st(K){return typeof K!="number"||!Number.isFinite(K)?"—":(K/1e3).toFixed(2)}function _t(K){return K==="temporary learned clamp"?"is-clamp":K==="override"?"is-override":"is-built-in"}function Ot(K){const be=a.value.context_budget_overrides[K.model];return K.floor!=null&&Number.isFinite(Number(be))&&Number(be)>K.floor}function rt(K,be){const Ae={...a.value.context_budget_overrides};be.target.value===""?delete Ae[K]:Ae[K]=Number(be.target.value),a.value.context_budget_overrides=Ae,_.value=!0}function Qe(K){a.value.context_utilization=K.target.value===""?"":Number(K.target.value),_.value=!0}function ie(K){const be={...a.value.context_budget_overrides};delete be[K],a.value.context_budget_overrides=be,_.value=!0}async function Se(){e.value=!0,await Promise.all([Le(),Et(),ks(),Ve(),Ke()]),e.value=!1}async function Le({preserveBasic:K=!1,preserveAdvanced:be=!1}={}){try{const Ae=await z.get("/api/llm/status");t.value=Ae,s.value=!1,n.value=Ae.active_provider||"codex",Ae.codex&&!Ds.pending()&&(K||(a.value.enabled=Ae.codex.enabled,a.value.model=Ae.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Ae.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Ae.codex.agent_reasoning_effort||"",a.value.agent_model=Ae.codex.agent_model||""),be||(a.value.request_timeout_seconds=Ae.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Ae.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Ae.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Ae.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Ae.codex.context_compression||{}},!_.value&&!C.value&&(a.value.context_budget_overrides={...Ae.codex.context_budget_overrides||{}},a.value.context_utilization=Ae.codex.context_utilization??a.value.context_utilization))),Ae.ollama&&!we.pending()&&(K||(j.value.enabled=Ae.ollama.enabled,j.value.base_url=Ae.ollama.base_url||"",j.value.model=Ae.ollama.model||"",j.value.max_tokens=Ae.ollama.max_tokens||4096),be||(j.value.timeout=Ae.ollama.timeout??j.value.timeout)),Ae.kimi&&!$e.pending()&&(K||(J.value.enabled=Ae.kimi.enabled,J.value.model=Ae.kimi.model||"",J.value.max_tokens=Ae.kimi.max_tokens||4096),be||(J.value.timeout=Ae.kimi.timeout??J.value.timeout)),Ae.auxiliary&&(w.value=Ae.auxiliary,te.pending()||(v.value.enabled=Ae.auxiliary.enabled,v.value.model=Ae.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function Ke(){const K=++D;S.value=!0,L.value="";try{const be=await z.get("/api/context/windows");if(K!==D)return;E.value=be,!C.value&&!_.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(be.models||{}).filter(([,Ae])=>Ae.override!=null).map(([Ae,es])=>[Ae,es.override])),a.value.context_utilization=be.utilization??a.value.context_utilization)}catch(be){K===D&&(L.value=be.message||"Failed to load context budgets")}finally{K===D&&(S.value=!1)}}async function Et(){try{if(oe.value=await z.get("/api/ollama/status"),se.value=!1,oe.value.model&&(Ne.value=oe.value.model),oe.value.configured)try{const K=await z.get("/api/ollama/models");ce.value=K.models||[]}catch{ce.value=[]}else if(j.value.base_url)try{const K=await z.post("/api/ollama/probe-models",{base_url:j.value.base_url});ce.value=K.models||[]}catch{ce.value=[]}}catch{se.value=!0}}async function Ve(){F.value=!0,ee.value="";try{X.value=await z.get("/api/codex/status")}catch(K){ee.value=K.message||"Failed to fetch Codex status"}finally{F.value=!1}}async function $t(){const K=t.value?t.value.active_provider:"codex";Z.value=!0;try{const be=await z.post("/api/llm/switch",{provider:n.value});be.error?(n.value=K,B(be.error,"error")):(B("Switched to "+n.value+" ("+be.model+")"),await Se())}catch(be){n.value=K,B(be.message||"Switch failed","error")}finally{Z.value=!1}}async function zt(){Y.value=!0;try{const K=await z.post("/api/ollama/reload");B(K.configured?"Ollama reloaded":K.reason||"Ollama not configured",K.configured?"success":"error"),await Se()}catch(K){B(K.message||"Reload failed","error")}finally{Y.value=!1}}async function rs(){ge.value=!0;try{await z.post("/api/ollama/model",{model:Ne.value}),B("Model set to "+Ne.value),await Se()}catch(K){B(K.message||"Failed","error")}finally{ge.value=!1}}async function Js(){const K=j.value.base_url;if(!K){B("Enter a base URL first","error");return}G.value=!0;try{const be=await z.post("/api/ollama/probe-models",{base_url:K});ce.value=be.models||[],ce.value.length?(B(ce.value.length+" model(s) found"),!j.value.model&&ce.value.length&&(j.value.model=ce.value[0].name)):B("No models found at "+K,"error")}catch(be){B(be.message||"Could not reach Ollama","error")}finally{G.value=!1}}async function ks(){try{if(V.value=await z.get("/api/kimi/status"),re.value=!1,V.value.model&&(Ie.value=V.value.model),V.value.configured)try{const K=await z.get("/api/kimi/models");ue.value=K.models||[]}catch{ue.value=[]}}catch{re.value=!0}}async function na(){g.value=!0;try{const K=await z.post("/api/kimi/reload");B(K.configured?"Kimi reloaded":K.reason||"Kimi not configured",K.configured?"success":"error"),await Se()}catch(K){B(K.message||"Reload failed","error")}finally{g.value=!1}}async function Zs(){I.value=!0;try{await z.post("/api/kimi/model",{model:Ie.value}),B("Model set to "+Ie.value),await Se()}catch(K){B(K.message||"Failed","error")}finally{I.value=!1}}async function Ns(){if(C.value){Ds();return}C.value=!0;const K=hp(a.value);try{await z.put("/api/llm/codex/config",K),B("Codex config saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Ve()])}catch(be){B(be.message||"Failed","error");const Ae=JSON.stringify(hp(a.value))!==JSON.stringify(K);await Promise.all([Le({preserveBasic:Ae,preserveAdvanced:!0}),Ve()])}finally{C.value=!1}}async function Mn(){if(C.value)return;C.value=!0;const K=mp(a.value);try{await z.put("/api/llm/codex/config",K),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:K.context_budget_overrides,context_utilization:K.context_utilization})&&(_.value=!1),B("Codex advanced settings saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Ve(),Ke()])}catch(be){B(be.message||"Failed","error");const Ae=JSON.stringify(mp(a.value))!==JSON.stringify(K);await Promise.all([Le({preserveBasic:!0,preserveAdvanced:Ae}),Ve(),Ke()])}finally{C.value=!1}}async function Ss(){if($.value){we();return}$.value=!0;try{const K=A.value?j.value.api_key:null,be=gS(j.value,{includeApiKey:K!==null});await z.put("/api/llm/ollama/config",be),B("Ollama config saved"),K!==null&&j.value.api_key===K&&(j.value.api_key="",A.value=!1),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Et()])}catch(K){B(K.message||"Failed","error")}finally{$.value=!1}}async function Fn(){if(!$.value){$.value=!0;try{await z.put("/api/llm/ollama/config",bS(j.value)),B("Ollama timeout saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Et()])}catch(K){B(K.message||"Failed","error")}finally{$.value=!1}}}async function Lt(){if(W.value){$e();return}W.value=!0;try{const K=k.value?J.value.api_key:null,be=yS(J.value,{includeApiKey:K!==null});await z.put("/api/llm/kimi/config",be),B("Kimi config saved"),K!==null&&J.value.api_key===K&&(J.value.api_key="",k.value=!1),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),ks()])}catch(K){B(K.message||"Failed","error")}finally{W.value=!1}}async function Xe(){if(!W.value){W.value=!0;try{await z.put("/api/llm/kimi/config",xS(J.value)),B("Kimi timeout saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),ks()])}catch(K){B(K.message||"Failed","error")}finally{W.value=!1}}}async function Ts(){if(b.value){te();return}b.value=!0;try{await z.put("/api/llm/auxiliary/config",v.value),B("Auxiliary config saved"),await Le()}catch(K){B(K.message||"Failed","error"),await Le()}finally{b.value=!1}}const Ds=Fl(Ns),te=Fl(Ts),we=Fl(Ss),$e=Fl(Lt),Je=()=>(Ds.cancel(),Ns()),wt=()=>(we.cancel(),Ss()),ut=()=>($e.cancel(),Lt()),$n=()=>Mn(),js=()=>Fn(),mi=()=>Xe();async function vi(K){const be=K.account_key+":"+K.model;R.value=be;try{const Ae=await z.post("/api/context/windows/clear",{account_key:K.account_key,model:K.model});B(Ae.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Ke()}catch(Ae){B(Ae.message||"Failed to clear clamp","error"),await Ke()}finally{R.value=null}}async function Ia(K){try{await z.post("/api/codex/account/"+K+"/activate"),B("Active account switched"),await Ve()}catch(be){B(be.message||"Failed","error")}}async function aa(K){ae.value=K;try{await z.post("/api/codex/account/"+K+"/refresh"),B("Token refreshed"),await Ve()}catch(be){B(be.message||"Refresh failed","error")}finally{ae.value=null}}function Un(K,be){fe.value=K,pe.value=be||""}async function Bn(K){try{await z.put("/api/codex/account/"+K+"/label",{label:pe.value}),B("Label updated"),fe.value=null,await Ve()}catch(be){B(be.message||"Failed","error")}}async function Ys(K,be){if(await qt({title:"Delete Codex account",message:`Delete ${be||"account #"+(K+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/codex/account/"+K),B("Deleted. Pool reloaded."),await Ve()}catch(es){B(es.message||"Failed","error")}}async function dn(){le.value=!0;try{const K=await z.post("/api/codex/device-code");xe.value=K,de.value="pending",Xt(K)}catch(K){B(K.message||"Failed","error")}finally{le.value=!1}}async function Xt(K){Re={cancelled:!1};const be=Re;try{const Ae=await z.post("/api/codex/device-poll",{device_auth_id:K.device_auth_id,user_code:K.user_code,interval:K.interval});if(be.cancelled)return;me.value=Ae,de.value="success",await Se()}catch(Ae){if(be.cancelled)return;_e.value=Ae.message||"Device login failed",de.value="error"}}function Oa(){Re&&(Re.cancelled=!0),de.value=null,xe.value=null}return je(Se),ft(()=>{Re&&(Re.cancelled=!0),Ds.cancel(),te.cancel(),we.cancel(),$e.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:Z,advancedOpen:y,codexForm:a,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:f,agentModelOptionDisabled:m,auxForm:v,auxData:w,auxModelOptions:N,onAuxModelChange:x,savingAux:b,saveAuxConfigDebounced:te,ollamaForm:j,kimiForm:J,savingCodex:C,savingOllama:$,savingKimi:W,probingOllama:G,ollamaKeyDirty:A,kimiKeyDirty:k,fetchCodexStatus:Ve,ollamaStatus:oe,ollamaStatusLoadFailed:se,ollamaModels:ce,ollamaSelectedModel:Ne,reloading:Y,settingModel:ge,kimiStatus:V,kimiStatusLoadFailed:re,kimiModels:ue,kimiSelectedModel:Ie,reloadingKimi:g,settingKimiModel:I,codexLoading:F,codexError:ee,codexData:X,refreshing:ae,editingLabel:fe,labelValue:pe,contextWindows:E,contextWindowsLoading:S,contextWindowsError:L,contextBudgetRows:U,activeClampRows:T,activeContextBudget:M,clearingClamp:R,contextPolicyDirty:_,deviceState:de,deviceLoading:le,deviceInfo:xe,deviceResult:me,deviceError:_e,fetchAll:Se,fetchLLMStatus:Le,fetchOllamaStatus:Et,fetchKimiStatus:ks,switchProvider:$t,reloadOllama:zt,setOllamaModel:rs,reloadKimi:na,setKimiModel:Zs,probeOllamaModels:Js,saveCodexConfig:Ns,saveOllamaConfig:Ss,saveKimiConfig:Lt,saveCodexAdvancedConfig:Mn,saveOllamaAdvancedConfig:Fn,saveKimiAdvancedConfig:Xe,saveCodexConfigDebounced:Ds,saveOllamaConfigDebounced:we,saveKimiConfigDebounced:$e,saveCodexConfigNow:Je,saveOllamaConfigNow:wt,saveKimiConfigNow:ut,saveCodexAdvancedConfigNow:$n,saveOllamaAdvancedConfigNow:js,saveKimiAdvancedConfigNow:mi,activateAccount:Ia,refreshAccount:aa,startEditLabel:Un,saveLabel:Bn,deleteAccount:Ys,startDeviceLogin:dn,cancelDeviceLogin:Oa,formatSize:ve,fetchContextWindows:Ke,clearContextClamp:vi,setContextOverride:rt,setContextUtilization:Qe,resetContextOverride:ie,overrideAboveFloor:Ot,formatCount:ke,formatContextCeiling:Oe,formatExpiry:Me,shortAccountKey:dt,provenanceClass:_t,formatDensity:st}}},vp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function wS(e){return vp[e]||vp[(e||"").toLowerCase()]||"text-gray-400"}const kS={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),o=h(null),r=h(null),c=h(null),d=q(()=>{var S;return Object.values(((S=i.value)==null?void 0:S.totals)||{}).reduce((L,R)=>L+Number(R||0),0)}),u=h(""),p=h(0),f=h([]),m=q(()=>f.value.map(S=>`${S.label} (${S.path}${S.reason?`: ${S.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let w=null;async function N(){var D;const S=await Promise.allSettled(v.map(U=>z.get(U.path))),L=U=>S[U].status==="fulfilled"?S[U].value:null;t.value=L(0)||{};const R=L(1);s.value=Array.isArray(R)?R:R&&R.subsystems||[],n.value=L(2)||{},a.value=L(3)||{},i.value=L(4),l.value=L(5),o.value=L(6),r.value=L(7),c.value=L(8);const _=S.filter(U=>U.status==="rejected");if(f.value=S.flatMap((U,T)=>{var M;return U.status==="rejected"?[{...v[T],reason:((M=U.reason)==null?void 0:M.message)||"request failed"}]:[]}),p.value=f.value.length,_.length===S.length){const U=(D=_[0])==null?void 0:D.reason;u.value=(U==null?void 0:U.message)||"Failed to load internals"}else u.value="";e.value=!1}function x(){e.value=!0,u.value="",N()}let b=!1;function y(){b||(b=!0,N(),w||(w=setInterval(N,3e4)))}function E(){b&&(b=!1,w&&(clearInterval(w),w=null))}return je(y),Qt(y),Gt(E),ft(E),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:m,endpoints:v,retry:x,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:wS,formatAgeSeconds:jw}}},SS=1e4,gp=3e4;function ki(e,t){return Math.max(0,e-t)}function Tr(e,t){return new Set((e.operations||[]).map(n=>n.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const TS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],CS={template:`
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
  `,setup(){const e=h(null),t=h(""),s=h(null),n=h(!1),a=h(0),i=h(null),l=h(""),o=h(null),r=h(!1),c=h(0),d=h(Date.now());let u=null,p=0,f=0;async function m(){const k=++p;n.value=!0;try{const C=await z.get("/api/turn-state/turns?limit=100");if(k!==p)return;t.value=C.availability,e.value=C.availability==="available"?C.data:null,s.value=null,a.value=Date.now()}catch(C){if(k!==p)return;s.value=C.message||"Turn-state read failed",C.status===503&&(t.value="unavailable")}k===p&&(n.value=!1)}async function v(){const k=++f;r.value=!0;try{const C=await z.get("/api/turn-state/capacity-breakers");if(k!==f)return;l.value=C.availability,i.value=C.availability==="available"?C.data:null,o.value=null,c.value=Date.now()}catch(C){if(k!==f)return;o.value=C.message||"Breaker read failed",C.status===503&&(l.value="unavailable")}k===f&&(r.value=!1)}function w(){m(),v()}const N=q(()=>e.value!==null&&ki(d.value,a.value)>gp),x=q(()=>i.value!==null&&ki(d.value,c.value)>gp),b=q(()=>N.value||x.value),y=q(()=>Math.round(ki(d.value,a.value)/1e3)),E=q(()=>Math.round(ki(d.value,c.value)/1e3));function S(k){return Tr(k,d.value/1e3)}function L(k){return TS[S(k)]}const R=q(()=>{var $;const k=[...(($=e.value)==null?void 0:$.turns)||[]],C=d.value/1e3;return k.sort((W,G)=>Tr(W,C)-Tr(G,C)||(G.last_progress_at||0)-(W.last_progress_at||0))});function _(k){return k.state==="closed"?"badge-success":k.state==="probing"?"badge-warning":"badge-danger"}function D(k){if(k.state==="closed")return"—";const C=ki(d.value,c.value)/1e3,$=Math.max(0,(k.cooldown_remaining_seconds||0)-C);return $>0?`${Math.ceil($)}s`:k.state==="probing"?"probe in flight":"probe eligible"}function U(k){if(!k)return"";const C=Math.max(0,Math.round(d.value/1e3-k));if(C<90)return`${C}s ago`;const $=Math.round(C/60);return $<90?`${$}m ago`:`${Math.round($/60)}h ago`}let T=null,M=null,j=!1;function J(){j||(j=!0,w(),T=setInterval(w,SS),u=setInterval(()=>{d.value=Date.now()},1e3),M=Ye.onReconnected(w))}function A(){j&&(j=!1,T&&(clearInterval(T),T=null),u&&(clearInterval(u),u=null),M&&(M(),M=null))}return je(J),Qt(J),Gt(A),ft(A),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:n,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:N,breakersStale:x,anyStale:b,turnsAgeSeconds:y,breakersAgeSeconds:E,sortedTurns:R,priorityOf:S,priorityBadge:L,breakerBadge:_,cooldownLabel:D,ageLabel:U,fetchTurns:m,fetchBreakers:v,refreshAll:w,arm:J,disarm:A}}},ES={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),o=h(null),r=h(!1);async function c(){a.value=!0,o.value=null,r.value=!1;try{const u=await z.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{a.value=!1}}async function d(){if(await qt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await z.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return je(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},bp=e=>JSON.parse(JSON.stringify(e)),AS=(e,t)=>JSON.stringify(e)===JSON.stringify(t),RS={emits:["saved"],template:`
    <section class="hm-card computer-provisioning" aria-labelledby="computer-provisioning-title">
      <div class="section-card-header">
        <div>
          <h2 id="computer-provisioning-title" class="text-sm font-semibold text-gray-300">Computer provisioning</h2>
          <p class="page-lede">Edit desired target, storage and launcher policy. All settings below require an Odin restart. Startup values remain pinned, even across disable/enable cycles.</p>
        </div>
        <span class="badge badge-warning">Restart required</span>
      </div>
      <p class="page-lede mb-3">Saving does not install dependencies, create storage, grant OS permissions, attach to a desktop or restart Odin. Enable/disable and Stop session are separate lifecycle controls above.</p>
      <p v-if="message" class="text-sm text-amber-300 mb-3" role="status">{{ message }}</p>
      <p v-if="error" class="text-sm text-red-400 mb-3" role="alert">{{ error }}</p>
      <p v-if="loading" class="page-lede" role="status">Loading desired configuration and restart metadata…</p>
      <p v-if="ready" class="page-lede mb-3">{{ pending.length ? 'Saved settings still pending restart: ' + pending.join(', ') : 'No pending provisioning restart reported.' }}</p>
      <p v-if="ready && effectiveUnknown" class="page-lede mb-3">Some startup values are unknown; absence of a pending flag does not prove those settings are active.</p>
      <form v-if="ready" @submit.prevent="openReview">
        <fieldset :disabled="loading || saving || reviewing || uncertain" class="computer-provisioning-fields">
          <legend class="sr-only">Desired computer settings</legend>
          <div v-for="field in fields" :key="field.path" class="computer-provisioning-field">
            <label class="field-label" :for="fieldId(field)">{{ field.label }}</label>
            <p class="page-lede" :id="fieldId(field) + '-help'">{{ field.description }}</p>
            <select v-if="field.enum?.length" class="hm-select" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" v-model="draft[field.key]">
              <option v-for="option in field.enum" :key="String(option)" :value="option">{{ option }}</option>
            </select>
            <input v-else-if="field.type === 'boolean'" type="checkbox" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" v-model="draft[field.key]" />
            <textarea v-else-if="field.type === 'array'" class="hm-input font-mono" rows="3" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" :value="draft[field.key]" @input="edit(field, $event.target.value)" placeholder="One monitor name per line"></textarea>
            <input v-else class="hm-input font-mono" :type="['integer', 'number'].includes(field.type) ? 'number' : 'text'" :id="fieldId(field)" :aria-describedby="fieldId(field) + '-help'" :min="field.constraints?.minimum" :max="field.constraints?.maximum" :step="field.type === 'integer' ? 1 : 'any'" :value="draft[field.key] ?? ''" @input="edit(field, $event.target.value)" autocomplete="off" />
            <p v-if="validation[field.key]" class="text-sm text-red-400" role="alert">{{ validation[field.key] }}</p>
          </div>
        </fieldset>
        <div class="action-row mt-4">
          <button class="btn btn-primary btn-touch" type="submit" :disabled="!changes.length || invalid || loading || saving || reviewing || uncertain">Review {{ changes.length }} change{{ changes.length === 1 ? '' : 's' }}</button>
          <button class="btn btn-ghost btn-touch" type="button" @click="discard" :disabled="loading || saving || uncertain || !changes.length">Discard draft</button>
        </div>
      </form>
      <section v-if="reviewing" class="computer-provisioning-review mt-4" aria-labelledby="computer-provisioning-review-title">
        <h3 id="computer-provisioning-review-title" class="text-sm font-semibold">Review provisioning changes</h3>
        <dl class="detail-grid mt-3">
          <div v-for="change in changes" :key="change.key">
            <dt>{{ change.label }}</dt>
            <dd><strong>Saved:</strong> {{ format(original[change.key]) }}</dd>
            <dd><strong>Desired:</strong> {{ format(change.value) }}</dd>
          </div>
        </dl>
        <p class="page-lede mt-3">Only these changed provisioning fields will be saved. Running sessions keep startup settings. Nothing is enabled, stopped or restarted.</p>
        <div class="action-row mt-3">
          <button class="btn btn-primary btn-touch" type="button" @click="save" :disabled="saving || loading || invalid || uncertain || !changes.length">{{ saving ? 'Saving and checking configuration…' : 'Save reviewed provisioning' }}</button>
          <button class="btn btn-ghost btn-touch" type="button" @click="reviewing = false" :disabled="saving">Back to editing</button>
        </div>
      </section>
      <button class="btn btn-ghost btn-touch mt-3" type="button" @click="load" :disabled="loading || saving || (changes.length > 0 && !uncertain)">{{ uncertain ? 'Reload saved values (discard draft)' : 'Reload provisioning' }}</button>
      <p class="text-xs text-gray-500 mt-3">Drafts are local to this view and discarded when leaving it. Backend validation remains authoritative.</p>
    </section>`,setup(e,{emit:t}){const s=h([]),n=h({}),a=h({}),i=h(!1),l=h(!1),o=h(!1),r=h(!1),c=h(!1),d=h(""),u=h("");let p=!1,f=0,m=null;const v=(A,k)=>p&&f===A&&z.token===k,w=A=>"computer-provisioning-"+A.key,N=A=>A===null?"Unset":A===""?"Empty":JSON.stringify(A),x=A=>{const k=a.value[A.key];return A.type==="array"?String(k||"").split(/\r?\n/).map(C=>C.trim()).filter(Boolean):["integer","number"].includes(A.type)?k===""||k==null?null:Number(k):k},b=q(()=>s.value.map(A=>({...A,value:x(A)})).filter(A=>!AS(A.value,n.value[A.key]))),y=q(()=>s.value.filter(A=>A.pending_restart).map(A=>A.label)),E=q(()=>s.value.some(A=>A.apply_state==="unknown")),S=q(()=>{const A={};for(const k of s.value){const C=x(k),$=k.constraints||{};["integer","number"].includes(k.type)&&(C===null&&!k.nullable?A[k.key]="A number is required.":C!==null&&(!Number.isFinite(C)||k.type==="integer"&&!Number.isInteger(C)||$.minimum!=null&&C<$.minimum||$.maximum!=null&&C>$.maximum)&&(A[k.key]="Enter a number within the allowed range.")),k.key==="monitor_names"&&(C.length>16||new Set(C).size!==C.length||C.some(W=>!/^[A-Za-z0-9_.-]{1,64}$/.test(W)))&&(A[k.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return A}),L=q(()=>Object.keys(S.value).length>0);function R(A,k){a.value[A.key]=k,u.value=""}function _(){a.value=Object.fromEntries(s.value.map(A=>[A.key,A.type==="array"?n.value[A.key].join(`
`):n.value[A.key]])),r.value=!1}async function D(A,k){const[C,$]=await Promise.all([z.get("/api/config"),z.get("/api/config/meta")]);if(!v(A,k))return!1;const W=($.fields||[]).filter(G=>/^computer\.[^.]+$/.test(G.path)&&G.path!=="computer.enabled"&&G.sensitivity==="public"&&G.apply_mode==="restart");if(!C.computer||!W.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=W.map(G=>({...G,key:G.path.split(".")[1]})),n.value=Object.fromEntries(s.value.map(G=>[G.key,bp(C.computer[G.key])])),_(),m=k,i.value=!0,c.value=!1,!0}async function U(){if(!p||l.value||o.value)return;const A=++f,k=z.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await D(A,k)}catch(C){v(A,k)&&(c.value=!0,d.value=C.message||"Could not load provisioning. No changes were sent.")}finally{v(A,k)&&(l.value=!1)}}function T(){i.value&&!l.value&&!o.value&&!c.value&&b.value.length&&!L.value&&(r.value=!0)}async function M(){if(!p||!i.value||!r.value||o.value||l.value||c.value||L.value||!b.value.length)return;if(m!==z.token){J(),j();return}const A={computer:Object.fromEntries(b.value.map(W=>[W.key,bp(W.value)]))},k=f,C=z.token;o.value=!0,d.value="",u.value="";let $=!1;try{if(await z.put("/api/config",A),$=!0,!v(k,C))return;await D(k,C)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(W){v(k,C)&&(c.value=!0,r.value=!1,d.value=$?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${W.status===400?": "+W.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{v(k,C)&&(o.value=!1)}}function j(){p||(p=!0,U())}function J(){p=!1,f++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],n.value={},a.value={},d.value="",u.value=""}return je(j),Qt(j),Gt(J),ft(J),{fields:s,original:n,draft:a,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:y,effectiveUnknown:E,changes:b,validation:S,invalid:L,fieldId:w,format:N,edit:R,discard:_,load:U,openReview:T,save:M}}},IS={components:{ComputerProvisioning:RS},template:`
    <div class="p-6 page-fade-in computer-page" role="region" aria-labelledby="computer-title">
      <header class="page-header mb-4">
        <div class="page-header-copy">
          <h1 id="computer-title" class="text-xl font-semibold">Computer operator</h1>
          <p class="page-lede">Private session inspection. This page does not send mouse or keyboard input.</p>
        </div>
        <div class="page-header-actions" aria-label="Emergency session controls">
          <button class="btn btn-ghost btn-touch" @click="control('pause')" :disabled="pausing" aria-label="Pause and revoke agent input">
            <odin-icon name="pause" :size="15" />
            {{ pausing ? 'Pausing…' : 'Pause / revoke input' }}
          </button>
          <button class="btn btn-danger btn-touch" @click="control('stop')" :disabled="stopping" aria-label="Stop computer session">
            <odin-icon name="error" :size="15" />
            {{ stopping ? 'Stopping…' : 'Stop session' }}
          </button>
        </div>
      </header>
      <div v-if="error" class="hm-card border-red-900 error-state mb-4" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
      </div>
      <div class="hm-card computer-status-card mb-4" role="status" aria-live="polite">
        <div>
          <div class="section-eyebrow">Current session</div>
          <div class="computer-state">{{ status.state || 'unknown' }}</div>
        </div>
        <span class="badge badge-info">{{ loading ? 'Checking status' : 'Session status' }}</span>
      </div>
      <div class="space-y-4">
      <section class="hm-card" aria-labelledby="computer-lifecycle-title">
        <div class="section-card-header">
          <div>
            <h2 id="computer-lifecycle-title" class="text-sm font-semibold text-gray-300">Administrator lifecycle controls</h2>
            <p class="page-lede">Configuration and runtime state are separate. Changes here never restart Odin.</p>
          </div>
        </div>
        <dl class="detail-grid mb-4">
          <div><dt>Configured</dt><dd>{{ enabledLabel(status.configured_enabled ?? status.enabled) }}</dd></div>
          <div><dt>Runtime lifecycle</dt><dd>{{ enabledLabel(status.runtime_enabled) }}</dd></div>
          <div><dt>Runtime generation</dt><dd>{{ status.generation ?? 'Unknown' }}</dd></div>
          <div><dt>Backend platform / environment</dt><dd>{{ status.backend?.platform || 'Unknown' }} / {{ status.backend?.environment || 'Unknown' }}</dd></div>
          <div><dt>Restart-required settings</dt><dd>{{ restartSettings }}</dd></div>
        </dl>
        <div v-if="adminReady" class="action-row mb-3">
          <button class="btn btn-primary btn-touch" @click="setEnabled(true)" :disabled="toggling || stopping || pausing || (status.configured_enabled ?? status.enabled) === true">Enable computer use</button>
          <button class="btn btn-danger btn-touch" @click="setEnabled(false)" :disabled="toggling || stopping || pausing">Disable computer use</button>
        </div>
        <p v-else class="page-lede">Lifecycle controls require a successful authenticated administrator status check.</p>
        <p v-if="toggling" class="text-sm text-amber-400" role="status">Applying lifecycle change and checking status…</p>
        <p class="page-lede">Enabling does not prove backend readiness or start a session. Session startup checks capabilities. Unavailable input remains unavailable.</p>
        <p v-if="status.backend?.input_supported === false" class="page-lede">Input unavailable: this backend cannot act. Enabling computer use does not grant mouse or keyboard control.</p>
        <p v-else-if="status.backend?.input_supported !== true" class="page-lede">Input capability is unknown. Do not assume this backend can act.</p>
        <p v-else class="page-lede">Backend reports input support; session authorization and startup checks still apply.</p>
        <p v-if="status.backend?.input_blocker" class="page-lede text-break">Readiness: {{ status.backend.readiness }}. Input blocker: {{ status.backend.input_blocker }}.</p>
        <p v-if="['application_uid_mismatch', 'application_process_unreadable'].includes(status.backend?.input_blocker)" class="page-lede">Display capture access is not application inspection access. Provision the worker under the desktop user's identity, or explicitly configure runtime_sudo and its restricted worker permissions. This page does not elevate privileges.</p>
        <p class="text-xs text-gray-500 mt-3">Runtime settings are generation-pinned. Pending restart-required settings are not live; this page does not restart Odin.</p>
      </section>
      <computer-provisioning v-if="adminReady" @saved="refresh" />
      <section class="hm-card" aria-labelledby="computer-accessibility-title">
        <div class="section-card-header">
          <h2 id="computer-accessibility-title" class="text-sm font-semibold text-gray-300">Desktop accessibility (AT-SPI)</h2>
          <span class="badge badge-info" role="status" aria-live="polite">{{ accessibilityLabel }}</span>
        </div>
        <p class="page-lede">AT-SPI is Linux's accessibility interface. Enabling it lets Odin target UI elements by identity and replace field contents reliably when the application exposes editable elements.</p>
        <p class="page-lede">Without accessible elements, Odin can use pixels and coordinates. Field replacement uses the explicit pixel action (replace_field_pixels): click an observed field, select all, then type. It is less reliable and needs visual verification; identity-based replace_field never silently switches paths.</p>
        <p class="page-lede">Enabled is a session setting, not proof that a particular application exposes editable elements or that input is authorized. Fresh observations, application safety checks and consent still apply.</p>
        <p class="text-xs text-gray-500 mt-3">Read-only org.a11y.Status IsEnabled check for the configured runtime operator session, refreshed with status about every 5 seconds while this page is open. {{ accessibilityDetail }}</p>
        <p class="page-lede">This page does not enable or disable accessibility. Change it explicitly in your desktop's accessibility settings; that affects your whole user session, not just Odin.</p>
      </section>
      <section v-if="status.input_admission" class="hm-card text-break" aria-labelledby="computer-input-admission-title">
        <div class="section-card-header">
          <h2 id="computer-input-admission-title" class="text-sm font-semibold text-gray-300">Input eligibility evidence</h2>
          <span class="badge badge-info">{{ status.input_admission.state }}</span>
        </div>
        <div class="detail-stack text-sm text-gray-300">
          <p><strong>{{ status.input_admission.state }}</strong>: {{ status.input_admission.code }}</p>
          <p v-if="status.input_admission.compositor">Compositor: {{ status.input_admission.compositor.name }} {{ status.input_admission.compositor.version }} ({{ status.input_admission.compositor.backend }}). Build: {{ status.input_admission.compositor.build_id }}.</p>
          <p>{{ status.input_admission.reason }}</p>
          <p>Operator action: {{ status.input_admission.remedy }}</p>
          <p>Probe scope: {{ status.input_admission.probe_scope }}.</p>
        </div>
        <p v-if="status.input_admission.probe_scope === 'same_stack_disposable'" class="page-lede">Behavior was tested in a separate disposable compositor with the matched stack, not by abandoning held input on your desktop.</p>
        <p class="page-lede">Eligibility evidence does not replace current portal consent, source mapping or application checks. Opening this page runs no input probe.</p>
      </section>
      <section v-if="!attached" class="hm-card" aria-labelledby="computer-apps-title">
        <div class="section-card-header">
          <h2 id="computer-apps-title" class="text-sm font-semibold text-gray-300">Application profiles</h2>
        </div>
        <ul v-if="applicationProfiles.length" class="profile-list mb-3">
          <li v-for="profile in applicationProfiles" :key="profile.id" class="profile-list-item">
            <strong>{{ profile.label }}</strong>: {{ profile.input === 'supported' ? 'Input eligible' : 'Capture only' }}
            <span v-if="profile.input === 'capture_only'"> (application provenance unavailable)</span>
            <p v-if="profile.task_scope" class="page-lede">{{ profile.task_scope }}</p>
          </li>
        </ul>
        <p v-else class="page-lede">No application profiles reported for this backend.</p>
        <p class="page-lede">Profiles describe supported scope, not installation, focus, permission or task success. Input readiness is checked against a fresh observation.</p>
      </section>
      <section v-else class="hm-card text-break" aria-labelledby="computer-attached-title">
        <div class="section-card-header">
          <h2 id="computer-attached-title" class="text-sm font-semibold text-gray-300">Attached application</h2>
        </div>
        <p class="page-lede">Focus the application you want help with, then ask in ordinary chat. There is no application allowlist. Normal dialogs, file pickers, menus and document open/new/close/reopen are ordinary use. Session Stop only detaches input; applications stay open.</p>
        <p class="page-lede">Denied classes remain blocked: terminals, shells, authentication and password prompts, polkit, keyring, sudo and Odin control-plane windows. Session authorization, current target checks and input-release checks still apply.</p>
        <dl class="detail-grid mt-4 mb-3">
          <div><dt>Observed executable</dt><dd>{{ status.application_provenance?.exe_basename || 'Not observed' }}</dd></div>
          <div><dt>Observed WM_CLASS</dt><dd>{{ status.application_provenance?.wm_class || 'Not observed' }}</dd></div>
          <div><dt>Observed PID</dt><dd>{{ status.application_provenance?.pid ?? 'Not observed' }}</dd></div>
          <div><dt>Trusted executable metadata</dt><dd>{{ status.application_provenance?.trusted_executable === true ? 'Yes' : status.application_provenance?.trusted_executable === false ? 'No' : 'Unknown' }}</dd></div>
          <div v-if="status.application_provenance?.script_identity"><dt>Script identity evidence</dt><dd>{{ scriptIdentity }}</dd></div>
          <div><dt>Pointer</dt><dd>{{ status.backend?.pointer || 'unknown' }}</dd></div>
          <div><dt>Keyboard focus</dt><dd>{{ status.backend?.keyboard_focus || 'unknown' }}</dd></div>
          <div><dt>Widget focus</dt><dd>{{ status.backend?.widget_focus || 'unknown' }}</dd></div>
        </dl>
        <p class="page-lede">Provenance describes the last observed target, not application approval or task success. Untrusted executable metadata is evidence, not an application refusal. Focus within one window may be shared even with an independent pointer. Unknown capabilities are not proof of independence.</p>
        <p v-if="inputLimits" class="page-lede">Per-call input bounds: {{ inputLimits }}. These limits are not application restrictions.</p>
      </section>
      <div v-if="status.state === 'unavailable'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Disabled or unavailable. Check configured state, lifecycle state and backend prerequisites separately.</div>
      <div v-if="status.state === 'paused'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Agent input is revoked. This inspector does not provide remote mouse or keyboard control. Resume requires a renewed generation and fresh evidence.</div>
      <div v-if="status.state === 'unknown'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Outcome is unknown. Refresh status; do not replay the last action.</div>
      <section v-if="status.recovery" class="hm-card" aria-labelledby="computer-recovery-title">
        <div class="section-card-header">
          <h2 id="computer-recovery-title" class="text-sm font-semibold text-gray-300">Recovery evidence</h2>
          <span class="badge" :class="status.recovery.complete ? 'badge-success' : 'badge-warning'">{{ status.recovery.complete ? 'Verified' : 'Review required' }}</span>
        </div>
        <p>{{ status.recovery.status }}: {{ status.recovery.reason }}. Cleanup {{ status.recovery.complete ? 'verified' : 'not verified' }}.</p>
        <p class="page-lede">Reconciliation only inspects the recorded workload. It never sends input, terminates applications or replays actions.</p>
        <button v-if="status.state === 'quarantined'" class="btn btn-ghost btn-touch mt-3" @click="recover" :disabled="recovering || !adminReady">{{ recovering ? 'Checking recorded workload…' : 'Verify recorded workload absence' }}</button>
        <div v-if="status.state === 'quarantined' && status.session_id" class="mt-3">
          <p class="text-amber-300">Manual reconciliation is an operator attestation, not verified cleanup. Independently inspect the desktop: no held input, owned master devices or workers may remain. Known running workers also block this request. The failed action remains unknown and is never replayed.</p>
          <label class="block mt-2" for="computer-reconciliation-ack">Type ACKNOWLEDGE UNVERIFIED CLEANUP {{ status.session_id }}</label>
          <input id="computer-reconciliation-ack" v-model="reconciliationAck" class="input w-full mt-2" autocomplete="off" :disabled="recovering || !adminReady">
          <button class="btn btn-ghost btn-touch mt-3" @click="reconcile" :disabled="recovering || !adminReady || reconciliationAck !== 'ACKNOWLEDGE UNVERIFIED CLEANUP ' + status.session_id">Acknowledge unverified cleanup</button>
        </div>
      </section>
      <section class="hm-card" aria-labelledby="computer-session-title">
        <div class="section-card-header">
          <h2 id="computer-session-title" class="text-sm font-semibold text-gray-300">Session details</h2>
        </div>
        <dl class="detail-grid">
          <div><dt>Owner</dt><dd>{{ status.owner_id || '—' }}</dd></div>
          <div><dt>Session</dt><dd class="text-break">{{ status.session_id || '—' }}</dd></div>
          <div v-if="!attached"><dt>Application</dt><dd>{{ status.app || '—' }}</dd></div>
          <div><dt>Last action / verification</dt><dd>{{ status.last_action || '—' }} / {{ status.last_verification || 'unavailable' }}</dd></div>
        </dl>
      </section>

      <section class="hm-card" aria-labelledby="computer-evidence-title">
        <div class="section-card-header">
          <div>
            <h2 id="computer-evidence-title" class="text-sm font-semibold text-gray-300">Visual evidence</h2>
            <p class="page-lede">Frames are captured only on request. Opening or refreshing this view never captures or posts an image.</p>
          </div>
          <div class="action-row">
            <button class="btn btn-ghost btn-touch" @click="refresh" :disabled="loading"><odin-icon name="refresh" :size="15" /> Refresh status</button>
            <button class="btn btn-primary btn-touch" @click="observe" :disabled="observing || !status.available"><odin-icon name="eye" :size="15" /> {{ observing ? 'Observing…' : 'Observe / view frame' }}</button>
            <button v-if="frameUrl" class="btn btn-ghost btn-touch" @click="clearFrame">Hide frame</button>
          </div>
        </div>
        <figure v-if="frameUrl" class="evidence-figure">
          <figcaption class="text-xs text-gray-500 mb-3">{{ freshness }} · Captured {{ frame.captured_at }} · Private evidence expires {{ frame.expires_at }}</figcaption>
          <img class="evidence-frame" :src="frameUrl" alt="Requested frame from the authorized application; read-only" />
        </figure>
        <p v-else-if="frameExpired" class="text-sm text-amber-400" role="status">Frame expired. Observe again for current evidence.</p>
      </section>

      <section class="hm-card" aria-labelledby="computer-export-title">
        <form @submit.prevent="exportFile">
          <div class="section-card-header">
            <div>
              <h2 id="computer-export-title" class="text-sm font-semibold text-gray-300">Export a saved workspace file</h2>
              <p class="page-lede">Choose one exact filename, not a host path. Downloads are never executed.</p>
            </div>
          </div>
          <label class="field-label" for="computer-export-name">Filename</label>
          <div class="export-controls mt-2">
            <input id="computer-export-name" class="hm-input export-name" v-model="name" maxlength="100" required autocomplete="off" placeholder="drawing.png" />
            <button class="btn btn-primary btn-touch" type="submit" :disabled="exporting || !status.available">{{ exporting ? 'Preparing…' : 'Prepare export' }}</button>
          </div>
        </form>
        <div v-if="artifact" class="artifact-row mt-4">
          <button class="btn btn-ghost btn-touch" @click="download" :disabled="downloading"><odin-icon name="download" :size="15" /> Download {{ artifact.name }}</button>
          <span class="text-xs text-gray-500">Expires {{ artifact.expires_at }}</span>
        </div>
      </section>
      </div>
    </div>`,setup(){const e=h({state:"unknown",available:!1}),t=h(!1),s=h(!1),n=h(!1),a=h(!1),i=h(!1),l=h(!1),o=h(""),r=h(!1),c=h(!1),d=h(!1),u=h(""),p=h(null),f=h(""),m=h(!1),v=h(Date.now()),w=h(""),N=h(null);let x=0,b=null,y=!1,E=z.token,S=0;const L=g=>g===!0?"Enabled":g===!1?"Disabled":"Unknown",R=q(()=>{var g;return((g=e.value.backend)==null?void 0:g.environment)==="existing_session"}),_=q(()=>{var I;const g=Date.parse(((I=e.value.accessibility)==null?void 0:I.checked_at)||"");return Number.isFinite(g)&&v.value-g<15e3&&v.value>=g-5e3}),D=q(()=>{var g;return _.value?L((g=e.value.accessibility)==null?void 0:g.enabled):"Unknown / not current"}),U=q(()=>{var g;return _.value?((g=e.value.accessibility)==null?void 0:g.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),T=q(()=>Object.entries(e.value.input_limits||{}).filter(([,g])=>typeof g=="number"&&Number.isFinite(g)).map(([g,I])=>`${g}: ${I}`).join(", ")),M=q(()=>{var I;const g=(I=e.value.application_provenance)==null?void 0:I.script_identity;return typeof g=="string"?g:!g||typeof g!="object"?"Not observed":`${g.interpreter_basename||"Unknown interpreter"}; argv digest ${g.argv_digest||"not recorded"}; ${g.verified===!0?"verified":"not verified"}`}),j=q(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(g=>g&&typeof g.id=="string"&&typeof g.label=="string"&&["supported","capture_only"].includes(g.input)).slice(0,16):[]),J=q(()=>{const g=e.value.restart_required;return Array.isArray(g)?g.length?g.join(", "):"None reported":g===!0?"Pending; restart required":g===!1?"None reported":"Unknown"}),A=q(()=>{var I,F;const g=Date.parse(((I=p.value)==null?void 0:I.captured_at)||"");return Number.isFinite(g)&&v.value<g+Math.min(1e4,((F=p.value)==null?void 0:F.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function k(){f.value&&URL.revokeObjectURL(f.value),f.value="",p.value=null}function C(){x++,k(),N.value=null,u.value="",s.value=!1,i.value=!1,l.value=!1}function $(g,I){return y&&g===x&&I===z.token}function W(g){var F,ee;C(),c.value=!1;const I=g.status||(g.name==="AuthError"?401:0);e.value={available:!1,state:I===503?"unavailable":"unknown"},o.value=I===401||I===403||I===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":I===410?"Evidence or artifact expired. Observe or prepare the export again.":I===503?"Computer use is disabled or unavailable.":"Request failed; outcome unknown. Refresh status. No action was replayed.",![401,403,404].includes(I)&&typeof((F=g.data)==null?void 0:F.code)=="string"&&/^[a-z_]{1,64}$/.test(g.data.code)&&typeof((ee=g.data)==null?void 0:ee.error)=="string"&&(o.value=g.data.error.slice(0,512))}async function G(){if(t.value||r.value||n.value||a.value||d.value||!y)return;const g=x,I=z.token;t.value=!0,S=Date.now();try{const F=await z.get("/api/computer");if(!$(g,I))return;Z(F)}catch(F){$(g,I)&&W(F)}finally{t.value=!1}}function Z(g){(e.value.session_id&&e.value.session_id!==g.session_id||e.value.generation!=null&&e.value.generation!==g.generation||e.value.session_generation!=null&&e.value.session_generation!==g.session_generation)&&C(),e.value=g,c.value=!0,o.value=""}async function oe(g){if(!y||!c.value||r.value||n.value||a.value)return;C();const I=x,F=z.token;r.value=!0;try{if(await z.post("/api/computer/enabled",{enabled:g}),!$(I,F))return;const ee=await z.get("/api/computer");$(I,F)&&Z(ee)}catch(ee){$(I,F)&&W(ee)}finally{r.value=!1}}async function se(g){C();const I=x,F=z.token,ee=g==="stop"?n:a;ee.value=!0;try{const X=await z.post("/api/computer/"+g,{});if($(I,F)){e.value={...e.value,...X};const ae=await z.get("/api/computer");$(I,F)&&Z(ae)}}catch(X){$(I,F)&&W(X)}finally{ee.value=!1}}async function ce(){return Y(!1)}async function Ne(){return Y(!0)}async function Y(g){if(!y||!c.value||d.value||e.value.state!=="quarantined")return;const I={session_id:e.value.session_id,generation:e.value.session_generation};if(!I.session_id||!Number.isInteger(I.generation))return;if(g){if(u.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+I.session_id)return;I.acknowledgment=u.value}C();const F=x,ee=z.token;d.value=!0;try{const X=await z.post(g?"/api/computer/reconcile":"/api/computer/recover",I);$(F,ee)&&Z(X)}catch(X){$(F,ee)&&W(X)}finally{d.value=!1}}async function ge(){var F;k(),m.value=!1;const g=x,I=z.token;s.value=!0;try{const ee=await z.post("/api/computer/observe",{});if(!$(g,I))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((F=ee.frame)==null?void 0:F.evidence_id)||""))throw new Error("Invalid evidence");const X=await z.getBlob("/api/computer/evidence/"+ee.frame.evidence_id);if(!$(g,I))return;if(!["image/png","image/jpeg"].includes(X.type)||X.size>2097152||!Number.isFinite(Date.parse(ee.frame.expires_at))||Date.parse(ee.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");p.value=ee.frame,f.value=URL.createObjectURL(X),o.value=""}catch(ee){$(g,I)&&W(ee)}finally{g===x&&(s.value=!1)}}async function V(){N.value=null;const g=x,I=z.token;i.value=!0;try{const F=await z.post("/api/computer/export",{name:w.value});$(g,I)&&(N.value=F,o.value="")}catch(F){$(g,I)&&W(F)}finally{g===x&&(i.value=!1)}}async function re(){const g=x,I=z.token,F=N.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((F==null?void 0:F.artifact_id)||""))throw new Error("Invalid export");const ee=await z.getBlob("/api/computer/download/"+F.artifact_id);if(!$(g,I))return;const X=URL.createObjectURL(ee),ae=document.createElement("a");ae.href=X,ae.download=F.name,ae.click(),setTimeout(()=>URL.revokeObjectURL(X),1e3)}catch(ee){$(g,I)&&W(ee)}finally{g===x&&(l.value=!1)}}function ue(){y||(y=!0,G(),b=setInterval(()=>{v.value=Date.now(),E!==z.token&&(E=z.token,C(),c.value=!1,e.value={state:"unknown",available:!1}),p.value&&Date.parse(p.value.expires_at)<=v.value&&(k(),m.value=!0),N.value&&Date.parse(N.value.expires_at)<=v.value&&(N.value=null),v.value-S>=5e3&&G()},500))}function Ie(){y=!1,clearInterval(b),b=null,C(),c.value=!1}return je(ue),Qt(ue),Gt(Ie),ft(Ie),{status:e,loading:t,observing:s,stopping:n,pausing:a,exporting:i,downloading:l,error:o,frame:p,frameUrl:f,frameExpired:m,freshness:A,name:w,artifact:N,refresh:G,control:se,observe:ge,clearFrame:k,exportFile:V,download:re,toggling:r,adminReady:c,enabledLabel:L,restartSettings:J,setEnabled:oe,recovering:d,recover:ce,reconcile:Ne,reconciliationAck:u,applicationProfiles:j,attached:R,scriptIdentity:M,inputLimits:T,accessibilityLabel:D,accessibilityDetail:U}}},dv=[{id:"health",label:"Health",component:Pk},{id:"resources",label:"Resources",component:Mk},{id:"logs",label:"Logs",component:Wk},{id:"config",label:"Config",component:lS},{id:"discord",label:"Discord",component:rS},{id:"hosts",label:"Hosts",component:uS},{id:"host-access",label:"Host Access",component:dS},{id:"api-tokens",label:"API Tokens",component:pS},{id:"llm",label:"LLM Config",component:_S},{id:"internals",label:"Internals",component:kS},{id:"turn-state",label:"Turn State",component:CS},{id:"computer",label:"Computer",component:IS},{id:"update",label:"Update",component:ES}],OS={components:{TabbedPage:Qo},setup(){return{tabs:dv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},$l=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),LS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...$l("Operations","operations","/operations",ev),...$l("History","history","/history",tv),...$l("Capabilities","capabilities","/capabilities",sv),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...$l("System","system","/system",dv)],bs=ta({open:!1,query:"",selected:0});function yp(){bs.query="",bs.selected=0,bs.open=!0}function Cr(){bs.open=!1}function NS(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const DS={setup(){const e=Gm(),t=h(null),s=q(()=>{const i=bs.query.trim().toLowerCase();return LS.map(l=>({...l,_score:NS(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Mt(()=>bs.open,async i=>{var l;i&&(await Rt(),(l=t.value)==null||l.focus())}),Mt(()=>bs.query,()=>{bs.selected=0});function n(i){Cr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Cr();return}if(i.key==="ArrowDown")i.preventDefault(),bs.selected=Math.min(bs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),bs.selected=Math.max(bs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[bs.selected];l&&n(l)}}return{state:bs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Cr}},template:`
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
  `},fc={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(fc));const PS={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>si("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[si("path",{d:fc[e.name]||fc.info})])}},MS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function xp(e){return[...e.querySelectorAll(MS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const FS={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=xp(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||xp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},$S={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),o=h(!1),r=h([]),c=h(0),d=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const f=q(()=>{const W=e.value.uptime_seconds||0,G=Math.floor(W/86400),Z=Math.floor(W%86400/3600),oe=Math.floor(W%3600/60),se=[];return G>0&&se.push(`${G}d`),Z>0&&se.push(`${Z}h`),(se.length===0||G===0&&Z===0)&&se.push(`${oe}m`),se.join(" ")}),m=q(()=>{const W=e.value.uptime_seconds||0;return 125.66*(1-Math.min(W/86400,1))}),v=q(()=>{const W=e.value;return[{label:"Guilds",value:W.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:W.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:W.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${W.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:W.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:W.loop_count>0?"text-green-400":"",highlight:W.loop_count>0},{label:"Agents",value:W.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:W.agent_count>0?`${W.agent_count} total`:"",subColor:"text-gray-500",highlight:(W.agent_running??0)>0},{label:"Processes",value:W.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:W.process_count>0?`${W.process_count} total`:"",subColor:"text-gray-500",highlight:(W.process_running??0)>0},{label:"Schedules",value:W.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(W.schedule_failing>0?`${W.schedule_failing} failing`:"")+(W.schedule_failing>0&&W.schedule_paused>0?", ":"")+(W.schedule_paused>0?`${W.schedule_paused} paused`:"")||void 0,subColor:W.schedule_failing>0?"text-red-400":"text-yellow-400",color:W.schedule_failing>0?"text-red-400":"",highlight:W.schedule_failing>0},{label:"Users",value:W.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),w=q(()=>{const W=e.value,G=[];return G.push({label:"Bot",status:W.status==="online"?"ok":"warn",detail:W.status==="online"?"Online":"Starting"}),(W.schedule_failing||0)>0?G.push({label:"Schedules",status:"error",detail:`${W.schedule_failing} failing`}):(W.schedule_count||0)>0&&G.push({label:"Schedules",status:"ok",detail:`${W.schedule_count} configured`}),(W.loop_count||0)>0&&G.push({label:"Loops",status:"ok",detail:`${W.loop_count} active`}),(W.agent_running||0)>0&&G.push({label:"Agents",status:"ok",detail:`${W.agent_running} running`}),(W.process_running||0)>0&&G.push({label:"Processes",status:"ok",detail:`${W.process_running} running`}),G});async function N(){try{e.value=await z.get("/api/status"),s.value=null}catch(W){s.value=W.message}finally{t.value=!1}}let x=0,b=0,y=0,E=0;function S(W,G){const Z=new Set;return[...G,...W].filter(oe=>{const se=oe._hmac||JSON.stringify([oe.timestamp,oe.tool_name,oe.user_id,oe.result_summary,oe.error]);return Z.has(se)?!1:(Z.add(se),!0)})}async function L(){const W=++x,G=y;a.value=!0;try{const Z=await z.get("/api/audit?limit=10");if(W!==x)return;const oe=G===y?[]:n.value.filter(se=>(se._liveEpoch||0)>G);n.value=S(Z,oe).slice(0,10),c.value=oe.length}catch{}W===x&&(a.value=!1)}async function R(){const W=++b,G=E;l.value=!0;try{const Z=await z.get("/api/audit?error_only=1&limit=5");if(W!==b)return;const oe=G===E?[]:i.value.filter(se=>(se._liveErrorEpoch||0)>G);i.value=S(Z,oe).slice(0,5),o.value=!1}catch{if(W!==b)return;o.value=G===E||i.value.length===0}W===b&&(l.value=!1)}async function _(){try{const W=await z.get("/api/knowledge");d.value=(Array.isArray(W)?W:[]).reduce((G,Z)=>G+(Z.chunks||0),0)}catch{d.value=null}}async function D(){try{const W=await z.get("/api/agents");r.value=W.filter(G=>G.status==="running")}catch{}}async function U(){u.value={...u.value,reload:!0};try{await z.post("/api/reload"),ye.success("Config reloaded")}catch(W){ye.error(W.message)}u.value={...u.value,reload:!1}}async function T(){if(!await qt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const G=e.value.session_count;e.value={...e.value,session_count:0};try{const Z=await z.post("/api/sessions/clear-all");ye.success(`Cleared ${Z.count} session${Z.count!==1?"s":""}`),await N()}catch(Z){e.value={...e.value,session_count:G},ye.error(Z.message)}u.value={...u.value,clearSessions:!1}}async function M(){if(!await qt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const G=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Z=await z.post("/api/loops/stop-all");ye.success(Z.result),await N()}catch(Z){e.value={...e.value,loop_count:G},ye.error(Z.message)}u.value={...u.value,stopLoops:!1}}function j(){t.value=!0,s.value=null,N(),L(),R(),D()}let J=null,A=null,k=null;function C(W){if(W.payload&&W.payload.tool_name){y+=1;const G={...W.payload,_isNew:!0,_key:++p,_liveEpoch:y};n.value.unshift(G),n.value.length>10&&n.value.pop(),c.value++,G.error&&(E+=1,G._liveErrorEpoch=E,o.value=!1,i.value.unshift(G),i.value.length>5&&i.value.pop()),setTimeout(()=>{G._isNew=!1},1500),clearTimeout(k),k=setTimeout(()=>{c.value=0},1e4)}}let $=null;return je(async()=>{await Promise.all([N(),L(),R(),D(),_()]),J=setInterval(N,15e3),A=setInterval(D,1e4),Ye.subscribe("events",C),$=Ye.onReconnected(()=>{L(),R()})}),ft(()=>{J&&clearInterval(J),A&&clearInterval(A),clearTimeout(k),Ye.unsubscribe("events",C),$&&($(),$=null)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:m,stats:v,healthIndicators:w,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:L,fetchErrors:R,fetchStatus:N,onEvent:C,formatTime:zw,formatDuration:ui,retry:j,reloadConfig:U,clearSessions:T,stopAllLoops:M}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function _p(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function US(e){if(Array.isArray(e))return e}function BS(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(n=i.call(s)).done)&&(o.push(n.value),o.length!==t);r=!0);}catch(d){c=!0,a=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return o}}function HS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function zS(e,t){return US(e)||BS(e,t)||jS(e,t)||HS()}function jS(e,t){if(e){if(typeof e=="string")return _p(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?_p(e,t):void 0}}const uv=Object.entries,wp=Object.setPrototypeOf,VS=Object.isFrozen,qS=Object.getPrototypeOf,GS=Object.getOwnPropertyDescriptor;let ms=Object.freeze,zs=Object.seal,Ha=Object.create,pv=typeof Reflect<"u"&&Reflect,hc=pv.apply,mc=pv.construct;ms||(ms=function(t){return t});zs||(zs=function(t){return t});hc||(hc=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});mc||(mc=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const vn=Ft(Array.prototype.forEach),KS=Ft(Array.prototype.lastIndexOf),kp=Ft(Array.prototype.pop),Ma=Ft(Array.prototype.push),WS=Ft(Array.prototype.splice),ds=Array.isArray,Oi=Ft(String.prototype.toLowerCase),Er=Ft(String.prototype.toString),Sp=Ft(String.prototype.match),Fa=Ft(String.prototype.replace),Tp=Ft(String.prototype.indexOf),JS=Ft(String.prototype.trim),ZS=Ft(Number.prototype.toString),YS=Ft(Boolean.prototype.toString),Cp=typeof BigInt>"u"?null:Ft(BigInt.prototype.toString),Ep=typeof Symbol>"u"?null:Ft(Symbol.prototype.toString),St=Ft(Object.prototype.hasOwnProperty),Si=Ft(Object.prototype.toString),Kt=Ft(RegExp.prototype.test),ra=QS(TypeError);function Ft(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return hc(e,t,n)}}function QS(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return mc(e,s)}}function ze(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Oi;if(wp&&wp(e,null),!ds(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(VS(t)||(t[n]=i),a=i)}e[a]=!0}return e}function XS(e){for(let t=0;t<e.length;t++)St(e,t)||(e[t]=null);return e}function ss(e){const t=Ha(null);for(const n of uv(e)){var s=zS(n,2);const a=s[0],i=s[1];St(e,a)&&(ds(i)?t[a]=XS(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=ss(i):t[a]=i)}return t}function e1(e){switch(typeof e){case"string":return e;case"number":return ZS(e);case"boolean":return YS(e);case"bigint":return Cp?Cp(e):"0";case"symbol":return Ep?Ep(e):"Symbol()";case"undefined":return Si(e);case"function":case"object":{if(e===null)return Si(e);const t=e,s=en(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Si(n)}return Si(e)}default:return Si(e)}}function en(e,t){for(;e!==null;){const n=GS(e,t);if(n){if(n.get)return Ft(n.get);if(typeof n.value=="function")return Ft(n.value)}e=qS(e)}function s(){return null}return s}function t1(e){try{return Kt(e,""),!0}catch{return!1}}const Ap=ms(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Ar=ms(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Rr=ms(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),s1=ms(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Ir=ms(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),n1=ms(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Rp=ms(["#text"]),Ip=ms(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Or=ms(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Op=ms(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Ul=ms(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),a1=zs(/{{[\w\W]*|^[\w\W]*}}/g),i1=zs(/<%[\w\W]*|^[\w\W]*%>/g),l1=zs(/\${[\w\W]*/g),o1=zs(/^data-[\-\w.\u00B7-\uFFFF]+$/),r1=zs(/^aria-[\-\w]+$/),Lp=zs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),c1=zs(/^(?:\w+script|data):/i),d1=zs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),u1=zs(/^html$/i),p1=zs(/^[a-z][.\w]*(-[.\w]+)+$/i),Qs={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},f1=function(){return typeof window>"u"?null:window},h1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Np=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function fv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:f1();const t=Te=>fv(Te);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Qs.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,f=en(p,"cloneNode"),m=en(p,"remove"),v=en(p,"nextSibling"),w=en(p,"childNodes"),N=en(p,"parentNode"),x=en(p,"shadowRoot"),b=en(p,"attributes"),y=l&&l.prototype?en(l.prototype,"nodeType"):null,E=l&&l.prototype?en(l.prototype,"nodeName"):null;if(typeof i=="function"){const Te=s.createElement("template");Te.content&&Te.content.ownerDocument&&(s=Te.content.ownerDocument)}let S,L="",R,_=!1,D=0;const U=function(){if(D>0)throw ra('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},T=function(P){U(),D++;try{return S.createHTML(P)}finally{D--}},M=function(P){U(),D++;try{return S.createScriptURL(P)}finally{D--}},j=function(){return _||(R=h1(u,a),_=!0),R},J=s,A=J.implementation,k=J.createNodeIterator,C=J.createDocumentFragment,$=J.getElementsByTagName,W=n.importNode;let G=Np();t.isSupported=typeof uv=="function"&&typeof N=="function"&&A&&A.createHTMLDocument!==void 0;const Z=a1,oe=i1,se=l1,ce=o1,Ne=r1,Y=c1,ge=d1,V=p1;let re=Lp,ue=null;const Ie=ze({},[...Ap,...Ar,...Rr,...Ir,...Rp]);let g=null;const I=ze({},[...Ip,...Or,...Op,...Ul]);let F=Object.seal(Ha(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ee=null,X=null;const ae=Object.seal(Ha(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let fe=!0,pe=!0,de=!1,le=!0,xe=!1,me=!0,_e=!1,Re=!1,B=!1,ve=!1,ke=!1,Oe=!1,Me=!0,dt=!1;const st="user-content-";let _t=!0,Ot=!1,rt={},Qe=null;const ie=ze({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Se=null;const Le=ze({},["audio","video","img","source","image","track"]);let Ke=null;const Et=ze({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ve="http://www.w3.org/1998/Math/MathML",$t="http://www.w3.org/2000/svg",zt="http://www.w3.org/1999/xhtml";let rs=zt,Js=!1,ks=null;const na=ze({},[Ve,$t,zt],Er);let Zs=ze({},["mi","mo","mn","ms","mtext"]),Ns=ze({},["annotation-xml"]);const Mn=ze({},["title","style","font","a","script"]);let Ss=null;const Fn=["application/xhtml+xml","text/html"],Lt="text/html";let Xe=null,Ts=null;const Ds=s.createElement("form"),te=function(P){return P instanceof RegExp||P instanceof Function},we=function(){let P=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ts&&Ts===P)return;(!P||typeof P!="object")&&(P={}),P=ss(P),Ss=Fn.indexOf(P.PARSER_MEDIA_TYPE)===-1?Lt:P.PARSER_MEDIA_TYPE,Xe=Ss==="application/xhtml+xml"?Er:Oi,ue=St(P,"ALLOWED_TAGS")&&ds(P.ALLOWED_TAGS)?ze({},P.ALLOWED_TAGS,Xe):Ie,g=St(P,"ALLOWED_ATTR")&&ds(P.ALLOWED_ATTR)?ze({},P.ALLOWED_ATTR,Xe):I,ks=St(P,"ALLOWED_NAMESPACES")&&ds(P.ALLOWED_NAMESPACES)?ze({},P.ALLOWED_NAMESPACES,Er):na,Ke=St(P,"ADD_URI_SAFE_ATTR")&&ds(P.ADD_URI_SAFE_ATTR)?ze(ss(Et),P.ADD_URI_SAFE_ATTR,Xe):Et,Se=St(P,"ADD_DATA_URI_TAGS")&&ds(P.ADD_DATA_URI_TAGS)?ze(ss(Le),P.ADD_DATA_URI_TAGS,Xe):Le,Qe=St(P,"FORBID_CONTENTS")&&ds(P.FORBID_CONTENTS)?ze({},P.FORBID_CONTENTS,Xe):ie,ee=St(P,"FORBID_TAGS")&&ds(P.FORBID_TAGS)?ze({},P.FORBID_TAGS,Xe):ss({}),X=St(P,"FORBID_ATTR")&&ds(P.FORBID_ATTR)?ze({},P.FORBID_ATTR,Xe):ss({}),rt=St(P,"USE_PROFILES")?P.USE_PROFILES&&typeof P.USE_PROFILES=="object"?ss(P.USE_PROFILES):P.USE_PROFILES:!1,fe=P.ALLOW_ARIA_ATTR!==!1,pe=P.ALLOW_DATA_ATTR!==!1,de=P.ALLOW_UNKNOWN_PROTOCOLS||!1,le=P.ALLOW_SELF_CLOSE_IN_ATTR!==!1,xe=P.SAFE_FOR_TEMPLATES||!1,me=P.SAFE_FOR_XML!==!1,_e=P.WHOLE_DOCUMENT||!1,ve=P.RETURN_DOM||!1,ke=P.RETURN_DOM_FRAGMENT||!1,Oe=P.RETURN_TRUSTED_TYPE||!1,B=P.FORCE_BODY||!1,Me=P.SANITIZE_DOM!==!1,dt=P.SANITIZE_NAMED_PROPS||!1,_t=P.KEEP_CONTENT!==!1,Ot=P.IN_PLACE||!1,re=t1(P.ALLOWED_URI_REGEXP)?P.ALLOWED_URI_REGEXP:Lp,rs=typeof P.NAMESPACE=="string"?P.NAMESPACE:zt,Zs=St(P,"MATHML_TEXT_INTEGRATION_POINTS")&&P.MATHML_TEXT_INTEGRATION_POINTS&&typeof P.MATHML_TEXT_INTEGRATION_POINTS=="object"?ss(P.MATHML_TEXT_INTEGRATION_POINTS):ze({},["mi","mo","mn","ms","mtext"]),Ns=St(P,"HTML_INTEGRATION_POINTS")&&P.HTML_INTEGRATION_POINTS&&typeof P.HTML_INTEGRATION_POINTS=="object"?ss(P.HTML_INTEGRATION_POINTS):ze({},["annotation-xml"]);const ne=St(P,"CUSTOM_ELEMENT_HANDLING")&&P.CUSTOM_ELEMENT_HANDLING&&typeof P.CUSTOM_ELEMENT_HANDLING=="object"?ss(P.CUSTOM_ELEMENT_HANDLING):Ha(null);if(F=Ha(null),St(ne,"tagNameCheck")&&te(ne.tagNameCheck)&&(F.tagNameCheck=ne.tagNameCheck),St(ne,"attributeNameCheck")&&te(ne.attributeNameCheck)&&(F.attributeNameCheck=ne.attributeNameCheck),St(ne,"allowCustomizedBuiltInElements")&&typeof ne.allowCustomizedBuiltInElements=="boolean"&&(F.allowCustomizedBuiltInElements=ne.allowCustomizedBuiltInElements),xe&&(pe=!1),ke&&(ve=!0),rt&&(ue=ze({},Rp),g=Ha(null),rt.html===!0&&(ze(ue,Ap),ze(g,Ip)),rt.svg===!0&&(ze(ue,Ar),ze(g,Or),ze(g,Ul)),rt.svgFilters===!0&&(ze(ue,Rr),ze(g,Or),ze(g,Ul)),rt.mathMl===!0&&(ze(ue,Ir),ze(g,Op),ze(g,Ul))),ae.tagCheck=null,ae.attributeCheck=null,St(P,"ADD_TAGS")&&(typeof P.ADD_TAGS=="function"?ae.tagCheck=P.ADD_TAGS:ds(P.ADD_TAGS)&&(ue===Ie&&(ue=ss(ue)),ze(ue,P.ADD_TAGS,Xe))),St(P,"ADD_ATTR")&&(typeof P.ADD_ATTR=="function"?ae.attributeCheck=P.ADD_ATTR:ds(P.ADD_ATTR)&&(g===I&&(g=ss(g)),ze(g,P.ADD_ATTR,Xe))),St(P,"ADD_URI_SAFE_ATTR")&&ds(P.ADD_URI_SAFE_ATTR)&&ze(Ke,P.ADD_URI_SAFE_ATTR,Xe),St(P,"FORBID_CONTENTS")&&ds(P.FORBID_CONTENTS)&&(Qe===ie&&(Qe=ss(Qe)),ze(Qe,P.FORBID_CONTENTS,Xe)),St(P,"ADD_FORBID_CONTENTS")&&ds(P.ADD_FORBID_CONTENTS)&&(Qe===ie&&(Qe=ss(Qe)),ze(Qe,P.ADD_FORBID_CONTENTS,Xe)),_t&&(ue["#text"]=!0),_e&&ze(ue,["html","head","body"]),ue.table&&(ze(ue,["tbody"]),delete ee.tbody),P.TRUSTED_TYPES_POLICY){if(typeof P.TRUSTED_TYPES_POLICY.createHTML!="function")throw ra('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof P.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw ra('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const he=S;S=P.TRUSTED_TYPES_POLICY;try{L=T("")}catch(De){throw S=he,De}}else P.TRUSTED_TYPES_POLICY===null?(S=void 0,L=""):(S===void 0&&(S=j()),S&&typeof L=="string"&&(L=T("")));(G.uponSanitizeElement.length>0||G.uponSanitizeAttribute.length>0)&&ue===Ie&&(ue=ss(ue)),G.uponSanitizeAttribute.length>0&&g===I&&(g=ss(g)),ms&&ms(P),Ts=P},$e=ze({},[...Ar,...Rr,...s1]),Je=ze({},[...Ir,...n1]),wt=function(P){let ne=N(P);(!ne||!ne.tagName)&&(ne={namespaceURI:rs,tagName:"template"});const he=Oi(P.tagName),De=Oi(ne.tagName);return ks[P.namespaceURI]?P.namespaceURI===$t?ne.namespaceURI===zt?he==="svg":ne.namespaceURI===Ve?he==="svg"&&(De==="annotation-xml"||Zs[De]):!!$e[he]:P.namespaceURI===Ve?ne.namespaceURI===zt?he==="math":ne.namespaceURI===$t?he==="math"&&Ns[De]:!!Je[he]:P.namespaceURI===zt?ne.namespaceURI===$t&&!Ns[De]||ne.namespaceURI===Ve&&!Zs[De]?!1:!Je[he]&&(Mn[he]||!$e[he]):!!(Ss==="application/xhtml+xml"&&ks[P.namespaceURI]):!1},ut=function(P){Ma(t.removed,{element:P});try{N(P).removeChild(P)}catch{if(m(P),!N(P))throw ra("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},$n=function(P){const ne=w?w(P):P.childNodes;if(ne){const De=[];vn(ne,Fe=>{Ma(De,Fe)}),vn(De,Fe=>{try{m(Fe)}catch{}})}const he=b?b(P):null;if(he)for(let De=he.length-1;De>=0;--De){const Fe=he[De],Be=Fe&&Fe.name;if(typeof Be=="string")try{P.removeAttribute(Be)}catch{}}},js=function(P,ne){try{Ma(t.removed,{attribute:ne.getAttributeNode(P),from:ne})}catch{Ma(t.removed,{attribute:null,from:ne})}if(ne.removeAttribute(P),P==="is")if(ve||ke)try{ut(ne)}catch{}else try{ne.setAttribute(P,"")}catch{}},mi=function(P){const ne=b?b(P):P.attributes;if(ne)for(let he=ne.length-1;he>=0;--he){const De=ne[he],Fe=De&&De.name;if(!(typeof Fe!="string"||g[Xe(Fe)]))try{P.removeAttribute(Fe)}catch{}}},vi=function(P){const ne=[P];for(;ne.length>0;){const he=ne.pop();(y?y(he):he.nodeType)===Qs.element&&mi(he);const Fe=w?w(he):he.childNodes;if(Fe)for(let Be=Fe.length-1;Be>=0;--Be)ne.push(Fe[Be])}},Ia=function(P){let ne=null,he=null;if(B)P="<remove></remove>"+P;else{const Be=Sp(P,/^[\r\n\t ]+/);he=Be&&Be[0]}Ss==="application/xhtml+xml"&&rs===zt&&(P='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+P+"</body></html>");const De=S?T(P):P;if(rs===zt)try{ne=new d().parseFromString(De,Ss)}catch{}if(!ne||!ne.documentElement){ne=A.createDocument(rs,"template",null);try{ne.documentElement.innerHTML=Js?L:De}catch{}}const Fe=ne.body||ne.documentElement;return P&&he&&Fe.insertBefore(s.createTextNode(he),Fe.childNodes[0]||null),rs===zt?$.call(ne,_e?"html":"body")[0]:_e?ne.documentElement:Fe},aa=function(P){return k.call(P.ownerDocument||P,P,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},Un=function(P){var ne,he;P.normalize();const De=k.call(P.ownerDocument||P,P,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let Fe=De.nextNode();for(;Fe;){let yt=Fe.data;vn([Z,oe,se],it=>{yt=Fa(yt,it," ")}),Fe.data=yt,Fe=De.nextNode()}const Be=(ne=(he=P.querySelectorAll)===null||he===void 0?void 0:he.call(P,"template"))!==null&&ne!==void 0?ne:[];vn(Array.from(Be),yt=>{Ys(yt.content)&&Un(yt.content)})},Bn=function(P){const ne=E?E(P):null;return typeof ne!="string"||Xe(ne)!=="form"?!1:typeof P.nodeName!="string"||typeof P.textContent!="string"||typeof P.removeChild!="function"||P.attributes!==b(P)||typeof P.removeAttribute!="function"||typeof P.setAttribute!="function"||typeof P.namespaceURI!="string"||typeof P.insertBefore!="function"||typeof P.hasChildNodes!="function"||P.nodeType!==y(P)||P.childNodes!==w(P)},Ys=function(P){if(!y||typeof P!="object"||P===null)return!1;try{return y(P)===Qs.documentFragment}catch{return!1}},dn=function(P){if(!y||typeof P!="object"||P===null)return!1;try{return typeof y(P)=="number"}catch{return!1}};function Xt(Te,P,ne){vn(Te,he=>{he.call(t,P,ne,Ts)})}const Oa=function(P){let ne=null;if(Xt(G.beforeSanitizeElements,P,null),Bn(P))return ut(P),!0;const he=Xe(E?E(P):P.nodeName);if(Xt(G.uponSanitizeElement,P,{tagName:he,allowedTags:ue}),me&&P.hasChildNodes()&&!dn(P.firstElementChild)&&Kt(/<[/\w!]/g,P.innerHTML)&&Kt(/<[/\w!]/g,P.textContent)||me&&P.namespaceURI===zt&&he==="style"&&dn(P.firstElementChild)||P.nodeType===Qs.progressingInstruction||me&&P.nodeType===Qs.comment&&Kt(/<[/\w]/g,P.data))return ut(P),!0;if(ee[he]||!(ae.tagCheck instanceof Function&&ae.tagCheck(he))&&!ue[he]){if(!ee[he]&&Ae(he)&&(F.tagNameCheck instanceof RegExp&&Kt(F.tagNameCheck,he)||F.tagNameCheck instanceof Function&&F.tagNameCheck(he)))return!1;if(_t&&!Qe[he]){const Fe=N(P),Be=w(P);if(Be&&Fe){const yt=Be.length;for(let it=yt-1;it>=0;--it){const vt=Ot?Be[it]:f(Be[it],!0);Fe.insertBefore(vt,v(P))}}}return ut(P),!0}return(y?y(P):P.nodeType)===Qs.element&&!wt(P)||(he==="noscript"||he==="noembed"||he==="noframes")&&Kt(/<\/no(script|embed|frames)/i,P.innerHTML)?(ut(P),!0):(xe&&P.nodeType===Qs.text&&(ne=P.textContent,vn([Z,oe,se],Fe=>{ne=Fa(ne,Fe," ")}),P.textContent!==ne&&(Ma(t.removed,{element:P.cloneNode()}),P.textContent=ne)),Xt(G.afterSanitizeElements,P,null),!1)},K=function(P,ne,he){if(X[ne]||Me&&(ne==="id"||ne==="name")&&(he in s||he in Ds))return!1;const De=g[ne]||ae.attributeCheck instanceof Function&&ae.attributeCheck(ne,P);if(!(pe&&!X[ne]&&Kt(ce,ne))){if(!(fe&&Kt(Ne,ne))){if(!De||X[ne]){if(!(Ae(P)&&(F.tagNameCheck instanceof RegExp&&Kt(F.tagNameCheck,P)||F.tagNameCheck instanceof Function&&F.tagNameCheck(P))&&(F.attributeNameCheck instanceof RegExp&&Kt(F.attributeNameCheck,ne)||F.attributeNameCheck instanceof Function&&F.attributeNameCheck(ne,P))||ne==="is"&&F.allowCustomizedBuiltInElements&&(F.tagNameCheck instanceof RegExp&&Kt(F.tagNameCheck,he)||F.tagNameCheck instanceof Function&&F.tagNameCheck(he))))return!1}else if(!Ke[ne]){if(!Kt(re,Fa(he,ge,""))){if(!((ne==="src"||ne==="xlink:href"||ne==="href")&&P!=="script"&&Tp(he,"data:")===0&&Se[P])){if(!(de&&!Kt(Y,Fa(he,ge,"")))){if(he)return!1}}}}}}return!0},be=ze({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ae=function(P){return!be[Oi(P)]&&Kt(V,P)},es=function(P){Xt(G.beforeSanitizeAttributes,P,null);const ne=P.attributes;if(!ne||Bn(P))return;const he={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:g,forceKeepAttr:void 0};let De=ne.length;for(;De--;){const Fe=ne[De],Be=Fe.name,yt=Fe.namespaceURI,it=Fe.value,vt=Xe(Be),O=it;let H=Be==="value"?O:JS(O);if(he.attrName=vt,he.attrValue=H,he.keepAttr=!0,he.forceKeepAttr=void 0,Xt(G.uponSanitizeAttribute,P,he),H=he.attrValue,dt&&(vt==="id"||vt==="name")&&Tp(H,st)!==0&&(js(Be,P),H=st+H),me&&Kt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,H)){js(Be,P);continue}if(vt==="attributename"&&Sp(H,"href")){js(Be,P);continue}if(he.forceKeepAttr)continue;if(!he.keepAttr){js(Be,P);continue}if(!le&&Kt(/\/>/i,H)){js(Be,P);continue}xe&&vn([Z,oe,se],Ee=>{H=Fa(H,Ee," ")});const Q=Xe(P.nodeName);if(!K(Q,vt,H)){js(Be,P);continue}if(S&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!yt)switch(u.getAttributeType(Q,vt)){case"TrustedHTML":{H=T(H);break}case"TrustedScriptURL":{H=M(H);break}}if(H!==O)try{yt?P.setAttributeNS(yt,Be,H):P.setAttribute(Be,H),Bn(P)?ut(P):kp(t.removed)}catch{js(Be,P)}}Xt(G.afterSanitizeAttributes,P,null)},un=function(P){let ne=null;const he=aa(P);for(Xt(G.beforeSanitizeShadowDOM,P,null);ne=he.nextNode();)if(Xt(G.uponSanitizeShadowNode,ne,null),Oa(ne),es(ne),Ys(ne.content)&&un(ne.content),(y?y(ne):ne.nodeType)===Qs.element){const Fe=x?x(ne):ne.shadowRoot;Ys(Fe)&&(Hn(Fe),un(Fe))}Xt(G.afterSanitizeShadowDOM,P,null)},Hn=function(P){const ne=[{node:P,shadow:null}];for(;ne.length>0;){const he=ne.pop();if(he.shadow){un(he.shadow);continue}const De=he.node,Be=(y?y(De):De.nodeType)===Qs.element,yt=w?w(De):De.childNodes;if(yt)for(let it=yt.length-1;it>=0;--it)ne.push({node:yt[it],shadow:null});if(Be){const it=E?E(De):null;if(typeof it=="string"&&Xe(it)==="template"){const vt=De.content;Ys(vt)&&ne.push({node:vt,shadow:null})}}if(Be){const it=x?x(De):De.shadowRoot;Ys(it)&&ne.push({node:null,shadow:it},{node:it,shadow:null})}}};return t.sanitize=function(Te){let P=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ne=null,he=null,De=null,Fe=null;if(Js=!Te,Js&&(Te="<!-->"),typeof Te!="string"&&!dn(Te)&&(Te=e1(Te),typeof Te!="string"))throw ra("dirty is not a string, aborting");if(!t.isSupported)return Te;Re||we(P),t.removed=[];const Be=Ot&&typeof Te!="string"&&dn(Te);if(Be){const vt=E?E(Te):Te.nodeName;if(typeof vt=="string"){const O=Xe(vt);if(!ue[O]||ee[O])throw ra("root node is forbidden and cannot be sanitized in-place")}if(Bn(Te))throw ra("root node is clobbered and cannot be sanitized in-place");try{Hn(Te)}catch(O){throw $n(Te),O}}else if(dn(Te))ne=Ia("<!---->"),he=ne.ownerDocument.importNode(Te,!0),he.nodeType===Qs.element&&he.nodeName==="BODY"||he.nodeName==="HTML"?ne=he:ne.appendChild(he),Hn(he);else{if(!ve&&!xe&&!_e&&Te.indexOf("<")===-1)return S&&Oe?T(Te):Te;if(ne=Ia(Te),!ne)return ve?null:Oe?L:""}ne&&B&&ut(ne.firstChild);const yt=aa(Be?Te:ne);try{for(;De=yt.nextNode();)Oa(De),es(De),Ys(De.content)&&un(De.content)}catch(vt){throw Be&&$n(Te),vt}if(Be)return vn(t.removed,vt=>{vt.element&&vi(vt.element)}),xe&&Un(Te),Te;if(ve){if(xe&&Un(ne),ke)for(Fe=C.call(ne.ownerDocument);ne.firstChild;)Fe.appendChild(ne.firstChild);else Fe=ne;return(g.shadowroot||g.shadowrootmode)&&(Fe=W.call(n,Fe,!0)),Fe}let it=_e?ne.outerHTML:ne.innerHTML;return _e&&ue["!doctype"]&&ne.ownerDocument&&ne.ownerDocument.doctype&&ne.ownerDocument.doctype.name&&Kt(u1,ne.ownerDocument.doctype.name)&&(it="<!DOCTYPE "+ne.ownerDocument.doctype.name+`>
`+it),xe&&vn([Z,oe,se],vt=>{it=Fa(it,vt," ")}),S&&Oe?T(it):it},t.setConfig=function(){let Te=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};we(Te),Re=!0},t.clearConfig=function(){Ts=null,Re=!1,S=R,L=""},t.isValidAttribute=function(Te,P,ne){Ts||we({});const he=Xe(Te),De=Xe(P);return K(he,De,ne)},t.addHook=function(Te,P){typeof P=="function"&&Ma(G[Te],P)},t.removeHook=function(Te,P){if(P!==void 0){const ne=KS(G[Te],P);return ne===-1?void 0:WS(G[Te],ne,1)[0]}return kp(G[Te])},t.removeHooks=function(Te){G[Te]=[]},t.removeAllHooks=function(){G=Np()},t}var Dp=fv();function _d(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Ra=_d();function hv(e){Ra=e}var Hi={exec:()=>null};function ot(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(fs.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var fs={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},m1=/^(?:[ \t]*(?:\n|$))+/,v1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,g1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,xl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,b1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,wd=/(?:[*+-]|\d{1,9}[.)])/,mv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,vv=ot(mv).replace(/bull/g,wd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),y1=ot(mv).replace(/bull/g,wd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),kd=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,x1=/^[^\n]+/,Sd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,_1=ot(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Sd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),w1=ot(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,wd).getRegex(),tr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Td=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,k1=ot("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Td).replace("tag",tr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),gv=ot(kd).replace("hr",xl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",tr).getRegex(),S1=ot(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",gv).getRegex(),Cd={blockquote:S1,code:v1,def:_1,fences:g1,heading:b1,hr:xl,html:k1,lheading:vv,list:w1,newline:m1,paragraph:gv,table:Hi,text:x1},Pp=ot("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",xl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",tr).getRegex(),T1={...Cd,lheading:y1,table:Pp,paragraph:ot(kd).replace("hr",xl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Pp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",tr).getRegex()},C1={...Cd,html:ot(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Td).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Hi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:ot(kd).replace("hr",xl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",vv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},E1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,A1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,bv=/^( {2,}|\\)\n(?!\s*$)/,R1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,sr=/[\p{P}\p{S}]/u,Ed=/[\s\p{P}\p{S}]/u,yv=/[^\s\p{P}\p{S}]/u,I1=ot(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Ed).getRegex(),xv=/(?!~)[\p{P}\p{S}]/u,O1=/(?!~)[\s\p{P}\p{S}]/u,L1=/(?:[^\s\p{P}\p{S}]|~)/u,N1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,_v=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,D1=ot(_v,"u").replace(/punct/g,sr).getRegex(),P1=ot(_v,"u").replace(/punct/g,xv).getRegex(),wv="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",M1=ot(wv,"gu").replace(/notPunctSpace/g,yv).replace(/punctSpace/g,Ed).replace(/punct/g,sr).getRegex(),F1=ot(wv,"gu").replace(/notPunctSpace/g,L1).replace(/punctSpace/g,O1).replace(/punct/g,xv).getRegex(),$1=ot("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,yv).replace(/punctSpace/g,Ed).replace(/punct/g,sr).getRegex(),U1=ot(/\\(punct)/,"gu").replace(/punct/g,sr).getRegex(),B1=ot(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),H1=ot(Td).replace("(?:-->|$)","-->").getRegex(),z1=ot("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",H1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),ko=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,j1=ot(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",ko).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),kv=ot(/^!?\[(label)\]\[(ref)\]/).replace("label",ko).replace("ref",Sd).getRegex(),Sv=ot(/^!?\[(ref)\](?:\[\])?/).replace("ref",Sd).getRegex(),V1=ot("reflink|nolink(?!\\()","g").replace("reflink",kv).replace("nolink",Sv).getRegex(),Ad={_backpedal:Hi,anyPunctuation:U1,autolink:B1,blockSkip:N1,br:bv,code:A1,del:Hi,emStrongLDelim:D1,emStrongRDelimAst:M1,emStrongRDelimUnd:$1,escape:E1,link:j1,nolink:Sv,punctuation:I1,reflink:kv,reflinkSearch:V1,tag:z1,text:R1,url:Hi},q1={...Ad,link:ot(/^!?\[(label)\]\((.*?)\)/).replace("label",ko).getRegex(),reflink:ot(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",ko).getRegex()},vc={...Ad,emStrongRDelimAst:F1,emStrongLDelim:P1,url:ot(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},G1={...vc,br:ot(bv).replace("{2,}","*").getRegex(),text:ot(vc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Bl={normal:Cd,gfm:T1,pedantic:C1},Ti={normal:Ad,gfm:vc,breaks:G1,pedantic:q1},K1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Mp=e=>K1[e];function tn(e,t){if(t){if(fs.escapeTest.test(e))return e.replace(fs.escapeReplace,Mp)}else if(fs.escapeTestNoEncode.test(e))return e.replace(fs.escapeReplaceNoEncode,Mp);return e}function Fp(e){try{e=encodeURI(e).replace(fs.percentDecode,"%")}catch{return null}return e}function $p(e,t){var i;const s=e.replace(fs.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(fs.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(fs.slashPipe,"|");return n}function Ci(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function W1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Up(e,t,s,n,a){const i=t.href,l=t.title||null,o=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:n.inlineTokens(o)};return n.state.inLink=!1,r}function J1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=a.length?i.slice(a.length):i}).join(`
`)}var So=class{constructor(e){ht(this,"options");ht(this,"rules");ht(this,"lexer");this.options=e||Ra}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Ci(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=J1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Ci(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Ci(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,N=>" ".repeat(3*N.length)),p=e.split(`
`,1)[0],f=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):f?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const N=this.rules.other.nextBulletRegex(m),x=this.rules.other.hrRegex(m),b=this.rules.other.fencesBeginRegex(m),y=this.rules.other.headingBeginRegex(m),E=this.rules.other.htmlBeginRegex(m);for(;e;){const S=e.split(`
`,1)[0];let L;if(p=S,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),L=p):L=p.replace(this.rules.other.tabCharGlobal,"    "),b.test(p)||y.test(p)||E.test(p)||N.test(p)||x.test(p))break;if(L.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+L.slice(m);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||b.test(u)||y.test(u)||x.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=S+`
`,e=e.substring(S.length+1),u=L.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,w;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(w=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:w,loose:!1,text:d,tokens:[]}),a.raw+=c}const o=a.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let r=0;r<a.items.length;r++)if(this.lexer.state.top=!1,a.items[r].tokens=this.lexer.blockTokens(a.items[r].text,[]),!a.loose){const c=a.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let r=0;r<a.items.length;r++)a.items[r].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=$p(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const o of n)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of a)i.rows.push($p(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Ci(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=W1(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Up(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Up(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,o,r=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(o=[...l].length,n[3]||n[4]){r+=o;continue}else if((n[5]||n[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Sn=class gc{constructor(t){ht(this,"tokens");ht(this,"options");ht(this,"state");ht(this,"tokenizer");ht(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Ra,this.options.tokenizer=this.options.tokenizer||new So,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:fs,block:Bl.normal,inline:Ti.normal};this.options.pedantic?(s.block=Bl.pedantic,s.inline=Ti.pedantic):this.options.gfm&&(s.block=Bl.gfm,this.options.breaks?s.inline=Ti.breaks:s.inline=Ti.gfm),this.tokenizer.rules=s}static get rules(){return{block:Bl,inline:Ti}}static lex(t,s){return new gc(s).lex(t)}static lexInline(t,s){return new gc(s).inlineTokens(t)}lex(t){t=t.replace(fs.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(fs.tabCharGlobal,"    ").replace(fs.spaceLine,""));t;){let o;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),n=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},f),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},To=class{constructor(e){ht(this,"options");ht(this,"parser");this.options=e||Ra}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(fs.notSpaceStart))==null?void 0:i[0],a=e.replace(fs.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${tn(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Fp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+tn(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Fp(e);if(a===null)return tn(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${tn(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:tn(e.text)}},Rd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Tn=class bc{constructor(t){ht(this,"options");ht(this,"renderer");ht(this,"textRenderer");this.options=t||Ra,this.options.renderer=this.options.renderer||new To,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Rd}static parse(t,s){return new bc(s).parse(t)}static parseInline(t,s){return new bc(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const r=o;switch(r.type){case"space":{n+=this.renderer.space(r);continue}case"hr":{n+=this.renderer.hr(r);continue}case"heading":{n+=this.renderer.heading(r);continue}case"code":{n+=this.renderer.code(r);continue}case"table":{n+=this.renderer.table(r);continue}case"blockquote":{n+=this.renderer.blockquote(r);continue}case"list":{n+=this.renderer.list(r);continue}case"html":{n+=this.renderer.html(r);continue}case"paragraph":{n+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){n+=c||"";continue}}const r=o;switch(r.type){case"escape":{n+=s.text(r);break}case"html":{n+=s.html(r);break}case"link":{n+=s.link(r);break}case"image":{n+=s.image(r);break}case"strong":{n+=s.strong(r);break}case"em":{n+=s.em(r);break}case"codespan":{n+=s.codespan(r);break}case"br":{n+=s.br(r);break}case"del":{n+=s.del(r);break}case"text":{n+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Lr,Kl=(Lr=class{constructor(e){ht(this,"options");ht(this,"block");this.options=e||Ra}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Sn.lex:Sn.lexInline}provideParser(){return this.block?Tn.parse:Tn.parseInline}},ht(Lr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Lr),Z1=class{constructor(...e){ht(this,"defaults",_d());ht(this,"options",this.setOptions);ht(this,"parse",this.parseMarkdown(!0));ht(this,"parseInline",this.parseMarkdown(!1));ht(this,"Parser",Tn);ht(this,"Renderer",To);ht(this,"TextRenderer",Rd);ht(this,"Lexer",Sn);ht(this,"Tokenizer",So);ht(this,"Hooks",Kl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let o=a.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new To(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new So(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Kl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=a[l];Kl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(a,c)).then(u=>r.call(a,u));const d=o.call(a,c);return r.call(a,d)}:a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),a&&(o=o.concat(a.call(this,l))),o}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Sn.lex(e,t??this.defaults)}parser(e,t){return Tn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Sn.lex:Sn.lexInline,r=i.hooks?i.hooks.provideParser():e?Tn.parse:Tn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+tn(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ka=new Z1;function at(e,t){return ka.parse(e,t)}at.options=at.setOptions=function(e){return ka.setOptions(e),at.defaults=ka.defaults,hv(at.defaults),at};at.getDefaults=_d;at.defaults=Ra;at.use=function(...e){return ka.use(...e),at.defaults=ka.defaults,hv(at.defaults),at};at.walkTokens=function(e,t){return ka.walkTokens(e,t)};at.parseInline=ka.parseInline;at.Parser=Tn;at.parser=Tn.parse;at.Renderer=To;at.TextRenderer=Rd;at.Lexer=Sn;at.lexer=Sn.lex;at.Tokenizer=So;at.Hooks=Kl;at.parse=at;at.options;at.setOptions;at.use;at.walkTokens;at.parseInline;Tn.parse;Sn.lex;const Y1={breaks:!0,gfm:!0};function Bp(e){if(!e)return"";try{if(typeof at<"u"&&at.parse){const t=at.parse(e,Y1);return typeof Dp<"u"?Dp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function Q1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const X1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function eT(e){return X1[e]||"wrench"}const tT=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Hp(e){if(!e)return[];const t=e.match(tT);return t?[...new Set(t)]:[]}const sT={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(""),a=h(null),i=h(null),l=h(0),o=h("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=q(()=>t.value.trim().length>0&&!s.value),p=h(Ye.state||"disconnected");let f=null;const m=q(()=>{const A=p.value;return A==="connected"?"Connected":A==="reconnecting"?"Reconnecting…":A==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],w=q(()=>{const A=Math.floor(l.value/4)%v.length,k=l.value;return k>3?`${v[A]} (${k}s)`:v[0]});function N(){Rt(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function x(){if(!i.value)return;const A=i.value;A.style.height="auto",A.style.height=Math.min(A.scrollHeight,120)+"px"}function b(A,k,C={}){const $={id:++c,role:A,content:k,timestamp:Date.now(),html:A==="bot"?Bp(k):"",tools_used:C.tools_used||[],is_error:C.is_error||!1,images:A==="bot"?Hp(k):[],files:C.files||[],_showTools:!1};return e.value.push($),N(),A==="bot"&&Rt(()=>y()),$}function y(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(k=>{k.setAttribute("data-copy","true"),k.style.position="relative";const C=document.createElement("button");C.className="chat-code-copy",C.textContent="Copy",C.addEventListener("click",()=>{const $=k.querySelector("code"),W=$?$.textContent:k.textContent;navigator.clipboard.writeText(W).then(()=>{C.textContent="Copied!",setTimeout(()=>{C.textContent="Copy"},1500)}).catch(()=>{})}),k.appendChild(C)})}function E(A){if(A===0)return!0;const k=e.value[A-1],C=e.value[A],$=new Date(k.timestamp).toDateString(),W=new Date(C.timestamp).toDateString();return $!==W}function S(A){const k=new Date(A),C=new Date;if(k.toDateString()===C.toDateString())return"Today";const $=new Date(C);return $.setDate($.getDate()-1),k.toDateString()===$.toDateString()?"Yesterday":k.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function L(A){t.value=A,Rt(()=>j())}function R(A){window.open(A,"_blank","noopener")}function _(A){A.target.style.display="none"}function D(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function U(){r&&(clearInterval(r),r=null),l.value=0}function T(A){s.value&&(s.value=!1,U(),A.type==="chat_response"?b("bot",A.content,{tools_used:A.tools_used||[],is_error:A.is_error||!1,files:A.files||[]}):A.type==="chat_error"&&b("bot",A.error||"Unknown error",{is_error:!0}),Rt(()=>{var k;return(k=i.value)==null?void 0:k.focus()}))}async function M(A){try{const k=await z.post("/api/chat",{content:A,channel_id:o.value});b("bot",k.response,{tools_used:k.tools_used||[],is_error:k.is_error||!1,files:k.files||[]})}catch(k){b("bot",k.message||"Failed to send message",{is_error:!0})}}async function j(){const A=t.value.trim();if(!A||s.value)return;b("user",A),t.value="",s.value=!0,D(),i.value&&(i.value.style.height="auto"),Ye.connected&&Ye.sendChat(A,{channelId:o.value})||(await M(A),s.value=!1,U()),Rt(()=>{var C;return(C=i.value)==null?void 0:C.focus()})}async function J(){n.value="";try{if(!o.value){const k=await z.get("/api/auth/session");o.value=k.channel_id||k.user_id||"web-user"}const A=await z.get("/api/sessions/"+encodeURIComponent(o.value));if(A&&A.messages&&A.messages.length>0){for(const k of A.messages){const C=k.role==="user"?"user":"bot";let $=k.content||"";if(C==="user"){const G=$.match(/^\[.*?\]:\s*/);G&&($=$.slice(G[0].length))}if(!$.trim())continue;const W={id:++c,role:C,content:$,timestamp:k.timestamp?k.timestamp*1e3:Date.now(),html:C==="bot"?Bp($):"",tools_used:[],is_error:!1,images:C==="bot"?Hp($):[],files:[],_showTools:!1};e.value.push(W)}Rt(()=>{N(),y()})}}catch(A){A&&A.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",ye.error(n.value))}}return je(()=>{Ye.subscribe("chat",T),p.value=Ye.state||"disconnected",f=Ye.onState(A=>{p.value=A}),J(),Rt(()=>{var A;return(A=i.value)==null?void 0:A.focus()})}),ft(()=>{Ye.unsubscribe("chat",T),f&&(f(),f=null),U()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:w,suggestions:d,send:j,autoResize:x,formatTime:Q1,formatDate:S,showDateSeparator:E,useSuggestion:L,openImage:R,onImageError:_,getToolIcon:eT,loadHistory:J}}},nT={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),o=h(!1),r=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),m=q(()=>e.value==="custom"),v=q(()=>[...i.value,...l.value]),w=q(()=>l.value.includes(e.value)),N=q(()=>{var R;return m.value?t.value||"Odin":((R=a.value[e.value])==null?void 0:R.name)||e.value}),x=q(()=>{var R;return m.value?s.value||"(empty — will use Odin default)":((R=a.value[e.value])==null?void 0:R.identity)||""}),b=q(()=>{var R;return m.value?n.value||"(empty — will use Odin default)":((R=a.value[e.value])==null?void 0:R.voice)||""});async function y(){d.value=!0;try{const R=await z.get("/api/personality");e.value=R.preset||"odin",t.value=R.custom_name||"",s.value=R.custom_identity||"",n.value=R.custom_voice||"",a.value=R.presets||{},i.value=R.builtin_presets||[],l.value=R.user_presets||[]}catch(R){c.value=R.message}finally{d.value=!1}}async function E(){o.value=!0,c.value=null,r.value=!1;try{await z.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(R){c.value=R.message}finally{o.value=!1}}async function S(){const R=u.value.trim();if(R){f.value=!0,c.value=null;try{await z.post("/api/personality/presets",{name:R,display_name:N.value,identity:x.value,voice:b.value}),p.value=!1,u.value="",await y(),e.value=R.toLowerCase().replace(/ /g,"_")}catch(_){c.value=_.message}finally{f.value=!1}}}async function L(){if(await qt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await z.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await y(),e.value="odin"}catch(_){c.value=_.message}}}return je(y),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:w,previewName:N,previewIdentity:x,previewVoice:b,saving:o,saved:r,error:c,loading:d,save:E,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:S,deletePreset:L,builtinPresets:i,userPresets:l}},template:`
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
  `},kt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Tv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:$S,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:sT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:tk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:dk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Ok,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:nT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:OS,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:kt("/operations","live")},{path:"/agents",redirect:kt("/operations","agents")},{path:"/loops",redirect:kt("/operations","loops")},{path:"/processes",redirect:kt("/operations","processes")},{path:"/schedules",redirect:kt("/operations","schedules")},{path:"/audit",redirect:kt("/history","audit")},{path:"/sessions",redirect:kt("/history","sessions")},{path:"/traces",redirect:kt("/history","traces")},{path:"/usage",redirect:kt("/history","usage")},{path:"/tools",redirect:kt("/capabilities","tools")},{path:"/skills",redirect:kt("/capabilities","skills")},{path:"/mcp",redirect:kt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:kt("/capabilities","knowledge")},{path:"/memory",redirect:kt("/capabilities","memory")},{path:"/learned",redirect:kt("/capabilities","learned")},{path:"/health",redirect:kt("/system","health")},{path:"/resources",redirect:kt("/system","resources")},{path:"/logs",redirect:kt("/system","logs")},{path:"/config",redirect:kt("/system","config")},{path:"/host-access",redirect:kt("/system","host-access")},{path:"/hosts",redirect:kt("/system","hosts")},{path:"/internals",redirect:kt("/system","internals")}],zi=Iw({history:rw(),routes:Tv});zi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const aT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{z.setPersist(a.value),await z.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},iT={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let o=null,r=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const m=h("starting"),v=h(""),w=Tv.filter($=>$.meta),N=q(()=>["Workspace","Operate","Observe","Manage"].map($=>({name:$,routes:w.filter(W=>W.meta.section===$)})).filter($=>$.routes.length)),x=q(()=>{var $;return(($=zi.currentRoute.value.meta)==null?void 0:$.label)||"Odin"}),b=q(()=>{var $;return(($=zi.currentRoute.value.meta)==null?void 0:$.section)||"Management"}),y=q(()=>{var $;return(($=zi.currentRoute.value.meta)==null?void 0:$.description)||"Management console"});function E(){Ye.disconnect(),j&&(clearInterval(j),j=null)}z.onSessionExpired=()=>{t.value=!0,E(),z.setToken(""),e.value="login"};function S($){var W;if(($.ctrlKey||$.metaKey)&&$.key.toLowerCase()==="k"){e.value==="ready"&&($.preventDefault(),yp());return}if(n.value&&$.key==="Tab"){const G=[...((W=a.value)==null?void 0:W.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(G.length){const Z=G[0],oe=G[G.length-1];if($.shiftKey&&(document.activeElement===Z||!a.value.contains(document.activeElement))){$.preventDefault(),oe.focus();return}if(!$.shiftKey&&(document.activeElement===oe||!a.value.contains(document.activeElement))){$.preventDefault(),Z.focus();return}}}if($.key==="Escape"&&n.value){n.value=!1,$.preventDefault();return}if($.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes($.target.tagName)){$.preventDefault();const G=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');G&&G.focus()}}function L(){l.value=!!(o!=null&&o.matches),l.value||(n.value=!1)}je(async()=>{document.addEventListener("keydown",S),o=window.matchMedia("(max-width: 900px)"),L(),o.addEventListener("change",L);const $=await z.check();$.ok?(e.value="ready",k()):$.needsAuth?e.value="login":(e.value="ready",k())});function R(){t.value=!1,e.value="ready",k()}async function _(){E(),e.value="login",await z.logout()}function D(){s.value=!s.value}function U(){n.value=!n.value}Mt(n,async $=>{var W,G;if($)r=document.activeElement,await Rt(),(G=(W=a.value)==null?void 0:W.querySelector(".nav-item"))==null||G.focus();else if(r!=null&&r.isConnected){const Z=r;r=null,requestAnimationFrame(()=>Z.focus())}});const T=q(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M($,W="info",G=3e3){p.value={text:$,level:W},clearTimeout(f),f=setTimeout(()=>{p.value=null},G)}let j=null,J=!1,A=[];function k(){for(const $ of A)$();A=[Ye.onStatus($=>{c.value=$}),Ye.onLatencyChange($=>{u.value=$}),Ye.onState(($,W)=>{d.value=$,$==="connected"?(J&&M("Connection restored","success"),J=!0):$==="reconnecting"&&W.attempt===1&&M("Connection lost — reconnecting…","warn")})],Ye.connect(),C(),j&&clearInterval(j),j=setInterval(C,15e3)}async function C(){try{const $=await z.get("/api/status");m.value=$.status==="online"?"online":"starting";const W=$.uptime_seconds||0,G=Math.floor(W/3600),Z=Math.floor(W%3600/60);v.value=`${G}h ${Z}m uptime`}catch{m.value="offline",v.value=""}}return ft(()=>{j&&clearInterval(j);for(const $ of A)$();A=[],Ye.disconnect(),document.removeEventListener("keydown",S),o==null||o.removeEventListener("change",L)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:T,wsToast:p,botStatus:m,botUptime:v,navRoutes:w,navGroups:N,currentPage:x,currentSection:b,currentDescription:y,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:R,logout:_,toggleSidebar:D,toggleMobileNavigation:U,openPalette:yp}}},sa=po(iT);sa.component("odin-icon",PS);sa.component("login-screen",aT);sa.component("toast-container",w_);sa.component("confirm-host",k_);sa.component("command-palette",DS);sa.directive("modal-focus",FS);sa.use(zi);sa.mount("#app");
