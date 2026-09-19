var Zv=Object.defineProperty;var Yv=(e,t,s)=>t in e?Zv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var xt=(e,t,s)=>Yv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Qv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new Hl("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new Ar(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Hl("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new Ar((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}async setListenerExposure(t,s){const a=await fetch("/api/setup/listener",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({expose_beyond_loopback:s})}),n=await a.json().catch(()=>null);if(!a.ok)throw new Ar((n==null?void 0:n.error)||"Listener reauthentication failed",a.status,n);return n}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new Hl((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Hl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Hl extends Error{constructor(t){super(t),this.name="AuthError"}}class Ar extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class Xv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const z=new Qv,nt=new Xv(z);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Fs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const et={},di=[],ls=()=>{},oi=()=>!1,Un=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Ko=e=>e.startsWith("onUpdate:"),Xe=Object.assign,Vc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},eg=Object.prototype.hasOwnProperty,pt=(e,t)=>eg.call(e,t),Ee=Array.isArray,ui=e=>Li(e)==="[object Map]",Bn=e=>Li(e)==="[object Set]",tu=e=>Li(e)==="[object Date]",tg=e=>Li(e)==="[object RegExp]",$e=e=>typeof e=="function",je=e=>typeof e=="string",ms=e=>typeof e=="symbol",ct=e=>e!==null&&typeof e=="object",qc=e=>(ct(e)||$e(e))&&$e(e.then)&&$e(e.catch),ff=Object.prototype.toString,Li=e=>ff.call(e),sg=e=>Li(e).slice(8,-1),Jo=e=>Li(e)==="[object Object]",Zo=e=>je(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,$a=Fs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),ag=Fs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Yo=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},ng=/-\w/g,bt=Yo(e=>e.replace(ng,t=>t.slice(1).toUpperCase())),ig=/\B([A-Z])/g,Is=Yo(e=>e.replace(ig,"-$1").toLowerCase()),Hn=Yo(e=>e.charAt(0).toUpperCase()+e.slice(1)),pi=Yo(e=>e?`on${Hn(e)}`:""),Yt=(e,t)=>!Object.is(e,t),fi=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},mf=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Qo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},go=e=>{const t=je(e)?Number(e):NaN;return isNaN(t)?e:t};let su;const Xo=()=>su||(su=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function lg(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const og="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",rg=Fs(og);function Rl(e){if(Ee(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=je(a)?hf(a):Rl(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(je(e)||ct(e))return e}const cg=/;(?![^(]*\))/g,dg=/:([^]+)/,ug=/\/\*[^]*?\*\//g;function hf(e){const t={};return e.replace(ug,"").split(cg).forEach(s=>{if(s){const a=s.split(dg);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function Il(e){let t="";if(je(e))t=e;else if(Ee(e))for(let s=0;s<e.length;s++){const a=Il(e[s]);a&&(t+=a+" ")}else if(ct(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function pg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!je(t)&&(e.class=Il(t)),s&&(e.style=Rl(s)),e}const fg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",mg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",hg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",vg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",gg=Fs(fg),bg=Fs(mg),yg=Fs(hg),xg=Fs(vg),_g="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",wg=Fs(_g);function vf(e){return!!e||e===""}function kg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=za(e[a],t[a]);return s}function za(e,t){if(e===t)return!0;let s=tu(e),a=tu(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=ms(e),a=ms(t),s||a)return e===t;if(s=Ee(e),a=Ee(t),s||a)return s&&a?kg(e,t):!1;if(s=ct(e),a=ct(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!za(e[l],t[l]))return!1}}return String(e)===String(t)}function er(e,t){return e.findIndex(s=>za(s,t))}const gf=e=>!!(e&&e.__v_isRef===!0),bf=e=>je(e)?e:e==null?"":Ee(e)||ct(e)&&(e.toString===ff||!$e(e.toString))?gf(e)?bf(e.value):JSON.stringify(e,yf,2):String(e),yf=(e,t)=>gf(t)?yf(e,t.value):ui(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[Rr(a,i)+" =>"]=n,s),{})}:Bn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Rr(s))}:ms(t)?Rr(t):ct(t)&&!Ee(t)&&!Jo(t)?String(t):t,Rr=(e,t="")=>{var s;return ms(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Sg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let qt;class Gc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&qt&&(qt.active?(this.parent=qt,this.index=(qt.scopes||(qt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=qt;try{return qt=this,t()}finally{qt=s}}}on(){++this._on===1&&(this.prevScope=qt,qt=this)}off(){if(this._on>0&&--this._on===0){if(qt===this)qt=this.prevScope;else{let t=qt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function Tg(e){return new Gc(e)}function xf(){return qt}function Cg(e,t=!1){qt&&qt.cleanups.push(e)}let _t;const Ir=new WeakSet;class rl{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,qt&&(qt.active?qt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Ir.has(this)&&(Ir.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||wf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,au(this),kf(this);const t=_t,s=na;_t=this,na=!0;try{return this.fn()}finally{Sf(this),_t=t,na=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Jc(t);this.deps=this.depsTail=void 0,au(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Ir.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){nc(this)&&this.run()}get dirty(){return nc(this)}}let _f=0,Qi,Xi;function wf(e,t=!1){if(e.flags|=8,t){e.next=Xi,Xi=e;return}e.next=Qi,Qi=e}function Wc(){_f++}function Kc(){if(--_f>0)return;if(Xi){let t=Xi;for(Xi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Qi;){let t=Qi;for(Qi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function kf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Sf(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),Jc(a),Eg(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function nc(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Tf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Tf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===cl)||(e.globalVersion=cl,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!nc(e))))return;e.flags|=2;const t=e.dep,s=_t,a=na;_t=e,na=!0;try{kf(e);const n=e.fn(e._value);(t.version===0||Yt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{_t=s,na=a,Sf(e),e.flags&=-3}}function Jc(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Jc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Eg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Ag(e,t){e.effect instanceof rl&&(e=e.effect.fn);const s=new rl(e);t&&Xe(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function Rg(e){e.effect.stop()}let na=!0;const Cf=[];function ja(){Cf.push(na),na=!1}function Va(){const e=Cf.pop();na=e===void 0?!0:e}function au(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=_t;_t=void 0;try{t()}finally{_t=s}}}let cl=0;class Ig{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class tr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!_t||!na||_t===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==_t)s=this.activeLink=new Ig(_t,this),_t.deps?(s.prevDep=_t.depsTail,_t.depsTail.nextDep=s,_t.depsTail=s):_t.deps=_t.depsTail=s,Ef(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=_t.depsTail,s.nextDep=void 0,_t.depsTail.nextDep=s,_t.depsTail=s,_t.deps===s&&(_t.deps=a)}return s}trigger(t){this.version++,cl++,this.notify(t)}notify(t){Wc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Kc()}}}function Ef(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)Ef(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const bo=new WeakMap,In=Symbol(""),ic=Symbol(""),dl=Symbol("");function us(e,t,s){if(na&&_t){let a=bo.get(e);a||bo.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new tr),n.map=a,n.key=s),n.track()}}function Na(e,t,s,a,n,i){const l=bo.get(e);if(!l){cl++;return}const o=r=>{r&&r.trigger()};if(Wc(),t==="clear")l.forEach(o);else{const r=Ee(e),c=r&&Zo(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===dl||!ms(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(dl)),t){case"add":r?c&&o(l.get("length")):(o(l.get(In)),ui(e)&&o(l.get(ic)));break;case"delete":r||(o(l.get(In)),ui(e)&&o(l.get(ic)));break;case"set":ui(e)&&o(l.get(In));break}}Kc()}function Og(e,t){const s=bo.get(e);return s&&s.get(t)}function Yn(e){const t=at(e);return t===e?t:(us(t,"iterate",dl),Ls(e)?t:t.map(la))}function sr(e){return us(e=at(e),"iterate",dl),e}function ha(e,t){return ga(e)?xi(Ua(e)?la(t):t):la(t)}const Lg={__proto__:null,[Symbol.iterator](){return Or(this,Symbol.iterator,e=>ha(this,e))},concat(...e){return Yn(this).concat(...e.map(t=>Ee(t)?Yn(t):t))},entries(){return Or(this,"entries",e=>(e[1]=ha(this,e[1]),e))},every(e,t){return Ta(this,"every",e,t,void 0,arguments)},filter(e,t){return Ta(this,"filter",e,t,s=>s.map(a=>ha(this,a)),arguments)},find(e,t){return Ta(this,"find",e,t,s=>ha(this,s),arguments)},findIndex(e,t){return Ta(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Ta(this,"findLast",e,t,s=>ha(this,s),arguments)},findLastIndex(e,t){return Ta(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Ta(this,"forEach",e,t,void 0,arguments)},includes(...e){return Lr(this,"includes",e)},indexOf(...e){return Lr(this,"indexOf",e)},join(e){return Yn(this).join(e)},lastIndexOf(...e){return Lr(this,"lastIndexOf",e)},map(e,t){return Ta(this,"map",e,t,void 0,arguments)},pop(){return Pi(this,"pop")},push(...e){return Pi(this,"push",e)},reduce(e,...t){return nu(this,"reduce",e,t)},reduceRight(e,...t){return nu(this,"reduceRight",e,t)},shift(){return Pi(this,"shift")},some(e,t){return Ta(this,"some",e,t,void 0,arguments)},splice(...e){return Pi(this,"splice",e)},toReversed(){return Yn(this).toReversed()},toSorted(e){return Yn(this).toSorted(e)},toSpliced(...e){return Yn(this).toSpliced(...e)},unshift(...e){return Pi(this,"unshift",e)},values(){return Or(this,"values",e=>ha(this,e))}};function Or(e,t,s){const a=sr(e),n=a[t]();return a!==e&&!Ls(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const Ng=Array.prototype;function Ta(e,t,s,a,n,i){const l=sr(e),o=l!==e&&!Ls(e),r=l[t];if(r!==Ng[t]){const u=r.apply(e,i);return o?la(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,ha(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function nu(e,t,s,a){const n=sr(e),i=n!==e&&!Ls(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=ha(e,c)),s.call(this,c,ha(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?ha(e,r):r}function Lr(e,t,s){const a=at(e);us(a,"iterate",dl);const n=a[t](...s);return(n===-1||n===!1)&&Ol(s[0])?(s[0]=at(s[0]),a[t](...s)):n}function Pi(e,t,s=[]){ja(),Wc();const a=at(e)[t].apply(e,s);return Kc(),Va(),a}const Dg=Fs("__proto__,__v_isRef,__isVue"),Af=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(ms));function Mg(e){ms(e)||(e=String(e));const t=at(this);return us(t,"has",e),t.hasOwnProperty(e)}class Rf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?Mf:Df:i?Nf:Lf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Ee(t);if(!n){let r;if(l&&(r=Lg[s]))return r;if(s==="hasOwnProperty")return Mg}const o=Reflect.get(t,s,Bt(t)?t:a);if((ms(s)?Af.has(s):Dg(s))||(n||us(t,"get",s),i))return o;if(Bt(o)){const r=l&&Zo(s)?o:o.value;return n&&ct(r)?yo(r):r}return ct(o)?n?yo(o):fn(o):o}}class If extends Rf{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Ee(t)&&Zo(s);if(!this._isShallow){const c=ga(i);if(!Ls(a)&&!ga(a)&&(i=at(i),a=at(a)),!l&&Bt(i)&&!Bt(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:pt(t,s),r=Reflect.set(t,s,a,Bt(t)?t:n);return t===at(n)&&(o?Yt(a,i)&&Na(t,"set",s,a):Na(t,"add",s,a)),r}deleteProperty(t,s){const a=pt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Na(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!ms(s)||!Af.has(s))&&us(t,"has",s),a}ownKeys(t){return us(t,"iterate",Ee(t)?"length":In),Reflect.ownKeys(t)}}class Of extends Rf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Pg=new If,Fg=new Of,$g=new If(!0),Ug=new Of(!0),lc=e=>e,zl=e=>Reflect.getPrototypeOf(e);function Bg(e,t,s){return function(...a){const n=this.__v_raw,i=at(n),l=ui(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?lc:t?xi:la;return!t&&us(i,"iterate",r?ic:In),Xe(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function jl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Hg(e,t){const s={get(n){const i=this.__v_raw,l=at(i),o=at(n);e||(Yt(n,o)&&us(l,"get",n),us(l,"get",o));const{has:r}=zl(l),c=t?lc:e?xi:la;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&us(at(n),"iterate",In),n.size},has(n){const i=this.__v_raw,l=at(i),o=at(n);return e||(Yt(n,o)&&us(l,"has",n),us(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=at(o),c=t?lc:e?xi:la;return!e&&us(r,"iterate",In),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return Xe(s,e?{add:jl("add"),set:jl("set"),delete:jl("delete"),clear:jl("clear")}:{add(n){const i=at(this),l=zl(i),o=at(n),r=!t&&!Ls(n)&&!ga(n)?o:n;return l.has.call(i,r)||Yt(n,r)&&l.has.call(i,n)||Yt(o,r)&&l.has.call(i,o)||(i.add(r),Na(i,"add",r,r)),this},set(n,i){!t&&!Ls(i)&&!ga(i)&&(i=at(i));const l=at(this),{has:o,get:r}=zl(l);let c=o.call(l,n);c||(n=at(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?Yt(i,d)&&Na(l,"set",n,i):Na(l,"add",n,i),this},delete(n){const i=at(this),{has:l,get:o}=zl(i);let r=l.call(i,n);r||(n=at(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Na(i,"delete",n,void 0),c},clear(){const n=at(this),i=n.size!==0,l=n.clear();return i&&Na(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=Bg(n,e,t)}),s}function ar(e,t){const s=Hg(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(pt(s,n)&&n in a?s:a,n,i)}const zg={get:ar(!1,!1)},jg={get:ar(!1,!0)},Vg={get:ar(!0,!1)},qg={get:ar(!0,!0)},Lf=new WeakMap,Nf=new WeakMap,Df=new WeakMap,Mf=new WeakMap;function Gg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function fn(e){return ga(e)?e:nr(e,!1,Pg,zg,Lf)}function Zc(e){return nr(e,!1,$g,jg,Nf)}function yo(e){return nr(e,!0,Fg,Vg,Df)}function Wg(e){return nr(e,!0,Ug,qg,Mf)}function nr(e,t,s,a,n){if(!ct(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Gg(sg(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Ua(e){return ga(e)?Ua(e.__v_raw):!!(e&&e.__v_isReactive)}function ga(e){return!!(e&&e.__v_isReadonly)}function Ls(e){return!!(e&&e.__v_isShallow)}function Ol(e){return e?!!e.__v_raw:!1}function at(e){const t=e&&e.__v_raw;return t?at(t):e}function Pf(e){return!pt(e,"__v_skip")&&Object.isExtensible(e)&&mf(e,"__v_skip",!0),e}const la=e=>ct(e)?fn(e):e,xi=e=>ct(e)?yo(e):e;function Bt(e){return e?e.__v_isRef===!0:!1}function f(e){return Ff(e,!1)}function Yc(e){return Ff(e,!0)}function Ff(e,t){return Bt(e)?e:new Kg(e,t)}class Kg{constructor(t,s){this.dep=new tr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:at(t),this._value=s?t:la(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||Ls(t)||ga(t);t=a?t:at(t),Yt(t,s)&&(this._rawValue=t,this._value=a?t:la(t),this.dep.trigger())}}function Jg(e){e.dep&&e.dep.trigger()}function va(e){return Bt(e)?e.value:e}function Zg(e){return $e(e)?e():va(e)}const Yg={get:(e,t,s)=>t==="__v_raw"?e:va(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return Bt(n)&&!Bt(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function Qc(e){return Ua(e)?e:new Proxy(e,Yg)}class Qg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new tr,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function $f(e){return new Qg(e)}function Xg(e){const t=Ee(e)?new Array(e.length):{};for(const s in e)t[s]=Uf(e,s);return t}class eb{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=ms(s)?s:String(s),this._raw=at(t);let n=!0,i=t;if(!Ee(t)||ms(this._key)||!Zo(this._key))do n=!Ol(i)||Ls(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=va(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Bt(this._raw[this._key])){const s=this._object[this._key];if(Bt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Og(this._raw,this._key)}}class tb{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function sb(e,t,s){return Bt(e)?e:$e(e)?new tb(e):ct(e)&&arguments.length>1?Uf(e,t,s):f(e)}function Uf(e,t,s){return new eb(e,t,s)}class ab{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new tr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=cl-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&_t!==this)return wf(this,!0),!0}get value(){const t=this.dep.track();return Tf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function nb(e,t,s=!1){let a,n;return $e(e)?a=e:(a=e.get,n=e.set),new ab(a,n,s)}const ib={GET:"get",HAS:"has",ITERATE:"iterate"},lb={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Vl={},xo=new WeakMap;let nn;function ob(){return nn}function Bf(e,t=!1,s=nn){if(s){let a=xo.get(s);a||xo.set(s,a=[]),a.push(e)}}function rb(e,t,s=et){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>n?b:Ls(b)||n===!1||n===0?Da(b,1):Da(b);let d,u,p,m,h=!1,g=!1;if(Bt(e)?(u=()=>e.value,h=Ls(e)):Ua(e)?(u=()=>c(e),h=!0):Ee(e)?(g=!0,h=e.some(b=>Ua(b)||Ls(b)),u=()=>e.map(b=>{if(Bt(b))return b.value;if(Ua(b))return c(b);if($e(b))return r?r(b,2):b()})):$e(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){ja();try{p()}finally{Va()}}const b=nn;nn=d;try{return r?r(e,3,[m]):e(m)}finally{nn=b}}:u=ls,t&&n){const b=u,x=n===!0?1/0:n;u=()=>Da(b(),x)}const A=xf(),I=()=>{d.stop(),A&&A.active&&Vc(A.effects,d)};if(i&&t){const b=t;t=(...x)=>{const w=b(...x);return I(),w}}let y=g?new Array(e.length).fill(Vl):Vl;const v=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const x=d.run();if(b||n||h||(g?x.some((w,E)=>Yt(w,y[E])):Yt(x,y))){p&&p();const w=nn;nn=d;try{const E=[x,y===Vl?void 0:g&&y[0]===Vl?[]:y,m];y=x,r?r(t,3,E):t(...E)}finally{nn=w}}}else d.run()};return o&&o(v),d=new rl(u),d.scheduler=l?()=>l(v,!1):v,m=b=>Bf(b,!1,d),p=d.onStop=()=>{const b=xo.get(d);if(b){if(r)r(b,4);else for(const x of b)x();xo.delete(d)}},t?a?v(!0):y=d.run():l?l(v.bind(null,!0),!0):d.run(),I.pause=d.pause.bind(d),I.resume=d.resume.bind(d),I.stop=I,I}function Da(e,t=1/0,s){if(t<=0||!ct(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Bt(e))Da(e.value,t,s);else if(Ee(e))for(let a=0;a<e.length;a++)Da(e[a],t,s);else if(Bn(e)||ui(e))e.forEach(a=>{Da(a,t,s)});else if(Jo(e)){for(const a in e)Da(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Da(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Hf=[];function cb(e){Hf.push(e)}function db(){Hf.pop()}function ub(e,t){}const pb={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},fb={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ni(e,t,s,a){try{return a?e(...a):e()}catch(n){zn(n,t,s)}}function Ps(e,t,s,a){if($e(e)){const n=Ni(e,t,s,a);return n&&qc(n)&&n.catch(i=>{zn(i,t,s)}),n}if(Ee(e)){const n=[];for(let i=0;i<e.length;i++)n.push(Ps(e[i],t,s,a));return n}}function zn(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||et;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){ja(),Ni(i,null,10,[e,r,c]),Va();return}}mb(e,s,n,a,l)}function mb(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const ws=[];let fa=-1;const mi=[];let ln=null,ai=0;const zf=Promise.resolve();let _o=null;function Pt(e){const t=_o||zf;return e?t.then(this?e.bind(this):e):t}function hb(e){let t=fa+1,s=ws.length;for(;t<s;){const a=t+s>>>1,n=ws[a],i=pl(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function Xc(e){if(!(e.flags&1)){const t=pl(e),s=ws[ws.length-1];!s||!(e.flags&2)&&t>=pl(s)?ws.push(e):ws.splice(hb(t),0,e),e.flags|=1,jf()}}function jf(){_o||(_o=zf.then(Vf))}function ul(e){Ee(e)?mi.push(...e):ln&&e.id===-1?ln.splice(ai+1,0,e):e.flags&1||(mi.push(e),e.flags|=1),jf()}function iu(e,t,s=fa+1){for(;s<ws.length;s++){const a=ws[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;ws.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function wo(e){if(mi.length){const t=[...new Set(mi)].sort((s,a)=>pl(s)-pl(a));if(mi.length=0,ln){ln.push(...t);return}for(ln=t,ai=0;ai<ln.length;ai++){const s=ln[ai];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}ln=null,ai=0}}const pl=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Vf(e){try{for(fa=0;fa<ws.length;fa++){const t=ws[fa];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ni(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;fa<ws.length;fa++){const t=ws[fa];t&&(t.flags&=-2)}fa=-1,ws.length=0,wo(),_o=null,(ws.length||mi.length)&&Vf()}}let ni,ql=[];function qf(e,t){var s,a;ni=e,ni?(ni.enabled=!0,ql.forEach(({event:n,args:i})=>ni.emit(n,...i)),ql=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{qf(i,t)}),setTimeout(()=>{ni||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,ql=[])},3e3)):ql=[]}let is=null,ir=null;function fl(e){const t=is;return is=e,ir=e&&e.type.__scopeId||null,t}function vb(e){ir=e}function gb(){ir=null}const bb=e=>ed;function ed(e,t=is,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&gl(-1);const i=fl(t);let l;try{l=e(...n)}finally{fl(i),a._d&&gl(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function yb(e,t){if(is===null)return e;const s=Ml(is),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=et]=t[n];i&&($e(i)&&(i={mounted:i,updated:i}),i.deep&&Da(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function ma(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(ja(),Ps(r,s,8,[e.el,o,e,t]),Va())}}function el(e,t){if(ns){let s=ns.provides;const a=ns.parent&&ns.parent.provides;a===s&&(s=ns.provides=Object.create(a)),s[e]=t}}function Ws(e,t,s=!1){const a=Ss();if(a||On){let n=On?On._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&$e(t)?t.call(a&&a.proxy):t}}function xb(){return!!(Ss()||On)}const Gf=Symbol.for("v-scx"),Wf=()=>Ws(Gf);function _b(e,t){return Ll(e,null,t)}function wb(e,t){return Ll(e,null,{flush:"post"})}function Kf(e,t){return Ll(e,null,{flush:"sync"})}function Ht(e,t,s){return Ll(e,t,s)}function Ll(e,t,s=et){const{immediate:a,deep:n,flush:i,once:l}=s,o=Xe({},s),r=t&&a||!t&&i!=="post";let c;if(Pn){if(i==="sync"){const m=Wf();c=m.__watcherHandles||(m.__watcherHandles=[])}else if(!r){const m=()=>{};return m.stop=ls,m.resume=ls,m.pause=ls,m}}const d=ns;o.call=(m,h,g)=>Ps(m,d,h,g);let u=!1;i==="post"?o.scheduler=m=>{$t(m,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(m,h)=>{h?m():Xc(m)}),o.augmentJob=m=>{t&&(m.flags|=4),u&&(m.flags|=2,d&&(m.id=d.uid,m.i=d))};const p=rb(e,t,o);return Pn&&(c?c.push(p):r&&p()),p}function kb(e,t,s){const a=this.proxy,n=je(e)?e.includes(".")?Jf(a,e):()=>a[e]:e.bind(a,a);let i;$e(t)?i=t:(i=t.handler,s=t);const l=Di(this),o=Ll(n,i.bind(a),s);return l(),o}function Jf(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const sn=new WeakMap,Zf=Symbol("_vte"),Yf=e=>e.__isTeleport,Cn=e=>e&&(e.disabled||e.disabled===""),Sb=e=>e&&(e.defer||e.defer===""),lu=e=>typeof SVGElement<"u"&&e instanceof SVGElement,ou=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,oc=(e,t)=>{const s=e&&e.to;return je(s)?t?t(s):null:s},Tb={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:m,querySelector:h,createText:g,createComment:A,parentNode:I}}=c,y=Cn(t.props);let{dynamicChildren:v}=t;const b=(E,C,_)=>{E.shapeFlag&16&&d(E.children,C,_,n,i,l,o,r)},x=(E=t)=>{const C=Cn(E.props),_=E.target=oc(E.props,h),R=rc(_,E,g,m);_&&(l!=="svg"&&lu(_)?l="svg":l!=="mathml"&&ou(_)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(_),C||(b(E,_,R),Wi(E,!1)))},w=E=>{const C=()=>{if(sn.get(E)===C){if(sn.delete(E),Cn(E.props)){const _=I(E.el)||s;b(E,_,E.anchor),Wi(E,!0)}x(E)}};sn.set(E,C),$t(C,i)};if(e==null){const E=t.el=g(""),C=t.anchor=g("");if(m(E,s,a),m(C,s,a),Sb(t.props)||i&&i.pendingBranch){w(t);return}y&&(b(t,s,C),Wi(t,!0)),x()}else{t.el=e.el;const E=t.anchor=e.anchor,C=sn.get(e);if(C){C.flags|=8,sn.delete(e),w(t);return}t.targetStart=e.targetStart;const _=t.target=e.target,R=t.targetAnchor=e.targetAnchor,U=Cn(e.props),S=U?s:_,P=U?E:R;if(l==="svg"||lu(_)?l="svg":(l==="mathml"||ou(_))&&(l="mathml"),v?(p(e.dynamicChildren,v,S,n,i,l,o),ud(e,t,!0)):r||u(e,t,S,P,n,i,l,o,!1),y)U?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Gl(t,s,E,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Y=t.target=oc(t.props,h);Y&&Gl(t,Y,null,c,0)}else U&&Gl(t,_,R,c,1);Wi(t,y)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,m=i||!Cn(p),h=sn.get(e);if(h&&(h.flags|=8,sn.delete(e)),u&&(n(c),n(d)),i&&n(r),!h&&l&16)for(let g=0;g<o.length;g++){const A=o[g];a(A,t,s,m,!!A.dynamicChildren)}},move:Gl,hydrate:Cb};function Gl(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!sn.has(e)&&(!u||Cn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function Cb(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(A,I){let y=I;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,A._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function m(A,I){I.anchor=u(l(A),I,o(A),s,a,n,i)}const h=t.target=oc(t.props,r),g=Cn(t.props);if(h){const A=h._lpa||h.firstChild;t.shapeFlag&16&&(g?(m(e,t),p(h,A),t.targetAnchor||rc(h,t,d,c,o(e)===h?e:null)):(t.anchor=l(e),p(h,A),t.targetAnchor||rc(h,t,d,c),u(A&&l(A),t,h,s,a,n,i))),Wi(t,g)}else g&&t.shapeFlag&16&&(m(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Eb=Tb;function Wi(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function rc(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Zf]=l,e&&(a(i,e,n),a(l,e,n)),l}const js=Symbol("_leaveCb"),Fi=Symbol("_enterCb");function td(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Qe(()=>{e.isMounted=!0}),cr(()=>{e.isUnmounting=!0}),e}const zs=[Function,Array],sd={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:zs,onEnter:zs,onAfterEnter:zs,onEnterCancelled:zs,onBeforeLeave:zs,onLeave:zs,onAfterLeave:zs,onLeaveCancelled:zs,onBeforeAppear:zs,onAppear:zs,onAfterAppear:zs,onAppearCancelled:zs},Qf=e=>{const t=e.subTree;return t.component?Qf(t.component):t},Ab={name:"BaseTransition",props:sd,setup(e,{slots:t}){const s=Ss(),a=td();return()=>{const n=t.default&&lr(t.default(),!0),i=n&&n.length?Xf(n):s.subTree?Mm():void 0;if(!i)return;const l=at(e),{mode:o}=l;if(a.isLeaving)return Nr(i);const r=ru(i);if(!r)return Nr(i);let c=_i(r,l,a,s,u=>c=u);r.type!==Ft&&qa(r,c);let d=s.subTree&&ru(s.subTree);if(d&&d.type!==Ft&&!aa(d,r)&&Qf(s).type!==Ft){let u=_i(d,l,a,s);if(qa(d,u),o==="out-in"&&r.type!==Ft)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Nr(i);o==="in-out"&&r.type!==Ft?u.delayLeave=(p,m,h)=>{const g=tm(a,d);g[String(d.key)]=d,p[js]=()=>{m(),p[js]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{h(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Xf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Ft){t=s;break}}return t}const em=Ab;function tm(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function _i(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:m,onAfterLeave:h,onLeaveCancelled:g,onBeforeAppear:A,onAppear:I,onAfterAppear:y,onAppearCancelled:v}=t,b=String(e.key),x=tm(s,e),w=(_,R)=>{_&&Ps(_,a,9,R)},E=(_,R)=>{const U=R[1];w(_,R),Ee(_)?_.every(S=>S.length<=1)&&U():_.length<=1&&U()},C={mode:l,persisted:o,beforeEnter(_){let R=r;if(!s.isMounted)if(i)R=A||r;else return;_[js]&&_[js](!0);const U=x[b];U&&aa(e,U)&&U.el[js]&&U.el[js](),w(R,[_])},enter(_){if(x[b]===e)return;let R=c,U=d,S=u;if(!s.isMounted)if(i)R=I||c,U=y||d,S=v||u;else return;let P=!1;_[Fi]=W=>{P||(P=!0,W?w(S,[_]):w(U,[_]),C.delayedLeave&&C.delayedLeave(),_[Fi]=void 0)};const Y=_[Fi].bind(null,!1);R?E(R,[_,Y]):Y()},leave(_,R){const U=String(e.key);if(_[Fi]&&_[Fi](!0),s.isUnmounting)return R();w(p,[_]);let S=!1;_[js]=Y=>{S||(S=!0,R(),Y?w(g,[_]):w(h,[_]),_[js]=void 0,x[U]===e&&delete x[U])};const P=_[js].bind(null,!1);x[U]=e,m?E(m,[_,P]):P()},clone(_){const R=_i(_,t,s,a,n);return n&&n(R),R}};return C}function Nr(e){if(Dl(e))return e=ba(e),e.children=null,e}function ru(e){if(!Dl(e))return Yf(e.type)&&e.children?Xf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&$e(s.default))return s.default()}}function qa(e,t){e.shapeFlag&6&&e.component?(e.transition=t,qa(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function lr(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Qt?(l.patchFlag&128&&n++,a=a.concat(lr(l.children,t,o))):(t||l.type!==Ft)&&a.push(o!=null?ba(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function Nl(e,t){return $e(e)?Xe({name:e.name},t,{setup:e}):e}function Rb(){const e=Ss();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function ad(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Ib(e){const t=Ss(),s=Yc(null);if(t){const n=t.refs===et?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function cu(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const ko=new WeakMap;function hi(e,t,s,a,n=!1){if(Ee(e)){e.forEach((g,A)=>hi(g,t&&(Ee(t)?t[A]:t),s,a,n));return}if(Ba(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&hi(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?Ml(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===et?o.refs={}:o.refs,u=o.setupState,p=at(u),m=u===et?oi:g=>cu(d,g)?!1:pt(p,g),h=(g,A)=>!(A&&cu(d,A));if(c!=null&&c!==r){if(du(t),je(c))d[c]=null,m(c)&&(u[c]=null);else if(Bt(c)){const g=t;h(c,g.k)&&(c.value=null),g.k&&(d[g.k]=null)}}if($e(r))Ni(r,o,12,[l,d]);else{const g=je(r),A=Bt(r);if(g||A){const I=()=>{if(e.f){const y=g?m(r)?u[r]:d[r]:h()||!e.k?r.value:d[e.k];if(n)Ee(y)&&Vc(y,i);else if(Ee(y))y.includes(i)||y.push(i);else if(g)d[r]=[i],m(r)&&(u[r]=d[r]);else{const v=[i];h(r,e.k)&&(r.value=v),e.k&&(d[e.k]=v)}}else g?(d[r]=l,m(r)&&(u[r]=l)):A&&(h(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{I(),ko.delete(e)};y.id=-1,ko.set(e,y),$t(y,s)}else du(e),I()}}}function du(e){const t=ko.get(e);t&&(t.flags|=8,ko.delete(e))}let uu=!1;const Qn=()=>{uu||(console.error("Hydration completed but contains mismatches."),uu=!0)},Ob=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Lb=e=>e.namespaceURI.includes("MathML"),Wl=e=>{if(e.nodeType===1){if(Ob(e))return"svg";if(Lb(e))return"mathml"}},ri=e=>e.nodeType===8;function Nb(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(v,b)=>{if(!b.hasChildNodes()){s(null,v,b),wo(),b._vnode=v;return}u(b.firstChild,v,null,null,null),wo(),b._vnode=v},u=(v,b,x,w,E,C=!1)=>{C=C||!!b.dynamicChildren;const _=ri(v)&&v.data==="[",R=()=>g(v,b,x,w,E,_),{type:U,ref:S,shapeFlag:P,patchFlag:Y}=b;let W=v.nodeType;b.el=v,Y===-2&&(C=!1,b.dynamicChildren=null);let D=null;switch(U){case dn:W!==3?b.children===""?(r(b.el=n(""),l(v),v),D=v):D=R():(v.data!==b.children&&(Qn(),v.data=b.children),D=i(v));break;case Ft:y(v)?(D=i(v),I(b.el=v.content.firstChild,v,x)):W!==8||_?D=R():D=i(v);break;case Ln:if(_&&(v=i(v),W=v.nodeType),W===1||W===3){D=v;const O=!b.children.length;for(let M=0;M<b.staticCount;M++)O&&(b.children+=D.nodeType===1?D.outerHTML:D.data),M===b.staticCount-1&&(b.anchor=D),D=i(D);return _?i(D):D}else R();break;case Qt:_?D=h(v,b,x,w,E,C):D=R();break;default:if(P&1)(W!==1||b.type.toLowerCase()!==v.tagName.toLowerCase())&&!y(v)?D=R():D=p(v,b,x,w,E,C);else if(P&6){b.slotScopeIds=E;const O=l(v);if(_?D=A(v):ri(v)&&v.data==="teleport start"?D=A(v,v.data,"teleport end"):D=i(v),t(b,O,null,x,w,Wl(O),C),Ba(b)&&!b.type.__asyncResolved){let M;_?(M=Et(Qt),M.anchor=D?D.previousSibling:O.lastChild):M=v.nodeType===3?fd(""):Et("div"),M.el=v,b.component.subTree=M}}else P&64?W!==8?D=R():D=b.type.hydrate(v,b,x,w,E,C,e,m):P&128&&(D=b.type.hydrate(v,b,x,w,Wl(l(v)),E,C,e,u))}return S!=null&&hi(S,null,w,b),D},p=(v,b,x,w,E,C)=>{C=C||!!b.dynamicChildren;const{type:_,props:R,patchFlag:U,shapeFlag:S,dirs:P,transition:Y}=b,W=_==="input"||_==="option";if(W||U!==-1){P&&ma(b,null,x,"created");let D=!1;if(y(v)){D=Cm(null,Y)&&x&&x.vnode.props&&x.vnode.props.appear;const M=v.content.firstChild;if(D){const ae=M.getAttribute("class");ae&&(M.$cls=ae),Y.beforeEnter(M)}I(M,v,x),b.el=v=M}if(S&16&&!(R&&(R.innerHTML||R.textContent))){let M=m(v.firstChild,b,v,x,w,E,C);for(M&&!Kl(v,1)&&Qn();M;){const ae=M;M=M.nextSibling,o(ae)}}else if(S&8){let M=b.children;M[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(M=M.slice(1));const{textContent:ae}=v;ae!==M&&ae!==M.replace(/\r\n|\r/g,`
`)&&(Kl(v,0)||Qn(),v.textContent=b.children)}if(R){if(W||!C||U&48){const M=v.tagName.includes("-");for(const ae in R)(W&&(ae.endsWith("value")||ae==="indeterminate")||Un(ae)&&!$a(ae)||ae[0]==="."||M&&!$a(ae))&&a(v,ae,null,R[ae],void 0,x)}else if(R.onClick)a(v,"onClick",null,R.onClick,void 0,x);else if(U&4&&Ua(R.style))for(const M in R.style)R.style[M]}let O;(O=R&&R.onVnodeBeforeMount)&&Es(O,x,b),P&&ma(b,null,x,"beforeMount"),((O=R&&R.onVnodeMounted)||P||D)&&Im(()=>{O&&Es(O,x,b),D&&Y.enter(v),P&&ma(b,null,x,"mounted")},w)}return v.nextSibling},m=(v,b,x,w,E,C,_)=>{_=_||!!b.dynamicChildren;const R=b.children,U=R.length;let S=!1;for(let P=0;P<U;P++){const Y=_?R[P]:R[P]=Rs(R[P]),W=Y.type===dn;v?(W&&!_&&P+1<U&&Rs(R[P+1]).type===dn&&(r(n(v.data.slice(Y.children.length)),x,i(v)),v.data=Y.children),v=u(v,Y,w,E,C,_)):W&&!Y.children?r(Y.el=n(""),x):(S||(S=!0,Kl(x,1)||Qn()),s(null,Y,x,null,w,E,Wl(x),C))}return v},h=(v,b,x,w,E,C)=>{const{slotScopeIds:_}=b;_&&(E=E?E.concat(_):_);const R=l(v),U=m(i(v),b,R,x,w,E,C);return U&&ri(U)&&U.data==="]"?i(b.anchor=U):(Qn(),r(b.anchor=c("]"),R,U),U)},g=(v,b,x,w,E,C)=>{if(Kl(v.parentElement,1)||Qn(),b.el=null,C){const U=A(v);for(;;){const S=i(v);if(S&&S!==U)o(S);else break}}const _=i(v),R=l(v);return o(v),s(null,b,R,_,x,w,Wl(R),E),x&&(x.vnode.el=b.el,ur(x,b.el)),_},A=(v,b="[",x="]")=>{let w=0;for(;v;)if(v=i(v),v&&ri(v)&&(v.data===b&&w++,v.data===x)){if(w===0)return i(v);w--}return v},I=(v,b,x)=>{const w=b.parentNode;w&&w.replaceChild(v,b);let E=x;for(;E;)E.vnode.el===b&&(E.vnode.el=E.subTree.el=v),E=E.parent},y=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[d,u]}const pu="data-allow-mismatch",Db={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Kl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(pu);)e=e.parentElement;const s=e&&e.getAttribute(pu);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(Db[t])}}const Mb=Xo().requestIdleCallback||(e=>setTimeout(e,1)),Pb=Xo().cancelIdleCallback||(e=>clearTimeout(e)),Fb=(e=1e4)=>t=>{const s=Mb(t,{timeout:e});return()=>Pb(s)};function $b(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const Ub=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if($b(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},Bb=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Hb=(e=[])=>(t,s)=>{je(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function zb(e,t){if(ri(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(ri(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const Ba=e=>!!e.type.__asyncLoader;function jb(e){$e(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,m()),m=()=>{let h;return c||(h=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),r)return new Promise((A,I)=>{r(g,()=>A(p()),()=>I(g),u+1)});throw g}).then(g=>h!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),d=g,g)))};return Nl({name:"AsyncComponentWrapper",__asyncLoader:m,__asyncHydrate(h,g,A){let I=!1;(g.bu||(g.bu=[])).push(()=>I=!0);const y=()=>{I||A()},v=i?()=>{const b=i(y,x=>zb(h,x));b&&(g.bum||(g.bum=[])).push(b)}:y;d?v():m().then(()=>!g.isUnmounted&&v())},get __asyncResolved(){return d},setup(){const h=ns;if(ad(h),d)return()=>Jl(d,h);const g=x=>{c=null,zn(x,h,13,!a)};if(o&&h.suspense||Pn)return m().then(x=>()=>Jl(x,h)).catch(x=>(g(x),()=>a?Et(a,{error:x}):null));const A=f(!1),I=f(),y=f(!!n);let v,b;return gt(()=>{v!=null&&clearTimeout(v),b!=null&&clearTimeout(b)}),n&&(b=setTimeout(()=>{h.isUnmounted||(y.value=!1)},n)),l!=null&&(v=setTimeout(()=>{if(!h.isUnmounted&&!A.value&&!I.value){const x=new Error(`Async component timed out after ${l}ms.`);g(x),I.value=x}},l)),m().then(()=>{h.isUnmounted||(A.value=!0,h.parent&&Dl(h.parent.vnode)&&h.parent.update())}).catch(x=>{if(h.isUnmounted){c=null;return}g(x),I.value=x}),()=>{if(A.value&&d)return Jl(d,h);if(I.value&&a)return Et(a,{error:I.value});if(s&&!y.value)return Jl(s,h)}}})}function Jl(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=Et(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Dl=e=>e.type.__isKeepAlive,Vb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Ss(),a=s.ctx;if(!a.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(y,v,b,x,w)=>{const E=y.component;c(y,v,b,0,o),r(E.vnode,y,v,b,E,o,x,y.slotScopeIds,w),$t(()=>{E.isDeactivated=!1,E.a&&fi(E.a);const C=y.props&&y.props.onVnodeMounted;C&&Es(C,E.parent,y)},o)},a.deactivate=y=>{const v=y.component;To(v.m),To(v.a),c(y,p,null,1,o),$t(()=>{v.da&&fi(v.da);const b=y.props&&y.props.onVnodeUnmounted;b&&Es(b,v.parent,y),v.isDeactivated=!0},o)};function m(y){Dr(y),d(y,s,o,!0)}function h(y){n.forEach((v,b)=>{const x=gc(Ba(v)?v.type.__asyncResolved||{}:v.type);x&&!y(x)&&g(b)})}function g(y){const v=n.get(y);v&&(!l||!aa(v,l))?m(v):l&&Dr(l),n.delete(y),i.delete(y)}Ht(()=>[e.include,e.exclude],([y,v])=>{y&&h(b=>Ki(y,b)),v&&h(b=>!Ki(v,b))},{flush:"post",deep:!0});let A=null;const I=()=>{A!=null&&(Co(s.subTree.type)?$t(()=>{n.set(A,Zl(s.subTree))},s.subTree.suspense):n.set(A,Zl(s.subTree)))};return Qe(I),rr(I),cr(()=>{n.forEach(y=>{const{subTree:v,suspense:b}=s,x=Zl(v);if(y.type===x.type&&y.key===x.key){Dr(x);const w=x.component.da;w&&$t(w,b);return}m(y)})}),()=>{if(A=null,!t.default)return l=null;const y=t.default(),v=y[0];if(y.length>1)return l=null,y;if(!Ga(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let b=Zl(v);if(b.type===Ft)return l=null,b;const x=b.type,w=gc(Ba(b)?b.type.__asyncResolved||{}:x),{include:E,exclude:C,max:_}=e;if(E&&(!w||!Ki(E,w))||C&&w&&Ki(C,w))return b.shapeFlag&=-257,l=b,v;const R=b.key==null?x:b.key,U=n.get(R);return b.el&&(b=ba(b),v.shapeFlag&128&&(v.ssContent=b)),A=R,U?(b.el=U.el,b.component=U.component,b.transition&&qa(b,b.transition),b.shapeFlag|=512,i.delete(R),i.add(R)):(i.add(R),_&&i.size>parseInt(_,10)&&g(i.values().next().value)),b.shapeFlag|=256,l=b,Co(v.type)?v:b}}},qb=Vb;function Ki(e,t){return Ee(e)?e.some(s=>Ki(s,t)):je(e)?e.split(",").includes(t):tg(e)?(e.lastIndex=0,e.test(t)):!1}function os(e,t){sm(e,"a",t)}function Wt(e,t){sm(e,"da",t)}function sm(e,t,s=ns){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(or(t,a,s),s){let n=s.parent;for(;n&&n.parent;)Dl(n.parent.vnode)&&Gb(a,t,s,n),n=n.parent}}function Gb(e,t,s,a){const n=or(t,e,a,!0);gt(()=>{Vc(a[t],n)},s)}function Dr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Zl(e){return e.shapeFlag&128?e.ssContent:e}function or(e,t,s=ns,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{ja();const o=Di(s),r=Ps(t,s,e,l);return o(),Va(),r});return a?n.unshift(i):n.push(i),i}}const Wa=e=>(t,s=ns)=>{(!Pn||e==="sp")&&or(e,(...a)=>t(...a),s)},am=Wa("bm"),Qe=Wa("m"),nd=Wa("bu"),rr=Wa("u"),cr=Wa("bum"),gt=Wa("um"),nm=Wa("sp"),im=Wa("rtg"),lm=Wa("rtc");function om(e,t=ns){or("ec",e,t)}const id="components",Wb="directives";function Kb(e,t){return ld(id,e,!0,t)||e}const rm=Symbol.for("v-ndc");function Jb(e){return je(e)?ld(id,e,!1)||e:e||rm}function Zb(e){return ld(Wb,e)}function ld(e,t,s=!0,a=!1){const n=is||ns;if(n){const i=n.type;if(e===id){const o=gc(i,!1);if(o&&(o===t||o===bt(t)||o===Hn(bt(t))))return i}const l=fu(n[e]||i[e],t)||fu(n.appContext[e],t);return!l&&a?i:l}}function fu(e,t){return e&&(e[t]||e[bt(t)]||e[Hn(bt(t))])}function Yb(e,t,s,a){let n;const i=s&&s[a],l=Ee(e);if(l||je(e)){const o=l&&Ua(e);let r=!1,c=!1;o&&(r=!Ls(e),c=ga(e),e=sr(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?xi(la(e[d])):la(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(ct(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function Qb(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Ee(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function Xb(e,t,s={},a,n){if(is.ce||is.parent&&Ba(is.parent)&&is.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),vl(),Eo(Qt,null,[Et("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),vl();const l=i&&od(i(s)),o=s.key||l&&l.key,r=Eo(Qt,{key:(o&&!ms(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function od(e){return e.some(t=>Ga(t)?!(t.type===Ft||t.type===Qt&&!od(t.children)):!0)?e:null}function ey(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:pi(a)]=e[a];return s}const cc=e=>e?$m(e)?Ml(e):cc(e.parent):null,tl=Xe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>cc(e.parent),$root:e=>cc(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>rd(e),$forceUpdate:e=>e.f||(e.f=()=>{Xc(e.update)}),$nextTick:e=>e.n||(e.n=Pt.bind(e.proxy)),$watch:e=>kb.bind(e)}),Mr=(e,t)=>e!==et&&!e.__isScriptSetup&&pt(e,t),dc={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(Mr(a,t))return l[t]=1,a[t];if(n!==et&&pt(n,t))return l[t]=2,n[t];if(pt(i,t))return l[t]=3,i[t];if(s!==et&&pt(s,t))return l[t]=4,s[t];uc&&(l[t]=0)}}const c=tl[t];let d,u;if(c)return t==="$attrs"&&us(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==et&&pt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,pt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return Mr(n,t)?(n[t]=s,!0):a!==et&&pt(a,t)?(a[t]=s,!0):pt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==et&&o[0]!=="$"&&pt(e,o)||Mr(t,o)||pt(i,o)||pt(a,o)||pt(tl,o)||pt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:pt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},ty=Xe({},dc,{get(e,t){if(t!==Symbol.unscopables)return dc.get(e,t,e)},has(e,t){return t[0]!=="_"&&!rg(t)}});function sy(){return null}function ay(){return null}function ny(e){}function iy(e){}function ly(){return null}function oy(){}function ry(e,t){return null}function cy(){return cm().slots}function dy(){return cm().attrs}function cm(e){const t=Ss();return t.setupContext||(t.setupContext=zm(t))}function ml(e){return Ee(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function uy(e,t){const s=ml(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Ee(n)||$e(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function py(e,t){return!e||!t?e||t:Ee(e)&&Ee(t)?e.concat(t):Xe({},ml(e),ml(t))}function fy(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function my(e){const t=Ss(),s=Pn;let a=e();bl(),s&&gi(!1);const n=()=>{Di(t),s&&gi(!0)},i=()=>{Ss()!==t&&t.scope.off(),bl(),s&&gi(!1)};return qc(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let uc=!0;function hy(e){const t=rd(e),s=e.proxy,a=e.ctx;uc=!1,t.beforeCreate&&mu(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:m,updated:h,activated:g,deactivated:A,beforeDestroy:I,beforeUnmount:y,destroyed:v,unmounted:b,render:x,renderTracked:w,renderTriggered:E,errorCaptured:C,serverPrefetch:_,expose:R,inheritAttrs:U,components:S,directives:P,filters:Y}=t;if(c&&vy(c,a,null),l)for(const O in l){const M=l[O];$e(M)&&(a[O]=M.bind(s))}if(n){const O=n.call(s,s);ct(O)&&(e.data=fn(O))}if(uc=!0,i)for(const O in i){const M=i[O],ae=$e(M)?M.bind(s,s):$e(M.get)?M.get.bind(s,s):ls,ie=!$e(M)&&$e(M.set)?M.set.bind(s):ls,B=j({get:ae,set:ie});Object.defineProperty(a,O,{enumerable:!0,configurable:!0,get:()=>B.value,set:Z=>B.value=Z})}if(o)for(const O in o)dm(o[O],a,s,O);if(r){const O=$e(r)?r.call(s):r;Reflect.ownKeys(O).forEach(M=>{el(M,O[M])})}d&&mu(d,e,"c");function D(O,M){Ee(M)?M.forEach(ae=>O(ae.bind(s))):M&&O(M.bind(s))}if(D(am,u),D(Qe,p),D(nd,m),D(rr,h),D(os,g),D(Wt,A),D(om,C),D(lm,w),D(im,E),D(cr,y),D(gt,b),D(nm,_),Ee(R))if(R.length){const O=e.exposed||(e.exposed={});R.forEach(M=>{Object.defineProperty(O,M,{get:()=>s[M],set:ae=>s[M]=ae,enumerable:!0})})}else e.exposed||(e.exposed={});x&&e.render===ls&&(e.render=x),U!=null&&(e.inheritAttrs=U),S&&(e.components=S),P&&(e.directives=P),_&&ad(e)}function vy(e,t,s=ls){Ee(e)&&(e=pc(e));for(const a in e){const n=e[a];let i;ct(n)?"default"in n?i=Ws(n.from||a,n.default,!0):i=Ws(n.from||a):i=Ws(n),Bt(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function mu(e,t,s){Ps(Ee(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function dm(e,t,s,a){let n=a.includes(".")?Jf(s,a):()=>s[a];if(je(e)){const i=t[e];$e(i)&&Ht(n,i)}else if($e(e))Ht(n,e.bind(s));else if(ct(e))if(Ee(e))e.forEach(i=>dm(i,t,s,a));else{const i=$e(e.handler)?e.handler.bind(s):t[e.handler];$e(i)&&Ht(n,i,e)}}function rd(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>So(r,c,l,!0)),So(r,t,l)),ct(t)&&i.set(t,r),r}function So(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&So(e,i,s,!0),n&&n.forEach(l=>So(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=gy[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const gy={data:hu,props:vu,emits:vu,methods:Ji,computed:Ji,beforeCreate:ys,created:ys,beforeMount:ys,mounted:ys,beforeUpdate:ys,updated:ys,beforeDestroy:ys,beforeUnmount:ys,destroyed:ys,unmounted:ys,activated:ys,deactivated:ys,errorCaptured:ys,serverPrefetch:ys,components:Ji,directives:Ji,watch:yy,provide:hu,inject:by};function hu(e,t){return t?e?function(){return Xe($e(e)?e.call(this,this):e,$e(t)?t.call(this,this):t)}:t:e}function by(e,t){return Ji(pc(e),pc(t))}function pc(e){if(Ee(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function ys(e,t){return e?[...new Set([].concat(e,t))]:t}function Ji(e,t){return e?Xe(Object.create(null),e,t):t}function vu(e,t){return e?Ee(e)&&Ee(t)?[...new Set([...e,...t])]:Xe(Object.create(null),ml(e),ml(t??{})):t}function yy(e,t){if(!e)return t;if(!t)return e;const s=Xe(Object.create(null),e);for(const a in t)s[a]=ys(e[a],t[a]);return s}function um(){return{app:null,config:{isNativeTag:oi,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let xy=0;function _y(e,t){return function(a,n=null){$e(a)||(a=Xe({},a)),n!=null&&!ct(n)&&(n=null);const i=um(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:xy++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Vm,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&$e(d.install)?(l.add(d),d.install(c,...u)):$e(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const m=c._ceVNode||Et(a,n);return m.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(m,d):e(m,d,p),r=!0,c._container=d,d.__vue_app__=c,Ml(m.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Ps(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=On;On=c;try{return d()}finally{On=u}}};return c}}let On=null;function wy(e,t,s=et){const a=Ss(),n=bt(t),i=Is(t),l=pm(e,n),o=$f((r,c)=>{let d,u=et,p;return Kf(()=>{const m=e[n];Yt(d,m)&&(d=m,c())}),{get(){return r(),s.get?s.get(d):d},set(m){const h=s.set?s.set(m):m;if(!Yt(h,d)&&!(u!==et&&Yt(m,u)))return;const g=a.vnode.props,A=!!(g&&(t in g||n in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${n}`in g||`onUpdate:${i}`in g));A||(d=m,c()),a.emit(`update:${t}`,h),Yt(m,u)&&(Yt(m,h)&&!Yt(h,p)||A&&u!==et&&!Yt(h,d))&&c(),u=m,p=h}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||et:o,done:!1}:{done:!0}}}},o}const pm=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${bt(t)}Modifiers`]||e[`${Is(t)}Modifiers`];function ky(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||et;let n=s;const i=t.startsWith("update:"),l=i&&pm(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>je(d)?d.trim():d)),l.number&&(n=s.map(Qo)));let o,r=a[o=pi(t)]||a[o=pi(bt(t))];!r&&i&&(r=a[o=pi(Is(t))]),r&&Ps(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Ps(c,e,6,n)}}const Sy=new WeakMap;function fm(e,t,s=!1){const a=s?Sy:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!$e(e)){const r=c=>{const d=fm(c,t,!0);d&&(o=!0,Xe(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(ct(e)&&a.set(e,null),null):(Ee(i)?i.forEach(r=>l[r]=null):Xe(l,i),ct(e)&&a.set(e,l),l)}function dr(e,t){return!e||!Un(t)?!1:(t=t.slice(2).replace(/Once$/,""),pt(e,t[0].toLowerCase()+t.slice(1))||pt(e,Is(t))||pt(e,t))}function ro(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:m,ctx:h,inheritAttrs:g}=e,A=fl(e);let I,y;try{if(s.shapeFlag&4){const b=n||a,x=b;I=Rs(c.call(x,b,d,u,m,p,h)),y=o}else{const b=t;I=Rs(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:Cy(o)}}catch(b){sl.length=0,zn(b,e,1),I=Et(Ft)}let v=I;if(y&&g!==!1){const b=Object.keys(y),{shapeFlag:x}=v;b.length&&x&7&&(i&&b.some(Ko)&&(y=Ey(y,i)),v=ba(v,y,!1,!0))}return s.dirs&&(v=ba(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&qa(v,s.transition),I=v,fl(A),I}function Ty(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if(Ga(n)){if(n.type!==Ft||n.children==="v-if"){if(s)return;s=n}}else return}return s}const Cy=e=>{let t;for(const s in e)(s==="class"||s==="style"||Un(s))&&((t||(t={}))[s]=e[s]);return t},Ey=(e,t)=>{const s={};for(const a in e)(!Ko(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function Ay(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?gu(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(mm(l,a,p)&&!dr(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?gu(a,l,c):!0:!!l;return!1}function gu(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(mm(t,e,i)&&!dr(s,i))return!0}return!1}function mm(e,t,s){const a=e[s],n=t[s];return s==="style"&&ct(a)&&ct(n)?!za(a,n):a!==n}function ur({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const hm={},vm=()=>Object.create(hm),gm=e=>Object.getPrototypeOf(e)===hm;function Ry(e,t,s,a=!1){const n={},i=vm();e.propsDefaults=Object.create(null),bm(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Zc(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function Iy(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=at(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(dr(e.emitsOptions,p))continue;const m=t[p];if(r)if(pt(i,p))m!==i[p]&&(i[p]=m,c=!0);else{const h=bt(p);n[h]=fc(r,o,h,m,e,!1)}else m!==i[p]&&(i[p]=m,c=!0)}}}else{bm(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!pt(t,u)&&((d=Is(u))===u||!pt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=fc(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!pt(t,u))&&(delete i[u],c=!0)}c&&Na(e.attrs,"set","")}function bm(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if($a(r))continue;const c=t[r];let d;n&&pt(n,d=bt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:dr(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=at(s),c=o||et;for(let d=0;d<i.length;d++){const u=i[d];s[u]=fc(n,r,u,c[u],e,!pt(c,u))}}return l}function fc(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=pt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&$e(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=Di(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===Is(s))&&(a=!0))}return a}const Oy=new WeakMap;function ym(e,t,s=!1){const a=s?Oy:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!$e(e)){const d=u=>{r=!0;const[p,m]=ym(u,t,!0);Xe(l,p),m&&o.push(...m)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return ct(e)&&a.set(e,di),di;if(Ee(i))for(let d=0;d<i.length;d++){const u=bt(i[d]);bu(u)&&(l[u]=et)}else if(i)for(const d in i){const u=bt(d);if(bu(u)){const p=i[d],m=l[u]=Ee(p)||$e(p)?{type:p}:Xe({},p),h=m.type;let g=!1,A=!0;if(Ee(h))for(let I=0;I<h.length;++I){const y=h[I],v=$e(y)&&y.name;if(v==="Boolean"){g=!0;break}else v==="String"&&(A=!1)}else g=$e(h)&&h.name==="Boolean";m[0]=g,m[1]=A,(g||pt(m,"default"))&&o.push(u)}}const c=[l,o];return ct(e)&&a.set(e,c),c}function bu(e){return e[0]!=="$"&&!$a(e)}const cd=e=>e==="_"||e==="_ctx"||e==="$stable",dd=e=>Ee(e)?e.map(Rs):[Rs(e)],Ly=(e,t,s)=>{if(t._n)return t;const a=ed((...n)=>dd(t(...n)),s);return a._c=!1,a},xm=(e,t,s)=>{const a=e._ctx;for(const n in e){if(cd(n))continue;const i=e[n];if($e(i))t[n]=Ly(n,i,a);else if(i!=null){const l=dd(i);t[n]=()=>l}}},_m=(e,t)=>{const s=dd(t);e.slots.default=()=>s},wm=(e,t,s)=>{for(const a in t)(s||!cd(a))&&(e[a]=t[a])},Ny=(e,t,s)=>{const a=e.slots=vm();if(e.vnode.shapeFlag&32){const n=t._;n?(wm(a,t,s),s&&mf(a,"_",n,!0)):xm(t,a)}else t&&_m(e,t)},Dy=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=et;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:wm(n,t,s):(i=!t.$stable,xm(t,n)),l=t}else t&&(_m(e,t),l={default:1});if(i)for(const o in n)!cd(o)&&l[o]==null&&delete n[o]},$t=Im;function km(e){return Tm(e)}function Sm(e){return Tm(e,Nb)}function Tm(e,t){const s=Xo();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:m=ls,insertStaticContent:h}=e,g=(T,N,V,pe=null,$=null,J=null,ue=void 0,H=null,ee=!!N.dynamicChildren)=>{if(T===N)return;T&&!aa(T,N)&&(pe=K(T),Z(T,$,J,!0),T=null),N.patchFlag===-2&&(ee=!1,N.dynamicChildren=null);const{type:Q,ref:ve,shapeFlag:oe}=N;switch(Q){case dn:A(T,N,V,pe);break;case Ft:I(T,N,V,pe);break;case Ln:T==null&&y(N,V,pe,ue);break;case Qt:S(T,N,V,pe,$,J,ue,H,ee);break;default:oe&1?x(T,N,V,pe,$,J,ue,H,ee):oe&6?P(T,N,V,pe,$,J,ue,H,ee):(oe&64||oe&128)&&Q.process(T,N,V,pe,$,J,ue,H,ee,ge)}ve!=null&&$?hi(ve,T&&T.ref,J,N||T,!N):ve==null&&T&&T.ref!=null&&hi(T.ref,null,J,T,!0)},A=(T,N,V,pe)=>{if(T==null)a(N.el=o(N.children),V,pe);else{const $=N.el=T.el;N.children!==T.children&&c($,N.children)}},I=(T,N,V,pe)=>{T==null?a(N.el=r(N.children||""),V,pe):N.el=T.el},y=(T,N,V,pe)=>{[T.el,T.anchor]=h(T.children,N,V,pe,T.el,T.anchor)},v=({el:T,anchor:N},V,pe)=>{let $;for(;T&&T!==N;)$=p(T),a(T,V,pe),T=$;a(N,V,pe)},b=({el:T,anchor:N})=>{let V;for(;T&&T!==N;)V=p(T),n(T),T=V;n(N)},x=(T,N,V,pe,$,J,ue,H,ee)=>{if(N.type==="svg"?ue="svg":N.type==="math"&&(ue="mathml"),T==null)w(N,V,pe,$,J,ue,H,ee);else{const Q=T.el&&T.el._isVueCE?T.el:null;try{Q&&Q._beginPatch(),_(T,N,$,J,ue,H,ee)}finally{Q&&Q._endPatch()}}},w=(T,N,V,pe,$,J,ue,H)=>{let ee,Q;const{props:ve,shapeFlag:oe,transition:ye,dirs:Oe}=T;if(ee=T.el=l(T.type,J,ve&&ve.is,ve),oe&8?d(ee,T.children):oe&16&&C(T.children,ee,null,pe,$,Pr(T,J),ue,H),Oe&&ma(T,null,pe,"created"),E(ee,T,T.scopeId,ue,pe),ve){for(const qe in ve)qe!=="value"&&!$a(qe)&&i(ee,qe,null,ve[qe],J,pe);"value"in ve&&i(ee,"value",null,ve.value,J),(Q=ve.onVnodeBeforeMount)&&Es(Q,pe,T)}Oe&&ma(T,null,pe,"beforeMount");const Me=Cm($,ye);Me&&ye.beforeEnter(ee),a(ee,N,V),((Q=ve&&ve.onVnodeMounted)||Me||Oe)&&$t(()=>{try{Q&&Es(Q,pe,T),Me&&ye.enter(ee),Oe&&ma(T,null,pe,"mounted")}finally{}},$)},E=(T,N,V,pe,$)=>{if(V&&m(T,V),pe)for(let J=0;J<pe.length;J++)m(T,pe[J]);if($){let J=$.subTree;if(N===J||Co(J.type)&&(J.ssContent===N||J.ssFallback===N)){const ue=$.vnode;E(T,ue,ue.scopeId,ue.slotScopeIds,$.parent)}}},C=(T,N,V,pe,$,J,ue,H,ee=0)=>{for(let Q=ee;Q<T.length;Q++){const ve=T[Q]=H?Oa(T[Q]):Rs(T[Q]);g(null,ve,N,V,pe,$,J,ue,H)}},_=(T,N,V,pe,$,J,ue)=>{const H=N.el=T.el;let{patchFlag:ee,dynamicChildren:Q,dirs:ve}=N;ee|=T.patchFlag&16;const oe=T.props||et,ye=N.props||et;let Oe;if(V&&_n(V,!1),(Oe=ye.onVnodeBeforeUpdate)&&Es(Oe,V,N,T),ve&&ma(N,T,V,"beforeUpdate"),V&&_n(V,!0),(oe.innerHTML&&ye.innerHTML==null||oe.textContent&&ye.textContent==null)&&d(H,""),Q?R(T.dynamicChildren,Q,H,V,pe,Pr(N,$),J):ue||M(T,N,H,null,V,pe,Pr(N,$),J,!1),ee>0){if(ee&16)U(H,oe,ye,V,$);else if(ee&2&&oe.class!==ye.class&&i(H,"class",null,ye.class,$),ee&4&&i(H,"style",oe.style,ye.style,$),ee&8){const Me=N.dynamicProps;for(let qe=0;qe<Me.length;qe++){const He=Me[qe],Ge=oe[He],Je=ye[He];(Je!==Ge||He==="value")&&i(H,He,Ge,Je,$,V)}}ee&1&&T.children!==N.children&&d(H,N.children)}else!ue&&Q==null&&U(H,oe,ye,V,$);((Oe=ye.onVnodeUpdated)||ve)&&$t(()=>{Oe&&Es(Oe,V,N,T),ve&&ma(N,T,V,"updated")},pe)},R=(T,N,V,pe,$,J,ue)=>{for(let H=0;H<N.length;H++){const ee=T[H],Q=N[H],ve=ee.el&&(ee.type===Qt||!aa(ee,Q)||ee.shapeFlag&198)?u(ee.el):V;g(ee,Q,ve,null,pe,$,J,ue,!0)}},U=(T,N,V,pe,$)=>{if(N!==V){if(N!==et)for(const J in N)!$a(J)&&!(J in V)&&i(T,J,N[J],null,$,pe);for(const J in V){if($a(J))continue;const ue=V[J],H=N[J];ue!==H&&J!=="value"&&i(T,J,H,ue,$,pe)}"value"in V&&i(T,"value",N.value,V.value,$)}},S=(T,N,V,pe,$,J,ue,H,ee)=>{const Q=N.el=T?T.el:o(""),ve=N.anchor=T?T.anchor:o("");let{patchFlag:oe,dynamicChildren:ye,slotScopeIds:Oe}=N;Oe&&(H=H?H.concat(Oe):Oe),T==null?(a(Q,V,pe),a(ve,V,pe),C(N.children||[],V,ve,$,J,ue,H,ee)):oe>0&&oe&64&&ye&&T.dynamicChildren&&T.dynamicChildren.length===ye.length?(R(T.dynamicChildren,ye,V,$,J,ue,H),(N.key!=null||$&&N===$.subTree)&&ud(T,N,!0)):M(T,N,V,ve,$,J,ue,H,ee)},P=(T,N,V,pe,$,J,ue,H,ee)=>{N.slotScopeIds=H,T==null?N.shapeFlag&512?$.ctx.activate(N,V,pe,ue,ee):Y(N,V,pe,$,J,ue,ee):W(T,N,ee)},Y=(T,N,V,pe,$,J,ue)=>{const H=T.component=Fm(T,pe,$);if(Dl(T)&&(H.ctx.renderer=ge),Um(H,!1,ue),H.asyncDep){if($&&$.registerDep(H,D,ue),!T.el){const ee=H.subTree=Et(Ft);I(null,ee,N,V),T.placeholder=ee.el}}else D(H,T,N,V,$,J,ue)},W=(T,N,V)=>{const pe=N.component=T.component;if(Ay(T,N,V))if(pe.asyncDep&&!pe.asyncResolved){O(pe,N,V);return}else pe.next=N,pe.update();else N.el=T.el,pe.vnode=N},D=(T,N,V,pe,$,J,ue)=>{const H=()=>{if(T.isMounted){let{next:oe,bu:ye,u:Oe,parent:Me,vnode:qe}=T;{const Ze=Em(T);if(Ze){oe&&(oe.el=qe.el,O(T,oe,ue)),Ze.asyncDep.then(()=>{$t(()=>{T.isUnmounted||Q()},$)});return}}let He=oe,Ge;_n(T,!1),oe?(oe.el=qe.el,O(T,oe,ue)):oe=qe,ye&&fi(ye),(Ge=oe.props&&oe.props.onVnodeBeforeUpdate)&&Es(Ge,Me,oe,qe),_n(T,!0);const Je=ro(T),lt=T.subTree;T.subTree=Je,g(lt,Je,u(lt.el),K(lt),T,$,J),oe.el=Je.el,He===null&&ur(T,Je.el),Oe&&$t(Oe,$),(Ge=oe.props&&oe.props.onVnodeUpdated)&&$t(()=>Es(Ge,Me,oe,qe),$)}else{let oe;const{el:ye,props:Oe}=N,{bm:Me,m:qe,parent:He,root:Ge,type:Je}=T,lt=Ba(N);if(_n(T,!1),Me&&fi(Me),!lt&&(oe=Oe&&Oe.onVnodeBeforeMount)&&Es(oe,He,N),_n(T,!0),ye&&De){const Ze=()=>{T.subTree=ro(T),De(ye,T.subTree,T,$,null)};lt&&Je.__asyncHydrate?Je.__asyncHydrate(ye,T,Ze):Ze()}else{Ge.ce&&Ge.ce._hasShadowRoot()&&Ge.ce._injectChildStyle(Je,T.parent?T.parent.type:void 0);const Ze=T.subTree=ro(T);g(null,Ze,V,pe,T,$,J),N.el=Ze.el}if(qe&&$t(qe,$),!lt&&(oe=Oe&&Oe.onVnodeMounted)){const Ze=N;$t(()=>Es(oe,He,Ze),$)}(N.shapeFlag&256||He&&Ba(He.vnode)&&He.vnode.shapeFlag&256)&&T.a&&$t(T.a,$),T.isMounted=!0,N=V=pe=null}};T.scope.on();const ee=T.effect=new rl(H);T.scope.off();const Q=T.update=ee.run.bind(ee),ve=T.job=ee.runIfDirty.bind(ee);ve.i=T,ve.id=T.uid,ee.scheduler=()=>Xc(ve),_n(T,!0),Q()},O=(T,N,V)=>{N.component=T;const pe=T.vnode.props;T.vnode=N,T.next=null,Iy(T,N.props,pe,V),Dy(T,N.children,V),ja(),iu(T),Va()},M=(T,N,V,pe,$,J,ue,H,ee=!1)=>{const Q=T&&T.children,ve=T?T.shapeFlag:0,oe=N.children,{patchFlag:ye,shapeFlag:Oe}=N;if(ye>0){if(ye&128){ie(Q,oe,V,pe,$,J,ue,H,ee);return}else if(ye&256){ae(Q,oe,V,pe,$,J,ue,H,ee);return}}Oe&8?(ve&16&&me(Q,$,J),oe!==Q&&d(V,oe)):ve&16?Oe&16?ie(Q,oe,V,pe,$,J,ue,H,ee):me(Q,$,J,!0):(ve&8&&d(V,""),Oe&16&&C(oe,V,pe,$,J,ue,H,ee))},ae=(T,N,V,pe,$,J,ue,H,ee)=>{T=T||di,N=N||di;const Q=T.length,ve=N.length,oe=Math.min(Q,ve);let ye;for(ye=0;ye<oe;ye++){const Oe=N[ye]=ee?Oa(N[ye]):Rs(N[ye]);g(T[ye],Oe,V,null,$,J,ue,H,ee)}Q>ve?me(T,$,J,!0,!1,oe):C(N,V,pe,$,J,ue,H,ee,oe)},ie=(T,N,V,pe,$,J,ue,H,ee)=>{let Q=0;const ve=N.length;let oe=T.length-1,ye=ve-1;for(;Q<=oe&&Q<=ye;){const Oe=T[Q],Me=N[Q]=ee?Oa(N[Q]):Rs(N[Q]);if(aa(Oe,Me))g(Oe,Me,V,null,$,J,ue,H,ee);else break;Q++}for(;Q<=oe&&Q<=ye;){const Oe=T[oe],Me=N[ye]=ee?Oa(N[ye]):Rs(N[ye]);if(aa(Oe,Me))g(Oe,Me,V,null,$,J,ue,H,ee);else break;oe--,ye--}if(Q>oe){if(Q<=ye){const Oe=ye+1,Me=Oe<ve?N[Oe].el:pe;for(;Q<=ye;)g(null,N[Q]=ee?Oa(N[Q]):Rs(N[Q]),V,Me,$,J,ue,H,ee),Q++}}else if(Q>ye)for(;Q<=oe;)Z(T[Q],$,J,!0),Q++;else{const Oe=Q,Me=Q,qe=new Map;for(Q=Me;Q<=ye;Q++){const Ce=N[Q]=ee?Oa(N[Q]):Rs(N[Q]);Ce.key!=null&&qe.set(Ce.key,Q)}let He,Ge=0;const Je=ye-Me+1;let lt=!1,Ze=0;const X=new Array(Je);for(Q=0;Q<Je;Q++)X[Q]=0;for(Q=Oe;Q<=oe;Q++){const Ce=T[Q];if(Ge>=Je){Z(Ce,$,J,!0);continue}let Re;if(Ce.key!=null)Re=qe.get(Ce.key);else for(He=Me;He<=ye;He++)if(X[He-Me]===0&&aa(Ce,N[He])){Re=He;break}Re===void 0?Z(Ce,$,J,!0):(X[Re-Me]=Q+1,Re>=Ze?Ze=Re:lt=!0,g(Ce,N[Re],V,null,$,J,ue,H,ee),Ge++)}const we=lt?My(X):di;for(He=we.length-1,Q=Je-1;Q>=0;Q--){const Ce=Me+Q,Re=N[Ce],se=N[Ce+1],Ie=Ce+1<ve?se.el||Am(se):pe;X[Q]===0?g(null,Re,V,Ie,$,J,ue,H,ee):lt&&(He<0||Q!==we[He]?B(Re,V,Ie,2):He--)}}},B=(T,N,V,pe,$=null)=>{const{el:J,type:ue,transition:H,children:ee,shapeFlag:Q}=T;if(Q&6){B(T.component.subTree,N,V,pe);return}if(Q&128){T.suspense.move(N,V,pe);return}if(Q&64){ue.move(T,N,V,ge);return}if(ue===Qt){a(J,N,V);for(let oe=0;oe<ee.length;oe++)B(ee[oe],N,V,pe);a(T.anchor,N,V);return}if(ue===Ln){v(T,N,V);return}if(pe!==2&&Q&1&&H)if(pe===0)H.persisted&&!J[js]?a(J,N,V):(H.beforeEnter(J),a(J,N,V),$t(()=>H.enter(J),$));else{const{leave:oe,delayLeave:ye,afterLeave:Oe}=H,Me=()=>{T.ctx.isUnmounted?n(J):a(J,N,V)},qe=()=>{const He=J._isLeaving||!!J[js];J._isLeaving&&J[js](!0),H.persisted&&!He?Me():oe(J,()=>{Me(),Oe&&Oe()})};ye?ye(J,Me,qe):qe()}else a(J,N,V)},Z=(T,N,V,pe=!1,$=!1)=>{const{type:J,props:ue,ref:H,children:ee,dynamicChildren:Q,shapeFlag:ve,patchFlag:oe,dirs:ye,cacheIndex:Oe,memo:Me}=T;if(oe===-2&&($=!1),H!=null&&(ja(),hi(H,null,V,T,!0),Va()),Oe!=null&&(N.renderCache[Oe]=void 0),ve&256){N.ctx.deactivate(T);return}const qe=ve&1&&ye,He=!Ba(T);let Ge;if(He&&(Ge=ue&&ue.onVnodeBeforeUnmount)&&Es(Ge,N,T),ve&6)ce(T.component,V,pe);else{if(ve&128){T.suspense.unmount(V,pe);return}qe&&ma(T,null,N,"beforeUnmount"),ve&64?T.type.remove(T,N,V,ge,pe):Q&&!Q.hasOnce&&(J!==Qt||oe>0&&oe&64)?me(Q,N,V,!1,!0):(J===Qt&&oe&384||!$&&ve&16)&&me(ee,N,V),pe&&le(T)}const Je=Me!=null&&Oe==null;(He&&(Ge=ue&&ue.onVnodeUnmounted)||qe||Je)&&$t(()=>{Ge&&Es(Ge,N,T),qe&&ma(T,null,N,"unmounted"),Je&&(T.el=null)},V)},le=T=>{const{type:N,el:V,anchor:pe,transition:$}=T;if(N===Qt){q(V,pe);return}if(N===Ln){b(T);return}const J=()=>{n(V),$&&!$.persisted&&$.afterLeave&&$.afterLeave()};if(T.shapeFlag&1&&$&&!$.persisted){const{leave:ue,delayLeave:H}=$,ee=()=>ue(V,J);H?H(T.el,J,ee):ee()}else J()},q=(T,N)=>{let V;for(;T!==N;)V=p(T),n(T),T=V;n(N)},ce=(T,N,V)=>{const{bum:pe,scope:$,job:J,subTree:ue,um:H,m:ee,a:Q}=T;To(ee),To(Q),pe&&fi(pe),$.stop(),J&&(J.flags|=8,Z(ue,T,N,V)),H&&$t(H,N),$t(()=>{T.isUnmounted=!0},N)},me=(T,N,V,pe=!1,$=!1,J=0)=>{for(let ue=J;ue<T.length;ue++)Z(T[ue],N,V,pe,$)},K=T=>{if(T.shapeFlag&6)return K(T.component.subTree);if(T.shapeFlag&128)return T.suspense.next();const N=p(T.anchor||T.el),V=N&&N[Zf];return V?p(V):N};let de=!1;const he=(T,N,V)=>{let pe;T==null?N._vnode&&(Z(N._vnode,null,null,!0),pe=N._vnode.component):g(N._vnode||null,T,N,null,null,null,V),N._vnode=T,de||(de=!0,iu(pe),wo(),de=!1)},ge={p:g,um:Z,m:B,r:le,mt:Y,mc:C,pc:M,pbc:R,n:K,o:e};let xe,De;return t&&([xe,De]=t(ge)),{render:he,hydrate:xe,createApp:_y(he,xe)}}function Pr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function _n({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Cm(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function ud(e,t,s=!1){const a=e.children,n=t.children;if(Ee(a)&&Ee(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=Oa(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&ud(l,o)),o.type===dn&&(o.patchFlag===-1&&(o=n[i]=Oa(o)),o.el=l.el),o.type===Ft&&!o.el&&(o.el=l.el)}}function My(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Em(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Em(t)}function To(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Am(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Am(t.subTree):null}const Co=e=>e.__isSuspense;let mc=0;const Py={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)$y(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Uy(e,t,s,a,n,l,o,r,c)}},hydrate:By,normalize:Hy},Fy=Py;function hl(e,t){const s=e.props&&e.props[t];$e(s)&&s()}function $y(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=Rm(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(hl(e,"onPending"),hl(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),vi(p,e.ssFallback)):p.resolve(!1,!0)}function Uy(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,m=t.ssFallback,{activeBranch:h,pendingBranch:g,isInFallback:A,isHydrating:I}=u;if(g)u.pendingBranch=p,aa(g,p)?(r(g,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():A&&(I||(r(h,m,s,a,n,null,i,l,o),vi(u,m)))):(u.pendingId=mc++,I?(u.isHydrating=!1,u.activeBranch=g):c(g,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),A?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(h,m,s,a,n,null,i,l,o),vi(u,m))):h&&aa(h,p)?(r(h,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(h&&aa(h,p))r(h,p,s,a,n,u,i,l,o),vi(u,p);else if(hl(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=mc++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:v}=u;y>0?setTimeout(()=>{u.pendingId===v&&u.fallback(m)},y):y===0&&u.fallback(m)}}function Rm(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:m,n:h,o:{parentNode:g,remove:A}}=c;let I;const y=zy(e);y&&t&&t.pendingBranch&&(I=t.pendingId,t.deps++);const v=e.props?go(e.props.timeout):void 0,b=i,x={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:mc++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(w=!1,E=!1){const{vnode:C,activeBranch:_,pendingBranch:R,pendingId:U,effects:S,parentComponent:P,container:Y,isInFallback:W}=x;let D=!1;if(x.isHydrating)x.isHydrating=!1;else if(!w){D=_&&R.transition&&R.transition.mode==="out-in";let ae=!1;D&&(_.transition.afterLeave=()=>{U===x.pendingId&&(p(R,Y,i===b&&!ae?h(_):i,0),ul(S),W&&C.ssFallback&&(C.ssFallback.el=null))}),_&&!x.isFallbackMountPending&&(g(_.el)===Y&&(i=h(_),ae=!0),m(_,P,x,!0),!D&&W&&C.ssFallback&&$t(()=>C.ssFallback.el=null,x)),D||p(R,Y,i,0)}x.isFallbackMountPending=!1,vi(x,R),x.pendingBranch=null,x.isInFallback=!1;let O=x.parent,M=!1;for(;O;){if(O.pendingBranch){O.effects.push(...S),M=!0;break}O=O.parent}!M&&!D&&ul(S),x.effects=[],y&&t&&t.pendingBranch&&I===t.pendingId&&(t.deps--,t.deps===0&&!E&&t.resolve()),hl(C,"onResolve")},fallback(w){if(!x.pendingBranch)return;const{vnode:E,activeBranch:C,parentComponent:_,container:R,namespace:U}=x;hl(E,"onFallback");const S=h(C),P=()=>{x.isFallbackMountPending=!1,x.isInFallback&&(u(null,w,R,S,_,null,U,o,r),vi(x,w))},Y=w.transition&&w.transition.mode==="out-in";Y&&(x.isFallbackMountPending=!0,C.transition.afterLeave=P),x.isInFallback=!0,m(C,_,null,!0),Y||P()},move(w,E,C){x.activeBranch&&p(x.activeBranch,w,E,C),x.container=w},next(){return x.activeBranch&&h(x.activeBranch)},registerDep(w,E,C){const _=!!x.pendingBranch;_&&x.deps++;const R=w.vnode.el;w.asyncDep.catch(U=>{zn(U,w,0)}).then(U=>{if(w.isUnmounted||x.isUnmounted||x.pendingId!==w.suspenseId)return;bl(),w.asyncResolved=!0;const{vnode:S}=w;hc(w,U,!1),R&&(S.el=R);const P=!R&&w.subTree.el;E(w,S,g(R||w.subTree.el),R?null:h(w.subTree),x,l,C),P&&(S.placeholder=null,A(P)),ur(w,S.el),_&&--x.deps===0&&x.resolve()})},unmount(w,E){x.isUnmounted=!0,x.activeBranch&&m(x.activeBranch,s,w,E),x.pendingBranch&&m(x.pendingBranch,s,w,E)}};return x}function By(e,t,s,a,n,i,l,o,r){const c=t.suspense=Rm(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Hy(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=yu(a?s.default:s),e.ssFallback=a?yu(s.fallback):Et(Ft)}function yu(e){let t;if($e(e)){const s=Mn&&e._c;s&&(e._d=!1,vl()),e=e(),s&&(e._d=!0,t=ps,Om())}return Ee(e)&&(e=Ty(e)),e=Rs(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Im(e,t){t&&t.pendingBranch?Ee(e)?t.effects.push(...e):t.effects.push(e):ul(e)}function vi(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,ur(a,n))}function zy(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Qt=Symbol.for("v-fgt"),dn=Symbol.for("v-txt"),Ft=Symbol.for("v-cmt"),Ln=Symbol.for("v-stc"),sl=[];let ps=null;function vl(e=!1){sl.push(ps=e?null:[])}function Om(){sl.pop(),ps=sl[sl.length-1]||null}let Mn=1;function gl(e,t=!1){Mn+=e,e<0&&ps&&t&&(ps.hasOnce=!0)}function Lm(e){return e.dynamicChildren=Mn>0?ps||di:null,Om(),Mn>0&&ps&&ps.push(e),e}function jy(e,t,s,a,n,i){return Lm(pd(e,t,s,a,n,i,!0))}function Eo(e,t,s,a,n){return Lm(Et(e,t,s,a,n,!0))}function Ga(e){return e?e.__v_isVNode===!0:!1}function aa(e,t){return e.type===t.type&&e.key===t.key}function Vy(e){}const Nm=({key:e})=>e??null,co=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?je(e)||Bt(e)||$e(e)?{i:is,r:e,k:t,f:!!s}:e:null);function pd(e,t=null,s=null,a=0,n=null,i=e===Qt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Nm(t),ref:t&&co(t),scopeId:ir,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:is};return o?(md(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=je(s)?8:16),Mn>0&&!l&&ps&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&ps.push(r),r}const Et=qy;function qy(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===rm)&&(e=Ft),Ga(e)){const o=ba(e,t,!0);return s&&md(o,s),Mn>0&&!i&&ps&&(o.shapeFlag&6?ps[ps.indexOf(e)]=o:ps.push(o)),o.patchFlag=-2,o}if(Qy(e)&&(e=e.__vccOpts),t){t=Dm(t);let{class:o,style:r}=t;o&&!je(o)&&(t.class=Il(o)),ct(r)&&(Ol(r)&&!Ee(r)&&(r=Xe({},r)),t.style=Rl(r))}const l=je(e)?1:Co(e)?128:Yf(e)?64:ct(e)?4:$e(e)?2:0;return pd(e,t,s,a,n,l,i,!0)}function Dm(e){return e?Ol(e)||gm(e)?Xe({},e):e:null}function ba(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?Pm(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Nm(c),ref:t&&t.ref?s&&i?Ee(i)?i.concat(co(t)):[i,co(t)]:co(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Qt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&ba(e.ssContent),ssFallback:e.ssFallback&&ba(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&qa(d,r.clone(d)),d}function fd(e=" ",t=0){return Et(dn,null,e,t)}function Gy(e,t){const s=Et(Ln,null,e);return s.staticCount=t,s}function Mm(e="",t=!1){return t?(vl(),Eo(Ft,null,e)):Et(Ft,null,e)}function Rs(e){return e==null||typeof e=="boolean"?Et(Ft):Ee(e)?Et(Qt,null,e.slice()):Ga(e)?Oa(e):Et(dn,null,String(e))}function Oa(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:ba(e)}function md(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Ee(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),md(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!gm(t)?t._ctx=is:n===3&&is&&(is.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else $e(t)?(t={default:t,_ctx:is},s=32):(t=String(t),a&64?(s=16,t=[fd(t)]):s=8);e.children=t,e.shapeFlag|=s}function Pm(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=Il([t.class,a.class]));else if(n==="style")t.style=Rl([t.style,a.style]);else if(Un(n)){const i=t[n],l=a[n];l&&i!==l&&!(Ee(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!Ko(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function Es(e,t,s,a=null){Ps(e,t,7,[s,a])}const Wy=um();let Ky=0;function Fm(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||Wy,i={uid:Ky++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Gc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:ym(a,n),emitsOptions:fm(a,n),emit:null,emitted:null,propsDefaults:et,inheritAttrs:a.inheritAttrs,ctx:et,data:et,props:et,attrs:et,slots:et,refs:et,setupState:et,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ky.bind(null,i),e.ce&&e.ce(i),i}let ns=null;const Ss=()=>ns||is;let Ao,gi;{const e=Xo(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};Ao=t("__VUE_INSTANCE_SETTERS__",s=>ns=s),gi=t("__VUE_SSR_SETTERS__",s=>Pn=s)}const Di=e=>{const t=ns;return Ao(e),e.scope.on(),()=>{e.scope.off(),Ao(t)}},bl=()=>{ns&&ns.scope.off(),Ao(null)};function $m(e){return e.vnode.shapeFlag&4}let Pn=!1;function Um(e,t=!1,s=!1){t&&gi(t);const{props:a,children:n}=e.vnode,i=$m(e);Ry(e,a,i,t),Ny(e,n,s||t);const l=i?Jy(e,t):void 0;return t&&gi(!1),l}function Jy(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,dc);const{setup:a}=s;if(a){ja();const n=e.setupContext=a.length>1?zm(e):null,i=Di(e),l=Ni(a,e,0,[e.props,n]),o=qc(l);if(Va(),i(),(o||e.sp)&&!Ba(e)&&ad(e),o){if(l.then(bl,bl),t)return l.then(r=>{hc(e,r,t)}).catch(r=>{zn(r,e,0)});e.asyncDep=l}else hc(e,l,t)}else Hm(e,t)}function hc(e,t,s){$e(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:ct(t)&&(e.setupState=Qc(t)),Hm(e,s)}let Ro,vc;function Bm(e){Ro=e,vc=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,ty))}}const Zy=()=>!Ro;function Hm(e,t,s){const a=e.type;if(!e.render){if(!t&&Ro&&!a.render){const n=a.template||rd(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=Xe(Xe({isCustomElement:i,delimiters:o},l),r);a.render=Ro(n,c)}}e.render=a.render||ls,vc&&vc(e)}{const n=Di(e);ja();try{hy(e)}finally{Va(),n()}}}const Yy={get(e,t){return us(e,"get",""),e[t]}};function zm(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Yy),slots:e.slots,emit:e.emit,expose:t}}function Ml(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Qc(Pf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in tl)return tl[s](e)},has(t,s){return s in t||s in tl}})):e.proxy}function gc(e,t=!0){return $e(e)?e.displayName||e.name:e.name||t&&e.__name}function Qy(e){return $e(e)&&"__vccOpts"in e}const j=(e,t)=>nb(e,t,Pn);function wi(e,t,s){try{gl(-1);const a=arguments.length;return a===2?ct(t)&&!Ee(t)?Ga(t)?Et(e,null,[t]):Et(e,t):Et(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&Ga(s)&&(s=[s]),Et(e,t,s))}finally{gl(1)}}function Xy(){}function ex(e,t,s,a){const n=s[a];if(n&&jm(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function jm(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(Yt(s[a],t[a]))return!1;return Mn>0&&ps&&ps.push(e),!0}const Vm="3.5.38",tx=ls,sx=fb,ax=ni,nx=qf,ix={createComponentInstance:Fm,setupComponent:Um,renderComponentRoot:ro,setCurrentRenderingInstance:fl,isVNode:Ga,normalizeVNode:Rs,getComponentPublicInstance:Ml,ensureValidVNode:od,pushWarningContext:cb,popWarningContext:db},lx=ix,ox=null,rx=null,cx=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let bc;const xu=typeof window<"u"&&window.trustedTypes;if(xu)try{bc=xu.createPolicy("vue",{createHTML:e=>e})}catch{}const qm=bc?e=>bc.createHTML(e):e=>e,dx="http://www.w3.org/2000/svg",ux="http://www.w3.org/1998/Math/MathML",Ia=typeof document<"u"?document:null,_u=Ia&&Ia.createElement("template"),Gm={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?Ia.createElementNS(dx,e):t==="mathml"?Ia.createElementNS(ux,e):s?Ia.createElement(e,{is:s}):Ia.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>Ia.createTextNode(e),createComment:e=>Ia.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>Ia.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{_u.innerHTML=qm(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=_u.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Xa="transition",$i="animation",ki=Symbol("_vtc"),Wm={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Km=Xe({},sd,Wm),px=e=>(e.displayName="Transition",e.props=Km,e),fx=px((e,{slots:t})=>wi(em,Jm(e),t)),wn=(e,t=[])=>{Ee(e)?e.forEach(s=>s(...t)):e&&e(...t)},wu=e=>e?Ee(e)?e.some(t=>t.length>1):e.length>1:!1;function Jm(e){const t={};for(const S in e)S in Wm||(t[S]=e[S]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:m=`${s}-leave-to`}=e,h=mx(n),g=h&&h[0],A=h&&h[1],{onBeforeEnter:I,onEnter:y,onEnterCancelled:v,onLeave:b,onLeaveCancelled:x,onBeforeAppear:w=I,onAppear:E=y,onAppearCancelled:C=v}=t,_=(S,P,Y,W)=>{S._enterCancelled=W,an(S,P?d:o),an(S,P?c:l),Y&&Y()},R=(S,P)=>{S._isLeaving=!1,an(S,u),an(S,m),an(S,p),P&&P()},U=S=>(P,Y)=>{const W=S?E:y,D=()=>_(P,S,Y);wn(W,[P,D]),ku(()=>{an(P,S?r:i),da(P,S?d:o),wu(W)||Su(P,a,g,D)})};return Xe(t,{onBeforeEnter(S){wn(I,[S]),da(S,i),da(S,l)},onBeforeAppear(S){wn(w,[S]),da(S,r),da(S,c)},onEnter:U(!1),onAppear:U(!0),onLeave(S,P){S._isLeaving=!0;const Y=()=>R(S,P);da(S,u),S._enterCancelled?(da(S,p),yc(S)):(yc(S),da(S,p)),ku(()=>{S._isLeaving&&(an(S,u),da(S,m),wu(b)||Su(S,a,A,Y))}),wn(b,[S,Y])},onEnterCancelled(S){_(S,!1,void 0,!0),wn(v,[S])},onAppearCancelled(S){_(S,!0,void 0,!0),wn(C,[S])},onLeaveCancelled(S){R(S),wn(x,[S])}})}function mx(e){if(e==null)return null;if(ct(e))return[Fr(e.enter),Fr(e.leave)];{const t=Fr(e);return[t,t]}}function Fr(e){return go(e)}function da(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ki]||(e[ki]=new Set)).add(t)}function an(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[ki];s&&(s.delete(t),s.size||(e[ki]=void 0))}function ku(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let hx=0;function Su(e,t,s,a){const n=e._endId=++hx,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Zm(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=m=>{m.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Zm(e,t){const s=window.getComputedStyle(e),a=h=>(s[h]||"").split(", "),n=a(`${Xa}Delay`),i=a(`${Xa}Duration`),l=Tu(n,i),o=a(`${$i}Delay`),r=a(`${$i}Duration`),c=Tu(o,r);let d=null,u=0,p=0;t===Xa?l>0&&(d=Xa,u=l,p=i.length):t===$i?c>0&&(d=$i,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Xa:$i:null,p=d?d===Xa?i.length:r.length:0);const m=d===Xa&&/\b(?:transform|all)(?:,|$)/.test(a(`${Xa}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:m}}function Tu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>Cu(s)+Cu(e[a])))}function Cu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function yc(e){return(e?e.ownerDocument:document).body.offsetHeight}function vx(e,t,s){const a=e[ki];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Io=Symbol("_vod"),hd=Symbol("_vsh"),Ym={name:"show",beforeMount(e,{value:t},{transition:s}){e[Io]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ui(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),Ui(e,!0),a.enter(e)):a.leave(e,()=>{Ui(e,!1)}):Ui(e,t))},beforeUnmount(e,{value:t}){Ui(e,t)}};function Ui(e,t){e.style.display=t?e[Io]:"none",e[hd]=!t}function gx(){Ym.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Qm=Symbol("");function bx(e){const t=Ss();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Oo(i,n))},a=()=>{const n=e(t.proxy);t.ce?Oo(t.ce,n):xc(t.subTree,n),s(n)};nd(()=>{ul(a)}),Qe(()=>{Ht(a,ls,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),gt(()=>n.disconnect())})}function xc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{xc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Oo(e.el,t);else if(e.type===Qt)e.children.forEach(s=>xc(s,t));else if(e.type===Ln){let{el:s,anchor:a}=e;for(;s&&(Oo(s,t),s!==a);)s=s.nextSibling}}function Oo(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=Sg(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Qm]=a}}const yx=/(?:^|;)\s*display\s*:/;function xx(e,t,s){const a=e.style,n=je(s);let i=!1;if(s&&!n){if(t)if(je(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&Zi(a,o,"")}else for(const l in t)s[l]==null&&Zi(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?wx(e,l,!je(t)&&t?t[l]:void 0,o)||Zi(a,l,o):Zi(a,l,"")}}else if(n){if(t!==s){const l=a[Qm];l&&(s+=";"+l),a.cssText=s,i=yx.test(s)}}else t&&e.removeAttribute("style");Io in e&&(e[Io]=i?a.display:"",e[hd]&&(a.display="none"))}const Eu=/\s*!important$/;function Zi(e,t,s){if(Ee(s))s.forEach(a=>Zi(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=_x(e,t);Eu.test(s)?e.setProperty(Is(a),s.replace(Eu,""),"important"):e[a]=s}}const Au=["Webkit","Moz","ms"],$r={};function _x(e,t){const s=$r[t];if(s)return s;let a=bt(t);if(a!=="filter"&&a in e)return $r[t]=a;a=Hn(a);for(let n=0;n<Au.length;n++){const i=Au[n]+a;if(i in e)return $r[t]=i}return t}function wx(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&je(a)&&s===a}const Ru="http://www.w3.org/1999/xlink";function Iu(e,t,s,a,n,i=wg(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Ru,t.slice(6,t.length)):e.setAttributeNS(Ru,t,s):s==null||i&&!vf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":ms(s)?String(s):s)}function Ou(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?qm(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=vf(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Ma(e,t,s,a){e.addEventListener(t,s,a)}function kx(e,t,s,a){e.removeEventListener(t,s,a)}const Lu=Symbol("_vei");function Sx(e,t,s,a,n=null){const i=e[Lu]||(e[Lu]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=Tx(t);if(a){const c=i[t]=Ax(a,n);Ma(e,o,c,r)}else l&&(kx(e,o,l,r),i[t]=void 0)}}const Nu=/(?:Once|Passive|Capture)$/;function Tx(e){let t;if(Nu.test(e)){t={};let a;for(;a=e.match(Nu);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):Is(e.slice(2)),t]}let Ur=0;const Cx=Promise.resolve(),Ex=()=>Ur||(Cx.then(()=>Ur=0),Ur=Date.now());function Ax(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Ee(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&Ps(c,t,5,o)}}else Ps(n,t,5,[a])};return s.value=e,s.attached=Ex(),s}const Du=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Xm=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?vx(e,a,l):t==="style"?xx(e,s,a):Un(t)?Ko(t)||Sx(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Rx(e,t,a,l))?(Ou(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Iu(e,t,a,l,i,t!=="value")):e._isVueCE&&(Ix(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!je(a)))?Ou(e,bt(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),Iu(e,t,a,l))};function Rx(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&Du(t)&&$e(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return Du(t)&&je(s)?!1:t in e}function Ix(e,t){const s=e._def.props;if(!s)return!1;const a=bt(t);return Array.isArray(s)?s.some(n=>bt(n)===a):Object.keys(s).some(n=>bt(n)===a)}const Mu={};function eh(e,t,s){let a=Nl(e,t);Jo(a)&&(a=Xe({},a,t));class n extends pr{constructor(l){super(a,l,s)}}return n.def=a,n}const Ox=((e,t)=>eh(e,t,fh)),Lx=typeof HTMLElement<"u"?HTMLElement:class{};class pr extends Lx{constructor(t,s={},a=Do){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==Do?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Xe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof pr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Pt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Ee(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=go(this._props[r])),(o||(o=Object.create(null)))[bt(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)pt(this,a)||Object.defineProperty(this,a,{get:()=>va(s[a])})}_resolveProps(t){const{props:s}=t,a=Ee(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(bt))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):Mu;const n=bt(t);s&&this._numberProps&&this._numberProps[n]&&(a=go(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Mu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(Is(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(Is(t),s+""):s||this.removeAttribute(Is(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),ph(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=Et(this._def,Xe(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Jo(l[0])?Xe({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),Is(i)!==i&&n(Is(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function th(e){const t=Ss(),s=t&&t.ce;return s||null}function Nx(){const e=th();return e&&e.shadowRoot}function Dx(e="$style"){{const t=Ss();if(!t)return et;const s=t.type.__cssModules;if(!s)return et;const a=s[e];return a||et}}const sh=new WeakMap,ah=new WeakMap,Lo=Symbol("_moveCb"),Pu=Symbol("_enterCb"),Mx=e=>(delete e.props.mode,e),Px=Mx({name:"TransitionGroup",props:Xe({},Km,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Ss(),a=td();let n,i;return rr(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Hx(n[0].el,s.vnode.el,l)){n=[];return}n.forEach($x),n.forEach(Ux);const o=n.filter(Bx);yc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;da(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Lo]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Lo]=null,an(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=at(e),o=Jm(l);let r=l.tag||Qt;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[hd]&&(n.push(d),qa(d,_i(d,o,a,s)),sh.set(d,nh(d.el)))}i=t.default?lr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&qa(d,_i(d,o,a,s))}return Et(r,null,i)}}}),Fx=Px;function $x(e){const t=e.el;t[Lo]&&t[Lo](),t[Pu]&&t[Pu]()}function Ux(e){ah.set(e,nh(e.el))}function Bx(e){const t=sh.get(e),s=ah.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function nh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Hx(e,t,s){const a=e.cloneNode(),n=e[ki];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Zm(a);return i.removeChild(a),l}const pn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ee(t)?s=>fi(t,s):t};function zx(e){e.target.composing=!0}function Fu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ks=Symbol("_assign");function $u(e,t,s){return t&&(e=e.trim()),s&&(e=Qo(e)),e}const No={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[Ks]=pn(n);const i=a||n.props&&n.props.type==="number";Ma(e,t?"change":"input",l=>{l.target.composing||e[Ks]($u(e.value,s,i))}),(s||i)&&Ma(e,"change",()=>{e.value=$u(e.value,s,i)}),t||(Ma(e,"compositionstart",zx),Ma(e,"compositionend",Fu),Ma(e,"change",Fu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[Ks]=pn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Qo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},vd={deep:!0,created(e,t,s){e[Ks]=pn(s),Ma(e,"change",()=>{const a=e._modelValue,n=Si(e),i=e.checked,l=e[Ks];if(Ee(a)){const o=er(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(Bn(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(lh(e,i))})},mounted:Uu,beforeUpdate(e,t,s){e[Ks]=pn(s),Uu(e,t,s)}};function Uu(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Ee(t))n=er(t,a.props.value)>-1;else if(Bn(t))n=t.has(a.props.value);else{if(t===s)return;n=za(t,lh(e,!0))}e.checked!==n&&(e.checked=n)}const gd={created(e,{value:t},s){e.checked=za(t,s.props.value),e[Ks]=pn(s),Ma(e,"change",()=>{e[Ks](Si(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[Ks]=pn(a),t!==s&&(e.checked=za(t,a.props.value))}},ih={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=Bn(t);Ma(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Qo(Si(l)):Si(l));e[Ks](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,Pt(()=>{e._assigning=!1})}),e[Ks]=pn(a)},mounted(e,{value:t}){Bu(e,t)},beforeUpdate(e,t,s){e[Ks]=pn(s)},updated(e,{value:t}){e._assigning||Bu(e,t)}};function Bu(e,t){const s=e.multiple,a=Ee(t);if(!(s&&!a&&!Bn(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=Si(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=er(t,o)>-1}else l.selected=t.has(o);else if(za(Si(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Si(e){return"_value"in e?e._value:e.value}function lh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const oh={created(e,t,s){Yl(e,t,s,null,"created")},mounted(e,t,s){Yl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){Yl(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){Yl(e,t,s,a,"updated")}};function rh(e,t){switch(e){case"SELECT":return ih;case"TEXTAREA":return No;default:switch(t){case"checkbox":return vd;case"radio":return gd;default:return No}}}function Yl(e,t,s,a,n){const l=rh(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function jx(){No.getSSRProps=({value:e})=>({value:e}),gd.getSSRProps=({value:e},t)=>{if(t.props&&za(t.props.value,e))return{checked:!0}},vd.getSSRProps=({value:e},t)=>{if(Ee(e)){if(t.props&&er(e,t.props.value)>-1)return{checked:!0}}else if(Bn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},oh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=rh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Vx=["ctrl","shift","alt","meta"],qx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Vx.some(s=>e[`${s}Key`]&&!t.includes(s))},Gx=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=qx[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},Wx={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Kx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=Is(n.key);if(t.some(l=>l===i||Wx[l]===i))return e(n)}))},ch=Xe({patchProp:Xm},Gm);let al,Hu=!1;function dh(){return al||(al=km(ch))}function uh(){return al=Hu?al:Sm(ch),Hu=!0,al}const ph=((...e)=>{dh().render(...e)}),Jx=((...e)=>{uh().hydrate(...e)}),Do=((...e)=>{const t=dh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=hh(a);if(!n)return;const i=t._component;!$e(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,mh(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),fh=((...e)=>{const t=uh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=hh(a);if(n)return s(n,!0,mh(n))},t});function mh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function hh(e){return je(e)?document.querySelector(e):e}let zu=!1;const Zx=()=>{zu||(zu=!0,jx(),gx())},Yx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:em,BaseTransitionPropsValidators:sd,Comment:Ft,DeprecationTypes:cx,EffectScope:Gc,ErrorCodes:pb,ErrorTypeStrings:sx,Fragment:Qt,KeepAlive:qb,ReactiveEffect:rl,Static:Ln,Suspense:Fy,Teleport:Eb,Text:dn,TrackOpTypes:ib,Transition:fx,TransitionGroup:Fx,TriggerOpTypes:lb,VueElement:pr,assertNumber:ub,callWithAsyncErrorHandling:Ps,callWithErrorHandling:Ni,camelize:bt,capitalize:Hn,cloneVNode:ba,compatUtils:rx,computed:j,createApp:Do,createBlock:Eo,createCommentVNode:Mm,createElementBlock:jy,createElementVNode:pd,createHydrationRenderer:Sm,createPropsRestProxy:fy,createRenderer:km,createSSRApp:fh,createSlots:Qb,createStaticVNode:Gy,createTextVNode:fd,createVNode:Et,customRef:$f,defineAsyncComponent:jb,defineComponent:Nl,defineCustomElement:eh,defineEmits:ay,defineExpose:ny,defineModel:oy,defineOptions:iy,defineProps:sy,defineSSRCustomElement:Ox,defineSlots:ly,devtools:ax,effect:Ag,effectScope:Tg,getCurrentInstance:Ss,getCurrentScope:xf,getCurrentWatcher:ob,getTransitionRawChildren:lr,guardReactiveProps:Dm,h:wi,handleError:zn,hasInjectionContext:xb,hydrate:Jx,hydrateOnIdle:Fb,hydrateOnInteraction:Hb,hydrateOnMediaQuery:Bb,hydrateOnVisible:Ub,initCustomFormatter:Xy,initDirectivesForSSR:Zx,inject:Ws,isMemoSame:jm,isProxy:Ol,isReactive:Ua,isReadonly:ga,isRef:Bt,isRuntimeOnly:Zy,isShallow:Ls,isVNode:Ga,markRaw:Pf,mergeDefaults:uy,mergeModels:py,mergeProps:Pm,nextTick:Pt,nodeOps:Gm,normalizeClass:Il,normalizeProps:pg,normalizeStyle:Rl,onActivated:os,onBeforeMount:am,onBeforeUnmount:cr,onBeforeUpdate:nd,onDeactivated:Wt,onErrorCaptured:om,onMounted:Qe,onRenderTracked:lm,onRenderTriggered:im,onScopeDispose:Cg,onServerPrefetch:nm,onUnmounted:gt,onUpdated:rr,onWatcherCleanup:Bf,openBlock:vl,patchProp:Xm,popScopeId:gb,provide:el,proxyRefs:Qc,pushScopeId:vb,queuePostFlushCb:ul,reactive:fn,readonly:yo,ref:f,registerRuntimeCompiler:Bm,render:ph,renderList:Yb,renderSlot:Xb,resolveComponent:Kb,resolveDirective:Zb,resolveDynamicComponent:Jb,resolveFilter:ox,resolveTransitionHooks:_i,setBlockTracking:gl,setDevtoolsHook:nx,setTransitionHooks:qa,shallowReactive:Zc,shallowReadonly:Wg,shallowRef:Yc,ssrContextKey:Gf,ssrUtils:lx,stop:Rg,toDisplayString:bf,toHandlerKey:pi,toHandlers:ey,toRaw:at,toRef:sb,toRefs:Xg,toValue:Zg,transformVNodeArgs:Vy,triggerRef:Jg,unref:va,useAttrs:dy,useCssModule:Dx,useCssVars:bx,useHost:th,useId:Rb,useModel:wy,useSSRContext:Wf,useShadowRoot:Nx,useSlots:cy,useTemplateRef:Ib,useTransitionState:td,vModelCheckbox:vd,vModelDynamic:oh,vModelRadio:gd,vModelSelect:ih,vModelText:No,vShow:Ym,version:Vm,warn:tx,watch:Ht,watchEffect:_b,watchPostEffect:wb,watchSyncEffect:Kf,withAsyncContext:my,withCtx:ed,withDefaults:ry,withDirectives:yb,withKeys:Kx,withMemo:ex,withModifiers:Gx,withScopeId:bb},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const yl=Symbol(""),nl=Symbol(""),bd=Symbol(""),Mo=Symbol(""),vh=Symbol(""),Fn=Symbol(""),gh=Symbol(""),bh=Symbol(""),yd=Symbol(""),xd=Symbol(""),Pl=Symbol(""),_d=Symbol(""),yh=Symbol(""),wd=Symbol(""),kd=Symbol(""),Sd=Symbol(""),Td=Symbol(""),Cd=Symbol(""),Ed=Symbol(""),xh=Symbol(""),_h=Symbol(""),fr=Symbol(""),Po=Symbol(""),Ad=Symbol(""),Rd=Symbol(""),xl=Symbol(""),Fl=Symbol(""),Id=Symbol(""),_c=Symbol(""),Qx=Symbol(""),wc=Symbol(""),Fo=Symbol(""),Xx=Symbol(""),e0=Symbol(""),Od=Symbol(""),t0=Symbol(""),s0=Symbol(""),Ld=Symbol(""),wh=Symbol(""),Ti={[yl]:"Fragment",[nl]:"Teleport",[bd]:"Suspense",[Mo]:"KeepAlive",[vh]:"BaseTransition",[Fn]:"openBlock",[gh]:"createBlock",[bh]:"createElementBlock",[yd]:"createVNode",[xd]:"createElementVNode",[Pl]:"createCommentVNode",[_d]:"createTextVNode",[yh]:"createStaticVNode",[wd]:"resolveComponent",[kd]:"resolveDynamicComponent",[Sd]:"resolveDirective",[Td]:"resolveFilter",[Cd]:"withDirectives",[Ed]:"renderList",[xh]:"renderSlot",[_h]:"createSlots",[fr]:"toDisplayString",[Po]:"mergeProps",[Ad]:"normalizeClass",[Rd]:"normalizeStyle",[xl]:"normalizeProps",[Fl]:"guardReactiveProps",[Id]:"toHandlers",[_c]:"camelize",[Qx]:"capitalize",[wc]:"toHandlerKey",[Fo]:"setBlockTracking",[Xx]:"pushScopeId",[e0]:"popScopeId",[Od]:"withCtx",[t0]:"unref",[s0]:"isRef",[Ld]:"withMemo",[wh]:"isMemoSame"};function a0(e){Object.getOwnPropertySymbols(e).forEach(t=>{Ti[t]=e[t]})}const $s={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function n0(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:$s}}function _l(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=$s){return e&&(o?(e.helper(Fn),e.helper(Ai(e.inSSR,c))):e.helper(Ei(e.inSSR,c)),l&&e.helper(Cd)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function Nn(e,t=$s){return{type:17,loc:t,elements:e}}function Gs(e,t=$s){return{type:15,loc:t,properties:e}}function Ut(e,t){return{type:16,loc:$s,key:je(e)?Ke(e,!0):e,value:t}}function Ke(e,t=!1,s=$s,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function ia(e,t=$s){return{type:8,loc:t,children:e}}function Gt(e,t=[],s=$s){return{type:14,loc:s,callee:e,arguments:t}}function Ci(e,t=void 0,s=!1,a=!1,n=$s){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function kc(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:$s}}function i0(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:$s}}function l0(e){return{type:21,body:e,loc:$s}}function Ei(e,t){return e||t?yd:xd}function Ai(e,t){return e||t?gh:bh}function Nd(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(Ei(a,e.isComponent)),t(Fn),t(Ai(a,e.isComponent)))}const ju=new Uint8Array([123,123]),Vu=new Uint8Array([125,125]);function qu(e){return e>=97&&e<=122||e>=65&&e<=90}function Ds(e){return e===32||e===10||e===9||e===12||e===13}function en(e){return e===47||e===62||Ds(e)}function $o(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const rs={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class o0{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=ju,this.delimiterClose=Vu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=ju,this.delimiterClose=Vu}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?en(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Ds(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===rs.TitleEnd||this.currentSequence===rs.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===rs.Cdata[this.sequenceIndex]?++this.sequenceIndex===rs.Cdata.length&&(this.state=28,this.currentSequence=rs.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===rs.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):qu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){en(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(en(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA($o("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Ds(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=qu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Ds(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Ds(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Ds(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||en(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||en(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||en(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||en(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||en(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Ds(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Ds(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Ds(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=rs.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===rs.ScriptEnd[3]?this.startSpecial(rs.ScriptEnd,4):t===rs.StyleEnd[3]?this.startSpecial(rs.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===rs.TitleEnd[3]?this.startSpecial(rs.TitleEnd,4):t===rs.TextareaEnd[3]?this.startSpecial(rs.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===rs.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Gu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Dn(e,t){const s=Gu("MODE",t),a=Gu(e,t);return s===3?a===!0:a!==!1}function wl(e,t,s,...a){return Dn(e,t)}function Dd(e){throw e}function kh(e){}function Ct(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const Os=e=>e.type===4&&e.isStatic;function Sh(e){switch(e){case"Teleport":case"teleport":return nl;case"Suspense":case"suspense":return bd;case"KeepAlive":case"keep-alive":return Mo;case"BaseTransition":case"base-transition":return vh}}const r0=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Md=e=>!r0.test(e),Th=/[A-Za-z_$\xA0-\uFFFF]/,c0=/[\.\?\w$\xA0-\uFFFF]/,d0=/\s+[.[]\s*|\s*[.[]\s+/g,Ch=e=>e.type===4?e.content:e.loc.source,u0=e=>{const t=Ch(e).trim().replace(d0,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?Th:c0).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},Eh=u0,p0=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,f0=e=>p0.test(Ch(e)),m0=f0;function qs(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(je(t)?n.name===t:t.test(n.name)))return n}}function mr(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&En(i.arg,t))return i}}function En(e,t){return!!(e&&Os(e)&&e.content===t)}function h0(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Br(e){return e.type===5||e.type===2}function Wu(e){return e.type===7&&e.name==="pre"}function v0(e){return e.type===7&&e.name==="slot"}function Uo(e){return e.type===1&&e.tagType===3}function Bo(e){return e.type===1&&e.tagType===2}const g0=new Set([xl,Fl]);function Ah(e,t=[]){if(e&&!je(e)&&e.type===14){const s=e.callee;if(!je(s)&&g0.has(s))return Ah(e.arguments[0],t.concat(e))}return[e,t]}function Ho(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!je(n)&&n.type===14){const o=Ah(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||je(n))a=Gs([t]);else if(n.type===14){const o=n.arguments[0];!je(o)&&o.type===15?Ku(t,o)||o.properties.unshift(t):n.callee===Id?a=Gt(s.helper(Po),[Gs([t]),n]):n.arguments.unshift(Gs([t])),!a&&(a=n)}else n.type===15?(Ku(t,n)||n.properties.unshift(t),a=n):(a=Gt(s.helper(Po),[Gs([t]),n]),l&&l.callee===Fl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function Ku(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function kl(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function b0(e){return e.type===14&&e.callee===Ld?e.arguments[1].returns:e}const y0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Rh(e){for(let t=0;t<e.length;t++)if(!Ds(e.charCodeAt(t)))return!1;return!0}function Pd(e){return e.type===2&&Rh(e.content)||e.type===12&&Pd(e.content)}function Ih(e){return e.type===3||Pd(e)}const Oh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:oi,isPreTag:oi,isIgnoreNewlineTag:oi,isCustomElement:oi,onError:Dd,onWarn:kh,comments:!1,prefixIdentifiers:!1};let rt=Oh,Sl=null,Ha="",ds=null,tt=null,Cs="",Ra=-1,Sn=-1,Fd=0,on=!1,Sc=null;const Tt=[],Nt=new o0(Tt,{onerr:Ca,ontext(e,t){Ql(as(e,t),e,t)},ontextentity(e,t,s){Ql(e,t,s)},oninterpolation(e,t){if(on)return Ql(as(e,t),e,t);let s=e+Nt.delimiterOpen.length,a=t-Nt.delimiterClose.length;for(;Ds(Ha.charCodeAt(s));)s++;for(;Ds(Ha.charCodeAt(a-1));)a--;let n=as(s,a);n.includes("&")&&(n=rt.decodeEntities(n,!1)),Tc({type:5,content:po(n,!1,Mt(s,a)),loc:Mt(e,t)})},onopentagname(e,t){const s=as(e,t);ds={type:1,tag:s,ns:rt.getNamespace(s,Tt[0],rt.ns),tagType:0,props:[],children:[],loc:Mt(e-1,t),codegenNode:void 0}},onopentagend(e){Zu(e)},onclosetag(e,t){const s=as(e,t);if(!rt.isVoidTag(s)){let a=!1;for(let n=0;n<Tt.length;n++)if(Tt[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&Ca(24,Tt[0].loc.start.offset);for(let l=0;l<=n;l++){const o=Tt.shift();uo(o,t,l<n)}break}a||Ca(23,Lh(e,60))}},onselfclosingtag(e){const t=ds.tag;ds.isSelfClosing=!0,Zu(e),Tt[0]&&Tt[0].tag===t&&uo(Tt.shift(),e)},onattribname(e,t){tt={type:6,name:as(e,t),nameLoc:Mt(e,t),value:void 0,loc:Mt(e)}},ondirname(e,t){const s=as(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!on&&a===""&&Ca(26,e),on||a==="")tt={type:6,name:s,nameLoc:Mt(e,t),value:void 0,loc:Mt(e)};else if(tt={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ke("prop")]:[],loc:Mt(e)},a==="pre"){on=Nt.inVPre=!0,Sc=ds;const n=ds.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=R0(n[i]))}},ondirarg(e,t){if(e===t)return;const s=as(e,t);if(on&&!Wu(tt))tt.name+=s,An(tt.nameLoc,t);else{const a=s[0]!=="[";tt.arg=po(a?s:s.slice(1,-1),a,Mt(e,t),a?3:0)}},ondirmodifier(e,t){const s=as(e,t);if(on&&!Wu(tt))tt.name+="."+s,An(tt.nameLoc,t);else if(tt.name==="slot"){const a=tt.arg;a&&(a.content+="."+s,An(a.loc,t))}else{const a=Ke(s,!0,Mt(e,t));tt.modifiers.push(a)}},onattribdata(e,t){Cs+=as(e,t),Ra<0&&(Ra=e),Sn=t},onattribentity(e,t,s){Cs+=e,Ra<0&&(Ra=t),Sn=s},onattribnameend(e){const t=tt.loc.start.offset,s=as(t,e);tt.type===7&&(tt.rawName=s),ds.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&Ca(2,t)},onattribend(e,t){if(ds&&tt){if(An(tt.loc,t),e!==0)if(Cs.includes("&")&&(Cs=rt.decodeEntities(Cs,!0)),tt.type===6)tt.name==="class"&&(Cs=Dh(Cs).trim()),e===1&&!Cs&&Ca(13,t),tt.value={type:2,content:Cs,loc:e===1?Mt(Ra,Sn):Mt(Ra-1,Sn+1)},Nt.inSFCRoot&&ds.tag==="template"&&tt.name==="lang"&&Cs&&Cs!=="html"&&Nt.enterRCDATA($o("</template"),0);else{let s=0;tt.exp=po(Cs,!1,Mt(Ra,Sn),0,s),tt.name==="for"&&(tt.forParseResult=_0(tt.exp));let a=-1;tt.name==="bind"&&(a=tt.modifiers.findIndex(n=>n.content==="sync"))>-1&&wl("COMPILER_V_BIND_SYNC",rt,tt.loc,tt.arg.loc.source)&&(tt.name="model",tt.modifiers.splice(a,1))}(tt.type!==7||tt.name!=="pre")&&ds.props.push(tt)}Cs="",Ra=Sn=-1},oncomment(e,t){rt.comments&&Tc({type:3,content:as(e,t),loc:Mt(e-4,t+3)})},onend(){const e=Ha.length;for(let t=0;t<Tt.length;t++)uo(Tt[t],e-1),Ca(24,Tt[t].loc.start.offset)},oncdata(e,t){(Tt[0]?Tt[0].ns:rt.ns)!==0?Ql(as(e,t),e,t):Ca(1,e-9)},onprocessinginstruction(e){(Tt[0]?Tt[0].ns:rt.ns)===0&&Ca(21,e-1)}}),Ju=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,x0=/^\(|\)$/g;function _0(e){const t=e.loc,s=e.content,a=s.match(y0);if(!a)return;const[,n,i]=a,l=(u,p,m=!1)=>{const h=t.start.offset+p,g=h+u.length;return po(u,!1,Mt(h,g),0,m?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(x0,"").trim();const c=n.indexOf(r),d=r.match(Ju);if(d){r=r.replace(Ju,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const m=d[2].trim();m&&(o.index=l(m,s.indexOf(m,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function as(e,t){return Ha.slice(e,t)}function Zu(e){Nt.inSFCRoot&&(ds.innerLoc=Mt(e+1,e+1)),Tc(ds);const{tag:t,ns:s}=ds;s===0&&rt.isPreTag(t)&&Fd++,rt.isVoidTag(t)?uo(ds,e):(Tt.unshift(ds),(s===1||s===2)&&(Nt.inXML=!0)),ds=null}function Ql(e,t,s){{const i=Tt[0]&&Tt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=rt.decodeEntities(e,!1))}const a=Tt[0]||Sl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,An(n.loc,s)):a.children.push({type:2,content:e,loc:Mt(t,s)})}function uo(e,t,s=!1){s?An(e.loc,Lh(t,60)):An(e.loc,w0(t,62)+1),Nt.inSFCRoot&&(e.children.length?e.innerLoc.end=Xe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Xe({},e.innerLoc.start),e.innerLoc.source=as(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(on||(a==="slot"?e.tagType=2:Yu(e)?e.tagType=3:S0(e)&&(e.tagType=1)),Nt.inRCDATA||(e.children=Nh(i)),n===0&&rt.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&rt.isPreTag(a)&&Fd--,Sc===e&&(on=Nt.inVPre=!1,Sc=null),Nt.inXML&&(Tt[0]?Tt[0].ns:rt.ns)===0&&(Nt.inXML=!1);{const l=e.props;if(!Nt.inSFCRoot&&Dn("COMPILER_NATIVE_TEMPLATE",rt)&&e.tag==="template"&&!Yu(e)){const r=Tt[0]||Sl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&wl("COMPILER_INLINE_TEMPLATE",rt,o.loc)&&e.children.length&&(o.value={type:2,content:as(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function w0(e,t){let s=e;for(;Ha.charCodeAt(s)!==t&&s<Ha.length-1;)s++;return s}function Lh(e,t){let s=e;for(;Ha.charCodeAt(s)!==t&&s>=0;)s--;return s}const k0=new Set(["if","else","else-if","for","slot"]);function Yu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&k0.has(t[s].name))return!0}return!1}function S0({tag:e,props:t}){if(rt.isCustomElement(e))return!1;if(e==="component"||T0(e.charCodeAt(0))||Sh(e)||rt.isBuiltInComponent&&rt.isBuiltInComponent(e)||rt.isNativeTag&&!rt.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(wl("COMPILER_IS_ON_ELEMENT",rt,a.loc))return!0}}else if(a.name==="bind"&&En(a.arg,"is")&&wl("COMPILER_IS_ON_ELEMENT",rt,a.loc))return!0}return!1}function T0(e){return e>64&&e<91}const C0=/\r\n/g;function Nh(e){const t=rt.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(Fd)n.content=n.content.replace(C0,`
`);else if(Rh(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&E0(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=Dh(n.content))}return s?e.filter(Boolean):e}function E0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Dh(e){let t="",s=!1;for(let a=0;a<e.length;a++)Ds(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function Tc(e){(Tt[0]||Sl).children.push(e)}function Mt(e,t){return{start:Nt.getPos(e),end:t==null?t:Nt.getPos(t),source:t==null?t:as(e,t)}}function A0(e){return Mt(e.start.offset,e.end.offset)}function An(e,t){e.end=Nt.getPos(t),e.source=as(e.start.offset,t)}function R0(e){const t={type:6,name:e.rawName,nameLoc:Mt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function po(e,t=!1,s,a=0,n=0){return Ke(e,t,s,a)}function Ca(e,t,s){rt.onError(Ct(e,Mt(t,t)))}function I0(){Nt.reset(),ds=null,tt=null,Cs="",Ra=-1,Sn=-1,Tt.length=0}function O0(e,t){if(I0(),Ha=e,rt=Xe({},Oh),t){let n;for(n in t)t[n]!=null&&(rt[n]=t[n])}Nt.mode=rt.parseMode==="html"?1:rt.parseMode==="sfc"?2:0,Nt.inXML=rt.ns===1||rt.ns===2;const s=t&&t.delimiters;s&&(Nt.delimiterOpen=$o(s[0]),Nt.delimiterClose=$o(s[1]));const a=Sl=n0([],e);return Nt.parse(Ha),a.loc=Mt(0,e.length),a.children=Nh(a.children),Sl=null,a}function L0(e,t){fo(e,void 0,t,!!Mh(e))}function Mh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Bo(t[0])?t[0]:null}function fo(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Ms(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const m=u.codegenNode;if(m.type===13){const h=m.patchFlag;if((h===void 0||h===512||h===1)&&Fh(u,s)>=2){const g=$h(u);g&&(m.props=s.hoist(g))}m.dynamicProps&&(m.dynamicProps=s.hoist(m.dynamicProps))}}}else if(u.type===12&&(a?0:Ms(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,fo(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)fo(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)fo(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ee(e.codegenNode.children))e.codegenNode.children=r(Nn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ee(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(Nn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ee(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=qs(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(Nn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ee(d.children)&&d.children.type===15){const p=d.children.properties.find(m=>m.key===u||m.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Ms(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=Fh(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Ms(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Ms(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Fn),t.removeHelper(Ai(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(Ei(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Ms(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(je(o)||ms(o))continue;const r=Ms(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const N0=new Set([Ad,Rd,xl,Fl]);function Ph(e,t){if(e.type===14&&!je(e.callee)&&N0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Ms(s,t);if(s.type===14)return Ph(s,t)}return 0}function Fh(e,t){let s=3;const a=$h(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Ms(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Ms(o,t):o.type===14?c=Ph(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function $h(e){const t=e.codegenNode;if(t.type===13)return t.props}function D0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=ls,isCustomElement:d=ls,expressionPlugins:u=[],scopeId:p=null,slotted:m=!0,ssr:h=!1,inSSR:g=!1,ssrCssVars:A="",bindingMetadata:I=et,inline:y=!1,isTS:v=!1,onError:b=Dd,onWarn:x=kh,compatConfig:w}){const E=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),C={filename:t,selfName:E&&Hn(bt(E[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:m,ssr:h,inSSR:g,ssrCssVars:A,bindingMetadata:I,inline:y,isTS:v,onError:b,onWarn:x,compatConfig:w,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(_){const R=C.helpers.get(_)||0;return C.helpers.set(_,R+1),_},removeHelper(_){const R=C.helpers.get(_);if(R){const U=R-1;U?C.helpers.set(_,U):C.helpers.delete(_)}},helperString(_){return`_${Ti[C.helper(_)]}`},replaceNode(_){C.parent.children[C.childIndex]=C.currentNode=_},removeNode(_){const R=C.parent.children,U=_?R.indexOf(_):C.currentNode?C.childIndex:-1;!_||_===C.currentNode?(C.currentNode=null,C.onNodeRemoved()):C.childIndex>U&&(C.childIndex--,C.onNodeRemoved()),C.parent.children.splice(U,1)},onNodeRemoved:ls,addIdentifiers(_){},removeIdentifiers(_){},hoist(_){je(_)&&(_=Ke(_)),C.hoists.push(_);const R=Ke(`_hoisted_${C.hoists.length}`,!1,_.loc,2);return R.hoisted=_,R},cache(_,R=!1,U=!1){const S=i0(C.cached.length,_,R,U);return C.cached.push(S),S}};return C.filters=new Set,C}function M0(e,t){const s=D0(e,t);hr(e,s),t.hoistStatic&&L0(e,s),t.ssr||P0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function P0(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=Mh(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&Nd(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=_l(t,s(yl),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function F0(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];je(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,hr(n,t))}}function hr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ee(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Pl);break;case 5:t.ssr||t.helper(fr);break;case 9:for(let i=0;i<e.branches.length;i++)hr(e.branches[i],t);break;case 10:case 11:case 1:case 0:F0(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function Uh(e,t){const s=je(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(v0))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const vr="/*@__PURE__*/",Bh=e=>`${Ti[e]}: _${Ti[e]}`;function $0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const m={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${Ti[g]}`},push(g,A=-2,I){m.code+=g},indent(){h(++m.indentLevel)},deindent(g=!1){g?--m.indentLevel:h(--m.indentLevel)},newline(){h(m.indentLevel)}};function h(g){m.push(`
`+"  ".repeat(g),0)}return m}function U0(e,t={}){const s=$0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,m=!i&&a!=="module";B0(e,s);const g=d?"ssrRender":"render",I=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${g}(${I}) {`),l(),m&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(Bh).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(Hr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(Hr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),Hr(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let y=0;y<e.temps;y++)n(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?fs(e.codegenNode,s):n("null"),m&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function B0(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[yd,xd,Pl,_d,yh].filter(p=>d.includes(p)).map(Bh).join(", ");n(`const { ${u} } = _Vue
`,-1)}H0(e.hoists,t),i(),n("return ")}function Hr(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?Td:t==="component"?wd:Sd);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${kl(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function H0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),fs(i,t),a())}t.pure=!1}function $d(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),$l(e,t,s),s&&t.deindent(),t.push("]")}function $l(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];je(o)?n(o,-3):Ee(o)?$d(o,t):fs(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function fs(e,t){if(je(e)){t.push(e,-3);return}if(ms(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:fs(e.codegenNode,t);break;case 2:z0(e,t);break;case 4:Hh(e,t);break;case 5:j0(e,t);break;case 12:fs(e.codegenNode,t);break;case 8:zh(e,t);break;case 3:q0(e,t);break;case 13:G0(e,t);break;case 14:K0(e,t);break;case 15:J0(e,t);break;case 17:Z0(e,t);break;case 18:Y0(e,t);break;case 19:Q0(e,t);break;case 20:X0(e,t);break;case 21:$l(e.body,t,!0,!1);break}}function z0(e,t){t.push(JSON.stringify(e.content),-3,e)}function Hh(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function j0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(vr),s(`${a(fr)}(`),fs(e.content,t),s(")")}function zh(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];je(a)?t.push(a,-3):fs(a,t)}}function V0(e,t){const{push:s}=t;if(e.type===8)s("["),zh(e,t),s("]");else if(e.isStatic){const a=Md(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function q0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(vr),s(`${a(Pl)}(${JSON.stringify(e.content)})`,-3,e)}function G0(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:m}=e;let h;r&&(h=String(r)),d&&s(a(Cd)+"("),u&&s(`(${a(Fn)}(${p?"true":""}), `),n&&s(vr);const g=u?Ai(t.inSSR,m):Ei(t.inSSR,m);s(a(g)+"(",-2,e),$l(W0([i,l,o,h,c]),t),s(")"),u&&s(")"),d&&(s(", "),fs(d,t),s(")"))}function W0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function K0(e,t){const{push:s,helper:a,pure:n}=t,i=je(e.callee)?e.callee:a(e.callee);n&&s(vr),s(i+"(",-2,e),$l(e.arguments,t),s(")")}function J0(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];V0(c,t),s(": "),fs(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function Z0(e,t){$d(e.elements,t)}function Y0(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${Ti[Od]}(`),s("(",-2,e),Ee(i)?$l(i,t):i&&fs(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Ee(l)?$d(l,t):fs(l,t)):o&&fs(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Q0(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!Md(s.content);u&&l("("),Hh(s,t),u&&l(")")}else l("("),fs(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),fs(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,fs(n,t),d||t.indentLevel--,i&&r(!0)}function X0(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(Fo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),fs(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(Fo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const e_=Uh(/^(?:if|else|else-if)$/,(e,t,s)=>t_(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=Xu(n,r,s);else{const c=s_(a.codegenNode);c.alternate=Xu(n,r+a.branches.length-1,s)}}}));function t_(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(Ct(28,t.loc)),t.exp=Ke("true",!1,n)}if(t.name==="if"){const n=Qu(e,t),i={type:9,loc:A0(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&Ih(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(Ct(30,e.loc)),s.removeNode();const o=Qu(e,t);l.branches.push(o);const r=a&&a(l,o,!1);hr(o,s),r&&r(),s.currentNode=null}else s.onError(Ct(30,e.loc));break}}}function Qu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!qs(e,"for")?e.children:[e],userKey:mr(e,"key"),isTemplateIf:s}}function Xu(e,t,s){return e.condition?kc(e.condition,ep(e,t,s),Gt(s.helper(Pl),['""',"true"])):ep(e,t,s)}function ep(e,t,s){const{helper:a}=s,n=Ut("key",Ke(`${t}`,!1,$s,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return Ho(r,n,s),r}else return _l(s,a(yl),Gs([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=b0(r);return c.type===13&&Nd(c,s),Ho(c,n,s),r}}function s_(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const a_=Uh("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return n_(e,t,s,i=>{const l=Gt(a(Ed),[i.source]),o=Uo(e),r=qs(e,"memo"),c=mr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ke(c.value.content,!0):void 0:c.exp);const u=d?Ut("key",d):null,p=i.source.type===4&&i.source.constType>0,m=p?64:c?128:256;return i.codegenNode=_l(s,a(yl),void 0,l,m,void 0,void 0,!0,!p,!1,e.loc),()=>{let h;const{children:g}=i,A=g.length!==1||g[0].type!==1,I=Bo(e)?e:o&&e.children.length===1&&Bo(e.children[0])?e.children[0]:null;if(I?(h=I.codegenNode,o&&u&&Ho(h,u,s)):A?h=_l(s,a(yl),u?Gs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(h=g[0].codegenNode,o&&u&&Ho(h,u,s),h.isBlock!==!p&&(h.isBlock?(n(Fn),n(Ai(s.inSSR,h.isComponent))):n(Ei(s.inSSR,h.isComponent))),h.isBlock=!p,h.isBlock?(a(Fn),a(Ai(s.inSSR,h.isComponent))):a(Ei(s.inSSR,h.isComponent))),r){const y=Ci(Cc(i.parseResult,[Ke("_cached")]));y.body=l0([ia(["const _memo = (",r.exp,")"]),ia(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(wh)}(_cached, _memo)) return _cached`]),ia(["const _item = ",h]),Ke("_item.memo = _memo"),Ke("return _item")]),l.arguments.push(y,Ke("_cache"),Ke(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Ci(Cc(i.parseResult),h,!0))}})});function n_(e,t,s,a){if(!t.exp){s.onError(Ct(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(Ct(32,t.loc));return}jh(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:Uo(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const m=a&&a(p);return()=>{o.vFor--,m&&m()}}function jh(e,t){e.finalized||(e.finalized=!0)}function Cc({value:e,key:t,index:s},a=[]){return i_([e,t,s,...a])}function i_(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ke("_".repeat(a+1),!1))}const tp=Ke("undefined",!1),l_=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=qs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},o_=(e,t,s,a)=>Ci(e,s,!1,!0,s.length?s[0].loc:a);function r_(e,t,s=o_){t.helper(Od);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=qs(e,"slot",!0);if(r){const{arg:A,exp:I}=r;A&&!Os(A)&&(o=!0),i.push(Ut(A||Ke("default",!0),s(I,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let m=0;for(let A=0;A<a.length;A++){const I=a[A];let y;if(!Uo(I)||!(y=qs(I,"slot",!0))){I.type!==3&&u.push(I);continue}if(r){t.onError(Ct(37,y.loc));break}c=!0;const{children:v,loc:b}=I,{arg:x=Ke("default",!0),exp:w,loc:E}=y;let C;Os(x)?C=x?x.content:"default":o=!0;const _=qs(I,"for"),R=s(w,_,v,b);let U,S;if(U=qs(I,"if"))o=!0,l.push(kc(U.exp,Xl(x,R,m++),tp));else if(S=qs(I,/^else(?:-if)?$/,!0)){let P=A,Y;for(;P--&&(Y=a[P],!!Ih(Y)););if(Y&&Uo(Y)&&qs(Y,/^(?:else-)?if$/)){let W=l[l.length-1];for(;W.alternate.type===19;)W=W.alternate;W.alternate=S.exp?kc(S.exp,Xl(x,R,m++),tp):Xl(x,R,m++)}else t.onError(Ct(30,S.loc))}else if(_){o=!0;const P=_.forParseResult;P?(jh(P),l.push(Gt(t.helper(Ed),[P.source,Ci(Cc(P),Xl(x,R),!0)]))):t.onError(Ct(32,_.loc))}else{if(C){if(p.has(C)){t.onError(Ct(38,E));continue}p.add(C),C==="default"&&(d=!0)}i.push(Ut(x,R))}}if(!r){const A=(I,y)=>{const v=s(I,void 0,y,n);return t.compatConfig&&(v.isNonScopedSlot=!0),Ut("default",v)};c?u.length&&!u.every(Pd)&&(d?t.onError(Ct(39,u[0].loc)):i.push(A(void 0,u))):i.push(A(void 0,a))}const h=o?2:mo(e.children)?3:1;let g=Gs(i.concat(Ut("_",Ke(h+"",!1))),n);return l.length&&(g=Gt(t.helper(_h),[g,Nn(l)])),{slots:g,hasDynamicSlots:o}}function Xl(e,t,s){const a=[Ut("name",e),Ut("fn",t)];return s!=null&&a.push(Ut("key",Ke(String(s),!0))),Gs(a)}function mo(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||mo(s.children))return!0;break;case 9:if(mo(s.branches))return!0;break;case 10:case 11:if(mo(s.children))return!0;break}}return!1}const Vh=new WeakMap,c_=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?d_(e,t):`"${a}"`;const o=ct(l)&&l.callee===kd;let r,c,d=0,u,p,m,h=o||l===nl||l===bd||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const g=qh(e,t,void 0,i,o);r=g.props,d=g.patchFlag,p=g.dynamicPropNames;const A=g.directives;m=A&&A.length?Nn(A.map(I=>p_(I,t))):void 0,g.shouldUseBlock&&(h=!0)}if(e.children.length>0)if(l===Mo&&(h=!0,d|=1024),i&&l!==nl&&l!==Mo){const{slots:A,hasDynamicSlots:I}=r_(e,t);c=A,I&&(d|=1024)}else if(e.children.length===1&&l!==nl){const A=e.children[0],I=A.type,y=I===5||I===8;y&&Ms(A,t)===0&&(d|=1),y||I===2?c=A:c=e.children}else c=e.children;p&&p.length&&(u=f_(p)),e.codegenNode=_l(t,l,r,c,d===0?void 0:d,u,m,!!h,!1,i,e.loc)};function d_(e,t,s=!1){let{tag:a}=e;const n=Ec(a),i=mr(e,"is",!1,!0);if(i)if(n||Dn("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ke(i.value.content,!0):(o=i.exp,o||(o=Ke("is",!1,i.arg.loc))),o)return Gt(t.helper(kd),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=Sh(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(wd),t.components.add(a),kl(a,"component"))}function qh(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let m=!1,h=0,g=!1,A=!1,I=!1,y=!1,v=!1,b=!1;const x=[],w=R=>{c.length&&(d.push(Gs(sp(c),o)),c=[]),R&&d.push(R)},E=()=>{t.scopes.vFor>0&&c.push(Ut(Ke("ref_for",!0),Ke("true")))},C=({key:R,value:U})=>{if(Os(R)){const S=R.content,P=Un(S);if(P&&(!a||n)&&S.toLowerCase()!=="onclick"&&S!=="onUpdate:modelValue"&&!$a(S)&&(y=!0),P&&$a(S)&&(b=!0),P&&U.type===14&&(U=U.arguments[0]),U.type===20||(U.type===4||U.type===8)&&Ms(U,t)>0)return;S==="ref"?g=!0:S==="class"?A=!0:S==="style"?I=!0:S!=="key"&&!x.includes(S)&&x.push(S),a&&(S==="class"||S==="style")&&!x.includes(S)&&x.push(S)}else v=!0};for(let R=0;R<s.length;R++){const U=s[R];if(U.type===6){const{loc:S,name:P,nameLoc:Y,value:W}=U;let D=!0;if(P==="ref"&&(g=!0,E()),P==="is"&&(Ec(l)||W&&W.content.startsWith("vue:")||Dn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Ut(Ke(P,!0,Y),Ke(W?W.content:"",D,W?W.loc:S)))}else{const{name:S,arg:P,exp:Y,loc:W,modifiers:D}=U,O=S==="bind",M=S==="on";if(S==="slot"){a||t.onError(Ct(40,W));continue}if(S==="once"||S==="memo"||S==="is"||O&&En(P,"is")&&(Ec(l)||Dn("COMPILER_IS_ON_ELEMENT",t))||M&&i)continue;if((O&&En(P,"key")||M&&p&&En(P,"vue:before-update"))&&(m=!0),O&&En(P,"ref")&&E(),!P&&(O||M)){if(v=!0,Y)if(O){if(w(),Dn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Y);continue}E(),w(),d.push(Y)}else w({type:14,loc:W,callee:t.helper(Id),arguments:a?[Y]:[Y,"true"]});else t.onError(Ct(O?34:35,W));continue}O&&D.some(ie=>ie.content==="prop")&&(h|=32);const ae=t.directiveTransforms[S];if(ae){const{props:ie,needRuntime:B}=ae(U,e,t);!i&&ie.forEach(C),M&&P&&!Os(P)?w(Gs(ie,o)):c.push(...ie),B&&(u.push(U),ms(B)&&Vh.set(U,B))}else ag(S)||(u.push(U),p&&(m=!0))}}let _;if(d.length?(w(),d.length>1?_=Gt(t.helper(Po),d,o):_=d[0]):c.length&&(_=Gs(sp(c),o)),v?h|=16:(A&&!a&&(h|=2),I&&!a&&(h|=4),x.length&&(h|=8),y&&(h|=32)),!m&&(h===0||h===32)&&(g||b||u.length>0)&&(h|=512),!t.inSSR&&_)switch(_.type){case 15:let R=-1,U=-1,S=!1;for(let W=0;W<_.properties.length;W++){const D=_.properties[W].key;Os(D)?D.content==="class"?R=W:D.content==="style"&&(U=W):D.isHandlerKey||(S=!0)}const P=_.properties[R],Y=_.properties[U];S?_=Gt(t.helper(xl),[_]):(P&&!Os(P.value)&&(P.value=Gt(t.helper(Ad),[P.value])),Y&&(I||Y.value.type===4&&Y.value.content.trim()[0]==="["||Y.value.type===17)&&(Y.value=Gt(t.helper(Rd),[Y.value])));break;case 14:break;default:_=Gt(t.helper(xl),[Gt(t.helper(Fl),[_])]);break}return{props:_,directives:u,patchFlag:h,dynamicPropNames:x,shouldUseBlock:m}}function sp(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Un(i))&&u_(l,n):(t.set(i,n),s.push(n))}return s}function u_(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Nn([e.value,t.value],e.loc)}function p_(e,t){const s=[],a=Vh.get(e);a?s.push(t.helperString(a)):(t.helper(Sd),t.directives.add(e.name),s.push(kl(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ke("true",!1,n);s.push(Gs(e.modifiers.map(l=>Ut(l,i)),n))}return Nn(s,e.loc)}function f_(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function Ec(e){return e==="component"||e==="Component"}const m_=(e,t)=>{if(Bo(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=h_(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=Ci([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Gt(t.helper(xh),l,a)}};function h_(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=bt(l.name),n.push(l)));else if(l.name==="bind"&&En(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=bt(l.arg.content);s=l.exp=Ke(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Os(l.arg)&&(l.arg.content=bt(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=qh(e,t,n,!1,!1);a=i,l.length&&t.onError(Ct(36,l[0].loc))}return{slotName:s,slotProps:a}}const Gh=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(Ct(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?pi(bt(u)):`on:${u}`;o=Ke(p,!0,l.loc)}else o=ia([`${s.helperString(wc)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(wc)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=Eh(r),p=!(u||m0(r)),m=r.content.includes(";");(p||c&&u)&&(r=ia([`${p?"$event":"(...args)"} => ${m?"{":"("}`,r,m?"}":")"]))}let d={props:[Ut(o,r||Ke("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},v_=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=bt(i.content):i.content=`${s.helperString(_c)}(${i.content})`:(i.children.unshift(`${s.helperString(_c)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&ap(i,"."),a.some(o=>o.content==="attr")&&ap(i,"^")),{props:[Ut(i,l)]}},ap=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},g_=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Br(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(Br(r))a||(a=s[i]=ia([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Br(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Ms(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Gt(t.helper(_d),o)}}}}},np=new WeakSet,b_=(e,t)=>{if(e.type===1&&qs(e,"once",!0))return np.has(e)||t.inVOnce||t.inSSR?void 0:(np.add(e),t.inVOnce=!0,t.helper(Fo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Wh=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(Ct(41,e.loc)),Bi();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(Ct(44,a.loc)),Bi();if(o==="literal-const"||o==="setup-const")return s.onError(Ct(45,a.loc)),Bi();if(!l.trim()||!Eh(a))return s.onError(Ct(42,a.loc)),Bi();const r=n||Ke("modelValue",!0),c=n?Os(n)?`onUpdate:${bt(n.content)}`:ia(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=ia([`${u} => ((`,a,") = $event)"]);const p=[Ut(r,e.exp),Ut(c,d)];if(e.modifiers.length&&t.tagType===1){const m=e.modifiers.map(g=>g.content).map(g=>(Md(g)?g:JSON.stringify(g))+": true").join(", "),h=n?Os(n)?`${n.content}Modifiers`:ia([n,' + "Modifiers"']):"modelModifiers";p.push(Ut(h,Ke(`{ ${m} }`,!1,e.loc,2)))}return Bi(p)};function Bi(e=[]){return{props:e}}const y_=/[\w).+\-_$\]]/,x_=(e,t)=>{Dn("COMPILER_FILTERS",t)&&(e.type===5?zo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&zo(s.exp,t)}))};function zo(e,t){if(e.type===4)ip(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?ip(a,t):a.type===8?zo(e,t):a.type===5&&zo(a.content,t))}}function ip(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,m,h,g=[];for(m=0;m<s.length;m++)if(p=u,u=s.charCodeAt(m),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(m+1)!==124&&s.charCodeAt(m-1)!==124&&!o&&!r&&!c)h===void 0?(d=m+1,h=s.slice(0,m).trim()):A();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let I=m-1,y;for(;I>=0&&(y=s.charAt(I),y===" ");I--);(!y||!y_.test(y))&&(l=!0)}}h===void 0?h=s.slice(0,m).trim():d!==0&&A();function A(){g.push(s.slice(d,m).trim()),d=m+1}if(g.length){for(m=0;m<g.length;m++)h=__(h,g[m],t);e.content=h,e.ast=void 0}}function __(e,t,s){s.helper(Td);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${kl(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${kl(n,"filter")}(${e}${i!==")"?","+i:i}`}}const lp=new WeakSet,w_=(e,t)=>{if(e.type===1){const s=qs(e,"memo");return!s||lp.has(e)||t.inSSR?void 0:(lp.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&Nd(a,t),e.codegenNode=Gt(t.helper(Ld),[s.exp,Ci(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},k_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(Ct(53,a.loc)),s.exp=Ke("",!0,a.loc);else{const n=bt(a.content);(Th.test(n[0])||n[0]==="-")&&(s.exp=Ke(n,!1,a.loc))}}}};function S_(e){return[[k_,b_,e_,w_,a_,x_,m_,c_,l_,g_],{on:Gh,bind:v_,model:Wh}]}function T_(e,t={}){const s=t.onError||Dd,a=t.mode==="module";t.prefixIdentifiers===!0?s(Ct(48)):a&&s(Ct(49));const n=!1;t.cacheHandlers&&s(Ct(50)),t.scopeId&&!a&&s(Ct(51));const i=Xe({},t,{prefixIdentifiers:n}),l=je(e)?O0(e,i):e,[o,r]=S_();return M0(l,Xe({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:Xe({},r,t.directiveTransforms||{})})),U0(l,i)}const C_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Kh=Symbol(""),Jh=Symbol(""),Zh=Symbol(""),Yh=Symbol(""),Ac=Symbol(""),Qh=Symbol(""),Xh=Symbol(""),ev=Symbol(""),tv=Symbol(""),sv=Symbol("");a0({[Kh]:"vModelRadio",[Jh]:"vModelCheckbox",[Zh]:"vModelText",[Yh]:"vModelSelect",[Ac]:"vModelDynamic",[Qh]:"withModifiers",[Xh]:"withKeys",[ev]:"vShow",[tv]:"Transition",[sv]:"TransitionGroup"});let Xn;function E_(e,t=!1){return Xn||(Xn=document.createElement("div")),t?(Xn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Xn.children[0].getAttribute("foo")):(Xn.innerHTML=e,Xn.textContent)}const A_={parseMode:"html",isVoidTag:xg,isNativeTag:e=>gg(e)||bg(e)||yg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:E_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return tv;if(e==="TransitionGroup"||e==="transition-group")return sv},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},R_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ke("style",!0,t.loc),exp:I_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},I_=(e,t)=>{const s=hf(e);return Ke(JSON.stringify(s),!1,t,3)};function un(e,t){return Ct(e,t)}const O_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(un(54,n)),t.children.length&&(s.onError(un(55,n)),t.children.length=0),{props:[Ut(Ke("innerHTML",!0,n),a||Ke("",!0))]}},L_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(un(56,n)),t.children.length&&(s.onError(un(57,n)),t.children.length=0),{props:[Ut(Ke("textContent",!0),a?Ms(a,s)>0?a:Gt(s.helperString(fr),[a],n):Ke("",!0))]}},N_=(e,t,s)=>{const a=Wh(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(un(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Zh,o=!1;if(n==="input"||i){const r=mr(t,"type");if(r){if(r.type===7)l=Ac;else if(r.value)switch(r.value.content){case"radio":l=Kh;break;case"checkbox":l=Jh;break;case"file":o=!0,s.onError(un(60,e.loc));break}}else h0(t)&&(l=Ac)}else n==="select"&&(l=Yh);o||(a.needRuntime=s.helper(l))}else s.onError(un(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},D_=Fs("passive,once,capture"),M_=Fs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),P_=Fs("left,right"),av=Fs("onkeyup,onkeydown,onkeypress"),F_=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&wl("COMPILER_V_ON_NATIVE",s)||D_(r)?l.push(r):P_(r)?Os(e)?av(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):M_(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},op=(e,t)=>Os(e)&&e.content.toLowerCase()==="onclick"?Ke(t,!0):e.type!==4?ia(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,$_=(e,t,s)=>Gh(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=F_(i,n,s,e.loc);if(r.includes("right")&&(i=op(i,"onContextmenu")),r.includes("middle")&&(i=op(i,"onMouseup")),r.length&&(l=Gt(s.helper(Qh),[l,JSON.stringify(r)])),o.length&&(!Os(i)||av(i.content.toLowerCase()))&&(l=Gt(s.helper(Xh),[l,JSON.stringify(o)])),c.length){const d=c.map(Hn).join("");i=Os(i)?Ke(`${i.content}${d}`,!0):ia(["(",i,`) + "${d}"`])}return{props:[Ut(i,l)]}}),U_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(un(62,n)),{props:[],needRuntime:s.helper(ev)}},B_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},H_=[R_],z_={cloak:C_,html:O_,text:L_,model:N_,on:$_,show:U_};function j_(e,t={}){return T_(e,Xe({},A_,t,{nodeTransforms:[B_,...H_,...t.nodeTransforms||[]],directiveTransforms:Xe({},z_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const rp=Object.create(null);function V_(e,t){if(!je(e))if(e.nodeType)e=e.innerHTML;else return ls;const s=lg(e,t),a=rp[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=Xe({hoistStatic:!0,onError:void 0,onWarn:ls},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=j_(e,n),l=new Function("Vue",i)(Yx);return l._rc=!0,rp[s]=l}Bm(V_);const jo=fn({items:[]});let q_=1;function gr(e,t="info",s=3e3){const a=q_++;return jo.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>Ud(a),s),a}function Ud(e){const t=jo.items.findIndex(s=>s.id===e);t>=0&&jo.items.splice(t,1)}function _e(e,t="info",s=3e3){return gr(e,t,s)}_e.success=(e,t=3e3)=>gr(e,"success",t);_e.error=(e,t=5e3)=>gr(e,"error",t);_e.info=(e,t=3e3)=>gr(e,"info",t);_e.dismiss=Ud;const G_={setup(){return{state:jo,dismiss:Ud}},template:`
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
  `},La=fn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let bi=null;function Xt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return bi&&bi(!1),La.title=e,La.message=t,La.confirmLabel=s,La.cancelLabel=a,La.danger=n,La.open=!0,new Promise(i=>{bi=i})}function cp(e){La.open=!1,bi&&(bi(e),bi=null)}const W_={setup(){function e(t){La.open&&t.key==="Escape"&&(t.stopPropagation(),cp(!1))}return Qe(()=>document.addEventListener("keydown",e,!0)),gt(()=>document.removeEventListener("keydown",e,!0)),{state:La,settle:cp}},template:`
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
 */const ii=typeof document<"u";function nv(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function K_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&nv(e.default)}const ht=Object.assign;function zr(e,t){const s={};for(const a in t){const n=t[a];s[a]=oa(n)?n.map(e):e(n)}return s}const il=()=>{},oa=Array.isArray;function dp(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const iv=/#/g,J_=/&/g,Z_=/\//g,Y_=/=/g,Q_=/\?/g,lv=/\+/g,X_=/%5B/g,ew=/%5D/g,ov=/%5E/g,tw=/%60/g,rv=/%7B/g,sw=/%7C/g,cv=/%7D/g,aw=/%20/g;function Bd(e){return e==null?"":encodeURI(""+e).replace(sw,"|").replace(X_,"[").replace(ew,"]")}function nw(e){return Bd(e).replace(rv,"{").replace(cv,"}").replace(ov,"^")}function Rc(e){return Bd(e).replace(lv,"%2B").replace(aw,"+").replace(iv,"%23").replace(J_,"%26").replace(tw,"`").replace(rv,"{").replace(cv,"}").replace(ov,"^")}function iw(e){return Rc(e).replace(Y_,"%3D")}function lw(e){return Bd(e).replace(iv,"%23").replace(Q_,"%3F")}function ow(e){return lw(e).replace(Z_,"%2F")}function Tl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const rw=/\/$/,cw=e=>e.replace(rw,"");function jr(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=fw(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:Tl(l)}}function dw(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function up(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function uw(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&Ri(t.matched[a],s.matched[n])&&dv(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ri(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function dv(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!pw(e[s],t[s]))return!1;return!0}function pw(e,t){return oa(e)?pp(e,t):oa(t)?pp(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function pp(e,t){return oa(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function fw(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const tn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Ic=(function(e){return e.pop="pop",e.push="push",e})({}),Vr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function mw(e){if(!e)if(ii){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),cw(e)}const hw=/^[^#]+#/;function vw(e,t){return e.replace(hw,"#")+t}function gw(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const br=()=>({left:window.scrollX,top:window.scrollY});function bw(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=gw(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function fp(e,t){return(history.state?history.state.position-t:-1)+e}const Oc=new Map;function yw(e,t){Oc.set(e,t)}function xw(e){const t=Oc.get(e);return Oc.delete(e),t}function _w(e){return typeof e=="string"||e&&typeof e=="object"}function uv(e){return typeof e=="string"||typeof e=="symbol"}let Lt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const pv=Symbol("");Lt.MATCHER_NOT_FOUND+"",Lt.NAVIGATION_GUARD_REDIRECT+"",Lt.NAVIGATION_ABORTED+"",Lt.NAVIGATION_CANCELLED+"",Lt.NAVIGATION_DUPLICATED+"";function Ii(e,t){return ht(new Error,{type:e,[pv]:!0},t)}function Ea(e,t){return e instanceof Error&&pv in e&&(t==null||!!(e.type&t))}const ww=["params","query","hash"];function kw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of ww)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Sw(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(lv," "),i=n.indexOf("="),l=Tl(i<0?n:n.slice(0,i)),o=i<0?null:Tl(n.slice(i+1));if(l in t){let r=t[l];oa(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function mp(e){let t="";for(let s in e){const a=e[s];if(s=iw(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(oa(a)?a.map(n=>n&&Rc(n)):[a&&Rc(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function Tw(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=oa(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const Cw=Symbol(""),hp=Symbol(""),yr=Symbol(""),Hd=Symbol(""),Lc=Symbol("");function Hi(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function rn(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(Ii(Lt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):_w(p)?r(Ii(Lt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function qr(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(nv(r)){const c=(r.__vccOpts||r)[t];c&&i.push(rn(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=K_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&rn(p,s,a,l,o,n)()}))}}return i}function Ew(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>Ri(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>Ri(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let Aw=()=>location.protocol+"//"+location.host;function fv(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),up(o,"")}return up(s,e)+a+n}function Rw(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const m=fv(e,location),h=s.value,g=t.value;let A=0;if(p){if(s.value=m,t.value=p,l&&l===h){l=null;return}A=g?p.position-g.position:0}else a(m);n.forEach(I=>{I(s.value,h,{delta:A,type:Ic.pop,direction:A?A>0?Vr.forward:Vr.back:Vr.unknown})})};function r(){l=s.value}function c(p){n.push(p);const m=()=>{const h=n.indexOf(p);h>-1&&n.splice(h,1)};return i.push(m),m}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(ht({},p.state,{scroll:br()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function vp(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?br():null}}function Iw(e){const{history:t,location:s}=window,a={value:fv(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:Aw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(m){console.error(m),s[d?"replace":"assign"](p)}}function l(r,c){i(r,ht({},t.state,vp(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=ht({},n.value,t.state,{forward:r,scroll:br()});i(d.current,d,!0),i(r,ht({},vp(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function Ow(e){e=mw(e);const t=Iw(e),s=Rw(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=ht({location:"",base:e,go:a,createHref:vw.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function Lw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),Ow(e)}let Rn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Vt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Vt||{});const Nw={type:Rn.Static,value:""},Dw=/[a-zA-Z0-9_]/;function Mw(e){if(!e)return[[]];if(e==="/")return[[Nw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(m){throw new Error(`ERR (${s})/"${c}": ${m}`)}let s=Vt.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Vt.Static?i.push({type:Rn.Static,value:c}):s===Vt.Param||s===Vt.ParamRegExp||s===Vt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Rn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Vt.ParamRegExp){a=s,s=Vt.EscapeNext;continue}switch(s){case Vt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Vt.Param):p();break;case Vt.EscapeNext:p(),s=a;break;case Vt.Param:r==="("?s=Vt.ParamRegExp:Dw.test(r)?p():(u(),s=Vt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Vt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Vt.ParamRegExpEnd:d+=r;break;case Vt.ParamRegExpEnd:u(),s=Vt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Vt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const gp="[^/]+?",Pw={sensitive:!1,strict:!1,start:!0,end:!0};var _s=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(_s||{});const Fw=/[.+*?^${}()[\]/\\]/g;function $w(e,t){const s=ht({},Pw,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[_s.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let m=_s.Segment+(s.sensitive?_s.BonusCaseSensitive:0);if(p.type===Rn.Static)u||(n+="/"),n+=p.value.replace(Fw,"\\$&"),m+=_s.Static;else if(p.type===Rn.Param){const{value:h,repeatable:g,optional:A,regexp:I}=p;i.push({name:h,repeatable:g,optional:A});const y=I||gp;if(y!==gp){m+=_s.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${h}" (${y}): `+b.message)}}let v=g?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(v=A&&c.length<2?`(?:/${v})`:"/"+v),A&&(v+="?"),n+=v,m+=_s.Dynamic,A&&(m+=_s.BonusOptional),g&&(m+=_s.BonusRepeatable),y===".*"&&(m+=_s.BonusWildcard)}d.push(m)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=_s.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const m=d[p]||"",h=i[p-1];u[h.name]=m&&h.repeatable?m.split("/"):m}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const m of p)if(m.type===Rn.Static)d+=m.value;else if(m.type===Rn.Param){const{value:h,repeatable:g,optional:A}=m,I=h in c?c[h]:"";if(oa(I)&&!g)throw new Error(`Provided param "${h}" is an array but it is not repeatable (* or + modifiers)`);const y=oa(I)?I.join("/"):I;if(!y)if(A)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${h}"`);d+=y}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function Uw(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===_s.Static+_s.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===_s.Static+_s.Segment?1:-1:0}function mv(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=Uw(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(bp(a))return 1;if(bp(n))return-1}return n.length-a.length}function bp(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const Bw={strict:!1,end:!0,sensitive:!1};function Hw(e,t,s){const a=$w(Mw(e.path),s),n=ht(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function zw(e,t){const s=[],a=new Map;t=dp(Bw,t);function n(u){return a.get(u)}function i(u,p,m){const h=!m,g=xp(u);g.aliasOf=m&&m.record;const A=dp(t,u),I=[g];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const x of b)I.push(xp(ht({},g,{components:m?m.record.components:g.components,path:x,aliasOf:m?m.record:g})))}let y,v;for(const b of I){const{path:x}=b;if(p&&x[0]!=="/"){const w=p.record.path,E=w[w.length-1]==="/"?"":"/";b.path=p.record.path+(x&&E+x)}if(y=Hw(b,p,A),m?m.alias.push(y):(v=v||y,v!==y&&v.alias.push(y),h&&u.name&&!_p(y)&&l(u.name)),hv(y)&&r(y),g.children){const w=g.children;for(let E=0;E<w.length;E++)i(w[E],y,m&&m.children[E])}m=m||y}return v?()=>{l(v)}:il}function l(u){if(uv(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=qw(u,s);s.splice(p,0,u),u.record.name&&!_p(u)&&a.set(u.record.name,u)}function c(u,p){let m,h={},g,A;if("name"in u&&u.name){if(m=a.get(u.name),!m)throw Ii(Lt.MATCHER_NOT_FOUND,{location:u});A=m.record.name,h=ht(yp(p.params,m.keys.filter(v=>!v.optional).concat(m.parent?m.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),u.params&&yp(u.params,m.keys.map(v=>v.name))),g=m.stringify(h)}else if(u.path!=null)g=u.path,m=s.find(v=>v.re.test(g)),m&&(h=m.parse(g),A=m.record.name);else{if(m=p.name?a.get(p.name):s.find(v=>v.re.test(p.path)),!m)throw Ii(Lt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});A=m.record.name,h=ht({},p.params,u.params),g=m.stringify(h)}const I=[];let y=m;for(;y;)I.unshift(y.record),y=y.parent;return{name:A,path:g,params:h,matched:I,meta:Vw(I)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function yp(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function xp(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:jw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function jw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function _p(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Vw(e){return e.reduce((t,s)=>ht(t,s.meta),{})}function qw(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;mv(e,t[i])<0?a=i:s=i+1}const n=Gw(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function Gw(e){let t=e;for(;t=t.parent;)if(hv(t)&&mv(e,t)===0)return t}function hv({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function wp(e){const t=Ws(yr),s=Ws(Hd),a=j(()=>{const r=va(e.to);return t.resolve(r)}),n=j(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(Ri.bind(null,d));if(p>-1)return p;const m=kp(r[c-2]);return c>1&&kp(d)===m&&u[u.length-1].path!==m?u.findIndex(Ri.bind(null,r[c-2])):p}),i=j(()=>n.value>-1&&Yw(s.params,a.value.params)),l=j(()=>n.value>-1&&n.value===s.matched.length-1&&dv(s.params,a.value.params));function o(r={}){if(Zw(r)){const c=t[va(e.replace)?"replace":"push"](va(e.to)).catch(il);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:j(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function Ww(e){return e.length===1?e[0]:e}const Kw=Nl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:wp,setup(e,{slots:t}){const s=fn(wp(e)),{options:a}=Ws(yr),n=j(()=>({[Sp(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[Sp(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Ww(t.default(s));return e.custom?i:wi("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),Jw=Kw;function Zw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Yw(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!oa(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function kp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Sp=(e,t,s)=>e??t??s,Qw=Nl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=Ws(Lc),n=j(()=>e.route||a.value),i=Ws(hp,0),l=j(()=>{let c=va(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=j(()=>n.value.matched[l.value]);el(hp,j(()=>l.value+1)),el(Cw,o),el(Lc,n);const r=f();return Ht(()=>[r.value,o.value,e.name],([c,d,u],[p,m,h])=>{d&&(d.instances[u]=c,m&&m!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=m.leaveGuards),d.updateGuards.size||(d.updateGuards=m.updateGuards))),c&&d&&(!m||!Ri(d,m)||!p)&&(d.enterCallbacks[u]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return Tp(s.default,{Component:p,route:c});const m=u.props[d],h=m?m===!0?c.params:typeof m=="function"?m(c):m:null,A=wi(p,ht({},h,t,{onVnodeUnmounted:I=>{I.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return Tp(s.default,{Component:A,route:c})||A}}});function Tp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Xw=Qw;function ek(e){const t=zw(e.routes,e),s=e.parseQuery||Sw,a=e.stringifyQuery||mp,n=e.history,i=Hi(),l=Hi(),o=Hi(),r=Yc(tn);let c=tn;ii&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=zr.bind(null,K=>""+K),u=zr.bind(null,ow),p=zr.bind(null,Tl);function m(K,de){let he,ge;return uv(K)?(he=t.getRecordMatcher(K),ge=de):ge=K,t.addRoute(ge,he)}function h(K){const de=t.getRecordMatcher(K);de&&t.removeRoute(de)}function g(){return t.getRoutes().map(K=>K.record)}function A(K){return!!t.getRecordMatcher(K)}function I(K,de){if(de=ht({},de||r.value),typeof K=="string"){const N=jr(s,K,de.path),V=t.resolve({path:N.path},de),pe=n.createHref(N.fullPath);return ht(N,V,{params:p(V.params),hash:Tl(N.hash),redirectedFrom:void 0,href:pe})}let he;if(K.path!=null)he=ht({},K,{path:jr(s,K.path,de.path).path});else{const N=ht({},K.params);for(const V in N)N[V]==null&&delete N[V];he=ht({},K,{params:u(N)}),de.params=u(de.params)}const ge=t.resolve(he,de),xe=K.hash||"";ge.params=d(p(ge.params));const De=dw(a,ht({},K,{hash:nw(xe),path:ge.path})),T=n.createHref(De);return ht({fullPath:De,hash:xe,query:a===mp?Tw(K.query):K.query||{}},ge,{redirectedFrom:void 0,href:T})}function y(K){return typeof K=="string"?jr(s,K,r.value.path):ht({},K)}function v(K,de){if(c!==K)return Ii(Lt.NAVIGATION_CANCELLED,{from:de,to:K})}function b(K){return E(K)}function x(K){return b(ht(y(K),{replace:!0}))}function w(K,de){const he=K.matched[K.matched.length-1];if(he&&he.redirect){const{redirect:ge}=he;let xe=typeof ge=="function"?ge(K,de):ge;return typeof xe=="string"&&(xe=xe.includes("?")||xe.includes("#")?xe=y(xe):{path:xe},xe.params={}),ht({query:K.query,hash:K.hash,params:xe.path!=null?{}:K.params},xe)}}function E(K,de){const he=c=I(K),ge=r.value,xe=K.state,De=K.force,T=K.replace===!0,N=w(he,ge);if(N)return E(ht(y(N),{state:typeof N=="object"?ht({},xe,N.state):xe,force:De,replace:T}),de||he);const V=he;V.redirectedFrom=de;let pe;return!De&&uw(a,ge,he)&&(pe=Ii(Lt.NAVIGATION_DUPLICATED,{to:V,from:ge}),B(ge,ge,!0,!1)),(pe?Promise.resolve(pe):R(V,ge)).catch($=>Ea($)?Ea($,Lt.NAVIGATION_GUARD_REDIRECT)?$:ie($):M($,V,ge)).then($=>{if($){if(Ea($,Lt.NAVIGATION_GUARD_REDIRECT))return E(ht({replace:T},y($.to),{state:typeof $.to=="object"?ht({},xe,$.to.state):xe,force:De}),de||V)}else $=S(V,ge,!0,T,xe);return U(V,ge,$),$})}function C(K,de){const he=v(K,de);return he?Promise.reject(he):Promise.resolve()}function _(K){const de=q.values().next().value;return de&&typeof de.runWithContext=="function"?de.runWithContext(K):K()}function R(K,de){let he;const[ge,xe,De]=Ew(K,de);he=qr(ge.reverse(),"beforeRouteLeave",K,de);for(const N of ge)N.leaveGuards.forEach(V=>{he.push(rn(V,K,de))});const T=C.bind(null,K,de);return he.push(T),me(he).then(()=>{he=[];for(const N of i.list())he.push(rn(N,K,de));return he.push(T),me(he)}).then(()=>{he=qr(xe,"beforeRouteUpdate",K,de);for(const N of xe)N.updateGuards.forEach(V=>{he.push(rn(V,K,de))});return he.push(T),me(he)}).then(()=>{he=[];for(const N of De)if(N.beforeEnter)if(oa(N.beforeEnter))for(const V of N.beforeEnter)he.push(rn(V,K,de));else he.push(rn(N.beforeEnter,K,de));return he.push(T),me(he)}).then(()=>(K.matched.forEach(N=>N.enterCallbacks={}),he=qr(De,"beforeRouteEnter",K,de,_),he.push(T),me(he))).then(()=>{he=[];for(const N of l.list())he.push(rn(N,K,de));return he.push(T),me(he)}).catch(N=>Ea(N,Lt.NAVIGATION_CANCELLED)?N:Promise.reject(N))}function U(K,de,he){o.list().forEach(ge=>_(()=>ge(K,de,he)))}function S(K,de,he,ge,xe){const De=v(K,de);if(De)return De;const T=de===tn,N=ii?history.state:{};he&&(ge||T?n.replace(K.fullPath,ht({scroll:T&&N&&N.scroll},xe)):n.push(K.fullPath,xe)),r.value=K,B(K,de,he,T),ie()}let P;function Y(){P||(P=n.listen((K,de,he)=>{if(!ce.listening)return;const ge=I(K),xe=w(ge,ce.currentRoute.value);if(xe){E(ht(xe,{replace:!0,force:!0}),ge).catch(il);return}c=ge;const De=r.value;ii&&yw(fp(De.fullPath,he.delta),br()),R(ge,De).catch(T=>Ea(T,Lt.NAVIGATION_ABORTED|Lt.NAVIGATION_CANCELLED)?T:Ea(T,Lt.NAVIGATION_GUARD_REDIRECT)?(E(ht(y(T.to),{force:!0}),ge).then(N=>{Ea(N,Lt.NAVIGATION_ABORTED|Lt.NAVIGATION_DUPLICATED)&&!he.delta&&he.type===Ic.pop&&n.go(-1,!1)}).catch(il),Promise.reject()):(he.delta&&n.go(-he.delta,!1),M(T,ge,De))).then(T=>{T=T||S(ge,De,!1),T&&(he.delta&&!Ea(T,Lt.NAVIGATION_CANCELLED)?n.go(-he.delta,!1):he.type===Ic.pop&&Ea(T,Lt.NAVIGATION_ABORTED|Lt.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),U(ge,De,T)}).catch(il)}))}let W=Hi(),D=Hi(),O;function M(K,de,he){ie(K);const ge=D.list();return ge.length?ge.forEach(xe=>xe(K,de,he)):console.error(K),Promise.reject(K)}function ae(){return O&&r.value!==tn?Promise.resolve():new Promise((K,de)=>{W.add([K,de])})}function ie(K){return O||(O=!K,Y(),W.list().forEach(([de,he])=>K?he(K):de()),W.reset()),K}function B(K,de,he,ge){const{scrollBehavior:xe}=e;if(!ii||!xe)return Promise.resolve();const De=!he&&xw(fp(K.fullPath,0))||(ge||!he)&&history.state&&history.state.scroll||null;return Pt().then(()=>xe(K,de,De)).then(T=>T&&bw(T)).catch(T=>M(T,K,de))}const Z=K=>n.go(K);let le;const q=new Set,ce={currentRoute:r,listening:!0,addRoute:m,removeRoute:h,clearRoutes:t.clearRoutes,hasRoute:A,getRoutes:g,resolve:I,options:e,push:b,replace:x,go:Z,back:()=>Z(-1),forward:()=>Z(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:D.add,isReady:ae,install(K){K.component("RouterLink",Jw),K.component("RouterView",Xw),K.config.globalProperties.$router=ce,Object.defineProperty(K.config.globalProperties,"$route",{enumerable:!0,get:()=>va(r)}),ii&&!le&&r.value===tn&&(le=!0,b(n.location).catch(ge=>{}));const de={};for(const ge in tn)Object.defineProperty(de,ge,{get:()=>r.value[ge],enumerable:!0});K.provide(yr,ce),K.provide(Hd,Zc(de)),K.provide(Lc,r);const he=K.unmount;q.add(K),K.unmount=function(){q.delete(K),q.size<1&&(c=tn,P&&P(),P=null,r.value=tn,le=!1,O=!1),he()}}};function me(K){return K.reduce((de,he)=>de.then(()=>_(he)),Promise.resolve())}return ce}function vv(){return Ws(yr)}function tk(e){return Ws(Hd)}const xr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=tk(),s=vv(),a=j({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=j(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=j(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Ht(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},Cl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),ya=e=>Number.isSafeInteger(e)&&e>=0,sk=e=>e===null||typeof e=="string",Vo=(e,t)=>ya(e)&&ya(t)&&t>=e,zd=e=>Cl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&sk(e.cursor);function ak(e){return!zd(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&Cl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!ya(e.total_chars)||!ya(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!Vo(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&Cl(e.tail)&&typeof e.tail.text=="string"&&Vo(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function Cp(e){return zd(e)&&e.kind==="process_output"&&ya(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>ya(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&Vo(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function nk(e){return zd(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>ya(e[t]))&&Vo(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&ya(e.tools_omitted)}function Nc(e){try{return JSON.parse(e)}catch{return}}const Dc=e=>JSON.stringify(e,null,2),ik=e=>{const t=Nc(e);return t===void 0?e:Dc(t)},eo=(e,t,s)=>`[${e}, ${t}) ${s}`;function gv(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:Dc(e)??"";let a=typeof e=="string"?Nc(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=Nc(e.slice(d+c.length)),m=e.slice(0,u);Cp(p)&&!("text"in p)&&m.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?ik(d):d});if(Cl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||ya(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...ya(a.original_chars)?[`original ${a.original_chars} code points`]:[]],Cl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(ak(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${eo(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${eo(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(Cp(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>eo(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(nk(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${eo(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?Dc(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function bv(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Gr=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),lk=e=>e!==null&&typeof e=="object",ok=new Set(["_hmac","_prev_hmac"]),Mc=e=>e.replace(/\r\n?/g,`
`);function El(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(ok.has(n)){s=!0;return}return i});return Mc(s?JSON.stringify(a):t)}catch{return Mc(t)}}function rk(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&lk(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function ck(e){var m;const t=gv(typeof e=="string"?Mc(e):e,{prettyPrint:!1}),s=t.sections.map(h=>({...h,text:El(h.text)})),a=s.map(h=>h.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Gr.inlineChars||o&&n.length>0,c=s.filter(h=>h.text).map(h=>{let g=h.text;try{g=JSON.stringify(JSON.parse(g),null,2)}catch{}return h.label?`${h.label}
${g}`:g}).join(`

`).replace(/\n$/,""),d=bv(c,Gr.previewLines,Gr.previewChars),u=t.kind==="audit_preview"?(m=t.metadata)==null?void 0:m.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:rk(t)}}const dk={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=j(()=>ck(e.value)),c=j(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=j(()=>a.value?c.value:r.value.formatted),u=j(()=>r.value.promoted&&r.value.preview.folded||o.value),p=j(()=>t.value?!!d.value:r.value.promoted),m=j(()=>p.value?"":r.value.summary);let h;function g(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function A(){h==null||h.disconnect();for(const b of[i.value,l.value])b&&(h==null||h.observe(b));g()}function I(){t.value=!t.value,t.value||(a.value=!1)}function y(){a.value=!a.value,t.value=!0,n.value=""}async function v(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(n.value="Copied")}catch{b===e.value&&(n.value="Copy unavailable — select text manually")}}return Ht([()=>e.value,()=>e.rawValue,()=>e.recordId],(b,x)=>{(e.recordId===null||b[2]!==x[2])&&(t.value=!1,a.value=!1),n.value=""}),Ht([i,l,t,s,r],()=>Pt(A),{flush:"post"}),Qe(()=>{h=new ResizeObserver(g),A()}),gt(()=>h==null?void 0:h.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:m,toggleExpanded:I,toggleRaw:y,copyOutput:v}},template:`
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
    </section>`},_r={name:"ToolOutput",components:{CompactOutput:dk},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=j(()=>gv(e.value)),l=j(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=j(()=>{let u=30,p=6e3;return l.value.map(m=>{const h=bv(m.text,u,p);return u=Math.max(0,u-h.lines),p=Math.max(0,p-h.chars),{...m,display:t.value?m.text:h.text,folded:h.folded}})}),r=j(()=>o.value.some(u=>u.folded)),c=j(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return Ht(()=>e.value,()=>{t.value=!1,n.value=""}),Ht(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},uk={components:{ToolOutput:_r},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var g,A,I,y,v,b,x,w,E,C,_;const m=p.payload||p,h=m.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(h)&&!(m.agent_id||(g=m.metadata)!=null&&g.agent_id))&&!(["loop_tool_start","loop_tool"].includes(h)&&!(m.call_id||(A=m.metadata)!=null&&A.call_id))){if(h==="tool_start"||h==="loop_tool_start"){const R=m.call_id||((I=m.metadata)==null?void 0:I.call_id)||null,U=m.agent_id||((y=m.metadata)==null?void 0:y.agent_id)||"",S={callId:R,agentId:U,agentLabel:m.agent_label||((v=m.metadata)==null?void 0:v.agent_label)||"",toolInput:m.tool_input,id:R?`${U}:${R}`:`${m.action}-${Date.now()}`,tool:m.action,actor:m.actor||"",channel:m.channel_id||"",iteration:m.iteration??((b=m.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(h==="tool_end"||h==="loop_tool"){const R=m.call_id||((x=m.metadata)==null?void 0:x.call_id)||null,U=m.agent_id||((w=m.metadata)==null?void 0:w.agent_id)||"";let S=-1;if(R&&(S=e.value.findIndex(P=>P.callId===R&&P.agentId===U&&P.status==="running")),S<0&&!R)for(let P=e.value.length-1;P>=0;P--){const Y=e.value[P];if(Y.tool===m.action&&Y.agentId===U&&Y.status==="running"){S=P;break}}if(S>=0){const P=e.value[S];P.status=m.error||(E=m.metadata)!=null&&E.error||["error","failed","cancelled","denied","outcome_unknown"].includes(m.status||((C=m.metadata)==null?void 0:C.status))?"error":"success",P.elapsed=m.execution_time_ms??m.duration_ms??((_=m.metadata)==null?void 0:_.elapsed_ms)??Date.now()-P.startTime,P.result=m.result_summary??m.detail??"",P.fadingOut=!0,setTimeout(()=>{const Y=e.value.indexOf(P);Y>=0&&e.value.splice(Y,1),t.value.unshift(P),t.value.length>a&&t.value.pop()},5e3)}return}if(h==="tool_stream"){const R=m.call_id||m.tool_name||"unknown";if(m.finished){const U={...s.value};delete U[R],s.value=U}else{const S=((s.value[R]||"")+(m.chunk||"")).split(`
`);s.value={...s.value,[R]:S.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(m=>{m.status==="running"&&(m.elapsed=p-m.startTime)})}let o=!1;function r(){o||(o=!0,nt.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,nt.off("events",n),i&&(clearInterval(i),i=null))}Qe(r),os(r),Wt(c),gt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function jd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function jn(e){const t=jd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function pk(e){const t=jd(e);return t?t.toLocaleTimeString():"—"}function yv(e){const t=jd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function fk(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function Oi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Vd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function xv(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Ep(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function qd(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function _v(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const wv=Symbol("agent-detail-cancelled"),mk=15e3;function hk(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((m,h)=>{r=m,c=h});function u(m,h){o||(o=!0,l!==null&&n(l),l=null,(m?r:c)(h))}let p;try{p=e(i==null?void 0:i.signal)}catch(m){u(!1,m)}return o||Promise.resolve(p).then(m=>u(!0,m),m=>u(!1,m)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const m=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${m}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,wv),i==null||i.abort()}}}function kv({state:e,requestDetail:t,timeoutMs:s=mk,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:m,coalesce:h}){if(!p)return Promise.resolve();if(h&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const g={agentId:p,cancel:null,promise:null};l=g,m?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const A=hk(I=>t(p,{signal:I}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return g.cancel=A.cancel,g.promise=(async()=>{let I=null,y=null;try{I=await A.promise}catch(v){y=v}I!==wv&&(l!==g||e.detailId!==p||(l=null,!y&&(I===null||typeof I!="object")&&(y=new Error(`${a} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=I,e.detailError=null),e.detailLoading=!1))})(),g.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function vk({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const gk={components:{ToolOutput:_r},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=j(()=>e.value.filter(M=>M.status==="running").length),r=j(()=>e.value.filter(M=>M.status==="completed").length),c=j(()=>e.value.filter(M=>["failed","timeout","killed"].includes(M.status)).length),d=j(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=j(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(M=>["failed","timeout","killed"].includes(M.status)):e.value.filter(M=>M.status===i.value));function p(M){const ae=Number(M.max_iterations)||0;return ae<=0?0:Math.min(100,Math.round(M.iteration_count/ae*100))}function m(M){return(Number(M.max_iterations)||0)>0}function h(M,ae){return M?M==="N/A"?"N/A":ae==="current_inheritance"?`inherit (currently ${M})`:M:"unknown"}function g(M){return h(M.display_model,M.display_model_source||M.display_source)}function A(M){return h(M.display_reasoning_effort,M.display_reasoning_effort_source||M.display_source)}function I(M){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[M]||""}const y=f(null),v=f(null),b=f(!1),x=f(null),w=f(""),C=kv({state:{get detail(){return y.value},set detail(M){y.value=M},get detailId(){return v.value},set detailId(M){v.value=M},get detailLoading(){return b.value},set detailLoading(M){b.value=M},get detailError(){return x.value},set detailError(M){x.value=M}},requestDetail:(M,{signal:ae})=>z.get(`/api/agents/${encodeURIComponent(M)}`,{signal:ae})});async function _(M){w.value="",await C.open(M.id)}function R(){C.close(),w.value=""}async function U(){await C.refresh()}async function S(M,ae){try{await navigator.clipboard.writeText(ae||""),w.value=M,setTimeout(()=>{w.value===M&&(w.value="")},1500)}catch{_e.error("Copy failed")}}async function P(M=!1){M=M===!0,M||(t.value=!0);try{const ae=await z.get("/api/agents");e.value=Array.isArray(ae)?ae:[],s.value=null}catch(ae){M||(s.value=ae.message)}M||(t.value=!1)}async function Y(M){const ae=e.value.find(B=>B.id===M);if(await Xt({title:"Kill agent",message:`Kill agent "${(ae==null?void 0:ae.label)||M}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=M;try{await z.del(`/api/agents/${encodeURIComponent(M)}`),_e.success("Agent killed"),await P()}catch(B){_e.error(B.message||"Failed to kill agent")}a.value=null}}const W=vk({isEnabled:()=>n.value&&l,refreshList:()=>P(!0),hasOpenDetail:()=>!!v.value,refreshDetail:U});function D(){W.start()}function O(){W.stop()}return Ht(n,()=>W.sync()),Qe(()=>{l=!0,P(),D()}),os(()=>{l=!0,P(!0),D()}),Wt(()=>{l=!1,O()}),gt(()=>{l=!1,O(),C.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:jn,formatDuration:Oi,progressPercent:p,hasProgress:m,displayModelText:g,displayEffortText:A,displaySourceLabel:I,detail:y,detailId:v,detailLoading:b,detailError:x,copied:w,openDetail:_,closeDetail:R,copyText:S,fetchAgents:P,killAgent:Y,startAutoRefresh:D,stopAutoRefresh:O}}},bk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),m=f("");let h=!1;const A=kv({state:{get detail(){return c.value},set detail(O){c.value=O},get detailId(){return d.value},set detailId(O){d.value=O},get detailLoading(){return u.value},set detailLoading(O){u.value=O},get detailError(){return p.value},set detailError(O){p.value=O}},detailLabel:"Loop detail",requestDetail:(O,{signal:M})=>z.get(`/api/loops/${encodeURIComponent(O)}?limit=100`,{signal:M})});async function I(O){m.value="",await A.open(O.id)}function y(){A.close(),m.value=""}async function v(O,M){try{await navigator.clipboard.writeText(M||""),m.value=O,setTimeout(()=>{m.value===O&&(m.value="")},1500)}catch{_e.error("Copy failed")}}const b=j(()=>e.value.reduce((O,M)=>O+(M.iteration_count||0),0)),x=j(()=>e.value.filter(O=>O.status==="running").length);function w(O){return O==="running"?"loop-status-running":O==="error"?"loop-status-error":"loop-status-stopped"}function E(O){return O==="running"?"badge-success":O==="error"?"badge-danger":O==="completed"?"badge-info":"badge-warning"}function C(O){return O==="act"?"badge-warning":O==="silent"?"badge-info":"badge-success"}async function _(O=!1){O=O===!0,O||(t.value=!0);try{const M=await z.get("/api/loops");e.value=Array.isArray(M)?M:[],s.value=null}catch(M){O||(s.value=M.message)}O||(t.value=!1)}async function R(){l.value=null;const O=n.value;if(!O.goal.trim()){l.value="Goal is required";return}if(!O.channel_id.trim()){l.value="Channel ID is required";return}const M={goal:O.goal.trim(),channel_id:O.channel_id.trim(),interval_seconds:O.interval_seconds||60,mode:O.mode,max_iterations:O.max_iterations||50};O.stop_condition.trim()&&(M.stop_condition=O.stop_condition.trim()),i.value=!0;try{const ae=await z.post("/api/loops",M);_e.success(`Loop started: ${ae.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await _()}catch(ae){l.value=ae.message}i.value=!1}async function U(O){if(await Xt({title:"Stop loop",message:`Stop loop ${O}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=O;try{await z.del(`/api/loops/${encodeURIComponent(O)}`),_e.success("Loop stopped"),await _()}catch(ae){_e.error(ae.message||"Failed to stop loop")}o.value=null}}async function S(O){r.value=O;try{await z.post(`/api/loops/${encodeURIComponent(O)}/restart`),_e.success("Loop restarted"),await _()}catch(M){_e.error(M.message||"Failed to restart loop")}r.value=null}function P(O){h&&O.payload&&(O.payload.loop_id||O.payload.type==="loop")&&(_(!0),d.value&&A.refresh())}let Y=null;function W(){Y!==null&&clearInterval(Y),Y=null}function D(){W(),h&&(Y=setInterval(()=>{_(!0),d.value&&A.refresh()},5e3))}return Qe(()=>{h=!0,_(),nt.subscribe("events",P),D()}),os(()=>{h=!0,_(!0),D()}),Wt(()=>{h=!1,W()}),gt(()=>{h=!1,nt.unsubscribe("events",P),W(),A.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:m,totalIterations:b,runningCount:x,statusDotClass:w,statusBadge:E,modeBadge:C,formatAge:yv,formatDuration:Oi,formatTs:jn,formatTokens:_v,openDetail:I,closeDetail:y,copyText:v,fetchLoops:_,doCreate:R,doStop:U,doRestart:S}}},yk={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=j(()=>e.value.filter(y=>y.status==="running").length),o=j(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await z.get("/api/processes"),s.value=null}catch(v){y||(s.value=v.message)}y||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Ht(a,y=>{y?u():p()});async function m(y){if(await Xt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await z.del(`/api/processes/${y}`),_e.success(`Process ${y} killed`),await d()}catch(b){_e.error(b.message||"Failed to kill process")}i.value=null}}function h(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let g=!1;function A(){g||(g=!0,d(),nt.subscribe("events",h),u())}function I(){g&&(g=!1,nt.unsubscribe("events",h),p())}return Qe(A),os(A),Wt(I),gt(I),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:Oi,fetchProcesses:d,doKill:m}}},xk=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Ap(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function _k(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function wk(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function kk(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=xk.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),m=new Date(u+864e5).getTimezoneOffset(),h=[];for(const A of new Set([p,m])){const I=new Date(u+A*6e4);_k(I,c)===d&&(h.some(y=>y.getTime()===I.getTime())||h.push(I))}if(h.sort((A,I)=>A.getTime()-I.getTime()),h.length===0)return{state:"nonexistent",typed:t};if(h.length>1)return{state:"ambiguous",typed:t,options:h.map(A=>({instant:A,offset:wk(A),iso:A.toISOString()}))};const g=h[0];return{state:"ok",typed:t,instant:g,iso:g.toISOString()}}const Sk=5e3;function ho(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function to(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function Rp(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:ho(e.data.connection)}function Tk(e){return e!=="webhook"}function Ip(e,t){return!Tk(t)||(e==null?void 0:e.available)===!0}const Ck={template:`
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

      <div v-if="!schedulingAvailable" class="hm-card border-yellow-900 mb-4 text-xs text-yellow-300" role="status">
        {{ schedulingAvailabilityMessage }} Discord-delivered actions cannot be created, run, or resumed. Outbound HTTP webhooks remain available.
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
              <option value="webhook">Outbound HTTP webhook</option>
            </select>
            </label>
          </div>
          <div v-if="form.action !== 'webhook'">
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

        <div v-if="form.action === 'webhook'" class="mb-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-gray-400 text-xs block mb-1">URL
              <input v-model="form.webhook_url" type="url" class="hm-input"
                     placeholder="https://example.com/hook" />
              </label>
            </div>
            <div>
              <label class="text-gray-400 text-xs block mb-1">HTTP Method
              <select v-model="form.webhook_method" class="hm-input">
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="GET">GET</option>
                <option value="DELETE">DELETE</option>
              </select>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-gray-400 text-xs block mb-1">Headers (JSON object)
              <input v-model="form.webhook_headers_str" type="text" class="hm-input"
                     placeholder='e.g. {"Content-Type":"application/json"}' />
              </label>
            </div>
            <div>
              <label class="text-gray-400 text-xs block mb-1">Expected Status Codes
              <input v-model="form.webhook_expected_status_str" type="text" class="hm-input"
                     placeholder="e.g. 200, 201, 204" />
              </label>
            </div>
          </div>
          <div>
            <label class="text-gray-400 text-xs block mb-1">Request Body
            <textarea v-model="form.webhook_body" class="hm-input" rows="3"
                      placeholder="Optional text or JSON body"></textarea>
            </label>
          </div>
        </div>

        <div v-if="createError" class="mb-3 text-red-400 text-sm">{{ createError }}</div>

        <button @click="doCreate" class="btn btn-primary text-xs" :disabled="creating || !selectedActionAvailable">
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
                <span v-if="s.inert_reason" class="badge badge-danger mr-1">inert</span>
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
                          :disabled="togglingId === s.id || (s.paused && !actionAvailable(s.action))"
                          :title="s.paused ? 'Resume this schedule' : 'Pause this schedule'">
                    {{ togglingId === s.id ? '...' : (s.paused ? 'Resume' : 'Pause') }}
                  </button>
                  <button @click="doRunNow(s)" class="btn btn-ghost text-xs"
                          :disabled="runningId === s.id || !actionAvailable(s.action)"
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
                  <div v-if="s.inert_reason" class="mb-3 p-2 rounded" style="background: rgba(245,158,11,0.1);">
                    <div class="text-xs text-yellow-400 font-medium mb-1">Schedule is inert</div>
                    <div class="text-xs text-yellow-200">{{ s.inert_reason }}</div>
                  </div>
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(ho(null)),n=j(()=>a.value.available),i=j(()=>to(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""}),c=f(!1),d=f(null),u=j(()=>Ip(a.value,r.value.action));function p($){return Ip(a.value,$)}const m=f(null),h=j(()=>kk(r.value.run_at));Ht(()=>r.value.run_at,()=>{m.value=null});const g=j(()=>{var J;const $=h.value;return $.state==="ok"?$.instant:$.state==="ambiguous"&&m.value!==null&&((J=$.options[m.value])==null?void 0:J.instant)||null}),A=j(()=>{const $=g.value;return $?`${$.toLocaleString()} local — ${$.toISOString()} UTC`:""}),I=f(null),y=f(!1),v=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],b=f(null),x=f(null),w=f(null),E=f(null),C=f(null),_=f(null),R=f([]),U=f(!1),S=f("");let P=0;const Y=j(()=>e.value.filter($=>$.cron&&!$.one_time).length),W=j(()=>e.value.filter($=>$.one_time).length),D=j(()=>e.value.filter($=>$.trigger).length),O=j(()=>e.value.filter($=>$.paused).length),M=j(()=>e.value.filter($=>$.consecutive_failures>0).length);function ae($){if(!$)return"-";const J=Date.now(),H=(new Date($).getTime()-J)/1e3;if(H<0)return"overdue";if(H<60)return"in < 1 min";if(H<3600)return`in ${Math.floor(H/60)} min`;if(H<86400){const Q=Math.floor(H/3600),ve=Math.floor(H%3600/60);return ve>0?`in ${Q}h ${ve}m`:`in ${Q}h`}const ee=Math.floor(H/86400);return`in ${ee} day${ee!==1?"s":""}`}function ie($){return $==null?"-":$<1e3?`${$}ms`:$<6e4?`${($/1e3).toFixed(1)}s`:Oi($/1e3)}function B($=r.value.cron){r.value.cron=$,Ap(r.value,"cron"),I.value=null}function Z($=r.value.run_at){r.value.run_at=$,Ap(r.value,"run_at"),I.value=null}async function le(){const $=r.value.cron.trim();if($){y.value=!0;try{I.value=await z.post("/api/schedules/validate-cron",{expression:$})}catch(J){I.value={valid:!1,error:J.message}}y.value=!1}}async function q(){t.value=!0,s.value=null;try{e.value=await z.get("/api/schedules")}catch($){s.value=$.message}t.value=!1}async function ce(){try{a.value=ho(await z.get("/api/schedules/status"))}catch($){a.value=Rp($)||ho(null)}}function me($){const J=Rp($);J&&(a.value=J)}async function K($){if(_.value===$){_.value=null,R.value=[];return}_.value=$,U.value=!0,R.value=[];const J=++P;try{const ue=await z.get(`/api/schedules/${encodeURIComponent($)}/history?limit=10`);if(J!==P||_.value!==$)return;R.value=ue,S.value=""}catch(ue){if(J!==P||_.value!==$)return;R.value=[],S.value=ue.message||"Failed to load execution history"}J===P&&(U.value=!1)}async function de(){if(d.value=null,!p(r.value.action)){d.value=to(a.value);return}const $=r.value;if(!$.description.trim()){d.value="Description is required";return}if($.action!=="webhook"&&!$.channel_id.trim()){d.value="Channel ID is required";return}if(!$.cron.trim()&&!$.run_at.trim()){d.value="Cron expression or run_at time is required";return}if($.cron.trim()&&$.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const J={description:$.description.trim(),action:$.action,channel_id:$.channel_id.trim()};if($.cron.trim()&&(J.cron=$.cron.trim()),$.run_at.trim()){const ue=h.value;if(ue.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){d.value="One-time run time is not a valid date";return}const H=g.value;if(ue.state==="ambiguous"&&m.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!H){d.value="One-time run time could not be resolved";return}J.run_at=H.toISOString()}if($.action==="reminder"&&$.message.trim()&&(J.message=$.message.trim()),$.action==="check"&&($.tool_name.trim()&&(J.tool_name=$.tool_name.trim()),$.report_format&&(J.report_format=$.report_format),$.tool_input_str.trim()))try{J.tool_input=JSON.parse($.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}if($.action==="webhook"){if(!$.webhook_url.trim()){d.value="Webhook URL is required";return}const ue={url:$.webhook_url.trim(),method:$.webhook_method};if($.webhook_headers_str.trim())try{const H=JSON.parse($.webhook_headers_str.trim());if(!H||Array.isArray(H)||typeof H!="object")throw new Error("not an object");ue.headers=H}catch{d.value="Webhook headers must be a valid JSON object";return}if($.webhook_body&&(ue.body=$.webhook_body),$.webhook_expected_status_str.trim()){const H=$.webhook_expected_status_str.split(",").map(ee=>Number(ee.trim()));if(H.some(ee=>!Number.isInteger(ee)||ee<100||ee>599)){d.value="Expected status codes must be comma-separated HTTP codes";return}ue.expected_status_codes=H}J.webhook_config=ue}c.value=!0;try{await z.post("/api/schedules",J),_e.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""},I.value=null,o.value=!1,await q()}catch(ue){me(ue),d.value=ue.message}c.value=!1}async function he($){if(!p($.action)){_e.error(to(a.value));return}const J=$.id;b.value=J;try{const ue=await z.post(`/api/schedules/${encodeURIComponent(J)}/run`);if(ue.status==="failure")_e.error(`Execution failed: ${ue.error||"unknown error"}`);else{const H=ue.warning?`Executed (${ue.warning})`:"Executed successfully";_e.success(H)}await q()}catch(ue){me(ue),_e.error(ue.message||"Failed to trigger")}b.value=null}async function ge($){if($.paused&&!p($.action)){_e.error(to(a.value));return}w.value=$.id;const J=!$.paused;try{await z.put(`/api/schedules/${encodeURIComponent($.id)}`,{paused:J}),_e.success(J?"Schedule paused":"Schedule resumed"),await q()}catch(ue){me(ue),_e.error(ue.message||"Failed to update schedule")}w.value=null}const xe=new Map;function De($,J){const ue=xe.get($.id);ue&&clearTimeout(ue.timer);const H={run:()=>T($,J),timer:null};H.timer=setTimeout(()=>{xe.delete($.id),H.run()},500),xe.set($.id,H)}async function T($,J){C.value=$.id;try{await z.put(`/api/schedules/${encodeURIComponent($.id)}`,{report_format:J}),_e.success(J?"Structured report enabled":"Plain-text report enabled")}catch(ue){_e.error(`Update failed: ${ue.message}`)}finally{await q(),C.value=null}}function N(){for(const[$,J]of[...xe])clearTimeout(J.timer),xe.delete($),J.run()}async function V($){E.value=$;try{await z.post(`/api/schedules/${encodeURIComponent($)}/reset-failures`),_e.success("Failure counters reset"),await q()}catch(J){_e.error(J.message||"Failed to reset")}E.value=null}async function pe($){const J=e.value.find(H=>H.id===$);if(await Xt({title:"Delete schedule",message:`Delete "${(J==null?void 0:J.description)||$}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){x.value=$;try{await z.del(`/api/schedules/${encodeURIComponent($)}`),_e.success("Schedule deleted"),await q()}catch(H){_e.error(H.message||"Failed to delete schedule")}x.value=null}}return Qe(()=>{q(),ce(),l=setInterval(ce,Sk)}),gt(()=>{N(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,selectedActionAvailable:u,actionAvailable:p,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:A,runAtAnalysis:h,runAtOccurrence:m,cronResult:I,validatingCron:y,cronPresets:v,runningId:b,deletingId:x,togglingId:w,resettingId:E,reportUpdatingId:C,flushReportFormatTimers:N,expandedId:_,history:R,historyLoading:U,historyError:S,cronCount:Y,oneTimeCount:W,webhookCount:D,pausedCount:O,failingCount:M,formatTs:jn,formatAge:yv,formatFuture:ae,formatMs:ie,formatDuration:Oi,onCronInput:B,onRunAtInput:Z,validateCron:le,toggleExpand:K,fetchSchedules:q,fetchSchedulingAvailability:ce,doCreate:de,doRunNow:he,doTogglePause:ge,doUpdateReportFormat:De,doResetFailures:V,doDelete:pe}}},Sv=[{id:"live",label:"Live",component:uk},{id:"agents",label:"Agents",component:gk},{id:"loops",label:"Loops",component:bk},{id:"processes",label:"Processes",component:yk},{id:"schedules",label:"Schedules",component:Ck}],Ek={components:{TabbedPage:xr},setup(){return{tabs:Sv}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},Ak={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(h){if(!h)return"";if(typeof h=="string")return h;try{return JSON.stringify(h,null,2)}catch{return String(h)}}function l(h){a.value=a.value===h?null:h}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},m()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await z.get("/api/audit/verify")}catch(h){h.status===409&&h.data&&typeof h.data=="object"?d.value=h.data.availability==="not_enabled"?{...h.data,not_enabled:!0}:h.data:(d.value=null,u.value=h.message||"verification request failed")}c.value=!1}async function m(){const h=++r;t.value=!0,s.value=null,a.value=null;try{const g=new URLSearchParams;n.value.tool&&g.set("tool",n.value.tool),n.value.user&&g.set("user",n.value.user),n.value.keyword&&g.set("q",n.value.keyword),n.value.date&&g.set("date",n.value.date),g.set("limit",String(n.value.limit));const A=g.toString(),I=await z.get(`/api/audit${A?"?"+A:""}`);if(h!==r)return;e.value=Array.isArray(I)?I:[]}catch(g){if(h!==r)return;s.value=g.message}h===r&&(t.value=!1)}return Qe(()=>{m()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:jn,formatDetail:i,truncateBlock:xv,toggleExpand:l,clearFilters:o,fetchAudit:m,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},Op=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Rk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],Ik={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),m=f("last_active"),h=f(!1),g=Op,A=Rk,I=f([]),y=f(!1),v=f(""),b=f("flat"),x=f(new Set),w=f(""),E=f(""),C=f(""),_=f(null),R=f(!1),U=f(""),S=f(!1);let P=0;Ht([w,E,C],()=>{P++,R.value=!1,U.value="",S.value=_.value!==null},{flush:"sync"});function Y(){try{const se=localStorage.getItem("odin-session-presets");se&&(I.value=JSON.parse(se))}catch{}}function W(){try{localStorage.setItem("odin-session-presets",JSON.stringify(I.value))}catch{}}const D=j(()=>p.value.trim()!==""||u.value!=="all"),O=j(()=>{let se=[...e.value];const Ie=Op.find(st=>st.id===u.value),Pe=Ie?Ie.filters:{};if(Pe.source&&(se=se.filter(st=>st.source===Pe.source)),Pe.minMessages&&(se=se.filter(st=>st.message_count>=Pe.minMessages)),Pe.hasCompaction&&(se=se.filter(st=>st.has_summary)),Pe.maxAge!=null){const st=Date.now()/1e3;se=se.filter(wt=>wt.last_active&&st-wt.last_active<=Pe.maxAge)}if(p.value.trim()){const st=p.value.toLowerCase().trim();se=se.filter(wt=>(wt.channel_id||"").toLowerCase().includes(st)||(wt.last_user_id||"").toLowerCase().includes(st)||(wt.source||"").toLowerCase().includes(st))}const it=m.value,jt=h.value?1:-1;return se.sort((st,wt)=>{const Dt=st[it]||0,hs=wt[it]||0;return(Dt-hs)*jt}),se}),M=j(()=>{if(!n.value||!n.value.messages)return[];const se=n.value.messages;if(se.length===0)return[];const Ie=[];let Pe=[];for(const it of se)it.role==="user"&&Pe.length>0&&(Ie.push(Pe),Pe=[]),Pe.push(it);return Pe.length>0&&Ie.push(Pe),Ie}),ae=j(()=>O.value.length>0&&c.value.size===O.value.length);function ie(se){const Ie=se.find(Pe=>Pe.role==="user");if(Ie&&Ie.content){const Pe=Ie.content.slice(0,120);return Pe.length<Ie.content.length?Pe+"...":Pe}return"(no user message)"}function B(se){const Ie=new Set(x.value);Ie.has(se)?Ie.delete(se):Ie.add(se),x.value=Ie}function Z(se){u.value=se}function le(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(m.value=se.filters.sortBy)}function q(){if(!v.value.trim())return;const se={id:"custom-"+Date.now(),name:v.value.trim(),filters:{searchQuery:p.value,sortBy:m.value}};I.value=[...I.value,se],W(),y.value=!1,v.value=""}function ce(se){I.value=I.value.filter(Ie=>Ie.id!==se),W(),u.value===se&&(u.value="all")}function me(){u.value="all",p.value="",m.value="last_active",h.value=!1}function K(se){if(!se)return"—";const Ie=Date.now()/1e3-se;if(Ie<60)return"just now";if(Ie<3600){const it=Math.floor(Ie/60);return`${it} minute${it!==1?"s":""} ago`}if(Ie<86400){const it=Math.floor(Ie/3600);return`${it} hour${it!==1?"s":""} ago`}const Pe=Math.floor(Ie/86400);return`${Pe} day${Pe!==1?"s":""} ago`}function de(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function he(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function ge(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function xe(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function De(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function T(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function N(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function V(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function pe(){const se=w.value.trim();if(!se)return;const Ie=++P;R.value=!0,U.value="",S.value=_.value!==null;try{let Pe=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;E.value.trim()&&(Pe+=`&channel_id=${encodeURIComponent(E.value.trim())}`),C.value.trim()&&(Pe+=`&user_id=${encodeURIComponent(C.value.trim())}`);const it=await z.get(Pe);if(Ie!==P)return;_.value=it.results||[],S.value=!1}catch(Pe){if(Ie!==P)return;U.value=Pe.message||"Search failed. Please retry."}finally{Ie===P&&(R.value=!1)}}function $(){P++,w.value="",E.value="",C.value="",_.value=null,U.value="",S.value=!1,R.value=!1}function J(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ue(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function H(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let ee=0;async function Q(){const se=++ee;t.value=!0,s.value=null;try{const Ie=await z.get("/api/sessions");if(se!==ee)return;e.value=Ie}catch(Ie){if(se!==ee)return;s.value=Ie.message}se===ee&&(t.value=!1)}function ve(){s.value=null,Q()}async function oe(se){if(a.value===se){a.value=null,n.value=null,x.value=new Set;return}a.value=se,n.value=null,i.value=!0,x.value=new Set;const Ie=++l;try{const Pe=await z.get(`/api/sessions/${encodeURIComponent(se)}`);Ie===l&&a.value===se&&(n.value=Pe)}catch(Pe){Ie===l&&a.value===se&&(n.value={messages:[],summary:"",error:Pe.message||"Failed to load session"})}finally{Ie===l&&(i.value=!1)}}function ye(se){const Ie=new Set(c.value);Ie.has(se)?Ie.delete(se):Ie.add(se),c.value=Ie}function Oe(){ae.value?c.value=new Set:c.value=new Set(O.value.map(se=>se.channel_id))}function Me(se){o.value=se}async function qe(){if(o.value){r.value=!0;try{await z.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await Q()}catch(se){s.value=se.message||"Failed to clear session"}r.value=!1,o.value=null}}function He(){d.value=!0}async function Ge(){if(c.value.size!==0){r.value=!0;try{await z.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await Q()}catch(se){s.value=se.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Je(se,Ie){const Pe=`/api/sessions/${encodeURIComponent(se)}/export?format=${Ie}`;try{const it=await z.getBlob(Pe),jt=URL.createObjectURL(it),st=document.createElement("a");st.href=jt,st.download=`session-${se}.${Ie==="text"?"txt":"json"}`,st.click(),URL.revokeObjectURL(jt)}catch(it){s.value=it.message||"Failed to export session"}}let lt=null;function Ze(se){se.payload&&se.payload.channel_id&&(clearTimeout(lt),lt=setTimeout(()=>{if(Q(),a.value&&se.payload.channel_id===a.value){const Ie=a.value,Pe=l;z.get(`/api/sessions/${encodeURIComponent(Ie)}`).then(it=>{Pe!==l||a.value!==Ie||(n.value=it)}).catch(()=>{})}},2e3))}let X=!1,we=null;function Ce(){X||(X=!0,Q(),nt.subscribe("events",Ze),we=nt.onReconnected(()=>Q()))}Qe(()=>{Y(),Ce()}),os(()=>{Ce()});function Re(){X&&(X=!1,nt.unsubscribe("events",Ze),we&&(we(),we=null),clearTimeout(lt))}return Wt(Re),gt(Re),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:ae,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:m,sortAsc:h,filterPresets:g,sortOptions:A,filteredSessions:O,hasActiveFilters:D,customPresets:I,showSavePreset:y,newPresetName:v,threadView:b,threads:M,collapsedThreads:x,ftsQuery:w,ftsChannelId:E,ftsUserId:C,ftsResults:_,ftsSearching:R,ftsError:U,ftsStale:S,formatAge:K,formatTimestamp:de,formatFullTimestamp:he,messageClass:ge,threadMsgClass:xe,roleBadge:De,roleDotClass:T,roleLabelClass:N,truncateContent:V,threadSummary:ie,fetchSessions:Q,retry:ve,toggleSession:oe,toggleSelect:ye,toggleSelectAll:Oe,confirmClear:Me,clearSession:qe,confirmBulkClear:He,doBulkClear:Ge,exportSession:Je,applyPreset:Z,applyCustomPreset:le,saveCustomPreset:q,removeCustomPreset:ce,resetFilters:me,toggleThread:B,runFtsSearch:pe,clearFtsSearch:$,highlightSnippet:J,ftsResultClass:ue,ftsTypeBadge:H}}},Ok={props:["trace"],template:`
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
  `,setup(){return{formatTokens:_v}}},Lk={components:{ContextAssemblyPanel:Ok},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(E){if(!E)return"—";try{const C=new Date(E);return isNaN(C.getTime())?E:C.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return E}}function p(E){return!E&&E!==0?"—":E<1e3?E+"ms":(E/1e3).toFixed(1)+"s"}function m(E){return!E&&E!==0?"—":E>=1e3?(E/1e3).toFixed(1)+"k":String(E)}function h(E){if(!E)return"";if(typeof E=="string")return E;try{return JSON.stringify(E,null,2)}catch{return String(E)}}function g(E){n.value===E?n.value=null:(n.value=E,c.value={})}function A(E,C){const _=E+"-"+C;c.value={...c.value,[_]:!c.value[_]}}function I(E,C){return!!c.value[E+"-"+C]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,x()}async function v(){try{const E=await z.get("/api/trajectories");e.value=E.files||[],r.value=E.count||0}catch{}}let b=0;async function x(){const E=++b;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const C=await z.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(E!==b)return;let _=C.entries||[];d.value.tool_name&&(_=_.filter(R=>(R.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(_=_.filter(R=>R.is_error)),d.value.channel_id&&(_=_.filter(R=>R.channel_id===d.value.channel_id)),d.value.user_id&&(_=_.filter(R=>R.user_id===d.value.user_id)),t.value=_}else{const C=new URLSearchParams;d.value.channel_id&&C.set("channel_id",d.value.channel_id),d.value.user_id&&C.set("user_id",d.value.user_id),d.value.tool_name&&C.set("tool_name",d.value.tool_name),d.value.errors_only&&C.set("errors_only","true"),C.set("limit",String(d.value.limit));const _=C.toString(),R=await z.get(`/api/trajectories/search/query?${_}`);if(E!==b)return;t.value=R.results||[]}}catch(C){if(E!==b)return;a.value=C.message}E===b&&(s.value=!1)}async function w(){if(!l.value.trim())return;const E=++b;s.value=!0,a.value=null,c.value={};try{const C=await z.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(E!==b)return;i.value=C.entry||null,i.value||(a.value="No trace found for this message ID")}catch(C){if(E!==b)return;C.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=C.message}E===b&&(s.value=!1)}return Qe(async()=>{await v(),await x()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:m,formatJSON:h,truncateBlock:xv,toggleExpand:g,toggleIteration:A,isIterationExpanded:I,clearFilters:y,fetchFiles:v,fetchTraces:x,lookupMessage:w}}};function Nk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function Dk(e){return e?`${e.approximate?"~":""}${qd(e.total||0)}`:"0"}const Mk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=j(()=>a.value.work||{}),m=j(()=>Math.max(1,...(a.value.activity_over_time||[]).map(w=>Number(w.count||0)))),h=j(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),g=w=>({height:`${Math.max(4,Math.round(Number(w||0)/m.value*100))}%`}),A=j(()=>s.value&&l.value-i.value>3e4);async function I(){const w=++d,E=n.value;try{const C=await z.get(`/api/usage?range=${encodeURIComponent(E)}`);if(w!==d||E!==n.value)return;a.value=C,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(C){w===d&&(t.value=C.message)}finally{w===d&&(e.value=!1)}}function y(w){n.value=w,e.value=!s.value,I()}function v(){e.value=!0,I()}function b(){c||(c=!0,I(),o=setInterval(I,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function x(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Qe(b),os(b),Wt(x),gt(x),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:A,fmtNum:qd,fmtDuration:Nk,tokenLabel:Dk,activityTrackStyle:h,activityBar:g,selectRange:y,retry:v}}},Tv=[{id:"audit",label:"Audit",component:Ak},{id:"sessions",label:"Sessions",component:Ik},{id:"traces",label:"Traces",component:Lk},{id:"usage",label:"Usage & Activity",component:Mk}],Pk={components:{TabbedPage:xr},setup(){return{tabs:Tv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Wr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Fk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(_){return _.source!=="builtin"?"":u[_.state]||""}function m(_,R){const U=_&&Array.isArray(_.tools)?_.tools:null;if(c.value=!!U,r.value=U?!!_.global_enabled:null,!U){e.value=R.map(Y=>({...Y,source:"unknown",enabled:void 0,state:null}));return}const S=new Set(U.map(Y=>Y.name)),P=R.filter(Y=>!S.has(Y.name)).map(Y=>({...Y,source:Y.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...U.map(Y=>({...Y,source:"builtin"})),...P]}async function h(_,R){if(d.value.has(_.name))return;const U=!!R.target.checked,S=new Set(d.value);S.add(_.name),d.value=S;try{const P=await z.post(`/api/tools/builtins/${encodeURIComponent(_.name)}/enabled`,{enabled:U});m(P,e.value),s.value=null;try{const Y=await z.get("/api/tools");m(P,Y)}catch(Y){console.warn("Built-in toggle committed; visible catalog refresh failed",Y)}}catch(P){R.target.checked=!!_.enabled,s.value=P.message||`Failed to toggle ${_.name}`}finally{const P=new Set(d.value);P.delete(_.name),d.value=P}}const g=j(()=>e.value.filter(_=>_.source==="builtin"&&_.is_core).length),A=j(()=>e.value.filter(_=>_.source==="skill").length),I=j(()=>Object.values(n.value).reduce((_,R)=>_+R,0));function y(_){for(const R of Wr)if(R.id!=="other"&&R.match(_))return R.id;return"other"}const v=j(()=>{let _=e.value;if(a.value){const R=a.value.toLowerCase();_=_.filter(U=>U.name.toLowerCase().includes(R)||(U.description||"").toLowerCase().includes(R))}return o.value&&(_=_.filter(R=>y(R.name)===o.value)),_}),b=j(()=>{const _=new Set;for(const R of e.value)_.add(y(R.name));return Wr.filter(R=>_.has(R.id))}),x=j(()=>{const _=v.value,R={};for(const S of _){const P=y(S.name);R[P]||(R[P]=[]),R[P].push(S)}const U=[];for(const S of Wr)R[S.id]&&R[S.id].length>0&&U.push({label:S.label,icon:S.icon,tools:R[S.id].sort((P,Y)=>P.name.localeCompare(Y.name))});return U});function w(_){i.value={...i.value,[_]:!i.value[_]}}async function E(){t.value=!0,s.value=null;try{const[_,R,U]=await Promise.all([z.get("/api/tools"),z.get("/api/tools/stats").catch(()=>({})),z.get("/api/tools/builtins").catch(()=>null)]);m(U,_),n.value=R||{}}catch(_){s.value=_.message}t.value=!1}function C(){E()}return Qe(()=>{E()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:g,skillCount:A,totalUsage:I,filteredTools:v,groupedTools:x,usedCategories:b,stateBadge:p,applyInventory:m,toggleBuiltinTool:h,truncate:Vd,toggleExpand:w,refresh:C}}};function $k(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Uk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const Bk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),m=f(null),h=f(!1),g=f(null),A=f(null),I=f(!1),y=j(()=>e.value.length),v=j(()=>e.value.reduce((q,ce)=>q+(ce.execution_count||0),0)),b=j(()=>e.value.reduce((q,ce)=>q+R(ce.code),0)),x=j(()=>{if(!l.value)return e.value;const q=l.value.toLowerCase();return e.value.filter(ce=>ce.name.toLowerCase().includes(q)||(ce.description||"").toLowerCase().includes(q))}),w=j(()=>u.value?u.value.split(`
`).length:0),E=j(()=>{const q=Math.max(w.value,1);return Array.from({length:q},(ce,me)=>me+1).join(`
`)}),C=j(()=>{const q=u.value.trim();return q?q.includes("SKILL_DEFINITION")?q.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function _(q){return $k(q)}function R(q){return q?q.split(`
`).length:0}function U(q){return Uk(q)}function S(q){a.value={...a.value,[q]:!a.value[q]}}async function P(q){try{await navigator.clipboard.writeText(q);const ce=e.value.find(me=>me.code===q);ce&&(o.value=ce.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function Y(q){if(q.key==="Tab"){q.preventDefault();const ce=q.target,me=ce.selectionStart,K=ce.selectionEnd;u.value=u.value.substring(0,me)+"    "+u.value.substring(K),Pt(()=>{ce.selectionStart=ce.selectionEnd=me+4})}}function W(q){const ce=q.target.previousElementSibling;ce&&(ce.scrollTop=q.target.scrollTop)}async function D(){t.value=!0,s.value=null;try{e.value=await z.get("/api/skills")}catch(q){s.value=q.message}t.value=!1}async function O(q){i.value=q,delete n.value[q],n.value={...n.value};try{const ce=await z.post(`/api/skills/${encodeURIComponent(q)}/test`);n.value={...n.value,[q]:ce}}catch(ce){n.value={...n.value,[q]:{result:ce.message,is_error:!0}}}i.value=null}function M(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,m.value=null}function ae(q){r.value=!0,c.value="edit",d.value=q.name,u.value=q.code||"",p.value=null,m.value=null}function ie(){r.value=!1,p.value=null,m.value=null}async function B(){p.value=null,m.value=null;const q=d.value.trim(),ce=u.value.trim();if(!q){p.value="Name is required";return}if(!ce){p.value="Code is required";return}h.value=!0;try{c.value==="create"?(await z.post("/api/skills",{name:q,code:ce}),m.value="Skill created successfully"):(await z.put(`/api/skills/${encodeURIComponent(q)}`,{code:ce}),m.value="Skill updated successfully"),await D(),setTimeout(()=>{r.value=!1},800)}catch(me){p.value=me.message}h.value=!1}function Z(q){A.value=q}async function le(){if(A.value){I.value=!0;try{await z.del(`/api/skills/${encodeURIComponent(A.value)}`),await D()}catch(q){_e.error(`Failed to delete skill: ${q.message||"unknown error"}`)}I.value=!1,A.value=null}}return Qe(()=>{D()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:m,saving:h,editorRef:g,deleteTarget:A,deleting:I,enabledCount:y,totalExecutions:v,totalLines:b,displayedSkills:x,editLineCount:w,editorLineNums:E,editValidation:C,highlight:_,truncate:Vd,formatTs:jn,countLines:R,getLineNumbers:U,toggleCode:S,copyCode:P,handleEditorKey:Y,syncScroll:W,fetchSkills:D,testSkill:O,showCreate:M,editSkill:ae,cancelEdit:ie,saveSkill:B,confirmDelete:Z,doDelete:le}}};class Vs extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Hk=/^[A-Za-z_][A-Za-z0-9_]*$/;function Lp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Np(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Vs(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Vs(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new Vs(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Vs(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function zk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function jk(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new Vs("Server name is required.","name");if(n.length>128||!Hk.test(n))throw new Vs("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new Vs("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=Lp(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Vs("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new Vs("An HTTP endpoint is required for this connection.","url");if(d&&!zk(d))throw new Vs("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Vs("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=Lp(e.allowlistText));const r=Np(e.headerRows,e.headersRemove,"Header"),c=Np(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function Vk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function qk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Gk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const Wk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Kk(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Jk=1e4,Zk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Kr(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Yk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Qk={template:`
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
          <form class="mcp-publication-limits" @submit.prevent="saveLimits" aria-label="MCP publication limits" :aria-busy="limitsSaving ? 'true' : 'false'">
            <label class="mcp-field">
              <span>Published tools per server</span>
              <input class="hm-input" type="number" min="1" max="128" step="1" required
                :value="limitDraft.max_published_tools_per_server"
                @input="editLimit('max_published_tools_per_server', $event.target.value)"
                :disabled="mutating || !limitsAvailable" aria-describedby="mcp-limits-help" />
              <small>1-128 tools. The global limit also applies.</small>
            </label>
            <label class="mcp-field">
              <span>Published tools across MCP</span>
              <input class="hm-input" type="number" min="1" max="256" step="1" required
                :value="limitDraft.max_published_tools_global"
                @input="editLimit('max_published_tools_global', $event.target.value)"
                :disabled="mutating || !limitsAvailable" aria-describedby="mcp-limits-help" />
              <small>1-256 tools total. Excludes built-in tools and skills.</small>
            </label>
            <button type="submit" class="btn btn-primary text-xs" :disabled="mutating || !limitsAvailable || !limitDirty.size">{{ limitsSaving ? 'Saving…' : 'Save limits' }}</button>
            <p id="mcp-limits-help" class="mcp-limits-help">No restart needed. New limits apply on the next publication or tools refresh; saving does not remove existing tools. Use Refresh tools on a server to apply now. Larger catalogs use more context and may exceed the model provider's total tool limit.</p>
            <p v-if="limitsError" class="mcp-limits-error" role="alert">{{ limitsError }}</p>
          </form>
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=j(()=>Object.keys(i.value).every(X=>{var we;return Number.isInteger((we=e.value)==null?void 0:we[X])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),m=f({}),h=f(new Set),g=f(!1),A=f("add"),I=f(""),y=f(null),v=f(Kr()),b=f(""),x=f(!1);let w=null,E=0,C=!1,_=!1;const R=Wk,U=j(()=>{var X;return((X=e.value)==null?void 0:X.servers)||[]}),S=j(()=>{var X;return!!((X=e.value)!=null&&X.enabled)}),P=j(()=>{var X,we,Ce,Re;return{serverCount:((X=e.value)==null?void 0:X.server_count)||0,enabledCount:((we=e.value)==null?void 0:we.enabled_server_count)||0,connectedCount:((Ce=e.value)==null?void 0:Ce.connected_count)||0,toolCount:((Re=e.value)==null?void 0:Re.published_tool_count)||0}}),Y=j(()=>{var X;return((X=y.value)==null?void 0:X.header_keys)||[]}),W=j(()=>{var X;return((X=y.value)==null?void 0:X.env_keys)||[]}),D=j(()=>{var X;return A.value==="edit"&&((X=y.value)==null?void 0:X.transport)==="http"}),O=j(()=>A.value==="add"||!D.value),M=j(()=>D.value?"Replace endpoint URL":"Endpoint URL"),ae=j(()=>D.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function ie(){B(),w=window.setInterval(()=>Z({quiet:!0}),Jk)}function B(){w&&window.clearInterval(w),w=null}async function Z({quiet:X=!1}={}){if(a.value)return;const we=++E;X||(t.value=!0);try{const Ce=await z.get("/api/mcp/status");if(we!==E||!C)return;e.value=Ce;for(const se of Object.keys(i.value))!l.value.has(se)&&Number.isInteger(Ce[se])&&(i.value[se]=String(Ce[se]));r.value="";const Re=new Set((Ce.servers||[]).map(se=>se.name));d.value=new Set([...d.value].filter(se=>Re.has(se)))}catch(Ce){we===E&&C&&(r.value=Ce.message||"Failed to load MCP status")}finally{we===E&&(t.value=!1)}}function le(X){return s.value||c.value.has(X)}function q(X,we){const Ce=new Set(c.value);we?Ce.add(X):Ce.delete(X),c.value=Ce}function ce(X){return qk(X.state)}function me(X){if(ce(X)==="disabled"){if(!X.enabled)return"Disabled — server switch off";if(!S.value)return"Disabled — global MCP is off"}return Zk[ce(X)]}function K(X){return X.transport==="http"?"Streamable HTTP":"stdio"}function de(X){return X.negotiated_version?`${X.era?`${String(X.era).charAt(0).toUpperCase()}${String(X.era).slice(1)}`:"Protocol"} · ${X.negotiated_version}`:"Not negotiated"}function he(X){return X.discovered_count?`${X.published_count||0} published · ${X.excluded_count||0} excluded`:"No tools discovered"}const ge=f(new Set);async function xe(X,we){if(ge.value.has(X.name))return;const Ce=!!we.target.checked,Re=new Set(ge.value);Re.add(X.name),ge.value=Re;try{const se=await z.post(`/api/mcp/servers/${encodeURIComponent(X.name)}/enabled`,{enabled:Ce});se&&Array.isArray(se.servers)?e.value=se:await Z({quiet:!0})}catch(se){we.target.checked=!!X.enabled,_e.error(se.message||`Failed to toggle ${X.name}`)}finally{const se=new Set(ge.value);se.delete(X.name),ge.value=se}}function De(X,we){var Re;i.value[X]=we;const Ce=new Set(l.value);we===String((Re=e.value)==null?void 0:Re[X])?Ce.delete(X):Ce.add(X),l.value=Ce,n.value=""}async function T(){if(s.value||!o.value||!l.value.size)return;const X={};for(const we of l.value){const Ce=Number(i.value[we]),Re=we==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Ce)||Ce<1||Ce>Re){n.value=`Enter a whole number between 1 and ${Re}.`;return}X[we]=Ce}a.value=!0,s.value=!0,n.value="",++E,t.value=!1;try{const we=await z.post("/api/mcp/limits",X);e.value=we;for(const Ce of Object.keys(i.value))Number.isInteger(we[Ce])&&(i.value[Ce]=String(we[Ce]));l.value=new Set,_e.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(we){n.value=we.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await Z({quiet:!0})}}async function N(X){if(X!==S.value&&!(!X&&!await Xt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await z.post("/api/mcp/enabled",{enabled:X}),_e.success(X?"MCP enabled":"MCP disabled"),await Z({quiet:!0})}catch(we){_e.error(we.message||"Failed to update MCP state"),await Z({quiet:!0})}finally{s.value=!1}}}async function V(X){q(X.name,!0);try{await z.post(`/api/mcp/servers/${encodeURIComponent(X.name)}/reconnect`,{}),_e.success(`Reconnected ${X.name}`)}catch(we){_e.error(we.message||`Failed to reconnect ${X.name}`)}finally{q(X.name,!1),await Z({quiet:!0})}}async function pe(X){q(X.name,!0);try{await z.post(`/api/mcp/servers/${encodeURIComponent(X.name)}/refresh-tools`,{}),_e.success(`Refreshed tools from ${X.name}`),await ue(X.name,!0)}catch(we){_e.error(we.message||`Failed to refresh ${X.name}`)}finally{q(X.name,!1),await Z({quiet:!0})}}async function $(X){if(await Xt({title:`Remove ${X.name}`,message:`Remove this saved MCP server? Its ${X.published_count||0} published tool${X.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){q(X.name,!0);try{await z.del(`/api/mcp/servers/${encodeURIComponent(X.name)}`),_e.success(`Removed ${X.name}`),delete p.value[X.name]}catch(Ce){_e.error(Ce.message||`Failed to remove ${X.name}`)}finally{q(X.name,!1),await Z({quiet:!0})}}}async function J(X){const we=new Set(d.value);if(we.has(X.name)){we.delete(X.name),d.value=we;return}we.add(X.name),d.value=we,Object.hasOwn(p.value,X.name)||await ue(X.name)}async function ue(X,we=!1){if(!we&&Object.hasOwn(p.value,X))return;const Ce=new Set(h.value);Ce.add(X),h.value=Ce,m.value={...m.value,[X]:""};try{const Re=await z.get(`/api/mcp/servers/${encodeURIComponent(X)}/tools`);p.value={...p.value,[X]:Re.tools||[]}}catch(Re){m.value={...m.value,[X]:Re.message||"Failed to load tools"}}finally{const Re=new Set(h.value);Re.delete(X),h.value=Re}}function H(X){return(p.value[X]||[]).filter(we=>Gk(we,u.value[X]))}function ee(X,we){u.value={...u.value,[X]:we}}function Q(){A.value="add",I.value="",y.value=null,v.value=Kr(),b.value="",g.value=!0}function ve(X){A.value="edit",I.value=X.name,y.value=X,v.value={...Kr(),name:X.name,enabled:!!X.enabled,transport:X.transport||"stdio"},b.value="",g.value=!0}function oe(){x.value||(g.value=!1)}function ye(X){g.value&&Kk(X)}function Oe(X){const we=X==="headers"?"headerRows":"envRows";v.value[we].push({key:"",value:""})}function Me(X,we){const Ce=X==="headers"?"headerRows":"envRows";v.value[Ce].splice(we,1)}function qe(X,we){const Ce=X==="headers"?"headersRemove":"envRemove",Re=v.value[Ce];v.value[Ce]=Re.includes(we)?Re.filter(se=>se!==we):[...Re,we]}async function He(){var we,Ce;b.value="";let X;try{X=jk(v.value,{mode:A.value,originalTransport:((we=y.value)==null?void 0:we.transport)||""})}catch(Re){b.value=Re instanceof Vs?Re.message:"Invalid MCP server configuration",await Pt(),(Ce=document.querySelector(".mcp-editor"))==null||Ce.scrollTo({top:0,behavior:"smooth"});return}if(!(A.value==="edit"&&Vk(X,y.value)&&!await Xt({title:`Change ${I.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){x.value=!0;try{A.value==="add"?await z.post("/api/mcp/servers",X):await z.put(`/api/mcp/servers/${encodeURIComponent(I.value)}`,X),_e.success(A.value==="add"?`Saved ${X.name}`:`Updated ${I.value}`),g.value=!1,await Z({quiet:!0})}catch(Re){b.value=Re.message||"Failed to save MCP server"}finally{x.value=!1}}}let Ge=null;function Je(X){`${(X==null?void 0:X.event)||""} ${(X==null?void 0:X.type)||""} ${(X==null?void 0:X.tool)||""} ${(X==null?void 0:X.message)||""}`.toLowerCase().includes("mcp")&&(Ge&&window.clearTimeout(Ge),Ge=window.setTimeout(()=>Z({quiet:!0}),200))}function lt(){C||(C=!0,_||(nt.subscribe("events",Je),_=!0),Z(),ie())}function Ze(){C=!1,B(),Ge&&window.clearTimeout(Ge),Ge=null,_&&(nt.unsubscribe("events",Je),_=!1)}return Qe(lt),os(lt),Wt(Ze),gt(Ze),{status:e,loading:t,mutating:s,pageError:r,servers:U,masterEnabled:S,aggregate:P,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:De,saveLimits:T,expandedServers:d,toolQueries:u,toolErrors:m,toolsLoading:h,editorOpen:g,editorMode:A,editingName:I,editingServer:y,form:v,formError:b,saving:x,editorGroups:R,configuredHeaderKeys:Y,configuredEnvKeys:W,savedHttpEndpoint:D,endpointRequired:O,endpointFieldLabel:M,endpointPlaceholder:ae,refreshAll:Z,busy:le,serverState:ce,stateLabel:me,transportLabel:K,protocolLabel:de,toolSummary:he,formatAge:Yk,setMasterEnabled:N,togglePending:ge,toggleServerEnabled:xe,reconnect:V,refreshTools:pe,removeServer:$,toggleTools:J,filteredTools:H,setToolQuery:ee,openAdd:Q,openEdit:ve,closeEditor:oe,jumpToEditorGroup:ye,addSecretRow:Oe,removeSecretRow:Me,toggleSecretRemoval:qe,saveServer:He}}};function Xk(e,t){if(!e||!t)return Ep(e);const s=Ep(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const eS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),m=f(!1),h=f(null),g=f(null);let A=null;const I=f(null),y=f(!1),v=f({}),b=f({}),x=f({}),w=f({}),E=new Map,C=f(null),_=j(()=>e.value.reduce((B,Z)=>B+(Z.chunks||0),0)),R=j(()=>new Set(e.value.map(Z=>Z.uploader).filter(Boolean)).size);function U(B,Z){const le=b.value[Z];if(!le||le.length===0)return 0;const q=Math.max(...le.map(ce=>ce.char_count||0));return q===0?0:Math.round(B.char_count/q*100)}async function S(){t.value=!0,s.value=null;try{const B=await z.get("/api/knowledge");e.value=Array.isArray(B)?B:[]}catch(B){s.value=B.message}t.value=!1}async function P(B){if(v.value[B]){v.value[B]=!1,C.value=null;return}if(v.value[B]=!0,Object.prototype.hasOwnProperty.call(b.value,B))return;if(E.has(B))return E.get(B);const Z={...w.value,[B]:!0};w.value=Z;const le={...x.value};delete le[B],x.value=le;const q=z.get(`/api/knowledge/${encodeURIComponent(B)}/chunks`).then(ce=>{b.value={...b.value,[B]:Array.isArray(ce)?ce:[]}}).catch(ce=>{x.value={...x.value,[B]:ce.message||"load failed"}}).finally(()=>{if(E.get(B)!==q)return;E.delete(B);const ce={...w.value};delete ce[B],w.value=ce});return E.set(B,q),q}let Y=0;async function W(){const B=a.value.trim();if(!B)return;const Z=++Y;i.value=!0,o.value=null,l.value=B;try{const le=await z.get(`/api/knowledge/search?q=${encodeURIComponent(B)}`);if(Z!==Y)return;n.value=Array.isArray(le)?le:[]}catch(le){if(Z!==Y)return;n.value=[],o.value=le.message||"Search failed"}Z===Y&&(i.value=!1)}function D(){Y+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function O(){u.value=null,p.value=null;const B=c.value.trim(),Z=d.value.trim();if(!B){u.value="Source name is required";return}if(!Z){u.value="Content is required";return}m.value=!0;try{const le=await z.post("/api/knowledge",{source:B,content:Z});p.value=`Ingested ${le.chunks||0} chunks from "${B}"`,c.value="",d.value="",b.value={},await S(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(le){u.value=le.message}m.value=!1}async function M(B){h.value=B,g.value=null,A&&(clearTimeout(A),A=null);try{const Z=await z.post(`/api/knowledge/${encodeURIComponent(B)}/reingest`);g.value={source:B,error:!1,message:`Re-ingested ${Z.chunks||0} chunks`},delete b.value[B],await S(),A=setTimeout(()=>{g.value=null,A=null},3e3)}catch(Z){g.value={source:B,error:!0,message:Z.message}}h.value=null}function ae(B){I.value=B}async function ie(){if(I.value){y.value=!0;try{await z.del(`/api/knowledge/${encodeURIComponent(I.value)}`),delete b.value[I.value],await S()}catch(B){_e.error(`Failed to delete source: ${B.message||"unknown error"}`)}y.value=!1,I.value=null}}return Qe(()=>{S()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:m,reingesting:h,reingestResult:g,deleteTarget:I,deleting:y,expanded:v,sourceChunks:b,chunkErrors:x,loadingChunks:w,selectedChunk:C,totalChunks:_,uploaderCount:R,truncate:Vd,formatTs:jn,highlightTerms:Xk,chunkBarWidth:U,fetchSources:S,toggleSource:P,doSearch:W,clearSearch:D,doIngest:O,doReingest:M,confirmDelete:ae,doDelete:ie}}},tS={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),m=f(""),h=f(!1),g=f(null),A=f(null),I=f(new Set),y=f(null),v=f(!1),b=f(!1),x=j(()=>e.value.reduce((Z,le)=>Z+le.count,0)),w=j(()=>I.value.size);function E(Z){const le=t.value[Z];if(!le)return[];if(!l.value.trim())return le;const q=l.value.trim().toLowerCase();return le.filter(ce=>ce.key.toLowerCase().includes(q)||ce.value&&ce.value.toLowerCase().includes(q))}function C(Z,le){return I.value.has(Z+"/"+le)}function _(Z,le){const q=Z+"/"+le,ce=new Set(I.value);ce.has(q)?ce.delete(q):ce.add(q),I.value=ce}function R(Z){const le=t.value[Z];return!le||le.length===0?!1:le.every(q=>I.value.has(Z+"/"+q.key))}function U(Z,le){const q=t.value[Z];if(!q)return;const ce=new Set(I.value);for(const me of q){const K=Z+"/"+me.key;le?ce.add(K):ce.delete(K)}I.value=ce}async function S(){s.value=!0,a.value=null;try{const Z=await z.get("/api/memory");e.value=Object.entries(Z).map(([le,q])=>({name:le,keys:q.keys||[],count:q.count||0}))}catch(Z){a.value=Z.message}s.value=!1}async function P(Z){if(n.value[Z]){n.value[Z]=!1;return}n.value[Z]=!0;const le=e.value.find(ce=>ce.name===Z);if(!le||t.value[Z]||i.value===Z)return;i.value=Z;let q;try{const me=(await z.get(`/api/memory/${encodeURIComponent(Z)}`)).entries||{};q=le.keys.map(K=>Object.prototype.hasOwnProperty.call(me,K)?{key:K,value:me[K]||"",failed:!1}:{key:K,value:"",failed:!0,error:"Not found in scope"})}catch(ce){q=le.keys.map(me=>({key:me,value:"",failed:!0,error:ce.message||"Failed to load"}))}t.value[Z]=q,i.value=null}function Y(Z,le,q){p.value=Z+"/"+le,m.value=q}async function W(Z,le){h.value=!0,g.value=null;try{await z.put(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(le)}`,{value:m.value});const q=t.value[Z];if(q){const ce=q.find(me=>me.key===le);ce&&(ce.value=m.value)}p.value=null}catch(q){g.value=`Failed to save: ${q.message||"unknown error"}`}h.value=!1}async function D(Z,le){try{await navigator.clipboard.writeText(le.value),A.value=Z+"/"+le.key,setTimeout(()=>{A.value=null},1500)}catch{}}async function O(){d.value=null,u.value=null;const Z=r.value.scope.trim(),le=r.value.key.trim(),q=r.value.value.trim();if(!Z){d.value="Scope is required";return}if(!le){d.value="Key is required";return}if(!q){d.value="Value is required";return}c.value=!0;try{await z.put(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(le)}`,{value:q}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await S(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ce){d.value=ce.message}c.value=!1}function M(Z,le){y.value={scope:Z,key:le}}async function ae(){if(!y.value)return;v.value=!0,g.value=null;const{scope:Z,key:le}=y.value;try{await z.del(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(le)}`);const q=t.value[Z];q&&(t.value[Z]=q.filter(K=>K.key!==le));const ce=e.value.find(K=>K.name===Z);ce&&(ce.count--,ce.keys=ce.keys.filter(K=>K!==le));const me=new Set(I.value);me.delete(Z+"/"+le),I.value=me}catch(q){g.value=`Failed to delete: ${q.message||"unknown error"}`}v.value=!1,y.value=null}function ie(){b.value=!0}async function B(){v.value=!0,g.value=null;const Z=[];for(const le of I.value){const q=le.indexOf("/");Z.push({scope:le.slice(0,q),key:le.slice(q+1)})}try{await z.post("/api/memory/bulk-delete",{entries:Z}),I.value=new Set,t.value={},await S()}catch(le){g.value=`Bulk delete failed: ${le.message||"unknown error"}`}v.value=!1,b.value=!1}return Qe(()=>{S()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:m,saving:h,actionError:g,copied:A,selected:I,selectedCount:w,totalEntries:x,deleteTarget:y,deleting:v,showBulkDelete:b,fetchMemory:S,toggleScope:P,startEdit:Y,doEdit:W,copyValue:D,doAdd:O,confirmDelete:M,doDelete:ae,confirmBulkDelete:ie,doBulkDelete:B,isSelected:C,toggleSelect:_,isScopeAllSelected:R,toggleSelectAll:U,filteredEntries:E}}},sS={template:`
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

      <section class="hm-card mb-4" aria-labelledby="automatic-learning-title">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 id="automatic-learning-title" class="text-sm font-semibold text-gray-300">Automatic learning</h2>
            <p class="page-lede">When off, Odin neither creates automatic lessons nor adds stored learned entries to model context. Existing entries are retained.</p>
            <p v-if="configReady" class="text-xs text-gray-500 mt-2" role="status">Current state: {{ learningEnabled ? 'On' : 'Off' }}</p>
            <p v-else-if="configError" class="text-sm text-red-400 mt-2" role="alert">{{ configError }}</p>
            <p v-else class="text-xs text-gray-500 mt-2" role="status">Checking administrator configuration…</p>
          </div>
          <label v-if="configReady" class="flex items-center gap-2 shrink-0">
            <span class="text-xs text-gray-400">{{ learningEnabled ? 'On' : 'Off' }}</span>
            <span class="toggle-switch" :aria-busy="savingConfig ? 'true' : 'false'">
              <input type="checkbox" :checked="learningEnabled" :disabled="savingConfig"
                     aria-label="Automatic learning" @change="setLearningEnabled($event.target.checked)" />
              <span class="toggle-slider"></span>
            </span>
          </label>
        </div>
      </section>

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
        <span class="empty-state-hint">Existing entries remain available whether automatic learning is on or off</span>
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(!1),r=f(!1),c=f(null),d=f(!1),u=j(()=>[...new Set(e.value.map(w=>w.category))].sort()),p=j(()=>{const x={};return e.value.forEach(w=>{x[w.category]=(x[w.category]||0)+1}),x}),m=j(()=>n.value?e.value.filter(x=>x.category===n.value):e.value);function h(x){return x==="correction"?"badge-warning":x==="operational"?"badge-info":x==="preference"?"badge-success":"badge-info"}function g(x){i.value=x.key,l.value=x.content}async function A(x){try{await z.put("/api/learned/"+encodeURIComponent(x),{content:l.value}),i.value=null,_e.success("Entry updated"),await y()}catch(w){_e.error(w.message||"Failed to save entry")}}async function I(x){if(await Xt({title:"Delete learned entry",message:`Delete "${x}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/learned/"+encodeURIComponent(x)),_e.success("Entry deleted"),await y()}catch(E){_e.error(E.message||"Failed to delete entry")}}async function y(){s.value=!0,a.value=null;try{const x=await z.get("/api/learned");e.value=x.entries||[],t.value={last_reflection:x.last_reflection,count:x.count}}catch(x){a.value=x.message}s.value=!1}async function v(){var x;r.value=!1,c.value=null;try{const w=await z.get("/api/config");o.value=((x=w.learning)==null?void 0:x.enabled)===!0,r.value=!0}catch(w){c.value=w.status===403?"Administrator access is required to change automatic learning.":w.message||"Automatic learning state is unavailable."}}async function b(x){if(!(!r.value||d.value)){d.value=!0,c.value=null;try{if(await z.put("/api/config",{learning:{enabled:x}}),await v(),!r.value)return;_e.success(`Automatic learning ${o.value?"enabled":"disabled"}`)}catch(w){r.value=!1,c.value=w.status===403?"Administrator access is required to change automatic learning.":w.message||"Failed to change automatic learning."}finally{d.value=!1}}}return Qe(()=>{y(),v()}),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:u,catCounts:p,filtered:m,learningEnabled:o,configReady:r,configError:c,savingConfig:d,catBadge:h,formatTs:jn,startEdit:g,saveEdit:A,deleteEntry:I,fetchEntries:y,fetchLearningConfig:v,setLearningEnabled:b}}},Cv=[{id:"tools",label:"Tools",component:Fk},{id:"skills",label:"Skills",component:Bk},{id:"mcp-servers",label:"MCP Servers",component:Qk},{id:"knowledge",label:"Knowledge",component:eS},{id:"memory",label:"Memory",component:tS},{id:"learned",label:"Learned",component:sS}],aS={components:{TabbedPage:xr},setup(){return{tabs:Cv}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},nS={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},iS={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},lS={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},oS={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=j(()=>e.value.components||[]),l=j(()=>lS[e.value.overall]||"text-gray-400"),o=j(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=j(()=>{const w=e.value.overall;return w==="healthy"?"All Systems Healthy":w==="degraded"?"Some Systems Degraded":w==="unhealthy"?"System Issues Detected":"Unknown"});function c(w){return nS[w]||"text-gray-400"}function d(w){return iS[w]||"info"}function u(w){return w==="ok"?"badge-success":w==="degraded"?"badge-warning":w==="down"?"badge-danger":"badge-info"}function p(w){return w==="closed"?"text-green-400":w==="half_open"?"text-yellow-400":w==="open"?"text-red-400":"text-gray-400"}function m(w){return w.replace(/_/g," ").replace(/\b\w/g,E=>E.toUpperCase())}function h(w){if(!w)return"—";try{return new Date(w).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function g(w){return w>=1e6?(w/1e6).toFixed(1)+"M":w>=1e3?(w/1e3).toFixed(1)+"K":String(w)}async function A(){n.value=!0;try{e.value=await z.get("/api/health/components"),s.value=null,a.value=!0}catch(w){s.value=w.message}finally{t.value=!1,n.value=!1}}function I(){t.value=!0,s.value=null,A()}let y=null,v=!1;function b(){v||(v=!0,A(),y||(y=setInterval(A,3e4)))}function x(){v&&(v=!1,y&&(clearInterval(y),y=null))}return Qe(b),os(b),Wt(x),gt(x),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:m,formatTime:h,formatNumber:g,fetchHealth:A,retry:I}}},rS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=j(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=j(()=>{if(!i.value)return[];const A=i.value,I=A.storage_total_bytes||1;return[{label:"Session Persistence",mb:A.sessions.persist_dir.total_mb,bytes:A.sessions.persist_dir.total_bytes,files:A.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(A.sessions.persist_dir.total_bytes/I*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:A.knowledge.db_file.total_mb,bytes:A.knowledge.db_file.total_bytes,files:A.knowledge.db_file.file_count,pct:Math.min(100,Math.round(A.knowledge.db_file.total_bytes/I*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:A.trajectories.message_dir.total_mb,bytes:A.trajectories.message_dir.total_bytes,files:A.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.message_dir.total_bytes/I*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:A.trajectories.agent_dir.total_mb,bytes:A.trajectories.agent_dir.total_bytes,files:A.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(A.trajectories.agent_dir.total_bytes/I*100)),color:"res-bar-amber"}]});async function d(){try{const A=await z.get("/api/resource-usage");i.value=A,t.value=null,s.value=!0}catch(A){t.value=A.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let m=!1;function h(){m||(m=!0,d(),l||(l=setInterval(d,3e4)))}function g(){m&&(m=!1,l&&(clearInterval(l),l=null))}return Qe(h),os(h),Wt(g),gt(g),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:qd,refresh:u,retry:p}}},cS=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),dS=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function uS(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!dS.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?El(t):""}function pS(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!cS.has(c)));s=Object.keys(r).length?El(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const cn=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),Al=e=>typeof e=="string"||typeof e=="number"?String(e):"";function fS(e){const t=cn(e)?e:{},s=cn(t.metadata)?t.metadata:{},a=cn(t.audit_metadata)?t.audit_metadata:{},n=cn(t.turn)?t.turn:{},i=l=>Al(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function Dp(e){return e.record?JSON.stringify(Ev(e),null,2):e.text}function Ev(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function Pc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function Mp(e){if(!Pc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,Al(s.channel_id),Al(s.user_id??s.actor)])}function mS(e,t,s=2e3){var i,l,o;const a=Mp(t),n=a?e.findIndex(r=>Mp(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:Pc(y)==="end"?1:0,p=[...c].sort((y,v)=>u(y)-u(v)),m=Object.assign({},...p);m.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const v=p.filter(b=>cn(b[y])).map(b=>b[y]);v.length&&(m[y]=Object.assign({},...v))}const h=c.some(y=>Pc(y)!=="start"),g=c.find(y=>Fc(y,0).level==="ERROR"),A=(g==null?void 0:g.status)||((i=g==null?void 0:g.metadata)==null?void 0:i.status);m.status=g?["failed","error","cancelled","denied","outcome_unknown"].includes(A)?A:"failed":h?m.status||((l=m.metadata)==null?void 0:l.status)||"succeeded":"started",h&&m.status==="started"&&(m.status="succeeded"),g&&(m.error=g.error||((o=g.metadata)==null?void 0:o.error)||m.error);const I=Fc(m,r.id,r._time);Object.assign(I,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(n,1,I)}e.length>s&&e.splice(0,e.length-s)}function Fc(e,t,s=new Date){var u,p;let a=e;if(cn(e)&&e.type==="log"&&"line"in e?a=e.line:cn(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=cn(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(m=>["failed","error","cancelled","denied","outcome_unknown"].includes(m))?"ERROR":Al(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:Al(n==null?void 0:n.tool_name),raw:n?null:o,attribution:fS(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function hS(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const vS={components:{ToolOutput:_r},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=j(()=>pS(e.entry)),s=j(()=>{var o;return El(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=j(()=>{var o,r,c;return El(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=j(()=>uS(e.entry.record)),i=j(()=>Ev(e.entry)),l=j(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},gS=["INFO","WARNING","ERROR"],bS=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Jr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],yS=[50,100,200,500],xS={components:{ToolOutput:_r,LogRecord:vS},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(nt.state||"disconnected"),u=j(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),m=f(!1),h=f(null),g=2e3,A=gS,I=bS,y=Jr,v=f("all"),b=f(""),x=f([]),w=f(!1),E=f(""),C=f([]);function _(){try{const re=localStorage.getItem("odin-log-presets");re&&(x.value=JSON.parse(re))}catch{}}function R(){try{localStorage.setItem("odin-log-presets",JSON.stringify(x.value))}catch{}}const U=j(()=>l.value!==""||o.value.trim()!==""||b.value!==""),S=j(()=>{const re=Jr.find(Te=>Te.value===b.value);return re?re.label:""}),P=j(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(re){return re.message}}),Y=24,W=j(()=>{if(Z.value.length===0)return[];const re=[],Te=new Date,Ue=3600*1e3;for(let ze=Y-1;ze>=0;ze--){const yt=new Date(Te.getTime()-(ze+1)*Ue),ot=new Date(Te.getTime()-ze*Ue);re.push({start:yt,end:ot,label:ae(yt,ot),shortLabel:ot.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const ze of Z.value){if(!ze._time)continue;const yt=ze._time.getTime();for(const ot of re)if(yt>=ot.start.getTime()&&yt<ot.end.getTime()){ot.total++,ze.level==="ERROR"?ot.errors++:ze.level==="WARNING"?ot.warnings++:ot.info++;break}}return re}),D=j(()=>{let re=1;for(const Te of W.value)Te.total>re&&(re=Te.total);return re}),O=j(()=>{if(W.value.length===0)return"";const re=Z.value.map(ze=>ze._time&&ze._time.getTime()).filter(Boolean);if(re.length===0)return"";const Te=new Date(Math.min(...re));return`${Z.value.length} shown, oldest ${Te.toLocaleTimeString()}`}),M=j(()=>Math.ceil(Y/8));function ae(re,Te){const Ue={hour:"2-digit",minute:"2-digit"};return re.toLocaleTimeString([],Ue)+" - "+Te.toLocaleTimeString([],Ue)}function ie(re,Te){return!Te||!re?"0px":Math.max(2,re/Te*100)+"%"}function B(re){const Te=Z.value.findIndex(Ue=>Ue._time&&Ue._time.getTime()>=re.start.getTime()&&Ue._time.getTime()<re.end.getTime());if(Te>=0&&p.value){const Ue=p.value.querySelector('[data-log-id="'+Z.value[Te].id+'"]');Ue&&(Ue.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Z=j(()=>{let re=t.value;if(l.value&&(re=re.filter(Te=>(Te.level||"INFO")===l.value)),b.value){const Te=Jr.find(Ue=>Ue.value===b.value);if(Te&&Te.seconds){const Ue=new Date(Date.now()-Te.seconds*1e3);re=re.filter(ze=>ze._time&&ze._time>=Ue)}}if(o.value&&!P.value)if(r.value)try{const Te=new RegExp(o.value,"i");re=re.filter(Ue=>{const ze=Ue.searchText,yt=Ue.tool||"";return Te.test(ze)||Te.test(yt)})}catch{}else{const Te=o.value.toLowerCase();re=re.filter(Ue=>{const ze=Ue.searchText.toLowerCase(),yt=(Ue.tool||"").toLowerCase();return ze.includes(Te)||yt.includes(Te)})}return re}),le=j(()=>hS(Z.value));function q(re){const Te=Fc(re,++s);if(n.value){C.value.push(Te);return}ce(Te)}function ce(re){mS(t.value,re,g),i.value&&Pt(()=>me())}function me(re=!1){const Te=p.value;Te&&Te.scrollTo({top:Te.scrollHeight,behavior:re?"smooth":"instant"})}function K(){i.value=!0,m.value=!1,Pt(()=>me(!0))}const de=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function he(){const re=p.value;if(!re)return;const Te=re.scrollHeight-re.scrollTop-re.clientHeight<40;m.value=!i.value&&!Te&&t.value.length>0,T.value&&ge()}function ge(){const re=p.value;!re||!i.value||re.scrollHeight-re.scrollTop-re.clientHeight>=40&&(i.value=!1,m.value=t.value.length>0)}function xe(){i.value&&requestAnimationFrame(ge)}function De(re){de.has(re.key)&&xe()}const T=f(!1);function N(){i.value&&(T.value=!0,requestAnimationFrame(ge))}function V(){T.value&&(T.value=!1,ge())}function pe(){i.value&&(m.value=!1,Pt(()=>me()))}function $(){if(n.value=!n.value,!n.value&&C.value.length>0){for(const re of C.value)ce(re);C.value=[]}}function J(){t.value=[],C.value=[],m.value=!1}function ue(){let re;e.value==="search"?re=Pe.value.map(yt=>{const ot=yt.error?"ERROR":"INFO",es=yt.tool_name?`[${yt.tool_name}] `:"";return`${yt.timestamp||""} ${ot} ${es}${yt.result_summary||yt.message||""}`}).join(`
`):re=Z.value.map(Dp).join(`

`);const Te=new Blob([re],{type:"text/plain"}),Ue=URL.createObjectURL(Te),ze=document.createElement("a");ze.href=Ue,ze.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,ze.click(),URL.revokeObjectURL(Ue)}function H(re){const Te=Dp(re);navigator.clipboard.writeText(Te).then(()=>{h.value=re.id,setTimeout(()=>{h.value=null},1500)}).catch(()=>{})}function ee(re){l.value=l.value===re?"":re,v.value="all"}function Q(re){return re.level==="ERROR"?"log-line-error":re.level==="WARNING"?"log-line-warning":"text-gray-300"}function ve(re){return re==="ERROR"?"text-red-500 font-semibold":re==="WARNING"?"text-yellow-500":"text-blue-500"}function oe(re){return re==="ERROR"?"log-chip-error":re==="WARNING"?"log-chip-warning":"log-chip-info"}function ye(re){v.value=re.id;const Te=re.filters;l.value=Te.level||"",b.value=Te.timeRange||"",o.value=Te.text||"",Te.levels&&(l.value=Te.levels[0]||""),Te.hasToolName&&(o.value="")}function Oe(re){v.value=re.id,l.value=re.filters.level||"",b.value=re.filters.timeRange||"",o.value=re.filters.text||""}function Me(){if(!E.value.trim())return;const re={id:"custom-"+Date.now(),name:E.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};x.value=[...x.value,re],R(),w.value=!1,E.value=""}function qe(re){x.value=x.value.filter(Te=>Te.id!==re),R(),v.value===re&&(v.value="all")}const He=f("all"),Ge=f(""),Je=f(""),lt=f(""),Ze=f(""),X=f(""),we=f(100),Ce=yS,Re=f(!1),se=f(!1),Ie=f(""),Pe=f([]),it=f(null),jt=f(null);function st(){e.value="search",it.value||wt()}async function wt(){try{it.value=await z.get("/api/logs/stats")}catch{}}function Dt(){const re=X.value;if(!re){lt.value="",Ze.value="";return}const Ue={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[re];if(Ue){const ze=new Date(Date.now()-Ue*1e3);lt.value=hs(ze),Ze.value=""}}function hs(re){const Te=Ue=>String(Ue).padStart(2,"0");return`${re.getFullYear()}-${Te(re.getMonth()+1)}-${Te(re.getDate())}T${Te(re.getHours())}:${Te(re.getMinutes())}`}function Zs(re){if(!re)return"";const Te=new Date(re);return isNaN(Te.getTime())?"":Te.toISOString()}async function vs(){Re.value=!0,Ie.value="",se.value=!0,jt.value=null;try{const re=new URLSearchParams;He.value&&He.value!=="all"&&re.set("level",He.value),Ge.value&&re.set("tool",Ge.value),Je.value&&re.set("q",Je.value);const Te=Zs(lt.value),Ue=Zs(Ze.value);Te&&re.set("start",Te),Ue&&re.set("end",Ue),re.set("limit",String(we.value));const ze=await z.get(`/api/logs/search?${re.toString()}`);Pe.value=ze.entries||[]}catch(re){Ie.value=re.message||"Search failed",Pe.value=[]}finally{Re.value=!1}}function Ne(){He.value="all",Ge.value="",Je.value="",lt.value="",Ze.value="",X.value="",we.value=100,Pe.value=[],se.value=!1,Ie.value="",jt.value=null}function xa(re){jt.value=jt.value===re?null:re}function Ys(re){if(!re.timestamp)return"";try{return new Date(re.timestamp).toLocaleString()}catch{return re.timestamp}}function mn(re){return re.type==="web_action"?`${re.status||""} (${re.execution_time_ms||0}ms)`:(re.result_summary||"").slice(0,200)}function Us(re){return re.error?"log-line-error":"text-gray-300"}function hn(re){try{return JSON.stringify(re,null,2)}catch{return String(re)}}let Qs=null,dt=!1;function Bs(){dt||(dt=!0,nt.subscribe("logs",q),c.value=nt.connected,d.value=nt.state||"disconnected",Qs=nt.onState(re=>{d.value=re,c.value=re==="connected"}))}function Ja(){dt&&(dt=!1,nt.unsubscribe("logs",q),Qs&&(Qs(),Qs=null))}return Qe(()=>{_(),window.addEventListener("pointerup",V),window.addEventListener("pointercancel",V)}),os(Bs),Wt(Ja),gt(()=>{Ja(),window.removeEventListener("pointerup",V),window.removeEventListener("pointercancel",V)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:le,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Z,pauseBuffer:C,showJumpBottom:m,copiedIndex:h,regexError:P,levels:A,logPresets:I,timeRanges:y,timeRange:b,activeLogPreset:v,customLogPresets:x,showSaveLogPreset:w,newLogPresetName:E,hasActiveLogFilters:U,timeRangeLabel:S,timelineBuckets:W,timelineMax:D,timelineSpanLabel:O,timelineLabelSkip:M,togglePause:$,clearLogs:J,exportLogs:ue,logLineClass:Q,levelClass:ve,levelChipClass:oe,toggleLevel:ee,copyLine:H,jumpToBottom:K,onScroll:he,onUserScrollIntent:xe,onUserScrollKey:De,onAutoScrollToggle:pe,onPointerDown:N,applyLogPreset:ye,applyCustomLogPreset:Oe,saveLogCustomPreset:Me,removeLogCustomPreset:qe,segmentHeight:ie,jumpToTimelineBucket:B,searchLevel:He,searchTool:Ge,searchKeyword:Je,searchStart:lt,searchEnd:Ze,searchTimePreset:X,searchLimit:we,searchLimits:Ce,searching:Re,searchRan:se,searchError:Ie,searchResults:Pe,searchStats:it,expandedSearch:jt,switchToSearch:st,runSearch:vs,clearSearchFilters:Ne,toggleSearchExpand:xa,formatSearchTs:Ys,searchEntryText:mn,searchLogLineClass:Us,formatJson:hn,applySearchTimePreset:Dt}}};function so(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const _S=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function wS(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const yi=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["grafana_alerts","outbound_webhooks"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],kS={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},ao=new Set(["llm_provider","openai_codex","ollama","openai_compatible","kimi","personality","discord","computer"]),SS=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Pp(e){return SS.some(t=>e===t||e.startsWith(`${t}.`))}const Av="odin_config_center_expanded_v1",Rv="odin_config_center_category_v1",TS=50,CS=650,zi=()=>z.get("/api/config/meta");function Tn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function ci(e,t){return JSON.stringify(e)===JSON.stringify(t)}function ei(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function ES(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function AS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Iv(e,t){if(ci(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Tn(t);const a={};for(const[n,i]of Object.entries(t)){const l=Iv(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function RS(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=Iv(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function Ov(e,t,s,a){if(ci(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Ov(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function IS(){try{const e=JSON.parse(localStorage.getItem(Av)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function OS(){try{const e=localStorage.getItem(Rv);return yi.some(t=>t.key===e)?e:yi[0].key}catch{return yi[0].key}}const LS={template:`
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
        <section class="hm-card mb-4 p-4" aria-labelledby="listener-consent-title">
          <div class="cfgc-listener-heading">
            <h2 id="listener-consent-title" class="font-semibold">Web listener exposure</h2>
            <span :class="['cfgc-listener-state', 'state-' + listenerStatusTone]">{{ listenerStatusLabel }}</span>
          </div>
          <p class="text-sm text-gray-400 mb-3">Control whether Odin may use the configured listener beyond loopback. This setting changes the next start only; the running socket is reported separately.</p>
          <div class="cfgc-listener-facts" role="status" aria-live="polite">
            <div><span>Authorization</span><strong>{{ listenerAuthorizationCopy }}</strong></div>
            <div><span>Configured host</span><strong><code>{{ listenerState?.configured_host || config.web?.host || 'unavailable' }}</code> · {{ listenerConfiguredSourceCopy }}</strong></div>
            <div><span>Running listener</span><strong>{{ listenerRunningCopy }}</strong></div>
          </div>
          <label class="text-sm block mb-3"><input type="checkbox" v-model="listenerConsent" :disabled="listenerSaving || !listenerState" /> Allow access beyond loopback using the configured host on the next restart.</label>
          <label class="text-sm block mb-3">Re-enter a current admin API token
            <input type="password" v-model="listenerCredential" autocomplete="off" :disabled="listenerSaving" aria-label="Admin API token for listener consent" />
          </label>
          <p class="text-xs text-gray-400 mb-3">Your browser session alone cannot authorize exposure. This token is used only for this request, not saved or used to replace your session.</p>
          <button type="button" class="btn btn-ghost text-xs" @click="saveListenerConsent" :disabled="!listenerChoiceChanged || !listenerCredential.trim() || listenerSaving || hasChanges">{{ listenerSaving ? 'Saving choice…' : listenerConsent ? 'Authorize exposure' : 'Restrict to loopback' }}</button>
          <p class="text-xs text-gray-400 mt-2">Changing this does not restart Odin or alter the running socket. Restart Odin to apply it.</p>
          <p v-if="listenerMessage" role="status" class="text-sm mt-2">{{ listenerMessage }}</p>
          <p v-if="listenerError" role="alert" class="text-sm text-red-400 mt-2">{{ listenerError }}</p>
          <p v-if="listenerStatusError" role="alert" class="text-sm text-red-400 mt-2">{{ listenerStatusError }}</p>
        </section>
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
                    <section v-if="section === 'image'" class="cfgc-field-group nested cfgc-image-models" aria-label="Image model defaults">
                      <header class="cfgc-field-group-header">
                        <div>
                          <strong>Image model defaults</strong>
                          <p>Follow shipped defaults or pin the current runtime model.</p>
                          <p id="cfgc-image-model-save-note">Changes save immediately, without saving drafts. Edited model drafts remain unsaved.</p>
                        </div>
                        <button type="button" class="btn btn-ghost text-xs" :disabled="saving" @click="refreshImageModelMetadata">
                          <odin-icon name="refresh" :size="13" /> Refresh status
                        </button>
                      </header>
                      <p v-if="imageModelError" class="cfgc-image-model-notice cfgc-field-error" role="alert">{{ imageModelError }}</p>
                      <p v-if="!meta?.image_model_defaults" class="cfgc-image-model-notice">Image model metadata is unavailable.</p>
                      <div class="cfgc-fields">
                        <div v-for="leaf in imageModelLeaves" :key="leaf" class="cfgc-field" :data-image-model="leaf">
                          <div class="cfgc-field-copy">
                            <span class="cfgc-field-label" :id="'cfgc-image-model-label-' + leaf">{{ leaf === 'image_model' ? 'Image model' : 'Outer model' }}</span>
                            <code>image.openai.{{ leaf }}</code>
                          </div>
                          <div class="cfgc-field-control cfgc-image-model-control">
                            <div class="cfgc-image-model-effective">
                              <code>{{ meta?.image_model_defaults?.[leaf]?.effective ?? 'Unavailable' }}</code>
                              <span class="cfgc-image-model-status">{{ meta?.image_model_defaults?.[leaf]?.status === 'follow' ? 'Following defaults' : meta?.image_model_defaults?.[leaf]?.status === 'pin' ? 'Pinned' : 'Unavailable' }}</span>
                            </div>
                            <div class="cfgc-image-model-choice" role="group" :aria-labelledby="'cfgc-image-model-label-' + leaf" aria-describedby="cfgc-image-model-save-note">
                              <button type="button" :aria-pressed="meta?.image_model_defaults?.[leaf]?.status === 'follow'"
                                      :disabled="saving || !meta?.image_model_defaults?.[leaf]" @click="setImageModelDefaults([leaf], 'follow')">Follow defaults</button>
                              <button type="button" :aria-pressed="meta?.image_model_defaults?.[leaf]?.status === 'pin'"
                                      :disabled="saving || !meta?.image_model_defaults?.[leaf]" @click="setImageModelDefaults([leaf], 'pin')">Pin current</button>
                            </div>
                            <p v-if="meta?.image_model_defaults?.[leaf]?.default != null && meta.image_model_defaults[leaf].default !== meta.image_model_defaults[leaf].effective" class="cfgc-image-model-shipped">
                              Shipped default: <code>{{ meta.image_model_defaults[leaf].default }}</code>
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>
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

                      <div class="cfgc-fields" :inert="saving">
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=f(!1),o=f(""),r=f(!1),c=f(""),d=f(""),u=f("");function p(k){i.value=k||null,k&&typeof k.authorized=="boolean"&&(l.value=k.authorized)}async function m(){try{const k=await z.get("/api/setup/status");p(k.listener),u.value=""}catch(k){p(null),u.value=`Listener status could not be loaded: ${k.message||"Unknown error"}`}}async function h(){if(!(!pe.value||!o.value.trim()||r.value||V.value)){r.value=!0,c.value="",d.value="";try{const k=z.setListenerExposure(o.value.trim(),l.value);o.value="";const G=await k;c.value=G.message,p(G.listener)}catch(k){d.value=k.message||"Listener consent could not be saved."}finally{o.value="",r.value=!1}}}const g=f(null),A=["image_model","outer_model"],I=f(null),y=f(null),v=f(null),b=f(!1),x=f(!1),w=f(null),E=f(""),C=f("all"),_=f(OS()),R=f(IS()),U=f({}),S=f({}),P=f(""),Y=f({}),W=f({}),D=f([]),O=f([]),M=f(!1),ae=f(!1),ie=f(!1);let B=null,Z=null,le={path:null,at:0},q=0;const ce=j(()=>{var k;return(((k=t.value)==null?void 0:k.fields)||[]).filter(G=>!ao.has(G.path.split(".")[0])&&!Pp(G.path))}),me=j(()=>new Map(ce.value.map(k=>[k.path,k]))),K=j(()=>De.value.reduce((k,G)=>k+G.sections.length,0)),de=j(()=>ce.value.length),he=j(()=>_S),ge=j(()=>D.value.length>0),xe=j(()=>O.value.length>0),De=j(()=>{if(!e.value)return[];const k=new Set(yi.flatMap(ke=>ke.sections)),G=yi.map(ke=>({...ke,sections:ke.sections.filter(We=>Object.hasOwn(e.value,We)&&!ao.has(We))})).filter(ke=>ke.sections.length),te=Object.keys(e.value).filter(ke=>!k.has(ke)&&!ao.has(ke));return te.length&&G.push({key:"other",label:"Other",icon:"folder",sections:te}),G}),T=j(()=>e.value?{...e.value,...U.value}:null),N=j(()=>{if(!e.value)return[];const k=[];for(const[G,te]of Object.entries(U.value))Ov(e.value[G],te,G,k);return k.filter(G=>!ci(G.oldVal,G.newVal)).map(G=>{const te=lt(G.path);return{...G,label:(te==null?void 0:te.label)||ei(G.path.split(".").at(-1)),apply_mode:(te==null?void 0:te.apply_mode)||Ie(G.path.split(".")[0])}})}),V=j(()=>N.value.length>0),pe=j(()=>!!i.value&&l.value!==i.value.authorized),$=j(()=>{var G;const k=(G=i.value)==null?void 0:G.state;return k==="active"||k==="authorized_loopback"?"active":["pending_widening","pending_narrowing","active_rebind_pending"].includes(k)?"pending":k==="restricted"?"restricted":"unknown"}),J=j(()=>{var k;return{active:"Exposure active",authorized_loopback:"Authorized · loopback host",pending_widening:"Authorized · restart pending",pending_narrowing:"Restriction saved · restart pending",active_rebind_pending:"Exposed · restart pending",restricted:"Loopback only",unknown:"Runtime state unavailable"}[(k=i.value)==null?void 0:k.state]||"Loading listener state"}),ue=j(()=>i.value?i.value.authorized?i.value.authorization_source==="explicit"?"Beyond-loopback access is explicitly authorized":"Beyond-loopback access is retained from this installation":"Beyond-loopback access is not authorized":"Unavailable"),H=j(()=>{var k;return{explicit:"saved explicitly in config.yml",default:"schema default; no web.host key is saved",unknown:"source could not be verified"}[(k=i.value)==null?void 0:k.configured_host_source]||"source unavailable"}),ee=j(()=>{const k=i.value;return!k||k.running_scope==="unavailable"?"Actual bound address unavailable":`${(k.listening_hosts||[]).map((te,ke)=>{var St;const We=(St=k.listening_ports)==null?void 0:St[ke];return We?`${te}:${We}`:te}).join(", ")} · ${k.running_scope==="loopback"?"loopback only":"accepting beyond loopback"}`}),Q=j(()=>N.value.length),ve=j(()=>new Set(N.value.map(k=>k.path.split(".")[0])).size),oe=j(()=>!!E.value||C.value!=="all"),ye=j(()=>{const k={...W.value};for(const G of N.value){const te=lt(G.path),ke=ne(te,G.newVal);ke&&(k[G.path]=ke)}return k}),Oe=j(()=>Object.keys(ye.value).length>0),Me=j(()=>e.value?(oe.value?De.value:De.value.filter(G=>G.key===_.value)).map(G=>({...G,sections:G.sections.filter(te=>Qs(te))})).filter(G=>G.sections.length):[]),qe=j(()=>{const k=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],G=new Map(k.map(te=>[te,[]]));for(const te of N.value){const ke=G.has(te.apply_mode)?te.apply_mode:"restart";G.get(ke).push(te)}return k.filter(te=>G.get(te).length).map(te=>({key:te,label:gs(te),entries:G.get(te)}))}),He=j(()=>N.value.filter(k=>k.apply_mode==="restart").length),Ge=j(()=>ce.value.filter(k=>k.pending_restart)),Je=j(()=>Ge.value.length);function lt(k){const G=me.value.get(k);return G?{...G,apply_details:so([G])}:null}function Ze(k){const G=`${k}.`;return ce.value.filter(te=>te.path===k||te.path.startsWith(G))}function X(){return ce.value.some(k=>k.path==="tools.hosts"||k.path.startsWith("tools.hosts."))}function we(){var te,ke;const k=((ke=(te=e.value)==null?void 0:te.tools)==null?void 0:ke.hosts)||{},G=Object.keys(k).length;return`${G} host${G===1?"":"s"} configured.`}function Ce(k){return Ze(k).length}function Re(k){return ei(k)}function se(k){const G=Ze(k);if(!G.length)return`${ei(k)} configuration.`;const te=G.find(St=>St.sensitivity==="public"&&St.description)||G.find(St=>St.description),ke=(te==null?void 0:te.description)||"";return ke.match(/setting for (.+)\.$/i)?`${ei(k)} settings and runtime behaviour.`:ke}function Ie(k){const G=[...new Set(Ze(k).map(te=>te.apply_mode))];return G.length===1?G[0]:G.includes("restart")?"restart":G.includes("activation_required")?"activation_required":G[0]||"restart"}function Pe(k){const G=[...new Set(Ze(k).map(te=>gs(te.apply_mode)))];return G.length?G.length===1?G[0]:`Mixed apply behaviour: ${G.join(" · ")}`:""}function it(k){return so(Ze(k))}function jt(k){var G;return Object.hasOwn(U.value,k)?U.value[k]:(G=e.value)==null?void 0:G[k]}function st(){const k=jt("mcp")||{},G=Object.keys(k.servers||{}).length;return`${k.enabled?"Globally enabled":"Globally disabled"} · ${G} configured server${G===1?"":"s"}.`}function wt(k,G){return G.split(".").reduce((te,ke)=>te==null?void 0:te[ke],k)}function Dt(k){const G=T.value;return Ze(k).filter(te=>Pp(te.path)?!1:te.path.split(".").length<=2?!0:!te.path.includes(".*")).map(te=>({...te,key:te.path.split(".").at(-1),value:wt(G,te.path),apply_details:so([te]),editor:te.path==="agents.final_warning_iterations"?"warning-chips":null}))}function hs(k){const G=k.path.split(".");return G.length>2?G.slice(0,2).join("."):null}function Zs(k){const G=new Map;for(const te of Dt(k)){const ke=hs(te),We=ke||`${k}.__root`;G.has(We)||G.set(We,{key:We,path:ke,entries:[]}),G.get(We).entries.push(te)}return[...G.values()].map(te=>{const ke=te.entries.find(We=>We.group_description);return{...te,label:te.path?ei(te.path.split(".").at(-1)):null,description:(ke==null?void 0:ke.group_description)||null,apply_details:so(te.entries),runtime_summaries:Ne(te.entries)}})}function vs(k){return{save:k.save_effect||(k.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:k.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[k.apply_mode]||"Effective runtime state is not currently observable."}}function Ne(k){const G=new Map;for(const te of k){const ke=vs(te),We=`${te.apply_mode}|${ke.save}|${ke.runtime}`;G.has(We)||G.set(We,{key:We,label:gs(te.apply_mode),save:ke.save,runtime:ke.runtime})}return[...G.values()]}function xa(k){if(Ys(k))return k.runtime_effect||k.activation_policy||"";if(k.apply_mode==="activation_required"){const G=k.activation_policy||k.runtime_effect;return G?`Not active after saving. No activation control exists in this release. ${G}`:"Not active after saving; no activation control exists in this release."}return""}function Ys(k){return k.action_available===!0&&!!(k.action_label&&k.action_endpoint)}async function mn(k){if(Ys(k))try{if(Te(k.path))throw new Error("Save this setting before applying its action.");const G=String(k.action_method||"POST").toLowerCase(),te={post:z.post.bind(z),put:z.put.bind(z),delete:z.del.bind(z)}[G];if(!te)throw new Error("Unsupported configuration action");await te(k.action_endpoint,k.action_body||void 0),await bs(),Sa("success",`${k.action_label} completed.`)}catch(G){Sa("error",G.message||`${k.action_label} failed`)}}function Us(k,G){return[k.label,k.path,k.description,...k.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(G)}function hn(k){const G=E.value.trim().toLowerCase();return G?Ze(k).filter(te=>Us(te,G)):[]}function Qs(k){const G=Ze(k);if(C.value!=="all"&&!G.some(ke=>ke.apply_state===C.value))return!1;const te=E.value.trim().toLowerCase();return!te||`${Re(k)} ${k}`.toLowerCase().includes(te)?!0:G.some(ke=>Us(ke,te))}function dt(k,G){return Ze(k).filter(te=>te.apply_state===G).length}function Bs(k){return k==="all"?de.value:ce.value.filter(G=>G.apply_state===k).length}function Ja(k){const G=k.sections.flatMap(te=>Ze(te));return{fields:G.length,modified:N.value.filter(te=>k.sections.includes(te.path.split(".")[0])).length,pending_restart:G.filter(te=>te.apply_state==="pending_restart").length,invalid:G.filter(te=>te.apply_state==="invalid").length,dormant:G.filter(te=>te.apply_state==="dormant").length}}function re(k){var G;return Object.hasOwn(U.value,k)&&!ci((G=e.value)==null?void 0:G[k],U.value[k])}function Te(k){return N.value.some(G=>G.path===k||G.path.startsWith(`${k}.`))}function Ue(k){_.value=k,E.value="",C.value="all";try{localStorage.setItem(Rv,k)}catch{}}function ze(k){C.value=k}function yt(){E.value="",C.value="all"}function ot(k){var G;return((G=De.value.find(te=>te.sections.includes(k)))==null?void 0:G.sections)||[]}function es(k){const G=ot(k),te=G.find(ke=>R.value[ke]===!0);return te||G.find(ke=>R.value[ke]!==!1)||null}function Hs(k){return E.value&&!ie.value&&Qs(k)?!0:ie.value?es(k)===k:Object.hasOwn(R.value,k)?R.value[k]===!0:!0}function Mi(k){const G=!Hs(k);if(ie.value){const te={...R.value};for(const ke of ot(k))te[ke]===!0&&(te[ke]=!1);te[k]=G,R.value=te;return}R.value={...R.value,[k]:G}}function qn(){D.value.push(Tn(U.value)),D.value.length>TS&&D.value.shift(),O.value=[]}function vn(){n.value||V.value&&(qn(),U.value={},W.value={},M.value=!1)}function Gn(k,G=!1){const te=Date.now();if(G&&le.path===k&&te-le.at<CS){le.at=te;return}qn(),le={path:k,at:te}}function _a(k,G,te){if(!G.length)return te;const ke=Tn(k??{});let We=ke;for(let St=0;St<G.length-1;St+=1){const sa=G[St];We[sa]=Tn(We[sa]??{}),We=We[sa]}return We[G.at(-1)]=te,ke}function Xs(k){var G;return Object.hasOwn(U.value,k)?U.value[k]:Tn((G=e.value)==null?void 0:G[k])}function Kt(k,G,te={}){var Zn;if(n.value||ao.has(k.path.split(".")[0]))return;const[ke,...We]=k.path.split(".");Gn(k.path,!!te.coalesce);const St=Xs(ke),sa=We.length?_a(St,We,G):G,ra={...U.value};if(ci(sa,(Zn=e.value)==null?void 0:Zn[ke])?delete ra[ke]:ra[ke]=sa,U.value=ra,W.value[k.path]){const xn={...W.value};delete xn[k.path],W.value=xn}}function wa(k){le={path:null,at:0},S.value={...S.value,[k]:String(wt(T.value,k)??"")}}function Jt(k){if(le={path:null,at:0},!Object.hasOwn(S.value,k))return;const G={...S.value};delete G[k],S.value=G}function gn(k){const G=S.value[k.path];if(le={path:null,at:0},G===""){if(k.nullable){Jt(k.path),Kt(k,null,{coalesce:!0});return}W.value={...W.value,[k.path]:"Enter a number."};return}const te=Number(G);if(Number.isNaN(te)||k.type==="integer"&&!Number.isInteger(te)){W.value={...W.value,[k.path]:k.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ke={...S.value};delete ke[k.path],S.value=ke,Kt(k,te,{coalesce:!0})}function Za(k){return Object.hasOwn(S.value,k.path)?S.value[k.path]:k.value??""}function Wn(k,G){if(S.value={...S.value,[k.path]:G},G===""){if(k.nullable){Kt(k,null,{coalesce:!0});return}W.value={...W.value,[k.path]:"Enter a number."};return}const te=Number(G);if(!Number.isFinite(te)||k.type==="integer"&&!Number.isInteger(te)){W.value={...W.value,[k.path]:k.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(W.value[k.path]){const ke={...W.value};delete ke[k.path],W.value=ke}Kt(k,te,{coalesce:!0})}function Ya(k){const G=Number.parseInt(P.value,10);if(!Number.isInteger(G)||G<1){W.value={...W.value,[k.path]:"Warning thresholds must be positive whole numbers."};return}const te=[...new Set([...k.value||[],G])].sort((ke,We)=>We-ke);P.value="",Kt(k,te)}function bn(k,G){Kt(k,(k.value||[]).filter(te=>te!==G))}function Qa(k){return k.apply_mode==="live_read"?"Odin reads the saved file value on next use.":k.apply_mode==="live_for_new_work"?"New work uses the saved file value.":k.apply_mode==="live_apply"?k.apply_handler?`Apply the saved value through ${k.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":k.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":k.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":k.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function ea(k){return k.type==="array"&&Array.isArray(k.value)&&!k.structured_container&&!k.structured_container_child&&k.sensitivity==="public"&&k.value.every(G=>["string","number","boolean"].includes(typeof G))}function Se(k){const G=String(Y.value[k.path]??"").trim();if(!G)return;const te=[...new Set([...k.value||[],G])];Y.value={...Y.value,[k.path]:""},Kt(k,te)}function L(k,G){Kt(k,(k.value||[]).filter(te=>te!==G))}function ne(k,G){var ke;if(!k)return null;if((ke=k.enum)!=null&&ke.length&&!k.enum.includes(G))return`Choose one of: ${k.enum.join(", ")}`;if(k.path==="agents.final_warning_iterations"&&(!Array.isArray(G)||!G.length))return"Add at least one warning threshold.";const te=k.constraints||{};if((k.type==="integer"||k.type==="number")&&typeof G=="number"){if(te.minimum!==void 0&&G<te.minimum)return`Must be at least ${te.minimum}${k.unit?` ${k.unit}`:""}`;if(te.maximum!==void 0&&G>te.maximum)return`Must be at most ${te.maximum}${k.unit?` ${k.unit}`:""}`}return null}function be(k){return ye.value[k.path]||null}function Fe(k){const G=`${k}.`;return Object.keys(ye.value).some(te=>te===k||te.startsWith(G))}function Be(){n.value||D.value.length&&(O.value.push(Tn(U.value)),U.value=D.value.pop(),W.value={},S.value={},le={path:null,at:0})}function Ve(){n.value||O.value.length&&(D.value.push(Tn(U.value)),U.value=O.value.pop(),W.value={},S.value={},le={path:null,at:0})}function At(){!V.value||Oe.value||(M.value=!0,ae.value=!1)}function mt(){M.value=!1}function kt(){vn()}function gs(k){return kS[k]||ei(k||"unknown")}function Rt(k){return`apply-${String(k||"unknown").replaceAll("_","-")}`}function ka(k){return`cfgc-field-${k.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Kn(k){return`${ka(k)}-input`}function Sr(k){const G=document.getElementById(ka(k))||document.getElementById(ka(k.split(".").slice(0,2).join(".")));G==null||G.scrollIntoView({behavior:"smooth",block:"center"})}function Sa(k,G){y.value={type:k,message:G},window.setTimeout(()=>{var te;((te=y.value)==null?void 0:te.message)===G&&(y.value=null)},3500)}function Tr(){b.value=!1,C.value="pending_restart",E.value="";const k=wS(a.value);k&&(k.scrollTop=0)}function Cr(){b.value=!1}function F(k=1800){Z&&window.clearTimeout(Z),Z=window.setTimeout(fe,k)}async function fe(){if(x.value){if(q+=1,q>45){x.value=!1,w.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await zi(),Je.value===0){x.value=!1,w.value=null,Sa("success","Odin restarted and the saved startup settings are active.");return}}catch{}F(2e3)}}async function Ae(){if(!x.value){w.value=null;try{await z.post("/api/restart",{}),x.value=!0,q=0,b.value=!1,F()}catch(k){w.value=k.message||"Odin could not schedule a restart."}}}async function ut(){if(!(!V.value||Oe.value||n.value)){n.value=!0;try{const k=RS(e.value,U.value),G=await z.put("/api/config",k);e.value=G,U.value={},D.value=[],O.value=[],W.value={},M.value=!1;try{t.value=await zi(),v.value=null,b.value=Je.value>0,Sa("success",Je.value?`Configuration saved. ${Je.value} setting${Je.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(te){v.value=te.message||"Unknown metadata error.",Sa("error",`Configuration saved, but apply status could not be refreshed: ${v.value}`)}}catch(k){Sa("error",k.message||"Configuration could not be saved")}finally{n.value=!1}}}async function ts(){if(!n.value){n.value=!0,g.value=null;try{t.value=await zi(),v.value=null}catch(k){g.value=`Image model status could not be refreshed: ${k.message||"Unknown error"}`}finally{n.value=!1}}}async function Le(k,G){if(n.value||!["follow","pin"].includes(G)||!k.length||k.some(ke=>{var We,St;return!A.includes(ke)||!((St=(We=t.value)==null?void 0:We.image_model_defaults)!=null&&St[ke])}))return;n.value=!0,g.value=null;let te=!1;try{const ke=await z.post("/api/config/image-models",{operations:Object.fromEntries(k.map(We=>[We,G])),expected_revision:t.value.image_model_revision});te=!0;for(const We of k){const St=`image.openai.${We}`,sa=wt(e.value,St),ra=wt(ke.config,St),Zn=xn=>!Object.hasOwn(xn,"image")||!ci(wt(xn,St),sa)?xn:_a(xn,St.split("."),ra);U.value=Zn(U.value),D.value=D.value.map(Zn),O.value=O.value.map(Zn),e.value=_a(e.value,St.split("."),ra)}t.value={...t.value,image_model_defaults:ke.image_model_defaults,image_model_revision:ke.image_model_revision},Sa("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(ke){g.value=`Image model operation failed: ${ke.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await zi(),v.value=null}catch(ke){const We=`Image model status could not be refreshed: ${ke.message||"Unknown error"}`;v.value=We,g.value=te?`Image model defaults were saved, but ${We}`:`${g.value} ${We}`}finally{n.value=!1}}async function bs(){var k,G;if(!(V.value||n.value)){s.value=!0,I.value=null;try{const te=await z.get("/api/config"),ke=await zi();await m(),e.value=te,t.value=ke,v.value=null;const We=De.value;if(We.some(St=>St.key===_.value)||(_.value=((k=We[0])==null?void 0:k.key)||yi[0].key),ie.value){const sa=(((G=We.find(ra=>ra.key===_.value))==null?void 0:G.sections)||[]).find(ra=>R.value[ra]===!0);R.value=sa?{...R.value,[sa]:!0}:{}}}catch(te){I.value=te.message||"Unknown configuration error"}finally{s.value=!1}}}function Zt(k){if(M.value||!(k.ctrlKey||k.metaKey))return;const G=k.target;G instanceof HTMLElement&&(G.matches("input, textarea, select")||G.isContentEditable)||(!k.shiftKey&&k.key.toLowerCase()==="z"?(k.preventDefault(),Be()):(k.key.toLowerCase()==="y"||k.shiftKey&&k.key.toLowerCase()==="z")&&(k.preventDefault(),Ve()))}function ta(k){ie.value=k.matches}Ht(R,k=>{try{localStorage.setItem(Av,JSON.stringify(k))}catch{}},{deep:!0});let yn=!1;function Jn(){yn||(yn=!0,document.addEventListener("keydown",Zt))}function Er(){yn&&(yn=!1,document.removeEventListener("keydown",Zt))}return Qe(()=>{var k;bs(),Jn(),B=window.matchMedia("(max-width: 760px)"),ta(B),(k=B.addEventListener)==null||k.call(B,"change",ta)}),os(Jn),Wt(Er),Wt(()=>{o.value=""}),gt(()=>{var k;o.value="",Er(),(k=B==null?void 0:B.removeEventListener)==null||k.call(B,"change",ta),Z&&window.clearTimeout(Z)}),{listenerState:i,listenerConsent:l,listenerCredential:o,listenerSaving:r,listenerMessage:c,listenerError:d,listenerStatusError:u,listenerChoiceChanged:pe,listenerStatusTone:$,listenerStatusLabel:J,listenerAuthorizationCopy:ue,listenerConfiguredSourceCopy:H,listenerRunningCopy:ee,saveListenerConsent:h,armKeydown:Jn,disarmKeydown:Er,handleKeydown:Zt,config:e,meta:t,loading:s,saving:n,error:I,toast:y,metaRefreshError:v,restartPromptOpen:b,restartScheduled:x,restartError:w,configMain:a,imageModelError:g,imageModelLeaves:A,setImageModelDefaults:Le,refreshImageModelMetadata:ts,searchQuery:E,healthFilter:C,activeCategory:_,reviewOpen:M,mobileOverflowOpen:ae,warningThresholdInput:P,arrayInputs:Y,healthFilters:he,visibleCategories:De,displayGroups:Me,reviewGroups:qe,sectionCount:K,fieldCount:de,hasChanges:V,changeCount:Q,changedSectionCount:ve,hasDraftErrors:Oe,canUndo:ge,canRedo:xe,globalFilterActive:oe,reviewRestartCount:He,pendingRestartCount:Je,pendingRestartFields:Ge,healthCount:Bs,categoryStats:Ja,selectCategory:Ue,selectHealthFilter:ze,clearFilters:yt,sectionLabel:Re,sectionDescription:se,sectionFieldCount:Ce,sectionHealthCount:dt,sectionApplySummary:Pe,sectionApplyDetails:it,sectionEntries:Dt,fieldGroups:Zs,sectionSearchHits:hn,mcpConfigSummary:st,fieldRuntimeCopy:vs,fieldSpecificRuntimeNote:xa,hasHonestAction:Ys,runFieldAction:mn,hasHostsCollection:X,hostsConfigSummary:we,sectionChanged:re,fieldChanged:Te,isSectionExpanded:Hs,toggleSection:Mi,discardAllDrafts:vn,setFieldValue:Kt,setNumberFieldValue:Wn,numberInputValue:Za,beginInputEdit:wa,endTextInputEdit:Jt,endInputEdit:gn,addWarningThreshold:Ya,removeWarningThreshold:bn,isScalarArray:ea,addScalarArrayItem:Se,removeScalarArrayItem:L,fieldError:be,sectionHasErrors:Fe,undo:Be,redo:Ve,openReview:At,closeReview:mt,mobileCancel:kt,applyModeLabel:gs,applyClass:Rt,compactValue:ES,formatValue:AS,structuredApplyCopy:Qa,fieldId:ka,fieldInputId:Kn,focusField:Sr,fetchConfig:bs,saveConfig:ut,restartOdin:Ae,restartLater:Cr,reviewPendingRestart:Tr}}},NS=/^\d{15,25}$/;function Lv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Nv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=j(()=>new Set((e.excludedIds||[]).map(String))),o=j(()=>{const x=s.value.toLowerCase().trim();return(e.members||[]).filter(w=>l.value.has(String(w.id))?!1:x?u(w).toLowerCase().includes(x)||String(w.username||"").toLowerCase().includes(x)||String(w.id).includes(x):!0)}),r=j(()=>{const x=s.value.trim();return o.value.length===0&&NS.test(x)&&!l.value.has(x)?x:""}),c=j(()=>o.value.length+(r.value?1:0)),d=j(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(x){return Lv(x)}function p(){a.value=!0,n.value=0}function m(){p()}function h(){const x=Math.max(c.value-1,0);n.value=Math.min(n.value+1,x)}function g(){n.value=Math.max(n.value-1,0)}function A(){const x=o.value[n.value];x?I(x):r.value&&n.value===o.value.length&&y(r.value)}function I(x){y(String(x.id))}function y(x){t("select",x),s.value="",a.value=!1,n.value=0}function v(){a.value=!1}function b(){setTimeout(v,150)}return Qe(()=>{e.autofocus&&Pt(()=>{var x;return(x=i.value)==null?void 0:x.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:m,highlightNext:h,highlightPrevious:g,selectHighlighted:A,selectMember:I,selectId:y,closeOptions:v,onBlur:b}}};function Fp(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const DS={components:{DiscordUserCombobox:Nv},template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Discord Channels</h1>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <section class="hm-card mb-4">
        <div class="flex items-center justify-between gap-3">
          <div><h2 class="text-sm font-semibold text-gray-300">Gateway connection</h2>
            <p class="text-xs text-gray-500">Saved credential: {{ connection.persisted ? 'present' : 'absent' }}. Runtime: {{ connection.active?.state || 'unknown' }}.</p></div>
          <div class="flex gap-2"><button class="btn btn-ghost text-xs" @click="connectDiscord" :disabled="connectionBusy || !connection.persisted">Connect</button>
            <button class="btn btn-ghost text-xs" @click="detachDiscord" :disabled="connectionBusy">Detach</button></div>
        </div>
        <form class="flex gap-2 mt-3" @submit.prevent="saveDiscordCredentials">
          <input v-model="connectionToken" class="hm-input flex-1" type="password" autocomplete="off" spellcheck="false" placeholder="Discord bot token" :disabled="connectionBusy" />
          <button class="btn btn-primary text-xs" :disabled="connectionBusy || !connectionToken">{{ connectionBusy ? 'Saving…' : 'Save and connect' }}</button>
        </form>
        <p v-if="connectionError" class="text-xs text-red-400 mt-2" role="alert">{{ connectionError }}</p>
      </section>
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
  `,setup(){const e=f([]),t=f({persisted:!1,active:{state:"unknown"}}),s=f(""),a=f(!1),n=f(null);let i=null;const l=f(!0),o=f(null),r=f({}),c=f(null),d=f(null),u=f(!1),p=f(null),m=f({}),h=f([]);let g=0;const A=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),I=j(()=>JSON.stringify(c.value)!==JSON.stringify(d.value)),y=j(()=>new Map(h.value.map(me=>[String(me.id),me])));function v(me){return me.config&&me.config.enabled!==void 0?me.config.enabled:!0}function b(me){return Fp(me,"require_mention",c.value)}function x(me){return Fp(me,"respond_to_bots",c.value)}function w(me){return me.config&&Object.keys(me.config).length>0}function E(me){r.value[me]=!r.value[me]}function C(me){const K=me.discord||{};return{allowed_users:[...K.allowed_users||[]],channels:[...K.channels||[]],respond_to_bots:!!K.respond_to_bots,require_mention:!!K.require_mention,ignore_bot_ids:[...K.ignore_bot_ids||[]]}}async function _({showLoading:me=!0}={}){const K=++g;me&&(l.value=!0),o.value=null;try{const de=await z.get("/api/discord/guilds");K===g&&(e.value=de)}catch(de){K===g&&(o.value=de.message)}finally{me&&K===g&&(l.value=!1)}}async function R(){try{t.value=await z.get("/api/discord/connection"),n.value=null}catch(me){n.value=me.message}}async function U(me,K=null){if(!a.value){a.value=!0,n.value=null;try{const de={operation:me};K!==null&&(de.token=K),t.value=await z.post("/api/discord/connection",de),me==="credentials"&&(s.value="")}catch(de){n.value=de.message||"Connection update failed."}finally{a.value=!1}}}function S(){return U("credentials",s.value)}function P(){return U("connect")}function Y(){return U("detach")}async function W(){l.value=!0,o.value=null;try{const[me,K,de]=await Promise.all([z.get("/api/discord/guilds"),z.get("/api/discord/members").catch(()=>[]),z.get("/api/config")]),he=C(de),ge=I.value;c.value=he,ge||(d.value=JSON.parse(JSON.stringify(he))),h.value=K,e.value=me,p.value=null}catch(me){o.value=me.message}finally{l.value=!1}}let D=Promise.resolve();const O=f(new Set);function M(me,K){const de=new Set(O.value);de.add(me),O.value=de;const he=D.then(K);return D=he.catch(()=>{}),he.finally(()=>{const ge=new Set(O.value);ge.delete(me),O.value=ge})}function ae(me,K,de,he){const ge=(he==null?void 0:he.target)??null;return M(`guild:${me}:${K}`,async()=>{try{await z.put("/api/discord/guild/"+me+"/config",{[K]:de}),await _({showLoading:!1})}catch(xe){o.value=xe.message,ge&&typeof de=="boolean"&&(ge.checked=!de)}})}function ie(me,K,de,he,ge){const xe=(ge==null?void 0:ge.target)??null;return M(`channel:${me}:${de}`,async()=>{try{await z.put("/api/discord/channel/"+me+"/config",{[de]:he}),await _({showLoading:!1})}catch(De){o.value=De.message,xe&&typeof he=="boolean"&&(xe.checked=!he)}})}function B(me,K){return M(`channel:${me}:clear`,async()=>{try{await z.put("/api/discord/channel/"+me+"/config",{clear:!0}),await _({showLoading:!1})}catch(de){o.value=de.message}})}function Z(me,K){const de=String(K);if(!me.userAutocomplete)return de;const he=y.value.get(de);return he?Lv(he):de}function le(me,K=null){const de=String(K??m.value[me]??"").trim();!de||d.value[me].includes(de)||(d.value[me]=[...d.value[me],de],m.value={...m.value,[me]:""})}function q(me,K){d.value[me]=d.value[me].filter(de=>de!==K)}async function ce(){if(!(!I.value||u.value)){u.value=!0,p.value=null;try{const K=(await z.put("/api/config",{discord:d.value})).discord||d.value;c.value={allowed_users:[...K.allowed_users||[]],channels:[...K.channels||[]],respond_to_bots:!!K.respond_to_bots,require_mention:!!K.require_mention,ignore_bot_ids:[...K.ignore_bot_ids||[]]},d.value=JSON.parse(JSON.stringify(c.value))}catch(me){p.value=me.message||"Global defaults could not be saved."}finally{u.value=!1}}}return Qe(()=>{W(),R(),i=window.setInterval(R,5e3)}),gt(()=>{i!==null&&window.clearInterval(i),i=null}),{guilds:e,loading:l,error:o,expanded:r,globalDraft:d,globalSaving:u,globalError:p,globalArrayInputs:m,globalMembers:h,globalListEditors:A,globalChanged:I,guildEnabled:v,guildMention:b,guildBots:x,hasOverride:w,toggleGuild:E,fetchAll:W,fetchGuilds:_,setGuildConfig:ae,setChannelConfig:ie,clearOverride:B,mutationPending:O,globalItemLabel:Z,addGlobalItem:le,removeGlobalItem:q,saveGlobalDefaults:ce,connection:t,connectionToken:s,connectionBusy:a,connectionError:n,saveDiscordCredentials:S,connectDiscord:P,detachDiscord:Y}}},Ns=e=>e==null?e:JSON.parse(JSON.stringify(e));function MS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let m=null;const h=new Map;function g(w){d+=1;const E=c.then(w,w);return c=E.catch(()=>{}),E}function A(w,E){m=Ns(w),h.clear();for(const[C,_]of Object.entries(E||{}))h.set(C,Ns(_))}function I(w){const E=Ns(w),C=++u;return g(async()=>{try{await e(Ns(E)),m=Ns(E),C===u&&a(Ns(E))}catch(_){C===u&&(n(Ns(m)),r(_,{kind:"default"}))}})}function y(w,E){const C=Ns(E),_=(p.get(w)||0)+1;return p.set(w,_),g(async()=>{try{await t(w,Ns(C)),h.set(w,Ns(C)),_===p.get(w)&&i(w,Ns(C))}catch(R){_===p.get(w)&&(l(w,Ns(h.get(w)??null)),r(R,{kind:"user",uid:w}))}})}function v(w){const E=(p.get(w)||0)+1;return p.set(w,E),g(async()=>{try{await s(w),h.delete(w),E===p.get(w)&&o(w)}catch(C){E===p.get(w)&&(l(w,Ns(h.get(w)??null)),r(C,{kind:"delete",uid:w}))}})}async function b(){for(;;){const w=c;if(await w,w===c)return d}}async function x(w){for(;;){const E=await b(),C=await w();if(E===d)return C}}return{seed:A,saveDefault:I,saveUser:y,deleteUser:v,whenIdle:b,readSnapshot:x,get revision(){return d}}}const PS={components:{DiscordUserCombobox:Nv},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=j(()=>{const S={};for(const P of r.value)S[P.id]=P;return S});function d(S){return c.value[S]||null}function u(S,P){return S?S.allowed_hosts===null||S.allowed_hosts===void 0?{allowed_hosts:[...P],default_host:S.default_host||"",allow_all:!0}:{allowed_hosts:S.allowed_hosts,default_host:S.default_host||"",allow_all:!1}:{allowed_hosts:[...P],default_host:P[0]||"",allow_all:!0}}const p=MS({applyDefault:async S=>{const P=S.allow_all?null:S.allowed_hosts;await z.put("/api/host-access/default-policy",{allowed_hosts:P,default_host:S.default_host})},applyUser:async(S,P)=>{const Y=P.allow_all?null:P.allowed_hosts;await z.put(`/api/host-access/user/${S}`,{allowed_hosts:Y,default_host:P.default_host})},applyDelete:S=>z.del(`/api/host-access/user/${S}`),onDefaultConfirmed:()=>_e.success("Default policy updated"),onDefaultRollback:S=>{S&&(i.value=S)},onUserConfirmed:S=>{const P=d(S);_e.success(`Updated access for ${P?P.display_name:S}`)},onUserRollback:(S,P)=>{const Y={...l.value};P?Y[S]=P:delete Y[S],l.value=Y},onUserDeleted:S=>{const P={...l.value};delete P[S],l.value=P},onError:(S,P)=>{var W;const Y=P.uid?` ${((W=d(P.uid))==null?void 0:W.display_name)||P.uid}`:"";_e.error(`${S.message||"Failed to save"} — reverted${Y}`)}});let m=0;async function h(){const S=++m;e.value=!0,t.value="";try{const P=await p.readSnapshot(()=>z.get("/api/host-access"));if(S!==m)return;s.value=P,a.value=P.available_hosts||[],n.value=P.host_descriptions||{},i.value=u(P.default_policy,a.value);const Y=P.users||{},W={};for(const[D,O]of Object.entries(Y))W[D]=u(O,a.value);l.value=W,p.seed(i.value,W)}catch(P){S===m&&(t.value=P.message||"Failed to fetch host access data")}finally{S===m&&(e.value=!1)}try{const P=await z.get("/api/discord/members")||[];S===m&&(r.value=P)}catch{S===m&&(r.value=[])}}const g=500,A=new Map;function I(S,P){const Y=A.get(S);Y&&clearTimeout(Y.timer);const W={run:P,timer:null};W.timer=setTimeout(()=>{A.delete(S),P()},g),A.set(S,W)}function y(S){const P=A.get(S);P&&(clearTimeout(P.timer),A.delete(S))}function v(){for(const[S,P]of[...A])clearTimeout(P.timer),A.delete(S),P.run()}function b(){I("default",()=>p.saveDefault(i.value))}function x(S,P){i.value.allow_all=!1,P?i.value.allowed_hosts.includes(S)||i.value.allowed_hosts.push(S):(i.value.allowed_hosts=i.value.allowed_hosts.filter(Y=>Y!==S),i.value.default_host===S&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function w(S){I(`user:${S}`,()=>{const P=l.value[S];P&&p.saveUser(S,P)})}function E(S,P,Y){const W=l.value[S];W&&(W.allow_all=!1,Y?W.allowed_hosts.includes(P)||W.allowed_hosts.push(P):(W.allowed_hosts=W.allowed_hosts.filter(D=>D!==P),W.default_host===P&&(W.default_host=W.allowed_hosts[0]||"")),w(S))}function C(S,P){const Y=l.value[S];Y&&(Y.default_host=P,w(S))}function _(){o.value=!0}function R(S){!/^\d{15,25}$/.test(S)||l.value[S]||(l.value[S]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(S,l.value[S]),o.value=!1)}async function U(S){const P=d(S);await Xt({title:"Remove user override",message:`Remove the host access override for ${P?P.display_name:S}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${S}`),await p.deleteUser(S),l.value[S]||_e.success(`Removed override for ${P?P.display_name:S}`))}return Qe(h),Wt(v),gt(v),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:h,saveDefaultPolicy:b,toggleDefaultHost:x,getMember:d,toggleUserHost:E,setUserDefault:C,openAddUser:_,addUserById:R,deleteUser:U,flushPendingSaves:v}}},FS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),m=f(null),h=f(""),g=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),A=f(g()),I=j(()=>["127.0.0.1","localhost","::1"].includes(A.value.address));async function y(){t.value=!0,s.value="";try{const W=await z.get("/api/hosts");e.value=W.hosts||[],o.value=W.default_host||"",r.value=!!W.tofu_enabled}catch(W){s.value=W.message}finally{t.value=!1}}async function v(){try{await z.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),_e.success("Host settings saved and published live"),await y()}catch(W){_e.error(W.message)}}function b(){d.value="",u.value=[],p.value=!1,m.value=null,c.value=null,h.value="",l.value=1,n.value=!0}function x(){i.value=!1,A.value=g(),b()}function w(W){i.value=!0,A.value={...g(),...W},b()}async function E(){try{c.value=await z.get("/api/hosts/public-key")}catch(W){_e.error(W.message)}}async function C(W){try{const D=await z.post("/api/hosts/"+encodeURIComponent(W.alias)+"/import-legacy",{});i.value=!0,A.value={...g(),...W,trust_mode:"pinned"},b(),d.value=D.candidate_token,u.value=D.fingerprints||[],h.value=u.value.join(`
`),l.value=4,_e.info("Imported existing known_hosts trust. Test before activation.")}catch(D){_e.error(D.message)}}async function _(){try{const W=h.value.split(/\s+/).filter(Boolean),D={...A.value,expected_fingerprints:W,candidate_fingerprints:u.value},O=await z.post("/api/hosts/candidates",D);if(d.value=O.candidate_token,u.value=O.fingerprints||[],A.value.trust_mode==="tofu"&&D.candidate_fingerprints.length===0){A.value.confirm_tofu=!1,_e.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(W){_e.error(W.message)}}async function R(){var W,D;p.value=!1,m.value=null;try{const O=await z.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!O.tested,m.value=O.last_test,p.value&&(l.value=5)}catch(O){const M=(W=O.data)==null?void 0:W.last_test;M&&typeof M=="object"&&!Array.isArray(M)&&(m.value=M);const ae=(D=m.value)==null?void 0:D.detail;_e.error(typeof ae=="string"&&ae.trim()?ae:O.message)}}async function U(){try{await z.post("/api/hosts/candidates/"+d.value+"/commit",{}),_e.success("Host saved and published live"),n.value=!1,await y()}catch(W){_e.error(W.message)}}async function S(W){try{await z.post("/api/hosts/"+encodeURIComponent(W.alias)+"/enabled",{enabled:!W.enabled}),await y()}catch(D){_e.error(D.message)}}async function P(W){var D;if(await Xt("Delete host "+W.alias+"? Dependencies will block deletion.")){a.value=[];try{await z.del("/api/hosts/"+encodeURIComponent(W.alias)),await y()}catch(O){a.value=Array.isArray((D=O.data)==null?void 0:D.pending_references)?O.data.pending_references:[],_e.error(O.message)}}}async function Y(W){if(await Xt("Force revoke "+W.alias+"? Remote outcomes may be unknown."))try{await z.post("/api/hosts/"+encodeURIComponent(W.alias)+"/force-revoke",{}),await y()}catch(D){_e.error(D.message)}}return Qe(y),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:A,isLocal:I,keyInfo:c,candidate:d,observed:u,tested:p,testResult:m,fingerprintsText:h,load:y,saveSettings:v,beginAdd:x,beginEdit:w,loadKey:E,importLegacy:C,prepare:_,testConnection:R,commit:U,toggle:S,remove:P,forceRevoke:Y}}},$S={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=j(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=j(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function m(C){return C==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":C==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function h(){e.value=!0,t.value="";try{const C=await z.get("/api/tokens");s.value=C.tokens||[],a.value=C.available_hosts||[]}catch(C){t.value=C.message||"Failed to load tokens"}finally{e.value=!1}}function g(C){return!C||!C.trim()?[]:C.split(",").map(_=>_.trim()).filter(Boolean)}function A(C,_){const R=c.value.allowed_hosts;if(_&&!R.includes(C)&&R.push(C),!_){const U=R.indexOf(C);U>=0&&R.splice(U,1)}}function I(C,_){const R=d.value.allowed_hosts;if(_&&!R.includes(C)&&R.push(C),!_){const U=R.indexOf(C);U>=0&&R.splice(U,1)}}async function y(){var C;i.value=!0;try{const _=g(c.value.allowed_tools_str),R=c.value.host_mode,U=R==="none"?[]:R==="select"?c.value.allowed_hosts:null,S={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:_.length?_:[]};U!==null&&(S.allowed_hosts=U),S.default_host=c.value.default_host||"";const P=await z.post("/api/tokens",S);l.value=P.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,_e.success("Token created"),await h()}catch(_){_e.error(((C=_.data)==null?void 0:C.error)||_.message||"Failed to create token")}finally{i.value=!1}}function v(C){o.value=C;const _=C.allowed_hosts;let R="default";_==null?R="default":Array.isArray(_)&&_.length===0?R="none":Array.isArray(_)&&(R="select"),d.value={username:C.username||"",tier:C.tier||"admin",label:C.label||"",host_mode:R,allowed_hosts:Array.isArray(_)?[..._]:[],default_host:C.default_host||"",allowed_tools_str:(C.allowed_tools||[]).join(", ")}}async function b(){var C;if(o.value){r.value=!0;try{const _=g(d.value.allowed_tools_str),R=d.value.host_mode,U={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:_};R==="none"?U.allowed_hosts=[]:R==="select"?U.allowed_hosts=d.value.allowed_hosts:U.allowed_hosts=null,U.default_host=d.value.default_host||"",await z.put("/api/tokens/"+encodeURIComponent(o.value.user_id),U),o.value=null,_e.success("Token updated"),await h()}catch(_){_e.error(((C=_.data)==null?void 0:C.error)||_.message||"Failed to update")}finally{r.value=!1}}}async function x(C){var R;if(await Xt({title:"Regenerate token",message:`Regenerate token for ${C.username||C.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const U=await z.post("/api/tokens/"+encodeURIComponent(C.user_id)+"/regenerate");l.value=U.token,_e.success("Token regenerated")}catch(U){_e.error(((R=U.data)==null?void 0:R.error)||U.message||"Failed to regenerate")}}async function w(C){var R;if(await Xt({title:"Delete token",message:`Delete token for ${C.username||C.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/tokens/"+encodeURIComponent(C.user_id)),_e.success("Token deleted"),await h()}catch(U){_e.error(((R=U.data)==null?void 0:R.error)||U.message||"Failed to delete")}}async function E(){if(l.value)try{await navigator.clipboard.writeText(l.value),_e.success("Copied to clipboard")}catch{_e.error("Copy failed — select and copy manually")}}return Qe(h),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:h,tierBadge:m,toggleCreateHost:A,toggleEditHost:I,createToken:y,startEdit:v,saveEdit:b,confirmRegenerate:x,confirmDelete:w,copyToken:E}}},US=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort"]),BS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),HS=Object.freeze(["enabled","base_url","model","max_tokens"]),zS=Object.freeze(["enabled","base_url","model","max_tokens"]);function Ul(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function jS(e,t={}){const s=Ul(e,zS);return t.includeApiKey&&(s.api_key=e.api_key),s}function VS(e){return Ul(e,["timeout","preset","model_profiles","context_utilization"])}function $p(e){return Ul(e,US)}function Up(e){return Ul(e,BS)}function qS(e,{includeApiKey:t=!1}={}){const s=Ul(e,HS);return t&&(s.api_key=e.api_key),s}function GS(e){return{timeout:e.timeout}}function no(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const WS={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">LLM Configuration</h1>
          <p class="page-lede">Provider routing, model selection, credentials, and Codex accounts.</p>
          <p v-if="llmStatus && llmStatus.serving_provider === 'codex'" class="text-xs text-green-400 mt-1">Serving through Codex</p>
          <p v-else-if="llmStatus && llmStatus.serving_provider === 'compat'" class="text-xs text-green-400 mt-1">Serving through OpenAI-compatible</p>
          <p v-else-if="llmStatus && llmStatus.serving_provider === 'ollama'" class="text-xs text-green-400 mt-1">Serving through Ollama</p>
          <p v-else-if="llmStatus" class="text-xs text-amber-400 mt-1">Selected model is unavailable</p>
        </div>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>

      <div v-if="loading && !llmStatus" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>

      <div v-else class="space-y-6">

        <!-- ==================== Shared model selection ==================== -->
        <div class="hm-card">
          <h2 class="text-sm font-semibold text-gray-300">Model Selection</h2>
          <p class="text-xs text-gray-500 mt-1 mb-3">Choose models, not a provider. Disabled or unreachable catalogue entries remain visible.</p>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-gray-400 block">Main model
                <select v-model="modelSelection.main" @change="saveMainModel" class="hm-input">
                  <optgroup v-for="group in modelGroups" :key="group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!model.available">
                      {{ modelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <label v-if="selectedMainModel?.capability === 'reasoning'" class="text-xs text-gray-400 block mt-2">Reasoning
                <select :value="modelSelection.main_capability" @change="saveMainCapability($event.target.value)" class="hm-input">
                  <option v-for="effort in selectedMainModel.efforts || reasoningEfforts" :key="effort" :value="effort">{{ effort }}</option>
                </select>
              </label>
              <label v-else-if="selectedMainModel?.capability === 'thinking'" class="text-xs text-gray-400 block mt-2">Thinking
                <select :value="modelSelection.main_capability || 'adaptive'" @change="saveMainCapability($event.target.value)" class="hm-input">
                  <option value="adaptive">Adaptive</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Agent model
                <select v-model="agentsConfig.model" @change="saveAgentsModel" class="hm-input">
                  <option value="">Inherit main model</option>
                  <option value="auto">Auto — choose per spawn</option>
                  <optgroup v-for="group in modelGroups" :key="'agent:' + group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!agentModelAvailable(model)">
                      {{ agentModelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <label v-if="selectedAgentModel?.capability === 'reasoning'" class="text-xs text-gray-400 block mt-2">Reasoning
                <select :value="modelSelection.agent_capability" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option v-for="effort in selectedAgentModel.efforts || reasoningEfforts" :key="effort" :value="effort">{{ effort }}</option>
                </select>
              </label>
              <label v-else-if="selectedAgentModel?.capability === 'thinking'" class="text-xs text-gray-400 block mt-2">Thinking
                <select :value="modelSelection.agent_capability || 'adaptive'" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option value="adaptive">Adaptive</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <div v-if="agentsConfig.model === 'auto'" class="mt-3">
                <span class="block text-xs text-gray-400">Auto allowlist</span>
                <p class="text-xs text-gray-500 mt-1">Top to bottom is the agent preference order.</p>
                <div v-for="group in autoAllowlistGroups" :key="group.id" class="mt-2">
                  <strong class="text-xs text-gray-500">{{ group.label }}</strong>
                  <div class="space-y-2 mt-1">
                    <div v-for="model in group.models" :key="'allow:' + model.ref" class="text-xs text-gray-400">
                      <label class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          :disabled="!agentModelAvailable(model) && !agentsConfig.auto_model_allowlist.includes(model.ref)"
                          :checked="agentsConfig.auto_model_allowlist.includes(model.ref)"
                          @change="toggleAgentAutoAllowlist(model.ref, $event)"
                          class="provider-control"
                        />
                        <span :class="!agentModelAvailable(model) && 'text-gray-600'">{{ agentModelOptionLabel(model) }}</span>
                      </label>
                      <div v-if="agentsConfig.auto_model_allowlist.includes(model.ref)" class="ml-5 mt-1 space-y-1">
                        <p v-if="model.hint_metadata?.hint || model.hint_metadata?.hint_derived" class="text-gray-500">
                          Shipped hint: {{ model.hint_metadata.hint || model.hint_metadata.hint_derived }}
                          <span v-if="model.hint_metadata.as_of">as of {{ model.hint_metadata.as_of }}</span>
                        </p>
                        <p v-if="model.hint_metadata?.scope_note" class="text-amber-400">{{ model.hint_metadata.scope_note }}</p>
                        <p v-if="model.hint_metadata?.evidence" class="text-gray-600">Evidence: {{ model.hint_metadata.evidence }}</p>
                        <p v-if="structuralFacts(model)" class="text-gray-600">Facts: {{ structuralFacts(model) }}</p>
                        <p v-if="!model.hint_metadata || Object.keys(model.hint_metadata).length === 0" class="text-amber-400">Unknown model. Add an operator hint.</p>
                        <input
                          :value="agentsConfig.model_selection_hints?.[model.ref] || ''"
                          @change="saveModelHint(model.ref, $event.target.value)"
                          class="hm-input"
                          :placeholder="'Operator hint for ' + model.ref"
                        />
                        <div class="flex gap-1">
                          <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(model.ref, -1)" @click="moveAgentAutoAllowlist(model.ref, -1)">Move up</button>
                          <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(model.ref, 1)" @click="moveAgentAutoAllowlist(model.ref, 1)">Move down</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Auxiliary model
                <select :value="auxForm.enabled ? auxForm.model : ''" @change="onAuxModelChange" class="hm-input">
                  <option value="">Off — use main model</option>
                  <optgroup v-for="group in modelGroups" :key="'aux:' + group.id" :label="group.label">
                    <option v-for="model in group.models" :key="model.ref" :value="model.ref" :disabled="!model.available">
                      {{ modelOptionLabel(model) }}
                    </option>
                  </optgroup>
                </select>
              </label>
              <p class="text-xs text-gray-500 mt-1">Used for compaction, reflection, consolidation, and background follow-up. Its output feeds sessions and memory, so choose deliberately.</p>
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
          <p class="hidden text-xs text-gray-500 mt-3">
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

        <section aria-label="Additional providers" class="space-y-6">
        <div><h2 class="text-sm font-semibold text-gray-300">Additional providers</h2><p class="text-xs text-gray-500 mt-1">Connect compatible endpoints or Ollama. Their models appear above automatically.</p></div>
        <!-- ==================== OpenAI-compatible Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">OpenAI-compatible endpoint</h2>
            <div class="flex items-center gap-3">
              <div v-if="compatibleStatusLoadFailed" class="text-sm"><span class="provider-status text-amber-500">Status unavailable</span></div>
              <div v-else-if="compatibleStatus.configured" class="text-sm">
                <span v-if="compatibleStatus.health && compatibleStatus.health.healthy" class="provider-status text-green-400"><span class="status-dot online" aria-hidden="true"></span>Connected</span>
                <span v-else class="provider-status text-red-400"><span class="status-dot offline" aria-hidden="true"></span>Unreachable</span>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="compatibleForm.enabled" @change="saveCompatibleConfigDebounced" class="provider-control" />
                <span class="text-xs text-gray-400">Enabled</span>
              </label>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 block">Model catalogue
              <select v-model="compatibleForm.model" @change="saveCompatibleConfigDebounced"
                      class="hm-input">
                <option v-if="!compatibleModels.length" value="" disabled>No models available</option>
                <option v-for="m in compatibleModels" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="compatibleForm.max_tokens" type="number" @keydown.enter="saveCompatibleConfigNow"
                     class="hm-input" />
              </label>
            </div>
            <div>
              <span class="text-xs text-gray-400">API Key</span>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.openai_compatible.has_api_key && !compatibleForm.api_key" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
                <input v-model="compatibleForm.api_key" type="password" aria-label="OpenAI-compatible API key" @keydown.enter="saveCompatibleConfigNow" @input="compatibleKeyDirty = true"
                       :placeholder="llmStatus && llmStatus.openai_compatible.has_api_key ? '••••••••  (press Enter to replace)' : 'sk-...'"
                       class="hm-input flex-1" />
              </div>
            </div>
            <div><label class="text-xs text-gray-400 block">Base URL
              <input v-model="compatibleForm.base_url" placeholder="https://api.deepseek.com/v1" @keydown.enter="saveCompatibleConfigNow" class="hm-input" />
            </label></div>
            <div><label class="text-xs text-gray-400 block">Profile
              <select v-model="compatibleForm.preset" @change="applyCompatiblePreset" class="hm-input">
                <option v-for="(preset, key) in (llmStatus?.openai_compatible?.preset_catalogue || {})" :key="key" :value="key">{{ preset.label }}</option>
                <option value="kimi">Kimi compatibility</option><option value="custom">Custom</option>
              </select>
            </label></div>
          </div>
          <details class="llm-advanced compact" :open="advancedOpen.compatible" @toggle="advancedOpen.compatible = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="compatibleForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Agent context utilization</span><input v-model.number="compatibleForm.context_utilization" type="number" min="30" max="100" class="hm-input" /></label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveCompatibleAdvancedConfigNow" :disabled="savingCompatible">Save endpoint settings</button></div>
            </div>
          </details>
          <div v-if="compatibleStatus?.health && compatibleStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ compatibleStatus.health.error }}
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
        </section>
      </div>

    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({main:"",main_capability:"medium",agent_capability:"adaptive"}),n=["none","low","medium","high","xhigh","max"],i=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),l=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna"],o=j(()=>{const F=t.value||{},fe=F.model_catalogue||F.model_catalog||{},Ae=(Le,bs,Zt)=>bs.map(ta=>{var yn,Jn;return{ref:Le==="codex"?ta:`${Le}:${typeof ta=="string"?ta:ta.name}`,name:typeof ta=="string"?ta:ta.name,provider:Le,available:!!(Zt!=null&&Zt.enabled&&(Le==="codex"?Zt.configured:(yn=Zt.health)!=null&&yn.healthy)),unavailable_reason:Zt!=null&&Zt.enabled?Zt!=null&&Zt.configured?!((Jn=Zt==null?void 0:Zt.health)!=null&&Jn.healthy)&&Le!=="codex"?"unreachable":"":"not configured":"disabled",capability:Le==="codex"?"reasoning":Le==="compat"?"thinking":"none"}}),ut=[...fe.codex||Ae("codex",l,F.codex),...fe.compat||fe.openai_compatible||Ae("compat",H.value,F.openai_compatible),...fe.ollama||Ae("ollama",N.value,F.ollama)].map(Le=>typeof Le=="string"?{ref:Le,name:Le,provider:"codex",available:!0,capability:"reasoning"}:Le),ts=new Set(ut.map(Le=>Le.ref));for(const Le of[a.value.main,oe.value.model,...oe.value.auto_model_allowlist||[]])Le&&Le!=="auto"&&!ts.has(Le)&&ut.unshift({ref:Le,name:Le.replace(/^(compat|ollama):/,""),provider:Le.split(":")[0]||"codex",available:!1,unavailable_reason:"unavailable",capability:Le.startsWith("compat:")?"thinking":Le.startsWith("ollama:")?"none":"reasoning"});return ut}),r=j(()=>[["codex","Codex"],["compat","OpenAI-compatible"],["ollama","Ollama"]].map(([F,fe])=>({id:F,label:fe,models:o.value.filter(Ae=>Ae.provider===F)})).filter(F=>F.models.length)),c=F=>F.available&&F.agent_available!==!1,d=F=>F.available?`${F.name}${F.agent_available===!1?` (${F.agent_unavailable_reason||"not agent-eligible"})`:""}`:h(F),u=j(()=>r.value.map(F=>({...F,models:F.models.filter(fe=>oe.value.auto_model_allowlist.includes(fe.ref)||c(fe))})).filter(F=>F.models.length)),p=j(()=>o.value.find(F=>F.ref===a.value.main)),m=j(()=>o.value.find(F=>F.ref===oe.value.model)),h=F=>`${F.name}${F.available?"":` (${F.unavailable_reason||"unavailable"})`}`,g=j(()=>{const F=i.value.model;return F&&!l.includes(F)?[F,...l]:l}),A=j(()=>{const F=oe.value.model;return F&&F!=="auto"&&!l.includes(F)?[F,...l]:l}),I={"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},y=(F,fe)=>!!F&&!!fe&&(I[F]||[]).includes(fe),v=j(()=>{const F=oe.value.model;return F&&!F.includes(":")?F:null}),b=F=>!y(i.value.model,F)&&!(i.value.agent_reasoning_effort===""&&y(v.value,F)),x=F=>{const fe=oe.value.model;return fe==="auto"?!0:!y(fe||i.value.model,F)},w=j(()=>{const F=i.value.agent_reasoning_effort;return F==="auto"?null:F||i.value.reasoning_effort}),E=F=>y(F,i.value.reasoning_effort)||oe.value.model===""&&y(F,w.value),C=F=>y(F,w.value),_=f({enabled:!1,model:"gpt-5.6-luna"}),R=f({unavailable_reason:null}),U=j(()=>{const F=_.value.model;return F&&!l.includes(F)?[F,...l]:l});function S(F){const fe=F.target.value;_.value.enabled=fe!=="",fe!==""&&(_.value.model=fe),Se()}const P=f(!1),Y=f({codex:!1,ollama:!1,compatible:!1}),W=f(null),D=f(!1),O=f(""),M=f(null),ae=f(!1);let ie=0;const B=j(()=>{var F;return Object.entries(((F=W.value)==null?void 0:F.models)||{}).map(([fe,Ae])=>{var ut,ts,Le;return{model:fe,floor:Ae.floor,override:Ae.override,effectiveBudget:(ut=Ae.effective)==null?void 0:ut.effective_budget,configuredPrimaryChars:(ts=Ae.configured)==null?void 0:ts.primary_chars,primaryChars:(Le=Ae.effective)==null?void 0:Le.primary_chars,provenance:Ae.provenance,clampExpiresAt:Ae.clamp_expires_at,densityPriorMilli:Ae.density_prior_milli,densityScope:Ae.density_scope,workloadCalibration:Ae.workload_calibration}})}),Z=j(()=>{var F;return((F=W.value)==null?void 0:F.clamps)||[]}),le=j(()=>{var F,fe;return((fe=(F=W.value)==null?void 0:F.models)==null?void 0:fe[i.value.model])||null}),q=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),ce=f({enabled:!1,base_url:"https://api.deepseek.com/v1",api_key:"",model:"deepseek-v4-flash",max_tokens:4096,timeout:300,preset:"deepseek",model_profiles:{},context_utilization:75}),me=f(!1),K=f(!1),de=f(!1),he=f(!1),ge=f(!1),xe=f(!1),De=f({configured:null}),T=f(!1),N=f([]),V=f(""),pe=f(!1),$=f(!1),J=f({configured:null}),ue=f(!1),H=f([]),ee=f(""),Q=f(!1),ve=f(!1),oe=f({model:"auto",auto_model_allowlist:[]}),ye=j(()=>H.value.map(F=>typeof F=="string"?F:F.name).filter(Boolean)),Oe=()=>{var fe,Ae,ut;const F=(ut=(Ae=(fe=t.value)==null?void 0:fe.openai_compatible)==null?void 0:Ae.preset_catalogue)==null?void 0:ut[ce.value.preset];F&&(ce.value.base_url=F.base_url),ne()},Me=j(()=>N.value||[]),qe=j(()=>{const F=[...l,...ye.value.map(fe=>`compat:${fe}`),...Me.value.map(fe=>`ollama:${fe.name}`)];for(const fe of[oe.value.model,...oe.value.auto_model_allowlist||[]])fe&&fe!=="auto"&&!F.includes(fe)&&F.unshift(fe);return F}),He=F=>F==="codex-auto-review"?"codex-auto-review (Codex alias → gpt-5.6-luna)":F;async function Ge(){try{oe.value={...oe.value,...await z.get("/api/agents/model")}}catch{}}async function Je(){try{const F=await z.put("/api/agents/model",{model:oe.value.model||null});oe.value={...oe.value,...F},Ne("Agent model policy saved")}catch(F){Ne(F.message||"Failed to save agent model policy","error")}}async function lt(F,fe){const Ae=new Set(oe.value.auto_model_allowlist||[]);fe.target.checked?Ae.add(F):Ae.delete(F);try{const ut=await z.put("/api/agents/model",{auto_model_allowlist:[...Ae]});oe.value={...oe.value,...ut},Ne("Agent Auto allowlist saved")}catch(ut){Ne(ut.message||"Failed to save agent allowlist","error")}}function Ze(F){const fe=F.hint_metadata||{},Ae=[];return fe.context_tokens&&Ae.push(`context ${Number(fe.context_tokens).toLocaleString()}`),fe.max_output_tokens&&Ae.push(`max output ${Number(fe.max_output_tokens).toLocaleString()}`),fe.structural_source&&Ae.push(`source ${fe.structural_source}`),Ae.join("; ")}async function X(F,fe){const Ae={...oe.value.model_selection_hints||{}},ut=fe.trim();ut?Ae[F]=ut:delete Ae[F];try{const ts=await z.put("/api/agents/model",{model_selection_hints:Ae});oe.value={...oe.value,...ts},Ne("Model hint saved")}catch(ts){Ne(ts.message||"Failed to save model hint","error")}}function we(F,fe){const Ae=(oe.value.auto_model_allowlist||[]).indexOf(F);return Ae>=0&&Ae+fe>=0&&Ae+fe<oe.value.auto_model_allowlist.length}async function Ce(F,fe){const Ae=[...oe.value.auto_model_allowlist||[]],ut=Ae.indexOf(F);if(!(ut<0||!we(F,fe))){[Ae[ut],Ae[ut+fe]]=[Ae[ut+fe],Ae[ut]];try{const ts=await z.put("/api/agents/model",{auto_model_allowlist:Ae});oe.value={...oe.value,...ts},Ne("Agent Auto allowlist order saved")}catch(ts){Ne(ts.message||"Failed to reorder agent allowlist","error")}}}const Re=f(!0),se=f(""),Ie=f({configured:null,accounts:[]}),Pe=f(null),it=f(null),jt=f(""),st=f(null),wt=f(!1),Dt=f(null),hs=f(null),Zs=f("");let vs=null;function Ne(F,fe="success"){_e(F,fe==="error"?"error":"success")}function xa(F){if(!F)return"?";const fe=F/(1024*1024*1024);return fe>=1?fe.toFixed(1)+" GB":(F/(1024*1024)).toFixed(0)+" MB"}function Ys(F){return Number.isFinite(Number(F))?Number(F).toLocaleString():"—"}function mn(F){return F==null?"automatic (model-derived)":Number(F).toLocaleString()+" characters"}function Us(F){const fe=new Date(F);return Number.isNaN(fe.getTime())?"unknown":fe.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function hn(F){return typeof F=="string"&&F.length>12?F.slice(0,8)+"…"+F.slice(-4):F}function Qs(F){return typeof F!="number"||!Number.isFinite(F)?"—":(F/1e3).toFixed(2)}function dt(F){return F==="temporary learned clamp"?"is-clamp":F==="override"?"is-override":"is-built-in"}function Bs(F){const fe=i.value.context_budget_overrides[F.model];return F.floor!=null&&Number.isFinite(Number(fe))&&Number(fe)>F.floor}function Ja(F,fe){const Ae={...i.value.context_budget_overrides};fe.target.value===""?delete Ae[F]:Ae[F]=Number(fe.target.value),i.value.context_budget_overrides=Ae,ae.value=!0}function re(F){i.value.context_utilization=F.target.value===""?"":Number(F.target.value),ae.value=!0}function Te(F){const fe={...i.value.context_budget_overrides};delete fe[F],i.value.context_budget_overrides=fe,ae.value=!0}async function Ue(){e.value=!0,await Promise.all([ze(),ot(),Xs(),Ge(),es(),yt()]),e.value=!1}async function ze({preserveBasic:F=!1,preserveAdvanced:fe=!1}={}){var Ae,ut,ts;try{const Le=await z.get("/api/llm/status");t.value=Le,s.value=!1,a.value.main=Le.main_model||Le.active_model||(Le.active_provider==="compat"?`compat:${((Ae=Le.openai_compatible)==null?void 0:Ae.model)||""}`:Le.active_provider==="ollama"?`ollama:${((ut=Le.ollama)==null?void 0:ut.model)||""}`:((ts=Le.codex)==null?void 0:ts.model)||"gpt-5.6-sol"),Le.codex&&!ea.pending()&&(F||(i.value.enabled=Le.codex.enabled,i.value.model=Le.codex.model||"gpt-5.6-sol",i.value.reasoning_effort=Le.codex.reasoning_effort||"medium",i.value.agent_reasoning_effort=Le.codex.agent_reasoning_effort||""),fe||(i.value.request_timeout_seconds=Le.codex.request_timeout_seconds??i.value.request_timeout_seconds,i.value.stream_stall_timeout_seconds=Le.codex.stream_stall_timeout_seconds??i.value.stream_stall_timeout_seconds,i.value.retry={...i.value.retry,...Le.codex.retry||{}},i.value.connection_pool={...i.value.connection_pool,...Le.codex.connection_pool||{}},i.value.context_compression={...i.value.context_compression,...Le.codex.context_compression||{}},!ae.value&&!de.value&&(i.value.context_budget_overrides={...Le.codex.context_budget_overrides||{}},i.value.context_utilization=Le.codex.context_utilization??i.value.context_utilization))),Le.ollama&&!L.pending()&&(F||(q.value.enabled=Le.ollama.enabled,q.value.base_url=Le.ollama.base_url||"",q.value.model=Le.ollama.model||"",q.value.max_tokens=Le.ollama.max_tokens||4096),fe||(q.value.timeout=Le.ollama.timeout??q.value.timeout));const bs=Le.openai_compatible;bs&&!ne.pending()&&(F||(ce.value.enabled=bs.enabled,ce.value.base_url=bs.base_url||ce.value.base_url,ce.value.model=bs.model||ce.value.model,ce.value.max_tokens=bs.max_tokens||4096,ce.value.preset=bs.preset||ce.value.preset),fe||(ce.value.timeout=bs.timeout??ce.value.timeout,ce.value.model_profiles=bs.model_profiles||ce.value.model_profiles,ce.value.context_utilization=bs.context_utilization??ce.value.context_utilization)),Le.auxiliary&&(R.value=Le.auxiliary,Se.pending()||(_.value.enabled=Le.auxiliary.enabled,_.value.model=Le.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},openai_compatible:{configured:null}}),s.value=!0}}async function yt(){const F=++ie;D.value=!0,O.value="";try{const fe=await z.get("/api/context/windows");if(F!==ie)return;W.value=fe,!de.value&&!ae.value&&(i.value.context_budget_overrides=Object.fromEntries(Object.entries(fe.models||{}).filter(([,Ae])=>Ae.override!=null).map(([Ae,ut])=>[Ae,ut.override])),i.value.context_utilization=fe.utilization??i.value.context_utilization)}catch(fe){F===ie&&(O.value=fe.message||"Failed to load context budgets")}finally{F===ie&&(D.value=!1)}}async function ot(){try{if(De.value=await z.get("/api/ollama/status"),T.value=!1,De.value.model&&(V.value=De.value.model),De.value.configured)try{const F=await z.get("/api/ollama/models");N.value=F.models||[]}catch{N.value=[]}else if(q.value.base_url)try{const F=await z.post("/api/ollama/probe-models",{base_url:q.value.base_url});N.value=F.models||[]}catch{N.value=[]}}catch{T.value=!0}}async function es(){Re.value=!0,se.value="";try{Ie.value=await z.get("/api/codex/status")}catch(F){se.value=F.message||"Failed to fetch Codex status"}finally{Re.value=!1}}async function Hs(){try{try{await z.put("/api/llm/main-model",{model:a.value.main})}catch(F){if(!/404|not found/i.test(F.message||""))throw F;await z.post("/api/llm/switch",{model:a.value.main})}Ne("Main model saved"),await Ue()}catch(F){Ne(F.message||"Failed to save main model","error"),await ze()}}async function Mi(F){a.value.main_capability=F;const fe=p.value;fe&&(fe.capability==="reasoning"?(i.value.reasoning_effort=F,await Jt()):fe.capability==="thinking"&&(await z.put("/api/openai-compatible/config",{thinking_mode:F}),Ne("Thinking mode saved")))}async function qn(F){a.value.agent_capability=F;const fe=m.value;(fe==null?void 0:fe.capability)==="reasoning"?(i.value.agent_reasoning_effort=F,await Jt()):(fe==null?void 0:fe.capability)==="thinking"&&(await z.put("/api/agents/model",{...oe.value,thinking_mode:F}),Ne("Agent thinking mode saved"))}async function vn(){pe.value=!0;try{const F=await z.post("/api/ollama/reload");Ne(F.configured?"Ollama reloaded":F.reason||"Ollama not configured",F.configured?"success":"error"),await Ue()}catch(F){Ne(F.message||"Reload failed","error")}finally{pe.value=!1}}async function Gn(){$.value=!0;try{await z.post("/api/ollama/model",{model:V.value}),Ne("Model set to "+V.value),await Ue()}catch(F){Ne(F.message||"Failed","error")}finally{$.value=!1}}async function _a(){const F=q.value.base_url;if(!F){Ne("Enter a base URL first","error");return}xe.value=!0;try{const fe=await z.post("/api/ollama/probe-models",{base_url:F});N.value=fe.models||[],N.value.length?(Ne(N.value.length+" model(s) found"),!q.value.model&&N.value.length&&(q.value.model=N.value[0].name)):Ne("No models found at "+F,"error")}catch(fe){Ne(fe.message||"Could not reach Ollama","error")}finally{xe.value=!1}}async function Xs(){try{if(J.value=await z.get("/api/openai-compatible/status"),ue.value=!1,J.value.model&&(ee.value=J.value.model),J.value.configured)try{const F=await z.get("/api/openai-compatible/models");H.value=F.models||[]}catch{H.value=[]}}catch{ue.value=!0}}async function Kt(){Q.value=!0;try{const F=await z.post("/api/openai-compatible/reload");Ne(F.configured?"OpenAI-compatible reloaded":F.reason||"OpenAI-compatible not configured",F.configured?"success":"error"),await Ue()}catch(F){Ne(F.message||"Reload failed","error")}finally{Q.value=!1}}async function wa(){ve.value=!0;try{await z.post("/api/openai-compatible/model",{model:ee.value}),Ne("Model set to "+ee.value),await Ue()}catch(F){Ne(F.message||"Failed","error")}finally{ve.value=!1}}async function Jt(){if(de.value){ea();return}de.value=!0;const F=$p(i.value);try{await z.put("/api/llm/codex/config",F),Ne("Codex config saved"),await Promise.all([ze({preserveBasic:!0,preserveAdvanced:!0}),es()])}catch(fe){Ne(fe.message||"Failed","error");const Ae=JSON.stringify($p(i.value))!==JSON.stringify(F);await Promise.all([ze({preserveBasic:Ae,preserveAdvanced:!0}),es()])}finally{de.value=!1}}async function gn(){if(de.value)return;de.value=!0;const F=Up(i.value);try{await z.put("/api/llm/codex/config",F),JSON.stringify({context_budget_overrides:i.value.context_budget_overrides,context_utilization:i.value.context_utilization})===JSON.stringify({context_budget_overrides:F.context_budget_overrides,context_utilization:F.context_utilization})&&(ae.value=!1),Ne("Codex advanced settings saved"),await Promise.all([ze({preserveBasic:!0,preserveAdvanced:!0}),es(),yt()])}catch(fe){Ne(fe.message||"Failed","error");const Ae=JSON.stringify(Up(i.value))!==JSON.stringify(F);await Promise.all([ze({preserveBasic:!0,preserveAdvanced:Ae}),es(),yt()])}finally{de.value=!1}}async function Za(){if(he.value){L();return}he.value=!0;try{const F=me.value?q.value.api_key:null,fe=qS(q.value,{includeApiKey:F!==null});await z.put("/api/llm/ollama/config",fe),Ne("Ollama config saved"),F!==null&&q.value.api_key===F&&(q.value.api_key="",me.value=!1),await Promise.all([ze({preserveBasic:!0,preserveAdvanced:!0}),ot()])}catch(F){Ne(F.message||"Failed","error")}finally{he.value=!1}}async function Wn(){if(!he.value){he.value=!0;try{await z.put("/api/llm/ollama/config",GS(q.value)),Ne("Ollama timeout saved"),await Promise.all([ze({preserveBasic:!0,preserveAdvanced:!0}),ot()])}catch(F){Ne(F.message||"Failed","error")}finally{he.value=!1}}}async function Ya(){if(ge.value){ne();return}ge.value=!0;try{const F=K.value?ce.value.api_key:null,fe=jS(ce.value,{includeApiKey:F!==null});await z.put("/api/openai-compatible/config",fe),Ne("OpenAI-compatible config saved"),F!==null&&ce.value.api_key===F&&(ce.value.api_key="",K.value=!1),await Promise.all([ze({preserveBasic:!0,preserveAdvanced:!0}),Xs()])}catch(F){Ne(F.message||"Failed","error")}finally{ge.value=!1}}async function bn(){if(!ge.value){ge.value=!0;try{await z.put("/api/openai-compatible/config",VS(ce.value)),Ne("OpenAI-compatible endpoint settings saved"),await Promise.all([ze({preserveBasic:!0,preserveAdvanced:!0}),Xs()])}catch(F){Ne(F.message||"Failed","error")}finally{ge.value=!1}}}async function Qa(){if(P.value){Se();return}P.value=!0;try{await z.put("/api/llm/auxiliary/config",_.value),Ne("Auxiliary config saved"),await ze()}catch(F){Ne(F.message||"Failed","error"),await ze()}finally{P.value=!1}}const ea=no(Jt),Se=no(Qa),L=no(Za),ne=no(Ya),be=()=>(ea.cancel(),Jt()),Fe=()=>(L.cancel(),Za()),Be=()=>(ne.cancel(),Ya()),Ve=()=>gn(),At=()=>Wn(),mt=()=>bn();async function kt(F){const fe=F.account_key+":"+F.model;M.value=fe;try{const Ae=await z.post("/api/context/windows/clear",{account_key:F.account_key,model:F.model});Ne(Ae.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await yt()}catch(Ae){Ne(Ae.message||"Failed to clear clamp","error"),await yt()}finally{M.value=null}}async function gs(F){try{await z.post("/api/codex/account/"+F+"/activate"),Ne("Active account switched"),await es()}catch(fe){Ne(fe.message||"Failed","error")}}async function Rt(F){Pe.value=F;try{await z.post("/api/codex/account/"+F+"/refresh"),Ne("Token refreshed"),await es()}catch(fe){Ne(fe.message||"Refresh failed","error")}finally{Pe.value=null}}function ka(F,fe){it.value=F,jt.value=fe||""}async function Kn(F){try{await z.put("/api/codex/account/"+F+"/label",{label:jt.value}),Ne("Label updated"),it.value=null,await es()}catch(fe){Ne(fe.message||"Failed","error")}}async function Sr(F,fe){if(await Xt({title:"Delete Codex account",message:`Delete ${fe||"account #"+(F+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await z.del("/api/codex/account/"+F),Ne("Deleted. Pool reloaded."),await es()}catch(ut){Ne(ut.message||"Failed","error")}}async function Sa(){wt.value=!0;try{const F=await z.post("/api/codex/device-code");Dt.value=F,st.value="pending",Tr(F)}catch(F){Ne(F.message||"Failed","error")}finally{wt.value=!1}}async function Tr(F){vs={cancelled:!1};const fe=vs;try{const Ae=await z.post("/api/codex/device-poll",{device_auth_id:F.device_auth_id,user_code:F.user_code,interval:F.interval});if(fe.cancelled)return;hs.value=Ae,st.value="success",await Ue()}catch(Ae){if(fe.cancelled)return;Zs.value=Ae.message||"Device login failed",st.value="error"}}function Cr(){vs&&(vs.cancelled=!0),st.value=null,Dt.value=null}return Qe(Ue),gt(()=>{vs&&(vs.cancelled=!0),ea.cancel(),Se.cancel(),L.cancel(),ne.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,modelSelection:a,reasoningEfforts:n,modelCatalog:o,modelGroups:r,selectedMainModel:p,selectedAgentModel:m,modelOptionLabel:h,agentModelAvailable:c,agentModelOptionLabel:d,advancedOpen:Y,codexForm:i,codexModelOptions:g,codexAgentModelOptions:A,mainEffortAllowed:b,agentEffortAllowed:x,mainModelOptionDisabled:E,agentModelOptionDisabled:C,auxForm:_,auxData:R,auxModelOptions:U,onAuxModelChange:S,savingAux:P,saveAuxConfigDebounced:Se,ollamaForm:q,compatibleForm:ce,savingCodex:de,savingOllama:he,savingCompatible:ge,probingOllama:xe,ollamaKeyDirty:me,compatibleKeyDirty:K,fetchCodexStatus:es,ollamaStatus:De,ollamaStatusLoadFailed:T,ollamaModels:N,ollamaSelectedModel:V,reloading:pe,settingModel:$,compatibleStatus:J,compatibleStatusLoadFailed:ue,compatibleModels:H,compatibleSelectedModel:ee,reloadingCompatible:Q,settingCompatibleModel:ve,applyCompatiblePreset:Oe,agentsConfig:oe,compatibleAgentModels:ye,ollamaAgentModels:Me,knownAgentModelRefs:qe,agentModelLabel:He,saveAgentsModel:Je,toggleAgentAutoAllowlist:lt,autoAllowlistGroups:u,structuralFacts:Ze,saveModelHint:X,canMoveAllowlist:we,moveAgentAutoAllowlist:Ce,codexLoading:Re,codexError:se,codexData:Ie,refreshing:Pe,editingLabel:it,labelValue:jt,contextWindows:W,contextWindowsLoading:D,contextWindowsError:O,contextBudgetRows:B,activeClampRows:Z,activeContextBudget:le,clearingClamp:M,contextPolicyDirty:ae,deviceState:st,deviceLoading:wt,deviceInfo:Dt,deviceResult:hs,deviceError:Zs,fetchAll:Ue,fetchLLMStatus:ze,fetchOllamaStatus:ot,fetchCompatibleStatus:Xs,saveMainModel:Hs,saveMainCapability:Mi,saveAgentCapability:qn,reloadOllama:vn,setOllamaModel:Gn,reloadCompatible:Kt,setCompatibleModel:wa,probeOllamaModels:_a,saveCodexConfig:Jt,saveOllamaConfig:Za,saveCompatibleConfig:Ya,saveCodexAdvancedConfig:gn,saveOllamaAdvancedConfig:Wn,saveCompatibleAdvancedConfig:bn,saveCodexConfigDebounced:ea,saveOllamaConfigDebounced:L,saveCompatibleConfigDebounced:ne,saveCodexConfigNow:be,saveOllamaConfigNow:Fe,saveCompatibleConfigNow:Be,saveCodexAdvancedConfigNow:Ve,saveOllamaAdvancedConfigNow:At,saveCompatibleAdvancedConfigNow:mt,activateAccount:gs,refreshAccount:Rt,startEditLabel:ka,saveLabel:Kn,deleteAccount:Sr,startDeviceLogin:Sa,cancelDeviceLogin:Cr,formatSize:xa,fetchContextWindows:yt,clearContextClamp:kt,setContextOverride:Ja,setContextUtilization:re,resetContextOverride:Te,overrideAboveFloor:Bs,formatCount:Ys,formatContextCeiling:mn,formatExpiry:Us,shortAccountKey:hn,provenanceClass:dt,formatDensity:Qs}}},Bp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function KS(e){return Bp[e]||Bp[(e||"").toLowerCase()]||"text-gray-400"}const JS={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=j(()=>{var w;return Object.values(((w=i.value)==null?void 0:w.totals)||{}).reduce((E,C)=>E+Number(C||0),0)}),u=f(""),p=f(0),m=f([]),h=j(()=>m.value.map(w=>`${w.label} (${w.path}${w.reason?`: ${w.reason}`:""})`).join("; ")),g=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let A=null;async function I(){var R;const w=await Promise.allSettled(g.map(U=>z.get(U.path))),E=U=>w[U].status==="fulfilled"?w[U].value:null;t.value=E(0)||{};const C=E(1);s.value=Array.isArray(C)?C:C&&C.subsystems||[],a.value=E(2)||{},n.value=E(3)||{},i.value=E(4),l.value=E(5),o.value=E(6),r.value=E(7),c.value=E(8);const _=w.filter(U=>U.status==="rejected");if(m.value=w.flatMap((U,S)=>{var P;return U.status==="rejected"?[{...g[S],reason:((P=U.reason)==null?void 0:P.message)||"request failed"}]:[]}),p.value=m.value.length,_.length===w.length){const U=(R=_[0])==null?void 0:R.reason;u.value=(U==null?void 0:U.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",I()}let v=!1;function b(){v||(v=!0,I(),A||(A=setInterval(I,3e4)))}function x(){v&&(v=!1,A&&(clearInterval(A),A=null))}return Qe(b),os(b),Wt(x),gt(x),{loading:e,error:u,failedCount:p,failedEndpoints:m,failedEndpointSummary:h,endpoints:g,retry:y,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:KS,formatAgeSeconds:fk}}},ZS=1e4,Hp=3e4;function ji(e,t){return Math.max(0,e-t)}function Zr(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const YS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],QS={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,m=0;async function h(){const O=++p;a.value=!0;try{const M=await z.get("/api/turn-state/turns?limit=100");if(O!==p)return;t.value=M.availability,e.value=M.availability==="available"?M.data:null,s.value=null,n.value=Date.now()}catch(M){if(O!==p)return;s.value=M.message||"Turn-state read failed",M.status===503&&(t.value="unavailable")}O===p&&(a.value=!1)}async function g(){const O=++m;r.value=!0;try{const M=await z.get("/api/turn-state/capacity-breakers");if(O!==m)return;l.value=M.availability,i.value=M.availability==="available"?M.data:null,o.value=null,c.value=Date.now()}catch(M){if(O!==m)return;o.value=M.message||"Breaker read failed",M.status===503&&(l.value="unavailable")}O===m&&(r.value=!1)}function A(){h(),g()}const I=j(()=>e.value!==null&&ji(d.value,n.value)>Hp),y=j(()=>i.value!==null&&ji(d.value,c.value)>Hp),v=j(()=>I.value||y.value),b=j(()=>Math.round(ji(d.value,n.value)/1e3)),x=j(()=>Math.round(ji(d.value,c.value)/1e3));function w(O){return Zr(O,d.value/1e3)}function E(O){return YS[w(O)]}const C=j(()=>{var ae;const O=[...((ae=e.value)==null?void 0:ae.turns)||[]],M=d.value/1e3;return O.sort((ie,B)=>Zr(ie,M)-Zr(B,M)||(B.last_progress_at||0)-(ie.last_progress_at||0))});function _(O){return O.state==="closed"?"badge-success":O.state==="probing"?"badge-warning":"badge-danger"}function R(O){if(O.state==="closed")return"—";const M=ji(d.value,c.value)/1e3,ae=Math.max(0,(O.cooldown_remaining_seconds||0)-M);return ae>0?`${Math.ceil(ae)}s`:O.state==="probing"?"probe in flight":"probe eligible"}function U(O){if(!O)return"";const M=Math.max(0,Math.round(d.value/1e3-O));if(M<90)return`${M}s ago`;const ae=Math.round(M/60);return ae<90?`${ae}m ago`:`${Math.round(ae/60)}h ago`}let S=null,P=null,Y=!1;function W(){Y||(Y=!0,A(),S=setInterval(A,ZS),u=setInterval(()=>{d.value=Date.now()},1e3),P=nt.onReconnected(A))}function D(){Y&&(Y=!1,S&&(clearInterval(S),S=null),u&&(clearInterval(u),u=null),P&&(P(),P=null))}return Qe(W),os(W),Wt(D),gt(D),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:I,breakersStale:y,anyStale:v,turnsAgeSeconds:b,breakersAgeSeconds:x,sortedTurns:C,priorityOf:w,priorityBadge:E,breakerBadge:_,cooldownLabel:R,ageLabel:U,fetchTurns:h,fetchBreakers:g,refreshAll:A,arm:W,disarm:D}}},XS={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await z.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await Xt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await z.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Qe(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},zp=e=>JSON.parse(JSON.stringify(e)),e1=(e,t)=>JSON.stringify(e)===JSON.stringify(t),t1={emits:["saved"],template:`
    <section class="hm-card computer-provisioning" aria-labelledby="computer-provisioning-title">
      <div class="section-card-header">
        <div>
          <h2 id="computer-provisioning-title" class="text-sm font-semibold text-gray-300">Computer provisioning</h2>
          <p class="page-lede">Edit desired target, storage and launcher policy. All settings below require an Odin restart. Startup values remain pinned, even across disable/enable cycles.</p>
        </div>
        <span class="badge badge-warning">Restart required</span>
      </div>
      <p class="page-lede mb-3">Saving does not install dependencies, create storage, grant OS permissions, attach to a desktop or restart Odin. Enable/disable and Stop session are separate lifecycle controls above.</p>
      <p v-if="draft.platform === 'wayland' && draft.wayland_backend === 'hyprland'" class="text-sm text-amber-300 mb-3" role="note"><strong>Hyprland only: best-effort input.</strong> A hard guardian SIGKILL can leave input held. Releasing Odin's button can clobber the physical user's simultaneous same-button hold. Use Release owned input for recovery, then obtain a fresh observation. Native explicit-output capture only; there is no portal fallback. The operator must load the ABI-matched scope plugin once at setup. Saving or enabling never loads it or edits hyprland.conf.</p>
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,m=0,h=null;const g=(D,O)=>p&&m===D&&z.token===O,A=D=>"computer-provisioning-"+D.key,I=D=>D===null?"Unset":D===""?"Empty":JSON.stringify(D),y=D=>{const O=n.value[D.key];return D.type==="array"?String(O||"").split(/\r?\n/).map(M=>M.trim()).filter(Boolean):["integer","number"].includes(D.type)?O===""||O==null?null:Number(O):O},v=j(()=>s.value.map(D=>({...D,value:y(D)})).filter(D=>!e1(D.value,a.value[D.key]))),b=j(()=>s.value.filter(D=>D.pending_restart).map(D=>D.label)),x=j(()=>s.value.some(D=>D.apply_state==="unknown")),w=j(()=>{const D={};for(const O of s.value){const M=y(O),ae=O.constraints||{};["integer","number"].includes(O.type)&&(M===null&&!O.nullable?D[O.key]="A number is required.":M!==null&&(!Number.isFinite(M)||O.type==="integer"&&!Number.isInteger(M)||ae.minimum!=null&&M<ae.minimum||ae.maximum!=null&&M>ae.maximum)&&(D[O.key]="Enter a number within the allowed range.")),O.key==="monitor_names"&&(M.length>16||new Set(M).size!==M.length||M.some(ie=>!/^[A-Za-z0-9_.-]{1,64}$/.test(ie)))&&(D[O.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return D}),E=j(()=>Object.keys(w.value).length>0);function C(D,O){n.value[D.key]=O,u.value=""}function _(){n.value=Object.fromEntries(s.value.map(D=>[D.key,D.type==="array"?a.value[D.key].join(`
`):a.value[D.key]])),r.value=!1}async function R(D,O){const[M,ae]=await Promise.all([z.get("/api/config"),z.get("/api/config/meta")]);if(!g(D,O))return!1;const ie=(ae.fields||[]).filter(B=>/^computer\.[^.]+$/.test(B.path)&&B.path!=="computer.enabled"&&B.sensitivity==="public"&&B.apply_mode==="restart");if(!M.computer||!ie.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=ie.map(B=>({...B,key:B.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(B=>[B.key,zp(M.computer[B.key])])),_(),h=O,i.value=!0,c.value=!1,!0}async function U(){if(!p||l.value||o.value)return;const D=++m,O=z.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await R(D,O)}catch(M){g(D,O)&&(c.value=!0,d.value=M.message||"Could not load provisioning. No changes were sent.")}finally{g(D,O)&&(l.value=!1)}}function S(){i.value&&!l.value&&!o.value&&!c.value&&v.value.length&&!E.value&&(r.value=!0)}async function P(){if(!p||!i.value||!r.value||o.value||l.value||c.value||E.value||!v.value.length)return;if(h!==z.token){W(),Y();return}const D={computer:Object.fromEntries(v.value.map(ie=>[ie.key,zp(ie.value)]))},O=m,M=z.token;o.value=!0,d.value="",u.value="";let ae=!1;try{if(await z.put("/api/config",D),ae=!0,!g(O,M))return;await R(O,M)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(ie){g(O,M)&&(c.value=!0,r.value=!1,d.value=ae?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${ie.status===400?": "+ie.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{g(O,M)&&(o.value=!1)}}function Y(){p||(p=!0,U())}function W(){p=!1,m++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,h=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return Qe(Y),os(Y),Wt(W),gt(W),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:x,changes:v,validation:w,invalid:E,fieldId:A,format:I,edit:C,discard:_,load:U,openReview:S,save:P}}},s1={components:{ComputerProvisioning:t1},template:`
    <div class="p-6 page-fade-in computer-page" role="region" aria-labelledby="computer-title">
      <header class="page-header mb-4">
        <div class="page-header-copy">
          <h1 id="computer-title" class="text-xl font-semibold">Computer operator</h1>
          <p class="page-lede">Private session inspection. This page never presses keys or buttons; emergency recovery may explicitly release held input.</p>
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
        <p v-if="remedy" class="text-amber-300">Operator action: {{ remedy }}</p>
      </div>
      <div class="hm-card computer-status-card mb-4" role="status" aria-live="polite">
        <div>
          <div class="section-eyebrow">{{ adminReady ? 'Current session' : 'Last-known session (not current)' }}</div>
          <div class="computer-state">{{ status.state || 'unknown' }}</div>
        </div>
        <span class="badge badge-info">{{ loading ? 'Checking status' : adminReady ? 'Session status' : 'Status not current' }}</span>
      </div>
      <p v-if="!adminReady" class="page-lede mb-4" role="status">{{ checkedAt ? 'Last successful status check: ' + new Date(checkedAt).toISOString() + '. ' : 'No successful status check. ' }}Preserved details are read-only history, not current readiness, consent or session authority. Refresh status independently before further operations. Emergency Pause / Stop only request revocation and remain independently authenticated by the server.</p>
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
      <section v-if="status.backend?.native_backend === 'hyprland'" class="hm-card" aria-labelledby="hyprland-input-title">
        <h2 id="hyprland-input-title" class="text-sm font-semibold text-amber-300">Hyprland native input: best-effort</h2>
        <p class="page-lede">A hard guardian SIGKILL can leave owned input held. Releasing Odin's button may clobber the physical user's simultaneous same-button hold. Cooperative release acknowledgments are not receiver-side proof. These accepted residuals apply only to Hyprland.</p>
        <p class="page-lede">Native capture is limited to the explicitly consented output. There is no portal fallback. Recovery revokes input and capture, leaves the session paused, and requires renewed consent and a fresh observation.</p>
        <button class="btn btn-danger btn-touch mt-3" @click="releaseOwnedInput" :disabled="!adminReady || recovering || !status.session_id">{{ recovering ? 'Requesting owned release…' : 'Release owned input' }}</button>
        <p v-if="status.owned_input_recovery" class="page-lede" role="status">{{ status.owned_input_recovery.released ? 'Cooperative release acknowledged; receiver-side release is not verified.' : 'Release not confirmed. Inspect the desktop and use documented operator recovery; do not resume input.' }}</p>
      </section>
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
        <p class="page-lede">Eligibility evidence does not replace current backend consent, source mapping or application checks. Opening this page runs no input probe.</p>
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
      <div v-if="status.state === 'paused'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">{{ adminReady ? 'Agent input is revoked.' : 'Last-known session was paused; this is not current evidence of revocation.' }} This inspector does not provide remote mouse or keyboard control. Resume requires a renewed generation and fresh evidence.</div>
      <div v-if="adminReady && status.state === 'unknown'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Outcome is unknown. Refresh status; do not replay the last action.</div>
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
            <button class="btn btn-primary btn-touch" @click="observe" :disabled="observing || !adminReady || !status.available"><odin-icon name="eye" :size="15" /> {{ observing ? 'Observing…' : 'Observe / view frame' }}</button>
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
            <button class="btn btn-primary btn-touch" type="submit" :disabled="exporting || !adminReady || !status.available">{{ exporting ? 'Preparing…' : 'Prepare export' }}</button>
          </div>
        </form>
        <div v-if="artifact" class="artifact-row mt-4">
          <button class="btn btn-ghost btn-touch" @click="download" :disabled="downloading || !adminReady"><odin-icon name="download" :size="15" /> Download {{ artifact.name }}</button>
          <span class="text-xs text-gray-500">Expires {{ artifact.expires_at }}</span>
        </div>
      </section>
      </div>
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),m=f(""),h=f(null),g=f(""),A=f(!1),I=f(Date.now()),y=f(""),v=f(null);let b=0,x=null,w=!1,E=z.token,C=0,_=null,R=null,U=!1;const S=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",P=j(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),Y=j(()=>{var ee;const H=Date.parse(((ee=e.value.accessibility)==null?void 0:ee.checked_at)||"");return c.value&&Number.isFinite(H)&&I.value-H<15e3&&I.value>=H-5e3}),W=j(()=>{var H;return Y.value?S((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),D=j(()=>{var H;return Y.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),O=j(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,ee])=>`${H}: ${ee}`).join(", ")),M=j(()=>{var ee;const H=(ee=e.value.application_provenance)==null?void 0:ee.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),ae=j(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),ie=j(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),B=j(()=>{var ee,Q;const H=Date.parse(((ee=h.value)==null?void 0:ee.captured_at)||"");return Number.isFinite(H)&&I.value<H+Math.min(1e4,((Q=h.value)==null?void 0:Q.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function Z(){g.value&&URL.revokeObjectURL(g.value),g.value="",h.value=null}function le(){b++,Z(),v.value=null,c.value=!1,_==null||_.abort(),_=null,t.value=!1,m.value="",s.value=!1,i.value=!1,l.value=!1}function q(H,ee){return w&&H===b&&ee===z.token}function ce(){return w&&c.value&&R===z.token&&Date.now()-u.value<15e3}function me(H,ee="mutation"){var ve,oe;le(),U=!0,p.value="";const Q=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(Q)?(u.value=0,R=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:Q===503?"unavailable":"unknown"}),o.value=Q===401||Q===403||Q===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":Q===410?"Evidence or artifact expired. Observe or prepare the export again.":ee==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":ee==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",ee==="mutation"&&![401,403,404].includes(Q)&&typeof((ve=H.data)==null?void 0:ve.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((oe=H.data)==null?void 0:oe.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function K(){if(t.value||r.value||a.value||n.value||d.value||!w)return;const H=b,ee=z.token;t.value=!0,C=Date.now();const Q=new AbortController;_=Q;try{const ve=await z.get("/api/computer",{signal:Q.signal});if(!q(H,ee))return;de(ve)}catch(ve){q(H,ee)&&me(ve,"read")}finally{_===Q&&(_=null,t.value=!1)}}function de(H,ee=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&le(),e.value=H,u.value=Date.now(),R=z.token,c.value=!(r.value&&ee!=="toggle")&&!(a.value&&ee!=="stop")&&!(n.value&&ee!=="pause")&&!(d.value&&ee!=="recovery"),o.value="",p.value="",U=!c.value}async function he(H){if(!ce()||r.value||a.value||n.value||d.value)return;le();const ee=b,Q=z.token;r.value=!0;let ve=!1;try{if(await z.post("/api/computer/enabled",{enabled:H}),ve=!0,!q(ee,Q))return;const oe=await z.get("/api/computer");q(ee,Q)&&de(oe,"toggle")}catch(oe){q(ee,Q)&&me(oe,ve?"acknowledged":"mutation")}finally{r.value=!1}}async function ge(H){if(!w||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;le();const ee=b,Q=z.token,ve=H==="stop"?a:n;ve.value=!0;let oe=!1;try{if(await z.post("/api/computer/"+H,{}),oe=!0,q(ee,Q)){const ye=await z.get("/api/computer");q(ee,Q)&&de(ye,H)}}catch(ye){q(ee,Q)&&me(ye,oe?"acknowledged":"mutation")}finally{ve.value=!1}}async function xe(){var ve;if(!ce()||d.value||((ve=e.value.backend)==null?void 0:ve.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;le();const ee=b,Q=z.token;d.value=!0;try{const oe=await z.post("/api/computer/release_owned_input",H);q(ee,Q)&&de(oe,"recovery")}catch(oe){q(ee,Q)&&me(oe,"mutation")}finally{d.value=!1}}async function De(){return N(!1)}async function T(){return N(!0)}async function N(H){var Oe;if(!ce()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const ee={session_id:e.value.session_id,generation:e.value.session_generation};if(!ee.session_id||!Number.isInteger(ee.generation))return;if(H){if(m.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+ee.session_id)return;ee.acknowledgment=m.value}const Q=H?((Oe=e.value.recovery)==null?void 0:Oe.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";le();const ve=b,oe=z.token;d.value=!0;let ye=!1;try{const Me=await z.post("/api/computer/"+Q,ee);ye=!0,q(ve,oe)&&de(Me,"recovery")}catch(Me){q(ve,oe)&&me(Me,ye?"acknowledged":"mutation")}finally{d.value=!1}}async function V(){var Q;if(!ce()||s.value||!e.value.available)return;Z(),A.value=!1;const H=b,ee=z.token;s.value=!0;try{const ve=await z.post("/api/computer/observe",{});if(!q(H,ee))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((Q=ve.frame)==null?void 0:Q.evidence_id)||""))throw new Error("Invalid evidence");const oe=await z.getBlob("/api/computer/evidence/"+ve.frame.evidence_id);if(!q(H,ee))return;if(!["image/png","image/jpeg"].includes(oe.type)||oe.size>2097152||!Number.isFinite(Date.parse(ve.frame.expires_at))||Date.parse(ve.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");h.value=ve.frame,g.value=URL.createObjectURL(oe),o.value=""}catch(ve){q(H,ee)&&me(ve)}finally{H===b&&(s.value=!1)}}async function pe(){if(!ce()||i.value||!e.value.available)return;v.value=null;const H=b,ee=z.token;i.value=!0;try{const Q=await z.post("/api/computer/export",{name:y.value});q(H,ee)&&(v.value=Q,o.value="")}catch(Q){q(H,ee)&&me(Q)}finally{H===b&&(i.value=!1)}}async function $(){if(!ce()||l.value||!v.value)return;const H=b,ee=z.token,Q=v.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((Q==null?void 0:Q.artifact_id)||""))throw new Error("Invalid export");const ve=await z.getBlob("/api/computer/download/"+Q.artifact_id);if(!q(H,ee))return;const oe=URL.createObjectURL(ve),ye=document.createElement("a");ye.href=oe,ye.download=Q.name,ye.click(),setTimeout(()=>URL.revokeObjectURL(oe),1e3)}catch(ve){q(H,ee)&&me(ve)}finally{H===b&&(l.value=!1)}}function J(){w||(E!==z.token&&(E=z.token,le(),u.value=0,R=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),w=!0,K(),x=setInterval(()=>{I.value=Date.now(),E!==z.token&&(E=z.token,le(),u.value=0,R=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&I.value-u.value>=15e3&&le(),h.value&&Date.parse(h.value.expires_at)<=I.value&&(Z(),A.value=!0),v.value&&Date.parse(v.value.expires_at)<=I.value&&(v.value=null),!U&&I.value-C>=5e3&&K()},500))}function ue(){w=!1,clearInterval(x),x=null,le(),c.value=!1}return Qe(J),os(J),Wt(ue),gt(ue),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:h,frameUrl:g,frameExpired:A,freshness:B,name:y,artifact:v,refresh:K,control:ge,observe:V,clearFrame:Z,exportFile:pe,download:$,toggling:r,adminReady:c,enabledLabel:S,restartSettings:ie,setEnabled:he,recovering:d,recover:De,reconcile:T,releaseOwnedInput:xe,reconciliationAck:m,applicationProfiles:ae,attached:P,scriptIdentity:M,inputLimits:O,accessibilityLabel:W,accessibilityDetail:D}}},Dv=[{id:"health",label:"Health",component:oS},{id:"resources",label:"Resources",component:rS},{id:"logs",label:"Logs",component:xS},{id:"config",label:"Config",component:LS},{id:"discord",label:"Discord",component:DS},{id:"hosts",label:"Hosts",component:FS},{id:"host-access",label:"Host Access",component:PS},{id:"api-tokens",label:"API Tokens",component:$S},{id:"llm",label:"LLM Config",component:WS},{id:"internals",label:"Internals",component:JS},{id:"turn-state",label:"Turn State",component:QS},{id:"computer",label:"Computer",component:s1},{id:"update",label:"Update",component:XS}],a1={components:{TabbedPage:xr},setup(){return{tabs:Dv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},io=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),n1=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...io("Operations","operations","/operations",Sv),...io("History","history","/history",Tv),...io("Capabilities","capabilities","/capabilities",Cv),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...io("System","system","/system",Dv)],As=fn({open:!1,query:"",selected:0});function jp(){As.query="",As.selected=0,As.open=!0}function Yr(){As.open=!1}function i1(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const l1={setup(){const e=vv(),t=f(null),s=j(()=>{const i=As.query.trim().toLowerCase();return n1.map(l=>({...l,_score:i1(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Ht(()=>As.open,async i=>{var l;i&&(await Pt(),(l=t.value)==null||l.focus())}),Ht(()=>As.query,()=>{As.selected=0});function a(i){Yr(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Yr();return}if(i.key==="ArrowDown")i.preventDefault(),As.selected=Math.min(As.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),As.selected=Math.max(As.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[As.selected];l&&a(l)}}return{state:As,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Yr}},template:`
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
  `},$c={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys($c));const o1={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>wi("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[wi("path",{d:$c[e.name]||$c.info})])}},r1=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Vp(e){return[...e.querySelectorAll(r1)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const c1={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=Vp(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Vp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},d1={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const m=j(()=>{const ie=e.value.uptime_seconds||0,B=Math.floor(ie/86400),Z=Math.floor(ie%86400/3600),le=Math.floor(ie%3600/60),q=[];return B>0&&q.push(`${B}d`),Z>0&&q.push(`${Z}h`),(q.length===0||B===0&&Z===0)&&q.push(`${le}m`),q.join(" ")}),h=j(()=>{const ie=e.value.uptime_seconds||0;return 125.66*(1-Math.min(ie/86400,1))}),g=j(()=>{const ie=e.value;return[{label:"Guilds",value:ie.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:ie.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:ie.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${ie.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:ie.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:ie.loop_count>0?"text-green-400":"",highlight:ie.loop_count>0},{label:"Agents",value:ie.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:ie.agent_count>0?`${ie.agent_count} total`:"",subColor:"text-gray-500",highlight:(ie.agent_running??0)>0},{label:"Processes",value:ie.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:ie.process_count>0?`${ie.process_count} total`:"",subColor:"text-gray-500",highlight:(ie.process_running??0)>0},{label:"Schedules",value:ie.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(ie.schedule_failing>0?`${ie.schedule_failing} failing`:"")+(ie.schedule_failing>0&&ie.schedule_paused>0?", ":"")+(ie.schedule_paused>0?`${ie.schedule_paused} paused`:"")||void 0,subColor:ie.schedule_failing>0?"text-red-400":"text-yellow-400",color:ie.schedule_failing>0?"text-red-400":"",highlight:ie.schedule_failing>0},{label:"Users",value:ie.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),A=j(()=>{const ie=e.value,B=[];return B.push({label:"Bot",status:ie.status==="online"?"ok":"warn",detail:ie.status==="online"?"Online":"Starting"}),(ie.schedule_failing||0)>0?B.push({label:"Schedules",status:"error",detail:`${ie.schedule_failing} failing`}):(ie.schedule_count||0)>0&&B.push({label:"Schedules",status:"ok",detail:`${ie.schedule_count} configured`}),(ie.loop_count||0)>0&&B.push({label:"Loops",status:"ok",detail:`${ie.loop_count} active`}),(ie.agent_running||0)>0&&B.push({label:"Agents",status:"ok",detail:`${ie.agent_running} running`}),(ie.process_running||0)>0&&B.push({label:"Processes",status:"ok",detail:`${ie.process_running} running`}),B});async function I(){try{e.value=await z.get("/api/status"),s.value=null}catch(ie){s.value=ie.message}finally{t.value=!1}}let y=0,v=0,b=0,x=0;function w(ie,B){const Z=new Set;return[...B,...ie].filter(le=>{const q=le._hmac||JSON.stringify([le.timestamp,le.tool_name,le.user_id,le.result_summary,le.error]);return Z.has(q)?!1:(Z.add(q),!0)})}async function E(){const ie=++y,B=b;n.value=!0;try{const Z=await z.get("/api/audit?limit=10");if(ie!==y)return;const le=B===b?[]:a.value.filter(q=>(q._liveEpoch||0)>B);a.value=w(Z,le).slice(0,10),c.value=le.length}catch{}ie===y&&(n.value=!1)}async function C(){const ie=++v,B=x;l.value=!0;try{const Z=await z.get("/api/audit?error_only=1&limit=5");if(ie!==v)return;const le=B===x?[]:i.value.filter(q=>(q._liveErrorEpoch||0)>B);i.value=w(Z,le).slice(0,5),o.value=!1}catch{if(ie!==v)return;o.value=B===x||i.value.length===0}ie===v&&(l.value=!1)}async function _(){try{const ie=await z.get("/api/knowledge");d.value=(Array.isArray(ie)?ie:[]).reduce((B,Z)=>B+(Z.chunks||0),0)}catch{d.value=null}}async function R(){try{const ie=await z.get("/api/agents");r.value=ie.filter(B=>B.status==="running")}catch{}}async function U(){u.value={...u.value,reload:!0};try{await z.post("/api/reload"),_e.success("Config reloaded")}catch(ie){_e.error(ie.message)}u.value={...u.value,reload:!1}}async function S(){if(!await Xt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const B=e.value.session_count;e.value={...e.value,session_count:0};try{const Z=await z.post("/api/sessions/clear-all");_e.success(`Cleared ${Z.count} session${Z.count!==1?"s":""}`),await I()}catch(Z){e.value={...e.value,session_count:B},_e.error(Z.message)}u.value={...u.value,clearSessions:!1}}async function P(){if(!await Xt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const B=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Z=await z.post("/api/loops/stop-all");_e.success(Z.result),await I()}catch(Z){e.value={...e.value,loop_count:B},_e.error(Z.message)}u.value={...u.value,stopLoops:!1}}function Y(){t.value=!0,s.value=null,I(),E(),C(),R()}let W=null,D=null,O=null;function M(ie){if(ie.payload&&ie.payload.tool_name){b+=1;const B={...ie.payload,_isNew:!0,_key:++p,_liveEpoch:b};a.value.unshift(B),a.value.length>10&&a.value.pop(),c.value++,B.error&&(x+=1,B._liveErrorEpoch=x,o.value=!1,i.value.unshift(B),i.value.length>5&&i.value.pop()),setTimeout(()=>{B._isNew=!1},1500),clearTimeout(O),O=setTimeout(()=>{c.value=0},1e4)}}let ae=null;return Qe(async()=>{await Promise.all([I(),E(),C(),R(),_()]),W=setInterval(I,15e3),D=setInterval(R,1e4),nt.subscribe("events",M),ae=nt.onReconnected(()=>{E(),C()})}),gt(()=>{W&&clearInterval(W),D&&clearInterval(D),clearTimeout(O),nt.unsubscribe("events",M),ae&&(ae(),ae=null)}),{status:e,loading:t,error:s,uptime:m,uptimeRingOffset:h,stats:g,healthIndicators:A,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:E,fetchErrors:C,fetchStatus:I,onEvent:M,formatTime:pk,formatDuration:Oi,retry:Y,reloadConfig:U,clearSessions:S,stopAllLoops:P}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function qp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function u1(e){if(Array.isArray(e))return e}function p1(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function f1(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function m1(e,t){return u1(e)||p1(e,t)||h1(e,t)||f1()}function h1(e,t){if(e){if(typeof e=="string")return qp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?qp(e,t):void 0}}const Mv=Object.entries,Gp=Object.setPrototypeOf,v1=Object.isFrozen,g1=Object.getPrototypeOf,b1=Object.getOwnPropertyDescriptor;let Ts=Object.freeze,Js=Object.seal,li=Object.create,Pv=typeof Reflect<"u"&&Reflect,Uc=Pv.apply,Bc=Pv.construct;Ts||(Ts=function(t){return t});Js||(Js=function(t){return t});Uc||(Uc=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});Bc||(Bc=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const Aa=zt(Array.prototype.forEach),y1=zt(Array.prototype.lastIndexOf),Wp=zt(Array.prototype.pop),ti=zt(Array.prototype.push),x1=zt(Array.prototype.splice),xs=Array.isArray,Yi=zt(String.prototype.toLowerCase),Qr=zt(String.prototype.toString),Kp=zt(String.prototype.match),si=zt(String.prototype.replace),Jp=zt(String.prototype.indexOf),_1=zt(String.prototype.trim),w1=zt(Number.prototype.toString),k1=zt(Boolean.prototype.toString),Zp=typeof BigInt>"u"?null:zt(BigInt.prototype.toString),Yp=typeof Symbol>"u"?null:zt(Symbol.prototype.toString),Ot=zt(Object.prototype.hasOwnProperty),Vi=zt(Object.prototype.toString),ss=zt(RegExp.prototype.test),kn=S1(TypeError);function zt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return Uc(e,t,a)}}function S1(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return Bc(e,s)}}function Ye(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Yi;if(Gp&&Gp(e,null),!xs(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(v1(t)||(t[a]=i),n=i)}e[n]=!0}return e}function T1(e){for(let t=0;t<e.length;t++)Ot(e,t)||(e[t]=null);return e}function cs(e){const t=li(null);for(const a of Mv(e)){var s=m1(a,2);const n=s[0],i=s[1];Ot(e,n)&&(xs(i)?t[n]=T1(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=cs(i):t[n]=i)}return t}function C1(e){switch(typeof e){case"string":return e;case"number":return w1(e);case"boolean":return k1(e);case"bigint":return Zp?Zp(e):"0";case"symbol":return Yp?Yp(e):"Symbol()";case"undefined":return Vi(e);case"function":case"object":{if(e===null)return Vi(e);const t=e,s=ua(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:Vi(a)}return Vi(e)}default:return Vi(e)}}function ua(e,t){for(;e!==null;){const a=b1(e,t);if(a){if(a.get)return zt(a.get);if(typeof a.value=="function")return zt(a.value)}e=g1(e)}function s(){return null}return s}function E1(e){try{return ss(e,""),!0}catch{return!1}}const Qp=Ts(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Xr=Ts(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),ec=Ts(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),A1=Ts(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),tc=Ts(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),R1=Ts(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Xp=Ts(["#text"]),ef=Ts(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),sc=Ts(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),tf=Ts(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),lo=Ts(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),I1=Js(/{{[\w\W]*|^[\w\W]*}}/g),O1=Js(/<%[\w\W]*|^[\w\W]*%>/g),L1=Js(/\${[\w\W]*/g),N1=Js(/^data-[\-\w.\u00B7-\uFFFF]+$/),D1=Js(/^aria-[\-\w]+$/),sf=Js(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),M1=Js(/^(?:\w+script|data):/i),P1=Js(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),F1=Js(/^html$/i),$1=Js(/^[a-z][.\w]*(-[.\w]+)+$/i),ca={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},U1=function(){return typeof window>"u"?null:window},B1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},af=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Fv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:U1();const t=Se=>Fv(Se);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==ca.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,m=ua(p,"cloneNode"),h=ua(p,"remove"),g=ua(p,"nextSibling"),A=ua(p,"childNodes"),I=ua(p,"parentNode"),y=ua(p,"shadowRoot"),v=ua(p,"attributes"),b=l&&l.prototype?ua(l.prototype,"nodeType"):null,x=l&&l.prototype?ua(l.prototype,"nodeName"):null;if(typeof i=="function"){const Se=s.createElement("template");Se.content&&Se.content.ownerDocument&&(s=Se.content.ownerDocument)}let w,E="",C,_=!1,R=0;const U=function(){if(R>0)throw kn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},S=function(L){U(),R++;try{return w.createHTML(L)}finally{R--}},P=function(L){U(),R++;try{return w.createScriptURL(L)}finally{R--}},Y=function(){return _||(C=B1(u,n),_=!0),C},W=s,D=W.implementation,O=W.createNodeIterator,M=W.createDocumentFragment,ae=W.getElementsByTagName,ie=a.importNode;let B=af();t.isSupported=typeof Mv=="function"&&typeof I=="function"&&D&&D.createHTMLDocument!==void 0;const Z=I1,le=O1,q=L1,ce=N1,me=D1,K=M1,de=P1,he=$1;let ge=sf,xe=null;const De=Ye({},[...Qp,...Xr,...ec,...tc,...Xp]);let T=null;const N=Ye({},[...ef,...sc,...tf,...lo]);let V=Object.seal(li(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),pe=null,$=null;const J=Object.seal(li(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ue=!0,H=!0,ee=!1,Q=!0,ve=!1,oe=!0,ye=!1,Oe=!1,Me=!1,qe=!1,He=!1,Ge=!1,Je=!0,lt=!1;const Ze="user-content-";let X=!0,we=!1,Ce={},Re=null;const se=Ye({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Ie=null;const Pe=Ye({},["audio","video","img","source","image","track"]);let it=null;const jt=Ye({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),st="http://www.w3.org/1998/Math/MathML",wt="http://www.w3.org/2000/svg",Dt="http://www.w3.org/1999/xhtml";let hs=Dt,Zs=!1,vs=null;const Ne=Ye({},[st,wt,Dt],Qr);let xa=Ye({},["mi","mo","mn","ms","mtext"]),Ys=Ye({},["annotation-xml"]);const mn=Ye({},["title","style","font","a","script"]);let Us=null;const hn=["application/xhtml+xml","text/html"],Qs="text/html";let dt=null,Bs=null;const Ja=s.createElement("form"),re=function(L){return L instanceof RegExp||L instanceof Function},Te=function(){let L=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Bs&&Bs===L)return;(!L||typeof L!="object")&&(L={}),L=cs(L),Us=hn.indexOf(L.PARSER_MEDIA_TYPE)===-1?Qs:L.PARSER_MEDIA_TYPE,dt=Us==="application/xhtml+xml"?Qr:Yi,xe=Ot(L,"ALLOWED_TAGS")&&xs(L.ALLOWED_TAGS)?Ye({},L.ALLOWED_TAGS,dt):De,T=Ot(L,"ALLOWED_ATTR")&&xs(L.ALLOWED_ATTR)?Ye({},L.ALLOWED_ATTR,dt):N,vs=Ot(L,"ALLOWED_NAMESPACES")&&xs(L.ALLOWED_NAMESPACES)?Ye({},L.ALLOWED_NAMESPACES,Qr):Ne,it=Ot(L,"ADD_URI_SAFE_ATTR")&&xs(L.ADD_URI_SAFE_ATTR)?Ye(cs(jt),L.ADD_URI_SAFE_ATTR,dt):jt,Ie=Ot(L,"ADD_DATA_URI_TAGS")&&xs(L.ADD_DATA_URI_TAGS)?Ye(cs(Pe),L.ADD_DATA_URI_TAGS,dt):Pe,Re=Ot(L,"FORBID_CONTENTS")&&xs(L.FORBID_CONTENTS)?Ye({},L.FORBID_CONTENTS,dt):se,pe=Ot(L,"FORBID_TAGS")&&xs(L.FORBID_TAGS)?Ye({},L.FORBID_TAGS,dt):cs({}),$=Ot(L,"FORBID_ATTR")&&xs(L.FORBID_ATTR)?Ye({},L.FORBID_ATTR,dt):cs({}),Ce=Ot(L,"USE_PROFILES")?L.USE_PROFILES&&typeof L.USE_PROFILES=="object"?cs(L.USE_PROFILES):L.USE_PROFILES:!1,ue=L.ALLOW_ARIA_ATTR!==!1,H=L.ALLOW_DATA_ATTR!==!1,ee=L.ALLOW_UNKNOWN_PROTOCOLS||!1,Q=L.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ve=L.SAFE_FOR_TEMPLATES||!1,oe=L.SAFE_FOR_XML!==!1,ye=L.WHOLE_DOCUMENT||!1,qe=L.RETURN_DOM||!1,He=L.RETURN_DOM_FRAGMENT||!1,Ge=L.RETURN_TRUSTED_TYPE||!1,Me=L.FORCE_BODY||!1,Je=L.SANITIZE_DOM!==!1,lt=L.SANITIZE_NAMED_PROPS||!1,X=L.KEEP_CONTENT!==!1,we=L.IN_PLACE||!1,ge=E1(L.ALLOWED_URI_REGEXP)?L.ALLOWED_URI_REGEXP:sf,hs=typeof L.NAMESPACE=="string"?L.NAMESPACE:Dt,xa=Ot(L,"MATHML_TEXT_INTEGRATION_POINTS")&&L.MATHML_TEXT_INTEGRATION_POINTS&&typeof L.MATHML_TEXT_INTEGRATION_POINTS=="object"?cs(L.MATHML_TEXT_INTEGRATION_POINTS):Ye({},["mi","mo","mn","ms","mtext"]),Ys=Ot(L,"HTML_INTEGRATION_POINTS")&&L.HTML_INTEGRATION_POINTS&&typeof L.HTML_INTEGRATION_POINTS=="object"?cs(L.HTML_INTEGRATION_POINTS):Ye({},["annotation-xml"]);const ne=Ot(L,"CUSTOM_ELEMENT_HANDLING")&&L.CUSTOM_ELEMENT_HANDLING&&typeof L.CUSTOM_ELEMENT_HANDLING=="object"?cs(L.CUSTOM_ELEMENT_HANDLING):li(null);if(V=li(null),Ot(ne,"tagNameCheck")&&re(ne.tagNameCheck)&&(V.tagNameCheck=ne.tagNameCheck),Ot(ne,"attributeNameCheck")&&re(ne.attributeNameCheck)&&(V.attributeNameCheck=ne.attributeNameCheck),Ot(ne,"allowCustomizedBuiltInElements")&&typeof ne.allowCustomizedBuiltInElements=="boolean"&&(V.allowCustomizedBuiltInElements=ne.allowCustomizedBuiltInElements),ve&&(H=!1),He&&(qe=!0),Ce&&(xe=Ye({},Xp),T=li(null),Ce.html===!0&&(Ye(xe,Qp),Ye(T,ef)),Ce.svg===!0&&(Ye(xe,Xr),Ye(T,sc),Ye(T,lo)),Ce.svgFilters===!0&&(Ye(xe,ec),Ye(T,sc),Ye(T,lo)),Ce.mathMl===!0&&(Ye(xe,tc),Ye(T,tf),Ye(T,lo))),J.tagCheck=null,J.attributeCheck=null,Ot(L,"ADD_TAGS")&&(typeof L.ADD_TAGS=="function"?J.tagCheck=L.ADD_TAGS:xs(L.ADD_TAGS)&&(xe===De&&(xe=cs(xe)),Ye(xe,L.ADD_TAGS,dt))),Ot(L,"ADD_ATTR")&&(typeof L.ADD_ATTR=="function"?J.attributeCheck=L.ADD_ATTR:xs(L.ADD_ATTR)&&(T===N&&(T=cs(T)),Ye(T,L.ADD_ATTR,dt))),Ot(L,"ADD_URI_SAFE_ATTR")&&xs(L.ADD_URI_SAFE_ATTR)&&Ye(it,L.ADD_URI_SAFE_ATTR,dt),Ot(L,"FORBID_CONTENTS")&&xs(L.FORBID_CONTENTS)&&(Re===se&&(Re=cs(Re)),Ye(Re,L.FORBID_CONTENTS,dt)),Ot(L,"ADD_FORBID_CONTENTS")&&xs(L.ADD_FORBID_CONTENTS)&&(Re===se&&(Re=cs(Re)),Ye(Re,L.ADD_FORBID_CONTENTS,dt)),X&&(xe["#text"]=!0),ye&&Ye(xe,["html","head","body"]),xe.table&&(Ye(xe,["tbody"]),delete pe.tbody),L.TRUSTED_TYPES_POLICY){if(typeof L.TRUSTED_TYPES_POLICY.createHTML!="function")throw kn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof L.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw kn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const be=w;w=L.TRUSTED_TYPES_POLICY;try{E=S("")}catch(Fe){throw w=be,Fe}}else L.TRUSTED_TYPES_POLICY===null?(w=void 0,E=""):(w===void 0&&(w=Y()),w&&typeof E=="string"&&(E=S("")));(B.uponSanitizeElement.length>0||B.uponSanitizeAttribute.length>0)&&xe===De&&(xe=cs(xe)),B.uponSanitizeAttribute.length>0&&T===N&&(T=cs(T)),Ts&&Ts(L),Bs=L},Ue=Ye({},[...Xr,...ec,...A1]),ze=Ye({},[...tc,...R1]),yt=function(L){let ne=I(L);(!ne||!ne.tagName)&&(ne={namespaceURI:hs,tagName:"template"});const be=Yi(L.tagName),Fe=Yi(ne.tagName);return vs[L.namespaceURI]?L.namespaceURI===wt?ne.namespaceURI===Dt?be==="svg":ne.namespaceURI===st?be==="svg"&&(Fe==="annotation-xml"||xa[Fe]):!!Ue[be]:L.namespaceURI===st?ne.namespaceURI===Dt?be==="math":ne.namespaceURI===wt?be==="math"&&Ys[Fe]:!!ze[be]:L.namespaceURI===Dt?ne.namespaceURI===wt&&!Ys[Fe]||ne.namespaceURI===st&&!xa[Fe]?!1:!ze[be]&&(mn[be]||!Ue[be]):!!(Us==="application/xhtml+xml"&&vs[L.namespaceURI]):!1},ot=function(L){ti(t.removed,{element:L});try{I(L).removeChild(L)}catch{if(h(L),!I(L))throw kn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},es=function(L){const ne=A?A(L):L.childNodes;if(ne){const Fe=[];Aa(ne,Be=>{ti(Fe,Be)}),Aa(Fe,Be=>{try{h(Be)}catch{}})}const be=v?v(L):null;if(be)for(let Fe=be.length-1;Fe>=0;--Fe){const Be=be[Fe],Ve=Be&&Be.name;if(typeof Ve=="string")try{L.removeAttribute(Ve)}catch{}}},Hs=function(L,ne){try{ti(t.removed,{attribute:ne.getAttributeNode(L),from:ne})}catch{ti(t.removed,{attribute:null,from:ne})}if(ne.removeAttribute(L),L==="is")if(qe||He)try{ot(ne)}catch{}else try{ne.setAttribute(L,"")}catch{}},Mi=function(L){const ne=v?v(L):L.attributes;if(ne)for(let be=ne.length-1;be>=0;--be){const Fe=ne[be],Be=Fe&&Fe.name;if(!(typeof Be!="string"||T[dt(Be)]))try{L.removeAttribute(Be)}catch{}}},qn=function(L){const ne=[L];for(;ne.length>0;){const be=ne.pop();(b?b(be):be.nodeType)===ca.element&&Mi(be);const Be=A?A(be):be.childNodes;if(Be)for(let Ve=Be.length-1;Ve>=0;--Ve)ne.push(Be[Ve])}},vn=function(L){let ne=null,be=null;if(Me)L="<remove></remove>"+L;else{const Ve=Kp(L,/^[\r\n\t ]+/);be=Ve&&Ve[0]}Us==="application/xhtml+xml"&&hs===Dt&&(L='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+L+"</body></html>");const Fe=w?S(L):L;if(hs===Dt)try{ne=new d().parseFromString(Fe,Us)}catch{}if(!ne||!ne.documentElement){ne=D.createDocument(hs,"template",null);try{ne.documentElement.innerHTML=Zs?E:Fe}catch{}}const Be=ne.body||ne.documentElement;return L&&be&&Be.insertBefore(s.createTextNode(be),Be.childNodes[0]||null),hs===Dt?ae.call(ne,ye?"html":"body")[0]:ye?ne.documentElement:Be},Gn=function(L){return O.call(L.ownerDocument||L,L,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},_a=function(L){var ne,be;L.normalize();const Fe=O.call(L.ownerDocument||L,L,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let Be=Fe.nextNode();for(;Be;){let At=Be.data;Aa([Z,le,q],mt=>{At=si(At,mt," ")}),Be.data=At,Be=Fe.nextNode()}const Ve=(ne=(be=L.querySelectorAll)===null||be===void 0?void 0:be.call(L,"template"))!==null&&ne!==void 0?ne:[];Aa(Array.from(Ve),At=>{Kt(At.content)&&_a(At.content)})},Xs=function(L){const ne=x?x(L):null;return typeof ne!="string"||dt(ne)!=="form"?!1:typeof L.nodeName!="string"||typeof L.textContent!="string"||typeof L.removeChild!="function"||L.attributes!==v(L)||typeof L.removeAttribute!="function"||typeof L.setAttribute!="function"||typeof L.namespaceURI!="string"||typeof L.insertBefore!="function"||typeof L.hasChildNodes!="function"||L.nodeType!==b(L)||L.childNodes!==A(L)},Kt=function(L){if(!b||typeof L!="object"||L===null)return!1;try{return b(L)===ca.documentFragment}catch{return!1}},wa=function(L){if(!b||typeof L!="object"||L===null)return!1;try{return typeof b(L)=="number"}catch{return!1}};function Jt(Se,L,ne){Aa(Se,be=>{be.call(t,L,ne,Bs)})}const gn=function(L){let ne=null;if(Jt(B.beforeSanitizeElements,L,null),Xs(L))return ot(L),!0;const be=dt(x?x(L):L.nodeName);if(Jt(B.uponSanitizeElement,L,{tagName:be,allowedTags:xe}),oe&&L.hasChildNodes()&&!wa(L.firstElementChild)&&ss(/<[/\w!]/g,L.innerHTML)&&ss(/<[/\w!]/g,L.textContent)||oe&&L.namespaceURI===Dt&&be==="style"&&wa(L.firstElementChild)||L.nodeType===ca.progressingInstruction||oe&&L.nodeType===ca.comment&&ss(/<[/\w]/g,L.data))return ot(L),!0;if(pe[be]||!(J.tagCheck instanceof Function&&J.tagCheck(be))&&!xe[be]){if(!pe[be]&&Ya(be)&&(V.tagNameCheck instanceof RegExp&&ss(V.tagNameCheck,be)||V.tagNameCheck instanceof Function&&V.tagNameCheck(be)))return!1;if(X&&!Re[be]){const Be=I(L),Ve=A(L);if(Ve&&Be){const At=Ve.length;for(let mt=At-1;mt>=0;--mt){const kt=we?Ve[mt]:m(Ve[mt],!0);Be.insertBefore(kt,g(L))}}}return ot(L),!0}return(b?b(L):L.nodeType)===ca.element&&!yt(L)||(be==="noscript"||be==="noembed"||be==="noframes")&&ss(/<\/no(script|embed|frames)/i,L.innerHTML)?(ot(L),!0):(ve&&L.nodeType===ca.text&&(ne=L.textContent,Aa([Z,le,q],Be=>{ne=si(ne,Be," ")}),L.textContent!==ne&&(ti(t.removed,{element:L.cloneNode()}),L.textContent=ne)),Jt(B.afterSanitizeElements,L,null),!1)},Za=function(L,ne,be){if($[ne]||Je&&(ne==="id"||ne==="name")&&(be in s||be in Ja))return!1;const Fe=T[ne]||J.attributeCheck instanceof Function&&J.attributeCheck(ne,L);if(!(H&&!$[ne]&&ss(ce,ne))){if(!(ue&&ss(me,ne))){if(!Fe||$[ne]){if(!(Ya(L)&&(V.tagNameCheck instanceof RegExp&&ss(V.tagNameCheck,L)||V.tagNameCheck instanceof Function&&V.tagNameCheck(L))&&(V.attributeNameCheck instanceof RegExp&&ss(V.attributeNameCheck,ne)||V.attributeNameCheck instanceof Function&&V.attributeNameCheck(ne,L))||ne==="is"&&V.allowCustomizedBuiltInElements&&(V.tagNameCheck instanceof RegExp&&ss(V.tagNameCheck,be)||V.tagNameCheck instanceof Function&&V.tagNameCheck(be))))return!1}else if(!it[ne]){if(!ss(ge,si(be,de,""))){if(!((ne==="src"||ne==="xlink:href"||ne==="href")&&L!=="script"&&Jp(be,"data:")===0&&Ie[L])){if(!(ee&&!ss(K,si(be,de,"")))){if(be)return!1}}}}}}return!0},Wn=Ye({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ya=function(L){return!Wn[Yi(L)]&&ss(he,L)},bn=function(L){Jt(B.beforeSanitizeAttributes,L,null);const ne=L.attributes;if(!ne||Xs(L))return;const be={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:T,forceKeepAttr:void 0};let Fe=ne.length;for(;Fe--;){const Be=ne[Fe],Ve=Be.name,At=Be.namespaceURI,mt=Be.value,kt=dt(Ve),gs=mt;let Rt=Ve==="value"?gs:_1(gs);if(be.attrName=kt,be.attrValue=Rt,be.keepAttr=!0,be.forceKeepAttr=void 0,Jt(B.uponSanitizeAttribute,L,be),Rt=be.attrValue,lt&&(kt==="id"||kt==="name")&&Jp(Rt,Ze)!==0&&(Hs(Ve,L),Rt=Ze+Rt),oe&&ss(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Rt)){Hs(Ve,L);continue}if(kt==="attributename"&&Kp(Rt,"href")){Hs(Ve,L);continue}if(be.forceKeepAttr)continue;if(!be.keepAttr){Hs(Ve,L);continue}if(!Q&&ss(/\/>/i,Rt)){Hs(Ve,L);continue}ve&&Aa([Z,le,q],Kn=>{Rt=si(Rt,Kn," ")});const ka=dt(L.nodeName);if(!Za(ka,kt,Rt)){Hs(Ve,L);continue}if(w&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!At)switch(u.getAttributeType(ka,kt)){case"TrustedHTML":{Rt=S(Rt);break}case"TrustedScriptURL":{Rt=P(Rt);break}}if(Rt!==gs)try{At?L.setAttributeNS(At,Ve,Rt):L.setAttribute(Ve,Rt),Xs(L)?ot(L):Wp(t.removed)}catch{Hs(Ve,L)}}Jt(B.afterSanitizeAttributes,L,null)},Qa=function(L){let ne=null;const be=Gn(L);for(Jt(B.beforeSanitizeShadowDOM,L,null);ne=be.nextNode();)if(Jt(B.uponSanitizeShadowNode,ne,null),gn(ne),bn(ne),Kt(ne.content)&&Qa(ne.content),(b?b(ne):ne.nodeType)===ca.element){const Be=y?y(ne):ne.shadowRoot;Kt(Be)&&(ea(Be),Qa(Be))}Jt(B.afterSanitizeShadowDOM,L,null)},ea=function(L){const ne=[{node:L,shadow:null}];for(;ne.length>0;){const be=ne.pop();if(be.shadow){Qa(be.shadow);continue}const Fe=be.node,Ve=(b?b(Fe):Fe.nodeType)===ca.element,At=A?A(Fe):Fe.childNodes;if(At)for(let mt=At.length-1;mt>=0;--mt)ne.push({node:At[mt],shadow:null});if(Ve){const mt=x?x(Fe):null;if(typeof mt=="string"&&dt(mt)==="template"){const kt=Fe.content;Kt(kt)&&ne.push({node:kt,shadow:null})}}if(Ve){const mt=y?y(Fe):Fe.shadowRoot;Kt(mt)&&ne.push({node:null,shadow:mt},{node:mt,shadow:null})}}};return t.sanitize=function(Se){let L=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ne=null,be=null,Fe=null,Be=null;if(Zs=!Se,Zs&&(Se="<!-->"),typeof Se!="string"&&!wa(Se)&&(Se=C1(Se),typeof Se!="string"))throw kn("dirty is not a string, aborting");if(!t.isSupported)return Se;Oe||Te(L),t.removed=[];const Ve=we&&typeof Se!="string"&&wa(Se);if(Ve){const kt=x?x(Se):Se.nodeName;if(typeof kt=="string"){const gs=dt(kt);if(!xe[gs]||pe[gs])throw kn("root node is forbidden and cannot be sanitized in-place")}if(Xs(Se))throw kn("root node is clobbered and cannot be sanitized in-place");try{ea(Se)}catch(gs){throw es(Se),gs}}else if(wa(Se))ne=vn("<!---->"),be=ne.ownerDocument.importNode(Se,!0),be.nodeType===ca.element&&be.nodeName==="BODY"||be.nodeName==="HTML"?ne=be:ne.appendChild(be),ea(be);else{if(!qe&&!ve&&!ye&&Se.indexOf("<")===-1)return w&&Ge?S(Se):Se;if(ne=vn(Se),!ne)return qe?null:Ge?E:""}ne&&Me&&ot(ne.firstChild);const At=Gn(Ve?Se:ne);try{for(;Fe=At.nextNode();)gn(Fe),bn(Fe),Kt(Fe.content)&&Qa(Fe.content)}catch(kt){throw Ve&&es(Se),kt}if(Ve)return Aa(t.removed,kt=>{kt.element&&qn(kt.element)}),ve&&_a(Se),Se;if(qe){if(ve&&_a(ne),He)for(Be=M.call(ne.ownerDocument);ne.firstChild;)Be.appendChild(ne.firstChild);else Be=ne;return(T.shadowroot||T.shadowrootmode)&&(Be=ie.call(a,Be,!0)),Be}let mt=ye?ne.outerHTML:ne.innerHTML;return ye&&xe["!doctype"]&&ne.ownerDocument&&ne.ownerDocument.doctype&&ne.ownerDocument.doctype.name&&ss(F1,ne.ownerDocument.doctype.name)&&(mt="<!DOCTYPE "+ne.ownerDocument.doctype.name+`>
`+mt),ve&&Aa([Z,le,q],kt=>{mt=si(mt,kt," ")}),w&&Ge?S(mt):mt},t.setConfig=function(){let Se=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(Se),Oe=!0},t.clearConfig=function(){Bs=null,Oe=!1,w=C,E=""},t.isValidAttribute=function(Se,L,ne){Bs||Te({});const be=dt(Se),Fe=dt(L);return Za(be,Fe,ne)},t.addHook=function(Se,L){typeof L=="function"&&ti(B[Se],L)},t.removeHook=function(Se,L){if(L!==void 0){const ne=y1(B[Se],L);return ne===-1?void 0:x1(B[Se],ne,1)[0]}return Wp(B[Se])},t.removeHooks=function(Se){B[Se]=[]},t.removeAllHooks=function(){B=af()},t}var nf=Fv();function Gd(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Vn=Gd();function $v(e){Vn=e}var ll={exec:()=>null};function vt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ks.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var ks={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},H1=/^(?:[ \t]*(?:\n|$))+/,z1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,j1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Bl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,V1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Wd=/(?:[*+-]|\d{1,9}[.)])/,Uv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Bv=vt(Uv).replace(/bull/g,Wd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),q1=vt(Uv).replace(/bull/g,Wd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Kd=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,G1=/^[^\n]+/,Jd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,W1=vt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Jd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),K1=vt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Wd).getRegex(),wr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Zd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,J1=vt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Zd).replace("tag",wr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Hv=vt(Kd).replace("hr",Bl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",wr).getRegex(),Z1=vt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Hv).getRegex(),Yd={blockquote:Z1,code:z1,def:W1,fences:j1,heading:V1,hr:Bl,html:J1,lheading:Bv,list:K1,newline:H1,paragraph:Hv,table:ll,text:G1},lf=vt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Bl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",wr).getRegex(),Y1={...Yd,lheading:q1,table:lf,paragraph:vt(Kd).replace("hr",Bl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",lf).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",wr).getRegex()},Q1={...Yd,html:vt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Zd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:ll,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:vt(Kd).replace("hr",Bl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Bv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},X1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,eT=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,zv=/^( {2,}|\\)\n(?!\s*$)/,tT=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,kr=/[\p{P}\p{S}]/u,Qd=/[\s\p{P}\p{S}]/u,jv=/[^\s\p{P}\p{S}]/u,sT=vt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Qd).getRegex(),Vv=/(?!~)[\p{P}\p{S}]/u,aT=/(?!~)[\s\p{P}\p{S}]/u,nT=/(?:[^\s\p{P}\p{S}]|~)/u,iT=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,qv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,lT=vt(qv,"u").replace(/punct/g,kr).getRegex(),oT=vt(qv,"u").replace(/punct/g,Vv).getRegex(),Gv="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",rT=vt(Gv,"gu").replace(/notPunctSpace/g,jv).replace(/punctSpace/g,Qd).replace(/punct/g,kr).getRegex(),cT=vt(Gv,"gu").replace(/notPunctSpace/g,nT).replace(/punctSpace/g,aT).replace(/punct/g,Vv).getRegex(),dT=vt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,jv).replace(/punctSpace/g,Qd).replace(/punct/g,kr).getRegex(),uT=vt(/\\(punct)/,"gu").replace(/punct/g,kr).getRegex(),pT=vt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),fT=vt(Zd).replace("(?:-->|$)","-->").getRegex(),mT=vt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",fT).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),qo=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,hT=vt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",qo).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Wv=vt(/^!?\[(label)\]\[(ref)\]/).replace("label",qo).replace("ref",Jd).getRegex(),Kv=vt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Jd).getRegex(),vT=vt("reflink|nolink(?!\\()","g").replace("reflink",Wv).replace("nolink",Kv).getRegex(),Xd={_backpedal:ll,anyPunctuation:uT,autolink:pT,blockSkip:iT,br:zv,code:eT,del:ll,emStrongLDelim:lT,emStrongRDelimAst:rT,emStrongRDelimUnd:dT,escape:X1,link:hT,nolink:Kv,punctuation:sT,reflink:Wv,reflinkSearch:vT,tag:mT,text:tT,url:ll},gT={...Xd,link:vt(/^!?\[(label)\]\((.*?)\)/).replace("label",qo).getRegex(),reflink:vt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",qo).getRegex()},Hc={...Xd,emStrongRDelimAst:cT,emStrongLDelim:oT,url:vt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},bT={...Hc,br:vt(zv).replace("{2,}","*").getRegex(),text:vt(Hc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},oo={normal:Yd,gfm:Y1,pedantic:Q1},qi={normal:Xd,gfm:Hc,breaks:bT,pedantic:gT},yT={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},of=e=>yT[e];function pa(e,t){if(t){if(ks.escapeTest.test(e))return e.replace(ks.escapeReplace,of)}else if(ks.escapeTestNoEncode.test(e))return e.replace(ks.escapeReplaceNoEncode,of);return e}function rf(e){try{e=encodeURI(e).replace(ks.percentDecode,"%")}catch{return null}return e}function cf(e,t){var i;const s=e.replace(ks.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(ks.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(ks.slashPipe,"|");return a}function Gi(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function xT(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function df(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function _T(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var Go=class{constructor(e){xt(this,"options");xt(this,"rules");xt(this,"lexer");this.options=e||Vn}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Gi(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=_T(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=Gi(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Gi(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Gi(t[0],`
`).split(`
`),a="",n="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");a=a?`${a}
${c}`:c,n=n?`${n}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const m=p,h=m.raw+`
`+s.join(`
`),g=this.blockquote(h);i[i.length-1]=g,a=a.substring(0,a.length-m.raw.length)+g.raw,n=n.substring(0,n.length-m.text.length)+g.text;break}else if((p==null?void 0:p.type)==="list"){const m=p,h=m.raw+`
`+s.join(`
`),g=this.list(h);i[i.length-1]=g,a=a.substring(0,a.length-p.raw.length)+g.raw,n=n.substring(0,n.length-m.raw.length)+g.raw,s=h.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:a,tokens:i,text:n}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const a=s.length>1,n={type:"list",raw:"",ordered:a,start:a?+s.slice(0,-1):"",loose:!1,items:[]};s=a?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=a?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,I=>" ".repeat(3*I.length)),p=e.split(`
`,1)[0],m=!u.trim(),h=0;if(this.options.pedantic?(h=2,d=u.trimStart()):m?h=t[1].length+1:(h=t[2].search(this.rules.other.nonSpaceChar),h=h>4?1:h,d=u.slice(h),h+=t[1].length),m&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const I=this.rules.other.nextBulletRegex(h),y=this.rules.other.hrRegex(h),v=this.rules.other.fencesBeginRegex(h),b=this.rules.other.headingBeginRegex(h),x=this.rules.other.htmlBeginRegex(h);for(;e;){const w=e.split(`
`,1)[0];let E;if(p=w,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),E=p):E=p.replace(this.rules.other.tabCharGlobal,"    "),v.test(p)||b.test(p)||x.test(p)||I.test(p)||y.test(p))break;if(E.search(this.rules.other.nonSpaceChar)>=h||!p.trim())d+=`
`+E.slice(h);else{if(m||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!m&&!p.trim()&&(m=!0),c+=w+`
`,e=e.substring(w.length+1),u=E.slice(h)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,A;this.options.gfm&&(g=this.rules.other.listIsTask.exec(d),g&&(A=g[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!g,checked:A,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=cf(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(cf(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Gi(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=xT(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),df(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return df(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const h=p.slice(1,-1);return{type:"em",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}const m=p.slice(2,-2);return{type:"strong",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Pa=class zc{constructor(t){xt(this,"tokens");xt(this,"options");xt(this,"state");xt(this,"tokenizer");xt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Vn,this.options.tokenizer=this.options.tokenizer||new Go,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ks,block:oo.normal,inline:qi.normal};this.options.pedantic?(s.block=oo.pedantic,s.inline=qi.pedantic):this.options.gfm&&(s.block=oo.gfm,this.options.breaks?s.inline=qi.breaks:s.inline=qi.gfm),this.tokenizer.rules=s}static get rules(){return{block:oo,inline:qi}}static lex(t,s){return new zc(s).lex(t)}static lexInline(t,s){return new zc(s).inlineTokens(t)}lex(t){t=t.replace(ks.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(ks.tabCharGlobal,"    ").replace(ks.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const m=t.slice(1);let h;this.options.extensions.startInline.forEach(g=>{h=g.call({lexer:this},m),typeof h=="number"&&h>=0&&(p=Math.min(p,h))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Wo=class{constructor(e){xt(this,"options");xt(this,"parser");this.options=e||Vn}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(ks.notSpaceStart))==null?void 0:i[0],n=e.replace(ks.endingNewline,"")+`
`;return a?'<pre><code class="language-'+pa(a)+'">'+(s?n:pa(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:pa(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+pa(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${pa(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=rf(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+pa(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=rf(e);if(n===null)return pa(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${pa(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:pa(e.text)}},eu=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Fa=class jc{constructor(t){xt(this,"options");xt(this,"renderer");xt(this,"textRenderer");this.options=t||Vn,this.options.renderer=this.options.renderer||new Wo,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new eu}static parse(t,s){return new jc(s).parse(t)}static parseInline(t,s){return new jc(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},ac,vo=(ac=class{constructor(e){xt(this,"options");xt(this,"block");this.options=e||Vn}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Pa.lex:Pa.lexInline}provideParser(){return this.block?Fa.parse:Fa.parseInline}},xt(ac,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),ac),wT=class{constructor(...e){xt(this,"defaults",Gd());xt(this,"options",this.setOptions);xt(this,"parse",this.parseMarkdown(!0));xt(this,"parseInline",this.parseMarkdown(!1));xt(this,"Parser",Fa);xt(this,"Renderer",Wo);xt(this,"TextRenderer",eu);xt(this,"Lexer",Pa);xt(this,"Tokenizer",Go);xt(this,"Hooks",vo);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Wo(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new Go(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new vo;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];vo.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Pa.lex(e,t??this.defaults)}parser(e,t){return Fa.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Pa.lex:Pa.lexInline,r=i.hooks?i.hooks.provideParser():e?Fa.parse:Fa.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+pa(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},$n=new wT;function ft(e,t){return $n.parse(e,t)}ft.options=ft.setOptions=function(e){return $n.setOptions(e),ft.defaults=$n.defaults,$v(ft.defaults),ft};ft.getDefaults=Gd;ft.defaults=Vn;ft.use=function(...e){return $n.use(...e),ft.defaults=$n.defaults,$v(ft.defaults),ft};ft.walkTokens=function(e,t){return $n.walkTokens(e,t)};ft.parseInline=$n.parseInline;ft.Parser=Fa;ft.parser=Fa.parse;ft.Renderer=Wo;ft.TextRenderer=eu;ft.Lexer=Pa;ft.lexer=Pa.lex;ft.Tokenizer=Go;ft.Hooks=vo;ft.parse=ft;ft.options;ft.setOptions;ft.use;ft.walkTokens;ft.parseInline;Fa.parse;Pa.lex;const kT={breaks:!0,gfm:!0};function uf(e){if(!e)return"";try{if(typeof ft<"u"&&ft.parse){const t=ft.parse(e,kT);return typeof nf<"u"?nf.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function ST(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const TT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function CT(e){return TT[e]||"wrench"}const ET=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function pf(e){if(!e)return[];const t=e.match(ET);return t?[...new Set(t)]:[]}const AT={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=j(()=>t.value.trim().length>0&&!s.value),p=f(nt.state||"disconnected");let m=null;const h=j(()=>{const D=p.value;return D==="connected"?"Connected":D==="reconnecting"?"Reconnecting…":D==="connecting"?"Connecting…":"REST fallback"}),g=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],A=j(()=>{const D=Math.floor(l.value/4)%g.length,O=l.value;return O>3?`${g[D]} (${O}s)`:g[0]});function I(){Pt(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!i.value)return;const D=i.value;D.style.height="auto",D.style.height=Math.min(D.scrollHeight,120)+"px"}function v(D,O,M={}){const ae={id:++c,role:D,content:O,timestamp:Date.now(),html:D==="bot"?uf(O):"",tools_used:M.tools_used||[],is_error:M.is_error||!1,images:D==="bot"?pf(O):[],files:M.files||[],_showTools:!1};return e.value.push(ae),I(),D==="bot"&&Pt(()=>b()),ae}function b(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(O=>{O.setAttribute("data-copy","true"),O.style.position="relative";const M=document.createElement("button");M.className="chat-code-copy",M.textContent="Copy",M.addEventListener("click",()=>{const ae=O.querySelector("code"),ie=ae?ae.textContent:O.textContent;navigator.clipboard.writeText(ie).then(()=>{M.textContent="Copied!",setTimeout(()=>{M.textContent="Copy"},1500)}).catch(()=>{})}),O.appendChild(M)})}function x(D){if(D===0)return!0;const O=e.value[D-1],M=e.value[D],ae=new Date(O.timestamp).toDateString(),ie=new Date(M.timestamp).toDateString();return ae!==ie}function w(D){const O=new Date(D),M=new Date;if(O.toDateString()===M.toDateString())return"Today";const ae=new Date(M);return ae.setDate(ae.getDate()-1),O.toDateString()===ae.toDateString()?"Yesterday":O.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function E(D){t.value=D,Pt(()=>Y())}function C(D){window.open(D,"_blank","noopener")}function _(D){D.target.style.display="none"}function R(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function U(){r&&(clearInterval(r),r=null),l.value=0}function S(D){s.value&&(s.value=!1,U(),D.type==="chat_response"?v("bot",D.content,{tools_used:D.tools_used||[],is_error:D.is_error||!1,files:D.files||[]}):D.type==="chat_error"&&v("bot",D.error||"Unknown error",{is_error:!0}),Pt(()=>{var O;return(O=i.value)==null?void 0:O.focus()}))}async function P(D){try{const O=await z.post("/api/chat",{content:D,channel_id:o.value});v("bot",O.response,{tools_used:O.tools_used||[],is_error:O.is_error||!1,files:O.files||[]})}catch(O){v("bot",O.message||"Failed to send message",{is_error:!0})}}async function Y(){const D=t.value.trim();if(!D||s.value)return;v("user",D),t.value="",s.value=!0,R(),i.value&&(i.value.style.height="auto"),nt.connected&&nt.sendChat(D,{channelId:o.value})||(await P(D),s.value=!1,U()),Pt(()=>{var M;return(M=i.value)==null?void 0:M.focus()})}async function W(){a.value="";try{if(!o.value){const O=await z.get("/api/auth/session");o.value=O.channel_id||O.user_id||"web-user"}const D=await z.get("/api/sessions/"+encodeURIComponent(o.value));if(D&&D.messages&&D.messages.length>0){for(const O of D.messages){const M=O.role==="user"?"user":"bot";let ae=O.content||"";if(M==="user"){const B=ae.match(/^\[.*?\]:\s*/);B&&(ae=ae.slice(B[0].length))}if(!ae.trim())continue;const ie={id:++c,role:M,content:ae,timestamp:O.timestamp?O.timestamp*1e3:Date.now(),html:M==="bot"?uf(ae):"",tools_used:[],is_error:!1,images:M==="bot"?pf(ae):[],files:[],_showTools:!1};e.value.push(ie)}Pt(()=>{I(),b()})}}catch(D){D&&D.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",_e.error(a.value))}}return Qe(()=>{nt.subscribe("chat",S),p.value=nt.state||"disconnected",m=nt.onState(D=>{p.value=D}),W(),Pt(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}),gt(()=>{nt.unsubscribe("chat",S),m&&(m(),m=null),U()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:h,typingText:A,suggestions:d,send:Y,autoResize:y,formatTime:ST,formatDate:w,showDateSeparator:x,useSuggestion:E,openImage:C,onImageError:_,getToolIcon:CT,loadHistory:W}}},RT={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),m=f(!1),h=j(()=>e.value==="custom"),g=j(()=>[...i.value,...l.value]),A=j(()=>l.value.includes(e.value)),I=j(()=>{var C;return h.value?t.value||"Odin":((C=n.value[e.value])==null?void 0:C.name)||e.value}),y=j(()=>{var C;return h.value?s.value||"(empty — will use Odin default)":((C=n.value[e.value])==null?void 0:C.identity)||""}),v=j(()=>{var C;return h.value?a.value||"(empty — will use Odin default)":((C=n.value[e.value])==null?void 0:C.voice)||""});async function b(){d.value=!0;try{const C=await z.get("/api/personality");e.value=C.preset||"odin",t.value=C.custom_name||"",s.value=C.custom_identity||"",a.value=C.custom_voice||"",n.value=C.presets||{},i.value=C.builtin_presets||[],l.value=C.user_presets||[]}catch(C){c.value=C.message}finally{d.value=!1}}async function x(){o.value=!0,c.value=null,r.value=!1;try{await z.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(C){c.value=C.message}finally{o.value=!1}}async function w(){const C=u.value.trim();if(C){m.value=!0,c.value=null;try{await z.post("/api/personality/presets",{name:C,display_name:I.value,identity:y.value,voice:v.value}),p.value=!1,u.value="",await b(),e.value=C.toLowerCase().replace(/ /g,"_")}catch(_){c.value=_.message}finally{m.value=!1}}}async function E(){if(await Xt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await z.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(_){c.value=_.message}}}return Qe(b),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:g,isCustom:h,isUserPreset:A,previewName:I,previewIdentity:y,previewVoice:v,saving:o,saved:r,error:c,loading:d,save:x,showSavePreset:p,newPresetName:u,savingPreset:m,saveAsPreset:w,deletePreset:E,builtinPresets:i,userPresets:l}},template:`
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
  `},IT={props:["onComplete"],template:`
    <main class="login-shell" role="main" aria-labelledby="setup-title">
      <section class="login-panel" aria-describedby="setup-copy">
        <div class="login-brand" aria-hidden="true"><odin-icon name="brand" :size="30" /></div>
        <p class="login-eyebrow">First-install setup</p>
        <h1 id="setup-title" class="login-title">Odin</h1>
        <p id="setup-copy" class="login-subtitle">Finish initialization with an optional web credential. Discord can be attached now or later.</p>
        <p class="text-xs text-gray-500 mb-4">Setup does not widen the loopback listener. For remote access, set Web authentication, finish setup, sign in as administrator, then explicitly save listener consent in System → Config. An operator restart is required.</p>

        <p class="text-sm text-gray-400 mb-4" role="status" aria-live="polite">{{ statusMessage }}</p>
        <div v-if="error" class="mb-3 text-red-400 text-sm" role="alert">{{ error }}</div>
        <button v-if="completed" @click="onComplete" class="btn btn-primary w-full justify-center mb-4">Continue</button>

        <form v-else @submit.prevent="save" aria-label="Initial setup">
          <label for="setup-web-token" class="text-xs text-gray-400 block mb-1">Web API token</label>
          <input id="setup-web-token" v-model="webApiToken" type="password" class="hm-input mb-3"
                 autocomplete="new-password" placeholder="Set one now, or continue without it" />

          <label for="setup-discord-token" class="text-xs text-gray-400 block mb-1">Discord token <span class="text-gray-500">optional</span></label>
          <input id="setup-discord-token" v-model="discordToken" type="password" class="hm-input mb-2"
                 autocomplete="off" placeholder="Attach Discord now, or leave blank" />
          <p class="text-xs text-gray-500 mb-4">Discord attachment is saved without scheduling a restart.</p>

          <button type="submit" class="btn btn-primary w-full justify-center" :disabled="saving">
            <span v-if="saving" class="spinner" style="width:14px;height:14px;border-width:2px;" aria-hidden="true"></span>
            {{ saving ? 'Saving…' : 'Save setup' }}
          </button>
        </form>

        <div class="mt-5 pt-4 border-t border-gray-700">
          <h2 class="text-sm font-semibold text-gray-300 mb-2">Codex device sign-in</h2>
          <p class="text-xs text-gray-500 mb-3">Optional. You may sign in before or after saving setup.</p>
          <button v-if="!deviceState" @click="startDeviceLogin" class="btn btn-ghost text-xs" :disabled="deviceLoading">
            {{ deviceLoading ? 'Requesting code…' : 'Start device sign-in' }}
          </button>
          <div v-else-if="deviceState === 'pending'" class="p-3 bg-gray-800 rounded border border-gray-700">
            <p class="text-sm text-gray-300 mb-1">Open <a :href="deviceInfo.verify_url" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline">{{ deviceInfo.verify_url }}</a></p>
            <p class="text-sm text-gray-300">Enter code: <code class="bg-gray-900 px-2 py-1 rounded font-bold text-white">{{ deviceInfo.user_code }}</code></p>
            <p class="text-xs text-gray-500 mt-3" role="status" aria-live="polite">Connecting account…</p>
            <button @click="cancelDeviceLogin" class="btn btn-ghost text-xs mt-2">Cancel</button>
          </div>
          <div v-else-if="deviceState === 'ready'" class="p-3 bg-green-900/30 rounded border border-green-800" role="status">
            <p class="text-green-400 text-sm">Device account ready{{ deviceResult.email ? ': ' + deviceResult.email : '' }}.</p>
            <button @click="clearDeviceState" class="btn btn-ghost text-xs mt-2">Done</button>
          </div>
          <div v-else class="p-3 bg-red-900/30 rounded border border-red-800" role="alert">
            <p class="text-red-400 text-sm">{{ deviceError }}</p>
            <button @click="clearDeviceState" class="btn btn-ghost text-xs mt-2">Try again</button>
          </div>
        </div>
      </section>
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,m=null;function h(){return p+=1,m==null||m.abort(),m=null,p}function g(x,w,E){return typeof z.postWithOptions=="function"?z.postWithOptions(x,w,{signal:E}):z.post(x,w)}async function A(){var E,C,_;a.value=!0,i.value="",l.value="Saving setup…";const x={},w=!!s.value.trim();t.value.trim()&&(x.web_api_token=t.value.trim()),s.value.trim()&&(x.discord_token=s.value.trim());try{const R=z.post("/api/setup/complete",x);t.value="",s.value="";const U=await R,S=((E=U.discord)==null?void 0:E.state)||U.discord_status;if(S==="failed"?(i.value=((C=U.discord)==null?void 0:C.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):S==="connecting"?l.value="Saved. Connecting Discord…":S==="ready"?l.value="Saved. Discord ready.":w?l.value="Saved. Discord token stored; attachment status is pending.":l.value=U.message||"Setup saved. Ready to sign in.",(_=U.restart_required)!=null&&_.length){const P=U.message||`Restart Odin to apply: ${U.restart_required.join(", ")}`;l.value.includes(P)||(l.value+=` ${P}`)}n.value=!0}catch(R){i.value=R.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function I(){const x=h(),w=typeof AbortController=="function"?new AbortController:null;m=w,o.value=!0,u.value="";try{const E=await g("/api/codex/device-code",void 0,w==null?void 0:w.signal);if(x!==p)return;c.value=E,r.value="pending";const C=await g("/api/codex/device-poll",{device_auth_id:E.device_auth_id,user_code:E.user_code,interval:E.interval},w==null?void 0:w.signal);if(x!==p)return;d.value=C||{},r.value="ready"}catch(E){x===p&&(E==null?void 0:E.name)!=="AbortError"&&(u.value=E.message||"Device sign-in failed.",r.value="failed")}finally{x===p&&(o.value=!1,m=null)}}function y(){h(),o.value=!1,b()}function v(){var x;(x=e.onComplete)==null||x.call(e)}function b(){r.value="",c.value=null,d.value={},u.value=""}return gt(()=>{h()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:A,onComplete:v,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:I,cancelDeviceLogin:y,clearDeviceState:b}}},It=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Jv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:d1,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:AT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:Ek,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Pk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:aS,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:RT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:a1,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:It("/operations","live")},{path:"/agents",redirect:It("/operations","agents")},{path:"/loops",redirect:It("/operations","loops")},{path:"/processes",redirect:It("/operations","processes")},{path:"/schedules",redirect:It("/operations","schedules")},{path:"/audit",redirect:It("/history","audit")},{path:"/sessions",redirect:It("/history","sessions")},{path:"/traces",redirect:It("/history","traces")},{path:"/usage",redirect:It("/history","usage")},{path:"/tools",redirect:It("/capabilities","tools")},{path:"/skills",redirect:It("/capabilities","skills")},{path:"/mcp",redirect:It("/capabilities","mcp-servers")},{path:"/knowledge",redirect:It("/capabilities","knowledge")},{path:"/memory",redirect:It("/capabilities","memory")},{path:"/learned",redirect:It("/capabilities","learned")},{path:"/health",redirect:It("/system","health")},{path:"/resources",redirect:It("/system","resources")},{path:"/logs",redirect:It("/system","logs")},{path:"/config",redirect:It("/system","config")},{path:"/host-access",redirect:It("/system","host-access")},{path:"/hosts",redirect:It("/system","hosts")},{path:"/internals",redirect:It("/system","internals")}],ol=ek({history:Lw(),routes:Jv});ol.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const OT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{z.setPersist(n.value),await z.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},LT={template:`
    <div v-if="authState === 'checking'" class="app-loading" role="status" aria-label="Loading">
      <div class="brand-loader"><odin-icon name="brand" :size="28" /></div>
      <span class="sr-only">Loading application...</span>
    </div>
    <setup-page v-else-if="authState === 'setup'" :on-complete="onSetupComplete" />
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let m=null;const h=f("starting"),g=f(""),A=Jv.filter(B=>B.meta),I=j(()=>["Workspace","Operate","Observe","Manage"].map(B=>({name:B,routes:A.filter(Z=>Z.meta.section===B)})).filter(B=>B.routes.length)),y=j(()=>{var B;return((B=ol.currentRoute.value.meta)==null?void 0:B.label)||"Odin"}),v=j(()=>{var B;return((B=ol.currentRoute.value.meta)==null?void 0:B.section)||"Management"}),b=j(()=>{var B;return((B=ol.currentRoute.value.meta)==null?void 0:B.description)||"Management console"});function x(){nt.disconnect(),D&&(clearInterval(D),D=null)}z.onSessionExpired=()=>{t.value=!0,x(),z.setToken(""),e.value="login"};function w(B){var Z;if((B.ctrlKey||B.metaKey)&&B.key.toLowerCase()==="k"){e.value==="ready"&&(B.preventDefault(),jp());return}if(a.value&&B.key==="Tab"){const le=[...((Z=n.value)==null?void 0:Z.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(le.length){const q=le[0],ce=le[le.length-1];if(B.shiftKey&&(document.activeElement===q||!n.value.contains(document.activeElement))){B.preventDefault(),ce.focus();return}if(!B.shiftKey&&(document.activeElement===ce||!n.value.contains(document.activeElement))){B.preventDefault(),q.focus();return}}}if(B.key==="Escape"&&a.value){a.value=!1,B.preventDefault();return}if(B.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(B.target.tagName)){B.preventDefault();const le=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');le&&le.focus()}}function E(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function C(){try{const B=await z.get("/api/setup/status");if(B.mode==="pending"||B.needed===!0)return x(),e.value="setup",!0}catch(B){B==null||B.name}return!1}Qe(async()=>{if(document.addEventListener("keydown",w),o=window.matchMedia("(max-width: 900px)"),E(),o.addEventListener("change",E),await C())return;const B=await z.check();B.ok?(e.value="ready",ae()):B.needsAuth?e.value="login":(e.value="ready",ae())});function _(){t.value=!1,e.value="ready",ae()}async function R(){if(await C())return;const B=await z.check();B.ok?(e.value="ready",ae()):B.needsAuth?e.value="login":(e.value="ready",ae())}async function U(){x(),e.value="login",await z.logout()}function S(){s.value=!s.value}function P(){a.value=!a.value}Ht(a,async B=>{var Z,le;if(B)r=document.activeElement,await Pt(),(le=(Z=n.value)==null?void 0:Z.querySelector(".nav-item"))==null||le.focus();else if(r!=null&&r.isConnected){const q=r;r=null,requestAnimationFrame(()=>q.focus())}});const Y=j(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function W(B,Z="info",le=3e3){p.value={text:B,level:Z},clearTimeout(m),m=setTimeout(()=>{p.value=null},le)}let D=null,O=!1,M=[];function ae(){for(const B of M)B();M=[nt.onStatus(B=>{c.value=B}),nt.onLatencyChange(B=>{u.value=B}),nt.onState((B,Z)=>{d.value=B,B==="connected"?(O&&W("Connection restored","success"),O=!0):B==="reconnecting"&&Z.attempt===1&&W("Connection lost — reconnecting…","warn")})],nt.connect(),ie(),D&&clearInterval(D),D=setInterval(ie,15e3)}async function ie(){try{const B=await z.get("/api/status");h.value=B.status==="online"?"online":"starting";const Z=B.uptime_seconds||0,le=Math.floor(Z/3600),q=Math.floor(Z%3600/60);g.value=`${le}h ${q}m uptime`}catch{h.value="offline",g.value=""}}return gt(()=>{D&&clearInterval(D);for(const B of M)B();M=[],nt.disconnect(),document.removeEventListener("keydown",w),o==null||o.removeEventListener("change",E)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:Y,wsToast:p,botStatus:h,botUptime:g,navRoutes:A,navGroups:I,currentPage:y,currentSection:v,currentDescription:b,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:_,onSetupComplete:R,logout:U,toggleSidebar:S,toggleMobileNavigation:P,openPalette:jp}}},Ka=Do(LT);Ka.component("odin-icon",o1);Ka.component("login-screen",OT);Ka.component("setup-page",IT);Ka.component("toast-container",G_);Ka.component("confirm-host",W_);Ka.component("command-palette",l1);Ka.directive("modal-focus",c1);Ka.use(ol);Ka.mount("#app");
