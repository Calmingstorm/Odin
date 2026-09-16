var Bv=Object.defineProperty;var Uv=(e,t,s)=>t in e?Bv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var gt=(e,t,s)=>Uv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Hv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new Rl("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new br(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Rl("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new br((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}async consentListener(t){const s=await fetch("/api/setup/listener",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({expose_beyond_loopback:!0})}),a=await s.json().catch(()=>null);if(!s.ok)throw new br((a==null?void 0:a.error)||"Listener reauthentication failed",s.status,a);return a}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new Rl((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Rl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Rl extends Error{constructor(t){super(t),this.name="AuthError"}}class br extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class zv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const U=new Hv,st=new zv(U);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Rs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ye={},Jn=[],Qt=()=>{},Gn=()=>!1,Cn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Mo=e=>e.startsWith("onUpdate:"),Ze=Object.assign,Dc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},jv=Object.prototype.hasOwnProperty,rt=(e,t)=>jv.call(e,t),Re=Array.isArray,Zn=e=>gi(e)==="[object Map]",En=e=>gi(e)==="[object Set]",qd=e=>gi(e)==="[object Date]",Vv=e=>gi(e)==="[object RegExp]",Me=e=>typeof e=="function",Ue=e=>typeof e=="string",ls=e=>typeof e=="symbol",lt=e=>e!==null&&typeof e=="object",Pc=e=>(lt(e)||Me(e))&&Me(e.then)&&Me(e.catch),tf=Object.prototype.toString,gi=e=>tf.call(e),qv=e=>gi(e).slice(8,-1),Fo=e=>gi(e)==="[object Object]",$o=e=>Ue(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Ia=Rs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Gv=Rs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Bo=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Kv=/-\w/g,vt=Bo(e=>e.replace(Kv,t=>t.slice(1).toUpperCase())),Wv=/\B([A-Z])/g,ys=Bo(e=>e.replace(Wv,"-$1").toLowerCase()),An=Bo(e=>e.charAt(0).toUpperCase()+e.slice(1)),Yn=Bo(e=>e?`on${An(e)}`:""),qt=(e,t)=>!Object.is(e,t),Qn=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},sf=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Uo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},no=e=>{const t=Ue(e)?Number(e):NaN;return isNaN(t)?e:t};let Gd;const Ho=()=>Gd||(Gd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Jv(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const Zv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Yv=Rs(Zv);function ml(e){if(Re(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=Ue(a)?af(a):ml(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(Ue(e)||lt(e))return e}const Qv=/;(?![^(]*\))/g,Xv=/:([^]+)/,eg=/\/\*[^]*?\*\//g;function af(e){const t={};return e.replace(eg,"").split(Qv).forEach(s=>{if(s){const a=s.split(Xv);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function vl(e){let t="";if(Ue(e))t=e;else if(Re(e))for(let s=0;s<e.length;s++){const a=vl(e[s]);a&&(t+=a+" ")}else if(lt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function tg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ue(t)&&(e.class=vl(t)),s&&(e.style=ml(s)),e}const sg="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",ag="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",ng="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",ig="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",lg=Rs(sg),og=Rs(ag),rg=Rs(ng),cg=Rs(ig),dg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",ug=Rs(dg);function nf(e){return!!e||e===""}function pg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=Da(e[a],t[a]);return s}function Da(e,t){if(e===t)return!0;let s=qd(e),a=qd(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=ls(e),a=ls(t),s||a)return e===t;if(s=Re(e),a=Re(t),s||a)return s&&a?pg(e,t):!1;if(s=lt(e),a=lt(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Da(e[l],t[l]))return!1}}return String(e)===String(t)}function zo(e,t){return e.findIndex(s=>Da(s,t))}const lf=e=>!!(e&&e.__v_isRef===!0),of=e=>Ue(e)?e:e==null?"":Re(e)||lt(e)&&(e.toString===tf||!Me(e.toString))?lf(e)?of(e.value):JSON.stringify(e,rf,2):String(e),rf=(e,t)=>lf(t)?rf(e,t.value):Zn(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[yr(a,i)+" =>"]=n,s),{})}:En(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>yr(s))}:ls(t)?yr(t):lt(t)&&!Re(t)&&!Fo(t)?String(t):t,yr=(e,t="")=>{var s;return ls(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function fg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let zt;class Mc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&zt&&(zt.active?(this.parent=zt,this.index=(zt.scopes||(zt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=zt;try{return zt=this,t()}finally{zt=s}}}on(){++this._on===1&&(this.prevScope=zt,zt=this)}off(){if(this._on>0&&--this._on===0){if(zt===this)zt=this.prevScope;else{let t=zt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function hg(e){return new Mc(e)}function cf(){return zt}function mg(e,t=!1){zt&&zt.cleanups.push(e)}let bt;const xr=new WeakSet;class Wi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,zt&&(zt.active?zt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,xr.has(this)&&(xr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||uf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Kd(this),pf(this);const t=bt,s=Ks;bt=this,Ks=!0;try{return this.fn()}finally{ff(this),bt=t,Ks=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Bc(t);this.deps=this.depsTail=void 0,Kd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?xr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Wr(this)&&this.run()}get dirty(){return Wr(this)}}let df=0,$i,Bi;function uf(e,t=!1){if(e.flags|=8,t){e.next=Bi,Bi=e;return}e.next=$i,$i=e}function Fc(){df++}function $c(){if(--df>0)return;if(Bi){let t=Bi;for(Bi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;$i;){let t=$i;for($i=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function pf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function ff(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),Bc(a),vg(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Wr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(hf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function hf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Ji)||(e.globalVersion=Ji,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Wr(e))))return;e.flags|=2;const t=e.dep,s=bt,a=Ks;bt=e,Ks=!0;try{pf(e);const n=e.fn(e._value);(t.version===0||qt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{bt=s,Ks=a,ff(e),e.flags&=-3}}function Bc(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Bc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function vg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function gg(e,t){e.effect instanceof Wi&&(e=e.effect.fn);const s=new Wi(e);t&&Ze(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function bg(e){e.effect.stop()}let Ks=!0;const mf=[];function Pa(){mf.push(Ks),Ks=!1}function Ma(){const e=mf.pop();Ks=e===void 0?!0:e}function Kd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=bt;bt=void 0;try{t()}finally{bt=s}}}let Ji=0;class yg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class jo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!bt||!Ks||bt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==bt)s=this.activeLink=new yg(bt,this),bt.deps?(s.prevDep=bt.depsTail,bt.depsTail.nextDep=s,bt.depsTail=s):bt.deps=bt.depsTail=s,vf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=bt.depsTail,s.nextDep=void 0,bt.depsTail.nextDep=s,bt.depsTail=s,bt.deps===s&&(bt.deps=a)}return s}trigger(t){this.version++,Ji++,this.notify(t)}notify(t){Fc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{$c()}}}function vf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)vf(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const io=new WeakMap,gn=Symbol(""),Jr=Symbol(""),Zi=Symbol("");function as(e,t,s){if(Ks&&bt){let a=io.get(e);a||io.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new jo),n.map=a,n.key=s),n.track()}}function Ta(e,t,s,a,n,i){const l=io.get(e);if(!l){Ji++;return}const o=r=>{r&&r.trigger()};if(Fc(),t==="clear")l.forEach(o);else{const r=Re(e),c=r&&$o(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Zi||!ls(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Zi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(gn)),Zn(e)&&o(l.get(Jr)));break;case"delete":r||(o(l.get(gn)),Zn(e)&&o(l.get(Jr)));break;case"set":Zn(e)&&o(l.get(gn));break}}$c()}function xg(e,t){const s=io.get(e);return s&&s.get(t)}function Mn(e){const t=tt(e);return t===e?t:(as(t,"iterate",Zi),_s(e)?t:t.map(Js))}function Vo(e){return as(e=tt(e),"iterate",Zi),e}function ra(e,t){return da(e)?ii(Oa(e)?Js(t):t):Js(t)}const _g={__proto__:null,[Symbol.iterator](){return _r(this,Symbol.iterator,e=>ra(this,e))},concat(...e){return Mn(this).concat(...e.map(t=>Re(t)?Mn(t):t))},entries(){return _r(this,"entries",e=>(e[1]=ra(this,e[1]),e))},every(e,t){return ga(this,"every",e,t,void 0,arguments)},filter(e,t){return ga(this,"filter",e,t,s=>s.map(a=>ra(this,a)),arguments)},find(e,t){return ga(this,"find",e,t,s=>ra(this,s),arguments)},findIndex(e,t){return ga(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return ga(this,"findLast",e,t,s=>ra(this,s),arguments)},findLastIndex(e,t){return ga(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return ga(this,"forEach",e,t,void 0,arguments)},includes(...e){return wr(this,"includes",e)},indexOf(...e){return wr(this,"indexOf",e)},join(e){return Mn(this).join(e)},lastIndexOf(...e){return wr(this,"lastIndexOf",e)},map(e,t){return ga(this,"map",e,t,void 0,arguments)},pop(){return wi(this,"pop")},push(...e){return wi(this,"push",e)},reduce(e,...t){return Wd(this,"reduce",e,t)},reduceRight(e,...t){return Wd(this,"reduceRight",e,t)},shift(){return wi(this,"shift")},some(e,t){return ga(this,"some",e,t,void 0,arguments)},splice(...e){return wi(this,"splice",e)},toReversed(){return Mn(this).toReversed()},toSorted(e){return Mn(this).toSorted(e)},toSpliced(...e){return Mn(this).toSpliced(...e)},unshift(...e){return wi(this,"unshift",e)},values(){return _r(this,"values",e=>ra(this,e))}};function _r(e,t,s){const a=Vo(e),n=a[t]();return a!==e&&!_s(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const wg=Array.prototype;function ga(e,t,s,a,n,i){const l=Vo(e),o=l!==e&&!_s(e),r=l[t];if(r!==wg[t]){const u=r.apply(e,i);return o?Js(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,ra(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function Wd(e,t,s,a){const n=Vo(e),i=n!==e&&!_s(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=ra(e,c)),s.call(this,c,ra(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?ra(e,r):r}function wr(e,t,s){const a=tt(e);as(a,"iterate",Zi);const n=a[t](...s);return(n===-1||n===!1)&&gl(s[0])?(s[0]=tt(s[0]),a[t](...s)):n}function wi(e,t,s=[]){Pa(),Fc();const a=tt(e)[t].apply(e,s);return $c(),Ma(),a}const kg=Rs("__proto__,__v_isRef,__isVue"),gf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(ls));function Sg(e){ls(e)||(e=String(e));const t=tt(this);return as(t,"has",e),t.hasOwnProperty(e)}class bf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?Sf:kf:i?wf:_f).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Re(t);if(!n){let r;if(l&&(r=_g[s]))return r;if(s==="hasOwnProperty")return Sg}const o=Reflect.get(t,s,Mt(t)?t:a);if((ls(s)?gf.has(s):kg(s))||(n||as(t,"get",s),i))return o;if(Mt(o)){const r=l&&$o(s)?o:o.value;return n&&lt(r)?lo(r):r}return lt(o)?n?lo(o):an(o):o}}class yf extends bf{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Re(t)&&$o(s);if(!this._isShallow){const c=da(i);if(!_s(a)&&!da(a)&&(i=tt(i),a=tt(a)),!l&&Mt(i)&&!Mt(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:rt(t,s),r=Reflect.set(t,s,a,Mt(t)?t:n);return t===tt(n)&&(o?qt(a,i)&&Ta(t,"set",s,a):Ta(t,"add",s,a)),r}deleteProperty(t,s){const a=rt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Ta(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!ls(s)||!gf.has(s))&&as(t,"has",s),a}ownKeys(t){return as(t,"iterate",Re(t)?"length":gn),Reflect.ownKeys(t)}}class xf extends bf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Tg=new yf,Cg=new xf,Eg=new yf(!0),Ag=new xf(!0),Zr=e=>e,Il=e=>Reflect.getPrototypeOf(e);function Rg(e,t,s){return function(...a){const n=this.__v_raw,i=tt(n),l=Zn(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?Zr:t?ii:Js;return!t&&as(i,"iterate",r?Jr:gn),Ze(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Ol(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Ig(e,t){const s={get(n){const i=this.__v_raw,l=tt(i),o=tt(n);e||(qt(n,o)&&as(l,"get",n),as(l,"get",o));const{has:r}=Il(l),c=t?Zr:e?ii:Js;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&as(tt(n),"iterate",gn),n.size},has(n){const i=this.__v_raw,l=tt(i),o=tt(n);return e||(qt(n,o)&&as(l,"has",n),as(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=tt(o),c=t?Zr:e?ii:Js;return!e&&as(r,"iterate",gn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return Ze(s,e?{add:Ol("add"),set:Ol("set"),delete:Ol("delete"),clear:Ol("clear")}:{add(n){const i=tt(this),l=Il(i),o=tt(n),r=!t&&!_s(n)&&!da(n)?o:n;return l.has.call(i,r)||qt(n,r)&&l.has.call(i,n)||qt(o,r)&&l.has.call(i,o)||(i.add(r),Ta(i,"add",r,r)),this},set(n,i){!t&&!_s(i)&&!da(i)&&(i=tt(i));const l=tt(this),{has:o,get:r}=Il(l);let c=o.call(l,n);c||(n=tt(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?qt(i,d)&&Ta(l,"set",n,i):Ta(l,"add",n,i),this},delete(n){const i=tt(this),{has:l,get:o}=Il(i);let r=l.call(i,n);r||(n=tt(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Ta(i,"delete",n,void 0),c},clear(){const n=tt(this),i=n.size!==0,l=n.clear();return i&&Ta(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=Rg(n,e,t)}),s}function qo(e,t){const s=Ig(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(rt(s,n)&&n in a?s:a,n,i)}const Og={get:qo(!1,!1)},Lg={get:qo(!1,!0)},Ng={get:qo(!0,!1)},Dg={get:qo(!0,!0)},_f=new WeakMap,wf=new WeakMap,kf=new WeakMap,Sf=new WeakMap;function Pg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function an(e){return da(e)?e:Go(e,!1,Tg,Og,_f)}function Uc(e){return Go(e,!1,Eg,Lg,wf)}function lo(e){return Go(e,!0,Cg,Ng,kf)}function Mg(e){return Go(e,!0,Ag,Dg,Sf)}function Go(e,t,s,a,n){if(!lt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Pg(qv(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Oa(e){return da(e)?Oa(e.__v_raw):!!(e&&e.__v_isReactive)}function da(e){return!!(e&&e.__v_isReadonly)}function _s(e){return!!(e&&e.__v_isShallow)}function gl(e){return e?!!e.__v_raw:!1}function tt(e){const t=e&&e.__v_raw;return t?tt(t):e}function Tf(e){return!rt(e,"__v_skip")&&Object.isExtensible(e)&&sf(e,"__v_skip",!0),e}const Js=e=>lt(e)?an(e):e,ii=e=>lt(e)?lo(e):e;function Mt(e){return e?e.__v_isRef===!0:!1}function f(e){return Cf(e,!1)}function Hc(e){return Cf(e,!0)}function Cf(e,t){return Mt(e)?e:new Fg(e,t)}class Fg{constructor(t,s){this.dep=new jo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:tt(t),this._value=s?t:Js(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||_s(t)||da(t);t=a?t:tt(t),qt(t,s)&&(this._rawValue=t,this._value=a?t:Js(t),this.dep.trigger())}}function $g(e){e.dep&&e.dep.trigger()}function ca(e){return Mt(e)?e.value:e}function Bg(e){return Me(e)?e():ca(e)}const Ug={get:(e,t,s)=>t==="__v_raw"?e:ca(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return Mt(n)&&!Mt(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function zc(e){return Oa(e)?e:new Proxy(e,Ug)}class Hg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new jo,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Ef(e){return new Hg(e)}function zg(e){const t=Re(e)?new Array(e.length):{};for(const s in e)t[s]=Af(e,s);return t}class jg{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=ls(s)?s:String(s),this._raw=tt(t);let n=!0,i=t;if(!Re(t)||ls(this._key)||!$o(this._key))do n=!gl(i)||_s(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=ca(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Mt(this._raw[this._key])){const s=this._object[this._key];if(Mt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return xg(this._raw,this._key)}}class Vg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function qg(e,t,s){return Mt(e)?e:Me(e)?new Vg(e):lt(e)&&arguments.length>1?Af(e,t,s):f(e)}function Af(e,t,s){return new jg(e,t,s)}class Gg{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new jo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Ji-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&bt!==this)return uf(this,!0),!0}get value(){const t=this.dep.track();return hf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Kg(e,t,s=!1){let a,n;return Me(e)?a=e:(a=e.get,n=e.set),new Gg(a,n,s)}const Wg={GET:"get",HAS:"has",ITERATE:"iterate"},Jg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Ll={},oo=new WeakMap;let Ja;function Zg(){return Ja}function Rf(e,t=!1,s=Ja){if(s){let a=oo.get(s);a||oo.set(s,a=[]),a.push(e)}}function Yg(e,t,s=Ye){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>n?b:_s(b)||n===!1||n===0?Ca(b,1):Ca(b);let d,u,p,h,m=!1,v=!1;if(Mt(e)?(u=()=>e.value,m=_s(e)):Oa(e)?(u=()=>c(e),m=!0):Re(e)?(v=!0,m=e.some(b=>Oa(b)||_s(b)),u=()=>e.map(b=>{if(Mt(b))return b.value;if(Oa(b))return c(b);if(Me(b))return r?r(b,2):b()})):Me(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Pa();try{p()}finally{Ma()}}const b=Ja;Ja=d;try{return r?r(e,3,[h]):e(h)}finally{Ja=b}}:u=Qt,t&&n){const b=u,S=n===!0?1/0:n;u=()=>Ca(b(),S)}const E=cf(),I=()=>{d.stop(),E&&E.active&&Dc(E.effects,d)};if(i&&t){const b=t;t=(...S)=>{const _=b(...S);return I(),_}}let y=v?new Array(e.length).fill(Ll):Ll;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const S=d.run();if(b||n||m||(v?S.some((_,w)=>qt(_,y[w])):qt(S,y))){p&&p();const _=Ja;Ja=d;try{const w=[S,y===Ll?void 0:v&&y[0]===Ll?[]:y,h];y=S,r?r(t,3,w):t(...w)}finally{Ja=_}}}else d.run()};return o&&o(g),d=new Wi(u),d.scheduler=l?()=>l(g,!1):g,h=b=>Rf(b,!1,d),p=d.onStop=()=>{const b=oo.get(d);if(b){if(r)r(b,4);else for(const S of b)S();oo.delete(d)}},t?a?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),I.pause=d.pause.bind(d),I.resume=d.resume.bind(d),I.stop=I,I}function Ca(e,t=1/0,s){if(t<=0||!lt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Mt(e))Ca(e.value,t,s);else if(Re(e))for(let a=0;a<e.length;a++)Ca(e[a],t,s);else if(En(e)||Zn(e))e.forEach(a=>{Ca(a,t,s)});else if(Fo(e)){for(const a in e)Ca(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ca(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const If=[];function Qg(e){If.push(e)}function Xg(){If.pop()}function eb(e,t){}const tb={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},sb={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function bi(e,t,s,a){try{return a?e(...a):e()}catch(n){Rn(n,t,s)}}function As(e,t,s,a){if(Me(e)){const n=bi(e,t,s,a);return n&&Pc(n)&&n.catch(i=>{Rn(i,t,s)}),n}if(Re(e)){const n=[];for(let i=0;i<e.length;i++)n.push(As(e[i],t,s,a));return n}}function Rn(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ye;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Pa(),bi(i,null,10,[e,r,c]),Ma();return}}ab(e,s,n,a,l)}function ab(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const ds=[];let la=-1;const Xn=[];let Za=null,zn=0;const Of=Promise.resolve();let ro=null;function It(e){const t=ro||Of;return e?t.then(this?e.bind(this):e):t}function nb(e){let t=la+1,s=ds.length;for(;t<s;){const a=t+s>>>1,n=ds[a],i=Qi(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function jc(e){if(!(e.flags&1)){const t=Qi(e),s=ds[ds.length-1];!s||!(e.flags&2)&&t>=Qi(s)?ds.push(e):ds.splice(nb(t),0,e),e.flags|=1,Lf()}}function Lf(){ro||(ro=Of.then(Nf))}function Yi(e){Re(e)?Xn.push(...e):Za&&e.id===-1?Za.splice(zn+1,0,e):e.flags&1||(Xn.push(e),e.flags|=1),Lf()}function Jd(e,t,s=la+1){for(;s<ds.length;s++){const a=ds[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;ds.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function co(e){if(Xn.length){const t=[...new Set(Xn)].sort((s,a)=>Qi(s)-Qi(a));if(Xn.length=0,Za){Za.push(...t);return}for(Za=t,zn=0;zn<Za.length;zn++){const s=Za[zn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Za=null,zn=0}}const Qi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Nf(e){try{for(la=0;la<ds.length;la++){const t=ds[la];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),bi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;la<ds.length;la++){const t=ds[la];t&&(t.flags&=-2)}la=-1,ds.length=0,co(),ro=null,(ds.length||Xn.length)&&Nf()}}let jn,Nl=[];function Df(e,t){var s,a;jn=e,jn?(jn.enabled=!0,Nl.forEach(({event:n,args:i})=>jn.emit(n,...i)),Nl=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Df(i,t)}),setTimeout(()=>{jn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Nl=[])},3e3)):Nl=[]}let Yt=null,Ko=null;function Xi(e){const t=Yt;return Yt=e,Ko=e&&e.type.__scopeId||null,t}function ib(e){Ko=e}function lb(){Ko=null}const ob=e=>Vc;function Vc(e,t=Yt,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&al(-1);const i=Xi(t);let l;try{l=e(...n)}finally{Xi(i),a._d&&al(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function rb(e,t){if(Yt===null)return e;const s=_l(Yt),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=Ye]=t[n];i&&(Me(i)&&(i={mounted:i,updated:i}),i.deep&&Ca(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function oa(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(Pa(),As(r,s,8,[e.el,o,e,t]),Ma())}}function Ui(e,t){if(Zt){let s=Zt.provides;const a=Zt.parent&&Zt.parent.provides;a===s&&(s=Zt.provides=Object.create(a)),s[e]=t}}function Bs(e,t,s=!1){const a=ps();if(a||bn){let n=bn?bn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&Me(t)?t.call(a&&a.proxy):t}}function cb(){return!!(ps()||bn)}const Pf=Symbol.for("v-scx"),Mf=()=>Bs(Pf);function db(e,t){return bl(e,null,t)}function ub(e,t){return bl(e,null,{flush:"post"})}function Ff(e,t){return bl(e,null,{flush:"sync"})}function Ft(e,t,s){return bl(e,t,s)}function bl(e,t,s=Ye){const{immediate:a,deep:n,flush:i,once:l}=s,o=Ze({},s),r=t&&a||!t&&i!=="post";let c;if(kn){if(i==="sync"){const h=Mf();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!r){const h=()=>{};return h.stop=Qt,h.resume=Qt,h.pause=Qt,h}}const d=Zt;o.call=(h,m,v)=>As(h,d,m,v);let u=!1;i==="post"?o.scheduler=h=>{Dt(h,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(h,m)=>{m?h():jc(h)}),o.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=Yg(e,t,o);return kn&&(c?c.push(p):r&&p()),p}function pb(e,t,s){const a=this.proxy,n=Ue(e)?e.includes(".")?$f(a,e):()=>a[e]:e.bind(a,a);let i;Me(t)?i=t:(i=t.handler,s=t);const l=yi(this),o=bl(n,i.bind(a),s);return l(),o}function $f(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const Ka=new WeakMap,Bf=Symbol("_vte"),Uf=e=>e.__isTeleport,fn=e=>e&&(e.disabled||e.disabled===""),fb=e=>e&&(e.defer||e.defer===""),Zd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Yd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Yr=(e,t)=>{const s=e&&e.to;return Ue(s)?t?t(s):null:s},hb={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:E,parentNode:I}}=c,y=fn(t.props);let{dynamicChildren:g}=t;const b=(w,k,x)=>{w.shapeFlag&16&&d(w.children,k,x,n,i,l,o,r)},S=(w=t)=>{const k=fn(w.props),x=w.target=Yr(w.props,m),O=Qr(x,w,v,h);x&&(l!=="svg"&&Zd(x)?l="svg":l!=="mathml"&&Yd(x)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(x),k||(b(w,x,O),Ni(w,!1)))},_=w=>{const k=()=>{if(Ka.get(w)===k){if(Ka.delete(w),fn(w.props)){const x=I(w.el)||s;b(w,x,w.anchor),Ni(w,!0)}S(w)}};Ka.set(w,k),Dt(k,i)};if(e==null){const w=t.el=v(""),k=t.anchor=v("");if(h(w,s,a),h(k,s,a),fb(t.props)||i&&i.pendingBranch){_(t);return}y&&(b(t,s,k),Ni(t,!0)),S()}else{t.el=e.el;const w=t.anchor=e.anchor,k=Ka.get(e);if(k){k.flags|=8,Ka.delete(e),_(t);return}t.targetStart=e.targetStart;const x=t.target=e.target,O=t.targetAnchor=e.targetAnchor,$=fn(e.props),T=$?s:x,M=$?w:O;if(l==="svg"||Zd(x)?l="svg":(l==="mathml"||Yd(x))&&(l="mathml"),g?(p(e.dynamicChildren,g,T,n,i,l,o),td(e,t,!0)):r||u(e,t,T,M,n,i,l,o,!1),y)$?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Dl(t,s,w,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const V=t.target=Yr(t.props,m);V&&Dl(t,V,null,c,0)}else $&&Dl(t,x,O,c,1);Ni(t,y)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!fn(p),m=Ka.get(e);if(m&&(m.flags|=8,Ka.delete(e)),u&&(n(c),n(d)),i&&n(r),!m&&l&16)for(let v=0;v<o.length;v++){const E=o[v];a(E,t,s,h,!!E.dynamicChildren)}},move:Dl,hydrate:mb};function Dl(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!Ka.has(e)&&(!u||fn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function mb(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(E,I){let y=I;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,E._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(E,I){I.anchor=u(l(E),I,o(E),s,a,n,i)}const m=t.target=Yr(t.props,r),v=fn(t.props);if(m){const E=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,E),t.targetAnchor||Qr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,E),t.targetAnchor||Qr(m,t,d,c),u(E&&l(E),t,m,s,a,n,i))),Ni(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const vb=hb;function Ni(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function Qr(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Bf]=l,e&&(a(i,e,n),a(l,e,n)),l}const Ps=Symbol("_leaveCb"),ki=Symbol("_enterCb");function qc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ge(()=>{e.isMounted=!0}),Yo(()=>{e.isUnmounting=!0}),e}const Ds=[Function,Array],Gc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ds,onEnter:Ds,onAfterEnter:Ds,onEnterCancelled:Ds,onBeforeLeave:Ds,onLeave:Ds,onAfterLeave:Ds,onLeaveCancelled:Ds,onBeforeAppear:Ds,onAppear:Ds,onAfterAppear:Ds,onAppearCancelled:Ds},Hf=e=>{const t=e.subTree;return t.component?Hf(t.component):t},gb={name:"BaseTransition",props:Gc,setup(e,{slots:t}){const s=ps(),a=qc();return()=>{const n=t.default&&Wo(t.default(),!0),i=n&&n.length?zf(n):s.subTree?Sh():void 0;if(!i)return;const l=tt(e),{mode:o}=l;if(a.isLeaving)return kr(i);const r=Qd(i);if(!r)return kr(i);let c=li(r,l,a,s,u=>c=u);r.type!==Ot&&Fa(r,c);let d=s.subTree&&Qd(s.subTree);if(d&&d.type!==Ot&&!Gs(d,r)&&Hf(s).type!==Ot){let u=li(d,l,a,s);if(Fa(d,u),o==="out-in"&&r.type!==Ot)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},kr(i);o==="in-out"&&r.type!==Ot?u.delayLeave=(p,h,m)=>{const v=Vf(a,d);v[String(d.key)]=d,p[Ps]=()=>{h(),p[Ps]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function zf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Ot){t=s;break}}return t}const jf=gb;function Vf(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function li(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:E,onAppear:I,onAfterAppear:y,onAppearCancelled:g}=t,b=String(e.key),S=Vf(s,e),_=(x,O)=>{x&&As(x,a,9,O)},w=(x,O)=>{const $=O[1];_(x,O),Re(x)?x.every(T=>T.length<=1)&&$():x.length<=1&&$()},k={mode:l,persisted:o,beforeEnter(x){let O=r;if(!s.isMounted)if(i)O=E||r;else return;x[Ps]&&x[Ps](!0);const $=S[b];$&&Gs(e,$)&&$.el[Ps]&&$.el[Ps](),_(O,[x])},enter(x){if(S[b]===e)return;let O=c,$=d,T=u;if(!s.isMounted)if(i)O=I||c,$=y||d,T=g||u;else return;let M=!1;x[ki]=G=>{M||(M=!0,G?_(T,[x]):_($,[x]),k.delayedLeave&&k.delayedLeave(),x[ki]=void 0)};const V=x[ki].bind(null,!1);O?w(O,[x,V]):V()},leave(x,O){const $=String(e.key);if(x[ki]&&x[ki](!0),s.isUnmounting)return O();_(p,[x]);let T=!1;x[Ps]=V=>{T||(T=!0,O(),V?_(v,[x]):_(m,[x]),x[Ps]=void 0,S[$]===e&&delete S[$])};const M=x[Ps].bind(null,!1);S[$]=e,h?w(h,[x,M]):M()},clone(x){const O=li(x,t,s,a,n);return n&&n(O),O}};return k}function kr(e){if(xl(e))return e=ua(e),e.children=null,e}function Qd(e){if(!xl(e))return Uf(e.type)&&e.children?zf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Me(s.default))return s.default()}}function Fa(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Fa(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Wo(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Gt?(l.patchFlag&128&&n++,a=a.concat(Wo(l.children,t,o))):(t||l.type!==Ot)&&a.push(o!=null?ua(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function yl(e,t){return Me(e)?Ze({name:e.name},t,{setup:e}):e}function bb(){const e=ps();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Kc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function yb(e){const t=ps(),s=Hc(null);if(t){const n=t.refs===Ye?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Xd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const uo=new WeakMap;function ei(e,t,s,a,n=!1){if(Re(e)){e.forEach((v,E)=>ei(v,t&&(Re(t)?t[E]:t),s,a,n));return}if(La(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&ei(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?_l(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ye?o.refs={}:o.refs,u=o.setupState,p=tt(u),h=u===Ye?Gn:v=>Xd(d,v)?!1:rt(p,v),m=(v,E)=>!(E&&Xd(d,E));if(c!=null&&c!==r){if(eu(t),Ue(c))d[c]=null,h(c)&&(u[c]=null);else if(Mt(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Me(r))bi(r,o,12,[l,d]);else{const v=Ue(r),E=Mt(r);if(v||E){const I=()=>{if(e.f){const y=v?h(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(n)Re(y)&&Dc(y,i);else if(Re(y))y.includes(i)||y.push(i);else if(v)d[r]=[i],h(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,h(r)&&(u[r]=l)):E&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{I(),uo.delete(e)};y.id=-1,uo.set(e,y),Dt(y,s)}else eu(e),I()}}}function eu(e){const t=uo.get(e);t&&(t.flags|=8,uo.delete(e))}let tu=!1;const Fn=()=>{tu||(console.error("Hydration completed but contains mismatches."),tu=!0)},xb=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",_b=e=>e.namespaceURI.includes("MathML"),Pl=e=>{if(e.nodeType===1){if(xb(e))return"svg";if(_b(e))return"mathml"}},Kn=e=>e.nodeType===8;function wb(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),co(),b._vnode=g;return}u(b.firstChild,g,null,null,null),co(),b._vnode=g},u=(g,b,S,_,w,k=!1)=>{k=k||!!b.dynamicChildren;const x=Kn(g)&&g.data==="[",O=()=>v(g,b,S,_,w,x),{type:$,ref:T,shapeFlag:M,patchFlag:V}=b;let G=g.nodeType;b.el=g,V===-2&&(k=!1,b.dynamicChildren=null);let P=null;switch($){case en:G!==3?b.children===""?(r(b.el=n(""),l(g),g),P=g):P=O():(g.data!==b.children&&(Fn(),g.data=b.children),P=i(g));break;case Ot:y(g)?(P=i(g),I(b.el=g.content.firstChild,g,S)):G!==8||x?P=O():P=i(g);break;case yn:if(x&&(g=i(g),G=g.nodeType),G===1||G===3){P=g;const L=!b.children.length;for(let N=0;N<b.staticCount;N++)L&&(b.children+=P.nodeType===1?P.outerHTML:P.data),N===b.staticCount-1&&(b.anchor=P),P=i(P);return x?i(P):P}else O();break;case Gt:x?P=m(g,b,S,_,w,k):P=O();break;default:if(M&1)(G!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?P=O():P=p(g,b,S,_,w,k);else if(M&6){b.slotScopeIds=w;const L=l(g);if(x?P=E(g):Kn(g)&&g.data==="teleport start"?P=E(g,g.data,"teleport end"):P=i(g),t(b,L,null,S,_,Pl(L),k),La(b)&&!b.type.__asyncResolved){let N;x?(N=_t(Gt),N.anchor=P?P.previousSibling:L.lastChild):N=g.nodeType===3?ad(""):_t("div"),N.el=g,b.component.subTree=N}}else M&64?G!==8?P=O():P=b.type.hydrate(g,b,S,_,w,k,e,h):M&128&&(P=b.type.hydrate(g,b,S,_,Pl(l(g)),w,k,e,u))}return T!=null&&ei(T,null,_,b),P},p=(g,b,S,_,w,k)=>{k=k||!!b.dynamicChildren;const{type:x,props:O,patchFlag:$,shapeFlag:T,dirs:M,transition:V}=b,G=x==="input"||x==="option";if(G||$!==-1){M&&oa(b,null,S,"created");let P=!1;if(y(g)){P=mh(null,V)&&S&&S.vnode.props&&S.vnode.props.appear;const N=g.content.firstChild;if(P){const te=N.getAttribute("class");te&&(N.$cls=te),V.beforeEnter(N)}I(N,g,S),b.el=g=N}if(T&16&&!(O&&(O.innerHTML||O.textContent))){let N=h(g.firstChild,b,g,S,_,w,k);for(N&&!Ml(g,1)&&Fn();N;){const te=N;N=N.nextSibling,o(te)}}else if(T&8){let N=b.children;N[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(N=N.slice(1));const{textContent:te}=g;te!==N&&te!==N.replace(/\r\n|\r/g,`
`)&&(Ml(g,0)||Fn(),g.textContent=b.children)}if(O){if(G||!k||$&48){const N=g.tagName.includes("-");for(const te in O)(G&&(te.endsWith("value")||te==="indeterminate")||Cn(te)&&!Ia(te)||te[0]==="."||N&&!Ia(te))&&a(g,te,null,O[te],void 0,S)}else if(O.onClick)a(g,"onClick",null,O.onClick,void 0,S);else if($&4&&Oa(O.style))for(const N in O.style)O.style[N]}let L;(L=O&&O.onVnodeBeforeMount)&&vs(L,S,b),M&&oa(b,null,S,"beforeMount"),((L=O&&O.onVnodeMounted)||M||P)&&yh(()=>{L&&vs(L,S,b),P&&V.enter(g),M&&oa(b,null,S,"mounted")},_)}return g.nextSibling},h=(g,b,S,_,w,k,x)=>{x=x||!!b.dynamicChildren;const O=b.children,$=O.length;let T=!1;for(let M=0;M<$;M++){const V=x?O[M]:O[M]=bs(O[M]),G=V.type===en;g?(G&&!x&&M+1<$&&bs(O[M+1]).type===en&&(r(n(g.data.slice(V.children.length)),S,i(g)),g.data=V.children),g=u(g,V,_,w,k,x)):G&&!V.children?r(V.el=n(""),S):(T||(T=!0,Ml(S,1)||Fn()),s(null,V,S,null,_,w,Pl(S),k))}return g},m=(g,b,S,_,w,k)=>{const{slotScopeIds:x}=b;x&&(w=w?w.concat(x):x);const O=l(g),$=h(i(g),b,O,S,_,w,k);return $&&Kn($)&&$.data==="]"?i(b.anchor=$):(Fn(),r(b.anchor=c("]"),O,$),$)},v=(g,b,S,_,w,k)=>{if(Ml(g.parentElement,1)||Fn(),b.el=null,k){const $=E(g);for(;;){const T=i(g);if(T&&T!==$)o(T);else break}}const x=i(g),O=l(g);return o(g),s(null,b,O,x,S,_,Pl(O),w),S&&(S.vnode.el=b.el,Xo(S,b.el)),x},E=(g,b="[",S="]")=>{let _=0;for(;g;)if(g=i(g),g&&Kn(g)&&(g.data===b&&_++,g.data===S)){if(_===0)return i(g);_--}return g},I=(g,b,S)=>{const _=b.parentNode;_&&_.replaceChild(g,b);let w=S;for(;w;)w.vnode.el===b&&(w.vnode.el=w.subTree.el=g),w=w.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const su="data-allow-mismatch",kb={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Ml(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(su);)e=e.parentElement;const s=e&&e.getAttribute(su);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(kb[t])}}const Sb=Ho().requestIdleCallback||(e=>setTimeout(e,1)),Tb=Ho().cancelIdleCallback||(e=>clearTimeout(e)),Cb=(e=1e4)=>t=>{const s=Sb(t,{timeout:e});return()=>Tb(s)};function Eb(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const Ab=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(Eb(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},Rb=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Ib=(e=[])=>(t,s)=>{Ue(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function Ob(e,t){if(Kn(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(Kn(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const La=e=>!!e.type.__asyncLoader;function Lb(e){Me(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((E,I)=>{r(v,()=>E(p()),()=>I(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return yl({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,E){let I=!1;(v.bu||(v.bu=[])).push(()=>I=!0);const y=()=>{I||E()},g=i?()=>{const b=i(y,S=>Ob(m,S));b&&(v.bum||(v.bum=[])).push(b)}:y;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Zt;if(Kc(m),d)return()=>Fl(d,m);const v=S=>{c=null,Rn(S,m,13,!a)};if(o&&m.suspense||kn)return h().then(S=>()=>Fl(S,m)).catch(S=>(v(S),()=>a?_t(a,{error:S}):null));const E=f(!1),I=f(),y=f(!!n);let g,b;return ft(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),n&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},n)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!E.value&&!I.value){const S=new Error(`Async component timed out after ${l}ms.`);v(S),I.value=S}},l)),h().then(()=>{m.isUnmounted||(E.value=!0,m.parent&&xl(m.parent.vnode)&&m.parent.update())}).catch(S=>{if(m.isUnmounted){c=null;return}v(S),I.value=S}),()=>{if(E.value&&d)return Fl(d,m);if(I.value&&a)return _t(a,{error:I.value});if(s&&!y.value)return Fl(s,m)}}})}function Fl(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=_t(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const xl=e=>e.type.__isKeepAlive,Nb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=ps(),a=s.ctx;if(!a.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(y,g,b,S,_)=>{const w=y.component;c(y,g,b,0,o),r(w.vnode,y,g,b,w,o,S,y.slotScopeIds,_),Dt(()=>{w.isDeactivated=!1,w.a&&Qn(w.a);const k=y.props&&y.props.onVnodeMounted;k&&vs(k,w.parent,y)},o)},a.deactivate=y=>{const g=y.component;fo(g.m),fo(g.a),c(y,p,null,1,o),Dt(()=>{g.da&&Qn(g.da);const b=y.props&&y.props.onVnodeUnmounted;b&&vs(b,g.parent,y),g.isDeactivated=!0},o)};function h(y){Sr(y),d(y,s,o,!0)}function m(y){n.forEach((g,b)=>{const S=oc(La(g)?g.type.__asyncResolved||{}:g.type);S&&!y(S)&&v(b)})}function v(y){const g=n.get(y);g&&(!l||!Gs(g,l))?h(g):l&&Sr(l),n.delete(y),i.delete(y)}Ft(()=>[e.include,e.exclude],([y,g])=>{y&&m(b=>Di(y,b)),g&&m(b=>!Di(g,b))},{flush:"post",deep:!0});let E=null;const I=()=>{E!=null&&(ho(s.subTree.type)?Dt(()=>{n.set(E,$l(s.subTree))},s.subTree.suspense):n.set(E,$l(s.subTree)))};return Ge(I),Zo(I),Yo(()=>{n.forEach(y=>{const{subTree:g,suspense:b}=s,S=$l(g);if(y.type===S.type&&y.key===S.key){Sr(S);const _=S.component.da;_&&Dt(_,b);return}h(y)})}),()=>{if(E=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!$a(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=$l(g);if(b.type===Ot)return l=null,b;const S=b.type,_=oc(La(b)?b.type.__asyncResolved||{}:S),{include:w,exclude:k,max:x}=e;if(w&&(!_||!Di(w,_))||k&&_&&Di(k,_))return b.shapeFlag&=-257,l=b,g;const O=b.key==null?S:b.key,$=n.get(O);return b.el&&(b=ua(b),g.shapeFlag&128&&(g.ssContent=b)),E=O,$?(b.el=$.el,b.component=$.component,b.transition&&Fa(b,b.transition),b.shapeFlag|=512,i.delete(O),i.add(O)):(i.add(O),x&&i.size>parseInt(x,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,ho(g.type)?g:b}}},Db=Nb;function Di(e,t){return Re(e)?e.some(s=>Di(s,t)):Ue(e)?e.split(",").includes(t):Vv(e)?(e.lastIndex=0,e.test(t)):!1}function Xt(e,t){qf(e,"a",t)}function Vt(e,t){qf(e,"da",t)}function qf(e,t,s=Zt){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Jo(t,a,s),s){let n=s.parent;for(;n&&n.parent;)xl(n.parent.vnode)&&Pb(a,t,s,n),n=n.parent}}function Pb(e,t,s,a){const n=Jo(t,e,a,!0);ft(()=>{Dc(a[t],n)},s)}function Sr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function $l(e){return e.shapeFlag&128?e.ssContent:e}function Jo(e,t,s=Zt,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Pa();const o=yi(s),r=As(t,s,e,l);return o(),Ma(),r});return a?n.unshift(i):n.push(i),i}}const Ba=e=>(t,s=Zt)=>{(!kn||e==="sp")&&Jo(e,(...a)=>t(...a),s)},Gf=Ba("bm"),Ge=Ba("m"),Wc=Ba("bu"),Zo=Ba("u"),Yo=Ba("bum"),ft=Ba("um"),Kf=Ba("sp"),Wf=Ba("rtg"),Jf=Ba("rtc");function Zf(e,t=Zt){Jo("ec",e,t)}const Jc="components",Mb="directives";function Fb(e,t){return Zc(Jc,e,!0,t)||e}const Yf=Symbol.for("v-ndc");function $b(e){return Ue(e)?Zc(Jc,e,!1)||e:e||Yf}function Bb(e){return Zc(Mb,e)}function Zc(e,t,s=!0,a=!1){const n=Yt||Zt;if(n){const i=n.type;if(e===Jc){const o=oc(i,!1);if(o&&(o===t||o===vt(t)||o===An(vt(t))))return i}const l=au(n[e]||i[e],t)||au(n.appContext[e],t);return!l&&a?i:l}}function au(e,t){return e&&(e[t]||e[vt(t)]||e[An(vt(t))])}function Ub(e,t,s,a){let n;const i=s&&s[a],l=Re(e);if(l||Ue(e)){const o=l&&Oa(e);let r=!1,c=!1;o&&(r=!_s(e),c=da(e),e=Vo(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?ii(Js(e[d])):Js(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(lt(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function Hb(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Re(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function zb(e,t,s={},a,n){if(Yt.ce||Yt.parent&&La(Yt.parent)&&Yt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),sl(),mo(Gt,null,[_t("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),sl();const l=i&&Yc(i(s)),o=s.key||l&&l.key,r=mo(Gt,{key:(o&&!ls(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Yc(e){return e.some(t=>$a(t)?!(t.type===Ot||t.type===Gt&&!Yc(t.children)):!0)?e:null}function jb(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:Yn(a)]=e[a];return s}const Xr=e=>e?Eh(e)?_l(e):Xr(e.parent):null,Hi=Ze(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Xr(e.parent),$root:e=>Xr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Qc(e),$forceUpdate:e=>e.f||(e.f=()=>{jc(e.update)}),$nextTick:e=>e.n||(e.n=It.bind(e.proxy)),$watch:e=>pb.bind(e)}),Tr=(e,t)=>e!==Ye&&!e.__isScriptSetup&&rt(e,t),ec={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(Tr(a,t))return l[t]=1,a[t];if(n!==Ye&&rt(n,t))return l[t]=2,n[t];if(rt(i,t))return l[t]=3,i[t];if(s!==Ye&&rt(s,t))return l[t]=4,s[t];tc&&(l[t]=0)}}const c=Hi[t];let d,u;if(c)return t==="$attrs"&&as(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ye&&rt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,rt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return Tr(n,t)?(n[t]=s,!0):a!==Ye&&rt(a,t)?(a[t]=s,!0):rt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==Ye&&o[0]!=="$"&&rt(e,o)||Tr(t,o)||rt(i,o)||rt(a,o)||rt(Hi,o)||rt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:rt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Vb=Ze({},ec,{get(e,t){if(t!==Symbol.unscopables)return ec.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Yv(t)}});function qb(){return null}function Gb(){return null}function Kb(e){}function Wb(e){}function Jb(){return null}function Zb(){}function Yb(e,t){return null}function Qb(){return Qf().slots}function Xb(){return Qf().attrs}function Qf(e){const t=ps();return t.setupContext||(t.setupContext=Oh(t))}function el(e){return Re(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function ey(e,t){const s=el(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Re(n)||Me(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function ty(e,t){return!e||!t?e||t:Re(e)&&Re(t)?e.concat(t):Ze({},el(e),el(t))}function sy(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function ay(e){const t=ps(),s=kn;let a=e();nl(),s&&si(!1);const n=()=>{yi(t),s&&si(!0)},i=()=>{ps()!==t&&t.scope.off(),nl(),s&&si(!1)};return Pc(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let tc=!0;function ny(e){const t=Qc(e),s=e.proxy,a=e.ctx;tc=!1,t.beforeCreate&&nu(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:E,beforeDestroy:I,beforeUnmount:y,destroyed:g,unmounted:b,render:S,renderTracked:_,renderTriggered:w,errorCaptured:k,serverPrefetch:x,expose:O,inheritAttrs:$,components:T,directives:M,filters:V}=t;if(c&&iy(c,a,null),l)for(const L in l){const N=l[L];Me(N)&&(a[L]=N.bind(s))}if(n){const L=n.call(s,s);lt(L)&&(e.data=an(L))}if(tc=!0,i)for(const L in i){const N=i[L],te=Me(N)?N.bind(s,s):Me(N.get)?N.get.bind(s,s):Qt,le=!Me(N)&&Me(N.set)?N.set.bind(s):Qt,B=j({get:te,set:le});Object.defineProperty(a,L,{enumerable:!0,configurable:!0,get:()=>B.value,set:W=>B.value=W})}if(o)for(const L in o)Xf(o[L],a,s,L);if(r){const L=Me(r)?r.call(s):r;Reflect.ownKeys(L).forEach(N=>{Ui(N,L[N])})}d&&nu(d,e,"c");function P(L,N){Re(N)?N.forEach(te=>L(te.bind(s))):N&&L(N.bind(s))}if(P(Gf,u),P(Ge,p),P(Wc,h),P(Zo,m),P(Xt,v),P(Vt,E),P(Zf,k),P(Jf,_),P(Wf,w),P(Yo,y),P(ft,b),P(Kf,x),Re(O))if(O.length){const L=e.exposed||(e.exposed={});O.forEach(N=>{Object.defineProperty(L,N,{get:()=>s[N],set:te=>s[N]=te,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===Qt&&(e.render=S),$!=null&&(e.inheritAttrs=$),T&&(e.components=T),M&&(e.directives=M),x&&Kc(e)}function iy(e,t,s=Qt){Re(e)&&(e=sc(e));for(const a in e){const n=e[a];let i;lt(n)?"default"in n?i=Bs(n.from||a,n.default,!0):i=Bs(n.from||a):i=Bs(n),Mt(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function nu(e,t,s){As(Re(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function Xf(e,t,s,a){let n=a.includes(".")?$f(s,a):()=>s[a];if(Ue(e)){const i=t[e];Me(i)&&Ft(n,i)}else if(Me(e))Ft(n,e.bind(s));else if(lt(e))if(Re(e))e.forEach(i=>Xf(i,t,s,a));else{const i=Me(e.handler)?e.handler.bind(s):t[e.handler];Me(i)&&Ft(n,i,e)}}function Qc(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>po(r,c,l,!0)),po(r,t,l)),lt(t)&&i.set(t,r),r}function po(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&po(e,i,s,!0),n&&n.forEach(l=>po(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=ly[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const ly={data:iu,props:lu,emits:lu,methods:Pi,computed:Pi,beforeCreate:os,created:os,beforeMount:os,mounted:os,beforeUpdate:os,updated:os,beforeDestroy:os,beforeUnmount:os,destroyed:os,unmounted:os,activated:os,deactivated:os,errorCaptured:os,serverPrefetch:os,components:Pi,directives:Pi,watch:ry,provide:iu,inject:oy};function iu(e,t){return t?e?function(){return Ze(Me(e)?e.call(this,this):e,Me(t)?t.call(this,this):t)}:t:e}function oy(e,t){return Pi(sc(e),sc(t))}function sc(e){if(Re(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function os(e,t){return e?[...new Set([].concat(e,t))]:t}function Pi(e,t){return e?Ze(Object.create(null),e,t):t}function lu(e,t){return e?Re(e)&&Re(t)?[...new Set([...e,...t])]:Ze(Object.create(null),el(e),el(t??{})):t}function ry(e,t){if(!e)return t;if(!t)return e;const s=Ze(Object.create(null),e);for(const a in t)s[a]=os(e[a],t[a]);return s}function eh(){return{app:null,config:{isNativeTag:Gn,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let cy=0;function dy(e,t){return function(a,n=null){Me(a)||(a=Ze({},a)),n!=null&&!lt(n)&&(n=null);const i=eh(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:cy++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Nh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Me(d.install)?(l.add(d),d.install(c,...u)):Me(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const h=c._ceVNode||_t(a,n);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),r=!0,c._container=d,d.__vue_app__=c,_l(h.component)}},onUnmount(d){o.push(d)},unmount(){r&&(As(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=bn;bn=c;try{return d()}finally{bn=u}}};return c}}let bn=null;function uy(e,t,s=Ye){const a=ps(),n=vt(t),i=ys(t),l=th(e,n),o=Ef((r,c)=>{let d,u=Ye,p;return Ff(()=>{const h=e[n];qt(d,h)&&(d=h,c())}),{get(){return r(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!qt(m,d)&&!(u!==Ye&&qt(h,u)))return;const v=a.vnode.props,E=!!(v&&(t in v||n in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${n}`in v||`onUpdate:${i}`in v));E||(d=h,c()),a.emit(`update:${t}`,m),qt(h,u)&&(qt(h,m)&&!qt(m,p)||E&&u!==Ye&&!qt(m,d))&&c(),u=h,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ye:o,done:!1}:{done:!0}}}},o}const th=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${vt(t)}Modifiers`]||e[`${ys(t)}Modifiers`];function py(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||Ye;let n=s;const i=t.startsWith("update:"),l=i&&th(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>Ue(d)?d.trim():d)),l.number&&(n=s.map(Uo)));let o,r=a[o=Yn(t)]||a[o=Yn(vt(t))];!r&&i&&(r=a[o=Yn(ys(t))]),r&&As(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,As(c,e,6,n)}}const fy=new WeakMap;function sh(e,t,s=!1){const a=s?fy:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!Me(e)){const r=c=>{const d=sh(c,t,!0);d&&(o=!0,Ze(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(lt(e)&&a.set(e,null),null):(Re(i)?i.forEach(r=>l[r]=null):Ze(l,i),lt(e)&&a.set(e,l),l)}function Qo(e,t){return!e||!Cn(t)?!1:(t=t.slice(2).replace(/Once$/,""),rt(e,t[0].toLowerCase()+t.slice(1))||rt(e,ys(t))||rt(e,t))}function Zl(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,E=Xi(e);let I,y;try{if(s.shapeFlag&4){const b=n||a,S=b;I=bs(c.call(S,b,d,u,h,p,m)),y=o}else{const b=t;I=bs(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:my(o)}}catch(b){zi.length=0,Rn(b,e,1),I=_t(Ot)}let g=I;if(y&&v!==!1){const b=Object.keys(y),{shapeFlag:S}=g;b.length&&S&7&&(i&&b.some(Mo)&&(y=vy(y,i)),g=ua(g,y,!1,!0))}return s.dirs&&(g=ua(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&Fa(g,s.transition),I=g,Xi(E),I}function hy(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if($a(n)){if(n.type!==Ot||n.children==="v-if"){if(s)return;s=n}}else return}return s}const my=e=>{let t;for(const s in e)(s==="class"||s==="style"||Cn(s))&&((t||(t={}))[s]=e[s]);return t},vy=(e,t)=>{const s={};for(const a in e)(!Mo(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function gy(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?ou(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(ah(l,a,p)&&!Qo(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?ou(a,l,c):!0:!!l;return!1}function ou(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(ah(t,e,i)&&!Qo(s,i))return!0}return!1}function ah(e,t,s){const a=e[s],n=t[s];return s==="style"&&lt(a)&&lt(n)?!Da(a,n):a!==n}function Xo({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const nh={},ih=()=>Object.create(nh),lh=e=>Object.getPrototypeOf(e)===nh;function by(e,t,s,a=!1){const n={},i=ih();e.propsDefaults=Object.create(null),oh(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Uc(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function yy(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=tt(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Qo(e.emitsOptions,p))continue;const h=t[p];if(r)if(rt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=vt(p);n[m]=ac(r,o,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{oh(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!rt(t,u)&&((d=ys(u))===u||!rt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=ac(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!rt(t,u))&&(delete i[u],c=!0)}c&&Ta(e.attrs,"set","")}function oh(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Ia(r))continue;const c=t[r];let d;n&&rt(n,d=vt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Qo(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=tt(s),c=o||Ye;for(let d=0;d<i.length;d++){const u=i[d];s[u]=ac(n,r,u,c[u],e,!rt(c,u))}}return l}function ac(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=rt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Me(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=yi(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===ys(s))&&(a=!0))}return a}const xy=new WeakMap;function rh(e,t,s=!1){const a=s?xy:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!Me(e)){const d=u=>{r=!0;const[p,h]=rh(u,t,!0);Ze(l,p),h&&o.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return lt(e)&&a.set(e,Jn),Jn;if(Re(i))for(let d=0;d<i.length;d++){const u=vt(i[d]);ru(u)&&(l[u]=Ye)}else if(i)for(const d in i){const u=vt(d);if(ru(u)){const p=i[d],h=l[u]=Re(p)||Me(p)?{type:p}:Ze({},p),m=h.type;let v=!1,E=!0;if(Re(m))for(let I=0;I<m.length;++I){const y=m[I],g=Me(y)&&y.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(E=!1)}else v=Me(m)&&m.name==="Boolean";h[0]=v,h[1]=E,(v||rt(h,"default"))&&o.push(u)}}const c=[l,o];return lt(e)&&a.set(e,c),c}function ru(e){return e[0]!=="$"&&!Ia(e)}const Xc=e=>e==="_"||e==="_ctx"||e==="$stable",ed=e=>Re(e)?e.map(bs):[bs(e)],_y=(e,t,s)=>{if(t._n)return t;const a=Vc((...n)=>ed(t(...n)),s);return a._c=!1,a},ch=(e,t,s)=>{const a=e._ctx;for(const n in e){if(Xc(n))continue;const i=e[n];if(Me(i))t[n]=_y(n,i,a);else if(i!=null){const l=ed(i);t[n]=()=>l}}},dh=(e,t)=>{const s=ed(t);e.slots.default=()=>s},uh=(e,t,s)=>{for(const a in t)(s||!Xc(a))&&(e[a]=t[a])},wy=(e,t,s)=>{const a=e.slots=ih();if(e.vnode.shapeFlag&32){const n=t._;n?(uh(a,t,s),s&&sf(a,"_",n,!0)):ch(t,a)}else t&&dh(e,t)},ky=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=Ye;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:uh(n,t,s):(i=!t.$stable,ch(t,n)),l=t}else t&&(dh(e,t),l={default:1});if(i)for(const o in n)!Xc(o)&&l[o]==null&&delete n[o]},Dt=yh;function ph(e){return hh(e)}function fh(e){return hh(e,wb)}function hh(e,t){const s=Ho();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Qt,insertStaticContent:m}=e,v=(C,F,R,Z=null,ee=null,ne=null,ve=void 0,H=null,Q=!!F.dynamicChildren)=>{if(C===F)return;C&&!Gs(C,F)&&(Z=q(C),W(C,ee,ne,!0),C=null),F.patchFlag===-2&&(Q=!1,F.dynamicChildren=null);const{type:X,ref:pe,shapeFlag:he}=F;switch(X){case en:E(C,F,R,Z);break;case Ot:I(C,F,R,Z);break;case yn:C==null&&y(F,R,Z,ve);break;case Gt:T(C,F,R,Z,ee,ne,ve,H,Q);break;default:he&1?S(C,F,R,Z,ee,ne,ve,H,Q):he&6?M(C,F,R,Z,ee,ne,ve,H,Q):(he&64||he&128)&&X.process(C,F,R,Z,ee,ne,ve,H,Q,me)}pe!=null&&ee?ei(pe,C&&C.ref,ne,F||C,!F):pe==null&&C&&C.ref!=null&&ei(C.ref,null,ne,C,!0)},E=(C,F,R,Z)=>{if(C==null)a(F.el=o(F.children),R,Z);else{const ee=F.el=C.el;F.children!==C.children&&c(ee,F.children)}},I=(C,F,R,Z)=>{C==null?a(F.el=r(F.children||""),R,Z):F.el=C.el},y=(C,F,R,Z)=>{[C.el,C.anchor]=m(C.children,F,R,Z,C.el,C.anchor)},g=({el:C,anchor:F},R,Z)=>{let ee;for(;C&&C!==F;)ee=p(C),a(C,R,Z),C=ee;a(F,R,Z)},b=({el:C,anchor:F})=>{let R;for(;C&&C!==F;)R=p(C),n(C),C=R;n(F)},S=(C,F,R,Z,ee,ne,ve,H,Q)=>{if(F.type==="svg"?ve="svg":F.type==="math"&&(ve="mathml"),C==null)_(F,R,Z,ee,ne,ve,H,Q);else{const X=C.el&&C.el._isVueCE?C.el:null;try{X&&X._beginPatch(),x(C,F,ee,ne,ve,H,Q)}finally{X&&X._endPatch()}}},_=(C,F,R,Z,ee,ne,ve,H)=>{let Q,X;const{props:pe,shapeFlag:he,transition:xe,dirs:Oe}=C;if(Q=C.el=l(C.type,ne,pe&&pe.is,pe),he&8?d(Q,C.children):he&16&&k(C.children,Q,null,Z,ee,Cr(C,ne),ve,H),Oe&&oa(C,null,Z,"created"),w(Q,C,C.scopeId,ve,Z),pe){for(const He in pe)He!=="value"&&!Ia(He)&&i(Q,He,null,pe[He],ne,Z);"value"in pe&&i(Q,"value",null,pe.value,ne),(X=pe.onVnodeBeforeMount)&&vs(X,Z,C)}Oe&&oa(C,null,Z,"beforeMount");const ge=mh(ee,xe);ge&&xe.beforeEnter(Q),a(Q,F,R),((X=pe&&pe.onVnodeMounted)||ge||Oe)&&Dt(()=>{try{X&&vs(X,Z,C),ge&&xe.enter(Q),Oe&&oa(C,null,Z,"mounted")}finally{}},ee)},w=(C,F,R,Z,ee)=>{if(R&&h(C,R),Z)for(let ne=0;ne<Z.length;ne++)h(C,Z[ne]);if(ee){let ne=ee.subTree;if(F===ne||ho(ne.type)&&(ne.ssContent===F||ne.ssFallback===F)){const ve=ee.vnode;w(C,ve,ve.scopeId,ve.slotScopeIds,ee.parent)}}},k=(C,F,R,Z,ee,ne,ve,H,Q=0)=>{for(let X=Q;X<C.length;X++){const pe=C[X]=H?ka(C[X]):bs(C[X]);v(null,pe,F,R,Z,ee,ne,ve,H)}},x=(C,F,R,Z,ee,ne,ve)=>{const H=F.el=C.el;let{patchFlag:Q,dynamicChildren:X,dirs:pe}=F;Q|=C.patchFlag&16;const he=C.props||Ye,xe=F.props||Ye;let Oe;if(R&&rn(R,!1),(Oe=xe.onVnodeBeforeUpdate)&&vs(Oe,R,F,C),pe&&oa(F,C,R,"beforeUpdate"),R&&rn(R,!0),(he.innerHTML&&xe.innerHTML==null||he.textContent&&xe.textContent==null)&&d(H,""),X?O(C.dynamicChildren,X,H,R,Z,Cr(F,ee),ne):ve||N(C,F,H,null,R,Z,Cr(F,ee),ne,!1),Q>0){if(Q&16)$(H,he,xe,R,ee);else if(Q&2&&he.class!==xe.class&&i(H,"class",null,xe.class,ee),Q&4&&i(H,"style",he.style,xe.style,ee),Q&8){const ge=F.dynamicProps;for(let He=0;He<ge.length;He++){const Be=ge[He],ze=he[Be],Qe=xe[Be];(Qe!==ze||Be==="value")&&i(H,Be,ze,Qe,ee,R)}}Q&1&&C.children!==F.children&&d(H,F.children)}else!ve&&X==null&&$(H,he,xe,R,ee);((Oe=xe.onVnodeUpdated)||pe)&&Dt(()=>{Oe&&vs(Oe,R,F,C),pe&&oa(F,C,R,"updated")},Z)},O=(C,F,R,Z,ee,ne,ve)=>{for(let H=0;H<F.length;H++){const Q=C[H],X=F[H],pe=Q.el&&(Q.type===Gt||!Gs(Q,X)||Q.shapeFlag&198)?u(Q.el):R;v(Q,X,pe,null,Z,ee,ne,ve,!0)}},$=(C,F,R,Z,ee)=>{if(F!==R){if(F!==Ye)for(const ne in F)!Ia(ne)&&!(ne in R)&&i(C,ne,F[ne],null,ee,Z);for(const ne in R){if(Ia(ne))continue;const ve=R[ne],H=F[ne];ve!==H&&ne!=="value"&&i(C,ne,H,ve,ee,Z)}"value"in R&&i(C,"value",F.value,R.value,ee)}},T=(C,F,R,Z,ee,ne,ve,H,Q)=>{const X=F.el=C?C.el:o(""),pe=F.anchor=C?C.anchor:o("");let{patchFlag:he,dynamicChildren:xe,slotScopeIds:Oe}=F;Oe&&(H=H?H.concat(Oe):Oe),C==null?(a(X,R,Z),a(pe,R,Z),k(F.children||[],R,pe,ee,ne,ve,H,Q)):he>0&&he&64&&xe&&C.dynamicChildren&&C.dynamicChildren.length===xe.length?(O(C.dynamicChildren,xe,R,ee,ne,ve,H),(F.key!=null||ee&&F===ee.subTree)&&td(C,F,!0)):N(C,F,R,pe,ee,ne,ve,H,Q)},M=(C,F,R,Z,ee,ne,ve,H,Q)=>{F.slotScopeIds=H,C==null?F.shapeFlag&512?ee.ctx.activate(F,R,Z,ve,Q):V(F,R,Z,ee,ne,ve,Q):G(C,F,Q)},V=(C,F,R,Z,ee,ne,ve)=>{const H=C.component=Ch(C,Z,ee);if(xl(C)&&(H.ctx.renderer=me),Ah(H,!1,ve),H.asyncDep){if(ee&&ee.registerDep(H,P,ve),!C.el){const Q=H.subTree=_t(Ot);I(null,Q,F,R),C.placeholder=Q.el}}else P(H,C,F,R,ee,ne,ve)},G=(C,F,R)=>{const Z=F.component=C.component;if(gy(C,F,R))if(Z.asyncDep&&!Z.asyncResolved){L(Z,F,R);return}else Z.next=F,Z.update();else F.el=C.el,Z.vnode=F},P=(C,F,R,Z,ee,ne,ve)=>{const H=()=>{if(C.isMounted){let{next:he,bu:xe,u:Oe,parent:ge,vnode:He}=C;{const nt=vh(C);if(nt){he&&(he.el=He.el,L(C,he,ve)),nt.asyncDep.then(()=>{Dt(()=>{C.isUnmounted||X()},ee)});return}}let Be=he,ze;rn(C,!1),he?(he.el=He.el,L(C,he,ve)):he=He,xe&&Qn(xe),(ze=he.props&&he.props.onVnodeBeforeUpdate)&&vs(ze,ge,he,He),rn(C,!0);const Qe=Zl(C),ot=C.subTree;C.subTree=Qe,v(ot,Qe,u(ot.el),q(ot),C,ee,ne),he.el=Qe.el,Be===null&&Xo(C,Qe.el),Oe&&Dt(Oe,ee),(ze=he.props&&he.props.onVnodeUpdated)&&Dt(()=>vs(ze,ge,he,He),ee)}else{let he;const{el:xe,props:Oe}=F,{bm:ge,m:He,parent:Be,root:ze,type:Qe}=C,ot=La(F);if(rn(C,!1),ge&&Qn(ge),!ot&&(he=Oe&&Oe.onVnodeBeforeMount)&&vs(he,Be,F),rn(C,!0),xe&&Fe){const nt=()=>{C.subTree=Zl(C),Fe(xe,C.subTree,C,ee,null)};ot&&Qe.__asyncHydrate?Qe.__asyncHydrate(xe,C,nt):nt()}else{ze.ce&&ze.ce._hasShadowRoot()&&ze.ce._injectChildStyle(Qe,C.parent?C.parent.type:void 0);const nt=C.subTree=Zl(C);v(null,nt,R,Z,C,ee,ne),F.el=nt.el}if(He&&Dt(He,ee),!ot&&(he=Oe&&Oe.onVnodeMounted)){const nt=F;Dt(()=>vs(he,Be,nt),ee)}(F.shapeFlag&256||Be&&La(Be.vnode)&&Be.vnode.shapeFlag&256)&&C.a&&Dt(C.a,ee),C.isMounted=!0,F=R=Z=null}};C.scope.on();const Q=C.effect=new Wi(H);C.scope.off();const X=C.update=Q.run.bind(Q),pe=C.job=Q.runIfDirty.bind(Q);pe.i=C,pe.id=C.uid,Q.scheduler=()=>jc(pe),rn(C,!0),X()},L=(C,F,R)=>{F.component=C;const Z=C.vnode.props;C.vnode=F,C.next=null,yy(C,F.props,Z,R),ky(C,F.children,R),Pa(),Jd(C),Ma()},N=(C,F,R,Z,ee,ne,ve,H,Q=!1)=>{const X=C&&C.children,pe=C?C.shapeFlag:0,he=F.children,{patchFlag:xe,shapeFlag:Oe}=F;if(xe>0){if(xe&128){le(X,he,R,Z,ee,ne,ve,H,Q);return}else if(xe&256){te(X,he,R,Z,ee,ne,ve,H,Q);return}}Oe&8?(pe&16&&de(X,ee,ne),he!==X&&d(R,he)):pe&16?Oe&16?le(X,he,R,Z,ee,ne,ve,H,Q):de(X,ee,ne,!0):(pe&8&&d(R,""),Oe&16&&k(he,R,Z,ee,ne,ve,H,Q))},te=(C,F,R,Z,ee,ne,ve,H,Q)=>{C=C||Jn,F=F||Jn;const X=C.length,pe=F.length,he=Math.min(X,pe);let xe;for(xe=0;xe<he;xe++){const Oe=F[xe]=Q?ka(F[xe]):bs(F[xe]);v(C[xe],Oe,R,null,ee,ne,ve,H,Q)}X>pe?de(C,ee,ne,!0,!1,he):k(F,R,Z,ee,ne,ve,H,Q,he)},le=(C,F,R,Z,ee,ne,ve,H,Q)=>{let X=0;const pe=F.length;let he=C.length-1,xe=pe-1;for(;X<=he&&X<=xe;){const Oe=C[X],ge=F[X]=Q?ka(F[X]):bs(F[X]);if(Gs(Oe,ge))v(Oe,ge,R,null,ee,ne,ve,H,Q);else break;X++}for(;X<=he&&X<=xe;){const Oe=C[he],ge=F[xe]=Q?ka(F[xe]):bs(F[xe]);if(Gs(Oe,ge))v(Oe,ge,R,null,ee,ne,ve,H,Q);else break;he--,xe--}if(X>he){if(X<=xe){const Oe=xe+1,ge=Oe<pe?F[Oe].el:Z;for(;X<=xe;)v(null,F[X]=Q?ka(F[X]):bs(F[X]),R,ge,ee,ne,ve,H,Q),X++}}else if(X>xe)for(;X<=he;)W(C[X],ee,ne,!0),X++;else{const Oe=X,ge=X,He=new Map;for(X=ge;X<=xe;X++){const Ae=F[X]=Q?ka(F[X]):bs(F[X]);Ae.key!=null&&He.set(Ae.key,X)}let Be,ze=0;const Qe=xe-ge+1;let ot=!1,nt=0;const Y=new Array(Qe);for(X=0;X<Qe;X++)Y[X]=0;for(X=Oe;X<=he;X++){const Ae=C[X];if(ze>=Qe){W(Ae,ee,ne,!0);continue}let Le;if(Ae.key!=null)Le=He.get(Ae.key);else for(Be=ge;Be<=xe;Be++)if(Y[Be-ge]===0&&Gs(Ae,F[Be])){Le=Be;break}Le===void 0?W(Ae,ee,ne,!0):(Y[Le-ge]=X+1,Le>=nt?nt=Le:ot=!0,v(Ae,F[Le],R,null,ee,ne,ve,H,Q),ze++)}const _e=ot?Sy(Y):Jn;for(Be=_e.length-1,X=Qe-1;X>=0;X--){const Ae=ge+X,Le=F[Ae],se=F[Ae+1],Ee=Ae+1<pe?se.el||gh(se):Z;Y[X]===0?v(null,Le,R,Ee,ee,ne,ve,H,Q):ot&&(Be<0||X!==_e[Be]?B(Le,R,Ee,2):Be--)}}},B=(C,F,R,Z,ee=null)=>{const{el:ne,type:ve,transition:H,children:Q,shapeFlag:X}=C;if(X&6){B(C.component.subTree,F,R,Z);return}if(X&128){C.suspense.move(F,R,Z);return}if(X&64){ve.move(C,F,R,me);return}if(ve===Gt){a(ne,F,R);for(let he=0;he<Q.length;he++)B(Q[he],F,R,Z);a(C.anchor,F,R);return}if(ve===yn){g(C,F,R);return}if(Z!==2&&X&1&&H)if(Z===0)H.persisted&&!ne[Ps]?a(ne,F,R):(H.beforeEnter(ne),a(ne,F,R),Dt(()=>H.enter(ne),ee));else{const{leave:he,delayLeave:xe,afterLeave:Oe}=H,ge=()=>{C.ctx.isUnmounted?n(ne):a(ne,F,R)},He=()=>{const Be=ne._isLeaving||!!ne[Ps];ne._isLeaving&&ne[Ps](!0),H.persisted&&!Be?ge():he(ne,()=>{ge(),Oe&&Oe()})};xe?xe(ne,ge,He):He()}else a(ne,F,R)},W=(C,F,R,Z=!1,ee=!1)=>{const{type:ne,props:ve,ref:H,children:Q,dynamicChildren:X,shapeFlag:pe,patchFlag:he,dirs:xe,cacheIndex:Oe,memo:ge}=C;if(he===-2&&(ee=!1),H!=null&&(Pa(),ei(H,null,R,C,!0),Ma()),Oe!=null&&(F.renderCache[Oe]=void 0),pe&256){F.ctx.deactivate(C);return}const He=pe&1&&xe,Be=!La(C);let ze;if(Be&&(ze=ve&&ve.onVnodeBeforeUnmount)&&vs(ze,F,C),pe&6)fe(C.component,R,Z);else{if(pe&128){C.suspense.unmount(R,Z);return}He&&oa(C,null,F,"beforeUnmount"),pe&64?C.type.remove(C,F,R,me,Z):X&&!X.hasOnce&&(ne!==Gt||he>0&&he&64)?de(X,F,R,!1,!0):(ne===Gt&&he&384||!ee&&pe&16)&&de(Q,F,R),Z&&re(C)}const Qe=ge!=null&&Oe==null;(Be&&(ze=ve&&ve.onVnodeUnmounted)||He||Qe)&&Dt(()=>{ze&&vs(ze,F,C),He&&oa(C,null,F,"unmounted"),Qe&&(C.el=null)},R)},re=C=>{const{type:F,el:R,anchor:Z,transition:ee}=C;if(F===Gt){J(R,Z);return}if(F===yn){b(C);return}const ne=()=>{n(R),ee&&!ee.persisted&&ee.afterLeave&&ee.afterLeave()};if(C.shapeFlag&1&&ee&&!ee.persisted){const{leave:ve,delayLeave:H}=ee,Q=()=>ve(R,ne);H?H(C.el,ne,Q):Q()}else ne()},J=(C,F)=>{let R;for(;C!==F;)R=p(C),n(C),C=R;n(F)},fe=(C,F,R)=>{const{bum:Z,scope:ee,job:ne,subTree:ve,um:H,m:Q,a:X}=C;fo(Q),fo(X),Z&&Qn(Z),ee.stop(),ne&&(ne.flags|=8,W(ve,C,F,R)),H&&Dt(H,F),Dt(()=>{C.isUnmounted=!0},F)},de=(C,F,R,Z=!1,ee=!1,ne=0)=>{for(let ve=ne;ve<C.length;ve++)W(C[ve],F,R,Z,ee)},q=C=>{if(C.shapeFlag&6)return q(C.component.subTree);if(C.shapeFlag&128)return C.suspense.next();const F=p(C.anchor||C.el),R=F&&F[Bf];return R?p(R):F};let ce=!1;const ue=(C,F,R)=>{let Z;C==null?F._vnode&&(W(F._vnode,null,null,!0),Z=F._vnode.component):v(F._vnode||null,C,F,null,null,null,R),F._vnode=C,ce||(ce=!0,Jd(Z),co(),ce=!1)},me={p:v,um:W,m:B,r:re,mt:V,mc:k,pc:N,pbc:O,n:q,o:e};let ye,Fe;return t&&([ye,Fe]=t(me)),{render:ue,hydrate:ye,createApp:dy(ue,ye)}}function Cr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function rn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function mh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function td(e,t,s=!1){const a=e.children,n=t.children;if(Re(a)&&Re(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=ka(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&td(l,o)),o.type===en&&(o.patchFlag===-1&&(o=n[i]=ka(o)),o.el=l.el),o.type===Ot&&!o.el&&(o.el=l.el)}}function Sy(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function vh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:vh(t)}function fo(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function gh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?gh(t.subTree):null}const ho=e=>e.__isSuspense;let nc=0;const Ty={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)Ey(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Ay(e,t,s,a,n,l,o,r,c)}},hydrate:Ry,normalize:Iy},Cy=Ty;function tl(e,t){const s=e.props&&e.props[t];Me(s)&&s()}function Ey(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=bh(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(tl(e,"onPending"),tl(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),ti(p,e.ssFallback)):p.resolve(!1,!0)}function Ay(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:E,isHydrating:I}=u;if(v)u.pendingBranch=p,Gs(v,p)?(r(v,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():E&&(I||(r(m,h,s,a,n,null,i,l,o),ti(u,h)))):(u.pendingId=nc++,I?(u.isHydrating=!1,u.activeBranch=v):c(v,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),E?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(m,h,s,a,n,null,i,l,o),ti(u,h))):m&&Gs(m,p)?(r(m,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Gs(m,p))r(m,p,s,a,n,u,i,l,o),ti(u,p);else if(tl(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=nc++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},y):y===0&&u.fallback(h)}}function bh(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:E}}=c;let I;const y=Oy(e);y&&t&&t.pendingBranch&&(I=t.pendingId,t.deps++);const g=e.props?no(e.props.timeout):void 0,b=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:nc++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,w=!1){const{vnode:k,activeBranch:x,pendingBranch:O,pendingId:$,effects:T,parentComponent:M,container:V,isInFallback:G}=S;let P=!1;if(S.isHydrating)S.isHydrating=!1;else if(!_){P=x&&O.transition&&O.transition.mode==="out-in";let te=!1;P&&(x.transition.afterLeave=()=>{$===S.pendingId&&(p(O,V,i===b&&!te?m(x):i,0),Yi(T),G&&k.ssFallback&&(k.ssFallback.el=null))}),x&&!S.isFallbackMountPending&&(v(x.el)===V&&(i=m(x),te=!0),h(x,M,S,!0),!P&&G&&k.ssFallback&&Dt(()=>k.ssFallback.el=null,S)),P||p(O,V,i,0)}S.isFallbackMountPending=!1,ti(S,O),S.pendingBranch=null,S.isInFallback=!1;let L=S.parent,N=!1;for(;L;){if(L.pendingBranch){L.effects.push(...T),N=!0;break}L=L.parent}!N&&!P&&Yi(T),S.effects=[],y&&t&&t.pendingBranch&&I===t.pendingId&&(t.deps--,t.deps===0&&!w&&t.resolve()),tl(k,"onResolve")},fallback(_){if(!S.pendingBranch)return;const{vnode:w,activeBranch:k,parentComponent:x,container:O,namespace:$}=S;tl(w,"onFallback");const T=m(k),M=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,_,O,T,x,null,$,o,r),ti(S,_))},V=_.transition&&_.transition.mode==="out-in";V&&(S.isFallbackMountPending=!0,k.transition.afterLeave=M),S.isInFallback=!0,h(k,x,null,!0),V||M()},move(_,w,k){S.activeBranch&&p(S.activeBranch,_,w,k),S.container=_},next(){return S.activeBranch&&m(S.activeBranch)},registerDep(_,w,k){const x=!!S.pendingBranch;x&&S.deps++;const O=_.vnode.el;_.asyncDep.catch($=>{Rn($,_,0)}).then($=>{if(_.isUnmounted||S.isUnmounted||S.pendingId!==_.suspenseId)return;nl(),_.asyncResolved=!0;const{vnode:T}=_;ic(_,$,!1),O&&(T.el=O);const M=!O&&_.subTree.el;w(_,T,v(O||_.subTree.el),O?null:m(_.subTree),S,l,k),M&&(T.placeholder=null,E(M)),Xo(_,T.el),x&&--S.deps===0&&S.resolve()})},unmount(_,w){S.isUnmounted=!0,S.activeBranch&&h(S.activeBranch,s,_,w),S.pendingBranch&&h(S.pendingBranch,s,_,w)}};return S}function Ry(e,t,s,a,n,i,l,o,r){const c=t.suspense=bh(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Iy(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=cu(a?s.default:s),e.ssFallback=a?cu(s.fallback):_t(Ot)}function cu(e){let t;if(Me(e)){const s=wn&&e._c;s&&(e._d=!1,sl()),e=e(),s&&(e._d=!0,t=ns,xh())}return Re(e)&&(e=hy(e)),e=bs(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function yh(e,t){t&&t.pendingBranch?Re(e)?t.effects.push(...e):t.effects.push(e):Yi(e)}function ti(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,Xo(a,n))}function Oy(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Gt=Symbol.for("v-fgt"),en=Symbol.for("v-txt"),Ot=Symbol.for("v-cmt"),yn=Symbol.for("v-stc"),zi=[];let ns=null;function sl(e=!1){zi.push(ns=e?null:[])}function xh(){zi.pop(),ns=zi[zi.length-1]||null}let wn=1;function al(e,t=!1){wn+=e,e<0&&ns&&t&&(ns.hasOnce=!0)}function _h(e){return e.dynamicChildren=wn>0?ns||Jn:null,xh(),wn>0&&ns&&ns.push(e),e}function Ly(e,t,s,a,n,i){return _h(sd(e,t,s,a,n,i,!0))}function mo(e,t,s,a,n){return _h(_t(e,t,s,a,n,!0))}function $a(e){return e?e.__v_isVNode===!0:!1}function Gs(e,t){return e.type===t.type&&e.key===t.key}function Ny(e){}const wh=({key:e})=>e??null,Yl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ue(e)||Mt(e)||Me(e)?{i:Yt,r:e,k:t,f:!!s}:e:null);function sd(e,t=null,s=null,a=0,n=null,i=e===Gt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&wh(t),ref:t&&Yl(t),scopeId:Ko,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:Yt};return o?(nd(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Ue(s)?8:16),wn>0&&!l&&ns&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&ns.push(r),r}const _t=Dy;function Dy(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===Yf)&&(e=Ot),$a(e)){const o=ua(e,t,!0);return s&&nd(o,s),wn>0&&!i&&ns&&(o.shapeFlag&6?ns[ns.indexOf(e)]=o:ns.push(o)),o.patchFlag=-2,o}if(Hy(e)&&(e=e.__vccOpts),t){t=kh(t);let{class:o,style:r}=t;o&&!Ue(o)&&(t.class=vl(o)),lt(r)&&(gl(r)&&!Re(r)&&(r=Ze({},r)),t.style=ml(r))}const l=Ue(e)?1:ho(e)?128:Uf(e)?64:lt(e)?4:Me(e)?2:0;return sd(e,t,s,a,n,l,i,!0)}function kh(e){return e?gl(e)||lh(e)?Ze({},e):e:null}function ua(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?Th(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&wh(c),ref:t&&t.ref?s&&i?Re(i)?i.concat(Yl(t)):[i,Yl(t)]:Yl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Gt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&ua(e.ssContent),ssFallback:e.ssFallback&&ua(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&Fa(d,r.clone(d)),d}function ad(e=" ",t=0){return _t(en,null,e,t)}function Py(e,t){const s=_t(yn,null,e);return s.staticCount=t,s}function Sh(e="",t=!1){return t?(sl(),mo(Ot,null,e)):_t(Ot,null,e)}function bs(e){return e==null||typeof e=="boolean"?_t(Ot):Re(e)?_t(Gt,null,e.slice()):$a(e)?ka(e):_t(en,null,String(e))}function ka(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:ua(e)}function nd(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Re(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),nd(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!lh(t)?t._ctx=Yt:n===3&&Yt&&(Yt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Me(t)?(t={default:t,_ctx:Yt},s=32):(t=String(t),a&64?(s=16,t=[ad(t)]):s=8);e.children=t,e.shapeFlag|=s}function Th(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=vl([t.class,a.class]));else if(n==="style")t.style=ml([t.style,a.style]);else if(Cn(n)){const i=t[n],l=a[n];l&&i!==l&&!(Re(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!Mo(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function vs(e,t,s,a=null){As(e,t,7,[s,a])}const My=eh();let Fy=0;function Ch(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||My,i={uid:Fy++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Mc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:rh(a,n),emitsOptions:sh(a,n),emit:null,emitted:null,propsDefaults:Ye,inheritAttrs:a.inheritAttrs,ctx:Ye,data:Ye,props:Ye,attrs:Ye,slots:Ye,refs:Ye,setupState:Ye,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=py.bind(null,i),e.ce&&e.ce(i),i}let Zt=null;const ps=()=>Zt||Yt;let vo,si;{const e=Ho(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};vo=t("__VUE_INSTANCE_SETTERS__",s=>Zt=s),si=t("__VUE_SSR_SETTERS__",s=>kn=s)}const yi=e=>{const t=Zt;return vo(e),e.scope.on(),()=>{e.scope.off(),vo(t)}},nl=()=>{Zt&&Zt.scope.off(),vo(null)};function Eh(e){return e.vnode.shapeFlag&4}let kn=!1;function Ah(e,t=!1,s=!1){t&&si(t);const{props:a,children:n}=e.vnode,i=Eh(e);by(e,a,i,t),wy(e,n,s||t);const l=i?$y(e,t):void 0;return t&&si(!1),l}function $y(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,ec);const{setup:a}=s;if(a){Pa();const n=e.setupContext=a.length>1?Oh(e):null,i=yi(e),l=bi(a,e,0,[e.props,n]),o=Pc(l);if(Ma(),i(),(o||e.sp)&&!La(e)&&Kc(e),o){if(l.then(nl,nl),t)return l.then(r=>{ic(e,r,t)}).catch(r=>{Rn(r,e,0)});e.asyncDep=l}else ic(e,l,t)}else Ih(e,t)}function ic(e,t,s){Me(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:lt(t)&&(e.setupState=zc(t)),Ih(e,s)}let go,lc;function Rh(e){go=e,lc=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Vb))}}const By=()=>!go;function Ih(e,t,s){const a=e.type;if(!e.render){if(!t&&go&&!a.render){const n=a.template||Qc(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=Ze(Ze({isCustomElement:i,delimiters:o},l),r);a.render=go(n,c)}}e.render=a.render||Qt,lc&&lc(e)}{const n=yi(e);Pa();try{ny(e)}finally{Ma(),n()}}}const Uy={get(e,t){return as(e,"get",""),e[t]}};function Oh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Uy),slots:e.slots,emit:e.emit,expose:t}}function _l(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(zc(Tf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Hi)return Hi[s](e)},has(t,s){return s in t||s in Hi}})):e.proxy}function oc(e,t=!0){return Me(e)?e.displayName||e.name:e.name||t&&e.__name}function Hy(e){return Me(e)&&"__vccOpts"in e}const j=(e,t)=>Kg(e,t,kn);function oi(e,t,s){try{al(-1);const a=arguments.length;return a===2?lt(t)&&!Re(t)?$a(t)?_t(e,null,[t]):_t(e,t):_t(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&$a(s)&&(s=[s]),_t(e,t,s))}finally{al(1)}}function zy(){}function jy(e,t,s,a){const n=s[a];if(n&&Lh(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function Lh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(qt(s[a],t[a]))return!1;return wn>0&&ns&&ns.push(e),!0}const Nh="3.5.38",Vy=Qt,qy=sb,Gy=jn,Ky=Df,Wy={createComponentInstance:Ch,setupComponent:Ah,renderComponentRoot:Zl,setCurrentRenderingInstance:Xi,isVNode:$a,normalizeVNode:bs,getComponentPublicInstance:_l,ensureValidVNode:Yc,pushWarningContext:Qg,popWarningContext:Xg},Jy=Wy,Zy=null,Yy=null,Qy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let rc;const du=typeof window<"u"&&window.trustedTypes;if(du)try{rc=du.createPolicy("vue",{createHTML:e=>e})}catch{}const Dh=rc?e=>rc.createHTML(e):e=>e,Xy="http://www.w3.org/2000/svg",ex="http://www.w3.org/1998/Math/MathML",wa=typeof document<"u"?document:null,uu=wa&&wa.createElement("template"),Ph={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?wa.createElementNS(Xy,e):t==="mathml"?wa.createElementNS(ex,e):s?wa.createElement(e,{is:s}):wa.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>wa.createTextNode(e),createComment:e=>wa.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>wa.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{uu.innerHTML=Dh(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=uu.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Va="transition",Si="animation",ri=Symbol("_vtc"),Mh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Fh=Ze({},Gc,Mh),tx=e=>(e.displayName="Transition",e.props=Fh,e),sx=tx((e,{slots:t})=>oi(jf,$h(e),t)),cn=(e,t=[])=>{Re(e)?e.forEach(s=>s(...t)):e&&e(...t)},pu=e=>e?Re(e)?e.some(t=>t.length>1):e.length>1:!1;function $h(e){const t={};for(const T in e)T in Mh||(t[T]=e[T]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=ax(n),v=m&&m[0],E=m&&m[1],{onBeforeEnter:I,onEnter:y,onEnterCancelled:g,onLeave:b,onLeaveCancelled:S,onBeforeAppear:_=I,onAppear:w=y,onAppearCancelled:k=g}=t,x=(T,M,V,G)=>{T._enterCancelled=G,Wa(T,M?d:o),Wa(T,M?c:l),V&&V()},O=(T,M)=>{T._isLeaving=!1,Wa(T,u),Wa(T,h),Wa(T,p),M&&M()},$=T=>(M,V)=>{const G=T?w:y,P=()=>x(M,T,V);cn(G,[M,P]),fu(()=>{Wa(M,T?r:i),aa(M,T?d:o),pu(G)||hu(M,a,v,P)})};return Ze(t,{onBeforeEnter(T){cn(I,[T]),aa(T,i),aa(T,l)},onBeforeAppear(T){cn(_,[T]),aa(T,r),aa(T,c)},onEnter:$(!1),onAppear:$(!0),onLeave(T,M){T._isLeaving=!0;const V=()=>O(T,M);aa(T,u),T._enterCancelled?(aa(T,p),cc(T)):(cc(T),aa(T,p)),fu(()=>{T._isLeaving&&(Wa(T,u),aa(T,h),pu(b)||hu(T,a,E,V))}),cn(b,[T,V])},onEnterCancelled(T){x(T,!1,void 0,!0),cn(g,[T])},onAppearCancelled(T){x(T,!0,void 0,!0),cn(k,[T])},onLeaveCancelled(T){O(T),cn(S,[T])}})}function ax(e){if(e==null)return null;if(lt(e))return[Er(e.enter),Er(e.leave)];{const t=Er(e);return[t,t]}}function Er(e){return no(e)}function aa(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ri]||(e[ri]=new Set)).add(t)}function Wa(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[ri];s&&(s.delete(t),s.size||(e[ri]=void 0))}function fu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let nx=0;function hu(e,t,s,a){const n=e._endId=++nx,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Bh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Bh(e,t){const s=window.getComputedStyle(e),a=m=>(s[m]||"").split(", "),n=a(`${Va}Delay`),i=a(`${Va}Duration`),l=mu(n,i),o=a(`${Si}Delay`),r=a(`${Si}Duration`),c=mu(o,r);let d=null,u=0,p=0;t===Va?l>0&&(d=Va,u=l,p=i.length):t===Si?c>0&&(d=Si,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Va:Si:null,p=d?d===Va?i.length:r.length:0);const h=d===Va&&/\b(?:transform|all)(?:,|$)/.test(a(`${Va}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function mu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>vu(s)+vu(e[a])))}function vu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function cc(e){return(e?e.ownerDocument:document).body.offsetHeight}function ix(e,t,s){const a=e[ri];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const bo=Symbol("_vod"),id=Symbol("_vsh"),Uh={name:"show",beforeMount(e,{value:t},{transition:s}){e[bo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ti(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),Ti(e,!0),a.enter(e)):a.leave(e,()=>{Ti(e,!1)}):Ti(e,t))},beforeUnmount(e,{value:t}){Ti(e,t)}};function Ti(e,t){e.style.display=t?e[bo]:"none",e[id]=!t}function lx(){Uh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Hh=Symbol("");function ox(e){const t=ps();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>yo(i,n))},a=()=>{const n=e(t.proxy);t.ce?yo(t.ce,n):dc(t.subTree,n),s(n)};Wc(()=>{Yi(a)}),Ge(()=>{Ft(a,Qt,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>n.disconnect())})}function dc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{dc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)yo(e.el,t);else if(e.type===Gt)e.children.forEach(s=>dc(s,t));else if(e.type===yn){let{el:s,anchor:a}=e;for(;s&&(yo(s,t),s!==a);)s=s.nextSibling}}function yo(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=fg(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Hh]=a}}const rx=/(?:^|;)\s*display\s*:/;function cx(e,t,s){const a=e.style,n=Ue(s);let i=!1;if(s&&!n){if(t)if(Ue(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&Mi(a,o,"")}else for(const l in t)s[l]==null&&Mi(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?ux(e,l,!Ue(t)&&t?t[l]:void 0,o)||Mi(a,l,o):Mi(a,l,"")}}else if(n){if(t!==s){const l=a[Hh];l&&(s+=";"+l),a.cssText=s,i=rx.test(s)}}else t&&e.removeAttribute("style");bo in e&&(e[bo]=i?a.display:"",e[id]&&(a.display="none"))}const gu=/\s*!important$/;function Mi(e,t,s){if(Re(s))s.forEach(a=>Mi(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=dx(e,t);gu.test(s)?e.setProperty(ys(a),s.replace(gu,""),"important"):e[a]=s}}const bu=["Webkit","Moz","ms"],Ar={};function dx(e,t){const s=Ar[t];if(s)return s;let a=vt(t);if(a!=="filter"&&a in e)return Ar[t]=a;a=An(a);for(let n=0;n<bu.length;n++){const i=bu[n]+a;if(i in e)return Ar[t]=i}return t}function ux(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ue(a)&&s===a}const yu="http://www.w3.org/1999/xlink";function xu(e,t,s,a,n,i=ug(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(yu,t.slice(6,t.length)):e.setAttributeNS(yu,t,s):s==null||i&&!nf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":ls(s)?String(s):s)}function _u(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Dh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=nf(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Ea(e,t,s,a){e.addEventListener(t,s,a)}function px(e,t,s,a){e.removeEventListener(t,s,a)}const wu=Symbol("_vei");function fx(e,t,s,a,n=null){const i=e[wu]||(e[wu]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=hx(t);if(a){const c=i[t]=gx(a,n);Ea(e,o,c,r)}else l&&(px(e,o,l,r),i[t]=void 0)}}const ku=/(?:Once|Passive|Capture)$/;function hx(e){let t;if(ku.test(e)){t={};let a;for(;a=e.match(ku);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ys(e.slice(2)),t]}let Rr=0;const mx=Promise.resolve(),vx=()=>Rr||(mx.then(()=>Rr=0),Rr=Date.now());function gx(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Re(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&As(c,t,5,o)}}else As(n,t,5,[a])};return s.value=e,s.attached=vx(),s}const Su=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,zh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?ix(e,a,l):t==="style"?cx(e,s,a):Cn(t)?Mo(t)||fx(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):bx(e,t,a,l))?(_u(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&xu(e,t,a,l,i,t!=="value")):e._isVueCE&&(yx(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ue(a)))?_u(e,vt(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),xu(e,t,a,l))};function bx(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&Su(t)&&Me(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return Su(t)&&Ue(s)?!1:t in e}function yx(e,t){const s=e._def.props;if(!s)return!1;const a=vt(t);return Array.isArray(s)?s.some(n=>vt(n)===a):Object.keys(s).some(n=>vt(n)===a)}const Tu={};function jh(e,t,s){let a=yl(e,t);Fo(a)&&(a=Ze({},a,t));class n extends er{constructor(l){super(a,l,s)}}return n.def=a,n}const xx=((e,t)=>jh(e,t,sm)),_x=typeof HTMLElement<"u"?HTMLElement:class{};class er extends _x{constructor(t,s={},a=wo){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==wo?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ze({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof er){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,It(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Re(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=no(this._props[r])),(o||(o=Object.create(null)))[vt(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)rt(this,a)||Object.defineProperty(this,a,{get:()=>ca(s[a])})}_resolveProps(t){const{props:s}=t,a=Re(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(vt))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):Tu;const n=vt(t);s&&this._numberProps&&this._numberProps[n]&&(a=no(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Tu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ys(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ys(t),s+""):s||this.removeAttribute(ys(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),tm(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=_t(this._def,Ze(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Fo(l[0])?Ze({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),ys(i)!==i&&n(ys(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Vh(e){const t=ps(),s=t&&t.ce;return s||null}function wx(){const e=Vh();return e&&e.shadowRoot}function kx(e="$style"){{const t=ps();if(!t)return Ye;const s=t.type.__cssModules;if(!s)return Ye;const a=s[e];return a||Ye}}const qh=new WeakMap,Gh=new WeakMap,xo=Symbol("_moveCb"),Cu=Symbol("_enterCb"),Sx=e=>(delete e.props.mode,e),Tx=Sx({name:"TransitionGroup",props:Ze({},Fh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=ps(),a=qc();let n,i;return Zo(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Ix(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(Ex),n.forEach(Ax);const o=n.filter(Rx);cc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;aa(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[xo]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[xo]=null,Wa(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=tt(e),o=$h(l);let r=l.tag||Gt;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[id]&&(n.push(d),Fa(d,li(d,o,a,s)),qh.set(d,Kh(d.el)))}i=t.default?Wo(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Fa(d,li(d,o,a,s))}return _t(r,null,i)}}}),Cx=Tx;function Ex(e){const t=e.el;t[xo]&&t[xo](),t[Cu]&&t[Cu]()}function Ax(e){Gh.set(e,Kh(e.el))}function Rx(e){const t=qh.get(e),s=Gh.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function Kh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Ix(e,t,s){const a=e.cloneNode(),n=e[ri];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Bh(a);return i.removeChild(a),l}const sn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Re(t)?s=>Qn(t,s):t};function Ox(e){e.target.composing=!0}function Eu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Us=Symbol("_assign");function Au(e,t,s){return t&&(e=e.trim()),s&&(e=Uo(e)),e}const _o={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[Us]=sn(n);const i=a||n.props&&n.props.type==="number";Ea(e,t?"change":"input",l=>{l.target.composing||e[Us](Au(e.value,s,i))}),(s||i)&&Ea(e,"change",()=>{e.value=Au(e.value,s,i)}),t||(Ea(e,"compositionstart",Ox),Ea(e,"compositionend",Eu),Ea(e,"change",Eu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[Us]=sn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Uo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},ld={deep:!0,created(e,t,s){e[Us]=sn(s),Ea(e,"change",()=>{const a=e._modelValue,n=ci(e),i=e.checked,l=e[Us];if(Re(a)){const o=zo(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(En(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(Jh(e,i))})},mounted:Ru,beforeUpdate(e,t,s){e[Us]=sn(s),Ru(e,t,s)}};function Ru(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Re(t))n=zo(t,a.props.value)>-1;else if(En(t))n=t.has(a.props.value);else{if(t===s)return;n=Da(t,Jh(e,!0))}e.checked!==n&&(e.checked=n)}const od={created(e,{value:t},s){e.checked=Da(t,s.props.value),e[Us]=sn(s),Ea(e,"change",()=>{e[Us](ci(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[Us]=sn(a),t!==s&&(e.checked=Da(t,a.props.value))}},Wh={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=En(t);Ea(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Uo(ci(l)):ci(l));e[Us](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,It(()=>{e._assigning=!1})}),e[Us]=sn(a)},mounted(e,{value:t}){Iu(e,t)},beforeUpdate(e,t,s){e[Us]=sn(s)},updated(e,{value:t}){e._assigning||Iu(e,t)}};function Iu(e,t){const s=e.multiple,a=Re(t);if(!(s&&!a&&!En(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=ci(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=zo(t,o)>-1}else l.selected=t.has(o);else if(Da(ci(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ci(e){return"_value"in e?e._value:e.value}function Jh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Zh={created(e,t,s){Bl(e,t,s,null,"created")},mounted(e,t,s){Bl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){Bl(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){Bl(e,t,s,a,"updated")}};function Yh(e,t){switch(e){case"SELECT":return Wh;case"TEXTAREA":return _o;default:switch(t){case"checkbox":return ld;case"radio":return od;default:return _o}}}function Bl(e,t,s,a,n){const l=Yh(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function Lx(){_o.getSSRProps=({value:e})=>({value:e}),od.getSSRProps=({value:e},t)=>{if(t.props&&Da(t.props.value,e))return{checked:!0}},ld.getSSRProps=({value:e},t)=>{if(Re(e)){if(t.props&&zo(e,t.props.value)>-1)return{checked:!0}}else if(En(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Zh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Yh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Nx=["ctrl","shift","alt","meta"],Dx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Nx.some(s=>e[`${s}Key`]&&!t.includes(s))},Px=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=Dx[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},Mx={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Fx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=ys(n.key);if(t.some(l=>l===i||Mx[l]===i))return e(n)}))},Qh=Ze({patchProp:zh},Ph);let ji,Ou=!1;function Xh(){return ji||(ji=ph(Qh))}function em(){return ji=Ou?ji:fh(Qh),Ou=!0,ji}const tm=((...e)=>{Xh().render(...e)}),$x=((...e)=>{em().hydrate(...e)}),wo=((...e)=>{const t=Xh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=nm(a);if(!n)return;const i=t._component;!Me(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,am(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),sm=((...e)=>{const t=em().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=nm(a);if(n)return s(n,!0,am(n))},t});function am(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function nm(e){return Ue(e)?document.querySelector(e):e}let Lu=!1;const Bx=()=>{Lu||(Lu=!0,Lx(),lx())},Ux=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:jf,BaseTransitionPropsValidators:Gc,Comment:Ot,DeprecationTypes:Qy,EffectScope:Mc,ErrorCodes:tb,ErrorTypeStrings:qy,Fragment:Gt,KeepAlive:Db,ReactiveEffect:Wi,Static:yn,Suspense:Cy,Teleport:vb,Text:en,TrackOpTypes:Wg,Transition:sx,TransitionGroup:Cx,TriggerOpTypes:Jg,VueElement:er,assertNumber:eb,callWithAsyncErrorHandling:As,callWithErrorHandling:bi,camelize:vt,capitalize:An,cloneVNode:ua,compatUtils:Yy,computed:j,createApp:wo,createBlock:mo,createCommentVNode:Sh,createElementBlock:Ly,createElementVNode:sd,createHydrationRenderer:fh,createPropsRestProxy:sy,createRenderer:ph,createSSRApp:sm,createSlots:Hb,createStaticVNode:Py,createTextVNode:ad,createVNode:_t,customRef:Ef,defineAsyncComponent:Lb,defineComponent:yl,defineCustomElement:jh,defineEmits:Gb,defineExpose:Kb,defineModel:Zb,defineOptions:Wb,defineProps:qb,defineSSRCustomElement:xx,defineSlots:Jb,devtools:Gy,effect:gg,effectScope:hg,getCurrentInstance:ps,getCurrentScope:cf,getCurrentWatcher:Zg,getTransitionRawChildren:Wo,guardReactiveProps:kh,h:oi,handleError:Rn,hasInjectionContext:cb,hydrate:$x,hydrateOnIdle:Cb,hydrateOnInteraction:Ib,hydrateOnMediaQuery:Rb,hydrateOnVisible:Ab,initCustomFormatter:zy,initDirectivesForSSR:Bx,inject:Bs,isMemoSame:Lh,isProxy:gl,isReactive:Oa,isReadonly:da,isRef:Mt,isRuntimeOnly:By,isShallow:_s,isVNode:$a,markRaw:Tf,mergeDefaults:ey,mergeModels:ty,mergeProps:Th,nextTick:It,nodeOps:Ph,normalizeClass:vl,normalizeProps:tg,normalizeStyle:ml,onActivated:Xt,onBeforeMount:Gf,onBeforeUnmount:Yo,onBeforeUpdate:Wc,onDeactivated:Vt,onErrorCaptured:Zf,onMounted:Ge,onRenderTracked:Jf,onRenderTriggered:Wf,onScopeDispose:mg,onServerPrefetch:Kf,onUnmounted:ft,onUpdated:Zo,onWatcherCleanup:Rf,openBlock:sl,patchProp:zh,popScopeId:lb,provide:Ui,proxyRefs:zc,pushScopeId:ib,queuePostFlushCb:Yi,reactive:an,readonly:lo,ref:f,registerRuntimeCompiler:Rh,render:tm,renderList:Ub,renderSlot:zb,resolveComponent:Fb,resolveDirective:Bb,resolveDynamicComponent:$b,resolveFilter:Zy,resolveTransitionHooks:li,setBlockTracking:al,setDevtoolsHook:Ky,setTransitionHooks:Fa,shallowReactive:Uc,shallowReadonly:Mg,shallowRef:Hc,ssrContextKey:Pf,ssrUtils:Jy,stop:bg,toDisplayString:of,toHandlerKey:Yn,toHandlers:jb,toRaw:tt,toRef:qg,toRefs:zg,toValue:Bg,transformVNodeArgs:Ny,triggerRef:$g,unref:ca,useAttrs:Xb,useCssModule:kx,useCssVars:ox,useHost:Vh,useId:bb,useModel:uy,useSSRContext:Mf,useShadowRoot:wx,useSlots:Qb,useTemplateRef:yb,useTransitionState:qc,vModelCheckbox:ld,vModelDynamic:Zh,vModelRadio:od,vModelSelect:Wh,vModelText:_o,vShow:Uh,version:Nh,warn:Vy,watch:Ft,watchEffect:db,watchPostEffect:ub,watchSyncEffect:Ff,withAsyncContext:ay,withCtx:Vc,withDefaults:Yb,withDirectives:rb,withKeys:Fx,withMemo:jy,withModifiers:Px,withScopeId:ob},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const il=Symbol(""),Vi=Symbol(""),rd=Symbol(""),ko=Symbol(""),im=Symbol(""),Sn=Symbol(""),lm=Symbol(""),om=Symbol(""),cd=Symbol(""),dd=Symbol(""),wl=Symbol(""),ud=Symbol(""),rm=Symbol(""),pd=Symbol(""),fd=Symbol(""),hd=Symbol(""),md=Symbol(""),vd=Symbol(""),gd=Symbol(""),cm=Symbol(""),dm=Symbol(""),tr=Symbol(""),So=Symbol(""),bd=Symbol(""),yd=Symbol(""),ll=Symbol(""),kl=Symbol(""),xd=Symbol(""),uc=Symbol(""),Hx=Symbol(""),pc=Symbol(""),To=Symbol(""),zx=Symbol(""),jx=Symbol(""),_d=Symbol(""),Vx=Symbol(""),qx=Symbol(""),wd=Symbol(""),um=Symbol(""),di={[il]:"Fragment",[Vi]:"Teleport",[rd]:"Suspense",[ko]:"KeepAlive",[im]:"BaseTransition",[Sn]:"openBlock",[lm]:"createBlock",[om]:"createElementBlock",[cd]:"createVNode",[dd]:"createElementVNode",[wl]:"createCommentVNode",[ud]:"createTextVNode",[rm]:"createStaticVNode",[pd]:"resolveComponent",[fd]:"resolveDynamicComponent",[hd]:"resolveDirective",[md]:"resolveFilter",[vd]:"withDirectives",[gd]:"renderList",[cm]:"renderSlot",[dm]:"createSlots",[tr]:"toDisplayString",[So]:"mergeProps",[bd]:"normalizeClass",[yd]:"normalizeStyle",[ll]:"normalizeProps",[kl]:"guardReactiveProps",[xd]:"toHandlers",[uc]:"camelize",[Hx]:"capitalize",[pc]:"toHandlerKey",[To]:"setBlockTracking",[zx]:"pushScopeId",[jx]:"popScopeId",[_d]:"withCtx",[Vx]:"unref",[qx]:"isRef",[wd]:"withMemo",[um]:"isMemoSame"};function Gx(e){Object.getOwnPropertySymbols(e).forEach(t=>{di[t]=e[t]})}const Is={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Kx(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Is}}function ol(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Is){return e&&(o?(e.helper(Sn),e.helper(fi(e.inSSR,c))):e.helper(pi(e.inSSR,c)),l&&e.helper(vd)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function xn(e,t=Is){return{type:17,loc:t,elements:e}}function $s(e,t=Is){return{type:15,loc:t,properties:e}}function Pt(e,t){return{type:16,loc:Is,key:Ue(e)?Ve(e,!0):e,value:t}}function Ve(e,t=!1,s=Is,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function Ws(e,t=Is){return{type:8,loc:t,children:e}}function jt(e,t=[],s=Is){return{type:14,loc:s,callee:e,arguments:t}}function ui(e,t=void 0,s=!1,a=!1,n=Is){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function fc(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Is}}function Wx(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Is}}function Jx(e){return{type:21,body:e,loc:Is}}function pi(e,t){return e||t?cd:dd}function fi(e,t){return e||t?lm:om}function kd(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(pi(a,e.isComponent)),t(Sn),t(fi(a,e.isComponent)))}const Nu=new Uint8Array([123,123]),Du=new Uint8Array([125,125]);function Pu(e){return e>=97&&e<=122||e>=65&&e<=90}function Cs(e){return e===32||e===10||e===9||e===12||e===13}function qa(e){return e===47||e===62||Cs(e)}function Co(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const es={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Zx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Nu,this.delimiterClose=Du,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Nu,this.delimiterClose=Du}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?qa(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Cs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===es.TitleEnd||this.currentSequence===es.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===es.Cdata[this.sequenceIndex]?++this.sequenceIndex===es.Cdata.length&&(this.state=28,this.currentSequence=es.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===es.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Pu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){qa(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(qa(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Co("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Cs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Pu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Cs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Cs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Cs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||qa(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||qa(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||qa(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||qa(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||qa(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Cs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Cs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Cs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=es.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===es.ScriptEnd[3]?this.startSpecial(es.ScriptEnd,4):t===es.StyleEnd[3]?this.startSpecial(es.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===es.TitleEnd[3]?this.startSpecial(es.TitleEnd,4):t===es.TextareaEnd[3]?this.startSpecial(es.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===es.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Mu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function _n(e,t){const s=Mu("MODE",t),a=Mu(e,t);return s===3?a===!0:a!==!1}function rl(e,t,s,...a){return _n(e,t)}function Sd(e){throw e}function pm(e){}function xt(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const xs=e=>e.type===4&&e.isStatic;function fm(e){switch(e){case"Teleport":case"teleport":return Vi;case"Suspense":case"suspense":return rd;case"KeepAlive":case"keep-alive":return ko;case"BaseTransition":case"base-transition":return im}}const Yx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Td=e=>!Yx.test(e),hm=/[A-Za-z_$\xA0-\uFFFF]/,Qx=/[\.\?\w$\xA0-\uFFFF]/,Xx=/\s+[.[]\s*|\s*[.[]\s+/g,mm=e=>e.type===4?e.content:e.loc.source,e0=e=>{const t=mm(e).trim().replace(Xx,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?hm:Qx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},vm=e0,t0=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,s0=e=>t0.test(mm(e)),a0=s0;function Fs(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(Ue(t)?n.name===t:t.test(n.name)))return n}}function sr(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&hn(i.arg,t))return i}}function hn(e,t){return!!(e&&xs(e)&&e.content===t)}function n0(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Ir(e){return e.type===5||e.type===2}function Fu(e){return e.type===7&&e.name==="pre"}function i0(e){return e.type===7&&e.name==="slot"}function Eo(e){return e.type===1&&e.tagType===3}function Ao(e){return e.type===1&&e.tagType===2}const l0=new Set([ll,kl]);function gm(e,t=[]){if(e&&!Ue(e)&&e.type===14){const s=e.callee;if(!Ue(s)&&l0.has(s))return gm(e.arguments[0],t.concat(e))}return[e,t]}function Ro(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!Ue(n)&&n.type===14){const o=gm(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||Ue(n))a=$s([t]);else if(n.type===14){const o=n.arguments[0];!Ue(o)&&o.type===15?$u(t,o)||o.properties.unshift(t):n.callee===xd?a=jt(s.helper(So),[$s([t]),n]):n.arguments.unshift($s([t])),!a&&(a=n)}else n.type===15?($u(t,n)||n.properties.unshift(t),a=n):(a=jt(s.helper(So),[$s([t]),n]),l&&l.callee===kl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function $u(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function cl(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function o0(e){return e.type===14&&e.callee===wd?e.arguments[1].returns:e}const r0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function bm(e){for(let t=0;t<e.length;t++)if(!Cs(e.charCodeAt(t)))return!1;return!0}function Cd(e){return e.type===2&&bm(e.content)||e.type===12&&Cd(e.content)}function ym(e){return e.type===3||Cd(e)}const xm={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Gn,isPreTag:Gn,isIgnoreNewlineTag:Gn,isCustomElement:Gn,onError:Sd,onWarn:pm,comments:!1,prefixIdentifiers:!1};let it=xm,dl=null,Na="",ss=null,Xe=null,ms="",_a=-1,un=-1,Ed=0,Ya=!1,hc=null;const yt=[],Et=new Zx(yt,{onerr:ba,ontext(e,t){Ul(Jt(e,t),e,t)},ontextentity(e,t,s){Ul(e,t,s)},oninterpolation(e,t){if(Ya)return Ul(Jt(e,t),e,t);let s=e+Et.delimiterOpen.length,a=t-Et.delimiterClose.length;for(;Cs(Na.charCodeAt(s));)s++;for(;Cs(Na.charCodeAt(a-1));)a--;let n=Jt(s,a);n.includes("&")&&(n=it.decodeEntities(n,!1)),mc({type:5,content:Xl(n,!1,Rt(s,a)),loc:Rt(e,t)})},onopentagname(e,t){const s=Jt(e,t);ss={type:1,tag:s,ns:it.getNamespace(s,yt[0],it.ns),tagType:0,props:[],children:[],loc:Rt(e-1,t),codegenNode:void 0}},onopentagend(e){Uu(e)},onclosetag(e,t){const s=Jt(e,t);if(!it.isVoidTag(s)){let a=!1;for(let n=0;n<yt.length;n++)if(yt[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&ba(24,yt[0].loc.start.offset);for(let l=0;l<=n;l++){const o=yt.shift();Ql(o,t,l<n)}break}a||ba(23,_m(e,60))}},onselfclosingtag(e){const t=ss.tag;ss.isSelfClosing=!0,Uu(e),yt[0]&&yt[0].tag===t&&Ql(yt.shift(),e)},onattribname(e,t){Xe={type:6,name:Jt(e,t),nameLoc:Rt(e,t),value:void 0,loc:Rt(e)}},ondirname(e,t){const s=Jt(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Ya&&a===""&&ba(26,e),Ya||a==="")Xe={type:6,name:s,nameLoc:Rt(e,t),value:void 0,loc:Rt(e)};else if(Xe={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ve("prop")]:[],loc:Rt(e)},a==="pre"){Ya=Et.inVPre=!0,hc=ss;const n=ss.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=b0(n[i]))}},ondirarg(e,t){if(e===t)return;const s=Jt(e,t);if(Ya&&!Fu(Xe))Xe.name+=s,mn(Xe.nameLoc,t);else{const a=s[0]!=="[";Xe.arg=Xl(a?s:s.slice(1,-1),a,Rt(e,t),a?3:0)}},ondirmodifier(e,t){const s=Jt(e,t);if(Ya&&!Fu(Xe))Xe.name+="."+s,mn(Xe.nameLoc,t);else if(Xe.name==="slot"){const a=Xe.arg;a&&(a.content+="."+s,mn(a.loc,t))}else{const a=Ve(s,!0,Rt(e,t));Xe.modifiers.push(a)}},onattribdata(e,t){ms+=Jt(e,t),_a<0&&(_a=e),un=t},onattribentity(e,t,s){ms+=e,_a<0&&(_a=t),un=s},onattribnameend(e){const t=Xe.loc.start.offset,s=Jt(t,e);Xe.type===7&&(Xe.rawName=s),ss.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&ba(2,t)},onattribend(e,t){if(ss&&Xe){if(mn(Xe.loc,t),e!==0)if(ms.includes("&")&&(ms=it.decodeEntities(ms,!0)),Xe.type===6)Xe.name==="class"&&(ms=km(ms).trim()),e===1&&!ms&&ba(13,t),Xe.value={type:2,content:ms,loc:e===1?Rt(_a,un):Rt(_a-1,un+1)},Et.inSFCRoot&&ss.tag==="template"&&Xe.name==="lang"&&ms&&ms!=="html"&&Et.enterRCDATA(Co("</template"),0);else{let s=0;Xe.exp=Xl(ms,!1,Rt(_a,un),0,s),Xe.name==="for"&&(Xe.forParseResult=d0(Xe.exp));let a=-1;Xe.name==="bind"&&(a=Xe.modifiers.findIndex(n=>n.content==="sync"))>-1&&rl("COMPILER_V_BIND_SYNC",it,Xe.loc,Xe.arg.loc.source)&&(Xe.name="model",Xe.modifiers.splice(a,1))}(Xe.type!==7||Xe.name!=="pre")&&ss.props.push(Xe)}ms="",_a=un=-1},oncomment(e,t){it.comments&&mc({type:3,content:Jt(e,t),loc:Rt(e-4,t+3)})},onend(){const e=Na.length;for(let t=0;t<yt.length;t++)Ql(yt[t],e-1),ba(24,yt[t].loc.start.offset)},oncdata(e,t){(yt[0]?yt[0].ns:it.ns)!==0?Ul(Jt(e,t),e,t):ba(1,e-9)},onprocessinginstruction(e){(yt[0]?yt[0].ns:it.ns)===0&&ba(21,e-1)}}),Bu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,c0=/^\(|\)$/g;function d0(e){const t=e.loc,s=e.content,a=s.match(r0);if(!a)return;const[,n,i]=a,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return Xl(u,!1,Rt(m,v),0,h?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(c0,"").trim();const c=n.indexOf(r),d=r.match(Bu);if(d){r=r.replace(Bu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(o.index=l(h,s.indexOf(h,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Jt(e,t){return Na.slice(e,t)}function Uu(e){Et.inSFCRoot&&(ss.innerLoc=Rt(e+1,e+1)),mc(ss);const{tag:t,ns:s}=ss;s===0&&it.isPreTag(t)&&Ed++,it.isVoidTag(t)?Ql(ss,e):(yt.unshift(ss),(s===1||s===2)&&(Et.inXML=!0)),ss=null}function Ul(e,t,s){{const i=yt[0]&&yt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=it.decodeEntities(e,!1))}const a=yt[0]||dl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,mn(n.loc,s)):a.children.push({type:2,content:e,loc:Rt(t,s)})}function Ql(e,t,s=!1){s?mn(e.loc,_m(t,60)):mn(e.loc,u0(t,62)+1),Et.inSFCRoot&&(e.children.length?e.innerLoc.end=Ze({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ze({},e.innerLoc.start),e.innerLoc.source=Jt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(Ya||(a==="slot"?e.tagType=2:Hu(e)?e.tagType=3:f0(e)&&(e.tagType=1)),Et.inRCDATA||(e.children=wm(i)),n===0&&it.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&it.isPreTag(a)&&Ed--,hc===e&&(Ya=Et.inVPre=!1,hc=null),Et.inXML&&(yt[0]?yt[0].ns:it.ns)===0&&(Et.inXML=!1);{const l=e.props;if(!Et.inSFCRoot&&_n("COMPILER_NATIVE_TEMPLATE",it)&&e.tag==="template"&&!Hu(e)){const r=yt[0]||dl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&rl("COMPILER_INLINE_TEMPLATE",it,o.loc)&&e.children.length&&(o.value={type:2,content:Jt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function u0(e,t){let s=e;for(;Na.charCodeAt(s)!==t&&s<Na.length-1;)s++;return s}function _m(e,t){let s=e;for(;Na.charCodeAt(s)!==t&&s>=0;)s--;return s}const p0=new Set(["if","else","else-if","for","slot"]);function Hu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&p0.has(t[s].name))return!0}return!1}function f0({tag:e,props:t}){if(it.isCustomElement(e))return!1;if(e==="component"||h0(e.charCodeAt(0))||fm(e)||it.isBuiltInComponent&&it.isBuiltInComponent(e)||it.isNativeTag&&!it.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(rl("COMPILER_IS_ON_ELEMENT",it,a.loc))return!0}}else if(a.name==="bind"&&hn(a.arg,"is")&&rl("COMPILER_IS_ON_ELEMENT",it,a.loc))return!0}return!1}function h0(e){return e>64&&e<91}const m0=/\r\n/g;function wm(e){const t=it.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(Ed)n.content=n.content.replace(m0,`
`);else if(bm(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&v0(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=km(n.content))}return s?e.filter(Boolean):e}function v0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function km(e){let t="",s=!1;for(let a=0;a<e.length;a++)Cs(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function mc(e){(yt[0]||dl).children.push(e)}function Rt(e,t){return{start:Et.getPos(e),end:t==null?t:Et.getPos(t),source:t==null?t:Jt(e,t)}}function g0(e){return Rt(e.start.offset,e.end.offset)}function mn(e,t){e.end=Et.getPos(t),e.source=Jt(e.start.offset,t)}function b0(e){const t={type:6,name:e.rawName,nameLoc:Rt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Xl(e,t=!1,s,a=0,n=0){return Ve(e,t,s,a)}function ba(e,t,s){it.onError(xt(e,Rt(t,t)))}function y0(){Et.reset(),ss=null,Xe=null,ms="",_a=-1,un=-1,yt.length=0}function x0(e,t){if(y0(),Na=e,it=Ze({},xm),t){let n;for(n in t)t[n]!=null&&(it[n]=t[n])}Et.mode=it.parseMode==="html"?1:it.parseMode==="sfc"?2:0,Et.inXML=it.ns===1||it.ns===2;const s=t&&t.delimiters;s&&(Et.delimiterOpen=Co(s[0]),Et.delimiterClose=Co(s[1]));const a=dl=Kx([],e);return Et.parse(Na),a.loc=Rt(0,e.length),a.children=wm(a.children),dl=null,a}function _0(e,t){eo(e,void 0,t,!!Sm(e))}function Sm(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Ao(t[0])?t[0]:null}function eo(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Es(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&Cm(u,s)>=2){const v=Em(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(a?0:Es(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,eo(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)eo(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)eo(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Re(e.codegenNode.children))e.codegenNode.children=r(xn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Re(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(xn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Re(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Fs(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(xn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Re(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Es(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=Cm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Es(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Es(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Sn),t.removeHelper(fi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(pi(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Es(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Ue(o)||ls(o))continue;const r=Es(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const w0=new Set([bd,yd,ll,kl]);function Tm(e,t){if(e.type===14&&!Ue(e.callee)&&w0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Es(s,t);if(s.type===14)return Tm(s,t)}return 0}function Cm(e,t){let s=3;const a=Em(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Es(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Es(o,t):o.type===14?c=Tm(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Em(e){const t=e.codegenNode;if(t.type===13)return t.props}function k0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Qt,isCustomElement:d=Qt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:E="",bindingMetadata:I=Ye,inline:y=!1,isTS:g=!1,onError:b=Sd,onWarn:S=pm,compatConfig:_}){const w=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),k={filename:t,selfName:w&&An(vt(w[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:E,bindingMetadata:I,inline:y,isTS:g,onError:b,onWarn:S,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(x){const O=k.helpers.get(x)||0;return k.helpers.set(x,O+1),x},removeHelper(x){const O=k.helpers.get(x);if(O){const $=O-1;$?k.helpers.set(x,$):k.helpers.delete(x)}},helperString(x){return`_${di[k.helper(x)]}`},replaceNode(x){k.parent.children[k.childIndex]=k.currentNode=x},removeNode(x){const O=k.parent.children,$=x?O.indexOf(x):k.currentNode?k.childIndex:-1;!x||x===k.currentNode?(k.currentNode=null,k.onNodeRemoved()):k.childIndex>$&&(k.childIndex--,k.onNodeRemoved()),k.parent.children.splice($,1)},onNodeRemoved:Qt,addIdentifiers(x){},removeIdentifiers(x){},hoist(x){Ue(x)&&(x=Ve(x)),k.hoists.push(x);const O=Ve(`_hoisted_${k.hoists.length}`,!1,x.loc,2);return O.hoisted=x,O},cache(x,O=!1,$=!1){const T=Wx(k.cached.length,x,O,$);return k.cached.push(T),T}};return k.filters=new Set,k}function S0(e,t){const s=k0(e,t);ar(e,s),t.hoistStatic&&_0(e,s),t.ssr||T0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function T0(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=Sm(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&kd(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=ol(t,s(il),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function C0(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];Ue(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,ar(n,t))}}function ar(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Re(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(wl);break;case 5:t.ssr||t.helper(tr);break;case 9:for(let i=0;i<e.branches.length;i++)ar(e.branches[i],t);break;case 10:case 11:case 1:case 0:C0(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function Am(e,t){const s=Ue(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(i0))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const nr="/*@__PURE__*/",Rm=e=>`${di[e]}: _${di[e]}`;function E0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${di[v]}`},push(v,E=-2,I){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function A0(e,t={}){const s=E0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&a!=="module";R0(e,s);const v=d?"ssrRender":"render",I=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${v}(${I}) {`),l(),h&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(Rm).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(Or(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(Or(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),Or(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let y=0;y<e.temps;y++)n(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?is(e.codegenNode,s):n("null"),h&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function R0(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[cd,dd,wl,ud,rm].filter(p=>d.includes(p)).map(Rm).join(", ");n(`const { ${u} } = _Vue
`,-1)}I0(e.hoists,t),i(),n("return ")}function Or(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?md:t==="component"?pd:hd);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${cl(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function I0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),is(i,t),a())}t.pure=!1}function Ad(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Sl(e,t,s),s&&t.deindent(),t.push("]")}function Sl(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Ue(o)?n(o,-3):Re(o)?Ad(o,t):is(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function is(e,t){if(Ue(e)){t.push(e,-3);return}if(ls(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:is(e.codegenNode,t);break;case 2:O0(e,t);break;case 4:Im(e,t);break;case 5:L0(e,t);break;case 12:is(e.codegenNode,t);break;case 8:Om(e,t);break;case 3:D0(e,t);break;case 13:P0(e,t);break;case 14:F0(e,t);break;case 15:$0(e,t);break;case 17:B0(e,t);break;case 18:U0(e,t);break;case 19:H0(e,t);break;case 20:z0(e,t);break;case 21:Sl(e.body,t,!0,!1);break}}function O0(e,t){t.push(JSON.stringify(e.content),-3,e)}function Im(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function L0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(nr),s(`${a(tr)}(`),is(e.content,t),s(")")}function Om(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];Ue(a)?t.push(a,-3):is(a,t)}}function N0(e,t){const{push:s}=t;if(e.type===8)s("["),Om(e,t),s("]");else if(e.isStatic){const a=Td(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function D0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(nr),s(`${a(wl)}(${JSON.stringify(e.content)})`,-3,e)}function P0(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;r&&(m=String(r)),d&&s(a(vd)+"("),u&&s(`(${a(Sn)}(${p?"true":""}), `),n&&s(nr);const v=u?fi(t.inSSR,h):pi(t.inSSR,h);s(a(v)+"(",-2,e),Sl(M0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),is(d,t),s(")"))}function M0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function F0(e,t){const{push:s,helper:a,pure:n}=t,i=Ue(e.callee)?e.callee:a(e.callee);n&&s(nr),s(i+"(",-2,e),Sl(e.arguments,t),s(")")}function $0(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];N0(c,t),s(": "),is(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function B0(e,t){Ad(e.elements,t)}function U0(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${di[_d]}(`),s("(",-2,e),Re(i)?Sl(i,t):i&&is(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Re(l)?Ad(l,t):is(l,t)):o&&is(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function H0(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!Td(s.content);u&&l("("),Im(s,t),u&&l(")")}else l("("),is(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),is(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,is(n,t),d||t.indentLevel--,i&&r(!0)}function z0(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(To)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),is(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(To)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const j0=Am(/^(?:if|else|else-if)$/,(e,t,s)=>V0(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=ju(n,r,s);else{const c=q0(a.codegenNode);c.alternate=ju(n,r+a.branches.length-1,s)}}}));function V0(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(xt(28,t.loc)),t.exp=Ve("true",!1,n)}if(t.name==="if"){const n=zu(e,t),i={type:9,loc:g0(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&ym(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(xt(30,e.loc)),s.removeNode();const o=zu(e,t);l.branches.push(o);const r=a&&a(l,o,!1);ar(o,s),r&&r(),s.currentNode=null}else s.onError(xt(30,e.loc));break}}}function zu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Fs(e,"for")?e.children:[e],userKey:sr(e,"key"),isTemplateIf:s}}function ju(e,t,s){return e.condition?fc(e.condition,Vu(e,t,s),jt(s.helper(wl),['""',"true"])):Vu(e,t,s)}function Vu(e,t,s){const{helper:a}=s,n=Pt("key",Ve(`${t}`,!1,Is,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return Ro(r,n,s),r}else return ol(s,a(il),$s([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=o0(r);return c.type===13&&kd(c,s),Ro(c,n,s),r}}function q0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const G0=Am("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return K0(e,t,s,i=>{const l=jt(a(gd),[i.source]),o=Eo(e),r=Fs(e,"memo"),c=sr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ve(c.value.content,!0):void 0:c.exp);const u=d?Pt("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=ol(s,a(il),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,E=v.length!==1||v[0].type!==1,I=Ao(e)?e:o&&e.children.length===1&&Ao(e.children[0])?e.children[0]:null;if(I?(m=I.codegenNode,o&&u&&Ro(m,u,s)):E?m=ol(s,a(il),u?$s([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&Ro(m,u,s),m.isBlock!==!p&&(m.isBlock?(n(Sn),n(fi(s.inSSR,m.isComponent))):n(pi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(a(Sn),a(fi(s.inSSR,m.isComponent))):a(pi(s.inSSR,m.isComponent))),r){const y=ui(vc(i.parseResult,[Ve("_cached")]));y.body=Jx([Ws(["const _memo = (",r.exp,")"]),Ws(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(um)}(_cached, _memo)) return _cached`]),Ws(["const _item = ",m]),Ve("_item.memo = _memo"),Ve("return _item")]),l.arguments.push(y,Ve("_cache"),Ve(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ui(vc(i.parseResult),m,!0))}})});function K0(e,t,s,a){if(!t.exp){s.onError(xt(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(xt(32,t.loc));return}Lm(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:Eo(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const h=a&&a(p);return()=>{o.vFor--,h&&h()}}function Lm(e,t){e.finalized||(e.finalized=!0)}function vc({value:e,key:t,index:s},a=[]){return W0([e,t,s,...a])}function W0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ve("_".repeat(a+1),!1))}const qu=Ve("undefined",!1),J0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Fs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Z0=(e,t,s,a)=>ui(e,s,!1,!0,s.length?s[0].loc:a);function Y0(e,t,s=Z0){t.helper(_d);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Fs(e,"slot",!0);if(r){const{arg:E,exp:I}=r;E&&!xs(E)&&(o=!0),i.push(Pt(E||Ve("default",!0),s(I,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let E=0;E<a.length;E++){const I=a[E];let y;if(!Eo(I)||!(y=Fs(I,"slot",!0))){I.type!==3&&u.push(I);continue}if(r){t.onError(xt(37,y.loc));break}c=!0;const{children:g,loc:b}=I,{arg:S=Ve("default",!0),exp:_,loc:w}=y;let k;xs(S)?k=S?S.content:"default":o=!0;const x=Fs(I,"for"),O=s(_,x,g,b);let $,T;if($=Fs(I,"if"))o=!0,l.push(fc($.exp,Hl(S,O,h++),qu));else if(T=Fs(I,/^else(?:-if)?$/,!0)){let M=E,V;for(;M--&&(V=a[M],!!ym(V)););if(V&&Eo(V)&&Fs(V,/^(?:else-)?if$/)){let G=l[l.length-1];for(;G.alternate.type===19;)G=G.alternate;G.alternate=T.exp?fc(T.exp,Hl(S,O,h++),qu):Hl(S,O,h++)}else t.onError(xt(30,T.loc))}else if(x){o=!0;const M=x.forParseResult;M?(Lm(M),l.push(jt(t.helper(gd),[M.source,ui(vc(M),Hl(S,O),!0)]))):t.onError(xt(32,x.loc))}else{if(k){if(p.has(k)){t.onError(xt(38,w));continue}p.add(k),k==="default"&&(d=!0)}i.push(Pt(S,O))}}if(!r){const E=(I,y)=>{const g=s(I,void 0,y,n);return t.compatConfig&&(g.isNonScopedSlot=!0),Pt("default",g)};c?u.length&&!u.every(Cd)&&(d?t.onError(xt(39,u[0].loc)):i.push(E(void 0,u))):i.push(E(void 0,a))}const m=o?2:to(e.children)?3:1;let v=$s(i.concat(Pt("_",Ve(m+"",!1))),n);return l.length&&(v=jt(t.helper(dm),[v,xn(l)])),{slots:v,hasDynamicSlots:o}}function Hl(e,t,s){const a=[Pt("name",e),Pt("fn",t)];return s!=null&&a.push(Pt("key",Ve(String(s),!0))),$s(a)}function to(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||to(s.children))return!0;break;case 9:if(to(s.branches))return!0;break;case 10:case 11:if(to(s.children))return!0;break}}return!1}const Nm=new WeakMap,Q0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?X0(e,t):`"${a}"`;const o=lt(l)&&l.callee===fd;let r,c,d=0,u,p,h,m=o||l===Vi||l===rd||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const v=Dm(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const E=v.directives;h=E&&E.length?xn(E.map(I=>t_(I,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===ko&&(m=!0,d|=1024),i&&l!==Vi&&l!==ko){const{slots:E,hasDynamicSlots:I}=Y0(e,t);c=E,I&&(d|=1024)}else if(e.children.length===1&&l!==Vi){const E=e.children[0],I=E.type,y=I===5||I===8;y&&Es(E,t)===0&&(d|=1),y||I===2?c=E:c=e.children}else c=e.children;p&&p.length&&(u=s_(p)),e.codegenNode=ol(t,l,r,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function X0(e,t,s=!1){let{tag:a}=e;const n=gc(a),i=sr(e,"is",!1,!0);if(i)if(n||_n("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ve(i.value.content,!0):(o=i.exp,o||(o=Ve("is",!1,i.arg.loc))),o)return jt(t.helper(fd),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=fm(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(pd),t.components.add(a),cl(a,"component"))}function Dm(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let h=!1,m=0,v=!1,E=!1,I=!1,y=!1,g=!1,b=!1;const S=[],_=O=>{c.length&&(d.push($s(Gu(c),o)),c=[]),O&&d.push(O)},w=()=>{t.scopes.vFor>0&&c.push(Pt(Ve("ref_for",!0),Ve("true")))},k=({key:O,value:$})=>{if(xs(O)){const T=O.content,M=Cn(T);if(M&&(!a||n)&&T.toLowerCase()!=="onclick"&&T!=="onUpdate:modelValue"&&!Ia(T)&&(y=!0),M&&Ia(T)&&(b=!0),M&&$.type===14&&($=$.arguments[0]),$.type===20||($.type===4||$.type===8)&&Es($,t)>0)return;T==="ref"?v=!0:T==="class"?E=!0:T==="style"?I=!0:T!=="key"&&!S.includes(T)&&S.push(T),a&&(T==="class"||T==="style")&&!S.includes(T)&&S.push(T)}else g=!0};for(let O=0;O<s.length;O++){const $=s[O];if($.type===6){const{loc:T,name:M,nameLoc:V,value:G}=$;let P=!0;if(M==="ref"&&(v=!0,w()),M==="is"&&(gc(l)||G&&G.content.startsWith("vue:")||_n("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Pt(Ve(M,!0,V),Ve(G?G.content:"",P,G?G.loc:T)))}else{const{name:T,arg:M,exp:V,loc:G,modifiers:P}=$,L=T==="bind",N=T==="on";if(T==="slot"){a||t.onError(xt(40,G));continue}if(T==="once"||T==="memo"||T==="is"||L&&hn(M,"is")&&(gc(l)||_n("COMPILER_IS_ON_ELEMENT",t))||N&&i)continue;if((L&&hn(M,"key")||N&&p&&hn(M,"vue:before-update"))&&(h=!0),L&&hn(M,"ref")&&w(),!M&&(L||N)){if(g=!0,V)if(L){if(_(),_n("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(V);continue}w(),_(),d.push(V)}else _({type:14,loc:G,callee:t.helper(xd),arguments:a?[V]:[V,"true"]});else t.onError(xt(L?34:35,G));continue}L&&P.some(le=>le.content==="prop")&&(m|=32);const te=t.directiveTransforms[T];if(te){const{props:le,needRuntime:B}=te($,e,t);!i&&le.forEach(k),N&&M&&!xs(M)?_($s(le,o)):c.push(...le),B&&(u.push($),ls(B)&&Nm.set($,B))}else Gv(T)||(u.push($),p&&(h=!0))}}let x;if(d.length?(_(),d.length>1?x=jt(t.helper(So),d,o):x=d[0]):c.length&&(x=$s(Gu(c),o)),g?m|=16:(E&&!a&&(m|=2),I&&!a&&(m|=4),S.length&&(m|=8),y&&(m|=32)),!h&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&x)switch(x.type){case 15:let O=-1,$=-1,T=!1;for(let G=0;G<x.properties.length;G++){const P=x.properties[G].key;xs(P)?P.content==="class"?O=G:P.content==="style"&&($=G):P.isHandlerKey||(T=!0)}const M=x.properties[O],V=x.properties[$];T?x=jt(t.helper(ll),[x]):(M&&!xs(M.value)&&(M.value=jt(t.helper(bd),[M.value])),V&&(I||V.value.type===4&&V.value.content.trim()[0]==="["||V.value.type===17)&&(V.value=jt(t.helper(yd),[V.value])));break;case 14:break;default:x=jt(t.helper(ll),[jt(t.helper(kl),[x])]);break}return{props:x,directives:u,patchFlag:m,dynamicPropNames:S,shouldUseBlock:h}}function Gu(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Cn(i))&&e_(l,n):(t.set(i,n),s.push(n))}return s}function e_(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=xn([e.value,t.value],e.loc)}function t_(e,t){const s=[],a=Nm.get(e);a?s.push(t.helperString(a)):(t.helper(hd),t.directives.add(e.name),s.push(cl(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ve("true",!1,n);s.push($s(e.modifiers.map(l=>Pt(l,i)),n))}return xn(s,e.loc)}function s_(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function gc(e){return e==="component"||e==="Component"}const a_=(e,t)=>{if(Ao(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=n_(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=ui([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=jt(t.helper(cm),l,a)}};function n_(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=vt(l.name),n.push(l)));else if(l.name==="bind"&&hn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=vt(l.arg.content);s=l.exp=Ve(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&xs(l.arg)&&(l.arg.content=vt(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=Dm(e,t,n,!1,!1);a=i,l.length&&t.onError(xt(36,l[0].loc))}return{slotName:s,slotProps:a}}const Pm=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(xt(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Yn(vt(u)):`on:${u}`;o=Ve(p,!0,l.loc)}else o=Ws([`${s.helperString(pc)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(pc)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=vm(r),p=!(u||a0(r)),h=r.content.includes(";");(p||c&&u)&&(r=Ws([`${p?"$event":"(...args)"} => ${h?"{":"("}`,r,h?"}":")"]))}let d={props:[Pt(o,r||Ve("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},i_=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=vt(i.content):i.content=`${s.helperString(uc)}(${i.content})`:(i.children.unshift(`${s.helperString(uc)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&Ku(i,"."),a.some(o=>o.content==="attr")&&Ku(i,"^")),{props:[Pt(i,l)]}},Ku=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},l_=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Ir(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(Ir(r))a||(a=s[i]=Ws([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Ir(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Es(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:jt(t.helper(ud),o)}}}}},Wu=new WeakSet,o_=(e,t)=>{if(e.type===1&&Fs(e,"once",!0))return Wu.has(e)||t.inVOnce||t.inSSR?void 0:(Wu.add(e),t.inVOnce=!0,t.helper(To),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Mm=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(xt(41,e.loc)),Ci();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(xt(44,a.loc)),Ci();if(o==="literal-const"||o==="setup-const")return s.onError(xt(45,a.loc)),Ci();if(!l.trim()||!vm(a))return s.onError(xt(42,a.loc)),Ci();const r=n||Ve("modelValue",!0),c=n?xs(n)?`onUpdate:${vt(n.content)}`:Ws(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ws([`${u} => ((`,a,") = $event)"]);const p=[Pt(r,e.exp),Pt(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(Td(v)?v:JSON.stringify(v))+": true").join(", "),m=n?xs(n)?`${n.content}Modifiers`:Ws([n,' + "Modifiers"']):"modelModifiers";p.push(Pt(m,Ve(`{ ${h} }`,!1,e.loc,2)))}return Ci(p)};function Ci(e=[]){return{props:e}}const r_=/[\w).+\-_$\]]/,c_=(e,t)=>{_n("COMPILER_FILTERS",t)&&(e.type===5?Io(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Io(s.exp,t)}))};function Io(e,t){if(e.type===4)Ju(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?Ju(a,t):a.type===8?Io(e,t):a.type===5&&Io(a.content,t))}}function Ju(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!o&&!r&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):E();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let I=h-1,y;for(;I>=0&&(y=s.charAt(I),y===" ");I--);(!y||!r_.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&E();function E(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=d_(m,v[h],t);e.content=m,e.ast=void 0}}function d_(e,t,s){s.helper(md);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${cl(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${cl(n,"filter")}(${e}${i!==")"?","+i:i}`}}const Zu=new WeakSet,u_=(e,t)=>{if(e.type===1){const s=Fs(e,"memo");return!s||Zu.has(e)||t.inSSR?void 0:(Zu.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&kd(a,t),e.codegenNode=jt(t.helper(wd),[s.exp,ui(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},p_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(xt(53,a.loc)),s.exp=Ve("",!0,a.loc);else{const n=vt(a.content);(hm.test(n[0])||n[0]==="-")&&(s.exp=Ve(n,!1,a.loc))}}}};function f_(e){return[[p_,o_,j0,u_,G0,c_,a_,Q0,J0,l_],{on:Pm,bind:i_,model:Mm}]}function h_(e,t={}){const s=t.onError||Sd,a=t.mode==="module";t.prefixIdentifiers===!0?s(xt(48)):a&&s(xt(49));const n=!1;t.cacheHandlers&&s(xt(50)),t.scopeId&&!a&&s(xt(51));const i=Ze({},t,{prefixIdentifiers:n}),l=Ue(e)?x0(e,i):e,[o,r]=f_();return S0(l,Ze({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:Ze({},r,t.directiveTransforms||{})})),A0(l,i)}const m_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Fm=Symbol(""),$m=Symbol(""),Bm=Symbol(""),Um=Symbol(""),bc=Symbol(""),Hm=Symbol(""),zm=Symbol(""),jm=Symbol(""),Vm=Symbol(""),qm=Symbol("");Gx({[Fm]:"vModelRadio",[$m]:"vModelCheckbox",[Bm]:"vModelText",[Um]:"vModelSelect",[bc]:"vModelDynamic",[Hm]:"withModifiers",[zm]:"withKeys",[jm]:"vShow",[Vm]:"Transition",[qm]:"TransitionGroup"});let $n;function v_(e,t=!1){return $n||($n=document.createElement("div")),t?($n.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,$n.children[0].getAttribute("foo")):($n.innerHTML=e,$n.textContent)}const g_={parseMode:"html",isVoidTag:cg,isNativeTag:e=>lg(e)||og(e)||rg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:v_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Vm;if(e==="TransitionGroup"||e==="transition-group")return qm},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},b_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ve("style",!0,t.loc),exp:y_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},y_=(e,t)=>{const s=af(e);return Ve(JSON.stringify(s),!1,t,3)};function tn(e,t){return xt(e,t)}const x_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(54,n)),t.children.length&&(s.onError(tn(55,n)),t.children.length=0),{props:[Pt(Ve("innerHTML",!0,n),a||Ve("",!0))]}},__=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(56,n)),t.children.length&&(s.onError(tn(57,n)),t.children.length=0),{props:[Pt(Ve("textContent",!0),a?Es(a,s)>0?a:jt(s.helperString(tr),[a],n):Ve("",!0))]}},w_=(e,t,s)=>{const a=Mm(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(tn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Bm,o=!1;if(n==="input"||i){const r=sr(t,"type");if(r){if(r.type===7)l=bc;else if(r.value)switch(r.value.content){case"radio":l=Fm;break;case"checkbox":l=$m;break;case"file":o=!0,s.onError(tn(60,e.loc));break}}else n0(t)&&(l=bc)}else n==="select"&&(l=Um);o||(a.needRuntime=s.helper(l))}else s.onError(tn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},k_=Rs("passive,once,capture"),S_=Rs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),T_=Rs("left,right"),Gm=Rs("onkeyup,onkeydown,onkeypress"),C_=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&rl("COMPILER_V_ON_NATIVE",s)||k_(r)?l.push(r):T_(r)?xs(e)?Gm(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):S_(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},Yu=(e,t)=>xs(e)&&e.content.toLowerCase()==="onclick"?Ve(t,!0):e.type!==4?Ws(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,E_=(e,t,s)=>Pm(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=C_(i,n,s,e.loc);if(r.includes("right")&&(i=Yu(i,"onContextmenu")),r.includes("middle")&&(i=Yu(i,"onMouseup")),r.length&&(l=jt(s.helper(Hm),[l,JSON.stringify(r)])),o.length&&(!xs(i)||Gm(i.content.toLowerCase()))&&(l=jt(s.helper(zm),[l,JSON.stringify(o)])),c.length){const d=c.map(An).join("");i=xs(i)?Ve(`${i.content}${d}`,!0):Ws(["(",i,`) + "${d}"`])}return{props:[Pt(i,l)]}}),A_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(62,n)),{props:[],needRuntime:s.helper(jm)}},R_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},I_=[b_],O_={cloak:m_,html:x_,text:__,model:w_,on:E_,show:A_};function L_(e,t={}){return h_(e,Ze({},g_,t,{nodeTransforms:[R_,...I_,...t.nodeTransforms||[]],directiveTransforms:Ze({},O_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Qu=Object.create(null);function N_(e,t){if(!Ue(e))if(e.nodeType)e=e.innerHTML;else return Qt;const s=Jv(e,t),a=Qu[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=Ze({hoistStatic:!0,onError:void 0,onWarn:Qt},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=L_(e,n),l=new Function("Vue",i)(Ux);return l._rc=!0,Qu[s]=l}Rh(N_);const Oo=an({items:[]});let D_=1;function ir(e,t="info",s=3e3){const a=D_++;return Oo.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>Rd(a),s),a}function Rd(e){const t=Oo.items.findIndex(s=>s.id===e);t>=0&&Oo.items.splice(t,1)}function we(e,t="info",s=3e3){return ir(e,t,s)}we.success=(e,t=3e3)=>ir(e,"success",t);we.error=(e,t=5e3)=>ir(e,"error",t);we.info=(e,t=3e3)=>ir(e,"info",t);we.dismiss=Rd;const P_={setup(){return{state:Oo,dismiss:Rd}},template:`
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
  `},Sa=an({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ai=null;function Kt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return ai&&ai(!1),Sa.title=e,Sa.message=t,Sa.confirmLabel=s,Sa.cancelLabel=a,Sa.danger=n,Sa.open=!0,new Promise(i=>{ai=i})}function Xu(e){Sa.open=!1,ai&&(ai(e),ai=null)}const M_={setup(){function e(t){Sa.open&&t.key==="Escape"&&(t.stopPropagation(),Xu(!1))}return Ge(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:Sa,settle:Xu}},template:`
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
 */const Vn=typeof document<"u";function Km(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function F_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Km(e.default)}const ut=Object.assign;function Lr(e,t){const s={};for(const a in t){const n=t[a];s[a]=Zs(n)?n.map(e):e(n)}return s}const qi=()=>{},Zs=Array.isArray;function ep(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const Wm=/#/g,$_=/&/g,B_=/\//g,U_=/=/g,H_=/\?/g,Jm=/\+/g,z_=/%5B/g,j_=/%5D/g,Zm=/%5E/g,V_=/%60/g,Ym=/%7B/g,q_=/%7C/g,Qm=/%7D/g,G_=/%20/g;function Id(e){return e==null?"":encodeURI(""+e).replace(q_,"|").replace(z_,"[").replace(j_,"]")}function K_(e){return Id(e).replace(Ym,"{").replace(Qm,"}").replace(Zm,"^")}function yc(e){return Id(e).replace(Jm,"%2B").replace(G_,"+").replace(Wm,"%23").replace($_,"%26").replace(V_,"`").replace(Ym,"{").replace(Qm,"}").replace(Zm,"^")}function W_(e){return yc(e).replace(U_,"%3D")}function J_(e){return Id(e).replace(Wm,"%23").replace(H_,"%3F")}function Z_(e){return J_(e).replace(B_,"%2F")}function ul(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Y_=/\/$/,Q_=e=>e.replace(Y_,"");function Nr(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=sw(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:ul(l)}}function X_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function tp(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function ew(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&hi(t.matched[a],s.matched[n])&&Xm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function hi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Xm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!tw(e[s],t[s]))return!1;return!0}function tw(e,t){return Zs(e)?sp(e,t):Zs(t)?sp(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function sp(e,t){return Zs(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function sw(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const Ga={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let xc=(function(e){return e.pop="pop",e.push="push",e})({}),Dr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function aw(e){if(!e)if(Vn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Q_(e)}const nw=/^[^#]+#/;function iw(e,t){return e.replace(nw,"#")+t}function lw(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const lr=()=>({left:window.scrollX,top:window.scrollY});function ow(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=lw(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function ap(e,t){return(history.state?history.state.position-t:-1)+e}const _c=new Map;function rw(e,t){_c.set(e,t)}function cw(e){const t=_c.get(e);return _c.delete(e),t}function dw(e){return typeof e=="string"||e&&typeof e=="object"}function ev(e){return typeof e=="string"||typeof e=="symbol"}let Ct=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const tv=Symbol("");Ct.MATCHER_NOT_FOUND+"",Ct.NAVIGATION_GUARD_REDIRECT+"",Ct.NAVIGATION_ABORTED+"",Ct.NAVIGATION_CANCELLED+"",Ct.NAVIGATION_DUPLICATED+"";function mi(e,t){return ut(new Error,{type:e,[tv]:!0},t)}function ya(e,t){return e instanceof Error&&tv in e&&(t==null||!!(e.type&t))}const uw=["params","query","hash"];function pw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of uw)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function fw(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(Jm," "),i=n.indexOf("="),l=ul(i<0?n:n.slice(0,i)),o=i<0?null:ul(n.slice(i+1));if(l in t){let r=t[l];Zs(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function np(e){let t="";for(let s in e){const a=e[s];if(s=W_(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(Zs(a)?a.map(n=>n&&yc(n)):[a&&yc(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function hw(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=Zs(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const mw=Symbol(""),ip=Symbol(""),or=Symbol(""),Od=Symbol(""),wc=Symbol("");function Ei(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Qa(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(mi(Ct.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):dw(p)?r(mi(Ct.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Pr(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Km(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Qa(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=F_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Qa(p,s,a,l,o,n)()}))}}return i}function vw(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>hi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>hi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let gw=()=>location.protocol+"//"+location.host;function sv(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),tp(o,"")}return tp(s,e)+a+n}function bw(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const h=sv(e,location),m=s.value,v=t.value;let E=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}E=v?p.position-v.position:0}else a(h);n.forEach(I=>{I(s.value,m,{delta:E,type:xc.pop,direction:E?E>0?Dr.forward:Dr.back:Dr.unknown})})};function r(){l=s.value}function c(p){n.push(p);const h=()=>{const m=n.indexOf(p);m>-1&&n.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(ut({},p.state,{scroll:lr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function lp(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?lr():null}}function yw(e){const{history:t,location:s}=window,a={value:sv(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:gw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(r,c){i(r,ut({},t.state,lp(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=ut({},n.value,t.state,{forward:r,scroll:lr()});i(d.current,d,!0),i(r,ut({},lp(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function xw(e){e=aw(e);const t=yw(e),s=bw(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=ut({location:"",base:e,go:a,createHref:iw.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function _w(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),xw(e)}let vn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Ht=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Ht||{});const ww={type:vn.Static,value:""},kw=/[a-zA-Z0-9_]/;function Sw(e){if(!e)return[[]];if(e==="/")return[[ww]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Ht.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Ht.Static?i.push({type:vn.Static,value:c}):s===Ht.Param||s===Ht.ParamRegExp||s===Ht.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:vn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Ht.ParamRegExp){a=s,s=Ht.EscapeNext;continue}switch(s){case Ht.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Ht.Param):p();break;case Ht.EscapeNext:p(),s=a;break;case Ht.Param:r==="("?s=Ht.ParamRegExp:kw.test(r)?p():(u(),s=Ht.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Ht.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Ht.ParamRegExpEnd:d+=r;break;case Ht.ParamRegExpEnd:u(),s=Ht.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Ht.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const op="[^/]+?",Tw={sensitive:!1,strict:!1,start:!0,end:!0};var cs=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(cs||{});const Cw=/[.+*?^${}()[\]/\\]/g;function Ew(e,t){const s=ut({},Tw,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[cs.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=cs.Segment+(s.sensitive?cs.BonusCaseSensitive:0);if(p.type===vn.Static)u||(n+="/"),n+=p.value.replace(Cw,"\\$&"),h+=cs.Static;else if(p.type===vn.Param){const{value:m,repeatable:v,optional:E,regexp:I}=p;i.push({name:m,repeatable:v,optional:E});const y=I||op;if(y!==op){h+=cs.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let g=v?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=E&&c.length<2?`(?:/${g})`:"/"+g),E&&(g+="?"),n+=g,h+=cs.Dynamic,E&&(h+=cs.BonusOptional),v&&(h+=cs.BonusRepeatable),y===".*"&&(h+=cs.BonusWildcard)}d.push(h)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=cs.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===vn.Static)d+=h.value;else if(h.type===vn.Param){const{value:m,repeatable:v,optional:E}=h,I=m in c?c[m]:"";if(Zs(I)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Zs(I)?I.join("/"):I;if(!y)if(E)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function Aw(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===cs.Static+cs.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===cs.Static+cs.Segment?1:-1:0}function av(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=Aw(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(rp(a))return 1;if(rp(n))return-1}return n.length-a.length}function rp(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const Rw={strict:!1,end:!0,sensitive:!1};function Iw(e,t,s){const a=Ew(Sw(e.path),s),n=ut(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function Ow(e,t){const s=[],a=new Map;t=ep(Rw,t);function n(u){return a.get(u)}function i(u,p,h){const m=!h,v=dp(u);v.aliasOf=h&&h.record;const E=ep(t,u),I=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of b)I.push(dp(ut({},v,{components:h?h.record.components:v.components,path:S,aliasOf:h?h.record:v})))}let y,g;for(const b of I){const{path:S}=b;if(p&&S[0]!=="/"){const _=p.record.path,w=_[_.length-1]==="/"?"":"/";b.path=p.record.path+(S&&w+S)}if(y=Iw(b,p,E),h?h.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),m&&u.name&&!up(y)&&l(u.name)),nv(y)&&r(y),v.children){const _=v.children;for(let w=0;w<_.length;w++)i(_[w],y,h&&h.children[w])}h=h||y}return g?()=>{l(g)}:qi}function l(u){if(ev(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=Dw(u,s);s.splice(p,0,u),u.record.name&&!up(u)&&a.set(u.record.name,u)}function c(u,p){let h,m={},v,E;if("name"in u&&u.name){if(h=a.get(u.name),!h)throw mi(Ct.MATCHER_NOT_FOUND,{location:u});E=h.record.name,m=ut(cp(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&cp(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),E=h.record.name);else{if(h=p.name?a.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw mi(Ct.MATCHER_NOT_FOUND,{location:u,currentLocation:p});E=h.record.name,m=ut({},p.params,u.params),v=h.stringify(m)}const I=[];let y=h;for(;y;)I.unshift(y.record),y=y.parent;return{name:E,path:v,params:m,matched:I,meta:Nw(I)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function cp(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function dp(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Lw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Lw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function up(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Nw(e){return e.reduce((t,s)=>ut(t,s.meta),{})}function Dw(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;av(e,t[i])<0?a=i:s=i+1}const n=Pw(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function Pw(e){let t=e;for(;t=t.parent;)if(nv(t)&&av(e,t)===0)return t}function nv({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function pp(e){const t=Bs(or),s=Bs(Od),a=j(()=>{const r=ca(e.to);return t.resolve(r)}),n=j(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(hi.bind(null,d));if(p>-1)return p;const h=fp(r[c-2]);return c>1&&fp(d)===h&&u[u.length-1].path!==h?u.findIndex(hi.bind(null,r[c-2])):p}),i=j(()=>n.value>-1&&Uw(s.params,a.value.params)),l=j(()=>n.value>-1&&n.value===s.matched.length-1&&Xm(s.params,a.value.params));function o(r={}){if(Bw(r)){const c=t[ca(e.replace)?"replace":"push"](ca(e.to)).catch(qi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:j(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function Mw(e){return e.length===1?e[0]:e}const Fw=yl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:pp,setup(e,{slots:t}){const s=an(pp(e)),{options:a}=Bs(or),n=j(()=>({[hp(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[hp(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Mw(t.default(s));return e.custom?i:oi("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),$w=Fw;function Bw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Uw(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!Zs(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function fp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const hp=(e,t,s)=>e??t??s,Hw=yl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=Bs(wc),n=j(()=>e.route||a.value),i=Bs(ip,0),l=j(()=>{let c=ca(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=j(()=>n.value.matched[l.value]);Ui(ip,j(()=>l.value+1)),Ui(mw,o),Ui(wc,n);const r=f();return Ft(()=>[r.value,o.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!hi(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return mp(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,E=oi(p,ut({},m,t,{onVnodeUnmounted:I=>{I.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return mp(s.default,{Component:E,route:c})||E}}});function mp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const zw=Hw;function jw(e){const t=Ow(e.routes,e),s=e.parseQuery||fw,a=e.stringifyQuery||np,n=e.history,i=Ei(),l=Ei(),o=Ei(),r=Hc(Ga);let c=Ga;Vn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Lr.bind(null,q=>""+q),u=Lr.bind(null,Z_),p=Lr.bind(null,ul);function h(q,ce){let ue,me;return ev(q)?(ue=t.getRecordMatcher(q),me=ce):me=q,t.addRoute(me,ue)}function m(q){const ce=t.getRecordMatcher(q);ce&&t.removeRoute(ce)}function v(){return t.getRoutes().map(q=>q.record)}function E(q){return!!t.getRecordMatcher(q)}function I(q,ce){if(ce=ut({},ce||r.value),typeof q=="string"){const F=Nr(s,q,ce.path),R=t.resolve({path:F.path},ce),Z=n.createHref(F.fullPath);return ut(F,R,{params:p(R.params),hash:ul(F.hash),redirectedFrom:void 0,href:Z})}let ue;if(q.path!=null)ue=ut({},q,{path:Nr(s,q.path,ce.path).path});else{const F=ut({},q.params);for(const R in F)F[R]==null&&delete F[R];ue=ut({},q,{params:u(F)}),ce.params=u(ce.params)}const me=t.resolve(ue,ce),ye=q.hash||"";me.params=d(p(me.params));const Fe=X_(a,ut({},q,{hash:K_(ye),path:me.path})),C=n.createHref(Fe);return ut({fullPath:Fe,hash:ye,query:a===np?hw(q.query):q.query||{}},me,{redirectedFrom:void 0,href:C})}function y(q){return typeof q=="string"?Nr(s,q,r.value.path):ut({},q)}function g(q,ce){if(c!==q)return mi(Ct.NAVIGATION_CANCELLED,{from:ce,to:q})}function b(q){return w(q)}function S(q){return b(ut(y(q),{replace:!0}))}function _(q,ce){const ue=q.matched[q.matched.length-1];if(ue&&ue.redirect){const{redirect:me}=ue;let ye=typeof me=="function"?me(q,ce):me;return typeof ye=="string"&&(ye=ye.includes("?")||ye.includes("#")?ye=y(ye):{path:ye},ye.params={}),ut({query:q.query,hash:q.hash,params:ye.path!=null?{}:q.params},ye)}}function w(q,ce){const ue=c=I(q),me=r.value,ye=q.state,Fe=q.force,C=q.replace===!0,F=_(ue,me);if(F)return w(ut(y(F),{state:typeof F=="object"?ut({},ye,F.state):ye,force:Fe,replace:C}),ce||ue);const R=ue;R.redirectedFrom=ce;let Z;return!Fe&&ew(a,me,ue)&&(Z=mi(Ct.NAVIGATION_DUPLICATED,{to:R,from:me}),B(me,me,!0,!1)),(Z?Promise.resolve(Z):O(R,me)).catch(ee=>ya(ee)?ya(ee,Ct.NAVIGATION_GUARD_REDIRECT)?ee:le(ee):N(ee,R,me)).then(ee=>{if(ee){if(ya(ee,Ct.NAVIGATION_GUARD_REDIRECT))return w(ut({replace:C},y(ee.to),{state:typeof ee.to=="object"?ut({},ye,ee.to.state):ye,force:Fe}),ce||R)}else ee=T(R,me,!0,C,ye);return $(R,me,ee),ee})}function k(q,ce){const ue=g(q,ce);return ue?Promise.reject(ue):Promise.resolve()}function x(q){const ce=J.values().next().value;return ce&&typeof ce.runWithContext=="function"?ce.runWithContext(q):q()}function O(q,ce){let ue;const[me,ye,Fe]=vw(q,ce);ue=Pr(me.reverse(),"beforeRouteLeave",q,ce);for(const F of me)F.leaveGuards.forEach(R=>{ue.push(Qa(R,q,ce))});const C=k.bind(null,q,ce);return ue.push(C),de(ue).then(()=>{ue=[];for(const F of i.list())ue.push(Qa(F,q,ce));return ue.push(C),de(ue)}).then(()=>{ue=Pr(ye,"beforeRouteUpdate",q,ce);for(const F of ye)F.updateGuards.forEach(R=>{ue.push(Qa(R,q,ce))});return ue.push(C),de(ue)}).then(()=>{ue=[];for(const F of Fe)if(F.beforeEnter)if(Zs(F.beforeEnter))for(const R of F.beforeEnter)ue.push(Qa(R,q,ce));else ue.push(Qa(F.beforeEnter,q,ce));return ue.push(C),de(ue)}).then(()=>(q.matched.forEach(F=>F.enterCallbacks={}),ue=Pr(Fe,"beforeRouteEnter",q,ce,x),ue.push(C),de(ue))).then(()=>{ue=[];for(const F of l.list())ue.push(Qa(F,q,ce));return ue.push(C),de(ue)}).catch(F=>ya(F,Ct.NAVIGATION_CANCELLED)?F:Promise.reject(F))}function $(q,ce,ue){o.list().forEach(me=>x(()=>me(q,ce,ue)))}function T(q,ce,ue,me,ye){const Fe=g(q,ce);if(Fe)return Fe;const C=ce===Ga,F=Vn?history.state:{};ue&&(me||C?n.replace(q.fullPath,ut({scroll:C&&F&&F.scroll},ye)):n.push(q.fullPath,ye)),r.value=q,B(q,ce,ue,C),le()}let M;function V(){M||(M=n.listen((q,ce,ue)=>{if(!fe.listening)return;const me=I(q),ye=_(me,fe.currentRoute.value);if(ye){w(ut(ye,{replace:!0,force:!0}),me).catch(qi);return}c=me;const Fe=r.value;Vn&&rw(ap(Fe.fullPath,ue.delta),lr()),O(me,Fe).catch(C=>ya(C,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_CANCELLED)?C:ya(C,Ct.NAVIGATION_GUARD_REDIRECT)?(w(ut(y(C.to),{force:!0}),me).then(F=>{ya(F,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_DUPLICATED)&&!ue.delta&&ue.type===xc.pop&&n.go(-1,!1)}).catch(qi),Promise.reject()):(ue.delta&&n.go(-ue.delta,!1),N(C,me,Fe))).then(C=>{C=C||T(me,Fe,!1),C&&(ue.delta&&!ya(C,Ct.NAVIGATION_CANCELLED)?n.go(-ue.delta,!1):ue.type===xc.pop&&ya(C,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),$(me,Fe,C)}).catch(qi)}))}let G=Ei(),P=Ei(),L;function N(q,ce,ue){le(q);const me=P.list();return me.length?me.forEach(ye=>ye(q,ce,ue)):console.error(q),Promise.reject(q)}function te(){return L&&r.value!==Ga?Promise.resolve():new Promise((q,ce)=>{G.add([q,ce])})}function le(q){return L||(L=!q,V(),G.list().forEach(([ce,ue])=>q?ue(q):ce()),G.reset()),q}function B(q,ce,ue,me){const{scrollBehavior:ye}=e;if(!Vn||!ye)return Promise.resolve();const Fe=!ue&&cw(ap(q.fullPath,0))||(me||!ue)&&history.state&&history.state.scroll||null;return It().then(()=>ye(q,ce,Fe)).then(C=>C&&ow(C)).catch(C=>N(C,q,ce))}const W=q=>n.go(q);let re;const J=new Set,fe={currentRoute:r,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:E,getRoutes:v,resolve:I,options:e,push:b,replace:S,go:W,back:()=>W(-1),forward:()=>W(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:P.add,isReady:te,install(q){q.component("RouterLink",$w),q.component("RouterView",zw),q.config.globalProperties.$router=fe,Object.defineProperty(q.config.globalProperties,"$route",{enumerable:!0,get:()=>ca(r)}),Vn&&!re&&r.value===Ga&&(re=!0,b(n.location).catch(me=>{}));const ce={};for(const me in Ga)Object.defineProperty(ce,me,{get:()=>r.value[me],enumerable:!0});q.provide(or,fe),q.provide(Od,Uc(ce)),q.provide(wc,r);const ue=q.unmount;J.add(q),q.unmount=function(){J.delete(q),J.size<1&&(c=Ga,M&&M(),M=null,r.value=Ga,re=!1,L=!1),ue()}}};function de(q){return q.reduce((ce,ue)=>ce.then(()=>x(ue)),Promise.resolve())}return fe}function iv(){return Bs(or)}function Vw(e){return Bs(Od)}const rr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Vw(),s=iv(),a=j({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=j(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=j(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Ft(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},pl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),pa=e=>Number.isSafeInteger(e)&&e>=0,qw=e=>e===null||typeof e=="string",Lo=(e,t)=>pa(e)&&pa(t)&&t>=e,Ld=e=>pl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&qw(e.cursor);function Gw(e){return!Ld(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&pl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!pa(e.total_chars)||!pa(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!Lo(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&pl(e.tail)&&typeof e.tail.text=="string"&&Lo(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function vp(e){return Ld(e)&&e.kind==="process_output"&&pa(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>pa(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&Lo(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Kw(e){return Ld(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>pa(e[t]))&&Lo(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&pa(e.tools_omitted)}function kc(e){try{return JSON.parse(e)}catch{return}}const Sc=e=>JSON.stringify(e,null,2),Ww=e=>{const t=kc(e);return t===void 0?e:Sc(t)},zl=(e,t,s)=>`[${e}, ${t}) ${s}`;function lv(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:Sc(e)??"";let a=typeof e=="string"?kc(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=kc(e.slice(d+c.length)),h=e.slice(0,u);vp(p)&&!("text"in p)&&h.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?Ww(d):d});if(pl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||pa(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...pa(a.original_chars)?[`original ${a.original_chars} code points`]:[]],pl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(Gw(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${zl(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${zl(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(vp(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>zl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(Kw(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${zl(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?Sc(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function ov(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Mr=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Jw=e=>e!==null&&typeof e=="object",Zw=new Set(["_hmac","_prev_hmac"]),Tc=e=>e.replace(/\r\n?/g,`
`);function fl(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(Zw.has(n)){s=!0;return}return i});return Tc(s?JSON.stringify(a):t)}catch{return Tc(t)}}function Yw(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&Jw(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function Qw(e){var h;const t=lv(typeof e=="string"?Tc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:fl(m.text)})),a=s.map(m=>m.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Mr.inlineChars||o&&n.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=ov(c,Mr.previewLines,Mr.previewChars),u=t.kind==="audit_preview"?(h=t.metadata)==null?void 0:h.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:Yw(t)}}const Xw={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=j(()=>Qw(e.value)),c=j(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=j(()=>a.value?c.value:r.value.formatted),u=j(()=>r.value.promoted&&r.value.preview.folded||o.value),p=j(()=>t.value?!!d.value:r.value.promoted),h=j(()=>p.value?"":r.value.summary);let m;function v(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function E(){m==null||m.disconnect();for(const b of[i.value,l.value])b&&(m==null||m.observe(b));v()}function I(){t.value=!t.value,t.value||(a.value=!1)}function y(){a.value=!a.value,t.value=!0,n.value=""}async function g(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(n.value="Copied")}catch{b===e.value&&(n.value="Copy unavailable — select text manually")}}return Ft([()=>e.value,()=>e.rawValue,()=>e.recordId],(b,S)=>{(e.recordId===null||b[2]!==S[2])&&(t.value=!1,a.value=!1),n.value=""}),Ft([i,l,t,s,r],()=>It(E),{flush:"post"}),Ge(()=>{m=new ResizeObserver(v),E()}),ft(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:h,toggleExpanded:I,toggleRaw:y,copyOutput:g}},template:`
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
    </section>`},cr={name:"ToolOutput",components:{CompactOutput:Xw},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=j(()=>lv(e.value)),l=j(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=j(()=>{let u=30,p=6e3;return l.value.map(h=>{const m=ov(h.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...h,display:t.value?h.text:m.text,folded:m.folded}})}),r=j(()=>o.value.some(u=>u.folded)),c=j(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return Ft(()=>e.value,()=>{t.value=!1,n.value=""}),Ft(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},ek={components:{ToolOutput:cr},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var v,E,I,y,g,b,S,_,w,k,x;const h=p.payload||p,m=h.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(h.agent_id||(v=h.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(h.call_id||(E=h.metadata)!=null&&E.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const O=h.call_id||((I=h.metadata)==null?void 0:I.call_id)||null,$=h.agent_id||((y=h.metadata)==null?void 0:y.agent_id)||"",T={callId:O,agentId:$,agentLabel:h.agent_label||((g=h.metadata)==null?void 0:g.agent_label)||"",toolInput:h.tool_input,id:O?`${$}:${O}`:`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:h.iteration??((b=h.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(T);return}if(m==="tool_end"||m==="loop_tool"){const O=h.call_id||((S=h.metadata)==null?void 0:S.call_id)||null,$=h.agent_id||((_=h.metadata)==null?void 0:_.agent_id)||"";let T=-1;if(O&&(T=e.value.findIndex(M=>M.callId===O&&M.agentId===$&&M.status==="running")),T<0&&!O)for(let M=e.value.length-1;M>=0;M--){const V=e.value[M];if(V.tool===h.action&&V.agentId===$&&V.status==="running"){T=M;break}}if(T>=0){const M=e.value[T];M.status=h.error||(w=h.metadata)!=null&&w.error||["error","failed","cancelled","denied","outcome_unknown"].includes(h.status||((k=h.metadata)==null?void 0:k.status))?"error":"success",M.elapsed=h.execution_time_ms??h.duration_ms??((x=h.metadata)==null?void 0:x.elapsed_ms)??Date.now()-M.startTime,M.result=h.result_summary??h.detail??"",M.fadingOut=!0,setTimeout(()=>{const V=e.value.indexOf(M);V>=0&&e.value.splice(V,1),t.value.unshift(M),t.value.length>a&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const O=h.call_id||h.tool_name||"unknown";if(h.finished){const $={...s.value};delete $[O],s.value=$}else{const T=((s.value[O]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[O]:T.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let o=!1;function r(){o||(o=!0,st.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,st.off("events",n),i&&(clearInterval(i),i=null))}Ge(r),Xt(r),Vt(c),ft(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Nd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function In(e){const t=Nd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function tk(e){const t=Nd(e);return t?t.toLocaleTimeString():"—"}function rv(e){const t=Nd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function sk(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function vi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Dd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function cv(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function gp(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Pd(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function dv(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const uv=Symbol("agent-detail-cancelled"),ak=15e3;function nk(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((h,m)=>{r=h,c=m});function u(h,m){o||(o=!0,l!==null&&n(l),l=null,(h?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return o||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,uv),i==null||i.abort()}}}function pv({state:e,requestDetail:t,timeoutMs:s=ak,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const E=nk(I=>t(p,{signal:I}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return v.cancel=E.cancel,v.promise=(async()=>{let I=null,y=null;try{I=await E.promise}catch(g){y=g}I!==uv&&(l!==v||e.detailId!==p||(l=null,!y&&(I===null||typeof I!="object")&&(y=new Error(`${a} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=I,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function ik({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const lk={components:{ToolOutput:cr},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=j(()=>e.value.filter(N=>N.status==="running").length),r=j(()=>e.value.filter(N=>N.status==="completed").length),c=j(()=>e.value.filter(N=>["failed","timeout","killed"].includes(N.status)).length),d=j(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=j(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(N=>["failed","timeout","killed"].includes(N.status)):e.value.filter(N=>N.status===i.value));function p(N){const te=Number(N.max_iterations)||0;return te<=0?0:Math.min(100,Math.round(N.iteration_count/te*100))}function h(N){return(Number(N.max_iterations)||0)>0}function m(N,te){return N?N==="N/A"?"N/A":te==="current_inheritance"?`inherit (currently ${N})`:N:"unknown"}function v(N){return m(N.display_model,N.display_model_source||N.display_source)}function E(N){return m(N.display_reasoning_effort,N.display_reasoning_effort_source||N.display_source)}function I(N){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[N]||""}const y=f(null),g=f(null),b=f(!1),S=f(null),_=f(""),k=pv({state:{get detail(){return y.value},set detail(N){y.value=N},get detailId(){return g.value},set detailId(N){g.value=N},get detailLoading(){return b.value},set detailLoading(N){b.value=N},get detailError(){return S.value},set detailError(N){S.value=N}},requestDetail:(N,{signal:te})=>U.get(`/api/agents/${encodeURIComponent(N)}`,{signal:te})});async function x(N){_.value="",await k.open(N.id)}function O(){k.close(),_.value=""}async function $(){await k.refresh()}async function T(N,te){try{await navigator.clipboard.writeText(te||""),_.value=N,setTimeout(()=>{_.value===N&&(_.value="")},1500)}catch{we.error("Copy failed")}}async function M(N=!1){N=N===!0,N||(t.value=!0);try{const te=await U.get("/api/agents");e.value=Array.isArray(te)?te:[],s.value=null}catch(te){N||(s.value=te.message)}N||(t.value=!1)}async function V(N){const te=e.value.find(B=>B.id===N);if(await Kt({title:"Kill agent",message:`Kill agent "${(te==null?void 0:te.label)||N}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=N;try{await U.del(`/api/agents/${encodeURIComponent(N)}`),we.success("Agent killed"),await M()}catch(B){we.error(B.message||"Failed to kill agent")}a.value=null}}const G=ik({isEnabled:()=>n.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!g.value,refreshDetail:$});function P(){G.start()}function L(){G.stop()}return Ft(n,()=>G.sync()),Ge(()=>{l=!0,M(),P()}),Xt(()=>{l=!0,M(!0),P()}),Vt(()=>{l=!1,L()}),ft(()=>{l=!1,L(),k.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:In,formatDuration:vi,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:E,displaySourceLabel:I,detail:y,detailId:g,detailLoading:b,detailError:S,copied:_,openDetail:x,closeDetail:O,copyText:T,fetchAgents:M,killAgent:V,startAutoRefresh:P,stopAutoRefresh:L}}},ok={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const E=pv({state:{get detail(){return c.value},set detail(L){c.value=L},get detailId(){return d.value},set detailId(L){d.value=L},get detailLoading(){return u.value},set detailLoading(L){u.value=L},get detailError(){return p.value},set detailError(L){p.value=L}},detailLabel:"Loop detail",requestDetail:(L,{signal:N})=>U.get(`/api/loops/${encodeURIComponent(L)}?limit=100`,{signal:N})});async function I(L){h.value="",await E.open(L.id)}function y(){E.close(),h.value=""}async function g(L,N){try{await navigator.clipboard.writeText(N||""),h.value=L,setTimeout(()=>{h.value===L&&(h.value="")},1500)}catch{we.error("Copy failed")}}const b=j(()=>e.value.reduce((L,N)=>L+(N.iteration_count||0),0)),S=j(()=>e.value.filter(L=>L.status==="running").length);function _(L){return L==="running"?"loop-status-running":L==="error"?"loop-status-error":"loop-status-stopped"}function w(L){return L==="running"?"badge-success":L==="error"?"badge-danger":L==="completed"?"badge-info":"badge-warning"}function k(L){return L==="act"?"badge-warning":L==="silent"?"badge-info":"badge-success"}async function x(L=!1){L=L===!0,L||(t.value=!0);try{const N=await U.get("/api/loops");e.value=Array.isArray(N)?N:[],s.value=null}catch(N){L||(s.value=N.message)}L||(t.value=!1)}async function O(){l.value=null;const L=n.value;if(!L.goal.trim()){l.value="Goal is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}const N={goal:L.goal.trim(),channel_id:L.channel_id.trim(),interval_seconds:L.interval_seconds||60,mode:L.mode,max_iterations:L.max_iterations||50};L.stop_condition.trim()&&(N.stop_condition=L.stop_condition.trim()),i.value=!0;try{const te=await U.post("/api/loops",N);we.success(`Loop started: ${te.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await x()}catch(te){l.value=te.message}i.value=!1}async function $(L){if(await Kt({title:"Stop loop",message:`Stop loop ${L}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=L;try{await U.del(`/api/loops/${encodeURIComponent(L)}`),we.success("Loop stopped"),await x()}catch(te){we.error(te.message||"Failed to stop loop")}o.value=null}}async function T(L){r.value=L;try{await U.post(`/api/loops/${encodeURIComponent(L)}/restart`),we.success("Loop restarted"),await x()}catch(N){we.error(N.message||"Failed to restart loop")}r.value=null}function M(L){m&&L.payload&&(L.payload.loop_id||L.payload.type==="loop")&&(x(!0),d.value&&E.refresh())}let V=null;function G(){V!==null&&clearInterval(V),V=null}function P(){G(),m&&(V=setInterval(()=>{x(!0),d.value&&E.refresh()},5e3))}return Ge(()=>{m=!0,x(),st.subscribe("events",M),P()}),Xt(()=>{m=!0,x(!0),P()}),Vt(()=>{m=!1,G()}),ft(()=>{m=!1,st.unsubscribe("events",M),G(),E.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:S,statusDotClass:_,statusBadge:w,modeBadge:k,formatAge:rv,formatDuration:vi,formatTs:In,formatTokens:dv,openDetail:I,closeDetail:y,copyText:g,fetchLoops:x,doCreate:O,doStop:$,doRestart:T}}},rk={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=j(()=>e.value.filter(y=>y.status==="running").length),o=j(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await U.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Ft(a,y=>{y?u():p()});async function h(y){if(await Kt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await U.del(`/api/processes/${y}`),we.success(`Process ${y} killed`),await d()}catch(b){we.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let v=!1;function E(){v||(v=!0,d(),st.subscribe("events",m),u())}function I(){v&&(v=!1,st.unsubscribe("events",m),p())}return Ge(E),Xt(E),Vt(I),ft(I),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:vi,fetchProcesses:d,doKill:h}}},ck=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function bp(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function dk(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function uk(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function pk(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=ck.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const E of new Set([p,h])){const I=new Date(u+E*6e4);dk(I,c)===d&&(m.some(y=>y.getTime()===I.getTime())||m.push(I))}if(m.sort((E,I)=>E.getTime()-I.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(E=>({instant:E,offset:uk(E),iso:E.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const fk=5e3;function so(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function jl(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function yp(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:so(e.data.connection)}const hk={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 class="text-xl font-semibold">Schedules</h1>
          <p class="page-lede">Create, inspect, and run recurring or one-time automation.</p>
        </div>
        <div class="flex gap-2">
          <button @click="showCreate = !showCreate" class="btn btn-primary text-xs"
                  :disabled="!schedulingAvailable">
            {{ showCreate ? 'Cancel' : 'New Schedule' }}
          </button>
          <button @click="fetchSchedules" class="btn btn-ghost text-xs" :disabled="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div v-if="!schedulingAvailable" class="hm-card border-yellow-900 mb-4 text-xs text-yellow-300" role="status">
        {{ schedulingAvailabilityMessage }} Creation, immediate runs, and resume are disabled. Existing schedules and history remain available.
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

        <button @click="doCreate" class="btn btn-primary text-xs" :disabled="creating || !schedulingAvailable">
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
                          :disabled="togglingId === s.id || (s.paused && !schedulingAvailable)"
                          :title="s.paused ? 'Resume this schedule' : 'Pause this schedule'">
                    {{ togglingId === s.id ? '...' : (s.paused ? 'Resume' : 'Pause') }}
                  </button>
                  <button @click="doRunNow(s.id)" class="btn btn-ghost text-xs"
                          :disabled="runningId === s.id || !schedulingAvailable"
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(so(null)),n=j(()=>a.value.available),i=j(()=>jl(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),c=f(!1),d=f(null),u=f(null),p=j(()=>pk(r.value.run_at));Ft(()=>r.value.run_at,()=>{u.value=null});const h=j(()=>{var Z;const R=p.value;return R.state==="ok"?R.instant:R.state==="ambiguous"&&u.value!==null&&((Z=R.options[u.value])==null?void 0:Z.instant)||null}),m=j(()=>{const R=h.value;return R?`${R.toLocaleString()} local — ${R.toISOString()} UTC`:""}),v=f(null),E=f(!1),I=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],y=f(null),g=f(null),b=f(null),S=f(null),_=f(null),w=f(null),k=f([]),x=f(!1),O=f("");let $=0;const T=j(()=>e.value.filter(R=>R.cron&&!R.one_time).length),M=j(()=>e.value.filter(R=>R.one_time).length),V=j(()=>e.value.filter(R=>R.trigger).length),G=j(()=>e.value.filter(R=>R.paused).length),P=j(()=>e.value.filter(R=>R.consecutive_failures>0).length);function L(R){if(!R)return"-";const Z=Date.now(),ne=(new Date(R).getTime()-Z)/1e3;if(ne<0)return"overdue";if(ne<60)return"in < 1 min";if(ne<3600)return`in ${Math.floor(ne/60)} min`;if(ne<86400){const H=Math.floor(ne/3600),Q=Math.floor(ne%3600/60);return Q>0?`in ${H}h ${Q}m`:`in ${H}h`}const ve=Math.floor(ne/86400);return`in ${ve} day${ve!==1?"s":""}`}function N(R){return R==null?"-":R<1e3?`${R}ms`:R<6e4?`${(R/1e3).toFixed(1)}s`:vi(R/1e3)}function te(R=r.value.cron){r.value.cron=R,bp(r.value,"cron"),v.value=null}function le(R=r.value.run_at){r.value.run_at=R,bp(r.value,"run_at"),v.value=null}async function B(){const R=r.value.cron.trim();if(R){E.value=!0;try{v.value=await U.post("/api/schedules/validate-cron",{expression:R})}catch(Z){v.value={valid:!1,error:Z.message}}E.value=!1}}async function W(){t.value=!0,s.value=null;try{e.value=await U.get("/api/schedules")}catch(R){s.value=R.message}t.value=!1}async function re(){try{a.value=so(await U.get("/api/schedules/status"))}catch(R){a.value=yp(R)||so(null)}}function J(R){const Z=yp(R);Z&&(a.value=Z)}async function fe(R){if(w.value===R){w.value=null,k.value=[];return}w.value=R,x.value=!0,k.value=[];const Z=++$;try{const ee=await U.get(`/api/schedules/${encodeURIComponent(R)}/history?limit=10`);if(Z!==$||w.value!==R)return;k.value=ee,O.value=""}catch(ee){if(Z!==$||w.value!==R)return;k.value=[],O.value=ee.message||"Failed to load execution history"}Z===$&&(x.value=!1)}async function de(){if(d.value=null,!n.value){d.value=jl(a.value);return}const R=r.value;if(!R.description.trim()){d.value="Description is required";return}if(!R.channel_id.trim()){d.value="Channel ID is required";return}if(!R.cron.trim()&&!R.run_at.trim()){d.value="Cron expression or run_at time is required";return}if(R.cron.trim()&&R.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const Z={description:R.description.trim(),action:R.action,channel_id:R.channel_id.trim()};if(R.cron.trim()&&(Z.cron=R.cron.trim()),R.run_at.trim()){const ee=p.value;if(ee.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(ee.state==="invalid"){d.value="One-time run time is not a valid date";return}const ne=h.value;if(ee.state==="ambiguous"&&u.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!ne){d.value="One-time run time could not be resolved";return}Z.run_at=ne.toISOString()}if(R.action==="reminder"&&R.message.trim()&&(Z.message=R.message.trim()),R.action==="check"&&(R.tool_name.trim()&&(Z.tool_name=R.tool_name.trim()),R.report_format&&(Z.report_format=R.report_format),R.tool_input_str.trim()))try{Z.tool_input=JSON.parse(R.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}c.value=!0;try{await U.post("/api/schedules",Z),we.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},v.value=null,o.value=!1,await W()}catch(ee){J(ee),d.value=ee.message}c.value=!1}async function q(R){if(!n.value){we.error(jl(a.value));return}y.value=R;try{const Z=await U.post(`/api/schedules/${encodeURIComponent(R)}/run`);if(Z.status==="failure")we.error(`Execution failed: ${Z.error||"unknown error"}`);else{const ee=Z.warning?`Executed (${Z.warning})`:"Executed successfully";we.success(ee)}await W()}catch(Z){J(Z),we.error(Z.message||"Failed to trigger")}y.value=null}async function ce(R){if(R.paused&&!n.value){we.error(jl(a.value));return}b.value=R.id;const Z=!R.paused;try{await U.put(`/api/schedules/${encodeURIComponent(R.id)}`,{paused:Z}),we.success(Z?"Schedule paused":"Schedule resumed"),await W()}catch(ee){J(ee),we.error(ee.message||"Failed to update schedule")}b.value=null}const ue=new Map;function me(R,Z){const ee=ue.get(R.id);ee&&clearTimeout(ee.timer);const ne={run:()=>ye(R,Z),timer:null};ne.timer=setTimeout(()=>{ue.delete(R.id),ne.run()},500),ue.set(R.id,ne)}async function ye(R,Z){_.value=R.id;try{await U.put(`/api/schedules/${encodeURIComponent(R.id)}`,{report_format:Z}),we.success(Z?"Structured report enabled":"Plain-text report enabled")}catch(ee){we.error(`Update failed: ${ee.message}`)}finally{await W(),_.value=null}}function Fe(){for(const[R,Z]of[...ue])clearTimeout(Z.timer),ue.delete(R),Z.run()}async function C(R){S.value=R;try{await U.post(`/api/schedules/${encodeURIComponent(R)}/reset-failures`),we.success("Failure counters reset"),await W()}catch(Z){we.error(Z.message||"Failed to reset")}S.value=null}async function F(R){const Z=e.value.find(ne=>ne.id===R);if(await Kt({title:"Delete schedule",message:`Delete "${(Z==null?void 0:Z.description)||R}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){g.value=R;try{await U.del(`/api/schedules/${encodeURIComponent(R)}`),we.success("Schedule deleted"),await W()}catch(ne){we.error(ne.message||"Failed to delete schedule")}g.value=null}}return Ge(()=>{W(),re(),l=setInterval(re,fk)}),ft(()=>{Fe(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:m,runAtAnalysis:p,runAtOccurrence:u,cronResult:v,validatingCron:E,cronPresets:I,runningId:y,deletingId:g,togglingId:b,resettingId:S,reportUpdatingId:_,flushReportFormatTimers:Fe,expandedId:w,history:k,historyLoading:x,historyError:O,cronCount:T,oneTimeCount:M,webhookCount:V,pausedCount:G,failingCount:P,formatTs:In,formatAge:rv,formatFuture:L,formatMs:N,formatDuration:vi,onCronInput:te,onRunAtInput:le,validateCron:B,toggleExpand:fe,fetchSchedules:W,fetchSchedulingAvailability:re,doCreate:de,doRunNow:q,doTogglePause:ce,doUpdateReportFormat:me,doResetFailures:C,doDelete:F}}},fv=[{id:"live",label:"Live",component:ek},{id:"agents",label:"Agents",component:lk},{id:"loops",label:"Loops",component:ok},{id:"processes",label:"Processes",component:rk},{id:"schedules",label:"Schedules",component:hk}],mk={components:{TabbedPage:rr},setup(){return{tabs:fv}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},vk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){a.value=a.value===m?null:m}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await U.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++r;t.value=!0,s.value=null,a.value=null;try{const v=new URLSearchParams;n.value.tool&&v.set("tool",n.value.tool),n.value.user&&v.set("user",n.value.user),n.value.keyword&&v.set("q",n.value.keyword),n.value.date&&v.set("date",n.value.date),v.set("limit",String(n.value.limit));const E=v.toString(),I=await U.get(`/api/audit${E?"?"+E:""}`);if(m!==r)return;e.value=Array.isArray(I)?I:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return Ge(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:In,formatDetail:i,truncateBlock:cv,toggleExpand:l,clearFilters:o,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},xp=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],gk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],bk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=xp,E=gk,I=f([]),y=f(!1),g=f(""),b=f("flat"),S=f(new Set),_=f(""),w=f(""),k=f(""),x=f(null),O=f(!1),$=f(""),T=f(!1);let M=0;Ft([_,w,k],()=>{M++,O.value=!1,$.value="",T.value=x.value!==null},{flush:"sync"});function V(){try{const se=localStorage.getItem("odin-session-presets");se&&(I.value=JSON.parse(se))}catch{}}function G(){try{localStorage.setItem("odin-session-presets",JSON.stringify(I.value))}catch{}}const P=j(()=>p.value.trim()!==""||u.value!=="all"),L=j(()=>{let se=[...e.value];const Ee=xp.find(Ke=>Ke.id===u.value),Ne=Ee?Ee.filters:{};if(Ne.source&&(se=se.filter(Ke=>Ke.source===Ne.source)),Ne.minMessages&&(se=se.filter(Ke=>Ke.message_count>=Ne.minMessages)),Ne.hasCompaction&&(se=se.filter(Ke=>Ke.has_summary)),Ne.maxAge!=null){const Ke=Date.now()/1e3;se=se.filter(Bt=>Bt.last_active&&Ke-Bt.last_active<=Ne.maxAge)}if(p.value.trim()){const Ke=p.value.toLowerCase().trim();se=se.filter(Bt=>(Bt.channel_id||"").toLowerCase().includes(Ke)||(Bt.last_user_id||"").toLowerCase().includes(Ke)||(Bt.source||"").toLowerCase().includes(Ke))}const Je=h.value,Lt=m.value?1:-1;return se.sort((Ke,Bt)=>{const Ut=Ke[Je]||0,hs=Bt[Je]||0;return(Ut-hs)*Lt}),se}),N=j(()=>{if(!n.value||!n.value.messages)return[];const se=n.value.messages;if(se.length===0)return[];const Ee=[];let Ne=[];for(const Je of se)Je.role==="user"&&Ne.length>0&&(Ee.push(Ne),Ne=[]),Ne.push(Je);return Ne.length>0&&Ee.push(Ne),Ee}),te=j(()=>L.value.length>0&&c.value.size===L.value.length);function le(se){const Ee=se.find(Ne=>Ne.role==="user");if(Ee&&Ee.content){const Ne=Ee.content.slice(0,120);return Ne.length<Ee.content.length?Ne+"...":Ne}return"(no user message)"}function B(se){const Ee=new Set(S.value);Ee.has(se)?Ee.delete(se):Ee.add(se),S.value=Ee}function W(se){u.value=se}function re(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(h.value=se.filters.sortBy)}function J(){if(!g.value.trim())return;const se={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};I.value=[...I.value,se],G(),y.value=!1,g.value=""}function fe(se){I.value=I.value.filter(Ee=>Ee.id!==se),G(),u.value===se&&(u.value="all")}function de(){u.value="all",p.value="",h.value="last_active",m.value=!1}function q(se){if(!se)return"—";const Ee=Date.now()/1e3-se;if(Ee<60)return"just now";if(Ee<3600){const Je=Math.floor(Ee/60);return`${Je} minute${Je!==1?"s":""} ago`}if(Ee<86400){const Je=Math.floor(Ee/3600);return`${Je} hour${Je!==1?"s":""} ago`}const Ne=Math.floor(Ee/86400);return`${Ne} day${Ne!==1?"s":""} ago`}function ce(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ue(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function me(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function ye(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Fe(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function C(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function F(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function R(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function Z(){const se=_.value.trim();if(!se)return;const Ee=++M;O.value=!0,$.value="",T.value=x.value!==null;try{let Ne=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;w.value.trim()&&(Ne+=`&channel_id=${encodeURIComponent(w.value.trim())}`),k.value.trim()&&(Ne+=`&user_id=${encodeURIComponent(k.value.trim())}`);const Je=await U.get(Ne);if(Ee!==M)return;x.value=Je.results||[],T.value=!1}catch(Ne){if(Ee!==M)return;$.value=Ne.message||"Search failed. Please retry."}finally{Ee===M&&(O.value=!1)}}function ee(){M++,_.value="",w.value="",k.value="",x.value=null,$.value="",T.value=!1,O.value=!1}function ne(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ve(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function H(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let Q=0;async function X(){const se=++Q;t.value=!0,s.value=null;try{const Ee=await U.get("/api/sessions");if(se!==Q)return;e.value=Ee}catch(Ee){if(se!==Q)return;s.value=Ee.message}se===Q&&(t.value=!1)}function pe(){s.value=null,X()}async function he(se){if(a.value===se){a.value=null,n.value=null,S.value=new Set;return}a.value=se,n.value=null,i.value=!0,S.value=new Set;const Ee=++l;try{const Ne=await U.get(`/api/sessions/${encodeURIComponent(se)}`);Ee===l&&a.value===se&&(n.value=Ne)}catch(Ne){Ee===l&&a.value===se&&(n.value={messages:[],summary:"",error:Ne.message||"Failed to load session"})}finally{Ee===l&&(i.value=!1)}}function xe(se){const Ee=new Set(c.value);Ee.has(se)?Ee.delete(se):Ee.add(se),c.value=Ee}function Oe(){te.value?c.value=new Set:c.value=new Set(L.value.map(se=>se.channel_id))}function ge(se){o.value=se}async function He(){if(o.value){r.value=!0;try{await U.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await X()}catch(se){s.value=se.message||"Failed to clear session"}r.value=!1,o.value=null}}function Be(){d.value=!0}async function ze(){if(c.value.size!==0){r.value=!0;try{await U.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await X()}catch(se){s.value=se.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Qe(se,Ee){const Ne=`/api/sessions/${encodeURIComponent(se)}/export?format=${Ee}`;try{const Je=await U.getBlob(Ne),Lt=URL.createObjectURL(Je),Ke=document.createElement("a");Ke.href=Lt,Ke.download=`session-${se}.${Ee==="text"?"txt":"json"}`,Ke.click(),URL.revokeObjectURL(Lt)}catch(Je){s.value=Je.message||"Failed to export session"}}let ot=null;function nt(se){se.payload&&se.payload.channel_id&&(clearTimeout(ot),ot=setTimeout(()=>{if(X(),a.value&&se.payload.channel_id===a.value){const Ee=a.value,Ne=l;U.get(`/api/sessions/${encodeURIComponent(Ee)}`).then(Je=>{Ne!==l||a.value!==Ee||(n.value=Je)}).catch(()=>{})}},2e3))}let Y=!1,_e=null;function Ae(){Y||(Y=!0,X(),st.subscribe("events",nt),_e=st.onReconnected(()=>X()))}Ge(()=>{V(),Ae()}),Xt(()=>{Ae()});function Le(){Y&&(Y=!1,st.unsubscribe("events",nt),_e&&(_e(),_e=null),clearTimeout(ot))}return Vt(Le),ft(Le),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:te,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:E,filteredSessions:L,hasActiveFilters:P,customPresets:I,showSavePreset:y,newPresetName:g,threadView:b,threads:N,collapsedThreads:S,ftsQuery:_,ftsChannelId:w,ftsUserId:k,ftsResults:x,ftsSearching:O,ftsError:$,ftsStale:T,formatAge:q,formatTimestamp:ce,formatFullTimestamp:ue,messageClass:me,threadMsgClass:ye,roleBadge:Fe,roleDotClass:C,roleLabelClass:F,truncateContent:R,threadSummary:le,fetchSessions:X,retry:pe,toggleSession:he,toggleSelect:xe,toggleSelectAll:Oe,confirmClear:ge,clearSession:He,confirmBulkClear:Be,doBulkClear:ze,exportSession:Qe,applyPreset:W,applyCustomPreset:re,saveCustomPreset:J,removeCustomPreset:fe,resetFilters:de,toggleThread:B,runFtsSearch:Z,clearFtsSearch:ee,highlightSnippet:ne,ftsResultClass:ve,ftsTypeBadge:H}}},yk={props:["trace"],template:`
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
  `,setup(){return{formatTokens:dv}}},xk={components:{ContextAssemblyPanel:yk},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(w){if(!w)return"—";try{const k=new Date(w);return isNaN(k.getTime())?w:k.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function p(w){return!w&&w!==0?"—":w<1e3?w+"ms":(w/1e3).toFixed(1)+"s"}function h(w){return!w&&w!==0?"—":w>=1e3?(w/1e3).toFixed(1)+"k":String(w)}function m(w){if(!w)return"";if(typeof w=="string")return w;try{return JSON.stringify(w,null,2)}catch{return String(w)}}function v(w){n.value===w?n.value=null:(n.value=w,c.value={})}function E(w,k){const x=w+"-"+k;c.value={...c.value,[x]:!c.value[x]}}function I(w,k){return!!c.value[w+"-"+k]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,S()}async function g(){try{const w=await U.get("/api/trajectories");e.value=w.files||[],r.value=w.count||0}catch{}}let b=0;async function S(){const w=++b;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const k=await U.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(w!==b)return;let x=k.entries||[];d.value.tool_name&&(x=x.filter(O=>(O.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(x=x.filter(O=>O.is_error)),d.value.channel_id&&(x=x.filter(O=>O.channel_id===d.value.channel_id)),d.value.user_id&&(x=x.filter(O=>O.user_id===d.value.user_id)),t.value=x}else{const k=new URLSearchParams;d.value.channel_id&&k.set("channel_id",d.value.channel_id),d.value.user_id&&k.set("user_id",d.value.user_id),d.value.tool_name&&k.set("tool_name",d.value.tool_name),d.value.errors_only&&k.set("errors_only","true"),k.set("limit",String(d.value.limit));const x=k.toString(),O=await U.get(`/api/trajectories/search/query?${x}`);if(w!==b)return;t.value=O.results||[]}}catch(k){if(w!==b)return;a.value=k.message}w===b&&(s.value=!1)}async function _(){if(!l.value.trim())return;const w=++b;s.value=!0,a.value=null,c.value={};try{const k=await U.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(w!==b)return;i.value=k.entry||null,i.value||(a.value="No trace found for this message ID")}catch(k){if(w!==b)return;k.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=k.message}w===b&&(s.value=!1)}return Ge(async()=>{await g(),await S()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:cv,toggleExpand:v,toggleIteration:E,isIterationExpanded:I,clearFilters:y,fetchFiles:g,fetchTraces:S,lookupMessage:_}}};function _k(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function wk(e){return e?`${e.approximate?"~":""}${Pd(e.total||0)}`:"0"}const kk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=j(()=>a.value.work||{}),h=j(()=>Math.max(1,...(a.value.activity_over_time||[]).map(_=>Number(_.count||0)))),m=j(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),v=_=>({height:`${Math.max(4,Math.round(Number(_||0)/h.value*100))}%`}),E=j(()=>s.value&&l.value-i.value>3e4);async function I(){const _=++d,w=n.value;try{const k=await U.get(`/api/usage?range=${encodeURIComponent(w)}`);if(_!==d||w!==n.value)return;a.value=k,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(k){_===d&&(t.value=k.message)}finally{_===d&&(e.value=!1)}}function y(_){n.value=_,e.value=!s.value,I()}function g(){e.value=!0,I()}function b(){c||(c=!0,I(),o=setInterval(I,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function S(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Ge(b),Xt(b),Vt(S),ft(S),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:E,fmtNum:Pd,fmtDuration:_k,tokenLabel:wk,activityTrackStyle:m,activityBar:v,selectRange:y,retry:g}}},hv=[{id:"audit",label:"Audit",component:vk},{id:"sessions",label:"Sessions",component:bk},{id:"traces",label:"Traces",component:xk},{id:"usage",label:"Usage & Activity",component:kk}],Sk={components:{TabbedPage:rr},setup(){return{tabs:hv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Fr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Tk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(x){return x.source!=="builtin"?"":u[x.state]||""}function h(x,O){const $=x&&Array.isArray(x.tools)?x.tools:null;if(c.value=!!$,r.value=$?!!x.global_enabled:null,!$){e.value=O.map(V=>({...V,source:"unknown",enabled:void 0,state:null}));return}const T=new Set($.map(V=>V.name)),M=O.filter(V=>!T.has(V.name)).map(V=>({...V,source:V.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...$.map(V=>({...V,source:"builtin"})),...M]}async function m(x,O){if(d.value.has(x.name))return;const $=!!O.target.checked,T=new Set(d.value);T.add(x.name),d.value=T;try{const M=await U.post(`/api/tools/builtins/${encodeURIComponent(x.name)}/enabled`,{enabled:$});h(M,e.value),s.value=null;try{const V=await U.get("/api/tools");h(M,V)}catch(V){console.warn("Built-in toggle committed; visible catalog refresh failed",V)}}catch(M){O.target.checked=!!x.enabled,s.value=M.message||`Failed to toggle ${x.name}`}finally{const M=new Set(d.value);M.delete(x.name),d.value=M}}const v=j(()=>e.value.filter(x=>x.source==="builtin"&&x.is_core).length),E=j(()=>e.value.filter(x=>x.source==="skill").length),I=j(()=>Object.values(n.value).reduce((x,O)=>x+O,0));function y(x){for(const O of Fr)if(O.id!=="other"&&O.match(x))return O.id;return"other"}const g=j(()=>{let x=e.value;if(a.value){const O=a.value.toLowerCase();x=x.filter($=>$.name.toLowerCase().includes(O)||($.description||"").toLowerCase().includes(O))}return o.value&&(x=x.filter(O=>y(O.name)===o.value)),x}),b=j(()=>{const x=new Set;for(const O of e.value)x.add(y(O.name));return Fr.filter(O=>x.has(O.id))}),S=j(()=>{const x=g.value,O={};for(const T of x){const M=y(T.name);O[M]||(O[M]=[]),O[M].push(T)}const $=[];for(const T of Fr)O[T.id]&&O[T.id].length>0&&$.push({label:T.label,icon:T.icon,tools:O[T.id].sort((M,V)=>M.name.localeCompare(V.name))});return $});function _(x){i.value={...i.value,[x]:!i.value[x]}}async function w(){t.value=!0,s.value=null;try{const[x,O,$]=await Promise.all([U.get("/api/tools"),U.get("/api/tools/stats").catch(()=>({})),U.get("/api/tools/builtins").catch(()=>null)]);h($,x),n.value=O||{}}catch(x){s.value=x.message}t.value=!1}function k(){w()}return Ge(()=>{w()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:E,totalUsage:I,filteredTools:g,groupedTools:S,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:Dd,toggleExpand:_,refresh:k}}};function Ck(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Ek(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const Ak={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),E=f(null),I=f(!1),y=j(()=>e.value.length),g=j(()=>e.value.reduce((J,fe)=>J+(fe.execution_count||0),0)),b=j(()=>e.value.reduce((J,fe)=>J+O(fe.code),0)),S=j(()=>{if(!l.value)return e.value;const J=l.value.toLowerCase();return e.value.filter(fe=>fe.name.toLowerCase().includes(J)||(fe.description||"").toLowerCase().includes(J))}),_=j(()=>u.value?u.value.split(`
`).length:0),w=j(()=>{const J=Math.max(_.value,1);return Array.from({length:J},(fe,de)=>de+1).join(`
`)}),k=j(()=>{const J=u.value.trim();return J?J.includes("SKILL_DEFINITION")?J.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function x(J){return Ck(J)}function O(J){return J?J.split(`
`).length:0}function $(J){return Ek(J)}function T(J){a.value={...a.value,[J]:!a.value[J]}}async function M(J){try{await navigator.clipboard.writeText(J);const fe=e.value.find(de=>de.code===J);fe&&(o.value=fe.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function V(J){if(J.key==="Tab"){J.preventDefault();const fe=J.target,de=fe.selectionStart,q=fe.selectionEnd;u.value=u.value.substring(0,de)+"    "+u.value.substring(q),It(()=>{fe.selectionStart=fe.selectionEnd=de+4})}}function G(J){const fe=J.target.previousElementSibling;fe&&(fe.scrollTop=J.target.scrollTop)}async function P(){t.value=!0,s.value=null;try{e.value=await U.get("/api/skills")}catch(J){s.value=J.message}t.value=!1}async function L(J){i.value=J,delete n.value[J],n.value={...n.value};try{const fe=await U.post(`/api/skills/${encodeURIComponent(J)}/test`);n.value={...n.value,[J]:fe}}catch(fe){n.value={...n.value,[J]:{result:fe.message,is_error:!0}}}i.value=null}function N(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function te(J){r.value=!0,c.value="edit",d.value=J.name,u.value=J.code||"",p.value=null,h.value=null}function le(){r.value=!1,p.value=null,h.value=null}async function B(){p.value=null,h.value=null;const J=d.value.trim(),fe=u.value.trim();if(!J){p.value="Name is required";return}if(!fe){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await U.post("/api/skills",{name:J,code:fe}),h.value="Skill created successfully"):(await U.put(`/api/skills/${encodeURIComponent(J)}`,{code:fe}),h.value="Skill updated successfully"),await P(),setTimeout(()=>{r.value=!1},800)}catch(de){p.value=de.message}m.value=!1}function W(J){E.value=J}async function re(){if(E.value){I.value=!0;try{await U.del(`/api/skills/${encodeURIComponent(E.value)}`),await P()}catch(J){we.error(`Failed to delete skill: ${J.message||"unknown error"}`)}I.value=!1,E.value=null}}return Ge(()=>{P()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:E,deleting:I,enabledCount:y,totalExecutions:g,totalLines:b,displayedSkills:S,editLineCount:_,editorLineNums:w,editValidation:k,highlight:x,truncate:Dd,formatTs:In,countLines:O,getLineNumbers:$,toggleCode:T,copyCode:M,handleEditorKey:V,syncScroll:G,fetchSkills:P,testSkill:L,showCreate:N,editSkill:te,cancelEdit:le,saveSkill:B,confirmDelete:W,doDelete:re}}};class Ms extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Rk=/^[A-Za-z_][A-Za-z0-9_]*$/;function _p(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function wp(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Ms(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Ms(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new Ms(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Ms(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function Ik(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Ok(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new Ms("Server name is required.","name");if(n.length>128||!Rk.test(n))throw new Ms("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new Ms("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=_p(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Ms("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new Ms("An HTTP endpoint is required for this connection.","url");if(d&&!Ik(d))throw new Ms("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Ms("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=_p(e.allowlistText));const r=wp(e.headerRows,e.headersRemove,"Header"),c=wp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function Lk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Nk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Dk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const Pk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Mk(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Fk=1e4,$k=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function $r(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Bk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Uk={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=j(()=>Object.keys(i.value).every(Y=>{var _e;return Number.isInteger((_e=e.value)==null?void 0:_e[Y])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),h=f({}),m=f(new Set),v=f(!1),E=f("add"),I=f(""),y=f(null),g=f($r()),b=f(""),S=f(!1);let _=null,w=0,k=!1,x=!1;const O=Pk,$=j(()=>{var Y;return((Y=e.value)==null?void 0:Y.servers)||[]}),T=j(()=>{var Y;return!!((Y=e.value)!=null&&Y.enabled)}),M=j(()=>{var Y,_e,Ae,Le;return{serverCount:((Y=e.value)==null?void 0:Y.server_count)||0,enabledCount:((_e=e.value)==null?void 0:_e.enabled_server_count)||0,connectedCount:((Ae=e.value)==null?void 0:Ae.connected_count)||0,toolCount:((Le=e.value)==null?void 0:Le.published_tool_count)||0}}),V=j(()=>{var Y;return((Y=y.value)==null?void 0:Y.header_keys)||[]}),G=j(()=>{var Y;return((Y=y.value)==null?void 0:Y.env_keys)||[]}),P=j(()=>{var Y;return E.value==="edit"&&((Y=y.value)==null?void 0:Y.transport)==="http"}),L=j(()=>E.value==="add"||!P.value),N=j(()=>P.value?"Replace endpoint URL":"Endpoint URL"),te=j(()=>P.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function le(){B(),_=window.setInterval(()=>W({quiet:!0}),Fk)}function B(){_&&window.clearInterval(_),_=null}async function W({quiet:Y=!1}={}){if(a.value)return;const _e=++w;Y||(t.value=!0);try{const Ae=await U.get("/api/mcp/status");if(_e!==w||!k)return;e.value=Ae;for(const se of Object.keys(i.value))!l.value.has(se)&&Number.isInteger(Ae[se])&&(i.value[se]=String(Ae[se]));r.value="";const Le=new Set((Ae.servers||[]).map(se=>se.name));d.value=new Set([...d.value].filter(se=>Le.has(se)))}catch(Ae){_e===w&&k&&(r.value=Ae.message||"Failed to load MCP status")}finally{_e===w&&(t.value=!1)}}function re(Y){return s.value||c.value.has(Y)}function J(Y,_e){const Ae=new Set(c.value);_e?Ae.add(Y):Ae.delete(Y),c.value=Ae}function fe(Y){return Nk(Y.state)}function de(Y){if(fe(Y)==="disabled"){if(!Y.enabled)return"Disabled — server switch off";if(!T.value)return"Disabled — global MCP is off"}return $k[fe(Y)]}function q(Y){return Y.transport==="http"?"Streamable HTTP":"stdio"}function ce(Y){return Y.negotiated_version?`${Y.era?`${String(Y.era).charAt(0).toUpperCase()}${String(Y.era).slice(1)}`:"Protocol"} · ${Y.negotiated_version}`:"Not negotiated"}function ue(Y){return Y.discovered_count?`${Y.published_count||0} published · ${Y.excluded_count||0} excluded`:"No tools discovered"}const me=f(new Set);async function ye(Y,_e){if(me.value.has(Y.name))return;const Ae=!!_e.target.checked,Le=new Set(me.value);Le.add(Y.name),me.value=Le;try{const se=await U.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/enabled`,{enabled:Ae});se&&Array.isArray(se.servers)?e.value=se:await W({quiet:!0})}catch(se){_e.target.checked=!!Y.enabled,we.error(se.message||`Failed to toggle ${Y.name}`)}finally{const se=new Set(me.value);se.delete(Y.name),me.value=se}}function Fe(Y,_e){var Le;i.value[Y]=_e;const Ae=new Set(l.value);_e===String((Le=e.value)==null?void 0:Le[Y])?Ae.delete(Y):Ae.add(Y),l.value=Ae,n.value=""}async function C(){if(s.value||!o.value||!l.value.size)return;const Y={};for(const _e of l.value){const Ae=Number(i.value[_e]),Le=_e==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Ae)||Ae<1||Ae>Le){n.value=`Enter a whole number between 1 and ${Le}.`;return}Y[_e]=Ae}a.value=!0,s.value=!0,n.value="",++w,t.value=!1;try{const _e=await U.post("/api/mcp/limits",Y);e.value=_e;for(const Ae of Object.keys(i.value))Number.isInteger(_e[Ae])&&(i.value[Ae]=String(_e[Ae]));l.value=new Set,we.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(_e){n.value=_e.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await W({quiet:!0})}}async function F(Y){if(Y!==T.value&&!(!Y&&!await Kt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await U.post("/api/mcp/enabled",{enabled:Y}),we.success(Y?"MCP enabled":"MCP disabled"),await W({quiet:!0})}catch(_e){we.error(_e.message||"Failed to update MCP state"),await W({quiet:!0})}finally{s.value=!1}}}async function R(Y){J(Y.name,!0);try{await U.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/reconnect`,{}),we.success(`Reconnected ${Y.name}`)}catch(_e){we.error(_e.message||`Failed to reconnect ${Y.name}`)}finally{J(Y.name,!1),await W({quiet:!0})}}async function Z(Y){J(Y.name,!0);try{await U.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/refresh-tools`,{}),we.success(`Refreshed tools from ${Y.name}`),await ve(Y.name,!0)}catch(_e){we.error(_e.message||`Failed to refresh ${Y.name}`)}finally{J(Y.name,!1),await W({quiet:!0})}}async function ee(Y){if(await Kt({title:`Remove ${Y.name}`,message:`Remove this saved MCP server? Its ${Y.published_count||0} published tool${Y.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){J(Y.name,!0);try{await U.del(`/api/mcp/servers/${encodeURIComponent(Y.name)}`),we.success(`Removed ${Y.name}`),delete p.value[Y.name]}catch(Ae){we.error(Ae.message||`Failed to remove ${Y.name}`)}finally{J(Y.name,!1),await W({quiet:!0})}}}async function ne(Y){const _e=new Set(d.value);if(_e.has(Y.name)){_e.delete(Y.name),d.value=_e;return}_e.add(Y.name),d.value=_e,Object.hasOwn(p.value,Y.name)||await ve(Y.name)}async function ve(Y,_e=!1){if(!_e&&Object.hasOwn(p.value,Y))return;const Ae=new Set(m.value);Ae.add(Y),m.value=Ae,h.value={...h.value,[Y]:""};try{const Le=await U.get(`/api/mcp/servers/${encodeURIComponent(Y)}/tools`);p.value={...p.value,[Y]:Le.tools||[]}}catch(Le){h.value={...h.value,[Y]:Le.message||"Failed to load tools"}}finally{const Le=new Set(m.value);Le.delete(Y),m.value=Le}}function H(Y){return(p.value[Y]||[]).filter(_e=>Dk(_e,u.value[Y]))}function Q(Y,_e){u.value={...u.value,[Y]:_e}}function X(){E.value="add",I.value="",y.value=null,g.value=$r(),b.value="",v.value=!0}function pe(Y){E.value="edit",I.value=Y.name,y.value=Y,g.value={...$r(),name:Y.name,enabled:!!Y.enabled,transport:Y.transport||"stdio"},b.value="",v.value=!0}function he(){S.value||(v.value=!1)}function xe(Y){v.value&&Mk(Y)}function Oe(Y){const _e=Y==="headers"?"headerRows":"envRows";g.value[_e].push({key:"",value:""})}function ge(Y,_e){const Ae=Y==="headers"?"headerRows":"envRows";g.value[Ae].splice(_e,1)}function He(Y,_e){const Ae=Y==="headers"?"headersRemove":"envRemove",Le=g.value[Ae];g.value[Ae]=Le.includes(_e)?Le.filter(se=>se!==_e):[...Le,_e]}async function Be(){var _e,Ae;b.value="";let Y;try{Y=Ok(g.value,{mode:E.value,originalTransport:((_e=y.value)==null?void 0:_e.transport)||""})}catch(Le){b.value=Le instanceof Ms?Le.message:"Invalid MCP server configuration",await It(),(Ae=document.querySelector(".mcp-editor"))==null||Ae.scrollTo({top:0,behavior:"smooth"});return}if(!(E.value==="edit"&&Lk(Y,y.value)&&!await Kt({title:`Change ${I.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){S.value=!0;try{E.value==="add"?await U.post("/api/mcp/servers",Y):await U.put(`/api/mcp/servers/${encodeURIComponent(I.value)}`,Y),we.success(E.value==="add"?`Saved ${Y.name}`:`Updated ${I.value}`),v.value=!1,await W({quiet:!0})}catch(Le){b.value=Le.message||"Failed to save MCP server"}finally{S.value=!1}}}let ze=null;function Qe(Y){`${(Y==null?void 0:Y.event)||""} ${(Y==null?void 0:Y.type)||""} ${(Y==null?void 0:Y.tool)||""} ${(Y==null?void 0:Y.message)||""}`.toLowerCase().includes("mcp")&&(ze&&window.clearTimeout(ze),ze=window.setTimeout(()=>W({quiet:!0}),200))}function ot(){k||(k=!0,x||(st.subscribe("events",Qe),x=!0),W(),le())}function nt(){k=!1,B(),ze&&window.clearTimeout(ze),ze=null,x&&(st.unsubscribe("events",Qe),x=!1)}return Ge(ot),Xt(ot),Vt(nt),ft(nt),{status:e,loading:t,mutating:s,pageError:r,servers:$,masterEnabled:T,aggregate:M,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:Fe,saveLimits:C,expandedServers:d,toolQueries:u,toolErrors:h,toolsLoading:m,editorOpen:v,editorMode:E,editingName:I,editingServer:y,form:g,formError:b,saving:S,editorGroups:O,configuredHeaderKeys:V,configuredEnvKeys:G,savedHttpEndpoint:P,endpointRequired:L,endpointFieldLabel:N,endpointPlaceholder:te,refreshAll:W,busy:re,serverState:fe,stateLabel:de,transportLabel:q,protocolLabel:ce,toolSummary:ue,formatAge:Bk,setMasterEnabled:F,togglePending:me,toggleServerEnabled:ye,reconnect:R,refreshTools:Z,removeServer:ee,toggleTools:ne,filteredTools:H,setToolQuery:Q,openAdd:X,openEdit:pe,closeEditor:he,jumpToEditorGroup:xe,addSecretRow:Oe,removeSecretRow:ge,toggleSecretRemoval:He,saveServer:Be}}};function Hk(e,t){if(!e||!t)return gp(e);const s=gp(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const zk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let E=null;const I=f(null),y=f(!1),g=f({}),b=f({}),S=f({}),_=f({}),w=new Map,k=f(null),x=j(()=>e.value.reduce((B,W)=>B+(W.chunks||0),0)),O=j(()=>new Set(e.value.map(W=>W.uploader).filter(Boolean)).size);function $(B,W){const re=b.value[W];if(!re||re.length===0)return 0;const J=Math.max(...re.map(fe=>fe.char_count||0));return J===0?0:Math.round(B.char_count/J*100)}async function T(){t.value=!0,s.value=null;try{const B=await U.get("/api/knowledge");e.value=Array.isArray(B)?B:[]}catch(B){s.value=B.message}t.value=!1}async function M(B){if(g.value[B]){g.value[B]=!1,k.value=null;return}if(g.value[B]=!0,Object.prototype.hasOwnProperty.call(b.value,B))return;if(w.has(B))return w.get(B);const W={..._.value,[B]:!0};_.value=W;const re={...S.value};delete re[B],S.value=re;const J=U.get(`/api/knowledge/${encodeURIComponent(B)}/chunks`).then(fe=>{b.value={...b.value,[B]:Array.isArray(fe)?fe:[]}}).catch(fe=>{S.value={...S.value,[B]:fe.message||"load failed"}}).finally(()=>{if(w.get(B)!==J)return;w.delete(B);const fe={..._.value};delete fe[B],_.value=fe});return w.set(B,J),J}let V=0;async function G(){const B=a.value.trim();if(!B)return;const W=++V;i.value=!0,o.value=null,l.value=B;try{const re=await U.get(`/api/knowledge/search?q=${encodeURIComponent(B)}`);if(W!==V)return;n.value=Array.isArray(re)?re:[]}catch(re){if(W!==V)return;n.value=[],o.value=re.message||"Search failed"}W===V&&(i.value=!1)}function P(){V+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function L(){u.value=null,p.value=null;const B=c.value.trim(),W=d.value.trim();if(!B){u.value="Source name is required";return}if(!W){u.value="Content is required";return}h.value=!0;try{const re=await U.post("/api/knowledge",{source:B,content:W});p.value=`Ingested ${re.chunks||0} chunks from "${B}"`,c.value="",d.value="",b.value={},await T(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(re){u.value=re.message}h.value=!1}async function N(B){m.value=B,v.value=null,E&&(clearTimeout(E),E=null);try{const W=await U.post(`/api/knowledge/${encodeURIComponent(B)}/reingest`);v.value={source:B,error:!1,message:`Re-ingested ${W.chunks||0} chunks`},delete b.value[B],await T(),E=setTimeout(()=>{v.value=null,E=null},3e3)}catch(W){v.value={source:B,error:!0,message:W.message}}m.value=null}function te(B){I.value=B}async function le(){if(I.value){y.value=!0;try{await U.del(`/api/knowledge/${encodeURIComponent(I.value)}`),delete b.value[I.value],await T()}catch(B){we.error(`Failed to delete source: ${B.message||"unknown error"}`)}y.value=!1,I.value=null}}return Ge(()=>{T()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:I,deleting:y,expanded:g,sourceChunks:b,chunkErrors:S,loadingChunks:_,selectedChunk:k,totalChunks:x,uploaderCount:O,truncate:Dd,formatTs:In,highlightTerms:Hk,chunkBarWidth:$,fetchSources:T,toggleSource:M,doSearch:G,clearSearch:P,doIngest:L,doReingest:N,confirmDelete:te,doDelete:le}}},jk={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),E=f(null),I=f(new Set),y=f(null),g=f(!1),b=f(!1),S=j(()=>e.value.reduce((W,re)=>W+re.count,0)),_=j(()=>I.value.size);function w(W){const re=t.value[W];if(!re)return[];if(!l.value.trim())return re;const J=l.value.trim().toLowerCase();return re.filter(fe=>fe.key.toLowerCase().includes(J)||fe.value&&fe.value.toLowerCase().includes(J))}function k(W,re){return I.value.has(W+"/"+re)}function x(W,re){const J=W+"/"+re,fe=new Set(I.value);fe.has(J)?fe.delete(J):fe.add(J),I.value=fe}function O(W){const re=t.value[W];return!re||re.length===0?!1:re.every(J=>I.value.has(W+"/"+J.key))}function $(W,re){const J=t.value[W];if(!J)return;const fe=new Set(I.value);for(const de of J){const q=W+"/"+de.key;re?fe.add(q):fe.delete(q)}I.value=fe}async function T(){s.value=!0,a.value=null;try{const W=await U.get("/api/memory");e.value=Object.entries(W).map(([re,J])=>({name:re,keys:J.keys||[],count:J.count||0}))}catch(W){a.value=W.message}s.value=!1}async function M(W){if(n.value[W]){n.value[W]=!1;return}n.value[W]=!0;const re=e.value.find(fe=>fe.name===W);if(!re||t.value[W]||i.value===W)return;i.value=W;let J;try{const de=(await U.get(`/api/memory/${encodeURIComponent(W)}`)).entries||{};J=re.keys.map(q=>Object.prototype.hasOwnProperty.call(de,q)?{key:q,value:de[q]||"",failed:!1}:{key:q,value:"",failed:!0,error:"Not found in scope"})}catch(fe){J=re.keys.map(de=>({key:de,value:"",failed:!0,error:fe.message||"Failed to load"}))}t.value[W]=J,i.value=null}function V(W,re,J){p.value=W+"/"+re,h.value=J}async function G(W,re){m.value=!0,v.value=null;try{await U.put(`/api/memory/${encodeURIComponent(W)}/${encodeURIComponent(re)}`,{value:h.value});const J=t.value[W];if(J){const fe=J.find(de=>de.key===re);fe&&(fe.value=h.value)}p.value=null}catch(J){v.value=`Failed to save: ${J.message||"unknown error"}`}m.value=!1}async function P(W,re){try{await navigator.clipboard.writeText(re.value),E.value=W+"/"+re.key,setTimeout(()=>{E.value=null},1500)}catch{}}async function L(){d.value=null,u.value=null;const W=r.value.scope.trim(),re=r.value.key.trim(),J=r.value.value.trim();if(!W){d.value="Scope is required";return}if(!re){d.value="Key is required";return}if(!J){d.value="Value is required";return}c.value=!0;try{await U.put(`/api/memory/${encodeURIComponent(W)}/${encodeURIComponent(re)}`,{value:J}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await T(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(fe){d.value=fe.message}c.value=!1}function N(W,re){y.value={scope:W,key:re}}async function te(){if(!y.value)return;g.value=!0,v.value=null;const{scope:W,key:re}=y.value;try{await U.del(`/api/memory/${encodeURIComponent(W)}/${encodeURIComponent(re)}`);const J=t.value[W];J&&(t.value[W]=J.filter(q=>q.key!==re));const fe=e.value.find(q=>q.name===W);fe&&(fe.count--,fe.keys=fe.keys.filter(q=>q!==re));const de=new Set(I.value);de.delete(W+"/"+re),I.value=de}catch(J){v.value=`Failed to delete: ${J.message||"unknown error"}`}g.value=!1,y.value=null}function le(){b.value=!0}async function B(){g.value=!0,v.value=null;const W=[];for(const re of I.value){const J=re.indexOf("/");W.push({scope:re.slice(0,J),key:re.slice(J+1)})}try{await U.post("/api/memory/bulk-delete",{entries:W}),I.value=new Set,t.value={},await T()}catch(re){v.value=`Bulk delete failed: ${re.message||"unknown error"}`}g.value=!1,b.value=!1}return Ge(()=>{T()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:E,selected:I,selectedCount:_,totalEntries:S,deleteTarget:y,deleting:g,showBulkDelete:b,fetchMemory:T,toggleScope:M,startEdit:V,doEdit:G,copyValue:P,doAdd:L,confirmDelete:N,doDelete:te,confirmBulkDelete:le,doBulkDelete:B,isSelected:k,toggleSelect:x,isScopeAllSelected:O,toggleSelectAll:$,filteredEntries:w}}},Vk={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=j(()=>[...new Set(e.value.map(E=>E.category))].sort()),r=j(()=>{const v={};return e.value.forEach(E=>{v[E.category]=(v[E.category]||0)+1}),v}),c=j(()=>n.value?e.value.filter(v=>v.category===n.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await U.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,we.success("Entry updated"),await m()}catch(E){we.error(E.message||"Failed to save entry")}}async function h(v){if(await Kt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/learned/"+encodeURIComponent(v)),we.success("Entry deleted"),await m()}catch(I){we.error(I.message||"Failed to delete entry")}}async function m(){s.value=!0,a.value=null;try{const v=await U.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){a.value=v.message}s.value=!1}return Ge(m),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:In,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:m}}},mv=[{id:"tools",label:"Tools",component:Tk},{id:"skills",label:"Skills",component:Ak},{id:"mcp-servers",label:"MCP Servers",component:Uk},{id:"knowledge",label:"Knowledge",component:zk},{id:"memory",label:"Memory",component:jk},{id:"learned",label:"Learned",component:Vk}],qk={components:{TabbedPage:rr},setup(){return{tabs:mv}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Gk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Kk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Wk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Jk={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=j(()=>e.value.components||[]),l=j(()=>Wk[e.value.overall]||"text-gray-400"),o=j(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=j(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return Gk[_]||"text-gray-400"}function d(_){return Kk[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function p(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function h(_){return _.replace(/_/g," ").replace(/\b\w/g,w=>w.toUpperCase())}function m(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function v(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function E(){n.value=!0;try{e.value=await U.get("/api/health/components"),s.value=null,a.value=!0}catch(_){s.value=_.message}finally{t.value=!1,n.value=!1}}function I(){t.value=!0,s.value=null,E()}let y=null,g=!1;function b(){g||(g=!0,E(),y||(y=setInterval(E,3e4)))}function S(){g&&(g=!1,y&&(clearInterval(y),y=null))}return Ge(b),Xt(b),Vt(S),ft(S),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:E,retry:I}}},Zk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=j(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=j(()=>{if(!i.value)return[];const E=i.value,I=E.storage_total_bytes||1;return[{label:"Session Persistence",mb:E.sessions.persist_dir.total_mb,bytes:E.sessions.persist_dir.total_bytes,files:E.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(E.sessions.persist_dir.total_bytes/I*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:E.knowledge.db_file.total_mb,bytes:E.knowledge.db_file.total_bytes,files:E.knowledge.db_file.file_count,pct:Math.min(100,Math.round(E.knowledge.db_file.total_bytes/I*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:E.trajectories.message_dir.total_mb,bytes:E.trajectories.message_dir.total_bytes,files:E.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.message_dir.total_bytes/I*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:E.trajectories.agent_dir.total_mb,bytes:E.trajectories.agent_dir.total_bytes,files:E.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.agent_dir.total_bytes/I*100)),color:"res-bar-amber"}]});async function d(){try{const E=await U.get("/api/resource-usage");i.value=E,t.value=null,s.value=!0}catch(E){t.value=E.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ge(m),Xt(m),Vt(v),ft(v),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:Pd,refresh:u,retry:p}}},Yk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),Qk=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function Xk(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!Qk.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?fl(t):""}function eS(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!Yk.has(c)));s=Object.keys(r).length?fl(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const Xa=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),hl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function tS(e){const t=Xa(e)?e:{},s=Xa(t.metadata)?t.metadata:{},a=Xa(t.audit_metadata)?t.audit_metadata:{},n=Xa(t.turn)?t.turn:{},i=l=>hl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function kp(e){return e.record?JSON.stringify(vv(e),null,2):e.text}function vv(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function Cc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function Sp(e){if(!Cc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,hl(s.channel_id),hl(s.user_id??s.actor)])}function sS(e,t,s=2e3){var i,l,o;const a=Sp(t),n=a?e.findIndex(r=>Sp(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:Cc(y)==="end"?1:0,p=[...c].sort((y,g)=>u(y)-u(g)),h=Object.assign({},...p);h.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const g=p.filter(b=>Xa(b[y])).map(b=>b[y]);g.length&&(h[y]=Object.assign({},...g))}const m=c.some(y=>Cc(y)!=="start"),v=c.find(y=>Ec(y,0).level==="ERROR"),E=(v==null?void 0:v.status)||((i=v==null?void 0:v.metadata)==null?void 0:i.status);h.status=v?["failed","error","cancelled","denied","outcome_unknown"].includes(E)?E:"failed":m?h.status||((l=h.metadata)==null?void 0:l.status)||"succeeded":"started",m&&h.status==="started"&&(h.status="succeeded"),v&&(h.error=v.error||((o=v.metadata)==null?void 0:o.error)||h.error);const I=Ec(h,r.id,r._time);Object.assign(I,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(n,1,I)}e.length>s&&e.splice(0,e.length-s)}function Ec(e,t,s=new Date){var u,p;let a=e;if(Xa(e)&&e.type==="log"&&"line"in e?a=e.line:Xa(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=Xa(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(h=>["failed","error","cancelled","denied","outcome_unknown"].includes(h))?"ERROR":hl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:hl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:tS(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function aS(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const nS={components:{ToolOutput:cr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=j(()=>eS(e.entry)),s=j(()=>{var o;return fl(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=j(()=>{var o,r,c;return fl(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=j(()=>Xk(e.entry.record)),i=j(()=>vv(e.entry)),l=j(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},iS=["INFO","WARNING","ERROR"],lS=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Br=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],oS=[50,100,200,500],rS={components:{ToolOutput:cr,LogRecord:nS},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(st.state||"disconnected"),u=j(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),h=f(!1),m=f(null),v=2e3,E=iS,I=lS,y=Br,g=f("all"),b=f(""),S=f([]),_=f(!1),w=f(""),k=f([]);function x(){try{const ie=localStorage.getItem("odin-log-presets");ie&&(S.value=JSON.parse(ie))}catch{}}function O(){try{localStorage.setItem("odin-log-presets",JSON.stringify(S.value))}catch{}}const $=j(()=>l.value!==""||o.value.trim()!==""||b.value!==""),T=j(()=>{const ie=Br.find(Te=>Te.value===b.value);return ie?ie.label:""}),M=j(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ie){return ie.message}}),V=24,G=j(()=>{if(W.value.length===0)return[];const ie=[],Te=new Date,$e=3600*1e3;for(let et=V-1;et>=0;et--){const dt=new Date(Te.getTime()-(et+1)*$e),mt=new Date(Te.getTime()-et*$e);ie.push({start:dt,end:mt,label:te(dt,mt),shortLabel:mt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const et of W.value){if(!et._time)continue;const dt=et._time.getTime();for(const mt of ie)if(dt>=mt.start.getTime()&&dt<mt.end.getTime()){mt.total++,et.level==="ERROR"?mt.errors++:et.level==="WARNING"?mt.warnings++:mt.info++;break}}return ie}),P=j(()=>{let ie=1;for(const Te of G.value)Te.total>ie&&(ie=Te.total);return ie}),L=j(()=>{if(G.value.length===0)return"";const ie=W.value.map(et=>et._time&&et._time.getTime()).filter(Boolean);if(ie.length===0)return"";const Te=new Date(Math.min(...ie));return`${W.value.length} shown, oldest ${Te.toLocaleTimeString()}`}),N=j(()=>Math.ceil(V/8));function te(ie,Te){const $e={hour:"2-digit",minute:"2-digit"};return ie.toLocaleTimeString([],$e)+" - "+Te.toLocaleTimeString([],$e)}function le(ie,Te){return!Te||!ie?"0px":Math.max(2,ie/Te*100)+"%"}function B(ie){const Te=W.value.findIndex($e=>$e._time&&$e._time.getTime()>=ie.start.getTime()&&$e._time.getTime()<ie.end.getTime());if(Te>=0&&p.value){const $e=p.value.querySelector('[data-log-id="'+W.value[Te].id+'"]');$e&&($e.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const W=j(()=>{let ie=t.value;if(l.value&&(ie=ie.filter(Te=>(Te.level||"INFO")===l.value)),b.value){const Te=Br.find($e=>$e.value===b.value);if(Te&&Te.seconds){const $e=new Date(Date.now()-Te.seconds*1e3);ie=ie.filter(et=>et._time&&et._time>=$e)}}if(o.value&&!M.value)if(r.value)try{const Te=new RegExp(o.value,"i");ie=ie.filter($e=>{const et=$e.searchText,dt=$e.tool||"";return Te.test(et)||Te.test(dt)})}catch{}else{const Te=o.value.toLowerCase();ie=ie.filter($e=>{const et=$e.searchText.toLowerCase(),dt=($e.tool||"").toLowerCase();return et.includes(Te)||dt.includes(Te)})}return ie}),re=j(()=>aS(W.value));function J(ie){const Te=Ec(ie,++s);if(n.value){k.value.push(Te);return}fe(Te)}function fe(ie){sS(t.value,ie,v),i.value&&It(()=>de())}function de(ie=!1){const Te=p.value;Te&&Te.scrollTo({top:Te.scrollHeight,behavior:ie?"smooth":"instant"})}function q(){i.value=!0,h.value=!1,It(()=>de(!0))}const ce=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function ue(){const ie=p.value;if(!ie)return;const Te=ie.scrollHeight-ie.scrollTop-ie.clientHeight<40;h.value=!i.value&&!Te&&t.value.length>0,C.value&&me()}function me(){const ie=p.value;!ie||!i.value||ie.scrollHeight-ie.scrollTop-ie.clientHeight>=40&&(i.value=!1,h.value=t.value.length>0)}function ye(){i.value&&requestAnimationFrame(me)}function Fe(ie){ce.has(ie.key)&&ye()}const C=f(!1);function F(){i.value&&(C.value=!0,requestAnimationFrame(me))}function R(){C.value&&(C.value=!1,me())}function Z(){i.value&&(h.value=!1,It(()=>de()))}function ee(){if(n.value=!n.value,!n.value&&k.value.length>0){for(const ie of k.value)fe(ie);k.value=[]}}function ne(){t.value=[],k.value=[],h.value=!1}function ve(){let ie;e.value==="search"?ie=Ne.value.map(dt=>{const mt=dt.error?"ERROR":"INFO",ha=dt.tool_name?`[${dt.tool_name}] `:"";return`${dt.timestamp||""} ${mt} ${ha}${dt.result_summary||dt.message||""}`}).join(`
`):ie=W.value.map(kp).join(`

`);const Te=new Blob([ie],{type:"text/plain"}),$e=URL.createObjectURL(Te),et=document.createElement("a");et.href=$e,et.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,et.click(),URL.revokeObjectURL($e)}function H(ie){const Te=kp(ie);navigator.clipboard.writeText(Te).then(()=>{m.value=ie.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function Q(ie){l.value=l.value===ie?"":ie,g.value="all"}function X(ie){return ie.level==="ERROR"?"log-line-error":ie.level==="WARNING"?"log-line-warning":"text-gray-300"}function pe(ie){return ie==="ERROR"?"text-red-500 font-semibold":ie==="WARNING"?"text-yellow-500":"text-blue-500"}function he(ie){return ie==="ERROR"?"log-chip-error":ie==="WARNING"?"log-chip-warning":"log-chip-info"}function xe(ie){g.value=ie.id;const Te=ie.filters;l.value=Te.level||"",b.value=Te.timeRange||"",o.value=Te.text||"",Te.levels&&(l.value=Te.levels[0]||""),Te.hasToolName&&(o.value="")}function Oe(ie){g.value=ie.id,l.value=ie.filters.level||"",b.value=ie.filters.timeRange||"",o.value=ie.filters.text||""}function ge(){if(!w.value.trim())return;const ie={id:"custom-"+Date.now(),name:w.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};S.value=[...S.value,ie],O(),_.value=!1,w.value=""}function He(ie){S.value=S.value.filter(Te=>Te.id!==ie),O(),g.value===ie&&(g.value="all")}const Be=f("all"),ze=f(""),Qe=f(""),ot=f(""),nt=f(""),Y=f(""),_e=f(100),Ae=oS,Le=f(!1),se=f(!1),Ee=f(""),Ne=f([]),Je=f(null),Lt=f(null);function Ke(){e.value="search",Je.value||Bt()}async function Bt(){try{Je.value=await U.get("/api/logs/stats")}catch{}}function Ut(){const ie=Y.value;if(!ie){ot.value="",nt.value="";return}const $e={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ie];if($e){const et=new Date(Date.now()-$e*1e3);ot.value=hs(et),nt.value=""}}function hs(ie){const Te=$e=>String($e).padStart(2,"0");return`${ie.getFullYear()}-${Te(ie.getMonth()+1)}-${Te(ie.getDate())}T${Te(ie.getHours())}:${Te(ie.getMinutes())}`}function Ys(ie){if(!ie)return"";const Te=new Date(ie);return isNaN(Te.getTime())?"":Te.toISOString()}async function Os(){Le.value=!0,Ee.value="",se.value=!0,Lt.value=null;try{const ie=new URLSearchParams;Be.value&&Be.value!=="all"&&ie.set("level",Be.value),ze.value&&ie.set("tool",ze.value),Qe.value&&ie.set("q",Qe.value);const Te=Ys(ot.value),$e=Ys(nt.value);Te&&ie.set("start",Te),$e&&ie.set("end",$e),ie.set("limit",String(_e.value));const et=await U.get(`/api/logs/search?${ie.toString()}`);Ne.value=et.entries||[]}catch(ie){Ee.value=ie.message||"Search failed",Ne.value=[]}finally{Le.value=!1}}function nn(){Be.value="all",ze.value="",Qe.value="",ot.value="",nt.value="",Y.value="",_e.value=100,Ne.value=[],se.value=!1,Ee.value="",Lt.value=null}function Qs(ie){Lt.value=Lt.value===ie?null:ie}function zs(ie){if(!ie.timestamp)return"";try{return new Date(ie.timestamp).toLocaleString()}catch{return ie.timestamp}}function Ha(ie){return ie.type==="web_action"?`${ie.status||""} (${ie.execution_time_ms||0}ms)`:(ie.result_summary||"").slice(0,200)}function ws(ie){return ie.error?"log-line-error":"text-gray-300"}function fa(ie){try{return JSON.stringify(ie,null,2)}catch{return String(ie)}}let Ls=null,at=!1;function Ns(){at||(at=!0,st.subscribe("logs",J),c.value=st.connected,d.value=st.state||"disconnected",Ls=st.onState(ie=>{d.value=ie,c.value=ie==="connected"}))}function ks(){at&&(at=!1,st.unsubscribe("logs",J),Ls&&(Ls(),Ls=null))}return Ge(()=>{x(),window.addEventListener("pointerup",R),window.addEventListener("pointercancel",R)}),Xt(Ns),Vt(ks),ft(()=>{ks(),window.removeEventListener("pointerup",R),window.removeEventListener("pointercancel",R)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:re,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:W,pauseBuffer:k,showJumpBottom:h,copiedIndex:m,regexError:M,levels:E,logPresets:I,timeRanges:y,timeRange:b,activeLogPreset:g,customLogPresets:S,showSaveLogPreset:_,newLogPresetName:w,hasActiveLogFilters:$,timeRangeLabel:T,timelineBuckets:G,timelineMax:P,timelineSpanLabel:L,timelineLabelSkip:N,togglePause:ee,clearLogs:ne,exportLogs:ve,logLineClass:X,levelClass:pe,levelChipClass:he,toggleLevel:Q,copyLine:H,jumpToBottom:q,onScroll:ue,onUserScrollIntent:ye,onUserScrollKey:Fe,onAutoScrollToggle:Z,onPointerDown:F,applyLogPreset:xe,applyCustomLogPreset:Oe,saveLogCustomPreset:ge,removeLogCustomPreset:He,segmentHeight:le,jumpToTimelineBucket:B,searchLevel:Be,searchTool:ze,searchKeyword:Qe,searchStart:ot,searchEnd:nt,searchTimePreset:Y,searchLimit:_e,searchLimits:Ae,searching:Le,searchRan:se,searchError:Ee,searchResults:Ne,searchStats:Je,expandedSearch:Lt,switchToSearch:Ke,runSearch:Os,clearSearchFilters:nn,toggleSearchExpand:Qs,formatSearchTs:zs,searchEntryText:Ha,searchLogLineClass:ws,formatJson:fa,applySearchTimePreset:Ut}}};function Vl(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const cS=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function dS(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const ni=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],uS={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},ql=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),pS=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Tp(e){return pS.some(t=>e===t||e.startsWith(`${t}.`))}const gv="odin_config_center_expanded_v1",bv="odin_config_center_category_v1",fS=50,hS=650,Ai=()=>U.get("/api/config/meta");function pn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Wn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Bn(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function mS(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function vS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function yv(e,t){if(Wn(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return pn(t);const a={};for(const[n,i]of Object.entries(t)){const l=yv(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function gS(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=yv(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function xv(e,t,s,a){if(Wn(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)xv(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function bS(){try{const e=JSON.parse(localStorage.getItem(gv)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function yS(){try{const e=localStorage.getItem(bv);return ni.some(t=>t.key===e)?e:ni[0].key}catch{return ni[0].key}}const xS={template:`
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
          <h2 id="listener-consent-title" class="font-semibold mb-2">Web listener exposure</h2>
          <p class="text-sm text-gray-400 mb-3">Fresh installs remain loopback-only after setup. To use the saved web.host beyond loopback, sign in as an authenticated administrator and explicitly authorize it here. Save the intended web.host first. Keep TLS and network access controls in place.</p>
          <label class="text-sm block mb-3"><input type="checkbox" v-model="listenerConsent" :disabled="listenerSaving" /> I authorize access beyond loopback using the saved web.host on the next restart.</label>
          <label class="text-sm block mb-3">Re-enter a current admin API token
            <input type="password" v-model="listenerCredential" autocomplete="off" :disabled="listenerSaving" aria-label="Admin API token for listener consent" />
          </label>
          <p class="text-xs text-gray-400 mb-3">Your browser session alone cannot authorize exposure. This token is used only for this request, not saved or used to replace your session.</p>
          <button type="button" class="btn btn-ghost text-xs" @click="saveListenerConsent" :disabled="!listenerConsent || !listenerCredential.trim() || listenerSaving || hasChanges">{{ listenerSaving ? 'Saving consent…' : 'Save listener consent' }}</button>
          <p class="text-xs text-gray-400 mt-2">This does not restart Odin or change the running listener. An operator restart is required.</p>
          <p v-if="listenerMessage" role="status" class="text-sm mt-2">{{ listenerMessage }}</p>
          <p v-if="listenerError" role="alert" class="text-sm text-red-400 mt-2">{{ listenerError }}</p>
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(!1),l=f(""),o=f(!1),r=f(""),c=f("");async function d(){if(!(!i.value||!l.value.trim()||o.value||ye.value)){o.value=!0,r.value="",c.value="";try{const A=U.consentListener(l.value.trim());l.value="";const z=await A;r.value=z.message,i.value=!1}catch(A){c.value=A.message||"Listener consent could not be saved."}finally{l.value="",o.value=!1}}}const u=f(null),p=["image_model","outer_model"],h=f(null),m=f(null),v=f(null),E=f(!1),I=f(!1),y=f(null),g=f(""),b=f("all"),S=f(yS()),_=f(bS()),w=f({}),k=f({}),x=f(""),O=f({}),$=f({}),T=f([]),M=f([]),V=f(!1),G=f(!1),P=f(!1);let L=null,N=null,te={path:null,at:0},le=0;const B=j(()=>{var A;return(((A=t.value)==null?void 0:A.fields)||[]).filter(z=>!ql.has(z.path.split(".")[0])&&!Tp(z.path))}),W=j(()=>new Map(B.value.map(A=>[A.path,A]))),re=j(()=>ce.value.reduce((A,z)=>A+z.sections.length,0)),J=j(()=>B.value.length),fe=j(()=>cS),de=j(()=>T.value.length>0),q=j(()=>M.value.length>0),ce=j(()=>{if(!e.value)return[];const A=new Set(ni.flatMap(Se=>Se.sections)),z=ni.map(Se=>({...Se,sections:Se.sections.filter(We=>Object.hasOwn(e.value,We)&&!ql.has(We))})).filter(Se=>Se.sections.length),ae=Object.keys(e.value).filter(Se=>!A.has(Se)&&!ql.has(Se));return ae.length&&z.push({key:"other",label:"Other",icon:"folder",sections:ae}),z}),ue=j(()=>e.value?{...e.value,...w.value}:null),me=j(()=>{if(!e.value)return[];const A=[];for(const[z,ae]of Object.entries(w.value))xv(e.value[z],ae,z,A);return A.filter(z=>!Wn(z.oldVal,z.newVal)).map(z=>{const ae=X(z.path);return{...z,label:(ae==null?void 0:ae.label)||Bn(z.path.split(".").at(-1)),apply_mode:(ae==null?void 0:ae.apply_mode)||Be(z.path.split(".")[0])}})}),ye=j(()=>me.value.length>0),Fe=j(()=>me.value.length),C=j(()=>new Set(me.value.map(A=>A.path.split(".")[0])).size),F=j(()=>!!g.value||b.value!=="all"),R=j(()=>{const A={...$.value};for(const z of me.value){const ae=X(z.path),Se=Ss(ae,z.newVal);Se&&(A[z.path]=Se)}return A}),Z=j(()=>Object.keys(R.value).length>0),ee=j(()=>e.value?(F.value?ce.value:ce.value.filter(z=>z.key===S.value)).map(z=>({...z,sections:z.sections.filter(ae=>Ut(ae))})).filter(z=>z.sections.length):[]),ne=j(()=>{const A=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],z=new Map(A.map(ae=>[ae,[]]));for(const ae of me.value){const Se=z.has(ae.apply_mode)?ae.apply_mode:"restart";z.get(Se).push(ae)}return A.filter(ae=>z.get(ae).length).map(ae=>({key:ae,label:Ce(ae),entries:z.get(ae)}))}),ve=j(()=>me.value.filter(A=>A.apply_mode==="restart").length),H=j(()=>B.value.filter(A=>A.pending_restart)),Q=j(()=>H.value.length);function X(A){const z=W.value.get(A);return z?{...z,apply_details:Vl([z])}:null}function pe(A){const z=`${A}.`;return B.value.filter(ae=>ae.path===A||ae.path.startsWith(z))}function he(){return B.value.some(A=>A.path==="tools.hosts"||A.path.startsWith("tools.hosts."))}function xe(){var ae,Se;const A=((Se=(ae=e.value)==null?void 0:ae.tools)==null?void 0:Se.hosts)||{},z=Object.keys(A).length;return`${z} host${z===1?"":"s"} configured.`}function Oe(A){return pe(A).length}function ge(A){return Bn(A)}function He(A){const z=pe(A);if(!z.length)return`${Bn(A)} configuration.`;const ae=z.find(kt=>kt.sensitivity==="public"&&kt.description)||z.find(kt=>kt.description),Se=(ae==null?void 0:ae.description)||"";return Se.match(/setting for (.+)\.$/i)?`${Bn(A)} settings and runtime behaviour.`:Se}function Be(A){const z=[...new Set(pe(A).map(ae=>ae.apply_mode))];return z.length===1?z[0]:z.includes("restart")?"restart":z.includes("activation_required")?"activation_required":z[0]||"restart"}function ze(A){const z=[...new Set(pe(A).map(ae=>Ce(ae.apply_mode)))];return z.length?z.length===1?z[0]:`Mixed apply behaviour: ${z.join(" · ")}`:""}function Qe(A){return Vl(pe(A))}function ot(A){var z;return Object.hasOwn(w.value,A)?w.value[A]:(z=e.value)==null?void 0:z[A]}function nt(){const A=ot("mcp")||{},z=Object.keys(A.servers||{}).length;return`${A.enabled?"Globally enabled":"Globally disabled"} · ${z} configured server${z===1?"":"s"}.`}function Y(A,z){return z.split(".").reduce((ae,Se)=>ae==null?void 0:ae[Se],A)}function _e(A){const z=ue.value;return pe(A).filter(ae=>Tp(ae.path)?!1:ae.path.split(".").length<=2?!0:!ae.path.includes(".*")).map(ae=>({...ae,key:ae.path.split(".").at(-1),value:Y(z,ae.path),apply_details:Vl([ae]),editor:ae.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Ae(A){const z=A.path.split(".");return z.length>2?z.slice(0,2).join("."):null}function Le(A){const z=new Map;for(const ae of _e(A)){const Se=Ae(ae),We=Se||`${A}.__root`;z.has(We)||z.set(We,{key:We,path:Se,entries:[]}),z.get(We).entries.push(ae)}return[...z.values()].map(ae=>{const Se=ae.entries.find(We=>We.group_description);return{...ae,label:ae.path?Bn(ae.path.split(".").at(-1)):null,description:(Se==null?void 0:Se.group_description)||null,apply_details:Vl(ae.entries),runtime_summaries:Ee(ae.entries)}})}function se(A){return{save:A.save_effect||(A.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:A.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[A.apply_mode]||"Effective runtime state is not currently observable."}}function Ee(A){const z=new Map;for(const ae of A){const Se=se(ae),We=`${ae.apply_mode}|${Se.save}|${Se.runtime}`;z.has(We)||z.set(We,{key:We,label:Ce(ae.apply_mode),save:Se.save,runtime:Se.runtime})}return[...z.values()]}function Ne(A){if(Je(A))return A.runtime_effect||A.activation_policy||"";if(A.apply_mode==="activation_required"){const z=A.activation_policy||A.runtime_effect;return z?`Not active after saving. No activation control exists in this release. ${z}`:"Not active after saving; no activation control exists in this release."}return""}function Je(A){return A.action_available===!0&&!!(A.action_label&&A.action_endpoint)}async function Lt(A){if(Je(A))try{if(Qs(A.path))throw new Error("Save this setting before applying its action.");const z=String(A.action_method||"POST").toLowerCase(),ae={post:U.post.bind(U),put:U.put.bind(U),delete:U.del.bind(U)}[z];if(!ae)throw new Error("Unsupported configuration action");await ae(A.action_endpoint,A.action_body||void 0),await fr(),De("success",`${A.action_label} completed.`)}catch(z){De("error",z.message||`${A.action_label} failed`)}}function Ke(A,z){return[A.label,A.path,A.description,...A.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(z)}function Bt(A){const z=g.value.trim().toLowerCase();return z?pe(A).filter(ae=>Ke(ae,z)):[]}function Ut(A){const z=pe(A);if(b.value!=="all"&&!z.some(Se=>Se.apply_state===b.value))return!1;const ae=g.value.trim().toLowerCase();return!ae||`${ge(A)} ${A}`.toLowerCase().includes(ae)?!0:z.some(Se=>Ke(Se,ae))}function hs(A,z){return pe(A).filter(ae=>ae.apply_state===z).length}function Ys(A){return A==="all"?J.value:B.value.filter(z=>z.apply_state===A).length}function Os(A){const z=A.sections.flatMap(ae=>pe(ae));return{fields:z.length,modified:me.value.filter(ae=>A.sections.includes(ae.path.split(".")[0])).length,pending_restart:z.filter(ae=>ae.apply_state==="pending_restart").length,invalid:z.filter(ae=>ae.apply_state==="invalid").length,dormant:z.filter(ae=>ae.apply_state==="dormant").length}}function nn(A){var z;return Object.hasOwn(w.value,A)&&!Wn((z=e.value)==null?void 0:z[A],w.value[A])}function Qs(A){return me.value.some(z=>z.path===A||z.path.startsWith(`${A}.`))}function zs(A){S.value=A,g.value="",b.value="all";try{localStorage.setItem(bv,A)}catch{}}function Ha(A){b.value=A}function ws(){g.value="",b.value="all"}function fa(A){var z;return((z=ce.value.find(ae=>ae.sections.includes(A)))==null?void 0:z.sections)||[]}function Ls(A){const z=fa(A),ae=z.find(Se=>_.value[Se]===!0);return ae||z.find(Se=>_.value[Se]!==!1)||null}function at(A){return g.value&&!P.value&&Ut(A)?!0:P.value?Ls(A)===A:Object.hasOwn(_.value,A)?_.value[A]===!0:!0}function Ns(A){const z=!at(A);if(P.value){const ae={..._.value};for(const Se of fa(A))ae[Se]===!0&&(ae[Se]=!1);ae[A]=z,_.value=ae;return}_.value={..._.value,[A]:z}}function ks(){T.value.push(pn(w.value)),T.value.length>fS&&T.value.shift(),M.value=[]}function ie(){n.value||ye.value&&(ks(),w.value={},$.value={},V.value=!1)}function Te(A,z=!1){const ae=Date.now();if(z&&te.path===A&&ae-te.at<hS){te.at=ae;return}ks(),te={path:A,at:ae}}function $e(A,z,ae){if(!z.length)return ae;const Se=pn(A??{});let We=Se;for(let kt=0;kt<z.length-1;kt+=1){const qs=z[kt];We[qs]=pn(We[qs]??{}),We=We[qs]}return We[z.at(-1)]=ae,Se}function et(A){var z;return Object.hasOwn(w.value,A)?w.value[A]:pn((z=e.value)==null?void 0:z[A])}function dt(A,z,ae={}){var Pn;if(n.value||ql.has(A.path.split(".")[0]))return;const[Se,...We]=A.path.split(".");Te(A.path,!!ae.coalesce);const kt=et(Se),qs=We.length?$e(kt,We,z):z,ta={...w.value};if(Wn(qs,(Pn=e.value)==null?void 0:Pn[Se])?delete ta[Se]:ta[Se]=qs,w.value=ta,$.value[A.path]){const on={...$.value};delete on[A.path],$.value=on}}function mt(A){te={path:null,at:0},k.value={...k.value,[A]:String(Y(ue.value,A)??"")}}function ha(A){if(te={path:null,at:0},!Object.hasOwn(k.value,A))return;const z={...k.value};delete z[A],k.value=z}function js(A){const z=k.value[A.path];if(te={path:null,at:0},z===""){if(A.nullable){ha(A.path),dt(A,null,{coalesce:!0});return}$.value={...$.value,[A.path]:"Enter a number."};return}const ae=Number(z);if(Number.isNaN(ae)||A.type==="integer"&&!Number.isInteger(ae)){$.value={...$.value,[A.path]:A.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Se={...k.value};delete Se[A.path],k.value=Se,dt(A,ae,{coalesce:!0})}function xi(A){return Object.hasOwn(k.value,A.path)?k.value[A.path]:A.value??""}function _i(A,z){if(k.value={...k.value,[A.path]:z},z===""){if(A.nullable){dt(A,null,{coalesce:!0});return}$.value={...$.value,[A.path]:"Enter a number."};return}const ae=Number(z);if(!Number.isFinite(ae)||A.type==="integer"&&!Number.isInteger(ae)){$.value={...$.value,[A.path]:A.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if($.value[A.path]){const Se={...$.value};delete Se[A.path],$.value=Se}dt(A,ae,{coalesce:!0})}function Ln(A){const z=Number.parseInt(x.value,10);if(!Number.isInteger(z)||z<1){$.value={...$.value,[A.path]:"Warning thresholds must be positive whole numbers."};return}const ae=[...new Set([...A.value||[],z])].sort((Se,We)=>We-Se);x.value="",dt(A,ae)}function Nn(A,z){dt(A,(A.value||[]).filter(ae=>ae!==z))}function ln(A){return A.apply_mode==="live_read"?"Odin reads the saved file value on next use.":A.apply_mode==="live_for_new_work"?"New work uses the saved file value.":A.apply_mode==="live_apply"?A.apply_handler?`Apply the saved value through ${A.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":A.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":A.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":A.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function za(A){return A.type==="array"&&Array.isArray(A.value)&&!A.structured_container&&!A.structured_container_child&&A.sensitivity==="public"&&A.value.every(z=>["string","number","boolean"].includes(typeof z))}function Xs(A){const z=String(O.value[A.path]??"").trim();if(!z)return;const ae=[...new Set([...A.value||[],z])];O.value={...O.value,[A.path]:""},dt(A,ae)}function ma(A,z){dt(A,(A.value||[]).filter(ae=>ae!==z))}function Ss(A,z){var Se;if(!A)return null;if((Se=A.enum)!=null&&Se.length&&!A.enum.includes(z))return`Choose one of: ${A.enum.join(", ")}`;if(A.path==="agents.final_warning_iterations"&&(!Array.isArray(z)||!z.length))return"Add at least one warning threshold.";const ae=A.constraints||{};if((A.type==="integer"||A.type==="number")&&typeof z=="number"){if(ae.minimum!==void 0&&z<ae.minimum)return`Must be at least ${ae.minimum}${A.unit?` ${A.unit}`:""}`;if(ae.maximum!==void 0&&z>ae.maximum)return`Must be at most ${ae.maximum}${A.unit?` ${A.unit}`:""}`}return null}function Dn(A){return R.value[A.path]||null}function K(A){const z=`${A}.`;return Object.keys(R.value).some(ae=>ae===A||ae.startsWith(z))}function ke(){n.value||T.value.length&&(M.value.push(pn(w.value)),w.value=T.value.pop(),$.value={},k.value={},te={path:null,at:0})}function Ie(){n.value||M.value.length&&(T.value.push(pn(w.value)),w.value=M.value.pop(),$.value={},k.value={},te={path:null,at:0})}function Vs(){!ye.value||Z.value||(V.value=!0,G.value=!1)}function va(){V.value=!1}function ja(){ie()}function Ce(A){return uS[A]||Bn(A||"unknown")}function D(A){return`apply-${String(A||"unknown").replaceAll("_","-")}`}function oe(A){return`cfgc-field-${A.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function be(A){return`${oe(A)}-input`}function Pe(A){const z=document.getElementById(oe(A))||document.getElementById(oe(A.split(".").slice(0,2).join(".")));z==null||z.scrollIntoView({behavior:"smooth",block:"center"})}function De(A,z){m.value={type:A,message:z},window.setTimeout(()=>{var ae;((ae=m.value)==null?void 0:ae.message)===z&&(m.value=null)},3500)}function je(){E.value=!1,b.value="pending_restart",g.value="";const A=dS(a.value);A&&(A.scrollTop=0)}function At(){E.value=!1}function ht(A=1800){N&&window.clearTimeout(N),N=window.setTimeout(wt,A)}async function wt(){if(I.value){if(le+=1,le>45){I.value=!1,y.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Ai(),Q.value===0){I.value=!1,y.value=null,De("success","Odin restarted and the saved startup settings are active.");return}}catch{}ht(2e3)}}async function ea(){if(!I.value){y.value=null;try{await U.post("/api/restart",{}),I.value=!0,le=0,E.value=!1,ht()}catch(A){y.value=A.message||"Odin could not schedule a restart."}}}async function Nt(){if(!(!ye.value||Z.value||n.value)){n.value=!0;try{const A=gS(e.value,w.value),z=await U.put("/api/config",A);e.value=z,w.value={},T.value=[],M.value=[],$.value={},V.value=!1;try{t.value=await Ai(),v.value=null,E.value=Q.value>0,De("success",Q.value?`Configuration saved. ${Q.value} setting${Q.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(ae){v.value=ae.message||"Unknown metadata error.",De("error",`Configuration saved, but apply status could not be refreshed: ${v.value}`)}}catch(A){De("error",A.message||"Configuration could not be saved")}finally{n.value=!1}}}async function Cl(){if(!n.value){n.value=!0,u.value=null;try{t.value=await Ai(),v.value=null}catch(A){u.value=`Image model status could not be refreshed: ${A.message||"Unknown error"}`}finally{n.value=!1}}}async function El(A,z){if(n.value||!["follow","pin"].includes(z)||!A.length||A.some(Se=>{var We,kt;return!p.includes(Se)||!((kt=(We=t.value)==null?void 0:We.image_model_defaults)!=null&&kt[Se])}))return;n.value=!0,u.value=null;let ae=!1;try{const Se=await U.post("/api/config/image-models",{operations:Object.fromEntries(A.map(We=>[We,z])),expected_revision:t.value.image_model_revision});ae=!0;for(const We of A){const kt=`image.openai.${We}`,qs=Y(e.value,kt),ta=Y(Se.config,kt),Pn=on=>!Object.hasOwn(on,"image")||!Wn(Y(on,kt),qs)?on:$e(on,kt.split("."),ta);w.value=Pn(w.value),T.value=T.value.map(Pn),M.value=M.value.map(Pn),e.value=$e(e.value,kt.split("."),ta)}t.value={...t.value,image_model_defaults:Se.image_model_defaults,image_model_revision:Se.image_model_revision},De("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(Se){u.value=`Image model operation failed: ${Se.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await Ai(),v.value=null}catch(Se){const We=`Image model status could not be refreshed: ${Se.message||"Unknown error"}`;v.value=We,u.value=ae?`Image model defaults were saved, but ${We}`:`${u.value} ${We}`}finally{n.value=!1}}async function fr(){var A,z;if(!(ye.value||n.value)){s.value=!0,h.value=null;try{const ae=await U.get("/api/config"),Se=await Ai();e.value=ae,t.value=Se,v.value=null;const We=ce.value;if(We.some(kt=>kt.key===S.value)||(S.value=((A=We[0])==null?void 0:A.key)||ni[0].key),P.value){const qs=(((z=We.find(ta=>ta.key===S.value))==null?void 0:z.sections)||[]).find(ta=>_.value[ta]===!0);_.value=qs?{..._.value,[qs]:!0}:{}}}catch(ae){h.value=ae.message||"Unknown configuration error"}finally{s.value=!1}}}function hr(A){if(V.value||!(A.ctrlKey||A.metaKey))return;const z=A.target;z instanceof HTMLElement&&(z.matches("input, textarea, select")||z.isContentEditable)||(!A.shiftKey&&A.key.toLowerCase()==="z"?(A.preventDefault(),ke()):(A.key.toLowerCase()==="y"||A.shiftKey&&A.key.toLowerCase()==="z")&&(A.preventDefault(),Ie()))}function mr(A){P.value=A.matches}Ft(_,A=>{try{localStorage.setItem(gv,JSON.stringify(A))}catch{}},{deep:!0});let Al=!1;function vr(){Al||(Al=!0,document.addEventListener("keydown",hr))}function gr(){Al&&(Al=!1,document.removeEventListener("keydown",hr))}return Ge(()=>{var A;fr(),vr(),L=window.matchMedia("(max-width: 760px)"),mr(L),(A=L.addEventListener)==null||A.call(L,"change",mr)}),Xt(vr),Vt(gr),Vt(()=>{l.value=""}),ft(()=>{var A;l.value="",gr(),(A=L==null?void 0:L.removeEventListener)==null||A.call(L,"change",mr),N&&window.clearTimeout(N)}),{listenerConsent:i,listenerCredential:l,listenerSaving:o,listenerMessage:r,listenerError:c,saveListenerConsent:d,armKeydown:vr,disarmKeydown:gr,handleKeydown:hr,config:e,meta:t,loading:s,saving:n,error:h,toast:m,metaRefreshError:v,restartPromptOpen:E,restartScheduled:I,restartError:y,configMain:a,imageModelError:u,imageModelLeaves:p,setImageModelDefaults:El,refreshImageModelMetadata:Cl,searchQuery:g,healthFilter:b,activeCategory:S,reviewOpen:V,mobileOverflowOpen:G,warningThresholdInput:x,arrayInputs:O,healthFilters:fe,visibleCategories:ce,displayGroups:ee,reviewGroups:ne,sectionCount:re,fieldCount:J,hasChanges:ye,changeCount:Fe,changedSectionCount:C,hasDraftErrors:Z,canUndo:de,canRedo:q,globalFilterActive:F,reviewRestartCount:ve,pendingRestartCount:Q,pendingRestartFields:H,healthCount:Ys,categoryStats:Os,selectCategory:zs,selectHealthFilter:Ha,clearFilters:ws,sectionLabel:ge,sectionDescription:He,sectionFieldCount:Oe,sectionHealthCount:hs,sectionApplySummary:ze,sectionApplyDetails:Qe,sectionEntries:_e,fieldGroups:Le,sectionSearchHits:Bt,mcpConfigSummary:nt,fieldRuntimeCopy:se,fieldSpecificRuntimeNote:Ne,hasHonestAction:Je,runFieldAction:Lt,hasHostsCollection:he,hostsConfigSummary:xe,sectionChanged:nn,fieldChanged:Qs,isSectionExpanded:at,toggleSection:Ns,discardAllDrafts:ie,setFieldValue:dt,setNumberFieldValue:_i,numberInputValue:xi,beginInputEdit:mt,endTextInputEdit:ha,endInputEdit:js,addWarningThreshold:Ln,removeWarningThreshold:Nn,isScalarArray:za,addScalarArrayItem:Xs,removeScalarArrayItem:ma,fieldError:Dn,sectionHasErrors:K,undo:ke,redo:Ie,openReview:Vs,closeReview:va,mobileCancel:ja,applyModeLabel:Ce,applyClass:D,compactValue:mS,formatValue:vS,structuredApplyCopy:ln,fieldId:oe,fieldInputId:be,focusField:Pe,fetchConfig:fr,saveConfig:Nt,restartOdin:ea,restartLater:At,reviewPendingRestart:je}}},_S=/^\d{15,25}$/;function _v(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const wv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=j(()=>new Set((e.excludedIds||[]).map(String))),o=j(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(_=>l.value.has(String(_.id))?!1:S?u(_).toLowerCase().includes(S)||String(_.username||"").toLowerCase().includes(S)||String(_.id).includes(S):!0)}),r=j(()=>{const S=s.value.trim();return o.value.length===0&&_S.test(S)&&!l.value.has(S)?S:""}),c=j(()=>o.value.length+(r.value?1:0)),d=j(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(S){return _v(S)}function p(){a.value=!0,n.value=0}function h(){p()}function m(){const S=Math.max(c.value-1,0);n.value=Math.min(n.value+1,S)}function v(){n.value=Math.max(n.value-1,0)}function E(){const S=o.value[n.value];S?I(S):r.value&&n.value===o.value.length&&y(r.value)}function I(S){y(String(S.id))}function y(S){t("select",S),s.value="",a.value=!1,n.value=0}function g(){a.value=!1}function b(){setTimeout(g,150)}return Ge(()=>{e.autofocus&&It(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:E,selectMember:I,selectId:y,closeOptions:g,onBlur:b}}};function Cp(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const wS={components:{DiscordUserCombobox:wv},template:`
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
  `,setup(){const e=f([]),t=f({persisted:!1,active:{state:"unknown"}}),s=f(""),a=f(!1),n=f(null);let i=null;const l=f(!0),o=f(null),r=f({}),c=f(null),d=f(null),u=f(!1),p=f(null),h=f({}),m=f([]);let v=0;const E=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),I=j(()=>JSON.stringify(c.value)!==JSON.stringify(d.value)),y=j(()=>new Map(m.value.map(de=>[String(de.id),de])));function g(de){return de.config&&de.config.enabled!==void 0?de.config.enabled:!0}function b(de){return Cp(de,"require_mention",c.value)}function S(de){return Cp(de,"respond_to_bots",c.value)}function _(de){return de.config&&Object.keys(de.config).length>0}function w(de){r.value[de]=!r.value[de]}function k(de){const q=de.discord||{};return{allowed_users:[...q.allowed_users||[]],channels:[...q.channels||[]],respond_to_bots:!!q.respond_to_bots,require_mention:!!q.require_mention,ignore_bot_ids:[...q.ignore_bot_ids||[]]}}async function x({showLoading:de=!0}={}){const q=++v;de&&(l.value=!0),o.value=null;try{const ce=await U.get("/api/discord/guilds");q===v&&(e.value=ce)}catch(ce){q===v&&(o.value=ce.message)}finally{de&&q===v&&(l.value=!1)}}async function O(){try{t.value=await U.get("/api/discord/connection"),n.value=null}catch(de){n.value=de.message}}async function $(de,q=null){if(!a.value){a.value=!0,n.value=null;try{const ce={operation:de};q!==null&&(ce.token=q),t.value=await U.post("/api/discord/connection",ce),de==="credentials"&&(s.value="")}catch(ce){n.value=ce.message||"Connection update failed."}finally{a.value=!1}}}function T(){return $("credentials",s.value)}function M(){return $("connect")}function V(){return $("detach")}async function G(){l.value=!0,o.value=null;try{const[de,q,ce]=await Promise.all([U.get("/api/discord/guilds"),U.get("/api/discord/members").catch(()=>[]),U.get("/api/config")]),ue=k(ce),me=I.value;c.value=ue,me||(d.value=JSON.parse(JSON.stringify(ue))),m.value=q,e.value=de,p.value=null}catch(de){o.value=de.message}finally{l.value=!1}}let P=Promise.resolve();const L=f(new Set);function N(de,q){const ce=new Set(L.value);ce.add(de),L.value=ce;const ue=P.then(q);return P=ue.catch(()=>{}),ue.finally(()=>{const me=new Set(L.value);me.delete(de),L.value=me})}function te(de,q,ce,ue){const me=(ue==null?void 0:ue.target)??null;return N(`guild:${de}:${q}`,async()=>{try{await U.put("/api/discord/guild/"+de+"/config",{[q]:ce}),await x({showLoading:!1})}catch(ye){o.value=ye.message,me&&typeof ce=="boolean"&&(me.checked=!ce)}})}function le(de,q,ce,ue,me){const ye=(me==null?void 0:me.target)??null;return N(`channel:${de}:${ce}`,async()=>{try{await U.put("/api/discord/channel/"+de+"/config",{[ce]:ue}),await x({showLoading:!1})}catch(Fe){o.value=Fe.message,ye&&typeof ue=="boolean"&&(ye.checked=!ue)}})}function B(de,q){return N(`channel:${de}:clear`,async()=>{try{await U.put("/api/discord/channel/"+de+"/config",{clear:!0}),await x({showLoading:!1})}catch(ce){o.value=ce.message}})}function W(de,q){const ce=String(q);if(!de.userAutocomplete)return ce;const ue=y.value.get(ce);return ue?_v(ue):ce}function re(de,q=null){const ce=String(q??h.value[de]??"").trim();!ce||d.value[de].includes(ce)||(d.value[de]=[...d.value[de],ce],h.value={...h.value,[de]:""})}function J(de,q){d.value[de]=d.value[de].filter(ce=>ce!==q)}async function fe(){if(!(!I.value||u.value)){u.value=!0,p.value=null;try{const q=(await U.put("/api/config",{discord:d.value})).discord||d.value;c.value={allowed_users:[...q.allowed_users||[]],channels:[...q.channels||[]],respond_to_bots:!!q.respond_to_bots,require_mention:!!q.require_mention,ignore_bot_ids:[...q.ignore_bot_ids||[]]},d.value=JSON.parse(JSON.stringify(c.value))}catch(de){p.value=de.message||"Global defaults could not be saved."}finally{u.value=!1}}}return Ge(()=>{G(),O(),i=window.setInterval(O,5e3)}),ft(()=>{i!==null&&window.clearInterval(i),i=null}),{guilds:e,loading:l,error:o,expanded:r,globalDraft:d,globalSaving:u,globalError:p,globalArrayInputs:h,globalMembers:m,globalListEditors:E,globalChanged:I,guildEnabled:g,guildMention:b,guildBots:S,hasOverride:_,toggleGuild:w,fetchAll:G,fetchGuilds:x,setGuildConfig:te,setChannelConfig:le,clearOverride:B,mutationPending:L,globalItemLabel:W,addGlobalItem:re,removeGlobalItem:J,saveGlobalDefaults:fe,connection:t,connectionToken:s,connectionBusy:a,connectionError:n,saveDiscordCredentials:T,connectDiscord:M,detachDiscord:V}}},Ts=e=>e==null?e:JSON.parse(JSON.stringify(e));function kS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(_){d+=1;const w=c.then(_,_);return c=w.catch(()=>{}),w}function E(_,w){h=Ts(_),m.clear();for(const[k,x]of Object.entries(w||{}))m.set(k,Ts(x))}function I(_){const w=Ts(_),k=++u;return v(async()=>{try{await e(Ts(w)),h=Ts(w),k===u&&a(Ts(w))}catch(x){k===u&&(n(Ts(h)),r(x,{kind:"default"}))}})}function y(_,w){const k=Ts(w),x=(p.get(_)||0)+1;return p.set(_,x),v(async()=>{try{await t(_,Ts(k)),m.set(_,Ts(k)),x===p.get(_)&&i(_,Ts(k))}catch(O){x===p.get(_)&&(l(_,Ts(m.get(_)??null)),r(O,{kind:"user",uid:_}))}})}function g(_){const w=(p.get(_)||0)+1;return p.set(_,w),v(async()=>{try{await s(_),m.delete(_),w===p.get(_)&&o(_)}catch(k){w===p.get(_)&&(l(_,Ts(m.get(_)??null)),r(k,{kind:"delete",uid:_}))}})}async function b(){for(;;){const _=c;if(await _,_===c)return d}}async function S(_){for(;;){const w=await b(),k=await _();if(w===d)return k}}return{seed:E,saveDefault:I,saveUser:y,deleteUser:g,whenIdle:b,readSnapshot:S,get revision(){return d}}}const SS={components:{DiscordUserCombobox:wv},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=j(()=>{const T={};for(const M of r.value)T[M.id]=M;return T});function d(T){return c.value[T]||null}function u(T,M){return T?T.allowed_hosts===null||T.allowed_hosts===void 0?{allowed_hosts:[...M],default_host:T.default_host||"",allow_all:!0}:{allowed_hosts:T.allowed_hosts,default_host:T.default_host||"",allow_all:!1}:{allowed_hosts:[...M],default_host:M[0]||"",allow_all:!0}}const p=kS({applyDefault:async T=>{const M=T.allow_all?null:T.allowed_hosts;await U.put("/api/host-access/default-policy",{allowed_hosts:M,default_host:T.default_host})},applyUser:async(T,M)=>{const V=M.allow_all?null:M.allowed_hosts;await U.put(`/api/host-access/user/${T}`,{allowed_hosts:V,default_host:M.default_host})},applyDelete:T=>U.del(`/api/host-access/user/${T}`),onDefaultConfirmed:()=>we.success("Default policy updated"),onDefaultRollback:T=>{T&&(i.value=T)},onUserConfirmed:T=>{const M=d(T);we.success(`Updated access for ${M?M.display_name:T}`)},onUserRollback:(T,M)=>{const V={...l.value};M?V[T]=M:delete V[T],l.value=V},onUserDeleted:T=>{const M={...l.value};delete M[T],l.value=M},onError:(T,M)=>{var G;const V=M.uid?` ${((G=d(M.uid))==null?void 0:G.display_name)||M.uid}`:"";we.error(`${T.message||"Failed to save"} — reverted${V}`)}});let h=0;async function m(){const T=++h;e.value=!0,t.value="";try{const M=await p.readSnapshot(()=>U.get("/api/host-access"));if(T!==h)return;s.value=M,a.value=M.available_hosts||[],n.value=M.host_descriptions||{},i.value=u(M.default_policy,a.value);const V=M.users||{},G={};for(const[P,L]of Object.entries(V))G[P]=u(L,a.value);l.value=G,p.seed(i.value,G)}catch(M){T===h&&(t.value=M.message||"Failed to fetch host access data")}finally{T===h&&(e.value=!1)}try{const M=await U.get("/api/discord/members")||[];T===h&&(r.value=M)}catch{T===h&&(r.value=[])}}const v=500,E=new Map;function I(T,M){const V=E.get(T);V&&clearTimeout(V.timer);const G={run:M,timer:null};G.timer=setTimeout(()=>{E.delete(T),M()},v),E.set(T,G)}function y(T){const M=E.get(T);M&&(clearTimeout(M.timer),E.delete(T))}function g(){for(const[T,M]of[...E])clearTimeout(M.timer),E.delete(T),M.run()}function b(){I("default",()=>p.saveDefault(i.value))}function S(T,M){i.value.allow_all=!1,M?i.value.allowed_hosts.includes(T)||i.value.allowed_hosts.push(T):(i.value.allowed_hosts=i.value.allowed_hosts.filter(V=>V!==T),i.value.default_host===T&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function _(T){I(`user:${T}`,()=>{const M=l.value[T];M&&p.saveUser(T,M)})}function w(T,M,V){const G=l.value[T];G&&(G.allow_all=!1,V?G.allowed_hosts.includes(M)||G.allowed_hosts.push(M):(G.allowed_hosts=G.allowed_hosts.filter(P=>P!==M),G.default_host===M&&(G.default_host=G.allowed_hosts[0]||"")),_(T))}function k(T,M){const V=l.value[T];V&&(V.default_host=M,_(T))}function x(){o.value=!0}function O(T){!/^\d{15,25}$/.test(T)||l.value[T]||(l.value[T]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(T,l.value[T]),o.value=!1)}async function $(T){const M=d(T);await Kt({title:"Remove user override",message:`Remove the host access override for ${M?M.display_name:T}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${T}`),await p.deleteUser(T),l.value[T]||we.success(`Removed override for ${M?M.display_name:T}`))}return Ge(m),Vt(g),ft(g),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:S,getMember:d,toggleUserHost:w,setUserDefault:k,openAddUser:x,addUserById:O,deleteUser:$,flushPendingSaves:g}}},TS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),h=f(null),m=f(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),E=f(v()),I=j(()=>["127.0.0.1","localhost","::1"].includes(E.value.address));async function y(){t.value=!0,s.value="";try{const G=await U.get("/api/hosts");e.value=G.hosts||[],o.value=G.default_host||"",r.value=!!G.tofu_enabled}catch(G){s.value=G.message}finally{t.value=!1}}async function g(){try{await U.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),we.success("Host settings saved and published live"),await y()}catch(G){we.error(G.message)}}function b(){d.value="",u.value=[],p.value=!1,h.value=null,c.value=null,m.value="",l.value=1,n.value=!0}function S(){i.value=!1,E.value=v(),b()}function _(G){i.value=!0,E.value={...v(),...G},b()}async function w(){try{c.value=await U.get("/api/hosts/public-key")}catch(G){we.error(G.message)}}async function k(G){try{const P=await U.post("/api/hosts/"+encodeURIComponent(G.alias)+"/import-legacy",{});i.value=!0,E.value={...v(),...G,trust_mode:"pinned"},b(),d.value=P.candidate_token,u.value=P.fingerprints||[],m.value=u.value.join(`
`),l.value=4,we.info("Imported existing known_hosts trust. Test before activation.")}catch(P){we.error(P.message)}}async function x(){try{const G=m.value.split(/\s+/).filter(Boolean),P={...E.value,expected_fingerprints:G,candidate_fingerprints:u.value},L=await U.post("/api/hosts/candidates",P);if(d.value=L.candidate_token,u.value=L.fingerprints||[],E.value.trust_mode==="tofu"&&P.candidate_fingerprints.length===0){E.value.confirm_tofu=!1,we.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(G){we.error(G.message)}}async function O(){var G,P;p.value=!1,h.value=null;try{const L=await U.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!L.tested,h.value=L.last_test,p.value&&(l.value=5)}catch(L){const N=(G=L.data)==null?void 0:G.last_test;N&&typeof N=="object"&&!Array.isArray(N)&&(h.value=N);const te=(P=h.value)==null?void 0:P.detail;we.error(typeof te=="string"&&te.trim()?te:L.message)}}async function $(){try{await U.post("/api/hosts/candidates/"+d.value+"/commit",{}),we.success("Host saved and published live"),n.value=!1,await y()}catch(G){we.error(G.message)}}async function T(G){try{await U.post("/api/hosts/"+encodeURIComponent(G.alias)+"/enabled",{enabled:!G.enabled}),await y()}catch(P){we.error(P.message)}}async function M(G){var P;if(await Kt("Delete host "+G.alias+"? Dependencies will block deletion.")){a.value=[];try{await U.del("/api/hosts/"+encodeURIComponent(G.alias)),await y()}catch(L){a.value=Array.isArray((P=L.data)==null?void 0:P.pending_references)?L.data.pending_references:[],we.error(L.message)}}}async function V(G){if(await Kt("Force revoke "+G.alias+"? Remote outcomes may be unknown."))try{await U.post("/api/hosts/"+encodeURIComponent(G.alias)+"/force-revoke",{}),await y()}catch(P){we.error(P.message)}}return Ge(y),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:E,isLocal:I,keyInfo:c,candidate:d,observed:u,tested:p,testResult:h,fingerprintsText:m,load:y,saveSettings:g,beginAdd:S,beginEdit:_,loadKey:w,importLegacy:k,prepare:x,testConnection:O,commit:$,toggle:T,remove:M,forceRevoke:V}}},CS={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=j(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=j(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function h(k){return k==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":k==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const k=await U.get("/api/tokens");s.value=k.tokens||[],a.value=k.available_hosts||[]}catch(k){t.value=k.message||"Failed to load tokens"}finally{e.value=!1}}function v(k){return!k||!k.trim()?[]:k.split(",").map(x=>x.trim()).filter(Boolean)}function E(k,x){const O=c.value.allowed_hosts;if(x&&!O.includes(k)&&O.push(k),!x){const $=O.indexOf(k);$>=0&&O.splice($,1)}}function I(k,x){const O=d.value.allowed_hosts;if(x&&!O.includes(k)&&O.push(k),!x){const $=O.indexOf(k);$>=0&&O.splice($,1)}}async function y(){var k;i.value=!0;try{const x=v(c.value.allowed_tools_str),O=c.value.host_mode,$=O==="none"?[]:O==="select"?c.value.allowed_hosts:null,T={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:x.length?x:[]};$!==null&&(T.allowed_hosts=$),T.default_host=c.value.default_host||"";const M=await U.post("/api/tokens",T);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,we.success("Token created"),await m()}catch(x){we.error(((k=x.data)==null?void 0:k.error)||x.message||"Failed to create token")}finally{i.value=!1}}function g(k){o.value=k;const x=k.allowed_hosts;let O="default";x==null?O="default":Array.isArray(x)&&x.length===0?O="none":Array.isArray(x)&&(O="select"),d.value={username:k.username||"",tier:k.tier||"admin",label:k.label||"",host_mode:O,allowed_hosts:Array.isArray(x)?[...x]:[],default_host:k.default_host||"",allowed_tools_str:(k.allowed_tools||[]).join(", ")}}async function b(){var k;if(o.value){r.value=!0;try{const x=v(d.value.allowed_tools_str),O=d.value.host_mode,$={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:x};O==="none"?$.allowed_hosts=[]:O==="select"?$.allowed_hosts=d.value.allowed_hosts:$.allowed_hosts=null,$.default_host=d.value.default_host||"",await U.put("/api/tokens/"+encodeURIComponent(o.value.user_id),$),o.value=null,we.success("Token updated"),await m()}catch(x){we.error(((k=x.data)==null?void 0:k.error)||x.message||"Failed to update")}finally{r.value=!1}}}async function S(k){var O;if(await Kt({title:"Regenerate token",message:`Regenerate token for ${k.username||k.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const $=await U.post("/api/tokens/"+encodeURIComponent(k.user_id)+"/regenerate");l.value=$.token,we.success("Token regenerated")}catch($){we.error(((O=$.data)==null?void 0:O.error)||$.message||"Failed to regenerate")}}async function _(k){var O;if(await Kt({title:"Delete token",message:`Delete token for ${k.username||k.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/tokens/"+encodeURIComponent(k.user_id)),we.success("Token deleted"),await m()}catch($){we.error(((O=$.data)==null?void 0:O.error)||$.message||"Failed to delete")}}async function w(){if(l.value)try{await navigator.clipboard.writeText(l.value),we.success("Copied to clipboard")}catch{we.error("Copy failed — select and copy manually")}}return Ge(m),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:E,toggleEditHost:I,createToken:y,startEdit:g,saveEdit:b,confirmRegenerate:S,confirmDelete:_,copyToken:w}}},ES=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),AS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),RS=Object.freeze(["enabled","base_url","model","max_tokens"]),IS=Object.freeze(["enabled","model","max_tokens"]);function dr(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function Ep(e){return dr(e,ES)}function Ap(e){return dr(e,AS)}function OS(e,{includeApiKey:t=!1}={}){const s=dr(e,RS);return t&&(s.api_key=e.api_key),s}function LS(e){return{timeout:e.timeout}}function NS(e,{includeApiKey:t=!1}={}){const s=dr(e,IS);return t&&(s.api_key=e.api_key),s}function DS(e){return{timeout:e.timeout}}function Gl(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const PS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f("codex"),n=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna"],l=j(()=>{const K=n.value.model;return K&&!i.includes(K)?[K,...i]:i}),o=j(()=>{const K=n.value.agent_model;return K&&K!=="auto"&&!i.includes(K)?[K,...i]:i}),r={"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(K,ke)=>!!K&&!!ke&&(r[K]||[]).includes(ke),d=K=>!c(n.value.model,K)&&!(n.value.agent_reasoning_effort===""&&c(n.value.agent_model,K)),u=K=>{const ke=n.value.agent_model;return ke==="auto"?!0:!c(ke||n.value.model,K)},p=j(()=>{const K=n.value.agent_reasoning_effort;return K==="auto"?null:K||n.value.reasoning_effort}),h=K=>c(K,n.value.reasoning_effort)||n.value.agent_model===""&&c(K,p.value),m=K=>c(K,p.value),v=f({enabled:!1,model:"gpt-5.6-luna"}),E=f({unavailable_reason:null}),I=j(()=>{const K=v.value.model;return K&&!i.includes(K)?[K,...i]:i});function y(K){const ke=K.target.value;v.value.enabled=ke!=="",ke!==""&&(v.value.model=ke),ie()}const g=f(!1),b=f({codex:!1,ollama:!1,kimi:!1}),S=f(null),_=f(!1),w=f(""),k=f(null),x=f(!1);let O=0;const $=j(()=>{var K;return Object.entries(((K=S.value)==null?void 0:K.models)||{}).map(([ke,Ie])=>{var Vs,va,ja;return{model:ke,floor:Ie.floor,override:Ie.override,effectiveBudget:(Vs=Ie.effective)==null?void 0:Vs.effective_budget,configuredPrimaryChars:(va=Ie.configured)==null?void 0:va.primary_chars,primaryChars:(ja=Ie.effective)==null?void 0:ja.primary_chars,provenance:Ie.provenance,clampExpiresAt:Ie.clamp_expires_at,densityPriorMilli:Ie.density_prior_milli,densityScope:Ie.density_scope,workloadCalibration:Ie.workload_calibration}})}),T=j(()=>{var K;return((K=S.value)==null?void 0:K.clamps)||[]}),M=j(()=>{var K,ke;return((ke=(K=S.value)==null?void 0:K.models)==null?void 0:ke[n.value.model])||null}),V=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),G=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),P=f(!1),L=f(!1),N=f(!1),te=f(!1),le=f(!1),B=f(!1),W=f(!1),re=f({configured:null}),J=f(!1),fe=f([]),de=f(""),q=f(!1),ce=f(!1),ue=f({configured:null}),me=f(!1),ye=f([]),Fe=f(""),C=f(!1),F=f(!1),R=f(!0),Z=f(""),ee=f({configured:null,accounts:[]}),ne=f(null),ve=f(null),H=f(""),Q=f(null),X=f(!1),pe=f(null),he=f(null),xe=f("");let Oe=null;function ge(K,ke="success"){we(K,ke==="error"?"error":"success")}function He(K){if(!K)return"?";const ke=K/(1024*1024*1024);return ke>=1?ke.toFixed(1)+" GB":(K/(1024*1024)).toFixed(0)+" MB"}function Be(K){return Number.isFinite(Number(K))?Number(K).toLocaleString():"—"}function ze(K){return K==null?"automatic (model-derived)":Number(K).toLocaleString()+" characters"}function Qe(K){const ke=new Date(K);return Number.isNaN(ke.getTime())?"unknown":ke.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function ot(K){return typeof K=="string"&&K.length>12?K.slice(0,8)+"…"+K.slice(-4):K}function nt(K){return typeof K!="number"||!Number.isFinite(K)?"—":(K/1e3).toFixed(2)}function Y(K){return K==="temporary learned clamp"?"is-clamp":K==="override"?"is-override":"is-built-in"}function _e(K){const ke=n.value.context_budget_overrides[K.model];return K.floor!=null&&Number.isFinite(Number(ke))&&Number(ke)>K.floor}function Ae(K,ke){const Ie={...n.value.context_budget_overrides};ke.target.value===""?delete Ie[K]:Ie[K]=Number(ke.target.value),n.value.context_budget_overrides=Ie,x.value=!0}function Le(K){n.value.context_utilization=K.target.value===""?"":Number(K.target.value),x.value=!0}function se(K){const ke={...n.value.context_budget_overrides};delete ke[K],n.value.context_budget_overrides=ke,x.value=!0}async function Ee(){e.value=!0,await Promise.all([Ne(),Lt(),Os(),Ke(),Je()]),e.value=!1}async function Ne({preserveBasic:K=!1,preserveAdvanced:ke=!1}={}){try{const Ie=await U.get("/api/llm/status");t.value=Ie,s.value=!1,a.value=Ie.active_provider||"codex",Ie.codex&&!ks.pending()&&(K||(n.value.enabled=Ie.codex.enabled,n.value.model=Ie.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=Ie.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Ie.codex.agent_reasoning_effort||"",n.value.agent_model=Ie.codex.agent_model||""),ke||(n.value.request_timeout_seconds=Ie.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=Ie.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...Ie.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...Ie.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...Ie.codex.context_compression||{}},!x.value&&!N.value&&(n.value.context_budget_overrides={...Ie.codex.context_budget_overrides||{}},n.value.context_utilization=Ie.codex.context_utilization??n.value.context_utilization))),Ie.ollama&&!Te.pending()&&(K||(V.value.enabled=Ie.ollama.enabled,V.value.base_url=Ie.ollama.base_url||"",V.value.model=Ie.ollama.model||"",V.value.max_tokens=Ie.ollama.max_tokens||4096),ke||(V.value.timeout=Ie.ollama.timeout??V.value.timeout)),Ie.kimi&&!$e.pending()&&(K||(G.value.enabled=Ie.kimi.enabled,G.value.model=Ie.kimi.model||"",G.value.max_tokens=Ie.kimi.max_tokens||4096),ke||(G.value.timeout=Ie.kimi.timeout??G.value.timeout)),Ie.auxiliary&&(E.value=Ie.auxiliary,ie.pending()||(v.value.enabled=Ie.auxiliary.enabled,v.value.model=Ie.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function Je(){const K=++O;_.value=!0,w.value="";try{const ke=await U.get("/api/context/windows");if(K!==O)return;S.value=ke,!N.value&&!x.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(ke.models||{}).filter(([,Ie])=>Ie.override!=null).map(([Ie,Vs])=>[Ie,Vs.override])),n.value.context_utilization=ke.utilization??n.value.context_utilization)}catch(ke){K===O&&(w.value=ke.message||"Failed to load context budgets")}finally{K===O&&(_.value=!1)}}async function Lt(){try{if(re.value=await U.get("/api/ollama/status"),J.value=!1,re.value.model&&(de.value=re.value.model),re.value.configured)try{const K=await U.get("/api/ollama/models");fe.value=K.models||[]}catch{fe.value=[]}else if(V.value.base_url)try{const K=await U.post("/api/ollama/probe-models",{base_url:V.value.base_url});fe.value=K.models||[]}catch{fe.value=[]}}catch{J.value=!0}}async function Ke(){R.value=!0,Z.value="";try{ee.value=await U.get("/api/codex/status")}catch(K){Z.value=K.message||"Failed to fetch Codex status"}finally{R.value=!1}}async function Bt(){const K=t.value?t.value.active_provider:"codex";W.value=!0;try{const ke=await U.post("/api/llm/switch",{provider:a.value});ke.error?(a.value=K,ge(ke.error,"error")):(ge("Switched to "+a.value+" ("+ke.model+")"),await Ee())}catch(ke){a.value=K,ge(ke.message||"Switch failed","error")}finally{W.value=!1}}async function Ut(){q.value=!0;try{const K=await U.post("/api/ollama/reload");ge(K.configured?"Ollama reloaded":K.reason||"Ollama not configured",K.configured?"success":"error"),await Ee()}catch(K){ge(K.message||"Reload failed","error")}finally{q.value=!1}}async function hs(){ce.value=!0;try{await U.post("/api/ollama/model",{model:de.value}),ge("Model set to "+de.value),await Ee()}catch(K){ge(K.message||"Failed","error")}finally{ce.value=!1}}async function Ys(){const K=V.value.base_url;if(!K){ge("Enter a base URL first","error");return}B.value=!0;try{const ke=await U.post("/api/ollama/probe-models",{base_url:K});fe.value=ke.models||[],fe.value.length?(ge(fe.value.length+" model(s) found"),!V.value.model&&fe.value.length&&(V.value.model=fe.value[0].name)):ge("No models found at "+K,"error")}catch(ke){ge(ke.message||"Could not reach Ollama","error")}finally{B.value=!1}}async function Os(){try{if(ue.value=await U.get("/api/kimi/status"),me.value=!1,ue.value.model&&(Fe.value=ue.value.model),ue.value.configured)try{const K=await U.get("/api/kimi/models");ye.value=K.models||[]}catch{ye.value=[]}}catch{me.value=!0}}async function nn(){C.value=!0;try{const K=await U.post("/api/kimi/reload");ge(K.configured?"Kimi reloaded":K.reason||"Kimi not configured",K.configured?"success":"error"),await Ee()}catch(K){ge(K.message||"Reload failed","error")}finally{C.value=!1}}async function Qs(){F.value=!0;try{await U.post("/api/kimi/model",{model:Fe.value}),ge("Model set to "+Fe.value),await Ee()}catch(K){ge(K.message||"Failed","error")}finally{F.value=!1}}async function zs(){if(N.value){ks();return}N.value=!0;const K=Ep(n.value);try{await U.put("/api/llm/codex/config",K),ge("Codex config saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Ke()])}catch(ke){ge(ke.message||"Failed","error");const Ie=JSON.stringify(Ep(n.value))!==JSON.stringify(K);await Promise.all([Ne({preserveBasic:Ie,preserveAdvanced:!0}),Ke()])}finally{N.value=!1}}async function Ha(){if(N.value)return;N.value=!0;const K=Ap(n.value);try{await U.put("/api/llm/codex/config",K),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:K.context_budget_overrides,context_utilization:K.context_utilization})&&(x.value=!1),ge("Codex advanced settings saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Ke(),Je()])}catch(ke){ge(ke.message||"Failed","error");const Ie=JSON.stringify(Ap(n.value))!==JSON.stringify(K);await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:Ie}),Ke(),Je()])}finally{N.value=!1}}async function ws(){if(te.value){Te();return}te.value=!0;try{const K=P.value?V.value.api_key:null,ke=OS(V.value,{includeApiKey:K!==null});await U.put("/api/llm/ollama/config",ke),ge("Ollama config saved"),K!==null&&V.value.api_key===K&&(V.value.api_key="",P.value=!1),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Lt()])}catch(K){ge(K.message||"Failed","error")}finally{te.value=!1}}async function fa(){if(!te.value){te.value=!0;try{await U.put("/api/llm/ollama/config",LS(V.value)),ge("Ollama timeout saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Lt()])}catch(K){ge(K.message||"Failed","error")}finally{te.value=!1}}}async function Ls(){if(le.value){$e();return}le.value=!0;try{const K=L.value?G.value.api_key:null,ke=NS(G.value,{includeApiKey:K!==null});await U.put("/api/llm/kimi/config",ke),ge("Kimi config saved"),K!==null&&G.value.api_key===K&&(G.value.api_key="",L.value=!1),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Os()])}catch(K){ge(K.message||"Failed","error")}finally{le.value=!1}}async function at(){if(!le.value){le.value=!0;try{await U.put("/api/llm/kimi/config",DS(G.value)),ge("Kimi timeout saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Os()])}catch(K){ge(K.message||"Failed","error")}finally{le.value=!1}}}async function Ns(){if(g.value){ie();return}g.value=!0;try{await U.put("/api/llm/auxiliary/config",v.value),ge("Auxiliary config saved"),await Ne()}catch(K){ge(K.message||"Failed","error"),await Ne()}finally{g.value=!1}}const ks=Gl(zs),ie=Gl(Ns),Te=Gl(ws),$e=Gl(Ls),et=()=>(ks.cancel(),zs()),dt=()=>(Te.cancel(),ws()),mt=()=>($e.cancel(),Ls()),ha=()=>Ha(),js=()=>fa(),xi=()=>at();async function _i(K){const ke=K.account_key+":"+K.model;k.value=ke;try{const Ie=await U.post("/api/context/windows/clear",{account_key:K.account_key,model:K.model});ge(Ie.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Je()}catch(Ie){ge(Ie.message||"Failed to clear clamp","error"),await Je()}finally{k.value=null}}async function Ln(K){try{await U.post("/api/codex/account/"+K+"/activate"),ge("Active account switched"),await Ke()}catch(ke){ge(ke.message||"Failed","error")}}async function Nn(K){ne.value=K;try{await U.post("/api/codex/account/"+K+"/refresh"),ge("Token refreshed"),await Ke()}catch(ke){ge(ke.message||"Refresh failed","error")}finally{ne.value=null}}function ln(K,ke){ve.value=K,H.value=ke||""}async function za(K){try{await U.put("/api/codex/account/"+K+"/label",{label:H.value}),ge("Label updated"),ve.value=null,await Ke()}catch(ke){ge(ke.message||"Failed","error")}}async function Xs(K,ke){if(await Kt({title:"Delete Codex account",message:`Delete ${ke||"account #"+(K+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/codex/account/"+K),ge("Deleted. Pool reloaded."),await Ke()}catch(Vs){ge(Vs.message||"Failed","error")}}async function ma(){X.value=!0;try{const K=await U.post("/api/codex/device-code");pe.value=K,Q.value="pending",Ss(K)}catch(K){ge(K.message||"Failed","error")}finally{X.value=!1}}async function Ss(K){Oe={cancelled:!1};const ke=Oe;try{const Ie=await U.post("/api/codex/device-poll",{device_auth_id:K.device_auth_id,user_code:K.user_code,interval:K.interval});if(ke.cancelled)return;he.value=Ie,Q.value="success",await Ee()}catch(Ie){if(ke.cancelled)return;xe.value=Ie.message||"Device login failed",Q.value="error"}}function Dn(){Oe&&(Oe.cancelled=!0),Q.value=null,pe.value=null}return Ge(Ee),ft(()=>{Oe&&(Oe.cancelled=!0),ks.cancel(),ie.cancel(),Te.cancel(),$e.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:a,switching:W,advancedOpen:b,codexForm:n,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:h,agentModelOptionDisabled:m,auxForm:v,auxData:E,auxModelOptions:I,onAuxModelChange:y,savingAux:g,saveAuxConfigDebounced:ie,ollamaForm:V,kimiForm:G,savingCodex:N,savingOllama:te,savingKimi:le,probingOllama:B,ollamaKeyDirty:P,kimiKeyDirty:L,fetchCodexStatus:Ke,ollamaStatus:re,ollamaStatusLoadFailed:J,ollamaModels:fe,ollamaSelectedModel:de,reloading:q,settingModel:ce,kimiStatus:ue,kimiStatusLoadFailed:me,kimiModels:ye,kimiSelectedModel:Fe,reloadingKimi:C,settingKimiModel:F,codexLoading:R,codexError:Z,codexData:ee,refreshing:ne,editingLabel:ve,labelValue:H,contextWindows:S,contextWindowsLoading:_,contextWindowsError:w,contextBudgetRows:$,activeClampRows:T,activeContextBudget:M,clearingClamp:k,contextPolicyDirty:x,deviceState:Q,deviceLoading:X,deviceInfo:pe,deviceResult:he,deviceError:xe,fetchAll:Ee,fetchLLMStatus:Ne,fetchOllamaStatus:Lt,fetchKimiStatus:Os,switchProvider:Bt,reloadOllama:Ut,setOllamaModel:hs,reloadKimi:nn,setKimiModel:Qs,probeOllamaModels:Ys,saveCodexConfig:zs,saveOllamaConfig:ws,saveKimiConfig:Ls,saveCodexAdvancedConfig:Ha,saveOllamaAdvancedConfig:fa,saveKimiAdvancedConfig:at,saveCodexConfigDebounced:ks,saveOllamaConfigDebounced:Te,saveKimiConfigDebounced:$e,saveCodexConfigNow:et,saveOllamaConfigNow:dt,saveKimiConfigNow:mt,saveCodexAdvancedConfigNow:ha,saveOllamaAdvancedConfigNow:js,saveKimiAdvancedConfigNow:xi,activateAccount:Ln,refreshAccount:Nn,startEditLabel:ln,saveLabel:za,deleteAccount:Xs,startDeviceLogin:ma,cancelDeviceLogin:Dn,formatSize:He,fetchContextWindows:Je,clearContextClamp:_i,setContextOverride:Ae,setContextUtilization:Le,resetContextOverride:se,overrideAboveFloor:_e,formatCount:Be,formatContextCeiling:ze,formatExpiry:Qe,shortAccountKey:ot,provenanceClass:Y,formatDensity:nt}}},Rp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function MS(e){return Rp[e]||Rp[(e||"").toLowerCase()]||"text-gray-400"}const FS={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=j(()=>{var _;return Object.values(((_=i.value)==null?void 0:_.totals)||{}).reduce((w,k)=>w+Number(k||0),0)}),u=f(""),p=f(0),h=f([]),m=j(()=>h.value.map(_=>`${_.label} (${_.path}${_.reason?`: ${_.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let E=null;async function I(){var O;const _=await Promise.allSettled(v.map($=>U.get($.path))),w=$=>_[$].status==="fulfilled"?_[$].value:null;t.value=w(0)||{};const k=w(1);s.value=Array.isArray(k)?k:k&&k.subsystems||[],a.value=w(2)||{},n.value=w(3)||{},i.value=w(4),l.value=w(5),o.value=w(6),r.value=w(7),c.value=w(8);const x=_.filter($=>$.status==="rejected");if(h.value=_.flatMap(($,T)=>{var M;return $.status==="rejected"?[{...v[T],reason:((M=$.reason)==null?void 0:M.message)||"request failed"}]:[]}),p.value=h.value.length,x.length===_.length){const $=(O=x[0])==null?void 0:O.reason;u.value=($==null?void 0:$.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",I()}let g=!1;function b(){g||(g=!0,I(),E||(E=setInterval(I,3e4)))}function S(){g&&(g=!1,E&&(clearInterval(E),E=null))}return Ge(b),Xt(b),Vt(S),ft(S),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:y,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:MS,formatAgeSeconds:sk}}},$S=1e4,Ip=3e4;function Ri(e,t){return Math.max(0,e-t)}function Ur(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const BS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],US={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const L=++p;a.value=!0;try{const N=await U.get("/api/turn-state/turns?limit=100");if(L!==p)return;t.value=N.availability,e.value=N.availability==="available"?N.data:null,s.value=null,n.value=Date.now()}catch(N){if(L!==p)return;s.value=N.message||"Turn-state read failed",N.status===503&&(t.value="unavailable")}L===p&&(a.value=!1)}async function v(){const L=++h;r.value=!0;try{const N=await U.get("/api/turn-state/capacity-breakers");if(L!==h)return;l.value=N.availability,i.value=N.availability==="available"?N.data:null,o.value=null,c.value=Date.now()}catch(N){if(L!==h)return;o.value=N.message||"Breaker read failed",N.status===503&&(l.value="unavailable")}L===h&&(r.value=!1)}function E(){m(),v()}const I=j(()=>e.value!==null&&Ri(d.value,n.value)>Ip),y=j(()=>i.value!==null&&Ri(d.value,c.value)>Ip),g=j(()=>I.value||y.value),b=j(()=>Math.round(Ri(d.value,n.value)/1e3)),S=j(()=>Math.round(Ri(d.value,c.value)/1e3));function _(L){return Ur(L,d.value/1e3)}function w(L){return BS[_(L)]}const k=j(()=>{var te;const L=[...((te=e.value)==null?void 0:te.turns)||[]],N=d.value/1e3;return L.sort((le,B)=>Ur(le,N)-Ur(B,N)||(B.last_progress_at||0)-(le.last_progress_at||0))});function x(L){return L.state==="closed"?"badge-success":L.state==="probing"?"badge-warning":"badge-danger"}function O(L){if(L.state==="closed")return"—";const N=Ri(d.value,c.value)/1e3,te=Math.max(0,(L.cooldown_remaining_seconds||0)-N);return te>0?`${Math.ceil(te)}s`:L.state==="probing"?"probe in flight":"probe eligible"}function $(L){if(!L)return"";const N=Math.max(0,Math.round(d.value/1e3-L));if(N<90)return`${N}s ago`;const te=Math.round(N/60);return te<90?`${te}m ago`:`${Math.round(te/60)}h ago`}let T=null,M=null,V=!1;function G(){V||(V=!0,E(),T=setInterval(E,$S),u=setInterval(()=>{d.value=Date.now()},1e3),M=st.onReconnected(E))}function P(){V&&(V=!1,T&&(clearInterval(T),T=null),u&&(clearInterval(u),u=null),M&&(M(),M=null))}return Ge(G),Xt(G),Vt(P),ft(P),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:I,breakersStale:y,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:S,sortedTurns:k,priorityOf:_,priorityBadge:w,breakerBadge:x,cooldownLabel:O,ageLabel:$,fetchTurns:m,fetchBreakers:v,refreshAll:E,arm:G,disarm:P}}},HS={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await U.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await Kt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await U.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ge(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Op=e=>JSON.parse(JSON.stringify(e)),zS=(e,t)=>JSON.stringify(e)===JSON.stringify(t),jS={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,h=0,m=null;const v=(P,L)=>p&&h===P&&U.token===L,E=P=>"computer-provisioning-"+P.key,I=P=>P===null?"Unset":P===""?"Empty":JSON.stringify(P),y=P=>{const L=n.value[P.key];return P.type==="array"?String(L||"").split(/\r?\n/).map(N=>N.trim()).filter(Boolean):["integer","number"].includes(P.type)?L===""||L==null?null:Number(L):L},g=j(()=>s.value.map(P=>({...P,value:y(P)})).filter(P=>!zS(P.value,a.value[P.key]))),b=j(()=>s.value.filter(P=>P.pending_restart).map(P=>P.label)),S=j(()=>s.value.some(P=>P.apply_state==="unknown")),_=j(()=>{const P={};for(const L of s.value){const N=y(L),te=L.constraints||{};["integer","number"].includes(L.type)&&(N===null&&!L.nullable?P[L.key]="A number is required.":N!==null&&(!Number.isFinite(N)||L.type==="integer"&&!Number.isInteger(N)||te.minimum!=null&&N<te.minimum||te.maximum!=null&&N>te.maximum)&&(P[L.key]="Enter a number within the allowed range.")),L.key==="monitor_names"&&(N.length>16||new Set(N).size!==N.length||N.some(le=>!/^[A-Za-z0-9_.-]{1,64}$/.test(le)))&&(P[L.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return P}),w=j(()=>Object.keys(_.value).length>0);function k(P,L){n.value[P.key]=L,u.value=""}function x(){n.value=Object.fromEntries(s.value.map(P=>[P.key,P.type==="array"?a.value[P.key].join(`
`):a.value[P.key]])),r.value=!1}async function O(P,L){const[N,te]=await Promise.all([U.get("/api/config"),U.get("/api/config/meta")]);if(!v(P,L))return!1;const le=(te.fields||[]).filter(B=>/^computer\.[^.]+$/.test(B.path)&&B.path!=="computer.enabled"&&B.sensitivity==="public"&&B.apply_mode==="restart");if(!N.computer||!le.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=le.map(B=>({...B,key:B.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(B=>[B.key,Op(N.computer[B.key])])),x(),m=L,i.value=!0,c.value=!1,!0}async function $(){if(!p||l.value||o.value)return;const P=++h,L=U.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await O(P,L)}catch(N){v(P,L)&&(c.value=!0,d.value=N.message||"Could not load provisioning. No changes were sent.")}finally{v(P,L)&&(l.value=!1)}}function T(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!w.value&&(r.value=!0)}async function M(){if(!p||!i.value||!r.value||o.value||l.value||c.value||w.value||!g.value.length)return;if(m!==U.token){G(),V();return}const P={computer:Object.fromEntries(g.value.map(le=>[le.key,Op(le.value)]))},L=h,N=U.token;o.value=!0,d.value="",u.value="";let te=!1;try{if(await U.put("/api/config",P),te=!0,!v(L,N))return;await O(L,N)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(le){v(L,N)&&(c.value=!0,r.value=!1,d.value=te?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${le.status===400?": "+le.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{v(L,N)&&(o.value=!1)}}function V(){p||(p=!0,$())}function G(){p=!1,h++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return Ge(V),Xt(V),Vt(G),ft(G),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:S,changes:g,validation:_,invalid:w,fieldId:E,format:I,edit:k,discard:x,load:$,openReview:T,save:M}}},VS={components:{ComputerProvisioning:jS},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),h=f(""),m=f(null),v=f(""),E=f(!1),I=f(Date.now()),y=f(""),g=f(null);let b=0,S=null,_=!1,w=U.token,k=0,x=null,O=null,$=!1;const T=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",M=j(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),V=j(()=>{var Q;const H=Date.parse(((Q=e.value.accessibility)==null?void 0:Q.checked_at)||"");return c.value&&Number.isFinite(H)&&I.value-H<15e3&&I.value>=H-5e3}),G=j(()=>{var H;return V.value?T((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),P=j(()=>{var H;return V.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),L=j(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,Q])=>`${H}: ${Q}`).join(", ")),N=j(()=>{var Q;const H=(Q=e.value.application_provenance)==null?void 0:Q.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),te=j(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),le=j(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),B=j(()=>{var Q,X;const H=Date.parse(((Q=m.value)==null?void 0:Q.captured_at)||"");return Number.isFinite(H)&&I.value<H+Math.min(1e4,((X=m.value)==null?void 0:X.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function W(){v.value&&URL.revokeObjectURL(v.value),v.value="",m.value=null}function re(){b++,W(),g.value=null,c.value=!1,x==null||x.abort(),x=null,t.value=!1,h.value="",s.value=!1,i.value=!1,l.value=!1}function J(H,Q){return _&&H===b&&Q===U.token}function fe(){return _&&c.value&&O===U.token&&Date.now()-u.value<15e3}function de(H,Q="mutation"){var pe,he;re(),$=!0,p.value="";const X=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(X)?(u.value=0,O=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:X===503?"unavailable":"unknown"}),o.value=X===401||X===403||X===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":X===410?"Evidence or artifact expired. Observe or prepare the export again.":Q==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":Q==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",Q==="mutation"&&![401,403,404].includes(X)&&typeof((pe=H.data)==null?void 0:pe.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((he=H.data)==null?void 0:he.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function q(){if(t.value||r.value||a.value||n.value||d.value||!_)return;const H=b,Q=U.token;t.value=!0,k=Date.now();const X=new AbortController;x=X;try{const pe=await U.get("/api/computer",{signal:X.signal});if(!J(H,Q))return;ce(pe)}catch(pe){J(H,Q)&&de(pe,"read")}finally{x===X&&(x=null,t.value=!1)}}function ce(H,Q=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&re(),e.value=H,u.value=Date.now(),O=U.token,c.value=!(r.value&&Q!=="toggle")&&!(a.value&&Q!=="stop")&&!(n.value&&Q!=="pause")&&!(d.value&&Q!=="recovery"),o.value="",p.value="",$=!c.value}async function ue(H){if(!fe()||r.value||a.value||n.value||d.value)return;re();const Q=b,X=U.token;r.value=!0;let pe=!1;try{if(await U.post("/api/computer/enabled",{enabled:H}),pe=!0,!J(Q,X))return;const he=await U.get("/api/computer");J(Q,X)&&ce(he,"toggle")}catch(he){J(Q,X)&&de(he,pe?"acknowledged":"mutation")}finally{r.value=!1}}async function me(H){if(!_||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;re();const Q=b,X=U.token,pe=H==="stop"?a:n;pe.value=!0;let he=!1;try{if(await U.post("/api/computer/"+H,{}),he=!0,J(Q,X)){const xe=await U.get("/api/computer");J(Q,X)&&ce(xe,H)}}catch(xe){J(Q,X)&&de(xe,he?"acknowledged":"mutation")}finally{pe.value=!1}}async function ye(){var pe;if(!fe()||d.value||((pe=e.value.backend)==null?void 0:pe.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;re();const Q=b,X=U.token;d.value=!0;try{const he=await U.post("/api/computer/release_owned_input",H);J(Q,X)&&ce(he,"recovery")}catch(he){J(Q,X)&&de(he,"mutation")}finally{d.value=!1}}async function Fe(){return F(!1)}async function C(){return F(!0)}async function F(H){var Oe;if(!fe()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const Q={session_id:e.value.session_id,generation:e.value.session_generation};if(!Q.session_id||!Number.isInteger(Q.generation))return;if(H){if(h.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+Q.session_id)return;Q.acknowledgment=h.value}const X=H?((Oe=e.value.recovery)==null?void 0:Oe.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";re();const pe=b,he=U.token;d.value=!0;let xe=!1;try{const ge=await U.post("/api/computer/"+X,Q);xe=!0,J(pe,he)&&ce(ge,"recovery")}catch(ge){J(pe,he)&&de(ge,xe?"acknowledged":"mutation")}finally{d.value=!1}}async function R(){var X;if(!fe()||s.value||!e.value.available)return;W(),E.value=!1;const H=b,Q=U.token;s.value=!0;try{const pe=await U.post("/api/computer/observe",{});if(!J(H,Q))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((X=pe.frame)==null?void 0:X.evidence_id)||""))throw new Error("Invalid evidence");const he=await U.getBlob("/api/computer/evidence/"+pe.frame.evidence_id);if(!J(H,Q))return;if(!["image/png","image/jpeg"].includes(he.type)||he.size>2097152||!Number.isFinite(Date.parse(pe.frame.expires_at))||Date.parse(pe.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");m.value=pe.frame,v.value=URL.createObjectURL(he),o.value=""}catch(pe){J(H,Q)&&de(pe)}finally{H===b&&(s.value=!1)}}async function Z(){if(!fe()||i.value||!e.value.available)return;g.value=null;const H=b,Q=U.token;i.value=!0;try{const X=await U.post("/api/computer/export",{name:y.value});J(H,Q)&&(g.value=X,o.value="")}catch(X){J(H,Q)&&de(X)}finally{H===b&&(i.value=!1)}}async function ee(){if(!fe()||l.value||!g.value)return;const H=b,Q=U.token,X=g.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((X==null?void 0:X.artifact_id)||""))throw new Error("Invalid export");const pe=await U.getBlob("/api/computer/download/"+X.artifact_id);if(!J(H,Q))return;const he=URL.createObjectURL(pe),xe=document.createElement("a");xe.href=he,xe.download=X.name,xe.click(),setTimeout(()=>URL.revokeObjectURL(he),1e3)}catch(pe){J(H,Q)&&de(pe)}finally{H===b&&(l.value=!1)}}function ne(){_||(w!==U.token&&(w=U.token,re(),u.value=0,O=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),_=!0,q(),S=setInterval(()=>{I.value=Date.now(),w!==U.token&&(w=U.token,re(),u.value=0,O=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&I.value-u.value>=15e3&&re(),m.value&&Date.parse(m.value.expires_at)<=I.value&&(W(),E.value=!0),g.value&&Date.parse(g.value.expires_at)<=I.value&&(g.value=null),!$&&I.value-k>=5e3&&q()},500))}function ve(){_=!1,clearInterval(S),S=null,re(),c.value=!1}return Ge(ne),Xt(ne),Vt(ve),ft(ve),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:m,frameUrl:v,frameExpired:E,freshness:B,name:y,artifact:g,refresh:q,control:me,observe:R,clearFrame:W,exportFile:Z,download:ee,toggling:r,adminReady:c,enabledLabel:T,restartSettings:le,setEnabled:ue,recovering:d,recover:Fe,reconcile:C,releaseOwnedInput:ye,reconciliationAck:h,applicationProfiles:te,attached:M,scriptIdentity:N,inputLimits:L,accessibilityLabel:G,accessibilityDetail:P}}},kv=[{id:"health",label:"Health",component:Jk},{id:"resources",label:"Resources",component:Zk},{id:"logs",label:"Logs",component:rS},{id:"config",label:"Config",component:xS},{id:"discord",label:"Discord",component:wS},{id:"hosts",label:"Hosts",component:TS},{id:"host-access",label:"Host Access",component:SS},{id:"api-tokens",label:"API Tokens",component:CS},{id:"llm",label:"LLM Config",component:PS},{id:"internals",label:"Internals",component:FS},{id:"turn-state",label:"Turn State",component:US},{id:"computer",label:"Computer",component:VS},{id:"update",label:"Update",component:HS}],qS={components:{TabbedPage:rr},setup(){return{tabs:kv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Kl=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),GS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Kl("Operations","operations","/operations",fv),...Kl("History","history","/history",hv),...Kl("Capabilities","capabilities","/capabilities",mv),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Kl("System","system","/system",kv)],gs=an({open:!1,query:"",selected:0});function Lp(){gs.query="",gs.selected=0,gs.open=!0}function Hr(){gs.open=!1}function KS(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const WS={setup(){const e=iv(),t=f(null),s=j(()=>{const i=gs.query.trim().toLowerCase();return GS.map(l=>({...l,_score:KS(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Ft(()=>gs.open,async i=>{var l;i&&(await It(),(l=t.value)==null||l.focus())}),Ft(()=>gs.query,()=>{gs.selected=0});function a(i){Hr(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Hr();return}if(i.key==="ArrowDown")i.preventDefault(),gs.selected=Math.min(gs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),gs.selected=Math.max(gs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[gs.selected];l&&a(l)}}return{state:gs,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Hr}},template:`
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
  `},Ac={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Ac));const JS={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>oi("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[oi("path",{d:Ac[e.name]||Ac.info})])}},ZS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Np(e){return[...e.querySelectorAll(ZS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const YS={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=Np(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Np(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},QS={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=j(()=>{const le=e.value.uptime_seconds||0,B=Math.floor(le/86400),W=Math.floor(le%86400/3600),re=Math.floor(le%3600/60),J=[];return B>0&&J.push(`${B}d`),W>0&&J.push(`${W}h`),(J.length===0||B===0&&W===0)&&J.push(`${re}m`),J.join(" ")}),m=j(()=>{const le=e.value.uptime_seconds||0;return 125.66*(1-Math.min(le/86400,1))}),v=j(()=>{const le=e.value;return[{label:"Guilds",value:le.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:le.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:le.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${le.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:le.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:le.loop_count>0?"text-green-400":"",highlight:le.loop_count>0},{label:"Agents",value:le.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:le.agent_count>0?`${le.agent_count} total`:"",subColor:"text-gray-500",highlight:(le.agent_running??0)>0},{label:"Processes",value:le.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:le.process_count>0?`${le.process_count} total`:"",subColor:"text-gray-500",highlight:(le.process_running??0)>0},{label:"Schedules",value:le.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(le.schedule_failing>0?`${le.schedule_failing} failing`:"")+(le.schedule_failing>0&&le.schedule_paused>0?", ":"")+(le.schedule_paused>0?`${le.schedule_paused} paused`:"")||void 0,subColor:le.schedule_failing>0?"text-red-400":"text-yellow-400",color:le.schedule_failing>0?"text-red-400":"",highlight:le.schedule_failing>0},{label:"Users",value:le.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),E=j(()=>{const le=e.value,B=[];return B.push({label:"Bot",status:le.status==="online"?"ok":"warn",detail:le.status==="online"?"Online":"Starting"}),(le.schedule_failing||0)>0?B.push({label:"Schedules",status:"error",detail:`${le.schedule_failing} failing`}):(le.schedule_count||0)>0&&B.push({label:"Schedules",status:"ok",detail:`${le.schedule_count} configured`}),(le.loop_count||0)>0&&B.push({label:"Loops",status:"ok",detail:`${le.loop_count} active`}),(le.agent_running||0)>0&&B.push({label:"Agents",status:"ok",detail:`${le.agent_running} running`}),(le.process_running||0)>0&&B.push({label:"Processes",status:"ok",detail:`${le.process_running} running`}),B});async function I(){try{e.value=await U.get("/api/status"),s.value=null}catch(le){s.value=le.message}finally{t.value=!1}}let y=0,g=0,b=0,S=0;function _(le,B){const W=new Set;return[...B,...le].filter(re=>{const J=re._hmac||JSON.stringify([re.timestamp,re.tool_name,re.user_id,re.result_summary,re.error]);return W.has(J)?!1:(W.add(J),!0)})}async function w(){const le=++y,B=b;n.value=!0;try{const W=await U.get("/api/audit?limit=10");if(le!==y)return;const re=B===b?[]:a.value.filter(J=>(J._liveEpoch||0)>B);a.value=_(W,re).slice(0,10),c.value=re.length}catch{}le===y&&(n.value=!1)}async function k(){const le=++g,B=S;l.value=!0;try{const W=await U.get("/api/audit?error_only=1&limit=5");if(le!==g)return;const re=B===S?[]:i.value.filter(J=>(J._liveErrorEpoch||0)>B);i.value=_(W,re).slice(0,5),o.value=!1}catch{if(le!==g)return;o.value=B===S||i.value.length===0}le===g&&(l.value=!1)}async function x(){try{const le=await U.get("/api/knowledge");d.value=(Array.isArray(le)?le:[]).reduce((B,W)=>B+(W.chunks||0),0)}catch{d.value=null}}async function O(){try{const le=await U.get("/api/agents");r.value=le.filter(B=>B.status==="running")}catch{}}async function $(){u.value={...u.value,reload:!0};try{await U.post("/api/reload"),we.success("Config reloaded")}catch(le){we.error(le.message)}u.value={...u.value,reload:!1}}async function T(){if(!await Kt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const B=e.value.session_count;e.value={...e.value,session_count:0};try{const W=await U.post("/api/sessions/clear-all");we.success(`Cleared ${W.count} session${W.count!==1?"s":""}`),await I()}catch(W){e.value={...e.value,session_count:B},we.error(W.message)}u.value={...u.value,clearSessions:!1}}async function M(){if(!await Kt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const B=e.value.loop_count;e.value={...e.value,loop_count:0};try{const W=await U.post("/api/loops/stop-all");we.success(W.result),await I()}catch(W){e.value={...e.value,loop_count:B},we.error(W.message)}u.value={...u.value,stopLoops:!1}}function V(){t.value=!0,s.value=null,I(),w(),k(),O()}let G=null,P=null,L=null;function N(le){if(le.payload&&le.payload.tool_name){b+=1;const B={...le.payload,_isNew:!0,_key:++p,_liveEpoch:b};a.value.unshift(B),a.value.length>10&&a.value.pop(),c.value++,B.error&&(S+=1,B._liveErrorEpoch=S,o.value=!1,i.value.unshift(B),i.value.length>5&&i.value.pop()),setTimeout(()=>{B._isNew=!1},1500),clearTimeout(L),L=setTimeout(()=>{c.value=0},1e4)}}let te=null;return Ge(async()=>{await Promise.all([I(),w(),k(),O(),x()]),G=setInterval(I,15e3),P=setInterval(O,1e4),st.subscribe("events",N),te=st.onReconnected(()=>{w(),k()})}),ft(()=>{G&&clearInterval(G),P&&clearInterval(P),clearTimeout(L),st.unsubscribe("events",N),te&&(te(),te=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:E,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:w,fetchErrors:k,fetchStatus:I,onEvent:N,formatTime:tk,formatDuration:vi,retry:V,reloadConfig:$,clearSessions:T,stopAllLoops:M}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Dp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function XS(e){if(Array.isArray(e))return e}function e1(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function t1(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function s1(e,t){return XS(e)||e1(e,t)||a1(e,t)||t1()}function a1(e,t){if(e){if(typeof e=="string")return Dp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Dp(e,t):void 0}}const Sv=Object.entries,Pp=Object.setPrototypeOf,n1=Object.isFrozen,i1=Object.getPrototypeOf,l1=Object.getOwnPropertyDescriptor;let fs=Object.freeze,Hs=Object.seal,qn=Object.create,Tv=typeof Reflect<"u"&&Reflect,Rc=Tv.apply,Ic=Tv.construct;fs||(fs=function(t){return t});Hs||(Hs=function(t){return t});Rc||(Rc=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});Ic||(Ic=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const xa=$t(Array.prototype.forEach),o1=$t(Array.prototype.lastIndexOf),Mp=$t(Array.prototype.pop),Un=$t(Array.prototype.push),r1=$t(Array.prototype.splice),rs=Array.isArray,Fi=$t(String.prototype.toLowerCase),zr=$t(String.prototype.toString),Fp=$t(String.prototype.match),Hn=$t(String.prototype.replace),$p=$t(String.prototype.indexOf),c1=$t(String.prototype.trim),d1=$t(Number.prototype.toString),u1=$t(Boolean.prototype.toString),Bp=typeof BigInt>"u"?null:$t(BigInt.prototype.toString),Up=typeof Symbol>"u"?null:$t(Symbol.prototype.toString),Tt=$t(Object.prototype.hasOwnProperty),Ii=$t(Object.prototype.toString),Wt=$t(RegExp.prototype.test),dn=p1(TypeError);function $t(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return Rc(e,t,a)}}function p1(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return Ic(e,s)}}function qe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Fi;if(Pp&&Pp(e,null),!rs(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(n1(t)||(t[a]=i),n=i)}e[n]=!0}return e}function f1(e){for(let t=0;t<e.length;t++)Tt(e,t)||(e[t]=null);return e}function ts(e){const t=qn(null);for(const a of Sv(e)){var s=s1(a,2);const n=s[0],i=s[1];Tt(e,n)&&(rs(i)?t[n]=f1(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ts(i):t[n]=i)}return t}function h1(e){switch(typeof e){case"string":return e;case"number":return d1(e);case"boolean":return u1(e);case"bigint":return Bp?Bp(e):"0";case"symbol":return Up?Up(e):"Symbol()";case"undefined":return Ii(e);case"function":case"object":{if(e===null)return Ii(e);const t=e,s=na(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:Ii(a)}return Ii(e)}default:return Ii(e)}}function na(e,t){for(;e!==null;){const a=l1(e,t);if(a){if(a.get)return $t(a.get);if(typeof a.value=="function")return $t(a.value)}e=i1(e)}function s(){return null}return s}function m1(e){try{return Wt(e,""),!0}catch{return!1}}const Hp=fs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),jr=fs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Vr=fs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),v1=fs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),qr=fs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),g1=fs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),zp=fs(["#text"]),jp=fs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Gr=fs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Vp=fs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Wl=fs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),b1=Hs(/{{[\w\W]*|^[\w\W]*}}/g),y1=Hs(/<%[\w\W]*|^[\w\W]*%>/g),x1=Hs(/\${[\w\W]*/g),_1=Hs(/^data-[\-\w.\u00B7-\uFFFF]+$/),w1=Hs(/^aria-[\-\w]+$/),qp=Hs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),k1=Hs(/^(?:\w+script|data):/i),S1=Hs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),T1=Hs(/^html$/i),C1=Hs(/^[a-z][.\w]*(-[.\w]+)+$/i),sa={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},E1=function(){return typeof window>"u"?null:window},A1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Gp=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Cv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:E1();const t=Ce=>Cv(Ce);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==sa.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,h=na(p,"cloneNode"),m=na(p,"remove"),v=na(p,"nextSibling"),E=na(p,"childNodes"),I=na(p,"parentNode"),y=na(p,"shadowRoot"),g=na(p,"attributes"),b=l&&l.prototype?na(l.prototype,"nodeType"):null,S=l&&l.prototype?na(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ce=s.createElement("template");Ce.content&&Ce.content.ownerDocument&&(s=Ce.content.ownerDocument)}let _,w="",k,x=!1,O=0;const $=function(){if(O>0)throw dn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},T=function(D){$(),O++;try{return _.createHTML(D)}finally{O--}},M=function(D){$(),O++;try{return _.createScriptURL(D)}finally{O--}},V=function(){return x||(k=A1(u,n),x=!0),k},G=s,P=G.implementation,L=G.createNodeIterator,N=G.createDocumentFragment,te=G.getElementsByTagName,le=a.importNode;let B=Gp();t.isSupported=typeof Sv=="function"&&typeof I=="function"&&P&&P.createHTMLDocument!==void 0;const W=b1,re=y1,J=x1,fe=_1,de=w1,q=k1,ce=S1,ue=C1;let me=qp,ye=null;const Fe=qe({},[...Hp,...jr,...Vr,...qr,...zp]);let C=null;const F=qe({},[...jp,...Gr,...Vp,...Wl]);let R=Object.seal(qn(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),Z=null,ee=null;const ne=Object.seal(qn(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ve=!0,H=!0,Q=!1,X=!0,pe=!1,he=!0,xe=!1,Oe=!1,ge=!1,He=!1,Be=!1,ze=!1,Qe=!0,ot=!1;const nt="user-content-";let Y=!0,_e=!1,Ae={},Le=null;const se=qe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Ee=null;const Ne=qe({},["audio","video","img","source","image","track"]);let Je=null;const Lt=qe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ke="http://www.w3.org/1998/Math/MathML",Bt="http://www.w3.org/2000/svg",Ut="http://www.w3.org/1999/xhtml";let hs=Ut,Ys=!1,Os=null;const nn=qe({},[Ke,Bt,Ut],zr);let Qs=qe({},["mi","mo","mn","ms","mtext"]),zs=qe({},["annotation-xml"]);const Ha=qe({},["title","style","font","a","script"]);let ws=null;const fa=["application/xhtml+xml","text/html"],Ls="text/html";let at=null,Ns=null;const ks=s.createElement("form"),ie=function(D){return D instanceof RegExp||D instanceof Function},Te=function(){let D=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ns&&Ns===D)return;(!D||typeof D!="object")&&(D={}),D=ts(D),ws=fa.indexOf(D.PARSER_MEDIA_TYPE)===-1?Ls:D.PARSER_MEDIA_TYPE,at=ws==="application/xhtml+xml"?zr:Fi,ye=Tt(D,"ALLOWED_TAGS")&&rs(D.ALLOWED_TAGS)?qe({},D.ALLOWED_TAGS,at):Fe,C=Tt(D,"ALLOWED_ATTR")&&rs(D.ALLOWED_ATTR)?qe({},D.ALLOWED_ATTR,at):F,Os=Tt(D,"ALLOWED_NAMESPACES")&&rs(D.ALLOWED_NAMESPACES)?qe({},D.ALLOWED_NAMESPACES,zr):nn,Je=Tt(D,"ADD_URI_SAFE_ATTR")&&rs(D.ADD_URI_SAFE_ATTR)?qe(ts(Lt),D.ADD_URI_SAFE_ATTR,at):Lt,Ee=Tt(D,"ADD_DATA_URI_TAGS")&&rs(D.ADD_DATA_URI_TAGS)?qe(ts(Ne),D.ADD_DATA_URI_TAGS,at):Ne,Le=Tt(D,"FORBID_CONTENTS")&&rs(D.FORBID_CONTENTS)?qe({},D.FORBID_CONTENTS,at):se,Z=Tt(D,"FORBID_TAGS")&&rs(D.FORBID_TAGS)?qe({},D.FORBID_TAGS,at):ts({}),ee=Tt(D,"FORBID_ATTR")&&rs(D.FORBID_ATTR)?qe({},D.FORBID_ATTR,at):ts({}),Ae=Tt(D,"USE_PROFILES")?D.USE_PROFILES&&typeof D.USE_PROFILES=="object"?ts(D.USE_PROFILES):D.USE_PROFILES:!1,ve=D.ALLOW_ARIA_ATTR!==!1,H=D.ALLOW_DATA_ATTR!==!1,Q=D.ALLOW_UNKNOWN_PROTOCOLS||!1,X=D.ALLOW_SELF_CLOSE_IN_ATTR!==!1,pe=D.SAFE_FOR_TEMPLATES||!1,he=D.SAFE_FOR_XML!==!1,xe=D.WHOLE_DOCUMENT||!1,He=D.RETURN_DOM||!1,Be=D.RETURN_DOM_FRAGMENT||!1,ze=D.RETURN_TRUSTED_TYPE||!1,ge=D.FORCE_BODY||!1,Qe=D.SANITIZE_DOM!==!1,ot=D.SANITIZE_NAMED_PROPS||!1,Y=D.KEEP_CONTENT!==!1,_e=D.IN_PLACE||!1,me=m1(D.ALLOWED_URI_REGEXP)?D.ALLOWED_URI_REGEXP:qp,hs=typeof D.NAMESPACE=="string"?D.NAMESPACE:Ut,Qs=Tt(D,"MATHML_TEXT_INTEGRATION_POINTS")&&D.MATHML_TEXT_INTEGRATION_POINTS&&typeof D.MATHML_TEXT_INTEGRATION_POINTS=="object"?ts(D.MATHML_TEXT_INTEGRATION_POINTS):qe({},["mi","mo","mn","ms","mtext"]),zs=Tt(D,"HTML_INTEGRATION_POINTS")&&D.HTML_INTEGRATION_POINTS&&typeof D.HTML_INTEGRATION_POINTS=="object"?ts(D.HTML_INTEGRATION_POINTS):qe({},["annotation-xml"]);const oe=Tt(D,"CUSTOM_ELEMENT_HANDLING")&&D.CUSTOM_ELEMENT_HANDLING&&typeof D.CUSTOM_ELEMENT_HANDLING=="object"?ts(D.CUSTOM_ELEMENT_HANDLING):qn(null);if(R=qn(null),Tt(oe,"tagNameCheck")&&ie(oe.tagNameCheck)&&(R.tagNameCheck=oe.tagNameCheck),Tt(oe,"attributeNameCheck")&&ie(oe.attributeNameCheck)&&(R.attributeNameCheck=oe.attributeNameCheck),Tt(oe,"allowCustomizedBuiltInElements")&&typeof oe.allowCustomizedBuiltInElements=="boolean"&&(R.allowCustomizedBuiltInElements=oe.allowCustomizedBuiltInElements),pe&&(H=!1),Be&&(He=!0),Ae&&(ye=qe({},zp),C=qn(null),Ae.html===!0&&(qe(ye,Hp),qe(C,jp)),Ae.svg===!0&&(qe(ye,jr),qe(C,Gr),qe(C,Wl)),Ae.svgFilters===!0&&(qe(ye,Vr),qe(C,Gr),qe(C,Wl)),Ae.mathMl===!0&&(qe(ye,qr),qe(C,Vp),qe(C,Wl))),ne.tagCheck=null,ne.attributeCheck=null,Tt(D,"ADD_TAGS")&&(typeof D.ADD_TAGS=="function"?ne.tagCheck=D.ADD_TAGS:rs(D.ADD_TAGS)&&(ye===Fe&&(ye=ts(ye)),qe(ye,D.ADD_TAGS,at))),Tt(D,"ADD_ATTR")&&(typeof D.ADD_ATTR=="function"?ne.attributeCheck=D.ADD_ATTR:rs(D.ADD_ATTR)&&(C===F&&(C=ts(C)),qe(C,D.ADD_ATTR,at))),Tt(D,"ADD_URI_SAFE_ATTR")&&rs(D.ADD_URI_SAFE_ATTR)&&qe(Je,D.ADD_URI_SAFE_ATTR,at),Tt(D,"FORBID_CONTENTS")&&rs(D.FORBID_CONTENTS)&&(Le===se&&(Le=ts(Le)),qe(Le,D.FORBID_CONTENTS,at)),Tt(D,"ADD_FORBID_CONTENTS")&&rs(D.ADD_FORBID_CONTENTS)&&(Le===se&&(Le=ts(Le)),qe(Le,D.ADD_FORBID_CONTENTS,at)),Y&&(ye["#text"]=!0),xe&&qe(ye,["html","head","body"]),ye.table&&(qe(ye,["tbody"]),delete Z.tbody),D.TRUSTED_TYPES_POLICY){if(typeof D.TRUSTED_TYPES_POLICY.createHTML!="function")throw dn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof D.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw dn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const be=_;_=D.TRUSTED_TYPES_POLICY;try{w=T("")}catch(Pe){throw _=be,Pe}}else D.TRUSTED_TYPES_POLICY===null?(_=void 0,w=""):(_===void 0&&(_=V()),_&&typeof w=="string"&&(w=T("")));(B.uponSanitizeElement.length>0||B.uponSanitizeAttribute.length>0)&&ye===Fe&&(ye=ts(ye)),B.uponSanitizeAttribute.length>0&&C===F&&(C=ts(C)),fs&&fs(D),Ns=D},$e=qe({},[...jr,...Vr,...v1]),et=qe({},[...qr,...g1]),dt=function(D){let oe=I(D);(!oe||!oe.tagName)&&(oe={namespaceURI:hs,tagName:"template"});const be=Fi(D.tagName),Pe=Fi(oe.tagName);return Os[D.namespaceURI]?D.namespaceURI===Bt?oe.namespaceURI===Ut?be==="svg":oe.namespaceURI===Ke?be==="svg"&&(Pe==="annotation-xml"||Qs[Pe]):!!$e[be]:D.namespaceURI===Ke?oe.namespaceURI===Ut?be==="math":oe.namespaceURI===Bt?be==="math"&&zs[Pe]:!!et[be]:D.namespaceURI===Ut?oe.namespaceURI===Bt&&!zs[Pe]||oe.namespaceURI===Ke&&!Qs[Pe]?!1:!et[be]&&(Ha[be]||!$e[be]):!!(ws==="application/xhtml+xml"&&Os[D.namespaceURI]):!1},mt=function(D){Un(t.removed,{element:D});try{I(D).removeChild(D)}catch{if(m(D),!I(D))throw dn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},ha=function(D){const oe=E?E(D):D.childNodes;if(oe){const Pe=[];xa(oe,De=>{Un(Pe,De)}),xa(Pe,De=>{try{m(De)}catch{}})}const be=g?g(D):null;if(be)for(let Pe=be.length-1;Pe>=0;--Pe){const De=be[Pe],je=De&&De.name;if(typeof je=="string")try{D.removeAttribute(je)}catch{}}},js=function(D,oe){try{Un(t.removed,{attribute:oe.getAttributeNode(D),from:oe})}catch{Un(t.removed,{attribute:null,from:oe})}if(oe.removeAttribute(D),D==="is")if(He||Be)try{mt(oe)}catch{}else try{oe.setAttribute(D,"")}catch{}},xi=function(D){const oe=g?g(D):D.attributes;if(oe)for(let be=oe.length-1;be>=0;--be){const Pe=oe[be],De=Pe&&Pe.name;if(!(typeof De!="string"||C[at(De)]))try{D.removeAttribute(De)}catch{}}},_i=function(D){const oe=[D];for(;oe.length>0;){const be=oe.pop();(b?b(be):be.nodeType)===sa.element&&xi(be);const De=E?E(be):be.childNodes;if(De)for(let je=De.length-1;je>=0;--je)oe.push(De[je])}},Ln=function(D){let oe=null,be=null;if(ge)D="<remove></remove>"+D;else{const je=Fp(D,/^[\r\n\t ]+/);be=je&&je[0]}ws==="application/xhtml+xml"&&hs===Ut&&(D='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+D+"</body></html>");const Pe=_?T(D):D;if(hs===Ut)try{oe=new d().parseFromString(Pe,ws)}catch{}if(!oe||!oe.documentElement){oe=P.createDocument(hs,"template",null);try{oe.documentElement.innerHTML=Ys?w:Pe}catch{}}const De=oe.body||oe.documentElement;return D&&be&&De.insertBefore(s.createTextNode(be),De.childNodes[0]||null),hs===Ut?te.call(oe,xe?"html":"body")[0]:xe?oe.documentElement:De},Nn=function(D){return L.call(D.ownerDocument||D,D,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},ln=function(D){var oe,be;D.normalize();const Pe=L.call(D.ownerDocument||D,D,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let De=Pe.nextNode();for(;De;){let At=De.data;xa([W,re,J],ht=>{At=Hn(At,ht," ")}),De.data=At,De=Pe.nextNode()}const je=(oe=(be=D.querySelectorAll)===null||be===void 0?void 0:be.call(D,"template"))!==null&&oe!==void 0?oe:[];xa(Array.from(je),At=>{Xs(At.content)&&ln(At.content)})},za=function(D){const oe=S?S(D):null;return typeof oe!="string"||at(oe)!=="form"?!1:typeof D.nodeName!="string"||typeof D.textContent!="string"||typeof D.removeChild!="function"||D.attributes!==g(D)||typeof D.removeAttribute!="function"||typeof D.setAttribute!="function"||typeof D.namespaceURI!="string"||typeof D.insertBefore!="function"||typeof D.hasChildNodes!="function"||D.nodeType!==b(D)||D.childNodes!==E(D)},Xs=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return b(D)===sa.documentFragment}catch{return!1}},ma=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return typeof b(D)=="number"}catch{return!1}};function Ss(Ce,D,oe){xa(Ce,be=>{be.call(t,D,oe,Ns)})}const Dn=function(D){let oe=null;if(Ss(B.beforeSanitizeElements,D,null),za(D))return mt(D),!0;const be=at(S?S(D):D.nodeName);if(Ss(B.uponSanitizeElement,D,{tagName:be,allowedTags:ye}),he&&D.hasChildNodes()&&!ma(D.firstElementChild)&&Wt(/<[/\w!]/g,D.innerHTML)&&Wt(/<[/\w!]/g,D.textContent)||he&&D.namespaceURI===Ut&&be==="style"&&ma(D.firstElementChild)||D.nodeType===sa.progressingInstruction||he&&D.nodeType===sa.comment&&Wt(/<[/\w]/g,D.data))return mt(D),!0;if(Z[be]||!(ne.tagCheck instanceof Function&&ne.tagCheck(be))&&!ye[be]){if(!Z[be]&&Ie(be)&&(R.tagNameCheck instanceof RegExp&&Wt(R.tagNameCheck,be)||R.tagNameCheck instanceof Function&&R.tagNameCheck(be)))return!1;if(Y&&!Le[be]){const De=I(D),je=E(D);if(je&&De){const At=je.length;for(let ht=At-1;ht>=0;--ht){const wt=_e?je[ht]:h(je[ht],!0);De.insertBefore(wt,v(D))}}}return mt(D),!0}return(b?b(D):D.nodeType)===sa.element&&!dt(D)||(be==="noscript"||be==="noembed"||be==="noframes")&&Wt(/<\/no(script|embed|frames)/i,D.innerHTML)?(mt(D),!0):(pe&&D.nodeType===sa.text&&(oe=D.textContent,xa([W,re,J],De=>{oe=Hn(oe,De," ")}),D.textContent!==oe&&(Un(t.removed,{element:D.cloneNode()}),D.textContent=oe)),Ss(B.afterSanitizeElements,D,null),!1)},K=function(D,oe,be){if(ee[oe]||Qe&&(oe==="id"||oe==="name")&&(be in s||be in ks))return!1;const Pe=C[oe]||ne.attributeCheck instanceof Function&&ne.attributeCheck(oe,D);if(!(H&&!ee[oe]&&Wt(fe,oe))){if(!(ve&&Wt(de,oe))){if(!Pe||ee[oe]){if(!(Ie(D)&&(R.tagNameCheck instanceof RegExp&&Wt(R.tagNameCheck,D)||R.tagNameCheck instanceof Function&&R.tagNameCheck(D))&&(R.attributeNameCheck instanceof RegExp&&Wt(R.attributeNameCheck,oe)||R.attributeNameCheck instanceof Function&&R.attributeNameCheck(oe,D))||oe==="is"&&R.allowCustomizedBuiltInElements&&(R.tagNameCheck instanceof RegExp&&Wt(R.tagNameCheck,be)||R.tagNameCheck instanceof Function&&R.tagNameCheck(be))))return!1}else if(!Je[oe]){if(!Wt(me,Hn(be,ce,""))){if(!((oe==="src"||oe==="xlink:href"||oe==="href")&&D!=="script"&&$p(be,"data:")===0&&Ee[D])){if(!(Q&&!Wt(q,Hn(be,ce,"")))){if(be)return!1}}}}}}return!0},ke=qe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ie=function(D){return!ke[Fi(D)]&&Wt(ue,D)},Vs=function(D){Ss(B.beforeSanitizeAttributes,D,null);const oe=D.attributes;if(!oe||za(D))return;const be={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:C,forceKeepAttr:void 0};let Pe=oe.length;for(;Pe--;){const De=oe[Pe],je=De.name,At=De.namespaceURI,ht=De.value,wt=at(je),ea=ht;let Nt=je==="value"?ea:c1(ea);if(be.attrName=wt,be.attrValue=Nt,be.keepAttr=!0,be.forceKeepAttr=void 0,Ss(B.uponSanitizeAttribute,D,be),Nt=be.attrValue,ot&&(wt==="id"||wt==="name")&&$p(Nt,nt)!==0&&(js(je,D),Nt=nt+Nt),he&&Wt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Nt)){js(je,D);continue}if(wt==="attributename"&&Fp(Nt,"href")){js(je,D);continue}if(be.forceKeepAttr)continue;if(!be.keepAttr){js(je,D);continue}if(!X&&Wt(/\/>/i,Nt)){js(je,D);continue}pe&&xa([W,re,J],El=>{Nt=Hn(Nt,El," ")});const Cl=at(D.nodeName);if(!K(Cl,wt,Nt)){js(je,D);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!At)switch(u.getAttributeType(Cl,wt)){case"TrustedHTML":{Nt=T(Nt);break}case"TrustedScriptURL":{Nt=M(Nt);break}}if(Nt!==ea)try{At?D.setAttributeNS(At,je,Nt):D.setAttribute(je,Nt),za(D)?mt(D):Mp(t.removed)}catch{js(je,D)}}Ss(B.afterSanitizeAttributes,D,null)},va=function(D){let oe=null;const be=Nn(D);for(Ss(B.beforeSanitizeShadowDOM,D,null);oe=be.nextNode();)if(Ss(B.uponSanitizeShadowNode,oe,null),Dn(oe),Vs(oe),Xs(oe.content)&&va(oe.content),(b?b(oe):oe.nodeType)===sa.element){const De=y?y(oe):oe.shadowRoot;Xs(De)&&(ja(De),va(De))}Ss(B.afterSanitizeShadowDOM,D,null)},ja=function(D){const oe=[{node:D,shadow:null}];for(;oe.length>0;){const be=oe.pop();if(be.shadow){va(be.shadow);continue}const Pe=be.node,je=(b?b(Pe):Pe.nodeType)===sa.element,At=E?E(Pe):Pe.childNodes;if(At)for(let ht=At.length-1;ht>=0;--ht)oe.push({node:At[ht],shadow:null});if(je){const ht=S?S(Pe):null;if(typeof ht=="string"&&at(ht)==="template"){const wt=Pe.content;Xs(wt)&&oe.push({node:wt,shadow:null})}}if(je){const ht=y?y(Pe):Pe.shadowRoot;Xs(ht)&&oe.push({node:null,shadow:ht},{node:ht,shadow:null})}}};return t.sanitize=function(Ce){let D=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},oe=null,be=null,Pe=null,De=null;if(Ys=!Ce,Ys&&(Ce="<!-->"),typeof Ce!="string"&&!ma(Ce)&&(Ce=h1(Ce),typeof Ce!="string"))throw dn("dirty is not a string, aborting");if(!t.isSupported)return Ce;Oe||Te(D),t.removed=[];const je=_e&&typeof Ce!="string"&&ma(Ce);if(je){const wt=S?S(Ce):Ce.nodeName;if(typeof wt=="string"){const ea=at(wt);if(!ye[ea]||Z[ea])throw dn("root node is forbidden and cannot be sanitized in-place")}if(za(Ce))throw dn("root node is clobbered and cannot be sanitized in-place");try{ja(Ce)}catch(ea){throw ha(Ce),ea}}else if(ma(Ce))oe=Ln("<!---->"),be=oe.ownerDocument.importNode(Ce,!0),be.nodeType===sa.element&&be.nodeName==="BODY"||be.nodeName==="HTML"?oe=be:oe.appendChild(be),ja(be);else{if(!He&&!pe&&!xe&&Ce.indexOf("<")===-1)return _&&ze?T(Ce):Ce;if(oe=Ln(Ce),!oe)return He?null:ze?w:""}oe&&ge&&mt(oe.firstChild);const At=Nn(je?Ce:oe);try{for(;Pe=At.nextNode();)Dn(Pe),Vs(Pe),Xs(Pe.content)&&va(Pe.content)}catch(wt){throw je&&ha(Ce),wt}if(je)return xa(t.removed,wt=>{wt.element&&_i(wt.element)}),pe&&ln(Ce),Ce;if(He){if(pe&&ln(oe),Be)for(De=N.call(oe.ownerDocument);oe.firstChild;)De.appendChild(oe.firstChild);else De=oe;return(C.shadowroot||C.shadowrootmode)&&(De=le.call(a,De,!0)),De}let ht=xe?oe.outerHTML:oe.innerHTML;return xe&&ye["!doctype"]&&oe.ownerDocument&&oe.ownerDocument.doctype&&oe.ownerDocument.doctype.name&&Wt(T1,oe.ownerDocument.doctype.name)&&(ht="<!DOCTYPE "+oe.ownerDocument.doctype.name+`>
`+ht),pe&&xa([W,re,J],wt=>{ht=Hn(ht,wt," ")}),_&&ze?T(ht):ht},t.setConfig=function(){let Ce=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(Ce),Oe=!0},t.clearConfig=function(){Ns=null,Oe=!1,_=k,w=""},t.isValidAttribute=function(Ce,D,oe){Ns||Te({});const be=at(Ce),Pe=at(D);return K(be,Pe,oe)},t.addHook=function(Ce,D){typeof D=="function"&&Un(B[Ce],D)},t.removeHook=function(Ce,D){if(D!==void 0){const oe=o1(B[Ce],D);return oe===-1?void 0:r1(B[Ce],oe,1)[0]}return Mp(B[Ce])},t.removeHooks=function(Ce){B[Ce]=[]},t.removeAllHooks=function(){B=Gp()},t}var Kp=Cv();function Md(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var On=Md();function Ev(e){On=e}var Gi={exec:()=>null};function pt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(us.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var us={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},R1=/^(?:[ \t]*(?:\n|$))+/,I1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,O1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Tl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,L1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Fd=/(?:[*+-]|\d{1,9}[.)])/,Av=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Rv=pt(Av).replace(/bull/g,Fd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),N1=pt(Av).replace(/bull/g,Fd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),$d=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,D1=/^[^\n]+/,Bd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,P1=pt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Bd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),M1=pt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Fd).getRegex(),ur="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Ud=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,F1=pt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Ud).replace("tag",ur).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Iv=pt($d).replace("hr",Tl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ur).getRegex(),$1=pt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Iv).getRegex(),Hd={blockquote:$1,code:I1,def:P1,fences:O1,heading:L1,hr:Tl,html:F1,lheading:Rv,list:M1,newline:R1,paragraph:Iv,table:Gi,text:D1},Wp=pt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Tl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ur).getRegex(),B1={...Hd,lheading:N1,table:Wp,paragraph:pt($d).replace("hr",Tl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Wp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ur).getRegex()},U1={...Hd,html:pt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Ud).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Gi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:pt($d).replace("hr",Tl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Rv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},H1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,z1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Ov=/^( {2,}|\\)\n(?!\s*$)/,j1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,pr=/[\p{P}\p{S}]/u,zd=/[\s\p{P}\p{S}]/u,Lv=/[^\s\p{P}\p{S}]/u,V1=pt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,zd).getRegex(),Nv=/(?!~)[\p{P}\p{S}]/u,q1=/(?!~)[\s\p{P}\p{S}]/u,G1=/(?:[^\s\p{P}\p{S}]|~)/u,K1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Dv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,W1=pt(Dv,"u").replace(/punct/g,pr).getRegex(),J1=pt(Dv,"u").replace(/punct/g,Nv).getRegex(),Pv="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Z1=pt(Pv,"gu").replace(/notPunctSpace/g,Lv).replace(/punctSpace/g,zd).replace(/punct/g,pr).getRegex(),Y1=pt(Pv,"gu").replace(/notPunctSpace/g,G1).replace(/punctSpace/g,q1).replace(/punct/g,Nv).getRegex(),Q1=pt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Lv).replace(/punctSpace/g,zd).replace(/punct/g,pr).getRegex(),X1=pt(/\\(punct)/,"gu").replace(/punct/g,pr).getRegex(),eT=pt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),tT=pt(Ud).replace("(?:-->|$)","-->").getRegex(),sT=pt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",tT).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),No=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,aT=pt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",No).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Mv=pt(/^!?\[(label)\]\[(ref)\]/).replace("label",No).replace("ref",Bd).getRegex(),Fv=pt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Bd).getRegex(),nT=pt("reflink|nolink(?!\\()","g").replace("reflink",Mv).replace("nolink",Fv).getRegex(),jd={_backpedal:Gi,anyPunctuation:X1,autolink:eT,blockSkip:K1,br:Ov,code:z1,del:Gi,emStrongLDelim:W1,emStrongRDelimAst:Z1,emStrongRDelimUnd:Q1,escape:H1,link:aT,nolink:Fv,punctuation:V1,reflink:Mv,reflinkSearch:nT,tag:sT,text:j1,url:Gi},iT={...jd,link:pt(/^!?\[(label)\]\((.*?)\)/).replace("label",No).getRegex(),reflink:pt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",No).getRegex()},Oc={...jd,emStrongRDelimAst:Y1,emStrongLDelim:J1,url:pt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},lT={...Oc,br:pt(Ov).replace("{2,}","*").getRegex(),text:pt(Oc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Jl={normal:Hd,gfm:B1,pedantic:U1},Oi={normal:jd,gfm:Oc,breaks:lT,pedantic:iT},oT={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Jp=e=>oT[e];function ia(e,t){if(t){if(us.escapeTest.test(e))return e.replace(us.escapeReplace,Jp)}else if(us.escapeTestNoEncode.test(e))return e.replace(us.escapeReplaceNoEncode,Jp);return e}function Zp(e){try{e=encodeURI(e).replace(us.percentDecode,"%")}catch{return null}return e}function Yp(e,t){var i;const s=e.replace(us.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(us.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(us.slashPipe,"|");return a}function Li(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function rT(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function Qp(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function cT(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var Do=class{constructor(e){gt(this,"options");gt(this,"rules");gt(this,"lexer");this.options=e||On}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Li(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=cT(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=Li(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Li(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Li(t[0],`
`).split(`
`),a="",n="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");a=a?`${a}
${c}`:c,n=n?`${n}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const h=p,m=h.raw+`
`+s.join(`
`),v=this.blockquote(m);i[i.length-1]=v,a=a.substring(0,a.length-h.raw.length)+v.raw,n=n.substring(0,n.length-h.text.length)+v.text;break}else if((p==null?void 0:p.type)==="list"){const h=p,m=h.raw+`
`+s.join(`
`),v=this.list(m);i[i.length-1]=v,a=a.substring(0,a.length-p.raw.length)+v.raw,n=n.substring(0,n.length-h.raw.length)+v.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:a,tokens:i,text:n}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const a=s.length>1,n={type:"list",raw:"",ordered:a,start:a?+s.slice(0,-1):"",loose:!1,items:[]};s=a?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=a?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,I=>" ".repeat(3*I.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const I=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),S=this.rules.other.htmlBeginRegex(m);for(;e;){const _=e.split(`
`,1)[0];let w;if(p=_,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),w=p):w=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||S.test(p)||I.test(p)||y.test(p))break;if(w.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+w.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=_+`
`,e=e.substring(_.length+1),u=w.slice(m)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,E;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(E=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!v,checked:E,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Yp(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(Yp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Li(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=rT(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),Qp(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Qp(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Aa=class Lc{constructor(t){gt(this,"tokens");gt(this,"options");gt(this,"state");gt(this,"tokenizer");gt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||On,this.options.tokenizer=this.options.tokenizer||new Do,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:us,block:Jl.normal,inline:Oi.normal};this.options.pedantic?(s.block=Jl.pedantic,s.inline=Oi.pedantic):this.options.gfm&&(s.block=Jl.gfm,this.options.breaks?s.inline=Oi.breaks:s.inline=Oi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Jl,inline:Oi}}static lex(t,s){return new Lc(s).lex(t)}static lexInline(t,s){return new Lc(s).inlineTokens(t)}lex(t){t=t.replace(us.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(us.tabCharGlobal,"    ").replace(us.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Po=class{constructor(e){gt(this,"options");gt(this,"parser");this.options=e||On}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(us.notSpaceStart))==null?void 0:i[0],n=e.replace(us.endingNewline,"")+`
`;return a?'<pre><code class="language-'+ia(a)+'">'+(s?n:ia(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:ia(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+ia(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ia(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=Zp(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+ia(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=Zp(e);if(n===null)return ia(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ia(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ia(e.text)}},Vd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ra=class Nc{constructor(t){gt(this,"options");gt(this,"renderer");gt(this,"textRenderer");this.options=t||On,this.options.renderer=this.options.renderer||new Po,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Vd}static parse(t,s){return new Nc(s).parse(t)}static parseInline(t,s){return new Nc(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},Kr,ao=(Kr=class{constructor(e){gt(this,"options");gt(this,"block");this.options=e||On}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Aa.lex:Aa.lexInline}provideParser(){return this.block?Ra.parse:Ra.parseInline}},gt(Kr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Kr),dT=class{constructor(...e){gt(this,"defaults",Md());gt(this,"options",this.setOptions);gt(this,"parse",this.parseMarkdown(!0));gt(this,"parseInline",this.parseMarkdown(!1));gt(this,"Parser",Ra);gt(this,"Renderer",Po);gt(this,"TextRenderer",Vd);gt(this,"Lexer",Aa);gt(this,"Tokenizer",Do);gt(this,"Hooks",ao);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Po(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new Do(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new ao;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];ao.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Aa.lex(e,t??this.defaults)}parser(e,t){return Ra.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Aa.lex:Aa.lexInline,r=i.hooks?i.hooks.provideParser():e?Ra.parse:Ra.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+ia(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},Tn=new dT;function ct(e,t){return Tn.parse(e,t)}ct.options=ct.setOptions=function(e){return Tn.setOptions(e),ct.defaults=Tn.defaults,Ev(ct.defaults),ct};ct.getDefaults=Md;ct.defaults=On;ct.use=function(...e){return Tn.use(...e),ct.defaults=Tn.defaults,Ev(ct.defaults),ct};ct.walkTokens=function(e,t){return Tn.walkTokens(e,t)};ct.parseInline=Tn.parseInline;ct.Parser=Ra;ct.parser=Ra.parse;ct.Renderer=Po;ct.TextRenderer=Vd;ct.Lexer=Aa;ct.lexer=Aa.lex;ct.Tokenizer=Do;ct.Hooks=ao;ct.parse=ct;ct.options;ct.setOptions;ct.use;ct.walkTokens;ct.parseInline;Ra.parse;Aa.lex;const uT={breaks:!0,gfm:!0};function Xp(e){if(!e)return"";try{if(typeof ct<"u"&&ct.parse){const t=ct.parse(e,uT);return typeof Kp<"u"?Kp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function pT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const fT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function hT(e){return fT[e]||"wrench"}const mT=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function ef(e){if(!e)return[];const t=e.match(mT);return t?[...new Set(t)]:[]}const vT={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=j(()=>t.value.trim().length>0&&!s.value),p=f(st.state||"disconnected");let h=null;const m=j(()=>{const P=p.value;return P==="connected"?"Connected":P==="reconnecting"?"Reconnecting…":P==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],E=j(()=>{const P=Math.floor(l.value/4)%v.length,L=l.value;return L>3?`${v[P]} (${L}s)`:v[0]});function I(){It(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!i.value)return;const P=i.value;P.style.height="auto",P.style.height=Math.min(P.scrollHeight,120)+"px"}function g(P,L,N={}){const te={id:++c,role:P,content:L,timestamp:Date.now(),html:P==="bot"?Xp(L):"",tools_used:N.tools_used||[],is_error:N.is_error||!1,images:P==="bot"?ef(L):[],files:N.files||[],_showTools:!1};return e.value.push(te),I(),P==="bot"&&It(()=>b()),te}function b(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(L=>{L.setAttribute("data-copy","true"),L.style.position="relative";const N=document.createElement("button");N.className="chat-code-copy",N.textContent="Copy",N.addEventListener("click",()=>{const te=L.querySelector("code"),le=te?te.textContent:L.textContent;navigator.clipboard.writeText(le).then(()=>{N.textContent="Copied!",setTimeout(()=>{N.textContent="Copy"},1500)}).catch(()=>{})}),L.appendChild(N)})}function S(P){if(P===0)return!0;const L=e.value[P-1],N=e.value[P],te=new Date(L.timestamp).toDateString(),le=new Date(N.timestamp).toDateString();return te!==le}function _(P){const L=new Date(P),N=new Date;if(L.toDateString()===N.toDateString())return"Today";const te=new Date(N);return te.setDate(te.getDate()-1),L.toDateString()===te.toDateString()?"Yesterday":L.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function w(P){t.value=P,It(()=>V())}function k(P){window.open(P,"_blank","noopener")}function x(P){P.target.style.display="none"}function O(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function $(){r&&(clearInterval(r),r=null),l.value=0}function T(P){s.value&&(s.value=!1,$(),P.type==="chat_response"?g("bot",P.content,{tools_used:P.tools_used||[],is_error:P.is_error||!1,files:P.files||[]}):P.type==="chat_error"&&g("bot",P.error||"Unknown error",{is_error:!0}),It(()=>{var L;return(L=i.value)==null?void 0:L.focus()}))}async function M(P){try{const L=await U.post("/api/chat",{content:P,channel_id:o.value});g("bot",L.response,{tools_used:L.tools_used||[],is_error:L.is_error||!1,files:L.files||[]})}catch(L){g("bot",L.message||"Failed to send message",{is_error:!0})}}async function V(){const P=t.value.trim();if(!P||s.value)return;g("user",P),t.value="",s.value=!0,O(),i.value&&(i.value.style.height="auto"),st.connected&&st.sendChat(P,{channelId:o.value})||(await M(P),s.value=!1,$()),It(()=>{var N;return(N=i.value)==null?void 0:N.focus()})}async function G(){a.value="";try{if(!o.value){const L=await U.get("/api/auth/session");o.value=L.channel_id||L.user_id||"web-user"}const P=await U.get("/api/sessions/"+encodeURIComponent(o.value));if(P&&P.messages&&P.messages.length>0){for(const L of P.messages){const N=L.role==="user"?"user":"bot";let te=L.content||"";if(N==="user"){const B=te.match(/^\[.*?\]:\s*/);B&&(te=te.slice(B[0].length))}if(!te.trim())continue;const le={id:++c,role:N,content:te,timestamp:L.timestamp?L.timestamp*1e3:Date.now(),html:N==="bot"?Xp(te):"",tools_used:[],is_error:!1,images:N==="bot"?ef(te):[],files:[],_showTools:!1};e.value.push(le)}It(()=>{I(),b()})}}catch(P){P&&P.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",we.error(a.value))}}return Ge(()=>{st.subscribe("chat",T),p.value=st.state||"disconnected",h=st.onState(P=>{p.value=P}),G(),It(()=>{var P;return(P=i.value)==null?void 0:P.focus()})}),ft(()=>{st.unsubscribe("chat",T),h&&(h(),h=null),$()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:m,typingText:E,suggestions:d,send:V,autoResize:y,formatTime:pT,formatDate:_,showDateSeparator:S,useSuggestion:w,openImage:k,onImageError:x,getToolIcon:hT,loadHistory:G}}},gT={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=j(()=>e.value==="custom"),v=j(()=>[...i.value,...l.value]),E=j(()=>l.value.includes(e.value)),I=j(()=>{var k;return m.value?t.value||"Odin":((k=n.value[e.value])==null?void 0:k.name)||e.value}),y=j(()=>{var k;return m.value?s.value||"(empty — will use Odin default)":((k=n.value[e.value])==null?void 0:k.identity)||""}),g=j(()=>{var k;return m.value?a.value||"(empty — will use Odin default)":((k=n.value[e.value])==null?void 0:k.voice)||""});async function b(){d.value=!0;try{const k=await U.get("/api/personality");e.value=k.preset||"odin",t.value=k.custom_name||"",s.value=k.custom_identity||"",a.value=k.custom_voice||"",n.value=k.presets||{},i.value=k.builtin_presets||[],l.value=k.user_presets||[]}catch(k){c.value=k.message}finally{d.value=!1}}async function S(){o.value=!0,c.value=null,r.value=!1;try{await U.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(k){c.value=k.message}finally{o.value=!1}}async function _(){const k=u.value.trim();if(k){h.value=!0,c.value=null;try{await U.post("/api/personality/presets",{name:k,display_name:I.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=k.toLowerCase().replace(/ /g,"_")}catch(x){c.value=x.message}finally{h.value=!1}}}async function w(){if(await Kt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await U.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(x){c.value=x.message}}}return Ge(b),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:v,isCustom:m,isUserPreset:E,previewName:I,previewIdentity:y,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:S,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:_,deletePreset:w,builtinPresets:i,userPresets:l}},template:`
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
  `},bT={props:["onComplete"],template:`
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
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,h=null;function m(){return p+=1,h==null||h.abort(),h=null,p}function v(S,_,w){return typeof U.postWithOptions=="function"?U.postWithOptions(S,_,{signal:w}):U.post(S,_)}async function E(){var w,k,x;a.value=!0,i.value="",l.value="Saving setup…";const S={},_=!!s.value.trim();t.value.trim()&&(S.web_api_token=t.value.trim()),s.value.trim()&&(S.discord_token=s.value.trim());try{const O=U.post("/api/setup/complete",S);t.value="",s.value="";const $=await O,T=((w=$.discord)==null?void 0:w.state)||$.discord_status;if(T==="failed"?(i.value=((k=$.discord)==null?void 0:k.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):T==="connecting"?l.value="Saved. Connecting Discord…":T==="ready"?l.value="Saved. Discord ready.":_?l.value="Saved. Discord token stored; attachment status is pending.":l.value=$.message||"Setup saved. Ready to sign in.",(x=$.restart_required)!=null&&x.length){const M=$.message||`Restart Odin to apply: ${$.restart_required.join(", ")}`;l.value.includes(M)||(l.value+=` ${M}`)}n.value=!0}catch(O){i.value=O.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function I(){const S=m(),_=typeof AbortController=="function"?new AbortController:null;h=_,o.value=!0,u.value="";try{const w=await v("/api/codex/device-code",void 0,_==null?void 0:_.signal);if(S!==p)return;c.value=w,r.value="pending";const k=await v("/api/codex/device-poll",{device_auth_id:w.device_auth_id,user_code:w.user_code,interval:w.interval},_==null?void 0:_.signal);if(S!==p)return;d.value=k||{},r.value="ready"}catch(w){S===p&&(w==null?void 0:w.name)!=="AbortError"&&(u.value=w.message||"Device sign-in failed.",r.value="failed")}finally{S===p&&(o.value=!1,h=null)}}function y(){m(),o.value=!1,b()}function g(){var S;(S=e.onComplete)==null||S.call(e)}function b(){r.value="",c.value=null,d.value={},u.value=""}return ft(()=>{m()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:E,onComplete:g,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:I,cancelDeviceLogin:y,clearDeviceState:b}}},St=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),$v=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:QS,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:vT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:mk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Sk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:qk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:gT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:qS,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:St("/operations","live")},{path:"/agents",redirect:St("/operations","agents")},{path:"/loops",redirect:St("/operations","loops")},{path:"/processes",redirect:St("/operations","processes")},{path:"/schedules",redirect:St("/operations","schedules")},{path:"/audit",redirect:St("/history","audit")},{path:"/sessions",redirect:St("/history","sessions")},{path:"/traces",redirect:St("/history","traces")},{path:"/usage",redirect:St("/history","usage")},{path:"/tools",redirect:St("/capabilities","tools")},{path:"/skills",redirect:St("/capabilities","skills")},{path:"/mcp",redirect:St("/capabilities","mcp-servers")},{path:"/knowledge",redirect:St("/capabilities","knowledge")},{path:"/memory",redirect:St("/capabilities","memory")},{path:"/learned",redirect:St("/capabilities","learned")},{path:"/health",redirect:St("/system","health")},{path:"/resources",redirect:St("/system","resources")},{path:"/logs",redirect:St("/system","logs")},{path:"/config",redirect:St("/system","config")},{path:"/host-access",redirect:St("/system","host-access")},{path:"/hosts",redirect:St("/system","hosts")},{path:"/internals",redirect:St("/system","internals")}],Ki=jw({history:_w(),routes:$v});Ki.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const yT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{U.setPersist(n.value),await U.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},xT={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),E=$v.filter(B=>B.meta),I=j(()=>["Workspace","Operate","Observe","Manage"].map(B=>({name:B,routes:E.filter(W=>W.meta.section===B)})).filter(B=>B.routes.length)),y=j(()=>{var B;return((B=Ki.currentRoute.value.meta)==null?void 0:B.label)||"Odin"}),g=j(()=>{var B;return((B=Ki.currentRoute.value.meta)==null?void 0:B.section)||"Management"}),b=j(()=>{var B;return((B=Ki.currentRoute.value.meta)==null?void 0:B.description)||"Management console"});function S(){st.disconnect(),P&&(clearInterval(P),P=null)}U.onSessionExpired=()=>{t.value=!0,S(),U.setToken(""),e.value="login"};function _(B){var W;if((B.ctrlKey||B.metaKey)&&B.key.toLowerCase()==="k"){e.value==="ready"&&(B.preventDefault(),Lp());return}if(a.value&&B.key==="Tab"){const re=[...((W=n.value)==null?void 0:W.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(re.length){const J=re[0],fe=re[re.length-1];if(B.shiftKey&&(document.activeElement===J||!n.value.contains(document.activeElement))){B.preventDefault(),fe.focus();return}if(!B.shiftKey&&(document.activeElement===fe||!n.value.contains(document.activeElement))){B.preventDefault(),J.focus();return}}}if(B.key==="Escape"&&a.value){a.value=!1,B.preventDefault();return}if(B.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(B.target.tagName)){B.preventDefault();const re=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');re&&re.focus()}}function w(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function k(){try{const B=await U.get("/api/setup/status");if(B.mode==="pending"||B.needed===!0)return S(),e.value="setup",!0}catch(B){B==null||B.name}return!1}Ge(async()=>{if(document.addEventListener("keydown",_),o=window.matchMedia("(max-width: 900px)"),w(),o.addEventListener("change",w),await k())return;const B=await U.check();B.ok?(e.value="ready",te()):B.needsAuth?e.value="login":(e.value="ready",te())});function x(){t.value=!1,e.value="ready",te()}async function O(){if(await k())return;const B=await U.check();B.ok?(e.value="ready",te()):B.needsAuth?e.value="login":(e.value="ready",te())}async function $(){S(),e.value="login",await U.logout()}function T(){s.value=!s.value}function M(){a.value=!a.value}Ft(a,async B=>{var W,re;if(B)r=document.activeElement,await It(),(re=(W=n.value)==null?void 0:W.querySelector(".nav-item"))==null||re.focus();else if(r!=null&&r.isConnected){const J=r;r=null,requestAnimationFrame(()=>J.focus())}});const V=j(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function G(B,W="info",re=3e3){p.value={text:B,level:W},clearTimeout(h),h=setTimeout(()=>{p.value=null},re)}let P=null,L=!1,N=[];function te(){for(const B of N)B();N=[st.onStatus(B=>{c.value=B}),st.onLatencyChange(B=>{u.value=B}),st.onState((B,W)=>{d.value=B,B==="connected"?(L&&G("Connection restored","success"),L=!0):B==="reconnecting"&&W.attempt===1&&G("Connection lost — reconnecting…","warn")})],st.connect(),le(),P&&clearInterval(P),P=setInterval(le,15e3)}async function le(){try{const B=await U.get("/api/status");m.value=B.status==="online"?"online":"starting";const W=B.uptime_seconds||0,re=Math.floor(W/3600),J=Math.floor(W%3600/60);v.value=`${re}h ${J}m uptime`}catch{m.value="offline",v.value=""}}return ft(()=>{P&&clearInterval(P);for(const B of N)B();N=[],st.disconnect(),document.removeEventListener("keydown",_),o==null||o.removeEventListener("change",w)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:V,wsToast:p,botStatus:m,botUptime:v,navRoutes:E,navGroups:I,currentPage:y,currentSection:g,currentDescription:b,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:x,onSetupComplete:O,logout:$,toggleSidebar:T,toggleMobileNavigation:M,openPalette:Lp}}},Ua=wo(xT);Ua.component("odin-icon",JS);Ua.component("login-screen",yT);Ua.component("setup-page",bT);Ua.component("toast-container",P_);Ua.component("confirm-host",M_);Ua.component("command-palette",WS);Ua.directive("modal-focus",YS);Ua.use(Ki);Ua.mount("#app");
