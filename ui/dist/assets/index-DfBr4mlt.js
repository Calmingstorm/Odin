var sv=Object.defineProperty;var nv=(e,t,s)=>t in e?sv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var dt=(e,t,s)=>nv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class av{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new hl("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new md(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new hl("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new md((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new hl((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof hl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class hl extends Error{constructor(t){super(t),this.name="AuthError"}}class md extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class iv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const r of this._subscriptions)a.send(JSON.stringify({subscribe:r}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let r;try{r=JSON.parse(l.data)}catch{return}const o=r.type;if(o==="pong"){r.ts&&(this._latency=Date.now()-r.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(o==="subscribed"){this._ackSubscription(a,r.channel);return}if(o==="log")for(const c of this._handlers.logs||[])c(r);else if(o==="event")for(const c of this._handlers.events||[])c(r);else if(o==="chat_response"||o==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(r)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const W=new av,Ye=new iv(W);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Es(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ge={},Ha=[],Vt=()=>{},Ba=()=>!1,ya=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),mr=e=>e.startsWith("onUpdate:"),qe=Object.assign,nc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},lv=Object.prototype.hasOwnProperty,st=(e,t)=>lv.call(e,t),Ce=Array.isArray,za=e=>ci(e)==="[object Map]",xa=e=>ci(e)==="[object Set]",vd=e=>ci(e)==="[object Date]",rv=e=>ci(e)==="[object RegExp]",Fe=e=>typeof e=="function",Be=e=>typeof e=="string",es=e=>typeof e=="symbol",et=e=>e!==null&&typeof e=="object",ac=e=>(et(e)||Fe(e))&&Fe(e.then)&&Fe(e.catch),_p=Object.prototype.toString,ci=e=>_p.call(e),ov=e=>ci(e).slice(8,-1),vr=e=>ci(e)==="[object Object]",gr=e=>Be(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,kn=Es(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),cv=Es("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),br=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},dv=/-\w/g,ot=br(e=>e.replace(dv,t=>t.slice(1).toUpperCase())),uv=/\B([A-Z])/g,vs=br(e=>e.replace(uv,"-$1").toLowerCase()),_a=br(e=>e.charAt(0).toUpperCase()+e.slice(1)),ja=br(e=>e?`on${_a(e)}`:""),Ft=(e,t)=>!Object.is(e,t),Va=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},wp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},yr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Bl=e=>{const t=Be(e)?Number(e):NaN;return isNaN(t)?e:t};let gd;const xr=()=>gd||(gd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function pv(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const fv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",hv=Es(fv);function nl(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Be(n)?kp(n):nl(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Be(e)||et(e))return e}const mv=/;(?![^(]*\))/g,vv=/:([^]+)/,gv=/\/\*[^]*?\*\//g;function kp(e){const t={};return e.replace(gv,"").split(mv).forEach(s=>{if(s){const n=s.split(vv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function al(e){let t="";if(Be(e))t=e;else if(Ce(e))for(let s=0;s<e.length;s++){const n=al(e[s]);n&&(t+=n+" ")}else if(et(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function bv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Be(t)&&(e.class=al(t)),s&&(e.style=nl(s)),e}const yv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",xv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",_v="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",wv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",kv=Es(yv),Sv=Es(xv),Tv=Es(_v),Cv=Es(wv),Ev="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Av=Es(Ev);function Sp(e){return!!e||e===""}function Rv(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=En(e[n],t[n]);return s}function En(e,t){if(e===t)return!0;let s=vd(e),n=vd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=es(e),n=es(t),s||n)return e===t;if(s=Ce(e),n=Ce(t),s||n)return s&&n?Rv(e,t):!1;if(s=et(e),n=et(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!En(e[l],t[l]))return!1}}return String(e)===String(t)}function _r(e,t){return e.findIndex(s=>En(s,t))}const Tp=e=>!!(e&&e.__v_isRef===!0),Cp=e=>Be(e)?e:e==null?"":Ce(e)||et(e)&&(e.toString===_p||!Fe(e.toString))?Tp(e)?Cp(e.value):JSON.stringify(e,Ep,2):String(e),Ep=(e,t)=>Tp(t)?Ep(e,t.value):za(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[qr(n,i)+" =>"]=a,s),{})}:xa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>qr(s))}:es(t)?qr(t):et(t)&&!Ce(t)&&!vr(t)?String(t):t,qr=(e,t="")=>{var s;return es(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Iv(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Dt;class ic{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Dt&&(Dt.active?(this.parent=Dt,this.index=(Dt.scopes||(Dt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Dt;try{return Dt=this,t()}finally{Dt=s}}}on(){++this._on===1&&(this.prevScope=Dt,Dt=this)}off(){if(this._on>0&&--this._on===0){if(Dt===this)Dt=this.prevScope;else{let t=Dt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Ov(e){return new ic(e)}function Ap(){return Dt}function Lv(e,t=!1){Dt&&Dt.cleanups.push(e)}let ut;const Gr=new WeakSet;class Bi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Dt&&(Dt.active?Dt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Gr.has(this)&&(Gr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Ip(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,bd(this),Op(this);const t=ut,s=js;ut=this,js=!0;try{return this.fn()}finally{Lp(this),ut=t,js=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)oc(t);this.deps=this.depsTail=void 0,bd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Gr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){wo(this)&&this.run()}get dirty(){return wo(this)}}let Rp=0,Ai,Ri;function Ip(e,t=!1){if(e.flags|=8,t){e.next=Ri,Ri=e;return}e.next=Ai,Ai=e}function lc(){Rp++}function rc(){if(--Rp>0)return;if(Ri){let t=Ri;for(Ri=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Ai;){let t=Ai;for(Ai=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Op(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Lp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),oc(n),Nv(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function wo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Np(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Np(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Ui)||(e.globalVersion=Ui,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!wo(e))))return;e.flags|=2;const t=e.dep,s=ut,n=js;ut=e,js=!0;try{Op(e);const a=e.fn(e._value);(t.version===0||Ft(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ut=s,js=n,Lp(e),e.flags&=-3}}function oc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)oc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Nv(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Dv(e,t){e.effect instanceof Bi&&(e=e.effect.fn);const s=new Bi(e);t&&qe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Pv(e){e.effect.stop()}let js=!0;const Dp=[];function An(){Dp.push(js),js=!1}function Rn(){const e=Dp.pop();js=e===void 0?!0:e}function bd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ut;ut=void 0;try{t()}finally{ut=s}}}let Ui=0;class Mv{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class wr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ut||!js||ut===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ut)s=this.activeLink=new Mv(ut,this),ut.deps?(s.prevDep=ut.depsTail,ut.depsTail.nextDep=s,ut.depsTail=s):ut.deps=ut.depsTail=s,Pp(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ut.depsTail,s.nextDep=void 0,ut.depsTail.nextDep=s,ut.depsTail=s,ut.deps===s&&(ut.deps=n)}return s}trigger(t){this.version++,Ui++,this.notify(t)}notify(t){lc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{rc()}}}function Pp(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Pp(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Ul=new WeakMap,da=Symbol(""),ko=Symbol(""),Hi=Symbol("");function Jt(e,t,s){if(js&&ut){let n=Ul.get(e);n||Ul.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new wr),a.map=n,a.key=s),a.track()}}function bn(e,t,s,n,a,i){const l=Ul.get(e);if(!l){Ui++;return}const r=o=>{o&&o.trigger()};if(lc(),t==="clear")l.forEach(r);else{const o=Ce(e),c=o&&gr(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Hi||!es(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Hi)),t){case"add":o?c&&r(l.get("length")):(r(l.get(da)),za(e)&&r(l.get(ko)));break;case"delete":o||(r(l.get(da)),za(e)&&r(l.get(ko)));break;case"set":za(e)&&r(l.get(da));break}}rc()}function Fv(e,t){const s=Ul.get(e);return s&&s.get(t)}function Ra(e){const t=Je(e);return t===e?t:(Jt(t,"iterate",Hi),bs(e)?t:t.map(qs))}function kr(e){return Jt(e=Je(e),"iterate",Hi),e}function en(e,t){return sn(e)?Ya(Sn(e)?qs(t):t):qs(t)}const $v={__proto__:null,[Symbol.iterator](){return Kr(this,Symbol.iterator,e=>en(this,e))},concat(...e){return Ra(this).concat(...e.map(t=>Ce(t)?Ra(t):t))},entries(){return Kr(this,"entries",e=>(e[1]=en(this,e[1]),e))},every(e,t){return dn(this,"every",e,t,void 0,arguments)},filter(e,t){return dn(this,"filter",e,t,s=>s.map(n=>en(this,n)),arguments)},find(e,t){return dn(this,"find",e,t,s=>en(this,s),arguments)},findIndex(e,t){return dn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return dn(this,"findLast",e,t,s=>en(this,s),arguments)},findLastIndex(e,t){return dn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return dn(this,"forEach",e,t,void 0,arguments)},includes(...e){return Wr(this,"includes",e)},indexOf(...e){return Wr(this,"indexOf",e)},join(e){return Ra(this).join(e)},lastIndexOf(...e){return Wr(this,"lastIndexOf",e)},map(e,t){return dn(this,"map",e,t,void 0,arguments)},pop(){return fi(this,"pop")},push(...e){return fi(this,"push",e)},reduce(e,...t){return yd(this,"reduce",e,t)},reduceRight(e,...t){return yd(this,"reduceRight",e,t)},shift(){return fi(this,"shift")},some(e,t){return dn(this,"some",e,t,void 0,arguments)},splice(...e){return fi(this,"splice",e)},toReversed(){return Ra(this).toReversed()},toSorted(e){return Ra(this).toSorted(e)},toSpliced(...e){return Ra(this).toSpliced(...e)},unshift(...e){return fi(this,"unshift",e)},values(){return Kr(this,"values",e=>en(this,e))}};function Kr(e,t,s){const n=kr(e),a=n[t]();return n!==e&&!bs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Bv=Array.prototype;function dn(e,t,s,n,a,i){const l=kr(e),r=l!==e&&!bs(e),o=l[t];if(o!==Bv[t]){const u=o.apply(e,i);return r?qs(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,en(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function yd(e,t,s,n){const a=kr(e),i=a!==e&&!bs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=en(e,c)),s.call(this,c,en(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?en(e,o):o}function Wr(e,t,s){const n=Je(e);Jt(n,"iterate",Hi);const a=n[t](...s);return(a===-1||a===!1)&&il(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function fi(e,t,s=[]){An(),lc();const n=Je(e)[t].apply(e,s);return rc(),Rn(),n}const Uv=Es("__proto__,__v_isRef,__isVue"),Mp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(es));function Hv(e){es(e)||(e=String(e));const t=Je(this);return Jt(t,"has",e),t.hasOwnProperty(e)}class Fp{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?jp:zp:i?Hp:Up).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ce(t);if(!a){let o;if(l&&(o=$v[s]))return o;if(s==="hasOwnProperty")return Hv}const r=Reflect.get(t,s,It(t)?t:n);if((es(s)?Mp.has(s):Uv(s))||(a||Jt(t,"get",s),i))return r;if(It(r)){const o=l&&gr(s)?r:r.value;return a&&et(o)?Hl(o):o}return et(r)?a?Hl(r):Zn(r):r}}class $p extends Fp{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ce(t)&&gr(s);if(!this._isShallow){const c=sn(i);if(!bs(n)&&!sn(n)&&(i=Je(i),n=Je(n)),!l&&It(i)&&!It(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:st(t,s),o=Reflect.set(t,s,n,It(t)?t:a);return t===Je(a)&&(r?Ft(n,i)&&bn(t,"set",s,n):bn(t,"add",s,n)),o}deleteProperty(t,s){const n=st(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&bn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!es(s)||!Mp.has(s))&&Jt(t,"has",s),n}ownKeys(t){return Jt(t,"iterate",Ce(t)?"length":da),Reflect.ownKeys(t)}}class Bp extends Fp{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const zv=new $p,jv=new Bp,Vv=new $p(!0),qv=new Bp(!0),So=e=>e,ml=e=>Reflect.getPrototypeOf(e);function Gv(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=za(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?So:t?Ya:qs;return!t&&Jt(i,"iterate",o?ko:da),qe(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function vl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Kv(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),r=Je(a);e||(Ft(a,r)&&Jt(l,"get",a),Jt(l,"get",r));const{has:o}=ml(l),c=t?So:e?Ya:qs;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Jt(Je(a),"iterate",da),a.size},has(a){const i=this.__v_raw,l=Je(i),r=Je(a);return e||(Ft(a,r)&&Jt(l,"has",a),Jt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Je(r),c=t?So:e?Ya:qs;return!e&&Jt(o,"iterate",da),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return qe(s,e?{add:vl("add"),set:vl("set"),delete:vl("delete"),clear:vl("clear")}:{add(a){const i=Je(this),l=ml(i),r=Je(a),o=!t&&!bs(a)&&!sn(a)?r:a;return l.has.call(i,o)||Ft(a,o)&&l.has.call(i,a)||Ft(r,o)&&l.has.call(i,r)||(i.add(o),bn(i,"add",o,o)),this},set(a,i){!t&&!bs(i)&&!sn(i)&&(i=Je(i));const l=Je(this),{has:r,get:o}=ml(l);let c=r.call(l,a);c||(a=Je(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Ft(i,d)&&bn(l,"set",a,i):bn(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:r}=ml(i);let o=l.call(i,a);o||(a=Je(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&bn(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&bn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Gv(a,e,t)}),s}function Sr(e,t){const s=Kv(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(st(s,a)&&a in n?s:n,a,i)}const Wv={get:Sr(!1,!1)},Zv={get:Sr(!1,!0)},Jv={get:Sr(!0,!1)},Yv={get:Sr(!0,!0)},Up=new WeakMap,Hp=new WeakMap,zp=new WeakMap,jp=new WeakMap;function Qv(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Zn(e){return sn(e)?e:Tr(e,!1,zv,Wv,Up)}function cc(e){return Tr(e,!1,Vv,Zv,Hp)}function Hl(e){return Tr(e,!0,jv,Jv,zp)}function Xv(e){return Tr(e,!0,qv,Yv,jp)}function Tr(e,t,s,n,a){if(!et(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Qv(ov(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function Sn(e){return sn(e)?Sn(e.__v_raw):!!(e&&e.__v_isReactive)}function sn(e){return!!(e&&e.__v_isReadonly)}function bs(e){return!!(e&&e.__v_isShallow)}function il(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function Vp(e){return!st(e,"__v_skip")&&Object.isExtensible(e)&&wp(e,"__v_skip",!0),e}const qs=e=>et(e)?Zn(e):e,Ya=e=>et(e)?Hl(e):e;function It(e){return e?e.__v_isRef===!0:!1}function f(e){return qp(e,!1)}function dc(e){return qp(e,!0)}function qp(e,t){return It(e)?e:new eg(e,t)}class eg{constructor(t,s){this.dep=new wr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:qs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||bs(t)||sn(t);t=n?t:Je(t),Ft(t,s)&&(this._rawValue=t,this._value=n?t:qs(t),this.dep.trigger())}}function tg(e){e.dep&&e.dep.trigger()}function tn(e){return It(e)?e.value:e}function sg(e){return Fe(e)?e():tn(e)}const ng={get:(e,t,s)=>t==="__v_raw"?e:tn(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return It(a)&&!It(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function uc(e){return Sn(e)?e:new Proxy(e,ng)}class ag{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new wr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Gp(e){return new ag(e)}function ig(e){const t=Ce(e)?new Array(e.length):{};for(const s in e)t[s]=Kp(e,s);return t}class lg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=es(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!Ce(t)||es(this._key)||!gr(this._key))do a=!il(i)||bs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=tn(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&It(this._raw[this._key])){const s=this._object[this._key];if(It(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Fv(this._raw,this._key)}}class rg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function og(e,t,s){return It(e)?e:Fe(e)?new rg(e):et(e)&&arguments.length>1?Kp(e,t,s):f(e)}function Kp(e,t,s){return new lg(e,t,s)}class cg{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new wr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Ui-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ut!==this)return Ip(this,!0),!0}get value(){const t=this.dep.track();return Np(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function dg(e,t,s=!1){let n,a;return Fe(e)?n=e:(n=e.get,a=e.set),new cg(n,a,s)}const ug={GET:"get",HAS:"has",ITERATE:"iterate"},pg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},gl={},zl=new WeakMap;let zn;function fg(){return zn}function Wp(e,t=!1,s=zn){if(s){let n=zl.get(s);n||zl.set(s,n=[]),n.push(e)}}function hg(e,t,s=Ge){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=b=>a?b:bs(b)||a===!1||a===0?yn(b,1):yn(b);let d,u,p,h,m=!1,v=!1;if(It(e)?(u=()=>e.value,m=bs(e)):Sn(e)?(u=()=>c(e),m=!0):Ce(e)?(v=!0,m=e.some(b=>Sn(b)||bs(b)),u=()=>e.map(b=>{if(It(b))return b.value;if(Sn(b))return c(b);if(Fe(b))return o?o(b,2):b()})):Fe(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){An();try{p()}finally{Rn()}}const b=zn;zn=d;try{return o?o(e,3,[h]):e(h)}finally{zn=b}}:u=Vt,t&&a){const b=u,S=a===!0?1/0:a;u=()=>yn(b(),S)}const T=Ap(),I=()=>{d.stop(),T&&T.active&&nc(T.effects,d)};if(i&&t){const b=t;t=(...S)=>{const w=b(...S);return I(),w}}let y=v?new Array(e.length).fill(gl):gl;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const S=d.run();if(b||a||m||(v?S.some((w,E)=>Ft(w,y[E])):Ft(S,y))){p&&p();const w=zn;zn=d;try{const E=[S,y===gl?void 0:v&&y[0]===gl?[]:y,h];y=S,o?o(t,3,E):t(...E)}finally{zn=w}}}else d.run()};return r&&r(g),d=new Bi(u),d.scheduler=l?()=>l(g,!1):g,h=b=>Wp(b,!1,d),p=d.onStop=()=>{const b=zl.get(d);if(b){if(o)o(b,4);else for(const S of b)S();zl.delete(d)}},t?n?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),I.pause=d.pause.bind(d),I.resume=d.resume.bind(d),I.stop=I,I}function yn(e,t=1/0,s){if(t<=0||!et(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,It(e))yn(e.value,t,s);else if(Ce(e))for(let n=0;n<e.length;n++)yn(e[n],t,s);else if(xa(e)||za(e))e.forEach(n=>{yn(n,t,s)});else if(vr(e)){for(const n in e)yn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&yn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Zp=[];function mg(e){Zp.push(e)}function vg(){Zp.pop()}function gg(e,t){}const bg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},yg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function di(e,t,s,n){try{return n?e(...n):e()}catch(a){wa(a,t,s)}}function Cs(e,t,s,n){if(Fe(e)){const a=di(e,t,s,n);return a&&ac(a)&&a.catch(i=>{wa(i,t,s)}),a}if(Ce(e)){const a=[];for(let i=0;i<e.length;i++)a.push(Cs(e[i],t,s,n));return a}}function wa(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ge;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){An(),di(i,null,10,[e,o,c]),Rn();return}}xg(e,s,a,n,l)}function xg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ls=[];let Qs=-1;const qa=[];let jn=null,Pa=0;const Jp=Promise.resolve();let jl=null;function At(e){const t=jl||Jp;return e?t.then(this?e.bind(this):e):t}function _g(e){let t=Qs+1,s=ls.length;for(;t<s;){const n=t+s>>>1,a=ls[n],i=ji(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function pc(e){if(!(e.flags&1)){const t=ji(e),s=ls[ls.length-1];!s||!(e.flags&2)&&t>=ji(s)?ls.push(e):ls.splice(_g(t),0,e),e.flags|=1,Yp()}}function Yp(){jl||(jl=Jp.then(Qp))}function zi(e){Ce(e)?qa.push(...e):jn&&e.id===-1?jn.splice(Pa+1,0,e):e.flags&1||(qa.push(e),e.flags|=1),Yp()}function xd(e,t,s=Qs+1){for(;s<ls.length;s++){const n=ls[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ls.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Vl(e){if(qa.length){const t=[...new Set(qa)].sort((s,n)=>ji(s)-ji(n));if(qa.length=0,jn){jn.push(...t);return}for(jn=t,Pa=0;Pa<jn.length;Pa++){const s=jn[Pa];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}jn=null,Pa=0}}const ji=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Qp(e){try{for(Qs=0;Qs<ls.length;Qs++){const t=ls[Qs];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),di(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Qs<ls.length;Qs++){const t=ls[Qs];t&&(t.flags&=-2)}Qs=-1,ls.length=0,Vl(),jl=null,(ls.length||qa.length)&&Qp()}}let Ma,bl=[];function Xp(e,t){var s,n;Ma=e,Ma?(Ma.enabled=!0,bl.forEach(({event:a,args:i})=>Ma.emit(a,...i)),bl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Xp(i,t)}),setTimeout(()=>{Ma||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,bl=[])},3e3)):bl=[]}let jt=null,Cr=null;function Vi(e){const t=jt;return jt=e,Cr=e&&e.type.__scopeId||null,t}function wg(e){Cr=e}function kg(){Cr=null}const Sg=e=>fc;function fc(e,t=jt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Wi(-1);const i=Vi(t);let l;try{l=e(...a)}finally{Vi(i),n._d&&Wi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Tg(e,t){if(jt===null)return e;const s=cl(jt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Ge]=t[a];i&&(Fe(i)&&(i={mounted:i,updated:i}),i.deep&&yn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Xs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(An(),Cs(o,s,8,[e.el,r,e,t]),Rn())}}function Ii(e,t){if(zt){let s=zt.provides;const n=zt.parent&&zt.parent.provides;n===s&&(s=zt.provides=Object.create(n)),s[e]=t}}function Ds(e,t,s=!1){const n=cs();if(n||ua){let a=ua?ua._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Fe(t)?t.call(n&&n.proxy):t}}function Cg(){return!!(cs()||ua)}const ef=Symbol.for("v-scx"),tf=()=>Ds(ef);function Eg(e,t){return ll(e,null,t)}function Ag(e,t){return ll(e,null,{flush:"post"})}function sf(e,t){return ll(e,null,{flush:"sync"})}function os(e,t,s){return ll(e,t,s)}function ll(e,t,s=Ge){const{immediate:n,deep:a,flush:i,once:l}=s,r=qe({},s),o=t&&n||!t&&i!=="post";let c;if(va){if(i==="sync"){const h=tf();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!o){const h=()=>{};return h.stop=Vt,h.resume=Vt,h.pause=Vt,h}}const d=zt;r.call=(h,m,v)=>Cs(h,d,m,v);let u=!1;i==="post"?r.scheduler=h=>{Et(h,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(h,m)=>{m?h():pc(h)}),r.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=hg(e,t,r);return va&&(c?c.push(p):o&&p()),p}function Rg(e,t,s){const n=this.proxy,a=Be(e)?e.includes(".")?nf(n,e):()=>n[e]:e.bind(n,n);let i;Fe(t)?i=t:(i=t.handler,s=t);const l=ui(this),r=ll(a,i.bind(n),s);return l(),r}function nf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Un=new WeakMap,af=Symbol("_vte"),lf=e=>e.__isTeleport,la=e=>e&&(e.disabled||e.disabled===""),Ig=e=>e&&(e.defer||e.defer===""),_d=e=>typeof SVGElement<"u"&&e instanceof SVGElement,wd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,To=(e,t)=>{const s=e&&e.to;return Be(s)?t?t(s):null:s},Og={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:T,parentNode:I}}=c,y=la(t.props);let{dynamicChildren:g}=t;const b=(E,C,x)=>{E.shapeFlag&16&&d(E.children,C,x,a,i,l,r,o)},S=(E=t)=>{const C=la(E.props),x=E.target=To(E.props,m),D=Co(x,E,v,h);x&&(l!=="svg"&&_d(x)?l="svg":l!=="mathml"&&wd(x)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(x),C||(b(E,x,D),ki(E,!1)))},w=E=>{const C=()=>{if(Un.get(E)===C){if(Un.delete(E),la(E.props)){const x=I(E.el)||s;b(E,x,E.anchor),ki(E,!0)}S(E)}};Un.set(E,C),Et(C,i)};if(e==null){const E=t.el=v(""),C=t.anchor=v("");if(h(E,s,n),h(C,s,n),Ig(t.props)||i&&i.pendingBranch){w(t);return}y&&(b(t,s,C),ki(t,!0)),S()}else{t.el=e.el;const E=t.anchor=e.anchor,C=Un.get(e);if(C){C.flags|=8,Un.delete(e),w(t);return}t.targetStart=e.targetStart;const x=t.target=e.target,D=t.targetAnchor=e.targetAnchor,A=la(e.props),R=A?s:x,z=A?E:D;if(l==="svg"||_d(x)?l="svg":(l==="mathml"||wd(x))&&(l="mathml"),g?(p(e.dynamicChildren,g,R,a,i,l,r),Sc(e,t,!0)):o||u(e,t,R,z,a,i,l,r,!1),y)A?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):yl(t,s,E,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const V=t.target=To(t.props,m);V&&yl(t,V,null,c,0)}else A&&yl(t,x,D,c,1);ki(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!la(p),m=Un.get(e);if(m&&(m.flags|=8,Un.delete(e)),u&&(a(c),a(d)),i&&a(o),!m&&l&16)for(let v=0;v<r.length;v++){const T=r[v];n(T,t,s,h,!!T.dynamicChildren)}},move:yl,hydrate:Lg};function yl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Un.has(e)&&(!u||la(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function Lg(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(T,I){let y=I;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,T._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(T,I){I.anchor=u(l(T),I,r(T),s,n,a,i)}const m=t.target=To(t.props,o),v=la(t.props);if(m){const T=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,T),t.targetAnchor||Co(m,t,d,c,r(e)===m?e:null)):(t.anchor=l(e),p(m,T),t.targetAnchor||Co(m,t,d,c),u(T&&l(T),t,m,s,n,a,i))),ki(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Ng=Og;function ki(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Co(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[af]=l,e&&(n(i,e,a),n(l,e,a)),l}const Is=Symbol("_leaveCb"),hi=Symbol("_enterCb");function hc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ke(()=>{e.isMounted=!0}),Ir(()=>{e.isUnmounting=!0}),e}const Rs=[Function,Array],mc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Rs,onEnter:Rs,onAfterEnter:Rs,onEnterCancelled:Rs,onBeforeLeave:Rs,onLeave:Rs,onAfterLeave:Rs,onLeaveCancelled:Rs,onBeforeAppear:Rs,onAppear:Rs,onAfterAppear:Rs,onAppearCancelled:Rs},rf=e=>{const t=e.subTree;return t.component?rf(t.component):t},Dg={name:"BaseTransition",props:mc,setup(e,{slots:t}){const s=cs(),n=hc();return()=>{const a=t.default&&Er(t.default(),!0),i=a&&a.length?of(a):s.subTree?Vf():void 0;if(!i)return;const l=Je(e),{mode:r}=l;if(n.isLeaving)return Zr(i);const o=kd(i);if(!o)return Zr(i);let c=Qa(o,l,n,s,u=>c=u);o.type!==Ct&&In(o,c);let d=s.subTree&&kd(s.subTree);if(d&&d.type!==Ct&&!zs(d,o)&&rf(s).type!==Ct){let u=Qa(d,l,n,s);if(In(d,u),r==="out-in"&&o.type!==Ct)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Zr(i);r==="in-out"&&o.type!==Ct?u.delayLeave=(p,h,m)=>{const v=df(n,d);v[String(d.key)]=d,p[Is]=()=>{h(),p[Is]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function of(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Ct){t=s;break}}return t}const cf=Dg;function df(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Qa(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:T,onAppear:I,onAfterAppear:y,onAppearCancelled:g}=t,b=String(e.key),S=df(s,e),w=(x,D)=>{x&&Cs(x,n,9,D)},E=(x,D)=>{const A=D[1];w(x,D),Ce(x)?x.every(R=>R.length<=1)&&A():x.length<=1&&A()},C={mode:l,persisted:r,beforeEnter(x){let D=o;if(!s.isMounted)if(i)D=T||o;else return;x[Is]&&x[Is](!0);const A=S[b];A&&zs(e,A)&&A.el[Is]&&A.el[Is](),w(D,[x])},enter(x){if(S[b]===e)return;let D=c,A=d,R=u;if(!s.isMounted)if(i)D=I||c,A=y||d,R=g||u;else return;let z=!1;x[hi]=le=>{z||(z=!0,le?w(R,[x]):w(A,[x]),C.delayedLeave&&C.delayedLeave(),x[hi]=void 0)};const V=x[hi].bind(null,!1);D?E(D,[x,V]):V()},leave(x,D){const A=String(e.key);if(x[hi]&&x[hi](!0),s.isUnmounting)return D();w(p,[x]);let R=!1;x[Is]=V=>{R||(R=!0,D(),V?w(v,[x]):w(m,[x]),x[Is]=void 0,S[A]===e&&delete S[A])};const z=x[Is].bind(null,!1);S[A]=e,h?E(h,[x,z]):z()},clone(x){const D=Qa(x,t,s,n,a);return a&&a(D),D}};return C}function Zr(e){if(ol(e))return e=nn(e),e.children=null,e}function kd(e){if(!ol(e))return lf(e.type)&&e.children?of(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Fe(s.default))return s.default()}}function In(e,t){e.shapeFlag&6&&e.component?(e.transition=t,In(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Er(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===$t?(l.patchFlag&128&&a++,n=n.concat(Er(l.children,t,r))):(t||l.type!==Ct)&&n.push(r!=null?nn(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function rl(e,t){return Fe(e)?qe({name:e.name},t,{setup:e}):e}function Pg(){const e=cs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function vc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Mg(e){const t=cs(),s=dc(null);if(t){const a=t.refs===Ge?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Sd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const ql=new WeakMap;function Ga(e,t,s,n,a=!1){if(Ce(e)){e.forEach((v,T)=>Ga(v,t&&(Ce(t)?t[T]:t),s,n,a));return}if(Tn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ga(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?cl(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Ge?r.refs={}:r.refs,u=r.setupState,p=Je(u),h=u===Ge?Ba:v=>Sd(d,v)?!1:st(p,v),m=(v,T)=>!(T&&Sd(d,T));if(c!=null&&c!==o){if(Td(t),Be(c))d[c]=null,h(c)&&(u[c]=null);else if(It(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Fe(o))di(o,r,12,[l,d]);else{const v=Be(o),T=It(o);if(v||T){const I=()=>{if(e.f){const y=v?h(o)?u[o]:d[o]:m()||!e.k?o.value:d[e.k];if(a)Ce(y)&&nc(y,i);else if(Ce(y))y.includes(i)||y.push(i);else if(v)d[o]=[i],h(o)&&(u[o]=d[o]);else{const g=[i];m(o,e.k)&&(o.value=g),e.k&&(d[e.k]=g)}}else v?(d[o]=l,h(o)&&(u[o]=l)):T&&(m(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{I(),ql.delete(e)};y.id=-1,ql.set(e,y),Et(y,s)}else Td(e),I()}}}function Td(e){const t=ql.get(e);t&&(t.flags|=8,ql.delete(e))}let Cd=!1;const Ia=()=>{Cd||(console.error("Hydration completed but contains mismatches."),Cd=!0)},Fg=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",$g=e=>e.namespaceURI.includes("MathML"),xl=e=>{if(e.nodeType===1){if(Fg(e))return"svg";if($g(e))return"mathml"}},Ua=e=>e.nodeType===8;function Bg(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),Vl(),b._vnode=g;return}u(b.firstChild,g,null,null,null),Vl(),b._vnode=g},u=(g,b,S,w,E,C=!1)=>{C=C||!!b.dynamicChildren;const x=Ua(g)&&g.data==="[",D=()=>v(g,b,S,w,E,x),{type:A,ref:R,shapeFlag:z,patchFlag:V}=b;let le=g.nodeType;b.el=g,V===-2&&(C=!1,b.dynamicChildren=null);let M=null;switch(A){case Gn:le!==3?b.children===""?(o(b.el=a(""),l(g),g),M=g):M=D():(g.data!==b.children&&(Ia(),g.data=b.children),M=i(g));break;case Ct:y(g)?(M=i(g),I(b.el=g.content.firstChild,g,S)):le!==8||x?M=D():M=i(g);break;case pa:if(x&&(g=i(g),le=g.nodeType),le===1||le===3){M=g;const N=!b.children.length;for(let O=0;O<b.staticCount;O++)N&&(b.children+=M.nodeType===1?M.outerHTML:M.data),O===b.staticCount-1&&(b.anchor=M),M=i(M);return x?i(M):M}else D();break;case $t:x?M=m(g,b,S,w,E,C):M=D();break;default:if(z&1)(le!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?M=D():M=p(g,b,S,w,E,C);else if(z&6){b.slotScopeIds=E;const N=l(g);if(x?M=T(g):Ua(g)&&g.data==="teleport start"?M=T(g,g.data,"teleport end"):M=i(g),t(b,N,null,S,w,xl(N),C),Tn(b)&&!b.type.__asyncResolved){let O;x?(O=vt($t),O.anchor=M?M.previousSibling:N.lastChild):O=g.nodeType===3?Cc(""):vt("div"),O.el=g,b.component.subTree=O}}else z&64?le!==8?M=D():M=b.type.hydrate(g,b,S,w,E,C,e,h):z&128&&(M=b.type.hydrate(g,b,S,w,xl(l(g)),E,C,e,u))}return R!=null&&Ga(R,null,w,b),M},p=(g,b,S,w,E,C)=>{C=C||!!b.dynamicChildren;const{type:x,props:D,patchFlag:A,shapeFlag:R,dirs:z,transition:V}=b,le=x==="input"||x==="option";if(le||A!==-1){z&&Xs(b,null,S,"created");let M=!1;if(y(g)){M=Pf(null,V)&&S&&S.vnode.props&&S.vnode.props.appear;const O=g.content.firstChild;if(M){const B=O.getAttribute("class");B&&(O.$cls=B),V.beforeEnter(O)}I(O,g,S),b.el=g=O}if(R&16&&!(D&&(D.innerHTML||D.textContent))){let O=h(g.firstChild,b,g,S,w,E,C);for(O&&!_l(g,1)&&Ia();O;){const B=O;O=O.nextSibling,r(B)}}else if(R&8){let O=b.children;O[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(O=O.slice(1));const{textContent:B}=g;B!==O&&B!==O.replace(/\r\n|\r/g,`
`)&&(_l(g,0)||Ia(),g.textContent=b.children)}if(D){if(le||!C||A&48){const O=g.tagName.includes("-");for(const B in D)(le&&(B.endsWith("value")||B==="indeterminate")||ya(B)&&!kn(B)||B[0]==="."||O&&!kn(B))&&n(g,B,null,D[B],void 0,S)}else if(D.onClick)n(g,"onClick",null,D.onClick,void 0,S);else if(A&4&&Sn(D.style))for(const O in D.style)D.style[O]}let N;(N=D&&D.onVnodeBeforeMount)&&fs(N,S,b),z&&Xs(b,null,S,"beforeMount"),((N=D&&D.onVnodeMounted)||z||M)&&Bf(()=>{N&&fs(N,S,b),M&&V.enter(g),z&&Xs(b,null,S,"mounted")},w)}return g.nextSibling},h=(g,b,S,w,E,C,x)=>{x=x||!!b.dynamicChildren;const D=b.children,A=D.length;let R=!1;for(let z=0;z<A;z++){const V=x?D[z]:D[z]=ms(D[z]),le=V.type===Gn;g?(le&&!x&&z+1<A&&ms(D[z+1]).type===Gn&&(o(a(g.data.slice(V.children.length)),S,i(g)),g.data=V.children),g=u(g,V,w,E,C,x)):le&&!V.children?o(V.el=a(""),S):(R||(R=!0,_l(S,1)||Ia()),s(null,V,S,null,w,E,xl(S),C))}return g},m=(g,b,S,w,E,C)=>{const{slotScopeIds:x}=b;x&&(E=E?E.concat(x):x);const D=l(g),A=h(i(g),b,D,S,w,E,C);return A&&Ua(A)&&A.data==="]"?i(b.anchor=A):(Ia(),o(b.anchor=c("]"),D,A),A)},v=(g,b,S,w,E,C)=>{if(_l(g.parentElement,1)||Ia(),b.el=null,C){const A=T(g);for(;;){const R=i(g);if(R&&R!==A)r(R);else break}}const x=i(g),D=l(g);return r(g),s(null,b,D,x,S,w,xl(D),E),S&&(S.vnode.el=b.el,Lr(S,b.el)),x},T=(g,b="[",S="]")=>{let w=0;for(;g;)if(g=i(g),g&&Ua(g)&&(g.data===b&&w++,g.data===S)){if(w===0)return i(g);w--}return g},I=(g,b,S)=>{const w=b.parentNode;w&&w.replaceChild(g,b);let E=S;for(;E;)E.vnode.el===b&&(E.vnode.el=E.subTree.el=g),E=E.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const Ed="data-allow-mismatch",Ug={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function _l(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Ed);)e=e.parentElement;const s=e&&e.getAttribute(Ed);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Ug[t])}}const Hg=xr().requestIdleCallback||(e=>setTimeout(e,1)),zg=xr().cancelIdleCallback||(e=>clearTimeout(e)),jg=(e=1e4)=>t=>{const s=Hg(t,{timeout:e});return()=>zg(s)};function Vg(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const qg=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Vg(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Gg=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Kg=(e=[])=>(t,s)=>{Be(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Wg(e,t){if(Ua(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ua(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Tn=e=>!!e.type.__asyncLoader;function Zg(e){Fe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),o)return new Promise((T,I)=>{o(v,()=>T(p()),()=>I(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return rl({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,T){let I=!1;(v.bu||(v.bu=[])).push(()=>I=!0);const y=()=>{I||T()},g=i?()=>{const b=i(y,S=>Wg(m,S));b&&(v.bum||(v.bum=[])).push(b)}:y;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=zt;if(vc(m),d)return()=>wl(d,m);const v=S=>{c=null,wa(S,m,13,!n)};if(r&&m.suspense||va)return h().then(S=>()=>wl(S,m)).catch(S=>(v(S),()=>n?vt(n,{error:S}):null));const T=f(!1),I=f(),y=f(!!a);let g,b;return mt(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),a&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!T.value&&!I.value){const S=new Error(`Async component timed out after ${l}ms.`);v(S),I.value=S}},l)),h().then(()=>{m.isUnmounted||(T.value=!0,m.parent&&ol(m.parent.vnode)&&m.parent.update())}).catch(S=>{if(m.isUnmounted){c=null;return}v(S),I.value=S}),()=>{if(T.value&&d)return wl(d,m);if(I.value&&n)return vt(n,{error:I.value});if(s&&!y.value)return wl(s,m)}}})}function wl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=vt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const ol=e=>e.type.__isKeepAlive,Jg={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=cs(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(y,g,b,S,w)=>{const E=y.component;c(y,g,b,0,r),o(E.vnode,y,g,b,E,r,S,y.slotScopeIds,w),Et(()=>{E.isDeactivated=!1,E.a&&Va(E.a);const C=y.props&&y.props.onVnodeMounted;C&&fs(C,E.parent,y)},r)},n.deactivate=y=>{const g=y.component;Kl(g.m),Kl(g.a),c(y,p,null,1,r),Et(()=>{g.da&&Va(g.da);const b=y.props&&y.props.onVnodeUnmounted;b&&fs(b,g.parent,y),g.isDeactivated=!0},r)};function h(y){Jr(y),d(y,s,r,!0)}function m(y){a.forEach((g,b)=>{const S=Po(Tn(g)?g.type.__asyncResolved||{}:g.type);S&&!y(S)&&v(b)})}function v(y){const g=a.get(y);g&&(!l||!zs(g,l))?h(g):l&&Jr(l),a.delete(y),i.delete(y)}os(()=>[e.include,e.exclude],([y,g])=>{y&&m(b=>Si(y,b)),g&&m(b=>!Si(g,b))},{flush:"post",deep:!0});let T=null;const I=()=>{T!=null&&(Wl(s.subTree.type)?Et(()=>{a.set(T,kl(s.subTree))},s.subTree.suspense):a.set(T,kl(s.subTree)))};return Ke(I),Rr(I),Ir(()=>{a.forEach(y=>{const{subTree:g,suspense:b}=s,S=kl(g);if(y.type===S.type&&y.key===S.key){Jr(S);const w=S.component.da;w&&Et(w,b);return}h(y)})}),()=>{if(T=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!On(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=kl(g);if(b.type===Ct)return l=null,b;const S=b.type,w=Po(Tn(b)?b.type.__asyncResolved||{}:S),{include:E,exclude:C,max:x}=e;if(E&&(!w||!Si(E,w))||C&&w&&Si(C,w))return b.shapeFlag&=-257,l=b,g;const D=b.key==null?S:b.key,A=a.get(D);return b.el&&(b=nn(b),g.shapeFlag&128&&(g.ssContent=b)),T=D,A?(b.el=A.el,b.component=A.component,b.transition&&In(b,b.transition),b.shapeFlag|=512,i.delete(D),i.add(D)):(i.add(D),x&&i.size>parseInt(x,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,Wl(g.type)?g:b}}},Yg=Jg;function Si(e,t){return Ce(e)?e.some(s=>Si(s,t)):Be(e)?e.split(",").includes(t):rv(e)?(e.lastIndex=0,e.test(t)):!1}function us(e,t){uf(e,"a",t)}function ts(e,t){uf(e,"da",t)}function uf(e,t,s=zt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Ar(t,n,s),s){let a=s.parent;for(;a&&a.parent;)ol(a.parent.vnode)&&Qg(n,t,s,a),a=a.parent}}function Qg(e,t,s,n){const a=Ar(t,e,n,!0);mt(()=>{nc(n[t],a)},s)}function Jr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function kl(e){return e.shapeFlag&128?e.ssContent:e}function Ar(e,t,s=zt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{An();const r=ui(s),o=Cs(t,s,e,l);return r(),Rn(),o});return n?a.unshift(i):a.push(i),i}}const Ln=e=>(t,s=zt)=>{(!va||e==="sp")&&Ar(e,(...n)=>t(...n),s)},pf=Ln("bm"),Ke=Ln("m"),gc=Ln("bu"),Rr=Ln("u"),Ir=Ln("bum"),mt=Ln("um"),ff=Ln("sp"),hf=Ln("rtg"),mf=Ln("rtc");function vf(e,t=zt){Ar("ec",e,t)}const bc="components",Xg="directives";function eb(e,t){return yc(bc,e,!0,t)||e}const gf=Symbol.for("v-ndc");function tb(e){return Be(e)?yc(bc,e,!1)||e:e||gf}function sb(e){return yc(Xg,e)}function yc(e,t,s=!0,n=!1){const a=jt||zt;if(a){const i=a.type;if(e===bc){const r=Po(i,!1);if(r&&(r===t||r===ot(t)||r===_a(ot(t))))return i}const l=Ad(a[e]||i[e],t)||Ad(a.appContext[e],t);return!l&&n?i:l}}function Ad(e,t){return e&&(e[t]||e[ot(t)]||e[_a(ot(t))])}function nb(e,t,s,n){let a;const i=s&&s[n],l=Ce(e);if(l||Be(e)){const r=l&&Sn(e);let o=!1,c=!1;r&&(o=!bs(e),c=sn(e),e=kr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?Ya(qs(e[d])):qs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(et(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function ab(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ce(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function ib(e,t,s={},n,a){if(jt.ce||jt.parent&&Tn(jt.parent)&&jt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Ki(),Zl($t,null,[vt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Ki();const l=i&&xc(i(s)),r=s.key||l&&l.key,o=Zl($t,{key:(r&&!es(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function xc(e){return e.some(t=>On(t)?!(t.type===Ct||t.type===$t&&!xc(t.children)):!0)?e:null}function lb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:ja(n)]=e[n];return s}const Eo=e=>e?Kf(e)?cl(e):Eo(e.parent):null,Oi=qe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Eo(e.parent),$root:e=>Eo(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>_c(e),$forceUpdate:e=>e.f||(e.f=()=>{pc(e.update)}),$nextTick:e=>e.n||(e.n=At.bind(e.proxy)),$watch:e=>Rg.bind(e)}),Yr=(e,t)=>e!==Ge&&!e.__isScriptSetup&&st(e,t),Ao={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Yr(n,t))return l[t]=1,n[t];if(a!==Ge&&st(a,t))return l[t]=2,a[t];if(st(i,t))return l[t]=3,i[t];if(s!==Ge&&st(s,t))return l[t]=4,s[t];Ro&&(l[t]=0)}}const c=Oi[t];let d,u;if(c)return t==="$attrs"&&Jt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Ge&&st(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,st(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Yr(a,t)?(a[t]=s,!0):n!==Ge&&st(n,t)?(n[t]=s,!0):st(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Ge&&r[0]!=="$"&&st(e,r)||Yr(t,r)||st(i,r)||st(n,r)||st(Oi,r)||st(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:st(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},rb=qe({},Ao,{get(e,t){if(t!==Symbol.unscopables)return Ao.get(e,t,e)},has(e,t){return t[0]!=="_"&&!hv(t)}});function ob(){return null}function cb(){return null}function db(e){}function ub(e){}function pb(){return null}function fb(){}function hb(e,t){return null}function mb(){return bf().slots}function vb(){return bf().attrs}function bf(e){const t=cs();return t.setupContext||(t.setupContext=Yf(t))}function qi(e){return Ce(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function gb(e,t){const s=qi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ce(a)||Fe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function bb(e,t){return!e||!t?e||t:Ce(e)&&Ce(t)?e.concat(t):qe({},qi(e),qi(t))}function yb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function xb(e){const t=cs(),s=va;let n=e();Zi(),s&&Wa(!1);const a=()=>{ui(t),s&&Wa(!0)},i=()=>{cs()!==t&&t.scope.off(),Zi(),s&&Wa(!1)};return ac(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Ro=!0;function _b(e){const t=_c(e),s=e.proxy,n=e.ctx;Ro=!1,t.beforeCreate&&Rd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:T,beforeDestroy:I,beforeUnmount:y,destroyed:g,unmounted:b,render:S,renderTracked:w,renderTriggered:E,errorCaptured:C,serverPrefetch:x,expose:D,inheritAttrs:A,components:R,directives:z,filters:V}=t;if(c&&wb(c,n,null),l)for(const N in l){const O=l[N];Fe(O)&&(n[N]=O.bind(s))}if(a){const N=a.call(s,s);et(N)&&(e.data=Zn(N))}if(Ro=!0,i)for(const N in i){const O=i[N],B=Fe(O)?O.bind(s,s):Fe(O.get)?O.get.bind(s,s):Vt,G=!Fe(O)&&Fe(O.set)?O.set.bind(s):Vt,q=J({get:B,set:G});Object.defineProperty(n,N,{enumerable:!0,configurable:!0,get:()=>q.value,set:Q=>q.value=Q})}if(r)for(const N in r)yf(r[N],n,s,N);if(o){const N=Fe(o)?o.call(s):o;Reflect.ownKeys(N).forEach(O=>{Ii(O,N[O])})}d&&Rd(d,e,"c");function M(N,O){Ce(O)?O.forEach(B=>N(B.bind(s))):O&&N(O.bind(s))}if(M(pf,u),M(Ke,p),M(gc,h),M(Rr,m),M(us,v),M(ts,T),M(vf,C),M(mf,w),M(hf,E),M(Ir,y),M(mt,b),M(ff,x),Ce(D))if(D.length){const N=e.exposed||(e.exposed={});D.forEach(O=>{Object.defineProperty(N,O,{get:()=>s[O],set:B=>s[O]=B,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===Vt&&(e.render=S),A!=null&&(e.inheritAttrs=A),R&&(e.components=R),z&&(e.directives=z),x&&vc(e)}function wb(e,t,s=Vt){Ce(e)&&(e=Io(e));for(const n in e){const a=e[n];let i;et(a)?"default"in a?i=Ds(a.from||n,a.default,!0):i=Ds(a.from||n):i=Ds(a),It(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Rd(e,t,s){Cs(Ce(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function yf(e,t,s,n){let a=n.includes(".")?nf(s,n):()=>s[n];if(Be(e)){const i=t[e];Fe(i)&&os(a,i)}else if(Fe(e))os(a,e.bind(s));else if(et(e))if(Ce(e))e.forEach(i=>yf(i,t,s,n));else{const i=Fe(e.handler)?e.handler.bind(s):t[e.handler];Fe(i)&&os(a,i,e)}}function _c(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Gl(o,c,l,!0)),Gl(o,t,l)),et(t)&&i.set(t,o),o}function Gl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Gl(e,i,s,!0),a&&a.forEach(l=>Gl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=kb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const kb={data:Id,props:Od,emits:Od,methods:Ti,computed:Ti,beforeCreate:ns,created:ns,beforeMount:ns,mounted:ns,beforeUpdate:ns,updated:ns,beforeDestroy:ns,beforeUnmount:ns,destroyed:ns,unmounted:ns,activated:ns,deactivated:ns,errorCaptured:ns,serverPrefetch:ns,components:Ti,directives:Ti,watch:Tb,provide:Id,inject:Sb};function Id(e,t){return t?e?function(){return qe(Fe(e)?e.call(this,this):e,Fe(t)?t.call(this,this):t)}:t:e}function Sb(e,t){return Ti(Io(e),Io(t))}function Io(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function ns(e,t){return e?[...new Set([].concat(e,t))]:t}function Ti(e,t){return e?qe(Object.create(null),e,t):t}function Od(e,t){return e?Ce(e)&&Ce(t)?[...new Set([...e,...t])]:qe(Object.create(null),qi(e),qi(t??{})):t}function Tb(e,t){if(!e)return t;if(!t)return e;const s=qe(Object.create(null),e);for(const n in t)s[n]=ns(e[n],t[n]);return s}function xf(){return{app:null,config:{isNativeTag:Ba,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Cb=0;function Eb(e,t){return function(n,a=null){Fe(n)||(n=qe({},n)),a!=null&&!et(a)&&(a=null);const i=xf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Cb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Xf,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Fe(d.install)?(l.add(d),d.install(c,...u)):Fe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const h=c._ceVNode||vt(n,a);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),o=!0,c._container=d,d.__vue_app__=c,cl(h.component)}},onUnmount(d){r.push(d)},unmount(){o&&(Cs(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=ua;ua=c;try{return d()}finally{ua=u}}};return c}}let ua=null;function Ab(e,t,s=Ge){const n=cs(),a=ot(t),i=vs(t),l=_f(e,a),r=Gp((o,c)=>{let d,u=Ge,p;return sf(()=>{const h=e[a];Ft(d,h)&&(d=h,c())}),{get(){return o(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!Ft(m,d)&&!(u!==Ge&&Ft(h,u)))return;const v=n.vnode.props,T=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));T||(d=h,c()),n.emit(`update:${t}`,m),Ft(h,u)&&(Ft(h,m)&&!Ft(m,p)||T&&u!==Ge&&!Ft(m,d))&&c(),u=h,p=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Ge:r,done:!1}:{done:!0}}}},r}const _f=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${ot(t)}Modifiers`]||e[`${vs(t)}Modifiers`];function Rb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ge;let a=s;const i=t.startsWith("update:"),l=i&&_f(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Be(d)?d.trim():d)),l.number&&(a=s.map(yr)));let r,o=n[r=ja(t)]||n[r=ja(ot(t))];!o&&i&&(o=n[r=ja(vs(t))]),o&&Cs(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,Cs(c,e,6,a)}}const Ib=new WeakMap;function wf(e,t,s=!1){const n=s?Ib:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Fe(e)){const o=c=>{const d=wf(c,t,!0);d&&(r=!0,qe(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(et(e)&&n.set(e,null),null):(Ce(i)?i.forEach(o=>l[o]=null):qe(l,i),et(e)&&n.set(e,l),l)}function Or(e,t){return!e||!ya(t)?!1:(t=t.slice(2).replace(/Once$/,""),st(e,t[0].toLowerCase()+t.slice(1))||st(e,vs(t))||st(e,t))}function Ll(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,T=Vi(e);let I,y;try{if(s.shapeFlag&4){const b=a||n,S=b;I=ms(c.call(S,b,d,u,h,p,m)),y=r}else{const b=t;I=ms(b.length>1?b(u,{attrs:r,slots:l,emit:o}):b(u,null)),y=t.props?r:Lb(r)}}catch(b){Li.length=0,wa(b,e,1),I=vt(Ct)}let g=I;if(y&&v!==!1){const b=Object.keys(y),{shapeFlag:S}=g;b.length&&S&7&&(i&&b.some(mr)&&(y=Nb(y,i)),g=nn(g,y,!1,!0))}return s.dirs&&(g=nn(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&In(g,s.transition),I=g,Vi(T),I}function Ob(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(On(a)){if(a.type!==Ct||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Lb=e=>{let t;for(const s in e)(s==="class"||s==="style"||ya(s))&&((t||(t={}))[s]=e[s]);return t},Nb=(e,t)=>{const s={};for(const n in e)(!mr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Db(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?Ld(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(kf(l,n,p)&&!Or(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?Ld(n,l,c):!0:!!l;return!1}function Ld(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(kf(t,e,i)&&!Or(s,i))return!0}return!1}function kf(e,t,s){const n=e[s],a=t[s];return s==="style"&&et(n)&&et(a)?!En(n,a):n!==a}function Lr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Sf={},Tf=()=>Object.create(Sf),Cf=e=>Object.getPrototypeOf(e)===Sf;function Pb(e,t,s,n=!1){const a={},i=Tf();e.propsDefaults=Object.create(null),Ef(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:cc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Mb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Je(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Or(e.emitsOptions,p))continue;const h=t[p];if(o)if(st(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=ot(p);a[m]=Oo(o,r,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{Ef(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!st(t,u)&&((d=vs(u))===u||!st(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Oo(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!st(t,u))&&(delete i[u],c=!0)}c&&bn(e.attrs,"set","")}function Ef(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(kn(o))continue;const c=t[o];let d;a&&st(a,d=ot(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:Or(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Je(s),c=r||Ge;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Oo(a,o,u,c[u],e,!st(c,u))}}return l}function Oo(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=st(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Fe(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=ui(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===vs(s))&&(n=!0))}return n}const Fb=new WeakMap;function Af(e,t,s=!1){const n=s?Fb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Fe(e)){const d=u=>{o=!0;const[p,h]=Af(u,t,!0);qe(l,p),h&&r.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return et(e)&&n.set(e,Ha),Ha;if(Ce(i))for(let d=0;d<i.length;d++){const u=ot(i[d]);Nd(u)&&(l[u]=Ge)}else if(i)for(const d in i){const u=ot(d);if(Nd(u)){const p=i[d],h=l[u]=Ce(p)||Fe(p)?{type:p}:qe({},p),m=h.type;let v=!1,T=!0;if(Ce(m))for(let I=0;I<m.length;++I){const y=m[I],g=Fe(y)&&y.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(T=!1)}else v=Fe(m)&&m.name==="Boolean";h[0]=v,h[1]=T,(v||st(h,"default"))&&r.push(u)}}const c=[l,r];return et(e)&&n.set(e,c),c}function Nd(e){return e[0]!=="$"&&!kn(e)}const wc=e=>e==="_"||e==="_ctx"||e==="$stable",kc=e=>Ce(e)?e.map(ms):[ms(e)],$b=(e,t,s)=>{if(t._n)return t;const n=fc((...a)=>kc(t(...a)),s);return n._c=!1,n},Rf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(wc(a))continue;const i=e[a];if(Fe(i))t[a]=$b(a,i,n);else if(i!=null){const l=kc(i);t[a]=()=>l}}},If=(e,t)=>{const s=kc(t);e.slots.default=()=>s},Of=(e,t,s)=>{for(const n in t)(s||!wc(n))&&(e[n]=t[n])},Bb=(e,t,s)=>{const n=e.slots=Tf();if(e.vnode.shapeFlag&32){const a=t._;a?(Of(n,t,s),s&&wp(n,"_",a,!0)):Rf(t,n)}else t&&If(e,t)},Ub=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ge;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:Of(a,t,s):(i=!t.$stable,Rf(t,a)),l=t}else t&&(If(e,t),l={default:1});if(i)for(const r in a)!wc(r)&&l[r]==null&&delete a[r]},Et=Bf;function Lf(e){return Df(e)}function Nf(e){return Df(e,Bg)}function Df(e,t){const s=xr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Vt,insertStaticContent:m}=e,v=(_,P,U,ae=null,te=null,ne=null,fe=void 0,pe=null,de=!!P.dynamicChildren)=>{if(_===P)return;_&&!zs(_,P)&&(ae=Y(_),Q(_,te,ne,!0),_=null),P.patchFlag===-2&&(de=!1,P.dynamicChildren=null);const{type:re,ref:ke,shapeFlag:ge}=P;switch(re){case Gn:T(_,P,U,ae);break;case Ct:I(_,P,U,ae);break;case pa:_==null&&y(P,U,ae,fe);break;case $t:R(_,P,U,ae,te,ne,fe,pe,de);break;default:ge&1?S(_,P,U,ae,te,ne,fe,pe,de):ge&6?z(_,P,U,ae,te,ne,fe,pe,de):(ge&64||ge&128)&&re.process(_,P,U,ae,te,ne,fe,pe,de,oe)}ke!=null&&te?Ga(ke,_&&_.ref,ne,P||_,!P):ke==null&&_&&_.ref!=null&&Ga(_.ref,null,ne,_,!0)},T=(_,P,U,ae)=>{if(_==null)n(P.el=r(P.children),U,ae);else{const te=P.el=_.el;P.children!==_.children&&c(te,P.children)}},I=(_,P,U,ae)=>{_==null?n(P.el=o(P.children||""),U,ae):P.el=_.el},y=(_,P,U,ae)=>{[_.el,_.anchor]=m(_.children,P,U,ae,_.el,_.anchor)},g=({el:_,anchor:P},U,ae)=>{let te;for(;_&&_!==P;)te=p(_),n(_,U,ae),_=te;n(P,U,ae)},b=({el:_,anchor:P})=>{let U;for(;_&&_!==P;)U=p(_),a(_),_=U;a(P)},S=(_,P,U,ae,te,ne,fe,pe,de)=>{if(P.type==="svg"?fe="svg":P.type==="math"&&(fe="mathml"),_==null)w(P,U,ae,te,ne,fe,pe,de);else{const re=_.el&&_.el._isVueCE?_.el:null;try{re&&re._beginPatch(),x(_,P,te,ne,fe,pe,de)}finally{re&&re._endPatch()}}},w=(_,P,U,ae,te,ne,fe,pe)=>{let de,re;const{props:ke,shapeFlag:ge,transition:we,dirs:Ae}=_;if(de=_.el=l(_.type,ne,ke&&ke.is,ke),ge&8?d(de,_.children):ge&16&&C(_.children,de,null,ae,te,Qr(_,ne),fe,pe),Ae&&Xs(_,null,ae,"created"),E(de,_,_.scopeId,fe,ae),ke){for(const me in ke)me!=="value"&&!kn(me)&&i(de,me,null,ke[me],ne,ae);"value"in ke&&i(de,"value",null,ke.value,ne),(re=ke.onVnodeBeforeMount)&&fs(re,ae,_)}Ae&&Xs(_,null,ae,"beforeMount");const F=Pf(te,we);F&&we.beforeEnter(de),n(de,P,U),((re=ke&&ke.onVnodeMounted)||F||Ae)&&Et(()=>{try{re&&fs(re,ae,_),F&&we.enter(de),Ae&&Xs(_,null,ae,"mounted")}finally{}},te)},E=(_,P,U,ae,te)=>{if(U&&h(_,U),ae)for(let ne=0;ne<ae.length;ne++)h(_,ae[ne]);if(te){let ne=te.subTree;if(P===ne||Wl(ne.type)&&(ne.ssContent===P||ne.ssFallback===P)){const fe=te.vnode;E(_,fe,fe.scopeId,fe.slotScopeIds,te.parent)}}},C=(_,P,U,ae,te,ne,fe,pe,de=0)=>{for(let re=de;re<_.length;re++){const ke=_[re]=pe?vn(_[re]):ms(_[re]);v(null,ke,P,U,ae,te,ne,fe,pe)}},x=(_,P,U,ae,te,ne,fe)=>{const pe=P.el=_.el;let{patchFlag:de,dynamicChildren:re,dirs:ke}=P;de|=_.patchFlag&16;const ge=_.props||Ge,we=P.props||Ge;let Ae;if(U&&ta(U,!1),(Ae=we.onVnodeBeforeUpdate)&&fs(Ae,U,P,_),ke&&Xs(P,_,U,"beforeUpdate"),U&&ta(U,!0),(ge.innerHTML&&we.innerHTML==null||ge.textContent&&we.textContent==null)&&d(pe,""),re?D(_.dynamicChildren,re,pe,U,ae,Qr(P,te),ne):fe||O(_,P,pe,null,U,ae,Qr(P,te),ne,!1),de>0){if(de&16)A(pe,ge,we,U,te);else if(de&2&&ge.class!==we.class&&i(pe,"class",null,we.class,te),de&4&&i(pe,"style",ge.style,we.style,te),de&8){const F=P.dynamicProps;for(let me=0;me<F.length;me++){const Se=F[me],Le=ge[Se],De=we[Se];(De!==Le||Se==="value")&&i(pe,Se,Le,De,te,U)}}de&1&&_.children!==P.children&&d(pe,P.children)}else!fe&&re==null&&A(pe,ge,we,U,te);((Ae=we.onVnodeUpdated)||ke)&&Et(()=>{Ae&&fs(Ae,U,P,_),ke&&Xs(P,_,U,"updated")},ae)},D=(_,P,U,ae,te,ne,fe)=>{for(let pe=0;pe<P.length;pe++){const de=_[pe],re=P[pe],ke=de.el&&(de.type===$t||!zs(de,re)||de.shapeFlag&198)?u(de.el):U;v(de,re,ke,null,ae,te,ne,fe,!0)}},A=(_,P,U,ae,te)=>{if(P!==U){if(P!==Ge)for(const ne in P)!kn(ne)&&!(ne in U)&&i(_,ne,P[ne],null,te,ae);for(const ne in U){if(kn(ne))continue;const fe=U[ne],pe=P[ne];fe!==pe&&ne!=="value"&&i(_,ne,pe,fe,te,ae)}"value"in U&&i(_,"value",P.value,U.value,te)}},R=(_,P,U,ae,te,ne,fe,pe,de)=>{const re=P.el=_?_.el:r(""),ke=P.anchor=_?_.anchor:r("");let{patchFlag:ge,dynamicChildren:we,slotScopeIds:Ae}=P;Ae&&(pe=pe?pe.concat(Ae):Ae),_==null?(n(re,U,ae),n(ke,U,ae),C(P.children||[],U,ke,te,ne,fe,pe,de)):ge>0&&ge&64&&we&&_.dynamicChildren&&_.dynamicChildren.length===we.length?(D(_.dynamicChildren,we,U,te,ne,fe,pe),(P.key!=null||te&&P===te.subTree)&&Sc(_,P,!0)):O(_,P,U,ke,te,ne,fe,pe,de)},z=(_,P,U,ae,te,ne,fe,pe,de)=>{P.slotScopeIds=pe,_==null?P.shapeFlag&512?te.ctx.activate(P,U,ae,fe,de):V(P,U,ae,te,ne,fe,de):le(_,P,de)},V=(_,P,U,ae,te,ne,fe)=>{const pe=_.component=Gf(_,ae,te);if(ol(_)&&(pe.ctx.renderer=oe),Wf(pe,!1,fe),pe.asyncDep){if(te&&te.registerDep(pe,M,fe),!_.el){const de=pe.subTree=vt(Ct);I(null,de,P,U),_.placeholder=de.el}}else M(pe,_,P,U,te,ne,fe)},le=(_,P,U)=>{const ae=P.component=_.component;if(Db(_,P,U))if(ae.asyncDep&&!ae.asyncResolved){N(ae,P,U);return}else ae.next=P,ae.update();else P.el=_.el,ae.vnode=P},M=(_,P,U,ae,te,ne,fe)=>{const pe=()=>{if(_.isMounted){let{next:ge,bu:we,u:Ae,parent:F,vnode:me}=_;{const rt=Mf(_);if(rt){ge&&(ge.el=me.el,N(_,ge,fe)),rt.asyncDep.then(()=>{Et(()=>{_.isUnmounted||re()},te)});return}}let Se=ge,Le;ta(_,!1),ge?(ge.el=me.el,N(_,ge,fe)):ge=me,we&&Va(we),(Le=ge.props&&ge.props.onVnodeBeforeUpdate)&&fs(Le,F,ge,me),ta(_,!0);const De=Ll(_),ct=_.subTree;_.subTree=De,v(ct,De,u(ct.el),Y(ct),_,te,ne),ge.el=De.el,Se===null&&Lr(_,De.el),Ae&&Et(Ae,te),(Le=ge.props&&ge.props.onVnodeUpdated)&&Et(()=>fs(Le,F,ge,me),te)}else{let ge;const{el:we,props:Ae}=P,{bm:F,m:me,parent:Se,root:Le,type:De}=_,ct=Tn(P);if(ta(_,!1),F&&Va(F),!ct&&(ge=Ae&&Ae.onVnodeBeforeMount)&&fs(ge,Se,P),ta(_,!0),we&&Oe){const rt=()=>{_.subTree=Ll(_),Oe(we,_.subTree,_,te,null)};ct&&De.__asyncHydrate?De.__asyncHydrate(we,_,rt):rt()}else{Le.ce&&Le.ce._hasShadowRoot()&&Le.ce._injectChildStyle(De,_.parent?_.parent.type:void 0);const rt=_.subTree=Ll(_);v(null,rt,U,ae,_,te,ne),P.el=rt.el}if(me&&Et(me,te),!ct&&(ge=Ae&&Ae.onVnodeMounted)){const rt=P;Et(()=>fs(ge,Se,rt),te)}(P.shapeFlag&256||Se&&Tn(Se.vnode)&&Se.vnode.shapeFlag&256)&&_.a&&Et(_.a,te),_.isMounted=!0,P=U=ae=null}};_.scope.on();const de=_.effect=new Bi(pe);_.scope.off();const re=_.update=de.run.bind(de),ke=_.job=de.runIfDirty.bind(de);ke.i=_,ke.id=_.uid,de.scheduler=()=>pc(ke),ta(_,!0),re()},N=(_,P,U)=>{P.component=_;const ae=_.vnode.props;_.vnode=P,_.next=null,Mb(_,P.props,ae,U),Ub(_,P.children,U),An(),xd(_),Rn()},O=(_,P,U,ae,te,ne,fe,pe,de=!1)=>{const re=_&&_.children,ke=_?_.shapeFlag:0,ge=P.children,{patchFlag:we,shapeFlag:Ae}=P;if(we>0){if(we&128){G(re,ge,U,ae,te,ne,fe,pe,de);return}else if(we&256){B(re,ge,U,ae,te,ne,fe,pe,de);return}}Ae&8?(ke&16&&Pe(re,te,ne),ge!==re&&d(U,ge)):ke&16?Ae&16?G(re,ge,U,ae,te,ne,fe,pe,de):Pe(re,te,ne,!0):(ke&8&&d(U,""),Ae&16&&C(ge,U,ae,te,ne,fe,pe,de))},B=(_,P,U,ae,te,ne,fe,pe,de)=>{_=_||Ha,P=P||Ha;const re=_.length,ke=P.length,ge=Math.min(re,ke);let we;for(we=0;we<ge;we++){const Ae=P[we]=de?vn(P[we]):ms(P[we]);v(_[we],Ae,U,null,te,ne,fe,pe,de)}re>ke?Pe(_,te,ne,!0,!1,ge):C(P,U,ae,te,ne,fe,pe,de,ge)},G=(_,P,U,ae,te,ne,fe,pe,de)=>{let re=0;const ke=P.length;let ge=_.length-1,we=ke-1;for(;re<=ge&&re<=we;){const Ae=_[re],F=P[re]=de?vn(P[re]):ms(P[re]);if(zs(Ae,F))v(Ae,F,U,null,te,ne,fe,pe,de);else break;re++}for(;re<=ge&&re<=we;){const Ae=_[ge],F=P[we]=de?vn(P[we]):ms(P[we]);if(zs(Ae,F))v(Ae,F,U,null,te,ne,fe,pe,de);else break;ge--,we--}if(re>ge){if(re<=we){const Ae=we+1,F=Ae<ke?P[Ae].el:ae;for(;re<=we;)v(null,P[re]=de?vn(P[re]):ms(P[re]),U,F,te,ne,fe,pe,de),re++}}else if(re>we)for(;re<=ge;)Q(_[re],te,ne,!0),re++;else{const Ae=re,F=re,me=new Map;for(re=F;re<=we;re++){const _e=P[re]=de?vn(P[re]):ms(P[re]);_e.key!=null&&me.set(_e.key,re)}let Se,Le=0;const De=we-F+1;let ct=!1,rt=0;const Mt=new Array(De);for(re=0;re<De;re++)Mt[re]=0;for(re=Ae;re<=ge;re++){const _e=_[re];if(Le>=De){Q(_e,te,ne,!0);continue}let Ie;if(_e.key!=null)Ie=me.get(_e.key);else for(Se=F;Se<=we;Se++)if(Mt[Se-F]===0&&zs(_e,P[Se])){Ie=Se;break}Ie===void 0?Q(_e,te,ne,!0):(Mt[Ie-F]=re+1,Ie>=rt?rt=Ie:ct=!0,v(_e,P[Ie],U,null,te,ne,fe,pe,de),Le++)}const se=ct?Hb(Mt):Ha;for(Se=se.length-1,re=De-1;re>=0;re--){const _e=F+re,Ie=P[_e],Ze=P[_e+1],pt=_e+1<ke?Ze.el||Ff(Ze):ae;Mt[re]===0?v(null,Ie,U,pt,te,ne,fe,pe,de):ct&&(Se<0||re!==se[Se]?q(Ie,U,pt,2):Se--)}}},q=(_,P,U,ae,te=null)=>{const{el:ne,type:fe,transition:pe,children:de,shapeFlag:re}=_;if(re&6){q(_.component.subTree,P,U,ae);return}if(re&128){_.suspense.move(P,U,ae);return}if(re&64){fe.move(_,P,U,oe);return}if(fe===$t){n(ne,P,U);for(let ge=0;ge<de.length;ge++)q(de[ge],P,U,ae);n(_.anchor,P,U);return}if(fe===pa){g(_,P,U);return}if(ae!==2&&re&1&&pe)if(ae===0)pe.persisted&&!ne[Is]?n(ne,P,U):(pe.beforeEnter(ne),n(ne,P,U),Et(()=>pe.enter(ne),te));else{const{leave:ge,delayLeave:we,afterLeave:Ae}=pe,F=()=>{_.ctx.isUnmounted?a(ne):n(ne,P,U)},me=()=>{const Se=ne._isLeaving||!!ne[Is];ne._isLeaving&&ne[Is](!0),pe.persisted&&!Se?F():ge(ne,()=>{F(),Ae&&Ae()})};we?we(ne,F,me):me()}else n(ne,P,U)},Q=(_,P,U,ae=!1,te=!1)=>{const{type:ne,props:fe,ref:pe,children:de,dynamicChildren:re,shapeFlag:ke,patchFlag:ge,dirs:we,cacheIndex:Ae,memo:F}=_;if(ge===-2&&(te=!1),pe!=null&&(An(),Ga(pe,null,U,_,!0),Rn()),Ae!=null&&(P.renderCache[Ae]=void 0),ke&256){P.ctx.deactivate(_);return}const me=ke&1&&we,Se=!Tn(_);let Le;if(Se&&(Le=fe&&fe.onVnodeBeforeUnmount)&&fs(Le,P,_),ke&6)ce(_.component,U,ae);else{if(ke&128){_.suspense.unmount(U,ae);return}me&&Xs(_,null,P,"beforeUnmount"),ke&64?_.type.remove(_,P,U,oe,ae):re&&!re.hasOnce&&(ne!==$t||ge>0&&ge&64)?Pe(re,P,U,!1,!0):(ne===$t&&ge&384||!te&&ke&16)&&Pe(de,P,U),ae&&ie(_)}const De=F!=null&&Ae==null;(Se&&(Le=fe&&fe.onVnodeUnmounted)||me||De)&&Et(()=>{Le&&fs(Le,P,_),me&&Xs(_,null,P,"unmounted"),De&&(_.el=null)},U)},ie=_=>{const{type:P,el:U,anchor:ae,transition:te}=_;if(P===$t){X(U,ae);return}if(P===pa){b(_);return}const ne=()=>{a(U),te&&!te.persisted&&te.afterLeave&&te.afterLeave()};if(_.shapeFlag&1&&te&&!te.persisted){const{leave:fe,delayLeave:pe}=te,de=()=>fe(U,ne);pe?pe(_.el,ne,de):de()}else ne()},X=(_,P)=>{let U;for(;_!==P;)U=p(_),a(_),_=U;a(P)},ce=(_,P,U)=>{const{bum:ae,scope:te,job:ne,subTree:fe,um:pe,m:de,a:re}=_;Kl(de),Kl(re),ae&&Va(ae),te.stop(),ne&&(ne.flags|=8,Q(fe,_,P,U)),pe&&Et(pe,P),Et(()=>{_.isUnmounted=!0},P)},Pe=(_,P,U,ae=!1,te=!1,ne=0)=>{for(let fe=ne;fe<_.length;fe++)Q(_[fe],P,U,ae,te)},Y=_=>{if(_.shapeFlag&6)return Y(_.component.subTree);if(_.shapeFlag&128)return _.suspense.next();const P=p(_.anchor||_.el),U=P&&P[af];return U?p(U):P};let be=!1;const H=(_,P,U)=>{let ae;_==null?P._vnode&&(Q(P._vnode,null,null,!0),ae=P._vnode.component):v(P._vnode||null,_,P,null,null,null,U),P._vnode=_,be||(be=!0,xd(ae),Vl(),be=!1)},oe={p:v,um:Q,m:q,r:ie,mt:V,mc:C,pc:O,pbc:D,n:Y,o:e};let ue,Oe;return t&&([ue,Oe]=t(oe)),{render:H,hydrate:ue,createApp:Eb(H,ue)}}function Qr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function ta({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Pf(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Sc(e,t,s=!1){const n=e.children,a=t.children;if(Ce(n)&&Ce(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=vn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&Sc(l,r)),r.type===Gn&&(r.patchFlag===-1&&(r=a[i]=vn(r)),r.el=l.el),r.type===Ct&&!r.el&&(r.el=l.el)}}function Hb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Mf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Mf(t)}function Kl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Ff(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Ff(t.subTree):null}const Wl=e=>e.__isSuspense;let Lo=0;const zb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Vb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}qb(e,t,s,n,a,l,r,o,c)}},hydrate:Gb,normalize:Kb},jb=zb;function Gi(e,t){const s=e.props&&e.props[t];Fe(s)&&s()}function Vb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=$f(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Gi(e,"onPending"),Gi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Ka(p,e.ssFallback)):p.resolve(!1,!0)}function qb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:T,isHydrating:I}=u;if(v)u.pendingBranch=p,zs(v,p)?(o(v,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():T&&(I||(o(m,h,s,n,a,null,i,l,r),Ka(u,h)))):(u.pendingId=Lo++,I?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),T?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(m,h,s,n,a,null,i,l,r),Ka(u,h))):m&&zs(m,p)?(o(m,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(m&&zs(m,p))o(m,p,s,n,a,u,i,l,r),Ka(u,p);else if(Gi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Lo++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},y):y===0&&u.fallback(h)}}function $f(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:T}}=c;let I;const y=Wb(e);y&&t&&t.pendingBranch&&(I=t.pendingId,t.deps++);const g=e.props?Bl(e.props.timeout):void 0,b=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Lo++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(w=!1,E=!1){const{vnode:C,activeBranch:x,pendingBranch:D,pendingId:A,effects:R,parentComponent:z,container:V,isInFallback:le}=S;let M=!1;if(S.isHydrating)S.isHydrating=!1;else if(!w){M=x&&D.transition&&D.transition.mode==="out-in";let B=!1;M&&(x.transition.afterLeave=()=>{A===S.pendingId&&(p(D,V,i===b&&!B?m(x):i,0),zi(R),le&&C.ssFallback&&(C.ssFallback.el=null))}),x&&!S.isFallbackMountPending&&(v(x.el)===V&&(i=m(x),B=!0),h(x,z,S,!0),!M&&le&&C.ssFallback&&Et(()=>C.ssFallback.el=null,S)),M||p(D,V,i,0)}S.isFallbackMountPending=!1,Ka(S,D),S.pendingBranch=null,S.isInFallback=!1;let N=S.parent,O=!1;for(;N;){if(N.pendingBranch){N.effects.push(...R),O=!0;break}N=N.parent}!O&&!M&&zi(R),S.effects=[],y&&t&&t.pendingBranch&&I===t.pendingId&&(t.deps--,t.deps===0&&!E&&t.resolve()),Gi(C,"onResolve")},fallback(w){if(!S.pendingBranch)return;const{vnode:E,activeBranch:C,parentComponent:x,container:D,namespace:A}=S;Gi(E,"onFallback");const R=m(C),z=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,w,D,R,x,null,A,r,o),Ka(S,w))},V=w.transition&&w.transition.mode==="out-in";V&&(S.isFallbackMountPending=!0,C.transition.afterLeave=z),S.isInFallback=!0,h(C,x,null,!0),V||z()},move(w,E,C){S.activeBranch&&p(S.activeBranch,w,E,C),S.container=w},next(){return S.activeBranch&&m(S.activeBranch)},registerDep(w,E,C){const x=!!S.pendingBranch;x&&S.deps++;const D=w.vnode.el;w.asyncDep.catch(A=>{wa(A,w,0)}).then(A=>{if(w.isUnmounted||S.isUnmounted||S.pendingId!==w.suspenseId)return;Zi(),w.asyncResolved=!0;const{vnode:R}=w;No(w,A,!1),D&&(R.el=D);const z=!D&&w.subTree.el;E(w,R,v(D||w.subTree.el),D?null:m(w.subTree),S,l,C),z&&(R.placeholder=null,T(z)),Lr(w,R.el),x&&--S.deps===0&&S.resolve()})},unmount(w,E){S.isUnmounted=!0,S.activeBranch&&h(S.activeBranch,s,w,E),S.pendingBranch&&h(S.pendingBranch,s,w,E)}};return S}function Gb(e,t,s,n,a,i,l,r,o){const c=t.suspense=$f(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Kb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Dd(n?s.default:s),e.ssFallback=n?Dd(s.fallback):vt(Ct)}function Dd(e){let t;if(Fe(e)){const s=ma&&e._c;s&&(e._d=!1,Ki()),e=e(),s&&(e._d=!0,t=Yt,Uf())}return Ce(e)&&(e=Ob(e)),e=ms(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Bf(e,t){t&&t.pendingBranch?Ce(e)?t.effects.push(...e):t.effects.push(e):zi(e)}function Ka(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Lr(n,a))}function Wb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const $t=Symbol.for("v-fgt"),Gn=Symbol.for("v-txt"),Ct=Symbol.for("v-cmt"),pa=Symbol.for("v-stc"),Li=[];let Yt=null;function Ki(e=!1){Li.push(Yt=e?null:[])}function Uf(){Li.pop(),Yt=Li[Li.length-1]||null}let ma=1;function Wi(e,t=!1){ma+=e,e<0&&Yt&&t&&(Yt.hasOnce=!0)}function Hf(e){return e.dynamicChildren=ma>0?Yt||Ha:null,Uf(),ma>0&&Yt&&Yt.push(e),e}function Zb(e,t,s,n,a,i){return Hf(Tc(e,t,s,n,a,i,!0))}function Zl(e,t,s,n,a){return Hf(vt(e,t,s,n,a,!0))}function On(e){return e?e.__v_isVNode===!0:!1}function zs(e,t){return e.type===t.type&&e.key===t.key}function Jb(e){}const zf=({key:e})=>e??null,Nl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Be(e)||It(e)||Fe(e)?{i:jt,r:e,k:t,f:!!s}:e:null);function Tc(e,t=null,s=null,n=0,a=null,i=e===$t?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&zf(t),ref:t&&Nl(t),scopeId:Cr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:jt};return r?(Ec(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Be(s)?8:16),ma>0&&!l&&Yt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Yt.push(o),o}const vt=Yb;function Yb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===gf)&&(e=Ct),On(e)){const r=nn(e,t,!0);return s&&Ec(r,s),ma>0&&!i&&Yt&&(r.shapeFlag&6?Yt[Yt.indexOf(e)]=r:Yt.push(r)),r.patchFlag=-2,r}if(ay(e)&&(e=e.__vccOpts),t){t=jf(t);let{class:r,style:o}=t;r&&!Be(r)&&(t.class=al(r)),et(o)&&(il(o)&&!Ce(o)&&(o=qe({},o)),t.style=nl(o))}const l=Be(e)?1:Wl(e)?128:lf(e)?64:et(e)?4:Fe(e)?2:0;return Tc(e,t,s,n,a,l,i,!0)}function jf(e){return e?il(e)||Cf(e)?qe({},e):e:null}function nn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?qf(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&zf(c),ref:t&&t.ref?s&&i?Ce(i)?i.concat(Nl(t)):[i,Nl(t)]:Nl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==$t?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&nn(e.ssContent),ssFallback:e.ssFallback&&nn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&In(d,o.clone(d)),d}function Cc(e=" ",t=0){return vt(Gn,null,e,t)}function Qb(e,t){const s=vt(pa,null,e);return s.staticCount=t,s}function Vf(e="",t=!1){return t?(Ki(),Zl(Ct,null,e)):vt(Ct,null,e)}function ms(e){return e==null||typeof e=="boolean"?vt(Ct):Ce(e)?vt($t,null,e.slice()):On(e)?vn(e):vt(Gn,null,String(e))}function vn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:nn(e)}function Ec(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ce(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Ec(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Cf(t)?t._ctx=jt:a===3&&jt&&(jt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Fe(t)?(t={default:t,_ctx:jt},s=32):(t=String(t),n&64?(s=16,t=[Cc(t)]):s=8);e.children=t,e.shapeFlag|=s}function qf(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=al([t.class,n.class]));else if(a==="style")t.style=nl([t.style,n.style]);else if(ya(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ce(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!mr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function fs(e,t,s,n=null){Cs(e,t,7,[s,n])}const Xb=xf();let ey=0;function Gf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Xb,i={uid:ey++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new ic(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Af(n,a),emitsOptions:wf(n,a),emit:null,emitted:null,propsDefaults:Ge,inheritAttrs:n.inheritAttrs,ctx:Ge,data:Ge,props:Ge,attrs:Ge,slots:Ge,refs:Ge,setupState:Ge,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Rb.bind(null,i),e.ce&&e.ce(i),i}let zt=null;const cs=()=>zt||jt;let Jl,Wa;{const e=xr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Jl=t("__VUE_INSTANCE_SETTERS__",s=>zt=s),Wa=t("__VUE_SSR_SETTERS__",s=>va=s)}const ui=e=>{const t=zt;return Jl(e),e.scope.on(),()=>{e.scope.off(),Jl(t)}},Zi=()=>{zt&&zt.scope.off(),Jl(null)};function Kf(e){return e.vnode.shapeFlag&4}let va=!1;function Wf(e,t=!1,s=!1){t&&Wa(t);const{props:n,children:a}=e.vnode,i=Kf(e);Pb(e,n,i,t),Bb(e,a,s||t);const l=i?ty(e,t):void 0;return t&&Wa(!1),l}function ty(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Ao);const{setup:n}=s;if(n){An();const a=e.setupContext=n.length>1?Yf(e):null,i=ui(e),l=di(n,e,0,[e.props,a]),r=ac(l);if(Rn(),i(),(r||e.sp)&&!Tn(e)&&vc(e),r){if(l.then(Zi,Zi),t)return l.then(o=>{No(e,o,t)}).catch(o=>{wa(o,e,0)});e.asyncDep=l}else No(e,l,t)}else Jf(e,t)}function No(e,t,s){Fe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:et(t)&&(e.setupState=uc(t)),Jf(e,s)}let Yl,Do;function Zf(e){Yl=e,Do=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,rb))}}const sy=()=>!Yl;function Jf(e,t,s){const n=e.type;if(!e.render){if(!t&&Yl&&!n.render){const a=n.template||_c(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=qe(qe({isCustomElement:i,delimiters:r},l),o);n.render=Yl(a,c)}}e.render=n.render||Vt,Do&&Do(e)}{const a=ui(e);An();try{_b(e)}finally{Rn(),a()}}}const ny={get(e,t){return Jt(e,"get",""),e[t]}};function Yf(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,ny),slots:e.slots,emit:e.emit,expose:t}}function cl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(uc(Vp(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Oi)return Oi[s](e)},has(t,s){return s in t||s in Oi}})):e.proxy}function Po(e,t=!0){return Fe(e)?e.displayName||e.name:e.name||t&&e.__name}function ay(e){return Fe(e)&&"__vccOpts"in e}const J=(e,t)=>dg(e,t,va);function Xa(e,t,s){try{Wi(-1);const n=arguments.length;return n===2?et(t)&&!Ce(t)?On(t)?vt(e,null,[t]):vt(e,t):vt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&On(s)&&(s=[s]),vt(e,t,s))}finally{Wi(1)}}function iy(){}function ly(e,t,s,n){const a=s[n];if(a&&Qf(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Qf(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Ft(s[n],t[n]))return!1;return ma>0&&Yt&&Yt.push(e),!0}const Xf="3.5.38",ry=Vt,oy=yg,cy=Ma,dy=Xp,uy={createComponentInstance:Gf,setupComponent:Wf,renderComponentRoot:Ll,setCurrentRenderingInstance:Vi,isVNode:On,normalizeVNode:ms,getComponentPublicInstance:cl,ensureValidVNode:xc,pushWarningContext:mg,popWarningContext:vg},py=uy,fy=null,hy=null,my=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Mo;const Pd=typeof window<"u"&&window.trustedTypes;if(Pd)try{Mo=Pd.createPolicy("vue",{createHTML:e=>e})}catch{}const eh=Mo?e=>Mo.createHTML(e):e=>e,vy="http://www.w3.org/2000/svg",gy="http://www.w3.org/1998/Math/MathML",mn=typeof document<"u"?document:null,Md=mn&&mn.createElement("template"),th={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?mn.createElementNS(vy,e):t==="mathml"?mn.createElementNS(gy,e):s?mn.createElement(e,{is:s}):mn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>mn.createTextNode(e),createComment:e=>mn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>mn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Md.innerHTML=eh(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Md.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Fn="transition",mi="animation",ei=Symbol("_vtc"),sh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},nh=qe({},mc,sh),by=e=>(e.displayName="Transition",e.props=nh,e),yy=by((e,{slots:t})=>Xa(cf,ah(e),t)),sa=(e,t=[])=>{Ce(e)?e.forEach(s=>s(...t)):e&&e(...t)},Fd=e=>e?Ce(e)?e.some(t=>t.length>1):e.length>1:!1;function ah(e){const t={};for(const R in e)R in sh||(t[R]=e[R]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=xy(a),v=m&&m[0],T=m&&m[1],{onBeforeEnter:I,onEnter:y,onEnterCancelled:g,onLeave:b,onLeaveCancelled:S,onBeforeAppear:w=I,onAppear:E=y,onAppearCancelled:C=g}=t,x=(R,z,V,le)=>{R._enterCancelled=le,Hn(R,z?d:r),Hn(R,z?c:l),V&&V()},D=(R,z)=>{R._isLeaving=!1,Hn(R,u),Hn(R,h),Hn(R,p),z&&z()},A=R=>(z,V)=>{const le=R?E:y,M=()=>x(z,R,V);sa(le,[z,M]),$d(()=>{Hn(z,R?o:i),Zs(z,R?d:r),Fd(le)||Bd(z,n,v,M)})};return qe(t,{onBeforeEnter(R){sa(I,[R]),Zs(R,i),Zs(R,l)},onBeforeAppear(R){sa(w,[R]),Zs(R,o),Zs(R,c)},onEnter:A(!1),onAppear:A(!0),onLeave(R,z){R._isLeaving=!0;const V=()=>D(R,z);Zs(R,u),R._enterCancelled?(Zs(R,p),Fo(R)):(Fo(R),Zs(R,p)),$d(()=>{R._isLeaving&&(Hn(R,u),Zs(R,h),Fd(b)||Bd(R,n,T,V))}),sa(b,[R,V])},onEnterCancelled(R){x(R,!1,void 0,!0),sa(g,[R])},onAppearCancelled(R){x(R,!0,void 0,!0),sa(C,[R])},onLeaveCancelled(R){D(R),sa(S,[R])}})}function xy(e){if(e==null)return null;if(et(e))return[Xr(e.enter),Xr(e.leave)];{const t=Xr(e);return[t,t]}}function Xr(e){return Bl(e)}function Zs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ei]||(e[ei]=new Set)).add(t)}function Hn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[ei];s&&(s.delete(t),s.size||(e[ei]=void 0))}function $d(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let _y=0;function Bd(e,t,s,n){const a=e._endId=++_y,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=ih(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function ih(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${Fn}Delay`),i=n(`${Fn}Duration`),l=Ud(a,i),r=n(`${mi}Delay`),o=n(`${mi}Duration`),c=Ud(r,o);let d=null,u=0,p=0;t===Fn?l>0&&(d=Fn,u=l,p=i.length):t===mi?c>0&&(d=mi,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?Fn:mi:null,p=d?d===Fn?i.length:o.length:0);const h=d===Fn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Fn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function Ud(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Hd(s)+Hd(e[n])))}function Hd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Fo(e){return(e?e.ownerDocument:document).body.offsetHeight}function wy(e,t,s){const n=e[ei];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Ql=Symbol("_vod"),Ac=Symbol("_vsh"),lh={name:"show",beforeMount(e,{value:t},{transition:s}){e[Ql]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):vi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),vi(e,!0),n.enter(e)):n.leave(e,()=>{vi(e,!1)}):vi(e,t))},beforeUnmount(e,{value:t}){vi(e,t)}};function vi(e,t){e.style.display=t?e[Ql]:"none",e[Ac]=!t}function ky(){lh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const rh=Symbol("");function Sy(e){const t=cs();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Xl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Xl(t.ce,a):$o(t.subTree,a),s(a)};gc(()=>{zi(n)}),Ke(()=>{os(n,Vt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),mt(()=>a.disconnect())})}function $o(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{$o(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Xl(e.el,t);else if(e.type===$t)e.children.forEach(s=>$o(s,t));else if(e.type===pa){let{el:s,anchor:n}=e;for(;s&&(Xl(s,t),s!==n);)s=s.nextSibling}}function Xl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Iv(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[rh]=n}}const Ty=/(?:^|;)\s*display\s*:/;function Cy(e,t,s){const n=e.style,a=Be(s);let i=!1;if(s&&!a){if(t)if(Be(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&Ci(n,r,"")}else for(const l in t)s[l]==null&&Ci(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Ay(e,l,!Be(t)&&t?t[l]:void 0,r)||Ci(n,l,r):Ci(n,l,"")}}else if(a){if(t!==s){const l=n[rh];l&&(s+=";"+l),n.cssText=s,i=Ty.test(s)}}else t&&e.removeAttribute("style");Ql in e&&(e[Ql]=i?n.display:"",e[Ac]&&(n.display="none"))}const zd=/\s*!important$/;function Ci(e,t,s){if(Ce(s))s.forEach(n=>Ci(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Ey(e,t);zd.test(s)?e.setProperty(vs(n),s.replace(zd,""),"important"):e[n]=s}}const jd=["Webkit","Moz","ms"],eo={};function Ey(e,t){const s=eo[t];if(s)return s;let n=ot(t);if(n!=="filter"&&n in e)return eo[t]=n;n=_a(n);for(let a=0;a<jd.length;a++){const i=jd[a]+n;if(i in e)return eo[t]=i}return t}function Ay(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Be(n)&&s===n}const Vd="http://www.w3.org/1999/xlink";function qd(e,t,s,n,a,i=Av(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Vd,t.slice(6,t.length)):e.setAttributeNS(Vd,t,s):s==null||i&&!Sp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":es(s)?String(s):s)}function Gd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?eh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=Sp(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function xn(e,t,s,n){e.addEventListener(t,s,n)}function Ry(e,t,s,n){e.removeEventListener(t,s,n)}const Kd=Symbol("_vei");function Iy(e,t,s,n,a=null){const i=e[Kd]||(e[Kd]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Oy(t);if(n){const c=i[t]=Dy(n,a);xn(e,r,c,o)}else l&&(Ry(e,r,l,o),i[t]=void 0)}}const Wd=/(?:Once|Passive|Capture)$/;function Oy(e){let t;if(Wd.test(e)){t={};let n;for(;n=e.match(Wd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):vs(e.slice(2)),t]}let to=0;const Ly=Promise.resolve(),Ny=()=>to||(Ly.then(()=>to=0),to=Date.now());function Dy(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ce(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&Cs(c,t,5,r)}}else Cs(a,t,5,[n])};return s.value=e,s.attached=Ny(),s}const Zd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,oh=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?wy(e,n,l):t==="style"?Cy(e,s,n):ya(t)?mr(t)||Iy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Py(e,t,n,l))?(Gd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&qd(e,t,n,l,i,t!=="value")):e._isVueCE&&(My(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Be(n)))?Gd(e,ot(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),qd(e,t,n,l))};function Py(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Zd(t)&&Fe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Zd(t)&&Be(s)?!1:t in e}function My(e,t){const s=e._def.props;if(!s)return!1;const n=ot(t);return Array.isArray(s)?s.some(a=>ot(a)===n):Object.keys(s).some(a=>ot(a)===n)}const Jd={};function ch(e,t,s){let n=rl(e,t);vr(n)&&(n=qe({},n,t));class a extends Nr{constructor(l){super(n,l,s)}}return a.def=n,a}const Fy=((e,t)=>ch(e,t,wh)),$y=typeof HTMLElement<"u"?HTMLElement:class{};class Nr extends $y{constructor(t,s={},n=sr){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==sr?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(qe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Nr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,At(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!Ce(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Bl(this._props[o])),(r||(r=Object.create(null)))[ot(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)st(this,n)||Object.defineProperty(this,n,{get:()=>tn(s[n])})}_resolveProps(t){const{props:s}=t,n=Ce(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(ot))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Jd;const a=ot(t);s&&this._numberProps&&this._numberProps[a]&&(n=Bl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Jd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(vs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(vs(t),s+""):s||this.removeAttribute(vs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),_h(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=vt(this._def,qe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,vr(l[0])?qe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),vs(i)!==i&&a(vs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function dh(e){const t=cs(),s=t&&t.ce;return s||null}function By(){const e=dh();return e&&e.shadowRoot}function Uy(e="$style"){{const t=cs();if(!t)return Ge;const s=t.type.__cssModules;if(!s)return Ge;const n=s[e];return n||Ge}}const uh=new WeakMap,ph=new WeakMap,er=Symbol("_moveCb"),Yd=Symbol("_enterCb"),Hy=e=>(delete e.props.mode,e),zy=Hy({name:"TransitionGroup",props:qe({},nh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=cs(),n=hc();let a,i;return Rr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Ky(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Vy),a.forEach(qy);const r=a.filter(Gy);Fo(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Zs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[er]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[er]=null,Hn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),r=ah(l);let o=l.tag||$t;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Ac]&&(a.push(d),In(d,Qa(d,r,n,s)),uh.set(d,fh(d.el)))}i=t.default?Er(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&In(d,Qa(d,r,n,s))}return vt(o,null,i)}}}),jy=zy;function Vy(e){const t=e.el;t[er]&&t[er](),t[Yd]&&t[Yd]()}function qy(e){ph.set(e,fh(e.el))}function Gy(e){const t=uh.get(e),s=ph.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function fh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Ky(e,t,s){const n=e.cloneNode(),a=e[ei];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=ih(n);return i.removeChild(n),l}const Wn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ce(t)?s=>Va(t,s):t};function Wy(e){e.target.composing=!0}function Qd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ps=Symbol("_assign");function Xd(e,t,s){return t&&(e=e.trim()),s&&(e=yr(e)),e}const tr={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ps]=Wn(a);const i=n||a.props&&a.props.type==="number";xn(e,t?"change":"input",l=>{l.target.composing||e[Ps](Xd(e.value,s,i))}),(s||i)&&xn(e,"change",()=>{e.value=Xd(e.value,s,i)}),t||(xn(e,"compositionstart",Wy),xn(e,"compositionend",Qd),xn(e,"change",Qd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ps]=Wn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?yr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Rc={deep:!0,created(e,t,s){e[Ps]=Wn(s),xn(e,"change",()=>{const n=e._modelValue,a=ti(e),i=e.checked,l=e[Ps];if(Ce(n)){const r=_r(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(xa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(mh(e,i))})},mounted:eu,beforeUpdate(e,t,s){e[Ps]=Wn(s),eu(e,t,s)}};function eu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ce(t))a=_r(t,n.props.value)>-1;else if(xa(t))a=t.has(n.props.value);else{if(t===s)return;a=En(t,mh(e,!0))}e.checked!==a&&(e.checked=a)}const Ic={created(e,{value:t},s){e.checked=En(t,s.props.value),e[Ps]=Wn(s),xn(e,"change",()=>{e[Ps](ti(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ps]=Wn(n),t!==s&&(e.checked=En(t,n.props.value))}},hh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=xa(t);xn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?yr(ti(l)):ti(l));e[Ps](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,At(()=>{e._assigning=!1})}),e[Ps]=Wn(n)},mounted(e,{value:t}){tu(e,t)},beforeUpdate(e,t,s){e[Ps]=Wn(s)},updated(e,{value:t}){e._assigning||tu(e,t)}};function tu(e,t){const s=e.multiple,n=Ce(t);if(!(s&&!n&&!xa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ti(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=_r(t,r)>-1}else l.selected=t.has(r);else if(En(ti(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ti(e){return"_value"in e?e._value:e.value}function mh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const vh={created(e,t,s){Sl(e,t,s,null,"created")},mounted(e,t,s){Sl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Sl(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Sl(e,t,s,n,"updated")}};function gh(e,t){switch(e){case"SELECT":return hh;case"TEXTAREA":return tr;default:switch(t){case"checkbox":return Rc;case"radio":return Ic;default:return tr}}}function Sl(e,t,s,n,a){const l=gh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Zy(){tr.getSSRProps=({value:e})=>({value:e}),Ic.getSSRProps=({value:e},t)=>{if(t.props&&En(t.props.value,e))return{checked:!0}},Rc.getSSRProps=({value:e},t)=>{if(Ce(e)){if(t.props&&_r(e,t.props.value)>-1)return{checked:!0}}else if(xa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},vh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=gh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Jy=["ctrl","shift","alt","meta"],Yy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Jy.some(s=>e[`${s}Key`]&&!t.includes(s))},Qy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Yy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Xy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},ex=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=vs(a.key);if(t.some(l=>l===i||Xy[l]===i))return e(a)}))},bh=qe({patchProp:oh},th);let Ni,su=!1;function yh(){return Ni||(Ni=Lf(bh))}function xh(){return Ni=su?Ni:Nf(bh),su=!0,Ni}const _h=((...e)=>{yh().render(...e)}),tx=((...e)=>{xh().hydrate(...e)}),sr=((...e)=>{const t=yh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Sh(n);if(!a)return;const i=t._component;!Fe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,kh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),wh=((...e)=>{const t=xh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Sh(n);if(a)return s(a,!0,kh(a))},t});function kh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Sh(e){return Be(e)?document.querySelector(e):e}let nu=!1;const sx=()=>{nu||(nu=!0,Zy(),ky())},nx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:cf,BaseTransitionPropsValidators:mc,Comment:Ct,DeprecationTypes:my,EffectScope:ic,ErrorCodes:bg,ErrorTypeStrings:oy,Fragment:$t,KeepAlive:Yg,ReactiveEffect:Bi,Static:pa,Suspense:jb,Teleport:Ng,Text:Gn,TrackOpTypes:ug,Transition:yy,TransitionGroup:jy,TriggerOpTypes:pg,VueElement:Nr,assertNumber:gg,callWithAsyncErrorHandling:Cs,callWithErrorHandling:di,camelize:ot,capitalize:_a,cloneVNode:nn,compatUtils:hy,computed:J,createApp:sr,createBlock:Zl,createCommentVNode:Vf,createElementBlock:Zb,createElementVNode:Tc,createHydrationRenderer:Nf,createPropsRestProxy:yb,createRenderer:Lf,createSSRApp:wh,createSlots:ab,createStaticVNode:Qb,createTextVNode:Cc,createVNode:vt,customRef:Gp,defineAsyncComponent:Zg,defineComponent:rl,defineCustomElement:ch,defineEmits:cb,defineExpose:db,defineModel:fb,defineOptions:ub,defineProps:ob,defineSSRCustomElement:Fy,defineSlots:pb,devtools:cy,effect:Dv,effectScope:Ov,getCurrentInstance:cs,getCurrentScope:Ap,getCurrentWatcher:fg,getTransitionRawChildren:Er,guardReactiveProps:jf,h:Xa,handleError:wa,hasInjectionContext:Cg,hydrate:tx,hydrateOnIdle:jg,hydrateOnInteraction:Kg,hydrateOnMediaQuery:Gg,hydrateOnVisible:qg,initCustomFormatter:iy,initDirectivesForSSR:sx,inject:Ds,isMemoSame:Qf,isProxy:il,isReactive:Sn,isReadonly:sn,isRef:It,isRuntimeOnly:sy,isShallow:bs,isVNode:On,markRaw:Vp,mergeDefaults:gb,mergeModels:bb,mergeProps:qf,nextTick:At,nodeOps:th,normalizeClass:al,normalizeProps:bv,normalizeStyle:nl,onActivated:us,onBeforeMount:pf,onBeforeUnmount:Ir,onBeforeUpdate:gc,onDeactivated:ts,onErrorCaptured:vf,onMounted:Ke,onRenderTracked:mf,onRenderTriggered:hf,onScopeDispose:Lv,onServerPrefetch:ff,onUnmounted:mt,onUpdated:Rr,onWatcherCleanup:Wp,openBlock:Ki,patchProp:oh,popScopeId:kg,provide:Ii,proxyRefs:uc,pushScopeId:wg,queuePostFlushCb:zi,reactive:Zn,readonly:Hl,ref:f,registerRuntimeCompiler:Zf,render:_h,renderList:nb,renderSlot:ib,resolveComponent:eb,resolveDirective:sb,resolveDynamicComponent:tb,resolveFilter:fy,resolveTransitionHooks:Qa,setBlockTracking:Wi,setDevtoolsHook:dy,setTransitionHooks:In,shallowReactive:cc,shallowReadonly:Xv,shallowRef:dc,ssrContextKey:ef,ssrUtils:py,stop:Pv,toDisplayString:Cp,toHandlerKey:ja,toHandlers:lb,toRaw:Je,toRef:og,toRefs:ig,toValue:sg,transformVNodeArgs:Jb,triggerRef:tg,unref:tn,useAttrs:vb,useCssModule:Uy,useCssVars:Sy,useHost:dh,useId:Pg,useModel:Ab,useSSRContext:tf,useShadowRoot:By,useSlots:mb,useTemplateRef:Mg,useTransitionState:hc,vModelCheckbox:Rc,vModelDynamic:vh,vModelRadio:Ic,vModelSelect:hh,vModelText:tr,vShow:lh,version:Xf,warn:ry,watch:os,watchEffect:Eg,watchPostEffect:Ag,watchSyncEffect:sf,withAsyncContext:xb,withCtx:fc,withDefaults:hb,withDirectives:Tg,withKeys:ex,withMemo:ly,withModifiers:Qy,withScopeId:Sg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ji=Symbol(""),Di=Symbol(""),Oc=Symbol(""),nr=Symbol(""),Th=Symbol(""),ga=Symbol(""),Ch=Symbol(""),Eh=Symbol(""),Lc=Symbol(""),Nc=Symbol(""),dl=Symbol(""),Dc=Symbol(""),Ah=Symbol(""),Pc=Symbol(""),Mc=Symbol(""),Fc=Symbol(""),$c=Symbol(""),Bc=Symbol(""),Uc=Symbol(""),Rh=Symbol(""),Ih=Symbol(""),Dr=Symbol(""),ar=Symbol(""),Hc=Symbol(""),zc=Symbol(""),Yi=Symbol(""),ul=Symbol(""),jc=Symbol(""),Bo=Symbol(""),ax=Symbol(""),Uo=Symbol(""),ir=Symbol(""),ix=Symbol(""),lx=Symbol(""),Vc=Symbol(""),rx=Symbol(""),ox=Symbol(""),qc=Symbol(""),Oh=Symbol(""),si={[Ji]:"Fragment",[Di]:"Teleport",[Oc]:"Suspense",[nr]:"KeepAlive",[Th]:"BaseTransition",[ga]:"openBlock",[Ch]:"createBlock",[Eh]:"createElementBlock",[Lc]:"createVNode",[Nc]:"createElementVNode",[dl]:"createCommentVNode",[Dc]:"createTextVNode",[Ah]:"createStaticVNode",[Pc]:"resolveComponent",[Mc]:"resolveDynamicComponent",[Fc]:"resolveDirective",[$c]:"resolveFilter",[Bc]:"withDirectives",[Uc]:"renderList",[Rh]:"renderSlot",[Ih]:"createSlots",[Dr]:"toDisplayString",[ar]:"mergeProps",[Hc]:"normalizeClass",[zc]:"normalizeStyle",[Yi]:"normalizeProps",[ul]:"guardReactiveProps",[jc]:"toHandlers",[Bo]:"camelize",[ax]:"capitalize",[Uo]:"toHandlerKey",[ir]:"setBlockTracking",[ix]:"pushScopeId",[lx]:"popScopeId",[Vc]:"withCtx",[rx]:"unref",[ox]:"isRef",[qc]:"withMemo",[Oh]:"isMemoSame"};function cx(e){Object.getOwnPropertySymbols(e).forEach(t=>{si[t]=e[t]})}const As={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function dx(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:As}}function Qi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=As){return e&&(r?(e.helper(ga),e.helper(ii(e.inSSR,c))):e.helper(ai(e.inSSR,c)),l&&e.helper(Bc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function fa(e,t=As){return{type:17,loc:t,elements:e}}function Ns(e,t=As){return{type:15,loc:t,properties:e}}function Rt(e,t){return{type:16,loc:As,key:Be(e)?ze(e,!0):e,value:t}}function ze(e,t=!1,s=As,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Vs(e,t=As){return{type:8,loc:t,children:e}}function Pt(e,t=[],s=As){return{type:14,loc:s,callee:e,arguments:t}}function ni(e,t=void 0,s=!1,n=!1,a=As){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Ho(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:As}}function ux(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:As}}function px(e){return{type:21,body:e,loc:As}}function ai(e,t){return e||t?Lc:Nc}function ii(e,t){return e||t?Ch:Eh}function Gc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ai(n,e.isComponent)),t(ga),t(ii(n,e.isComponent)))}const au=new Uint8Array([123,123]),iu=new Uint8Array([125,125]);function lu(e){return e>=97&&e<=122||e>=65&&e<=90}function Ss(e){return e===32||e===10||e===9||e===12||e===13}function $n(e){return e===47||e===62||Ss(e)}function lr(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Kt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class fx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=au,this.delimiterClose=iu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=au,this.delimiterClose=iu}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?$n(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Ss(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Kt.TitleEnd||this.currentSequence===Kt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Kt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Kt.Cdata.length&&(this.state=28,this.currentSequence=Kt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Kt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):lu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){$n(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if($n(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(lr("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Ss(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=lu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Ss(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Ss(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Ss(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||$n(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||$n(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||$n(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||$n(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||$n(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Ss(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Ss(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Ss(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Kt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Kt.ScriptEnd[3]?this.startSpecial(Kt.ScriptEnd,4):t===Kt.StyleEnd[3]?this.startSpecial(Kt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Kt.TitleEnd[3]?this.startSpecial(Kt.TitleEnd,4):t===Kt.TextareaEnd[3]?this.startSpecial(Kt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Kt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function ru(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ha(e,t){const s=ru("MODE",t),n=ru(e,t);return s===3?n===!0:n!==!1}function Xi(e,t,s,...n){return ha(e,t)}function Kc(e){throw e}function Lh(e){}function ht(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const gs=e=>e.type===4&&e.isStatic;function Nh(e){switch(e){case"Teleport":case"teleport":return Di;case"Suspense":case"suspense":return Oc;case"KeepAlive":case"keep-alive":return nr;case"BaseTransition":case"base-transition":return Th}}const hx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Wc=e=>!hx.test(e),Dh=/[A-Za-z_$\xA0-\uFFFF]/,mx=/[\.\?\w$\xA0-\uFFFF]/,vx=/\s+[.[]\s*|\s*[.[]\s+/g,Ph=e=>e.type===4?e.content:e.loc.source,gx=e=>{const t=Ph(e).trim().replace(vx,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?Dh:mx).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},Mh=gx,bx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,yx=e=>bx.test(Ph(e)),xx=yx;function Ls(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Be(t)?a.name===t:t.test(a.name)))return a}}function Pr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&ra(i.arg,t))return i}}function ra(e,t){return!!(e&&gs(e)&&e.content===t)}function _x(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function so(e){return e.type===5||e.type===2}function ou(e){return e.type===7&&e.name==="pre"}function wx(e){return e.type===7&&e.name==="slot"}function rr(e){return e.type===1&&e.tagType===3}function or(e){return e.type===1&&e.tagType===2}const kx=new Set([Yi,ul]);function Fh(e,t=[]){if(e&&!Be(e)&&e.type===14){const s=e.callee;if(!Be(s)&&kx.has(s))return Fh(e.arguments[0],t.concat(e))}return[e,t]}function cr(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Be(a)&&a.type===14){const r=Fh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Be(a))n=Ns([t]);else if(a.type===14){const r=a.arguments[0];!Be(r)&&r.type===15?cu(t,r)||r.properties.unshift(t):a.callee===jc?n=Pt(s.helper(ar),[Ns([t]),a]):a.arguments.unshift(Ns([t])),!n&&(n=a)}else a.type===15?(cu(t,a)||a.properties.unshift(t),n=a):(n=Pt(s.helper(ar),[Ns([t]),a]),l&&l.callee===ul&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function cu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function el(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Sx(e){return e.type===14&&e.callee===qc?e.arguments[1].returns:e}const Tx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function $h(e){for(let t=0;t<e.length;t++)if(!Ss(e.charCodeAt(t)))return!1;return!0}function Zc(e){return e.type===2&&$h(e.content)||e.type===12&&Zc(e.content)}function Bh(e){return e.type===3||Zc(e)}const Uh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Ba,isPreTag:Ba,isIgnoreNewlineTag:Ba,isCustomElement:Ba,onError:Kc,onWarn:Lh,comments:!1,prefixIdentifiers:!1};let Xe=Uh,tl=null,Cn="",Zt=null,We=null,ps="",hn=-1,aa=-1,Jc=0,Vn=!1,zo=null;const ft=[],wt=new fx(ft,{onerr:un,ontext(e,t){Tl(Ht(e,t),e,t)},ontextentity(e,t,s){Tl(e,t,s)},oninterpolation(e,t){if(Vn)return Tl(Ht(e,t),e,t);let s=e+wt.delimiterOpen.length,n=t-wt.delimiterClose.length;for(;Ss(Cn.charCodeAt(s));)s++;for(;Ss(Cn.charCodeAt(n-1));)n--;let a=Ht(s,n);a.includes("&")&&(a=Xe.decodeEntities(a,!1)),jo({type:5,content:Pl(a,!1,Tt(s,n)),loc:Tt(e,t)})},onopentagname(e,t){const s=Ht(e,t);Zt={type:1,tag:s,ns:Xe.getNamespace(s,ft[0],Xe.ns),tagType:0,props:[],children:[],loc:Tt(e-1,t),codegenNode:void 0}},onopentagend(e){uu(e)},onclosetag(e,t){const s=Ht(e,t);if(!Xe.isVoidTag(s)){let n=!1;for(let a=0;a<ft.length;a++)if(ft[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&un(24,ft[0].loc.start.offset);for(let l=0;l<=a;l++){const r=ft.shift();Dl(r,t,l<a)}break}n||un(23,Hh(e,60))}},onselfclosingtag(e){const t=Zt.tag;Zt.isSelfClosing=!0,uu(e),ft[0]&&ft[0].tag===t&&Dl(ft.shift(),e)},onattribname(e,t){We={type:6,name:Ht(e,t),nameLoc:Tt(e,t),value:void 0,loc:Tt(e)}},ondirname(e,t){const s=Ht(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Vn&&n===""&&un(26,e),Vn||n==="")We={type:6,name:s,nameLoc:Tt(e,t),value:void 0,loc:Tt(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[ze("prop")]:[],loc:Tt(e)},n==="pre"){Vn=wt.inVPre=!0,zo=Zt;const a=Zt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Px(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ht(e,t);if(Vn&&!ou(We))We.name+=s,oa(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=Pl(n?s:s.slice(1,-1),n,Tt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ht(e,t);if(Vn&&!ou(We))We.name+="."+s,oa(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,oa(n.loc,t))}else{const n=ze(s,!0,Tt(e,t));We.modifiers.push(n)}},onattribdata(e,t){ps+=Ht(e,t),hn<0&&(hn=e),aa=t},onattribentity(e,t,s){ps+=e,hn<0&&(hn=t),aa=s},onattribnameend(e){const t=We.loc.start.offset,s=Ht(t,e);We.type===7&&(We.rawName=s),Zt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&un(2,t)},onattribend(e,t){if(Zt&&We){if(oa(We.loc,t),e!==0)if(ps.includes("&")&&(ps=Xe.decodeEntities(ps,!0)),We.type===6)We.name==="class"&&(ps=jh(ps).trim()),e===1&&!ps&&un(13,t),We.value={type:2,content:ps,loc:e===1?Tt(hn,aa):Tt(hn-1,aa+1)},wt.inSFCRoot&&Zt.tag==="template"&&We.name==="lang"&&ps&&ps!=="html"&&wt.enterRCDATA(lr("</template"),0);else{let s=0;We.exp=Pl(ps,!1,Tt(hn,aa),0,s),We.name==="for"&&(We.forParseResult=Ex(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&Xi("COMPILER_V_BIND_SYNC",Xe,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&Zt.props.push(We)}ps="",hn=aa=-1},oncomment(e,t){Xe.comments&&jo({type:3,content:Ht(e,t),loc:Tt(e-4,t+3)})},onend(){const e=Cn.length;for(let t=0;t<ft.length;t++)Dl(ft[t],e-1),un(24,ft[t].loc.start.offset)},oncdata(e,t){(ft[0]?ft[0].ns:Xe.ns)!==0?Tl(Ht(e,t),e,t):un(1,e-9)},onprocessinginstruction(e){(ft[0]?ft[0].ns:Xe.ns)===0&&un(21,e-1)}}),du=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Cx=/^\(|\)$/g;function Ex(e){const t=e.loc,s=e.content,n=s.match(Tx);if(!n)return;const[,a,i]=n,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return Pl(u,!1,Tt(m,v),0,h?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Cx,"").trim();const c=a.indexOf(o),d=o.match(du);if(d){o=o.replace(du,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(r.index=l(h,s.indexOf(h,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ht(e,t){return Cn.slice(e,t)}function uu(e){wt.inSFCRoot&&(Zt.innerLoc=Tt(e+1,e+1)),jo(Zt);const{tag:t,ns:s}=Zt;s===0&&Xe.isPreTag(t)&&Jc++,Xe.isVoidTag(t)?Dl(Zt,e):(ft.unshift(Zt),(s===1||s===2)&&(wt.inXML=!0)),Zt=null}function Tl(e,t,s){{const i=ft[0]&&ft[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Xe.decodeEntities(e,!1))}const n=ft[0]||tl,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,oa(a.loc,s)):n.children.push({type:2,content:e,loc:Tt(t,s)})}function Dl(e,t,s=!1){s?oa(e.loc,Hh(t,60)):oa(e.loc,Ax(t,62)+1),wt.inSFCRoot&&(e.children.length?e.innerLoc.end=qe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=qe({},e.innerLoc.start),e.innerLoc.source=Ht(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Vn||(n==="slot"?e.tagType=2:pu(e)?e.tagType=3:Ix(e)&&(e.tagType=1)),wt.inRCDATA||(e.children=zh(i)),a===0&&Xe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Xe.isPreTag(n)&&Jc--,zo===e&&(Vn=wt.inVPre=!1,zo=null),wt.inXML&&(ft[0]?ft[0].ns:Xe.ns)===0&&(wt.inXML=!1);{const l=e.props;if(!wt.inSFCRoot&&ha("COMPILER_NATIVE_TEMPLATE",Xe)&&e.tag==="template"&&!pu(e)){const o=ft[0]||tl,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Xi("COMPILER_INLINE_TEMPLATE",Xe,r.loc)&&e.children.length&&(r.value={type:2,content:Ht(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Ax(e,t){let s=e;for(;Cn.charCodeAt(s)!==t&&s<Cn.length-1;)s++;return s}function Hh(e,t){let s=e;for(;Cn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Rx=new Set(["if","else","else-if","for","slot"]);function pu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Rx.has(t[s].name))return!0}return!1}function Ix({tag:e,props:t}){if(Xe.isCustomElement(e))return!1;if(e==="component"||Ox(e.charCodeAt(0))||Nh(e)||Xe.isBuiltInComponent&&Xe.isBuiltInComponent(e)||Xe.isNativeTag&&!Xe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Xi("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}}else if(n.name==="bind"&&ra(n.arg,"is")&&Xi("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}return!1}function Ox(e){return e>64&&e<91}const Lx=/\r\n/g;function zh(e){const t=Xe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Jc)a.content=a.content.replace(Lx,`
`);else if($h(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Nx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=jh(a.content))}return s?e.filter(Boolean):e}function Nx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function jh(e){let t="",s=!1;for(let n=0;n<e.length;n++)Ss(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function jo(e){(ft[0]||tl).children.push(e)}function Tt(e,t){return{start:wt.getPos(e),end:t==null?t:wt.getPos(t),source:t==null?t:Ht(e,t)}}function Dx(e){return Tt(e.start.offset,e.end.offset)}function oa(e,t){e.end=wt.getPos(t),e.source=Ht(e.start.offset,t)}function Px(e){const t={type:6,name:e.rawName,nameLoc:Tt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Pl(e,t=!1,s,n=0,a=0){return ze(e,t,s,n)}function un(e,t,s){Xe.onError(ht(e,Tt(t,t)))}function Mx(){wt.reset(),Zt=null,We=null,ps="",hn=-1,aa=-1,ft.length=0}function Fx(e,t){if(Mx(),Cn=e,Xe=qe({},Uh),t){let a;for(a in t)t[a]!=null&&(Xe[a]=t[a])}wt.mode=Xe.parseMode==="html"?1:Xe.parseMode==="sfc"?2:0,wt.inXML=Xe.ns===1||Xe.ns===2;const s=t&&t.delimiters;s&&(wt.delimiterOpen=lr(s[0]),wt.delimiterClose=lr(s[1]));const n=tl=dx([],e);return wt.parse(Cn),n.loc=Tt(0,e.length),n.children=zh(n.children),tl=null,n}function $x(e,t){Ml(e,void 0,t,!!Vh(e))}function Vh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!or(t[0])?t[0]:null}function Ml(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:Ts(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&Gh(u,s)>=2){const v=Kh(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(n?0:Ts(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Ml(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Ml(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Ml(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ce(e.codegenNode.children))e.codegenNode.children=o(fa(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ce(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(fa(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ce(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Ls(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(fa(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ce(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Ts(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Gh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=Ts(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=Ts(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ga),t.removeHelper(ii(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ai(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Ts(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Be(r)||es(r))continue;const o=Ts(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Bx=new Set([Hc,zc,Yi,ul]);function qh(e,t){if(e.type===14&&!Be(e.callee)&&Bx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Ts(s,t);if(s.type===14)return qh(s,t)}return 0}function Gh(e,t){let s=3;const n=Kh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=Ts(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=Ts(r,t):r.type===14?c=qh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Kh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Ux(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Vt,isCustomElement:d=Vt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:T="",bindingMetadata:I=Ge,inline:y=!1,isTS:g=!1,onError:b=Kc,onWarn:S=Lh,compatConfig:w}){const E=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),C={filename:t,selfName:E&&_a(ot(E[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:T,bindingMetadata:I,inline:y,isTS:g,onError:b,onWarn:S,compatConfig:w,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(x){const D=C.helpers.get(x)||0;return C.helpers.set(x,D+1),x},removeHelper(x){const D=C.helpers.get(x);if(D){const A=D-1;A?C.helpers.set(x,A):C.helpers.delete(x)}},helperString(x){return`_${si[C.helper(x)]}`},replaceNode(x){C.parent.children[C.childIndex]=C.currentNode=x},removeNode(x){const D=C.parent.children,A=x?D.indexOf(x):C.currentNode?C.childIndex:-1;!x||x===C.currentNode?(C.currentNode=null,C.onNodeRemoved()):C.childIndex>A&&(C.childIndex--,C.onNodeRemoved()),C.parent.children.splice(A,1)},onNodeRemoved:Vt,addIdentifiers(x){},removeIdentifiers(x){},hoist(x){Be(x)&&(x=ze(x)),C.hoists.push(x);const D=ze(`_hoisted_${C.hoists.length}`,!1,x.loc,2);return D.hoisted=x,D},cache(x,D=!1,A=!1){const R=ux(C.cached.length,x,D,A);return C.cached.push(R),R}};return C.filters=new Set,C}function Hx(e,t){const s=Ux(e,t);Mr(e,s),t.hoistStatic&&$x(e,s),t.ssr||zx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function zx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Vh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Gc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Qi(t,s(Ji),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function jx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Be(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Mr(a,t))}}function Mr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ce(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(dl);break;case 5:t.ssr||t.helper(Dr);break;case 9:for(let i=0;i<e.branches.length;i++)Mr(e.branches[i],t);break;case 10:case 11:case 1:case 0:jx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Wh(e,t){const s=Be(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(wx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Fr="/*@__PURE__*/",Zh=e=>`${si[e]}: _${si[e]}`;function Vx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${si[v]}`},push(v,T=-2,I){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function qx(e,t={}){const s=Vx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&n!=="module";Gx(e,s);const v=d?"ssrRender":"render",I=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${I}) {`),l(),h&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(Zh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(no(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(no(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),no(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Qt(e.codegenNode,s):a("null"),h&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Gx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Lc,Nc,dl,Dc,Ah].filter(p=>d.includes(p)).map(Zh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Kx(e.hoists,t),i(),a("return ")}function no(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?$c:t==="component"?Pc:Fc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${el(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Kx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Qt(i,t),n())}t.pure=!1}function Yc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),pl(e,t,s),s&&t.deindent(),t.push("]")}function pl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Be(r)?a(r,-3):Ce(r)?Yc(r,t):Qt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Qt(e,t){if(Be(e)){t.push(e,-3);return}if(es(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Qt(e.codegenNode,t);break;case 2:Wx(e,t);break;case 4:Jh(e,t);break;case 5:Zx(e,t);break;case 12:Qt(e.codegenNode,t);break;case 8:Yh(e,t);break;case 3:Yx(e,t);break;case 13:Qx(e,t);break;case 14:e0(e,t);break;case 15:t0(e,t);break;case 17:s0(e,t);break;case 18:n0(e,t);break;case 19:a0(e,t);break;case 20:i0(e,t);break;case 21:pl(e.body,t,!0,!1);break}}function Wx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Jh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Zx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Fr),s(`${n(Dr)}(`),Qt(e.content,t),s(")")}function Yh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Be(n)?t.push(n,-3):Qt(n,t)}}function Jx(e,t){const{push:s}=t;if(e.type===8)s("["),Yh(e,t),s("]");else if(e.isStatic){const n=Wc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Yx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Fr),s(`${n(dl)}(${JSON.stringify(e.content)})`,-3,e)}function Qx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;o&&(m=String(o)),d&&s(n(Bc)+"("),u&&s(`(${n(ga)}(${p?"true":""}), `),a&&s(Fr);const v=u?ii(t.inSSR,h):ai(t.inSSR,h);s(n(v)+"(",-2,e),pl(Xx([i,l,r,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),Qt(d,t),s(")"))}function Xx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function e0(e,t){const{push:s,helper:n,pure:a}=t,i=Be(e.callee)?e.callee:n(e.callee);a&&s(Fr),s(i+"(",-2,e),pl(e.arguments,t),s(")")}function t0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Jx(c,t),s(": "),Qt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function s0(e,t){Yc(e.elements,t)}function n0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${si[Vc]}(`),s("(",-2,e),Ce(i)?pl(i,t):i&&Qt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),Ce(l)?Yc(l,t):Qt(l,t)):r&&Qt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function a0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Wc(s.content);u&&l("("),Jh(s,t),u&&l(")")}else l("("),Qt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Qt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Qt(a,t),d||t.indentLevel--,i&&o(!0)}function i0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(ir)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Qt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(ir)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const l0=Wh(/^(?:if|else|else-if)$/,(e,t,s)=>r0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=hu(a,o,s);else{const c=o0(n.codegenNode);c.alternate=hu(a,o+n.branches.length-1,s)}}}));function r0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ht(28,t.loc)),t.exp=ze("true",!1,a)}if(t.name==="if"){const a=fu(e,t),i={type:9,loc:Dx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Bh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ht(30,e.loc)),s.removeNode();const r=fu(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Mr(r,s),o&&o(),s.currentNode=null}else s.onError(ht(30,e.loc));break}}}function fu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Ls(e,"for")?e.children:[e],userKey:Pr(e,"key"),isTemplateIf:s}}function hu(e,t,s){return e.condition?Ho(e.condition,mu(e,t,s),Pt(s.helper(dl),['""',"true"])):mu(e,t,s)}function mu(e,t,s){const{helper:n}=s,a=Rt("key",ze(`${t}`,!1,As,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return cr(o,a,s),o}else return Qi(s,n(Ji),Ns([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=Sx(o);return c.type===13&&Gc(c,s),cr(c,a,s),o}}function o0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const c0=Wh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return d0(e,t,s,i=>{const l=Pt(n(Uc),[i.source]),r=rr(e),o=Ls(e,"memo"),c=Pr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?ze(c.value.content,!0):void 0:c.exp);const u=d?Rt("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=Qi(s,n(Ji),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,T=v.length!==1||v[0].type!==1,I=or(e)?e:r&&e.children.length===1&&or(e.children[0])?e.children[0]:null;if(I?(m=I.codegenNode,r&&u&&cr(m,u,s)):T?m=Qi(s,n(Ji),u?Ns([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,r&&u&&cr(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(ga),a(ii(s.inSSR,m.isComponent))):a(ai(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(ga),n(ii(s.inSSR,m.isComponent))):n(ai(s.inSSR,m.isComponent))),o){const y=ni(Vo(i.parseResult,[ze("_cached")]));y.body=px([Vs(["const _memo = (",o.exp,")"]),Vs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Oh)}(_cached, _memo)) return _cached`]),Vs(["const _item = ",m]),ze("_item.memo = _memo"),ze("return _item")]),l.arguments.push(y,ze("_cache"),ze(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ni(Vo(i.parseResult),m,!0))}})});function d0(e,t,s,n){if(!t.exp){s.onError(ht(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ht(32,t.loc));return}Qh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:rr(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const h=n&&n(p);return()=>{r.vFor--,h&&h()}}function Qh(e,t){e.finalized||(e.finalized=!0)}function Vo({value:e,key:t,index:s},n=[]){return u0([e,t,s,...n])}function u0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||ze("_".repeat(n+1),!1))}const vu=ze("undefined",!1),p0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Ls(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},f0=(e,t,s,n)=>ni(e,s,!1,!0,s.length?s[0].loc:n);function h0(e,t,s=f0){t.helper(Vc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=Ls(e,"slot",!0);if(o){const{arg:T,exp:I}=o;T&&!gs(T)&&(r=!0),i.push(Rt(T||ze("default",!0),s(I,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let T=0;T<n.length;T++){const I=n[T];let y;if(!rr(I)||!(y=Ls(I,"slot",!0))){I.type!==3&&u.push(I);continue}if(o){t.onError(ht(37,y.loc));break}c=!0;const{children:g,loc:b}=I,{arg:S=ze("default",!0),exp:w,loc:E}=y;let C;gs(S)?C=S?S.content:"default":r=!0;const x=Ls(I,"for"),D=s(w,x,g,b);let A,R;if(A=Ls(I,"if"))r=!0,l.push(Ho(A.exp,Cl(S,D,h++),vu));else if(R=Ls(I,/^else(?:-if)?$/,!0)){let z=T,V;for(;z--&&(V=n[z],!!Bh(V)););if(V&&rr(V)&&Ls(V,/^(?:else-)?if$/)){let le=l[l.length-1];for(;le.alternate.type===19;)le=le.alternate;le.alternate=R.exp?Ho(R.exp,Cl(S,D,h++),vu):Cl(S,D,h++)}else t.onError(ht(30,R.loc))}else if(x){r=!0;const z=x.forParseResult;z?(Qh(z),l.push(Pt(t.helper(Uc),[z.source,ni(Vo(z),Cl(S,D),!0)]))):t.onError(ht(32,x.loc))}else{if(C){if(p.has(C)){t.onError(ht(38,E));continue}p.add(C),C==="default"&&(d=!0)}i.push(Rt(S,D))}}if(!o){const T=(I,y)=>{const g=s(I,void 0,y,a);return t.compatConfig&&(g.isNonScopedSlot=!0),Rt("default",g)};c?u.length&&!u.every(Zc)&&(d?t.onError(ht(39,u[0].loc)):i.push(T(void 0,u))):i.push(T(void 0,n))}const m=r?2:Fl(e.children)?3:1;let v=Ns(i.concat(Rt("_",ze(m+"",!1))),a);return l.length&&(v=Pt(t.helper(Ih),[v,fa(l)])),{slots:v,hasDynamicSlots:r}}function Cl(e,t,s){const n=[Rt("name",e),Rt("fn",t)];return s!=null&&n.push(Rt("key",ze(String(s),!0))),Ns(n)}function Fl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Fl(s.children))return!0;break;case 9:if(Fl(s.branches))return!0;break;case 10:case 11:if(Fl(s.children))return!0;break}}return!1}const Xh=new WeakMap,m0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?v0(e,t):`"${n}"`;const r=et(l)&&l.callee===Mc;let o,c,d=0,u,p,h,m=r||l===Di||l===Oc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=em(e,t,void 0,i,r);o=v.props,d=v.patchFlag,p=v.dynamicPropNames;const T=v.directives;h=T&&T.length?fa(T.map(I=>b0(I,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===nr&&(m=!0,d|=1024),i&&l!==Di&&l!==nr){const{slots:T,hasDynamicSlots:I}=h0(e,t);c=T,I&&(d|=1024)}else if(e.children.length===1&&l!==Di){const T=e.children[0],I=T.type,y=I===5||I===8;y&&Ts(T,t)===0&&(d|=1),y||I===2?c=T:c=e.children}else c=e.children;p&&p.length&&(u=y0(p)),e.codegenNode=Qi(t,l,o,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function v0(e,t,s=!1){let{tag:n}=e;const a=qo(n),i=Pr(e,"is",!1,!0);if(i)if(a||ha("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&ze(i.value.content,!0):(r=i.exp,r||(r=ze("is",!1,i.arg.loc))),r)return Pt(t.helper(Mc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Nh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Pc),t.components.add(n),el(n,"component"))}function em(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let h=!1,m=0,v=!1,T=!1,I=!1,y=!1,g=!1,b=!1;const S=[],w=D=>{c.length&&(d.push(Ns(gu(c),r)),c=[]),D&&d.push(D)},E=()=>{t.scopes.vFor>0&&c.push(Rt(ze("ref_for",!0),ze("true")))},C=({key:D,value:A})=>{if(gs(D)){const R=D.content,z=ya(R);if(z&&(!n||a)&&R.toLowerCase()!=="onclick"&&R!=="onUpdate:modelValue"&&!kn(R)&&(y=!0),z&&kn(R)&&(b=!0),z&&A.type===14&&(A=A.arguments[0]),A.type===20||(A.type===4||A.type===8)&&Ts(A,t)>0)return;R==="ref"?v=!0:R==="class"?T=!0:R==="style"?I=!0:R!=="key"&&!S.includes(R)&&S.push(R),n&&(R==="class"||R==="style")&&!S.includes(R)&&S.push(R)}else g=!0};for(let D=0;D<s.length;D++){const A=s[D];if(A.type===6){const{loc:R,name:z,nameLoc:V,value:le}=A;let M=!0;if(z==="ref"&&(v=!0,E()),z==="is"&&(qo(l)||le&&le.content.startsWith("vue:")||ha("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Rt(ze(z,!0,V),ze(le?le.content:"",M,le?le.loc:R)))}else{const{name:R,arg:z,exp:V,loc:le,modifiers:M}=A,N=R==="bind",O=R==="on";if(R==="slot"){n||t.onError(ht(40,le));continue}if(R==="once"||R==="memo"||R==="is"||N&&ra(z,"is")&&(qo(l)||ha("COMPILER_IS_ON_ELEMENT",t))||O&&i)continue;if((N&&ra(z,"key")||O&&p&&ra(z,"vue:before-update"))&&(h=!0),N&&ra(z,"ref")&&E(),!z&&(N||O)){if(g=!0,V)if(N){if(w(),ha("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(V);continue}E(),w(),d.push(V)}else w({type:14,loc:le,callee:t.helper(jc),arguments:n?[V]:[V,"true"]});else t.onError(ht(N?34:35,le));continue}N&&M.some(G=>G.content==="prop")&&(m|=32);const B=t.directiveTransforms[R];if(B){const{props:G,needRuntime:q}=B(A,e,t);!i&&G.forEach(C),O&&z&&!gs(z)?w(Ns(G,r)):c.push(...G),q&&(u.push(A),es(q)&&Xh.set(A,q))}else cv(R)||(u.push(A),p&&(h=!0))}}let x;if(d.length?(w(),d.length>1?x=Pt(t.helper(ar),d,r):x=d[0]):c.length&&(x=Ns(gu(c),r)),g?m|=16:(T&&!n&&(m|=2),I&&!n&&(m|=4),S.length&&(m|=8),y&&(m|=32)),!h&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&x)switch(x.type){case 15:let D=-1,A=-1,R=!1;for(let le=0;le<x.properties.length;le++){const M=x.properties[le].key;gs(M)?M.content==="class"?D=le:M.content==="style"&&(A=le):M.isHandlerKey||(R=!0)}const z=x.properties[D],V=x.properties[A];R?x=Pt(t.helper(Yi),[x]):(z&&!gs(z.value)&&(z.value=Pt(t.helper(Hc),[z.value])),V&&(I||V.value.type===4&&V.value.content.trim()[0]==="["||V.value.type===17)&&(V.value=Pt(t.helper(zc),[V.value])));break;case 14:break;default:x=Pt(t.helper(Yi),[Pt(t.helper(ul),[x])]);break}return{props:x,directives:u,patchFlag:m,dynamicPropNames:S,shouldUseBlock:h}}function gu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ya(i))&&g0(l,a):(t.set(i,a),s.push(a))}return s}function g0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=fa([e.value,t.value],e.loc)}function b0(e,t){const s=[],n=Xh.get(e);n?s.push(t.helperString(n)):(t.helper(Fc),t.directives.add(e.name),s.push(el(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=ze("true",!1,a);s.push(Ns(e.modifiers.map(l=>Rt(l,i)),a))}return fa(s,e.loc)}function y0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function qo(e){return e==="component"||e==="Component"}const x0=(e,t)=>{if(or(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=_0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=ni([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Pt(t.helper(Rh),l,n)}};function _0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=ot(l.name),a.push(l)));else if(l.name==="bind"&&ra(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=ot(l.arg.content);s=l.exp=ze(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&gs(l.arg)&&(l.arg.content=ot(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=em(e,t,a,!1,!1);n=i,l.length&&t.onError(ht(36,l[0].loc))}return{slotName:s,slotProps:n}}const tm=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ht(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?ja(ot(u)):`on:${u}`;r=ze(p,!0,l.loc)}else r=Vs([`${s.helperString(Uo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(Uo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=Mh(o),p=!(u||xx(o)),h=o.content.includes(";");(p||c&&u)&&(o=Vs([`${p?"$event":"(...args)"} => ${h?"{":"("}`,o,h?"}":")"]))}let d={props:[Rt(r,o||ze("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},w0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=ot(i.content):i.content=`${s.helperString(Bo)}(${i.content})`:(i.children.unshift(`${s.helperString(Bo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&bu(i,"."),n.some(r=>r.content==="attr")&&bu(i,"^")),{props:[Rt(i,l)]}},bu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},k0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(so(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(so(o))n||(n=s[i]=Vs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(so(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&Ts(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Pt(t.helper(Dc),r)}}}}},yu=new WeakSet,S0=(e,t)=>{if(e.type===1&&Ls(e,"once",!0))return yu.has(e)||t.inVOnce||t.inSSR?void 0:(yu.add(e),t.inVOnce=!0,t.helper(ir),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},sm=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ht(41,e.loc)),gi();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ht(44,n.loc)),gi();if(r==="literal-const"||r==="setup-const")return s.onError(ht(45,n.loc)),gi();if(!l.trim()||!Mh(n))return s.onError(ht(42,n.loc)),gi();const o=a||ze("modelValue",!0),c=a?gs(a)?`onUpdate:${ot(a.content)}`:Vs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Vs([`${u} => ((`,n,") = $event)"]);const p=[Rt(o,e.exp),Rt(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(Wc(v)?v:JSON.stringify(v))+": true").join(", "),m=a?gs(a)?`${a.content}Modifiers`:Vs([a,' + "Modifiers"']):"modelModifiers";p.push(Rt(m,ze(`{ ${h} }`,!1,e.loc,2)))}return gi(p)};function gi(e=[]){return{props:e}}const T0=/[\w).+\-_$\]]/,C0=(e,t)=>{ha("COMPILER_FILTERS",t)&&(e.type===5?dr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&dr(s.exp,t)}))};function dr(e,t){if(e.type===4)xu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?xu(n,t):n.type===8?dr(e,t):n.type===5&&dr(n.content,t))}}function xu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!r&&!o&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):T();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let I=h-1,y;for(;I>=0&&(y=s.charAt(I),y===" ");I--);(!y||!T0.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&T();function T(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=E0(m,v[h],t);e.content=m,e.ast=void 0}}function E0(e,t,s){s.helper($c);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${el(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${el(a,"filter")}(${e}${i!==")"?","+i:i}`}}const _u=new WeakSet,A0=(e,t)=>{if(e.type===1){const s=Ls(e,"memo");return!s||_u.has(e)||t.inSSR?void 0:(_u.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Gc(n,t),e.codegenNode=Pt(t.helper(qc),[s.exp,ni(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},R0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ht(53,n.loc)),s.exp=ze("",!0,n.loc);else{const a=ot(n.content);(Dh.test(a[0])||a[0]==="-")&&(s.exp=ze(a,!1,n.loc))}}}};function I0(e){return[[R0,S0,l0,A0,c0,C0,x0,m0,p0,k0],{on:tm,bind:w0,model:sm}]}function O0(e,t={}){const s=t.onError||Kc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ht(48)):n&&s(ht(49));const a=!1;t.cacheHandlers&&s(ht(50)),t.scopeId&&!n&&s(ht(51));const i=qe({},t,{prefixIdentifiers:a}),l=Be(e)?Fx(e,i):e,[r,o]=I0();return Hx(l,qe({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:qe({},o,t.directiveTransforms||{})})),qx(l,i)}const L0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const nm=Symbol(""),am=Symbol(""),im=Symbol(""),lm=Symbol(""),Go=Symbol(""),rm=Symbol(""),om=Symbol(""),cm=Symbol(""),dm=Symbol(""),um=Symbol("");cx({[nm]:"vModelRadio",[am]:"vModelCheckbox",[im]:"vModelText",[lm]:"vModelSelect",[Go]:"vModelDynamic",[rm]:"withModifiers",[om]:"withKeys",[cm]:"vShow",[dm]:"Transition",[um]:"TransitionGroup"});let Oa;function N0(e,t=!1){return Oa||(Oa=document.createElement("div")),t?(Oa.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Oa.children[0].getAttribute("foo")):(Oa.innerHTML=e,Oa.textContent)}const D0={parseMode:"html",isVoidTag:Cv,isNativeTag:e=>kv(e)||Sv(e)||Tv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:N0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return dm;if(e==="TransitionGroup"||e==="transition-group")return um},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},P0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:ze("style",!0,t.loc),exp:M0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},M0=(e,t)=>{const s=kp(e);return ze(JSON.stringify(s),!1,t,3)};function Kn(e,t){return ht(e,t)}const F0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Kn(54,a)),t.children.length&&(s.onError(Kn(55,a)),t.children.length=0),{props:[Rt(ze("innerHTML",!0,a),n||ze("",!0))]}},$0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Kn(56,a)),t.children.length&&(s.onError(Kn(57,a)),t.children.length=0),{props:[Rt(ze("textContent",!0),n?Ts(n,s)>0?n:Pt(s.helperString(Dr),[n],a):ze("",!0))]}},B0=(e,t,s)=>{const n=sm(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Kn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=im,r=!1;if(a==="input"||i){const o=Pr(t,"type");if(o){if(o.type===7)l=Go;else if(o.value)switch(o.value.content){case"radio":l=nm;break;case"checkbox":l=am;break;case"file":r=!0,s.onError(Kn(60,e.loc));break}}else _x(t)&&(l=Go)}else a==="select"&&(l=lm);r||(n.needRuntime=s.helper(l))}else s.onError(Kn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},U0=Es("passive,once,capture"),H0=Es("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),z0=Es("left,right"),pm=Es("onkeyup,onkeydown,onkeypress"),j0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Xi("COMPILER_V_ON_NATIVE",s)||U0(o)?l.push(o):z0(o)?gs(e)?pm(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):H0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},wu=(e,t)=>gs(e)&&e.content.toLowerCase()==="onclick"?ze(t,!0):e.type!==4?Vs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,V0=(e,t,s)=>tm(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=j0(i,a,s,e.loc);if(o.includes("right")&&(i=wu(i,"onContextmenu")),o.includes("middle")&&(i=wu(i,"onMouseup")),o.length&&(l=Pt(s.helper(rm),[l,JSON.stringify(o)])),r.length&&(!gs(i)||pm(i.content.toLowerCase()))&&(l=Pt(s.helper(om),[l,JSON.stringify(r)])),c.length){const d=c.map(_a).join("");i=gs(i)?ze(`${i.content}${d}`,!0):Vs(["(",i,`) + "${d}"`])}return{props:[Rt(i,l)]}}),q0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Kn(62,a)),{props:[],needRuntime:s.helper(cm)}},G0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},K0=[P0],W0={cloak:L0,html:F0,text:$0,model:B0,on:V0,show:q0};function Z0(e,t={}){return O0(e,qe({},D0,t,{nodeTransforms:[G0,...K0,...t.nodeTransforms||[]],directiveTransforms:qe({},W0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ku=Object.create(null);function J0(e,t){if(!Be(e))if(e.nodeType)e=e.innerHTML;else return Vt;const s=pv(e,t),n=ku[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=qe({hoistStatic:!0,onError:void 0,onWarn:Vt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=Z0(e,a),l=new Function("Vue",i)(nx);return l._rc=!0,ku[s]=l}Zf(J0);const ur=Zn({items:[]});let Y0=1;function $r(e,t="info",s=3e3){const n=Y0++;return ur.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Qc(n),s),n}function Qc(e){const t=ur.items.findIndex(s=>s.id===e);t>=0&&ur.items.splice(t,1)}function Re(e,t="info",s=3e3){return $r(e,t,s)}Re.success=(e,t=3e3)=>$r(e,"success",t);Re.error=(e,t=5e3)=>$r(e,"error",t);Re.info=(e,t=3e3)=>$r(e,"info",t);Re.dismiss=Qc;const Q0={setup(){return{state:ur,dismiss:Qc}},template:`
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
  `},gn=Zn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Za=null;function Xt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Za&&Za(!1),gn.title=e,gn.message=t,gn.confirmLabel=s,gn.cancelLabel=n,gn.danger=a,gn.open=!0,new Promise(i=>{Za=i})}function Su(e){gn.open=!1,Za&&(Za(e),Za=null)}const X0={setup(){function e(t){gn.open&&t.key==="Escape"&&(t.stopPropagation(),Su(!1))}return Ke(()=>document.addEventListener("keydown",e,!0)),mt(()=>document.removeEventListener("keydown",e,!0)),{state:gn,settle:Su}},template:`
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
 */const Fa=typeof document<"u";function fm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function e_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&fm(e.default)}const it=Object.assign;function ao(e,t){const s={};for(const n in t){const a=t[n];s[n]=Gs(a)?a.map(e):e(a)}return s}const Pi=()=>{},Gs=Array.isArray;function Tu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const hm=/#/g,t_=/&/g,s_=/\//g,n_=/=/g,a_=/\?/g,mm=/\+/g,i_=/%5B/g,l_=/%5D/g,vm=/%5E/g,r_=/%60/g,gm=/%7B/g,o_=/%7C/g,bm=/%7D/g,c_=/%20/g;function Xc(e){return e==null?"":encodeURI(""+e).replace(o_,"|").replace(i_,"[").replace(l_,"]")}function d_(e){return Xc(e).replace(gm,"{").replace(bm,"}").replace(vm,"^")}function Ko(e){return Xc(e).replace(mm,"%2B").replace(c_,"+").replace(hm,"%23").replace(t_,"%26").replace(r_,"`").replace(gm,"{").replace(bm,"}").replace(vm,"^")}function u_(e){return Ko(e).replace(n_,"%3D")}function p_(e){return Xc(e).replace(hm,"%23").replace(a_,"%3F")}function f_(e){return p_(e).replace(s_,"%2F")}function sl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const h_=/\/$/,m_=e=>e.replace(h_,"");function io(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=y_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:sl(l)}}function v_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Cu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function g_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&li(t.matched[n],s.matched[a])&&ym(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function li(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function ym(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!b_(e[s],t[s]))return!1;return!0}function b_(e,t){return Gs(e)?Eu(e,t):Gs(t)?Eu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Eu(e,t){return Gs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function y_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Bn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Wo=(function(e){return e.pop="pop",e.push="push",e})({}),lo=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function x_(e){if(!e)if(Fa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),m_(e)}const __=/^[^#]+#/;function w_(e,t){return e.replace(__,"#")+t}function k_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Br=()=>({left:window.scrollX,top:window.scrollY});function S_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=k_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Au(e,t){return(history.state?history.state.position-t:-1)+e}const Zo=new Map;function T_(e,t){Zo.set(e,t)}function C_(e){const t=Zo.get(e);return Zo.delete(e),t}function E_(e){return typeof e=="string"||e&&typeof e=="object"}function xm(e){return typeof e=="string"||typeof e=="symbol"}let _t=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const _m=Symbol("");_t.MATCHER_NOT_FOUND+"",_t.NAVIGATION_GUARD_REDIRECT+"",_t.NAVIGATION_ABORTED+"",_t.NAVIGATION_CANCELLED+"",_t.NAVIGATION_DUPLICATED+"";function ri(e,t){return it(new Error,{type:e,[_m]:!0},t)}function pn(e,t){return e instanceof Error&&_m in e&&(t==null||!!(e.type&t))}const A_=["params","query","hash"];function R_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of A_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function I_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(mm," "),i=a.indexOf("="),l=sl(i<0?a:a.slice(0,i)),r=i<0?null:sl(a.slice(i+1));if(l in t){let o=t[l];Gs(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function Ru(e){let t="";for(let s in e){const n=e[s];if(s=u_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Gs(n)?n.map(a=>a&&Ko(a)):[n&&Ko(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function O_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Gs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const L_=Symbol(""),Iu=Symbol(""),Ur=Symbol(""),ed=Symbol(""),Jo=Symbol("");function bi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function qn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(ri(_t.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):E_(p)?o(ri(_t.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function ro(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(fm(o)){const c=(o.__vccOpts||o)[t];c&&i.push(qn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=e_(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&qn(p,s,n,l,r,a)()}))}}return i}function N_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>li(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>li(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let D_=()=>location.protocol+"//"+location.host;function wm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),Cu(r,"")}return Cu(s,e)+n+a}function P_(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const h=wm(e,location),m=s.value,v=t.value;let T=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}T=v?p.position-v.position:0}else n(h);a.forEach(I=>{I(s.value,m,{delta:T,type:Wo.pop,direction:T?T>0?lo.forward:lo.back:lo.unknown})})};function o(){l=s.value}function c(p){a.push(p);const h=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(it({},p.state,{scroll:Br()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function Ou(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Br():null}}function M_(e){const{history:t,location:s}=window,n={value:wm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:D_()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(o,c){i(o,it({},t.state,Ou(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=it({},a.value,t.state,{forward:o,scroll:Br()});i(d.current,d,!0),i(o,it({},Ou(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function F_(e){e=x_(e);const t=M_(e),s=P_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=it({location:"",base:e,go:n,createHref:w_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function $_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),F_(e)}let ca=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Nt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Nt||{});const B_={type:ca.Static,value:""},U_=/[a-zA-Z0-9_]/;function H_(e){if(!e)return[[]];if(e==="/")return[[B_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Nt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Nt.Static?i.push({type:ca.Static,value:c}):s===Nt.Param||s===Nt.ParamRegExp||s===Nt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:ca.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Nt.ParamRegExp){n=s,s=Nt.EscapeNext;continue}switch(s){case Nt.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Nt.Param):p();break;case Nt.EscapeNext:p(),s=n;break;case Nt.Param:o==="("?s=Nt.ParamRegExp:U_.test(o)?p():(u(),s=Nt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Nt.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Nt.ParamRegExpEnd:d+=o;break;case Nt.ParamRegExpEnd:u(),s=Nt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Nt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Lu="[^/]+?",z_={sensitive:!1,strict:!1,start:!0,end:!0};var is=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(is||{});const j_=/[.+*?^${}()[\]/\\]/g;function V_(e,t){const s=it({},z_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[is.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=is.Segment+(s.sensitive?is.BonusCaseSensitive:0);if(p.type===ca.Static)u||(a+="/"),a+=p.value.replace(j_,"\\$&"),h+=is.Static;else if(p.type===ca.Param){const{value:m,repeatable:v,optional:T,regexp:I}=p;i.push({name:m,repeatable:v,optional:T});const y=I||Lu;if(y!==Lu){h+=is.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let g=v?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=T&&c.length<2?`(?:/${g})`:"/"+g),T&&(g+="?"),a+=g,h+=is.Dynamic,T&&(h+=is.BonusOptional),v&&(h+=is.BonusRepeatable),y===".*"&&(h+=is.BonusWildcard)}d.push(h)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=is.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===ca.Static)d+=h.value;else if(h.type===ca.Param){const{value:m,repeatable:v,optional:T}=h,I=m in c?c[m]:"";if(Gs(I)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Gs(I)?I.join("/"):I;if(!y)if(T)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function q_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===is.Static+is.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===is.Static+is.Segment?1:-1:0}function km(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=q_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Nu(n))return 1;if(Nu(a))return-1}return a.length-n.length}function Nu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const G_={strict:!1,end:!0,sensitive:!1};function K_(e,t,s){const n=V_(H_(e.path),s),a=it(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function W_(e,t){const s=[],n=new Map;t=Tu(G_,t);function a(u){return n.get(u)}function i(u,p,h){const m=!h,v=Pu(u);v.aliasOf=h&&h.record;const T=Tu(t,u),I=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of b)I.push(Pu(it({},v,{components:h?h.record.components:v.components,path:S,aliasOf:h?h.record:v})))}let y,g;for(const b of I){const{path:S}=b;if(p&&S[0]!=="/"){const w=p.record.path,E=w[w.length-1]==="/"?"":"/";b.path=p.record.path+(S&&E+S)}if(y=K_(b,p,T),h?h.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),m&&u.name&&!Mu(y)&&l(u.name)),Sm(y)&&o(y),v.children){const w=v.children;for(let E=0;E<w.length;E++)i(w[E],y,h&&h.children[E])}h=h||y}return g?()=>{l(g)}:Pi}function l(u){if(xm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=Y_(u,s);s.splice(p,0,u),u.record.name&&!Mu(u)&&n.set(u.record.name,u)}function c(u,p){let h,m={},v,T;if("name"in u&&u.name){if(h=n.get(u.name),!h)throw ri(_t.MATCHER_NOT_FOUND,{location:u});T=h.record.name,m=it(Du(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Du(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),T=h.record.name);else{if(h=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw ri(_t.MATCHER_NOT_FOUND,{location:u,currentLocation:p});T=h.record.name,m=it({},p.params,u.params),v=h.stringify(m)}const I=[];let y=h;for(;y;)I.unshift(y.record),y=y.parent;return{name:T,path:v,params:m,matched:I,meta:J_(I)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Du(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Pu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Z_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Z_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Mu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function J_(e){return e.reduce((t,s)=>it(t,s.meta),{})}function Y_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;km(e,t[i])<0?n=i:s=i+1}const a=Q_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function Q_(e){let t=e;for(;t=t.parent;)if(Sm(t)&&km(e,t)===0)return t}function Sm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Fu(e){const t=Ds(Ur),s=Ds(ed),n=J(()=>{const o=tn(e.to);return t.resolve(o)}),a=J(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(li.bind(null,d));if(p>-1)return p;const h=$u(o[c-2]);return c>1&&$u(d)===h&&u[u.length-1].path!==h?u.findIndex(li.bind(null,o[c-2])):p}),i=J(()=>a.value>-1&&nw(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&ym(s.params,n.value.params));function r(o={}){if(sw(o)){const c=t[tn(e.replace)?"replace":"push"](tn(e.to)).catch(Pi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function X_(e){return e.length===1?e[0]:e}const ew=rl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Fu,setup(e,{slots:t}){const s=Zn(Fu(e)),{options:n}=Ds(Ur),a=J(()=>({[Bu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Bu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&X_(t.default(s));return e.custom?i:Xa("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),tw=ew;function sw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function nw(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Gs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function $u(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Bu=(e,t,s)=>e??t??s,aw=rl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ds(Jo),a=J(()=>e.route||n.value),i=Ds(Iu,0),l=J(()=>{let c=tn(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=J(()=>a.value.matched[l.value]);Ii(Iu,J(()=>l.value+1)),Ii(L_,r),Ii(Jo,a);const o=f();return os(()=>[o.value,r.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!li(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return Uu(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,T=Xa(p,it({},m,t,{onVnodeUnmounted:I=>{I.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Uu(s.default,{Component:T,route:c})||T}}});function Uu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const iw=aw;function lw(e){const t=W_(e.routes,e),s=e.parseQuery||I_,n=e.stringifyQuery||Ru,a=e.history,i=bi(),l=bi(),r=bi(),o=dc(Bn);let c=Bn;Fa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=ao.bind(null,Y=>""+Y),u=ao.bind(null,f_),p=ao.bind(null,sl);function h(Y,be){let H,oe;return xm(Y)?(H=t.getRecordMatcher(Y),oe=be):oe=Y,t.addRoute(oe,H)}function m(Y){const be=t.getRecordMatcher(Y);be&&t.removeRoute(be)}function v(){return t.getRoutes().map(Y=>Y.record)}function T(Y){return!!t.getRecordMatcher(Y)}function I(Y,be){if(be=it({},be||o.value),typeof Y=="string"){const P=io(s,Y,be.path),U=t.resolve({path:P.path},be),ae=a.createHref(P.fullPath);return it(P,U,{params:p(U.params),hash:sl(P.hash),redirectedFrom:void 0,href:ae})}let H;if(Y.path!=null)H=it({},Y,{path:io(s,Y.path,be.path).path});else{const P=it({},Y.params);for(const U in P)P[U]==null&&delete P[U];H=it({},Y,{params:u(P)}),be.params=u(be.params)}const oe=t.resolve(H,be),ue=Y.hash||"";oe.params=d(p(oe.params));const Oe=v_(n,it({},Y,{hash:d_(ue),path:oe.path})),_=a.createHref(Oe);return it({fullPath:Oe,hash:ue,query:n===Ru?O_(Y.query):Y.query||{}},oe,{redirectedFrom:void 0,href:_})}function y(Y){return typeof Y=="string"?io(s,Y,o.value.path):it({},Y)}function g(Y,be){if(c!==Y)return ri(_t.NAVIGATION_CANCELLED,{from:be,to:Y})}function b(Y){return E(Y)}function S(Y){return b(it(y(Y),{replace:!0}))}function w(Y,be){const H=Y.matched[Y.matched.length-1];if(H&&H.redirect){const{redirect:oe}=H;let ue=typeof oe=="function"?oe(Y,be):oe;return typeof ue=="string"&&(ue=ue.includes("?")||ue.includes("#")?ue=y(ue):{path:ue},ue.params={}),it({query:Y.query,hash:Y.hash,params:ue.path!=null?{}:Y.params},ue)}}function E(Y,be){const H=c=I(Y),oe=o.value,ue=Y.state,Oe=Y.force,_=Y.replace===!0,P=w(H,oe);if(P)return E(it(y(P),{state:typeof P=="object"?it({},ue,P.state):ue,force:Oe,replace:_}),be||H);const U=H;U.redirectedFrom=be;let ae;return!Oe&&g_(n,oe,H)&&(ae=ri(_t.NAVIGATION_DUPLICATED,{to:U,from:oe}),q(oe,oe,!0,!1)),(ae?Promise.resolve(ae):D(U,oe)).catch(te=>pn(te)?pn(te,_t.NAVIGATION_GUARD_REDIRECT)?te:G(te):O(te,U,oe)).then(te=>{if(te){if(pn(te,_t.NAVIGATION_GUARD_REDIRECT))return E(it({replace:_},y(te.to),{state:typeof te.to=="object"?it({},ue,te.to.state):ue,force:Oe}),be||U)}else te=R(U,oe,!0,_,ue);return A(U,oe,te),te})}function C(Y,be){const H=g(Y,be);return H?Promise.reject(H):Promise.resolve()}function x(Y){const be=X.values().next().value;return be&&typeof be.runWithContext=="function"?be.runWithContext(Y):Y()}function D(Y,be){let H;const[oe,ue,Oe]=N_(Y,be);H=ro(oe.reverse(),"beforeRouteLeave",Y,be);for(const P of oe)P.leaveGuards.forEach(U=>{H.push(qn(U,Y,be))});const _=C.bind(null,Y,be);return H.push(_),Pe(H).then(()=>{H=[];for(const P of i.list())H.push(qn(P,Y,be));return H.push(_),Pe(H)}).then(()=>{H=ro(ue,"beforeRouteUpdate",Y,be);for(const P of ue)P.updateGuards.forEach(U=>{H.push(qn(U,Y,be))});return H.push(_),Pe(H)}).then(()=>{H=[];for(const P of Oe)if(P.beforeEnter)if(Gs(P.beforeEnter))for(const U of P.beforeEnter)H.push(qn(U,Y,be));else H.push(qn(P.beforeEnter,Y,be));return H.push(_),Pe(H)}).then(()=>(Y.matched.forEach(P=>P.enterCallbacks={}),H=ro(Oe,"beforeRouteEnter",Y,be,x),H.push(_),Pe(H))).then(()=>{H=[];for(const P of l.list())H.push(qn(P,Y,be));return H.push(_),Pe(H)}).catch(P=>pn(P,_t.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function A(Y,be,H){r.list().forEach(oe=>x(()=>oe(Y,be,H)))}function R(Y,be,H,oe,ue){const Oe=g(Y,be);if(Oe)return Oe;const _=be===Bn,P=Fa?history.state:{};H&&(oe||_?a.replace(Y.fullPath,it({scroll:_&&P&&P.scroll},ue)):a.push(Y.fullPath,ue)),o.value=Y,q(Y,be,H,_),G()}let z;function V(){z||(z=a.listen((Y,be,H)=>{if(!ce.listening)return;const oe=I(Y),ue=w(oe,ce.currentRoute.value);if(ue){E(it(ue,{replace:!0,force:!0}),oe).catch(Pi);return}c=oe;const Oe=o.value;Fa&&T_(Au(Oe.fullPath,H.delta),Br()),D(oe,Oe).catch(_=>pn(_,_t.NAVIGATION_ABORTED|_t.NAVIGATION_CANCELLED)?_:pn(_,_t.NAVIGATION_GUARD_REDIRECT)?(E(it(y(_.to),{force:!0}),oe).then(P=>{pn(P,_t.NAVIGATION_ABORTED|_t.NAVIGATION_DUPLICATED)&&!H.delta&&H.type===Wo.pop&&a.go(-1,!1)}).catch(Pi),Promise.reject()):(H.delta&&a.go(-H.delta,!1),O(_,oe,Oe))).then(_=>{_=_||R(oe,Oe,!1),_&&(H.delta&&!pn(_,_t.NAVIGATION_CANCELLED)?a.go(-H.delta,!1):H.type===Wo.pop&&pn(_,_t.NAVIGATION_ABORTED|_t.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),A(oe,Oe,_)}).catch(Pi)}))}let le=bi(),M=bi(),N;function O(Y,be,H){G(Y);const oe=M.list();return oe.length?oe.forEach(ue=>ue(Y,be,H)):console.error(Y),Promise.reject(Y)}function B(){return N&&o.value!==Bn?Promise.resolve():new Promise((Y,be)=>{le.add([Y,be])})}function G(Y){return N||(N=!Y,V(),le.list().forEach(([be,H])=>Y?H(Y):be()),le.reset()),Y}function q(Y,be,H,oe){const{scrollBehavior:ue}=e;if(!Fa||!ue)return Promise.resolve();const Oe=!H&&C_(Au(Y.fullPath,0))||(oe||!H)&&history.state&&history.state.scroll||null;return At().then(()=>ue(Y,be,Oe)).then(_=>_&&S_(_)).catch(_=>O(_,Y,be))}const Q=Y=>a.go(Y);let ie;const X=new Set,ce={currentRoute:o,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:T,getRoutes:v,resolve:I,options:e,push:b,replace:S,go:Q,back:()=>Q(-1),forward:()=>Q(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:M.add,isReady:B,install(Y){Y.component("RouterLink",tw),Y.component("RouterView",iw),Y.config.globalProperties.$router=ce,Object.defineProperty(Y.config.globalProperties,"$route",{enumerable:!0,get:()=>tn(o)}),Fa&&!ie&&o.value===Bn&&(ie=!0,b(a.location).catch(oe=>{}));const be={};for(const oe in Bn)Object.defineProperty(be,oe,{get:()=>o.value[oe],enumerable:!0});Y.provide(Ur,ce),Y.provide(ed,cc(be)),Y.provide(Jo,o);const H=Y.unmount;X.add(Y),Y.unmount=function(){X.delete(Y),X.size<1&&(c=Bn,z&&z(),z=null,o.value=Bn,ie=!1,N=!1),H()}}};function Pe(Y){return Y.reduce((be,H)=>be.then(()=>x(H)),Promise.resolve())}return ce}function Tm(){return Ds(Ur)}function rw(e){return Ds(ed)}const Hr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=rw(),s=Tm(),n=J({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});os(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},ow={setup(){const e=f([]),t=f([]),s=f({}),n=50;function a(p){var v,T,I,y,g;const h=p.payload||p,m=h.type||p.type;if(m==="tool_start"){const b=((v=h.metadata)==null?void 0:v.call_id)||null,S={callId:b,id:b||`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:((T=h.metadata)==null?void 0:T.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(m==="tool_end"){const b=((I=h.metadata)==null?void 0:I.call_id)||null;let S=-1;if(b&&(S=e.value.findIndex(w=>w.callId===b&&w.status==="running")),S<0&&!b)for(let w=e.value.length-1;w>=0;w--){const E=e.value[w];if(E.tool===h.action&&E.status==="running"){S=w;break}}if(S>=0){const w=e.value[S];w.status=(y=h.metadata)!=null&&y.error?"error":"success",w.elapsed=((g=h.metadata)==null?void 0:g.elapsed_ms)||Date.now()-w.startTime,w.result=h.detail||"",w.fadingOut=!0,setTimeout(()=>{const E=e.value.indexOf(w);E>=0&&e.value.splice(E,1),t.value.unshift(w),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const b=h.call_id||h.tool_name||"unknown";if(h.finished){const S={...s.value};delete S[b],s.value=S}else{const w=((s.value[b]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[b]:w.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let r=!1;function o(){r||(r=!0,Ye.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Ye.off("events",a),i&&(clearInterval(i),i=null))}Ke(o),us(o),ts(c),mt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function td(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ka(e){const t=td(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function cw(e){const t=td(e);return t?t.toLocaleTimeString():"—"}function Cm(e){const t=td(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function dw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function oi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function sd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Em(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Hu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function nd(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function Am(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Rm=Symbol("agent-detail-cancelled"),uw=15e3;function pw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((h,m)=>{o=h,c=m});function u(h,m){r||(r=!0,l!==null&&a(l),l=null,(h?o:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return r||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Rm),i==null||i.abort()}}}function Im({state:e,requestDetail:t,timeoutMs:s=uw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const T=pw(I=>t(p,{signal:I}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=T.cancel,v.promise=(async()=>{let I=null,y=null;try{I=await T.promise}catch(g){y=g}I!==Rm&&(l!==v||e.detailId!==p||(l=null,!y&&(I===null||typeof I!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=I,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function fw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const hw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f(!0),i=f("all");let l=!1;const r=J(()=>e.value.filter(O=>O.status==="running").length),o=J(()=>e.value.filter(O=>O.status==="completed").length),c=J(()=>e.value.filter(O=>["failed","timeout","killed"].includes(O.status)).length),d=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(O=>["failed","timeout","killed"].includes(O.status)):e.value.filter(O=>O.status===i.value));function p(O){const B=Number(O.max_iterations)||0;return B<=0?0:Math.min(100,Math.round(O.iteration_count/B*100))}function h(O){return(Number(O.max_iterations)||0)>0}function m(O,B){return O?O==="N/A"?"N/A":B==="current_inheritance"?`inherit (currently ${O})`:O:"unknown"}function v(O){return m(O.display_model,O.display_model_source||O.display_source)}function T(O){return m(O.display_reasoning_effort,O.display_reasoning_effort_source||O.display_source)}function I(O){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[O]||""}const y=f(null),g=f(null),b=f(!1),S=f(null),w=f(""),C=Im({state:{get detail(){return y.value},set detail(O){y.value=O},get detailId(){return g.value},set detailId(O){g.value=O},get detailLoading(){return b.value},set detailLoading(O){b.value=O},get detailError(){return S.value},set detailError(O){S.value=O}},requestDetail:(O,{signal:B})=>W.get(`/api/agents/${encodeURIComponent(O)}`,{signal:B})});async function x(O){w.value="",await C.open(O.id)}function D(){C.close(),w.value=""}async function A(){await C.refresh()}async function R(O,B){try{await navigator.clipboard.writeText(B||""),w.value=O,setTimeout(()=>{w.value===O&&(w.value="")},1500)}catch{Re.error("Copy failed")}}async function z(O=!1){O=O===!0,O||(t.value=!0);try{const B=await W.get("/api/agents");e.value=Array.isArray(B)?B:[],s.value=null}catch(B){O||(s.value=B.message)}O||(t.value=!1)}async function V(O){const B=e.value.find(q=>q.id===O);if(await Xt({title:"Kill agent",message:`Kill agent "${(B==null?void 0:B.label)||O}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=O;try{await W.del(`/api/agents/${encodeURIComponent(O)}`),Re.success("Agent killed"),await z()}catch(q){Re.error(q.message||"Failed to kill agent")}n.value=null}}const le=fw({isEnabled:()=>a.value&&l,refreshList:()=>z(!0),hasOpenDetail:()=>!!g.value,refreshDetail:A});function M(){le.start()}function N(){le.stop()}return os(a,()=>le.sync()),Ke(()=>{l=!0,z(),M()}),us(()=>{l=!0,z(!0),M()}),ts(()=>{l=!1,N()}),mt(()=>{l=!1,N(),C.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ka,formatDuration:oi,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:T,displaySourceLabel:I,detail:y,detailId:g,detailLoading:b,detailError:S,copied:w,openDetail:x,closeDetail:D,copyText:R,fetchAgents:z,killAgent:V,startAutoRefresh:M,stopAutoRefresh:N}}},mw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!1),a=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),r=f(null),o=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const T=Im({state:{get detail(){return c.value},set detail(N){c.value=N},get detailId(){return d.value},set detailId(N){d.value=N},get detailLoading(){return u.value},set detailLoading(N){u.value=N},get detailError(){return p.value},set detailError(N){p.value=N}},detailLabel:"Loop detail",requestDetail:(N,{signal:O})=>W.get(`/api/loops/${encodeURIComponent(N)}?limit=100`,{signal:O})});async function I(N){h.value="",await T.open(N.id)}function y(){T.close(),h.value=""}async function g(N,O){try{await navigator.clipboard.writeText(O||""),h.value=N,setTimeout(()=>{h.value===N&&(h.value="")},1500)}catch{Re.error("Copy failed")}}const b=J(()=>e.value.reduce((N,O)=>N+(O.iteration_count||0),0)),S=J(()=>e.value.filter(N=>N.status==="running").length);function w(N){return N==="running"?"loop-status-running":N==="error"?"loop-status-error":"loop-status-stopped"}function E(N){return N==="running"?"badge-success":N==="error"?"badge-danger":N==="completed"?"badge-info":"badge-warning"}function C(N){return N==="act"?"badge-warning":N==="silent"?"badge-info":"badge-success"}async function x(N=!1){N=N===!0,N||(t.value=!0);try{const O=await W.get("/api/loops");e.value=Array.isArray(O)?O:[],s.value=null}catch(O){N||(s.value=O.message)}N||(t.value=!1)}async function D(){l.value=null;const N=a.value;if(!N.goal.trim()){l.value="Goal is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}const O={goal:N.goal.trim(),channel_id:N.channel_id.trim(),interval_seconds:N.interval_seconds||60,mode:N.mode,max_iterations:N.max_iterations||50};N.stop_condition.trim()&&(O.stop_condition=N.stop_condition.trim()),i.value=!0;try{const B=await W.post("/api/loops",O);Re.success(`Loop started: ${B.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await x()}catch(B){l.value=B.message}i.value=!1}async function A(N){if(await Xt({title:"Stop loop",message:`Stop loop ${N}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=N;try{await W.del(`/api/loops/${encodeURIComponent(N)}`),Re.success("Loop stopped"),await x()}catch(B){Re.error(B.message||"Failed to stop loop")}r.value=null}}async function R(N){o.value=N;try{await W.post(`/api/loops/${encodeURIComponent(N)}/restart`),Re.success("Loop restarted"),await x()}catch(O){Re.error(O.message||"Failed to restart loop")}o.value=null}function z(N){m&&N.payload&&(N.payload.loop_id||N.payload.type==="loop")&&(x(!0),d.value&&T.refresh())}let V=null;function le(){V!==null&&clearInterval(V),V=null}function M(){le(),m&&(V=setInterval(()=>{x(!0),d.value&&T.refresh()},5e3))}return Ke(()=>{m=!0,x(),Ye.subscribe("events",z),M()}),us(()=>{m=!0,x(!0),M()}),ts(()=>{m=!1,le()}),mt(()=>{m=!1,Ye.unsubscribe("events",z),le(),T.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:S,statusDotClass:w,statusBadge:E,modeBadge:C,formatAge:Cm,formatDuration:oi,formatTs:ka,formatTokens:Am,openDetail:I,closeDetail:y,copyText:g,fetchLoops:x,doCreate:D,doStop:A,doRestart:R}}},vw={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!0);let a=null;const i=f(null),l=J(()=>e.value.filter(y=>y.status==="running").length),r=J(()=>e.value.filter(y=>y.status!=="running").length);function o(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await W.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}os(n,y=>{y?u():p()});async function h(y){if(await Xt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await W.del(`/api/processes/${y}`),Re.success(`Process ${y} killed`),await d()}catch(b){Re.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let v=!1;function T(){v||(v=!0,d(),Ye.subscribe("events",m),u())}function I(){v&&(v=!1,Ye.unsubscribe("events",m),p())}return Ke(T),us(T),ts(I),mt(I),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:oi,fetchProcesses:d,doKill:h}}},gw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function zu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function bw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function yw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function xw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=gw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const T of new Set([p,h])){const I=new Date(u+T*6e4);bw(I,c)===d&&(m.some(y=>y.getTime()===I.getTime())||m.push(I))}if(m.sort((T,I)=>T.getTime()-I.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(T=>({instant:T,offset:yw(T),iso:T.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const _w={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!1),a=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=f(!1),l=f(null),r=f(null),o=J(()=>xw(a.value.run_at));os(()=>a.value.run_at,()=>{r.value=null});const c=J(()=>{var oe;const H=o.value;return H.state==="ok"?H.instant:H.state==="ambiguous"&&r.value!==null&&((oe=H.options[r.value])==null?void 0:oe.instant)||null}),d=J(()=>{const H=c.value;return H?`${H.toLocaleString()} local — ${H.toISOString()} UTC`:""}),u=f(null),p=f(!1),h=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=f(null),v=f(null),T=f(null),I=f(null),y=f(null),g=f(null),b=f([]),S=f(!1),w=f("");let E=0;const C=J(()=>e.value.filter(H=>H.cron&&!H.one_time).length),x=J(()=>e.value.filter(H=>H.one_time).length),D=J(()=>e.value.filter(H=>H.trigger).length),A=J(()=>e.value.filter(H=>H.paused).length),R=J(()=>e.value.filter(H=>H.consecutive_failures>0).length);function z(H){if(!H)return"-";const oe=Date.now(),Oe=(new Date(H).getTime()-oe)/1e3;if(Oe<0)return"overdue";if(Oe<60)return"in < 1 min";if(Oe<3600)return`in ${Math.floor(Oe/60)} min`;if(Oe<86400){const P=Math.floor(Oe/3600),U=Math.floor(Oe%3600/60);return U>0?`in ${P}h ${U}m`:`in ${P}h`}const _=Math.floor(Oe/86400);return`in ${_} day${_!==1?"s":""}`}function V(H){return H==null?"-":H<1e3?`${H}ms`:H<6e4?`${(H/1e3).toFixed(1)}s`:oi(H/1e3)}function le(H=a.value.cron){a.value.cron=H,zu(a.value,"cron"),u.value=null}function M(H=a.value.run_at){a.value.run_at=H,zu(a.value,"run_at"),u.value=null}async function N(){const H=a.value.cron.trim();if(H){p.value=!0;try{u.value=await W.post("/api/schedules/validate-cron",{expression:H})}catch(oe){u.value={valid:!1,error:oe.message}}p.value=!1}}async function O(){t.value=!0,s.value=null;try{e.value=await W.get("/api/schedules")}catch(H){s.value=H.message}t.value=!1}async function B(H){if(g.value===H){g.value=null,b.value=[];return}g.value=H,S.value=!0,b.value=[];const oe=++E;try{const ue=await W.get(`/api/schedules/${encodeURIComponent(H)}/history?limit=10`);if(oe!==E||g.value!==H)return;b.value=ue,w.value=""}catch(ue){if(oe!==E||g.value!==H)return;b.value=[],w.value=ue.message||"Failed to load execution history"}oe===E&&(S.value=!1)}async function G(){l.value=null;const H=a.value;if(!H.description.trim()){l.value="Description is required";return}if(!H.channel_id.trim()){l.value="Channel ID is required";return}if(!H.cron.trim()&&!H.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(H.cron.trim()&&H.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const oe={description:H.description.trim(),action:H.action,channel_id:H.channel_id.trim()};if(H.cron.trim()&&(oe.cron=H.cron.trim()),H.run_at.trim()){const ue=o.value;if(ue.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){l.value="One-time run time is not a valid date";return}const Oe=c.value;if(ue.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Oe){l.value="One-time run time could not be resolved";return}oe.run_at=Oe.toISOString()}if(H.action==="reminder"&&H.message.trim()&&(oe.message=H.message.trim()),H.action==="check"&&(H.tool_name.trim()&&(oe.tool_name=H.tool_name.trim()),H.report_format&&(oe.report_format=H.report_format),H.tool_input_str.trim()))try{oe.tool_input=JSON.parse(H.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await W.post("/api/schedules",oe),Re.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await O()}catch(ue){l.value=ue.message}i.value=!1}async function q(H){m.value=H;try{const oe=await W.post(`/api/schedules/${encodeURIComponent(H)}/run`);if(oe.status==="failure")Re.error(`Execution failed: ${oe.error||"unknown error"}`);else{const ue=oe.warning?`Executed (${oe.warning})`:"Executed successfully";Re.success(ue)}await O()}catch(oe){Re.error(oe.message||"Failed to trigger")}m.value=null}async function Q(H){T.value=H.id;const oe=!H.paused;try{await W.put(`/api/schedules/${encodeURIComponent(H.id)}`,{paused:oe}),Re.success(oe?"Schedule paused":"Schedule resumed"),await O()}catch(ue){Re.error(ue.message||"Failed to update schedule")}T.value=null}const ie=new Map;function X(H,oe){const ue=ie.get(H.id);ue&&clearTimeout(ue.timer);const Oe={run:()=>ce(H,oe),timer:null};Oe.timer=setTimeout(()=>{ie.delete(H.id),Oe.run()},500),ie.set(H.id,Oe)}async function ce(H,oe){y.value=H.id;try{await W.put(`/api/schedules/${encodeURIComponent(H.id)}`,{report_format:oe}),Re.success(oe?"Structured report enabled":"Plain-text report enabled")}catch(ue){Re.error(`Update failed: ${ue.message}`)}finally{await O(),y.value=null}}function Pe(){for(const[H,oe]of[...ie])clearTimeout(oe.timer),ie.delete(H),oe.run()}async function Y(H){I.value=H;try{await W.post(`/api/schedules/${encodeURIComponent(H)}/reset-failures`),Re.success("Failure counters reset"),await O()}catch(oe){Re.error(oe.message||"Failed to reset")}I.value=null}async function be(H){const oe=e.value.find(Oe=>Oe.id===H);if(await Xt({title:"Delete schedule",message:`Delete "${(oe==null?void 0:oe.description)||H}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=H;try{await W.del(`/api/schedules/${encodeURIComponent(H)}`),Re.success("Schedule deleted"),await O()}catch(Oe){Re.error(Oe.message||"Failed to delete schedule")}v.value=null}}return Ke(()=>{O()}),mt(Pe),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:p,cronPresets:h,runningId:m,deletingId:v,togglingId:T,resettingId:I,reportUpdatingId:y,flushReportFormatTimers:Pe,expandedId:g,history:b,historyLoading:S,historyError:w,cronCount:C,oneTimeCount:x,webhookCount:D,pausedCount:A,failingCount:R,formatTs:ka,formatAge:Cm,formatFuture:z,formatMs:V,formatDuration:oi,onCronInput:le,onRunAtInput:M,validateCron:N,toggleExpand:B,fetchSchedules:O,doCreate:G,doRunNow:q,doTogglePause:Q,doUpdateReportFormat:X,doResetFailures:Y,doDelete:be}}},Om=[{id:"live",label:"Live",component:ow},{id:"agents",label:"Agents",component:hw},{id:"loops",label:"Loops",component:mw},{id:"processes",label:"Processes",component:vw},{id:"schedules",label:"Schedules",component:_w}],ww={components:{TabbedPage:Hr},setup(){return{tabs:Om}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},kw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){n.value=n.value===m?null:m}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let o=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await W.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++o;t.value=!0,s.value=null,n.value=null;try{const v=new URLSearchParams;a.value.tool&&v.set("tool",a.value.tool),a.value.user&&v.set("user",a.value.user),a.value.keyword&&v.set("q",a.value.keyword),a.value.date&&v.set("date",a.value.date),v.set("limit",String(a.value.limit));const T=v.toString(),I=await W.get(`/api/audit${T?"?"+T:""}`);if(m!==o)return;e.value=Array.isArray(I)?I:[]}catch(v){if(m!==o)return;s.value=v.message}m===o&&(t.value=!1)}return Ke(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ka,formatDetail:i,truncateBlock:Em,toggleExpand:l,clearFilters:r,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},ju=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Sw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],Tw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f(null),i=f(!1);let l=0;const r=f(null),o=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=ju,T=Sw,I=f([]),y=f(!1),g=f(""),b=f("flat"),S=f(new Set),w=f(""),E=f(""),C=f(""),x=f(null),D=f(!1);function A(){try{const se=localStorage.getItem("odin-session-presets");se&&(I.value=JSON.parse(se))}catch{}}function R(){try{localStorage.setItem("odin-session-presets",JSON.stringify(I.value))}catch{}}const z=J(()=>p.value.trim()!==""||u.value!=="all"),V=J(()=>{let se=[...e.value];const _e=ju.find(Ue=>Ue.id===u.value),Ie=_e?_e.filters:{};if(Ie.source&&(se=se.filter(Ue=>Ue.source===Ie.source)),Ie.minMessages&&(se=se.filter(Ue=>Ue.message_count>=Ie.minMessages)),Ie.hasCompaction&&(se=se.filter(Ue=>Ue.has_summary)),Ie.maxAge!=null){const Ue=Date.now()/1e3;se=se.filter(gt=>gt.last_active&&Ue-gt.last_active<=Ie.maxAge)}if(p.value.trim()){const Ue=p.value.toLowerCase().trim();se=se.filter(gt=>(gt.channel_id||"").toLowerCase().includes(Ue)||(gt.last_user_id||"").toLowerCase().includes(Ue)||(gt.source||"").toLowerCase().includes(Ue))}const Ze=h.value,pt=m.value?1:-1;return se.sort((Ue,gt)=>{const ys=Ue[Ze]||0,kt=gt[Ze]||0;return(ys-kt)*pt}),se}),le=J(()=>{if(!a.value||!a.value.messages)return[];const se=a.value.messages;if(se.length===0)return[];const _e=[];let Ie=[];for(const Ze of se)Ze.role==="user"&&Ie.length>0&&(_e.push(Ie),Ie=[]),Ie.push(Ze);return Ie.length>0&&_e.push(Ie),_e}),M=J(()=>V.value.length>0&&c.value.size===V.value.length);function N(se){const _e=se.find(Ie=>Ie.role==="user");if(_e&&_e.content){const Ie=_e.content.slice(0,120);return Ie.length<_e.content.length?Ie+"...":Ie}return"(no user message)"}function O(se){const _e=new Set(S.value);_e.has(se)?_e.delete(se):_e.add(se),S.value=_e}function B(se){u.value=se}function G(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(h.value=se.filters.sortBy)}function q(){if(!g.value.trim())return;const se={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};I.value=[...I.value,se],R(),y.value=!1,g.value=""}function Q(se){I.value=I.value.filter(_e=>_e.id!==se),R(),u.value===se&&(u.value="all")}function ie(){u.value="all",p.value="",h.value="last_active",m.value=!1}function X(se){if(!se)return"—";const _e=Date.now()/1e3-se;if(_e<60)return"just now";if(_e<3600){const Ze=Math.floor(_e/60);return`${Ze} minute${Ze!==1?"s":""} ago`}if(_e<86400){const Ze=Math.floor(_e/3600);return`${Ze} hour${Ze!==1?"s":""} ago`}const Ie=Math.floor(_e/86400);return`${Ie} day${Ie!==1?"s":""} ago`}function ce(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function Pe(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function Y(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function be(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function H(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function oe(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ue(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function Oe(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function _(){const se=w.value.trim();if(se){D.value=!0;try{let _e=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;E.value.trim()&&(_e+=`&channel_id=${encodeURIComponent(E.value.trim())}`),C.value.trim()&&(_e+=`&user_id=${encodeURIComponent(C.value.trim())}`);const Ie=await W.get(_e);x.value=Ie.results||[]}catch{x.value=[]}D.value=!1}}function P(){w.value="",E.value="",C.value="",x.value=null}function U(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ae(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function te(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let ne=0;async function fe(){const se=++ne;t.value=!0,s.value=null;try{const _e=await W.get("/api/sessions");if(se!==ne)return;e.value=_e}catch(_e){if(se!==ne)return;s.value=_e.message}se===ne&&(t.value=!1)}function pe(){s.value=null,fe()}async function de(se){if(n.value===se){n.value=null,a.value=null,S.value=new Set;return}n.value=se,a.value=null,i.value=!0,S.value=new Set;const _e=++l;try{const Ie=await W.get(`/api/sessions/${encodeURIComponent(se)}`);_e===l&&n.value===se&&(a.value=Ie)}catch(Ie){_e===l&&n.value===se&&(a.value={messages:[],summary:"",error:Ie.message||"Failed to load session"})}finally{_e===l&&(i.value=!1)}}function re(se){const _e=new Set(c.value);_e.has(se)?_e.delete(se):_e.add(se),c.value=_e}function ke(){M.value?c.value=new Set:c.value=new Set(V.value.map(se=>se.channel_id))}function ge(se){r.value=se}async function we(){if(r.value){o.value=!0;try{await W.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await fe()}catch(se){s.value=se.message||"Failed to clear session"}o.value=!1,r.value=null}}function Ae(){d.value=!0}async function F(){if(c.value.size!==0){o.value=!0;try{await W.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await fe()}catch(se){s.value=se.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function me(se,_e){const Ie=`/api/sessions/${encodeURIComponent(se)}/export?format=${_e}`;try{const Ze=await W.getBlob(Ie),pt=URL.createObjectURL(Ze),Ue=document.createElement("a");Ue.href=pt,Ue.download=`session-${se}.${_e==="text"?"txt":"json"}`,Ue.click(),URL.revokeObjectURL(pt)}catch(Ze){s.value=Ze.message||"Failed to export session"}}let Se=null;function Le(se){se.payload&&se.payload.channel_id&&(clearTimeout(Se),Se=setTimeout(()=>{if(fe(),n.value&&se.payload.channel_id===n.value){const _e=n.value,Ie=l;W.get(`/api/sessions/${encodeURIComponent(_e)}`).then(Ze=>{Ie!==l||n.value!==_e||(a.value=Ze)}).catch(()=>{})}},2e3))}let De=!1,ct=null;function rt(){De||(De=!0,fe(),Ye.subscribe("events",Le),ct=Ye.onReconnected(()=>fe()))}Ke(()=>{A(),rt()}),us(()=>{rt()});function Mt(){De&&(De=!1,Ye.unsubscribe("events",Le),ct&&(ct(),ct=null),clearTimeout(Se))}return ts(Mt),mt(Mt),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:M,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:T,filteredSessions:V,hasActiveFilters:z,customPresets:I,showSavePreset:y,newPresetName:g,threadView:b,threads:le,collapsedThreads:S,ftsQuery:w,ftsChannelId:E,ftsUserId:C,ftsResults:x,ftsSearching:D,formatAge:X,formatTimestamp:ce,formatFullTimestamp:Pe,messageClass:Y,threadMsgClass:be,roleBadge:H,roleDotClass:oe,roleLabelClass:ue,truncateContent:Oe,threadSummary:N,fetchSessions:fe,retry:pe,toggleSession:de,toggleSelect:re,toggleSelectAll:ke,confirmClear:ge,clearSession:we,confirmBulkClear:Ae,doBulkClear:F,exportSession:me,applyPreset:B,applyCustomPreset:G,saveCustomPreset:q,removeCustomPreset:Q,resetFilters:ie,toggleThread:O,runFtsSearch:_,clearFtsSearch:P,highlightSnippet:U,ftsResultClass:ae,ftsTypeBadge:te}}},Cw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:Am}}},Ew={components:{ContextAssemblyPanel:Cw},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),n=f(null),a=f(null),i=f(null),l=f(""),r=f(""),o=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(E){if(!E)return"—";try{const C=new Date(E);return isNaN(C.getTime())?E:C.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return E}}function p(E){return!E&&E!==0?"—":E<1e3?E+"ms":(E/1e3).toFixed(1)+"s"}function h(E){return!E&&E!==0?"—":E>=1e3?(E/1e3).toFixed(1)+"k":String(E)}function m(E){if(!E)return"";if(typeof E=="string")return E;try{return JSON.stringify(E,null,2)}catch{return String(E)}}function v(E){a.value===E?a.value=null:(a.value=E,c.value={})}function T(E,C){const x=E+"-"+C;c.value={...c.value,[x]:!c.value[x]}}function I(E,C){return!!c.value[E+"-"+C]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,S()}async function g(){try{const E=await W.get("/api/trajectories");e.value=E.files||[],o.value=E.count||0}catch{}}let b=0;async function S(){const E=++b;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const C=await W.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(E!==b)return;let x=C.entries||[];d.value.tool_name&&(x=x.filter(D=>(D.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(x=x.filter(D=>D.is_error)),d.value.channel_id&&(x=x.filter(D=>D.channel_id===d.value.channel_id)),d.value.user_id&&(x=x.filter(D=>D.user_id===d.value.user_id)),t.value=x}else{const C=new URLSearchParams;d.value.channel_id&&C.set("channel_id",d.value.channel_id),d.value.user_id&&C.set("user_id",d.value.user_id),d.value.tool_name&&C.set("tool_name",d.value.tool_name),d.value.errors_only&&C.set("errors_only","true"),C.set("limit",String(d.value.limit));const x=C.toString(),D=await W.get(`/api/trajectories/search/query?${x}`);if(E!==b)return;t.value=D.results||[]}}catch(C){if(E!==b)return;n.value=C.message}E===b&&(s.value=!1)}async function w(){if(!l.value.trim())return;const E=++b;s.value=!0,n.value=null,c.value={};try{const C=await W.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(E!==b)return;i.value=C.entry||null,i.value||(n.value="No trace found for this message ID")}catch(C){if(E!==b)return;C.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=C.message}E===b&&(s.value=!1)}return Ke(async()=>{await g(),await S()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:Em,toggleExpand:v,toggleIteration:T,isIterationExpanded:I,clearFilters:y,fetchFiles:g,fetchTraces:S,lookupMessage:w}}};function Aw(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function Rw(e){return e?`${e.approximate?"~":""}${nd(e.total||0)}`:"0"}const Iw={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),a=f("7d"),i=f(0),l=f(Date.now());let r=null,o=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=J(()=>n.value.work||{}),h=J(()=>Math.max(1,...(n.value.activity_over_time||[]).map(w=>Number(w.count||0)))),m=J(()=>({minWidth:`max(100%, ${(n.value.activity_over_time||[]).length*5}px)`})),v=w=>({height:`${Math.max(4,Math.round(Number(w||0)/h.value*100))}%`}),T=J(()=>s.value&&l.value-i.value>3e4);async function I(){const w=++d,E=a.value;try{const C=await W.get(`/api/usage?range=${encodeURIComponent(E)}`);if(w!==d||E!==a.value)return;n.value=C,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(C){w===d&&(t.value=C.message)}finally{w===d&&(e.value=!1)}}function y(w){a.value=w,e.value=!s.value,I()}function g(){e.value=!0,I()}function b(){c||(c=!0,I(),r=setInterval(I,15e3),o=setInterval(()=>{l.value=Date.now()},1e3))}function S(){c&&(c=!1,d+=1,r&&clearInterval(r),o&&clearInterval(o),r=null,o=null)}return Ke(b),us(b),ts(S),mt(S),{data:n,work:p,loading:e,error:t,hasData:s,range:a,ranges:u,isStale:T,fmtNum:nd,fmtDuration:Aw,tokenLabel:Rw,activityTrackStyle:m,activityBar:v,selectRange:y,retry:g}}},Lm=[{id:"audit",label:"Audit",component:kw},{id:"sessions",label:"Sessions",component:Tw},{id:"traces",label:"Traces",component:Ew},{id:"usage",label:"Usage & Activity",component:Iw}],Ow={components:{TabbedPage:Hr},setup(){return{tabs:Lm}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},oo=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Lw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(""),a=f({}),i=f({}),l=f("cards"),r=f(null),o=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(x){return x.source!=="builtin"?"":u[x.state]||""}function h(x,D){const A=x&&Array.isArray(x.tools)?x.tools:null;if(c.value=!!A,o.value=A?!!x.global_enabled:null,!A){e.value=D.map(V=>({...V,source:"unknown",enabled:void 0,state:null}));return}const R=new Set(A.map(V=>V.name)),z=D.filter(V=>!R.has(V.name)).map(V=>({...V,source:V.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...A.map(V=>({...V,source:"builtin"})),...z]}async function m(x,D){if(d.value.has(x.name))return;const A=!!D.target.checked,R=new Set(d.value);R.add(x.name),d.value=R;try{const z=await W.post(`/api/tools/builtins/${encodeURIComponent(x.name)}/enabled`,{enabled:A});h(z,e.value),s.value=null;try{const V=await W.get("/api/tools");h(z,V)}catch(V){console.warn("Built-in toggle committed; visible catalog refresh failed",V)}}catch(z){D.target.checked=!!x.enabled,s.value=z.message||`Failed to toggle ${x.name}`}finally{const z=new Set(d.value);z.delete(x.name),d.value=z}}const v=J(()=>e.value.filter(x=>x.source==="builtin"&&x.is_core).length),T=J(()=>e.value.filter(x=>x.source==="skill").length),I=J(()=>Object.values(a.value).reduce((x,D)=>x+D,0));function y(x){for(const D of oo)if(D.id!=="other"&&D.match(x))return D.id;return"other"}const g=J(()=>{let x=e.value;if(n.value){const D=n.value.toLowerCase();x=x.filter(A=>A.name.toLowerCase().includes(D)||(A.description||"").toLowerCase().includes(D))}return r.value&&(x=x.filter(D=>y(D.name)===r.value)),x}),b=J(()=>{const x=new Set;for(const D of e.value)x.add(y(D.name));return oo.filter(D=>x.has(D.id))}),S=J(()=>{const x=g.value,D={};for(const R of x){const z=y(R.name);D[z]||(D[z]=[]),D[z].push(R)}const A=[];for(const R of oo)D[R.id]&&D[R.id].length>0&&A.push({label:R.label,icon:R.icon,tools:D[R.id].sort((z,V)=>z.name.localeCompare(V.name))});return A});function w(x){i.value={...i.value,[x]:!i.value[x]}}async function E(){t.value=!0,s.value=null;try{const[x,D,A]=await Promise.all([W.get("/api/tools"),W.get("/api/tools/stats").catch(()=>({})),W.get("/api/tools/builtins").catch(()=>null)]);h(A,x),a.value=D||{}}catch(x){s.value=x.message}t.value=!1}function C(){E()}return Ke(()=>{E()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,globalEnabled:o,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:T,totalUsage:I,filteredTools:g,groupedTools:S,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:sd,toggleExpand:w,refresh:C}}};function Nw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Dw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const Pw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f({}),a=f({}),i=f(null),l=f(""),r=f(null),o=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),T=f(null),I=f(!1),y=J(()=>e.value.length),g=J(()=>e.value.reduce((X,ce)=>X+(ce.execution_count||0),0)),b=J(()=>e.value.reduce((X,ce)=>X+D(ce.code),0)),S=J(()=>{if(!l.value)return e.value;const X=l.value.toLowerCase();return e.value.filter(ce=>ce.name.toLowerCase().includes(X)||(ce.description||"").toLowerCase().includes(X))}),w=J(()=>u.value?u.value.split(`
`).length:0),E=J(()=>{const X=Math.max(w.value,1);return Array.from({length:X},(ce,Pe)=>Pe+1).join(`
`)}),C=J(()=>{const X=u.value.trim();return X?X.includes("SKILL_DEFINITION")?X.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function x(X){return Nw(X)}function D(X){return X?X.split(`
`).length:0}function A(X){return Dw(X)}function R(X){n.value={...n.value,[X]:!n.value[X]}}async function z(X){try{await navigator.clipboard.writeText(X);const ce=e.value.find(Pe=>Pe.code===X);ce&&(r.value=ce.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function V(X){if(X.key==="Tab"){X.preventDefault();const ce=X.target,Pe=ce.selectionStart,Y=ce.selectionEnd;u.value=u.value.substring(0,Pe)+"    "+u.value.substring(Y),At(()=>{ce.selectionStart=ce.selectionEnd=Pe+4})}}function le(X){const ce=X.target.previousElementSibling;ce&&(ce.scrollTop=X.target.scrollTop)}async function M(){t.value=!0,s.value=null;try{e.value=await W.get("/api/skills")}catch(X){s.value=X.message}t.value=!1}async function N(X){i.value=X,delete a.value[X],a.value={...a.value};try{const ce=await W.post(`/api/skills/${encodeURIComponent(X)}/test`);a.value={...a.value,[X]:ce}}catch(ce){a.value={...a.value,[X]:{result:ce.message,is_error:!0}}}i.value=null}function O(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function B(X){o.value=!0,c.value="edit",d.value=X.name,u.value=X.code||"",p.value=null,h.value=null}function G(){o.value=!1,p.value=null,h.value=null}async function q(){p.value=null,h.value=null;const X=d.value.trim(),ce=u.value.trim();if(!X){p.value="Name is required";return}if(!ce){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await W.post("/api/skills",{name:X,code:ce}),h.value="Skill created successfully"):(await W.put(`/api/skills/${encodeURIComponent(X)}`,{code:ce}),h.value="Skill updated successfully"),await M(),setTimeout(()=>{o.value=!1},800)}catch(Pe){p.value=Pe.message}m.value=!1}function Q(X){T.value=X}async function ie(){if(T.value){I.value=!0;try{await W.del(`/api/skills/${encodeURIComponent(T.value)}`),await M()}catch(X){Re.error(`Failed to delete skill: ${X.message||"unknown error"}`)}I.value=!1,T.value=null}}return Ke(()=>{M()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:T,deleting:I,enabledCount:y,totalExecutions:g,totalLines:b,displayedSkills:S,editLineCount:w,editorLineNums:E,editValidation:C,highlight:x,truncate:sd,formatTs:ka,countLines:D,getLineNumbers:A,toggleCode:R,copyCode:z,handleEditorKey:V,syncScroll:le,fetchSkills:M,testSkill:N,showCreate:O,editSkill:B,cancelEdit:G,saveSkill:q,confirmDelete:Q,doDelete:ie}}};class Os extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Mw=/^[A-Za-z_][A-Za-z0-9_]*$/;function Vu(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function qu(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const r=String((l==null?void 0:l.key)||"").trim(),o=String((l==null?void 0:l.value)??"");if(!(!r&&!o)){if(!r)throw new Os(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(r))throw new Os(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,r))throw new Os(`${s} key “${r}” appears more than once.`,"authentication");if(i.has(r))throw new Os(`${s} key “${r}” cannot be replaced and removed in the same save.`,"authentication");n[r]=o}}return{set:n,remove:a}}function Fw(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function $w(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Os("Server name is required.","name");if(a.length>128||!Mw.test(a))throw new Os("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,r={enabled:!!e.enabled,transport:i};if(n&&(r.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Os("An executable path is required for a new stdio connection.","command");if(d&&(r.command=d),(n||e.replaceArgs)&&(r.args=Vu(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Os("Working directory must be an absolute path.","cwd");r.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Os("An HTTP endpoint is required for this connection.","url");if(d&&!Fw(d))throw new Os("Endpoint must be a valid http:// or https:// URL.","url");d&&(r.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Os("Timeout must be a whole number from 1 to 3600 seconds.","timeout");r.timeout_seconds=d}(n||e.replaceAllowlist)&&(r.tool_allowlist=Vu(e.allowlistText));const o=qu(e.headerRows,e.headersRemove,"Header"),c=qu(e.envRows,e.envRemove,"Environment variable");return Object.keys(o.set).length&&(r.headers_set=o.set),o.remove.length&&(r.headers_remove=o.remove),Object.keys(c.set).length&&(r.env_set=c.set),c.remove.length&&(r.env_remove=c.remove),r}function Bw(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Uw(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Hw(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const zw=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function jw(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Vw=1e4,qw=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function co(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Gw(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Kw={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),n=f(""),a=f(new Set),i=f(new Set),l=f({}),r=f({}),o=f({}),c=f(new Set),d=f(!1),u=f("add"),p=f(""),h=f(null),m=f(co()),v=f(""),T=f(!1);let I=null,y=0,g=!1,b=!1;const S=zw,w=J(()=>{var F;return((F=e.value)==null?void 0:F.servers)||[]}),E=J(()=>{var F;return!!((F=e.value)!=null&&F.enabled)}),C=J(()=>{var F,me,Se,Le;return{serverCount:((F=e.value)==null?void 0:F.server_count)||0,enabledCount:((me=e.value)==null?void 0:me.enabled_server_count)||0,connectedCount:((Se=e.value)==null?void 0:Se.connected_count)||0,toolCount:((Le=e.value)==null?void 0:Le.published_tool_count)||0}}),x=J(()=>{var F;return((F=h.value)==null?void 0:F.header_keys)||[]}),D=J(()=>{var F;return((F=h.value)==null?void 0:F.env_keys)||[]}),A=J(()=>{var F;return u.value==="edit"&&((F=h.value)==null?void 0:F.transport)==="http"}),R=J(()=>u.value==="add"||!A.value),z=J(()=>A.value?"Replace endpoint URL":"Endpoint URL"),V=J(()=>A.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function le(){M(),I=window.setInterval(()=>N({quiet:!0}),Vw)}function M(){I&&window.clearInterval(I),I=null}async function N({quiet:F=!1}={}){const me=++y;F||(t.value=!0);try{const Se=await W.get("/api/mcp/status");if(me!==y||!g)return;e.value=Se,n.value="";const Le=new Set((Se.servers||[]).map(De=>De.name));i.value=new Set([...i.value].filter(De=>Le.has(De)))}catch(Se){me===y&&g&&(n.value=Se.message||"Failed to load MCP status")}finally{me===y&&(t.value=!1)}}function O(F){return s.value||a.value.has(F)}function B(F,me){const Se=new Set(a.value);me?Se.add(F):Se.delete(F),a.value=Se}function G(F){return Uw(F.state)}function q(F){if(G(F)==="disabled"){if(!F.enabled)return"Disabled — server switch off";if(!E.value)return"Disabled — global MCP is off"}return qw[G(F)]}function Q(F){return F.transport==="http"?"Streamable HTTP":"stdio"}function ie(F){return F.negotiated_version?`${F.era?`${String(F.era).charAt(0).toUpperCase()}${String(F.era).slice(1)}`:"Protocol"} · ${F.negotiated_version}`:"Not negotiated"}function X(F){return F.discovered_count?`${F.published_count||0} published · ${F.excluded_count||0} excluded`:"No tools discovered"}const ce=f(new Set);async function Pe(F,me){if(ce.value.has(F.name))return;const Se=!!me.target.checked,Le=new Set(ce.value);Le.add(F.name),ce.value=Le;try{const De=await W.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/enabled`,{enabled:Se});De&&Array.isArray(De.servers)?e.value=De:await N({quiet:!0})}catch(De){me.target.checked=!!F.enabled,Re.error(De.message||`Failed to toggle ${F.name}`)}finally{const De=new Set(ce.value);De.delete(F.name),ce.value=De}}async function Y(F){if(F!==E.value&&!(!F&&!await Xt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await W.post("/api/mcp/enabled",{enabled:F}),Re.success(F?"MCP enabled":"MCP disabled"),await N({quiet:!0})}catch(me){Re.error(me.message||"Failed to update MCP state"),await N({quiet:!0})}finally{s.value=!1}}}async function be(F){B(F.name,!0);try{await W.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/reconnect`,{}),Re.success(`Reconnected ${F.name}`)}catch(me){Re.error(me.message||`Failed to reconnect ${F.name}`)}finally{B(F.name,!1),await N({quiet:!0})}}async function H(F){B(F.name,!0);try{await W.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/refresh-tools`,{}),Re.success(`Refreshed tools from ${F.name}`),await Oe(F.name,!0)}catch(me){Re.error(me.message||`Failed to refresh ${F.name}`)}finally{B(F.name,!1),await N({quiet:!0})}}async function oe(F){if(await Xt({title:`Remove ${F.name}`,message:`Remove this saved MCP server? Its ${F.published_count||0} published tool${F.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){B(F.name,!0);try{await W.del(`/api/mcp/servers/${encodeURIComponent(F.name)}`),Re.success(`Removed ${F.name}`),delete r.value[F.name]}catch(Se){Re.error(Se.message||`Failed to remove ${F.name}`)}finally{B(F.name,!1),await N({quiet:!0})}}}async function ue(F){const me=new Set(i.value);if(me.has(F.name)){me.delete(F.name),i.value=me;return}me.add(F.name),i.value=me,Object.hasOwn(r.value,F.name)||await Oe(F.name)}async function Oe(F,me=!1){if(!me&&Object.hasOwn(r.value,F))return;const Se=new Set(c.value);Se.add(F),c.value=Se,o.value={...o.value,[F]:""};try{const Le=await W.get(`/api/mcp/servers/${encodeURIComponent(F)}/tools`);r.value={...r.value,[F]:Le.tools||[]}}catch(Le){o.value={...o.value,[F]:Le.message||"Failed to load tools"}}finally{const Le=new Set(c.value);Le.delete(F),c.value=Le}}function _(F){return(r.value[F]||[]).filter(me=>Hw(me,l.value[F]))}function P(F,me){l.value={...l.value,[F]:me}}function U(){u.value="add",p.value="",h.value=null,m.value=co(),v.value="",d.value=!0}function ae(F){u.value="edit",p.value=F.name,h.value=F,m.value={...co(),name:F.name,enabled:!!F.enabled,transport:F.transport||"stdio"},v.value="",d.value=!0}function te(){T.value||(d.value=!1)}function ne(F){d.value&&jw(F)}function fe(F){const me=F==="headers"?"headerRows":"envRows";m.value[me].push({key:"",value:""})}function pe(F,me){const Se=F==="headers"?"headerRows":"envRows";m.value[Se].splice(me,1)}function de(F,me){const Se=F==="headers"?"headersRemove":"envRemove",Le=m.value[Se];m.value[Se]=Le.includes(me)?Le.filter(De=>De!==me):[...Le,me]}async function re(){var me,Se;v.value="";let F;try{F=$w(m.value,{mode:u.value,originalTransport:((me=h.value)==null?void 0:me.transport)||""})}catch(Le){v.value=Le instanceof Os?Le.message:"Invalid MCP server configuration",await At(),(Se=document.querySelector(".mcp-editor"))==null||Se.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&Bw(F,h.value)&&!await Xt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){T.value=!0;try{u.value==="add"?await W.post("/api/mcp/servers",F):await W.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,F),Re.success(u.value==="add"?`Saved ${F.name}`:`Updated ${p.value}`),d.value=!1,await N({quiet:!0})}catch(Le){v.value=Le.message||"Failed to save MCP server"}finally{T.value=!1}}}let ke=null;function ge(F){`${(F==null?void 0:F.event)||""} ${(F==null?void 0:F.type)||""} ${(F==null?void 0:F.tool)||""} ${(F==null?void 0:F.message)||""}`.toLowerCase().includes("mcp")&&(ke&&window.clearTimeout(ke),ke=window.setTimeout(()=>N({quiet:!0}),200))}function we(){g||(g=!0,b||(Ye.subscribe("events",ge),b=!0),N(),le())}function Ae(){g=!1,M(),ke&&window.clearTimeout(ke),ke=null,b&&(Ye.unsubscribe("events",ge),b=!1)}return Ke(we),us(we),ts(Ae),mt(Ae),{status:e,loading:t,mutating:s,pageError:n,servers:w,masterEnabled:E,aggregate:C,expandedServers:i,toolQueries:l,toolErrors:o,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:h,form:m,formError:v,saving:T,editorGroups:S,configuredHeaderKeys:x,configuredEnvKeys:D,savedHttpEndpoint:A,endpointRequired:R,endpointFieldLabel:z,endpointPlaceholder:V,refreshAll:N,busy:O,serverState:G,stateLabel:q,transportLabel:Q,protocolLabel:ie,toolSummary:X,formatAge:Gw,setMasterEnabled:Y,togglePending:ce,toggleServerEnabled:Pe,reconnect:be,refreshTools:H,removeServer:oe,toggleTools:ue,filteredTools:_,setToolQuery:P,openAdd:U,openEdit:ae,closeEditor:te,jumpToEditorGroup:ne,addSecretRow:fe,removeSecretRow:pe,toggleSecretRemoval:de,saveServer:re}}};function Ww(e,t){if(!e||!t)return Hu(e);const s=Hu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Zw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(""),a=f(null),i=f(!1),l=f(""),r=f(null),o=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let T=null;const I=f(null),y=f(!1),g=f({}),b=f({}),S=f({}),w=f({}),E=new Map,C=f(null),x=J(()=>e.value.reduce((q,Q)=>q+(Q.chunks||0),0)),D=J(()=>new Set(e.value.map(Q=>Q.uploader).filter(Boolean)).size);function A(q,Q){const ie=b.value[Q];if(!ie||ie.length===0)return 0;const X=Math.max(...ie.map(ce=>ce.char_count||0));return X===0?0:Math.round(q.char_count/X*100)}async function R(){t.value=!0,s.value=null;try{const q=await W.get("/api/knowledge");e.value=Array.isArray(q)?q:[]}catch(q){s.value=q.message}t.value=!1}async function z(q){if(g.value[q]){g.value[q]=!1,C.value=null;return}if(g.value[q]=!0,Object.prototype.hasOwnProperty.call(b.value,q))return;if(E.has(q))return E.get(q);const Q={...w.value,[q]:!0};w.value=Q;const ie={...S.value};delete ie[q],S.value=ie;const X=W.get(`/api/knowledge/${encodeURIComponent(q)}/chunks`).then(ce=>{b.value={...b.value,[q]:Array.isArray(ce)?ce:[]}}).catch(ce=>{S.value={...S.value,[q]:ce.message||"load failed"}}).finally(()=>{if(E.get(q)!==X)return;E.delete(q);const ce={...w.value};delete ce[q],w.value=ce});return E.set(q,X),X}let V=0;async function le(){const q=n.value.trim();if(!q)return;const Q=++V;i.value=!0,r.value=null,l.value=q;try{const ie=await W.get(`/api/knowledge/search?q=${encodeURIComponent(q)}`);if(Q!==V)return;a.value=Array.isArray(ie)?ie:[]}catch(ie){if(Q!==V)return;a.value=[],r.value=ie.message||"Search failed"}Q===V&&(i.value=!1)}function M(){V+=1,i.value=!1,a.value=null,n.value="",r.value=null}async function N(){u.value=null,p.value=null;const q=c.value.trim(),Q=d.value.trim();if(!q){u.value="Source name is required";return}if(!Q){u.value="Content is required";return}h.value=!0;try{const ie=await W.post("/api/knowledge",{source:q,content:Q});p.value=`Ingested ${ie.chunks||0} chunks from "${q}"`,c.value="",d.value="",b.value={},await R(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(ie){u.value=ie.message}h.value=!1}async function O(q){m.value=q,v.value=null,T&&(clearTimeout(T),T=null);try{const Q=await W.post(`/api/knowledge/${encodeURIComponent(q)}/reingest`);v.value={source:q,error:!1,message:`Re-ingested ${Q.chunks||0} chunks`},delete b.value[q],await R(),T=setTimeout(()=>{v.value=null,T=null},3e3)}catch(Q){v.value={source:q,error:!0,message:Q.message}}m.value=null}function B(q){I.value=q}async function G(){if(I.value){y.value=!0;try{await W.del(`/api/knowledge/${encodeURIComponent(I.value)}`),delete b.value[I.value],await R()}catch(q){Re.error(`Failed to delete source: ${q.message||"unknown error"}`)}y.value=!1,I.value=null}}return Ke(()=>{R()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:I,deleting:y,expanded:g,sourceChunks:b,chunkErrors:S,loadingChunks:w,selectedChunk:C,totalChunks:x,uploaderCount:D,truncate:sd,formatTs:ka,highlightTerms:Ww,chunkBarWidth:A,fetchSources:R,toggleSource:z,doSearch:le,clearSearch:M,doIngest:N,doReingest:O,confirmDelete:B,doDelete:G}}},Jw={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),n=f(null),a=f({}),i=f(null),l=f(""),r=f(!1),o=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),T=f(null),I=f(new Set),y=f(null),g=f(!1),b=f(!1),S=J(()=>e.value.reduce((Q,ie)=>Q+ie.count,0)),w=J(()=>I.value.size);function E(Q){const ie=t.value[Q];if(!ie)return[];if(!l.value.trim())return ie;const X=l.value.trim().toLowerCase();return ie.filter(ce=>ce.key.toLowerCase().includes(X)||ce.value&&ce.value.toLowerCase().includes(X))}function C(Q,ie){return I.value.has(Q+"/"+ie)}function x(Q,ie){const X=Q+"/"+ie,ce=new Set(I.value);ce.has(X)?ce.delete(X):ce.add(X),I.value=ce}function D(Q){const ie=t.value[Q];return!ie||ie.length===0?!1:ie.every(X=>I.value.has(Q+"/"+X.key))}function A(Q,ie){const X=t.value[Q];if(!X)return;const ce=new Set(I.value);for(const Pe of X){const Y=Q+"/"+Pe.key;ie?ce.add(Y):ce.delete(Y)}I.value=ce}async function R(){s.value=!0,n.value=null;try{const Q=await W.get("/api/memory");e.value=Object.entries(Q).map(([ie,X])=>({name:ie,keys:X.keys||[],count:X.count||0}))}catch(Q){n.value=Q.message}s.value=!1}async function z(Q){if(a.value[Q]){a.value[Q]=!1;return}a.value[Q]=!0;const ie=e.value.find(ce=>ce.name===Q);if(!ie||t.value[Q]||i.value===Q)return;i.value=Q;let X;try{const Pe=(await W.get(`/api/memory/${encodeURIComponent(Q)}`)).entries||{};X=ie.keys.map(Y=>Object.prototype.hasOwnProperty.call(Pe,Y)?{key:Y,value:Pe[Y]||"",failed:!1}:{key:Y,value:"",failed:!0,error:"Not found in scope"})}catch(ce){X=ie.keys.map(Pe=>({key:Pe,value:"",failed:!0,error:ce.message||"Failed to load"}))}t.value[Q]=X,i.value=null}function V(Q,ie,X){p.value=Q+"/"+ie,h.value=X}async function le(Q,ie){m.value=!0,v.value=null;try{await W.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(ie)}`,{value:h.value});const X=t.value[Q];if(X){const ce=X.find(Pe=>Pe.key===ie);ce&&(ce.value=h.value)}p.value=null}catch(X){v.value=`Failed to save: ${X.message||"unknown error"}`}m.value=!1}async function M(Q,ie){try{await navigator.clipboard.writeText(ie.value),T.value=Q+"/"+ie.key,setTimeout(()=>{T.value=null},1500)}catch{}}async function N(){d.value=null,u.value=null;const Q=o.value.scope.trim(),ie=o.value.key.trim(),X=o.value.value.trim();if(!Q){d.value="Scope is required";return}if(!ie){d.value="Key is required";return}if(!X){d.value="Value is required";return}c.value=!0;try{await W.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(ie)}`,{value:X}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await R(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(ce){d.value=ce.message}c.value=!1}function O(Q,ie){y.value={scope:Q,key:ie}}async function B(){if(!y.value)return;g.value=!0,v.value=null;const{scope:Q,key:ie}=y.value;try{await W.del(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(ie)}`);const X=t.value[Q];X&&(t.value[Q]=X.filter(Y=>Y.key!==ie));const ce=e.value.find(Y=>Y.name===Q);ce&&(ce.count--,ce.keys=ce.keys.filter(Y=>Y!==ie));const Pe=new Set(I.value);Pe.delete(Q+"/"+ie),I.value=Pe}catch(X){v.value=`Failed to delete: ${X.message||"unknown error"}`}g.value=!1,y.value=null}function G(){b.value=!0}async function q(){g.value=!0,v.value=null;const Q=[];for(const ie of I.value){const X=ie.indexOf("/");Q.push({scope:ie.slice(0,X),key:ie.slice(X+1)})}try{await W.post("/api/memory/bulk-delete",{entries:Q}),I.value=new Set,t.value={},await R()}catch(ie){v.value=`Bulk delete failed: ${ie.message||"unknown error"}`}g.value=!1,b.value=!1}return Ke(()=>{R()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:T,selected:I,selectedCount:w,totalEntries:S,deleteTarget:y,deleting:g,showBulkDelete:b,fetchMemory:R,toggleScope:z,startEdit:V,doEdit:le,copyValue:M,doAdd:N,confirmDelete:O,doDelete:B,confirmBulkDelete:G,doBulkDelete:q,isSelected:C,toggleSelect:x,isScopeAllSelected:D,toggleSelectAll:A,filteredEntries:E}}},Yw={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),n=f(null),a=f(null),i=f(null),l=f(""),r=J(()=>[...new Set(e.value.map(T=>T.category))].sort()),o=J(()=>{const v={};return e.value.forEach(T=>{v[T.category]=(v[T.category]||0)+1}),v}),c=J(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await W.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,Re.success("Entry updated"),await m()}catch(T){Re.error(T.message||"Failed to save entry")}}async function h(v){if(await Xt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/learned/"+encodeURIComponent(v)),Re.success("Entry deleted"),await m()}catch(I){Re.error(I.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await W.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return Ke(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ka,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:m}}},Nm=[{id:"tools",label:"Tools",component:Lw},{id:"skills",label:"Skills",component:Pw},{id:"mcp-servers",label:"MCP Servers",component:Kw},{id:"knowledge",label:"Knowledge",component:Zw},{id:"memory",label:"Memory",component:Jw},{id:"learned",label:"Learned",component:Yw}],Qw={components:{TabbedPage:Hr},setup(){return{tabs:Nm}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Xw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},ek={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},tk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},sk={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),n=f(!1),a=f(!1),i=J(()=>e.value.components||[]),l=J(()=>tk[e.value.overall]||"text-gray-400"),r=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=J(()=>{const w=e.value.overall;return w==="healthy"?"All Systems Healthy":w==="degraded"?"Some Systems Degraded":w==="unhealthy"?"System Issues Detected":"Unknown"});function c(w){return Xw[w]||"text-gray-400"}function d(w){return ek[w]||"info"}function u(w){return w==="ok"?"badge-success":w==="degraded"?"badge-warning":w==="down"?"badge-danger":"badge-info"}function p(w){return w==="closed"?"text-green-400":w==="half_open"?"text-yellow-400":w==="open"?"text-red-400":"text-gray-400"}function h(w){return w.replace(/_/g," ").replace(/\b\w/g,E=>E.toUpperCase())}function m(w){if(!w)return"—";try{return new Date(w).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function v(w){return w>=1e6?(w/1e6).toFixed(1)+"M":w>=1e3?(w/1e3).toFixed(1)+"K":String(w)}async function T(){a.value=!0;try{e.value=await W.get("/api/health/components"),s.value=null,n.value=!0}catch(w){s.value=w.message}finally{t.value=!1,a.value=!1}}function I(){t.value=!0,s.value=null,T()}let y=null,g=!1;function b(){g||(g=!0,T(),y||(y=setInterval(T,3e4)))}function S(){g&&(g=!1,y&&(clearInterval(y),y=null))}return Ke(b),us(b),ts(S),mt(S),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:T,retry:I}}},nk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f(!1),a=f("sessions"),i=f(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=J(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=J(()=>{if(!i.value)return[];const T=i.value,I=T.storage_total_bytes||1;return[{label:"Session Persistence",mb:T.sessions.persist_dir.total_mb,bytes:T.sessions.persist_dir.total_bytes,files:T.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(T.sessions.persist_dir.total_bytes/I*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:T.knowledge.db_file.total_mb,bytes:T.knowledge.db_file.total_bytes,files:T.knowledge.db_file.file_count,pct:Math.min(100,Math.round(T.knowledge.db_file.total_bytes/I*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:T.trajectories.message_dir.total_mb,bytes:T.trajectories.message_dir.total_bytes,files:T.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(T.trajectories.message_dir.total_bytes/I*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:T.trajectories.agent_dir.total_mb,bytes:T.trajectories.agent_dir.total_bytes,files:T.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(T.trajectories.agent_dir.total_bytes/I*100)),color:"res-bar-amber"}]});async function d(){try{const T=await W.get("/api/resource-usage");i.value=T,t.value=null,s.value=!0}catch(T){t.value=T.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ke(m),us(m),ts(v),mt(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:nd,refresh:u,retry:p}}},ak=["INFO","WARNING","ERROR"],ik=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],uo=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],lk=[50,100,200,500],rk={template:`
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
    </div>`,setup(){const e=f("live"),t=f([]),s=f(!1),n=f(!0),a=f(""),i=f(""),l=f(!1),r=f(!1),o=f(Ye.state||"disconnected"),c=J(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=f(null),u=f(!1),p=f(null),h=2e3,m=ak,v=ik,T=uo,I=f("all"),y=f(""),g=f([]),b=f(!1),S=f(""),w=f([]);function E(){try{const K=localStorage.getItem("odin-log-presets");K&&(g.value=JSON.parse(K))}catch{}}function C(){try{localStorage.setItem("odin-log-presets",JSON.stringify(g.value))}catch{}}const x=J(()=>a.value!==""||i.value.trim()!==""||y.value!==""),D=J(()=>{const K=uo.find(he=>he.value===y.value);return K?K.label:""}),A=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(K){return K.message}}),R=24,z=J(()=>{if(G.value.length===0)return[];const K=[],he=new Date,Ne=3600*1e3;for(let Ve=R-1;Ve>=0;Ve--){const tt=new Date(he.getTime()-(Ve+1)*Ne),Lt=new Date(he.getTime()-Ve*Ne);K.push({start:tt,end:Lt,label:N(tt,Lt),shortLabel:Lt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ve of G.value){if(!Ve._time)continue;const tt=Ve._time.getTime();for(const Lt of K)if(tt>=Lt.start.getTime()&&tt<Lt.end.getTime()){Lt.total++,Ve.level==="ERROR"?Lt.errors++:Ve.level==="WARNING"?Lt.warnings++:Lt.info++;break}}return K}),V=J(()=>{let K=1;for(const he of z.value)he.total>K&&(K=he.total);return K}),le=J(()=>{if(z.value.length===0)return"";const K=G.value.map(Ve=>Ve._time&&Ve._time.getTime()).filter(Boolean);if(K.length===0)return"";const he=new Date(Math.min(...K));return`${G.value.length} shown, oldest ${he.toLocaleTimeString()}`}),M=J(()=>Math.ceil(R/8));function N(K,he){const Ne={hour:"2-digit",minute:"2-digit"};return K.toLocaleTimeString([],Ne)+" - "+he.toLocaleTimeString([],Ne)}function O(K,he){return!he||!K?"0px":Math.max(2,K/he*100)+"%"}function B(K){const he=G.value.findIndex(Ne=>Ne._time&&Ne._time.getTime()>=K.start.getTime()&&Ne._time.getTime()<K.end.getTime());if(he>=0&&d.value){const Ne=d.value.querySelectorAll(".log-line");Ne[he]&&(Ne[he].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const G=J(()=>{let K=t.value;if(a.value&&(K=K.filter(he=>(he.level||"INFO")===a.value)),y.value){const he=uo.find(Ne=>Ne.value===y.value);if(he&&he.seconds){const Ne=new Date(Date.now()-he.seconds*1e3);K=K.filter(Ve=>Ve._time&&Ve._time>=Ne)}}if(i.value&&!A.value)if(l.value)try{const he=new RegExp(i.value,"i");K=K.filter(Ne=>{const Ve=Ne.text||Ne.raw||"",tt=Ne.tool||"";return he.test(Ve)||he.test(tt)})}catch{}else{const he=i.value.toLowerCase();K=K.filter(Ne=>{const Ve=(Ne.text||Ne.raw||"").toLowerCase(),tt=(Ne.tool||"").toLowerCase();return Ve.includes(he)||tt.includes(he)})}return K});function q(K){if(K.type==="log"&&K.line)try{const he=typeof K.line=="string"?JSON.parse(K.line):K.line,Ne=he.timestamp?new Date(he.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:he.error?"ERROR":"INFO",text:he.tool_name?`[${he.tool_name}] ${he.result_summary||""}`.trim():he.message||JSON.stringify(he),tool:he.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(K.line),tool:"",raw:String(K.line)}}if(K.payload){const he=K.payload,Ne=he.timestamp?new Date(he.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:he.error?"ERROR":"INFO",text:he.tool_name?`[${he.tool_name}] ${he.result_summary||""}`.trim():he.message||JSON.stringify(he),tool:he.tool_name||"",raw:null}}return typeof K=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:K,tool:"",raw:K}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(K),tool:"",raw:null}}function Q(K){const he=q(K);if(s.value){w.value.push(he);return}ie(he)}function ie(K){t.value.push(K),t.value.length>h&&(t.value=t.value.slice(-h)),n.value&&At(()=>X())}function X(K=!1){const he=d.value;he&&he.scrollTo({top:he.scrollHeight,behavior:K?"smooth":"instant"})}function ce(){n.value=!0,u.value=!1,At(()=>X(!0))}const Pe=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function Y(){const K=d.value;if(!K)return;const he=K.scrollHeight-K.scrollTop-K.clientHeight<40;u.value=!n.value&&!he&&t.value.length>0,ue.value&&be()}function be(){const K=d.value;!K||!n.value||K.scrollHeight-K.scrollTop-K.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function H(){n.value&&requestAnimationFrame(be)}function oe(K){Pe.has(K.key)&&H()}const ue=f(!1);function Oe(){n.value&&(ue.value=!0,requestAnimationFrame(be))}function _(){ue.value&&(ue.value=!1,be())}function P(){n.value&&(u.value=!1,At(()=>X()))}function U(){if(s.value=!s.value,!s.value&&w.value.length>0){for(const K of w.value)ie(K);w.value=[]}}function ae(){t.value=[],w.value=[],u.value=!1}function te(){let K;e.value==="search"?K=Ze.value.map(tt=>{const Lt=tt.error?"ERROR":"INFO",Yn=tt.tool_name?`[${tt.tool_name}] `:"";return`${tt.timestamp||""} ${Lt} ${Yn}${tt.result_summary||tt.message||""}`}).join(`
`):K=G.value.map(tt=>`${tt.ts} ${tt.level} ${tt.text}`).join(`
`);const he=new Blob([K],{type:"text/plain"}),Ne=URL.createObjectURL(he),Ve=document.createElement("a");Ve.href=Ne,Ve.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ve.click(),URL.revokeObjectURL(Ne)}function ne(K,he){const Ne=`${K.ts} ${K.level} ${K.text||K.raw||""}`;navigator.clipboard.writeText(Ne).then(()=>{p.value=he,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function fe(K){a.value=a.value===K?"":K,I.value="all"}function pe(K){return K.level==="ERROR"?"log-line-error":K.level==="WARNING"?"log-line-warning":"text-gray-300"}function de(K){return K==="ERROR"?"text-red-500 font-semibold":K==="WARNING"?"text-yellow-500":"text-blue-500"}function re(K){return K==="ERROR"?"log-chip-error":K==="WARNING"?"log-chip-warning":"log-chip-info"}function ke(K){I.value=K.id;const he=K.filters;a.value=he.level||"",y.value=he.timeRange||"",i.value=he.text||"",he.levels&&(a.value=he.levels[0]||""),he.hasToolName&&(i.value="")}function ge(K){I.value=K.id,a.value=K.filters.level||"",y.value=K.filters.timeRange||"",i.value=K.filters.text||""}function we(){if(!S.value.trim())return;const K={id:"custom-"+Date.now(),name:S.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};g.value=[...g.value,K],C(),b.value=!1,S.value=""}function Ae(K){g.value=g.value.filter(he=>he.id!==K),C(),I.value===K&&(I.value="all")}const F=f("all"),me=f(""),Se=f(""),Le=f(""),De=f(""),ct=f(""),rt=f(100),Mt=lk,se=f(!1),_e=f(!1),Ie=f(""),Ze=f([]),pt=f(null),Ue=f(null);function gt(){e.value="search",pt.value||ys()}async function ys(){try{pt.value=await W.get("/api/logs/stats")}catch{}}function kt(){const K=ct.value;if(!K){Le.value="",De.value="";return}const Ne={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[K];if(Ne){const Ve=new Date(Date.now()-Ne*1e3);Le.value=Fs(Ve),De.value=""}}function Fs(K){const he=Ne=>String(Ne).padStart(2,"0");return`${K.getFullYear()}-${he(K.getMonth()+1)}-${he(K.getDate())}T${he(K.getHours())}:${he(K.getMinutes())}`}function Bt(K){if(!K)return"";const he=new Date(K);return isNaN(he.getTime())?"":he.toISOString()}async function xs(){se.value=!0,Ie.value="",_e.value=!0,Ue.value=null;try{const K=new URLSearchParams;F.value&&F.value!=="all"&&K.set("level",F.value),me.value&&K.set("tool",me.value),Se.value&&K.set("q",Se.value);const he=Bt(Le.value),Ne=Bt(De.value);he&&K.set("start",he),Ne&&K.set("end",Ne),K.set("limit",String(rt.value));const Ve=await W.get(`/api/logs/search?${K.toString()}`);Ze.value=Ve.entries||[]}catch(K){Ie.value=K.message||"Search failed",Ze.value=[]}finally{se.value=!1}}function an(){F.value="all",me.value="",Se.value="",Le.value="",De.value="",ct.value="",rt.value=100,Ze.value=[],_e.value=!1,Ie.value="",Ue.value=null}function _s(K){Ue.value=Ue.value===K?null:K}function Nn(K){if(!K.timestamp)return"";try{return new Date(K.timestamp).toLocaleString()}catch{return K.timestamp}}function ln(K){return K.type==="web_action"?`${K.status||""} (${K.execution_time_ms||0}ms)`:(K.result_summary||"").slice(0,200)}function $s(K){return K.error?"log-line-error":"text-gray-300"}function Dn(K){try{return JSON.stringify(K,null,2)}catch{return String(K)}}let yt=null,Bs=!1;function rn(){Bs||(Bs=!0,Ye.subscribe("logs",Q),r.value=Ye.connected,o.value=Ye.state||"disconnected",yt=Ye.onState(K=>{o.value=K,r.value=K==="connected"}))}function at(){Bs&&(Bs=!1,Ye.unsubscribe("logs",Q),yt&&(yt(),yt=null))}return Ke(()=>{E(),window.addEventListener("pointerup",_),window.addEventListener("pointercancel",_)}),us(rn),ts(at),mt(()=>{at(),window.removeEventListener("pointerup",_),window.removeEventListener("pointercancel",_)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:G,pauseBuffer:w,showJumpBottom:u,copiedIndex:p,regexError:A,levels:m,logPresets:v,timeRanges:T,timeRange:y,activeLogPreset:I,customLogPresets:g,showSaveLogPreset:b,newLogPresetName:S,hasActiveLogFilters:x,timeRangeLabel:D,timelineBuckets:z,timelineMax:V,timelineSpanLabel:le,timelineLabelSkip:M,togglePause:U,clearLogs:ae,exportLogs:te,logLineClass:pe,levelClass:de,levelChipClass:re,toggleLevel:fe,copyLine:ne,jumpToBottom:ce,onScroll:Y,onUserScrollIntent:H,onUserScrollKey:oe,onAutoScrollToggle:P,onPointerDown:Oe,applyLogPreset:ke,applyCustomLogPreset:ge,saveLogCustomPreset:we,removeLogCustomPreset:Ae,segmentHeight:O,jumpToTimelineBucket:B,searchLevel:F,searchTool:me,searchKeyword:Se,searchStart:Le,searchEnd:De,searchTimePreset:ct,searchLimit:rt,searchLimits:Mt,searching:se,searchRan:_e,searchError:Ie,searchResults:Ze,searchStats:pt,expandedSearch:Ue,switchToSearch:gt,runSearch:xs,clearSearchFilters:an,toggleSearchExpand:_s,formatSearchTs:Nn,searchEntryText:ln,searchLogLineClass:$s,formatJson:Dn,applySearchTimePreset:kt}}};function El(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const ok=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function ck(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const r=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(r)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Ja=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],dk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},po=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),uk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Gu(e){return uk.some(t=>e===t||e.startsWith(`${t}.`))}const Dm="odin_config_center_expanded_v1",Pm="odin_config_center_category_v1",pk=50,fk=650,fo=()=>W.get("/api/config/meta");function ia(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Mi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function La(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function hk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function mk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Mm(e,t){if(Mi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return ia(t);const n={};for(const[a,i]of Object.entries(t)){const l=Mm(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function vk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Mm(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Fm(e,t,s,n){if(Mi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Fm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function gk(){try{const e=JSON.parse(localStorage.getItem(Dm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function bk(){try{const e=localStorage.getItem(Pm);return Ja.some(t=>t.key===e)?e:Ja[0].key}catch{return Ja[0].key}}const yk={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),n=f(null),a=f(!1),i=f(null),l=f(null),r=f(null),o=f(!1),c=f(!1),d=f(null),u=f(""),p=f("all"),h=f(bk()),m=f(gk()),v=f({}),T=f({}),I=f(""),y=f({}),g=f({}),b=f([]),S=f([]),w=f(!1),E=f(!1),C=f(!1);let x=null,D=null,A={path:null,at:0},R=0;const z=J(()=>{var k;return(((k=t.value)==null?void 0:k.fields)||[]).filter($=>!po.has($.path.split(".")[0])&&!Gu($.path))}),V=J(()=>new Map(z.value.map(k=>[k.path,k]))),le=J(()=>G.value.reduce((k,$)=>k+$.sections.length,0)),M=J(()=>z.value.length),N=J(()=>ok),O=J(()=>b.value.length>0),B=J(()=>S.value.length>0),G=J(()=>{if(!e.value)return[];const k=new Set(Ja.flatMap(xe=>xe.sections)),$=Ja.map(xe=>({...xe,sections:xe.sections.filter(Qe=>Object.hasOwn(e.value,Qe)&&!po.has(Qe))})).filter(xe=>xe.sections.length),Z=Object.keys(e.value).filter(xe=>!k.has(xe)&&!po.has(xe));return Z.length&&$.push({key:"other",label:"Other",icon:"folder",sections:Z}),$}),q=J(()=>e.value?{...e.value,...v.value}:null),Q=J(()=>{if(!e.value)return[];const k=[];for(const[$,Z]of Object.entries(v.value))Fm(e.value[$],Z,$,k);return k.filter($=>!Mi($.oldVal,$.newVal)).map($=>{const Z=P($.path);return{...$,label:(Z==null?void 0:Z.label)||La($.path.split(".").at(-1)),apply_mode:(Z==null?void 0:Z.apply_mode)||fe($.path.split(".")[0])}})}),ie=J(()=>Q.value.length>0),X=J(()=>Q.value.length),ce=J(()=>new Set(Q.value.map(k=>k.path.split(".")[0])).size),Pe=J(()=>!!u.value||p.value!=="all"),Y=J(()=>{const k={...g.value};for(const $ of Q.value){const Z=P($.path),xe=Ta(Z,$.newVal);xe&&(k[$.path]=xe)}return k}),be=J(()=>Object.keys(Y.value).length>0),H=J(()=>e.value?(Pe.value?G.value:G.value.filter($=>$.key===h.value)).map($=>({...$,sections:$.sections.filter(Z=>se(Z))})).filter($=>$.sections.length):[]),oe=J(()=>{const k=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],$=new Map(k.map(Z=>[Z,[]]));for(const Z of Q.value){const xe=$.has(Z.apply_mode)?Z.apply_mode:"restart";$.get(xe).push(Z)}return k.filter(Z=>$.get(Z).length).map(Z=>({key:Z,label:ws(Z),entries:$.get(Z)}))}),ue=J(()=>Q.value.filter(k=>k.apply_mode==="restart").length),Oe=J(()=>z.value.filter(k=>k.pending_restart)),_=J(()=>Oe.value.length);function P(k){const $=V.value.get(k);return $?{...$,apply_details:El([$])}:null}function U(k){const $=`${k}.`;return z.value.filter(Z=>Z.path===k||Z.path.startsWith($))}function ae(k){return U(k).length}function te(k){return La(k)}function ne(k){const $=U(k);if(!$.length)return`${La(k)} configuration.`;const Z=$.find(Gt=>Gt.sensitivity==="public"&&Gt.description)||$.find(Gt=>Gt.description),xe=(Z==null?void 0:Z.description)||"";return xe.match(/setting for (.+)\.$/i)?`${La(k)} settings and runtime behaviour.`:xe}function fe(k){const $=[...new Set(U(k).map(Z=>Z.apply_mode))];return $.length===1?$[0]:$.includes("restart")?"restart":$.includes("activation_required")?"activation_required":$[0]||"restart"}function pe(k){const $=[...new Set(U(k).map(Z=>ws(Z.apply_mode)))];return $.length?$.length===1?$[0]:`Mixed apply behaviour: ${$.join(" · ")}`:""}function de(k){return El(U(k))}function re(k){var $;return Object.hasOwn(v.value,k)?v.value[k]:($=e.value)==null?void 0:$[k]}function ke(){const k=re("mcp")||{},$=Object.keys(k.servers||{}).length;return`${k.enabled?"Globally enabled":"Globally disabled"} · ${$} configured server${$===1?"":"s"}.`}function ge(k,$){return $.split(".").reduce((Z,xe)=>Z==null?void 0:Z[xe],k)}function we(k){const $=q.value;return U(k).filter(Z=>Gu(Z.path)?!1:Z.path.split(".").length<=2?!0:!Z.path.includes(".*")).map(Z=>({...Z,key:Z.path.split(".").at(-1),value:ge($,Z.path),apply_details:El([Z]),editor:Z.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Ae(k){const $=k.path.split(".");return $.length>2?$.slice(0,2).join("."):null}function F(k){const $=new Map;for(const Z of we(k)){const xe=Ae(Z),Qe=xe||`${k}.__root`;$.has(Qe)||$.set(Qe,{key:Qe,path:xe,entries:[]}),$.get(Qe).entries.push(Z)}return[...$.values()].map(Z=>{const xe=Z.entries.find(Qe=>Qe.group_description);return{...Z,label:Z.path?La(Z.path.split(".").at(-1)):null,description:(xe==null?void 0:xe.group_description)||null,apply_details:El(Z.entries),runtime_summaries:Se(Z.entries)}})}function me(k){return{save:k.save_effect||(k.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:k.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[k.apply_mode]||"Effective runtime state is not currently observable."}}function Se(k){const $=new Map;for(const Z of k){const xe=me(Z),Qe=`${Z.apply_mode}|${xe.save}|${xe.runtime}`;$.has(Qe)||$.set(Qe,{key:Qe,label:ws(Z.apply_mode),save:xe.save,runtime:xe.runtime})}return[...$.values()]}function Le(k){if(De(k))return k.runtime_effect||k.activation_policy||"";if(k.apply_mode==="activation_required"){const $=k.activation_policy||k.runtime_effect;return $?`Not active after saving. No activation control exists in this release. ${$}`:"Not active after saving; no activation control exists in this release."}return""}function De(k){return k.action_available===!0&&!!(k.action_label&&k.action_endpoint)}async function ct(k){if(De(k))try{if(Ue(k.path))throw new Error("Save this setting before applying its action.");const $=String(k.action_method||"POST").toLowerCase(),Z={post:W.post.bind(W),put:W.put.bind(W),delete:W.del.bind(W)}[$];if(!Z)throw new Error("Unsupported configuration action");await Z(k.action_endpoint,k.action_body||void 0),await ee(),ye("success",`${k.action_label} completed.`)}catch($){ye("error",$.message||`${k.action_label} failed`)}}function rt(k,$){return[k.label,k.path,k.description,...k.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes($)}function Mt(k){const $=u.value.trim().toLowerCase();return $?U(k).filter(Z=>rt(Z,$)):[]}function se(k){const $=U(k);if(p.value!=="all"&&!$.some(xe=>xe.apply_state===p.value))return!1;const Z=u.value.trim().toLowerCase();return!Z||`${te(k)} ${k}`.toLowerCase().includes(Z)?!0:$.some(xe=>rt(xe,Z))}function _e(k,$){return U(k).filter(Z=>Z.apply_state===$).length}function Ie(k){return k==="all"?M.value:z.value.filter($=>$.apply_state===k).length}function Ze(k){const $=k.sections.flatMap(Z=>U(Z));return{fields:$.length,modified:Q.value.filter(Z=>k.sections.includes(Z.path.split(".")[0])).length,pending_restart:$.filter(Z=>Z.apply_state==="pending_restart").length,invalid:$.filter(Z=>Z.apply_state==="invalid").length,dormant:$.filter(Z=>Z.apply_state==="dormant").length}}function pt(k){var $;return Object.hasOwn(v.value,k)&&!Mi(($=e.value)==null?void 0:$[k],v.value[k])}function Ue(k){return Q.value.some($=>$.path===k||$.path.startsWith(`${k}.`))}function gt(k){h.value=k,u.value="",p.value="all";try{localStorage.setItem(Pm,k)}catch{}}function ys(k){p.value=k}function kt(){u.value="",p.value="all"}function Fs(k){var $;return(($=G.value.find(Z=>Z.sections.includes(k)))==null?void 0:$.sections)||[]}function Bt(k){const $=Fs(k),Z=$.find(xe=>m.value[xe]===!0);return Z||$.find(xe=>m.value[xe]!==!1)||null}function xs(k){return u.value&&!C.value&&se(k)?!0:C.value?Bt(k)===k:Object.hasOwn(m.value,k)?m.value[k]===!0:!0}function an(k){const $=!xs(k);if(C.value){const Z={...m.value};for(const xe of Fs(k))Z[xe]===!0&&(Z[xe]=!1);Z[k]=$,m.value=Z;return}m.value={...m.value,[k]:$}}function _s(){b.value.push(ia(v.value)),b.value.length>pk&&b.value.shift(),S.value=[]}function Nn(){ie.value&&(_s(),v.value={},g.value={},w.value=!1)}function ln(k,$=!1){const Z=Date.now();if($&&A.path===k&&Z-A.at<fk){A.at=Z;return}_s(),A={path:k,at:Z}}function $s(k,$,Z){if(!$.length)return Z;const xe=ia(k??{});let Qe=xe;for(let Gt=0;Gt<$.length-1;Gt+=1){const cn=$[Gt];Qe[cn]=ia(Qe[cn]??{}),Qe=Qe[cn]}return Qe[$.at(-1)]=Z,xe}function Dn(k){var $;return Object.hasOwn(v.value,k)?v.value[k]:ia(($=e.value)==null?void 0:$[k])}function yt(k,$,Z={}){var fd;const[xe,...Qe]=k.path.split(".");ln(k.path,!!Z.coalesce);const Gt=Dn(xe),cn=Qe.length?$s(Gt,Qe,$):$,ea={...v.value};if(Mi(cn,(fd=e.value)==null?void 0:fd[xe])?delete ea[xe]:ea[xe]=cn,v.value=ea,g.value[k.path]){const hd={...g.value};delete hd[k.path],g.value=hd}}function Bs(k){A={path:null,at:0},T.value={...T.value,[k]:String(ge(q.value,k)??"")}}function rn(k){if(A={path:null,at:0},!Object.hasOwn(T.value,k))return;const $={...T.value};delete $[k],T.value=$}function at(k){const $=T.value[k.path];if(A={path:null,at:0},$===""){g.value={...g.value,[k.path]:"Enter a number."};return}const Z=Number($);if(Number.isNaN(Z)||k.type==="integer"&&!Number.isInteger(Z)){g.value={...g.value,[k.path]:k.type==="integer"?"Enter a whole number.":"Enter a number."};return}const xe={...T.value};delete xe[k.path],T.value=xe,yt(k,Z,{coalesce:!0})}function K(k){return Object.hasOwn(T.value,k.path)?T.value[k.path]:k.value??""}function he(k,$){if(T.value={...T.value,[k.path]:$},$===""){g.value={...g.value,[k.path]:"Enter a number."};return}const Z=Number($);if(!Number.isFinite(Z)||k.type==="integer"&&!Number.isInteger(Z)){g.value={...g.value,[k.path]:k.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(g.value[k.path]){const xe={...g.value};delete xe[k.path],g.value=xe}yt(k,Z,{coalesce:!0})}function Ne(k){const $=Number.parseInt(I.value,10);if(!Number.isInteger($)||$<1){g.value={...g.value,[k.path]:"Warning thresholds must be positive whole numbers."};return}const Z=[...new Set([...k.value||[],$])].sort((xe,Qe)=>Qe-xe);I.value="",yt(k,Z)}function Ve(k,$){yt(k,(k.value||[]).filter(Z=>Z!==$))}function tt(k){return k.apply_mode==="live_read"?"Odin reads the saved file value on next use.":k.apply_mode==="live_for_new_work"?"New work uses the saved file value.":k.apply_mode==="live_apply"?k.apply_handler?`Apply the saved value through ${k.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":k.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":k.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":k.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function Lt(k){return k.type==="array"&&Array.isArray(k.value)&&!k.structured_container&&!k.structured_container_child&&k.sensitivity==="public"&&k.value.every($=>["string","number","boolean"].includes(typeof $))}function Yn(k){const $=String(y.value[k.path]??"").trim();if(!$)return;const Z=[...new Set([...k.value||[],$])];y.value={...y.value,[k.path]:""},yt(k,Z)}function ss(k,$){yt(k,(k.value||[]).filter(Z=>Z!==$))}function Ta(k,$){var xe;if(!k)return null;if((xe=k.enum)!=null&&xe.length&&!k.enum.includes($))return`Choose one of: ${k.enum.join(", ")}`;if(k.path==="agents.final_warning_iterations"&&(!Array.isArray($)||!$.length))return"Add at least one warning threshold.";const Z=k.constraints||{};if((k.type==="integer"||k.type==="number")&&typeof $=="number"){if(Z.minimum!==void 0&&$<Z.minimum)return`Must be at least ${Z.minimum}${k.unit?` ${k.unit}`:""}`;if(Z.maximum!==void 0&&$>Z.maximum)return`Must be at most ${Z.maximum}${k.unit?` ${k.unit}`:""}`}return null}function Us(k){return Y.value[k.path]||null}function pi(k){const $=`${k}.`;return Object.keys(Y.value).some(Z=>Z===k||Z.startsWith($))}function Ca(){b.value.length&&(S.value.push(ia(v.value)),v.value=b.value.pop(),g.value={},T.value={},A={path:null,at:0})}function Qn(){S.value.length&&(b.value.push(ia(v.value)),v.value=S.value.pop(),g.value={},T.value={},A={path:null,at:0})}function Ea(){!ie.value||be.value||(w.value=!0,E.value=!1)}function Xn(){w.value=!1}function Pn(){Nn()}function ws(k){return dk[k]||La(k||"unknown")}function on(k){return`apply-${String(k||"unknown").replaceAll("_","-")}`}function qt(k){return`cfgc-field-${k.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Aa(k){return`${qt(k)}-input`}function j(k){const $=document.getElementById(qt(k))||document.getElementById(qt(k.split(".").slice(0,2).join(".")));$==null||$.scrollIntoView({behavior:"smooth",block:"center"})}function ye(k,$){l.value={type:k,message:$},window.setTimeout(()=>{var Z;((Z=l.value)==null?void 0:Z.message)===$&&(l.value=null)},3500)}function Ee(){o.value=!1,p.value="pending_restart",u.value="";const k=ck(n.value);k&&(k.scrollTop=0)}function Hs(){o.value=!1}function Ks(k=1800){D&&window.clearTimeout(D),D=window.setTimeout(Mn,k)}async function Mn(){if(c.value){if(R+=1,R>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await fo(),_.value===0){c.value=!1,d.value=null,ye("success","Odin restarted and the saved startup settings are active.");return}}catch{}Ks(2e3)}}async function Te(){if(!c.value){d.value=null;try{await W.post("/api/restart",{}),c.value=!0,R=0,o.value=!1,Ks()}catch(k){d.value=k.message||"Odin could not schedule a restart."}}}async function L(){if(!(!ie.value||be.value||a.value)){a.value=!0;try{const k=vk(e.value,v.value),$=await W.put("/api/config",k);e.value=$,v.value={},b.value=[],S.value=[],g.value={},w.value=!1;try{t.value=await fo(),r.value=null,o.value=_.value>0,ye("success",_.value?`Configuration saved. ${_.value} setting${_.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(Z){r.value=Z.message||"Unknown metadata error.",ye("error",`Configuration saved, but apply status could not be refreshed: ${r.value}`)}}catch(k){ye("error",k.message||"Configuration could not be saved")}finally{a.value=!1}}}async function ee(){var k,$;if(!ie.value){s.value=!0,i.value=null;try{const Z=await W.get("/api/config"),xe=await fo();e.value=Z,t.value=xe,r.value=null;const Qe=G.value;if(Qe.some(Gt=>Gt.key===h.value)||(h.value=((k=Qe[0])==null?void 0:k.key)||Ja[0].key),C.value){const cn=((($=Qe.find(ea=>ea.key===h.value))==null?void 0:$.sections)||[]).find(ea=>m.value[ea]===!0);m.value=cn?{...m.value,[cn]:!0}:{}}}catch(Z){i.value=Z.message||"Unknown configuration error"}finally{s.value=!1}}}function ve(k){if(w.value||!(k.ctrlKey||k.metaKey))return;const $=k.target;$ instanceof HTMLElement&&($.matches("input, textarea, select")||$.isContentEditable)||(!k.shiftKey&&k.key.toLowerCase()==="z"?(k.preventDefault(),Ca()):(k.key.toLowerCase()==="y"||k.shiftKey&&k.key.toLowerCase()==="z")&&(k.preventDefault(),Qn()))}function Me(k){C.value=k.matches}os(m,k=>{try{localStorage.setItem(Dm,JSON.stringify(k))}catch{}},{deep:!0});let $e=!1;function He(){$e||($e=!0,document.addEventListener("keydown",ve))}function bt(){$e&&($e=!1,document.removeEventListener("keydown",ve))}return Ke(()=>{var k;ee(),He(),x=window.matchMedia("(max-width: 760px)"),Me(x),(k=x.addEventListener)==null||k.call(x,"change",Me)}),us(He),ts(bt),mt(()=>{var k;bt(),(k=x==null?void 0:x.removeEventListener)==null||k.call(x,"change",Me),D&&window.clearTimeout(D)}),{armKeydown:He,disarmKeydown:bt,handleKeydown:ve,config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:r,restartPromptOpen:o,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:h,reviewOpen:w,mobileOverflowOpen:E,warningThresholdInput:I,arrayInputs:y,healthFilters:N,visibleCategories:G,displayGroups:H,reviewGroups:oe,sectionCount:le,fieldCount:M,hasChanges:ie,changeCount:X,changedSectionCount:ce,hasDraftErrors:be,canUndo:O,canRedo:B,globalFilterActive:Pe,reviewRestartCount:ue,pendingRestartCount:_,pendingRestartFields:Oe,healthCount:Ie,categoryStats:Ze,selectCategory:gt,selectHealthFilter:ys,clearFilters:kt,sectionLabel:te,sectionDescription:ne,sectionFieldCount:ae,sectionHealthCount:_e,sectionApplySummary:pe,sectionApplyDetails:de,sectionEntries:we,fieldGroups:F,sectionSearchHits:Mt,mcpConfigSummary:ke,fieldRuntimeCopy:me,fieldSpecificRuntimeNote:Le,hasHonestAction:De,runFieldAction:ct,sectionChanged:pt,fieldChanged:Ue,isSectionExpanded:xs,toggleSection:an,discardAllDrafts:Nn,setFieldValue:yt,setNumberFieldValue:he,numberInputValue:K,beginInputEdit:Bs,endTextInputEdit:rn,endInputEdit:at,addWarningThreshold:Ne,removeWarningThreshold:Ve,isScalarArray:Lt,addScalarArrayItem:Yn,removeScalarArrayItem:ss,fieldError:Us,sectionHasErrors:pi,undo:Ca,redo:Qn,openReview:Ea,closeReview:Xn,mobileCancel:Pn,applyModeLabel:ws,applyClass:on,compactValue:hk,formatValue:mk,structuredApplyCopy:tt,fieldId:qt,fieldInputId:Aa,focusField:j,fetchConfig:ee,saveConfig:L,restartOdin:Te,restartLater:Hs,reviewPendingRestart:Ee}}},xk=/^\d{15,25}$/;function $m(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Bm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),n=f(!1),a=f(0),i=f(null),l=J(()=>new Set((e.excludedIds||[]).map(String))),r=J(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(w=>l.value.has(String(w.id))?!1:S?u(w).toLowerCase().includes(S)||String(w.username||"").toLowerCase().includes(S)||String(w.id).includes(S):!0)}),o=J(()=>{const S=s.value.trim();return r.value.length===0&&xk.test(S)&&!l.value.has(S)?S:""}),c=J(()=>r.value.length+(o.value?1:0)),d=J(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(S){return $m(S)}function p(){n.value=!0,a.value=0}function h(){p()}function m(){const S=Math.max(c.value-1,0);a.value=Math.min(a.value+1,S)}function v(){a.value=Math.max(a.value-1,0)}function T(){const S=r.value[a.value];S?I(S):o.value&&a.value===r.value.length&&y(o.value)}function I(S){y(String(S.id))}function y(S){t("select",S),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function b(){setTimeout(g,150)}return Ke(()=>{e.autofocus&&At(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:T,selectMember:I,selectId:y,closeOptions:g,onBlur:b}}};function Ku(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const _k={components:{DiscordUserCombobox:Bm},template:`
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
  `,setup(){const e=f([]),t=f(!0),s=f(null),n=f({}),a=f(null),i=f(null),l=f(!1),r=f(null),o=f({}),c=f([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=J(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),h=J(()=>new Map(c.value.map(M=>[String(M.id),M])));function m(M){return M.config&&M.config.enabled!==void 0?M.config.enabled:!0}function v(M){return Ku(M,"require_mention",a.value)}function T(M){return Ku(M,"respond_to_bots",a.value)}function I(M){return M.config&&Object.keys(M.config).length>0}function y(M){n.value[M]=!n.value[M]}function g(M){const N=M.discord||{};return{allowed_users:[...N.allowed_users||[]],channels:[...N.channels||[]],respond_to_bots:!!N.respond_to_bots,require_mention:!!N.require_mention,ignore_bot_ids:[...N.ignore_bot_ids||[]]}}async function b({showLoading:M=!0}={}){const N=++d;M&&(t.value=!0),s.value=null;try{const O=await W.get("/api/discord/guilds");N===d&&(e.value=O)}catch(O){N===d&&(s.value=O.message)}finally{M&&N===d&&(t.value=!1)}}async function S(){t.value=!0,s.value=null;try{const[M,N,O]=await Promise.all([W.get("/api/discord/guilds"),W.get("/api/discord/members").catch(()=>[]),W.get("/api/config")]),B=g(O),G=p.value;a.value=B,G||(i.value=JSON.parse(JSON.stringify(B))),c.value=N,e.value=M,r.value=null}catch(M){s.value=M.message}finally{t.value=!1}}let w=Promise.resolve();const E=f(new Set);function C(M,N){const O=new Set(E.value);O.add(M),E.value=O;const B=w.then(N);return w=B.catch(()=>{}),B.finally(()=>{const G=new Set(E.value);G.delete(M),E.value=G})}function x(M,N,O,B){const G=(B==null?void 0:B.target)??null;return C(`guild:${M}:${N}`,async()=>{try{await W.put("/api/discord/guild/"+M+"/config",{[N]:O}),await b({showLoading:!1})}catch(q){s.value=q.message,G&&typeof O=="boolean"&&(G.checked=!O)}})}function D(M,N,O,B,G){const q=(G==null?void 0:G.target)??null;return C(`channel:${M}:${O}`,async()=>{try{await W.put("/api/discord/channel/"+M+"/config",{[O]:B}),await b({showLoading:!1})}catch(Q){s.value=Q.message,q&&typeof B=="boolean"&&(q.checked=!B)}})}function A(M,N){return C(`channel:${M}:clear`,async()=>{try{await W.put("/api/discord/channel/"+M+"/config",{clear:!0}),await b({showLoading:!1})}catch(O){s.value=O.message}})}function R(M,N){const O=String(N);if(!M.userAutocomplete)return O;const B=h.value.get(O);return B?$m(B):O}function z(M,N=null){const O=String(N??o.value[M]??"").trim();!O||i.value[M].includes(O)||(i.value[M]=[...i.value[M],O],o.value={...o.value,[M]:""})}function V(M,N){i.value[M]=i.value[M].filter(O=>O!==N)}async function le(){if(!(!p.value||l.value)){l.value=!0,r.value=null;try{const N=(await W.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...N.allowed_users||[]],channels:[...N.channels||[]],respond_to_bots:!!N.respond_to_bots,require_mention:!!N.require_mention,ignore_bot_ids:[...N.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(M){r.value=M.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ke(S),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:T,hasOverride:I,toggleGuild:y,fetchAll:S,fetchGuilds:b,setGuildConfig:x,setChannelConfig:D,clearOverride:A,mutationPending:E,globalItemLabel:R,addGlobalItem:z,removeGlobalItem:V,saveGlobalDefaults:le}}},ks=e=>e==null?e:JSON.parse(JSON.stringify(e));function wk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(w){d+=1;const E=c.then(w,w);return c=E.catch(()=>{}),E}function T(w,E){h=ks(w),m.clear();for(const[C,x]of Object.entries(E||{}))m.set(C,ks(x))}function I(w){const E=ks(w),C=++u;return v(async()=>{try{await e(ks(E)),h=ks(E),C===u&&n(ks(E))}catch(x){C===u&&(a(ks(h)),o(x,{kind:"default"}))}})}function y(w,E){const C=ks(E),x=(p.get(w)||0)+1;return p.set(w,x),v(async()=>{try{await t(w,ks(C)),m.set(w,ks(C)),x===p.get(w)&&i(w,ks(C))}catch(D){x===p.get(w)&&(l(w,ks(m.get(w)??null)),o(D,{kind:"user",uid:w}))}})}function g(w){const E=(p.get(w)||0)+1;return p.set(w,E),v(async()=>{try{await s(w),m.delete(w),E===p.get(w)&&r(w)}catch(C){E===p.get(w)&&(l(w,ks(m.get(w)??null)),o(C,{kind:"delete",uid:w}))}})}async function b(){for(;;){const w=c;if(await w,w===c)return d}}async function S(w){for(;;){const E=await b(),C=await w();if(E===d)return C}}return{seed:T,saveDefault:I,saveUser:y,deleteUser:g,whenIdle:b,readSnapshot:S,get revision(){return d}}}const kk={components:{DiscordUserCombobox:Bm},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),n=f([]),a=f({allowed_hosts:[],default_host:""}),i=f({}),l=f(!1),r=f([]),o=J(()=>{const A={};for(const R of r.value)A[R.id]=R;return A});function c(A){return o.value[A]||null}function d(A,R){return A?A.allowed_hosts===null||A.allowed_hosts===void 0?{allowed_hosts:[...R],default_host:A.default_host||"",allow_all:!0}:{allowed_hosts:A.allowed_hosts,default_host:A.default_host||"",allow_all:!1}:{allowed_hosts:[...R],default_host:R[0]||"",allow_all:!0}}const u=wk({applyDefault:async A=>{const R=A.allow_all?null:A.allowed_hosts;await W.put("/api/host-access/default-policy",{allowed_hosts:R,default_host:A.default_host})},applyUser:async(A,R)=>{const z=R.allow_all?null:R.allowed_hosts;await W.put(`/api/host-access/user/${A}`,{allowed_hosts:z,default_host:R.default_host})},applyDelete:A=>W.del(`/api/host-access/user/${A}`),onDefaultConfirmed:()=>Re.success("Default policy updated"),onDefaultRollback:A=>{A&&(a.value=A)},onUserConfirmed:A=>{const R=c(A);Re.success(`Updated access for ${R?R.display_name:A}`)},onUserRollback:(A,R)=>{const z={...i.value};R?z[A]=R:delete z[A],i.value=z},onUserDeleted:A=>{const R={...i.value};delete R[A],i.value=R},onError:(A,R)=>{var V;const z=R.uid?` ${((V=c(R.uid))==null?void 0:V.display_name)||R.uid}`:"";Re.error(`${A.message||"Failed to save"} — reverted${z}`)}});let p=0;async function h(){const A=++p;e.value=!0,t.value="";try{const R=await u.readSnapshot(()=>W.get("/api/host-access"));if(A!==p)return;s.value=R,n.value=R.available_hosts||[],a.value=d(R.default_policy,n.value);const z=R.users||{},V={};for(const[le,M]of Object.entries(z))V[le]=d(M,n.value);i.value=V,u.seed(a.value,V)}catch(R){A===p&&(t.value=R.message||"Failed to fetch host access data")}finally{A===p&&(e.value=!1)}try{const R=await W.get("/api/discord/members")||[];A===p&&(r.value=R)}catch{A===p&&(r.value=[])}}const m=500,v=new Map;function T(A,R){const z=v.get(A);z&&clearTimeout(z.timer);const V={run:R,timer:null};V.timer=setTimeout(()=>{v.delete(A),R()},m),v.set(A,V)}function I(A){const R=v.get(A);R&&(clearTimeout(R.timer),v.delete(A))}function y(){for(const[A,R]of[...v])clearTimeout(R.timer),v.delete(A),R.run()}function g(){T("default",()=>u.saveDefault(a.value))}function b(A,R){a.value.allow_all=!1,R?a.value.allowed_hosts.includes(A)||a.value.allowed_hosts.push(A):(a.value.allowed_hosts=a.value.allowed_hosts.filter(z=>z!==A),a.value.default_host===A&&(a.value.default_host=a.value.allowed_hosts[0]||"")),g()}function S(A){T(`user:${A}`,()=>{const R=i.value[A];R&&u.saveUser(A,R)})}function w(A,R,z){const V=i.value[A];V&&(V.allow_all=!1,z?V.allowed_hosts.includes(R)||V.allowed_hosts.push(R):(V.allowed_hosts=V.allowed_hosts.filter(le=>le!==R),V.default_host===R&&(V.default_host=V.allowed_hosts[0]||"")),S(A))}function E(A,R){const z=i.value[A];z&&(z.default_host=R,S(A))}function C(){l.value=!0}function x(A){!/^\d{15,25}$/.test(A)||i.value[A]||(i.value[A]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},u.saveUser(A,i.value[A]),l.value=!1)}async function D(A){const R=c(A);await Xt({title:"Remove user override",message:`Remove the host access override for ${R?R.display_name:A}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(I(`user:${A}`),await u.deleteUser(A),i.value[A]||Re.success(`Removed override for ${R?R.display_name:A}`))}return Ke(h),ts(y),mt(y),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:h,saveDefaultPolicy:g,toggleDefaultHost:b,getMember:c,toggleUserHost:w,setUserDefault:E,openAddUser:C,addUserById:x,deleteUser:D,flushPendingSaves:y}}},Sk={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),n=f([]),a=f(!1),i=f(!1),l=f(null),r=f(null),o=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=J(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function h(C){return C==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":C==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const C=await W.get("/api/tokens");s.value=C.tokens||[],n.value=C.available_hosts||[]}catch(C){t.value=C.message||"Failed to load tokens"}finally{e.value=!1}}function v(C){return!C||!C.trim()?[]:C.split(",").map(x=>x.trim()).filter(Boolean)}function T(C,x){const D=c.value.allowed_hosts;if(x&&!D.includes(C)&&D.push(C),!x){const A=D.indexOf(C);A>=0&&D.splice(A,1)}}function I(C,x){const D=d.value.allowed_hosts;if(x&&!D.includes(C)&&D.push(C),!x){const A=D.indexOf(C);A>=0&&D.splice(A,1)}}async function y(){var C;i.value=!0;try{const x=v(c.value.allowed_tools_str),D=c.value.host_mode,A=D==="none"?[]:D==="select"?c.value.allowed_hosts:null,R={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:x.length?x:[]};A!==null&&(R.allowed_hosts=A),R.default_host=c.value.default_host||"";const z=await W.post("/api/tokens",R);l.value=z.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Re.success("Token created"),await m()}catch(x){Re.error(((C=x.data)==null?void 0:C.error)||x.message||"Failed to create token")}finally{i.value=!1}}function g(C){r.value=C;const x=C.allowed_hosts;let D="default";x==null?D="default":Array.isArray(x)&&x.length===0?D="none":Array.isArray(x)&&(D="select"),d.value={username:C.username||"",tier:C.tier||"admin",label:C.label||"",host_mode:D,allowed_hosts:Array.isArray(x)?[...x]:[],default_host:C.default_host||"",allowed_tools_str:(C.allowed_tools||[]).join(", ")}}async function b(){var C;if(r.value){o.value=!0;try{const x=v(d.value.allowed_tools_str),D=d.value.host_mode,A={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:x};D==="none"?A.allowed_hosts=[]:D==="select"?A.allowed_hosts=d.value.allowed_hosts:A.allowed_hosts=null,A.default_host=d.value.default_host||"",await W.put("/api/tokens/"+encodeURIComponent(r.value.user_id),A),r.value=null,Re.success("Token updated"),await m()}catch(x){Re.error(((C=x.data)==null?void 0:C.error)||x.message||"Failed to update")}finally{o.value=!1}}}async function S(C){var D;if(await Xt({title:"Regenerate token",message:`Regenerate token for ${C.username||C.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const A=await W.post("/api/tokens/"+encodeURIComponent(C.user_id)+"/regenerate");l.value=A.token,Re.success("Token regenerated")}catch(A){Re.error(((D=A.data)==null?void 0:D.error)||A.message||"Failed to regenerate")}}async function w(C){var D;if(await Xt({title:"Delete token",message:`Delete token for ${C.username||C.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/tokens/"+encodeURIComponent(C.user_id)),Re.success("Token deleted"),await m()}catch(A){Re.error(((D=A.data)==null?void 0:D.error)||A.message||"Failed to delete")}}async function E(){if(l.value)try{await navigator.clipboard.writeText(l.value),Re.success("Copied to clipboard")}catch{Re.error("Copy failed — select and copy manually")}}return Ke(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:T,toggleEditHost:I,createToken:y,startEdit:g,saveEdit:b,confirmRegenerate:S,confirmDelete:w,copyToken:E}}},Tk=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),Ck=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),Ek=Object.freeze(["enabled","base_url","model","max_tokens"]),Ak=Object.freeze(["enabled","model","max_tokens"]);function zr(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function Wu(e){return zr(e,Tk)}function Zu(e){return zr(e,Ck)}function Rk(e,{includeApiKey:t=!1}={}){const s=zr(e,Ek);return t&&(s.api_key=e.api_key),s}function Ik(e){return{timeout:e.timeout}}function Ok(e,{includeApiKey:t=!1}={}){const s=zr(e,Ak);return t&&(s.api_key=e.api_key),s}function Lk(e){return{timeout:e.timeout}}function Al(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Nk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f("codex"),a=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=J(()=>{const j=a.value.model;return j&&!i.includes(j)?[j,...i]:i}),r=J(()=>{const j=a.value.agent_model;return j&&j!=="auto"&&!i.includes(j)?[j,...i]:i}),o={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(j,ye)=>!!j&&!!ye&&(o[j]||[]).includes(ye),d=j=>!c(a.value.model,j)&&!(a.value.agent_reasoning_effort===""&&c(a.value.agent_model,j)),u=j=>{const ye=a.value.agent_model;return ye==="auto"?!0:!c(ye||a.value.model,j)},p=J(()=>{const j=a.value.agent_reasoning_effort;return j==="auto"?null:j||a.value.reasoning_effort}),h=j=>c(j,a.value.reasoning_effort)||a.value.agent_model===""&&c(j,p.value),m=j=>c(j,p.value),v=f({enabled:!1,model:"gpt-5.6-luna"}),T=f({unavailable_reason:null}),I=J(()=>{const j=v.value.model;return j&&!i.includes(j)?[j,...i]:i});function y(j){const ye=j.target.value;v.value.enabled=ye!=="",ye!==""&&(v.value.model=ye),Ne()}const g=f(!1),b=f({codex:!1,ollama:!1,kimi:!1}),S=f(null),w=f(!1),E=f(""),C=f(null),x=f(!1);let D=0;const A=J(()=>{var j;return Object.entries(((j=S.value)==null?void 0:j.models)||{}).map(([ye,Ee])=>{var Hs,Ks,Mn;return{model:ye,floor:Ee.floor,override:Ee.override,effectiveBudget:(Hs=Ee.effective)==null?void 0:Hs.effective_budget,configuredPrimaryChars:(Ks=Ee.configured)==null?void 0:Ks.primary_chars,primaryChars:(Mn=Ee.effective)==null?void 0:Mn.primary_chars,provenance:Ee.provenance,clampExpiresAt:Ee.clamp_expires_at,densityPriorMilli:Ee.density_prior_milli,densityScope:Ee.density_scope,workloadCalibration:Ee.workload_calibration}})}),R=J(()=>{var j;return((j=S.value)==null?void 0:j.clamps)||[]}),z=J(()=>{var j,ye;return((ye=(j=S.value)==null?void 0:j.models)==null?void 0:ye[a.value.model])||null}),V=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),le=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),M=f(!1),N=f(!1),O=f(!1),B=f(!1),G=f(!1),q=f(!1),Q=f(!1),ie=f({configured:null}),X=f(!1),ce=f([]),Pe=f(""),Y=f(!1),be=f(!1),H=f({configured:null}),oe=f(!1),ue=f([]),Oe=f(""),_=f(!1),P=f(!1),U=f(!0),ae=f(""),te=f({configured:null,accounts:[]}),ne=f(null),fe=f(null),pe=f(""),de=f(null),re=f(!1),ke=f(null),ge=f(null),we=f("");let Ae=null;function F(j,ye="success"){Re(j,ye==="error"?"error":"success")}function me(j){if(!j)return"?";const ye=j/(1024*1024*1024);return ye>=1?ye.toFixed(1)+" GB":(j/(1024*1024)).toFixed(0)+" MB"}function Se(j){return Number.isFinite(Number(j))?Number(j).toLocaleString():"—"}function Le(j){return j==null?"automatic (model-derived)":Number(j).toLocaleString()+" characters"}function De(j){const ye=new Date(j);return Number.isNaN(ye.getTime())?"unknown":ye.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function ct(j){return typeof j=="string"&&j.length>12?j.slice(0,8)+"…"+j.slice(-4):j}function rt(j){return typeof j!="number"||!Number.isFinite(j)?"—":(j/1e3).toFixed(2)}function Mt(j){return j==="temporary learned clamp"?"is-clamp":j==="override"?"is-override":"is-built-in"}function se(j){const ye=a.value.context_budget_overrides[j.model];return j.floor!=null&&Number.isFinite(Number(ye))&&Number(ye)>j.floor}function _e(j,ye){const Ee={...a.value.context_budget_overrides};ye.target.value===""?delete Ee[j]:Ee[j]=Number(ye.target.value),a.value.context_budget_overrides=Ee,x.value=!0}function Ie(j){a.value.context_utilization=j.target.value===""?"":Number(j.target.value),x.value=!0}function Ze(j){const ye={...a.value.context_budget_overrides};delete ye[j],a.value.context_budget_overrides=ye,x.value=!0}async function pt(){e.value=!0,await Promise.all([Ue(),ys(),_s(),kt(),gt()]),e.value=!1}async function Ue({preserveBasic:j=!1,preserveAdvanced:ye=!1}={}){try{const Ee=await W.get("/api/llm/status");t.value=Ee,s.value=!1,n.value=Ee.active_provider||"codex",Ee.codex&&!he.pending()&&(j||(a.value.enabled=Ee.codex.enabled,a.value.model=Ee.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Ee.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Ee.codex.agent_reasoning_effort||"",a.value.agent_model=Ee.codex.agent_model||""),ye||(a.value.request_timeout_seconds=Ee.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Ee.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Ee.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Ee.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Ee.codex.context_compression||{}},!x.value&&!O.value&&(a.value.context_budget_overrides={...Ee.codex.context_budget_overrides||{}},a.value.context_utilization=Ee.codex.context_utilization??a.value.context_utilization))),Ee.ollama&&!Ve.pending()&&(j||(V.value.enabled=Ee.ollama.enabled,V.value.base_url=Ee.ollama.base_url||"",V.value.model=Ee.ollama.model||"",V.value.max_tokens=Ee.ollama.max_tokens||4096),ye||(V.value.timeout=Ee.ollama.timeout??V.value.timeout)),Ee.kimi&&!tt.pending()&&(j||(le.value.enabled=Ee.kimi.enabled,le.value.model=Ee.kimi.model||"",le.value.max_tokens=Ee.kimi.max_tokens||4096),ye||(le.value.timeout=Ee.kimi.timeout??le.value.timeout)),Ee.auxiliary&&(T.value=Ee.auxiliary,Ne.pending()||(v.value.enabled=Ee.auxiliary.enabled,v.value.model=Ee.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function gt(){const j=++D;w.value=!0,E.value="";try{const ye=await W.get("/api/context/windows");if(j!==D)return;S.value=ye,!O.value&&!x.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(ye.models||{}).filter(([,Ee])=>Ee.override!=null).map(([Ee,Hs])=>[Ee,Hs.override])),a.value.context_utilization=ye.utilization??a.value.context_utilization)}catch(ye){j===D&&(E.value=ye.message||"Failed to load context budgets")}finally{j===D&&(w.value=!1)}}async function ys(){try{if(ie.value=await W.get("/api/ollama/status"),X.value=!1,ie.value.model&&(Pe.value=ie.value.model),ie.value.configured)try{const j=await W.get("/api/ollama/models");ce.value=j.models||[]}catch{ce.value=[]}else if(V.value.base_url)try{const j=await W.post("/api/ollama/probe-models",{base_url:V.value.base_url});ce.value=j.models||[]}catch{ce.value=[]}}catch{X.value=!0}}async function kt(){U.value=!0,ae.value="";try{te.value=await W.get("/api/codex/status")}catch(j){ae.value=j.message||"Failed to fetch Codex status"}finally{U.value=!1}}async function Fs(){const j=t.value?t.value.active_provider:"codex";Q.value=!0;try{const ye=await W.post("/api/llm/switch",{provider:n.value});ye.error?(n.value=j,F(ye.error,"error")):(F("Switched to "+n.value+" ("+ye.model+")"),await pt())}catch(ye){n.value=j,F(ye.message||"Switch failed","error")}finally{Q.value=!1}}async function Bt(){Y.value=!0;try{const j=await W.post("/api/ollama/reload");F(j.configured?"Ollama reloaded":j.reason||"Ollama not configured",j.configured?"success":"error"),await pt()}catch(j){F(j.message||"Reload failed","error")}finally{Y.value=!1}}async function xs(){be.value=!0;try{await W.post("/api/ollama/model",{model:Pe.value}),F("Model set to "+Pe.value),await pt()}catch(j){F(j.message||"Failed","error")}finally{be.value=!1}}async function an(){const j=V.value.base_url;if(!j){F("Enter a base URL first","error");return}q.value=!0;try{const ye=await W.post("/api/ollama/probe-models",{base_url:j});ce.value=ye.models||[],ce.value.length?(F(ce.value.length+" model(s) found"),!V.value.model&&ce.value.length&&(V.value.model=ce.value[0].name)):F("No models found at "+j,"error")}catch(ye){F(ye.message||"Could not reach Ollama","error")}finally{q.value=!1}}async function _s(){try{if(H.value=await W.get("/api/kimi/status"),oe.value=!1,H.value.model&&(Oe.value=H.value.model),H.value.configured)try{const j=await W.get("/api/kimi/models");ue.value=j.models||[]}catch{ue.value=[]}}catch{oe.value=!0}}async function Nn(){_.value=!0;try{const j=await W.post("/api/kimi/reload");F(j.configured?"Kimi reloaded":j.reason||"Kimi not configured",j.configured?"success":"error"),await pt()}catch(j){F(j.message||"Reload failed","error")}finally{_.value=!1}}async function ln(){P.value=!0;try{await W.post("/api/kimi/model",{model:Oe.value}),F("Model set to "+Oe.value),await pt()}catch(j){F(j.message||"Failed","error")}finally{P.value=!1}}async function $s(){if(O.value){he();return}O.value=!0;const j=Wu(a.value);try{await W.put("/api/llm/codex/config",j),F("Codex config saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),kt()])}catch(ye){F(ye.message||"Failed","error");const Ee=JSON.stringify(Wu(a.value))!==JSON.stringify(j);await Promise.all([Ue({preserveBasic:Ee,preserveAdvanced:!0}),kt()])}finally{O.value=!1}}async function Dn(){if(O.value)return;O.value=!0;const j=Zu(a.value);try{await W.put("/api/llm/codex/config",j),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:j.context_budget_overrides,context_utilization:j.context_utilization})&&(x.value=!1),F("Codex advanced settings saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),kt(),gt()])}catch(ye){F(ye.message||"Failed","error");const Ee=JSON.stringify(Zu(a.value))!==JSON.stringify(j);await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:Ee}),kt(),gt()])}finally{O.value=!1}}async function yt(){if(B.value){Ve();return}B.value=!0;try{const j=M.value?V.value.api_key:null,ye=Rk(V.value,{includeApiKey:j!==null});await W.put("/api/llm/ollama/config",ye),F("Ollama config saved"),j!==null&&V.value.api_key===j&&(V.value.api_key="",M.value=!1),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),ys()])}catch(j){F(j.message||"Failed","error")}finally{B.value=!1}}async function Bs(){if(!B.value){B.value=!0;try{await W.put("/api/llm/ollama/config",Ik(V.value)),F("Ollama timeout saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),ys()])}catch(j){F(j.message||"Failed","error")}finally{B.value=!1}}}async function rn(){if(G.value){tt();return}G.value=!0;try{const j=N.value?le.value.api_key:null,ye=Ok(le.value,{includeApiKey:j!==null});await W.put("/api/llm/kimi/config",ye),F("Kimi config saved"),j!==null&&le.value.api_key===j&&(le.value.api_key="",N.value=!1),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),_s()])}catch(j){F(j.message||"Failed","error")}finally{G.value=!1}}async function at(){if(!G.value){G.value=!0;try{await W.put("/api/llm/kimi/config",Lk(le.value)),F("Kimi timeout saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),_s()])}catch(j){F(j.message||"Failed","error")}finally{G.value=!1}}}async function K(){if(g.value){Ne();return}g.value=!0;try{await W.put("/api/llm/auxiliary/config",v.value),F("Auxiliary config saved"),await Ue()}catch(j){F(j.message||"Failed","error"),await Ue()}finally{g.value=!1}}const he=Al($s),Ne=Al(K),Ve=Al(yt),tt=Al(rn),Lt=()=>(he.cancel(),$s()),Yn=()=>(Ve.cancel(),yt()),ss=()=>(tt.cancel(),rn()),Ta=()=>Dn(),Us=()=>Bs(),pi=()=>at();async function Ca(j){const ye=j.account_key+":"+j.model;C.value=ye;try{const Ee=await W.post("/api/context/windows/clear",{account_key:j.account_key,model:j.model});F(Ee.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await gt()}catch(Ee){F(Ee.message||"Failed to clear clamp","error"),await gt()}finally{C.value=null}}async function Qn(j){try{await W.post("/api/codex/account/"+j+"/activate"),F("Active account switched"),await kt()}catch(ye){F(ye.message||"Failed","error")}}async function Ea(j){ne.value=j;try{await W.post("/api/codex/account/"+j+"/refresh"),F("Token refreshed"),await kt()}catch(ye){F(ye.message||"Refresh failed","error")}finally{ne.value=null}}function Xn(j,ye){fe.value=j,pe.value=ye||""}async function Pn(j){try{await W.put("/api/codex/account/"+j+"/label",{label:pe.value}),F("Label updated"),fe.value=null,await kt()}catch(ye){F(ye.message||"Failed","error")}}async function ws(j,ye){if(await Xt({title:"Delete Codex account",message:`Delete ${ye||"account #"+(j+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/codex/account/"+j),F("Deleted. Pool reloaded."),await kt()}catch(Hs){F(Hs.message||"Failed","error")}}async function on(){re.value=!0;try{const j=await W.post("/api/codex/device-code");ke.value=j,de.value="pending",qt(j)}catch(j){F(j.message||"Failed","error")}finally{re.value=!1}}async function qt(j){Ae={cancelled:!1};const ye=Ae;try{const Ee=await W.post("/api/codex/device-poll",{device_auth_id:j.device_auth_id,user_code:j.user_code,interval:j.interval});if(ye.cancelled)return;ge.value=Ee,de.value="success",await pt()}catch(Ee){if(ye.cancelled)return;we.value=Ee.message||"Device login failed",de.value="error"}}function Aa(){Ae&&(Ae.cancelled=!0),de.value=null,ke.value=null}return Ke(pt),mt(()=>{Ae&&(Ae.cancelled=!0),he.cancel(),Ne.cancel(),Ve.cancel(),tt.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:Q,advancedOpen:b,codexForm:a,codexModelOptions:l,codexAgentModelOptions:r,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:h,agentModelOptionDisabled:m,auxForm:v,auxData:T,auxModelOptions:I,onAuxModelChange:y,savingAux:g,saveAuxConfigDebounced:Ne,ollamaForm:V,kimiForm:le,savingCodex:O,savingOllama:B,savingKimi:G,probingOllama:q,ollamaKeyDirty:M,kimiKeyDirty:N,fetchCodexStatus:kt,ollamaStatus:ie,ollamaStatusLoadFailed:X,ollamaModels:ce,ollamaSelectedModel:Pe,reloading:Y,settingModel:be,kimiStatus:H,kimiStatusLoadFailed:oe,kimiModels:ue,kimiSelectedModel:Oe,reloadingKimi:_,settingKimiModel:P,codexLoading:U,codexError:ae,codexData:te,refreshing:ne,editingLabel:fe,labelValue:pe,contextWindows:S,contextWindowsLoading:w,contextWindowsError:E,contextBudgetRows:A,activeClampRows:R,activeContextBudget:z,clearingClamp:C,contextPolicyDirty:x,deviceState:de,deviceLoading:re,deviceInfo:ke,deviceResult:ge,deviceError:we,fetchAll:pt,fetchLLMStatus:Ue,fetchOllamaStatus:ys,fetchKimiStatus:_s,switchProvider:Fs,reloadOllama:Bt,setOllamaModel:xs,reloadKimi:Nn,setKimiModel:ln,probeOllamaModels:an,saveCodexConfig:$s,saveOllamaConfig:yt,saveKimiConfig:rn,saveCodexAdvancedConfig:Dn,saveOllamaAdvancedConfig:Bs,saveKimiAdvancedConfig:at,saveCodexConfigDebounced:he,saveOllamaConfigDebounced:Ve,saveKimiConfigDebounced:tt,saveCodexConfigNow:Lt,saveOllamaConfigNow:Yn,saveKimiConfigNow:ss,saveCodexAdvancedConfigNow:Ta,saveOllamaAdvancedConfigNow:Us,saveKimiAdvancedConfigNow:pi,activateAccount:Qn,refreshAccount:Ea,startEditLabel:Xn,saveLabel:Pn,deleteAccount:ws,startDeviceLogin:on,cancelDeviceLogin:Aa,formatSize:me,fetchContextWindows:gt,clearContextClamp:Ca,setContextOverride:_e,setContextUtilization:Ie,resetContextOverride:Ze,overrideAboveFloor:se,formatCount:Se,formatContextCeiling:Le,formatExpiry:De,shortAccountKey:ct,provenanceClass:Mt,formatDensity:rt}}},Ju={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Dk(e){return Ju[e]||Ju[(e||"").toLowerCase()]||"text-gray-400"}const Pk={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),n=f({}),a=f({}),i=f(null),l=f(null),r=f(null),o=f(null),c=f(null),d=J(()=>{var w;return Object.values(((w=i.value)==null?void 0:w.totals)||{}).reduce((E,C)=>E+Number(C||0),0)}),u=f(""),p=f(0),h=f([]),m=J(()=>h.value.map(w=>`${w.label} (${w.path}${w.reason?`: ${w.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let T=null;async function I(){var D;const w=await Promise.allSettled(v.map(A=>W.get(A.path))),E=A=>w[A].status==="fulfilled"?w[A].value:null;t.value=E(0)||{};const C=E(1);s.value=Array.isArray(C)?C:C&&C.subsystems||[],n.value=E(2)||{},a.value=E(3)||{},i.value=E(4),l.value=E(5),r.value=E(6),o.value=E(7),c.value=E(8);const x=w.filter(A=>A.status==="rejected");if(h.value=w.flatMap((A,R)=>{var z;return A.status==="rejected"?[{...v[R],reason:((z=A.reason)==null?void 0:z.message)||"request failed"}]:[]}),p.value=h.value.length,x.length===w.length){const A=(D=x[0])==null?void 0:D.reason;u.value=(A==null?void 0:A.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",I()}let g=!1;function b(){g||(g=!0,I(),T||(T=setInterval(I,3e4)))}function S(){g&&(g=!1,T&&(clearInterval(T),T=null))}return Ke(b),us(b),ts(S),mt(S),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:y,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Dk,formatAgeSeconds:dw}}},Mk=1e4,Yu=3e4;function yi(e,t){return Math.max(0,e-t)}function ho(e,t){return new Set((e.operations||[]).map(n=>n.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const Fk=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],$k={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),n=f(!1),a=f(0),i=f(null),l=f(""),r=f(null),o=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const N=++p;n.value=!0;try{const O=await W.get("/api/turn-state/turns?limit=100");if(N!==p)return;t.value=O.availability,e.value=O.availability==="available"?O.data:null,s.value=null,a.value=Date.now()}catch(O){if(N!==p)return;s.value=O.message||"Turn-state read failed",O.status===503&&(t.value="unavailable")}N===p&&(n.value=!1)}async function v(){const N=++h;o.value=!0;try{const O=await W.get("/api/turn-state/capacity-breakers");if(N!==h)return;l.value=O.availability,i.value=O.availability==="available"?O.data:null,r.value=null,c.value=Date.now()}catch(O){if(N!==h)return;r.value=O.message||"Breaker read failed",O.status===503&&(l.value="unavailable")}N===h&&(o.value=!1)}function T(){m(),v()}const I=J(()=>e.value!==null&&yi(d.value,a.value)>Yu),y=J(()=>i.value!==null&&yi(d.value,c.value)>Yu),g=J(()=>I.value||y.value),b=J(()=>Math.round(yi(d.value,a.value)/1e3)),S=J(()=>Math.round(yi(d.value,c.value)/1e3));function w(N){return ho(N,d.value/1e3)}function E(N){return Fk[w(N)]}const C=J(()=>{var B;const N=[...((B=e.value)==null?void 0:B.turns)||[]],O=d.value/1e3;return N.sort((G,q)=>ho(G,O)-ho(q,O)||(q.last_progress_at||0)-(G.last_progress_at||0))});function x(N){return N.state==="closed"?"badge-success":N.state==="probing"?"badge-warning":"badge-danger"}function D(N){if(N.state==="closed")return"—";const O=yi(d.value,c.value)/1e3,B=Math.max(0,(N.cooldown_remaining_seconds||0)-O);return B>0?`${Math.ceil(B)}s`:N.state==="probing"?"probe in flight":"probe eligible"}function A(N){if(!N)return"";const O=Math.max(0,Math.round(d.value/1e3-N));if(O<90)return`${O}s ago`;const B=Math.round(O/60);return B<90?`${B}m ago`:`${Math.round(B/60)}h ago`}let R=null,z=null,V=!1;function le(){V||(V=!0,T(),R=setInterval(T,Mk),u=setInterval(()=>{d.value=Date.now()},1e3),z=Ye.onReconnected(T))}function M(){V&&(V=!1,R&&(clearInterval(R),R=null),u&&(clearInterval(u),u=null),z&&(z(),z=null))}return Ke(le),us(le),ts(M),mt(M),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:n,breakersData:i,breakersAvailability:l,breakersError:r,breakersLoading:o,turnsStale:I,breakersStale:y,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:S,sortedTurns:C,priorityOf:w,priorityBadge:E,breakerBadge:x,cooldownLabel:D,ageLabel:A,fetchTurns:m,fetchBreakers:v,refreshAll:T,arm:le,disarm:M}}},Bk={setup(){const e=f(""),t=f(""),s=f(!1),n=f(""),a=f(!1),i=f(!1),l=f(!1),r=f(null),o=f(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await W.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await Xt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await W.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return Ke(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Um=[{id:"health",label:"Health",component:sk},{id:"resources",label:"Resources",component:nk},{id:"logs",label:"Logs",component:rk},{id:"config",label:"Config",component:yk},{id:"discord",label:"Discord",component:_k},{id:"host-access",label:"Host Access",component:kk},{id:"api-tokens",label:"API Tokens",component:Sk},{id:"llm",label:"LLM Config",component:Nk},{id:"internals",label:"Internals",component:Pk},{id:"turn-state",label:"Turn State",component:$k},{id:"update",label:"Update",component:Bk}],Uk={components:{TabbedPage:Hr},setup(){return{tabs:Um}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Rl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Hk=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Rl("Operations","operations","/operations",Om),...Rl("History","history","/history",Lm),...Rl("Capabilities","capabilities","/capabilities",Nm),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Rl("System","system","/system",Um)],hs=Zn({open:!1,query:"",selected:0});function Qu(){hs.query="",hs.selected=0,hs.open=!0}function mo(){hs.open=!1}function zk(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const jk={setup(){const e=Tm(),t=f(null),s=J(()=>{const i=hs.query.trim().toLowerCase();return Hk.map(l=>({...l,_score:zk(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});os(()=>hs.open,async i=>{var l;i&&(await At(),(l=t.value)==null||l.focus())}),os(()=>hs.query,()=>{hs.selected=0});function n(i){mo(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),mo();return}if(i.key==="ArrowDown")i.preventDefault(),hs.selected=Math.min(hs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),hs.selected=Math.max(hs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[hs.selected];l&&n(l)}}return{state:hs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:mo}},template:`
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
  `},Yo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Yo));const Vk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Xa("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Xa("path",{d:Yo[e.name]||Yo.info})])}},qk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Xu(e){return[...e.querySelectorAll(qk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Gk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Xu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Xu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},Kk={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),n=f([]),a=f(!1),i=f([]),l=f(!1),r=f(!1),o=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=J(()=>{const G=e.value.uptime_seconds||0,q=Math.floor(G/86400),Q=Math.floor(G%86400/3600),ie=Math.floor(G%3600/60),X=[];return q>0&&X.push(`${q}d`),Q>0&&X.push(`${Q}h`),(X.length===0||q===0&&Q===0)&&X.push(`${ie}m`),X.join(" ")}),m=J(()=>{const G=e.value.uptime_seconds||0;return 125.66*(1-Math.min(G/86400,1))}),v=J(()=>{const G=e.value;return[{label:"Guilds",value:G.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:G.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:G.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${G.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:G.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:G.loop_count>0?"text-green-400":"",highlight:G.loop_count>0},{label:"Agents",value:G.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:G.agent_count>0?`${G.agent_count} total`:"",subColor:"text-gray-500",highlight:(G.agent_running??0)>0},{label:"Processes",value:G.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:G.process_count>0?`${G.process_count} total`:"",subColor:"text-gray-500",highlight:(G.process_running??0)>0},{label:"Schedules",value:G.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(G.schedule_failing>0?`${G.schedule_failing} failing`:"")+(G.schedule_failing>0&&G.schedule_paused>0?", ":"")+(G.schedule_paused>0?`${G.schedule_paused} paused`:"")||void 0,subColor:G.schedule_failing>0?"text-red-400":"text-yellow-400",color:G.schedule_failing>0?"text-red-400":"",highlight:G.schedule_failing>0},{label:"Users",value:G.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),T=J(()=>{const G=e.value,q=[];return q.push({label:"Bot",status:G.status==="online"?"ok":"warn",detail:G.status==="online"?"Online":"Starting"}),(G.schedule_failing||0)>0?q.push({label:"Schedules",status:"error",detail:`${G.schedule_failing} failing`}):(G.schedule_count||0)>0&&q.push({label:"Schedules",status:"ok",detail:`${G.schedule_count} configured`}),(G.loop_count||0)>0&&q.push({label:"Loops",status:"ok",detail:`${G.loop_count} active`}),(G.agent_running||0)>0&&q.push({label:"Agents",status:"ok",detail:`${G.agent_running} running`}),(G.process_running||0)>0&&q.push({label:"Processes",status:"ok",detail:`${G.process_running} running`}),q});async function I(){try{e.value=await W.get("/api/status"),s.value=null}catch(G){s.value=G.message}finally{t.value=!1}}let y=0,g=0,b=0,S=0;function w(G,q){const Q=new Set;return[...q,...G].filter(ie=>{const X=ie._hmac||JSON.stringify([ie.timestamp,ie.tool_name,ie.user_id,ie.result_summary,ie.error]);return Q.has(X)?!1:(Q.add(X),!0)})}async function E(){const G=++y,q=b;a.value=!0;try{const Q=await W.get("/api/audit?limit=10");if(G!==y)return;const ie=q===b?[]:n.value.filter(X=>(X._liveEpoch||0)>q);n.value=w(Q,ie).slice(0,10),c.value=ie.length}catch{}G===y&&(a.value=!1)}async function C(){const G=++g,q=S;l.value=!0;try{const Q=await W.get("/api/audit?error_only=1&limit=5");if(G!==g)return;const ie=q===S?[]:i.value.filter(X=>(X._liveErrorEpoch||0)>q);i.value=w(Q,ie).slice(0,5),r.value=!1}catch{if(G!==g)return;r.value=q===S||i.value.length===0}G===g&&(l.value=!1)}async function x(){try{const G=await W.get("/api/knowledge");d.value=(Array.isArray(G)?G:[]).reduce((q,Q)=>q+(Q.chunks||0),0)}catch{d.value=null}}async function D(){try{const G=await W.get("/api/agents");o.value=G.filter(q=>q.status==="running")}catch{}}async function A(){u.value={...u.value,reload:!0};try{await W.post("/api/reload"),Re.success("Config reloaded")}catch(G){Re.error(G.message)}u.value={...u.value,reload:!1}}async function R(){if(!await Xt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const q=e.value.session_count;e.value={...e.value,session_count:0};try{const Q=await W.post("/api/sessions/clear-all");Re.success(`Cleared ${Q.count} session${Q.count!==1?"s":""}`),await I()}catch(Q){e.value={...e.value,session_count:q},Re.error(Q.message)}u.value={...u.value,clearSessions:!1}}async function z(){if(!await Xt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const q=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Q=await W.post("/api/loops/stop-all");Re.success(Q.result),await I()}catch(Q){e.value={...e.value,loop_count:q},Re.error(Q.message)}u.value={...u.value,stopLoops:!1}}function V(){t.value=!0,s.value=null,I(),E(),C(),D()}let le=null,M=null,N=null;function O(G){if(G.payload&&G.payload.tool_name){b+=1;const q={...G.payload,_isNew:!0,_key:++p,_liveEpoch:b};n.value.unshift(q),n.value.length>10&&n.value.pop(),c.value++,q.error&&(S+=1,q._liveErrorEpoch=S,r.value=!1,i.value.unshift(q),i.value.length>5&&i.value.pop()),setTimeout(()=>{q._isNew=!1},1500),clearTimeout(N),N=setTimeout(()=>{c.value=0},1e4)}}let B=null;return Ke(async()=>{await Promise.all([I(),E(),C(),D(),x()]),le=setInterval(I,15e3),M=setInterval(D,1e4),Ye.subscribe("events",O),B=Ye.onReconnected(()=>{E(),C()})}),mt(()=>{le&&clearInterval(le),M&&clearInterval(M),clearTimeout(N),Ye.unsubscribe("events",O),B&&(B(),B=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:T,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:r,agents:o,actionLoading:u,fetchActivity:E,fetchErrors:C,fetchStatus:I,onEvent:O,formatTime:cw,formatDuration:oi,retry:V,reloadConfig:A,clearSessions:R,stopAllLoops:z}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function ep(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Wk(e){if(Array.isArray(e))return e}function Zk(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function Jk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Yk(e,t){return Wk(e)||Zk(e,t)||Qk(e,t)||Jk()}function Qk(e,t){if(e){if(typeof e=="string")return ep(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?ep(e,t):void 0}}const Hm=Object.entries,tp=Object.setPrototypeOf,Xk=Object.isFrozen,eS=Object.getPrototypeOf,tS=Object.getOwnPropertyDescriptor;let ds=Object.freeze,Ms=Object.seal,$a=Object.create,zm=typeof Reflect<"u"&&Reflect,Qo=zm.apply,Xo=zm.construct;ds||(ds=function(t){return t});Ms||(Ms=function(t){return t});Qo||(Qo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Xo||(Xo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const fn=Ot(Array.prototype.forEach),sS=Ot(Array.prototype.lastIndexOf),sp=Ot(Array.prototype.pop),Na=Ot(Array.prototype.push),nS=Ot(Array.prototype.splice),as=Array.isArray,Ei=Ot(String.prototype.toLowerCase),vo=Ot(String.prototype.toString),np=Ot(String.prototype.match),Da=Ot(String.prototype.replace),ap=Ot(String.prototype.indexOf),aS=Ot(String.prototype.trim),iS=Ot(Number.prototype.toString),lS=Ot(Boolean.prototype.toString),ip=typeof BigInt>"u"?null:Ot(BigInt.prototype.toString),lp=typeof Symbol>"u"?null:Ot(Symbol.prototype.toString),xt=Ot(Object.prototype.hasOwnProperty),xi=Ot(Object.prototype.toString),Ut=Ot(RegExp.prototype.test),na=rS(TypeError);function Ot(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Qo(e,t,n)}}function rS(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Xo(e,s)}}function je(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ei;if(tp&&tp(e,null),!as(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(Xk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function oS(e){for(let t=0;t<e.length;t++)xt(e,t)||(e[t]=null);return e}function Wt(e){const t=$a(null);for(const n of Hm(e)){var s=Yk(n,2);const a=s[0],i=s[1];xt(e,a)&&(as(i)?t[a]=oS(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Wt(i):t[a]=i)}return t}function cS(e){switch(typeof e){case"string":return e;case"number":return iS(e);case"boolean":return lS(e);case"bigint":return ip?ip(e):"0";case"symbol":return lp?lp(e):"Symbol()";case"undefined":return xi(e);case"function":case"object":{if(e===null)return xi(e);const t=e,s=Js(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:xi(n)}return xi(e)}default:return xi(e)}}function Js(e,t){for(;e!==null;){const n=tS(e,t);if(n){if(n.get)return Ot(n.get);if(typeof n.value=="function")return Ot(n.value)}e=eS(e)}function s(){return null}return s}function dS(e){try{return Ut(e,""),!0}catch{return!1}}const rp=ds(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),go=ds(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),bo=ds(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),uS=ds(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),yo=ds(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),pS=ds(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),op=ds(["#text"]),cp=ds(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),xo=ds(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),dp=ds(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Il=ds(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),fS=Ms(/{{[\w\W]*|^[\w\W]*}}/g),hS=Ms(/<%[\w\W]*|^[\w\W]*%>/g),mS=Ms(/\${[\w\W]*/g),vS=Ms(/^data-[\-\w.\u00B7-\uFFFF]+$/),gS=Ms(/^aria-[\-\w]+$/),up=Ms(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),bS=Ms(/^(?:\w+script|data):/i),yS=Ms(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),xS=Ms(/^html$/i),_S=Ms(/^[a-z][.\w]*(-[.\w]+)+$/i),Ws={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},wS=function(){return typeof window>"u"?null:window},kS=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},pp=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function jm(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:wS();const t=Te=>jm(Te);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ws.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,h=Js(p,"cloneNode"),m=Js(p,"remove"),v=Js(p,"nextSibling"),T=Js(p,"childNodes"),I=Js(p,"parentNode"),y=Js(p,"shadowRoot"),g=Js(p,"attributes"),b=l&&l.prototype?Js(l.prototype,"nodeType"):null,S=l&&l.prototype?Js(l.prototype,"nodeName"):null;if(typeof i=="function"){const Te=s.createElement("template");Te.content&&Te.content.ownerDocument&&(s=Te.content.ownerDocument)}let w,E="",C,x=!1,D=0;const A=function(){if(D>0)throw na('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},R=function(L){A(),D++;try{return w.createHTML(L)}finally{D--}},z=function(L){A(),D++;try{return w.createScriptURL(L)}finally{D--}},V=function(){return x||(C=kS(u,a),x=!0),C},le=s,M=le.implementation,N=le.createNodeIterator,O=le.createDocumentFragment,B=le.getElementsByTagName,G=n.importNode;let q=pp();t.isSupported=typeof Hm=="function"&&typeof I=="function"&&M&&M.createHTMLDocument!==void 0;const Q=fS,ie=hS,X=mS,ce=vS,Pe=gS,Y=bS,be=yS,H=_S;let oe=up,ue=null;const Oe=je({},[...rp,...go,...bo,...yo,...op]);let _=null;const P=je({},[...cp,...xo,...dp,...Il]);let U=Object.seal($a(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ae=null,te=null;const ne=Object.seal($a(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let fe=!0,pe=!0,de=!1,re=!0,ke=!1,ge=!0,we=!1,Ae=!1,F=!1,me=!1,Se=!1,Le=!1,De=!0,ct=!1;const rt="user-content-";let Mt=!0,se=!1,_e={},Ie=null;const Ze=je({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let pt=null;const Ue=je({},["audio","video","img","source","image","track"]);let gt=null;const ys=je({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),kt="http://www.w3.org/1998/Math/MathML",Fs="http://www.w3.org/2000/svg",Bt="http://www.w3.org/1999/xhtml";let xs=Bt,an=!1,_s=null;const Nn=je({},[kt,Fs,Bt],vo);let ln=je({},["mi","mo","mn","ms","mtext"]),$s=je({},["annotation-xml"]);const Dn=je({},["title","style","font","a","script"]);let yt=null;const Bs=["application/xhtml+xml","text/html"],rn="text/html";let at=null,K=null;const he=s.createElement("form"),Ne=function(L){return L instanceof RegExp||L instanceof Function},Ve=function(){let L=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(K&&K===L)return;(!L||typeof L!="object")&&(L={}),L=Wt(L),yt=Bs.indexOf(L.PARSER_MEDIA_TYPE)===-1?rn:L.PARSER_MEDIA_TYPE,at=yt==="application/xhtml+xml"?vo:Ei,ue=xt(L,"ALLOWED_TAGS")&&as(L.ALLOWED_TAGS)?je({},L.ALLOWED_TAGS,at):Oe,_=xt(L,"ALLOWED_ATTR")&&as(L.ALLOWED_ATTR)?je({},L.ALLOWED_ATTR,at):P,_s=xt(L,"ALLOWED_NAMESPACES")&&as(L.ALLOWED_NAMESPACES)?je({},L.ALLOWED_NAMESPACES,vo):Nn,gt=xt(L,"ADD_URI_SAFE_ATTR")&&as(L.ADD_URI_SAFE_ATTR)?je(Wt(ys),L.ADD_URI_SAFE_ATTR,at):ys,pt=xt(L,"ADD_DATA_URI_TAGS")&&as(L.ADD_DATA_URI_TAGS)?je(Wt(Ue),L.ADD_DATA_URI_TAGS,at):Ue,Ie=xt(L,"FORBID_CONTENTS")&&as(L.FORBID_CONTENTS)?je({},L.FORBID_CONTENTS,at):Ze,ae=xt(L,"FORBID_TAGS")&&as(L.FORBID_TAGS)?je({},L.FORBID_TAGS,at):Wt({}),te=xt(L,"FORBID_ATTR")&&as(L.FORBID_ATTR)?je({},L.FORBID_ATTR,at):Wt({}),_e=xt(L,"USE_PROFILES")?L.USE_PROFILES&&typeof L.USE_PROFILES=="object"?Wt(L.USE_PROFILES):L.USE_PROFILES:!1,fe=L.ALLOW_ARIA_ATTR!==!1,pe=L.ALLOW_DATA_ATTR!==!1,de=L.ALLOW_UNKNOWN_PROTOCOLS||!1,re=L.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ke=L.SAFE_FOR_TEMPLATES||!1,ge=L.SAFE_FOR_XML!==!1,we=L.WHOLE_DOCUMENT||!1,me=L.RETURN_DOM||!1,Se=L.RETURN_DOM_FRAGMENT||!1,Le=L.RETURN_TRUSTED_TYPE||!1,F=L.FORCE_BODY||!1,De=L.SANITIZE_DOM!==!1,ct=L.SANITIZE_NAMED_PROPS||!1,Mt=L.KEEP_CONTENT!==!1,se=L.IN_PLACE||!1,oe=dS(L.ALLOWED_URI_REGEXP)?L.ALLOWED_URI_REGEXP:up,xs=typeof L.NAMESPACE=="string"?L.NAMESPACE:Bt,ln=xt(L,"MATHML_TEXT_INTEGRATION_POINTS")&&L.MATHML_TEXT_INTEGRATION_POINTS&&typeof L.MATHML_TEXT_INTEGRATION_POINTS=="object"?Wt(L.MATHML_TEXT_INTEGRATION_POINTS):je({},["mi","mo","mn","ms","mtext"]),$s=xt(L,"HTML_INTEGRATION_POINTS")&&L.HTML_INTEGRATION_POINTS&&typeof L.HTML_INTEGRATION_POINTS=="object"?Wt(L.HTML_INTEGRATION_POINTS):je({},["annotation-xml"]);const ee=xt(L,"CUSTOM_ELEMENT_HANDLING")&&L.CUSTOM_ELEMENT_HANDLING&&typeof L.CUSTOM_ELEMENT_HANDLING=="object"?Wt(L.CUSTOM_ELEMENT_HANDLING):$a(null);if(U=$a(null),xt(ee,"tagNameCheck")&&Ne(ee.tagNameCheck)&&(U.tagNameCheck=ee.tagNameCheck),xt(ee,"attributeNameCheck")&&Ne(ee.attributeNameCheck)&&(U.attributeNameCheck=ee.attributeNameCheck),xt(ee,"allowCustomizedBuiltInElements")&&typeof ee.allowCustomizedBuiltInElements=="boolean"&&(U.allowCustomizedBuiltInElements=ee.allowCustomizedBuiltInElements),ke&&(pe=!1),Se&&(me=!0),_e&&(ue=je({},op),_=$a(null),_e.html===!0&&(je(ue,rp),je(_,cp)),_e.svg===!0&&(je(ue,go),je(_,xo),je(_,Il)),_e.svgFilters===!0&&(je(ue,bo),je(_,xo),je(_,Il)),_e.mathMl===!0&&(je(ue,yo),je(_,dp),je(_,Il))),ne.tagCheck=null,ne.attributeCheck=null,xt(L,"ADD_TAGS")&&(typeof L.ADD_TAGS=="function"?ne.tagCheck=L.ADD_TAGS:as(L.ADD_TAGS)&&(ue===Oe&&(ue=Wt(ue)),je(ue,L.ADD_TAGS,at))),xt(L,"ADD_ATTR")&&(typeof L.ADD_ATTR=="function"?ne.attributeCheck=L.ADD_ATTR:as(L.ADD_ATTR)&&(_===P&&(_=Wt(_)),je(_,L.ADD_ATTR,at))),xt(L,"ADD_URI_SAFE_ATTR")&&as(L.ADD_URI_SAFE_ATTR)&&je(gt,L.ADD_URI_SAFE_ATTR,at),xt(L,"FORBID_CONTENTS")&&as(L.FORBID_CONTENTS)&&(Ie===Ze&&(Ie=Wt(Ie)),je(Ie,L.FORBID_CONTENTS,at)),xt(L,"ADD_FORBID_CONTENTS")&&as(L.ADD_FORBID_CONTENTS)&&(Ie===Ze&&(Ie=Wt(Ie)),je(Ie,L.ADD_FORBID_CONTENTS,at)),Mt&&(ue["#text"]=!0),we&&je(ue,["html","head","body"]),ue.table&&(je(ue,["tbody"]),delete ae.tbody),L.TRUSTED_TYPES_POLICY){if(typeof L.TRUSTED_TYPES_POLICY.createHTML!="function")throw na('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof L.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw na('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ve=w;w=L.TRUSTED_TYPES_POLICY;try{E=R("")}catch(Me){throw w=ve,Me}}else L.TRUSTED_TYPES_POLICY===null?(w=void 0,E=""):(w===void 0&&(w=V()),w&&typeof E=="string"&&(E=R("")));(q.uponSanitizeElement.length>0||q.uponSanitizeAttribute.length>0)&&ue===Oe&&(ue=Wt(ue)),q.uponSanitizeAttribute.length>0&&_===P&&(_=Wt(_)),ds&&ds(L),K=L},tt=je({},[...go,...bo,...uS]),Lt=je({},[...yo,...pS]),Yn=function(L){let ee=I(L);(!ee||!ee.tagName)&&(ee={namespaceURI:xs,tagName:"template"});const ve=Ei(L.tagName),Me=Ei(ee.tagName);return _s[L.namespaceURI]?L.namespaceURI===Fs?ee.namespaceURI===Bt?ve==="svg":ee.namespaceURI===kt?ve==="svg"&&(Me==="annotation-xml"||ln[Me]):!!tt[ve]:L.namespaceURI===kt?ee.namespaceURI===Bt?ve==="math":ee.namespaceURI===Fs?ve==="math"&&$s[Me]:!!Lt[ve]:L.namespaceURI===Bt?ee.namespaceURI===Fs&&!$s[Me]||ee.namespaceURI===kt&&!ln[Me]?!1:!Lt[ve]&&(Dn[ve]||!tt[ve]):!!(yt==="application/xhtml+xml"&&_s[L.namespaceURI]):!1},ss=function(L){Na(t.removed,{element:L});try{I(L).removeChild(L)}catch{if(m(L),!I(L))throw na("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Ta=function(L){const ee=T?T(L):L.childNodes;if(ee){const Me=[];fn(ee,$e=>{Na(Me,$e)}),fn(Me,$e=>{try{m($e)}catch{}})}const ve=g?g(L):null;if(ve)for(let Me=ve.length-1;Me>=0;--Me){const $e=ve[Me],He=$e&&$e.name;if(typeof He=="string")try{L.removeAttribute(He)}catch{}}},Us=function(L,ee){try{Na(t.removed,{attribute:ee.getAttributeNode(L),from:ee})}catch{Na(t.removed,{attribute:null,from:ee})}if(ee.removeAttribute(L),L==="is")if(me||Se)try{ss(ee)}catch{}else try{ee.setAttribute(L,"")}catch{}},pi=function(L){const ee=g?g(L):L.attributes;if(ee)for(let ve=ee.length-1;ve>=0;--ve){const Me=ee[ve],$e=Me&&Me.name;if(!(typeof $e!="string"||_[at($e)]))try{L.removeAttribute($e)}catch{}}},Ca=function(L){const ee=[L];for(;ee.length>0;){const ve=ee.pop();(b?b(ve):ve.nodeType)===Ws.element&&pi(ve);const $e=T?T(ve):ve.childNodes;if($e)for(let He=$e.length-1;He>=0;--He)ee.push($e[He])}},Qn=function(L){let ee=null,ve=null;if(F)L="<remove></remove>"+L;else{const He=np(L,/^[\r\n\t ]+/);ve=He&&He[0]}yt==="application/xhtml+xml"&&xs===Bt&&(L='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+L+"</body></html>");const Me=w?R(L):L;if(xs===Bt)try{ee=new d().parseFromString(Me,yt)}catch{}if(!ee||!ee.documentElement){ee=M.createDocument(xs,"template",null);try{ee.documentElement.innerHTML=an?E:Me}catch{}}const $e=ee.body||ee.documentElement;return L&&ve&&$e.insertBefore(s.createTextNode(ve),$e.childNodes[0]||null),xs===Bt?B.call(ee,we?"html":"body")[0]:we?ee.documentElement:$e},Ea=function(L){return N.call(L.ownerDocument||L,L,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Xn=function(L){var ee,ve;L.normalize();const Me=N.call(L.ownerDocument||L,L,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let $e=Me.nextNode();for(;$e;){let bt=$e.data;fn([Q,ie,X],k=>{bt=Da(bt,k," ")}),$e.data=bt,$e=Me.nextNode()}const He=(ee=(ve=L.querySelectorAll)===null||ve===void 0?void 0:ve.call(L,"template"))!==null&&ee!==void 0?ee:[];fn(Array.from(He),bt=>{ws(bt.content)&&Xn(bt.content)})},Pn=function(L){const ee=S?S(L):null;return typeof ee!="string"||at(ee)!=="form"?!1:typeof L.nodeName!="string"||typeof L.textContent!="string"||typeof L.removeChild!="function"||L.attributes!==g(L)||typeof L.removeAttribute!="function"||typeof L.setAttribute!="function"||typeof L.namespaceURI!="string"||typeof L.insertBefore!="function"||typeof L.hasChildNodes!="function"||L.nodeType!==b(L)||L.childNodes!==T(L)},ws=function(L){if(!b||typeof L!="object"||L===null)return!1;try{return b(L)===Ws.documentFragment}catch{return!1}},on=function(L){if(!b||typeof L!="object"||L===null)return!1;try{return typeof b(L)=="number"}catch{return!1}};function qt(Te,L,ee){fn(Te,ve=>{ve.call(t,L,ee,K)})}const Aa=function(L){let ee=null;if(qt(q.beforeSanitizeElements,L,null),Pn(L))return ss(L),!0;const ve=at(S?S(L):L.nodeName);if(qt(q.uponSanitizeElement,L,{tagName:ve,allowedTags:ue}),ge&&L.hasChildNodes()&&!on(L.firstElementChild)&&Ut(/<[/\w!]/g,L.innerHTML)&&Ut(/<[/\w!]/g,L.textContent)||ge&&L.namespaceURI===Bt&&ve==="style"&&on(L.firstElementChild)||L.nodeType===Ws.progressingInstruction||ge&&L.nodeType===Ws.comment&&Ut(/<[/\w]/g,L.data))return ss(L),!0;if(ae[ve]||!(ne.tagCheck instanceof Function&&ne.tagCheck(ve))&&!ue[ve]){if(!ae[ve]&&Ee(ve)&&(U.tagNameCheck instanceof RegExp&&Ut(U.tagNameCheck,ve)||U.tagNameCheck instanceof Function&&U.tagNameCheck(ve)))return!1;if(Mt&&!Ie[ve]){const $e=I(L),He=T(L);if(He&&$e){const bt=He.length;for(let k=bt-1;k>=0;--k){const $=se?He[k]:h(He[k],!0);$e.insertBefore($,v(L))}}}return ss(L),!0}return(b?b(L):L.nodeType)===Ws.element&&!Yn(L)||(ve==="noscript"||ve==="noembed"||ve==="noframes")&&Ut(/<\/no(script|embed|frames)/i,L.innerHTML)?(ss(L),!0):(ke&&L.nodeType===Ws.text&&(ee=L.textContent,fn([Q,ie,X],$e=>{ee=Da(ee,$e," ")}),L.textContent!==ee&&(Na(t.removed,{element:L.cloneNode()}),L.textContent=ee)),qt(q.afterSanitizeElements,L,null),!1)},j=function(L,ee,ve){if(te[ee]||De&&(ee==="id"||ee==="name")&&(ve in s||ve in he))return!1;const Me=_[ee]||ne.attributeCheck instanceof Function&&ne.attributeCheck(ee,L);if(!(pe&&!te[ee]&&Ut(ce,ee))){if(!(fe&&Ut(Pe,ee))){if(!Me||te[ee]){if(!(Ee(L)&&(U.tagNameCheck instanceof RegExp&&Ut(U.tagNameCheck,L)||U.tagNameCheck instanceof Function&&U.tagNameCheck(L))&&(U.attributeNameCheck instanceof RegExp&&Ut(U.attributeNameCheck,ee)||U.attributeNameCheck instanceof Function&&U.attributeNameCheck(ee,L))||ee==="is"&&U.allowCustomizedBuiltInElements&&(U.tagNameCheck instanceof RegExp&&Ut(U.tagNameCheck,ve)||U.tagNameCheck instanceof Function&&U.tagNameCheck(ve))))return!1}else if(!gt[ee]){if(!Ut(oe,Da(ve,be,""))){if(!((ee==="src"||ee==="xlink:href"||ee==="href")&&L!=="script"&&ap(ve,"data:")===0&&pt[L])){if(!(de&&!Ut(Y,Da(ve,be,"")))){if(ve)return!1}}}}}}return!0},ye=je({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ee=function(L){return!ye[Ei(L)]&&Ut(H,L)},Hs=function(L){qt(q.beforeSanitizeAttributes,L,null);const ee=L.attributes;if(!ee||Pn(L))return;const ve={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:_,forceKeepAttr:void 0};let Me=ee.length;for(;Me--;){const $e=ee[Me],He=$e.name,bt=$e.namespaceURI,k=$e.value,$=at(He),Z=k;let xe=He==="value"?Z:aS(Z);if(ve.attrName=$,ve.attrValue=xe,ve.keepAttr=!0,ve.forceKeepAttr=void 0,qt(q.uponSanitizeAttribute,L,ve),xe=ve.attrValue,ct&&($==="id"||$==="name")&&ap(xe,rt)!==0&&(Us(He,L),xe=rt+xe),ge&&Ut(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,xe)){Us(He,L);continue}if($==="attributename"&&np(xe,"href")){Us(He,L);continue}if(ve.forceKeepAttr)continue;if(!ve.keepAttr){Us(He,L);continue}if(!re&&Ut(/\/>/i,xe)){Us(He,L);continue}ke&&fn([Q,ie,X],Gt=>{xe=Da(xe,Gt," ")});const Qe=at(L.nodeName);if(!j(Qe,$,xe)){Us(He,L);continue}if(w&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!bt)switch(u.getAttributeType(Qe,$)){case"TrustedHTML":{xe=R(xe);break}case"TrustedScriptURL":{xe=z(xe);break}}if(xe!==Z)try{bt?L.setAttributeNS(bt,He,xe):L.setAttribute(He,xe),Pn(L)?ss(L):sp(t.removed)}catch{Us(He,L)}}qt(q.afterSanitizeAttributes,L,null)},Ks=function(L){let ee=null;const ve=Ea(L);for(qt(q.beforeSanitizeShadowDOM,L,null);ee=ve.nextNode();)if(qt(q.uponSanitizeShadowNode,ee,null),Aa(ee),Hs(ee),ws(ee.content)&&Ks(ee.content),(b?b(ee):ee.nodeType)===Ws.element){const $e=y?y(ee):ee.shadowRoot;ws($e)&&(Mn($e),Ks($e))}qt(q.afterSanitizeShadowDOM,L,null)},Mn=function(L){const ee=[{node:L,shadow:null}];for(;ee.length>0;){const ve=ee.pop();if(ve.shadow){Ks(ve.shadow);continue}const Me=ve.node,He=(b?b(Me):Me.nodeType)===Ws.element,bt=T?T(Me):Me.childNodes;if(bt)for(let k=bt.length-1;k>=0;--k)ee.push({node:bt[k],shadow:null});if(He){const k=S?S(Me):null;if(typeof k=="string"&&at(k)==="template"){const $=Me.content;ws($)&&ee.push({node:$,shadow:null})}}if(He){const k=y?y(Me):Me.shadowRoot;ws(k)&&ee.push({node:null,shadow:k},{node:k,shadow:null})}}};return t.sanitize=function(Te){let L=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ee=null,ve=null,Me=null,$e=null;if(an=!Te,an&&(Te="<!-->"),typeof Te!="string"&&!on(Te)&&(Te=cS(Te),typeof Te!="string"))throw na("dirty is not a string, aborting");if(!t.isSupported)return Te;Ae||Ve(L),t.removed=[];const He=se&&typeof Te!="string"&&on(Te);if(He){const $=S?S(Te):Te.nodeName;if(typeof $=="string"){const Z=at($);if(!ue[Z]||ae[Z])throw na("root node is forbidden and cannot be sanitized in-place")}if(Pn(Te))throw na("root node is clobbered and cannot be sanitized in-place");try{Mn(Te)}catch(Z){throw Ta(Te),Z}}else if(on(Te))ee=Qn("<!---->"),ve=ee.ownerDocument.importNode(Te,!0),ve.nodeType===Ws.element&&ve.nodeName==="BODY"||ve.nodeName==="HTML"?ee=ve:ee.appendChild(ve),Mn(ve);else{if(!me&&!ke&&!we&&Te.indexOf("<")===-1)return w&&Le?R(Te):Te;if(ee=Qn(Te),!ee)return me?null:Le?E:""}ee&&F&&ss(ee.firstChild);const bt=Ea(He?Te:ee);try{for(;Me=bt.nextNode();)Aa(Me),Hs(Me),ws(Me.content)&&Ks(Me.content)}catch($){throw He&&Ta(Te),$}if(He)return fn(t.removed,$=>{$.element&&Ca($.element)}),ke&&Xn(Te),Te;if(me){if(ke&&Xn(ee),Se)for($e=O.call(ee.ownerDocument);ee.firstChild;)$e.appendChild(ee.firstChild);else $e=ee;return(_.shadowroot||_.shadowrootmode)&&($e=G.call(n,$e,!0)),$e}let k=we?ee.outerHTML:ee.innerHTML;return we&&ue["!doctype"]&&ee.ownerDocument&&ee.ownerDocument.doctype&&ee.ownerDocument.doctype.name&&Ut(xS,ee.ownerDocument.doctype.name)&&(k="<!DOCTYPE "+ee.ownerDocument.doctype.name+`>
`+k),ke&&fn([Q,ie,X],$=>{k=Da(k,$," ")}),w&&Le?R(k):k},t.setConfig=function(){let Te=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ve(Te),Ae=!0},t.clearConfig=function(){K=null,Ae=!1,w=C,E=""},t.isValidAttribute=function(Te,L,ee){K||Ve({});const ve=at(Te),Me=at(L);return j(ve,Me,ee)},t.addHook=function(Te,L){typeof L=="function"&&Na(q[Te],L)},t.removeHook=function(Te,L){if(L!==void 0){const ee=sS(q[Te],L);return ee===-1?void 0:nS(q[Te],ee,1)[0]}return sp(q[Te])},t.removeHooks=function(Te){q[Te]=[]},t.removeAllHooks=function(){q=pp()},t}var fp=jm();function ad(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Sa=ad();function Vm(e){Sa=e}var Fi={exec:()=>null};function lt(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(rs.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var rs={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},SS=/^(?:[ \t]*(?:\n|$))+/,TS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,CS=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,fl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,ES=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,id=/(?:[*+-]|\d{1,9}[.)])/,qm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Gm=lt(qm).replace(/bull/g,id).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),AS=lt(qm).replace(/bull/g,id).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),ld=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,RS=/^[^\n]+/,rd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,IS=lt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",rd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),OS=lt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,id).getRegex(),jr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",od=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,LS=lt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",od).replace("tag",jr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Km=lt(ld).replace("hr",fl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",jr).getRegex(),NS=lt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Km).getRegex(),cd={blockquote:NS,code:TS,def:IS,fences:CS,heading:ES,hr:fl,html:LS,lheading:Gm,list:OS,newline:SS,paragraph:Km,table:Fi,text:RS},hp=lt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",fl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",jr).getRegex(),DS={...cd,lheading:AS,table:hp,paragraph:lt(ld).replace("hr",fl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",hp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",jr).getRegex()},PS={...cd,html:lt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",od).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Fi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:lt(ld).replace("hr",fl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Gm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},MS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,FS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Wm=/^( {2,}|\\)\n(?!\s*$)/,$S=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Vr=/[\p{P}\p{S}]/u,dd=/[\s\p{P}\p{S}]/u,Zm=/[^\s\p{P}\p{S}]/u,BS=lt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,dd).getRegex(),Jm=/(?!~)[\p{P}\p{S}]/u,US=/(?!~)[\s\p{P}\p{S}]/u,HS=/(?:[^\s\p{P}\p{S}]|~)/u,zS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Ym=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,jS=lt(Ym,"u").replace(/punct/g,Vr).getRegex(),VS=lt(Ym,"u").replace(/punct/g,Jm).getRegex(),Qm="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",qS=lt(Qm,"gu").replace(/notPunctSpace/g,Zm).replace(/punctSpace/g,dd).replace(/punct/g,Vr).getRegex(),GS=lt(Qm,"gu").replace(/notPunctSpace/g,HS).replace(/punctSpace/g,US).replace(/punct/g,Jm).getRegex(),KS=lt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Zm).replace(/punctSpace/g,dd).replace(/punct/g,Vr).getRegex(),WS=lt(/\\(punct)/,"gu").replace(/punct/g,Vr).getRegex(),ZS=lt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),JS=lt(od).replace("(?:-->|$)","-->").getRegex(),YS=lt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",JS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),pr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,QS=lt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",pr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Xm=lt(/^!?\[(label)\]\[(ref)\]/).replace("label",pr).replace("ref",rd).getRegex(),ev=lt(/^!?\[(ref)\](?:\[\])?/).replace("ref",rd).getRegex(),XS=lt("reflink|nolink(?!\\()","g").replace("reflink",Xm).replace("nolink",ev).getRegex(),ud={_backpedal:Fi,anyPunctuation:WS,autolink:ZS,blockSkip:zS,br:Wm,code:FS,del:Fi,emStrongLDelim:jS,emStrongRDelimAst:qS,emStrongRDelimUnd:KS,escape:MS,link:QS,nolink:ev,punctuation:BS,reflink:Xm,reflinkSearch:XS,tag:YS,text:$S,url:Fi},e1={...ud,link:lt(/^!?\[(label)\]\((.*?)\)/).replace("label",pr).getRegex(),reflink:lt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",pr).getRegex()},ec={...ud,emStrongRDelimAst:GS,emStrongLDelim:VS,url:lt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},t1={...ec,br:lt(Wm).replace("{2,}","*").getRegex(),text:lt(ec.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Ol={normal:cd,gfm:DS,pedantic:PS},_i={normal:ud,gfm:ec,breaks:t1,pedantic:e1},s1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},mp=e=>s1[e];function Ys(e,t){if(t){if(rs.escapeTest.test(e))return e.replace(rs.escapeReplace,mp)}else if(rs.escapeTestNoEncode.test(e))return e.replace(rs.escapeReplaceNoEncode,mp);return e}function vp(e){try{e=encodeURI(e).replace(rs.percentDecode,"%")}catch{return null}return e}function gp(e,t){var i;const s=e.replace(rs.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(rs.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(rs.slashPipe,"|");return n}function wi(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function n1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function bp(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function a1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var fr=class{constructor(e){dt(this,"options");dt(this,"rules");dt(this,"lexer");this.options=e||Sa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:wi(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=a1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=wi(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:wi(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,I=>" ".repeat(3*I.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const I=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),S=this.rules.other.htmlBeginRegex(m);for(;e;){const w=e.split(`
`,1)[0];let E;if(p=w,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),E=p):E=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||S.test(p)||I.test(p)||y.test(p))break;if(E.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+E.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=w+`
`,e=e.substring(w.length+1),u=E.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,T;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(T=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:T,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=gp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(gp(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=wi(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=n1(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),bp(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return bp(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},_n=class tc{constructor(t){dt(this,"tokens");dt(this,"options");dt(this,"state");dt(this,"tokenizer");dt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Sa,this.options.tokenizer=this.options.tokenizer||new fr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:rs,block:Ol.normal,inline:_i.normal};this.options.pedantic?(s.block=Ol.pedantic,s.inline=_i.pedantic):this.options.gfm&&(s.block=Ol.gfm,this.options.breaks?s.inline=_i.breaks:s.inline=_i.gfm),this.tokenizer.rules=s}static get rules(){return{block:Ol,inline:_i}}static lex(t,s){return new tc(s).lex(t)}static lexInline(t,s){return new tc(s).inlineTokens(t)}lex(t){t=t.replace(rs.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(rs.tabCharGlobal,"    ").replace(rs.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},hr=class{constructor(e){dt(this,"options");dt(this,"parser");this.options=e||Sa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(rs.notSpaceStart))==null?void 0:i[0],a=e.replace(rs.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Ys(n)+'">'+(s?a:Ys(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Ys(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+Ys(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Ys(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=vp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Ys(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=vp(e);if(a===null)return Ys(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Ys(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Ys(e.text)}},pd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},wn=class sc{constructor(t){dt(this,"options");dt(this,"renderer");dt(this,"textRenderer");this.options=t||Sa,this.options.renderer=this.options.renderer||new hr,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new pd}static parse(t,s){return new sc(s).parse(t)}static parseInline(t,s){return new sc(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},_o,$l=(_o=class{constructor(e){dt(this,"options");dt(this,"block");this.options=e||Sa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?_n.lex:_n.lexInline}provideParser(){return this.block?wn.parse:wn.parseInline}},dt(_o,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),_o),i1=class{constructor(...e){dt(this,"defaults",ad());dt(this,"options",this.setOptions);dt(this,"parse",this.parseMarkdown(!0));dt(this,"parseInline",this.parseMarkdown(!1));dt(this,"Parser",wn);dt(this,"Renderer",hr);dt(this,"TextRenderer",pd);dt(this,"Lexer",_n);dt(this,"Tokenizer",fr);dt(this,"Hooks",$l);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new hr(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new fr(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new $l;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];$l.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return _n.lex(e,t??this.defaults)}parser(e,t){return wn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?_n.lex:_n.lexInline,o=i.hooks?i.hooks.provideParser():e?wn.parse:wn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Ys(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ba=new i1;function nt(e,t){return ba.parse(e,t)}nt.options=nt.setOptions=function(e){return ba.setOptions(e),nt.defaults=ba.defaults,Vm(nt.defaults),nt};nt.getDefaults=ad;nt.defaults=Sa;nt.use=function(...e){return ba.use(...e),nt.defaults=ba.defaults,Vm(nt.defaults),nt};nt.walkTokens=function(e,t){return ba.walkTokens(e,t)};nt.parseInline=ba.parseInline;nt.Parser=wn;nt.parser=wn.parse;nt.Renderer=hr;nt.TextRenderer=pd;nt.Lexer=_n;nt.lexer=_n.lex;nt.Tokenizer=fr;nt.Hooks=$l;nt.parse=nt;nt.options;nt.setOptions;nt.use;nt.walkTokens;nt.parseInline;wn.parse;_n.lex;const l1={breaks:!0,gfm:!0};function yp(e){if(!e)return"";try{if(typeof nt<"u"&&nt.parse){const t=nt.parse(e,l1);return typeof fp<"u"?fp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function r1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const o1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function c1(e){return o1[e]||"wrench"}const d1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function xp(e){if(!e)return[];const t=e.match(d1);return t?[...new Set(t)]:[]}const u1={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),n=f(""),a=f(null),i=f(null),l=f(0),r=f("");let o=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=J(()=>t.value.trim().length>0&&!s.value),p=f(Ye.state||"disconnected");let h=null;const m=J(()=>{const M=p.value;return M==="connected"?"Connected":M==="reconnecting"?"Reconnecting…":M==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],T=J(()=>{const M=Math.floor(l.value/4)%v.length,N=l.value;return N>3?`${v[M]} (${N}s)`:v[0]});function I(){At(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function y(){if(!i.value)return;const M=i.value;M.style.height="auto",M.style.height=Math.min(M.scrollHeight,120)+"px"}function g(M,N,O={}){const B={id:++c,role:M,content:N,timestamp:Date.now(),html:M==="bot"?yp(N):"",tools_used:O.tools_used||[],is_error:O.is_error||!1,images:M==="bot"?xp(N):[],files:O.files||[],_showTools:!1};return e.value.push(B),I(),M==="bot"&&At(()=>b()),B}function b(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(N=>{N.setAttribute("data-copy","true"),N.style.position="relative";const O=document.createElement("button");O.className="chat-code-copy",O.textContent="Copy",O.addEventListener("click",()=>{const B=N.querySelector("code"),G=B?B.textContent:N.textContent;navigator.clipboard.writeText(G).then(()=>{O.textContent="Copied!",setTimeout(()=>{O.textContent="Copy"},1500)}).catch(()=>{})}),N.appendChild(O)})}function S(M){if(M===0)return!0;const N=e.value[M-1],O=e.value[M],B=new Date(N.timestamp).toDateString(),G=new Date(O.timestamp).toDateString();return B!==G}function w(M){const N=new Date(M),O=new Date;if(N.toDateString()===O.toDateString())return"Today";const B=new Date(O);return B.setDate(B.getDate()-1),N.toDateString()===B.toDateString()?"Yesterday":N.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function E(M){t.value=M,At(()=>V())}function C(M){window.open(M,"_blank","noopener")}function x(M){M.target.style.display="none"}function D(){l.value=0,o=setInterval(()=>{l.value++},1e3)}function A(){o&&(clearInterval(o),o=null),l.value=0}function R(M){s.value&&(s.value=!1,A(),M.type==="chat_response"?g("bot",M.content,{tools_used:M.tools_used||[],is_error:M.is_error||!1,files:M.files||[]}):M.type==="chat_error"&&g("bot",M.error||"Unknown error",{is_error:!0}),At(()=>{var N;return(N=i.value)==null?void 0:N.focus()}))}async function z(M){try{const N=await W.post("/api/chat",{content:M,channel_id:r.value});g("bot",N.response,{tools_used:N.tools_used||[],is_error:N.is_error||!1,files:N.files||[]})}catch(N){g("bot",N.message||"Failed to send message",{is_error:!0})}}async function V(){const M=t.value.trim();if(!M||s.value)return;g("user",M),t.value="",s.value=!0,D(),i.value&&(i.value.style.height="auto"),Ye.connected&&Ye.sendChat(M,{channelId:r.value})||(await z(M),s.value=!1,A()),At(()=>{var O;return(O=i.value)==null?void 0:O.focus()})}async function le(){n.value="";try{if(!r.value){const N=await W.get("/api/auth/session");r.value=N.channel_id||N.user_id||"web-user"}const M=await W.get("/api/sessions/"+encodeURIComponent(r.value));if(M&&M.messages&&M.messages.length>0){for(const N of M.messages){const O=N.role==="user"?"user":"bot";let B=N.content||"";if(O==="user"){const q=B.match(/^\[.*?\]:\s*/);q&&(B=B.slice(q[0].length))}if(!B.trim())continue;const G={id:++c,role:O,content:B,timestamp:N.timestamp?N.timestamp*1e3:Date.now(),html:O==="bot"?yp(B):"",tools_used:[],is_error:!1,images:O==="bot"?xp(B):[],files:[],_showTools:!1};e.value.push(G)}At(()=>{I(),b()})}}catch(M){M&&M.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Re.error(n.value))}}return Ke(()=>{Ye.subscribe("chat",R),p.value=Ye.state||"disconnected",h=Ye.onState(M=>{p.value=M}),le(),At(()=>{var M;return(M=i.value)==null?void 0:M.focus()})}),mt(()=>{Ye.unsubscribe("chat",R),h&&(h(),h=null),A()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:T,suggestions:d,send:V,autoResize:y,formatTime:r1,formatDate:w,showDateSeparator:S,useSuggestion:E,openImage:C,onImageError:x,getToolIcon:c1,loadHistory:le}}},p1={setup(){const e=f("odin"),t=f(""),s=f(""),n=f(""),a=f({}),i=f([]),l=f([]),r=f(!1),o=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=J(()=>e.value==="custom"),v=J(()=>[...i.value,...l.value]),T=J(()=>l.value.includes(e.value)),I=J(()=>{var C;return m.value?t.value||"Odin":((C=a.value[e.value])==null?void 0:C.name)||e.value}),y=J(()=>{var C;return m.value?s.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.identity)||""}),g=J(()=>{var C;return m.value?n.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.voice)||""});async function b(){d.value=!0;try{const C=await W.get("/api/personality");e.value=C.preset||"odin",t.value=C.custom_name||"",s.value=C.custom_identity||"",n.value=C.custom_voice||"",a.value=C.presets||{},i.value=C.builtin_presets||[],l.value=C.user_presets||[]}catch(C){c.value=C.message}finally{d.value=!1}}async function S(){r.value=!0,c.value=null,o.value=!1;try{await W.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(C){c.value=C.message}finally{r.value=!1}}async function w(){const C=u.value.trim();if(C){h.value=!0,c.value=null;try{await W.post("/api/personality/presets",{name:C,display_name:I.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=C.toLowerCase().replace(/ /g,"_")}catch(x){c.value=x.message}finally{h.value=!1}}}async function E(){if(await Xt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await W.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(x){c.value=x.message}}}return Ke(b),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:T,previewName:I,previewIdentity:y,previewVoice:g,saving:r,saved:o,error:c,loading:d,save:S,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:w,deletePreset:E,builtinPresets:i,userPresets:l}},template:`
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
  `},St=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),tv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Kk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:u1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:ww,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Ow,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Qw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:p1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Uk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:St("/operations","live")},{path:"/agents",redirect:St("/operations","agents")},{path:"/loops",redirect:St("/operations","loops")},{path:"/processes",redirect:St("/operations","processes")},{path:"/schedules",redirect:St("/operations","schedules")},{path:"/audit",redirect:St("/history","audit")},{path:"/sessions",redirect:St("/history","sessions")},{path:"/traces",redirect:St("/history","traces")},{path:"/usage",redirect:St("/history","usage")},{path:"/tools",redirect:St("/capabilities","tools")},{path:"/skills",redirect:St("/capabilities","skills")},{path:"/mcp",redirect:St("/capabilities","mcp-servers")},{path:"/knowledge",redirect:St("/capabilities","knowledge")},{path:"/memory",redirect:St("/capabilities","memory")},{path:"/learned",redirect:St("/capabilities","learned")},{path:"/health",redirect:St("/system","health")},{path:"/resources",redirect:St("/system","resources")},{path:"/logs",redirect:St("/system","logs")},{path:"/config",redirect:St("/system","config")},{path:"/host-access",redirect:St("/system","host-access")},{path:"/internals",redirect:St("/system","internals")}],$i=lw({history:$_(),routes:tv});$i.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const f1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),n=f(!1),a=f(!1);async function i(){n.value=!0,s.value=null;try{W.setPersist(a.value),await W.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},h1={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),n=f(!1),a=f(null),i=f(null),l=f(!1);let r=null,o=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),T=tv.filter(B=>B.meta),I=J(()=>["Workspace","Operate","Observe","Manage"].map(B=>({name:B,routes:T.filter(G=>G.meta.section===B)})).filter(B=>B.routes.length)),y=J(()=>{var B;return((B=$i.currentRoute.value.meta)==null?void 0:B.label)||"Odin"}),g=J(()=>{var B;return((B=$i.currentRoute.value.meta)==null?void 0:B.section)||"Management"}),b=J(()=>{var B;return((B=$i.currentRoute.value.meta)==null?void 0:B.description)||"Management console"});function S(){Ye.disconnect(),V&&(clearInterval(V),V=null)}W.onSessionExpired=()=>{t.value=!0,S(),W.setToken(""),e.value="login"};function w(B){var G;if((B.ctrlKey||B.metaKey)&&B.key.toLowerCase()==="k"){e.value==="ready"&&(B.preventDefault(),Qu());return}if(n.value&&B.key==="Tab"){const q=[...((G=a.value)==null?void 0:G.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(q.length){const Q=q[0],ie=q[q.length-1];if(B.shiftKey&&(document.activeElement===Q||!a.value.contains(document.activeElement))){B.preventDefault(),ie.focus();return}if(!B.shiftKey&&(document.activeElement===ie||!a.value.contains(document.activeElement))){B.preventDefault(),Q.focus();return}}}if(B.key==="Escape"&&n.value){n.value=!1,B.preventDefault();return}if(B.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(B.target.tagName)){B.preventDefault();const q=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');q&&q.focus()}}function E(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Ke(async()=>{document.addEventListener("keydown",w),r=window.matchMedia("(max-width: 900px)"),E(),r.addEventListener("change",E);const B=await W.check();B.ok?(e.value="ready",N()):B.needsAuth?e.value="login":(e.value="ready",N())});function C(){t.value=!1,e.value="ready",N()}async function x(){S(),e.value="login",await W.logout()}function D(){s.value=!s.value}function A(){n.value=!n.value}os(n,async B=>{var G,q;if(B)o=document.activeElement,await At(),(q=(G=a.value)==null?void 0:G.querySelector(".nav-item"))==null||q.focus();else if(o!=null&&o.isConnected){const Q=o;o=null,requestAnimationFrame(()=>Q.focus())}});const R=J(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function z(B,G="info",q=3e3){p.value={text:B,level:G},clearTimeout(h),h=setTimeout(()=>{p.value=null},q)}let V=null,le=!1,M=[];function N(){for(const B of M)B();M=[Ye.onStatus(B=>{c.value=B}),Ye.onLatencyChange(B=>{u.value=B}),Ye.onState((B,G)=>{d.value=B,B==="connected"?(le&&z("Connection restored","success"),le=!0):B==="reconnecting"&&G.attempt===1&&z("Connection lost — reconnecting…","warn")})],Ye.connect(),O(),V&&clearInterval(V),V=setInterval(O,15e3)}async function O(){try{const B=await W.get("/api/status");m.value=B.status==="online"?"online":"starting";const G=B.uptime_seconds||0,q=Math.floor(G/3600),Q=Math.floor(G%3600/60);v.value=`${q}h ${Q}m uptime`}catch{m.value="offline",v.value=""}}return mt(()=>{V&&clearInterval(V);for(const B of M)B();M=[],Ye.disconnect(),document.removeEventListener("keydown",w),r==null||r.removeEventListener("change",E)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:R,wsToast:p,botStatus:m,botUptime:v,navRoutes:T,navGroups:I,currentPage:y,currentSection:g,currentDescription:b,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:C,logout:x,toggleSidebar:D,toggleMobileNavigation:A,openPalette:Qu}}},Jn=sr(h1);Jn.component("odin-icon",Vk);Jn.component("login-screen",f1);Jn.component("toast-container",Q0);Jn.component("confirm-host",X0);Jn.component("command-palette",jk);Jn.directive("modal-focus",Gk);Jn.use($i);Jn.mount("#app");
