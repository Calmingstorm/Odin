var Rb=Object.defineProperty;var Ib=(e,t,s)=>t in e?Rb(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var Tt=(e,t,s)=>Ib(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Ob{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new go("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new mc(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new go("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new mc((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}async setListenerExposure(t,s){const a=await fetch("/api/setup/listener",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({expose_beyond_loopback:s})}),n=await a.json().catch(()=>null);if(!a.ok)throw new mc((n==null?void 0:n.error)||"Listener reauthentication failed",a.status,n);return n}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new go((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof go?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class go extends Error{constructor(t){super(t),this.name="AuthError"}}class mc extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class Lb{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const j=new Ob,ct=new Lb(j);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Ys(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const it={},Ai=[],ms=()=>{},Ci=()=>!1,Xn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Er=e=>e.startsWith("onUpdate:"),at=Object.assign,Ld=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Nb=Object.prototype.hasOwnProperty,gt=(e,t)=>Nb.call(e,t),Ie=Array.isArray,Ri=e=>Zi(e)==="[object Map]",ei=e=>Zi(e)==="[object Set]",Xu=e=>Zi(e)==="[object Date]",Mb=e=>Zi(e)==="[object RegExp]",Ve=e=>typeof e=="function",Je=e=>typeof e=="string",Ss=e=>typeof e=="symbol",ht=e=>e!==null&&typeof e=="object",Nd=e=>(ht(e)||Ve(e))&&Ve(e.then)&&Ve(e.catch),cm=Object.prototype.toString,Zi=e=>cm.call(e),Db=e=>Zi(e).slice(8,-1),Ar=e=>Zi(e)==="[object Object]",Rr=e=>Je(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Za=Ys(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Pb=Ys("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ir=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},$b=/-\w/g,St=Ir(e=>e.replace($b,t=>t.slice(1).toUpperCase())),Fb=/\B([A-Z])/g,zs=Ir(e=>e.replace(Fb,"-$1").toLowerCase()),ti=Ir(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ii=Ir(e=>e?`on${ti(e)}`:""),is=(e,t)=>!Object.is(e,t),Oi=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},dm=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Or=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Zo=e=>{const t=Je(e)?Number(e):NaN;return isNaN(t)?e:t};let ep;const Lr=()=>ep||(ep=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Bb(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const Ub="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",zb=Ys(Ub);function to(e){if(Ie(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=Je(a)?um(a):to(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(Je(e)||ht(e))return e}const Hb=/;(?![^(]*\))/g,jb=/:([^]+)/,Vb=/\/\*[^]*?\*\//g;function um(e){const t={};return e.replace(Vb,"").split(Hb).forEach(s=>{if(s){const a=s.split(jb);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function so(e){let t="";if(Je(e))t=e;else if(Ie(e))for(let s=0;s<e.length;s++){const a=so(e[s]);a&&(t+=a+" ")}else if(ht(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function qb(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Je(t)&&(e.class=so(t)),s&&(e.style=to(s)),e}const Gb="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Wb="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Kb="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Jb="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Zb=Ys(Gb),Yb=Ys(Wb),Qb=Ys(Kb),Xb=Ys(Jb),ey="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",ty=Ys(ey);function pm(e){return!!e||e===""}function sy(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=en(e[a],t[a]);return s}function en(e,t){if(e===t)return!0;let s=Xu(e),a=Xu(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=Ss(e),a=Ss(t),s||a)return e===t;if(s=Ie(e),a=Ie(t),s||a)return s&&a?sy(e,t):!1;if(s=ht(e),a=ht(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!en(e[l],t[l]))return!1}}return String(e)===String(t)}function Nr(e,t){return e.findIndex(s=>en(s,t))}const fm=e=>!!(e&&e.__v_isRef===!0),mm=e=>Je(e)?e:e==null?"":Ie(e)||ht(e)&&(e.toString===cm||!Ve(e.toString))?fm(e)?mm(e.value):JSON.stringify(e,hm,2):String(e),hm=(e,t)=>fm(t)?hm(e,t.value):Ri(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[hc(a,i)+" =>"]=n,s),{})}:ei(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>hc(s))}:Ss(t)?hc(t):ht(t)&&!Ie(t)&&!Ar(t)?String(t):t,hc=(e,t="")=>{var s;return Ss(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function ay(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let ts;class Md{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&ts&&(ts.active?(this.parent=ts,this.index=(ts.scopes||(ts.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=ts;try{return ts=this,t()}finally{ts=s}}}on(){++this._on===1&&(this.prevScope=ts,ts=this)}off(){if(this._on>0&&--this._on===0){if(ts===this)ts=this.prevScope;else{let t=ts;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function ny(e){return new Md(e)}function vm(){return ts}function iy(e,t=!1){ts&&ts.cleanups.push(e)}let Rt;const vc=new WeakSet;class Ml{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,ts&&(ts.active?ts.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,vc.has(this)&&(vc.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||bm(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,tp(this),ym(this);const t=Rt,s=ma;Rt=this,ma=!0;try{return this.fn()}finally{xm(this),Rt=t,ma=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)$d(t);this.deps=this.depsTail=void 0,tp(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?vc.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Gc(this)&&this.run()}get dirty(){return Gc(this)}}let gm=0,Sl,Cl;function bm(e,t=!1){if(e.flags|=8,t){e.next=Cl,Cl=e;return}e.next=Sl,Sl=e}function Dd(){gm++}function Pd(){if(--gm>0)return;if(Cl){let t=Cl;for(Cl=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Sl;){let t=Sl;for(Sl=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function ym(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function xm(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),$d(a),ly(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Gc(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(_m(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function _m(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Dl)||(e.globalVersion=Dl,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Gc(e))))return;e.flags|=2;const t=e.dep,s=Rt,a=ma;Rt=e,ma=!0;try{ym(e);const n=e.fn(e._value);(t.version===0||is(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{Rt=s,ma=a,xm(e),e.flags&=-3}}function $d(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)$d(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function ly(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function oy(e,t){e.effect instanceof Ml&&(e=e.effect.fn);const s=new Ml(e);t&&at(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function ry(e){e.effect.stop()}let ma=!0;const wm=[];function tn(){wm.push(ma),ma=!1}function sn(){const e=wm.pop();ma=e===void 0?!0:e}function tp(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=Rt;Rt=void 0;try{t()}finally{Rt=s}}}let Dl=0;class cy{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Mr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!Rt||!ma||Rt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==Rt)s=this.activeLink=new cy(Rt,this),Rt.deps?(s.prevDep=Rt.depsTail,Rt.depsTail.nextDep=s,Rt.depsTail=s):Rt.deps=Rt.depsTail=s,km(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=Rt.depsTail,s.nextDep=void 0,Rt.depsTail.nextDep=s,Rt.depsTail=s,Rt.deps===s&&(Rt.deps=a)}return s}trigger(t){this.version++,Dl++,this.notify(t)}notify(t){Dd();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Pd()}}}function km(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)km(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Yo=new WeakMap,Vn=Symbol(""),Wc=Symbol(""),Pl=Symbol("");function _s(e,t,s){if(ma&&Rt){let a=Yo.get(e);a||Yo.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new Mr),n.map=a,n.key=s),n.track()}}function qa(e,t,s,a,n,i){const l=Yo.get(e);if(!l){Dl++;return}const o=r=>{r&&r.trigger()};if(Dd(),t==="clear")l.forEach(o);else{const r=Ie(e),c=r&&Rr(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Pl||!Ss(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Pl)),t){case"add":r?c&&o(l.get("length")):(o(l.get(Vn)),Ri(e)&&o(l.get(Wc)));break;case"delete":r||(o(l.get(Vn)),Ri(e)&&o(l.get(Wc)));break;case"set":Ri(e)&&o(l.get(Vn));break}}Pd()}function dy(e,t){const s=Yo.get(e);return s&&s.get(t)}function hi(e){const t=rt(e);return t===e?t:(_s(t,"iterate",Pl),js(e)?t:t.map(va))}function Dr(e){return _s(e=rt(e),"iterate",Pl),e}function Aa(e,t){return Ia(e)?Fi(Ya(e)?va(t):t):va(t)}const uy={__proto__:null,[Symbol.iterator](){return gc(this,Symbol.iterator,e=>Aa(this,e))},concat(...e){return hi(this).concat(...e.map(t=>Ie(t)?hi(t):t))},entries(){return gc(this,"entries",e=>(e[1]=Aa(this,e[1]),e))},every(e,t){return $a(this,"every",e,t,void 0,arguments)},filter(e,t){return $a(this,"filter",e,t,s=>s.map(a=>Aa(this,a)),arguments)},find(e,t){return $a(this,"find",e,t,s=>Aa(this,s),arguments)},findIndex(e,t){return $a(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return $a(this,"findLast",e,t,s=>Aa(this,s),arguments)},findLastIndex(e,t){return $a(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return $a(this,"forEach",e,t,void 0,arguments)},includes(...e){return bc(this,"includes",e)},indexOf(...e){return bc(this,"indexOf",e)},join(e){return hi(this).join(e)},lastIndexOf(...e){return bc(this,"lastIndexOf",e)},map(e,t){return $a(this,"map",e,t,void 0,arguments)},pop(){return rl(this,"pop")},push(...e){return rl(this,"push",e)},reduce(e,...t){return sp(this,"reduce",e,t)},reduceRight(e,...t){return sp(this,"reduceRight",e,t)},shift(){return rl(this,"shift")},some(e,t){return $a(this,"some",e,t,void 0,arguments)},splice(...e){return rl(this,"splice",e)},toReversed(){return hi(this).toReversed()},toSorted(e){return hi(this).toSorted(e)},toSpliced(...e){return hi(this).toSpliced(...e)},unshift(...e){return rl(this,"unshift",e)},values(){return gc(this,"values",e=>Aa(this,e))}};function gc(e,t,s){const a=Dr(e),n=a[t]();return a!==e&&!js(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const py=Array.prototype;function $a(e,t,s,a,n,i){const l=Dr(e),o=l!==e&&!js(e),r=l[t];if(r!==py[t]){const u=r.apply(e,i);return o?va(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,Aa(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function sp(e,t,s,a){const n=Dr(e),i=n!==e&&!js(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=Aa(e,c)),s.call(this,c,Aa(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?Aa(e,r):r}function bc(e,t,s){const a=rt(e);_s(a,"iterate",Pl);const n=a[t](...s);return(n===-1||n===!1)&&ao(s[0])?(s[0]=rt(s[0]),a[t](...s)):n}function rl(e,t,s=[]){tn(),Dd();const a=rt(e)[t].apply(e,s);return Pd(),sn(),a}const fy=Ys("__proto__,__v_isRef,__isVue"),Sm=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Ss));function my(e){Ss(e)||(e=String(e));const t=rt(this);return _s(t,"has",e),t.hasOwnProperty(e)}class Cm{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?Om:Im:i?Rm:Am).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Ie(t);if(!n){let r;if(l&&(r=uy[s]))return r;if(s==="hasOwnProperty")return my}const o=Reflect.get(t,s,Kt(t)?t:a);if((Ss(s)?Sm.has(s):fy(s))||(n||_s(t,"get",s),i))return o;if(Kt(o)){const r=l&&Rr(s)?o:o.value;return n&&ht(r)?Qo(r):r}return ht(o)?n?Qo(o):Cn(o):o}}class Tm extends Cm{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Ie(t)&&Rr(s);if(!this._isShallow){const c=Ia(i);if(!js(a)&&!Ia(a)&&(i=rt(i),a=rt(a)),!l&&Kt(i)&&!Kt(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:gt(t,s),r=Reflect.set(t,s,a,Kt(t)?t:n);return t===rt(n)&&(o?is(a,i)&&qa(t,"set",s,a):qa(t,"add",s,a)),r}deleteProperty(t,s){const a=gt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&qa(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!Ss(s)||!Sm.has(s))&&_s(t,"has",s),a}ownKeys(t){return _s(t,"iterate",Ie(t)?"length":Vn),Reflect.ownKeys(t)}}class Em extends Cm{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const hy=new Tm,vy=new Em,gy=new Tm(!0),by=new Em(!0),Kc=e=>e,bo=e=>Reflect.getPrototypeOf(e);function yy(e,t,s){return function(...a){const n=this.__v_raw,i=rt(n),l=Ri(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?Kc:t?Fi:va;return!t&&_s(i,"iterate",r?Wc:Vn),at(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function yo(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function xy(e,t){const s={get(n){const i=this.__v_raw,l=rt(i),o=rt(n);e||(is(n,o)&&_s(l,"get",n),_s(l,"get",o));const{has:r}=bo(l),c=t?Kc:e?Fi:va;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&_s(rt(n),"iterate",Vn),n.size},has(n){const i=this.__v_raw,l=rt(i),o=rt(n);return e||(is(n,o)&&_s(l,"has",n),_s(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=rt(o),c=t?Kc:e?Fi:va;return!e&&_s(r,"iterate",Vn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return at(s,e?{add:yo("add"),set:yo("set"),delete:yo("delete"),clear:yo("clear")}:{add(n){const i=rt(this),l=bo(i),o=rt(n),r=!t&&!js(n)&&!Ia(n)?o:n;return l.has.call(i,r)||is(n,r)&&l.has.call(i,n)||is(o,r)&&l.has.call(i,o)||(i.add(r),qa(i,"add",r,r)),this},set(n,i){!t&&!js(i)&&!Ia(i)&&(i=rt(i));const l=rt(this),{has:o,get:r}=bo(l);let c=o.call(l,n);c||(n=rt(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?is(i,d)&&qa(l,"set",n,i):qa(l,"add",n,i),this},delete(n){const i=rt(this),{has:l,get:o}=bo(i);let r=l.call(i,n);r||(n=rt(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&qa(i,"delete",n,void 0),c},clear(){const n=rt(this),i=n.size!==0,l=n.clear();return i&&qa(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=yy(n,e,t)}),s}function Pr(e,t){const s=xy(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(gt(s,n)&&n in a?s:a,n,i)}const _y={get:Pr(!1,!1)},wy={get:Pr(!1,!0)},ky={get:Pr(!0,!1)},Sy={get:Pr(!0,!0)},Am=new WeakMap,Rm=new WeakMap,Im=new WeakMap,Om=new WeakMap;function Cy(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Cn(e){return Ia(e)?e:$r(e,!1,hy,_y,Am)}function Fd(e){return $r(e,!1,gy,wy,Rm)}function Qo(e){return $r(e,!0,vy,ky,Im)}function Ty(e){return $r(e,!0,by,Sy,Om)}function $r(e,t,s,a,n){if(!ht(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Cy(Db(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Ya(e){return Ia(e)?Ya(e.__v_raw):!!(e&&e.__v_isReactive)}function Ia(e){return!!(e&&e.__v_isReadonly)}function js(e){return!!(e&&e.__v_isShallow)}function ao(e){return e?!!e.__v_raw:!1}function rt(e){const t=e&&e.__v_raw;return t?rt(t):e}function Lm(e){return!gt(e,"__v_skip")&&Object.isExtensible(e)&&dm(e,"__v_skip",!0),e}const va=e=>ht(e)?Cn(e):e,Fi=e=>ht(e)?Qo(e):e;function Kt(e){return e?e.__v_isRef===!0:!1}function f(e){return Nm(e,!1)}function Bd(e){return Nm(e,!0)}function Nm(e,t){return Kt(e)?e:new Ey(e,t)}class Ey{constructor(t,s){this.dep=new Mr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:rt(t),this._value=s?t:va(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||js(t)||Ia(t);t=a?t:rt(t),is(t,s)&&(this._rawValue=t,this._value=a?t:va(t),this.dep.trigger())}}function Ay(e){e.dep&&e.dep.trigger()}function Ra(e){return Kt(e)?e.value:e}function Ry(e){return Ve(e)?e():Ra(e)}const Iy={get:(e,t,s)=>t==="__v_raw"?e:Ra(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return Kt(n)&&!Kt(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function Ud(e){return Ya(e)?e:new Proxy(e,Iy)}class Oy{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Mr,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Mm(e){return new Oy(e)}function Ly(e){const t=Ie(e)?new Array(e.length):{};for(const s in e)t[s]=Dm(e,s);return t}class Ny{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=Ss(s)?s:String(s),this._raw=rt(t);let n=!0,i=t;if(!Ie(t)||Ss(this._key)||!Rr(this._key))do n=!ao(i)||js(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=Ra(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Kt(this._raw[this._key])){const s=this._object[this._key];if(Kt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return dy(this._raw,this._key)}}class My{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Dy(e,t,s){return Kt(e)?e:Ve(e)?new My(e):ht(e)&&arguments.length>1?Dm(e,t,s):f(e)}function Dm(e,t,s){return new Ny(e,t,s)}class Py{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Mr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Dl-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&Rt!==this)return bm(this,!0),!0}get value(){const t=this.dep.track();return _m(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function $y(e,t,s=!1){let a,n;return Ve(e)?a=e:(a=e.get,n=e.set),new Py(a,n,s)}const Fy={GET:"get",HAS:"has",ITERATE:"iterate"},By={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},xo={},Xo=new WeakMap;let gn;function Uy(){return gn}function Pm(e,t=!1,s=gn){if(s){let a=Xo.get(s);a||Xo.set(s,a=[]),a.push(e)}}function zy(e,t,s=it){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=x=>n?x:js(x)||n===!1||n===0?Ga(x,1):Ga(x);let d,u,p,m,h=!1,b=!1;if(Kt(e)?(u=()=>e.value,h=js(e)):Ya(e)?(u=()=>c(e),h=!0):Ie(e)?(b=!0,h=e.some(x=>Ya(x)||js(x)),u=()=>e.map(x=>{if(Kt(x))return x.value;if(Ya(x))return c(x);if(Ve(x))return r?r(x,2):x()})):Ve(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){tn();try{p()}finally{sn()}}const x=gn;gn=d;try{return r?r(e,3,[m]):e(m)}finally{gn=x}}:u=ms,t&&n){const x=u,S=n===!0?1/0:n;u=()=>Ga(x(),S)}const I=vm(),k=()=>{d.stop(),I&&I.active&&Ld(I.effects,d)};if(i&&t){const x=t;t=(...S)=>{const _=x(...S);return k(),_}}let y=b?new Array(e.length).fill(xo):xo;const g=x=>{if(!(!(d.flags&1)||!d.dirty&&!x))if(t){const S=d.run();if(x||n||h||(b?S.some((_,E)=>is(_,y[E])):is(S,y))){p&&p();const _=gn;gn=d;try{const E=[S,y===xo?void 0:b&&y[0]===xo?[]:y,m];y=S,r?r(t,3,E):t(...E)}finally{gn=_}}}else d.run()};return o&&o(g),d=new Ml(u),d.scheduler=l?()=>l(g,!1):g,m=x=>Pm(x,!1,d),p=d.onStop=()=>{const x=Xo.get(d);if(x){if(r)r(x,4);else for(const S of x)S();Xo.delete(d)}},t?a?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),k.pause=d.pause.bind(d),k.resume=d.resume.bind(d),k.stop=k,k}function Ga(e,t=1/0,s){if(t<=0||!ht(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Kt(e))Ga(e.value,t,s);else if(Ie(e))for(let a=0;a<e.length;a++)Ga(e[a],t,s);else if(ei(e)||Ri(e))e.forEach(a=>{Ga(a,t,s)});else if(Ar(e)){for(const a in e)Ga(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ga(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const $m=[];function Hy(e){$m.push(e)}function jy(){$m.pop()}function Vy(e,t){}const qy={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Gy={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Yi(e,t,s,a){try{return a?e(...a):e()}catch(n){si(n,t,s)}}function Zs(e,t,s,a){if(Ve(e)){const n=Yi(e,t,s,a);return n&&Nd(n)&&n.catch(i=>{si(i,t,s)}),n}if(Ie(e)){const n=[];for(let i=0;i<e.length;i++)n.push(Zs(e[i],t,s,a));return n}}function si(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||it;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){tn(),Yi(i,null,10,[e,r,c]),sn();return}}Wy(e,s,n,a,l)}function Wy(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const Rs=[];let Ta=-1;const Li=[];let bn=null,_i=0;const Fm=Promise.resolve();let er=null;function jt(e){const t=er||Fm;return e?t.then(this?e.bind(this):e):t}function Ky(e){let t=Ta+1,s=Rs.length;for(;t<s;){const a=t+s>>>1,n=Rs[a],i=Fl(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function zd(e){if(!(e.flags&1)){const t=Fl(e),s=Rs[Rs.length-1];!s||!(e.flags&2)&&t>=Fl(s)?Rs.push(e):Rs.splice(Ky(t),0,e),e.flags|=1,Bm()}}function Bm(){er||(er=Fm.then(Um))}function $l(e){Ie(e)?Li.push(...e):bn&&e.id===-1?bn.splice(_i+1,0,e):e.flags&1||(Li.push(e),e.flags|=1),Bm()}function ap(e,t,s=Ta+1){for(;s<Rs.length;s++){const a=Rs[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;Rs.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function tr(e){if(Li.length){const t=[...new Set(Li)].sort((s,a)=>Fl(s)-Fl(a));if(Li.length=0,bn){bn.push(...t);return}for(bn=t,_i=0;_i<bn.length;_i++){const s=bn[_i];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}bn=null,_i=0}}const Fl=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Um(e){try{for(Ta=0;Ta<Rs.length;Ta++){const t=Rs[Ta];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Yi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ta<Rs.length;Ta++){const t=Rs[Ta];t&&(t.flags&=-2)}Ta=-1,Rs.length=0,tr(),er=null,(Rs.length||Li.length)&&Um()}}let wi,_o=[];function zm(e,t){var s,a;wi=e,wi?(wi.enabled=!0,_o.forEach(({event:n,args:i})=>wi.emit(n,...i)),_o=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{zm(i,t)}),setTimeout(()=>{wi||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,_o=[])},3e3)):_o=[]}let fs=null,Fr=null;function Bl(e){const t=fs;return fs=e,Fr=e&&e.type.__scopeId||null,t}function Jy(e){Fr=e}function Zy(){Fr=null}const Yy=e=>Hd;function Hd(e,t=fs,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&jl(-1);const i=Bl(t);let l;try{l=e(...n)}finally{Bl(i),a._d&&jl(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function Qy(e,t){if(fs===null)return e;const s=oo(fs),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=it]=t[n];i&&(Ve(i)&&(i={mounted:i,updated:i}),i.deep&&Ga(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function Ea(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(tn(),Zs(r,s,8,[e.el,o,e,t]),sn())}}function Tl(e,t){if(ps){let s=ps.provides;const a=ps.parent&&ps.parent.provides;a===s&&(s=ps.provides=Object.create(a)),s[e]=t}}function la(e,t,s=!1){const a=Os();if(a||qn){let n=qn?qn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&Ve(t)?t.call(a&&a.proxy):t}}function Xy(){return!!(Os()||qn)}const Hm=Symbol.for("v-scx"),jm=()=>la(Hm);function ex(e,t){return no(e,null,t)}function tx(e,t){return no(e,null,{flush:"post"})}function Vm(e,t){return no(e,null,{flush:"sync"})}function Jt(e,t,s){return no(e,t,s)}function no(e,t,s=it){const{immediate:a,deep:n,flush:i,once:l}=s,o=at({},s),r=t&&a||!t&&i!=="post";let c;if(Zn){if(i==="sync"){const m=jm();c=m.__watcherHandles||(m.__watcherHandles=[])}else if(!r){const m=()=>{};return m.stop=ms,m.resume=ms,m.pause=ms,m}}const d=ps;o.call=(m,h,b)=>Zs(m,d,h,b);let u=!1;i==="post"?o.scheduler=m=>{Gt(m,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(m,h)=>{h?m():zd(m)}),o.augmentJob=m=>{t&&(m.flags|=4),u&&(m.flags|=2,d&&(m.id=d.uid,m.i=d))};const p=zy(e,t,o);return Zn&&(c?c.push(p):r&&p()),p}function sx(e,t,s){const a=this.proxy,n=Je(e)?e.includes(".")?qm(a,e):()=>a[e]:e.bind(a,a);let i;Ve(t)?i=t:(i=t.handler,s=t);const l=Qi(this),o=no(n,i.bind(a),s);return l(),o}function qm(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const hn=new WeakMap,Gm=Symbol("_vte"),Wm=e=>e.__isTeleport,Un=e=>e&&(e.disabled||e.disabled===""),ax=e=>e&&(e.defer||e.defer===""),np=e=>typeof SVGElement<"u"&&e instanceof SVGElement,ip=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Jc=(e,t)=>{const s=e&&e.to;return Je(s)?t?t(s):null:s},nx={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:m,querySelector:h,createText:b,createComment:I,parentNode:k}}=c,y=Un(t.props);let{dynamicChildren:g}=t;const x=(E,R,w)=>{E.shapeFlag&16&&d(E.children,R,w,n,i,l,o,r)},S=(E=t)=>{const R=Un(E.props),w=E.target=Jc(E.props,h),O=Zc(w,E,b,m);w&&(l!=="svg"&&np(w)?l="svg":l!=="mathml"&&ip(w)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(w),R||(x(E,w,O),yl(E,!1)))},_=E=>{const R=()=>{if(hn.get(E)===R){if(hn.delete(E),Un(E.props)){const w=k(E.el)||s;x(E,w,E.anchor),yl(E,!0)}S(E)}};hn.set(E,R),Gt(R,i)};if(e==null){const E=t.el=b(""),R=t.anchor=b("");if(m(E,s,a),m(R,s,a),ax(t.props)||i&&i.pendingBranch){_(t);return}y&&(x(t,s,R),yl(t,!0)),S()}else{t.el=e.el;const E=t.anchor=e.anchor,R=hn.get(e);if(R){R.flags|=8,hn.delete(e),_(t);return}t.targetStart=e.targetStart;const w=t.target=e.target,O=t.targetAnchor=e.targetAnchor,U=Un(e.props),T=U?s:w,$=U?E:O;if(l==="svg"||np(w)?l="svg":(l==="mathml"||ip(w))&&(l="mathml"),g?(p(e.dynamicChildren,g,T,n,i,l,o),Xd(e,t,!0)):r||u(e,t,T,$,n,i,l,o,!1),y)U?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):wo(t,s,E,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Q=t.target=Jc(t.props,h);Q&&wo(t,Q,null,c,0)}else U&&wo(t,w,O,c,1);yl(t,y)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,m=i||!Un(p),h=hn.get(e);if(h&&(h.flags|=8,hn.delete(e)),u&&(n(c),n(d)),i&&n(r),!h&&l&16)for(let b=0;b<o.length;b++){const I=o[b];a(I,t,s,m,!!I.dynamicChildren)}},move:wo,hydrate:ix};function wo(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!hn.has(e)&&(!u||Un(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function ix(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(I,k){let y=k;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,I._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function m(I,k){k.anchor=u(l(I),k,o(I),s,a,n,i)}const h=t.target=Jc(t.props,r),b=Un(t.props);if(h){const I=h._lpa||h.firstChild;t.shapeFlag&16&&(b?(m(e,t),p(h,I),t.targetAnchor||Zc(h,t,d,c,o(e)===h?e:null)):(t.anchor=l(e),p(h,I),t.targetAnchor||Zc(h,t,d,c),u(I&&l(I),t,h,s,a,n,i))),yl(t,b)}else b&&t.shapeFlag&16&&(m(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const lx=nx;function yl(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function Zc(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Gm]=l,e&&(a(i,e,n),a(l,e,n)),l}const sa=Symbol("_leaveCb"),cl=Symbol("_enterCb");function jd(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return tt(()=>{e.isMounted=!0}),Hr(()=>{e.isUnmounting=!0}),e}const ta=[Function,Array],Vd={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:ta,onEnter:ta,onAfterEnter:ta,onEnterCancelled:ta,onBeforeLeave:ta,onLeave:ta,onAfterLeave:ta,onLeaveCancelled:ta,onBeforeAppear:ta,onAppear:ta,onAfterAppear:ta,onAppearCancelled:ta},Km=e=>{const t=e.subTree;return t.component?Km(t.component):t},ox={name:"BaseTransition",props:Vd,setup(e,{slots:t}){const s=Os(),a=jd();return()=>{const n=t.default&&Br(t.default(),!0),i=n&&n.length?Jm(n):s.subTree?Oh():void 0;if(!i)return;const l=rt(e),{mode:o}=l;if(a.isLeaving)return yc(i);const r=lp(i);if(!r)return yc(i);let c=Bi(r,l,a,s,u=>c=u);r.type!==Vt&&an(r,c);let d=s.subTree&&lp(s.subTree);if(d&&d.type!==Vt&&!fa(d,r)&&Km(s).type!==Vt){let u=Bi(d,l,a,s);if(an(d,u),o==="out-in"&&r.type!==Vt)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},yc(i);o==="in-out"&&r.type!==Vt?u.delayLeave=(p,m,h)=>{const b=Ym(a,d);b[String(d.key)]=d,p[sa]=()=>{m(),p[sa]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{h(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Jm(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Vt){t=s;break}}return t}const Zm=ox;function Ym(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function Bi(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:m,onAfterLeave:h,onLeaveCancelled:b,onBeforeAppear:I,onAppear:k,onAfterAppear:y,onAppearCancelled:g}=t,x=String(e.key),S=Ym(s,e),_=(w,O)=>{w&&Zs(w,a,9,O)},E=(w,O)=>{const U=O[1];_(w,O),Ie(w)?w.every(T=>T.length<=1)&&U():w.length<=1&&U()},R={mode:l,persisted:o,beforeEnter(w){let O=r;if(!s.isMounted)if(i)O=I||r;else return;w[sa]&&w[sa](!0);const U=S[x];U&&fa(e,U)&&U.el[sa]&&U.el[sa](),_(O,[w])},enter(w){if(S[x]===e)return;let O=c,U=d,T=u;if(!s.isMounted)if(i)O=k||c,U=y||d,T=g||u;else return;let $=!1;w[cl]=W=>{$||($=!0,W?_(T,[w]):_(U,[w]),R.delayedLeave&&R.delayedLeave(),w[cl]=void 0)};const Q=w[cl].bind(null,!1);O?E(O,[w,Q]):Q()},leave(w,O){const U=String(e.key);if(w[cl]&&w[cl](!0),s.isUnmounting)return O();_(p,[w]);let T=!1;w[sa]=Q=>{T||(T=!0,O(),Q?_(b,[w]):_(h,[w]),w[sa]=void 0,S[U]===e&&delete S[U])};const $=w[sa].bind(null,!1);S[U]=e,m?E(m,[w,$]):$()},clone(w){const O=Bi(w,t,s,a,n);return n&&n(O),O}};return R}function yc(e){if(lo(e))return e=Oa(e),e.children=null,e}function lp(e){if(!lo(e))return Wm(e.type)&&e.children?Jm(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Ve(s.default))return s.default()}}function an(e,t){e.shapeFlag&6&&e.component?(e.transition=t,an(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Br(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===ls?(l.patchFlag&128&&n++,a=a.concat(Br(l.children,t,o))):(t||l.type!==Vt)&&a.push(o!=null?Oa(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function io(e,t){return Ve(e)?at({name:e.name},t,{setup:e}):e}function rx(){const e=Os();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function qd(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function cx(e){const t=Os(),s=Bd(null);if(t){const n=t.refs===it?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function op(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const sr=new WeakMap;function Ni(e,t,s,a,n=!1){if(Ie(e)){e.forEach((b,I)=>Ni(b,t&&(Ie(t)?t[I]:t),s,a,n));return}if(Qa(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&Ni(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?oo(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===it?o.refs={}:o.refs,u=o.setupState,p=rt(u),m=u===it?Ci:b=>op(d,b)?!1:gt(p,b),h=(b,I)=>!(I&&op(d,I));if(c!=null&&c!==r){if(rp(t),Je(c))d[c]=null,m(c)&&(u[c]=null);else if(Kt(c)){const b=t;h(c,b.k)&&(c.value=null),b.k&&(d[b.k]=null)}}if(Ve(r))Yi(r,o,12,[l,d]);else{const b=Je(r),I=Kt(r);if(b||I){const k=()=>{if(e.f){const y=b?m(r)?u[r]:d[r]:h()||!e.k?r.value:d[e.k];if(n)Ie(y)&&Ld(y,i);else if(Ie(y))y.includes(i)||y.push(i);else if(b)d[r]=[i],m(r)&&(u[r]=d[r]);else{const g=[i];h(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else b?(d[r]=l,m(r)&&(u[r]=l)):I&&(h(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{k(),sr.delete(e)};y.id=-1,sr.set(e,y),Gt(y,s)}else rp(e),k()}}}function rp(e){const t=sr.get(e);t&&(t.flags|=8,sr.delete(e))}let cp=!1;const vi=()=>{cp||(console.error("Hydration completed but contains mismatches."),cp=!0)},dx=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",ux=e=>e.namespaceURI.includes("MathML"),ko=e=>{if(e.nodeType===1){if(dx(e))return"svg";if(ux(e))return"mathml"}},Ti=e=>e.nodeType===8;function px(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,x)=>{if(!x.hasChildNodes()){s(null,g,x),tr(),x._vnode=g;return}u(x.firstChild,g,null,null,null),tr(),x._vnode=g},u=(g,x,S,_,E,R=!1)=>{R=R||!!x.dynamicChildren;const w=Ti(g)&&g.data==="[",O=()=>b(g,x,S,_,E,w),{type:U,ref:T,shapeFlag:$,patchFlag:Q}=x;let W=g.nodeType;x.el=g,Q===-2&&(R=!1,x.dynamicChildren=null);let M=null;switch(U){case wn:W!==3?x.children===""?(r(x.el=n(""),l(g),g),M=g):M=O():(g.data!==x.children&&(vi(),g.data=x.children),M=i(g));break;case Vt:y(g)?(M=i(g),k(x.el=g.content.firstChild,g,S)):W!==8||w?M=O():M=i(g);break;case Gn:if(w&&(g=i(g),W=g.nodeType),W===1||W===3){M=g;const L=!x.children.length;for(let D=0;D<x.staticCount;D++)L&&(x.children+=M.nodeType===1?M.outerHTML:M.data),D===x.staticCount-1&&(x.anchor=M),M=i(M);return w?i(M):M}else O();break;case ls:w?M=h(g,x,S,_,E,R):M=O();break;default:if($&1)(W!==1||x.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?M=O():M=p(g,x,S,_,E,R);else if($&6){x.slotScopeIds=E;const L=l(g);if(w?M=I(g):Ti(g)&&g.data==="teleport start"?M=I(g,g.data,"teleport end"):M=i(g),t(x,L,null,S,_,ko(L),R),Qa(x)&&!x.type.__asyncResolved){let D;w?(D=Lt(ls),D.anchor=M?M.previousSibling:L.lastChild):D=g.nodeType===3?tu(""):Lt("div"),D.el=g,x.component.subTree=D}}else $&64?W!==8?M=O():M=x.type.hydrate(g,x,S,_,E,R,e,m):$&128&&(M=x.type.hydrate(g,x,S,_,ko(l(g)),E,R,e,u))}return T!=null&&Ni(T,null,_,x),M},p=(g,x,S,_,E,R)=>{R=R||!!x.dynamicChildren;const{type:w,props:O,patchFlag:U,shapeFlag:T,dirs:$,transition:Q}=x,W=w==="input"||w==="option";if(W||U!==-1){$&&Ea(x,null,S,"created");let M=!1;if(y(g)){M=wh(null,Q)&&S&&S.vnode.props&&S.vnode.props.appear;const D=g.content.firstChild;if(M){const le=D.getAttribute("class");le&&(D.$cls=le),Q.beforeEnter(D)}k(D,g,S),x.el=g=D}if(T&16&&!(O&&(O.innerHTML||O.textContent))){let D=m(g.firstChild,x,g,S,_,E,R);for(D&&!So(g,1)&&vi();D;){const le=D;D=D.nextSibling,o(le)}}else if(T&8){let D=x.children;D[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(D=D.slice(1));const{textContent:le}=g;le!==D&&le!==D.replace(/\r\n|\r/g,`
`)&&(So(g,0)||vi(),g.textContent=x.children)}if(O){if(W||!R||U&48){const D=g.tagName.includes("-");for(const le in O)(W&&(le.endsWith("value")||le==="indeterminate")||Xn(le)&&!Za(le)||le[0]==="."||D&&!Za(le))&&a(g,le,null,O[le],void 0,S)}else if(O.onClick)a(g,"onClick",null,O.onClick,void 0,S);else if(U&4&&Ya(O.style))for(const D in O.style)O.style[D]}let L;(L=O&&O.onVnodeBeforeMount)&&Fs(L,S,x),$&&Ea(x,null,S,"beforeMount"),((L=O&&O.onVnodeMounted)||$||M)&&Th(()=>{L&&Fs(L,S,x),M&&Q.enter(g),$&&Ea(x,null,S,"mounted")},_)}return g.nextSibling},m=(g,x,S,_,E,R,w)=>{w=w||!!x.dynamicChildren;const O=x.children,U=O.length;let T=!1;for(let $=0;$<U;$++){const Q=w?O[$]:O[$]=Us(O[$]),W=Q.type===wn;g?(W&&!w&&$+1<U&&Us(O[$+1]).type===wn&&(r(n(g.data.slice(Q.children.length)),S,i(g)),g.data=Q.children),g=u(g,Q,_,E,R,w)):W&&!Q.children?r(Q.el=n(""),S):(T||(T=!0,So(S,1)||vi()),s(null,Q,S,null,_,E,ko(S),R))}return g},h=(g,x,S,_,E,R)=>{const{slotScopeIds:w}=x;w&&(E=E?E.concat(w):w);const O=l(g),U=m(i(g),x,O,S,_,E,R);return U&&Ti(U)&&U.data==="]"?i(x.anchor=U):(vi(),r(x.anchor=c("]"),O,U),U)},b=(g,x,S,_,E,R)=>{if(So(g.parentElement,1)||vi(),x.el=null,R){const U=I(g);for(;;){const T=i(g);if(T&&T!==U)o(T);else break}}const w=i(g),O=l(g);return o(g),s(null,x,O,w,S,_,ko(O),E),S&&(S.vnode.el=x.el,Vr(S,x.el)),w},I=(g,x="[",S="]")=>{let _=0;for(;g;)if(g=i(g),g&&Ti(g)&&(g.data===x&&_++,g.data===S)){if(_===0)return i(g);_--}return g},k=(g,x,S)=>{const _=x.parentNode;_&&_.replaceChild(g,x);let E=S;for(;E;)E.vnode.el===x&&(E.vnode.el=E.subTree.el=g),E=E.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const dp="data-allow-mismatch",fx={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function So(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(dp);)e=e.parentElement;const s=e&&e.getAttribute(dp);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(fx[t])}}const mx=Lr().requestIdleCallback||(e=>setTimeout(e,1)),hx=Lr().cancelIdleCallback||(e=>clearTimeout(e)),vx=(e=1e4)=>t=>{const s=mx(t,{timeout:e});return()=>hx(s)};function gx(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const bx=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(gx(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},yx=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},xx=(e=[])=>(t,s)=>{Je(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function _x(e,t){if(Ti(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(Ti(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const Qa=e=>!!e.type.__asyncLoader;function wx(e){Ve(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,m()),m=()=>{let h;return c||(h=c=t().catch(b=>{if(b=b instanceof Error?b:new Error(String(b)),r)return new Promise((I,k)=>{r(b,()=>I(p()),()=>k(b),u+1)});throw b}).then(b=>h!==c&&c?c:(b&&(b.__esModule||b[Symbol.toStringTag]==="Module")&&(b=b.default),d=b,b)))};return io({name:"AsyncComponentWrapper",__asyncLoader:m,__asyncHydrate(h,b,I){let k=!1;(b.bu||(b.bu=[])).push(()=>k=!0);const y=()=>{k||I()},g=i?()=>{const x=i(y,S=>_x(h,S));x&&(b.bum||(b.bum=[])).push(x)}:y;d?g():m().then(()=>!b.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const h=ps;if(qd(h),d)return()=>Co(d,h);const b=S=>{c=null,si(S,h,13,!a)};if(o&&h.suspense||Zn)return m().then(S=>()=>Co(S,h)).catch(S=>(b(S),()=>a?Lt(a,{error:S}):null));const I=f(!1),k=f(),y=f(!!n);let g,x;return wt(()=>{g!=null&&clearTimeout(g),x!=null&&clearTimeout(x)}),n&&(x=setTimeout(()=>{h.isUnmounted||(y.value=!1)},n)),l!=null&&(g=setTimeout(()=>{if(!h.isUnmounted&&!I.value&&!k.value){const S=new Error(`Async component timed out after ${l}ms.`);b(S),k.value=S}},l)),m().then(()=>{h.isUnmounted||(I.value=!0,h.parent&&lo(h.parent.vnode)&&h.parent.update())}).catch(S=>{if(h.isUnmounted){c=null;return}b(S),k.value=S}),()=>{if(I.value&&d)return Co(d,h);if(k.value&&a)return Lt(a,{error:k.value});if(s&&!y.value)return Co(s,h)}}})}function Co(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=Lt(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const lo=e=>e.type.__isKeepAlive,kx={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Os(),a=s.ctx;if(!a.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(y,g,x,S,_)=>{const E=y.component;c(y,g,x,0,o),r(E.vnode,y,g,x,E,o,S,y.slotScopeIds,_),Gt(()=>{E.isDeactivated=!1,E.a&&Oi(E.a);const R=y.props&&y.props.onVnodeMounted;R&&Fs(R,E.parent,y)},o)},a.deactivate=y=>{const g=y.component;nr(g.m),nr(g.a),c(y,p,null,1,o),Gt(()=>{g.da&&Oi(g.da);const x=y.props&&y.props.onVnodeUnmounted;x&&Fs(x,g.parent,y),g.isDeactivated=!0},o)};function m(y){xc(y),d(y,s,o,!0)}function h(y){n.forEach((g,x)=>{const S=id(Qa(g)?g.type.__asyncResolved||{}:g.type);S&&!y(S)&&b(x)})}function b(y){const g=n.get(y);g&&(!l||!fa(g,l))?m(g):l&&xc(l),n.delete(y),i.delete(y)}Jt(()=>[e.include,e.exclude],([y,g])=>{y&&h(x=>xl(y,x)),g&&h(x=>!xl(g,x))},{flush:"post",deep:!0});let I=null;const k=()=>{I!=null&&(ir(s.subTree.type)?Gt(()=>{n.set(I,To(s.subTree))},s.subTree.suspense):n.set(I,To(s.subTree)))};return tt(k),zr(k),Hr(()=>{n.forEach(y=>{const{subTree:g,suspense:x}=s,S=To(g);if(y.type===S.type&&y.key===S.key){xc(S);const _=S.component.da;_&&Gt(_,x);return}m(y)})}),()=>{if(I=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!nn(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let x=To(g);if(x.type===Vt)return l=null,x;const S=x.type,_=id(Qa(x)?x.type.__asyncResolved||{}:S),{include:E,exclude:R,max:w}=e;if(E&&(!_||!xl(E,_))||R&&_&&xl(R,_))return x.shapeFlag&=-257,l=x,g;const O=x.key==null?S:x.key,U=n.get(O);return x.el&&(x=Oa(x),g.shapeFlag&128&&(g.ssContent=x)),I=O,U?(x.el=U.el,x.component=U.component,x.transition&&an(x,x.transition),x.shapeFlag|=512,i.delete(O),i.add(O)):(i.add(O),w&&i.size>parseInt(w,10)&&b(i.values().next().value)),x.shapeFlag|=256,l=x,ir(g.type)?g:x}}},Sx=kx;function xl(e,t){return Ie(e)?e.some(s=>xl(s,t)):Je(e)?e.split(",").includes(t):Mb(e)?(e.lastIndex=0,e.test(t)):!1}function rs(e,t){Qm(e,"a",t)}function Zt(e,t){Qm(e,"da",t)}function Qm(e,t,s=ps){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Ur(t,a,s),s){let n=s.parent;for(;n&&n.parent;)lo(n.parent.vnode)&&Cx(a,t,s,n),n=n.parent}}function Cx(e,t,s,a){const n=Ur(t,e,a,!0);wt(()=>{Ld(a[t],n)},s)}function xc(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function To(e){return e.shapeFlag&128?e.ssContent:e}function Ur(e,t,s=ps,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{tn();const o=Qi(s),r=Zs(t,s,e,l);return o(),sn(),r});return a?n.unshift(i):n.push(i),i}}const ln=e=>(t,s=ps)=>{(!Zn||e==="sp")&&Ur(e,(...a)=>t(...a),s)},Xm=ln("bm"),tt=ln("m"),Gd=ln("bu"),zr=ln("u"),Hr=ln("bum"),wt=ln("um"),eh=ln("sp"),th=ln("rtg"),sh=ln("rtc");function ah(e,t=ps){Ur("ec",e,t)}const Wd="components",Tx="directives";function Ex(e,t){return Kd(Wd,e,!0,t)||e}const nh=Symbol.for("v-ndc");function Ax(e){return Je(e)?Kd(Wd,e,!1)||e:e||nh}function Rx(e){return Kd(Tx,e)}function Kd(e,t,s=!0,a=!1){const n=fs||ps;if(n){const i=n.type;if(e===Wd){const o=id(i,!1);if(o&&(o===t||o===St(t)||o===ti(St(t))))return i}const l=up(n[e]||i[e],t)||up(n.appContext[e],t);return!l&&a?i:l}}function up(e,t){return e&&(e[t]||e[St(t)]||e[ti(St(t))])}function Ix(e,t,s,a){let n;const i=s&&s[a],l=Ie(e);if(l||Je(e)){const o=l&&Ya(e);let r=!1,c=!1;o&&(r=!js(e),c=Ia(e),e=Dr(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?Fi(va(e[d])):va(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(ht(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function Ox(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Ie(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function Lx(e,t,s={},a,n){if(fs.ce||fs.parent&&Qa(fs.parent)&&fs.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Hl(),lr(ls,null,[Lt("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Hl();const l=i&&Jd(i(s)),o=s.key||l&&l.key,r=lr(ls,{key:(o&&!Ss(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Jd(e){return e.some(t=>nn(t)?!(t.type===Vt||t.type===ls&&!Jd(t.children)):!0)?e:null}function Nx(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:Ii(a)]=e[a];return s}const Yc=e=>e?Mh(e)?oo(e):Yc(e.parent):null,El=at(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Yc(e.parent),$root:e=>Yc(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Zd(e),$forceUpdate:e=>e.f||(e.f=()=>{zd(e.update)}),$nextTick:e=>e.n||(e.n=jt.bind(e.proxy)),$watch:e=>sx.bind(e)}),_c=(e,t)=>e!==it&&!e.__isScriptSetup&&gt(e,t),Qc={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(_c(a,t))return l[t]=1,a[t];if(n!==it&&gt(n,t))return l[t]=2,n[t];if(gt(i,t))return l[t]=3,i[t];if(s!==it&&gt(s,t))return l[t]=4,s[t];Xc&&(l[t]=0)}}const c=El[t];let d,u;if(c)return t==="$attrs"&&_s(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==it&&gt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,gt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return _c(n,t)?(n[t]=s,!0):a!==it&&gt(a,t)?(a[t]=s,!0):gt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==it&&o[0]!=="$"&&gt(e,o)||_c(t,o)||gt(i,o)||gt(a,o)||gt(El,o)||gt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:gt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Mx=at({},Qc,{get(e,t){if(t!==Symbol.unscopables)return Qc.get(e,t,e)},has(e,t){return t[0]!=="_"&&!zb(t)}});function Dx(){return null}function Px(){return null}function $x(e){}function Fx(e){}function Bx(){return null}function Ux(){}function zx(e,t){return null}function Hx(){return ih().slots}function jx(){return ih().attrs}function ih(e){const t=Os();return t.setupContext||(t.setupContext=Fh(t))}function Ul(e){return Ie(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Vx(e,t){const s=Ul(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Ie(n)||Ve(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function qx(e,t){return!e||!t?e||t:Ie(e)&&Ie(t)?e.concat(t):at({},Ul(e),Ul(t))}function Gx(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function Wx(e){const t=Os(),s=Zn;let a=e();Vl(),s&&Di(!1);const n=()=>{Qi(t),s&&Di(!0)},i=()=>{Os()!==t&&t.scope.off(),Vl(),s&&Di(!1)};return Nd(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let Xc=!0;function Kx(e){const t=Zd(e),s=e.proxy,a=e.ctx;Xc=!1,t.beforeCreate&&pp(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:m,updated:h,activated:b,deactivated:I,beforeDestroy:k,beforeUnmount:y,destroyed:g,unmounted:x,render:S,renderTracked:_,renderTriggered:E,errorCaptured:R,serverPrefetch:w,expose:O,inheritAttrs:U,components:T,directives:$,filters:Q}=t;if(c&&Jx(c,a,null),l)for(const L in l){const D=l[L];Ve(D)&&(a[L]=D.bind(s))}if(n){const L=n.call(s,s);ht(L)&&(e.data=Cn(L))}if(Xc=!0,i)for(const L in i){const D=i[L],le=Ve(D)?D.bind(s,s):Ve(D.get)?D.get.bind(s,s):ms,oe=!Ve(D)&&Ve(D.set)?D.set.bind(s):ms,z=H({get:le,set:oe});Object.defineProperty(a,L,{enumerable:!0,configurable:!0,get:()=>z.value,set:Z=>z.value=Z})}if(o)for(const L in o)lh(o[L],a,s,L);if(r){const L=Ve(r)?r.call(s):r;Reflect.ownKeys(L).forEach(D=>{Tl(D,L[D])})}d&&pp(d,e,"c");function M(L,D){Ie(D)?D.forEach(le=>L(le.bind(s))):D&&L(D.bind(s))}if(M(Xm,u),M(tt,p),M(Gd,m),M(zr,h),M(rs,b),M(Zt,I),M(ah,R),M(sh,_),M(th,E),M(Hr,y),M(wt,x),M(eh,w),Ie(O))if(O.length){const L=e.exposed||(e.exposed={});O.forEach(D=>{Object.defineProperty(L,D,{get:()=>s[D],set:le=>s[D]=le,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===ms&&(e.render=S),U!=null&&(e.inheritAttrs=U),T&&(e.components=T),$&&(e.directives=$),w&&qd(e)}function Jx(e,t,s=ms){Ie(e)&&(e=ed(e));for(const a in e){const n=e[a];let i;ht(n)?"default"in n?i=la(n.from||a,n.default,!0):i=la(n.from||a):i=la(n),Kt(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function pp(e,t,s){Zs(Ie(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function lh(e,t,s,a){let n=a.includes(".")?qm(s,a):()=>s[a];if(Je(e)){const i=t[e];Ve(i)&&Jt(n,i)}else if(Ve(e))Jt(n,e.bind(s));else if(ht(e))if(Ie(e))e.forEach(i=>lh(i,t,s,a));else{const i=Ve(e.handler)?e.handler.bind(s):t[e.handler];Ve(i)&&Jt(n,i,e)}}function Zd(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>ar(r,c,l,!0)),ar(r,t,l)),ht(t)&&i.set(t,r),r}function ar(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&ar(e,i,s,!0),n&&n.forEach(l=>ar(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=Zx[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Zx={data:fp,props:mp,emits:mp,methods:_l,computed:_l,beforeCreate:Ts,created:Ts,beforeMount:Ts,mounted:Ts,beforeUpdate:Ts,updated:Ts,beforeDestroy:Ts,beforeUnmount:Ts,destroyed:Ts,unmounted:Ts,activated:Ts,deactivated:Ts,errorCaptured:Ts,serverPrefetch:Ts,components:_l,directives:_l,watch:Qx,provide:fp,inject:Yx};function fp(e,t){return t?e?function(){return at(Ve(e)?e.call(this,this):e,Ve(t)?t.call(this,this):t)}:t:e}function Yx(e,t){return _l(ed(e),ed(t))}function ed(e){if(Ie(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Ts(e,t){return e?[...new Set([].concat(e,t))]:t}function _l(e,t){return e?at(Object.create(null),e,t):t}function mp(e,t){return e?Ie(e)&&Ie(t)?[...new Set([...e,...t])]:at(Object.create(null),Ul(e),Ul(t??{})):t}function Qx(e,t){if(!e)return t;if(!t)return e;const s=at(Object.create(null),e);for(const a in t)s[a]=Ts(e[a],t[a]);return s}function oh(){return{app:null,config:{isNativeTag:Ci,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Xx=0;function e0(e,t){return function(a,n=null){Ve(a)||(a=at({},a)),n!=null&&!ht(n)&&(n=null);const i=oh(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:Xx++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Uh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Ve(d.install)?(l.add(d),d.install(c,...u)):Ve(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const m=c._ceVNode||Lt(a,n);return m.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(m,d):e(m,d,p),r=!0,c._container=d,d.__vue_app__=c,oo(m.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Zs(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=qn;qn=c;try{return d()}finally{qn=u}}};return c}}let qn=null;function t0(e,t,s=it){const a=Os(),n=St(t),i=zs(t),l=rh(e,n),o=Mm((r,c)=>{let d,u=it,p;return Vm(()=>{const m=e[n];is(d,m)&&(d=m,c())}),{get(){return r(),s.get?s.get(d):d},set(m){const h=s.set?s.set(m):m;if(!is(h,d)&&!(u!==it&&is(m,u)))return;const b=a.vnode.props,I=!!(b&&(t in b||n in b||i in b)&&(`onUpdate:${t}`in b||`onUpdate:${n}`in b||`onUpdate:${i}`in b));I||(d=m,c()),a.emit(`update:${t}`,h),is(m,u)&&(is(m,h)&&!is(h,p)||I&&u!==it&&!is(h,d))&&c(),u=m,p=h}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||it:o,done:!1}:{done:!0}}}},o}const rh=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${St(t)}Modifiers`]||e[`${zs(t)}Modifiers`];function s0(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||it;let n=s;const i=t.startsWith("update:"),l=i&&rh(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>Je(d)?d.trim():d)),l.number&&(n=s.map(Or)));let o,r=a[o=Ii(t)]||a[o=Ii(St(t))];!r&&i&&(r=a[o=Ii(zs(t))]),r&&Zs(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Zs(c,e,6,n)}}const a0=new WeakMap;function ch(e,t,s=!1){const a=s?a0:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!Ve(e)){const r=c=>{const d=ch(c,t,!0);d&&(o=!0,at(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(ht(e)&&a.set(e,null),null):(Ie(i)?i.forEach(r=>l[r]=null):at(l,i),ht(e)&&a.set(e,l),l)}function jr(e,t){return!e||!Xn(t)?!1:(t=t.slice(2).replace(/Once$/,""),gt(e,t[0].toLowerCase()+t.slice(1))||gt(e,zs(t))||gt(e,t))}function Ho(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:m,ctx:h,inheritAttrs:b}=e,I=Bl(e);let k,y;try{if(s.shapeFlag&4){const x=n||a,S=x;k=Us(c.call(S,x,d,u,m,p,h)),y=o}else{const x=t;k=Us(x.length>1?x(u,{attrs:o,slots:l,emit:r}):x(u,null)),y=t.props?o:i0(o)}}catch(x){Al.length=0,si(x,e,1),k=Lt(Vt)}let g=k;if(y&&b!==!1){const x=Object.keys(y),{shapeFlag:S}=g;x.length&&S&7&&(i&&x.some(Er)&&(y=l0(y,i)),g=Oa(g,y,!1,!0))}return s.dirs&&(g=Oa(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&an(g,s.transition),k=g,Bl(I),k}function n0(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if(nn(n)){if(n.type!==Vt||n.children==="v-if"){if(s)return;s=n}}else return}return s}const i0=e=>{let t;for(const s in e)(s==="class"||s==="style"||Xn(s))&&((t||(t={}))[s]=e[s]);return t},l0=(e,t)=>{const s={};for(const a in e)(!Er(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function o0(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?hp(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(dh(l,a,p)&&!jr(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?hp(a,l,c):!0:!!l;return!1}function hp(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(dh(t,e,i)&&!jr(s,i))return!0}return!1}function dh(e,t,s){const a=e[s],n=t[s];return s==="style"&&ht(a)&&ht(n)?!en(a,n):a!==n}function Vr({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const uh={},ph=()=>Object.create(uh),fh=e=>Object.getPrototypeOf(e)===uh;function r0(e,t,s,a=!1){const n={},i=ph();e.propsDefaults=Object.create(null),mh(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Fd(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function c0(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=rt(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(jr(e.emitsOptions,p))continue;const m=t[p];if(r)if(gt(i,p))m!==i[p]&&(i[p]=m,c=!0);else{const h=St(p);n[h]=td(r,o,h,m,e,!1)}else m!==i[p]&&(i[p]=m,c=!0)}}}else{mh(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!gt(t,u)&&((d=zs(u))===u||!gt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=td(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!gt(t,u))&&(delete i[u],c=!0)}c&&qa(e.attrs,"set","")}function mh(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Za(r))continue;const c=t[r];let d;n&&gt(n,d=St(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:jr(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=rt(s),c=o||it;for(let d=0;d<i.length;d++){const u=i[d];s[u]=td(n,r,u,c[u],e,!gt(c,u))}}return l}function td(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=gt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Ve(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=Qi(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===zs(s))&&(a=!0))}return a}const d0=new WeakMap;function hh(e,t,s=!1){const a=s?d0:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!Ve(e)){const d=u=>{r=!0;const[p,m]=hh(u,t,!0);at(l,p),m&&o.push(...m)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return ht(e)&&a.set(e,Ai),Ai;if(Ie(i))for(let d=0;d<i.length;d++){const u=St(i[d]);vp(u)&&(l[u]=it)}else if(i)for(const d in i){const u=St(d);if(vp(u)){const p=i[d],m=l[u]=Ie(p)||Ve(p)?{type:p}:at({},p),h=m.type;let b=!1,I=!0;if(Ie(h))for(let k=0;k<h.length;++k){const y=h[k],g=Ve(y)&&y.name;if(g==="Boolean"){b=!0;break}else g==="String"&&(I=!1)}else b=Ve(h)&&h.name==="Boolean";m[0]=b,m[1]=I,(b||gt(m,"default"))&&o.push(u)}}const c=[l,o];return ht(e)&&a.set(e,c),c}function vp(e){return e[0]!=="$"&&!Za(e)}const Yd=e=>e==="_"||e==="_ctx"||e==="$stable",Qd=e=>Ie(e)?e.map(Us):[Us(e)],u0=(e,t,s)=>{if(t._n)return t;const a=Hd((...n)=>Qd(t(...n)),s);return a._c=!1,a},vh=(e,t,s)=>{const a=e._ctx;for(const n in e){if(Yd(n))continue;const i=e[n];if(Ve(i))t[n]=u0(n,i,a);else if(i!=null){const l=Qd(i);t[n]=()=>l}}},gh=(e,t)=>{const s=Qd(t);e.slots.default=()=>s},bh=(e,t,s)=>{for(const a in t)(s||!Yd(a))&&(e[a]=t[a])},p0=(e,t,s)=>{const a=e.slots=ph();if(e.vnode.shapeFlag&32){const n=t._;n?(bh(a,t,s),s&&dm(a,"_",n,!0)):vh(t,a)}else t&&gh(e,t)},f0=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=it;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:bh(n,t,s):(i=!t.$stable,vh(t,n)),l=t}else t&&(gh(e,t),l={default:1});if(i)for(const o in n)!Yd(o)&&l[o]==null&&delete n[o]},Gt=Th;function yh(e){return _h(e)}function xh(e){return _h(e,px)}function _h(e,t){const s=Lr();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:m=ms,insertStaticContent:h}=e,b=(A,P,q,fe=null,B=null,J=null,ue=void 0,V=null,ee=!!P.dynamicChildren)=>{if(A===P)return;A&&!fa(A,P)&&(fe=ne(A),Z(A,B,J,!0),A=null),P.patchFlag===-2&&(ee=!1,P.dynamicChildren=null);const{type:te,ref:be,shapeFlag:he}=P;switch(te){case wn:I(A,P,q,fe);break;case Vt:k(A,P,q,fe);break;case Gn:A==null&&y(P,q,fe,ue);break;case ls:T(A,P,q,fe,B,J,ue,V,ee);break;default:he&1?S(A,P,q,fe,B,J,ue,V,ee):he&6?$(A,P,q,fe,B,J,ue,V,ee):(he&64||he&128)&&te.process(A,P,q,fe,B,J,ue,V,ee,me)}be!=null&&B?Ni(be,A&&A.ref,J,P||A,!P):be==null&&A&&A.ref!=null&&Ni(A.ref,null,J,A,!0)},I=(A,P,q,fe)=>{if(A==null)a(P.el=o(P.children),q,fe);else{const B=P.el=A.el;P.children!==A.children&&c(B,P.children)}},k=(A,P,q,fe)=>{A==null?a(P.el=r(P.children||""),q,fe):P.el=A.el},y=(A,P,q,fe)=>{[A.el,A.anchor]=h(A.children,P,q,fe,A.el,A.anchor)},g=({el:A,anchor:P},q,fe)=>{let B;for(;A&&A!==P;)B=p(A),a(A,q,fe),A=B;a(P,q,fe)},x=({el:A,anchor:P})=>{let q;for(;A&&A!==P;)q=p(A),n(A),A=q;n(P)},S=(A,P,q,fe,B,J,ue,V,ee)=>{if(P.type==="svg"?ue="svg":P.type==="math"&&(ue="mathml"),A==null)_(P,q,fe,B,J,ue,V,ee);else{const te=A.el&&A.el._isVueCE?A.el:null;try{te&&te._beginPatch(),w(A,P,B,J,ue,V,ee)}finally{te&&te._endPatch()}}},_=(A,P,q,fe,B,J,ue,V)=>{let ee,te;const{props:be,shapeFlag:he,transition:we,dirs:_e}=A;if(ee=A.el=l(A.type,J,be&&be.is,be),he&8?d(ee,A.children):he&16&&R(A.children,ee,null,fe,B,wc(A,J),ue,V),_e&&Ea(A,null,fe,"created"),E(ee,A,A.scopeId,ue,fe),be){for(const Ke in be)Ke!=="value"&&!Za(Ke)&&i(ee,Ke,null,be[Ke],J,fe);"value"in be&&i(ee,"value",null,be.value,J),(te=be.onVnodeBeforeMount)&&Fs(te,fe,A)}_e&&Ea(A,null,fe,"beforeMount");const ye=wh(B,we);ye&&we.beforeEnter(ee),a(ee,P,q),((te=be&&be.onVnodeMounted)||ye||_e)&&Gt(()=>{try{te&&Fs(te,fe,A),ye&&we.enter(ee),_e&&Ea(A,null,fe,"mounted")}finally{}},B)},E=(A,P,q,fe,B)=>{if(q&&m(A,q),fe)for(let J=0;J<fe.length;J++)m(A,fe[J]);if(B){let J=B.subTree;if(P===J||ir(J.type)&&(J.ssContent===P||J.ssFallback===P)){const ue=B.vnode;E(A,ue,ue.scopeId,ue.slotScopeIds,B.parent)}}},R=(A,P,q,fe,B,J,ue,V,ee=0)=>{for(let te=ee;te<A.length;te++){const be=A[te]=V?ja(A[te]):Us(A[te]);b(null,be,P,q,fe,B,J,ue,V)}},w=(A,P,q,fe,B,J,ue)=>{const V=P.el=A.el;let{patchFlag:ee,dynamicChildren:te,dirs:be}=P;ee|=A.patchFlag&16;const he=A.props||it,we=P.props||it;let _e;if(q&&Dn(q,!1),(_e=we.onVnodeBeforeUpdate)&&Fs(_e,q,P,A),be&&Ea(P,A,q,"beforeUpdate"),q&&Dn(q,!0),(he.innerHTML&&we.innerHTML==null||he.textContent&&we.textContent==null)&&d(V,""),te?O(A.dynamicChildren,te,V,q,fe,wc(P,B),J):ue||D(A,P,V,null,q,fe,wc(P,B),J,!1),ee>0){if(ee&16)U(V,he,we,q,B);else if(ee&2&&he.class!==we.class&&i(V,"class",null,we.class,B),ee&4&&i(V,"style",he.style,we.style,B),ee&8){const ye=P.dynamicProps;for(let Ke=0;Ke<ye.length;Ke++){const je=ye[Ke],Fe=he[je],Ge=we[je];(Ge!==Fe||je==="value")&&i(V,je,Fe,Ge,B,q)}}ee&1&&A.children!==P.children&&d(V,P.children)}else!ue&&te==null&&U(V,he,we,q,B);((_e=we.onVnodeUpdated)||be)&&Gt(()=>{_e&&Fs(_e,q,P,A),be&&Ea(P,A,q,"updated")},fe)},O=(A,P,q,fe,B,J,ue)=>{for(let V=0;V<P.length;V++){const ee=A[V],te=P[V],be=ee.el&&(ee.type===ls||!fa(ee,te)||ee.shapeFlag&198)?u(ee.el):q;b(ee,te,be,null,fe,B,J,ue,!0)}},U=(A,P,q,fe,B)=>{if(P!==q){if(P!==it)for(const J in P)!Za(J)&&!(J in q)&&i(A,J,P[J],null,B,fe);for(const J in q){if(Za(J))continue;const ue=q[J],V=P[J];ue!==V&&J!=="value"&&i(A,J,V,ue,B,fe)}"value"in q&&i(A,"value",P.value,q.value,B)}},T=(A,P,q,fe,B,J,ue,V,ee)=>{const te=P.el=A?A.el:o(""),be=P.anchor=A?A.anchor:o("");let{patchFlag:he,dynamicChildren:we,slotScopeIds:_e}=P;_e&&(V=V?V.concat(_e):_e),A==null?(a(te,q,fe),a(be,q,fe),R(P.children||[],q,be,B,J,ue,V,ee)):he>0&&he&64&&we&&A.dynamicChildren&&A.dynamicChildren.length===we.length?(O(A.dynamicChildren,we,q,B,J,ue,V),(P.key!=null||B&&P===B.subTree)&&Xd(A,P,!0)):D(A,P,q,be,B,J,ue,V,ee)},$=(A,P,q,fe,B,J,ue,V,ee)=>{P.slotScopeIds=V,A==null?P.shapeFlag&512?B.ctx.activate(P,q,fe,ue,ee):Q(P,q,fe,B,J,ue,ee):W(A,P,ee)},Q=(A,P,q,fe,B,J,ue)=>{const V=A.component=Nh(A,fe,B);if(lo(A)&&(V.ctx.renderer=me),Dh(V,!1,ue),V.asyncDep){if(B&&B.registerDep(V,M,ue),!A.el){const ee=V.subTree=Lt(Vt);k(null,ee,P,q),A.placeholder=ee.el}}else M(V,A,P,q,B,J,ue)},W=(A,P,q)=>{const fe=P.component=A.component;if(o0(A,P,q))if(fe.asyncDep&&!fe.asyncResolved){L(fe,P,q);return}else fe.next=P,fe.update();else P.el=A.el,fe.vnode=P},M=(A,P,q,fe,B,J,ue)=>{const V=()=>{if(A.isMounted){let{next:he,bu:we,u:_e,parent:ye,vnode:Ke}=A;{const Ye=kh(A);if(Ye){he&&(he.el=Ke.el,L(A,he,ue)),Ye.asyncDep.then(()=>{Gt(()=>{A.isUnmounted||te()},B)});return}}let je=he,Fe;Dn(A,!1),he?(he.el=Ke.el,L(A,he,ue)):he=Ke,we&&Oi(we),(Fe=he.props&&he.props.onVnodeBeforeUpdate)&&Fs(Fe,ye,he,Ke),Dn(A,!0);const Ge=Ho(A),st=A.subTree;A.subTree=Ge,b(st,Ge,u(st.el),ne(st),A,B,J),he.el=Ge.el,je===null&&Vr(A,Ge.el),_e&&Gt(_e,B),(Fe=he.props&&he.props.onVnodeUpdated)&&Gt(()=>Fs(Fe,ye,he,Ke),B)}else{let he;const{el:we,props:_e}=P,{bm:ye,m:Ke,parent:je,root:Fe,type:Ge}=A,st=Qa(P);if(Dn(A,!1),ye&&Oi(ye),!st&&(he=_e&&_e.onVnodeBeforeMount)&&Fs(he,je,P),Dn(A,!0),we&&Ne){const Ye=()=>{A.subTree=Ho(A),Ne(we,A.subTree,A,B,null)};st&&Ge.__asyncHydrate?Ge.__asyncHydrate(we,A,Ye):Ye()}else{Fe.ce&&Fe.ce._hasShadowRoot()&&Fe.ce._injectChildStyle(Ge,A.parent?A.parent.type:void 0);const Ye=A.subTree=Ho(A);b(null,Ye,q,fe,A,B,J),P.el=Ye.el}if(Ke&&Gt(Ke,B),!st&&(he=_e&&_e.onVnodeMounted)){const Ye=P;Gt(()=>Fs(he,je,Ye),B)}(P.shapeFlag&256||je&&Qa(je.vnode)&&je.vnode.shapeFlag&256)&&A.a&&Gt(A.a,B),A.isMounted=!0,P=q=fe=null}};A.scope.on();const ee=A.effect=new Ml(V);A.scope.off();const te=A.update=ee.run.bind(ee),be=A.job=ee.runIfDirty.bind(ee);be.i=A,be.id=A.uid,ee.scheduler=()=>zd(be),Dn(A,!0),te()},L=(A,P,q)=>{P.component=A;const fe=A.vnode.props;A.vnode=P,A.next=null,c0(A,P.props,fe,q),f0(A,P.children,q),tn(),ap(A),sn()},D=(A,P,q,fe,B,J,ue,V,ee=!1)=>{const te=A&&A.children,be=A?A.shapeFlag:0,he=P.children,{patchFlag:we,shapeFlag:_e}=P;if(we>0){if(we&128){oe(te,he,q,fe,B,J,ue,V,ee);return}else if(we&256){le(te,he,q,fe,B,J,ue,V,ee);return}}_e&8?(be&16&&Me(te,B,J),he!==te&&d(q,he)):be&16?_e&16?oe(te,he,q,fe,B,J,ue,V,ee):Me(te,B,J,!0):(be&8&&d(q,""),_e&16&&R(he,q,fe,B,J,ue,V,ee))},le=(A,P,q,fe,B,J,ue,V,ee)=>{A=A||Ai,P=P||Ai;const te=A.length,be=P.length,he=Math.min(te,be);let we;for(we=0;we<he;we++){const _e=P[we]=ee?ja(P[we]):Us(P[we]);b(A[we],_e,q,null,B,J,ue,V,ee)}te>be?Me(A,B,J,!0,!1,he):R(P,q,fe,B,J,ue,V,ee,he)},oe=(A,P,q,fe,B,J,ue,V,ee)=>{let te=0;const be=P.length;let he=A.length-1,we=be-1;for(;te<=he&&te<=we;){const _e=A[te],ye=P[te]=ee?ja(P[te]):Us(P[te]);if(fa(_e,ye))b(_e,ye,q,null,B,J,ue,V,ee);else break;te++}for(;te<=he&&te<=we;){const _e=A[he],ye=P[we]=ee?ja(P[we]):Us(P[we]);if(fa(_e,ye))b(_e,ye,q,null,B,J,ue,V,ee);else break;he--,we--}if(te>he){if(te<=we){const _e=we+1,ye=_e<be?P[_e].el:fe;for(;te<=we;)b(null,P[te]=ee?ja(P[te]):Us(P[te]),q,ye,B,J,ue,V,ee),te++}}else if(te>we)for(;te<=he;)Z(A[te],B,J,!0),te++;else{const _e=te,ye=te,Ke=new Map;for(te=ye;te<=we;te++){const Ee=P[te]=ee?ja(P[te]):Us(P[te]);Ee.key!=null&&Ke.set(Ee.key,te)}let je,Fe=0;const Ge=we-ye+1;let st=!1,Ye=0;const Y=new Array(Ge);for(te=0;te<Ge;te++)Y[te]=0;for(te=_e;te<=he;te++){const Ee=A[te];if(Fe>=Ge){Z(Ee,B,J,!0);continue}let Le;if(Ee.key!=null)Le=Ke.get(Ee.key);else for(je=ye;je<=we;je++)if(Y[je-ye]===0&&fa(Ee,P[je])){Le=je;break}Le===void 0?Z(Ee,B,J,!0):(Y[Le-ye]=te+1,Le>=Ye?Ye=Le:st=!0,b(Ee,P[Le],q,null,B,J,ue,V,ee),Fe++)}const Te=st?m0(Y):Ai;for(je=Te.length-1,te=Ge-1;te>=0;te--){const Ee=ye+te,Le=P[Ee],se=P[Ee+1],Oe=Ee+1<be?se.el||Sh(se):fe;Y[te]===0?b(null,Le,q,Oe,B,J,ue,V,ee):st&&(je<0||te!==Te[je]?z(Le,q,Oe,2):je--)}}},z=(A,P,q,fe,B=null)=>{const{el:J,type:ue,transition:V,children:ee,shapeFlag:te}=A;if(te&6){z(A.component.subTree,P,q,fe);return}if(te&128){A.suspense.move(P,q,fe);return}if(te&64){ue.move(A,P,q,me);return}if(ue===ls){a(J,P,q);for(let he=0;he<ee.length;he++)z(ee[he],P,q,fe);a(A.anchor,P,q);return}if(ue===Gn){g(A,P,q);return}if(fe!==2&&te&1&&V)if(fe===0)V.persisted&&!J[sa]?a(J,P,q):(V.beforeEnter(J),a(J,P,q),Gt(()=>V.enter(J),B));else{const{leave:he,delayLeave:we,afterLeave:_e}=V,ye=()=>{A.ctx.isUnmounted?n(J):a(J,P,q)},Ke=()=>{const je=J._isLeaving||!!J[sa];J._isLeaving&&J[sa](!0),V.persisted&&!je?ye():he(J,()=>{ye(),_e&&_e()})};we?we(J,ye,Ke):Ke()}else a(J,P,q)},Z=(A,P,q,fe=!1,B=!1)=>{const{type:J,props:ue,ref:V,children:ee,dynamicChildren:te,shapeFlag:be,patchFlag:he,dirs:we,cacheIndex:_e,memo:ye}=A;if(he===-2&&(B=!1),V!=null&&(tn(),Ni(V,null,q,A,!0),sn()),_e!=null&&(P.renderCache[_e]=void 0),be&256){P.ctx.deactivate(A);return}const Ke=be&1&&we,je=!Qa(A);let Fe;if(je&&(Fe=ue&&ue.onVnodeBeforeUnmount)&&Fs(Fe,P,A),be&6)ve(A.component,q,fe);else{if(be&128){A.suspense.unmount(q,fe);return}Ke&&Ea(A,null,P,"beforeUnmount"),be&64?A.type.remove(A,P,q,me,fe):te&&!te.hasOnce&&(J!==ls||he>0&&he&64)?Me(te,P,q,!1,!0):(J===ls&&he&384||!B&&be&16)&&Me(ee,P,q),fe&&re(A)}const Ge=ye!=null&&_e==null;(je&&(Fe=ue&&ue.onVnodeUnmounted)||Ke||Ge)&&Gt(()=>{Fe&&Fs(Fe,P,A),Ke&&Ea(A,null,P,"unmounted"),Ge&&(A.el=null)},q)},re=A=>{const{type:P,el:q,anchor:fe,transition:B}=A;if(P===ls){K(q,fe);return}if(P===Gn){x(A);return}const J=()=>{n(q),B&&!B.persisted&&B.afterLeave&&B.afterLeave()};if(A.shapeFlag&1&&B&&!B.persisted){const{leave:ue,delayLeave:V}=B,ee=()=>ue(q,J);V?V(A.el,J,ee):ee()}else J()},K=(A,P)=>{let q;for(;A!==P;)q=p(A),n(A),A=q;n(P)},ve=(A,P,q)=>{const{bum:fe,scope:B,job:J,subTree:ue,um:V,m:ee,a:te}=A;nr(ee),nr(te),fe&&Oi(fe),B.stop(),J&&(J.flags|=8,Z(ue,A,P,q)),V&&Gt(V,P),Gt(()=>{A.isUnmounted=!0},P)},Me=(A,P,q,fe=!1,B=!1,J=0)=>{for(let ue=J;ue<A.length;ue++)Z(A[ue],P,q,fe,B)},ne=A=>{if(A.shapeFlag&6)return ne(A.component.subTree);if(A.shapeFlag&128)return A.suspense.next();const P=p(A.anchor||A.el),q=P&&P[Gm];return q?p(q):P};let ie=!1;const pe=(A,P,q)=>{let fe;A==null?P._vnode&&(Z(P._vnode,null,null,!0),fe=P._vnode.component):b(P._vnode||null,A,P,null,null,null,q),P._vnode=A,ie||(ie=!0,ap(fe),tr(),ie=!1)},me={p:b,um:Z,m:z,r:re,mt:Q,mc:R,pc:D,pbc:O,n:ne,o:e};let ge,Ne;return t&&([ge,Ne]=t(me)),{render:pe,hydrate:ge,createApp:e0(pe,ge)}}function wc({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Dn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function wh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Xd(e,t,s=!1){const a=e.children,n=t.children;if(Ie(a)&&Ie(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=ja(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Xd(l,o)),o.type===wn&&(o.patchFlag===-1&&(o=n[i]=ja(o)),o.el=l.el),o.type===Vt&&!o.el&&(o.el=l.el)}}function m0(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function kh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:kh(t)}function nr(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Sh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Sh(t.subTree):null}const ir=e=>e.__isSuspense;let sd=0;const h0={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)g0(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}b0(e,t,s,a,n,l,o,r,c)}},hydrate:y0,normalize:x0},v0=h0;function zl(e,t){const s=e.props&&e.props[t];Ve(s)&&s()}function g0(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=Ch(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(zl(e,"onPending"),zl(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),Mi(p,e.ssFallback)):p.resolve(!1,!0)}function b0(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,m=t.ssFallback,{activeBranch:h,pendingBranch:b,isInFallback:I,isHydrating:k}=u;if(b)u.pendingBranch=p,fa(b,p)?(r(b,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():I&&(k||(r(h,m,s,a,n,null,i,l,o),Mi(u,m)))):(u.pendingId=sd++,k?(u.isHydrating=!1,u.activeBranch=b):c(b,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),I?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(h,m,s,a,n,null,i,l,o),Mi(u,m))):h&&fa(h,p)?(r(h,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(h&&fa(h,p))r(h,p,s,a,n,u,i,l,o),Mi(u,p);else if(zl(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=sd++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(m)},y):y===0&&u.fallback(m)}}function Ch(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:m,n:h,o:{parentNode:b,remove:I}}=c;let k;const y=_0(e);y&&t&&t.pendingBranch&&(k=t.pendingId,t.deps++);const g=e.props?Zo(e.props.timeout):void 0,x=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:sd++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,E=!1){const{vnode:R,activeBranch:w,pendingBranch:O,pendingId:U,effects:T,parentComponent:$,container:Q,isInFallback:W}=S;let M=!1;if(S.isHydrating)S.isHydrating=!1;else if(!_){M=w&&O.transition&&O.transition.mode==="out-in";let le=!1;M&&(w.transition.afterLeave=()=>{U===S.pendingId&&(p(O,Q,i===x&&!le?h(w):i,0),$l(T),W&&R.ssFallback&&(R.ssFallback.el=null))}),w&&!S.isFallbackMountPending&&(b(w.el)===Q&&(i=h(w),le=!0),m(w,$,S,!0),!M&&W&&R.ssFallback&&Gt(()=>R.ssFallback.el=null,S)),M||p(O,Q,i,0)}S.isFallbackMountPending=!1,Mi(S,O),S.pendingBranch=null,S.isInFallback=!1;let L=S.parent,D=!1;for(;L;){if(L.pendingBranch){L.effects.push(...T),D=!0;break}L=L.parent}!D&&!M&&$l(T),S.effects=[],y&&t&&t.pendingBranch&&k===t.pendingId&&(t.deps--,t.deps===0&&!E&&t.resolve()),zl(R,"onResolve")},fallback(_){if(!S.pendingBranch)return;const{vnode:E,activeBranch:R,parentComponent:w,container:O,namespace:U}=S;zl(E,"onFallback");const T=h(R),$=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,_,O,T,w,null,U,o,r),Mi(S,_))},Q=_.transition&&_.transition.mode==="out-in";Q&&(S.isFallbackMountPending=!0,R.transition.afterLeave=$),S.isInFallback=!0,m(R,w,null,!0),Q||$()},move(_,E,R){S.activeBranch&&p(S.activeBranch,_,E,R),S.container=_},next(){return S.activeBranch&&h(S.activeBranch)},registerDep(_,E,R){const w=!!S.pendingBranch;w&&S.deps++;const O=_.vnode.el;_.asyncDep.catch(U=>{si(U,_,0)}).then(U=>{if(_.isUnmounted||S.isUnmounted||S.pendingId!==_.suspenseId)return;Vl(),_.asyncResolved=!0;const{vnode:T}=_;ad(_,U,!1),O&&(T.el=O);const $=!O&&_.subTree.el;E(_,T,b(O||_.subTree.el),O?null:h(_.subTree),S,l,R),$&&(T.placeholder=null,I($)),Vr(_,T.el),w&&--S.deps===0&&S.resolve()})},unmount(_,E){S.isUnmounted=!0,S.activeBranch&&m(S.activeBranch,s,_,E),S.pendingBranch&&m(S.pendingBranch,s,_,E)}};return S}function y0(e,t,s,a,n,i,l,o,r){const c=t.suspense=Ch(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function x0(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=gp(a?s.default:s),e.ssFallback=a?gp(s.fallback):Lt(Vt)}function gp(e){let t;if(Ve(e)){const s=Jn&&e._c;s&&(e._d=!1,Hl()),e=e(),s&&(e._d=!0,t=ws,Eh())}return Ie(e)&&(e=n0(e)),e=Us(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Th(e,t){t&&t.pendingBranch?Ie(e)?t.effects.push(...e):t.effects.push(e):$l(e)}function Mi(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,Vr(a,n))}function _0(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const ls=Symbol.for("v-fgt"),wn=Symbol.for("v-txt"),Vt=Symbol.for("v-cmt"),Gn=Symbol.for("v-stc"),Al=[];let ws=null;function Hl(e=!1){Al.push(ws=e?null:[])}function Eh(){Al.pop(),ws=Al[Al.length-1]||null}let Jn=1;function jl(e,t=!1){Jn+=e,e<0&&ws&&t&&(ws.hasOnce=!0)}function Ah(e){return e.dynamicChildren=Jn>0?ws||Ai:null,Eh(),Jn>0&&ws&&ws.push(e),e}function w0(e,t,s,a,n,i){return Ah(eu(e,t,s,a,n,i,!0))}function lr(e,t,s,a,n){return Ah(Lt(e,t,s,a,n,!0))}function nn(e){return e?e.__v_isVNode===!0:!1}function fa(e,t){return e.type===t.type&&e.key===t.key}function k0(e){}const Rh=({key:e})=>e??null,jo=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Je(e)||Kt(e)||Ve(e)?{i:fs,r:e,k:t,f:!!s}:e:null);function eu(e,t=null,s=null,a=0,n=null,i=e===ls?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Rh(t),ref:t&&jo(t),scopeId:Fr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:fs};return o?(su(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Je(s)?8:16),Jn>0&&!l&&ws&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&ws.push(r),r}const Lt=S0;function S0(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===nh)&&(e=Vt),nn(e)){const o=Oa(e,t,!0);return s&&su(o,s),Jn>0&&!i&&ws&&(o.shapeFlag&6?ws[ws.indexOf(e)]=o:ws.push(o)),o.patchFlag=-2,o}if(O0(e)&&(e=e.__vccOpts),t){t=Ih(t);let{class:o,style:r}=t;o&&!Je(o)&&(t.class=so(o)),ht(r)&&(ao(r)&&!Ie(r)&&(r=at({},r)),t.style=to(r))}const l=Je(e)?1:ir(e)?128:Wm(e)?64:ht(e)?4:Ve(e)?2:0;return eu(e,t,s,a,n,l,i,!0)}function Ih(e){return e?ao(e)||fh(e)?at({},e):e:null}function Oa(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?Lh(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Rh(c),ref:t&&t.ref?s&&i?Ie(i)?i.concat(jo(t)):[i,jo(t)]:jo(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==ls?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Oa(e.ssContent),ssFallback:e.ssFallback&&Oa(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&an(d,r.clone(d)),d}function tu(e=" ",t=0){return Lt(wn,null,e,t)}function C0(e,t){const s=Lt(Gn,null,e);return s.staticCount=t,s}function Oh(e="",t=!1){return t?(Hl(),lr(Vt,null,e)):Lt(Vt,null,e)}function Us(e){return e==null||typeof e=="boolean"?Lt(Vt):Ie(e)?Lt(ls,null,e.slice()):nn(e)?ja(e):Lt(wn,null,String(e))}function ja(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Oa(e)}function su(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Ie(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),su(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!fh(t)?t._ctx=fs:n===3&&fs&&(fs.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Ve(t)?(t={default:t,_ctx:fs},s=32):(t=String(t),a&64?(s=16,t=[tu(t)]):s=8);e.children=t,e.shapeFlag|=s}function Lh(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=so([t.class,a.class]));else if(n==="style")t.style=to([t.style,a.style]);else if(Xn(n)){const i=t[n],l=a[n];l&&i!==l&&!(Ie(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!Er(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function Fs(e,t,s,a=null){Zs(e,t,7,[s,a])}const T0=oh();let E0=0;function Nh(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||T0,i={uid:E0++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Md(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:hh(a,n),emitsOptions:ch(a,n),emit:null,emitted:null,propsDefaults:it,inheritAttrs:a.inheritAttrs,ctx:it,data:it,props:it,attrs:it,slots:it,refs:it,setupState:it,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=s0.bind(null,i),e.ce&&e.ce(i),i}let ps=null;const Os=()=>ps||fs;let or,Di;{const e=Lr(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};or=t("__VUE_INSTANCE_SETTERS__",s=>ps=s),Di=t("__VUE_SSR_SETTERS__",s=>Zn=s)}const Qi=e=>{const t=ps;return or(e),e.scope.on(),()=>{e.scope.off(),or(t)}},Vl=()=>{ps&&ps.scope.off(),or(null)};function Mh(e){return e.vnode.shapeFlag&4}let Zn=!1;function Dh(e,t=!1,s=!1){t&&Di(t);const{props:a,children:n}=e.vnode,i=Mh(e);r0(e,a,i,t),p0(e,n,s||t);const l=i?A0(e,t):void 0;return t&&Di(!1),l}function A0(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Qc);const{setup:a}=s;if(a){tn();const n=e.setupContext=a.length>1?Fh(e):null,i=Qi(e),l=Yi(a,e,0,[e.props,n]),o=Nd(l);if(sn(),i(),(o||e.sp)&&!Qa(e)&&qd(e),o){if(l.then(Vl,Vl),t)return l.then(r=>{ad(e,r,t)}).catch(r=>{si(r,e,0)});e.asyncDep=l}else ad(e,l,t)}else $h(e,t)}function ad(e,t,s){Ve(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:ht(t)&&(e.setupState=Ud(t)),$h(e,s)}let rr,nd;function Ph(e){rr=e,nd=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Mx))}}const R0=()=>!rr;function $h(e,t,s){const a=e.type;if(!e.render){if(!t&&rr&&!a.render){const n=a.template||Zd(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=at(at({isCustomElement:i,delimiters:o},l),r);a.render=rr(n,c)}}e.render=a.render||ms,nd&&nd(e)}{const n=Qi(e);tn();try{Kx(e)}finally{sn(),n()}}}const I0={get(e,t){return _s(e,"get",""),e[t]}};function Fh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,I0),slots:e.slots,emit:e.emit,expose:t}}function oo(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Ud(Lm(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in El)return El[s](e)},has(t,s){return s in t||s in El}})):e.proxy}function id(e,t=!0){return Ve(e)?e.displayName||e.name:e.name||t&&e.__name}function O0(e){return Ve(e)&&"__vccOpts"in e}const H=(e,t)=>$y(e,t,Zn);function Ui(e,t,s){try{jl(-1);const a=arguments.length;return a===2?ht(t)&&!Ie(t)?nn(t)?Lt(e,null,[t]):Lt(e,t):Lt(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&nn(s)&&(s=[s]),Lt(e,t,s))}finally{jl(1)}}function L0(){}function N0(e,t,s,a){const n=s[a];if(n&&Bh(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function Bh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(is(s[a],t[a]))return!1;return Jn>0&&ws&&ws.push(e),!0}const Uh="3.5.38",M0=ms,D0=Gy,P0=wi,$0=zm,F0={createComponentInstance:Nh,setupComponent:Dh,renderComponentRoot:Ho,setCurrentRenderingInstance:Bl,isVNode:nn,normalizeVNode:Us,getComponentPublicInstance:oo,ensureValidVNode:Jd,pushWarningContext:Hy,popWarningContext:jy},B0=F0,U0=null,z0=null,H0=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let ld;const bp=typeof window<"u"&&window.trustedTypes;if(bp)try{ld=bp.createPolicy("vue",{createHTML:e=>e})}catch{}const zh=ld?e=>ld.createHTML(e):e=>e,j0="http://www.w3.org/2000/svg",V0="http://www.w3.org/1998/Math/MathML",Ha=typeof document<"u"?document:null,yp=Ha&&Ha.createElement("template"),Hh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?Ha.createElementNS(j0,e):t==="mathml"?Ha.createElementNS(V0,e):s?Ha.createElement(e,{is:s}):Ha.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>Ha.createTextNode(e),createComment:e=>Ha.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>Ha.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{yp.innerHTML=zh(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=yp.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},pn="transition",dl="animation",zi=Symbol("_vtc"),jh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Vh=at({},Vd,jh),q0=e=>(e.displayName="Transition",e.props=Vh,e),G0=q0((e,{slots:t})=>Ui(Zm,qh(e),t)),Pn=(e,t=[])=>{Ie(e)?e.forEach(s=>s(...t)):e&&e(...t)},xp=e=>e?Ie(e)?e.some(t=>t.length>1):e.length>1:!1;function qh(e){const t={};for(const T in e)T in jh||(t[T]=e[T]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:m=`${s}-leave-to`}=e,h=W0(n),b=h&&h[0],I=h&&h[1],{onBeforeEnter:k,onEnter:y,onEnterCancelled:g,onLeave:x,onLeaveCancelled:S,onBeforeAppear:_=k,onAppear:E=y,onAppearCancelled:R=g}=t,w=(T,$,Q,W)=>{T._enterCancelled=W,vn(T,$?d:o),vn(T,$?c:l),Q&&Q()},O=(T,$)=>{T._isLeaving=!1,vn(T,u),vn(T,m),vn(T,p),$&&$()},U=T=>($,Q)=>{const W=T?E:y,M=()=>w($,T,Q);Pn(W,[$,M]),_p(()=>{vn($,T?r:i),ka($,T?d:o),xp(W)||wp($,a,b,M)})};return at(t,{onBeforeEnter(T){Pn(k,[T]),ka(T,i),ka(T,l)},onBeforeAppear(T){Pn(_,[T]),ka(T,r),ka(T,c)},onEnter:U(!1),onAppear:U(!0),onLeave(T,$){T._isLeaving=!0;const Q=()=>O(T,$);ka(T,u),T._enterCancelled?(ka(T,p),od(T)):(od(T),ka(T,p)),_p(()=>{T._isLeaving&&(vn(T,u),ka(T,m),xp(x)||wp(T,a,I,Q))}),Pn(x,[T,Q])},onEnterCancelled(T){w(T,!1,void 0,!0),Pn(g,[T])},onAppearCancelled(T){w(T,!0,void 0,!0),Pn(R,[T])},onLeaveCancelled(T){O(T),Pn(S,[T])}})}function W0(e){if(e==null)return null;if(ht(e))return[kc(e.enter),kc(e.leave)];{const t=kc(e);return[t,t]}}function kc(e){return Zo(e)}function ka(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[zi]||(e[zi]=new Set)).add(t)}function vn(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[zi];s&&(s.delete(t),s.size||(e[zi]=void 0))}function _p(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let K0=0;function wp(e,t,s,a){const n=e._endId=++K0,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Gh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=m=>{m.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Gh(e,t){const s=window.getComputedStyle(e),a=h=>(s[h]||"").split(", "),n=a(`${pn}Delay`),i=a(`${pn}Duration`),l=kp(n,i),o=a(`${dl}Delay`),r=a(`${dl}Duration`),c=kp(o,r);let d=null,u=0,p=0;t===pn?l>0&&(d=pn,u=l,p=i.length):t===dl?c>0&&(d=dl,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?pn:dl:null,p=d?d===pn?i.length:r.length:0);const m=d===pn&&/\b(?:transform|all)(?:,|$)/.test(a(`${pn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:m}}function kp(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>Sp(s)+Sp(e[a])))}function Sp(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function od(e){return(e?e.ownerDocument:document).body.offsetHeight}function J0(e,t,s){const a=e[zi];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const cr=Symbol("_vod"),au=Symbol("_vsh"),Wh={name:"show",beforeMount(e,{value:t},{transition:s}){e[cr]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):ul(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),ul(e,!0),a.enter(e)):a.leave(e,()=>{ul(e,!1)}):ul(e,t))},beforeUnmount(e,{value:t}){ul(e,t)}};function ul(e,t){e.style.display=t?e[cr]:"none",e[au]=!t}function Z0(){Wh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Kh=Symbol("");function Y0(e){const t=Os();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>dr(i,n))},a=()=>{const n=e(t.proxy);t.ce?dr(t.ce,n):rd(t.subTree,n),s(n)};Gd(()=>{$l(a)}),tt(()=>{Jt(a,ms,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),wt(()=>n.disconnect())})}function rd(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{rd(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)dr(e.el,t);else if(e.type===ls)e.children.forEach(s=>rd(s,t));else if(e.type===Gn){let{el:s,anchor:a}=e;for(;s&&(dr(s,t),s!==a);)s=s.nextSibling}}function dr(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=ay(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Kh]=a}}const Q0=/(?:^|;)\s*display\s*:/;function X0(e,t,s){const a=e.style,n=Je(s);let i=!1;if(s&&!n){if(t)if(Je(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&wl(a,o,"")}else for(const l in t)s[l]==null&&wl(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?t_(e,l,!Je(t)&&t?t[l]:void 0,o)||wl(a,l,o):wl(a,l,"")}}else if(n){if(t!==s){const l=a[Kh];l&&(s+=";"+l),a.cssText=s,i=Q0.test(s)}}else t&&e.removeAttribute("style");cr in e&&(e[cr]=i?a.display:"",e[au]&&(a.display="none"))}const Cp=/\s*!important$/;function wl(e,t,s){if(Ie(s))s.forEach(a=>wl(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=e_(e,t);Cp.test(s)?e.setProperty(zs(a),s.replace(Cp,""),"important"):e[a]=s}}const Tp=["Webkit","Moz","ms"],Sc={};function e_(e,t){const s=Sc[t];if(s)return s;let a=St(t);if(a!=="filter"&&a in e)return Sc[t]=a;a=ti(a);for(let n=0;n<Tp.length;n++){const i=Tp[n]+a;if(i in e)return Sc[t]=i}return t}function t_(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Je(a)&&s===a}const Ep="http://www.w3.org/1999/xlink";function Ap(e,t,s,a,n,i=ty(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Ep,t.slice(6,t.length)):e.setAttributeNS(Ep,t,s):s==null||i&&!pm(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Ss(s)?String(s):s)}function Rp(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?zh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=pm(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Wa(e,t,s,a){e.addEventListener(t,s,a)}function s_(e,t,s,a){e.removeEventListener(t,s,a)}const Ip=Symbol("_vei");function a_(e,t,s,a,n=null){const i=e[Ip]||(e[Ip]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=n_(t);if(a){const c=i[t]=o_(a,n);Wa(e,o,c,r)}else l&&(s_(e,o,l,r),i[t]=void 0)}}const Op=/(?:Once|Passive|Capture)$/;function n_(e){let t;if(Op.test(e)){t={};let a;for(;a=e.match(Op);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):zs(e.slice(2)),t]}let Cc=0;const i_=Promise.resolve(),l_=()=>Cc||(i_.then(()=>Cc=0),Cc=Date.now());function o_(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Ie(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&Zs(c,t,5,o)}}else Zs(n,t,5,[a])};return s.value=e,s.attached=l_(),s}const Lp=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Jh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?J0(e,a,l):t==="style"?X0(e,s,a):Xn(t)?Er(t)||a_(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):r_(e,t,a,l))?(Rp(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Ap(e,t,a,l,i,t!=="value")):e._isVueCE&&(c_(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Je(a)))?Rp(e,St(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),Ap(e,t,a,l))};function r_(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&Lp(t)&&Ve(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return Lp(t)&&Je(s)?!1:t in e}function c_(e,t){const s=e._def.props;if(!s)return!1;const a=St(t);return Array.isArray(s)?s.some(n=>St(n)===a):Object.keys(s).some(n=>St(n)===a)}const Np={};function Zh(e,t,s){let a=io(e,t);Ar(a)&&(a=at({},a,t));class n extends qr{constructor(l){super(a,l,s)}}return n.def=a,n}const d_=((e,t)=>Zh(e,t,cv)),u_=typeof HTMLElement<"u"?HTMLElement:class{};class qr extends u_{constructor(t,s={},a=fr){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==fr?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(at({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof qr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,jt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Ie(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Zo(this._props[r])),(o||(o=Object.create(null)))[St(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)gt(this,a)||Object.defineProperty(this,a,{get:()=>Ra(s[a])})}_resolveProps(t){const{props:s}=t,a=Ie(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(St))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):Np;const n=St(t);s&&this._numberProps&&this._numberProps[n]&&(a=Zo(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Np?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(zs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(zs(t),s+""):s||this.removeAttribute(zs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),rv(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=Lt(this._def,at(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Ar(l[0])?at({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),zs(i)!==i&&n(zs(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Yh(e){const t=Os(),s=t&&t.ce;return s||null}function p_(){const e=Yh();return e&&e.shadowRoot}function f_(e="$style"){{const t=Os();if(!t)return it;const s=t.type.__cssModules;if(!s)return it;const a=s[e];return a||it}}const Qh=new WeakMap,Xh=new WeakMap,ur=Symbol("_moveCb"),Mp=Symbol("_enterCb"),m_=e=>(delete e.props.mode,e),h_=m_({name:"TransitionGroup",props:at({},Vh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Os(),a=jd();let n,i;return zr(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!x_(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(g_),n.forEach(b_);const o=n.filter(y_);od(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;ka(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[ur]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[ur]=null,vn(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=rt(e),o=qh(l);let r=l.tag||ls;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[au]&&(n.push(d),an(d,Bi(d,o,a,s)),Qh.set(d,ev(d.el)))}i=t.default?Br(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&an(d,Bi(d,o,a,s))}return Lt(r,null,i)}}}),v_=h_;function g_(e){const t=e.el;t[ur]&&t[ur](),t[Mp]&&t[Mp]()}function b_(e){Xh.set(e,ev(e.el))}function y_(e){const t=Qh.get(e),s=Xh.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function ev(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function x_(e,t,s){const a=e.cloneNode(),n=e[zi];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Gh(a);return i.removeChild(a),l}const Sn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ie(t)?s=>Oi(t,s):t};function __(e){e.target.composing=!0}function Dp(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const oa=Symbol("_assign");function Pp(e,t,s){return t&&(e=e.trim()),s&&(e=Or(e)),e}const pr={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[oa]=Sn(n);const i=a||n.props&&n.props.type==="number";Wa(e,t?"change":"input",l=>{l.target.composing||e[oa](Pp(e.value,s,i))}),(s||i)&&Wa(e,"change",()=>{e.value=Pp(e.value,s,i)}),t||(Wa(e,"compositionstart",__),Wa(e,"compositionend",Dp),Wa(e,"change",Dp))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[oa]=Sn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Or(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},nu={deep:!0,created(e,t,s){e[oa]=Sn(s),Wa(e,"change",()=>{const a=e._modelValue,n=Hi(e),i=e.checked,l=e[oa];if(Ie(a)){const o=Nr(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(ei(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(sv(e,i))})},mounted:$p,beforeUpdate(e,t,s){e[oa]=Sn(s),$p(e,t,s)}};function $p(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Ie(t))n=Nr(t,a.props.value)>-1;else if(ei(t))n=t.has(a.props.value);else{if(t===s)return;n=en(t,sv(e,!0))}e.checked!==n&&(e.checked=n)}const iu={created(e,{value:t},s){e.checked=en(t,s.props.value),e[oa]=Sn(s),Wa(e,"change",()=>{e[oa](Hi(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[oa]=Sn(a),t!==s&&(e.checked=en(t,a.props.value))}},tv={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=ei(t);Wa(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Or(Hi(l)):Hi(l));e[oa](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,jt(()=>{e._assigning=!1})}),e[oa]=Sn(a)},mounted(e,{value:t}){Fp(e,t)},beforeUpdate(e,t,s){e[oa]=Sn(s)},updated(e,{value:t}){e._assigning||Fp(e,t)}};function Fp(e,t){const s=e.multiple,a=Ie(t);if(!(s&&!a&&!ei(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=Hi(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Nr(t,o)>-1}else l.selected=t.has(o);else if(en(Hi(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Hi(e){return"_value"in e?e._value:e.value}function sv(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const av={created(e,t,s){Eo(e,t,s,null,"created")},mounted(e,t,s){Eo(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){Eo(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){Eo(e,t,s,a,"updated")}};function nv(e,t){switch(e){case"SELECT":return tv;case"TEXTAREA":return pr;default:switch(t){case"checkbox":return nu;case"radio":return iu;default:return pr}}}function Eo(e,t,s,a,n){const l=nv(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function w_(){pr.getSSRProps=({value:e})=>({value:e}),iu.getSSRProps=({value:e},t)=>{if(t.props&&en(t.props.value,e))return{checked:!0}},nu.getSSRProps=({value:e},t)=>{if(Ie(e)){if(t.props&&Nr(e,t.props.value)>-1)return{checked:!0}}else if(ei(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},av.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=nv(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const k_=["ctrl","shift","alt","meta"],S_={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>k_.some(s=>e[`${s}Key`]&&!t.includes(s))},C_=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=S_[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},T_={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},E_=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=zs(n.key);if(t.some(l=>l===i||T_[l]===i))return e(n)}))},iv=at({patchProp:Jh},Hh);let Rl,Bp=!1;function lv(){return Rl||(Rl=yh(iv))}function ov(){return Rl=Bp?Rl:xh(iv),Bp=!0,Rl}const rv=((...e)=>{lv().render(...e)}),A_=((...e)=>{ov().hydrate(...e)}),fr=((...e)=>{const t=lv().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=uv(a);if(!n)return;const i=t._component;!Ve(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,dv(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),cv=((...e)=>{const t=ov().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=uv(a);if(n)return s(n,!0,dv(n))},t});function dv(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function uv(e){return Je(e)?document.querySelector(e):e}let Up=!1;const R_=()=>{Up||(Up=!0,w_(),Z0())},I_=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Zm,BaseTransitionPropsValidators:Vd,Comment:Vt,DeprecationTypes:H0,EffectScope:Md,ErrorCodes:qy,ErrorTypeStrings:D0,Fragment:ls,KeepAlive:Sx,ReactiveEffect:Ml,Static:Gn,Suspense:v0,Teleport:lx,Text:wn,TrackOpTypes:Fy,Transition:G0,TransitionGroup:v_,TriggerOpTypes:By,VueElement:qr,assertNumber:Vy,callWithAsyncErrorHandling:Zs,callWithErrorHandling:Yi,camelize:St,capitalize:ti,cloneVNode:Oa,compatUtils:z0,computed:H,createApp:fr,createBlock:lr,createCommentVNode:Oh,createElementBlock:w0,createElementVNode:eu,createHydrationRenderer:xh,createPropsRestProxy:Gx,createRenderer:yh,createSSRApp:cv,createSlots:Ox,createStaticVNode:C0,createTextVNode:tu,createVNode:Lt,customRef:Mm,defineAsyncComponent:wx,defineComponent:io,defineCustomElement:Zh,defineEmits:Px,defineExpose:$x,defineModel:Ux,defineOptions:Fx,defineProps:Dx,defineSSRCustomElement:d_,defineSlots:Bx,devtools:P0,effect:oy,effectScope:ny,getCurrentInstance:Os,getCurrentScope:vm,getCurrentWatcher:Uy,getTransitionRawChildren:Br,guardReactiveProps:Ih,h:Ui,handleError:si,hasInjectionContext:Xy,hydrate:A_,hydrateOnIdle:vx,hydrateOnInteraction:xx,hydrateOnMediaQuery:yx,hydrateOnVisible:bx,initCustomFormatter:L0,initDirectivesForSSR:R_,inject:la,isMemoSame:Bh,isProxy:ao,isReactive:Ya,isReadonly:Ia,isRef:Kt,isRuntimeOnly:R0,isShallow:js,isVNode:nn,markRaw:Lm,mergeDefaults:Vx,mergeModels:qx,mergeProps:Lh,nextTick:jt,nodeOps:Hh,normalizeClass:so,normalizeProps:qb,normalizeStyle:to,onActivated:rs,onBeforeMount:Xm,onBeforeUnmount:Hr,onBeforeUpdate:Gd,onDeactivated:Zt,onErrorCaptured:ah,onMounted:tt,onRenderTracked:sh,onRenderTriggered:th,onScopeDispose:iy,onServerPrefetch:eh,onUnmounted:wt,onUpdated:zr,onWatcherCleanup:Pm,openBlock:Hl,patchProp:Jh,popScopeId:Zy,provide:Tl,proxyRefs:Ud,pushScopeId:Jy,queuePostFlushCb:$l,reactive:Cn,readonly:Qo,ref:f,registerRuntimeCompiler:Ph,render:rv,renderList:Ix,renderSlot:Lx,resolveComponent:Ex,resolveDirective:Rx,resolveDynamicComponent:Ax,resolveFilter:U0,resolveTransitionHooks:Bi,setBlockTracking:jl,setDevtoolsHook:$0,setTransitionHooks:an,shallowReactive:Fd,shallowReadonly:Ty,shallowRef:Bd,ssrContextKey:Hm,ssrUtils:B0,stop:ry,toDisplayString:mm,toHandlerKey:Ii,toHandlers:Nx,toRaw:rt,toRef:Dy,toRefs:Ly,toValue:Ry,transformVNodeArgs:k0,triggerRef:Ay,unref:Ra,useAttrs:jx,useCssModule:f_,useCssVars:Y0,useHost:Yh,useId:rx,useModel:t0,useSSRContext:jm,useShadowRoot:p_,useSlots:Hx,useTemplateRef:cx,useTransitionState:jd,vModelCheckbox:nu,vModelDynamic:av,vModelRadio:iu,vModelSelect:tv,vModelText:pr,vShow:Wh,version:Uh,warn:M0,watch:Jt,watchEffect:ex,watchPostEffect:tx,watchSyncEffect:Vm,withAsyncContext:Wx,withCtx:Hd,withDefaults:zx,withDirectives:Qy,withKeys:E_,withMemo:N0,withModifiers:C_,withScopeId:Yy},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ql=Symbol(""),Il=Symbol(""),lu=Symbol(""),mr=Symbol(""),pv=Symbol(""),Yn=Symbol(""),fv=Symbol(""),mv=Symbol(""),ou=Symbol(""),ru=Symbol(""),ro=Symbol(""),cu=Symbol(""),hv=Symbol(""),du=Symbol(""),uu=Symbol(""),pu=Symbol(""),fu=Symbol(""),mu=Symbol(""),hu=Symbol(""),vv=Symbol(""),gv=Symbol(""),Gr=Symbol(""),hr=Symbol(""),vu=Symbol(""),gu=Symbol(""),Gl=Symbol(""),co=Symbol(""),bu=Symbol(""),cd=Symbol(""),O_=Symbol(""),dd=Symbol(""),vr=Symbol(""),L_=Symbol(""),N_=Symbol(""),yu=Symbol(""),M_=Symbol(""),D_=Symbol(""),xu=Symbol(""),bv=Symbol(""),ji={[ql]:"Fragment",[Il]:"Teleport",[lu]:"Suspense",[mr]:"KeepAlive",[pv]:"BaseTransition",[Yn]:"openBlock",[fv]:"createBlock",[mv]:"createElementBlock",[ou]:"createVNode",[ru]:"createElementVNode",[ro]:"createCommentVNode",[cu]:"createTextVNode",[hv]:"createStaticVNode",[du]:"resolveComponent",[uu]:"resolveDynamicComponent",[pu]:"resolveDirective",[fu]:"resolveFilter",[mu]:"withDirectives",[hu]:"renderList",[vv]:"renderSlot",[gv]:"createSlots",[Gr]:"toDisplayString",[hr]:"mergeProps",[vu]:"normalizeClass",[gu]:"normalizeStyle",[Gl]:"normalizeProps",[co]:"guardReactiveProps",[bu]:"toHandlers",[cd]:"camelize",[O_]:"capitalize",[dd]:"toHandlerKey",[vr]:"setBlockTracking",[L_]:"pushScopeId",[N_]:"popScopeId",[yu]:"withCtx",[M_]:"unref",[D_]:"isRef",[xu]:"withMemo",[bv]:"isMemoSame"};function P_(e){Object.getOwnPropertySymbols(e).forEach(t=>{ji[t]=e[t]})}const Qs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function $_(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Qs}}function Wl(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Qs){return e&&(o?(e.helper(Yn),e.helper(Gi(e.inSSR,c))):e.helper(qi(e.inSSR,c)),l&&e.helper(mu)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function Wn(e,t=Qs){return{type:17,loc:t,elements:e}}function ia(e,t=Qs){return{type:15,loc:t,properties:e}}function Wt(e,t){return{type:16,loc:Qs,key:Je(e)?Xe(e,!0):e,value:t}}function Xe(e,t=!1,s=Qs,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function ha(e,t=Qs){return{type:8,loc:t,children:e}}function ss(e,t=[],s=Qs){return{type:14,loc:s,callee:e,arguments:t}}function Vi(e,t=void 0,s=!1,a=!1,n=Qs){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function ud(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Qs}}function F_(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Qs}}function B_(e){return{type:21,body:e,loc:Qs}}function qi(e,t){return e||t?ou:ru}function Gi(e,t){return e||t?fv:mv}function _u(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(qi(a,e.isComponent)),t(Yn),t(Gi(a,e.isComponent)))}const zp=new Uint8Array([123,123]),Hp=new Uint8Array([125,125]);function jp(e){return e>=97&&e<=122||e>=65&&e<=90}function Ks(e){return e===32||e===10||e===9||e===12||e===13}function fn(e){return e===47||e===62||Ks(e)}function gr(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const bs={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class U_{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=zp,this.delimiterClose=Hp,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=zp,this.delimiterClose=Hp}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?fn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Ks(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===bs.TitleEnd||this.currentSequence===bs.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===bs.Cdata[this.sequenceIndex]?++this.sequenceIndex===bs.Cdata.length&&(this.state=28,this.currentSequence=bs.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===bs.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):jp(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){fn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(fn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(gr("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Ks(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=jp(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Ks(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Ks(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Ks(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||fn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||fn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||fn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||fn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||fn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Ks(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Ks(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Ks(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=bs.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===bs.ScriptEnd[3]?this.startSpecial(bs.ScriptEnd,4):t===bs.StyleEnd[3]?this.startSpecial(bs.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===bs.TitleEnd[3]?this.startSpecial(bs.TitleEnd,4):t===bs.TextareaEnd[3]?this.startSpecial(bs.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===bs.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Vp(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Kn(e,t){const s=Vp("MODE",t),a=Vp(e,t);return s===3?a===!0:a!==!1}function Kl(e,t,s,...a){return Kn(e,t)}function wu(e){throw e}function yv(e){}function Ot(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const Hs=e=>e.type===4&&e.isStatic;function xv(e){switch(e){case"Teleport":case"teleport":return Il;case"Suspense":case"suspense":return lu;case"KeepAlive":case"keep-alive":return mr;case"BaseTransition":case"base-transition":return pv}}const z_=/^$|^\d|[^\$\w\xA0-\uFFFF]/,ku=e=>!z_.test(e),_v=/[A-Za-z_$\xA0-\uFFFF]/,H_=/[\.\?\w$\xA0-\uFFFF]/,j_=/\s+[.[]\s*|\s*[.[]\s+/g,wv=e=>e.type===4?e.content:e.loc.source,V_=e=>{const t=wv(e).trim().replace(j_,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?_v:H_).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},kv=V_,q_=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,G_=e=>q_.test(wv(e)),W_=G_;function na(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(Je(t)?n.name===t:t.test(n.name)))return n}}function Wr(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&zn(i.arg,t))return i}}function zn(e,t){return!!(e&&Hs(e)&&e.content===t)}function K_(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Tc(e){return e.type===5||e.type===2}function qp(e){return e.type===7&&e.name==="pre"}function J_(e){return e.type===7&&e.name==="slot"}function br(e){return e.type===1&&e.tagType===3}function yr(e){return e.type===1&&e.tagType===2}const Z_=new Set([Gl,co]);function Sv(e,t=[]){if(e&&!Je(e)&&e.type===14){const s=e.callee;if(!Je(s)&&Z_.has(s))return Sv(e.arguments[0],t.concat(e))}return[e,t]}function xr(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!Je(n)&&n.type===14){const o=Sv(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||Je(n))a=ia([t]);else if(n.type===14){const o=n.arguments[0];!Je(o)&&o.type===15?Gp(t,o)||o.properties.unshift(t):n.callee===bu?a=ss(s.helper(hr),[ia([t]),n]):n.arguments.unshift(ia([t])),!a&&(a=n)}else n.type===15?(Gp(t,n)||n.properties.unshift(t),a=n):(a=ss(s.helper(hr),[ia([t]),n]),l&&l.callee===co&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function Gp(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function Jl(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function Y_(e){return e.type===14&&e.callee===xu?e.arguments[1].returns:e}const Q_=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Cv(e){for(let t=0;t<e.length;t++)if(!Ks(e.charCodeAt(t)))return!1;return!0}function Su(e){return e.type===2&&Cv(e.content)||e.type===12&&Su(e.content)}function Tv(e){return e.type===3||Su(e)}const Ev={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Ci,isPreTag:Ci,isIgnoreNewlineTag:Ci,isCustomElement:Ci,onError:wu,onWarn:yv,comments:!1,prefixIdentifiers:!1};let mt=Ev,Zl=null,Xa="",xs=null,lt=null,$s="",za=-1,Fn=-1,Cu=0,yn=!1,pd=null;const It=[],Ft=new U_(It,{onerr:Fa,ontext(e,t){Ao(us(e,t),e,t)},ontextentity(e,t,s){Ao(e,t,s)},oninterpolation(e,t){if(yn)return Ao(us(e,t),e,t);let s=e+Ft.delimiterOpen.length,a=t-Ft.delimiterClose.length;for(;Ks(Xa.charCodeAt(s));)s++;for(;Ks(Xa.charCodeAt(a-1));)a--;let n=us(s,a);n.includes("&")&&(n=mt.decodeEntities(n,!1)),fd({type:5,content:qo(n,!1,Ht(s,a)),loc:Ht(e,t)})},onopentagname(e,t){const s=us(e,t);xs={type:1,tag:s,ns:mt.getNamespace(s,It[0],mt.ns),tagType:0,props:[],children:[],loc:Ht(e-1,t),codegenNode:void 0}},onopentagend(e){Kp(e)},onclosetag(e,t){const s=us(e,t);if(!mt.isVoidTag(s)){let a=!1;for(let n=0;n<It.length;n++)if(It[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&Fa(24,It[0].loc.start.offset);for(let l=0;l<=n;l++){const o=It.shift();Vo(o,t,l<n)}break}a||Fa(23,Av(e,60))}},onselfclosingtag(e){const t=xs.tag;xs.isSelfClosing=!0,Kp(e),It[0]&&It[0].tag===t&&Vo(It.shift(),e)},onattribname(e,t){lt={type:6,name:us(e,t),nameLoc:Ht(e,t),value:void 0,loc:Ht(e)}},ondirname(e,t){const s=us(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!yn&&a===""&&Fa(26,e),yn||a==="")lt={type:6,name:s,nameLoc:Ht(e,t),value:void 0,loc:Ht(e)};else if(lt={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Xe("prop")]:[],loc:Ht(e)},a==="pre"){yn=Ft.inVPre=!0,pd=xs;const n=xs.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=rw(n[i]))}},ondirarg(e,t){if(e===t)return;const s=us(e,t);if(yn&&!qp(lt))lt.name+=s,Hn(lt.nameLoc,t);else{const a=s[0]!=="[";lt.arg=qo(a?s:s.slice(1,-1),a,Ht(e,t),a?3:0)}},ondirmodifier(e,t){const s=us(e,t);if(yn&&!qp(lt))lt.name+="."+s,Hn(lt.nameLoc,t);else if(lt.name==="slot"){const a=lt.arg;a&&(a.content+="."+s,Hn(a.loc,t))}else{const a=Xe(s,!0,Ht(e,t));lt.modifiers.push(a)}},onattribdata(e,t){$s+=us(e,t),za<0&&(za=e),Fn=t},onattribentity(e,t,s){$s+=e,za<0&&(za=t),Fn=s},onattribnameend(e){const t=lt.loc.start.offset,s=us(t,e);lt.type===7&&(lt.rawName=s),xs.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&Fa(2,t)},onattribend(e,t){if(xs&&lt){if(Hn(lt.loc,t),e!==0)if($s.includes("&")&&($s=mt.decodeEntities($s,!0)),lt.type===6)lt.name==="class"&&($s=Iv($s).trim()),e===1&&!$s&&Fa(13,t),lt.value={type:2,content:$s,loc:e===1?Ht(za,Fn):Ht(za-1,Fn+1)},Ft.inSFCRoot&&xs.tag==="template"&&lt.name==="lang"&&$s&&$s!=="html"&&Ft.enterRCDATA(gr("</template"),0);else{let s=0;lt.exp=qo($s,!1,Ht(za,Fn),0,s),lt.name==="for"&&(lt.forParseResult=ew(lt.exp));let a=-1;lt.name==="bind"&&(a=lt.modifiers.findIndex(n=>n.content==="sync"))>-1&&Kl("COMPILER_V_BIND_SYNC",mt,lt.loc,lt.arg.loc.source)&&(lt.name="model",lt.modifiers.splice(a,1))}(lt.type!==7||lt.name!=="pre")&&xs.props.push(lt)}$s="",za=Fn=-1},oncomment(e,t){mt.comments&&fd({type:3,content:us(e,t),loc:Ht(e-4,t+3)})},onend(){const e=Xa.length;for(let t=0;t<It.length;t++)Vo(It[t],e-1),Fa(24,It[t].loc.start.offset)},oncdata(e,t){(It[0]?It[0].ns:mt.ns)!==0?Ao(us(e,t),e,t):Fa(1,e-9)},onprocessinginstruction(e){(It[0]?It[0].ns:mt.ns)===0&&Fa(21,e-1)}}),Wp=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,X_=/^\(|\)$/g;function ew(e){const t=e.loc,s=e.content,a=s.match(Q_);if(!a)return;const[,n,i]=a,l=(u,p,m=!1)=>{const h=t.start.offset+p,b=h+u.length;return qo(u,!1,Ht(h,b),0,m?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(X_,"").trim();const c=n.indexOf(r),d=r.match(Wp);if(d){r=r.replace(Wp,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const m=d[2].trim();m&&(o.index=l(m,s.indexOf(m,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function us(e,t){return Xa.slice(e,t)}function Kp(e){Ft.inSFCRoot&&(xs.innerLoc=Ht(e+1,e+1)),fd(xs);const{tag:t,ns:s}=xs;s===0&&mt.isPreTag(t)&&Cu++,mt.isVoidTag(t)?Vo(xs,e):(It.unshift(xs),(s===1||s===2)&&(Ft.inXML=!0)),xs=null}function Ao(e,t,s){{const i=It[0]&&It[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=mt.decodeEntities(e,!1))}const a=It[0]||Zl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,Hn(n.loc,s)):a.children.push({type:2,content:e,loc:Ht(t,s)})}function Vo(e,t,s=!1){s?Hn(e.loc,Av(t,60)):Hn(e.loc,tw(t,62)+1),Ft.inSFCRoot&&(e.children.length?e.innerLoc.end=at({},e.children[e.children.length-1].loc.end):e.innerLoc.end=at({},e.innerLoc.start),e.innerLoc.source=us(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(yn||(a==="slot"?e.tagType=2:Jp(e)?e.tagType=3:aw(e)&&(e.tagType=1)),Ft.inRCDATA||(e.children=Rv(i)),n===0&&mt.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&mt.isPreTag(a)&&Cu--,pd===e&&(yn=Ft.inVPre=!1,pd=null),Ft.inXML&&(It[0]?It[0].ns:mt.ns)===0&&(Ft.inXML=!1);{const l=e.props;if(!Ft.inSFCRoot&&Kn("COMPILER_NATIVE_TEMPLATE",mt)&&e.tag==="template"&&!Jp(e)){const r=It[0]||Zl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&Kl("COMPILER_INLINE_TEMPLATE",mt,o.loc)&&e.children.length&&(o.value={type:2,content:us(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function tw(e,t){let s=e;for(;Xa.charCodeAt(s)!==t&&s<Xa.length-1;)s++;return s}function Av(e,t){let s=e;for(;Xa.charCodeAt(s)!==t&&s>=0;)s--;return s}const sw=new Set(["if","else","else-if","for","slot"]);function Jp({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&sw.has(t[s].name))return!0}return!1}function aw({tag:e,props:t}){if(mt.isCustomElement(e))return!1;if(e==="component"||nw(e.charCodeAt(0))||xv(e)||mt.isBuiltInComponent&&mt.isBuiltInComponent(e)||mt.isNativeTag&&!mt.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(Kl("COMPILER_IS_ON_ELEMENT",mt,a.loc))return!0}}else if(a.name==="bind"&&zn(a.arg,"is")&&Kl("COMPILER_IS_ON_ELEMENT",mt,a.loc))return!0}return!1}function nw(e){return e>64&&e<91}const iw=/\r\n/g;function Rv(e){const t=mt.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(Cu)n.content=n.content.replace(iw,`
`);else if(Cv(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&lw(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=Iv(n.content))}return s?e.filter(Boolean):e}function lw(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Iv(e){let t="",s=!1;for(let a=0;a<e.length;a++)Ks(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function fd(e){(It[0]||Zl).children.push(e)}function Ht(e,t){return{start:Ft.getPos(e),end:t==null?t:Ft.getPos(t),source:t==null?t:us(e,t)}}function ow(e){return Ht(e.start.offset,e.end.offset)}function Hn(e,t){e.end=Ft.getPos(t),e.source=us(e.start.offset,t)}function rw(e){const t={type:6,name:e.rawName,nameLoc:Ht(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function qo(e,t=!1,s,a=0,n=0){return Xe(e,t,s,a)}function Fa(e,t,s){mt.onError(Ot(e,Ht(t,t)))}function cw(){Ft.reset(),xs=null,lt=null,$s="",za=-1,Fn=-1,It.length=0}function dw(e,t){if(cw(),Xa=e,mt=at({},Ev),t){let n;for(n in t)t[n]!=null&&(mt[n]=t[n])}Ft.mode=mt.parseMode==="html"?1:mt.parseMode==="sfc"?2:0,Ft.inXML=mt.ns===1||mt.ns===2;const s=t&&t.delimiters;s&&(Ft.delimiterOpen=gr(s[0]),Ft.delimiterClose=gr(s[1]));const a=Zl=$_([],e);return Ft.parse(Xa),a.loc=Ht(0,e.length),a.children=Rv(a.children),Zl=null,a}function uw(e,t){Go(e,void 0,t,!!Ov(e))}function Ov(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!yr(t[0])?t[0]:null}function Go(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Js(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const m=u.codegenNode;if(m.type===13){const h=m.patchFlag;if((h===void 0||h===512||h===1)&&Nv(u,s)>=2){const b=Mv(u);b&&(m.props=s.hoist(b))}m.dynamicProps&&(m.dynamicProps=s.hoist(m.dynamicProps))}}}else if(u.type===12&&(a?0:Js(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Go(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)Go(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Go(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ie(e.codegenNode.children))e.codegenNode.children=r(Wn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ie(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(Wn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ie(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=na(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(Wn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ie(d.children)&&d.children.type===15){const p=d.children.properties.find(m=>m.key===u||m.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Js(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=Nv(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Js(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Js(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Yn),t.removeHelper(Gi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(qi(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Js(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Je(o)||Ss(o))continue;const r=Js(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const pw=new Set([vu,gu,Gl,co]);function Lv(e,t){if(e.type===14&&!Je(e.callee)&&pw.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Js(s,t);if(s.type===14)return Lv(s,t)}return 0}function Nv(e,t){let s=3;const a=Mv(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Js(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Js(o,t):o.type===14?c=Lv(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Mv(e){const t=e.codegenNode;if(t.type===13)return t.props}function fw(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=ms,isCustomElement:d=ms,expressionPlugins:u=[],scopeId:p=null,slotted:m=!0,ssr:h=!1,inSSR:b=!1,ssrCssVars:I="",bindingMetadata:k=it,inline:y=!1,isTS:g=!1,onError:x=wu,onWarn:S=yv,compatConfig:_}){const E=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),R={filename:t,selfName:E&&ti(St(E[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:m,ssr:h,inSSR:b,ssrCssVars:I,bindingMetadata:k,inline:y,isTS:g,onError:x,onWarn:S,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(w){const O=R.helpers.get(w)||0;return R.helpers.set(w,O+1),w},removeHelper(w){const O=R.helpers.get(w);if(O){const U=O-1;U?R.helpers.set(w,U):R.helpers.delete(w)}},helperString(w){return`_${ji[R.helper(w)]}`},replaceNode(w){R.parent.children[R.childIndex]=R.currentNode=w},removeNode(w){const O=R.parent.children,U=w?O.indexOf(w):R.currentNode?R.childIndex:-1;!w||w===R.currentNode?(R.currentNode=null,R.onNodeRemoved()):R.childIndex>U&&(R.childIndex--,R.onNodeRemoved()),R.parent.children.splice(U,1)},onNodeRemoved:ms,addIdentifiers(w){},removeIdentifiers(w){},hoist(w){Je(w)&&(w=Xe(w)),R.hoists.push(w);const O=Xe(`_hoisted_${R.hoists.length}`,!1,w.loc,2);return O.hoisted=w,O},cache(w,O=!1,U=!1){const T=F_(R.cached.length,w,O,U);return R.cached.push(T),T}};return R.filters=new Set,R}function mw(e,t){const s=fw(e,t);Kr(e,s),t.hoistStatic&&uw(e,s),t.ssr||hw(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function hw(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=Ov(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&_u(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=Wl(t,s(ql),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function vw(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];Je(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,Kr(n,t))}}function Kr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ie(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(ro);break;case 5:t.ssr||t.helper(Gr);break;case 9:for(let i=0;i<e.branches.length;i++)Kr(e.branches[i],t);break;case 10:case 11:case 1:case 0:vw(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function Dv(e,t){const s=Je(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(J_))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const Jr="/*@__PURE__*/",Pv=e=>`${ji[e]}: _${ji[e]}`;function gw(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const m={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(b){return`_${ji[b]}`},push(b,I=-2,k){m.code+=b},indent(){h(++m.indentLevel)},deindent(b=!1){b?--m.indentLevel:h(--m.indentLevel)},newline(){h(m.indentLevel)}};function h(b){m.push(`
`+"  ".repeat(b),0)}return m}function bw(e,t={}){const s=gw(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,m=!i&&a!=="module";yw(e,s);const b=d?"ssrRender":"render",k=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${b}(${k}) {`),l(),m&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(Pv).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(Ec(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(Ec(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),Ec(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let y=0;y<e.temps;y++)n(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?ks(e.codegenNode,s):n("null"),m&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function yw(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[ou,ru,ro,cu,hv].filter(p=>d.includes(p)).map(Pv).join(", ");n(`const { ${u} } = _Vue
`,-1)}xw(e.hoists,t),i(),n("return ")}function Ec(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?fu:t==="component"?du:pu);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${Jl(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function xw(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),ks(i,t),a())}t.pure=!1}function Tu(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),uo(e,t,s),s&&t.deindent(),t.push("]")}function uo(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Je(o)?n(o,-3):Ie(o)?Tu(o,t):ks(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function ks(e,t){if(Je(e)){t.push(e,-3);return}if(Ss(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ks(e.codegenNode,t);break;case 2:_w(e,t);break;case 4:$v(e,t);break;case 5:ww(e,t);break;case 12:ks(e.codegenNode,t);break;case 8:Fv(e,t);break;case 3:Sw(e,t);break;case 13:Cw(e,t);break;case 14:Ew(e,t);break;case 15:Aw(e,t);break;case 17:Rw(e,t);break;case 18:Iw(e,t);break;case 19:Ow(e,t);break;case 20:Lw(e,t);break;case 21:uo(e.body,t,!0,!1);break}}function _w(e,t){t.push(JSON.stringify(e.content),-3,e)}function $v(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function ww(e,t){const{push:s,helper:a,pure:n}=t;n&&s(Jr),s(`${a(Gr)}(`),ks(e.content,t),s(")")}function Fv(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];Je(a)?t.push(a,-3):ks(a,t)}}function kw(e,t){const{push:s}=t;if(e.type===8)s("["),Fv(e,t),s("]");else if(e.isStatic){const a=ku(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function Sw(e,t){const{push:s,helper:a,pure:n}=t;n&&s(Jr),s(`${a(ro)}(${JSON.stringify(e.content)})`,-3,e)}function Cw(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:m}=e;let h;r&&(h=String(r)),d&&s(a(mu)+"("),u&&s(`(${a(Yn)}(${p?"true":""}), `),n&&s(Jr);const b=u?Gi(t.inSSR,m):qi(t.inSSR,m);s(a(b)+"(",-2,e),uo(Tw([i,l,o,h,c]),t),s(")"),u&&s(")"),d&&(s(", "),ks(d,t),s(")"))}function Tw(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Ew(e,t){const{push:s,helper:a,pure:n}=t,i=Je(e.callee)?e.callee:a(e.callee);n&&s(Jr),s(i+"(",-2,e),uo(e.arguments,t),s(")")}function Aw(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];kw(c,t),s(": "),ks(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function Rw(e,t){Tu(e.elements,t)}function Iw(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${ji[yu]}(`),s("(",-2,e),Ie(i)?uo(i,t):i&&ks(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Ie(l)?Tu(l,t):ks(l,t)):o&&ks(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Ow(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!ku(s.content);u&&l("("),$v(s,t),u&&l(")")}else l("("),ks(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ks(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,ks(n,t),d||t.indentLevel--,i&&r(!0)}function Lw(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(vr)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ks(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(vr)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Nw=Dv(/^(?:if|else|else-if)$/,(e,t,s)=>Mw(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=Yp(n,r,s);else{const c=Dw(a.codegenNode);c.alternate=Yp(n,r+a.branches.length-1,s)}}}));function Mw(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(Ot(28,t.loc)),t.exp=Xe("true",!1,n)}if(t.name==="if"){const n=Zp(e,t),i={type:9,loc:ow(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&Tv(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(Ot(30,e.loc)),s.removeNode();const o=Zp(e,t);l.branches.push(o);const r=a&&a(l,o,!1);Kr(o,s),r&&r(),s.currentNode=null}else s.onError(Ot(30,e.loc));break}}}function Zp(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!na(e,"for")?e.children:[e],userKey:Wr(e,"key"),isTemplateIf:s}}function Yp(e,t,s){return e.condition?ud(e.condition,Qp(e,t,s),ss(s.helper(ro),['""',"true"])):Qp(e,t,s)}function Qp(e,t,s){const{helper:a}=s,n=Wt("key",Xe(`${t}`,!1,Qs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return xr(r,n,s),r}else return Wl(s,a(ql),ia([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=Y_(r);return c.type===13&&_u(c,s),xr(c,n,s),r}}function Dw(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Pw=Dv("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return $w(e,t,s,i=>{const l=ss(a(hu),[i.source]),o=br(e),r=na(e,"memo"),c=Wr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Xe(c.value.content,!0):void 0:c.exp);const u=d?Wt("key",d):null,p=i.source.type===4&&i.source.constType>0,m=p?64:c?128:256;return i.codegenNode=Wl(s,a(ql),void 0,l,m,void 0,void 0,!0,!p,!1,e.loc),()=>{let h;const{children:b}=i,I=b.length!==1||b[0].type!==1,k=yr(e)?e:o&&e.children.length===1&&yr(e.children[0])?e.children[0]:null;if(k?(h=k.codegenNode,o&&u&&xr(h,u,s)):I?h=Wl(s,a(ql),u?ia([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(h=b[0].codegenNode,o&&u&&xr(h,u,s),h.isBlock!==!p&&(h.isBlock?(n(Yn),n(Gi(s.inSSR,h.isComponent))):n(qi(s.inSSR,h.isComponent))),h.isBlock=!p,h.isBlock?(a(Yn),a(Gi(s.inSSR,h.isComponent))):a(qi(s.inSSR,h.isComponent))),r){const y=Vi(md(i.parseResult,[Xe("_cached")]));y.body=B_([ha(["const _memo = (",r.exp,")"]),ha(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(bv)}(_cached, _memo)) return _cached`]),ha(["const _item = ",h]),Xe("_item.memo = _memo"),Xe("return _item")]),l.arguments.push(y,Xe("_cache"),Xe(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Vi(md(i.parseResult),h,!0))}})});function $w(e,t,s,a){if(!t.exp){s.onError(Ot(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(Ot(32,t.loc));return}Bv(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:br(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const m=a&&a(p);return()=>{o.vFor--,m&&m()}}function Bv(e,t){e.finalized||(e.finalized=!0)}function md({value:e,key:t,index:s},a=[]){return Fw([e,t,s,...a])}function Fw(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Xe("_".repeat(a+1),!1))}const Xp=Xe("undefined",!1),Bw=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=na(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Uw=(e,t,s,a)=>Vi(e,s,!1,!0,s.length?s[0].loc:a);function zw(e,t,s=Uw){t.helper(yu);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=na(e,"slot",!0);if(r){const{arg:I,exp:k}=r;I&&!Hs(I)&&(o=!0),i.push(Wt(I||Xe("default",!0),s(k,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let m=0;for(let I=0;I<a.length;I++){const k=a[I];let y;if(!br(k)||!(y=na(k,"slot",!0))){k.type!==3&&u.push(k);continue}if(r){t.onError(Ot(37,y.loc));break}c=!0;const{children:g,loc:x}=k,{arg:S=Xe("default",!0),exp:_,loc:E}=y;let R;Hs(S)?R=S?S.content:"default":o=!0;const w=na(k,"for"),O=s(_,w,g,x);let U,T;if(U=na(k,"if"))o=!0,l.push(ud(U.exp,Ro(S,O,m++),Xp));else if(T=na(k,/^else(?:-if)?$/,!0)){let $=I,Q;for(;$--&&(Q=a[$],!!Tv(Q)););if(Q&&br(Q)&&na(Q,/^(?:else-)?if$/)){let W=l[l.length-1];for(;W.alternate.type===19;)W=W.alternate;W.alternate=T.exp?ud(T.exp,Ro(S,O,m++),Xp):Ro(S,O,m++)}else t.onError(Ot(30,T.loc))}else if(w){o=!0;const $=w.forParseResult;$?(Bv($),l.push(ss(t.helper(hu),[$.source,Vi(md($),Ro(S,O),!0)]))):t.onError(Ot(32,w.loc))}else{if(R){if(p.has(R)){t.onError(Ot(38,E));continue}p.add(R),R==="default"&&(d=!0)}i.push(Wt(S,O))}}if(!r){const I=(k,y)=>{const g=s(k,void 0,y,n);return t.compatConfig&&(g.isNonScopedSlot=!0),Wt("default",g)};c?u.length&&!u.every(Su)&&(d?t.onError(Ot(39,u[0].loc)):i.push(I(void 0,u))):i.push(I(void 0,a))}const h=o?2:Wo(e.children)?3:1;let b=ia(i.concat(Wt("_",Xe(h+"",!1))),n);return l.length&&(b=ss(t.helper(gv),[b,Wn(l)])),{slots:b,hasDynamicSlots:o}}function Ro(e,t,s){const a=[Wt("name",e),Wt("fn",t)];return s!=null&&a.push(Wt("key",Xe(String(s),!0))),ia(a)}function Wo(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Wo(s.children))return!0;break;case 9:if(Wo(s.branches))return!0;break;case 10:case 11:if(Wo(s.children))return!0;break}}return!1}const Uv=new WeakMap,Hw=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?jw(e,t):`"${a}"`;const o=ht(l)&&l.callee===uu;let r,c,d=0,u,p,m,h=o||l===Il||l===lu||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const b=zv(e,t,void 0,i,o);r=b.props,d=b.patchFlag,p=b.dynamicPropNames;const I=b.directives;m=I&&I.length?Wn(I.map(k=>qw(k,t))):void 0,b.shouldUseBlock&&(h=!0)}if(e.children.length>0)if(l===mr&&(h=!0,d|=1024),i&&l!==Il&&l!==mr){const{slots:I,hasDynamicSlots:k}=zw(e,t);c=I,k&&(d|=1024)}else if(e.children.length===1&&l!==Il){const I=e.children[0],k=I.type,y=k===5||k===8;y&&Js(I,t)===0&&(d|=1),y||k===2?c=I:c=e.children}else c=e.children;p&&p.length&&(u=Gw(p)),e.codegenNode=Wl(t,l,r,c,d===0?void 0:d,u,m,!!h,!1,i,e.loc)};function jw(e,t,s=!1){let{tag:a}=e;const n=hd(a),i=Wr(e,"is",!1,!0);if(i)if(n||Kn("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Xe(i.value.content,!0):(o=i.exp,o||(o=Xe("is",!1,i.arg.loc))),o)return ss(t.helper(uu),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=xv(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(du),t.components.add(a),Jl(a,"component"))}function zv(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let m=!1,h=0,b=!1,I=!1,k=!1,y=!1,g=!1,x=!1;const S=[],_=O=>{c.length&&(d.push(ia(ef(c),o)),c=[]),O&&d.push(O)},E=()=>{t.scopes.vFor>0&&c.push(Wt(Xe("ref_for",!0),Xe("true")))},R=({key:O,value:U})=>{if(Hs(O)){const T=O.content,$=Xn(T);if($&&(!a||n)&&T.toLowerCase()!=="onclick"&&T!=="onUpdate:modelValue"&&!Za(T)&&(y=!0),$&&Za(T)&&(x=!0),$&&U.type===14&&(U=U.arguments[0]),U.type===20||(U.type===4||U.type===8)&&Js(U,t)>0)return;T==="ref"?b=!0:T==="class"?I=!0:T==="style"?k=!0:T!=="key"&&!S.includes(T)&&S.push(T),a&&(T==="class"||T==="style")&&!S.includes(T)&&S.push(T)}else g=!0};for(let O=0;O<s.length;O++){const U=s[O];if(U.type===6){const{loc:T,name:$,nameLoc:Q,value:W}=U;let M=!0;if($==="ref"&&(b=!0,E()),$==="is"&&(hd(l)||W&&W.content.startsWith("vue:")||Kn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Wt(Xe($,!0,Q),Xe(W?W.content:"",M,W?W.loc:T)))}else{const{name:T,arg:$,exp:Q,loc:W,modifiers:M}=U,L=T==="bind",D=T==="on";if(T==="slot"){a||t.onError(Ot(40,W));continue}if(T==="once"||T==="memo"||T==="is"||L&&zn($,"is")&&(hd(l)||Kn("COMPILER_IS_ON_ELEMENT",t))||D&&i)continue;if((L&&zn($,"key")||D&&p&&zn($,"vue:before-update"))&&(m=!0),L&&zn($,"ref")&&E(),!$&&(L||D)){if(g=!0,Q)if(L){if(_(),Kn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Q);continue}E(),_(),d.push(Q)}else _({type:14,loc:W,callee:t.helper(bu),arguments:a?[Q]:[Q,"true"]});else t.onError(Ot(L?34:35,W));continue}L&&M.some(oe=>oe.content==="prop")&&(h|=32);const le=t.directiveTransforms[T];if(le){const{props:oe,needRuntime:z}=le(U,e,t);!i&&oe.forEach(R),D&&$&&!Hs($)?_(ia(oe,o)):c.push(...oe),z&&(u.push(U),Ss(z)&&Uv.set(U,z))}else Pb(T)||(u.push(U),p&&(m=!0))}}let w;if(d.length?(_(),d.length>1?w=ss(t.helper(hr),d,o):w=d[0]):c.length&&(w=ia(ef(c),o)),g?h|=16:(I&&!a&&(h|=2),k&&!a&&(h|=4),S.length&&(h|=8),y&&(h|=32)),!m&&(h===0||h===32)&&(b||x||u.length>0)&&(h|=512),!t.inSSR&&w)switch(w.type){case 15:let O=-1,U=-1,T=!1;for(let W=0;W<w.properties.length;W++){const M=w.properties[W].key;Hs(M)?M.content==="class"?O=W:M.content==="style"&&(U=W):M.isHandlerKey||(T=!0)}const $=w.properties[O],Q=w.properties[U];T?w=ss(t.helper(Gl),[w]):($&&!Hs($.value)&&($.value=ss(t.helper(vu),[$.value])),Q&&(k||Q.value.type===4&&Q.value.content.trim()[0]==="["||Q.value.type===17)&&(Q.value=ss(t.helper(gu),[Q.value])));break;case 14:break;default:w=ss(t.helper(Gl),[ss(t.helper(co),[w])]);break}return{props:w,directives:u,patchFlag:h,dynamicPropNames:S,shouldUseBlock:m}}function ef(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Xn(i))&&Vw(l,n):(t.set(i,n),s.push(n))}return s}function Vw(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Wn([e.value,t.value],e.loc)}function qw(e,t){const s=[],a=Uv.get(e);a?s.push(t.helperString(a)):(t.helper(pu),t.directives.add(e.name),s.push(Jl(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Xe("true",!1,n);s.push(ia(e.modifiers.map(l=>Wt(l,i)),n))}return Wn(s,e.loc)}function Gw(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function hd(e){return e==="component"||e==="Component"}const Ww=(e,t)=>{if(yr(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=Kw(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=Vi([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=ss(t.helper(vv),l,a)}};function Kw(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=St(l.name),n.push(l)));else if(l.name==="bind"&&zn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=St(l.arg.content);s=l.exp=Xe(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Hs(l.arg)&&(l.arg.content=St(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=zv(e,t,n,!1,!1);a=i,l.length&&t.onError(Ot(36,l[0].loc))}return{slotName:s,slotProps:a}}const Hv=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(Ot(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ii(St(u)):`on:${u}`;o=Xe(p,!0,l.loc)}else o=ha([`${s.helperString(dd)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(dd)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=kv(r),p=!(u||W_(r)),m=r.content.includes(";");(p||c&&u)&&(r=ha([`${p?"$event":"(...args)"} => ${m?"{":"("}`,r,m?"}":")"]))}let d={props:[Wt(o,r||Xe("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Jw=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=St(i.content):i.content=`${s.helperString(cd)}(${i.content})`:(i.children.unshift(`${s.helperString(cd)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&tf(i,"."),a.some(o=>o.content==="attr")&&tf(i,"^")),{props:[Wt(i,l)]}},tf=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Zw=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Tc(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(Tc(r))a||(a=s[i]=ha([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Tc(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Js(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:ss(t.helper(cu),o)}}}}},sf=new WeakSet,Yw=(e,t)=>{if(e.type===1&&na(e,"once",!0))return sf.has(e)||t.inVOnce||t.inSSR?void 0:(sf.add(e),t.inVOnce=!0,t.helper(vr),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},jv=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(Ot(41,e.loc)),pl();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(Ot(44,a.loc)),pl();if(o==="literal-const"||o==="setup-const")return s.onError(Ot(45,a.loc)),pl();if(!l.trim()||!kv(a))return s.onError(Ot(42,a.loc)),pl();const r=n||Xe("modelValue",!0),c=n?Hs(n)?`onUpdate:${St(n.content)}`:ha(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=ha([`${u} => ((`,a,") = $event)"]);const p=[Wt(r,e.exp),Wt(c,d)];if(e.modifiers.length&&t.tagType===1){const m=e.modifiers.map(b=>b.content).map(b=>(ku(b)?b:JSON.stringify(b))+": true").join(", "),h=n?Hs(n)?`${n.content}Modifiers`:ha([n,' + "Modifiers"']):"modelModifiers";p.push(Wt(h,Xe(`{ ${m} }`,!1,e.loc,2)))}return pl(p)};function pl(e=[]){return{props:e}}const Qw=/[\w).+\-_$\]]/,Xw=(e,t)=>{Kn("COMPILER_FILTERS",t)&&(e.type===5?_r(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&_r(s.exp,t)}))};function _r(e,t){if(e.type===4)af(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?af(a,t):a.type===8?_r(e,t):a.type===5&&_r(a.content,t))}}function af(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,m,h,b=[];for(m=0;m<s.length;m++)if(p=u,u=s.charCodeAt(m),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(m+1)!==124&&s.charCodeAt(m-1)!==124&&!o&&!r&&!c)h===void 0?(d=m+1,h=s.slice(0,m).trim()):I();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let k=m-1,y;for(;k>=0&&(y=s.charAt(k),y===" ");k--);(!y||!Qw.test(y))&&(l=!0)}}h===void 0?h=s.slice(0,m).trim():d!==0&&I();function I(){b.push(s.slice(d,m).trim()),d=m+1}if(b.length){for(m=0;m<b.length;m++)h=ek(h,b[m],t);e.content=h,e.ast=void 0}}function ek(e,t,s){s.helper(fu);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${Jl(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${Jl(n,"filter")}(${e}${i!==")"?","+i:i}`}}const nf=new WeakSet,tk=(e,t)=>{if(e.type===1){const s=na(e,"memo");return!s||nf.has(e)||t.inSSR?void 0:(nf.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&_u(a,t),e.codegenNode=ss(t.helper(xu),[s.exp,Vi(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},sk=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(Ot(53,a.loc)),s.exp=Xe("",!0,a.loc);else{const n=St(a.content);(_v.test(n[0])||n[0]==="-")&&(s.exp=Xe(n,!1,a.loc))}}}};function ak(e){return[[sk,Yw,Nw,tk,Pw,Xw,Ww,Hw,Bw,Zw],{on:Hv,bind:Jw,model:jv}]}function nk(e,t={}){const s=t.onError||wu,a=t.mode==="module";t.prefixIdentifiers===!0?s(Ot(48)):a&&s(Ot(49));const n=!1;t.cacheHandlers&&s(Ot(50)),t.scopeId&&!a&&s(Ot(51));const i=at({},t,{prefixIdentifiers:n}),l=Je(e)?dw(e,i):e,[o,r]=ak();return mw(l,at({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:at({},r,t.directiveTransforms||{})})),bw(l,i)}const ik=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Vv=Symbol(""),qv=Symbol(""),Gv=Symbol(""),Wv=Symbol(""),vd=Symbol(""),Kv=Symbol(""),Jv=Symbol(""),Zv=Symbol(""),Yv=Symbol(""),Qv=Symbol("");P_({[Vv]:"vModelRadio",[qv]:"vModelCheckbox",[Gv]:"vModelText",[Wv]:"vModelSelect",[vd]:"vModelDynamic",[Kv]:"withModifiers",[Jv]:"withKeys",[Zv]:"vShow",[Yv]:"Transition",[Qv]:"TransitionGroup"});let gi;function lk(e,t=!1){return gi||(gi=document.createElement("div")),t?(gi.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,gi.children[0].getAttribute("foo")):(gi.innerHTML=e,gi.textContent)}const ok={parseMode:"html",isVoidTag:Xb,isNativeTag:e=>Zb(e)||Yb(e)||Qb(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:lk,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Yv;if(e==="TransitionGroup"||e==="transition-group")return Qv},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},rk=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Xe("style",!0,t.loc),exp:ck(t.value.content,t.loc),modifiers:[],loc:t.loc})})},ck=(e,t)=>{const s=um(e);return Xe(JSON.stringify(s),!1,t,3)};function kn(e,t){return Ot(e,t)}const dk=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(kn(54,n)),t.children.length&&(s.onError(kn(55,n)),t.children.length=0),{props:[Wt(Xe("innerHTML",!0,n),a||Xe("",!0))]}},uk=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(kn(56,n)),t.children.length&&(s.onError(kn(57,n)),t.children.length=0),{props:[Wt(Xe("textContent",!0),a?Js(a,s)>0?a:ss(s.helperString(Gr),[a],n):Xe("",!0))]}},pk=(e,t,s)=>{const a=jv(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(kn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Gv,o=!1;if(n==="input"||i){const r=Wr(t,"type");if(r){if(r.type===7)l=vd;else if(r.value)switch(r.value.content){case"radio":l=Vv;break;case"checkbox":l=qv;break;case"file":o=!0,s.onError(kn(60,e.loc));break}}else K_(t)&&(l=vd)}else n==="select"&&(l=Wv);o||(a.needRuntime=s.helper(l))}else s.onError(kn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},fk=Ys("passive,once,capture"),mk=Ys("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),hk=Ys("left,right"),Xv=Ys("onkeyup,onkeydown,onkeypress"),vk=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&Kl("COMPILER_V_ON_NATIVE",s)||fk(r)?l.push(r):hk(r)?Hs(e)?Xv(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):mk(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},lf=(e,t)=>Hs(e)&&e.content.toLowerCase()==="onclick"?Xe(t,!0):e.type!==4?ha(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,gk=(e,t,s)=>Hv(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=vk(i,n,s,e.loc);if(r.includes("right")&&(i=lf(i,"onContextmenu")),r.includes("middle")&&(i=lf(i,"onMouseup")),r.length&&(l=ss(s.helper(Kv),[l,JSON.stringify(r)])),o.length&&(!Hs(i)||Xv(i.content.toLowerCase()))&&(l=ss(s.helper(Jv),[l,JSON.stringify(o)])),c.length){const d=c.map(ti).join("");i=Hs(i)?Xe(`${i.content}${d}`,!0):ha(["(",i,`) + "${d}"`])}return{props:[Wt(i,l)]}}),bk=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(kn(62,n)),{props:[],needRuntime:s.helper(Zv)}},yk=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},xk=[rk],_k={cloak:ik,html:dk,text:uk,model:pk,on:gk,show:bk};function wk(e,t={}){return nk(e,at({},ok,t,{nodeTransforms:[yk,...xk,...t.nodeTransforms||[]],directiveTransforms:at({},_k,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const of=Object.create(null);function kk(e,t){if(!Je(e))if(e.nodeType)e=e.innerHTML;else return ms;const s=Bb(e,t),a=of[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=at({hoistStatic:!0,onError:void 0,onWarn:ms},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=wk(e,n),l=new Function("Vue",i)(I_);return l._rc=!0,of[s]=l}Ph(kk);const wr=Cn({items:[]});let Sk=1;function Zr(e,t="info",s=3e3){const a=Sk++;return wr.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>Eu(a),s),a}function Eu(e){const t=wr.items.findIndex(s=>s.id===e);t>=0&&wr.items.splice(t,1)}function Ce(e,t="info",s=3e3){return Zr(e,t,s)}Ce.success=(e,t=3e3)=>Zr(e,"success",t);Ce.error=(e,t=5e3)=>Zr(e,"error",t);Ce.info=(e,t=3e3)=>Zr(e,"info",t);Ce.dismiss=Eu;const Ck={setup(){return{state:wr,dismiss:Eu}},template:`
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
  `},Va=Cn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Pi=null;function os({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return Pi&&Pi(!1),Va.title=e,Va.message=t,Va.confirmLabel=s,Va.cancelLabel=a,Va.danger=n,Va.open=!0,new Promise(i=>{Pi=i})}function rf(e){Va.open=!1,Pi&&(Pi(e),Pi=null)}const Tk={setup(){function e(t){Va.open&&t.key==="Escape"&&(t.stopPropagation(),rf(!1))}return tt(()=>document.addEventListener("keydown",e,!0)),wt(()=>document.removeEventListener("keydown",e,!0)),{state:Va,settle:rf}},template:`
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
 */const ki=typeof document<"u";function eg(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Ek(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&eg(e.default)}const xt=Object.assign;function Ac(e,t){const s={};for(const a in t){const n=t[a];s[a]=ga(n)?n.map(e):e(n)}return s}const Ol=()=>{},ga=Array.isArray;function cf(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const tg=/#/g,Ak=/&/g,Rk=/\//g,Ik=/=/g,Ok=/\?/g,sg=/\+/g,Lk=/%5B/g,Nk=/%5D/g,ag=/%5E/g,Mk=/%60/g,ng=/%7B/g,Dk=/%7C/g,ig=/%7D/g,Pk=/%20/g;function Au(e){return e==null?"":encodeURI(""+e).replace(Dk,"|").replace(Lk,"[").replace(Nk,"]")}function $k(e){return Au(e).replace(ng,"{").replace(ig,"}").replace(ag,"^")}function gd(e){return Au(e).replace(sg,"%2B").replace(Pk,"+").replace(tg,"%23").replace(Ak,"%26").replace(Mk,"`").replace(ng,"{").replace(ig,"}").replace(ag,"^")}function Fk(e){return gd(e).replace(Ik,"%3D")}function Bk(e){return Au(e).replace(tg,"%23").replace(Ok,"%3F")}function Uk(e){return Bk(e).replace(Rk,"%2F")}function Yl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const zk=/\/$/,Hk=e=>e.replace(zk,"");function Rc(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=Gk(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:Yl(l)}}function jk(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function df(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function Vk(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&Wi(t.matched[a],s.matched[n])&&lg(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Wi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function lg(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!qk(e[s],t[s]))return!1;return!0}function qk(e,t){return ga(e)?uf(e,t):ga(t)?uf(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function uf(e,t){return ga(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function Gk(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const mn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let bd=(function(e){return e.pop="pop",e.push="push",e})({}),Ic=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Wk(e){if(!e)if(ki){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Hk(e)}const Kk=/^[^#]+#/;function Jk(e,t){return e.replace(Kk,"#")+t}function Zk(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const Yr=()=>({left:window.scrollX,top:window.scrollY});function Yk(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=Zk(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function pf(e,t){return(history.state?history.state.position-t:-1)+e}const yd=new Map;function Qk(e,t){yd.set(e,t)}function Xk(e){const t=yd.get(e);return yd.delete(e),t}function eS(e){return typeof e=="string"||e&&typeof e=="object"}function og(e){return typeof e=="string"||typeof e=="symbol"}let $t=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const rg=Symbol("");$t.MATCHER_NOT_FOUND+"",$t.NAVIGATION_GUARD_REDIRECT+"",$t.NAVIGATION_ABORTED+"",$t.NAVIGATION_CANCELLED+"",$t.NAVIGATION_DUPLICATED+"";function Ki(e,t){return xt(new Error,{type:e,[rg]:!0},t)}function Ba(e,t){return e instanceof Error&&rg in e&&(t==null||!!(e.type&t))}const tS=["params","query","hash"];function sS(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of tS)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function aS(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(sg," "),i=n.indexOf("="),l=Yl(i<0?n:n.slice(0,i)),o=i<0?null:Yl(n.slice(i+1));if(l in t){let r=t[l];ga(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function ff(e){let t="";for(let s in e){const a=e[s];if(s=Fk(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(ga(a)?a.map(n=>n&&gd(n)):[a&&gd(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function nS(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=ga(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const iS=Symbol(""),mf=Symbol(""),Qr=Symbol(""),Ru=Symbol(""),xd=Symbol("");function fl(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function xn(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(Ki($t.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):eS(p)?r(Ki($t.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Oc(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(eg(r)){const c=(r.__vccOpts||r)[t];c&&i.push(xn(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=Ek(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&xn(p,s,a,l,o,n)()}))}}return i}function lS(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>Wi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>Wi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let oS=()=>location.protocol+"//"+location.host;function cg(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),df(o,"")}return df(s,e)+a+n}function rS(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const m=cg(e,location),h=s.value,b=t.value;let I=0;if(p){if(s.value=m,t.value=p,l&&l===h){l=null;return}I=b?p.position-b.position:0}else a(m);n.forEach(k=>{k(s.value,h,{delta:I,type:bd.pop,direction:I?I>0?Ic.forward:Ic.back:Ic.unknown})})};function r(){l=s.value}function c(p){n.push(p);const m=()=>{const h=n.indexOf(p);h>-1&&n.splice(h,1)};return i.push(m),m}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(xt({},p.state,{scroll:Yr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function hf(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?Yr():null}}function cS(e){const{history:t,location:s}=window,a={value:cg(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:oS()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(m){console.error(m),s[d?"replace":"assign"](p)}}function l(r,c){i(r,xt({},t.state,hf(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=xt({},n.value,t.state,{forward:r,scroll:Yr()});i(d.current,d,!0),i(r,xt({},hf(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function dS(e){e=Wk(e);const t=cS(e),s=rS(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=xt({location:"",base:e,go:a,createHref:Jk.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function uS(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),dS(e)}let jn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var es=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(es||{});const pS={type:jn.Static,value:""},fS=/[a-zA-Z0-9_]/;function mS(e){if(!e)return[[]];if(e==="/")return[[pS]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(m){throw new Error(`ERR (${s})/"${c}": ${m}`)}let s=es.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===es.Static?i.push({type:jn.Static,value:c}):s===es.Param||s===es.ParamRegExp||s===es.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:jn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==es.ParamRegExp){a=s,s=es.EscapeNext;continue}switch(s){case es.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=es.Param):p();break;case es.EscapeNext:p(),s=a;break;case es.Param:r==="("?s=es.ParamRegExp:fS.test(r)?p():(u(),s=es.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case es.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=es.ParamRegExpEnd:d+=r;break;case es.ParamRegExpEnd:u(),s=es.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===es.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const vf="[^/]+?",hS={sensitive:!1,strict:!1,start:!0,end:!0};var As=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(As||{});const vS=/[.+*?^${}()[\]/\\]/g;function gS(e,t){const s=xt({},hS,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[As.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let m=As.Segment+(s.sensitive?As.BonusCaseSensitive:0);if(p.type===jn.Static)u||(n+="/"),n+=p.value.replace(vS,"\\$&"),m+=As.Static;else if(p.type===jn.Param){const{value:h,repeatable:b,optional:I,regexp:k}=p;i.push({name:h,repeatable:b,optional:I});const y=k||vf;if(y!==vf){m+=As.BonusCustomRegExp;try{`${y}`}catch(x){throw new Error(`Invalid custom RegExp for param "${h}" (${y}): `+x.message)}}let g=b?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=I&&c.length<2?`(?:/${g})`:"/"+g),I&&(g+="?"),n+=g,m+=As.Dynamic,I&&(m+=As.BonusOptional),b&&(m+=As.BonusRepeatable),y===".*"&&(m+=As.BonusWildcard)}d.push(m)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=As.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const m=d[p]||"",h=i[p-1];u[h.name]=m&&h.repeatable?m.split("/"):m}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const m of p)if(m.type===jn.Static)d+=m.value;else if(m.type===jn.Param){const{value:h,repeatable:b,optional:I}=m,k=h in c?c[h]:"";if(ga(k)&&!b)throw new Error(`Provided param "${h}" is an array but it is not repeatable (* or + modifiers)`);const y=ga(k)?k.join("/"):k;if(!y)if(I)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${h}"`);d+=y}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function bS(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===As.Static+As.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===As.Static+As.Segment?1:-1:0}function dg(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=bS(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(gf(a))return 1;if(gf(n))return-1}return n.length-a.length}function gf(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const yS={strict:!1,end:!0,sensitive:!1};function xS(e,t,s){const a=gS(mS(e.path),s),n=xt(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function _S(e,t){const s=[],a=new Map;t=cf(yS,t);function n(u){return a.get(u)}function i(u,p,m){const h=!m,b=yf(u);b.aliasOf=m&&m.record;const I=cf(t,u),k=[b];if("alias"in u){const x=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of x)k.push(yf(xt({},b,{components:m?m.record.components:b.components,path:S,aliasOf:m?m.record:b})))}let y,g;for(const x of k){const{path:S}=x;if(p&&S[0]!=="/"){const _=p.record.path,E=_[_.length-1]==="/"?"":"/";x.path=p.record.path+(S&&E+S)}if(y=xS(x,p,I),m?m.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),h&&u.name&&!xf(y)&&l(u.name)),ug(y)&&r(y),b.children){const _=b.children;for(let E=0;E<_.length;E++)i(_[E],y,m&&m.children[E])}m=m||y}return g?()=>{l(g)}:Ol}function l(u){if(og(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=SS(u,s);s.splice(p,0,u),u.record.name&&!xf(u)&&a.set(u.record.name,u)}function c(u,p){let m,h={},b,I;if("name"in u&&u.name){if(m=a.get(u.name),!m)throw Ki($t.MATCHER_NOT_FOUND,{location:u});I=m.record.name,h=xt(bf(p.params,m.keys.filter(g=>!g.optional).concat(m.parent?m.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&bf(u.params,m.keys.map(g=>g.name))),b=m.stringify(h)}else if(u.path!=null)b=u.path,m=s.find(g=>g.re.test(b)),m&&(h=m.parse(b),I=m.record.name);else{if(m=p.name?a.get(p.name):s.find(g=>g.re.test(p.path)),!m)throw Ki($t.MATCHER_NOT_FOUND,{location:u,currentLocation:p});I=m.record.name,h=xt({},p.params,u.params),b=m.stringify(h)}const k=[];let y=m;for(;y;)k.unshift(y.record),y=y.parent;return{name:I,path:b,params:h,matched:k,meta:kS(k)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function bf(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function yf(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:wS(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function wS(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function xf(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function kS(e){return e.reduce((t,s)=>xt(t,s.meta),{})}function SS(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;dg(e,t[i])<0?a=i:s=i+1}const n=CS(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function CS(e){let t=e;for(;t=t.parent;)if(ug(t)&&dg(e,t)===0)return t}function ug({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function _f(e){const t=la(Qr),s=la(Ru),a=H(()=>{const r=Ra(e.to);return t.resolve(r)}),n=H(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(Wi.bind(null,d));if(p>-1)return p;const m=wf(r[c-2]);return c>1&&wf(d)===m&&u[u.length-1].path!==m?u.findIndex(Wi.bind(null,r[c-2])):p}),i=H(()=>n.value>-1&&IS(s.params,a.value.params)),l=H(()=>n.value>-1&&n.value===s.matched.length-1&&lg(s.params,a.value.params));function o(r={}){if(RS(r)){const c=t[Ra(e.replace)?"replace":"push"](Ra(e.to)).catch(Ol);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:H(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function TS(e){return e.length===1?e[0]:e}const ES=io({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:_f,setup(e,{slots:t}){const s=Cn(_f(e)),{options:a}=la(Qr),n=H(()=>({[kf(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[kf(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&TS(t.default(s));return e.custom?i:Ui("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),AS=ES;function RS(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function IS(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!ga(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function wf(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const kf=(e,t,s)=>e??t??s,OS=io({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=la(xd),n=H(()=>e.route||a.value),i=la(mf,0),l=H(()=>{let c=Ra(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=H(()=>n.value.matched[l.value]);Tl(mf,H(()=>l.value+1)),Tl(iS,o),Tl(xd,n);const r=f();return Jt(()=>[r.value,o.value,e.name],([c,d,u],[p,m,h])=>{d&&(d.instances[u]=c,m&&m!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=m.leaveGuards),d.updateGuards.size||(d.updateGuards=m.updateGuards))),c&&d&&(!m||!Wi(d,m)||!p)&&(d.enterCallbacks[u]||[]).forEach(b=>b(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return Sf(s.default,{Component:p,route:c});const m=u.props[d],h=m?m===!0?c.params:typeof m=="function"?m(c):m:null,I=Ui(p,xt({},h,t,{onVnodeUnmounted:k=>{k.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return Sf(s.default,{Component:I,route:c})||I}}});function Sf(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const LS=OS;function NS(e){const t=_S(e.routes,e),s=e.parseQuery||aS,a=e.stringifyQuery||ff,n=e.history,i=fl(),l=fl(),o=fl(),r=Bd(mn);let c=mn;ki&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Ac.bind(null,ne=>""+ne),u=Ac.bind(null,Uk),p=Ac.bind(null,Yl);function m(ne,ie){let pe,me;return og(ne)?(pe=t.getRecordMatcher(ne),me=ie):me=ne,t.addRoute(me,pe)}function h(ne){const ie=t.getRecordMatcher(ne);ie&&t.removeRoute(ie)}function b(){return t.getRoutes().map(ne=>ne.record)}function I(ne){return!!t.getRecordMatcher(ne)}function k(ne,ie){if(ie=xt({},ie||r.value),typeof ne=="string"){const P=Rc(s,ne,ie.path),q=t.resolve({path:P.path},ie),fe=n.createHref(P.fullPath);return xt(P,q,{params:p(q.params),hash:Yl(P.hash),redirectedFrom:void 0,href:fe})}let pe;if(ne.path!=null)pe=xt({},ne,{path:Rc(s,ne.path,ie.path).path});else{const P=xt({},ne.params);for(const q in P)P[q]==null&&delete P[q];pe=xt({},ne,{params:u(P)}),ie.params=u(ie.params)}const me=t.resolve(pe,ie),ge=ne.hash||"";me.params=d(p(me.params));const Ne=jk(a,xt({},ne,{hash:$k(ge),path:me.path})),A=n.createHref(Ne);return xt({fullPath:Ne,hash:ge,query:a===ff?nS(ne.query):ne.query||{}},me,{redirectedFrom:void 0,href:A})}function y(ne){return typeof ne=="string"?Rc(s,ne,r.value.path):xt({},ne)}function g(ne,ie){if(c!==ne)return Ki($t.NAVIGATION_CANCELLED,{from:ie,to:ne})}function x(ne){return E(ne)}function S(ne){return x(xt(y(ne),{replace:!0}))}function _(ne,ie){const pe=ne.matched[ne.matched.length-1];if(pe&&pe.redirect){const{redirect:me}=pe;let ge=typeof me=="function"?me(ne,ie):me;return typeof ge=="string"&&(ge=ge.includes("?")||ge.includes("#")?ge=y(ge):{path:ge},ge.params={}),xt({query:ne.query,hash:ne.hash,params:ge.path!=null?{}:ne.params},ge)}}function E(ne,ie){const pe=c=k(ne),me=r.value,ge=ne.state,Ne=ne.force,A=ne.replace===!0,P=_(pe,me);if(P)return E(xt(y(P),{state:typeof P=="object"?xt({},ge,P.state):ge,force:Ne,replace:A}),ie||pe);const q=pe;q.redirectedFrom=ie;let fe;return!Ne&&Vk(a,me,pe)&&(fe=Ki($t.NAVIGATION_DUPLICATED,{to:q,from:me}),z(me,me,!0,!1)),(fe?Promise.resolve(fe):O(q,me)).catch(B=>Ba(B)?Ba(B,$t.NAVIGATION_GUARD_REDIRECT)?B:oe(B):D(B,q,me)).then(B=>{if(B){if(Ba(B,$t.NAVIGATION_GUARD_REDIRECT))return E(xt({replace:A},y(B.to),{state:typeof B.to=="object"?xt({},ge,B.to.state):ge,force:Ne}),ie||q)}else B=T(q,me,!0,A,ge);return U(q,me,B),B})}function R(ne,ie){const pe=g(ne,ie);return pe?Promise.reject(pe):Promise.resolve()}function w(ne){const ie=K.values().next().value;return ie&&typeof ie.runWithContext=="function"?ie.runWithContext(ne):ne()}function O(ne,ie){let pe;const[me,ge,Ne]=lS(ne,ie);pe=Oc(me.reverse(),"beforeRouteLeave",ne,ie);for(const P of me)P.leaveGuards.forEach(q=>{pe.push(xn(q,ne,ie))});const A=R.bind(null,ne,ie);return pe.push(A),Me(pe).then(()=>{pe=[];for(const P of i.list())pe.push(xn(P,ne,ie));return pe.push(A),Me(pe)}).then(()=>{pe=Oc(ge,"beforeRouteUpdate",ne,ie);for(const P of ge)P.updateGuards.forEach(q=>{pe.push(xn(q,ne,ie))});return pe.push(A),Me(pe)}).then(()=>{pe=[];for(const P of Ne)if(P.beforeEnter)if(ga(P.beforeEnter))for(const q of P.beforeEnter)pe.push(xn(q,ne,ie));else pe.push(xn(P.beforeEnter,ne,ie));return pe.push(A),Me(pe)}).then(()=>(ne.matched.forEach(P=>P.enterCallbacks={}),pe=Oc(Ne,"beforeRouteEnter",ne,ie,w),pe.push(A),Me(pe))).then(()=>{pe=[];for(const P of l.list())pe.push(xn(P,ne,ie));return pe.push(A),Me(pe)}).catch(P=>Ba(P,$t.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function U(ne,ie,pe){o.list().forEach(me=>w(()=>me(ne,ie,pe)))}function T(ne,ie,pe,me,ge){const Ne=g(ne,ie);if(Ne)return Ne;const A=ie===mn,P=ki?history.state:{};pe&&(me||A?n.replace(ne.fullPath,xt({scroll:A&&P&&P.scroll},ge)):n.push(ne.fullPath,ge)),r.value=ne,z(ne,ie,pe,A),oe()}let $;function Q(){$||($=n.listen((ne,ie,pe)=>{if(!ve.listening)return;const me=k(ne),ge=_(me,ve.currentRoute.value);if(ge){E(xt(ge,{replace:!0,force:!0}),me).catch(Ol);return}c=me;const Ne=r.value;ki&&Qk(pf(Ne.fullPath,pe.delta),Yr()),O(me,Ne).catch(A=>Ba(A,$t.NAVIGATION_ABORTED|$t.NAVIGATION_CANCELLED)?A:Ba(A,$t.NAVIGATION_GUARD_REDIRECT)?(E(xt(y(A.to),{force:!0}),me).then(P=>{Ba(P,$t.NAVIGATION_ABORTED|$t.NAVIGATION_DUPLICATED)&&!pe.delta&&pe.type===bd.pop&&n.go(-1,!1)}).catch(Ol),Promise.reject()):(pe.delta&&n.go(-pe.delta,!1),D(A,me,Ne))).then(A=>{A=A||T(me,Ne,!1),A&&(pe.delta&&!Ba(A,$t.NAVIGATION_CANCELLED)?n.go(-pe.delta,!1):pe.type===bd.pop&&Ba(A,$t.NAVIGATION_ABORTED|$t.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),U(me,Ne,A)}).catch(Ol)}))}let W=fl(),M=fl(),L;function D(ne,ie,pe){oe(ne);const me=M.list();return me.length?me.forEach(ge=>ge(ne,ie,pe)):console.error(ne),Promise.reject(ne)}function le(){return L&&r.value!==mn?Promise.resolve():new Promise((ne,ie)=>{W.add([ne,ie])})}function oe(ne){return L||(L=!ne,Q(),W.list().forEach(([ie,pe])=>ne?pe(ne):ie()),W.reset()),ne}function z(ne,ie,pe,me){const{scrollBehavior:ge}=e;if(!ki||!ge)return Promise.resolve();const Ne=!pe&&Xk(pf(ne.fullPath,0))||(me||!pe)&&history.state&&history.state.scroll||null;return jt().then(()=>ge(ne,ie,Ne)).then(A=>A&&Yk(A)).catch(A=>D(A,ne,ie))}const Z=ne=>n.go(ne);let re;const K=new Set,ve={currentRoute:r,listening:!0,addRoute:m,removeRoute:h,clearRoutes:t.clearRoutes,hasRoute:I,getRoutes:b,resolve:k,options:e,push:x,replace:S,go:Z,back:()=>Z(-1),forward:()=>Z(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:M.add,isReady:le,install(ne){ne.component("RouterLink",AS),ne.component("RouterView",LS),ne.config.globalProperties.$router=ve,Object.defineProperty(ne.config.globalProperties,"$route",{enumerable:!0,get:()=>Ra(r)}),ki&&!re&&r.value===mn&&(re=!0,x(n.location).catch(me=>{}));const ie={};for(const me in mn)Object.defineProperty(ie,me,{get:()=>r.value[me],enumerable:!0});ne.provide(Qr,ve),ne.provide(Ru,Fd(ie)),ne.provide(xd,r);const pe=ne.unmount;K.add(ne),ne.unmount=function(){K.delete(ne),K.size<1&&(c=mn,$&&$(),$=null,r.value=mn,re=!1,L=!1),pe()}}};function Me(ne){return ne.reduce((ie,pe)=>ie.then(()=>w(pe)),Promise.resolve())}return ve}function pg(){return la(Qr)}function MS(e){return la(Ru)}const Xr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=MS(),s=pg(),a=H({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=H(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=H(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Jt(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},Ql=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),La=e=>Number.isSafeInteger(e)&&e>=0,DS=e=>e===null||typeof e=="string",kr=(e,t)=>La(e)&&La(t)&&t>=e,Iu=e=>Ql(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&DS(e.cursor);function PS(e){return!Iu(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&Ql(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!La(e.total_chars)||!La(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!kr(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&Ql(e.tail)&&typeof e.tail.text=="string"&&kr(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function Cf(e){return Iu(e)&&e.kind==="process_output"&&La(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>La(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&kr(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function $S(e){return Iu(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>La(e[t]))&&kr(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&La(e.tools_omitted)}function _d(e){try{return JSON.parse(e)}catch{return}}const wd=e=>JSON.stringify(e,null,2),FS=e=>{const t=_d(e);return t===void 0?e:wd(t)},Io=(e,t,s)=>`[${e}, ${t}) ${s}`;function fg(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:wd(e)??"";let a=typeof e=="string"?_d(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=_d(e.slice(d+c.length)),m=e.slice(0,u);Cf(p)&&!("text"in p)&&m.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?FS(d):d});if(Ql(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||La(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...La(a.original_chars)?[`original ${a.original_chars} code points`]:[]],Ql(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(PS(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${Io(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Io(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(Cf(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>Io(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if($S(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Io(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?wd(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function mg(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Lc=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),BS=e=>e!==null&&typeof e=="object",US=new Set(["_hmac","_prev_hmac"]),kd=e=>e.replace(/\r\n?/g,`
`);function Xl(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(US.has(n)){s=!0;return}return i});return kd(s?JSON.stringify(a):t)}catch{return kd(t)}}function zS(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&BS(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function HS(e){var m;const t=fg(typeof e=="string"?kd(e):e,{prettyPrint:!1}),s=t.sections.map(h=>({...h,text:Xl(h.text)})),a=s.map(h=>h.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Lc.inlineChars||o&&n.length>0,c=s.filter(h=>h.text).map(h=>{let b=h.text;try{b=JSON.stringify(JSON.parse(b),null,2)}catch{}return h.label?`${h.label}
${b}`:b}).join(`

`).replace(/\n$/,""),d=mg(c,Lc.previewLines,Lc.previewChars),u=t.kind==="audit_preview"?(m=t.metadata)==null?void 0:m.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:zS(t)}}const jS={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=H(()=>HS(e.value)),c=H(()=>{const x=e.rawValue===void 0?e.value:e.rawValue;return typeof x=="string"?x:JSON.stringify(x,null,2)??""}),d=H(()=>a.value?c.value:r.value.formatted),u=H(()=>r.value.promoted&&r.value.preview.folded||o.value),p=H(()=>t.value?!!d.value:r.value.promoted),m=H(()=>p.value?"":r.value.summary);let h;function b(){if(t.value)return;const x=r.value.promoted?i.value:l.value;o.value=!!(x&&(x.scrollHeight>x.clientHeight+1||x.scrollWidth>x.clientWidth+1))}function I(){h==null||h.disconnect();for(const x of[i.value,l.value])x&&(h==null||h.observe(x));b()}function k(){t.value=!t.value,t.value||(a.value=!1)}function y(){a.value=!a.value,t.value=!0,n.value=""}async function g(){const x=e.value;try{await navigator.clipboard.writeText(d.value),x===e.value&&(n.value="Copied")}catch{x===e.value&&(n.value="Copy unavailable — select text manually")}}return Jt([()=>e.value,()=>e.rawValue,()=>e.recordId],(x,S)=>{(e.recordId===null||x[2]!==S[2])&&(t.value=!1,a.value=!1),n.value=""}),Jt([i,l,t,s,r],()=>jt(I),{flush:"post"}),tt(()=>{h=new ResizeObserver(b),I()}),wt(()=>h==null?void 0:h.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:m,toggleExpanded:k,toggleRaw:y,copyOutput:g}},template:`
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
    </section>`},ec={name:"ToolOutput",components:{CompactOutput:jS},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=H(()=>fg(e.value)),l=H(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=H(()=>{let u=30,p=6e3;return l.value.map(m=>{const h=mg(m.text,u,p);return u=Math.max(0,u-h.lines),p=Math.max(0,p-h.chars),{...m,display:t.value?m.text:h.text,folded:h.folded}})}),r=H(()=>o.value.some(u=>u.folded)),c=H(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return Jt(()=>e.value,()=>{t.value=!1,n.value=""}),Jt(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},VS={components:{ToolOutput:ec},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var b,I,k,y,g,x,S,_,E,R,w;const m=p.payload||p,h=m.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(h)&&!(m.agent_id||(b=m.metadata)!=null&&b.agent_id))&&!(["loop_tool_start","loop_tool"].includes(h)&&!(m.call_id||(I=m.metadata)!=null&&I.call_id))){if(h==="tool_start"||h==="loop_tool_start"){const O=m.call_id||((k=m.metadata)==null?void 0:k.call_id)||null,U=m.agent_id||((y=m.metadata)==null?void 0:y.agent_id)||"",T={callId:O,agentId:U,agentLabel:m.agent_label||((g=m.metadata)==null?void 0:g.agent_label)||"",toolInput:m.tool_input,id:O?`${U}:${O}`:`${m.action}-${Date.now()}`,tool:m.action,actor:m.actor||"",channel:m.channel_id||"",iteration:m.iteration??((x=m.metadata)==null?void 0:x.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(T);return}if(h==="tool_end"||h==="loop_tool"){const O=m.call_id||((S=m.metadata)==null?void 0:S.call_id)||null,U=m.agent_id||((_=m.metadata)==null?void 0:_.agent_id)||"";let T=-1;if(O&&(T=e.value.findIndex($=>$.callId===O&&$.agentId===U&&$.status==="running")),T<0&&!O)for(let $=e.value.length-1;$>=0;$--){const Q=e.value[$];if(Q.tool===m.action&&Q.agentId===U&&Q.status==="running"){T=$;break}}if(T>=0){const $=e.value[T];$.status=m.error||(E=m.metadata)!=null&&E.error||["error","failed","cancelled","denied","outcome_unknown"].includes(m.status||((R=m.metadata)==null?void 0:R.status))?"error":"success",$.elapsed=m.execution_time_ms??m.duration_ms??((w=m.metadata)==null?void 0:w.elapsed_ms)??Date.now()-$.startTime,$.result=m.result_summary??m.detail??"",$.fadingOut=!0,setTimeout(()=>{const Q=e.value.indexOf($);Q>=0&&e.value.splice(Q,1),t.value.unshift($),t.value.length>a&&t.value.pop()},5e3)}return}if(h==="tool_stream"){const O=m.call_id||m.tool_name||"unknown";if(m.finished){const U={...s.value};delete U[O],s.value=U}else{const T=((s.value[O]||"")+(m.chunk||"")).split(`
`);s.value={...s.value,[O]:T.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(m=>{m.status==="running"&&(m.elapsed=p-m.startTime)})}let o=!1;function r(){o||(o=!0,ct.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,ct.off("events",n),i&&(clearInterval(i),i=null))}tt(r),rs(r),Zt(c),wt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Ou(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ai(e){const t=Ou(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function qS(e){const t=Ou(e);return t?t.toLocaleTimeString():"—"}function hg(e){const t=Ou(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function GS(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function Ji(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Lu(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function vg(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Tf(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Nu(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function gg(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const bg=Symbol("agent-detail-cancelled"),WS=15e3;function KS(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((m,h)=>{r=m,c=h});function u(m,h){o||(o=!0,l!==null&&n(l),l=null,(m?r:c)(h))}let p;try{p=e(i==null?void 0:i.signal)}catch(m){u(!1,m)}return o||Promise.resolve(p).then(m=>u(!0,m),m=>u(!1,m)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const m=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${m}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,bg),i==null||i.abort()}}}function yg({state:e,requestDetail:t,timeoutMs:s=WS,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:m,coalesce:h}){if(!p)return Promise.resolve();if(h&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const b={agentId:p,cancel:null,promise:null};l=b,m?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const I=KS(k=>t(p,{signal:k}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return b.cancel=I.cancel,b.promise=(async()=>{let k=null,y=null;try{k=await I.promise}catch(g){y=g}k!==bg&&(l!==b||e.detailId!==p||(l=null,!y&&(k===null||typeof k!="object")&&(y=new Error(`${a} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=k,e.detailError=null),e.detailLoading=!1))})(),b.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function JS({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const ZS={components:{ToolOutput:ec},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=H(()=>e.value.filter(D=>D.status==="running").length),r=H(()=>e.value.filter(D=>D.status==="completed").length),c=H(()=>e.value.filter(D=>["failed","timeout","killed"].includes(D.status)).length),d=H(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=H(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(D=>["failed","timeout","killed"].includes(D.status)):e.value.filter(D=>D.status===i.value));function p(D){const le=Number(D.max_iterations)||0;return le<=0?0:Math.min(100,Math.round(D.iteration_count/le*100))}function m(D){return(Number(D.max_iterations)||0)>0}function h(D,le){return D?D==="N/A"?"N/A":le==="current_inheritance"?`inherit (currently ${D})`:D:"unknown"}function b(D){return h(D.display_model,D.display_model_source||D.display_source)}function I(D){return h(D.display_reasoning_effort,D.display_reasoning_effort_source||D.display_source)}function k(D){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[D]||""}const y=f(null),g=f(null),x=f(!1),S=f(null),_=f(""),R=yg({state:{get detail(){return y.value},set detail(D){y.value=D},get detailId(){return g.value},set detailId(D){g.value=D},get detailLoading(){return x.value},set detailLoading(D){x.value=D},get detailError(){return S.value},set detailError(D){S.value=D}},requestDetail:(D,{signal:le})=>j.get(`/api/agents/${encodeURIComponent(D)}`,{signal:le})});async function w(D){_.value="",await R.open(D.id)}function O(){R.close(),_.value=""}async function U(){await R.refresh()}async function T(D,le){try{await navigator.clipboard.writeText(le||""),_.value=D,setTimeout(()=>{_.value===D&&(_.value="")},1500)}catch{Ce.error("Copy failed")}}async function $(D=!1){D=D===!0,D||(t.value=!0);try{const le=await j.get("/api/agents");e.value=Array.isArray(le)?le:[],s.value=null}catch(le){D||(s.value=le.message)}D||(t.value=!1)}async function Q(D){const le=e.value.find(z=>z.id===D);if(await os({title:"Kill agent",message:`Kill agent "${(le==null?void 0:le.label)||D}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=D;try{await j.del(`/api/agents/${encodeURIComponent(D)}`),Ce.success("Agent killed"),await $()}catch(z){Ce.error(z.message||"Failed to kill agent")}a.value=null}}const W=JS({isEnabled:()=>n.value&&l,refreshList:()=>$(!0),hasOpenDetail:()=>!!g.value,refreshDetail:U});function M(){W.start()}function L(){W.stop()}return Jt(n,()=>W.sync()),tt(()=>{l=!0,$(),M()}),rs(()=>{l=!0,$(!0),M()}),Zt(()=>{l=!1,L()}),wt(()=>{l=!1,L(),R.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ai,formatDuration:Ji,progressPercent:p,hasProgress:m,displayModelText:b,displayEffortText:I,displaySourceLabel:k,detail:y,detailId:g,detailLoading:x,detailError:S,copied:_,openDetail:w,closeDetail:O,copyText:T,fetchAgents:$,killAgent:Q,startAutoRefresh:M,stopAutoRefresh:L}}},YS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),m=f("");let h=!1;const I=yg({state:{get detail(){return c.value},set detail(L){c.value=L},get detailId(){return d.value},set detailId(L){d.value=L},get detailLoading(){return u.value},set detailLoading(L){u.value=L},get detailError(){return p.value},set detailError(L){p.value=L}},detailLabel:"Loop detail",requestDetail:(L,{signal:D})=>j.get(`/api/loops/${encodeURIComponent(L)}?limit=100`,{signal:D})});async function k(L){m.value="",await I.open(L.id)}function y(){I.close(),m.value=""}async function g(L,D){try{await navigator.clipboard.writeText(D||""),m.value=L,setTimeout(()=>{m.value===L&&(m.value="")},1500)}catch{Ce.error("Copy failed")}}const x=H(()=>e.value.reduce((L,D)=>L+(D.iteration_count||0),0)),S=H(()=>e.value.filter(L=>L.status==="running").length);function _(L){return L==="running"?"loop-status-running":L==="error"?"loop-status-error":"loop-status-stopped"}function E(L){return L==="running"?"badge-success":L==="error"?"badge-danger":L==="completed"?"badge-info":"badge-warning"}function R(L){return L==="act"?"badge-warning":L==="silent"?"badge-info":"badge-success"}async function w(L=!1){L=L===!0,L||(t.value=!0);try{const D=await j.get("/api/loops");e.value=Array.isArray(D)?D:[],s.value=null}catch(D){L||(s.value=D.message)}L||(t.value=!1)}async function O(){l.value=null;const L=n.value;if(!L.goal.trim()){l.value="Goal is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}const D={goal:L.goal.trim(),channel_id:L.channel_id.trim(),interval_seconds:L.interval_seconds||60,mode:L.mode,max_iterations:L.max_iterations||50};L.stop_condition.trim()&&(D.stop_condition=L.stop_condition.trim()),i.value=!0;try{const le=await j.post("/api/loops",D);Ce.success(`Loop started: ${le.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await w()}catch(le){l.value=le.message}i.value=!1}async function U(L){if(await os({title:"Stop loop",message:`Stop loop ${L}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=L;try{await j.del(`/api/loops/${encodeURIComponent(L)}`),Ce.success("Loop stopped"),await w()}catch(le){Ce.error(le.message||"Failed to stop loop")}o.value=null}}async function T(L){r.value=L;try{await j.post(`/api/loops/${encodeURIComponent(L)}/restart`),Ce.success("Loop restarted"),await w()}catch(D){Ce.error(D.message||"Failed to restart loop")}r.value=null}function $(L){h&&L.payload&&(L.payload.loop_id||L.payload.type==="loop")&&(w(!0),d.value&&I.refresh())}let Q=null;function W(){Q!==null&&clearInterval(Q),Q=null}function M(){W(),h&&(Q=setInterval(()=>{w(!0),d.value&&I.refresh()},5e3))}return tt(()=>{h=!0,w(),ct.subscribe("events",$),M()}),rs(()=>{h=!0,w(!0),M()}),Zt(()=>{h=!1,W()}),wt(()=>{h=!1,ct.unsubscribe("events",$),W(),I.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:m,totalIterations:x,runningCount:S,statusDotClass:_,statusBadge:E,modeBadge:R,formatAge:hg,formatDuration:Ji,formatTs:ai,formatTokens:gg,openDetail:k,closeDetail:y,copyText:g,fetchLoops:w,doCreate:O,doStop:U,doRestart:T}}},QS={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=H(()=>e.value.filter(y=>y.status==="running").length),o=H(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await j.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Jt(a,y=>{y?u():p()});async function m(y){if(await os({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await j.del(`/api/processes/${y}`),Ce.success(`Process ${y} killed`),await d()}catch(x){Ce.error(x.message||"Failed to kill process")}i.value=null}}function h(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let b=!1;function I(){b||(b=!0,d(),ct.subscribe("events",h),u())}function k(){b&&(b=!1,ct.unsubscribe("events",h),p())}return tt(I),rs(I),Zt(k),wt(k),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:Ji,fetchProcesses:d,doKill:m}}},XS=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Ef(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function e1(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function t1(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function s1(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=XS.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),m=new Date(u+864e5).getTimezoneOffset(),h=[];for(const I of new Set([p,m])){const k=new Date(u+I*6e4);e1(k,c)===d&&(h.some(y=>y.getTime()===k.getTime())||h.push(k))}if(h.sort((I,k)=>I.getTime()-k.getTime()),h.length===0)return{state:"nonexistent",typed:t};if(h.length>1)return{state:"ambiguous",typed:t,options:h.map(I=>({instant:I,offset:t1(I),iso:I.toISOString()}))};const b=h[0];return{state:"ok",typed:t,instant:b,iso:b.toISOString()}}const a1=5e3;function Ko(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function Oo(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function Af(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:Ko(e.data.connection)}function n1(e){return e!=="webhook"}function Rf(e,t){return!n1(t)||(e==null?void 0:e.available)===!0}const i1={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(Ko(null)),n=H(()=>a.value.available),i=H(()=>Oo(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""}),c=f(!1),d=f(null),u=H(()=>Rf(a.value,r.value.action));function p(B){return Rf(a.value,B)}const m=f(null),h=H(()=>s1(r.value.run_at));Jt(()=>r.value.run_at,()=>{m.value=null});const b=H(()=>{var J;const B=h.value;return B.state==="ok"?B.instant:B.state==="ambiguous"&&m.value!==null&&((J=B.options[m.value])==null?void 0:J.instant)||null}),I=H(()=>{const B=b.value;return B?`${B.toLocaleString()} local — ${B.toISOString()} UTC`:""}),k=f(null),y=f(!1),g=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],x=f(null),S=f(null),_=f(null),E=f(null),R=f(null),w=f(null),O=f([]),U=f(!1),T=f("");let $=0;const Q=H(()=>e.value.filter(B=>B.cron&&!B.one_time).length),W=H(()=>e.value.filter(B=>B.one_time).length),M=H(()=>e.value.filter(B=>B.trigger).length),L=H(()=>e.value.filter(B=>B.paused).length),D=H(()=>e.value.filter(B=>B.consecutive_failures>0).length);function le(B){if(!B)return"-";const J=Date.now(),V=(new Date(B).getTime()-J)/1e3;if(V<0)return"overdue";if(V<60)return"in < 1 min";if(V<3600)return`in ${Math.floor(V/60)} min`;if(V<86400){const te=Math.floor(V/3600),be=Math.floor(V%3600/60);return be>0?`in ${te}h ${be}m`:`in ${te}h`}const ee=Math.floor(V/86400);return`in ${ee} day${ee!==1?"s":""}`}function oe(B){return B==null?"-":B<1e3?`${B}ms`:B<6e4?`${(B/1e3).toFixed(1)}s`:Ji(B/1e3)}function z(B=r.value.cron){r.value.cron=B,Ef(r.value,"cron"),k.value=null}function Z(B=r.value.run_at){r.value.run_at=B,Ef(r.value,"run_at"),k.value=null}async function re(){const B=r.value.cron.trim();if(B){y.value=!0;try{k.value=await j.post("/api/schedules/validate-cron",{expression:B})}catch(J){k.value={valid:!1,error:J.message}}y.value=!1}}async function K(){t.value=!0,s.value=null;try{e.value=await j.get("/api/schedules")}catch(B){s.value=B.message}t.value=!1}async function ve(){try{a.value=Ko(await j.get("/api/schedules/status"))}catch(B){a.value=Af(B)||Ko(null)}}function Me(B){const J=Af(B);J&&(a.value=J)}async function ne(B){if(w.value===B){w.value=null,O.value=[];return}w.value=B,U.value=!0,O.value=[];const J=++$;try{const ue=await j.get(`/api/schedules/${encodeURIComponent(B)}/history?limit=10`);if(J!==$||w.value!==B)return;O.value=ue,T.value=""}catch(ue){if(J!==$||w.value!==B)return;O.value=[],T.value=ue.message||"Failed to load execution history"}J===$&&(U.value=!1)}async function ie(){if(d.value=null,!p(r.value.action)){d.value=Oo(a.value);return}const B=r.value;if(!B.description.trim()){d.value="Description is required";return}if(B.action!=="webhook"&&!B.channel_id.trim()){d.value="Channel ID is required";return}if(!B.cron.trim()&&!B.run_at.trim()){d.value="Cron expression or run_at time is required";return}if(B.cron.trim()&&B.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const J={description:B.description.trim(),action:B.action,channel_id:B.channel_id.trim()};if(B.cron.trim()&&(J.cron=B.cron.trim()),B.run_at.trim()){const ue=h.value;if(ue.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){d.value="One-time run time is not a valid date";return}const V=b.value;if(ue.state==="ambiguous"&&m.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!V){d.value="One-time run time could not be resolved";return}J.run_at=V.toISOString()}if(B.action==="reminder"&&B.message.trim()&&(J.message=B.message.trim()),B.action==="check"&&(B.tool_name.trim()&&(J.tool_name=B.tool_name.trim()),B.report_format&&(J.report_format=B.report_format),B.tool_input_str.trim()))try{J.tool_input=JSON.parse(B.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}if(B.action==="webhook"){if(!B.webhook_url.trim()){d.value="Webhook URL is required";return}const ue={url:B.webhook_url.trim(),method:B.webhook_method};if(B.webhook_headers_str.trim())try{const V=JSON.parse(B.webhook_headers_str.trim());if(!V||Array.isArray(V)||typeof V!="object")throw new Error("not an object");ue.headers=V}catch{d.value="Webhook headers must be a valid JSON object";return}if(B.webhook_body&&(ue.body=B.webhook_body),B.webhook_expected_status_str.trim()){const V=B.webhook_expected_status_str.split(",").map(ee=>Number(ee.trim()));if(V.some(ee=>!Number.isInteger(ee)||ee<100||ee>599)){d.value="Expected status codes must be comma-separated HTTP codes";return}ue.expected_status_codes=V}J.webhook_config=ue}c.value=!0;try{await j.post("/api/schedules",J),Ce.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""},k.value=null,o.value=!1,await K()}catch(ue){Me(ue),d.value=ue.message}c.value=!1}async function pe(B){if(!p(B.action)){Ce.error(Oo(a.value));return}const J=B.id;x.value=J;try{const ue=await j.post(`/api/schedules/${encodeURIComponent(J)}/run`);if(ue.status==="failure")Ce.error(`Execution failed: ${ue.error||"unknown error"}`);else{const V=ue.warning?`Executed (${ue.warning})`:"Executed successfully";Ce.success(V)}await K()}catch(ue){Me(ue),Ce.error(ue.message||"Failed to trigger")}x.value=null}async function me(B){if(B.paused&&!p(B.action)){Ce.error(Oo(a.value));return}_.value=B.id;const J=!B.paused;try{await j.put(`/api/schedules/${encodeURIComponent(B.id)}`,{paused:J}),Ce.success(J?"Schedule paused":"Schedule resumed"),await K()}catch(ue){Me(ue),Ce.error(ue.message||"Failed to update schedule")}_.value=null}const ge=new Map;function Ne(B,J){const ue=ge.get(B.id);ue&&clearTimeout(ue.timer);const V={run:()=>A(B,J),timer:null};V.timer=setTimeout(()=>{ge.delete(B.id),V.run()},500),ge.set(B.id,V)}async function A(B,J){R.value=B.id;try{await j.put(`/api/schedules/${encodeURIComponent(B.id)}`,{report_format:J}),Ce.success(J?"Structured report enabled":"Plain-text report enabled")}catch(ue){Ce.error(`Update failed: ${ue.message}`)}finally{await K(),R.value=null}}function P(){for(const[B,J]of[...ge])clearTimeout(J.timer),ge.delete(B),J.run()}async function q(B){E.value=B;try{await j.post(`/api/schedules/${encodeURIComponent(B)}/reset-failures`),Ce.success("Failure counters reset"),await K()}catch(J){Ce.error(J.message||"Failed to reset")}E.value=null}async function fe(B){const J=e.value.find(V=>V.id===B);if(await os({title:"Delete schedule",message:`Delete "${(J==null?void 0:J.description)||B}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){S.value=B;try{await j.del(`/api/schedules/${encodeURIComponent(B)}`),Ce.success("Schedule deleted"),await K()}catch(V){Ce.error(V.message||"Failed to delete schedule")}S.value=null}}return tt(()=>{K(),ve(),l=setInterval(ve,a1)}),wt(()=>{P(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,selectedActionAvailable:u,actionAvailable:p,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:I,runAtAnalysis:h,runAtOccurrence:m,cronResult:k,validatingCron:y,cronPresets:g,runningId:x,deletingId:S,togglingId:_,resettingId:E,reportUpdatingId:R,flushReportFormatTimers:P,expandedId:w,history:O,historyLoading:U,historyError:T,cronCount:Q,oneTimeCount:W,webhookCount:M,pausedCount:L,failingCount:D,formatTs:ai,formatAge:hg,formatFuture:le,formatMs:oe,formatDuration:Ji,onCronInput:z,onRunAtInput:Z,validateCron:re,toggleExpand:ne,fetchSchedules:K,fetchSchedulingAvailability:ve,doCreate:ie,doRunNow:pe,doTogglePause:me,doUpdateReportFormat:Ne,doResetFailures:q,doDelete:fe}}},xg=[{id:"live",label:"Live",component:VS},{id:"agents",label:"Agents",component:ZS},{id:"loops",label:"Loops",component:YS},{id:"processes",label:"Processes",component:QS},{id:"schedules",label:"Schedules",component:i1}],l1={components:{TabbedPage:Xr},setup(){return{tabs:xg}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},o1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(h){if(!h)return"";if(typeof h=="string")return h;try{return JSON.stringify(h,null,2)}catch{return String(h)}}function l(h){a.value=a.value===h?null:h}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},m()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await j.get("/api/audit/verify")}catch(h){h.status===409&&h.data&&typeof h.data=="object"?d.value=h.data.availability==="not_enabled"?{...h.data,not_enabled:!0}:h.data:(d.value=null,u.value=h.message||"verification request failed")}c.value=!1}async function m(){const h=++r;t.value=!0,s.value=null,a.value=null;try{const b=new URLSearchParams;n.value.tool&&b.set("tool",n.value.tool),n.value.user&&b.set("user",n.value.user),n.value.keyword&&b.set("q",n.value.keyword),n.value.date&&b.set("date",n.value.date),b.set("limit",String(n.value.limit));const I=b.toString(),k=await j.get(`/api/audit${I?"?"+I:""}`);if(h!==r)return;e.value=Array.isArray(k)?k:[]}catch(b){if(h!==r)return;s.value=b.message}h===r&&(t.value=!1)}return tt(()=>{m()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:ai,formatDetail:i,truncateBlock:vg,toggleExpand:l,clearFilters:o,fetchAudit:m,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},If=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],r1=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],c1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),m=f("last_active"),h=f(!1),b=If,I=r1,k=f([]),y=f(!1),g=f(""),x=f("flat"),S=f(new Set),_=f(""),E=f(""),R=f(""),w=f(null),O=f(!1),U=f(""),T=f(!1);let $=0;Jt([_,E,R],()=>{$++,O.value=!1,U.value="",T.value=w.value!==null},{flush:"sync"});function Q(){try{const se=localStorage.getItem("odin-session-presets");se&&(k.value=JSON.parse(se))}catch{}}function W(){try{localStorage.setItem("odin-session-presets",JSON.stringify(k.value))}catch{}}const M=H(()=>p.value.trim()!==""||u.value!=="all"),L=H(()=>{let se=[...e.value];const Oe=If.find(ft=>ft.id===u.value),Ue=Oe?Oe.filters:{};if(Ue.source&&(se=se.filter(ft=>ft.source===Ue.source)),Ue.minMessages&&(se=se.filter(ft=>ft.message_count>=Ue.minMessages)),Ue.hasCompaction&&(se=se.filter(ft=>ft.has_summary)),Ue.maxAge!=null){const ft=Date.now()/1e3;se=se.filter(yt=>yt.last_active&&ft-yt.last_active<=Ue.maxAge)}if(p.value.trim()){const ft=p.value.toLowerCase().trim();se=se.filter(yt=>(yt.channel_id||"").toLowerCase().includes(ft)||(yt.last_user_id||"").toLowerCase().includes(ft)||(yt.source||"").toLowerCase().includes(ft))}const dt=m.value,Bt=h.value?1:-1;return se.sort((ft,yt)=>{const Qt=ft[dt]||0,cs=yt[dt]||0;return(Qt-cs)*Bt}),se}),D=H(()=>{if(!n.value||!n.value.messages)return[];const se=n.value.messages;if(se.length===0)return[];const Oe=[];let Ue=[];for(const dt of se)dt.role==="user"&&Ue.length>0&&(Oe.push(Ue),Ue=[]),Ue.push(dt);return Ue.length>0&&Oe.push(Ue),Oe}),le=H(()=>L.value.length>0&&c.value.size===L.value.length);function oe(se){const Oe=se.find(Ue=>Ue.role==="user");if(Oe&&Oe.content){const Ue=Oe.content.slice(0,120);return Ue.length<Oe.content.length?Ue+"...":Ue}return"(no user message)"}function z(se){const Oe=new Set(S.value);Oe.has(se)?Oe.delete(se):Oe.add(se),S.value=Oe}function Z(se){u.value=se}function re(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(m.value=se.filters.sortBy)}function K(){if(!g.value.trim())return;const se={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:m.value}};k.value=[...k.value,se],W(),y.value=!1,g.value=""}function ve(se){k.value=k.value.filter(Oe=>Oe.id!==se),W(),u.value===se&&(u.value="all")}function Me(){u.value="all",p.value="",m.value="last_active",h.value=!1}function ne(se){if(!se)return"—";const Oe=Date.now()/1e3-se;if(Oe<60)return"just now";if(Oe<3600){const dt=Math.floor(Oe/60);return`${dt} minute${dt!==1?"s":""} ago`}if(Oe<86400){const dt=Math.floor(Oe/3600);return`${dt} hour${dt!==1?"s":""} ago`}const Ue=Math.floor(Oe/86400);return`${Ue} day${Ue!==1?"s":""} ago`}function ie(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function pe(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function me(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function ge(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Ne(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function A(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function P(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function q(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function fe(){const se=_.value.trim();if(!se)return;const Oe=++$;O.value=!0,U.value="",T.value=w.value!==null;try{let Ue=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;E.value.trim()&&(Ue+=`&channel_id=${encodeURIComponent(E.value.trim())}`),R.value.trim()&&(Ue+=`&user_id=${encodeURIComponent(R.value.trim())}`);const dt=await j.get(Ue);if(Oe!==$)return;w.value=dt.results||[],T.value=!1}catch(Ue){if(Oe!==$)return;U.value=Ue.message||"Search failed. Please retry."}finally{Oe===$&&(O.value=!1)}}function B(){$++,_.value="",E.value="",R.value="",w.value=null,U.value="",T.value=!1,O.value=!1}function J(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ue(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function V(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let ee=0;async function te(){const se=++ee;t.value=!0,s.value=null;try{const Oe=await j.get("/api/sessions");if(se!==ee)return;e.value=Oe}catch(Oe){if(se!==ee)return;s.value=Oe.message}se===ee&&(t.value=!1)}function be(){s.value=null,te()}async function he(se){if(a.value===se){a.value=null,n.value=null,S.value=new Set;return}a.value=se,n.value=null,i.value=!0,S.value=new Set;const Oe=++l;try{const Ue=await j.get(`/api/sessions/${encodeURIComponent(se)}`);Oe===l&&a.value===se&&(n.value=Ue)}catch(Ue){Oe===l&&a.value===se&&(n.value={messages:[],summary:"",error:Ue.message||"Failed to load session"})}finally{Oe===l&&(i.value=!1)}}function we(se){const Oe=new Set(c.value);Oe.has(se)?Oe.delete(se):Oe.add(se),c.value=Oe}function _e(){le.value?c.value=new Set:c.value=new Set(L.value.map(se=>se.channel_id))}function ye(se){o.value=se}async function Ke(){if(o.value){r.value=!0;try{await j.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await te()}catch(se){s.value=se.message||"Failed to clear session"}r.value=!1,o.value=null}}function je(){d.value=!0}async function Fe(){if(c.value.size!==0){r.value=!0;try{await j.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await te()}catch(se){s.value=se.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Ge(se,Oe){const Ue=`/api/sessions/${encodeURIComponent(se)}/export?format=${Oe}`;try{const dt=await j.getBlob(Ue),Bt=URL.createObjectURL(dt),ft=document.createElement("a");ft.href=Bt,ft.download=`session-${se}.${Oe==="text"?"txt":"json"}`,ft.click(),URL.revokeObjectURL(Bt)}catch(dt){s.value=dt.message||"Failed to export session"}}let st=null;function Ye(se){se.payload&&se.payload.channel_id&&(clearTimeout(st),st=setTimeout(()=>{if(te(),a.value&&se.payload.channel_id===a.value){const Oe=a.value,Ue=l;j.get(`/api/sessions/${encodeURIComponent(Oe)}`).then(dt=>{Ue!==l||a.value!==Oe||(n.value=dt)}).catch(()=>{})}},2e3))}let Y=!1,Te=null;function Ee(){Y||(Y=!0,te(),ct.subscribe("events",Ye),Te=ct.onReconnected(()=>te()))}tt(()=>{Q(),Ee()}),rs(()=>{Ee()});function Le(){Y&&(Y=!1,ct.unsubscribe("events",Ye),Te&&(Te(),Te=null),clearTimeout(st))}return Zt(Le),wt(Le),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:le,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:m,sortAsc:h,filterPresets:b,sortOptions:I,filteredSessions:L,hasActiveFilters:M,customPresets:k,showSavePreset:y,newPresetName:g,threadView:x,threads:D,collapsedThreads:S,ftsQuery:_,ftsChannelId:E,ftsUserId:R,ftsResults:w,ftsSearching:O,ftsError:U,ftsStale:T,formatAge:ne,formatTimestamp:ie,formatFullTimestamp:pe,messageClass:me,threadMsgClass:ge,roleBadge:Ne,roleDotClass:A,roleLabelClass:P,truncateContent:q,threadSummary:oe,fetchSessions:te,retry:be,toggleSession:he,toggleSelect:we,toggleSelectAll:_e,confirmClear:ye,clearSession:Ke,confirmBulkClear:je,doBulkClear:Fe,exportSession:Ge,applyPreset:Z,applyCustomPreset:re,saveCustomPreset:K,removeCustomPreset:ve,resetFilters:Me,toggleThread:z,runFtsSearch:fe,clearFtsSearch:B,highlightSnippet:J,ftsResultClass:ue,ftsTypeBadge:V}}},d1={props:["trace"],template:`
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
  `,setup(){return{formatTokens:gg}}},u1={components:{ContextAssemblyPanel:d1},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(E){if(!E)return"—";try{const R=new Date(E);return isNaN(R.getTime())?E:R.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return E}}function p(E){return!E&&E!==0?"—":E<1e3?E+"ms":(E/1e3).toFixed(1)+"s"}function m(E){return!E&&E!==0?"—":E>=1e3?(E/1e3).toFixed(1)+"k":String(E)}function h(E){if(!E)return"";if(typeof E=="string")return E;try{return JSON.stringify(E,null,2)}catch{return String(E)}}function b(E){n.value===E?n.value=null:(n.value=E,c.value={})}function I(E,R){const w=E+"-"+R;c.value={...c.value,[w]:!c.value[w]}}function k(E,R){return!!c.value[E+"-"+R]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,S()}async function g(){try{const E=await j.get("/api/trajectories");e.value=E.files||[],r.value=E.count||0}catch{}}let x=0;async function S(){const E=++x;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const R=await j.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(E!==x)return;let w=R.entries||[];d.value.tool_name&&(w=w.filter(O=>(O.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(w=w.filter(O=>O.is_error)),d.value.channel_id&&(w=w.filter(O=>O.channel_id===d.value.channel_id)),d.value.user_id&&(w=w.filter(O=>O.user_id===d.value.user_id)),t.value=w}else{const R=new URLSearchParams;d.value.channel_id&&R.set("channel_id",d.value.channel_id),d.value.user_id&&R.set("user_id",d.value.user_id),d.value.tool_name&&R.set("tool_name",d.value.tool_name),d.value.errors_only&&R.set("errors_only","true"),R.set("limit",String(d.value.limit));const w=R.toString(),O=await j.get(`/api/trajectories/search/query?${w}`);if(E!==x)return;t.value=O.results||[]}}catch(R){if(E!==x)return;a.value=R.message}E===x&&(s.value=!1)}async function _(){if(!l.value.trim())return;const E=++x;s.value=!0,a.value=null,c.value={};try{const R=await j.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(E!==x)return;i.value=R.entry||null,i.value||(a.value="No trace found for this message ID")}catch(R){if(E!==x)return;R.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=R.message}E===x&&(s.value=!1)}return tt(async()=>{await g(),await S()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:m,formatJSON:h,truncateBlock:vg,toggleExpand:b,toggleIteration:I,isIterationExpanded:k,clearFilters:y,fetchFiles:g,fetchTraces:S,lookupMessage:_}}};function p1(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function f1(e){return e?`${e.approximate?"~":""}${Nu(e.total||0)}`:"0"}const m1={template:`
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

        <section class="hm-card mt-4" aria-labelledby="usage-cost-heading">
          <h3 id="usage-cost-heading" class="text-sm font-semibold text-slate-300">Provider-reported actual cost</h3>
          <p class="text-xl text-white mt-2">{{ formatActualCost(data.cost?.actual_spend_usd) }}</p>
          <p class="text-xs text-slate-500 mt-1">{{ data.cost?.note || 'No provider-reported cost in this range.' }}</p>
          <div v-if="(data.upstream_cache || []).length" class="mt-3 space-y-1 text-xs text-slate-400">
            <div v-for="row in data.upstream_cache" :key="row.model + ':' + row.upstream_provider">
              {{ row.model }} via {{ row.upstream_provider }} · {{ row.cached_percent }}% cached · {{ fmtNum(row.samples) }} measured generations
            </div>
          </div>
        </section>
      </div>
    </div>
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=H(()=>a.value.work||{}),m=E=>E==null?"Not reported":`$${Number(E).toFixed(6)}`,h=H(()=>Math.max(1,...(a.value.activity_over_time||[]).map(E=>Number(E.count||0)))),b=H(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),I=E=>({height:`${Math.max(4,Math.round(Number(E||0)/h.value*100))}%`}),k=H(()=>s.value&&l.value-i.value>3e4);async function y(){const E=++d,R=n.value;try{const w=await j.get(`/api/usage?range=${encodeURIComponent(R)}`);if(E!==d||R!==n.value)return;a.value=w,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(w){E===d&&(t.value=w.message)}finally{E===d&&(e.value=!1)}}function g(E){n.value=E,e.value=!s.value,y()}function x(){e.value=!0,y()}function S(){c||(c=!0,y(),o=setInterval(y,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function _(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return tt(S),rs(S),Zt(_),wt(_),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:k,fmtNum:Nu,fmtDuration:p1,tokenLabel:f1,formatActualCost:m,activityTrackStyle:b,activityBar:I,selectRange:g,retry:x}}},_g=[{id:"audit",label:"Audit",component:o1},{id:"sessions",label:"Sessions",component:c1},{id:"traces",label:"Traces",component:u1},{id:"usage",label:"Usage & Activity",component:m1}],h1={components:{TabbedPage:Xr},setup(){return{tabs:_g}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Nc=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],v1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(w){return w.source!=="builtin"?"":u[w.state]||""}function m(w,O){const U=w&&Array.isArray(w.tools)?w.tools:null;if(c.value=!!U,r.value=U?!!w.global_enabled:null,!U){e.value=O.map(Q=>({...Q,source:"unknown",enabled:void 0,state:null}));return}const T=new Set(U.map(Q=>Q.name)),$=O.filter(Q=>!T.has(Q.name)).map(Q=>({...Q,source:Q.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...U.map(Q=>({...Q,source:"builtin"})),...$]}async function h(w,O){if(d.value.has(w.name))return;const U=!!O.target.checked,T=new Set(d.value);T.add(w.name),d.value=T;try{const $=await j.post(`/api/tools/builtins/${encodeURIComponent(w.name)}/enabled`,{enabled:U});m($,e.value),s.value=null;try{const Q=await j.get("/api/tools");m($,Q)}catch(Q){console.warn("Built-in toggle committed; visible catalog refresh failed",Q)}}catch($){O.target.checked=!!w.enabled,s.value=$.message||`Failed to toggle ${w.name}`}finally{const $=new Set(d.value);$.delete(w.name),d.value=$}}const b=H(()=>e.value.filter(w=>w.source==="builtin"&&w.is_core).length),I=H(()=>e.value.filter(w=>w.source==="skill").length),k=H(()=>Object.values(n.value).reduce((w,O)=>w+O,0));function y(w){for(const O of Nc)if(O.id!=="other"&&O.match(w))return O.id;return"other"}const g=H(()=>{let w=e.value;if(a.value){const O=a.value.toLowerCase();w=w.filter(U=>U.name.toLowerCase().includes(O)||(U.description||"").toLowerCase().includes(O))}return o.value&&(w=w.filter(O=>y(O.name)===o.value)),w}),x=H(()=>{const w=new Set;for(const O of e.value)w.add(y(O.name));return Nc.filter(O=>w.has(O.id))}),S=H(()=>{const w=g.value,O={};for(const T of w){const $=y(T.name);O[$]||(O[$]=[]),O[$].push(T)}const U=[];for(const T of Nc)O[T.id]&&O[T.id].length>0&&U.push({label:T.label,icon:T.icon,tools:O[T.id].sort(($,Q)=>$.name.localeCompare(Q.name))});return U});function _(w){i.value={...i.value,[w]:!i.value[w]}}async function E(){t.value=!0,s.value=null;try{const[w,O,U]=await Promise.all([j.get("/api/tools"),j.get("/api/tools/stats").catch(()=>({})),j.get("/api/tools/builtins").catch(()=>null)]);m(U,w),n.value=O||{}}catch(w){s.value=w.message}t.value=!1}function R(){E()}return tt(()=>{E()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:b,skillCount:I,totalUsage:k,filteredTools:g,groupedTools:S,usedCategories:x,stateBadge:p,applyInventory:m,toggleBuiltinTool:h,truncate:Lu,toggleExpand:_,refresh:R}}};function g1(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function b1(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const y1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),m=f(null),h=f(!1),b=f(null),I=f(null),k=f(!1),y=H(()=>e.value.length),g=H(()=>e.value.reduce((K,ve)=>K+(ve.execution_count||0),0)),x=H(()=>e.value.reduce((K,ve)=>K+O(ve.code),0)),S=H(()=>{if(!l.value)return e.value;const K=l.value.toLowerCase();return e.value.filter(ve=>ve.name.toLowerCase().includes(K)||(ve.description||"").toLowerCase().includes(K))}),_=H(()=>u.value?u.value.split(`
`).length:0),E=H(()=>{const K=Math.max(_.value,1);return Array.from({length:K},(ve,Me)=>Me+1).join(`
`)}),R=H(()=>{const K=u.value.trim();return K?K.includes("SKILL_DEFINITION")?K.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function w(K){return g1(K)}function O(K){return K?K.split(`
`).length:0}function U(K){return b1(K)}function T(K){a.value={...a.value,[K]:!a.value[K]}}async function $(K){try{await navigator.clipboard.writeText(K);const ve=e.value.find(Me=>Me.code===K);ve&&(o.value=ve.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function Q(K){if(K.key==="Tab"){K.preventDefault();const ve=K.target,Me=ve.selectionStart,ne=ve.selectionEnd;u.value=u.value.substring(0,Me)+"    "+u.value.substring(ne),jt(()=>{ve.selectionStart=ve.selectionEnd=Me+4})}}function W(K){const ve=K.target.previousElementSibling;ve&&(ve.scrollTop=K.target.scrollTop)}async function M(){t.value=!0,s.value=null;try{e.value=await j.get("/api/skills")}catch(K){s.value=K.message}t.value=!1}async function L(K){i.value=K,delete n.value[K],n.value={...n.value};try{const ve=await j.post(`/api/skills/${encodeURIComponent(K)}/test`);n.value={...n.value,[K]:ve}}catch(ve){n.value={...n.value,[K]:{result:ve.message,is_error:!0}}}i.value=null}function D(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,m.value=null}function le(K){r.value=!0,c.value="edit",d.value=K.name,u.value=K.code||"",p.value=null,m.value=null}function oe(){r.value=!1,p.value=null,m.value=null}async function z(){p.value=null,m.value=null;const K=d.value.trim(),ve=u.value.trim();if(!K){p.value="Name is required";return}if(!ve){p.value="Code is required";return}h.value=!0;try{c.value==="create"?(await j.post("/api/skills",{name:K,code:ve}),m.value="Skill created successfully"):(await j.put(`/api/skills/${encodeURIComponent(K)}`,{code:ve}),m.value="Skill updated successfully"),await M(),setTimeout(()=>{r.value=!1},800)}catch(Me){p.value=Me.message}h.value=!1}function Z(K){I.value=K}async function re(){if(I.value){k.value=!0;try{await j.del(`/api/skills/${encodeURIComponent(I.value)}`),await M()}catch(K){Ce.error(`Failed to delete skill: ${K.message||"unknown error"}`)}k.value=!1,I.value=null}}return tt(()=>{M()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:m,saving:h,editorRef:b,deleteTarget:I,deleting:k,enabledCount:y,totalExecutions:g,totalLines:x,displayedSkills:S,editLineCount:_,editorLineNums:E,editValidation:R,highlight:w,truncate:Lu,formatTs:ai,countLines:O,getLineNumbers:U,toggleCode:T,copyCode:$,handleEditorKey:Q,syncScroll:W,fetchSkills:M,testSkill:L,showCreate:D,editSkill:le,cancelEdit:oe,saveSkill:z,confirmDelete:Z,doDelete:re}}};class aa extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const x1=/^[A-Za-z_][A-Za-z0-9_]*$/;function Of(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Lf(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new aa(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new aa(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new aa(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new aa(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function _1(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function w1(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new aa("Server name is required.","name");if(n.length>128||!x1.test(n))throw new aa("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new aa("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=Of(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new aa("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new aa("An HTTP endpoint is required for this connection.","url");if(d&&!_1(d))throw new aa("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new aa("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=Of(e.allowlistText));const r=Lf(e.headerRows,e.headersRemove,"Header"),c=Lf(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function k1(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function S1(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function C1(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const T1=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function E1(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const A1=1e4,R1=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Mc(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function I1(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const O1={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=H(()=>Object.keys(i.value).every(Y=>{var Te;return Number.isInteger((Te=e.value)==null?void 0:Te[Y])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),m=f({}),h=f(new Set),b=f(!1),I=f("add"),k=f(""),y=f(null),g=f(Mc()),x=f(""),S=f(!1);let _=null,E=0,R=!1,w=!1;const O=T1,U=H(()=>{var Y;return((Y=e.value)==null?void 0:Y.servers)||[]}),T=H(()=>{var Y;return!!((Y=e.value)!=null&&Y.enabled)}),$=H(()=>{var Y,Te,Ee,Le;return{serverCount:((Y=e.value)==null?void 0:Y.server_count)||0,enabledCount:((Te=e.value)==null?void 0:Te.enabled_server_count)||0,connectedCount:((Ee=e.value)==null?void 0:Ee.connected_count)||0,toolCount:((Le=e.value)==null?void 0:Le.published_tool_count)||0}}),Q=H(()=>{var Y;return((Y=y.value)==null?void 0:Y.header_keys)||[]}),W=H(()=>{var Y;return((Y=y.value)==null?void 0:Y.env_keys)||[]}),M=H(()=>{var Y;return I.value==="edit"&&((Y=y.value)==null?void 0:Y.transport)==="http"}),L=H(()=>I.value==="add"||!M.value),D=H(()=>M.value?"Replace endpoint URL":"Endpoint URL"),le=H(()=>M.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function oe(){z(),_=window.setInterval(()=>Z({quiet:!0}),A1)}function z(){_&&window.clearInterval(_),_=null}async function Z({quiet:Y=!1}={}){if(a.value)return;const Te=++E;Y||(t.value=!0);try{const Ee=await j.get("/api/mcp/status");if(Te!==E||!R)return;e.value=Ee;for(const se of Object.keys(i.value))!l.value.has(se)&&Number.isInteger(Ee[se])&&(i.value[se]=String(Ee[se]));r.value="";const Le=new Set((Ee.servers||[]).map(se=>se.name));d.value=new Set([...d.value].filter(se=>Le.has(se)))}catch(Ee){Te===E&&R&&(r.value=Ee.message||"Failed to load MCP status")}finally{Te===E&&(t.value=!1)}}function re(Y){return s.value||c.value.has(Y)}function K(Y,Te){const Ee=new Set(c.value);Te?Ee.add(Y):Ee.delete(Y),c.value=Ee}function ve(Y){return S1(Y.state)}function Me(Y){if(ve(Y)==="disabled"){if(!Y.enabled)return"Disabled — server switch off";if(!T.value)return"Disabled — global MCP is off"}return R1[ve(Y)]}function ne(Y){return Y.transport==="http"?"Streamable HTTP":"stdio"}function ie(Y){return Y.negotiated_version?`${Y.era?`${String(Y.era).charAt(0).toUpperCase()}${String(Y.era).slice(1)}`:"Protocol"} · ${Y.negotiated_version}`:"Not negotiated"}function pe(Y){return Y.discovered_count?`${Y.published_count||0} published · ${Y.excluded_count||0} excluded`:"No tools discovered"}const me=f(new Set);async function ge(Y,Te){if(me.value.has(Y.name))return;const Ee=!!Te.target.checked,Le=new Set(me.value);Le.add(Y.name),me.value=Le;try{const se=await j.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/enabled`,{enabled:Ee});se&&Array.isArray(se.servers)?e.value=se:await Z({quiet:!0})}catch(se){Te.target.checked=!!Y.enabled,Ce.error(se.message||`Failed to toggle ${Y.name}`)}finally{const se=new Set(me.value);se.delete(Y.name),me.value=se}}function Ne(Y,Te){var Le;i.value[Y]=Te;const Ee=new Set(l.value);Te===String((Le=e.value)==null?void 0:Le[Y])?Ee.delete(Y):Ee.add(Y),l.value=Ee,n.value=""}async function A(){if(s.value||!o.value||!l.value.size)return;const Y={};for(const Te of l.value){const Ee=Number(i.value[Te]),Le=Te==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Ee)||Ee<1||Ee>Le){n.value=`Enter a whole number between 1 and ${Le}.`;return}Y[Te]=Ee}a.value=!0,s.value=!0,n.value="",++E,t.value=!1;try{const Te=await j.post("/api/mcp/limits",Y);e.value=Te;for(const Ee of Object.keys(i.value))Number.isInteger(Te[Ee])&&(i.value[Ee]=String(Te[Ee]));l.value=new Set,Ce.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(Te){n.value=Te.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await Z({quiet:!0})}}async function P(Y){if(Y!==T.value&&!(!Y&&!await os({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await j.post("/api/mcp/enabled",{enabled:Y}),Ce.success(Y?"MCP enabled":"MCP disabled"),await Z({quiet:!0})}catch(Te){Ce.error(Te.message||"Failed to update MCP state"),await Z({quiet:!0})}finally{s.value=!1}}}async function q(Y){K(Y.name,!0);try{await j.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/reconnect`,{}),Ce.success(`Reconnected ${Y.name}`)}catch(Te){Ce.error(Te.message||`Failed to reconnect ${Y.name}`)}finally{K(Y.name,!1),await Z({quiet:!0})}}async function fe(Y){K(Y.name,!0);try{await j.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/refresh-tools`,{}),Ce.success(`Refreshed tools from ${Y.name}`),await ue(Y.name,!0)}catch(Te){Ce.error(Te.message||`Failed to refresh ${Y.name}`)}finally{K(Y.name,!1),await Z({quiet:!0})}}async function B(Y){if(await os({title:`Remove ${Y.name}`,message:`Remove this saved MCP server? Its ${Y.published_count||0} published tool${Y.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){K(Y.name,!0);try{await j.del(`/api/mcp/servers/${encodeURIComponent(Y.name)}`),Ce.success(`Removed ${Y.name}`),delete p.value[Y.name]}catch(Ee){Ce.error(Ee.message||`Failed to remove ${Y.name}`)}finally{K(Y.name,!1),await Z({quiet:!0})}}}async function J(Y){const Te=new Set(d.value);if(Te.has(Y.name)){Te.delete(Y.name),d.value=Te;return}Te.add(Y.name),d.value=Te,Object.hasOwn(p.value,Y.name)||await ue(Y.name)}async function ue(Y,Te=!1){if(!Te&&Object.hasOwn(p.value,Y))return;const Ee=new Set(h.value);Ee.add(Y),h.value=Ee,m.value={...m.value,[Y]:""};try{const Le=await j.get(`/api/mcp/servers/${encodeURIComponent(Y)}/tools`);p.value={...p.value,[Y]:Le.tools||[]}}catch(Le){m.value={...m.value,[Y]:Le.message||"Failed to load tools"}}finally{const Le=new Set(h.value);Le.delete(Y),h.value=Le}}function V(Y){return(p.value[Y]||[]).filter(Te=>C1(Te,u.value[Y]))}function ee(Y,Te){u.value={...u.value,[Y]:Te}}function te(){I.value="add",k.value="",y.value=null,g.value=Mc(),x.value="",b.value=!0}function be(Y){I.value="edit",k.value=Y.name,y.value=Y,g.value={...Mc(),name:Y.name,enabled:!!Y.enabled,transport:Y.transport||"stdio"},x.value="",b.value=!0}function he(){S.value||(b.value=!1)}function we(Y){b.value&&E1(Y)}function _e(Y){const Te=Y==="headers"?"headerRows":"envRows";g.value[Te].push({key:"",value:""})}function ye(Y,Te){const Ee=Y==="headers"?"headerRows":"envRows";g.value[Ee].splice(Te,1)}function Ke(Y,Te){const Ee=Y==="headers"?"headersRemove":"envRemove",Le=g.value[Ee];g.value[Ee]=Le.includes(Te)?Le.filter(se=>se!==Te):[...Le,Te]}async function je(){var Te,Ee;x.value="";let Y;try{Y=w1(g.value,{mode:I.value,originalTransport:((Te=y.value)==null?void 0:Te.transport)||""})}catch(Le){x.value=Le instanceof aa?Le.message:"Invalid MCP server configuration",await jt(),(Ee=document.querySelector(".mcp-editor"))==null||Ee.scrollTo({top:0,behavior:"smooth"});return}if(!(I.value==="edit"&&k1(Y,y.value)&&!await os({title:`Change ${k.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){S.value=!0;try{I.value==="add"?await j.post("/api/mcp/servers",Y):await j.put(`/api/mcp/servers/${encodeURIComponent(k.value)}`,Y),Ce.success(I.value==="add"?`Saved ${Y.name}`:`Updated ${k.value}`),b.value=!1,await Z({quiet:!0})}catch(Le){x.value=Le.message||"Failed to save MCP server"}finally{S.value=!1}}}let Fe=null;function Ge(Y){`${(Y==null?void 0:Y.event)||""} ${(Y==null?void 0:Y.type)||""} ${(Y==null?void 0:Y.tool)||""} ${(Y==null?void 0:Y.message)||""}`.toLowerCase().includes("mcp")&&(Fe&&window.clearTimeout(Fe),Fe=window.setTimeout(()=>Z({quiet:!0}),200))}function st(){R||(R=!0,w||(ct.subscribe("events",Ge),w=!0),Z(),oe())}function Ye(){R=!1,z(),Fe&&window.clearTimeout(Fe),Fe=null,w&&(ct.unsubscribe("events",Ge),w=!1)}return tt(st),rs(st),Zt(Ye),wt(Ye),{status:e,loading:t,mutating:s,pageError:r,servers:U,masterEnabled:T,aggregate:$,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:Ne,saveLimits:A,expandedServers:d,toolQueries:u,toolErrors:m,toolsLoading:h,editorOpen:b,editorMode:I,editingName:k,editingServer:y,form:g,formError:x,saving:S,editorGroups:O,configuredHeaderKeys:Q,configuredEnvKeys:W,savedHttpEndpoint:M,endpointRequired:L,endpointFieldLabel:D,endpointPlaceholder:le,refreshAll:Z,busy:re,serverState:ve,stateLabel:Me,transportLabel:ne,protocolLabel:ie,toolSummary:pe,formatAge:I1,setMasterEnabled:P,togglePending:me,toggleServerEnabled:ge,reconnect:q,refreshTools:fe,removeServer:B,toggleTools:J,filteredTools:V,setToolQuery:ee,openAdd:te,openEdit:be,closeEditor:he,jumpToEditorGroup:we,addSecretRow:_e,removeSecretRow:ye,toggleSecretRemoval:Ke,saveServer:je}}};function L1(e,t){if(!e||!t)return Tf(e);const s=Tf(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const N1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),m=f(!1),h=f(null),b=f(null);let I=null;const k=f(null),y=f(!1),g=f({}),x=f({}),S=f({}),_=f({}),E=new Map,R=f(null),w=H(()=>e.value.reduce((z,Z)=>z+(Z.chunks||0),0)),O=H(()=>new Set(e.value.map(Z=>Z.uploader).filter(Boolean)).size);function U(z,Z){const re=x.value[Z];if(!re||re.length===0)return 0;const K=Math.max(...re.map(ve=>ve.char_count||0));return K===0?0:Math.round(z.char_count/K*100)}async function T(){t.value=!0,s.value=null;try{const z=await j.get("/api/knowledge");e.value=Array.isArray(z)?z:[]}catch(z){s.value=z.message}t.value=!1}async function $(z){if(g.value[z]){g.value[z]=!1,R.value=null;return}if(g.value[z]=!0,Object.prototype.hasOwnProperty.call(x.value,z))return;if(E.has(z))return E.get(z);const Z={..._.value,[z]:!0};_.value=Z;const re={...S.value};delete re[z],S.value=re;const K=j.get(`/api/knowledge/${encodeURIComponent(z)}/chunks`).then(ve=>{x.value={...x.value,[z]:Array.isArray(ve)?ve:[]}}).catch(ve=>{S.value={...S.value,[z]:ve.message||"load failed"}}).finally(()=>{if(E.get(z)!==K)return;E.delete(z);const ve={..._.value};delete ve[z],_.value=ve});return E.set(z,K),K}let Q=0;async function W(){const z=a.value.trim();if(!z)return;const Z=++Q;i.value=!0,o.value=null,l.value=z;try{const re=await j.get(`/api/knowledge/search?q=${encodeURIComponent(z)}`);if(Z!==Q)return;n.value=Array.isArray(re)?re:[]}catch(re){if(Z!==Q)return;n.value=[],o.value=re.message||"Search failed"}Z===Q&&(i.value=!1)}function M(){Q+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function L(){u.value=null,p.value=null;const z=c.value.trim(),Z=d.value.trim();if(!z){u.value="Source name is required";return}if(!Z){u.value="Content is required";return}m.value=!0;try{const re=await j.post("/api/knowledge",{source:z,content:Z});p.value=`Ingested ${re.chunks||0} chunks from "${z}"`,c.value="",d.value="",x.value={},await T(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(re){u.value=re.message}m.value=!1}async function D(z){h.value=z,b.value=null,I&&(clearTimeout(I),I=null);try{const Z=await j.post(`/api/knowledge/${encodeURIComponent(z)}/reingest`);b.value={source:z,error:!1,message:`Re-ingested ${Z.chunks||0} chunks`},delete x.value[z],await T(),I=setTimeout(()=>{b.value=null,I=null},3e3)}catch(Z){b.value={source:z,error:!0,message:Z.message}}h.value=null}function le(z){k.value=z}async function oe(){if(k.value){y.value=!0;try{await j.del(`/api/knowledge/${encodeURIComponent(k.value)}`),delete x.value[k.value],await T()}catch(z){Ce.error(`Failed to delete source: ${z.message||"unknown error"}`)}y.value=!1,k.value=null}}return tt(()=>{T()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:m,reingesting:h,reingestResult:b,deleteTarget:k,deleting:y,expanded:g,sourceChunks:x,chunkErrors:S,loadingChunks:_,selectedChunk:R,totalChunks:w,uploaderCount:O,truncate:Lu,formatTs:ai,highlightTerms:L1,chunkBarWidth:U,fetchSources:T,toggleSource:$,doSearch:W,clearSearch:M,doIngest:L,doReingest:D,confirmDelete:le,doDelete:oe}}},M1={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),m=f(""),h=f(!1),b=f(null),I=f(null),k=f(new Set),y=f(null),g=f(!1),x=f(!1),S=H(()=>e.value.reduce((Z,re)=>Z+re.count,0)),_=H(()=>k.value.size);function E(Z){const re=t.value[Z];if(!re)return[];if(!l.value.trim())return re;const K=l.value.trim().toLowerCase();return re.filter(ve=>ve.key.toLowerCase().includes(K)||ve.value&&ve.value.toLowerCase().includes(K))}function R(Z,re){return k.value.has(Z+"/"+re)}function w(Z,re){const K=Z+"/"+re,ve=new Set(k.value);ve.has(K)?ve.delete(K):ve.add(K),k.value=ve}function O(Z){const re=t.value[Z];return!re||re.length===0?!1:re.every(K=>k.value.has(Z+"/"+K.key))}function U(Z,re){const K=t.value[Z];if(!K)return;const ve=new Set(k.value);for(const Me of K){const ne=Z+"/"+Me.key;re?ve.add(ne):ve.delete(ne)}k.value=ve}async function T(){s.value=!0,a.value=null;try{const Z=await j.get("/api/memory");e.value=Object.entries(Z).map(([re,K])=>({name:re,keys:K.keys||[],count:K.count||0}))}catch(Z){a.value=Z.message}s.value=!1}async function $(Z){if(n.value[Z]){n.value[Z]=!1;return}n.value[Z]=!0;const re=e.value.find(ve=>ve.name===Z);if(!re||t.value[Z]||i.value===Z)return;i.value=Z;let K;try{const Me=(await j.get(`/api/memory/${encodeURIComponent(Z)}`)).entries||{};K=re.keys.map(ne=>Object.prototype.hasOwnProperty.call(Me,ne)?{key:ne,value:Me[ne]||"",failed:!1}:{key:ne,value:"",failed:!0,error:"Not found in scope"})}catch(ve){K=re.keys.map(Me=>({key:Me,value:"",failed:!0,error:ve.message||"Failed to load"}))}t.value[Z]=K,i.value=null}function Q(Z,re,K){p.value=Z+"/"+re,m.value=K}async function W(Z,re){h.value=!0,b.value=null;try{await j.put(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(re)}`,{value:m.value});const K=t.value[Z];if(K){const ve=K.find(Me=>Me.key===re);ve&&(ve.value=m.value)}p.value=null}catch(K){b.value=`Failed to save: ${K.message||"unknown error"}`}h.value=!1}async function M(Z,re){try{await navigator.clipboard.writeText(re.value),I.value=Z+"/"+re.key,setTimeout(()=>{I.value=null},1500)}catch{}}async function L(){d.value=null,u.value=null;const Z=r.value.scope.trim(),re=r.value.key.trim(),K=r.value.value.trim();if(!Z){d.value="Scope is required";return}if(!re){d.value="Key is required";return}if(!K){d.value="Value is required";return}c.value=!0;try{await j.put(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(re)}`,{value:K}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await T(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ve){d.value=ve.message}c.value=!1}function D(Z,re){y.value={scope:Z,key:re}}async function le(){if(!y.value)return;g.value=!0,b.value=null;const{scope:Z,key:re}=y.value;try{await j.del(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(re)}`);const K=t.value[Z];K&&(t.value[Z]=K.filter(ne=>ne.key!==re));const ve=e.value.find(ne=>ne.name===Z);ve&&(ve.count--,ve.keys=ve.keys.filter(ne=>ne!==re));const Me=new Set(k.value);Me.delete(Z+"/"+re),k.value=Me}catch(K){b.value=`Failed to delete: ${K.message||"unknown error"}`}g.value=!1,y.value=null}function oe(){x.value=!0}async function z(){g.value=!0,b.value=null;const Z=[];for(const re of k.value){const K=re.indexOf("/");Z.push({scope:re.slice(0,K),key:re.slice(K+1)})}try{await j.post("/api/memory/bulk-delete",{entries:Z}),k.value=new Set,t.value={},await T()}catch(re){b.value=`Bulk delete failed: ${re.message||"unknown error"}`}g.value=!1,x.value=!1}return tt(()=>{T()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:m,saving:h,actionError:b,copied:I,selected:k,selectedCount:_,totalEntries:S,deleteTarget:y,deleting:g,showBulkDelete:x,fetchMemory:T,toggleScope:$,startEdit:Q,doEdit:W,copyValue:M,doAdd:L,confirmDelete:D,doDelete:le,confirmBulkDelete:oe,doBulkDelete:z,isSelected:R,toggleSelect:w,isScopeAllSelected:O,toggleSelectAll:U,filteredEntries:E}}},D1={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(!1),r=f(!1),c=f(null),d=f(!1),u=H(()=>[...new Set(e.value.map(_=>_.category))].sort()),p=H(()=>{const S={};return e.value.forEach(_=>{S[_.category]=(S[_.category]||0)+1}),S}),m=H(()=>n.value?e.value.filter(S=>S.category===n.value):e.value);function h(S){return S==="correction"?"badge-warning":S==="operational"?"badge-info":S==="preference"?"badge-success":"badge-info"}function b(S){i.value=S.key,l.value=S.content}async function I(S){try{await j.put("/api/learned/"+encodeURIComponent(S),{content:l.value}),i.value=null,Ce.success("Entry updated"),await y()}catch(_){Ce.error(_.message||"Failed to save entry")}}async function k(S){if(await os({title:"Delete learned entry",message:`Delete "${S}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/learned/"+encodeURIComponent(S)),Ce.success("Entry deleted"),await y()}catch(E){Ce.error(E.message||"Failed to delete entry")}}async function y(){s.value=!0,a.value=null;try{const S=await j.get("/api/learned");e.value=S.entries||[],t.value={last_reflection:S.last_reflection,count:S.count}}catch(S){a.value=S.message}s.value=!1}async function g(){var S;r.value=!1,c.value=null;try{const _=await j.get("/api/config");o.value=((S=_.learning)==null?void 0:S.enabled)===!0,r.value=!0}catch(_){c.value=_.status===403?"Administrator access is required to change automatic learning.":_.message||"Automatic learning state is unavailable."}}async function x(S){if(!(!r.value||d.value)){d.value=!0,c.value=null;try{if(await j.put("/api/config",{learning:{enabled:S}}),await g(),!r.value)return;Ce.success(`Automatic learning ${o.value?"enabled":"disabled"}`)}catch(_){r.value=!1,c.value=_.status===403?"Administrator access is required to change automatic learning.":_.message||"Failed to change automatic learning."}finally{d.value=!1}}}return tt(()=>{y(),g()}),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:u,catCounts:p,filtered:m,learningEnabled:o,configReady:r,configError:c,savingConfig:d,catBadge:h,formatTs:ai,startEdit:b,saveEdit:I,deleteEntry:k,fetchEntries:y,fetchLearningConfig:g,setLearningEnabled:x}}},wg=[{id:"tools",label:"Tools",component:v1},{id:"skills",label:"Skills",component:y1},{id:"mcp-servers",label:"MCP Servers",component:O1},{id:"knowledge",label:"Knowledge",component:N1},{id:"memory",label:"Memory",component:M1},{id:"learned",label:"Learned",component:D1}],P1={components:{TabbedPage:Xr},setup(){return{tabs:wg}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},$1={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},F1={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},B1={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},U1={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=H(()=>e.value.components||[]),l=H(()=>B1[e.value.overall]||"text-gray-400"),o=H(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=H(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return $1[_]||"text-gray-400"}function d(_){return F1[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function p(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function m(_){return _.replace(/_/g," ").replace(/\b\w/g,E=>E.toUpperCase())}function h(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function b(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function I(){n.value=!0;try{e.value=await j.get("/api/health/components"),s.value=null,a.value=!0}catch(_){s.value=_.message}finally{t.value=!1,n.value=!1}}function k(){t.value=!0,s.value=null,I()}let y=null,g=!1;function x(){g||(g=!0,I(),y||(y=setInterval(I,3e4)))}function S(){g&&(g=!1,y&&(clearInterval(y),y=null))}return tt(x),rs(x),Zt(S),wt(S),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:m,formatTime:h,formatNumber:b,fetchHealth:I,retry:k}}},z1={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=H(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=H(()=>{if(!i.value)return[];const I=i.value,k=I.storage_total_bytes||1;return[{label:"Session Persistence",mb:I.sessions.persist_dir.total_mb,bytes:I.sessions.persist_dir.total_bytes,files:I.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(I.sessions.persist_dir.total_bytes/k*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:I.knowledge.db_file.total_mb,bytes:I.knowledge.db_file.total_bytes,files:I.knowledge.db_file.file_count,pct:Math.min(100,Math.round(I.knowledge.db_file.total_bytes/k*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:I.trajectories.message_dir.total_mb,bytes:I.trajectories.message_dir.total_bytes,files:I.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(I.trajectories.message_dir.total_bytes/k*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:I.trajectories.agent_dir.total_mb,bytes:I.trajectories.agent_dir.total_bytes,files:I.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(I.trajectories.agent_dir.total_bytes/k*100)),color:"res-bar-amber"}]});async function d(){try{const I=await j.get("/api/resource-usage");i.value=I,t.value=null,s.value=!0}catch(I){t.value=I.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let m=!1;function h(){m||(m=!0,d(),l||(l=setInterval(d,3e4)))}function b(){m&&(m=!1,l&&(clearInterval(l),l=null))}return tt(h),rs(h),Zt(b),wt(b),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:Nu,refresh:u,retry:p}}},H1=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),j1=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function V1(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!j1.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?Xl(t):""}function q1(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!H1.has(c)));s=Object.keys(r).length?Xl(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const _n=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),eo=e=>typeof e=="string"||typeof e=="number"?String(e):"";function G1(e){const t=_n(e)?e:{},s=_n(t.metadata)?t.metadata:{},a=_n(t.audit_metadata)?t.audit_metadata:{},n=_n(t.turn)?t.turn:{},i=l=>eo(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function Nf(e){return e.record?JSON.stringify(kg(e),null,2):e.text}function kg(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function Sd(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function Mf(e){if(!Sd(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,eo(s.channel_id),eo(s.user_id??s.actor)])}function W1(e,t,s=2e3){var i,l,o;const a=Mf(t),n=a?e.findIndex(r=>Mf(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:Sd(y)==="end"?1:0,p=[...c].sort((y,g)=>u(y)-u(g)),m=Object.assign({},...p);m.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const g=p.filter(x=>_n(x[y])).map(x=>x[y]);g.length&&(m[y]=Object.assign({},...g))}const h=c.some(y=>Sd(y)!=="start"),b=c.find(y=>Cd(y,0).level==="ERROR"),I=(b==null?void 0:b.status)||((i=b==null?void 0:b.metadata)==null?void 0:i.status);m.status=b?["failed","error","cancelled","denied","outcome_unknown"].includes(I)?I:"failed":h?m.status||((l=m.metadata)==null?void 0:l.status)||"succeeded":"started",h&&m.status==="started"&&(m.status="succeeded"),b&&(m.error=b.error||((o=b.metadata)==null?void 0:o.error)||m.error);const k=Cd(m,r.id,r._time);Object.assign(k,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(n,1,k)}e.length>s&&e.splice(0,e.length-s)}function Cd(e,t,s=new Date){var u,p;let a=e;if(_n(e)&&e.type==="log"&&"line"in e?a=e.line:_n(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=_n(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(m=>["failed","error","cancelled","denied","outcome_unknown"].includes(m))?"ERROR":eo(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:eo(n==null?void 0:n.tool_name),raw:n?null:o,attribution:G1(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function K1(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const J1={components:{ToolOutput:ec},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=H(()=>q1(e.entry)),s=H(()=>{var o;return Xl(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=H(()=>{var o,r,c;return Xl(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=H(()=>V1(e.entry.record)),i=H(()=>kg(e.entry)),l=H(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},Z1=["INFO","WARNING","ERROR"],Y1=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Dc=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Q1=[50,100,200,500],X1={components:{ToolOutput:ec,LogRecord:J1},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(ct.state||"disconnected"),u=H(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),m=f(!1),h=f(null),b=2e3,I=Z1,k=Y1,y=Dc,g=f("all"),x=f(""),S=f([]),_=f(!1),E=f(""),R=f([]);function w(){try{const ce=localStorage.getItem("odin-log-presets");ce&&(S.value=JSON.parse(ce))}catch{}}function O(){try{localStorage.setItem("odin-log-presets",JSON.stringify(S.value))}catch{}}const U=H(()=>l.value!==""||o.value.trim()!==""||x.value!==""),T=H(()=>{const ce=Dc.find(Re=>Re.value===x.value);return ce?ce.label:""}),$=H(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ce){return ce.message}}),Q=24,W=H(()=>{if(Z.value.length===0)return[];const ce=[],Re=new Date,ze=3600*1e3;for(let nt=Q-1;nt>=0;nt--){const kt=new Date(Re.getTime()-(nt+1)*ze),ut=new Date(Re.getTime()-nt*ze);ce.push({start:kt,end:ut,label:le(kt,ut),shortLabel:ut.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const nt of Z.value){if(!nt._time)continue;const kt=nt._time.getTime();for(const ut of ce)if(kt>=ut.start.getTime()&&kt<ut.end.getTime()){ut.total++,nt.level==="ERROR"?ut.errors++:nt.level==="WARNING"?ut.warnings++:ut.info++;break}}return ce}),M=H(()=>{let ce=1;for(const Re of W.value)Re.total>ce&&(ce=Re.total);return ce}),L=H(()=>{if(W.value.length===0)return"";const ce=Z.value.map(nt=>nt._time&&nt._time.getTime()).filter(Boolean);if(ce.length===0)return"";const Re=new Date(Math.min(...ce));return`${Z.value.length} shown, oldest ${Re.toLocaleTimeString()}`}),D=H(()=>Math.ceil(Q/8));function le(ce,Re){const ze={hour:"2-digit",minute:"2-digit"};return ce.toLocaleTimeString([],ze)+" - "+Re.toLocaleTimeString([],ze)}function oe(ce,Re){return!Re||!ce?"0px":Math.max(2,ce/Re*100)+"%"}function z(ce){const Re=Z.value.findIndex(ze=>ze._time&&ze._time.getTime()>=ce.start.getTime()&&ze._time.getTime()<ce.end.getTime());if(Re>=0&&p.value){const ze=p.value.querySelector('[data-log-id="'+Z.value[Re].id+'"]');ze&&(ze.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Z=H(()=>{let ce=t.value;if(l.value&&(ce=ce.filter(Re=>(Re.level||"INFO")===l.value)),x.value){const Re=Dc.find(ze=>ze.value===x.value);if(Re&&Re.seconds){const ze=new Date(Date.now()-Re.seconds*1e3);ce=ce.filter(nt=>nt._time&&nt._time>=ze)}}if(o.value&&!$.value)if(r.value)try{const Re=new RegExp(o.value,"i");ce=ce.filter(ze=>{const nt=ze.searchText,kt=ze.tool||"";return Re.test(nt)||Re.test(kt)})}catch{}else{const Re=o.value.toLowerCase();ce=ce.filter(ze=>{const nt=ze.searchText.toLowerCase(),kt=(ze.tool||"").toLowerCase();return nt.includes(Re)||kt.includes(Re)})}return ce}),re=H(()=>K1(Z.value));function K(ce){const Re=Cd(ce,++s);if(n.value){R.value.push(Re);return}ve(Re)}function ve(ce){W1(t.value,ce,b),i.value&&jt(()=>Me())}function Me(ce=!1){const Re=p.value;Re&&Re.scrollTo({top:Re.scrollHeight,behavior:ce?"smooth":"instant"})}function ne(){i.value=!0,m.value=!1,jt(()=>Me(!0))}const ie=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function pe(){const ce=p.value;if(!ce)return;const Re=ce.scrollHeight-ce.scrollTop-ce.clientHeight<40;m.value=!i.value&&!Re&&t.value.length>0,A.value&&me()}function me(){const ce=p.value;!ce||!i.value||ce.scrollHeight-ce.scrollTop-ce.clientHeight>=40&&(i.value=!1,m.value=t.value.length>0)}function ge(){i.value&&requestAnimationFrame(me)}function Ne(ce){ie.has(ce.key)&&ge()}const A=f(!1);function P(){i.value&&(A.value=!0,requestAnimationFrame(me))}function q(){A.value&&(A.value=!1,me())}function fe(){i.value&&(m.value=!1,jt(()=>Me()))}function B(){if(n.value=!n.value,!n.value&&R.value.length>0){for(const ce of R.value)ve(ce);R.value=[]}}function J(){t.value=[],R.value=[],m.value=!1}function ue(){let ce;e.value==="search"?ce=Ue.value.map(kt=>{const ut=kt.error?"ERROR":"INFO",ba=kt.tool_name?`[${kt.tool_name}] `:"";return`${kt.timestamp||""} ${ut} ${ba}${kt.result_summary||kt.message||""}`}).join(`
`):ce=Z.value.map(Nf).join(`

`);const Re=new Blob([ce],{type:"text/plain"}),ze=URL.createObjectURL(Re),nt=document.createElement("a");nt.href=ze,nt.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,nt.click(),URL.revokeObjectURL(ze)}function V(ce){const Re=Nf(ce);navigator.clipboard.writeText(Re).then(()=>{h.value=ce.id,setTimeout(()=>{h.value=null},1500)}).catch(()=>{})}function ee(ce){l.value=l.value===ce?"":ce,g.value="all"}function te(ce){return ce.level==="ERROR"?"log-line-error":ce.level==="WARNING"?"log-line-warning":"text-gray-300"}function be(ce){return ce==="ERROR"?"text-red-500 font-semibold":ce==="WARNING"?"text-yellow-500":"text-blue-500"}function he(ce){return ce==="ERROR"?"log-chip-error":ce==="WARNING"?"log-chip-warning":"log-chip-info"}function we(ce){g.value=ce.id;const Re=ce.filters;l.value=Re.level||"",x.value=Re.timeRange||"",o.value=Re.text||"",Re.levels&&(l.value=Re.levels[0]||""),Re.hasToolName&&(o.value="")}function _e(ce){g.value=ce.id,l.value=ce.filters.level||"",x.value=ce.filters.timeRange||"",o.value=ce.filters.text||""}function ye(){if(!E.value.trim())return;const ce={id:"custom-"+Date.now(),name:E.value.trim(),filters:{level:l.value,timeRange:x.value,text:o.value}};S.value=[...S.value,ce],O(),_.value=!1,E.value=""}function Ke(ce){S.value=S.value.filter(Re=>Re.id!==ce),O(),g.value===ce&&(g.value="all")}const je=f("all"),Fe=f(""),Ge=f(""),st=f(""),Ye=f(""),Y=f(""),Te=f(100),Ee=Q1,Le=f(!1),se=f(!1),Oe=f(""),Ue=f([]),dt=f(null),Bt=f(null);function ft(){e.value="search",dt.value||yt()}async function yt(){try{dt.value=await j.get("/api/logs/stats")}catch{}}function Qt(){const ce=Y.value;if(!ce){st.value="",Ye.value="";return}const ze={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ce];if(ze){const nt=new Date(Date.now()-ze*1e3);st.value=cs(nt),Ye.value=""}}function cs(ce){const Re=ze=>String(ze).padStart(2,"0");return`${ce.getFullYear()}-${Re(ce.getMonth()+1)}-${Re(ce.getDate())}T${Re(ce.getHours())}:${Re(ce.getMinutes())}`}function Xs(ce){if(!ce)return"";const Re=new Date(ce);return isNaN(Re.getTime())?"":Re.toISOString()}async function ea(){Le.value=!0,Oe.value="",se.value=!0,Bt.value=null;try{const ce=new URLSearchParams;je.value&&je.value!=="all"&&ce.set("level",je.value),Fe.value&&ce.set("tool",Fe.value),Ge.value&&ce.set("q",Ge.value);const Re=Xs(st.value),ze=Xs(Ye.value);Re&&ce.set("start",Re),ze&&ce.set("end",ze),ce.set("limit",String(Te.value));const nt=await j.get(`/api/logs/search?${ce.toString()}`);Ue.value=nt.entries||[]}catch(ce){Oe.value=ce.message||"Search failed",Ue.value=[]}finally{Le.value=!1}}function Qe(){je.value="all",Fe.value="",Ge.value="",st.value="",Ye.value="",Y.value="",Te.value=100,Ue.value=[],se.value=!1,Oe.value="",Bt.value=null}function ca(ce){Bt.value=Bt.value===ce?null:ce}function hs(ce){if(!ce.timestamp)return"";try{return new Date(ce.timestamp).toLocaleString()}catch{return ce.timestamp}}function Ns(ce){return ce.type==="web_action"?`${ce.status||""} (${ce.execution_time_ms||0}ms)`:(ce.result_summary||"").slice(0,200)}function vs(ce){return ce.error?"log-line-error":"text-gray-300"}function Tn(ce){try{return JSON.stringify(ce,null,2)}catch{return String(ce)}}let Mt=null,vt=!1;function Ms(){vt||(vt=!0,ct.subscribe("logs",K),c.value=ct.connected,d.value=ct.state||"disconnected",Mt=ct.onState(ce=>{d.value=ce,c.value=ce==="connected"}))}function rn(){vt&&(vt=!1,ct.unsubscribe("logs",K),Mt&&(Mt(),Mt=null))}return tt(()=>{w(),window.addEventListener("pointerup",q),window.addEventListener("pointercancel",q)}),rs(Ms),Zt(rn),wt(()=>{rn(),window.removeEventListener("pointerup",q),window.removeEventListener("pointercancel",q)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:re,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Z,pauseBuffer:R,showJumpBottom:m,copiedIndex:h,regexError:$,levels:I,logPresets:k,timeRanges:y,timeRange:x,activeLogPreset:g,customLogPresets:S,showSaveLogPreset:_,newLogPresetName:E,hasActiveLogFilters:U,timeRangeLabel:T,timelineBuckets:W,timelineMax:M,timelineSpanLabel:L,timelineLabelSkip:D,togglePause:B,clearLogs:J,exportLogs:ue,logLineClass:te,levelClass:be,levelChipClass:he,toggleLevel:ee,copyLine:V,jumpToBottom:ne,onScroll:pe,onUserScrollIntent:ge,onUserScrollKey:Ne,onAutoScrollToggle:fe,onPointerDown:P,applyLogPreset:we,applyCustomLogPreset:_e,saveLogCustomPreset:ye,removeLogCustomPreset:Ke,segmentHeight:oe,jumpToTimelineBucket:z,searchLevel:je,searchTool:Fe,searchKeyword:Ge,searchStart:st,searchEnd:Ye,searchTimePreset:Y,searchLimit:Te,searchLimits:Ee,searching:Le,searchRan:se,searchError:Oe,searchResults:Ue,searchStats:dt,expandedSearch:Bt,switchToSearch:ft,runSearch:ea,clearSearchFilters:Qe,toggleSearchExpand:ca,formatSearchTs:hs,searchEntryText:Ns,searchLogLineClass:vs,formatJson:Tn,applySearchTimePreset:Qt}}};function Lo(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const eC=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function tC(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const $i=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["grafana_alerts","outbound_webhooks"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],sC={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},No=new Set(["llm_provider","openai_codex","ollama","openai_compatible","kimi","personality","discord","computer"]),aC=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Df(e){return aC.some(t=>e===t||e.startsWith(`${t}.`))}const Sg="odin_config_center_expanded_v1",Cg="odin_config_center_category_v1",nC=50,iC=650,ml=()=>j.get("/api/config/meta");function Bn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Ei(e,t){return JSON.stringify(e)===JSON.stringify(t)}function bi(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function lC(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function oC(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Tg(e,t){if(Ei(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Bn(t);const a={};for(const[n,i]of Object.entries(t)){const l=Tg(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function rC(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=Tg(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function Eg(e,t,s,a){if(Ei(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Eg(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function cC(){try{const e=JSON.parse(localStorage.getItem(Sg)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function dC(){try{const e=localStorage.getItem(Cg);return $i.some(t=>t.key===e)?e:$i[0].key}catch{return $i[0].key}}const uC={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=f(!1),o=f(""),r=f(!1),c=f(""),d=f(""),u=f("");function p(C){i.value=C||null,C&&typeof C.authorized=="boolean"&&(l.value=C.authorized)}async function m(){try{const C=await j.get("/api/setup/status");p(C.listener),u.value=""}catch(C){p(null),u.value=`Listener status could not be loaded: ${C.message||"Unknown error"}`}}async function h(){if(!(!fe.value||!o.value.trim()||r.value||q.value)){r.value=!0,c.value="",d.value="";try{const C=j.setListenerExposure(o.value.trim(),l.value);o.value="";const G=await C;c.value=G.message,p(G.listener)}catch(C){d.value=C.message||"Listener consent could not be saved."}finally{o.value="",r.value=!1}}}const b=f(null),I=["image_model","outer_model"],k=f(null),y=f(null),g=f(null),x=f(!1),S=f(!1),_=f(null),E=f(""),R=f("all"),w=f(dC()),O=f(cC()),U=f({}),T=f({}),$=f(""),Q=f({}),W=f({}),M=f([]),L=f([]),D=f(!1),le=f(!1),oe=f(!1);let z=null,Z=null,re={path:null,at:0},K=0;const ve=H(()=>{var C;return(((C=t.value)==null?void 0:C.fields)||[]).filter(G=>!No.has(G.path.split(".")[0])&&!Df(G.path))}),Me=H(()=>new Map(ve.value.map(C=>[C.path,C]))),ne=H(()=>Ne.value.reduce((C,G)=>C+G.sections.length,0)),ie=H(()=>ve.value.length),pe=H(()=>eC),me=H(()=>M.value.length>0),ge=H(()=>L.value.length>0),Ne=H(()=>{if(!e.value)return[];const C=new Set($i.flatMap(ke=>ke.sections)),G=$i.map(ke=>({...ke,sections:ke.sections.filter(We=>Object.hasOwn(e.value,We)&&!No.has(We))})).filter(ke=>ke.sections.length),ae=Object.keys(e.value).filter(ke=>!C.has(ke)&&!No.has(ke));return ae.length&&G.push({key:"other",label:"Other",icon:"folder",sections:ae}),G}),A=H(()=>e.value?{...e.value,...U.value}:null),P=H(()=>{if(!e.value)return[];const C=[];for(const[G,ae]of Object.entries(U.value))Eg(e.value[G],ae,G,C);return C.filter(G=>!Ei(G.oldVal,G.newVal)).map(G=>{const ae=st(G.path);return{...G,label:(ae==null?void 0:ae.label)||bi(G.path.split(".").at(-1)),apply_mode:(ae==null?void 0:ae.apply_mode)||Oe(G.path.split(".")[0])}})}),q=H(()=>P.value.length>0),fe=H(()=>!!i.value&&l.value!==i.value.authorized),B=H(()=>{var G;const C=(G=i.value)==null?void 0:G.state;return C==="active"||C==="authorized_loopback"?"active":["pending_widening","pending_narrowing","active_rebind_pending"].includes(C)?"pending":C==="restricted"?"restricted":"unknown"}),J=H(()=>{var C;return{active:"Exposure active",authorized_loopback:"Authorized · loopback host",pending_widening:"Authorized · restart pending",pending_narrowing:"Restriction saved · restart pending",active_rebind_pending:"Exposed · restart pending",restricted:"Loopback only",unknown:"Runtime state unavailable"}[(C=i.value)==null?void 0:C.state]||"Loading listener state"}),ue=H(()=>i.value?i.value.authorized?i.value.authorization_source==="explicit"?"Beyond-loopback access is explicitly authorized":"Beyond-loopback access is retained from this installation":"Beyond-loopback access is not authorized":"Unavailable"),V=H(()=>{var C;return{explicit:"saved explicitly in config.yml",default:"schema default; no web.host key is saved",unknown:"source could not be verified"}[(C=i.value)==null?void 0:C.configured_host_source]||"source unavailable"}),ee=H(()=>{const C=i.value;return!C||C.running_scope==="unavailable"?"Actual bound address unavailable":`${(C.listening_hosts||[]).map((ae,ke)=>{var Ct;const We=(Ct=C.listening_ports)==null?void 0:Ct[ke];return We?`${ae}:${We}`:ae}).join(", ")} · ${C.running_scope==="loopback"?"loopback only":"accepting beyond loopback"}`}),te=H(()=>P.value.length),be=H(()=>new Set(P.value.map(C=>C.path.split(".")[0])).size),he=H(()=>!!E.value||R.value!=="all"),we=H(()=>{const C={...W.value};for(const G of P.value){const ae=st(G.path),ke=de(ae,G.newVal);ke&&(C[G.path]=ke)}return C}),_e=H(()=>Object.keys(we.value).length>0),ye=H(()=>e.value?(he.value?Ne.value:Ne.value.filter(G=>G.key===w.value)).map(G=>({...G,sections:G.sections.filter(ae=>Mt(ae))})).filter(G=>G.sections.length):[]),Ke=H(()=>{const C=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],G=new Map(C.map(ae=>[ae,[]]));for(const ae of P.value){const ke=G.has(ae.apply_mode)?ae.apply_mode:"restart";G.get(ke).push(ae)}return C.filter(ae=>G.get(ae).length).map(ae=>({key:ae,label:gs(ae),entries:G.get(ae)}))}),je=H(()=>P.value.filter(C=>C.apply_mode==="restart").length),Fe=H(()=>ve.value.filter(C=>C.pending_restart)),Ge=H(()=>Fe.value.length);function st(C){const G=Me.value.get(C);return G?{...G,apply_details:Lo([G])}:null}function Ye(C){const G=`${C}.`;return ve.value.filter(ae=>ae.path===C||ae.path.startsWith(G))}function Y(){return ve.value.some(C=>C.path==="tools.hosts"||C.path.startsWith("tools.hosts."))}function Te(){var ae,ke;const C=((ke=(ae=e.value)==null?void 0:ae.tools)==null?void 0:ke.hosts)||{},G=Object.keys(C).length;return`${G} host${G===1?"":"s"} configured.`}function Ee(C){return Ye(C).length}function Le(C){return bi(C)}function se(C){const G=Ye(C);if(!G.length)return`${bi(C)} configuration.`;const ae=G.find(Ct=>Ct.sensitivity==="public"&&Ct.description)||G.find(Ct=>Ct.description),ke=(ae==null?void 0:ae.description)||"";return ke.match(/setting for (.+)\.$/i)?`${bi(C)} settings and runtime behaviour.`:ke}function Oe(C){const G=[...new Set(Ye(C).map(ae=>ae.apply_mode))];return G.length===1?G[0]:G.includes("restart")?"restart":G.includes("activation_required")?"activation_required":G[0]||"restart"}function Ue(C){const G=[...new Set(Ye(C).map(ae=>gs(ae.apply_mode)))];return G.length?G.length===1?G[0]:`Mixed apply behaviour: ${G.join(" · ")}`:""}function dt(C){return Lo(Ye(C))}function Bt(C){var G;return Object.hasOwn(U.value,C)?U.value[C]:(G=e.value)==null?void 0:G[C]}function ft(){const C=Bt("mcp")||{},G=Object.keys(C.servers||{}).length;return`${C.enabled?"Globally enabled":"Globally disabled"} · ${G} configured server${G===1?"":"s"}.`}function yt(C,G){return G.split(".").reduce((ae,ke)=>ae==null?void 0:ae[ke],C)}function Qt(C){const G=A.value;return Ye(C).filter(ae=>Df(ae.path)?!1:ae.path.split(".").length<=2?!0:!ae.path.includes(".*")).map(ae=>({...ae,key:ae.path.split(".").at(-1),value:yt(G,ae.path),apply_details:Lo([ae]),editor:ae.path==="agents.final_warning_iterations"?"warning-chips":null}))}function cs(C){const G=C.path.split(".");return G.length>2?G.slice(0,2).join("."):null}function Xs(C){const G=new Map;for(const ae of Qt(C)){const ke=cs(ae),We=ke||`${C}.__root`;G.has(We)||G.set(We,{key:We,path:ke,entries:[]}),G.get(We).entries.push(ae)}return[...G.values()].map(ae=>{const ke=ae.entries.find(We=>We.group_description);return{...ae,label:ae.path?bi(ae.path.split(".").at(-1)):null,description:(ke==null?void 0:ke.group_description)||null,apply_details:Lo(ae.entries),runtime_summaries:Qe(ae.entries)}})}function ea(C){return{save:C.save_effect||(C.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:C.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[C.apply_mode]||"Effective runtime state is not currently observable."}}function Qe(C){const G=new Map;for(const ae of C){const ke=ea(ae),We=`${ae.apply_mode}|${ke.save}|${ke.runtime}`;G.has(We)||G.set(We,{key:We,label:gs(ae.apply_mode),save:ke.save,runtime:ke.runtime})}return[...G.values()]}function ca(C){if(hs(C))return C.runtime_effect||C.activation_policy||"";if(C.apply_mode==="activation_required"){const G=C.activation_policy||C.runtime_effect;return G?`Not active after saving. No activation control exists in this release. ${G}`:"Not active after saving; no activation control exists in this release."}return""}function hs(C){return C.action_available===!0&&!!(C.action_label&&C.action_endpoint)}async function Ns(C){if(hs(C))try{if(Re(C.path))throw new Error("Save this setting before applying its action.");const G=String(C.action_method||"POST").toLowerCase(),ae={post:j.post.bind(j),put:j.put.bind(j),delete:j.del.bind(j)}[G];if(!ae)throw new Error("Unsupported configuration action");await ae(C.action_endpoint,C.action_body||void 0),await Xi(),Ma("success",`${C.action_label} completed.`)}catch(G){Ma("error",G.message||`${C.action_label} failed`)}}function vs(C,G){return[C.label,C.path,C.description,...C.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(G)}function Tn(C){const G=E.value.trim().toLowerCase();return G?Ye(C).filter(ae=>vs(ae,G)):[]}function Mt(C){const G=Ye(C);if(R.value!=="all"&&!G.some(ke=>ke.apply_state===R.value))return!1;const ae=E.value.trim().toLowerCase();return!ae||`${Le(C)} ${C}`.toLowerCase().includes(ae)?!0:G.some(ke=>vs(ke,ae))}function vt(C,G){return Ye(C).filter(ae=>ae.apply_state===G).length}function Ms(C){return C==="all"?ie.value:ve.value.filter(G=>G.apply_state===C).length}function rn(C){const G=C.sections.flatMap(ae=>Ye(ae));return{fields:G.length,modified:P.value.filter(ae=>C.sections.includes(ae.path.split(".")[0])).length,pending_restart:G.filter(ae=>ae.apply_state==="pending_restart").length,invalid:G.filter(ae=>ae.apply_state==="invalid").length,dormant:G.filter(ae=>ae.apply_state==="dormant").length}}function ce(C){var G;return Object.hasOwn(U.value,C)&&!Ei((G=e.value)==null?void 0:G[C],U.value[C])}function Re(C){return P.value.some(G=>G.path===C||G.path.startsWith(`${C}.`))}function ze(C){w.value=C,E.value="",R.value="all";try{localStorage.setItem(Cg,C)}catch{}}function nt(C){R.value=C}function kt(){E.value="",R.value="all"}function ut(C){var G;return((G=Ne.value.find(ae=>ae.sections.includes(C)))==null?void 0:G.sections)||[]}function ba(C){const G=ut(C),ae=G.find(ke=>O.value[ke]===!0);return ae||G.find(ke=>O.value[ke]!==!1)||null}function Ds(C){return E.value&&!oe.value&&Mt(C)?!0:oe.value?ba(C)===C:Object.hasOwn(O.value,C)?O.value[C]===!0:!0}function ii(C){const G=!Ds(C);if(oe.value){const ae={...O.value};for(const ke of ut(C))ae[ke]===!0&&(ae[ke]=!1);ae[C]=G,O.value=ae;return}O.value={...O.value,[C]:G}}function En(){M.value.push(Bn(U.value)),M.value.length>nC&&M.value.shift(),L.value=[]}function cn(){n.value||q.value&&(En(),U.value={},W.value={},D.value=!1)}function An(C,G=!1){const ae=Date.now();if(G&&re.path===C&&ae-re.at<iC){re.at=ae;return}En(),re={path:C,at:ae}}function da(C,G,ae){if(!G.length)return ae;const ke=Bn(C??{});let We=ke;for(let Ct=0;Ct<G.length-1;Ct+=1){const Vs=G[Ct];We[Vs]=Bn(We[Vs]??{}),We=We[Vs]}return We[G.at(-1)]=ae,ke}function ya(C){var G;return Object.hasOwn(U.value,C)?U.value[C]:Bn((G=e.value)==null?void 0:G[C])}function qt(C,G,ae={}){var un;if(n.value||No.has(C.path.split(".")[0]))return;const[ke,...We]=C.path.split(".");An(C.path,!!ae.coalesce);const Ct=ya(ke),Vs=We.length?da(Ct,We,G):G,qs={...U.value};if(Ei(Vs,(un=e.value)==null?void 0:un[ke])?delete qs[ke]:qs[ke]=Vs,U.value=qs,W.value[C.path]){const xa={...W.value};delete xa[C.path],W.value=xa}}function ua(C){re={path:null,at:0},T.value={...T.value,[C]:String(yt(A.value,C)??"")}}function as(C){if(re={path:null,at:0},!Object.hasOwn(T.value,C))return;const G={...T.value};delete G[C],T.value=G}function dn(C){const G=T.value[C.path];if(re={path:null,at:0},G===""){if(C.nullable){as(C.path),qt(C,null,{coalesce:!0});return}W.value={...W.value,[C.path]:"Enter a number."};return}const ae=Number(G);if(Number.isNaN(ae)||C.type==="integer"&&!Number.isInteger(ae)){W.value={...W.value,[C.path]:C.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ke={...T.value};delete ke[C.path],T.value=ke,qt(C,ae,{coalesce:!0})}function Rn(C){return Object.hasOwn(T.value,C.path)?T.value[C.path]:C.value??""}function li(C,G){if(T.value={...T.value,[C.path]:G},G===""){if(C.nullable){qt(C,null,{coalesce:!0});return}W.value={...W.value,[C.path]:"Enter a number."};return}const ae=Number(G);if(!Number.isFinite(ae)||C.type==="integer"&&!Number.isInteger(ae)){W.value={...W.value,[C.path]:C.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(W.value[C.path]){const ke={...W.value};delete ke[C.path],W.value=ke}qt(C,ae,{coalesce:!0})}function oi(C){const G=Number.parseInt($.value,10);if(!Number.isInteger(G)||G<1){W.value={...W.value,[C.path]:"Warning thresholds must be positive whole numbers."};return}const ae=[...new Set([...C.value||[],G])].sort((ke,We)=>We-ke);$.value="",qt(C,ae)}function ri(C,G){qt(C,(C.value||[]).filter(ae=>ae!==G))}function ns(C){return C.apply_mode==="live_read"?"Odin reads the saved file value on next use.":C.apply_mode==="live_for_new_work"?"New work uses the saved file value.":C.apply_mode==="live_apply"?C.apply_handler?`Apply the saved value through ${C.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":C.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":C.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":C.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function In(C){return C.type==="array"&&Array.isArray(C.value)&&!C.structured_container&&!C.structured_container_child&&C.sensitivity==="public"&&C.value.every(G=>["string","number","boolean"].includes(typeof G))}function Ae(C){const G=String(Q.value[C.path]??"").trim();if(!G)return;const ae=[...new Set([...C.value||[],G])];Q.value={...Q.value,[C.path]:""},qt(C,ae)}function N(C,G){qt(C,(C.value||[]).filter(ae=>ae!==G))}function de(C,G){var ke;if(!C)return null;if((ke=C.enum)!=null&&ke.length&&!C.enum.includes(G))return`Choose one of: ${C.enum.join(", ")}`;if(C.path==="agents.final_warning_iterations"&&(!Array.isArray(G)||!G.length))return"Add at least one warning threshold.";const ae=C.constraints||{};if((C.type==="integer"||C.type==="number")&&typeof G=="number"){if(ae.minimum!==void 0&&G<ae.minimum)return`Must be at least ${ae.minimum}${C.unit?` ${C.unit}`:""}`;if(ae.maximum!==void 0&&G>ae.maximum)return`Must be at most ${ae.maximum}${C.unit?` ${C.unit}`:""}`}return null}function xe(C){return we.value[C.path]||null}function Be(C){const G=`${C}.`;return Object.keys(we.value).some(ae=>ae===C||ae.startsWith(G))}function qe(){n.value||M.value.length&&(L.value.push(Bn(U.value)),U.value=M.value.pop(),W.value={},T.value={},re={path:null,at:0})}function Ze(){n.value||L.value.length&&(M.value.push(Bn(U.value)),U.value=L.value.pop(),W.value={},T.value={},re={path:null,at:0})}function Et(){!q.value||_e.value||(D.value=!0,le.value=!1)}function pt(){D.value=!1}function At(){cn()}function gs(C){return sC[C]||bi(C||"unknown")}function Nt(C){return`apply-${String(C||"unknown").replaceAll("_","-")}`}function Na(C){return`cfgc-field-${C.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function ci(C){return`${Na(C)}-input`}function mo(C){const G=document.getElementById(Na(C))||document.getElementById(Na(C.split(".").slice(0,2).join(".")));G==null||G.scrollIntoView({behavior:"smooth",block:"center"})}function Ma(C,G){y.value={type:C,message:G},window.setTimeout(()=>{var ae;((ae=y.value)==null?void 0:ae.message)===G&&(y.value=null)},3500)}function ac(){x.value=!1,R.value="pending_restart",E.value="";const C=tC(a.value);C&&(C.scrollTop=0)}function ho(){x.value=!1}function di(C=1800){Z&&window.clearTimeout(Z),Z=window.setTimeout(nc,C)}async function nc(){if(S.value){if(K+=1,K>45){S.value=!1,_.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await ml(),Ge.value===0){S.value=!1,_.value=null,Ma("success","Odin restarted and the saved startup settings are active.");return}}catch{}di(2e3)}}async function On(){if(!S.value){_.value=null;try{await j.post("/api/restart",{}),S.value=!0,K=0,x.value=!1,di()}catch(C){_.value=C.message||"Odin could not schedule a restart."}}}async function ic(){if(!(!q.value||_e.value||n.value)){n.value=!0;try{const C=rC(e.value,U.value),G=await j.put("/api/config",C);e.value=G,U.value={},M.value=[],L.value=[],W.value={},D.value=!1;try{t.value=await ml(),g.value=null,x.value=Ge.value>0,Ma("success",Ge.value?`Configuration saved. ${Ge.value} setting${Ge.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(ae){g.value=ae.message||"Unknown metadata error.",Ma("error",`Configuration saved, but apply status could not be refreshed: ${g.value}`)}}catch(C){Ma("error",C.message||"Configuration could not be saved")}finally{n.value=!1}}}async function Da(){if(!n.value){n.value=!0,b.value=null;try{t.value=await ml(),g.value=null}catch(C){b.value=`Image model status could not be refreshed: ${C.message||"Unknown error"}`}finally{n.value=!1}}}async function lc(C,G){if(n.value||!["follow","pin"].includes(G)||!C.length||C.some(ke=>{var We,Ct;return!I.includes(ke)||!((Ct=(We=t.value)==null?void 0:We.image_model_defaults)!=null&&Ct[ke])}))return;n.value=!0,b.value=null;let ae=!1;try{const ke=await j.post("/api/config/image-models",{operations:Object.fromEntries(C.map(We=>[We,G])),expected_revision:t.value.image_model_revision});ae=!0;for(const We of C){const Ct=`image.openai.${We}`,Vs=yt(e.value,Ct),qs=yt(ke.config,Ct),un=xa=>!Object.hasOwn(xa,"image")||!Ei(yt(xa,Ct),Vs)?xa:da(xa,Ct.split("."),qs);U.value=un(U.value),M.value=M.value.map(un),L.value=L.value.map(un),e.value=da(e.value,Ct.split("."),qs)}t.value={...t.value,image_model_defaults:ke.image_model_defaults,image_model_revision:ke.image_model_revision},Ma("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(ke){b.value=`Image model operation failed: ${ke.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await ml(),g.value=null}catch(ke){const We=`Image model status could not be refreshed: ${ke.message||"Unknown error"}`;g.value=We,b.value=ae?`Image model defaults were saved, but ${We}`:`${b.value} ${We}`}finally{n.value=!1}}async function Xi(){var C,G;if(!(q.value||n.value)){s.value=!0,k.value=null;try{const ae=await j.get("/api/config"),ke=await ml();await m(),e.value=ae,t.value=ke,g.value=null;const We=Ne.value;if(We.some(Ct=>Ct.key===w.value)||(w.value=((C=We[0])==null?void 0:C.key)||$i[0].key),oe.value){const Vs=(((G=We.find(qs=>qs.key===w.value))==null?void 0:G.sections)||[]).find(qs=>O.value[qs]===!0);O.value=Vs?{...O.value,[Vs]:!0}:{}}}catch(ae){k.value=ae.message||"Unknown configuration error"}finally{s.value=!1}}}function Pa(C){if(D.value||!(C.ctrlKey||C.metaKey))return;const G=C.target;G instanceof HTMLElement&&(G.matches("input, textarea, select")||G.isContentEditable)||(!C.shiftKey&&C.key.toLowerCase()==="z"?(C.preventDefault(),qe()):(C.key.toLowerCase()==="y"||C.shiftKey&&C.key.toLowerCase()==="z")&&(C.preventDefault(),Ze()))}function el(C){oe.value=C.matches}Jt(O,C=>{try{localStorage.setItem(Sg,JSON.stringify(C))}catch{}},{deep:!0});let ui=!1;function tl(){ui||(ui=!0,document.addEventListener("keydown",Pa))}function sl(){ui&&(ui=!1,document.removeEventListener("keydown",Pa))}return tt(()=>{var C;Xi(),tl(),z=window.matchMedia("(max-width: 760px)"),el(z),(C=z.addEventListener)==null||C.call(z,"change",el)}),rs(tl),Zt(sl),Zt(()=>{o.value=""}),wt(()=>{var C;o.value="",sl(),(C=z==null?void 0:z.removeEventListener)==null||C.call(z,"change",el),Z&&window.clearTimeout(Z)}),{listenerState:i,listenerConsent:l,listenerCredential:o,listenerSaving:r,listenerMessage:c,listenerError:d,listenerStatusError:u,listenerChoiceChanged:fe,listenerStatusTone:B,listenerStatusLabel:J,listenerAuthorizationCopy:ue,listenerConfiguredSourceCopy:V,listenerRunningCopy:ee,saveListenerConsent:h,armKeydown:tl,disarmKeydown:sl,handleKeydown:Pa,config:e,meta:t,loading:s,saving:n,error:k,toast:y,metaRefreshError:g,restartPromptOpen:x,restartScheduled:S,restartError:_,configMain:a,imageModelError:b,imageModelLeaves:I,setImageModelDefaults:lc,refreshImageModelMetadata:Da,searchQuery:E,healthFilter:R,activeCategory:w,reviewOpen:D,mobileOverflowOpen:le,warningThresholdInput:$,arrayInputs:Q,healthFilters:pe,visibleCategories:Ne,displayGroups:ye,reviewGroups:Ke,sectionCount:ne,fieldCount:ie,hasChanges:q,changeCount:te,changedSectionCount:be,hasDraftErrors:_e,canUndo:me,canRedo:ge,globalFilterActive:he,reviewRestartCount:je,pendingRestartCount:Ge,pendingRestartFields:Fe,healthCount:Ms,categoryStats:rn,selectCategory:ze,selectHealthFilter:nt,clearFilters:kt,sectionLabel:Le,sectionDescription:se,sectionFieldCount:Ee,sectionHealthCount:vt,sectionApplySummary:Ue,sectionApplyDetails:dt,sectionEntries:Qt,fieldGroups:Xs,sectionSearchHits:Tn,mcpConfigSummary:ft,fieldRuntimeCopy:ea,fieldSpecificRuntimeNote:ca,hasHonestAction:hs,runFieldAction:Ns,hasHostsCollection:Y,hostsConfigSummary:Te,sectionChanged:ce,fieldChanged:Re,isSectionExpanded:Ds,toggleSection:ii,discardAllDrafts:cn,setFieldValue:qt,setNumberFieldValue:li,numberInputValue:Rn,beginInputEdit:ua,endTextInputEdit:as,endInputEdit:dn,addWarningThreshold:oi,removeWarningThreshold:ri,isScalarArray:In,addScalarArrayItem:Ae,removeScalarArrayItem:N,fieldError:xe,sectionHasErrors:Be,undo:qe,redo:Ze,openReview:Et,closeReview:pt,mobileCancel:At,applyModeLabel:gs,applyClass:Nt,compactValue:lC,formatValue:oC,structuredApplyCopy:ns,fieldId:Na,fieldInputId:ci,focusField:mo,fetchConfig:Xi,saveConfig:ic,restartOdin:On,restartLater:ho,reviewPendingRestart:ac}}},pC=/^\d{15,25}$/;function Ag(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Rg={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1},showAddButton:{type:Boolean,default:!1}},emits:["select"],template:`
    <div :class="['discord-user-combobox', { 'discord-user-combobox-with-add': showAddButton }]">
      <input ref="input" v-model="query" type="text" class="hm-input"
             :placeholder="placeholder" role="combobox" :aria-label="ariaLabel"
             aria-autocomplete="list" :aria-expanded="open" :aria-controls="optionsId"
             :aria-activedescendant="activeOptionId"
             @focus="openOptions" @input="onInput"
             @keydown.down.prevent="highlightNext" @keydown.up.prevent="highlightPrevious"
             @keydown.enter.prevent="selectHighlighted" @keydown.escape="closeOptions"
             @blur="onBlur" />
      <button v-if="showAddButton" type="button" class="btn btn-ghost text-xs discord-user-combobox-add"
              :disabled="!selectableValue" @mousedown.prevent="selectHighlighted">Add</button>
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=H(()=>new Set((e.excludedIds||[]).map(String))),o=H(()=>{const _=s.value.toLowerCase().trim();return(e.members||[]).filter(E=>l.value.has(String(E.id))?!1:_?p(E).toLowerCase().includes(_)||String(E.username||"").toLowerCase().includes(_)||String(E.id).includes(_):!0)}),r=H(()=>{const _=s.value.trim();return o.value.length===0&&pC.test(_)&&!l.value.has(_)?_:""}),c=H(()=>o.value.length+(r.value?1:0)),d=H(()=>!!s.value.trim()&&!!(o.value[n.value]||r.value&&n.value===o.value.length)),u=H(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function p(_){return Ag(_)}function m(){a.value=!0,n.value=0}function h(){m()}function b(){const _=Math.max(c.value-1,0);n.value=Math.min(n.value+1,_)}function I(){n.value=Math.max(n.value-1,0)}function k(){const _=o.value[n.value];_?y(_):r.value&&n.value===o.value.length&&g(r.value)}function y(_){g(String(_.id))}function g(_){t("select",_),s.value="",a.value=!1,n.value=0}function x(){a.value=!1}function S(){setTimeout(x,150)}return tt(()=>{e.autofocus&&jt(()=>{var _;return(_=i.value)==null?void 0:_.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:u,selectableValue:d,memberName:p,openOptions:m,onInput:h,highlightNext:b,highlightPrevious:I,selectHighlighted:k,selectMember:y,selectId:g,closeOptions:x,onBlur:S}}};function Pf(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const fC={components:{DiscordUserCombobox:Rg},template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Discord Channels</h1>
        <button @click="fetchAll" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <section class="hm-card mb-4 discord-gateway-card">
        <div class="discord-gateway-summary">
          <div class="discord-gateway-heading">
            <h2 class="text-sm font-semibold text-gray-300">Gateway connection</h2>
            <span :class="['badge', connectionState.badgeClass]">{{ connectionState.label }}</span>
          </div>
          <p class="text-xs text-gray-500">{{ connectionState.detail }}</p>
          <div class="discord-credential-status">
            <span v-if="connection.credential_usable && !connectionToken" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
            <span v-else-if="!connection.credential_usable" class="provider-status text-xs text-amber-500"><span class="status-dot offline" aria-hidden="true"></span>No usable credential</span>
            <span class="discord-storage-note">{{ connection.credential_preferred_storage ? 'Stored in the preferred environment format' : (connection.credential_usable ? 'Legacy storage; replace to migrate' : 'Not stored') }}</span>
          </div>
        </div>
        <div class="discord-gateway-controls">
          <form class="discord-token-form" @submit.prevent="saveDiscordCredentials">
            <input v-model="connectionToken" class="hm-input credential-input" type="password" aria-label="Discord bot token"
                   autocomplete="new-password" autocapitalize="none" spellcheck="false"
                   :placeholder="connection.credential_usable ? '••••••••  (press Enter to replace)' : 'Discord bot token'"
                   :disabled="connectionBusy" @keydown.enter.prevent="saveDiscordCredentials" @input="connectionTokenDirty = true" />
            <button class="btn btn-primary text-xs" :disabled="connectionBusy || !connectionTokenDirty || !connectionToken">{{ connectionBusy ? 'Saving…' : 'Save and connect' }}</button>
          </form>
          <div class="discord-gateway-actions">
            <button class="btn btn-ghost text-xs" @click="connectDiscord" :disabled="connectionBusy || !connection.credential_usable">{{ connectionState.key === 'connected' ? 'Reconnect' : 'Connect' }}</button>
            <button class="btn btn-ghost text-xs" @click="detachDiscord" :disabled="connectionBusy">Detach</button>
          </div>
        </div>
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
          <div class="discord-global-toggles">
            <label>Require @mention by default
              <span class="toggle-switch"><input v-model="globalDraft.require_mention" type="checkbox" /><span class="toggle-slider"></span></span>
            </label>
            <label>Respond to bots by default
              <span class="toggle-switch"><input v-model="globalDraft.respond_to_bots" type="checkbox" /><span class="toggle-slider"></span></span>
            </label>
          </div>
          <div class="discord-global-rows">
            <div v-for="editor in globalListEditors" :key="editor.key" class="discord-global-row">
              <div class="discord-global-row-label"><strong>{{ editor.label }}</strong>
                <details class="discord-help">
                  <summary :aria-label="'About ' + editor.label">?</summary>
                  <p>{{ editor.description }}</p>
                </details>
              </div>
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
                                        :show-add-button="true"
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
  `,setup(){const e=f([]),t=f({persisted:!1,credential_usable:!1,credential_preferred_storage:!1,connection:{state:"unavailable",detail:"Connection status unavailable"}}),s=f(""),a=f(!1),n=f(!1),i=f(null);let l=null;const o=f(!0),r=f(null),c=f({}),d=f(null),u=f(null),p=f(!1),m=f(null),h=f({}),b=f([]);let I=0;const k=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search users",userAutocomplete:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Search channels"},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Bot ID",userAutocomplete:!0}]),y=H(()=>{var ge,Ne,A,P;const ie=String(((Ne=(ge=t.value)==null?void 0:ge.connection)==null?void 0:Ne.state)||"").toLowerCase();return{...{connected:{key:"connected",label:"Connected",badgeClass:"badge-success"},connecting:{key:"connecting",label:"Connecting",badgeClass:"badge-warning"},disconnected:{key:"disconnected",label:"Disconnected",badgeClass:""},detached:{key:"disconnected",label:"Disconnected",badgeClass:""},detaching:{key:"disconnected",label:"Disconnected",badgeClass:""},stopped:{key:"unavailable",label:"Unavailable",badgeClass:"badge-warning"},failed:{key:"unavailable",label:"Unavailable",badgeClass:"badge-warning"}}[ie]||{key:"unavailable",label:"Unavailable",badgeClass:"badge-warning"},detail:((P=(A=t.value)==null?void 0:A.connection)==null?void 0:P.detail)||"Connection status unavailable"}}),g=H(()=>JSON.stringify(d.value)!==JSON.stringify(u.value)),x=H(()=>new Map(b.value.map(ie=>[String(ie.id),ie])));function S(ie){return ie.config&&ie.config.enabled!==void 0?ie.config.enabled:!0}function _(ie){return Pf(ie,"require_mention",d.value)}function E(ie){return Pf(ie,"respond_to_bots",d.value)}function R(ie){return ie.config&&Object.keys(ie.config).length>0}function w(ie){c.value[ie]=!c.value[ie]}function O(ie){const pe=ie.discord||{};return{allowed_users:[...pe.allowed_users||[]],channels:[...pe.channels||[]],respond_to_bots:!!pe.respond_to_bots,require_mention:!!pe.require_mention,ignore_bot_ids:[...pe.ignore_bot_ids||[]]}}async function U({showLoading:ie=!0}={}){const pe=++I;ie&&(o.value=!0),r.value=null;try{const me=await j.get("/api/discord/guilds");pe===I&&(e.value=me)}catch(me){pe===I&&(r.value=me.message)}finally{ie&&pe===I&&(o.value=!1)}}async function T(){try{t.value=await j.get("/api/discord/connection"),i.value=null}catch(ie){i.value=ie.message}}async function $(ie,pe=null){if(!n.value){n.value=!0,i.value=null;try{const me={operation:ie};pe!==null&&(me.token=pe),t.value=await j.post("/api/discord/connection",me),ie==="credentials"&&(s.value="",a.value=!1)}catch(me){i.value=me.message||"Connection update failed."}finally{n.value=!1}}}function Q(){if(!(!a.value||!s.value))return $("credentials",s.value)}function W(){return $("connect")}function M(){return $("detach")}async function L(){o.value=!0,r.value=null;try{const[ie,pe,me]=await Promise.all([j.get("/api/discord/guilds"),j.get("/api/discord/members").catch(()=>[]),j.get("/api/config")]),ge=O(me),Ne=g.value;d.value=ge,Ne||(u.value=JSON.parse(JSON.stringify(ge))),b.value=pe,e.value=ie,m.value=null}catch(ie){r.value=ie.message}finally{o.value=!1}}let D=Promise.resolve();const le=f(new Set);function oe(ie,pe){const me=new Set(le.value);me.add(ie),le.value=me;const ge=D.then(pe);return D=ge.catch(()=>{}),ge.finally(()=>{const Ne=new Set(le.value);Ne.delete(ie),le.value=Ne})}function z(ie,pe,me,ge){const Ne=(ge==null?void 0:ge.target)??null;return oe(`guild:${ie}:${pe}`,async()=>{try{await j.put("/api/discord/guild/"+ie+"/config",{[pe]:me}),await U({showLoading:!1})}catch(A){r.value=A.message,Ne&&typeof me=="boolean"&&(Ne.checked=!me)}})}function Z(ie,pe,me,ge,Ne){const A=(Ne==null?void 0:Ne.target)??null;return oe(`channel:${ie}:${me}`,async()=>{try{await j.put("/api/discord/channel/"+ie+"/config",{[me]:ge}),await U({showLoading:!1})}catch(P){r.value=P.message,A&&typeof ge=="boolean"&&(A.checked=!ge)}})}function re(ie,pe){return oe(`channel:${ie}:clear`,async()=>{try{await j.put("/api/discord/channel/"+ie+"/config",{clear:!0}),await U({showLoading:!1})}catch(me){r.value=me.message}})}function K(ie,pe){const me=String(pe);if(!ie.userAutocomplete)return me;const ge=x.value.get(me);return ge?Ag(ge):me}function ve(ie,pe=null){const me=String(pe??h.value[ie]??"").trim();!me||u.value[ie].includes(me)||(u.value[ie]=[...u.value[ie],me],h.value={...h.value,[ie]:""})}function Me(ie,pe){u.value[ie]=u.value[ie].filter(me=>me!==pe)}async function ne(){if(!(!g.value||p.value)){p.value=!0,m.value=null;try{const pe=(await j.put("/api/config",{discord:u.value})).discord||u.value;d.value={allowed_users:[...pe.allowed_users||[]],channels:[...pe.channels||[]],respond_to_bots:!!pe.respond_to_bots,require_mention:!!pe.require_mention,ignore_bot_ids:[...pe.ignore_bot_ids||[]]},u.value=JSON.parse(JSON.stringify(d.value))}catch(ie){m.value=ie.message||"Global defaults could not be saved."}finally{p.value=!1}}}return tt(()=>{L(),T(),l=window.setInterval(T,5e3)}),wt(()=>{l!==null&&window.clearInterval(l),l=null}),{guilds:e,loading:o,error:r,expanded:c,globalDraft:u,globalSaving:p,globalError:m,globalArrayInputs:h,globalMembers:b,globalListEditors:k,globalChanged:g,guildEnabled:S,guildMention:_,guildBots:E,hasOverride:R,toggleGuild:w,fetchAll:L,fetchGuilds:U,setGuildConfig:z,setChannelConfig:Z,clearOverride:re,mutationPending:le,globalItemLabel:K,addGlobalItem:ve,removeGlobalItem:Me,saveGlobalDefaults:ne,connection:t,connectionState:y,connectionToken:s,connectionTokenDirty:a,connectionBusy:n,connectionError:i,saveDiscordCredentials:Q,connectDiscord:W,detachDiscord:M}}},Ws=e=>e==null?e:JSON.parse(JSON.stringify(e));function mC({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let m=null;const h=new Map;function b(_){d+=1;const E=c.then(_,_);return c=E.catch(()=>{}),E}function I(_,E){m=Ws(_),h.clear();for(const[R,w]of Object.entries(E||{}))h.set(R,Ws(w))}function k(_){const E=Ws(_),R=++u;return b(async()=>{try{await e(Ws(E)),m=Ws(E),R===u&&a(Ws(E))}catch(w){R===u&&(n(Ws(m)),r(w,{kind:"default"}))}})}function y(_,E){const R=Ws(E),w=(p.get(_)||0)+1;return p.set(_,w),b(async()=>{try{await t(_,Ws(R)),h.set(_,Ws(R)),w===p.get(_)&&i(_,Ws(R))}catch(O){w===p.get(_)&&(l(_,Ws(h.get(_)??null)),r(O,{kind:"user",uid:_}))}})}function g(_){const E=(p.get(_)||0)+1;return p.set(_,E),b(async()=>{try{await s(_),h.delete(_),E===p.get(_)&&o(_)}catch(R){E===p.get(_)&&(l(_,Ws(h.get(_)??null)),r(R,{kind:"delete",uid:_}))}})}async function x(){for(;;){const _=c;if(await _,_===c)return d}}async function S(_){for(;;){const E=await x(),R=await _();if(E===d)return R}}return{seed:I,saveDefault:k,saveUser:y,deleteUser:g,whenIdle:x,readSnapshot:S,get revision(){return d}}}const hC={components:{DiscordUserCombobox:Rg},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=H(()=>{const T={};for(const $ of r.value)T[$.id]=$;return T});function d(T){return c.value[T]||null}function u(T,$){return T?T.allowed_hosts===null||T.allowed_hosts===void 0?{allowed_hosts:[...$],default_host:T.default_host||"",allow_all:!0}:{allowed_hosts:T.allowed_hosts,default_host:T.default_host||"",allow_all:!1}:{allowed_hosts:[...$],default_host:$[0]||"",allow_all:!0}}const p=mC({applyDefault:async T=>{const $=T.allow_all?null:T.allowed_hosts;await j.put("/api/host-access/default-policy",{allowed_hosts:$,default_host:T.default_host})},applyUser:async(T,$)=>{const Q=$.allow_all?null:$.allowed_hosts;await j.put(`/api/host-access/user/${T}`,{allowed_hosts:Q,default_host:$.default_host})},applyDelete:T=>j.del(`/api/host-access/user/${T}`),onDefaultConfirmed:()=>Ce.success("Default policy updated"),onDefaultRollback:T=>{T&&(i.value=T)},onUserConfirmed:T=>{const $=d(T);Ce.success(`Updated access for ${$?$.display_name:T}`)},onUserRollback:(T,$)=>{const Q={...l.value};$?Q[T]=$:delete Q[T],l.value=Q},onUserDeleted:T=>{const $={...l.value};delete $[T],l.value=$},onError:(T,$)=>{var W;const Q=$.uid?` ${((W=d($.uid))==null?void 0:W.display_name)||$.uid}`:"";Ce.error(`${T.message||"Failed to save"} — reverted${Q}`)}});let m=0;async function h(){const T=++m;e.value=!0,t.value="";try{const $=await p.readSnapshot(()=>j.get("/api/host-access"));if(T!==m)return;s.value=$,a.value=$.available_hosts||[],n.value=$.host_descriptions||{},i.value=u($.default_policy,a.value);const Q=$.users||{},W={};for(const[M,L]of Object.entries(Q))W[M]=u(L,a.value);l.value=W,p.seed(i.value,W)}catch($){T===m&&(t.value=$.message||"Failed to fetch host access data")}finally{T===m&&(e.value=!1)}try{const $=await j.get("/api/discord/members")||[];T===m&&(r.value=$)}catch{T===m&&(r.value=[])}}const b=500,I=new Map;function k(T,$){const Q=I.get(T);Q&&clearTimeout(Q.timer);const W={run:$,timer:null};W.timer=setTimeout(()=>{I.delete(T),$()},b),I.set(T,W)}function y(T){const $=I.get(T);$&&(clearTimeout($.timer),I.delete(T))}function g(){for(const[T,$]of[...I])clearTimeout($.timer),I.delete(T),$.run()}function x(){k("default",()=>p.saveDefault(i.value))}function S(T,$){i.value.allow_all=!1,$?i.value.allowed_hosts.includes(T)||i.value.allowed_hosts.push(T):(i.value.allowed_hosts=i.value.allowed_hosts.filter(Q=>Q!==T),i.value.default_host===T&&(i.value.default_host=i.value.allowed_hosts[0]||"")),x()}function _(T){k(`user:${T}`,()=>{const $=l.value[T];$&&p.saveUser(T,$)})}function E(T,$,Q){const W=l.value[T];W&&(W.allow_all=!1,Q?W.allowed_hosts.includes($)||W.allowed_hosts.push($):(W.allowed_hosts=W.allowed_hosts.filter(M=>M!==$),W.default_host===$&&(W.default_host=W.allowed_hosts[0]||"")),_(T))}function R(T,$){const Q=l.value[T];Q&&(Q.default_host=$,_(T))}function w(){o.value=!0}function O(T){!/^\d{15,25}$/.test(T)||l.value[T]||(l.value[T]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(T,l.value[T]),o.value=!1)}async function U(T){const $=d(T);await os({title:"Remove user override",message:`Remove the host access override for ${$?$.display_name:T}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${T}`),await p.deleteUser(T),l.value[T]||Ce.success(`Removed override for ${$?$.display_name:T}`))}return tt(h),Zt(g),wt(g),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:h,saveDefaultPolicy:x,toggleDefaultHost:S,getMember:d,toggleUserHost:E,setUserDefault:R,openAddUser:w,addUserById:O,deleteUser:U,flushPendingSaves:g}}},vC={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),m=f(null),h=f(""),b=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),I=f(b()),k=H(()=>["127.0.0.1","localhost","::1"].includes(I.value.address));async function y(){t.value=!0,s.value="";try{const W=await j.get("/api/hosts");e.value=W.hosts||[],o.value=W.default_host||"",r.value=!!W.tofu_enabled}catch(W){s.value=W.message}finally{t.value=!1}}async function g(){try{await j.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),Ce.success("Host settings saved and published live"),await y()}catch(W){Ce.error(W.message)}}function x(){d.value="",u.value=[],p.value=!1,m.value=null,c.value=null,h.value="",l.value=1,n.value=!0}function S(){i.value=!1,I.value=b(),x()}function _(W){i.value=!0,I.value={...b(),...W},x()}async function E(){try{c.value=await j.get("/api/hosts/public-key")}catch(W){Ce.error(W.message)}}async function R(W){try{const M=await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/import-legacy",{});i.value=!0,I.value={...b(),...W,trust_mode:"pinned"},x(),d.value=M.candidate_token,u.value=M.fingerprints||[],h.value=u.value.join(`
`),l.value=4,Ce.info("Imported existing known_hosts trust. Test before activation.")}catch(M){Ce.error(M.message)}}async function w(){try{const W=h.value.split(/\s+/).filter(Boolean),M={...I.value,expected_fingerprints:W,candidate_fingerprints:u.value},L=await j.post("/api/hosts/candidates",M);if(d.value=L.candidate_token,u.value=L.fingerprints||[],I.value.trust_mode==="tofu"&&M.candidate_fingerprints.length===0){I.value.confirm_tofu=!1,Ce.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(W){Ce.error(W.message)}}async function O(){var W,M;p.value=!1,m.value=null;try{const L=await j.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!L.tested,m.value=L.last_test,p.value&&(l.value=5)}catch(L){const D=(W=L.data)==null?void 0:W.last_test;D&&typeof D=="object"&&!Array.isArray(D)&&(m.value=D);const le=(M=m.value)==null?void 0:M.detail;Ce.error(typeof le=="string"&&le.trim()?le:L.message)}}async function U(){try{await j.post("/api/hosts/candidates/"+d.value+"/commit",{}),Ce.success("Host saved and published live"),n.value=!1,await y()}catch(W){Ce.error(W.message)}}async function T(W){try{await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/enabled",{enabled:!W.enabled}),await y()}catch(M){Ce.error(M.message)}}async function $(W){var M;if(await os("Delete host "+W.alias+"? Dependencies will block deletion.")){a.value=[];try{await j.del("/api/hosts/"+encodeURIComponent(W.alias)),await y()}catch(L){a.value=Array.isArray((M=L.data)==null?void 0:M.pending_references)?L.data.pending_references:[],Ce.error(L.message)}}}async function Q(W){if(await os("Force revoke "+W.alias+"? Remote outcomes may be unknown."))try{await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/force-revoke",{}),await y()}catch(M){Ce.error(M.message)}}return tt(y),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:I,isLocal:k,keyInfo:c,candidate:d,observed:u,tested:p,testResult:m,fingerprintsText:h,load:y,saveSettings:g,beginAdd:S,beginEdit:_,loadKey:E,importLegacy:R,prepare:w,testConnection:O,commit:U,toggle:T,remove:$,forceRevoke:Q}}},gC={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=H(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=H(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function m(R){return R==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":R==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function h(){e.value=!0,t.value="";try{const R=await j.get("/api/tokens");s.value=R.tokens||[],a.value=R.available_hosts||[]}catch(R){t.value=R.message||"Failed to load tokens"}finally{e.value=!1}}function b(R){return!R||!R.trim()?[]:R.split(",").map(w=>w.trim()).filter(Boolean)}function I(R,w){const O=c.value.allowed_hosts;if(w&&!O.includes(R)&&O.push(R),!w){const U=O.indexOf(R);U>=0&&O.splice(U,1)}}function k(R,w){const O=d.value.allowed_hosts;if(w&&!O.includes(R)&&O.push(R),!w){const U=O.indexOf(R);U>=0&&O.splice(U,1)}}async function y(){var R;i.value=!0;try{const w=b(c.value.allowed_tools_str),O=c.value.host_mode,U=O==="none"?[]:O==="select"?c.value.allowed_hosts:null,T={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:w.length?w:[]};U!==null&&(T.allowed_hosts=U),T.default_host=c.value.default_host||"";const $=await j.post("/api/tokens",T);l.value=$.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,Ce.success("Token created"),await h()}catch(w){Ce.error(((R=w.data)==null?void 0:R.error)||w.message||"Failed to create token")}finally{i.value=!1}}function g(R){o.value=R;const w=R.allowed_hosts;let O="default";w==null?O="default":Array.isArray(w)&&w.length===0?O="none":Array.isArray(w)&&(O="select"),d.value={username:R.username||"",tier:R.tier||"admin",label:R.label||"",host_mode:O,allowed_hosts:Array.isArray(w)?[...w]:[],default_host:R.default_host||"",allowed_tools_str:(R.allowed_tools||[]).join(", ")}}async function x(){var R;if(o.value){r.value=!0;try{const w=b(d.value.allowed_tools_str),O=d.value.host_mode,U={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:w};O==="none"?U.allowed_hosts=[]:O==="select"?U.allowed_hosts=d.value.allowed_hosts:U.allowed_hosts=null,U.default_host=d.value.default_host||"",await j.put("/api/tokens/"+encodeURIComponent(o.value.user_id),U),o.value=null,Ce.success("Token updated"),await h()}catch(w){Ce.error(((R=w.data)==null?void 0:R.error)||w.message||"Failed to update")}finally{r.value=!1}}}async function S(R){var O;if(await os({title:"Regenerate token",message:`Regenerate token for ${R.username||R.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const U=await j.post("/api/tokens/"+encodeURIComponent(R.user_id)+"/regenerate");l.value=U.token,Ce.success("Token regenerated")}catch(U){Ce.error(((O=U.data)==null?void 0:O.error)||U.message||"Failed to regenerate")}}async function _(R){var O;if(await os({title:"Delete token",message:`Delete token for ${R.username||R.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/tokens/"+encodeURIComponent(R.user_id)),Ce.success("Token deleted"),await h()}catch(U){Ce.error(((O=U.data)==null?void 0:O.error)||U.message||"Failed to delete")}}async function E(){if(l.value)try{await navigator.clipboard.writeText(l.value),Ce.success("Copied to clipboard")}catch{Ce.error("Copy failed — select and copy manually")}}return tt(h),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:h,tierBadge:m,toggleCreateHost:I,toggleEditHost:k,createToken:y,startEdit:g,saveEdit:x,confirmRegenerate:S,confirmDelete:_,copyToken:E}}},bC=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort"]),yC=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),xC=Object.freeze(["enabled","base_url","model","max_tokens","num_ctx"]),_C=Object.freeze(["enabled","base_url","model","reasoning_effort"]);function po(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function Mo(e,t={}){const s=po(e,_C);return t.includeApiKey&&(s.api_key=e.api_key),s}function Pc(e){return po(e,["request_timeout_seconds","stream_stall_timeout_seconds","preset","model_profiles","context_utilization","openrouter"])}function Do(e){return po(e,bC)}function Po(e){return po(e,yC)}function $o(e,{includeApiKey:t=!1}={}){const s=po(e,xC);return t&&(s.api_key=e.api_key),s}function $c(e){return{timeout:e.timeout}}function Fo(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const wC={template:`
    <div ref="pageRoot" class="p-6 page-fade-in">
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
          <div class="space-y-4">
            <div>
              <label class="text-xs text-gray-400 block">Search model catalogue
                <input v-model="modelSelectorSearch" class="hm-input" placeholder="Filter Main, Agent, and Auxiliary choices" />
              </label>
            </div>
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
              <label v-if="selectedMainModel?.capability === 'reasoning' || (selectedMainModel?.provider === 'compat' && selectedMainModel?.capability === 'thinking')" class="text-xs text-gray-400 block mt-2">Reasoning
                <select :value="modelSelection.main_capability" @change="saveMainCapability($event.target.value)" class="hm-input">
                  <option v-for="effort in selectedMainModel?.provider === 'compat' ? neutralReasoningLevels : (selectedMainModel.efforts || reasoningEfforts)" :key="effort" :value="effort">{{ effort }}</option>
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
              <label v-if="agentCapabilityKind === 'reasoning'" class="text-xs text-gray-400 block mt-2">Agent Reasoning
                <select :value="selectedAgentCapabilityValue" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option value="">Inherit main capability</option>
                  <option value="auto">Auto — choose per spawn</option>
                  <option v-for="effort in agentCapabilityEfforts" :key="effort" :value="effort">{{ effort }}</option>
                </select>
              </label>
              <label v-else-if="agentCapabilityKind === 'thinking'" class="text-xs text-gray-400 block mt-2">Agent Thinking
                <select :value="selectedAgentCapabilityValue" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option value="">Inherit main capability</option>
                  <option value="auto">Auto — choose per spawn</option>
                  <option value="adaptive">Adaptive</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <label v-else-if="agentCapabilityKind === 'mixed'" class="text-xs text-gray-400 block mt-2">Agent Reasoning
                <select :value="selectedAgentCapabilityValue" @change="saveAgentCapability($event.target.value)" class="hm-input">
                  <option value="">Inherit main capability</option>
                  <option value="auto">Auto — choose per spawn</option>
                  <option v-for="level in neutralReasoningLevels" :key="level" :value="level">{{ level }}</option>
                </select>
              </label>
              <div class="mt-3">
                <p v-if="agentCapabilityKind === 'mixed' && autoAllowlistModels.some(model => model.capability !== 'none')" class="text-xs text-gray-400 mb-2">
                  Per-spawn reasoning: none / low / medium / high / xhigh / max. Each choice maps to the selected model's native capability; omission uses its allowlist default.
                </p>
                <button type="button" class="btn btn-primary" @click="allowlistModalOpen = true">Configure agent allowlist</button>
                <p class="text-xs text-gray-500 mt-2">{{ allowlistSummary }}<span v-if="agentsConfig.model !== 'auto'"> · Used when Agent model is Auto</span></p>
              </div>
              <Teleport to="body">
              <div v-if="allowlistModalOpen" class="modal-overlay" v-modal-focus
                   @click.self="closeAllowlistModal" @keyup.escape="closeAllowlistModal"
                   tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="agent-allowlist-title">
                <div class="modal-content" style="max-width:1000px;width:calc(100vw - 32px)">
                  <div class="flex items-center justify-between gap-3 mb-3">
                    <h2 id="agent-allowlist-title" class="text-lg font-semibold">Agent model allowlist</h2>
                    <button type="button" class="btn btn-ghost" @click="closeAllowlistModal">Close</button>
                  </div>
                  <p class="text-xs text-gray-400 mb-3">{{ allowlistSummary }}. Changes save immediately. Top to bottom is preference order.</p>
                  <p class="text-xs text-gray-500 mb-3">An empty stored list means the configured provider default, not no models. Keep at least one selected, or reset to that default.</p>
                  <button type="button" class="btn btn-ghost text-xs mb-3" :disabled="allowlistSaving || !agentsConfig.auto_model_allowlist.length" @click="resetAgentAllowlist">Reset to provider default</button>
                  <input v-model="openRouterSearch" aria-label="Search allowlist catalogue" class="hm-input mb-3" placeholder="Search model, vendor, or capability" />
                  <div v-for="group in autoAllowlistGroups" :key="group.id" class="mb-3">
                    <strong class="text-xs text-gray-400">{{ group.label }}</strong>
                    <label v-for="model in group.models" :key="'allow:' + model.ref" class="flex items-center gap-2 text-xs text-gray-300 mt-2">
                      <input type="checkbox" class="provider-control"
                             :checked="effectiveAllowlist.includes(model.ref)"
                             :disabled="allowlistSaving || (!agentModelAvailable(model) && !effectiveAllowlist.includes(model.ref))"
                             @change="toggleAgentAutoAllowlist(model.ref, $event)" />
                      {{ agentModelOptionLabel(model) }}
                    </label>
                  </div>
              <div v-if="openRouterRecognized" class="mt-3 space-y-3">
                <span class="block text-xs text-gray-400">OpenRouter catalogue</span>
                <p class="text-xs text-gray-500">Search the catalogue, add eligible models, then rank the selected list below. Provider pinning is configured per endpoint because routing churn destroys shared-prefix caching.</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select v-model="openRouterVendor" class="hm-input">
                    <option value="">All vendors</option>
                    <option v-for="vendor in openRouterVendors" :key="vendor" :value="vendor">{{ vendor }}</option>
                  </select>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input v-model.number="openRouterMaxPromptPrice" type="number" min="0" step="0.01" class="hm-input" placeholder="Maximum prompt $/M" />
                  <select v-model="openRouterQuantization" class="hm-input">
                    <option value="">All quantizations</option>
                    <option v-for="quant in openRouterQuantizations" :key="quant" :value="quant">{{ quant }}</option>
                  </select>
                </div>
                <div class="flex flex-wrap gap-3 text-xs text-gray-400">
                  <label class="flex items-center gap-2"><input v-model="openRouterToolsOnly" type="checkbox" class="provider-control" /> Tool-calling only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterEligibleOnly" type="checkbox" class="provider-control" /> Agent-eligible only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterStandardOnly" type="checkbox" class="provider-control" /> Standard variants only</label>
                  <label class="flex items-center gap-2"><input v-model="openRouterMeasuredCacheOnly" type="checkbox" class="provider-control" /> Measured cache only</label>
                </div>
                <div class="max-h-64 overflow-y-auto space-y-1 border border-gray-800 rounded p-2">
                  <div v-if="openRouterCatalogueLoading" class="text-xs text-gray-500">Loading OpenRouter catalogue…</div>
                  <div v-else-if="openRouterCatalogueError" class="text-xs text-red-400">{{ openRouterCatalogueError }}</div>
                  <div v-else class="text-xs text-gray-600 pb-1">Showing {{ openRouterResults.length }} of {{ openRouterMatchCount }} matches</div>
                  <div v-for="model in openRouterResults" :key="model.id" class="flex items-center justify-between gap-3 py-2 border-b border-gray-800 last:border-0">
                    <div class="min-w-0 text-xs">
                      <div class="font-mono text-gray-300 truncate">{{ model.id }}</div>
                      <div class="text-gray-500">{{ openRouterInlineFacts(model) }}</div>
                      <div v-if="!model.agent_eligible" class="text-amber-400">{{ model.agent_unavailable_reason }}</div>
                    </div>
                    <button type="button" class="btn btn-ghost text-xs" :disabled="allowlistSaving || !model.agent_eligible || effectiveAllowlist.includes('compat:' + model.id)" @click="prepareOpenRouterModel(model)">{{ effectiveAllowlist.includes('compat:' + model.id) ? 'Selected' : 'Add' }}</button>
                  </div>
                </div>
                <div v-if="openRouterPendingModel" class="border border-amber-700/50 rounded p-3 space-y-2">
                  <strong class="text-xs text-gray-300">Choose a provider for {{ openRouterPendingModel.id }}</strong>
                  <p class="text-xs text-gray-500">A fixed provider preserves shared-prefix cache locality. The value saved is OpenRouter's lowercase endpoint tag.</p>
                  <div v-if="openRouterPendingLoading" class="text-xs text-gray-500">Loading provider routes…</div>
                  <div v-else class="space-y-2">
                    <label class="text-xs text-gray-400 block">Compare providers by
                      <select v-model="openRouterEndpointSort" class="hm-input">
                        <option value="throughput">Highest p50 throughput</option>
                        <option value="latency_p99">Lowest p99 latency</option>
                        <option value="input_price">Lowest input price</option>
                        <option value="cache_price">Lowest cache-read price</option>
                        <option value="quantization">Quantization</option>
                      </select>
                    </label>
                    <div class="overflow-x-auto"><table class="w-full text-xs">
                      <thead><tr class="text-left text-gray-500"><th>Pin</th><th>Provider/tag</th><th>Input</th><th>Cache read</th><th>TPS p50</th><th>Latency p50 / p99</th><th>Quant</th><th>Tools</th><th>Measured cache</th></tr></thead>
                      <tbody>
                        <tr v-for="(endpoint, index) in openRouterSortedPendingEndpoints" :key="endpoint.tag + ':' + index" :class="!endpoint.supports_tools && 'opacity-50'">
                          <td><input v-model="openRouterPendingTag" type="radio" :value="endpoint.tag" :disabled="!endpoint.supports_tools" /></td>
                          <td>{{ endpoint.provider_name }}<br /><code>{{ endpoint.tag }}</code></td>
                          <td>{{ openRouterRate(endpoint.pricing?.prompt_per_token) }}</td>
                          <td>{{ openRouterRate(endpoint.pricing?.cache_read_per_token) }}</td>
                          <td>{{ openRouterMetric(endpoint.throughput_last_30m, 'p50') }}</td>
                          <td>{{ openRouterMetric(endpoint.latency_last_30m, 'p50') }} / {{ openRouterMetric(endpoint.latency_last_30m, 'p99') }}</td>
                          <td :class="endpoint.quantization === 'fp4' && 'text-amber-400'">{{ endpoint.quantization }}</td>
                          <td>{{ endpoint.supports_tools ? 'yes' : 'no' }}</td>
                          <td>{{ openRouterEndpointCacheFact(openRouterPendingModel.id, endpoint.provider_name) }}<span v-if="openRouterRouteWarning(endpoint)" class="block text-amber-400">{{ openRouterRouteWarning(endpoint) }}</span></td>
                        </tr>
                      </tbody>
                    </table></div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="btn btn-primary text-xs" :disabled="allowlistSaving || !openRouterPendingTag || openRouterPendingLoading" @click="addOpenRouterModel(openRouterPendingModel, openRouterPendingTag)">Add pinned</button>
                    <button type="button" class="btn btn-ghost text-xs" :disabled="allowlistSaving || openRouterPendingLoading" @click="addOpenRouterModel(openRouterPendingModel, '')">Add unpinned anyway</button>
                    <button type="button" class="btn btn-ghost text-xs" @click="cancelOpenRouterPending">Cancel</button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button type="button" class="btn btn-ghost text-xs" @click="quickAddOpenRouter" :disabled="allowlistSaving || !openRouterCatalogue?.quick_add?.length">Quick-add curated</button>
                </div>
              </div>
                <div>
                  <strong class="text-xs text-gray-400">Selected order</strong>
                  <div v-for="ref in effectiveAllowlist" :key="'selected:' + ref" class="mt-2 border border-gray-800 rounded p-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-mono text-xs text-gray-300 break-all">{{ ref }}</span>
                      <div class="flex gap-1">
                        <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(ref, -1)" @click="moveAgentAutoAllowlist(ref, -1)">Up</button>
                        <button type="button" class="btn btn-ghost text-xs" :disabled="!canMoveAllowlist(ref, 1)" @click="moveAgentAutoAllowlist(ref, 1)">Down</button>
                        <button type="button" class="btn btn-ghost text-xs" :disabled="allowlistSaving || effectiveAllowlist.length === 1" @click="removeOpenRouterModel(ref)">Remove</button>
                      </div>
                    </div>
                    <p v-if="selectedUnavailableReason(ref)" class="text-xs text-amber-400 mt-1">Excluded: {{ selectedUnavailableReason(ref) }}</p>
                    <p class="text-xs text-gray-500 mt-1">{{ selectedModelFacts(ref) }}</p>
                    <button v-if="openRouterModelMap.get(ref)" type="button" class="btn btn-ghost text-xs mt-2" @click="prepareOpenRouterModel(openRouterModelMap.get(ref))">
                      {{ openRouterPin(ref) ? 'Change pinned provider: ' + openRouterPin(ref) : 'Choose provider pin' }}
                    </button>
                    <input :value="agentsConfig.model_selection_hints?.[ref] || ''" @change="saveModelHint(ref, $event.target.value)" class="hm-input mt-2" :placeholder="'Operator hint for ' + ref" />
                    <label v-if="allowlistModel(ref)?.capability === 'reasoning'" class="text-xs text-gray-400 block mt-2">Default reasoning
                      <select :value="allowlistEntryCapabilityValue(ref, 'reasoning_effort')" @change="saveAllowlistEntryCapability(ref, 'reasoning_effort', $event.target.value)" class="hm-input mt-1" :disabled="allowlistSaving">
                        <option value="">Inherit family default</option>
                        <option value="auto">Auto — choose per spawn</option>
                        <option v-for="effort in allowlistModelEfforts(ref)" :key="effort" :value="effort">{{ effort }}</option>
                      </select>
                    </label>
                    <label v-else-if="allowlistModel(ref)?.capability === 'thinking'" class="text-xs text-gray-400 block mt-2">Default thinking
                      <select :value="allowlistEntryCapabilityValue(ref, 'thinking_mode')" @change="saveAllowlistEntryCapability(ref, 'thinking_mode', $event.target.value)" class="hm-input mt-1" :disabled="allowlistSaving">
                        <option value="">Inherit family default</option>
                        <option value="auto">Auto — choose per spawn</option>
                        <option value="adaptive">Adaptive</option>
                        <option value="enabled">Enabled</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
              </div>
              </Teleport>
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
              <label class="text-xs text-gray-400 block">Default / fallback model
              <select v-model="compatibleForm.model" @change="saveCompatibleConfigDebounced"
                      class="hm-input">
                <option v-if="!visibleCompatibleModels.length" value="" disabled>No models available</option>
                <option v-for="m in visibleCompatibleModels" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
              <p class="text-xs mt-1" :class="compatibleCatalogueStatusClass">{{ compatibleCatalogueStatus }}</p>
            </div>
            <div>
              <span class="text-xs text-gray-400">API Key</span>
              <div class="flex items-center gap-2">
                <span v-if="llmStatus && llmStatus.openai_compatible.has_api_key && !compatibleForm.api_key" class="provider-status text-xs text-green-400"><span class="status-dot online" aria-hidden="true"></span>Configured</span>
                <input v-model="compatibleForm.api_key" type="password" aria-label="OpenAI-compatible API key" autocomplete="new-password" autocapitalize="none" spellcheck="false" @keydown.enter="saveCompatibleConfigNow" @input="compatibleKeyDirty = true"
                       :placeholder="llmStatus && llmStatus.openai_compatible.has_api_key ? '••••••••  (press Enter to replace)' : 'sk-...'"
                       class="hm-input credential-input flex-1" />
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
            <summary><span>Advanced Settings</span><small>Streaming timeouts</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Request timeout <small>seconds</small></span>
                  <input v-model.number="compatibleForm.request_timeout_seconds" type="number" min="60" max="86400" class="hm-input" />
                </label>
                <label><span class="llm-field-label">Stream stall timeout <small>seconds</small></span>
                  <input v-model.number="compatibleForm.stream_stall_timeout_seconds" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group single">
                <label><span class="llm-field-label">Agent context utilization</span><input v-model.number="compatibleForm.context_utilization" type="number" min="30" max="100" class="hm-input" /></label>
              </section>
              <section v-if="openRouterRecognized" class="llm-advanced-group">
                <header><strong>OpenRouter provider preferences</strong><span>Order uses lowercase endpoint tags, never display names. A per-model pin is preferred; disable fallbacks below to make it a hard pin.</span></header>
                <label><span class="llm-field-label">Default reasoning effort</span>
                  <select v-model="compatibleForm.openrouter.reasoning_effort" class="hm-input">
                    <option v-for="effort in reasoningEfforts" :key="effort" :value="effort">{{ effort === 'xhigh' ? 'X-high' : effort.charAt(0).toUpperCase() + effort.slice(1) }}</option>
                  </select>
                </label>
                <label><span class="llm-field-label">Pinned endpoint tags <small>comma-separated</small></span>
                  <input :value="compatibleForm.openrouter.order.join(', ')" @change="setOpenRouterList('order', $event.target.value)" class="hm-input" placeholder="alibaba" />
                </label>
                <label><span class="llm-field-label">Quantizations <small>comma-separated</small></span>
                  <input :value="compatibleForm.openrouter.quantizations.join(', ')" @change="setOpenRouterList('quantizations', $event.target.value)" class="hm-input" placeholder="fp8, bf16" />
                </label>
                <label><span class="llm-field-label">Route sort</span>
                  <select v-model="compatibleForm.openrouter.sort" class="hm-input"><option :value="null">OpenRouter default</option><option value="price">Price</option><option value="throughput">Throughput</option><option value="latency">Latency</option></select>
                </label>
                <label><span class="llm-field-label">Data collection</span>
                  <select v-model="compatibleForm.openrouter.data_collection" class="hm-input"><option :value="null">OpenRouter default</option><option value="deny">Deny</option><option value="allow">Allow</option></select>
                </label>
                <label class="flex items-center gap-2"><input v-model="compatibleForm.openrouter.allow_fallbacks" type="checkbox" class="provider-control" /><span class="text-xs text-amber-400">Allow fallback beyond preferred providers (including per-model pins)</span></label>
                <p class="text-xs text-gray-500">require_parameters is always sent when tools or reasoning are present. Measured cached-token ratios appear in the selected model list after real calls.</p>
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
              <label class="text-xs text-gray-400 block">Context Window
              <input v-model.number="ollamaForm.num_ctx" type="number" min="4096" max="2000000" @keydown.enter="saveOllamaConfigNow"
                     class="hm-input" />
              </label>
              <p class="text-xs text-gray-500 mt-1">Prompt tokens sent as Ollama <code>num_ctx</code>. Higher values require more host memory.</p>
            </div>
            <div>
              <label class="text-xs text-gray-400 block">API Key <span class="text-gray-600">(optional, for remote)</span>
              <input v-model="ollamaForm.api_key" type="password" autocomplete="new-password" autocapitalize="none" spellcheck="false" placeholder="Leave empty for local" @keydown.enter="saveOllamaConfigNow" @input="ollamaKeyDirty = true"
                     class="hm-input credential-input" />
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
  `,setup(){const e=f(!0),t=f(null),s=15e3;let a=null,n=!1,i=null,l=null;const o={codexBasic:null,codexAdvanced:null,ollamaBasic:null,ollamaAdvanced:null,compatibleBasic:null,compatibleAdvanced:null,auxiliary:null,mainModel:null,agents:null},r=v=>JSON.stringify(v),c=(v,F)=>{o[v]=r(F)},d=(v,F)=>o[v]!==null&&o[v]!==r(F),u=f(null),p=f(!1),m=f({main:"",main_capability:"medium",agent_capability:"adaptive"}),h=f(""),b=["none","low","medium","high","xhigh","max"],I=["none","low","medium","high","xhigh","max"],k=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),y=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna"],g=H(()=>{const v=u.value||{},F=v.model_catalogue||v.model_catalog||{},X=$e=>{var Xt,De,Ut;return((Xt=ye.value.model_profiles)==null?void 0:Xt[$e])||((Ut=(De=ye.value.openrouter)==null?void 0:De.catalogue_profiles)==null?void 0:Ut[$e])||null},Se=($e,Xt,De)=>Xt.map(Ut=>{var Yu,Qu;const zt=typeof Ut=="string"?Ut:Ut.name,Gs=$e==="compat"?X(zt):null;return{ref:$e==="codex"?Ut:`${$e}:${zt}`,name:zt,provider:$e,available:!!(De!=null&&De.enabled&&($e==="codex"?De.configured:(Yu=De.health)!=null&&Yu.healthy)),unavailable_reason:De!=null&&De.enabled?De!=null&&De.configured?!((Qu=De==null?void 0:De.health)!=null&&Qu.healthy)&&$e!=="codex"?"unreachable":"":"not configured":"disabled",capability:$e==="codex"||Gs!=null&&Gs.supports_reasoning?"reasoning":Gs!=null&&Gs.supports_thinking_mode?"thinking":"none",efforts:Gs==null?void 0:Gs.supported_efforts,profile:Gs}}),Pe=[...F.codex||Se("codex",y,v.codex),...F.compat||F.openai_compatible||[],...F.ollama||Se("ollama",se.value,v.ollama)].map($e=>typeof $e=="string"?{ref:$e,name:$e,provider:"codex",available:!0,capability:"reasoning"}:$e),ot=$e=>{const Xt=Pe.findIndex(De=>De.ref===$e.ref);Xt===-1?Pe.push($e):Pe[Xt]={...Pe[Xt],...$e}};for(const $e of Se("compat",yt.value,v.openai_compatible))ot($e);if(ns.value&&ut.value.length)for(const $e of ut.value){const Xt=`compat:${$e.id}`;ot({ref:Xt,name:$e.name||$e.id,provider:"compat",available:!0,unavailable_reason:"",capability:$e.supports_reasoning?"reasoning":"none",efforts:b.filter(De=>{var Ut;return(Ut=$e.supported_efforts)==null?void 0:Ut.includes(De)}),agent_available:$e.agent_eligible&&!!$e.profile,agent_unavailable_reason:$e.agent_unavailable_reason||""})}const Cs=new Set(Pe.map($e=>$e.ref));for(const $e of[m.value.main,Qe.value.model,...Mt.value])$e&&$e!=="auto"&&!Cs.has($e)&&Pe.unshift({ref:$e,name:$e.replace(/^(compat|ollama):/,""),provider:$e.split(":")[0]||"codex",available:!1,unavailable_reason:"unavailable",capability:$e.startsWith("ollama:")||$e.includes(":")?"none":"reasoning"});return Pe.filter($e=>!ns.value||$e.provider!=="compat"||$e.ref.slice(7).includes("/")).map($e=>$e.efforts?{...$e,efforts:b.filter(Xt=>$e.efforts.includes(Xt)&&!K($e.ref,Xt))}:$e)}),x=H(()=>[["codex","Codex"],["compat","OpenAI-compatible"],["ollama","Ollama"]].map(([v,F])=>({id:v,label:F,models:g.value.filter(X=>{if(X.provider!==v)return!1;const Se=h.value.trim().toLowerCase();return!Se||`${X.name} ${X.ref}`.toLowerCase().includes(Se)})})).filter(v=>v.models.length)),S=v=>v.available&&v.agent_available!==!1,_=v=>v.available?`${v.name}${v.agent_available===!1?` (${v.agent_unavailable_reason||"not agent-eligible"})`:""}`:oe(v),E=H(()=>[["codex","Codex"],["compat","OpenAI-compatible"],["ollama","Ollama"]].map(([v,F])=>({id:v,label:F,models:g.value.filter(X=>X.provider===v&&!(v==="compat"&&ns.value)&&`${X.ref} ${X.name}`.toLowerCase().includes(ba.value.trim().toLowerCase()))})).filter(v=>v.models.length)),R=H(()=>g.value.find(v=>v.ref===m.value.main)),w=H(()=>g.value.find(v=>v.ref===Qe.value.model)),O=v=>g.value.find(F=>F.ref===v),U=v=>{const F=O(v);return(F==null?void 0:F.provider)==="codex"?b.filter(X=>!K(v,X)):(F==null?void 0:F.efforts)||[]},T=v=>vs.value.find(F=>Ns(F)===v),$=(v,F)=>{const X=T(v);return typeof X=="string"?"":(X==null?void 0:X[F])||""},Q=H(()=>Mt.value.map(v=>O(v)).filter(v=>v&&S(v))),W=H(()=>[...new Set(Q.value.map(v=>v.capability!=="reasoning"?v.capability||"none":v.provider==="codex"?"codex_reasoning":"compatible_reasoning"))]),M=H(()=>W.value.length>1),L=H(()=>{var F;if(Qe.value.model!=="auto")return((F=w.value)==null?void 0:F.capability)||"none";if(M.value)return"mixed";const v=W.value[0]||"none";return v.endsWith("_reasoning")?"reasoning":v}),D=H(()=>{var v;return Qe.value.model==="auto"?b:((v=w.value)==null?void 0:v.efforts)||b}),le=H(()=>L.value==="thinking"?Qe.value.thinking_mode??k.value.agent_reasoning_effort??"":k.value.agent_reasoning_effort??""),oe=v=>`${v.name}${v.available?"":` (${v.unavailable_reason||"unavailable"})`}`,z=H(()=>{const v=k.value.model;return v&&!y.includes(v)?[v,...y]:y}),Z=H(()=>{const v=Qe.value.model;return v&&v!=="auto"&&!y.includes(v)?[v,...y]:y}),re={"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},K=(v,F)=>!!v&&!!F&&(re[v]||[]).includes(F),ve=H(()=>{const v=Qe.value.model;return v&&!v.includes(":")?v:null}),Me=v=>!K(k.value.model,v)&&!(k.value.agent_reasoning_effort===""&&K(ve.value,v)),ne=v=>{const F=Qe.value.model;return F==="auto"?!0:!K(F||k.value.model,v)},ie=H(()=>{const v=k.value.agent_reasoning_effort;return v==="auto"?null:v||k.value.reasoning_effort}),pe=v=>K(v,k.value.reasoning_effort)||Qe.value.model===""&&K(v,ie.value),me=v=>K(v,ie.value),ge=f({enabled:!1,model:"gpt-5.6-luna"}),Ne=f({unavailable_reason:null}),A=H(()=>{const v=ge.value.model;return v&&!y.includes(v)?[v,...y]:y});function P(v){const F=v.target.value;ge.value.enabled=F!=="",F!==""&&(ge.value.model=F),F.startsWith("compat:")&&ns.value?Pa(ke(F),We(F)).then(()=>Nn()).catch(X=>He(X.message||"Failed to prepare OpenRouter model","error")):Nn()}const q=f(!1),fe=f({codex:!1,ollama:!1,compatible:!1}),B=f(null),J=f(!1),ue=f(""),V=f(null),ee=f(!1);let te=0;const be=H(()=>{var v;return Object.entries(((v=B.value)==null?void 0:v.models)||{}).map(([F,X])=>{var Se,Pe,ot;return{model:F,floor:X.floor,override:X.override,effectiveBudget:(Se=X.effective)==null?void 0:Se.effective_budget,configuredPrimaryChars:(Pe=X.configured)==null?void 0:Pe.primary_chars,primaryChars:(ot=X.effective)==null?void 0:ot.primary_chars,provenance:X.provenance,clampExpiresAt:X.clamp_expires_at,densityPriorMilli:X.density_prior_milli,densityScope:X.density_scope,workloadCalibration:X.workload_calibration}})}),he=H(()=>{var v;return((v=B.value)==null?void 0:v.clamps)||[]}),we=H(()=>{var v,F;return((F=(v=B.value)==null?void 0:v.models)==null?void 0:F[k.value.model])||null}),_e=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,num_ctx:32768,timeout:300}),ye=f({enabled:!1,base_url:"https://api.deepseek.com/v1",api_key:"",model:"deepseek-v4-flash",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,preset:"deepseek",reasoning_effort:"medium",model_profiles:{},context_utilization:75,openrouter:{order:[],allow_fallbacks:!0,quantizations:[],sort:null,data_collection:null,reasoning_effort:"medium",model_pins:{},catalogue_profiles:{}}}),Ke=f(!1),je=f(!1),Fe=f(!1),Ge=f(!1),st=f(!1),Ye=f(!1);function Y(){var F,X,Se;return!!(((F=t.value)==null?void 0:F.contains(document.activeElement))&&((Se=(X=document.activeElement)==null?void 0:X.matches)==null?void 0:Se.call(X,'input, textarea, select, [contenteditable="true"]'))||ca.value||vo.value!==null||ee.value||Ke.value||je.value||hs.value||Fe.value||Ge.value||st.value||q.value||fi.pending()||mi.pending()||Mn.pending()||Nn.pending()||d("codexBasic",Do(k.value))||d("codexAdvanced",Po(k.value))||d("ollamaBasic",$o(_e.value))||d("ollamaAdvanced",$c(_e.value))||d("compatibleBasic",Mo(ye.value))||d("compatibleAdvanced",Pc(ye.value))||d("auxiliary",ge.value)||d("mainModel",m.value.main)||d("agents",Qe.value))}function Te(){o.codexBasic=r(Do(k.value)),o.codexAdvanced=r(Po(k.value)),o.ollamaBasic=r($o(_e.value)),o.ollamaAdvanced=r($c(_e.value)),o.compatibleBasic=r(Mo(ye.value)),o.compatibleAdvanced=r(Pc(ye.value)),o.auxiliary=r(ge.value),o.mainModel=r(m.value.main)}const Ee=f({configured:null}),Le=f(!1),se=f([]),Oe=f(""),Ue=f(!1),dt=f(!1),Bt=f({configured:null}),ft=f(!1),yt=f([]),Qt=H(()=>ns.value?ut.value.map(v=>v.id):yt.value),cs=f(""),Xs=f(!1),ea=f(!1),Qe=f({model:"auto",thinking_mode:null,auto_model_allowlist:[]}),ca=f(!1),hs=f(!1),Ns=v=>typeof v=="string"?v:v==null?void 0:v.model,vs=H(()=>(Qe.value.auto_model_allowlist||[]).map(v=>typeof v=="string"?v:{...v}).filter(v=>Ns(v))),Tn=H(()=>!k.value.enabled&&ye.value.enabled?ye.value.model?[`compat:${ye.value.model}`]:[]:!k.value.enabled&&!ye.value.enabled&&_e.value.enabled?_e.value.model?[`ollama:${_e.value.model}`]:[]:y),Mt=H(()=>vs.value.length?vs.value.map(Ns):Tn.value),vt=H(()=>{var v;return(v=Qe.value.auto_model_allowlist)!=null&&v.length?`Allowlist: ${Mt.value.length} models`:`Default: ${Mt.value.join(", ")||"no available agent models"}`}),Ms=new Map;function rn(){ca.value=!1,G()}const ce=v=>{if(ns.value&&v.startsWith("compat:")&&!v.slice(7).includes("/"))return"OpenRouter requires a namespaced vendor/model ID; this is a direct-endpoint profile.";const F=g.value.find(X=>X.ref===v);return F?S(F)?"":F.agent_unavailable_reason||F.unavailable_reason||"Not agent-eligible":"Model is absent from the current endpoint catalogue."},Re=v=>{if(Et.value.has(v))return gs(v);const F=g.value.find(Se=>Se.ref===v),X=(F==null?void 0:F.hint_metadata)||{};return[X.hint||X.hint_derived,X.as_of&&`as of ${X.as_of}`,X.scope_note,X.evidence&&`Evidence: ${X.evidence}`,F&&qs(F)].filter(Boolean).join(" · ")||"No catalogue hint. Add an operator hint below."},ze=f(null),nt=f(!1),kt=f(""),ut=H(()=>{var v;return(((v=ze.value)==null?void 0:v.models)||[]).map(F=>{var Se,Pe,ot;const X=((Se=ye.value.model_profiles)==null?void 0:Se[F.id])||F.profile||((ot=(Pe=ye.value.openrouter)==null?void 0:Pe.catalogue_profiles)==null?void 0:ot[F.id])||(F.context_length>0&&F.max_completion_tokens>0?{total_window_tokens:F.context_length,max_output_tokens:F.max_completion_tokens}:null);return{...F,profile:X}})}),ba=f(""),Ds=f(""),ii=f(!0),En=f(!0),cn=f(!0),An=f(!1),da=f(null),ya=f(""),qt=f(null),ua=f(""),as=f([]),dn=f(!1),Rn=f("throughput"),li=(v,F,X=null)=>{const Se=v[F],Pe=X&&Se&&typeof Se=="object"?Se[X]:Se,ot=Number(Pe);return Number.isFinite(ot)?ot:null},oi=H(()=>{const v=[...as.value],F=Rn.value;return v.sort((X,Se)=>{var zt,Gs;if(F==="quantization")return String(X.quantization).localeCompare(String(Se.quantization));const[Pe,ot,Cs]=F==="throughput"?["throughput_last_30m","p50",!0]:F==="latency_p99"?["latency_last_30m","p99",!1]:F==="cache_price"?["cache_read_per_token",null,!1]:["prompt_per_token",null,!1],$e=(zt=X.pricing)==null?void 0:zt[Pe],Xt=(Gs=Se.pricing)==null?void 0:Gs[Pe],De=ot?li(X,Pe,ot):$e==null?null:Number($e),Ut=ot?li(Se,Pe,ot):Xt==null?null:Number(Xt);return Number.isFinite(De)?Number.isFinite(Ut)?Cs?Ut-De:De-Ut:-1:1})}),ri=H(()=>{try{return new URL(ye.value.base_url).hostname}catch{return""}}),ns=H(()=>/(^|\.)openrouter\.ai$/i.test(ri.value)),In=H(()=>{var v,F;return ns.value?nt.value?"OpenRouter recognized · fetching catalogue…":kt.value?`OpenRouter recognized · catalogue failed: ${kt.value}`:`OpenRouter recognized · ${((F=(v=ze.value)==null?void 0:v.models)==null?void 0:F.length)||0} catalogue models loaded`:yt.value.length?`${yt.value.length} endpoint models loaded`:"Catalogue not loaded"}),Ae=H(()=>kt.value?"text-red-400":"text-gray-500"),N=H(()=>{var v;return[...new Set((((v=ze.value)==null?void 0:v.models)||[]).map(F=>F.vendor))].sort()}),de=H(()=>{var v;return[...new Set((((v=ze.value)==null?void 0:v.models)||[]).flatMap(F=>(F.endpoints||[]).map(X=>X.quantization)).filter(Boolean))].sort()}),xe=v=>{var F;return(((F=ze.value)==null?void 0:F.measured_cache)||[]).some(X=>X.model===v.id&&X.samples>0&&X.cached_percent>0)},Be=H(()=>{const v=ba.value.trim().toLowerCase();return ut.value.filter(F=>{var X;return!(v&&!`${F.id} ${F.name} ${F.vendor}`.toLowerCase().includes(v)||Ds.value&&F.vendor!==Ds.value||ii.value&&!F.supports_tools||En.value&&!F.agent_eligible||cn.value&&F.variant!=="standard"||An.value&&!xe(F)||da.value!=null&&Number((X=F.pricing)==null?void 0:X.prompt_per_token)*1e6>Number(da.value)||ya.value&&!(F.endpoints||[]).some(Se=>Se.quantization===ya.value))})}),qe=H(()=>Be.value.slice(0,100)),Ze=H(()=>Be.value.length),Et=H(()=>new Map(ut.value.map(v=>[`compat:${v.id}`,v]))),pt=v=>v==null?"n/a":`$${(Number(v)*1e6).toFixed(3)}/M`,At=v=>{var F,X,Se,Pe;return[v.vendor,v.context_length?`${Number(v.context_length).toLocaleString()} ctx`:"context unknown",`${pt((F=v.pricing)==null?void 0:F.prompt_per_token)} in`,`${pt((X=v.pricing)==null?void 0:X.completion_per_token)} out`,`${pt((Se=v.pricing)==null?void 0:Se.cache_read_per_token)} cache read`,`${pt((Pe=v.pricing)==null?void 0:Pe.cache_write_per_token)} cache write`,v.supports_tools?"tools":"no tools",v.supports_reasoning?"reasoning":"no reasoning",v.variant!=="standard"?v.variant:null].filter(Boolean).join(" · ")},gs=v=>{var Pe;const F=Et.value.get(v);if(!F)return"Catalogue facts unavailable";const X=(((Pe=ze.value)==null?void 0:Pe.measured_cache)||[]).filter(ot=>ot.model===F.id),Se=X.length?X.map(ot=>`${ot.upstream_provider}: ${ot.cached_percent}% cached`).join(" · "):"No measured cache evidence yet";return`${At(F)} · ${Se}${F.profile_conflict?" · operator profile conflicts with catalogue":""}`},Nt=H(()=>yt.value.map(v=>typeof v=="string"?v:v.name).filter(Boolean)),Na=async()=>{var F,X,Se;const v=(Se=(X=(F=u.value)==null?void 0:F.openai_compatible)==null?void 0:X.preset_catalogue)==null?void 0:Se[ye.value.preset];v&&(ye.value.base_url=v.base_url),Mn.cancel(),await ol()},ci=(v,F)=>{ye.value.openrouter[v]=F.split(",").map(X=>X.trim()).filter(Boolean)},mo=H(()=>se.value||[]),Ma=H(()=>{const v=[...y,...Nt.value.map(F=>`compat:${F}`),...mo.value.map(F=>`ollama:${F.name}`)];for(const F of[Qe.value.model,...Mt.value])F&&F!=="auto"&&!v.includes(F)&&v.unshift(F);return v}),ac=v=>v==="codex-auto-review"?"codex-auto-review (Codex alias → gpt-5.6-luna)":v;async function ho({poll:v=!1}={}){try{const F=await j.get("/api/agents/model");if(v&&Y())return;Qe.value={...Qe.value,...F},o.agents=r(Qe.value)}catch{}}async function di(){if(!ns.value){ze.value=null,kt.value="";return}nt.value=!0;try{ze.value=await j.get("/api/openrouter/catalogue"),kt.value=""}catch(v){kt.value=v.message||"Failed to load OpenRouter catalogue"}finally{nt.value=!1}}async function nc(){var v;try{(v=Qe.value.model)!=null&&v.startsWith("compat:")&&ns.value&&await Pa(ke(Qe.value.model),We(Qe.value.model));const F=await j.put("/api/agents/model",{model:Qe.value.model||null});Qe.value={...Qe.value,...F},o.agents=r(Qe.value),He("Agent model policy saved")}catch(F){He(F.message||"Failed to save agent model policy","error")}}const On=()=>[...vs.value.length?vs.value:Mt.value];async function ic(v,F){const X=On(),Se=X.findIndex(Cs=>Ns(Cs)===v);let Pe=null;if(F.target.checked&&Se<0&&X.push(Ms.get(v)||v),!F.target.checked&&Se>=0&&([Pe]=X.splice(Se,1)),!X.length){F.target.checked=!0,He("Keep one model selected. An empty list restores the provider default.","error");return}const ot=await Da(X,"Agent Auto allowlist saved");ot&&F.target.checked&&Ms.delete(v),ot&&!F.target.checked&&typeof Pe=="object"&&Ms.set(v,Pe),ot||(F.target.checked=Mt.value.includes(v))}async function Da(v,F){if(hs.value)return!1;hs.value=!0;try{const X=await j.put("/api/agents/model",{auto_model_allowlist:v});return Qe.value={...Qe.value,...X},o.agents=r(Qe.value),He(F),!0}catch(X){return He(X.message||"Failed to save agent allowlist","error"),!1}finally{hs.value=!1}}const lc=()=>Da([],"Provider default restored");async function Xi(v,F,X){const Se=Mt.value.map(Pe=>{const ot=T(Pe);if(Pe!==v)return ot||Pe;const Cs=typeof ot=="string"?{model:Pe}:{...ot||{model:Pe}};return delete Cs.reasoning_effort,delete Cs.thinking_mode,X&&(Cs[F]=X),Object.keys(Cs).length===1?Cs.model:Cs});await Da(Se,"Model default saved")}async function Pa(v,F=""){const[X,...Se]=v.split("/");if(!X||!Se.length)throw new Error("OpenRouter model id is not namespaced");return j.post(`/api/openrouter/models/${encodeURIComponent(X)}/${encodeURIComponent(Se.join("/"))}/select`,{provider_tag:F})}const el=(v,F)=>{var Se;const X=(((Se=ze.value)==null?void 0:Se.measured_cache)||[]).find(Pe=>Pe.model===v&&Pe.upstream_provider===F);return X?`${X.cached_percent}% cached over ${X.samples} calls`:"no measured cache evidence"},ui=v=>v==null?"n/a":`$${(Number(v)*1e6).toFixed(4)}/M`,tl=(v,F)=>{if(v==null)return"n/a";if(typeof v=="number")return Number(v).toLocaleString();const X=v[F];return X==null?"n/a":Number(X).toLocaleString()},sl=v=>{var Pe;const F=[];v.quantization==="fp4"&&F.push("fp4 quantization may change quality");const X=typeof v.latency_last_30m=="object"?Number((Pe=v.latency_last_30m)==null?void 0:Pe.p99):null,Se=Number(Qe.value.iteration_timeout_seconds||0)*1e3;return X&&Se&&X>Se&&F.push("p99 exceeds the agent iteration budget"),F.join("; ")};async function C(v){var F;qt.value=v,ua.value=((F=ye.value.openrouter.model_pins)==null?void 0:F[v.id])||"",dn.value=!0;try{const[X,...Se]=v.id.split("/"),Pe=await j.get(`/api/openrouter/models/${encodeURIComponent(X)}/${encodeURIComponent(Se.join("/"))}/endpoints`);as.value=Pe.endpoints||[]}catch(X){as.value=[],He(X.message||"Failed to load OpenRouter provider routes","error")}finally{dn.value=!1}}function G(){qt.value=null,ua.value="",as.value=[]}async function ae(v,F=""){try{await Pa(v.id,F);const X=On(),Se=`compat:${v.id}`;if(X.some(ot=>Ns(ot)===Se)||X.push(Se),!await Da(X,F?"OpenRouter model added and provider pinned.":"OpenRouter model added unpinned."))return;G(),await _a()}catch(X){He(X.message||"Failed to add OpenRouter model","error")}}const ke=v=>v.startsWith("compat:")?v.slice(7):v,We=v=>{var F;return((F=ye.value.openrouter.model_pins)==null?void 0:F[ke(v)])||""},Ct=v=>Mt.value.length>1&&Da(On().filter(F=>Ns(F)!==v),"Model removed from allowlist");async function Vs(){var v,F;try{const X=On();for(const Se of((v=ze.value)==null?void 0:v.quick_add)||[])(F=Et.value.get(Se))!=null&&F.agent_eligible&&(await Pa(ke(Se),""),X.some(Pe=>Ns(Pe)===Se)||X.push(Se));await Da(X,"Curated OpenRouter models added"),await _a()}catch(X){He(X.message||"Failed to add curated OpenRouter models","error")}}function qs(v){const F=v.hint_metadata||{},X=[];return F.context_tokens&&X.push(`context ${Number(F.context_tokens).toLocaleString()}`),F.max_output_tokens&&X.push(`max output ${Number(F.max_output_tokens).toLocaleString()}`),F.structural_source&&X.push(`source ${F.structural_source}`),X.join("; ")}async function un(v,F){const X={...Qe.value.model_selection_hints||{}},Se=F.trim();Se?X[v]=Se:delete X[v];try{const Pe=await j.put("/api/agents/model",{model_selection_hints:X});Qe.value={...Qe.value,...Pe},o.agents=r(Qe.value),He("Model hint saved")}catch(Pe){He(Pe.message||"Failed to save model hint","error")}}function xa(v,F){const X=Mt.value.indexOf(v);return!hs.value&&X>=0&&X+F>=0&&X+F<Mt.value.length}async function Gg(v,F){const X=On(),Se=X.findIndex(Pe=>Ns(Pe)===v);Se<0||!xa(v,F)||([X[Se],X[Se+F]]=[X[Se+F],X[Se]],await Da(X,"Agent Auto allowlist order saved"))}const oc=f(!0),rc=f(""),ju=f({configured:null,accounts:[]}),cc=f(null),vo=f(null),dc=f(""),al=f(null),uc=f(!1),pc=f(null),Vu=f(null),qu=f("");let pi=null;function He(v,F="success"){Ce(v,F==="error"?"error":"success")}function Wg(v){if(!v)return"?";const F=v/(1024*1024*1024);return F>=1?F.toFixed(1)+" GB":(v/(1024*1024)).toFixed(0)+" MB"}function Kg(v){return Number.isFinite(Number(v))?Number(v).toLocaleString():"—"}function Jg(v){return v==null?"automatic (model-derived)":Number(v).toLocaleString()+" characters"}function Zg(v){const F=new Date(v);return Number.isNaN(F.getTime())?"unknown":F.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function Yg(v){return typeof v=="string"&&v.length>12?v.slice(0,8)+"…"+v.slice(-4):v}function Qg(v){return typeof v!="number"||!Number.isFinite(v)?"—":(v/1e3).toFixed(2)}function Xg(v){return v==="temporary learned clamp"?"is-clamp":v==="override"?"is-override":"is-built-in"}function eb(v){const F=k.value.context_budget_overrides[v.model];return v.floor!=null&&Number.isFinite(Number(F))&&Number(F)>v.floor}function tb(v,F){const X={...k.value.context_budget_overrides};F.target.value===""?delete X[v]:X[v]=Number(F.target.value),k.value.context_budget_overrides=X,ee.value=!0}function sb(v){k.value.context_utilization=v.target.value===""?"":Number(v.target.value),ee.value=!0}function ab(v){const F={...k.value.context_budget_overrides};delete F[v],k.value.context_budget_overrides=F,ee.value=!0}async function _a({quiet:v=!1,poll:F=!1}={}){if(!(F&&Y())){if(l&&await l,i)return i;v||(e.value=!0),i=(async()=>{await Promise.all([Ps({poll:F}),nl(),il(),ho({poll:F}),pa(),Ln({poll:F})]),await di(),Y()||Te()})();try{await i}finally{i=null,v||(e.value=!1)}}}async function nb(){if(!(Y()||i)){if(l)return l;l=Promise.all([Ps({poll:!0}),nl({refreshModels:!1}),il({refreshModels:!1}),ho({poll:!0}),pa(),Ln({poll:!0})]).then(()=>{Y()||Te()});try{await l}finally{l=null}}}async function Ps({preserveBasic:v=!1,preserveAdvanced:F=!1,poll:X=!1}={}){var Se,Pe,ot,Cs,$e,Xt;try{const De=await j.get("/api/llm/status"),Ut=X&&Y();u.value=De,p.value=!1,Ut||(m.value.main=De.main_model||De.active_model||(De.active_provider==="compat"?`compat:${((Se=De.openai_compatible)==null?void 0:Se.model)||""}`:De.active_provider==="ollama"?`ollama:${((Pe=De.ollama)==null?void 0:Pe.model)||""}`:((ot=De.codex)==null?void 0:ot.model)||"gpt-5.6-sol")),!Ut&&De.codex&&!fi.pending()&&(v||(k.value.enabled=De.codex.enabled,k.value.model=De.codex.model||"gpt-5.6-sol",k.value.reasoning_effort=De.codex.reasoning_effort||"medium",k.value.agent_reasoning_effort=De.codex.agent_reasoning_effort||""),F||(k.value.request_timeout_seconds=De.codex.request_timeout_seconds??k.value.request_timeout_seconds,k.value.stream_stall_timeout_seconds=De.codex.stream_stall_timeout_seconds??k.value.stream_stall_timeout_seconds,k.value.retry={...k.value.retry,...De.codex.retry||{}},k.value.connection_pool={...k.value.connection_pool,...De.codex.connection_pool||{}},k.value.context_compression={...k.value.context_compression,...De.codex.context_compression||{}},!ee.value&&!Fe.value&&(k.value.context_budget_overrides={...De.codex.context_budget_overrides||{}},k.value.context_utilization=De.codex.context_utilization??k.value.context_utilization))),!Ut&&De.ollama&&!mi.pending()&&(v||(_e.value.enabled=De.ollama.enabled,_e.value.base_url=De.ollama.base_url||"",_e.value.model=De.ollama.model||"",_e.value.max_tokens=De.ollama.max_tokens||4096,_e.value.num_ctx=De.ollama.num_ctx||32768),F||(_e.value.timeout=De.ollama.timeout??_e.value.timeout));const zt=De.openai_compatible;!Ut&&zt&&!Mn.pending()&&(v||(ye.value.enabled=zt.enabled,ye.value.base_url=zt.base_url||ye.value.base_url,ye.value.model=zt.model||ye.value.model,ye.value.preset=zt.preset||ye.value.preset,ye.value.reasoning_effort=zt.reasoning_effort||"medium"),F||(ye.value.request_timeout_seconds=zt.request_timeout_seconds??ye.value.request_timeout_seconds,ye.value.stream_stall_timeout_seconds=zt.stream_stall_timeout_seconds??ye.value.stream_stall_timeout_seconds,ye.value.model_profiles=zt.model_profiles||ye.value.model_profiles,ye.value.context_utilization=zt.context_utilization??ye.value.context_utilization,ye.value.openrouter={...ye.value.openrouter,...zt.openrouter||{}})),Ut||((Cs=m.value.main)!=null&&Cs.startsWith("compat:")?m.value.main_capability=(zt==null?void 0:zt.reasoning_effort)||"medium":($e=m.value.main)!=null&&$e.startsWith("ollama:")||(m.value.main_capability=((Xt=De.codex)==null?void 0:Xt.reasoning_effort)||"medium")),!Ut&&De.auxiliary&&(Ne.value=De.auxiliary,Nn.pending()||(ge.value.enabled=De.auxiliary.enabled,ge.value.model=De.auxiliary.model||"gpt-5.6-luna"))}catch{u.value||(u.value={active_provider:"",codex:{configured:null},ollama:{configured:null},openai_compatible:{configured:null}}),p.value=!0}}async function Ln({poll:v=!1}={}){const F=++te;J.value=!0,ue.value="";try{const X=await j.get("/api/context/windows");if(F!==te)return;B.value=X,!(v&&Y())&&!Fe.value&&!ee.value&&(k.value.context_budget_overrides=Object.fromEntries(Object.entries(X.models||{}).filter(([,Se])=>Se.override!=null).map(([Se,Pe])=>[Se,Pe.override])),k.value.context_utilization=X.utilization??k.value.context_utilization)}catch(X){F===te&&(ue.value=X.message||"Failed to load context budgets")}finally{F===te&&(J.value=!1)}}async function nl({refreshModels:v=!0}={}){try{if(Ee.value=await j.get("/api/ollama/status"),Le.value=!1,Ee.value.model&&(Oe.value=Ee.value.model),v&&Ee.value.configured)try{const F=await j.get("/api/ollama/models");se.value=F.models||[]}catch{se.value=[]}else if(v&&_e.value.base_url)try{const F=await j.post("/api/ollama/probe-models",{base_url:_e.value.base_url});se.value=F.models||[]}catch{se.value=[]}}catch{Le.value=!0}}async function pa(){oc.value=!0,rc.value="";try{ju.value=await j.get("/api/codex/status")}catch(v){rc.value=v.message||"Failed to fetch Codex status"}finally{oc.value=!1}}async function ib(){try{m.value.main.startsWith("compat:")&&ns.value&&await Pa(ke(m.value.main),We(m.value.main));try{await j.put("/api/llm/main-model",{model:m.value.main})}catch(v){if(!/404|not found/i.test(v.message||""))throw v;await j.post("/api/llm/switch",{model:m.value.main})}c("mainModel",m.value.main),He("Main model saved"),await _a()}catch(v){He(v.message||"Failed to save main model","error"),await Ps()}}async function lb(v){m.value.main_capability=v;const F=R.value;F&&(F.provider==="compat"&&F.capability!=="none"?(ye.value.reasoning_effort=v,await ol()):F.capability==="reasoning"?(k.value.reasoning_effort=v,await ll()):F.capability==="thinking"&&(await j.put("/api/openai-compatible/config",{thinking_mode:v}),He("Thinking mode saved")))}async function ob(v){m.value.agent_capability=v;const F=w.value,X=(F==null?void 0:F.capability)||L.value;if(X!=="none"){if(v===""||v==="auto"||X==="reasoning"||X==="mixed"){if(k.value.agent_reasoning_effort=v,X==="thinking"){const Se=await j.put("/api/agents/model",{thinking_mode:null});Qe.value={...Qe.value,...Se}}await ll()}else if(X==="thinking"){const Se=await j.put("/api/agents/model",{thinking_mode:v});Qe.value={...Qe.value,...Se},He("Agent thinking mode saved")}}}async function rb(){Ue.value=!0;try{const v=await j.post("/api/ollama/reload");He(v.configured?"Ollama reloaded":v.reason||"Ollama not configured",v.configured?"success":"error"),await _a()}catch(v){He(v.message||"Reload failed","error")}finally{Ue.value=!1}}async function cb(){dt.value=!0;try{await j.post("/api/ollama/model",{model:Oe.value}),He("Model set to "+Oe.value),await _a()}catch(v){He(v.message||"Failed","error")}finally{dt.value=!1}}async function db(){const v=_e.value.base_url;if(!v){He("Enter a base URL first","error");return}Ye.value=!0;try{const F=await j.post("/api/ollama/probe-models",{base_url:v});se.value=F.models||[],se.value.length?(He(se.value.length+" model(s) found"),!_e.value.model&&se.value.length&&(_e.value.model=se.value[0].name)):He("No models found at "+v,"error")}catch(F){He(F.message||"Could not reach Ollama","error")}finally{Ye.value=!1}}async function il({refreshModels:v=!0}={}){try{if(Bt.value=await j.get("/api/openai-compatible/status"),ft.value=!1,Bt.value.model&&(cs.value=Bt.value.model),v&&Bt.value.configured)try{const F=await j.get("/api/openai-compatible/models");yt.value=F.models||[]}catch{yt.value=[]}}catch{ft.value=!0}}async function ub(){Xs.value=!0;try{const v=await j.post("/api/openai-compatible/reload");He(v.configured?"OpenAI-compatible reloaded":v.reason||"OpenAI-compatible not configured",v.configured?"success":"error"),await _a()}catch(v){He(v.message||"Reload failed","error")}finally{Xs.value=!1}}async function pb(){ea.value=!0;try{await j.post("/api/openai-compatible/model",{model:cs.value}),He("Model set to "+cs.value),await _a()}catch(v){He(v.message||"Failed","error")}finally{ea.value=!1}}async function ll(){if(Fe.value){fi();return}Fe.value=!0;const v=Do(k.value);try{await j.put("/api/llm/codex/config",v),c("codexBasic",v),He("Codex config saved"),await Promise.all([Ps({preserveBasic:!0,preserveAdvanced:!0}),pa()])}catch(F){He(F.message||"Failed","error");const X=JSON.stringify(Do(k.value))!==JSON.stringify(v);await Promise.all([Ps({preserveBasic:X,preserveAdvanced:!0}),pa()])}finally{Fe.value=!1}}async function Gu(){if(Fe.value)return;Fe.value=!0;const v=Po(k.value);try{await j.put("/api/llm/codex/config",v),c("codexAdvanced",v),JSON.stringify({context_budget_overrides:k.value.context_budget_overrides,context_utilization:k.value.context_utilization})===JSON.stringify({context_budget_overrides:v.context_budget_overrides,context_utilization:v.context_utilization})&&(ee.value=!1),He("Codex advanced settings saved"),await Promise.all([Ps({preserveBasic:!0,preserveAdvanced:!0}),pa(),Ln()])}catch(F){He(F.message||"Failed","error");const X=JSON.stringify(Po(k.value))!==JSON.stringify(v);await Promise.all([Ps({preserveBasic:!0,preserveAdvanced:X}),pa(),Ln()])}finally{Fe.value=!1}}async function fc(){if(Ge.value){mi();return}Ge.value=!0;try{const v=Ke.value?_e.value.api_key:null,F=$o(_e.value,{includeApiKey:v!==null});await j.put("/api/llm/ollama/config",F),He("Ollama config saved"),v!==null&&_e.value.api_key===v&&(_e.value.api_key="",Ke.value=!1),c("ollamaBasic",$o(_e.value)),await Promise.all([Ps({preserveBasic:!0,preserveAdvanced:!0}),nl()])}catch(v){He(v.message||"Failed","error")}finally{Ge.value=!1}}async function Wu(){if(!Ge.value){Ge.value=!0;try{const v=$c(_e.value);await j.put("/api/llm/ollama/config",v),c("ollamaAdvanced",v),He("Ollama timeout saved"),await Promise.all([Ps({preserveBasic:!0,preserveAdvanced:!0}),nl()])}catch(v){He(v.message||"Failed","error")}finally{Ge.value=!1}}}async function ol(){if(st.value){Mn();return}st.value=!0;try{const v=je.value?ye.value.api_key:null,F=Mo(ye.value,{includeApiKey:v!==null});await j.put("/api/openai-compatible/config",F),He("OpenAI-compatible config saved"),v!==null&&ye.value.api_key===v&&(ye.value.api_key="",je.value=!1),c("compatibleBasic",Mo(ye.value)),await Promise.all([Ps({preserveBasic:!0,preserveAdvanced:!0}),il()]),await di()}catch(v){He(v.message||"Failed","error")}finally{st.value=!1}}async function Ku(){if(!st.value){st.value=!0;try{const v=Pc(ye.value);await j.put("/api/openai-compatible/config",v),c("compatibleAdvanced",v),He("OpenAI-compatible endpoint settings saved"),await Promise.all([Ps({preserveBasic:!0,preserveAdvanced:!0}),il()]),await di()}catch(v){He(v.message||"Failed","error")}finally{st.value=!1}}}async function fb(){if(q.value){Nn();return}q.value=!0;try{const v={...ge.value};await j.put("/api/llm/auxiliary/config",v),c("auxiliary",v),He("Auxiliary config saved"),await Ps()}catch(v){He(v.message||"Failed","error"),await Ps()}finally{q.value=!1}}const fi=Fo(ll),Nn=Fo(fb),mi=Fo(fc),Mn=Fo(ol),mb=()=>(fi.cancel(),ll()),hb=()=>(mi.cancel(),fc()),vb=()=>(Mn.cancel(),ol()),gb=()=>Gu(),bb=()=>Wu(),yb=()=>Ku();async function xb(v){const F=v.account_key+":"+v.model;V.value=F;try{const X=await j.post("/api/context/windows/clear",{account_key:v.account_key,model:v.model});He(X.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Ln()}catch(X){He(X.message||"Failed to clear clamp","error"),await Ln()}finally{V.value=null}}async function _b(v){try{await j.post("/api/codex/account/"+v+"/activate"),He("Active account switched"),await pa()}catch(F){He(F.message||"Failed","error")}}async function wb(v){cc.value=v;try{await j.post("/api/codex/account/"+v+"/refresh"),He("Token refreshed"),await pa()}catch(F){He(F.message||"Refresh failed","error")}finally{cc.value=null}}function kb(v,F){vo.value=v,dc.value=F||""}async function Sb(v){try{await j.put("/api/codex/account/"+v+"/label",{label:dc.value}),He("Label updated"),vo.value=null,await pa()}catch(F){He(F.message||"Failed","error")}}async function Cb(v,F){if(await os({title:"Delete Codex account",message:`Delete ${F||"account #"+(v+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/codex/account/"+v),He("Deleted. Pool reloaded."),await pa()}catch(Se){He(Se.message||"Failed","error")}}async function Tb(){uc.value=!0;try{const v=await j.post("/api/codex/device-code");pc.value=v,al.value="pending",Eb(v)}catch(v){He(v.message||"Failed","error")}finally{uc.value=!1}}async function Eb(v){pi={cancelled:!1};const F=pi;try{const X=await j.post("/api/codex/device-poll",{device_auth_id:v.device_auth_id,user_code:v.user_code,interval:v.interval});if(F.cancelled)return;Vu.value=X,al.value="success",await _a()}catch(X){if(F.cancelled)return;qu.value=X.message||"Device login failed",al.value="error"}}function Ab(){pi&&(pi.cancelled=!0),al.value=null,pc.value=null}function Ju(){n||(n=!0,_a(),a=window.setInterval(nb,s))}function Zu(){n&&(n=!1,a!==null&&window.clearInterval(a),a=null)}return tt(Ju),rs(Ju),Zt(Zu),wt(()=>{Zu(),pi&&(pi.cancelled=!0),fi.cancel(),Nn.cancel(),mi.cancel(),Mn.cancel()}),{pageRoot:t,allowlistModalOpen:ca,closeAllowlistModal:rn,allowlistSaving:hs,effectiveAllowlist:Mt,allowlistSummary:vt,resetAgentAllowlist:lc,selectedUnavailableReason:ce,selectedModelFacts:Re,loading:e,llmStatus:u,llmStatusLoadFailed:p,modelSelection:m,modelSelectorSearch:h,reasoningEfforts:b,neutralReasoningLevels:I,modelCatalog:g,modelGroups:x,selectedMainModel:R,selectedAgentModel:w,selectedAgentCapabilityValue:le,agentCapabilityKind:L,agentCapabilityEfforts:D,autoAllowlistModels:Q,allowlistModel:O,allowlistModelEfforts:U,allowlistEntryCapabilityValue:$,modelOptionLabel:oe,agentModelAvailable:S,agentModelOptionLabel:_,advancedOpen:fe,codexForm:k,codexModelOptions:z,codexAgentModelOptions:Z,mainEffortAllowed:Me,agentEffortAllowed:ne,mainModelOptionDisabled:pe,agentModelOptionDisabled:me,auxForm:ge,auxData:Ne,auxModelOptions:A,onAuxModelChange:P,savingAux:q,saveAuxConfigDebounced:Nn,ollamaForm:_e,compatibleForm:ye,savingCodex:Fe,savingOllama:Ge,savingCompatible:st,probingOllama:Ye,ollamaKeyDirty:Ke,compatibleKeyDirty:je,fetchCodexStatus:pa,ollamaStatus:Ee,ollamaStatusLoadFailed:Le,ollamaModels:se,ollamaSelectedModel:Oe,reloading:Ue,settingModel:dt,compatibleStatus:Bt,compatibleStatusLoadFailed:ft,compatibleModels:yt,visibleCompatibleModels:Qt,compatibleSelectedModel:cs,reloadingCompatible:Xs,settingCompatibleModel:ea,applyCompatiblePreset:Na,setOpenRouterList:ci,agentsConfig:Qe,compatibleAgentModels:Nt,ollamaAgentModels:mo,knownAgentModelRefs:Ma,agentModelLabel:ac,saveAgentsModel:nc,toggleAgentAutoAllowlist:ic,saveAllowlistEntryCapability:Xi,autoAllowlistGroups:E,structuralFacts:qs,saveModelHint:un,canMoveAllowlist:xa,moveAgentAutoAllowlist:Gg,openRouterCatalogue:ze,openRouterCatalogueLoading:nt,openRouterCatalogueError:kt,openRouterRecognized:ns,compatibleCatalogueStatus:In,compatibleCatalogueStatusClass:Ae,openRouterSearch:ba,openRouterVendor:Ds,openRouterVendors:N,openRouterToolsOnly:ii,openRouterEligibleOnly:En,openRouterStandardOnly:cn,openRouterMeasuredCacheOnly:An,openRouterMaxPromptPrice:da,openRouterQuantization:ya,openRouterQuantizations:de,openRouterResults:qe,openRouterMatchCount:Ze,openRouterInlineFacts:At,openRouterSelectedFacts:gs,prepareOpenRouterModel:C,addOpenRouterModel:ae,removeOpenRouterModel:Ct,quickAddOpenRouter:Vs,openRouterModelMap:Et,openRouterPin:We,openRouterPendingModel:qt,openRouterPendingTag:ua,openRouterPendingEndpoints:as,openRouterPendingLoading:dn,openRouterEndpointSort:Rn,openRouterSortedPendingEndpoints:oi,openRouterEndpointCacheFact:el,openRouterRate:ui,openRouterMetric:tl,openRouterRouteWarning:sl,cancelOpenRouterPending:G,codexLoading:oc,codexError:rc,codexData:ju,refreshing:cc,editingLabel:vo,labelValue:dc,contextWindows:B,contextWindowsLoading:J,contextWindowsError:ue,contextBudgetRows:be,activeClampRows:he,activeContextBudget:we,clearingClamp:V,contextPolicyDirty:ee,deviceState:al,deviceLoading:uc,deviceInfo:pc,deviceResult:Vu,deviceError:qu,fetchAll:_a,fetchLLMStatus:Ps,fetchOllamaStatus:nl,fetchCompatibleStatus:il,saveMainModel:ib,saveMainCapability:lb,saveAgentCapability:ob,reloadOllama:rb,setOllamaModel:cb,reloadCompatible:ub,setCompatibleModel:pb,probeOllamaModels:db,saveCodexConfig:ll,saveOllamaConfig:fc,saveCompatibleConfig:ol,saveCodexAdvancedConfig:Gu,saveOllamaAdvancedConfig:Wu,saveCompatibleAdvancedConfig:Ku,saveCodexConfigDebounced:fi,saveOllamaConfigDebounced:mi,saveCompatibleConfigDebounced:Mn,saveCodexConfigNow:mb,saveOllamaConfigNow:hb,saveCompatibleConfigNow:vb,saveCodexAdvancedConfigNow:gb,saveOllamaAdvancedConfigNow:bb,saveCompatibleAdvancedConfigNow:yb,activateAccount:_b,refreshAccount:wb,startEditLabel:kb,saveLabel:Sb,deleteAccount:Cb,startDeviceLogin:Tb,cancelDeviceLogin:Ab,formatSize:Wg,fetchContextWindows:Ln,clearContextClamp:xb,setContextOverride:tb,setContextUtilization:sb,resetContextOverride:ab,overrideAboveFloor:eb,formatCount:Kg,formatContextCeiling:Jg,formatExpiry:Zg,shortAccountKey:Yg,provenanceClass:Xg,formatDensity:Qg}}},$f={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function kC(e){return $f[e]||$f[(e||"").toLowerCase()]||"text-gray-400"}const SC={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=H(()=>{var _;return Object.values(((_=i.value)==null?void 0:_.totals)||{}).reduce((E,R)=>E+Number(R||0),0)}),u=f(""),p=f(0),m=f([]),h=H(()=>m.value.map(_=>`${_.label} (${_.path}${_.reason?`: ${_.reason}`:""})`).join("; ")),b=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let I=null;async function k(){var O;const _=await Promise.allSettled(b.map(U=>j.get(U.path))),E=U=>_[U].status==="fulfilled"?_[U].value:null;t.value=E(0)||{};const R=E(1);s.value=Array.isArray(R)?R:R&&R.subsystems||[],a.value=E(2)||{},n.value=E(3)||{},i.value=E(4),l.value=E(5),o.value=E(6),r.value=E(7),c.value=E(8);const w=_.filter(U=>U.status==="rejected");if(m.value=_.flatMap((U,T)=>{var $;return U.status==="rejected"?[{...b[T],reason:(($=U.reason)==null?void 0:$.message)||"request failed"}]:[]}),p.value=m.value.length,w.length===_.length){const U=(O=w[0])==null?void 0:O.reason;u.value=(U==null?void 0:U.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",k()}let g=!1;function x(){g||(g=!0,k(),I||(I=setInterval(k,3e4)))}function S(){g&&(g=!1,I&&(clearInterval(I),I=null))}return tt(x),rs(x),Zt(S),wt(S),{loading:e,error:u,failedCount:p,failedEndpoints:m,failedEndpointSummary:h,endpoints:b,retry:y,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:kC,formatAgeSeconds:GS}}},CC=1e4,Ff=3e4;function hl(e,t){return Math.max(0,e-t)}function Fc(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const TC=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],EC={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,m=0;async function h(){const L=++p;a.value=!0;try{const D=await j.get("/api/turn-state/turns?limit=100");if(L!==p)return;t.value=D.availability,e.value=D.availability==="available"?D.data:null,s.value=null,n.value=Date.now()}catch(D){if(L!==p)return;s.value=D.message||"Turn-state read failed",D.status===503&&(t.value="unavailable")}L===p&&(a.value=!1)}async function b(){const L=++m;r.value=!0;try{const D=await j.get("/api/turn-state/capacity-breakers");if(L!==m)return;l.value=D.availability,i.value=D.availability==="available"?D.data:null,o.value=null,c.value=Date.now()}catch(D){if(L!==m)return;o.value=D.message||"Breaker read failed",D.status===503&&(l.value="unavailable")}L===m&&(r.value=!1)}function I(){h(),b()}const k=H(()=>e.value!==null&&hl(d.value,n.value)>Ff),y=H(()=>i.value!==null&&hl(d.value,c.value)>Ff),g=H(()=>k.value||y.value),x=H(()=>Math.round(hl(d.value,n.value)/1e3)),S=H(()=>Math.round(hl(d.value,c.value)/1e3));function _(L){return Fc(L,d.value/1e3)}function E(L){return TC[_(L)]}const R=H(()=>{var le;const L=[...((le=e.value)==null?void 0:le.turns)||[]],D=d.value/1e3;return L.sort((oe,z)=>Fc(oe,D)-Fc(z,D)||(z.last_progress_at||0)-(oe.last_progress_at||0))});function w(L){return L.state==="closed"?"badge-success":L.state==="probing"?"badge-warning":"badge-danger"}function O(L){if(L.state==="closed")return"—";const D=hl(d.value,c.value)/1e3,le=Math.max(0,(L.cooldown_remaining_seconds||0)-D);return le>0?`${Math.ceil(le)}s`:L.state==="probing"?"probe in flight":"probe eligible"}function U(L){if(!L)return"";const D=Math.max(0,Math.round(d.value/1e3-L));if(D<90)return`${D}s ago`;const le=Math.round(D/60);return le<90?`${le}m ago`:`${Math.round(le/60)}h ago`}let T=null,$=null,Q=!1;function W(){Q||(Q=!0,I(),T=setInterval(I,CC),u=setInterval(()=>{d.value=Date.now()},1e3),$=ct.onReconnected(I))}function M(){Q&&(Q=!1,T&&(clearInterval(T),T=null),u&&(clearInterval(u),u=null),$&&($(),$=null))}return tt(W),rs(W),Zt(M),wt(M),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:k,breakersStale:y,anyStale:g,turnsAgeSeconds:x,breakersAgeSeconds:S,sortedTurns:R,priorityOf:_,priorityBadge:E,breakerBadge:w,cooldownLabel:O,ageLabel:U,fetchTurns:h,fetchBreakers:b,refreshAll:I,arm:W,disarm:M}}},AC={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await j.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await os({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await j.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return tt(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Bf=e=>JSON.parse(JSON.stringify(e)),RC=(e,t)=>JSON.stringify(e)===JSON.stringify(t),IC={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,m=0,h=null;const b=(M,L)=>p&&m===M&&j.token===L,I=M=>"computer-provisioning-"+M.key,k=M=>M===null?"Unset":M===""?"Empty":JSON.stringify(M),y=M=>{const L=n.value[M.key];return M.type==="array"?String(L||"").split(/\r?\n/).map(D=>D.trim()).filter(Boolean):["integer","number"].includes(M.type)?L===""||L==null?null:Number(L):L},g=H(()=>s.value.map(M=>({...M,value:y(M)})).filter(M=>!RC(M.value,a.value[M.key]))),x=H(()=>s.value.filter(M=>M.pending_restart).map(M=>M.label)),S=H(()=>s.value.some(M=>M.apply_state==="unknown")),_=H(()=>{const M={};for(const L of s.value){const D=y(L),le=L.constraints||{};["integer","number"].includes(L.type)&&(D===null&&!L.nullable?M[L.key]="A number is required.":D!==null&&(!Number.isFinite(D)||L.type==="integer"&&!Number.isInteger(D)||le.minimum!=null&&D<le.minimum||le.maximum!=null&&D>le.maximum)&&(M[L.key]="Enter a number within the allowed range.")),L.key==="monitor_names"&&(D.length>16||new Set(D).size!==D.length||D.some(oe=>!/^[A-Za-z0-9_.-]{1,64}$/.test(oe)))&&(M[L.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return M}),E=H(()=>Object.keys(_.value).length>0);function R(M,L){n.value[M.key]=L,u.value=""}function w(){n.value=Object.fromEntries(s.value.map(M=>[M.key,M.type==="array"?a.value[M.key].join(`
`):a.value[M.key]])),r.value=!1}async function O(M,L){const[D,le]=await Promise.all([j.get("/api/config"),j.get("/api/config/meta")]);if(!b(M,L))return!1;const oe=(le.fields||[]).filter(z=>/^computer\.[^.]+$/.test(z.path)&&z.path!=="computer.enabled"&&z.sensitivity==="public"&&z.apply_mode==="restart");if(!D.computer||!oe.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=oe.map(z=>({...z,key:z.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(z=>[z.key,Bf(D.computer[z.key])])),w(),h=L,i.value=!0,c.value=!1,!0}async function U(){if(!p||l.value||o.value)return;const M=++m,L=j.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await O(M,L)}catch(D){b(M,L)&&(c.value=!0,d.value=D.message||"Could not load provisioning. No changes were sent.")}finally{b(M,L)&&(l.value=!1)}}function T(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!E.value&&(r.value=!0)}async function $(){if(!p||!i.value||!r.value||o.value||l.value||c.value||E.value||!g.value.length)return;if(h!==j.token){W(),Q();return}const M={computer:Object.fromEntries(g.value.map(oe=>[oe.key,Bf(oe.value)]))},L=m,D=j.token;o.value=!0,d.value="",u.value="";let le=!1;try{if(await j.put("/api/config",M),le=!0,!b(L,D))return;await O(L,D)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(oe){b(L,D)&&(c.value=!0,r.value=!1,d.value=le?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${oe.status===400?": "+oe.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{b(L,D)&&(o.value=!1)}}function Q(){p||(p=!0,U())}function W(){p=!1,m++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,h=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return tt(Q),rs(Q),Zt(W),wt(W),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:x,effectiveUnknown:S,changes:g,validation:_,invalid:E,fieldId:I,format:k,edit:R,discard:w,load:U,openReview:T,save:$}}},OC={components:{ComputerProvisioning:IC},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),m=f(""),h=f(null),b=f(""),I=f(!1),k=f(Date.now()),y=f(""),g=f(null);let x=0,S=null,_=!1,E=j.token,R=0,w=null,O=null,U=!1;const T=V=>V===!0?"Enabled":V===!1?"Disabled":"Unknown",$=H(()=>{var V;return((V=e.value.backend)==null?void 0:V.environment)==="existing_session"}),Q=H(()=>{var ee;const V=Date.parse(((ee=e.value.accessibility)==null?void 0:ee.checked_at)||"");return c.value&&Number.isFinite(V)&&k.value-V<15e3&&k.value>=V-5e3}),W=H(()=>{var V;return Q.value?T((V=e.value.accessibility)==null?void 0:V.enabled):"Unknown / not current"}),M=H(()=>{var V;return Q.value?((V=e.value.accessibility)==null?void 0:V.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),L=H(()=>Object.entries(e.value.input_limits||{}).filter(([,V])=>typeof V=="number"&&Number.isFinite(V)).map(([V,ee])=>`${V}: ${ee}`).join(", ")),D=H(()=>{var ee;const V=(ee=e.value.application_provenance)==null?void 0:ee.script_identity;return typeof V=="string"?V:!V||typeof V!="object"?"Not observed":`${V.interpreter_basename||"Unknown interpreter"}; argv digest ${V.argv_digest||"not recorded"}; ${V.verified===!0?"verified":"not verified"}`}),le=H(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(V=>V&&typeof V.id=="string"&&typeof V.label=="string"&&["supported","capture_only"].includes(V.input)).slice(0,16):[]),oe=H(()=>{const V=e.value.restart_required;return Array.isArray(V)?V.length?V.join(", "):"None reported":V===!0?"Pending; restart required":V===!1?"None reported":"Unknown"}),z=H(()=>{var ee,te;const V=Date.parse(((ee=h.value)==null?void 0:ee.captured_at)||"");return Number.isFinite(V)&&k.value<V+Math.min(1e4,((te=h.value)==null?void 0:te.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function Z(){b.value&&URL.revokeObjectURL(b.value),b.value="",h.value=null}function re(){x++,Z(),g.value=null,c.value=!1,w==null||w.abort(),w=null,t.value=!1,m.value="",s.value=!1,i.value=!1,l.value=!1}function K(V,ee){return _&&V===x&&ee===j.token}function ve(){return _&&c.value&&O===j.token&&Date.now()-u.value<15e3}function Me(V,ee="mutation"){var be,he;re(),U=!0,p.value="";const te=V.status||(V.name==="AuthError"?401:0);[401,403,404].includes(te)?(u.value=0,O=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:te===503?"unavailable":"unknown"}),o.value=te===401||te===403||te===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":te===410?"Evidence or artifact expired. Observe or prepare the export again.":ee==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":ee==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",ee==="mutation"&&![401,403,404].includes(te)&&typeof((be=V.data)==null?void 0:be.code)=="string"&&/^[a-z_]{1,64}$/.test(V.data.code)&&typeof((he=V.data)==null?void 0:he.error)=="string"&&(o.value=V.data.error.slice(0,512),V.data.outcome==="not_applied"&&V.data.next_action==="repair_provisioning"&&typeof V.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=V.data.remedy.slice(0,1024)))}async function ne(){if(t.value||r.value||a.value||n.value||d.value||!_)return;const V=x,ee=j.token;t.value=!0,R=Date.now();const te=new AbortController;w=te;try{const be=await j.get("/api/computer",{signal:te.signal});if(!K(V,ee))return;ie(be)}catch(be){K(V,ee)&&Me(be,"read")}finally{w===te&&(w=null,t.value=!1)}}function ie(V,ee=""){if(!V||typeof V!="object"||typeof V.state!="string"||typeof V.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==V.session_id||e.value.generation!=null&&e.value.generation!==V.generation||e.value.session_generation!=null&&e.value.session_generation!==V.session_generation)&&re(),e.value=V,u.value=Date.now(),O=j.token,c.value=!(r.value&&ee!=="toggle")&&!(a.value&&ee!=="stop")&&!(n.value&&ee!=="pause")&&!(d.value&&ee!=="recovery"),o.value="",p.value="",U=!c.value}async function pe(V){if(!ve()||r.value||a.value||n.value||d.value)return;re();const ee=x,te=j.token;r.value=!0;let be=!1;try{if(await j.post("/api/computer/enabled",{enabled:V}),be=!0,!K(ee,te))return;const he=await j.get("/api/computer");K(ee,te)&&ie(he,"toggle")}catch(he){K(ee,te)&&Me(he,be?"acknowledged":"mutation")}finally{r.value=!1}}async function me(V){if(!_||!["pause","stop"].includes(V)||(V==="stop"?a.value:n.value))return;re();const ee=x,te=j.token,be=V==="stop"?a:n;be.value=!0;let he=!1;try{if(await j.post("/api/computer/"+V,{}),he=!0,K(ee,te)){const we=await j.get("/api/computer");K(ee,te)&&ie(we,V)}}catch(we){K(ee,te)&&Me(we,he?"acknowledged":"mutation")}finally{be.value=!1}}async function ge(){var be;if(!ve()||d.value||((be=e.value.backend)==null?void 0:be.native_backend)!=="hyprland")return;const V={session_id:e.value.session_id,generation:e.value.session_generation};if(!V.session_id||!Number.isInteger(V.generation))return;re();const ee=x,te=j.token;d.value=!0;try{const he=await j.post("/api/computer/release_owned_input",V);K(ee,te)&&ie(he,"recovery")}catch(he){K(ee,te)&&Me(he,"mutation")}finally{d.value=!1}}async function Ne(){return P(!1)}async function A(){return P(!0)}async function P(V){var _e;if(!ve()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const ee={session_id:e.value.session_id,generation:e.value.session_generation};if(!ee.session_id||!Number.isInteger(ee.generation))return;if(V){if(m.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+ee.session_id)return;ee.acknowledgment=m.value}const te=V?((_e=e.value.recovery)==null?void 0:_e.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";re();const be=x,he=j.token;d.value=!0;let we=!1;try{const ye=await j.post("/api/computer/"+te,ee);we=!0,K(be,he)&&ie(ye,"recovery")}catch(ye){K(be,he)&&Me(ye,we?"acknowledged":"mutation")}finally{d.value=!1}}async function q(){var te;if(!ve()||s.value||!e.value.available)return;Z(),I.value=!1;const V=x,ee=j.token;s.value=!0;try{const be=await j.post("/api/computer/observe",{});if(!K(V,ee))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((te=be.frame)==null?void 0:te.evidence_id)||""))throw new Error("Invalid evidence");const he=await j.getBlob("/api/computer/evidence/"+be.frame.evidence_id);if(!K(V,ee))return;if(!["image/png","image/jpeg"].includes(he.type)||he.size>2097152||!Number.isFinite(Date.parse(be.frame.expires_at))||Date.parse(be.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");h.value=be.frame,b.value=URL.createObjectURL(he),o.value=""}catch(be){K(V,ee)&&Me(be)}finally{V===x&&(s.value=!1)}}async function fe(){if(!ve()||i.value||!e.value.available)return;g.value=null;const V=x,ee=j.token;i.value=!0;try{const te=await j.post("/api/computer/export",{name:y.value});K(V,ee)&&(g.value=te,o.value="")}catch(te){K(V,ee)&&Me(te)}finally{V===x&&(i.value=!1)}}async function B(){if(!ve()||l.value||!g.value)return;const V=x,ee=j.token,te=g.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((te==null?void 0:te.artifact_id)||""))throw new Error("Invalid export");const be=await j.getBlob("/api/computer/download/"+te.artifact_id);if(!K(V,ee))return;const he=URL.createObjectURL(be),we=document.createElement("a");we.href=he,we.download=te.name,we.click(),setTimeout(()=>URL.revokeObjectURL(he),1e3)}catch(be){K(V,ee)&&Me(be)}finally{V===x&&(l.value=!1)}}function J(){_||(E!==j.token&&(E=j.token,re(),u.value=0,O=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),_=!0,ne(),S=setInterval(()=>{k.value=Date.now(),E!==j.token&&(E=j.token,re(),u.value=0,O=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&k.value-u.value>=15e3&&re(),h.value&&Date.parse(h.value.expires_at)<=k.value&&(Z(),I.value=!0),g.value&&Date.parse(g.value.expires_at)<=k.value&&(g.value=null),!U&&k.value-R>=5e3&&ne()},500))}function ue(){_=!1,clearInterval(S),S=null,re(),c.value=!1}return tt(J),rs(J),Zt(ue),wt(ue),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:h,frameUrl:b,frameExpired:I,freshness:z,name:y,artifact:g,refresh:ne,control:me,observe:q,clearFrame:Z,exportFile:fe,download:B,toggling:r,adminReady:c,enabledLabel:T,restartSettings:oe,setEnabled:pe,recovering:d,recover:Ne,reconcile:A,releaseOwnedInput:ge,reconciliationAck:m,applicationProfiles:le,attached:$,scriptIdentity:D,inputLimits:L,accessibilityLabel:W,accessibilityDetail:M}}},Ig=[{id:"health",label:"Health",component:U1},{id:"resources",label:"Resources",component:z1},{id:"logs",label:"Logs",component:X1},{id:"config",label:"Config",component:uC},{id:"discord",label:"Discord",component:fC},{id:"hosts",label:"Hosts",component:vC},{id:"host-access",label:"Host Access",component:hC},{id:"api-tokens",label:"API Tokens",component:gC},{id:"llm",label:"LLM Config",component:wC},{id:"internals",label:"Internals",component:SC},{id:"turn-state",label:"Turn State",component:EC},{id:"computer",label:"Computer",component:OC},{id:"update",label:"Update",component:AC}],LC={components:{TabbedPage:Xr},setup(){return{tabs:Ig}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Bo=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),NC=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Bo("Operations","operations","/operations",xg),...Bo("History","history","/history",_g),...Bo("Capabilities","capabilities","/capabilities",wg),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Bo("System","system","/system",Ig)],Bs=Cn({open:!1,query:"",selected:0});function Uf(){Bs.query="",Bs.selected=0,Bs.open=!0}function Bc(){Bs.open=!1}function MC(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const DC={setup(){const e=pg(),t=f(null),s=H(()=>{const i=Bs.query.trim().toLowerCase();return NC.map(l=>({...l,_score:MC(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Jt(()=>Bs.open,async i=>{var l;i&&(await jt(),(l=t.value)==null||l.focus())}),Jt(()=>Bs.query,()=>{Bs.selected=0});function a(i){Bc(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Bc();return}if(i.key==="ArrowDown")i.preventDefault(),Bs.selected=Math.min(Bs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Bs.selected=Math.max(Bs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Bs.selected];l&&a(l)}}return{state:Bs,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Bc}},template:`
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
  `},Td={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Td));const PC={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Ui("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Ui("path",{d:Td[e.name]||Td.info})])}},$C=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function zf(e){return[...e.querySelectorAll($C)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const FC={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=zf(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||zf(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},BC={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const m=H(()=>{const oe=e.value.uptime_seconds||0,z=Math.floor(oe/86400),Z=Math.floor(oe%86400/3600),re=Math.floor(oe%3600/60),K=[];return z>0&&K.push(`${z}d`),Z>0&&K.push(`${Z}h`),(K.length===0||z===0&&Z===0)&&K.push(`${re}m`),K.join(" ")}),h=H(()=>{const oe=e.value.uptime_seconds||0;return 125.66*(1-Math.min(oe/86400,1))}),b=H(()=>{const oe=e.value;return[{label:"Guilds",value:oe.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:oe.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:oe.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${oe.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:oe.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:oe.loop_count>0?"text-green-400":"",highlight:oe.loop_count>0},{label:"Agents",value:oe.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:oe.agent_count>0?`${oe.agent_count} total`:"",subColor:"text-gray-500",highlight:(oe.agent_running??0)>0},{label:"Processes",value:oe.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:oe.process_count>0?`${oe.process_count} total`:"",subColor:"text-gray-500",highlight:(oe.process_running??0)>0},{label:"Schedules",value:oe.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(oe.schedule_failing>0?`${oe.schedule_failing} failing`:"")+(oe.schedule_failing>0&&oe.schedule_paused>0?", ":"")+(oe.schedule_paused>0?`${oe.schedule_paused} paused`:"")||void 0,subColor:oe.schedule_failing>0?"text-red-400":"text-yellow-400",color:oe.schedule_failing>0?"text-red-400":"",highlight:oe.schedule_failing>0},{label:"Users",value:oe.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),I=H(()=>{const oe=e.value,z=[];return z.push({label:"Bot",status:oe.status==="online"?"ok":"warn",detail:oe.status==="online"?"Online":"Starting"}),(oe.schedule_failing||0)>0?z.push({label:"Schedules",status:"error",detail:`${oe.schedule_failing} failing`}):(oe.schedule_count||0)>0&&z.push({label:"Schedules",status:"ok",detail:`${oe.schedule_count} configured`}),(oe.loop_count||0)>0&&z.push({label:"Loops",status:"ok",detail:`${oe.loop_count} active`}),(oe.agent_running||0)>0&&z.push({label:"Agents",status:"ok",detail:`${oe.agent_running} running`}),(oe.process_running||0)>0&&z.push({label:"Processes",status:"ok",detail:`${oe.process_running} running`}),z});async function k(){try{e.value=await j.get("/api/status"),s.value=null}catch(oe){s.value=oe.message}finally{t.value=!1}}let y=0,g=0,x=0,S=0;function _(oe,z){const Z=new Set;return[...z,...oe].filter(re=>{const K=re._hmac||JSON.stringify([re.timestamp,re.tool_name,re.user_id,re.result_summary,re.error]);return Z.has(K)?!1:(Z.add(K),!0)})}async function E(){const oe=++y,z=x;n.value=!0;try{const Z=await j.get("/api/audit?limit=10");if(oe!==y)return;const re=z===x?[]:a.value.filter(K=>(K._liveEpoch||0)>z);a.value=_(Z,re).slice(0,10),c.value=re.length}catch{}oe===y&&(n.value=!1)}async function R(){const oe=++g,z=S;l.value=!0;try{const Z=await j.get("/api/audit?error_only=1&limit=5");if(oe!==g)return;const re=z===S?[]:i.value.filter(K=>(K._liveErrorEpoch||0)>z);i.value=_(Z,re).slice(0,5),o.value=!1}catch{if(oe!==g)return;o.value=z===S||i.value.length===0}oe===g&&(l.value=!1)}async function w(){try{const oe=await j.get("/api/knowledge");d.value=(Array.isArray(oe)?oe:[]).reduce((z,Z)=>z+(Z.chunks||0),0)}catch{d.value=null}}async function O(){try{const oe=await j.get("/api/agents");r.value=oe.filter(z=>z.status==="running")}catch{}}async function U(){u.value={...u.value,reload:!0};try{await j.post("/api/reload"),Ce.success("Config reloaded")}catch(oe){Ce.error(oe.message)}u.value={...u.value,reload:!1}}async function T(){if(!await os({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const z=e.value.session_count;e.value={...e.value,session_count:0};try{const Z=await j.post("/api/sessions/clear-all");Ce.success(`Cleared ${Z.count} session${Z.count!==1?"s":""}`),await k()}catch(Z){e.value={...e.value,session_count:z},Ce.error(Z.message)}u.value={...u.value,clearSessions:!1}}async function $(){if(!await os({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const z=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Z=await j.post("/api/loops/stop-all");Ce.success(Z.result),await k()}catch(Z){e.value={...e.value,loop_count:z},Ce.error(Z.message)}u.value={...u.value,stopLoops:!1}}function Q(){t.value=!0,s.value=null,k(),E(),R(),O()}let W=null,M=null,L=null;function D(oe){if(oe.payload&&oe.payload.tool_name){x+=1;const z={...oe.payload,_isNew:!0,_key:++p,_liveEpoch:x};a.value.unshift(z),a.value.length>10&&a.value.pop(),c.value++,z.error&&(S+=1,z._liveErrorEpoch=S,o.value=!1,i.value.unshift(z),i.value.length>5&&i.value.pop()),setTimeout(()=>{z._isNew=!1},1500),clearTimeout(L),L=setTimeout(()=>{c.value=0},1e4)}}let le=null;return tt(async()=>{await Promise.all([k(),E(),R(),O(),w()]),W=setInterval(k,15e3),M=setInterval(O,1e4),ct.subscribe("events",D),le=ct.onReconnected(()=>{E(),R()})}),wt(()=>{W&&clearInterval(W),M&&clearInterval(M),clearTimeout(L),ct.unsubscribe("events",D),le&&(le(),le=null)}),{status:e,loading:t,error:s,uptime:m,uptimeRingOffset:h,stats:b,healthIndicators:I,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:E,fetchErrors:R,fetchStatus:k,onEvent:D,formatTime:qS,formatDuration:Ji,retry:Q,reloadConfig:U,clearSessions:T,stopAllLoops:$}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Hf(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function UC(e){if(Array.isArray(e))return e}function zC(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function HC(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function jC(e,t){return UC(e)||zC(e,t)||VC(e,t)||HC()}function VC(e,t){if(e){if(typeof e=="string")return Hf(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Hf(e,t):void 0}}const Og=Object.entries,jf=Object.setPrototypeOf,qC=Object.isFrozen,GC=Object.getPrototypeOf,WC=Object.getOwnPropertyDescriptor;let Ls=Object.freeze,ra=Object.seal,Si=Object.create,Lg=typeof Reflect<"u"&&Reflect,Ed=Lg.apply,Ad=Lg.construct;Ls||(Ls=function(t){return t});ra||(ra=function(t){return t});Ed||(Ed=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});Ad||(Ad=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const Ua=Yt(Array.prototype.forEach),KC=Yt(Array.prototype.lastIndexOf),Vf=Yt(Array.prototype.pop),yi=Yt(Array.prototype.push),JC=Yt(Array.prototype.splice),Es=Array.isArray,kl=Yt(String.prototype.toLowerCase),Uc=Yt(String.prototype.toString),qf=Yt(String.prototype.match),xi=Yt(String.prototype.replace),Gf=Yt(String.prototype.indexOf),ZC=Yt(String.prototype.trim),YC=Yt(Number.prototype.toString),QC=Yt(Boolean.prototype.toString),Wf=typeof BigInt>"u"?null:Yt(BigInt.prototype.toString),Kf=typeof Symbol>"u"?null:Yt(Symbol.prototype.toString),Pt=Yt(Object.prototype.hasOwnProperty),vl=Yt(Object.prototype.toString),ds=Yt(RegExp.prototype.test),$n=XC(TypeError);function Yt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return Ed(e,t,a)}}function XC(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return Ad(e,s)}}function et(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:kl;if(jf&&jf(e,null),!Es(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(qC(t)||(t[a]=i),n=i)}e[n]=!0}return e}function eT(e){for(let t=0;t<e.length;t++)Pt(e,t)||(e[t]=null);return e}function ys(e){const t=Si(null);for(const a of Og(e)){var s=jC(a,2);const n=s[0],i=s[1];Pt(e,n)&&(Es(i)?t[n]=eT(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ys(i):t[n]=i)}return t}function tT(e){switch(typeof e){case"string":return e;case"number":return YC(e);case"boolean":return QC(e);case"bigint":return Wf?Wf(e):"0";case"symbol":return Kf?Kf(e):"Symbol()";case"undefined":return vl(e);case"function":case"object":{if(e===null)return vl(e);const t=e,s=Sa(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:vl(a)}return vl(e)}default:return vl(e)}}function Sa(e,t){for(;e!==null;){const a=WC(e,t);if(a){if(a.get)return Yt(a.get);if(typeof a.value=="function")return Yt(a.value)}e=GC(e)}function s(){return null}return s}function sT(e){try{return ds(e,""),!0}catch{return!1}}const Jf=Ls(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),zc=Ls(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Hc=Ls(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),aT=Ls(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),jc=Ls(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),nT=Ls(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Zf=Ls(["#text"]),Yf=Ls(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Vc=Ls(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Qf=Ls(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Uo=Ls(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),iT=ra(/{{[\w\W]*|^[\w\W]*}}/g),lT=ra(/<%[\w\W]*|^[\w\W]*%>/g),oT=ra(/\${[\w\W]*/g),rT=ra(/^data-[\-\w.\u00B7-\uFFFF]+$/),cT=ra(/^aria-[\-\w]+$/),Xf=ra(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),dT=ra(/^(?:\w+script|data):/i),uT=ra(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),pT=ra(/^html$/i),fT=ra(/^[a-z][.\w]*(-[.\w]+)+$/i),wa={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},mT=function(){return typeof window>"u"?null:window},hT=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},em=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Ng(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:mT();const t=Ae=>Ng(Ae);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==wa.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,m=Sa(p,"cloneNode"),h=Sa(p,"remove"),b=Sa(p,"nextSibling"),I=Sa(p,"childNodes"),k=Sa(p,"parentNode"),y=Sa(p,"shadowRoot"),g=Sa(p,"attributes"),x=l&&l.prototype?Sa(l.prototype,"nodeType"):null,S=l&&l.prototype?Sa(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ae=s.createElement("template");Ae.content&&Ae.content.ownerDocument&&(s=Ae.content.ownerDocument)}let _,E="",R,w=!1,O=0;const U=function(){if(O>0)throw $n('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},T=function(N){U(),O++;try{return _.createHTML(N)}finally{O--}},$=function(N){U(),O++;try{return _.createScriptURL(N)}finally{O--}},Q=function(){return w||(R=hT(u,n),w=!0),R},W=s,M=W.implementation,L=W.createNodeIterator,D=W.createDocumentFragment,le=W.getElementsByTagName,oe=a.importNode;let z=em();t.isSupported=typeof Og=="function"&&typeof k=="function"&&M&&M.createHTMLDocument!==void 0;const Z=iT,re=lT,K=oT,ve=rT,Me=cT,ne=dT,ie=uT,pe=fT;let me=Xf,ge=null;const Ne=et({},[...Jf,...zc,...Hc,...jc,...Zf]);let A=null;const P=et({},[...Yf,...Vc,...Qf,...Uo]);let q=Object.seal(Si(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),fe=null,B=null;const J=Object.seal(Si(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ue=!0,V=!0,ee=!1,te=!0,be=!1,he=!0,we=!1,_e=!1,ye=!1,Ke=!1,je=!1,Fe=!1,Ge=!0,st=!1;const Ye="user-content-";let Y=!0,Te=!1,Ee={},Le=null;const se=et({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Oe=null;const Ue=et({},["audio","video","img","source","image","track"]);let dt=null;const Bt=et({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),ft="http://www.w3.org/1998/Math/MathML",yt="http://www.w3.org/2000/svg",Qt="http://www.w3.org/1999/xhtml";let cs=Qt,Xs=!1,ea=null;const Qe=et({},[ft,yt,Qt],Uc);let ca=et({},["mi","mo","mn","ms","mtext"]),hs=et({},["annotation-xml"]);const Ns=et({},["title","style","font","a","script"]);let vs=null;const Tn=["application/xhtml+xml","text/html"],Mt="text/html";let vt=null,Ms=null;const rn=s.createElement("form"),ce=function(N){return N instanceof RegExp||N instanceof Function},Re=function(){let N=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ms&&Ms===N)return;(!N||typeof N!="object")&&(N={}),N=ys(N),vs=Tn.indexOf(N.PARSER_MEDIA_TYPE)===-1?Mt:N.PARSER_MEDIA_TYPE,vt=vs==="application/xhtml+xml"?Uc:kl,ge=Pt(N,"ALLOWED_TAGS")&&Es(N.ALLOWED_TAGS)?et({},N.ALLOWED_TAGS,vt):Ne,A=Pt(N,"ALLOWED_ATTR")&&Es(N.ALLOWED_ATTR)?et({},N.ALLOWED_ATTR,vt):P,ea=Pt(N,"ALLOWED_NAMESPACES")&&Es(N.ALLOWED_NAMESPACES)?et({},N.ALLOWED_NAMESPACES,Uc):Qe,dt=Pt(N,"ADD_URI_SAFE_ATTR")&&Es(N.ADD_URI_SAFE_ATTR)?et(ys(Bt),N.ADD_URI_SAFE_ATTR,vt):Bt,Oe=Pt(N,"ADD_DATA_URI_TAGS")&&Es(N.ADD_DATA_URI_TAGS)?et(ys(Ue),N.ADD_DATA_URI_TAGS,vt):Ue,Le=Pt(N,"FORBID_CONTENTS")&&Es(N.FORBID_CONTENTS)?et({},N.FORBID_CONTENTS,vt):se,fe=Pt(N,"FORBID_TAGS")&&Es(N.FORBID_TAGS)?et({},N.FORBID_TAGS,vt):ys({}),B=Pt(N,"FORBID_ATTR")&&Es(N.FORBID_ATTR)?et({},N.FORBID_ATTR,vt):ys({}),Ee=Pt(N,"USE_PROFILES")?N.USE_PROFILES&&typeof N.USE_PROFILES=="object"?ys(N.USE_PROFILES):N.USE_PROFILES:!1,ue=N.ALLOW_ARIA_ATTR!==!1,V=N.ALLOW_DATA_ATTR!==!1,ee=N.ALLOW_UNKNOWN_PROTOCOLS||!1,te=N.ALLOW_SELF_CLOSE_IN_ATTR!==!1,be=N.SAFE_FOR_TEMPLATES||!1,he=N.SAFE_FOR_XML!==!1,we=N.WHOLE_DOCUMENT||!1,Ke=N.RETURN_DOM||!1,je=N.RETURN_DOM_FRAGMENT||!1,Fe=N.RETURN_TRUSTED_TYPE||!1,ye=N.FORCE_BODY||!1,Ge=N.SANITIZE_DOM!==!1,st=N.SANITIZE_NAMED_PROPS||!1,Y=N.KEEP_CONTENT!==!1,Te=N.IN_PLACE||!1,me=sT(N.ALLOWED_URI_REGEXP)?N.ALLOWED_URI_REGEXP:Xf,cs=typeof N.NAMESPACE=="string"?N.NAMESPACE:Qt,ca=Pt(N,"MATHML_TEXT_INTEGRATION_POINTS")&&N.MATHML_TEXT_INTEGRATION_POINTS&&typeof N.MATHML_TEXT_INTEGRATION_POINTS=="object"?ys(N.MATHML_TEXT_INTEGRATION_POINTS):et({},["mi","mo","mn","ms","mtext"]),hs=Pt(N,"HTML_INTEGRATION_POINTS")&&N.HTML_INTEGRATION_POINTS&&typeof N.HTML_INTEGRATION_POINTS=="object"?ys(N.HTML_INTEGRATION_POINTS):et({},["annotation-xml"]);const de=Pt(N,"CUSTOM_ELEMENT_HANDLING")&&N.CUSTOM_ELEMENT_HANDLING&&typeof N.CUSTOM_ELEMENT_HANDLING=="object"?ys(N.CUSTOM_ELEMENT_HANDLING):Si(null);if(q=Si(null),Pt(de,"tagNameCheck")&&ce(de.tagNameCheck)&&(q.tagNameCheck=de.tagNameCheck),Pt(de,"attributeNameCheck")&&ce(de.attributeNameCheck)&&(q.attributeNameCheck=de.attributeNameCheck),Pt(de,"allowCustomizedBuiltInElements")&&typeof de.allowCustomizedBuiltInElements=="boolean"&&(q.allowCustomizedBuiltInElements=de.allowCustomizedBuiltInElements),be&&(V=!1),je&&(Ke=!0),Ee&&(ge=et({},Zf),A=Si(null),Ee.html===!0&&(et(ge,Jf),et(A,Yf)),Ee.svg===!0&&(et(ge,zc),et(A,Vc),et(A,Uo)),Ee.svgFilters===!0&&(et(ge,Hc),et(A,Vc),et(A,Uo)),Ee.mathMl===!0&&(et(ge,jc),et(A,Qf),et(A,Uo))),J.tagCheck=null,J.attributeCheck=null,Pt(N,"ADD_TAGS")&&(typeof N.ADD_TAGS=="function"?J.tagCheck=N.ADD_TAGS:Es(N.ADD_TAGS)&&(ge===Ne&&(ge=ys(ge)),et(ge,N.ADD_TAGS,vt))),Pt(N,"ADD_ATTR")&&(typeof N.ADD_ATTR=="function"?J.attributeCheck=N.ADD_ATTR:Es(N.ADD_ATTR)&&(A===P&&(A=ys(A)),et(A,N.ADD_ATTR,vt))),Pt(N,"ADD_URI_SAFE_ATTR")&&Es(N.ADD_URI_SAFE_ATTR)&&et(dt,N.ADD_URI_SAFE_ATTR,vt),Pt(N,"FORBID_CONTENTS")&&Es(N.FORBID_CONTENTS)&&(Le===se&&(Le=ys(Le)),et(Le,N.FORBID_CONTENTS,vt)),Pt(N,"ADD_FORBID_CONTENTS")&&Es(N.ADD_FORBID_CONTENTS)&&(Le===se&&(Le=ys(Le)),et(Le,N.ADD_FORBID_CONTENTS,vt)),Y&&(ge["#text"]=!0),we&&et(ge,["html","head","body"]),ge.table&&(et(ge,["tbody"]),delete fe.tbody),N.TRUSTED_TYPES_POLICY){if(typeof N.TRUSTED_TYPES_POLICY.createHTML!="function")throw $n('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof N.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw $n('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const xe=_;_=N.TRUSTED_TYPES_POLICY;try{E=T("")}catch(Be){throw _=xe,Be}}else N.TRUSTED_TYPES_POLICY===null?(_=void 0,E=""):(_===void 0&&(_=Q()),_&&typeof E=="string"&&(E=T("")));(z.uponSanitizeElement.length>0||z.uponSanitizeAttribute.length>0)&&ge===Ne&&(ge=ys(ge)),z.uponSanitizeAttribute.length>0&&A===P&&(A=ys(A)),Ls&&Ls(N),Ms=N},ze=et({},[...zc,...Hc,...aT]),nt=et({},[...jc,...nT]),kt=function(N){let de=k(N);(!de||!de.tagName)&&(de={namespaceURI:cs,tagName:"template"});const xe=kl(N.tagName),Be=kl(de.tagName);return ea[N.namespaceURI]?N.namespaceURI===yt?de.namespaceURI===Qt?xe==="svg":de.namespaceURI===ft?xe==="svg"&&(Be==="annotation-xml"||ca[Be]):!!ze[xe]:N.namespaceURI===ft?de.namespaceURI===Qt?xe==="math":de.namespaceURI===yt?xe==="math"&&hs[Be]:!!nt[xe]:N.namespaceURI===Qt?de.namespaceURI===yt&&!hs[Be]||de.namespaceURI===ft&&!ca[Be]?!1:!nt[xe]&&(Ns[xe]||!ze[xe]):!!(vs==="application/xhtml+xml"&&ea[N.namespaceURI]):!1},ut=function(N){yi(t.removed,{element:N});try{k(N).removeChild(N)}catch{if(h(N),!k(N))throw $n("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},ba=function(N){const de=I?I(N):N.childNodes;if(de){const Be=[];Ua(de,qe=>{yi(Be,qe)}),Ua(Be,qe=>{try{h(qe)}catch{}})}const xe=g?g(N):null;if(xe)for(let Be=xe.length-1;Be>=0;--Be){const qe=xe[Be],Ze=qe&&qe.name;if(typeof Ze=="string")try{N.removeAttribute(Ze)}catch{}}},Ds=function(N,de){try{yi(t.removed,{attribute:de.getAttributeNode(N),from:de})}catch{yi(t.removed,{attribute:null,from:de})}if(de.removeAttribute(N),N==="is")if(Ke||je)try{ut(de)}catch{}else try{de.setAttribute(N,"")}catch{}},ii=function(N){const de=g?g(N):N.attributes;if(de)for(let xe=de.length-1;xe>=0;--xe){const Be=de[xe],qe=Be&&Be.name;if(!(typeof qe!="string"||A[vt(qe)]))try{N.removeAttribute(qe)}catch{}}},En=function(N){const de=[N];for(;de.length>0;){const xe=de.pop();(x?x(xe):xe.nodeType)===wa.element&&ii(xe);const qe=I?I(xe):xe.childNodes;if(qe)for(let Ze=qe.length-1;Ze>=0;--Ze)de.push(qe[Ze])}},cn=function(N){let de=null,xe=null;if(ye)N="<remove></remove>"+N;else{const Ze=qf(N,/^[\r\n\t ]+/);xe=Ze&&Ze[0]}vs==="application/xhtml+xml"&&cs===Qt&&(N='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+N+"</body></html>");const Be=_?T(N):N;if(cs===Qt)try{de=new d().parseFromString(Be,vs)}catch{}if(!de||!de.documentElement){de=M.createDocument(cs,"template",null);try{de.documentElement.innerHTML=Xs?E:Be}catch{}}const qe=de.body||de.documentElement;return N&&xe&&qe.insertBefore(s.createTextNode(xe),qe.childNodes[0]||null),cs===Qt?le.call(de,we?"html":"body")[0]:we?de.documentElement:qe},An=function(N){return L.call(N.ownerDocument||N,N,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},da=function(N){var de,xe;N.normalize();const Be=L.call(N.ownerDocument||N,N,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let qe=Be.nextNode();for(;qe;){let Et=qe.data;Ua([Z,re,K],pt=>{Et=xi(Et,pt," ")}),qe.data=Et,qe=Be.nextNode()}const Ze=(de=(xe=N.querySelectorAll)===null||xe===void 0?void 0:xe.call(N,"template"))!==null&&de!==void 0?de:[];Ua(Array.from(Ze),Et=>{qt(Et.content)&&da(Et.content)})},ya=function(N){const de=S?S(N):null;return typeof de!="string"||vt(de)!=="form"?!1:typeof N.nodeName!="string"||typeof N.textContent!="string"||typeof N.removeChild!="function"||N.attributes!==g(N)||typeof N.removeAttribute!="function"||typeof N.setAttribute!="function"||typeof N.namespaceURI!="string"||typeof N.insertBefore!="function"||typeof N.hasChildNodes!="function"||N.nodeType!==x(N)||N.childNodes!==I(N)},qt=function(N){if(!x||typeof N!="object"||N===null)return!1;try{return x(N)===wa.documentFragment}catch{return!1}},ua=function(N){if(!x||typeof N!="object"||N===null)return!1;try{return typeof x(N)=="number"}catch{return!1}};function as(Ae,N,de){Ua(Ae,xe=>{xe.call(t,N,de,Ms)})}const dn=function(N){let de=null;if(as(z.beforeSanitizeElements,N,null),ya(N))return ut(N),!0;const xe=vt(S?S(N):N.nodeName);if(as(z.uponSanitizeElement,N,{tagName:xe,allowedTags:ge}),he&&N.hasChildNodes()&&!ua(N.firstElementChild)&&ds(/<[/\w!]/g,N.innerHTML)&&ds(/<[/\w!]/g,N.textContent)||he&&N.namespaceURI===Qt&&xe==="style"&&ua(N.firstElementChild)||N.nodeType===wa.progressingInstruction||he&&N.nodeType===wa.comment&&ds(/<[/\w]/g,N.data))return ut(N),!0;if(fe[xe]||!(J.tagCheck instanceof Function&&J.tagCheck(xe))&&!ge[xe]){if(!fe[xe]&&oi(xe)&&(q.tagNameCheck instanceof RegExp&&ds(q.tagNameCheck,xe)||q.tagNameCheck instanceof Function&&q.tagNameCheck(xe)))return!1;if(Y&&!Le[xe]){const qe=k(N),Ze=I(N);if(Ze&&qe){const Et=Ze.length;for(let pt=Et-1;pt>=0;--pt){const At=Te?Ze[pt]:m(Ze[pt],!0);qe.insertBefore(At,b(N))}}}return ut(N),!0}return(x?x(N):N.nodeType)===wa.element&&!kt(N)||(xe==="noscript"||xe==="noembed"||xe==="noframes")&&ds(/<\/no(script|embed|frames)/i,N.innerHTML)?(ut(N),!0):(be&&N.nodeType===wa.text&&(de=N.textContent,Ua([Z,re,K],qe=>{de=xi(de,qe," ")}),N.textContent!==de&&(yi(t.removed,{element:N.cloneNode()}),N.textContent=de)),as(z.afterSanitizeElements,N,null),!1)},Rn=function(N,de,xe){if(B[de]||Ge&&(de==="id"||de==="name")&&(xe in s||xe in rn))return!1;const Be=A[de]||J.attributeCheck instanceof Function&&J.attributeCheck(de,N);if(!(V&&!B[de]&&ds(ve,de))){if(!(ue&&ds(Me,de))){if(!Be||B[de]){if(!(oi(N)&&(q.tagNameCheck instanceof RegExp&&ds(q.tagNameCheck,N)||q.tagNameCheck instanceof Function&&q.tagNameCheck(N))&&(q.attributeNameCheck instanceof RegExp&&ds(q.attributeNameCheck,de)||q.attributeNameCheck instanceof Function&&q.attributeNameCheck(de,N))||de==="is"&&q.allowCustomizedBuiltInElements&&(q.tagNameCheck instanceof RegExp&&ds(q.tagNameCheck,xe)||q.tagNameCheck instanceof Function&&q.tagNameCheck(xe))))return!1}else if(!dt[de]){if(!ds(me,xi(xe,ie,""))){if(!((de==="src"||de==="xlink:href"||de==="href")&&N!=="script"&&Gf(xe,"data:")===0&&Oe[N])){if(!(ee&&!ds(ne,xi(xe,ie,"")))){if(xe)return!1}}}}}}return!0},li=et({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),oi=function(N){return!li[kl(N)]&&ds(pe,N)},ri=function(N){as(z.beforeSanitizeAttributes,N,null);const de=N.attributes;if(!de||ya(N))return;const xe={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:A,forceKeepAttr:void 0};let Be=de.length;for(;Be--;){const qe=de[Be],Ze=qe.name,Et=qe.namespaceURI,pt=qe.value,At=vt(Ze),gs=pt;let Nt=Ze==="value"?gs:ZC(gs);if(xe.attrName=At,xe.attrValue=Nt,xe.keepAttr=!0,xe.forceKeepAttr=void 0,as(z.uponSanitizeAttribute,N,xe),Nt=xe.attrValue,st&&(At==="id"||At==="name")&&Gf(Nt,Ye)!==0&&(Ds(Ze,N),Nt=Ye+Nt),he&&ds(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Nt)){Ds(Ze,N);continue}if(At==="attributename"&&qf(Nt,"href")){Ds(Ze,N);continue}if(xe.forceKeepAttr)continue;if(!xe.keepAttr){Ds(Ze,N);continue}if(!te&&ds(/\/>/i,Nt)){Ds(Ze,N);continue}be&&Ua([Z,re,K],ci=>{Nt=xi(Nt,ci," ")});const Na=vt(N.nodeName);if(!Rn(Na,At,Nt)){Ds(Ze,N);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Et)switch(u.getAttributeType(Na,At)){case"TrustedHTML":{Nt=T(Nt);break}case"TrustedScriptURL":{Nt=$(Nt);break}}if(Nt!==gs)try{Et?N.setAttributeNS(Et,Ze,Nt):N.setAttribute(Ze,Nt),ya(N)?ut(N):Vf(t.removed)}catch{Ds(Ze,N)}}as(z.afterSanitizeAttributes,N,null)},ns=function(N){let de=null;const xe=An(N);for(as(z.beforeSanitizeShadowDOM,N,null);de=xe.nextNode();)if(as(z.uponSanitizeShadowNode,de,null),dn(de),ri(de),qt(de.content)&&ns(de.content),(x?x(de):de.nodeType)===wa.element){const qe=y?y(de):de.shadowRoot;qt(qe)&&(In(qe),ns(qe))}as(z.afterSanitizeShadowDOM,N,null)},In=function(N){const de=[{node:N,shadow:null}];for(;de.length>0;){const xe=de.pop();if(xe.shadow){ns(xe.shadow);continue}const Be=xe.node,Ze=(x?x(Be):Be.nodeType)===wa.element,Et=I?I(Be):Be.childNodes;if(Et)for(let pt=Et.length-1;pt>=0;--pt)de.push({node:Et[pt],shadow:null});if(Ze){const pt=S?S(Be):null;if(typeof pt=="string"&&vt(pt)==="template"){const At=Be.content;qt(At)&&de.push({node:At,shadow:null})}}if(Ze){const pt=y?y(Be):Be.shadowRoot;qt(pt)&&de.push({node:null,shadow:pt},{node:pt,shadow:null})}}};return t.sanitize=function(Ae){let N=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},de=null,xe=null,Be=null,qe=null;if(Xs=!Ae,Xs&&(Ae="<!-->"),typeof Ae!="string"&&!ua(Ae)&&(Ae=tT(Ae),typeof Ae!="string"))throw $n("dirty is not a string, aborting");if(!t.isSupported)return Ae;_e||Re(N),t.removed=[];const Ze=Te&&typeof Ae!="string"&&ua(Ae);if(Ze){const At=S?S(Ae):Ae.nodeName;if(typeof At=="string"){const gs=vt(At);if(!ge[gs]||fe[gs])throw $n("root node is forbidden and cannot be sanitized in-place")}if(ya(Ae))throw $n("root node is clobbered and cannot be sanitized in-place");try{In(Ae)}catch(gs){throw ba(Ae),gs}}else if(ua(Ae))de=cn("<!---->"),xe=de.ownerDocument.importNode(Ae,!0),xe.nodeType===wa.element&&xe.nodeName==="BODY"||xe.nodeName==="HTML"?de=xe:de.appendChild(xe),In(xe);else{if(!Ke&&!be&&!we&&Ae.indexOf("<")===-1)return _&&Fe?T(Ae):Ae;if(de=cn(Ae),!de)return Ke?null:Fe?E:""}de&&ye&&ut(de.firstChild);const Et=An(Ze?Ae:de);try{for(;Be=Et.nextNode();)dn(Be),ri(Be),qt(Be.content)&&ns(Be.content)}catch(At){throw Ze&&ba(Ae),At}if(Ze)return Ua(t.removed,At=>{At.element&&En(At.element)}),be&&da(Ae),Ae;if(Ke){if(be&&da(de),je)for(qe=D.call(de.ownerDocument);de.firstChild;)qe.appendChild(de.firstChild);else qe=de;return(A.shadowroot||A.shadowrootmode)&&(qe=oe.call(a,qe,!0)),qe}let pt=we?de.outerHTML:de.innerHTML;return we&&ge["!doctype"]&&de.ownerDocument&&de.ownerDocument.doctype&&de.ownerDocument.doctype.name&&ds(pT,de.ownerDocument.doctype.name)&&(pt="<!DOCTYPE "+de.ownerDocument.doctype.name+`>
`+pt),be&&Ua([Z,re,K],At=>{pt=xi(pt,At," ")}),_&&Fe?T(pt):pt},t.setConfig=function(){let Ae=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Re(Ae),_e=!0},t.clearConfig=function(){Ms=null,_e=!1,_=R,E=""},t.isValidAttribute=function(Ae,N,de){Ms||Re({});const xe=vt(Ae),Be=vt(N);return Rn(xe,Be,de)},t.addHook=function(Ae,N){typeof N=="function"&&yi(z[Ae],N)},t.removeHook=function(Ae,N){if(N!==void 0){const de=KC(z[Ae],N);return de===-1?void 0:JC(z[Ae],de,1)[0]}return Vf(z[Ae])},t.removeHooks=function(Ae){z[Ae]=[]},t.removeAllHooks=function(){z=em()},t}var tm=Ng();function Mu(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var ni=Mu();function Mg(e){ni=e}var Ll={exec:()=>null};function _t(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Is.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var Is={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},vT=/^(?:[ \t]*(?:\n|$))+/,gT=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,bT=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,fo=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,yT=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Du=/(?:[*+-]|\d{1,9}[.)])/,Dg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Pg=_t(Dg).replace(/bull/g,Du).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),xT=_t(Dg).replace(/bull/g,Du).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Pu=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,_T=/^[^\n]+/,$u=/(?!\s*\])(?:\\.|[^\[\]\\])+/,wT=_t(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",$u).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),kT=_t(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Du).getRegex(),tc="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Fu=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,ST=_t("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Fu).replace("tag",tc).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),$g=_t(Pu).replace("hr",fo).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",tc).getRegex(),CT=_t(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",$g).getRegex(),Bu={blockquote:CT,code:gT,def:wT,fences:bT,heading:yT,hr:fo,html:ST,lheading:Pg,list:kT,newline:vT,paragraph:$g,table:Ll,text:_T},sm=_t("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",fo).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",tc).getRegex(),TT={...Bu,lheading:xT,table:sm,paragraph:_t(Pu).replace("hr",fo).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",sm).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",tc).getRegex()},ET={...Bu,html:_t(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Fu).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Ll,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:_t(Pu).replace("hr",fo).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Pg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},AT=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,RT=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Fg=/^( {2,}|\\)\n(?!\s*$)/,IT=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,sc=/[\p{P}\p{S}]/u,Uu=/[\s\p{P}\p{S}]/u,Bg=/[^\s\p{P}\p{S}]/u,OT=_t(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Uu).getRegex(),Ug=/(?!~)[\p{P}\p{S}]/u,LT=/(?!~)[\s\p{P}\p{S}]/u,NT=/(?:[^\s\p{P}\p{S}]|~)/u,MT=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,zg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,DT=_t(zg,"u").replace(/punct/g,sc).getRegex(),PT=_t(zg,"u").replace(/punct/g,Ug).getRegex(),Hg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",$T=_t(Hg,"gu").replace(/notPunctSpace/g,Bg).replace(/punctSpace/g,Uu).replace(/punct/g,sc).getRegex(),FT=_t(Hg,"gu").replace(/notPunctSpace/g,NT).replace(/punctSpace/g,LT).replace(/punct/g,Ug).getRegex(),BT=_t("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Bg).replace(/punctSpace/g,Uu).replace(/punct/g,sc).getRegex(),UT=_t(/\\(punct)/,"gu").replace(/punct/g,sc).getRegex(),zT=_t(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),HT=_t(Fu).replace("(?:-->|$)","-->").getRegex(),jT=_t("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",HT).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Sr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,VT=_t(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Sr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),jg=_t(/^!?\[(label)\]\[(ref)\]/).replace("label",Sr).replace("ref",$u).getRegex(),Vg=_t(/^!?\[(ref)\](?:\[\])?/).replace("ref",$u).getRegex(),qT=_t("reflink|nolink(?!\\()","g").replace("reflink",jg).replace("nolink",Vg).getRegex(),zu={_backpedal:Ll,anyPunctuation:UT,autolink:zT,blockSkip:MT,br:Fg,code:RT,del:Ll,emStrongLDelim:DT,emStrongRDelimAst:$T,emStrongRDelimUnd:BT,escape:AT,link:VT,nolink:Vg,punctuation:OT,reflink:jg,reflinkSearch:qT,tag:jT,text:IT,url:Ll},GT={...zu,link:_t(/^!?\[(label)\]\((.*?)\)/).replace("label",Sr).getRegex(),reflink:_t(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Sr).getRegex()},Rd={...zu,emStrongRDelimAst:FT,emStrongLDelim:PT,url:_t(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},WT={...Rd,br:_t(Fg).replace("{2,}","*").getRegex(),text:_t(Rd.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},zo={normal:Bu,gfm:TT,pedantic:ET},gl={normal:zu,gfm:Rd,breaks:WT,pedantic:GT},KT={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},am=e=>KT[e];function Ca(e,t){if(t){if(Is.escapeTest.test(e))return e.replace(Is.escapeReplace,am)}else if(Is.escapeTestNoEncode.test(e))return e.replace(Is.escapeReplaceNoEncode,am);return e}function nm(e){try{e=encodeURI(e).replace(Is.percentDecode,"%")}catch{return null}return e}function im(e,t){var i;const s=e.replace(Is.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(Is.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(Is.slashPipe,"|");return a}function bl(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function JT(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function lm(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function ZT(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var Cr=class{constructor(e){Tt(this,"options");Tt(this,"rules");Tt(this,"lexer");this.options=e||ni}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:bl(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=ZT(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=bl(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:bl(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=bl(t[0],`
`).split(`
`),a="",n="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");a=a?`${a}
${c}`:c,n=n?`${n}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const m=p,h=m.raw+`
`+s.join(`
`),b=this.blockquote(h);i[i.length-1]=b,a=a.substring(0,a.length-m.raw.length)+b.raw,n=n.substring(0,n.length-m.text.length)+b.text;break}else if((p==null?void 0:p.type)==="list"){const m=p,h=m.raw+`
`+s.join(`
`),b=this.list(h);i[i.length-1]=b,a=a.substring(0,a.length-p.raw.length)+b.raw,n=n.substring(0,n.length-m.raw.length)+b.raw,s=h.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:a,tokens:i,text:n}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const a=s.length>1,n={type:"list",raw:"",ordered:a,start:a?+s.slice(0,-1):"",loose:!1,items:[]};s=a?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=a?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,k=>" ".repeat(3*k.length)),p=e.split(`
`,1)[0],m=!u.trim(),h=0;if(this.options.pedantic?(h=2,d=u.trimStart()):m?h=t[1].length+1:(h=t[2].search(this.rules.other.nonSpaceChar),h=h>4?1:h,d=u.slice(h),h+=t[1].length),m&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const k=this.rules.other.nextBulletRegex(h),y=this.rules.other.hrRegex(h),g=this.rules.other.fencesBeginRegex(h),x=this.rules.other.headingBeginRegex(h),S=this.rules.other.htmlBeginRegex(h);for(;e;){const _=e.split(`
`,1)[0];let E;if(p=_,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),E=p):E=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||x.test(p)||S.test(p)||k.test(p)||y.test(p))break;if(E.search(this.rules.other.nonSpaceChar)>=h||!p.trim())d+=`
`+E.slice(h);else{if(m||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||x.test(u)||y.test(u))break;d+=`
`+p}!m&&!p.trim()&&(m=!0),c+=_+`
`,e=e.substring(_.length+1),u=E.slice(h)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let b=null,I;this.options.gfm&&(b=this.rules.other.listIsTask.exec(d),b&&(I=b[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!b,checked:I,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=im(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(im(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=bl(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=JT(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),lm(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return lm(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const h=p.slice(1,-1);return{type:"em",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}const m=p.slice(2,-2);return{type:"strong",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Ka=class Id{constructor(t){Tt(this,"tokens");Tt(this,"options");Tt(this,"state");Tt(this,"tokenizer");Tt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||ni,this.options.tokenizer=this.options.tokenizer||new Cr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Is,block:zo.normal,inline:gl.normal};this.options.pedantic?(s.block=zo.pedantic,s.inline=gl.pedantic):this.options.gfm&&(s.block=zo.gfm,this.options.breaks?s.inline=gl.breaks:s.inline=gl.gfm),this.tokenizer.rules=s}static get rules(){return{block:zo,inline:gl}}static lex(t,s){return new Id(s).lex(t)}static lexInline(t,s){return new Id(s).inlineTokens(t)}lex(t){t=t.replace(Is.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(Is.tabCharGlobal,"    ").replace(Is.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const m=t.slice(1);let h;this.options.extensions.startInline.forEach(b=>{h=b.call({lexer:this},m),typeof h=="number"&&h>=0&&(p=Math.min(p,h))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Tr=class{constructor(e){Tt(this,"options");Tt(this,"parser");this.options=e||ni}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(Is.notSpaceStart))==null?void 0:i[0],n=e.replace(Is.endingNewline,"")+`
`;return a?'<pre><code class="language-'+Ca(a)+'">'+(s?n:Ca(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:Ca(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+Ca(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Ca(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=nm(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+Ca(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=nm(e);if(n===null)return Ca(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Ca(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Ca(e.text)}},Hu=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ja=class Od{constructor(t){Tt(this,"options");Tt(this,"renderer");Tt(this,"textRenderer");this.options=t||ni,this.options.renderer=this.options.renderer||new Tr,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Hu}static parse(t,s){return new Od(s).parse(t)}static parseInline(t,s){return new Od(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},qc,Jo=(qc=class{constructor(e){Tt(this,"options");Tt(this,"block");this.options=e||ni}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Ka.lex:Ka.lexInline}provideParser(){return this.block?Ja.parse:Ja.parseInline}},Tt(qc,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),qc),YT=class{constructor(...e){Tt(this,"defaults",Mu());Tt(this,"options",this.setOptions);Tt(this,"parse",this.parseMarkdown(!0));Tt(this,"parseInline",this.parseMarkdown(!1));Tt(this,"Parser",Ja);Tt(this,"Renderer",Tr);Tt(this,"TextRenderer",Hu);Tt(this,"Lexer",Ka);Tt(this,"Tokenizer",Cr);Tt(this,"Hooks",Jo);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Tr(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new Cr(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new Jo;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];Jo.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Ka.lex(e,t??this.defaults)}parser(e,t){return Ja.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Ka.lex:Ka.lexInline,r=i.hooks?i.hooks.provideParser():e?Ja.parse:Ja.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+Ca(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},Qn=new YT;function bt(e,t){return Qn.parse(e,t)}bt.options=bt.setOptions=function(e){return Qn.setOptions(e),bt.defaults=Qn.defaults,Mg(bt.defaults),bt};bt.getDefaults=Mu;bt.defaults=ni;bt.use=function(...e){return Qn.use(...e),bt.defaults=Qn.defaults,Mg(bt.defaults),bt};bt.walkTokens=function(e,t){return Qn.walkTokens(e,t)};bt.parseInline=Qn.parseInline;bt.Parser=Ja;bt.parser=Ja.parse;bt.Renderer=Tr;bt.TextRenderer=Hu;bt.Lexer=Ka;bt.lexer=Ka.lex;bt.Tokenizer=Cr;bt.Hooks=Jo;bt.parse=bt;bt.options;bt.setOptions;bt.use;bt.walkTokens;bt.parseInline;Ja.parse;Ka.lex;const QT={breaks:!0,gfm:!0};function om(e){if(!e)return"";try{if(typeof bt<"u"&&bt.parse){const t=bt.parse(e,QT);return typeof tm<"u"?tm.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function XT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const eE={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function tE(e){return eE[e]||"wrench"}const sE=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function rm(e){if(!e)return[];const t=e.match(sE);return t?[...new Set(t)]:[]}const aE={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=H(()=>t.value.trim().length>0&&!s.value),p=f(ct.state||"disconnected");let m=null;const h=H(()=>{const M=p.value;return M==="connected"?"Connected":M==="reconnecting"?"Reconnecting…":M==="connecting"?"Connecting…":"REST fallback"}),b=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],I=H(()=>{const M=Math.floor(l.value/4)%b.length,L=l.value;return L>3?`${b[M]} (${L}s)`:b[0]});function k(){jt(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!i.value)return;const M=i.value;M.style.height="auto",M.style.height=Math.min(M.scrollHeight,120)+"px"}function g(M,L,D={}){const le={id:++c,role:M,content:L,timestamp:Date.now(),html:M==="bot"?om(L):"",tools_used:D.tools_used||[],is_error:D.is_error||!1,images:M==="bot"?rm(L):[],files:D.files||[],_showTools:!1};return e.value.push(le),k(),M==="bot"&&jt(()=>x()),le}function x(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(L=>{L.setAttribute("data-copy","true"),L.style.position="relative";const D=document.createElement("button");D.className="chat-code-copy",D.textContent="Copy",D.addEventListener("click",()=>{const le=L.querySelector("code"),oe=le?le.textContent:L.textContent;navigator.clipboard.writeText(oe).then(()=>{D.textContent="Copied!",setTimeout(()=>{D.textContent="Copy"},1500)}).catch(()=>{})}),L.appendChild(D)})}function S(M){if(M===0)return!0;const L=e.value[M-1],D=e.value[M],le=new Date(L.timestamp).toDateString(),oe=new Date(D.timestamp).toDateString();return le!==oe}function _(M){const L=new Date(M),D=new Date;if(L.toDateString()===D.toDateString())return"Today";const le=new Date(D);return le.setDate(le.getDate()-1),L.toDateString()===le.toDateString()?"Yesterday":L.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function E(M){t.value=M,jt(()=>Q())}function R(M){window.open(M,"_blank","noopener")}function w(M){M.target.style.display="none"}function O(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function U(){r&&(clearInterval(r),r=null),l.value=0}function T(M){s.value&&(s.value=!1,U(),M.type==="chat_response"?g("bot",M.content,{tools_used:M.tools_used||[],is_error:M.is_error||!1,files:M.files||[]}):M.type==="chat_error"&&g("bot",M.error||"Unknown error",{is_error:!0}),jt(()=>{var L;return(L=i.value)==null?void 0:L.focus()}))}async function $(M){try{const L=await j.post("/api/chat",{content:M,channel_id:o.value});g("bot",L.response,{tools_used:L.tools_used||[],is_error:L.is_error||!1,files:L.files||[]})}catch(L){g("bot",L.message||"Failed to send message",{is_error:!0})}}async function Q(){const M=t.value.trim();if(!M||s.value)return;g("user",M),t.value="",s.value=!0,O(),i.value&&(i.value.style.height="auto"),ct.connected&&ct.sendChat(M,{channelId:o.value})||(await $(M),s.value=!1,U()),jt(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}async function W(){a.value="";try{if(!o.value){const L=await j.get("/api/auth/session");o.value=L.channel_id||L.user_id||"web-user"}const M=await j.get("/api/sessions/"+encodeURIComponent(o.value));if(M&&M.messages&&M.messages.length>0){for(const L of M.messages){const D=L.role==="user"?"user":"bot";let le=L.content||"";if(D==="user"){const z=le.match(/^\[.*?\]:\s*/);z&&(le=le.slice(z[0].length))}if(!le.trim())continue;const oe={id:++c,role:D,content:le,timestamp:L.timestamp?L.timestamp*1e3:Date.now(),html:D==="bot"?om(le):"",tools_used:[],is_error:!1,images:D==="bot"?rm(le):[],files:[],_showTools:!1};e.value.push(oe)}jt(()=>{k(),x()})}}catch(M){M&&M.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Ce.error(a.value))}}return tt(()=>{ct.subscribe("chat",T),p.value=ct.state||"disconnected",m=ct.onState(M=>{p.value=M}),W(),jt(()=>{var M;return(M=i.value)==null?void 0:M.focus()})}),wt(()=>{ct.unsubscribe("chat",T),m&&(m(),m=null),U()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:h,typingText:I,suggestions:d,send:Q,autoResize:y,formatTime:XT,formatDate:_,showDateSeparator:S,useSuggestion:E,openImage:R,onImageError:w,getToolIcon:tE,loadHistory:W}}},nE={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),m=f(!1),h=H(()=>e.value==="custom"),b=H(()=>[...i.value,...l.value]),I=H(()=>l.value.includes(e.value)),k=H(()=>{var R;return h.value?t.value||"Odin":((R=n.value[e.value])==null?void 0:R.name)||e.value}),y=H(()=>{var R;return h.value?s.value||"(empty — will use Odin default)":((R=n.value[e.value])==null?void 0:R.identity)||""}),g=H(()=>{var R;return h.value?a.value||"(empty — will use Odin default)":((R=n.value[e.value])==null?void 0:R.voice)||""});async function x(){d.value=!0;try{const R=await j.get("/api/personality");e.value=R.preset||"odin",t.value=R.custom_name||"",s.value=R.custom_identity||"",a.value=R.custom_voice||"",n.value=R.presets||{},i.value=R.builtin_presets||[],l.value=R.user_presets||[]}catch(R){c.value=R.message}finally{d.value=!1}}async function S(){o.value=!0,c.value=null,r.value=!1;try{await j.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(R){c.value=R.message}finally{o.value=!1}}async function _(){const R=u.value.trim();if(R){m.value=!0,c.value=null;try{await j.post("/api/personality/presets",{name:R,display_name:k.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await x(),e.value=R.toLowerCase().replace(/ /g,"_")}catch(w){c.value=w.message}finally{m.value=!1}}}async function E(){if(await os({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await j.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(w){c.value=w.message}}}return tt(x),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:b,isCustom:h,isUserPreset:I,previewName:k,previewIdentity:y,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:S,showSavePreset:p,newPresetName:u,savingPreset:m,saveAsPreset:_,deletePreset:E,builtinPresets:i,userPresets:l}},template:`
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
  `},iE={props:["onComplete"],template:`
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
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,m=null;function h(){return p+=1,m==null||m.abort(),m=null,p}function b(S,_,E){return typeof j.postWithOptions=="function"?j.postWithOptions(S,_,{signal:E}):j.post(S,_)}async function I(){var E,R,w;a.value=!0,i.value="",l.value="Saving setup…";const S={},_=!!s.value.trim();t.value.trim()&&(S.web_api_token=t.value.trim()),s.value.trim()&&(S.discord_token=s.value.trim());try{const O=j.post("/api/setup/complete",S);t.value="",s.value="";const U=await O,T=((E=U.discord)==null?void 0:E.state)||U.discord_status;if(T==="failed"?(i.value=((R=U.discord)==null?void 0:R.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):T==="connecting"?l.value="Saved. Connecting Discord…":T==="ready"?l.value="Saved. Discord ready.":_?l.value="Saved. Discord token stored; attachment status is pending.":l.value=U.message||"Setup saved. Ready to sign in.",(w=U.restart_required)!=null&&w.length){const $=U.message||`Restart Odin to apply: ${U.restart_required.join(", ")}`;l.value.includes($)||(l.value+=` ${$}`)}n.value=!0}catch(O){i.value=O.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function k(){const S=h(),_=typeof AbortController=="function"?new AbortController:null;m=_,o.value=!0,u.value="";try{const E=await b("/api/codex/device-code",void 0,_==null?void 0:_.signal);if(S!==p)return;c.value=E,r.value="pending";const R=await b("/api/codex/device-poll",{device_auth_id:E.device_auth_id,user_code:E.user_code,interval:E.interval},_==null?void 0:_.signal);if(S!==p)return;d.value=R||{},r.value="ready"}catch(E){S===p&&(E==null?void 0:E.name)!=="AbortError"&&(u.value=E.message||"Device sign-in failed.",r.value="failed")}finally{S===p&&(o.value=!1,m=null)}}function y(){h(),o.value=!1,x()}function g(){var S;(S=e.onComplete)==null||S.call(e)}function x(){r.value="",c.value=null,d.value={},u.value=""}return wt(()=>{h()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:I,onComplete:g,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:k,cancelDeviceLogin:y,clearDeviceState:x}}},Dt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),qg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:BC,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:aE,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:l1,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:h1,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:P1,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:nE,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:LC,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:Dt("/operations","live")},{path:"/agents",redirect:Dt("/operations","agents")},{path:"/loops",redirect:Dt("/operations","loops")},{path:"/processes",redirect:Dt("/operations","processes")},{path:"/schedules",redirect:Dt("/operations","schedules")},{path:"/audit",redirect:Dt("/history","audit")},{path:"/sessions",redirect:Dt("/history","sessions")},{path:"/traces",redirect:Dt("/history","traces")},{path:"/usage",redirect:Dt("/history","usage")},{path:"/tools",redirect:Dt("/capabilities","tools")},{path:"/skills",redirect:Dt("/capabilities","skills")},{path:"/mcp",redirect:Dt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:Dt("/capabilities","knowledge")},{path:"/memory",redirect:Dt("/capabilities","memory")},{path:"/learned",redirect:Dt("/capabilities","learned")},{path:"/health",redirect:Dt("/system","health")},{path:"/resources",redirect:Dt("/system","resources")},{path:"/logs",redirect:Dt("/system","logs")},{path:"/config",redirect:Dt("/system","config")},{path:"/host-access",redirect:Dt("/system","host-access")},{path:"/hosts",redirect:Dt("/system","hosts")},{path:"/internals",redirect:Dt("/system","internals")}],Nl=NS({history:uS(),routes:qg});Nl.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const lE={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{j.setPersist(n.value),await j.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},oE={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let m=null;const h=f("starting"),b=f(""),I=qg.filter(z=>z.meta),k=H(()=>["Workspace","Operate","Observe","Manage"].map(z=>({name:z,routes:I.filter(Z=>Z.meta.section===z)})).filter(z=>z.routes.length)),y=H(()=>{var z;return((z=Nl.currentRoute.value.meta)==null?void 0:z.label)||"Odin"}),g=H(()=>{var z;return((z=Nl.currentRoute.value.meta)==null?void 0:z.section)||"Management"}),x=H(()=>{var z;return((z=Nl.currentRoute.value.meta)==null?void 0:z.description)||"Management console"});function S(){ct.disconnect(),M&&(clearInterval(M),M=null)}j.onSessionExpired=()=>{t.value=!0,S(),j.setToken(""),e.value="login"};function _(z){var Z;if((z.ctrlKey||z.metaKey)&&z.key.toLowerCase()==="k"){e.value==="ready"&&(z.preventDefault(),Uf());return}if(a.value&&z.key==="Tab"){const re=[...((Z=n.value)==null?void 0:Z.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(re.length){const K=re[0],ve=re[re.length-1];if(z.shiftKey&&(document.activeElement===K||!n.value.contains(document.activeElement))){z.preventDefault(),ve.focus();return}if(!z.shiftKey&&(document.activeElement===ve||!n.value.contains(document.activeElement))){z.preventDefault(),K.focus();return}}}if(z.key==="Escape"&&a.value){a.value=!1,z.preventDefault();return}if(z.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(z.target.tagName)){z.preventDefault();const re=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');re&&re.focus()}}function E(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function R(){try{const z=await j.get("/api/setup/status");if(z.mode==="pending"||z.needed===!0)return S(),e.value="setup",!0}catch(z){z==null||z.name}return!1}tt(async()=>{if(document.addEventListener("keydown",_),o=window.matchMedia("(max-width: 900px)"),E(),o.addEventListener("change",E),await R())return;const z=await j.check();z.ok?(e.value="ready",le()):z.needsAuth?e.value="login":(e.value="ready",le())});function w(){t.value=!1,e.value="ready",le()}async function O(){if(await R())return;const z=await j.check();z.ok?(e.value="ready",le()):z.needsAuth?e.value="login":(e.value="ready",le())}async function U(){S(),e.value="login",await j.logout()}function T(){s.value=!s.value}function $(){a.value=!a.value}Jt(a,async z=>{var Z,re;if(z)r=document.activeElement,await jt(),(re=(Z=n.value)==null?void 0:Z.querySelector(".nav-item"))==null||re.focus();else if(r!=null&&r.isConnected){const K=r;r=null,requestAnimationFrame(()=>K.focus())}});const Q=H(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function W(z,Z="info",re=3e3){p.value={text:z,level:Z},clearTimeout(m),m=setTimeout(()=>{p.value=null},re)}let M=null,L=!1,D=[];function le(){for(const z of D)z();D=[ct.onStatus(z=>{c.value=z}),ct.onLatencyChange(z=>{u.value=z}),ct.onState((z,Z)=>{d.value=z,z==="connected"?(L&&W("Connection restored","success"),L=!0):z==="reconnecting"&&Z.attempt===1&&W("Connection lost — reconnecting…","warn")})],ct.connect(),oe(),M&&clearInterval(M),M=setInterval(oe,15e3)}async function oe(){try{const z=await j.get("/api/status");h.value=z.status==="online"?"online":"starting";const Z=z.uptime_seconds||0,re=Math.floor(Z/3600),K=Math.floor(Z%3600/60);b.value=`${re}h ${K}m uptime`}catch{h.value="offline",b.value=""}}return wt(()=>{M&&clearInterval(M);for(const z of D)z();D=[],ct.disconnect(),document.removeEventListener("keydown",_),o==null||o.removeEventListener("change",E)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:Q,wsToast:p,botStatus:h,botUptime:b,navRoutes:I,navGroups:k,currentPage:y,currentSection:g,currentDescription:x,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:w,onSetupComplete:O,logout:U,toggleSidebar:T,toggleMobileNavigation:$,openPalette:Uf}}},on=fr(oE);on.component("odin-icon",PC);on.component("login-screen",lE);on.component("setup-page",iE);on.component("toast-container",Ck);on.component("confirm-host",Tk);on.component("command-palette",DC);on.directive("modal-focus",FC);on.use(Nl);on.mount("#app");
