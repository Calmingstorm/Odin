var Ov=Object.defineProperty;var Lv=(e,t,s)=>t in e?Ov(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ht=(e,t,s)=>Lv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Nv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new Al("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new Fd(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Al("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new Fd((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new Al((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Al?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Al extends Error{constructor(t){super(t),this.name="AuthError"}}class Fd extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Dv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)a.send(JSON.stringify({subscribe:o}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(a,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const B=new Nv,Xe=new Dv(B);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Is(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ke={},Ya=[],Xt=()=>{},Wa=()=>!1,Ea=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),No=e=>e.startsWith("onUpdate:"),Ge=Object.assign,Cc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Mv=Object.prototype.hasOwnProperty,at=(e,t)=>Mv.call(e,t),Ee=Array.isArray,Qa=e=>yi(e)==="[object Map]",Aa=e=>yi(e)==="[object Set]",$d=e=>yi(e)==="[object Date]",Pv=e=>yi(e)==="[object RegExp]",Me=e=>typeof e=="function",Ue=e=>typeof e=="string",os=e=>typeof e=="symbol",st=e=>e!==null&&typeof e=="object",Ec=e=>(st(e)||Me(e))&&Me(e.then)&&Me(e.catch),Kp=Object.prototype.toString,yi=e=>Kp.call(e),Fv=e=>yi(e).slice(8,-1),Do=e=>yi(e)==="[object Object]",Mo=e=>Ue(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,In=Is(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),$v=Is("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Po=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Uv=/-\w/g,pt=Po(e=>e.replace(Uv,t=>t.slice(1).toUpperCase())),Bv=/\B([A-Z])/g,ws=Po(e=>e.replace(Bv,"-$1").toLowerCase()),Ra=Po(e=>e.charAt(0).toUpperCase()+e.slice(1)),Xa=Po(e=>e?`on${Ra(e)}`:""),qt=(e,t)=>!Object.is(e,t),ei=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Wp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Fo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},to=e=>{const t=Ue(e)?Number(e):NaN;return isNaN(t)?e:t};let Ud;const $o=()=>Ud||(Ud=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Hv(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const zv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",jv=Is(zv);function gl(e){if(Ee(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ue(n)?Jp(n):gl(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ue(e)||st(e))return e}const Vv=/;(?![^(]*\))/g,qv=/:([^]+)/,Gv=/\/\*[^]*?\*\//g;function Jp(e){const t={};return e.replace(Gv,"").split(Vv).forEach(s=>{if(s){const n=s.split(qv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function bl(e){let t="";if(Ue(e))t=e;else if(Ee(e))for(let s=0;s<e.length;s++){const n=bl(e[s]);n&&(t+=n+" ")}else if(st(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Kv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ue(t)&&(e.class=bl(t)),s&&(e.style=gl(s)),e}const Wv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Jv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Zv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Yv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Qv=Is(Wv),Xv=Is(Jv),eg=Is(Zv),tg=Is(Yv),sg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",ng=Is(sg);function Zp(e){return!!e||e===""}function ag(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Dn(e[n],t[n]);return s}function Dn(e,t){if(e===t)return!0;let s=$d(e),n=$d(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=os(e),n=os(t),s||n)return e===t;if(s=Ee(e),n=Ee(t),s||n)return s&&n?ag(e,t):!1;if(s=st(e),n=st(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Dn(e[l],t[l]))return!1}}return String(e)===String(t)}function Uo(e,t){return e.findIndex(s=>Dn(s,t))}const Yp=e=>!!(e&&e.__v_isRef===!0),Qp=e=>Ue(e)?e:e==null?"":Ee(e)||st(e)&&(e.toString===Kp||!Me(e.toString))?Yp(e)?Qp(e.value):JSON.stringify(e,Xp,2):String(e),Xp=(e,t)=>Yp(t)?Xp(e,t.value):Qa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[ur(n,i)+" =>"]=a,s),{})}:Aa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>ur(s))}:os(t)?ur(t):st(t)&&!Ee(t)&&!Do(t)?String(t):t,ur=(e,t="")=>{var s;return os(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function ig(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let jt;class Ac{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&jt&&(jt.active?(this.parent=jt,this.index=(jt.scopes||(jt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=jt;try{return jt=this,t()}finally{jt=s}}}on(){++this._on===1&&(this.prevScope=jt,jt=this)}off(){if(this._on>0&&--this._on===0){if(jt===this)jt=this.prevScope;else{let t=jt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function lg(e){return new Ac(e)}function ef(){return jt}function og(e,t=!1){jt&&jt.cleanups.push(e)}let mt;const pr=new WeakSet;class Zi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,jt&&(jt.active?jt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,pr.has(this)&&(pr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||sf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Bd(this),nf(this);const t=mt,s=Js;mt=this,Js=!0;try{return this.fn()}finally{af(this),mt=t,Js=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Oc(t);this.deps=this.depsTail=void 0,Bd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?pr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Br(this)&&this.run()}get dirty(){return Br(this)}}let tf=0,Bi,Hi;function sf(e,t=!1){if(e.flags|=8,t){e.next=Hi,Hi=e;return}e.next=Bi,Bi=e}function Rc(){tf++}function Ic(){if(--tf>0)return;if(Hi){let t=Hi;for(Hi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Bi;){let t=Bi;for(Bi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function nf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function af(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Oc(n),rg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Br(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(lf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function lf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Yi)||(e.globalVersion=Yi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Br(e))))return;e.flags|=2;const t=e.dep,s=mt,n=Js;mt=e,Js=!0;try{nf(e);const a=e.fn(e._value);(t.version===0||qt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{mt=s,Js=n,af(e),e.flags&=-3}}function Oc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Oc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function rg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function cg(e,t){e.effect instanceof Zi&&(e=e.effect.fn);const s=new Zi(e);t&&Ge(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function dg(e){e.effect.stop()}let Js=!0;const of=[];function Mn(){of.push(Js),Js=!1}function Pn(){const e=of.pop();Js=e===void 0?!0:e}function Bd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=mt;mt=void 0;try{t()}finally{mt=s}}}let Yi=0;class ug{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Bo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!mt||!Js||mt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==mt)s=this.activeLink=new ug(mt,this),mt.deps?(s.prevDep=mt.depsTail,mt.depsTail.nextDep=s,mt.depsTail=s):mt.deps=mt.depsTail=s,rf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=mt.depsTail,s.nextDep=void 0,mt.depsTail.nextDep=s,mt.depsTail=s,mt.deps===s&&(mt.deps=n)}return s}trigger(t){this.version++,Yi++,this.notify(t)}notify(t){Rc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Ic()}}}function rf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)rf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const so=new WeakMap,ba=Symbol(""),Hr=Symbol(""),Qi=Symbol("");function as(e,t,s){if(Js&&mt){let n=so.get(e);n||so.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Bo),a.map=n,a.key=s),a.track()}}function Tn(e,t,s,n,a,i){const l=so.get(e);if(!l){Yi++;return}const o=r=>{r&&r.trigger()};if(Rc(),t==="clear")l.forEach(o);else{const r=Ee(e),c=r&&Mo(s);if(r&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Qi||!os(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Qi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(ba)),Qa(e)&&o(l.get(Hr)));break;case"delete":r||(o(l.get(ba)),Qa(e)&&o(l.get(Hr)));break;case"set":Qa(e)&&o(l.get(ba));break}}Ic()}function pg(e,t){const s=so.get(e);return s&&s.get(t)}function $a(e){const t=Qe(e);return t===e?t:(as(t,"iterate",Qi),Ss(e)?t:t.map(Ys))}function Ho(e){return as(e=Qe(e),"iterate",Qi),e}function cn(e,t){return un(e)?oi(On(e)?Ys(t):t):Ys(t)}const fg={__proto__:null,[Symbol.iterator](){return fr(this,Symbol.iterator,e=>cn(this,e))},concat(...e){return $a(this).concat(...e.map(t=>Ee(t)?$a(t):t))},entries(){return fr(this,"entries",e=>(e[1]=cn(this,e[1]),e))},every(e,t){return gn(this,"every",e,t,void 0,arguments)},filter(e,t){return gn(this,"filter",e,t,s=>s.map(n=>cn(this,n)),arguments)},find(e,t){return gn(this,"find",e,t,s=>cn(this,s),arguments)},findIndex(e,t){return gn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return gn(this,"findLast",e,t,s=>cn(this,s),arguments)},findLastIndex(e,t){return gn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return gn(this,"forEach",e,t,void 0,arguments)},includes(...e){return hr(this,"includes",e)},indexOf(...e){return hr(this,"indexOf",e)},join(e){return $a(this).join(e)},lastIndexOf(...e){return hr(this,"lastIndexOf",e)},map(e,t){return gn(this,"map",e,t,void 0,arguments)},pop(){return Si(this,"pop")},push(...e){return Si(this,"push",e)},reduce(e,...t){return Hd(this,"reduce",e,t)},reduceRight(e,...t){return Hd(this,"reduceRight",e,t)},shift(){return Si(this,"shift")},some(e,t){return gn(this,"some",e,t,void 0,arguments)},splice(...e){return Si(this,"splice",e)},toReversed(){return $a(this).toReversed()},toSorted(e){return $a(this).toSorted(e)},toSpliced(...e){return $a(this).toSpliced(...e)},unshift(...e){return Si(this,"unshift",e)},values(){return fr(this,"values",e=>cn(this,e))}};function fr(e,t,s){const n=Ho(e),a=n[t]();return n!==e&&!Ss(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const hg=Array.prototype;function gn(e,t,s,n,a,i){const l=Ho(e),o=l!==e&&!Ss(e),r=l[t];if(r!==hg[t]){const u=r.apply(e,i);return o?Ys(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,cn(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,n);return o&&a?a(d):d}function Hd(e,t,s,n){const a=Ho(e),i=a!==e&&!Ss(e);let l=s,o=!1;a!==e&&(i?(o=n.length===0,l=function(c,d,u){return o&&(o=!1,c=cn(e,c)),s.call(this,c,cn(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=a[t](l,...n);return o?cn(e,r):r}function hr(e,t,s){const n=Qe(e);as(n,"iterate",Qi);const a=n[t](...s);return(a===-1||a===!1)&&yl(s[0])?(s[0]=Qe(s[0]),n[t](...s)):a}function Si(e,t,s=[]){Mn(),Rc();const n=Qe(e)[t].apply(e,s);return Ic(),Pn(),n}const mg=Is("__proto__,__v_isRef,__isVue"),cf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(os));function vg(e){os(e)||(e=String(e));const t=Qe(this);return as(t,"has",e),t.hasOwnProperty(e)}class df{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?vf:mf:i?hf:ff).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ee(t);if(!a){let r;if(l&&(r=fg[s]))return r;if(s==="hasOwnProperty")return vg}const o=Reflect.get(t,s,Pt(t)?t:n);if((os(s)?cf.has(s):mg(s))||(a||as(t,"get",s),i))return o;if(Pt(o)){const r=l&&Mo(s)?o:o.value;return a&&st(r)?no(r):r}return st(o)?a?no(o):aa(o):o}}class uf extends df{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ee(t)&&Mo(s);if(!this._isShallow){const c=un(i);if(!Ss(n)&&!un(n)&&(i=Qe(i),n=Qe(n)),!l&&Pt(i)&&!Pt(n))return c||(i.value=n),!0}const o=l?Number(s)<t.length:at(t,s),r=Reflect.set(t,s,n,Pt(t)?t:a);return t===Qe(a)&&(o?qt(n,i)&&Tn(t,"set",s,n):Tn(t,"add",s,n)),r}deleteProperty(t,s){const n=at(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&Tn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!os(s)||!cf.has(s))&&as(t,"has",s),n}ownKeys(t){return as(t,"iterate",Ee(t)?"length":ba),Reflect.ownKeys(t)}}class pf extends df{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const gg=new uf,bg=new pf,yg=new uf(!0),xg=new pf(!0),zr=e=>e,Rl=e=>Reflect.getPrototypeOf(e);function _g(e,t,s){return function(...n){const a=this.__v_raw,i=Qe(a),l=Qa(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=a[e](...n),d=s?zr:t?oi:Ys;return!t&&as(i,"iterate",r?Hr:ba),Ge(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Il(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function wg(e,t){const s={get(a){const i=this.__v_raw,l=Qe(i),o=Qe(a);e||(qt(a,o)&&as(l,"get",a),as(l,"get",o));const{has:r}=Rl(l),c=t?zr:e?oi:Ys;if(r.call(l,a))return c(i.get(a));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&as(Qe(a),"iterate",ba),a.size},has(a){const i=this.__v_raw,l=Qe(i),o=Qe(a);return e||(qt(a,o)&&as(l,"has",a),as(l,"has",o)),a===o?i.has(a):i.has(a)||i.has(o)},forEach(a,i){const l=this,o=l.__v_raw,r=Qe(o),c=t?zr:e?oi:Ys;return!e&&as(r,"iterate",ba),o.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return Ge(s,e?{add:Il("add"),set:Il("set"),delete:Il("delete"),clear:Il("clear")}:{add(a){const i=Qe(this),l=Rl(i),o=Qe(a),r=!t&&!Ss(a)&&!un(a)?o:a;return l.has.call(i,r)||qt(a,r)&&l.has.call(i,a)||qt(o,r)&&l.has.call(i,o)||(i.add(r),Tn(i,"add",r,r)),this},set(a,i){!t&&!Ss(i)&&!un(i)&&(i=Qe(i));const l=Qe(this),{has:o,get:r}=Rl(l);let c=o.call(l,a);c||(a=Qe(a),c=o.call(l,a));const d=r.call(l,a);return l.set(a,i),c?qt(i,d)&&Tn(l,"set",a,i):Tn(l,"add",a,i),this},delete(a){const i=Qe(this),{has:l,get:o}=Rl(i);let r=l.call(i,a);r||(a=Qe(a),r=l.call(i,a)),o&&o.call(i,a);const c=i.delete(a);return r&&Tn(i,"delete",a,void 0),c},clear(){const a=Qe(this),i=a.size!==0,l=a.clear();return i&&Tn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=_g(a,e,t)}),s}function zo(e,t){const s=wg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(at(s,a)&&a in n?s:n,a,i)}const kg={get:zo(!1,!1)},Sg={get:zo(!1,!0)},Tg={get:zo(!0,!1)},Cg={get:zo(!0,!0)},ff=new WeakMap,hf=new WeakMap,mf=new WeakMap,vf=new WeakMap;function Eg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function aa(e){return un(e)?e:jo(e,!1,gg,kg,ff)}function Lc(e){return jo(e,!1,yg,Sg,hf)}function no(e){return jo(e,!0,bg,Tg,mf)}function Ag(e){return jo(e,!0,xg,Cg,vf)}function jo(e,t,s,n,a){if(!st(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Eg(Fv(e));if(l===0)return e;const o=new Proxy(e,l===2?n:s);return a.set(e,o),o}function On(e){return un(e)?On(e.__v_raw):!!(e&&e.__v_isReactive)}function un(e){return!!(e&&e.__v_isReadonly)}function Ss(e){return!!(e&&e.__v_isShallow)}function yl(e){return e?!!e.__v_raw:!1}function Qe(e){const t=e&&e.__v_raw;return t?Qe(t):e}function gf(e){return!at(e,"__v_skip")&&Object.isExtensible(e)&&Wp(e,"__v_skip",!0),e}const Ys=e=>st(e)?aa(e):e,oi=e=>st(e)?no(e):e;function Pt(e){return e?e.__v_isRef===!0:!1}function h(e){return bf(e,!1)}function Nc(e){return bf(e,!0)}function bf(e,t){return Pt(e)?e:new Rg(e,t)}class Rg{constructor(t,s){this.dep=new Bo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Qe(t),this._value=s?t:Ys(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||Ss(t)||un(t);t=n?t:Qe(t),qt(t,s)&&(this._rawValue=t,this._value=n?t:Ys(t),this.dep.trigger())}}function Ig(e){e.dep&&e.dep.trigger()}function dn(e){return Pt(e)?e.value:e}function Og(e){return Me(e)?e():dn(e)}const Lg={get:(e,t,s)=>t==="__v_raw"?e:dn(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Pt(a)&&!Pt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Dc(e){return On(e)?e:new Proxy(e,Lg)}class Ng{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Bo,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function yf(e){return new Ng(e)}function Dg(e){const t=Ee(e)?new Array(e.length):{};for(const s in e)t[s]=xf(e,s);return t}class Mg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=os(s)?s:String(s),this._raw=Qe(t);let a=!0,i=t;if(!Ee(t)||os(this._key)||!Mo(this._key))do a=!yl(i)||Ss(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=dn(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Pt(this._raw[this._key])){const s=this._object[this._key];if(Pt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return pg(this._raw,this._key)}}class Pg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Fg(e,t,s){return Pt(e)?e:Me(e)?new Pg(e):st(e)&&arguments.length>1?xf(e,t,s):h(e)}function xf(e,t,s){return new Mg(e,t,s)}class $g{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Bo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Yi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&mt!==this)return sf(this,!0),!0}get value(){const t=this.dep.track();return lf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Ug(e,t,s=!1){let n,a;return Me(e)?n=e:(n=e.get,a=e.set),new $g(n,a,s)}const Bg={GET:"get",HAS:"has",ITERATE:"iterate"},Hg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Ol={},ao=new WeakMap;let Zn;function zg(){return Zn}function _f(e,t=!1,s=Zn){if(s){let n=ao.get(s);n||ao.set(s,n=[]),n.push(e)}}function jg(e,t,s=Ke){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>a?b:Ss(b)||a===!1||a===0?Cn(b,1):Cn(b);let d,u,p,f,m=!1,v=!1;if(Pt(e)?(u=()=>e.value,m=Ss(e)):On(e)?(u=()=>c(e),m=!0):Ee(e)?(v=!0,m=e.some(b=>On(b)||Ss(b)),u=()=>e.map(b=>{if(Pt(b))return b.value;if(On(b))return c(b);if(Me(b))return r?r(b,2):b()})):Me(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Mn();try{p()}finally{Pn()}}const b=Zn;Zn=d;try{return r?r(e,3,[f]):e(f)}finally{Zn=b}}:u=Xt,t&&a){const b=u,A=a===!0?1/0:a;u=()=>Cn(b(),A)}const T=ef(),L=()=>{d.stop(),T&&T.active&&Cc(T.effects,d)};if(i&&t){const b=t;t=(...A)=>{const _=b(...A);return L(),_}}let y=v?new Array(e.length).fill(Ol):Ol;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const A=d.run();if(b||a||m||(v?A.some((_,I)=>qt(_,y[I])):qt(A,y))){p&&p();const _=Zn;Zn=d;try{const I=[A,y===Ol?void 0:v&&y[0]===Ol?[]:y,f];y=A,r?r(t,3,I):t(...I)}finally{Zn=_}}}else d.run()};return o&&o(g),d=new Zi(u),d.scheduler=l?()=>l(g,!1):g,f=b=>_f(b,!1,d),p=d.onStop=()=>{const b=ao.get(d);if(b){if(r)r(b,4);else for(const A of b)A();ao.delete(d)}},t?n?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),L.pause=d.pause.bind(d),L.resume=d.resume.bind(d),L.stop=L,L}function Cn(e,t=1/0,s){if(t<=0||!st(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Pt(e))Cn(e.value,t,s);else if(Ee(e))for(let n=0;n<e.length;n++)Cn(e[n],t,s);else if(Aa(e)||Qa(e))e.forEach(n=>{Cn(n,t,s)});else if(Do(e)){for(const n in e)Cn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&Cn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const wf=[];function Vg(e){wf.push(e)}function qg(){wf.pop()}function Gg(e,t){}const Kg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Wg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function xi(e,t,s,n){try{return n?e(...n):e()}catch(a){Ia(a,t,s)}}function Rs(e,t,s,n){if(Me(e)){const a=xi(e,t,s,n);return a&&Ec(a)&&a.catch(i=>{Ia(i,t,s)}),a}if(Ee(e)){const a=[];for(let i=0;i<e.length;i++)a.push(Rs(e[i],t,s,n));return a}}function Ia(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ke;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Mn(),xi(i,null,10,[e,r,c]),Pn();return}}Jg(e,s,a,n,l)}function Jg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const us=[];let on=-1;const ti=[];let Yn=null,Va=0;const kf=Promise.resolve();let io=null;function It(e){const t=io||kf;return e?t.then(this?e.bind(this):e):t}function Zg(e){let t=on+1,s=us.length;for(;t<s;){const n=t+s>>>1,a=us[n],i=el(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Mc(e){if(!(e.flags&1)){const t=el(e),s=us[us.length-1];!s||!(e.flags&2)&&t>=el(s)?us.push(e):us.splice(Zg(t),0,e),e.flags|=1,Sf()}}function Sf(){io||(io=kf.then(Tf))}function Xi(e){Ee(e)?ti.push(...e):Yn&&e.id===-1?Yn.splice(Va+1,0,e):e.flags&1||(ti.push(e),e.flags|=1),Sf()}function zd(e,t,s=on+1){for(;s<us.length;s++){const n=us[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;us.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function lo(e){if(ti.length){const t=[...new Set(ti)].sort((s,n)=>el(s)-el(n));if(ti.length=0,Yn){Yn.push(...t);return}for(Yn=t,Va=0;Va<Yn.length;Va++){const s=Yn[Va];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Yn=null,Va=0}}const el=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Tf(e){try{for(on=0;on<us.length;on++){const t=us[on];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),xi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;on<us.length;on++){const t=us[on];t&&(t.flags&=-2)}on=-1,us.length=0,lo(),io=null,(us.length||ti.length)&&Tf()}}let qa,Ll=[];function Cf(e,t){var s,n;qa=e,qa?(qa.enabled=!0,Ll.forEach(({event:a,args:i})=>qa.emit(a,...i)),Ll=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Cf(i,t)}),setTimeout(()=>{qa||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Ll=[])},3e3)):Ll=[]}let Qt=null,Vo=null;function tl(e){const t=Qt;return Qt=e,Vo=e&&e.type.__scopeId||null,t}function Yg(e){Vo=e}function Qg(){Vo=null}const Xg=e=>Pc;function Pc(e,t=Qt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&il(-1);const i=tl(t);let l;try{l=e(...a)}finally{tl(i),n._d&&il(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function eb(e,t){if(Qt===null)return e;const s=kl(Qt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,o,r=Ke]=t[a];i&&(Me(i)&&(i={mounted:i,updated:i}),i.deep&&Cn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function rn(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const o=a[l];i&&(o.oldValue=i[l].value);let r=o.dir[n];r&&(Mn(),Rs(r,s,8,[e.el,o,e,t]),Pn())}}function zi(e,t){if(Yt){let s=Yt.provides;const n=Yt.parent&&Yt.parent.provides;n===s&&(s=Yt.provides=Object.create(n)),s[e]=t}}function zs(e,t,s=!1){const n=fs();if(n||ya){let a=ya?ya._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Me(t)?t.call(n&&n.proxy):t}}function tb(){return!!(fs()||ya)}const Ef=Symbol.for("v-scx"),Af=()=>zs(Ef);function sb(e,t){return xl(e,null,t)}function nb(e,t){return xl(e,null,{flush:"post"})}function Rf(e,t){return xl(e,null,{flush:"sync"})}function Ft(e,t,s){return xl(e,t,s)}function xl(e,t,s=Ke){const{immediate:n,deep:a,flush:i,once:l}=s,o=Ge({},s),r=t&&n||!t&&i!=="post";let c;if(Sa){if(i==="sync"){const f=Af();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!r){const f=()=>{};return f.stop=Xt,f.resume=Xt,f.pause=Xt,f}}const d=Yt;o.call=(f,m,v)=>Rs(f,d,m,v);let u=!1;i==="post"?o.scheduler=f=>{Dt(f,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(f,m)=>{m?f():Mc(f)}),o.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=jg(e,t,o);return Sa&&(c?c.push(p):r&&p()),p}function ab(e,t,s){const n=this.proxy,a=Ue(e)?e.includes(".")?If(n,e):()=>n[e]:e.bind(n,n);let i;Me(t)?i=t:(i=t.handler,s=t);const l=_i(this),o=xl(a,i.bind(n),s);return l(),o}function If(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Wn=new WeakMap,Of=Symbol("_vte"),Lf=e=>e.__isTeleport,ha=e=>e&&(e.disabled||e.disabled===""),ib=e=>e&&(e.defer||e.defer===""),jd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Vd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,jr=(e,t)=>{const s=e&&e.to;return Ue(s)?t?t(s):null:s},lb={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:m,createText:v,createComment:T,parentNode:L}}=c,y=ha(t.props);let{dynamicChildren:g}=t;const b=(I,E,x)=>{I.shapeFlag&16&&d(I.children,E,x,a,i,l,o,r)},A=(I=t)=>{const E=ha(I.props),x=I.target=jr(I.props,m),N=Vr(x,I,v,f);x&&(l!=="svg"&&jd(x)?l="svg":l!=="mathml"&&Vd(x)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(x),E||(b(I,x,N),Mi(I,!1)))},_=I=>{const E=()=>{if(Wn.get(I)===E){if(Wn.delete(I),ha(I.props)){const x=L(I.el)||s;b(I,x,I.anchor),Mi(I,!0)}A(I)}};Wn.set(I,E),Dt(E,i)};if(e==null){const I=t.el=v(""),E=t.anchor=v("");if(f(I,s,n),f(E,s,n),ib(t.props)||i&&i.pendingBranch){_(t);return}y&&(b(t,s,E),Mi(t,!0)),A()}else{t.el=e.el;const I=t.anchor=e.anchor,E=Wn.get(e);if(E){E.flags|=8,Wn.delete(e),_(t);return}t.targetStart=e.targetStart;const x=t.target=e.target,N=t.targetAnchor=e.targetAnchor,$=ha(e.props),k=$?s:x,M=$?I:N;if(l==="svg"||jd(x)?l="svg":(l==="mathml"||Vd(x))&&(l="mathml"),g?(p(e.dynamicChildren,g,k,a,i,l,o),Kc(e,t,!0)):r||u(e,t,k,M,a,i,l,o,!1),y)$?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Nl(t,s,I,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const H=t.target=jr(t.props,m);H&&Nl(t,H,null,c,0)}else $&&Nl(t,x,N,c,1);Mi(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!ha(p),m=Wn.get(e);if(m&&(m.flags|=8,Wn.delete(e)),u&&(a(c),a(d)),i&&a(r),!m&&l&16)for(let v=0;v<o.length;v++){const T=o[v];n(T,t,s,f,!!T.dynamicChildren)}},move:Nl,hydrate:ob};function Nl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Wn.has(e)&&(!u||ha(d))&&r&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(o,t,s)}function ob(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(T,L){let y=L;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,T._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function f(T,L){L.anchor=u(l(T),L,o(T),s,n,a,i)}const m=t.target=jr(t.props,r),v=ha(t.props);if(m){const T=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(f(e,t),p(m,T),t.targetAnchor||Vr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,T),t.targetAnchor||Vr(m,t,d,c),u(T&&l(T),t,m,s,n,a,i))),Mi(t,v)}else v&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const rb=lb;function Mi(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Vr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Of]=l,e&&(n(i,e,a),n(l,e,a)),l}const $s=Symbol("_leaveCb"),Ti=Symbol("_enterCb");function Fc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return je(()=>{e.isMounted=!0}),Wo(()=>{e.isUnmounting=!0}),e}const Fs=[Function,Array],$c={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Fs,onEnter:Fs,onAfterEnter:Fs,onEnterCancelled:Fs,onBeforeLeave:Fs,onLeave:Fs,onAfterLeave:Fs,onLeaveCancelled:Fs,onBeforeAppear:Fs,onAppear:Fs,onAfterAppear:Fs,onAppearCancelled:Fs},Nf=e=>{const t=e.subTree;return t.component?Nf(t.component):t},cb={name:"BaseTransition",props:$c,setup(e,{slots:t}){const s=fs(),n=Fc();return()=>{const a=t.default&&qo(t.default(),!0),i=a&&a.length?Df(a):s.subTree?vh():void 0;if(!i)return;const l=Qe(e),{mode:o}=l;if(n.isLeaving)return mr(i);const r=qd(i);if(!r)return mr(i);let c=ri(r,l,n,s,u=>c=u);r.type!==Ot&&Fn(r,c);let d=s.subTree&&qd(s.subTree);if(d&&d.type!==Ot&&!Ws(d,r)&&Nf(s).type!==Ot){let u=ri(d,l,n,s);if(Fn(d,u),o==="out-in"&&r.type!==Ot)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},mr(i);o==="in-out"&&r.type!==Ot?u.delayLeave=(p,f,m)=>{const v=Pf(n,d);v[String(d.key)]=d,p[$s]=()=>{f(),p[$s]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Df(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Ot){t=s;break}}return t}const Mf=cb;function Pf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function ri(e,t,s,n,a){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:T,onAppear:L,onAfterAppear:y,onAppearCancelled:g}=t,b=String(e.key),A=Pf(s,e),_=(x,N)=>{x&&Rs(x,n,9,N)},I=(x,N)=>{const $=N[1];_(x,N),Ee(x)?x.every(k=>k.length<=1)&&$():x.length<=1&&$()},E={mode:l,persisted:o,beforeEnter(x){let N=r;if(!s.isMounted)if(i)N=T||r;else return;x[$s]&&x[$s](!0);const $=A[b];$&&Ws(e,$)&&$.el[$s]&&$.el[$s](),_(N,[x])},enter(x){if(A[b]===e)return;let N=c,$=d,k=u;if(!s.isMounted)if(i)N=L||c,$=y||d,k=g||u;else return;let M=!1;x[Ti]=K=>{M||(M=!0,K?_(k,[x]):_($,[x]),E.delayedLeave&&E.delayedLeave(),x[Ti]=void 0)};const H=x[Ti].bind(null,!1);N?I(N,[x,H]):H()},leave(x,N){const $=String(e.key);if(x[Ti]&&x[Ti](!0),s.isUnmounting)return N();_(p,[x]);let k=!1;x[$s]=H=>{k||(k=!0,N(),H?_(v,[x]):_(m,[x]),x[$s]=void 0,A[$]===e&&delete A[$])};const M=x[$s].bind(null,!1);A[$]=e,f?I(f,[x,M]):M()},clone(x){const N=ri(x,t,s,n,a);return a&&a(N),N}};return E}function mr(e){if(wl(e))return e=pn(e),e.children=null,e}function qd(e){if(!wl(e))return Lf(e.type)&&e.children?Df(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Me(s.default))return s.default()}}function Fn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Fn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function qo(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Gt?(l.patchFlag&128&&a++,n=n.concat(qo(l.children,t,o))):(t||l.type!==Ot)&&n.push(o!=null?pn(l,{key:o}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function _l(e,t){return Me(e)?Ge({name:e.name},t,{setup:e}):e}function db(){const e=fs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Uc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function ub(e){const t=fs(),s=Nc(null);if(t){const a=t.refs===Ke?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Gd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const oo=new WeakMap;function si(e,t,s,n,a=!1){if(Ee(e)){e.forEach((v,T)=>si(v,t&&(Ee(t)?t[T]:t),s,n,a));return}if(Ln(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&si(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?kl(n.component):n.el,l=a?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ke?o.refs={}:o.refs,u=o.setupState,p=Qe(u),f=u===Ke?Wa:v=>Gd(d,v)?!1:at(p,v),m=(v,T)=>!(T&&Gd(d,T));if(c!=null&&c!==r){if(Kd(t),Ue(c))d[c]=null,f(c)&&(u[c]=null);else if(Pt(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Me(r))xi(r,o,12,[l,d]);else{const v=Ue(r),T=Pt(r);if(v||T){const L=()=>{if(e.f){const y=v?f(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(a)Ee(y)&&Cc(y,i);else if(Ee(y))y.includes(i)||y.push(i);else if(v)d[r]=[i],f(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,f(r)&&(u[r]=l)):T&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{L(),oo.delete(e)};y.id=-1,oo.set(e,y),Dt(y,s)}else Kd(e),L()}}}function Kd(e){const t=oo.get(e);t&&(t.flags|=8,oo.delete(e))}let Wd=!1;const Ua=()=>{Wd||(console.error("Hydration completed but contains mismatches."),Wd=!0)},pb=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",fb=e=>e.namespaceURI.includes("MathML"),Dl=e=>{if(e.nodeType===1){if(pb(e))return"svg";if(fb(e))return"mathml"}},Ja=e=>e.nodeType===8;function hb(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),lo(),b._vnode=g;return}u(b.firstChild,g,null,null,null),lo(),b._vnode=g},u=(g,b,A,_,I,E=!1)=>{E=E||!!b.dynamicChildren;const x=Ja(g)&&g.data==="[",N=()=>v(g,b,A,_,I,x),{type:$,ref:k,shapeFlag:M,patchFlag:H}=b;let K=g.nodeType;b.el=g,H===-2&&(E=!1,b.dynamicChildren=null);let C=null;switch($){case ta:K!==3?b.children===""?(r(b.el=a(""),l(g),g),C=g):C=N():(g.data!==b.children&&(Ua(),g.data=b.children),C=i(g));break;case Ot:y(g)?(C=i(g),L(b.el=g.content.firstChild,g,A)):K!==8||x?C=N():C=i(g);break;case xa:if(x&&(g=i(g),K=g.nodeType),K===1||K===3){C=g;const S=!b.children.length;for(let O=0;O<b.staticCount;O++)S&&(b.children+=C.nodeType===1?C.outerHTML:C.data),O===b.staticCount-1&&(b.anchor=C),C=i(C);return x?i(C):C}else N();break;case Gt:x?C=m(g,b,A,_,I,E):C=N();break;default:if(M&1)(K!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?C=N():C=p(g,b,A,_,I,E);else if(M&6){b.slotScopeIds=I;const S=l(g);if(x?C=T(g):Ja(g)&&g.data==="teleport start"?C=T(g,g.data,"teleport end"):C=i(g),t(b,S,null,A,_,Dl(S),E),Ln(b)&&!b.type.__asyncResolved){let O;x?(O=yt(Gt),O.anchor=C?C.previousSibling:S.lastChild):O=g.nodeType===3?Jc(""):yt("div"),O.el=g,b.component.subTree=O}}else M&64?K!==8?C=N():C=b.type.hydrate(g,b,A,_,I,E,e,f):M&128&&(C=b.type.hydrate(g,b,A,_,Dl(l(g)),I,E,e,u))}return k!=null&&si(k,null,_,b),C},p=(g,b,A,_,I,E)=>{E=E||!!b.dynamicChildren;const{type:x,props:N,patchFlag:$,shapeFlag:k,dirs:M,transition:H}=b,K=x==="input"||x==="option";if(K||$!==-1){M&&rn(b,null,A,"created");let C=!1;if(y(g)){C=oh(null,H)&&A&&A.vnode.props&&A.vnode.props.appear;const O=g.content.firstChild;if(C){const U=O.getAttribute("class");U&&(O.$cls=U),H.beforeEnter(O)}L(O,g,A),b.el=g=O}if(k&16&&!(N&&(N.innerHTML||N.textContent))){let O=f(g.firstChild,b,g,A,_,I,E);for(O&&!Ml(g,1)&&Ua();O;){const U=O;O=O.nextSibling,o(U)}}else if(k&8){let O=b.children;O[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(O=O.slice(1));const{textContent:U}=g;U!==O&&U!==O.replace(/\r\n|\r/g,`
`)&&(Ml(g,0)||Ua(),g.textContent=b.children)}if(N){if(K||!E||$&48){const O=g.tagName.includes("-");for(const U in N)(K&&(U.endsWith("value")||U==="indeterminate")||Ea(U)&&!In(U)||U[0]==="."||O&&!In(U))&&n(g,U,null,N[U],void 0,A)}else if(N.onClick)n(g,"onClick",null,N.onClick,void 0,A);else if($&4&&On(N.style))for(const O in N.style)N.style[O]}let S;(S=N&&N.onVnodeBeforeMount)&&ys(S,A,b),M&&rn(b,null,A,"beforeMount"),((S=N&&N.onVnodeMounted)||M||C)&&uh(()=>{S&&ys(S,A,b),C&&H.enter(g),M&&rn(b,null,A,"mounted")},_)}return g.nextSibling},f=(g,b,A,_,I,E,x)=>{x=x||!!b.dynamicChildren;const N=b.children,$=N.length;let k=!1;for(let M=0;M<$;M++){const H=x?N[M]:N[M]=_s(N[M]),K=H.type===ta;g?(K&&!x&&M+1<$&&_s(N[M+1]).type===ta&&(r(a(g.data.slice(H.children.length)),A,i(g)),g.data=H.children),g=u(g,H,_,I,E,x)):K&&!H.children?r(H.el=a(""),A):(k||(k=!0,Ml(A,1)||Ua()),s(null,H,A,null,_,I,Dl(A),E))}return g},m=(g,b,A,_,I,E)=>{const{slotScopeIds:x}=b;x&&(I=I?I.concat(x):x);const N=l(g),$=f(i(g),b,N,A,_,I,E);return $&&Ja($)&&$.data==="]"?i(b.anchor=$):(Ua(),r(b.anchor=c("]"),N,$),$)},v=(g,b,A,_,I,E)=>{if(Ml(g.parentElement,1)||Ua(),b.el=null,E){const $=T(g);for(;;){const k=i(g);if(k&&k!==$)o(k);else break}}const x=i(g),N=l(g);return o(g),s(null,b,N,x,A,_,Dl(N),I),A&&(A.vnode.el=b.el,Zo(A,b.el)),x},T=(g,b="[",A="]")=>{let _=0;for(;g;)if(g=i(g),g&&Ja(g)&&(g.data===b&&_++,g.data===A)){if(_===0)return i(g);_--}return g},L=(g,b,A)=>{const _=b.parentNode;_&&_.replaceChild(g,b);let I=A;for(;I;)I.vnode.el===b&&(I.vnode.el=I.subTree.el=g),I=I.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const Jd="data-allow-mismatch",mb={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Ml(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Jd);)e=e.parentElement;const s=e&&e.getAttribute(Jd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(mb[t])}}const vb=$o().requestIdleCallback||(e=>setTimeout(e,1)),gb=$o().cancelIdleCallback||(e=>clearTimeout(e)),bb=(e=1e4)=>t=>{const s=vb(t,{timeout:e});return()=>gb(s)};function yb(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const xb=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(yb(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},_b=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},wb=(e=[])=>(t,s)=>{Ue(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,a)})};return s(l=>{for(const o of e)l.addEventListener(o,a,{once:!0})}),i};function kb(e,t){if(Ja(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ja(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const Ln=e=>!!e.type.__asyncLoader;function Sb(e){Me(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((T,L)=>{r(v,()=>T(p()),()=>L(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return _l({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(m,v,T){let L=!1;(v.bu||(v.bu=[])).push(()=>L=!0);const y=()=>{L||T()},g=i?()=>{const b=i(y,A=>kb(m,A));b&&(v.bum||(v.bum=[])).push(b)}:y;d?g():f().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Yt;if(Uc(m),d)return()=>Pl(d,m);const v=A=>{c=null,Ia(A,m,13,!n)};if(o&&m.suspense||Sa)return f().then(A=>()=>Pl(A,m)).catch(A=>(v(A),()=>n?yt(n,{error:A}):null));const T=h(!1),L=h(),y=h(!!a);let g,b;return ft(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),a&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!T.value&&!L.value){const A=new Error(`Async component timed out after ${l}ms.`);v(A),L.value=A}},l)),f().then(()=>{m.isUnmounted||(T.value=!0,m.parent&&wl(m.parent.vnode)&&m.parent.update())}).catch(A=>{if(m.isUnmounted){c=null;return}v(A),L.value=A}),()=>{if(T.value&&d)return Pl(d,m);if(L.value&&n)return yt(n,{error:L.value});if(s&&!y.value)return Pl(s,m)}}})}function Pl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=yt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const wl=e=>e.type.__isKeepAlive,Tb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=fs(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(y,g,b,A,_)=>{const I=y.component;c(y,g,b,0,o),r(I.vnode,y,g,b,I,o,A,y.slotScopeIds,_),Dt(()=>{I.isDeactivated=!1,I.a&&ei(I.a);const E=y.props&&y.props.onVnodeMounted;E&&ys(E,I.parent,y)},o)},n.deactivate=y=>{const g=y.component;co(g.m),co(g.a),c(y,p,null,1,o),Dt(()=>{g.da&&ei(g.da);const b=y.props&&y.props.onVnodeUnmounted;b&&ys(b,g.parent,y),g.isDeactivated=!0},o)};function f(y){vr(y),d(y,s,o,!0)}function m(y){a.forEach((g,b)=>{const A=Xr(Ln(g)?g.type.__asyncResolved||{}:g.type);A&&!y(A)&&v(b)})}function v(y){const g=a.get(y);g&&(!l||!Ws(g,l))?f(g):l&&vr(l),a.delete(y),i.delete(y)}Ft(()=>[e.include,e.exclude],([y,g])=>{y&&m(b=>Pi(y,b)),g&&m(b=>!Pi(g,b))},{flush:"post",deep:!0});let T=null;const L=()=>{T!=null&&(uo(s.subTree.type)?Dt(()=>{a.set(T,Fl(s.subTree))},s.subTree.suspense):a.set(T,Fl(s.subTree)))};return je(L),Ko(L),Wo(()=>{a.forEach(y=>{const{subTree:g,suspense:b}=s,A=Fl(g);if(y.type===A.type&&y.key===A.key){vr(A);const _=A.component.da;_&&Dt(_,b);return}f(y)})}),()=>{if(T=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!$n(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=Fl(g);if(b.type===Ot)return l=null,b;const A=b.type,_=Xr(Ln(b)?b.type.__asyncResolved||{}:A),{include:I,exclude:E,max:x}=e;if(I&&(!_||!Pi(I,_))||E&&_&&Pi(E,_))return b.shapeFlag&=-257,l=b,g;const N=b.key==null?A:b.key,$=a.get(N);return b.el&&(b=pn(b),g.shapeFlag&128&&(g.ssContent=b)),T=N,$?(b.el=$.el,b.component=$.component,b.transition&&Fn(b,b.transition),b.shapeFlag|=512,i.delete(N),i.add(N)):(i.add(N),x&&i.size>parseInt(x,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,uo(g.type)?g:b}}},Cb=Tb;function Pi(e,t){return Ee(e)?e.some(s=>Pi(s,t)):Ue(e)?e.split(",").includes(t):Pv(e)?(e.lastIndex=0,e.test(t)):!1}function es(e,t){Ff(e,"a",t)}function Wt(e,t){Ff(e,"da",t)}function Ff(e,t,s=Yt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Go(t,n,s),s){let a=s.parent;for(;a&&a.parent;)wl(a.parent.vnode)&&Eb(n,t,s,a),a=a.parent}}function Eb(e,t,s,n){const a=Go(t,e,n,!0);ft(()=>{Cc(n[t],a)},s)}function vr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Fl(e){return e.shapeFlag&128?e.ssContent:e}function Go(e,t,s=Yt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Mn();const o=_i(s),r=Rs(t,s,e,l);return o(),Pn(),r});return n?a.unshift(i):a.push(i),i}}const Un=e=>(t,s=Yt)=>{(!Sa||e==="sp")&&Go(e,(...n)=>t(...n),s)},$f=Un("bm"),je=Un("m"),Bc=Un("bu"),Ko=Un("u"),Wo=Un("bum"),ft=Un("um"),Uf=Un("sp"),Bf=Un("rtg"),Hf=Un("rtc");function zf(e,t=Yt){Go("ec",e,t)}const Hc="components",Ab="directives";function Rb(e,t){return zc(Hc,e,!0,t)||e}const jf=Symbol.for("v-ndc");function Ib(e){return Ue(e)?zc(Hc,e,!1)||e:e||jf}function Ob(e){return zc(Ab,e)}function zc(e,t,s=!0,n=!1){const a=Qt||Yt;if(a){const i=a.type;if(e===Hc){const o=Xr(i,!1);if(o&&(o===t||o===pt(t)||o===Ra(pt(t))))return i}const l=Zd(a[e]||i[e],t)||Zd(a.appContext[e],t);return!l&&n?i:l}}function Zd(e,t){return e&&(e[t]||e[pt(t)]||e[Ra(pt(t))])}function Lb(e,t,s,n){let a;const i=s&&s[n],l=Ee(e);if(l||Ue(e)){const o=l&&On(e);let r=!1,c=!1;o&&(r=!Ss(e),c=un(e),e=Ho(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(r?c?oi(Ys(e[d])):Ys(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let o=0;o<e;o++)a[o]=t(o+1,o,void 0,i&&i[o])}else if(st(e))if(e[Symbol.iterator])a=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);a=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];a[r]=t(e[d],d,r,i&&i[r])}}else a=[];return s&&(s[n]=a),a}function Nb(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ee(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Db(e,t,s={},n,a){if(Qt.ce||Qt.parent&&Ln(Qt.parent)&&Qt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),al(),po(Gt,null,[yt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),al();const l=i&&jc(i(s)),o=s.key||l&&l.key,r=po(Gt,{key:(o&&!os(o)?o:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function jc(e){return e.some(t=>$n(t)?!(t.type===Ot||t.type===Gt&&!jc(t.children)):!0)?e:null}function Mb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Xa(n)]=e[n];return s}const qr=e=>e?yh(e)?kl(e):qr(e.parent):null,ji=Ge(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>qr(e.parent),$root:e=>qr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Vc(e),$forceUpdate:e=>e.f||(e.f=()=>{Mc(e.update)}),$nextTick:e=>e.n||(e.n=It.bind(e.proxy)),$watch:e=>ab.bind(e)}),gr=(e,t)=>e!==Ke&&!e.__isScriptSetup&&at(e,t),Gr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(gr(n,t))return l[t]=1,n[t];if(a!==Ke&&at(a,t))return l[t]=2,a[t];if(at(i,t))return l[t]=3,i[t];if(s!==Ke&&at(s,t))return l[t]=4,s[t];Kr&&(l[t]=0)}}const c=ji[t];let d,u;if(c)return t==="$attrs"&&as(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ke&&at(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,at(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return gr(a,t)?(a[t]=s,!0):n!==Ke&&at(n,t)?(n[t]=s,!0):at(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},o){let r;return!!(s[o]||e!==Ke&&o[0]!=="$"&&at(e,o)||gr(t,o)||at(i,o)||at(n,o)||at(ji,o)||at(a.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:at(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Pb=Ge({},Gr,{get(e,t){if(t!==Symbol.unscopables)return Gr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!jv(t)}});function Fb(){return null}function $b(){return null}function Ub(e){}function Bb(e){}function Hb(){return null}function zb(){}function jb(e,t){return null}function Vb(){return Vf().slots}function qb(){return Vf().attrs}function Vf(e){const t=fs();return t.setupContext||(t.setupContext=kh(t))}function sl(e){return Ee(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Gb(e,t){const s=sl(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ee(a)||Me(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Kb(e,t){return!e||!t?e||t:Ee(e)&&Ee(t)?e.concat(t):Ge({},sl(e),sl(t))}function Wb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Jb(e){const t=fs(),s=Sa;let n=e();ll(),s&&ai(!1);const a=()=>{_i(t),s&&ai(!0)},i=()=>{fs()!==t&&t.scope.off(),ll(),s&&ai(!1)};return Ec(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Kr=!0;function Zb(e){const t=Vc(e),s=e.proxy,n=e.ctx;Kr=!1,t.beforeCreate&&Yd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:m,activated:v,deactivated:T,beforeDestroy:L,beforeUnmount:y,destroyed:g,unmounted:b,render:A,renderTracked:_,renderTriggered:I,errorCaptured:E,serverPrefetch:x,expose:N,inheritAttrs:$,components:k,directives:M,filters:H}=t;if(c&&Yb(c,n,null),l)for(const S in l){const O=l[S];Me(O)&&(n[S]=O.bind(s))}if(a){const S=a.call(s,s);st(S)&&(e.data=aa(S))}if(Kr=!0,i)for(const S in i){const O=i[S],U=Me(O)?O.bind(s,s):Me(O.get)?O.get.bind(s,s):Xt,Z=!Me(O)&&Me(O.set)?O.set.bind(s):Xt,W=G({get:U,set:Z});Object.defineProperty(n,S,{enumerable:!0,configurable:!0,get:()=>W.value,set:te=>W.value=te})}if(o)for(const S in o)qf(o[S],n,s,S);if(r){const S=Me(r)?r.call(s):r;Reflect.ownKeys(S).forEach(O=>{zi(O,S[O])})}d&&Yd(d,e,"c");function C(S,O){Ee(O)?O.forEach(U=>S(U.bind(s))):O&&S(O.bind(s))}if(C($f,u),C(je,p),C(Bc,f),C(Ko,m),C(es,v),C(Wt,T),C(zf,E),C(Hf,_),C(Bf,I),C(Wo,y),C(ft,b),C(Uf,x),Ee(N))if(N.length){const S=e.exposed||(e.exposed={});N.forEach(O=>{Object.defineProperty(S,O,{get:()=>s[O],set:U=>s[O]=U,enumerable:!0})})}else e.exposed||(e.exposed={});A&&e.render===Xt&&(e.render=A),$!=null&&(e.inheritAttrs=$),k&&(e.components=k),M&&(e.directives=M),x&&Uc(e)}function Yb(e,t,s=Xt){Ee(e)&&(e=Wr(e));for(const n in e){const a=e[n];let i;st(a)?"default"in a?i=zs(a.from||n,a.default,!0):i=zs(a.from||n):i=zs(a),Pt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Yd(e,t,s){Rs(Ee(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function qf(e,t,s,n){let a=n.includes(".")?If(s,n):()=>s[n];if(Ue(e)){const i=t[e];Me(i)&&Ft(a,i)}else if(Me(e))Ft(a,e.bind(s));else if(st(e))if(Ee(e))e.forEach(i=>qf(i,t,s,n));else{const i=Me(e.handler)?e.handler.bind(s):t[e.handler];Me(i)&&Ft(a,i,e)}}function Vc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!a.length&&!s&&!n?r=t:(r={},a.length&&a.forEach(c=>ro(r,c,l,!0)),ro(r,t,l)),st(t)&&i.set(t,r),r}function ro(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&ro(e,i,s,!0),a&&a.forEach(l=>ro(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const o=Qb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Qb={data:Qd,props:Xd,emits:Xd,methods:Fi,computed:Fi,beforeCreate:rs,created:rs,beforeMount:rs,mounted:rs,beforeUpdate:rs,updated:rs,beforeDestroy:rs,beforeUnmount:rs,destroyed:rs,unmounted:rs,activated:rs,deactivated:rs,errorCaptured:rs,serverPrefetch:rs,components:Fi,directives:Fi,watch:ey,provide:Qd,inject:Xb};function Qd(e,t){return t?e?function(){return Ge(Me(e)?e.call(this,this):e,Me(t)?t.call(this,this):t)}:t:e}function Xb(e,t){return Fi(Wr(e),Wr(t))}function Wr(e){if(Ee(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function rs(e,t){return e?[...new Set([].concat(e,t))]:t}function Fi(e,t){return e?Ge(Object.create(null),e,t):t}function Xd(e,t){return e?Ee(e)&&Ee(t)?[...new Set([...e,...t])]:Ge(Object.create(null),sl(e),sl(t??{})):t}function ey(e,t){if(!e)return t;if(!t)return e;const s=Ge(Object.create(null),e);for(const n in t)s[n]=rs(e[n],t[n]);return s}function Gf(){return{app:null,config:{isNativeTag:Wa,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let ty=0;function sy(e,t){return function(n,a=null){Me(n)||(n=Ge({},n)),a!=null&&!st(a)&&(a=null);const i=Gf(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:ty++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Th,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Me(d.install)?(l.add(d),d.install(c,...u)):Me(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const f=c._ceVNode||yt(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),r=!0,c._container=d,d.__vue_app__=c,kl(f.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Rs(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=ya;ya=c;try{return d()}finally{ya=u}}};return c}}let ya=null;function ny(e,t,s=Ke){const n=fs(),a=pt(t),i=ws(t),l=Kf(e,a),o=yf((r,c)=>{let d,u=Ke,p;return Rf(()=>{const f=e[a];qt(d,f)&&(d=f,c())}),{get(){return r(),s.get?s.get(d):d},set(f){const m=s.set?s.set(f):f;if(!qt(m,d)&&!(u!==Ke&&qt(f,u)))return;const v=n.vnode.props,T=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));T||(d=f,c()),n.emit(`update:${t}`,m),qt(f,u)&&(qt(f,m)&&!qt(m,p)||T&&u!==Ke&&!qt(m,d))&&c(),u=f,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ke:o,done:!1}:{done:!0}}}},o}const Kf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${pt(t)}Modifiers`]||e[`${ws(t)}Modifiers`];function ay(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ke;let a=s;const i=t.startsWith("update:"),l=i&&Kf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Ue(d)?d.trim():d)),l.number&&(a=s.map(Fo)));let o,r=n[o=Xa(t)]||n[o=Xa(pt(t))];!r&&i&&(r=n[o=Xa(ws(t))]),r&&Rs(r,e,6,a);const c=n[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Rs(c,e,6,a)}}const iy=new WeakMap;function Wf(e,t,s=!1){const n=s?iy:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},o=!1;if(!Me(e)){const r=c=>{const d=Wf(c,t,!0);d&&(o=!0,Ge(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(st(e)&&n.set(e,null),null):(Ee(i)?i.forEach(r=>l[r]=null):Ge(l,i),st(e)&&n.set(e,l),l)}function Jo(e,t){return!e||!Ea(t)?!1:(t=t.slice(2).replace(/Once$/,""),at(e,t[0].toLowerCase()+t.slice(1))||at(e,ws(t))||at(e,t))}function Wl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:m,inheritAttrs:v}=e,T=tl(e);let L,y;try{if(s.shapeFlag&4){const b=a||n,A=b;L=_s(c.call(A,b,d,u,f,p,m)),y=o}else{const b=t;L=_s(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:oy(o)}}catch(b){Vi.length=0,Ia(b,e,1),L=yt(Ot)}let g=L;if(y&&v!==!1){const b=Object.keys(y),{shapeFlag:A}=g;b.length&&A&7&&(i&&b.some(No)&&(y=ry(y,i)),g=pn(g,y,!1,!0))}return s.dirs&&(g=pn(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&Fn(g,s.transition),L=g,tl(T),L}function ly(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if($n(a)){if(a.type!==Ot||a.children==="v-if"){if(s)return;s=a}}else return}return s}const oy=e=>{let t;for(const s in e)(s==="class"||s==="style"||Ea(s))&&((t||(t={}))[s]=e[s]);return t},ry=(e,t)=>{const s={};for(const n in e)(!No(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function cy(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return n?eu(n,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Jf(l,n,p)&&!Jo(c,p))return!0}}}else return(a||o)&&(!o||!o.$stable)?!0:n===l?!1:n?l?eu(n,l,c):!0:!!l;return!1}function eu(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Jf(t,e,i)&&!Jo(s,i))return!0}return!1}function Jf(e,t,s){const n=e[s],a=t[s];return s==="style"&&st(n)&&st(a)?!Dn(n,a):n!==a}function Zo({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Zf={},Yf=()=>Object.create(Zf),Qf=e=>Object.getPrototypeOf(e)===Zf;function dy(e,t,s,n=!1){const a={},i=Yf();e.propsDefaults=Object.create(null),Xf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Lc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function uy(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,o=Qe(a),[r]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Jo(e.emitsOptions,p))continue;const f=t[p];if(r)if(at(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const m=pt(p);a[m]=Jr(r,o,m,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{Xf(e,t,a,i)&&(c=!0);let d;for(const u in o)(!t||!at(t,u)&&((d=ws(u))===u||!at(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Jr(r,o,u,void 0,e,!0)):delete a[u]);if(i!==o)for(const u in i)(!t||!at(t,u))&&(delete i[u],c=!0)}c&&Tn(e.attrs,"set","")}function Xf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(In(r))continue;const c=t[r];let d;a&&at(a,d=pt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Jo(e.emitsOptions,r)||(!(r in n)||c!==n[r])&&(n[r]=c,l=!0)}if(i){const r=Qe(s),c=o||Ke;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Jr(a,r,u,c[u],e,!at(c,u))}}return l}function Jr(e,t,s,n,a,i){const l=e[s];if(l!=null){const o=at(l,"default");if(o&&n===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Me(r)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=_i(a);n=c[s]=r.call(null,t),d()}}else n=r;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!o?n=!1:l[1]&&(n===""||n===ws(s))&&(n=!0))}return n}const py=new WeakMap;function eh(e,t,s=!1){const n=s?py:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},o=[];let r=!1;if(!Me(e)){const d=u=>{r=!0;const[p,f]=eh(u,t,!0);Ge(l,p),f&&o.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return st(e)&&n.set(e,Ya),Ya;if(Ee(i))for(let d=0;d<i.length;d++){const u=pt(i[d]);tu(u)&&(l[u]=Ke)}else if(i)for(const d in i){const u=pt(d);if(tu(u)){const p=i[d],f=l[u]=Ee(p)||Me(p)?{type:p}:Ge({},p),m=f.type;let v=!1,T=!0;if(Ee(m))for(let L=0;L<m.length;++L){const y=m[L],g=Me(y)&&y.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(T=!1)}else v=Me(m)&&m.name==="Boolean";f[0]=v,f[1]=T,(v||at(f,"default"))&&o.push(u)}}const c=[l,o];return st(e)&&n.set(e,c),c}function tu(e){return e[0]!=="$"&&!In(e)}const qc=e=>e==="_"||e==="_ctx"||e==="$stable",Gc=e=>Ee(e)?e.map(_s):[_s(e)],fy=(e,t,s)=>{if(t._n)return t;const n=Pc((...a)=>Gc(t(...a)),s);return n._c=!1,n},th=(e,t,s)=>{const n=e._ctx;for(const a in e){if(qc(a))continue;const i=e[a];if(Me(i))t[a]=fy(a,i,n);else if(i!=null){const l=Gc(i);t[a]=()=>l}}},sh=(e,t)=>{const s=Gc(t);e.slots.default=()=>s},nh=(e,t,s)=>{for(const n in t)(s||!qc(n))&&(e[n]=t[n])},hy=(e,t,s)=>{const n=e.slots=Yf();if(e.vnode.shapeFlag&32){const a=t._;a?(nh(n,t,s),s&&Wp(n,"_",a,!0)):th(t,n)}else t&&sh(e,t)},my=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ke;if(n.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:nh(a,t,s):(i=!t.$stable,th(t,a)),l=t}else t&&(sh(e,t),l={default:1});if(i)for(const o in a)!qc(o)&&l[o]==null&&delete a[o]},Dt=uh;function ah(e){return lh(e)}function ih(e){return lh(e,hb)}function lh(e,t){const s=$o();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=Xt,insertStaticContent:m}=e,v=(w,P,j,ce=null,ae=null,ie=null,me=void 0,z=null,X=!!P.dynamicChildren)=>{if(w===P)return;w&&!Ws(w,P)&&(ce=se(w),te(w,ae,ie,!0),w=null),P.patchFlag===-2&&(X=!1,P.dynamicChildren=null);const{type:Y,ref:fe,shapeFlag:pe}=P;switch(Y){case ta:T(w,P,j,ce);break;case Ot:L(w,P,j,ce);break;case xa:w==null&&y(P,j,ce,me);break;case Gt:k(w,P,j,ce,ae,ie,me,z,X);break;default:pe&1?A(w,P,j,ce,ae,ie,me,z,X):pe&6?M(w,P,j,ce,ae,ie,me,z,X):(pe&64||pe&128)&&Y.process(w,P,j,ce,ae,ie,me,z,X,de)}fe!=null&&ae?si(fe,w&&w.ref,ie,P||w,!P):fe==null&&w&&w.ref!=null&&si(w.ref,null,ie,w,!0)},T=(w,P,j,ce)=>{if(w==null)n(P.el=o(P.children),j,ce);else{const ae=P.el=w.el;P.children!==w.children&&c(ae,P.children)}},L=(w,P,j,ce)=>{w==null?n(P.el=r(P.children||""),j,ce):P.el=w.el},y=(w,P,j,ce)=>{[w.el,w.anchor]=m(w.children,P,j,ce,w.el,w.anchor)},g=({el:w,anchor:P},j,ce)=>{let ae;for(;w&&w!==P;)ae=p(w),n(w,j,ce),w=ae;n(P,j,ce)},b=({el:w,anchor:P})=>{let j;for(;w&&w!==P;)j=p(w),a(w),w=j;a(P)},A=(w,P,j,ce,ae,ie,me,z,X)=>{if(P.type==="svg"?me="svg":P.type==="math"&&(me="mathml"),w==null)_(P,j,ce,ae,ie,me,z,X);else{const Y=w.el&&w.el._isVueCE?w.el:null;try{Y&&Y._beginPatch(),x(w,P,ae,ie,me,z,X)}finally{Y&&Y._endPatch()}}},_=(w,P,j,ce,ae,ie,me,z)=>{let X,Y;const{props:fe,shapeFlag:pe,transition:be,dirs:Ae}=w;if(X=w.el=l(w.type,ie,fe&&fe.is,fe),pe&8?d(X,w.children):pe&16&&E(w.children,X,null,ce,ae,br(w,ie),me,z),Ae&&rn(w,null,ce,"created"),I(X,w,w.scopeId,me,ce),fe){for(const ye in fe)ye!=="value"&&!In(ye)&&i(X,ye,null,fe[ye],ie,ce);"value"in fe&&i(X,"value",null,fe.value,ie),(Y=fe.onVnodeBeforeMount)&&ys(Y,ce,w)}Ae&&rn(w,null,ce,"beforeMount");const F=oh(ae,be);F&&be.beforeEnter(X),n(X,P,j),((Y=fe&&fe.onVnodeMounted)||F||Ae)&&Dt(()=>{try{Y&&ys(Y,ce,w),F&&be.enter(X),Ae&&rn(w,null,ce,"mounted")}finally{}},ae)},I=(w,P,j,ce,ae)=>{if(j&&f(w,j),ce)for(let ie=0;ie<ce.length;ie++)f(w,ce[ie]);if(ae){let ie=ae.subTree;if(P===ie||uo(ie.type)&&(ie.ssContent===P||ie.ssFallback===P)){const me=ae.vnode;I(w,me,me.scopeId,me.slotScopeIds,ae.parent)}}},E=(w,P,j,ce,ae,ie,me,z,X=0)=>{for(let Y=X;Y<w.length;Y++){const fe=w[Y]=z?kn(w[Y]):_s(w[Y]);v(null,fe,P,j,ce,ae,ie,me,z)}},x=(w,P,j,ce,ae,ie,me)=>{const z=P.el=w.el;let{patchFlag:X,dynamicChildren:Y,dirs:fe}=P;X|=w.patchFlag&16;const pe=w.props||Ke,be=P.props||Ke;let Ae;if(j&&ca(j,!1),(Ae=be.onVnodeBeforeUpdate)&&ys(Ae,j,P,w),fe&&rn(P,w,j,"beforeUpdate"),j&&ca(j,!0),(pe.innerHTML&&be.innerHTML==null||pe.textContent&&be.textContent==null)&&d(z,""),Y?N(w.dynamicChildren,Y,z,j,ce,br(P,ae),ie):me||O(w,P,z,null,j,ce,br(P,ae),ie,!1),X>0){if(X&16)$(z,pe,be,j,ae);else if(X&2&&pe.class!==be.class&&i(z,"class",null,be.class,ae),X&4&&i(z,"style",pe.style,be.style,ae),X&8){const F=P.dynamicProps;for(let ye=0;ye<F.length;ye++){const Se=F[ye],Le=pe[Se],Pe=be[Se];(Pe!==Le||Se==="value")&&i(z,Se,Le,Pe,ae,j)}}X&1&&w.children!==P.children&&d(z,P.children)}else!me&&Y==null&&$(z,pe,be,j,ae);((Ae=be.onVnodeUpdated)||fe)&&Dt(()=>{Ae&&ys(Ae,j,P,w),fe&&rn(P,w,j,"updated")},ce)},N=(w,P,j,ce,ae,ie,me)=>{for(let z=0;z<P.length;z++){const X=w[z],Y=P[z],fe=X.el&&(X.type===Gt||!Ws(X,Y)||X.shapeFlag&198)?u(X.el):j;v(X,Y,fe,null,ce,ae,ie,me,!0)}},$=(w,P,j,ce,ae)=>{if(P!==j){if(P!==Ke)for(const ie in P)!In(ie)&&!(ie in j)&&i(w,ie,P[ie],null,ae,ce);for(const ie in j){if(In(ie))continue;const me=j[ie],z=P[ie];me!==z&&ie!=="value"&&i(w,ie,z,me,ae,ce)}"value"in j&&i(w,"value",P.value,j.value,ae)}},k=(w,P,j,ce,ae,ie,me,z,X)=>{const Y=P.el=w?w.el:o(""),fe=P.anchor=w?w.anchor:o("");let{patchFlag:pe,dynamicChildren:be,slotScopeIds:Ae}=P;Ae&&(z=z?z.concat(Ae):Ae),w==null?(n(Y,j,ce),n(fe,j,ce),E(P.children||[],j,fe,ae,ie,me,z,X)):pe>0&&pe&64&&be&&w.dynamicChildren&&w.dynamicChildren.length===be.length?(N(w.dynamicChildren,be,j,ae,ie,me,z),(P.key!=null||ae&&P===ae.subTree)&&Kc(w,P,!0)):O(w,P,j,fe,ae,ie,me,z,X)},M=(w,P,j,ce,ae,ie,me,z,X)=>{P.slotScopeIds=z,w==null?P.shapeFlag&512?ae.ctx.activate(P,j,ce,me,X):H(P,j,ce,ae,ie,me,X):K(w,P,X)},H=(w,P,j,ce,ae,ie,me)=>{const z=w.component=bh(w,ce,ae);if(wl(w)&&(z.ctx.renderer=de),xh(z,!1,me),z.asyncDep){if(ae&&ae.registerDep(z,C,me),!w.el){const X=z.subTree=yt(Ot);L(null,X,P,j),w.placeholder=X.el}}else C(z,w,P,j,ae,ie,me)},K=(w,P,j)=>{const ce=P.component=w.component;if(cy(w,P,j))if(ce.asyncDep&&!ce.asyncResolved){S(ce,P,j);return}else ce.next=P,ce.update();else P.el=w.el,ce.vnode=P},C=(w,P,j,ce,ae,ie,me)=>{const z=()=>{if(w.isMounted){let{next:pe,bu:be,u:Ae,parent:F,vnode:ye}=w;{const lt=rh(w);if(lt){pe&&(pe.el=ye.el,S(w,pe,me)),lt.asyncDep.then(()=>{Dt(()=>{w.isUnmounted||Y()},ae)});return}}let Se=pe,Le;ca(w,!1),pe?(pe.el=ye.el,S(w,pe,me)):pe=ye,be&&ei(be),(Le=pe.props&&pe.props.onVnodeBeforeUpdate)&&ys(Le,F,pe,ye),ca(w,!0);const Pe=Wl(w),ct=w.subTree;w.subTree=Pe,v(ct,Pe,u(ct.el),se(ct),w,ae,ie),pe.el=Pe.el,Se===null&&Zo(w,Pe.el),Ae&&Dt(Ae,ae),(Le=pe.props&&pe.props.onVnodeUpdated)&&Dt(()=>ys(Le,F,pe,ye),ae)}else{let pe;const{el:be,props:Ae}=P,{bm:F,m:ye,parent:Se,root:Le,type:Pe}=w,ct=Ln(P);if(ca(w,!1),F&&ei(F),!ct&&(pe=Ae&&Ae.onVnodeBeforeMount)&&ys(pe,Se,P),ca(w,!0),be&&Oe){const lt=()=>{w.subTree=Wl(w),Oe(be,w.subTree,w,ae,null)};ct&&Pe.__asyncHydrate?Pe.__asyncHydrate(be,w,lt):lt()}else{Le.ce&&Le.ce._hasShadowRoot()&&Le.ce._injectChildStyle(Pe,w.parent?w.parent.type:void 0);const lt=w.subTree=Wl(w);v(null,lt,j,ce,w,ae,ie),P.el=lt.el}if(ye&&Dt(ye,ae),!ct&&(pe=Ae&&Ae.onVnodeMounted)){const lt=P;Dt(()=>ys(pe,Se,lt),ae)}(P.shapeFlag&256||Se&&Ln(Se.vnode)&&Se.vnode.shapeFlag&256)&&w.a&&Dt(w.a,ae),w.isMounted=!0,P=j=ce=null}};w.scope.on();const X=w.effect=new Zi(z);w.scope.off();const Y=w.update=X.run.bind(X),fe=w.job=X.runIfDirty.bind(X);fe.i=w,fe.id=w.uid,X.scheduler=()=>Mc(fe),ca(w,!0),Y()},S=(w,P,j)=>{P.component=w;const ce=w.vnode.props;w.vnode=P,w.next=null,uy(w,P.props,ce,j),my(w,P.children,j),Mn(),zd(w),Pn()},O=(w,P,j,ce,ae,ie,me,z,X=!1)=>{const Y=w&&w.children,fe=w?w.shapeFlag:0,pe=P.children,{patchFlag:be,shapeFlag:Ae}=P;if(be>0){if(be&128){Z(Y,pe,j,ce,ae,ie,me,z,X);return}else if(be&256){U(Y,pe,j,ce,ae,ie,me,z,X);return}}Ae&8?(fe&16&&Ie(Y,ae,ie),pe!==Y&&d(j,pe)):fe&16?Ae&16?Z(Y,pe,j,ce,ae,ie,me,z,X):Ie(Y,ae,ie,!0):(fe&8&&d(j,""),Ae&16&&E(pe,j,ce,ae,ie,me,z,X))},U=(w,P,j,ce,ae,ie,me,z,X)=>{w=w||Ya,P=P||Ya;const Y=w.length,fe=P.length,pe=Math.min(Y,fe);let be;for(be=0;be<pe;be++){const Ae=P[be]=X?kn(P[be]):_s(P[be]);v(w[be],Ae,j,null,ae,ie,me,z,X)}Y>fe?Ie(w,ae,ie,!0,!1,pe):E(P,j,ce,ae,ie,me,z,X,pe)},Z=(w,P,j,ce,ae,ie,me,z,X)=>{let Y=0;const fe=P.length;let pe=w.length-1,be=fe-1;for(;Y<=pe&&Y<=be;){const Ae=w[Y],F=P[Y]=X?kn(P[Y]):_s(P[Y]);if(Ws(Ae,F))v(Ae,F,j,null,ae,ie,me,z,X);else break;Y++}for(;Y<=pe&&Y<=be;){const Ae=w[pe],F=P[be]=X?kn(P[be]):_s(P[be]);if(Ws(Ae,F))v(Ae,F,j,null,ae,ie,me,z,X);else break;pe--,be--}if(Y>pe){if(Y<=be){const Ae=be+1,F=Ae<fe?P[Ae].el:ce;for(;Y<=be;)v(null,P[Y]=X?kn(P[Y]):_s(P[Y]),j,F,ae,ie,me,z,X),Y++}}else if(Y>be)for(;Y<=pe;)te(w[Y],ae,ie,!0),Y++;else{const Ae=Y,F=Y,ye=new Map;for(Y=F;Y<=be;Y++){const nt=P[Y]=X?kn(P[Y]):_s(P[Y]);nt.key!=null&&ye.set(nt.key,Y)}let Se,Le=0;const Pe=be-F+1;let ct=!1,lt=0;const xt=new Array(Pe);for(Y=0;Y<Pe;Y++)xt[Y]=0;for(Y=Ae;Y<=pe;Y++){const nt=w[Y];if(Le>=Pe){te(nt,ae,ie,!0);continue}let et;if(nt.key!=null)et=ye.get(nt.key);else for(Se=F;Se<=be;Se++)if(xt[Se-F]===0&&Ws(nt,P[Se])){et=Se;break}et===void 0?te(nt,ae,ie,!0):(xt[et-F]=Y+1,et>=lt?lt=et:ct=!0,v(nt,P[et],j,null,ae,ie,me,z,X),Le++)}const Ut=ct?vy(xt):Ya;for(Se=Ut.length-1,Y=Pe-1;Y>=0;Y--){const nt=F+Y,et=P[nt],oe=P[nt+1],Ce=nt+1<fe?oe.el||ch(oe):ce;xt[Y]===0?v(null,et,j,Ce,ae,ie,me,z,X):ct&&(Se<0||Y!==Ut[Se]?W(et,j,Ce,2):Se--)}}},W=(w,P,j,ce,ae=null)=>{const{el:ie,type:me,transition:z,children:X,shapeFlag:Y}=w;if(Y&6){W(w.component.subTree,P,j,ce);return}if(Y&128){w.suspense.move(P,j,ce);return}if(Y&64){me.move(w,P,j,de);return}if(me===Gt){n(ie,P,j);for(let pe=0;pe<X.length;pe++)W(X[pe],P,j,ce);n(w.anchor,P,j);return}if(me===xa){g(w,P,j);return}if(ce!==2&&Y&1&&z)if(ce===0)z.persisted&&!ie[$s]?n(ie,P,j):(z.beforeEnter(ie),n(ie,P,j),Dt(()=>z.enter(ie),ae));else{const{leave:pe,delayLeave:be,afterLeave:Ae}=z,F=()=>{w.ctx.isUnmounted?a(ie):n(ie,P,j)},ye=()=>{const Se=ie._isLeaving||!!ie[$s];ie._isLeaving&&ie[$s](!0),z.persisted&&!Se?F():pe(ie,()=>{F(),Ae&&Ae()})};be?be(ie,F,ye):ye()}else n(ie,P,j)},te=(w,P,j,ce=!1,ae=!1)=>{const{type:ie,props:me,ref:z,children:X,dynamicChildren:Y,shapeFlag:fe,patchFlag:pe,dirs:be,cacheIndex:Ae,memo:F}=w;if(pe===-2&&(ae=!1),z!=null&&(Mn(),si(z,null,j,w,!0),Pn()),Ae!=null&&(P.renderCache[Ae]=void 0),fe&256){P.ctx.deactivate(w);return}const ye=fe&1&&be,Se=!Ln(w);let Le;if(Se&&(Le=me&&me.onVnodeBeforeUnmount)&&ys(Le,P,w),fe&6)ue(w.component,j,ce);else{if(fe&128){w.suspense.unmount(j,ce);return}ye&&rn(w,null,P,"beforeUnmount"),fe&64?w.type.remove(w,P,j,de,ce):Y&&!Y.hasOnce&&(ie!==Gt||pe>0&&pe&64)?Ie(Y,P,j,!1,!0):(ie===Gt&&pe&384||!ae&&fe&16)&&Ie(X,P,j),ce&&re(w)}const Pe=F!=null&&Ae==null;(Se&&(Le=me&&me.onVnodeUnmounted)||ye||Pe)&&Dt(()=>{Le&&ys(Le,P,w),ye&&rn(w,null,P,"unmounted"),Pe&&(w.el=null)},j)},re=w=>{const{type:P,el:j,anchor:ce,transition:ae}=w;if(P===Gt){Q(j,ce);return}if(P===xa){b(w);return}const ie=()=>{a(j),ae&&!ae.persisted&&ae.afterLeave&&ae.afterLeave()};if(w.shapeFlag&1&&ae&&!ae.persisted){const{leave:me,delayLeave:z}=ae,X=()=>me(j,ie);z?z(w.el,ie,X):X()}else ie()},Q=(w,P)=>{let j;for(;w!==P;)j=p(w),a(w),w=j;a(P)},ue=(w,P,j)=>{const{bum:ce,scope:ae,job:ie,subTree:me,um:z,m:X,a:Y}=w;co(X),co(Y),ce&&ei(ce),ae.stop(),ie&&(ie.flags|=8,te(me,w,P,j)),z&&Dt(z,P),Dt(()=>{w.isUnmounted=!0},P)},Ie=(w,P,j,ce=!1,ae=!1,ie=0)=>{for(let me=ie;me<w.length;me++)te(w[me],P,j,ce,ae)},se=w=>{if(w.shapeFlag&6)return se(w.component.subTree);if(w.shapeFlag&128)return w.suspense.next();const P=p(w.anchor||w.el),j=P&&P[Of];return j?p(j):P};let ge=!1;const q=(w,P,j)=>{let ce;w==null?P._vnode&&(te(P._vnode,null,null,!0),ce=P._vnode.component):v(P._vnode||null,w,P,null,null,null,j),P._vnode=w,ge||(ge=!0,zd(ce),lo(),ge=!1)},de={p:v,um:te,m:W,r:re,mt:H,mc:E,pc:O,pbc:N,n:se,o:e};let he,Oe;return t&&([he,Oe]=t(de)),{render:q,hydrate:he,createApp:sy(q,he)}}function br({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function ca({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function oh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Kc(e,t,s=!1){const n=e.children,a=t.children;if(Ee(n)&&Ee(a))for(let i=0;i<n.length;i++){const l=n[i];let o=a[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=a[i]=kn(a[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Kc(l,o)),o.type===ta&&(o.patchFlag===-1&&(o=a[i]=kn(o)),o.el=l.el),o.type===Ot&&!o.el&&(o.el=l.el)}}function vy(e){const t=e.slice(),s=[0];let n,a,i,l,o;const r=e.length;for(n=0;n<r;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function rh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:rh(t)}function co(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function ch(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?ch(t.subTree):null}const uo=e=>e.__isSuspense;let Zr=0;const gy={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,o,r,c){if(e==null)yy(t,s,n,a,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}xy(e,t,s,n,a,l,o,r,c)}},hydrate:_y,normalize:wy},by=gy;function nl(e,t){const s=e.props&&e.props[t];Me(s)&&s()}function yy(e,t,s,n,a,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=dh(e,a,n,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(nl(e,"onPending"),nl(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),ni(p,e.ssFallback)):p.resolve(!1,!0)}function xy(e,t,s,n,a,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:T,isHydrating:L}=u;if(v)u.pendingBranch=p,Ws(v,p)?(r(v,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():T&&(L||(r(m,f,s,n,a,null,i,l,o),ni(u,f)))):(u.pendingId=Zr++,L?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),T?(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():(r(m,f,s,n,a,null,i,l,o),ni(u,f))):m&&Ws(m,p)?(r(m,p,s,n,a,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Ws(m,p))r(m,p,s,n,a,u,i,l,o),ni(u,p);else if(nl(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Zr++,r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(f)},y):y===0&&u.fallback(f)}}function dh(e,t,s,n,a,i,l,o,r,c,d=!1){const{p:u,m:p,um:f,n:m,o:{parentNode:v,remove:T}}=c;let L;const y=ky(e);y&&t&&t.pendingBranch&&(L=t.pendingId,t.deps++);const g=e.props?to(e.props.timeout):void 0,b=i,A={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Zr++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,I=!1){const{vnode:E,activeBranch:x,pendingBranch:N,pendingId:$,effects:k,parentComponent:M,container:H,isInFallback:K}=A;let C=!1;if(A.isHydrating)A.isHydrating=!1;else if(!_){C=x&&N.transition&&N.transition.mode==="out-in";let U=!1;C&&(x.transition.afterLeave=()=>{$===A.pendingId&&(p(N,H,i===b&&!U?m(x):i,0),Xi(k),K&&E.ssFallback&&(E.ssFallback.el=null))}),x&&!A.isFallbackMountPending&&(v(x.el)===H&&(i=m(x),U=!0),f(x,M,A,!0),!C&&K&&E.ssFallback&&Dt(()=>E.ssFallback.el=null,A)),C||p(N,H,i,0)}A.isFallbackMountPending=!1,ni(A,N),A.pendingBranch=null,A.isInFallback=!1;let S=A.parent,O=!1;for(;S;){if(S.pendingBranch){S.effects.push(...k),O=!0;break}S=S.parent}!O&&!C&&Xi(k),A.effects=[],y&&t&&t.pendingBranch&&L===t.pendingId&&(t.deps--,t.deps===0&&!I&&t.resolve()),nl(E,"onResolve")},fallback(_){if(!A.pendingBranch)return;const{vnode:I,activeBranch:E,parentComponent:x,container:N,namespace:$}=A;nl(I,"onFallback");const k=m(E),M=()=>{A.isFallbackMountPending=!1,A.isInFallback&&(u(null,_,N,k,x,null,$,o,r),ni(A,_))},H=_.transition&&_.transition.mode==="out-in";H&&(A.isFallbackMountPending=!0,E.transition.afterLeave=M),A.isInFallback=!0,f(E,x,null,!0),H||M()},move(_,I,E){A.activeBranch&&p(A.activeBranch,_,I,E),A.container=_},next(){return A.activeBranch&&m(A.activeBranch)},registerDep(_,I,E){const x=!!A.pendingBranch;x&&A.deps++;const N=_.vnode.el;_.asyncDep.catch($=>{Ia($,_,0)}).then($=>{if(_.isUnmounted||A.isUnmounted||A.pendingId!==_.suspenseId)return;ll(),_.asyncResolved=!0;const{vnode:k}=_;Yr(_,$,!1),N&&(k.el=N);const M=!N&&_.subTree.el;I(_,k,v(N||_.subTree.el),N?null:m(_.subTree),A,l,E),M&&(k.placeholder=null,T(M)),Zo(_,k.el),x&&--A.deps===0&&A.resolve()})},unmount(_,I){A.isUnmounted=!0,A.activeBranch&&f(A.activeBranch,s,_,I),A.pendingBranch&&f(A.pendingBranch,s,_,I)}};return A}function _y(e,t,s,n,a,i,l,o,r){const c=t.suspense=dh(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function wy(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=su(n?s.default:s),e.ssFallback=n?su(s.fallback):yt(Ot)}function su(e){let t;if(Me(e)){const s=ka&&e._c;s&&(e._d=!1,al()),e=e(),s&&(e._d=!0,t=is,ph())}return Ee(e)&&(e=ly(e)),e=_s(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function uh(e,t){t&&t.pendingBranch?Ee(e)?t.effects.push(...e):t.effects.push(e):Xi(e)}function ni(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Zo(n,a))}function ky(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Gt=Symbol.for("v-fgt"),ta=Symbol.for("v-txt"),Ot=Symbol.for("v-cmt"),xa=Symbol.for("v-stc"),Vi=[];let is=null;function al(e=!1){Vi.push(is=e?null:[])}function ph(){Vi.pop(),is=Vi[Vi.length-1]||null}let ka=1;function il(e,t=!1){ka+=e,e<0&&is&&t&&(is.hasOnce=!0)}function fh(e){return e.dynamicChildren=ka>0?is||Ya:null,ph(),ka>0&&is&&is.push(e),e}function Sy(e,t,s,n,a,i){return fh(Wc(e,t,s,n,a,i,!0))}function po(e,t,s,n,a){return fh(yt(e,t,s,n,a,!0))}function $n(e){return e?e.__v_isVNode===!0:!1}function Ws(e,t){return e.type===t.type&&e.key===t.key}function Ty(e){}const hh=({key:e})=>e??null,Jl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ue(e)||Pt(e)||Me(e)?{i:Qt,r:e,k:t,f:!!s}:e:null);function Wc(e,t=null,s=null,n=0,a=null,i=e===Gt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&hh(t),ref:t&&Jl(t),scopeId:Vo,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Qt};return o?(Zc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Ue(s)?8:16),ka>0&&!l&&is&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&is.push(r),r}const yt=Cy;function Cy(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===jf)&&(e=Ot),$n(e)){const o=pn(e,t,!0);return s&&Zc(o,s),ka>0&&!i&&is&&(o.shapeFlag&6?is[is.indexOf(e)]=o:is.push(o)),o.patchFlag=-2,o}if(Ny(e)&&(e=e.__vccOpts),t){t=mh(t);let{class:o,style:r}=t;o&&!Ue(o)&&(t.class=bl(o)),st(r)&&(yl(r)&&!Ee(r)&&(r=Ge({},r)),t.style=gl(r))}const l=Ue(e)?1:uo(e)?128:Lf(e)?64:st(e)?4:Me(e)?2:0;return Wc(e,t,s,n,a,l,i,!0)}function mh(e){return e?yl(e)||Qf(e)?Ge({},e):e:null}function pn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?gh(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&hh(c),ref:t&&t.ref?s&&i?Ee(i)?i.concat(Jl(t)):[i,Jl(t)]:Jl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Gt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&pn(e.ssContent),ssFallback:e.ssFallback&&pn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&n&&Fn(d,r.clone(d)),d}function Jc(e=" ",t=0){return yt(ta,null,e,t)}function Ey(e,t){const s=yt(xa,null,e);return s.staticCount=t,s}function vh(e="",t=!1){return t?(al(),po(Ot,null,e)):yt(Ot,null,e)}function _s(e){return e==null||typeof e=="boolean"?yt(Ot):Ee(e)?yt(Gt,null,e.slice()):$n(e)?kn(e):yt(ta,null,String(e))}function kn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:pn(e)}function Zc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ee(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Zc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Qf(t)?t._ctx=Qt:a===3&&Qt&&(Qt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Me(t)?(t={default:t,_ctx:Qt},s=32):(t=String(t),n&64?(s=16,t=[Jc(t)]):s=8);e.children=t,e.shapeFlag|=s}function gh(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=bl([t.class,n.class]));else if(a==="style")t.style=gl([t.style,n.style]);else if(Ea(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ee(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!No(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function ys(e,t,s,n=null){Rs(e,t,7,[s,n])}const Ay=Gf();let Ry=0;function bh(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Ay,i={uid:Ry++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Ac(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:eh(n,a),emitsOptions:Wf(n,a),emit:null,emitted:null,propsDefaults:Ke,inheritAttrs:n.inheritAttrs,ctx:Ke,data:Ke,props:Ke,attrs:Ke,slots:Ke,refs:Ke,setupState:Ke,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ay.bind(null,i),e.ce&&e.ce(i),i}let Yt=null;const fs=()=>Yt||Qt;let fo,ai;{const e=$o(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};fo=t("__VUE_INSTANCE_SETTERS__",s=>Yt=s),ai=t("__VUE_SSR_SETTERS__",s=>Sa=s)}const _i=e=>{const t=Yt;return fo(e),e.scope.on(),()=>{e.scope.off(),fo(t)}},ll=()=>{Yt&&Yt.scope.off(),fo(null)};function yh(e){return e.vnode.shapeFlag&4}let Sa=!1;function xh(e,t=!1,s=!1){t&&ai(t);const{props:n,children:a}=e.vnode,i=yh(e);dy(e,n,i,t),hy(e,a,s||t);const l=i?Iy(e,t):void 0;return t&&ai(!1),l}function Iy(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Gr);const{setup:n}=s;if(n){Mn();const a=e.setupContext=n.length>1?kh(e):null,i=_i(e),l=xi(n,e,0,[e.props,a]),o=Ec(l);if(Pn(),i(),(o||e.sp)&&!Ln(e)&&Uc(e),o){if(l.then(ll,ll),t)return l.then(r=>{Yr(e,r,t)}).catch(r=>{Ia(r,e,0)});e.asyncDep=l}else Yr(e,l,t)}else wh(e,t)}function Yr(e,t,s){Me(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:st(t)&&(e.setupState=Dc(t)),wh(e,s)}let ho,Qr;function _h(e){ho=e,Qr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Pb))}}const Oy=()=>!ho;function wh(e,t,s){const n=e.type;if(!e.render){if(!t&&ho&&!n.render){const a=n.template||Vc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=n,c=Ge(Ge({isCustomElement:i,delimiters:o},l),r);n.render=ho(a,c)}}e.render=n.render||Xt,Qr&&Qr(e)}{const a=_i(e);Mn();try{Zb(e)}finally{Pn(),a()}}}const Ly={get(e,t){return as(e,"get",""),e[t]}};function kh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Ly),slots:e.slots,emit:e.emit,expose:t}}function kl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Dc(gf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ji)return ji[s](e)},has(t,s){return s in t||s in ji}})):e.proxy}function Xr(e,t=!0){return Me(e)?e.displayName||e.name:e.name||t&&e.__name}function Ny(e){return Me(e)&&"__vccOpts"in e}const G=(e,t)=>Ug(e,t,Sa);function ci(e,t,s){try{il(-1);const n=arguments.length;return n===2?st(t)&&!Ee(t)?$n(t)?yt(e,null,[t]):yt(e,t):yt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&$n(s)&&(s=[s]),yt(e,t,s))}finally{il(1)}}function Dy(){}function My(e,t,s,n){const a=s[n];if(a&&Sh(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Sh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(qt(s[n],t[n]))return!1;return ka>0&&is&&is.push(e),!0}const Th="3.5.38",Py=Xt,Fy=Wg,$y=qa,Uy=Cf,By={createComponentInstance:bh,setupComponent:xh,renderComponentRoot:Wl,setCurrentRenderingInstance:tl,isVNode:$n,normalizeVNode:_s,getComponentPublicInstance:kl,ensureValidVNode:jc,pushWarningContext:Vg,popWarningContext:qg},Hy=By,zy=null,jy=null,Vy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let ec;const nu=typeof window<"u"&&window.trustedTypes;if(nu)try{ec=nu.createPolicy("vue",{createHTML:e=>e})}catch{}const Ch=ec?e=>ec.createHTML(e):e=>e,qy="http://www.w3.org/2000/svg",Gy="http://www.w3.org/1998/Math/MathML",wn=typeof document<"u"?document:null,au=wn&&wn.createElement("template"),Eh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?wn.createElementNS(qy,e):t==="mathml"?wn.createElementNS(Gy,e):s?wn.createElement(e,{is:s}):wn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>wn.createTextNode(e),createComment:e=>wn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>wn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{au.innerHTML=Ch(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const o=au.content;if(n==="svg"||n==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},qn="transition",Ci="animation",di=Symbol("_vtc"),Ah={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Rh=Ge({},$c,Ah),Ky=e=>(e.displayName="Transition",e.props=Rh,e),Wy=Ky((e,{slots:t})=>ci(Mf,Ih(e),t)),da=(e,t=[])=>{Ee(e)?e.forEach(s=>s(...t)):e&&e(...t)},iu=e=>e?Ee(e)?e.some(t=>t.length>1):e.length>1:!1;function Ih(e){const t={};for(const k in e)k in Ah||(t[k]=e[k]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,m=Jy(a),v=m&&m[0],T=m&&m[1],{onBeforeEnter:L,onEnter:y,onEnterCancelled:g,onLeave:b,onLeaveCancelled:A,onBeforeAppear:_=L,onAppear:I=y,onAppearCancelled:E=g}=t,x=(k,M,H,K)=>{k._enterCancelled=K,Jn(k,M?d:o),Jn(k,M?c:l),H&&H()},N=(k,M)=>{k._isLeaving=!1,Jn(k,u),Jn(k,f),Jn(k,p),M&&M()},$=k=>(M,H)=>{const K=k?I:y,C=()=>x(M,k,H);da(K,[M,C]),lu(()=>{Jn(M,k?r:i),nn(M,k?d:o),iu(K)||ou(M,n,v,C)})};return Ge(t,{onBeforeEnter(k){da(L,[k]),nn(k,i),nn(k,l)},onBeforeAppear(k){da(_,[k]),nn(k,r),nn(k,c)},onEnter:$(!1),onAppear:$(!0),onLeave(k,M){k._isLeaving=!0;const H=()=>N(k,M);nn(k,u),k._enterCancelled?(nn(k,p),tc(k)):(tc(k),nn(k,p)),lu(()=>{k._isLeaving&&(Jn(k,u),nn(k,f),iu(b)||ou(k,n,T,H))}),da(b,[k,H])},onEnterCancelled(k){x(k,!1,void 0,!0),da(g,[k])},onAppearCancelled(k){x(k,!0,void 0,!0),da(E,[k])},onLeaveCancelled(k){N(k),da(A,[k])}})}function Jy(e){if(e==null)return null;if(st(e))return[yr(e.enter),yr(e.leave)];{const t=yr(e);return[t,t]}}function yr(e){return to(e)}function nn(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[di]||(e[di]=new Set)).add(t)}function Jn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[di];s&&(s.delete(t),s.size||(e[di]=void 0))}function lu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Zy=0;function ou(e,t,s,n){const a=e._endId=++Zy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Oh(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Oh(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${qn}Delay`),i=n(`${qn}Duration`),l=ru(a,i),o=n(`${Ci}Delay`),r=n(`${Ci}Duration`),c=ru(o,r);let d=null,u=0,p=0;t===qn?l>0&&(d=qn,u=l,p=i.length):t===Ci?c>0&&(d=Ci,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?qn:Ci:null,p=d?d===qn?i.length:r.length:0);const f=d===qn&&/\b(?:transform|all)(?:,|$)/.test(n(`${qn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function ru(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>cu(s)+cu(e[n])))}function cu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function tc(e){return(e?e.ownerDocument:document).body.offsetHeight}function Yy(e,t,s){const n=e[di];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const mo=Symbol("_vod"),Yc=Symbol("_vsh"),Lh={name:"show",beforeMount(e,{value:t},{transition:s}){e[mo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ei(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Ei(e,!0),n.enter(e)):n.leave(e,()=>{Ei(e,!1)}):Ei(e,t))},beforeUnmount(e,{value:t}){Ei(e,t)}};function Ei(e,t){e.style.display=t?e[mo]:"none",e[Yc]=!t}function Qy(){Lh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Nh=Symbol("");function Xy(e){const t=fs();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>vo(i,a))},n=()=>{const a=e(t.proxy);t.ce?vo(t.ce,a):sc(t.subTree,a),s(a)};Bc(()=>{Xi(n)}),je(()=>{Ft(n,Xt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>a.disconnect())})}function sc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{sc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)vo(e.el,t);else if(e.type===Gt)e.children.forEach(s=>sc(s,t));else if(e.type===xa){let{el:s,anchor:n}=e;for(;s&&(vo(s,t),s!==n);)s=s.nextSibling}}function vo(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=ig(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Nh]=n}}const ex=/(?:^|;)\s*display\s*:/;function tx(e,t,s){const n=e.style,a=Ue(s);let i=!1;if(s&&!a){if(t)if(Ue(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&$i(n,o,"")}else for(const l in t)s[l]==null&&$i(n,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?nx(e,l,!Ue(t)&&t?t[l]:void 0,o)||$i(n,l,o):$i(n,l,"")}}else if(a){if(t!==s){const l=n[Nh];l&&(s+=";"+l),n.cssText=s,i=ex.test(s)}}else t&&e.removeAttribute("style");mo in e&&(e[mo]=i?n.display:"",e[Yc]&&(n.display="none"))}const du=/\s*!important$/;function $i(e,t,s){if(Ee(s))s.forEach(n=>$i(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=sx(e,t);du.test(s)?e.setProperty(ws(n),s.replace(du,""),"important"):e[n]=s}}const uu=["Webkit","Moz","ms"],xr={};function sx(e,t){const s=xr[t];if(s)return s;let n=pt(t);if(n!=="filter"&&n in e)return xr[t]=n;n=Ra(n);for(let a=0;a<uu.length;a++){const i=uu[a]+n;if(i in e)return xr[t]=i}return t}function nx(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ue(n)&&s===n}const pu="http://www.w3.org/1999/xlink";function fu(e,t,s,n,a,i=ng(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(pu,t.slice(6,t.length)):e.setAttributeNS(pu,t,s):s==null||i&&!Zp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":os(s)?String(s):s)}function hu(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Ch(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=Zp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function En(e,t,s,n){e.addEventListener(t,s,n)}function ax(e,t,s,n){e.removeEventListener(t,s,n)}const mu=Symbol("_vei");function ix(e,t,s,n,a=null){const i=e[mu]||(e[mu]={}),l=i[t];if(n&&l)l.value=n;else{const[o,r]=lx(t);if(n){const c=i[t]=cx(n,a);En(e,o,c,r)}else l&&(ax(e,o,l,r),i[t]=void 0)}}const vu=/(?:Once|Passive|Capture)$/;function lx(e){let t;if(vu.test(e)){t={};let n;for(;n=e.match(vu);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ws(e.slice(2)),t]}let _r=0;const ox=Promise.resolve(),rx=()=>_r||(ox.then(()=>_r=0),_r=Date.now());function cx(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ee(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),o=[n];for(let r=0;r<l.length&&!n._stopped;r++){const c=l[r];c&&Rs(c,t,5,o)}}else Rs(a,t,5,[n])};return s.value=e,s.attached=rx(),s}const gu=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Dh=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Yy(e,n,l):t==="style"?tx(e,s,n):Ea(t)?No(t)||ix(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):dx(e,t,n,l))?(hu(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&fu(e,t,n,l,i,t!=="value")):e._isVueCE&&(ux(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ue(n)))?hu(e,pt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),fu(e,t,n,l))};function dx(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&gu(t)&&Me(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return gu(t)&&Ue(s)?!1:t in e}function ux(e,t){const s=e._def.props;if(!s)return!1;const n=pt(t);return Array.isArray(s)?s.some(a=>pt(a)===n):Object.keys(s).some(a=>pt(a)===n)}const bu={};function Mh(e,t,s){let n=_l(e,t);Do(n)&&(n=Ge({},n,t));class a extends Yo{constructor(l){super(n,l,s)}}return a.def=n,a}const px=((e,t)=>Mh(e,t,Wh)),fx=typeof HTMLElement<"u"?HTMLElement:class{};class Yo extends fx{constructor(t,s={},n=yo){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==yo?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ge({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Yo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,It(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let o;if(i&&!Ee(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=to(this._props[r])),(o||(o=Object.create(null)))[pt(r)]=!0)}this._numberProps=o,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)at(this,n)||Object.defineProperty(this,n,{get:()=>dn(s[n])})}_resolveProps(t){const{props:s}=t,n=Ee(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(pt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):bu;const a=pt(t);s&&this._numberProps&&this._numberProps[a]&&(n=to(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===bu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ws(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ws(t),s+""):s||this.removeAttribute(ws(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Kh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=yt(this._def,Ge(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Do(l[0])?Ge({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),ws(i)!==i&&a(ws(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],o=a.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,a)}else for(;a.firstChild;)o.insertBefore(a.firstChild,a);o.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Ph(e){const t=fs(),s=t&&t.ce;return s||null}function hx(){const e=Ph();return e&&e.shadowRoot}function mx(e="$style"){{const t=fs();if(!t)return Ke;const s=t.type.__cssModules;if(!s)return Ke;const n=s[e];return n||Ke}}const Fh=new WeakMap,$h=new WeakMap,go=Symbol("_moveCb"),yu=Symbol("_enterCb"),vx=e=>(delete e.props.mode,e),gx=vx({name:"TransitionGroup",props:Ge({},Rh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=fs(),n=Fc();let a,i;return Ko(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!wx(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(yx),a.forEach(xx);const o=a.filter(_x);tc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;nn(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[go]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[go]=null,Jn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Qe(e),o=Ih(l);let r=l.tag||Gt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Yc]&&(a.push(d),Fn(d,ri(d,o,n,s)),Fh.set(d,Uh(d.el)))}i=t.default?qo(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Fn(d,ri(d,o,n,s))}return yt(r,null,i)}}}),bx=gx;function yx(e){const t=e.el;t[go]&&t[go](),t[yu]&&t[yu]()}function xx(e){$h.set(e,Uh(e.el))}function _x(e){const t=Fh.get(e),s=$h.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/r}px,${a/c}px)`,l.transitionDuration="0s",e}}function Uh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function wx(e,t,s){const n=e.cloneNode(),a=e[di];a&&a.forEach(o=>{o.split(/\s+/).forEach(r=>r&&n.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&n.classList.add(o)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Oh(n);return i.removeChild(n),l}const na=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ee(t)?s=>ei(t,s):t};function kx(e){e.target.composing=!0}function xu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const js=Symbol("_assign");function _u(e,t,s){return t&&(e=e.trim()),s&&(e=Fo(e)),e}const bo={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[js]=na(a);const i=n||a.props&&a.props.type==="number";En(e,t?"change":"input",l=>{l.target.composing||e[js](_u(e.value,s,i))}),(s||i)&&En(e,"change",()=>{e.value=_u(e.value,s,i)}),t||(En(e,"compositionstart",kx),En(e,"compositionend",xu),En(e,"change",xu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[js]=na(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Fo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===r)||(e.value=r)}},Qc={deep:!0,created(e,t,s){e[js]=na(s),En(e,"change",()=>{const n=e._modelValue,a=ui(e),i=e.checked,l=e[js];if(Ee(n)){const o=Uo(n,a),r=o!==-1;if(i&&!r)l(n.concat(a));else if(!i&&r){const c=[...n];c.splice(o,1),l(c)}}else if(Aa(n)){const o=new Set(n);i?o.add(a):o.delete(a),l(o)}else l(Hh(e,i))})},mounted:wu,beforeUpdate(e,t,s){e[js]=na(s),wu(e,t,s)}};function wu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ee(t))a=Uo(t,n.props.value)>-1;else if(Aa(t))a=t.has(n.props.value);else{if(t===s)return;a=Dn(t,Hh(e,!0))}e.checked!==a&&(e.checked=a)}const Xc={created(e,{value:t},s){e.checked=Dn(t,s.props.value),e[js]=na(s),En(e,"change",()=>{e[js](ui(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[js]=na(n),t!==s&&(e.checked=Dn(t,n.props.value))}},Bh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Aa(t);En(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Fo(ui(l)):ui(l));e[js](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,It(()=>{e._assigning=!1})}),e[js]=na(n)},mounted(e,{value:t}){ku(e,t)},beforeUpdate(e,t,s){e[js]=na(s)},updated(e,{value:t}){e._assigning||ku(e,t)}};function ku(e,t){const s=e.multiple,n=Ee(t);if(!(s&&!n&&!Aa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],o=ui(l);if(s)if(n){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Uo(t,o)>-1}else l.selected=t.has(o);else if(Dn(ui(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ui(e){return"_value"in e?e._value:e.value}function Hh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const zh={created(e,t,s){$l(e,t,s,null,"created")},mounted(e,t,s){$l(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){$l(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){$l(e,t,s,n,"updated")}};function jh(e,t){switch(e){case"SELECT":return Bh;case"TEXTAREA":return bo;default:switch(t){case"checkbox":return Qc;case"radio":return Xc;default:return bo}}}function $l(e,t,s,n,a){const l=jh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Sx(){bo.getSSRProps=({value:e})=>({value:e}),Xc.getSSRProps=({value:e},t)=>{if(t.props&&Dn(t.props.value,e))return{checked:!0}},Qc.getSSRProps=({value:e},t)=>{if(Ee(e)){if(t.props&&Uo(e,t.props.value)>-1)return{checked:!0}}else if(Aa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},zh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=jh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Tx=["ctrl","shift","alt","meta"],Cx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Tx.some(s=>e[`${s}Key`]&&!t.includes(s))},Ex=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const o=Cx[t[l]];if(o&&o(a,t))return}return e(a,...i)}))},Ax={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Rx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=ws(a.key);if(t.some(l=>l===i||Ax[l]===i))return e(a)}))},Vh=Ge({patchProp:Dh},Eh);let qi,Su=!1;function qh(){return qi||(qi=ah(Vh))}function Gh(){return qi=Su?qi:ih(Vh),Su=!0,qi}const Kh=((...e)=>{qh().render(...e)}),Ix=((...e)=>{Gh().hydrate(...e)}),yo=((...e)=>{const t=qh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Zh(n);if(!a)return;const i=t._component;!Me(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Jh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Wh=((...e)=>{const t=Gh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Zh(n);if(a)return s(a,!0,Jh(a))},t});function Jh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Zh(e){return Ue(e)?document.querySelector(e):e}let Tu=!1;const Ox=()=>{Tu||(Tu=!0,Sx(),Qy())},Lx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Mf,BaseTransitionPropsValidators:$c,Comment:Ot,DeprecationTypes:Vy,EffectScope:Ac,ErrorCodes:Kg,ErrorTypeStrings:Fy,Fragment:Gt,KeepAlive:Cb,ReactiveEffect:Zi,Static:xa,Suspense:by,Teleport:rb,Text:ta,TrackOpTypes:Bg,Transition:Wy,TransitionGroup:bx,TriggerOpTypes:Hg,VueElement:Yo,assertNumber:Gg,callWithAsyncErrorHandling:Rs,callWithErrorHandling:xi,camelize:pt,capitalize:Ra,cloneVNode:pn,compatUtils:jy,computed:G,createApp:yo,createBlock:po,createCommentVNode:vh,createElementBlock:Sy,createElementVNode:Wc,createHydrationRenderer:ih,createPropsRestProxy:Wb,createRenderer:ah,createSSRApp:Wh,createSlots:Nb,createStaticVNode:Ey,createTextVNode:Jc,createVNode:yt,customRef:yf,defineAsyncComponent:Sb,defineComponent:_l,defineCustomElement:Mh,defineEmits:$b,defineExpose:Ub,defineModel:zb,defineOptions:Bb,defineProps:Fb,defineSSRCustomElement:px,defineSlots:Hb,devtools:$y,effect:cg,effectScope:lg,getCurrentInstance:fs,getCurrentScope:ef,getCurrentWatcher:zg,getTransitionRawChildren:qo,guardReactiveProps:mh,h:ci,handleError:Ia,hasInjectionContext:tb,hydrate:Ix,hydrateOnIdle:bb,hydrateOnInteraction:wb,hydrateOnMediaQuery:_b,hydrateOnVisible:xb,initCustomFormatter:Dy,initDirectivesForSSR:Ox,inject:zs,isMemoSame:Sh,isProxy:yl,isReactive:On,isReadonly:un,isRef:Pt,isRuntimeOnly:Oy,isShallow:Ss,isVNode:$n,markRaw:gf,mergeDefaults:Gb,mergeModels:Kb,mergeProps:gh,nextTick:It,nodeOps:Eh,normalizeClass:bl,normalizeProps:Kv,normalizeStyle:gl,onActivated:es,onBeforeMount:$f,onBeforeUnmount:Wo,onBeforeUpdate:Bc,onDeactivated:Wt,onErrorCaptured:zf,onMounted:je,onRenderTracked:Hf,onRenderTriggered:Bf,onScopeDispose:og,onServerPrefetch:Uf,onUnmounted:ft,onUpdated:Ko,onWatcherCleanup:_f,openBlock:al,patchProp:Dh,popScopeId:Qg,provide:zi,proxyRefs:Dc,pushScopeId:Yg,queuePostFlushCb:Xi,reactive:aa,readonly:no,ref:h,registerRuntimeCompiler:_h,render:Kh,renderList:Lb,renderSlot:Db,resolveComponent:Rb,resolveDirective:Ob,resolveDynamicComponent:Ib,resolveFilter:zy,resolveTransitionHooks:ri,setBlockTracking:il,setDevtoolsHook:Uy,setTransitionHooks:Fn,shallowReactive:Lc,shallowReadonly:Ag,shallowRef:Nc,ssrContextKey:Ef,ssrUtils:Hy,stop:dg,toDisplayString:Qp,toHandlerKey:Xa,toHandlers:Mb,toRaw:Qe,toRef:Fg,toRefs:Dg,toValue:Og,transformVNodeArgs:Ty,triggerRef:Ig,unref:dn,useAttrs:qb,useCssModule:mx,useCssVars:Xy,useHost:Ph,useId:db,useModel:ny,useSSRContext:Af,useShadowRoot:hx,useSlots:Vb,useTemplateRef:ub,useTransitionState:Fc,vModelCheckbox:Qc,vModelDynamic:zh,vModelRadio:Xc,vModelSelect:Bh,vModelText:bo,vShow:Lh,version:Th,warn:Py,watch:Ft,watchEffect:sb,watchPostEffect:nb,watchSyncEffect:Rf,withAsyncContext:Jb,withCtx:Pc,withDefaults:jb,withDirectives:eb,withKeys:Rx,withMemo:My,withModifiers:Ex,withScopeId:Xg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ol=Symbol(""),Gi=Symbol(""),ed=Symbol(""),xo=Symbol(""),Yh=Symbol(""),Ta=Symbol(""),Qh=Symbol(""),Xh=Symbol(""),td=Symbol(""),sd=Symbol(""),Sl=Symbol(""),nd=Symbol(""),em=Symbol(""),ad=Symbol(""),id=Symbol(""),ld=Symbol(""),od=Symbol(""),rd=Symbol(""),cd=Symbol(""),tm=Symbol(""),sm=Symbol(""),Qo=Symbol(""),_o=Symbol(""),dd=Symbol(""),ud=Symbol(""),rl=Symbol(""),Tl=Symbol(""),pd=Symbol(""),nc=Symbol(""),Nx=Symbol(""),ac=Symbol(""),wo=Symbol(""),Dx=Symbol(""),Mx=Symbol(""),fd=Symbol(""),Px=Symbol(""),Fx=Symbol(""),hd=Symbol(""),nm=Symbol(""),pi={[ol]:"Fragment",[Gi]:"Teleport",[ed]:"Suspense",[xo]:"KeepAlive",[Yh]:"BaseTransition",[Ta]:"openBlock",[Qh]:"createBlock",[Xh]:"createElementBlock",[td]:"createVNode",[sd]:"createElementVNode",[Sl]:"createCommentVNode",[nd]:"createTextVNode",[em]:"createStaticVNode",[ad]:"resolveComponent",[id]:"resolveDynamicComponent",[ld]:"resolveDirective",[od]:"resolveFilter",[rd]:"withDirectives",[cd]:"renderList",[tm]:"renderSlot",[sm]:"createSlots",[Qo]:"toDisplayString",[_o]:"mergeProps",[dd]:"normalizeClass",[ud]:"normalizeStyle",[rl]:"normalizeProps",[Tl]:"guardReactiveProps",[pd]:"toHandlers",[nc]:"camelize",[Nx]:"capitalize",[ac]:"toHandlerKey",[wo]:"setBlockTracking",[Dx]:"pushScopeId",[Mx]:"popScopeId",[fd]:"withCtx",[Px]:"unref",[Fx]:"isRef",[hd]:"withMemo",[nm]:"isMemoSame"};function $x(e){Object.getOwnPropertySymbols(e).forEach(t=>{pi[t]=e[t]})}const Os={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ux(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Os}}function cl(e,t,s,n,a,i,l,o=!1,r=!1,c=!1,d=Os){return e&&(o?(e.helper(Ta),e.helper(mi(e.inSSR,c))):e.helper(hi(e.inSSR,c)),l&&e.helper(rd)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function _a(e,t=Os){return{type:17,loc:t,elements:e}}function Hs(e,t=Os){return{type:15,loc:t,properties:e}}function Mt(e,t){return{type:16,loc:Os,key:Ue(e)?He(e,!0):e,value:t}}function He(e,t=!1,s=Os,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Zs(e,t=Os){return{type:8,loc:t,children:e}}function Vt(e,t=[],s=Os){return{type:14,loc:s,callee:e,arguments:t}}function fi(e,t=void 0,s=!1,n=!1,a=Os){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function ic(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Os}}function Bx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Os}}function Hx(e){return{type:21,body:e,loc:Os}}function hi(e,t){return e||t?td:sd}function mi(e,t){return e||t?Qh:Xh}function md(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(hi(n,e.isComponent)),t(Ta),t(mi(n,e.isComponent)))}const Cu=new Uint8Array([123,123]),Eu=new Uint8Array([125,125]);function Au(e){return e>=97&&e<=122||e>=65&&e<=90}function Es(e){return e===32||e===10||e===9||e===12||e===13}function Gn(e){return e===47||e===62||Es(e)}function ko(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const ts={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class zx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Cu,this.delimiterClose=Eu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Cu,this.delimiterClose=Eu}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,o=a;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Gn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Es(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===ts.TitleEnd||this.currentSequence===ts.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===ts.Cdata[this.sequenceIndex]?++this.sequenceIndex===ts.Cdata.length&&(this.state=28,this.currentSequence=ts.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Au(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Gn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Gn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(ko("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Es(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Au(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Es(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Es(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Es(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Gn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Gn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Gn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Gn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Gn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Es(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Es(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Es(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=ts.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===ts.ScriptEnd[3]?this.startSpecial(ts.ScriptEnd,4):t===ts.StyleEnd[3]?this.startSpecial(ts.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===ts.TitleEnd[3]?this.startSpecial(ts.TitleEnd,4):t===ts.TextareaEnd[3]?this.startSpecial(ts.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Ru(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function wa(e,t){const s=Ru("MODE",t),n=Ru(e,t);return s===3?n===!0:n!==!1}function dl(e,t,s,...n){return wa(e,t)}function vd(e){throw e}function am(e){}function bt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const ks=e=>e.type===4&&e.isStatic;function im(e){switch(e){case"Teleport":case"teleport":return Gi;case"Suspense":case"suspense":return ed;case"KeepAlive":case"keep-alive":return xo;case"BaseTransition":case"base-transition":return Yh}}const jx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,gd=e=>!jx.test(e),lm=/[A-Za-z_$\xA0-\uFFFF]/,Vx=/[\.\?\w$\xA0-\uFFFF]/,qx=/\s+[.[]\s*|\s*[.[]\s+/g,om=e=>e.type===4?e.content:e.loc.source,Gx=e=>{const t=om(e).trim().replace(qx,o=>o.trim());let s=0,n=[],a=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")n.push(s),s=1,a++;else if(r==="(")n.push(s),s=2,i++;else if(!(o===0?lm:Vx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(n.push(s),s=3,l=r):r==="["?a++:r==="]"&&(--a||(s=n.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")n.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=n.pop())}break;case 3:r===l&&(s=n.pop(),l=null);break}}return!a&&!i},rm=Gx,Kx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Wx=e=>Kx.test(om(e)),Jx=Wx;function Bs(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ue(t)?a.name===t:t.test(a.name)))return a}}function Xo(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&ma(i.arg,t))return i}}function ma(e,t){return!!(e&&ks(e)&&e.content===t)}function Zx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function wr(e){return e.type===5||e.type===2}function Iu(e){return e.type===7&&e.name==="pre"}function Yx(e){return e.type===7&&e.name==="slot"}function So(e){return e.type===1&&e.tagType===3}function To(e){return e.type===1&&e.tagType===2}const Qx=new Set([rl,Tl]);function cm(e,t=[]){if(e&&!Ue(e)&&e.type===14){const s=e.callee;if(!Ue(s)&&Qx.has(s))return cm(e.arguments[0],t.concat(e))}return[e,t]}function Co(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ue(a)&&a.type===14){const o=cm(a);a=o[0],i=o[1],l=i[i.length-1]}if(a==null||Ue(a))n=Hs([t]);else if(a.type===14){const o=a.arguments[0];!Ue(o)&&o.type===15?Ou(t,o)||o.properties.unshift(t):a.callee===pd?n=Vt(s.helper(_o),[Hs([t]),a]):a.arguments.unshift(Hs([t])),!n&&(n=a)}else a.type===15?(Ou(t,a)||a.properties.unshift(t),n=a):(n=Vt(s.helper(_o),[Hs([t]),a]),l&&l.callee===Tl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Ou(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function ul(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Xx(e){return e.type===14&&e.callee===hd?e.arguments[1].returns:e}const e0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function dm(e){for(let t=0;t<e.length;t++)if(!Es(e.charCodeAt(t)))return!1;return!0}function bd(e){return e.type===2&&dm(e.content)||e.type===12&&bd(e.content)}function um(e){return e.type===3||bd(e)}const pm={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Wa,isPreTag:Wa,isIgnoreNewlineTag:Wa,isCustomElement:Wa,onError:vd,onWarn:am,comments:!1,prefixIdentifiers:!1};let tt=pm,pl=null,Nn="",ns=null,Je=null,bs="",_n=-1,pa=-1,yd=0,Qn=!1,lc=null;const gt=[],Et=new zx(gt,{onerr:bn,ontext(e,t){Ul(Zt(e,t),e,t)},ontextentity(e,t,s){Ul(e,t,s)},oninterpolation(e,t){if(Qn)return Ul(Zt(e,t),e,t);let s=e+Et.delimiterOpen.length,n=t-Et.delimiterClose.length;for(;Es(Nn.charCodeAt(s));)s++;for(;Es(Nn.charCodeAt(n-1));)n--;let a=Zt(s,n);a.includes("&")&&(a=tt.decodeEntities(a,!1)),oc({type:5,content:Yl(a,!1,Rt(s,n)),loc:Rt(e,t)})},onopentagname(e,t){const s=Zt(e,t);ns={type:1,tag:s,ns:tt.getNamespace(s,gt[0],tt.ns),tagType:0,props:[],children:[],loc:Rt(e-1,t),codegenNode:void 0}},onopentagend(e){Nu(e)},onclosetag(e,t){const s=Zt(e,t);if(!tt.isVoidTag(s)){let n=!1;for(let a=0;a<gt.length;a++)if(gt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&bn(24,gt[0].loc.start.offset);for(let l=0;l<=a;l++){const o=gt.shift();Zl(o,t,l<a)}break}n||bn(23,fm(e,60))}},onselfclosingtag(e){const t=ns.tag;ns.isSelfClosing=!0,Nu(e),gt[0]&&gt[0].tag===t&&Zl(gt.shift(),e)},onattribname(e,t){Je={type:6,name:Zt(e,t),nameLoc:Rt(e,t),value:void 0,loc:Rt(e)}},ondirname(e,t){const s=Zt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Qn&&n===""&&bn(26,e),Qn||n==="")Je={type:6,name:s,nameLoc:Rt(e,t),value:void 0,loc:Rt(e)};else if(Je={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[He("prop")]:[],loc:Rt(e)},n==="pre"){Qn=Et.inVPre=!0,lc=ns;const a=ns.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=d0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Zt(e,t);if(Qn&&!Iu(Je))Je.name+=s,va(Je.nameLoc,t);else{const n=s[0]!=="[";Je.arg=Yl(n?s:s.slice(1,-1),n,Rt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Zt(e,t);if(Qn&&!Iu(Je))Je.name+="."+s,va(Je.nameLoc,t);else if(Je.name==="slot"){const n=Je.arg;n&&(n.content+="."+s,va(n.loc,t))}else{const n=He(s,!0,Rt(e,t));Je.modifiers.push(n)}},onattribdata(e,t){bs+=Zt(e,t),_n<0&&(_n=e),pa=t},onattribentity(e,t,s){bs+=e,_n<0&&(_n=t),pa=s},onattribnameend(e){const t=Je.loc.start.offset,s=Zt(t,e);Je.type===7&&(Je.rawName=s),ns.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&bn(2,t)},onattribend(e,t){if(ns&&Je){if(va(Je.loc,t),e!==0)if(bs.includes("&")&&(bs=tt.decodeEntities(bs,!0)),Je.type===6)Je.name==="class"&&(bs=mm(bs).trim()),e===1&&!bs&&bn(13,t),Je.value={type:2,content:bs,loc:e===1?Rt(_n,pa):Rt(_n-1,pa+1)},Et.inSFCRoot&&ns.tag==="template"&&Je.name==="lang"&&bs&&bs!=="html"&&Et.enterRCDATA(ko("</template"),0);else{let s=0;Je.exp=Yl(bs,!1,Rt(_n,pa),0,s),Je.name==="for"&&(Je.forParseResult=s0(Je.exp));let n=-1;Je.name==="bind"&&(n=Je.modifiers.findIndex(a=>a.content==="sync"))>-1&&dl("COMPILER_V_BIND_SYNC",tt,Je.loc,Je.arg.loc.source)&&(Je.name="model",Je.modifiers.splice(n,1))}(Je.type!==7||Je.name!=="pre")&&ns.props.push(Je)}bs="",_n=pa=-1},oncomment(e,t){tt.comments&&oc({type:3,content:Zt(e,t),loc:Rt(e-4,t+3)})},onend(){const e=Nn.length;for(let t=0;t<gt.length;t++)Zl(gt[t],e-1),bn(24,gt[t].loc.start.offset)},oncdata(e,t){(gt[0]?gt[0].ns:tt.ns)!==0?Ul(Zt(e,t),e,t):bn(1,e-9)},onprocessinginstruction(e){(gt[0]?gt[0].ns:tt.ns)===0&&bn(21,e-1)}}),Lu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,t0=/^\(|\)$/g;function s0(e){const t=e.loc,s=e.content,n=s.match(e0);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const m=t.start.offset+p,v=m+u.length;return Yl(u,!1,Rt(m,v),0,f?1:0)},o={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=a.trim().replace(t0,"").trim();const c=a.indexOf(r),d=r.match(Lu);if(d){r=r.replace(Lu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(o.index=l(f,s.indexOf(f,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Zt(e,t){return Nn.slice(e,t)}function Nu(e){Et.inSFCRoot&&(ns.innerLoc=Rt(e+1,e+1)),oc(ns);const{tag:t,ns:s}=ns;s===0&&tt.isPreTag(t)&&yd++,tt.isVoidTag(t)?Zl(ns,e):(gt.unshift(ns),(s===1||s===2)&&(Et.inXML=!0)),ns=null}function Ul(e,t,s){{const i=gt[0]&&gt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=tt.decodeEntities(e,!1))}const n=gt[0]||pl,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,va(a.loc,s)):n.children.push({type:2,content:e,loc:Rt(t,s)})}function Zl(e,t,s=!1){s?va(e.loc,fm(t,60)):va(e.loc,n0(t,62)+1),Et.inSFCRoot&&(e.children.length?e.innerLoc.end=Ge({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ge({},e.innerLoc.start),e.innerLoc.source=Zt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Qn||(n==="slot"?e.tagType=2:Du(e)?e.tagType=3:i0(e)&&(e.tagType=1)),Et.inRCDATA||(e.children=hm(i)),a===0&&tt.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&tt.isPreTag(n)&&yd--,lc===e&&(Qn=Et.inVPre=!1,lc=null),Et.inXML&&(gt[0]?gt[0].ns:tt.ns)===0&&(Et.inXML=!1);{const l=e.props;if(!Et.inSFCRoot&&wa("COMPILER_NATIVE_TEMPLATE",tt)&&e.tag==="template"&&!Du(e)){const r=gt[0]||pl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&dl("COMPILER_INLINE_TEMPLATE",tt,o.loc)&&e.children.length&&(o.value={type:2,content:Zt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function n0(e,t){let s=e;for(;Nn.charCodeAt(s)!==t&&s<Nn.length-1;)s++;return s}function fm(e,t){let s=e;for(;Nn.charCodeAt(s)!==t&&s>=0;)s--;return s}const a0=new Set(["if","else","else-if","for","slot"]);function Du({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&a0.has(t[s].name))return!0}return!1}function i0({tag:e,props:t}){if(tt.isCustomElement(e))return!1;if(e==="component"||l0(e.charCodeAt(0))||im(e)||tt.isBuiltInComponent&&tt.isBuiltInComponent(e)||tt.isNativeTag&&!tt.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(dl("COMPILER_IS_ON_ELEMENT",tt,n.loc))return!0}}else if(n.name==="bind"&&ma(n.arg,"is")&&dl("COMPILER_IS_ON_ELEMENT",tt,n.loc))return!0}return!1}function l0(e){return e>64&&e<91}const o0=/\r\n/g;function hm(e){const t=tt.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(yd)a.content=a.content.replace(o0,`
`);else if(dm(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&r0(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=mm(a.content))}return s?e.filter(Boolean):e}function r0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function mm(e){let t="",s=!1;for(let n=0;n<e.length;n++)Es(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function oc(e){(gt[0]||pl).children.push(e)}function Rt(e,t){return{start:Et.getPos(e),end:t==null?t:Et.getPos(t),source:t==null?t:Zt(e,t)}}function c0(e){return Rt(e.start.offset,e.end.offset)}function va(e,t){e.end=Et.getPos(t),e.source=Zt(e.start.offset,t)}function d0(e){const t={type:6,name:e.rawName,nameLoc:Rt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Yl(e,t=!1,s,n=0,a=0){return He(e,t,s,n)}function bn(e,t,s){tt.onError(bt(e,Rt(t,t)))}function u0(){Et.reset(),ns=null,Je=null,bs="",_n=-1,pa=-1,gt.length=0}function p0(e,t){if(u0(),Nn=e,tt=Ge({},pm),t){let a;for(a in t)t[a]!=null&&(tt[a]=t[a])}Et.mode=tt.parseMode==="html"?1:tt.parseMode==="sfc"?2:0,Et.inXML=tt.ns===1||tt.ns===2;const s=t&&t.delimiters;s&&(Et.delimiterOpen=ko(s[0]),Et.delimiterClose=ko(s[1]));const n=pl=Ux([],e);return Et.parse(Nn),n.loc=Rt(0,e.length),n.children=hm(n.children),pl=null,n}function f0(e,t){Ql(e,void 0,t,!!vm(e))}function vm(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!To(t[0])?t[0]:null}function Ql(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:As(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const m=f.patchFlag;if((m===void 0||m===512||m===1)&&bm(u,s)>=2){const v=ym(u);v&&(f.props=s.hoist(v))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:As(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Ql(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Ql(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Ql(u.branches[p],e,s,u.branches[p].children.length===1,a)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ee(e.codegenNode.children))e.codegenNode.children=r(_a(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ee(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(_a(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ee(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Bs(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(_a(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ee(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function As(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const o=bm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=As(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=As(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Ta),t.removeHelper(mi(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(hi(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return As(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Ue(o)||os(o))continue;const r=As(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const h0=new Set([dd,ud,rl,Tl]);function gm(e,t){if(e.type===14&&!Ue(e.callee)&&h0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return As(s,t);if(s.type===14)return gm(s,t)}return 0}function bm(e,t){let s=3;const n=ym(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:o}=a[i],r=As(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=As(o,t):o.type===14?c=gm(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function ym(e){const t=e.codegenNode;if(t.type===13)return t.props}function m0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Xt,isCustomElement:d=Xt,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:T="",bindingMetadata:L=Ke,inline:y=!1,isTS:g=!1,onError:b=vd,onWarn:A=am,compatConfig:_}){const I=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),E={filename:t,selfName:I&&Ra(pt(I[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:m,inSSR:v,ssrCssVars:T,bindingMetadata:L,inline:y,isTS:g,onError:b,onWarn:A,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(x){const N=E.helpers.get(x)||0;return E.helpers.set(x,N+1),x},removeHelper(x){const N=E.helpers.get(x);if(N){const $=N-1;$?E.helpers.set(x,$):E.helpers.delete(x)}},helperString(x){return`_${pi[E.helper(x)]}`},replaceNode(x){E.parent.children[E.childIndex]=E.currentNode=x},removeNode(x){const N=E.parent.children,$=x?N.indexOf(x):E.currentNode?E.childIndex:-1;!x||x===E.currentNode?(E.currentNode=null,E.onNodeRemoved()):E.childIndex>$&&(E.childIndex--,E.onNodeRemoved()),E.parent.children.splice($,1)},onNodeRemoved:Xt,addIdentifiers(x){},removeIdentifiers(x){},hoist(x){Ue(x)&&(x=He(x)),E.hoists.push(x);const N=He(`_hoisted_${E.hoists.length}`,!1,x.loc,2);return N.hoisted=x,N},cache(x,N=!1,$=!1){const k=Bx(E.cached.length,x,N,$);return E.cached.push(k),k}};return E.filters=new Set,E}function v0(e,t){const s=m0(e,t);er(e,s),t.hoistStatic&&f0(e,s),t.ssr||g0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function g0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=vm(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&md(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=cl(t,s(ol),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function b0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ue(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,er(a,t))}}function er(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ee(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Sl);break;case 5:t.ssr||t.helper(Qo);break;case 9:for(let i=0;i<e.branches.length;i++)er(e.branches[i],t);break;case 10:case 11:case 1:case 0:b0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function xm(e,t){const s=Ue(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(Yx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(n,r,a);c&&l.push(c)}}return l}}}const tr="/*@__PURE__*/",_m=e=>`${pi[e]}: _${pi[e]}`;function y0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${pi[v]}`},push(v,T=-2,L){f.code+=v},indent(){m(++f.indentLevel)},deindent(v=!1){v?--f.indentLevel:m(--f.indentLevel)},newline(){m(f.indentLevel)}};function m(v){f.push(`
`+"  ".repeat(v),0)}return f}function x0(e,t={}){const s=y0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";_0(e,s);const v=d?"ssrRender":"render",L=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${L}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(_m).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(kr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(kr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),kr(e.filters,"filter",s),r()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),r()),d||a("return "),e.codegenNode?ls(e.codegenNode,s):a("null"),f&&(o(),a("}")),o(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function _0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[td,sd,Sl,nd,em].filter(p=>d.includes(p)).map(_m).join(", ");a(`const { ${u} } = _Vue
`,-1)}w0(e.hoists,t),i(),a("return ")}function kr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?od:t==="component"?ad:ld);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),n(`const ${ul(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&a()}}function w0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),ls(i,t),n())}t.pure=!1}function xd(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Cl(e,t,s),s&&t.deindent(),t.push("]")}function Cl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Ue(o)?a(o,-3):Ee(o)?xd(o,t):ls(o,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function ls(e,t){if(Ue(e)){t.push(e,-3);return}if(os(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ls(e.codegenNode,t);break;case 2:k0(e,t);break;case 4:wm(e,t);break;case 5:S0(e,t);break;case 12:ls(e.codegenNode,t);break;case 8:km(e,t);break;case 3:C0(e,t);break;case 13:E0(e,t);break;case 14:R0(e,t);break;case 15:I0(e,t);break;case 17:O0(e,t);break;case 18:L0(e,t);break;case 19:N0(e,t);break;case 20:D0(e,t);break;case 21:Cl(e.body,t,!0,!1);break}}function k0(e,t){t.push(JSON.stringify(e.content),-3,e)}function wm(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function S0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(tr),s(`${n(Qo)}(`),ls(e.content,t),s(")")}function km(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ue(n)?t.push(n,-3):ls(n,t)}}function T0(e,t){const{push:s}=t;if(e.type===8)s("["),km(e,t),s("]");else if(e.isStatic){const n=gd(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function C0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(tr),s(`${n(Sl)}(${JSON.stringify(e.content)})`,-3,e)}function E0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let m;r&&(m=String(r)),d&&s(n(rd)+"("),u&&s(`(${n(Ta)}(${p?"true":""}), `),a&&s(tr);const v=u?mi(t.inSSR,f):hi(t.inSSR,f);s(n(v)+"(",-2,e),Cl(A0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),ls(d,t),s(")"))}function A0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function R0(e,t){const{push:s,helper:n,pure:a}=t,i=Ue(e.callee)?e.callee:n(e.callee);a&&s(tr),s(i+"(",-2,e),Cl(e.arguments,t),s(")")}function I0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&n();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];T0(c,t),s(": "),ls(d,t),r<l.length-1&&(s(","),i())}o&&a(),s(o?"}":" }")}function O0(e,t){xd(e.elements,t)}function L0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${pi[fd]}(`),s("(",-2,e),Ee(i)?Cl(i,t):i&&ls(i,t),s(") => "),(r||o)&&(s("{"),n()),l?(r&&s("return "),Ee(l)?xd(l,t):ls(l,t)):o&&ls(o,t),(r||o)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function N0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!gd(s.content);u&&l("("),wm(s,t),u&&l(")")}else l("("),ls(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ls(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,ls(a,t),d||t.indentLevel--,i&&r(!0)}function D0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(a(),s(`${n(wo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ls(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(wo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const M0=xm(/^(?:if|else|else-if)$/,(e,t,s)=>P0(e,t,s,(n,a,i)=>{const l=s.parent.children;let o=l.indexOf(n),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)n.codegenNode=Pu(a,r,s);else{const c=F0(n.codegenNode);c.alternate=Pu(a,r+n.branches.length-1,s)}}}));function P0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(bt(28,t.loc)),t.exp=He("true",!1,a)}if(t.name==="if"){const a=Mu(e,t),i={type:9,loc:c0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&um(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(bt(30,e.loc)),s.removeNode();const o=Mu(e,t);l.branches.push(o);const r=n&&n(l,o,!1);er(o,s),r&&r(),s.currentNode=null}else s.onError(bt(30,e.loc));break}}}function Mu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Bs(e,"for")?e.children:[e],userKey:Xo(e,"key"),isTemplateIf:s}}function Pu(e,t,s){return e.condition?ic(e.condition,Fu(e,t,s),Vt(s.helper(Sl),['""',"true"])):Fu(e,t,s)}function Fu(e,t,s){const{helper:n}=s,a=Mt("key",He(`${t}`,!1,Os,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return Co(r,a,s),r}else return cl(s,n(ol),Hs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=Xx(r);return c.type===13&&md(c,s),Co(c,a,s),r}}function F0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const $0=xm("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return U0(e,t,s,i=>{const l=Vt(n(cd),[i.source]),o=So(e),r=Bs(e,"memo"),c=Xo(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?He(c.value.content,!0):void 0:c.exp);const u=d?Mt("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=cl(s,n(ol),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,T=v.length!==1||v[0].type!==1,L=To(e)?e:o&&e.children.length===1&&To(e.children[0])?e.children[0]:null;if(L?(m=L.codegenNode,o&&u&&Co(m,u,s)):T?m=cl(s,n(ol),u?Hs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&Co(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(Ta),a(mi(s.inSSR,m.isComponent))):a(hi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(Ta),n(mi(s.inSSR,m.isComponent))):n(hi(s.inSSR,m.isComponent))),r){const y=fi(rc(i.parseResult,[He("_cached")]));y.body=Hx([Zs(["const _memo = (",r.exp,")"]),Zs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(nm)}(_cached, _memo)) return _cached`]),Zs(["const _item = ",m]),He("_item.memo = _memo"),He("return _item")]),l.arguments.push(y,He("_cache"),He(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(fi(rc(i.parseResult),m,!0))}})});function U0(e,t,s,n){if(!t.exp){s.onError(bt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(bt(32,t.loc));return}Sm(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:So(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const f=n&&n(p);return()=>{o.vFor--,f&&f()}}function Sm(e,t){e.finalized||(e.finalized=!0)}function rc({value:e,key:t,index:s},n=[]){return B0([e,t,s,...n])}function B0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||He("_".repeat(n+1),!1))}const $u=He("undefined",!1),H0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Bs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},z0=(e,t,s,n)=>fi(e,s,!1,!0,s.length?s[0].loc:n);function j0(e,t,s=z0){t.helper(fd);const{children:n,loc:a}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Bs(e,"slot",!0);if(r){const{arg:T,exp:L}=r;T&&!ks(T)&&(o=!0),i.push(Mt(T||He("default",!0),s(L,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let T=0;T<n.length;T++){const L=n[T];let y;if(!So(L)||!(y=Bs(L,"slot",!0))){L.type!==3&&u.push(L);continue}if(r){t.onError(bt(37,y.loc));break}c=!0;const{children:g,loc:b}=L,{arg:A=He("default",!0),exp:_,loc:I}=y;let E;ks(A)?E=A?A.content:"default":o=!0;const x=Bs(L,"for"),N=s(_,x,g,b);let $,k;if($=Bs(L,"if"))o=!0,l.push(ic($.exp,Bl(A,N,f++),$u));else if(k=Bs(L,/^else(?:-if)?$/,!0)){let M=T,H;for(;M--&&(H=n[M],!!um(H)););if(H&&So(H)&&Bs(H,/^(?:else-)?if$/)){let K=l[l.length-1];for(;K.alternate.type===19;)K=K.alternate;K.alternate=k.exp?ic(k.exp,Bl(A,N,f++),$u):Bl(A,N,f++)}else t.onError(bt(30,k.loc))}else if(x){o=!0;const M=x.forParseResult;M?(Sm(M),l.push(Vt(t.helper(cd),[M.source,fi(rc(M),Bl(A,N),!0)]))):t.onError(bt(32,x.loc))}else{if(E){if(p.has(E)){t.onError(bt(38,I));continue}p.add(E),E==="default"&&(d=!0)}i.push(Mt(A,N))}}if(!r){const T=(L,y)=>{const g=s(L,void 0,y,a);return t.compatConfig&&(g.isNonScopedSlot=!0),Mt("default",g)};c?u.length&&!u.every(bd)&&(d?t.onError(bt(39,u[0].loc)):i.push(T(void 0,u))):i.push(T(void 0,n))}const m=o?2:Xl(e.children)?3:1;let v=Hs(i.concat(Mt("_",He(m+"",!1))),a);return l.length&&(v=Vt(t.helper(sm),[v,_a(l)])),{slots:v,hasDynamicSlots:o}}function Bl(e,t,s){const n=[Mt("name",e),Mt("fn",t)];return s!=null&&n.push(Mt("key",He(String(s),!0))),Hs(n)}function Xl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Xl(s.children))return!0;break;case 9:if(Xl(s.branches))return!0;break;case 10:case 11:if(Xl(s.children))return!0;break}}return!1}const Tm=new WeakMap,V0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?q0(e,t):`"${n}"`;const o=st(l)&&l.callee===id;let r,c,d=0,u,p,f,m=o||l===Gi||l===ed||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=Cm(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const T=v.directives;f=T&&T.length?_a(T.map(L=>K0(L,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===xo&&(m=!0,d|=1024),i&&l!==Gi&&l!==xo){const{slots:T,hasDynamicSlots:L}=j0(e,t);c=T,L&&(d|=1024)}else if(e.children.length===1&&l!==Gi){const T=e.children[0],L=T.type,y=L===5||L===8;y&&As(T,t)===0&&(d|=1),y||L===2?c=T:c=e.children}else c=e.children;p&&p.length&&(u=W0(p)),e.codegenNode=cl(t,l,r,c,d===0?void 0:d,u,f,!!m,!1,i,e.loc)};function q0(e,t,s=!1){let{tag:n}=e;const a=cc(n),i=Xo(e,"is",!1,!0);if(i)if(a||wa("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&He(i.value.content,!0):(o=i.exp,o||(o=He("is",!1,i.arg.loc))),o)return Vt(t.helper(id),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=im(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(ad),t.components.add(n),ul(n,"component"))}function Cm(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let f=!1,m=0,v=!1,T=!1,L=!1,y=!1,g=!1,b=!1;const A=[],_=N=>{c.length&&(d.push(Hs(Uu(c),o)),c=[]),N&&d.push(N)},I=()=>{t.scopes.vFor>0&&c.push(Mt(He("ref_for",!0),He("true")))},E=({key:N,value:$})=>{if(ks(N)){const k=N.content,M=Ea(k);if(M&&(!n||a)&&k.toLowerCase()!=="onclick"&&k!=="onUpdate:modelValue"&&!In(k)&&(y=!0),M&&In(k)&&(b=!0),M&&$.type===14&&($=$.arguments[0]),$.type===20||($.type===4||$.type===8)&&As($,t)>0)return;k==="ref"?v=!0:k==="class"?T=!0:k==="style"?L=!0:k!=="key"&&!A.includes(k)&&A.push(k),n&&(k==="class"||k==="style")&&!A.includes(k)&&A.push(k)}else g=!0};for(let N=0;N<s.length;N++){const $=s[N];if($.type===6){const{loc:k,name:M,nameLoc:H,value:K}=$;let C=!0;if(M==="ref"&&(v=!0,I()),M==="is"&&(cc(l)||K&&K.content.startsWith("vue:")||wa("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Mt(He(M,!0,H),He(K?K.content:"",C,K?K.loc:k)))}else{const{name:k,arg:M,exp:H,loc:K,modifiers:C}=$,S=k==="bind",O=k==="on";if(k==="slot"){n||t.onError(bt(40,K));continue}if(k==="once"||k==="memo"||k==="is"||S&&ma(M,"is")&&(cc(l)||wa("COMPILER_IS_ON_ELEMENT",t))||O&&i)continue;if((S&&ma(M,"key")||O&&p&&ma(M,"vue:before-update"))&&(f=!0),S&&ma(M,"ref")&&I(),!M&&(S||O)){if(g=!0,H)if(S){if(_(),wa("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(H);continue}I(),_(),d.push(H)}else _({type:14,loc:K,callee:t.helper(pd),arguments:n?[H]:[H,"true"]});else t.onError(bt(S?34:35,K));continue}S&&C.some(Z=>Z.content==="prop")&&(m|=32);const U=t.directiveTransforms[k];if(U){const{props:Z,needRuntime:W}=U($,e,t);!i&&Z.forEach(E),O&&M&&!ks(M)?_(Hs(Z,o)):c.push(...Z),W&&(u.push($),os(W)&&Tm.set($,W))}else $v(k)||(u.push($),p&&(f=!0))}}let x;if(d.length?(_(),d.length>1?x=Vt(t.helper(_o),d,o):x=d[0]):c.length&&(x=Hs(Uu(c),o)),g?m|=16:(T&&!n&&(m|=2),L&&!n&&(m|=4),A.length&&(m|=8),y&&(m|=32)),!f&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&x)switch(x.type){case 15:let N=-1,$=-1,k=!1;for(let K=0;K<x.properties.length;K++){const C=x.properties[K].key;ks(C)?C.content==="class"?N=K:C.content==="style"&&($=K):C.isHandlerKey||(k=!0)}const M=x.properties[N],H=x.properties[$];k?x=Vt(t.helper(rl),[x]):(M&&!ks(M.value)&&(M.value=Vt(t.helper(dd),[M.value])),H&&(L||H.value.type===4&&H.value.content.trim()[0]==="["||H.value.type===17)&&(H.value=Vt(t.helper(ud),[H.value])));break;case 14:break;default:x=Vt(t.helper(rl),[Vt(t.helper(Tl),[x])]);break}return{props:x,directives:u,patchFlag:m,dynamicPropNames:A,shouldUseBlock:f}}function Uu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Ea(i))&&G0(l,a):(t.set(i,a),s.push(a))}return s}function G0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=_a([e.value,t.value],e.loc)}function K0(e,t){const s=[],n=Tm.get(e);n?s.push(t.helperString(n)):(t.helper(ld),t.directives.add(e.name),s.push(ul(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=He("true",!1,a);s.push(Hs(e.modifiers.map(l=>Mt(l,i)),a))}return _a(s,e.loc)}function W0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function cc(e){return e==="component"||e==="Component"}const J0=(e,t)=>{if(To(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=Z0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=fi([],s,!1,!1,n),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Vt(t.helper(tm),l,n)}};function Z0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=pt(l.name),a.push(l)));else if(l.name==="bind"&&ma(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=pt(l.arg.content);s=l.exp=He(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&ks(l.arg)&&(l.arg.content=pt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Cm(e,t,a,!1,!1);n=i,l.length&&t.onError(bt(36,l[0].loc))}return{slotName:s,slotProps:n}}const Em=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(bt(35,a));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Xa(pt(u)):`on:${u}`;o=He(p,!0,l.loc)}else o=Zs([`${s.helperString(ac)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(ac)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=rm(r),p=!(u||Jx(r)),f=r.content.includes(";");(p||c&&u)&&(r=Zs([`${p?"$event":"(...args)"} => ${f?"{":"("}`,r,f?"}":")"]))}let d={props:[Mt(o,r||He("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Y0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=pt(i.content):i.content=`${s.helperString(nc)}(${i.content})`:(i.children.unshift(`${s.helperString(nc)}(`),i.children.push(")"))),s.inSSR||(n.some(o=>o.content==="prop")&&Bu(i,"."),n.some(o=>o.content==="attr")&&Bu(i,"^")),{props:[Mt(i,l)]}},Bu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Q0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(wr(l)){a=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(wr(r))n||(n=s[i]=Zs([l],l.loc)),n.children.push(" + ",r),s.splice(o,1),o--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(wr(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&As(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Vt(t.helper(nd),o)}}}}},Hu=new WeakSet,X0=(e,t)=>{if(e.type===1&&Bs(e,"once",!0))return Hu.has(e)||t.inVOnce||t.inSSR?void 0:(Hu.add(e),t.inVOnce=!0,t.helper(wo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Am=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(bt(41,e.loc)),Ai();const i=n.loc.source.trim(),l=n.type===4?n.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(bt(44,n.loc)),Ai();if(o==="literal-const"||o==="setup-const")return s.onError(bt(45,n.loc)),Ai();if(!l.trim()||!rm(n))return s.onError(bt(42,n.loc)),Ai();const r=a||He("modelValue",!0),c=a?ks(a)?`onUpdate:${pt(a.content)}`:Zs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Zs([`${u} => ((`,n,") = $event)"]);const p=[Mt(r,e.exp),Mt(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(v=>v.content).map(v=>(gd(v)?v:JSON.stringify(v))+": true").join(", "),m=a?ks(a)?`${a.content}Modifiers`:Zs([a,' + "Modifiers"']):"modelModifiers";p.push(Mt(m,He(`{ ${f} }`,!1,e.loc,2)))}return Ai(p)};function Ai(e=[]){return{props:e}}const e_=/[\w).+\-_$\]]/,t_=(e,t)=>{wa("COMPILER_FILTERS",t)&&(e.type===5?Eo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Eo(s.exp,t)}))};function Eo(e,t){if(e.type===4)zu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?zu(n,t):n.type===8?Eo(e,t):n.type===5&&Eo(n.content,t))}}function zu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,f,m,v=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!o&&!r&&!c)m===void 0?(d=f+1,m=s.slice(0,f).trim()):T();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let L=f-1,y;for(;L>=0&&(y=s.charAt(L),y===" ");L--);(!y||!e_.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,f).trim():d!==0&&T();function T(){v.push(s.slice(d,f).trim()),d=f+1}if(v.length){for(f=0;f<v.length;f++)m=s_(m,v[f],t);e.content=m,e.ast=void 0}}function s_(e,t,s){s.helper(od);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${ul(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${ul(a,"filter")}(${e}${i!==")"?","+i:i}`}}const ju=new WeakSet,n_=(e,t)=>{if(e.type===1){const s=Bs(e,"memo");return!s||ju.has(e)||t.inSSR?void 0:(ju.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&md(n,t),e.codegenNode=Vt(t.helper(hd),[s.exp,fi(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},a_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(bt(53,n.loc)),s.exp=He("",!0,n.loc);else{const a=pt(n.content);(lm.test(a[0])||a[0]==="-")&&(s.exp=He(a,!1,n.loc))}}}};function i_(e){return[[a_,X0,M0,n_,$0,t_,J0,V0,H0,Q0],{on:Em,bind:Y0,model:Am}]}function l_(e,t={}){const s=t.onError||vd,n=t.mode==="module";t.prefixIdentifiers===!0?s(bt(48)):n&&s(bt(49));const a=!1;t.cacheHandlers&&s(bt(50)),t.scopeId&&!n&&s(bt(51));const i=Ge({},t,{prefixIdentifiers:a}),l=Ue(e)?p0(e,i):e,[o,r]=i_();return v0(l,Ge({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:Ge({},r,t.directiveTransforms||{})})),x0(l,i)}const o_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Rm=Symbol(""),Im=Symbol(""),Om=Symbol(""),Lm=Symbol(""),dc=Symbol(""),Nm=Symbol(""),Dm=Symbol(""),Mm=Symbol(""),Pm=Symbol(""),Fm=Symbol("");$x({[Rm]:"vModelRadio",[Im]:"vModelCheckbox",[Om]:"vModelText",[Lm]:"vModelSelect",[dc]:"vModelDynamic",[Nm]:"withModifiers",[Dm]:"withKeys",[Mm]:"vShow",[Pm]:"Transition",[Fm]:"TransitionGroup"});let Ba;function r_(e,t=!1){return Ba||(Ba=document.createElement("div")),t?(Ba.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Ba.children[0].getAttribute("foo")):(Ba.innerHTML=e,Ba.textContent)}const c_={parseMode:"html",isVoidTag:tg,isNativeTag:e=>Qv(e)||Xv(e)||eg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:r_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Pm;if(e==="TransitionGroup"||e==="transition-group")return Fm},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},d_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:He("style",!0,t.loc),exp:u_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},u_=(e,t)=>{const s=Jp(e);return He(JSON.stringify(s),!1,t,3)};function sa(e,t){return bt(e,t)}const p_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(sa(54,a)),t.children.length&&(s.onError(sa(55,a)),t.children.length=0),{props:[Mt(He("innerHTML",!0,a),n||He("",!0))]}},f_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(sa(56,a)),t.children.length&&(s.onError(sa(57,a)),t.children.length=0),{props:[Mt(He("textContent",!0),n?As(n,s)>0?n:Vt(s.helperString(Qo),[n],a):He("",!0))]}},h_=(e,t,s)=>{const n=Am(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(sa(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Om,o=!1;if(a==="input"||i){const r=Xo(t,"type");if(r){if(r.type===7)l=dc;else if(r.value)switch(r.value.content){case"radio":l=Rm;break;case"checkbox":l=Im;break;case"file":o=!0,s.onError(sa(60,e.loc));break}}else Zx(t)&&(l=dc)}else a==="select"&&(l=Lm);o||(n.needRuntime=s.helper(l))}else s.onError(sa(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},m_=Is("passive,once,capture"),v_=Is("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),g_=Is("left,right"),$m=Is("onkeyup,onkeydown,onkeypress"),b_=(e,t,s,n)=>{const a=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&dl("COMPILER_V_ON_NATIVE",s)||m_(r)?l.push(r):g_(r)?ks(e)?$m(e.content.toLowerCase())?a.push(r):i.push(r):(a.push(r),i.push(r)):v_(r)?i.push(r):a.push(r)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Vu=(e,t)=>ks(e)&&e.content.toLowerCase()==="onclick"?He(t,!0):e.type!==4?Zs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,y_=(e,t,s)=>Em(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=b_(i,a,s,e.loc);if(r.includes("right")&&(i=Vu(i,"onContextmenu")),r.includes("middle")&&(i=Vu(i,"onMouseup")),r.length&&(l=Vt(s.helper(Nm),[l,JSON.stringify(r)])),o.length&&(!ks(i)||$m(i.content.toLowerCase()))&&(l=Vt(s.helper(Dm),[l,JSON.stringify(o)])),c.length){const d=c.map(Ra).join("");i=ks(i)?He(`${i.content}${d}`,!0):Zs(["(",i,`) + "${d}"`])}return{props:[Mt(i,l)]}}),x_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(sa(62,a)),{props:[],needRuntime:s.helper(Mm)}},__=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},w_=[d_],k_={cloak:o_,html:p_,text:f_,model:h_,on:y_,show:x_};function S_(e,t={}){return l_(e,Ge({},c_,t,{nodeTransforms:[__,...w_,...t.nodeTransforms||[]],directiveTransforms:Ge({},k_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const qu=Object.create(null);function T_(e,t){if(!Ue(e))if(e.nodeType)e=e.innerHTML;else return Xt;const s=Hv(e,t),n=qu[s];if(n)return n;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const a=Ge({hoistStatic:!0,onError:void 0,onWarn:Xt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=o=>!!customElements.get(o));const{code:i}=S_(e,a),l=new Function("Vue",i)(Lx);return l._rc=!0,qu[s]=l}_h(T_);const Ao=aa({items:[]});let C_=1;function sr(e,t="info",s=3e3){const n=C_++;return Ao.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>_d(n),s),n}function _d(e){const t=Ao.items.findIndex(s=>s.id===e);t>=0&&Ao.items.splice(t,1)}function we(e,t="info",s=3e3){return sr(e,t,s)}we.success=(e,t=3e3)=>sr(e,"success",t);we.error=(e,t=5e3)=>sr(e,"error",t);we.info=(e,t=3e3)=>sr(e,"info",t);we.dismiss=_d;const E_={setup(){return{state:Ao,dismiss:_d}},template:`
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
  `},Sn=aa({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ii=null;function Kt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return ii&&ii(!1),Sn.title=e,Sn.message=t,Sn.confirmLabel=s,Sn.cancelLabel=n,Sn.danger=a,Sn.open=!0,new Promise(i=>{ii=i})}function Gu(e){Sn.open=!1,ii&&(ii(e),ii=null)}const A_={setup(){function e(t){Sn.open&&t.key==="Escape"&&(t.stopPropagation(),Gu(!1))}return je(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:Sn,settle:Gu}},template:`
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
 */const Ga=typeof document<"u";function Um(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function R_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Um(e.default)}const ot=Object.assign;function Sr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Qs(a)?a.map(e):e(a)}return s}const Ki=()=>{},Qs=Array.isArray;function Ku(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Bm=/#/g,I_=/&/g,O_=/\//g,L_=/=/g,N_=/\?/g,Hm=/\+/g,D_=/%5B/g,M_=/%5D/g,zm=/%5E/g,P_=/%60/g,jm=/%7B/g,F_=/%7C/g,Vm=/%7D/g,$_=/%20/g;function wd(e){return e==null?"":encodeURI(""+e).replace(F_,"|").replace(D_,"[").replace(M_,"]")}function U_(e){return wd(e).replace(jm,"{").replace(Vm,"}").replace(zm,"^")}function uc(e){return wd(e).replace(Hm,"%2B").replace($_,"+").replace(Bm,"%23").replace(I_,"%26").replace(P_,"`").replace(jm,"{").replace(Vm,"}").replace(zm,"^")}function B_(e){return uc(e).replace(L_,"%3D")}function H_(e){return wd(e).replace(Bm,"%23").replace(N_,"%3F")}function z_(e){return H_(e).replace(O_,"%2F")}function fl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const j_=/\/$/,V_=e=>e.replace(j_,"");function Tr(e,t,s="/"){let n,a={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(n=t.slice(0,r),i=t.slice(r,o>0?o:t.length),a=e(i.slice(1))),o>=0&&(n=n||t.slice(0,o),l=t.slice(o,t.length)),n=W_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:fl(l)}}function q_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Wu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function G_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&vi(t.matched[n],s.matched[a])&&qm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function vi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function qm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!K_(e[s],t[s]))return!1;return!0}function K_(e,t){return Qs(e)?Ju(e,t):Qs(t)?Ju(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Ju(e,t){return Qs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function W_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,o;for(l=0;l<n.length;l++)if(o=n[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Kn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let pc=(function(e){return e.pop="pop",e.push="push",e})({}),Cr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function J_(e){if(!e)if(Ga){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),V_(e)}const Z_=/^[^#]+#/;function Y_(e,t){return e.replace(Z_,"#")+t}function Q_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const nr=()=>({left:window.scrollX,top:window.scrollY});function X_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=Q_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Zu(e,t){return(history.state?history.state.position-t:-1)+e}const fc=new Map;function ew(e,t){fc.set(e,t)}function tw(e){const t=fc.get(e);return fc.delete(e),t}function sw(e){return typeof e=="string"||e&&typeof e=="object"}function Gm(e){return typeof e=="string"||typeof e=="symbol"}let Ct=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Km=Symbol("");Ct.MATCHER_NOT_FOUND+"",Ct.NAVIGATION_GUARD_REDIRECT+"",Ct.NAVIGATION_ABORTED+"",Ct.NAVIGATION_CANCELLED+"",Ct.NAVIGATION_DUPLICATED+"";function gi(e,t){return ot(new Error,{type:e,[Km]:!0},t)}function yn(e,t){return e instanceof Error&&Km in e&&(t==null||!!(e.type&t))}const nw=["params","query","hash"];function aw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of nw)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function iw(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Hm," "),i=a.indexOf("="),l=fl(i<0?a:a.slice(0,i)),o=i<0?null:fl(a.slice(i+1));if(l in t){let r=t[l];Qs(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Yu(e){let t="";for(let s in e){const n=e[s];if(s=B_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Qs(n)?n.map(a=>a&&uc(a)):[n&&uc(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function lw(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Qs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const ow=Symbol(""),Qu=Symbol(""),ar=Symbol(""),kd=Symbol(""),hc=Symbol("");function Ri(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Xn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(gi(Ct.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):sw(p)?r(gi(Ct.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Er(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Um(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Xn(c,s,n,l,o,a))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=R_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Xn(p,s,n,l,o,a)()}))}}return i}function rw(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>vi(c,o))?n.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>vi(c,r))||a.push(r))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let cw=()=>location.protocol+"//"+location.host;function Wm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,o=a.slice(l);return o[0]!=="/"&&(o="/"+o),Wu(o,"")}return Wu(s,e)+n+a}function dw(e,t,s,n){let a=[],i=[],l=null;const o=({state:p})=>{const f=Wm(e,location),m=s.value,v=t.value;let T=0;if(p){if(s.value=f,t.value=p,l&&l===m){l=null;return}T=v?p.position-v.position:0}else n(f);a.forEach(L=>{L(s.value,m,{delta:T,type:pc.pop,direction:T?T>0?Cr.forward:Cr.back:Cr.unknown})})};function r(){l=s.value}function c(p){a.push(p);const f=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(ot({},p.state,{scroll:nr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Xu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?nr():null}}function uw(e){const{history:t,location:s}=window,n={value:Wm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:cw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(r,c){i(r,ot({},t.state,Xu(a.value.back,r,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=r}function o(r,c){const d=ot({},a.value,t.state,{forward:r,scroll:nr()});i(d.current,d,!0),i(r,ot({},Xu(n.value,r,null),{position:d.position+1},c),!1),n.value=r}return{location:n,state:a,push:o,replace:l}}function pw(e){e=J_(e);const t=uw(e),s=dw(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=ot({location:"",base:e,go:n,createHref:Y_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function fw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),pw(e)}let ga=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var zt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(zt||{});const hw={type:ga.Static,value:""},mw=/[a-zA-Z0-9_]/;function vw(e){if(!e)return[[]];if(e==="/")return[[hw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=zt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===zt.Static?i.push({type:ga.Static,value:c}):s===zt.Param||s===zt.ParamRegExp||s===zt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:ga.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==zt.ParamRegExp){n=s,s=zt.EscapeNext;continue}switch(s){case zt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=zt.Param):p();break;case zt.EscapeNext:p(),s=n;break;case zt.Param:r==="("?s=zt.ParamRegExp:mw.test(r)?p():(u(),s=zt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case zt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=zt.ParamRegExpEnd:d+=r;break;case zt.ParamRegExpEnd:u(),s=zt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===zt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const ep="[^/]+?",gw={sensitive:!1,strict:!1,start:!0,end:!0};var ds=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ds||{});const bw=/[.+*?^${}()[\]/\\]/g;function yw(e,t){const s=ot({},gw,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ds.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=ds.Segment+(s.sensitive?ds.BonusCaseSensitive:0);if(p.type===ga.Static)u||(a+="/"),a+=p.value.replace(bw,"\\$&"),f+=ds.Static;else if(p.type===ga.Param){const{value:m,repeatable:v,optional:T,regexp:L}=p;i.push({name:m,repeatable:v,optional:T});const y=L||ep;if(y!==ep){f+=ds.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let g=v?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=T&&c.length<2?`(?:/${g})`:"/"+g),T&&(g+="?"),a+=g,f+=ds.Dynamic,T&&(f+=ds.BonusOptional),v&&(f+=ds.BonusRepeatable),y===".*"&&(f+=ds.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=ds.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",m=i[p-1];u[m.name]=f&&m.repeatable?f.split("/"):f}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===ga.Static)d+=f.value;else if(f.type===ga.Param){const{value:m,repeatable:v,optional:T}=f,L=m in c?c[m]:"";if(Qs(L)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Qs(L)?L.join("/"):L;if(!y)if(T)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:o,stringify:r}}function xw(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===ds.Static+ds.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ds.Static+ds.Segment?1:-1:0}function Jm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=xw(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(tp(n))return 1;if(tp(a))return-1}return a.length-n.length}function tp(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const _w={strict:!1,end:!0,sensitive:!1};function ww(e,t,s){const n=yw(vw(e.path),s),a=ot(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function kw(e,t){const s=[],n=new Map;t=Ku(_w,t);function a(u){return n.get(u)}function i(u,p,f){const m=!f,v=np(u);v.aliasOf=f&&f.record;const T=Ku(t,u),L=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const A of b)L.push(np(ot({},v,{components:f?f.record.components:v.components,path:A,aliasOf:f?f.record:v})))}let y,g;for(const b of L){const{path:A}=b;if(p&&A[0]!=="/"){const _=p.record.path,I=_[_.length-1]==="/"?"":"/";b.path=p.record.path+(A&&I+A)}if(y=ww(b,p,T),f?f.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),m&&u.name&&!ap(y)&&l(u.name)),Zm(y)&&r(y),v.children){const _=v.children;for(let I=0;I<_.length;I++)i(_[I],y,f&&f.children[I])}f=f||y}return g?()=>{l(g)}:Ki}function l(u){if(Gm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=Cw(u,s);s.splice(p,0,u),u.record.name&&!ap(u)&&n.set(u.record.name,u)}function c(u,p){let f,m={},v,T;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw gi(Ct.MATCHER_NOT_FOUND,{location:u});T=f.record.name,m=ot(sp(p.params,f.keys.filter(g=>!g.optional).concat(f.parent?f.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&sp(u.params,f.keys.map(g=>g.name))),v=f.stringify(m)}else if(u.path!=null)v=u.path,f=s.find(g=>g.re.test(v)),f&&(m=f.parse(v),T=f.record.name);else{if(f=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!f)throw gi(Ct.MATCHER_NOT_FOUND,{location:u,currentLocation:p});T=f.record.name,m=ot({},p.params,u.params),v=f.stringify(m)}const L=[];let y=f;for(;y;)L.unshift(y.record),y=y.parent;return{name:T,path:v,params:m,matched:L,meta:Tw(L)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:a}}function sp(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function np(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Sw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Sw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function ap(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Tw(e){return e.reduce((t,s)=>ot(t,s.meta),{})}function Cw(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Jm(e,t[i])<0?n=i:s=i+1}const a=Ew(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function Ew(e){let t=e;for(;t=t.parent;)if(Zm(t)&&Jm(e,t)===0)return t}function Zm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function ip(e){const t=zs(ar),s=zs(kd),n=G(()=>{const r=dn(e.to);return t.resolve(r)}),a=G(()=>{const{matched:r}=n.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(vi.bind(null,d));if(p>-1)return p;const f=lp(r[c-2]);return c>1&&lp(d)===f&&u[u.length-1].path!==f?u.findIndex(vi.bind(null,r[c-2])):p}),i=G(()=>a.value>-1&&Lw(s.params,n.value.params)),l=G(()=>a.value>-1&&a.value===s.matched.length-1&&qm(s.params,n.value.params));function o(r={}){if(Ow(r)){const c=t[dn(e.replace)?"replace":"push"](dn(e.to)).catch(Ki);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:G(()=>n.value.href),isActive:i,isExactActive:l,navigate:o}}function Aw(e){return e.length===1?e[0]:e}const Rw=_l({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:ip,setup(e,{slots:t}){const s=aa(ip(e)),{options:n}=zs(ar),a=G(()=>({[op(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[op(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Aw(t.default(s));return e.custom?i:ci("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),Iw=Rw;function Ow(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Lw(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Qs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function lp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const op=(e,t,s)=>e??t??s,Nw=_l({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=zs(hc),a=G(()=>e.route||n.value),i=zs(Qu,0),l=G(()=>{let c=dn(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=G(()=>a.value.matched[l.value]);zi(Qu,G(()=>l.value+1)),zi(ow,o),zi(hc,a);const r=h();return Ft(()=>[r.value,o.value,e.name],([c,d,u],[p,f,m])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!vi(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return rp(s.default,{Component:p,route:c});const f=u.props[d],m=f?f===!0?c.params:typeof f=="function"?f(c):f:null,T=ci(p,ot({},m,t,{onVnodeUnmounted:L=>{L.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return rp(s.default,{Component:T,route:c})||T}}});function rp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Dw=Nw;function Mw(e){const t=kw(e.routes,e),s=e.parseQuery||iw,n=e.stringifyQuery||Yu,a=e.history,i=Ri(),l=Ri(),o=Ri(),r=Nc(Kn);let c=Kn;Ga&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Sr.bind(null,se=>""+se),u=Sr.bind(null,z_),p=Sr.bind(null,fl);function f(se,ge){let q,de;return Gm(se)?(q=t.getRecordMatcher(se),de=ge):de=se,t.addRoute(de,q)}function m(se){const ge=t.getRecordMatcher(se);ge&&t.removeRoute(ge)}function v(){return t.getRoutes().map(se=>se.record)}function T(se){return!!t.getRecordMatcher(se)}function L(se,ge){if(ge=ot({},ge||r.value),typeof se=="string"){const P=Tr(s,se,ge.path),j=t.resolve({path:P.path},ge),ce=a.createHref(P.fullPath);return ot(P,j,{params:p(j.params),hash:fl(P.hash),redirectedFrom:void 0,href:ce})}let q;if(se.path!=null)q=ot({},se,{path:Tr(s,se.path,ge.path).path});else{const P=ot({},se.params);for(const j in P)P[j]==null&&delete P[j];q=ot({},se,{params:u(P)}),ge.params=u(ge.params)}const de=t.resolve(q,ge),he=se.hash||"";de.params=d(p(de.params));const Oe=q_(n,ot({},se,{hash:U_(he),path:de.path})),w=a.createHref(Oe);return ot({fullPath:Oe,hash:he,query:n===Yu?lw(se.query):se.query||{}},de,{redirectedFrom:void 0,href:w})}function y(se){return typeof se=="string"?Tr(s,se,r.value.path):ot({},se)}function g(se,ge){if(c!==se)return gi(Ct.NAVIGATION_CANCELLED,{from:ge,to:se})}function b(se){return I(se)}function A(se){return b(ot(y(se),{replace:!0}))}function _(se,ge){const q=se.matched[se.matched.length-1];if(q&&q.redirect){const{redirect:de}=q;let he=typeof de=="function"?de(se,ge):de;return typeof he=="string"&&(he=he.includes("?")||he.includes("#")?he=y(he):{path:he},he.params={}),ot({query:se.query,hash:se.hash,params:he.path!=null?{}:se.params},he)}}function I(se,ge){const q=c=L(se),de=r.value,he=se.state,Oe=se.force,w=se.replace===!0,P=_(q,de);if(P)return I(ot(y(P),{state:typeof P=="object"?ot({},he,P.state):he,force:Oe,replace:w}),ge||q);const j=q;j.redirectedFrom=ge;let ce;return!Oe&&G_(n,de,q)&&(ce=gi(Ct.NAVIGATION_DUPLICATED,{to:j,from:de}),W(de,de,!0,!1)),(ce?Promise.resolve(ce):N(j,de)).catch(ae=>yn(ae)?yn(ae,Ct.NAVIGATION_GUARD_REDIRECT)?ae:Z(ae):O(ae,j,de)).then(ae=>{if(ae){if(yn(ae,Ct.NAVIGATION_GUARD_REDIRECT))return I(ot({replace:w},y(ae.to),{state:typeof ae.to=="object"?ot({},he,ae.to.state):he,force:Oe}),ge||j)}else ae=k(j,de,!0,w,he);return $(j,de,ae),ae})}function E(se,ge){const q=g(se,ge);return q?Promise.reject(q):Promise.resolve()}function x(se){const ge=Q.values().next().value;return ge&&typeof ge.runWithContext=="function"?ge.runWithContext(se):se()}function N(se,ge){let q;const[de,he,Oe]=rw(se,ge);q=Er(de.reverse(),"beforeRouteLeave",se,ge);for(const P of de)P.leaveGuards.forEach(j=>{q.push(Xn(j,se,ge))});const w=E.bind(null,se,ge);return q.push(w),Ie(q).then(()=>{q=[];for(const P of i.list())q.push(Xn(P,se,ge));return q.push(w),Ie(q)}).then(()=>{q=Er(he,"beforeRouteUpdate",se,ge);for(const P of he)P.updateGuards.forEach(j=>{q.push(Xn(j,se,ge))});return q.push(w),Ie(q)}).then(()=>{q=[];for(const P of Oe)if(P.beforeEnter)if(Qs(P.beforeEnter))for(const j of P.beforeEnter)q.push(Xn(j,se,ge));else q.push(Xn(P.beforeEnter,se,ge));return q.push(w),Ie(q)}).then(()=>(se.matched.forEach(P=>P.enterCallbacks={}),q=Er(Oe,"beforeRouteEnter",se,ge,x),q.push(w),Ie(q))).then(()=>{q=[];for(const P of l.list())q.push(Xn(P,se,ge));return q.push(w),Ie(q)}).catch(P=>yn(P,Ct.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function $(se,ge,q){o.list().forEach(de=>x(()=>de(se,ge,q)))}function k(se,ge,q,de,he){const Oe=g(se,ge);if(Oe)return Oe;const w=ge===Kn,P=Ga?history.state:{};q&&(de||w?a.replace(se.fullPath,ot({scroll:w&&P&&P.scroll},he)):a.push(se.fullPath,he)),r.value=se,W(se,ge,q,w),Z()}let M;function H(){M||(M=a.listen((se,ge,q)=>{if(!ue.listening)return;const de=L(se),he=_(de,ue.currentRoute.value);if(he){I(ot(he,{replace:!0,force:!0}),de).catch(Ki);return}c=de;const Oe=r.value;Ga&&ew(Zu(Oe.fullPath,q.delta),nr()),N(de,Oe).catch(w=>yn(w,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_CANCELLED)?w:yn(w,Ct.NAVIGATION_GUARD_REDIRECT)?(I(ot(y(w.to),{force:!0}),de).then(P=>{yn(P,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_DUPLICATED)&&!q.delta&&q.type===pc.pop&&a.go(-1,!1)}).catch(Ki),Promise.reject()):(q.delta&&a.go(-q.delta,!1),O(w,de,Oe))).then(w=>{w=w||k(de,Oe,!1),w&&(q.delta&&!yn(w,Ct.NAVIGATION_CANCELLED)?a.go(-q.delta,!1):q.type===pc.pop&&yn(w,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),$(de,Oe,w)}).catch(Ki)}))}let K=Ri(),C=Ri(),S;function O(se,ge,q){Z(se);const de=C.list();return de.length?de.forEach(he=>he(se,ge,q)):console.error(se),Promise.reject(se)}function U(){return S&&r.value!==Kn?Promise.resolve():new Promise((se,ge)=>{K.add([se,ge])})}function Z(se){return S||(S=!se,H(),K.list().forEach(([ge,q])=>se?q(se):ge()),K.reset()),se}function W(se,ge,q,de){const{scrollBehavior:he}=e;if(!Ga||!he)return Promise.resolve();const Oe=!q&&tw(Zu(se.fullPath,0))||(de||!q)&&history.state&&history.state.scroll||null;return It().then(()=>he(se,ge,Oe)).then(w=>w&&X_(w)).catch(w=>O(w,se,ge))}const te=se=>a.go(se);let re;const Q=new Set,ue={currentRoute:r,listening:!0,addRoute:f,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:T,getRoutes:v,resolve:L,options:e,push:b,replace:A,go:te,back:()=>te(-1),forward:()=>te(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:C.add,isReady:U,install(se){se.component("RouterLink",Iw),se.component("RouterView",Dw),se.config.globalProperties.$router=ue,Object.defineProperty(se.config.globalProperties,"$route",{enumerable:!0,get:()=>dn(r)}),Ga&&!re&&r.value===Kn&&(re=!0,b(a.location).catch(de=>{}));const ge={};for(const de in Kn)Object.defineProperty(ge,de,{get:()=>r.value[de],enumerable:!0});se.provide(ar,ue),se.provide(kd,Lc(ge)),se.provide(hc,r);const q=se.unmount;Q.add(se),se.unmount=function(){Q.delete(se),Q.size<1&&(c=Kn,M&&M(),M=null,r.value=Kn,re=!1,S=!1),q()}}};function Ie(se){return se.reduce((ge,q)=>ge.then(()=>x(q)),Promise.resolve())}return ue}function Ym(){return zs(ar)}function Pw(e){return zs(kd)}const ir={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Pw(),s=Ym(),n=G({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),a=G(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.component)||null}),i=G(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.label)||""});Ft(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},hl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),fn=e=>Number.isSafeInteger(e)&&e>=0,Fw=e=>e===null||typeof e=="string",Ro=(e,t)=>fn(e)&&fn(t)&&t>=e,Sd=e=>hl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&Fw(e.cursor);function $w(e){return!Sd(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!fn(e.total_chars)||!fn(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!Ro(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&Ro(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function cp(e){return Sd(e)&&e.kind==="process_output"&&fn(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>fn(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&Ro(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Uw(e){return Sd(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>fn(e[t]))&&Ro(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&fn(e.tools_omitted)}function mc(e){try{return JSON.parse(e)}catch{return}}const vc=e=>JSON.stringify(e,null,2),Bw=e=>{const t=mc(e);return t===void 0?e:vc(t)},Hl=(e,t,s)=>`[${e}, ${t}) ${s}`;function Qm(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:vc(e)??"";let n=typeof e=="string"?mc(e):e,a=null;if(typeof e=="string"&&n===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=mc(e.slice(d+c.length)),f=e.slice(0,u);cp(p)&&!("text"in p)&&f.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(n=p,a=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?Bw(d):d});if(hl(n)&&n.kind==="audit_preview"&&n.audit_clipped===!0&&(!("original_chars"in n)||fn(n.original_chars))&&(!("preview"in n)||typeof n.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...fn(n.original_chars)?[`original ${n.original_chars} code points`]:[]],hl(n.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof n.source[c])&&i.header.push(`source ${c}: ${n.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:n.preview??(t?"(no preview retained in audit)":"")}),i.metadata=n,i}if($w(n))i.kind="tool_output",i.header=[n.status,`retention: ${n.retention}`],n.retention==="retained"?(i.header.push(`${n.total_bytes} UTF-8 bytes`,`${n.total_chars} code points`),i.sections.push(l(`${"head"in n?"Head":"Page"} ${Hl(n.start,n.end,"code points")}`,n.head??n.text)),(o=n.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Hl(n.tail.start,n.tail.end,"code points")} — not a continuation`,n.tail.text))):(i.header.push(n.error),i.sections.push(l("Head — retention failed",n.head),l("Tail context only — may overlap head",n.tail.text))),typeof((r=n.matches)==null?void 0:r.summary)=="string"&&i.header.push(n.matches.summary);else if(cp(n)&&(typeof n.text=="string"||a!==null)){i.kind="process_output",i.header=[n.status,`PID ${n.pid}`,...n.exit_code!==null?[`exit ${n.exit_code}`]:[],`emitted ${n.emitted_bytes} B`,`retained ${n.retained_bytes} B`,`shown ${n.shown_bytes} B`,`capture-limit loss ${n.capture_limit_loss_bytes} B`,`not retained ${n.not_retained_bytes} B`],n.capture_error&&i.header.push(`capture error: ${n.capture_error}`),n.tail_status&&i.header.push(`recent output: ${n.tail_status}`);const c=n.shown_intervals.map(d=>Hl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${a!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,a??n.text))}else if(Uw(n))i.kind="agent_result",i.header=[n.status,`agent ${n.id}`,n.label,`original ${n.original_bytes} B`,`result ${n.result_bytes} B`,`error ${n.error_bytes} B`,`source ${n.source_original_bytes} B`,`tools ${n.tools_used.length} shown / ${n.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Hl(n.offset,n.end,"UTF-8 bytes")}`,n.preview));else return i.kind=n===void 0?"text":"json",i.sections.push({label:"",text:n===void 0||!t&&typeof e=="string"?s:t?vc(n):JSON.stringify(n)}),i;if(i.metadata=n,i.header.push(`source truncated: ${n.truncated?"yes":"no"}`,`cursor: ${n.cursor?"present":"none"}`),typeof n.expires_at=="string"&&i.header.push(`expires: ${n.expires_at}`),typeof n.expires_at=="number"){const c=new Date(n.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function Xm(e,t=30,s=6e3){let n=1,a=0,i=0;if(t>0&&s>0)for(const l of e){if(a>=s||l===`
`&&n>=t)break;l===`
`&&n++,a++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:a,lines:n}}const Ar=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Hw=e=>e!==null&&typeof e=="object",zw=new Set(["_hmac","_prev_hmac"]),gc=e=>e.replace(/\r\n?/g,`
`);function ml(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const n=JSON.parse(t,(a,i)=>{if(zw.has(a)){s=!0;return}return i});return gc(s?JSON.stringify(n):t)}catch{return gc(t)}}function jw(e){const t=e.metadata;if(!t)return[];const s=[],n=e.kind==="audit_preview"&&Hw(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),n.truncated===!0&&s.push("source truncated"),n.retention==="failed"&&s.push("retention unavailable"),n.capture_error&&s.push(`capture unavailable: ${n.capture_error}`),n.capture_limit_loss_bytes>0&&s.push(`capture loss ${n.capture_limit_loss_bytes} B`),n.not_retained_bytes>0&&s.push(`not retained ${n.not_retained_bytes} B`),n.capture_lost_bytes>0&&s.push(`capture lost ${n.capture_lost_bytes} B`),n.dropped_bytes>0&&s.push(`dropped ${n.dropped_bytes} B`),(n.capture_loss===!0||n.output_lost===!0||n.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(n.exit_code)&&n.exit_code!==0&&s.push(`process exit ${n.exit_code}`),["failed","error","cancelled","timed_out"].includes(n.status)&&s.push(`source ${n.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function Vw(e){var f;const t=Qm(typeof e=="string"?gc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:ml(m.text)})),n=s.map(m=>m.text).filter(Boolean).join(`
`),a=n.replace(/\n$/,""),i=[...n].length,l=a?a.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Ar.inlineChars||o&&a.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=Xm(c,Ar.previewLines,Ar.previewChars),u=t.kind==="audit_preview"?(f=t.metadata)==null?void 0:f.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:a.replace(/\n/g," "),warnings:jw(t)}}const qw={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=h(!1),s=h(!0),n=h(!1),a=h(""),i=h(null),l=h(null),o=h(!1),r=G(()=>Vw(e.value)),c=G(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=G(()=>n.value?c.value:r.value.formatted),u=G(()=>r.value.promoted&&r.value.preview.folded||o.value),p=G(()=>t.value?!!d.value:r.value.promoted),f=G(()=>p.value?"":r.value.summary);let m;function v(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function T(){m==null||m.disconnect();for(const b of[i.value,l.value])b&&(m==null||m.observe(b));v()}function L(){t.value=!t.value,t.value||(n.value=!1)}function y(){n.value=!n.value,t.value=!0,a.value=""}async function g(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(a.value="Copied")}catch{b===e.value&&(a.value="Copy unavailable — select text manually")}}return Ft([()=>e.value,()=>e.rawValue,()=>e.recordId],(b,A)=>{(e.recordId===null||b[2]!==A[2])&&(t.value=!1,n.value=!1),a.value=""}),Ft([i,l,t,s,r],()=>It(T),{flush:"post"}),je(()=>{m=new ResizeObserver(v),T()}),ft(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:n,copyStatus:a,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:f,toggleExpanded:L,toggleRaw:y,copyOutput:g}},template:`
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
    </section>`},lr={name:"ToolOutput",components:{CompactOutput:qw},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=h(!1),s=h(!0),n=h(!1),a=h(""),i=G(()=>Qm(e.value)),l=G(()=>n.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=G(()=>{let u=30,p=6e3;return l.value.map(f=>{const m=Xm(f.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...f,display:t.value?f.text:m.text,folded:m.folded}})}),r=G(()=>o.value.some(u=>u.folded)),c=G(()=>n.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(a.value="Copied")}catch{e.value===u&&(a.value="Copy unavailable — select text manually")}}return Ft(()=>e.value,()=>{t.value=!1,a.value=""}),Ft(n,()=>{t.value=!1,a.value=""}),{expanded:t,wrapped:s,rawMode:n,copyStatus:a,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},Gw={components:{ToolOutput:lr},setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var v,T,L,y,g,b,A,_,I,E,x;const f=p.payload||p,m=f.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(f.agent_id||(v=f.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(f.call_id||(T=f.metadata)!=null&&T.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const N=f.call_id||((L=f.metadata)==null?void 0:L.call_id)||null,$=f.agent_id||((y=f.metadata)==null?void 0:y.agent_id)||"",k={callId:N,agentId:$,agentLabel:f.agent_label||((g=f.metadata)==null?void 0:g.agent_label)||"",toolInput:f.tool_input,id:N?`${$}:${N}`:`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:f.iteration??((b=f.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(k);return}if(m==="tool_end"||m==="loop_tool"){const N=f.call_id||((A=f.metadata)==null?void 0:A.call_id)||null,$=f.agent_id||((_=f.metadata)==null?void 0:_.agent_id)||"";let k=-1;if(N&&(k=e.value.findIndex(M=>M.callId===N&&M.agentId===$&&M.status==="running")),k<0&&!N)for(let M=e.value.length-1;M>=0;M--){const H=e.value[M];if(H.tool===f.action&&H.agentId===$&&H.status==="running"){k=M;break}}if(k>=0){const M=e.value[k];M.status=f.error||(I=f.metadata)!=null&&I.error||["error","failed","cancelled","denied","outcome_unknown"].includes(f.status||((E=f.metadata)==null?void 0:E.status))?"error":"success",M.elapsed=f.execution_time_ms??f.duration_ms??((x=f.metadata)==null?void 0:x.elapsed_ms)??Date.now()-M.startTime,M.result=f.result_summary??f.detail??"",M.fadingOut=!0,setTimeout(()=>{const H=e.value.indexOf(M);H>=0&&e.value.splice(H,1),t.value.unshift(M),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const N=f.call_id||f.tool_name||"unknown";if(f.finished){const $={...s.value};delete $[N],s.value=$}else{const k=((s.value[N]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[N]:k.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let o=!1;function r(){o||(o=!0,Xe.on("events",a),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,Xe.off("events",a),i&&(clearInterval(i),i=null))}je(r),es(r),Wt(c),ft(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Td(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Oa(e){const t=Td(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Kw(e){const t=Td(e);return t?t.toLocaleTimeString():"—"}function ev(e){const t=Td(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Ww(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function bi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Cd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function tv(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function dp(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Ed(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function sv(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const nv=Symbol("agent-detail-cancelled"),Jw=15e3;function Zw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((f,m)=>{r=f,c=m});function u(f,m){o||(o=!0,l!==null&&a(l),l=null,(f?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return o||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!o&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,nv),i==null||i.abort()}}}function av({state:e,requestDetail:t,timeoutMs:s=Jw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:f,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const T=Zw(L=>t(p,{signal:L}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=T.cancel,v.promise=(async()=>{let L=null,y=null;try{L=await T.promise}catch(g){y=g}L!==nv&&(l!==v||e.detailId!==p||(l=null,!y&&(L===null||typeof L!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=L,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Yw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&n())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const Qw={components:{ToolOutput:lr},template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const o=G(()=>e.value.filter(O=>O.status==="running").length),r=G(()=>e.value.filter(O=>O.status==="completed").length),c=G(()=>e.value.filter(O=>["failed","timeout","killed"].includes(O.status)).length),d=G(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=G(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(O=>["failed","timeout","killed"].includes(O.status)):e.value.filter(O=>O.status===i.value));function p(O){const U=Number(O.max_iterations)||0;return U<=0?0:Math.min(100,Math.round(O.iteration_count/U*100))}function f(O){return(Number(O.max_iterations)||0)>0}function m(O,U){return O?O==="N/A"?"N/A":U==="current_inheritance"?`inherit (currently ${O})`:O:"unknown"}function v(O){return m(O.display_model,O.display_model_source||O.display_source)}function T(O){return m(O.display_reasoning_effort,O.display_reasoning_effort_source||O.display_source)}function L(O){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[O]||""}const y=h(null),g=h(null),b=h(!1),A=h(null),_=h(""),E=av({state:{get detail(){return y.value},set detail(O){y.value=O},get detailId(){return g.value},set detailId(O){g.value=O},get detailLoading(){return b.value},set detailLoading(O){b.value=O},get detailError(){return A.value},set detailError(O){A.value=O}},requestDetail:(O,{signal:U})=>B.get(`/api/agents/${encodeURIComponent(O)}`,{signal:U})});async function x(O){_.value="",await E.open(O.id)}function N(){E.close(),_.value=""}async function $(){await E.refresh()}async function k(O,U){try{await navigator.clipboard.writeText(U||""),_.value=O,setTimeout(()=>{_.value===O&&(_.value="")},1500)}catch{we.error("Copy failed")}}async function M(O=!1){O=O===!0,O||(t.value=!0);try{const U=await B.get("/api/agents");e.value=Array.isArray(U)?U:[],s.value=null}catch(U){O||(s.value=U.message)}O||(t.value=!1)}async function H(O){const U=e.value.find(W=>W.id===O);if(await Kt({title:"Kill agent",message:`Kill agent "${(U==null?void 0:U.label)||O}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=O;try{await B.del(`/api/agents/${encodeURIComponent(O)}`),we.success("Agent killed"),await M()}catch(W){we.error(W.message||"Failed to kill agent")}n.value=null}}const K=Yw({isEnabled:()=>a.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!g.value,refreshDetail:$});function C(){K.start()}function S(){K.stop()}return Ft(a,()=>K.sync()),je(()=>{l=!0,M(),C()}),es(()=>{l=!0,M(!0),C()}),Wt(()=>{l=!1,S()}),ft(()=>{l=!1,S(),E.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Oa,formatDuration:bi,progressPercent:p,hasProgress:f,displayModelText:v,displayEffortText:T,displaySourceLabel:L,detail:y,detailId:g,detailLoading:b,detailError:A,copied:_,openDetail:x,closeDetail:N,copyText:k,fetchAgents:M,killAgent:H,startAutoRefresh:C,stopAutoRefresh:S}}},Xw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),o=h(null),r=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let m=!1;const T=av({state:{get detail(){return c.value},set detail(S){c.value=S},get detailId(){return d.value},set detailId(S){d.value=S},get detailLoading(){return u.value},set detailLoading(S){u.value=S},get detailError(){return p.value},set detailError(S){p.value=S}},detailLabel:"Loop detail",requestDetail:(S,{signal:O})=>B.get(`/api/loops/${encodeURIComponent(S)}?limit=100`,{signal:O})});async function L(S){f.value="",await T.open(S.id)}function y(){T.close(),f.value=""}async function g(S,O){try{await navigator.clipboard.writeText(O||""),f.value=S,setTimeout(()=>{f.value===S&&(f.value="")},1500)}catch{we.error("Copy failed")}}const b=G(()=>e.value.reduce((S,O)=>S+(O.iteration_count||0),0)),A=G(()=>e.value.filter(S=>S.status==="running").length);function _(S){return S==="running"?"loop-status-running":S==="error"?"loop-status-error":"loop-status-stopped"}function I(S){return S==="running"?"badge-success":S==="error"?"badge-danger":S==="completed"?"badge-info":"badge-warning"}function E(S){return S==="act"?"badge-warning":S==="silent"?"badge-info":"badge-success"}async function x(S=!1){S=S===!0,S||(t.value=!0);try{const O=await B.get("/api/loops");e.value=Array.isArray(O)?O:[],s.value=null}catch(O){S||(s.value=O.message)}S||(t.value=!1)}async function N(){l.value=null;const S=a.value;if(!S.goal.trim()){l.value="Goal is required";return}if(!S.channel_id.trim()){l.value="Channel ID is required";return}const O={goal:S.goal.trim(),channel_id:S.channel_id.trim(),interval_seconds:S.interval_seconds||60,mode:S.mode,max_iterations:S.max_iterations||50};S.stop_condition.trim()&&(O.stop_condition=S.stop_condition.trim()),i.value=!0;try{const U=await B.post("/api/loops",O);we.success(`Loop started: ${U.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await x()}catch(U){l.value=U.message}i.value=!1}async function $(S){if(await Kt({title:"Stop loop",message:`Stop loop ${S}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=S;try{await B.del(`/api/loops/${encodeURIComponent(S)}`),we.success("Loop stopped"),await x()}catch(U){we.error(U.message||"Failed to stop loop")}o.value=null}}async function k(S){r.value=S;try{await B.post(`/api/loops/${encodeURIComponent(S)}/restart`),we.success("Loop restarted"),await x()}catch(O){we.error(O.message||"Failed to restart loop")}r.value=null}function M(S){m&&S.payload&&(S.payload.loop_id||S.payload.type==="loop")&&(x(!0),d.value&&T.refresh())}let H=null;function K(){H!==null&&clearInterval(H),H=null}function C(){K(),m&&(H=setInterval(()=>{x(!0),d.value&&T.refresh()},5e3))}return je(()=>{m=!0,x(),Xe.subscribe("events",M),C()}),es(()=>{m=!0,x(!0),C()}),Wt(()=>{m=!1,K()}),ft(()=>{m=!1,Xe.unsubscribe("events",M),K(),T.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:b,runningCount:A,statusDotClass:_,statusBadge:I,modeBadge:E,formatAge:ev,formatDuration:bi,formatTs:Oa,formatTokens:sv,openDetail:L,closeDetail:y,copyText:g,fetchLoops:x,doCreate:N,doStop:$,doRestart:k}}},ek={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=G(()=>e.value.filter(y=>y.status==="running").length),o=G(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await B.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}Ft(n,y=>{y?u():p()});async function f(y){if(await Kt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await B.del(`/api/processes/${y}`),we.success(`Process ${y} killed`),await d()}catch(b){we.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let v=!1;function T(){v||(v=!0,d(),Xe.subscribe("events",m),u())}function L(){v&&(v=!1,Xe.unsubscribe("events",m),p())}return je(T),es(T),Wt(L),ft(L),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:bi,fetchProcesses:d,doKill:f}}},tk=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function up(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function sk(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function nk(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function ak(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=tk.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),m=[];for(const T of new Set([p,f])){const L=new Date(u+T*6e4);sk(L,c)===d&&(m.some(y=>y.getTime()===L.getTime())||m.push(L))}if(m.sort((T,L)=>T.getTime()-L.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(T=>({instant:T,offset:nk(T),iso:T.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const ik={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),o=h(null),r=G(()=>ak(a.value.run_at));Ft(()=>a.value.run_at,()=>{o.value=null});const c=G(()=>{var de;const q=r.value;return q.state==="ok"?q.instant:q.state==="ambiguous"&&o.value!==null&&((de=q.options[o.value])==null?void 0:de.instant)||null}),d=G(()=>{const q=c.value;return q?`${q.toLocaleString()} local — ${q.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=h(null),v=h(null),T=h(null),L=h(null),y=h(null),g=h(null),b=h([]),A=h(!1),_=h("");let I=0;const E=G(()=>e.value.filter(q=>q.cron&&!q.one_time).length),x=G(()=>e.value.filter(q=>q.one_time).length),N=G(()=>e.value.filter(q=>q.trigger).length),$=G(()=>e.value.filter(q=>q.paused).length),k=G(()=>e.value.filter(q=>q.consecutive_failures>0).length);function M(q){if(!q)return"-";const de=Date.now(),Oe=(new Date(q).getTime()-de)/1e3;if(Oe<0)return"overdue";if(Oe<60)return"in < 1 min";if(Oe<3600)return`in ${Math.floor(Oe/60)} min`;if(Oe<86400){const P=Math.floor(Oe/3600),j=Math.floor(Oe%3600/60);return j>0?`in ${P}h ${j}m`:`in ${P}h`}const w=Math.floor(Oe/86400);return`in ${w} day${w!==1?"s":""}`}function H(q){return q==null?"-":q<1e3?`${q}ms`:q<6e4?`${(q/1e3).toFixed(1)}s`:bi(q/1e3)}function K(q=a.value.cron){a.value.cron=q,up(a.value,"cron"),u.value=null}function C(q=a.value.run_at){a.value.run_at=q,up(a.value,"run_at"),u.value=null}async function S(){const q=a.value.cron.trim();if(q){p.value=!0;try{u.value=await B.post("/api/schedules/validate-cron",{expression:q})}catch(de){u.value={valid:!1,error:de.message}}p.value=!1}}async function O(){t.value=!0,s.value=null;try{e.value=await B.get("/api/schedules")}catch(q){s.value=q.message}t.value=!1}async function U(q){if(g.value===q){g.value=null,b.value=[];return}g.value=q,A.value=!0,b.value=[];const de=++I;try{const he=await B.get(`/api/schedules/${encodeURIComponent(q)}/history?limit=10`);if(de!==I||g.value!==q)return;b.value=he,_.value=""}catch(he){if(de!==I||g.value!==q)return;b.value=[],_.value=he.message||"Failed to load execution history"}de===I&&(A.value=!1)}async function Z(){l.value=null;const q=a.value;if(!q.description.trim()){l.value="Description is required";return}if(!q.channel_id.trim()){l.value="Channel ID is required";return}if(!q.cron.trim()&&!q.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(q.cron.trim()&&q.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const de={description:q.description.trim(),action:q.action,channel_id:q.channel_id.trim()};if(q.cron.trim()&&(de.cron=q.cron.trim()),q.run_at.trim()){const he=r.value;if(he.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(he.state==="invalid"){l.value="One-time run time is not a valid date";return}const Oe=c.value;if(he.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Oe){l.value="One-time run time could not be resolved";return}de.run_at=Oe.toISOString()}if(q.action==="reminder"&&q.message.trim()&&(de.message=q.message.trim()),q.action==="check"&&(q.tool_name.trim()&&(de.tool_name=q.tool_name.trim()),q.report_format&&(de.report_format=q.report_format),q.tool_input_str.trim()))try{de.tool_input=JSON.parse(q.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await B.post("/api/schedules",de),we.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await O()}catch(he){l.value=he.message}i.value=!1}async function W(q){m.value=q;try{const de=await B.post(`/api/schedules/${encodeURIComponent(q)}/run`);if(de.status==="failure")we.error(`Execution failed: ${de.error||"unknown error"}`);else{const he=de.warning?`Executed (${de.warning})`:"Executed successfully";we.success(he)}await O()}catch(de){we.error(de.message||"Failed to trigger")}m.value=null}async function te(q){T.value=q.id;const de=!q.paused;try{await B.put(`/api/schedules/${encodeURIComponent(q.id)}`,{paused:de}),we.success(de?"Schedule paused":"Schedule resumed"),await O()}catch(he){we.error(he.message||"Failed to update schedule")}T.value=null}const re=new Map;function Q(q,de){const he=re.get(q.id);he&&clearTimeout(he.timer);const Oe={run:()=>ue(q,de),timer:null};Oe.timer=setTimeout(()=>{re.delete(q.id),Oe.run()},500),re.set(q.id,Oe)}async function ue(q,de){y.value=q.id;try{await B.put(`/api/schedules/${encodeURIComponent(q.id)}`,{report_format:de}),we.success(de?"Structured report enabled":"Plain-text report enabled")}catch(he){we.error(`Update failed: ${he.message}`)}finally{await O(),y.value=null}}function Ie(){for(const[q,de]of[...re])clearTimeout(de.timer),re.delete(q),de.run()}async function se(q){L.value=q;try{await B.post(`/api/schedules/${encodeURIComponent(q)}/reset-failures`),we.success("Failure counters reset"),await O()}catch(de){we.error(de.message||"Failed to reset")}L.value=null}async function ge(q){const de=e.value.find(Oe=>Oe.id===q);if(await Kt({title:"Delete schedule",message:`Delete "${(de==null?void 0:de.description)||q}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=q;try{await B.del(`/api/schedules/${encodeURIComponent(q)}`),we.success("Schedule deleted"),await O()}catch(Oe){we.error(Oe.message||"Failed to delete schedule")}v.value=null}}return je(()=>{O()}),ft(Ie),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:f,runningId:m,deletingId:v,togglingId:T,resettingId:L,reportUpdatingId:y,flushReportFormatTimers:Ie,expandedId:g,history:b,historyLoading:A,historyError:_,cronCount:E,oneTimeCount:x,webhookCount:N,pausedCount:$,failingCount:k,formatTs:Oa,formatAge:ev,formatFuture:M,formatMs:H,formatDuration:bi,onCronInput:K,onRunAtInput:C,validateCron:S,toggleExpand:U,fetchSchedules:O,doCreate:Z,doRunNow:W,doTogglePause:te,doUpdateReportFormat:Q,doResetFailures:se,doDelete:ge}}},iv=[{id:"live",label:"Live",component:Gw},{id:"agents",label:"Agents",component:Qw},{id:"loops",label:"Loops",component:Xw},{id:"processes",label:"Processes",component:ek},{id:"schedules",label:"Schedules",component:ik}],lk={components:{TabbedPage:ir},setup(){return{tabs:iv}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},ok={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){n.value=n.value===m?null:m}function o(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},f()}let r=0;const c=h(!1),d=h(null),u=h(null);async function p(){c.value=!0,u.value=null;try{d.value=await B.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function f(){const m=++r;t.value=!0,s.value=null,n.value=null;try{const v=new URLSearchParams;a.value.tool&&v.set("tool",a.value.tool),a.value.user&&v.set("user",a.value.user),a.value.keyword&&v.set("q",a.value.keyword),a.value.date&&v.set("date",a.value.date),v.set("limit",String(a.value.limit));const T=v.toString(),L=await B.get(`/api/audit${T?"?"+T:""}`);if(m!==r)return;e.value=Array.isArray(L)?L:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return je(()=>{f()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Oa,formatDetail:i,truncateBlock:tv,toggleExpand:l,clearFilters:o,fetchAudit:f,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},pp=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],rk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],ck={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const o=h(null),r=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),m=h(!1),v=pp,T=rk,L=h([]),y=h(!1),g=h(""),b=h("flat"),A=h(new Set),_=h(""),I=h(""),E=h(""),x=h(null),N=h(!1),$=h(""),k=h(!1);let M=0;Ft([_,I,E],()=>{M++,N.value=!1,$.value="",k.value=x.value!==null},{flush:"sync"});function H(){try{const oe=localStorage.getItem("odin-session-presets");oe&&(L.value=JSON.parse(oe))}catch{}}function K(){try{localStorage.setItem("odin-session-presets",JSON.stringify(L.value))}catch{}}const C=G(()=>p.value.trim()!==""||u.value!=="all"),S=G(()=>{let oe=[...e.value];const Ce=pp.find(qe=>qe.id===u.value),Ne=Ce?Ce.filters:{};if(Ne.source&&(oe=oe.filter(qe=>qe.source===Ne.source)),Ne.minMessages&&(oe=oe.filter(qe=>qe.message_count>=Ne.minMessages)),Ne.hasCompaction&&(oe=oe.filter(qe=>qe.has_summary)),Ne.maxAge!=null){const qe=Date.now()/1e3;oe=oe.filter(Bt=>Bt.last_active&&qe-Bt.last_active<=Ne.maxAge)}if(p.value.trim()){const qe=p.value.toLowerCase().trim();oe=oe.filter(Bt=>(Bt.channel_id||"").toLowerCase().includes(qe)||(Bt.last_user_id||"").toLowerCase().includes(qe)||(Bt.source||"").toLowerCase().includes(qe))}const We=f.value,Lt=m.value?1:-1;return oe.sort((qe,Bt)=>{const Ht=qe[We]||0,ms=Bt[We]||0;return(Ht-ms)*Lt}),oe}),O=G(()=>{if(!a.value||!a.value.messages)return[];const oe=a.value.messages;if(oe.length===0)return[];const Ce=[];let Ne=[];for(const We of oe)We.role==="user"&&Ne.length>0&&(Ce.push(Ne),Ne=[]),Ne.push(We);return Ne.length>0&&Ce.push(Ne),Ce}),U=G(()=>S.value.length>0&&c.value.size===S.value.length);function Z(oe){const Ce=oe.find(Ne=>Ne.role==="user");if(Ce&&Ce.content){const Ne=Ce.content.slice(0,120);return Ne.length<Ce.content.length?Ne+"...":Ne}return"(no user message)"}function W(oe){const Ce=new Set(A.value);Ce.has(oe)?Ce.delete(oe):Ce.add(oe),A.value=Ce}function te(oe){u.value=oe}function re(oe){u.value=oe.id,oe.filters.searchQuery!=null&&(p.value=oe.filters.searchQuery),oe.filters.sortBy&&(f.value=oe.filters.sortBy)}function Q(){if(!g.value.trim())return;const oe={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};L.value=[...L.value,oe],K(),y.value=!1,g.value=""}function ue(oe){L.value=L.value.filter(Ce=>Ce.id!==oe),K(),u.value===oe&&(u.value="all")}function Ie(){u.value="all",p.value="",f.value="last_active",m.value=!1}function se(oe){if(!oe)return"—";const Ce=Date.now()/1e3-oe;if(Ce<60)return"just now";if(Ce<3600){const We=Math.floor(Ce/60);return`${We} minute${We!==1?"s":""} ago`}if(Ce<86400){const We=Math.floor(Ce/3600);return`${We} hour${We!==1?"s":""} ago`}const Ne=Math.floor(Ce/86400);return`${Ne} day${Ne!==1?"s":""} ago`}function ge(oe){if(!oe)return"";try{return new Date(oe*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function q(oe){if(!oe)return"";try{return new Date(oe*1e3).toLocaleString()}catch{return""}}function de(oe){return oe==="user"?"bg-gray-900/50 border border-gray-800":oe==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function he(oe){return oe==="user"?"sess-msg-user":oe==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Oe(oe){return oe==="user"?"badge-info":oe==="assistant"?"badge-success":"badge-warning"}function w(oe){return oe==="user"?"sess-dot-user":oe==="assistant"?"sess-dot-assistant":"sess-dot-system"}function P(oe){return oe==="user"?"text-cyan-400":oe==="assistant"?"text-indigo-400":"text-gray-500"}function j(oe){return oe?oe.length>2e3?oe.slice(0,2e3)+`
... (truncated)`:oe:""}async function ce(){const oe=_.value.trim();if(!oe)return;const Ce=++M;N.value=!0,$.value="",k.value=x.value!==null;try{let Ne=`/api/sessions/search?q=${encodeURIComponent(oe)}&limit=50`;I.value.trim()&&(Ne+=`&channel_id=${encodeURIComponent(I.value.trim())}`),E.value.trim()&&(Ne+=`&user_id=${encodeURIComponent(E.value.trim())}`);const We=await B.get(Ne);if(Ce!==M)return;x.value=We.results||[],k.value=!1}catch(Ne){if(Ce!==M)return;$.value=Ne.message||"Search failed. Please retry."}finally{Ce===M&&(N.value=!1)}}function ae(){M++,_.value="",I.value="",E.value="",x.value=null,$.value="",k.value=!1,N.value=!1}function ie(oe){return oe?oe.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function me(oe){return oe==="user"?"fts-result-user":oe==="assistant"?"fts-result-assistant":oe==="summary"?"fts-result-summary":oe==="fts"?"fts-result-fts":oe==="channel"?"fts-result-channel":"fts-result-default"}function z(oe){return oe==="user"?"badge-info":oe==="assistant"?"badge-success":oe==="summary"?"badge-warning":oe==="fts"?"badge-success":"badge-info"}let X=0;async function Y(){const oe=++X;t.value=!0,s.value=null;try{const Ce=await B.get("/api/sessions");if(oe!==X)return;e.value=Ce}catch(Ce){if(oe!==X)return;s.value=Ce.message}oe===X&&(t.value=!1)}function fe(){s.value=null,Y()}async function pe(oe){if(n.value===oe){n.value=null,a.value=null,A.value=new Set;return}n.value=oe,a.value=null,i.value=!0,A.value=new Set;const Ce=++l;try{const Ne=await B.get(`/api/sessions/${encodeURIComponent(oe)}`);Ce===l&&n.value===oe&&(a.value=Ne)}catch(Ne){Ce===l&&n.value===oe&&(a.value={messages:[],summary:"",error:Ne.message||"Failed to load session"})}finally{Ce===l&&(i.value=!1)}}function be(oe){const Ce=new Set(c.value);Ce.has(oe)?Ce.delete(oe):Ce.add(oe),c.value=Ce}function Ae(){U.value?c.value=new Set:c.value=new Set(S.value.map(oe=>oe.channel_id))}function F(oe){o.value=oe}async function ye(){if(o.value){r.value=!0;try{await B.del(`/api/sessions/${encodeURIComponent(o.value)}`),n.value===o.value&&(n.value=null,a.value=null),c.value.delete(o.value),await Y()}catch(oe){s.value=oe.message||"Failed to clear session"}r.value=!1,o.value=null}}function Se(){d.value=!0}async function Le(){if(c.value.size!==0){r.value=!0;try{await B.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await Y()}catch(oe){s.value=oe.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Pe(oe,Ce){const Ne=`/api/sessions/${encodeURIComponent(oe)}/export?format=${Ce}`;try{const We=await B.getBlob(Ne),Lt=URL.createObjectURL(We),qe=document.createElement("a");qe.href=Lt,qe.download=`session-${oe}.${Ce==="text"?"txt":"json"}`,qe.click(),URL.revokeObjectURL(Lt)}catch(We){s.value=We.message||"Failed to export session"}}let ct=null;function lt(oe){oe.payload&&oe.payload.channel_id&&(clearTimeout(ct),ct=setTimeout(()=>{if(Y(),n.value&&oe.payload.channel_id===n.value){const Ce=n.value,Ne=l;B.get(`/api/sessions/${encodeURIComponent(Ce)}`).then(We=>{Ne!==l||n.value!==Ce||(a.value=We)}).catch(()=>{})}},2e3))}let xt=!1,Ut=null;function nt(){xt||(xt=!0,Y(),Xe.subscribe("events",lt),Ut=Xe.onReconnected(()=>Y()))}je(()=>{H(),nt()}),es(()=>{nt()});function et(){xt&&(xt=!1,Xe.unsubscribe("events",lt),Ut&&(Ut(),Ut=null),clearTimeout(ct))}return Wt(et),ft(et),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:U,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:m,filterPresets:v,sortOptions:T,filteredSessions:S,hasActiveFilters:C,customPresets:L,showSavePreset:y,newPresetName:g,threadView:b,threads:O,collapsedThreads:A,ftsQuery:_,ftsChannelId:I,ftsUserId:E,ftsResults:x,ftsSearching:N,ftsError:$,ftsStale:k,formatAge:se,formatTimestamp:ge,formatFullTimestamp:q,messageClass:de,threadMsgClass:he,roleBadge:Oe,roleDotClass:w,roleLabelClass:P,truncateContent:j,threadSummary:Z,fetchSessions:Y,retry:fe,toggleSession:pe,toggleSelect:be,toggleSelectAll:Ae,confirmClear:F,clearSession:ye,confirmBulkClear:Se,doBulkClear:Le,exportSession:Pe,applyPreset:te,applyCustomPreset:re,saveCustomPreset:Q,removeCustomPreset:ue,resetFilters:Ie,toggleThread:W,runFtsSearch:ce,clearFtsSearch:ae,highlightSnippet:ie,ftsResultClass:me,ftsTypeBadge:z}}},dk={props:["trace"],template:`
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
  `,setup(){return{formatTokens:sv}}},uk={components:{ContextAssemblyPanel:dk},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=h(""),r=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(I){if(!I)return"—";try{const E=new Date(I);return isNaN(E.getTime())?I:E.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return I}}function p(I){return!I&&I!==0?"—":I<1e3?I+"ms":(I/1e3).toFixed(1)+"s"}function f(I){return!I&&I!==0?"—":I>=1e3?(I/1e3).toFixed(1)+"k":String(I)}function m(I){if(!I)return"";if(typeof I=="string")return I;try{return JSON.stringify(I,null,2)}catch{return String(I)}}function v(I){a.value===I?a.value=null:(a.value=I,c.value={})}function T(I,E){const x=I+"-"+E;c.value={...c.value,[x]:!c.value[x]}}function L(I,E){return!!c.value[I+"-"+E]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,A()}async function g(){try{const I=await B.get("/api/trajectories");e.value=I.files||[],r.value=I.count||0}catch{}}let b=0;async function A(){const I=++b;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(o.value){const E=await B.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(I!==b)return;let x=E.entries||[];d.value.tool_name&&(x=x.filter(N=>(N.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(x=x.filter(N=>N.is_error)),d.value.channel_id&&(x=x.filter(N=>N.channel_id===d.value.channel_id)),d.value.user_id&&(x=x.filter(N=>N.user_id===d.value.user_id)),t.value=x}else{const E=new URLSearchParams;d.value.channel_id&&E.set("channel_id",d.value.channel_id),d.value.user_id&&E.set("user_id",d.value.user_id),d.value.tool_name&&E.set("tool_name",d.value.tool_name),d.value.errors_only&&E.set("errors_only","true"),E.set("limit",String(d.value.limit));const x=E.toString(),N=await B.get(`/api/trajectories/search/query?${x}`);if(I!==b)return;t.value=N.results||[]}}catch(E){if(I!==b)return;n.value=E.message}I===b&&(s.value=!1)}async function _(){if(!l.value.trim())return;const I=++b;s.value=!0,n.value=null,c.value={};try{const E=await B.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(I!==b)return;i.value=E.entry||null,i.value||(n.value="No trace found for this message ID")}catch(E){if(I!==b)return;E.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=E.message}I===b&&(s.value=!1)}return je(async()=>{await g(),await A()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:m,truncateBlock:tv,toggleExpand:v,toggleIteration:T,isIterationExpanded:L,clearFilters:y,fetchFiles:g,fetchTraces:A,lookupMessage:_}}};function pk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function fk(e){return e?`${e.approximate?"~":""}${Ed(e.total||0)}`:"0"}const hk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),a=h("7d"),i=h(0),l=h(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=G(()=>n.value.work||{}),f=G(()=>Math.max(1,...(n.value.activity_over_time||[]).map(_=>Number(_.count||0)))),m=G(()=>({minWidth:`max(100%, ${(n.value.activity_over_time||[]).length*5}px)`})),v=_=>({height:`${Math.max(4,Math.round(Number(_||0)/f.value*100))}%`}),T=G(()=>s.value&&l.value-i.value>3e4);async function L(){const _=++d,I=a.value;try{const E=await B.get(`/api/usage?range=${encodeURIComponent(I)}`);if(_!==d||I!==a.value)return;n.value=E,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(E){_===d&&(t.value=E.message)}finally{_===d&&(e.value=!1)}}function y(_){a.value=_,e.value=!s.value,L()}function g(){e.value=!0,L()}function b(){c||(c=!0,L(),o=setInterval(L,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function A(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return je(b),es(b),Wt(A),ft(A),{data:n,work:p,loading:e,error:t,hasData:s,range:a,ranges:u,isStale:T,fmtNum:Ed,fmtDuration:pk,tokenLabel:fk,activityTrackStyle:m,activityBar:v,selectRange:y,retry:g}}},lv=[{id:"audit",label:"Audit",component:ok},{id:"sessions",label:"Sessions",component:ck},{id:"traces",label:"Traces",component:uk},{id:"usage",label:"Usage & Activity",component:hk}],mk={components:{TabbedPage:ir},setup(){return{tabs:lv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Rr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],vk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),o=h(null),r=h(null),c=h(!1),d=h(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(x){return x.source!=="builtin"?"":u[x.state]||""}function f(x,N){const $=x&&Array.isArray(x.tools)?x.tools:null;if(c.value=!!$,r.value=$?!!x.global_enabled:null,!$){e.value=N.map(H=>({...H,source:"unknown",enabled:void 0,state:null}));return}const k=new Set($.map(H=>H.name)),M=N.filter(H=>!k.has(H.name)).map(H=>({...H,source:H.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...$.map(H=>({...H,source:"builtin"})),...M]}async function m(x,N){if(d.value.has(x.name))return;const $=!!N.target.checked,k=new Set(d.value);k.add(x.name),d.value=k;try{const M=await B.post(`/api/tools/builtins/${encodeURIComponent(x.name)}/enabled`,{enabled:$});f(M,e.value),s.value=null;try{const H=await B.get("/api/tools");f(M,H)}catch(H){console.warn("Built-in toggle committed; visible catalog refresh failed",H)}}catch(M){N.target.checked=!!x.enabled,s.value=M.message||`Failed to toggle ${x.name}`}finally{const M=new Set(d.value);M.delete(x.name),d.value=M}}const v=G(()=>e.value.filter(x=>x.source==="builtin"&&x.is_core).length),T=G(()=>e.value.filter(x=>x.source==="skill").length),L=G(()=>Object.values(a.value).reduce((x,N)=>x+N,0));function y(x){for(const N of Rr)if(N.id!=="other"&&N.match(x))return N.id;return"other"}const g=G(()=>{let x=e.value;if(n.value){const N=n.value.toLowerCase();x=x.filter($=>$.name.toLowerCase().includes(N)||($.description||"").toLowerCase().includes(N))}return o.value&&(x=x.filter(N=>y(N.name)===o.value)),x}),b=G(()=>{const x=new Set;for(const N of e.value)x.add(y(N.name));return Rr.filter(N=>x.has(N.id))}),A=G(()=>{const x=g.value,N={};for(const k of x){const M=y(k.name);N[M]||(N[M]=[]),N[M].push(k)}const $=[];for(const k of Rr)N[k.id]&&N[k.id].length>0&&$.push({label:k.label,icon:k.icon,tools:N[k.id].sort((M,H)=>M.name.localeCompare(H.name))});return $});function _(x){i.value={...i.value,[x]:!i.value[x]}}async function I(){t.value=!0,s.value=null;try{const[x,N,$]=await Promise.all([B.get("/api/tools"),B.get("/api/tools/stats").catch(()=>({})),B.get("/api/tools/builtins").catch(()=>null)]);f($,x),a.value=N||{}}catch(x){s.value=x.message}t.value=!1}function E(){I()}return je(()=>{I()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:T,totalUsage:L,filteredTools:g,groupedTools:A,usedCategories:b,stateBadge:p,applyInventory:f,toggleBuiltinTool:m,truncate:Cd,toggleExpand:_,refresh:E}}};function gk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function bk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const yk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),o=h(null),r=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),m=h(!1),v=h(null),T=h(null),L=h(!1),y=G(()=>e.value.length),g=G(()=>e.value.reduce((Q,ue)=>Q+(ue.execution_count||0),0)),b=G(()=>e.value.reduce((Q,ue)=>Q+N(ue.code),0)),A=G(()=>{if(!l.value)return e.value;const Q=l.value.toLowerCase();return e.value.filter(ue=>ue.name.toLowerCase().includes(Q)||(ue.description||"").toLowerCase().includes(Q))}),_=G(()=>u.value?u.value.split(`
`).length:0),I=G(()=>{const Q=Math.max(_.value,1);return Array.from({length:Q},(ue,Ie)=>Ie+1).join(`
`)}),E=G(()=>{const Q=u.value.trim();return Q?Q.includes("SKILL_DEFINITION")?Q.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function x(Q){return gk(Q)}function N(Q){return Q?Q.split(`
`).length:0}function $(Q){return bk(Q)}function k(Q){n.value={...n.value,[Q]:!n.value[Q]}}async function M(Q){try{await navigator.clipboard.writeText(Q);const ue=e.value.find(Ie=>Ie.code===Q);ue&&(o.value=ue.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function H(Q){if(Q.key==="Tab"){Q.preventDefault();const ue=Q.target,Ie=ue.selectionStart,se=ue.selectionEnd;u.value=u.value.substring(0,Ie)+"    "+u.value.substring(se),It(()=>{ue.selectionStart=ue.selectionEnd=Ie+4})}}function K(Q){const ue=Q.target.previousElementSibling;ue&&(ue.scrollTop=Q.target.scrollTop)}async function C(){t.value=!0,s.value=null;try{e.value=await B.get("/api/skills")}catch(Q){s.value=Q.message}t.value=!1}async function S(Q){i.value=Q,delete a.value[Q],a.value={...a.value};try{const ue=await B.post(`/api/skills/${encodeURIComponent(Q)}/test`);a.value={...a.value,[Q]:ue}}catch(ue){a.value={...a.value,[Q]:{result:ue.message,is_error:!0}}}i.value=null}function O(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function U(Q){r.value=!0,c.value="edit",d.value=Q.name,u.value=Q.code||"",p.value=null,f.value=null}function Z(){r.value=!1,p.value=null,f.value=null}async function W(){p.value=null,f.value=null;const Q=d.value.trim(),ue=u.value.trim();if(!Q){p.value="Name is required";return}if(!ue){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await B.post("/api/skills",{name:Q,code:ue}),f.value="Skill created successfully"):(await B.put(`/api/skills/${encodeURIComponent(Q)}`,{code:ue}),f.value="Skill updated successfully"),await C(),setTimeout(()=>{r.value=!1},800)}catch(Ie){p.value=Ie.message}m.value=!1}function te(Q){T.value=Q}async function re(){if(T.value){L.value=!0;try{await B.del(`/api/skills/${encodeURIComponent(T.value)}`),await C()}catch(Q){we.error(`Failed to delete skill: ${Q.message||"unknown error"}`)}L.value=!1,T.value=null}}return je(()=>{C()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:m,editorRef:v,deleteTarget:T,deleting:L,enabledCount:y,totalExecutions:g,totalLines:b,displayedSkills:A,editLineCount:_,editorLineNums:I,editValidation:E,highlight:x,truncate:Cd,formatTs:Oa,countLines:N,getLineNumbers:$,toggleCode:k,copyCode:M,handleEditorKey:H,syncScroll:K,fetchSkills:C,testSkill:S,showCreate:O,editSkill:U,cancelEdit:Z,saveSkill:W,confirmDelete:te,doDelete:re}}};class Us extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const xk=/^[A-Za-z_][A-Za-z0-9_]*$/;function fp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function hp(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Us(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Us(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,o))throw new Us(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Us(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");n[o]=r}}return{set:n,remove:a}}function _k(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function wk(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Us("Server name is required.","name");if(a.length>128||!xk.test(a))throw new Us("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(n&&(o.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Us("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(n||e.replaceArgs)&&(o.args=fp(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Us("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Us("An HTTP endpoint is required for this connection.","url");if(d&&!_k(d))throw new Us("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Us("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(n||e.replaceAllowlist)&&(o.tool_allowlist=fp(e.allowlistText));const r=hp(e.headerRows,e.headersRemove,"Header"),c=hp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function kk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Sk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Tk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const Ck=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Ek(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Ak=1e4,Rk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Ir(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Ik(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Ok={template:`
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),o=h({}),r=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),m=h(Ir()),v=h(""),T=h(!1);let L=null,y=0,g=!1,b=!1;const A=Ck,_=G(()=>{var F;return((F=e.value)==null?void 0:F.servers)||[]}),I=G(()=>{var F;return!!((F=e.value)!=null&&F.enabled)}),E=G(()=>{var F,ye,Se,Le;return{serverCount:((F=e.value)==null?void 0:F.server_count)||0,enabledCount:((ye=e.value)==null?void 0:ye.enabled_server_count)||0,connectedCount:((Se=e.value)==null?void 0:Se.connected_count)||0,toolCount:((Le=e.value)==null?void 0:Le.published_tool_count)||0}}),x=G(()=>{var F;return((F=f.value)==null?void 0:F.header_keys)||[]}),N=G(()=>{var F;return((F=f.value)==null?void 0:F.env_keys)||[]}),$=G(()=>{var F;return u.value==="edit"&&((F=f.value)==null?void 0:F.transport)==="http"}),k=G(()=>u.value==="add"||!$.value),M=G(()=>$.value?"Replace endpoint URL":"Endpoint URL"),H=G(()=>$.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function K(){C(),L=window.setInterval(()=>S({quiet:!0}),Ak)}function C(){L&&window.clearInterval(L),L=null}async function S({quiet:F=!1}={}){const ye=++y;F||(t.value=!0);try{const Se=await B.get("/api/mcp/status");if(ye!==y||!g)return;e.value=Se,n.value="";const Le=new Set((Se.servers||[]).map(Pe=>Pe.name));i.value=new Set([...i.value].filter(Pe=>Le.has(Pe)))}catch(Se){ye===y&&g&&(n.value=Se.message||"Failed to load MCP status")}finally{ye===y&&(t.value=!1)}}function O(F){return s.value||a.value.has(F)}function U(F,ye){const Se=new Set(a.value);ye?Se.add(F):Se.delete(F),a.value=Se}function Z(F){return Sk(F.state)}function W(F){if(Z(F)==="disabled"){if(!F.enabled)return"Disabled — server switch off";if(!I.value)return"Disabled — global MCP is off"}return Rk[Z(F)]}function te(F){return F.transport==="http"?"Streamable HTTP":"stdio"}function re(F){return F.negotiated_version?`${F.era?`${String(F.era).charAt(0).toUpperCase()}${String(F.era).slice(1)}`:"Protocol"} · ${F.negotiated_version}`:"Not negotiated"}function Q(F){return F.discovered_count?`${F.published_count||0} published · ${F.excluded_count||0} excluded`:"No tools discovered"}const ue=h(new Set);async function Ie(F,ye){if(ue.value.has(F.name))return;const Se=!!ye.target.checked,Le=new Set(ue.value);Le.add(F.name),ue.value=Le;try{const Pe=await B.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/enabled`,{enabled:Se});Pe&&Array.isArray(Pe.servers)?e.value=Pe:await S({quiet:!0})}catch(Pe){ye.target.checked=!!F.enabled,we.error(Pe.message||`Failed to toggle ${F.name}`)}finally{const Pe=new Set(ue.value);Pe.delete(F.name),ue.value=Pe}}async function se(F){if(F!==I.value&&!(!F&&!await Kt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await B.post("/api/mcp/enabled",{enabled:F}),we.success(F?"MCP enabled":"MCP disabled"),await S({quiet:!0})}catch(ye){we.error(ye.message||"Failed to update MCP state"),await S({quiet:!0})}finally{s.value=!1}}}async function ge(F){U(F.name,!0);try{await B.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/reconnect`,{}),we.success(`Reconnected ${F.name}`)}catch(ye){we.error(ye.message||`Failed to reconnect ${F.name}`)}finally{U(F.name,!1),await S({quiet:!0})}}async function q(F){U(F.name,!0);try{await B.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/refresh-tools`,{}),we.success(`Refreshed tools from ${F.name}`),await Oe(F.name,!0)}catch(ye){we.error(ye.message||`Failed to refresh ${F.name}`)}finally{U(F.name,!1),await S({quiet:!0})}}async function de(F){if(await Kt({title:`Remove ${F.name}`,message:`Remove this saved MCP server? Its ${F.published_count||0} published tool${F.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){U(F.name,!0);try{await B.del(`/api/mcp/servers/${encodeURIComponent(F.name)}`),we.success(`Removed ${F.name}`),delete o.value[F.name]}catch(Se){we.error(Se.message||`Failed to remove ${F.name}`)}finally{U(F.name,!1),await S({quiet:!0})}}}async function he(F){const ye=new Set(i.value);if(ye.has(F.name)){ye.delete(F.name),i.value=ye;return}ye.add(F.name),i.value=ye,Object.hasOwn(o.value,F.name)||await Oe(F.name)}async function Oe(F,ye=!1){if(!ye&&Object.hasOwn(o.value,F))return;const Se=new Set(c.value);Se.add(F),c.value=Se,r.value={...r.value,[F]:""};try{const Le=await B.get(`/api/mcp/servers/${encodeURIComponent(F)}/tools`);o.value={...o.value,[F]:Le.tools||[]}}catch(Le){r.value={...r.value,[F]:Le.message||"Failed to load tools"}}finally{const Le=new Set(c.value);Le.delete(F),c.value=Le}}function w(F){return(o.value[F]||[]).filter(ye=>Tk(ye,l.value[F]))}function P(F,ye){l.value={...l.value,[F]:ye}}function j(){u.value="add",p.value="",f.value=null,m.value=Ir(),v.value="",d.value=!0}function ce(F){u.value="edit",p.value=F.name,f.value=F,m.value={...Ir(),name:F.name,enabled:!!F.enabled,transport:F.transport||"stdio"},v.value="",d.value=!0}function ae(){T.value||(d.value=!1)}function ie(F){d.value&&Ek(F)}function me(F){const ye=F==="headers"?"headerRows":"envRows";m.value[ye].push({key:"",value:""})}function z(F,ye){const Se=F==="headers"?"headerRows":"envRows";m.value[Se].splice(ye,1)}function X(F,ye){const Se=F==="headers"?"headersRemove":"envRemove",Le=m.value[Se];m.value[Se]=Le.includes(ye)?Le.filter(Pe=>Pe!==ye):[...Le,ye]}async function Y(){var ye,Se;v.value="";let F;try{F=wk(m.value,{mode:u.value,originalTransport:((ye=f.value)==null?void 0:ye.transport)||""})}catch(Le){v.value=Le instanceof Us?Le.message:"Invalid MCP server configuration",await It(),(Se=document.querySelector(".mcp-editor"))==null||Se.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&kk(F,f.value)&&!await Kt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){T.value=!0;try{u.value==="add"?await B.post("/api/mcp/servers",F):await B.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,F),we.success(u.value==="add"?`Saved ${F.name}`:`Updated ${p.value}`),d.value=!1,await S({quiet:!0})}catch(Le){v.value=Le.message||"Failed to save MCP server"}finally{T.value=!1}}}let fe=null;function pe(F){`${(F==null?void 0:F.event)||""} ${(F==null?void 0:F.type)||""} ${(F==null?void 0:F.tool)||""} ${(F==null?void 0:F.message)||""}`.toLowerCase().includes("mcp")&&(fe&&window.clearTimeout(fe),fe=window.setTimeout(()=>S({quiet:!0}),200))}function be(){g||(g=!0,b||(Xe.subscribe("events",pe),b=!0),S(),K())}function Ae(){g=!1,C(),fe&&window.clearTimeout(fe),fe=null,b&&(Xe.unsubscribe("events",pe),b=!1)}return je(be),es(be),Wt(Ae),ft(Ae),{status:e,loading:t,mutating:s,pageError:n,servers:_,masterEnabled:I,aggregate:E,expandedServers:i,toolQueries:l,toolErrors:r,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:f,form:m,formError:v,saving:T,editorGroups:A,configuredHeaderKeys:x,configuredEnvKeys:N,savedHttpEndpoint:$,endpointRequired:k,endpointFieldLabel:M,endpointPlaceholder:H,refreshAll:S,busy:O,serverState:Z,stateLabel:W,transportLabel:te,protocolLabel:re,toolSummary:Q,formatAge:Ik,setMasterEnabled:se,togglePending:ue,toggleServerEnabled:Ie,reconnect:ge,refreshTools:q,removeServer:de,toggleTools:he,filteredTools:w,setToolQuery:P,openAdd:j,openEdit:ce,closeEditor:ae,jumpToEditorGroup:ie,addSecretRow:me,removeSecretRow:z,toggleSecretRemoval:X,saveServer:Y}}};function Lk(e,t){if(!e||!t)return dp(e);const s=dp(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Nk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),o=h(null),r=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),m=h(null),v=h(null);let T=null;const L=h(null),y=h(!1),g=h({}),b=h({}),A=h({}),_=h({}),I=new Map,E=h(null),x=G(()=>e.value.reduce((W,te)=>W+(te.chunks||0),0)),N=G(()=>new Set(e.value.map(te=>te.uploader).filter(Boolean)).size);function $(W,te){const re=b.value[te];if(!re||re.length===0)return 0;const Q=Math.max(...re.map(ue=>ue.char_count||0));return Q===0?0:Math.round(W.char_count/Q*100)}async function k(){t.value=!0,s.value=null;try{const W=await B.get("/api/knowledge");e.value=Array.isArray(W)?W:[]}catch(W){s.value=W.message}t.value=!1}async function M(W){if(g.value[W]){g.value[W]=!1,E.value=null;return}if(g.value[W]=!0,Object.prototype.hasOwnProperty.call(b.value,W))return;if(I.has(W))return I.get(W);const te={..._.value,[W]:!0};_.value=te;const re={...A.value};delete re[W],A.value=re;const Q=B.get(`/api/knowledge/${encodeURIComponent(W)}/chunks`).then(ue=>{b.value={...b.value,[W]:Array.isArray(ue)?ue:[]}}).catch(ue=>{A.value={...A.value,[W]:ue.message||"load failed"}}).finally(()=>{if(I.get(W)!==Q)return;I.delete(W);const ue={..._.value};delete ue[W],_.value=ue});return I.set(W,Q),Q}let H=0;async function K(){const W=n.value.trim();if(!W)return;const te=++H;i.value=!0,o.value=null,l.value=W;try{const re=await B.get(`/api/knowledge/search?q=${encodeURIComponent(W)}`);if(te!==H)return;a.value=Array.isArray(re)?re:[]}catch(re){if(te!==H)return;a.value=[],o.value=re.message||"Search failed"}te===H&&(i.value=!1)}function C(){H+=1,i.value=!1,a.value=null,n.value="",o.value=null}async function S(){u.value=null,p.value=null;const W=c.value.trim(),te=d.value.trim();if(!W){u.value="Source name is required";return}if(!te){u.value="Content is required";return}f.value=!0;try{const re=await B.post("/api/knowledge",{source:W,content:te});p.value=`Ingested ${re.chunks||0} chunks from "${W}"`,c.value="",d.value="",b.value={},await k(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(re){u.value=re.message}f.value=!1}async function O(W){m.value=W,v.value=null,T&&(clearTimeout(T),T=null);try{const te=await B.post(`/api/knowledge/${encodeURIComponent(W)}/reingest`);v.value={source:W,error:!1,message:`Re-ingested ${te.chunks||0} chunks`},delete b.value[W],await k(),T=setTimeout(()=>{v.value=null,T=null},3e3)}catch(te){v.value={source:W,error:!0,message:te.message}}m.value=null}function U(W){L.value=W}async function Z(){if(L.value){y.value=!0;try{await B.del(`/api/knowledge/${encodeURIComponent(L.value)}`),delete b.value[L.value],await k()}catch(W){we.error(`Failed to delete source: ${W.message||"unknown error"}`)}y.value=!1,L.value=null}}return je(()=>{k()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:m,reingestResult:v,deleteTarget:L,deleting:y,expanded:g,sourceChunks:b,chunkErrors:A,loadingChunks:_,selectedChunk:E,totalChunks:x,uploaderCount:N,truncate:Cd,formatTs:Oa,highlightTerms:Lk,chunkBarWidth:$,fetchSources:k,toggleSource:M,doSearch:K,clearSearch:C,doIngest:S,doReingest:O,confirmDelete:U,doDelete:Z}}},Dk={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),o=h(!1),r=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),m=h(!1),v=h(null),T=h(null),L=h(new Set),y=h(null),g=h(!1),b=h(!1),A=G(()=>e.value.reduce((te,re)=>te+re.count,0)),_=G(()=>L.value.size);function I(te){const re=t.value[te];if(!re)return[];if(!l.value.trim())return re;const Q=l.value.trim().toLowerCase();return re.filter(ue=>ue.key.toLowerCase().includes(Q)||ue.value&&ue.value.toLowerCase().includes(Q))}function E(te,re){return L.value.has(te+"/"+re)}function x(te,re){const Q=te+"/"+re,ue=new Set(L.value);ue.has(Q)?ue.delete(Q):ue.add(Q),L.value=ue}function N(te){const re=t.value[te];return!re||re.length===0?!1:re.every(Q=>L.value.has(te+"/"+Q.key))}function $(te,re){const Q=t.value[te];if(!Q)return;const ue=new Set(L.value);for(const Ie of Q){const se=te+"/"+Ie.key;re?ue.add(se):ue.delete(se)}L.value=ue}async function k(){s.value=!0,n.value=null;try{const te=await B.get("/api/memory");e.value=Object.entries(te).map(([re,Q])=>({name:re,keys:Q.keys||[],count:Q.count||0}))}catch(te){n.value=te.message}s.value=!1}async function M(te){if(a.value[te]){a.value[te]=!1;return}a.value[te]=!0;const re=e.value.find(ue=>ue.name===te);if(!re||t.value[te]||i.value===te)return;i.value=te;let Q;try{const Ie=(await B.get(`/api/memory/${encodeURIComponent(te)}`)).entries||{};Q=re.keys.map(se=>Object.prototype.hasOwnProperty.call(Ie,se)?{key:se,value:Ie[se]||"",failed:!1}:{key:se,value:"",failed:!0,error:"Not found in scope"})}catch(ue){Q=re.keys.map(Ie=>({key:Ie,value:"",failed:!0,error:ue.message||"Failed to load"}))}t.value[te]=Q,i.value=null}function H(te,re,Q){p.value=te+"/"+re,f.value=Q}async function K(te,re){m.value=!0,v.value=null;try{await B.put(`/api/memory/${encodeURIComponent(te)}/${encodeURIComponent(re)}`,{value:f.value});const Q=t.value[te];if(Q){const ue=Q.find(Ie=>Ie.key===re);ue&&(ue.value=f.value)}p.value=null}catch(Q){v.value=`Failed to save: ${Q.message||"unknown error"}`}m.value=!1}async function C(te,re){try{await navigator.clipboard.writeText(re.value),T.value=te+"/"+re.key,setTimeout(()=>{T.value=null},1500)}catch{}}async function S(){d.value=null,u.value=null;const te=r.value.scope.trim(),re=r.value.key.trim(),Q=r.value.value.trim();if(!te){d.value="Scope is required";return}if(!re){d.value="Key is required";return}if(!Q){d.value="Value is required";return}c.value=!0;try{await B.put(`/api/memory/${encodeURIComponent(te)}/${encodeURIComponent(re)}`,{value:Q}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await k(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ue){d.value=ue.message}c.value=!1}function O(te,re){y.value={scope:te,key:re}}async function U(){if(!y.value)return;g.value=!0,v.value=null;const{scope:te,key:re}=y.value;try{await B.del(`/api/memory/${encodeURIComponent(te)}/${encodeURIComponent(re)}`);const Q=t.value[te];Q&&(t.value[te]=Q.filter(se=>se.key!==re));const ue=e.value.find(se=>se.name===te);ue&&(ue.count--,ue.keys=ue.keys.filter(se=>se!==re));const Ie=new Set(L.value);Ie.delete(te+"/"+re),L.value=Ie}catch(Q){v.value=`Failed to delete: ${Q.message||"unknown error"}`}g.value=!1,y.value=null}function Z(){b.value=!0}async function W(){g.value=!0,v.value=null;const te=[];for(const re of L.value){const Q=re.indexOf("/");te.push({scope:re.slice(0,Q),key:re.slice(Q+1)})}try{await B.post("/api/memory/bulk-delete",{entries:te}),L.value=new Set,t.value={},await k()}catch(re){v.value=`Bulk delete failed: ${re.message||"unknown error"}`}g.value=!1,b.value=!1}return je(()=>{k()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:m,actionError:v,copied:T,selected:L,selectedCount:_,totalEntries:A,deleteTarget:y,deleting:g,showBulkDelete:b,fetchMemory:k,toggleScope:M,startEdit:H,doEdit:K,copyValue:C,doAdd:S,confirmDelete:O,doDelete:U,confirmBulkDelete:Z,doBulkDelete:W,isSelected:E,toggleSelect:x,isScopeAllSelected:N,toggleSelectAll:$,filteredEntries:I}}},Mk={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=G(()=>[...new Set(e.value.map(T=>T.category))].sort()),r=G(()=>{const v={};return e.value.forEach(T=>{v[T.category]=(v[T.category]||0)+1}),v}),c=G(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await B.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,we.success("Entry updated"),await m()}catch(T){we.error(T.message||"Failed to save entry")}}async function f(v){if(await Kt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await B.del("/api/learned/"+encodeURIComponent(v)),we.success("Entry deleted"),await m()}catch(L){we.error(L.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await B.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return je(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:Oa,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:m}}},ov=[{id:"tools",label:"Tools",component:vk},{id:"skills",label:"Skills",component:yk},{id:"mcp-servers",label:"MCP Servers",component:Ok},{id:"knowledge",label:"Knowledge",component:Nk},{id:"memory",label:"Memory",component:Dk},{id:"learned",label:"Learned",component:Mk}],Pk={components:{TabbedPage:ir},setup(){return{tabs:ov}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Fk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},$k={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Uk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Bk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=G(()=>e.value.components||[]),l=G(()=>Uk[e.value.overall]||"text-gray-400"),o=G(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=G(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return Fk[_]||"text-gray-400"}function d(_){return $k[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function p(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function f(_){return _.replace(/_/g," ").replace(/\b\w/g,I=>I.toUpperCase())}function m(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function v(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function T(){a.value=!0;try{e.value=await B.get("/api/health/components"),s.value=null,n.value=!0}catch(_){s.value=_.message}finally{t.value=!1,a.value=!1}}function L(){t.value=!0,s.value=null,T()}let y=null,g=!1;function b(){g||(g=!0,T(),y||(y=setInterval(T,3e4)))}function A(){g&&(g=!1,y&&(clearInterval(y),y=null))}return je(b),es(b),Wt(A),ft(A),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:m,formatNumber:v,fetchHealth:T,retry:L}}},Hk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=G(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=G(()=>{if(!i.value)return[];const T=i.value,L=T.storage_total_bytes||1;return[{label:"Session Persistence",mb:T.sessions.persist_dir.total_mb,bytes:T.sessions.persist_dir.total_bytes,files:T.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(T.sessions.persist_dir.total_bytes/L*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:T.knowledge.db_file.total_mb,bytes:T.knowledge.db_file.total_bytes,files:T.knowledge.db_file.file_count,pct:Math.min(100,Math.round(T.knowledge.db_file.total_bytes/L*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:T.trajectories.message_dir.total_mb,bytes:T.trajectories.message_dir.total_bytes,files:T.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(T.trajectories.message_dir.total_bytes/L*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:T.trajectories.agent_dir.total_mb,bytes:T.trajectories.agent_dir.total_bytes,files:T.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(T.trajectories.agent_dir.total_bytes/L*100)),color:"res-bar-amber"}]});async function d(){try{const T=await B.get("/api/resource-usage");i.value=T,t.value=null,s.value=!0}catch(T){t.value=T.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function m(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function v(){f&&(f=!1,l&&(clearInterval(l),l=null))}return je(m),es(m),Wt(v),ft(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:o,collectedAt:r,storageItems:c,fmtNum:Ed,refresh:u,retry:p}}},zk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),jk=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function Vk(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const n=Object.fromEntries(Object.entries(e[s]).filter(([a])=>!jk.has(a)));Object.keys(n).length&&(t[s]=n)}return Object.keys(t).length?ml(t):""}function qk(e){var a,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((a=t.metadata)!=null&&a.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!zk.has(c)));s=Object.keys(r).length?ml(r):""}const n=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:n,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const ea=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),vl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function Gk(e){const t=ea(e)?e:{},s=ea(t.metadata)?t.metadata:{},n=ea(t.audit_metadata)?t.audit_metadata:{},a=ea(t.turn)?t.turn:{},i=l=>vl(t[l]??s[l]??n[l]??a[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function mp(e){return e.record?JSON.stringify(rv(e),null,2):e.text}function rv(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function bc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function vp(e){if(!bc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,vl(s.channel_id),vl(s.user_id??s.actor)])}function Kk(e,t,s=2e3){var i,l,o;const n=vp(t),a=n?e.findIndex(r=>vp(r)===n):-1;if(a<0)e.push(t);else{const r=e[a],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:bc(y)==="end"?1:0,p=[...c].sort((y,g)=>u(y)-u(g)),f=Object.assign({},...p);f.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const g=p.filter(b=>ea(b[y])).map(b=>b[y]);g.length&&(f[y]=Object.assign({},...g))}const m=c.some(y=>bc(y)!=="start"),v=c.find(y=>yc(y,0).level==="ERROR"),T=(v==null?void 0:v.status)||((i=v==null?void 0:v.metadata)==null?void 0:i.status);f.status=v?["failed","error","cancelled","denied","outcome_unknown"].includes(T)?T:"failed":m?f.status||((l=f.metadata)==null?void 0:l.status)||"succeeded":"started",m&&f.status==="started"&&(f.status="succeeded"),v&&(f.error=v.error||((o=v.metadata)==null?void 0:o.error)||f.error);const L=yc(f,r.id,r._time);Object.assign(L,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(a,1,L)}e.length>s&&e.splice(0,e.length-s)}function yc(e,t,s=new Date){var u,p;let n=e;if(ea(e)&&e.type==="log"&&"line"in e?n=e.line:ea(e)&&"payload"in e&&(n=e.payload),typeof n=="string")try{n=JSON.parse(n)}catch{}const a=ea(n)?n:null,i=a!=null&&a.timestamp?new Date(a.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=a?a.result_summary??a.detail??a.message??JSON.stringify(a):typeof n=="string"?n:JSON.stringify(n)??"",c=(a==null?void 0:a.error)||((u=a==null?void 0:a.metadata)==null?void 0:u.error)||(a==null?void 0:a.success)===!1||[a==null?void 0:a.status,(p=a==null?void 0:a.metadata)==null?void 0:p.status].some(f=>["failed","error","cancelled","denied","outcome_unknown"].includes(f))?"ERROR":vl(a==null?void 0:a.level).toUpperCase()||"INFO",d={id:t,record:a,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:vl(a==null?void 0:a.tool_name),raw:a?null:o,attribution:Gk(a)};return d.searchText=a?JSON.stringify(a):d.text,d}function Wk(e){const t=new Map;for(const s of e){const{turnId:n,agentId:a,rootId:i,label:l,parentId:o}=s.attribution,r=n?`turn:${n}`:a?`root:${i||a}`:"unattributed";t.has(r)||t.set(r,{key:r,title:n?`Turn ${n}`:a?`Agent root ${i||a} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=a?`agent:${a}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:a,label:l,parentId:o,rootId:i,title:a?`${l||"Agent"} (${a})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...n})=>n)}const Jk={components:{ToolOutput:lr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=G(()=>qk(e.entry)),s=G(()=>{var o;return ml(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),n=G(()=>{var o,r,c;return ml(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),a=G(()=>Vk(e.entry.record)),i=G(()=>rv(e.entry)),l=G(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:n,metadataText:a,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},Zk=["INFO","WARNING","ERROR"],Yk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Or=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Qk=[50,100,200,500],Xk={components:{ToolOutput:lr,LogRecord:Jk},template:`
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
    </div>`,setup(){const e=h("live"),t=h([]);let s=0;const n=h(!1),a=h(!1),i=h(!0),l=h(""),o=h(""),r=h(!1),c=h(!1),d=h(Xe.state||"disconnected"),u=G(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=h(null),f=h(!1),m=h(null),v=2e3,T=Zk,L=Yk,y=Or,g=h("all"),b=h(""),A=h([]),_=h(!1),I=h(""),E=h([]);function x(){try{const ne=localStorage.getItem("odin-log-presets");ne&&(A.value=JSON.parse(ne))}catch{}}function N(){try{localStorage.setItem("odin-log-presets",JSON.stringify(A.value))}catch{}}const $=G(()=>l.value!==""||o.value.trim()!==""||b.value!==""),k=G(()=>{const ne=Or.find(Te=>Te.value===b.value);return ne?ne.label:""}),M=G(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ne){return ne.message}}),H=24,K=G(()=>{if(te.value.length===0)return[];const ne=[],Te=new Date,Fe=3600*1e3;for(let Ye=H-1;Ye>=0;Ye--){const _t=new Date(Te.getTime()-(Ye+1)*Fe),dt=new Date(Te.getTime()-Ye*Fe);ne.push({start:_t,end:dt,label:U(_t,dt),shortLabel:dt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ye of te.value){if(!Ye._time)continue;const _t=Ye._time.getTime();for(const dt of ne)if(_t>=dt.start.getTime()&&_t<dt.end.getTime()){dt.total++,Ye.level==="ERROR"?dt.errors++:Ye.level==="WARNING"?dt.warnings++:dt.info++;break}}return ne}),C=G(()=>{let ne=1;for(const Te of K.value)Te.total>ne&&(ne=Te.total);return ne}),S=G(()=>{if(K.value.length===0)return"";const ne=te.value.map(Ye=>Ye._time&&Ye._time.getTime()).filter(Boolean);if(ne.length===0)return"";const Te=new Date(Math.min(...ne));return`${te.value.length} shown, oldest ${Te.toLocaleTimeString()}`}),O=G(()=>Math.ceil(H/8));function U(ne,Te){const Fe={hour:"2-digit",minute:"2-digit"};return ne.toLocaleTimeString([],Fe)+" - "+Te.toLocaleTimeString([],Fe)}function Z(ne,Te){return!Te||!ne?"0px":Math.max(2,ne/Te*100)+"%"}function W(ne){const Te=te.value.findIndex(Fe=>Fe._time&&Fe._time.getTime()>=ne.start.getTime()&&Fe._time.getTime()<ne.end.getTime());if(Te>=0&&p.value){const Fe=p.value.querySelector('[data-log-id="'+te.value[Te].id+'"]');Fe&&(Fe.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const te=G(()=>{let ne=t.value;if(l.value&&(ne=ne.filter(Te=>(Te.level||"INFO")===l.value)),b.value){const Te=Or.find(Fe=>Fe.value===b.value);if(Te&&Te.seconds){const Fe=new Date(Date.now()-Te.seconds*1e3);ne=ne.filter(Ye=>Ye._time&&Ye._time>=Fe)}}if(o.value&&!M.value)if(r.value)try{const Te=new RegExp(o.value,"i");ne=ne.filter(Fe=>{const Ye=Fe.searchText,_t=Fe.tool||"";return Te.test(Ye)||Te.test(_t)})}catch{}else{const Te=o.value.toLowerCase();ne=ne.filter(Fe=>{const Ye=Fe.searchText.toLowerCase(),_t=(Fe.tool||"").toLowerCase();return Ye.includes(Te)||_t.includes(Te)})}return ne}),re=G(()=>Wk(te.value));function Q(ne){const Te=yc(ne,++s);if(a.value){E.value.push(Te);return}ue(Te)}function ue(ne){Kk(t.value,ne,v),i.value&&It(()=>Ie())}function Ie(ne=!1){const Te=p.value;Te&&Te.scrollTo({top:Te.scrollHeight,behavior:ne?"smooth":"instant"})}function se(){i.value=!0,f.value=!1,It(()=>Ie(!0))}const ge=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function q(){const ne=p.value;if(!ne)return;const Te=ne.scrollHeight-ne.scrollTop-ne.clientHeight<40;f.value=!i.value&&!Te&&t.value.length>0,w.value&&de()}function de(){const ne=p.value;!ne||!i.value||ne.scrollHeight-ne.scrollTop-ne.clientHeight>=40&&(i.value=!1,f.value=t.value.length>0)}function he(){i.value&&requestAnimationFrame(de)}function Oe(ne){ge.has(ne.key)&&he()}const w=h(!1);function P(){i.value&&(w.value=!0,requestAnimationFrame(de))}function j(){w.value&&(w.value=!1,de())}function ce(){i.value&&(f.value=!1,It(()=>Ie()))}function ae(){if(a.value=!a.value,!a.value&&E.value.length>0){for(const ne of E.value)ue(ne);E.value=[]}}function ie(){t.value=[],E.value=[],f.value=!1}function me(){let ne;e.value==="search"?ne=Ne.value.map(_t=>{const dt=_t.error?"ERROR":"INFO",zn=_t.tool_name?`[${_t.tool_name}] `:"";return`${_t.timestamp||""} ${dt} ${zn}${_t.result_summary||_t.message||""}`}).join(`
`):ne=te.value.map(mp).join(`

`);const Te=new Blob([ne],{type:"text/plain"}),Fe=URL.createObjectURL(Te),Ye=document.createElement("a");Ye.href=Fe,Ye.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ye.click(),URL.revokeObjectURL(Fe)}function z(ne){const Te=mp(ne);navigator.clipboard.writeText(Te).then(()=>{m.value=ne.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function X(ne){l.value=l.value===ne?"":ne,g.value="all"}function Y(ne){return ne.level==="ERROR"?"log-line-error":ne.level==="WARNING"?"log-line-warning":"text-gray-300"}function fe(ne){return ne==="ERROR"?"text-red-500 font-semibold":ne==="WARNING"?"text-yellow-500":"text-blue-500"}function pe(ne){return ne==="ERROR"?"log-chip-error":ne==="WARNING"?"log-chip-warning":"log-chip-info"}function be(ne){g.value=ne.id;const Te=ne.filters;l.value=Te.level||"",b.value=Te.timeRange||"",o.value=Te.text||"",Te.levels&&(l.value=Te.levels[0]||""),Te.hasToolName&&(o.value="")}function Ae(ne){g.value=ne.id,l.value=ne.filters.level||"",b.value=ne.filters.timeRange||"",o.value=ne.filters.text||""}function F(){if(!I.value.trim())return;const ne={id:"custom-"+Date.now(),name:I.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};A.value=[...A.value,ne],N(),_.value=!1,I.value=""}function ye(ne){A.value=A.value.filter(Te=>Te.id!==ne),N(),g.value===ne&&(g.value="all")}const Se=h("all"),Le=h(""),Pe=h(""),ct=h(""),lt=h(""),xt=h(""),Ut=h(100),nt=Qk,et=h(!1),oe=h(!1),Ce=h(""),Ne=h([]),We=h(null),Lt=h(null);function qe(){e.value="search",We.value||Bt()}async function Bt(){try{We.value=await B.get("/api/logs/stats")}catch{}}function Ht(){const ne=xt.value;if(!ne){ct.value="",lt.value="";return}const Fe={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ne];if(Fe){const Ye=new Date(Date.now()-Fe*1e3);ct.value=ms(Ye),lt.value=""}}function ms(ne){const Te=Fe=>String(Fe).padStart(2,"0");return`${ne.getFullYear()}-${Te(ne.getMonth()+1)}-${Te(ne.getDate())}T${Te(ne.getHours())}:${Te(ne.getMinutes())}`}function Xs(ne){if(!ne)return"";const Te=new Date(ne);return isNaN(Te.getTime())?"":Te.toISOString()}async function Ls(){et.value=!0,Ce.value="",oe.value=!0,Lt.value=null;try{const ne=new URLSearchParams;Se.value&&Se.value!=="all"&&ne.set("level",Se.value),Le.value&&ne.set("tool",Le.value),Pe.value&&ne.set("q",Pe.value);const Te=Xs(ct.value),Fe=Xs(lt.value);Te&&ne.set("start",Te),Fe&&ne.set("end",Fe),ne.set("limit",String(Ut.value));const Ye=await B.get(`/api/logs/search?${ne.toString()}`);Ne.value=Ye.entries||[]}catch(ne){Ce.value=ne.message||"Search failed",Ne.value=[]}finally{et.value=!1}}function Bn(){Se.value="all",Le.value="",Pe.value="",ct.value="",lt.value="",xt.value="",Ut.value=100,Ne.value=[],oe.value=!1,Ce.value="",Lt.value=null}function hn(ne){Lt.value=Lt.value===ne?null:ne}function Ns(ne){if(!ne.timestamp)return"";try{return new Date(ne.timestamp).toLocaleString()}catch{return ne.timestamp}}function Hn(ne){return ne.type==="web_action"?`${ne.status||""} (${ne.execution_time_ms||0}ms)`:(ne.result_summary||"").slice(0,200)}function vs(ne){return ne.error?"log-line-error":"text-gray-300"}function mn(ne){try{return JSON.stringify(ne,null,2)}catch{return String(ne)}}let Ds=null,Ze=!1;function Ms(){Ze||(Ze=!0,Xe.subscribe("logs",Q),c.value=Xe.connected,d.value=Xe.state||"disconnected",Ds=Xe.onState(ne=>{d.value=ne,c.value=ne==="connected"}))}function Nt(){Ze&&(Ze=!1,Xe.unsubscribe("logs",Q),Ds&&(Ds(),Ds=null))}return je(()=>{x(),window.addEventListener("pointerup",j),window.addEventListener("pointercancel",j)}),es(Ms),Wt(Nt),ft(()=>{Nt(),window.removeEventListener("pointerup",j),window.removeEventListener("pointercancel",j)}),{mode:e,logs:t,paused:a,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:n,groupedLogs:re,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:te,pauseBuffer:E,showJumpBottom:f,copiedIndex:m,regexError:M,levels:T,logPresets:L,timeRanges:y,timeRange:b,activeLogPreset:g,customLogPresets:A,showSaveLogPreset:_,newLogPresetName:I,hasActiveLogFilters:$,timeRangeLabel:k,timelineBuckets:K,timelineMax:C,timelineSpanLabel:S,timelineLabelSkip:O,togglePause:ae,clearLogs:ie,exportLogs:me,logLineClass:Y,levelClass:fe,levelChipClass:pe,toggleLevel:X,copyLine:z,jumpToBottom:se,onScroll:q,onUserScrollIntent:he,onUserScrollKey:Oe,onAutoScrollToggle:ce,onPointerDown:P,applyLogPreset:be,applyCustomLogPreset:Ae,saveLogCustomPreset:F,removeLogCustomPreset:ye,segmentHeight:Z,jumpToTimelineBucket:W,searchLevel:Se,searchTool:Le,searchKeyword:Pe,searchStart:ct,searchEnd:lt,searchTimePreset:xt,searchLimit:Ut,searchLimits:nt,searching:et,searchRan:oe,searchError:Ce,searchResults:Ne,searchStats:We,expandedSearch:Lt,switchToSearch:qe,runSearch:Ls,clearSearchFilters:Bn,toggleSearchExpand:hn,formatSearchTs:Ns,searchEntryText:Hn,searchLogLineClass:vs,formatJson:mn,applySearchTimePreset:Ht}}};function zl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const eS=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function tS(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const li=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],sS={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},jl=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),nS=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function gp(e){return nS.some(t=>e===t||e.startsWith(`${t}.`))}const cv="odin_config_center_expanded_v1",dv="odin_config_center_category_v1",aS=50,iS=650,Ii=()=>B.get("/api/config/meta");function fa(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Za(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Ha(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function lS(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function oS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function uv(e,t){if(Za(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return fa(t);const n={};for(const[a,i]of Object.entries(t)){const l=uv(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function rS(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=uv(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function pv(e,t,s,n){if(Za(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)pv(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function cS(){try{const e=JSON.parse(localStorage.getItem(cv)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function dS(){try{const e=localStorage.getItem(dv);return li.some(t=>t.key===e)?e:li[0].key}catch{return li[0].key}}const uS={template:`
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
                    <section v-if="section === 'image'" class="cfgc-field-group" aria-label="Image model defaults">
                      <strong>Image model defaults</strong>
                      <p>Follow shipped defaults or pin the current runtime model. These actions save immediately, without saving drafts. Edited model drafts remain unsaved.</p>
                      <p v-if="imageModelError" role="alert">{{ imageModelError }}</p>
                      <p v-if="!meta?.image_model_defaults">Image model metadata is unavailable.</p>
                      <div v-for="leaf in imageModelLeaves" :key="leaf" :data-image-model="leaf">
                        <strong>{{ leaf === 'image_model' ? 'Image model' : 'Outer model' }}</strong>
                        <p>Effective: <code>{{ meta?.image_model_defaults?.[leaf]?.effective ?? 'Unavailable' }}</code> · Shipped default: <code>{{ meta?.image_model_defaults?.[leaf]?.default ?? 'Unavailable' }}</code> · Status: {{ meta?.image_model_defaults?.[leaf]?.status ?? 'Unavailable' }}</p>
                        <button type="button" class="btn btn-ghost" :disabled="saving || !meta?.image_model_defaults?.[leaf]" @click="setImageModelDefaults([leaf], 'follow')">Follow defaults</button>
                        <button type="button" class="btn btn-ghost" :disabled="saving || !meta?.image_model_defaults?.[leaf]" @click="setImageModelDefaults([leaf], 'pin')">Pin current</button>
                      </div>
                      <button type="button" class="btn btn-ghost" :disabled="saving || !imageModelMetadataReady" @click="setImageModelDefaults(imageModelLeaves, 'follow')">Follow defaults for both</button>
                      <button type="button" class="btn btn-ghost" :disabled="saving || !imageModelMetadataReady" @click="setImageModelDefaults(imageModelLeaves, 'pin')">Pin current for both</button>
                      <button type="button" class="btn btn-ghost" :disabled="saving" @click="refreshImageModelMetadata">Refresh image model status</button>
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=["image_model","outer_model"],o=G(()=>l.every(R=>{var V,ee;return(ee=(V=t.value)==null?void 0:V.image_model_defaults)==null?void 0:ee[R]})),r=h(null),c=h(null),d=h(null),u=h(!1),p=h(!1),f=h(null),m=h(""),v=h("all"),T=h(dS()),L=h(cS()),y=h({}),g=h({}),b=h(""),A=h({}),_=h({}),I=h([]),E=h([]),x=h(!1),N=h(!1),$=h(!1);let k=null,M=null,H={path:null,at:0},K=0;const C=G(()=>{var R;return(((R=t.value)==null?void 0:R.fields)||[]).filter(V=>!jl.has(V.path.split(".")[0])&&!gp(V.path))}),S=G(()=>new Map(C.value.map(R=>[R.path,R]))),O=G(()=>re.value.reduce((R,V)=>R+V.sections.length,0)),U=G(()=>C.value.length),Z=G(()=>eS),W=G(()=>I.value.length>0),te=G(()=>E.value.length>0),re=G(()=>{if(!e.value)return[];const R=new Set(li.flatMap(_e=>_e.sections)),V=li.map(_e=>({..._e,sections:_e.sections.filter(Ve=>Object.hasOwn(e.value,Ve)&&!jl.has(Ve))})).filter(_e=>_e.sections.length),ee=Object.keys(e.value).filter(_e=>!R.has(_e)&&!jl.has(_e));return ee.length&&V.push({key:"other",label:"Other",icon:"folder",sections:ee}),V}),Q=G(()=>e.value?{...e.value,...y.value}:null),ue=G(()=>{if(!e.value)return[];const R=[];for(const[V,ee]of Object.entries(y.value))pv(e.value[V],ee,V,R);return R.filter(V=>!Za(V.oldVal,V.newVal)).map(V=>{const ee=ae(V.path);return{...V,label:(ee==null?void 0:ee.label)||Ha(V.path.split(".").at(-1)),apply_mode:(ee==null?void 0:ee.apply_mode)||pe(V.path.split(".")[0])}})}),Ie=G(()=>ue.value.length>0),se=G(()=>ue.value.length),ge=G(()=>new Set(ue.value.map(R=>R.path.split(".")[0])).size),q=G(()=>!!m.value||v.value!=="all"),de=G(()=>{const R={..._.value};for(const V of ue.value){const ee=ae(V.path),_e=Da(ee,V.newVal);_e&&(R[V.path]=_e)}return R}),he=G(()=>Object.keys(de.value).length>0),Oe=G(()=>e.value?(q.value?re.value:re.value.filter(V=>V.key===T.value)).map(V=>({...V,sections:V.sections.filter(ee=>Ne(ee))})).filter(V=>V.sections.length):[]),w=G(()=>{const R=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],V=new Map(R.map(ee=>[ee,[]]));for(const ee of ue.value){const _e=V.has(ee.apply_mode)?ee.apply_mode:"restart";V.get(_e).push(ee)}return R.filter(ee=>V.get(ee).length).map(ee=>({key:ee,label:xe(ee),entries:V.get(ee)}))}),P=G(()=>ue.value.filter(R=>R.apply_mode==="restart").length),j=G(()=>C.value.filter(R=>R.pending_restart)),ce=G(()=>j.value.length);function ae(R){const V=S.value.get(R);return V?{...V,apply_details:zl([V])}:null}function ie(R){const V=`${R}.`;return C.value.filter(ee=>ee.path===R||ee.path.startsWith(V))}function me(){return C.value.some(R=>R.path==="tools.hosts"||R.path.startsWith("tools.hosts."))}function z(){var ee,_e;const R=((_e=(ee=e.value)==null?void 0:ee.tools)==null?void 0:_e.hosts)||{},V=Object.keys(R).length;return`${V} host${V===1?"":"s"} configured.`}function X(R){return ie(R).length}function Y(R){return Ha(R)}function fe(R){const V=ie(R);if(!V.length)return`${Ha(R)} configuration.`;const ee=V.find(kt=>kt.sensitivity==="public"&&kt.description)||V.find(kt=>kt.description),_e=(ee==null?void 0:ee.description)||"";return _e.match(/setting for (.+)\.$/i)?`${Ha(R)} settings and runtime behaviour.`:_e}function pe(R){const V=[...new Set(ie(R).map(ee=>ee.apply_mode))];return V.length===1?V[0]:V.includes("restart")?"restart":V.includes("activation_required")?"activation_required":V[0]||"restart"}function be(R){const V=[...new Set(ie(R).map(ee=>xe(ee.apply_mode)))];return V.length?V.length===1?V[0]:`Mixed apply behaviour: ${V.join(" · ")}`:""}function Ae(R){return zl(ie(R))}function F(R){var V;return Object.hasOwn(y.value,R)?y.value[R]:(V=e.value)==null?void 0:V[R]}function ye(){const R=F("mcp")||{},V=Object.keys(R.servers||{}).length;return`${R.enabled?"Globally enabled":"Globally disabled"} · ${V} configured server${V===1?"":"s"}.`}function Se(R,V){return V.split(".").reduce((ee,_e)=>ee==null?void 0:ee[_e],R)}function Le(R){const V=Q.value;return ie(R).filter(ee=>gp(ee.path)?!1:ee.path.split(".").length<=2?!0:!ee.path.includes(".*")).map(ee=>({...ee,key:ee.path.split(".").at(-1),value:Se(V,ee.path),apply_details:zl([ee]),editor:ee.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Pe(R){const V=R.path.split(".");return V.length>2?V.slice(0,2).join("."):null}function ct(R){const V=new Map;for(const ee of Le(R)){const _e=Pe(ee),Ve=_e||`${R}.__root`;V.has(Ve)||V.set(Ve,{key:Ve,path:_e,entries:[]}),V.get(Ve).entries.push(ee)}return[...V.values()].map(ee=>{const _e=ee.entries.find(Ve=>Ve.group_description);return{...ee,label:ee.path?Ha(ee.path.split(".").at(-1)):null,description:(_e==null?void 0:_e.group_description)||null,apply_details:zl(ee.entries),runtime_summaries:xt(ee.entries)}})}function lt(R){return{save:R.save_effect||(R.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:R.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[R.apply_mode]||"Effective runtime state is not currently observable."}}function xt(R){const V=new Map;for(const ee of R){const _e=lt(ee),Ve=`${ee.apply_mode}|${_e.save}|${_e.runtime}`;V.has(Ve)||V.set(Ve,{key:Ve,label:xe(ee.apply_mode),save:_e.save,runtime:_e.runtime})}return[...V.values()]}function Ut(R){if(nt(R))return R.runtime_effect||R.activation_policy||"";if(R.apply_mode==="activation_required"){const V=R.activation_policy||R.runtime_effect;return V?`Not active after saving. No activation control exists in this release. ${V}`:"Not active after saving; no activation control exists in this release."}return""}function nt(R){return R.action_available===!0&&!!(R.action_label&&R.action_endpoint)}async function et(R){if(nt(R))try{if(Ht(R.path))throw new Error("Save this setting before applying its action.");const V=String(R.action_method||"POST").toLowerCase(),ee={post:B.post.bind(B),put:B.put.bind(B),delete:B.del.bind(B)}[V];if(!ee)throw new Error("Unsupported configuration action");await ee(R.action_endpoint,R.action_body||void 0),await vt(),ke("success",`${R.action_label} completed.`)}catch(V){ke("error",V.message||`${R.action_label} failed`)}}function oe(R,V){return[R.label,R.path,R.description,...R.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(V)}function Ce(R){const V=m.value.trim().toLowerCase();return V?ie(R).filter(ee=>oe(ee,V)):[]}function Ne(R){const V=ie(R);if(v.value!=="all"&&!V.some(_e=>_e.apply_state===v.value))return!1;const ee=m.value.trim().toLowerCase();return!ee||`${Y(R)} ${R}`.toLowerCase().includes(ee)?!0:V.some(_e=>oe(_e,ee))}function We(R,V){return ie(R).filter(ee=>ee.apply_state===V).length}function Lt(R){return R==="all"?U.value:C.value.filter(V=>V.apply_state===R).length}function qe(R){const V=R.sections.flatMap(ee=>ie(ee));return{fields:V.length,modified:ue.value.filter(ee=>R.sections.includes(ee.path.split(".")[0])).length,pending_restart:V.filter(ee=>ee.apply_state==="pending_restart").length,invalid:V.filter(ee=>ee.apply_state==="invalid").length,dormant:V.filter(ee=>ee.apply_state==="dormant").length}}function Bt(R){var V;return Object.hasOwn(y.value,R)&&!Za((V=e.value)==null?void 0:V[R],y.value[R])}function Ht(R){return ue.value.some(V=>V.path===R||V.path.startsWith(`${R}.`))}function ms(R){T.value=R,m.value="",v.value="all";try{localStorage.setItem(dv,R)}catch{}}function Xs(R){v.value=R}function Ls(){m.value="",v.value="all"}function Bn(R){var V;return((V=re.value.find(ee=>ee.sections.includes(R)))==null?void 0:V.sections)||[]}function hn(R){const V=Bn(R),ee=V.find(_e=>L.value[_e]===!0);return ee||V.find(_e=>L.value[_e]!==!1)||null}function Ns(R){return m.value&&!$.value&&Ne(R)?!0:$.value?hn(R)===R:Object.hasOwn(L.value,R)?L.value[R]===!0:!0}function Hn(R){const V=!Ns(R);if($.value){const ee={...L.value};for(const _e of Bn(R))ee[_e]===!0&&(ee[_e]=!1);ee[R]=V,L.value=ee;return}L.value={...L.value,[R]:V}}function vs(){I.value.push(fa(y.value)),I.value.length>aS&&I.value.shift(),E.value=[]}function mn(){a.value||Ie.value&&(vs(),y.value={},_.value={},x.value=!1)}function Ds(R,V=!1){const ee=Date.now();if(V&&H.path===R&&ee-H.at<iS){H.at=ee;return}vs(),H={path:R,at:ee}}function Ze(R,V,ee){if(!V.length)return ee;const _e=fa(R??{});let Ve=_e;for(let kt=0;kt<V.length-1;kt+=1){const Ks=V[kt];Ve[Ks]=fa(Ve[Ks]??{}),Ve=Ve[Ks]}return Ve[V.at(-1)]=ee,_e}function Ms(R){var V;return Object.hasOwn(y.value,R)?y.value[R]:fa((V=e.value)==null?void 0:V[R])}function Nt(R,V,ee={}){var Fa;if(a.value||jl.has(R.path.split(".")[0]))return;const[_e,...Ve]=R.path.split(".");Ds(R.path,!!ee.coalesce);const kt=Ms(_e),Ks=Ve.length?Ze(kt,Ve,V):V,tn={...y.value};if(Za(Ks,(Fa=e.value)==null?void 0:Fa[_e])?delete tn[_e]:tn[_e]=Ks,y.value=tn,_.value[R.path]){const ra={..._.value};delete ra[R.path],_.value=ra}}function ne(R){H={path:null,at:0},g.value={...g.value,[R]:String(Se(Q.value,R)??"")}}function Te(R){if(H={path:null,at:0},!Object.hasOwn(g.value,R))return;const V={...g.value};delete V[R],g.value=V}function Fe(R){const V=g.value[R.path];if(H={path:null,at:0},V===""){if(R.nullable){Te(R.path),Nt(R,null,{coalesce:!0});return}_.value={..._.value,[R.path]:"Enter a number."};return}const ee=Number(V);if(Number.isNaN(ee)||R.type==="integer"&&!Number.isInteger(ee)){_.value={..._.value,[R.path]:R.type==="integer"?"Enter a whole number.":"Enter a number."};return}const _e={...g.value};delete _e[R.path],g.value=_e,Nt(R,ee,{coalesce:!0})}function Ye(R){return Object.hasOwn(g.value,R.path)?g.value[R.path]:R.value??""}function _t(R,V){if(g.value={...g.value,[R.path]:V},V===""){if(R.nullable){Nt(R,null,{coalesce:!0});return}_.value={..._.value,[R.path]:"Enter a number."};return}const ee=Number(V);if(!Number.isFinite(ee)||R.type==="integer"&&!Number.isInteger(ee)){_.value={..._.value,[R.path]:R.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(_.value[R.path]){const _e={..._.value};delete _e[R.path],_.value=_e}Nt(R,ee,{coalesce:!0})}function dt(R){const V=Number.parseInt(b.value,10);if(!Number.isInteger(V)||V<1){_.value={..._.value,[R.path]:"Warning thresholds must be positive whole numbers."};return}const ee=[...new Set([...R.value||[],V])].sort((_e,Ve)=>Ve-_e);b.value="",Nt(R,ee)}function zn(R,V){Nt(R,(R.value||[]).filter(ee=>ee!==V))}function qs(R){return R.apply_mode==="live_read"?"Odin reads the saved file value on next use.":R.apply_mode==="live_for_new_work"?"New work uses the saved file value.":R.apply_mode==="live_apply"?R.apply_handler?`Apply the saved value through ${R.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":R.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":R.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":R.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function wi(R){return R.type==="array"&&Array.isArray(R.value)&&!R.structured_container&&!R.structured_container_child&&R.sensitivity==="public"&&R.value.every(V=>["string","number","boolean"].includes(typeof V))}function ki(R){const V=String(A.value[R.path]??"").trim();if(!V)return;const ee=[...new Set([...R.value||[],V])];A.value={...A.value,[R.path]:""},Nt(R,ee)}function Na(R,V){Nt(R,(R.value||[]).filter(ee=>ee!==V))}function Da(R,V){var _e;if(!R)return null;if((_e=R.enum)!=null&&_e.length&&!R.enum.includes(V))return`Choose one of: ${R.enum.join(", ")}`;if(R.path==="agents.final_warning_iterations"&&(!Array.isArray(V)||!V.length))return"Add at least one warning threshold.";const ee=R.constraints||{};if((R.type==="integer"||R.type==="number")&&typeof V=="number"){if(ee.minimum!==void 0&&V<ee.minimum)return`Must be at least ${ee.minimum}${R.unit?` ${R.unit}`:""}`;if(ee.maximum!==void 0&&V>ee.maximum)return`Must be at most ${ee.maximum}${R.unit?` ${R.unit}`:""}`}return null}function la(R){return de.value[R.path]||null}function jn(R){const V=`${R}.`;return Object.keys(de.value).some(ee=>ee===R||ee.startsWith(V))}function Gs(){a.value||I.value.length&&(E.value.push(fa(y.value)),y.value=I.value.pop(),_.value={},g.value={},H={path:null,at:0})}function en(){a.value||E.value.length&&(I.value.push(fa(y.value)),y.value=E.value.pop(),_.value={},g.value={},H={path:null,at:0})}function Ts(){!Ie.value||he.value||(x.value=!0,N.value=!1)}function Ma(){x.value=!1}function J(){mn()}function xe(R){return sS[R]||Ha(R||"unknown")}function Re(R){return`apply-${String(R||"unknown").replaceAll("_","-")}`}function gs(R){return`cfgc-field-${R.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function vn(R){return`${gs(R)}-input`}function Vn(R){const V=document.getElementById(gs(R))||document.getElementById(gs(R.split(".").slice(0,2).join(".")));V==null||V.scrollIntoView({behavior:"smooth",block:"center"})}function ke(R,V){c.value={type:R,message:V},window.setTimeout(()=>{var ee;((ee=c.value)==null?void 0:ee.message)===V&&(c.value=null)},3500)}function D(){u.value=!1,v.value="pending_restart",m.value="";const R=tS(n.value);R&&(R.scrollTop=0)}function le(){u.value=!1}function ve(R=1800){M&&window.clearTimeout(M),M=window.setTimeout(De,R)}async function De(){if(p.value){if(K+=1,K>45){p.value=!1,f.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Ii(),ce.value===0){p.value=!1,f.value=null,ke("success","Odin restarted and the saved startup settings are active.");return}}catch{}ve(2e3)}}async function $e(){if(!p.value){f.value=null;try{await B.post("/api/restart",{}),p.value=!0,K=0,u.value=!1,ve()}catch(R){f.value=R.message||"Odin could not schedule a restart."}}}async function Be(){if(!(!Ie.value||he.value||a.value)){a.value=!0;try{const R=rS(e.value,y.value),V=await B.put("/api/config",R);e.value=V,y.value={},I.value=[],E.value=[],_.value={},x.value=!1;try{t.value=await Ii(),d.value=null,u.value=ce.value>0,ke("success",ce.value?`Configuration saved. ${ce.value} setting${ce.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(ee){d.value=ee.message||"Unknown metadata error.",ke("error",`Configuration saved, but apply status could not be refreshed: ${d.value}`)}}catch(R){ke("error",R.message||"Configuration could not be saved")}finally{a.value=!1}}}async function At(){if(!a.value){a.value=!0,i.value=null;try{t.value=await Ii(),d.value=null}catch(R){i.value=`Image model status could not be refreshed: ${R.message||"Unknown error"}`}finally{a.value=!1}}}async function ut(R,V){if(a.value||!["follow","pin"].includes(V)||!R.length||R.some(_e=>{var Ve,kt;return!l.includes(_e)||!((kt=(Ve=t.value)==null?void 0:Ve.image_model_defaults)!=null&&kt[_e])}))return;a.value=!0,i.value=null;let ee=!1;try{const _e=await B.post("/api/config/image-models",{operations:Object.fromEntries(R.map(Ve=>[Ve,V])),expected_revision:t.value.image_model_revision});ee=!0;for(const Ve of R){const kt=`image.openai.${Ve}`,Ks=Se(e.value,kt),tn=Se(_e.config,kt),Fa=ra=>!Object.hasOwn(ra,"image")||!Za(Se(ra,kt),Ks)?ra:Ze(ra,kt.split("."),tn);y.value=Fa(y.value),I.value=I.value.map(Fa),E.value=E.value.map(Fa),e.value=Ze(e.value,kt.split("."),tn)}t.value={...t.value,image_model_defaults:_e.image_model_defaults,image_model_revision:_e.image_model_revision},ke("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(_e){i.value=`Image model operation failed: ${_e.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await Ii(),d.value=null}catch(_e){const Ve=`Image model status could not be refreshed: ${_e.message||"Unknown error"}`;d.value=Ve,i.value=ee?`Image model defaults were saved, but ${Ve}`:`${i.value} ${Ve}`}finally{a.value=!1}}async function vt(){var R,V;if(!(Ie.value||a.value)){s.value=!0,r.value=null;try{const ee=await B.get("/api/config"),_e=await Ii();e.value=ee,t.value=_e,d.value=null;const Ve=re.value;if(Ve.some(kt=>kt.key===T.value)||(T.value=((R=Ve[0])==null?void 0:R.key)||li[0].key),$.value){const Ks=(((V=Ve.find(tn=>tn.key===T.value))==null?void 0:V.sections)||[]).find(tn=>L.value[tn]===!0);L.value=Ks?{...L.value,[Ks]:!0}:{}}}catch(ee){r.value=ee.message||"Unknown configuration error"}finally{s.value=!1}}}function Ps(R){if(x.value||!(R.ctrlKey||R.metaKey))return;const V=R.target;V instanceof HTMLElement&&(V.matches("input, textarea, select")||V.isContentEditable)||(!R.shiftKey&&R.key.toLowerCase()==="z"?(R.preventDefault(),Gs()):(R.key.toLowerCase()==="y"||R.shiftKey&&R.key.toLowerCase()==="z")&&(R.preventDefault(),en()))}function wt(R){$.value=R.matches}Ft(L,R=>{try{localStorage.setItem(cv,JSON.stringify(R))}catch{}},{deep:!0});let oa=!1;function Pa(){oa||(oa=!0,document.addEventListener("keydown",Ps))}function dr(){oa&&(oa=!1,document.removeEventListener("keydown",Ps))}return je(()=>{var R;vt(),Pa(),k=window.matchMedia("(max-width: 760px)"),wt(k),(R=k.addEventListener)==null||R.call(k,"change",wt)}),es(Pa),Wt(dr),ft(()=>{var R;dr(),(R=k==null?void 0:k.removeEventListener)==null||R.call(k,"change",wt),M&&window.clearTimeout(M)}),{armKeydown:Pa,disarmKeydown:dr,handleKeydown:Ps,config:e,meta:t,loading:s,saving:a,error:r,toast:c,metaRefreshError:d,restartPromptOpen:u,restartScheduled:p,restartError:f,configMain:n,imageModelError:i,imageModelLeaves:l,imageModelMetadataReady:o,setImageModelDefaults:ut,refreshImageModelMetadata:At,searchQuery:m,healthFilter:v,activeCategory:T,reviewOpen:x,mobileOverflowOpen:N,warningThresholdInput:b,arrayInputs:A,healthFilters:Z,visibleCategories:re,displayGroups:Oe,reviewGroups:w,sectionCount:O,fieldCount:U,hasChanges:Ie,changeCount:se,changedSectionCount:ge,hasDraftErrors:he,canUndo:W,canRedo:te,globalFilterActive:q,reviewRestartCount:P,pendingRestartCount:ce,pendingRestartFields:j,healthCount:Lt,categoryStats:qe,selectCategory:ms,selectHealthFilter:Xs,clearFilters:Ls,sectionLabel:Y,sectionDescription:fe,sectionFieldCount:X,sectionHealthCount:We,sectionApplySummary:be,sectionApplyDetails:Ae,sectionEntries:Le,fieldGroups:ct,sectionSearchHits:Ce,mcpConfigSummary:ye,fieldRuntimeCopy:lt,fieldSpecificRuntimeNote:Ut,hasHonestAction:nt,runFieldAction:et,hasHostsCollection:me,hostsConfigSummary:z,sectionChanged:Bt,fieldChanged:Ht,isSectionExpanded:Ns,toggleSection:Hn,discardAllDrafts:mn,setFieldValue:Nt,setNumberFieldValue:_t,numberInputValue:Ye,beginInputEdit:ne,endTextInputEdit:Te,endInputEdit:Fe,addWarningThreshold:dt,removeWarningThreshold:zn,isScalarArray:wi,addScalarArrayItem:ki,removeScalarArrayItem:Na,fieldError:la,sectionHasErrors:jn,undo:Gs,redo:en,openReview:Ts,closeReview:Ma,mobileCancel:J,applyModeLabel:xe,applyClass:Re,compactValue:lS,formatValue:oS,structuredApplyCopy:qs,fieldId:gs,fieldInputId:vn,focusField:Vn,fetchConfig:vt,saveConfig:Be,restartOdin:$e,restartLater:le,reviewPendingRestart:D}}},pS=/^\d{15,25}$/;function fv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const hv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=G(()=>new Set((e.excludedIds||[]).map(String))),o=G(()=>{const A=s.value.toLowerCase().trim();return(e.members||[]).filter(_=>l.value.has(String(_.id))?!1:A?u(_).toLowerCase().includes(A)||String(_.username||"").toLowerCase().includes(A)||String(_.id).includes(A):!0)}),r=G(()=>{const A=s.value.trim();return o.value.length===0&&pS.test(A)&&!l.value.has(A)?A:""}),c=G(()=>o.value.length+(r.value?1:0)),d=G(()=>{if(n.value){if(o.value[a.value])return`${e.optionsId}-${a.value}`;if(r.value&&a.value===o.value.length)return`${e.optionsId}-raw`}});function u(A){return fv(A)}function p(){n.value=!0,a.value=0}function f(){p()}function m(){const A=Math.max(c.value-1,0);a.value=Math.min(a.value+1,A)}function v(){a.value=Math.max(a.value-1,0)}function T(){const A=o.value[a.value];A?L(A):r.value&&a.value===o.value.length&&y(r.value)}function L(A){y(String(A.id))}function y(A){t("select",A),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function b(){setTimeout(g,150)}return je(()=>{e.autofocus&&It(()=>{var A;return(A=i.value)==null?void 0:A.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:m,highlightPrevious:v,selectHighlighted:T,selectMember:L,selectId:y,closeOptions:g,onBlur:b}}};function bp(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const fS={components:{DiscordUserCombobox:hv},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),o=h(null),r=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=G(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=G(()=>new Map(c.value.map(C=>[String(C.id),C])));function m(C){return C.config&&C.config.enabled!==void 0?C.config.enabled:!0}function v(C){return bp(C,"require_mention",a.value)}function T(C){return bp(C,"respond_to_bots",a.value)}function L(C){return C.config&&Object.keys(C.config).length>0}function y(C){n.value[C]=!n.value[C]}function g(C){const S=C.discord||{};return{allowed_users:[...S.allowed_users||[]],channels:[...S.channels||[]],respond_to_bots:!!S.respond_to_bots,require_mention:!!S.require_mention,ignore_bot_ids:[...S.ignore_bot_ids||[]]}}async function b({showLoading:C=!0}={}){const S=++d;C&&(t.value=!0),s.value=null;try{const O=await B.get("/api/discord/guilds");S===d&&(e.value=O)}catch(O){S===d&&(s.value=O.message)}finally{C&&S===d&&(t.value=!1)}}async function A(){t.value=!0,s.value=null;try{const[C,S,O]=await Promise.all([B.get("/api/discord/guilds"),B.get("/api/discord/members").catch(()=>[]),B.get("/api/config")]),U=g(O),Z=p.value;a.value=U,Z||(i.value=JSON.parse(JSON.stringify(U))),c.value=S,e.value=C,o.value=null}catch(C){s.value=C.message}finally{t.value=!1}}let _=Promise.resolve();const I=h(new Set);function E(C,S){const O=new Set(I.value);O.add(C),I.value=O;const U=_.then(S);return _=U.catch(()=>{}),U.finally(()=>{const Z=new Set(I.value);Z.delete(C),I.value=Z})}function x(C,S,O,U){const Z=(U==null?void 0:U.target)??null;return E(`guild:${C}:${S}`,async()=>{try{await B.put("/api/discord/guild/"+C+"/config",{[S]:O}),await b({showLoading:!1})}catch(W){s.value=W.message,Z&&typeof O=="boolean"&&(Z.checked=!O)}})}function N(C,S,O,U,Z){const W=(Z==null?void 0:Z.target)??null;return E(`channel:${C}:${O}`,async()=>{try{await B.put("/api/discord/channel/"+C+"/config",{[O]:U}),await b({showLoading:!1})}catch(te){s.value=te.message,W&&typeof U=="boolean"&&(W.checked=!U)}})}function $(C,S){return E(`channel:${C}:clear`,async()=>{try{await B.put("/api/discord/channel/"+C+"/config",{clear:!0}),await b({showLoading:!1})}catch(O){s.value=O.message}})}function k(C,S){const O=String(S);if(!C.userAutocomplete)return O;const U=f.value.get(O);return U?fv(U):O}function M(C,S=null){const O=String(S??r.value[C]??"").trim();!O||i.value[C].includes(O)||(i.value[C]=[...i.value[C],O],r.value={...r.value,[C]:""})}function H(C,S){i.value[C]=i.value[C].filter(O=>O!==S)}async function K(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const S=(await B.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...S.allowed_users||[]],channels:[...S.channels||[]],respond_to_bots:!!S.respond_to_bots,require_mention:!!S.require_mention,ignore_bot_ids:[...S.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(C){o.value=C.message||"Global defaults could not be saved."}finally{l.value=!1}}}return je(A),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:T,hasOverride:L,toggleGuild:y,fetchAll:A,fetchGuilds:b,setGuildConfig:x,setChannelConfig:N,clearOverride:$,mutationPending:I,globalItemLabel:k,addGlobalItem:M,removeGlobalItem:H,saveGlobalDefaults:K}}},Cs=e=>e==null?e:JSON.parse(JSON.stringify(e));function hS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const m=new Map;function v(_){d+=1;const I=c.then(_,_);return c=I.catch(()=>{}),I}function T(_,I){f=Cs(_),m.clear();for(const[E,x]of Object.entries(I||{}))m.set(E,Cs(x))}function L(_){const I=Cs(_),E=++u;return v(async()=>{try{await e(Cs(I)),f=Cs(I),E===u&&n(Cs(I))}catch(x){E===u&&(a(Cs(f)),r(x,{kind:"default"}))}})}function y(_,I){const E=Cs(I),x=(p.get(_)||0)+1;return p.set(_,x),v(async()=>{try{await t(_,Cs(E)),m.set(_,Cs(E)),x===p.get(_)&&i(_,Cs(E))}catch(N){x===p.get(_)&&(l(_,Cs(m.get(_)??null)),r(N,{kind:"user",uid:_}))}})}function g(_){const I=(p.get(_)||0)+1;return p.set(_,I),v(async()=>{try{await s(_),m.delete(_),I===p.get(_)&&o(_)}catch(E){I===p.get(_)&&(l(_,Cs(m.get(_)??null)),r(E,{kind:"delete",uid:_}))}})}async function b(){for(;;){const _=c;if(await _,_===c)return d}}async function A(_){for(;;){const I=await b(),E=await _();if(I===d)return E}}return{seed:T,saveDefault:L,saveUser:y,deleteUser:g,whenIdle:b,readSnapshot:A,get revision(){return d}}}const mS={components:{DiscordUserCombobox:hv},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({}),i=h({allowed_hosts:[],default_host:""}),l=h({}),o=h(!1),r=h([]),c=G(()=>{const k={};for(const M of r.value)k[M.id]=M;return k});function d(k){return c.value[k]||null}function u(k,M){return k?k.allowed_hosts===null||k.allowed_hosts===void 0?{allowed_hosts:[...M],default_host:k.default_host||"",allow_all:!0}:{allowed_hosts:k.allowed_hosts,default_host:k.default_host||"",allow_all:!1}:{allowed_hosts:[...M],default_host:M[0]||"",allow_all:!0}}const p=hS({applyDefault:async k=>{const M=k.allow_all?null:k.allowed_hosts;await B.put("/api/host-access/default-policy",{allowed_hosts:M,default_host:k.default_host})},applyUser:async(k,M)=>{const H=M.allow_all?null:M.allowed_hosts;await B.put(`/api/host-access/user/${k}`,{allowed_hosts:H,default_host:M.default_host})},applyDelete:k=>B.del(`/api/host-access/user/${k}`),onDefaultConfirmed:()=>we.success("Default policy updated"),onDefaultRollback:k=>{k&&(i.value=k)},onUserConfirmed:k=>{const M=d(k);we.success(`Updated access for ${M?M.display_name:k}`)},onUserRollback:(k,M)=>{const H={...l.value};M?H[k]=M:delete H[k],l.value=H},onUserDeleted:k=>{const M={...l.value};delete M[k],l.value=M},onError:(k,M)=>{var K;const H=M.uid?` ${((K=d(M.uid))==null?void 0:K.display_name)||M.uid}`:"";we.error(`${k.message||"Failed to save"} — reverted${H}`)}});let f=0;async function m(){const k=++f;e.value=!0,t.value="";try{const M=await p.readSnapshot(()=>B.get("/api/host-access"));if(k!==f)return;s.value=M,n.value=M.available_hosts||[],a.value=M.host_descriptions||{},i.value=u(M.default_policy,n.value);const H=M.users||{},K={};for(const[C,S]of Object.entries(H))K[C]=u(S,n.value);l.value=K,p.seed(i.value,K)}catch(M){k===f&&(t.value=M.message||"Failed to fetch host access data")}finally{k===f&&(e.value=!1)}try{const M=await B.get("/api/discord/members")||[];k===f&&(r.value=M)}catch{k===f&&(r.value=[])}}const v=500,T=new Map;function L(k,M){const H=T.get(k);H&&clearTimeout(H.timer);const K={run:M,timer:null};K.timer=setTimeout(()=>{T.delete(k),M()},v),T.set(k,K)}function y(k){const M=T.get(k);M&&(clearTimeout(M.timer),T.delete(k))}function g(){for(const[k,M]of[...T])clearTimeout(M.timer),T.delete(k),M.run()}function b(){L("default",()=>p.saveDefault(i.value))}function A(k,M){i.value.allow_all=!1,M?i.value.allowed_hosts.includes(k)||i.value.allowed_hosts.push(k):(i.value.allowed_hosts=i.value.allowed_hosts.filter(H=>H!==k),i.value.default_host===k&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function _(k){L(`user:${k}`,()=>{const M=l.value[k];M&&p.saveUser(k,M)})}function I(k,M,H){const K=l.value[k];K&&(K.allow_all=!1,H?K.allowed_hosts.includes(M)||K.allowed_hosts.push(M):(K.allowed_hosts=K.allowed_hosts.filter(C=>C!==M),K.default_host===M&&(K.default_host=K.allowed_hosts[0]||"")),_(k))}function E(k,M){const H=l.value[k];H&&(H.default_host=M,_(k))}function x(){o.value=!0}function N(k){!/^\d{15,25}$/.test(k)||l.value[k]||(l.value[k]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},p.saveUser(k,l.value[k]),o.value=!1)}async function $(k){const M=d(k);await Kt({title:"Remove user override",message:`Remove the host access override for ${M?M.display_name:k}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${k}`),await p.deleteUser(k),l.value[k]||we.success(`Removed override for ${M?M.display_name:k}`))}return je(m),Wt(g),ft(g),{loading:e,error:t,data:s,availableHosts:n,hostDescriptions:a,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:A,getMember:d,toggleUserHost:I,setUserDefault:E,openAddUser:x,addUserById:N,deleteUser:$,flushPendingSaves:g}}},vS={template:`
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
    </div>`,setup(){const e=h([]),t=h(!1),s=h(""),n=h([]),a=h(!1),i=h(!1),l=h(1),o=h(""),r=h(!1),c=h(null),d=h(""),u=h([]),p=h(!1),f=h(null),m=h(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),T=h(v()),L=G(()=>["127.0.0.1","localhost","::1"].includes(T.value.address));async function y(){t.value=!0,s.value="";try{const K=await B.get("/api/hosts");e.value=K.hosts||[],o.value=K.default_host||"",r.value=!!K.tofu_enabled}catch(K){s.value=K.message}finally{t.value=!1}}async function g(){try{await B.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),we.success("Host settings saved and published live"),await y()}catch(K){we.error(K.message)}}function b(){d.value="",u.value=[],p.value=!1,f.value=null,c.value=null,m.value="",l.value=1,a.value=!0}function A(){i.value=!1,T.value=v(),b()}function _(K){i.value=!0,T.value={...v(),...K},b()}async function I(){try{c.value=await B.get("/api/hosts/public-key")}catch(K){we.error(K.message)}}async function E(K){try{const C=await B.post("/api/hosts/"+encodeURIComponent(K.alias)+"/import-legacy",{});i.value=!0,T.value={...v(),...K,trust_mode:"pinned"},b(),d.value=C.candidate_token,u.value=C.fingerprints||[],m.value=u.value.join(`
`),l.value=4,we.info("Imported existing known_hosts trust. Test before activation.")}catch(C){we.error(C.message)}}async function x(){try{const K=m.value.split(/\s+/).filter(Boolean),C={...T.value,expected_fingerprints:K,candidate_fingerprints:u.value},S=await B.post("/api/hosts/candidates",C);if(d.value=S.candidate_token,u.value=S.fingerprints||[],T.value.trust_mode==="tofu"&&C.candidate_fingerprints.length===0){T.value.confirm_tofu=!1,we.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(K){we.error(K.message)}}async function N(){var K,C;p.value=!1,f.value=null;try{const S=await B.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!S.tested,f.value=S.last_test,p.value&&(l.value=5)}catch(S){const O=(K=S.data)==null?void 0:K.last_test;O&&typeof O=="object"&&!Array.isArray(O)&&(f.value=O);const U=(C=f.value)==null?void 0:C.detail;we.error(typeof U=="string"&&U.trim()?U:S.message)}}async function $(){try{await B.post("/api/hosts/candidates/"+d.value+"/commit",{}),we.success("Host saved and published live"),a.value=!1,await y()}catch(K){we.error(K.message)}}async function k(K){try{await B.post("/api/hosts/"+encodeURIComponent(K.alias)+"/enabled",{enabled:!K.enabled}),await y()}catch(C){we.error(C.message)}}async function M(K){var C;if(await Kt("Delete host "+K.alias+"? Dependencies will block deletion.")){n.value=[];try{await B.del("/api/hosts/"+encodeURIComponent(K.alias)),await y()}catch(S){n.value=Array.isArray((C=S.data)==null?void 0:C.pending_references)?S.data.pending_references:[],we.error(S.message)}}}async function H(K){if(await Kt("Force revoke "+K.alias+"? Remote outcomes may be unknown."))try{await B.post("/api/hosts/"+encodeURIComponent(K.alias)+"/force-revoke",{}),await y()}catch(C){we.error(C.message)}}return je(y),{hosts:e,loading:t,error:s,pendingReferences:n,wizard:a,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:T,isLocal:L,keyInfo:c,candidate:d,observed:u,tested:p,testResult:f,fingerprintsText:m,load:y,saveSettings:g,beginAdd:A,beginEdit:_,loadKey:I,importLegacy:E,prepare:x,testConnection:N,commit:$,toggle:k,remove:M,forceRevoke:H}}},gS={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),o=h(null),r=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=G(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=G(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(E){return E==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":E==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const E=await B.get("/api/tokens");s.value=E.tokens||[],n.value=E.available_hosts||[]}catch(E){t.value=E.message||"Failed to load tokens"}finally{e.value=!1}}function v(E){return!E||!E.trim()?[]:E.split(",").map(x=>x.trim()).filter(Boolean)}function T(E,x){const N=c.value.allowed_hosts;if(x&&!N.includes(E)&&N.push(E),!x){const $=N.indexOf(E);$>=0&&N.splice($,1)}}function L(E,x){const N=d.value.allowed_hosts;if(x&&!N.includes(E)&&N.push(E),!x){const $=N.indexOf(E);$>=0&&N.splice($,1)}}async function y(){var E;i.value=!0;try{const x=v(c.value.allowed_tools_str),N=c.value.host_mode,$=N==="none"?[]:N==="select"?c.value.allowed_hosts:null,k={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:x.length?x:[]};$!==null&&(k.allowed_hosts=$),k.default_host=c.value.default_host||"";const M=await B.post("/api/tokens",k);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,we.success("Token created"),await m()}catch(x){we.error(((E=x.data)==null?void 0:E.error)||x.message||"Failed to create token")}finally{i.value=!1}}function g(E){o.value=E;const x=E.allowed_hosts;let N="default";x==null?N="default":Array.isArray(x)&&x.length===0?N="none":Array.isArray(x)&&(N="select"),d.value={username:E.username||"",tier:E.tier||"admin",label:E.label||"",host_mode:N,allowed_hosts:Array.isArray(x)?[...x]:[],default_host:E.default_host||"",allowed_tools_str:(E.allowed_tools||[]).join(", ")}}async function b(){var E;if(o.value){r.value=!0;try{const x=v(d.value.allowed_tools_str),N=d.value.host_mode,$={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:x};N==="none"?$.allowed_hosts=[]:N==="select"?$.allowed_hosts=d.value.allowed_hosts:$.allowed_hosts=null,$.default_host=d.value.default_host||"",await B.put("/api/tokens/"+encodeURIComponent(o.value.user_id),$),o.value=null,we.success("Token updated"),await m()}catch(x){we.error(((E=x.data)==null?void 0:E.error)||x.message||"Failed to update")}finally{r.value=!1}}}async function A(E){var N;if(await Kt({title:"Regenerate token",message:`Regenerate token for ${E.username||E.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const $=await B.post("/api/tokens/"+encodeURIComponent(E.user_id)+"/regenerate");l.value=$.token,we.success("Token regenerated")}catch($){we.error(((N=$.data)==null?void 0:N.error)||$.message||"Failed to regenerate")}}async function _(E){var N;if(await Kt({title:"Delete token",message:`Delete token for ${E.username||E.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await B.del("/api/tokens/"+encodeURIComponent(E.user_id)),we.success("Token deleted"),await m()}catch($){we.error(((N=$.data)==null?void 0:N.error)||$.message||"Failed to delete")}}async function I(){if(l.value)try{await navigator.clipboard.writeText(l.value),we.success("Copied to clipboard")}catch{we.error("Copy failed — select and copy manually")}}return je(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:f,toggleCreateHost:T,toggleEditHost:L,createToken:y,startEdit:g,saveEdit:b,confirmRegenerate:A,confirmDelete:_,copyToken:I}}},bS=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),yS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),xS=Object.freeze(["enabled","base_url","model","max_tokens"]),_S=Object.freeze(["enabled","model","max_tokens"]);function or(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function yp(e){return or(e,bS)}function xp(e){return or(e,yS)}function wS(e,{includeApiKey:t=!1}={}){const s=or(e,xS);return t&&(s.api_key=e.api_key),s}function kS(e){return{timeout:e.timeout}}function SS(e,{includeApiKey:t=!1}={}){const s=or(e,_S);return t&&(s.api_key=e.api_key),s}function TS(e){return{timeout:e.timeout}}function Vl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const CS={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("codex"),a=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=G(()=>{const J=a.value.model;return J&&!i.includes(J)?[J,...i]:i}),o=G(()=>{const J=a.value.agent_model;return J&&J!=="auto"&&!i.includes(J)?[J,...i]:i}),r={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(J,xe)=>!!J&&!!xe&&(r[J]||[]).includes(xe),d=J=>!c(a.value.model,J)&&!(a.value.agent_reasoning_effort===""&&c(a.value.agent_model,J)),u=J=>{const xe=a.value.agent_model;return xe==="auto"?!0:!c(xe||a.value.model,J)},p=G(()=>{const J=a.value.agent_reasoning_effort;return J==="auto"?null:J||a.value.reasoning_effort}),f=J=>c(J,a.value.reasoning_effort)||a.value.agent_model===""&&c(J,p.value),m=J=>c(J,p.value),v=h({enabled:!1,model:"gpt-5.6-luna"}),T=h({unavailable_reason:null}),L=G(()=>{const J=v.value.model;return J&&!i.includes(J)?[J,...i]:i});function y(J){const xe=J.target.value;v.value.enabled=xe!=="",xe!==""&&(v.value.model=xe),ne()}const g=h(!1),b=h({codex:!1,ollama:!1,kimi:!1}),A=h(null),_=h(!1),I=h(""),E=h(null),x=h(!1);let N=0;const $=G(()=>{var J;return Object.entries(((J=A.value)==null?void 0:J.models)||{}).map(([xe,Re])=>{var gs,vn,Vn;return{model:xe,floor:Re.floor,override:Re.override,effectiveBudget:(gs=Re.effective)==null?void 0:gs.effective_budget,configuredPrimaryChars:(vn=Re.configured)==null?void 0:vn.primary_chars,primaryChars:(Vn=Re.effective)==null?void 0:Vn.primary_chars,provenance:Re.provenance,clampExpiresAt:Re.clamp_expires_at,densityPriorMilli:Re.density_prior_milli,densityScope:Re.density_scope,workloadCalibration:Re.workload_calibration}})}),k=G(()=>{var J;return((J=A.value)==null?void 0:J.clamps)||[]}),M=G(()=>{var J,xe;return((xe=(J=A.value)==null?void 0:J.models)==null?void 0:xe[a.value.model])||null}),H=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),K=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),C=h(!1),S=h(!1),O=h(!1),U=h(!1),Z=h(!1),W=h(!1),te=h(!1),re=h({configured:null}),Q=h(!1),ue=h([]),Ie=h(""),se=h(!1),ge=h(!1),q=h({configured:null}),de=h(!1),he=h([]),Oe=h(""),w=h(!1),P=h(!1),j=h(!0),ce=h(""),ae=h({configured:null,accounts:[]}),ie=h(null),me=h(null),z=h(""),X=h(null),Y=h(!1),fe=h(null),pe=h(null),be=h("");let Ae=null;function F(J,xe="success"){we(J,xe==="error"?"error":"success")}function ye(J){if(!J)return"?";const xe=J/(1024*1024*1024);return xe>=1?xe.toFixed(1)+" GB":(J/(1024*1024)).toFixed(0)+" MB"}function Se(J){return Number.isFinite(Number(J))?Number(J).toLocaleString():"—"}function Le(J){return J==null?"automatic (model-derived)":Number(J).toLocaleString()+" characters"}function Pe(J){const xe=new Date(J);return Number.isNaN(xe.getTime())?"unknown":xe.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function ct(J){return typeof J=="string"&&J.length>12?J.slice(0,8)+"…"+J.slice(-4):J}function lt(J){return typeof J!="number"||!Number.isFinite(J)?"—":(J/1e3).toFixed(2)}function xt(J){return J==="temporary learned clamp"?"is-clamp":J==="override"?"is-override":"is-built-in"}function Ut(J){const xe=a.value.context_budget_overrides[J.model];return J.floor!=null&&Number.isFinite(Number(xe))&&Number(xe)>J.floor}function nt(J,xe){const Re={...a.value.context_budget_overrides};xe.target.value===""?delete Re[J]:Re[J]=Number(xe.target.value),a.value.context_budget_overrides=Re,x.value=!0}function et(J){a.value.context_utilization=J.target.value===""?"":Number(J.target.value),x.value=!0}function oe(J){const xe={...a.value.context_budget_overrides};delete xe[J],a.value.context_budget_overrides=xe,x.value=!0}async function Ce(){e.value=!0,await Promise.all([Ne(),Lt(),Ls(),qe(),We()]),e.value=!1}async function Ne({preserveBasic:J=!1,preserveAdvanced:xe=!1}={}){try{const Re=await B.get("/api/llm/status");t.value=Re,s.value=!1,n.value=Re.active_provider||"codex",Re.codex&&!Nt.pending()&&(J||(a.value.enabled=Re.codex.enabled,a.value.model=Re.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Re.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Re.codex.agent_reasoning_effort||"",a.value.agent_model=Re.codex.agent_model||""),xe||(a.value.request_timeout_seconds=Re.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Re.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Re.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Re.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Re.codex.context_compression||{}},!x.value&&!O.value&&(a.value.context_budget_overrides={...Re.codex.context_budget_overrides||{}},a.value.context_utilization=Re.codex.context_utilization??a.value.context_utilization))),Re.ollama&&!Te.pending()&&(J||(H.value.enabled=Re.ollama.enabled,H.value.base_url=Re.ollama.base_url||"",H.value.model=Re.ollama.model||"",H.value.max_tokens=Re.ollama.max_tokens||4096),xe||(H.value.timeout=Re.ollama.timeout??H.value.timeout)),Re.kimi&&!Fe.pending()&&(J||(K.value.enabled=Re.kimi.enabled,K.value.model=Re.kimi.model||"",K.value.max_tokens=Re.kimi.max_tokens||4096),xe||(K.value.timeout=Re.kimi.timeout??K.value.timeout)),Re.auxiliary&&(T.value=Re.auxiliary,ne.pending()||(v.value.enabled=Re.auxiliary.enabled,v.value.model=Re.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function We(){const J=++N;_.value=!0,I.value="";try{const xe=await B.get("/api/context/windows");if(J!==N)return;A.value=xe,!O.value&&!x.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(xe.models||{}).filter(([,Re])=>Re.override!=null).map(([Re,gs])=>[Re,gs.override])),a.value.context_utilization=xe.utilization??a.value.context_utilization)}catch(xe){J===N&&(I.value=xe.message||"Failed to load context budgets")}finally{J===N&&(_.value=!1)}}async function Lt(){try{if(re.value=await B.get("/api/ollama/status"),Q.value=!1,re.value.model&&(Ie.value=re.value.model),re.value.configured)try{const J=await B.get("/api/ollama/models");ue.value=J.models||[]}catch{ue.value=[]}else if(H.value.base_url)try{const J=await B.post("/api/ollama/probe-models",{base_url:H.value.base_url});ue.value=J.models||[]}catch{ue.value=[]}}catch{Q.value=!0}}async function qe(){j.value=!0,ce.value="";try{ae.value=await B.get("/api/codex/status")}catch(J){ce.value=J.message||"Failed to fetch Codex status"}finally{j.value=!1}}async function Bt(){const J=t.value?t.value.active_provider:"codex";te.value=!0;try{const xe=await B.post("/api/llm/switch",{provider:n.value});xe.error?(n.value=J,F(xe.error,"error")):(F("Switched to "+n.value+" ("+xe.model+")"),await Ce())}catch(xe){n.value=J,F(xe.message||"Switch failed","error")}finally{te.value=!1}}async function Ht(){se.value=!0;try{const J=await B.post("/api/ollama/reload");F(J.configured?"Ollama reloaded":J.reason||"Ollama not configured",J.configured?"success":"error"),await Ce()}catch(J){F(J.message||"Reload failed","error")}finally{se.value=!1}}async function ms(){ge.value=!0;try{await B.post("/api/ollama/model",{model:Ie.value}),F("Model set to "+Ie.value),await Ce()}catch(J){F(J.message||"Failed","error")}finally{ge.value=!1}}async function Xs(){const J=H.value.base_url;if(!J){F("Enter a base URL first","error");return}W.value=!0;try{const xe=await B.post("/api/ollama/probe-models",{base_url:J});ue.value=xe.models||[],ue.value.length?(F(ue.value.length+" model(s) found"),!H.value.model&&ue.value.length&&(H.value.model=ue.value[0].name)):F("No models found at "+J,"error")}catch(xe){F(xe.message||"Could not reach Ollama","error")}finally{W.value=!1}}async function Ls(){try{if(q.value=await B.get("/api/kimi/status"),de.value=!1,q.value.model&&(Oe.value=q.value.model),q.value.configured)try{const J=await B.get("/api/kimi/models");he.value=J.models||[]}catch{he.value=[]}}catch{de.value=!0}}async function Bn(){w.value=!0;try{const J=await B.post("/api/kimi/reload");F(J.configured?"Kimi reloaded":J.reason||"Kimi not configured",J.configured?"success":"error"),await Ce()}catch(J){F(J.message||"Reload failed","error")}finally{w.value=!1}}async function hn(){P.value=!0;try{await B.post("/api/kimi/model",{model:Oe.value}),F("Model set to "+Oe.value),await Ce()}catch(J){F(J.message||"Failed","error")}finally{P.value=!1}}async function Ns(){if(O.value){Nt();return}O.value=!0;const J=yp(a.value);try{await B.put("/api/llm/codex/config",J),F("Codex config saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),qe()])}catch(xe){F(xe.message||"Failed","error");const Re=JSON.stringify(yp(a.value))!==JSON.stringify(J);await Promise.all([Ne({preserveBasic:Re,preserveAdvanced:!0}),qe()])}finally{O.value=!1}}async function Hn(){if(O.value)return;O.value=!0;const J=xp(a.value);try{await B.put("/api/llm/codex/config",J),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:J.context_budget_overrides,context_utilization:J.context_utilization})&&(x.value=!1),F("Codex advanced settings saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),qe(),We()])}catch(xe){F(xe.message||"Failed","error");const Re=JSON.stringify(xp(a.value))!==JSON.stringify(J);await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:Re}),qe(),We()])}finally{O.value=!1}}async function vs(){if(U.value){Te();return}U.value=!0;try{const J=C.value?H.value.api_key:null,xe=wS(H.value,{includeApiKey:J!==null});await B.put("/api/llm/ollama/config",xe),F("Ollama config saved"),J!==null&&H.value.api_key===J&&(H.value.api_key="",C.value=!1),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Lt()])}catch(J){F(J.message||"Failed","error")}finally{U.value=!1}}async function mn(){if(!U.value){U.value=!0;try{await B.put("/api/llm/ollama/config",kS(H.value)),F("Ollama timeout saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Lt()])}catch(J){F(J.message||"Failed","error")}finally{U.value=!1}}}async function Ds(){if(Z.value){Fe();return}Z.value=!0;try{const J=S.value?K.value.api_key:null,xe=SS(K.value,{includeApiKey:J!==null});await B.put("/api/llm/kimi/config",xe),F("Kimi config saved"),J!==null&&K.value.api_key===J&&(K.value.api_key="",S.value=!1),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Ls()])}catch(J){F(J.message||"Failed","error")}finally{Z.value=!1}}async function Ze(){if(!Z.value){Z.value=!0;try{await B.put("/api/llm/kimi/config",TS(K.value)),F("Kimi timeout saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Ls()])}catch(J){F(J.message||"Failed","error")}finally{Z.value=!1}}}async function Ms(){if(g.value){ne();return}g.value=!0;try{await B.put("/api/llm/auxiliary/config",v.value),F("Auxiliary config saved"),await Ne()}catch(J){F(J.message||"Failed","error"),await Ne()}finally{g.value=!1}}const Nt=Vl(Ns),ne=Vl(Ms),Te=Vl(vs),Fe=Vl(Ds),Ye=()=>(Nt.cancel(),Ns()),_t=()=>(Te.cancel(),vs()),dt=()=>(Fe.cancel(),Ds()),zn=()=>Hn(),qs=()=>mn(),wi=()=>Ze();async function ki(J){const xe=J.account_key+":"+J.model;E.value=xe;try{const Re=await B.post("/api/context/windows/clear",{account_key:J.account_key,model:J.model});F(Re.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await We()}catch(Re){F(Re.message||"Failed to clear clamp","error"),await We()}finally{E.value=null}}async function Na(J){try{await B.post("/api/codex/account/"+J+"/activate"),F("Active account switched"),await qe()}catch(xe){F(xe.message||"Failed","error")}}async function Da(J){ie.value=J;try{await B.post("/api/codex/account/"+J+"/refresh"),F("Token refreshed"),await qe()}catch(xe){F(xe.message||"Refresh failed","error")}finally{ie.value=null}}function la(J,xe){me.value=J,z.value=xe||""}async function jn(J){try{await B.put("/api/codex/account/"+J+"/label",{label:z.value}),F("Label updated"),me.value=null,await qe()}catch(xe){F(xe.message||"Failed","error")}}async function Gs(J,xe){if(await Kt({title:"Delete Codex account",message:`Delete ${xe||"account #"+(J+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await B.del("/api/codex/account/"+J),F("Deleted. Pool reloaded."),await qe()}catch(gs){F(gs.message||"Failed","error")}}async function en(){Y.value=!0;try{const J=await B.post("/api/codex/device-code");fe.value=J,X.value="pending",Ts(J)}catch(J){F(J.message||"Failed","error")}finally{Y.value=!1}}async function Ts(J){Ae={cancelled:!1};const xe=Ae;try{const Re=await B.post("/api/codex/device-poll",{device_auth_id:J.device_auth_id,user_code:J.user_code,interval:J.interval});if(xe.cancelled)return;pe.value=Re,X.value="success",await Ce()}catch(Re){if(xe.cancelled)return;be.value=Re.message||"Device login failed",X.value="error"}}function Ma(){Ae&&(Ae.cancelled=!0),X.value=null,fe.value=null}return je(Ce),ft(()=>{Ae&&(Ae.cancelled=!0),Nt.cancel(),ne.cancel(),Te.cancel(),Fe.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:te,advancedOpen:b,codexForm:a,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:f,agentModelOptionDisabled:m,auxForm:v,auxData:T,auxModelOptions:L,onAuxModelChange:y,savingAux:g,saveAuxConfigDebounced:ne,ollamaForm:H,kimiForm:K,savingCodex:O,savingOllama:U,savingKimi:Z,probingOllama:W,ollamaKeyDirty:C,kimiKeyDirty:S,fetchCodexStatus:qe,ollamaStatus:re,ollamaStatusLoadFailed:Q,ollamaModels:ue,ollamaSelectedModel:Ie,reloading:se,settingModel:ge,kimiStatus:q,kimiStatusLoadFailed:de,kimiModels:he,kimiSelectedModel:Oe,reloadingKimi:w,settingKimiModel:P,codexLoading:j,codexError:ce,codexData:ae,refreshing:ie,editingLabel:me,labelValue:z,contextWindows:A,contextWindowsLoading:_,contextWindowsError:I,contextBudgetRows:$,activeClampRows:k,activeContextBudget:M,clearingClamp:E,contextPolicyDirty:x,deviceState:X,deviceLoading:Y,deviceInfo:fe,deviceResult:pe,deviceError:be,fetchAll:Ce,fetchLLMStatus:Ne,fetchOllamaStatus:Lt,fetchKimiStatus:Ls,switchProvider:Bt,reloadOllama:Ht,setOllamaModel:ms,reloadKimi:Bn,setKimiModel:hn,probeOllamaModels:Xs,saveCodexConfig:Ns,saveOllamaConfig:vs,saveKimiConfig:Ds,saveCodexAdvancedConfig:Hn,saveOllamaAdvancedConfig:mn,saveKimiAdvancedConfig:Ze,saveCodexConfigDebounced:Nt,saveOllamaConfigDebounced:Te,saveKimiConfigDebounced:Fe,saveCodexConfigNow:Ye,saveOllamaConfigNow:_t,saveKimiConfigNow:dt,saveCodexAdvancedConfigNow:zn,saveOllamaAdvancedConfigNow:qs,saveKimiAdvancedConfigNow:wi,activateAccount:Na,refreshAccount:Da,startEditLabel:la,saveLabel:jn,deleteAccount:Gs,startDeviceLogin:en,cancelDeviceLogin:Ma,formatSize:ye,fetchContextWindows:We,clearContextClamp:ki,setContextOverride:nt,setContextUtilization:et,resetContextOverride:oe,overrideAboveFloor:Ut,formatCount:Se,formatContextCeiling:Le,formatExpiry:Pe,shortAccountKey:ct,provenanceClass:xt,formatDensity:lt}}},_p={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function ES(e){return _p[e]||_p[(e||"").toLowerCase()]||"text-gray-400"}const AS={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),o=h(null),r=h(null),c=h(null),d=G(()=>{var _;return Object.values(((_=i.value)==null?void 0:_.totals)||{}).reduce((I,E)=>I+Number(E||0),0)}),u=h(""),p=h(0),f=h([]),m=G(()=>f.value.map(_=>`${_.label} (${_.path}${_.reason?`: ${_.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let T=null;async function L(){var N;const _=await Promise.allSettled(v.map($=>B.get($.path))),I=$=>_[$].status==="fulfilled"?_[$].value:null;t.value=I(0)||{};const E=I(1);s.value=Array.isArray(E)?E:E&&E.subsystems||[],n.value=I(2)||{},a.value=I(3)||{},i.value=I(4),l.value=I(5),o.value=I(6),r.value=I(7),c.value=I(8);const x=_.filter($=>$.status==="rejected");if(f.value=_.flatMap(($,k)=>{var M;return $.status==="rejected"?[{...v[k],reason:((M=$.reason)==null?void 0:M.message)||"request failed"}]:[]}),p.value=f.value.length,x.length===_.length){const $=(N=x[0])==null?void 0:N.reason;u.value=($==null?void 0:$.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",L()}let g=!1;function b(){g||(g=!0,L(),T||(T=setInterval(L,3e4)))}function A(){g&&(g=!1,T&&(clearInterval(T),T=null))}return je(b),es(b),Wt(A),ft(A),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:m,endpoints:v,retry:y,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:ES,formatAgeSeconds:Ww}}},RS=1e4,wp=3e4;function Oi(e,t){return Math.max(0,e-t)}function Lr(e,t){return new Set((e.operations||[]).map(n=>n.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const IS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],OS={template:`
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
  `,setup(){const e=h(null),t=h(""),s=h(null),n=h(!1),a=h(0),i=h(null),l=h(""),o=h(null),r=h(!1),c=h(0),d=h(Date.now());let u=null,p=0,f=0;async function m(){const S=++p;n.value=!0;try{const O=await B.get("/api/turn-state/turns?limit=100");if(S!==p)return;t.value=O.availability,e.value=O.availability==="available"?O.data:null,s.value=null,a.value=Date.now()}catch(O){if(S!==p)return;s.value=O.message||"Turn-state read failed",O.status===503&&(t.value="unavailable")}S===p&&(n.value=!1)}async function v(){const S=++f;r.value=!0;try{const O=await B.get("/api/turn-state/capacity-breakers");if(S!==f)return;l.value=O.availability,i.value=O.availability==="available"?O.data:null,o.value=null,c.value=Date.now()}catch(O){if(S!==f)return;o.value=O.message||"Breaker read failed",O.status===503&&(l.value="unavailable")}S===f&&(r.value=!1)}function T(){m(),v()}const L=G(()=>e.value!==null&&Oi(d.value,a.value)>wp),y=G(()=>i.value!==null&&Oi(d.value,c.value)>wp),g=G(()=>L.value||y.value),b=G(()=>Math.round(Oi(d.value,a.value)/1e3)),A=G(()=>Math.round(Oi(d.value,c.value)/1e3));function _(S){return Lr(S,d.value/1e3)}function I(S){return IS[_(S)]}const E=G(()=>{var U;const S=[...((U=e.value)==null?void 0:U.turns)||[]],O=d.value/1e3;return S.sort((Z,W)=>Lr(Z,O)-Lr(W,O)||(W.last_progress_at||0)-(Z.last_progress_at||0))});function x(S){return S.state==="closed"?"badge-success":S.state==="probing"?"badge-warning":"badge-danger"}function N(S){if(S.state==="closed")return"—";const O=Oi(d.value,c.value)/1e3,U=Math.max(0,(S.cooldown_remaining_seconds||0)-O);return U>0?`${Math.ceil(U)}s`:S.state==="probing"?"probe in flight":"probe eligible"}function $(S){if(!S)return"";const O=Math.max(0,Math.round(d.value/1e3-S));if(O<90)return`${O}s ago`;const U=Math.round(O/60);return U<90?`${U}m ago`:`${Math.round(U/60)}h ago`}let k=null,M=null,H=!1;function K(){H||(H=!0,T(),k=setInterval(T,RS),u=setInterval(()=>{d.value=Date.now()},1e3),M=Xe.onReconnected(T))}function C(){H&&(H=!1,k&&(clearInterval(k),k=null),u&&(clearInterval(u),u=null),M&&(M(),M=null))}return je(K),es(K),Wt(C),ft(C),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:n,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:L,breakersStale:y,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:A,sortedTurns:E,priorityOf:_,priorityBadge:I,breakerBadge:x,cooldownLabel:N,ageLabel:$,fetchTurns:m,fetchBreakers:v,refreshAll:T,arm:K,disarm:C}}},LS={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),o=h(null),r=h(!1);async function c(){a.value=!0,o.value=null,r.value=!1;try{const u=await B.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{a.value=!1}}async function d(){if(await Kt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await B.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return je(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},kp=e=>JSON.parse(JSON.stringify(e)),NS=(e,t)=>JSON.stringify(e)===JSON.stringify(t),DS={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=h([]),n=h({}),a=h({}),i=h(!1),l=h(!1),o=h(!1),r=h(!1),c=h(!1),d=h(""),u=h("");let p=!1,f=0,m=null;const v=(C,S)=>p&&f===C&&B.token===S,T=C=>"computer-provisioning-"+C.key,L=C=>C===null?"Unset":C===""?"Empty":JSON.stringify(C),y=C=>{const S=a.value[C.key];return C.type==="array"?String(S||"").split(/\r?\n/).map(O=>O.trim()).filter(Boolean):["integer","number"].includes(C.type)?S===""||S==null?null:Number(S):S},g=G(()=>s.value.map(C=>({...C,value:y(C)})).filter(C=>!NS(C.value,n.value[C.key]))),b=G(()=>s.value.filter(C=>C.pending_restart).map(C=>C.label)),A=G(()=>s.value.some(C=>C.apply_state==="unknown")),_=G(()=>{const C={};for(const S of s.value){const O=y(S),U=S.constraints||{};["integer","number"].includes(S.type)&&(O===null&&!S.nullable?C[S.key]="A number is required.":O!==null&&(!Number.isFinite(O)||S.type==="integer"&&!Number.isInteger(O)||U.minimum!=null&&O<U.minimum||U.maximum!=null&&O>U.maximum)&&(C[S.key]="Enter a number within the allowed range.")),S.key==="monitor_names"&&(O.length>16||new Set(O).size!==O.length||O.some(Z=>!/^[A-Za-z0-9_.-]{1,64}$/.test(Z)))&&(C[S.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return C}),I=G(()=>Object.keys(_.value).length>0);function E(C,S){a.value[C.key]=S,u.value=""}function x(){a.value=Object.fromEntries(s.value.map(C=>[C.key,C.type==="array"?n.value[C.key].join(`
`):n.value[C.key]])),r.value=!1}async function N(C,S){const[O,U]=await Promise.all([B.get("/api/config"),B.get("/api/config/meta")]);if(!v(C,S))return!1;const Z=(U.fields||[]).filter(W=>/^computer\.[^.]+$/.test(W.path)&&W.path!=="computer.enabled"&&W.sensitivity==="public"&&W.apply_mode==="restart");if(!O.computer||!Z.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=Z.map(W=>({...W,key:W.path.split(".")[1]})),n.value=Object.fromEntries(s.value.map(W=>[W.key,kp(O.computer[W.key])])),x(),m=S,i.value=!0,c.value=!1,!0}async function $(){if(!p||l.value||o.value)return;const C=++f,S=B.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await N(C,S)}catch(O){v(C,S)&&(c.value=!0,d.value=O.message||"Could not load provisioning. No changes were sent.")}finally{v(C,S)&&(l.value=!1)}}function k(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!I.value&&(r.value=!0)}async function M(){if(!p||!i.value||!r.value||o.value||l.value||c.value||I.value||!g.value.length)return;if(m!==B.token){K(),H();return}const C={computer:Object.fromEntries(g.value.map(Z=>[Z.key,kp(Z.value)]))},S=f,O=B.token;o.value=!0,d.value="",u.value="";let U=!1;try{if(await B.put("/api/config",C),U=!0,!v(S,O))return;await N(S,O)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(Z){v(S,O)&&(c.value=!0,r.value=!1,d.value=U?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${Z.status===400?": "+Z.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{v(S,O)&&(o.value=!1)}}function H(){p||(p=!0,$())}function K(){p=!1,f++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],n.value={},a.value={},d.value="",u.value=""}return je(H),es(H),Wt(K),ft(K),{fields:s,original:n,draft:a,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:A,changes:g,validation:_,invalid:I,fieldId:T,format:L,edit:E,discard:x,load:$,openReview:k,save:M}}},MS={components:{ComputerProvisioning:DS},template:`
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
    </div>`,setup(){const e=h({state:"unknown",available:!1}),t=h(!1),s=h(!1),n=h(!1),a=h(!1),i=h(!1),l=h(!1),o=h(""),r=h(!1),c=h(!1),d=h(!1),u=h(0),p=h(""),f=h(""),m=h(null),v=h(""),T=h(!1),L=h(Date.now()),y=h(""),g=h(null);let b=0,A=null,_=!1,I=B.token,E=0,x=null,N=null,$=!1;const k=z=>z===!0?"Enabled":z===!1?"Disabled":"Unknown",M=G(()=>{var z;return((z=e.value.backend)==null?void 0:z.environment)==="existing_session"}),H=G(()=>{var X;const z=Date.parse(((X=e.value.accessibility)==null?void 0:X.checked_at)||"");return c.value&&Number.isFinite(z)&&L.value-z<15e3&&L.value>=z-5e3}),K=G(()=>{var z;return H.value?k((z=e.value.accessibility)==null?void 0:z.enabled):"Unknown / not current"}),C=G(()=>{var z;return H.value?((z=e.value.accessibility)==null?void 0:z.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),S=G(()=>Object.entries(e.value.input_limits||{}).filter(([,z])=>typeof z=="number"&&Number.isFinite(z)).map(([z,X])=>`${z}: ${X}`).join(", ")),O=G(()=>{var X;const z=(X=e.value.application_provenance)==null?void 0:X.script_identity;return typeof z=="string"?z:!z||typeof z!="object"?"Not observed":`${z.interpreter_basename||"Unknown interpreter"}; argv digest ${z.argv_digest||"not recorded"}; ${z.verified===!0?"verified":"not verified"}`}),U=G(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(z=>z&&typeof z.id=="string"&&typeof z.label=="string"&&["supported","capture_only"].includes(z.input)).slice(0,16):[]),Z=G(()=>{const z=e.value.restart_required;return Array.isArray(z)?z.length?z.join(", "):"None reported":z===!0?"Pending; restart required":z===!1?"None reported":"Unknown"}),W=G(()=>{var X,Y;const z=Date.parse(((X=m.value)==null?void 0:X.captured_at)||"");return Number.isFinite(z)&&L.value<z+Math.min(1e4,((Y=m.value)==null?void 0:Y.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function te(){v.value&&URL.revokeObjectURL(v.value),v.value="",m.value=null}function re(){b++,te(),g.value=null,c.value=!1,x==null||x.abort(),x=null,t.value=!1,f.value="",s.value=!1,i.value=!1,l.value=!1}function Q(z,X){return _&&z===b&&X===B.token}function ue(){return _&&c.value&&N===B.token&&Date.now()-u.value<15e3}function Ie(z,X="mutation"){var fe,pe;re(),$=!0,p.value="";const Y=z.status||(z.name==="AuthError"?401:0);[401,403,404].includes(Y)?(u.value=0,N=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:Y===503?"unavailable":"unknown"}),o.value=Y===401||Y===403||Y===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":Y===410?"Evidence or artifact expired. Observe or prepare the export again.":X==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":X==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",X==="mutation"&&![401,403,404].includes(Y)&&typeof((fe=z.data)==null?void 0:fe.code)=="string"&&/^[a-z_]{1,64}$/.test(z.data.code)&&typeof((pe=z.data)==null?void 0:pe.error)=="string"&&(o.value=z.data.error.slice(0,512),z.data.outcome==="not_applied"&&z.data.next_action==="repair_provisioning"&&typeof z.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=z.data.remedy.slice(0,1024)))}async function se(){if(t.value||r.value||n.value||a.value||d.value||!_)return;const z=b,X=B.token;t.value=!0,E=Date.now();const Y=new AbortController;x=Y;try{const fe=await B.get("/api/computer",{signal:Y.signal});if(!Q(z,X))return;ge(fe)}catch(fe){Q(z,X)&&Ie(fe,"read")}finally{x===Y&&(x=null,t.value=!1)}}function ge(z,X=""){if(!z||typeof z!="object"||typeof z.state!="string"||typeof z.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==z.session_id||e.value.generation!=null&&e.value.generation!==z.generation||e.value.session_generation!=null&&e.value.session_generation!==z.session_generation)&&re(),e.value=z,u.value=Date.now(),N=B.token,c.value=!(r.value&&X!=="toggle")&&!(n.value&&X!=="stop")&&!(a.value&&X!=="pause")&&!(d.value&&X!=="recovery"),o.value="",p.value="",$=!c.value}async function q(z){if(!ue()||r.value||n.value||a.value||d.value)return;re();const X=b,Y=B.token;r.value=!0;let fe=!1;try{if(await B.post("/api/computer/enabled",{enabled:z}),fe=!0,!Q(X,Y))return;const pe=await B.get("/api/computer");Q(X,Y)&&ge(pe,"toggle")}catch(pe){Q(X,Y)&&Ie(pe,fe?"acknowledged":"mutation")}finally{r.value=!1}}async function de(z){if(!_||!["pause","stop"].includes(z)||(z==="stop"?n.value:a.value))return;re();const X=b,Y=B.token,fe=z==="stop"?n:a;fe.value=!0;let pe=!1;try{if(await B.post("/api/computer/"+z,{}),pe=!0,Q(X,Y)){const be=await B.get("/api/computer");Q(X,Y)&&ge(be,z)}}catch(be){Q(X,Y)&&Ie(be,pe?"acknowledged":"mutation")}finally{fe.value=!1}}async function he(){var fe;if(!ue()||d.value||((fe=e.value.backend)==null?void 0:fe.native_backend)!=="hyprland")return;const z={session_id:e.value.session_id,generation:e.value.session_generation};if(!z.session_id||!Number.isInteger(z.generation))return;re();const X=b,Y=B.token;d.value=!0;try{const pe=await B.post("/api/computer/release_owned_input",z);Q(X,Y)&&ge(pe,"recovery")}catch(pe){Q(X,Y)&&Ie(pe,"mutation")}finally{d.value=!1}}async function Oe(){return P(!1)}async function w(){return P(!0)}async function P(z){var Ae;if(!ue()||d.value||r.value||n.value||a.value||e.value.state!=="quarantined")return;const X={session_id:e.value.session_id,generation:e.value.session_generation};if(!X.session_id||!Number.isInteger(X.generation))return;if(z){if(f.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+X.session_id)return;X.acknowledgment=f.value}const Y=z?((Ae=e.value.recovery)==null?void 0:Ae.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";re();const fe=b,pe=B.token;d.value=!0;let be=!1;try{const F=await B.post("/api/computer/"+Y,X);be=!0,Q(fe,pe)&&ge(F,"recovery")}catch(F){Q(fe,pe)&&Ie(F,be?"acknowledged":"mutation")}finally{d.value=!1}}async function j(){var Y;if(!ue()||s.value||!e.value.available)return;te(),T.value=!1;const z=b,X=B.token;s.value=!0;try{const fe=await B.post("/api/computer/observe",{});if(!Q(z,X))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((Y=fe.frame)==null?void 0:Y.evidence_id)||""))throw new Error("Invalid evidence");const pe=await B.getBlob("/api/computer/evidence/"+fe.frame.evidence_id);if(!Q(z,X))return;if(!["image/png","image/jpeg"].includes(pe.type)||pe.size>2097152||!Number.isFinite(Date.parse(fe.frame.expires_at))||Date.parse(fe.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");m.value=fe.frame,v.value=URL.createObjectURL(pe),o.value=""}catch(fe){Q(z,X)&&Ie(fe)}finally{z===b&&(s.value=!1)}}async function ce(){if(!ue()||i.value||!e.value.available)return;g.value=null;const z=b,X=B.token;i.value=!0;try{const Y=await B.post("/api/computer/export",{name:y.value});Q(z,X)&&(g.value=Y,o.value="")}catch(Y){Q(z,X)&&Ie(Y)}finally{z===b&&(i.value=!1)}}async function ae(){if(!ue()||l.value||!g.value)return;const z=b,X=B.token,Y=g.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((Y==null?void 0:Y.artifact_id)||""))throw new Error("Invalid export");const fe=await B.getBlob("/api/computer/download/"+Y.artifact_id);if(!Q(z,X))return;const pe=URL.createObjectURL(fe),be=document.createElement("a");be.href=pe,be.download=Y.name,be.click(),setTimeout(()=>URL.revokeObjectURL(pe),1e3)}catch(fe){Q(z,X)&&Ie(fe)}finally{z===b&&(l.value=!1)}}function ie(){_||(I!==B.token&&(I=B.token,re(),u.value=0,N=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),_=!0,se(),A=setInterval(()=>{L.value=Date.now(),I!==B.token&&(I=B.token,re(),u.value=0,N=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&L.value-u.value>=15e3&&re(),m.value&&Date.parse(m.value.expires_at)<=L.value&&(te(),T.value=!0),g.value&&Date.parse(g.value.expires_at)<=L.value&&(g.value=null),!$&&L.value-E>=5e3&&se()},500))}function me(){_=!1,clearInterval(A),A=null,re(),c.value=!1}return je(ie),es(ie),Wt(me),ft(me),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:n,pausing:a,exporting:i,downloading:l,error:o,frame:m,frameUrl:v,frameExpired:T,freshness:W,name:y,artifact:g,refresh:se,control:de,observe:j,clearFrame:te,exportFile:ce,download:ae,toggling:r,adminReady:c,enabledLabel:k,restartSettings:Z,setEnabled:q,recovering:d,recover:Oe,reconcile:w,releaseOwnedInput:he,reconciliationAck:f,applicationProfiles:U,attached:M,scriptIdentity:O,inputLimits:S,accessibilityLabel:K,accessibilityDetail:C}}},mv=[{id:"health",label:"Health",component:Bk},{id:"resources",label:"Resources",component:Hk},{id:"logs",label:"Logs",component:Xk},{id:"config",label:"Config",component:uS},{id:"discord",label:"Discord",component:fS},{id:"hosts",label:"Hosts",component:vS},{id:"host-access",label:"Host Access",component:mS},{id:"api-tokens",label:"API Tokens",component:gS},{id:"llm",label:"LLM Config",component:CS},{id:"internals",label:"Internals",component:AS},{id:"turn-state",label:"Turn State",component:OS},{id:"computer",label:"Computer",component:MS},{id:"update",label:"Update",component:LS}],PS={components:{TabbedPage:ir},setup(){return{tabs:mv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},ql=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),FS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...ql("Operations","operations","/operations",iv),...ql("History","history","/history",lv),...ql("Capabilities","capabilities","/capabilities",ov),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...ql("System","system","/system",mv)],xs=aa({open:!1,query:"",selected:0});function Sp(){xs.query="",xs.selected=0,xs.open=!0}function Nr(){xs.open=!1}function $S(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const US={setup(){const e=Ym(),t=h(null),s=G(()=>{const i=xs.query.trim().toLowerCase();return FS.map(l=>({...l,_score:$S(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Ft(()=>xs.open,async i=>{var l;i&&(await It(),(l=t.value)==null||l.focus())}),Ft(()=>xs.query,()=>{xs.selected=0});function n(i){Nr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Nr();return}if(i.key==="ArrowDown")i.preventDefault(),xs.selected=Math.min(xs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),xs.selected=Math.max(xs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[xs.selected];l&&n(l)}}return{state:xs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Nr}},template:`
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
  `},xc={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(xc));const BS={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>ci("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[ci("path",{d:xc[e.name]||xc.info})])}},HS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Tp(e){return[...e.querySelectorAll(HS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const zS={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Tp(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Tp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},jS={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),o=h(!1),r=h([]),c=h(0),d=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const f=G(()=>{const Z=e.value.uptime_seconds||0,W=Math.floor(Z/86400),te=Math.floor(Z%86400/3600),re=Math.floor(Z%3600/60),Q=[];return W>0&&Q.push(`${W}d`),te>0&&Q.push(`${te}h`),(Q.length===0||W===0&&te===0)&&Q.push(`${re}m`),Q.join(" ")}),m=G(()=>{const Z=e.value.uptime_seconds||0;return 125.66*(1-Math.min(Z/86400,1))}),v=G(()=>{const Z=e.value;return[{label:"Guilds",value:Z.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:Z.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:Z.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${Z.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:Z.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:Z.loop_count>0?"text-green-400":"",highlight:Z.loop_count>0},{label:"Agents",value:Z.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:Z.agent_count>0?`${Z.agent_count} total`:"",subColor:"text-gray-500",highlight:(Z.agent_running??0)>0},{label:"Processes",value:Z.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:Z.process_count>0?`${Z.process_count} total`:"",subColor:"text-gray-500",highlight:(Z.process_running??0)>0},{label:"Schedules",value:Z.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(Z.schedule_failing>0?`${Z.schedule_failing} failing`:"")+(Z.schedule_failing>0&&Z.schedule_paused>0?", ":"")+(Z.schedule_paused>0?`${Z.schedule_paused} paused`:"")||void 0,subColor:Z.schedule_failing>0?"text-red-400":"text-yellow-400",color:Z.schedule_failing>0?"text-red-400":"",highlight:Z.schedule_failing>0},{label:"Users",value:Z.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),T=G(()=>{const Z=e.value,W=[];return W.push({label:"Bot",status:Z.status==="online"?"ok":"warn",detail:Z.status==="online"?"Online":"Starting"}),(Z.schedule_failing||0)>0?W.push({label:"Schedules",status:"error",detail:`${Z.schedule_failing} failing`}):(Z.schedule_count||0)>0&&W.push({label:"Schedules",status:"ok",detail:`${Z.schedule_count} configured`}),(Z.loop_count||0)>0&&W.push({label:"Loops",status:"ok",detail:`${Z.loop_count} active`}),(Z.agent_running||0)>0&&W.push({label:"Agents",status:"ok",detail:`${Z.agent_running} running`}),(Z.process_running||0)>0&&W.push({label:"Processes",status:"ok",detail:`${Z.process_running} running`}),W});async function L(){try{e.value=await B.get("/api/status"),s.value=null}catch(Z){s.value=Z.message}finally{t.value=!1}}let y=0,g=0,b=0,A=0;function _(Z,W){const te=new Set;return[...W,...Z].filter(re=>{const Q=re._hmac||JSON.stringify([re.timestamp,re.tool_name,re.user_id,re.result_summary,re.error]);return te.has(Q)?!1:(te.add(Q),!0)})}async function I(){const Z=++y,W=b;a.value=!0;try{const te=await B.get("/api/audit?limit=10");if(Z!==y)return;const re=W===b?[]:n.value.filter(Q=>(Q._liveEpoch||0)>W);n.value=_(te,re).slice(0,10),c.value=re.length}catch{}Z===y&&(a.value=!1)}async function E(){const Z=++g,W=A;l.value=!0;try{const te=await B.get("/api/audit?error_only=1&limit=5");if(Z!==g)return;const re=W===A?[]:i.value.filter(Q=>(Q._liveErrorEpoch||0)>W);i.value=_(te,re).slice(0,5),o.value=!1}catch{if(Z!==g)return;o.value=W===A||i.value.length===0}Z===g&&(l.value=!1)}async function x(){try{const Z=await B.get("/api/knowledge");d.value=(Array.isArray(Z)?Z:[]).reduce((W,te)=>W+(te.chunks||0),0)}catch{d.value=null}}async function N(){try{const Z=await B.get("/api/agents");r.value=Z.filter(W=>W.status==="running")}catch{}}async function $(){u.value={...u.value,reload:!0};try{await B.post("/api/reload"),we.success("Config reloaded")}catch(Z){we.error(Z.message)}u.value={...u.value,reload:!1}}async function k(){if(!await Kt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const W=e.value.session_count;e.value={...e.value,session_count:0};try{const te=await B.post("/api/sessions/clear-all");we.success(`Cleared ${te.count} session${te.count!==1?"s":""}`),await L()}catch(te){e.value={...e.value,session_count:W},we.error(te.message)}u.value={...u.value,clearSessions:!1}}async function M(){if(!await Kt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const W=e.value.loop_count;e.value={...e.value,loop_count:0};try{const te=await B.post("/api/loops/stop-all");we.success(te.result),await L()}catch(te){e.value={...e.value,loop_count:W},we.error(te.message)}u.value={...u.value,stopLoops:!1}}function H(){t.value=!0,s.value=null,L(),I(),E(),N()}let K=null,C=null,S=null;function O(Z){if(Z.payload&&Z.payload.tool_name){b+=1;const W={...Z.payload,_isNew:!0,_key:++p,_liveEpoch:b};n.value.unshift(W),n.value.length>10&&n.value.pop(),c.value++,W.error&&(A+=1,W._liveErrorEpoch=A,o.value=!1,i.value.unshift(W),i.value.length>5&&i.value.pop()),setTimeout(()=>{W._isNew=!1},1500),clearTimeout(S),S=setTimeout(()=>{c.value=0},1e4)}}let U=null;return je(async()=>{await Promise.all([L(),I(),E(),N(),x()]),K=setInterval(L,15e3),C=setInterval(N,1e4),Xe.subscribe("events",O),U=Xe.onReconnected(()=>{I(),E()})}),ft(()=>{K&&clearInterval(K),C&&clearInterval(C),clearTimeout(S),Xe.unsubscribe("events",O),U&&(U(),U=null)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:m,stats:v,healthIndicators:T,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:I,fetchErrors:E,fetchStatus:L,onEvent:O,formatTime:Kw,formatDuration:bi,retry:H,reloadConfig:$,clearSessions:k,stopAllLoops:M}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Cp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function VS(e){if(Array.isArray(e))return e}function qS(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(n=i.call(s)).done)&&(o.push(n.value),o.length!==t);r=!0);}catch(d){c=!0,a=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return o}}function GS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function KS(e,t){return VS(e)||qS(e,t)||WS(e,t)||GS()}function WS(e,t){if(e){if(typeof e=="string")return Cp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Cp(e,t):void 0}}const vv=Object.entries,Ep=Object.setPrototypeOf,JS=Object.isFrozen,ZS=Object.getPrototypeOf,YS=Object.getOwnPropertyDescriptor;let hs=Object.freeze,Vs=Object.seal,Ka=Object.create,gv=typeof Reflect<"u"&&Reflect,_c=gv.apply,wc=gv.construct;hs||(hs=function(t){return t});Vs||(Vs=function(t){return t});_c||(_c=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});wc||(wc=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const xn=$t(Array.prototype.forEach),QS=$t(Array.prototype.lastIndexOf),Ap=$t(Array.prototype.pop),za=$t(Array.prototype.push),XS=$t(Array.prototype.splice),cs=Array.isArray,Ui=$t(String.prototype.toLowerCase),Dr=$t(String.prototype.toString),Rp=$t(String.prototype.match),ja=$t(String.prototype.replace),Ip=$t(String.prototype.indexOf),e1=$t(String.prototype.trim),t1=$t(Number.prototype.toString),s1=$t(Boolean.prototype.toString),Op=typeof BigInt>"u"?null:$t(BigInt.prototype.toString),Lp=typeof Symbol>"u"?null:$t(Symbol.prototype.toString),Tt=$t(Object.prototype.hasOwnProperty),Li=$t(Object.prototype.toString),Jt=$t(RegExp.prototype.test),ua=n1(TypeError);function $t(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return _c(e,t,n)}}function n1(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return wc(e,s)}}function ze(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ui;if(Ep&&Ep(e,null),!cs(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(JS(t)||(t[n]=i),a=i)}e[a]=!0}return e}function a1(e){for(let t=0;t<e.length;t++)Tt(e,t)||(e[t]=null);return e}function ss(e){const t=Ka(null);for(const n of vv(e)){var s=KS(n,2);const a=s[0],i=s[1];Tt(e,a)&&(cs(i)?t[a]=a1(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=ss(i):t[a]=i)}return t}function i1(e){switch(typeof e){case"string":return e;case"number":return t1(e);case"boolean":return s1(e);case"bigint":return Op?Op(e):"0";case"symbol":return Lp?Lp(e):"Symbol()";case"undefined":return Li(e);case"function":case"object":{if(e===null)return Li(e);const t=e,s=an(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Li(n)}return Li(e)}default:return Li(e)}}function an(e,t){for(;e!==null;){const n=YS(e,t);if(n){if(n.get)return $t(n.get);if(typeof n.value=="function")return $t(n.value)}e=ZS(e)}function s(){return null}return s}function l1(e){try{return Jt(e,""),!0}catch{return!1}}const Np=hs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Mr=hs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Pr=hs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),o1=hs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Fr=hs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),r1=hs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Dp=hs(["#text"]),Mp=hs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),$r=hs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Pp=hs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Gl=hs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),c1=Vs(/{{[\w\W]*|^[\w\W]*}}/g),d1=Vs(/<%[\w\W]*|^[\w\W]*%>/g),u1=Vs(/\${[\w\W]*/g),p1=Vs(/^data-[\-\w.\u00B7-\uFFFF]+$/),f1=Vs(/^aria-[\-\w]+$/),Fp=Vs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),h1=Vs(/^(?:\w+script|data):/i),m1=Vs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),v1=Vs(/^html$/i),g1=Vs(/^[a-z][.\w]*(-[.\w]+)+$/i),sn={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},b1=function(){return typeof window>"u"?null:window},y1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},$p=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function bv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:b1();const t=ke=>bv(ke);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==sn.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,f=an(p,"cloneNode"),m=an(p,"remove"),v=an(p,"nextSibling"),T=an(p,"childNodes"),L=an(p,"parentNode"),y=an(p,"shadowRoot"),g=an(p,"attributes"),b=l&&l.prototype?an(l.prototype,"nodeType"):null,A=l&&l.prototype?an(l.prototype,"nodeName"):null;if(typeof i=="function"){const ke=s.createElement("template");ke.content&&ke.content.ownerDocument&&(s=ke.content.ownerDocument)}let _,I="",E,x=!1,N=0;const $=function(){if(N>0)throw ua('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},k=function(D){$(),N++;try{return _.createHTML(D)}finally{N--}},M=function(D){$(),N++;try{return _.createScriptURL(D)}finally{N--}},H=function(){return x||(E=y1(u,a),x=!0),E},K=s,C=K.implementation,S=K.createNodeIterator,O=K.createDocumentFragment,U=K.getElementsByTagName,Z=n.importNode;let W=$p();t.isSupported=typeof vv=="function"&&typeof L=="function"&&C&&C.createHTMLDocument!==void 0;const te=c1,re=d1,Q=u1,ue=p1,Ie=f1,se=h1,ge=m1,q=g1;let de=Fp,he=null;const Oe=ze({},[...Np,...Mr,...Pr,...Fr,...Dp]);let w=null;const P=ze({},[...Mp,...$r,...Pp,...Gl]);let j=Object.seal(Ka(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ce=null,ae=null;const ie=Object.seal(Ka(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let me=!0,z=!0,X=!1,Y=!0,fe=!1,pe=!0,be=!1,Ae=!1,F=!1,ye=!1,Se=!1,Le=!1,Pe=!0,ct=!1;const lt="user-content-";let xt=!0,Ut=!1,nt={},et=null;const oe=ze({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Ce=null;const Ne=ze({},["audio","video","img","source","image","track"]);let We=null;const Lt=ze({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),qe="http://www.w3.org/1998/Math/MathML",Bt="http://www.w3.org/2000/svg",Ht="http://www.w3.org/1999/xhtml";let ms=Ht,Xs=!1,Ls=null;const Bn=ze({},[qe,Bt,Ht],Dr);let hn=ze({},["mi","mo","mn","ms","mtext"]),Ns=ze({},["annotation-xml"]);const Hn=ze({},["title","style","font","a","script"]);let vs=null;const mn=["application/xhtml+xml","text/html"],Ds="text/html";let Ze=null,Ms=null;const Nt=s.createElement("form"),ne=function(D){return D instanceof RegExp||D instanceof Function},Te=function(){let D=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ms&&Ms===D)return;(!D||typeof D!="object")&&(D={}),D=ss(D),vs=mn.indexOf(D.PARSER_MEDIA_TYPE)===-1?Ds:D.PARSER_MEDIA_TYPE,Ze=vs==="application/xhtml+xml"?Dr:Ui,he=Tt(D,"ALLOWED_TAGS")&&cs(D.ALLOWED_TAGS)?ze({},D.ALLOWED_TAGS,Ze):Oe,w=Tt(D,"ALLOWED_ATTR")&&cs(D.ALLOWED_ATTR)?ze({},D.ALLOWED_ATTR,Ze):P,Ls=Tt(D,"ALLOWED_NAMESPACES")&&cs(D.ALLOWED_NAMESPACES)?ze({},D.ALLOWED_NAMESPACES,Dr):Bn,We=Tt(D,"ADD_URI_SAFE_ATTR")&&cs(D.ADD_URI_SAFE_ATTR)?ze(ss(Lt),D.ADD_URI_SAFE_ATTR,Ze):Lt,Ce=Tt(D,"ADD_DATA_URI_TAGS")&&cs(D.ADD_DATA_URI_TAGS)?ze(ss(Ne),D.ADD_DATA_URI_TAGS,Ze):Ne,et=Tt(D,"FORBID_CONTENTS")&&cs(D.FORBID_CONTENTS)?ze({},D.FORBID_CONTENTS,Ze):oe,ce=Tt(D,"FORBID_TAGS")&&cs(D.FORBID_TAGS)?ze({},D.FORBID_TAGS,Ze):ss({}),ae=Tt(D,"FORBID_ATTR")&&cs(D.FORBID_ATTR)?ze({},D.FORBID_ATTR,Ze):ss({}),nt=Tt(D,"USE_PROFILES")?D.USE_PROFILES&&typeof D.USE_PROFILES=="object"?ss(D.USE_PROFILES):D.USE_PROFILES:!1,me=D.ALLOW_ARIA_ATTR!==!1,z=D.ALLOW_DATA_ATTR!==!1,X=D.ALLOW_UNKNOWN_PROTOCOLS||!1,Y=D.ALLOW_SELF_CLOSE_IN_ATTR!==!1,fe=D.SAFE_FOR_TEMPLATES||!1,pe=D.SAFE_FOR_XML!==!1,be=D.WHOLE_DOCUMENT||!1,ye=D.RETURN_DOM||!1,Se=D.RETURN_DOM_FRAGMENT||!1,Le=D.RETURN_TRUSTED_TYPE||!1,F=D.FORCE_BODY||!1,Pe=D.SANITIZE_DOM!==!1,ct=D.SANITIZE_NAMED_PROPS||!1,xt=D.KEEP_CONTENT!==!1,Ut=D.IN_PLACE||!1,de=l1(D.ALLOWED_URI_REGEXP)?D.ALLOWED_URI_REGEXP:Fp,ms=typeof D.NAMESPACE=="string"?D.NAMESPACE:Ht,hn=Tt(D,"MATHML_TEXT_INTEGRATION_POINTS")&&D.MATHML_TEXT_INTEGRATION_POINTS&&typeof D.MATHML_TEXT_INTEGRATION_POINTS=="object"?ss(D.MATHML_TEXT_INTEGRATION_POINTS):ze({},["mi","mo","mn","ms","mtext"]),Ns=Tt(D,"HTML_INTEGRATION_POINTS")&&D.HTML_INTEGRATION_POINTS&&typeof D.HTML_INTEGRATION_POINTS=="object"?ss(D.HTML_INTEGRATION_POINTS):ze({},["annotation-xml"]);const le=Tt(D,"CUSTOM_ELEMENT_HANDLING")&&D.CUSTOM_ELEMENT_HANDLING&&typeof D.CUSTOM_ELEMENT_HANDLING=="object"?ss(D.CUSTOM_ELEMENT_HANDLING):Ka(null);if(j=Ka(null),Tt(le,"tagNameCheck")&&ne(le.tagNameCheck)&&(j.tagNameCheck=le.tagNameCheck),Tt(le,"attributeNameCheck")&&ne(le.attributeNameCheck)&&(j.attributeNameCheck=le.attributeNameCheck),Tt(le,"allowCustomizedBuiltInElements")&&typeof le.allowCustomizedBuiltInElements=="boolean"&&(j.allowCustomizedBuiltInElements=le.allowCustomizedBuiltInElements),fe&&(z=!1),Se&&(ye=!0),nt&&(he=ze({},Dp),w=Ka(null),nt.html===!0&&(ze(he,Np),ze(w,Mp)),nt.svg===!0&&(ze(he,Mr),ze(w,$r),ze(w,Gl)),nt.svgFilters===!0&&(ze(he,Pr),ze(w,$r),ze(w,Gl)),nt.mathMl===!0&&(ze(he,Fr),ze(w,Pp),ze(w,Gl))),ie.tagCheck=null,ie.attributeCheck=null,Tt(D,"ADD_TAGS")&&(typeof D.ADD_TAGS=="function"?ie.tagCheck=D.ADD_TAGS:cs(D.ADD_TAGS)&&(he===Oe&&(he=ss(he)),ze(he,D.ADD_TAGS,Ze))),Tt(D,"ADD_ATTR")&&(typeof D.ADD_ATTR=="function"?ie.attributeCheck=D.ADD_ATTR:cs(D.ADD_ATTR)&&(w===P&&(w=ss(w)),ze(w,D.ADD_ATTR,Ze))),Tt(D,"ADD_URI_SAFE_ATTR")&&cs(D.ADD_URI_SAFE_ATTR)&&ze(We,D.ADD_URI_SAFE_ATTR,Ze),Tt(D,"FORBID_CONTENTS")&&cs(D.FORBID_CONTENTS)&&(et===oe&&(et=ss(et)),ze(et,D.FORBID_CONTENTS,Ze)),Tt(D,"ADD_FORBID_CONTENTS")&&cs(D.ADD_FORBID_CONTENTS)&&(et===oe&&(et=ss(et)),ze(et,D.ADD_FORBID_CONTENTS,Ze)),xt&&(he["#text"]=!0),be&&ze(he,["html","head","body"]),he.table&&(ze(he,["tbody"]),delete ce.tbody),D.TRUSTED_TYPES_POLICY){if(typeof D.TRUSTED_TYPES_POLICY.createHTML!="function")throw ua('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof D.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw ua('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ve=_;_=D.TRUSTED_TYPES_POLICY;try{I=k("")}catch(De){throw _=ve,De}}else D.TRUSTED_TYPES_POLICY===null?(_=void 0,I=""):(_===void 0&&(_=H()),_&&typeof I=="string"&&(I=k("")));(W.uponSanitizeElement.length>0||W.uponSanitizeAttribute.length>0)&&he===Oe&&(he=ss(he)),W.uponSanitizeAttribute.length>0&&w===P&&(w=ss(w)),hs&&hs(D),Ms=D},Fe=ze({},[...Mr,...Pr,...o1]),Ye=ze({},[...Fr,...r1]),_t=function(D){let le=L(D);(!le||!le.tagName)&&(le={namespaceURI:ms,tagName:"template"});const ve=Ui(D.tagName),De=Ui(le.tagName);return Ls[D.namespaceURI]?D.namespaceURI===Bt?le.namespaceURI===Ht?ve==="svg":le.namespaceURI===qe?ve==="svg"&&(De==="annotation-xml"||hn[De]):!!Fe[ve]:D.namespaceURI===qe?le.namespaceURI===Ht?ve==="math":le.namespaceURI===Bt?ve==="math"&&Ns[De]:!!Ye[ve]:D.namespaceURI===Ht?le.namespaceURI===Bt&&!Ns[De]||le.namespaceURI===qe&&!hn[De]?!1:!Ye[ve]&&(Hn[ve]||!Fe[ve]):!!(vs==="application/xhtml+xml"&&Ls[D.namespaceURI]):!1},dt=function(D){za(t.removed,{element:D});try{L(D).removeChild(D)}catch{if(m(D),!L(D))throw ua("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},zn=function(D){const le=T?T(D):D.childNodes;if(le){const De=[];xn(le,$e=>{za(De,$e)}),xn(De,$e=>{try{m($e)}catch{}})}const ve=g?g(D):null;if(ve)for(let De=ve.length-1;De>=0;--De){const $e=ve[De],Be=$e&&$e.name;if(typeof Be=="string")try{D.removeAttribute(Be)}catch{}}},qs=function(D,le){try{za(t.removed,{attribute:le.getAttributeNode(D),from:le})}catch{za(t.removed,{attribute:null,from:le})}if(le.removeAttribute(D),D==="is")if(ye||Se)try{dt(le)}catch{}else try{le.setAttribute(D,"")}catch{}},wi=function(D){const le=g?g(D):D.attributes;if(le)for(let ve=le.length-1;ve>=0;--ve){const De=le[ve],$e=De&&De.name;if(!(typeof $e!="string"||w[Ze($e)]))try{D.removeAttribute($e)}catch{}}},ki=function(D){const le=[D];for(;le.length>0;){const ve=le.pop();(b?b(ve):ve.nodeType)===sn.element&&wi(ve);const $e=T?T(ve):ve.childNodes;if($e)for(let Be=$e.length-1;Be>=0;--Be)le.push($e[Be])}},Na=function(D){let le=null,ve=null;if(F)D="<remove></remove>"+D;else{const Be=Rp(D,/^[\r\n\t ]+/);ve=Be&&Be[0]}vs==="application/xhtml+xml"&&ms===Ht&&(D='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+D+"</body></html>");const De=_?k(D):D;if(ms===Ht)try{le=new d().parseFromString(De,vs)}catch{}if(!le||!le.documentElement){le=C.createDocument(ms,"template",null);try{le.documentElement.innerHTML=Xs?I:De}catch{}}const $e=le.body||le.documentElement;return D&&ve&&$e.insertBefore(s.createTextNode(ve),$e.childNodes[0]||null),ms===Ht?U.call(le,be?"html":"body")[0]:be?le.documentElement:$e},Da=function(D){return S.call(D.ownerDocument||D,D,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},la=function(D){var le,ve;D.normalize();const De=S.call(D.ownerDocument||D,D,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let $e=De.nextNode();for(;$e;){let At=$e.data;xn([te,re,Q],ut=>{At=ja(At,ut," ")}),$e.data=At,$e=De.nextNode()}const Be=(le=(ve=D.querySelectorAll)===null||ve===void 0?void 0:ve.call(D,"template"))!==null&&le!==void 0?le:[];xn(Array.from(Be),At=>{Gs(At.content)&&la(At.content)})},jn=function(D){const le=A?A(D):null;return typeof le!="string"||Ze(le)!=="form"?!1:typeof D.nodeName!="string"||typeof D.textContent!="string"||typeof D.removeChild!="function"||D.attributes!==g(D)||typeof D.removeAttribute!="function"||typeof D.setAttribute!="function"||typeof D.namespaceURI!="string"||typeof D.insertBefore!="function"||typeof D.hasChildNodes!="function"||D.nodeType!==b(D)||D.childNodes!==T(D)},Gs=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return b(D)===sn.documentFragment}catch{return!1}},en=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return typeof b(D)=="number"}catch{return!1}};function Ts(ke,D,le){xn(ke,ve=>{ve.call(t,D,le,Ms)})}const Ma=function(D){let le=null;if(Ts(W.beforeSanitizeElements,D,null),jn(D))return dt(D),!0;const ve=Ze(A?A(D):D.nodeName);if(Ts(W.uponSanitizeElement,D,{tagName:ve,allowedTags:he}),pe&&D.hasChildNodes()&&!en(D.firstElementChild)&&Jt(/<[/\w!]/g,D.innerHTML)&&Jt(/<[/\w!]/g,D.textContent)||pe&&D.namespaceURI===Ht&&ve==="style"&&en(D.firstElementChild)||D.nodeType===sn.progressingInstruction||pe&&D.nodeType===sn.comment&&Jt(/<[/\w]/g,D.data))return dt(D),!0;if(ce[ve]||!(ie.tagCheck instanceof Function&&ie.tagCheck(ve))&&!he[ve]){if(!ce[ve]&&Re(ve)&&(j.tagNameCheck instanceof RegExp&&Jt(j.tagNameCheck,ve)||j.tagNameCheck instanceof Function&&j.tagNameCheck(ve)))return!1;if(xt&&!et[ve]){const $e=L(D),Be=T(D);if(Be&&$e){const At=Be.length;for(let ut=At-1;ut>=0;--ut){const vt=Ut?Be[ut]:f(Be[ut],!0);$e.insertBefore(vt,v(D))}}}return dt(D),!0}return(b?b(D):D.nodeType)===sn.element&&!_t(D)||(ve==="noscript"||ve==="noembed"||ve==="noframes")&&Jt(/<\/no(script|embed|frames)/i,D.innerHTML)?(dt(D),!0):(fe&&D.nodeType===sn.text&&(le=D.textContent,xn([te,re,Q],$e=>{le=ja(le,$e," ")}),D.textContent!==le&&(za(t.removed,{element:D.cloneNode()}),D.textContent=le)),Ts(W.afterSanitizeElements,D,null),!1)},J=function(D,le,ve){if(ae[le]||Pe&&(le==="id"||le==="name")&&(ve in s||ve in Nt))return!1;const De=w[le]||ie.attributeCheck instanceof Function&&ie.attributeCheck(le,D);if(!(z&&!ae[le]&&Jt(ue,le))){if(!(me&&Jt(Ie,le))){if(!De||ae[le]){if(!(Re(D)&&(j.tagNameCheck instanceof RegExp&&Jt(j.tagNameCheck,D)||j.tagNameCheck instanceof Function&&j.tagNameCheck(D))&&(j.attributeNameCheck instanceof RegExp&&Jt(j.attributeNameCheck,le)||j.attributeNameCheck instanceof Function&&j.attributeNameCheck(le,D))||le==="is"&&j.allowCustomizedBuiltInElements&&(j.tagNameCheck instanceof RegExp&&Jt(j.tagNameCheck,ve)||j.tagNameCheck instanceof Function&&j.tagNameCheck(ve))))return!1}else if(!We[le]){if(!Jt(de,ja(ve,ge,""))){if(!((le==="src"||le==="xlink:href"||le==="href")&&D!=="script"&&Ip(ve,"data:")===0&&Ce[D])){if(!(X&&!Jt(se,ja(ve,ge,"")))){if(ve)return!1}}}}}}return!0},xe=ze({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Re=function(D){return!xe[Ui(D)]&&Jt(q,D)},gs=function(D){Ts(W.beforeSanitizeAttributes,D,null);const le=D.attributes;if(!le||jn(D))return;const ve={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:w,forceKeepAttr:void 0};let De=le.length;for(;De--;){const $e=le[De],Be=$e.name,At=$e.namespaceURI,ut=$e.value,vt=Ze(Be),Ps=ut;let wt=Be==="value"?Ps:e1(Ps);if(ve.attrName=vt,ve.attrValue=wt,ve.keepAttr=!0,ve.forceKeepAttr=void 0,Ts(W.uponSanitizeAttribute,D,ve),wt=ve.attrValue,ct&&(vt==="id"||vt==="name")&&Ip(wt,lt)!==0&&(qs(Be,D),wt=lt+wt),pe&&Jt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,wt)){qs(Be,D);continue}if(vt==="attributename"&&Rp(wt,"href")){qs(Be,D);continue}if(ve.forceKeepAttr)continue;if(!ve.keepAttr){qs(Be,D);continue}if(!Y&&Jt(/\/>/i,wt)){qs(Be,D);continue}fe&&xn([te,re,Q],Pa=>{wt=ja(wt,Pa," ")});const oa=Ze(D.nodeName);if(!J(oa,vt,wt)){qs(Be,D);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!At)switch(u.getAttributeType(oa,vt)){case"TrustedHTML":{wt=k(wt);break}case"TrustedScriptURL":{wt=M(wt);break}}if(wt!==Ps)try{At?D.setAttributeNS(At,Be,wt):D.setAttribute(Be,wt),jn(D)?dt(D):Ap(t.removed)}catch{qs(Be,D)}}Ts(W.afterSanitizeAttributes,D,null)},vn=function(D){let le=null;const ve=Da(D);for(Ts(W.beforeSanitizeShadowDOM,D,null);le=ve.nextNode();)if(Ts(W.uponSanitizeShadowNode,le,null),Ma(le),gs(le),Gs(le.content)&&vn(le.content),(b?b(le):le.nodeType)===sn.element){const $e=y?y(le):le.shadowRoot;Gs($e)&&(Vn($e),vn($e))}Ts(W.afterSanitizeShadowDOM,D,null)},Vn=function(D){const le=[{node:D,shadow:null}];for(;le.length>0;){const ve=le.pop();if(ve.shadow){vn(ve.shadow);continue}const De=ve.node,Be=(b?b(De):De.nodeType)===sn.element,At=T?T(De):De.childNodes;if(At)for(let ut=At.length-1;ut>=0;--ut)le.push({node:At[ut],shadow:null});if(Be){const ut=A?A(De):null;if(typeof ut=="string"&&Ze(ut)==="template"){const vt=De.content;Gs(vt)&&le.push({node:vt,shadow:null})}}if(Be){const ut=y?y(De):De.shadowRoot;Gs(ut)&&le.push({node:null,shadow:ut},{node:ut,shadow:null})}}};return t.sanitize=function(ke){let D=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},le=null,ve=null,De=null,$e=null;if(Xs=!ke,Xs&&(ke="<!-->"),typeof ke!="string"&&!en(ke)&&(ke=i1(ke),typeof ke!="string"))throw ua("dirty is not a string, aborting");if(!t.isSupported)return ke;Ae||Te(D),t.removed=[];const Be=Ut&&typeof ke!="string"&&en(ke);if(Be){const vt=A?A(ke):ke.nodeName;if(typeof vt=="string"){const Ps=Ze(vt);if(!he[Ps]||ce[Ps])throw ua("root node is forbidden and cannot be sanitized in-place")}if(jn(ke))throw ua("root node is clobbered and cannot be sanitized in-place");try{Vn(ke)}catch(Ps){throw zn(ke),Ps}}else if(en(ke))le=Na("<!---->"),ve=le.ownerDocument.importNode(ke,!0),ve.nodeType===sn.element&&ve.nodeName==="BODY"||ve.nodeName==="HTML"?le=ve:le.appendChild(ve),Vn(ve);else{if(!ye&&!fe&&!be&&ke.indexOf("<")===-1)return _&&Le?k(ke):ke;if(le=Na(ke),!le)return ye?null:Le?I:""}le&&F&&dt(le.firstChild);const At=Da(Be?ke:le);try{for(;De=At.nextNode();)Ma(De),gs(De),Gs(De.content)&&vn(De.content)}catch(vt){throw Be&&zn(ke),vt}if(Be)return xn(t.removed,vt=>{vt.element&&ki(vt.element)}),fe&&la(ke),ke;if(ye){if(fe&&la(le),Se)for($e=O.call(le.ownerDocument);le.firstChild;)$e.appendChild(le.firstChild);else $e=le;return(w.shadowroot||w.shadowrootmode)&&($e=Z.call(n,$e,!0)),$e}let ut=be?le.outerHTML:le.innerHTML;return be&&he["!doctype"]&&le.ownerDocument&&le.ownerDocument.doctype&&le.ownerDocument.doctype.name&&Jt(v1,le.ownerDocument.doctype.name)&&(ut="<!DOCTYPE "+le.ownerDocument.doctype.name+`>
`+ut),fe&&xn([te,re,Q],vt=>{ut=ja(ut,vt," ")}),_&&Le?k(ut):ut},t.setConfig=function(){let ke=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(ke),Ae=!0},t.clearConfig=function(){Ms=null,Ae=!1,_=E,I=""},t.isValidAttribute=function(ke,D,le){Ms||Te({});const ve=Ze(ke),De=Ze(D);return J(ve,De,le)},t.addHook=function(ke,D){typeof D=="function"&&za(W[ke],D)},t.removeHook=function(ke,D){if(D!==void 0){const le=QS(W[ke],D);return le===-1?void 0:XS(W[ke],le,1)[0]}return Ap(W[ke])},t.removeHooks=function(ke){W[ke]=[]},t.removeAllHooks=function(){W=$p()},t}var Up=bv();function Ad(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var La=Ad();function yv(e){La=e}var Wi={exec:()=>null};function rt(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ps.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var ps={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},x1=/^(?:[ \t]*(?:\n|$))+/,_1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,w1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,El=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,k1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Rd=/(?:[*+-]|\d{1,9}[.)])/,xv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,_v=rt(xv).replace(/bull/g,Rd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),S1=rt(xv).replace(/bull/g,Rd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Id=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,T1=/^[^\n]+/,Od=/(?!\s*\])(?:\\.|[^\[\]\\])+/,C1=rt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Od).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),E1=rt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Rd).getRegex(),rr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Ld=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,A1=rt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Ld).replace("tag",rr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),wv=rt(Id).replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex(),R1=rt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",wv).getRegex(),Nd={blockquote:R1,code:_1,def:C1,fences:w1,heading:k1,hr:El,html:A1,lheading:_v,list:E1,newline:x1,paragraph:wv,table:Wi,text:T1},Bp=rt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex(),I1={...Nd,lheading:S1,table:Bp,paragraph:rt(Id).replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Bp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex()},O1={...Nd,html:rt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Ld).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Wi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:rt(Id).replace("hr",El).replace("heading",` *#{1,6} *[^
]`).replace("lheading",_v).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},L1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,N1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,kv=/^( {2,}|\\)\n(?!\s*$)/,D1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,cr=/[\p{P}\p{S}]/u,Dd=/[\s\p{P}\p{S}]/u,Sv=/[^\s\p{P}\p{S}]/u,M1=rt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Dd).getRegex(),Tv=/(?!~)[\p{P}\p{S}]/u,P1=/(?!~)[\s\p{P}\p{S}]/u,F1=/(?:[^\s\p{P}\p{S}]|~)/u,$1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Cv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,U1=rt(Cv,"u").replace(/punct/g,cr).getRegex(),B1=rt(Cv,"u").replace(/punct/g,Tv).getRegex(),Ev="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",H1=rt(Ev,"gu").replace(/notPunctSpace/g,Sv).replace(/punctSpace/g,Dd).replace(/punct/g,cr).getRegex(),z1=rt(Ev,"gu").replace(/notPunctSpace/g,F1).replace(/punctSpace/g,P1).replace(/punct/g,Tv).getRegex(),j1=rt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Sv).replace(/punctSpace/g,Dd).replace(/punct/g,cr).getRegex(),V1=rt(/\\(punct)/,"gu").replace(/punct/g,cr).getRegex(),q1=rt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),G1=rt(Ld).replace("(?:-->|$)","-->").getRegex(),K1=rt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",G1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Io=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,W1=rt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Io).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Av=rt(/^!?\[(label)\]\[(ref)\]/).replace("label",Io).replace("ref",Od).getRegex(),Rv=rt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Od).getRegex(),J1=rt("reflink|nolink(?!\\()","g").replace("reflink",Av).replace("nolink",Rv).getRegex(),Md={_backpedal:Wi,anyPunctuation:V1,autolink:q1,blockSkip:$1,br:kv,code:N1,del:Wi,emStrongLDelim:U1,emStrongRDelimAst:H1,emStrongRDelimUnd:j1,escape:L1,link:W1,nolink:Rv,punctuation:M1,reflink:Av,reflinkSearch:J1,tag:K1,text:D1,url:Wi},Z1={...Md,link:rt(/^!?\[(label)\]\((.*?)\)/).replace("label",Io).getRegex(),reflink:rt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Io).getRegex()},kc={...Md,emStrongRDelimAst:z1,emStrongLDelim:B1,url:rt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},Y1={...kc,br:rt(kv).replace("{2,}","*").getRegex(),text:rt(kc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Kl={normal:Nd,gfm:I1,pedantic:O1},Ni={normal:Md,gfm:kc,breaks:Y1,pedantic:Z1},Q1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Hp=e=>Q1[e];function ln(e,t){if(t){if(ps.escapeTest.test(e))return e.replace(ps.escapeReplace,Hp)}else if(ps.escapeTestNoEncode.test(e))return e.replace(ps.escapeReplaceNoEncode,Hp);return e}function zp(e){try{e=encodeURI(e).replace(ps.percentDecode,"%")}catch{return null}return e}function jp(e,t){var i;const s=e.replace(ps.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(ps.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(ps.slashPipe,"|");return n}function Di(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function X1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Vp(e,t,s,n,a){const i=t.href,l=t.title||null,o=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:n.inlineTokens(o)};return n.state.inLink=!1,r}function eT(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=a.length?i.slice(a.length):i}).join(`
`)}var Oo=class{constructor(e){ht(this,"options");ht(this,"rules");ht(this,"lexer");this.options=e||La}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Di(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=eT(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Di(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Di(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Di(t[0],`
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
`,e=e.substring(p.length+1),r=!0),!r){const L=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),A=this.rules.other.htmlBeginRegex(m);for(;e;){const _=e.split(`
`,1)[0];let I;if(p=_,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),I=p):I=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||A.test(p)||L.test(p)||y.test(p))break;if(I.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+I.slice(m);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=_+`
`,e=e.substring(_.length+1),u=I.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,T;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(T=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:T,loose:!1,text:d,tokens:[]}),a.raw+=c}const o=a.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let r=0;r<a.items.length;r++)if(this.lexer.state.top=!1,a.items[r].tokens=this.lexer.blockTokens(a.items[r].text,[]),!a.loose){const c=a.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let r=0;r<a.items.length;r++)a.items[r].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=jp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const o of n)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of a)i.rows.push(jp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Di(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=X1(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Vp(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Vp(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,o,r=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(o=[...l].length,n[3]||n[4]){r+=o;continue}else if((n[5]||n[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},An=class Sc{constructor(t){ht(this,"tokens");ht(this,"options");ht(this,"state");ht(this,"tokenizer");ht(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||La,this.options.tokenizer=this.options.tokenizer||new Oo,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ps,block:Kl.normal,inline:Ni.normal};this.options.pedantic?(s.block=Kl.pedantic,s.inline=Ni.pedantic):this.options.gfm&&(s.block=Kl.gfm,this.options.breaks?s.inline=Ni.breaks:s.inline=Ni.gfm),this.tokenizer.rules=s}static get rules(){return{block:Kl,inline:Ni}}static lex(t,s){return new Sc(s).lex(t)}static lexInline(t,s){return new Sc(s).inlineTokens(t)}lex(t){t=t.replace(ps.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(ps.tabCharGlobal,"    ").replace(ps.spaceLine,""));t;){let o;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),n=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},f),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Lo=class{constructor(e){ht(this,"options");ht(this,"parser");this.options=e||La}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(ps.notSpaceStart))==null?void 0:i[0],a=e.replace(ps.endingNewline,"")+`
`;return n?'<pre><code class="language-'+ln(n)+'">'+(s?a:ln(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:ln(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const o=e.items[l];n+=this.listitem(o)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+ln(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ln(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=zp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+ln(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=zp(e);if(a===null)return ln(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ln(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ln(e.text)}},Pd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Rn=class Tc{constructor(t){ht(this,"options");ht(this,"renderer");ht(this,"textRenderer");this.options=t||La,this.options.renderer=this.options.renderer||new Lo,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Pd}static parse(t,s){return new Tc(s).parse(t)}static parseInline(t,s){return new Tc(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const r=o;switch(r.type){case"space":{n+=this.renderer.space(r);continue}case"hr":{n+=this.renderer.hr(r);continue}case"heading":{n+=this.renderer.heading(r);continue}case"code":{n+=this.renderer.code(r);continue}case"table":{n+=this.renderer.table(r);continue}case"blockquote":{n+=this.renderer.blockquote(r);continue}case"list":{n+=this.renderer.list(r);continue}case"html":{n+=this.renderer.html(r);continue}case"paragraph":{n+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){n+=c||"";continue}}const r=o;switch(r.type){case"escape":{n+=s.text(r);break}case"html":{n+=s.html(r);break}case"link":{n+=s.link(r);break}case"image":{n+=s.image(r);break}case"strong":{n+=s.strong(r);break}case"em":{n+=s.em(r);break}case"codespan":{n+=s.codespan(r);break}case"br":{n+=s.br(r);break}case"del":{n+=s.del(r);break}case"text":{n+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Ur,eo=(Ur=class{constructor(e){ht(this,"options");ht(this,"block");this.options=e||La}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?An.lex:An.lexInline}provideParser(){return this.block?Rn.parse:Rn.parseInline}},ht(Ur,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Ur),tT=class{constructor(...e){ht(this,"defaults",Ad());ht(this,"options",this.setOptions);ht(this,"parse",this.parseMarkdown(!0));ht(this,"parseInline",this.parseMarkdown(!1));ht(this,"Parser",Rn);ht(this,"Renderer",Lo);ht(this,"TextRenderer",Pd);ht(this,"Lexer",An);ht(this,"Tokenizer",Oo);ht(this,"Hooks",eo);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let o=a.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Lo(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Oo(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new eo;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=a[l];eo.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(a,c)).then(u=>r.call(a,u));const d=o.call(a,c);return r.call(a,d)}:a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),a&&(o=o.concat(a.call(this,l))),o}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return An.lex(e,t??this.defaults)}parser(e,t){return Rn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?An.lex:An.lexInline,r=i.hooks?i.hooks.provideParser():e?Rn.parse:Rn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+ln(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},Ca=new tT;function it(e,t){return Ca.parse(e,t)}it.options=it.setOptions=function(e){return Ca.setOptions(e),it.defaults=Ca.defaults,yv(it.defaults),it};it.getDefaults=Ad;it.defaults=La;it.use=function(...e){return Ca.use(...e),it.defaults=Ca.defaults,yv(it.defaults),it};it.walkTokens=function(e,t){return Ca.walkTokens(e,t)};it.parseInline=Ca.parseInline;it.Parser=Rn;it.parser=Rn.parse;it.Renderer=Lo;it.TextRenderer=Pd;it.Lexer=An;it.lexer=An.lex;it.Tokenizer=Oo;it.Hooks=eo;it.parse=it;it.options;it.setOptions;it.use;it.walkTokens;it.parseInline;Rn.parse;An.lex;const sT={breaks:!0,gfm:!0};function qp(e){if(!e)return"";try{if(typeof it<"u"&&it.parse){const t=it.parse(e,sT);return typeof Up<"u"?Up.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function nT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const aT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function iT(e){return aT[e]||"wrench"}const lT=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Gp(e){if(!e)return[];const t=e.match(lT);return t?[...new Set(t)]:[]}const oT={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(""),a=h(null),i=h(null),l=h(0),o=h("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=G(()=>t.value.trim().length>0&&!s.value),p=h(Xe.state||"disconnected");let f=null;const m=G(()=>{const C=p.value;return C==="connected"?"Connected":C==="reconnecting"?"Reconnecting…":C==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],T=G(()=>{const C=Math.floor(l.value/4)%v.length,S=l.value;return S>3?`${v[C]} (${S}s)`:v[0]});function L(){It(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function y(){if(!i.value)return;const C=i.value;C.style.height="auto",C.style.height=Math.min(C.scrollHeight,120)+"px"}function g(C,S,O={}){const U={id:++c,role:C,content:S,timestamp:Date.now(),html:C==="bot"?qp(S):"",tools_used:O.tools_used||[],is_error:O.is_error||!1,images:C==="bot"?Gp(S):[],files:O.files||[],_showTools:!1};return e.value.push(U),L(),C==="bot"&&It(()=>b()),U}function b(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(S=>{S.setAttribute("data-copy","true"),S.style.position="relative";const O=document.createElement("button");O.className="chat-code-copy",O.textContent="Copy",O.addEventListener("click",()=>{const U=S.querySelector("code"),Z=U?U.textContent:S.textContent;navigator.clipboard.writeText(Z).then(()=>{O.textContent="Copied!",setTimeout(()=>{O.textContent="Copy"},1500)}).catch(()=>{})}),S.appendChild(O)})}function A(C){if(C===0)return!0;const S=e.value[C-1],O=e.value[C],U=new Date(S.timestamp).toDateString(),Z=new Date(O.timestamp).toDateString();return U!==Z}function _(C){const S=new Date(C),O=new Date;if(S.toDateString()===O.toDateString())return"Today";const U=new Date(O);return U.setDate(U.getDate()-1),S.toDateString()===U.toDateString()?"Yesterday":S.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function I(C){t.value=C,It(()=>H())}function E(C){window.open(C,"_blank","noopener")}function x(C){C.target.style.display="none"}function N(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function $(){r&&(clearInterval(r),r=null),l.value=0}function k(C){s.value&&(s.value=!1,$(),C.type==="chat_response"?g("bot",C.content,{tools_used:C.tools_used||[],is_error:C.is_error||!1,files:C.files||[]}):C.type==="chat_error"&&g("bot",C.error||"Unknown error",{is_error:!0}),It(()=>{var S;return(S=i.value)==null?void 0:S.focus()}))}async function M(C){try{const S=await B.post("/api/chat",{content:C,channel_id:o.value});g("bot",S.response,{tools_used:S.tools_used||[],is_error:S.is_error||!1,files:S.files||[]})}catch(S){g("bot",S.message||"Failed to send message",{is_error:!0})}}async function H(){const C=t.value.trim();if(!C||s.value)return;g("user",C),t.value="",s.value=!0,N(),i.value&&(i.value.style.height="auto"),Xe.connected&&Xe.sendChat(C,{channelId:o.value})||(await M(C),s.value=!1,$()),It(()=>{var O;return(O=i.value)==null?void 0:O.focus()})}async function K(){n.value="";try{if(!o.value){const S=await B.get("/api/auth/session");o.value=S.channel_id||S.user_id||"web-user"}const C=await B.get("/api/sessions/"+encodeURIComponent(o.value));if(C&&C.messages&&C.messages.length>0){for(const S of C.messages){const O=S.role==="user"?"user":"bot";let U=S.content||"";if(O==="user"){const W=U.match(/^\[.*?\]:\s*/);W&&(U=U.slice(W[0].length))}if(!U.trim())continue;const Z={id:++c,role:O,content:U,timestamp:S.timestamp?S.timestamp*1e3:Date.now(),html:O==="bot"?qp(U):"",tools_used:[],is_error:!1,images:O==="bot"?Gp(U):[],files:[],_showTools:!1};e.value.push(Z)}It(()=>{L(),b()})}}catch(C){C&&C.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",we.error(n.value))}}return je(()=>{Xe.subscribe("chat",k),p.value=Xe.state||"disconnected",f=Xe.onState(C=>{p.value=C}),K(),It(()=>{var C;return(C=i.value)==null?void 0:C.focus()})}),ft(()=>{Xe.unsubscribe("chat",k),f&&(f(),f=null),$()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:T,suggestions:d,send:H,autoResize:y,formatTime:nT,formatDate:_,showDateSeparator:A,useSuggestion:I,openImage:E,onImageError:x,getToolIcon:iT,loadHistory:K}}},rT={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),o=h(!1),r=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),m=G(()=>e.value==="custom"),v=G(()=>[...i.value,...l.value]),T=G(()=>l.value.includes(e.value)),L=G(()=>{var E;return m.value?t.value||"Odin":((E=a.value[e.value])==null?void 0:E.name)||e.value}),y=G(()=>{var E;return m.value?s.value||"(empty — will use Odin default)":((E=a.value[e.value])==null?void 0:E.identity)||""}),g=G(()=>{var E;return m.value?n.value||"(empty — will use Odin default)":((E=a.value[e.value])==null?void 0:E.voice)||""});async function b(){d.value=!0;try{const E=await B.get("/api/personality");e.value=E.preset||"odin",t.value=E.custom_name||"",s.value=E.custom_identity||"",n.value=E.custom_voice||"",a.value=E.presets||{},i.value=E.builtin_presets||[],l.value=E.user_presets||[]}catch(E){c.value=E.message}finally{d.value=!1}}async function A(){o.value=!0,c.value=null,r.value=!1;try{await B.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(E){c.value=E.message}finally{o.value=!1}}async function _(){const E=u.value.trim();if(E){f.value=!0,c.value=null;try{await B.post("/api/personality/presets",{name:E,display_name:L.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=E.toLowerCase().replace(/ /g,"_")}catch(x){c.value=x.message}finally{f.value=!1}}}async function I(){if(await Kt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await B.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(x){c.value=x.message}}}return je(b),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:T,previewName:L,previewIdentity:y,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:A,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:_,deletePreset:I,builtinPresets:i,userPresets:l}},template:`
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
  `},St=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Iv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:jS,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:oT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:lk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:mk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Pk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:rT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:PS,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:St("/operations","live")},{path:"/agents",redirect:St("/operations","agents")},{path:"/loops",redirect:St("/operations","loops")},{path:"/processes",redirect:St("/operations","processes")},{path:"/schedules",redirect:St("/operations","schedules")},{path:"/audit",redirect:St("/history","audit")},{path:"/sessions",redirect:St("/history","sessions")},{path:"/traces",redirect:St("/history","traces")},{path:"/usage",redirect:St("/history","usage")},{path:"/tools",redirect:St("/capabilities","tools")},{path:"/skills",redirect:St("/capabilities","skills")},{path:"/mcp",redirect:St("/capabilities","mcp-servers")},{path:"/knowledge",redirect:St("/capabilities","knowledge")},{path:"/memory",redirect:St("/capabilities","memory")},{path:"/learned",redirect:St("/capabilities","learned")},{path:"/health",redirect:St("/system","health")},{path:"/resources",redirect:St("/system","resources")},{path:"/logs",redirect:St("/system","logs")},{path:"/config",redirect:St("/system","config")},{path:"/host-access",redirect:St("/system","host-access")},{path:"/hosts",redirect:St("/system","hosts")},{path:"/internals",redirect:St("/system","internals")}],Ji=Mw({history:fw(),routes:Iv});Ji.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const cT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{B.setPersist(a.value),await B.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},dT={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let o=null,r=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const m=h("starting"),v=h(""),T=Iv.filter(U=>U.meta),L=G(()=>["Workspace","Operate","Observe","Manage"].map(U=>({name:U,routes:T.filter(Z=>Z.meta.section===U)})).filter(U=>U.routes.length)),y=G(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.label)||"Odin"}),g=G(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.section)||"Management"}),b=G(()=>{var U;return((U=Ji.currentRoute.value.meta)==null?void 0:U.description)||"Management console"});function A(){Xe.disconnect(),H&&(clearInterval(H),H=null)}B.onSessionExpired=()=>{t.value=!0,A(),B.setToken(""),e.value="login"};function _(U){var Z;if((U.ctrlKey||U.metaKey)&&U.key.toLowerCase()==="k"){e.value==="ready"&&(U.preventDefault(),Sp());return}if(n.value&&U.key==="Tab"){const W=[...((Z=a.value)==null?void 0:Z.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(W.length){const te=W[0],re=W[W.length-1];if(U.shiftKey&&(document.activeElement===te||!a.value.contains(document.activeElement))){U.preventDefault(),re.focus();return}if(!U.shiftKey&&(document.activeElement===re||!a.value.contains(document.activeElement))){U.preventDefault(),te.focus();return}}}if(U.key==="Escape"&&n.value){n.value=!1,U.preventDefault();return}if(U.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(U.target.tagName)){U.preventDefault();const W=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');W&&W.focus()}}function I(){l.value=!!(o!=null&&o.matches),l.value||(n.value=!1)}je(async()=>{document.addEventListener("keydown",_),o=window.matchMedia("(max-width: 900px)"),I(),o.addEventListener("change",I);const U=await B.check();U.ok?(e.value="ready",S()):U.needsAuth?e.value="login":(e.value="ready",S())});function E(){t.value=!1,e.value="ready",S()}async function x(){A(),e.value="login",await B.logout()}function N(){s.value=!s.value}function $(){n.value=!n.value}Ft(n,async U=>{var Z,W;if(U)r=document.activeElement,await It(),(W=(Z=a.value)==null?void 0:Z.querySelector(".nav-item"))==null||W.focus();else if(r!=null&&r.isConnected){const te=r;r=null,requestAnimationFrame(()=>te.focus())}});const k=G(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M(U,Z="info",W=3e3){p.value={text:U,level:Z},clearTimeout(f),f=setTimeout(()=>{p.value=null},W)}let H=null,K=!1,C=[];function S(){for(const U of C)U();C=[Xe.onStatus(U=>{c.value=U}),Xe.onLatencyChange(U=>{u.value=U}),Xe.onState((U,Z)=>{d.value=U,U==="connected"?(K&&M("Connection restored","success"),K=!0):U==="reconnecting"&&Z.attempt===1&&M("Connection lost — reconnecting…","warn")})],Xe.connect(),O(),H&&clearInterval(H),H=setInterval(O,15e3)}async function O(){try{const U=await B.get("/api/status");m.value=U.status==="online"?"online":"starting";const Z=U.uptime_seconds||0,W=Math.floor(Z/3600),te=Math.floor(Z%3600/60);v.value=`${W}h ${te}m uptime`}catch{m.value="offline",v.value=""}}return ft(()=>{H&&clearInterval(H);for(const U of C)U();C=[],Xe.disconnect(),document.removeEventListener("keydown",_),o==null||o.removeEventListener("change",I)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:k,wsToast:p,botStatus:m,botUptime:v,navRoutes:T,navGroups:L,currentPage:y,currentSection:g,currentDescription:b,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:E,logout:x,toggleSidebar:N,toggleMobileNavigation:$,openPalette:Sp}}},ia=yo(dT);ia.component("odin-icon",BS);ia.component("login-screen",cT);ia.component("toast-container",E_);ia.component("confirm-host",A_);ia.component("command-palette",US);ia.directive("modal-focus",zS);ia.use(Ji);ia.mount("#app");
